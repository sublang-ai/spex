// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Environments in the service (environments-8..17, DR-104): one per
// spex repository on this device — your own group's and every
// project's — read from its files: requests, lock, staleness and what
// is installed, beside the last operation's report. Operations start at
// once and run side by side, each write versioned on the file it writes
// and each install checked against the lock and requests at its swap,
// so one overtaken meanwhile publishes nothing (DR-111); they report
// through `environment.state`. Every install is exported into
// the paired working folder's agent folders and, for your own group,
// into your agents' home folders; a session's playbooks are found in
// the project's environment before your own group's. The built-in spec
// package is seeded at start and requested where an environment lacks
// it, so the built-in playbooks work offline from the first start.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

import { fileVersion, readVersioned, sha256, VersionConflictError, type FileVersion } from "./files.js";
import {
  AGENT_FOLDERS,
  BUILTIN_PACKAGE_NAME,
  builtinRegistrySource,
  compositeRegistry,
  ContentStore,
  exportEnvironment,
  FormatError,
  gitSource,
  install,
  installedPackages,
  isGitSource,
  isInsidePath,
  isPathRequest,
  isPathSource,
  isRegistryRequest,
  isRegistrySource,
  lockStaleness,
  lockStoreKeys,
  moduleLocations,
  parseLock,
  parseManifestText,
  parseRequests,
  placeOf,
  prepareBuiltinEnvironment,
  publishRelease,
  readRelease,
  RegistryClient,
  RegistryError,
  removeExports,
  requestIssues,
  requestsDigest,
  RequestsError,
  resolutionVersion,
  resolve,
  seedBuiltinPackage,
  setRequest,
  writeLock,
  type BuiltinPackage,
  type Conflict,
  type CredentialArgs,
  type GitCredential,
  type GitSource,
  type Lock,
  type Manifest,
  type ModuleLocation,
  type RegistrySource,
  type Request,
  type Requests,
} from "./environment/index.js";
import { i18n } from "./i18n.js";
import type { PlaybookModules } from "./config.js";
import type { EnvironmentPackage, EnvironmentRequest, EnvironmentState, PublishPreview } from "./protocol.js";
import { CoreError } from "./session.js";
import type { Store } from "./store.js";

export interface EnvironmentManagerOptions {
  store: Store;
  /** Your agents' home folders' root for your own group's exports, or
   * null where none are written (environments-8). */
  userHome: string | null;
  /** This user's home, where each agent's own folder tells whether the
   * device has that agent. */
  deviceHome: string;
  /** Where installed playbook artifacts' engine links point. */
  modulePaths?: string[];
  /** The built-in spec package this app ships; null where none is staged. */
  builtin: BuiltinPackage | null;
  /** The registry's fetch, for tests. */
  fetch?: typeof fetch;
  /** The device's current access secret at the home's host, kept
   * current by the host client (git-host-4); null while signed out. */
  token: () => Promise<string | null>;
  /** The brokered credential for a Git source at the host's Git origin,
   * undefined for any other (environments-13). */
  gitCredential: (repo: string) => Promise<GitCredential | undefined>;
  /** How that credential reaches Git: the app's own credential helper
   * (git-host-9). */
  credentialArgs: CredentialArgs;
  broadcast: (repository: string, state: EnvironmentState) => void;
  /** An environment's installed files or exports changed. */
  changed?: (repository: string) => void;
}

type Busy = NonNullable<EnvironmentState["busy"]>;

/** One operation running on a clone: its step, for progress alone. */
interface Operation {
  busy: Busy | null;
}

/** What the files cannot say: the operations running now, and the last
 * one's report. */
interface CloneState {
  /** The address progress and outcomes are announced at: a move updates
   * it, so an operation that began at the old one announces at the new.
   * Only announcements follow it; an operation's writes keep the paths
   * and versions it read, and fail where the clone moved. */
  key: string;
  running: Set<Operation>;
  /** The last resolution that found no solution, with the version of
   * `spex.yaml` it read: shown while the file still stands at it. */
  conflicts: { requests: FileVersion; conflicts: Conflict[] } | null;
  error: string | null;
  published?: { name: string; version: string; url: string };
}

/** What a strict settle wrote before it stopped, for the caller's report. */
export interface SettleProgress {
  lockWritten: boolean;
  installed: boolean;
}

/** What one settle does: resolve where needed, or always, then install
 * and export. */
type SettleMode = "auto" | "resolve" | "install";

const listed = (items: readonly string[]): string =>
  items.join(i18n._({ id: "; ", comment: "Separates reasons listed in one message" }));

/** The reader's words for why an operation stopped (environments-12):
 * the library's own words carried as the cause. */
function failurePhrase(stage: "resolve" | "install" | "publish", error: unknown): string {
  const cause = error instanceof FormatError
    ? listed(error.issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message)))
    : error instanceof RegistryError && error.details?.length
      ? `${error.message}: ${listed(error.details.map((detail) => typeof detail === "object" && detail !== null && "message" in detail ? String((detail as { message: unknown }).message) : JSON.stringify(detail)))}`
      : error instanceof Error ? error.message : String(error);
  switch (stage) {
    case "resolve":
      return i18n._({ id: "Resolving stopped: {cause}", comment: "An environment's resolution failed; {cause} is the library's or the registry's own words", values: { cause } });
    case "install":
      return i18n._({ id: "Installing stopped; the last files stay: {cause}", comment: "An environment's install failed and kept its previous files; {cause} is the library's or the registry's own words", values: { cause } });
    case "publish":
      return i18n._({ id: "Publishing stopped: {cause}", comment: "A publish to the registry failed; {cause} is the core's checks' or the registry's own words", values: { cause } });
  }
}

/** The one stale phrase of playbook-library-92, and one per path
 * source whose manifest moved. */
function stalePhrases(lock: Lock, requestsText: string | null, workingFolder: string | null): string[] | null {
  const phrases: string[] = [];
  if (requestsText === null || requestsDigest(requestsText) !== lock.requests) {
    phrases.push(i18n._({ id: "Requests changed; resolve again to install", comment: "The lock no longer matches spex.yaml; the last installed files stay in use" }));
  }
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    if (!isPathSource(resolution.source)) continue;
    const single: Lock = { format: 1, requests: requestsText === null ? "" : requestsDigest(requestsText), packages: { [name]: resolution } };
    const verdict = lockStaleness(single, requestsText, (path) => {
      if (workingFolder === null) return null;
      const file = join(workingFolder, ...path.split("/"), "meta.yaml");
      if (!existsSync(file)) return null;
      const parsed = parseManifestText(readFileSync(file, "utf8"));
      if (!parsed.manifest) throw new Error(parsed.issues.map((issue) => issue.message).join("; "));
      return parsed.manifest;
    });
    if (verdict.stale) {
      phrases.push(i18n._({
        id: "{name} changed in {path}; resolve again to install",
        comment: "A spec package requested by path changed its manifest since the lock was written",
        values: { name, path: resolution.source.path },
      }));
    }
  }
  return phrases.length > 0 ? phrases : null;
}

function requestOf(request: Request): EnvironmentRequest {
  const extras = {
    ...(request.select ? { select: request.select.map((entry) => ({ ...entry })) } : {}),
    ...(request.alias ? { alias: { ...request.alias } } : {}),
  };
  if (isRegistryRequest(request)) return { kind: "registry", version: request.version, ...extras };
  if (isPathRequest(request)) return { kind: "path", path: request.path, ...extras };
  return { kind: "git", git: request.git, rev: request.rev, ...(request.path !== undefined ? { path: request.path } : {}), ...extras };
}

/** A protocol request as `spex.yaml` holds it (environments-2). */
export function toRequest(request: EnvironmentRequest): Request {
  const extras = {
    ...(request.select ? { select: request.select.map((entry) => ({ ...entry })) } : {}),
    ...(request.alias ? { alias: { ...request.alias } } : {}),
  };
  if (request.kind === "registry") return { version: request.version, ...extras };
  if (request.kind === "path") return { path: request.path, ...extras };
  return { git: request.git, rev: request.rev, ...(request.path !== undefined ? { path: request.path } : {}), ...extras };
}

function readLockSync(file: string): Lock | null {
  if (!existsSync(file)) return null;
  return parseLock(readFileSync(file, "utf8"));
}

/** `spex.yaml` with its text and version; null where absent. */
function readRequestsAt(file: string): { requests: Requests; text: string; version: FileVersion } | null {
  const { bytes, version } = readVersioned(file);
  if (bytes === null) return null;
  const text = bytes.toString("utf8");
  return { requests: parseRequests(text), text, version };
}

/** `spex.lock` with its version; null where absent. */
function readLockAt(file: string): { lock: Lock; version: FileVersion } | null {
  const { bytes, version } = readVersioned(file);
  return bytes === null ? null : { lock: parseLock(bytes.toString("utf8")), version };
}

/** The refusal of work asked of a stopped manager. */
const stoppingError = (): CoreError => new CoreError("aborted", i18n._({ id: "The core is stopping.", comment: "Refusal: environment work asked once the core stops" }));

/** A conflict the reader retries, as a command's reply (DR-111). */
const conflictError = (error: VersionConflictError): CoreError => new CoreError("conflict", error.message);

export class EnvironmentManager {
  readonly contentStore: ContentStore;
  readonly cacheDir: string;
  readonly git: GitSource;
  private readonly clones = new Map<string, CloneState>();
  /** Every operation running, for stop to wait on. */
  private readonly operations = new Set<Promise<void>>();
  private stopped = false;

  constructor(private readonly options: EnvironmentManagerOptions) {
    this.contentStore = new ContentStore(options.store.dir);
    this.cacheDir = join(options.store.dir, "cache");
    // A source at the host's Git origin is fetched with the brokered
    // credential through the app's helper; any other with this device's
    // own Git (environments-13).
    this.git = gitSource(this.cacheDir, { credentialArgs: options.credentialArgs });
  }

  private get store(): Store {
    return this.options.store;
  }

  /** The agents this device has, which exports reach (environments-8):
   * each agent the folder table names whose own folder stands in the
   * user's home — `~/.claude` for claude — until Cligent reports which
   * this device has (environments-16). An agent never used here gets no
   * folder made for it. */
  agents(): string[] {
    return Object.entries(AGENT_FOLDERS)
      .filter(([, folders]) => existsSync(join(this.options.deviceHome, folders.user.replace(/^~\//, "").split("/")[0]!)))
      .map(([agent]) => agent);
  }

  /** The registry: the built-in spec package from this device first,
   * offline, and everything else from the home's host (environments-12). */
  registry(): RegistrySource {
    const host = this.store.home.host;
    // One source per host: the built-in source reads and packs the
    // shipped release once, not on every resolve.
    if (this.registryCache?.url === host.url) return this.registryCache.source;
    const remote = new RegistryClient({
      url: host.url,
      token: () => this.token(),
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
    const source = compositeRegistry(
      builtinRegistrySource({ store: this.contentStore, cacheDir: this.cacheDir, url: remote.url, shipped: this.options.builtin }),
      remote,
    );
    this.registryCache = { url: host.url, source };
    return source;
  }

  private registryCache?: { url: string; source: RegistrySource };

  /** Whether the home is signed in to its host. */
  signedIn(): boolean {
    const host = this.store.home.host;
    return host.account !== undefined && host.signedOut !== true;
  }

  /** The device's access secret where the home is signed in
   * (environments-12): current, as the host client keeps it
   * (git-host-4); null while signed out. */
  async token(): Promise<string | null> {
    if (!this.signedIn()) return null;
    return this.options.token();
  }

  private cloneState(key: string): CloneState {
    let state = this.clones.get(key);
    if (!state) {
      state = { key, running: new Set(), conflicts: null, error: null };
      this.clones.set(key, state);
    }
    return state;
  }

  private cloneDir(key: string): string {
    const repository = this.store.repository(key);
    if (!repository) throw this.unavailable(key);
    return repository.dir;
  }

  private unavailable(key: string): CoreError {
    return new CoreError("not_found", i18n._({
      id: "no spex repository {key} on this device",
      comment: "Refusal: the key names no clone under workspace/",
      values: { key },
    }));
  }

  /** The working folder paired with a spex repository on this device. */
  workingFolder(key: string): string | null {
    return this.store.home.folderOf(key)?.path ?? null;
  }

  private isOwn(key: string): boolean {
    return key === this.store.home.own();
  }

  // -- the built-in spec package (environments-11) ---------------------------

  /** Request the built-in spec package where a clone lacks it, with the
   * lock where that is all it requests (environments-11). */
  prepare(dir: string): boolean {
    if (!this.options.builtin) return false;
    return prepareBuiltinEnvironment(dir, this.options.builtin, this.store.home.host.url);
  }

  /** At start: seed the built-in spec package, request it in your own
   * group's environment and in any project's that holds no `spex.yaml`,
   * then resolve where no lock stands, install and export every
   * environment, and collect the store. */
  async startup(): Promise<void> {
    if (this.options.builtin) {
      try { await seedBuiltinPackage(this.contentStore, this.cacheDir, this.options.builtin); }
      catch (error) { console.error(`spex: the built-in spec package was not seeded: ${error instanceof Error ? error.message : String(error)}`); }
    }
    for (const repository of this.store.listRepositories()) {
      const requested = existsSync(join(repository.dir, "spex.yaml"));
      let wrote = false;
      if (this.isOwn(repository.key) || !requested) {
        try { wrote = this.prepare(repository.dir); }
        catch (error) { console.error(`spex: ${repository.key} does not request the built-in spec package: ${String(error)}`); }
      }
      const lock = existsSync(join(repository.dir, "spex.lock"));
      await this.settle(repository.key, wrote && !lock ? "resolve" : "auto", false);
    }
    this.collect();
  }

  /** Remove store entries no lock on this device selects (environments-7). */
  collect(): void {
    const locks: Lock[] = [];
    for (const repository of this.store.listRepositories()) {
      try {
        const lock = readLockSync(join(repository.dir, "spex.lock"));
        if (lock) locks.push(lock);
      } catch { /* an unreadable lock keeps nothing it might select: skip collecting */ return; }
    }
    // The seeded built-in releases serve installs offline: kept whole.
    const keep = lockStoreKeys(locks);
    for (const key of this.builtinKeys()) keep.add(key);
    this.contentStore.gc(keep);
  }

  private builtinKeys(): string[] {
    const dir = join(this.cacheDir, "builtins");
    if (!existsSync(dir) || !this.options.builtin) return [];
    try {
      const record = JSON.parse(readFileSync(join(dir, `${this.options.builtin.version}.json`), "utf8")) as { files?: { sha256: string; executable: boolean }[] };
      return (record.files ?? []).map((file) => (file.executable ? `x/${file.sha256}` : file.sha256));
    } catch {
      return [];
    }
  }

  // -- operations -------------------------------------------------------------

  /** Run one operation on a clone now, beside any already running: the
   * set tracks it for progress and for stop, never for admission. */
  private run<T>(key: string, work: (step: (busy: Busy) => void) => Promise<T>): Promise<T> {
    const state = this.cloneState(key);
    const operation: Operation = { busy: null };
    state.running.add(operation);
    const step = (busy: Busy): void => { operation.busy = busy; this.announce(state.key); };
    let done: Promise<T>;
    try { done = work(step); } catch (error) { done = Promise.reject(error); }
    const settled = done.then(() => undefined, () => undefined).then(() => {
      state.running.delete(operation);
      this.operations.delete(settled);
      this.announce(state.key);
    });
    this.operations.add(settled);
    return done;
  }

  /** The step of the latest operation still running on a clone. */
  private busyOf(key: string): Busy | null {
    const running = [...(this.clones.get(key)?.running ?? [])].reverse();
    return running.find((operation) => operation.busy !== null)?.busy ?? null;
  }

  /** Broadcast a clone's state (environments-17). */
  announce(key: string): void {
    if (this.stopped || !this.store.repository(key)) return;
    try {
      this.options.broadcast(key, this.state(key));
    } catch (error) {
      console.error(`spex: the environment of ${key} could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Resolve where the mode or the clone needs it, write the lock,
   * install and export (environments-5, environments-7, environments-8).
   * Errors land in the clone's state; with `strict` they are thrown too,
   * and `progress` records what was written before.
   */
  settle(key: string, mode: SettleMode, strict: boolean, progress?: SettleProgress): Promise<void> {
    // No work starts once the manager stops; a strict caller is told.
    if (this.stopped) return strict ? Promise.reject(stoppingError()) : Promise.resolve();
    return this.run(key, (step) => this.settleNow(key, mode, strict, step, progress));
  }

  /** An operation overtaken by a change of the files it read: it writes
   * nothing more and reports the change as its outcome, "changed
   * meanwhile, retry"; a strict caller has it as its reply (DR-111). */
  private overtaken(state: CloneState, stage: "resolve" | "install", error: VersionConflictError, strict: boolean): void {
    state.error = failurePhrase(stage, error);
    if (strict) throw conflictError(error);
  }

  private async settleNow(key: string, mode: SettleMode, strict: boolean, step: (busy: Busy) => void, progress?: SettleProgress): Promise<void> {
    const dir = this.store.repository(key)?.dir;
    // A clone gone has nothing to settle; a strict caller is refused.
    if (!dir || !existsSync(dir)) {
      if (strict) throw this.unavailable(key);
      return;
    }
    const state = this.cloneState(key);
    const workingFolder = this.workingFolder(key);
    const requestsPath = join(dir, "spex.yaml");
    const lockPath = join(dir, "spex.lock");
    let read: ReturnType<typeof readRequestsAt>;
    let locked: ReturnType<typeof readLockAt>;
    try {
      read = readRequestsAt(requestsPath);
      locked = readLockAt(lockPath);
    } catch (error) {
      state.error = failurePhrase("resolve", error);
      this.announce(state.key);
      if (strict) throw new CoreError("invalid_request", state.error);
      return;
    }
    // No requests and no lock: nothing to install, and no exports to keep;
    // a strict caller, which requested a package, finds them gone.
    if (read === null && locked === null) {
      if (strict) this.overtaken(state, "resolve", new VersionConflictError(requestsPath), true);
      return;
    }
    let lock = locked?.lock ?? null;
    let lockVersion: FileVersion = locked?.version ?? null;
    const registry = this.registry();
    const needsResolve = mode === "resolve" || (mode === "auto" && lock === null && read !== null);
    if (needsResolve && read !== null) {
      step("resolving");
      let result: Awaited<ReturnType<typeof resolve>>;
      try {
        result = await resolve({ requests: read.requests, requestsText: read.text, registry, workingFolder, git: this.git, gitCredential: this.options.gitCredential });
      } catch (error) {
        state.error = failurePhrase("resolve", error);
        if (strict) throw new CoreError("invalid_request", state.error);
        return;
      }
      if (!result.ok) {
        state.conflicts = { requests: read.version, conflicts: result.conflicts };
        state.error = null;
        if (strict) throw new CoreError("invalid_request", this.conflictPhrase(result.conflicts));
        return;
      }
      // The lock is written only while `spex.yaml` stands as resolved and
      // the lock as read, both checked at the instant of the write.
      try {
        if (fileVersion(requestsPath) !== read.version) throw new VersionConflictError(requestsPath);
        lockVersion = sha256(await writeLock(lockPath, result.lock, lockVersion));
      } catch (error) {
        if (error instanceof VersionConflictError) return this.overtaken(state, "resolve", error, strict);
        state.error = failurePhrase("resolve", error);
        if (strict) throw new CoreError("invalid_request", state.error);
        return;
      }
      if (progress) progress.lockWritten = true;
      state.conflicts = null;
      lock = result.lock;
    }
    if (lock === null) return;
    step("installing");
    try {
      const report = await install({
        cloneDir: dir,
        lock,
        lockVersion,
        store: this.contentStore,
        cache: this.cacheDir,
        registry,
        git: this.git,
        gitCredential: this.options.gitCredential,
        workingFolder,
        requestsText: read?.text ?? null,
        ...(this.options.modulePaths ? { modulePaths: this.options.modulePaths } : {}),
      });
      if (progress && report.installed.length > 0) progress.installed = true;
      // A stale lock installs nothing and exports nothing: the state's
      // stale phrases say resolving again is needed (environments-7),
      // and an awaiting caller is refused with them.
      if (report.stale) {
        state.error = null;
        if (strict) {
          let current: string | null = null;
          try { current = readRequestsAt(requestsPath)?.text ?? null; } catch { /* unreadable reads as changed */ }
          throw new CoreError("invalid_request", failurePhrase("install", new Error(listed(stalePhrases(lock, current, workingFolder) ?? report.stale))));
        }
        return;
      }
      // Exports derive from the installed tree and its lock: written only
      // while both still stand as this install left them, so no export
      // mixes two locks (environments-8).
      if (fileVersion(lockPath) !== lockVersion) throw new VersionConflictError(lockPath);
      if (!this.installedWhole(dir, lock)) throw new VersionConflictError(join(dir, "packages"));
      await this.exportNow(dir, key, lock);
      state.error = null;
    } catch (error) {
      if (error instanceof VersionConflictError) return this.overtaken(state, "install", error, strict);
      state.error = failurePhrase("install", error);
      if (strict) throw new CoreError("invalid_request", state.error);
      return;
    }
    this.options.changed?.(key);
  }

  /** Every registry and Git source of a lock installed as it locks it. */
  private installedWhole(dir: string, lock: Lock): boolean {
    const installed = installedPackages(dir, lock);
    return Object.entries(lock.packages).every(([name, resolution]) => isPathSource(resolution.source) || installed.has(name));
  }

  /** Export the installed environment into its working folder and, for
   * your own group, your agents' home folders (environments-8). */
  private async exportNow(dir: string, key: string, lock: Lock): Promise<void> {
    await exportEnvironment({
      cloneDir: dir,
      lock,
      workingFolder: this.workingFolder(key),
      userHome: this.isOwn(key) ? this.options.userHome : null,
      agents: this.agents(),
      packagesDir: join(dir, "packages"),
    });
  }

  private conflictPhrase(conflicts: readonly Conflict[]): string {
    return i18n._({
      id: "No set of versions meets every requirement: {conflicts}",
      comment: "Refusal: resolution found no solution; {conflicts} names each spec package with the requirements in conflict",
      values: {
        conflicts: listed(conflicts.map((conflict) => `${conflict.name} (${conflict.requirements.map((entry) => `${entry.by}: ${entry.requirement}`).join(", ")})`)),
      },
    });
  }

  /** The refusal a request earns before any write (environments-15). */
  private refuseRequest(name: string, request: Request, workingFolder: string | null): void {
    const issues = requestIssues(name, request);
    if (issues.length > 0) throw new CoreError("invalid_request", listed(issues.map((issue) => issue.message)));
    if (isPathRequest(request)) {
      if (workingFolder === null) {
        throw new CoreError("invalid_request", i18n._({
          id: "{name} is requested by path, and this spex repository has no working folder on this device",
          comment: "Refusal: a request by path needs the repository's working folder here",
          values: { name },
        }));
      }
      const inside = relative(resolvePath(workingFolder), resolvePath(workingFolder, request.path));
      if (!isInsidePath(request.path) || inside.startsWith("..") || isAbsolute(inside)) {
        throw new CoreError("invalid_request", i18n._({
          id: "{path} is outside the working folder",
          comment: "Refusal: a request by path names a folder outside the repository's working folder",
          values: { path: request.path },
        }));
      }
    }
  }

  /** Write `spex.yaml` under the version read, its refusals as replies:
   * the edit's own, or a conflict where the file changed meanwhile or
   * the clone is gone. */
  private async writeRequest(dir: string, name: string, request: Request | null): Promise<void> {
    try { await setRequest(join(dir, "spex.yaml"), name, request); }
    catch (error) {
      if (error instanceof RequestsError) throw new CoreError("invalid_request", listed(error.issues.map((issue) => issue.message)));
      if (error instanceof VersionConflictError) throw conflictError(error);
      throw error;
    }
  }

  /** `environment.request` (environments-15): refused before any write;
   * written; then resolved and installed, the outcome broadcast. The
   * returned promise settles once installed; the reply does not wait. */
  async request(key: string, name: string, request: Request): Promise<{ done: Promise<void> }> {
    const dir = this.cloneDir(key);
    this.refuseRequest(name, request, this.workingFolder(key));
    await this.writeRequest(dir, name, request);
    this.announce(key);
    return { done: this.settle(key, "resolve", false) };
  }

  /** `environment.remove` (environments-15). */
  async remove(key: string, name: string): Promise<{ done: Promise<void> }> {
    const dir = this.cloneDir(key);
    const current = readRequestsAt(join(dir, "spex.yaml"));
    if (!current?.requests.packages[name]) {
      throw new CoreError("invalid_request", i18n._({
        id: "{name} is not requested here",
        comment: "Refusal: removing a spec package this environment does not request",
        values: { name },
      }));
    }
    await this.writeRequest(dir, name, null);
    this.announce(key);
    return { done: this.settle(key, "resolve", false) };
  }

  /** Request a spec package unless it is requested so already: the
   * enabling path's first write (playbook-library-69). Returns whether
   * `spex.yaml` was written. */
  async ensureRequested(key: string, name: string, request: Request): Promise<boolean> {
    if (this.stopped) throw stoppingError();
    const dir = this.cloneDir(key);
    this.refuseRequest(name, request, this.workingFolder(key));
    let current: Request | undefined;
    try { current = readRequestsAt(join(dir, "spex.yaml"))?.requests.packages[name]; }
    catch (error) { throw new CoreError("invalid_request", failurePhrase("resolve", error)); }
    if (current !== undefined && toRequestValue(current) === toRequestValue(request)) return false;
    await this.writeRequest(dir, name, request);
    this.announce(key);
    return true;
  }

  /** Resolve where the requests changed or no current lock stands, and
   * install, awaited, every failure thrown: the enabling path writes no
   * config before the module is there (playbook-library-69). What it
   * wrote before a failure stands, recorded in `progress`. */
  async installNow(key: string, requested: boolean, progress: SettleProgress): Promise<void> {
    const dir = this.cloneDir(key);
    let stale: string[] | null = ["none"];
    try {
      const lock = readLockSync(join(dir, "spex.lock"));
      if (lock) stale = stalePhrases(lock, readRequestsAt(join(dir, "spex.yaml"))?.text ?? null, this.workingFolder(key));
    } catch { /* resolved below */ }
    await this.settle(key, requested || stale ? "resolve" : "install", true, progress);
  }

  /** Settle every clone whose files need it — one the store just made,
   * one a join brought or one replaced at its address — resolving where
   * no lock stands and installing (environments-5, environments-7). A
   * clone with an operation running is left to it, so one change of the
   * repositories starts at most one settle per clone; no command reads
   * this. */
  settleUnresolved(): void {
    for (const repository of this.store.listRepositories()) {
      if (this.clones.get(repository.key)?.running.size || !this.needsSettle(repository.key)) continue;
      void this.settle(repository.key, "auto", false).catch(() => {});
    }
  }

  /** Whether a clone's files need a settle before a session uses them:
   * requests with no lock, or a current lock not installed as it locks. */
  private needsSettle(key: string): boolean {
    const dir = this.store.repository(key)?.dir;
    if (!dir) return false;
    try {
      const read = readRequestsAt(join(dir, "spex.yaml"));
      if (read === null) return false;
      const lock = readLockSync(join(dir, "spex.lock"));
      if (lock === null) return true;
      if (stalePhrases(lock, read.text, this.workingFolder(key))) return false;
      return !this.installedWhole(dir, lock);
    } catch {
      return false;
    }
  }

  /** Make a clone ready for a session from its files (environments-5):
   * resolve where no lock stands and install where the lock is not
   * installed, waiting on no other operation; an attempt overtaken by
   * another writer reads the files again, a few times at most. */
  async ready(key: string): Promise<void> {
    for (let attempt = 0; attempt < 3 && this.needsSettle(key); attempt += 1) {
      try {
        await this.settle(key, "auto", true);
        return;
      } catch (error) {
        // A failure stands in the state; only an overtaken attempt reads again.
        if (!(error instanceof CoreError && error.code === "conflict")) return;
      }
    }
  }

  /** `environment.resolve` (environments-5). */
  resolveLater(key: string): Promise<void> {
    this.cloneDir(key);
    return this.settle(key, "resolve", false);
  }

  /** `environment.install` (environments-7). */
  installLater(key: string): Promise<void> {
    this.cloneDir(key);
    return this.settle(key, "install", false);
  }

  /** A sync applied a lock (environments-8, environments-17): install
   * from it and export, broadcasting the state. */
  applied(key: string): Promise<void> {
    if (!this.store.repository(key)) return Promise.resolve();
    return this.settle(key, "auto", false);
  }

  /** A clone moved: its report follows, and it is exported again. An
   * operation still running at the old address finds its files gone and
   * writes nothing there. */
  moved(oldKey: string, newKey: string): Promise<void> {
    const state = this.clones.get(oldKey);
    if (state) {
      this.clones.delete(oldKey);
      state.key = newKey;
      this.clones.set(newKey, state);
    }
    return this.applied(newKey);
  }

  /** A working folder stops being paired: what exports wrote there goes. */
  removeExportsFor(_key: string, workingFolder: string | undefined): void {
    if (workingFolder && existsSync(workingFolder)) removeExports(workingFolder);
  }

  // -- publishing (environments-10) ------------------------------------------

  /** `environment.publish`: the folder read and checked as a release and
   * the sign-in confirmed before the reply; the upload runs after it. */
  async publish(key: string, path: string, dryRun = false): Promise<{ done: Promise<void>; preview: PublishPreview }> {
    this.cloneDir(key);
    const workingFolder = this.workingFolder(key);
    if (workingFolder === null) {
      throw new CoreError("invalid_request", i18n._({
        id: "{key} has no working folder on this device",
        comment: "Refusal: publishing reads a folder inside the repository's working folder",
        values: { key },
      }));
    }
    const folder = resolvePath(workingFolder, path);
    const inside = relative(resolvePath(workingFolder), folder);
    if (inside === "" || inside.startsWith("..") || isAbsolute(inside) || inside.split(sep).includes("..")) {
      throw new CoreError("invalid_request", i18n._({
        id: "{path} is outside the working folder",
        comment: "Refusal: a request by path names a folder outside the repository's working folder",
        values: { path },
      }));
    }
    // Signed in means holding a token the host has not refused; a host
    // that cannot be reached now fails the upload, reported with its
    // cause, rather than reading as signed out.
    if (!dryRun && (await this.token().catch(() => "")) === null) {
      throw new CoreError("invalid_request", i18n._({ id: "Sign in to publish", comment: "Refusal: publishing to the registry needs the home signed in" }));
    }
    let manifest: Manifest;
    let files: string[];
    try {
      const release = await readRelease(folder);
      manifest = release.manifest;
      files = release.files.map((file) => file.path);
    } catch (error) {
      if (error instanceof FormatError) {
        throw new CoreError("invalid_request", i18n._({
          id: "{path} is not a spec package release: {issues}",
          comment: "Refusal: the folder fails the core's release checks; {issues} are the checks' own words",
          values: { path, issues: listed(error.issues.map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message))) },
        }));
      }
      throw new CoreError("invalid_request", error instanceof Error ? error.message : String(error));
    }
    // What the upload would hold: the declared release files, in the
    // archive's order (playbook-library-93).
    const preview: PublishPreview = { name: `${manifest.org}/${manifest.name}`, version: manifest.version, files: [...files].sort() };
    if (dryRun) return { done: Promise.resolve(), preview };
    const done = this.run(key, async (step) => {
      const state = this.cloneState(key);
      step("publishing");
      try {
        const published = await publishRelease(this.registry(), folder);
        state.published = { name: published.name, version: published.version, url: `${this.store.home.host.url.replace(/\/+$/, "")}/${manifest.org}/${manifest.name}` };
        state.error = null;
      } catch (error) {
        state.error = failurePhrase("publish", error);
      }
    });
    return { done, preview };
  }

  /** `environment.search` through the registry (environments-17). */
  async search(query: string): Promise<{ name: string; description: string | null; versions: string[] }[]> {
    try {
      const results = await this.registry().search(query);
      return results.map((result) => ({ name: result.name, description: result.description || null, versions: result.versions }));
    } catch (error) {
      throw new CoreError("invalid_request", error instanceof Error ? error.message : String(error));
    }
  }

  // -- reads (environments-14) ------------------------------------------------

  /** The clone's lock, where one reads. */
  lockOf(key: string): Lock | null {
    const dir = this.store.repository(key)?.dir;
    if (!dir) return null;
    try { return readLockSync(join(dir, "spex.lock")); } catch { return null; }
  }

  /** Each playbook a clone's environment exports, by exported name. */
  locations(key: string): Map<string, ModuleLocation> {
    const dir = this.store.repository(key)?.dir;
    const lock = this.lockOf(key);
    if (!dir || !lock) return new Map();
    return moduleLocations(lock, dir, this.workingFolder(key));
  }

  /** Where a session's playbooks come from (environments-9): the
   * project's environment, else your own group's; a module missing on
   * this device counts as none. */
  modulesFor(projectKey: string | null): PlaybookModules {
    const own = this.store.home.own();
    const ownLocations = this.locations(own);
    const project = projectKey !== null && projectKey !== own ? this.locations(projectKey) : null;
    const pick = (locations: Map<string, ModuleLocation> | null, id: string): ModuleLocation | undefined => {
      if (!locations) return undefined;
      const named = locations.get(id);
      if (named?.present) return named;
      for (const location of locations.values()) if (location.id === id && location.present) return location;
      return undefined;
    };
    return {
      repository: project ? projectKey! : own,
      find: (id) => {
        const location = pick(project, id) ?? pick(ownLocations, id);
        return location ? { module: location.module, builtin: location.builtin } : undefined;
      },
    };
  }

  /** The requests by path, name to folder, of a clone. */
  pathRequests(key: string): Map<string, string> {
    const out = new Map<string, string>();
    const dir = this.store.repository(key)?.dir;
    if (!dir) return out;
    try {
      const requests = readRequestsAt(join(dir, "spex.yaml"))?.requests;
      for (const [name, request] of Object.entries(requests?.packages ?? {})) if (isPathRequest(request)) out.set(name, request.path);
    } catch { /* an unreadable file requests nothing here */ }
    return out;
  }

  /** `environment.get`: the environment as the Playbooks surface lists
   * it, read from its files; the conflicts shown only while `spex.yaml`
   * still stands as the resolution that found them read it. */
  state(key: string): EnvironmentState {
    const dir = this.cloneDir(key);
    const clone = this.cloneState(key);
    const workingFolder = this.workingFolder(key);
    let requests: Requests | null = null;
    let requestsText: string | null = null;
    let requestsVersion: FileVersion | undefined;
    let error = clone.error;
    try {
      const read = readRequestsAt(join(dir, "spex.yaml"));
      requests = read?.requests ?? null;
      requestsText = read?.text ?? null;
      requestsVersion = read?.version ?? null;
    } catch (cause) {
      error = failurePhrase("resolve", cause);
    }
    let lock: Lock | null = null;
    try { lock = readLockSync(join(dir, "spex.lock")); }
    catch (cause) { error = failurePhrase("install", cause); }
    const installedNames = lock ? installedPackages(dir, lock) : new Set<string>();
    const conflicts = clone.conflicts !== null && clone.conflicts.requests === requestsVersion ? clone.conflicts.conflicts : null;
    const packages: EnvironmentPackage[] = [];
    for (const name of Object.keys(lock?.packages ?? {}).sort()) {
      const resolution = lock!.packages[name]!;
      const source = resolution.source;
      const pathSource = isPathSource(source);
      const root = pathSource
        ? (workingFolder === null ? null : join(workingFolder, ...source.path.split("/")))
        : join(dir, "packages", ...name.split("/"));
      let manifest: Manifest | null = null;
      if (root !== null && existsSync(join(root, "meta.yaml"))) {
        try { manifest = parseManifestText(readFileSync(join(root, "meta.yaml"), "utf8")).manifest; } catch { manifest = null; }
      }
      const missing = pathSource && (root === null || manifest === null);
      const installed = pathSource ? !missing : installedNames.has(name);
      const pkg = name.split("/")[1]!;
      const kindOf = (id: string): EnvironmentPackage["artifacts"][number]["kind"] => {
        const declared = manifest?.artifacts[id]?.kind;
        if (declared) return declared;
        for (const file of resolution.files) {
          const place = placeOf(file.path, pkg);
          if (place && !place.root && place.id === id) return place.kind;
        }
        return "playbook";
      };
      const builtin = name === BUILTIN_PACKAGE_NAME && isRegistrySource(source);
      packages.push({
        name,
        version: resolutionVersion(resolution) ?? manifest?.version ?? null,
        source: isRegistrySource(source)
          ? { kind: builtin ? "builtin" : "registry", detail: source.registry }
          : isGitSource(source)
            ? { kind: "git", detail: `${source.git} ${source.commit.slice(0, 12)}${source.path ? ` ${source.path}` : ""}` }
            : { kind: "path", detail: source.path },
        direct: requests?.packages[name] !== undefined,
        requiredBy: [...resolution.requiredBy],
        artifacts: Object.keys(resolution.artifacts).sort().map((id) => ({
          id,
          kind: kindOf(id),
          language: resolution.artifacts[id]!.language,
          fallback: resolution.artifacts[id]!.fallback,
        })),
        exports: Object.keys(resolution.exports).sort().map((exported) => ({ name: exported, artifact: resolution.exports[exported]! })),
        installed,
        missingPath: missing && pathSource ? source.path : null,
      });
    }
    const requestMap: Record<string, EnvironmentRequest> = {};
    for (const [name, request] of Object.entries(requests?.packages ?? {})) requestMap[name] = requestOf(request);
    return {
      repository: key,
      language: requests?.language ?? null,
      requests: requestMap,
      packages,
      stale: lock ? stalePhrases(lock, requestsText, workingFolder) : null,
      conflicts: conflicts ? conflicts.map((conflict) => ({ name: conflict.name, requirements: conflict.requirements.map((entry) => ({ ...entry })) })) : null,
      busy: this.busyOf(key),
      error,
      published: clone.published ? { ...clone.published } : null,
    };
  }

  /** Every operation still running ends; nothing is broadcast after. */
  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.allSettled([...this.operations]);
  }
}

/** A request's value for comparison: keys sorted at every level. */
function toRequestValue(request: Request): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]));
    }
    return value;
  };
  return JSON.stringify(canonical(request));
}

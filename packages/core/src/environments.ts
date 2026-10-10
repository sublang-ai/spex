// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Environments in the service (environments-8..17, DR-104): one per
// spex repository on this device — your own group's and every
// project's — holding its requests, lock, staleness, last install and
// conflicts. Resolving and installing run one at a time per clone and
// report through `environment.state`; every install is exported into
// the paired working folder's agent folders and, for your own group,
// into your agents' home folders; a session's playbooks are found in
// the project's environment before your own group's. The built-in spec
// package is seeded at start and requested where an environment lacks
// it, so the built-in playbooks work offline from the first start.

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

import { writeApplicationBytes } from "./app-storage.js";
import {
  AGENT_FOLDERS,
  BUILTIN_PACKAGE_NAME,
  builtinRegistrySource,
  compositeRegistry,
  ContentStore,
  exportEnvironmentSync,
  exportTargets,
  FormatError,
  gitSource,
  installedPackages,
  InstallError,
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
  placeOf,
  prepareBuiltinEnvironment,
  prepareInstall,
  prepareRequest,
  publishRelease,
  readRelease,
  readRequestsFile,
  RegistryClient,
  RegistryError,
  removeExports,
  requestIssues,
  requestsDigest,
  RequestsError,
  resolutionVersion,
  resolve,
  seedBuiltinPackage,
  serializeLock,
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
  type PreparedInstall,
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
  /** A clone's last admitted operation finished: none runs or waits. */
  onIdle?: (repository: string) => void;
}

type Busy = NonNullable<EnvironmentState["busy"]>;

interface CloneState {
  busy: Busy | null;
  conflicts: Conflict[] | null;
  error: string | null;
  published?: { name: string; version: string; url: string };
  /** Operations on this clone, one at a time. */
  chain: Promise<void>;
  pending: number;
}

/** The config half of an enabling is prepared asynchronously and
 * published in the environment's synchronous commit. */
export interface PreparedEnvironmentCommit {
  files: string[];
  validate(): void;
  commit(): void;
}

/** Undo only this commit's write set, captured immediately before its
 * synchronous publication. No other core write can interleave here.
 * The folders the commit makes on the way to its paths go too, deepest
 * first, each only while it stays empty. */
function snapshotPaths(paths: string[], backup: string): { restore(): void; dispose(): void } {
  const unique = [...new Set(paths)].filter((path, _index, all) => !all.some((parent) => parent !== path && path.startsWith(`${parent}${sep}`)));
  const entries = unique.map((path, index) => ({ path, saved: join(backup, String(index)), existed: lstatSync(path, { throwIfNoEntry: false }) !== undefined }));
  const absent = new Set<string>();
  for (const { path } of entries) {
    for (let dir = dirname(path); dir !== dirname(dir) && !existsSync(dir); dir = dirname(dir)) absent.add(dir);
  }
  try {
    for (const entry of entries) if (entry.existed) {
      mkdirSync(dirname(entry.saved), { recursive: true });
      cpSync(entry.path, entry.saved, { recursive: true, verbatimSymlinks: true });
    }
  } catch (error) { rmSync(backup, { recursive: true, force: true }); throw error; }
  return {
    restore() {
      for (const entry of entries) {
        rmSync(entry.path, { recursive: true, force: true });
        if (entry.existed) {
          mkdirSync(dirname(entry.path), { recursive: true });
          cpSync(entry.saved, entry.path, { recursive: true, verbatimSymlinks: true });
        }
      }
      for (const dir of [...absent].sort((a, b) => b.length - a.length)) {
        try { rmdirSync(dir); }
        catch (error) { if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
      }
    },
    dispose() { rmSync(backup, { recursive: true, force: true }); },
  };
}

const readBytes = (file: string): string | null => existsSync(file) ? readFileSync(file, "utf8") : null;

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

export class EnvironmentManager {
  readonly contentStore: ContentStore;
  readonly cacheDir: string;
  readonly git: GitSource;
  private readonly clones = new Map<string, CloneState>();
  /** The clones this run has settled at least once. */
  private readonly settled = new Set<string>();
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
      state = { busy: null, conflicts: null, error: null, chain: Promise.resolve(), pending: 0 };
      this.clones.set(key, state);
    }
    return state;
  }

  private cloneDir(key: string): string {
    const repository = this.store.repository(key);
    if (!repository) {
      throw new CoreError("not_found", i18n._({
        id: "no spex repository {key} on this device",
        comment: "Refusal: the key names no clone under workspace/",
        values: { key },
      }));
    }
    return repository.dir;
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
      this.settled.add(repository.key);
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

  /** Run one operation on a clone after those before it. */
  private enqueue<T>(key: string, work: () => Promise<T>): Promise<T> {
    const state = this.cloneState(key);
    state.pending++;
    const run = async (): Promise<T> => {
      try { return await work(); }
      finally {
        state.pending--;
        if (state.pending === 0) this.options.onIdle?.(key);
      }
    };
    const next = state.chain.then(run, run);
    state.chain = next.then(() => undefined, () => undefined);
    return next;
  }

  private setBusy(key: string, busy: Busy | null): void {
    const state = this.cloneState(key);
    state.busy = busy;
    this.announce(key);
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
   * Errors land in the clone's state; with `strict` they are thrown too.
   */
  settle(key: string, mode: SettleMode, strict: boolean, held?: () => void): Promise<void> {
    this.settled.add(key);
    return this.enqueue(key, () => this.settleNow(key, mode, strict, held));
  }

  /** One queue turn owns preparation and publication. All potentially
   * asynchronous work is private; the held owner and captured inputs
   * are checked once at the synchronous publication boundary. */
  private async settleNow(key: string, mode: SettleMode, strict: boolean, held?: () => void, enabling?: {
    name: string;
    request: Request;
    prepare?: (modules: PlaybookModules) => Promise<PreparedEnvironmentCommit>;
  }): Promise<void> {
    if (this.stopped) {
      if (strict) throw this.departed(key);
      return;
    }
    const dir = this.store.repository(key)?.dir;
    if (!dir) {
      if (strict) this.cloneDir(key);
      return;
    }
    const state = this.cloneState(key);
    const workingFolder = this.workingFolder(key);
    const requestsPath = join(dir, "spex.yaml");
    const lockPath = join(dir, "spex.lock");
    let prepared: PreparedInstall | undefined;
    let phase: "resolve" | "install" = "resolve";
    try {
      held?.();
      const requestsBefore = readBytes(requestsPath);
      let lockBefore = readBytes(lockPath);
      const validateInputs = (): void => {
        held?.();
        if (this.stopped || this.store.repository(key)?.dir !== dir || !existsSync(dir) || this.workingFolder(key) !== workingFolder) {
          throw this.departed(key);
        }
        if (readBytes(requestsPath) !== requestsBefore || readBytes(lockPath) !== lockBefore) {
          throw new CoreError("conflict", i18n._({
            id: "the environment of {key} changed while it was prepared; retry",
            comment: "Refusal: an environment request or lock changed during preparation",
            values: { key },
          }));
        }
      };
      const read = readRequestsFile(requestsPath);
      let requests = read?.requests ?? null;
      let requestsText = read?.text ?? null;
      let lock = lockBefore === null ? null : parseLock(lockBefore);
      let writeRequests = false;
      if (enabling) {
        this.refuseRequest(enabling.name, enabling.request, workingFolder);
        const current = requests?.packages[enabling.name];
        if (current === undefined || toRequestValue(current) !== toRequestValue(enabling.request)) {
          const next = prepareRequest(requestsText, enabling.name, enabling.request);
          requests = next.requests;
          requestsText = next.text;
          writeRequests = true;
          mode = "resolve";
        } else if (!lock || stalePhrases(lock, requestsText, workingFolder)) mode = "resolve";
      }
      if (requests === null && lock === null) return;
      const registry = this.registry();
      let lockText: string | undefined;
      if ((mode === "resolve" || (mode === "auto" && lock === null)) && requests !== null) {
        this.setBusy(key, "resolving");
        const result = await resolve({ requests, requestsText: requestsText ?? undefined, registry, workingFolder, git: this.git, gitCredential: this.options.gitCredential });
        // An enabling's candidate is unpublished: its conflicts, or its
        // solution, say nothing of the environment's requests.
        if (!result.ok) {
          if (enabling) throw new CoreError("invalid_request", this.conflictPhrase(result.conflicts));
          state.conflicts = result.conflicts;
          state.error = null;
          if (strict) throw new CoreError("invalid_request", this.conflictPhrase(result.conflicts));
          return;
        }
        if (!enabling) state.conflicts = null;
        lock = result.lock;
        lockText = serializeLock(lock);
        // An ordinary resolution publishes its new lock even when the
        // subsequent install fails (environments-14). Enabling keeps
        // its candidate private until its config can commit with it.
        if (!enabling && held === undefined) {
          validateInputs();
          writeApplicationBytes(lockPath, lockText);
          lockBefore = lockText;
          lockText = undefined;
        }
      }
      if (lock === null) return;
      phase = "install";
      this.setBusy(key, "installing");
      prepared = await prepareInstall({
        cloneDir: dir, lock, store: this.contentStore, cache: this.cacheDir,
        registry, git: this.git, gitCredential: this.options.gitCredential,
        workingFolder, requestsText,
        ...(this.options.modulePaths ? { modulePaths: this.options.modulePaths } : {}),
      });
      if (enabling && prepared.report.stale) {
        throw new CoreError("conflict", listed(stalePhrases(lock, requestsText, workingFolder) ?? prepared.report.stale));
      }
      const own = this.store.home.own();
      const candidate = moduleLocations(lock, dir, workingFolder, prepared.packagesDir);
      const modules = this.modulesFromLocations(key === own ? null : key,
        key === own ? candidate : this.locations(own), key === own ? null : candidate);
      const extra = await enabling?.prepare?.(modules);
      const exports = {
        cloneDir: dir, lock, workingFolder,
        userHome: this.isOwn(key) ? this.options.userHome : null,
        agents: this.agents(), packagesDir: join(dir, "packages"),
      };
      // No await follows these checks until the entire commit (or its
      // undo) finishes. Cache downloads and discarded staging are not
      // part of the environment's published state.
      validateInputs();
      if (enabling) {
        const stale = stalePhrases(lock, requestsText, workingFolder);
        if (stale) throw new CoreError("conflict", listed(stale));
      }
      extra?.validate();
      const snapshot = snapshotPaths([requestsPath, lockPath, ...exportTargets(exports), ...(extra?.files ?? [])], join(this.cacheDir, "transactions", randomUUID()));
      try {
        if (writeRequests) writeApplicationBytes(requestsPath, requestsText!);
        if (lockText !== undefined) writeApplicationBytes(lockPath, lockText);
        prepared.commit();
        exportEnvironmentSync(exports);
        extra?.commit();
      } catch (error) {
        prepared.rollback();
        snapshot.restore();
        throw error;
      } finally { snapshot.dispose(); }
      if (enabling) state.conflicts = null;
      state.error = null;
      this.options.changed?.(key);
    } catch (error) {
      // A refused enabling published nothing, so the environment's
      // reported error stays the one its published files earned.
      if (error instanceof CoreError) {
        if (strict) throw error;
        state.error = error.message;
      } else {
        const phrase = failurePhrase(phase, error);
        if (!enabling) state.error = phrase;
        if (strict) throw new CoreError("invalid_request", phrase);
      }
    } finally {
      prepared?.dispose();
      this.setBusy(key, null);
    }
  }

  /** The refusal of a write whose environment left before it could
   * publish: the clone moved or went, its pair changed, or the core
   * stopped while the write waited or was prepared. */
  private departed(key: string): CoreError {
    return new CoreError("not_found", i18n._({
      id: "the environment of {key} moved or left while it was prepared",
      comment: "Refusal: a prepared environment no longer has its original destination",
      values: { key },
    }));
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

  /** `environment.request` (environments-15): refused before any write;
   * written; then resolved and installed, the outcome broadcast. The
   * returned promise settles once installed; the reply does not wait. */
  async request(key: string, name: string, request: Request): Promise<{ done: Promise<void> }> {
    this.cloneDir(key);
    this.refuseRequest(name, request, this.workingFolder(key));
    await this.enqueue(key, async () => {
      if (this.stopped) throw this.departed(key);
      const path = join(this.cloneDir(key), "spex.yaml");
      this.refuseRequest(name, request, this.workingFolder(key));
      try { writeApplicationBytes(path, prepareRequest(readBytes(path), name, request).text); }
      catch (error) {
        if (error instanceof RequestsError) throw new CoreError("invalid_request", listed(error.issues.map((issue) => issue.message)));
        throw error;
      }
    });
    this.announce(key);
    return { done: this.settle(key, "resolve", false) };
  }

  /** `environment.remove` (environments-15). */
  async remove(key: string, name: string): Promise<{ done: Promise<void> }> {
    this.cloneDir(key);
    await this.enqueue(key, async () => {
      if (this.stopped) throw this.departed(key);
      const path = join(this.cloneDir(key), "spex.yaml");
      const current = readRequestsFile(path);
      if (!current?.requests.packages[name]) {
        throw new CoreError("invalid_request", i18n._({
          id: "{name} is not requested here",
          comment: "Refusal: removing a spec package this environment does not request",
          values: { name },
        }));
      }
      writeApplicationBytes(path, prepareRequest(current.text, name, null).text);
    });
    this.announce(key);
    return { done: this.settle(key, "resolve", false) };
  }

  /** An enabling is one queue turn: prepare its environment and config,
   * then publish both synchronously. A refused preparation changes no
   * active files, so it cannot roll back somebody else's request. */
  requestAndInstall(key: string, name: string, request: Request, held?: () => void,
    prepare?: (modules: PlaybookModules) => Promise<PreparedEnvironmentCommit>): Promise<void> {
    this.cloneDir(key);
    this.refuseRequest(name, request, this.workingFolder(key));
    this.settled.add(key);
    return this.enqueue(key, () => this.settleNow(key, "install", true, held, { name, request, prepare }));
  }

  /** Settle every clone this run has not settled yet — one the store
   * just made, or a join brought — resolving where no lock stands and
   * installing (environments-5, environments-7). */
  settleUnresolved(): void {
    for (const repository of this.store.listRepositories()) {
      if (this.settled.has(repository.key) || !existsSync(join(repository.dir, "spex.yaml"))) continue;
      this.settled.add(repository.key);
      void this.settle(repository.key, "auto", false).catch(() => {});
    }
  }

  /** Wait for a clone's operations; one this run has not settled
   * resolves where needed and installs first (environments-5). */
  async ready(key: string): Promise<void> {
    const dir = this.store.repository(key)?.dir;
    if (!dir) return;
    if (!this.settled.has(key) && existsSync(join(dir, "spex.yaml"))) {
      this.settled.add(key);
      await this.settle(key, "auto", false).catch(() => {});
      return;
    }
    await this.cloneState(key).chain;
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

  /** A clone moved: its state follows, and it is exported again. */
  moved(oldKey: string, newKey: string): Promise<void> {
    const state = this.clones.get(oldKey);
    if (state) {
      this.clones.delete(oldKey);
      this.clones.set(newKey, state);
    }
    return this.applied(newKey);
  }

  /** A working folder stops being paired: what exports wrote there goes. */
  removeExportsFor(_key: string, workingFolder: string | undefined): void {
    if (workingFolder && existsSync(workingFolder)) removeExports(workingFolder);
  }

  /** The named blocker of a sync while an environment operation runs. */
  busyFor(key: string): string | undefined {
    const state = this.clones.get(key);
    if (!state?.busy && !state?.pending) return undefined;
    return i18n._({
      id: "Wait for the spec packages of {repository} to finish installing",
      comment: "What blocks a Space operation: the spex repository's environment is resolving, installing or publishing",
      values: { repository: key },
    });
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
    const done = this.enqueue(key, async () => {
      const state = this.cloneState(key);
      this.setBusy(key, "publishing");
      try {
        const published = await publishRelease(this.registry(), folder);
        state.published = { name: published.name, version: published.version, url: `${this.store.home.host.url.replace(/\/+$/, "")}/${manifest.org}/${manifest.name}` };
        state.error = null;
      } catch (error) {
        state.error = failurePhrase("publish", error);
      }
      this.setBusy(key, null);
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
   * project's environment, else your own group's for a playbook the
   * project's does not export; a module the exporting environment has
   * not installed on this device, or a path source's folder this device
   * lacks, is missing there, never taken from the other environment. */
  modulesFor(projectKey: string | null): PlaybookModules {
    const own = this.store.home.own();
    const ownLocations = this.locations(own);
    const project = projectKey !== null && projectKey !== own ? this.locations(projectKey) : null;
    return this.modulesFromLocations(projectKey, ownLocations, project);
  }

  private modulesFromLocations(projectKey: string | null, ownLocations: Map<string, ModuleLocation>, project: Map<string, ModuleLocation> | null): PlaybookModules {
    const own = this.store.home.own();
    const pick = (locations: Map<string, ModuleLocation> | null, id: string): ModuleLocation | undefined => {
      if (!locations) return undefined;
      for (const location of locations.values()) if (location.id === id) return location;
      return undefined;
    };
    return {
      repository: project ? projectKey! : own,
      find: (id) => {
        const fromProject = pick(project, id);
        const location = fromProject ?? pick(ownLocations, id);
        if (!location) return undefined;
        if (!location.present) {
          return { missing: { repository: fromProject ? projectKey! : own, module: location.module, ...(location.missingPath !== undefined ? { path: location.missingPath } : {}) } };
        }
        return { module: location.module, builtin: location.builtin };
      },
    };
  }

  /** The requests by path, name to folder, of a clone. */
  pathRequests(key: string): Map<string, string> {
    const out = new Map<string, string>();
    const dir = this.store.repository(key)?.dir;
    if (!dir) return out;
    try {
      const requests = readRequestsFile(join(dir, "spex.yaml"))?.requests;
      for (const [name, request] of Object.entries(requests?.packages ?? {})) if (isPathRequest(request)) out.set(name, request.path);
    } catch { /* an unreadable file requests nothing here */ }
    return out;
  }

  /** `environment.get`: the environment as the Playbooks surface lists it. */
  state(key: string): EnvironmentState {
    const dir = this.cloneDir(key);
    const clone = this.cloneState(key);
    const workingFolder = this.workingFolder(key);
    let requests: Requests | null = null;
    let requestsText: string | null = null;
    let error = clone.error;
    try {
      const read = readRequestsFile(join(dir, "spex.yaml"));
      requests = read?.requests ?? null;
      requestsText = read?.text ?? null;
    } catch (cause) {
      error = failurePhrase("resolve", cause);
    }
    let lock: Lock | null = null;
    try { lock = readLockSync(join(dir, "spex.lock")); }
    catch (cause) { error = failurePhrase("install", cause); }
    const packages: EnvironmentPackage[] = [];
    const installedNow = lock ? installedPackages(dir, lock) : new Set<string>();
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
      const installed = pathSource ? !missing : installedNow.has(name);
      const pkg = name.split("/")[1]!;
      // The lock's kind; a lock written before it recorded one leaves the
      // manifest or the files to tell.
      const kindOf = (id: string): EnvironmentPackage["artifacts"][number]["kind"] => {
        const declared = resolution.artifacts[id]?.kind ?? manifest?.artifacts[id]?.kind;
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
      conflicts: clone.conflicts ? clone.conflicts.map((conflict) => ({ name: conflict.name, requirements: conflict.requirements.map((entry) => ({ ...entry })) })) : null,
      busy: clone.busy,
      error,
      published: clone.published ? { ...clone.published } : null,
    };
  }

  /** Every operation still running ends; nothing is broadcast after. */
  /** The operations already chained on these clones done, starting
   * none: a move waits for what they write beneath (space-59). */
  async idle(keys: readonly string[]): Promise<void> {
    await Promise.allSettled(keys.map((key) => this.clones.get(key)?.chain ?? Promise.resolve()));
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.allSettled([...this.clones.values()].map((state) => state.chain));
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

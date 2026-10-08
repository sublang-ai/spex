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

import { existsSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

import { writeApplicationBytes } from "./app-storage.js";
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

interface CloneState {
  busy: Busy | null;
  conflicts: Conflict[] | null;
  error: string | null;
  published?: { name: string; version: string; url: string };
  /** Operations on this clone, one at a time. */
  chain: Promise<void>;
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
      state = { busy: null, conflicts: null, error: null, chain: Promise.resolve() };
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
    const next = state.chain.then(work, work);
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
  settle(key: string, mode: SettleMode, strict: boolean): Promise<void> {
    this.settled.add(key);
    return this.enqueue(key, () => this.settleNow(key, mode, strict));
  }

  private async settleNow(key: string, mode: SettleMode, strict: boolean): Promise<void> {
    if (this.stopped) return;
    const dir = this.store.repository(key)?.dir;
    if (!dir) return;
    const state = this.cloneState(key);
    const workingFolder = this.workingFolder(key);
    const requestsPath = join(dir, "spex.yaml");
    const lockPath = join(dir, "spex.lock");
    let lock: Lock | null;
    let requestsText: string | null;
    let requests: Requests | null;
    try {
      const read = readRequestsFile(requestsPath);
      requests = read?.requests ?? null;
      requestsText = read?.text ?? null;
      lock = readLockSync(lockPath);
    } catch (error) {
      state.error = failurePhrase("resolve", error);
      this.announce(key);
      if (strict) throw new CoreError("invalid_request", state.error);
      return;
    }
    if (requests === null) {
      // No requests: nothing to install, and no exports to keep.
      if (lock === null) return;
    }
    const registry = this.registry();
    const needsResolve = mode === "resolve" || (mode === "auto" && lock === null && requests !== null);
    if (needsResolve && requests !== null) {
      this.setBusy(key, "resolving");
      try {
        const result = await resolve({ requests, requestsText: requestsText ?? undefined, registry, workingFolder, git: this.git, gitCredential: this.options.gitCredential });
        if (!result.ok) {
          state.conflicts = result.conflicts;
          state.error = null;
          this.setBusy(key, null);
          if (strict) throw new CoreError("invalid_request", this.conflictPhrase(result.conflicts));
          return;
        }
        state.conflicts = null;
        await writeLock(lockPath, result.lock);
        lock = result.lock;
      } catch (error) {
        if (error instanceof CoreError) throw error;
        state.error = failurePhrase("resolve", error);
        this.setBusy(key, null);
        if (strict) throw new CoreError("invalid_request", state.error);
        return;
      }
    }
    if (lock === null) {
      this.setBusy(key, null);
      return;
    }
    this.setBusy(key, "installing");
    try {
      await install({
        cloneDir: dir,
        lock,
        store: this.contentStore,
        cache: this.cacheDir,
        registry,
        git: this.git,
        gitCredential: this.options.gitCredential,
        workingFolder,
        requestsText,
        ...(this.options.modulePaths ? { modulePaths: this.options.modulePaths } : {}),
      });
      await this.exportNow(key, lock);
      state.error = null;
    } catch (error) {
      state.error = failurePhrase("install", error);
      this.setBusy(key, null);
      if (strict) throw new CoreError("invalid_request", state.error);
      return;
    }
    this.setBusy(key, null);
    this.options.changed?.(key);
  }

  /** Export the installed environment into its working folder and, for
   * your own group, your agents' home folders (environments-8). */
  private async exportNow(key: string, lock: Lock): Promise<void> {
    const dir = this.cloneDir(key);
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

  /** `environment.request` (environments-15): refused before any write;
   * written; then resolved and installed, the outcome broadcast. The
   * returned promise settles once installed; the reply does not wait. */
  async request(key: string, name: string, request: Request): Promise<{ done: Promise<void> }> {
    const dir = this.cloneDir(key);
    this.refuseRequest(name, request, this.workingFolder(key));
    await this.enqueue(key, async () => {
      try { await setRequest(join(dir, "spex.yaml"), name, request); }
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
    const dir = this.cloneDir(key);
    const current = readRequestsFile(join(dir, "spex.yaml"));
    if (!current?.requests.packages[name]) {
      throw new CoreError("invalid_request", i18n._({
        id: "{name} is not requested here",
        comment: "Refusal: removing a spec package this environment does not request",
        values: { name },
      }));
    }
    await this.enqueue(key, async () => { await setRequest(join(dir, "spex.yaml"), name, null); });
    this.announce(key);
    return { done: this.settle(key, "resolve", false) };
  }

  /** Request a spec package unless it is requested so already, then
   * resolve where needed and install, awaited: the enabling path
   * (playbook-library-69) writes no config before the module is there. */
  async requestAndInstall(key: string, name: string, request: Request): Promise<void> {
    const dir = this.cloneDir(key);
    this.refuseRequest(name, request, this.workingFolder(key));
    const requestsPath = join(dir, "spex.yaml");
    const current = readRequestsFile(requestsPath)?.requests.packages[name];
    const same = current !== undefined && toRequestValue(current) === toRequestValue(request);
    if (!same) {
      // A refused enabling leaves no environment write behind
      // (playbook-library-7): the requests return as they were.
      const lockPath = join(dir, "spex.lock");
      const before = existsSync(requestsPath) ? readFileSync(requestsPath) : null;
      const lockBefore = existsSync(lockPath) ? readFileSync(lockPath) : null;
      await this.enqueue(key, async () => { await setRequest(requestsPath, name, request); });
      try {
        await this.settle(key, "resolve", true);
      } catch (error) {
        await this.enqueue(key, async () => {
          if (before === null) rmSync(requestsPath, { force: true });
          else writeApplicationBytes(requestsPath, before);
          if (lockBefore === null) rmSync(lockPath, { force: true });
          else writeApplicationBytes(lockPath, lockBefore);
        });
        this.announce(key);
        throw error;
      }
      return;
    }
    const lock = readLockSync(join(dir, "spex.lock"));
    const stale = lock ? stalePhrases(lock, readRequestsFile(join(dir, "spex.yaml"))?.text ?? null, this.workingFolder(key)) : ["none"];
    await this.settle(key, stale ? "resolve" : "install", true);
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
    const busy = this.clones.get(key)?.busy;
    if (!busy) return undefined;
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
   * not installed on this device is missing there, never taken from the
   * other environment. */
  modulesFor(projectKey: string | null): PlaybookModules {
    const own = this.store.home.own();
    const ownLocations = this.locations(own);
    const project = projectKey !== null && projectKey !== own ? this.locations(projectKey) : null;
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
        if (!location.present) return { missing: { repository: fromProject ? projectKey! : own, module: location.module } };
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

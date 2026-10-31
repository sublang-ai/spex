// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Environments in the service (environments-8..17, DR-104, DR-165): one
// per spex repository on this device — your own group's and every
// project's — read from its files: requests, lock, staleness and what
// is installed under its root's `.spex/` — your own group's clone, a
// project's working folder, none for a project whose working folder this
// device does not hold — beside the last operation's report. Operations start at
// once and run side by side, each write versioned on the file it writes
// and each install checked against the lock and requests at its swap,
// so one overtaken meanwhile publishes nothing (DR-111); they report
// through `environment.state`. Every install is exported into
// the paired working folder's agent folders and, for your own group,
// into your agents' home folders, as is a folder once paired, and what
// the last export left out is listed; a session's playbooks are found in
// the project's environment before your own group's. A request by path
// is relative to the paired working folder, or, in your own group's
// environment, to its clone, confined to what that clone syncs
// (environments-2, environments-32, DR-125). The built-in spec
// package is seeded at start and requested where an environment lacks
// it, so the built-in playbooks work offline from the first start. An
// environment's explicit registry is independent of its Space. Legacy
// manifests retain their former routing, while independent installations
// use only the selected registry and its registry grant (DR-168).

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve as resolvePath, sep } from "node:path";

import { fileVersion, readVersioned, writeVersionedBytes, sha256, VersionConflictError, type FileVersion } from "@sublang/spex/files";
import {
  AGENT_FOLDERS,
  BUILTIN_PACKAGE_NAME,
  builtinRegistrySource,
  compareVersions,
  compositeRegistry,
  ContentStore,
  environmentInstance,
  environmentRegistry,
  editRequests,
  setRegistryIn,
  setSpaceIn,
  installRegistryOrder,
  exportEnvironment,
  FormatError,
  gitSource,
  GitSourceError,
  ResolveError,
  isGitRequest,
  install,
  installedDir,
  installedPackages,
  isGitSource,
  isInsidePath,
  isPackageName,
  isPathRequest,
  isPathSource,
  isRegistryRequest,
  isRegistrySource,
  listReleaseFiles,
  lockStaleness,
  lockStoreKeys,
  moduleLocations,
  ownFolderIssue,
  packageRoot,
  ownPathIssue,
  parseLock,
  parseManifestText,
  parseRequests,
  placeOf,
  prepareBuiltinEnvironment,
  prepareEnvironment,
  publishIssues,
  publishRelease,
  readRelease,
  RegistryClient,
  RegistryError,
  rehomeBuiltinLock,
  removeExports,
  requestIssues,
  requestsDigest,
  RequestsError,
  resolutionVersion,
  resolve,
  satisfies,
  seedBuiltinPackage,
  setRequest,
  unaskedRegistry,
  writeLock,
  type BuiltinPackage,
  type Conflict,
  type CredentialArgs,
  type ExportReport,
  type GitCredential,
  type GitRun,
  type GitSource,
  type Lock,
  type Manifest,
  type ModuleLocation,
  type OwnPathIssue,
  type RegistryOrg,
  type RegistrySource,
  type RegistrySourceLock,
  type Request,
  type Requests,
} from "@sublang/spex/environment";
import { parseDocument } from "yaml";
import type { AuthScope } from "@sublang/spex/git-host";
import { shippedBuiltinPackage } from "./builtins.js";
import { installEngine } from "./compile.js";
import { i18n } from "./i18n.js";
import { migrateEnvironments, type MigratedRepository } from "./migrate-environment.js";
import { gitEnvironment } from "./storage-git.js";
import { canonicalOrigin } from "@sublang/spex/instance";
import type { PlaybookModules } from "./config.js";
import type { EnvironmentPackage, EnvironmentRequest, EnvironmentRequestSummary, EnvironmentState, PublishedPackage, PublishPreview } from "./protocol.js";
import { CoreError } from "./session.js";
import type { Store } from "./store.js";

/** An applet an environment installs, as `applet.open` and its
 * serving read it (applets-3, applets-4). */
export interface InstalledApplet {
  /** The spec package it comes from, `<org>/<pkg>`. */
  package: string;
  version: string | null;
  /** Its folder on this device; null where a path source has no path
   * root here. */
  dir: string | null;
  /** Its files stand on this device (environments-14). */
  present: boolean;
}

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
  /** The origin of the instance a spex repository is placed at
   * (storage-31): a project's by its key or remote, your own group's the
   * one its own repository's remote names; null for one local only
   * (DR-127). Read only to name it as `space` where the core writes an
   * environment's built-in request (environments-11); the environment's
   * instance itself is the `space` its `spex.yaml` names, else the home's
   * default instance (environments-2, DR-165). */
  placedAt: (key: string) => string | null;
  /** The device's current access secret at a listed instance, kept
   * current by that instance's client (git-host-4); null where it holds
   * none. Asked only of an instance the home is signed in to
   * (environments-12). */
  tokenFor: (origin: string, scope?: AuthScope) => Promise<string | null>;
  /** An instance's name in what the core says of it: its display name
   * as the home last read it, else its host name — the instance a
   * publish needs the home signed in at, named as the Enable tab names
   * it (environments-10, playbook-library-93, DR-127). */
  instanceName: (origin: string) => string;
  /** Told the token an instance's registry refused with a code that
   * signs that instance out (environments-12, git-host-4); where it
   * throws, the refused call fails with what it threw. */
  refused?: (origin: string, token: string, scope?: AuthScope) => void | Promise<void>;
  /** The brokered credential for a Git source (environments-13): the
   * one an instance the home is signed in to brokers at whose Git origin
   * the source lies, the environment's own instance — `preferred` —
   * asked first where it is one; undefined at the Git origin of none,
   * where this device's own Git fetches it. */
  gitCredential: (repo: string, preferred: string | null) => Promise<GitCredential | undefined>;
  /** How that credential reaches Git: the app's own credential helper
   * (git-host-9). */
  credentialArgs: CredentialArgs;
  /** Read-only labels and reports from the instance facts already read
   * (environments-29): a source under an instance's reported Git origin
   * reads as that instance's name, the environment's own — `preferred` —
   * where it is one. */
  gitLabel: (repo: string, preferred: string | null) => string;
  gitFailure: (repo: string, run: GitRun, preferred: string | null) => string;
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
  /** The version of `spex.lock` the last install, by any operation,
   * was attempted from (environments-26), so a use's read installs only
   * a lock other than it and retries no failure until the lock changed. */
  usedLock?: FileVersion;
  /** What the last export left out, with the working folder it exported
   * into: listed only while that folder is the one paired
   * (environments-14), and standing until the next export, whatever
   * overtakes the operation after it. */
  unexported: (NonNullable<EnvironmentState["unexported"]> & { folder: string | null }) | null;
}

/** What a strict settle wrote before it stopped, for the caller's report. */
export interface SettleProgress {
  lockWritten: boolean;
  installed: boolean;
}

/** What one settle does: resolve where needed, or always, then install
 * and export. */
type SettleMode = "auto" | "resolve" | "install";

/** An environment's Git sources as the core fetches and shows them
 * (environments-13, environments-29), by the environment's instance. */
interface EnvironmentGit {
  /** The environment's instance (environments-2), read at its first use. */
  instance: () => string;
  credential: (repo: string) => Promise<GitCredential | undefined>;
  label: (repo: string) => string;
  failure: (repo: string, run: GitRun) => string;
}

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
 * source whose manifest moved where its path resolves under
 * `pathRoot`. */
function stalePhrases(lock: Lock, requestsText: string | null, pathRoot: string | null): string[] | null {
  const phrases: string[] = [];
  if (requestsText === null || requestsDigest(requestsText) !== lock.requests) {
    phrases.push(i18n._({ id: "Requests changed; resolve again to install", comment: "The lock no longer matches spex.yaml; the last installed files stay in use" }));
  }
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    if (!isPathSource(resolution.source)) continue;
    const single: Lock = { format: 1, requests: requestsText === null ? "" : requestsDigest(requestsText), packages: { [name]: resolution } };
    const verdict = lockStaleness(single, requestsText, (path) => {
      if (pathRoot === null) return null;
      const file = join(pathRoot, ...path.split("/"), "meta.yaml");
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

/** Whether the code's `HEAD` in a working folder holds both `spex.yaml`
 * and `spex.lock` at the folder's root (environments-26), read from its
 * Git at each call: a folder that is no repository, has no commit, or
 * lacks either file in `HEAD` — one added but not committed included —
 * reads not committed. */
function committedWithCode(root: string): boolean {
  const run = spawnSync("git", ["-C", root, "ls-tree", "--name-only", "HEAD", "--", "spex.yaml", "spex.lock"], {
    env: gitEnvironment(), stdio: ["ignore", "pipe", "ignore"], timeout: 10_000,
  });
  if (run.error || run.status !== 0) return false;
  const names = new Set(run.stdout.toString("utf8").split("\n").map((line) => line.trim()).filter(Boolean));
  return names.has("spex.yaml") && names.has("spex.lock");
}

/** Whether a folder stands at `path`, a link to one counted. */
function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

/** The reader's words for a path your own group's clone refuses
 * (environments-32). */
function confinedPhrase(path: string, issue: OwnPathIssue): string {
  switch (issue.reason) {
    case "root":
      return i18n._({ id: "{path} is not a folder below your own group's clone's root", comment: "Refusal: a request by path in your own group's environment names its clone's root", values: { path } });
    case "spex":
      return i18n._({ id: "{path} is a path Spex keeps in your own group's clone", comment: "Refusal: a request by path in your own group's environment names a folder under Spex's own paths, such as sessions/ or skills/", values: { path } });
    case "ignored":
      return i18n._({ id: "{path} is a path the clone's Git rules ignore, so it would not sync", comment: "Refusal: a request by path in your own group's environment names a folder the clone's sync rules drop, such as one named *.tmp", values: { path } });
    case "link":
      return i18n._({ id: "{path} is reached through a link, which the clone's sync does not carry", comment: "Refusal: a request by path in your own group's environment names a folder that is, or lies under, a link", values: { path } });
    case "repository":
      return i18n._({ id: "{path}: {entry} is a Git repository of its own, which the clone's sync does not carry", comment: "Refusal: a request by path in your own group's environment names a folder that is, lies in or holds a folder holding .git; {entry} is that folder's path in the clone", values: { path, entry: issue.entry } });
    case "ignored_file":
      return i18n._({ id: "{path} holds {file}, which the clone's Git rules ignore, so it would not sync", comment: "Refusal: a request by path in your own group's environment names a folder holding a file the clone's sync rules drop; {file} is that file's path in the clone", values: { path, file: issue.file } });
    case "unshared_file":
      return i18n._({ id: "{path} holds {file}, which the clone's sync refuses to share", comment: "Refusal: a request by path in your own group's environment names a folder holding a tracked file of a family that stays on the device, such as a *.tmp file forced into Git; {file} is that file's path in the clone", values: { path, file: issue.file } });
    case "link_entry":
      return i18n._({ id: "{path}: {entry} is a link, which the clone's sync does not carry", comment: "Refusal: a request by path in your own group's environment names a folder holding a link the clone's Git rules do not ignore; {entry} is the link's path in the clone", values: { path, entry: issue.entry } });
    case "special":
      return i18n._({ id: "{path}: {entry} is no regular file or folder, so the clone's sync does not carry it", comment: "Refusal: a request by path in your own group's environment names a folder holding a special file, such as a pipe or a socket; {entry} is its path in the clone", values: { path, entry: issue.entry } });
    case "unreadable":
      return i18n._({ id: "{path}: {entry} cannot be inspected to confirm it syncs with the clone", comment: "Refusal: a nonignored subtree of your own group's path source cannot be read; {entry} is its path in the clone", values: { path, entry: issue.entry } });
  }
}

function requestOf(request: Request, label: (repo: string) => string): EnvironmentRequestSummary {
  const extras = {
    ...(request.select ? { select: request.select.map((entry) => ({ ...entry })) } : {}),
    ...(request.alias ? { alias: { ...request.alias } } : {}),
  };
  if (isRegistryRequest(request)) return { kind: "registry", version: request.version, ...extras };
  if (isPathRequest(request)) return { kind: "path", path: request.path, ...extras };
  return { kind: "git", repository: label(request.git), rev: request.rev, ...(request.path !== undefined ? { path: request.path } : {}), ...extras };
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
    // A source at a signed-in instance's Git origin is fetched with the
    // credential that instance brokers through the app's helper; any
    // other with this device's own Git (environments-13).
    this.git = gitSource(this.cacheDir, { credentialArgs: options.credentialArgs });
  }

  /** An environment's Git sources (environments-13, environments-29):
   * each fetched with the credential an instance the home is signed in
   * to brokers at its Git origin, and read as an instance's name, the
   * environment's own instance preferred — read at the first source
   * asking for it from the requests given, else from `spex.yaml`. */
  private gitOf(key: string, requests?: Requests | null): EnvironmentGit {
    let own: string | undefined;
    const instance = (): string => (own === undefined ? (own = requests !== undefined ? this.instanceOfRequests(requests) : this.labelInstanceOf(key)) : own);
    return {
      instance,
      credential: (repo) => this.options.gitCredential(repo, instance()),
      label: (repo) => this.options.gitLabel(repo, instance()),
      failure: (repo, run) => this.options.gitFailure(repo, run, instance()),
    };
  }

  /** Only generated source fields are projected; authored documents and
   * request/lock bytes never pass through this presentation boundary. */
  private sourceText(text: string, repo: string, git: EnvironmentGit): string {
    return text.split(repo).join(git.label(repo));
  }

  private failure(stage: "resolve" | "install" | "publish", error: unknown, git: EnvironmentGit, requests?: Requests): string {
    if (error instanceof GitSourceError) {
      error = new Error(error.run ? git.failure(error.repo, error.run) : this.sourceText(error.message, error.repo, git));
    } else if (error instanceof ResolveError && error.packageName) {
      const request = requests?.packages[error.packageName];
      if (request && isGitRequest(request)) error = new Error(this.sourceText(error.message, request.git, git));
    }
    const phrase = failurePhrase(stage, error);
    return requests?.registry && error instanceof RegistryError && (error.kind === "unauthenticated" || error.kind === "forbidden" || error.kind === "not_found") ? `${phrase} ${i18n._("Sign in to registry to use private packages.")}` : phrase;
  }

  private shownConflicts(conflicts: readonly Conflict[], requests: Requests | null, git: EnvironmentGit): Conflict[] {
    return conflicts.map((conflict) => {
      const request = requests?.packages[conflict.name];
      return { ...conflict, requirements: conflict.requirements.map((entry) => ({ ...entry,
        requirement: request && isGitRequest(request) && entry.by === "spex.yaml" && entry.requirement.startsWith(`git ${request.git} at `)
          ? this.sourceText(entry.requirement, request.git, git) : entry.requirement,
      })) };
    });
  }

  private get store(): Store {
    return this.options.store;
  }

  /** The agents this device has, whose user-level folders your own
   * group's exports reach (environments-16): each agent the folder table
   * names one of whose home folders stands in the user's home — such as
   * `~/.claude` for claude. An agent never used here gets no folder made
   * for it. */
  agents(): string[] {
    return Object.entries(AGENT_FOLDERS)
      .filter(([, folders]) => folders.homes.some((home) => existsSync(join(this.options.deviceHome, ...home.replace(/^~\//, "").split("/")))))
      .map(([agent]) => agent);
  }

  /** Every namespace the selected registry account may publish to,
   * independent of Space membership (DR-168); null without its registry
   * grant or where the registry gives no answer. */
  async publishableOrgs(key: string): Promise<RegistryOrg[] | null> {
    // A `spex.yaml` that does not read names no instance: no registry is
    // asked, the default instance's least of all (environments-2).
    let target: ReturnType<typeof environmentRegistry>;
    try { target = this.registryOf(key); } catch { return null; }
    const { origin, remote } = this.registryAt(target.origin, "registry");
    if ((await this.tokenAt(origin, "registry")) === null) return null;
    return remote.orgs();
  }

  /** An explicit namespace selection is authoritative, unlike the
   * short best-effort authoring suggestion (environments-27). */
  async registryOrgs(key: string): Promise<RegistryOrg[]> {
    const target = this.registryOf(key);
    const { origin, remote } = this.registryAt(target.origin, "registry");
    if ((await this.tokenAt(origin, "registry")) === null) {
      throw new CoreError("invalid_request", i18n._("Sign in to registry to load publishing namespaces."));
    }
    const orgs = await remote.orgs(30_000);
    if (orgs === null) {
      throw new CoreError("invalid_request", i18n._("Could not load registry namespaces. Try again."));
    }
    return orgs;
  }

  /** The home's default instance's origin (storage-2): the registry of
   * an environment with no instance (DR-127). */
  private defaultOrigin(): string {
    return canonicalOrigin(this.store.home.defaultInstance().origin);
  }

  /** The instance of an environment of these requests (environments-2,
   * DR-165): the `space` they name, else the home's default instance. */
  private instanceOfRequests(requests: Requests | null): string {
    return environmentInstance(requests, { origin: this.store.home.defaultInstance().origin, instances: this.store.home.instances() });
  }

  /** The instance a spex repository's environment shows its Git
   * sources' labels by (environments-29), read from `spex.yaml` as it
   * stands — the default instance where it names none or does not read,
   * for presentation alone: no registry, credential or publish follows
   * it. */
  private labelInstanceOf(key: string): string {
    const root = this.rootOf(key);
    let requests: Requests | null = null;
    try { requests = root !== null ? readRequestsAt(join(root, "spex.yaml"))?.requests ?? null : null; } catch { requests = null; }
    return this.instanceOfRequests(requests);
  }

  /** The requests of a spex repository's environment as `spex.yaml`
   * stands, null where absent; one that does not read — a `space` that
   * is no instance origin among its reasons (environments-2) — refuses
   * the command asking, never read as naming no instance; none while
   * this device holds no root for it (environments-26). */
  private requestsOf(key: string): Requests | null {
    this.assertMigrated(key);
    this.cloneDir(key);
    const root = this.rootOf(key);
    if (root === null) return null;
    try { return readRequestsAt(join(root, "spex.yaml"))?.requests ?? null; }
    catch (error) {
      const cause = error instanceof RequestsError ? listed(error.issues.map((issue) => issue.message)) : error instanceof Error ? error.message : String(error);
      throw new CoreError("invalid_request", i18n._({
        id: "spex.yaml does not read: {cause}",
        comment: "Refusal: a search or publish needs the environment's instance, and its spex.yaml does not read; {cause} is the library's own words, such as a space that is no instance origin",
        values: { cause },
      }));
    }
  }

  registryOf(key: string): ReturnType<typeof environmentRegistry> {
    return environmentRegistry(this.requestsOf(key), { origin: this.store.home.defaultInstance().origin, instances: this.store.home.instances() });
  }

  async setRegistry(key: string, origin: string): Promise<EnvironmentState> {
    origin = canonicalOrigin(origin);
    const { root } = this.environmentOf(key);
    const path = join(root, "spex.yaml");
    // The shared document editor preserves comments, extension fields and
    // key order, validates format, and writes under the exact version read.
    // Selection changes no lock or package provenance.
    await this.run(key, async () => {
      try { await editRequests(path, (doc) => setRegistryIn(doc, origin)); }
      catch (error) {
        if (error instanceof RequestsError) throw new CoreError("invalid_request", listed(error.issues.map((issue) => issue.message)));
        if (error instanceof VersionConflictError) throw conflictError(error);
        throw error;
      }
    });
    this.announce(key);
    return this.state(key);
  }

  /** The `space` an environment's built-in request names where the core
   * writes it (environments-11): its placed instance's origin, independent
   * of each device's default; null for a local-only environment. */
  private spaceOf(placed: string | null): string | null {
    if (placed === null) return null;
    return canonicalOrigin(placed);
  }

  /** The registry answering under an instance's origin: one client per
   * origin for the run, each composed with the built-in spec package
   * this device serves offline (environments-11, environments-12). */
  private registryAt(origin: string, scope: AuthScope = "space"): { origin: string; remote: RegistryClient; source: RegistrySource } {
    const at = canonicalOrigin(origin);
    let registry = this.registries.get(`${scope}:${at}`);
    if (!registry) {
      const refused = this.options.refused;
      const remote = new RegistryClient({
        url: at,
        token: () => this.tokenAt(at, scope),
        ...(refused ? { refused: (token: string) => refused(at, token, scope) } : {}),
        ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
      });
      registry = { origin: at, remote, source: compositeRegistry(this.builtinSource(), remote) };
      this.registries.set(`${scope}:${at}`, registry);
    }
    return registry;
  }

  private readonly registries = new Map<string, { origin: string; remote: RegistryClient; source: RegistrySource }>();

  /** The built-in spec package as a registry source, made once: it reads
   * and packs the shipped release once, not on every resolve. */
  private builtinSource(): RegistrySource {
    this.builtinRegistry ??= builtinRegistrySource({ store: this.contentStore, cacheDir: this.cacheDir, shipped: this.options.builtin === undefined ? shippedBuiltinPackage() : this.options.builtin });
    return this.builtinRegistry;
  }

  private builtinRegistry?: RegistrySource;

  /** The token a registry call presents at an instance (environments-12):
   * that instance's access secret where the home is signed in to it, as
   * its client keeps it current (git-host-4); none to any other origin. */
  private tokenAt(origin: string, scope: AuthScope = "space"): Promise<string | null> {
    return scope === "registry" || this.store.home.account(origin) !== null ? this.options.tokenFor(origin, scope) : Promise.resolve(null);
  }

  /** The registries an install asks for a registry package's files, in
   * order (environments-7): the environment's instance's, then the one
   * its lock records, then every other instance's the home is signed in
   * to, in the home's order, each asked once. A recorded registry that
   * names no instance's origin is never asked; it stands in the list to
   * be named where no other serves. */
  private installRegistries(target: ReturnType<typeof environmentRegistry>, source: RegistrySourceLock): RegistrySource[] {
    const order = installRegistryOrder(target.origin, source.registry, this.store.home.instances().filter((entry) => this.store.home.account(entry.origin) !== null).map((entry) => entry.origin), { independent: !target.legacy });
    return order.map((entry) => "origin" in entry ? this.registryAt(entry.origin, target.scope).source : compositeRegistry(this.builtinSource(), unaskedRegistry(entry.unasked)));
  }

  private cloneState(key: string): CloneState {
    let state = this.clones.get(key);
    if (!state) {
      state = { key, running: new Set(), conflicts: null, error: null, unexported: null };
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

  /** The folder a request's `path` is relative to on this device
   * (environments-2): your own group's clone, where its `spex.yaml` is
   * and which syncs to every device; else the paired working folder;
   * null where none is paired. */
  pathRoot(key: string): string | null {
    if (this.isOwn(key)) return this.store.repository(key)?.dir ?? null;
    return this.workingFolder(key);
  }

  /** The environment's root on this device (environments-26), holding
   * its `spex.yaml` and `spex.lock` and, under `.spex/`, what is
   * installed: your own group's clone, else the paired working folder
   * while it stands; null where this device holds none, so a project
   * whose working folder is missing here has no environment here. */
  rootOf(key: string): string | null {
    const root = this.pathRoot(key);
    return root !== null && isDirectory(root) ? root : null;
  }

  /** The refusal of a command on an environment with no root here
   * (environments-15). */
  private noRoot(key: string): CoreError {
    return new CoreError("not_found", i18n._({
      id: "{key} has no working folder on this device",
      comment: "Refusal: the environment's installed files stand in the repository's working folder, which this device does not hold",
      values: { key },
    }));
  }

  /** A command's environment: its clone, refused `not_found` where the
   * key names none on this device, and its root, refused the same way
   * where this device holds none (environments-15). */
  private environmentOf(key: string): { root: string } {
    this.assertMigrated(key);
    this.cloneDir(key);
    const root = this.rootOf(key);
    if (root === null) throw this.noRoot(key);
    return { root };
  }

  /** The former installed trees of a clone (DR-165): `packages/` and
   * `skills/`, which an install under the root's `.spex/` replaces and
   * removes as garbage collection once `.spex/` stands, its failure
   * reported and never failing the install (environments-7). */
  private removeFormerTrees(dir: string, root: string): void {
    if (!existsSync(installedDir(root))) return;
    for (const name of ["packages", "skills"]) {
      const former = join(dir, name);
      if (!existsSync(former)) continue;
      try { rmSync(former, { recursive: true, force: true }); }
      catch (error) { console.error(`spex: installed files stand; the former tree ${former} could not be removed: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }

  // -- the built-in spec package (environments-11) ---------------------------

  /** Request the built-in spec package where the environment at `root`
   * lacks it, with the lock where that is all it requests, locked at the
   * registry of the instance the spex repository is placed at, else the
   * default instance's, and naming that instance as `space` wherever it
   * has one (environments-11, environments-2). */
  prepare(root: string, key: string): boolean {
    if (!this.options.builtin) return false;
    const placed = this.options.placedAt(key);
    return prepareBuiltinEnvironment(root, this.options.builtin, placed ?? this.defaultOrigin(), this.spaceOf(placed));
  }

  /** The release this app ships beside the one a lock selects, where the
   * lock selects an older built-in release and the requirement
   * `spex.yaml` requests the built-in spec package at admits the shipped
   * one (environments-11); the lock moves only when the reader resolves. */
  private builtinUpdate(requests: Requests | null, lock: Lock | null): EnvironmentState["builtinUpdate"] {
    const shipped = this.options.builtin?.version;
    const request = requests?.packages[BUILTIN_PACKAGE_NAME];
    const source = lock?.packages[BUILTIN_PACKAGE_NAME]?.source;
    if (!shipped || !request || !isRegistryRequest(request) || !source || !isRegistrySource(source)) return undefined;
    try {
      if (compareVersions(shipped, source.version) <= 0 || !satisfies(shipped, request.version)) return undefined;
    } catch {
      return undefined;
    }
    return { shipped, locked: source.version };
  }

  /** At start: seed the built-in spec package, move every project's
   * environment its clone still holds into its working folder
   * (storage-24), request the built-in spec package in your own group's
   * environment where it lacks it, then resolve where no lock stands,
   * install and export every environment, and collect the store. A
   * project's working folder holding no `spex.yaml` holds no
   * environment: its request is written at pairing alone
   * (environments-11, storage-6). */
  async startup(): Promise<void> {
    if (this.options.builtin) {
      try { await seedBuiltinPackage(this.contentStore, this.cacheDir, this.options.builtin); }
      catch (error) { console.error(`spex: the built-in spec package was not seeded: ${error instanceof Error ? error.message : String(error)}`); }
    }
    this.migrate(null);
    for (const repository of this.store.listRepositories()) {
      if (this.migrationBlocked.has(repository.key)) continue;
      const root = this.rootOf(repository.key);
      let wrote = false;
      if (this.isOwn(repository.key) && root !== null) {
        try { wrote = this.prepare(root, repository.key); }
        catch (error) { console.error(`spex: ${repository.key} does not request the built-in spec package: ${String(error)}`); }
      }
      const lock = root !== null && existsSync(join(root, "spex.lock"));
      await this.settle(repository.key, wrote && !lock ? "resolve" : "auto", false);
    }
    this.collect();
  }

  /** The environment migration (storage-24) over every spex repository
   * on this device, or over one project's at its pairing: its moves are
   * installed and exported by the settle that follows. */
  private readonly migrationBlocked = new Set<string>();

  private migrationError(): CoreError {
    return new CoreError("conflict", i18n._({ id: "Environment migration is incomplete; restore the original or planned files and restart to recover.", comment: "Package operation refused while its manifest and lock migration needs recovery" }));
  }

  private assertMigrated(key: string): void {
    if (this.migrationBlocked.has(key)) throw this.migrationError();
  }

  private migrate(key: string | null): void {
    const own = this.store.home.own();
    const repositories: MigratedRepository[] = [];
    for (const repository of this.store.listRepositories()) {
      if (key !== null && repository.key !== key) continue;
      const isOwn = repository.key === own;
      let instance: string | null = null;
      try { instance = this.options.placedAt(repository.key); } catch { instance = null; }
      repositories.push({ key: repository.key, clone: repository.dir, own: isOwn, folder: isOwn ? null : this.workingFolder(repository.key), instance });
    }
    const report = (repository: string, blocked: boolean): void => {
      const message = this.migrationError().message;
      if (blocked) {
        this.migrationBlocked.add(repository);
        this.cloneState(repository).error = message;
      } else {
        this.migrationBlocked.delete(repository);
        if (this.cloneState(repository).error === message) this.cloneState(repository).error = null;
      }
    };
    try { migrateEnvironments(this.store.dir, repositories, { report }); }
    catch (error) {
      for (const repository of repositories) report(repository.key, true);
      console.error(`spex: the environment migration stopped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Remove store entries no lock on this device selects (environments-7):
   * each environment's at its root, and the lock a project's clone still
   * holds until its working folder is paired here (storage-24). */
  collect(): void {
    // A partially retired source may survive only in its retained plan.
    if (this.migrationBlocked.size) return;
    const locks: Lock[] = [];
    for (const repository of this.store.listRepositories()) {
      const root = this.rootOf(repository.key);
      const files = new Set([...(root !== null ? [join(root, "spex.lock")] : []), join(repository.dir, "spex.lock")]);
      for (const file of files) {
        try {
          const lock = readLockSync(file);
          if (lock) locks.push(lock);
        } catch { /* an unreadable lock keeps nothing it might select: skip collecting */ return; }
      }
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
    if (this.migrationBlocked.has(key)) return Promise.reject(this.migrationError());
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
    if (this.migrationBlocked.has(key)) return strict ? Promise.reject(this.migrationError()) : Promise.resolve();
    // No work starts once the manager stops; a strict caller is told.
    if (this.stopped) return strict ? Promise.reject(stoppingError()) : Promise.resolve();
    return this.run(key, (step) => this.settleNow(key, mode, strict, step, progress));
  }

  /** An operation overtaken by a change of the files it read writes
   * nothing more, and its refusal is its own outcome alone: a strict
   * caller has it as its reply, "changed meanwhile, retry", and the
   * state, read from the files, records no failure (DR-111). */
  private overtaken(error: VersionConflictError, strict: boolean): void {
    if (strict) throw conflictError(error);
  }

  /** The input file an operation read that no longer holds the bytes it
   * read, if any: a failure met meanwhile is obsolete, never recorded
   * over what a later operation left (environments-5, environments-7). */
  private changedSince(requestsPath: string, requestsVersion: FileVersion, lockPath: string, lockVersion: FileVersion): VersionConflictError | null {
    if (fileVersion(requestsPath) !== requestsVersion) return new VersionConflictError(requestsPath);
    if (fileVersion(lockPath) !== lockVersion) return new VersionConflictError(lockPath);
    return null;
  }

  private async settleNow(key: string, mode: SettleMode, strict: boolean, step: (busy: Busy) => void, progress?: SettleProgress): Promise<void> {
    const dir = this.store.repository(key)?.dir;
    // A clone gone has nothing to settle; a strict caller is refused.
    if (!dir || !existsSync(dir)) {
      if (strict) throw this.unavailable(key);
      return;
    }
    // No root here, nothing installs: a strict caller is refused
    // (environments-15, environments-26).
    const root = this.rootOf(key);
    if (root === null) {
      if (strict) throw this.noRoot(key);
      return;
    }
    const state = this.cloneState(key);
    let envGit = this.gitOf(key);
    const pathRoot = this.pathRoot(key);
    const requestsPath = join(root, "spex.yaml");
    const lockPath = join(root, "spex.lock");
    let read: ReturnType<typeof readRequestsAt> = null;
    let locked: ReturnType<typeof readLockAt>;
    try {
      read = readRequestsAt(requestsPath);
      locked = readLockAt(lockPath);
    } catch (error) {
      state.error = this.failure("resolve", error, envGit, read?.requests);
      this.announce(state.key);
      if (strict) throw new CoreError("invalid_request", state.error);
      return;
    }
    // No requests and no lock: nothing to install, and no exports to keep;
    // a strict caller, which requested a package, finds them gone.
    if (read === null && locked === null) {
      if (strict) this.overtaken(new VersionConflictError(requestsPath), true);
      return;
    }
    let lock = locked?.lock ?? null;
    let lockVersion: FileVersion = locked?.version ?? null;
    // The environment's registry, at the instance its `spex.yaml` names,
    // else the default instance's (environments-2, environments-5,
    // DR-165), read from the requests this operation read.
    envGit = this.gitOf(key, read?.requests ?? null);
    const target = environmentRegistry(read?.requests ?? null, { origin: this.store.home.defaultInstance().origin, instances: this.store.home.instances() });
    const registry = this.registryAt(target.origin, target.scope).source;
    const needsResolve = mode === "resolve" || (mode === "auto" && lock === null && read !== null);
    if (needsResolve && read !== null) {
      step("resolving");
      let result: Awaited<ReturnType<typeof resolve>>;
      try {
        result = await resolve({
          requests: read.requests, requestsText: read.text, registry, pathRoot, confined: this.isOwn(key), git: this.git, gitCredential: envGit.credential,
          // A package resolving to the release its lock records keeps the
          // registry recorded there (environments-5).
          ...(locked ? { previous: locked.lock } : {}),
        });
      } catch (error) {
        const changed = this.changedSince(requestsPath, read.version, lockPath, lockVersion);
        if (changed) return this.overtaken(changed, strict);
        state.error = this.failure("resolve", error, envGit, read?.requests);
        if (strict) throw new CoreError("invalid_request", state.error);
        return;
      }
      if (!result.ok) {
        // A no-solution found for files changed since is no outcome.
        const changed = this.changedSince(requestsPath, read.version, lockPath, lockVersion);
        if (changed) return this.overtaken(changed, strict);
        state.conflicts = { requests: read.version, conflicts: result.conflicts };
        state.error = !target.legacy && (await this.tokenAt(target.origin, "registry")) === null ? i18n._("Sign in to registry to use private packages.") : null;
        if (strict) throw new CoreError("invalid_request", this.conflictPhrase(this.shownConflicts(result.conflicts, read.requests, envGit)));
        return;
      }
      // The lock is written only while `spex.yaml` stands as resolved and
      // the lock as read, both checked at the instant of the write.
      try {
        if (fileVersion(requestsPath) !== read.version) throw new VersionConflictError(requestsPath);
        lockVersion = sha256(await writeLock(lockPath, result.lock, lockVersion));
      } catch (error) {
        if (error instanceof VersionConflictError) return this.overtaken(error, strict);
        state.error = this.failure("resolve", error, envGit, read?.requests);
        if (strict) throw new CoreError("invalid_request", state.error);
        return;
      }
      if (progress) progress.lockWritten = true;
      if (!this.changedSince(requestsPath, read.version, lockPath, lockVersion)) state.conflicts = null;
      lock = result.lock;
    }
    if (lock === null) return;
    // This version of the lock is the one an install was last attempted
    // from: a use's read installs only a lock other than it
    // (environments-26), so a failing install is not retried by a read.
    state.usedLock = lockVersion;
    step("installing");
    let obsolete: VersionConflictError | null = null;
    try {
      const report = await install({
        root,
        lock,
        lockVersion,
        store: this.contentStore,
        cache: this.cacheDir,
        registry,
        registries: (source) => this.installRegistries(target, source),
        seed: this.builtinSource(),
        git: this.git,
        gitCredential: envGit.credential,
        pathRoot,
        confined: this.isOwn(key),
        requestsText: read?.text ?? null,
        engine: installEngine(this.options.modulePaths),
      });
      if (progress && report.installed.length > 0) progress.installed = true;
      // A module kept carrying the engine it was bundled with runs on
      // that engine, not the app's: the install says so and goes on
      // (playbook-library-46).
      for (const kept of report.engineKept) console.error(`spex: ${kept.module} keeps the playbook engine it was bundled with: ${kept.reason}`);
      // A stale lock installs nothing and exports nothing: the state's
      // stale phrases say resolving again is needed (environments-7),
      // and an awaiting caller is refused with them.
      if (report.stale) {
        // A stale report on files changed since is no outcome either.
        const changed = this.changedSince(requestsPath, read?.version ?? null, lockPath, lockVersion);
        if (changed) return this.overtaken(changed, strict);
        state.error = null;
        if (strict) {
          let current: string | null = null;
          try { current = readRequestsAt(requestsPath)?.text ?? null; } catch { /* unreadable reads as changed */ }
          throw new CoreError("invalid_request", failurePhrase("install", new Error(listed(stalePhrases(lock, current, pathRoot) ?? report.stale))));
        }
        return;
      }
      // Exports derive from the installed tree and its lock: written only
      // while both still stand as this install left them, so no export
      // mixes two locks (environments-8).
      if (fileVersion(lockPath) !== lockVersion) throw new VersionConflictError(lockPath);
      if (!this.installedWhole(root, lock)) throw new VersionConflictError(installedDir(root));
      const exportedTo = this.workingFolder(key);
      const exported = await this.exportNow(root, key, lock, exportedTo);
      this.removeFormerTrees(dir, root);
      state.unexported = exported.skipped.length > 0 || exported.missing.length > 0
        ? { folder: exportedTo, skipped: exported.skipped, missing: exported.missing }
        : null;
      // A success clears a failure only while its files still stand as
      // it read and wrote them; its exports stand either way.
      obsolete = this.changedSince(requestsPath, read?.version ?? null, lockPath, lockVersion);
      if (!obsolete) state.error = null;
    } catch (error) {
      // The stale lock's refusal above is the strict caller's reply alone.
      if (error instanceof CoreError) throw error;
      if (error instanceof VersionConflictError) return this.overtaken(error, strict);
      const changed = this.changedSince(requestsPath, read?.version ?? null, lockPath, lockVersion);
      if (changed) return this.overtaken(changed, strict);
      state.error = this.failure("install", error, envGit, read?.requests);
      if (strict) throw new CoreError("invalid_request", state.error);
      return;
    }
    this.options.changed?.(key);
    if (obsolete) this.overtaken(obsolete, strict);
  }

  /** Every registry and Git source of a lock installed as it locks it
   * under the root's `.spex/`. */
  private installedWhole(root: string, lock: Lock): boolean {
    const installed = installedPackages(root, lock);
    return Object.entries(lock.packages).every(([name, resolution]) => isPathSource(resolution.source) || installed.has(name));
  }

  /** Export the installed environment into its root's `.spex/skills/`,
   * its working folder and, for your own group, your agents' home folders
   * (environments-8). */
  private exportNow(root: string, key: string, lock: Lock, workingFolder: string | null): Promise<ExportReport> {
    return exportEnvironment({
      root,
      lock,
      workingFolder,
      pathRoot: this.pathRoot(key),
      userHome: this.isOwn(key) ? this.options.userHome : null,
      agents: this.agents(),
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

  /** The refusal a request earns before any write (environments-15),
   * a request by path in your own group's environment checked against
   * what stands at its path in the clone (environments-32). */
  private async refuseRequest(key: string, name: string, request: Request): Promise<void> {
    const issues = requestIssues(name, request);
    if (issues.length > 0) throw new CoreError("invalid_request", listed(issues.map((issue) => issue.message)));
    if (!isPathRequest(request)) return;
    const root = this.pathRoot(key);
    if (root === null) {
      throw new CoreError("invalid_request", i18n._({
        id: "{name} is requested by path, and this spex repository has no working folder on this device",
        comment: "Refusal: a request by path needs the repository's working folder here",
        values: { name },
      }));
    }
    const own = this.isOwn(key);
    const inside = relative(resolvePath(root), resolvePath(root, request.path));
    if (!isInsidePath(request.path) || inside.startsWith("..") || isAbsolute(inside)) throw this.outside(request.path, own);
    if (!own) return;
    let issue = ownPathIssue(root, request.path);
    // A folder standing there already is checked whole, its release's
    // files where it holds one.
    const folder = resolvePath(root, request.path);
    if (!issue && isDirectory(folder)) {
      const files = existsSync(join(folder, "meta.yaml")) ? (await listReleaseFiles(folder)).files.map((file) => file.path) : [];
      issue = ownFolderIssue(root, request.path, files);
    }
    if (issue) throw new CoreError("invalid_request", confinedPhrase(request.path, issue));
  }

  /** A path that leads out of the folder requests by path are relative to. */
  private outside(path: string, own: boolean): CoreError {
    return new CoreError("invalid_request", own
      ? i18n._({
        id: "{path} is outside your own group's clone",
        comment: "Refusal: a request by path in your own group's environment names a folder outside its spex repository's clone",
        values: { path },
      })
      : i18n._({
        id: "{path} is outside the working folder",
        comment: "Refusal: a request by path names a folder outside the repository's working folder",
        values: { path },
      }));
  }

  /** Write `spex.yaml` under the version read, its refusals as replies:
   * the edit's own, or a conflict where the file changed meanwhile or
   * the clone is gone. */
  private async writeRequest(key: string, root: string, name: string, request: Request | null): Promise<void> {
    // Preflight is read-only and may outlive stop; admit and track only
    // the actual write so shutdown cannot finish while it still runs.
    if (this.stopped) throw stoppingError();
    await this.run(key, async () => {
      try { await setRequest(join(root, "spex.yaml"), name, request); }
      catch (error) {
        if (error instanceof RequestsError) throw new CoreError("invalid_request", listed(error.issues.map((issue) => issue.message)));
        if (error instanceof VersionConflictError) throw conflictError(error);
        throw error;
      }
    });
  }

  /** `environment.request` (environments-15): refused before any write;
   * written; then resolved and installed, the outcome broadcast. The
   * returned promise settles once installed; the reply does not wait. */
  async request(key: string, name: string, request: Request, strict = false): Promise<{ done: Promise<void> }> {
    if (strict && this.stopped) throw stoppingError();
    const { root } = this.environmentOf(key);
    await this.refuseRequest(key, name, request);
    await this.writeRequest(key, root, name, request);
    this.announce(key);
    return { done: this.settle(key, "resolve", strict) };
  }

  /** `environment.remove` (environments-15). */
  async remove(key: string, name: string, strict = false): Promise<{ done: Promise<void> }> {
    if (strict && this.stopped) throw stoppingError();
    const { root } = this.environmentOf(key);
    const current = readRequestsAt(join(root, "spex.yaml"));
    if (!current?.requests.packages[name]) {
      throw new CoreError("invalid_request", i18n._({
        id: "{name} is not requested here",
        comment: "Refusal: removing a spec package this environment does not request",
        values: { name },
      }));
    }
    await this.writeRequest(key, root, name, null);
    this.announce(key);
    return { done: this.settle(key, "resolve", strict) };
  }

  /** Request a spec package unless it is requested so already: the
   * enabling path's first write (playbook-library-69). Returns whether
   * `spex.yaml` was written. */
  async ensureRequested(key: string, name: string, request: Request): Promise<boolean> {
    if (this.stopped) throw stoppingError();
    const { root } = this.environmentOf(key);
    await this.refuseRequest(key, name, request);
    let current: Request | undefined;
    try { current = readRequestsAt(join(root, "spex.yaml"))?.requests.packages[name]; }
    catch (error) { throw new CoreError("invalid_request", failurePhrase("resolve", error)); }
    if (current !== undefined && toRequestValue(current) === toRequestValue(request)) return false;
    await this.writeRequest(key, root, name, request);
    this.announce(key);
    return true;
  }

  /** Resolve where the requests changed or no current lock stands, and
   * install, awaited, every failure thrown: the enabling path writes no
   * config before the module is there (playbook-library-69). What it
   * wrote before a failure stands, recorded in `progress`. */
  async installNow(key: string, requested: boolean, progress: SettleProgress): Promise<void> {
    this.cloneDir(key);
    const root = this.rootOf(key);
    let stale: string[] | null = ["none"];
    try {
      const lock = root === null ? null : readLockSync(join(root, "spex.lock"));
      if (lock) stale = stalePhrases(lock, readRequestsAt(join(root!, "spex.yaml"))?.text ?? null, this.pathRoot(key));
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
    const root = this.rootOf(key);
    if (!dir || root === null) return false;
    try {
      const read = readRequestsAt(join(root, "spex.yaml"));
      if (read === null) return false;
      const lock = readLockSync(join(root, "spex.lock"));
      if (lock === null) return true;
      if (stalePhrases(lock, read.text, this.pathRoot(key))) return false;
      return !this.installedWhole(root, lock);
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
  resolveLater(key: string, strict = false): Promise<void> {
    this.environmentOf(key);
    return this.settle(key, "resolve", strict);
  }

  /** `environment.install` (environments-7). */
  installLater(key: string, strict = false): Promise<void> {
    this.environmentOf(key);
    return this.settle(key, "install", strict);
  }

  /** A use's read (environments-26, environments-7): `environment.get`
   * finding a lock other than the one installed under the root's
   * `.spex/` — none installed yet, as in a home of the former layout or
   * a working folder this device never installed into, or a tree of
   * another lock, as a hand edit or a Git checkout leaves — installs it
   * from the lock, resolving first where no lock stands (environments-5),
   * unless an install was already attempted from that version of the
   * lock, so a failing install is not retried by every read; it reports
   * through state. A stale lock installs nothing (environments-7). */
  use(key: string): void {
    if (this.migrationBlocked.has(key)) return;
    const root = this.rootOf(key);
    if (!this.store.repository(key) || root === null) return;
    if (this.clones.get(key)?.running.size || !this.needsSettle(key)) return;
    const state = this.cloneState(key);
    const version = fileVersion(join(root, "spex.lock"));
    if (state.usedLock === version) return;
    // With no lock, a read resolves once until a lock stands.
    if (version === null) state.usedLock = null;
    void this.settle(key, "auto", false).catch(() => {});
  }

  /** Prepare the playbook artifact folders of the environments a session
   * or a configuration load reads — the project's and your own group's —
   * to run on the app's engine before their module locations reach the
   * launcher (environments-7, environments-9, playbook-library-46), so a
   * playbook another host installed runs. It fails nothing. */
  async prepareForUse(projectKey: string | null): Promise<void> {
    const own = this.store.home.own();
    const keys = [...new Set([...(projectKey !== null ? [projectKey] : []), own])];
    for (const key of keys) {
      if (this.migrationBlocked.has(key)) continue;
      const root = this.rootOf(key);
      const lock = this.lockOf(key);
      if (root === null || lock === null) continue;
      try {
        const kept = await prepareEnvironment({ root, lock, pathRoot: this.pathRoot(key), confined: this.isOwn(key), engine: installEngine(this.options.modulePaths) });
        for (const entry of kept) console.error(`spex: ${entry.module} keeps the playbook engine it was bundled with: ${entry.reason}`);
      } catch (error) {
        console.error(`spex: the playbooks of ${key} were not prepared for the app's engine: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /** A sync applied a lock (environments-8, environments-17): install
   * from it and export, broadcasting the state. */
  applied(key: string): Promise<void> {
    if (!this.store.repository(key)) return Promise.resolve();
    return this.settle(key, "auto", false);
  }

  /** A working folder was paired with a clone this device holds
   * (environments-31, storage-6): the environment the clone still holds
   * moves into the folder (storage-24); a folder then holding no
   * `spex.yaml` is written the new environment requesting the built-in
   * spec package, locked at its environment's registry where no lock
   * stands, a stray lock left to the reader — stale, resolved again on
   * request; unreadable, refused until removed (environments-11),
   * while one holding its own is installed from it, nothing but `.spex/`
   * written (environments-26); its environment is then exported into the
   * folder as an install does (environments-7), its state broadcast. */
  paired(key: string): Promise<void> {
    if (!this.store.repository(key)) return Promise.resolve();
    this.migrate(key);
    if (this.migrationBlocked.has(key)) return Promise.resolve();
    const root = this.rootOf(key);
    if (root === null) return Promise.resolve();
    let wrote = false;
    if (!existsSync(join(root, "spex.yaml"))) {
      try { wrote = this.prepare(root, key); }
      catch (error) { console.error(`spex: ${key} does not request the built-in spec package: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return this.settle(key, wrote && !existsSync(join(root, "spex.lock")) ? "resolve" : "auto", false);
  }

  /** A pick placed a local-only project's clone at an instance
   * (storage-35): where its environment is still the one its pairing
   * prepared at the default instance's registry, the built-in spec
   * package is locked at that instance's instead, then installed as the
   * lock now records it (environments-11, DR-127); a lock resolved to
   * anything else stays as it is (environments-5). */
  placed(key: string): Promise<void> {
    if (this.migrationBlocked.has(key)) return Promise.resolve();
    const dir = this.rootOf(key);
    if (!this.store.repository(key) || dir === null || this.stopped) return Promise.resolve();
    const placed = this.options.placedAt(key);
    try {
      const path = join(dir, "spex.yaml");
      const read = readRequestsAt(path);
      if (read?.requests.registry !== undefined) {
        // Collaboration changes its own binding, not any package pin.
        // Advance a previously current lock's digest only; never bless
        // a lock already stale before this Space-only edit.
        if (placed !== null && read.requests.space !== canonicalOrigin(placed)) {
          const doc = parseDocument(read.text);
          setSpaceIn(doc, canonicalOrigin(placed));
          const next = doc.toString({ lineWidth: 0 });
          parseRequests(next);
          const lockPath = join(dir, "spex.lock");
          let held: ReturnType<typeof readVersioned> | undefined;
          let wasCurrent = false;
          try {
            held = readVersioned(lockPath);
            wasCurrent = held.bytes !== null && parseLock(held.bytes.toString("utf8")).requests === requestsDigest(read.text);
          } catch { /* A damaged or unreadable package lock cannot block collaboration. */ }
          writeVersionedBytes(path, next, read.version);
          if (wasCurrent && held?.bytes) {
            try {
              const lockDoc = parseDocument(held.bytes.toString("utf8"));
              lockDoc.set("requests", requestsDigest(next));
              const nextLock = lockDoc.toString({ lineWidth: 0 });
              parseLock(nextLock);
              writeVersionedBytes(lockPath, nextLock, held.version);
            } catch (error) {
              if (!(error instanceof VersionConflictError)) console.error(`spex: ${key} could not advance its package lock digest: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
          this.announce(key);
        }
        return Promise.resolve();
      }
    } catch (error) {
      if (!(error instanceof VersionConflictError)) console.error(`spex: ${key} keeps its environment's Space binding: ${error instanceof Error ? error.message : String(error)}`);
      return Promise.resolve();
    }
    if (!this.options.builtin) return Promise.resolve();
    let wrote = false;
    try { wrote = rehomeBuiltinLock(dir, this.options.builtin, placed ?? this.defaultOrigin(), this.spaceOf(placed)); }
    catch (error) { console.error(`spex: ${key} keeps its built-in spec package's lock: ${error instanceof Error ? error.message : String(error)}`); }
    return wrote ? this.settle(key, "auto", false) : Promise.resolve();
  }

  /** A clone moved: its report follows, and it is exported again. An
   * operation still running at the old address finds its files gone and
   * writes nothing there. */
  moved(oldKey: string, newKey: string): Promise<void> {
    if (this.migrationBlocked.delete(oldKey)) this.migrationBlocked.add(newKey);
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

  /** The folder a publish of `name` reads (environments-10): the
   * folder of the environment's request by path for that name where it
   * has one, else `spex-packages/<org>/<pkg>/` under the path root. */
  private publishFolder(requests: Requests | null, name: string): string {
    const request = requests?.packages[name];
    return request !== undefined && isPathRequest(request) ? request.path : `spex-packages/${name}`;
  }

  /** `environment.publish` by name (environments-10): its folder — the
   * environment's request by path for that name, else
   * `spex-packages/<org>/<pkg>/` — read and checked as a release of that
   * name and the sign-in at its target confirmed before the reply; the
   * upload runs after it. The target is the registry of the
   * environment's instance, uploaded to as that instance's account
   * (environments-10, environments-17, DR-127, DR-165). */
  async publish(key: string, name: string, dryRun = false, strict = false): Promise<{ done: Promise<PublishedPackage | undefined>; preview: PublishPreview }> {
    if (strict && this.stopped) throw stoppingError();
    this.cloneDir(key);
    const root = this.pathRoot(key);
    if (root === null) {
      throw new CoreError("invalid_request", i18n._({
        id: "{key} has no working folder on this device",
        comment: "Refusal: publishing reads a folder inside the repository's working folder",
        values: { key },
      }));
    }
    if (!isPackageName(name)) {
      throw new CoreError("invalid_request", i18n._({
        id: "{name} is not an org/pkg name",
        comment: "Refusal: a publish names its spec package as org/pkg, both lowercase kebab-case; {name} is what it named",
        values: { name },
      }));
    }
    // The environment's requests name the folder and the instance, read
    // once; a `spex.yaml` that does not read refuses the publish
    // (environments-2, environments-10).
    const requests = this.requestsOf(key);
    const path = this.publishFolder(requests, name);
    const folder = resolvePath(root, path);
    const inside = relative(resolvePath(root), folder);
    if (inside === "" || inside.startsWith("..") || isAbsolute(inside) || inside.split(sep).includes("..")) throw this.outside(path, this.isOwn(key));
    // Signed in at the target means holding a token its host has not
    // refused; a host that cannot be reached now fails the upload,
    // reported with its cause, rather than reading as signed out.
    if (!isDirectory(folder)) {
      throw new CoreError("invalid_request", i18n._({
        id: "No folder holds {name}: {path} is not there",
        comment: "Refusal: a publish names a spec package with no folder; {path} is where its folder would stand, its request's path or spex-packages/<org>/<pkg>",
        values: { name, path },
      }));
    }
    const selected = this.registryOf(key);
    const target = this.registryAt(selected.origin, "registry");
    if (!dryRun && (await this.tokenAt(target.origin, "registry").catch(() => "")) === null) {
      throw new CoreError("invalid_request", i18n._({
        id: "Sign in to registry to publish at {name}",
        comment: "Refusal: publishing needs the home signed in at the instance the publish goes to; {name} is that instance's display name as last read, else its host name",
        values: { name: this.options.instanceName(target.origin) },
      }));
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
    // The folder holds the package the publish names, or it is refused
    // naming both (environments-10).
    const held = `${manifest.org}/${manifest.name}`;
    if (held !== name) {
      throw new CoreError("invalid_request", i18n._({
        id: "{path} holds {held}, not {name}",
        comment: "Refusal: the folder a publish of {name} reads holds another spec package, {held}, by its meta.yaml",
        values: { path, held, name },
      }));
    }
    // The registry refuses a release lacking a field it requires; the
    // core says so first, naming it, the preview included
    // (environments-10).
    const missing = publishIssues(manifest);
    if (missing.length > 0) {
      throw new CoreError("invalid_request", i18n._({
        id: "{path} cannot be published: {issues}",
        comment: "Refusal: the manifest lacks a field the registry requires to publish; {issues} name each field in the checks' own words",
        values: { path, issues: listed(missing.map((issue) => `${issue.path}: ${issue.message}`)) },
      }));
    }
    // What the upload would hold: the declared release files, in the
    // archive's order (playbook-library-93).
    const preview: PublishPreview = { instance: { origin: target.origin, name: this.options.instanceName(target.origin) }, name: `${manifest.org}/${manifest.name}`, version: manifest.version, files: [...files].sort() };
    if (dryRun) return { done: Promise.resolve(undefined), preview };
    if (this.stopped) throw stoppingError();
    const done = this.run(key, async (step) => {
      const state = this.cloneState(key);
      step("publishing");
      try {
        const published = await publishRelease(target.source, folder);
        const receipt: PublishedPackage = { instance: preview.instance, name: published.name, version: published.version, url: `${target.origin}/${published.name}` };
        state.published = { name: receipt.name, version: receipt.version, url: receipt.url };
        state.error = null;
        return receipt;
      } catch (error) {
        state.error = failurePhrase("publish", error);
        if (strict) throw new CoreError("invalid_request", state.error);
        return undefined;
      }
    });
    return { done, preview };
  }

  /** `environment.search` through the registry of the named spex
   * repository's environment: its instance's, else the default
   * instance's, with that instance's token where the home is signed in
   * there (environments-17, environments-5, environments-12); a key
   * naming no clone on this device is refused first. */
  async search(key: string, query: string): Promise<{ name: string; description: string | null; versions: string[] }[]> {
    const target = this.registryOf(key);
    try {
      const results = await this.registryAt(target.origin, target.scope).source.search(query);
      return results.map((result) => ({ name: result.name, description: result.description || null, versions: result.versions }));
    } catch (error) {
      throw new CoreError("invalid_request", error instanceof Error ? error.message : String(error));
    }
  }

  // -- reads (environments-14) ------------------------------------------------

  /** The environment's lock at its root, where one reads. */
  lockOf(key: string): Lock | null {
    const root = this.lockFile(key);
    if (root === null) return null;
    try { return readLockSync(root); } catch { return null; }
  }

  /** The environment's `spex.lock` on this device (environments-26):
   * at its root; none while this device holds no root for it. */
  lockFile(key: string): string | null {
    const root = this.store.repository(key) ? this.rootOf(key) : null;
    return root === null ? null : join(root, "spex.lock");
  }

  /** An applet a spex repository's environment installs (applets-3,
   * DR-161): the first spec package of its lock, by name, that selects
   * an applet of that id — the one artifact kind a lock records with no
   * language (environments-3) — with its version and its folder on this
   * device: the installed copy under the root's `.spex/packages/`, or a path
   * source's folder where its path resolves (environments-2); `present`
   * where that folder stands, installed as the lock locks it
   * (environments-14). Undefined where the lock selects no such applet;
   * an unknown repository is refused `not_found`. */
  applet(key: string, id: string): InstalledApplet | undefined {
    this.cloneDir(key);
    const lock = this.lockOf(key);
    if (!lock) return undefined;
    const pathRoot = this.pathRoot(key);
    const envRoot = this.rootOf(key);
    for (const name of Object.keys(lock.packages).sort()) {
      const resolution = lock.packages[name]!;
      if (resolution.artifacts[id]?.language !== null) continue;
      const root = isPathSource(resolution.source) || envRoot !== null ? packageRoot(name, resolution, installedDir(envRoot ?? ""), pathRoot) : null;
      const folder = root === null ? null : join(root, "applets", id);
      const standing = folder !== null && isDirectory(folder);
      const present = standing && (isPathSource(resolution.source) || (envRoot !== null && installedPackages(envRoot, lock).has(name)));
      let version = resolutionVersion(resolution) ?? null;
      if (version === null && root !== null && existsSync(join(root, "meta.yaml"))) {
        try { version = parseManifestText(readFileSync(join(root, "meta.yaml"), "utf8")).manifest?.version ?? null; } catch { version = null; }
      }
      return { package: name, version, dir: folder, present };
    }
    return undefined;
  }

  /** Each playbook a clone's environment exports, by exported name. */
  locations(key: string): Map<string, ModuleLocation> {
    const root = this.rootOf(key);
    const lock = this.lockOf(key);
    if (root === null || !lock) return new Map();
    const locations = moduleLocations(lock, root, this.pathRoot(key));
    const installed = installedPackages(root, lock);
    for (const location of locations.values()) {
      if (!isPathSource(lock.packages[location.package]!.source) && !installed.has(location.package)) location.present = false;
    }
    return locations;
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

  /** The requests by path, name to path, of a clone: each relative to
   * its path root (environments-2). */
  pathRequests(key: string): Map<string, string> {
    const out = new Map<string, string>();
    const root = this.store.repository(key) ? this.rootOf(key) : null;
    if (root === null) return out;
    try {
      const requests = readRequestsAt(join(root, "spex.yaml"))?.requests;
      for (const [name, request] of Object.entries(requests?.packages ?? {})) if (isPathRequest(request)) out.set(name, request.path);
    } catch { /* an unreadable file requests nothing here */ }
    return out;
  }

  /** `environment.get`: the environment as the Playbooks surface lists
   * it, read from its files; the conflicts shown only while `spex.yaml`
   * still stands as the resolution that found them read it. */
  state(key: string): EnvironmentState {
    this.cloneDir(key);
    const clone = this.cloneState(key);
    const envRoot = this.rootOf(key);
    const pathRoot = this.pathRoot(key);
    let requests: Requests | null = null;
    let requestsText: string | null = null;
    let requestsVersion: FileVersion | undefined;
    let error = clone.error;
    let instance: string | null = null;
    let registry: EnvironmentState["registry"];
    try {
      const read = envRoot === null ? null : readRequestsAt(join(envRoot, "spex.yaml"));
      requests = read?.requests ?? null;
      requestsText = read?.text ?? null;
      requestsVersion = read?.version ?? null;
      instance = envRoot === null ? null : this.instanceOfRequests(requests);
      const selected = environmentRegistry(requests, { origin: this.store.home.defaultInstance().origin, instances: this.store.home.instances() });
      registry = { origin: selected.origin, legacy: selected.legacy };
    } catch (cause) {
      error = failurePhrase("resolve", cause);
    }
    // A Git source's labels name an instance, the environment's own
    // preferred, read only where one is shown (environments-29).
    const envGit = this.gitOf(key, requests);
    let lock: Lock | null = null;
    try { lock = envRoot === null ? null : readLockSync(join(envRoot, "spex.lock")); }
    catch (cause) { error = failurePhrase("install", cause); }
    const installedNames = lock && envRoot !== null ? installedPackages(envRoot, lock) : new Set<string>();
    const conflicts = clone.conflicts !== null && clone.conflicts.requests === requestsVersion ? clone.conflicts.conflicts : null;
    const packages: EnvironmentPackage[] = [];
    for (const name of Object.keys(lock?.packages ?? {}).sort()) {
      const resolution = lock!.packages[name]!;
      const source = resolution.source;
      const pathSource = isPathSource(source);
      const root = pathSource
        ? (pathRoot === null ? null : join(pathRoot, ...source.path.split("/")))
        : envRoot === null ? null : join(installedDir(envRoot), ...name.split("/"));
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
        // A lock records an applet alone with no language (environments-3):
        // a path source missing here keeps its applet's kind.
        if (resolution.artifacts[id]?.language === null) return "applet";
        return "playbook";
      };
      const builtin = name === BUILTIN_PACKAGE_NAME && isRegistrySource(source);
      packages.push({
        name,
        version: resolutionVersion(resolution) ?? manifest?.version ?? null,
        source: isRegistrySource(source)
          ? { kind: builtin ? "builtin" : "registry", detail: source.registry }
          : isGitSource(source)
            ? { kind: "git", detail: `${envGit.label(source.git)} ${source.commit.slice(0, 12)}${source.path ? ` ${source.path}` : ""}` }
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
    const requestMap: Record<string, EnvironmentRequestSummary> = {};
    for (const [name, request] of Object.entries(requests?.packages ?? {})) requestMap[name] = requestOf(request, envGit.label);
    const builtinUpdate = this.builtinUpdate(requests, lock);
    // What an export left out describes the folder it exported into, so
    // a folder paired since lists none of it (environments-14).
    const unexported = clone.unexported !== null && clone.unexported.folder === this.workingFolder(key)
      ? { skipped: clone.unexported.skipped.map((entry) => ({ ...entry })), missing: [...clone.unexported.missing] }
      : null;
    return {
      repository: key,
      language: requests?.language ?? null,
      requests: requestMap,
      packages,
      stale: lock ? stalePhrases(lock, requestsText, pathRoot) : null,
      conflicts: conflicts ? this.shownConflicts(conflicts, requests, envGit) : null,
      busy: this.busyOf(key),
      error,
      published: clone.published ? { ...clone.published } : null,
      pathRoot,
      instance,
      ...(registry ? { registry } : {}),
      // A project's files travel with the code once both are committed;
      // null where this device holds no working folder to read, as for
      // your own group's (environments-14).
      committed: this.isOwn(key) || envRoot === null ? null : committedWithCode(envRoot),
      ...(builtinUpdate ? { builtinUpdate } : {}),
      ...(unexported ? { unexported } : {}),
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

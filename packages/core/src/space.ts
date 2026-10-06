// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups' core (DR-103, DR-057): every spex repository on this device
// with its sync machine — one per clone, any number at once (space-31) —
// its three-way unit plan with human labels (space-33, space-34), its
// write gate beneath the clone (space-21), the validated apply that
// never runs `git merge` (space-19), the refresh that re-indexes the
// running core (space-20), and the read-only explorer (space-35).

import { randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, type Dirent } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { type StorageDiagnostic } from "./app-storage.js";
import { readJsonFile, StorageFormatError, UUID, writeApplicationFile } from "./files.js";
import { withGitCredential, type GitCredentialHandle } from "./git-credential.js";
import { HostError, SignInBusyError, type BrowserSignIn, type DeviceSignIn, type GitHostClient, type HostAccount, type HostRepository } from "./git-host.js";
import { kebab, splitKey } from "./home.js";
import { i18n } from "./i18n.js";
import type {
  GroupsState,
  RepositoryState,
  SpaceChange,
  SpaceChoice,
  SpaceConflict,
  SpaceEntry,
  SpaceOp,
  SpaceReadResult,
  SpaceSide,
  SpaceSyncPhase,
  SpaceUnit,
  SpaceUnitKind,
  SyncStep,
} from "./protocol.js";
import { CoreError } from "./session.js";
import {
  classifyHostTransportFailure, classifyTransportFailure, displayRemote, GitMissingError, lastLines, membersDecide, noLongerShared,
  signInAgain, SpaceGit, validateRemoteUrl, type GitFailure, type GitRun,
} from "./space-git.js";
import {
  callbackPages, hostKey, listingFor, nameTaken, ownNameFor, readHostView, relayHostError, repositoryDescription, signInFailure,
  underOrigin, userGroup, waitingPhrase, type HostListing, type HostView,
} from "./space-groups.js";
import {
  APPLY_MARKER,
  applyStorageSelection,
  EMPTY_TREE,
  planStorageUnits,
  portable,
  prepareStorageGitFiles,
  readStorageTree,
  resolveStorageChoices,
  SPEX_BRANCH,
  storageUnitName,
  UPLOAD_STAGING,
  validateStorageTree,
  type StorageChoice,
  type StorageMergeUnit,
  type StorageTree,
  type StorageTrees,
} from "./storage-git.js";
import { prefsFileOf, type SpexRepository, type Store } from "./store.js";
import { foldTurnEvent } from "./stream-fold.js";

/** What the core lends the Groups engine: the home, its indexes, the
 * admission facts only the service knows, and the hooks a refresh
 * needs to re-index the running core (space-20). */
export interface SpaceHost {
  home: string;
  env: NodeJS.ProcessEnv;
  store: Store;
  /** The home's compiled-playbook library, for config validation. */
  libraryDir: string;
  /** Migration, storage and session diagnostics (core-service-86). */
  diagnostics: () => StorageDiagnostic[];
  /** What the core found about the folders each repair names, and the
   * one it proposes (space-53): checked, never searched for. */
  checkRepairs: (diagnostics: StorageDiagnostic[]) => Promise<StorageDiagnostic[]>;
  /** The named blocker of space-11 beneath one clone — a turn in flight,
   * a session held elsewhere, a compile — or undefined when it is quiet. */
  blocker: (repository: string) => Promise<string | undefined>;
  broadcast: (state: GroupsState) => void;
  pauseWatchers: (repository: string) => void;
  resumeWatchers: (repository: string) => void;
  reloadConfig: () => Promise<void>;
  /** One full rescan of a clone's sessions: history-replaced,
   * session.state, session.removed and intents.changed as a foreign-host
   * rescan announces them (core-service-60, core-service-87). */
  rescanSessions: (repository: string) => Promise<void>;
  ledgerChanged: (projectIds: string[]) => void;
  /** Test seam (space-32): the transport limit; 120 s by default. */
  transportTimeoutMs?: number;
  /** Test seam: awaited before each step runs, so a suite can act
   * between steps deterministically. */
  beforeStep?: (event: { op: SpaceOp; step: SyncStep; repository: string }) => void | Promise<void>;
  /** The Git host's client (git-host-1..11): the one this home signs in
   * to and reads. */
  client: GitHostClient;
  /** The sign-in flow this deployment runs: the browser flow on the
   * desktop (git-host-2), the device flow on the server (git-host-3). */
  signInFlow: "browser" | "device";
  /** The runtime the credential helper runs on (git-host-9). */
  hostRuntime: { execPath: string; electron: boolean };
  /** Clones appeared under `workspace/` — a join's (space-63): the core
   * watches their sessions and re-reads their authoring sessions. */
  repositoriesChanged: () => void;
  /** Clones moved under `workspace/` (space-59, space-60), the store
   * already re-keyed: the core re-points what it holds by key or path. */
  repositoriesMoved?: (moves: { from: string; to: string }[]) => Promise<void>;
  /** The environment's exports beneath a moved clone are rewritten
   * (space-60): the `.git/info/exclude` blocks naming its paths. */
  environmentMoved?: (oldKey: string, newKey: string) => void | Promise<void>;
}

/** What a spex repository's clone says of its host: its origin URL and
 * the host's id recorded beside it (git-host-5). */
interface CloneFacts { remote: string | null; id: string | null }

/** A step at the host waiting for a member with the rights (space-64). */
interface Waiting {
  step: "create" | "branch";
  group: string;
  message: string;
  /** What a creation asks again at the next read. */
  create?: { groupId: string | null; name: string; description: string };
}

const KIND_ORDER: SpaceUnitKind[] = ["session", "intent", "authoring", "environment", "settings", "code", "rules", "other"];
const WITHHELD_FAMILIES = new Set(["provider hints", "config backup"]);
const READ_CAP_BYTES = 256 * 1024;
const READ_CAP_LINES = 2_000;
const DIFF_CAP_BYTES = 256 * 1024;
const TEXT_EXTENSIONS = /\.(?:json|jsonl|ya?ml|md|txt|ts|mts|cts|js|mjs|cjs|log|toml|ini|cfg|csv|gitignore|gitattributes|lock)$/i;
const AUTHORING_ID = /^[a-z0-9][a-z0-9_-]*$/;

// The reader's own words are composed where they are read, never held
// in a constant a module's first evaluation would freeze in whichever
// language was current then (core-service-111).

/** Why a file of a withheld family is shown without its text (space-35). */
const withheldReason = (): string => i18n._({
  id: "May hold provider tokens — not shown",
  comment: "Why the explorer offers no preview of a file that may hold a provider's secret",
});

/** The refusal every act meets before a clone is a repository. */
const initializeFirst = (): string => i18n._({
  id: "Initialize the repository first",
  comment: "Refusal: the home is not a Git repository yet",
});

/** The refusal of an act at the Git host while the home is signed out
 * (space-11). */
const signInFirst = (): string => i18n._({
  id: "Sign in first",
  comment: "Refusal: the act needs the Git host, and the home is not signed in",
});

/** Guidance under a stop the host's sign-in answers (space-15). */
const signInThenRetry = (): string => i18n._({
  id: "Sign in from the header, then Retry.",
  comment: "Guidance where the Git host asked this device to sign in again",
});

/** A second sign-in while one runs (git-host-2). */
const signInRunning = (): string => i18n._({
  id: "A sign-in is already running",
  comment: "Refusal of a second sign-in while one runs",
});

/** Guidance under a step stopped for a reason the app does not classify. */
const retryGuidance = (): string => i18n._({
  id: "Retry; if it fails again, run the step in a terminal for detail.",
  comment: "Guidance under a step that stopped for a reason the app does not classify",
});

/** Guidance where the host no longer lists a spex repository (space-15). */
const nothingDeleted = (): string => i18n._({
  id: "Nothing on this device was deleted.",
  comment: "Guidance where the Git host no longer lists a spex repository for this account",
});

/** Guidance under a step the host left waiting (space-64). */
const syncLater = (): string => i18n._({
  id: "It is asked again at the next sync.",
  comment: "Guidance under a sync stopped because a step at the Git host waits for a member with the rights",
});

/** A failure of a call to the host as the stopped state of space-15. */
function hostStop(step: SyncStep, error: unknown, host: string): SpaceStopped {
  const message = relayHostError(error, host);
  if (!(error instanceof HostError)) return new SpaceStopped(step, { cause: "git", message: lastLines(message), guidance: retryGuidance(), retry: true });
  switch (error.kind) {
    case "reauth":
      return new SpaceStopped(step, { cause: "reauth", message, guidance: signInThenRetry(), retry: true });
    case "not_found":
      return new SpaceStopped(step, { cause: "gone", message, guidance: nothingDeleted(), retry: true });
    case "unreachable":
    case "rate_limited":
      return new SpaceStopped(step, {
        cause: "unreachable",
        message,
        guidance: i18n._({ id: "Check the network, then Retry.", comment: "Guidance where the Git host could not be reached" }),
        retry: true,
      });
    default:
      return new SpaceStopped(step, { cause: "refused", message, guidance: membersDecide(), retry: true });
  }
}

/** Remove the folders a move left empty, up to the workspace itself. */
function pruneEmptyFolders(dir: string, stopAt: string): void {
  let current = resolve(dir);
  const root = resolve(stopAt);
  while (current !== root && current.startsWith(`${root}/`)) {
    try {
      if (readdirSync(current).length > 0) return;
      rmdirSync(current);
    } catch { return; }
    current = dirname(current);
  }
}

/** The diagnostic a pending Git merge stands as (space-11). */
const mergePendingReason = (): string => i18n._({
  id: "a Git merge is pending; finish or abort it in a terminal before syncing",
  comment: "A diagnostic's reason, read after the file it names",
});

/** Why an interrupted sync's repair failed (space-31); {cause} is the
 * failure's own text, relayed. */
const repairFailureReason = (cause: string): string => i18n._({
  id: "an interrupted sync could not be repaired: {cause}",
  values: { cause },
  comment: "A diagnostic's reason, read after the file it names; {cause} is the failure's own text, relayed",
});

type RepositoryInfo =
  | { git: { ok: false; guidance: string }; root: false }
  | { git: { ok: true; version: string }; root: false }
  | {
      git: { ok: true; version: string };
      root: true;
      branch: string | null;
      head: string | null;
      remote: string | null;
      id: string | null;
      upstream: boolean;
      originSpex: string | null;
      mergePending: boolean;
    };
type ReadyRepository = Extract<RepositoryInfo, { root: true }> & { head: string; remote: string };

/** A step ended in the stopped state of space-15. */
class SpaceStopped extends Error {
  constructor(readonly step: SyncStep, readonly failure: GitFailure) {
    super(failure.message);
    this.name = "SpaceStopped";
  }
}

interface PlanRevisions { ours: string | null; theirs: string; base: string }
/** The last plan's revisions and units; `oursTree` is the tree object
 * mine was read from — the working tree's temporary-index tree outside
 * a sync, HEAD inside one — so a diff covers a new file too. */
interface LastPlan extends PlanRevisions { oursTree: string; units: StorageMergeUnit[] }
interface Lists { local: SpaceUnit[]; incoming: SpaceUnit[]; conflicts: SpaceConflict[] }
interface Pending { head: string; origin: string; base: string; units: StorageMergeUnit[]; resolved: Map<string, StorageChoice>; counts: { sent: number; received: number } }
interface Applied { headBefore: string; headAfter: string; changedSessions: string[]; diagnostics: StorageDiagnostic[] }
interface ApplyMarker { v: 1; ours: string; theirs: string; base: string; choices: Record<string, StorageChoice>; at: number }
type CompareResult =
  | { outcome: "unrelated" }
  | { outcome: "choices" }
  | { outcome: "nothing"; counts: { sent: number; received: number } }
  | { outcome: "apply"; pending: Pending };

/** A unit's kind, by its name (space-7, space-33). */
export function spaceUnitKind(name: string): SpaceUnitKind {
  if (/^sessions\/[0-9a-f-]{36}$/.test(name)) return "session";
  if (/^intents\/[0-9a-f-]{36}$/.test(name)) return "intent";
  if (/^authoring\/[a-z0-9][a-z0-9_-]*$/.test(name)) return "authoring";
  if (name === "environment") return "environment";
  if (name === "config/playbook.config.yaml") return "settings";
  if (name === "project.json") return "code";
  if (name === ".gitignore" || name === ".gitattributes") return "rules";
  return "other";
}

/** The catalog family of a clone path (space-35, storage-1). */
export function spaceFamily(rel: string, isDirectory: boolean): string {
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  if (parts[0] === ".git") return "Git data";
  if (rel === APPLY_MARKER) return "sync repair marker";
  if (parts.length === 1 && /^\.lock/.test(base)) return "lease";
  if (parts[0] === "sessions" && parts.length === 2 && /^\.[0-9a-f-]{36}\.lock/.test(base)) return "lease";
  if (rel !== "spex.lock" && /\.lock$|\.lock\./.test(base)) return "lease";
  if (/\.tmp$/.test(base)) return "temporary write";
  if (/\.bak(?:\.|$)|\.backup(?:\.|$)/.test(base)) return "config backup";
  if (parts[0] === "sessions") {
    if (parts.length === 1) return "session bundles";
    const assets = /^([0-9a-f-]{36})\.assets$/.exec(parts[1]);
    if (assets && UUID.test(assets[1])) return "session attachments";
    if (parts.length === 2) {
      const manifest = /^([0-9a-f-]{36})\.json$/.exec(base);
      if (manifest && UUID.test(manifest[1])) return "session manifest";
      const records = /^([0-9a-f-]{36})\.records\.jsonl$/.exec(base);
      if (records && UUID.test(records[1])) return "session records";
      const hints = /^([0-9a-f-]{36})\.hints\.json$/.exec(base);
      if (hints && UUID.test(hints[1])) return "provider hints";
      const sidecar = /^([0-9a-f-]{36})\.spex\.json$/.exec(base);
      if (sidecar && UUID.test(sidecar[1])) return "legacy session sidecar";
    }
  }
  if (parts[0] === "intents") {
    if (parts.length === 1) return "intents";
    const assets = /^([0-9a-f-]{36})\.assets$/.exec(parts[1]);
    if (assets && UUID.test(assets[1])) return "intent attachments";
    const intent = /^([0-9a-f-]{36})\.json$/.exec(base);
    if (parts.length === 2 && intent && UUID.test(intent[1])) return "intent";
  }
  if (parts[0] === "authoring") {
    if (parts.length === 1) return "authoring sessions";
    const assets = /^(.+)\.assets$/.exec(parts[1]);
    if (assets && AUTHORING_ID.test(assets[1])) return "authoring attachments";
    if (parts.length === 2) {
      const records = /^(.+)\.records\.jsonl$/.exec(base);
      if (records && AUTHORING_ID.test(records[1])) return "authoring records";
      const session = /^(.+)\.json$/.exec(base);
      if (session && AUTHORING_ID.test(session[1])) return "authoring session";
    }
  }
  if (rel === "spex.yaml") return "spec package requests";
  if (rel === "spex.lock") return "spec package lock";
  if (parts[0] === "packages") return "installed spec packages";
  if (parts[0] === "skills") return "exported skills";
  if (parts[0] === UPLOAD_STAGING) return "upload staging";
  if (rel === "config" || rel === "config/playbook.config.yaml") return "Settings";
  if (rel === "project.json") return "code remote";
  if (rel === ".gitignore" || rel === ".gitattributes") return "sync rules";
  return isDirectory ? "Not a Spex folder" : "Not a Spex file";
}

/** Catalog families a clone never shares, whatever Git says (storage-1, space-35). */
const LOCAL_FAMILIES = new Set([
  "lease", "temporary write", "config backup", "provider hints", "legacy session sidecar",
  "sync repair marker", "installed spec packages", "exported skills", "upload staging",
]);

function realPath(path: string): string {
  try { return realpathSync.native(path); } catch { return resolve(path); }
}
function inside(path: string, root: string): boolean {
  const rel = relative(realPath(root), realPath(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
function timeSeconds(text: string): number | undefined {
  const value = Number.parseInt(text.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value * 1000 : undefined;
}
/** A session's turns, as a unit's detail counts them (space-34). */
function turnCount(count: number): string {
  return i18n._({
    id: "{count, plural, one {# turn} other {# turns}}",
    values: { count },
    comment: "A session unit's detail: how many turns it holds",
  });
}
/** A unit or a side this change removed (space-34). */
function deletedDetail(): string {
  return i18n._({ id: "deleted", comment: "A unit's detail: this side removed it" });
}

/** Cut text on complete lines under a byte cap and a line cap. */
function capText(text: string, maxBytes: number, maxLines: number): { text: string; lines: number; truncated: boolean } {
  let truncated = false;
  let out = text;
  if (Buffer.byteLength(out, "utf8") > maxBytes) {
    const cut = Buffer.from(out, "utf8").subarray(0, maxBytes).toString("utf8");
    const last = cut.lastIndexOf("\n");
    out = last >= 0 ? cut.slice(0, last + 1) : "";
    truncated = true;
  }
  const all = out.split("\n");
  const complete = all[all.length - 1] === "" ? all.length - 1 : all.length;
  if (complete > maxLines) {
    out = `${all.slice(0, maxLines).join("\n")}\n`;
    truncated = true;
  }
  const count = out.length === 0 ? 0 : out.endsWith("\n") ? out.split("\n").length - 1 : out.split("\n").length;
  return { text: out, lines: count, truncated };
}

function sessionSummary(records: Buffer | undefined): { title?: string; turns: number; at?: number } {
  if (!records) return { turns: 0 };
  let title: string | undefined;
  let turns = 0;
  let at: number | undefined;
  for (const line of records.toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry: { record?: unknown };
    try { entry = JSON.parse(line) as { record?: unknown }; } catch { break; }
    const record = entry?.record as import("./protocol.js").TmuxPlayRecord | undefined;
    if (!record || typeof record !== "object") continue;
    const event = foldTurnEvent(record);
    if (event?.kind === "start") { turns += 1; title ??= event.prompt; }
    if (typeof record.timestamp === "number" && Number.isFinite(record.timestamp)) at = Math.max(at ?? 0, record.timestamp);
  }
  return { ...(title !== undefined ? { title } : {}), turns, ...(at !== undefined ? { at } : {}) };
}

/** An intent's title from its file's bytes: the text's trimmed first
 * line, or its attachment names where the text is blank (space-34). */
export function intentFileTitle(bytes: Buffer | undefined): string | undefined {
  if (!bytes) return undefined;
  try {
    const value = JSON.parse(bytes.toString("utf8")) as { text?: unknown; attachments?: { name?: unknown }[] };
    const text = typeof value.text === "string" ? value.text.trim() : "";
    const first = text.split("\n")[0]?.trim();
    if (first) return first;
    const names = (value.attachments ?? []).map((asset) => asset?.name).filter((name): name is string => typeof name === "string");
    return names.length ? names.join(", ") : undefined;
  } catch { return undefined; }
}

/** An authoring session's title: its first queued entry's text (space-34). */
function authoringTitle(bytes: Buffer | undefined): string | undefined {
  if (!bytes) return undefined;
  try {
    const value = JSON.parse(bytes.toString("utf8")) as { queued?: { text?: unknown }[] };
    const text = value.queued?.[0]?.text;
    return typeof text === "string" && text.trim() ? text.trim().split("\n")[0] : undefined;
  } catch { return undefined; }
}

/** What the header counts (space-1): a repair the reader has not
 * answered, and every diagnostic no repair folds. A resolved repair is
 * already gone, because the core stops reporting it. */
function countIssues(diagnostics: StorageDiagnostic[]): number {
  return diagnostics.filter((entry) => entry.repair?.declined === undefined).length;
}

/** One repair's record in this device's preferences (space-54). */
const repairPref = (key: string): string => `space:repair:${key}`;
/** A repository's last completed sync (space-22, storage-5). */
const lastSyncPref = (key: string): string => `sync:${key}:last`;
/** The privacy notice seen for a repository (storage-5, space-57). */
const noticedPref = (key: string): string => `sync:${key}:noticed`;

/** The explorer's refusals of a path outside what it browses (space-35). */
const escapesTheHome = (): string => i18n._({
  id: "the path escapes the home",
  comment: "Refusal: the explorer was given a path leading outside the home",
});
const noFileAt = (path: string): string => i18n._({
  id: "no file at {path}",
  values: { path },
  comment: "Refusal: nothing to read at the path the explorer was given",
});
const noFolderAt = (path: string): string => i18n._({
  id: "no folder at {path}",
  values: { path },
  comment: "Refusal: nothing to list at the path the explorer was given",
});

/** The refusal an act naming a unit no plan holds meets. */
const unknownUnit = (unit: string): string => i18n._({
  id: "unknown unit {unit}",
  comment: "Refusal: the act names a unit the current plan does not hold",
  values: { unit },
});

/** Units that count as something a removal would lose (projects-9):
 * every record but what the clone regenerates. */
const RECORD_KINDS = new Set<SpaceUnitKind>(["session", "intent", "authoring", "environment", "settings", "other"]);

/** One spex repository's sync machine (space-31): at most one operation
 * at a time on this clone, any number of clones at once. */
class RepositorySync {
  git: SpaceGit;
  phase: SpaceSyncPhase = { phase: "idle" };
  /** The clone's remote and recorded id, as last read. */
  facts: CloneFacts = { remote: null, id: null };
  /** What the last transport learnt of the host before the next read
   * (space-15): a refusal turns the repository read-only, a missing one
   * unreachable. */
  hostOverride?: { state: "read-only" | "unreachable"; reason: string };
  private checkedAt: number | null = null;
  private remoteEmpty = false;
  private unrelated = false;
  private lists: Lists = { local: [], incoming: [], conflicts: [] };
  private lastPlan?: LastPlan;
  cached?: RepositoryState;
  private operation?: Promise<void>;
  private applied?: Applied;
  private holding?: { leases: { release(): Promise<unknown> }[]; umask: number };
  /** The text of the failure that stopped an interrupted sync's repair;
   * its diagnostic is phrased where it is read (core-service-111). */
  private repairFailure?: string;
  private refreshProblem?: StorageDiagnostic;
  private mergePending = false;

  constructor(private readonly host: SpaceHost, private readonly owner: SpaceManager, public repository: SpexRepository) {
    this.git = this.makeGit(repository.dir);
  }

  private makeGit(dir: string): SpaceGit {
    return new SpaceGit(dir, this.host.env, {
      ...(this.host.transportTimeoutMs !== undefined ? { transportTimeoutMs: this.host.transportTimeoutMs } : {}),
      identity: () => this.owner.identity(),
    });
  }

  /** The clone moved (space-59, space-60): this machine follows it. */
  rebind(repository: SpexRepository): void {
    this.repository = repository;
    this.git = this.makeGit(repository.dir);
    if (this.cached) this.cached = { ...this.cached, key: repository.key, name: splitKey(repository.key).name };
  }

  get key(): string { return this.repository.key; }
  private get dir(): string { return this.repository.dir; }

  // -- the gate (space-21) ---------------------------------------------------

  /** The busy message while an operation runs, else undefined. */
  busy(): string | undefined {
    if (this.phase.phase !== "running") return undefined;
    // One whole sentence per operation: a verb dropped into a frame
    // carries to no other language (core-service-111).
    const name = splitKey(this.key).name;
    switch (this.phase.op) {
      case "sync":
        return i18n._({ id: "{name} is syncing; wait for it to finish", values: { name }, comment: "Refusal while a spex repository syncs; {name} is its name" });
      case "join":
        return i18n._({ id: "{name} is joining; wait for it to finish", values: { name }, comment: "Refusal while a spex repository is being joined; {name} is its name" });
      case "move":
        return i18n._({ id: "{name} is moving; wait for it to finish", values: { name }, comment: "Refusal while a spex repository's clone moves or is renamed; {name} is its name" });
      default:
        return i18n._({ id: "{name} is checking the host; wait for it to finish", values: { name }, comment: "Refusal while a spex repository checks the Git host; {name} is its name" });
    }
  }

  assertNotRunning(): void {
    if (this.phase.phase === "running") {
      throw new CoreError("busy", i18n._({ id: "Already syncing", comment: "Refusal of a second operation on a spex repository while one runs" }));
    }
  }

  /** Hold the gate for an operation the manager runs beneath this clone
   * — a rename or a join's code clone (space-21); false while another
   * runs. */
  hold(op: SpaceOp, step: SyncStep): boolean {
    if (this.phase.phase === "running") return false;
    this.phase = { phase: "running", op, step, since: Date.now(), cancelable: false };
    return true;
  }

  /** Lift a hold, or end it stopped. */
  release(stopped?: { op: SpaceOp; step: SyncStep; failure: GitFailure }): void {
    this.phase = stopped ? { phase: "stopped", op: stopped.op, step: stopped.step, ...stopped.failure } : { phase: "idle" };
  }

  /** The clone's remote and recorded host id, read afresh. */
  async readFacts(): Promise<CloneFacts> {
    await this.readRepository();
    return this.facts;
  }

  /** Give the clone the host's own remote and id (space-58, space-63):
   * the URL the host handed over, used as given (space-5). */
  async attachHost(url: string, id: string): Promise<void> {
    const repo = await this.readRepository();
    this.requireGit(repo);
    if (!repo.root) throw new CoreError("invalid_request", initializeFirst());
    if (repo.remote === null) await this.git.ok(["remote", "add", "origin", url]);
    else if (repo.remote !== url) await this.git.ok(["remote", "set-url", "origin", url]);
    await this.git.ok(["config", "spex.repositoryId", id]);
    if (repo.remote !== url) {
      await this.git.run(["update-ref", "-d", `refs/remotes/origin/${SPEX_BRANCH}`]);
      await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
      this.checkedAt = null;
      this.remoteEmpty = false;
      this.unrelated = false;
    }
    this.facts = { remote: url, id };
    this.hostOverride = undefined;
  }

  /** Record the host's id beside a clone matched by its remote URL
   * (git-host-5). */
  async recordId(id: string): Promise<void> {
    if (this.phase.phase === "running" || this.facts.id === id) return;
    await this.recordIdNow(id);
  }

  /** The same, inside this clone's own operation. */
  async recordIdNow(id: string): Promise<void> {
    if ((await this.git.run(["config", "spex.repositoryId", id])).code === 0) this.facts = { ...this.facts, id };
  }

  /** The URL the host hands over after a rename or a transfer
   * (space-60), used as given, inside this clone's own operation. */
  async setOrigin(url: string): Promise<void> {
    await this.git.ok(["remote", "set-url", "origin", url]);
    this.facts = { ...this.facts, remote: url };
  }

  /** This clone's own diagnostics: a pending merge, a refresh's finding,
   * an interrupted sync that could not be repaired. */
  diagnostics(): StorageDiagnostic[] {
    const rel = relative(this.host.home, this.dir);
    return [
      ...(this.mergePending ? [{ file: `${rel}/.git/MERGE_HEAD`, reason: mergePendingReason(), blocking: false }] : []),
      ...(this.refreshProblem ? [this.refreshProblem] : []),
      ...(this.repairFailure !== undefined ? [{ file: `${rel}/${APPLY_MARKER}`, reason: repairFailureReason(this.repairFailure), blocking: true }] : []),
    ];
  }

  private async readRepository(): Promise<RepositoryInfo> {
    const version = await this.git.version();
    if (!version.ok) return { git: version, root: false };
    if (!existsSync(join(this.dir, ".git"))) return { git: version, root: false };
    const top = await this.git.run(["rev-parse", "--show-toplevel"]);
    if (top.code !== 0 || realPath(top.stdout.toString("utf8").trim()) !== realPath(this.dir)) return { git: version, root: false };
    const branch = await this.git.run(["symbolic-ref", "-q", "--short", "HEAD"]);
    const head = await this.git.run(["rev-parse", "-q", "--verify", "HEAD^{commit}"]);
    const remote = await this.git.run(["remote", "get-url", "origin"]);
    const id = await this.git.run(["config", "--get", "spex.repositoryId"]);
    const upstream = await this.git.succeeds(["config", "--get", `branch.${SPEX_BRANCH}.remote`]);
    const origin = await this.git.run(["rev-parse", "-q", "--verify", `refs/remotes/origin/${SPEX_BRANCH}^{commit}`]);
    const gitDir = resolve(this.dir, await this.git.ok(["rev-parse", "--git-dir"]));
    const mergePending = (await this.git.succeeds(["rev-parse", "-q", "--verify", "MERGE_HEAD"])) || existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"));
    this.mergePending = mergePending;
    this.facts = {
      remote: remote.code === 0 ? remote.stdout.toString("utf8").trim() : null,
      id: id.code === 0 ? id.stdout.toString("utf8").trim() || null : null,
    };
    return {
      git: version,
      root: true,
      branch: branch.code === 0 ? branch.stdout.toString("utf8").trim() : null,
      head: head.code === 0 ? head.stdout.toString("utf8").trim() : null,
      remote: remote.code === 0 ? remote.stdout.toString("utf8").trim() : null,
      id: id.code === 0 ? id.stdout.toString("utf8").trim() || null : null,
      upstream,
      originSpex: origin.code === 0 ? origin.stdout.toString("utf8").trim() : null,
      mergePending,
    };
  }

  /** The repository's state, recomputing the lists from the working
   * tree when asked (space-33: mine is the working tree outside a sync). */
  async state(recompute: boolean): Promise<RepositoryState> {
    if (this.phase.phase === "running" && this.cached) return { ...this.cached, sync: this.phase };
    const repo = await this.readRepository();
    if (recompute && repo.root && repo.head !== null && this.phase.phase !== "choices") {
      try { await this.computeWorkingLists(repo.head, repo.originSpex); }
      catch (error) { console.error(`spex: space listing failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    let ahead: number | null = null;
    let behind: number | null = null;
    if (repo.root && repo.head && repo.originSpex && this.checkedAt !== null) {
      const counts = await this.git.run(["rev-list", "--left-right", "--count", `HEAD...refs/remotes/origin/${SPEX_BRANCH}`]);
      if (counts.code === 0) {
        const [left, right] = counts.stdout.toString("utf8").trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
        if (Number.isFinite(left) && Number.isFinite(right)) { ahead = left; behind = right; }
      }
    } else if (repo.root && repo.head && this.remoteEmpty && this.checkedAt !== null) {
      const count = await this.git.run(["rev-list", "--count", "HEAD"]);
      ahead = count.code === 0 ? Number.parseInt(count.stdout.toString("utf8").trim(), 10) : null;
      behind = 0;
    }
    const store = this.host.store;
    const stored = store.getPref<{ at?: unknown; sent?: unknown; received?: unknown }>(lastSyncPref(this.key));
    const lastSync = stored && typeof stored.at === "number" && typeof stored.sent === "number" && typeof stored.received === "number"
      ? { at: stored.at, sent: stored.sent, received: stored.received }
      : null;
    let code: string | null = null;
    try {
      const project = existsSync(this.repository.projectFile) ? readJsonFile(this.repository.projectFile) as { remote?: unknown } : undefined;
      code = typeof project?.remote === "string" ? displayRemote(project.remote) : null;
    } catch { code = null; }
    const remote = repo.root ? repo.remote : null;
    const state: RepositoryState = {
      key: this.key,
      name: splitKey(this.key).name,
      id: repo.root ? repo.id : null,
      own: this.key === store.home.own(),
      code,
      folder: store.home.folderOf(this.key)?.path ?? null,
      remote: remote === null ? null : displayRemote(remote),
      state: remote === null ? "local-only" : "reachable",
      reason: null,
      waiting: null,
      members: null,
      visibility: null,
      branch: repo.root ? {
        ahead,
        behind,
        checkedAt: this.checkedAt,
        hostEmpty: this.checkedAt !== null && this.remoteEmpty,
        unrelated: this.unrelated,
        mergePending: repo.mergePending,
      } : null,
      local: this.lists.local,
      incoming: this.lists.incoming,
      conflicts: this.lists.conflicts,
      lastSync,
      noticed: store.getPref<unknown>(noticedPref(this.key)) === true,
      sync: this.phase,
    };
    this.cached = state;
    return state;
  }

  private async broadcast(recompute: boolean): Promise<void> {
    await this.state(recompute);
    await this.owner.publish();
  }

  /** What a removal of this clone would lose (projects-9): its record
   * units the host has not received. */
  async pendingUnits(): Promise<number> {
    const repo = await this.readRepository();
    if (!repo.root || repo.head === null) return 0;
    if (repo.remote === null) {
      const mine = await this.workingTree();
      const units = planStorageUnits({ ours: readStorageTree(this.dir, mine), theirs: new Map(), base: new Map() });
      return units.filter((unit) => RECORD_KINDS.has(spaceUnitKind(unit.name))).length;
    }
    await this.computeWorkingLists(repo.head, repo.originSpex);
    return [...this.lists.local, ...this.lists.conflicts.map((conflict) => conflict.unit)].filter((unit) => RECORD_KINDS.has(unit.kind)).length;
  }

  // -- the plan (space-33) and its labels (space-34) ------------------------

  /** The working tree as a tree object, through a temporary index. */
  private async workingTree(): Promise<string> {
    const index = join(tmpdir(), `spex-space-index-${randomUUID()}`);
    try {
      await this.git.ok(["add", "-A", "--", "."], { env: { GIT_INDEX_FILE: index } });
      return await this.git.ok(["write-tree"], { env: { GIT_INDEX_FILE: index } });
    } finally { rmSync(index, { force: true }); }
  }

  private async computeWorkingLists(head: string, originSpex: string | null): Promise<void> {
    const mine = await this.workingTree();
    let theirs = head;
    let base = head;
    if (this.checkedAt !== null) {
      if (this.remoteEmpty) { theirs = EMPTY_TREE; base = EMPTY_TREE; }
      else if (originSpex) {
        const merged = await this.git.run(["merge-base", "HEAD", `refs/remotes/origin/${SPEX_BRANCH}`]);
        if (merged.code === 0) { theirs = originSpex; base = merged.stdout.toString("utf8").trim(); this.unrelated = false; }
        else this.unrelated = true;
      }
    }
    const trees: StorageTrees = { ours: readStorageTree(this.dir, mine), theirs: readStorageTree(this.dir, theirs), base: readStorageTree(this.dir, base) };
    const units = planStorageUnits(trees);
    this.lastPlan = { ours: null, oursTree: mine, theirs, base, units };
    this.lists = await this.describe(units, trees, { ours: null, theirs, base });
  }

  private async blob(oid: string): Promise<Buffer> {
    const run = await this.git.run(["cat-file", "blob", oid]);
    if (run.code !== 0) throw new Error(`git cat-file ${oid} failed: ${lastLines(run.stderr)}`);
    return run.stdout;
  }

  private async describe(units: StorageMergeUnit[], trees: StorageTrees, revs: PlanRevisions): Promise<Lists> {
    const blobs = new Map<string, Promise<Buffer>>();
    const blob = (oid: string | undefined): Promise<Buffer | undefined> => {
      if (oid === undefined) return Promise.resolve(undefined);
      let pending = blobs.get(oid);
      if (!pending) { pending = this.blob(oid); blobs.set(oid, pending); }
      return pending;
    };
    const context = { trees, revs, blob };
    const local: SpaceUnit[] = [];
    const incoming: SpaceUnit[] = [];
    const conflicts: SpaceConflict[] = [];
    for (const unit of units) {
      const agreed = unit.paths.every((p) => trees.ours.get(p) === trees.theirs.get(p));
      if (agreed) continue;
      if (unit.choice === "conflict") {
        const described = await this.describeUnit(unit, unit.paths.some((p) => trees.ours.has(p)) ? "ours" : "theirs", context);
        conflicts.push({ unit: described, mine: await this.describeSide(unit, "ours", context), remote: await this.describeSide(unit, "theirs", context) });
      } else if (unit.changed.ours && !unit.changed.theirs) local.push(await this.describeUnit(unit, "ours", context));
      else if (unit.changed.theirs && !unit.changed.ours) incoming.push(await this.describeUnit(unit, "theirs", context));
    }
    const order = (a: SpaceUnit, b: SpaceUnit): number => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label) || a.unit.localeCompare(b.unit);
    local.sort(order);
    incoming.sort(order);
    conflicts.sort((a, b) => order(a.unit, b.unit));
    return { local, incoming, conflicts };
  }

  private changeOf(unit: StorageMergeUnit, side: "ours" | "theirs", trees: StorageTrees): SpaceChange {
    const inBase = unit.paths.some((p) => trees.base.has(p));
    const inSide = unit.paths.some((p) => trees[side].has(p));
    return !inBase && inSide ? "new" : inBase && !inSide ? "deleted" : "updated";
  }

  private async describeUnit(
    unit: StorageMergeUnit,
    side: "ours" | "theirs",
    context: { trees: StorageTrees; revs: PlanRevisions; blob: (oid: string | undefined) => Promise<Buffer | undefined> },
  ): Promise<SpaceUnit> {
    const { trees, blob } = context;
    const kind = spaceUnitKind(unit.name);
    const change = this.changeOf(unit, side, trees);
    // A deleted unit is named from the ancestor's bytes: the side has none.
    const source: StorageTree = change === "deleted" ? trees.base : trees[side];
    const common = { unit: unit.name, kind, change, paths: unit.paths };
    switch (kind) {
      case "session": {
        const id = unit.name.slice("sessions/".length);
        const summary = sessionSummary(await blob(source.get(`${unit.name}.records.jsonl`)));
        const untitled = i18n._({ id: "untitled session", comment: "A session unit's label where the session carries no title" });
        return { ...common, label: summary.title ?? untitled, detail: turnCount(summary.turns), sessionId: id, diff: false };
      }
      case "intent": {
        const id = unit.name.slice("intents/".length);
        const title = intentFileTitle(await blob(source.get(`${unit.name}.json`)));
        return { ...common, label: title ?? id.slice(0, 8), intentId: id, diff: false };
      }
      case "authoring": {
        const title = authoringTitle(await blob(source.get(`${unit.name}.json`)));
        return { ...common, label: title ?? i18n._({ id: "untitled authoring session", comment: "An authoring session unit's label where it carries no first message" }), diff: false };
      }
      case "environment": {
        const changed = unit.paths.filter((p) => trees[side].get(p) !== trees.base.get(p));
        return { ...common, label: i18n._({ id: "Spec packages changed", comment: "The environment unit's label: spex.yaml or spex.lock changed" }), detail: changed.join(", "), diff: true };
      }
      case "settings":
        return { ...common, label: i18n._({ id: "Settings changed", comment: "The settings unit's label" }), diff: true };
      case "code":
        return { ...common, label: i18n._({ id: "Code remote changed", comment: "The project file's unit label: the remote of the code changed" }), diff: true };
      case "rules":
        return { ...common, label: i18n._({ id: "Sync rules updated", comment: "The sync-rules unit's label" }), diff: true };
      default:
        return { ...common, label: unit.name, diff: true };
    }
  }

  private async describeSide(
    unit: StorageMergeUnit,
    side: "ours" | "theirs",
    context: { trees: StorageTrees; revs: PlanRevisions; blob: (oid: string | undefined) => Promise<Buffer | undefined> },
  ): Promise<SpaceSide> {
    const { trees, revs, blob } = context;
    const kind = spaceUnitKind(unit.name);
    const change = this.changeOf(unit, side, trees);
    if (change === "deleted") return { change, detail: deletedDetail(), diff: false };
    switch (kind) {
      case "session": {
        const summary = sessionSummary(await blob(trees[side].get(`${unit.name}.records.jsonl`)));
        return { change, ...(summary.at !== undefined ? { at: summary.at } : {}), detail: turnCount(summary.turns), diff: false };
      }
      case "intent":
      case "authoring": {
        const at = await this.changedAt(side === "ours" ? revs.ours : revs.theirs, unit.paths.filter((p) => trees[side].has(p)));
        return { change, ...(at !== undefined ? { at } : {}), diff: false };
      }
      default: {
        const at = await this.changedAt(side === "ours" ? revs.ours : revs.theirs, unit.paths.filter((p) => trees[side].has(p)));
        return { change, ...(at !== undefined ? { at } : {}), diff: true };
      }
    }
  }

  /** When a side's paths last changed: the working tree's newest mtime,
   * or the revision's last commit touching them. */
  private async changedAt(rev: string | null, paths: string[]): Promise<number | undefined> {
    if (paths.length === 0) return undefined;
    if (rev === null) {
      let newest: number | undefined;
      for (const p of paths) {
        try { newest = Math.max(newest ?? 0, statSync(join(this.dir, p)).mtimeMs); } catch { /* deleted meanwhile */ }
      }
      return newest === undefined ? undefined : Math.round(newest);
    }
    const run = await this.git.run(["log", "-1", "--format=%ct", rev, "--", ...paths]);
    return run.code === 0 ? timeSeconds(run.stdout.toString("utf8")) : undefined;
  }

  // -- the remote ------------------------------------------------------------

  private requireGit(repo: RepositoryInfo): void {
    if (!repo.git.ok) throw new CoreError("invalid_request", repo.git.guidance);
  }

  private async requireReady(): Promise<ReadyRepository> {
    const repo = await this.readRepository();
    this.requireGit(repo);
    if (!repo.root) throw new CoreError("invalid_request", initializeFirst());
    if (repo.remote === null) {
      // A local-only spex repository reaches the host by a group picked
      // for it, once signed in (space-58, space-61).
      throw new CoreError("invalid_request", this.owner.signedIn()
        ? i18n._({ id: "Pick a group first", comment: "Refusal: the spex repository is only on this device; a group must be picked for it" })
        : signInFirst());
    }
    if (repo.branch !== SPEX_BRANCH) {
      throw new CoreError("invalid_request", repo.branch
        ? i18n._({
            id: "On {branch}; check out spex in a terminal",
            values: { branch: repo.branch },
            comment: "Refusal: the clone sits on another branch; spex is the branch's own name",
          })
        : i18n._({
            id: "Not on a branch; check out spex in a terminal",
            comment: "Refusal: the clone's HEAD names no branch; spex is the branch's own name",
          }));
    }
    if (repo.mergePending) {
      throw new CoreError("invalid_request", i18n._({
        id: "Finish or abort the merge in your terminal",
        comment: "Refusal: a Git merge is pending in the home",
      }));
    }
    if (repo.head === null) {
      throw new CoreError("invalid_request", i18n._({
        id: "The repository holds no commit yet; initialize it again",
        comment: "Refusal: the home's repository holds no commit to sync",
      }));
    }
    return repo as ReadyRepository;
  }

  /** Give the clone a remote, or take it away (space-5): the way a
   * reader or a test reaches a host this wave. */
  async setRemote(url: string | null): Promise<void> {
    this.assertNotRunning();
    const repo = await this.readRepository();
    this.requireGit(repo);
    if (!repo.root) throw new CoreError("invalid_request", initializeFirst());
    if (url === null) {
      if (repo.remote !== null) await this.git.ok(["remote", "remove", "origin"]);
    } else {
      const checked = validateRemoteUrl(url);
      if (!checked.ok) throw new CoreError("invalid_request", checked.reason);
      // The Git host's own remote URLs are those it hands over, used as
      // given and never named by the reader (space-5).
      if (await this.owner.atHostOrigin(url)) {
        throw new CoreError("invalid_request", i18n._({
          id: "The Git host's own URLs are used as the host gives them; pick a group instead.",
          comment: "Refusal of a remote the reader named under the Git host's own origin",
        }));
      }
      if (url !== repo.remote) await this.git.ok(repo.remote === null ? ["remote", "add", "origin", url] : ["remote", "set-url", "origin", url]);
    }
    if (url !== repo.remote) {
      // A changed remote clears the last check and the last sync (space-5):
      // what the old remote held says nothing about the new one.
      await this.git.run(["update-ref", "-d", `refs/remotes/origin/${SPEX_BRANCH}`]);
      await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
      // A remote the reader names is no repository the host listed.
      await this.git.run(["config", "--unset", "spex.repositoryId"]);
      this.checkedAt = null;
      this.host.store.deletePref(lastSyncPref(this.key));
      this.remoteEmpty = false;
      this.unrelated = false;
      this.hostOverride = undefined;
      this.phase = { phase: "idle" };
    }
    await this.state(true);
  }

  // -- operations (space-31) -------------------------------------------------

  private runOperation(op: SpaceOp, body: () => Promise<void>): Promise<void> {
    const work = (async () => {
      try { await body(); }
      catch (error) {
        const step = this.phase.phase === "running" ? this.phase.step : "save";
        if (error instanceof SpaceStopped) this.phase = { phase: "stopped", op, step: error.step, ...error.failure };
        else {
          const message = error instanceof Error ? error.message : String(error);
          this.phase = { phase: "stopped", op, step, cause: "git", message: lastLines(message), guidance: i18n._({
            id: "Retry; if it fails again, run the step in a terminal for detail.",
            comment: "Guidance under a step that stopped for a reason the app does not classify",
          }), retry: true };
        }
      } finally {
        await this.releaseHoldings();
        try { await this.broadcast(this.phase.phase !== "choices"); }
        catch (error) { console.error(`spex: space state failed: ${error instanceof Error ? error.message : String(error)}`); }
      }
    })();
    this.operation = work;
    void work.finally(() => { if (this.operation === work) this.operation = undefined; });
    return work;
  }

  private async enter(op: SpaceOp, step: SyncStep, cancelable: boolean): Promise<void> {
    this.phase = { phase: "running", op, step, since: Date.now(), cancelable };
    await this.broadcast(false);
    await this.host.beforeStep?.({ op, step, repository: this.key });
  }

  async fetch(): Promise<{ accepted: true }> {
    this.assertNotRunning();
    const previous = this.phase;
    this.phase = { phase: "running", op: "check", step: "check", since: Date.now(), cancelable: false };
    let repo: ReadyRepository;
    try {
      repo = await this.requireReady();
      await this.owner.admit(this, { push: false, noticed: true });
    } catch (error) { this.phase = previous; throw error; }
    void this.runOperation("check", async () => {
      await this.enter("check", "check", true);
      await this.check(repo.remote, "check");
      this.phase = { phase: "idle" };
    });
    return { accepted: true };
  }

  /** `internal` marks a sync the core starts itself — after a sign-in, a
   * pick or a creation (space-4, space-58) — whose act already said what
   * a join does (space-13). */
  async sync(input: { choices?: Record<string, SpaceChoice>; join?: boolean; noticed?: boolean; internal?: boolean }): Promise<{ accepted: true }> {
    this.assertNotRunning();
    const previous = this.phase;
    // The gate is set before the admission checks (space-21).
    this.phase = { phase: "running", op: "sync", step: "save", since: Date.now(), cancelable: false };
    let repo: ReadyRepository;
    const choices: Record<string, StorageChoice> = {};
    try {
      const blocker = await this.host.blocker(this.key);
      if (blocker) throw new CoreError("busy", blocker);
      repo = await this.requireReady();
      const blocking = [...this.owner.storageDiagnostics(), ...this.diagnostics()].find((d) => d.blocking);
      if (blocking) throw new CoreError("invalid_request", `${blocking.file}: ${blocking.reason}`);
      await this.repairIfMarked();
      if (input.choices && Object.keys(input.choices).length > 0) {
        const plan = this.lastPlan?.units ?? [];
        for (const [name, choice] of Object.entries(input.choices)) {
          const unit = plan.find((u) => u.name === name);
          if (!unit) throw new CoreError("invalid_request", unknownUnit(name));
          if (unit.choice !== "conflict") {
            const label = [...this.lists.local, ...this.lists.incoming].find((u) => u.unit === name)?.label ?? name;
            throw new CoreError("invalid_request", i18n._({
              id: "{label} has no divergent change",
              values: { label },
              comment: "Refusal: a choice was sent for a unit the two sides agree on; {label} is the unit's own label",
            }));
          }
          choices[name] = choice === "mine" ? "ours" : "theirs";
        }
      }
      if (input.noticed === true) this.host.store.setPref(noticedPref(this.key), true);
      await this.owner.admit(this, { push: true, noticed: input.noticed === true || input.internal === true });
    } catch (error) {
      this.phase = previous;
      throw error;
    }
    void this.runOperation("sync", () => this.syncBody(repo, choices, input.join === true));
    return { accepted: true };
  }

  cancel(): boolean {
    return this.git.cancel();
  }

  /** Cancel a transport and wait for the operation to settle (shutdown). */
  async stop(): Promise<void> {
    this.git.cancel();
    try { await this.operation; } catch { /* reported as state */ }
  }

  // -- the steps (space-12, space-15) ----------------------------------------

  private async syncBody(repo: ReadyRepository, choices: Record<string, StorageChoice>, join: boolean): Promise<void> {
    const op: SpaceOp = "sync";
    let restarts = 0;
    let rechecks = 0;
    let savedCommit: string | null = null;
    let pending: Pending | undefined;
    let counts = { sent: 0, received: 0 };
    let upstream = repo.upstream;
    // The host may hand over another URL, after a rename or a transfer,
    // and may answer that this account only reads (space-60, space-61).
    let remote = repo.remote;
    let readOnly = false;
    let atHost = false;
    let next: SyncStep | "done" = "save";
    while (next !== "done") {
      switch (next) {
        case "save": {
          await this.enter(op, "save", false);
          savedCommit = (await this.save()) ?? savedCommit;
          next = "check";
          break;
        }
        case "check": {
          await this.enter(op, "check", true);
          const checked = await this.check(remote, "sync");
          remote = checked.remote;
          readOnly = checked.readOnly;
          atHost = checked.atHost;
          const remoteEmpty = checked.empty;
          if (remoteEmpty) {
            counts = { sent: planStorageUnits({ ours: readStorageTree(this.dir, "HEAD"), theirs: new Map(), base: new Map() }).length, received: 0 };
            next = "push";
          } else next = "compare";
          break;
        }
        case "compare": {
          await this.enter(op, "compare", false);
          const result = await this.compare(choices, join);
          if (result.outcome === "unrelated") { this.phase = { phase: "unrelated" }; return; }
          if (result.outcome === "choices") { this.phase = { phase: "choices", savedCommit }; return; }
          if (result.outcome === "nothing") { counts = result.counts; next = "push"; break; }
          pending = result.pending;
          counts = pending.counts;
          next = "apply";
          break;
        }
        case "apply": {
          await this.enter(op, "apply", false);
          const applied = await this.apply(pending as Pending);
          if (applied === "restart") {
            if (restarts >= 1) {
              throw new SpaceStopped("apply", {
                cause: "writer",
                message: i18n._({
                  id: "The space changed twice while syncing",
                  comment: "A stopped sync's message: the home was written to twice under the sync",
                }),
                guidance: i18n._({
                  id: "Another process is writing to the home; wait for it to finish, then Retry.",
                  comment: "Guidance under a sync another writer keeps restarting",
                }),
                retry: true,
              });
            }
            restarts += 1;
            next = "save";
            break;
          }
          next = "refresh";
          break;
        }
        case "refresh": {
          await this.enter(op, "refresh", false);
          await this.refresh();
          next = "push";
          break;
        }
        case "push": {
          if (readOnly) {
            // A read-only spex repository brings and sends nothing; its
            // new sessions stay on this device (space-12, space-61).
            const at = Date.now();
            this.host.store.setPref(lastSyncPref(this.key), { at, sent: 0, received: counts.received });
            this.phase = { phase: "done", at, sent: 0, received: counts.received, pushed: false };
            next = "done";
            break;
          }
          await this.enter(op, "push", true);
          const pushed = await this.push(remote, upstream, atHost);
          if (pushed === "rejected") {
            if (rechecks >= 1) {
              throw new SpaceStopped("push", {
                cause: "rejected",
                message: i18n._({
                  id: "The host changed again",
                  comment: "A stopped sync's message: the host's branch moved while this machine was sending",
                }),
                guidance: i18n._({
                  id: "Your merge is saved locally; Retry to send it once the host settles.",
                  comment: "Guidance under a push the remote rejected twice",
                }),
                retry: true,
              });
            }
            rechecks += 1;
            next = "check";
            break;
          }
          upstream = true;
          const at = Date.now();
          this.host.store.setPref(lastSyncPref(this.key), { at, sent: counts.sent, received: counts.received });
          this.phase = { phase: "done", at, sent: counts.sent, received: counts.received, pushed: pushed === "ok" };
          next = "done";
          break;
        }
      }
    }
  }

  /** Step 1 — Save: refresh the rules, stage, refuse a leak, validate,
   * commit when anything is staged (space-12). */
  private async save(): Promise<string | null> {
    const dir = this.dir;
    const stop = (message: string, guidance: string): SpaceStopped => new SpaceStopped("save", { cause: "validation", message, guidance, retry: false });
    try { prepareStorageGitFiles(dir, this.host.store.untrackedSessionPaths(this.key)); }
    catch (error) { throw stop(error instanceof StorageFormatError ? `${error.file}: ${error.reason}` : error instanceof Error ? error.message : String(error), i18n._({
      id: "Nothing was saved. Fix the sync rules file, then sync again.",
      comment: "Guidance where the sync rules file could not be refreshed",
    })); }
    await this.git.ok(["add", "-A", "--", "."]);
    const staged = (await this.git.ok(["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean);
    const leak = staged.find((p) => !portable(p));
    if (leak) {
      await this.git.run(["reset", "-q"]);
      throw stop(
        i18n._({
          id: "Refusing to share {leak}",
          values: { leak },
          comment: "A stopped save's message: a staged file belongs to a family the home never shares; {leak} is its path",
        }),
        i18n._({
          id: "It belongs to a family that stays on this device; check the sync rules. Nothing was saved.",
          comment: "Guidance under a save that refused to share a file",
        }),
      );
    }
    try { await validateStorageTree(dir, this.validation()); }
    catch (error) {
      await this.git.run(["reset", "-q"]);
      throw stop(error instanceof StorageFormatError ? `${error.file}: ${error.reason}` : error instanceof Error ? error.message : String(error), i18n._({
        id: "Nothing was saved. Fix or remove the file, then sync again.",
        comment: "Guidance where a file under the home failed validation before the save",
      }));
    }
    if (await this.git.succeeds(["diff", "--cached", "--quiet"])) return null;
    const units = [...new Set(staged.map(storageUnitName))].sort();
    const commit = await this.git.run([...(await this.git.committerArgs()), "commit", "-q", "-m", `Sync from ${hostname()}\n\n${units.join("\n")}`]);
    if (commit.code !== 0) {
      throw new SpaceStopped("save", {
        cause: "git",
        message: lastLines(commit.stderr) || i18n._({
          id: "Git could not commit",
          comment: "A stopped save's message where git failed and printed nothing",
        }),
        guidance: i18n._({
          id: "Retry; if it fails again, run git commit in the home from a terminal for detail.",
          comment: "Guidance under a commit git failed; git commit is the command's own name",
        }),
        retry: true,
      });
    }
    return this.git.ok(["rev-parse", "HEAD"]);
  }

  private validation(): { own: boolean; libraryDir: string } {
    return { own: this.key === this.host.store.home.own(), libraryDir: this.host.libraryDir };
  }

  /** Step 2 — Check: read the host for this repository where it lies on
   * the Git host, prepare its branch before a first push, then fetch the
   * host's `spex` without merging with the brokered credential;
   * `empty` where the host holds no `spex` (space-8, space-12). */
  private async check(remote: string, op: SpaceOp): Promise<{ empty: boolean; readOnly: boolean; atHost: boolean; remote: string }> {
    const host = await this.owner.hostCheck(this, op);
    const target = host?.remote ?? remote;
    const credential = host ? await this.owner.credentialFor(target, "check") : null;
    const options = { transport: true, ...(credential ? { credential } : {}) };
    try {
      const heads = await this.git.run(["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${SPEX_BRANCH}`], options);
      const outcome = { readOnly: host?.readOnly ?? false, atHost: host !== undefined, remote: target };
      if (heads.code === 2) {
        this.remoteEmpty = true;
        this.unrelated = false;
        this.checkedAt = Date.now();
        return { empty: true, ...outcome };
      }
      if (heads.code !== 0) throw new SpaceStopped("check", this.classify(heads, target, host !== undefined));
      const fetched = await this.git.run(["fetch", "-q", "--no-tags", "origin", `+refs/heads/${SPEX_BRANCH}:refs/remotes/origin/${SPEX_BRANCH}`], options);
      if (fetched.code !== 0) throw new SpaceStopped("check", this.classify(fetched, target, host !== undefined));
      this.remoteEmpty = false;
      this.checkedAt = Date.now();
      return { empty: false, ...outcome };
    } finally {
      await credential?.dispose();
    }
  }

  /** A failed transport in the plain words of space-15: the Git host's
   * own, with its words kept whole, for a clone on the host — which a
   * refusal turns read-only and a missing repository unreachable until
   * the next read — and the remote's form's otherwise (space-50). */
  private classify(run: GitRun, remote: string, atHost: boolean): GitFailure {
    if (!atHost) return classifyTransportFailure(run, remote);
    const failure = classifyHostTransportFailure(run, this.owner.hostName());
    if (failure.cause === "refused") this.hostOverride = { state: "read-only", reason: failure.message };
    if (failure.cause === "gone") this.hostOverride = { state: "unreachable", reason: failure.message };
    return failure;
  }

  /** Step 3 — Compare: the plan of HEAD against the host's `spex` over
   * their ancestor, or the empty tree for a join (space-13, space-14). */
  private async compare(choices: Record<string, StorageChoice>, join: boolean): Promise<CompareResult> {
    const dir = this.dir;
    const originRef = `refs/remotes/origin/${SPEX_BRANCH}`;
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const origin = await this.git.ok(["rev-parse", originRef]);
    const merged = await this.git.run(["merge-base", "HEAD", originRef]);
    this.unrelated = merged.code !== 0;
    if (this.unrelated && !join) return { outcome: "unrelated" };
    const base = this.unrelated ? EMPTY_TREE : merged.stdout.toString("utf8").trim();
    const trees: StorageTrees = { ours: readStorageTree(dir, head), theirs: readStorageTree(dir, origin), base: readStorageTree(dir, base) };
    const units = planStorageUnits(trees);
    this.lastPlan = { ours: head, oursTree: head, theirs: origin, base, units };
    this.lists = await this.describe(units, trees, { ours: head, theirs: origin, base });
    const local = units.filter((u) => u.choice === "ours" && u.changed.ours && !u.changed.theirs);
    const incoming = units.filter((u) => u.choice === "theirs");
    const conflicts = units.filter((u) => u.choice === "conflict");
    if (await this.git.succeeds(["merge-base", "--is-ancestor", originRef, "HEAD"])) {
      return { outcome: "nothing", counts: { sent: local.length, received: 0 } };
    }
    const mismatch = conflicts.some((c) => choices[c.name] === undefined)
      || Object.keys(choices).some((name) => { const unit = units.find((u) => u.name === name); return !unit || (unit.choice !== "conflict" && unit.choice !== choices[name]); });
    if (mismatch) return { outcome: "choices" };
    const resolved = resolveStorageChoices(units, Object.fromEntries(conflicts.map((c) => [c.name, choices[c.name]])));
    const counts = {
      sent: local.length + conflicts.filter((c) => resolved.get(c.name) === "ours").length,
      received: incoming.length + conflicts.filter((c) => resolved.get(c.name) === "theirs").length,
    };
    return { outcome: "apply", pending: { head, origin, base, units, resolved, counts } };
  }

  private markerPath(): string { return join(this.dir, APPLY_MARKER); }

  private beginHolding(): void {
    if (this.holding) return;
    this.holding = { leases: [], umask: process.umask(0o077) };
    this.host.pauseWatchers(this.key);
  }

  private async releaseHoldings(): Promise<void> {
    const holding = this.holding;
    if (!holding) return;
    this.holding = undefined;
    const results = await Promise.allSettled(holding.leases.reverse().map((lease) => lease.release()));
    this.host.store.setManagedSessions(undefined);
    process.umask(holding.umask);
    this.host.resumeWatchers(this.key);
    for (const result of results) if (result.status === "rejected") console.error(`spex: session lease release failed: ${String(result.reason)}`);
  }

  /** Take every session's management lease (space-31): a held one stops
   * the sync naming its session. */
  private async acquireSessionLeases(units: StorageMergeUnit[], step: SyncStep): Promise<void> {
    const store = this.host.store;
    const shared = this.repository.store;
    await shared.prepare();
    const ids = new Set(units.filter((u) => spaceUnitKind(u.name) === "session").map((u) => u.name.slice("sessions/".length)));
    for (const file of existsSync(shared.sessionsDir) ? readdirSync(shared.sessionsDir) : []) {
      if (file.endsWith(".json") && UUID.test(file.slice(0, -5))) ids.add(file.slice(0, -5));
    }
    for (const id of [...ids].sort()) {
      try { (this.holding as { leases: { release(): Promise<unknown> }[] }).leases.push(await shared.acquireManagement(id)); }
      catch {
        const title = store.describeSession(id)?.title;
        throw new SpaceStopped(step, {
          cause: "lease",
          message: title
            ? i18n._({
                id: "“{title}” is in use",
                values: { title },
                comment: "A stopped sync's message: a session is held elsewhere, named by its title",
              })
            : i18n._({
                id: "Session {id} is in use",
                values: { id: id.slice(0, 8) },
                comment: "A stopped sync's message: a session is held elsewhere, named by the head of its identifier",
              }),
          guidance: i18n._({
            id: "Wait for the session to finish, then Retry.",
            comment: "Guidance under a sync a held session stopped",
          }),
          retry: true,
        });
      }
    }
    // The refresh's rescan must not read the core's own leases as writers.
    store.setManagedSessions(ids);
  }

  /** Step 4 — Apply: the validated selection, one merge commit or a
   * fast-forward, never a Git merge (space-19). */
  private async apply(pending: Pending): Promise<"restart" | void> {
    const status = await this.git.ok(["status", "--porcelain=v1", "-z", "-uall"]);
    if (status.length > 0) return "restart";
    this.beginHolding();
    await this.acquireSessionLeases(pending.units, "apply");
    const marker = this.markerPath();
    let result: Awaited<ReturnType<typeof applyStorageSelection>>;
    try {
      result = await applyStorageSelection(
        this.dir,
        { ours: pending.head, theirs: pending.origin, base: pending.base, unrelated: pending.base === EMPTY_TREE, units: pending.units },
        Object.fromEntries(pending.resolved),
        {
          holdsSessionLeases: true,
          prefsFile: prefsFileOf(this.host.home),
          validate: this.validation(),
          beforeWrite: () => {
            const record: ApplyMarker = { v: 1, ours: pending.head, theirs: pending.origin, base: pending.base, choices: Object.fromEntries(pending.resolved), at: Date.now() };
            writeApplicationFile(marker, record);
          },
        },
      );
    } catch (error) {
      if (error instanceof StorageFormatError) {
        throw new SpaceStopped("apply", {
          cause: "validation",
          message: `${error.file}: ${error.reason}`,
          guidance: i18n._({
            id: "Choose the other side for this unit or fix the file, then Retry.",
            comment: "Guidance where the selected side of a unit failed validation",
          }),
          retry: true,
        });
      }
      throw error;
    }
    const headAfter = await this.commitSelection(pending.head, pending.origin, pending.resolved);
    rmSync(marker, { force: true });
    this.applied = { headBefore: pending.head, headAfter, changedSessions: result.changedSessions, diagnostics: result.diagnostics };
  }

  /** The merge commit from the staged selection, or `spex` moved to the
   * host's commit where the selection equals its tree (space-19). */
  private async commitSelection(head: string, origin: string, resolved: Map<string, StorageChoice>): Promise<string> {
    const tree = await this.git.ok(["write-tree"]);
    const fastForward = await this.git.succeeds(["merge-base", "--is-ancestor", head, origin]);
    const originTree = await this.git.ok(["rev-parse", `${origin}^{tree}`]);
    let commit = origin;
    if (!(fastForward && tree === originTree)) {
      const chosen = [...resolved].filter(([, side]) => side === "theirs").map(([name]) => `remote: ${name}`);
      const kept = [...resolved].filter(([, side]) => side === "ours").map(([name]) => `mine: ${name}`);
      const message = `Merge the host's spex\n\n${[...chosen, ...kept].join("\n")}`;
      commit = await this.git.ok([...(await this.git.committerArgs()), "commit-tree", tree, "-p", head, "-p", origin, "-m", message]);
    }
    await this.git.ok(["update-ref", `refs/heads/${SPEX_BRANCH}`, commit, head]);
    return commit;
  }

  /** Step 5 — Refresh: re-validate and re-index the running core so every
   * view reflects the selected state (space-20). */
  private async refresh(): Promise<void> {
    const applied = this.applied as Applied;
    const store = this.host.store;
    this.refreshProblem = undefined;
    try { await validateStorageTree(this.dir, this.validation()); }
    catch (error) {
      this.refreshProblem = error instanceof StorageFormatError
        ? { file: error.file, reason: error.reason, blocking: true }
        : { file: this.dir, reason: error instanceof Error ? error.message : String(error), blocking: true };
    }
    store.reload();
    const configChanged = !(await this.git.succeeds(["diff", "--quiet", applied.headBefore, applied.headAfter, "--", "config/playbook.config.yaml"]));
    if (configChanged) await this.host.reloadConfig();
    await this.host.rescanSessions(this.key);
    this.host.ledgerChanged([this.key]);
    await this.releaseHoldings();
    this.unrelated = false;
    this.applied = undefined;
    // The lists are recomputed at Refresh (space-29): the working tree
    // now holds the selected state.
    await this.broadcast(true);
  }

  /** Step 6 — Push `spex` to the host, setting the upstream once (space-12). */
  private async push(remote: string, upstream: boolean, atHost: boolean): Promise<"ok" | "nothing" | "rejected"> {
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const origin = await this.git.run(["rev-parse", "-q", "--verify", `refs/remotes/origin/${SPEX_BRANCH}^{commit}`]);
    if (upstream && origin.code === 0 && origin.stdout.toString("utf8").trim() === head) return "nothing";
    const credential = atHost ? await this.owner.credentialFor(remote, "push") : null;
    let run: GitRun;
    try {
      run = await this.git.run(upstream ? ["push", "-q", "origin", SPEX_BRANCH] : ["push", "-q", "-u", "origin", SPEX_BRANCH], { transport: true, ...(credential ? { credential } : {}) });
    } finally {
      await credential?.dispose();
    }
    if (run.code === 0) {
      // The host now holds `spex`: later plans compare against it.
      this.remoteEmpty = false;
      await this.git.run(["update-ref", `refs/remotes/origin/${SPEX_BRANCH}`, head]);
      return "ok";
    }
    const failure = this.classify(run, remote, atHost);
    if (failure.cause === "rejected") return "rejected";
    throw new SpaceStopped("push", failure);
  }

  // -- repair (space-31) -----------------------------------------------------

  /** An interrupted apply is repaired from its marker before the core
   * reopens the clone; a failure stands as a blocking issue. */
  async repairAtStartup(): Promise<void> {
    if (!existsSync(this.markerPath())) return;
    try {
      await this.repair();
      this.host.store.reload();
    } catch (error) {
      this.repairFailure = error instanceof Error ? error.message : String(error);
    }
  }

  private async repairIfMarked(): Promise<void> {
    if (!existsSync(this.markerPath())) { this.repairFailure = undefined; return; }
    try {
      await this.repair();
      this.repairFailure = undefined;
      this.host.store.reload();
      await this.host.rescanSessions(this.key);
    } catch (error) {
      this.repairFailure = error instanceof Error ? error.message : String(error);
      throw new CoreError("invalid_request", `${APPLY_MARKER}: ${repairFailureReason(this.repairFailure)}`);
    }
  }

  private async repair(): Promise<void> {
    const dir = this.dir;
    const marker = readJsonFile(this.markerPath()) as Partial<ApplyMarker>;
    if (marker.v !== 1 || typeof marker.ours !== "string" || typeof marker.theirs !== "string" || typeof marker.base !== "string" || typeof marker.choices !== "object" || marker.choices === null) {
      // Both failures below reach the reader as the cause inside the
      // repair diagnostic's reason, so they are his words too.
      throw new Error(i18n._({
        id: "the repair marker is malformed",
        comment: "Why an interrupted sync's repair failed: the marker file it left cannot be read",
      }));
    }
    const version = await this.git.version();
    if (!version.ok) throw new Error(version.guidance);
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    if (head !== marker.ours) {
      // The ref update landed before the marker was removed — a merge
      // commit whose parents are the recorded sides, or a fast-forward
      // onto the host's commit: nothing is re-applied.
      const parents = (await this.git.ok(["log", "-1", "--format=%P", "HEAD"])).split(/\s+/).filter(Boolean);
      const landed = head === marker.theirs || (parents.includes(marker.ours) && parents.includes(marker.theirs));
      if (landed) { rmSync(this.markerPath(), { force: true }); return; }
      throw new Error(i18n._({
        id: "spex moved since the interrupted sync; resolve it in a terminal",
        comment: "Why an interrupted sync's repair failed; spex is the branch's own name",
      }));
    }
    const trees: StorageTrees = { ours: readStorageTree(dir, marker.ours), theirs: readStorageTree(dir, marker.theirs), base: readStorageTree(dir, marker.base) };
    const units = planStorageUnits(trees);
    const choices = marker.choices as Record<string, StorageChoice>;
    this.beginHolding();
    try {
      await this.acquireSessionLeases(units, "apply");
      await applyStorageSelection(dir, { ours: marker.ours, theirs: marker.theirs, base: marker.base, unrelated: marker.base === EMPTY_TREE, units }, choices, {
        holdsSessionLeases: true, prefsFile: prefsFileOf(this.host.home), validate: this.validation(),
      });
      await this.commitSelection(marker.ours, marker.theirs, resolveStorageChoices(units, choices));
      rmSync(this.markerPath(), { force: true });
    } finally { await this.releaseHoldings(); }
  }

  // -- diff (space-10) -------------------------------------------------------

  async diff(unit: string, path: string, side: SpaceChoice): Promise<{ patch: string; truncated: boolean }> {
    if (!this.lastPlan) await this.state(true);
    const plan = this.lastPlan;
    if (!plan) throw new CoreError("invalid_request", initializeFirst());
    const found = plan.units.find((u) => u.name === unit);
    if (!found) throw new CoreError("invalid_request", unknownUnit(unit));
    const kind = spaceUnitKind(unit);
    if (kind === "session" || kind === "intent" || kind === "authoring") {
      throw new CoreError("invalid_request", i18n._({
        id: "a session, an intent or an authoring session offers no text diff",
        comment: "Refusal: a diff was asked of a unit that is read as a summary, not as text",
      }));
    }
    if (!found.paths.includes(path)) {
      throw new CoreError("invalid_request", i18n._({
        id: "unknown path {path} in {unit}",
        values: { path, unit },
        comment: "Refusal: the diff names a path the unit does not hold",
      }));
    }
    if (side === "remote" && this.checkedAt === null) {
      throw new CoreError("invalid_request", i18n._({
        id: "Check the host first",
        comment: "Refusal: the remote's side was asked for before the remote was checked",
      }));
    }
    const args = ["diff", "--no-color", plan.base, side === "remote" ? plan.theirs : plan.oursTree, "--", path];
    const run = await this.git.run(args);
    if (run.code !== 0 && run.code !== 1) {
      throw new CoreError("invalid_request", lastLines(run.stderr) || i18n._({
        id: "Git could not diff",
        comment: "Refusal where git failed to diff and printed nothing",
      }));
    }
    const cut = capText(run.stdout.toString("utf8"), DIFF_CAP_BYTES, Number.MAX_SAFE_INTEGER);
    return { patch: cut.text, truncated: cut.truncated };
  }

  // -- explorer (space-35) ---------------------------------------------------

  /** Resolve a clone-relative path without following symlinks, confined
   * to the clone's real path. */
  private confine(rel: string | undefined, forRead: boolean): { rel: string; abs: string } {
    const root = realPath(this.dir);
    const given = rel ?? "";
    if (given.includes("\0") || isAbsolute(given)) {
      throw new CoreError("invalid_request", i18n._({
        id: "the path must be relative to the home",
        comment: "Refusal: the explorer was given an absolute path",
      }));
    }
    const parts = given.split(/[\\/]+/).filter((part) => part !== "" && part !== ".");
    if (parts.some((part) => part === "..")) throw new CoreError("invalid_request", escapesTheHome());
    if (parts[0] === ".git") {
      throw new CoreError("invalid_request", i18n._({
        id: "Git data is not browsed",
        comment: "Refusal: the explorer offers no view of the repository's own files",
      }));
    }
    let current = root;
    for (const part of parts) {
      current = join(current, part);
      let stat;
      try { stat = lstatSync(current); } catch { throw new CoreError("not_found", forRead ? noFileAt(parts.join("/")) : noFolderAt(parts.join("/"))); }
      if (stat.isSymbolicLink()) {
        throw new CoreError("invalid_request", i18n._({
          id: "the path goes through a symbolic link",
          comment: "Refusal: the explorer follows no symbolic link",
        }));
      }
    }
    if (!inside(current, root)) throw new CoreError("invalid_request", escapesTheHome());
    return { rel: parts.join("/"), abs: current };
  }

  private async sharingMarks(rel: string, names: { name: string; directory: boolean }[]): Promise<{ repo: boolean; tracked: Set<string>; status: Set<string>; ignored: Set<string> }> {
    const repo = await this.readRepository();
    if (!repo.root) return { repo: false, tracked: new Set(), status: new Set(), ignored: new Set() };
    const spec = rel === "" ? "." : rel;
    const tracked = new Set((await this.git.ok(["ls-files", "-z", "--", spec])).split("\0").filter(Boolean));
    const status = new Set<string>();
    for (const item of (await this.git.ok(["status", "--porcelain=v1", "-z", "-uall", "--", spec])).split("\0")) {
      if (item.length > 3) status.add(item.slice(3).replace(/\/$/, ""));
    }
    const candidates = names.map(({ name, directory }) => `${rel ? `${rel}/` : ""}${name}${directory ? "/" : ""}`);
    const ignored = new Set<string>();
    if (candidates.length > 0) {
      const run = await this.git.run(["check-ignore", "-z", "--stdin"], { input: candidates.join("\0") });
      if (run.code === 0 || run.code === 1) for (const item of run.stdout.toString("utf8").split("\0")) if (item) ignored.add(item.replace(/\/$/, ""));
    }
    return { repo: true, tracked, status, ignored };
  }

  async tree(path?: string): Promise<{ path: string; entries: SpaceEntry[] }> {
    const { rel, abs } = this.confine(path, false);
    let stat;
    try { stat = statSync(abs); } catch { throw new CoreError("not_found", noFolderAt(rel)); }
    if (!stat.isDirectory()) {
      throw new CoreError("invalid_request", rel
        ? i18n._({
            id: "{path} is not a folder",
            values: { path: rel },
            comment: "Refusal: the explorer was asked to list something that is no folder",
          })
        : i18n._({
            id: "the home is not a folder",
            comment: "Refusal: the home itself is no folder",
          }));
    }
    const dirents = readdirSync(abs, { withFileTypes: true });
    const marks = await this.sharingMarks(rel, dirents.filter((d) => d.name !== ".git").map((d) => ({ name: d.name, directory: d.isDirectory() })));
    const entries: SpaceEntry[] = [];
    const sorted = [...dirents].sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const dirent of sorted) entries.push(this.entry(rel, dirent, marks));
    return { path: rel, entries };
  }

  private entry(parent: string, dirent: Dirent, marks: Awaited<ReturnType<RepositorySync["sharingMarks"]>>): SpaceEntry {
    const rel = parent ? `${parent}/${dirent.name}` : dirent.name;
    const abs = join(realPath(this.dir), rel);
    if (rel === ".git") return { name: dirent.name, path: rel, kind: "git", family: "Git data", sync: "git", preview: "none" };
    if (dirent.isSymbolicLink()) return { name: dirent.name, path: rel, kind: "file", family: "Not a Spex file", sync: "local", preview: "none" };
    const directory = dirent.isDirectory();
    const family = spaceFamily(rel, directory);
    const under = (set: Set<string>): boolean => { for (const item of set) if (item === rel || item.startsWith(`${rel}/`)) return true; return false; };
    let sync: SpaceEntry["sync"];
    if (LOCAL_FAMILIES.has(family)) sync = "local";
    else if (!marks.repo) sync = "pending";
    else if (marks.ignored.has(rel)) sync = "local";
    // A directory of a tracked kind holding nothing committed — an empty
    // sessions/ or intents/ — is not yet shared; "Stays here" is for the
    // ignored families alone (space-23).
    else if (directory) sync = under(marks.tracked) && !under(marks.status) ? "shared" : "pending";
    else sync = marks.status.has(rel) ? "pending" : marks.tracked.has(rel) ? "shared" : "pending";
    const owner = this.ownerOf(rel);
    if (directory) {
      let count: number | undefined;
      try { count = readdirSync(abs).length; } catch { count = undefined; }
      return { name: dirent.name, path: rel, kind: "dir", family, sync, ...(count !== undefined ? { count } : {}), ...(owner ? { owner } : {}), preview: "none" };
    }
    let size: number | undefined;
    let mtime: number | undefined;
    try { const stat = statSync(abs); size = stat.size; mtime = Math.round(stat.mtimeMs); } catch { /* vanished */ }
    const preview: SpaceEntry["preview"] = WITHHELD_FAMILIES.has(family) ? "withheld" : this.textual(abs, dirent.name) ? "text" : "binary";
    return { name: dirent.name, path: rel, kind: "file", family, sync, ...(size !== undefined ? { size } : {}), ...(mtime !== undefined ? { mtime } : {}), ...(owner ? { owner } : {}), preview };
  }

  private ownerOf(rel: string): SpaceEntry["owner"] | undefined {
    const session = /^sessions\/([0-9a-f-]{36})\.(?:json|records\.jsonl|hints\.json|spex\.json|assets)$/.exec(rel);
    if (session && UUID.test(session[1])) {
      const info = this.host.store.describeSession(session[1]);
      return { sessionId: session[1], ...(info?.title ? { title: info.title } : {}) };
    }
    const intent = /^intents\/([0-9a-f-]{36})\.(?:json|assets)$/.exec(rel);
    if (intent && UUID.test(intent[1])) {
      const info = this.host.store.getIntent(intent[1]);
      const title = info ? info.text.trim().split("\n")[0]?.trim() || info.attachments?.map((asset) => asset.name).filter(Boolean).join(", ") : undefined;
      return { intentId: intent[1], ...(title ? { title } : {}) };
    }
    return undefined;
  }

  private textual(abs: string, name: string): boolean {
    if (TEXT_EXTENSIONS.test(name) || name === ".gitignore" || name === ".gitattributes") return true;
    try {
      const fd = openSync(abs, "r");
      try {
        const head = Buffer.alloc(8_192);
        const read = readSync(fd, head, 0, head.length, 0);
        return !head.subarray(0, read).includes(0);
      } finally { closeSync(fd); }
    } catch { return false; }
  }

  async read(path: string): Promise<SpaceReadResult> {
    const { rel, abs } = this.confine(path, true);
    let stat;
    try { stat = statSync(abs); } catch { throw new CoreError("not_found", noFileAt(rel)); }
    if (!stat.isFile()) {
      throw new CoreError("invalid_request", i18n._({
        id: "{path} is not a file",
        values: { path: rel },
        comment: "Refusal: the explorer was asked to read something that is no file",
      }));
    }
    const family = spaceFamily(rel, false);
    if (WITHHELD_FAMILIES.has(family)) return { kind: "withheld", reason: withheldReason() };
    const fd = openSync(abs, "r");
    let bytes: Buffer;
    try {
      const want = Math.min(stat.size, READ_CAP_BYTES + 1);
      bytes = Buffer.alloc(want);
      const read = readSync(fd, bytes, 0, want, 0);
      bytes = bytes.subarray(0, read);
    } finally { closeSync(fd); }
    if (bytes.subarray(0, 8_192).includes(0)) return { kind: "binary", size: stat.size };
    let text = bytes.toString("utf8");
    if (basename(rel).endsWith(".json") && stat.size <= READ_CAP_BYTES) {
      try { text = `${JSON.stringify(JSON.parse(text), null, 2)}\n`; } catch { /* shown as written */ }
    }
    const cut = capText(text, READ_CAP_BYTES, READ_CAP_LINES);
    return { kind: "text", text: cut.text, lines: cut.lines, truncated: cut.truncated || stat.size > READ_CAP_BYTES };
  }
}

/** Every spex repository's machine and the Groups state they make. */
export class SpaceManager {
  private readonly machines = new Map<string, RepositorySync>();
  /** Runs Git for the questions no one clone answers. */
  private readonly probe: SpaceGit;
  private publishing?: Promise<void>;
  private republish = false;
  /** The host's last answer (git-host-5), held until the next read. */
  private view?: HostView;
  /** The host's name and Git origin as last read, kept past a sign-out
   * so a clone on the host is still known for one. */
  private described?: { displayName: string; gitOrigin: string };
  /** The last read's failure, in the reader's words, until a read
   * succeeds (git-host-5). */
  private readFailure?: string;
  private reading?: Promise<HostView>;
  /** The sign-in shown on the header (space-30). */
  private signInState: GroupsState["signIn"] = { phase: "idle" };
  private flow?: { cancel(): void };
  private settingUp?: Promise<void>;
  /** Steps at the host waiting for a member with the rights (space-64),
   * by the clone's key; asked again at the next read. */
  private readonly waiting = new Map<string, Waiting>();
  /** Joins in flight or stopped, by the host's id (space-63). */
  private readonly joining = new Map<string, SpaceSyncPhase>();
  /** Picks being asked of the host, by key. */
  private readonly picking = new Set<string>();

  constructor(private readonly host: SpaceHost) {
    this.probe = new SpaceGit(host.home, host.env, host.transportTimeoutMs !== undefined ? { transportTimeoutMs: host.transportTimeoutMs } : {});
  }

  // -- the account (git-host-2..4, git-host-10) ------------------------------

  /** Whether the home is signed in to the Git host. */
  signedIn(): boolean {
    return this.host.store.home.account() !== null;
  }

  /** The host's display name, or its URL's host name before any read
   * (space-15: a report names the host by its display name). */
  hostName(): string {
    const name = this.view?.displayName ?? this.described?.displayName;
    if (name) return name;
    try { return new URL(this.host.store.home.host.url).hostname; } catch { return this.host.store.home.host.url; }
  }

  /** The commit identity of a signed-in home (space-32): the account's
   * display name or login, at the host's no-reply address. */
  identity(): { name: string; email: string } | null {
    const account = this.host.store.home.account();
    if (!account) return null;
    let domain: string;
    try { domain = new URL(this.host.store.home.host.url).hostname; } catch { domain = "localhost"; }
    return { name: account.displayName || account.login, email: `${account.login}@users.noreply.${domain}` };
  }

  private knownOrigin(): string | undefined {
    return this.view?.gitOrigin ?? this.described?.gitOrigin;
  }

  /** The Git origin the host's credentials are valid for (git-host-9):
   * as the last read named it, else asked of the host — a call needing
   * no token — and kept as a read's is; undefined where the host cannot
   * say. */
  async gitOrigin(): Promise<string | undefined> {
    const known = this.knownOrigin();
    if (known) return known;
    try {
      const described = await this.host.client.describe();
      if (!described.gitOrigin) return undefined;
      this.described = { displayName: described.displayName, gitOrigin: described.gitOrigin };
      return described.gitOrigin;
    } catch {
      return undefined;
    }
  }

  /** The brokered credential for a Git source at the host's Git origin
   * (environments-13, git-host-9), asked of the host each time; none for
   * a source at any other origin, nor while signed out, where this
   * device's own Git fetches it. A refusal reads as the host said. */
  async sourceCredential(repo: string): Promise<{ username: string; secret: string } | undefined> {
    if (!this.signedIn()) return undefined;
    const origin = await this.gitOrigin();
    if (!origin || !underOrigin(repo, origin)) return undefined;
    try {
      const credential = await this.host.client.credential(origin);
      return { username: credential.username, secret: credential.secret };
    } catch (error) {
      throw new Error(relayHostError(error, this.hostName()));
    }
  }

  /** Whether a clone lies on the Git host: it records the host's id, or
   * its remote is under the host's Git origin (git-host-9). */
  private atHost(facts: CloneFacts): boolean {
    return facts.remote !== null && (facts.id !== null || underOrigin(facts.remote, this.knownOrigin()));
  }

  /** Whether a URL the reader names lies at the Git host's own origin
   * (space-5): those are the host's to hand over. */
  async atHostOrigin(url: string): Promise<boolean> {
    return underOrigin(url, this.knownOrigin()) || underOrigin(url, this.host.store.home.host.url);
  }

  /** Start the configured sign-in flow (git-host-2, git-host-3): its
   * shape goes back at once, and its end sets the home up (space-4). */
  async signInStart(): Promise<{ flow: "browser"; url: string } | { flow: "device"; userCode: string; verificationUri: string; expiresAt: number }> {
    if (this.flow || this.signInState.phase === "running" || this.host.client.signingIn()) throw new CoreError("busy", signInRunning());
    const kind = this.host.signInFlow;
    let started: { kind: "browser"; flow: BrowserSignIn } | { kind: "device"; flow: DeviceSignIn };
    try {
      started = kind === "browser"
        ? { kind, flow: await this.host.client.startBrowserSignIn({ pages: callbackPages() }) }
        : { kind, flow: await this.host.client.startDeviceSignIn() };
    } catch (error) {
      if (error instanceof SignInBusyError) throw new CoreError("busy", signInRunning());
      const failure = signInFailure(error, this.hostName());
      this.signInState = failure ? { phase: "failed", ...failure } : { phase: "idle" };
      void this.publish();
      throw new CoreError("invalid_request", failure?.message ?? relayHostError(error, this.hostName()));
    }
    const flow = started.flow;
    this.flow = flow;
    this.signInState = started.kind === "browser"
      ? { phase: "running", flow: "browser", since: Date.now() }
      : { phase: "running", flow: "device", userCode: started.flow.userCode, verificationUri: started.flow.verificationUri, since: Date.now() };
    void this.publish();
    void flow.done.then(
      (account) => this.signedInAs(account),
      (error: unknown) => this.signInEnded(error),
    );
    return started.kind === "browser"
      ? { flow: "browser", url: started.flow.url }
      : { flow: "device", userCode: started.flow.userCode, verificationUri: started.flow.verificationUri, expiresAt: started.flow.expiresAt };
  }

  /** Stop the running sign-in; false where none runs. */
  signInCancel(): boolean {
    const flow = this.flow;
    if (!flow) return false;
    flow.cancel();
    return true;
  }

  private async signedInAs(account: HostAccount): Promise<void> {
    this.flow = undefined;
    try {
      this.host.store.signIn(account);
      this.view = undefined;
      this.readFailure = undefined;
      await this.publish();
      await this.setUp();
    } catch (error) {
      console.error(`spex: setting the home up for the account failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.signInState = { phase: "idle" };
      await this.publish();
    }
  }

  private signInEnded(error: unknown): void {
    this.flow = undefined;
    const failure = signInFailure(error, this.hostName());
    this.signInState = failure ? { phase: "failed", ...failure } : { phase: "idle" };
    void this.publish();
  }

  /** The host signed this device out (git-host-4): the credential is
   * gone, the account kept and marked signed out. */
  signedOutByHost(): void {
    this.host.store.signOut();
    this.view = undefined;
    void this.publish();
  }

  /** Sign out (git-host-10): revoke at the host, tried once, forget the
   * credential, keep every clone and record. */
  async signOut(): Promise<GroupsState> {
    const busy = this.busy();
    if (busy) throw new CoreError("busy", busy);
    this.flow?.cancel();
    await this.host.client.signOut();
    this.host.store.signOut();
    this.view = undefined;
    this.readFailure = undefined;
    this.waiting.clear();
    this.joining.clear();
    for (const machine of this.machines.values()) machine.hostOverride = undefined;
    const state = await this.state();
    this.host.broadcast(state);
    return state;
  }

  /** Refresh (space-2): read the host, and finish what a sign-in left
   * for the next read (space-4, space-64). */
  refresh(): { accepted: true } {
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    void this.setUp().catch((error: unknown) => {
      console.error(`spex: refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    return { accepted: true };
  }

  /** The account's set-up, in order (space-4): your own group renamed
   * after the login, the host read, your own group's spex repository on
   * the host, and every step left waiting asked again. */
  private setUp(): Promise<void> {
    if (this.settingUp) return this.settingUp;
    const work = this.runSetUp().finally(() => { if (this.settingUp === work) this.settingUp = undefined; });
    this.settingUp = work;
    return work;
  }

  private async runSetUp(): Promise<void> {
    const account = this.host.store.home.account();
    if (!account) return;
    const renamed = await this.renameOwn(account);
    let view: HostView;
    try { view = await this.readHost(); } catch { return; }
    if (renamed !== "busy") await this.ensureOwnOnHost(view);
    await this.retryWaiting(view);
    await this.publish();
  }

  /** Read the host (git-host-5): one read at a time, the answer held as
   * the current view, a failure keeping the previous view and its time. */
  readHost(): Promise<HostView> {
    if (this.reading) return this.reading;
    const work = (async (): Promise<HostView> => {
      try {
        const view = await readHostView(this.host.client);
        this.view = view;
        this.described = { displayName: view.displayName, gitOrigin: view.gitOrigin };
        this.readFailure = undefined;
        // A clone matched by its remote records the host's id (git-host-5).
        for (const repository of this.host.store.listRepositories()) {
          const machine = this.machine(repository.key);
          machine.hostOverride = undefined;
          if (machine.facts.id === null && machine.facts.remote !== null) {
            const listing = listingFor(view, null, machine.facts.remote);
            if (listing) await machine.recordId(listing.repository.id);
          }
        }
        return view;
      } catch (error) {
        if (error instanceof HostError && error.kind === "reauth" && this.signedIn()) this.signedOutByHost();
        this.readFailure = relayHostError(error, this.hostName());
        throw error;
      } finally {
        this.reading = undefined;
        void this.publish();
      }
    })();
    this.reading = work;
    work.catch(() => undefined);
    return work;
  }

  // -- your own group (space-4, space-59, space-65) ---------------------------

  /** Rename your own group's folder and its spex repository after the
   * account's login (space-59): every clone beneath it moves, every pair
   * naming one is rewritten, in one step while nothing beneath runs. */
  private async renameOwn(account: HostAccount): Promise<"none" | "done" | "busy"> {
    const store = this.host.store;
    const target = ownNameFor(account.login);
    const current = store.home.ownName;
    if (!target || target === current) return "none";
    const keys = store.listRepositories().map((repository) => repository.key).filter((key) => key.startsWith(`${current}/`));
    const ownFrom = `${current}/${current}-spex`;
    const ownTo = `${target}/${target}-spex`;
    const moves = keys.map((key) => ({ from: key, to: key === ownFrom ? ownTo : `${target}/${key.slice(current.length + 1)}` }));
    if (moves.some((move) => existsSync(store.home.clonePath(move.to)))) return "busy";
    const held: RepositorySync[] = [];
    try {
      for (const key of keys) {
        const machine = this.machine(key);
        if (!machine.hold("move", "apply")) return "busy";
        held.push(machine);
      }
      await this.publish();
      for (const key of keys) if (await this.host.blocker(key)) return "busy";
      for (const move of moves) {
        const to = store.home.clonePath(move.to);
        mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
        renameSync(store.home.clonePath(move.from), to);
      }
      pruneEmptyFolders(join(store.home.workspace, current), store.home.workspace);
      this.relocate(moves, target);
      await this.afterMove(moves);
      return "done";
    } finally {
      for (const machine of held) machine.release();
    }
  }

  /** Your own group's spex repository on the host (space-4, space-65):
   * joined where the host lists one, else created and pushed. */
  private async ensureOwnOnHost(view: HostView): Promise<void> {
    const store = this.host.store;
    const key = store.home.own();
    if (!store.repository(key) || this.waiting.has(key)) return;
    const machine = this.machine(key);
    const facts = await machine.readFacts();
    if (facts.remote !== null) return;
    const user = userGroup(view);
    const group = { id: user?.id ?? null, fullPath: user?.fullPath ?? store.home.ownName };
    const name = splitKey(key).name;
    const listed = view.listings.find((listing) => listing.repository.group.fullPath === group.fullPath && listing.repository.path === name);
    if (listed) {
      await this.adopt(machine, listed.repository, true);
      return;
    }
    await this.create(machine, group, name, repositoryDescription({ kind: "group", group: group.fullPath }), "quiet");
  }

  /**
   * A group's spex repository on the host at its first session (space-65):
   * joined where the host lists `<group>-spex` in that group, else created
   * there and pushed. A refused creation leaves the clone local only with
   * its waiting phrase (space-64); nothing here refuses the session.
   */
  async ensureGroupRepository(key: string): Promise<"unchanged" | "local" | "joined" | "created" | "waiting"> {
    try {
      const store = this.host.store;
      const { group, name } = splitKey(key);
      if (name !== `${group.split("/").pop()}-spex` || key === store.home.own() || !store.repository(key)) return "unchanged";
      if (this.waiting.has(key)) return "waiting";
      const machine = this.machine(key);
      const facts = await machine.readFacts();
      if (facts.remote !== null) return "unchanged";
      if (!this.signedIn()) return "local";
      const view = this.view ?? await this.readHost();
      const listed = view.listings.find((listing) => listing.repository.group.fullPath === group && listing.repository.path === name);
      if (listed) {
        await this.adopt(machine, listed.repository, true);
        return "joined";
      }
      const hostGroup = view.groups.find((entry) => entry.fullPath === group);
      if (!hostGroup) return "local";
      return await this.create(machine, { id: hostGroup.id, fullPath: hostGroup.fullPath }, name, repositoryDescription({ kind: "group", group }), "quiet");
    } catch (error) {
      console.error(`spex: ${key} stays on this device: ${error instanceof Error ? error.message : String(error)}`);
      return "local";
    }
  }

  // -- picks, creations and joins (space-58, space-63, space-64) --------------

  /** Give a clone the host's repository and sync it — a join of two
   * histories where `join` (space-13), a first push otherwise. */
  private async adopt(machine: RepositorySync, repository: HostRepository, join: boolean): Promise<void> {
    await machine.attachHost(repository.remoteUrl, repository.id);
    this.waiting.delete(machine.key);
    await this.publish();
    this.startSync(machine.key, { join });
  }

  /** Ask the host to create `name` in a group for a clone (git-host-6). */
  private async create(
    machine: RepositorySync,
    group: { id: string | null; fullPath: string },
    name: string,
    description: string,
    mode: "refuse" | "quiet",
  ): Promise<"created" | "waiting" | "local"> {
    const key = machine.key;
    const ask = { groupId: group.id, name, description };
    let answer: Awaited<ReturnType<GitHostClient["create"]>>;
    try {
      answer = await this.host.client.create(ask);
    } catch (error) {
      if (mode === "refuse") {
        throw new CoreError("invalid_request", error instanceof HostError && error.kind === "name_taken"
          ? nameTaken(name, group.fullPath)
          : relayHostError(error, this.hostName()));
      }
      // The refusal stands on the row with the host's words, and the
      // creation is asked again at the next read (space-4, space-64).
      this.waiting.set(key, { step: "create", group: group.fullPath, message: relayHostError(error, this.hostName()), create: ask });
      await this.publish();
      return "waiting";
    }
    if (answer.status === "pending") {
      this.waiting.set(key, { step: "create", group: group.fullPath, message: answer.message, create: ask });
      await this.publish();
      return "waiting";
    }
    await this.adopt(machine, answer.repository, false);
    return "created";
  }

  /** Every step left waiting, asked again at a read (space-64): a
   * creation a member with the rights did is found and joined. */
  private async retryWaiting(view: HostView): Promise<void> {
    for (const [key, waiting] of [...this.waiting]) {
      if (!this.host.store.repository(key)) { this.waiting.delete(key); continue; }
      const machine = this.machine(key);
      if (waiting.step === "create" && waiting.create) {
        const ask = waiting.create;
        const found = view.listings.find((listing) => listing.repository.group.fullPath === waiting.group && listing.repository.path === ask.name);
        this.waiting.delete(key);
        if (found) await this.adopt(machine, found.repository, true);
        else await this.create(machine, { id: ask.groupId, fullPath: waiting.group }, ask.name, ask.description, "quiet");
        continue;
      }
      const listing = listingFor(view, machine.facts.id, machine.facts.remote);
      if (!listing) continue;
      if (listing.branchPresent) { this.waiting.delete(key); continue; }
      try {
        const answer = await this.host.client.prepareBranch(listing.repository.id);
        if (answer.status === "ready") {
          this.waiting.delete(key);
          this.startSync(key, {});
        } else this.waiting.set(key, { ...waiting, message: answer.message });
      } catch (error) {
        this.waiting.set(key, { ...waiting, message: relayHostError(error, this.hostName()) });
      }
    }
  }

  private startSync(key: string, input: { join?: boolean }): void {
    const machine = this.machines.get(key);
    if (!machine) return;
    machine.sync({ ...input, internal: true }).catch((error: unknown) => {
      console.error(`spex: ${key} did not start syncing: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** Pick a group for a local-only spex repository (space-58): join a
   * listed one, or create `<name>-spex` in a group. */
  async pick(key: string, choice: { kind: "join"; hostId: string } | { kind: "create"; groupId: string | null; name: string }, noticed = false): Promise<{ accepted: true }> {
    const machine = this.machine(key);
    machine.assertNotRunning();
    if (this.picking.has(key)) throw new CoreError("busy", i18n._({ id: "Already syncing", comment: "Refusal of a second operation on a spex repository while one runs" }));
    this.picking.add(key);
    try {
      const facts = await machine.readFacts();
      if (facts.remote !== null) {
        throw new CoreError("invalid_request", i18n._({ id: "{name} is on the host already", values: { name: splitKey(key).name }, comment: "Refusal of a pick: the spex repository is not local only" }));
      }
      if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
      const view = this.view ?? await this.readHost().catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.hostName())); });
      if (choice.kind === "join") {
        const listing = view.listings.find((entry) => entry.repository.id === choice.hostId);
        if (!listing) throw new CoreError("not_found", noLongerShared());
        // Joining pushes this clone's records into a repository others
        // read: the notice is seen first (space-57).
        const store = this.host.store;
        if (noticed) store.setPref(noticedPref(key), true);
        else if (!listing.readOnly && (listing.members ?? 0) > 1 && store.getPref<unknown>(noticedPref(key)) !== true) {
          throw new CoreError("invalid_request", i18n._({
            id: "Read the sharing notice before joining {name}",
            values: { name: listing.repository.path },
            comment: "Refusal of a pick joining a spex repository with other members until the reader has seen the privacy notice",
          }), { notice: true, members: listing.members, visibility: listing.repository.visibility });
        }
        await this.adopt(machine, listing.repository, true);
        return { accepted: true };
      }
      const base = kebab(choice.name.trim().replace(/-spex$/i, ""));
      if (!base) {
        throw new CoreError("invalid_request", i18n._({ id: "The name must hold a letter or a digit", comment: "Refusal of a new spex repository's name with nothing of a name in it" }));
      }
      const group = choice.groupId === null
        ? (userGroup(view) ?? { id: null, fullPath: this.host.store.home.ownName })
        : view.groups.find((entry) => entry.id === choice.groupId);
      if (!group) throw new CoreError("not_found", i18n._({ id: "The host lists no such group", comment: "Refusal of a pick naming a group the Git host does not list" }));
      const project = this.projectFile(machine.repository);
      await this.create(machine, { id: group.id, fullPath: group.fullPath }, `${base}-spex`,
        repositoryDescription({ kind: "project", name: project?.name ?? base, code: project?.remote ?? null }), "refuse");
      return { accepted: true };
    } finally {
      this.picking.delete(key);
    }
  }

  private projectFile(repository: SpexRepository): { name: string; remote: string | null } | undefined {
    try {
      const value = existsSync(repository.projectFile) ? readJsonFile(repository.projectFile) as { name?: unknown; remote?: unknown } : undefined;
      if (!value) return undefined;
      return { name: typeof value.name === "string" ? value.name : splitKey(repository.key).name, remote: typeof value.remote === "string" ? value.remote : null };
    } catch { return undefined; }
  }

  /** Join a spex repository the host lists and this device lacks
   * (space-63): clone it under `workspace/<group>/`, then the code into
   * `folder`, and pair the two. */
  async join(hostId: string, folder?: string): Promise<{ accepted: true }> {
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    const view = this.view ?? await this.readHost().catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.hostName())); });
    const listing = view.listings.find((entry) => entry.repository.id === hostId);
    if (!listing) throw new CoreError("not_found", noLongerShared());
    const key = hostKey(listing.repository);
    if (!key) {
      throw new CoreError("invalid_request", i18n._({ id: "{path} cannot stand as a folder on this device", values: { path: `${listing.repository.group.fullPath}/${listing.repository.path}` }, comment: "Refusal of a join: the host's names hold characters a folder under the home cannot" }));
    }
    const store = this.host.store;
    const here = store.listRepositories().some((repository) => {
      const facts = this.machine(repository.key).facts;
      return facts.id === hostId || listingFor(view, facts.id, facts.remote)?.repository.id === hostId;
    });
    if (here || store.repository(key) || existsSync(store.home.clonePath(key))) {
      throw new CoreError("invalid_request", i18n._({ id: "{name} is on this device already", values: { name: listing.repository.path }, comment: "Refusal of a join: the spex repository has a clone here" }));
    }
    if (this.joining.get(hostId)?.phase === "running") throw new CoreError("busy", i18n._({ id: "Already syncing", comment: "Refusal of a second operation on a spex repository while one runs" }));
    const path = folder === undefined ? undefined : resolve(folder);
    if (path !== undefined && store.home.keyForFolder(path)) {
      throw new CoreError("invalid_request", i18n._({ id: "{path} is another project's working folder", values: { path }, comment: "Refusal of a join: the folder named is paired already" }));
    }
    this.joining.set(hostId, { phase: "running", op: "join", step: "check", since: Date.now(), cancelable: false });
    await this.publish();
    void this.runJoin(listing, key, path);
    return { accepted: true };
  }

  private async runJoin(listing: HostListing, key: string, folder: string | undefined): Promise<void> {
    const store = this.host.store;
    const id = listing.repository.id;
    const url = listing.repository.remoteUrl;
    const dir = store.home.clonePath(key);
    const stop = (failure: GitFailure): void => {
      this.joining.set(id, { phase: "stopped", op: "join", step: "check", ...failure });
    };
    try {
      mkdirSync(dirname(dir), { recursive: true, mode: 0o700 });
      let credential: GitCredentialHandle | null;
      try { credential = await this.credentialFor(url, "check"); }
      catch (error) {
        if (error instanceof SpaceStopped) { stop(error.failure); return; }
        throw error;
      }
      // Sessions are private: the clone is written owner-only (space-32).
      const umask = process.umask(0o077);
      let run: GitRun;
      try {
        const options = { transport: true, ...(credential ? { credential } : {}) };
        run = await this.probe.run(["clone", "-q", "--branch", SPEX_BRANCH, "--single-branch", url, dir], options);
        if (run.code !== 0 && /Remote branch \S+ not found|not found in upstream/i.test(run.stderr)) {
          // The host holds no `spex` yet: its default branch, then `spex`
          // beside it (space-32).
          rmSync(dir, { recursive: true, force: true });
          run = await this.probe.run(["clone", "-q", url, dir], options);
          if (run.code === 0) run = await this.probe.run(["-C", dir, "checkout", "-q", "-b", SPEX_BRANCH]);
        }
      } finally {
        process.umask(umask);
        await credential?.dispose();
      }
      if (run.code !== 0) {
        rmSync(dir, { recursive: true, force: true });
        stop(credential ? classifyHostTransportFailure(run, this.hostName()) : classifyTransportFailure(run, url));
        return;
      }
      await this.probe.run(["-C", dir, "config", "spex.repositoryId", id]);
      this.joining.delete(id);
      store.adoptRepositories();
      this.host.repositoriesChanged();
      const machine = this.machine(key);
      await machine.readFacts();
      await this.host.rescanSessions(key);
      this.host.ledgerChanged([key]);
      if (folder !== undefined) await this.pairJoined(machine, folder);
    } catch (error) {
      stop({ cause: "git", message: lastLines(error instanceof Error ? error.message : String(error)), guidance: retryGuidance(), retry: true });
    } finally {
      await this.publish();
    }
  }

  /** The joined clone's working folder (space-63): the code cloned from
   * the remote its `project.json` names with this device's own Git and
   * credentials, or a folder already holding it, paired with the clone;
   * a group's own spex repository pairs the folder its sessions run in. */
  private async pairJoined(machine: RepositorySync, folder: string): Promise<void> {
    if (!machine.hold("join", "check")) return;
    await this.publish();
    let failure: GitFailure | undefined;
    try {
      const project = this.projectFile(machine.repository);
      const root = existsSync(folder) && await this.workTreeRoot(folder);
      if (!root && project?.remote) {
        mkdirSync(dirname(folder), { recursive: true });
        const run = await this.probe.run(["clone", "-q", project.remote, folder], { transport: true });
        if (run.code !== 0) {
          failure = {
            cause: run.killed ?? "git",
            message: lastLines(run.stderr) || i18n._({ id: "Git could not clone the code", comment: "A join's stop where git failed to clone the code and printed nothing" }),
            guidance: i18n._({ id: "The spex repository is here; choose a folder for its code to pair it.", comment: "Guidance after a join's code clone failed" }),
            retry: false,
          };
          return;
        }
      }
      mkdirSync(folder, { recursive: true });
      this.host.store.rebindProject({ id: machine.key, path: folder });
      this.host.repositoriesChanged();
      await this.host.rescanSessions(machine.key);
      this.host.ledgerChanged([machine.key]);
    } catch (error) {
      failure = { cause: "git", message: lastLines(error instanceof Error ? error.message : String(error)), guidance: retryGuidance(), retry: false };
    } finally {
      machine.release(failure ? { op: "join", step: "check", failure } : undefined);
    }
  }

  private async workTreeRoot(folder: string): Promise<boolean> {
    try {
      const run = await this.probe.run(["-C", folder, "rev-parse", "--show-toplevel"]);
      return run.code === 0 && realPath(run.stdout.toString("utf8").trim()) === realPath(folder);
    } catch { return false; }
  }

  /** A spex repository's members as the host reports them (space-62,
   * git-host-8), read on each ask and held nowhere. */
  async members(key: string): Promise<{ members: { id: string; login: string; displayName: string | null; role: string; url: string | null }[]; membersUrl: string }> {
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    let id: string | null;
    if (this.host.store.repository(key)) {
      const facts = await this.machine(key).readFacts();
      if (facts.remote === null) {
        throw new CoreError("invalid_request", i18n._({ id: "Only on this device", comment: "A spex repository's state: it has no remote on the Git host" }));
      }
      id = facts.id ?? listingFor(this.view, null, facts.remote)?.repository.id ?? null;
    } else {
      id = this.view?.listings.find((listing) => hostKey(listing.repository) === key)?.repository.id ?? null;
      if (id === null) {
        throw new CoreError("not_found", i18n._({ id: "no spex repository {key} on this device", comment: "Refusal: the key names no clone under workspace/", values: { key } }));
      }
    }
    if (id === null) throw new CoreError("not_found", noLongerShared());
    try {
      const answer = await this.host.client.members(id);
      return { members: answer.members.map((member) => ({ ...member })), membersUrl: answer.membersUrl };
    } catch (error) {
      throw new CoreError(error instanceof HostError && error.kind === "not_found" ? "not_found" : "invalid_request", relayHostError(error, this.hostName()));
    }
  }

  // -- the sync against the host (space-11, space-12, space-60) ---------------

  /** The admission of space-11 the host decides: a clone on the host
   * needs a sign-in, and its first push into a repository with other
   * members needs the notice seen (space-57). */
  async admit(machine: RepositorySync, input: { push: boolean; noticed: boolean }): Promise<void> {
    const facts = machine.facts;
    if (!this.atHost(facts)) return;
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    if (!input.push || input.noticed) return;
    const store = this.host.store;
    if (store.getPref<unknown>(noticedPref(machine.key)) === true || store.getPref<unknown>(lastSyncPref(machine.key)) !== undefined) return;
    let view = this.view;
    if (!view) { try { view = await this.readHost(); } catch { return; } }
    const listing = listingFor(view, facts.id, facts.remote);
    if (!listing || listing.readOnly || (listing.members ?? 0) <= 1) return;
    throw new CoreError("invalid_request", i18n._({
      id: "Read the sharing notice before the first sync of {name}",
      values: { name: splitKey(machine.key).name },
      comment: "Refusal of a first push into a spex repository with other members until the reader has seen the privacy notice",
    }), { notice: true, members: listing.members, visibility: listing.repository.visibility });
  }

  /** The Check step's read of the host for one clone (space-12): follow
   * a rename or a transfer on a sync (space-60), take the URL the host
   * hands over, and prepare the branch before a first push (git-host-7).
   * Undefined for a clone whose remote is not on the host. */
  async hostCheck(machine: RepositorySync, op: SpaceOp): Promise<{ remote: string; readOnly: boolean } | undefined> {
    const facts = await machine.readFacts();
    if (!this.atHost(facts)) return undefined;
    if (!this.signedIn()) throw new SpaceStopped("check", { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
    let view: HostView;
    try { view = await this.readHost(); }
    catch (error) { throw hostStop("check", error, this.hostName()); }
    const listing = listingFor(view, facts.id, facts.remote);
    if (!listing) {
      machine.hostOverride = { state: "unreachable", reason: noLongerShared() };
      throw new SpaceStopped("check", { cause: "gone", message: noLongerShared(), guidance: nothingDeleted(), retry: true });
    }
    const repository = listing.repository;
    if (facts.id === null) await machine.recordIdNow(repository.id);
    const key = hostKey(repository);
    if (op === "sync" && key && key !== machine.key) await this.moveInSync(machine, key);
    if (facts.remote !== repository.remoteUrl) await machine.setOrigin(repository.remoteUrl);
    const readOnly = listing.readOnly !== null;
    if (!readOnly && !listing.branchPresent) {
      // `spex` beside the default branch, never as it (git-host-7).
      const group = repository.group.fullPath;
      if (repository.empty) {
        this.waiting.set(machine.key, { step: "branch", group, message: "" });
        throw new SpaceStopped("check", { cause: "refused", message: i18n._({ id: "{host} holds no default branch for it yet", values: { host: this.hostName() }, comment: "A stopped sync: the host's repository is empty, so spex waits for its default branch; {host} is its display name" }), guidance: syncLater(), retry: true });
      }
      let answer: Awaited<ReturnType<GitHostClient["prepareBranch"]>>;
      try { answer = await this.host.client.prepareBranch(repository.id); }
      catch (error) { throw hostStop("check", error, this.hostName()); }
      if (answer.status === "pending") {
        this.waiting.set(machine.key, { step: "branch", group, message: answer.message });
        throw new SpaceStopped("check", { cause: "refused", message: waitingPhrase("branch", group, answer.message), guidance: syncLater(), retry: true });
      }
      if (this.waiting.get(machine.key)?.step === "branch") this.waiting.delete(machine.key);
    }
    return { remote: repository.remoteUrl, readOnly };
  }

  /** The brokered credential for a transport to the host's Git origin
   * (git-host-9); none for any other origin. */
  async credentialFor(remote: string, step: SyncStep): Promise<GitCredentialHandle | null> {
    const origin = this.knownOrigin();
    if (!origin || !underOrigin(remote, origin)) return null;
    if (!this.signedIn()) throw new SpaceStopped(step, { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
    let credential: { username: string; secret: string; expiresAt: number };
    try { credential = await this.host.client.credential(origin); }
    catch (error) { throw hostStop(step, error, this.hostName()); }
    return withGitCredential(credential, this.host.hostRuntime);
  }

  /** Follow the host's rename or transfer of one clone, inside its sync's
   * gate (space-60). */
  private async moveInSync(machine: RepositorySync, to: string): Promise<void> {
    const store = this.host.store;
    const from = machine.key;
    const target = store.home.clonePath(to);
    if (existsSync(target)) {
      throw new SpaceStopped("check", {
        cause: "git",
        message: i18n._({ id: "{path} already exists, so the clone cannot follow the host there", values: { path: `workspace/${to}` }, comment: "A stopped sync: the folder a renamed spex repository moves to is taken" }),
        guidance: i18n._({ id: "Move that folder aside, then Retry.", comment: "Guidance where a renamed spex repository's new folder is taken" }),
        retry: true,
      });
    }
    const source = machine.repository.dir;
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    renameSync(source, target);
    pruneEmptyFolders(dirname(source), store.home.workspace);
    this.relocate([{ from, to }]);
    await this.afterMove([{ from, to }]);
  }

  /** The store, the machines and the waiting steps follow moved clones. */
  private relocate(moves: { from: string; to: string }[], own?: string): void {
    this.host.store.moveRepositories(moves, own);
    for (const { from, to } of moves) {
      const machine = this.machines.get(from);
      this.machines.delete(from);
      const repository = this.host.store.repository(to);
      if (machine && repository) {
        machine.rebind(repository);
        this.machines.set(to, machine);
      }
      const waiting = this.waiting.get(from);
      if (waiting) {
        this.waiting.delete(from);
        this.waiting.set(to, waiting);
      }
    }
  }

  private async afterMove(moves: { from: string; to: string }[]): Promise<void> {
    try { await this.host.repositoriesMoved?.(moves); }
    catch (error) { console.error(`spex: re-pointing moved clones failed: ${error instanceof Error ? error.message : String(error)}`); }
    for (const { from, to } of moves) {
      try { await this.host.environmentMoved?.(from, to); }
      catch (error) { console.error(`spex: the exports of ${to} were not rewritten: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }

  /** The machine of one spex repository, made on first use. */
  private machine(key: string): RepositorySync {
    const repository = this.host.store.repository(key);
    if (!repository) {
      throw new CoreError("not_found", i18n._({ id: "no spex repository {key} on this device",
        comment: "Refusal: the key names no clone under workspace/", values: { key } }));
    }
    let machine = this.machines.get(key);
    if (!machine || machine.repository.dir !== repository.dir) {
      machine = new RepositorySync(this.host, this, repository);
      this.machines.set(key, machine);
    }
    return machine;
  }

  /** The busy message while an operation runs on this clone (space-21);
   * other clones stay writable. */
  busyFor(key: string | undefined): string | undefined {
    return key === undefined ? undefined : this.machines.get(key)?.busy();
  }

  /** Whether any clone's operation runs. */
  busy(): string | undefined {
    for (const machine of this.machines.values()) {
      const busy = machine.busy();
      if (busy) return busy;
    }
    return undefined;
  }

  /** The store's, session and migration diagnostics, each repair marked
   * with what this device's reader answered (space-54). */
  storageDiagnostics(): StorageDiagnostic[] {
    const mark = (entry: StorageDiagnostic): StorageDiagnostic => {
      if (!entry.repair) return entry;
      const stored = this.host.store.getPref<{ declined?: unknown }>(repairPref(entry.repair.key));
      const declined = stored && typeof stored.declined === "number" ? stored.declined : undefined;
      return declined === undefined ? entry : { ...entry, repair: { ...entry.repair, declined } };
    };
    return this.host.diagnostics().map(mark);
  }

  private diagnostics(): StorageDiagnostic[] {
    const reported = [
      ...this.storageDiagnostics(),
      ...[...this.machines.values()].flatMap((machine) => machine.diagnostics()),
    ];
    this.pruneAnswers(reported);
    return reported;
  }

  /** An answer naming no repair the core still reports is discarded
   * (space-54) — but never on a fold that cannot be trusted to be
   * complete: blocking damage, or an operation in flight, would drop a
   * record the next honest fold still wants. */
  private pruneAnswers(reported: StorageDiagnostic[]): void {
    if (this.busy()) return;
    if (reported.some((entry) => entry.blocking)) return;
    const standing = new Set(reported.map((entry) => entry.repair?.key).filter(Boolean) as string[]);
    for (const key of this.host.store.prefKeys("space:repair:")) {
      if (!standing.has(key.slice("space:repair:".length))) this.host.store.deletePref(key);
    }
  }

  /** Only the reader's own act settles a repair (space-54): declining
   * says this is not a project on this device, and is a preference,
   * which never syncs. Rendering never writes here. */
  async decline(repair: string, declined: boolean): Promise<GroupsState> {
    const known = this.diagnostics().some((entry) => entry.repair?.key === repair);
    if (!known) {
      throw new CoreError("invalid_request", i18n._({
        id: "no repair named {repair} stands",
        values: { repair },
        comment: "Refusal: the answer names a repair the core does not report; {repair} is its key",
      }));
    }
    if (declined) this.host.store.setPref(repairPref(repair), { declined: Date.now() });
    else this.host.store.deletePref(repairPref(repair));
    return this.state();
  }

  /** The Groups state (space-30), every repository recomputed. */
  async state(): Promise<GroupsState> {
    return this.assemble(true);
  }

  private async assemble(recompute: boolean): Promise<GroupsState> {
    const store = this.host.store;
    const repositories: RepositoryState[] = [];
    for (const repository of store.listRepositories()) {
      const machine = this.machine(repository.key);
      const base = recompute || !machine.cached ? await machine.state(true) : { ...machine.cached, sync: machine.phase };
      repositories.push(this.overlay(machine, base));
    }
    for (const key of [...this.machines.keys()]) if (!store.repository(key)) this.machines.delete(key);
    repositories.push(...this.absentRows());
    const diagnostics = await this.host.checkRepairs(this.diagnostics());
    const host = store.home.host;
    return {
      home: resolve(this.host.home),
      git: await this.probe.version(),
      host: { url: host.url, displayName: this.view?.displayName ?? this.described?.displayName ?? null },
      account: store.home.account(),
      signIn: this.signInState,
      readAt: this.signedIn() ? this.view?.readAt ?? null : null,
      groups: this.groupsOf(repositories),
      diagnostics,
      // One number, so the header and the list cannot drift (space-1):
      // what the reader has not answered, and everything unfolded.
      issues: countIssues(diagnostics),
    };
  }

  /** A clone's state as the host's last answer and this device's files
   * make it (space-61). */
  private overlay(machine: RepositorySync, base: RepositoryState): RepositoryState {
    const facts = machine.facts;
    const waiting = this.waiting.get(base.key);
    // What a pick, a join or a pairing changed since the machine's last
    // reading is read afresh: its remote, its id and its working folder.
    const row: RepositoryState = {
      ...base,
      id: facts.id,
      remote: facts.remote === null ? null : displayRemote(facts.remote),
      folder: this.host.store.home.folderOf(base.key)?.path ?? null,
      waiting: waiting ? { step: waiting.step, group: waiting.group, message: waiting.message } : null,
    };
    if (facts.remote === null) return { ...row, state: "local-only", reason: null };
    // A remote the reader named, a path this device reaches: no host.
    if (!this.atHost(facts)) return row;
    if (!this.signedIn()) return { ...row, state: "unreachable", reason: signInAgain() };
    const listing = listingFor(this.view, facts.id, facts.remote);
    const listed: RepositoryState = listing ? { ...row, members: listing.members, visibility: listing.repository.visibility } : row;
    if (machine.hostOverride) return { ...listed, state: machine.hostOverride.state, reason: machine.hostOverride.reason };
    if (this.readFailure !== undefined) return { ...listed, state: "unreachable", reason: this.readFailure };
    // Not read since this core started: as the last sync left it.
    if (!this.view) return row;
    if (!listing) return { ...row, state: "unreachable", reason: noLongerShared() };
    if (listing.readOnly) {
      return { ...listed, state: "read-only", reason: listing.readOnly.message || i18n._({ id: "Archived", comment: "A spex repository's read-only reason where the host gave no words for its archive" }) };
    }
    return { ...listed, state: "reachable", reason: null };
  }

  /** A row for every spex repository the host lists and this device
   * lacks (space-61: "Not on this device"). */
  private absentRows(): RepositoryState[] {
    const view = this.view;
    if (!view || !this.signedIn()) return [];
    const store = this.host.store;
    const matched = new Set<string>();
    for (const repository of store.listRepositories()) {
      const facts = this.machines.get(repository.key)?.facts;
      const listing = facts ? listingFor(view, facts.id, facts.remote) : undefined;
      if (listing) matched.add(listing.repository.id);
    }
    const rows: RepositoryState[] = [];
    for (const listing of view.listings) {
      const repository = listing.repository;
      const key = hostKey(repository);
      if (!key || matched.has(repository.id) || store.repository(key)) continue;
      const code = repository.project && typeof repository.project.remote === "string" ? displayRemote(repository.project.remote) : null;
      rows.push({
        key,
        name: repository.path,
        id: repository.id,
        own: false,
        code,
        folder: null,
        remote: displayRemote(repository.remoteUrl),
        state: "absent",
        reason: null,
        waiting: null,
        members: listing.members,
        visibility: repository.visibility,
        branch: null,
        local: [],
        incoming: [],
        conflicts: [],
        lastSync: null,
        noticed: false,
        sync: this.joining.get(repository.id) ?? { phase: "idle" },
      });
    }
    return rows;
  }

  /** Your own group first, then every group the host lists, each with
   * its spex repositories, the group's own first (space-1); before
   * sign-in, your own group with what this device holds. */
  private groupsOf(rows: RepositoryState[]): GroupsState["groups"] {
    const store = this.host.store;
    const ownName = store.home.ownName;
    const view = this.signedIn() ? this.view : undefined;
    const user = userGroup(view);
    type Entry = GroupsState["groups"][number];
    const own: Entry = { id: user?.id ?? null, fullPath: ownName, name: user?.name ?? ownName, url: user?.url ?? null, own: true, repositories: [] };
    const entries = new Map<string, Entry>([[ownName, own]]);
    for (const group of view?.groups ?? []) {
      if (group.kind === "user") continue;
      entries.set(group.fullPath, { id: group.id, fullPath: group.fullPath, name: group.name, url: group.url, own: false, repositories: [] });
    }
    for (const row of rows) {
      let path = splitKey(row.key).group;
      if (user && path === user.fullPath) path = ownName;
      let entry = entries.get(path);
      if (!entry) {
        entry = { id: null, fullPath: path, name: path.split("/").pop() ?? path, url: null, own: false, repositories: [] };
        entries.set(path, entry);
      }
      entry.repositories.push(row);
    }
    const groupsOwn = (entry: Entry, row: RepositoryState): boolean => row.name === `${entry.fullPath.split("/").pop()}-spex`;
    for (const entry of entries.values()) {
      entry.repositories.sort((a, b) => Number(groupsOwn(entry, b)) - Number(groupsOwn(entry, a)) || a.key.localeCompare(b.key));
    }
    return [own, ...[...entries.values()].filter((entry) => entry !== own).sort((a, b) => a.fullPath.localeCompare(b.fullPath))];
  }

  /** Broadcast the state after one machine moved, from each machine's
   * last reading; transitions in a burst coalesce into one. */
  async publish(): Promise<void> {
    if (this.publishing) { this.republish = true; return this.publishing; }
    this.publishing = (async () => {
      try {
        do {
          this.republish = false;
          this.host.broadcast(await this.assemble(false));
        } while (this.republish);
      } finally { this.publishing = undefined; }
    })();
    return this.publishing;
  }

  async setRemote(key: string, url: string | null): Promise<GroupsState> {
    await this.machine(key).setRemote(url);
    const state = await this.state();
    this.host.broadcast(state);
    return state;
  }

  fetch(key: string): Promise<{ accepted: true }> { return this.machine(key).fetch(); }

  sync(key: string, input: { choices?: Record<string, SpaceChoice>; join?: boolean; noticed?: boolean }): Promise<{ accepted: true }> {
    return this.machine(key).sync(input);
  }

  cancel(key: string): boolean { return this.machine(key).cancel(); }

  diff(key: string, unit: string, path: string, side: SpaceChoice): Promise<{ patch: string; truncated: boolean }> {
    return this.machine(key).diff(unit, path, side);
  }

  tree(key: string, path?: string): Promise<{ path: string; entries: SpaceEntry[] }> { return this.machine(key).tree(path); }

  read(key: string, path: string): Promise<SpaceReadResult> { return this.machine(key).read(path); }

  /** What removing a project would lose (projects-9). */
  pendingUnits(key: string): Promise<number> {
    return this.host.store.repository(key) ? this.machine(key).pendingUnits() : Promise.resolve(0);
  }

  /** An interrupted apply in any clone is repaired from its marker before
   * the core reopens it (space-31). */
  async repairAtStartup(): Promise<void> {
    for (const repository of this.host.store.listRepositories()) await this.machine(repository.key).repairAtStartup();
  }

  /** Cancel every transport and wait for the operations (shutdown). */
  async stop(): Promise<void> {
    await Promise.all([...this.machines.values()].map((machine) => machine.stop()));
  }
}

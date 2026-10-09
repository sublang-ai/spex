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
import { HostError, SignInBusyError, type BrowserSignIn, type DeviceSignIn, type GitHostClient, type HostAccount } from "./git-host.js";
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
  callbackPages, candidatesOf, groupRepositoryName, hostKey, listedRecords, listingFor, nameTaken, ownNameFor, readHostView, relayHostError,
  repositoryDescription, signInFailure, underOrigin, userGroup, waitingPhrase, type HostListing, type HostView,
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
import { prefsFileOf, spexRepository, type SpexRepository, type Store } from "./store.js";
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
  /** What the core is already writing beneath these clones — an
   * environment's install — lands before they move (space-59). */
  settleBeneath?: (repositories: string[]) => Promise<void>;
}

/** What a spex repository's clone says of its host: its origin URL and
 * the host's id recorded beside it (git-host-5). */
interface CloneFacts { remote: string | null; id: string | null }

/** A reservation belongs to one invocation, independently of the phase
 * shown to clients. Only that invocation can finish or restore it. */
interface RepositoryReservation {
  readonly op: SpaceOp;
  readonly done: Promise<void>;
  phase(phase: SpaceSyncPhase): void;
  release(phase?: SpaceSyncPhase): void;
}

interface HostReservation {
  readonly id: string;
  key: string;
  release(): void;
}

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

/** A group's local-only clone whose group's own spex repository another
 * clone here holds, or a join of it (space-61, space-65): its row's
 * words, and a Join's refusal where no choice stands (space-29). */
const recordsHere = (group: string, name: string): string => i18n._({
  id: "{group}'s records are on this device as {name}",
  values: { group, name },
  comment: "A group's local-only spex repository whose group's own spex repository this device already holds as another clone, read on its row and as the refusal of a Join of another of the group's own; {group} is the group's full path, {name} that clone's name",
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

/** A sync the sharing notice must precede, refused or stopped at its
 * Check (space-57). */
const noticeFirst = (name: string): string => i18n._({
  id: "Read the sharing notice before syncing {name}",
  values: { name },
  comment: "Refusal of a first push into a spex repository with other members until the reader has seen the privacy notice",
});

/** Guidance under a sync stopped at its Check for the sharing notice:
 * the reader's Sync says it first (space-57, space-15). */
const noticeThenSync = (): string => i18n._({
  id: "Sync says what goes there first.",
  comment: "Guidance under a sync stopped because the reader has not seen the privacy notice for a spex repository with other members; Sync is the control that shows the notice before sending",
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

/** Whether two paths name one entry on disk: two spellings of one name
 * on a case-insensitive filesystem do. */
function sameEntry(a: string, b: string): boolean {
  try {
    const first = lstatSync(a);
    const second = lstatSync(b);
    return first.dev === second.dev && first.ino === second.ino;
  } catch { return false; }
}

/** Remove the folders a move left empty, up to `stopAt` itself. */
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

/** Whether a clone moving from key `from` to key `to` meets another
 * entry under the workspace: a destination that is the source itself, as
 * a case-insensitive filesystem reads a spelling differing only by case,
 * is none (space-59, space-60). */
function moveCollides(workspace: string, from: string, to: string): boolean {
  const target = join(workspace, ...to.split("/"));
  return existsSync(target) && !sameEntry(join(workspace, ...from.split("/")), target);
}

/** How many leading folders of key `from` a move to key `to` keeps where
 * they lie: those spelled alike, and those differing only by case whose
 * new spelling names the same entry, as on a case-insensitive filesystem,
 * which the move renames in place. */
function keptFolders(workspace: string, from: string[], to: string[]): number {
  let at = workspace;
  let depth = 0;
  for (; depth < from.length - 1 && depth < to.length - 1; depth += 1) {
    const same = from[depth] === to[depth] ||
      (from[depth].toLowerCase() === to[depth].toLowerCase() && sameEntry(join(at, from[depth]), join(at, to[depth])));
    if (!same) break;
    at = join(at, from[depth]);
  }
  return depth;
}

/** Move a clone from key `from` to key `to` under the workspace, on
 * either filesystem kind (space-59, space-60): each kept folder takes the
 * new spelling in place, so its spelling follows the host's; the clone
 * then moves, or takes its own new spelling in place, and the folders it
 * left empty go, never one renamed in place. The caller checks the
 * collision first ({@link moveCollides}). */
function moveClone(workspace: string, from: string, to: string): void {
  const source = from.split("/");
  const target = to.split("/");
  const kept = keptFolders(workspace, source, target);
  let at = workspace;
  for (let depth = 0; depth < kept; depth += 1) {
    if (source[depth] !== target[depth]) renameSync(join(at, source[depth]), join(at, target[depth]));
    at = join(at, target[depth]);
  }
  const was = join(at, ...source.slice(kept));
  const now = join(workspace, ...target);
  if (was === now) return;
  const inPlace = sameEntry(was, now);
  mkdirSync(dirname(now), { recursive: true, mode: 0o700 });
  renameSync(was, now);
  if (!inPlace) pruneEmptyFolders(dirname(was), at);
}

/** The other clones a move from key `from` to key `to` carries: those
 * beneath a folder it renames in place, each with its key so spelled. */
function carriedClones(workspace: string, from: string, to: string, keys: string[]): { from: string; to: string }[] {
  const source = from.split("/");
  const target = to.split("/");
  const kept = keptFolders(workspace, source, target);
  return keys.flatMap((key) => {
    if (key === from) return [];
    const parts = key.split("/");
    let shared = 0;
    while (shared < kept && shared < parts.length - 1 && parts[shared] === source[shared]) shared += 1;
    const respelled = [...target.slice(0, shared), ...parts.slice(shared)].join("/");
    return respelled === key ? [] : [{ from: key, to: respelled }];
  });
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
/** The repair key of a standing choice among candidates for a group's
 * own spex repository (space-69): the clone's key and the candidates'
 * host ids, so an answer lapses when the candidates change (space-49). */
const choiceRepair = (key: string, candidates: HostListing[]): string =>
  `choice:${key}:${candidates.map((listing) => listing.repository.id).sort().join(",")}`;
const CHOICE_PREFS = "space:repair:choice:";
/** The clone a standing choice's answer names, out of its preference. */
const choiceKeyOf = (pref: string): string => pref.slice(CHOICE_PREFS.length, pref.lastIndexOf(":"));
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
  private currentPhase: SpaceSyncPhase = { phase: "idle" };
  get phase(): SpaceSyncPhase { return this.currentPhase; }
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
  private reservation?: RepositoryReservation;

  constructor(private readonly host: SpaceHost, private readonly owner: SpaceManager, public repository: SpexRepository) {
    this.git = this.makeGit(repository.dir);
  }

  private makeGit(dir: string): SpaceGit {
    return new SpaceGit(dir, this.host.env, {
      ...(this.host.transportTimeoutMs !== undefined ? { transportTimeoutMs: this.host.transportTimeoutMs } : {}),
      identity: () => this.owner.identity(),
      onTransport: () => this.transportStarted(),
    });
  }

  /** The step's Git child runs (space-16): the Check step offers Stop
   * from now, the host read before it bounded by the client's own
   * timeout. */
  private transportStarted(): void {
    if (this.phase.phase !== "running" || this.phase.cancelable) return;
    if (this.phase.step !== "check" && this.phase.step !== "push") return;
    this.currentPhase = { ...this.phase, cancelable: true };
    void this.broadcast(false).catch((error: unknown) => {
      console.error(`spex: space state failed: ${error instanceof Error ? error.message : String(error)}`);
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
    if (!this.reservation) return undefined;
    // One whole sentence per operation: a verb dropped into a frame
    // carries to no other language (core-service-111).
    const name = splitKey(this.key).name;
    switch (this.reservation.op) {
      case "sync":
        return i18n._({ id: "{name} is syncing; wait for it to finish", values: { name }, comment: "Refusal while a spex repository syncs; {name} is its name" });
      case "join":
        return i18n._({ id: "{name} is joining; wait for it to finish", values: { name }, comment: "Refusal while a spex repository is being joined; {name} is its name" });
      case "move":
        return i18n._({ id: "{name} is moving; wait for it to finish", values: { name }, comment: "Refusal while a spex repository's clone moves or is renamed; {name} is its name" });
      case "remove":
        return i18n._({ id: "{name} is being removed", values: { name }, comment: "Refusal while a spex repository's clone is deleted with its project's removal; {name} is its name" });
      default:
        return i18n._({ id: "{name} is checking the host; wait for it to finish", values: { name }, comment: "Refusal while a spex repository checks the Git host; {name} is its name" });
    }
  }

  assertNotRunning(): void {
    if (this.reservation) {
      throw new CoreError("busy", this.reservation.op === "remove" || this.reservation.op === "move"
        ? this.busy()!
        : i18n._({ id: "Already syncing", comment: "Refusal of a second operation on a spex repository while one runs" }));
    }
  }

  /** Hold the gate for an operation run beneath this clone — a rename,
   * a move, a join's code clone or a project's removal (space-21); absent
   * while another runs. */
  hold(op: SpaceOp, step: SyncStep): RepositoryReservation | undefined {
    if (!this.owner.isCurrent(this)) throw new CoreError("not_found", i18n._({ id: "no spex repository {key} on this device", comment: "Refusal: the key names no clone under workspace/", values: { key: this.key } }));
    if (this.reservation) return undefined;
    const before = this.phase;
    let finish!: () => void;
    const done = new Promise<void>((resolveDone) => { finish = resolveDone; });
    const reservation: RepositoryReservation = {
      op, done,
      phase: (phase) => {
        this.assertOwner(reservation);
        this.currentPhase = phase;
      },
      release: (phase = before) => {
        if (this.reservation !== reservation) return;
        this.currentPhase = phase;
        this.reservation = undefined;
        finish();
      },
    };
    this.reservation = reservation;
    this.currentPhase = { phase: "running", op, step, since: Date.now(), cancelable: false };
    return reservation;
  }

  private reserve(op: SpaceOp, step: SyncStep): RepositoryReservation {
    this.assertNotRunning();
    return this.hold(op, step)!;
  }

  /** Internal writes must belong to the operation that admitted them. */
  assertOwner(reservation: RepositoryReservation): void {
    if (this.reservation !== reservation) throw new CoreError("busy", this.busy() ?? i18n._({ id: "Already syncing", comment: "Refusal of a second operation on a spex repository while one runs" }));
  }

  // -- reads and moves (space-59, space-60) -----------------------------------

  /** Reads of the clone in flight, outside its operations, and who
   * waits for the last to end. */
  private readers = 0;
  private drainWaiters: (() => void)[] = [];
  /** Set while the clone moves: a read waits for it. */
  private move?: { done: Promise<void>; end: () => void };

  /** A read of the clone outside its operations — its state, its facts,
   * the explorer, a diff: it waits while the clone moves and then reads
   * where the clone now lies, and a move waits for it, so no read meets
   * a clone half moved (space-59, space-60). */
  async reading<T>(body: () => Promise<T>): Promise<T> {
    while (this.move) await this.move.done;
    this.readers += 1;
    try { return await body(); }
    finally {
      this.readers -= 1;
      if (this.readers === 0) for (const wake of this.drainWaiters.splice(0)) wake();
    }
  }

  /** Every read in flight done. */
  async quiesce(): Promise<void> {
    while (this.readers > 0) await new Promise<void>((wake) => { this.drainWaiters.push(wake); });
  }

  /** Begin a move of this clone: reads starting from now wait for its
   * end, and this resolves once the reads in flight are done. */
  async beginMove(): Promise<void> {
    if (!this.move) {
      let end = (): void => {};
      const done = new Promise<void>((resolveDone) => { end = resolveDone; });
      this.move = { done, end };
    }
    await this.quiesce();
  }

  /** End a move: the reads that waited read the clone where it lies. */
  endMove(): void {
    const move = this.move;
    this.move = undefined;
    move?.end();
  }

  /** The clone's remote and recorded host id, read afresh. */
  async readFacts(): Promise<CloneFacts> {
    return this.reading(async () => {
      await this.readRepository();
      return this.facts;
    });
  }

  /** Give the clone the host's own remote and id (space-58, space-63):
   * the URL the host handed over, used as given (space-5). */
  async attachHost(url: string, id: string, reservation: RepositoryReservation): Promise<void> {
    this.assertOwner(reservation);
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
    if (this.facts.id === id) return;
    const reservation = this.hold("check", "check");
    if (!reservation) return;
    try { await this.reading(() => this.recordIdNow(id, reservation)); }
    finally { reservation.release(); }
  }

  /** The same, inside this clone's own operation. */
  async recordIdNow(id: string, reservation: RepositoryReservation): Promise<void> {
    this.assertOwner(reservation);
    if ((await this.git.run(["config", "spex.repositoryId", id])).code === 0) this.facts = { ...this.facts, id };
  }

  /** The URL the host hands over after a rename or a transfer
   * (space-60), used as given, inside this clone's own operation. */
  async setOrigin(url: string, reservation: RepositoryReservation): Promise<void> {
    this.assertOwner(reservation);
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
    if (this.reservation && this.cached) return { ...this.cached, sync: this.phase };
    return this.reading(() => this.readState(recompute));
  }

  private async readState(recompute: boolean): Promise<RepositoryState> {
    if (this.reservation && this.cached) return { ...this.cached, sync: this.phase };
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
      // A group's own holds no `project.json`, a project's does (space-65).
      records: existsSync(this.repository.projectFile) ? "project" : "group",
      choice: null,
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
   * units not known to have reached the host. The working tree is
   * planned against the host's branch as this device last fetched or
   * pushed it, through their common ancestor — every unit where no such
   * branch is on disk or the clone is local only. It reads the clone
   * alone, never this process's checks, and leaves the Sync tab's lists
   * as they are. */
  async pendingUnits(): Promise<number> {
    const repo = await this.readRepository();
    if (!repo.root || repo.head === null) return 0;
    const mine = await this.workingTree();
    let theirs = EMPTY_TREE;
    let base = EMPTY_TREE;
    if (repo.remote !== null && repo.originSpex !== null) {
      theirs = repo.originSpex;
      const merged = await this.git.run(["merge-base", "HEAD", `refs/remotes/origin/${SPEX_BRANCH}`]);
      if (merged.code === 0) base = merged.stdout.toString("utf8").trim();
    }
    const units = planStorageUnits({ ours: readStorageTree(this.dir, mine), theirs: readStorageTree(this.dir, theirs), base: readStorageTree(this.dir, base) });
    // Local and conflicting units; an incoming or agreed one is there.
    return units.filter((unit) => RECORD_KINDS.has(spaceUnitKind(unit.name)) &&
      (unit.choice === "conflict" || unit.changed.ours && !unit.changed.theirs)).length;
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
    const reservation = this.reserve("check", "check");
    let completed: SpaceSyncPhase | undefined;
    try {
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
        completed = { phase: "idle" };
      }
      await this.readFacts();
    } finally { reservation.release(completed); }
    await this.state(true);
  }

  // -- operations (space-31) -------------------------------------------------

  private runOperation(reservation: RepositoryReservation, body: () => Promise<void>): Promise<void> {
    const op = reservation.op;
    const work = (async () => {
      try { await body(); }
      catch (error) {
        const step = this.phase.phase === "running" ? this.phase.step : "save";
        if (error instanceof SpaceStopped) this.currentPhase = { phase: "stopped", op, step: error.step, ...error.failure };
        else {
          const message = error instanceof Error ? error.message : String(error);
          this.currentPhase = { phase: "stopped", op, step, cause: "git", message: lastLines(message), guidance: i18n._({
            id: "Retry; if it fails again, run the step in a terminal for detail.",
            comment: "Guidance under a step that stopped for a reason the app does not classify",
          }), retry: true };
        }
      } finally {
        try { await this.releaseHoldings(); }
        finally { reservation.release(this.phase); }
        try { await this.broadcast(this.phase.phase !== "choices"); }
        catch (error) { console.error(`spex: space state failed: ${error instanceof Error ? error.message : String(error)}`); }
      }
    })();
    this.operation = work;
    void work.finally(() => { if (this.operation === work) this.operation = undefined; });
    return work;
  }

  /** Enter a step. Check enters with no Stop: its host read comes
   * first, and Stop is offered once its Git child runs (space-16). */
  private async enter(op: SpaceOp, step: SyncStep, cancelable: boolean): Promise<void> {
    this.currentPhase = { phase: "running", op, step, since: Date.now(), cancelable };
    await this.broadcast(false);
    await this.host.beforeStep?.({ op, step, repository: this.key });
  }

  async fetch(): Promise<{ accepted: true }> {
    const reservation = this.reserve("check", "check");
    let repo: ReadyRepository;
    try {
      repo = await this.requireReady();
      await this.owner.admit(this, { push: false, noticed: true });
    } catch (error) { reservation.release(); throw error; }
    void this.runOperation(reservation, async () => {
      await this.enter("check", "check", false);
      await this.check(repo.remote, "check", reservation);
      this.currentPhase = { phase: "idle" };
    });
    return { accepted: true };
  }

  async sync(input: { choices?: Record<string, SpaceChoice>; join?: boolean; noticed?: boolean }): Promise<{ accepted: true }> {
    // The gate is set before the admission checks (space-21).
    const reservation = this.reserve("sync", "save");
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
      await this.owner.admit(this, { push: true, noticed: input.noticed === true });
    } catch (error) {
      reservation.release();
      throw error;
    }
    void this.runOperation(reservation, () => this.syncBody(repo, choices, input.join === true, reservation));
    return { accepted: true };
  }

  cancel(): boolean {
    return this.git.cancel();
  }

  /** Cancel a transport and wait for the operation to settle (shutdown). */
  async stop(): Promise<void> {
    this.git.cancel();
    try { await this.operation; } catch { /* reported as state */ }
    await this.reservation?.done;
  }

  // -- the steps (space-12, space-15) ----------------------------------------

  private async syncBody(repo: ReadyRepository, choices: Record<string, StorageChoice>, join: boolean, reservation: RepositoryReservation): Promise<void> {
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
          await this.enter(op, "check", false);
          const checked = await this.check(remote, "sync", reservation);
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
          if (result.outcome === "unrelated") { this.currentPhase = { phase: "unrelated" }; return; }
          if (result.outcome === "choices") { this.currentPhase = { phase: "choices", savedCommit }; return; }
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
            this.currentPhase = { phase: "done", at, sent: 0, received: counts.received, pushed: false };
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
          this.currentPhase = { phase: "done", at, sent: counts.sent, received: counts.received, pushed: pushed === "ok" };
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
  private async check(remote: string, op: SpaceOp, reservation: RepositoryReservation): Promise<{ empty: boolean; readOnly: boolean; atHost: boolean; remote: string }> {
    const host = await this.owner.hostCheck(this, op, reservation);
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
    const reservation = this.reserve("sync", "apply");
    try {
      await this.repair();
      this.host.store.reload();
    } catch (error) {
      this.repairFailure = error instanceof Error ? error.message : String(error);
    } finally { reservation.release(); }
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
    if (!this.lastPlan) await this.readState(true);
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
  /** Reads of the host begun so far, each numbered by this count. */
  private readsBegun = 0;
  /** The count of reads begun when a clone was last attached to a
   * repository at the host: a read numbered no higher began before. */
  private attachedAfter = 0;
  /** The repositories clones were attached to since the view's read
   * began, as the host answered them, by id: listed until the next read
   * is held (git-host-5). */
  private readonly attached = new Map<string, HostListing>();
  /** The sign-in shown on the header (space-30). */
  private signInState: GroupsState["signIn"] = { phase: "idle" };
  /** The login of the account the host signed this device out of
   * (git-host-4): said on the header while no flow runs or stands
   * failed (space-3), for the core's run, until the next sign-in. */
  private hostSignedOut?: string;
  /** Whether the read a signed-in start owes is still to be begun at a
   * client's first ask for the state (git-host-5): spent on that ask. */
  private startRead = true;
  private flow?: { cancel(): void };
  private settingUp?: Promise<void>;
  /** Steps at the host waiting for a member with the rights (space-64),
   * by the clone's key; asked again at the next read. */
  private readonly waiting = new Map<string, Waiting>();
  /** The standing choice among several candidates for a group's own
   * spex repository (space-69), by the local-only clone's key: asked
   * again at every read the set-up makes. */
  private readonly choices = new Map<string, HostListing[]>();
  /** A group's local-only clone whose lookup found its group's own spex
   * repository on this device as another clone or being joined to it
   * (space-65), by its key: the group that lookup ran for. Which clone
   * holds it is read live, so a hold that ends is never claimed. */
  private readonly heldHere = new Map<string, string>();
  /** Joins in flight or stopped, by the host's id (space-63). */
  private readonly joining = new Map<string, SpaceSyncPhase>();
  /** Ownership of a host repository is separate from the last host
   * view: reads may clear `attached`, but cannot release these claims. */
  private readonly hostReservations = new Map<string, HostReservation>();
  /** A moving clone owns its future key as well as its current key. */
  private readonly destinations = new Map<string, { machine: RepositorySync }>();
  /** Set once the core stops: nothing is read or announced after. */
  private stopping = false;

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
      this.hostSignedOut = undefined;
      this.view = undefined;
      this.attached.clear();
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
   * gone, the account kept and marked signed out, and the header says
   * the host did it, naming the account's login (space-3). */
  signedOutByHost(): void {
    const account = this.host.store.home.account();
    if (account) this.hostSignedOut = account.login;
    this.host.store.signOut();
    this.view = undefined;
    this.attached.clear();
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
    this.hostSignedOut = undefined;
    this.view = undefined;
    this.attached.clear();
    this.readFailure = undefined;
    this.waiting.clear();
    this.heldHere.clear();
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
    // The steps already waiting, under the keys the rename left them:
    // one this set-up leaves waiting is asked at the next read (space-64).
    const waited = new Set(this.waiting.keys());
    let view: HostView;
    try { view = await this.readHost(); } catch { return; }
    if (renamed !== "busy") {
      // One failed adopt leaves the rest of the set-up to run.
      try { await this.ensureOwnOnHost(view); }
      catch (error) { console.error(`spex: your own group's spex repository stays on this device: ${error instanceof Error ? error.message : String(error)}`); }
    }
    await this.revisitChoices(renamed !== "busy");
    await this.retryWaiting(view, waited);
    await this.publish();
  }

  /** Read the host (git-host-5): one read at a time, the answer held as
   * the current view, a failure keeping the previous view and its time.
   * A read begun before a clone was attached to a repository cannot
   * list it: it is made again before it is held. */
  readHost(): Promise<HostView> {
    if (this.reading) return this.reading;
    const work = (async (): Promise<HostView> => {
      try {
        let view: HostView;
        let begun: number;
        do {
          begun = (this.readsBegun += 1);
          view = await readHostView(this.host.client);
        } while (begun <= this.attachedAfter);
        this.view = view;
        this.attached.clear();
        this.described = { displayName: view.displayName, gitOrigin: view.gitOrigin };
        this.readFailure = undefined;
        // A read outside the set-up — a sync's Check, a pick's — that
        // lists other candidates than a standing choice names asks the
        // set-up again, which lapses it (space-69).
        if (!this.settingUp && !this.stopping && this.choicesChanged(view)) {
          void this.setUp().catch((error: unknown) => {
            console.error(`spex: asking the choices again failed: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
        // A clone matched by its remote records the host's id (git-host-5).
        for (const repository of this.host.store.listRepositories()) {
          if (!this.host.store.repository(repository.key)) continue;
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
   * naming one is rewritten, in one step while nothing beneath runs —
   * only while your own group's spex repository is not on the host,
   * whose moves it follows by the key it records (space-60). */
  private async renameOwn(account: HostAccount): Promise<"none" | "done" | "busy"> {
    const store = this.host.store;
    const target = ownNameFor(account.login);
    const current = store.home.ownName;
    if (!target || target === current) return "none";
    const ownFrom = store.home.own();
    const keys = this.occupiedKeys().filter((key) => key.startsWith(`${current}/`));
    if (keys.some((key) => !store.repository(key) && this.busyFor(key))) return "busy";
    const ownTo = `${target}/${target}-spex`;
    const moves = keys.map((key) => ({ from: key, to: key === ownFrom ? ownTo : `${target}/${key.slice(current.length + 1)}` }));
    // A clone on the host never turns local-only: facts already read
    // settle it with no gate taken (space-60).
    if (store.repository(ownFrom) && this.atHost(this.machine(ownFrom).facts)) return "none";
    // The home file the move leaves is checked before any clone moves:
    // a refusal leaves every folder and pair where it is.
    store.home.checkMove(moves, ownTo);
    // A destination taken by another entry collides; one that is the
    // source itself, as a case-insensitive filesystem reads a login
    // differing only by case, does not.
    if (moves.some((move) => moveCollides(store.home.workspace, move.from, move.to))) return "busy";
    const held = new Map<RepositorySync, RepositoryReservation>();
    const moving: RepositorySync[] = [];
    let releaseDestinations: (() => void) | undefined;
    try {
      // The gate of every clone beneath, old key and new (space-21):
      // held before the checks, and through the move until the store,
      // the machines and the core read every clone where it now lies.
      for (const key of keys) {
        const machine = this.machine(key);
        const reservation = machine.hold("move", "apply");
        if (!reservation) return "busy";
        held.set(machine, reservation);
      }
      releaseDestinations = this.reserveDestinations(moves);
      if (!releaseDestinations) return "busy";
      // Your own group's spex repository on the host follows the host's
      // moves alone (space-60): its clone's facts are read under the gate.
      if (store.repository(ownFrom) && this.atHost(await this.machine(ownFrom).readFacts())) return "none";
      await this.publish();
      for (const key of keys) if (await this.host.blocker(key)) return "busy";
      // Reads in flight end where the clones lie, and what an
      // environment is writing beneath them lands, before the folders
      // move; a read starting meanwhile waits and reads them moved.
      for (const machine of held.keys()) {
        moving.push(machine);
        await machine.beginMove();
      }
      await this.host.settleBeneath?.(keys);
      // Registration or Join may have acquired another key while the
      // move drained. Never carry a clone whose reservation we lack.
      if (this.occupiedKeys().some((key) => key.startsWith(`${current}/`) && !keys.includes(key))) return "busy";
      // A login differing only by case renames the folder in place where
      // the filesystem reads both spellings as one, and each clone then
      // moves from where it now lies.
      for (const move of moves) moveClone(store.home.workspace, move.from, move.to);
      this.relocate(moves, ownTo);
      for (const machine of moving.splice(0)) machine.endMove();
      await this.afterMove(moves);
      return "done";
    } finally {
      for (const machine of moving) machine.endMove();
      releaseDestinations?.();
      for (const reservation of held.values()) reservation.release();
    }
  }

  /** Your own group's spex repository on the host (space-4, space-65):
   * found in the account's own group by its records — joined where the
   * host lists one, created and pushed where it lists none, the choice
   * standing where it lists several. */
  private async ensureOwnOnHost(view: HostView): Promise<void> {
    const store = this.host.store;
    const key = store.home.own();
    if (!store.repository(key) || this.waiting.has(key)) return;
    const machine = this.machine(key);
    const facts = await machine.readFacts();
    if (facts.remote !== null) { this.dropChoice(key); return; }
    const user = userGroup(view);
    await this.giveGroupRepository(machine, view, user?.fullPath ?? store.home.ownName, { id: user?.id ?? null, name: splitKey(key).name });
  }

  /**
   * A group's spex repository on the host at its first session (space-65):
   * a clone holding no `project.json`, outside your own group's folder,
   * given the group's own spex repository the host lists in that group by
   * its records. A refused creation leaves the clone local only with its
   * waiting phrase (space-64); nothing here refuses the session.
   */
  async ensureGroupRepository(key: string): Promise<"unchanged" | "local" | "joined" | "created" | "waiting"> {
    try {
      const store = this.host.store;
      const group = splitKey(key).group;
      const repository = store.repository(key);
      if (!repository || group === store.home.ownName || existsSync(repository.projectFile)) return "unchanged";
      if (this.waiting.has(key)) return "waiting";
      const machine = this.machine(key);
      const facts = await machine.readFacts();
      if (facts.remote !== null) { this.dropChoice(key); return "unchanged"; }
      if (!this.signedIn()) return "local";
      const view = this.view ?? await this.readHost();
      const hostGroup = view.groups.find((entry) => entry.fullPath === group);
      return await this.giveGroupRepository(machine, view, group, hostGroup ? { id: hostGroup.id, name: groupRepositoryName(group) } : null);
    } catch (error) {
      console.error(`spex: ${key} stays on this device: ${error instanceof Error ? error.message : String(error)}`);
      return "local";
    }
  }

  /** Give a group's local-only clone the group's own spex repository by
   * what the host lists in that group (space-65): where any is on this
   * device as another clone or being joined to it, nothing is created
   * or joined and the clone's row names that clone, since Spex merges no
   * two spex repositories; otherwise one is joined, the clone taking its
   * key on that sync (space-60); none is created as `create` names it,
   * where the group may be created in; several stand as the choice
   * (space-69). One lookup or pick of a clone runs at a time: a lookup
   * meanwhile acts on nothing, and a pick is refused busy (space-58). */
  private async giveGroupRepository(
    machine: RepositorySync,
    view: HostView,
    group: string,
    create: { id: string | null; name: string } | null,
  ): Promise<"joined" | "created" | "waiting" | "local"> {
    const reservation = machine.hold("join", "check");
    if (!reservation) return "local";
    try {
      if (await this.host.blocker(machine.key)) return "local";
      this.heldHere.delete(machine.key);
      // A clone given its remote while this waited joined already.
      if ((await machine.readFacts()).remote !== null) {
        this.dropChoice(machine.key);
        return "joined";
      }
      const held = await this.heldAfresh(view, machine.key);
      const candidates = candidatesOf(view, group);
      if (this.holderOf(view, group, held) !== undefined) {
        this.dropChoice(machine.key);
        this.heldHere.set(machine.key, group);
        reservation.release();
        await this.publish();
        return "local";
      }
      if (candidates.length > 1) {
        this.standChoice(machine.key, candidates);
        // The choice is settled and actionable. Publishing it owns no
        // clone writes; a Use admitted now owns its own reservation.
        reservation.release();
        await this.publish();
        return "local";
      }
      this.dropChoice(machine.key);
      if (candidates.length === 1) {
        await this.adopt(machine, candidates[0], true, reservation);
        return "joined";
      }
      if (!create) return "local";
      return await this.create(machine, { id: create.id, fullPath: group }, create.name, repositoryDescription({ kind: "group", group }), "quiet", reservation);
    } finally {
      reservation.release();
    }
  }

  private alreadyHeld(name: string, key: string): CoreError {
    return new CoreError("invalid_request", i18n._({
      id: "{name} is on this device already as {key}",
      values: { name, key },
      comment: "Refusal of a pick joining a spex repository another clone on this device already stands for, or a group's own while another of its group's own is here; {name} is the repository that clone stands for, {key} that clone's path under the workspace",
    }));
  }

  /** Claim before the first await, then inspect durable clone facts
   * while every competing entry point sees this assignment in flight. */
  private reserveHost(id: string, key: string): HostReservation {
    const held = this.hostReservations.get(id);
    if (held) throw this.alreadyHeld(this.view?.listings.find((entry) => entry.repository.id === id)?.repository.path ?? id, held.key);
    const reservation: HostReservation = {
      id, key,
      release: () => {
        if (this.hostReservations.get(id) === reservation) this.hostReservations.delete(id);
      },
    };
    this.hostReservations.set(id, reservation);
    return reservation;
  }

  private async assertHostAvailable(view: HostView, listing: HostListing, key: string, siblings = true): Promise<void> {
    const held = await this.heldAfresh(view, key);
    const holding = [listing, ...(siblings && listedRecords(listing) === "group" ? candidatesOf(view, listing.repository.group.fullPath) : [])]
      .find((entry) => held.has(entry.repository.id));
    if (holding) throw this.alreadyHeld(holding.repository.path, held.get(holding.repository.id)!);
  }

  /** The host's ids this device's other clones stand for, each with its
   * clone's key, as their facts were last read: by the id a clone
   * records, else by its remote URL (git-host-5); and every join in
   * flight, whose clone the store lists only once it is cloned, under
   * the key it clones to (space-63). */
  private heldIds(view: Pick<HostView, "listings">, except: string): Map<string, string> {
    const store = this.host.store;
    const held = new Map<string, string>();
    for (const repository of store.listRepositories()) {
      if (repository.key === except || !store.repository(repository.key)) continue;
      const facts = this.machines.get(repository.key)?.facts;
      const id = facts ? listingFor(view, facts.id, facts.remote)?.repository.id ?? facts.id : null;
      if (id !== null) held.set(id, repository.key);
    }
    for (const [id, reservation] of this.hostReservations) {
      if (reservation.key !== except) held.set(id, reservation.key);
    }
    return held;
  }

  /** The clone holding a group's own spex repository for a clone of
   * that group, by `held` (space-65): its key, if any. */
  private holderOf(view: Pick<HostView, "listings">, group: string, held: Map<string, string>): string | undefined {
    return candidatesOf(view, group).map((listing) => held.get(listing.repository.id)).find((key) => key !== undefined);
  }

  /** Every lookup that found its group's records held here whose hold
   * has ended, the holder's join stopped or its clone gone: asked again
   * (space-65). Your own group's is asked as the set-up asks it. */
  private reaskReleased(): void {
    const view = this.view;
    if (!view || this.stopping || !this.signedIn()) return;
    const own = this.host.store.home.own();
    for (const [key, group] of [...this.heldHere]) {
      if (this.holderOf(view, group, this.heldIds(view, key)) !== undefined) continue;
      if (key === own) {
        void this.ensureOwnOnHost(view).catch((error: unknown) => {
          console.error(`spex: your own group's spex repository stays on this device: ${error instanceof Error ? error.message : String(error)}`);
        });
      } else void this.ensureGroupRepository(key);
    }
  }

  /** A clone removed from this device (projects-9): a lookup it held
   * is asked again (space-65). */
  cloneRemoved(): void {
    this.reaskReleased();
  }

  /** The same, every other clone's facts read afresh. */
  private async heldAfresh(view: HostView, except: string): Promise<Map<string, string>> {
    const store = this.host.store;
    for (const repository of store.listRepositories()) {
      if (repository.key !== except && store.repository(repository.key)) await this.machine(repository.key).readFacts();
    }
    return this.heldIds(view, except);
  }

  /** The choice stands for a clone (space-69): an earlier answer naming
   * other candidates lapses with them (space-49). */
  private standChoice(key: string, candidates: HostListing[]): void {
    const sorted = [...candidates].sort((a, b) => a.repository.path.localeCompare(b.repository.path) || a.repository.id.localeCompare(b.repository.id));
    const before = this.choices.get(key);
    if (before && choiceRepair(key, before) !== choiceRepair(key, sorted)) this.host.store.deletePref(repairPref(choiceRepair(key, before)));
    this.choices.set(key, sorted);
  }

  /** A clone's choice no longer stands: picked, joined, created, or its
   * clone gone; the reader's answer to it is discarded (space-54). */
  private dropChoice(key: string): void {
    const before = this.choices.get(key);
    if (!before) return;
    this.choices.delete(key);
    this.host.store.deletePref(repairPref(choiceRepair(key, before)));
  }

  /** Every group's clone given its spex repository again at the
   * set-up's read (space-65): each that may hold a choice — local only,
   * holding no `project.json`, outside your own group's folder, paired
   * with a working folder and waiting on no step (space-64) — is given
   * the group's current candidates whatever was chosen before: one is
   * joined, none created, several stand as the choice (space-69), so an
   * unanswered choice is asked again after a restart. An answer is
   * discarded only for a clone asked here that it no longer names, or
   * one gone or on the host (space-54). Your own group's was asked just
   * before, unless `ownAsked` is false. */
  private async revisitChoices(ownAsked: boolean): Promise<void> {
    const store = this.host.store;
    const own = store.home.own();
    const asked = new Set<string>(ownAsked ? [own] : []);
    for (const repository of store.listRepositories()) {
      const key = repository.key;
      if (key === own || !store.repository(key) || splitKey(key).group === store.home.ownName) continue;
      if (existsSync(repository.projectFile) || !store.home.folderOf(key) || this.waiting.has(key)) continue;
      if ((await this.machine(key).readFacts()).remote !== null) continue;
      asked.add(key);
      await this.ensureGroupRepository(key);
    }
    // A choice stands, and a clone's records are named as held here,
    // only on a clone that may hold one.
    for (const key of [...this.choices.keys()]) if (key !== own && !asked.has(key)) this.dropChoice(key);
    for (const key of [...this.heldHere.keys()]) if (key !== own && !asked.has(key)) this.heldHere.delete(key);
    const standing = new Set([...this.choices].map(([key, candidates]) => repairPref(choiceRepair(key, candidates))));
    for (const pref of store.prefKeys(CHOICE_PREFS)) {
      if (standing.has(pref)) continue;
      const key = choiceKeyOf(pref);
      if (asked.has(key) || !store.repository(key) || (await this.machine(key).readFacts()).remote !== null) store.deletePref(pref);
    }
  }

  /** Whether a read lists other candidates than a standing choice names
   * (space-69), or one of them on this device as another clone
   * (space-65): your own group's in the account's own group; or whether
   * a lookup's group's records held here are held no more (space-65). */
  private choicesChanged(view: HostView): boolean {
    const store = this.host.store;
    for (const [key, group] of this.heldHere) {
      if (this.holderOf(view, group, this.heldIds(view, key)) === undefined) return true;
    }
    for (const [key, candidates] of this.choices) {
      const group = key === store.home.own() ? userGroup(view)?.fullPath ?? store.home.ownName : splitKey(key).group;
      const held = this.heldIds(view, key);
      const listed = candidatesOf(view, group);
      if (listed.some((listing) => held.has(listing.repository.id)) || choiceRepair(key, listed) !== choiceRepair(key, candidates)) return true;
    }
    return false;
  }

  /** The choices the Groups state carries (space-69): on a group's clone
   * still local only, while signed in. */
  private standingChoices(): { key: string; candidates: HostListing[]; repair: string; declined: boolean }[] {
    if (!this.signedIn()) return [];
    const store = this.host.store;
    const out: { key: string; candidates: HostListing[]; repair: string; declined: boolean }[] = [];
    for (const [key, candidates] of this.choices) {
      if (!store.repository(key) || this.machines.get(key)?.facts.remote !== null) continue;
      const repair = choiceRepair(key, candidates);
      const stored = store.getPref<{ declined?: unknown }>(repairPref(repair));
      out.push({ key, candidates, repair, declined: typeof stored?.declined === "number" });
    }
    return out;
  }

  // -- picks, creations and joins (space-58, space-63, space-64) --------------

  /** Give a clone the host's repository and sync it — a join of two
   * histories where `join` (space-13), a first push otherwise. From the
   * first write of its remote, the repository counts as listed as the
   * host answered it until a read begun after this is held (git-host-5),
   * so its row goes straight to its sync. */
  private async adopt(machine: RepositorySync, listing: HostListing, join: boolean, held?: RepositoryReservation): Promise<void> {
    const reservation = held ?? machine.hold("join", "check");
    if (!reservation) { machine.assertNotRunning(); return; }
    machine.assertOwner(reservation);
    const { repository } = listing;
    let claim: HostReservation | undefined;
    try {
      claim = this.reserveHost(repository.id, machine.key);
      const view = this.view ?? await this.readHost();
      await this.assertHostAvailable(view, listing, machine.key);
      const blocker = await this.host.blocker(machine.key);
      if (blocker) throw new CoreError("busy", blocker);
      this.attachedAfter = this.readsBegun;
      this.attached.set(repository.id, listing);
      try { await machine.attachHost(repository.remoteUrl, repository.id, reservation); }
      catch (error) {
        this.attached.delete(repository.id);
        throw error;
      }
      this.waiting.delete(machine.key);
      this.dropChoice(machine.key);
      this.heldHere.delete(machine.key);
      await this.publish();
      // The durable id now holds the host repository. Hand the clone
      // directly to Sync; an older caller's finally owns neither gate.
      reservation.release();
      this.startSync(machine.key, { join });
    } finally {
      claim?.release();
      reservation.release();
    }
  }

  /** Ask the host to create `name` in a group for a clone (git-host-6). */
  private async create(
    machine: RepositorySync,
    group: { id: string | null; fullPath: string },
    name: string,
    description: string,
    mode: "refuse" | "quiet",
    held?: RepositoryReservation,
  ): Promise<"created" | "waiting" | "local"> {
    const reservation = held ?? machine.hold("join", "check");
    if (!reservation) { machine.assertNotRunning(); return "local"; }
    machine.assertOwner(reservation);
    try {
      const blocker = await this.host.blocker(machine.key);
      if (blocker) {
        if (mode === "quiet") return "local";
        throw new CoreError("busy", blocker);
      }
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
      // As the host answered: no `spex` branch yet, nor a members' count.
      await this.adopt(machine, { repository: answer.repository, readOnly: null, branchPresent: false, members: null }, false, reservation);
      return "created";
    } finally { reservation.release(); }
  }

  /** Every step left waiting before this read, asked again at it
   * (space-64): a creation a member with the rights did is found and
   * joined. */
  private async retryWaiting(view: HostView, waited: Set<string>): Promise<void> {
    for (const [key, waiting] of [...this.waiting]) {
      if (!waited.has(key)) continue;
      if (!this.host.store.repository(key)) { this.waiting.delete(key); continue; }
      const machine = this.machine(key);
      if (waiting.step === "create" && waiting.create) {
        const ask = waiting.create;
        this.waiting.delete(key);
        // A group's own creation is given the group's own spex repository
        // by its records alone, under whatever name, never by the name it
        // asked, which a project's may bear (space-65).
        if (!existsSync(machine.repository.projectFile)) {
          await this.giveGroupRepository(machine, view, waiting.group, { id: ask.groupId, name: ask.name });
          continue;
        }
        // A project's creation its pick asked is found by that name (space-58).
        const found = view.listings.find((listing) => listing.repository.group.fullPath === waiting.group && listing.repository.path === ask.name);
        try {
          if (found) await this.adopt(machine, found, true);
          else await this.create(machine, { id: ask.groupId, fullPath: waiting.group }, ask.name, ask.description, "quiet");
        } catch (error) {
          // One clone's refused assignment must not stop the remaining
          // waiting clones from being considered at this read.
          if (error instanceof CoreError && error.code === "busy") this.waiting.set(key, waiting);
          else console.error(`spex: ${key} stays on this device: ${error instanceof Error ? error.message : String(error)}`);
        }
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

  /** A sync the core starts itself — after a sign-in, a creation or a
   * retried step — admitted as the reader's (space-57): where the notice
   * is owed it does not start, or its Check stops it, sending nothing,
   * and the row stands with its Sync. */
  private startSync(key: string, input: { join?: boolean }): void {
    const machine = this.machines.get(key);
    if (!machine || this.stopping) return;
    machine.sync(input).catch((error: unknown) => {
      if (error instanceof CoreError && error.details?.notice === true) { void this.publish(); return; }
      console.error(`spex: ${key} did not start syncing: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** Pick a group for a local-only spex repository (space-58): join a
   * listed one, or create `<name>-spex` in a group. */
  async pick(key: string, choice: { kind: "join"; hostId: string } | { kind: "create"; groupId: string | null; name: string }, noticed = false): Promise<{ accepted: true }> {
    const machine = this.machine(key);
    machine.assertNotRunning();
    const reservation = machine.hold("join", "check")!;
    try {
      const blocker = await this.host.blocker(key);
      if (blocker) throw new CoreError("busy", blocker);
      const facts = await machine.readFacts();
      if (facts.remote !== null) {
        throw new CoreError("invalid_request", i18n._({ id: "{name} is on the host already", values: { name: splitKey(key).name }, comment: "Refusal of a pick: the spex repository is not local only" }));
      }
      if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
      const view = this.view ?? await this.readHost().catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.hostName())); });
      // A join or a creation pushes this clone's records where others
      // may read them: the notice is seen first (space-57).
      const store = this.host.store;
      if (noticed) store.setPref(noticedPref(key), true);
      const seen = noticed || store.getPref<unknown>(noticedPref(key)) === true;
      if (choice.kind === "join") {
        const listing = view.listings.find((entry) => entry.repository.id === choice.hostId);
        if (!listing) throw new CoreError("not_found", noLongerShared());
        if (this.noticeOwed(listing, key)) {
          throw new CoreError("invalid_request", i18n._({
            id: "Read the sharing notice before joining {name}",
            values: { name: listing.repository.path },
            comment: "Refusal of a pick joining a spex repository with other members until the reader has seen the privacy notice",
          }), { notice: true, members: listing.members, visibility: listing.repository.visibility });
        }
        await this.adopt(machine, listing, true, reservation);
        return { accepted: true };
      }
      const base = kebab(choice.name.trim().replace(/-spex$/i, ""));
      if (!base) {
        throw new CoreError("invalid_request", i18n._({ id: "The name must hold a letter or a digit", comment: "Refusal of a new spex repository's name with nothing of a name in it" }));
      }
      const group = choice.groupId === null
        ? (userGroup(view) ?? { id: null, fullPath: this.host.store.home.ownName, kind: "user" as const })
        : view.groups.find((entry) => entry.id === choice.groupId);
      if (!group) throw new CoreError("not_found", i18n._({ id: "The host lists no such group", comment: "Refusal of a pick naming a group the Git host does not list" }));
      // A creation in a group other than your own: its members, unknown
      // until it exists, may read what the push sends. Your own group
      // says nothing, nor does a group's own repository created quietly
      // with no session in it (space-65), and a waiting creation joined
      // later follows this pick's notice.
      if (!seen && group.kind !== "user") {
        throw new CoreError("invalid_request", i18n._({
          id: "Read the sharing notice before creating {name} in {group}",
          values: { name: `${base}-spex`, group: group.fullPath },
          comment: "Refusal of a pick creating a spex repository in a group other than the reader's own until the reader has seen the privacy notice",
        }), { notice: true, members: null, visibility: null });
      }
      const project = this.projectFile(machine.repository);
      await this.create(machine, { id: group.id, fullPath: group.fullPath }, `${base}-spex`,
        repositoryDescription({ kind: "project", name: project?.name ?? base, code: project?.remote ?? null }), "refuse", reservation);
      return { accepted: true };
    } finally {
      reservation.release();
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
    if (this.hostReservations.has(hostId) && this.joining.get(hostId)?.phase === "running") throw new CoreError("busy", i18n._({ id: "Already syncing", comment: "Refusal of a second operation on a spex repository while one runs" }));
    const claim = this.reserveHost(hostId, this.view?.listings.find((entry) => entry.repository.id === hostId)?.repository.path ?? hostId);
    let machine: RepositorySync | undefined;
    let reservation: RepositoryReservation | undefined;
    let launched = false;
    try {
      const view = this.view ?? await this.readHost().catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.hostName())); });
      const listing = view.listings.find((entry) => entry.repository.id === hostId);
      if (!listing) throw new CoreError("not_found", noLongerShared());
      const key = hostKey(listing.repository);
      if (!key) {
        throw new CoreError("invalid_request", i18n._({ id: "{path} cannot stand as a folder on this device", values: { path: `${listing.repository.group.fullPath}/${listing.repository.path}` }, comment: "Refusal of a join: the host's names hold characters a folder under the home cannot" }));
      }
      claim.key = key;
      const store = this.host.store;
      // A clone here holds it, its remote written or, by a pick or a
      // lookup, being written (space-63, space-65).
      const here = store.listRepositories().some((repository) => {
        const facts = this.machine(repository.key).facts;
        return facts.id === hostId || listingFor(view, facts.id, facts.remote)?.repository.id === hostId;
      });
      // A group's own spex repository its group's local-only clone here is
      // given — by a standing choice's Use, or by its lookup at the next
      // read, whether or not that has run — is the clone's to take: as a
      // clone of its own it would hold the group's records beside that
      // clone (space-65, space-69).
      const choice = this.standingChoices().some((entry) => entry.candidates.some((candidate) => candidate.repository.id === hostId));
      if (!here && (choice || this.givenHere(view, listing))) {
        // Where no choice stands because the group's records are held
        // here, the refusal says so, as the clone's row does (space-61).
        const held = choice ? undefined : this.heldFor(listing.repository.group.fullPath);
        throw new CoreError("invalid_request", held ? recordsHere(held.group, held.name) : i18n._({
          id: "Use {name} where this device asks which holds the records",
          values: { name: listing.repository.path },
          comment: "Refusal of a join: the listed spex repository is a group's own that this device's local-only clone of that group is given, by a standing choice's Use or by its lookup at the next read",
        }));
      }
      if (here || store.repository(key) || existsSync(store.home.clonePath(key))) {
        throw new CoreError("invalid_request", i18n._({ id: "{name} is on this device already", values: { name: listing.repository.path }, comment: "Refusal of a join: the spex repository has a clone here" }));
      }
      const path = folder === undefined ? undefined : resolve(folder);
      if (path !== undefined && store.home.keyForFolder(path)) {
        throw new CoreError("invalid_request", i18n._({ id: "{path} is another project's working folder", values: { path }, comment: "Refusal of a join: the folder named is paired already" }));
      }
      // Own the destination even before its clone is indexed: another
      // join's rescan must not expose a half-cloned repository as writable.
      const occupied = this.busyFor(key);
      if (occupied) throw new CoreError("busy", occupied);
      machine = new RepositorySync(this.host, this, spexRepository(key, store.home.clonePath(key)));
      this.machines.set(key, machine);
      reservation = machine.hold("join", "check")!;
      await this.assertHostAvailable(view, listing, key, false);
      this.joining.set(hostId, machine.phase);
      await this.publish();
      void this.runJoin(listing, machine, path, reservation, claim);
      launched = true;
      return { accepted: true };
    } finally {
      if (!launched) {
        reservation?.release();
        claim.release();
        if (machine && !this.host.store.repository(machine.key) && this.machines.get(machine.key) === machine) this.machines.delete(machine.key);
      }
    }
  }

  /** Whether a listed spex repository is a group's own that a local-only
   * clone of its group on this device is given (space-65): your own
   * group's clone, for the account's own group, or another group's
   * paired with a working folder, either holding no `project.json` —
   * whether or not its lookup has run. */
  private givenHere(view: HostView, listing: HostListing): boolean {
    if (listedRecords(listing) !== "group") return false;
    const store = this.host.store;
    const own = store.home.own();
    const group = listing.repository.group.fullPath;
    return store.listRepositories().some((repository) => {
      const key = repository.key;
      if (!store.repository(key) || existsSync(repository.projectFile) || this.machine(key).facts.remote !== null) return false;
      if (key === own) return group === (userGroup(view)?.fullPath ?? store.home.ownName);
      const clone = splitKey(key).group;
      return clone === group && clone !== store.home.ownName && Boolean(store.home.folderOf(key));
    });
  }

  /** A local-only clone of `group` whose group's records are held here
   * with no choice standing (space-65): the group and the holder's name. */
  private heldFor(group: string): { group: string; name: string } | undefined {
    for (const [key, heldGroup] of this.heldHere) {
      if (heldGroup !== group || this.choices.has(key) || this.machines.get(key)?.facts.remote !== null) continue;
      const held = this.recordsHeld(key);
      if (held) return held;
    }
    return undefined;
  }

  private async runJoin(listing: HostListing, machine: RepositorySync, folder: string | undefined, reservation: RepositoryReservation, claim: HostReservation): Promise<void> {
    const store = this.host.store;
    const key = machine.key;
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
      store.adoptRepositories();
      this.host.repositoriesChanged();
      machine.rebind(store.repository(key)!);
      await machine.readFacts();
      await this.host.rescanSessions(key);
      this.host.ledgerChanged([key]);
      if (folder !== undefined) await this.pairJoined(machine, id, folder, reservation);
      // The join ends once its code is here or its clone failed; only
      // then does its row read the clone's state (space-61, space-63).
      this.joining.delete(id);
    } catch (error) {
      stop({ cause: "git", message: lastLines(error instanceof Error ? error.message : String(error)), guidance: retryGuidance(), retry: true });
    } finally {
      reservation.release(machine.phase.phase === "stopped" ? machine.phase : { phase: "idle" });
      claim.release();
      if (!store.repository(key) && this.machines.get(key) === machine) this.machines.delete(key);
      await this.publish();
      // A join that stopped holds its group's records here no more: a
      // lookup it held is asked again (space-65).
      if (this.joining.get(id)?.phase === "stopped") this.reaskReleased();
    }
  }

  /** The joined clone's working folder (space-63): the code cloned from
   * the remote its `project.json` names with this device's own Git and
   * credentials, or a folder already holding it, paired with the clone;
   * a group's own spex repository pairs the folder its sessions run in.
   * The join's Code step runs while the code clones (space-63). */
  private async pairJoined(machine: RepositorySync, id: string, folder: string, reservation: RepositoryReservation): Promise<void> {
    machine.assertOwner(reservation);
    const project = this.projectFile(machine.repository);
    const root = existsSync(folder) && await this.workTreeRoot(folder);
    const remote = !root && project?.remote ? project.remote : undefined;
    const step: SyncStep = remote ? "code" : "check";
    reservation.phase({ phase: "running", op: "join", step, since: Date.now(), cancelable: false });
    this.joining.set(id, machine.phase);
    await this.publish();
    let failure: GitFailure | undefined;
    try {
      if (remote) {
        mkdirSync(dirname(folder), { recursive: true });
        const run = await this.probe.run(["clone", "-q", remote, folder], { transport: true });
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
      if (failure) reservation.phase({ phase: "stopped", op: "join", step, ...failure });
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
        throw new CoreError("invalid_request", i18n._({ id: "On this device only", comment: "A spex repository's state: it has no remote on the Git host" }));
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
   * needs a sign-in, and a sync sending into a repository with other
   * members, or whose members the host has not told, needs the notice
   * seen (space-57). */
  async admit(machine: RepositorySync, input: { push: boolean; noticed: boolean }): Promise<void> {
    const facts = machine.facts;
    if (!this.atHost(facts)) return;
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    if (!input.push || input.noticed) return;
    // Only the reader's having seen the notice is its evidence
    // (storage-5); this asks it early on the facts at hand, and the
    // sync's Check decides again on the answer it acts on.
    if (this.host.store.getPref<unknown>(noticedPref(machine.key)) === true) return;
    // Unknown is not "only me": a repository the view read before it
    // existed, or whose members it lacks, is read again; still unknown,
    // its push waits for the notice.
    let listing = listingFor(this.view, facts.id, facts.remote);
    if (!listing || listing.members === null) {
      try { listing = listingFor(await this.readHost(), facts.id, facts.remote); }
      catch {
        // Unread: the sync's Check stops on the host's failure
        // (space-15), or decides the notice on its own read (space-57).
        return;
      }
    }
    if (listing && !this.noticeOwed(listing, machine.key)) return;
    const members = listing?.members ?? null;
    throw new CoreError("invalid_request", noticeFirst(splitKey(machine.key).name),
      { notice: true, members, visibility: listing && members !== null ? listing.repository.visibility : null });
  }

  /** Whether a sync sending into a listed spex repository owes the
   * sharing notice first (space-57): the host lets the account push
   * there, tells other members or none, and this device's reader has
   * not seen the notice for it (storage-5). One rule for the admission,
   * the Check step and the pick joining it. */
  private noticeOwed(listing: HostListing, key: string): boolean {
    return listing.readOnly === null
      && (listing.members === null || listing.members > 1)
      && this.host.store.getPref<unknown>(noticedPref(key)) !== true;
  }

  /** The Check step's read of the host for one clone (space-12): follow
   * a rename or a transfer on a sync (space-60), take the URL the host
   * hands over, and prepare the branch before a first push (git-host-7).
   * Undefined for a clone whose remote is not on the host. */
  async hostCheck(machine: RepositorySync, op: SpaceOp, reservation: RepositoryReservation): Promise<{ remote: string; readOnly: boolean } | undefined> {
    machine.assertOwner(reservation);
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
    if (facts.id === null) await machine.recordIdNow(repository.id, reservation);
    const key = hostKey(repository);
    // Your own group's spex repository the host lists outside the
    // account's own group is not followed: that group would become your
    // own (space-60). Without the account's own group in the view, the
    // kind of the group the host lists decides.
    const user = userGroup(view);
    const outside = key !== null && (user
      ? splitKey(key).group !== user.fullPath
      : repository.group.kind !== "user" || splitKey(key).group.toLowerCase() !== splitKey(machine.key).group.toLowerCase());
    if (key && key !== machine.key && machine.key === this.host.store.home.own() && outside) {
      const name = splitKey(machine.key).name;
      throw new SpaceStopped("check", {
        cause: "git",
        message: i18n._({ id: "{name} is no longer in your own group on {host}", values: { name, host: this.hostName() }, comment: "A stopped sync: the Git host lists your own group's spex repository in another group; {name} is its name, {host} the host's display name" }),
        guidance: i18n._({ id: "Move it back to your own group on {host}, then Retry.", values: { host: this.hostName() }, comment: "Guidance where your own group's spex repository was moved out of your own group on the Git host; {host} is its display name" }),
        retry: true,
      });
    }
    if (op === "sync" && key && key !== machine.key) await this.moveInSync(machine, key);
    if (facts.remote !== repository.remoteUrl) await machine.setOrigin(repository.remoteUrl, reservation);
    // The notice decided on the host's answer this sync acts on: owed,
    // the sync stops before anything is prepared or sent, its Save
    // commit standing, and its Sync asks the notice (space-57, space-15).
    if (op === "sync" && this.noticeOwed(listing, machine.key)) {
      throw new SpaceStopped("check", { cause: "notice", message: noticeFirst(splitKey(machine.key).name), guidance: noticeThenSync(), retry: true });
    }
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
   * gate (space-60), a spelling differing only by case on either
   * filesystem kind. A folder renamed in place carries the clones beneath
   * it: they stay where they lie, every path to them still read on the
   * filesystem that read both spellings as one, and their keys follow
   * the folder's spelling in the same step. Your own group's spex
   * repository moving to another folder carries the local-only clones of
   * its own, since what you add for yourself stays in your own group's
   * folder. The move holds the gates of every clone it carries too, and
   * runs only while nothing beneath any of them runs; otherwise the sync
   * goes on where the clone lies and a later sync moves it. `home.yaml`
   * follows in the same step, your own group's key among its pairs
   * (storage-2). */
  private async moveInSync(machine: RepositorySync, to: string): Promise<void> {
    const store = this.host.store;
    const workspace = store.home.workspace;
    const from = machine.key;
    const taken = (path: string): SpaceStopped => new SpaceStopped("check", {
      cause: "git",
      message: i18n._({ id: "{path} already exists, so the clone cannot follow the host there", values: { path: `workspace/${path}` }, comment: "A stopped sync: the folder a renamed spex repository moves to is taken" }),
      guidance: i18n._({ id: "Move that folder aside, then Retry.", comment: "Guidance where a renamed spex repository's new folder is taken" }),
      retry: true,
    });
    if (moveCollides(workspace, from, to)) throw taken(to);
    const keys = this.occupiedKeys();
    const moves = [{ from, to }, ...carriedClones(workspace, from, to, keys)];
    const carried = moves.slice(1).map((move) => move.from);
    // Your own group's spex repository leaving its folder: every other
    // clone of that folder is a candidate, carried where it is not on
    // the host, which no sync of its own would move (space-60).
    const group = splitKey(from).group;
    const movingOwnGroup = from === store.home.own() && splitKey(to).group !== group;
    const candidates = movingOwnGroup
      ? keys.filter((key) => key !== from && !carried.includes(key) && splitKey(key).group === group)
      : [];
    const held = new Map<RepositorySync, RepositoryReservation>();
    let releaseDestinations: (() => void) | undefined;
    try {
      // The gate of every clone the move may carry, in key order
      // (space-21): held before the checks, and through the move until
      // the store, the machines and the core read every clone where it
      // now lies. One running, picked or not quiet defers the move.
      for (const key of keys.filter((each) => carried.includes(each) || candidates.includes(each))) {
        if (!store.repository(key) && this.busyFor(key)) return;
        const each = this.machine(key);
        const reservation = each.hold("move", "apply");
        if (!reservation) return;
        held.set(each, reservation);
      }
      // Each candidate's clone is read under its gate: one on the host
      // follows the host's moves on its own syncs and is let go.
      for (const key of candidates) {
        const each = this.machine(key);
        if (this.atHost(await each.readFacts())) {
          held.get(each)!.release();
          held.delete(each);
        } else moves.push({ from: key, to: `${splitKey(to).group}/${splitKey(key).name}` });
      }
      const local = moves.slice(1 + carried.length);
      const collision = local.find((move) => moveCollides(workspace, move.from, move.to));
      if (collision) throw taken(collision.to);
      // The home file the move leaves is checked before any clone moves:
      // a refusal leaves every folder and pair where it is.
      try { store.home.checkMove(moves); }
      catch (error) {
        if (!(error instanceof StorageFormatError)) throw error;
        throw new SpaceStopped("check", { cause: "git", message: error.reason, guidance: retryGuidance(), retry: true });
      }
      releaseDestinations = this.reserveDestinations(moves);
      if (!releaseDestinations) return;
      for (const { from: key } of moves.slice(1)) if (await this.host.blocker(key)) return;
      const moving = [machine, ...held.keys()];
      // Reads in flight end, and an environment's writes land, before the
      // clones move; a read starting meanwhile reads them moved.
      try {
        for (const each of moving) await each.beginMove();
        await this.host.settleBeneath?.(moves.map((move) => move.from));
        // A clone added meanwhile beneath a folder renamed in place would
        // move with no key of its own: a later sync moves them all.
        const occupied = this.occupiedKeys();
        if (carriedClones(workspace, from, to, occupied).some((move) => !carried.includes(move.from))) return;
        if (movingOwnGroup && occupied.some((key) => splitKey(key).group === group && !keys.includes(key))) return;
        moveClone(workspace, from, to);
        for (const move of local) moveClone(workspace, move.from, move.to);
        this.relocate(moves);
      } finally {
        for (const each of moving) each.endMove();
      }
      await this.afterMove(moves);
    } finally {
      releaseDestinations?.();
      for (const reservation of held.values()) reservation.release();
    }
  }

  /** Indexed clones and paths already owned by joins or moves whose
   * store update has not landed yet. */
  private occupiedKeys(): string[] {
    return [...new Set([
      ...this.host.store.listRepositories().map((repository) => repository.key),
      ...[...this.machines].filter(([, machine]) => machine.busy()).map(([key]) => key),
      ...this.destinations.keys(),
    ])];
  }

  /** Claim each destination without replacing another operation's
   * machine. The same clone reservation protects both keys until the
   * move and its refresh finish. */
  private reserveDestinations(moves: { from: string; to: string }[]): (() => void) | undefined {
    const claims = moves.map(({ from, to }) => ({ key: to, value: { machine: this.machines.get(from)! } }));
    if (claims.some(({ key, value }) => {
      const at = this.machines.get(key);
      return this.destinations.has(key) || (at !== undefined && at !== value.machine && at.busy() !== undefined);
    })) return undefined;
    for (const { key, value } of claims) this.destinations.set(key, value);
    return () => {
      for (const { key, value } of claims) if (this.destinations.get(key) === value) this.destinations.delete(key);
    };
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

  isCurrent(machine: RepositorySync): boolean { return this.machines.get(machine.key) === machine; }

  /** Reserve a clone for its project's removal (projects-10): its gate
   * held as an operation's (space-21) until the removal ends — lifted
   * where the removal is refused or keeps the clone (your own group's),
   * the clone reading as before; the machine forgotten with a clone the
   * removal deleted. Refused `busy` naming the operation that runs;
   * nothing is held where no clone stands. */
  holdRemoval(key: string): { refused(): void; removed(): void } | undefined {
    if (!this.host.store.repository(key)) return undefined;
    const machine = this.machine(key);
    const reservation = machine.hold("remove", "apply");
    if (!reservation) throw new CoreError("busy", machine.busy() as string);
    // Each transition is announced (space-29); a deleted clone's
    // departure is the groups' own announcement.
    void this.publish().catch(() => {});
    return {
      refused: () => {
        reservation.release();
        void this.publish().catch(() => {});
      },
      removed: () => {
        reservation.release();
        if (this.host.store.repository(key)) {
          void this.publish().catch(() => {});
        } else if (this.machines.get(key) === machine) this.machines.delete(key);
      },
    };
  }

  /** The busy message while an operation runs on this clone (space-21);
   * other clones stay writable. */
  busyFor(key: string | undefined): string | undefined {
    return key === undefined ? undefined : this.machines.get(key)?.busy() ?? this.destinations.get(key)?.machine.busy();
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
      // A standing choice's answer lapses only with its candidates, as
      // the set-up's read finds them (space-69).
      if (key.startsWith(CHOICE_PREFS)) continue;
      if (!standing.has(key.slice("space:repair:".length))) this.host.store.deletePref(key);
    }
  }

  /** Only the reader's own act settles a repair (space-54): declining
   * says this is not a project on this device, and is a preference,
   * which never syncs. Rendering never writes here. A standing choice is
   * answered the same way (space-69). */
  async decline(repair: string, declined: boolean): Promise<GroupsState> {
    const known = this.diagnostics().some((entry) => entry.repair?.key === repair)
      || this.standingChoices().some((choice) => choice.repair === repair);
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

  /** The Groups state a client asks for (`space.get`, space-29). The
   * first ask after a start signed in, with no read begun since, begins
   * the host read that start owes, as Refresh does: once, however many
   * clients ask, and not awaited — the reply is the state as it stood at
   * the ask, and the read's outcome is announced as any read's
   * (git-host-5). */
  async get(): Promise<GroupsState> {
    const owed = this.startRead && this.signedIn() && this.readsBegun === 0 && !this.reading && !this.settingUp;
    this.startRead = false;
    const state = await this.state();
    if (owed && this.signedIn() && !this.stopping) {
      void this.setUp().catch((error: unknown) => {
        console.error(`spex: reading the host at start failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    return state;
  }

  /** The sign-in the header shows (space-3, space-30): idle carries the
   * host's sign-out, with the account's login, while signed out. */
  private signInView(): GroupsState["signIn"] {
    if (this.signInState.phase !== "idle" || this.hostSignedOut === undefined || this.signedIn()) return this.signInState;
    return { phase: "idle", signedOut: { by: "host", login: this.hostSignedOut } };
  }

  private async assemble(recompute: boolean): Promise<GroupsState> {
    const store = this.host.store;
    const repositories: RepositoryState[] = [];
    for (const repository of store.listRepositories()) {
      // A clone that moved while this read waited is read under its
      // new key, and its old one names nothing (space-59, space-60).
      if (!store.repository(repository.key)) continue;
      const machine = this.machine(repository.key);
      const base = recompute || !machine.cached ? await machine.state(true) : { ...machine.cached, sync: machine.phase };
      repositories.push(this.overlay(machine, base));
    }
    for (const [key, machine] of this.machines) if (!store.repository(key) && !machine.busy()) this.machines.delete(key);
    const choices = this.standingChoices();
    for (const choice of choices) {
      const index = repositories.findIndex((row) => row.key === choice.key);
      if (index < 0 || repositories[index].state !== "local-only") continue;
      repositories[index] = {
        ...repositories[index],
        choice: {
          repair: choice.repair,
          candidates: choice.candidates.map((listing) => ({ hostId: listing.repository.id, name: listing.repository.path, members: listing.members, visibility: listing.repository.visibility })),
          declined: choice.declined,
        },
      };
    }
    repositories.push(...this.absentRows(new Set(choices.flatMap((choice) => choice.candidates.map((listing) => listing.repository.id)))));
    const diagnostics = await this.host.checkRepairs(this.diagnostics());
    const host = store.home.host;
    return {
      home: resolve(this.host.home),
      git: await this.probe.version(),
      host: { url: host.url, displayName: this.view?.displayName ?? this.described?.displayName ?? null },
      account: store.home.account(),
      signIn: this.signInView(),
      readAt: this.signedIn() ? this.view?.readAt ?? null : null,
      groups: this.groupsOf(repositories),
      diagnostics,
      // One number, so the header and the list cannot drift (space-1):
      // what the reader has not answered — repairs and standing choices
      // (space-69) — and everything unfolded.
      issues: countIssues(diagnostics) + repositories.filter((row) => row.choice !== null && !row.choice.declined).length,
    };
  }

  /** The group and the holder's name of a clone whose lookup found its
   * group's records held here, while a clone or a join still holds them
   * (space-65). */
  private recordsHeld(key: string): { group: string; name: string } | undefined {
    const group = this.heldHere.get(key);
    if (group === undefined || !this.view || !this.signedIn()) return undefined;
    const holder = this.holderOf(this.view, group, this.heldIds(this.view, key));
    return holder === undefined ? undefined : { group, name: splitKey(holder).name };
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
    if (facts.remote === null) {
      // A group's clone whose records another clone here holds, or a
      // join of them, names it while it holds them (space-65, space-61).
      const held = this.recordsHeld(base.key);
      return { ...row, state: "local-only", reason: held ? recordsHere(held.group, held.name) : null };
    }
    // A remote the reader named, a path this device reaches: no host.
    if (!this.atHost(facts)) return row;
    if (!this.signedIn()) return { ...row, state: "unreachable", reason: signInAgain() };
    // Attached since the view's read began, it counts as listed (git-host-5).
    const listing = listingFor(this.view, facts.id, facts.remote) ?? listingFor({ listings: [...this.attached.values()] }, facts.id, facts.remote);
    const listed: RepositoryState = listing ? { ...row, members: listing.members, visibility: listing.repository.visibility } : row;
    // A clone whose join still runs is not on this device yet: its code
    // may still be cloning (space-61, space-63).
    const joining = facts.id === null ? undefined : this.joining.get(facts.id);
    if (joining?.phase === "running") return { ...listed, state: "absent", reason: null, sync: joining };
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
   * lacks (space-61: "Not on this device"), each candidate of a standing
   * choice among them even where a local-only clone bears its key
   * (space-69). */
  private absentRows(offered: Set<string>): RepositoryState[] {
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
      if (!key || matched.has(repository.id) || (store.repository(key) && !offered.has(repository.id))) continue;
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
        records: listedRecords(listing),
        choice: null,
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
    // The group's own first by the records it holds, not by its name
    // (space-65), your own group's clone and a clone whose choice stands
    // before the candidates (space-69).
    const groupsOwn = (row: RepositoryState): boolean => row.records === "group";
    for (const entry of entries.values()) {
      entry.repositories.sort((a, b) => Number(b.own) - Number(a.own)
        || Number(b.choice !== null) - Number(a.choice !== null)
        || Number(groupsOwn(b)) - Number(groupsOwn(a))
        || a.key.localeCompare(b.key));
    }
    return [own, ...[...entries.values()].filter((entry) => entry !== own).sort((a, b) => a.fullPath.localeCompare(b.fullPath))];
  }

  /** Broadcast the state after one machine moved, from each machine's
   * last reading; transitions in a burst coalesce into one. */
  async publish(): Promise<void> {
    if (this.stopping) return;
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
    const machine = this.machine(key);
    return machine.reading(() => machine.diff(unit, path, side));
  }

  tree(key: string, path?: string): Promise<{ path: string; entries: SpaceEntry[] }> {
    const machine = this.machine(key);
    return machine.reading(() => machine.tree(path));
  }

  read(key: string, path: string): Promise<SpaceReadResult> {
    const machine = this.machine(key);
    return machine.reading(() => machine.read(path));
  }

  /** What removing a project would lose (projects-9). */
  pendingUnits(key: string): Promise<number> {
    if (!this.host.store.repository(key)) return Promise.resolve(0);
    const machine = this.machine(key);
    return machine.reading(() => machine.pendingUnits());
  }

  /** An interrupted apply in any clone is repaired from its marker before
   * the core reopens it (space-31). */
  async repairAtStartup(): Promise<void> {
    for (const repository of this.host.store.listRepositories()) await this.machine(repository.key).repairAtStartup();
  }

  /** Cancel every transport and wait for the operations (shutdown). */
  async stop(): Promise<void> {
    this.stopping = true;
    await Promise.all([...this.machines.values()].map((machine) => machine.stop()));
    // No read of a clone outlives the core that started it.
    try { await this.publishing; } catch { /* reported where it ran */ }
    await Promise.all([...this.machines.values()].map((machine) => machine.quiesce()));
  }
}

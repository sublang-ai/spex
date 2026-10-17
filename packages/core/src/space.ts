// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups' core (DR-103, DR-057, DR-111): every spex repository on this
// device with its sync machine — one operation per clone, any number of
// clones at once (space-31) — its three-way unit plan with human labels
// (space-33, space-34), the validated apply that never runs `git merge`
// (space-19), the refresh that re-indexes the running core (space-20),
// and the read-only explorer (space-35). A clone's own operations run in
// order, a Sync following a Check (space-21); each write is checked at
// its own instant, where a retained session lease or an authoring turn
// of this core can refuse it (space-19, space-59, space-60).

import { randomUUID } from "node:crypto";
import { resolveMachineIdentity } from "@sublang/playbook/machine-identity";
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, type Dirent } from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { type StorageDiagnostic } from "./app-storage.js";
import { readJsonFile, StorageFormatError, UUID, writeApplicationFile } from "./files.js";
import { withGitCredential, type GitCredentialHandle } from "./git-credential.js";
import {
  CredentialChanged, HostError, SignInBusyError, type BrowserSignIn, type DeviceSignIn, type GitHostClient, type HostAccount, type HostGroup,
  type HostMember, type HostRepository, type MembersTarget,
} from "./git-host.js";
import { kebab, splitKey } from "./home.js";
import { i18n } from "./i18n.js";
import { classifyOwnerMachine, probeProcess } from "./root-lease.js";
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
  signInAgain, SpaceGit, validateRemoteUrl, withoutHostUrls, type GitFailure, type GitRun, type GitRunOptions,
} from "./space-git.js";
import {
  callbackPages, collidingGroup, groupNameTaken, groupNamedLikeYourLogin, groupNotEmpty, groupNotListed, hostKey, listingFor, namedLikeYourLogin,
  namedLogins, nameOneTarget, nameTaken, nameTheGroup, nameTheLogin, notARole, notFoundAt, ownNameFor, pathTheGroup, readHostView, relayHostError,
  renameNothing, repositoryDescription, sameLogin, signInFailure, takenIn, underOrigin, userGroup, waitingPhrase,
  type HostListing, type HostView,
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
  SET_UP_SUBJECT,
  SPEX_BRANCH,
  storageUnitName,
  StorageWriteRefused,
  UPLOAD_STAGING,
  validateStorageSnapshot,
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
  broadcast: (state: GroupsState) => void;
  reloadConfig: () => Promise<void>;
  /** One full rescan of a clone's sessions: history-replaced,
   * session.state, session.removed and intents.changed as a foreign-host
   * rescan announces them (core-service-60, core-service-87). */
  rescanSessions: (repository: string) => Promise<void>;
  ledgerChanged: (projectIds: string[]) => void;
  /** Test seam (space-32): the transport limit; 120 s by default. */
  transportTimeoutMs?: number;
  /** Test seam: awaited before each step runs, and inside Save between
   * its validation and its commit (`at: "commit"`), so a suite can act
   * between them deterministically. */
  beforeStep?: (event: { op: SpaceOp; step: SyncStep; repository: string; at?: "commit" }) => void | Promise<void>;
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
  /** Throws where an Apply or a repair may not replace authoring session
   * `id` of clone `key` now — its turn runs in this core (space-19):
   * called synchronously at that unit's write, after its version check
   * and before its first file is replaced. */
  assertAuthoringWritable?: (key: string, id: string) => void;
}

/** What a spex repository's clone says of its host: its origin URL and
 * the host's id recorded beside it (git-host-5). */
interface CloneFacts { remote: string | null; id: string | null }

/** A row with the group the host's last read names for it, where it
 * lists it (space-1). */
interface Placed { row: RepositoryState; group?: HostGroup }

/** The last sync a clone holds (space-61). */
type Agreed = NonNullable<NonNullable<RepositoryState["branch"]>["agreed"]>;

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
/** A repository the core created and the host reports empty is read
 * again this many times, this far apart, before the sync pushes the
 * default branch itself (git-host-7). */
const CREATED_REREADS = 5;
const CREATED_REREAD_MS = 2_000;
/** The clone's Git configuration key recording, by the host's id, the
 * core's creation of its repository until a check is done with it
 * (git-host-7): on the clone, so a restart of the core keeps it. */
const CREATED_KEY = "spex.created";

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

/** Guidance under a stop the host's rate limit made, or a Stop of its
 * wait (space-15, git-host-21): a key phrase, not an explanation. */
const retryWaits = (): string => i18n._({
  id: "Retry waits, then runs the step.",
  comment: "Guidance where the Git host asked to wait: Retry waits out the time it asked for before running the step",
});

/** A step the reader stopped while its call to the host waited out the
 * host's rate limit (space-15, space-16, git-host-21). */
function waitStopped(step: SyncStep, host: string): SpaceStopped {
  return new SpaceStopped(step, {
    cause: "stopped",
    message: i18n._({ id: "Stopped while waiting for {host}", values: { host }, comment: "A stopped step's message: the reader stopped it while the Git host's rate limit held its call; {host} is the host's display name" }),
    guidance: retryWaits(),
    retry: true,
  });
}

/** `work`, ended early where `signal` aborts first; `work` itself runs
 * on, its outcome then unread. */
function stoppable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolveWork, rejectWork) => {
    const onAbort = (): void => rejectWork(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolveWork(value); },
      (error: unknown) => { signal.removeEventListener("abort", onAbort); rejectWork(error); },
    );
  });
}

/** A failure of a call to the host as the stopped state of space-15; a
 * stop already phrased passes as it is. */
function hostStop(step: SyncStep, error: unknown, host: string): SpaceStopped {
  if (error instanceof SpaceStopped) return error;
  const message = relayHostError(error, host);
  if (!(error instanceof HostError)) return new SpaceStopped(step, { cause: "git", message: lastLines(message), guidance: retryGuidance(), retry: true });
  switch (error.kind) {
    case "reauth":
      return new SpaceStopped(step, { cause: "reauth", message, guidance: signInThenRetry(), retry: true });
    case "not_found":
      return new SpaceStopped(step, { cause: "gone", message, guidance: nothingDeleted(), retry: true });
    case "rate_limited":
      // The host answered: it asks to wait, which is no network failure
      // (git-host-11), and a Retry waits that out (git-host-21).
      return new SpaceStopped(step, { cause: "throttled", message, guidance: retryWaits(), retry: true });
    case "unreachable":
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

/** Whether two paths name one file — a case-only rename's source and
 * destination on a filesystem that folds case (space-60). */
function sameFile(a: string, b: string): boolean {
  try {
    const one = statSync(a);
    const two = statSync(b);
    return one.dev === two.dev && one.ino === two.ino;
  } catch { return false; }
}

/** Whether a move's destination is taken by anything but its source: a
 * case-folding rename re-cases the final component alone, so the clone
 * itself is its destination only under the same parent (space-60); under
 * another spelling of its group it counts as taken (space-59). A folder
 * on the destination's path below `workspace` that resolves under
 * another spelling on disk takes it too, its leaf absent or not: the
 * rename would land under the disk's spelling while the home records the
 * new key. A missing folder takes nothing. */
function occupied(from: string, to: string, workspace: string): boolean {
  if (existsSync(to) && !(sameFile(from, to) && dirname(from) === dirname(to))) return true;
  const rel = relative(workspace, dirname(to));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return false;
  let parent = workspace;
  for (const part of rel.split(sep)) {
    const next = join(parent, part);
    if (!existsSync(next)) return false;
    let names: string[];
    try { names = readdirSync(parent); } catch { return true; }
    if (!names.includes(part)) return true;
    parent = next;
  }
  return false;
}

/** Playbook's session lease owner as it writes one (`owner.json`, schema
 * 1): mirrored here to read a canonical lease, never to write one. */
const LEASE_OWNER_KEYS = ["acquiredAt", "hostname", "kind", "ownerToken", "pid", "schemaVersion", "sessionId"];
const PLAYBOOK_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LEASE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** Whether a canonical lease `<sessions>/.<id>.lock` is harmless to a
 * move: a private real directory holding only a private regular
 * `owner.json` of the supported shape for that session, whose `hostname`
 * the root lease's rule reads as this machine — its identity, or the
 * legacy host name — for a process proven dead (storage-26). Anything
 * else — a symlink, a malformed or unsupported record, another machine's,
 * a live process, a probe answering neither way — holds the clone. */
function deadOwnLease(dir: string, id: string, identity: string | undefined): boolean {
  try {
    const lease = lstatSync(dir);
    if (!lease.isDirectory() || (lease.mode & 0o7777) !== 0o700) return false;
    const names = readdirSync(dir);
    if (names.length !== 1 || names[0] !== "owner.json") return false;
    const file = lstatSync(join(dir, "owner.json"));
    if (!file.isFile() || (file.mode & 0o7777) !== 0o600) return false;
    const owner = JSON.parse(readFileSync(join(dir, "owner.json"), "utf8")) as Record<string, unknown> | null;
    if (!owner || typeof owner !== "object" || Array.isArray(owner)) return false;
    if (Object.keys(owner).sort().join(",") !== LEASE_OWNER_KEYS.join(",")) return false;
    if (owner.schemaVersion !== 1 || owner.kind !== "captain-session-lease" || owner.sessionId !== id) return false;
    if (typeof owner.ownerToken !== "string" || !PLAYBOOK_UUID.test(owner.ownerToken)) return false;
    if (!Number.isSafeInteger(owner.pid) || (owner.pid as number) <= 0) return false;
    if (typeof owner.acquiredAt !== "string" || !LEASE_TIMESTAMP.test(owner.acquiredAt) || new Date(Date.parse(owner.acquiredAt)).toISOString() !== owner.acquiredAt) return false;
    if (identity === undefined || typeof owner.hostname !== "string" || owner.hostname.trim().length === 0) return false;
    if (classifyOwnerMachine(owner.hostname, identity, hostname()) !== "local") return false;
    return probeProcess(owner.pid as number).state === "dead";
  } catch { return false; }
}

/** The first session of a clone whose canonical Playbook lease
 * `sessions/.<id>.lock` holds the clone where it is (deadOwnLease).
 * Read synchronously, so a move reads it at its rename's instant; it
 * takes and waits for no lease. */
function heldSessionLease(clone: string, identity: string | undefined): string | undefined {
  const dir = join(clone, "sessions");
  let names: string[];
  try { names = readdirSync(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  for (const name of names.sort()) {
    const id = /^\.(.+)\.lock$/.exec(name)?.[1];
    if (!id || !UUID.test(id)) continue;
    if (!deadOwnLease(join(dir, name), id, identity)) return id;
  }
  return undefined;
}

/** A unit's write refused, or a move stopped, for a session's lease or an
 * authoring session's running turn, naming the session (space-15). */
function inUseStop(step: SyncStep, unit: string, store: Store): SpaceStopped {
  const [kind, id] = unit.split("/") as [string, string];
  const title = kind === "sessions" ? store.describeSession(id)?.title : undefined;
  return new SpaceStopped(step, {
    cause: "lease",
    message: title
      ? i18n._({
          id: "“{title}” is in use",
          values: { title },
          comment: "A stopped sync's message: a session is held elsewhere, named by its title",
        })
      : i18n._({
          id: "Session {id} is in use",
          values: { id: kind === "sessions" ? id.slice(0, 8) : id },
          comment: "A stopped sync's message: a session is held elsewhere, named by the head of its identifier",
        }),
    guidance: i18n._({
      id: "Wait for the session to finish, then Retry.",
      comment: "Guidance under a sync a held session stopped",
    }),
    retry: true,
  });
}

/** The refusal of a write whose file changed since it was read (DR-111). */
const changedMeanwhile = (what: string): string => i18n._({
  id: "{what} changed meanwhile; retry",
  values: { what },
  comment: "Refusal of a write: the file it would replace changed since it was read; {what} names the file or folder",
});

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

/** A system call's own failure — a clone gone meanwhile, a full disk —
 * as Node reports it: an ordinary error Retry may clear, never a file
 * the reader must fix (space-15). */
const systemFailure = (error: unknown): boolean =>
  !(error instanceof StorageFormatError) && typeof (error as NodeJS.ErrnoException | null)?.syscall === "string";

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
interface Applied { headBefore: string; headAfter: string }
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
/** Whether a listed repository may have members besides the account: a
 * count above one, or none where the host's read lacked it (space-57,
 * git-host-5). */
const mayHaveOthers = (listing: HostListing): boolean => listing.members === null || listing.members > 1;
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

/** One spex repository's sync machine (space-31): one operation on this
 * clone at a time — a second Sync or Check joins it — any number of
 * clones at once; it refuses nothing beneath the clone (space-21). */
class RepositorySync {
  git: SpaceGit;
  /** The running operation's progress, else the last one's outcome. */
  phase: SpaceSyncPhase = { phase: "idle" };
  /** The clone's remote and recorded id as its last read found them;
   * every decision reads them again first. */
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
  /** The operation running on this clone: its kind and its promise. */
  private current?: { op: SpaceOp; work: Promise<void> };
  /** How the running operation ended, shown once its lists are read. */
  private ended?: SpaceSyncPhase;

  private takeEnded(): SpaceSyncPhase | undefined {
    const ended = this.ended;
    this.ended = undefined;
    return ended;
  }
  private applied?: Applied;
  /** The text of the failure that stopped an interrupted sync's repair;
   * its diagnostic is phrased where it is read (core-service-111). */
  private repairFailure?: string;
  private refreshProblem?: StorageDiagnostic;
  private mergePending = false;
  /** The last sync the clone held at its last reading, by the pair of
   * commits it was read from: a pair always reads the same. */
  private agreedRead?: { pair: string; agreed: Agreed | null };

  constructor(private readonly host: SpaceHost, private readonly owner: SpaceManager, public repository: SpexRepository) {
    this.git = this.makeGit(repository.dir);
  }

  private makeGit(dir: string): SpaceGit {
    return new SpaceGit(dir, this.host.env, {
      ...(this.host.transportTimeoutMs !== undefined ? { transportTimeoutMs: this.host.transportTimeoutMs } : {}),
      identity: () => this.owner.identity(),
      onTransport: () => this.offerStop(),
    });
  }

  /** The step's Git child runs, or a call of it to the host waits out
   * the host's rate limit (space-16, git-host-21): the Check step offers
   * Stop from now, the host read before it otherwise bounded by the
   * client's own timeout. */
  private offerStop(): void {
    if (this.phase.phase !== "running" || this.phase.cancelable) return;
    if (this.phase.step !== "check" && this.phase.step !== "push") return;
    this.phase = { ...this.phase, cancelable: true };
    void this.broadcast(false).catch((error: unknown) => {
      console.error(`spex: space state failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** The running step's calls to the host in flight, each with the Stop
   * that ends its wait for the host's rate limit (git-host-21). */
  private readonly hostCalls = new Set<AbortController>();

  /**
   * One call to the host for the running step (git-host-21): while the
   * host's rate limit holds it, the step offers Stop (space-16), which
   * ends the wait — a direct call sending nothing, a shared read left to
   * answer later — and stops the step (space-15).
   */
  async hostCall<T>(step: SyncStep, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.hostCalls.add(controller);
    if (this.host.client.holding()) this.offerStop();
    try {
      return await stoppable(call(controller.signal), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw waitStopped(step, this.owner.hostName());
      throw error;
    } finally {
      this.hostCalls.delete(controller);
    }
  }

  /** The host's rate limit began holding the calls (git-host-21): a step
   * with one in flight offers Stop. */
  holdBegan(): void {
    if (this.hostCalls.size > 0) this.offerStop();
  }

  /** End the waits of the running step's calls to the host, while the
   * host's rate limit holds them; whether any was ended. */
  private stopWaits(): boolean {
    if (this.hostCalls.size === 0 || !this.host.client.holding()) return false;
    for (const call of this.hostCalls) call.abort();
    return true;
  }

  /** The clone moved (space-59, space-60): this machine follows it. */
  rebind(repository: SpexRepository): void {
    this.repository = repository;
    this.git = this.makeGit(repository.dir);
  }

  /** Whether an operation runs on this clone. */
  running(): boolean { return this.current !== undefined; }

  /** The kind of operation running on this clone, if any. */
  private runningOp(): SpaceOp | undefined { return this.current?.op; }

  /** An outcome a manager's act on this clone ends in — a join's code
   * clone (space-63) — shown unless an operation runs meanwhile. */
  report(phase: SpaceSyncPhase): void {
    if (!this.current) this.phase = phase;
  }

  get key(): string { return this.repository.key; }
  private get dir(): string { return this.repository.dir; }

  /** The clone's remote and recorded host id, read afresh. */
  async readFacts(): Promise<CloneFacts> {
    await this.readRepository();
    return this.facts;
  }

  /**
   * The clone's remote and recorded host id, written only while its
   * remote still reads `expected` (DR-111): the read, the check and the
   * writes are one synchronous step, so no core command lands between
   * them, and Git takes its own config lock for each write. An
   * independent process keeps ordinary filesystem behaviour. Returns
   * false, writing nothing, where the remote changed meanwhile.
   * `created` records the core's creation of that repository
   * (git-host-7), written first so the remote never stands without it.
   */
  private publishRemote(expected: string | null, next: { url?: string | null; id?: string | null; created?: string }): boolean {
    const git = (args: string[]): GitRun => {
      const run = this.git.runSync(args);
      if (run.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${lastLines(run.stderr)}`);
      return run;
    };
    const current = this.configNow("remote.origin.url");
    if (current !== expected) return false;
    if (next.created !== undefined) git(["config", CREATED_KEY, next.created]);
    if (next.url !== undefined && next.url !== current) {
      // Taken away, the remote's own section goes alone: the host's `spex`
      // the clone holds and its upstream stay with the repository it
      // records (space-5), where `remote remove` would drop them.
      git(next.url === null ? ["config", "--remove-section", "remote.origin"] : current === null ? ["remote", "add", "origin", next.url] : ["remote", "set-url", "origin", next.url]);
    }
    if (next.id === null) this.git.runSync(["config", "--unset", "spex.repositoryId"]);
    else if (next.id !== undefined) git(["config", "spex.repositoryId", next.id]);
    this.facts = {
      remote: next.url === undefined ? current : next.url,
      id: next.id === undefined ? this.facts.id : next.id,
    };
    return true;
  }

  /** One config value as the clone's `.git/config` holds it now, read
   * synchronously so a check and its write share one core turn. */
  private configNow(key: string): string | null {
    const read = this.git.runSync(["config", "--get", key]);
    return read.code === 0 ? read.stdout.toString("utf8").trim() : null;
  }

  /** Whether the clone's remote and recorded host id read `remote` and
   * `id` at this instant (DR-111): a move checks them at its rename. */
  recordsNow(remote: string | null, id: string): boolean {
    return this.configNow("remote.origin.url") === remote && this.configNow("spex.repositoryId") === id;
  }

  /** The host's id of the repository whose creation by the core the
   * clone records (git-host-7), read at this instant. */
  createdNow(): string | null {
    return this.configNow(CREATED_KEY);
  }

  /** The clone records no creation any more (git-host-7). */
  forgetCreated(): void {
    this.git.runSync(["config", "--unset", CREATED_KEY]);
  }

  /** Give the clone the host's own remote and id (space-58, space-63):
   * the URL the host handed over, used as given (space-5), written only
   * over the remote the caller read before asking the host — `expected`
   * — so a remote set meanwhile is refused, never replaced. `created`
   * marks a repository the core just created (git-host-7). */
  async attachHost(url: string, id: string, expected: string | null, created = false): Promise<void> {
    const repo = await this.readRepository();
    this.requireGit(repo);
    if (!repo.root) throw new CoreError("invalid_request", initializeFirst());
    // The id the clone records, read in the step that writes the remote:
    // the host's id survives its renames and transfers (DR-103).
    const same = this.configNow("spex.repositoryId") === id;
    // A remote already at the host's URL is the one this attaches.
    if (!this.publishRemote(repo.remote === url ? url : expected, { url, id, ...(created ? { created: id } : {}) })) {
      throw new CoreError("conflict", changedMeanwhile(splitKey(this.key).name));
    }
    // The same repository keeps what the clone holds of it and this
    // device's last sync; another clears them (space-5).
    if (repo.remote !== url && !same) {
      await this.git.run(["update-ref", "-d", `refs/remotes/origin/${SPEX_BRANCH}`]);
      await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
      this.checkedAt = null;
      this.host.store.deletePref(lastSyncPref(this.key));
      this.remoteEmpty = false;
      this.unrelated = false;
    }
    this.hostOverride = undefined;
  }

  /** Record the host's id beside a clone matched by its remote URL
   * (git-host-5), only while that remote stands. */
  recordId(id: string, remote: string): void {
    if (this.facts.id === id && this.facts.remote === remote) return;
    this.publishRemote(remote, { id });
  }

  /** The URL the host hands over after a rename or a transfer
   * (space-60), used as given, written only over the remote read. */
  setOrigin(url: string, expected: string): void {
    if (!this.publishRemote(expected, { url })) {
      throw new SpaceStopped("check", { cause: "git", message: changedMeanwhile(splitKey(this.key).name), guidance: retryGuidance(), retry: true });
    }
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

  /** The repository's state, read from the clone at this instant,
   * recomputing the lists from the working tree when asked (space-33:
   * mine is the working tree outside a sync). An operation's own lists
   * — a sync's plan, the picker's conflicts — stand while it runs or
   * waits for choices. */
  async state(recompute: boolean): Promise<RepositoryState> {
    return this.readState(recompute && !this.current && this.phase.phase !== "choices");
  }

  private async readState(recompute: boolean): Promise<RepositoryState> {
    const repo = await this.readRepository();
    if (recompute && repo.root && repo.head !== null) await this.refreshLists(repo.head, repo.originSpex);
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
      code = typeof project?.remote === "string" ? this.owner.codeRemoteAsShown(project.remote) : null;
    } catch { code = null; }
    const remote = repo.root ? repo.remote : null;
    const state: RepositoryState = {
      key: this.key,
      name: splitKey(this.key).name,
      can: { manageMembers: false, transfer: false },
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
        agreed: repo.head ? await this.agreed(repo.head, repo.originSpex) : null,
      } : null,
      local: this.lists.local,
      incoming: this.lists.incoming,
      conflicts: this.lists.conflicts,
      lastSync,
      noticed: store.getPref<unknown>(noticedPref(this.key)) === true,
      sync: this.phase,
    };
    return state;
  }

  /** The last sync the clone holds, read from its own commits whatever
   * this core ran (space-61, DR-111): the commit `spex` last shared with
   * the host's `spex` as the clone last fetched or pushed it — `spex`
   * itself where the two are one — with its commit time; none where the
   * clone holds no host's `spex` or none sharing its history. A failed
   * read says none and is read again next time. */
  private async agreed(head: string, originSpex: string | null): Promise<Agreed | null> {
    if (originSpex === null) return null;
    const pair = `${head} ${originSpex}`;
    if (this.agreedRead?.pair === pair) return this.agreedRead.agreed;
    let shared: string | null = head;
    if (head !== originSpex) {
      const base = await this.git.run(["merge-base", head, originSpex]);
      // Exit 1 is no common ancestor: unrelated histories hold no sync.
      if (base.code === 1) shared = null;
      else if (base.code === 0) shared = base.stdout.toString("utf8").trim();
      else return null;
    }
    let agreed: Agreed | null = null;
    if (shared !== null) {
      const time = await this.git.run(["log", "-1", "--no-show-signature", "--format=%ct", shared]);
      const seconds = time.code === 0 ? Number.parseInt(time.stdout.toString("utf8").trim(), 10) : Number.NaN;
      if (!Number.isFinite(seconds)) return null;
      agreed = { at: seconds * 1000, current: head === originSpex };
    }
    this.agreedRead = { pair, agreed };
    return agreed;
  }

  /** The working tree's lists against the last check, kept as this
   * clone's lists and plan (space-33); a failure keeps the last ones. */
  private async refreshLists(head: string, originSpex: string | null): Promise<void> {
    try {
      const computed = await this.computeWorkingLists(head, originSpex);
      this.lastPlan = computed.plan;
      this.lists = computed.lists;
      if (computed.unrelated !== undefined) this.unrelated = computed.unrelated;
    } catch (error) { console.error(`spex: space listing failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /** Announce this clone's step; with `lists`, its lists recomputed from
   * the working tree first (space-29). */
  private async broadcast(lists: boolean): Promise<void> {
    if (lists) {
      const repo = await this.readRepository();
      if (repo.root && repo.head !== null) await this.refreshLists(repo.head, repo.originSpex);
    }
    await this.owner.publish();
  }

  /** What a removal of this clone would lose (projects-9): its record
   * units the host has not received, counted without touching the
   * clone's own lists. */
  async pendingUnits(): Promise<number> {
    const repo = await this.readRepository();
    if (!repo.root || repo.head === null) return 0;
    if (repo.remote === null) {
      const mine = await this.workingTree();
      const units = planStorageUnits({ ours: readStorageTree(this.dir, mine), theirs: new Map(), base: new Map() });
      return units.filter((unit) => RECORD_KINDS.has(spaceUnitKind(unit.name))).length;
    }
    const { lists } = await this.computeWorkingLists(repo.head, repo.originSpex);
    return [...lists.local, ...lists.conflicts.map((conflict) => conflict.unit)].filter((unit) => RECORD_KINDS.has(unit.kind)).length;
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

  private async computeWorkingLists(head: string, originSpex: string | null): Promise<{ plan: LastPlan; lists: Lists; unrelated?: boolean }> {
    const mine = await this.workingTree();
    let theirs = head;
    let base = head;
    let unrelated: boolean | undefined;
    if (this.checkedAt !== null) {
      if (this.remoteEmpty) { theirs = EMPTY_TREE; base = EMPTY_TREE; }
      else if (originSpex) {
        const merged = await this.git.run(["merge-base", "HEAD", `refs/remotes/origin/${SPEX_BRANCH}`]);
        if (merged.code === 0) { theirs = originSpex; base = merged.stdout.toString("utf8").trim(); unrelated = false; }
        else unrelated = true;
      }
    }
    const trees: StorageTrees = { ours: readStorageTree(this.dir, mine), theirs: readStorageTree(this.dir, theirs), base: readStorageTree(this.dir, base) };
    const units = planStorageUnits(trees);
    const lists = await this.describe(units, trees, { ours: null, theirs, base });
    return { plan: { ours: null, oursTree: mine, theirs, base, units }, lists, ...(unrelated !== undefined ? { unrelated } : {}) };
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
    const repo = await this.readRepository();
    this.requireGit(repo);
    if (!repo.root) throw new CoreError("invalid_request", initializeFirst());
    if (url !== null) {
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
    }
    if (url !== repo.remote) {
      // Written over the remote read above, or refused (DR-111); a remote
      // the reader names is no repository the host listed, while one
      // taken away leaves the clone the repository it records.
      if (!this.publishRemote(repo.remote, url === null ? { url } : { url, id: null })) {
        throw new CoreError("conflict", changedMeanwhile(splitKey(this.key).name));
      }
      // Another repository's remote clears what the clone holds of the
      // old one and the last sync (space-5): what the old remote held says
      // nothing about the new one. Every change clears the last check.
      if (url !== null) {
        await this.git.run(["update-ref", "-d", `refs/remotes/origin/${SPEX_BRANCH}`]);
        await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
        this.host.store.deletePref(lastSyncPref(this.key));
      }
      this.checkedAt = null;
      this.remoteEmpty = false;
      this.unrelated = false;
      this.hostOverride = undefined;
      // A running operation's progress is its own to end.
      if (!this.current) this.phase = { phase: "idle" };
    }
    await this.state(true);
  }

  // -- operations (space-31) -------------------------------------------------

  /** Run one operation on this clone (space-31), after `after` — a
   * check a sync follows — has settled. Its progress is its own: it
   * ends it, and clears only itself as the running operation. */
  private runOperation(op: SpaceOp, body: () => Promise<void>, after?: Promise<void>): Promise<void> {
    const entry: { op: SpaceOp; work: Promise<void> } = { op, work: Promise.resolve() };
    entry.work = (async () => {
      await after?.catch(() => undefined);
      this.ended = undefined;
      try { await body(); }
      catch (error) {
        this.ended = undefined;
        const step = this.phase.phase === "running" ? this.phase.step : "save";
        // No line a report carries names a URL under the host's Git
        // origin (space-15, space-32).
        const failure: GitFailure = error instanceof SpaceStopped
          ? error.failure
          : { cause: "git", message: lastLines(error instanceof Error ? error.message : String(error)), guidance: retryGuidance(), retry: true };
        this.phase = {
          phase: "stopped",
          op,
          step: error instanceof SpaceStopped ? error.step : step,
          ...this.owner.withoutHostUrls(failure, this.facts, this.key),
        };
      } finally {
        // An ending is shown with the lists it leaves: a row read between
        // never pairs the new phase with the former lists (space-29).
        const ended = this.takeEnded();
        try {
          if (ended && ended.phase !== "choices") {
            const repo = await this.readRepository();
            if (repo.root && repo.head !== null) await this.refreshLists(repo.head, repo.originSpex);
          }
        } catch (error) { console.error(`spex: space listing failed: ${error instanceof Error ? error.message : String(error)}`); }
        if (ended) this.phase = ended;
        if (this.current === entry) this.current = undefined;
        try { await this.broadcast(!ended && this.phase.phase !== "choices"); }
        catch (error) { console.error(`spex: space state failed: ${error instanceof Error ? error.message : String(error)}`); }
      }
    })();
    this.current = entry;
    return entry.work;
  }

  /** Enter a step. Check enters with no Stop: its host read comes
   * first, and Stop is offered once its Git child runs (space-16). */
  private async enter(op: SpaceOp, step: SyncStep, cancelable: boolean): Promise<void> {
    this.phase = { phase: "running", op, step, since: Date.now(), cancelable };
    await this.broadcast(false);
    await this.host.beforeStep?.({ op, step, repository: this.key });
  }

  /** Check the host (space-8). A Check asked while a sync or another
   * check runs joins it: that operation checks the host itself. */
  async fetch(): Promise<{ accepted: true }> {
    if (this.current) return { accepted: true };
    const repo = await this.requireReady();
    await this.owner.admit(this, { push: false, noticed: true });
    if (this.current) return { accepted: true };
    void this.runOperation("check", async () => {
      await this.enter("check", "check", false);
      await this.check(repo.remote, "check");
      this.ended = { phase: "idle" };
    });
    return { accepted: true };
  }

  /** `internal` marks a sync the core starts itself — after a sign-in, a
   * pick or a creation (space-4, space-58) — whose act already said what
   * a join does (space-13). `setUp` marks the account's set-up joining
   * your own group's spex repository, which takes the host's side where
   * the clone holds nothing of its own (space-59). A Sync asked while a
   * sync runs joins it; one asked while a check runs follows that check.
   * Nothing beneath the clone is refused meanwhile (space-21). */
  async sync(input: { choices?: Record<string, SpaceChoice>; join?: boolean; noticed?: boolean; internal?: boolean; setUp?: boolean }): Promise<{ accepted: true }> {
    if (this.current?.op === "sync") return { accepted: true };
    const choices: Record<string, StorageChoice> = {};
    const repo = await this.requireReady();
    // The operation repairs its marker again first (space-67), so the
    // finding an earlier repair left never refuses this admission.
    const blocking = this.blocking(false);
    if (blocking) throw new CoreError("invalid_request", `${blocking.file}: ${blocking.reason}`);
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
    // A sync begun while this one was admitted is the one it joins.
    if (this.runningOp() === "sync") return { accepted: true };
    void this.runOperation("sync", async () => {
      // The marker is repaired inside the operation, so a second
      // admission joins this repair rather than running its own; the
      // blocking issues are read once it has ended (space-67).
      await this.repairIfMarked();
      const found = this.blocking(true);
      if (found) {
        throw new SpaceStopped("save", {
          cause: "validation",
          message: `${found.file}: ${found.reason}`,
          guidance: i18n._({
            id: "Nothing was saved. Fix or remove the file, then sync again.",
            comment: "Guidance where a file under the home failed validation before the save",
          }),
          retry: false,
        });
      }
      await this.syncBody(repo, choices, input.join === true, input.join === true && input.setUp === true);
    }, this.current?.work);
    return { accepted: true };
  }

  /** The first blocking diagnostic refusing this clone's sync (space-11):
   * one of a file inside this clone or of a home file outside
   * `workspace/`, never another clone's. A refresh's finding is what the
   * files said when it last re-read them; it stays under issues but
   * admits the sync, whose Save validates the exact staged files. While
   * the repair marker stands, admission sets aside every diagnostic of a
   * file inside this clone — the repair's own finding and what a half
   * applied selection reads as among them — which `repaired` reads again
   * once this operation's repair has run (space-67). */
  private blocking(repaired: boolean): StorageDiagnostic | undefined {
    const deferred = !repaired && existsSync(this.markerPath());
    const own = deferred ? [] : this.diagnostics().filter((d) => d !== this.refreshProblem && (repaired || !d.file.endsWith(`/${APPLY_MARKER}`)));
    const home = resolve(this.host.home);
    const workspace = this.host.store.home.workspace;
    const within = (dir: string, file: string): boolean => { const rel = relative(dir, file); return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
    const mine = (file: string): boolean => {
      const path = resolve(home, file);
      return within(this.dir, path) ? !deferred : !within(workspace, path);
    };
    return [...this.owner.storageDiagnostics().filter((d) => mine(d.file)), ...own].find((d) => d.blocking);
  }

  /** Stop (space-16): end the step's Git child, or its calls' wait for
   * the host's rate limit (git-host-21). */
  cancel(): boolean {
    return this.git.cancel() || this.stopWaits();
  }

  /** Cancel a transport or a wait and wait for the operation to settle
   * (shutdown). */
  async stop(): Promise<void> {
    this.git.cancel();
    this.stopWaits();
    try { await this.current?.work; } catch { /* reported as state */ }
  }

  // -- the steps (space-12, space-15) ----------------------------------------

  private async syncBody(repo: ReadyRepository, choices: Record<string, StorageChoice>, join: boolean, setUp: boolean): Promise<void> {
    const op: SpaceOp = "sync";
    let restarts = 0;
    let rechecks = 0;
    let savedCommit: string | null = null;
    // Every commit this operation's Saves made: a set-up join counts them
    // as its own, never as the clone's (space-59).
    const saves = new Set<string>();
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
          const saved = await this.save();
          if (saved !== null) saves.add(saved);
          savedCommit = saved ?? savedCommit;
          next = "check";
          break;
        }
        case "check": {
          await this.enter(op, "check", false);
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
          const result = await this.compare(choices, join, setUp ? saves : undefined);
          if (result.outcome === "unrelated") { this.ended = { phase: "unrelated" }; return; }
          if (result.outcome === "choices") { this.ended = { phase: "choices", savedCommit }; return; }
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
            this.ended = { phase: "done", at, sent: 0, received: counts.received, pushed: false };
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
          this.ended = { phase: "done", at, sent: counts.sent, received: counts.received, pushed: pushed === "ok" };
          next = "done";
          break;
        }
      }
    }
  }

  /** Step 1 — Save: refresh the rules, stage, refuse a leak, validate,
   * commit when anything is staged (space-12). */
  private async save(): Promise<string | null> {
    const stop = (message: string, guidance: string): SpaceStopped => new SpaceStopped("save", { cause: "validation", message, guidance, retry: false });
    // The HEAD this Save stages against, read before anything is staged:
    // the commit's parent and the version its ref update names.
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    // The clone's address is read at each write, as Apply's is (DR-111):
    // a clone moved meanwhile is written where it lies, and one removed
    // meanwhile refuses with nothing made where it stood, as any failing
    // system call does, through the retryable stop.
    try { prepareStorageGitFiles(this.dir, this.host.store.untrackedSessionPaths(this.key)); }
    catch (error) { if (systemFailure(error)) throw error; throw stop(error instanceof StorageFormatError ? `${error.file}: ${error.reason}` : error instanceof Error ? error.message : String(error), i18n._({
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
    // What is validated is the staged tree itself, and that tree is what
    // the commit records, on the HEAD it was staged against: a file written
    // beside the Save stays a local change, and a HEAD moved meanwhile
    // refuses the commit as Git's conditional ref write does.
    const tree = await this.git.ok(["write-tree"]);
    // The staged files validated whole supersede a refresh's earlier finding.
    try { await validateStorageSnapshot(this.dir, tree, this.validation()); this.refreshProblem = undefined; }
    catch (error) {
      await this.git.run(["reset", "-q"]);
      if (systemFailure(error)) throw error;
      throw stop(error instanceof StorageFormatError ? `${error.file}: ${error.reason}` : error instanceof Error ? error.message : String(error), i18n._({
        id: "Nothing was saved. Fix or remove the file, then sync again.",
        comment: "Guidance where a file under the home failed validation before the save",
      }));
    }
    await this.host.beforeStep?.({ op: "sync", step: "save", repository: this.key, at: "commit" });
    if (tree === await this.git.ok(["rev-parse", `${head}^{tree}`])) return null;
    const units = [...new Set(staged.map(storageUnitName))].sort();
    const commit = await this.git.run([...(await this.git.committerArgs()), "commit-tree", tree, "-p", head, "-m", `Sync from ${hostname()}\n\n${units.join("\n")}`]);
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
    const saved = commit.stdout.toString("utf8").trim();
    const moved = await this.git.run(["update-ref", `refs/heads/${SPEX_BRANCH}`, saved, head]);
    if (moved.code !== 0) throw new SpaceStopped("save", { cause: "git", message: lastLines(moved.stderr), guidance: retryGuidance(), retry: true });
    return saved;
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
    const credential = host ? await this.owner.credentialFor(target, "check", this) : null;
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
    const failure = this.owner.withoutHostUrls(classifyHostTransportFailure(run, this.owner.hostName()), { remote, id: this.facts.id }, this.key);
    if (failure.cause === "refused") this.hostOverride = { state: "read-only", reason: failure.message };
    if (failure.cause === "gone") this.hostOverride = { state: "unreachable", reason: failure.message };
    return failure;
  }

  /** Give the host's empty repository the default branch it never
   * committed (git-host-7): `main`, one commit of the README the host
   * would have written, made in the object store alone — the clone's
   * working tree, index and refs untouched — with the clone's commit
   * identity, and pushed with the brokered credential. A refusal stops
   * the Check step as any transport's does (space-15). */
  async pushDefaultBranch(remote: string, name: string): Promise<void> {
    const blob = await this.git.ok(["hash-object", "-w", "--stdin"], { input: `# ${name}\n` });
    const tree = await this.git.ok(["mktree"], { input: `100644 blob ${blob}\tREADME.md\n` });
    const commit = await this.git.ok([...(await this.git.committerArgs()), "commit-tree", tree, "-m", "Initial commit"]);
    const credential = await this.owner.credentialFor(remote, "check", this);
    let run: GitRun;
    try {
      run = await this.git.run(["push", "-q", "origin", `${commit}:refs/heads/main`], { transport: true, ...(credential ? { credential } : {}) });
    } finally {
      await credential?.dispose();
    }
    if (run.code !== 0) throw new SpaceStopped("check", this.classify(run, remote, true));
  }

  /** Step 3 — Compare: the plan of HEAD against the host's `spex` over
   * their ancestor, or the empty tree for a join (space-13, space-14).
   * A set-up join, given its own Saves, takes the host's side of every
   * unit both sides hold where the clone holds nothing of its own — the
   * selection "All host's" sends (space-17, space-59). */
  private async compare(choices: Record<string, StorageChoice>, join: boolean, setUpSaves?: ReadonlySet<string>): Promise<CompareResult> {
    const originRef = `refs/remotes/origin/${SPEX_BRANCH}`;
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const origin = await this.git.ok(["rev-parse", originRef]);
    const merged = await this.git.run(["merge-base", "HEAD", originRef]);
    this.unrelated = merged.code !== 0;
    if (this.unrelated && !join) return { outcome: "unrelated" };
    const base = this.unrelated ? EMPTY_TREE : merged.stdout.toString("utf8").trim();
    // The trees are read where the clone lies now (DR-111).
    const trees: StorageTrees = { ours: readStorageTree(this.dir, head), theirs: readStorageTree(this.dir, origin), base: readStorageTree(this.dir, base) };
    const units = planStorageUnits(trees);
    this.lastPlan = { ours: head, oursTree: head, theirs: origin, base, units };
    this.lists = await this.describe(units, trees, { ours: head, theirs: origin, base });
    const local = units.filter((u) => u.choice === "ours" && u.changed.ours && !u.changed.theirs);
    const incoming = units.filter((u) => u.choice === "theirs");
    const conflicts = units.filter((u) => u.choice === "conflict");
    if (await this.git.succeeds(["merge-base", "--is-ancestor", originRef, "HEAD"])) {
      return { outcome: "nothing", counts: { sent: local.length, received: 0 } };
    }
    if (setUpSaves && conflicts.length > 0 && Object.keys(choices).length === 0 && await this.holdsNothingOfItsOwn(trees.ours, setUpSaves)) {
      choices = Object.fromEntries(conflicts.map((c) => [c.name, "theirs" as const]));
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

  /** Whether this clone holds nothing of its own (space-59): no session,
   * intent or authoring session among its files or in the tree its Save
   * recorded, and no commit but the set-up's (storage-6) and `saves`,
   * the Saves of the operation asking. */
  private async holdsNothingOfItsOwn(saved: StorageTree, saves: ReadonlySet<string>): Promise<boolean> {
    const records = /^(?:sessions|intents|authoring)\//;
    if ([...saved.keys()].some((path) => records.test(path))) return false;
    for (const folder of ["sessions", "intents", "authoring"]) {
      let entries: string[];
      try { entries = readdirSync(join(this.dir, folder)); }
      catch (error) {
        // A folder that does not read may hold anything: the join asks.
        if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
        return false;
      }
      if (entries.length > 0) return false;
    }
    // A clone the core set up holds one set-up commit beneath the Saves:
    // one more than those read means a commit of its own.
    const limit = saves.size + 1;
    const log = (await this.git.ok(["log", "--no-show-signature", "-n", String(limit + 1), "--format=%H %s", "HEAD"])).split("\n").filter(Boolean);
    if (log.length > limit) return false;
    return log.every((line) => {
      const [commit] = line.split(" ", 1);
      return saves.has(commit) || line.slice(commit.length + 1).startsWith(SET_UP_SUBJECT);
    });
  }

  private markerPath(): string { return join(this.dir, APPLY_MARKER); }

  /** A unit's write refused because its session's lease is held, or its
   * authoring session's turn runs (space-15). */
  private leaseStop(unit: string): SpaceStopped {
    return inUseStop("apply", unit, this.host.store);
  }

  /** The Apply's and the repair's write options: the clone's session
   * store, whose lease each session's write takes, and the check an
   * authoring unit's write meets at its instant (space-19). */
  private writeOptions(): { sessions: SpexRepository["store"]; prefsFile: string; validate: { own: boolean; libraryDir: string }; beforeAuthoringWrite: (unit: string) => void } {
    return {
      sessions: this.repository.store,
      prefsFile: prefsFileOf(this.host.home),
      validate: this.validation(),
      beforeAuthoringWrite: (unit) => this.host.assertAuthoringWritable?.(this.key, unit.slice("authoring/".length)),
    };
  }

  /** Step 4 — Apply: the validated selection written unit by unit under
   * the version Save committed, then one merge commit of the candidate's
   * tree or a fast-forward, never a Git merge (space-19). A refused write
   * records no merge commit. */
  private async apply(pending: Pending): Promise<"restart" | void> {
    const marker = this.markerPath();
    let result: Awaited<ReturnType<typeof applyStorageSelection>>;
    try {
      result = await applyStorageSelection(
        this.dir,
        { ours: pending.head, theirs: pending.origin, base: pending.base, unrelated: pending.base === EMPTY_TREE, units: pending.units },
        Object.fromEntries(pending.resolved),
        {
          ...this.writeOptions(),
          beforeWrite: () => {
            const record: ApplyMarker = { v: 1, ours: pending.head, theirs: pending.origin, base: pending.base, choices: Object.fromEntries(pending.resolved), at: Date.now() };
            writeApplicationFile(marker, record);
          },
        },
      );
    } catch (error) {
      // A held lease interrupts the apply: the marker stays, and the next
      // admission's repair finishes the recorded selection once it is free,
      // so units that name one another never stand half applied. A changed
      // unit makes the selection obsolete: what was written is an ordinary
      // local change, and the sync replans from Save. A moved clone keeps
      // its marker where it now lies.
      if (error instanceof StorageWriteRefused && error.reason === "lease") throw this.leaseStop(error.unit);
      if (error instanceof StorageWriteRefused && error.reason === "changed") {
        rmSync(marker, { force: true });
        if (error.written.length > 0) await this.reindex(error.written.includes("config/playbook.config.yaml"));
        return "restart";
      }
      if (error instanceof StorageFormatError) {
        rmSync(marker, { force: true });
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
    const headAfter = await this.commitSelection(pending.head, pending.origin, result.tree, pending.resolved);
    rmSync(marker, { force: true });
    this.applied = { headBefore: pending.head, headAfter };
  }

  /** The merge commit of the validated candidate's tree, or `spex`
   * moved to the host's commit where that tree equals its tree (space-19). */
  private async commitSelection(head: string, origin: string, tree: string, resolved: Map<string, StorageChoice>): Promise<string> {
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
    await this.reindex(!(await this.git.succeeds(["diff", "--quiet", applied.headBefore, applied.headAfter, "--", "config/playbook.config.yaml"])));
    this.unrelated = false;
    this.applied = undefined;
    // The lists are recomputed at Refresh (space-29): the working tree
    // now holds the selected state.
    await this.broadcast(true);
  }

  /** Re-validate and re-index what an Apply wrote, merged or not
   * (space-20). */
  private async reindex(configChanged: boolean): Promise<void> {
    this.refreshProblem = undefined;
    try { await validateStorageTree(this.dir, this.validation()); }
    catch (error) {
      this.refreshProblem = error instanceof StorageFormatError
        ? { file: error.file, reason: error.reason, blocking: true }
        : { file: this.dir, reason: error instanceof Error ? error.message : String(error), blocking: true };
    }
    this.host.store.reload();
    if (configChanged) await this.host.reloadConfig();
    await this.host.rescanSessions(this.key);
    this.host.ledgerChanged([this.key]);
  }

  /** Step 6 — Push `spex` to the host, setting the upstream once (space-12). */
  private async push(remote: string, upstream: boolean, atHost: boolean): Promise<"ok" | "nothing" | "rejected"> {
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const origin = await this.git.run(["rev-parse", "-q", "--verify", `refs/remotes/origin/${SPEX_BRANCH}^{commit}`]);
    if (upstream && origin.code === 0 && origin.stdout.toString("utf8").trim() === head) return "nothing";
    const credential = atHost ? await this.owner.credentialFor(remote, "push", this) : null;
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

  // -- repair (space-67) -----------------------------------------------------

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

  /** A sync operation's first work (space-67): the marker read and its
   * selection finished, the operation running already, so a second
   * admission joins it. A failure stands as a blocking issue and stops
   * the sync, naming a held session where its lease refused the write. */
  private async repairIfMarked(): Promise<void> {
    if (!existsSync(this.markerPath())) { this.repairFailure = undefined; return; }
    // The repair finishes an Apply, and reads as that step.
    this.phase = { phase: "running", op: "sync", step: "apply", since: Date.now(), cancelable: false };
    await this.broadcast(false);
    let written: string[];
    try { written = await this.repair(); }
    catch (error) { throw this.repairFailed(error); }
    this.repairFailure = undefined;
    try { await this.reindex(written.includes("config/playbook.config.yaml")); }
    catch (error) { throw this.repairFailed(error); }
  }

  private repairFailed(error: unknown): SpaceStopped {
    this.repairFailure = error instanceof Error ? error.message : String(error);
    if (error instanceof StorageWriteRefused && error.reason === "lease") return this.leaseStop(error.unit);
    return new SpaceStopped("apply", { cause: "git", message: `${APPLY_MARKER}: ${repairFailureReason(this.repairFailure)}`, guidance: retryGuidance(), retry: true });
  }

  /** Finish an interrupted apply from its marker; the units written. */
  private async repair(): Promise<string[]> {
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
      // onto the host's commit — or `spex` moved on without it, a commit
      // from a terminal making the selection obsolete. Either way nothing
      // is re-applied: what was written is an ordinary local change, and
      // the sync saves and replans.
      rmSync(this.markerPath(), { force: true });
      return [];
    }
    // Read and written where the clone lies now, as Save and Apply are (DR-111).
    const trees: StorageTrees = { ours: readStorageTree(this.dir, marker.ours), theirs: readStorageTree(this.dir, marker.theirs), base: readStorageTree(this.dir, marker.base) };
    const units = planStorageUnits(trees);
    const choices = marker.choices as Record<string, StorageChoice>;
    // Each unit is finished as Apply writes it, a file already holding
    // its selection accepted. One changed since by another hand makes the
    // selection obsolete: it is left as it stands, the marker goes with no
    // merge commit, and the next sync replans from Save. A held lease
    // leaves the marker for a later repair.
    let applied: Awaited<ReturnType<typeof applyStorageSelection>>;
    try {
      applied = await applyStorageSelection(this.dir, { ours: marker.ours, theirs: marker.theirs, base: marker.base, unrelated: marker.base === EMPTY_TREE, units }, choices, this.writeOptions());
    } catch (error) {
      if (error instanceof StorageWriteRefused && error.reason === "changed") { rmSync(this.markerPath(), { force: true }); return error.written; }
      throw error;
    }
    await this.commitSelection(marker.ours, marker.theirs, applied.tree, resolveStorageChoices(units, choices));
    rmSync(this.markerPath(), { force: true });
    return applied.written;
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
  /** The count of reads begun when this core last changed what the host
   * lists — a clone attached to a repository there (git-host-5), or a
   * group created (git-host-15): a read numbered no higher began before,
   * and is made again before it is held. */
  private changedAfter = 0;
  /** The repositories clones were attached to since the view's read
   * began, as the host answered them, by id: listed until the next read
   * is held (git-host-5). */
  private readonly attached = new Map<string, HostListing>();
  /** The groups this core created since the view's read began, as the
   * host answered them, by full path: listed, like `attached`, until the
   * next read is held (git-host-5, git-host-15). */
  private readonly created = new Map<string, HostGroup>();
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
  /** The progress of joins in flight or stopped, by the host's id
   * (space-63): each join's own entry, which only it replaces or
   * removes; no join is refused because another runs. */
  private readonly joining = new Map<string, SpaceSyncPhase>();
  /** Set once the core stops: nothing is read or announced after. */
  private stopping = false;
  /** This machine's identity for reading session leases, once read. */
  private leaseIdentity?: Promise<string | undefined>;

  constructor(private readonly host: SpaceHost) {
    this.probe = new SpaceGit(host.home, host.env, host.transportTimeoutMs !== undefined ? { transportTimeoutMs: host.transportTimeoutMs } : {});
  }

  /** This machine's identity as Playbook's session store reads it for
   * the leases it writes — the same environment and home (storage-26);
   * undefined where it cannot be read, so every standing lease holds a
   * move. */
  private machineIdentity(): Promise<string | undefined> {
    // A failure is read again at the next move, as Playbook reads it again.
    this.leaseIdentity ??= resolveMachineIdentity({ env: process.env, homeDir: process.env.HOME ?? homedir() })
      .catch(() => { this.leaseIdentity = undefined; return undefined; });
    return this.leaseIdentity;
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

  /** A code remote under the reported Git origin stays inside the core
   * (space-1, DR-120); its transport URL and project file stay as given. */
  codeRemoteAsShown(remote: string): string {
    const kind = this.codeRemoteKind(remote);
    if (kind === "unknown") return i18n._({ id: "Code on a remote", comment: "Where a project's code lives before the instance has reported its Git origin; the actual remote is withheld until it can be classified" });
    return kind === "instance"
      ? i18n._({ id: "Code on this instance", comment: "Where a project's code lives when its remote is under the instance's reported Git origin; the Git system behind the instance is never named" })
      : displayRemote(remote);
  }

  /** Presentation only, against the origin already reported: no read
   * of the host and no inferred origin (space-1, projects-7, DR-120). */
  codeRemoteKind(remote: string): "unknown" | "instance" | "external" {
    const origin = this.knownOrigin();
    return origin ? (underOrigin(remote, origin) ? "instance" : "external") : "unknown";
  }

  // -- the instance's names (space-1, space-15, git-host-5, DR-120) ---------

  /** The listing a clone stands for in the current view, or among what
   * this core attached since its read began (git-host-5). */
  private listingOf(facts: CloneFacts): HostListing | undefined {
    return listingFor(this.view, facts.id, facts.remote) ?? listingFor({ listings: [...this.attached.values()] }, facts.id, facts.remote);
  }

  /** Whether a listed group is held as colliding in the current view
   * (git-host-5): its path is a login's, or lies beneath one. */
  private collides(group: Pick<HostGroup, "kind" | "fullPath"> | undefined, view: HostView | undefined = this.signedIn() ? this.view : undefined): boolean {
    if (!group || !view) return false;
    return collidingGroup(group, namedLogins(view, this.host.store.home.ownName));
  }

  /** The rule of space-15 for one clone: its own remote reads as its
   * path in the instance — as its listing names it, else its key — and
   * any other URL under the host's Git origin as the host's name. */
  private urlRule(facts: CloneFacts, key: string): Parameters<typeof withoutHostUrls>[1] {
    const listing = facts.remote === null ? undefined : this.listingOf(facts);
    const path = listing ? `${listing.repository.group.fullPath}/${listing.repository.path}` : key;
    return {
      origin: this.knownOrigin() ?? null,
      host: this.hostName(),
      instance: this.host.store.home.host.url,
      own: facts.remote === null ? null : { remote: facts.remote, path },
    };
  }

  /** A stopped step's lines with no URL under the host's Git origin
   * (space-15, space-32). */
  withoutHostUrls(failure: GitFailure, facts: CloneFacts, key: string): GitFailure {
    const rule = this.urlRule(facts, key);
    return { ...failure, message: withoutHostUrls(failure.message, rule), guidance: withoutHostUrls(failure.guidance, rule) };
  }

  /** A clone's remote as the state carries it (space-30): one at the
   * host as the repository's path in the instance, any other as the
   * reader set it, with no user in an http(s) URL. */
  private remoteAsShown(facts: CloneFacts, key: string): string | null {
    if (facts.remote === null) return null;
    if (!this.atHost(facts) && !underOrigin(facts.remote, this.host.store.home.host.url)) return displayRemote(facts.remote);
    return this.urlRule(facts, key).own?.path ?? key;
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
      this.releaseHeld();
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
    this.releaseHeld();
    void this.publish();
  }

  /** Sign out (git-host-10): revoke at the host, tried once, forget the
   * credential, keep every clone and record. The home is marked signed
   * out in the same turn as the removal; a pair stored in its place
   * meanwhile stays, and the account with it. */
  async signOut(): Promise<GroupsState> {
    this.flow?.cancel();
    try {
      await this.host.client.signOut(() => {
        this.host.store.signOut();
        this.hostSignedOut = undefined;
        this.view = undefined;
        this.releaseHeld();
        this.readFailure = undefined;
        this.waiting.clear();
        // A join still running keeps its progress; its transport holds its
        // own brokered credential or stops asking to sign in (space-15).
        for (const [id, phase] of [...this.joining]) if (phase.phase !== "running") this.joining.delete(id);
        for (const machine of this.machines.values()) machine.hostOverride = undefined;
      });
    } catch (error) {
      if (error instanceof CredentialChanged) throw new CoreError("conflict", relayHostError(error, this.hostName()));
      throw error;
    }
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
    if (renamed !== "conflict") await this.ensureOwnOnHost(view);
    await this.retryWaiting(view);
    await this.publish();
  }

  /** What this core attached or created since the view's read began
   * stops counting as listed: the view held now, or none, says
   * (git-host-5). */
  private releaseHeld(): void {
    this.attached.clear();
    this.created.clear();
  }

  /** The groups a view lists, with those this core created since its
   * read began, which count as listed until the next read is held
   * (git-host-5, git-host-15). */
  private listedGroups(view: Pick<HostView, "groups"> | undefined): HostGroup[] {
    const groups = view?.groups ?? [];
    const held = [...this.created.values()].filter((group) => !groups.some((entry) => entry.fullPath === group.fullPath || (group.id !== null && entry.id === group.id)));
    return [...groups, ...held];
  }

  /** Read the host (git-host-5): one read at a time, the answer held as
   * the current view, a failure keeping the previous view and its time.
   * A read begun before a clone was attached to a repository, or a
   * group was created, cannot list it: it is made again before it is
   * held. */
  readHost(): Promise<HostView> {
    if (this.reading) return this.reading;
    const work = (async (): Promise<HostView> => {
      try {
        let view: HostView;
        let begun: number;
        do {
          begun = (this.readsBegun += 1);
          view = await readHostView(this.host.client);
        } while (begun <= this.changedAfter);
        this.view = view;
        this.releaseHeld();
        this.described = { displayName: view.displayName, gitOrigin: view.gitOrigin };
        this.readFailure = undefined;
        // A clone matched by its remote records the host's id (git-host-5).
        for (const repository of this.host.store.listRepositories()) {
          if (!this.host.store.repository(repository.key)) continue;
          const machine = this.machine(repository.key);
          machine.hostOverride = undefined;
          const facts = await machine.readFacts().catch(() => ({ remote: null, id: null }));
          if (facts.id === null && facts.remote !== null) {
            const listing = listingFor(view, null, facts.remote);
            if (listing) { try { machine.recordId(listing.repository.id, facts.remote); } catch { /* recorded at the next read */ } }
          }
        }
        return view;
      } catch (error) {
        // A refusal signed out where its pair was removed (git-host-4);
        // here, only a home whose app token is gone is, checked now.
        if (error instanceof HostError && error.code === "signed_out" && this.signedIn() && this.host.client.holdsNone()) this.signedOutByHost();
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
   * account's login (space-59): one synchronous step at its instant —
   * the clones beneath read now, each moved by one rename, every pair
   * naming one rewritten. A destination already taken is a conflict:
   * nothing moves, and the next set-up asks again. Writers beneath the
   * clones resolve their paths at their own instants. */
  private async renameOwn(account: Pick<HostAccount, "login">): Promise<"none" | "done" | "conflict"> {
    const store = this.host.store;
    const target = ownNameFor(account.login);
    if (!target || target === store.home.ownName) return "none";
    const identity = await this.machineIdentity();
    // Nothing is awaited from here to the last rename.
    const current = store.home.ownName;
    if (target === current) return "none";
    const ownFrom = `${current}/${current}-spex`;
    const ownTo = `${target}/${target}-spex`;
    // Your own group's clone moves last, so the home names its folder
    // only once every other clone beneath stands under the new name.
    const keys = store.listRepositories().map((repository) => repository.key)
      .filter((key) => key.startsWith(`${current}/`))
      .sort((a, b) => Number(a === ownFrom) - Number(b === ownFrom));
    const moves = keys.map((key) => ({ from: key, to: key === ownFrom ? ownTo : `${target}/${key.slice(current.length + 1)}` }));
    if (moves.some((move) => occupied(store.home.clonePath(move.from), store.home.clonePath(move.to), store.home.workspace))) return "conflict";
    // A session's lease beneath any clone holds every clone where it is:
    // its writer resolved that path, and a rename under it would strand
    // the writer's lease and its records (space-59).
    try {
      const held = moves.find((move) => heldSessionLease(store.home.clonePath(move.from), identity) !== undefined);
      if (held) return "conflict";
    } catch (error) {
      console.error(`spex: your own group's folder did not move: ${error instanceof Error ? error.message : String(error)}`);
      return "conflict";
    }
    const done: { from: string; to: string }[] = [];
    try {
      for (const move of moves) {
        const to = store.home.clonePath(move.to);
        mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
        renameSync(store.home.clonePath(move.from), to);
        done.push(move);
      }
    } catch (error) {
      console.error(`spex: your own group's folder did not move: ${error instanceof Error ? error.message : String(error)}`);
    }
    pruneEmptyFolders(join(store.home.workspace, current), store.home.workspace);
    const complete = done.length === moves.length;
    this.relocate(done, complete ? target : undefined);
    await this.afterMove(done);
    return complete ? "done" : "conflict";
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
    // Your own group is named to the host by none, never by its id,
    // which names no group of the instance there (git-host-6).
    const group = { id: null, fullPath: userGroup(view)?.fullPath ?? store.home.ownName };
    const name = splitKey(key).name;
    // Only your own namespace holds it: a group of the instance named
    // like your login never does (space-4, git-host-5).
    const listed = view.listings.find((listing) => listing.repository.group.kind === "user"
      && sameLogin(listing.repository.group.fullPath, group.fullPath) && listing.repository.path === name);
    if (listed) {
      await this.adopt(machine, listed, true, { setUp: true });
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
      const listed = view.listings.find((listing) => listing.repository.group.kind === "group" && !this.collides(listing.repository.group, view)
        && listing.repository.group.fullPath === group && listing.repository.path === name);
      if (listed) {
        await this.adopt(machine, listed, true);
        return "joined";
      }
      const hostGroup = this.listedGroups(view).find((entry) => entry.kind === "group" && entry.fullPath === group);
      if (!hostGroup || this.collides(hostGroup, view)) return "local";
      return await this.create(machine, { id: hostGroup.id, fullPath: hostGroup.fullPath }, name, repositoryDescription({ kind: "group", group }), "quiet");
    } catch (error) {
      console.error(`spex: ${key} stays on this device: ${error instanceof Error ? error.message : String(error)}`);
      return "local";
    }
  }

  // -- picks, creations and joins (space-58, space-63, space-64) --------------

  /** Give a clone the host's repository and sync it — a join of two
   * histories where `join` (space-13), a first push otherwise. From the
   * first write of its remote, the repository counts as listed as the
   * host answered it until a read begun after this is held (git-host-5),
   * so its row goes straight to its sync. The remote is written only
   * over `expected`, the one the caller read before asking the host.
   * `setUp` marks the account's set-up joining your own group's spex
   * repository (space-4, space-59), and `created` a repository the core
   * just created, which the clone records with its remote (git-host-7). */
  private async adopt(machine: RepositorySync, listing: HostListing, join: boolean, options: { expected?: string | null; setUp?: boolean; created?: boolean } = {}): Promise<void> {
    const { repository } = listing;
    const { expected = null, setUp = false, created = false } = options;
    this.changedAfter = this.readsBegun;
    this.attached.set(repository.id, listing);
    try { await machine.attachHost(repository.remoteUrl, repository.id, expected, created); }
    catch (error) {
      this.attached.delete(repository.id);
      throw error;
    }
    this.waiting.delete(machine.key);
    await this.publish();
    this.startSync(machine.key, { join, ...(setUp ? { setUp } : {}) });
  }

  /** Ask the host to create `name` in a group for a clone (git-host-6). */
  private async create(
    machine: RepositorySync,
    group: { id: string | null; fullPath: string },
    name: string,
    description: string,
    mode: "refuse" | "quiet",
  ): Promise<"created" | "waiting" | "local"> {
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
      // creation is asked again at the next read (space-4, space-64),
      // under the key the clone bears now, wherever it moved meanwhile.
      this.waiting.set(machine.key, { step: "create", group: group.fullPath, message: relayHostError(error, this.hostName()), create: ask });
      await this.publish();
      return "waiting";
    }
    if (answer.status === "pending") {
      this.waiting.set(machine.key, { step: "create", group: group.fullPath, message: answer.message, create: ask });
      await this.publish();
      return "waiting";
    }
    // As the host answered: no `spex` branch yet, nor a members' count.
    await this.adopt(machine, { repository: answer.repository, readOnly: null, branchPresent: false, members: null }, false, { created: true });
    return "created";
  }

  /** Every step left waiting, asked again at a read (space-64): a
   * creation a member with the rights did is found and joined. An entry
   * stands until its step is done or no longer asked for — never lost to
   * an act that failed meanwhile. */
  private async retryWaiting(view: HostView): Promise<void> {
    for (const [key, waiting] of [...this.waiting]) {
      if (!this.host.store.repository(key)) { this.waiting.delete(key); continue; }
      const machine = this.machine(key);
      const facts = await machine.readFacts();
      if (waiting.step === "create" && waiting.create) {
        // A remote set meanwhile — a pick — ends the wait for a creation.
        if (facts.remote !== null) { if (this.waiting.get(machine.key) === waiting) this.waiting.delete(machine.key); continue; }
        const ask = waiting.create;
        // Your own namespace for your own; the group asked of otherwise.
        const found = view.listings.find((listing) => {
          const group = listing.repository.group;
          if (listing.repository.path !== ask.name) return false;
          if (ask.groupId === null) return group.kind === "user" && sameLogin(group.fullPath, waiting.group);
          return group.kind === "group" && (group.id === ask.groupId || (group.id === null && group.fullPath === waiting.group));
        });
        try {
          if (found) await this.adopt(machine, found, true, { setUp: machine.key === this.host.store.home.own() });
          else if (await this.create(machine, { id: ask.groupId, fullPath: waiting.group }, ask.name, ask.description, "quiet") === "created" && this.waiting.get(machine.key) === waiting) this.waiting.delete(machine.key);
        } catch (error) {
          console.error(`spex: ${machine.key} still waits: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
      const listing = listingFor(view, facts.id, facts.remote);
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

  private startSync(key: string, input: { join?: boolean; setUp?: boolean }): void {
    const machine = this.machines.get(key);
    if (!machine || this.stopping) return;
    machine.sync({ ...input, internal: true }).catch((error: unknown) => {
      console.error(`spex: ${key} did not start syncing: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  /** Pick a group for a local-only spex repository (space-58): join a
   * listed one, or create `<name>-spex` in a group. */
  async pick(key: string, choice: { kind: "join"; hostId: string } | { kind: "create"; groupId: string | null; name: string }, noticed = false): Promise<{ accepted: true }> {
    const machine = this.machine(key);
    {
      // The remote is written only where none stands at the write
      // (attachHost); a second pick meets the first's remote there, or
      // the host's own refusal of a taken name.
      const facts = await machine.readFacts();
      if (facts.remote !== null) {
        throw new CoreError("invalid_request", i18n._({ id: "{name} is on the host already", values: { name: splitKey(key).name }, comment: "Refusal of a pick: the spex repository is not local only" }));
      }
      if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
      const view = this.view ?? await this.readHost().catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.hostName())); });
      if (choice.kind === "join") {
        const listing = view.listings.find((entry) => entry.repository.id === choice.hostId);
        if (!listing) throw new CoreError("not_found", noLongerShared());
        // A group named like a login holds no folder of its own (space-61).
        if (this.collides(listing.repository.group, view)) throw new CoreError("invalid_request", groupNamedLikeYourLogin(listing.repository.group.fullPath));
        // Joining pushes this clone's records into a repository others
        // read: the notice is seen first (space-57).
        const store = this.host.store;
        if (noticed) store.setPref(noticedPref(key), true);
        else if (!listing.readOnly && mayHaveOthers(listing) && store.getPref<unknown>(noticedPref(key)) !== true) {
          throw new CoreError("invalid_request", i18n._({
            id: "Read the sharing notice before joining {name}",
            values: { name: listing.repository.path },
            comment: "Refusal of a pick joining a spex repository with other members until the reader has seen the privacy notice",
          }), { notice: true, members: listing.members, visibility: listing.repository.visibility });
        }
        await this.adopt(machine, listing, true);
        return { accepted: true };
      }
      const base = kebab(choice.name.trim().replace(/-spex$/i, ""));
      if (!base) {
        throw new CoreError("invalid_request", i18n._({ id: "The name must hold a letter or a digit", comment: "Refusal of a new spex repository's name with nothing of a name in it" }));
      }
      // Your own group by none; any id only among the groups of the
      // instance, your own group's id naming none of them (git-host-6).
      const group = choice.groupId === null
        ? { id: null, fullPath: userGroup(view)?.fullPath ?? this.host.store.home.ownName }
        : this.listedGroups(view).find((entry) => entry.kind === "group" && entry.id === choice.groupId);
      if (!group) throw new CoreError("not_found", i18n._({ id: "The host lists no such group", comment: "Refusal of a pick naming a group the Git host does not list" }));
      if ("kind" in group && this.collides(group, view)) {
        throw new CoreError("invalid_request", groupNamedLikeYourLogin(group.fullPath));
      }
      const project = this.projectFile(machine.repository);
      await this.create(machine, { id: group.id, fullPath: group.fullPath }, `${base}-spex`,
        repositoryDescription({ kind: "project", name: project?.name ?? base, code: project?.remote ?? null }), "refuse");
      return { accepted: true };
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
    // A group named like a login holds no folder of its own (space-61).
    if (this.collides(listing.repository.group, view)) throw new CoreError("invalid_request", groupNamedLikeYourLogin(listing.repository.group.fullPath));
    const key = hostKey(listing.repository);
    if (!key) {
      throw new CoreError("invalid_request", i18n._({ id: "{path} cannot stand as a folder on this device", values: { path: `${listing.repository.group.fullPath}/${listing.repository.path}` }, comment: "Refusal of a join: the host's names hold characters a folder under the home cannot" }));
    }
    const store = this.host.store;
    // Read from each clone now: its recorded id or its remote (git-host-5).
    const here = (await Promise.all(store.listRepositories().map(async (repository) => {
      try { return await this.machine(repository.key).readFacts(); } catch { return { remote: null, id: null }; }
    }))).some((facts) => facts.id === hostId || listingFor(view, facts.id, facts.remote)?.repository.id === hostId);
    if (here || store.repository(key) || existsSync(store.home.clonePath(key))) {
      throw new CoreError("invalid_request", i18n._({ id: "{name} is on this device already", values: { name: listing.repository.path }, comment: "Refusal of a join: the spex repository has a clone here" }));
    }
    const path = folder === undefined ? undefined : resolve(folder);
    if (path !== undefined && store.home.keyForFolder(path)) {
      throw new CoreError("invalid_request", i18n._({ id: "{path} is another project's working folder", values: { path }, comment: "Refusal of a join: the folder named is paired already" }));
    }
    const progress: SpaceSyncPhase = { phase: "running", op: "join", step: "check", since: Date.now(), cancelable: false };
    this.joining.set(hostId, progress);
    await this.publish();
    void this.runJoin(listing, key, path, progress);
    return { accepted: true };
  }

  /** One join (space-63): the spex repository cloned into a private
   * stage beside its place, then published there by a rename only where
   * nothing stands — another join's clone among them — and a failure
   * removes only its own stage. `progress` is this
   * join's own entry, replaced or removed only while it stands. */
  private async runJoin(listing: HostListing, key: string, folder: string | undefined, progress: SpaceSyncPhase): Promise<void> {
    const store = this.host.store;
    const id = listing.repository.id;
    const url = listing.repository.remoteUrl;
    const dest = store.home.clonePath(key);
    let mine = progress;
    const own = (next: SpaceSyncPhase | undefined): void => {
      if (this.joining.get(id) !== mine) return;
      if (next) { this.joining.set(id, next); mine = next; }
      else this.joining.delete(id);
    };
    // No line the report carries names a URL under the host's Git
    // origin (space-15).
    const stop = (failure: GitFailure): void => own({ phase: "stopped", op: "join", step: "check", ...this.withoutHostUrls(failure, { remote: listing.repository.remoteUrl, id }, key) });
    let stage: string | undefined;
    try {
      mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
      stage = mkdtempSync(join(dirname(dest), `.${basename(dest)}.join-`));
      const dir = join(stage, "clone");
      let credential: GitCredentialHandle | null;
      try { credential = await this.credentialFor(url, "check"); }
      catch (error) {
        if (error instanceof SpaceStopped) { stop(error.failure); return; }
        throw error;
      }
      // Sessions are private: the clone is written owner-only (space-32).
      // Each child inherits the owner-only umask as it is spawned — `run`
      // spawns synchronously — and the core's own is restored before
      // anything is awaited, so no other work runs under it.
      const privately = (args: string[], options: GitRunOptions = {}): Promise<GitRun> => {
        const umask = process.umask(0o077);
        try { return this.probe.run(args, options); }
        finally { process.umask(umask); }
      };
      let run: GitRun;
      try {
        const options = { transport: true, ...(credential ? { credential } : {}) };
        run = await privately(["clone", "-q", "--branch", SPEX_BRANCH, "--single-branch", url, dir], options);
        if (run.code !== 0 && /Remote branch \S+ not found|not found in upstream/i.test(run.stderr)) {
          // The host holds no `spex` yet: its default branch, then `spex`
          // beside it (space-32).
          rmSync(dir, { recursive: true, force: true });
          run = await privately(["clone", "-q", url, dir], options);
          if (run.code === 0) run = await privately(["-C", dir, "checkout", "-q", "-b", SPEX_BRANCH]);
        }
      } finally {
        await credential?.dispose();
      }
      if (run.code !== 0) {
        stop(credential ? classifyHostTransportFailure(run, this.hostName()) : classifyTransportFailure(run, url));
        return;
      }
      await this.probe.run(["-C", dir, "config", "spex.repositoryId", id]);
      // Publication: the place checked absent and the stage renamed there
      // in one synchronous step; a place taken meanwhile — another join's
      // clone — is left as it stands, and a failed rename leaves no folder.
      if (existsSync(dest)) {
        stop({ cause: "git", message: i18n._({ id: "{name} is on this device already", values: { name: listing.repository.path }, comment: "Refusal of a join: the spex repository has a clone here" }), guidance: nothingDeleted(), retry: false });
        return;
      }
      renameSync(dir, dest);
      store.adoptRepositories();
      this.host.repositoriesChanged();
      const machine = this.machine(key);
      await machine.readFacts();
      await this.host.rescanSessions(key);
      this.host.ledgerChanged([key]);
      if (folder !== undefined) {
        const next = await this.pairJoined(machine, folder, (phase) => own(phase));
        if (next) machine.report(next);
      }
      // The join ends once its code is here or its clone failed; only
      // then does its row read the clone's state (space-61, space-63).
      own(undefined);
    } catch (error) {
      stop({ cause: "git", message: lastLines(error instanceof Error ? error.message : String(error)), guidance: retryGuidance(), retry: true });
    } finally {
      if (stage) rmSync(stage, { recursive: true, force: true });
      await this.publish();
    }
  }

  /** The joined clone's working folder (space-63): the code cloned from
   * the remote its `project.json` names with this device's own Git,
   * brokered credentials at the reported Git origin and this device's
   * elsewhere, or a folder already holding it, paired with the clone;
   * a group's own spex repository pairs the folder its sessions run in.
   * The join's Code step runs while the code clones (space-63), shown
   * through `step`; a failure comes back as the row's stopped state. */
  private async pairJoined(machine: RepositorySync, folder: string, step: (phase: SpaceSyncPhase) => void): Promise<SpaceSyncPhase | undefined> {
    const project = this.projectFile(machine.repository);
    const root = existsSync(folder) && await this.workTreeRoot(folder);
    const remote = !root && project?.remote ? project.remote : undefined;
    const at: SyncStep = remote ? "code" : "check";
    step({ phase: "running", op: "join", step: at, since: Date.now(), cancelable: false });
    await this.publish();
    const stopped = (failure: GitFailure): SpaceSyncPhase => ({
      phase: "stopped", op: "join", step: at,
      ...this.withoutHostUrls(failure, { remote: null, id: null }, machine.key),
    });
    const chooseFolder = (): string => i18n._({ id: "The spex repository is here; choose a folder for its code to pair it.", comment: "Guidance after a join's code clone failed" });
    try {
      if (remote) {
        mkdirSync(dirname(folder), { recursive: true });
        const credential = await this.credentialFor(remote, at);
        let run: GitRun;
        try {
          run = await this.probe.run(["clone", "-q", remote, folder], { transport: true, ...(credential ? { credential } : {}) });
        } finally {
          await credential?.dispose();
        }
        if (run.code !== 0) {
          return stopped({
            ...(credential ? classifyHostTransportFailure(run, this.hostName()) : {
              cause: run.killed ?? "git",
              message: lastLines(run.stderr) || i18n._({ id: "Git could not clone the code", comment: "A join's stop where git failed to clone the code and printed nothing" }),
            }),
            guidance: chooseFolder(),
            retry: false,
          });
        }
      }
      mkdirSync(folder, { recursive: true });
      this.host.store.rebindProject({ id: machine.key, path: folder });
      this.host.repositoriesChanged();
      await this.host.rescanSessions(machine.key);
      this.host.ledgerChanged([machine.key]);
      return undefined;
    } catch (error) {
      if (error instanceof SpaceStopped) return stopped({ ...error.failure, guidance: chooseFolder(), retry: false });
      return stopped({ cause: "git", message: lastLines(error instanceof Error ? error.message : String(error)), guidance: retryGuidance(), retry: false });
    }
  }

  private async workTreeRoot(folder: string): Promise<boolean> {
    try {
      const run = await this.probe.run(["-C", folder, "rev-parse", "--show-toplevel"]);
      return run.code === 0 && realPath(run.stdout.toString("utf8").trim()) === realPath(folder);
    } catch { return false; }
  }

  // -- groups and sharing (git-host-8, git-host-15..17, DR-114) --------------
  //
  // The host is asked whatever the view said the person may do: its
  // refusal is the answer (DR-111). Only what the host cannot be asked —
  // a blank name or login, a role or a place the view does not list — is
  // refused before it is.

  /** The members of a spex repository by its key, or of a group by its
   * host id, as the host reports them (space-62, git-host-8), read on
   * each ask and held nowhere. */
  async members(input: { repository?: string; group?: string }): Promise<{ members: HostMember[] }> {
    const target = await this.membersTarget(input, "invalid_request");
    return this.listMembers(target);
  }

  /** Create a group at the host, named as the reader typed, at the path
   * the reader gave, at the top or inside a group the view lists
   * (git-host-15); the group then counts as listed until a read begun
   * after its creation is held (git-host-5), announced before the
   * reply. */
  async createGroup(name: string, path: string, parent: string | null): Promise<{ group: { id: string; fullPath: string; name: string } }> {
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    const typed = name.trim();
    if (typed.length === 0) throw new CoreError("invalid_request", nameTheGroup());
    const given = path.trim();
    if (given.length === 0) throw new CoreError("invalid_request", pathTheGroup());
    let parentPath: string | null = null;
    if (parent !== null) {
      const listed = this.listedGroups(this.view).find((group) => group.id === parent);
      if (!listed) throw new CoreError("not_found", groupNotListed(parent, this.hostName()));
      parentPath = listed.fullPath;
    }
    let created: Awaited<ReturnType<GitHostClient["createGroup"]>>;
    try {
      created = await this.host.client.createGroup({ name: typed, path: given, parentId: parent });
    } catch (error) {
      if (error instanceof HostError && error.kind === "name_taken") throw new CoreError("invalid_request", groupNameTaken(typed, parentPath, this.hostName()));
      throw this.hostWriteRefusal(error);
    }
    // The group counts as listed, as the host answered it, until a read
    // begun after this is held, whether or not that read lists it; one
    // begun before cannot, and is made again before it is held. No read
    // is begun here: the host's listing may lag behind its creation
    // (git-host-5).
    this.changedAfter = this.readsBegun;
    if (this.signedIn()) this.created.set(created.fullPath, created);
    await this.publish();
    return { group: { id: created.id ?? "", fullPath: created.fullPath, name: created.name } };
  }

  // -- undo in Spex (git-host-18..20, DR-120) ---------------------------------
  //
  // A misplacement is undone as the person: a group of the instance
  // renamed or deleted, a spex repository moved to another group. The
  // host is asked whatever the view said the person may do; only what it
  // cannot be asked — a blank field, a place the view does not list, a
  // group the view lists anything under — is refused before it is.

  /** Rename a group of the instance at the host — its name, its path
   * segment, or both (git-host-18) — holding it as the host answered,
   * every group and spex repository inside it under its new path, until
   * a read begun after the rename is held (git-host-5), announced before
   * the reply. */
  async renameGroup(id: string, input: { name?: string; path?: string }): Promise<{ group: { id: string; fullPath: string; name: string } }> {
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    if (input.name === undefined && input.path === undefined) throw new CoreError("invalid_request", renameNothing());
    const name = input.name?.trim();
    if (name !== undefined && name.length === 0) throw new CoreError("invalid_request", nameTheGroup());
    const path = input.path?.trim();
    if (path !== undefined && path.length === 0) throw new CoreError("invalid_request", pathTheGroup());
    const listed = this.instanceGroup(id);
    const from = listed.fullPath;
    let renamed: HostGroup;
    try {
      renamed = await this.host.client.renameGroup(id, { ...(name !== undefined ? { name } : {}), ...(path !== undefined ? { path } : {}) });
    } catch (error) {
      if (error instanceof HostError && error.kind === "name_taken") {
        const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : null;
        throw new CoreError("invalid_request", groupNameTaken(path ?? name ?? listed.name, parent, this.hostName()));
      }
      throw this.hostWriteRefusal(error);
    }
    const to = renamed.fullPath;
    const here = (group: Pick<HostGroup, "id" | "fullPath">): boolean => group.id === id || group.fullPath === from;
    const inside = (fullPath: string): string => fullPath.startsWith(`${from}/`) ? `${to}${fullPath.slice(from.length)}` : fullPath;
    this.holdChange({
      group: (group) => group.kind !== "group" ? group : here(group) ? { ...renamed, id, kind: "group" } : { ...group, fullPath: inside(group.fullPath) },
      listing: (listing) => {
        const group = listing.repository.group;
        if (group.kind !== "group") return listing;
        const next = here(group) ? { ...group, fullPath: to, name: renamed.name } : { ...group, fullPath: inside(group.fullPath) };
        return { ...listing, repository: { ...listing.repository, group: next } };
      },
    });
    await this.publish();
    return { group: { id, fullPath: to, name: renamed.name } };
  }

  /** Delete a group of the instance at the host (git-host-19), only
   * where the view lists nothing under it, since the host deletes
   * whatever a group holds with it; the group is held as gone until a
   * read begun after the deletion is held (git-host-5), announced before
   * the reply. */
  async deleteGroup(id: string): Promise<{ deleted: true }> {
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    const listed = this.instanceGroup(id);
    if (this.holdsAnything(listed)) throw new CoreError("invalid_request", groupNotEmpty(listed.fullPath));
    try {
      await this.host.client.deleteGroup(id);
    } catch (error) {
      throw this.hostWriteRefusal(error);
    }
    this.holdChange({ group: (group) => group.kind === "group" && (group.id === id || group.fullPath === listed.fullPath) ? null : group });
    await this.publish();
    return { deleted: true };
  }

  /** Move a spex repository, by its key, into a group of the instance or,
   * where none is named, your own group (git-host-20), holding it as the
   * host answered until a read begun after the move is held (git-host-5),
   * announced before the reply; its clone moves on its next sync
   * (space-60). */
  async moveRepository(key: string, groupId: string | null): Promise<{ repository: { id: string; fullPath: string } }> {
    const target = await this.membersTarget({ repository: key }, "invalid_request");
    let into: HostGroup | null = null;
    if (groupId !== null) {
      into = this.instanceGroup(groupId);
      if (this.collides(into)) throw new CoreError("invalid_request", groupNamedLikeYourLogin(into.fullPath));
    }
    let moved: HostRepository;
    try {
      moved = await this.host.client.transferRepository(target.id, groupId);
    } catch (error) {
      if (error instanceof HostError && error.kind === "name_taken") {
        throw new CoreError("invalid_request", takenIn(splitKey(key).name, into?.fullPath ?? userGroup(this.view)?.fullPath ?? this.host.store.home.ownName));
      }
      throw this.hostWriteRefusal(error);
    }
    this.holdChange({ listing: (listing) => listing.repository.id === moved.id ? { ...listing, repository: moved } : listing });
    await this.publish();
    return { repository: { id: moved.id, fullPath: `${moved.group.fullPath}/${moved.path}` } };
  }

  /** A group of the instance the current view lists, with those this
   * core created since its read began, by its host id; your own group
   * and another account's are none (git-host-18..20): `not_found`, the
   * host not asked, where none is. */
  private instanceGroup(id: string): HostGroup {
    const group = this.listedGroups(this.view).find((entry) => entry.kind === "group" && entry.id === id);
    if (!group) throw new CoreError("not_found", groupNotListed(id, this.hostName()));
    return group;
  }

  /** Whether the view lists a spex repository or a group under a group
   * of the instance (git-host-19), its paths compared ignoring case as
   * the host's are. */
  private holdsAnything(group: HostGroup): boolean {
    const path = group.fullPath.toLowerCase();
    const under = (fullPath: string, self: boolean): boolean => (self && fullPath.toLowerCase() === path) || fullPath.toLowerCase().startsWith(`${path}/`);
    if (this.listedGroups(this.view).some((entry) => entry.kind === "group" && entry.id !== group.id && under(entry.fullPath, false))) return true;
    return [...(this.view?.listings ?? []), ...this.attached.values()].some(({ repository }) =>
      repository.group.kind === "group" && (repository.group.id === group.id || under(repository.group.fullPath, true)));
  }

  /**
   * Hold a change this core made at the host (git-host-5): the view, and
   * what was created or attached since its read began, read as the
   * host's answer left them until a read begun after the change is held,
   * a read begun before it made again before it is held. `group` maps
   * each group to what the answer left of it, null where it is gone, and
   * `listing` each listed spex repository.
   */
  private holdChange(change: { group?: (group: HostGroup) => HostGroup | null; listing?: (listing: HostListing) => HostListing }): void {
    this.changedAfter = this.readsBegun;
    const groups = (list: HostGroup[]): HostGroup[] => {
      if (!change.group) return list;
      const map = change.group;
      return list.flatMap((group) => {
        const next = map(group);
        return next ? [next] : [];
      });
    };
    const listings = (list: HostListing[]): HostListing[] => (change.listing ? list.map(change.listing) : list);
    if (this.view) this.view = { ...this.view, groups: groups(this.view.groups), listings: listings(this.view.listings) };
    if (change.group) {
      const held = groups([...this.created.values()]);
      this.created.clear();
      for (const group of held) this.created.set(group.fullPath, group);
    }
    if (change.listing) for (const [id, listing] of [...this.attached]) this.attached.set(id, change.listing(listing));
  }

  /** Add the account of a login to a group or spex repository at one of
   * the host's roles, and list the members the host holds afterwards
   * (git-host-16). `role` is a role's id from the view. */
  async share(input: { repository?: string; group?: string; login: string; role: string }): Promise<{ members: HostMember[] }> {
    this.requireOneTarget(input);
    const login = input.login.trim();
    if (login.length === 0) throw new CoreError("invalid_request", nameTheLogin(this.hostName()));
    const roles = (this.signedIn() ? this.view?.roles : undefined) ?? [];
    if (!roles.some((role) => role.id === input.role)) throw new CoreError("invalid_request", notARole(input.role, this.hostName()));
    const target = await this.membersTarget(input, "not_found");
    try {
      await this.host.client.addMember(target, { login, role: input.role });
    } catch (error) {
      throw this.hostWriteRefusal(error);
    }
    return this.listMembers(target);
  }

  /** Remove the account of a login from a group's or spex repository's
   * own members, and list the members the host holds afterwards
   * (git-host-17). */
  async unshare(input: { repository?: string; group?: string; login: string }): Promise<{ members: HostMember[] }> {
    this.requireOneTarget(input);
    const login = input.login.trim();
    if (login.length === 0) throw new CoreError("invalid_request", nameTheLogin(this.hostName()));
    const target = await this.membersTarget(input, "not_found");
    try {
      await this.host.client.removeMember(target, login);
    } catch (error) {
      throw this.hostWriteRefusal(error);
    }
    return this.listMembers(target);
  }

  /** Read a target's members from the host, relaying a refusal
   * (git-host-8, git-host-11). */
  private async listMembers(target: MembersTarget): Promise<{ members: HostMember[] }> {
    try {
      const answer = await this.host.client.members(target);
      return { members: answer.members.map((member) => ({ id: member.id, login: member.login, displayName: member.displayName, role: member.role, direct: member.direct, via: member.via })) };
    } catch (error) {
      throw new CoreError(error instanceof HostError && error.kind === "not_found" ? "not_found" : "invalid_request", relayHostError(error, this.hostName()));
    }
  }

  /** A command names exactly one group or one spex repository, and the
   * home is signed in (space-29). */
  private requireOneTarget(input: { repository?: string; group?: string }): void {
    if (!this.signedIn()) throw new CoreError("invalid_request", signInFirst());
    if ((input.group === undefined) === (input.repository === undefined)) throw new CoreError("invalid_request", nameOneTarget());
  }

  /**
   * The host's id of the group or spex repository a command names, as
   * the home's current view lists it (git-host-8, git-host-16,
   * git-host-17): a group by its host id; a repository by its key — its
   * clone's listing, or, before any read is held, the id its clone
   * records — or the host's listing under that key where this device
   * lacks it. A clone on this device alone is refused `localOnly`; a
   * place the view does not list `not_found`, the host not asked.
   */
  private async membersTarget(input: { repository?: string; group?: string }, localOnly: "invalid_request" | "not_found"): Promise<MembersTarget> {
    this.requireOneTarget(input);
    const view = this.view;
    if (input.group !== undefined) {
      const group = input.group;
      if (!this.listedGroups(view).some((entry) => entry.id === group)) throw new CoreError("not_found", groupNotListed(group, this.hostName()));
      return { kind: "group", id: group };
    }
    const key = input.repository as string;
    if (this.host.store.repository(key)) {
      const facts = await this.machine(key).readFacts();
      if (facts.remote === null) {
        throw new CoreError(localOnly, i18n._({ id: "On this device only", comment: "A spex repository's state: it has no remote on the Git host" }));
      }
      // Attached since the view's read began, it counts as listed (git-host-5).
      const listing = listingFor(view, facts.id, facts.remote) ?? listingFor({ listings: [...this.attached.values()] }, facts.id, facts.remote);
      const id = listing?.repository.id ?? (view ? null : facts.id);
      if (id === null) throw new CoreError("not_found", noLongerShared());
      return { kind: "repository", id };
    }
    const id = view?.listings.find((listing) => !this.collides(listing.repository.group, view) && hostKey(listing.repository) === key)?.repository.id;
    if (id === undefined) {
      throw new CoreError("not_found", i18n._({ id: "no spex repository {key} on this device", comment: "Refusal: the key names no clone under workspace/", values: { key } }));
    }
    return { kind: "repository", id };
  }

  /** A host write's refusal as the command's error (git-host-11,
   * git-host-15..17): `not_found` with the host's words, which name what
   * it found no trace of; anything else `invalid_request`, a refusal in
   * the host's words. */
  private hostWriteRefusal(error: unknown): CoreError {
    if (error instanceof HostError && error.kind === "not_found") return new CoreError("not_found", notFoundAt(this.hostName(), error.words));
    return new CoreError("invalid_request", relayHostError(error, this.hostName()));
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
    if (!listing || listing.readOnly || !mayHaveOthers(listing)) return;
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
    // A read begun during the host's rate limit is answered later; the
    // step's Stop leaves it to answer (git-host-21).
    try { view = await machine.hostCall("check", () => this.readHost()); }
    catch (error) { throw hostStop("check", error, this.hostName()); }
    const listing = listingFor(view, facts.id, facts.remote);
    if (!listing) {
      machine.hostOverride = { state: "unreachable", reason: noLongerShared() };
      throw new SpaceStopped("check", { cause: "gone", message: noLongerShared(), guidance: nothingDeleted(), retry: true });
    }
    const repository = listing.repository;
    if (facts.id === null && facts.remote !== null) machine.recordId(repository.id, facts.remote);
    // A group named like a login holds no folder of its own: the clone
    // neither syncs with it nor follows it there (space-60, space-61).
    if (this.collides(repository.group, view)) {
      machine.hostOverride = { state: "unreachable", reason: namedLikeYourLogin() };
      throw new SpaceStopped("check", { cause: "gone", message: groupNamedLikeYourLogin(repository.group.fullPath), guidance: nothingDeleted(), retry: true });
    }
    const key = hostKey(repository);
    if (op === "sync" && key && key !== machine.key) await this.moveInSync(machine, key, repository.id, facts.remote);
    if (facts.remote !== null && facts.remote !== repository.remoteUrl) machine.setOrigin(repository.remoteUrl, facts.remote);
    const readOnly = listing.readOnly !== null;
    // The core's creation the clone records, read as its other facts
    // are, is spent by this check once done with the default branch —
    // found or pushed; a check stopping before then, by the core
    // stopping, the host not answering, the push refused or the empty
    // repository read-only, keeps it, so the next sync, or the next core,
    // owes the branch still (git-host-7).
    const recorded = machine.createdNow();
    const created = recorded === repository.id;
    // A creation recorded for another repository is stale.
    if (recorded !== null && !created) machine.forgetCreated();
    if (!readOnly && !listing.branchPresent) {
      // `spex` beside the default branch, never as it (git-host-7).
      const group = repository.group.fullPath;
      if (repository.empty && !(created && await this.defaultBranchArrives(machine, repository.id))) {
        if (!created || this.stopping) {
          this.waiting.set(machine.key, { step: "branch", group, message: "" });
          throw new SpaceStopped("check", { cause: "refused", message: i18n._({ id: "{host} holds no default branch for it yet", values: { host: this.hostName() }, comment: "A stopped sync: the host's repository is empty, so spex waits for its default branch; {host} is its display name" }), guidance: syncLater(), retry: true });
        }
        // Still empty: the host never committed its README — a protected
        // default branch refusing a Developer's initial commit, say — so
        // the core pushes that branch itself, and goes on as if the host
        // had (git-host-7).
        await machine.pushDefaultBranch(repository.remoteUrl, repository.name);
      }
      if (created) machine.forgetCreated();
      let answer: Awaited<ReturnType<GitHostClient["prepareBranch"]>>;
      try { answer = await machine.hostCall("check", (signal) => this.host.client.prepareBranch(repository.id, { signal })); }
      catch (error) { throw hostStop("check", error, this.hostName()); }
      if (answer.status === "pending") {
        this.waiting.set(machine.key, { step: "branch", group, message: answer.message });
        throw new SpaceStopped("check", { cause: "refused", message: waitingPhrase("branch", group, answer.message), guidance: syncLater(), retry: true });
      }
      if (this.waiting.get(machine.key)?.step === "branch") this.waiting.delete(machine.key);
    } else if (created && !repository.empty) machine.forgetCreated();
    return { remote: repository.remoteUrl, readOnly };
  }

  /** Whether a repository the core created, which the host
   * reported empty, holds its default branch within the bound: read
   * again every CREATED_REREAD_MS, CREATED_REREADS times at most, as
   * the host may answer a creation before committing it (git-host-7). */
  private async defaultBranchArrives(machine: RepositorySync, id: string): Promise<boolean> {
    for (let reads = 0; reads < CREATED_REREADS && !this.stopping; reads += 1) {
      await new Promise<void>((done) => { setTimeout(done, CREATED_REREAD_MS); });
      let empty: boolean;
      try { empty = (await machine.hostCall("check", (signal) => this.host.client.repository(id, { signal }))).empty; }
      catch (error) { throw hostStop("check", error, this.hostName()); }
      if (!empty) return true;
    }
    return false;
  }

  /** The brokered credential for a transport to the host's Git origin
   * (git-host-9); none for any other origin. Asked for a sync's step,
   * it waits out the host's rate limit, which that step's Stop ends;
   * asked otherwise, the limit refuses it (git-host-21). */
  async credentialFor(remote: string, step: SyncStep, machine?: RepositorySync): Promise<GitCredentialHandle | null> {
    const origin = this.knownOrigin();
    if (!origin || !underOrigin(remote, origin)) return null;
    if (!this.signedIn()) throw new SpaceStopped(step, { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
    let credential: { username: string; secret: string; expiresAt: number };
    try {
      credential = machine
        ? await machine.hostCall(step, (signal) => this.host.client.credential(origin, { signal }))
        : await this.host.client.credential(origin);
    } catch (error) { throw hostStop(step, error, this.hostName()); }
    return withGitCredential(credential, this.host.hostRuntime);
  }

  /** Follow the host's rename or transfer of one clone within its sync
   * (space-60): one rename at its instant, once the clone still reads the
   * remote the check read before asking the host — `remote` — and records
   * the host's id, the check's own recording of it included, and still
   * lies where the home says. A destination taken by anything but the
   * clone itself — a case-only rename's is the same folder — stops the
   * sync; writers beneath resolve their paths at their own instants, and
   * a process holding the old path keeps it. */
  private async moveInSync(machine: RepositorySync, to: string, id: string, remote: string | null): Promise<void> {
    const store = this.host.store;
    const from = machine.key;
    const source = machine.repository.dir;
    const target = store.home.clonePath(to);
    const moved = (): SpaceStopped => new SpaceStopped("check", { cause: "git", message: changedMeanwhile(`workspace/${from}`), guidance: retryGuidance(), retry: true });
    const identity = await this.machineIdentity();
    // Nothing is awaited from here to the rename.
    if (!machine.recordsNow(remote, id)) throw moved();
    if (store.repository(from)?.dir !== source || machine.key !== from) throw moved();
    // A session's lease beneath the clone holds it where it is: its writer
    // resolved that path (space-60).
    const held = heldSessionLease(source, identity);
    if (held !== undefined) throw inUseStop("check", `sessions/${held}`, store);
    if (occupied(source, target, store.home.workspace)) {
      throw new SpaceStopped("check", {
        cause: "git",
        message: i18n._({ id: "{path} already exists, so the clone cannot follow the host there", values: { path: `workspace/${to}` }, comment: "A stopped sync: the folder a renamed spex repository moves to is taken" }),
        guidance: i18n._({ id: "Move that folder aside, then Retry.", comment: "Guidance where a renamed spex repository's new folder is taken" }),
        retry: true,
      });
    }
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
   * complete: blocking damage would drop a record the next honest fold
   * still wants. The fold is read from the files at its instant. */
  private pruneAnswers(reported: StorageDiagnostic[]): void {
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
    const repositories: Placed[] = [];
    for (const repository of store.listRepositories()) {
      // A clone that moved while this read waited is read under its
      // new key, and its old one names nothing (space-59, space-60).
      if (!store.repository(repository.key)) continue;
      const machine = this.machine(repository.key);
      // Every row is read from its clone at this instant (space-61).
      const base = await machine.state(recompute);
      if (this.host.store.repository(repository.key)?.dir !== machine.repository.dir) continue;
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
      // What the host's last read said the person may do, and the roles
      // it grants: nothing until a read is held (DR-114).
      account: ((a) => (a ? { ...a, canCreateGroup: this.view?.account.canCreateGroup ?? false } : null))(store.home.account()),
      signIn: this.signInView(),
      readAt: this.signedIn() ? this.view?.readAt ?? null : null,
      groups: this.groupsOf(repositories),
      roles: this.signedIn() ? (this.view?.roles ?? []).map((role) => ({ id: role.id, name: role.name, mayPush: role.mayPush })) : [],
      diagnostics,
      // One number, so the header and the list cannot drift (space-1):
      // what the reader has not answered, and everything unfolded.
      issues: countIssues(diagnostics),
    };
  }

  /** A clone's state as the host's last answer and this device's files
   * make it (space-61), with the group the host's last read names for
   * it, where it lists it (space-1). */
  private overlay(machine: RepositorySync, base: RepositoryState): Placed {
    const facts = machine.facts;
    const waiting = this.waiting.get(base.key);
    // What a pick, a join or a pairing changed since the machine's last
    // reading is read afresh: its remote, its id and its working folder.
    // A remote at the host reads as its path in the instance (space-15).
    const row: RepositoryState = {
      ...base,
      id: facts.id,
      remote: this.remoteAsShown(facts, base.key),
      folder: this.host.store.home.folderOf(base.key)?.path ?? null,
      waiting: waiting ? { step: waiting.step, group: waiting.group, message: waiting.message } : null,
    };
    if (facts.remote === null) return { row: { ...row, state: "local-only", reason: null } };
    // A remote the reader named, a path this device reaches: no host.
    if (!this.atHost(facts)) return { row };
    if (!this.signedIn()) return { row: { ...row, state: "unreachable", reason: signInAgain() } };
    // Attached since the view's read began, it counts as listed (git-host-5).
    const listing = this.listingOf(facts);
    const group = this.view ? listing?.repository.group : undefined;
    // What the host's listing says, the person's rights on it among it
    // (git-host-5, DR-114).
    const listed: RepositoryState = listing
      ? { ...row, members: listing.members, visibility: listing.repository.visibility, can: { manageMembers: listing.repository.can.manageMembers, transfer: listing.repository.can.transfer } }
      : row;
    // A clone whose join still runs is not on this device yet: its code
    // may still be cloning (space-61, space-63).
    const joining = facts.id === null ? undefined : this.joining.get(facts.id);
    if (joining?.phase === "running") return { row: { ...listed, state: "absent", reason: null, sync: joining }, group };
    // A group named like a login holds no folder of its own (space-61).
    if (this.collides(group)) return { row: { ...listed, state: "unreachable", reason: namedLikeYourLogin() }, group };
    if (machine.hostOverride) return { row: { ...listed, state: machine.hostOverride.state, reason: machine.hostOverride.reason }, group };
    if (this.readFailure !== undefined) return { row: { ...listed, state: "unreachable", reason: this.readFailure }, group };
    // Not read since this core started: as the last sync left it.
    if (!this.view) return { row };
    if (!listing) return { row: { ...row, state: "unreachable", reason: noLongerShared() } };
    if (listing.readOnly) {
      return { row: { ...listed, state: "read-only", reason: listing.readOnly.message || i18n._({ id: "Archived", comment: "A spex repository's read-only reason where the host gave no words for its archive" }) }, group };
    }
    return { row: { ...listed, state: "reachable", reason: null }, group };
  }

  /** A row for every spex repository the host lists and this device
   * lacks (space-61: "Not on this device"); one in a group held as
   * colliding reads unreachable, keyed `<path>@<id>` so it names no
   * clone (space-30). */
  private absentRows(): Placed[] {
    const view = this.view;
    if (!view || !this.signedIn()) return [];
    const store = this.host.store;
    const matched = new Set<string>();
    for (const repository of store.listRepositories()) {
      const facts = this.machines.get(repository.key)?.facts;
      const listing = facts ? listingFor(view, facts.id, facts.remote) : undefined;
      if (listing) matched.add(listing.repository.id);
    }
    const rows: Placed[] = [];
    for (const listing of view.listings) {
      const repository = listing.repository;
      if (matched.has(repository.id)) continue;
      const colliding = this.collides(repository.group);
      const path = `${repository.group.fullPath}/${repository.path}`;
      const key = colliding ? `${path}@${repository.id}` : hostKey(repository);
      if (!key || (!colliding && store.repository(key))) continue;
      const code = repository.project && typeof repository.project.remote === "string" ? this.codeRemoteAsShown(repository.project.remote) : null;
      rows.push({
        row: {
          key,
          name: repository.path,
          can: colliding ? { manageMembers: false, transfer: false } : { manageMembers: repository.can.manageMembers, transfer: repository.can.transfer },
          id: repository.id,
          own: false,
          code,
          folder: null,
          remote: path,
          state: colliding ? "unreachable" : "absent",
          reason: colliding ? namedLikeYourLogin() : null,
          waiting: null,
          members: listing.members,
          visibility: repository.visibility,
          branch: null,
          local: [],
          incoming: [],
          conflicts: [],
          lastSync: null,
          noticed: false,
          sync: colliding ? { phase: "idle" } : this.joining.get(repository.id) ?? { phase: "idle" },
        },
        group: repository.group,
      });
    }
    return rows;
  }

  /** Your own group first, then, by path, every group the host lists
   * and every other account's login under which it lists a spex
   * repository, each with its spex repositories, the group's own first
   * (space-1, DR-120). Entries are known by the group's id, your own
   * once, another account's by its login: a row stands under the group
   * the host's last read names for it, and under its key's group only
   * where the host lists nothing for it, so no group the host lists
   * displaces your own or takes its rows. Before sign-in, your own group
   * with what this device holds. */
  private groupsOf(placed: Placed[]): GroupsState["groups"] {
    const store = this.host.store;
    const ownName = store.home.ownName;
    const view = this.signedIn() ? this.view : undefined;
    const user = userGroup(view);
    const login = store.home.account()?.login ?? null;
    type Entry = GroupsState["groups"][number];
    // What the host's last read lets the person do in each group
    // (DR-114); nothing in your own, which takes no subgroup or member,
    // nor in another account's, nor in a group the read did not list.
    const noCan = (): Entry["can"] => ({ createSubgroup: false, manageMembers: false, rename: false, delete: false });
    const own: Entry = { id: user?.id ?? null, fullPath: ownName, name: user?.name ?? ownName, own: true, can: noCan(), repositories: [] };
    const entries: Entry[] = [];
    const byId = new Map<string, Entry>();
    const byPath = new Map<string, Entry>();
    const logins = new Map<string, Entry>();
    for (const group of view ? this.listedGroups(view) : []) {
      if (group.kind === "user") continue;
      const can = group.can;
      const entry: Entry = { id: group.id, fullPath: group.fullPath, name: group.name, own: false, can: { createSubgroup: can.createSubgroup, manageMembers: can.manageMembers, rename: can.rename, delete: can.delete }, repositories: [] };
      entries.push(entry);
      if (group.id !== null) byId.set(group.id, entry);
      if (!byPath.has(group.fullPath)) byPath.set(group.fullPath, entry);
    }
    const unlisted = (path: string): Entry => {
      let entry = byPath.get(path);
      if (!entry) {
        entry = { id: null, fullPath: path, name: path.split("/").pop() ?? path, own: false, can: noCan(), repositories: [] };
        entries.push(entry);
        byPath.set(path, entry);
      }
      return entry;
    };
    const ownLogin = (path: string): boolean => path === ownName || (user !== undefined && sameLogin(path, user.fullPath)) || (login !== null && sameLogin(path, login));
    const loginEntry = (path: string): Entry => {
      const name = path.toLowerCase();
      let entry = logins.get(name);
      if (!entry) {
        entry = { id: null, fullPath: path, name: path, own: false, can: noCan(), repositories: [] };
        entries.push(entry);
        logins.set(name, entry);
      }
      return entry;
    };
    // The rows the host lists first, so every login's entry stands
    // before a row the host lists nothing for falls back to its key.
    for (const { row, group } of placed) {
      if (!group || !view) continue;
      const entry = group.kind === "user"
        ? (ownLogin(group.fullPath) ? own : loginEntry(group.fullPath))
        : (group.id !== null ? byId.get(group.id) : undefined) ?? unlisted(group.fullPath);
      entry.repositories.push(row);
    }
    for (const { row, group } of placed) {
      if (group && view) continue;
      const path = splitKey(row.key).group;
      const entry = path === ownName || (user !== undefined && path === user.fullPath)
        ? own
        : logins.get(path.toLowerCase()) ?? unlisted(path);
      entry.repositories.push(row);
    }
    const groupsOwn = (entry: Entry, row: RepositoryState): boolean => row.name === `${entry.fullPath.split("/").pop()}-spex`;
    for (const entry of [own, ...entries]) {
      entry.repositories.sort((a, b) => Number(groupsOwn(entry, b)) - Number(groupsOwn(entry, a)) || a.key.localeCompare(b.key));
    }
    return [own, ...entries.sort((a, b) => a.fullPath.localeCompare(b.fullPath))];
  }

  /** Broadcast the state after one machine moved, every clone read at
   * this instant; transitions in a burst coalesce into one. */
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

  /** The host's rate limit began holding every call (git-host-21): each
   * step with a call to the host in flight offers Stop (space-16). Read
   * once the answer that set the hold has run its course, so the step
   * whose own call it answered has stopped rather than offering Stop. */
  holdBegan(): void {
    setImmediate(() => {
      for (const machine of this.machines.values()) machine.holdBegan();
    });
  }

  // A read resolves the clone's path at its instant; one that meets a
  // clone moved meanwhile fails, and the interface reads again on the
  // move's broadcast (space-29).
  diff(key: string, unit: string, path: string, side: SpaceChoice): Promise<{ patch: string; truncated: boolean }> {
    return this.machine(key).diff(unit, path, side);
  }

  tree(key: string, path?: string): Promise<{ path: string; entries: SpaceEntry[] }> {
    return this.machine(key).tree(path);
  }

  read(key: string, path: string): Promise<SpaceReadResult> {
    return this.machine(key).read(path);
  }

  /** What removing a project would lose (projects-9). */
  pendingUnits(key: string): Promise<number> {
    if (!this.host.store.repository(key)) return Promise.resolve(0);
    return this.machine(key).pendingUnits();
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
    try { await this.publishing; } catch { /* reported where it ran */ }
  }
}

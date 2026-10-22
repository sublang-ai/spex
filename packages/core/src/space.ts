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
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, realpathSync, renameSync, rmSync, statSync, type Dirent } from "node:fs";
import { homedir, hostname, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { type StorageDiagnostic } from "./app-storage.js";
import { heldSessionLease, occupied, pruneEmptyFolders } from "./clone-moves.js";
import { readJsonFile, StorageFormatError, UUID, writeApplicationFile } from "./files.js";
import { withGitCredential, type GitCredentialHandle } from "./git-credential.js";
import {
  anotherAccountError, CredentialChanged, HostError, SignInBusyError, type BrowserSignIn, type DeviceSignIn, type GitHostClient, type HostAccount, type HostGroup,
  type HostMember, type HostRepository, type MembersTarget,
} from "./git-host.js";
import { cloneRemoteName, InstanceRefused, kebab, REMOTE_URL_KEYS, remoteNamesIn, splitKey, type HomeAccount } from "./home.js";
import { i18n } from "./i18n.js";
import { canonicalOrigin, instanceFolder, instanceSegmentOf, isInstanceFolder, OriginRefused, parseOrigin, type OriginRefusal } from "./instance.js";
import { isDeferredClone } from "./migrate-instances.js";
import type {
  GroupsState,
  InstanceGroupState,
  InstanceState,
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
  classifyHostTransportFailure, classifyTransportFailure, displayRemote, GitMissingError, lastLines, remoteHost, membersDecide, noLongerShared,
  signInAgain, SpaceGit, validateRemoteUrl, withoutHostUrls, type GitFailure, type GitRun, type GitRunOptions,
} from "./space-git.js";
import {
  callbackPages, collidingGroup, groupNameTaken, groupNamedLikeYourLogin, groupNotEmpty, groupNotListed, hostKey, listingFor, namedLikeYourLogin,
  namedLogins, nameOneTarget, nameTaken, nameTheGroup, nameTheLogin, notARole, notFoundAt, ownNameFor, pathTheGroup, readHostCatalog, readHostListing, readHostView, relayHostError,
  renameNothing, repositoryDescription, repositoryFor, sameLogin, sameOrigin, signInFailure, takenIn, underOrigin, userGroup, waitingPhrase,
  type HostCatalog, type HostListing, type HostView,
} from "./space-groups.js";
import {
  APPLY_MARKER,
  applyStorageSelection,
  assertStorageRefreshSafe,
  StorageDestinationRefused,
  EMPTY_TREE,
  NOT_PACKAGES,
  planStorageUnits,
  portable,
  prepareStorageGitFiles,
  readStorageTree,
  resolveStorageChoices,
  SPEX_BRANCH,
  specPackageFolders,
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
  /** A new client of the instance at a canonical origin (git-host-1..11,
   * DR-127): its own app token, refresh and rate-limit hold. The space
   * asks once per instance and keeps it for the run. */
  clientFor: (origin: string) => GitHostClient;
  /** The sign-in flow this deployment runs: the browser flow on the
   * desktop (git-host-2), the device flow on the server (git-host-3). */
  signInFlow: "browser" | "device";
  /** Whether the core runs as a seat on a team server (core-service-125):
   * your own group is then placed at no instance (space-102). */
  seat?: boolean;
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
  /** A join paired its clone with a working folder (space-63): a clone
   * holding no environment requests the built-in spec package at its
   * instance's registry (environments-11, DR-127), written before this
   * returns. */
  environmentPaired?: (key: string) => void;
  /** A pick placed a local-only project's clone at an instance
   * (storage-35), moved or not: the built-in spec package its pairing
   * locked at the default instance's registry is locked at that
   * instance's (environments-11, DR-127), written before this returns. */
  environmentPlaced?: (key: string) => void;
  /** Throws where an Apply or a repair may not replace authoring session
   * `id` of clone `key` now — its turn runs in this core (space-19):
   * called synchronously at that unit's write, after its version check
   * and before its first file is replaced. */
  assertAuthoringWritable?: (key: string, id: string) => void;
}

/** What a spex repository's clone says of its host: its remote's URL
 * and the host's id recorded beside it (git-host-5), and that remote's
 * name in the clone (DR-127). */
interface CloneFacts { remote: string | null; id: string | null; remoteName: string | null }

/** A clone's remote URL and recorded host id, and, where known, that
 * remote's name, which names your own group's own repository's instance
 * (storage-31): what the URL rules of space-15 read. */
type RemoteFacts = Pick<CloneFacts, "remote" | "id"> & { remoteName?: string | null };

/** The names of the remotes a clone's configuration gives a URL, read
 * from `git config -z --get-regexp` over REMOTE_URL_KEYS: none where
 * Git found no key. */
function remoteNames(run: GitRun): string[] {
  return run.code === 0 ? remoteNamesIn(run.stdout.toString("utf8")) : [];
}

/** The name the host's remote takes in a clone (DR-127, storage-34):
 * its key's instance folder; for a clone keyed outside every instance's
 * folder, the folder of the instance the home signs in to, `folder`;
 * `origin` only where the home's instance stands as no instance's
 * origin. */
function hostRemoteName(key: string, folder: string | null): string {
  return splitKey(key).instance ?? folder ?? "origin";
}

/** One destination read, ordered independently of full-view completion. */
interface TargetReading {
  begun: number;
  accountGeneration: number;
  facts: CloneFacts;
  catalog?: HostCatalog;
  listing?: HostListing;
  failure?: string;
}

/** A row with the group the last read of its instance names for it,
 * where it lists it (space-1), and that instance's origin. */
interface Placed { row: RepositoryState; group?: HostGroup; instance?: string }

/** The last sync a clone holds (space-61). */
type Agreed = NonNullable<NonNullable<RepositoryState["branch"]>["agreed"]>;

/** A step at the host waiting for a member with the rights (space-64). */
interface Waiting {
  /** The origin of the instance the step waits at (DR-127). */
  instance: string;
  step: "create" | "branch";
  group: string;
  message: string;
  /** What a creation asks again at that instance's next read. */
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

/** The refusal of a sync whose instance is signed out (space-11), naming
 * that instance by its display name as last read, else its host name. */
const signInTo = (host: string): string => i18n._({
  id: "Sign in to {host} first",
  values: { host },
  comment: "Refusal of a sync: the spex repository's instance is signed out; {host} is that instance's display name, or its host name before any read",
});

/** The refusal of Forget of an instance still signed in (space-29),
 * naming it by its display name. */
const signOutFirst = (host: string): string => i18n._({
  id: "Sign out of {host} first",
  values: { host },
  comment: "Refusal of Forget: the instance is still signed in; {host} is its display name, or its host name before any read",
});

/** The refusal of Forget while spex repositories are still kept under
 * the instance (space-82): each named, beneath its heading. */
const stillKeptUnder = (host: string, names: readonly string[]): string => i18n._({
  id: "Still kept under {host}: {names}",
  values: { host, names: new Intl.ListFormat(i18n.locale || "en", { type: "conjunction", style: "narrow" }).format(names) },
  comment: "Refusal of Forget: spex repositories whose clones are still kept under the instance, no signed-in instance listing them; {host} is the instance's display name, {names} the repositories' names as a list",
});

/** The refusal of a sync of a clone no instance holds (space-11). */
const pickAGroupFirst = (): string => i18n._({
  id: "Pick a group first",
  comment: "Refusal: the spex repository is only on this device; a group must be picked for it",
});

/** The refusal on a seat of a pick or a remote for your own group,
 * which stays on the server (space-102). */
const ownStaysOnTheServer = (): string => i18n._({
  id: "Your own group stays on this server",
  comment: "Refusal on a team server's seat of a pick or a remote for your own group: its records stay on the server and are placed at no instance",
});

/** The refusal of a pick naming another instance than the one whose
 * folder the clone's key lies in (space-29, space-58). */
const pickAtItsInstance = (name: string, host: string): string => i18n._({
  id: "{name} is kept under {host}; pick a group there",
  values: { name, host },
  comment: "Refusal of a pick: the spex repository's folder lies under one instance, and the pick named a group at another; {name} is the repository's name, {host} its instance's display name",
});

/** The refusal of a command naming an instance the home does not list
 * (space-29); a URL's user info, which may hold a secret, is never
 * repeated. */
const noSuchInstance = (instance: string): string => i18n._({
  id: "This device has not signed in to {instance}",
  values: { instance: instance.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, "$1…@") },
  comment: "Refusal: a command names an instance, by its address, that this device lists no entry for — never signed in to there, or forgotten since",
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

/** The refusal of a sign-in at a URL the origin rule refuses (git-host-2,
 * storage-2): one sentence naming the part of the rule it breaks. The
 * URL is never repeated, since its user info may hold a secret. */
function originRuleRefusal(reason: OriginRefusal): string {
  switch (reason) {
    case "invalid":
      return i18n._({ id: "Name the instance by its URL, such as https://spex.pub", comment: "Refusal of a sign-in: what the reader gave does not read as a URL at all" });
    case "scheme":
      return i18n._({ id: "An instance's URL begins with https://, or http:// on this device", comment: "Refusal of a sign-in: the URL's scheme is neither https nor http; http is allowed for an instance on this device alone (localhost or 127.x)" });
    case "user":
      return i18n._({ id: "An instance's URL carries no user or password", comment: "Refusal of a sign-in: the URL carries user info before its host" });
    case "path":
      return i18n._({ id: "An instance's URL names no path, only its scheme, host and port", comment: "Refusal of a sign-in: the URL names a path after its host; an instance is known by its origin alone" });
    case "query":
      return i18n._({ id: "An instance's URL carries no query, only its scheme, host and port", comment: "Refusal of a sign-in: the URL carries a query; an instance is known by its origin alone" });
    case "fragment":
      return i18n._({ id: "An instance's URL carries no fragment, only its scheme, host and port", comment: "Refusal of a sign-in: the URL carries a fragment; an instance is known by its origin alone" });
    case "host":
      return i18n._({ id: "An instance's host holds only letters, digits, inner hyphens and single dots", comment: "Refusal of a sign-in: the URL's host holds a character outside DNS labels, such as an underscore, or is an IPv6 literal" });
    case "port":
      return i18n._({ id: "An instance's port is from 1 to 65535", comment: "Refusal of a sign-in: the URL names port 0" });
    case "insecure":
      return i18n._({ id: "An instance's URL uses https://; http:// only on this device", comment: "Refusal of a sign-in: the URL is http on a host that is not this device (localhost or 127.x)" });
  }
}

/** The refusal of a sign-in at a new origin whose folder a listed
 * instance's equals (git-host-2, storage-2): one instance per host and
 * port, whatever its scheme. */
const sameFolderRefusal = (listed: string): string => i18n._({
  id: "This device already signs in to {listed}, at the same host and port",
  values: { listed },
  comment: "Refusal of a sign-in: the URL names the host and port of an instance this device already lists, under another scheme; {listed} is that instance's origin",
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

/** A move stopped: the clone changed between the sync's read and its
 * rename. */
function movedMeanwhile(key: string): SpaceStopped {
  return new SpaceStopped("check", { cause: "git", message: changedMeanwhile(`workspace/${key}`), guidance: retryGuidance(), retry: true });
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
      /** Whether `spex`'s upstream is the clone's remote (space-12). */
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
  facts: CloneFacts = { remote: null, id: null, remoteName: null };
  /** The remote `spex`'s upstream names, as the last read found it: a
   * remote taken away leaves it, beside the host's `spex` the clone
   * holds (space-5). */
  private upstreamName: string | null = null;
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
      // Read at each commit, so a clone that moved to another instance
      // commits as the account there (space-32, space-60).
      identity: () => this.owner.identityFor(this),
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
   * rate limit of the instance its sync goes to holds it, the step offers
   * Stop (space-16), which ends the wait — a direct call sending nothing,
   * a shared read left to answer later — and stops the step (space-15).
   */
  async hostCall<T>(step: SyncStep, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.hostCalls.add(controller);
    if (this.owner.syncingOf(this).client.holding()) this.offerStop();
    try {
      return await stoppable(call(controller.signal), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw waitStopped(step, this.owner.hostNameOf(this));
      throw error;
    } finally {
      this.hostCalls.delete(controller);
    }
  }

  /** The rate limit of the instance its sync goes to began holding the
   * calls (git-host-21): a step with one in flight offers Stop. */
  holdBegan(): void {
    if (this.hostCalls.size > 0) this.offerStop();
  }

  /** End the waits of the running step's calls to the host, while the
   * rate limit of the instance its sync goes to holds them; whether any
   * was ended. */
  private stopWaits(): boolean {
    if (this.hostCalls.size === 0 || !this.owner.syncingOf(this).client.holding()) return false;
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
   * A URL is written to the remote standing, which keeps its name; a
   * remote added takes the host's remote's name (DR-127) — named by
   * `folder`, the folder of the instance it is at, for a key outside
   * every instance's folder — or `name`, which replaces a remote of
   * another name.
   */
  private publishRemote(expected: string | null, next: { url?: string | null; id?: string | null; created?: string; name?: string; folder?: string | null }): boolean {
    const git = (args: string[]): GitRun => {
      const run = this.git.runSync(args);
      if (run.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${lastLines(run.stderr)}`);
      return run;
    };
    const { name, url: current } = this.remoteNow();
    if (current !== expected) return false;
    if (next.created !== undefined) git(["config", CREATED_KEY, next.created]);
    let written = name;
    if (next.url === null) {
      // Taken away, the remote's own section goes alone: the host's `spex`
      // the clone holds and its upstream stay with the repository it
      // records (space-5), where `remote remove` would drop them.
      if (name !== null) git(["config", "--remove-section", `remote.${name}`]);
      written = null;
    } else if (next.url !== undefined) {
      written = next.name ?? name ?? this.hostRemoteName(next.folder);
      if (written === name) {
        if (next.url !== current) git(["remote", "set-url", written, next.url]);
      } else {
        if (name !== null) git(["config", "--remove-section", `remote.${name}`]);
        git(["remote", "add", written, next.url]);
      }
    }
    if (next.id === null) this.git.runSync(["config", "--unset", "spex.repositoryId"]);
    else if (next.id !== undefined) git(["config", "spex.repositoryId", next.id]);
    this.facts = {
      remote: next.url === undefined ? current : next.url,
      id: next.id === undefined ? this.facts.id : next.id,
      remoteName: written,
    };
    return true;
  }

  /** The name the host's remote takes in this clone (DR-127): its key's
   * instance's folder, else `folder` — the default instance's where none
   * is given. */
  private hostRemoteName(folder: string | null = this.owner.instanceFolder()): string {
    return hostRemoteName(this.key, folder);
  }

  /** The clone's remote — its name and URL — as its `.git/config`
   * holds it now (DR-127), read synchronously so a check and its write
   * share one core turn. */
  private remoteNow(): { name: string | null; url: string | null } {
    const name = cloneRemoteName(this.key, remoteNames(this.git.runSync(["config", "-z", "--get-regexp", REMOTE_URL_KEYS])));
    return { name, url: name === null ? null : this.configNow(`remote.${name}.url`) };
  }

  /** The ref holding the host's `spex` as this clone last fetched or
   * pushed it (space-12): under the clone's remote, else — taken away —
   * under the remote its upstream still names, else under the name the
   * host's remote would take. */
  private remoteRef(): string {
    return `refs/remotes/${this.facts.remoteName ?? this.upstreamName ?? this.hostRemoteName()}/${SPEX_BRANCH}`;
  }

  /** The remote a transport of `step` names: the clone's own, as the
   * last read or write found it; one taken away meanwhile stops the
   * step. */
  private remoteNamed(step: SyncStep): string {
    const name = this.facts.remoteName;
    if (name === null) throw new SpaceStopped(step, { cause: "git", message: changedMeanwhile(splitKey(this.key).name), guidance: retryGuidance(), retry: true });
    return name;
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
    return this.remoteNow().url === remote && this.configNow("spex.repositoryId") === id;
  }

  /** The host's id the clone records at this instant, if any. */
  recordedIdNow(): string | null {
    return this.configNow("spex.repositoryId");
  }

  /** The URL of the remote the clone syncs with at this instant, if any. */
  remoteUrlNow(): string | null {
    return this.remoteNow().url;
  }

  /** The name of the remote the clone syncs with at this instant, if
   * any: what names your own group's own repository's instance
   * (storage-31). */
  remoteNameNow(): string | null {
    return this.remoteNow().name;
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
   * marks a repository the core just created (git-host-7); `folder` is
   * the folder of the instance the repository is at, which names a
   * remote added to a clone keyed outside every instance's folder. */
  async attachHost(url: string, id: string, expected: string | null, created = false, folder?: string | null): Promise<void> {
    const repo = await this.readRepository();
    this.requireGit(repo);
    if (!repo.root) throw new CoreError("invalid_request", initializeFirst());
    // The id the clone records, read in the step that writes the remote:
    // the host's id survives its renames and transfers (DR-103).
    const same = this.configNow("spex.repositoryId") === id;
    const held = this.remoteRef();
    // A remote already at the host's URL is the one this attaches; one
    // added takes the host's remote's name (DR-127).
    if (!this.publishRemote(repo.remote === url ? url : expected, { url, id, ...(created ? { created: id } : {}), ...(folder !== undefined ? { folder } : {}) })) {
      throw new CoreError("conflict", changedMeanwhile(splitKey(this.key).name));
    }
    // The same repository keeps what the clone holds of it and this
    // device's last sync; another clears them (space-5).
    if (repo.remote !== url && !same) {
      for (const ref of new Set([held, this.remoteRef()])) await this.git.run(["update-ref", "-d", ref]);
      await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
      this.upstreamName = null;
      this.checkedAt = null;
      this.host.store.deletePref(lastSyncPref(this.key));
      this.remoteEmpty = false;
      this.unrelated = false;
    }
    this.hostOverride = undefined;
  }

  /** Record the host's id beside a clone matched by its remote URL
   * (git-host-5), only while that remote stands, under whichever name. */
  recordId(id: string, remote: string): void {
    if (this.facts.id === id && this.facts.remote === remote) return;
    this.publishRemote(remote, { id });
  }

  /** The URL the host hands over after a rename or a transfer
   * (space-60), used as given, written only over the remote read and
   * under its name. */
  setOrigin(url: string, expected: string): void {
    if (!this.publishRemote(expected, { url })) {
      throw new SpaceStopped("check", { cause: "git", message: changedMeanwhile(splitKey(this.key).name), guidance: retryGuidance(), retry: true });
    }
  }

  /** The clone names its remote by the folder of the instance it is at
   * (DR-127, storage-34), its fetched `spex` and its upstream with it:
   * a remote still named `origin`, the clone moved under that folder
   * while it records the host's id, or one named by another instance's
   * folder, the clone following the instance `folder` names (space-60).
   * `from` is the name the remote bore as the step began, read before a
   * move re-keyed the clone; nothing is renamed where a remote bears the
   * folder's name already. Read and written in one synchronous step; a
   * rename Git refuses leaves the remote as it stood, the clone still
   * reading it (cloneRemoteName) until its next sync renames it. */
  renameRemote(from: string | null, folder: string): void {
    if (from === null || from === folder || (from !== "origin" && !isInstanceFolder(from))) return;
    const names = remoteNames(this.git.runSync(["config", "-z", "--get-regexp", REMOTE_URL_KEYS]));
    if (!names.includes(from) || names.includes(folder)) return;
    const run = this.git.runSync(["remote", "rename", from, folder]);
    if (run.code !== 0) {
      console.error(`spex: the remote of ${this.key} keeps its name: ${lastLines(run.stderr)}`);
      return;
    }
    if (this.facts.remoteName === from) this.facts = { ...this.facts, remoteName: folder };
    if (this.upstreamName === from) this.upstreamName = folder;
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
    // The remote by its name in the clone (DR-127), its URL as Git
    // reads it.
    const remoteName = cloneRemoteName(this.key, remoteNames(await this.git.run(["config", "-z", "--get-regexp", REMOTE_URL_KEYS])));
    const remote = remoteName === null ? null : await this.git.run(["remote", "get-url", remoteName]);
    const remoteUrl = remote?.code === 0 ? remote.stdout.toString("utf8").trim() : null;
    const id = await this.git.run(["config", "--get", "spex.repositoryId"]);
    const upstreamRead = await this.git.run(["config", "--get", `branch.${SPEX_BRANCH}.remote`]);
    const upstreamName = upstreamRead.code === 0 ? upstreamRead.stdout.toString("utf8").trim() || null : null;
    this.facts = {
      remote: remoteUrl,
      id: id.code === 0 ? id.stdout.toString("utf8").trim() || null : null,
      remoteName: remoteUrl === null ? null : remoteName,
    };
    this.upstreamName = upstreamName;
    const origin = await this.git.run(["rev-parse", "-q", "--verify", `${this.remoteRef()}^{commit}`]);
    // A clone removed while this read runs — a test's teardown, a Remove —
    // reads as no clone rather than throwing past the reader (space-61).
    const gitDirRead = await this.git.run(["rev-parse", "--git-dir"]);
    if (gitDirRead.code !== 0) return { git: version, root: false };
    const gitDir = resolve(this.dir, gitDirRead.stdout.toString("utf8").trim());
    const mergePending = (await this.git.succeeds(["rev-parse", "-q", "--verify", "MERGE_HEAD"])) || existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"));
    this.mergePending = mergePending;
    return {
      git: version,
      root: true,
      branch: branch.code === 0 ? branch.stdout.toString("utf8").trim() : null,
      head: head.code === 0 ? head.stdout.toString("utf8").trim() : null,
      remote: this.facts.remote,
      id: this.facts.id,
      upstream: upstreamName !== null && upstreamName === this.facts.remoteName,
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
      const counts = await this.git.run(["rev-list", "--left-right", "--count", `HEAD...${this.remoteRef()}`]);
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
    // Its instance (storage-31), whose Git origin its code remote is
    // read against first (space-1).
    const instance = this.owner.cloneInstance(this.key, this.facts.remoteName);
    let code: string | null = null;
    try {
      const project = existsSync(this.repository.projectFile) ? readJsonFile(this.repository.projectFile) as { remote?: unknown } : undefined;
      code = typeof project?.remote === "string" ? this.owner.codeRemoteAsShown(project.remote, instance) : null;
    } catch { code = null; }
    const remote = repo.root ? repo.remote : null;
    const state: RepositoryState = {
      key: this.key,
      instance,
      // The instance governing it is the owner's to read (overlay).
      governing: null,
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
        const merged = await this.git.run(["merge-base", "HEAD", this.remoteRef()]);
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
      // A clone keyed under a signed-out instance waits for its sign-in
      // there; any other reaches an instance by a group picked for it
      // (space-11, space-58, space-61).
      throw new CoreError("invalid_request", this.owner.withoutRemoteRefusal(this));
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
   * reader or a test reaches a host this wave. A remote the reader names
   * is `origin`, replacing one of another name (DR-127). */
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
      const held = this.remoteRef();
      if (!this.publishRemote(repo.remote, url === null ? { url } : { url, id: null, name: "origin" })) {
        throw new CoreError("conflict", changedMeanwhile(splitKey(this.key).name));
      }
      // Another repository's remote clears what the clone holds of the
      // old one and the last sync (space-5): what the old remote held says
      // nothing about the new one. Every change clears the last check.
      if (url !== null) {
        for (const ref of new Set([held, this.remoteRef()])) await this.git.run(["update-ref", "-d", ref]);
        await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
        this.upstreamName = null;
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
      await this.syncBody(repo, choices, input.join === true, input.join === true && input.setUp === true, input.internal === true);
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

  private async syncBody(repo: ReadyRepository, choices: Record<string, StorageChoice>, join: boolean, setUp: boolean, internal: boolean): Promise<void> {
    const op: SpaceOp = "sync";
    let restarts = 0;
    let rechecks = 0;
    let savedCommit: string | null = null;
    // Saves may carry authored changes; only an exact generated-bootstrap
    // tree can make a set-up join automatic (space-59).
    const saves = new Set<string>();
    let pending: Pending | undefined;
    let counts = { sent: 0, received: 0 };
    let upstream = repo.upstream;
    // The host may hand over another URL, after a rename or a transfer,
    // and may answer that this account only reads (space-60, space-61).
    let remote = repo.remote;
    let readOnly = false;
    // The instance the last Check read, which the push goes to
    // (space-12); none for a remote not at an instance.
    let syncsWith: HostInstance | undefined;
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
          const checked = await this.check(remote, "sync", internal);
          remote = checked.remote;
          readOnly = checked.readOnly;
          syncsWith = checked.at;
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
          const pushed = await this.push(remote, upstream, syncsWith);
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
    const packages = specPackageFolders(readStorageTree(this.dir, tree).keys());
    const units = [...new Set(staged.map((file) => storageUnitName(file, packages)))].sort();
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
  private async check(remote: string, op: SpaceOp, internal = false): Promise<{ empty: boolean; readOnly: boolean; at: HostInstance | undefined; remote: string }> {
    const host = await this.owner.hostCheck(this, op, internal);
    const target = host?.remote ?? remote;
    // The remote by its name in the clone, as the host's read left it.
    const name = this.remoteNamed("check");
    // The instance the check read brokers its transport — the clone's,
    // or the one it followed there (git-host-9, space-60).
    const credential = host ? await this.owner.credentialFor(host.instance, target, "check", this) : null;
    const options = { transport: true, ...(credential ? { credential } : {}) };
    try {
      const heads = await this.git.run(["ls-remote", "--exit-code", "--heads", name, `refs/heads/${SPEX_BRANCH}`], options);
      const outcome = { readOnly: host?.readOnly ?? false, at: host?.instance, remote: target };
      if (heads.code === 2) {
        this.remoteEmpty = true;
        this.unrelated = false;
        this.checkedAt = Date.now();
        return { empty: true, ...outcome };
      }
      if (heads.code !== 0) throw new SpaceStopped("check", this.classify(heads, target, host !== undefined));
      const fetched = await this.git.run(["fetch", "-q", "--no-tags", name, `+refs/heads/${SPEX_BRANCH}:${this.remoteRef()}`], options);
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
    const failure = this.owner.withoutHostUrls(classifyHostTransportFailure(run, this.owner.hostNameOf(this)), { remote, id: this.facts.id, remoteName: this.facts.remoteName }, this.key);
    if (failure.cause === "refused") this.hostOverride = { state: "read-only", reason: failure.message };
    if (failure.cause === "gone") this.hostOverride = { state: "unreachable", reason: failure.message };
    return failure;
  }

  /** Give the host's empty repository the default branch it never
   * committed (git-host-7): `main`, one commit of the README the host
   * would have written, made in the object store alone — the clone's
   * working tree, index and refs untouched — with the clone's commit
   * identity, and pushed with the credential `instance` — the one the
   * check reads — brokers. A refusal stops the Check step as any
   * transport's does (space-15). */
  async pushDefaultBranch(remote: string, name: string, instance: HostInstance): Promise<void> {
    const blob = await this.git.ok(["hash-object", "-w", "--stdin"], { input: `# ${name}\n` });
    const tree = await this.git.ok(["mktree"], { input: `100644 blob ${blob}\tREADME.md\n` });
    const commit = await this.git.ok([...(await this.git.committerArgs()), "commit-tree", tree, "-m", "Initial commit"]);
    const remoteName = this.remoteNamed("check");
    const credential = await this.owner.credentialFor(instance, remote, "check", this);
    let run: GitRun;
    try {
      run = await this.git.run(["push", "-q", remoteName, `${commit}:refs/heads/main`], { transport: true, ...(credential ? { credential } : {}) });
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
    const originRef = this.remoteRef();
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
    if (setUpSaves && conflicts.length > 0 && Object.keys(choices).length === 0 && await this.holdsNothingOfItsOwn(head, trees.ours, setUpSaves)) {
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

  /** Whether the saved clone still holds its exact generated bootstrap
   * (space-59). Missing proof asks choices; commit subjects and Saves
   * cannot prove that configuration or environment bytes are unowned. */
  private async holdsNothingOfItsOwn(head: string, saved: StorageTree, saves: ReadonlySet<string>): Promise<boolean> {
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
    const proof = await this.git.run(["config", "--local", "--get", "spex.bootstrap"]);
    const bootstrap = proof.stdout.toString("utf8").trim();
    if (proof.code !== 0 || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(bootstrap)) return false;
    // The recorded bootstrap must be the root beneath this operation's
    // Saves, and every saved byte must still be exactly its generated tree.
    const limit = saves.size + 1;
    const log = (await this.git.ok(["log", "--no-show-signature", "-n", String(limit + 1), "--format=%H", head])).split("\n").filter(Boolean);
    if (log.length > limit || log.at(-1) !== bootstrap || !log.slice(0, -1).every((commit) => saves.has(commit))) return false;
    const trees = (await this.git.ok(["rev-parse", `${head}^{tree}`, `${bootstrap}^{tree}`])).split("\n");
    return trees.length === 2 && trees[0] === trees[1];
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
      if (error instanceof StorageDestinationRefused) throw this.unsafeDestination(error);
      if (error instanceof StorageWriteRefused && error.reason === "lease") throw this.leaseStop(error.unit);
      if (error instanceof StorageWriteRefused && error.reason === "changed") {
        if (error.written.length > 0) await this.reindex(error.written.includes("config/playbook.config.yaml"));
        rmSync(marker, { force: true });
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
    const safe = (): void => {
      try { assertStorageRefreshSafe(this.dir); }
      catch (error) {
        if (error instanceof StorageDestinationRefused) throw this.unsafeDestination(error);
        throw error;
      }
    };
    safe();
    this.refreshProblem = undefined;
    try { await validateStorageTree(this.dir, this.validation()); }
    catch (error) {
      this.refreshProblem = error instanceof StorageFormatError
        ? { file: error.file, reason: error.reason, blocking: true }
        : { file: this.dir, reason: error instanceof Error ? error.message : String(error), blocking: true };
    }
    safe();
    this.host.store.reload();
    if (configChanged) await this.host.reloadConfig();
    safe();
    await this.host.rescanSessions(this.key);
    this.host.ledgerChanged([this.key]);
  }

  /** Step 6 — Push `spex` to the host, setting the upstream once
   * (space-12), with the credential the instance the Check read brokers
   * — `at`, none for a remote not at an instance (git-host-9). */
  private async push(remote: string, upstream: boolean, at: HostInstance | undefined): Promise<"ok" | "nothing" | "rejected"> {
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const name = this.remoteNamed("push");
    const ref = this.remoteRef();
    const origin = await this.git.run(["rev-parse", "-q", "--verify", `${ref}^{commit}`]);
    if (upstream && origin.code === 0 && origin.stdout.toString("utf8").trim() === head) return "nothing";
    const credential = at ? await this.owner.credentialFor(at, remote, "push", this) : null;
    let run: GitRun;
    try {
      // The upstream names the remote by its name in the clone (DR-127).
      run = await this.git.run(upstream ? ["push", "-q", name, SPEX_BRANCH] : ["push", "-q", "-u", name, SPEX_BRANCH], { transport: true, ...(credential ? { credential } : {}) });
    } finally {
      await credential?.dispose();
    }
    if (run.code === 0) {
      // The host now holds `spex`: later plans compare against it.
      this.remoteEmpty = false;
      if (!upstream) this.upstreamName = name;
      await this.git.run(["update-ref", ref, head]);
      return "ok";
    }
    const failure = this.classify(run, remote, at !== undefined);
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

  private unsafeDestination(error: StorageDestinationRefused): SpaceStopped {
    const guidance = i18n._({
      id: "Restore the reported path to its expected file or folder, then Retry. Refresh is deferred; written records and existing repair evidence are kept.",
      comment: "Sync guidance after an unsafe destination refuses Apply or partial refresh",
    });
    this.refreshProblem = { file: join(this.dir, error.file), reason: `${error.reason}. ${guidance}`, blocking: true };
    return new SpaceStopped("apply", { cause: "validation", message: `${error.file}: ${error.reason}`, guidance, retry: true });
  }

  private repairFailed(error: unknown): SpaceStopped {
    this.repairFailure = error instanceof Error ? error.message : String(error);
    if (error instanceof SpaceStopped) return error;
    if (error instanceof StorageDestinationRefused) return this.unsafeDestination(error);
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
    assertStorageRefreshSafe(this.dir);
    try {
      applied = await applyStorageSelection(this.dir, { ours: marker.ours, theirs: marker.theirs, base: marker.base, unrelated: marker.base === EMPTY_TREE, units }, choices, this.writeOptions());
    } catch (error) {
      if (error instanceof StorageWriteRefused && error.reason === "changed") {
        if (error.written.length > 0) assertStorageRefreshSafe(this.dir);
        rmSync(this.markerPath(), { force: true }); return error.written;
      }
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
    let family = spaceFamily(rel, directory);
    if ((family === "Not a Spex folder" || family === "Not a Spex file") && this.inSpecPackage(rel, directory)) family = "spec package";
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

  /** Whether a path is, or lies in, a spec package's folder (space-35,
   * storage-11): a folder below the root, outside Spex's record and
   * ignored folders, holding `meta.yaml`, the outermost where two nest. */
  private inSpecPackage(rel: string, isDirectory: boolean): boolean {
    if (NOT_PACKAGES.test(`${rel}/`)) return false;
    const parts = rel.split("/");
    const root = realPath(this.dir);
    for (let end = 1; end <= (isDirectory ? parts.length : parts.length - 1); end += 1) {
      try { if (lstatSync(join(root, ...parts.slice(0, end), "meta.yaml")).isFile()) return true; } catch { /* none here */ }
    }
    return false;
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

/** One instance the core talks to, known by its canonical origin
 * (git-host intent, DR-127): its own client, which keeps that
 * instance's app token current, refreshes it one at a time and holds
 * that instance's calls through its rate limit, and its own reads —
 * each standing or failing on its own (git-host-5) — for the core's
 * run. */
class HostInstance {
  /** Its last answer (git-host-5), held until its next read. */
  view?: HostView;
  /** Its name and Git origin as last read, kept past a sign-out so a
   * clone there is still known for one. */
  described?: { displayName: string; gitOrigin: string };
  /** Its last read's failure, in the reader's words, until a read of it
   * succeeds (git-host-5). */
  readFailure?: string;
  readState: InstanceState["read"] = { phase: "idle" };
  reading?: Promise<HostView>;
  readingGeneration?: number;
  fullReadBegun = false;
  viewRead = 0;
  failureRead = 0;
  readonly targets = new Map<RepositorySync, TargetReading>();
  /** Bumped at each sign-in, sign-out and host sign-out there: work
   * begun for an earlier account settles without effect. */
  accountGeneration = 0;
  /** Reads of it begun so far, each numbered by this count. */
  readsBegun = 0;
  /** The count of reads begun when this core last changed what it lists
   * — a clone attached to a repository there (git-host-5), or a group
   * created (git-host-15): a read numbered no higher began before, and
   * is made again before it is held. */
  changedAfter = 0;
  /** The repositories clones were attached to since its view's read
   * began, as it answered them, by id: listed until its next read is
   * held (git-host-5). */
  readonly attached = new Map<string, HostListing>();
  /** The groups this core created there since its view's read began, as
   * it answered them, by full path: listed, like `attached`, until its
   * next read is held (git-host-5, git-host-15). */
  readonly created = new Map<string, HostGroup>();
  /** The login of the account it signed this device out of
   * (git-host-4): said on its heading while no flow runs or stands
   * failed (space-3), for the core's run, until its next sign-in. */
  hostSignedOut?: string;
  settingUp?: Promise<void>;
  settingUpGeneration?: number;

  constructor(readonly origin: string, readonly client: GitHostClient) {}

  /** Its folder under `workspace/` (DR-127); null where its origin
   * stands as no folder. */
  folder(): string | null {
    try { return instanceFolder(this.origin); } catch { return null; }
  }

  /** Its Git origin, as its last read or description named it. */
  knownOrigin(): string | undefined {
    return this.view?.gitOrigin ?? this.described?.gitOrigin;
  }
}

/** Every spex repository's machine and the Groups state they make. */
export class SpaceManager {
  private readonly machines = new Map<string, RepositorySync>();
  /** Every instance the core has talked to this run, by canonical
   * origin: one client and one read each (DR-127). */
  private readonly instances = new Map<string, HostInstance>();
  /** Runs Git for the questions no one clone answers. */
  private readonly probe: SpaceGit;
  private publishing?: Promise<void>;
  private republish = false;
  /** The sign-in shown on the header (space-30). */
  private signInState: GroupsState["signIn"] = { phase: "idle" };
  /** Whether the read a signed-in start owes each signed-in instance is
   * still to be begun at a client's first ask for the state
   * (git-host-5): spent on that ask. */
  private startRead = true;
  private flow?: { cancel(): void };
  /** Steps at an instance waiting for a member with the rights
   * (space-64), by the clone's key; asked again at that instance's next
   * read. */
  private readonly waiting = new Map<string, Waiting>();
  /** The progress of joins in flight or stopped, by the instance each
   * joins at and the host's id there (space-63, joinKey) — two Git
   * systems mint one id: each join's own entry, which only it replaces
   * or removes; no join is refused because another runs. */
  private readonly joining = new Map<string, SpaceSyncPhase>();
  /** The set-up step bringing your own group's own repository to an
   * instance (space-4), one at a time across instances, only the earliest
   * signed-in instance in the home's list bringing it: the last begun,
   * which the next waits for. */
  private owning?: Promise<void>;
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

  /** Whether the home is signed in to its default instance. */
  signedIn(): boolean {
    return this.signedInAt(this.defaultInstance());
  }

  /** Whether the home is signed in to an instance (storage-2). */
  private signedInAt(instance: HostInstance): boolean {
    return this.host.store.home.account(instance.origin) !== null;
  }

  /** The name of the instance at an origin, as what the core says of it
   * names it (space-15): a failure relayed from it outside the Groups
   * engine — the registry's token (environments-12). */
  instanceName(origin: string): string {
    return this.nameOf(this.instanceAt(origin));
  }

  /** An instance's name in what the core says of it (space-15): its
   * display name as its last read named it — this run's, else its
   * entry's — else its host name. */
  private nameOf(instance: HostInstance): string {
    const name = instance.view?.displayName ?? instance.described?.displayName ?? this.host.store.home.instance(instance.origin)?.displayName;
    if (name) return name;
    try { return new URL(instance.origin).hostname; } catch { return instance.origin; }
  }

  /** The home's default instance (DR-127). */
  private defaultInstance(): HostInstance {
    return this.instanceAt(this.host.store.home.defaultInstance().origin);
  }

  /** Every instance the home lists, in its order (storage-2). */
  private listedInstances(): HostInstance[] {
    return this.host.store.home.instances().map((entry) => this.instanceAt(entry.origin));
  }

  /** The folder of the home's default instance (DR-127), the one the
   * core still joins, picks and syncs at: the folder its clones lie
   * under and the name its remote takes in a clone; null where the
   * home's recorded URL stands as no instance's origin. */
  instanceFolder(): string | null {
    try { return instanceFolder(this.host.store.home.defaultInstance().origin); } catch { return null; }
  }

  /** A clone's instance by its origin (storage-31, DR-127): the one
   * whose folder its key begins with — an instance the home lists, or
   * the origin it records; else the one an instances migration's
   * deferred entry naming the clone moves it under; else the listed
   * instance whose folder names its remote; null where none does, the
   * clone being local only. */
  cloneInstance(key: string, remoteName: string | null): string | null {
    return this.host.store.cloneInstance(key, remoteName);
  }

  /** The instance at an origin, in any spelling of it (DR-127): the one
   * the core keeps for its run, made with a client of its own at the
   * first ask. */
  private instanceAt(origin: string): HostInstance {
    const key = canonicalOrigin(origin);
    let instance = this.instances.get(key);
    if (!instance) {
      instance = new HostInstance(key, this.host.clientFor(key));
      this.instances.set(key, instance);
    }
    return instance;
  }

  /** A clone's instance (storage-31), as `cloneInstance` reads it from
   * its key and remote as last read; undefined for a clone local only. */
  instanceOfClone(machine: RepositorySync): HostInstance | undefined {
    const origin = this.cloneInstance(machine.key, machine.facts.remoteName);
    return origin === null ? undefined : this.instanceAt(origin);
  }

  /** The instance a clone is at, on whose behalf a transport for it
   * runs (git-host-9): its own (storage-31), else, for a clone at the
   * host its key and remote name no instance for — one an earlier Spex
   * keyed — the default instance, transitional. */
  servingOf(machine: RepositorySync): HostInstance {
    return this.instanceOfClone(machine) ?? this.defaultInstance();
  }

  /** The instance a sync of a clone goes to — its admission, its Check,
   * its calls held by that instance's rate limit and the name its reports
   * give (space-11, space-12, git-host-21, space-15): the one governing it
   * (rowInstance), which a sync follows where it is not the clone's own
   * (space-60), else the one it is at. */
  syncingOf(machine: RepositorySync): HostInstance {
    return this.rowInstance(machine) ?? this.servingOf(machine);
  }

  /** The instance an operation of a clone goes to, signed in there
   * (space-11, space-60): the one governing it (rowInstance); while its
   * own is signed out, another signed-in instance listing it only for a
   * sync — `follows` — which moves the clone there at Check before any
   * transport, every other operation needing its own instance
   * (git-host-9); undefined where none serves. */
  private syncsWith(machine: RepositorySync, follows: boolean): HostInstance | undefined {
    const instance = this.rowInstance(machine);
    const own = this.instanceOfClone(machine);
    return !follows && own !== undefined && instance !== own ? undefined : instance;
  }

  /** The instance governing a clone's spex repository (git-host-5): its
   * own (storage-31) while signed in there, alone deciding its row and
   * the group it stands under, its read-only state, its unlisting, its
   * members and what the person may do on it, whatever other instance
   * lists it; while its own is signed out, or it has none, the earliest
   * signed-in instance in the home's list whose view lists the same host
   * repository by its Git origin and id, which its next sync follows
   * (space-60); undefined where none does. */
  governingOf(machine: RepositorySync): HostInstance | undefined {
    const own = this.instanceOfClone(machine);
    if (own && this.signedInAt(own)) return own;
    const facts = machine.facts;
    if (facts.remote === null) return undefined;
    return this.listedInstances().find((instance) => instance !== own && this.signedInAt(instance) && this.listingOf(instance, facts) !== undefined);
  }

  /** The instance a clone's row and commands read (space-61, space-29):
   * the one governing it, else, transitional as servingOf, a clone no
   * instance holds at the default instance while it is signed in;
   * undefined where its instance is signed out and no signed-in instance
   * lists it. */
  private rowInstance(machine: RepositorySync): HostInstance | undefined {
    const governing = this.governingOf(machine);
    if (governing) return governing;
    const serving = this.servingOf(machine);
    return this.instanceOfClone(machine) === undefined && this.signedInAt(serving) ? serving : undefined;
  }

  /** The clones whose last answers an instance gave (git-host-5): those
   * at it, and those it governs, their own instance signed out. */
  private answeredBy(instance: HostInstance): RepositorySync[] {
    return [...this.machines.values()].filter((machine) => this.servingOf(machine) === instance || this.rowInstance(machine) === instance);
  }

  /** The key of a join's progress (space-63): the instance it joins at
   * and the host's id there. */
  private joinKey(instance: HostInstance, id: string): string {
    return `${instance.origin} ${id}`;
  }

  /** Whether a join's progress, by its key (joinKey), is of a join at
   * that instance. */
  private joinedAt(key: string, instance: HostInstance): boolean {
    return key.startsWith(`${instance.origin} `);
  }

  /** The name of the instance a clone syncs with, as a report prints it
   * (space-15). */
  hostNameOf(machine: RepositorySync): string {
    return this.nameOf(this.syncingOf(machine));
  }

  /** The instance a spex repository's key lies under (storage-31), by
   * its folder: an instance the home lists, or the origin it records;
   * none for a key in your own group's folder. */
  private instanceOfKey(key: string): HostInstance | undefined {
    const entry = this.host.store.home.instanceOfKey(key);
    return entry ? this.instanceAt(entry.origin) : undefined;
  }

  /** The origin of a spex repository's instance (storage-31), its
   * clone's remote read at this instant: the instance of a project's
   * records — its intents' author's (core-service-42); null where it has
   * none. */
  instanceOriginOf(key: string): string | null {
    // A key under an instance's folder names it with no read of the
    // clone: asked at every settle of an environment (environments-5).
    const byKey = this.host.store.home.instanceOfKey(key);
    if (byKey) return byKey.origin;
    if (!this.host.store.repository(key)) return this.cloneInstance(key, null);
    let remoteName: string | null;
    try { remoteName = this.machine(key).remoteNameNow(); } catch { remoteName = null; }
    return this.cloneInstance(key, remoteName);
  }

  /** Why a clone with no remote is refused a sync (space-11): its
   * instance signed out, by that instance's name; any other — a clone no
   * instance holds, or one keyed under a signed-in instance before the
   * host has it — a group to pick. */
  withoutRemoteRefusal(machine: RepositorySync): string {
    const instance = this.instanceOfClone(machine);
    return instance && !this.signedInAt(instance) ? signInTo(this.nameOf(instance)) : pickAGroupFirst();
  }

  /** The access secret a client of an instance outside the core presents
   * there — the registry (environments-12) — kept current by that
   * instance's own client (git-host-4); null where this device holds no
   * app token for it, or it refused the refresh. */
  accessSecretFor(origin: string): Promise<string | null> {
    return this.instanceAt(origin).client.accessSecret();
  }

  /** The registry of a listed instance refused the access secret a call
   * presented there with a code that signs the device out
   * (environments-12): that instance alone is signed out where the pair
   * that presented it is still the stored one, its client saying so as
   * a refusal of a host call does (git-host-4); where another pair
   * replaced it meanwhile, nothing is signed out and `CredentialChanged`
   * is thrown, the call refused as changed meanwhile. An origin the home
   * does not list holds no pair, and nothing is done. */
  async registryRefused(origin: string, access: string): Promise<void> {
    if (this.host.store.home.instance(origin) === undefined) return;
    if (!(await this.instanceAt(origin).client.signOutRefused(access))) throw new CredentialChanged();
  }

  /** The origins of every instance the home lists, in its order, then of
   * the one a running sign-in names where none is listed there: the
   * origins whose pages a shell may open (app-shell-37). */
  instanceOrigins(): string[] {
    const origins = this.host.store.home.instances().map((entry) => entry.origin);
    const signingIn = this.signInState.phase === "running" ? this.signInState.instance : null;
    return signingIn !== null && !origins.includes(signingIn) ? [...origins, signingIn] : origins;
  }

  /** The instance a command names by its origin (space-29), in any
   * spelling of it: one the home does not list refused `not_found`. */
  namedInstance(origin: string): string {
    const listed = this.host.store.home.instance(origin);
    if (!listed) throw new CoreError("not_found", noSuchInstance(origin));
    return listed.origin;
  }

  /** The key a host repository's clone takes (DR-127): its path in the
   * instance, under the instance's folder — the default instance's
   * where none is named; null where that path cannot stand as folders
   * on this device, or the instance has no folder. */
  private keyAtHost(repository: HostRepository, instance: HostInstance = this.defaultInstance()): string | null {
    const folder = instance.folder();
    return folder === null ? null : hostKey(repository, folder);
  }

  /** A clone's commit identity (space-32): where its instance is signed
   * in, the account's display name or login there, at that instance's
   * no-reply address — while its own is signed out, the account at the
   * instance governing it, whose sync follows that one (space-60); none
   * for a clone not at the host, nor while no signed-in instance serves
   * it, where Git's own or the fallback serves. */
  identityFor(machine: RepositorySync): { name: string; email: string } | null {
    const at = this.instanceOfClone(machine) !== undefined || this.atHost(machine.facts, this.servingOf(machine));
    const instance = at ? this.rowInstance(machine) : undefined;
    const account = instance ? this.host.store.home.account(instance.origin) : null;
    if (!instance || !account) return null;
    let domain: string;
    try { domain = new URL(instance.origin).hostname; } catch { domain = "localhost"; }
    return { name: account.displayName || account.login, email: `${account.login}@users.noreply.${domain}` };
  }

  /** The instances whose Git origins a remote is read against
   * (git-host-5): the home's default instance, then every other it
   * lists, in its order. */
  private reportingInstances(): HostInstance[] {
    const first = this.defaultInstance();
    return [first, ...this.listedInstances().filter((instance) => instance !== first)];
  }

  /** Whether the home's default instance and every instance it lists
   * have reported their Git origin (git-host-5), as a read or a
   * description named it for the core's run. */
  private originsReported(): boolean {
    return this.reportingInstances().every((instance) => instance.knownOrigin() !== undefined);
  }

  /** Whether a remote lies under an instance's reported Git origin
   * (git-host-5) — presentation only: an HTTP URL is recognized whatever
   * its spelling or embedded user, while credential matching keeps its
   * exact-origin rule (credentialFor). */
  private reportedUnder(remote: string, instance: HostInstance): boolean {
    const normalized = (value: string): string => {
      try {
        const url = new URL(value);
        if (url.protocol === "http:" || url.protocol === "https:") {
          url.username = ""; url.password = "";
          return url.href.replace(/\/$/, "");
        }
      } catch { /* local paths and SSH forms retain their spelling */ }
      return value;
    };
    const origin = instance.knownOrigin();
    return origin !== undefined && underOrigin(normalized(remote), normalized(origin));
  }

  /** The home's default instance and every other it lists, in its
   * order, the instance at `preferred` moved first where it names one. */
  private preferring(preferred: string | null): HostInstance[] {
    const instances = this.reportingInstances();
    if (preferred === null) return instances;
    const first = this.instanceAt(preferred);
    return [first, ...instances.filter((instance) => instance !== first)];
  }

  /** The first instance, as `preferring` orders them, under whose
   * reported Git origin a remote lies (git-host-5); undefined where none
   * reports one it lies under. */
  private reportingUnder(remote: string, preferred: string | null): HostInstance | undefined {
    return this.preferring(preferred).find((instance) => this.reportedUnder(remote, instance));
  }

  /** A project's code remote on its row (space-1): "Code on a remote"
   * until the default instance and every instance the home lists have
   * reported their Git origin, then "Code on this instance" under the
   * Git origin of the row's instance — `origin`, the default instance
   * where it is null — "Code on a remote" under another listed
   * instance's, and the remote as the reader set it, with no user in an
   * http(s) URL, under none of them (DR-120, DR-127). Its transport URL
   * and project file stay as given. */
  codeRemoteAsShown(remote: string, origin: string | null): string {
    const kind = this.originsReported() ? this.codeRemoteKind(remote, origin) : "unknown";
    if (kind === "unknown" || kind === "remote") return i18n._({ id: "Code on a remote", comment: "Where a project's code lives before every instance has reported its Git origin, or when its remote lies under another instance's; the actual remote is withheld" });
    return kind === "instance"
      ? i18n._({ id: "Code on this instance", comment: "Where a project's code lives when its remote is under the instance's reported Git origin; the Git system behind the instance is never named" })
      : displayRemote(remote);
  }

  /** How a project's code remote reads against the Git origins already
   * reported (projects-7, projects-36), with no read of any instance and
   * no inferred origin (DR-120, DR-127): "instance" under the reported
   * Git origin of the project's instance — `origin`, its spex
   * repository's, the default instance where it is null; "unknown"
   * otherwise while the default instance or an instance the home lists
   * has not reported its Git origin; "remote" under another listed
   * instance's; "external" under none. */
  codeRemoteKind(remote: string, origin: string | null): "unknown" | "instance" | "remote" | "external" {
    const own = origin === null ? this.defaultInstance() : this.instanceAt(origin);
    if (this.reportedUnder(remote, own)) return "instance";
    if (!this.originsReported()) return "unknown";
    return this.reportingInstances().some((instance) => instance !== own && this.reportedUnder(remote, instance)) ? "remote" : "external";
  }

  private packageExternalRemote(remote: string): string {
    try {
      const url = new URL(remote);
      if (url.protocol === "http:" || url.protocol === "https:") {
        url.username = ""; url.password = "";
        return url.href;
      }
    } catch { /* malformed authority: withhold every user segment */ }
    return /^https?:\/\//i.test(remote) ? remoteHost(null) : remote;
  }

  private packageSourceLocal(remote: string): boolean {
    return isAbsolute(remote) || /^file:/i.test(remote)
      || (!/^[a-z][a-z0-9+.-]*:\/\//i.test(remote) && !/^[^/\\]+:/.test(remote));
  }

  /** Package-source presentation uses only facts already read
   * (environments-29): a local path stays as given; a network locator
   * reads as the display name of an instance under whose reported Git
   * origin it lies — `preferred` first, then the earliest in the home's
   * list — as the external remote under none, and as an unnamed remote
   * while the default instance or an instance the home lists has not
   * reported its origin. */
  packageSourceAsShown(remote: string, preferred: string | null = null): string {
    if (this.packageSourceLocal(remote)) return remote;
    const at = this.reportingUnder(remote, preferred);
    if (at) return this.nameOf(at);
    return this.originsReported() ? this.packageExternalRemote(remote) : remoteHost(null);
  }

  /** Generated Git failures never publish unknown or backing-host
   * stderr. External failures keep useful, credential-free Git detail;
   * no URL under any instance's Git origin is said (environments-29). */
  packageSourceFailure(remote: string, run: GitRun, preferred: string | null = null): string {
    const shown = this.packageSourceAsShown(remote, preferred);
    const local = this.packageSourceLocal(remote);
    const at = local ? undefined : this.reportingUnder(remote, preferred);
    const unknown = !local && at === undefined && !this.originsReported();
    const status = /returned error: (\d{3})|RPC failed; HTTP (\d{3})|HTTP (\d{3})/i.exec(run.stderr);
    const generic = status
      ? i18n._("{host} answered with an error (HTTP {status})", { host: shown, status: status[1] ?? status[2] ?? status[3] })
      : i18n._({ id: "{host} answered with an error", comment: "A package Git source failed without a recognized status; raw backing-host or unclassified stderr stays inside the core", values: { host: shown } });
    if (unknown) {
      return `${generic} ${i18n._("Check the connection, then Retry.")}`;
    }
    const failure = at
      ? classifyHostTransportFailure({ ...run, stderr: run.stderr.replace(/^\s*remote:.*$/gm, "") }, shown)
      : classifyTransportFailure(run, this.packageExternalRemote(remote));
    const message = at && failure.cause === "git" ? generic : failure.message;
    const text = this.preferring(preferred).reduce(
      (out, instance) => withoutHostUrls(out, { origin: instance.knownOrigin(), host: this.nameOf(instance), instance: instance.origin }),
      `${message} ${failure.guidance}`.split(remote).join(this.packageExternalRemote(remote)),
    );
    return text.replace(/https?:\/\/[^\s'"<>]+/gi, (url) => this.packageExternalRemote(url));
  }

  // -- the instance's names (space-1, space-15, git-host-5, DR-120) ---------

  /** The listing a clone stands for in an instance's current view, or
   * among what this core attached there since its read began
   * (git-host-5). */
  private listingOf(instance: HostInstance, facts: RemoteFacts): HostListing | undefined {
    const target = this.targetOf(instance, facts);
    if (target && !target.failure) return target.listing;
    return listingFor(instance.view, facts.id, facts.remote) ?? listingFor(this.attachedAt(instance), facts.id, facts.remote);
  }

  /** What this core attached at an instance since its view's read began
   * (git-host-5), read as a view of that instance, with its Git origin. */
  private attachedAt(instance: HostInstance): Pick<HostView, "listings" | "gitOrigin"> {
    return { listings: [...instance.attached.values()], gitOrigin: instance.knownOrigin() ?? "" };
  }

  /** An instance's current view while it is signed in (git-host-5). */
  private viewOf(instance: HostInstance): HostView | undefined {
    return this.signedInAt(instance) ? instance.view : undefined;
  }

  /** Whether a listed group is held as colliding in a view of its
   * instance (git-host-5, DR-127): its path is a login that instance
   * names — your login there, or another under which it lists a spex
   * repository — or lies beneath one; so a group collides within its own
   * instance alone, and never with your own group's folder. */
  private collides(group: Pick<HostGroup, "kind" | "fullPath"> | undefined, view: HostView | HostCatalog | undefined): boolean {
    if (!group || !view) return false;
    return collidingGroup(group, namedLogins(view));
  }

  /** The instance a clone's lines and remote are read for, by its key
   * and remote's name (storage-31), the default instance where they name
   * none, as `servingOf` reads a machine's. */
  private servingAt(key: string, facts: RemoteFacts): HostInstance {
    const origin = this.cloneInstance(key, facts.remoteName ?? null);
    return origin === null ? this.defaultInstance() : this.instanceAt(origin);
  }

  /** The rules of space-15 for one clone, one per instance, the clone's
   * own first, then every other the home lists in its order: its own
   * remote reads as its path in its instance — as that instance's
   * listing names it, else its key without its instance's folder
   * (DR-127) — and any other URL under an instance's Git origin as that
   * instance's name, the clone's own instance's where several report one
   * origin. */
  private urlRules(facts: RemoteFacts, key: string): Parameters<typeof withoutHostUrls>[1][] {
    const own = this.servingAt(key, facts);
    const listing = facts.remote === null ? undefined : this.listingOf(own, facts);
    const segment = instanceSegmentOf(key);
    const path = listing ? `${listing.repository.group.fullPath}/${listing.repository.path}` : segment === null ? key : key.slice(segment.length + 1);
    return [own, ...this.listedInstances().filter((instance) => instance !== own)].map((instance, index) => ({
      origin: instance.knownOrigin() ?? null,
      host: this.nameOf(instance),
      instance: instance.origin,
      own: index === 0 && facts.remote !== null ? { remote: facts.remote, path } : null,
    }));
  }

  /** A stopped step's lines with no URL under any instance's Git origin
   * (space-15, space-32). */
  withoutHostUrls(failure: GitFailure, facts: RemoteFacts, key: string): GitFailure {
    const rules = this.urlRules(facts, key);
    const clean = (text: string): string => rules.reduce((out, rule) => withoutHostUrls(out, rule), text);
    return { ...failure, message: clean(failure.message), guidance: clean(failure.guidance) };
  }

  /** A clone's remote as the state carries it (space-30): one at the
   * host as the repository's path in its instance, any other as the
   * reader set it, with no user in an http(s) URL. */
  private remoteAsShown(facts: RemoteFacts, key: string): string | null {
    if (facts.remote === null) return null;
    const remote = facts.remote;
    const own = this.servingAt(key, facts);
    const under = (instance: HostInstance): boolean => underOrigin(remote, instance.origin) || underOrigin(remote, instance.knownOrigin());
    if (!this.atHost(facts, own) && !under(own) && !this.listedInstances().some(under)) return displayRemote(remote);
    return this.urlRules(facts, key)[0].own?.path ?? key;
  }

  /** The Git origin an instance's credentials are valid for
   * (git-host-9): as its last read named it, else asked of it — a call
   * needing no token — and kept as a read's is; undefined where it
   * cannot say. */
  async gitOriginOf(origin: string): Promise<string | undefined> {
    const instance = this.instanceAt(origin);
    const known = instance.knownOrigin();
    if (known) return known;
    try {
      const described = await instance.client.describe();
      if (!described.gitOrigin) return undefined;
      instance.described = { displayName: described.displayName, gitOrigin: described.gitOrigin };
      return described.gitOrigin;
    } catch {
      return undefined;
    }
  }

  /** The brokered credential for a Git source (environments-13,
   * git-host-9), asked each time of an instance the home is signed in to
   * at whose Git origin the source lies — `preferred` first where it is
   * one, then the default instance and every other the home lists in its
   * order; none for a source at the Git origin of no signed-in instance,
   * where this device's own Git fetches it. A refusal reads as that
   * instance said. */
  async sourceCredential(repo: string, preferred: string | null = null): Promise<{ username: string; secret: string } | undefined> {
    for (const instance of this.preferring(preferred)) {
      if (!this.signedInAt(instance)) continue;
      const origin = await this.gitOriginOf(instance.origin);
      if (!origin || !underOrigin(repo, origin)) continue;
      try {
        const credential = await instance.client.credential(origin);
        return { username: credential.username, secret: credential.secret };
      } catch (error) {
        throw new Error(relayHostError(error, this.nameOf(instance)));
      }
    }
    return undefined;
  }

  /** Whether a clone lies at its instance (git-host-9): it records the
   * host's id, or its remote is under that instance's Git origin. */
  private atHost(facts: RemoteFacts, instance: HostInstance): boolean {
    return facts.remote !== null && (facts.id !== null || underOrigin(facts.remote, instance.knownOrigin()));
  }

  /** Whether a URL the reader names lies under an instance's own origin
   * or its Git origin — the default instance's or any the home lists
   * (space-5, space-29): those are an instance's to hand over. */
  async atHostOrigin(url: string): Promise<boolean> {
    return [this.defaultInstance(), ...this.listedInstances()].some((instance) => underOrigin(url, instance.knownOrigin()) || underOrigin(url, instance.origin));
  }

  /** The origin a sign-in names (git-host-2, storage-2): the canonical
   * origin of `url`, a URL the origin rule refuses — and a new origin at
   * the folder of an instance the home lists — refused `invalid_request`
   * naming the rule, before anything listens or any instance is asked. */
  private signInOrigin(url: string): string {
    const home = this.host.store.home;
    let origin: string;
    try { origin = parseOrigin(url).origin; }
    catch (error) {
      if (error instanceof OriginRefused) throw new CoreError("invalid_request", originRuleRefusal(error.reason));
      throw error;
    }
    if (!home.instance(origin)) {
      const folder = instanceFolder(origin);
      const listed = home.instances().find((entry) => instanceFolder(entry.origin) === folder);
      if (listed) throw new CoreError("invalid_request", sameFolderRefusal(listed.origin));
    }
    return origin;
  }

  /** Start the configured sign-in flow at the instance `url` names, by
   * its origin (git-host-2, git-host-3): its shape goes back at once, and
   * its end sets the home up for the account there (space-4). At most
   * one sign-in runs, whichever instance it names. */
  async signInStart(url: string): Promise<{ flow: "browser"; url: string } | { flow: "device"; userCode: string; verificationUri: string; expiresAt: number }> {
    const origin = this.signInOrigin(url);
    if (this.flow || this.signInState.phase === "running" || [...this.instances.values()].some((entry) => entry.client.signingIn())) {
      throw new CoreError("busy", signInRunning());
    }
    const instance = this.instanceAt(origin);
    const client = instance.client;
    const kind = this.host.signInFlow;
    const admit = (account: HostAccount): HostError | null => this.admitAccount(origin, account);
    let started: { kind: "browser"; flow: BrowserSignIn } | { kind: "device"; flow: DeviceSignIn };
    try {
      started = kind === "browser"
        ? { kind, flow: await client.startBrowserSignIn({ pages: callbackPages(), admit }) }
        : { kind, flow: await client.startDeviceSignIn({ admit }) };
    } catch (error) {
      if (error instanceof SignInBusyError) throw new CoreError("busy", signInRunning());
      const failure = signInFailure(error, this.nameOf(instance));
      this.signInState = failure ? { phase: "failed", instance: origin, ...failure } : { phase: "idle" };
      void this.publish();
      throw new CoreError("invalid_request", failure?.message ?? relayHostError(error, this.nameOf(instance)));
    }
    const flow = started.flow;
    this.flow = flow;
    // The flow names the origin it signs in to (space-30).
    this.signInState = started.kind === "browser"
      ? { phase: "running", instance: origin, flow: "browser", since: Date.now() }
      : { phase: "running", instance: origin, flow: "device", userCode: started.flow.userCode, verificationUri: started.flow.verificationUri, since: Date.now() };
    void this.publish();
    void flow.done.then(
      (account) => this.signedInAs(origin, account),
      (error: unknown) => this.signInEnded(origin, error),
    );
    return started.kind === "browser"
      ? { flow: "browser", url: started.flow.url }
      : { flow: "device", userCode: started.flow.userCode, verificationUri: started.flow.verificationUri, expiresAt: started.flow.expiresAt };
  }

  /** Whether a sign-in's person may stand as the account of the
   * instance it signs in to (git-host-2): at a listed instance, only
   * its entry's account, read from `home.yaml` in the turn that would
   * store the token; another is refused naming the entry's login, so
   * nothing is stored and the home stays as it stood. */
  private admitAccount(origin: string, account: HostAccount): HostError | null {
    let listed: HomeAccount | undefined;
    try { listed = this.host.store.home.instance(origin)?.account; }
    catch { return null; }
    return listed && listed.id !== account.id ? anotherAccountError(listed.login) : null;
  }

  /** Stop the running sign-in; false where none runs. */
  signInCancel(): boolean {
    const flow = this.flow;
    if (!flow) return false;
    flow.cancel();
    return true;
  }

  /** A sign-in's token is stored (git-host-2): its account is written
   * into that origin's entry — appended after the listed ones where none
   * stands, signed in again where one does — and the home is set up for
   * it there (space-4), that instance's earlier work and view ended and
   * every other instance's left as they stand (git-host-5). */
  private async signedInAs(origin: string, account: HostAccount): Promise<void> {
    this.flow = undefined;
    try {
      this.host.store.signIn(origin, account);
      const instance = this.instanceAt(origin);
      instance.accountGeneration += 1;
      instance.hostSignedOut = undefined;
      instance.view = undefined;
      instance.targets.clear();
      this.releaseHeld(instance);
      instance.readFailure = undefined;
      instance.readState = { phase: "idle" };
      await this.publish();
      await this.setUp(instance);
    } catch (error) {
      console.error(`spex: setting the home up for the account failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.signInState = { phase: "idle" };
      await this.publish();
    }
  }

  private signInEnded(origin: string, error: unknown): void {
    this.flow = undefined;
    const failure = signInFailure(error, this.nameOf(this.instanceAt(origin)));
    this.signInState = failure ? { phase: "failed", instance: origin, ...failure } : { phase: "idle" };
    void this.publish();
  }

  /** An instance signed this device out (git-host-4): its credential is
   * gone, its account kept and marked signed out, its view dropped, and
   * its heading says it did it, naming the account's login (space-3);
   * every other instance's entry, token and view untouched. */
  signedOutByHost(origin: string): void {
    const store = this.host.store;
    const instance = this.instanceAt(origin);
    const account = store.home.account(instance.origin);
    if (account) instance.hostSignedOut = account.login;
    // Its clones' last answers are its own, and so are those of the
    // clones it governs: another instance governing one meanwhile reads
    // it afresh (git-host-5).
    const answered = this.answeredBy(instance);
    store.signOut(instance.origin);
    instance.readState = { phase: "idle" };
    instance.accountGeneration += 1;
    instance.view = undefined;
    instance.targets.clear();
    this.releaseHeld(instance);
    for (const machine of answered) machine.hostOverride = undefined;
    void this.publish();
  }

  /** Sign out of the instance a command names (git-host-10): revoke
   * there, tried once, forget its credential, keep every clone and
   * record and every other instance's sign-in. Its entry is marked
   * signed out in the same turn as the removal; a pair stored in its
   * place meanwhile stays, and the account with it. One signed out
   * already is refused, its sign-out mark and its waiting steps kept
   * (space-29). */
  async signOut(named: string): Promise<GroupsState> {
    const instance = this.instanceAt(this.namedInstance(named));
    if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
    if (this.signInState.phase === "running" && this.signInState.instance === instance.origin) this.flow?.cancel();
    try {
      await instance.client.signOut(() => {
        const answered = this.answeredBy(instance);
        this.host.store.signOut(instance.origin);
        instance.accountGeneration += 1;
        instance.hostSignedOut = undefined;
        instance.view = undefined;
        instance.targets.clear();
        this.releaseHeld(instance);
        instance.readFailure = undefined;
        instance.readState = { phase: "idle" };
        for (const [key, waiting] of [...this.waiting]) if (waiting.instance === instance.origin) this.waiting.delete(key);
        // Its own stopped joins go, every other instance's stand; a join
        // still running keeps its progress, its transport holding its own
        // brokered credential or stopping asking to sign in (space-15).
        for (const [key, phase] of [...this.joining]) if (this.joinedAt(key, instance) && phase.phase !== "running") this.joining.delete(key);
        for (const machine of answered) machine.hostOverride = undefined;
      });
    } catch (error) {
      if (error instanceof CredentialChanged) throw new CoreError("conflict", relayHostError(error, this.nameOf(instance)));
      throw error;
    }
    const state = await this.state();
    this.host.broadcast(state);
    return state;
  }

  /**
   * Forget a signed-out instance the command names (space-82), in order:
   * each clone whose instance it is, other than your own group's own
   * repository, follows the signed-in instance governing it — the
   * earliest in the home's list whose view lists the host repository it
   * records (git-host-5) — re-keyed under that instance's folder with
   * its remote renamed, as a sync's move makes it follow (space-60);
   * where any such clone is left — listed by no signed-in instance, or
   * its follow refused by a session's lease beneath — Forget is refused
   * naming each, the instance kept with every follow already made; then
   * your own group's own repository, where that instance is its own,
   * renames its remote to the folder of the signed-in instance governing
   * it, else its remote is taken away, its id and what it fetched kept
   * (space-5); last, the instance's entry leaves `home.yaml`
   * (storage-2), and with it what this run held of its account. One
   * still signed in is refused, and one the home does not list
   * `not_found` (space-29).
   */
  async forget(named: string): Promise<GroupsState> {
    const store = this.host.store;
    const instance = this.instanceAt(this.namedInstance(named));
    if (this.signedInAt(instance)) throw new CoreError("invalid_request", signOutFirst(this.nameOf(instance)));
    const identity = await this.machineIdentity();
    const own = store.home.own();
    const kept: string[] = [];
    const inUse: string[] = [];
    for (const repository of store.listRepositories()) {
      if (repository.key === own) continue;
      const outcome = await this.followAtForget(instance, repository.key, identity);
      if (outcome === "kept") kept.push(splitKey(repository.key).name);
      else if (outcome !== "followed" && outcome !== "other") inUse.push(outcome.inUse);
    }
    if (kept.length > 0 || inUse.length > 0) {
      await this.publish();
      const reasons = [...(kept.length > 0 ? [stillKeptUnder(this.nameOf(instance), kept)] : []), ...inUse];
      throw new CoreError("invalid_request", reasons.join(" · "));
    }
    if (store.repository(own)) {
      const machine = this.machine(own);
      await machine.readFacts();
      if (this.instanceOfClone(machine) === instance) {
        // Nothing is awaited from the governing instance's choice to the
        // remote's rename.
        const governing = this.governingOf(machine);
        const folder = governing && governing !== instance ? governing.folder() : null;
        if (folder !== null) machine.renameRemote(machine.remoteNameNow(), folder);
        else await machine.setRemote(null);
      }
    }
    try { store.forget(instance.origin); }
    catch (error) {
      // Signed in again meanwhile, it stays.
      if (error instanceof InstanceRefused) throw new CoreError("invalid_request", signOutFirst(this.nameOf(instance)));
      throw error;
    }
    instance.accountGeneration += 1;
    instance.hostSignedOut = undefined;
    instance.view = undefined;
    instance.targets.clear();
    this.releaseHeld(instance);
    instance.readFailure = undefined;
    instance.readState = { phase: "idle" };
    for (const [key, waiting] of [...this.waiting]) if (waiting.instance === instance.origin) this.waiting.delete(key);
    for (const key of [...this.joining.keys()]) if (this.joinedAt(key, instance)) this.joining.delete(key);
    const state = await this.state();
    this.host.broadcast(state);
    return state;
  }

  /**
   * One clone's follow at a Forget of its instance (space-82): to the
   * signed-in instance governing it (git-host-5), at the path that
   * instance's view lists the host repository it records, by one rename
   * at its instant (renameClone), its remote renamed to that instance's
   * folder and the host's id recorded beside it, as a sync's move makes
   * it follow (space-60, storage-34). "other" for a clone of another
   * instance or none; "kept" where it stays of this one — no signed-in
   * instance listing it, its path standing as no key there or in a group
   * held as colliding, a destination taken, or its remote changed
   * meanwhile; the session's words where a lease beneath holds it.
   */
  private async followAtForget(instance: HostInstance, key: string, identity: string | undefined): Promise<"other" | "followed" | "kept" | { inUse: string }> {
    const store = this.host.store;
    if (!store.repository(key)) return "other";
    const machine = this.machine(key);
    try { await machine.readFacts(); } catch { return this.instanceOfClone(machine) === instance ? "kept" : "other"; }
    // Nothing is awaited from here to the rename: the clone lies where
    // the home says, with the remote and id just read.
    const from = machine.key;
    const source = machine.repository.dir;
    if (store.repository(from)?.dir !== source) return "other";
    if (this.instanceOfClone(machine) !== instance) return "other";
    const facts = machine.facts;
    const governing = this.governingOf(machine);
    if (!governing || governing === instance || facts.remote === null) return "kept";
    const listing = this.listingOf(governing, facts);
    const to = listing ? this.keyAtHost(listing.repository, governing) : null;
    const folder = governing.folder();
    if (!listing || !to || to === from || folder === null || this.collides(listing.repository.group, this.viewOf(governing))) return "kept";
    if (facts.id === null) machine.recordId(listing.repository.id, facts.remote);
    if (!machine.recordsNow(facts.remote, listing.repository.id)) return "kept";
    const named = machine.remoteNameNow();
    try { this.renameClone(machine, to, identity); }
    catch (error) {
      if (error instanceof SpaceStopped && error.failure.cause === "lease") return { inUse: error.failure.message };
      if (error instanceof SpaceStopped) return "kept";
      throw error;
    }
    machine.renameRemote(named, folder);
    await this.afterMove([{ from, to }]);
    return "followed";
  }

  /** Refresh (space-2): read every signed-in instance, each on its own,
   * and finish what a sign-in there left for its next read (space-4,
   * space-64); refused where none is signed in (space-29). */
  refresh(): { accepted: true } {
    const signedIn = this.listedInstances().filter((instance) => this.signedInAt(instance));
    if (signedIn.length === 0) throw new CoreError("invalid_request", signInFirst());
    for (const instance of signedIn) {
      void this.setUp(instance).catch((error: unknown) => {
        console.error(`spex: refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    return { accepted: true };
  }

  private failRead(instance: HostInstance, error: unknown, generation: number): void {
    if (generation !== instance.accountGeneration || !this.signedInAt(instance)) return;
    instance.readState = {
      phase: "failed",
      message: error instanceof HostError || error instanceof CredentialChanged ? relayHostError(error, this.nameOf(instance)) : i18n._({
        id: "Could not refresh groups; try again",
        comment: "An unexpected local failure stopped Refresh; technical details stay in diagnostics",
      }),
    };
  }

  /** The account's set-up at an instance, in order (space-4): your own
   * group renamed after the login, that instance read, your own group's
   * spex repository there where it has no remote, and every step left
   * waiting there asked again. */
  private setUp(instance: HostInstance): Promise<void> {
    const generation = instance.accountGeneration;
    if (instance.settingUp && instance.settingUpGeneration === generation) return instance.settingUp;
    const previous = instance.settingUp;
    instance.readState = { phase: "running" };
    const work = (async () => {
      // Accepted Refresh work is visible before the existing rename/read awaits.
      await this.publish();
      await previous?.catch(() => undefined);
      if (generation !== instance.accountGeneration || !this.signedInAt(instance)) return;
      await this.runSetUp(instance, generation);
    })().catch((error: unknown) => {
      this.failRead(instance, error, generation);
      throw error;
    }).finally(async () => {
      if (instance.settingUp === work) { instance.settingUp = undefined; instance.settingUpGeneration = undefined; }
      if (generation === instance.accountGeneration && instance.readState.phase === "running") instance.readState = { phase: "idle" };
      try { await this.publish(); }
      catch (error) { this.failRead(instance, error, generation); throw error; }
    });
    instance.settingUp = work;
    instance.settingUpGeneration = generation;
    return work;
  }

  private async runSetUp(instance: HostInstance, generation: number): Promise<void> {
    const account = this.host.store.home.account(instance.origin);
    if (!account) return;
    const renamed = await this.renameOwn(account, instance, generation);
    if (generation !== instance.accountGeneration) return;
    let view: HostView;
    try { view = await this.readHost(instance); } catch { return; }
    if (generation !== instance.accountGeneration) return;
    // On a seat your own group stays on the server: nothing is created
    // or joined for it at any instance (space-102).
    if (renamed !== "conflict" && !this.host.seat) await this.ensureOwn(instance, view, generation);
    if (generation !== instance.accountGeneration) return;
    await this.retryWaiting(instance, view);
    await this.publish();
  }

  /** What this core attached or created at an instance since its view's
   * read began stops counting as listed: the view held now, or none,
   * says (git-host-5). */
  private releaseHeld(instance: HostInstance): void {
    instance.attached.clear();
    instance.created.clear();
  }

  /** The groups a view of an instance lists, with those this core
   * created there since its read began, which count as listed until its
   * next read is held (git-host-5, git-host-15). */
  private listedGroups(instance: HostInstance, view: Pick<HostView, "groups"> | undefined): HostGroup[] {
    const groups = view?.groups ?? [];
    const held = [...instance.created.values()].filter((group) => !groups.some((entry) => entry.fullPath === group.fullPath || (group.id !== null && entry.id === group.id)));
    return [...groups, ...held];
  }

  /** Read an instance — the default instance where none is named
   * (git-host-5): one read of it at a time, the answer held as its
   * current view, a failure keeping its previous view and its time, and
   * every other instance's read and view its own. A read begun before a
   * clone was attached to a repository there, or a group was created
   * there, cannot list it: it is made again before it is held. */
  readHost(instance: HostInstance = this.defaultInstance()): Promise<HostView> {
    const generation = instance.accountGeneration;
    if (instance.reading && instance.readingGeneration === generation) return instance.reading;
    const previous = instance.reading;
    instance.fullReadBegun = true;
    instance.readState = { phase: "running" };
    const client = instance.client;
    let work!: Promise<HostView>;
    work = (async (): Promise<HostView> => {
      let begun = 0;
      try {
        await this.publish();
        await previous?.catch(() => undefined);
        if (generation !== instance.accountGeneration) throw new CredentialChanged();
        let view: HostView;
        do {
          begun = (instance.readsBegun += 1);
          view = await readHostView(client);
        } while (begun <= instance.changedAfter);
        if (generation !== instance.accountGeneration) throw new CredentialChanged();
        instance.view = view;
        instance.viewRead = begun;
        for (const [machine, target] of instance.targets) if (target.begun <= begun) instance.targets.delete(machine);
        this.releaseHeld(instance);
        instance.described = { displayName: view.displayName, gitOrigin: view.gitOrigin };
        // The instance's entry keeps its display name as this read named
        // it, for its heading once it is signed out (storage-2, space-1).
        if (view.displayName) {
          try { this.host.store.setDisplayName(instance.origin, view.displayName); }
          catch (error) { console.error(`spex: the instance's display name was not recorded: ${error instanceof Error ? error.message : String(error)}`); }
        }
        instance.readFailure = undefined;
        // A clone this instance serves or governs reads its answer afresh
        // (git-host-5); one it serves, matched by its remote, records the
        // host's id.
        for (const repository of this.host.store.listRepositories()) {
          if (!this.host.store.repository(repository.key)) continue;
          const machine = this.machine(repository.key);
          const serves = this.servingOf(machine) === instance;
          if (!serves && this.rowInstance(machine) !== instance) continue;
          if ((instance.targets.get(machine)?.begun ?? 0) <= begun) machine.hostOverride = undefined;
          if (!serves) continue;
          const facts = await machine.readFacts().catch(() => ({ remote: null, id: null }));
          if (generation !== instance.accountGeneration) throw new CredentialChanged();
          if (facts.id === null && facts.remote !== null) {
            const listing = listingFor(view, null, facts.remote);
            if (listing) { try { machine.recordId(listing.repository.id, facts.remote); } catch { /* recorded at the next read */ } }
          }
        }
        return view;
      } catch (error) {
        // A refusal signed out where its pair was removed (git-host-4);
        // here, only an instance whose app token is gone is, checked now.
        if (generation === instance.accountGeneration) {
          if (error instanceof HostError && error.code === "signed_out" && this.signedInAt(instance) && client.holdsNone()) this.signedOutByHost(instance.origin);
          if (generation === instance.accountGeneration) {
            instance.readFailure = relayHostError(error, this.nameOf(instance));
            this.failRead(instance, error, generation);
            instance.failureRead = begun;
          }
        }
        throw error;
      } finally {
        if (instance.reading === work) { instance.reading = undefined; instance.readingGeneration = undefined; }
        if (!instance.settingUp && generation === instance.accountGeneration && instance.readState.phase === "running") instance.readState = { phase: "idle" };
        void this.publish();
      }
    })();
    instance.reading = work;
    instance.readingGeneration = generation;
    work.catch(() => undefined);
    return work;
  }

  /** An instance's newest selected observation not superseded by its
   * full read. Facts changed to another remote cannot inherit it. */
  private targetOf(instance: HostInstance, facts: RemoteFacts): TargetReading | undefined {
    return [...instance.targets.values()].filter((target) => target.accountGeneration === instance.accountGeneration && target.begun > instance.viewRead && (
      (target.facts.id === facts.id && target.facts.remote === facts.remote)
      || (target.listing !== undefined && listingFor({ listings: [target.listing], gitOrigin: target.catalog?.gitOrigin ?? "" }, facts.id, facts.remote) !== undefined)
    )).sort((a, b) => b.begun - a.begun)[0];
  }

  /** A target answer cannot outlive the account it was requested for. */
  private assertTargetAccount(instance: HostInstance, generation: number): void {
    if (generation !== instance.accountGeneration || !this.signedInAt(instance)) throw new CredentialChanged();
  }

  /** Fresh complete namespace facts of an instance plus only this
   * destination's detail (git-host-22). Never joins an unrelated
   * full-view fanout. */
  private async readTarget(instance: HostInstance, machine: RepositorySync, facts: CloneFacts): Promise<TargetReading> {
    const accountGeneration = instance.accountGeneration;
    const client = instance.client;
    let begun = 0;
    try {
      let catalog: HostCatalog;
      let listing: HostListing | undefined;
      do {
        begun = (instance.readsBegun += 1);
        catalog = await readHostCatalog(client);
        this.assertTargetAccount(instance, accountGeneration);
        // One host repository by that instance's Git origin and its id
        // (git-host-5).
        const repository = repositoryFor(catalog.repositories, (entry) => entry, catalog.gitOrigin, facts.id, facts.remote);
        listing = repository ? await readHostListing(client, repository, true) : undefined;
        this.assertTargetAccount(instance, accountGeneration);
      } while (begun <= instance.changedAfter || begun < Math.max(instance.viewRead, instance.failureRead));
      const target = { begun, accountGeneration, facts, catalog, listing };
      if ((instance.targets.get(machine)?.begun ?? 0) < begun) instance.targets.set(machine, target);
      instance.described = { displayName: catalog.displayName, gitOrigin: catalog.gitOrigin };
      return target;
    } catch (error) {
      if (error instanceof HostError && error.code === "signed_out" && this.signedInAt(instance) && client.holdsNone()) this.signedOutByHost(instance.origin);
      if (accountGeneration === instance.accountGeneration && this.signedInAt(instance) && (instance.targets.get(machine)?.begun ?? 0) < begun) {
        instance.targets.set(machine, { begun, accountGeneration, facts, failure: relayHostError(error, this.nameOf(instance)) });
      }
      throw error;
    } finally { void this.publish(); }
  }

  // -- your own group (space-4, space-59, space-65) ---------------------------

  /** Rename your own group's folder and its spex repository after the
   * account's login (space-59), only while the folder still bears this
   * device's user name, as it does until the home's first sign-in, so no
   * later sign-in renames it: one synchronous step at its instant —
   * the clones beneath read now, each moved by one rename, every pair
   * naming one rewritten. A destination already taken is a conflict:
   * nothing moves, and the next set-up asks again. Writers beneath the
   * clones resolve their paths at their own instants. */
  private async renameOwn(account: Pick<HostAccount, "login">, instance: HostInstance, generation: number): Promise<"none" | "done" | "conflict"> {
    const store = this.host.store;
    const target = ownNameFor(account.login);
    const device = store.deviceOwnName();
    if (!target || target === store.home.ownName || store.home.ownName !== device) return "none";
    const identity = await this.machineIdentity();
    if (generation !== instance.accountGeneration) return "none";
    // Nothing is awaited from here to the last rename.
    const current = store.home.ownName;
    if (target === current || current !== device) return "none";
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

  /** The listing that is your own group's own repository while its
   * clone records no host id (space-4, git-host-5): `<name>-spex` in
   * your namespace at the instance, `<name>` your own group's folder's
   * name or the one your login there gives it, which a sign-in's rename
   * of the folder may not have reached yet (space-59) — only your
   * namespace holds it, a group of the instance named like your login
   * never does. Its clone matches it by its id once it records one. */
  private ownNamespaceListing(view: HostView): HostListing | undefined {
    const store = this.host.store;
    const namespace = userGroup(view)?.fullPath ?? store.home.ownName;
    const names = new Set([splitKey(store.home.own()).name, `${ownNameFor(view.account.login)}-spex`]);
    return view.listings.find((listing) => listing.repository.group.kind === "user"
      && sameLogin(listing.repository.group.fullPath, namespace) && names.has(listing.repository.path));
  }

  /** Step 3 of the set-up at an instance (space-4), after any other
   * instance's set-up begun before it has taken it: your own group's own
   * repository with no remote is brought by the earliest signed-in
   * instance in the home's list, whichever instance's read answers
   * first (space-83), and every other instance's set-up leaves it. */
  private ensureOwn(instance: HostInstance, view: HostView, generation: number): Promise<void> {
    const previous = this.owning;
    const work = (async () => {
      await previous?.catch(() => undefined);
      if (generation !== instance.accountGeneration || !this.signedInAt(instance)) return;
      if (this.listedInstances().find((entry) => this.signedInAt(entry)) !== instance) return;
      await this.ensureOwnOnHost(instance, view);
    })();
    this.owning = work;
    return work;
  }

  /** Your own group's spex repository at an instance while it has no
   * remote (space-4, space-65): joined where that instance lists one,
   * else created there as `<login there>-spex` in your namespace and
   * pushed — at the home's first sign-in, or once its remote was dropped
   * (space-82), its folder keeping its name. */
  private async ensureOwnOnHost(instance: HostInstance, view: HostView): Promise<void> {
    const store = this.host.store;
    const key = store.home.own();
    if (!store.repository(key) || this.waiting.has(key)) return;
    const machine = this.machine(key);
    const facts = await machine.readFacts();
    if (facts.remote !== null) return;
    // Your own group is named to the host by none, never by its id,
    // which names no group of the instance there (git-host-6).
    const group = { id: null, fullPath: userGroup(view)?.fullPath ?? store.home.ownName };
    const name = `${ownNameFor(view.account.login)}-spex`;
    const listed = this.ownNamespaceListing(view);
    if (listed) {
      await this.adopt(instance, machine, listed, true, { setUp: true });
      return;
    }
    await this.create(instance, machine, group, name, repositoryDescription({ kind: "group", group: group.fullPath }), "quiet");
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
      // At the instance its key lies under (storage-31); a key under none
      // is local only.
      const instance = this.instanceOfKey(key);
      if (!instance || !this.signedInAt(instance)) return "local";
      const view = instance.view ?? await this.readHost(instance);
      const listed = view.listings.find((listing) => listing.repository.group.kind === "group" && !this.collides(listing.repository.group, view)
        && listing.repository.group.fullPath === group && listing.repository.path === name);
      if (listed) {
        await this.adopt(instance, machine, listed, true);
        return "joined";
      }
      const hostGroup = this.listedGroups(instance, view).find((entry) => entry.kind === "group" && entry.fullPath === group);
      if (!hostGroup || this.collides(hostGroup, view)) return "local";
      return await this.create(instance, machine, { id: hostGroup.id, fullPath: hostGroup.fullPath }, name, repositoryDescription({ kind: "group", group }), "quiet");
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
  private async adopt(instance: HostInstance, machine: RepositorySync, listing: HostListing, join: boolean, options: { expected?: string | null; setUp?: boolean; created?: boolean } = {}): Promise<void> {
    const { repository } = listing;
    const { expected = null, setUp = false, created = false } = options;
    instance.changedAfter = instance.readsBegun;
    instance.targets.delete(machine);
    instance.attached.set(repository.id, listing);
    // A remote added is named by that instance's folder (DR-127).
    try { await machine.attachHost(repository.remoteUrl, repository.id, expected, created, instance.folder()); }
    catch (error) {
      instance.attached.delete(repository.id);
      throw error;
    }
    this.waiting.delete(machine.key);
    const picked = this.localOnly(machine.key);
    await this.moveAtPick(instance, machine, repository);
    // The pick places the project at its instance, moved or not: the
    // built-in its pairing locked at the default instance is locked at
    // this one before its records first sync (environments-11, DR-127).
    if (picked) this.host.environmentPlaced?.(machine.key);
    await this.publish();
    this.startSync(machine.key, { join, ...(setUp ? { setUp } : {}) });
  }

  /**
   * A pick of a clone in your own group's folder — a creation or a join
   * the host accepted — moves it under its instance's folder at the
   * repository's path there as it lands (storage-35): one rename at its
   * instant, as a host's rename moves a clone, its pairs, session
   * locations, sync preferences and exports following (space-60). A
   * session's lease beneath, a destination taken or a rename that fails
   * leaves it where it lies, its remote naming its instance (storage-31),
   * until its next sync moves it; the pick stands either way.
   */
  private async moveAtPick(instance: HostInstance, machine: RepositorySync, repository: HostRepository): Promise<void> {
    const store = this.host.store;
    const from = machine.key;
    if (!this.localOnly(from)) return;
    const to = this.keyAtHost(repository, instance);
    if (!to || to === from) return;
    const source = machine.repository.dir;
    const identity = await this.machineIdentity();
    // Nothing is awaited from here to the rename: the clone still lies
    // where the home says, with the remote and id the pick wrote.
    if (store.repository(from)?.dir !== source || machine.key !== from || !machine.recordsNow(repository.remoteUrl, repository.id)) return;
    try {
      if (heldSessionLease(source, identity) !== undefined || this.destinationTaken(from, to) !== undefined) return;
      const target = store.home.clonePath(to);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      renameSync(source, target);
    } catch (error) {
      console.error(`spex: ${from} stays where it lies until its next sync: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    pruneEmptyFolders(dirname(source), store.home.workspace);
    this.relocate([{ from, to }]);
    await this.afterMove([{ from, to }]);
  }

  /** Whether a key names a local-only clone under your own group's
   * folder, its own repository aside (storage-35). */
  private localOnly(key: string): boolean {
    const home = this.host.store.home;
    return key !== home.own() && splitKey(key).instance === null && key.startsWith(`${home.ownName}/`);
  }

  /** Ask an instance to create `name` in a group there for a clone
   * (git-host-6). */
  private async create(
    instance: HostInstance,
    machine: RepositorySync,
    group: { id: string | null; fullPath: string },
    name: string,
    description: string,
    mode: "refuse" | "quiet",
  ): Promise<"created" | "waiting" | "local"> {
    const ask = { groupId: group.id, name, description };
    let answer: Awaited<ReturnType<GitHostClient["create"]>>;
    try {
      answer = await instance.client.create(ask);
    } catch (error) {
      if (mode === "refuse") {
        throw new CoreError("invalid_request", error instanceof HostError && error.kind === "name_taken"
          ? nameTaken(name, group.fullPath)
          : relayHostError(error, this.nameOf(instance)));
      }
      // The refusal stands on the row with the host's words, and the
      // creation is asked again at that instance's next read (space-4,
      // space-64), under the key the clone bears now, wherever it moved
      // meanwhile.
      this.waiting.set(machine.key, { instance: instance.origin, step: "create", group: group.fullPath, message: relayHostError(error, this.nameOf(instance)), create: ask });
      await this.publish();
      return "waiting";
    }
    if (answer.status === "pending") {
      this.waiting.set(machine.key, { instance: instance.origin, step: "create", group: group.fullPath, message: answer.message, create: ask });
      await this.publish();
      return "waiting";
    }
    // As the host answered: no `spex` branch yet, nor a members' count.
    await this.adopt(instance, machine, { repository: answer.repository, readOnly: null, branchPresent: false, members: null }, false, { created: true });
    return "created";
  }

  /** Every step left waiting at an instance, asked again at its read
   * (space-64): a creation a member with the rights did is found and
   * joined. An entry stands until its step is done or no longer asked
   * for — never lost to an act that failed meanwhile. */
  private async retryWaiting(instance: HostInstance, view: HostView): Promise<void> {
    for (const [key, waiting] of [...this.waiting]) {
      if (waiting.instance !== instance.origin) continue;
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
          if (found) await this.adopt(instance, machine, found, true, { setUp: machine.key === this.host.store.home.own() });
          else if (await this.create(instance, machine, { id: ask.groupId, fullPath: waiting.group }, ask.name, ask.description, "quiet") === "created" && this.waiting.get(machine.key) === waiting) this.waiting.delete(machine.key);
        } catch (error) {
          console.error(`spex: ${machine.key} still waits: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
      const listing = listingFor(view, facts.id, facts.remote);
      if (!listing) continue;
      if (listing.branchPresent) { this.waiting.delete(key); continue; }
      try {
        const answer = await instance.client.prepareBranch(listing.repository.id);
        if (answer.status === "ready") {
          this.waiting.delete(key);
          this.startSync(key, {});
        } else this.waiting.set(key, { ...waiting, message: answer.message });
      } catch (error) {
        this.waiting.set(key, { ...waiting, message: relayHostError(error, this.nameOf(instance)) });
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
  async pick(key: string, choice: { kind: "join"; instance: string; hostId: string } | { kind: "create"; instance: string; groupId: string | null; name: string }, noticed = false): Promise<{ accepted: true }> {
    // On a seat your own group is offered no pick (space-102).
    if (this.host.seat && key === this.host.store.home.own()) throw new CoreError("invalid_request", ownStaysOnTheServer());
    // The instance the choice is at (space-29), one the home does not
    // list refused `not_found`.
    const keyed = this.instanceOfKey(key);
    const instance = this.instanceAt(this.namedInstance(choice.instance));
    const machine = this.machine(key);
    {
      // The remote is written only where none stands at the write
      // (attachHost); a second pick meets the first's remote there, or
      // the host's own refusal of a taken name.
      const facts = await machine.readFacts();
      if (facts.remote !== null) {
        throw new CoreError("invalid_request", i18n._({ id: "{name} is on the host already", values: { name: splitKey(key).name }, comment: "Refusal of a pick: the spex repository is not local only" }));
      }
      // A clone keyed under an instance is picked into a group there
      // alone (space-58, storage-31).
      if (keyed && keyed !== instance) throw new CoreError("invalid_request", pickAtItsInstance(splitKey(key).name, this.nameOf(keyed)));
      if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
      const view = instance.view ?? await this.readHost(instance).catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.nameOf(instance))); });
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
        await this.adopt(instance, machine, listing, true);
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
        : this.listedGroups(instance, view).find((entry) => entry.kind === "group" && entry.id === choice.groupId);
      if (!group) throw new CoreError("not_found", i18n._({ id: "The host lists no such group", comment: "Refusal of a pick naming a group the Git host does not list" }));
      if ("kind" in group && this.collides(group, view)) {
        throw new CoreError("invalid_request", groupNamedLikeYourLogin(group.fullPath));
      }
      const project = this.projectFile(machine.repository);
      await this.create(instance, machine, { id: group.id, fullPath: group.fullPath }, `${base}-spex`,
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

  /** Join a spex repository an instance lists and this device lacks
   * (space-63): clone it under the folder of the instance its row stands
   * under at its path there, then the code into `folder`, and pair the
   * two. The command names the instance by its origin; a host repository
   * an earlier signed-in instance in the home's list also lists, by one
   * Git origin and id, has its row there, and Join keys it there
   * (space-1, DR-127). */
  async join(named: string, hostId: string, folder?: string): Promise<{ accepted: true }> {
    const at = this.instanceAt(this.namedInstance(named));
    if (!this.signedInAt(at)) throw new CoreError("invalid_request", signInFirst());
    const atView = at.view ?? await this.readHost(at).catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.nameOf(at))); });
    const found = atView.listings.find((entry) => entry.repository.id === hostId);
    if (!found) throw new CoreError("not_found", noLongerShared());
    const { instance, view, listing } = this.rowOf(at, atView, found);
    // A group named like a login holds no folder of its own (space-61).
    if (this.collides(listing.repository.group, view)) throw new CoreError("invalid_request", groupNamedLikeYourLogin(listing.repository.group.fullPath));
    const key = this.keyAtHost(listing.repository, instance);
    if (!key) {
      throw new CoreError("invalid_request", i18n._({ id: "{path} cannot stand as a folder on this device", values: { path: `${listing.repository.group.fullPath}/${listing.repository.path}` }, comment: "Refusal of a join: the host's names hold characters a folder under the home cannot" }));
    }
    const store = this.host.store;
    // Read from each clone now, whatever instance it lies under: the id
    // it records beside a remote under that instance's Git origin, or its
    // remote (git-host-5), so another Git system's same id is another
    // repository; your own group's own repository, recording no id yet,
    // is the one your namespace at its instance lists under its name
    // (space-4).
    const own = store.home.own();
    const here = (await Promise.all(store.listRepositories().map(async (repository) => {
      try {
        const machine = this.machine(repository.key);
        const facts = await machine.readFacts();
        return { facts, ownAt: repository.key === own ? this.servingOf(machine) : undefined };
      } catch { return { facts: { remote: null, id: null }, ownAt: undefined }; }
    }))).some(({ facts, ownAt }) => listingFor(view, facts.id, facts.remote)?.repository.id === hostId
      || (ownAt === instance && facts.id === null && this.ownNamespaceListing(view)?.repository.id === hostId));
    if (here || store.repository(key) || existsSync(store.home.clonePath(key)) || store.deferredMoves().some((move) => move.to === key)) {
      throw new CoreError("invalid_request", i18n._({ id: "{name} is on this device already", values: { name: listing.repository.path }, comment: "Refusal of a join: the spex repository has a clone here" }));
    }
    const path = folder === undefined ? undefined : resolve(folder);
    if (path !== undefined && store.home.keyForFolder(path)) {
      throw new CoreError("invalid_request", i18n._({ id: "{path} is another project's working folder", values: { path }, comment: "Refusal of a join: the folder named is paired already" }));
    }
    const progress: SpaceSyncPhase = { phase: "running", op: "join", step: "check", since: Date.now(), cancelable: false };
    this.joining.set(this.joinKey(instance, hostId), progress);
    await this.publish();
    void this.runJoin(instance, listing, key, path, progress);
    return { accepted: true };
  }

  /** The instance a listed host repository's row stands under (space-1,
   * git-host-5): the earliest signed-in instance in the home's list whose
   * view lists it by the Git origin and id `at` lists it by, with that
   * view and its listing — `at` itself where no earlier one does. */
  private rowOf(at: HostInstance, atView: HostView, listing: HostListing): { instance: HostInstance; view: HostView; listing: HostListing } {
    for (const instance of this.listedInstances()) {
      if (instance === at) break;
      const view = this.viewOf(instance);
      if (!view || !sameOrigin(view.gitOrigin, atView.gitOrigin)) continue;
      const same = view.listings.find((entry) => entry.repository.id === listing.repository.id);
      if (same) return { instance, view, listing: same };
    }
    return { instance: at, view: atView, listing };
  }

  /** One join (space-63): the spex repository cloned into a private
   * stage beside its place, then published there by a rename only where
   * nothing stands — another join's clone among them — and a failure
   * removes only its own stage. `progress` is this
   * join's own entry, replaced or removed only while it stands. */
  private async runJoin(instance: HostInstance, listing: HostListing, key: string, folder: string | undefined, progress: SpaceSyncPhase): Promise<void> {
    const store = this.host.store;
    const id = listing.repository.id;
    const url = listing.repository.remoteUrl;
    const dest = store.home.clonePath(key);
    const entry = this.joinKey(instance, id);
    let mine = progress;
    const own = (next: SpaceSyncPhase | undefined): void => {
      if (this.joining.get(entry) !== mine) return;
      if (next) { this.joining.set(entry, next); mine = next; }
      else this.joining.delete(entry);
    };
    // No line the report carries names a URL under the host's Git
    // origin (space-15).
    const stop = (failure: GitFailure): void => own({ phase: "stopped", op: "join", step: "check", ...this.withoutHostUrls(failure, { remote: listing.repository.remoteUrl, id }, key) });
    let stage: string | undefined;
    try {
      mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
      stage = mkdtempSync(join(dirname(dest), `.${basename(dest)}.join-`));
      const dir = join(stage, "clone");
      // The instance it is joined at brokers its clone (git-host-9).
      let credential: GitCredentialHandle | null;
      try { credential = await this.credentialFor(instance, url, "check"); }
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
      // The remote takes the name the host's remote takes in a clone at
      // that key: its instance's folder (DR-127).
      const name = hostRemoteName(key, instance.folder());
      let run: GitRun;
      try {
        const options = { transport: true, ...(credential ? { credential } : {}) };
        run = await privately(["clone", "-q", "--branch", SPEX_BRANCH, "--single-branch", "--origin", name, url, dir], options);
        if (run.code !== 0 && /Remote branch \S+ not found|not found in upstream/i.test(run.stderr)) {
          // The host holds no `spex` yet: its default branch, then `spex`
          // beside it (space-32).
          rmSync(dir, { recursive: true, force: true });
          run = await privately(["clone", "-q", "--origin", name, url, dir], options);
          if (run.code === 0) run = await privately(["-C", dir, "checkout", "-q", "-b", SPEX_BRANCH]);
        }
      } finally {
        await credential?.dispose();
      }
      if (run.code !== 0) {
        stop(credential ? classifyHostTransportFailure(run, this.nameOf(instance)) : classifyTransportFailure(run, url));
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
   * the remote its `project.json` names with this device's own Git — with
   * the credential the project's instance brokers only where that remote
   * lies under that instance's Git origin, and none of the app's at any
   * other, another instance's included (projects-37) — or a folder
   * already holding it, paired with the clone; a group's own spex
   * repository pairs the folder its sessions run in. The join's Code step
   * runs while the code clones (space-63), shown through `step`; a
   * failure comes back as the row's stopped state, the host's failure
   * classified at the project's instance's Git origin and Git's words at
   * any other, with no URL under any instance's Git origin. */
  private async pairJoined(machine: RepositorySync, folder: string, step: (phase: SpaceSyncPhase) => void): Promise<SpaceSyncPhase | undefined> {
    const project = this.projectFile(machine.repository);
    const root = existsSync(folder) && await this.workTreeRoot(folder);
    const remote = !root && project?.remote ? project.remote : undefined;
    const at: SyncStep = remote ? "code" : "check";
    step({ phase: "running", op: "join", step: at, since: Date.now(), cancelable: false });
    await this.publish();
    // The project's instance is its spex repository's (projects-37,
    // storage-31): never one chosen by the code's Git origin alone.
    const instance = this.instanceOfClone(machine);
    const stopped = (failure: GitFailure): SpaceSyncPhase => ({
      phase: "stopped", op: "join", step: at,
      ...this.withoutHostUrls(failure, { remote: null, id: null, remoteName: machine.facts.remoteName }, machine.key),
    });
    const chooseFolder = (): string => i18n._({ id: "The spex repository is here; choose a folder for its code to pair it.", comment: "Guidance after a join's code clone failed" });
    try {
      if (remote) {
        mkdirSync(dirname(folder), { recursive: true });
        const credential = instance ? await this.credentialFor(instance, remote, at) : null;
        let run: GitRun;
        try {
          run = await this.probe.run(["clone", "-q", remote, folder], { transport: true, ...(credential ? { credential } : {}) });
        } finally {
          await credential?.dispose();
        }
        if (run.code !== 0) {
          return stopped({
            ...(credential && instance ? classifyHostTransportFailure(run, this.nameOf(instance)) : {
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
      this.host.environmentPaired?.(machine.key);
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
  async members(input: { instance?: string; repository?: string; group?: string }): Promise<{ members: HostMember[] }> {
    const instance = await this.targetInstance(input);
    const target = await this.membersTarget(instance, input, "invalid_request");
    return this.listMembers(instance, target);
  }

  /** Create a group at the host, named as the reader typed, at the path
   * the reader gave, at the top or inside a group the view lists
   * (git-host-15); the group then counts as listed until a read begun
   * after its creation is held (git-host-5), announced before the
   * reply. */
  async createGroup(named: string, name: string, path: string, parent: string | null): Promise<{ group: { id: string; fullPath: string; name: string } }> {
    // At the instance the command names (space-29).
    const instance = this.instanceAt(this.namedInstance(named));
    if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
    const typed = name.trim();
    if (typed.length === 0) throw new CoreError("invalid_request", nameTheGroup());
    const given = path.trim();
    if (given.length === 0) throw new CoreError("invalid_request", pathTheGroup());
    let parentPath: string | null = null;
    if (parent !== null) {
      const listed = this.listedGroups(instance, instance.view).find((group) => group.id === parent);
      if (!listed) throw new CoreError("not_found", groupNotListed(parent, this.nameOf(instance)));
      parentPath = listed.fullPath;
    }
    let created: Awaited<ReturnType<GitHostClient["createGroup"]>>;
    try {
      created = await instance.client.createGroup({ name: typed, path: given, parentId: parent });
    } catch (error) {
      if (error instanceof HostError && error.kind === "name_taken") throw new CoreError("invalid_request", groupNameTaken(typed, parentPath, this.nameOf(instance)));
      throw this.hostWriteRefusal(instance, error);
    }
    // The group counts as listed, as the host answered it, until a read
    // begun after this is held, whether or not that read lists it; one
    // begun before cannot, and is made again before it is held. No read
    // is begun here: the host's listing may lag behind its creation
    // (git-host-5).
    instance.changedAfter = instance.readsBegun;
    if (this.signedInAt(instance)) instance.created.set(created.fullPath, created);
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
  async renameGroup(named: string, id: string, input: { name?: string; path?: string }): Promise<{ group: { id: string; fullPath: string; name: string } }> {
    const instance = this.instanceAt(this.namedInstance(named));
    if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
    if (input.name === undefined && input.path === undefined) throw new CoreError("invalid_request", renameNothing());
    const name = input.name?.trim();
    if (name !== undefined && name.length === 0) throw new CoreError("invalid_request", nameTheGroup());
    const path = input.path?.trim();
    if (path !== undefined && path.length === 0) throw new CoreError("invalid_request", pathTheGroup());
    const listed = this.instanceGroup(instance, id);
    const from = listed.fullPath;
    let renamed: HostGroup;
    try {
      renamed = await instance.client.renameGroup(id, { ...(name !== undefined ? { name } : {}), ...(path !== undefined ? { path } : {}) });
    } catch (error) {
      if (error instanceof HostError && error.kind === "name_taken") {
        const parent = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : null;
        throw new CoreError("invalid_request", groupNameTaken(path ?? name ?? listed.name, parent, this.nameOf(instance)));
      }
      throw this.hostWriteRefusal(instance, error);
    }
    const to = renamed.fullPath;
    const here = (group: Pick<HostGroup, "id" | "fullPath">): boolean => group.id === id || group.fullPath === from;
    const inside = (fullPath: string): string => fullPath.startsWith(`${from}/`) ? `${to}${fullPath.slice(from.length)}` : fullPath;
    this.holdChange(instance, {
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
  async deleteGroup(named: string, id: string): Promise<{ deleted: true }> {
    const instance = this.instanceAt(this.namedInstance(named));
    if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
    const listed = this.instanceGroup(instance, id);
    if (this.holdsAnything(instance, listed)) throw new CoreError("invalid_request", groupNotEmpty(listed.fullPath));
    try {
      await instance.client.deleteGroup(id);
    } catch (error) {
      throw this.hostWriteRefusal(instance, error);
    }
    this.holdChange(instance, { group: (group) => group.kind === "group" && (group.id === id || group.fullPath === listed.fullPath) ? null : group });
    await this.publish();
    return { deleted: true };
  }

  /** Move a spex repository, by its key, into a group of the instance its
   * row stands under or, where none is named, your namespace there
   * (git-host-20) — a group of another instance found in none, refused
   * before the host is asked — holding it as the host answered until a
   * read begun after the move is held (git-host-5), announced before the
   * reply; its clone moves on its next sync (space-60). */
  async moveRepository(key: string, groupId: string | null): Promise<{ repository: { id: string; fullPath: string } }> {
    const instance = await this.targetInstance({ repository: key });
    const target = await this.membersTarget(instance, { repository: key }, "invalid_request");
    let into: HostGroup | null = null;
    if (groupId !== null) {
      into = this.instanceGroup(instance, groupId);
      if (this.collides(into, this.viewOf(instance))) throw new CoreError("invalid_request", groupNamedLikeYourLogin(into.fullPath));
    }
    let moved: HostRepository;
    try {
      moved = await instance.client.transferRepository(target.id, groupId);
    } catch (error) {
      if (error instanceof HostError && error.kind === "name_taken") {
        throw new CoreError("invalid_request", takenIn(splitKey(key).name, into?.fullPath ?? userGroup(instance.view)?.fullPath ?? this.host.store.home.ownName));
      }
      throw this.hostWriteRefusal(instance, error);
    }
    this.holdChange(instance, { listing: (listing) => listing.repository.id === moved.id ? { ...listing, repository: moved } : listing });
    await this.publish();
    return { repository: { id: moved.id, fullPath: `${moved.group.fullPath}/${moved.path}` } };
  }

  /** A group of the instance the current view lists, with those this
   * core created since its read began, by its host id; your own group
   * and another account's are none (git-host-18..20): `not_found`, the
   * host not asked, where none is. */
  private instanceGroup(instance: HostInstance, id: string): HostGroup {
    const group = this.listedGroups(instance, instance.view).find((entry) => entry.kind === "group" && entry.id === id);
    if (!group) throw new CoreError("not_found", groupNotListed(id, this.nameOf(instance)));
    return group;
  }

  /** Whether the view lists a spex repository or a group under a group
   * of the instance (git-host-19), its paths compared ignoring case as
   * the host's are. */
  private holdsAnything(instance: HostInstance, group: HostGroup): boolean {
    const path = group.fullPath.toLowerCase();
    const under = (fullPath: string, self: boolean): boolean => (self && fullPath.toLowerCase() === path) || fullPath.toLowerCase().startsWith(`${path}/`);
    if (this.listedGroups(instance, instance.view).some((entry) => entry.kind === "group" && entry.id !== group.id && under(entry.fullPath, false))) return true;
    return [...(instance.view?.listings ?? []), ...instance.attached.values()].some(({ repository }) =>
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
  private holdChange(instance: HostInstance, change: { group?: (group: HostGroup) => HostGroup | null; listing?: (listing: HostListing) => HostListing }): void {
    instance.changedAfter = instance.readsBegun;
    const groups = (list: HostGroup[]): HostGroup[] => {
      if (!change.group) return list;
      const map = change.group;
      return list.flatMap((group) => {
        const next = map(group);
        return next ? [next] : [];
      });
    };
    const listings = (list: HostListing[]): HostListing[] => (change.listing ? list.map(change.listing) : list);
    if (instance.view) instance.view = { ...instance.view, groups: groups(instance.view.groups), listings: listings(instance.view.listings) };
    if (change.group) {
      const held = groups([...instance.created.values()]);
      instance.created.clear();
      for (const group of held) instance.created.set(group.fullPath, group);
    }
    if (change.listing) for (const [id, listing] of [...instance.attached]) instance.attached.set(id, change.listing(listing));
    for (const target of instance.targets.values()) {
      if (target.listing && change.listing) target.listing = change.listing(target.listing);
      if (target.catalog) target.catalog = {
        ...target.catalog,
        groups: groups(target.catalog.groups),
        repositories: change.listing ? target.catalog.repositories.map((repository) => change.listing!({ repository, readOnly: null, branchPresent: false, members: null }).repository) : target.catalog.repositories,
      };
    }
  }

  /** Add the account of a login to a group or spex repository at one of
   * the host's roles, and list the members the host holds afterwards
   * (git-host-16). `role` is a role's id from the view. */
  async share(input: { instance?: string; repository?: string; group?: string; login: string; role: string }): Promise<{ members: HostMember[] }> {
    const instance = await this.targetInstance(input);
    const login = input.login.trim();
    if (login.length === 0) throw new CoreError("invalid_request", nameTheLogin(this.nameOf(instance)));
    // A role that instance grants (git-host-16).
    const roles = this.viewOf(instance)?.roles ?? [];
    if (!roles.some((role) => role.id === input.role)) throw new CoreError("invalid_request", notARole(input.role, this.nameOf(instance)));
    const target = await this.membersTarget(instance, input, "not_found");
    try {
      await instance.client.addMember(target, { login, role: input.role });
    } catch (error) {
      throw this.hostWriteRefusal(instance, error);
    }
    return this.listMembers(instance, target);
  }

  /** Remove the account of a login from a group's or spex repository's
   * own members, and list the members the host holds afterwards
   * (git-host-17). */
  async unshare(input: { instance?: string; repository?: string; group?: string; login: string }): Promise<{ members: HostMember[] }> {
    const instance = await this.targetInstance(input);
    const login = input.login.trim();
    if (login.length === 0) throw new CoreError("invalid_request", nameTheLogin(this.nameOf(instance)));
    const target = await this.membersTarget(instance, input, "not_found");
    try {
      await instance.client.removeMember(target, login);
    } catch (error) {
      throw this.hostWriteRefusal(instance, error);
    }
    return this.listMembers(instance, target);
  }

  /** Read a target's members from its instance, relaying a refusal
   * (git-host-8, git-host-11). */
  private async listMembers(instance: HostInstance, target: MembersTarget): Promise<{ members: HostMember[] }> {
    try {
      const answer = await instance.client.members(target);
      return { members: answer.members.map((member) => ({ id: member.id, login: member.login, displayName: member.displayName, role: member.role, direct: member.direct, via: member.via })) };
    } catch (error) {
      throw new CoreError(error instanceof HostError && error.kind === "not_found" ? "not_found" : "invalid_request", relayHostError(error, this.nameOf(instance)));
    }
  }

  /**
   * The instance a members, share or move command acts at (space-29),
   * signed in there: for a group, the one the command names with it, one
   * the home does not list refused `not_found`; for a spex repository,
   * the instance governing it (git-host-5) — its clone's own while signed
   * in, else the earliest signed-in one listing it — or, for one not on
   * this device, the instance its key lies under, where its row stands. A
   * command names exactly one group or one spex repository, and an
   * instance it names the home lists.
   */
  private async targetInstance(input: { instance?: string; repository?: string; group?: string }): Promise<HostInstance> {
    if ((input.group === undefined) === (input.repository === undefined)) throw new CoreError("invalid_request", nameOneTarget());
    const named = input.instance === undefined ? undefined : this.namedInstance(input.instance);
    let instance: HostInstance;
    if (input.repository === undefined) {
      // A group is a host id at the instance named with it, which the
      // protocol requires (space-29).
      if (named === undefined) throw new CoreError("invalid_request", nameOneTarget());
      instance = this.instanceAt(named);
    } else if (this.host.store.repository(input.repository)) {
      const machine = this.machine(input.repository);
      await machine.readFacts();
      instance = this.rowInstance(machine) ?? this.servingOf(machine);
    } else instance = this.instanceOfKey(input.repository) ?? this.defaultInstance();
    if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
    return instance;
  }

  /**
   * The host's id of the group or spex repository a command names, as
   * the current view of the instance it acts at lists it (git-host-8,
   * git-host-16, git-host-17): a group by its host id; a repository by
   * its key — its clone's listing, or, before any read is held, the id
   * its clone records — or the instance's listing under that key where
   * this device lacks it. A clone on this device alone is refused
   * `localOnly`; a place the view does not list `not_found`, the host
   * not asked.
   */
  private async membersTarget(instance: HostInstance, input: { repository?: string; group?: string }, localOnly: "invalid_request" | "not_found"): Promise<MembersTarget> {
    const view = instance.view;
    if (input.group !== undefined) {
      const group = input.group;
      if (!this.listedGroups(instance, view).some((entry) => entry.id === group)) throw new CoreError("not_found", groupNotListed(group, this.nameOf(instance)));
      return { kind: "group", id: group };
    }
    const key = input.repository as string;
    if (this.host.store.repository(key)) {
      const facts = await this.machine(key).readFacts();
      if (facts.remote === null) {
        throw new CoreError(localOnly, i18n._({ id: "On this device only", comment: "A spex repository's state: it has no remote on the Git host" }));
      }
      // Attached since the view's read began, it counts as listed (git-host-5).
      const listing = listingFor(view, facts.id, facts.remote) ?? listingFor(this.attachedAt(instance), facts.id, facts.remote);
      const id = listing?.repository.id ?? (view ? null : facts.id);
      if (id === null) throw new CoreError("not_found", noLongerShared());
      return { kind: "repository", id };
    }
    const id = view?.listings.find((listing) => !this.collides(listing.repository.group, view) && this.keyAtHost(listing.repository, instance) === key)?.repository.id;
    if (id === undefined) {
      throw new CoreError("not_found", i18n._({ id: "no spex repository {key} on this device", comment: "Refusal: the key names no clone under workspace/", values: { key } }));
    }
    return { kind: "repository", id };
  }

  /** A host write's refusal as the command's error (git-host-11,
   * git-host-15..17): `not_found` with the host's words, which name what
   * it found no trace of; anything else `invalid_request`, a refusal in
   * the host's words. */
  private hostWriteRefusal(instance: HostInstance, error: unknown): CoreError {
    if (error instanceof HostError && error.kind === "not_found") return new CoreError("not_found", notFoundAt(this.nameOf(instance), error.words));
    return new CoreError("invalid_request", relayHostError(error, this.nameOf(instance)));
  }

  // -- the sync against the host (space-11, space-12, space-60) ---------------

  /** The admission of space-11 an instance decides: a clone at its
   * instance needs a sign-in there, or, for a sync, a signed-in instance
   * listing the host repository it records, which the sync then follows
   * (space-60) — refused naming its own instance — and its first push
   * into a repository with other members needs the notice seen, read at
   * the instance governing it (space-57, git-host-22). A Check host
   * (`push` false) follows no other instance (git-host-9). */
  async admit(machine: RepositorySync, input: { push: boolean; noticed: boolean }): Promise<void> {
    const facts = machine.facts;
    const serving = this.servingOf(machine);
    const instance = this.syncsWith(machine, input.push);
    if (!this.atHost(facts, instance ?? serving)) return;
    if (!instance) throw new CoreError("invalid_request", signInTo(this.nameOf(serving)));
    if (!input.push || input.noticed) return;
    const store = this.host.store;
    if (store.getPref<unknown>(noticedPref(machine.key)) === true || store.getPref<unknown>(lastSyncPref(machine.key)) !== undefined) return;
    let listing: HostListing | undefined;
    try { listing = (await this.readTarget(instance, machine, facts)).listing; }
    catch (error) {
      throw new CoreError(error instanceof CredentialChanged ? "conflict" : "invalid_request", relayHostError(error, this.nameOf(instance)));
    }
    const notice = this.sharingNotice(machine, listing);
    if (notice) throw notice;
  }

  /** The same first-push condition at admission and at fresh Check. */
  private sharingNotice(machine: RepositorySync, listing: HostListing | undefined): CoreError | undefined {
    const store = this.host.store;
    if (store.getPref<unknown>(noticedPref(machine.key)) === true || store.getPref<unknown>(lastSyncPref(machine.key)) !== undefined) return undefined;
    if (!listing || listing.readOnly || !mayHaveOthers(listing)) return undefined;
    return new CoreError("invalid_request", i18n._({
      id: "Read the sharing notice before the first sync of {name}",
      values: { name: splitKey(machine.key).name },
      comment: "Refusal of a first push into a spex repository with other members until the reader has seen the privacy notice",
    }), { notice: true, members: listing.members, visibility: listing.repository.visibility });
  }

  /** The Check step's read of the host for one clone (space-12): follow
   * a rename or a transfer on a sync (space-60), take the URL the host
   * hands over, and prepare the branch before a first push (git-host-7).
   * A clone the instances migration deferred moves under its instance's
   * folder first, on a sync, wherever its remote lies (DR-127). The
   * instance governing the clone answers it (git-host-22), its catalog
   * read, its branch prepared, and the clone following the host under
   * its folder; where that is not the clone's own — signed out, another
   * signed-in instance listing it — a sync follows it there before any
   * transport, the clone re-keyed under its folder with its remote
   * renamed, your own group's own repository renaming its remote alone
   * (space-60). The instance it answered at comes back with the URL;
   * undefined for a clone whose remote is not at an instance. */
  async hostCheck(machine: RepositorySync, op: SpaceOp, internal = false): Promise<{ remote: string; readOnly: boolean; instance: HostInstance } | undefined> {
    if (op === "sync") await this.moveDeferred(machine);
    const facts = await machine.readFacts();
    const serving = this.servingOf(machine);
    const instance = this.syncsWith(machine, op === "sync");
    if (!this.atHost(facts, instance ?? serving)) return undefined;
    if (!instance) throw new SpaceStopped("check", { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
    const own = this.instanceOfClone(machine);
    const follows = own !== undefined && instance !== own;
    // Its name as each report is made, a read meanwhile naming it.
    const host = (): string => this.nameOf(instance);
    let target: TargetReading;
    // A selected read waits out the host's rate limit independently of
    // a full read; Stop leaves its answer to settle (git-host-21).
    try {
      target = await machine.hostCall("check", () => this.readTarget(instance, machine, facts));
      this.assertTargetAccount(instance, target.accountGeneration);
    }
    catch (error) { throw hostStop("check", error, host()); }
    const { listing, catalog } = target;
    if (!listing) {
      machine.hostOverride = { state: "unreachable", reason: noLongerShared() };
      throw new SpaceStopped("check", { cause: "gone", message: noLongerShared(), guidance: nothingDeleted(), retry: true });
    }
    if (op === "sync" && !internal) {
      const notice = this.sharingNotice(machine, listing);
      if (notice) throw new SpaceStopped("check", { cause: "refused", message: notice.message, guidance: retryGuidance(), retry: true });
    }
    const repository = listing.repository;
    if (facts.id === null && facts.remote !== null) machine.recordId(repository.id, facts.remote);
    // A group named like a login holds no folder of its own: the clone
    // neither syncs with it nor follows it there (space-60, space-61).
    if (this.collides(repository.group, catalog)) {
      machine.hostOverride = { state: "unreachable", reason: namedLikeYourLogin() };
      throw new SpaceStopped("check", { cause: "gone", message: groupNamedLikeYourLogin(repository.group.fullPath), guidance: nothingDeleted(), retry: true });
    }
    // The clone follows the host under the folder of the instance
    // answering — its own, or the one it follows (DR-127, space-60);
    // your own group's own repository keeps its folder, which lies
    // outside every instance's, following another instance by its
    // remote's name alone.
    const key = this.keyAtHost(repository, instance);
    if (op === "sync" && machine.key !== this.host.store.home.own()) {
      if (key && key !== machine.key) await this.moveInSync(instance, machine, key, repository.id, facts.remote, target.accountGeneration);
      // A path that cannot stand as folders here leaves no place to
      // follow it to: no transport goes through another instance.
      else if (follows) throw new SpaceStopped("check", { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
      // A follow or a deferred move half made — the clone under this
      // instance's folder, its remote's rename not made — is made now.
      else if (key === machine.key && facts.remoteName !== instance.folder()) this.followByRemote(instance, machine, repository.id, facts.remote, target.accountGeneration);
    } else if (follows) this.followByRemote(instance, machine, repository.id, facts.remote, target.accountGeneration);
    try { this.assertTargetAccount(instance, target.accountGeneration); }
    catch (error) { throw hostStop("check", error, host()); }
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
      if (repository.empty && !(created && await this.defaultBranchArrives(machine, instance, repository.id))) {
        if (!created || this.stopping) {
          this.waiting.set(machine.key, { instance: instance.origin, step: "branch", group, message: "" });
          throw new SpaceStopped("check", { cause: "refused", message: i18n._({ id: "{host} holds no default branch for it yet", values: { host: host() }, comment: "A stopped sync: the host's repository is empty, so spex waits for its default branch; {host} is its display name" }), guidance: syncLater(), retry: true });
        }
        // Still empty: the host never committed its README — a protected
        // default branch refusing a Developer's initial commit, say — so
        // the core pushes that branch itself, and goes on as if the host
        // had (git-host-7).
        await machine.pushDefaultBranch(repository.remoteUrl, repository.name, instance);
      }
      if (created) machine.forgetCreated();
      let answer: Awaited<ReturnType<GitHostClient["prepareBranch"]>>;
      try { answer = await machine.hostCall("check", (signal) => instance.client.prepareBranch(repository.id, { signal })); }
      catch (error) { throw hostStop("check", error, host()); }
      if (answer.status === "pending") {
        this.waiting.set(machine.key, { instance: instance.origin, step: "branch", group, message: answer.message });
        throw new SpaceStopped("check", { cause: "refused", message: waitingPhrase("branch", group, answer.message), guidance: syncLater(), retry: true });
      }
      if (this.waiting.get(machine.key)?.step === "branch") this.waiting.delete(machine.key);
    } else if (created && !repository.empty) machine.forgetCreated();
    return { remote: repository.remoteUrl, readOnly, instance };
  }

  /** Whether a repository the core created, which the host
   * reported empty, holds its default branch within the bound: read
   * again every CREATED_REREAD_MS, CREATED_REREADS times at most, as
   * the host may answer a creation before committing it (git-host-7). */
  private async defaultBranchArrives(machine: RepositorySync, instance: HostInstance, id: string): Promise<boolean> {
    for (let reads = 0; reads < CREATED_REREADS && !this.stopping; reads += 1) {
      await new Promise<void>((done) => { setTimeout(done, CREATED_REREAD_MS); });
      let empty: boolean;
      try { empty = (await machine.hostCall("check", (signal) => instance.client.repository(id, { signal }))).empty; }
      catch (error) { throw hostStop("check", error, this.nameOf(instance)); }
      if (!empty) return true;
    }
    return false;
  }

  /** The credential an instance brokers for a transport on its behalf
   * to its Git origin (git-host-9) — a clone's instance's, or the one it
   * is joined at — never another's chosen by the Git origin alone; none
   * for any other origin, which the device's own Git serves. Asked for a
   * sync's step, it waits out that instance's rate limit, which that
   * step's Stop ends; asked otherwise, the limit refuses it
   * (git-host-21). A refusal signs that instance alone out (git-host-4)
   * and stops the transport before Git runs. */
  async credentialFor(instance: HostInstance, remote: string, step: SyncStep, machine?: RepositorySync): Promise<GitCredentialHandle | null> {
    const origin = instance.knownOrigin();
    if (!origin || !underOrigin(remote, origin)) return null;
    if (!this.signedInAt(instance)) throw new SpaceStopped(step, { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
    let credential: { username: string; secret: string; expiresAt: number };
    try {
      credential = machine
        ? await machine.hostCall(step, (signal) => instance.client.credential(origin, { signal }))
        : await instance.client.credential(origin);
    } catch (error) { throw hostStop(step, error, this.nameOf(instance)); }
    return withGitCredential(credential, this.host.hostRuntime);
  }

  /** Follow the host's rename or transfer of one clone within its sync
   * (space-60), or bring a clone keyed outside its instance's folder
   * under it (DR-127): one rename at its instant, once the clone still
   * reads the remote the check read before asking the host — `remote` —
   * and records the host's id, the check's own recording of it included,
   * and still lies where the home says (renameClone). In the same step,
   * its remote takes the name of the folder it now lies under: one still
   * named `origin`, or one named by the instance it followed from
   * (space-60). */
  private async moveInSync(instance: HostInstance, machine: RepositorySync, to: string, id: string, remote: string | null, accountGeneration: number): Promise<void> {
    const store = this.host.store;
    const from = machine.key;
    const source = machine.repository.dir;
    const identity = await this.machineIdentity();
    // Nothing is awaited from here to the rename.
    try { this.assertTargetAccount(instance, accountGeneration); }
    catch (error) { throw hostStop("check", error, this.nameOf(instance)); }
    if (!machine.recordsNow(remote, id)) throw movedMeanwhile(from);
    if (store.repository(from)?.dir !== source || machine.key !== from) throw movedMeanwhile(from);
    // A sign-in at its own instance since the check read another stands.
    if (this.syncsWith(machine, true) !== instance) throw movedMeanwhile(from);
    // Its remote's name as it lies here, which its new key reads no more.
    const named = machine.remoteNameNow();
    this.renameClone(machine, to, identity);
    // The remote's rename follows the move, made where the clone now lies.
    const folder = instanceSegmentOf(to);
    if (folder !== null) machine.renameRemote(named, folder);
    await this.afterMove([{ from, to }]);
  }

  /** A clone's remote takes the name of the folder of the instance its
   * sync answers at (space-60, storage-34), its key kept: your own
   * group's own repository following another instance listing it while
   * its own is signed out, its folder kept; or a clone already under
   * that instance's folder whose follow or deferred move renamed the
   * clone but not its remote. One rename at one instant, once the clone
   * still reads the remote the check read before asking the host —
   * `remote` — and records the host's id; its fetched `spex`, its
   * upstream and this device's last sync stay with it (space-5). */
  private followByRemote(instance: HostInstance, machine: RepositorySync, id: string, remote: string | null, accountGeneration: number): void {
    try { this.assertTargetAccount(instance, accountGeneration); }
    catch (error) { throw hostStop("check", error, this.nameOf(instance)); }
    if (!machine.recordsNow(remote, id) || this.syncsWith(machine, true) !== instance) throw movedMeanwhile(machine.key);
    const folder = instance.folder();
    if (folder !== null) machine.renameRemote(machine.remoteNameNow(), folder);
  }

  /** A clone the instances migration left where it stood, a session's
   * lease holding it (DR-127), moves under its instance's folder at its
   * next sync, before anything is synced: one rename at its instant
   * (renameClone), once it still lies where the home says and is the
   * clone the migration deferred — another made at that key since stays,
   * and the receipt names the key no more; its remote, where it records
   * the host's id, takes that folder's name, and a remote the reader
   * named keeps its own. */
  private async moveDeferred(machine: RepositorySync): Promise<void> {
    const store = this.host.store;
    const from = machine.key;
    const move = store.deferredMoves().find((entry) => entry.from === from);
    if (!move) return;
    const source = machine.repository.dir;
    const identity = await this.machineIdentity();
    // Nothing is awaited from here to the rename.
    if (store.repository(from)?.dir !== source || machine.key !== from) throw movedMeanwhile(from);
    if (!isDeferredClone(move, { id: machine.recordedIdNow(), url: machine.remoteUrlNow() })) {
      store.settleDeferred([from]);
      return;
    }
    const named = machine.remoteNameNow();
    this.renameClone(machine, move.to, identity);
    const folder = instanceSegmentOf(move.to);
    if (folder !== null && machine.recordedIdNow() !== null) machine.renameRemote(named, folder);
    await this.afterMove([{ from, to: move.to }]);
  }

  /** One clone moved to `to` by one rename at its instant (space-60,
   * DR-127), synchronously within its caller's step: a session's lease
   * beneath holds it where it is — its writer resolved that path — and a
   * destination taken by anything but the clone itself — a case-only
   * rename's is the same folder — stops the sync; writers beneath resolve
   * their paths at their own instants, and a process holding the old
   * path keeps it. The store, the machine and the waiting steps follow. */
  private renameClone(machine: RepositorySync, to: string, identity: string | undefined): void {
    const store = this.host.store;
    const from = machine.key;
    const source = machine.repository.dir;
    const target = store.home.clonePath(to);
    const held = heldSessionLease(source, identity);
    if (held !== undefined) throw inUseStop("check", `sessions/${held}`, store);
    const taken = this.destinationTaken(from, to);
    if (taken === "disk") {
      throw new SpaceStopped("check", {
        cause: "git",
        message: i18n._({ id: "{path} already exists, so the clone cannot follow the host there", values: { path: `workspace/${to}` }, comment: "A stopped sync: the folder a renamed spex repository moves to is taken" }),
        guidance: i18n._({ id: "Move that folder aside, then Retry.", comment: "Guidance where a renamed spex repository's new folder is taken" }),
        retry: true,
      });
    }
    if (taken !== undefined) {
      throw new SpaceStopped("check", {
        cause: "git",
        message: i18n._({ id: "{path} waits for {other}, so the clone cannot follow the host there", values: { path: `workspace/${to}`, other: taken.waiting },
          comment: "A stopped sync: the folder a renamed spex repository moves to is where another clone, {other}, which the instances migration left at its former place, moves at its own next sync" }),
        guidance: i18n._({ id: "Sync {other} first, then Retry.", values: { other: taken.waiting }, comment: "Guidance where a renamed spex repository's new folder is another clone's destination" }),
        retry: true,
      });
    }
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    renameSync(source, target);
    pruneEmptyFolders(dirname(source), store.home.workspace);
    this.relocate([{ from, to }]);
  }

  /** What takes a clone's destination `to`, if anything: something on
   * disk but the clone itself (occupied), or another clone the instances
   * migration deferred, waiting to move there, by its key (DR-127). */
  private destinationTaken(from: string, to: string): "disk" | { waiting: string } | undefined {
    const store = this.host.store;
    if (occupied(store.home.clonePath(from), store.home.clonePath(to), store.home.workspace)) return "disk";
    const waiting = store.deferredMoves().find((move) => move.to === to && move.from !== from);
    return waiting ? { waiting: waiting.from } : undefined;
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
   * first ask after a start begins the read that start owes each
   * instance signed in with no full read of it begun since, as Refresh
   * does: once per instance, however many clients ask, and not awaited —
   * the reply is the state as it stood at the ask, and each read's
   * outcome is announced as any read's (git-host-5). */
  async get(): Promise<GroupsState> {
    const owed = this.startRead
      ? this.listedInstances().filter((instance) => this.signedInAt(instance) && !instance.fullReadBegun && !instance.reading && !instance.settingUp)
      : [];
    this.startRead = false;
    const state = await this.state();
    for (const instance of owed) {
      if (!this.signedInAt(instance) || this.stopping) continue;
      void this.setUp(instance).catch((error: unknown) => {
        console.error(`spex: reading ${instance.origin} at start failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    return state;
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
    const git = await this.probe.version();
    // The headings and their groups are read from the home at one
    // instant, with no await between, so a sign-out landing meanwhile
    // never leaves a signed-in heading without its namespace (space-30).
    const placed = this.byInstance(repositories);
    const instances = this.instancesOf(placed.groups);
    return {
      home: resolve(this.host.home),
      git,
      defaultInstance: this.defaultInstance().origin,
      signIn: this.signInState,
      // Its folder bears this device's user name until a sign-in names
      // it after a login (space-1, space-59).
      own: { name: store.home.ownName, named: store.home.ownName === store.deviceOwnName(), repositories: placed.own },
      instances,
      diagnostics,
      // One number, so the header and the list cannot drift (space-1):
      // what the reader has not answered, and everything unfolded.
      issues: countIssues(diagnostics),
    };
  }

  /** Every instance the home lists, in its order, as its heading reads
   * it (space-1, space-30), each from its own read (git-host-5), with
   * the groups `byInstance` placed under it. */
  private instancesOf(groups: Map<string, InstanceGroupState[]>): InstanceState[] {
    return this.host.store.home.instances().flatMap((entry): InstanceState[] => {
      if (!entry.account) return [];
      const instance = this.instanceAt(entry.origin);
      const signedIn = this.signedInAt(instance);
      const view = signedIn ? instance.view : undefined;
      let host: string;
      try { host = new URL(entry.origin).hostname; } catch { host = entry.origin; }
      return [{
        origin: entry.origin,
        host,
        displayName: instance.view?.displayName ?? instance.described?.displayName ?? entry.displayName ?? null,
        // What its last read said the person may do there: nothing until
        // a read is held (DR-114).
        account: { id: entry.account.id, login: entry.account.login, displayName: entry.account.displayName, canCreateGroup: view?.account.canCreateGroup ?? false },
        signedIn,
        // Said for the core's run, until its next sign-in (space-3).
        hostSignedOut: !signedIn && instance.hostSignedOut !== undefined,
        read: signedIn ? instance.readState : { phase: "idle" },
        readAt: view?.readAt ?? null,
        roles: (view?.roles ?? []).map((role) => ({ id: role.id, name: role.name, mayPush: role.mayPush })),
        groups: groups.get(entry.origin) ?? [],
      }];
    });
  }

  /** Your own group's rows, and under each instance the home lists its
   * groups, your namespace there, and each other account's login there
   * with theirs (space-1, space-30, DR-127). A signed-in instance holds
   * your namespace, and every group its own read lists; a row stands
   * under the group the instance governing it (git-host-5) last named for
   * it, at that instance's heading — a clone whose instance is signed out
   * under the signed-in instance its next sync follows — and under its
   * key's group at its own instance only where no read lists it; your own
   * group's own repository, a row keyed in your own group's folder that
   * no read lists, and a row of an instance the home does not list stand
   * under your own group alone. Entries are known by the instance and the
   * group's id, a namespace by the instance and its login, so no group
   * displaces your own group or takes its rows. */
  private byInstance(placed: Placed[]): { own: RepositoryState[]; groups: Map<string, InstanceGroupState[]> } {
    const home = this.host.store.home;
    const ownName = home.ownName;
    const noCan = (): InstanceGroupState["can"] => ({ createSubgroup: false, manageMembers: false, rename: false, delete: false });
    interface Heading { login: string; entries: InstanceGroupState[]; byId: Map<string, InstanceGroupState>; byPath: Map<string, InstanceGroupState>; logins: Map<string, InstanceGroupState> }
    const headings = new Map<string, Heading>();
    const namespace = (heading: Heading, login: string): InstanceGroupState => {
      let entry = heading.logins.get(login.toLowerCase());
      if (!entry) {
        entry = { id: null, login, mine: sameLogin(login, heading.login), fullPath: login, name: login, can: noCan(), repositories: [] };
        heading.entries.push(entry);
        heading.logins.set(login.toLowerCase(), entry);
      }
      return entry;
    };
    const unlisted = (heading: Heading, path: string): InstanceGroupState => {
      let entry = heading.byPath.get(path);
      if (!entry) {
        entry = { id: null, login: null, mine: false, fullPath: path, name: path.split("/").pop() ?? path, can: noCan(), repositories: [] };
        heading.entries.push(entry);
        heading.byPath.set(path, entry);
      }
      return entry;
    };
    for (const instance of home.instances()) {
      if (!instance.account) continue;
      const heading: Heading = { login: instance.account.login, entries: [], byId: new Map(), byPath: new Map(), logins: new Map() };
      headings.set(instance.origin, heading);
      const at = this.instanceAt(instance.origin);
      // Your namespace at every instance signed in to (space-1).
      if (this.signedInAt(at)) namespace(heading, heading.login);
      // Every group its own read lists (git-host-5).
      const view = this.viewOf(at);
      if (!view) continue;
      for (const group of this.listedGroups(at, view)) {
        if (group.kind === "user") continue;
        const can = group.can;
        const entry: InstanceGroupState = { id: group.id, login: null, mine: false, fullPath: group.fullPath, name: group.name, can: { createSubgroup: can.createSubgroup, manageMembers: can.manageMembers, rename: can.rename, delete: can.delete }, repositories: [] };
        heading.entries.push(entry);
        if (group.id !== null) heading.byId.set(group.id, entry);
        if (!heading.byPath.has(group.fullPath)) heading.byPath.set(group.fullPath, entry);
      }
    }
    const own: RepositoryState[] = [];
    // The rows a read lists first, so every login's entry stands before
    // a row no read lists falls back to its key.
    for (const { row, group, instance } of placed) {
      if (!group) continue;
      const heading = instance === undefined ? undefined : headings.get(instance);
      if (row.own || !heading) { own.push(row); continue; }
      const entry = group.kind === "user"
        ? namespace(heading, group.fullPath)
        : (group.id !== null && heading.byId.get(group.id)?.fullPath === group.fullPath ? heading.byId.get(group.id)! : unlisted(heading, group.fullPath));
      entry.repositories.push(row);
    }
    for (const { row, group } of placed) {
      if (group) continue;
      const heading = row.instance === null ? undefined : headings.get(row.instance);
      const { instance: folder, group: path } = splitKey(row.key);
      if (row.own || !heading || (folder === null && path === ownName)) { own.push(row); continue; }
      const entry = heading.logins.get(path.toLowerCase()) ?? (sameLogin(path, heading.login) ? namespace(heading, path) : unlisted(heading, path));
      entry.repositories.push(row);
    }
    const groupsOwn = (entry: InstanceGroupState, row: RepositoryState): boolean => row.name === `${entry.fullPath.split("/").pop()}-spex`;
    own.sort((a, b) => Number(b.own) - Number(a.own) || a.key.localeCompare(b.key));
    const groups = new Map<string, InstanceGroupState[]>();
    for (const [origin, heading] of headings) {
      for (const entry of heading.entries) {
        entry.repositories.sort((a, b) => Number(groupsOwn(entry, b)) - Number(groupsOwn(entry, a)) || a.key.localeCompare(b.key));
      }
      groups.set(origin, heading.entries.sort((a, b) => a.fullPath.localeCompare(b.fullPath)));
    }
    return { own, groups };
  }

  /** A clone's state as the last answer of the instance governing it
   * (git-host-5) and this device's files make it (space-61), with the
   * group that instance's last read names for it, where it lists it, and
   * that instance, whose heading it stands under (space-1); every other
   * instance listing it changes nothing of it. */
  private overlay(machine: RepositorySync, base: RepositoryState): Placed {
    const facts = machine.facts;
    const waiting = this.waiting.get(base.key);
    // What a pick, a join or a pairing changed since the machine's last
    // reading is read afresh: its remote, its id and its working folder.
    // A remote at the host reads as its path in the instance (space-15).
    const row: RepositoryState = {
      ...base,
      instance: this.cloneInstance(base.key, facts.remoteName),
      governing: null,
      id: facts.id,
      remote: this.remoteAsShown(facts, base.key),
      folder: this.host.store.home.folderOf(base.key)?.path ?? null,
      waiting: waiting ? { step: waiting.step, group: waiting.group, message: waiting.message } : null,
    };
    if (facts.remote === null) return { row: { ...row, state: "local-only", reason: null } };
    // A remote the reader named, a path this device reaches: no host.
    if (!this.atHost(facts, this.servingOf(machine))) return { row };
    // An instance signed out leaves its rows unreachable until its next
    // sign-in, where no signed-in instance lists them (space-6, space-61,
    // git-host-4).
    const instance = this.rowInstance(machine);
    if (!instance) return { row: { ...row, state: "unreachable", reason: signInAgain() } };
    // That instance governs it, its members panel and its Sync's refusal
    // reading it (space-1, space-30).
    const governed: RepositoryState = { ...row, governing: instance.origin };
    // Attached since the view's read began, it counts as listed (git-host-5).
    const target = this.targetOf(instance, facts);
    const listing = this.listingOf(instance, facts);
    const group = listing?.repository.group;
    const at = instance.origin;
    // What the host's listing says, the person's rights on it among it
    // (git-host-5, DR-114).
    const listed: RepositoryState = listing
      ? { ...governed, members: listing.members, visibility: listing.repository.visibility, can: { manageMembers: listing.repository.can.manageMembers, transfer: listing.repository.can.transfer } }
      : governed;
    // A clone whose join still runs is not on this device yet: its code
    // may still be cloning (space-61, space-63).
    const joinedAt = this.instanceOfClone(machine);
    const joining = facts.id === null || !joinedAt ? undefined : this.joining.get(this.joinKey(joinedAt, facts.id));
    if (joining?.phase === "running") return { row: { ...listed, state: "absent", reason: null, sync: joining }, group, instance: at };
    // A group named like a login holds no folder of its own (space-61).
    if (this.collides(group, target?.catalog ?? instance.view)) return { row: { ...listed, state: "unreachable", reason: namedLikeYourLogin() }, group, instance: at };
    if (machine.hostOverride) return { row: { ...listed, state: machine.hostOverride.state, reason: machine.hostOverride.reason }, group, instance: at };
    if (target?.failure && target.begun > instance.failureRead) return { row: { ...listed, state: "unreachable", reason: target.failure }, group, instance: at };
    if (instance.readFailure !== undefined && (!target || instance.failureRead > target.begun)) return { row: { ...listed, state: "unreachable", reason: instance.readFailure }, group, instance: at };
    // No full or selected reading of its instance since this core started.
    if (!instance.view && !target) return { row: governed };
    if (!listing) return { row: { ...governed, state: "unreachable", reason: noLongerShared() } };
    if (listing.readOnly) {
      return { row: { ...listed, state: "read-only", reason: listing.readOnly.message || i18n._({ id: "Archived", comment: "A spex repository's read-only reason where the host gave no words for its archive" }) }, group, instance: at };
    }
    return { row: { ...listed, state: "reachable", reason: null }, group, instance: at };
  }

  /** A row for every spex repository a signed-in instance lists and no
   * clone here stands for (space-61: "Not on this device"), each from that
   * instance's own read (git-host-5), keyed under its folder as its clone
   * would be (DR-127): a host repository several signed-in instances
   * list by one Git origin and id is one row, under the earliest of them
   * in the home's list, every later listing only withholding Join
   * (space-1); one in a group held as colliding reads unreachable, keyed
   * `<folder>/<path>@<id>` so it names no clone (space-30). */
  private absentRows(): Placed[] {
    const store = this.host.store;
    // A clone the instances migration deferred, listed by the key it
    // keeps, holds the key it moves to (DR-127).
    const deferred = new Set(store.deferredMoves().map((move) => move.to));
    const own = store.home.own();
    const clones = store.listRepositories().flatMap((repository) => {
      const machine = this.machines.get(repository.key);
      return machine ? [machine] : [];
    });
    // The host repositories an earlier instance's listing stands for, by
    // its Git origin and id.
    const earlier: { gitOrigin: string; id: string }[] = [];
    const rows: Placed[] = [];
    for (const instance of this.listedInstances()) {
      const view = this.viewOf(instance);
      const folder = instance.folder();
      if (!view || folder === null) continue;
      // Every clone here stands for the listing it matches, whatever
      // instance it lies under (git-host-5); your own group's own
      // repository, recording no id yet, for the one your namespace at
      // its instance lists under its name (space-4): never absent.
      const matched = new Set<string>();
      for (const machine of clones) {
        const facts = machine.facts;
        const listing = listingFor(view, facts.id, facts.remote)
          ?? (machine.key === own && facts.id === null && this.servingOf(machine) === instance ? this.ownNamespaceListing(view) : undefined);
        if (listing) matched.add(listing.repository.id);
      }
      for (const listing of view.listings) {
        const repository = listing.repository;
        if (matched.has(repository.id)) continue;
        if (earlier.some((entry) => entry.id === repository.id && sameOrigin(entry.gitOrigin, view.gitOrigin))) continue;
        earlier.push({ gitOrigin: view.gitOrigin, id: repository.id });
        const row = this.absentRow(instance, folder, view, listing, deferred);
        if (row) rows.push(row);
      }
    }
    return rows;
  }

  /** The row of one spex repository an instance lists and no clone here
   * stands for, keyed under that instance's folder, or none where its
   * names cannot stand as a key or its key holds a clone or a deferred
   * clone's destination. */
  private absentRow(instance: HostInstance, folder: string, view: HostView, listing: HostListing, deferred: Set<string>): Placed | undefined {
    const store = this.host.store;
    const repository = listing.repository;
    const colliding = this.collides(repository.group, view);
    const path = `${repository.group.fullPath}/${repository.path}`;
    const key = colliding ? `${folder}/${path}@${repository.id}` : hostKey(repository, folder);
    if (!key || (!colliding && (store.repository(key) || deferred.has(key)))) return undefined;
    const code = repository.project && typeof repository.project.remote === "string" ? this.codeRemoteAsShown(repository.project.remote, instance.origin) : null;
    return {
      row: {
        key,
        // The instance whose read lists it (DR-127), which governs it
        // (git-host-5).
        instance: instance.origin,
        governing: instance.origin,
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
        sync: colliding ? { phase: "idle" } : this.joining.get(this.joinKey(instance, repository.id)) ?? { phase: "idle" },
      },
      group: repository.group,
      instance: instance.origin,
    };
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
    // On a seat your own group takes no remote (space-102).
    if (this.host.seat && key === this.host.store.home.own()) throw new CoreError("invalid_request", ownStaysOnTheServer());
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

  /** An instance's rate limit began holding every call to it
   * (git-host-21): each step of a clone at that instance with a call in
   * flight offers Stop (space-16). Read once the answer that set the hold
   * has run its course, so the step whose own call it answered has
   * stopped rather than offering Stop. */
  holdBegan(origin: string): void {
    const held = canonicalOrigin(origin);
    setImmediate(() => {
      for (const machine of this.machines.values()) {
        if (this.syncingOf(machine).origin === held) machine.holdBegan();
      }
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

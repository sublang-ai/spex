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
import { InstanceRefused, kebab, REMOTE_URL_KEYS, remoteNamesIn, splitKey, type HomeAccount } from "./home.js";
import { i18n } from "./i18n.js";
import { canonicalOrigin, instanceFolder, instanceSegmentOf, isInstanceFolder, OriginRefused, parseOrigin, type OriginRefusal } from "./instance.js";
import { isDeferredClone } from "./migrate-instances.js";
import { deletePlacementFile, filedIn, keyPlacement, LEGACY_CREATED_KEY, LEGACY_ID_KEY, moveLegacyIds, PATH_PLACEMENT, PLACEMENT_CONFIG_KEYS, PLACEMENTS_DIR, placementCreatedKey, placementFileEverHeld, placementFilePath, placementIdKey, placementsIn, readPlacementFiles, readPlacements, writePlacementFile, type HistoryRun, type Placement, type PlacementFile, type PlacementPrefKind } from "./placements.js";
import type {
  GroupsState,
  InstanceGroupState,
  InstanceState,
  PlacementBranch,
  PlacementState,
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
  classifyHostTransportFailure, classifyTransportFailure, displayRemote, GitMissingError, hostErrorStatus, lastLines, remoteHost, membersDecide, noLongerShared,
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

/** A step about to run (SpaceHost.beforeStep): `placement` names the
 * placement whose turn it is — its instance's origin, or null for the
 * path placement — absent for Save (space-12, space-31). */
export interface SpaceStepEvent { op: SpaceOp; step: SyncStep; repository: string; placement?: string | null; at?: "commit" | "catch-up" }

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
   * between them deterministically; a placement's step names that
   * placement, and a push after every placement's turn is the catch-up's
   * (`at: "catch-up"`, space-12). */
  beforeStep?: (event: SpaceStepEvent) => void | Promise<void>;
  /** A new client of the instance at a canonical origin (git-host-1..11,
   * DR-127): its own app token, refresh and rate-limit hold. The space
   * asks once per instance and keeps it for the run. */
  clientFor: (origin: string) => GitHostClient;
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

/** What a spex repository's clone says of its host: its first
 * placement's remote URL and the host's id recorded beside it
 * (git-host-5, storage-34), and that remote's name in the clone
 * (DR-127) — its key placement's, else its path placement's. */
interface CloneFacts { remote: string | null; id: string | null; remoteName: string | null; remotes?: string }

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

/** The name a placement's remote takes in a clone (storage-34): the
 * folder of the instance it is at, `origin` only where that instance's
 * origin stands as no folder. */
function placementName(folder: string | null): string {
  return folder ?? PATH_PLACEMENT;
}

/** What a clone's first placement says of its host (storage-31): its
 * key placement's remote and id, else its path placement's, else none;
 * and every placement's remote as read, which a write after awaiting
 * the host finds still standing (space-21). */
function factsOf(placements: readonly Placement[]): CloneFacts {
  const first = placements[0];
  return { remote: first?.url ?? null, id: first?.id ?? null, remoteName: first?.name ?? null, remotes: remotesRead(placements) };
}

/** A clone's placements' remotes, by their names and URLs in order. */
function remotesRead(placements: readonly Placement[]): string {
  return JSON.stringify(placements.map((placement) => [placement.name, placement.url]));
}

/** A remote URL's last segment, without `.git`: a placement's path
 * where no listing names it (space-87). */
function remoteSegment(url: string): string {
  return /([^/:]+?)(?:\.git)?\/*$/.exec(url)?.[1] ?? url;
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
 * where it lists it (space-1), and that instance's origin; and every
 * other group the listing of one of its placements names, at the
 * instance governing that placement, where it shows one line naming
 * the row (space-1, DR-128). */
interface Placed { row: RepositoryState; group?: HostGroup; instance?: string; elsewhere?: { instance: string; group: HostGroup }[] }

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
  /** A Place's creation (space-97), a placement beside the clone's
   * others, and whether the reader saw its notice there (space-57): it
   * ends once the clone holds a placement at that instance, or none with
   * an instance. */
  place?: { noticed: boolean };
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

/** The refusal of Forget while projects are still placed at the
 * instance by a placement beside their key placement (space-82): each
 * named, beneath its heading. */
const stillPlacedAt = (host: string, names: readonly string[]): string => i18n._({
  id: "Still placed at {host}: {names}",
  values: { host, names: new Intl.ListFormat(i18n.locale || "en", { type: "conjunction", style: "narrow" }).format(names) },
  comment: "Refusal of Forget: spex repositories kept under another instance that are still placed at this one too, no signed-in instance listing that placement; {host} is the instance's display name, {names} the repositories' names as a list",
});

/** The refusal of a sync of a clone no instance holds (space-11). */
const pickAGroupFirst = (): string => i18n._({
  id: "Pick a group first",
  comment: "Refusal: the spex repository is only on this device; a group must be picked for it",
});

/** The refusal of a pick naming another instance than the one whose
 * folder the clone's key lies in (space-29, space-58). */
const pickAtItsInstance = (name: string, host: string): string => i18n._({
  id: "{name} is kept under {host}; pick a group there",
  values: { name, host },
  comment: "Refusal of a pick: the spex repository's folder lies under one instance, and the pick named a group at another; {name} is the repository's name, {host} its instance's display name",
});

/** The refusal of a pick's or a Place's join into a spex repository with
 * other members before the reader has seen the sharing notice (space-57,
 * space-29). */
const readNoticeBeforeJoining = (name: string): string => i18n._({
  id: "Read the sharing notice before joining {name}",
  values: { name },
  comment: "Refusal of a pick joining a spex repository with other members until the reader has seen the privacy notice",
});

/** The refusal of a pick's or a Place's new name holding nothing of a
 * name (space-29). */
const nameNeedsALetter = (): string => i18n._({ id: "The name must hold a letter or a digit", comment: "Refusal of a new spex repository's name with nothing of a name in it" });

/** The refusal of a pick or a Place naming a group the instance's view
 * does not list (space-29, git-host-6). */
const noSuchGroup = (): string => i18n._({ id: "The host lists no such group", comment: "Refusal of a pick naming a group the Git host does not list" });

/** The refusal of a Place of a group's own spex repository or your own
 * group's, and of an Attach of a group's own (space-29, space-88,
 * space-87): a project's alone is placed by the reader. */
const groupRecordsStay = (name: string): string => i18n._({
  id: "{name} holds a group's records; only a project's are placed at another instance",
  values: { name },
  comment: "Refusal of Place or Attach: the spex repository is a group's own (or, for Place, your own group's), which stays at its one instance; {name} is the repository's name",
});

/** The refusal of a Place or an Attach at an instance the clone holds a
 * placement at already (space-29). */
const placedAlready = (name: string, host: string): string => i18n._({
  id: "{name} is placed at {host} already",
  values: { name, host },
  comment: "Refusal of Place or Attach: the spex repository already has a placement at that instance; {name} is the repository's name, {host} the instance's display name",
});

/** The refusal of an Attach at an instance no placement file of the
 * clone names a listed host repository at (space-29). */
const noFiledPlacement = (name: string, host: string): string => i18n._({
  id: "No placement file of {name} names a spex repository {host} lists",
  values: { name, host },
  comment: "Refusal of Attach: none of the spex repository's placement files names a spex repository that the instance lists for this account; {name} is the repository's name, {host} the instance's display name",
});

/** The refusal of an Attach sent before the reader saw its sharing
 * notice, which Attach is (space-90, space-29). */
const readNoticeBeforeAttaching = (name: string): string => i18n._({
  id: "Read the sharing notice before attaching {name}",
  values: { name },
  comment: "Refusal of Attach until the reader has seen the privacy notice for that placement: every record reaches its members; {name} is the spex repository's name at that instance",
});

/** The refusal of a join — a pick's, a Place's or an Attach's — of a
 * host repository another clone here holds as a placement (space-29,
 * git-host-5). */
const heldByAnother = (name: string, repository: string): string => i18n._({
  id: "{name} is on this device already, as a placement of {repository}",
  values: { name, repository },
  comment: "Refusal of a pick, Place or Attach that joins the spex repository {name} listed at an instance, already held on this device by the spex repository {repository}, which syncs with it",
});

/** The refusal of a Place while the view does not say the person may
 * manage the members of every placement the clone holds (space-29,
 * space-88). */
const mayNotManageEvery = (name: string): string => i18n._({
  id: "Placing {name} elsewhere needs the right to manage the members of each of its placements",
  values: { name },
  comment: "Refusal of Place: the person may not manage the members of every placement the spex repository holds, and placing it shares its records with more people; {name} is the repository's name",
});

/** The refusal of a Leave of a group's own spex repository or your own
 * group's (space-29, space-89): a project's placement alone is left. */
const groupRecordsKept = (name: string): string => i18n._({
  id: "{name} holds a group's records; only a project's are removed from an instance",
  values: { name },
  comment: "Refusal of Leave: the spex repository is a group's own or your own group's, whose placements Leave does not remove; {name} is the repository's name",
});

/** A Leave stopped, unconfirmed, for records of the placement left or
 * of the clone that no remaining placement received (space-98), naming
 * their count. */
const unreceivedRecords = (count: number): string => i18n._({
  id: "{count, plural, one {# record has} other {# records have}} reached no other placement",
  values: { count },
  comment: "A stopped Leave: that many records, of the placement being removed or of this device, are held by none of the spex repository's other placements, as this device last fetched or pushed them; a second confirmation removes it anyway",
});

/** A Leave stopped, unconfirmed, for a placement it could not read
 * (space-98), naming that placement's instance. */
const leftBehind = (host: string): string => i18n._({
  id: "Records pushed to {host} since the last sync may be left behind",
  values: { host },
  comment: "A stopped Leave: the placement being removed, at the instance {host} (its display name), could not be read, so records others pushed there since this device's last sync with it would not reach this device; a second confirmation removes it anyway",
});

/** Guidance under a Leave stopped before anything was removed
 * (space-98, space-89). */
const confirmToRemove = (): string => i18n._({
  id: "Confirm to remove it anyway.",
  comment: "Guidance under a stopped Leave: confirming again removes the placement whatever it holds",
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

/** A failure of a call to the host as the stopped state of space-15,
 * stopping its placement alone — the host's answer, the sign-in changed
 * meanwhile at that instance (git-host-22, git-host-4), and anything else
 * a call to it throws, none of which is Git's own error; a stop already
 * phrased passes as it is. */
function hostStop(step: SyncStep, error: unknown, host: string): SpaceStopped {
  if (error instanceof SpaceStopped) return error;
  const message = relayHostError(error, host);
  if (error instanceof CredentialChanged) return new SpaceStopped(step, { cause: "reauth", message, guidance: signInThenRetry(), retry: true }, false);
  if (!(error instanceof HostError)) return new SpaceStopped(step, { cause: "git", message: lastLines(message), guidance: retryGuidance(), retry: true }, false);
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
 * rename — a Check cause, stopping its placement alone (space-15). */
function movedMeanwhile(key: string): SpaceStopped {
  return new SpaceStopped("check", { cause: "git", message: changedMeanwhile(`workspace/${key}`), guidance: retryGuidance(), retry: true }, false);
}

/** A first placement's drop refused, the clone neither dropped nor
 * moved, where no read of the core's run has placed its next placement
 * (storage-38): naming that placement's instance, its drop waiting for
 * the next sync (space-91). */
function nextUnread(host: string): SpaceStopped {
  return new SpaceStopped("check", {
    cause: "unreachable",
    message: i18n._({
      id: "{host} is not read yet, so the clone cannot move to its path there",
      values: { host },
      comment: "A stopped sync: a placement of a spex repository is dropped, which moves its clone to the path of its next placement, at the instance {host} (its display name), which the core has not read since it started",
    }),
    guidance: i18n._({ id: "Refresh, then Retry.", comment: "Guidance where the core must read an instance before a spex repository's clone can move to its path there" }),
    retry: true,
  }, false);
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
      /** The placements this read found (storage-34), the first the one
       * `remote` and `id` are of. */
      placements: Placement[];
      /** Whether `spex`'s upstream is the clone's remote (space-12). */
      upstream: boolean;
      originSpex: string | null;
      /** Each placement's `spex` as the clone last fetched or pushed it,
       * by its remote's name: the first's is `originSpex`. */
      spex: ReadonlyMap<string, string | null>;
      mergePending: boolean;
    };
type ReadyRepository = Extract<RepositoryInfo, { root: true }> & { head: string; remote: string };
/** A clone's row as its machine reads it at one instant, each line
 * carrying what this device holds of its placement, the placements
 * those lines are of, in their order, and the placements its placement
 * files name as they stand (space-30, space-87, storage-41). */
interface MachineRead { row: RepositoryState; held: Placement[]; files: PlacementFile[] }

/** The steps a placement's own turn runs at its host (space-12): a
 * stop there stops that placement alone. */
const PLACEMENT_STEPS = new Set<SyncStep>(["check", "compare", "push"]);

/** A step ended in the stopped state of space-15. */
class SpaceStopped extends Error {
  /** Whether the stop ends the whole sync, no later placement running
   * (space-15): a Save's, an Apply's or a Refresh's stop, Stop, and Git's
   * own error; any other Check, Compare or Push cause stops its placement
   * alone. Git's own error is named so only where it is classified — a
   * transport no rule reads, or a step's error no rule phrases — never
   * read from its cause, which a clone changed meanwhile at a Check's
   * move and a host's answer with an HTTP status share. */
  readonly whole: boolean;
  constructor(readonly step: SyncStep, readonly failure: GitFailure, whole?: boolean) {
    super(failure.message);
    this.name = "SpaceStopped";
    this.whole = whole ?? (!PLACEMENT_STEPS.has(step) || failure.cause === "stopped");
  }
}

/** A placement whose sharing notice is owed and not yet continued
 * (space-57, git-host-22): its turn ends waiting for Continue before any
 * branch or transport effect, its line reading so, and the next
 * placement runs; a sync none of whose placements went stops with it. */
class NoticeOwed extends SpaceStopped {
  constructor(message: string) {
    super("check", { cause: "refused", message, guidance: retryGuidance(), retry: true }, false);
    this.name = "NoticeOwed";
  }
}

/** Your own group's own repository found placed at an instance, or
 * waiting there, once the operation placing it there began (space-4):
 * nothing to add, the clone and its lines left as they were. */
class OwnPlacedMeanwhile extends Error {
  constructor() {
    super("placed meanwhile");
    this.name = "OwnPlacedMeanwhile";
  }
}

/** What a sync's admission found of one placement it read (space-57,
 * git-host-22): its notice owed, or its first-notice read failed, either
 * stopping that placement alone at its turn, no step run there. */
type PlacementAdmission = { kind: "waiting"; stop: NoticeOwed } | { kind: "stopped"; stop: SpaceStopped };

interface PlanRevisions { ours: string | null; theirs: string; base: string }
/** The last plan's revisions and units; `oursTree` is the tree object
 * mine was read from — the working tree's temporary-index tree outside
 * a sync, HEAD inside one — so a diff covers a new file too. */
interface LastPlan extends PlanRevisions { oursTree: string; units: StorageMergeUnit[] }
interface Lists { local: SpaceUnit[]; incoming: SpaceUnit[]; conflicts: SpaceConflict[] }
/** What this core's last check, compare and plan learnt of one placement
 * of a clone (space-8, space-31, space-33), held by its remote's name for
 * the core's run, moving with its rename and leaving with the remote:
 * persisted nowhere. */
interface PlacementRun {
  /** When its `spex` was last checked; null before any check. */
  checkedAt: number | null;
  /** Its host held no `spex` at that check. */
  remoteEmpty: boolean;
  /** Its `spex` shared no ancestor with the clone's at the last plan. */
  unrelated: boolean;
  /** What its last transport learnt of its host before its instance's
   * next read (space-15): a refusal turns it read-only, a missing
   * repository unreachable. */
  hostOverride?: { state: "read-only" | "unreachable"; reason: string };
  /** Its lists against its `spex` (space-7, space-8). */
  lists: Lists;
  /** Its plan, which `space.diff` and a choice's validation read. */
  plan?: LastPlan;
  /** What the last operation left on its line (space-87, space-12):
   * cleared as the next operation on the clone begins. */
  outcome?: PlacementOutcome;
  /** A Place joined its host repository (space-97), or an Attach added
   * it (space-99): its next Compare joins the two histories as any two,
   * with no second confirmation, should that act's own sync stop before
   * it (space-13). */
  joinOwed?: boolean;
}
/** What a sync or check left on a placement's line (space-30). */
type PlacementOutcome = NonNullable<PlacementState["outcome"]>;
/** The placement a sync's choices, join and notice are for (space-29):
 * by its remote's name as admission read it, and whether it was the
 * clone's first then, which a follow at its Check may rename (space-60). */
interface SyncTarget { name: string; first: boolean }
/** What an admitted sync runs with (space-12): the operation it is —
 * a Sync, or a Place's sync once its placement is added (space-31) —
 * the choices, join and set-up for its target placement, and what
 * admission stopped of each placement (space-57). */
interface SyncInput {
  op: SpaceOp;
  choices: Record<string, StorageChoice>;
  join: boolean;
  setUp: boolean;
  admission: ReadonlyMap<string, PlacementAdmission>;
  target: SyncTarget;
}
/** What a sync carries into each placement's turn (space-12). */
interface TurnInput {
  choices: Record<string, StorageChoice>;
  join: boolean;
  /** A set-up join's own Saves (space-59), for the placement it joins. */
  setUpSaves?: ReadonlySet<string>;
  /** A turn run again after its catch-up push was rejected: a push
   * rejected once more leaves it behind (space-12). */
  catchUp?: boolean;
}
/** One placement's turn of a sync, as it ended (space-12): its remote's
 * name and URL as it ended, its instance's origin and the instance whose
 * credential its transport took, what it ended in, and its counts so far
 * in this sync. */
interface Turn {
  first: boolean;
  name: string;
  origin: string | null;
  remote: string;
  at: HostInstance | undefined;
  readOnly: boolean;
  outcome: PlacementOutcome;
  /** When its turn completed through its Push, recorded as its last sync. */
  syncedAt?: number;
  pushed: boolean;
  tally: { sent: number; received: number };
  /** For a turn waiting for its notice's Continue, the stop the sync
   * reads where no placement went (space-57). */
  notice?: GitFailure;
  /** Its placement dropped by a merge of this sync (space-91): its line
   * gone, nothing is pushed to it. */
  dropped?: boolean;
}
/** What reconciling a clone's placements with their files did to one
 * placement it could not keep (space-91, storage-38): followed to
 * another instance, its remote renamed; dropped; or its drop or follow
 * waiting, refused with the stop its line reads. */
type PlacementFate =
  | { kind: "followed"; name: string }
  | { kind: "dropped" }
  | { kind: "withheld"; stop: SpaceStopped };
/** A turn whose Apply met a unit changed since its base (space-19): the
 * sync runs again from Save; the placement's remote's name, and the
 * placement for a later one. */
interface Restart { restart: string; placement: Placement | undefined }
/** Units in the order a list shows them (space-7): by kind, then label. */
const unitOrder = (a: SpaceUnit, b: SpaceUnit): number =>
  KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label) || a.unit.localeCompare(b.unit);
/** A selection to apply at one placement (space-19): `placement` its
 * instance's origin, null for the path placement, which the repair
 * marker records (space-31). */
interface Pending { head: string; origin: string; base: string; units: StorageMergeUnit[]; resolved: Map<string, StorageChoice>; counts: { sent: number; received: number }; placement: string | null }
interface Applied { headBefore: string; headAfter: string }
interface ApplyMarker { v: 1; placement?: string | null; ours: string; theirs: string; base: string; choices: Record<string, StorageChoice>; at: number }
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
  if (parts[0] === PLACEMENTS_DIR && (parts.length === 1 ? isDirectory : parts.length === 2 && !isDirectory && /\.yaml$/.test(base))) return "placement";
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
/** Whether a listed repository may have members besides the account: a
 * count above one, or none where the host's read lacked it (space-57,
 * git-host-5). */
const mayHaveOthers = (listing: HostListing): boolean => listing.members === null || listing.members > 1;
/** A placement's last completed sync as the preferences record it
 * (space-22, storage-5): `{at, sent, received}`, else none. */
function lastSyncIn(stored: unknown): { at: number; sent: number; received: number } | null {
  const value = stored as { at?: unknown; sent?: unknown; received?: unknown } | null | undefined;
  return value && typeof value.at === "number" && typeof value.sent === "number" && typeof value.received === "number"
    ? { at: value.at, sent: value.sent, received: value.received }
    : null;
}

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

/** A spex repository's read-only reason where the host gave no words
 * for its archive (space-61). */
const archivedReason = (): string => i18n._({ id: "Archived", comment: "A spex repository's read-only reason where the host gave no words for its archive" });

/** The refusal an act naming a unit no plan holds meets. */
const unknownUnit = (unit: string): string => i18n._({
  id: "unknown unit {unit}",
  comment: "Refusal: the act names a unit the current plan does not hold",
  values: { unit },
});

/** The refusal a command naming a placement the clone does not hold
 * meets (space-29): an instance it holds none at, or a path placement
 * where it holds none. */
const noSuchPlacement = (name: string): string => i18n._({
  id: "{name} holds no such placement",
  values: { name },
  comment: "Refusal: the command names a placement — an instance, or the remote the reader named — that the spex repository {name} does not hold",
});

/** Units that count as something a removal would lose (projects-9):
 * every record but what the clone regenerates. */
const RECORD_KINDS = new Set<SpaceUnitKind>(["session", "intent", "authoring", "environment", "settings", "other"]);

/** The record units (projects-9) that some tree of `held` holds and no
 * tree of `others` holds identically — every one where none is given
 * (space-98, projects-9): each unit grouped across every tree as a sync
 * plans it (storage-11), the placement files, which name placements
 * rather than hold records, left out. A placement stands in `others` by
 * each tree that reached it (reachedTrees). */
function unitsHeldByNone(held: readonly StorageTree[], others: readonly StorageTree[]): string[] {
  const files = new Set<string>();
  for (const tree of [...held, ...others]) for (const file of tree.keys()) files.add(file);
  const packages = specPackageFolders(files);
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const unit = storageUnitName(file, packages);
    const paths = groups.get(unit);
    if (paths) paths.push(file);
    else groups.set(unit, [file]);
  }
  const unheld: string[] = [];
  for (const [unit, paths] of groups) {
    if (unit.startsWith(`${PLACEMENTS_DIR}/`) || !RECORD_KINDS.has(spaceUnitKind(unit))) continue;
    const reached = (tree: StorageTree): boolean => !paths.some((path) => tree.has(path)) || others.some((other) => paths.every((path) => tree.get(path) === other.get(path)));
    if (!held.every(reached)) unheld.push(unit);
  }
  return unheld.sort();
}

/** One spex repository's sync machine (space-31): one operation on this
 * clone at a time — a second Sync or Check joins it — any number of
 * clones at once; it refuses nothing beneath the clone (space-21). */
class RepositorySync {
  git: SpaceGit;
  /** The running operation's progress, else the last one's outcome. */
  phase: SpaceSyncPhase = { phase: "idle" };
  /** The clone's first placement's remote and recorded id as its last
   * read found them; every decision reads them again first. */
  facts: CloneFacts = { remote: null, id: null, remoteName: null };
  /** The clone's placements as its last read found them (storage-34):
   * its instance placements in the order added, then its path
   * placement; the first is the one `facts` holds. */
  placements: Placement[] = [];
  /** The remote `spex`'s upstream names, as the last read found it: a
   * remote taken away leaves it, beside the host's `spex` the clone
   * holds (space-5). */
  private upstreamName: string | null = null;
  /** What this core learnt of each placement — its check, its plan and
   * lists, its host's last refusal — by its remote's name (space-8,
   * space-31, space-33). */
  private readonly runs = new Map<string, PlacementRun>();
  /** The working tree's plan against `HEAD`: what the lists read where
   * no placement has been checked (space-7, space-33). */
  private unchecked?: LastPlan;
  /** The clone's local units: those local against some checked
   * placement, else against `HEAD` (space-7). */
  private local: SpaceUnit[] = [];
  /** The operation running on this clone: its kind and its promise. */
  private current?: { op: SpaceOp; work: Promise<void> };
  /** The last sync asked while its admission runs, settling once it runs
   * or joins one running: a Place or an Attach asked meanwhile follows it
   * (space-21). */
  private asked?: Promise<void>;
  /** The renames of the clone's placements' remotes since this sync
   * last read its placements — a follow's (space-60) and a reconcile's
   * (space-91) — by the name each bore: a placement read before is found
   * again by the name it bears now. */
  private readonly renamed = new Map<string, string>();
  /** What this sync's reconciles left of the placements they could not
   * keep (space-91, storage-38), by the name each bore then: dropped, or
   * its drop or follow waiting, with the stop its line reads. */
  private readonly swept = new Map<string, "dropped" | SpaceStopped>();
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
  /** The last sync the clone held with each placement at its last
   * reading, by its remote's name, with the pair of commits it was read
   * from: a pair always reads the same. */
  private readonly agreedRead = new Map<string, { pair: string; agreed: Agreed | null }>();

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

  /** The origin of the instance a placement's turn goes to, where it is
   * not the clone's first (space-12) — its own, or the instance governing
   * it once its Check reads that one (git-host-22): its step's calls to
   * the host go there, held by that instance's rate limit (git-host-21). */
  turnAt?: string;

  /**
   * One call to the host for the running step (git-host-21): while the
   * rate limit of the instance its turn goes to holds it, the step offers
   * Stop (space-16), which ends the wait — a direct call sending nothing,
   * a shared read left to answer later — and stops the step (space-15).
   */
  async hostCall<T>(step: SyncStep, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    this.hostCalls.add(controller);
    if (this.owner.turnInstance(this).client.holding()) this.offerStop();
    try {
      return await stoppable(call(controller.signal), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) throw waitStopped(step, this.owner.turnName(this));
      throw error;
    } finally {
      this.hostCalls.delete(controller);
    }
  }

  /** The rate limit of the instance its turn goes to began holding the
   * calls (git-host-21): a step with one in flight offers Stop. */
  holdBegan(): void {
    if (this.hostCalls.size > 0) this.offerStop();
  }

  /** End the waits of the running step's calls to the host, while the
   * rate limit of the instance its turn goes to holds them; whether any
   * was ended. */
  private stopWaits(): boolean {
    if (this.hostCalls.size === 0 || !this.owner.turnInstance(this).client.holding()) return false;
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
   * The first placement's remote URL or recorded host id, written only
   * while that remote still reads `expected` (DR-111): the read, the
   * check and the writes are one synchronous step, so no core command
   * lands between them, and Git takes its own config lock for each
   * write. An independent process keeps ordinary filesystem behaviour.
   * Returns false, writing nothing, where the remote changed meanwhile.
   * The id is written in the remote's own section (storage-34), so it is
   * renamed and dropped with the remote; a URL is written to the remote
   * standing, which keeps its name.
   */
  private publishRemote(expected: string | null, next: { url?: string; id?: string }): boolean {
    const { name, url: current } = this.remoteNow();
    if (current !== expected || name === null) return false;
    if (next.url !== undefined && next.url !== current) this.gitStep(["remote", "set-url", name, next.url]);
    if (next.id !== undefined) this.gitStep(["config", this.idKeyOf(name), next.id]);
    this.settleFacts();
    return true;
  }

  /**
   * A placement added at an instance (storage-34, space-58, space-63):
   * the host's remote URL, used as given (space-5), and its id, written
   * as a remote named by that instance's folder, `folder`, beside every
   * remote standing and never in place of one — only while the clone
   * holds no other placement with an instance and, given `expected`, its
   * placements' remotes still read as the caller read them before asking
   * the host (space-21). A placement already at that URL is the one this
   * attaches, its id recorded. `created` records the core's
   * creation of that repository (git-host-7) in the remote's section,
   * written first, and the remote then written key by key rather than
   * added, so it never stands without the mark (space-32). One
   * synchronous step, as publishRemote's; returns the remote's name and
   * whether it stood already, or none where the remotes changed
   * meanwhile or a remote of that name stands at another URL.
   */
  private addPlacement(expected: string | undefined, next: { url: string; id: string; created?: string; folder: string | null }): { name: string; stood: boolean } | undefined {
    const placements = this.placementsNow();
    const key = keyPlacement(placements);
    // A remote the reader named, at the host's URL, as a clone made
    // before its remote took its instance's name holds it, is that
    // placement while the clone holds no other.
    const same = key?.url === next.url ? key
      : key === undefined ? placements.find((placement) => placement.instance === null && placement.url === next.url) : undefined;
    if (!same && (key !== undefined || (expected !== undefined && remotesRead(placements) !== expected))) return undefined;
    const name = same?.name ?? placementName(next.folder);
    if (!same && remoteNames(this.git.runSync(["config", "-z", "--get-regexp", REMOTE_URL_KEYS])).includes(name)) return undefined;
    if (next.created !== undefined) this.gitStep(["config", this.createdKeyOf(name), next.created]);
    if (!same) {
      if (next.created !== undefined) {
        this.gitStep(["config", `remote.${name}.url`, next.url]);
        this.gitStep(["config", `remote.${name}.fetch`, `+refs/heads/*:refs/remotes/${name}/*`]);
      } else {
        this.gitStep(["remote", "add", name, next.url]);
      }
    }
    this.gitStep(["config", this.idKeyOf(name), next.id]);
    this.settleFacts();
    return { name, stood: same !== undefined };
  }

  /**
   * A placement added beside the clone's others at an instance (space-97,
   * storage-34): the host's remote URL, used as given (space-5), and its
   * id, written as a remote named by that instance's folder, `folder` at
   * `origin`, never in place of a remote standing — only while the clone
   * holds no placement at that instance and, given `expected`, its
   * placements' remotes still read as the caller read them before asking
   * the host (space-21). `created` records the core's creation of that
   * repository (git-host-7) in the remote's section first, the remote
   * then written key by key rather than added, so it never stands
   * without the mark (space-32). In the same synchronous step, what a
   * remote formerly of that name left — the `spex` the clone fetched,
   * this device's records of it (storage-5) and this core's lists — is
   * cleared, and the placement's file written (storage-36), so no
   * device reads that file before the remote stands. The remote's name,
   * or none where the remotes changed meanwhile, the clone holds a
   * placement at that instance, or a remote of that name stands.
   */
  addPlacementAt(expected: string | undefined, next: { url: string; id: string; created: boolean; folder: string; origin: string }): string | undefined {
    const placements = this.placementsNow();
    if (expected !== undefined && remotesRead(placements) !== expected) return undefined;
    const origin = canonicalOrigin(next.origin);
    if (placements.some((placement) => placement.instance !== null && canonicalOrigin(placement.instance) === origin)) return undefined;
    const name = next.folder;
    if (remoteNames(this.git.runSync(["config", "-z", "--get-regexp", REMOTE_URL_KEYS])).includes(name)) return undefined;
    if (next.created) {
      this.gitStep(["config", placementCreatedKey(name), next.id]);
      this.gitStep(["config", `remote.${name}.url`, next.url]);
      this.gitStep(["config", `remote.${name}.fetch`, `+refs/heads/*:refs/remotes/${name}/*`]);
    } else {
      this.gitStep(["remote", "add", name, next.url]);
    }
    this.gitStep(["config", placementIdKey(name), next.id]);
    this.git.runSync(["update-ref", "-d", this.refOf(name)]);
    this.host.store.dropPlacementPrefs(this.key, name, false);
    this.runs.delete(name);
    this.agreedRead.delete(name);
    this.settleFacts();
    this.writePlacement(origin, next.id);
    return name;
  }

  /** The placement whose remote bears `name` owes its next Compare a
   * join (space-13): a Place joined its host repository (space-97), or
   * an Attach added it (space-99). */
  oweJoin(name: string): void {
    this.runOf(name).joinOwed = true;
  }

  /**
   * The clone's path placement, `origin` (space-5, space-29): the URL the
   * reader names written as that remote, recording no id, or, null, that
   * remote's own section removed, its instance placements untouched —
   * only while it still reads `expected`, as publishRemote's. Returns
   * false where it changed meanwhile, or where a remote named `origin`
   * stands as an instance placement, as a deferred clone's does until
   * its move renames it (storage-34).
   */
  private setPathPlacement(expected: string | null, url: string | null): boolean {
    const placements = this.placementsNow();
    const path = placements.find((placement) => placement.instance === null);
    if ((path?.url ?? null) !== expected) return false;
    if (path === undefined && placements.some((placement) => placement.name === PATH_PLACEMENT)) return false;
    if (url === null) {
      if (path) this.gitStep(["config", "--remove-section", `remote.${PATH_PLACEMENT}`]);
    } else if (path) {
      this.gitStep(["remote", "set-url", PATH_PLACEMENT, url]);
      this.git.runSync(["config", "--unset", placementIdKey(PATH_PLACEMENT)]);
    } else {
      // A section `origin` holding no URL — no remote Git fetches — goes
      // first, so the remote is added whole.
      this.git.runSync(["config", "--remove-section", `remote.${PATH_PLACEMENT}`]);
      this.gitStep(["remote", "add", PATH_PLACEMENT, url]);
    }
    this.settleFacts();
    return true;
  }

  /** One synchronous Git step of a remote's write, thrown where Git
   * refuses it. */
  private gitStep(args: string[]): GitRun {
    const run = this.git.runSync(args);
    if (run.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${lastLines(run.stderr)}`);
    return run;
  }

  /** Whether the instances migration's receipt names this clone deferred
   * (storage-34): its remote, whatever its name, is its placement, with
   * the id it records at the top level until its move renames that
   * remote. */
  private deferred(): boolean {
    return this.host.store.deferredMoves().some((move) => move.from === this.key);
  }

  /** The key recording the host's id for the repository of the remote
   * `name` (storage-34): in that remote's own section, or at the top
   * level for a deferred clone. */
  private idKeyOf(name: string): string {
    return this.deferred() ? LEGACY_ID_KEY : placementIdKey(name);
  }

  /** The key recording the core's creation of the repository of the
   * remote `name` (git-host-7): in that remote's own section, or at the
   * top level for a deferred clone. */
  private createdKeyOf(name: string): string {
    return this.deferred() ? LEGACY_CREATED_KEY : placementCreatedKey(name);
  }

  /** The clone's placements as its `.git/config` holds them now
   * (storage-34), read synchronously so a check and its write share one
   * core turn. */
  placementsNow(): Placement[] {
    const store = this.host.store;
    return readPlacements((args) => {
      const run = this.git.runSync(args);
      return { ok: run.code === 0, stdout: run.stdout.toString("utf8") };
    }, this.key, store.home, store.deferredMoves(), filedIn(this.dir));
  }

  /** Whether this clone is a group's own spex repository — holding no
   * `project.json`, and not your own group's — whose records stay in its
   * group at one instance (space-87, DR-128). */
  recordsStay(): boolean {
    return this.key !== this.host.store.home.own() && !existsSync(this.repository.projectFile);
  }

  /** The placement files of the clone that name a placement, as they
   * stand (storage-36, storage-41): every one that reads, but that a
   * group's own spex repository's file naming a host repository its
   * clone does not hold — by its folder and its id — names none, so it
   * is no line, offers no Attach and holds no row's listing (space-87).
   * `held` is the placements the clone holds, as read. */
  namedByFiles(held: readonly Placement[] = this.placementsNow()): PlacementFile[] {
    const files = readPlacementFiles(this.dir).files;
    if (!this.recordsStay()) return files;
    return files.filter((file) => held.some((placement) => placement.name === file.folder && (placement.id === null || placement.id === file.id)));
  }

  /** The placements and the first one's facts, read again after a write
   * of a remote. */
  private settleFacts(): void {
    this.placements = this.placementsNow();
    this.facts = factsOf(this.placements);
  }

  /** The clone's first placement's remote — its name and URL — as its
   * `.git/config` holds it now (DR-127, storage-34), read synchronously
   * so a check and its write share one core turn: its key placement's,
   * else its path placement's. */
  private remoteNow(): { name: string | null; url: string | null } {
    const first = this.placementsNow()[0];
    return { name: first?.name ?? null, url: first?.url ?? null };
  }

  /** The ref holding the host's `spex` as this clone last fetched or
   * pushed it (space-12): under the clone's first placement's remote,
   * else — taken away — under the remote its upstream still names, else
   * under the name a placement at its key's instance, or the default
   * instance, takes. */
  private remoteRef(): string {
    return `refs/remotes/${this.firstName()}/${SPEX_BRANCH}`;
  }

  /** The name the clone's first placement's remote bears, as the last
   * read or write found it, or, with none standing, the one `remoteRef`
   * reads instead: what that placement's run is held under. */
  private firstName(): string {
    return this.facts.remoteName ?? this.upstreamName ?? splitKey(this.key).instance ?? placementName(this.owner.instanceFolder());
  }

  /** What this core learnt of the placement whose remote bears `name`,
   * begun empty (space-31). */
  private runOf(name: string): PlacementRun {
    let run = this.runs.get(name);
    if (!run) {
      run = { checkedAt: null, remoteEmpty: false, unrelated: false, lists: { local: [], incoming: [], conflicts: [] } };
      this.runs.set(name, run);
    }
    return run;
  }

  /** What the last transport learnt of the first placement's host before
   * its instance's next read (space-15): a refusal turns it read-only, a
   * missing repository unreachable. */
  get hostOverride(): PlacementRun["hostOverride"] {
    return this.overrideOf(this.firstName());
  }
  set hostOverride(value: PlacementRun["hostOverride"]) {
    this.setOverride(this.firstName(), value);
  }

  /** What the last transport learnt of a placement's host, by its
   * remote's name (space-15, space-61). */
  overrideOf(name: string): PlacementRun["hostOverride"] {
    return this.runs.get(name)?.hostOverride;
  }
  setOverride(name: string, value: PlacementRun["hostOverride"]): void {
    if (value !== undefined) this.runOf(name).hostOverride = value;
    else { const run = this.runs.get(name); if (run) run.hostOverride = undefined; }
  }

  /** Each placement beside the first at the instance `origin` reads that
   * instance's answer afresh (git-host-5, space-61): what a transport
   * learnt of its host before is spent. */
  clearOverridesAt(origin: string): void {
    const first = this.firstName();
    for (const placement of this.placements) {
      if (placement.name !== first && placement.instance === origin) this.setOverride(placement.name, undefined);
    }
  }

  /** The remote a transport of `step` names: the clone's own, as the
   * last read or write found it; one taken away meanwhile stops the
   * step. */
  private remoteNamed(step: SyncStep): string {
    const name = this.facts.remoteName;
    if (name === null) throw new SpaceStopped(step, { cause: "git", message: changedMeanwhile(splitKey(this.key).name), guidance: retryGuidance(), retry: true }, false);
    return name;
  }

  /** One config value as the clone's `.git/config` holds it now, read
   * synchronously so a check and its write share one core turn. */
  private configNow(key: string): string | null {
    const read = this.git.runSync(["config", "--get", key]);
    return read.code === 0 ? read.stdout.toString("utf8").trim() : null;
  }

  /** Whether the clone's first placement's remote and recorded host id
   * read `remote` and `id` at this instant (DR-111), and, given
   * `remotes`, its placements' remotes still read as they did then
   * (space-21): a move checks them at its rename. */
  recordsNow(remote: string | null, id: string, remotes?: string): boolean {
    const placements = this.placementsNow();
    const first = placements[0];
    if (remotes !== undefined && remotesRead(placements) !== remotes) return false;
    return (first?.url ?? null) === remote && this.idOf(first?.name ?? null) === id;
  }

  /** The host's id the clone records at this instant for its remote, if
   * any (storage-34). */
  recordedIdNow(): string | null {
    return this.idOf(this.remoteNow().name);
  }

  /** The host's id recorded for the remote `name` at this instant: in its
   * section, or a deferred clone's at the top level whatever its remote
   * (storage-34); none for no remote. */
  private idOf(name: string | null): string | null {
    if (this.deferred()) return this.configNow(LEGACY_ID_KEY);
    return name === null ? null : this.configNow(placementIdKey(name));
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
   * clone records in its remote's section (git-host-7), read at this
   * instant. */
  createdNow(): string | null {
    const { name } = this.remoteNow();
    return name === null ? null : this.configNow(this.createdKeyOf(name));
  }

  /** The clone records no creation any more (git-host-7). */
  forgetCreated(): void {
    const { name } = this.remoteNow();
    if (name !== null) this.git.runSync(["config", "--unset", this.createdKeyOf(name)]);
  }

  /** The host's id of the repository whose creation by the core the
   * clone records for the placement whose remote bears `name`
   * (git-host-7), read at this instant: in that remote's section — a
   * deferred clone's first remote's at the top level (storage-34). */
  createdOf(name: string | null): string | null {
    return name === null ? null : this.configNow(this.markKeyOf(name));
  }

  /** The clone records no creation for that placement any more
   * (git-host-7). */
  forgetCreatedOf(name: string | null): void {
    if (name !== null) this.git.runSync(["config", "--unset", this.markKeyOf(name)]);
  }

  /** Where the core's creation mark of the repository of the remote
   * `name` stands: the first remote of a deferred clone at the top level
   * (createdKeyOf), every other in its own section. */
  private markKeyOf(name: string): string {
    return name === this.remoteNow().name ? this.createdKeyOf(name) : placementCreatedKey(name);
  }

  /** The host's id and the core's creation mark this clone records at
   * the top level of its Git configuration, as an earlier Spex left
   * them, move into its remote's section, first, in one synchronous
   * step (storage-34): `named` is the remote as it was named before a
   * move re-keyed the clone, which a rename then carries with them. A
   * clone with no remote has none. */
  adoptLegacyIds(named: string | null): void {
    if (!moveLegacyIds((args) => { const run = this.git.runSync(args); return { ok: run.code === 0, stdout: run.stdout.toString("utf8") }; }, named)) {
      console.error(`spex: the host's id of ${this.key} stays where it was recorded`);
    }
  }

  /** An unreleased Spex's clone records the host's id, and the core's
   * creation mark, at the top level beside its one remote: at the core's
   * start they move into that remote's section (storage-34). A clone the
   * instances migration deferred keeps them until its move. */
  settleLegacyIds(): void {
    try {
      if (this.deferred() || !existsSync(join(this.dir, ".git"))) return;
      // One read finds whether either stands; most clones hold neither.
      if (this.git.runSync(["config", "--get-regexp", "^spex\\.(repositoryid|created)$"]).code !== 0) return;
      this.adoptLegacyIds(this.remoteNow().name);
    } catch (error) {
      console.error(`spex: the host's id of ${this.key} stays where it was recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Give the clone the host's own remote and id as a placement
   * (space-58, space-63, storage-34): the URL the host handed over, used
   * as given (space-5), added beside the remotes standing and never in
   * place of one, only while the clone holds no other placement with an
   * instance and its remotes still read what the caller read before
   * asking the host — `expected` (space-21) — so a remote set meanwhile
   * is refused, never replaced. `created` marks a repository the core
   * just created (git-host-7); `folder` is the folder of the instance
   * the repository is at, which names the remote. */
  async attachHost(url: string, id: string, expected?: string, created = false, folder: string | null = this.owner.instanceFolder()): Promise<void> {
    const repo = await this.readRepository();
    this.requireGit(repo);
    if (!repo.root) throw new CoreError("invalid_request", initializeFirst());
    // The id the clone's first placement records, read in the step that
    // writes the remote: the host's id survives its renames and
    // transfers (DR-103).
    const same = this.recordedIdNow() === id;
    const held = this.remoteRef();
    const heldName = this.facts.remoteName ?? this.upstreamName;
    const prior = this.placementsNow();
    const standing = new Set(prior.map((placement) => placement.name));
    // A placement already at the host's URL is the one this attaches;
    // one added is named by its instance's folder (storage-34).
    const added = this.addPlacement(expected, { url, id, ...(created ? { created: id } : {}), folder });
    if (!added) throw new CoreError("conflict", changedMeanwhile(splitKey(this.key).name));
    // The same repository keeps what the clone holds of it and this
    // device's last sync; another, now the clone's first placement,
    // clears what a remote taken away or one formerly of its name left,
    // a placement standing keeping what the clone holds of it (space-5).
    if (!added.stood && !same) {
      // In the step that wrote the remote: what a Spex before DR-128
      // recorded for the repository was the first placement's — the path
      // placement now behind this one keeps it — else a remote's taken
      // away, whose last sync, as one formerly of the added one's name,
      // says nothing of this repository (storage-5).
      const store = this.host.store;
      const before = prior[0]?.name;
      if (before !== undefined && before !== added.name) store.adoptFormerPlacementPrefs(this.key, before);
      store.dropPlacementPrefs(this.key, added.name, before === undefined, ["last"]);
      const refs = new Set([`refs/remotes/${added.name}/${SPEX_BRANCH}`]);
      if (heldName === null || !standing.has(heldName)) refs.add(held);
      for (const ref of refs) await this.git.run(["update-ref", "-d", ref]);
      if (this.upstreamName === null || this.upstreamName === added.name || !standing.has(this.upstreamName)) {
        await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
        this.upstreamName = null;
      }
      // Its check begins afresh, a placement standing keeping its own
      // (space-31).
      this.runs.delete(added.name);
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
      throw new SpaceStopped("check", { cause: "git", message: changedMeanwhile(splitKey(this.key).name), guidance: retryGuidance(), retry: true }, false);
    }
  }

  /** The clone names its remote by the folder of the instance it is at
   * (DR-127, storage-34), its fetched `spex`, its upstream and this
   * device's last sync and notice of it (storage-5) with it:
   * a remote still named `origin`, the clone moved under that folder
   * while it records the host's id, or one named by another instance's
   * folder, the clone following the instance `folder` names (space-60).
   * `from` is the name the remote bore as the step began, read before a
   * move re-keyed the clone; nothing is renamed where a remote bears the
   * folder's name already. Read and written in one synchronous step; a
   * rename Git refuses leaves the remote as it stood, the clone still
   * reading it as its placement until its next sync renames it. Returns
   * whether it renamed the remote. */
  renameRemote(from: string | null, folder: string): boolean {
    if (from === null || from === folder || (from !== "origin" && !isInstanceFolder(from))) return false;
    const names = remoteNames(this.git.runSync(["config", "-z", "--get-regexp", REMOTE_URL_KEYS]));
    if (!names.includes(from) || names.includes(folder)) return false;
    const run = this.git.runSync(["remote", "rename", from, folder]);
    if (run.code !== 0) {
      console.error(`spex: the remote of ${this.key} keeps its name: ${lastLines(run.stderr)}`);
      return false;
    }
    // A placement read before under its former name is found under this
    // one (space-12).
    for (const [before, after] of this.renamed) if (after === from) this.renamed.set(before, folder);
    this.renamed.set(from, folder);
    if (this.upstreamName === from) this.upstreamName = folder;
    // What this core learnt of the placement follows its remote
    // (space-31), as this device's last sync and notice of it do, in the
    // same step (storage-5).
    const learnt = this.runs.get(from);
    this.runs.delete(from);
    if (learnt) this.runs.set(folder, learnt);
    else this.runs.delete(folder);
    this.agreedRead.delete(from);
    this.host.store.renamePlacementPrefs(this.key, from, folder);
    this.settleFacts();
    // The placement's file follows its remote in the same step
    // (storage-36, space-60): the followed instance's written, the
    // former instance's deleted.
    const followed = this.placements.find((placement) => placement.name === folder);
    if (followed?.instance && followed.id !== null) {
      this.writePlacement(followed.instance, followed.id);
      if (isInstanceFolder(from)) {
        try { deletePlacementFile(this.dir, from); }
        catch (error) { console.error(`spex: the former placement file of ${this.key} stays: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
    return true;
  }

  /** The name the remote of a placement read under `name` bears now,
   * after the renames this sync made (space-60, space-91). */
  nameNow(name: string): string {
    return this.renamed.get(name) ?? name;
  }

  /** Whether a placement still stands in the clone's Git configuration
   * as it was read — its remote's name, URL, id and instance (space-21):
   * a write after awaiting anything checks it in the step that writes. */
  stillReads(placement: Placement): boolean {
    return this.placementsNow().some((candidate) => candidate.name === placement.name && candidate.url === placement.url && candidate.id === placement.id && candidate.instance === placement.instance);
  }

  /** Whether the instances migration's receipt names this clone
   * deferred (storage-34): its move at its next sync's Check renames its
   * remote, and nothing reconciles it before. */
  isDeferred(): boolean {
    return this.deferred();
  }

  /** Whether a commit reachable from the clone's `spex` has held its
   * placement file under an instance's folder (storage-37). */
  placementFileHeld(folder: string): Promise<boolean> {
    return placementFileEverHeld(async (args) => {
      const run = await this.git.run(args);
      return { ok: run.code === 0, stdout: run.stdout.toString("utf8") };
    }, folder);
  }

  /**
   * A placement follows another instance (space-60, space-91): its
   * remote renamed to that instance's folder, its placement file
   * rewritten to that instance and the former instance's deleted, this
   * device's records of it re-keyed and what this core learnt of it
   * moved, in one synchronous step (renameRemote) — only while it still
   * reads as it was read (space-21). The placement as it stands renamed,
   * or none where the rename was not made.
   */
  followRemote(placement: Placement, folder: string): Placement | undefined {
    if (!this.stillReads(placement) || !this.renameRemote(placement.name, folder)) return undefined;
    return this.placements.find((candidate) => candidate.name === folder);
  }

  /** The URL the host hands over for a placement after its rename or
   * transfer at its instance (space-60), written to its remote only while
   * it still reads as it was read; the placement as it then stands, or
   * none where it changed meanwhile. */
  setPlacementUrl(placement: Placement, url: string): Placement | undefined {
    if (!this.stillReads(placement)) return undefined;
    this.gitStep(["remote", "set-url", placement.name, url]);
    this.settleFacts();
    return this.placements.find((candidate) => candidate.name === placement.name);
  }

  /** The host's id recorded beside a placement its instance matched by
   * its remote URL (git-host-5, storage-34), only while it still reads as
   * it was read; the placement as it then stands. */
  recordPlacementId(placement: Placement, id: string): Placement {
    if (!this.stillReads(placement)) return placement;
    this.gitStep(["config", placementIdKey(placement.name), id]);
    this.settleFacts();
    return this.placements.find((candidate) => candidate.name === placement.name) ?? placement;
  }

  /**
   * Drop a placement (space-91, storage-38, space-5): its remote removed
   * with its section — its id and creation mark — every ref the clone
   * fetched under its name and the upstream naming it, this device's last
   * sync and notice of it, and what this core learnt of it, in one
   * synchronous step; the clone's records are kept, and its placement
   * file is left as it stands. Written only while it still reads as it
   * was read; whether it was dropped.
   */
  dropPlacement(placement: Placement): boolean {
    return this.dropOrStop(placement) === undefined;
  }

  /** Drop a placement as `dropPlacement` does, or say why it was not
   * dropped, as its Check's stop (space-15): changed since it was read,
   * or Git's own refusal in its words; nothing written either way. */
  dropOrStop(placement: Placement): SpaceStopped | undefined {
    if (!this.stillReads(placement)) return movedMeanwhile(this.key);
    const first = this.placementsNow()[0]?.name === placement.name;
    // Git removes the section, the refs fetched under the remote's name
    // and the upstream configuration naming it; a removal Git refuses
    // leaves the placement as it stood.
    const run = this.git.runSync(["remote", "remove", placement.name]);
    if (run.code !== 0) {
      console.error(`spex: the remote ${placement.name} of ${this.key} stands: ${lastLines(run.stderr)}`);
      return new SpaceStopped("check", { cause: "git", message: lastLines(run.stderr), guidance: retryGuidance(), retry: true }, false);
    }
    if (this.upstreamName === placement.name) this.upstreamName = null;
    this.host.store.dropPlacementPrefs(this.key, placement.name, first);
    this.runs.delete(placement.name);
    this.agreedRead.delete(placement.name);
    this.settleFacts();
    return undefined;
  }

  /** The clone's placement file at an instance (storage-36), written by
   * the act that creates, joins or follows that placement: a write
   * refused — a link or a file at `placements`, the clone gone — leaves
   * the clone without it, reported. */
  writePlacement(origin: string, id: string): void {
    try { writePlacementFile(this.dir, origin, id); }
    catch (error) { console.error(`spex: the placement file of ${this.key} at ${origin} is not written: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /** This device's record of one of the clone's placements, by its
   * remote's name (storage-5): its last completed sync (space-22) or the
   * notice seen before its first push (space-57), under that name, else,
   * for the clone's first placement as last read, what a Spex before
   * DR-128 recorded for the repository; none for no placement. */
  placementRecord(name: string | null, kind: PlacementPrefKind): unknown {
    if (name === null) return undefined;
    return this.host.store.placementPref<unknown>(this.key, name, kind, this.placements[0]?.name === name);
  }

  /** A placement's last completed sync on this device (space-22). */
  lastSyncOf(name: string | null): { at: number; sent: number; received: number } | null {
    return lastSyncIn(this.placementRecord(name, "last"));
  }

  /** Whether this device's reader saw the notice for a placement
   * (space-57). */
  noticedOf(name: string | null): boolean {
    return this.placementRecord(name, "noticed") === true;
  }

  /** Record a placement's last sync or its notice seen (storage-5), the
   * first placement's taking what a Spex before DR-128 recorded. */
  private recordPlacement(name: string | null, kind: PlacementPrefKind, value: unknown): void {
    if (name === null) return;
    this.host.store.setPlacementPref(this.key, name, kind, value, this.placementsNow()[0]?.name === name);
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
    // The placements in the order the clone's Git configuration holds
    // them, each remote by its name and URL with the host's id in its own
    // section, a deferred clone's at the top level (storage-34), in one
    // read.
    const store = this.host.store;
    const configured = await this.git.run(["config", "-z", "--get-regexp", PLACEMENT_CONFIG_KEYS]);
    const placements = configured.code === 0 ? placementsIn(configured.stdout.toString("utf8"), this.key, store.home, store.deferredMoves(), filedIn(this.dir)) : [];
    const upstreamRead = await this.git.run(["config", "--get", `branch.${SPEX_BRANCH}.remote`]);
    const upstreamName = upstreamRead.code === 0 ? upstreamRead.stdout.toString("utf8").trim() || null : null;
    this.placements = placements;
    this.facts = factsOf(placements);
    this.upstreamName = upstreamName;
    const origin = await this.git.run(["rev-parse", "-q", "--verify", `${this.remoteRef()}^{commit}`]);
    // A clone removed while this read runs — a test's teardown, a Remove —
    // reads as no clone rather than throwing past the reader (space-61).
    const gitDirRead = await this.git.run(["rev-parse", "--git-dir"]);
    if (gitDirRead.code !== 0) return { git: version, root: false };
    const gitDir = resolve(this.dir, gitDirRead.stdout.toString("utf8").trim());
    const mergePending = (await this.git.succeeds(["rev-parse", "-q", "--verify", "MERGE_HEAD"])) || existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"));
    this.mergePending = mergePending;
    const originSpex = origin.code === 0 ? origin.stdout.toString("utf8").trim() : null;
    // Each placement's `spex` as the clone holds it, the first's read
    // above (space-61).
    const spex = new Map<string, string | null>();
    for (const [index, placement] of placements.entries()) {
      if (index === 0) { spex.set(placement.name, originSpex); continue; }
      const read = await this.git.run(["rev-parse", "-q", "--verify", `${this.refOf(placement.name)}^{commit}`]);
      spex.set(placement.name, read.code === 0 ? read.stdout.toString("utf8").trim() : null);
    }
    return {
      git: version,
      root: true,
      branch: branch.code === 0 ? branch.stdout.toString("utf8").trim() : null,
      head: head.code === 0 ? head.stdout.toString("utf8").trim() : null,
      remote: this.facts.remote,
      id: this.facts.id,
      placements,
      upstream: upstreamName !== null && upstreamName === this.facts.remoteName,
      originSpex,
      spex,
      mergePending,
    };
  }

  /** The ref holding a placement's `spex` as this clone last fetched or
   * pushed it, by its remote's name (space-32). */
  private refOf(name: string): string {
    return `refs/remotes/${name}/${SPEX_BRANCH}`;
  }

  /** The repository's state, read from the clone at this instant,
   * recomputing the lists from the working tree when asked (space-33:
   * mine is the working tree outside a sync), with a line per placement
   * it holds carrying what this device holds of it (space-87). An
   * operation's own lists — a sync's plan, the picker's conflicts — stand
   * while it runs or waits for choices. */
  async state(recompute: boolean): Promise<MachineRead> {
    return this.readState(recompute && !this.current && this.phase.phase !== "choices");
  }

  private async readState(recompute: boolean): Promise<MachineRead> {
    const repo = await this.readRepository();
    if (recompute && repo.root && repo.head !== null) await this.refreshLists(repo.head, repo.spex);
    const held = repo.root ? repo.placements : [];
    // Each placement's line as this device holds it — its branch against
    // its own `spex`, its lists against it, and this device's last sync
    // and notice of it (space-8, space-61, storage-5) — its state, path,
    // members and rights the owner's to read (overlay).
    const lines: PlacementState[] = [];
    if (repo.root) {
      for (const placement of held) {
        const run = this.runs.get(placement.name);
        lines.push({
          instance: placement.instance,
          path: displayRemote(placement.url),
          id: placement.id,
          attached: true,
          state: "reachable",
          reason: null,
          waiting: null,
          members: null,
          visibility: null,
          can: { manageMembers: false, transfer: false },
          branch: await this.branchOf(repo, placement.name, this.refOf(placement.name), repo.spex.get(placement.name) ?? null),
          incoming: run?.lists.incoming ?? [],
          conflicts: run?.lists.conflicts ?? [],
          lastSync: this.lastSyncOf(placement.name),
          noticed: this.noticedOf(placement.name),
          outcome: run?.outcome ?? null,
        });
      }
    }
    const first = lines[0];
    const store = this.host.store;
    // The placements its files name as they stand, held here or not, a
    // file that does not read naming none (storage-36, storage-41), nor
    // a group's own repository's naming one it does not hold (space-87).
    const files = repo.root ? this.namedByFiles(held) : [];
    // Its instance (storage-31), whose Git origin its code remote is
    // read against first (space-1).
    const instance = this.owner.cloneInstance(this.key, this.facts.remoteName);
    let code: string | null = null;
    try {
      const project = existsSync(this.repository.projectFile) ? readJsonFile(this.repository.projectFile) as { remote?: unknown } : undefined;
      code = typeof project?.remote === "string" ? this.owner.codeRemoteAsShown(project.remote, instance) : null;
    } catch { code = null; }
    const remote = repo.root ? repo.remote : null;
    // The row's branch is its first placement's; with none, what the
    // clone holds under the name its first would bear.
    const branch = !repo.root ? null : first?.branch ?? await this.branchOf(repo, this.firstName(), this.remoteRef(), repo.originSpex);
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
      mergePending: repo.root ? repo.mergePending : false,
      placements: lines,
      // Each instance its files name, held here or not (space-62).
      placedAt: files.map((file) => file.origin),
      waiting: null,
      members: null,
      visibility: null,
      branch: branch === null ? null : { ...branch, mergePending: repo.root ? repo.mergePending : false },
      local: this.local,
      // Every placement's conflicts, in the placements' order (space-30);
      // its first's incoming units, last sync and notice (storage-5).
      incoming: first?.incoming ?? [],
      conflicts: lines.flatMap((line) => line.conflicts),
      lastSync: first?.lastSync ?? null,
      noticed: first?.noticed ?? false,
      sync: this.phase,
    };
    return { row: state, held, files };
  }

  /** The clone's `spex` against one placement's, by its remote's name
   * and the ref holding that placement's `spex` (space-30, space-61):
   * ahead and behind once checked, and the last sync the clone holds
   * with it. */
  private async branchOf(repo: Extract<RepositoryInfo, { root: true }>, name: string, ref: string, spex: string | null): Promise<PlacementBranch> {
    const run = this.runs.get(name);
    const checkedAt = run?.checkedAt ?? null;
    const remoteEmpty = run?.remoteEmpty ?? false;
    let ahead: number | null = null;
    let behind: number | null = null;
    if (repo.head && spex && checkedAt !== null) {
      const counts = await this.git.run(["rev-list", "--left-right", "--count", `HEAD...${ref}`]);
      if (counts.code === 0) {
        const [left, right] = counts.stdout.toString("utf8").trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
        if (Number.isFinite(left) && Number.isFinite(right)) { ahead = left; behind = right; }
      }
    } else if (repo.head && remoteEmpty && checkedAt !== null) {
      const count = await this.git.run(["rev-list", "--count", "HEAD"]);
      ahead = count.code === 0 ? Number.parseInt(count.stdout.toString("utf8").trim(), 10) : null;
      behind = 0;
    }
    return {
      ahead,
      behind,
      checkedAt,
      hostEmpty: checkedAt !== null && remoteEmpty,
      unrelated: run?.unrelated ?? false,
      agreed: repo.head ? await this.agreed(name, repo.head, spex) : null,
    };
  }

  /** The last sync the clone holds with a placement, by its remote's
   * name, read from its own commits whatever this core ran (space-61,
   * DR-111): the commit `spex` last shared with that placement's `spex`
   * as the clone last fetched or pushed it — `spex` itself where the two
   * are one — with its commit time; none where the clone holds no `spex`
   * of it or none sharing its history. A failed read says none and is
   * read again next time. */
  private async agreed(name: string, head: string, originSpex: string | null): Promise<Agreed | null> {
    if (originSpex === null) return null;
    const pair = `${head} ${originSpex}`;
    const read = this.agreedRead.get(name);
    if (read?.pair === pair) return read.agreed;
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
    this.agreedRead.set(name, { pair, agreed });
    return agreed;
  }

  /** The working tree's lists against each placement's last check, kept
   * as that placement's lists and plan — against `HEAD` for one not
   * checked — and the clone's local units with them (space-7, space-8,
   * space-33); a failure keeps the last ones. `spex` is each placement's
   * `spex` as the clone holds it, by its remote's name. With
   * `keepChoices`, a placement a sync left in choices keeps that sync's
   * plan and lists, which its picker and its choices' validation read
   * (space-9, space-18). */
  private async refreshLists(head: string, spex: ReadonlyMap<string, string | null>, keepChoices = false): Promise<void> {
    try {
      const kept = (placement: Placement): boolean => keepChoices && this.runs.get(placement.name)?.outcome?.kind === "choices";
      if (keepChoices && this.placements.every(kept)) return;
      const mine = await this.workingTree();
      // The plan against `HEAD`, read once where some list needs it.
      let againstHead: { plan: LastPlan; lists: Lists; unrelated?: boolean } | undefined;
      const headPlan = async (): Promise<{ plan: LastPlan; lists: Lists; unrelated?: boolean }> => (againstHead ??= await this.computeWorkingLists(head, mine, null));
      for (const placement of this.placements) {
        if (kept(placement)) continue;
        const run = this.runOf(placement.name);
        const computed = run.checkedAt === null
          ? await headPlan()
          : await this.computeWorkingLists(head, mine, { run, ref: this.refOf(placement.name), spex: spex.get(placement.name) ?? null });
        run.plan = computed.plan;
        run.lists = computed.lists;
        if (computed.unrelated !== undefined) run.unrelated = computed.unrelated;
      }
      const unchecked = this.placements.every((placement) => this.runs.get(placement.name)?.checkedAt === null);
      if (unchecked) this.unchecked = (await headPlan()).plan;
      this.settleLocal(unchecked ? (await headPlan()).lists.local : undefined);
    } catch (error) { console.error(`spex: space listing failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /** The clone's local units (space-7): each unit local against some
   * placement checked, once, as the first such placement in order lists
   * it; else, given them, those local against `HEAD`. */
  private settleLocal(againstHead?: SpaceUnit[]): void {
    const checked = this.placements.flatMap((placement) => {
      const run = this.runs.get(placement.name);
      return run && run.checkedAt !== null ? [run] : [];
    });
    if (checked.length === 0) {
      if (againstHead) this.local = againstHead;
      return;
    }
    const seen = new Set<string>();
    const local: SpaceUnit[] = [];
    for (const run of checked) {
      for (const unit of run.lists.local) {
        if (seen.has(unit.unit)) continue;
        seen.add(unit.unit);
        local.push(unit);
      }
    }
    this.local = local.sort(unitOrder);
  }

  /** Announce this clone's step; with `lists`, its lists recomputed from
   * the working tree first (space-29). */
  private async broadcast(lists: boolean): Promise<void> {
    if (lists) {
      const repo = await this.readRepository();
      if (repo.root && repo.head !== null) await this.refreshLists(repo.head, repo.spex);
    }
    await this.owner.publish();
  }

  /** What a removal of this clone would lose (projects-9): the record
   * units of its working tree that no placement's `spex` holds
   * identically, as the clone last fetched or pushed it or at their last
   * shared commit (space-12, reachedTrees) — the path placement's among
   * them — every unit where it holds none, counted without touching the
   * clone's own lists. A placement whose host its last check found
   * holding no `spex` holds none. */
  async pendingUnits(): Promise<number> {
    const repo = await this.readRepository();
    if (!repo.root || repo.head === null) return 0;
    const placed: StorageTree[] = [];
    for (const placement of repo.placements) {
      const spex = repo.spex.get(placement.name) ?? null;
      if (spex === null || this.runs.get(placement.name)?.remoteEmpty === true) continue;
      placed.push(...await this.reachedTrees(repo.head, spex));
    }
    return unitsHeldByNone([readStorageTree(this.dir, await this.workingTree())], placed).length;
  }

  /** The trees in which a placement holds a unit as reached (projects-9,
   * space-98): its `spex` as the clone last fetched or pushed it, `spex`,
   * and the last commit it shared with the clone's `head` — their merge
   * base — so that a unit the clone holds unchanged since then counts as
   * reached, whatever a peer did to it there since. */
  private async reachedTrees(head: string | null, spex: string): Promise<StorageTree[]> {
    const trees = [readStorageTree(this.dir, spex)];
    if (head === null || head === spex) return trees;
    const base = await this.git.run(["merge-base", head, spex]);
    const shared = base.code === 0 ? base.stdout.toString("utf8").trim() : "";
    if (shared !== "" && shared !== spex) trees.push(readStorageTree(this.dir, shared));
    return trees;
  }

  /** A Leave's read of the placement it leaves (space-98): that
   * placement's `spex` fetched with the credential its instance,
   * `instance`, brokers (git-host-9), its calls held by that instance's
   * rate limit alone, following nothing; a host holding no `spex` there
   * holds nothing of it to fetch. A failure is thrown as its Check's stop
   * (space-15). */
  async fetchPlacement(placement: Placement, instance: HostInstance): Promise<void> {
    this.turnAt = instance.origin;
    try {
      const credential = await this.owner.credentialFor(instance, placement.url, "check", this);
      const options = { transport: true, ...(credential ? { credential } : {}) };
      try {
        const heads = await this.git.run(["ls-remote", "--exit-code", "--heads", placement.name, `refs/heads/${SPEX_BRANCH}`], options);
        const run = this.runOf(placement.name);
        if (heads.code === 2) {
          run.remoteEmpty = true;
          run.unrelated = false;
          run.checkedAt = Date.now();
          return;
        }
        if (heads.code !== 0) throw this.transportStop("check", heads, placement.url, true, placement);
        const fetched = await this.git.run(["fetch", "-q", "--no-tags", placement.name, `+refs/heads/${SPEX_BRANCH}:${this.refOf(placement.name)}`], options);
        if (fetched.code !== 0) throw this.transportStop("check", fetched, placement.url, true, placement);
        run.remoteEmpty = false;
        run.checkedAt = Date.now();
      } finally {
        await credential?.dispose();
      }
    } finally {
      this.turnAt = undefined;
    }
  }

  /** How many record units the placement whose remote bears `name`, or
   * the clone, holds that no other placement's `spex` holds identically,
   * as the clone last fetched or pushed it or at their last shared commit
   * (reachedTrees) — every unit where none remains (space-98): the units
   * a Leave of it, unconfirmed, stops for. The clone's are its working
   * tree's; a placement whose host its last check found holding no
   * `spex` holds none. */
  async unreceivedUnits(name: string): Promise<number> {
    const commitOf = async (ref: string): Promise<string | null> => {
      const read = await this.git.run(["rev-parse", "-q", "--verify", `${ref}^{commit}`]);
      return read.code === 0 ? read.stdout.toString("utf8").trim() : null;
    };
    const head = await commitOf("HEAD");
    const held = [readStorageTree(this.dir, await this.workingTree())];
    const leaving = this.runs.get(name)?.remoteEmpty === true ? null : await commitOf(this.refOf(name));
    if (leaving !== null) held.push(readStorageTree(this.dir, leaving));
    const others: StorageTree[] = [];
    for (const placement of this.placementsNow()) {
      if (placement.name === name) continue;
      const spex = await commitOf(this.refOf(placement.name));
      if (spex !== null) others.push(...await this.reachedTrees(head, spex));
    }
    return unitsHeldByNone(held, others).length;
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

  /** The plan of the working tree `mine` against one placement — its run,
   * the ref holding its `spex` and that `spex` as the clone holds it —
   * as its last check left it, or against `HEAD` before any check or for
   * none (space-33). */
  private async computeWorkingLists(head: string, mine: string, against: { run: PlacementRun; ref: string; spex: string | null } | null): Promise<{ plan: LastPlan; lists: Lists; unrelated?: boolean }> {
    let theirs = head;
    let base = head;
    let unrelated: boolean | undefined;
    if (against && against.run.checkedAt !== null) {
      if (against.run.remoteEmpty) { theirs = EMPTY_TREE; base = EMPTY_TREE; }
      else if (against.spex) {
        const merged = await this.git.run(["merge-base", "HEAD", against.ref]);
        if (merged.code === 0) { theirs = against.spex; base = merged.stdout.toString("utf8").trim(); unrelated = false; }
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
    local.sort(unitOrder);
    incoming.sort(unitOrder);
    conflicts.sort((a, b) => unitOrder(a.unit, b.unit));
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

  /** Name the clone's path placement, or take it away (space-5,
   * space-29): the remote the reader names is `origin`, set or removed
   * alone beside the clone's instance placements, which keep their ids,
   * what the clone holds of them and this device's last sync with them. */
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
    const path = repo.placements.find((placement) => placement.instance === null);
    const current = path?.url ?? null;
    if (url !== current) {
      // The path placement is the clone's first while it holds no
      // instance placement: the clone's check and last sync are then its.
      const first = keyPlacement(repo.placements) === undefined;
      // Written over the remote read above, or refused (DR-111).
      if (!this.setPathPlacement(current, url)) throw new CoreError("conflict", changedMeanwhile(splitKey(this.key).name));
      // In that step, this device's last sync and notice of a path
      // placement named before leave with it, and, where the path
      // placement is the first, what a Spex before DR-128 recorded for
      // the repository (storage-5, space-5).
      this.host.store.dropPlacementPrefs(this.key, PATH_PLACEMENT, first);
      // Another path placement, or none, clears what the clone held of
      // the former one — its `spex` and the upstream naming it — and,
      // where it was the first placement, its check (space-5): what the
      // old remote held says nothing of the new one.
      if (path !== undefined) {
        await this.git.run(["update-ref", "-d", `refs/remotes/${PATH_PLACEMENT}/${SPEX_BRANCH}`]);
        if (this.upstreamName === PATH_PLACEMENT) {
          await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
          this.upstreamName = null;
        }
      }
      // Its check, its lists and its host's last refusal leave with it
      // (space-31); a running operation's progress is its own to end.
      this.runs.delete(PATH_PLACEMENT);
      this.agreedRead.delete(PATH_PLACEMENT);
      if (first && !this.current) this.phase = { phase: "idle" };
    }
    await this.state(true);
  }

  /** Drop one of the clone's placements, as a Forget of its instance
   * drops your own group's own repository's remote there (space-82): its
   * first or a later one, whole, as any drop is (dropPlacement) — its id
   * and creation mark with its remote's section (storage-34), the `spex`
   * the clone fetched of it and the upstream naming it, and this device's
   * last sync and notice of it (space-5, storage-5) — its placement file
   * left as it stands. Written only while that placement still stands as
   * it was read. */
  async dropRemote(placement: Placement): Promise<void> {
    const repo = await this.readRepository();
    this.requireGit(repo);
    if (!repo.root) return;
    // A deferred clone's id, at the top level until its move, is that
    // remote's, and goes with it.
    const deferred = this.deferred();
    if (!this.dropPlacement(placement)) return;
    if (deferred) for (const key of [LEGACY_CREATED_KEY, LEGACY_ID_KEY]) this.git.runSync(["config", "--unset", key]);
    if (!this.current) this.phase = { phase: "idle" };
    await this.state(true);
  }

  // -- operations (space-31) -------------------------------------------------

  /** Run one operation on this clone (space-31), after `after` — a
   * check a sync follows — has settled. Its progress is its own: it
   * ends it, and clears only itself as the running operation. */
  private runOperation(op: SpaceOp, body: () => Promise<void>, after?: Promise<void>, options: { keep?: boolean } = {}): Promise<void> {
    const entry: { op: SpaceOp; work: Promise<void> } = { op, work: Promise.resolve() };
    entry.work = (async () => {
      await after?.catch(() => undefined);
      this.ended = undefined;
      // What the last operation left on each placement's line stands
      // until this one begins (space-87) — or, `keep`, until its own
      // body clears it.
      if (!options.keep) for (const run of this.runs.values()) run.outcome = undefined;
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
          // Ended in choices, the placements so ended keep the sync's
          // plan; every other reads the working tree (space-9).
          if (ended) {
            const repo = await this.readRepository();
            if (repo.root && repo.head !== null) await this.refreshLists(repo.head, repo.spex, ended.phase === "choices");
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

  /** Enter a step: `placement` names the placement whose turn it is —
   * its instance's origin, or null for the path placement — absent for
   * Save (space-12, space-30). Check enters with no Stop: its host read
   * comes first, and Stop is offered once its Git child runs (space-16). */
  private async enter(op: SpaceOp, step: SyncStep, cancelable: boolean, placement?: string | null, at?: "catch-up"): Promise<void> {
    this.phase = { phase: "running", op, ...(placement !== undefined ? { placement } : {}), step, since: Date.now(), cancelable };
    await this.broadcast(false);
    await this.host.beforeStep?.({ op, step, repository: this.key, ...(placement !== undefined ? { placement } : {}), ...(at ? { at } : {}) });
  }

  /** The instance's origin of a placement whose turn runs, the first's
   * read from the clone as a follow at its Check left it (space-30). */
  private originOf(placement: Placement | undefined): string | null {
    return placement ? placement.instance : this.owner.placementOf(this);
  }

  /** A stop at a placement on its line (space-15, space-87): its lines
   * with no URL under any instance's Git origin, every placement's remote
   * reading as its path in its instance; the stop as it stands, so the
   * row's state carries the same lines. */
  private stopOn(name: string, placement: Placement | undefined, error: unknown): SpaceStopped {
    const stop = error instanceof SpaceStopped
      ? error
      : new SpaceStopped(this.phase.phase === "running" ? this.phase.step : "check", { cause: "git", message: lastLines(error instanceof Error ? error.message : String(error)), guidance: retryGuidance(), retry: true }, true);
    const failure = this.owner.placementFailure(this, stop.failure, placement);
    this.runOf(name).outcome = { kind: "stopped", step: stop.step, ...failure };
    return new SpaceStopped(stop.step, failure, stop.whole);
  }

  /** Check the host (space-8): each placement's `spex` fetched in the
   * order added, without merging and following nothing (git-host-9). A
   * placement whose check stops stops alone, its lists kept as they
   * stood, and the next is checked; Stop, and an error no step
   * classifies, end the check (space-15). The check ends stopped only where
   * every placement stopped, with the first one's stop. A Check asked
   * while a sync or another check runs joins it: that operation checks
   * the host itself. */
  async fetch(): Promise<{ accepted: true }> {
    if (this.current) return { accepted: true };
    const repo = await this.requireReady();
    await this.owner.admit(this, { push: false });
    if (this.current) return { accepted: true };
    void this.runOperation("check", async () => {
      // The placements as read before the check, each later one read
      // again by its remote's name at its turn.
      const names = repo.placements.map((placement) => placement.name);
      let stopped: SpaceStopped | undefined;
      let checked = false;
      for (const [index, name] of names.entries()) {
        const placement = index === 0 ? undefined : this.placementsNow().find((candidate) => candidate.name === name);
        if (index > 0 && placement === undefined) continue;
        this.turnAt = placement?.instance ?? undefined;
        try {
          await this.enter("check", "check", false, this.originOf(placement));
          await this.check(placement?.url ?? repo.remote, "check", placement);
          checked = true;
        } catch (error) {
          // Its stop stands on its line; Stop and Git's own error end the
          // check (space-15).
          const stop = this.stopOn(placement?.name ?? this.facts.remoteName ?? this.firstName(), placement, error);
          if (stop.whole) throw stop;
          stopped ??= stop;
        } finally { this.turnAt = undefined; }
      }
      if (!checked && stopped) throw stopped;
      this.ended = { phase: "idle" };
    });
    return { accepted: true };
  }

  /** `internal` marks a sync the core starts itself — after a sign-in, a
   * pick or a creation (space-4, space-58) — whose act already said what
   * a join does (space-13); its notices are owed as any sync's, rechecked
   * at each placement's Check, a placement owing one waiting for Continue
   * on its line, with no reader asking to refuse (space-57). `setUp`
   * marks the account's set-up joining your own group's spex repository,
   * which takes the host's side where the clone holds nothing of its own
   * (space-59). A Sync asked while a sync runs joins it; one asked while
   * a check runs follows that check. Nothing beneath the clone is refused
   * meanwhile (space-21). */
  sync(input: { placement?: string | null; choices?: Record<string, SpaceChoice>; join?: boolean; noticed?: boolean; internal?: boolean; setUp?: boolean }): Promise<{ accepted: true }> {
    const asked = this.askSync(input);
    const settled = asked.then(() => undefined, () => undefined);
    this.asked = settled;
    void settled.then(() => { if (this.asked === settled) this.asked = undefined; });
    return asked;
  }

  private async askSync(input: { placement?: string | null; choices?: Record<string, SpaceChoice>; join?: boolean; noticed?: boolean; internal?: boolean; setUp?: boolean }): Promise<{ accepted: true }> {
    if (this.current?.op === "sync") return { accepted: true };
    const choices: Record<string, StorageChoice> = {};
    const repo = await this.requireReady();
    // The operation repairs its marker again first (space-67), so the
    // finding an earlier repair left never refuses this admission.
    const blocking = this.blocking(false);
    if (blocking) throw new CoreError("invalid_request", `${blocking.file}: ${blocking.reason}`);
    // The placement the choices, the join and the notice are for
    // (space-29): the one named, a placement the clone does not hold
    // refused.
    const target = this.syncTarget(input.placement, repo.placements);
    if (input.choices && Object.keys(input.choices).length > 0) {
      // Validated against that placement's plan (space-18).
      const run = this.runs.get(target.name);
      const plan = run?.plan?.units ?? [];
      for (const [name, choice] of Object.entries(input.choices)) {
        const unit = plan.find((u) => u.name === name);
        if (!unit) throw new CoreError("invalid_request", unknownUnit(name));
        if (unit.choice !== "conflict") {
          const label = [...(run?.lists.local ?? []), ...(run?.lists.incoming ?? [])].find((u) => u.unit === name)?.label ?? name;
          throw new CoreError("invalid_request", i18n._({
            id: "{label} has no divergent change",
            values: { label },
            comment: "Refusal: a choice was sent for a unit the two sides agree on; {label} is the unit's own label",
          }));
        }
        choices[name] = choice === "mine" ? "ours" : "theirs";
      }
    }
    // The notice is seen for that placement (space-57, storage-5).
    if (input.noticed === true) this.recordPlacement(target.name, "noticed", true);
    const admission = await this.owner.admit(this, { push: true, internal: input.internal === true });
    // A sync begun while this one was admitted is the one it joins.
    if (this.runningOp() === "sync") return { accepted: true };
    void this.runOperation("sync", () => this.syncNow(repo, { op: "sync", choices, join: input.join === true, setUp: input.join === true && input.setUp === true, admission, target }), this.current?.work);
    return { accepted: true };
  }

  /** An admitted sync's work inside its operation — a Sync's, or a
   * Place's once its placement is added (space-31): the repair marker
   * finished first, so a second admission joins this repair rather than
   * running its own, the blocking issues read once it has ended
   * (space-67), then the sync itself. */
  private async syncNow(repo: ReadyRepository, input: SyncInput): Promise<void> {
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
    await this.syncBody(repo, input);
  }

  /**
   * Place the clone at another instance (space-97, space-31) — a
   * Place's, or a sign-in's placing your own group's own repository
   * there (space-4): an operation of its machine, following one running
   * (space-21), whose first step, `act`, asks that instance — `origin` —
   * to create or join the placement and adds it as the host answered
   * (placeAdd). The reply waits for that step: a refusal there is the
   * reply's, the operation ending with the clone and its lines as they
   * were. Then the clone syncs as a Sync does, that placement among its
   * placements — or, its creation left waiting at the host, its others
   * (space-64) — the sync's notices owed as at any Check, with no reader
   * to refuse (space-57).
   */
  place(origin: string, act: () => Promise<void>): Promise<{ accepted: true }> {
    return this.addThenSync("place", origin, act);
  }

  /**
   * Attach a placement a placement file of the clone names (space-99,
   * space-31): an operation of its machine, following one running
   * (space-21), whose first step, `act`, adds that placement's remote at
   * the instance at `origin` — and, for a clone holding none with an
   * instance, moves it as a pick does (storage-35). The reply waits for
   * that step, a refusal there being the reply's; then the clone syncs as
   * a Sync does, that placement among its placements (space-12).
   */
  attach(origin: string, act: () => Promise<void>): Promise<{ accepted: true }> {
    return this.addThenSync("attach", origin, act);
  }

  /** A Place's or an Attach's operation (space-31): its first step,
   * `act`, at the placement at `origin`, answering the reply — a refusal
   * there ending the operation with the clone and its lines as they
   * were — then the sync, every line's former outcome cleared, the
   * sync's notices owed as at any Check, with no reader to refuse
   * (space-57). A sync asked before it and still in its admission runs
   * first, this one following it (space-21). */
  private addThenSync(op: "place" | "attach", origin: string, act: () => Promise<void>): Promise<{ accepted: true }> {
    let answer!: { resolve: (value: { accepted: true }) => void; reject: (error: unknown) => void };
    const reply = new Promise<{ accepted: true }>((resolve, reject) => { answer = { resolve, reject }; });
    if (this.asked) {
      void this.asked.then(() => this.queueAddThenSync(op, origin, act, answer));
      return reply;
    }
    this.queueAddThenSync(op, origin, act, answer);
    return reply;
  }

  private queueAddThenSync(op: "place" | "attach", origin: string, act: () => Promise<void>, answer: { resolve: (value: { accepted: true }) => void; reject: (error: unknown) => void }): void {
    void this.runOperation(op, async () => {
      let answered = false;
      try {
        // What the last operation left stands until its step is done.
        const before = this.phase;
        await this.enter(op, "check", false, origin);
        try { await act(); }
        catch (error) {
          answered = true;
          answer.reject(error);
          this.ended = before.phase === "running" ? { phase: "idle" } : before;
          return;
        }
        answered = true;
        answer.resolve({ accepted: true });
        for (const run of this.runs.values()) run.outcome = undefined;
        const repo = await this.requireReady();
        let admission: Map<string, PlacementAdmission>;
        try { admission = await this.owner.admit(this, { push: true, internal: true }); }
        catch (error) {
          // Signed out everywhere meanwhile: nothing can run.
          if (error instanceof CoreError) throw new SpaceStopped("check", { cause: "reauth", message: error.message, guidance: signInThenRetry(), retry: true });
          throw error;
        }
        await this.syncNow(repo, { op, choices: {}, join: false, setUp: false, admission, target: this.syncTarget(undefined, repo.placements) });
      } catch (error) {
        if (!answered) answer.reject(error);
        throw error;
      }
    }, this.current?.work, { keep: true });
  }

  /**
   * Leave a placement (space-98, space-31): an operation of the clone's
   * machine, following one running (space-21), answered at once, its
   * outcome as state. Its step names the placement at `origin`, its
   * instance; `body` follows, fetches and drops it, and gives back the
   * stop a leave not confirmed ends in, else none, the operation then
   * ending idle: a leave syncs nothing. A refusal of its move, thrown,
   * stops it whole with Retry. A sync asked before it and still in its
   * admission runs first, this one following it, as a Place and an
   * Attach do (space-21).
   */
  leave(origin: string, body: () => Promise<SpaceSyncPhase | undefined>): { accepted: true } {
    const queue = (): void => {
      void this.runOperation("leave", async () => {
        await this.enter("leave", "check", false, origin);
        this.ended = (await body()) ?? { phase: "idle" };
      }, this.current?.work);
    };
    if (this.asked) void this.asked.then(queue);
    else queue();
    return { accepted: true };
  }

  /** The placement a sync's choices, join and notice are for (space-29):
   * the one `placement` names — its instance's origin, or null for the
   * path placement — a placement the clone does not hold refused; where
   * none is named, the one the row's choices or unrelated history names,
   * else the clone's first. Transitional: `placement` is optional until
   * the interface reads placements. */
  private syncTarget(placement: string | null | undefined, placements: readonly Placement[]): SyncTarget {
    const at = (origin: string | null): Placement | undefined => placements.find((candidate) => (candidate.instance === null ? null : canonicalOrigin(candidate.instance)) === (origin === null ? null : canonicalOrigin(origin)));
    let named: Placement | undefined;
    if (placement !== undefined) {
      named = at(placement);
      if (!named) throw new CoreError("invalid_request", noSuchPlacement(splitKey(this.key).name));
    } else if (this.phase.phase === "choices" || this.phase.phase === "unrelated") named = at(this.phase.placement);
    named ??= placements[0];
    return named ? { name: named.name, first: named === placements[0] } : { name: this.firstName(), first: true };
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

  /** A sync (space-12, space-31): Save once, then each placement's turn
   * in the order added, the path placement last — Check, Compare, Apply,
   * Refresh and Push against that placement — then the catch-up. A stop
   * of one placement stands on its line and the next runs; a stop of the
   * whole sync ends it (space-15). An Apply whose unit changed since its
   * base runs the sync again from Save, once (space-19). A placement its
   * admission stopped — its notice owed, or its first-notice read failed
   * — runs no step, its line saying so (space-57). */
  private async syncBody(repo: ReadyRepository, input: SyncInput): Promise<void> {
    const op = input.op;
    let restarts = 0;
    let savedCommit: string | null = null;
    // Saves may carry authored changes; only an exact generated-bootstrap
    // tree can make a set-up join automatic (space-59).
    const saves = new Set<string>();
    // Whether `spex`'s upstream is the first placement's remote, set once
    // at the first placement's push (space-12).
    const upstream = { set: repo.upstream };
    // Each placement's counts in this sync, kept across a restart from
    // Save, the first's by its turn as a follow may rename it.
    const tallies = new Map<string, { sent: number; received: number }>();
    const tallyOf = (key: string): { sent: number; received: number } => {
      let tally = tallies.get(key);
      if (!tally) { tally = { sent: 0, received: 0 }; tallies.set(key, tally); }
      return tally;
    };
    for (;;) {
      await this.enter(op, "save", false);
      const saved = await this.save();
      if (saved !== null) saves.add(saved);
      savedCommit = saved ?? savedCommit;
      // The placements, read once after Save (space-12): each later one
      // found again by the name its remote bears at its turn — a
      // placement dropped meanwhile is not run — the first by the clone's
      // facts, which its Check's follow renames (space-60).
      this.renamed.clear();
      this.swept.clear();
      const order = this.placementsNow();
      const names = order.length > 0 ? order.map((placement) => placement.name) : [this.firstName()];
      const turns: Turn[] = [];
      let restart: Restart | undefined;
      for (const [index, name] of names.entries()) {
        const tally = tallyOf(index === 0 ? "" : name);
        // A placement whose file a merge removed, or changed to name
        // another host repository, syncs nothing until its drop — or its
        // follow to the instance another file names — is made, which is
        // tried again before its turn (space-91, storage-38).
        const standing = this.placementsNow().find((candidate) => candidate.name === this.nameNow(name));
        if (standing?.instance) {
          const settled = (await this.owner.reconcilePlacements(this, standing.name)).get(standing.name);
          if (settled?.kind === "dropped") continue;
          if (settled?.kind === "withheld") {
            turns.push(this.admittedTurn(index === 0 ? undefined : standing, standing.name, { kind: "stopped", stop: settled.stop }, tally));
            continue;
          }
        }
        const placement = index === 0 ? undefined : this.placementsNow().find((candidate) => candidate.name === this.nameNow(name));
        if (index > 0 && placement === undefined) continue;
        const admitted = input.admission.get(name);
        if (admitted) { turns.push(this.admittedTurn(placement, this.nameNow(name), admitted, tally)); continue; }
        const forTarget = index === 0 ? input.target.first : input.target.name === name;
        const turned = await this.turn(op, placement, {
          choices: forTarget ? input.choices : {},
          join: forTarget && input.join,
          ...(forTarget && input.setUp ? { setUpSaves: saves } : {}),
        }, upstream, tally);
        if ("restart" in turned) { restart = turned; break; }
        turns.push(turned);
        // What this turn's merge did to the placements before it stands
        // on their turns (space-91).
        this.refreshTurns(turns);
      }
      if (!restart) {
        const caught = await this.catchUp(op, turns, upstream);
        if (caught) restart = caught;
      }
      if (restart) {
        if (restarts >= 1) {
          // On the line of the placement whose Apply met the change
          // (space-15).
          throw this.stopOn(restart.restart, restart.placement, new SpaceStopped("apply", {
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
          }));
        }
        restarts += 1;
        // The sync runs again from Save, every placement afresh.
        for (const run of this.runs.values()) run.outcome = undefined;
        continue;
      }
      this.ended = this.endedBy(op, turns, savedCommit);
      return;
    }
  }

  /** How a sync ends, from its placements' turns in their order
   * (space-12, space-30): in choices at the first placement so ended,
   * else with an unrelated history at the first so ended; else stopped
   * as the first stop, where no placement synced or ended behind — a
   * placement waiting for its notice's Continue stopping as its notice
   * says (space-57, git-host-22); else done with every placement's
   * counts, pushed where any was. */
  private endedBy(op: SpaceOp, turns: Turn[], savedCommit: string | null): SpaceSyncPhase {
    const choices = turns.find((turn) => turn.outcome.kind === "choices");
    if (choices) return { phase: "choices", placement: choices.origin, savedCommit };
    const unrelated = turns.find((turn) => turn.outcome.kind === "unrelated");
    if (unrelated) return { phase: "unrelated", placement: unrelated.origin };
    const went = turns.filter((turn) => turn.outcome.kind === "synced" || turn.outcome.kind === "behind");
    const stopped = turns.find((turn) => turn.outcome.kind === "stopped" || turn.notice !== undefined);
    if (went.length === 0 && stopped) {
      if (stopped.outcome.kind === "stopped") {
        const { kind: _, ...stop } = stopped.outcome;
        return { phase: "stopped", op, ...stop };
      }
      if (stopped.notice) return { phase: "stopped", op, step: "check", ...stopped.notice };
    }
    const times = went.flatMap((turn) => (turn.syncedAt === undefined ? [] : [turn.syncedAt]));
    return {
      phase: "done",
      at: times.length > 0 ? Math.max(...times) : Date.now(),
      sent: went.reduce((sum, turn) => sum + (turn.outcome.kind === "stopped" ? 0 : turn.outcome.sent), 0),
      received: went.reduce((sum, turn) => sum + (turn.outcome.kind === "stopped" ? 0 : turn.outcome.received), 0),
      pushed: went.some((turn) => turn.pushed),
    };
  }

  /**
   * One placement's turn of a sync (space-12, space-31): Check, Compare,
   * Apply, Refresh and Push against it — `placement` a later one, or
   * undefined for the clone's first, whose Check reads the host for the
   * clone and follows it (space-60). Its Compare plans `HEAD` as the
   * previous placement's merge left it (space-19, space-33). A push
   * rejected runs it once more from Check, and rejected again stops it;
   * a turn run again for its catch-up ends behind instead. A stop of
   * this placement alone ends its turn on its line; any other ends the
   * sync, its line saying so too (space-15). Its merge's reconcile may
   * make it follow another instance, from where its turn goes on, drop
   * it, its turn then ending at Refresh with nothing pushed, or find its
   * drop waiting, its line then reading why (space-91).
   */
  private async turn(op: SpaceOp, placement: Placement | undefined, input: TurnInput, upstream: { set: boolean }, tally: { sent: number; received: number }): Promise<Turn | Restart> {
    const first = placement === undefined;
    // A later placement as it stands, after a follow renamed it
    // (space-60, space-91).
    let held = placement;
    // The placement's remote's name as it stands, the first's after its
    // follow (space-60).
    const nameNow = (): string => held ? this.nameNow(held.name) : this.facts.remoteName ?? this.firstName();
    let remote = held?.url ?? this.facts.remote ?? "";
    let readOnly = false;
    let at: HostInstance | undefined;
    let rechecks = 0;
    let pending: Pending | undefined;
    let counts = { sent: 0, received: 0 };
    // What its own merge's reconcile did to it, and its name and origin
    // before (space-91).
    let fate: PlacementFate | undefined;
    let before = { name: "", origin: null as string | null };
    const ended = (outcome: PlacementOutcome, extra: { syncedAt?: number; pushed?: boolean; notice?: GitFailure } = {}): Turn => {
      const name = nameNow();
      this.runOf(name).outcome = outcome;
      return {
        first, name, origin: this.originOf(held), remote, at, readOnly, outcome, pushed: extra.pushed ?? false, tally,
        ...(extra.syncedAt !== undefined ? { syncedAt: extra.syncedAt } : {}),
        ...(extra.notice !== undefined ? { notice: extra.notice } : {}),
      };
    };
    this.turnAt = held?.instance ?? undefined;
    try {
      let next: "check" | "compare" | "apply" | "refresh" | "push" = "check";
      for (;;) {
        switch (next) {
          case "check": {
            await this.enter(op, "check", false, this.originOf(held));
            const checked = await this.check(remote, op, held);
            // A later placement's Check may make it follow another
            // instance, from which its turn goes on (space-60).
            if (held && checked.placement) {
              held = checked.placement;
              this.turnAt = held.instance ?? undefined;
            }
            // The host may hand over another URL, after a rename or a
            // transfer, and may answer that this account only reads
            // (space-60, space-61); the push goes to the instance the
            // check read (git-host-9).
            remote = checked.remote;
            readOnly = checked.readOnly;
            at = checked.at;
            if (checked.empty) {
              counts = { sent: planStorageUnits({ ours: readStorageTree(this.dir, "HEAD"), theirs: new Map(), base: new Map() }).length, received: 0 };
              next = "push";
            } else next = "compare";
            break;
          }
          case "compare": {
            await this.enter(op, "compare", false, this.originOf(held));
            // A join a Place or an Attach owes it joins here, as that
            // act said (space-13, space-97, space-99).
            const owed = this.runs.get(nameNow())?.joinOwed === true;
            const result = await this.compare(nameNow(), input.choices, input.join || owed, input.setUpSaves);
            const run = this.runs.get(nameNow());
            if (run) run.joinOwed = undefined;
            if (result.outcome === "unrelated") return ended({ kind: "unrelated", sent: tally.sent, received: tally.received });
            if (result.outcome === "choices") return ended({ kind: "choices", sent: tally.sent, received: tally.received });
            if (result.outcome === "nothing") { counts = result.counts; next = "push"; break; }
            pending = result.pending;
            counts = pending.counts;
            next = "apply";
            break;
          }
          case "apply": {
            await this.enter(op, "apply", false, this.originOf(held));
            if (await this.apply(pending as Pending) === "restart") return { restart: nameNow(), placement: held };
            // The merge made, the clone's placements are reconciled with
            // the files it left, before the next placement's turn
            // (space-12, space-91).
            before = { name: nameNow(), origin: this.originOf(held) };
            fate = (await this.reconcileMerge()).get(before.name);
            if (fate?.kind === "followed") {
              // It goes on with the instance it follows: its catalog was
              // read, and its credential takes the push (space-60).
              const to = fate.name;
              held &&= this.placementsNow().find((candidate) => candidate.name === to) ?? held;
              const followed = held ?? this.placements[0];
              if (followed?.instance) {
                at = this.owner.hostAt(followed.instance);
                if (held) this.turnAt = followed.instance;
              }
              remote = followed?.url ?? remote;
            }
            next = "refresh";
            break;
          }
          case "refresh": {
            const dropped = fate?.kind === "dropped";
            await this.enter(op, "refresh", false, dropped ? before.origin : this.originOf(held));
            await this.refresh(dropped ? before.name : nameNow());
            if (fate?.kind === "dropped") {
              // Dropped by its own merge: nothing is pushed to it, and it
              // has no line (space-91).
              tally.received += counts.received;
              return { first, name: before.name, origin: before.origin, remote, at, readOnly, outcome: { kind: "synced", sent: tally.sent, received: tally.received }, pushed: false, tally, dropped: true };
            }
            // Its drop or follow waiting, it syncs nothing more (space-91).
            if (fate?.kind === "withheld") return ended(this.runOf(nameNow()).outcome as PlacementOutcome);
            next = "push";
            break;
          }
          case "push": {
            if (readOnly) {
              // A read-only placement brings and sends nothing; new
              // sessions stay for the placements that take pushes
              // (space-12, space-61). Its turn completes here (space-22).
              tally.received += counts.received;
              const time = Date.now();
              this.recordPlacement(nameNow(), "last", { at: time, sent: 0, received: tally.received });
              return ended({ kind: "synced", sent: 0, received: tally.received }, { syncedAt: time });
            }
            await this.enter(op, "push", true, this.originOf(held));
            // The upstream is set once, at the first placement (space-12).
            const pushed = await this.push(first ? this.remoteNamed("push") : nameNow(), remote, first && !upstream.set, at, held);
            if (pushed === "rejected") {
              if (input.catchUp) return ended({ kind: "behind", sent: tally.sent, received: tally.received });
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
            if (first) upstream.set = true;
            tally.sent += counts.sent;
            tally.received += counts.received;
            const time = Date.now();
            // Recorded for the placement it synced, under the name its
            // remote bears now, a follow at Check having renamed it
            // (space-22, storage-5).
            this.recordPlacement(nameNow(), "last", { at: time, sent: tally.sent, received: tally.received });
            return ended({ kind: "synced", sent: tally.sent, received: tally.received }, { syncedAt: time, pushed: pushed === "ok" });
          }
        }
      }
    } catch (error) {
      // Its notice owed at its Check: its line waits for Continue, before
      // any branch or transport effect (space-57, git-host-22).
      if (error instanceof NoticeOwed) {
        return ended({ kind: "waiting", sent: tally.sent, received: tally.received }, { notice: this.owner.placementFailure(this, error.failure, held) });
      }
      const stop = this.stopOn(nameNow(), held, error);
      if (stop.whole) throw stop;
      return ended(this.runOf(nameNow()).outcome as PlacementOutcome);
    } finally { this.turnAt = undefined; }
  }

  /** The turn of a placement its admission stopped (space-57,
   * git-host-22): no step runs there; its line waits for its notice's
   * Continue, or reads its first-notice read's stop. */
  private admittedTurn(placement: Placement | undefined, name: string, admitted: PlacementAdmission, tally: { sent: number; received: number }): Turn {
    const turn = { first: placement === undefined, name, origin: this.originOf(placement), remote: placement?.url ?? this.facts.remote ?? "", at: undefined, readOnly: false, pushed: false, tally };
    if (admitted.kind === "waiting") {
      const outcome: PlacementOutcome = { kind: "waiting", sent: tally.sent, received: tally.received };
      this.runOf(name).outcome = outcome;
      return { ...turn, outcome, notice: this.owner.placementFailure(this, admitted.stop.failure, placement) };
    }
    this.stopOn(name, placement, admitted.stop);
    return { ...turn, outcome: this.runOf(name).outcome as PlacementOutcome };
  }

  /** After a placement's merge, the clone's placements reconciled with
   * the files it left, where it changed them (space-91): what that did
   * to each placement it could not keep, by the name each bore, each
   * dropped or waiting placement's line saying so. */
  private async reconcileMerge(): Promise<Map<string, PlacementFate>> {
    const applied = this.applied as Applied;
    const same = await this.git.run(["diff", "--quiet", applied.headBefore, applied.headAfter, "--", PLACEMENTS_DIR]);
    if (same.code === 0) return new Map();
    const fates = await this.owner.reconcilePlacements(this);
    for (const [name, fate] of fates) {
      if (fate.kind === "dropped") this.swept.set(name, "dropped");
      else if (fate.kind === "withheld") {
        const placements = this.placementsNow();
        const standing = placements.find((candidate) => candidate.name === name);
        this.swept.set(name, this.stopOn(name, standing === placements[0] ? undefined : standing, fate.stop));
      }
    }
    return fates;
  }

  /** The turns a sync ran, as the reconciles since left their
   * placements (space-91): one followed under the name, at the instance
   * and with the URL it now bears; one dropped marked so; one whose drop
   * waits reading its stop. */
  private refreshTurns(turns: Turn[]): void {
    for (const [index, turn] of turns.entries()) {
      const name = this.nameNow(turn.name);
      const fate = this.swept.get(name);
      if (fate === "dropped") { turns[index] = { ...turn, name, dropped: true }; continue; }
      if (fate) { turns[index] = { ...turn, name, outcome: this.runOf(name).outcome ?? turn.outcome }; continue; }
      if (name === turn.name) continue;
      const standing = this.placementsNow().find((candidate) => candidate.name === name);
      turns[index] = {
        ...turn,
        name,
        origin: standing?.instance ?? turn.origin,
        remote: standing?.url ?? turn.remote,
        at: standing?.instance ? this.owner.hostAt(standing.instance) : turn.at,
      };
    }
  }

  /**
   * The catch-up (space-12): `spex` pushed once more, a fast-forward, to
   * each placement whose turn synced it and a later merge left behind,
   * in the order added. A push rejected runs that placement once more
   * from Check, after which the others are caught up again; rejected
   * again, it ends behind. A read-only placement receives nothing, nor
   * does one a merge dropped or whose drop waits (space-91).
   */
  private async catchUp(op: SpaceOp, turns: Turn[], upstream: { set: boolean }): Promise<Restart | undefined> {
    const rerun = new Set<Turn["tally"]>();
    for (let again = true; again;) {
      again = false;
      this.refreshTurns(turns);
      const head = await this.git.ok(["rev-parse", "HEAD"]);
      for (const [index, turn] of turns.entries()) {
        if (turn.readOnly || turn.dropped || turn.outcome.kind !== "synced") continue;
        const standing = this.placementsNow().find((candidate) => candidate.name === turn.name);
        if (standing === undefined) continue;
        const placement = turn.first ? undefined : standing;
        const ref = await this.git.run(["rev-parse", "-q", "--verify", `${this.refOf(turn.name)}^{commit}`]);
        if (ref.code === 0 && ref.stdout.toString("utf8").trim() === head) continue;
        // The instance its turn's check read takes its push (git-host-21).
        this.turnAt = placement ? turn.at?.origin ?? placement.instance ?? undefined : undefined;
        let pushed: "ok" | "nothing" | "rejected";
        try {
          await this.enter(op, "push", true, turn.origin, "catch-up");
          pushed = await this.push(turn.name, turn.remote, false, turn.at, placement);
        } catch (error) {
          const stop = this.stopOn(turn.name, placement, error);
          if (stop.whole) throw stop;
          turns[index] = { ...turn, outcome: this.runOf(turn.name).outcome as PlacementOutcome };
          continue;
        } finally { this.turnAt = undefined; }
        if (pushed !== "rejected") { if (pushed === "ok") turns[index] = { ...turn, pushed: true }; continue; }
        if (rerun.has(turn.tally)) {
          const behind: PlacementOutcome = { kind: "behind", sent: turn.tally.sent, received: turn.tally.received };
          this.runOf(turn.name).outcome = behind;
          turns[index] = { ...turn, outcome: behind };
          continue;
        }
        rerun.add(turn.tally);
        const ranAgain = await this.turn(op, placement, { choices: {}, join: false, catchUp: true }, upstream, turn.tally);
        if ("restart" in ranAgain) return ranAgain;
        turns[index] = { ...ranAgain, pushed: ranAgain.pushed || turn.pushed };
        // `HEAD` moved: every other placement is caught up again.
        again = true;
        break;
      }
    }
    return undefined;
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
    await this.writeUnheldPlacements();
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

  /** Before Save stages, the file of each placement with an instance
   * that no commit reachable from `spex` has held — each placement of a
   * clone the instances migration moved, at its first sync — is written
   * as the act placing it would have written it, so this Save commits it
   * and every device holding that placement commits the same bytes; a
   * file a commit once held is never written again here, so a removal a
   * merge brought stands (storage-37). A placement whose remote records
   * no host id has no file to write, and a write refused is reported and
   * refuses no Save (storage-12). */
  private async writeUnheldPlacements(): Promise<void> {
    const history: HistoryRun = async (args) => {
      const run = await this.git.run(args);
      return { ok: run.code === 0, stdout: run.stdout.toString("utf8") };
    };
    for (const placement of this.placementsNow()) {
      if (placement.instance === null || placement.id === null) continue;
      let folder: string;
      try { folder = instanceFolder(placement.instance); } catch { continue; }
      if (await placementFileEverHeld(history, folder)) continue;
      this.writePlacement(placement.instance, placement.id);
    }
  }

  private validation(): { own: boolean; libraryDir: string } {
    return { own: this.key === this.host.store.home.own(), libraryDir: this.host.libraryDir };
  }

  /** Step 2 — Check: read the host for this repository where it lies on
   * the Git host, prepare its branch before a first push, then fetch the
   * host's `spex` without merging with the brokered credential;
   * `empty` where the host holds no `spex` (space-8, space-12). The first
   * placement's check reads the host for the clone, following it
   * (space-60); a later placement's, given, reads the instance governing
   * it alone, which a sync follows where it is not its own, its remote
   * renamed (space-60); a check follows nothing (git-host-9). What it
   * learns is that placement's (space-31), which comes back as it then
   * stands where a follow renamed it. */
  private async check(remote: string, op: SpaceOp, placement?: Placement): Promise<{ empty: boolean; readOnly: boolean; at: HostInstance | undefined; remote: string; placement?: Placement }> {
    const later = placement === undefined ? undefined : await this.owner.hostCheckPlacement(this, placement, op);
    const host = placement === undefined ? await this.owner.hostCheck(this, op) : later;
    const target = host?.remote ?? remote;
    // A later placement as its host's read left it, a follow renaming it.
    const held = later?.placement ?? placement;
    // The remote by its name in the clone, as the host's read left it.
    const name = held === undefined ? this.remoteNamed("check") : held.name;
    const ref = held === undefined ? this.remoteRef() : this.refOf(name);
    // The instance the check read brokers its transport — the clone's,
    // or the one it followed there (git-host-9, space-60).
    const credential = host ? await this.owner.credentialFor(host.instance, target, "check", this) : null;
    const options = { transport: true, ...(credential ? { credential } : {}) };
    try {
      const heads = await this.git.run(["ls-remote", "--exit-code", "--heads", name, `refs/heads/${SPEX_BRANCH}`], options);
      const outcome = { readOnly: host?.readOnly ?? false, at: host?.instance, remote: target, ...(held !== placement && held ? { placement: held } : {}) };
      const run = this.runOf(name);
      if (heads.code === 2) {
        run.remoteEmpty = true;
        run.unrelated = false;
        run.checkedAt = Date.now();
        return { empty: true, ...outcome };
      }
      if (heads.code !== 0) throw this.transportStop("check", heads, target, host !== undefined, held);
      const fetched = await this.git.run(["fetch", "-q", "--no-tags", name, `+refs/heads/${SPEX_BRANCH}:${ref}`], options);
      if (fetched.code !== 0) throw this.transportStop("check", fetched, target, host !== undefined, held);
      run.remoteEmpty = false;
      run.checkedAt = Date.now();
      return { empty: false, ...outcome };
    } finally {
      await credential?.dispose();
    }
  }

  /** A failed transport in the plain words of space-15: the Git host's
   * own, with its words kept whole, for a placement on the host — which
   * a refusal turns read-only and a missing repository unreachable until
   * its instance's next read — and the remote's form's otherwise
   * (space-50). `placement` names a placement beside the first, whose
   * instance's name the words carry. */
  private classify(run: GitRun, remote: string, atHost: boolean, placement?: Placement): GitFailure {
    if (!atHost) return classifyTransportFailure(run, remote);
    const failure = placement?.instance
      ? this.owner.withoutHostUrls(classifyHostTransportFailure(run, this.owner.instanceName(placement.instance)), { remote, id: placement.id, remoteName: placement.name }, this.key, placement.instance)
      : this.owner.withoutHostUrls(classifyHostTransportFailure(run, this.owner.hostNameOf(this)), { remote, id: this.facts.id, remoteName: this.facts.remoteName }, this.key);
    const name = placement?.name ?? this.firstName();
    if (failure.cause === "refused") this.setOverride(name, { state: "read-only", reason: failure.message });
    if (failure.cause === "gone") this.setOverride(name, { state: "unreachable", reason: failure.message });
    return failure;
  }

  /** A failed transport's stop (space-15): its placement's alone, but
   * where Git's own error ends the whole sync — the host's answer with an
   * HTTP status no row reads being the host's error, its placement's. */
  private transportStop(step: SyncStep, run: GitRun, remote: string, atHost: boolean, placement?: Placement, failure: GitFailure = this.classify(run, remote, atHost, placement)): SpaceStopped {
    return new SpaceStopped(step, failure, failure.cause === "git" ? !(atHost && hostErrorStatus(run.stderr) !== undefined) : undefined);
  }

  /** Give the host's empty repository the default branch it never
   * committed (git-host-7): `main`, one commit of the README the host
   * would have written, made in the object store alone — the clone's
   * working tree, index and refs untouched — with the clone's commit
   * identity, and pushed with the credential `instance` — the one the
   * check reads — brokers. A refusal stops the Check step as any
   * transport's does (space-15). */
  async pushDefaultBranch(remote: string, name: string, instance: HostInstance, placement?: Placement): Promise<void> {
    const blob = await this.git.ok(["hash-object", "-w", "--stdin"], { input: `# ${name}\n` });
    const tree = await this.git.ok(["mktree"], { input: `100644 blob ${blob}\tREADME.md\n` });
    const commit = await this.git.ok([...(await this.git.committerArgs()), "commit-tree", tree, "-m", "Initial commit"]);
    // The remote of the placement whose Check this is — a later one's
    // given, the first's as its Check left it — which a refusal names in
    // its instance's words (space-15).
    const remoteName = placement?.name ?? this.remoteNamed("check");
    const credential = await this.owner.credentialFor(instance, remote, "check", this);
    let run: GitRun;
    try {
      run = await this.git.run(["push", "-q", remoteName, `${commit}:refs/heads/main`], { transport: true, ...(credential ? { credential } : {}) });
    } finally {
      await credential?.dispose();
    }
    if (run.code !== 0) throw this.transportStop("check", run, remote, true, placement);
  }

  /** Step 3 — Compare: the plan of HEAD — as the previous placement's
   * merge left it — against the `spex` of the placement whose remote
   * bears `name`, over their ancestor, or the empty tree for a join
   * (space-13, space-14, space-33). A set-up join, given its own Saves,
   * takes the host's side of every unit both sides hold where the clone
   * holds nothing of its own — the selection "All host's" sends
   * (space-17, space-59). */
  private async compare(name: string, choices: Record<string, StorageChoice>, join: boolean, setUpSaves?: ReadonlySet<string>): Promise<CompareResult> {
    const originRef = this.refOf(name);
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const origin = await this.git.ok(["rev-parse", originRef]);
    const merged = await this.git.run(["merge-base", "HEAD", originRef]);
    // The plan is the placement's it compares against (space-31,
    // space-33).
    const run = this.runOf(name);
    run.unrelated = merged.code !== 0;
    if (run.unrelated && !join) return { outcome: "unrelated" };
    const base = run.unrelated ? EMPTY_TREE : merged.stdout.toString("utf8").trim();
    // The trees are read where the clone lies now (DR-111).
    const trees: StorageTrees = { ours: readStorageTree(this.dir, head), theirs: readStorageTree(this.dir, origin), base: readStorageTree(this.dir, base) };
    const units = planStorageUnits(trees);
    run.plan = { ours: head, oursTree: head, theirs: origin, base, units };
    run.lists = await this.describe(units, trees, { ours: head, theirs: origin, base });
    this.settleLocal();
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
    return { outcome: "apply", pending: { head, origin, base, units, resolved, counts, placement: this.placements.find((placement) => placement.name === name)?.instance ?? null } };
  }

  /** Whether the saved clone still holds its exact generated bootstrap
   * (space-59), beside the placement files the core writes as it places
   * the clone (storage-36), which hold nothing of the reader's own.
   * Missing proof asks choices; commit subjects and Saves cannot prove
   * that configuration or environment bytes are unowned. */
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
    const entries = async (commit: string): Promise<string[]> => (await this.git.ok(["ls-tree", "-r", "-z", "--full-tree", commit]))
      .split("\0").filter((line) => line !== "" && !line.slice(line.indexOf("\t") + 1).startsWith(`${PLACEMENTS_DIR}/`));
    const [kept, generated] = [await entries(head), await entries(bootstrap)];
    return kept.length === generated.length && kept.every((line, index) => line === generated[index]);
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
            const record: ApplyMarker = { v: 1, placement: pending.placement, ours: pending.head, theirs: pending.origin, base: pending.base, choices: Object.fromEntries(pending.resolved), at: Date.now() };
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
   * view reflects the selected state (space-20); the placement whose
   * remote bears `name` now shares the clone's history. */
  private async refresh(name: string): Promise<void> {
    const applied = this.applied as Applied;
    await this.reindex(!(await this.git.succeeds(["diff", "--quiet", applied.headBefore, applied.headAfter, "--", "config/playbook.config.yaml"])));
    // A placement its own merge dropped has nothing left to mark.
    const run = this.runs.get(name);
    if (run) run.unrelated = false;
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

  /** Step 6 — Push `spex` to the placement whose remote bears `name`,
   * setting the upstream where `setUpstream` asks — once, at the first
   * placement (space-12) — with the credential its instance brokers —
   * `at`, the instance its Check read, none for a remote not at an
   * instance (git-host-9). `placement` names a placement beside the
   * first, whose instance's name a failure carries. */
  private async push(name: string, remote: string, setUpstream: boolean, at: HostInstance | undefined, placement?: Placement): Promise<"ok" | "nothing" | "rejected"> {
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const ref = this.refOf(name);
    const origin = await this.git.run(["rev-parse", "-q", "--verify", `${ref}^{commit}`]);
    if (!setUpstream && origin.code === 0 && origin.stdout.toString("utf8").trim() === head) return "nothing";
    const credential = at ? await this.owner.credentialFor(at, remote, "push", this) : null;
    let run: GitRun;
    try {
      // The upstream names the remote by its name in the clone (DR-127).
      run = await this.git.run(setUpstream ? ["push", "-q", "-u", name, SPEX_BRANCH] : ["push", "-q", name, SPEX_BRANCH], { transport: true, ...(credential ? { credential } : {}) });
    } finally {
      await credential?.dispose();
    }
    if (run.code === 0) {
      // The host now holds `spex`: later plans compare against it.
      this.runOf(name).remoteEmpty = false;
      if (setUpstream) this.upstreamName = name;
      await this.git.run(["update-ref", ref, head]);
      return "ok";
    }
    const failure = this.classify(run, remote, at !== undefined, placement);
    if (failure.cause === "rejected") return "rejected";
    throw this.transportStop("push", run, remote, at !== undefined, placement, failure);
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

  /** A unit's diff against the plan of the placement `placement` names —
   * its instance's origin, or null for the path placement — its first
   * where omitted, or against `HEAD` for a clone with none (space-10,
   * space-29). */
  async diff(unit: string, path: string, side: SpaceChoice, placement?: string | null): Promise<{ patch: string; truncated: boolean }> {
    const named = (): Placement | undefined => placement === undefined
      ? this.placements[0]
      : this.placements.find((candidate) => (candidate.instance === null ? null : canonicalOrigin(candidate.instance)) === (placement === null ? null : canonicalOrigin(placement)));
    const planOf = (): { plan?: LastPlan; checked: boolean } => {
      const at = named();
      if (!at) return { plan: this.placements.length === 0 ? this.unchecked : undefined, checked: false };
      const run = this.runs.get(at.name);
      return { plan: run?.plan, checked: run !== undefined && run.checkedAt !== null };
    };
    // A placement named is one the clone holds as read now (space-29).
    if (placement !== undefined && !named()) await this.readRepository();
    if (placement !== undefined && !named()) throw new CoreError("invalid_request", noSuchPlacement(splitKey(this.key).name));
    if (!planOf().plan) await this.readState(true);
    const { plan, checked } = planOf();
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
    if (side === "remote" && !checked) {
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
   * (space-64), by the clone's key, then by the origin of the instance
   * each waits at — one per placement (DR-128); asked again at that
   * instance's next read. */
  private readonly waiting = new Map<string, Map<string, Waiting>>();
  /** The progress of joins in flight or stopped, by the instance each
   * joins at and the host's id there (space-63, joinKey) — two Git
   * systems mint one id: each join's own entry, which only it replaces
   * or removes; no join is refused because another runs. */
  private readonly joining = new Map<string, SpaceSyncPhase>();
  /** The set-up step placing your own group's own repository at an
   * instance (space-4), one at a time across instances, its first
   * placement brought by the earliest signed-in instance in the home's
   * list: the last begun, which the next waits for. */
  private owning?: Promise<void>;
  /** Set once the core stops: nothing is read or announced after. */
  private stopping = false;
  /** This machine's identity for reading session leases, once read. */
  private leaseIdentity?: Promise<string | undefined>;

  constructor(private readonly host: SpaceHost) {
    this.probe = new SpaceGit(host.home, host.env, host.transportTimeoutMs !== undefined ? { transportTimeoutMs: host.transportTimeoutMs } : {});
  }

  /** The step a clone waits for at an instance (space-64), if any. */
  private waitingAt(key: string, origin: string): Waiting | undefined {
    return this.waiting.get(key)?.get(origin);
  }

  /** Every step a clone waits for, in the order they began. */
  private waitsOf(key: string): Waiting[] {
    return [...(this.waiting.get(key)?.values() ?? [])];
  }

  /** A step a clone waits for at the instance it names, in place of any
   * there before. */
  private setWaiting(key: string, waiting: Waiting): void {
    let waits = this.waiting.get(key);
    if (!waits) { waits = new Map(); this.waiting.set(key, waits); }
    waits.set(waiting.instance, waiting);
  }

  /** A clone's wait at one instance ends — every one of its waits where
   * none is named — only while it is `only`, where given: one asked
   * again meanwhile stands. */
  private endWaiting(key: string, origin?: string, only?: Waiting): void {
    const waits = this.waiting.get(key);
    if (!waits) return;
    if (origin === undefined) waits.clear();
    else if (only === undefined || waits.get(origin) === only) waits.delete(origin);
    if (waits.size === 0) this.waiting.delete(key);
  }

  /** Every wait at an instance ends: its sign-out or its Forget. */
  private endWaitsAt(origin: string): void {
    for (const key of [...this.waiting.keys()]) this.endWaiting(key, origin);
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
   * (space-60), but one at which the clone holds another placement, onto
   * which no follow is made; undefined where none does. */
  governingOf(machine: RepositorySync): HostInstance | undefined {
    const own = this.instanceOfClone(machine);
    if (own && this.signedInAt(own)) return own;
    const facts = machine.facts;
    if (facts.remote === null) return undefined;
    const first = machine.placements[0];
    return this.listedInstances().find((instance) => instance !== own && this.signedInAt(instance) && !this.holdsAt(machine, instance, first?.name) && this.listingOf(instance, facts) !== undefined);
  }

  /** The instance governing one placement of a clone (git-host-5,
   * space-60): its own — the one its remote is named by — while signed in
   * there; while that is signed out, the earliest signed-in instance in
   * the home's list whose view lists its host repository by its Git
   * origin and id, which its next sync follows, but one at which the
   * clone holds another placement, onto which no follow is made;
   * undefined for the path placement, or where none does. */
  governingOfPlacement(machine: RepositorySync, placement: Placement): HostInstance | undefined {
    if (placement.instance === null) return undefined;
    const own = this.instanceAt(placement.instance);
    if (this.signedInAt(own)) return own;
    const facts = { remote: placement.url, id: placement.id };
    return this.listedInstances().find((instance) => instance !== own && this.signedInAt(instance) && !this.holdsAt(machine, instance, placement.name) && this.listingOf(instance, facts) !== undefined);
  }

  /** Whether a clone holds a placement at an instance other than the
   * one whose remote bears `except` (storage-34: at most one per
   * instance). */
  private holdsAt(machine: RepositorySync, instance: HostInstance, except: string | undefined): boolean {
    return machine.placements.some((placement) => placement.name !== except && placement.instance !== null && canonicalOrigin(placement.instance) === instance.origin);
  }

  /** The instance at an origin, as a placement's turn takes its
   * credential there (git-host-9, space-60). */
  hostAt(origin: string): HostInstance {
    return this.instanceAt(origin);
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

  /** The instance a clone's running turn goes to (space-12, git-host-21):
   * that of the placement whose turn runs, where it is not the clone's
   * first, else the one its sync goes to. */
  turnInstance(machine: RepositorySync): HostInstance {
    return machine.turnAt !== undefined ? this.instanceAt(machine.turnAt) : this.syncingOf(machine);
  }

  /** The name of the instance a clone's running turn goes to, as a report
   * prints it (space-15). */
  turnName(machine: RepositorySync): string {
    return this.nameOf(this.turnInstance(machine));
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
   * own — or the instance `at` a placement beside its first is at —
   * first, then every other the home lists in its order: its own
   * remote reads as its path in its instance — as that instance's
   * listing names it, else its key without its instance's folder
   * (DR-127), a placement beside the first's its URL's last segment —
   * and any other URL under an instance's Git origin as that instance's
   * name, the clone's own instance's where several report one origin;
   * then each placement `beside` reading as its own path in its instance,
   * a path placement as itself with any embedded user removed (DR-128). */
  private urlRules(facts: RemoteFacts, key: string, at?: string, beside: readonly Placement[] = []): Parameters<typeof withoutHostUrls>[1][] {
    const own = at === undefined ? this.servingAt(key, facts) : this.instanceAt(at);
    const listing = facts.remote === null ? undefined : this.listingOf(own, facts);
    const segment = instanceSegmentOf(key);
    const path = listing ? `${listing.repository.group.fullPath}/${listing.repository.path}`
      : at !== undefined && facts.remote !== null ? remoteSegment(facts.remote)
      : segment === null ? key : key.slice(segment.length + 1);
    const rules: Parameters<typeof withoutHostUrls>[1][] = [own, ...this.listedInstances().filter((instance) => instance !== own)].map((instance, index) => ({
      origin: instance.knownOrigin() ?? null,
      host: this.nameOf(instance),
      instance: instance.origin,
      own: index === 0 && facts.remote !== null ? { remote: facts.remote, path } : null,
    }));
    for (const placement of beside) {
      if (placement.url === facts.remote) continue;
      rules.push({ host: "", own: { remote: placement.url, path: this.placementPath(placement) } });
    }
    return rules;
  }

  /** A stopped step's lines with no URL under any instance's Git origin
   * (space-15, space-32): `facts` are the placement's the step ran on,
   * at the instance `at` where it is not the clone's own — a placement
   * beside the first, whose remote reads as its path there — and every
   * placement `beside` reads as its own path, before any URL under an
   * instance's Git origin reads as that instance's name, so placements
   * over one Git backend each keep their own. */
  withoutHostUrls(failure: GitFailure, facts: RemoteFacts, key: string, at?: string, beside: readonly Placement[] = []): GitFailure {
    const rules = this.urlRules(facts, key, at, beside);
    const clean = (text: string): string => {
      const owned = rules.reduce((out, rule) => withoutHostUrls(out, { host: rule.host, own: rule.own ?? null }), text);
      return rules.reduce((out, rule) => withoutHostUrls(out, { origin: rule.origin ?? null, host: rule.host, instance: rule.instance ?? null }), owned);
    };
    return { ...failure, message: clean(failure.message), guidance: clean(failure.guidance) };
  }

  /** A stop's lines as a placement's line and the row carry them
   * (space-15): `placement` the one it stopped at, beside the clone's
   * first, or the first where none is named; every placement the clone
   * holds reading as its path in its instance. A path placement beside
   * the first is read under the first's rules, its own remote as
   * itself. */
  placementFailure(machine: RepositorySync, failure: GitFailure, placement?: Placement): GitFailure {
    const beside = machine.placements;
    if (!placement?.instance) return this.withoutHostUrls(failure, machine.facts, machine.key, undefined, beside);
    return this.withoutHostUrls(failure, { remote: placement.url, id: placement.id, remoteName: placement.name }, machine.key, placement.instance, beside);
  }

  /** A placement's path as its line and a report read it (space-87,
   * space-15): as its instance's listing names it — while that is signed
   * out, a signed-in instance's that lists it (git-host-5) — else its
   * URL's last segment; the path placement's remote as itself with any
   * embedded user removed. */
  private placementPath(placement: Placement): string {
    if (placement.instance === null) return displayRemote(placement.url);
    const own = this.instanceAt(placement.instance);
    const facts = { remote: placement.url, id: placement.id, remoteName: placement.name };
    const instance = this.signedInAt(own) ? own : this.listedInstances().find((candidate) => this.signedInAt(candidate) && this.listingOf(candidate, facts) !== undefined);
    const listing = instance ? this.listingOf(instance, facts) : undefined;
    return listing ? `${listing.repository.group.fullPath}/${listing.repository.path}` : remoteSegment(placement.url);
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
    for (const machine of this.machines.values()) machine.clearOverridesAt(instance.origin);
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
        this.endWaitsAt(instance.origin);
        // Its own stopped joins go, every other instance's stand; a join
        // still running keeps its progress, its transport holding its own
        // brokered credential or stopping asking to sign in (space-15).
        for (const [key, phase] of [...this.joining]) if (this.joinedAt(key, instance) && phase.phase !== "running") this.joining.delete(key);
        for (const machine of answered) machine.hostOverride = undefined;
        for (const machine of this.machines.values()) machine.clearOverridesAt(instance.origin);
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
   * each placement at that instance of a clone other than your own
   * group's own repository follows the signed-in instance governing it —
   * the earliest in the home's list whose view lists the host repository
   * it records (git-host-5), but none at which the clone holds another
   * placement — as a sync's follow makes it follow (space-60): the key
   * placement re-keying the clone under that instance's folder, any other
   * by its remote's rename alone, its placement file rewritten either
   * way (storage-36); where any clone still has that instance as its own
   * (storage-31) or a placement there — listed by no signed-in instance,
   * or its follow refused by a session's lease beneath — Forget is
   * refused naming each, the instance kept with every follow already
   * made; then your own group's own repository's placement there, its
   * first or a later one, has its remote renamed to the folder of the
   * signed-in instance governing it, its file rewritten, else that
   * remote dropped, its id, what it fetched and its upstream with it,
   * its file left (space-5); last, the instance's entry leaves
   * `home.yaml` (storage-2), and with it what this run held of its
   * account. One still signed in is refused, and one the home does not
   * list `not_found` (space-29).
   */
  async forget(named: string): Promise<GroupsState> {
    const store = this.host.store;
    const instance = this.instanceAt(this.namedInstance(named));
    if (this.signedInAt(instance)) throw new CoreError("invalid_request", signOutFirst(this.nameOf(instance)));
    const identity = await this.machineIdentity();
    const own = store.home.own();
    const kept: string[] = [];
    const placed: string[] = [];
    const inUse: string[] = [];
    for (const repository of store.listRepositories()) {
      if (repository.key === own) continue;
      const outcome = await this.followAtForget(instance, repository.key, identity);
      if (outcome === "kept") kept.push(splitKey(repository.key).name);
      else if (outcome === "placed") placed.push(splitKey(repository.key).name);
      else if (outcome !== "followed" && outcome !== "other") inUse.push(outcome.inUse);
    }
    if (kept.length > 0 || placed.length > 0 || inUse.length > 0) {
      await this.publish();
      const host = this.nameOf(instance);
      const reasons = [...(kept.length > 0 ? [stillKeptUnder(host, kept)] : []), ...(placed.length > 0 ? [stillPlacedAt(host, placed)] : []), ...inUse];
      throw new CoreError("invalid_request", reasons.join(" · "));
    }
    if (store.repository(own)) {
      const machine = this.machine(own);
      await machine.readFacts();
      const at = this.placementAt(machine.placements, instance);
      if (at) {
        // Nothing is awaited from the governing instance's choice to the
        // remote's rename.
        const governing = this.governingOfPlacement(machine, at);
        const folder = governing && governing !== instance ? governing.folder() : null;
        if (folder === null) await machine.dropRemote(at);
        else if (!machine.followRemote(at, folder)) console.error(`spex: the remote of ${own} at ${instance.origin} keeps its name until its next sync`);
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
    this.endWaitsAt(instance.origin);
    for (const key of [...this.joining.keys()]) if (this.joinedAt(key, instance)) this.joining.delete(key);
    const state = await this.state();
    this.host.broadcast(state);
    return state;
  }

  /**
   * One clone's follow at a Forget of its instance (space-82): its
   * placement there follows the signed-in instance governing it
   * (git-host-5), as a sync's follow makes it follow (space-60) — a
   * placement beside its key placement by its remote's rename alone
   * (followPlacementAtForget), moving no clone; the key placement by one
   * rename of the clone at its instant (renameClone) to the path that
   * instance's view lists the host repository it records, its remote
   * renamed to that instance's folder, its placement file rewritten
   * there (storage-36) and the host's id recorded beside it (storage-34).
   * "other" for a clone that neither has that instance as its own
   * (storage-31) nor holds a placement there; "placed" where a placement
   * beside its key placement stays there; "kept" where the clone stays
   * of that instance — no signed-in instance listing its key placement,
   * its path standing as no key there or in a group held as colliding, a
   * destination taken, or its remote changed meanwhile; the session's
   * words where a lease beneath holds it.
   */
  private async followAtForget(instance: HostInstance, key: string, identity: string | undefined): Promise<"other" | "followed" | "kept" | "placed" | { inUse: string }> {
    const store = this.host.store;
    if (!store.repository(key)) return "other";
    const machine = this.machine(key);
    try { await machine.readFacts(); } catch {
      if (this.instanceOfClone(machine) === instance) return "kept";
      return this.placementAt(machine.placements, instance) ? "placed" : "other";
    }
    // Nothing is awaited from here to the rename: the clone lies where
    // the home says, with the remotes and ids just read.
    const from = machine.key;
    const source = machine.repository.dir;
    if (store.repository(from)?.dir !== source) return "other";
    const at = this.placementAt(machine.placements, instance);
    let followed = false;
    if (at && at.name !== keyPlacement(machine.placements)?.name) {
      if (!this.followPlacementAtForget(machine, at, instance)) return "placed";
      followed = true;
    }
    if (this.instanceOfClone(machine) !== instance) return followed ? "followed" : "other";
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

  /** A placement beside a clone's key placement follows, at a Forget of
   * its instance, the signed-in instance governing it (space-82,
   * space-60): the host's id recorded beside it where its remote records
   * none, then its remote renamed to that instance's folder, its file
   * rewritten there and the former instance's deleted, and this device's
   * records of it re-keyed, in one step at its instant (followRemote),
   * no clone moved. Whether it followed: not where no signed-in instance
   * but one holding another placement of the clone lists its host
   * repository, where that instance holds its group as colliding, or
   * where it changed meanwhile. */
  private followPlacementAtForget(machine: RepositorySync, placement: Placement, instance: HostInstance): boolean {
    const to = this.governingOfPlacement(machine, placement);
    const folder = to && to !== instance ? to.folder() : null;
    if (!to || folder === null) return false;
    const listing = this.listingOf(to, { remote: placement.url, id: placement.id });
    if (!listing || this.collides(listing.repository.group, this.viewOf(to))) return false;
    const held = placement.id === null ? machine.recordPlacementId(placement, listing.repository.id) : placement;
    return machine.followRemote(held, folder) !== undefined;
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
    if (renamed !== "conflict") await this.ensureOwn(instance, view, generation);
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
          const fresh = (instance.targets.get(machine)?.begun ?? 0) <= begun;
          // A placement beside the first at this instance reads its answer
          // afresh too (space-61).
          if (fresh) machine.clearOverridesAt(instance.origin);
          const serves = this.servingOf(machine) === instance;
          if (!serves && this.rowInstance(machine) !== instance) continue;
          if (fresh) machine.hostOverride = undefined;
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
   * repository placed at every instance the home signs in to. Its first
   * placement, which its instance and its commits' identity follow
   * (storage-31, space-32), is the earliest signed-in instance's in the
   * home's list, whichever instance's read answers first (space-83):
   * while it holds no placement with an instance, every other instance's
   * set-up leaves it, and the earliest's places it there, then at each
   * other signed-in instance in the home's list by the view held of it;
   * once it holds one, each instance's set-up places it there. */
  private ensureOwn(instance: HostInstance, view: HostView, generation: number): Promise<void> {
    const previous = this.owning;
    const work = (async () => {
      await previous?.catch(() => undefined);
      if (generation !== instance.accountGeneration || !this.signedInAt(instance)) return;
      const store = this.host.store;
      const key = store.home.own();
      if (!store.repository(key)) return;
      const machine = this.machine(key);
      await machine.readFacts();
      if (keyPlacement(machine.placements) !== undefined) {
        await this.ensureOwnOnHost(instance, view);
        return;
      }
      const signedIn = this.listedInstances().filter((entry) => this.signedInAt(entry));
      if (signedIn[0] !== instance) return;
      await this.ensureOwnOnHost(instance, view);
      for (const other of signedIn.slice(1)) {
        const held = this.viewOf(other);
        if (!held) continue;
        // Its first placement left waiting at the host, none other is
        // made before it (space-64).
        await machine.readFacts();
        if (keyPlacement(machine.placements) === undefined) return;
        await this.ensureOwnOnHost(other, held);
      }
    })();
    this.owning = work;
    return work;
  }

  /** Your own group's spex repository at an instance where it holds no
   * placement there and none whose host repository that instance lists
   * (space-4, space-65, git-host-5): joined where that instance lists
   * `<login there>-spex` in your namespace, else created there as that
   * and pushed — at the home's first sign-in, once its remote was dropped
   * (space-82), and at every instance signed in after — its folder
   * keeping its name. Holding no placement with an instance, it takes
   * this one as its first, as the sign-in's join takes the host's side
   * of an unchanged bootstrap (space-59); holding one, it is placed here
   * beside the others (ensureOwnLater). */
  private async ensureOwnOnHost(instance: HostInstance, view: HostView): Promise<void> {
    const store = this.host.store;
    const key = store.home.own();
    if (!store.repository(key)) return;
    const machine = this.machine(key);
    const facts = await machine.readFacts();
    if (keyPlacement(machine.placements) !== undefined) {
      await this.ensureOwnLater(instance, view, machine);
      return;
    }
    if (this.waitsOf(key).length > 0) return;
    // Your own group is named to the host by none, never by its id,
    // which names no group of the instance there (git-host-6).
    const group = { id: null, fullPath: userGroup(view)?.fullPath ?? store.home.ownName };
    const name = `${ownNameFor(view.account.login)}-spex`;
    const listed = this.ownNamespaceListing(view);
    const expected = facts.remotes;
    if (listed) {
      await this.adopt(instance, machine, listed, true, { setUp: true, ...(expected !== undefined ? { expected } : {}) });
      return;
    }
    await this.create(instance, machine, group, name, repositoryDescription({ kind: "group", group: group.fullPath }), "quiet", expected);
  }

  /** Your own group's own repository placed at an instance beside the
   * placements it holds (space-4, space-65): as an operation of its
   * machine, following one running (space-21, space-31), `<login
   * there>-spex` in your namespace there joined as a placement, its
   * history joined with the clone's as any two (space-13), or created
   * there — a creation the host leaves pending or refuses waiting on that
   * instance's line, asked again at its next read (space-64) — its
   * placement file written (storage-36), then the clone synced, its first
   * push there waiting for Continue as the sharing notice does
   * (space-57). Placed there meanwhile, or no longer holding a placement
   * with an instance, it does nothing. A refusal stays on the console:
   * the set-up stands, and the next read asks again (space-4). */
  private async ensureOwnLater(instance: HostInstance, view: HostView, machine: RepositorySync): Promise<void> {
    const key = machine.key;
    const placedOrWaiting = (placements: readonly Placement[]): boolean => keyPlacement(placements) === undefined
      || this.placedAt(placements, instance) || this.waitingAt(key, instance.origin) !== undefined;
    if (placedOrWaiting(machine.placements)) return;
    const login = view.account.login;
    const group = { id: null, fullPath: userGroup(view)?.fullPath ?? login };
    const listed = this.ownNamespaceListing(view);
    try {
      await machine.place(instance.origin, async () => {
        const placements = machine.placementsNow();
        if (placedOrWaiting(placements)) throw new OwnPlacedMeanwhile();
        const expected = remotesRead(placements);
        if (listed) this.placeAdd(instance, machine, listed, { join: true, expected });
        else await this.create(instance, machine, group, `${ownNameFor(login)}-spex`, repositoryDescription({ kind: "group", group: group.fullPath }), "quiet", expected, { noticed: false });
      });
    } catch (error) {
      if (error instanceof OwnPlacedMeanwhile) return;
      console.error(`spex: your own group is not placed at ${instance.origin} yet: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      if (this.waitsOf(key).length > 0) return "waiting";
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
      const expected = facts.remotes;
      if (listed) {
        await this.adopt(instance, machine, listed, true, expected !== undefined ? { expected } : {});
        return "joined";
      }
      const hostGroup = this.listedGroups(instance, view).find((entry) => entry.kind === "group" && entry.fullPath === group);
      if (!hostGroup || this.collides(hostGroup, view)) return "local";
      return await this.create(instance, machine, { id: hostGroup.id, fullPath: hostGroup.fullPath }, name, repositoryDescription({ kind: "group", group }), "quiet", expected);
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
   * while the clone's remotes read `expected`, as the caller read them
   * before asking the host (space-21).
   * `setUp` marks the account's set-up joining your own group's spex
   * repository (space-4, space-59), and `created` a repository the core
   * just created, which the clone records with its remote (git-host-7). */
  private async adopt(instance: HostInstance, machine: RepositorySync, listing: HostListing, join: boolean, options: { expected?: string; setUp?: boolean; created?: boolean } = {}): Promise<void> {
    const { repository } = listing;
    const { expected, setUp = false, created = false } = options;
    instance.changedAfter = instance.readsBegun;
    instance.targets.delete(machine);
    instance.attached.set(repository.id, listing);
    // A remote added is named by that instance's folder (DR-127).
    try { await machine.attachHost(repository.remoteUrl, repository.id, expected, created, instance.folder()); }
    catch (error) {
      instance.attached.delete(repository.id);
      throw error;
    }
    // The act names its placement in a tracked file, which its sync's
    // Save commits (storage-36).
    machine.writePlacement(instance.origin, repository.id);
    // The clone's first placement with an instance ends every creation
    // it waited for (space-58).
    this.endWaiting(machine.key);
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
   * (git-host-6): created, the clone takes it as its first placement
   * and syncs (adopt), or, for a Place (`place`), as a placement beside
   * its others (placeAdd), which the Place's operation then syncs; left
   * pending or refused quietly, the creation waits at that instance on
   * its line (space-64). */
  private async create(
    instance: HostInstance,
    machine: RepositorySync,
    group: { id: string | null; fullPath: string },
    name: string,
    description: string,
    mode: "refuse" | "quiet",
    expected?: string,
    place?: { noticed: boolean },
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
      this.setWaiting(machine.key, { instance: instance.origin, step: "create", group: group.fullPath, message: relayHostError(error, this.nameOf(instance)), create: ask, ...(place ? { place } : {}) });
      await this.publish();
      return "waiting";
    }
    if (answer.status === "pending") {
      this.setWaiting(machine.key, { instance: instance.origin, step: "create", group: group.fullPath, message: answer.message, create: ask, ...(place ? { place } : {}) });
      await this.publish();
      return "waiting";
    }
    // As the host answered: no `spex` branch yet, nor a members' count.
    const listing: HostListing = { repository: answer.repository, readOnly: null, branchPresent: false, members: null };
    if (place) this.placeAdd(instance, machine, listing, { created: true, noticed: place.noticed, ...(expected !== undefined ? { expected } : {}) });
    else await this.adopt(instance, machine, listing, false, { created: true, ...(expected !== undefined ? { expected } : {}) });
    return "created";
  }

  /**
   * A placement of a clone at an instance beside its others, as the
   * host answered its creation or a Place's join (space-97, storage-34):
   * its remote and id — and the core's creation mark for a repository it
   * created (git-host-7) — and its placement file (storage-36), written
   * in one synchronous step only while the clone's placements' remotes
   * read `expected`, as the caller read them before asking the host,
   * else refused `conflict` (space-21). From that write, the repository
   * counts as listed as the host answered it until a read begun after it
   * is held (git-host-5), and the creation it waited for there ends.
   * `noticed` records the notice seen for it (space-57, storage-5), and
   * `join` owes its first Compare the join of two histories (space-13).
   */
  private placeAdd(instance: HostInstance, machine: RepositorySync, listing: HostListing, options: { created?: boolean; join?: boolean; noticed?: boolean; expected?: string }): void {
    const { repository } = listing;
    const folder = instance.folder();
    const name = folder === null ? undefined
      : machine.addPlacementAt(options.expected, { url: repository.remoteUrl, id: repository.id, created: options.created === true, folder, origin: instance.origin });
    if (name === undefined) throw new CoreError("conflict", changedMeanwhile(splitKey(machine.key).name));
    instance.changedAfter = instance.readsBegun;
    instance.targets.delete(machine);
    instance.attached.set(repository.id, listing);
    this.endWaiting(machine.key, instance.origin);
    if (options.noticed) {
      try { this.host.store.setPlacementPref(machine.key, name, "noticed", true, false); }
      catch (error) { console.error(`spex: the notice seen for ${machine.key} at ${instance.origin} is not recorded: ${error instanceof Error ? error.message : String(error)}`); }
    }
    if (options.join) machine.oweJoin(name);
  }

  /** Every step left waiting at an instance, asked again at its read
   * (space-64): a creation a member with the rights did is found and
   * joined. An entry stands until its step is done or no longer asked
   * for — never lost to an act that failed meanwhile. Each clone's wait
   * at that instance is its own, a wait at another instance standing
   * (DR-128). */
  private async retryWaiting(instance: HostInstance, view: HostView): Promise<void> {
    for (const [key, waits] of [...this.waiting]) {
      const waiting = waits.get(instance.origin);
      if (!waiting) continue;
      if (!this.host.store.repository(key)) { this.endWaiting(key); continue; }
      const machine = this.machine(key);
      const facts = await machine.readFacts();
      if (waiting.step === "create" && waiting.create) {
        const ask = waiting.create;
        // Your own namespace for your own; the group asked of otherwise.
        const found = view.listings.find((listing) => {
          const group = listing.repository.group;
          if (listing.repository.path !== ask.name) return false;
          if (ask.groupId === null) return group.kind === "user" && sameLogin(group.fullPath, waiting.group);
          return group.kind === "group" && (group.id === ask.groupId || (group.id === null && group.fullPath === waiting.group));
        });
        const expected = facts.remotes;
        if (waiting.place) {
          // A Place's creation ends once the clone holds a placement at
          // that instance, or none with an instance any more, a Place
          // needing one (space-97, space-29); otherwise it is asked again
          // and, found or created, placed beside the others and synced,
          // a found one joined as any two histories (space-13).
          if (this.placedAt(machine.placements, instance) || keyPlacement(machine.placements) === undefined) { this.endWaiting(machine.key, instance.origin, waiting); continue; }
          try {
            if (found) this.placeAdd(instance, machine, found, { join: true, noticed: waiting.place.noticed, ...(expected !== undefined ? { expected } : {}) });
            else if (await this.create(instance, machine, { id: ask.groupId, fullPath: waiting.group }, ask.name, ask.description, "quiet", expected, waiting.place) !== "created") continue;
            await this.publish();
            this.startSync(machine.key, {});
          } catch (error) {
            console.error(`spex: ${machine.key} still waits at ${instance.origin}: ${error instanceof Error ? error.message : String(error)}`);
          }
          continue;
        }
        // A placement with an instance set meanwhile — a pick — ends the
        // wait for a creation; a path placement leaves it (space-58).
        if (keyPlacement(machine.placements) !== undefined) { this.endWaiting(machine.key, instance.origin, waiting); continue; }
        try {
          if (found) await this.adopt(instance, machine, found, true, { setUp: machine.key === this.host.store.home.own(), ...(expected !== undefined ? { expected } : {}) });
          else if (await this.create(instance, machine, { id: ask.groupId, fullPath: waiting.group }, ask.name, ask.description, "quiet", expected) === "created") this.endWaiting(machine.key, instance.origin, waiting);
        } catch (error) {
          console.error(`spex: ${machine.key} still waits: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
      // A branch preparation waits on the placement at that instance —
      // the first's where none other is there (space-64, git-host-7).
      const placement = machine.placements.find((candidate) => candidate.instance !== null && canonicalOrigin(candidate.instance) === instance.origin);
      const listing = placement ? listingFor(view, placement.id, placement.url) : listingFor(view, facts.id, facts.remote);
      if (!listing) continue;
      if (listing.branchPresent) { this.endWaiting(key, instance.origin, waiting); continue; }
      try {
        const answer = await instance.client.prepareBranch(listing.repository.id);
        if (answer.status === "ready") {
          this.endWaiting(key, instance.origin, waiting);
          this.startSync(key, {});
        } else this.setWaiting(key, { ...waiting, message: answer.message });
      } catch (error) {
        this.setWaiting(key, { ...waiting, message: relayHostError(error, this.nameOf(instance)) });
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
    // The instance the choice is at (space-29), one the home does not
    // list refused `not_found`.
    const keyed = this.instanceOfKey(key);
    const instance = this.instanceAt(this.namedInstance(choice.instance));
    const machine = this.machine(key);
    {
      // A clone holding no placement with an instance is picked, one
      // holding only its path placement among them (space-58,
      // storage-35); the placement is written only where none with an
      // instance stands at the write (attachHost), so a second pick meets
      // the first's remote there, or the host's own refusal of a taken
      // name.
      const expected = (await machine.readFacts()).remotes;
      if (keyPlacement(machine.placements) !== undefined) {
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
        await this.refuseHeldElsewhere(machine.key, listing, view.gitOrigin);
        // Joining pushes this clone's records into a repository others
        // read: the notice is seen first (space-57), for the placement
        // the join adds, named by the instance's folder — the clone's
        // first where it holds none (storage-5, storage-34).
        const store = this.host.store;
        const placement = placementName(instance.folder());
        const first = machine.placements.length === 0;
        if (noticed) store.setPlacementPref(key, placement, "noticed", true, first);
        else if (!listing.readOnly && mayHaveOthers(listing) && store.placementPref<unknown>(key, placement, "noticed", first) !== true) {
          throw new CoreError("invalid_request", readNoticeBeforeJoining(listing.repository.path), { notice: true, members: listing.members, visibility: listing.repository.visibility, placement: instance.origin });
        }
        await this.adopt(instance, machine, listing, true, expected !== undefined ? { expected } : {});
        return { accepted: true };
      }
      const base = kebab(choice.name.trim().replace(/-spex$/i, ""));
      if (!base) {
        throw new CoreError("invalid_request", nameNeedsALetter());
      }
      // Your own group by none; any id only among the groups of the
      // instance, your own group's id naming none of them (git-host-6).
      const group = choice.groupId === null
        ? { id: null, fullPath: userGroup(view)?.fullPath ?? this.host.store.home.ownName }
        : this.listedGroups(instance, view).find((entry) => entry.kind === "group" && entry.id === choice.groupId);
      if (!group) throw new CoreError("not_found", noSuchGroup());
      if ("kind" in group && this.collides(group, view)) {
        throw new CoreError("invalid_request", groupNamedLikeYourLogin(group.fullPath));
      }
      const project = this.projectFile(machine.repository);
      await this.create(instance, machine, { id: group.id, fullPath: group.fullPath }, `${base}-spex`,
        repositoryDescription({ kind: "project", name: project?.name ?? base, code: project?.remote ?? null }), "refuse", expected);
      return { accepted: true };
    }
  }

  /**
   * Place a project's spex repository at another instance (space-97,
   * space-88, space-29): join a spex repository that instance lists, or
   * create `<name>-spex` in a group or your namespace there, as a pick
   * does (git-host-6), then sync the clone, that placement among its
   * placements (space-12). Refused before anything is asked: a clone
   * holding no placement with an instance, which picks a group instead;
   * a group's or your own group's own spex repository; an instance the
   * clone holds a placement at — by that instance's folder, or by a
   * placement whose host repository it lists (git-host-5); the view not
   * saying the person may manage the members of every placement it
   * holds; a join into a repository that may have other members before
   * its notice is seen (space-57); and, as a pick's, a malformed name, a
   * group or a repository the view does not list, one held as colliding,
   * and one another clone here holds (git-host-5).
   * The host's step and the placement's add are the first step of an
   * operation of the clone's machine (space-31), the reply answering
   * once they are done: the name taken, a remote set meanwhile.
   */
  async place(key: string, choice: { kind: "join"; instance: string; hostId: string } | { kind: "create"; instance: string; groupId: string | null; name: string }, noticed = false): Promise<{ accepted: true }> {
    const instance = this.instanceAt(this.namedInstance(choice.instance));
    const machine = this.machine(key);
    const store = this.host.store;
    const name = splitKey(key).name;
    await machine.readFacts();
    const placements = machine.placements;
    if (keyPlacement(placements) === undefined) throw new CoreError("invalid_request", pickAGroupFirst());
    // A group's own records stay at its group's instance, and your own
    // group's each sign-in places (space-88, space-4).
    if (key === store.home.own() || !existsSync(machine.repository.projectFile)) throw new CoreError("invalid_request", groupRecordsStay(name));
    if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
    this.refusePlacedAt(machine, placements, instance);
    // Placing widens who reads every record: the view says the person
    // may manage the members of every placement it holds (space-88,
    // git-host-5).
    const keyed = keyPlacement(placements);
    for (const placement of placements) {
      if (placement.instance === null) continue;
      const governing = placement === keyed ? this.governingOf(machine) : this.governingOfPlacement(machine, placement);
      const listing = governing ? this.listingOf(governing, { remote: placement.url, id: placement.id }) : undefined;
      if (!listing?.repository.can.manageMembers) throw new CoreError("invalid_request", mayNotManageEvery(name));
    }
    const view = instance.view ?? await this.readHost(instance).catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.nameOf(instance))); });
    if (choice.kind === "join") {
      const listing = view.listings.find((entry) => entry.repository.id === choice.hostId);
      if (!listing) throw new CoreError("not_found", noLongerShared());
      // A group named like a login holds no folder of its own (space-61).
      if (this.collides(listing.repository.group, view)) throw new CoreError("invalid_request", groupNamedLikeYourLogin(listing.repository.group.fullPath));
      await this.refuseHeldElsewhere(machine.key, listing, view.gitOrigin);
      // Joining pushes every record into a repository others read: the
      // notice is seen first, for the placement the join adds, named by
      // the instance's folder (space-57, storage-5); the members of the
      // clone's other placements are not asked.
      const seen = noticed || store.placementPref<unknown>(key, placementName(instance.folder()), "noticed", false) === true;
      if (!seen && !listing.readOnly && mayHaveOthers(listing)) {
        throw new CoreError("invalid_request", readNoticeBeforeJoining(listing.repository.path), { notice: true, members: listing.members, visibility: listing.repository.visibility, placement: instance.origin });
      }
      return machine.place(instance.origin, async () => {
        const expected = this.placeAgain(machine, instance);
        this.placeAdd(instance, machine, listing, { join: true, noticed: seen, expected });
      });
    }
    const base = kebab(choice.name.trim().replace(/-spex$/i, ""));
    if (!base) {
      throw new CoreError("invalid_request", nameNeedsALetter());
    }
    // Your namespace there by none; any id only among the groups of the
    // instance (git-host-6).
    const group = choice.groupId === null
      ? { id: null, fullPath: userGroup(view)?.fullPath ?? store.home.ownName }
      : this.listedGroups(instance, view).find((entry) => entry.kind === "group" && entry.id === choice.groupId);
    if (!group) throw new CoreError("not_found", noSuchGroup());
    if ("kind" in group && this.collides(group, view)) throw new CoreError("invalid_request", groupNamedLikeYourLogin(group.fullPath));
    const project = this.projectFile(machine.repository);
    const description = repositoryDescription({ kind: "project", name: project?.name ?? base, code: project?.remote ?? null });
    return machine.place(instance.origin, async () => {
      const expected = this.placeAgain(machine, instance);
      // A creation the host leaves pending adds no placement, its wait
      // standing on that instance's line while the clone syncs its
      // others (space-97, space-64).
      await this.create(instance, machine, { id: group.id, fullPath: group.fullPath }, `${base}-spex`, description, "refuse", expected, { noticed });
    });
  }

  /** Whether a clone's placements hold one at an instance (storage-34,
   * git-host-5): one named by that instance's folder, or one whose host
   * repository that instance lists — one placement both list. */
  private placedAt(placements: readonly Placement[], instance: HostInstance): boolean {
    return placements.some((placement) => placement.instance !== null
      && (canonicalOrigin(placement.instance) === instance.origin || this.listingOf(instance, { remote: placement.url, id: placement.id }) !== undefined));
  }

  /** A Place at an instance the clone holds a placement at is refused
   * (space-29). */
  private refusePlacedAt(machine: RepositorySync, placements: readonly Placement[], instance: HostInstance): void {
    if (this.placedAt(placements, instance)) throw new CoreError("invalid_request", placedAlready(splitKey(machine.key).name, this.nameOf(instance)));
  }

  /** A Place's first step, after any operation it followed (space-21):
   * the clone still holds a placement with an instance and none at that
   * instance; its placements' remotes as read now, which its add finds
   * still standing or refuses as changed meanwhile. */
  private placeAgain(machine: RepositorySync, instance: HostInstance): string {
    const placements = machine.placementsNow();
    if (keyPlacement(placements) === undefined) throw new CoreError("invalid_request", pickAGroupFirst());
    this.refusePlacedAt(machine, placements, instance);
    return remotesRead(placements);
  }

  /**
   * Leave a project's placement at an instance (space-98, space-29):
   * refused before anything runs for a group's or your own group's own
   * spex repository, or an instance the clone holds no placement at — one
   * the home does not list, or a key naming no clone, `not_found`. Then,
   * as an operation of the clone's machine (space-31), answered at once:
   * the placement followed, fetched and dropped (leaveNow).
   */
  async leave(key: string, named: string, confirmed = false): Promise<{ accepted: true }> {
    const instance = this.instanceAt(this.namedInstance(named));
    const machine = this.machine(key);
    const name = splitKey(key).name;
    await machine.readFacts();
    // A group's own records stay at its group's instance, and your own
    // group's at every instance it signs in to (space-89, space-4).
    if (key === this.host.store.home.own() || !existsSync(machine.repository.projectFile)) throw new CoreError("invalid_request", groupRecordsKept(name));
    if (!this.placementAt(machine.placements, instance)) throw new CoreError("invalid_request", noSuchPlacement(name));
    return machine.leave(instance.origin, () => this.leaveNow(machine, instance, confirmed));
  }

  /** The clone's placement whose remote names an instance (storage-34):
   * at most one. */
  private placementAt(placements: readonly Placement[], instance: HostInstance): Placement | undefined {
    return placements.find((placement) => placement.instance !== null && canonicalOrigin(placement.instance) === instance.origin);
  }

  /**
   * A Leave's work inside its operation (space-98), once any operation
   * it followed has ended, on the clone's placement at `instance` as it
   * stands then — none left, nothing to do:
   * 1. its instance signed out, another signed-in instance listing its
   *    host repository and the clone holding no placement there: it
   *    follows that instance as a sync's follow makes it (space-60) —
   *    its remote renamed, its file rewritten, the key placement's clone
   *    moved to its path there — nothing fetched or dropped;
   * 2. unless `confirmed`, it is fetched with its instance's credential,
   *    one it cannot read stopping the leave in that read's cause, saying
   *    records pushed there since the last sync may be left behind, and a
   *    record unit it or the clone holds that no remaining placement's
   *    `spex` holds stopping it `unreceived` with their count;
   * 3. it is dropped — its remote with its id, its fetched `spex`, the
   *    upstream naming it and this device's records of it — its file
   *    deleted, the first moving the clone (storage-38), a refusal of
   *    that move stopping the leave whole with Retry.
   * Nothing at the host changes. The stop a leave ends in, else none.
   */
  private async leaveNow(machine: RepositorySync, instance: HostInstance, confirmed: boolean): Promise<SpaceSyncPhase | undefined> {
    await machine.readFacts();
    const placement = this.placementAt(machine.placements, instance);
    if (!placement) return undefined;
    const origin = instance.origin;
    if (!this.signedInAt(instance)) {
      const to = this.governingOfPlacement(machine, placement);
      const listing = to ? this.listingOf(to, { remote: placement.url, id: placement.id }) : undefined;
      if (to && to !== instance && listing) {
        await this.followByFile(machine, placement, to, listing, await this.machineIdentity());
        // A step the host left waiting at the instance it left is no more
        // this placement's.
        this.endWaiting(machine.key, origin);
        return undefined;
      }
    }
    if (!confirmed) {
      const host = this.nameOf(instance);
      let unread: SpaceStopped | undefined;
      if (!this.signedInAt(instance)) unread = new SpaceStopped("check", { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
      else {
        try { await machine.fetchPlacement(placement, instance); }
        catch (error) {
          const stop = hostStop("check", error, host);
          // Stop ends the leave as it stands (space-16).
          if (stop.failure.cause === "stopped") throw stop;
          unread = stop;
        }
      }
      if (unread) return { phase: "stopped", op: "leave", step: "check", cause: unread.failure.cause, message: leftBehind(host), guidance: confirmToRemove(), retry: true };
      const count = await machine.unreceivedUnits(placement.name);
      if (count > 0) return { phase: "stopped", op: "leave", step: "check", cause: "unreceived", message: unreceivedRecords(count), guidance: confirmToRemove(), retry: true, count };
    }
    await this.dropByFile(machine, placement, await this.machineIdentity(), true);
    this.endWaiting(machine.key, origin);
    return undefined;
  }

  /**
   * Attach a placement a placement file of the clone names (space-99,
   * space-90, space-29): the host repository that file names, as the
   * signed-in instance it names lists it (git-host-5), added as a remote
   * named by that instance's folder with the host's id in its own
   * section (storage-34), then the clone synced, that placement among its
   * placements (space-12). Refused before anything runs: an instance the
   * home does not list, or a key naming no clone, `not_found`; a group's
   * own spex repository, whose records stay in its group (space-87); that
   * instance signed out; no file of the clone naming a host repository it
   * lists; the clone holding a placement there already, or another clone
   * here holding that repository; one in a group held as colliding
   * (space-61); and the notice not seen, Attach being that placement's
   * notice (space-90). The add is the first step of an
   * operation of the clone's machine (space-31), checked again once any
   * operation it followed has ended, the reply answering once it is done.
   */
  async attach(key: string, named: string, noticed: boolean): Promise<{ accepted: true }> {
    const instance = this.instanceAt(this.namedInstance(named));
    const machine = this.machine(key);
    await machine.readFacts();
    // A group's own records stay in its group at one instance, refused
    // before any host is asked (space-87).
    if (machine.recordsStay()) throw new CoreError("invalid_request", groupRecordsStay(splitKey(key).name));
    if (this.signedInAt(instance) && !instance.view) await this.readHost(instance).catch((error: unknown) => { throw new CoreError("invalid_request", relayHostError(error, this.nameOf(instance))); });
    const { listing, gitOrigin } = this.attachable(machine, machine.placements, instance);
    const path = listing.repository.path;
    await this.refuseHeldElsewhere(machine.key, listing, gitOrigin);
    // Attach is that placement's notice, whatever its members (space-90).
    if (!noticed) throw new CoreError("invalid_request", readNoticeBeforeAttaching(path), { notice: true, members: listing.members, visibility: listing.repository.visibility, placement: instance.origin });
    return machine.attach(instance.origin, async () => {
      const placements = machine.placementsNow();
      const again = this.attachable(machine, placements, instance);
      await this.attachAdd(instance, machine, again.listing, placements, remotesRead(placements));
    });
  }

  /** The host repository an Attach at `instance` adds (space-29,
   * git-host-5): one a placement file of the clone names that the
   * instance, signed in, lists; refused for a group's own spex
   * repository, whose records stay in its group at one instance
   * (space-87), where the instance is signed out, where no file names
   * one it lists, where the clone holds a placement there already — by
   * the instance's folder, or one whose host repository it lists
   * (storage-34) — and where it lies in a group held as colliding, so no
   * clone is made or moved for it (space-61). */
  private attachable(machine: RepositorySync, placements: readonly Placement[], instance: HostInstance): { listing: HostListing; gitOrigin: string } {
    const name = splitKey(machine.key).name;
    if (machine.recordsStay()) throw new CoreError("invalid_request", groupRecordsStay(name));
    if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
    const filed = readPlacementFiles(machine.repository.dir).files.map((file) => this.fileListing(file)).find((found) => found?.instance === instance);
    if (!filed) throw new CoreError("invalid_request", noFiledPlacement(name, this.nameOf(instance)));
    if (this.placedAt(placements, instance)) throw new CoreError("invalid_request", placedAlready(name, this.nameOf(instance)));
    const group = filed.listing.repository.group;
    if (this.collides(group, instance.view)) throw new CoreError("invalid_request", groupNamedLikeYourLogin(group.fullPath));
    return { listing: filed.listing, gitOrigin: filed.gitOrigin };
  }

  /** One clone per host repository (git-host-5): a join — a pick's, a
   * Place's or an Attach's — of one another clone here holds as one of
   * its placements, by the instance's Git origin and the id or the
   * remote it records, is refused naming that clone (space-29). */
  private async refuseHeldElsewhere(key: string, listing: HostListing, gitOrigin: string): Promise<void> {
    const others = await Promise.all(this.host.store.listRepositories().filter((repository) => repository.key !== key).map(async (repository) => {
      try {
        const other = this.machine(repository.key);
        await other.readFacts();
        return { name: splitKey(repository.key).name, held: other.placements };
      } catch { return { name: splitKey(repository.key).name, held: [] as Placement[] }; }
    }));
    const holder = others.find(({ held }) => held.some((placement) => repositoryFor([listing], (entry) => entry.repository, gitOrigin, placement.id, placement.url) !== undefined));
    if (holder) throw new CoreError("invalid_request", heldByAnother(listing.repository.path, holder.name));
  }

  /**
   * An Attach's add (space-99): beside the clone's placements as a
   * Place's join adds one (placeAdd), the notice seen recorded for it and
   * its first Compare owing a join (space-13); or, for a clone holding no
   * placement with an instance, as a pick's join does (adopt): its first
   * placement, ending every creation it waited for, and a clone under
   * your own group's folder moving under that instance's folder at the
   * repository's path there, its built-in spec package's lock taking
   * that instance's registry (storage-35, environments-11). Written only
   * while the clone's remotes still read `expected`, else refused
   * `conflict` (space-21).
   */
  private async attachAdd(instance: HostInstance, machine: RepositorySync, listing: HostListing, placements: readonly Placement[], expected: string): Promise<void> {
    if (keyPlacement(placements) !== undefined) {
      this.placeAdd(instance, machine, listing, { join: true, noticed: true, expected });
      return;
    }
    const { repository } = listing;
    instance.changedAfter = instance.readsBegun;
    instance.targets.delete(machine);
    instance.attached.set(repository.id, listing);
    try { await machine.attachHost(repository.remoteUrl, repository.id, expected, false, instance.folder()); }
    catch (error) {
      instance.attached.delete(repository.id);
      throw error;
    }
    const name = machine.facts.remoteName ?? placementName(instance.folder());
    try { this.host.store.setPlacementPref(machine.key, name, "noticed", true, true); }
    catch (error) { console.error(`spex: the notice seen for ${machine.key} at ${instance.origin} is not recorded: ${error instanceof Error ? error.message : String(error)}`); }
    this.endWaiting(machine.key);
    machine.oweJoin(name);
    const picked = this.localOnly(machine.key);
    try { await this.moveAtPick(instance, machine, repository); }
    catch (error) { console.error(`spex: ${machine.key} stays where it lies until its next sync: ${error instanceof Error ? error.message : String(error)}`); }
    if (picked) this.host.environmentPlaced?.(machine.key);
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
    // it records beside the remote of any placement it holds under that
    // instance's Git origin, or that remote (git-host-5), so another Git
    // system's same id is another repository; your own group's own
    // repository, recording no id yet, is the one your namespace at its
    // instance lists under its name (space-4). Otherwise a clone whose
    // placement file names it holds it as a placement not on this
    // device, to attach on its row (space-87).
    const own = store.home.own();
    const clones = await Promise.all(store.listRepositories().map(async (repository) => {
      try {
        const machine = this.machine(repository.key);
        const facts = await machine.readFacts();
        return { name: splitKey(repository.key).name, facts, held: machine.placements, files: machine.namedByFiles(machine.placements), ownAt: repository.key === own ? this.servingOf(machine) : undefined };
      } catch { return { name: splitKey(repository.key).name, facts: { remote: null, id: null }, held: [], files: [], ownAt: undefined }; }
    }));
    const here = clones.some(({ facts, held, ownAt }) => held.some((placement) => listingFor(view, placement.id, placement.url)?.repository.id === hostId)
      || (ownAt === instance && facts.id === null && this.ownNamespaceListing(view)?.repository.id === hostId));
    if (here || store.repository(key) || existsSync(store.home.clonePath(key)) || store.deferredMoves().some((move) => move.to === key)) {
      throw new CoreError("invalid_request", i18n._({ id: "{name} is on this device already", values: { name: listing.repository.path }, comment: "Refusal of a join: the spex repository has a clone here" }));
    }
    const filed = clones.find(({ files }) => files.some((file) => file.id === hostId && (this.fileNamesAt(file, instance, view.gitOrigin) || this.fileNamesAt(file, at, atView.gitOrigin))));
    if (filed) {
      throw new CoreError("invalid_request", i18n._({ id: "{name} is a placement of {repository} not on this device yet", values: { name: listing.repository.path, repository: filed.name }, comment: "Refusal of a join: a placement file of the spex repository {repository}, on this device, names the spex repository {name} listed at an instance; it stands as a line of {repository}'s row, to attach there, not as a repository of its own" }));
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
      // The remote is named by the folder of the instance it is joined
      // at (storage-34).
      const name = placementName(instance.folder());
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
      // The host's id in that remote's own section (storage-34).
      await this.probe.run(["-C", dir, "config", placementIdKey(name), id]);
      // Publication: the place checked absent and the stage renamed there
      // in one synchronous step; a place taken meanwhile — another join's
      // clone — is left as it stands, and a failed rename leaves no folder.
      if (existsSync(dest)) {
        stop({ cause: "git", message: i18n._({ id: "{name} is on this device already", values: { name: listing.repository.path }, comment: "Refusal of a join: the spex repository has a clone here" }), guidance: nothingDeleted(), retry: false });
        return;
      }
      renameSync(dir, dest);
      // The join names its placement in a tracked file: the bytes every
      // device holding it writes, the clone's own where one pushed it
      // (storage-36).
      try { writePlacementFile(dest, instance.origin, id); }
      catch (error) { console.error(`spex: the placement file of ${key} at ${instance.origin} is not written: ${error instanceof Error ? error.message : String(error)}`); }
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
   * the credential a signed-in instance of one of its placements brokers
   * only where that remote lies under that instance's Git origin, and
   * none of the app's at any other, one under the Git origin of an
   * instance no placement is at included (projects-37, codeBroker) — or
   * a folder already holding it, paired with the clone; a group's own
   * spex repository pairs the folder its sessions run in. The join's
   * Code step runs while the code clones (space-63), shown through
   * `step`; a failure comes back as the row's stopped state, the host's
   * failure classified at the brokering instance's Git origin and Git's
   * words at any other, with no URL under any instance's Git origin. */
  private async pairJoined(machine: RepositorySync, folder: string, step: (phase: SpaceSyncPhase) => void): Promise<SpaceSyncPhase | undefined> {
    const project = this.projectFile(machine.repository);
    const root = existsSync(folder) && await this.workTreeRoot(folder);
    const remote = !root && project?.remote ? project.remote : undefined;
    const at: SyncStep = remote ? "code" : "check";
    step({ phase: "running", op: "join", step: at, since: Date.now(), cancelable: false });
    await this.publish();
    // An instance of one of the project's placements, never one chosen
    // by the code's Git origin alone (projects-37).
    const instance = remote ? this.codeBroker(machine, remote) : undefined;
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

  /** The instance whose broker a project's code clone asks (projects-37):
   * among the instances of its spex repository's placements — the
   * project's own (storage-31) first, then each its clone holds in their
   * order (storage-34), then each its placement files name (storage-36),
   * an instance the home lists — the first signed in whose reported Git
   * origin the code's remote lies under (git-host-5); else the project's
   * own, whose broker names no helper for a remote outside its Git
   * origin and, signed out, stops one under it as a sign-in to make
   * again (credentialFor); undefined for a clone at no instance. No
   * other instance is asked, whatever Git origin it reports. */
  private codeBroker(machine: RepositorySync, remote: string): HostInstance | undefined {
    const own = this.instanceOfClone(machine);
    const home = this.host.store.home;
    const origins = [
      ...machine.placementsNow().flatMap((placement) => placement.instance === null ? [] : [placement.instance]),
      ...readPlacementFiles(machine.repository.dir).files.map((file) => file.origin),
    ];
    const placed = origins.filter((origin) => home.instance(origin) !== undefined).map((origin) => this.instanceAt(origin));
    const brokers = own ? [own, ...placed] : placed;
    return brokers.find((instance) => this.signedInAt(instance) && underOrigin(remote, instance.knownOrigin())) ?? own;
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

  /** The members of a spex repository's placement — the one at the
   * instance the command names, its key placement where none is named —
   * by the repository's key, or of a group by its host id, as the
   * instance governing that placement, or listing that group, reports
   * them (space-62, git-host-8), read on each ask and held nowhere. */
  async members(input: { instance?: string; repository?: string; group?: string }): Promise<{ members: HostMember[] }> {
    const { instance, placement } = await this.commandTarget(input);
    const target = await this.membersTarget(instance, input, "invalid_request", placement);
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

  /** Move a spex repository's placement, by its key and the placement's
   * instance — its first where none is named — into a group of the
   * instance governing that placement or, where none is named, your
   * namespace there (git-host-20) — a group of another instance found in
   * none, refused before the host is asked — holding it as the host
   * answered until a read begun after the move is held (git-host-5),
   * announced before the reply; its clone moves on its next sync where
   * it is the key placement's (space-60). */
  async moveRepository(key: string, groupId: string | null, named?: string): Promise<{ repository: { id: string; fullPath: string } }> {
    const { instance, placement } = await this.commandTarget({ repository: key, ...(named !== undefined ? { instance: named } : {}) });
    const target = await this.membersTarget(instance, { repository: key }, "invalid_request", placement);
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
        // The host repository's own name there: a placement beside the
        // key placement may bear another than the key's (git-host-20).
        const name = (placement && this.listingOf(instance, { remote: placement.url, id: placement.id })?.repository.path) ?? splitKey(key).name;
        throw new CoreError("invalid_request", takenIn(name, into?.fullPath ?? userGroup(instance.view)?.fullPath ?? this.host.store.home.ownName));
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

  /** Add the account of a login to a group, or to a spex repository's
   * placement the command names, at one of the roles of the instance it
   * acts at, and list the members that instance holds afterwards
   * (git-host-16). `role` is a role's id from that instance's view. */
  async share(input: { instance?: string; repository?: string; group?: string; login: string; role: string }): Promise<{ members: HostMember[] }> {
    const { instance, placement } = await this.commandTarget(input);
    const login = input.login.trim();
    if (login.length === 0) throw new CoreError("invalid_request", nameTheLogin(this.nameOf(instance)));
    // A role that instance grants (git-host-16).
    const roles = this.viewOf(instance)?.roles ?? [];
    if (!roles.some((role) => role.id === input.role)) throw new CoreError("invalid_request", notARole(input.role, this.nameOf(instance)));
    const target = await this.membersTarget(instance, input, "not_found", placement);
    try {
      await instance.client.addMember(target, { login, role: input.role });
    } catch (error) {
      throw this.hostWriteRefusal(instance, error);
    }
    return this.listMembers(instance, target);
  }

  /** Remove the account of a login from a group's own members, or from
   * those of a spex repository's placement the command names, and list
   * the members the instance it acts at holds afterwards (git-host-17). */
  async unshare(input: { instance?: string; repository?: string; group?: string; login: string }): Promise<{ members: HostMember[] }> {
    const { instance, placement } = await this.commandTarget(input);
    const login = input.login.trim();
    if (login.length === 0) throw new CoreError("invalid_request", nameTheLogin(this.nameOf(instance)));
    const target = await this.membersTarget(instance, input, "not_found", placement);
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
   * What a members, share, unshare or move command acts on (space-29):
   * the instance it acts at, signed in there, and the placement it names
   * where that is not the key placement.
   * - A group: the instance the command names with it, which the
   *   protocol requires.
   * - A spex repository on this device: its placement at the instance
   *   the command names — its key placement, which its row reads, where
   *   none is named — at the instance governing that placement
   *   (git-host-5): its own while signed in, else the earliest signed-in
   *   one listing its host repository, but none at which the clone holds
   *   another placement. An instance at which the clone holds no
   *   placement is refused; a clone holding none reads as local only
   *   (membersTarget).
   * - One not on this device: its one listed placement, at the instance
   *   its key lies under, where its row stands.
   * A command names exactly one group or one spex repository, and an
   * instance it names the home lists.
   */
  private async commandTarget(input: { instance?: string; repository?: string; group?: string }): Promise<{ instance: HostInstance; placement?: Placement }> {
    if ((input.group === undefined) === (input.repository === undefined)) throw new CoreError("invalid_request", nameOneTarget());
    const named = input.instance === undefined ? undefined : canonicalOrigin(this.namedInstance(input.instance));
    let instance: HostInstance;
    let placement: Placement | undefined;
    if (input.repository === undefined) {
      if (named === undefined) throw new CoreError("invalid_request", nameOneTarget());
      instance = this.instanceAt(named);
    } else if (this.host.store.repository(input.repository)) {
      const machine = this.machine(input.repository);
      await machine.readFacts();
      const placements = machine.placements;
      const at = named === undefined ? undefined : placements.find((candidate) => candidate.instance !== null && canonicalOrigin(candidate.instance) === named);
      if (named !== undefined && at === undefined && placements.length > 0) throw new CoreError("invalid_request", noSuchPlacement(splitKey(input.repository).name));
      if (at !== undefined && at !== keyPlacement(placements)) {
        const governing = this.governingOfPlacement(machine, at);
        if (!governing) throw new CoreError("invalid_request", signInFirst());
        instance = governing;
        placement = at;
      } else instance = this.rowInstance(machine) ?? this.servingOf(machine);
    } else {
      instance = this.instanceOfKey(input.repository) ?? this.defaultInstance();
      if (named !== undefined && instance.origin !== named) throw new CoreError("invalid_request", noSuchPlacement(splitKey(input.repository).name));
    }
    if (!this.signedInAt(instance)) throw new CoreError("invalid_request", signInFirst());
    return { instance, placement };
  }

  /**
   * The host's id of the group or spex repository a command names, as
   * the current view of the instance it acts at lists it (git-host-8,
   * git-host-16, git-host-17, git-host-20): a group by its host id; a
   * repository by its key — its key placement's listing, or `placement`'s
   * where the command names one beside it (commandTarget), or, before
   * any read of that instance is held, the id its remote records — or
   * the instance's listing under that key where this device lacks it. A
   * clone on this device alone is refused `localOnly`; a place the view
   * does not list `not_found`, the host not asked.
   */
  private async membersTarget(instance: HostInstance, input: { repository?: string; group?: string }, localOnly: "invalid_request" | "not_found", placement?: Placement): Promise<MembersTarget> {
    const view = instance.view;
    if (input.group !== undefined) {
      const group = input.group;
      if (!this.listedGroups(instance, view).some((entry) => entry.id === group)) throw new CoreError("not_found", groupNotListed(group, this.nameOf(instance)));
      return { kind: "group", id: group };
    }
    const key = input.repository as string;
    if (placement) {
      // A placement beside the key placement, as the instance governing
      // it lists it (git-host-5).
      const listing = this.listingOf(instance, { remote: placement.url, id: placement.id });
      const id = listing?.repository.id ?? (view ? null : placement.id);
      if (id === null) throw new CoreError("not_found", noLongerShared());
      return { kind: "repository", id };
    }
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

  /** The admission of space-11 the instances decide, placement by
   * placement, a sync refused only where no placement could run:
   * - a placement can run where its instance is signed in — the first,
   *   for a sync, also where a signed-in instance lists the host
   *   repository it records, which the sync then follows (space-60) —
   *   and the path placement always; a Check host (`push` false) follows
   *   no other instance (git-host-9); none able to run is refused naming
   *   the first placement's instance;
   * - a sync the reader asks reads afresh, at the instance governing
   *   each placement, only the placements whose notice may be owed —
   *   never pushed from this device, its notice never seen — and one
   *   whose notice is owed, or whose read fails, stops alone at its turn,
   *   no step run there, a sync refused with the first such refusal where
   *   every placement able to run is so stopped (space-57, git-host-22);
   * - a sync the core starts itself reads nothing here, each placement's
   *   notice rechecked at its Check.
   * What admission stopped comes back by each placement's remote's name. */
  async admit(machine: RepositorySync, input: { push: boolean; internal?: boolean }): Promise<Map<string, PlacementAdmission>> {
    const admitted = new Map<string, PlacementAdmission>();
    const facts = machine.facts;
    const serving = this.servingOf(machine);
    const placements = machine.placements;
    // Each placement able to run, with the instance whose read its notice
    // takes — none for one at no instance, which owes none (space-5).
    const runnable: { name: string; origin: string | null; later: boolean; at?: HostInstance; facts: CloneFacts }[] = [];
    const firstAt = this.syncsWith(machine, input.push);
    const firstName = facts.remoteName ?? placements[0]?.name ?? "";
    const firstOrigin = placements[0]?.instance ?? null;
    if (!this.atHost(facts, firstAt ?? serving)) runnable.push({ name: firstName, origin: firstOrigin, later: false, facts });
    else if (firstAt) runnable.push({ name: firstName, origin: firstOrigin, later: false, at: firstAt, facts });
    for (const placement of placements.slice(1)) {
      const facts: CloneFacts = { remote: placement.url, id: placement.id, remoteName: placement.name };
      if (placement.instance === null) { runnable.push({ name: placement.name, origin: null, later: true, facts }); continue; }
      // Its own instance signed in, or a signed-in one its sync follows
      // there (space-60), whose read its notice takes.
      const at = input.push ? this.governingOfPlacement(machine, placement) : this.signedInAt(this.instanceAt(placement.instance)) ? this.instanceAt(placement.instance) : undefined;
      if (at) runnable.push({ name: placement.name, origin: placement.instance, later: true, at, facts });
    }
    if (runnable.length === 0) throw new CoreError("invalid_request", signInTo(this.nameOf(serving)));
    if (!input.push || input.internal) return admitted;
    const own = machine.key === this.host.store.home.own();
    let refusal: CoreError | undefined;
    let open = 0;
    for (const entry of runnable) {
      if (!entry.at || this.noticeSeen(machine, entry.name)) { open += 1; continue; }
      let listing: HostListing | undefined;
      try { listing = (await this.readTarget(entry.at, machine, entry.facts)).listing; }
      catch (error) {
        const name = this.nameOf(entry.at);
        refusal ??= new CoreError(error instanceof CredentialChanged ? "conflict" : "invalid_request", relayHostError(error, name));
        // Stopped alone, as unreachable, in the words of what failed
        // (git-host-22).
        admitted.set(entry.name, { kind: "stopped", stop: new SpaceStopped("check", { ...hostStop("check", error, name).failure, cause: "unreachable" }, false) });
        continue;
      }
      const notice = this.sharingNotice(machine, entry.name, entry.origin, listing, own && entry.later);
      if (notice) {
        refusal ??= notice;
        admitted.set(entry.name, { kind: "waiting", stop: new NoticeOwed(notice.message) });
        continue;
      }
      open += 1;
    }
    if (open === 0 && refusal) throw refusal;
    return admitted;
  }

  /** Whether a placement of a clone, by its remote's name, owes no
   * notice for its pushes on this device's record (space-57, storage-5):
   * its notice seen, or a sync with it recorded. */
  private noticeSeen(machine: RepositorySync, name: string | null): boolean {
    return machine.noticedOf(name) || machine.placementRecord(name, "last") !== undefined;
  }

  /** The same first-push condition at admission and at fresh Check, for
   * one placement, by its remote's name and its instance's origin
   * (space-57): never pushed from this device and its notice never seen,
   * and its repository there, which takes pushes, with other members —
   * an unknown count among them — or your own group's own repository at
   * an instance other than its first placement's (`ownLater`). */
  private sharingNotice(machine: RepositorySync, name: string | null, origin: string | null, listing: HostListing | undefined, ownLater: boolean): CoreError | undefined {
    if (this.noticeSeen(machine, name)) return undefined;
    if (!listing || listing.readOnly || (!ownLater && !mayHaveOthers(listing))) return undefined;
    return new CoreError("invalid_request", i18n._({
      id: "Read the sharing notice before the first sync of {name}",
      values: { name: splitKey(machine.key).name },
      comment: "Refusal of a first push into a spex repository with other members until the reader has seen the privacy notice",
    }), { notice: true, members: listing.members, visibility: listing.repository.visibility, placement: origin });
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
   * (space-60). On a sync, the first placement's notice owed by that
   * fresh read ends its turn waiting before any branch or transport
   * effect (space-57, git-host-22). The instance it answered at comes
   * back with the URL; undefined for a clone whose remote is not at an
   * instance. */
  async hostCheck(machine: RepositorySync, op: SpaceOp): Promise<{ remote: string; readOnly: boolean; instance: HostInstance } | undefined> {
    // A sync, or a Place's sync (space-31), pushes and follows; a Check
    // host follows nothing (git-host-9).
    const syncs = op !== "check";
    if (syncs) await this.moveDeferred(machine);
    const facts = await machine.readFacts();
    const serving = this.servingOf(machine);
    const instance = this.syncsWith(machine, syncs);
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
    if (syncs) {
      const notice = this.sharingNotice(machine, facts.remoteName, this.placementOf(machine), listing, false);
      if (notice) throw new NoticeOwed(notice.message);
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
    if (syncs && machine.key !== this.host.store.home.own()) {
      if (key && key !== machine.key) await this.moveInSync(instance, machine, key, repository.id, facts, target.accountGeneration);
      // A path that cannot stand as folders here leaves no place to
      // follow it to: no transport goes through another instance.
      else if (follows) throw new SpaceStopped("check", { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
      // A follow or a deferred move half made — the clone under this
      // instance's folder, its remote's rename not made — is made now.
      else if (key === machine.key && facts.remoteName !== instance.folder()) this.followByRemote(instance, machine, repository.id, facts, target.accountGeneration);
    } else if (follows) this.followByRemote(instance, machine, repository.id, facts, target.accountGeneration);
    try { this.assertTargetAccount(instance, target.accountGeneration); }
    catch (error) { throw hostStop("check", error, host()); }
    if (facts.remote !== null && facts.remote !== repository.remoteUrl) machine.setOrigin(repository.remoteUrl, facts.remote);
    const readOnly = listing.readOnly !== null;
    await this.prepareBranch(machine, instance, listing, machine.remoteNameNow());
    return { remote: repository.remoteUrl, readOnly, instance };
  }

  /**
   * A placement's branch prepared at the instance its Check read before
   * its first push (git-host-7), `name` its remote's name as that Check
   * left it, `placement` the placement where it is not the clone's first.
   * The core's creation the clone records in that remote's section, read
   * as its other facts are, is spent by this check once done with the
   * default branch — found or pushed; a check stopping before then, by
   * the core stopping, the host not answering, the push refused or the
   * empty repository read-only, keeps it, so the next sync, or the next
   * core, owes the branch still. A step the host leaves waiting waits on
   * that placement's line, at that instance (space-64), its placement
   * stopping alone (space-15).
   */
  private async prepareBranch(machine: RepositorySync, instance: HostInstance, listing: HostListing, name: string | null, placement?: Placement): Promise<void> {
    const repository = listing.repository;
    // Its name as each report is made, a read meanwhile naming it.
    const host = (): string => this.nameOf(instance);
    const readOnly = listing.readOnly !== null;
    const recorded = machine.createdOf(name);
    const created = recorded === repository.id;
    // A creation recorded for another repository is stale.
    if (recorded !== null && !created) machine.forgetCreatedOf(name);
    if (!readOnly && !listing.branchPresent) {
      // `spex` beside the default branch, never as it (git-host-7).
      const group = repository.group.fullPath;
      if (repository.empty && !(created && await this.defaultBranchArrives(machine, instance, repository.id))) {
        if (!created || this.stopping) {
          this.setWaiting(machine.key, { instance: instance.origin, step: "branch", group, message: "" });
          throw new SpaceStopped("check", { cause: "refused", message: i18n._({ id: "{host} holds no default branch for it yet", values: { host: host() }, comment: "A stopped sync: the host's repository is empty, so spex waits for its default branch; {host} is its display name" }), guidance: syncLater(), retry: true });
        }
        // Still empty: the host never committed its README — a protected
        // default branch refusing a Developer's initial commit, say — so
        // the core pushes that branch itself, and goes on as if the host
        // had (git-host-7).
        await machine.pushDefaultBranch(repository.remoteUrl, repository.name, instance, placement);
      }
      if (created) machine.forgetCreatedOf(name);
      let answer: Awaited<ReturnType<GitHostClient["prepareBranch"]>>;
      try { answer = await machine.hostCall("check", (signal) => instance.client.prepareBranch(repository.id, { signal })); }
      catch (error) { throw hostStop("check", error, host()); }
      if (answer.status === "pending") {
        this.setWaiting(machine.key, { instance: instance.origin, step: "branch", group, message: answer.message });
        throw new SpaceStopped("check", { cause: "refused", message: waitingPhrase("branch", group, answer.message), guidance: syncLater(), retry: true });
      }
      const waiting = this.waitingAt(machine.key, instance.origin);
      if (waiting?.step === "branch") this.endWaiting(machine.key, instance.origin, waiting);
    } else if (created && !repository.empty) machine.forgetCreatedOf(name);
  }

  /** The Check step's read of the host for a placement of a clone beside
   * its first (space-8, space-12, git-host-22): the fresh catalog of the
   * instance governing it and its repository there alone — its own
   * instance's while signed in there; while that is signed out, on a
   * sync, another signed-in instance's that lists its host repository
   * and at which the clone holds no other placement, a check following
   * nothing (git-host-9); a repository the read lists no more, or one in
   * a group named like a login, stops that placement unreachable
   * (space-15, space-61); on a sync, its notice owed by that fresh read
   * ends its turn waiting before any transport (space-57, git-host-22).
   * Then, on a sync, before any fetch or push, the placement follows the
   * instance that read it — its remote renamed to that instance's folder,
   * its file rewritten, the clone moved nowhere — and takes the URL that
   * instance hands over after a rename or a transfer there, its path
   * alone changing (space-60), and a missing id is recorded (git-host-5),
   * each in one step only while it still reads as the check read it
   * (space-21). The instance comes back with the URL, and the placement
   * as it then stands; undefined for the path placement, fetched with no
   * read. */
  async hostCheckPlacement(machine: RepositorySync, placement: Placement, op: SpaceOp): Promise<{ remote: string; readOnly: boolean; instance: HostInstance; placement: Placement } | undefined> {
    if (placement.instance === null) return undefined;
    const own = this.instanceAt(placement.instance);
    const instance = this.signedInAt(own) ? own : op !== "check" ? this.governingOfPlacement(machine, placement) : undefined;
    if (!instance) throw new SpaceStopped("check", { cause: "reauth", message: signInAgain(), guidance: signInThenRetry(), retry: true });
    // Its turn's calls go to the instance read — through its credential's
    // fetch too — held by that instance's rate limit alone, its Stop and
    // the hold's name that instance's (git-host-21, space-16).
    machine.turnAt = instance.origin;
    const facts: CloneFacts = { remote: placement.url, id: placement.id, remoteName: placement.name };
    let target: TargetReading;
    try {
      target = await machine.hostCall("check", () => this.readTarget(instance, machine, facts));
      this.assertTargetAccount(instance, target.accountGeneration);
    }
    catch (error) { throw hostStop("check", error, this.nameOf(instance)); }
    const { listing, catalog } = target;
    if (!listing) {
      machine.setOverride(placement.name, { state: "unreachable", reason: noLongerShared() });
      throw new SpaceStopped("check", { cause: "gone", message: noLongerShared(), guidance: nothingDeleted(), retry: true });
    }
    if (this.collides(listing.repository.group, catalog)) {
      machine.setOverride(placement.name, { state: "unreachable", reason: namedLikeYourLogin() });
      throw new SpaceStopped("check", { cause: "gone", message: groupNamedLikeYourLogin(listing.repository.group.fullPath), guidance: nothingDeleted(), retry: true });
    }
    if (op === "check") return { remote: placement.url, readOnly: listing.readOnly !== null, instance, placement };
    // Your own group's own repository owes it at every instance after
    // its first placement's (space-57, space-4).
    const notice = this.sharingNotice(machine, placement.name, placement.instance, listing, machine.key === this.host.store.home.own());
    if (notice) throw new NoticeOwed(notice.message);
    const changed = (): SpaceStopped => new SpaceStopped("check", { cause: "git", message: changedMeanwhile(splitKey(machine.key).name), guidance: retryGuidance(), retry: true }, false);
    let held = placement;
    if (instance !== own) {
      // Nothing is awaited from the account's check to the rename.
      try { this.assertTargetAccount(instance, target.accountGeneration); }
      catch (error) { throw hostStop("check", error, this.nameOf(instance)); }
      const folder = instance.folder();
      const followed = folder === null ? undefined : machine.followRemote(held, folder);
      if (!followed) throw changed();
      held = followed;
    }
    const repository = listing.repository;
    if (held.id === null) held = machine.recordPlacementId(held, repository.id);
    if (held.url !== repository.remoteUrl) {
      const renamed = machine.setPlacementUrl(held, repository.remoteUrl);
      if (!renamed) throw changed();
      held = renamed;
    }
    // Its branch prepared before its first push there, as the first
    // placement's is (git-host-7, space-12).
    await this.prepareBranch(machine, instance, listing, held.name, held);
    return { remote: repository.remoteUrl, readOnly: listing.readOnly !== null, instance, placement: held };
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
   * to its Git origin (git-host-9) — a clone's instance's, the one it is
   * joined at, or the one of a placement a project's code clone asks
   * (codeBroker) — never another's chosen by the Git origin alone; none
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
   * reads the remotes the check read before asking the host — `facts` —
   * and records the host's id, the check's own recording of it included,
   * and still lies where the home says (renameClone). In the same step,
   * its remote takes the name of the folder it now lies under: one still
   * named `origin`, or one named by the instance it followed from
   * (space-60). */
  private async moveInSync(instance: HostInstance, machine: RepositorySync, to: string, id: string, facts: CloneFacts, accountGeneration: number): Promise<void> {
    const store = this.host.store;
    const from = machine.key;
    const source = machine.repository.dir;
    const identity = await this.machineIdentity();
    // Nothing is awaited from here to the rename.
    try { this.assertTargetAccount(instance, accountGeneration); }
    catch (error) { throw hostStop("check", error, this.nameOf(instance)); }
    if (!machine.recordsNow(facts.remote, id, facts.remotes)) throw movedMeanwhile(from);
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
   * still reads the remotes the check read before asking the host —
   * `facts` — and records the host's id; its fetched `spex`, its
   * upstream and this device's last sync stay with it (space-5). */
  private followByRemote(instance: HostInstance, machine: RepositorySync, id: string, facts: CloneFacts, accountGeneration: number): void {
    try { this.assertTargetAccount(instance, accountGeneration); }
    catch (error) { throw hostStop("check", error, this.nameOf(instance)); }
    if (!machine.recordsNow(facts.remote, id, facts.remotes) || this.syncsWith(machine, true) !== instance) throw movedMeanwhile(machine.key);
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
    // Its id, at the top level while it is deferred (storage-34).
    const recorded = machine.recordedIdNow();
    this.renameClone(machine, move.to, identity);
    const folder = instanceSegmentOf(move.to);
    if (recorded !== null) {
      // The id moves into its remote's section, which the rename then
      // carries (storage-34).
      machine.adoptLegacyIds(named);
      if (folder !== null) machine.renameRemote(named, folder);
    }
    await this.afterMove([{ from, to: move.to }]);
  }

  // -- placements and their files (space-91, storage-38) ----------------------

  /**
   * Reconcile a clone's placements with its placement files as they
   * stand (space-91, storage-41): after a placement's merge changed them,
   * every placement it holds at an instance; before a placement's turn,
   * that one alone (`only`), a drop or follow a refusal left waiting
   * being tried again there. A placement whose file no longer names its
   * host repository — removed, or changed to name another, where a commit
   * of the clone's `spex` once held that file (storage-37) — follows the
   * instance whose file names that host repository, where that instance
   * is signed in here, lists it and holds no other placement of the
   * clone, its remote renamed and, for the key placement, the clone moved
   * to its path there as a follow moves it (space-60), and is dropped
   * otherwise, the clone's records kept, the first placement moving the
   * clone with its drop (storage-38); a placement with no such file, or
   * whose file does not read as its encoding, is kept. After a merge, two
   * files naming one host repository by the Git origins and ids the core
   * read are one: every such file is deleted but that of the instance the
   * clone holds it under, else of the instance governing it, a local
   * change the next sync carries. A follow or a drop refused — a session's
   * lease beneath, a destination taken, a next placement no read of this
   * run placed — is that placement's stop, waiting for the next sync. What
   * it did to each placement it could not keep, by the name each bore.
   */
  async reconcilePlacements(machine: RepositorySync, only?: string): Promise<Map<string, PlacementFate>> {
    const fates = new Map<string, PlacementFate>();
    // A clone the instances migration deferred moves at its sync's Check
    // first, renaming its remote then (storage-34).
    if (machine.isDeferred()) return fates;
    const names = machine.placementsNow().filter((placement) => placement.instance !== null && (only === undefined || placement.name === only)).map((placement) => placement.name);
    let identity: string | undefined;
    let identityRead = false;
    for (const name of names) {
      const read = machine.placementsNow().find((candidate) => candidate.name === name);
      if (!read?.instance || this.fileNames(machine, read)) continue;
      // A file no commit held is no removal, and a placement whose file
      // was never written drops nothing (storage-37).
      if (!(await machine.placementFileHeld(read.name))) continue;
      if (!identityRead) { identity = await this.machineIdentity(); identityRead = true; }
      // Read again at its step's instant: nothing is awaited from here to
      // its writes.
      const placement = machine.placementsNow().find((candidate) => candidate.name === name);
      if (!placement?.instance || this.fileNames(machine, placement)) continue;
      const follows = this.followedByFile(machine, placement);
      try {
        if (follows) fates.set(name, { kind: "followed", name: await this.followByFile(machine, placement, follows.to, follows.listing, identity) });
        else {
          await this.dropByFile(machine, placement, identity);
          fates.set(name, { kind: "dropped" });
        }
      } catch (error) {
        if (!(error instanceof SpaceStopped)) throw error;
        fates.set(name, { kind: "withheld", stop: error });
      }
    }
    if (only === undefined) this.dedupePlacementFiles(machine);
    return fates;
  }

  /** Whether the clone's placement file under a placement's folder still
   * leaves it standing (space-91, storage-41): naming its host repository,
   * or not reading as its encoding — which drops and offers nothing — or
   * the placement recording no id any file could name. */
  private fileNames(machine: RepositorySync, placement: Placement): boolean {
    if (placement.id === null) return true;
    const { files, problems } = readPlacementFiles(machine.repository.dir);
    if (problems.some((problem) => problem.file === PLACEMENTS_DIR || problem.file === placementFilePath(placement.name))) return true;
    return files.some((file) => file.folder === placement.name && file.id === placement.id);
  }

  /** The instance a placement whose file was removed follows by the
   * clone's files (space-91, space-60): one whose file names the same
   * host repository — that id, its remote under that instance's Git
   * origin, as that instance's listing of it reads (git-host-5) — signed
   * in here, listing it, and holding no other placement of the clone;
   * with that listing. None where its file was changed to name another
   * host repository, which drops it, or where no such instance stands. */
  private followedByFile(machine: RepositorySync, placement: Placement): { to: HostInstance; listing: HostListing } | undefined {
    const facts = { remote: placement.url, id: placement.id };
    const { files } = readPlacementFiles(machine.repository.dir);
    if (files.some((file) => file.folder === placement.name)) return undefined;
    for (const file of files) {
      if (file.folder === placement.name || file.id !== placement.id || !this.host.store.home.instance(file.origin)) continue;
      const to = this.instanceAt(file.origin);
      if (to.folder() === null || !this.signedInAt(to) || this.holdsAt(machine, to, placement.name)) continue;
      const listing = this.listingOf(to, facts);
      if (listing) return { to, listing };
    }
    return undefined;
  }

  /**
   * A placement follows the instance whose file names its host
   * repository (space-91, space-60): one step at its instant, once it
   * still reads as it was read and its clone lies where the home says —
   * the key placement, but your own group's own repository's, moving the
   * clone to its path at that instance as that instance's listing names
   * it (renameClone, whose refusal refuses the follow whole), then its
   * remote renamed to that instance's folder with its file rewritten and
   * this device's records re-keyed (followRemote). The name its remote
   * then bears.
   */
  private async followByFile(machine: RepositorySync, placement: Placement, to: HostInstance, listing: HostListing, identity: string | undefined): Promise<string> {
    const store = this.host.store;
    const from = machine.key;
    const folder = to.folder() as string;
    const moves = from !== store.home.own() && keyPlacement(machine.placementsNow())?.name === placement.name;
    const key = moves ? this.keyAtHost(listing.repository, to) : from;
    if (key === null || store.repository(from)?.dir !== machine.repository.dir || !machine.stillReads(placement)) throw movedMeanwhile(from);
    if (key !== from) this.renameClone(machine, key, identity);
    const followed = machine.followRemote(placement, folder);
    if (!followed) console.error(`spex: the remote of ${machine.key} keeps its name until its next sync`);
    if (key !== from) await this.afterMove([{ from, to: key }]);
    return followed?.name ?? placement.name;
  }

  /**
   * Drop a placement whose file a merge removed, or changed to name
   * another host repository (space-91): one step at its instant, once it
   * still reads as it was read and its clone lies where the home says. A
   * placement after the first, or your own group's own repository's
   * first, is dropped alone; a first placement's drop moves the clone, in
   * the same step, to the path of its next placement with an instance at
   * that instance, as a read of this run placed it, or under your own
   * group's folder where none is left — refused, nothing dropped or
   * moved, while a session's lease beneath holds the clone, where no read
   * of this run placed that next placement, naming its instance, and
   * where the destination is taken, as a sync's move is (storage-38).
   * The move's refusals are read first, then the remote is removed, then
   * the clone moved, nothing awaited between: a removal Git refuses
   * stops the act in Git's words with the clone where it was, its
   * placement standing. A Leave's drop, `leaves`, deletes that
   * placement's file in the same step (space-98), a local change the
   * clone's next sync carries.
   */
  private async dropByFile(machine: RepositorySync, placement: Placement, identity: string | undefined, leaves = false): Promise<void> {
    const store = this.host.store;
    const from = machine.key;
    const placements = machine.placementsNow();
    if (store.repository(from)?.dir !== machine.repository.dir || !machine.stillReads(placement)) throw movedMeanwhile(from);
    // Its file is under its instance's folder, the name its remote bears
    // but for a clone the instances migration deferred (storage-34).
    const folder = placement.instance === null ? placement.name : instanceFolder(placement.instance);
    const deleteFile = (): void => {
      if (!leaves) return;
      try { deletePlacementFile(machine.repository.dir, folder); }
      catch (error) { console.error(`spex: the placement file ${placementFilePath(folder)} of ${machine.key} stays: ${error instanceof Error ? error.message : String(error)}`); }
    };
    if (placements[0]?.name !== placement.name || from === store.home.own()) {
      const refused = machine.dropOrStop(placement);
      if (refused) throw refused;
      deleteFile();
      return;
    }
    const leased = heldSessionLease(machine.repository.dir, identity);
    if (leased !== undefined) throw inUseStop("check", `sessions/${leased}`, store);
    const next = placements.find((candidate) => candidate.name !== placement.name && candidate.instance !== null);
    let to = `${store.home.ownName}/${splitKey(from).name}`;
    if (next?.instance) {
      const at = this.instanceAt(next.instance);
      const listing = this.listingOf(at, { remote: next.url, id: next.id });
      const key = listing ? this.keyAtHost(listing.repository, at) : null;
      if (key === null) throw nextUnread(this.nameOf(at));
      to = key;
    }
    if (to !== from) this.refuseMove(machine, to, identity);
    const refused = machine.dropOrStop(placement);
    if (refused) throw refused;
    if (to !== from) this.renameClone(machine, to, identity);
    deleteFile();
    if (to !== from) await this.afterMove([{ from, to }]);
  }

  /** After a merge, two placement files of a clone naming one host
   * repository, by the Git origins and ids the core read, are one
   * (space-91): every such file deleted but that of the instance the
   * clone holds it under, else that of the instance governing it
   * (git-host-5), a local change the next sync carries; nothing deleted
   * where neither has a file. */
  private dedupePlacementFiles(machine: RepositorySync): void {
    const dir = machine.repository.dir;
    const held = machine.placementsNow();
    const repositories = new Map<string, { gitOrigin: string; files: PlacementFile[] }>();
    for (const file of readPlacementFiles(dir).files) {
      if (!this.host.store.home.instance(file.origin)) continue;
      const gitOrigin = this.instanceAt(file.origin).knownOrigin();
      if (!gitOrigin) continue;
      const key = `${gitOrigin.replace(/\/+$/, "")} ${file.id}`;
      const same = repositories.get(key) ?? { gitOrigin, files: [] };
      same.files.push(file);
      repositories.set(key, same);
    }
    for (const { gitOrigin, files } of repositories.values()) {
      if (files.length < 2) continue;
      const id = files[0].id;
      let kept = files.find((file) => held.some((placement) => placement.name === file.folder && placement.id === file.id));
      if (!kept) {
        const governing = this.listedInstances().find((instance) => this.signedInAt(instance) && sameOrigin(instance.knownOrigin(), gitOrigin)
          && (instance.view?.listings.some((listing) => listing.repository.id === id) === true || instance.attached.has(id)));
        kept = governing ? files.find((file) => canonicalOrigin(file.origin) === governing.origin) : undefined;
      }
      if (!kept) continue;
      for (const file of files) {
        if (file === kept) continue;
        try { deletePlacementFile(dir, file.folder); }
        catch (error) { console.error(`spex: the placement file ${placementFilePath(file.folder)} of ${machine.key} stays: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
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
    this.refuseMove(machine, to, identity);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    renameSync(source, target);
    pruneEmptyFolders(dirname(source), store.home.workspace);
    this.relocate([{ from, to }]);
  }

  /** What refuses a clone's move to `to` (renameClone), thrown as its
   * Check's stop before anything is written: a session's lease beneath
   * it, or a destination taken by anything but the clone itself
   * (space-60, storage-38). */
  private refuseMove(machine: RepositorySync, to: string, identity: string | undefined): void {
    const store = this.host.store;
    const from = machine.key;
    const held = heldSessionLease(machine.repository.dir, identity);
    if (held !== undefined) throw inUseStop("check", `sessions/${held}`, store);
    const taken = this.destinationTaken(from, to);
    if (taken === "disk") {
      throw new SpaceStopped("check", {
        cause: "git",
        message: i18n._({ id: "{path} already exists, so the clone cannot follow the host there", values: { path: `workspace/${to}` }, comment: "A stopped sync: the folder a renamed spex repository moves to is taken" }),
        guidance: i18n._({ id: "Move that folder aside, then Retry.", comment: "Guidance where a renamed spex repository's new folder is taken" }),
        retry: true,
      }, false);
    }
    if (taken !== undefined) {
      throw new SpaceStopped("check", {
        cause: "git",
        message: i18n._({ id: "{path} waits for {other}, so the clone cannot follow the host there", values: { path: `workspace/${to}`, other: taken.waiting },
          comment: "A stopped sync: the folder a renamed spex repository moves to is where another clone, {other}, which the instances migration left at its former place, moves at its own next sync" }),
        guidance: i18n._({ id: "Sync {other} first, then Retry.", values: { other: taken.waiting }, comment: "Guidance where a renamed spex repository's new folder is another clone's destination" }),
        retry: true,
      }, false);
    }
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
      const waits = this.waiting.get(from);
      if (waits) {
        this.waiting.delete(from);
        this.waiting.set(to, waits);
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
    const reads: { placed: Placed; read: MachineRead }[] = [];
    for (const repository of store.listRepositories()) {
      // A clone that moved while this read waited is read under its
      // new key, and its old one names nothing (space-59, space-60).
      if (!store.repository(repository.key)) continue;
      const machine = this.machine(repository.key);
      // Every row is read from its clone at this instant (space-61).
      const read = await machine.state(recompute);
      if (this.host.store.repository(repository.key)?.dir !== machine.repository.dir) continue;
      reads.push({ placed: this.overlay(machine, read), read });
    }
    for (const key of [...this.machines.keys()]) if (!store.repository(key)) this.machines.delete(key);
    // Every clone here now, as read above, or, moved while the read
    // waited, as its machine last read it.
    const byKey = new Map(reads.map(({ placed, read }) => [placed.row.key, read]));
    const clones = store.listRepositories().flatMap((repository) => {
      const read = byKey.get(repository.key);
      if (read) return [{ key: repository.key, held: read.held, files: read.files }];
      const machine = this.machines.get(repository.key);
      return machine ? [{ key: repository.key, held: machine.placements, files: machine.namedByFiles(machine.placements) }] : [];
    });
    // A placement its files name is a line of its clone's row only where
    // no remote here holds it (space-87), every clone read first.
    const held = clones.flatMap((clone) => clone.held);
    const repositories = reads.map(({ placed, read }) => this.withFiled(placed, read.files, held));
    repositories.push(...this.absentRows(clones));
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
        entry = { id: null, login, mine: sameLogin(login, heading.login), fullPath: login, name: login, can: noCan(), placed: [], repositories: [] };
        heading.entries.push(entry);
        heading.logins.set(login.toLowerCase(), entry);
      }
      return entry;
    };
    const unlisted = (heading: Heading, path: string): InstanceGroupState => {
      let entry = heading.byPath.get(path);
      if (!entry) {
        entry = { id: null, login: null, mine: false, fullPath: path, name: path.split("/").pop() ?? path, can: noCan(), placed: [], repositories: [] };
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
        const entry: InstanceGroupState = { id: group.id, login: null, mine: false, fullPath: group.fullPath, name: group.name, can: { createSubgroup: can.createSubgroup, manageMembers: can.manageMembers, rename: can.rename, delete: can.delete }, placed: [], repositories: [] };
        heading.entries.push(entry);
        if (group.id !== null) heading.byId.set(group.id, entry);
        if (!heading.byPath.has(group.fullPath)) heading.byPath.set(group.fullPath, entry);
      }
    }
    // The entry a listed group stands as under its instance's heading.
    const entryOf = (heading: Heading, group: HostGroup): InstanceGroupState => group.kind === "user"
      ? namespace(heading, group.fullPath)
      : (group.id !== null && heading.byId.get(group.id)?.fullPath === group.fullPath ? heading.byId.get(group.id)! : unlisted(heading, group.fullPath));
    const own: RepositoryState[] = [];
    // The rows a read lists first, so every login's entry stands before
    // a row no read lists falls back to its key.
    for (const { row, group, instance } of placed) {
      if (!group) continue;
      const heading = instance === undefined ? undefined : headings.get(instance);
      if (row.own || !heading) { own.push(row); continue; }
      entryOf(heading, group).repositories.push(row);
    }
    for (const { row, group } of placed) {
      if (group) continue;
      const heading = row.instance === null ? undefined : headings.get(row.instance);
      const { instance: folder, group: path } = splitKey(row.key);
      if (row.own || !heading || (folder === null && path === ownName)) { own.push(row); continue; }
      const entry = heading.logins.get(path.toLowerCase()) ?? (sameLogin(path, heading.login) ? namespace(heading, path) : unlisted(heading, path));
      entry.repositories.push(row);
    }
    // Every other group the listing of one of a row's placements names
    // shows one line naming the row, once, with no control (space-1,
    // DR-128): none where the row itself stands.
    for (const { row, elsewhere } of placed) {
      for (const at of elsewhere ?? []) {
        const heading = headings.get(at.instance);
        if (!heading) continue;
        const entry = entryOf(heading, at.group);
        if (entry.repositories.includes(row) || entry.placed.some((line) => line.key === row.key)) continue;
        entry.placed.push({ key: row.key, name: row.name });
      }
    }
    const groupsOwn = (entry: InstanceGroupState, row: RepositoryState): boolean => row.name === `${entry.fullPath.split("/").pop()}-spex`;
    own.sort((a, b) => Number(b.own) - Number(a.own) || a.key.localeCompare(b.key));
    const groups = new Map<string, InstanceGroupState[]>();
    for (const [origin, heading] of headings) {
      for (const entry of heading.entries) {
        entry.repositories.sort((a, b) => Number(groupsOwn(entry, b)) - Number(groupsOwn(entry, a)) || a.key.localeCompare(b.key));
        entry.placed.sort((a, b) => a.key.localeCompare(b.key));
      }
      groups.set(origin, heading.entries.sort((a, b) => a.fullPath.localeCompare(b.fullPath)));
    }
    return { own, groups };
  }

  /** A clone's state as the last answer of the instance governing each
   * of its placements (git-host-5) and this device's files make it
   * (space-61), with the group the instance governing its key placement
   * last named for it, where it lists it, and that instance, whose
   * heading it stands under (space-1); every other instance listing it
   * changes nothing of where it stands. The row reads reachable where any
   * placement it holds does, read-only where none does and one is, and
   * unreachable where every one is. */
  private overlay(machine: RepositorySync, read: MachineRead): Placed {
    const placed = this.overlaid(machine, read.row);
    const lines = this.linesOf(machine, placed.row, read.held);
    // Transitional: the row's wait is its key placement's line's where it
    // holds one, else the first line a wait shows on (space-87).
    const keyLine = lines[0]?.attached && lines[0].instance !== null ? lines[0] : undefined;
    const waiting = keyLine ? keyLine.waiting : lines.find((line) => line.waiting !== null)?.waiting ?? null;
    return { ...placed, row: { ...placed.row, ...this.rowStateOf(placed.row, lines), placements: lines, waiting }, elsewhere: this.elsewhereOf(machine, read.held) };
  }

  /** The groups each placement a clone holds beside its key placement
   * stands in, as the listing of the instance governing it names them
   * (space-1, git-host-5): each shows one line naming the row, which
   * stands under its key placement's (overlaid). */
  private elsewhereOf(machine: RepositorySync, held: Placement[]): { instance: string; group: HostGroup }[] {
    const key = keyPlacement(held);
    return held.flatMap((placement) => {
      if (placement === key || placement.instance === null) return [];
      const instance = this.governingOfPlacement(machine, placement);
      const listing = instance ? this.listingOf(instance, { remote: placement.url, id: placement.id }) : undefined;
      return instance && listing ? [{ instance: instance.origin, group: listing.repository.group }] : [];
    });
  }

  /**
   * A clone's row with the lines of the placements its files name that
   * no remote here holds (space-87, git-host-5): each a file names whose
   * instance is signed in and lists its id — in its last read or among
   * what this core attached there since — and no placement any clone
   * here holds is, by that instance's Git origin and the id, or by its
   * remote, after the lines its clone holds and before a creation's
   * wait; one line per host repository, "Not on this device", with that
   * listing's path, members and rights, or unreachable in a group named
   * like a login (space-61); each listing's group showing one line naming
   * the row (space-1). `held` is every placement a remote here holds.
   */
  private withFiled(placed: Placed, files: PlacementFile[], held: Placement[]): Placed {
    const lines: PlacementState[] = [];
    const elsewhere = [...placed.elsewhere ?? []];
    const seen = new Set<string>();
    for (const file of files) {
      const named = this.fileListing(file);
      if (!named) continue;
      const { instance, listing, gitOrigin } = named;
      const repository = listing.repository;
      const one = `${gitOrigin.replace(/\/+$/, "")} ${repository.id}`;
      if (seen.has(one)) continue;
      seen.add(one);
      if (held.some((placement) => repositoryFor([listing], (entry) => entry.repository, gitOrigin, placement.id, placement.url) !== undefined)) continue;
      const colliding = this.collides(repository.group, instance.view);
      lines.push({
        instance: instance.origin,
        path: `${repository.group.fullPath}/${repository.path}`,
        id: repository.id,
        attached: false,
        state: colliding ? "unreachable" : "absent",
        reason: colliding ? namedLikeYourLogin() : null,
        waiting: null,
        members: listing.members,
        visibility: repository.visibility,
        can: colliding ? { manageMembers: false, transfer: false } : { manageMembers: repository.can.manageMembers, transfer: repository.can.transfer },
        branch: null,
        incoming: [],
        conflicts: [],
        lastSync: null,
        noticed: false,
        outcome: null,
      });
      elsewhere.push({ instance: instance.origin, group: repository.group });
    }
    if (lines.length === 0) return placed;
    const placements = placed.row.placements;
    const at = placements.findIndex((line) => !line.attached);
    const ordered = at < 0 ? [...placements, ...lines] : [...placements.slice(0, at), ...lines, ...placements.slice(at)];
    return { ...placed, row: { ...placed.row, placements: ordered }, elsewhere };
  }

  /** The host repository a placement file names, as the signed-in
   * instance it names lists it (git-host-5): in that instance's last
   * read, or among what this core attached there since, by the id; with
   * that instance's Git origin as the core read it. None where the home
   * does not list that instance, it is signed out, or it lists no such
   * repository. */
  private fileListing(file: PlacementFile): { instance: HostInstance; listing: HostListing; gitOrigin: string } | undefined {
    if (!this.host.store.home.instance(file.origin)) return undefined;
    const instance = this.instanceAt(file.origin);
    if (!this.signedInAt(instance)) return undefined;
    const listing = instance.view?.listings.find((entry) => entry.repository.id === file.id) ?? instance.attached.get(file.id);
    const gitOrigin = instance.knownOrigin();
    return listing && gitOrigin !== undefined ? { instance, listing, gitOrigin } : undefined;
  }

  /** Whether a placement file names a host repository an instance lists
   * (git-host-5): one at that instance, or at an instance the home lists
   * whose Git origin, as the core read it, is the one that instance
   * reports, the id compared by the caller. */
  private fileNamesAt(file: PlacementFile, instance: HostInstance, gitOrigin: string): boolean {
    if (canonicalOrigin(file.origin) === instance.origin) return true;
    if (!this.host.store.home.instance(file.origin)) return false;
    return sameOrigin(this.instanceAt(file.origin).knownOrigin(), gitOrigin);
  }

  /** A clone's state from its lines (space-61): the state its key
   * placement's read gave it while it holds one placement, local only or
   * not on this device; else reachable where any placement it holds is,
   * read-only, with that placement's words, where none is and one is,
   * and unreachable, with its first placement's words, where every one
   * is. A creation waiting counts for nothing. */
  private rowStateOf(row: RepositoryState, lines: PlacementState[]): Pick<RepositoryState, "state" | "reason"> {
    const held = lines.filter((line) => line.attached);
    if (row.state === "local-only" || row.state === "absent" || held.length < 2) return { state: row.state, reason: row.reason };
    if (held.some((line) => line.state === "reachable")) return { state: "reachable", reason: null };
    const readOnly = held.find((line) => line.state === "read-only");
    if (readOnly) return { state: "read-only", reason: readOnly.reason };
    return { state: "unreachable", reason: held[0].reason };
  }

  /** The instance of a clone's first placement (space-30, DR-128): its
   * key placement's origin, null for its path placement — a remote the
   * reader named — or for no placement. */
  placementOf(machine: RepositorySync): string | null {
    return machine.placements[0]?.instance ?? null;
  }

  /** A clone's placement lines (space-87, space-30): those its clone
   * holds in the order added, the path placement last — the first read
   * as its row is, its state, its listing's members and rights; each
   * other by its own instance's last answer (overlayPlacement) — each
   * with its branch against that placement's `spex`, its lists, and this
   * device's last sync and notice of it as `held` and the row's machine
   * read them; then the one a creation for it waits at, attached to no
   * remote here. */
  private linesOf(machine: RepositorySync, row: RepositoryState, held: Placement[]): PlacementState[] {
    const lines: PlacementState[] = [];
    // Each step waiting at the host waits on the line of the placement at
    // its instance (space-64, space-87); a branch preparation at an
    // instance no placement beside the first is at, on the first's.
    const waits = this.waitsOf(row.key);
    const shown = new Set<Waiting>();
    const at = (origin: string | null): Waiting | undefined => (origin === null ? undefined : waits.find((waiting) => waiting.instance === canonicalOrigin(origin)));
    const phrase = (waiting: Waiting | undefined): PlacementState["waiting"] => {
      if (!waiting) return null;
      shown.add(waiting);
      return { step: waiting.step, group: waiting.group, message: waiting.message };
    };
    const state = row.state;
    const [first, ...rest] = state === "local-only" ? [] : row.placements;
    if (first && state !== "local-only") {
      const others = new Set(held.slice(1).flatMap((placement) => (placement.instance === null ? [] : [canonicalOrigin(placement.instance)])));
      lines.push({
        ...first,
        path: row.remote ?? first.path,
        id: row.id,
        state,
        reason: row.reason,
        waiting: phrase(at(first.instance) ?? waits.find((waiting) => waiting.step === "branch" && !others.has(waiting.instance))),
        members: row.members,
        visibility: row.visibility,
        can: { ...row.can },
      });
    }
    rest.forEach((line, index) => {
      const placement = held[index + 1];
      const overlaid = placement ? this.overlayPlacement(machine, placement, line) : line;
      lines.push({ ...overlaid, waiting: phrase(at(overlaid.instance)) });
    });
    // Then each instance a creation waits at, attached to no remote here.
    for (const waiting of waits) {
      if (shown.has(waiting)) continue;
      lines.push({
        instance: waiting.instance,
        path: `${waiting.group}/${waiting.create?.name ?? row.name}`,
        id: null,
        attached: false,
        state: "absent",
        reason: null,
        waiting: phrase(waiting),
        members: null,
        visibility: null,
        can: { manageMembers: false, transfer: false },
        branch: null,
        incoming: [],
        conflicts: [],
        lastSync: null,
        noticed: false,
        outcome: null,
      });
    }
    return lines;
  }

  /** The line of a placement a clone holds beside its first (space-87,
   * space-61), `line` carrying what this device holds of it: its path in
   * its instance as that instance's listing names it, else its URL's last
   * segment, the path placement's as a report reads it (space-15); its
   * state from the last answer of the instance governing it — its own,
   * or, while that is signed out, the one its next sync follows
   * (git-host-5, space-60) — as the first placement's is: none
   * governing, unreachable; a group named like a login, unreachable; what its last transport
   * learnt of the host, or the instance's failed read, until its next
   * read; listed, reachable or read-only with the listing's members and
   * rights; not listed by a read, unreachable — the path placement
   * reachable. */
  private overlayPlacement(machine: RepositorySync, placement: Placement, line: PlacementState): PlacementState {
    if (placement.instance === null) return { ...line, path: displayRemote(placement.url), state: "reachable", reason: null };
    // Read from the instance governing it — its own, or, while that is
    // signed out, the one its next sync follows (git-host-5, space-60).
    const instance = this.governingOfPlacement(machine, placement);
    const facts = { remote: placement.url, id: placement.id, remoteName: placement.name };
    const target = instance ? this.targetOf(instance, facts) : undefined;
    const listing = instance ? this.listingOf(instance, facts) : undefined;
    const own: PlacementState = { ...line, path: listing ? `${listing.repository.group.fullPath}/${listing.repository.path}` : remoteSegment(placement.url), state: "reachable", reason: null };
    if (!instance) return { ...own, state: "unreachable", reason: signInAgain() };
    const listed: PlacementState = listing
      ? { ...own, members: listing.members, visibility: listing.repository.visibility, can: { manageMembers: listing.repository.can.manageMembers, transfer: listing.repository.can.transfer } }
      : own;
    if (this.collides(listing?.repository.group, target?.catalog ?? instance.view)) return { ...listed, state: "unreachable", reason: namedLikeYourLogin() };
    const override = machine.overrideOf(placement.name);
    if (override) return { ...listed, state: override.state, reason: override.reason };
    if (target?.failure && target.begun > instance.failureRead) return { ...listed, state: "unreachable", reason: target.failure };
    if (instance.readFailure !== undefined && (!target || instance.failureRead > target.begun)) return { ...listed, state: "unreachable", reason: instance.readFailure };
    // No full or selected reading of its instance since this core started.
    if (!instance.view && !target) return own;
    if (!listing) return { ...own, state: "unreachable", reason: noLongerShared() };
    if (listing.readOnly) return { ...listed, state: "read-only", reason: listing.readOnly.message || archivedReason() };
    return listed;
  }

  /** The row `overlay` reads, before its lines. */
  private overlaid(machine: RepositorySync, base: RepositoryState): Placed {
    const facts = machine.facts;
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
      // Read from its lines (overlay).
      waiting: null,
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
      return { row: { ...listed, state: "read-only", reason: listing.readOnly.message || archivedReason() }, group, instance: at };
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
   * `<folder>/<path>@<id>` so it names no clone (space-30). `clones`
   * are the clones read, each with the placements it holds and those
   * its files name. */
  private absentRows(clones: { key: string; held: Placement[]; files: PlacementFile[] }[]): Placed[] {
    const store = this.host.store;
    // A clone the instances migration deferred, listed by the key it
    // keeps, holds the key it moves to (DR-127).
    const deferred = new Set(store.deferredMoves().map((move) => move.to));
    const own = store.home.own();
    // The host repositories an earlier instance's listing stands for, by
    // its Git origin and id.
    const earlier: { gitOrigin: string; id: string }[] = [];
    const rows: Placed[] = [];
    for (const instance of this.listedInstances()) {
      const view = this.viewOf(instance);
      const folder = instance.folder();
      if (!view || folder === null) continue;
      // Every clone here stands for each listing a placement it holds
      // matches, whatever instance it lies under, and otherwise for each
      // one its placement files name, as a placement not on this device
      // (git-host-5, space-87); your own group's own repository,
      // recording no id yet, for the one your namespace at its instance
      // lists under its name (space-4): never absent.
      const matched = new Set<string>();
      for (const clone of clones) {
        for (const placement of clone.held) {
          const listing = listingFor(view, placement.id, placement.url);
          if (listing) matched.add(listing.repository.id);
        }
        for (const file of clone.files) if (this.fileNamesAt(file, instance, view.gitOrigin)) matched.add(file.id);
        const machine = this.machines.get(clone.key);
        if (clone.key === own && machine && machine.facts.id === null) {
          const listing = this.servingOf(machine) === instance ? this.ownNamespaceListing(view) : undefined;
          if (listing) matched.add(listing.repository.id);
        }
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
        mergePending: false,
        // Its one listed placement, on no clone here (space-30).
        placements: [{
          instance: instance.origin,
          path,
          id: repository.id,
          attached: false,
          state: colliding ? "unreachable" : "absent",
          reason: colliding ? namedLikeYourLogin() : null,
          waiting: null,
          members: listing.members,
          visibility: repository.visibility,
          can: colliding ? { manageMembers: false, transfer: false } : { manageMembers: repository.can.manageMembers, transfer: repository.can.transfer },
          branch: null,
          incoming: [],
          conflicts: [],
          lastSync: null,
          noticed: false,
          outcome: null,
        }],
        placedAt: [],
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
    await this.machine(key).setRemote(url);
    const state = await this.state();
    this.host.broadcast(state);
    return state;
  }

  fetch(key: string): Promise<{ accepted: true }> { return this.machine(key).fetch(); }

  /** `placement` names the placement `choices`, `join` and `noticed`
   * are for (space-29). */
  sync(key: string, input: { placement?: string | null; choices?: Record<string, SpaceChoice>; join?: boolean; noticed?: boolean }): Promise<{ accepted: true }> {
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
        if (this.turnInstance(machine).origin === held) machine.holdBegan();
      }
    });
  }

  // A read resolves the clone's path at its instant; one that meets a
  // clone moved meanwhile fails, and the interface reads again on the
  // move's broadcast (space-29).
  diff(key: string, unit: string, path: string, side: SpaceChoice, placement?: string | null): Promise<{ patch: string; truncated: boolean }> {
    // `placement` names the placement the `remote` side is of, its first
    // where omitted (space-29).
    return this.machine(key).diff(unit, path, side, placement);
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
   * the core reopens it (space-31), once the host's id an unreleased
   * Spex left at the top level of its Git configuration has moved into
   * its remote's section (storage-34). */
  async repairAtStartup(): Promise<void> {
    for (const repository of this.host.store.listRepositories()) {
      const machine = this.machine(repository.key);
      machine.settleLegacyIds();
      await machine.repairAtStartup();
    }
  }

  /** Cancel every transport and wait for the operations (shutdown). */
  async stop(): Promise<void> {
    this.stopping = true;
    await Promise.all([...this.machines.values()].map((machine) => machine.stop()));
    try { await this.publishing; } catch { /* reported where it ran */ }
  }
}

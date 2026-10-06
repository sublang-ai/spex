// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Groups' core (DR-103, DR-057): every spex repository on this device
// with its sync machine — one per clone, any number at once (space-31) —
// its three-way unit plan with human labels (space-33, space-34), its
// write gate beneath the clone (space-21), the validated apply that
// never runs `git merge` (space-19), the refresh that re-indexes the
// running core (space-20), and the read-only explorer (space-35).

import { randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readSync, readdirSync, realpathSync, rmSync, statSync, type Dirent } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { type StorageDiagnostic } from "./app-storage.js";
import { readJsonFile, StorageFormatError, UUID, writeApplicationFile } from "./files.js";
import { splitKey } from "./home.js";
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
import { classifyTransportFailure, displayRemote, GitMissingError, lastLines, SpaceGit, validateRemoteUrl, type GitFailure } from "./space-git.js";
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
  readonly git: SpaceGit;
  phase: SpaceSyncPhase = { phase: "idle" };
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

  constructor(private readonly host: SpaceHost, private readonly owner: SpaceManager, readonly repository: SpexRepository) {
    this.git = new SpaceGit(repository.dir, host.env, host.transportTimeoutMs !== undefined ? { transportTimeoutMs: host.transportTimeoutMs } : {});
  }

  get key(): string { return this.repository.key; }
  private get dir(): string { return this.repository.dir; }

  // -- the gate (space-21) ---------------------------------------------------

  /** The busy message while an operation runs, else undefined. */
  busy(): string | undefined {
    if (this.phase.phase !== "running") return undefined;
    // One whole sentence per operation: a verb dropped into a frame
    // carries to no other language (core-service-111).
    if (this.phase.op === "sync") {
      return i18n._({ id: "Space is syncing; wait for it to finish", comment: "Refusal while the Space syncs" });
    }
    return i18n._({ id: "Space is checking the host; wait for it to finish", comment: "Refusal while the Space checks the remote" });
  }

  private assertNotRunning(): void {
    if (this.phase.phase === "running") {
      throw new CoreError("busy", i18n._({ id: "Space is busy", comment: "Refusal while a Space operation runs" }));
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
      throw new CoreError("invalid_request", i18n._({
        id: "Add a remote first",
        comment: "Refusal: the home names no remote to sync with",
      }));
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
      if (url !== repo.remote) await this.git.ok(repo.remote === null ? ["remote", "add", "origin", url] : ["remote", "set-url", "origin", url]);
    }
    if (url !== repo.remote) {
      // A changed remote clears the last check and the last sync (space-5):
      // what the old remote held says nothing about the new one.
      await this.git.run(["update-ref", "-d", `refs/remotes/origin/${SPEX_BRANCH}`]);
      await this.git.run(["config", "--unset", `branch.${SPEX_BRANCH}.remote`]);
      this.checkedAt = null;
      this.host.store.deletePref(lastSyncPref(this.key));
      this.remoteEmpty = false;
      this.unrelated = false;
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
    try { repo = await this.requireReady(); }
    catch (error) { this.phase = previous; throw error; }
    void this.runOperation("check", async () => {
      await this.enter("check", "check", true);
      await this.check(repo.remote);
      this.phase = { phase: "idle" };
    });
    return { accepted: true };
  }

  async sync(input: { choices?: Record<string, SpaceChoice>; join?: boolean; noticed?: boolean }): Promise<{ accepted: true }> {
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
          const remoteEmpty = await this.check(repo.remote);
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
          await this.enter(op, "push", true);
          const pushed = await this.push(repo.remote, upstream);
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

  /** Step 2 — Check: fetch the host's `spex` without merging; true when
   * the host holds no `spex` (space-8, space-12). */
  private async check(remote: string): Promise<boolean> {
    const heads = await this.git.run(["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${SPEX_BRANCH}`], { transport: true });
    if (heads.code === 2) {
      this.remoteEmpty = true;
      this.unrelated = false;
      this.checkedAt = Date.now();
      return true;
    }
    if (heads.code !== 0) throw new SpaceStopped("check", classifyTransportFailure(heads, remote));
    const fetched = await this.git.run(["fetch", "-q", "--no-tags", "origin", `+refs/heads/${SPEX_BRANCH}:refs/remotes/origin/${SPEX_BRANCH}`], { transport: true });
    if (fetched.code !== 0) throw new SpaceStopped("check", classifyTransportFailure(fetched, remote));
    this.remoteEmpty = false;
    this.checkedAt = Date.now();
    return false;
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
  private async push(remote: string, upstream: boolean): Promise<"ok" | "nothing" | "rejected"> {
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const origin = await this.git.run(["rev-parse", "-q", "--verify", `refs/remotes/origin/${SPEX_BRANCH}^{commit}`]);
    if (upstream && origin.code === 0 && origin.stdout.toString("utf8").trim() === head) return "nothing";
    const run = await this.git.run(upstream ? ["push", "-q", "origin", SPEX_BRANCH] : ["push", "-q", "-u", "origin", SPEX_BRANCH], { transport: true });
    if (run.code === 0) {
      // The host now holds `spex`: later plans compare against it.
      this.remoteEmpty = false;
      await this.git.run(["update-ref", `refs/remotes/origin/${SPEX_BRANCH}`, head]);
      return "ok";
    }
    const failure = classifyTransportFailure(run, remote);
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

  constructor(private readonly host: SpaceHost) {
    this.probe = new SpaceGit(host.home, host.env);
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
      repositories.push(recompute || !machine.cached ? await machine.state(true) : { ...machine.cached, sync: machine.phase });
    }
    for (const key of [...this.machines.keys()]) if (!store.repository(key)) this.machines.delete(key);
    const own = store.home.own();
    repositories.sort((a, b) => Number(b.key === own) - Number(a.key === own) || a.key.localeCompare(b.key));
    const diagnostics = await this.host.checkRepairs(this.diagnostics());
    const host = store.home.host;
    return {
      home: resolve(this.host.home),
      git: await this.probe.version(),
      host: { url: host.url, displayName: null },
      account: null,
      signIn: { phase: "idle" },
      readAt: null,
      groups: [{
        id: null,
        fullPath: store.home.ownName,
        name: store.home.ownName,
        url: null,
        own: true,
        repositories,
      }],
      diagnostics,
      // One number, so the header and the list cannot drift (space-1):
      // what the reader has not answered, and everything unfolded.
      issues: countIssues(diagnostics),
    };
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

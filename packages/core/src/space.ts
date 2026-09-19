// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's core (DR-057): the home at a glance, Initialize
// and Join, the remote, the three-way unit plan with human labels
// (space-33, space-34), the one sync machine with its write gate
// (space-31, space-21), the validated apply that never runs `git merge`
// (space-19), the refresh that re-indexes the running core (space-20),
// and the read-only explorer (space-35).

import { randomUUID } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, rmSync, statSync, type Dirent } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { UUID, parseRegistry, readJsonFile, StorageFormatError, writeApplicationFile, type StorageDiagnostic } from "./app-storage.js";
import { i18n } from "./i18n.js";
import type {
  SpaceChange,
  SpaceChoice,
  SpaceConflict,
  SpaceEntry,
  SpaceOp,
  SpaceReadResult,
  SpaceSide,
  SpaceState,
  SpaceSyncPhase,
  SpaceUnit,
  SpaceUnitKind,
  SyncStep,
} from "./protocol.js";
import { CoreError } from "./session.js";
import { classifyTransportFailure, displayRemote, GitMissingError, lastLines, SpaceGit, validateRemoteUrl, type GitFailure } from "./space-git.js";
import {
  applyStorageSelection,
  EMPTY_TREE,
  planStorageUnits,
  portable,
  prepareStorageGitFiles,
  readStorageTree,
  resolveStorageChoices,
  storageUnitName,
  validateStorageTree,
  type StorageChoice,
  type StorageMergeUnit,
  type StorageTree,
  type StorageTrees,
} from "./storage-git.js";
import type { Store } from "./store.js";
import { foldTurnEvent } from "./stream-fold.js";

/** What the core lends the Space engine: the home, its indexes, the
 * admission facts only the service knows, and the hooks a refresh
 * needs to re-index the running core (space-20). */
export interface SpaceHost {
  home: string;
  configPath: string;
  sessionsDir: () => string;
  env: NodeJS.ProcessEnv;
  store: Store;
  /** Migration, storage and session diagnostics (core-service-86). */
  diagnostics: () => StorageDiagnostic[];
  /** What the core found about the folders each repair names, and the
   * one it proposes (space-53): checked, never searched for. */
  checkRepairs: (diagnostics: StorageDiagnostic[]) => Promise<StorageDiagnostic[]>;
  /** The named blocker of space-11 — a turn in flight, a session held
   * elsewhere, a compile — or undefined when the core is quiet. */
  blocker: () => Promise<string | undefined>;
  broadcast: (state: SpaceState) => void;
  pauseWatchers: () => void;
  resumeWatchers: () => void;
  reloadConfig: () => Promise<void>;
  /** One full rescan of the sessions directory: history-replaced,
   * session.state, session.removed and intents.changed as a foreign-host
   * rescan announces them (core-service-60, core-service-87). */
  rescanSessions: () => Promise<void>;
  ledgerChanged: (projectIds: string[]) => void;
  /** Test seam (space-32): the transport limit; 120 s by default. */
  transportTimeoutMs?: number;
  /** Test seam: awaited before each step runs, so a suite can act
   * between steps deterministically. */
  beforeStep?: (event: { op: SpaceOp; step: SyncStep }) => void | Promise<void>;
}

const KIND_ORDER: SpaceUnitKind[] = ["session", "queue", "projects", "settings", "playbook", "rules", "other"];
const WITHHELD_FAMILIES = new Set(["provider hints", "migration inputs", "config backup"]);
const READ_CAP_BYTES = 256 * 1024;
const READ_CAP_LINES = 2_000;
const DIFF_CAP_BYTES = 256 * 1024;
const TEXT_EXTENSIONS = /\.(?:json|jsonl|ya?ml|md|txt|ts|mts|cts|js|mjs|cjs|log|toml|ini|cfg|csv|gitignore|gitattributes)$/i;

// The reader's own words are composed where they are read, never held
// in a constant a module's first evaluation would freeze in whichever
// language was current then (core-service-111).

/** Why a file of a withheld family is shown without its text (space-35). */
const withheldReason = (): string => i18n._({
  id: "May hold provider tokens — not shown",
  comment: "Why the explorer offers no preview of a file that may hold a provider's secret",
});

/** The refusal every act meets before the home is a repository. */
const initializeFirst = (): string => i18n._({
  id: "Initialize the repository first",
  comment: "Refusal: the home is not a Git repository yet",
});

/** The diagnostic a pending Git merge stands as (space-1). */
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
      upstream: boolean;
      originMain: string | null;
      mergePending: boolean;
      identityFallback: boolean;
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

export function spaceUnitKind(name: string): SpaceUnitKind {
  if (/^sessions\/[0-9a-f-]{36}$/.test(name)) return "session";
  if (/^intents\/[0-9a-f-]{36}\.jsonl$/.test(name)) return "queue";
  if (name === "projects.json") return "projects";
  if (name === "playbook/playbook.config.yaml") return "settings";
  if (/^playbooks\/[^/]+$/.test(name)) return "playbook";
  if (name === ".gitignore" || name === ".gitattributes") return "rules";
  return "other";
}

/** The catalog family of a home path (space-35, storage-1). */
export function spaceFamily(rel: string, isDirectory: boolean): string {
  const parts = rel.split("/");
  const base = parts[parts.length - 1];
  if (parts[0] === ".git") return "Git data";
  if (parts.length === 1 && /^\.lock/.test(base)) return "lease";
  if (parts[0] === "sessions" && parts.length === 2 && /^\.[0-9a-f-]{36}\.lock/.test(base)) return "lease";
  if (/\.lock$|\.lock\./.test(base)) return "lease";
  if (/\.tmp$/.test(base)) return "temporary write";
  if (/\.bak(?:\.|$)|\.backup(?:\.|$)/.test(base)) return "config backup";
  if (parts[0] === "sessions") {
    if (parts.length === 1) return "session bundles";
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
    if (parts.length === 1) return "project queues";
    const queue = /^([0-9a-f-]{36})\.jsonl$/.exec(base);
    if (parts.length === 2 && queue && UUID.test(queue[1])) return "project queue";
  }
  if (rel === "projects.json") return "project registry";
  if (rel === "playbook") return "Settings";
  if (rel === "playbook/playbook.config.yaml") return "Settings";
  if (parts[0] === "playbooks") {
    if (parts.length === 1) return "playbook library";
    if (parts.length === 2) return "playbook sources";
    const id = parts[1];
    const file = parts[2];
    if (file === `${id}.registry.ts` || file === `${id}.registry.mjs` || file === `${id}.fsm.bundle.mjs`) return "playbook output";
    if (file === `${id}.md` || file === `${id}.ts` || file === `${id}.playbook`) return "playbook sources";
  }
  if (rel === "local") return "local data";
  if (rel === "local/project-paths.json") return "local project paths";
  if (rel === "local/space-apply.json") return "sync repair marker";
  if (parts[0] === "local" && parts[1] === "migrations") {
    if (parts.length <= 3) return "migration receipts";
    if (parts[3] === "receipt.json") return "migration receipts";
    if (parts[3] === "inputs") return "migration inputs";
  }
  if (rel === "prefs.json") return "preferences";
  if (rel === "forge-cache.json") return "forge cache";
  if (rel === "meta.json") return "migration record";
  if (rel === ".gitignore" || rel === ".gitattributes") return "sync rules";
  return isDirectory ? "Not a Spex folder" : "Not a Spex file";
}

/** Catalog families the home never shares, whatever Git says (storage-1, space-35). */
const LOCAL_FAMILIES = new Set([
  "lease", "temporary write", "config backup", "provider hints", "legacy session sidecar",
  "local data", "local project paths", "sync repair marker", "migration receipts", "migration inputs",
  "preferences", "forge cache", "migration record",
]);

/** Whether a path belongs to an ignored catalog family; before Initialize writes the managed
 * rules, `check-ignore` cannot answer and the family alone decides (space-35, storage-17). */
function staysHere(rel: string, family: string): boolean {
  return LOCAL_FAMILIES.has(family) || rel === "local" || rel.startsWith("local/");
}

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
/** A queue one side rewrote rather than appended to (space-34). */
function queueReplaced(): string {
  return i18n._({ id: "queue replaced", comment: "A queue unit's detail: this side rewrote the queue instead of appending" });
}
/** A queue's acts, as a side's detail counts them (space-34). */
function actCount(count: number): string {
  return i18n._({
    id: "{count, plural, one {# act} other {# acts}}",
    values: { count },
    comment: "A queue unit side's detail: how many acts this side adds",
  });
}
function lines(text: string): string[] { const out = text.split("\n"); if (out[out.length - 1] === "") out.pop(); return out; }
function sameLinesPrefix(prefix: string[], whole: string[]): boolean { return prefix.length <= whole.length && prefix.every((line, i) => whole[i] === line); }

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

function registryEntries(bytes: Buffer | undefined): Map<string, string> | undefined {
  if (!bytes) return new Map();
  try { return new Map(parseRegistry(JSON.parse(bytes.toString("utf8"))).map((p) => [p.id, p.name])); } catch { return undefined; }
}
function registryLines(side: Map<string, string> | undefined, base: Map<string, string> | undefined): string[] {
  const changed = (): string => i18n._({
    id: "Projects changed",
    comment: "The project registry's label where its change cannot be named",
  });
  if (!side || !base) return [changed()];
  const out: string[] = [];
  for (const [id, name] of side) {
    const before = base.get(id);
    if (before === undefined) {
      out.push(i18n._({
        id: "Registered \"{name}\"",
        values: { name },
        comment: "A project registry line: a project this side added, by its name",
      }));
    } else if (before !== name) {
      out.push(i18n._({
        id: "Renamed \"{before}\" to \"{name}\"",
        values: { before, name },
        comment: "A project registry line: a project this side renamed",
      }));
    }
  }
  for (const [id, name] of base) {
    if (!side.has(id)) {
      out.push(i18n._({
        id: "Removed \"{name}\"",
        values: { name },
        comment: "A project registry line: a project this side removed, by its name",
      }));
    }
  }
  return out.length ? out : [changed()];
}

/** What the header counts (space-1): a repair the reader has not
 * answered, and every diagnostic no repair folds. A resolved repair is
 * already gone, because the core stops reporting it. */
function countIssues(diagnostics: StorageDiagnostic[]): number {
  return diagnostics.filter((entry) => entry.repair?.declined === undefined).length;
}

/** One repair's record in this device's preferences (space-54). */
const repairPref = (key: string): string => `space:repair:${key}`;

/** The marker an interrupted apply leaves, as a diagnostic names it. */
const REPAIR_MARKER_FILE = "local/space-apply.json";

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

export class SpaceManager {
  private readonly git: SpaceGit;
  private phase: SpaceSyncPhase = { phase: "idle" };
  private checkedAt: number | null = null;
  private remoteEmpty = false;
  private unrelated = false;
  private lists: Lists = { local: [], incoming: [], conflicts: [] };
  private lastPlan?: LastPlan;
  private cached?: SpaceState;
  private operation?: Promise<void>;
  private applied?: Applied;
  private holding?: { leases: { release(): Promise<unknown> }[]; umask: number };
  /** The text of the failure that stopped an interrupted sync's repair;
   * its diagnostic is phrased where it is read (core-service-111). */
  private repairFailure?: string;
  private refreshProblem?: StorageDiagnostic;

  constructor(private readonly host: SpaceHost) {
    this.git = new SpaceGit(host.home, host.env, host.transportTimeoutMs !== undefined ? { transportTimeoutMs: host.transportTimeoutMs } : {});
  }

  // -- the gate (space-21) ---------------------------------------------------

  /** The busy message while an operation runs, else undefined. */
  busy(): string | undefined {
    if (this.phase.phase !== "running") return undefined;
    // One whole sentence per operation: a verb dropped into a frame
    // carries to no other language (core-service-111).
    if (this.phase.op === "sync") {
      return i18n._({ id: "Space is syncing; wait for it to finish", comment: "Refusal while the Space syncs" });
    }
    if (this.phase.op === "check") {
      return i18n._({ id: "Space is checking the remote; wait for it to finish", comment: "Refusal while the Space checks the remote" });
    }
    return i18n._({ id: "Space is initializing; wait for it to finish", comment: "Refusal while the Space initializes the home" });
  }

  private assertNotRunning(): void {
    if (this.phase.phase === "running") {
      throw new CoreError("busy", i18n._({ id: "Space is busy", comment: "Refusal while a Space operation runs" }));
    }
  }

  // -- state (space-1, space-29, space-30) -----------------------------------

  async state(): Promise<SpaceState> {
    if (this.phase.phase === "running" && this.cached) {
      const live = this.diagnostics(this.cached.repository?.mergePending ?? false);
      return { ...this.cached, sync: this.phase, diagnostics: live, issues: countIssues(live) };
    }
    return this.snapshot(true);
  }

  /** Only the reader's own act settles a repair (space-54): declining
   * says this is not a project on this device, and is a preference,
   * which never syncs. Rendering never writes here. */
  async decline(repair: string, declined: boolean): Promise<SpaceState> {
    const known = this.diagnostics(this.cached?.repository?.mergePending ?? false)
      .some((entry) => entry.repair?.key === repair);
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

  private diagnostics(mergePending: boolean): StorageDiagnostic[] {
    // A repair carries only what the reader decided (space-54); a
    // record naming no standing repair is pruned, except while a fold
    // is untrustworthy — blocking damage, or a cached in-flight state.
    const mark = (entry: StorageDiagnostic): StorageDiagnostic => {
      if (!entry.repair) return entry;
      const stored = this.host.store.getPref<{ declined?: unknown }>(repairPref(entry.repair.key));
      const declined = stored && typeof stored.declined === "number" ? stored.declined : undefined;
      return declined === undefined ? entry : { ...entry, repair: { ...entry.repair, declined } };
    };
    const reported = [
      ...this.host.diagnostics().map(mark),
      ...(mergePending ? [{ file: ".git/MERGE_HEAD", reason: mergePendingReason(), blocking: false }] : []),
      ...(this.refreshProblem ? [this.refreshProblem] : []),
      // Phrased here, where it is read, from the failure's own text.
      ...(this.repairFailure !== undefined ? [{ file: REPAIR_MARKER_FILE, reason: repairFailureReason(this.repairFailure), blocking: true }] : []),
    ];
    this.pruneAnswers(reported);
    return reported;
  }

  /** An answer naming no repair the core still reports is discarded
   * (space-54) — but never on a fold that cannot be trusted to be
   * complete: blocking damage, or the cached state of an operation in
   * flight, would drop a record the next honest fold still wants. */
  private pruneAnswers(reported: StorageDiagnostic[]): void {
    if (this.phase.phase === "running") return;
    if (reported.some((entry) => entry.blocking)) return;
    const standing = new Set(reported.map((entry) => entry.repair?.key).filter(Boolean) as string[]);
    for (const key of this.host.store.prefKeys("space:repair:")) {
      if (!standing.has(key.slice("space:repair:".length))) this.host.store.deletePref(key);
    }
  }

  private async readRepository(): Promise<RepositoryInfo> {
    const version = await this.git.version();
    if (!version.ok) return { git: version, root: false };
    const top = await this.git.run(["rev-parse", "--show-toplevel"]);
    if (top.code !== 0 || realPath(top.stdout.toString("utf8").trim()) !== realPath(this.host.home)) return { git: version, root: false };
    const branch = await this.git.run(["symbolic-ref", "-q", "--short", "HEAD"]);
    const head = await this.git.run(["rev-parse", "-q", "--verify", "HEAD^{commit}"]);
    const remote = await this.git.run(["remote", "get-url", "origin"]);
    const upstream = await this.git.succeeds(["config", "--get", "branch.main.remote"]);
    const origin = await this.git.run(["rev-parse", "-q", "--verify", "refs/remotes/origin/main^{commit}"]);
    const gitDir = resolve(this.host.home, await this.git.ok(["rev-parse", "--git-dir"]));
    const mergePending = (await this.git.succeeds(["rev-parse", "-q", "--verify", "MERGE_HEAD"])) || existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"));
    return {
      git: version,
      root: true,
      branch: branch.code === 0 ? branch.stdout.toString("utf8").trim() : null,
      head: head.code === 0 ? head.stdout.toString("utf8").trim() : null,
      remote: remote.code === 0 ? remote.stdout.toString("utf8").trim() : null,
      upstream,
      originMain: origin.code === 0 ? origin.stdout.toString("utf8").trim() : null,
      mergePending,
      identityFallback: await this.git.identityFallback(),
    };
  }

  /** The state, recomputing the lists from the working tree when asked
   * (space-33: mine is the working tree outside a sync). */
  private async snapshot(recompute: boolean): Promise<SpaceState> {
    const repo = await this.readRepository();
    if (recompute && repo.root && repo.head !== null && this.phase.phase !== "choices") {
      try { await this.computeWorkingLists(repo.head, repo.originMain); }
      catch (error) { console.error(`spex: space listing failed: ${error instanceof Error ? error.message : String(error)}`); }
    }
    let ahead: number | null = null;
    let behind: number | null = null;
    if (repo.root && repo.head && repo.originMain && this.checkedAt !== null) {
      const counts = await this.git.run(["rev-list", "--left-right", "--count", "HEAD...refs/remotes/origin/main"]);
      if (counts.code === 0) {
        const [left, right] = counts.stdout.toString("utf8").trim().split(/\s+/).map((n) => Number.parseInt(n, 10));
        if (Number.isFinite(left) && Number.isFinite(right)) { ahead = left; behind = right; }
      }
    } else if (repo.root && repo.head && this.remoteEmpty && this.checkedAt !== null) {
      const count = await this.git.run(["rev-list", "--count", "HEAD"]);
      ahead = count.code === 0 ? Number.parseInt(count.stdout.toString("utf8").trim(), 10) : null;
      behind = 0;
    }
    const outside: SpaceState["outside"] = [];
    if (!inside(this.host.configPath, this.host.home)) outside.push({ what: "config", path: this.host.configPath });
    const sessionsDir = this.host.sessionsDir();
    if (!inside(sessionsDir, this.host.home)) outside.push({ what: "sessions", path: sessionsDir });
    const stored = this.host.store.getPref<{ at?: unknown; sent?: unknown; received?: unknown }>("space:lastSync");
    const lastSync = stored && typeof stored.at === "number" && typeof stored.sent === "number" && typeof stored.received === "number"
      ? { at: stored.at, sent: stored.sent, received: stored.received }
      : null;
    const diagnostics = await this.host.checkRepairs(this.diagnostics(repo.root && repo.mergePending));
    const state: SpaceState = {
      home: resolve(this.host.home),
      outside,
      git: repo.git,
      repository: repo.root ? {
        branch: repo.branch,
        remote: repo.remote === null ? null : displayRemote(repo.remote),
        upstream: repo.upstream,
        ahead,
        behind,
        checkedAt: this.checkedAt,
        remoteEmpty: this.checkedAt !== null && this.remoteEmpty,
        unrelated: this.unrelated,
        mergePending: repo.mergePending,
        identityFallback: repo.identityFallback,
      } : null,
      local: this.lists.local,
      incoming: this.lists.incoming,
      conflicts: this.lists.conflicts,
      lastSync,
      diagnostics,
      // One number, so the header and the list cannot drift (space-1):
      // what the reader has not answered, and everything unfolded.
      issues: countIssues(diagnostics),
      sync: this.phase,
    };
    this.cached = state;
    return state;
  }

  private async broadcast(recompute: boolean): Promise<SpaceState> {
    const state = await this.snapshot(recompute);
    this.host.broadcast(state);
    return state;
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

  private async computeWorkingLists(head: string, originMain: string | null): Promise<void> {
    const mine = await this.workingTree();
    let theirs = head;
    let base = head;
    if (this.checkedAt !== null) {
      if (this.remoteEmpty) { theirs = EMPTY_TREE; base = EMPTY_TREE; }
      else if (originMain) {
        const merged = await this.git.run(["merge-base", "HEAD", "refs/remotes/origin/main"]);
        if (merged.code === 0) { theirs = originMain; base = merged.stdout.toString("utf8").trim(); this.unrelated = false; }
        else this.unrelated = true;
      }
    }
    const trees: StorageTrees = { ours: readStorageTree(this.host.home, mine), theirs: readStorageTree(this.host.home, theirs), base: readStorageTree(this.host.home, base) };
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

  private projectName(id: string, registry: Buffer | undefined): string {
    const known = this.host.store.getProject(id)?.name;
    if (known) return known;
    const parsed = registryEntries(registry);
    return parsed?.get(id) ?? i18n._({
      id: "project {id}",
      values: { id: id.slice(0, 8) },
      comment: "A project no registry names, by the head of its identifier",
    });
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
        let cwd: string | undefined;
        try {
          const manifest = await blob(source.get(`${unit.name}.json`));
          cwd = manifest ? (JSON.parse(manifest.toString("utf8")) as { cwd?: unknown }).cwd as string | undefined : undefined;
        } catch { cwd = undefined; }
        const project = typeof cwd === "string" ? this.host.store.getProjectByPath(cwd) : undefined;
        const detail = [project ? undefined : cwd, turnCount(summary.turns)].filter((x): x is string => typeof x === "string").join(" · ");
        const untitled = i18n._({ id: "untitled session", comment: "A session unit's label where the session carries no title" });
        return { ...common, label: summary.title ?? untitled, detail, sessionId: id, diff: false, ...(project ? { project: { id: project.id, name: project.name } } : {}) };
      }
      case "queue": {
        const projectId = unit.name.slice("intents/".length, -".jsonl".length);
        const name = this.projectName(projectId, await blob(source.get("projects.json")));
        const sideLines = change === "deleted" ? [] : lines(((await blob(trees[side].get(unit.name))) ?? Buffer.alloc(0)).toString("utf8"));
        const baseLines = lines(((await blob(trees.base.get(unit.name))) ?? Buffer.alloc(0)).toString("utf8"));
        const prefix = sameLinesPrefix(baseLines, sideLines);
        const count = change === "deleted" ? 0 : prefix ? sideLines.length - baseLines.length : sideLines.length;
        const detail = change === "deleted"
          ? deletedDetail()
          : prefix
            ? i18n._({
                id: "{count, plural, one {# act appended} other {# acts appended}}",
                values: { count },
                comment: "A queue unit's detail: how many acts this side adds to the end",
              })
            : queueReplaced();
        const label = i18n._({
          id: "{count, plural, one {# change in {name}'s queue} other {# changes in {name}'s queue}}",
          values: { count, name },
          comment: "A queue unit's label; {name} is the project whose queue changed",
        });
        return { ...common, label, detail, project: { id: projectId, name }, diff: false };
      }
      case "projects": {
        const summary = registryLines(change === "deleted" ? new Map() : registryEntries(await blob(trees[side].get(unit.name))), registryEntries(await blob(trees.base.get(unit.name))));
        return { ...common, label: summary.join("\n"), diff: false };
      }
      case "settings":
        return { ...common, label: i18n._({ id: "Settings changed", comment: "The settings unit's label" }), diff: true };
      case "playbook": {
        const changed = unit.paths.filter((p) => trees[side].get(p) !== trees.base.get(p)).map((p) => p.slice(unit.name.length + 1));
        const label = i18n._({
          id: "Playbook {name}",
          values: { name: unit.name.slice("playbooks/".length) },
          comment: "A playbook unit's label; {name} is the playbook's own id",
        });
        return { ...common, label, detail: changed.join(", "), diff: true };
      }
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
      case "queue": {
        const sideLines = lines(((await blob(trees[side].get(unit.name))) ?? Buffer.alloc(0)).toString("utf8"));
        const baseLines = lines(((await blob(trees.base.get(unit.name))) ?? Buffer.alloc(0)).toString("utf8"));
        const prefix = sameLinesPrefix(baseLines, sideLines);
        return { change, detail: prefix ? actCount(sideLines.length - baseLines.length) : queueReplaced(), diff: false };
      }
      case "projects":
        return { change, detail: registryLines(registryEntries(await blob(trees[side].get(unit.name))), registryEntries(await blob(trees.base.get(unit.name)))).join("\n"), diff: false };
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
        try { newest = Math.max(newest ?? 0, statSync(join(this.host.home, p)).mtimeMs); } catch { /* deleted meanwhile */ }
      }
      return newest === undefined ? undefined : Math.round(newest);
    }
    const run = await this.git.run(["log", "-1", "--format=%ct", rev, "--", ...paths]);
    return run.code === 0 ? timeSeconds(run.stdout.toString("utf8")) : undefined;
  }

  // -- setting up (space-4, space-5) -----------------------------------------

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
    if (repo.branch !== "main") {
      throw new CoreError("invalid_request", repo.branch
        ? i18n._({
            id: "On {branch}; check out main in a terminal",
            values: { branch: repo.branch },
            comment: "Refusal: the home sits on another branch; main is a branch's own name",
          })
        : i18n._({
            id: "Not on a branch; check out main in a terminal",
            comment: "Refusal: the home's HEAD names no branch; main is a branch's own name",
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

  async init(remote?: string): Promise<SpaceState> {
    this.assertNotRunning();
    const previous = this.phase;
    this.phase = { phase: "running", op: "init", step: "save", since: Date.now(), cancelable: false };
    const home = this.host.home;
    try {
      const blocker = await this.host.blocker();
      if (blocker) throw new CoreError("busy", blocker);
      const repo = await this.readRepository();
      this.requireGit(repo);
      if (repo.root) {
        throw new CoreError("invalid_request", i18n._({
          id: "The home is already a repository",
          comment: "Refusal: Initialize was asked of a home Git already holds",
        }));
      }
      if (remote !== undefined) {
        const checked = validateRemoteUrl(remote);
        if (!checked.ok) throw new CoreError("invalid_request", checked.reason);
      }
      const blocking = this.host.diagnostics().find((d) => d.blocking);
      if (blocking) throw new CoreError("invalid_request", `${blocking.file}: ${blocking.reason}`);
      try { await validateStorageTree(home); }
      catch (error) { throw new CoreError("invalid_request", error instanceof StorageFormatError ? `${error.file}: ${error.reason}` : error instanceof Error ? error.message : String(error)); }
      const migrations = join(home, "local", "migrations");
      for (const id of existsSync(migrations) ? readdirSync(migrations) : []) {
        const receipt = join(migrations, id, "receipt.json");
        if (!existsSync(receipt)) continue;
        let complete = false;
        try { complete = (readJsonFile(receipt) as { complete?: unknown }).complete === true; } catch { complete = false; }
        if (!complete) {
          // The file names itself; the sentence after it is the core's.
          throw new CoreError("invalid_request", `local/migrations/${id}/receipt.json: ${i18n._({
            id: "the migration is incomplete; finish or remove it before initializing",
            comment: "Refusal, read after the file it names",
          })}`);
        }
      }
      const hadGitDir = existsSync(join(home, ".git"));
      const previousUmask = process.umask(0o077);
      try {
        const init = await this.git.run(["init", "-q", "-b", "main"]);
        if (init.code !== 0) {
          await this.git.ok(["init", "-q"]);
          await this.git.ok(["symbolic-ref", "HEAD", "refs/heads/main"]);
        }
        try {
          prepareStorageGitFiles(home, this.host.store.untrackedSessionPaths());
          await this.git.ok(["add", "-A", "--", "."]);
          const staged = (await this.git.ok(["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean);
          const leak = staged.find((p) => !portable(p));
          if (leak) {
            throw new CoreError("invalid_request", i18n._({
              id: "Refusing to share {leak}: it belongs to a family that stays on this device",
              values: { leak },
              comment: "Refusal: a staged file belongs to a family the home never shares; {leak} is its path",
            }));
          }
          await this.git.ok([...(await this.git.committerArgs()), "commit", "-q", "-m", `Initialize Spex space on ${hostname()}`]);
          if (remote !== undefined) await this.git.ok(["remote", "add", "origin", remote]);
        } catch (error) {
          if (!hadGitDir) rmSync(join(home, ".git"), { recursive: true, force: true });
          throw error;
        }
      } finally { process.umask(previousUmask); }
      this.checkedAt = null;
      this.remoteEmpty = false;
      this.unrelated = false;
      this.lastPlan = undefined;
      this.phase = { phase: "idle" };
      return await this.broadcast(true);
    } catch (error) {
      this.phase = previous;
      if (error instanceof CoreError) throw error;
      if (error instanceof GitMissingError) throw new CoreError("invalid_request", error.message);
      throw new CoreError("invalid_request", error instanceof Error ? error.message : String(error));
    }
  }

  async setRemote(url: string | null): Promise<SpaceState> {
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
      // A changed remote clears the last check (space-5): what the old
      // remote held says nothing about the new one.
      await this.git.run(["update-ref", "-d", "refs/remotes/origin/main"]);
      this.checkedAt = null;
      this.remoteEmpty = false;
      this.unrelated = false;
      this.phase = { phase: "idle" };
    }
    return this.broadcast(true);
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
    await this.host.beforeStep?.({ op, step });
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

  async sync(input: { choices?: Record<string, SpaceChoice>; join?: boolean }): Promise<{ accepted: true }> {
    this.assertNotRunning();
    const previous = this.phase;
    // The gate is set before the admission checks (space-21).
    this.phase = { phase: "running", op: "sync", step: "save", since: Date.now(), cancelable: false };
    let repo: ReadyRepository;
    const choices: Record<string, StorageChoice> = {};
    try {
      const blocker = await this.host.blocker();
      if (blocker) throw new CoreError("busy", blocker);
      repo = await this.requireReady();
      const blocking = this.diagnostics(false).find((d) => d.blocking);
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
            counts = { sent: planStorageUnits({ ours: readStorageTree(this.host.home, "HEAD"), theirs: new Map(), base: new Map() }).length, received: 0 };
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
                  id: "The remote changed again",
                  comment: "A stopped sync's message: the remote moved while this machine was sending",
                }),
                guidance: i18n._({
                  id: "Your merge is saved locally; Retry to send it once the remote settles.",
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
          this.host.store.setPref("space:lastSync", { at, sent: counts.sent, received: counts.received });
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
    const home = this.host.home;
    const stop = (message: string, guidance: string): SpaceStopped => new SpaceStopped("save", { cause: "validation", message, guidance, retry: false });
    try { prepareStorageGitFiles(home, this.host.store.untrackedSessionPaths()); }
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
    try { await validateStorageTree(home); }
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
      // The pattern reads Git's own English output, so it stays.
      const identity = /tell me who you are|no email|no name/i.test(commit.stderr);
      throw new SpaceStopped("save", {
        cause: identity ? "identity" : "git",
        message: lastLines(commit.stderr) || i18n._({
          id: "Git could not commit",
          comment: "A stopped save's message where git failed and printed nothing",
        }),
        guidance: identity
          ? i18n._({
              id: "Set user.name and user.email for Git on this machine, then Retry.",
              comment: "Guidance where Git has no committer identity; the setting names stay as they are",
            })
          : i18n._({
              id: "Retry; if it fails again, run git commit in the home from a terminal for detail.",
              comment: "Guidance under a commit git failed; git commit is the command's own name",
            }),
        retry: true,
      });
    }
    return this.git.ok(["rev-parse", "HEAD"]);
  }

  /** Step 2 — Check: fetch the remote's main without merging; true when
   * the remote holds no main (space-8, space-12). */
  private async check(remote: string): Promise<boolean> {
    const heads = await this.git.run(["ls-remote", "--exit-code", "--heads", "origin", "refs/heads/main"], { transport: true });
    if (heads.code === 2) {
      this.remoteEmpty = true;
      this.unrelated = false;
      this.checkedAt = Date.now();
      return true;
    }
    if (heads.code !== 0) throw new SpaceStopped("check", classifyTransportFailure(heads, remote));
    const fetched = await this.git.run(["fetch", "-q", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main"], { transport: true });
    if (fetched.code !== 0) throw new SpaceStopped("check", classifyTransportFailure(fetched, remote));
    this.remoteEmpty = false;
    this.checkedAt = Date.now();
    return false;
  }

  /** Step 3 — Compare: the plan of HEAD against the remote's main over
   * their ancestor, or the empty tree for a join (space-13, space-14). */
  private async compare(choices: Record<string, StorageChoice>, join: boolean): Promise<CompareResult> {
    const home = this.host.home;
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const origin = await this.git.ok(["rev-parse", "refs/remotes/origin/main"]);
    const merged = await this.git.run(["merge-base", "HEAD", "refs/remotes/origin/main"]);
    this.unrelated = merged.code !== 0;
    if (this.unrelated && !join) return { outcome: "unrelated" };
    const base = this.unrelated ? EMPTY_TREE : merged.stdout.toString("utf8").trim();
    const trees: StorageTrees = { ours: readStorageTree(home, head), theirs: readStorageTree(home, origin), base: readStorageTree(home, base) };
    const units = planStorageUnits(trees);
    this.lastPlan = { ours: head, oursTree: head, theirs: origin, base, units };
    this.lists = await this.describe(units, trees, { ours: head, theirs: origin, base });
    const local = units.filter((u) => u.choice === "ours" && u.changed.ours && !u.changed.theirs);
    const incoming = units.filter((u) => u.choice === "theirs");
    const conflicts = units.filter((u) => u.choice === "conflict");
    if (await this.git.succeeds(["merge-base", "--is-ancestor", "refs/remotes/origin/main", "HEAD"])) {
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

  private markerPath(): string { return join(this.host.home, "local", "space-apply.json"); }

  private beginHolding(): void {
    if (this.holding) return;
    this.holding = { leases: [], umask: process.umask(0o077) };
    this.host.pauseWatchers();
  }

  private async releaseHoldings(): Promise<void> {
    const holding = this.holding;
    if (!holding) return;
    this.holding = undefined;
    const results = await Promise.allSettled(holding.leases.reverse().map((lease) => lease.release()));
    this.host.store.setManagedSessions(undefined);
    process.umask(holding.umask);
    this.host.resumeWatchers();
    for (const result of results) if (result.status === "rejected") console.error(`spex: session lease release failed: ${String(result.reason)}`);
  }

  /** Take every session's management lease (space-31): a held one stops
   * the sync naming its session. */
  private async acquireSessionLeases(units: StorageMergeUnit[], step: SyncStep): Promise<void> {
    const store = this.host.store;
    const shared = store.sessionStore();
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
        this.host.home,
        { ours: pending.head, theirs: pending.origin, base: pending.base, unrelated: pending.base === EMPTY_TREE, units: pending.units },
        Object.fromEntries(pending.resolved),
        {
          holdsSessionLeases: true,
          beforeWrite: () => {
            mkdirSync(dirname(marker), { recursive: true, mode: 0o700 });
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

  /** The merge commit from the staged selection, or main moved to the
   * remote's commit where the selection equals its tree (space-19). */
  private async commitSelection(head: string, origin: string, resolved: Map<string, StorageChoice>): Promise<string> {
    const tree = await this.git.ok(["write-tree"]);
    const fastForward = await this.git.succeeds(["merge-base", "--is-ancestor", head, origin]);
    const originTree = await this.git.ok(["rev-parse", `${origin}^{tree}`]);
    let commit = origin;
    if (!(fastForward && tree === originTree)) {
      const chosen = [...resolved].filter(([, side]) => side === "theirs").map(([name]) => `remote: ${name}`);
      const kept = [...resolved].filter(([, side]) => side === "ours").map(([name]) => `mine: ${name}`);
      const message = `Merge remote main\n\n${[...chosen, ...kept].join("\n")}`;
      commit = await this.git.ok([...(await this.git.committerArgs()), "commit-tree", tree, "-p", head, "-p", origin, "-m", message]);
    }
    await this.git.ok(["update-ref", "refs/heads/main", commit, head]);
    return commit;
  }

  /** Step 5 — Refresh: re-validate and re-index the running core so every
   * view reflects the selected state (space-20). */
  private async refresh(): Promise<void> {
    const applied = this.applied as Applied;
    const store = this.host.store;
    this.refreshProblem = undefined;
    try { await validateStorageTree(this.host.home); }
    catch (error) {
      this.refreshProblem = error instanceof StorageFormatError
        ? { file: error.file, reason: error.reason, blocking: true }
        : { file: this.host.home, reason: error instanceof Error ? error.message : String(error), blocking: true };
    }
    store.reload();
    const configChanged = !(await this.git.succeeds(["diff", "--quiet", applied.headBefore, applied.headAfter, "--", "playbook/playbook.config.yaml"]));
    if (configChanged && inside(this.host.configPath, this.host.home)) await this.host.reloadConfig();
    await this.host.rescanSessions();
    this.host.ledgerChanged(store.listProjects().map((project) => project.id));
    await this.releaseHoldings();
    this.unrelated = false;
    this.applied = undefined;
    // The lists are recomputed at Refresh (space-29): the working tree
    // now holds the selected state.
    await this.broadcast(true);
  }

  /** Step 6 — Push main to origin, setting the upstream once (space-12). */
  private async push(remote: string, upstream: boolean): Promise<"ok" | "nothing" | "rejected"> {
    const head = await this.git.ok(["rev-parse", "HEAD"]);
    const origin = await this.git.run(["rev-parse", "-q", "--verify", "refs/remotes/origin/main^{commit}"]);
    if (upstream && origin.code === 0 && origin.stdout.toString("utf8").trim() === head) return "nothing";
    const run = await this.git.run(upstream ? ["push", "-q", "origin", "main"] : ["push", "-q", "-u", "origin", "main"], { transport: true });
    if (run.code === 0) {
      // The remote now holds main: later plans compare against it.
      this.remoteEmpty = false;
      return "ok";
    }
    const failure = classifyTransportFailure(run, remote);
    if (failure.cause === "rejected") return "rejected";
    throw new SpaceStopped("push", failure);
  }

  // -- repair (space-31) -----------------------------------------------------

  /** An interrupted apply is repaired from its marker before the core
   * reopens the home; a failure stands as a blocking issue. */
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
      await this.host.rescanSessions();
    } catch (error) {
      this.repairFailure = error instanceof Error ? error.message : String(error);
      throw new CoreError("invalid_request", `${REPAIR_MARKER_FILE}: ${repairFailureReason(this.repairFailure)}`);
    }
  }

  private async repair(): Promise<void> {
    const home = this.host.home;
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
      // onto the remote's commit: nothing is re-applied.
      const parents = (await this.git.ok(["log", "-1", "--format=%P", "HEAD"])).split(/\s+/).filter(Boolean);
      const landed = head === marker.theirs || (parents.includes(marker.ours) && parents.includes(marker.theirs));
      if (landed) { rmSync(this.markerPath(), { force: true }); return; }
      throw new Error(i18n._({
        id: "main moved since the interrupted sync; resolve it in a terminal",
        comment: "Why an interrupted sync's repair failed; main is the branch's own name",
      }));
    }
    const trees: StorageTrees = { ours: readStorageTree(home, marker.ours), theirs: readStorageTree(home, marker.theirs), base: readStorageTree(home, marker.base) };
    const units = planStorageUnits(trees);
    const choices = marker.choices as Record<string, StorageChoice>;
    this.beginHolding();
    try {
      await this.acquireSessionLeases(units, "apply");
      await applyStorageSelection(home, { ours: marker.ours, theirs: marker.theirs, base: marker.base, unrelated: marker.base === EMPTY_TREE, units }, choices, { holdsSessionLeases: true });
      await this.commitSelection(marker.ours, marker.theirs, resolveStorageChoices(units, choices));
      rmSync(this.markerPath(), { force: true });
    } finally { await this.releaseHoldings(); }
  }

  // -- diff (space-10) -------------------------------------------------------

  async diff(unit: string, path: string, side: SpaceChoice): Promise<{ patch: string; truncated: boolean }> {
    if (!this.lastPlan) await this.snapshot(true);
    const plan = this.lastPlan;
    if (!plan) throw new CoreError("invalid_request", initializeFirst());
    const found = plan.units.find((u) => u.name === unit);
    if (!found) throw new CoreError("invalid_request", unknownUnit(unit));
    const kind = spaceUnitKind(unit);
    if (kind === "session" || kind === "queue") {
      throw new CoreError("invalid_request", i18n._({
        id: "a session or queue offers no text diff",
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
        id: "Check the remote first",
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

  /** Resolve a home-relative path without following symlinks, confined
   * to the home's real path. */
  private confine(rel: string | undefined, forRead: boolean): { rel: string; abs: string } {
    const home = realPath(this.host.home);
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
    let current = home;
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
    if (!inside(current, home)) throw new CoreError("invalid_request", escapesTheHome());
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

  private entry(parent: string, dirent: Dirent, marks: Awaited<ReturnType<SpaceManager["sharingMarks"]>>): SpaceEntry {
    const rel = parent ? `${parent}/${dirent.name}` : dirent.name;
    const abs = join(realPath(this.host.home), rel);
    if (rel === ".git") return { name: dirent.name, path: rel, kind: "git", family: "Git data", sync: "git", preview: "none" };
    if (dirent.isSymbolicLink()) return { name: dirent.name, path: rel, kind: "file", family: "Not a Spex file", sync: "local", preview: "none" };
    const directory = dirent.isDirectory();
    const family = spaceFamily(rel, directory);
    const under = (set: Set<string>): boolean => { for (const item of set) if (item === rel || item.startsWith(`${rel}/`)) return true; return false; };
    let sync: SpaceEntry["sync"];
    if (staysHere(rel, family)) sync = "local";
    else if (!marks.repo) sync = "pending";
    else if (marks.ignored.has(rel)) sync = "local";
    else if (directory) sync = under(marks.status) ? "pending" : under(marks.tracked) ? "shared" : "local";
    else sync = marks.status.has(rel) ? "pending" : marks.tracked.has(rel) ? "shared" : "pending";
    const owner = this.owner(rel);
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

  private owner(rel: string): SpaceEntry["owner"] | undefined {
    const session = /^sessions\/([0-9a-f-]{36})\.(?:json|records\.jsonl|hints\.json|spex\.json)$/.exec(rel);
    if (session && UUID.test(session[1])) {
      const info = this.host.store.describeSession(session[1]);
      const project = info ? this.host.store.getProject(info.projectId) : undefined;
      return { sessionId: session[1], ...(info?.title ? { title: info.title } : {}), ...(info ? { projectId: info.projectId } : {}), ...(project ? { name: project.name } : {}) };
    }
    const queue = /^intents\/([0-9a-f-]{36})\.jsonl$/.exec(rel);
    if (queue && UUID.test(queue[1])) {
      const project = this.host.store.getProject(queue[1]);
      return { projectId: queue[1], ...(project ? { name: project.name } : {}) };
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


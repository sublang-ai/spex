// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Application files belong to Spex; session files and mutations belong
// to Playbook. The home pairs working folders with spex repositories,
// one clone each under `workspace/` with its own session store
// (storage-1, storage-14, DR-103). These maps are rebuilt projections
// for UI and intent folds.

import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { createSessionStore, isUncertainTurnDiscardable, validateSessionContext, type SharedSessionStore, type SessionManifest, type SessionRecovery } from "@sublang/playbook/session-store";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  intentFileOf, intentInfoOf, parsePrefs, parseProjectFile, readIntentFiles, repairKey, writeIntentFile,
  type ProjectFile, type StorageDiagnostic,
} from "./app-storage.js";
import { readJsonFile, StorageFormatError, writeApplicationFile } from "./files.js";
import { Home, repositoryNameFor, splitKey } from "./home.js";
import { folderRemote, needsGroupsMigration, migrateFormerHome } from "./migrate-home.js";
import { initializeClone } from "./storage-git.js";
import { seedConfig } from "./config.js";
import { createRequire } from "node:module";
import { i18n } from "./i18n.js";
import { isLanguage, type Language } from "./language.js";

import type {
  ForgeState,
  IntentInfo,
  IntentSource,
  IntentSourceKind,
  ParkedRun,
  ParkedRunAction,
  ProjectInfo,
  SessionAgentSettings,
  SessionInfo,
  SessionAgentSettingsMap,
  StoredRecord,
  TmuxPlayRecord,
} from "./protocol.js";
import { hasPresentationHeader } from "./protocol.js";
import {
  foldAgentActiveMs,
  foldAgentReportedModels,
  foldTurnEvent,
  foldUsage,
  sanitizeRecord,
  type TurnEvent,
  type UsageEntry,
  type UsageTotals,
} from "./stream-fold.js";

export type { UsageEntry, UsageTotals } from "./stream-fold.js";

const META_VERSION = 1;

/** Playbook's own discard predicate over a manifest, whose recovery
 * fields are the record's (core-service-32, DR-088): the client draws
 * Discard from this, never from a guess. A manifest the predicate
 * cannot read offers no Discard; Playbook's store refuses it anyway. */
function discardable(manifest: SessionManifest): boolean {
  try { return isUncertainTurnDiscardable(manifest as unknown as SessionRecovery); }
  catch { return false; }
}

/** Another core instance holds the state root (CORE-61). */
export class StateRootHeldError extends Error {
  constructor(
    readonly holder: { pid: number; hostname: string; acquiredAt: number },
    dir: string,
  ) {
    super(
      i18n._({
        id: "state root {dir} is held by pid {pid} on {host}; one core serves a root at a time (DR-036)",
        comment:
          "Startup refusal the shell shows in a dialog; the path, the process id, the host name and the decision's id stay as they are",
        values: { dir, pid: holder.pid, host: holder.hostname },
      }),
    );
    this.name = "StateRootHeldError";
  }
}

export interface StoreOptions {
  /** The Spex home; unset runs the store on a scratch home removed at close. */
  dir?: string;
  /** A legacy SQLite store to import once (CORE-64): skipped when the
   * `<store>.imported` marker beside it says a root already did. */
  legacyDbPath?: string;
  /** The environment Git and the host URL are read from. */
  env?: NodeJS.ProcessEnv;
  /** Your own group's folder name for a new home; this device's user
   * name by default (storage-2). */
  own?: string;
  /** The home's compiled-playbook library, for the migration's checks. */
  libraryDir?: string;
  /** Publish a config a former location holds at your own group's
   * config path before the starter is seeded there (core-service-66). */
  relocateConfig?: (configPath: string) => void;
  /** Internal: Store.open runs the migration the constructor defers. */
  deferMigration?: boolean;
  /** Fill a clone the store makes, before its first commit: your own
   * group's at every open and a new project's at registration — where
   * the environment requests the built-in spec package (storage-6,
   * environments-11). The migration calls it for each clone it makes. */
  prepareRepository?: (dir: string, key: string, hostUrl: string) => void;
}

/** One spex repository's clone and the files it holds (storage-1). */
export interface SpexRepository {
  key: string;
  dir: string;
  sessionsDir: string;
  intentsDir: string;
  authoringDir: string;
  configPath: string;
  projectFile: string;
  /** Playbook's shared session store over this clone's `sessions/`. */
  store: SharedSessionStore;
}

interface SessionMeta {
  id: string;
  /** The key of the spex repository holding the session (storage-6). */
  projectId: string;
  /** The working directory its manifest records. */
  cwd?: string;
  createdAt: number;
  endedAt: number | null;
  live: boolean;
  externalWriter?: "active" | "unknown";
  players: SessionInfo["players"];
  initialVisible: string[];
  /** Set when an append failed: the file is a complete prefix only up
   * to this sequence; later records lived in memory only (DR-036). */
  streamIncompleteAfterSeq?: number;
  /** Legacy presentation label, never recovery authority. */
  foreign?: true;
  /** Shared directory used to detect removal by another host. */
  originDir?: string;
  continuable?: boolean;
  /** The shared store's own words for why this session cannot continue. */
  continuationReason?: string;
  /** The core's own reason instead, phrased when the session is read
   * (core-service-111) rather than when the scan recorded it. */
  continuationRecovery?: true;
  recovery?: SessionInfo["recovery"];
}

interface TurnRow {
  attachmentTitle?: string;
  turnId: number;
  prompt: string;
  startedAt: number;
  endedAt: number | null;
  status: string | null;
}

interface StoreMeta {
  version: number;
  importedLegacy?: string[];
}

function isHidden(record: TmuxPlayRecord): boolean {
  return (
    "visibility" in record &&
    (record as { visibility?: string }).visibility === "hidden"
  );
}

/** One session's listing row plus its folded summary, in the single
 * shape every listing and broadcast shares (core-service-32). */
function sessionInfo(
  meta: SessionMeta,
  path: string,
  title: string | undefined,
  turns: number,
  failed: boolean,
  costUsd: number | undefined,
  agentSettings: SessionAgentSettingsMap | undefined,
  agentActiveMs: Record<string, number> | undefined,
  agentReportedModels: SessionInfo["agentReportedModels"],
  parked: ParkedRun | undefined,
): SessionInfo {
  return {
    id: meta.id,
    projectId: meta.projectId,
    projectPath: path,
    createdAt: meta.createdAt,
    live: meta.live || meta.externalWriter === "active",
    endedAt: meta.externalWriter ? null : meta.endedAt,
    ...(meta.externalWriter ? {externalWriter: meta.externalWriter, turnActive: meta.externalWriter === "active" && !!meta.recovery} : {}),
    players: meta.players,
    initialVisible: meta.initialVisible,
    ...(title !== undefined ? { title } : {}),
    turns,
    failed,
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(agentActiveMs !== undefined ? { agentActiveMs } : {}),
    ...(agentReportedModels !== undefined ? { agentReportedModels } : {}),
    ...(meta.streamIncompleteAfterSeq !== undefined
      ? { streamIncompleteAfterSeq: meta.streamIncompleteAfterSeq }
      : {}),
    ...(meta.foreign ? { foreign: true } : {}),
    ...(!meta.live && !meta.externalWriter && meta.continuable ? { continuable: true } : {}),
    // Phrased here, when the session is read (core-service-111): a
    // reason the core owns follows the home's language, while one the
    // shared store gave is that store's own words, kept as they are.
    ...(meta.externalWriter
      ? {continuationReason: meta.externalWriter === "active"
          ? i18n._({
              id: "Session is active in another host",
              comment: "Why a session cannot continue here: another host is writing it",
            })
          : i18n._({
              id: "Session ownership cannot be verified",
              comment: "Why a session cannot continue here: its lease cannot be read",
            })}
      : meta.continuationReason ? { continuationReason: meta.continuationReason }
      : meta.continuationRecovery ? { continuationReason: i18n._({
          id: "Restore the interrupted turn first",
          comment: "Refusal; Restore is the control the interface offers for interrupted work",
        }) }
      : {}),
    ...(meta.recovery && !meta.externalWriter ? { recovery: meta.recovery } : {}),
    ...(agentSettings && Object.keys(agentSettings).length > 0 ? { agentSettings } : {}),
    ...(parked ? { parked } : {}),
  };
}

const agentSettingsKey = (sessionId: string): string => `session:${sessionId}:agents`;
const parkedRunKey = (sessionId: string): string => `session:${sessionId}:parked`;
/** The home's one interface language (storage-5). */
const LANGUAGE_PREF = "language";

/**
 * The interface language `<dir>/local/prefs.json` stores, read before any
 * store opens so the load's own diagnostics already speak it
 * (core-service-111). A missing, unreadable or unknown value reads as
 * none: the store's load reports a damaged file itself.
 */
export function readStoredLanguage(dir: string): Language | null {
  const prefsFile = prefsFileOf(dir);
  try {
    if (!existsSync(prefsFile)) return null;
    const stored = parsePrefs(readJsonFile(prefsFile), prefsFile)[LANGUAGE_PREF];
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** A parked run's captured controls, read defensively: a hand-edited
 * or older preference never invalidates the rest of the session. */
function readParkedRun(value: unknown): ParkedRun | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (source.reason !== "failure" && source.reason !== "question") return undefined;
  const control = (entry: unknown): ParkedRunAction | undefined => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const held = entry as Record<string, unknown>;
    if (typeof held.id !== "string" || !held.id || typeof held.label !== "string") return undefined;
    return {
      id: held.id, label: held.label,
      ...(held.standing === "ready" || held.standing === "no-op" || held.standing === "blocked" ? {standing: held.standing} : {}),
      ...(typeof held.reason === "string" && held.reason ? {reason: held.reason} : {}),
    };
  };
  const actions = (Array.isArray(source.actions) ? source.actions : [])
    .map(control).filter((entry): entry is ParkedRunAction => entry !== undefined);
  const ending = control(source.ending);
  if (actions.length === 0 && !ending) return undefined;
  return {reason: source.reason, actions, ...(ending ? {ending: {id: ending.id, label: ending.label}} : {})};
}

/** One agent's stored tuning, read defensively: a hand-edited or
 * older preference file never invalidates the rest of the session. */
function readAgentSettings(value: unknown): SessionAgentSettings | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const entry: SessionAgentSettings = {};
  for (const field of ["model", "subagentModel", "effort", "subagentEffort"] as const) {
    const held = source[field];
    if (held === false || (typeof held === "string" && held.length > 0)) entry[field] = held;
  }
  if (typeof source.fastMode === "boolean") entry.fastMode = source.fastMode;
  if (typeof source.browser === "boolean") entry.browser = source.browser;
  return Object.keys(entry).length > 0 ? entry : undefined;
}

/** Atomic whole-file replace: a reader never sees a torn file. */
function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

function readJson<T>(file: string): T | undefined {
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** The marker written beside a legacy store once a root imported it
 * (CORE-64): the one record a brand-new root can read, since its own
 * `meta.json` starts empty. */
function legacyImportMarker(legacyDbPath: string): string {
  return `${legacyDbPath}.imported`;
}

/**
 * JSONL as a reader that owns nothing: the complete newline-terminated
 * prefix is the readable content, damage is tolerated by stopping at
 * it, and the file is never mutated — the contract a lease-free reader
 * of another host's stream must honor (DR-036).
 */
function readRecordsPrefix(file: string, retainSequenceGaps = false): { records: StoredRecord[]; incompleteAfterSeq?: number } {
  if (!existsSync(file)) return { records: [] };
  const lines = readFileSync(file, "utf8").split("\n");
  // A parseable last line is still uncommitted until its newline lands.
  const unterminated = lines.pop() !== "";
  const records: StoredRecord[] = [];
  let lastSeq = 0;
  let incompleteAfterSeq: number | undefined;
  const markIncomplete = (): void => { incompleteAfterSeq ??= lastSeq; };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value: unknown = JSON.parse(trimmed);
      const entry = value as Partial<StoredRecord> & { v?: unknown };
      if (
        !entry || typeof entry !== "object" ||
        entry.v !== 1 || typeof entry.seq !== "number" ||
        !Number.isSafeInteger(entry.seq) || entry.seq <= lastSeq ||
        Object.keys(entry).some((key) => !["v", "seq", "role", "record"].includes(key)) ||
        (entry.role !== undefined && typeof entry.role !== "string") ||
        !entry.record || typeof entry.record !== "object" ||
        Array.isArray(entry.record)
      ) {
        markIncomplete();
        break;
      }
      if (entry.seq !== lastSeq + 1) {
        markIncomplete();
        // Legacy native imports can have gaps. Their later increasing
        // records stay readable, but never certify safe continuation.
        if (!retainSequenceGaps) break;
      }
      // Payloads are opaque in v1; only their presenters require a
      // type and timestamp. Unknown records still consume a sequence.
      const { v: _v, ...kept } = entry;
      records.push(kept as StoredRecord);
      lastSeq = entry.seq;
    } catch {
      markIncomplete();
      break;
    }
  }
  if (unterminated) markIncomplete();
  return { records, ...(incompleteAfterSeq !== undefined ? { incompleteAfterSeq } : {}) };
}

function usageTotals(entries: UsageEntry[]): UsageTotals {
  const sources = new Set<string>();
  const totals = { inputTokens: 0, outputTokens: 0, toolUses: 0, totalCostUsd: 0 };
  for (const entry of entries) {
    totals.inputTokens += entry.inputTokens ?? 0;
    totals.outputTokens += entry.outputTokens ?? 0;
    totals.toolUses += entry.toolUses;
    totals.totalCostUsd += entry.totalCostUsd ?? 0;
    if (entry.costSource) sources.add(entry.costSource);
  }
  return { ...totals, costSources: [...sources].sort() };
}

/** The home's preference file (storage-5). */
export function prefsFileOf(dir: string): string { return join(dir, "local", "prefs.json"); }

/** The rebuildable forge cache, on this device alone (storage-1). */
function forgeCacheFileOf(dir: string): string { return join(dir, "local", "forge-cache.json"); }

/** A clone's record, the files it holds named once (storage-1). */
export function spexRepository(key: string, dir: string): SpexRepository {
  const sessionsDir = join(dir, "sessions");
  return {
    key,
    dir,
    sessionsDir,
    intentsDir: join(dir, "intents"),
    authoringDir: join(dir, "authoring"),
    configPath: join(dir, "config", "playbook.config.yaml"),
    projectFile: join(dir, "project.json"),
    store: createSessionStore({ sessionsDir }),
  };
}

const unpairedReason = (name: string): string =>
  i18n._({ id: "{name} has no folder on this device", comment: "Repair row: the project is registered, but nothing here holds it",
    values: { name } });
const missingCloneReason = (path: string): string =>
  i18n._({ id: "the spex repository of {path} is missing on this device",
    comment: "Repair row: a working folder is paired with a spex repository whose clone is gone", values: { path } });

export class Store {
  /** The home this store serves. */
  readonly dir: string;
  private readonly scratch: boolean;
  private readonly env: NodeJS.ProcessEnv;
  private readonly options: StoreOptions;
  private leaseDir?: string;
  private leaseToken = "";
  private migrationPending = false;
  /** Whether this open seeded the starter into your own group's clone. */
  seededConfig = false;

  private meta: StoreMeta = { version: META_VERSION };
  private homeFile!: Home;
  private homeProblem?: StorageDiagnostic;
  private readonly repositories = new Map<string, SpexRepository>();
  private readonly projects = new Map<string, ProjectInfo>();
  private readonly prefs = new Map<string, unknown>();
  private readonly forgeCache = new Map<string, { at: number; state: ForgeState }>();
  private readonly intents = new Map<string, IntentInfo>();
  private readonly intentProblems = new Map<string, StorageDiagnostic>();
  private readonly projectFileProblems = new Map<string, StorageDiagnostic>();
  private readonly sessionProblems = new Map<string, StorageDiagnostic>();
  private readonly untrackedSessions = new Set<string>();
  private readonly localSessions = new Set<string>();
  /** Which spex repository holds each session (storage-6). */
  private readonly sessionLocations = new Map<string, string>();
  private prefsProblem?: StorageDiagnostic;
  private cacheProblem?: StorageDiagnostic;
  private readonly sessions = new Map<string, SessionMeta>();
  private readonly records = new Map<string, StoredRecord[]>();
  private readonly turns = new Map<string, Map<number, TurnRow>>();
  private readonly usage = new Map<string, UsageEntry[]>();

  constructor(options: StoreOptions = {}) {
    this.options = options;
    this.env = options.env ?? process.env;
    this.scratch = !options.dir;
    this.dir = resolve(options.dir ?? mkdtempSync(join(tmpdir(), "spex-memory-home-")));
    mkdirSync(this.dir, { recursive: true });
    this.acquireRootLease();
    try {
      this.meta = existsSync(this.metaFile()) ? readJsonFile(this.metaFile()) as StoreMeta : { version: 0 };
      if (!this.meta || typeof this.meta !== "object" || Array.isArray(this.meta) || ![0, META_VERSION].includes(this.meta.version) || Object.keys(this.meta).some((key) => !["version", "importedLegacy"].includes(key)) ||
          (this.meta.importedLegacy !== undefined && (!Array.isArray(this.meta.importedLegacy) || !this.meta.importedLegacy.every((value) => typeof value === "string")))) {
        throw new StorageFormatError(this.metaFile(), i18n._({
          id: "unsupported migration metadata; original bytes preserved",
          comment: "Storage diagnostic: the state root's own metadata file cannot be read",
        }));
      }
      // A legacy store imports into the former layout, which the groups
      // migration then carries into spex repositories (storage-9).
      const imported = this.importLegacy(options.legacyDbPath);
      this.meta.version = META_VERSION;
      writeAtomic(this.metaFile(), JSON.stringify(this.meta));
      if (imported || needsGroupsMigration(this.dir)) {
        // English, deliberately: a caller's programming failure.
        if (!options.deferMigration) throw new Error(`${this.dir} holds the former layout; open it with Store.open to migrate`);
        this.migrationPending = true;
        return;
      }
      this.openHome();
    } catch (error) {
      this.releaseRootLease();
      if (this.scratch) rmSync(this.dir, { recursive: true, force: true });
      throw error;
    }
  }

  /** Open a home, migrating the former layout once under the home lease
   * before any writer is admitted (storage-9, core-service-15). */
  static async open(options: StoreOptions = {}): Promise<Store> {
    const store = new Store({ ...options, deferMigration: true });
    if (store.migrationPending) {
      try {
        await migrateFormerHome(store.dir, {
          env: store.env,
          ...(options.own ? { own: options.own } : {}),
          libraryDir: options.libraryDir ?? join(store.dir, "playbooks"),
          ...(options.prepareRepository ? { prepareRepository: options.prepareRepository } : {}),
        });
        store.migrationPending = false;
        store.openHome();
      } catch (error) {
        store.close();
        throw error;
      }
    }
    return store;
  }

  // -- root lease (CORE-61) -------------------------------------------------

  /** The lock's owner file, or undefined when absent or unparsable —
   * the lease paths must classify damage, never crash on it. */
  private readLeaseOwner(
    lock: string,
  ): { pid: number; hostname: string; acquiredAt: number; token?: string } | undefined {
    try {
      return readJson(join(lock, "owner.json"));
    } catch {
      return undefined;
    }
  }

  private acquireRootLease(): void {
    const dir = this.dir;
    const lock = join(dir, ".lease");
    this.leaseToken = randomUUID();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Stage-then-rename: the lease is published atomically with its
      // owner file inside, so a reader never sees an ownerless lease.
      const stage = join(dir, `.lease.stage.${this.leaseToken}`);
      try {
        mkdirSync(stage);
        writeFileSync(
          join(stage, "owner.json"),
          JSON.stringify({
            pid: process.pid,
            hostname: hostname(),
            acquiredAt: Date.now(),
            token: this.leaseToken,
          }),
        );
        renameSync(stage, lock);
        this.leaseDir = lock;
        // A core of the former layout holds `.lock`: while it lives, it
        // is the writer, and this one refuses (storage-9).
        const former = this.readLeaseOwner(join(dir, ".lock"));
        if (former && (former.hostname !== hostname() || processAlive(former.pid))) {
          this.releaseRootLease();
          throw new StateRootHeldError(former, dir);
        }
        return;
      } catch (error) {
        if (error instanceof StateRootHeldError) throw error;
        rmSync(stage, { recursive: true, force: true });
        const owner = this.readLeaseOwner(lock);
        if (!owner) {
          // A published lease always carries its owner; an unreadable
          // one is fail-closed — deleting it is the operator's call.
          throw new Error(
            i18n._({
              id: "state root {dir} holds an unreadable lock at {lock}; delete it if no other Spex core is running (DR-036)",
              comment:
                "Startup refusal the shell shows in a dialog; the paths and the decision's id stay as they are",
              values: { dir, lock },
            }),
          );
        }
        // A foreign host's lease is never broken (DR-036): liveness
        // cannot be probed across machines.
        if (owner.hostname !== hostname()) throw new StateRootHeldError(owner, dir);
        if (processAlive(owner.pid)) throw new StateRootHeldError(owner, dir);
        // Same host, dead pid: retire by rename-aside, which only one
        // contender can win — the loser just loops and re-reads.
        const retired = join(dir, `.lease.retired.${owner.token ?? randomUUID()}`);
        try {
          renameSync(lock, retired);
          rmSync(retired, { recursive: true, force: true });
        } catch {
          // Another contender retired it first.
        }
      }
    }
    throw new Error(i18n._({
      id: "state root {dir} lease could not be acquired",
      comment: "Startup refusal the shell shows in a dialog",
      values: { dir },
    }));
  }

  private releaseRootLease(): void {
    if (!this.leaseDir) return;
    // Release only a lease this instance still owns: a stale loser
    // must never delete the winner's lease.
    const owner = this.readLeaseOwner(this.leaseDir);
    if (owner?.token === this.leaseToken) {
      rmSync(this.leaseDir, { recursive: true, force: true });
    }
    this.leaseDir = undefined;
  }

  // -- the home (storage-2) -------------------------------------------------

  private metaFile(): string {
    return join(this.dir, "meta.json");
  }

  /** The home file this store serves. */
  get home(): Home { return this.homeFile; }

  /** Read or create `home.yaml`, make sure your own group's spex
   * repository stands, and index every clone under `workspace/`. */
  private openHome(): void {
    if (Home.exists(this.dir)) {
      try { this.homeFile = Home.load(this.dir); }
      catch (error) {
        if (!(error instanceof StorageFormatError)) throw error;
        // Startup stays available on a damaged home file; every write
        // that needs it refuses with its cause (storage-12).
        this.homeProblem = { file: error.file, reason: error.reason, blocking: true };
        this.homeFile = Home.create(this.dir, { ...(this.options.own ? { own: this.options.own } : {}), env: this.env });
      }
    } else {
      this.homeFile = Home.create(this.dir, { ...(this.options.own ? { own: this.options.own } : {}), env: this.env });
      this.homeFile.save();
    }
    mkdirSync(join(this.dir, "local"), { recursive: true, mode: 0o700 });
    this.ensureOwnRepository();
    this.discoverRepositories();
    this.loadApplication();
  }

  /** Your own group's clone always stands, its config seeded from the
   * starter and its `spex` branch begun with one commit (storage-6). */
  private ensureOwnRepository(): void {
    const dir = this.homeFile.clonePath(this.homeFile.own());
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const config = join(dir, "config", "playbook.config.yaml");
    // A config at a former location moves in first, so the starter
    // never shadows it (core-service-66).
    this.options.relocateConfig?.(config);
    // The starter is the playbook CLI's own (core-service-3); where it
    // cannot be read, the core reports the missing config itself.
    try { this.seededConfig = seedConfig(config); } catch { /* reported as a missing config */ }
    this.prepareRepository(dir, this.homeFile.own());
    this.initializeRepository(dir);
  }

  /** The caller's filling of a clone; its failure leaves the clone as
   * it is, reported, never failing the open. */
  private prepareRepository(dir: string, key: string): void {
    try { this.options.prepareRepository?.(dir, key, this.homeFile.host.url); }
    catch (error) { console.error(`spex: ${key} was not prepared: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /** Called before a project's pair is forgotten, with its working
   * folder: what exports wrote there is removed (environments-8). */
  onProjectRemoving?: (key: string, folder: string | undefined) => void;

  /** A clone becomes a repository on its `spex` branch with one commit;
   * where Git cannot run, it stays a plain folder until it can. */
  private initializeRepository(dir: string): void {
    try { initializeClone(dir, { env: this.env }); }
    catch (error) { console.error(`spex: ${dir} is not a repository yet: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /** Every clone under `workspace/`: a folder named `<name>-spex` inside
   * plain group folders mirroring the Git host (storage-1). */
  private discoverRepositories(): void {
    const found = new Map<string, string>();
    const walk = (dir: string, depth: number): void => {
      if (depth > 8 || !existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const path = join(dir, entry.name);
        const key = this.homeFile.keyOf(path);
        if (key) found.set(key, path);
        else walk(path, depth + 1);
      }
    };
    walk(this.homeFile.workspace, 0);
    for (const key of [...this.repositories.keys()]) if (!found.has(key)) this.repositories.delete(key);
    for (const [key, dir] of found) {
      if (this.repositories.has(key)) continue;
      const repository = spexRepository(key, dir);
      // Sessions are private, and Playbook's store refuses a sessions
      // directory that is not 0700.
      mkdirSync(repository.sessionsDir, { recursive: true, mode: 0o700 });
      this.repositories.set(key, repository);
    }
    this.refreshProjects();
  }

  private refreshProjects(): void {
    this.projects.clear();
    for (const folder of this.homeFile.folders()) {
      const repository = this.repositories.get(folder.repository);
      if (!repository) continue;
      this.projects.set(folder.repository, this.projectInfo(repository, folder.path));
    }
  }

  private readProjectFile(repository: SpexRepository): ProjectFile | undefined {
    if (!existsSync(repository.projectFile)) return undefined;
    try {
      const file = parseProjectFile(readJsonFile(repository.projectFile), repository.projectFile);
      this.projectFileProblems.delete(repository.key);
      return file;
    } catch (error) {
      if (!(error instanceof StorageFormatError)) throw error;
      this.projectFileProblems.set(repository.key, { file: error.file, reason: error.reason, blocking: false });
      return undefined;
    }
  }

  private projectInfo(repository: SpexRepository, path: string): ProjectInfo {
    const { group, name } = splitKey(repository.key);
    let registeredAt = 0;
    try { const stat = statSync(repository.dir); registeredAt = Math.round(stat.birthtimeMs || stat.ctimeMs); } catch { registeredAt = 0; }
    return {
      id: repository.key,
      path,
      name: this.readProjectFile(repository)?.name ?? (repository.key === this.homeFile.own() ? this.homeFile.ownName : basename(path)),
      registeredAt,
      repository: { key: repository.key, name, group, own: group === this.homeFile.ownName },
    };
  }

  /** Every clone this home holds. */
  listRepositories(): SpexRepository[] {
    return [...this.repositories.values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  repository(key: string): SpexRepository | undefined { return this.repositories.get(key); }

  /** Your own group's spex repository. */
  ownRepository(): SpexRepository {
    const own = this.repositories.get(this.homeFile.own());
    if (!own) {
      const dir = this.homeFile.clonePath(this.homeFile.own());
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      this.discoverRepositories();
    }
    return this.repositories.get(this.homeFile.own()) as SpexRepository;
  }

  private requireRepository(key: string): SpexRepository {
    const repository = this.repositories.get(key);
    if (!repository) throw new StorageFormatError(join("workspace", key), i18n._({ id: "no spex repository {key} on this device",
      comment: "Refusal: the key names no clone under workspace/", values: { key } }));
    return repository;
  }

  private saveHome(): void {
    if (this.homeProblem) throw new StorageFormatError(this.homeProblem.file, this.homeProblem.reason);
    this.homeFile.save();
  }

  private savePrefs(): void {
    if (this.prefsProblem) return;
    writeAtomic(
      prefsFileOf(this.dir),
      JSON.stringify({ format: 1, prefs: Object.fromEntries(this.prefs) }),
    );
  }

  private saveForgeCache(): void {
    writeAtomic(
      forgeCacheFileOf(this.dir),
      JSON.stringify({ format: 1, entries: Object.fromEntries(this.forgeCache) }),
    );
    this.cacheProblem = undefined;
  }

  // -- load (the restart fold, CORE-10/52) ----------------------------------

  /**
   * Re-read every application file from disk (space-20): an in-app sync
   * replaced intents, preferences or project files under this running
   * store, so the indexes rebuild from the same loaders the restart fold
   * uses; sessions re-index through their own rescan.
   */
  reload(): void {
    this.prefs.clear();
    this.prefsProblem = undefined;
    this.forgeCache.clear();
    this.cacheProblem = undefined;
    this.intents.clear();
    this.intentProblems.clear();
    this.discoverRepositories();
    this.loadApplication();
  }

  private loadApplication(): void {
    const prefsFile = prefsFileOf(this.dir);
    try {
      for (const [key, value] of Object.entries(existsSync(prefsFile) ? parsePrefs(readJsonFile(prefsFile), prefsFile) : {})) this.prefs.set(key, value);
    } catch (error) {
      if (!(error instanceof StorageFormatError)) throw error;
      this.prefsProblem = {file:error.file, reason:error.reason, blocking:true};
    }
    const cacheFile = forgeCacheFileOf(this.dir);
    try {
      for (const [projectId, entry] of Object.entries(
        readJson<{ entries: Record<string, { at: number; state: ForgeState }> }>(cacheFile)?.entries ?? {},
      )) this.forgeCache.set(projectId, entry);
    } catch (error) {
      this.cacheProblem = {file:cacheFile, reason:i18n._({
        id: "Unreadable cache; refresh to rebuild: {cause}",
        comment: "Storage diagnostic; `cause` is the read failure's own words",
        values: { cause: String(error) },
      }), blocking:false};
    }
    for (const repository of this.repositories.values()) this.loadIntents(repository);
  }

  /** One clone's intents: every readable file, and a diagnostic per file
   * that will not read, its intent listed nowhere (storage-4). */
  private loadIntents(repository: SpexRepository): void {
    for (const [id, intent] of [...this.intents]) if (intent.projectId === repository.key) this.intents.delete(id);
    for (const [file] of [...this.intentProblems]) if (file.startsWith(`${repository.intentsDir}/`)) this.intentProblems.delete(file);
    const { intents, problems } = readIntentFiles(repository.intentsDir);
    for (const problem of problems) this.intentProblems.set(problem.file, problem);
    for (const file of intents) {
      if (this.intents.has(file.id)) {
        const path = join(repository.intentsDir, `${file.id}.json`);
        this.intentProblems.set(path, { file: path, reason: i18n._({
          id: "duplicate queue {intentId}",
          comment: "Storage diagnostic: two acts queue the same intent",
          values: { intentId: file.id },
        }), blocking: false });
        continue;
      }
      this.intents.set(file.id, intentInfoOf(file, repository.key));
    }
  }

  // -- sessions, one shared store per clone (storage-14) --------------------

  /** Your own group's session store: where the XDG import lands
   * (storage-18) and what a session-less caller reads. */
  sessionStore(key = this.homeFile.own()): SharedSessionStore {
    return (this.repositories.get(key) ?? this.ownRepository()).store;
  }

  /** The session store of the clone holding a session. */
  sessionStoreFor(sessionId: string): SharedSessionStore {
    const key = this.sessionLocations.get(sessionId);
    return this.sessionStore(key);
  }

  /** The key of the spex repository holding a session. */
  sessionRepository(sessionId: string): string | undefined {
    return this.sessionLocations.get(sessionId);
  }

  /** Migrate each clone's legacy session files through Playbook and
   * index every session (core-service-60). */
  async initializeSessions(): Promise<void> {
    for (const repository of this.repositories.values()) {
      const shared = repository.store;
      await shared.prepare();
      const sessionsDir = repository.sessionsDir;
      const cwd = this.homeFile.folderOf(repository.key)?.path;
      for (const filename of readdirSync(sessionsDir)) {
        const sidecar = filename.endsWith(".spex.json");
        if (!sidecar && !/^[0-9a-f-]{36}\.json$/.test(filename)) continue;
        const id = filename.slice(0, -(sidecar ? ".spex.json" : ".json").length);
        const sourcePath = join(sessionsDir, filename);
        try {
          const source = readJson<Record<string, unknown>>(sourcePath);
          if (!source || (!sidecar && source.schemaVersion === 7)) continue;
          if (sidecar) this.loadSidecar(repository, id, source);
          await shared.migrate(id, { sourcePath, ...(cwd ? { cwd } : {}) });
        } catch (error) {
          this.sessionLocations.set(id, repository.key);
          this.untrackedSessions.add(id);
          this.sessionProblems.set(id, {file:sourcePath, reason:String(error), blocking:false});
        }
      }
    }
    await this.adoptForeignSessions();
  }

  /** A legacy import's staged session, read before Playbook converts it. */
  private loadSidecar(repository: SpexRepository, id: string, source: Record<string, unknown>): void {
    const meta = source as unknown as SessionMeta;
    if (meta.id !== id || !Array.isArray(meta.players) || !Array.isArray(meta.initialVisible)) return;
    this.sessionLocations.set(id, repository.key);
    this.sessions.set(id, { ...meta, projectId: repository.key, live: false });
    const { records: stored, incompleteAfterSeq } = readRecordsPrefix(join(repository.sessionsDir, `${id}.records.jsonl`), true);
    const loaded = this.sessions.get(id)!;
    if (incompleteAfterSeq !== undefined) loaded.streamIncompleteAfterSeq = Math.min(loaded.streamIncompleteAfterSeq ?? incompleteAfterSeq, incompleteAfterSeq);
    this.records.set(id, stored);
    for (const entry of stored) this.foldRecord(id, entry.record);
  }

  /**
   * Adopt every session another host wrote into a clone's shared session
   * store (core-service-60): a session is its clone's project's, whatever
   * its working directory (storage-6). Foreign sessions refresh from the
   * readable prefix; sessions this core owns are never replaced. Returns
   * changes only, with new records to stream where the prior history is
   * a prefix.
   */
  async adoptForeignSessions(key?: string): Promise<{ id: string; appended: StoredRecord[]; replaced?: boolean; unlistedProjectId?: string }[]> {
    const changed: { id: string; appended: StoredRecord[]; replaced?: boolean; unlistedProjectId?: string }[] = [];
    for (const repository of key ? [this.requireRepository(key)] : this.repositories.values()) {
      if (!existsSync(repository.sessionsDir)) continue;
      for (const filename of readdirSync(repository.sessionsDir)) {
        if (!/^[0-9a-f-]{36}\.json$/.test(filename)) continue;
        const id = filename.slice(0, -5);
        if (this.localSessions.has(id) || this.sessions.get(id)?.live) continue;
        this.sessionLocations.set(id, repository.key);
        const update = await this.refreshSession(id, false);
        if (update) changed.push(update);
      }
    }
    return changed;
  }

  async refreshSession(id: string, live?: boolean): Promise<{ id: string; appended: StoredRecord[]; replaced?: boolean; unlistedProjectId?: string } | undefined> {
    if (live === false && this.localSessions.has(id)) return;
    const key = this.sessionLocations.get(id) ?? this.homeFile.own();
    const repository = this.repositories.get(key);
    if (!repository) return;
    const shared = repository.store;
    let manifest: SessionManifest;
    let stored: StoredRecord[];
    let continuable = false;
    let reason: string | undefined;
    // The core's own reason is kept as a fact and phrased when read.
    let recoveryReason = false;
    let incompleteAfterSeq: number | undefined;
    let problem: StorageDiagnostic | undefined;
    try {
      const checked = await shared.validate(id);
      if (live === false && this.localSessions.has(id)) return;
      manifest = checked.manifest as SessionManifest;
      if (manifest.schemaVersion === 7 && !checked.integrityValid) problem = {file:join(shared.sessionsDir, `${id}.json`), reason:checked.reasons.join(
        i18n._({ id: "; ", comment: "Separates reasons listed in one message" }),
      ) || i18n._({
        id: "session checkpoint and replay disagree",
        comment: "Session diagnostic: the stored checkpoint and its replay do not match",
      }), blocking:true};
      stored = checked.history.entries.map(({ v: _v, ...entry }) => entry as unknown as StoredRecord);
      // Continuation follows Playbook's own validation (core-service-73,
      // DR-074): unresolved effects are evidence a restored session
      // fences, never a refusal of the core's own invention.
      continuable = manifest.schemaVersion === 7 && checked.resumable && manifest.state === "settled";
      reason = checked.reasons.join(
        i18n._({ id: "; ", comment: "Separates reasons listed in one message" }),
      ) || undefined;
      recoveryReason = reason === undefined && manifest.state === "uncertain";
      if (checked.history.incomplete || checked.history.pendingTail || (manifest.schemaVersion === 7 && manifest.replay.incomplete)) {
        incompleteAfterSeq = Math.min(checked.history.lastReadableSeq, manifest.schemaVersion === 7 ? manifest.replay.seq : checked.history.lastReadableSeq);
      }
    } catch (error) {
      if (live === false && this.localSessions.has(id)) return;
      reason = error instanceof Error ? error.message : String(error);
      this.untrackedSessions.add(id);
      problem = {file:join(shared.sessionsDir, `${id}.json`), reason, blocking: !/unsupported.*version|version.*unsupported/i.test(reason)};
      this.sessionProblems.set(id, problem);
      // Unknown versions remain opaque and readable; these fields only
      // associate history, never authorize recovery or rewrite the file.
      let raw: Record<string, unknown> | undefined;
      try { raw = readJson<Record<string, unknown>>(join(shared.sessionsDir, `${id}.json`)); } catch { return; }
      if (!raw || raw.sessionId !== id || typeof raw.cwd !== "string") return;
      manifest = raw as unknown as SessionManifest;
      try {
        const history = await shared.readHistory(id);
        stored = history.entries.map(({ v: _v, ...entry }) => entry as unknown as StoredRecord);
        if (history.incomplete) incompleteAfterSeq = history.lastReadableSeq;
      } catch { return; }
    }
    if (live === false && this.localSessions.has(id)) return;
    if (manifest.schemaVersion === 7 && !problem) this.untrackedSessions.delete(id);
    if (typeof manifest.cwd !== "string") {
      this.sessionProblems.set(id, {file:join(shared.sessionsDir, `${id}.json`),reason:i18n._({
        id: "session working directory is missing or invalid",
        comment: "Session diagnostic: the session names no readable project folder",
      }),blocking:manifest.schemaVersion === 7});
      return;
    }
    let players: SessionInfo["players"] = [];
    let initialVisible: string[] = [];
    let hasContext = false;
    for (const entry of stored) {
      if ((entry.record as {type?: unknown}).type !== "session_context") continue;
      try {
        const context = validateSessionContext(entry.record);
        hasContext = true;
        players = context.configuration.players.map((player) => ({
          id: player.id as string, adapter: player.adapter as SessionInfo["players"][number]["adapter"],
          ...(player.model?.kind === "value" ? { model: player.model.value as string } : {}),
          ...(typeof player.fastMode === "boolean" ? { fastMode: player.fastMode } : {}),
        }));
        initialVisible = [...context.initialVisible];
      } catch { /* Unsupported context does not invalidate other history. */ }
    }
    if (!hasContext) {
      const ids = new Set(stored.filter(({record}) => hasPresentationHeader(record) && ["player_prompt", "player_event", "player_finished"].includes(record.type)).map(({record}) => (record as {playerId?: unknown}).playerId).filter((value): value is string => typeof value === "string"));
      players = [...ids].map((id) => ({ id })) as SessionInfo["players"];
      initialVisible = [...ids];
    }
    const prior = this.sessions.get(id);
    const writer = live || this.managedSessions.has(id) ? "idle" : await shared.readLeaseState(id);
    if (live === false && this.localSessions.has(id)) return;
    const meta: SessionMeta = {
      id, projectId: repository.key, cwd: manifest.cwd,
      createdAt: Date.parse(manifest.createdAt) || stored.find(({record}) => hasPresentationHeader(record))?.record.timestamp || 0,
      endedAt: live ? null : Date.parse(manifest.updatedAt) || stored.reduce((last, entry) => Math.max(last, Number(entry.record.timestamp) || 0), 0),
      live: live ?? prior?.live ?? false,
      ...(writer !== "idle" ? {externalWriter: writer} : {}),
      players, initialVisible, originDir: shared.sessionsDir,
      ...(continuable ? { continuable: true } : {}),
      ...(reason ? { continuationReason: reason } : recoveryReason ? { continuationRecovery: true } : {}),
      ...(manifest.state === "uncertain" && manifest.uncertain
        ? { recovery: {state: "uncertain", input: manifest.uncertain.input, discardable: discardable(manifest)} as const } : {}),
      ...(incompleteAfterSeq !== undefined ? { streamIncompleteAfterSeq: incompleteAfterSeq } : {}),
    };
    if (problem) this.sessionProblems.set(id, problem);
    else this.sessionProblems.delete(id);
    const previous = this.records.get(id) ?? [];
    const prefix = previous.every((entry,index) => isDeepStrictEqual(entry, stored[index]));
    if (prefix && previous.length === stored.length && JSON.stringify(prior) === JSON.stringify(meta)) return;
    if (!prefix && this.prefs.delete(`viewed:${id}`)) this.savePrefs();
    this.sessions.set(id, meta);
    this.records.set(id, stored);
    this.turns.delete(id);
    this.usage.delete(id);
    for (const entry of stored) this.foldRecord(id, entry.record);
    return { id, appended: prefix ? stored.slice(previous.length) : [], ...(!prefix && prior ? {replaced:true} : {}) };
  }

  /** Admission revalidates ownership without consuming foreign replay that
   * the service's scanner still owes its subscribers (core-service-73). */
  async refreshSessionOwnership(id: string): Promise<void> {
    if (this.localSessions.has(id) || this.managedSessions.has(id)) return;
    const writer = await this.sessionStoreFor(id).readLeaseState(id);
    const current = this.sessions.get(id);
    if (!current || current.live || this.localSessions.has(id) || this.managedSessions.has(id)) return;
    const { externalWriter: _priorWriter, ...unchanged } = current;
    this.sessions.set(id, { ...unchanged, ...(writer === "idle" ? {} : { externalWriter: writer }) });
  }

  sessionDiagnostics(): { file: string; reason: string; blocking: boolean }[] {
    return [...this.sessionProblems.values()];
  }

  /** The session files of one clone Playbook has yet to accept, relative
   * to the clone, so its rules keep them out of Git (storage-17). */
  untrackedSessionPaths(key: string): string[] {
    const repository = this.repositories.get(key);
    if (!repository) return [];
    const directory = relative(repository.dir, repository.sessionsDir);
    if (directory.startsWith("..") || isAbsolute(directory)) return [];
    return [...this.untrackedSessions]
      .filter((id) => this.sessionLocations.get(id) === key)
      .flatMap((id) => [join(directory, `${id}.json`), join(directory, `${id}.records.jsonl`)]);
  }

  /** Reserve local admission before any asynchronous host/scan work; a
   * new session names the clone it is written into. */
  setLocalSession(id: string, owned: boolean, key?: string): void {
    if (key) this.sessionLocations.set(id, key);
    if (owned) this.localSessions.add(id); else this.localSessions.delete(id);
  }

  /** The sessions whose management lease this core itself holds for a
   * sync's Apply through Refresh (space-31): its own lease is not an
   * external writer when the refresh rescans them. */
  setManagedSessions(ids: ReadonlySet<string> | undefined): void {
    this.managedSessions = ids ?? new Set();
  }
  private managedSessions: ReadonlySet<string> = new Set();

  assertProjectsWritable(): void {
    if (this.homeProblem) throw new StorageFormatError(this.homeProblem.file, this.homeProblem.reason);
  }

  /** Whether the ledger's own acts can be written for this project
   * (dashboard-54): a verdict closing an intent goes through
   * assertWritable, and a viewed marker through the preferences file,
   * so a blocking problem in either refuses every answer a summons
   * could have. */
  ledgerActable(projectId: string): boolean {
    if (this.prefsProblem) return false;
    try {
      this.assertWritable({ projectId });
      return true;
    } catch {
      return false;
    }
  }

  assertWritable(scope: {projectId: string; sessionId?: never} | {projectId?: never; sessionId: string}): void {
    this.assertProjectsWritable();
    const sessionProblem = scope.sessionId ? this.sessionProblems.get(scope.sessionId) : undefined;
    if (sessionProblem?.blocking) throw new StorageFormatError(sessionProblem.file, sessionProblem.reason);
  }

  /**
   * Forget every foreign session whose record left its clone's shared
   * session store while this core runs (core-service-76): the CLI's own
   * removal, or a deletion from elsewhere. Returns what was dropped,
   * with its project so the removal can be announced.
   */
  forgetVanishedForeignSessions(): { id: string; projectId: string }[] {
    const gone: { id: string; projectId: string }[] = [];
    for (const meta of [...this.sessions.values()]) {
      if (meta.live || !meta.originDir) continue;
      if (existsSync(join(meta.originDir, `${meta.id}.json`))) continue;
      this.dropSession(meta.id);
      gone.push({ id: meta.id, projectId: meta.projectId });
    }
    return gone;
  }

  foldStoredRecord(sessionId: string, record: TmuxPlayRecord): void { this.foldRecord(sessionId, record); }

  private foldRecord(sessionId: string, record: TmuxPlayRecord): void {
    this.applyRecordFold(sessionId, foldTurnEvent(record), foldUsage(sessionId, record));
  }

  private applyRecordFold(sessionId: string, turnEvent: TurnEvent | undefined, usage: UsageEntry | undefined): void {
    if (turnEvent) {
      if (turnEvent.kind === "start") {
        this.startTurnInMemory(sessionId, turnEvent.turnId, turnEvent.prompt, turnEvent.at, turnEvent.attachmentTitle);
      } else {
        this.endTurnInMemory(sessionId, turnEvent.turnId, turnEvent.status, turnEvent.at);
      }
    }
    if (usage) this.usageOf(sessionId).push(usage);
  }

  // -- legacy import (CORE-64) ----------------------------------------------

  /** Whether rows were imported into the former layout, which the
   * migration then carries into the groups layout. */
  private importLegacy(legacyDbPath: string | undefined): boolean {
    if (!legacyDbPath || !existsSync(legacyDbPath)) return false;
    if (this.meta.importedLegacy?.includes(legacyDbPath)) {
      // This root imported it before the file carried a mark: stamp
      // it now, so a root created later on this machine skips it.
      this.markLegacyImported(legacyDbPath);
      return false;
    }
    // The file's own mark is what a brand-new root reads: another root
    // on this machine already took these rows, and the old app that
    // wrote them never runs again.
    if (existsSync(legacyImportMarker(legacyDbPath))) return false;
    try {
      this.runLegacyImport(legacyDbPath);
      this.meta.importedLegacy = [
        ...(this.meta.importedLegacy ?? []),
        legacyDbPath,
      ];
      this.markLegacyImported(legacyDbPath);
      return true;
    } catch (error) {
      // An unreadable legacy store must not brick every startup: the
      // import stays unmarked (a repaired file imports on a later
      // start), the failure is reported, and serving proceeds. Every
      // write in the import is idempotent, so a retry re-clobbers
      // nothing.
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `spex: legacy store ${legacyDbPath} could not be imported (${message}); ` +
          "continuing without it",
      );
      return false;
    }
  }

  /** Marks the legacy file imported beside itself. A mark that cannot
   * be written (a read-only directory) is reported and leaves this
   * root's own record standing, so this root never re-imports. */
  private markLegacyImported(legacyDbPath: string): void {
    const marker = legacyImportMarker(legacyDbPath);
    if (existsSync(marker)) return;
    try {
      writeAtomic(marker, `${JSON.stringify({ v: 1, importedAt: Date.now(), root: this.dir })}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `spex: legacy store ${legacyDbPath} was imported but could not be marked (${message}); ` +
          "a state root created later will import it again",
      );
    }
  }

  /** The legacy rows, written in the former layout the groups migration
   * then carries into spex repositories (storage-9). */
  private runLegacyImport(legacyDbPath: string): void {
    // better-sqlite3's only remaining use: reading the store a
    // pre-DR-036 release left behind, which stays in place untouched.
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3") as new (
      path: string,
      options?: { readonly?: boolean },
    ) => {
      prepare(sql: string): { all(...args: unknown[]): Record<string, unknown>[] };
      close(): void;
    };
    const db = new Database(legacyDbPath, { readonly: true });
    try {
      const rows = (sql: string): Record<string, unknown>[] => {
        try {
          return db.prepare(sql).all();
        } catch {
          // A table an older release never created imports as empty.
          return [];
        }
      };
      const dir = this.dir;
      // The import merges into whatever the root already holds — a
      // second shell's legacy store must never clobber the first's
      // imported state or anything written since.
      const registryFile = join(dir, "projects.json");
      const pathsFile = join(dir, "local", "project-paths.json");
      const current = readJson<{ v: number; projects: { id: string; name: string; registeredAt: number; path?: string }[] }>(registryFile);
      if (current && current.v !== 1 && current.v !== 2) throw new StorageFormatError("projects.json", i18n._({
        id: "unsupported registry version",
        comment: "Storage diagnostic: the project registry was written by a later Spex",
      }));
      const projects = [...(current?.projects ?? [])];
      const bindings = current?.v === 2
        ? [...(readJson<{ v: 1; bindings: { id: string; path: string; aliases: string[] }[] }>(pathsFile)?.bindings ?? [])]
        : [];
      const takenIds = new Set(projects.map((project) => project.id));
      const takenPaths = new Set([...projects.map((project) => project.path), ...bindings.map((binding) => binding.path)].filter(Boolean));
      for (const row of rows("SELECT id, path, name, registered_at FROM projects")) {
        if (takenIds.has(row.id as string) || takenPaths.has(row.path as string)) continue;
        if (current?.v === 2) {
          projects.push({ id: row.id as string, name: row.name as string, registeredAt: row.registered_at as number });
          bindings.push({ id: row.id as string, path: row.path as string, aliases: [] });
        } else {
          projects.push({ id: row.id as string, path: row.path as string, name: row.name as string, registeredAt: row.registered_at as number });
        }
        takenIds.add(row.id as string); takenPaths.add(row.path as string);
      }
      if (current?.v === 2) {
        mkdirSync(join(dir, "local"), { recursive: true, mode: 0o700 });
        writeAtomic(pathsFile, JSON.stringify({ v: 1, bindings }));
        writeAtomic(registryFile, JSON.stringify({ v: 2, projects }));
      } else if (projects.length > 0) {
        writeAtomic(registryFile, JSON.stringify({ v: 1, projects }));
      }
      const prefs: Record<string, unknown> = {};
      for (const row of rows("SELECT key, value_json FROM prefs")) {
        prefs[row.key as string] = JSON.parse(row.value_json as string);
      }
      // Existing preferences win over imported ones: they are newer.
      Object.assign(
        prefs,
        readJson<{ prefs: Record<string, unknown> }>(join(dir, "prefs.json"))
          ?.prefs ?? {},
      );
      writeAtomic(
        join(dir, "prefs.json"),
        JSON.stringify({ v: 1, prefs }),
      );
      mkdirSync(join(dir, "intents"), { recursive: true });
      for (const row of rows("SELECT * FROM intents ORDER BY created_at, id")) {
        const source: IntentSource | undefined =
          row.source_kind != null && row.source_ref != null
            ? {
                kind: row.source_kind as IntentSource["kind"],
                ref: row.source_ref as string,
                ...(row.source_url != null ? { url: row.source_url as string } : {}),
              }
            : undefined;
        const intent = {
          id: row.id as string,
          projectId: row.project_id as string,
          text: row.text as string,
          ...(source ? { source } : {}),
          rank: row.rank as string,
          ...(row.after_id != null ? { afterId: row.after_id as string } : {}),
          createdAt: row.created_at as number,
          ...(row.dispatched_session_id != null && row.dispatched_turn_id != null
            ? {
                dispatched: {
                  sessionId: row.dispatched_session_id as string,
                  turnId: row.dispatched_turn_id as number,
                  at: row.dispatched_at as number,
                },
              }
            : {}),
          ...(row.closed_at != null ? { closedAt: row.closed_at as number } : {}),
          ...(row.closed_as != null
            ? { closedAs: row.closed_as as "done" | "dropped" }
            : {}),
        };
        const log = join(dir, "intents", `${intent.projectId}.jsonl`);
        const existing = existsSync(log) ? readFileSync(log, "utf8") : "";
        if (existing.split("\n").some((line) => line.includes(`"id":"${intent.id}"`) && line.includes(`"act":"queue"`))) continue;
        appendFileSync(log, `${JSON.stringify({ v: 1, act: "queue", intent })}\n`);
      }
      const sessionsDir = join(dir, "sessions");
      mkdirSync(sessionsDir, { recursive: true, mode: 0o700 });
      for (const row of rows(
        "SELECT id, project_id, created_at, ended_at, players_json, initial_visible_json FROM sessions",
      )) {
        // A session the root already holds is never overwritten: the
        // file state is newer than any legacy copy of it.
        if (existsSync(join(sessionsDir, `${row.id}.spex.json`)) || existsSync(join(sessionsDir, `${row.id}.json`))) continue;
        const meta: SessionMeta = {
          id: row.id as string,
          projectId: row.project_id as string,
          createdAt: row.created_at as number,
          endedAt: (row.ended_at as number | null) ?? null,
          // A session live when the legacy store last closed is not
          // live now (core-service-10).
          live: false,
          players: JSON.parse(row.players_json as string) as SessionInfo["players"],
          initialVisible: JSON.parse(row.initial_visible_json as string) as string[],
        };

        const lines: string[] = [];
        let recordRows: Record<string, unknown>[];
        try {
          recordRows = db
            .prepare("SELECT seq, payload_json, role FROM records WHERE session_id = ? ORDER BY seq")
            .all(meta.id);
        } catch {
          recordRows = db
            .prepare("SELECT seq, payload_json FROM records WHERE session_id = ? ORDER BY seq")
            .all(meta.id);
        }
        for (const rec of recordRows) {
          const stored: StoredRecord = {
            seq: rec.seq as number,
            // Legacy payloads carry resume tokens (results and
            // playbook.trace); the projection strips them on import.
            record: sanitizeRecord(
              JSON.parse(rec.payload_json as string) as TmuxPlayRecord,
            ),
            ...(rec.role != null ? { role: rec.role as string } : {}),
          };
          lines.push(JSON.stringify({ v: 1, ...stored }));
        }
        writeAtomic(join(sessionsDir, `${meta.id}.records.jsonl`), lines.length ? `${lines.join("\n")}\n` : "");
        // Stage legacy metadata for Playbook's conversion, publishing it
        // after the complete replay so interrupted imports can retry.
        writeAtomic(join(sessionsDir, `${meta.id}.spex.json`), JSON.stringify({v:1, ...meta}));
      }
    } finally {
      db.close();
    }
  }

  close(): void {
    this.releaseRootLease();
    if (this.scratch) rmSync(this.dir, { recursive: true, force: true });
  }

  // -- projects (projects-10, storage-6) ------------------------------------

  /** Pair a working folder with a new local spex repository in your own
   * group, or select the pair it already has (storage-6). */
  registerProject(path: string, name: string, _at?: number): ProjectInfo {
    this.assertProjectsWritable();
    const normalized = resolve(path);
    const paired = this.homeFile.keyForFolder(normalized);
    if (paired && this.projects.has(paired)) return this.projects.get(paired)!;
    if (paired) throw new StorageFormatError(Home.file(this.dir), i18n._({ id: "path {path} needs explicit rebinding",
      comment: "Refusal: the folder is recorded for a project already, so Add cannot claim it", values: { path: normalized } }));
    const base = repositoryNameFor(name || basename(normalized)).slice(0, -"-spex".length);
    let key = `${this.homeFile.ownName}/${base}-spex`;
    for (let n = 2; this.repositories.has(key) || existsSync(this.homeFile.clonePath(key)) || this.homeFile.folderOf(key); n += 1) {
      key = `${this.homeFile.ownName}/${base}-${n}-spex`;
    }
    const dir = this.homeFile.clonePath(key);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeApplicationFile(join(dir, "project.json"), { format: 1, name: name || basename(normalized), remote: folderRemote(normalized, this.env) });
    this.prepareRepository(dir, key);
    this.initializeRepository(dir);
    this.homeFile.pair(normalized, key);
    this.saveHome();
    this.discoverRepositories();
    return this.projects.get(key)!;
  }

  /** Pair a folder with an existing clone (storage-22): the supplied
   * aliases replace the list, omitted ones keep it. */
  rebindProject(options: { id: string; path: string; aliases?: string[] }): ProjectInfo {
    this.assertProjectsWritable();
    const repository = this.requireRepository(options.id);
    const normalized = resolve(options.path);
    const other = this.homeFile.keyForFolder(normalized);
    if (other && other !== repository.key) throw new StorageFormatError(Home.file(this.dir), i18n._({ id: "path or alias already belongs to another project",
      comment: "Refusal: another project holds the folder this binding names" }));
    try { this.homeFile.pair(normalized, repository.key, options.aliases); }
    catch (error) {
      if (error instanceof StorageFormatError) throw new StorageFormatError(Home.file(this.dir), i18n._({ id: "path or alias already belongs to another project",
        comment: "Refusal: another project holds the folder this binding names" }));
      throw error;
    }
    this.saveHome();
    this.refreshProjects();
    return this.projects.get(repository.key)!;
  }

  /** The account a sign-in read, written into `home.yaml` (storage-2). */
  signIn(account: { id: string; login: string; displayName: string | null }): void {
    this.assertProjectsWritable();
    this.homeFile.signIn(account);
    this.saveHome();
  }

  /** The credential went; the account stays, marked signed out
   * (git-host-4, git-host-10). */
  signOut(): void {
    if (this.homeProblem) return;
    this.homeFile.signOut();
    this.saveHome();
  }

  /**
   * Clones the caller already moved on disk (space-59, space-60): every
   * pair naming a moved key names its new one in `home.yaml`, your own
   * group's name follows where it was renamed, and the indexes — clones,
   * sessions, intents, the preferences keyed by repository — follow in
   * the same step, so no reader sees a key that names nothing.
   */
  moveRepositories(moves: { from: string; to: string }[], own?: string): void {
    this.assertProjectsWritable();
    if (moves.length === 0 && own === undefined) return;
    this.homeFile.move(moves, own);
    this.saveHome();
    const to = new Map(moves.map((entry) => [entry.from, entry.to]));
    for (const { from } of moves) this.repositories.delete(from);
    this.discoverRepositories();
    for (const [id, location] of [...this.sessionLocations]) {
      const next = to.get(location);
      if (next) this.sessionLocations.set(id, next);
    }
    for (const [id, meta] of [...this.sessions]) {
      const next = to.get(meta.projectId);
      if (!next) continue;
      const repository = this.repositories.get(next);
      this.sessions.set(id, { ...meta, projectId: next, ...(repository && meta.originDir ? { originDir: repository.sessionsDir } : {}) });
    }
    for (const [id, intent] of [...this.intents]) {
      const next = to.get(intent.projectId);
      if (next) this.intents.set(id, { ...intent, projectId: next });
    }
    let prefsChanged = false;
    for (const { from, to: next } of moves) {
      for (const key of this.prefKeys(`sync:${from}:`)) {
        this.prefs.set(`sync:${next}:${key.slice(`sync:${from}:`.length)}`, this.prefs.get(key));
        this.prefs.delete(key);
        prefsChanged = true;
      }
      const cached = this.forgeCache.get(from);
      if (cached) { this.forgeCache.delete(from); this.forgeCache.set(next, cached); }
    }
    if (prefsChanged) this.savePrefs();
    for (const { from } of moves) {
      const gone = `${this.homeFile.clonePath(from)}/`;
      for (const file of [...this.intentProblems.keys()]) if (file.startsWith(gone)) this.intentProblems.delete(file);
    }
    const targets = new Set(moves.map((entry) => entry.to));
    for (const repository of this.repositories.values()) if (targets.has(repository.key)) this.loadIntents(repository);
    this.refreshProjects();
  }

  /** A clone that came under `workspace/` from outside the store — a
   * join's — is indexed with its intents (space-63). */
  adoptRepositories(): void {
    this.discoverRepositories();
    for (const repository of this.repositories.values()) this.loadIntents(repository);
  }

  /** Forget the pair and delete the clone (projects-9, projects-10); the
   * working folder stays as it is. */
  removeProject(key: string): boolean {
    this.assertProjectsWritable();
    const folder = this.homeFile.folderOf(key);
    const repository = this.repositories.get(key);
    if (!folder && !repository) return false;
    try { this.onProjectRemoving?.(key, folder?.path); }
    catch (error) { console.error(`spex: exports of ${key} were not removed: ${error instanceof Error ? error.message : String(error)}`); }
    if (folder) { this.homeFile.unpair(key); this.saveHome(); }
    if (repository && key !== this.homeFile.own()) {
      for (const [id, location] of [...this.sessionLocations]) if (location === key) { this.dropSession(id); this.sessionLocations.delete(id); }
      for (const [id, intent] of [...this.intents]) if (intent.projectId === key) this.intents.delete(id);
      rmSync(repository.dir, { recursive: true, force: true });
      this.repositories.delete(key);
    }
    this.refreshProjects();
    return true;
  }

  storageDiagnostics(): StorageDiagnostic[] {
    const reports: StorageDiagnostic[] = [
      ...(this.homeProblem ? [this.homeProblem] : []),
      ...this.intentProblems.values(),
      ...this.projectFileProblems.values(),
      ...(this.prefsProblem ? [this.prefsProblem] : []),
      ...(this.cacheProblem ? [this.cacheProblem] : []),
    ];
    const paired = new Set(this.homeFile.folders().map((folder) => folder.repository));
    for (const repository of this.repositories.values()) {
      if (paired.has(repository.key)) continue;
      const held = [...this.sessions.values()].filter((meta) => meta.projectId === repository.key);
      // Your own group's clone needs a folder only once it holds sessions.
      if (repository.key === this.homeFile.own() && held.length === 0) continue;
      const directories = [...new Set(held.map((meta) => meta.cwd).filter((cwd): cwd is string => typeof cwd === "string"))].sort();
      const { group, name } = splitKey(repository.key);
      const label = this.readProjectFile(repository)?.name ?? name;
      reports.push({
        file: relative(this.dir, repository.dir),
        reason: unpairedReason(label),
        blocking: false,
        repair: { kind: "repository", repository: repository.key, name, group, directories, sessions: held.length, key: repairKey(repository.key, directories) },
      });
    }
    for (const folder of this.homeFile.folders()) {
      if (this.repositories.has(folder.repository)) continue;
      reports.push({
        file: "home.yaml",
        reason: missingCloneReason(folder.path),
        blocking: false,
        repair: { kind: "folder", repository: folder.repository, directories: [folder.path], sessions: 0, key: repairKey(folder.repository, [folder.path]) },
      });
    }
    return reports;
  }

  validateStorage(): StorageDiagnostic[] { return this.storageDiagnostics(); }

  listProjects(): ProjectInfo[] {
    return [...this.projects.values()].sort((a, b) => a.registeredAt - b.registeredAt || a.id.localeCompare(b.id));
  }

  getProject(id: string): ProjectInfo | undefined { return this.projects.get(id); }

  getProjectByPath(path: string): ProjectInfo | undefined {
    const key = this.homeFile.keyForFolder(path);
    return key ? this.projects.get(key) : undefined;
  }

  // -- sessions -------------------------------------------------------------

  createSession(session: SessionInfo): void {
    const meta: SessionMeta = {
      id: session.id,
      projectId: session.projectId,
      cwd: session.projectPath,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      live: session.live,
      players: session.players,
      initialVisible: session.initialVisible,
    };
    this.sessionLocations.set(session.id, session.projectId);
    this.sessions.set(meta.id, meta);
  }

  endSession(id: string, endedAt: number): void {
    const meta = this.sessions.get(id);
    if (!meta) return;
    meta.live = false;
    meta.endedAt = endedAt;
  }

  /** A message continued the ended session (core-service-73): live
   * again on the same id, its end time cleared, its roster the lanes
   * now running. */
  reopenSession(id: string, players: SessionInfo["players"]): void {
    const meta = this.sessions.get(id);
    if (!meta) return;
    meta.live = true;
    meta.endedAt = null;
    meta.players = players;
  }

  /** The working directory a session's manifest records (core-service-73). */
  sessionCwd(id: string): string | undefined { return this.sessions.get(id)?.cwd; }

  /** Shared lease and manifest-last deletion, followed by index cleanup. */
  async deleteSession(id: string): Promise<void> {
    if (this.sessions.get(id)?.live) throw new Error(i18n._({
      id: "wait for the running turn to finish, or abort it, before deleting",
      comment: "Refusal: the session being deleted has a turn in flight",
    }));
    await this.sessionStoreFor(id).delete(id);
    this.dropSession(id);
  }

  forgetSession(id: string): void { this.dropSession(id); }

  /** Every in-memory trace of a session, gone. */
  private dropSession(id: string): void {
    this.sessions.delete(id);
    this.sessionProblems.delete(id);
    this.untrackedSessions.delete(id);
    this.records.delete(id);
    this.turns.delete(id);
    this.usage.delete(id);
    if ([this.prefs.delete(`viewed:${id}`), this.prefs.delete(agentSettingsKey(id)), this.prefs.delete(parkedRunKey(id))].some(Boolean)) this.savePrefs();
  }

  /** Local runtime liveness is never restored from stored history. */
  markAllSessionsNotLive(): void {
    for (const meta of this.sessions.values()) {
      if (!meta.live) continue;
      meta.live = false;
    }
  }

  /** One session's listing row, carrying the same conversation
   * summary a listing carries (core-service-32) — what the broadcasts
   * that must stay truthful between listings send (core-service-34). */
  describeSession(id: string): SessionInfo | undefined {
    const meta = this.sessions.get(id);
    if (!meta) return undefined;
    const project = this.projects.get(meta.projectId);
    if (!project) return undefined;
    return this.summarize(meta, project.path);
  }

  private summarize(meta: SessionMeta, path: string): SessionInfo {
    const turns = [...(this.turns.get(meta.id)?.values() ?? [])].sort(
      (a, b) => a.turnId - b.turnId,
    );
    const failed = (this.records.get(meta.id) ?? []).some(
      (entry) => hasPresentationHeader(entry.record) && entry.record.type === "runtime_error",
    );
    const costed = (this.usage.get(meta.id) ?? []).filter(
      (entry) => entry.totalCostUsd !== undefined,
    );
    const cost =
      costed.length > 0
        ? costed.reduce((sum, entry) => sum + (entry.totalCostUsd ?? 0), 0)
        : undefined;
    // A stream marked incomplete establishes neither fold: its retained
    // prefix cannot say what an agent spent, nor what its latest call ran
    // (core-service-102, core-service-115).
    const complete = meta.streamIncompleteAfterSeq === undefined;
    const records = this.records.get(meta.id) ?? [];
    const agentActiveMs = complete ? foldAgentActiveMs(records) : undefined;
    const agentReportedModels = complete ? foldAgentReportedModels(records) : undefined;
    return sessionInfo(
      meta,
      path,
      turns[0]?.prompt.trim() ? turns[0].prompt : turns[0]?.attachmentTitle,
      turns.length,
      failed,
      cost,
      this.sessionAgentSettings(meta.id),
      agentActiveMs,
      agentReportedModels,
      this.parkedRun(meta.id),
    );
  }

  listSessions(): SessionInfo[] {
    const out: SessionInfo[] = [];
    for (const meta of [...this.sessions.values()].sort(
      (a, b) => a.createdAt - b.createdAt,
    )) {
      const project = this.projects.get(meta.projectId);
      // A session whose project left the registry stays on disk but
      // out of the listing (DR-036).
      if (!project) continue;
      out.push(this.summarize(meta, project.path));
    }
    return out;
  }

  // -- turns ----------------------------------------------------------------

  private turnsOf(sessionId: string): Map<number, TurnRow> {
    let map = this.turns.get(sessionId);
    if (!map) {
      map = new Map();
      this.turns.set(sessionId, map);
    }
    return map;
  }

  private startTurnInMemory(
    sessionId: string,
    turnId: number,
    prompt: string,
    at: number,
    attachmentTitle?: string,
  ): void {
    this.turnsOf(sessionId).set(turnId, {
      turnId,
      prompt,
      ...(attachmentTitle ? {attachmentTitle} : {}),
      startedAt: at,
      endedAt: null,
      status: null,
    });
  }

  private endTurnInMemory(
    sessionId: string,
    turnId: number,
    status: string,
    at: number,
  ): void {
    const turn = this.turnsOf(sessionId).get(turnId);
    if (!turn) return;
    turn.status = status;
    turn.endedAt = at;
  }

  startTurn(sessionId: string, turnId: number, prompt: string, at: number): void {
    this.startTurnInMemory(sessionId, turnId, prompt, at);
  }

  endTurn(sessionId: string, turnId: number, status: string, at: number): void {
    this.endTurnInMemory(sessionId, turnId, status, at);
  }

  /** Every turn a session held, in order — the ledger fold's turn
   * ranges and statuses come from here (DR-035). */
  listTurns(sessionId: string): TurnRow[] {
    return [...(this.turns.get(sessionId)?.values() ?? [])].sort(
      (a, b) => a.turnId - b.turnId,
    );
  }

  /** The highest turn id the session's stream holds — a continued
   * session's runtime numbers past it (core-service-74). */
  maxTurnId(sessionId: string): number {
    let max = 0;
    for (const turnId of this.turns.get(sessionId)?.keys() ?? []) {
      if (turnId > max) max = turnId;
    }
    return max;
  }

  /** Reviewer-role player calls inside a turn range — the review
   * rounds a finished intent reports (DR-035). An open upper bound
   * (`toTurnId` null) runs to the session's end. */
  countRolePrompts(
    sessionId: string,
    role: string,
    fromTurnId: number,
    toTurnId: number | null,
  ): number {
    let count = 0;
    for (const entry of this.records.get(sessionId) ?? []) {
      if (!hasPresentationHeader(entry.record)) continue;
      const turnId = entry.record.turnId;
      if (entry.role !== role || entry.record.type !== "player_prompt") continue;
      if (turnId === null || turnId < fromTurnId) continue;
      if (toTurnId !== null && turnId >= toTurnId) continue;
      count += 1;
    }
    return count;
  }

  /** Runtime-error records inside a turn range, oldest first — the
   * failure condition and its onset time (DR-035). */
  runtimeErrors(
    sessionId: string,
    fromTurnId: number,
    toTurnId: number | null,
  ): { turnId: number | null; timestamp: number }[] {
    const out: { turnId: number | null; timestamp: number }[] = [];
    for (const entry of this.records.get(sessionId) ?? []) {
      if (!hasPresentationHeader(entry.record)) continue;
      if (entry.record.type !== "runtime_error") continue;
      const turnId = entry.record.turnId;
      // A null-turn error belongs to no turn range, exactly as the
      // SQL `turn_id >= ?` excluded it — returning it for every
      // intent's range would flip ledger verdicts.
      if (turnId === null || turnId < fromTurnId) continue;
      if (toTurnId !== null && turnId >= toTurnId) continue;
      out.push({ turnId, timestamp: entry.record.timestamp });
    }
    return out;
  }

  // -- records --------------------------------------------------------------

  private recordsOf(sessionId: string): StoredRecord[] {
    let list = this.records.get(sessionId);
    if (!list) {
      list = [];
      this.records.set(sessionId, list);
    }
    return list;
  }

  private usageOf(sessionId: string): UsageEntry[] {
    let list = this.usage.get(sessionId);
    if (!list) {
      list = [];
      this.usage.set(sessionId, list);
    }
    return list;
  }

  /** `role` is the resolved role a player record's call served, kept
   * beside the record so a replay reads exactly as the live stream did
   * (DR-032). */
  appendRecord(
    sessionId: string,
    seq: number,
    record: TmuxPlayRecord,
    role?: string,
  ): void {
    const stored: StoredRecord = {
      seq,
      // The stream is a token-free replay projection (DR-036): resume
      // tokens never reach memory or disk through this door.
      record: sanitizeRecord(record),
      ...(role !== undefined ? { role } : {}),
    };
    this.recordsOf(sessionId).push(stored);
  }

  getRecords(
    sessionId: string,
    options: { afterSeq?: number; includeHidden?: boolean } = {},
  ): StoredRecord[] {
    const after = options.afterSeq ?? 0;
    return (this.records.get(sessionId) ?? []).filter(
      (entry) =>
        entry.seq > after && (options.includeHidden || !isHidden(entry.record)),
    );
  }

  maxSeq(sessionId: string): number {
    const list = this.records.get(sessionId);
    return list && list.length > 0 ? list[list.length - 1].seq : 0;
  }

  // -- usage ----------------------------------------------------------------

  addUsage(entry: UsageEntry): void {
    this.usageOf(entry.sessionId).push(entry);
  }

  usageByDay(): { day: string; totals: UsageTotals }[] {
    const byDay = new Map<string, UsageEntry[]>();
    for (const entries of this.usage.values()) {
      for (const entry of entries) {
        // UTC day bucketing, as the SQLite rollup bucketed it.
        const day = new Date(entry.at).toISOString().slice(0, 10);
        const list = byDay.get(day);
        if (list) list.push(entry);
        else byDay.set(day, [entry]);
      }
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 30)
      .map(([day, entries]) => ({ day, totals: usageTotals(entries) }));
  }

  sessionUsage(sessionId: string): UsageTotals {
    return usageTotals(this.usage.get(sessionId) ?? []);
  }

  // -- intents, one file each (storage-4, core-service-52) ------------------

  private requireIntent(id: string): { intent: IntentInfo; repository: SpexRepository } {
    const intent = this.intents.get(id);
    if (!intent) throw new StorageFormatError(join("intents", `${id}.json`), i18n._({
      id: "no intent {intentId}", comment: "Refusal: no intent of this id is in the ledger", values: { intentId: id } }));
    return { intent, repository: this.requireRepository(intent.projectId) };
  }

  /** Rewrite one intent's file whole (storage-4). */
  private writeIntent(repository: SpexRepository, intent: IntentInfo): void {
    this.assertWritable({ projectId: intent.projectId });
    writeIntentFile(repository.intentsDir, intentFileOf(intent));
    this.intents.set(intent.id, intentInfoOf(intentFileOf(intent), repository.key));
  }

  /** The directory beside an intent's file holding its attachments. */
  intentAssetsDir(id: string, projectId?: string): string {
    const key = projectId ?? this.intents.get(id)?.projectId;
    if (!key) throw new StorageFormatError(join("intents", `${id}.assets`), i18n._({
      id: "no intent {intentId}", comment: "Refusal: no intent of this id is in the ledger", values: { intentId: id } }));
    return join(this.requireRepository(key).intentsDir, `${id}.assets`);
  }

  /** Store a new intent as one file of its project's spex repository
   * (core-service-42). */
  addIntent(intent: IntentInfo): void {
    const repository = this.requireRepository(intent.projectId);
    if (this.intents.has(intent.id)) throw new StorageFormatError(join(repository.intentsDir, `${intent.id}.json`), i18n._({
      id: "duplicate queue {intentId}", comment: "Storage diagnostic: two acts queue the same intent", values: { intentId: intent.id } }));
    this.writeIntent(repository, structuredClone(intent));
  }

  getIntent(id: string): IntentInfo | undefined {
    const intent = this.intents.get(id);
    return intent ? structuredClone(intent) : undefined;
  }

  /** The open intent holding a source artifact, if any (DR-035). */
  openIntentBySource(
    projectId: string,
    kind: IntentSourceKind,
    ref: string,
  ): IntentInfo | undefined {
    for (const intent of this.intents.values()) {
      if (
        intent.projectId === projectId &&
        intent.closedAt === undefined &&
        intent.source?.kind === kind &&
        intent.source.ref === ref
      ) {
        return structuredClone(intent);
      }
    }
    return undefined;
  }

  /** Every open intent of a project on this device, oldest first by
   * capture time, then by id (core-service-107). */
  listOpenIntents(): IntentInfo[] {
    return [...this.intents.values()]
      .filter((intent) => intent.closedAt === undefined && this.projects.has(intent.projectId))
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((intent) => structuredClone(intent));
  }

  /** One History page: closed intents newest first (DR-035), those
   * `include` admits — the filter runs before paging, so an excluded
   * intent never shortens a page (DR-038). */
  listClosedIntents(
    projectId: string,
    limit: number,
    before?: { closedAt: number; intentId: string },
    include: (intent: IntentInfo) => boolean = () => true,
  ): IntentInfo[] {
    return [...this.intents.values()]
      .filter(
        (intent): intent is IntentInfo & { closedAt: number } =>
          intent.projectId === projectId &&
          intent.closedAt !== undefined &&
          include(intent),
      )
      .filter(
        (intent) =>
          !before ||
          intent.closedAt < before.closedAt ||
          (intent.closedAt === before.closedAt && intent.id < before.intentId),
      )
      .sort((a, b) =>
        a.closedAt === b.closedAt
          ? a.id < b.id
            ? 1
            : -1
          : b.closedAt - a.closedAt,
      )
      .slice(0, limit)
      .map((intent) => structuredClone(intent));
  }

  /** Every dispatch stamped into a session — open and closed intents
   * alike, because a closed dispatch still bounds its neighbours' turn
   * ranges (DR-035). A removed intent's no longer does (core-service-79). */
  listSessionDispatches(
    sessionId: string,
  ): { intentId: string; turnId: number; open: boolean; closedAt?: number }[] {
    return [...this.intents.values()]
      .filter((intent) => intent.dispatched?.sessionId === sessionId)
      .sort(
        (a, b) =>
          (a.dispatched as { turnId: number }).turnId -
          (b.dispatched as { turnId: number }).turnId,
      )
      .map((intent) => ({
        intentId: intent.id,
        turnId: (intent.dispatched as { turnId: number }).turnId,
        open: intent.closedAt === undefined,
        ...(intent.closedAt !== undefined ? { closedAt: intent.closedAt } : {}),
      }));
  }

  /** Replace a queued intent's text and any supplied attachments
   * (core-service-43); the file is rewritten whole. */
  editIntent(id: string, text: string, attachments?: IntentInfo["attachments"]): void {
    const { intent, repository } = this.requireIntent(id);
    const next: IntentInfo = { ...structuredClone(intent), text };
    if (attachments !== undefined) {
      if (attachments.length) next.attachments = structuredClone(attachments);
      else delete next.attachments;
    }
    this.writeIntent(repository, next);
  }

  /** The dispatch binding, stamped when the turn starts and re-written
   * by a later dispatch (DR-035). */
  stampIntentDispatch(
    id: string,
    sessionId: string,
    turnId: number,
    at: number,
  ): void {
    const { intent, repository } = this.requireIntent(id);
    this.writeIntent(repository, { ...structuredClone(intent), dispatched: { sessionId, turnId, at } });
  }

  /** Record a verdict on the intent's file (core-service-46); with
   * `remove`, a drop before any work deletes the file and its
   * attachments, so no read sees it (core-service-52, DR-038). */
  closeIntent(id: string, as: "done" | "dropped", at: number, remove = false): void {
    const { intent, repository } = this.requireIntent(id);
    if (remove) { this.deleteIntentFiles(repository, intent); return; }
    this.writeIntent(repository, { ...structuredClone(intent), closedAt: at, closedAs: as });
  }

  /** Retire an intent (core-service-79): its file and attachments go,
   * recoverable from the spex repository's history alone. Its turns pass
   * to the preceding dispatch once its stamp is gone, so the session's
   * viewed marker first advances past its last ended turn: work already
   * ruled on summons no review. */
  removeIntent(id: string, _at?: number): void {
    const { intent, repository } = this.requireIntent(id);
    const lastEnded = this.lastEndedTurnOf(intent);
    this.deleteIntentFiles(repository, intent);
    if (lastEnded) {
      const key = `viewed:${lastEnded.sessionId}`;
      const viewed = this.getPref<number>(key) ?? -1;
      if (lastEnded.turnId > viewed) this.setPref(key, lastEnded.turnId);
    }
  }

  /** The last ended turn a dispatched intent attributes: from its
   * dispatch turn up to the next dispatch of another intent in the
   * session, or the session's end (DR-035). */
  private lastEndedTurnOf(intent: IntentInfo): { sessionId: string; turnId: number } | undefined {
    const bound = intent.dispatched;
    if (!bound) return undefined;
    const next = this.listSessionDispatches(bound.sessionId)
      .find((dispatch) => dispatch.turnId > bound.turnId && dispatch.intentId !== intent.id);
    const last = this.listTurns(bound.sessionId)
      .filter((turn) => turn.turnId >= bound.turnId && (next === undefined || turn.turnId < next.turnId) && turn.endedAt !== null)
      .at(-1);
    return last ? { sessionId: bound.sessionId, turnId: last.turnId } : undefined;
  }

  private deleteIntentFiles(repository: SpexRepository, intent: IntentInfo): void {
    this.assertWritable({ projectId: intent.projectId });
    rmSync(join(repository.intentsDir, `${intent.id}.assets`), { recursive: true, force: true });
    rmSync(join(repository.intentsDir, `${intent.id}.json`), { force: true });
    this.intents.delete(intent.id);
  }

  // -- prefs ----------------------------------------------------------------

  setPref(key: string, value: unknown): void {
    if (this.prefsProblem) throw new StorageFormatError(this.prefsProblem.file, this.prefsProblem.reason);
    this.prefs.set(key, value);
    this.savePrefs();
  }

  getPref<T>(key: string): T | undefined {
    return this.prefs.has(key) ? (this.prefs.get(key) as T) : undefined;
  }

  /** The preference keys under one prefix, so a family can be pruned
   * of records naming things that no longer stand (space-54). */
  prefKeys(prefix: string): string[] {
    return [...this.prefs.keys()].filter((key) => key.startsWith(prefix));
  }

  /** A session's own tuning (core-service-100, DR-067): what its
   * agents are set to run, above everything the config resolves. It is
   * this host's ad-hoc choice, so it lives with the local preferences
   * rather than in the config the launcher reads. */
  sessionAgentSettings(sessionId: string): SessionAgentSettingsMap | undefined {
    const stored = this.getPref<unknown>(agentSettingsKey(sessionId));
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
    const tuning: SessionAgentSettingsMap = {};
    for (const [agentId, value] of Object.entries(stored as Record<string, unknown>)) {
      const entry = readAgentSettings(value);
      if (entry) tuning[agentId] = entry;
    }
    return Object.keys(tuning).length > 0 ? tuning : undefined;
  }

  /** What a session's parked run advertised when its shell was last
   * held (core-service-32, DR-074): a local, rebuildable reading the
   * summary carries across restarts (storage-5). */
  parkedRun(sessionId: string): ParkedRun | undefined {
    return readParkedRun(this.getPref<unknown>(parkedRunKey(sessionId)));
  }

  /** No parked run is no key: the reading leaves rather than standing
   * for a run that has moved on. */
  setParkedRun(sessionId: string, parked: ParkedRun | undefined): void {
    if (!parked) this.deletePref(parkedRunKey(sessionId));
    else this.setPref(parkedRunKey(sessionId), parked);
  }

  /** The home's interface language (storage-5, DR-078): one choice for
   * every client of the home. A value no catalog holds reads as none,
   * so a hand-edited file leaves the reader on his system's language
   * rather than on a language the interface cannot speak. */
  interfaceLanguage(): Language | null {
    const stored = this.getPref<unknown>(LANGUAGE_PREF);
    return isLanguage(stored) ? stored : null;
  }

  /** The reader's system is no key: null forgets the choice. */
  setInterfaceLanguage(language: Language | null): void {
    if (language === null) this.deletePref(LANGUAGE_PREF);
    else this.setPref(LANGUAGE_PREF, language);
  }

  /** An empty tuning is no tuning: the key leaves rather than standing
   * as an empty object nobody can see. */
  setSessionAgentSettingsMap(sessionId: string, tuning: SessionAgentSettingsMap): void {
    if (Object.keys(tuning).length === 0) this.deletePref(agentSettingsKey(sessionId));
    else this.setPref(agentSettingsKey(sessionId), tuning);
  }

  /** Forget a preference; a key never set is no error. */
  deletePref(key: string): void {
    if (this.prefsProblem) throw new StorageFormatError(this.prefsProblem.file, this.prefsProblem.reason);
    if (this.prefs.delete(key)) this.savePrefs();
  }

  // -- forge cache (dashboard-14) -------------------------------------------

  getForgeCache(projectId: string): { at: number; state: ForgeState } | undefined {
    return this.forgeCache.get(projectId);
  }

  setForgeCache(projectId: string, entry: { at: number; state: ForgeState }): void {
    this.forgeCache.set(projectId, entry);
    this.saveForgeCache();
  }

  /** Forget every cached forge state that carries guidance rather than
   * lists (core-service-111): guidance is prose composed in a language,
   * so a change of the home's language must compose it again, while an
   * entry holding issue and pull-request lists stays served as before
   * (dashboard-14). */
  dropForgeGuidance(): void {
    let dropped = false;
    for (const [projectId, entry] of this.forgeCache) {
      if (entry.state.guidance !== undefined) {
        this.forgeCache.delete(projectId);
        dropped = true;
      }
    }
    if (dropped) this.saveForgeCache();
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM answers "alive but not ours"; only ESRCH proves death.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

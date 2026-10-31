// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Application files belong to Spex; session files and mutations belong
// to Playbook. The home pairs working folders with spex repositories,
// one clone each under `workspace/` with its own session store
// (storage-1, storage-14, DR-103). The home, the clones, project files
// and intents are read from disk when asked (DR-111); a clone's
// descriptor is kept only as its paths and session store. The session
// maps are rebuilt projections for UI and run folds.

import { randomUUID } from "node:crypto";
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
  type Dirent,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { createSessionStore, isUncertainTurnDiscardable, validateSessionContext, type SharedSessionStore, type SessionManifest, type SessionRecovery } from "@sublang/playbook/session-store";
import { acquireRootLease, assertFormerLeaseReleased, type RootLease } from "./root-lease.js";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  intentFileOf, intentInfoOf, parsePrefs, parseProjectFile, readIntentFiles, repairKey, writeIntentFile,
  type ProjectFile, type StorageDiagnostic,
} from "./app-storage.js";
import { occupied } from "./clone-moves.js";
import { makePrivateDirectory, readJsonFile, StorageFormatError, VersionConflictError, writeApplicationFile } from "@sublang/spex/files";
import { defaultOwnName, Home, repositoryNameFor, splitKey, WORKSPACE_DEPTH } from "./home.js";
import { filedIn, formerPlacementPrefKey, PLACEMENT_PREF_KINDS, placementPrefKey, readPlacementFiles, readPlacements, type PlacementPrefKind } from "./placements.js";
import { folderRemote, needsGroupsMigration, migrateFormerHome } from "./migrate-home.js";
import { environmentReceipt } from "./migrate-environment.js";
import { needsBoundedSessionImport, stageBoundedHomeSessions, finishBoundedHomeSessions } from "./migrate-bounded-sessions.js";
import { deferredMoves, migrateInstances, needsInstancesMigration, settleDeferred, type DeferredMove } from "./migrate-instances.js";
import { gitEnvironment, initializeClone } from "./storage-git.js";
import { canonicalOrigin, instanceFolder, isInstanceFolder } from "@sublang/spex/instance";
import { SEED_PREF, seedConfig, type SeedRecord } from "./config.js";
import { createRequire } from "node:module";
import { i18n } from "./i18n.js";
import { isLanguage, type Language } from "./language.js";

import type {
  AssignedRuntime,
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
import { answeringTurnIds, failureStands, openingTurn } from "./ledger.js";
import { recordedRuntime, runsElsewhere, runsOnPhrase } from "./control-record.js";

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

export { StateRootHeldError, StateRootLeaseError } from "./root-lease.js";

export interface StoreOptions {
  /** The Spex home; unset runs the store on a scratch home removed at close. */
  dir?: string;
  /** This machine's identity from Playbook's facade, required with
   * `dir`: the root lease carries it (storage-26, DR-108). */
  machineIdentity?: string;
  /** A legacy SQLite store to import once (CORE-64): skipped when the
   * `<store>.imported` marker beside it says a root already did. */
  legacyDbPath?: string;
  /** The environment Git and the host URL are read from. */
  env?: NodeJS.ProcessEnv;
  /** The home whose agent sign-ins the config seed reads; defaults to
   * the environment's `HOME` (core-service-3). */
  home?: string;
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
  /** Write the environment at `root` requesting the built-in spec
   * package, locked at `registryOrigin`, the environment's registry
   * (storage-6, environments-11, DR-127), and naming `space` as the
   * environment's instance wherever the spex repository is placed at one
   * (environments-2, DR-165): your own group's clone at every open,
   * before its first commit, and a new project's working folder at its
   * registration where it holds neither file (environments-26). The
   * migration calls it for each environment it makes. */
  prepareRepository?: (dir: string, key: string, registryOrigin: string, space: string | null) => void;
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
  /** The runtime the session is assigned to (storage-43, DR-134): the
   * first runtime record of its stream, null where that record cannot
   * be read — an unknown runtime, never this home's — and absent where
   * the stream holds none, the session keeping today's rules. */
  runtime?: AssignedRuntime | null;
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
 * shape every listing and broadcast shares (core-service-32). A session
 * assigned to another runtime — `runsOn`, its label — is not
 * continuable here, whatever its checkpoint holds, with the phrase as
 * its reason before any other and no recovery offered (DR-134). */
function sessionInfo(
  meta: SessionMeta,
  path: string,
  title: string | undefined,
  workTitle: string | undefined,
  turns: number,
  failed: boolean,
  costUsd: number | undefined,
  agentSettings: SessionAgentSettingsMap | undefined,
  agentActiveMs: Record<string, number> | undefined,
  agentReportedModels: SessionInfo["agentReportedModels"],
  parked: ParkedRun | undefined,
  runsOn: string | undefined,
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
    ...(workTitle !== undefined ? { workTitle } : {}),
    turns,
    failed,
    ...(costUsd !== undefined ? { costUsd } : {}),
    ...(agentActiveMs !== undefined ? { agentActiveMs } : {}),
    ...(agentReportedModels !== undefined ? { agentReportedModels } : {}),
    ...(meta.streamIncompleteAfterSeq !== undefined
      ? { streamIncompleteAfterSeq: meta.streamIncompleteAfterSeq }
      : {}),
    ...(meta.foreign ? { foreign: true } : {}),
    ...(runsOn !== undefined ? { runsOn } : {}),
    ...(!meta.live && !meta.externalWriter && meta.continuable && runsOn === undefined ? { continuable: true } : {}),
    // Phrased here, when the session is read (core-service-111): a
    // reason the core owns follows the home's language, while one the
    // shared store gave is that store's own words, kept as they are.
    ...(runsOn !== undefined
      ? { continuationReason: runsOnPhrase(runsOn) }
      : meta.externalWriter
      ? {continuationReason: meta.externalWriter === "active"
          ? i18n._({
              id: "Session is open on another computer",
              comment: "Why a session cannot continue here: another computer is writing it",
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
    ...(meta.recovery && !meta.externalWriter && runsOn === undefined ? { recovery: meta.recovery } : {}),
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

/** A clone's instance (storage-31): the origin of the instance whose
 * folder its key lies in — one `home.yaml` lists, or the origin it
 * records — else the one a deferred move of it names under its
 * destination, else the listed instance whose folder names its remote,
 * read only where neither names one; null for a clone local only. */
function instanceOfClone(home: Home, deferred: readonly DeferredMove[], key: string, remoteName: () => string | null): string | null {
  const byKey = home.instanceOfKey(key);
  if (byKey) return byKey.origin;
  const move = deferred.find((entry) => entry.from === key);
  const byMove = move ? home.instanceOfKey(move.to) : undefined;
  if (byMove) return byMove.origin;
  const name = remoteName();
  if (name === null || !isInstanceFolder(name)) return null;
  return home.instances().find((entry) => instanceFolder(entry.origin) === name)?.origin ?? null;
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

/** What a Spex before DR-128 recorded for a repository, one record per
 * kind, moved under its placement `name` where that holds none of its
 * own, the former keys leaving (storage-5); whether anything changed. */
function adoptFormerPlacementPrefs(prefs: Map<string, unknown>, key: string, name: string): boolean {
  let changed = false;
  for (const kind of PLACEMENT_PREF_KINDS) {
    const former = formerPlacementPrefKey(key, kind);
    if (!prefs.has(former)) continue;
    const own = placementPrefKey(key, name, kind);
    if (!prefs.has(own)) prefs.set(own, prefs.get(former));
    prefs.delete(former);
    changed = true;
  }
  return changed;
}

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
    // Its sessions folder is made by the store's own writes alone, never
    // by a lease or a record: a clone moved or removed meanwhile is never
    // made again at its former path (space-19, space-21).
    store: createSessionStore({ sessionsDir, createSessionsDir: false }),
  };
}

const unpairedReason = (name: string): string =>
  i18n._({ id: "{name} has no folder on this computer", comment: "Repair row: the project's records are here, but no project folder on this computer holds it",
    values: { name } });
const missingCloneReason = (path: string): string =>
  i18n._({ id: "the records of {path} are missing on this computer",
    comment: "Repair row: a project folder whose records are gone from this computer; {path} is the folder", values: { path } });
const deferredDestinationTaken = (key: string): string =>
  i18n._({ id: "taken, so {key} cannot move here under its Space's folder; move it aside",
    comment: "Storage diagnostic on a folder under workspace/: the records {key} wait to move to this path under their Space's folder, which something else holds; they stay where they are until the folder is moved aside", values: { key } });

export class Store {
  /** The home this store serves. */
  readonly dir: string;
  private readonly scratch: boolean;
  private readonly env: NodeJS.ProcessEnv;
  private readonly options: StoreOptions;
  private lease?: RootLease;
  private migrationPending = false;
  /** Whether a legacy store was imported into the former layout this
   * open, which the groups migration carries into the home. */
  private legacyImported = false;
  /** Whether this open seeded the starter into your own group's clone. */
  seededConfig = false;

  private meta: StoreMeta = { version: META_VERSION };
  private homeFile!: Home;
  private homeProblem?: StorageDiagnostic;
  /** Each clone's descriptor by key, as the last walk found it: a handle
   * on its paths and session store, never a fact about its files. */
  private readonly repositories = new Map<string, SpexRepository>();
  private readonly prefs = new Map<string, unknown>();
  private readonly forgeCache = new Map<string, { at: number; state: ForgeState }>();
  /** The clones the instances migration deferred (DR-127), as its
   * receipt named them at this open, less those moved since. */
  private deferred: DeferredMove[] = [];
  private readonly sessionProblems = new Map<string, StorageDiagnostic>();
  /** Current execution refusals are a read model, never session files. */
  private readonly continuationRefusals = new Map<string, string>();
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
    this.dir = resolve(options.dir ?? (process.platform === "win32"
      ? join(tmpdir(), `spex-memory-home-${randomUUID()}`)
      : mkdtempSync(join(tmpdir(), "spex-memory-home-"))));
    if (process.platform === "win32") makePrivateDirectory(this.dir);
    else mkdirSync(this.dir, { recursive: true });
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
      this.legacyImported = imported;
      this.meta.version = META_VERSION;
      writeAtomic(this.metaFile(), JSON.stringify(this.meta));
      if (imported || needsGroupsMigration(this.dir) || needsInstancesMigration(this.dir) || needsBoundedSessionImport(this.dir)) {
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

  /** Open a home, migrating a one-instance home and the former layout
   * once under the home lease before any writer is admitted (storage-9,
   * core-service-15, DR-127). */
  static async open(options: StoreOptions = {}): Promise<Store> {
    const store = new Store({ ...options, deferMigration: true });
    if (store.migrationPending) {
      try {
        await stageBoundedHomeSessions(store.dir);
        // A `home.yaml` in format 1 takes format 2 before the groups
        // migration, which merges a late legacy import into the home as
        // it reads it; the home that migration writes for a former
        // layout is already in format 2.
        if (needsInstancesMigration(store.dir)) {
          migrateInstances(store.dir, {
            env: store.env,
            ...(store.options.machineIdentity !== undefined ? { machineIdentity: store.options.machineIdentity } : {}),
          });
        }
        if (store.legacyImported || needsGroupsMigration(store.dir)) await migrateFormerHome(store.dir, {
          env: store.env,
          ...(options.own ? { own: options.own } : {}),
          libraryDir: options.libraryDir ?? join(store.dir, "playbooks"),
          ...(options.prepareRepository ? { prepareRepository: options.prepareRepository } : {}),
        });
        store.migrationPending = false;
        store.openHome();
        await finishBoundedHomeSessions(store.dir, store.homeFile);
      } catch (error) {
        store.close();
        throw error;
      }
    }
    return store;
  }

  // -- root lease (CORE-61, storage-26) --------------------------------------

  /** Take the home's root lease (storage-26). A scratch home is this
   * store's own and takes none. A writer of the former layout holding
   * `.lock/` keeps this one out while it lives or is another machine's
   * (storage-9); a dead one of this machine is left for the migration. */
  private acquireRootLease(): void {
    if (this.scratch) return;
    const machineIdentity = this.options.machineIdentity;
    if (machineIdentity === undefined) {
      throw new TypeError("a Spex home store requires this machine's identity (storage-26)");
    }
    this.lease = acquireRootLease(this.dir, { machineIdentity });
    try {
      assertFormerLeaseReleased(this.dir, { machineIdentity });
    } catch (error) {
      this.releaseRootLease();
      throw error;
    }
  }

  /** Retire this store's own lease (storage-26); a successor stands. */
  private releaseRootLease(): void {
    const lease = this.lease;
    this.lease = undefined;
    lease?.release();
  }

  // -- the home (storage-2) -------------------------------------------------

  private metaFile(): string {
    return join(this.dir, "meta.json");
  }

  /** The home file this store serves, as `home.yaml` reads now. */
  get home(): Home { this.refreshHome(); return this.homeFile; }

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
        this.homeFile = this.placeholderHome();
      }
    } else {
      this.homeFile = Home.create(this.dir, { ...(this.options.own ? { own: this.options.own } : {}), env: this.env });
      this.homeFile.save();
    }
    mkdirSync(join(this.dir, "local"), { recursive: true, mode: 0o700 });
    this.ensureOwnRepository();
    this.prepareSessionDirs();
    this.loadApplication();
    this.deferred = deferredMoves(this.dir);
  }

  /** The clones the instances migration left where they stood, a
   * session's lease holding them (DR-127): each by the key it keeps,
   * under which it is listed, the key under its instance's folder its
   * next sync moves it to, and the clone it was, while it still stands
   * at the key it kept. */
  deferredMoves(): DeferredMove[] {
    return this.deferred.filter((move) => {
      try { return lstatSync(this.homeFile.clonePath(move.from)).isDirectory(); } catch { return false; }
    }).map((move) => ({ ...move }));
  }

  /** Your own group's clone always stands, its config seeded from the
   * starter and its `spex` branch begun with one commit (storage-6). */
  private ensureOwnRepository(): void {
    const dir = this.homeFile.clonePath(this.homeFile.own());
    const empty = !existsSync(dir) || readdirSync(dir).length === 0;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const config = join(dir, "config", "playbook.config.yaml");
    // A config at a former location moves in first, so the starter
    // never shadows it (core-service-66).
    this.options.relocateConfig?.(config);
    // The seed is the playbook CLI's own for these credentials
    // (core-service-3); where it cannot be read, the core reports the
    // missing config itself.
    try {
      const version = seedConfig(config, this.env, this.options.home ?? this.env.HOME ?? homedir());
      this.seededConfig = version !== null;
      if (version !== null) this.recordSeed(config, version);
    } catch { /* reported as a missing config */ }
    const prepared = this.prepareRepository(dir, this.homeFile.own());
    const generatedBootstrap = empty && this.seededConfig && prepared
      && existsSync(join(dir, "spex.yaml")) && existsSync(join(dir, "spex.lock"));
    this.initializeRepository(dir, generatedBootstrap);
  }

  /** The caller's writing of an environment at `root` — the clone, or a
   * project's working folder — at the registry of the clone's instance —
   * read from its key, a deferred move or the remote its Git names now,
   * so your own group's is the one its remote names (storage-31) — else
   * the default instance's (environments-5, environments-11); its
   * failure leaves the folder as it is, reported, never failing the open. */
  private prepareRepository(dir: string, key: string, root = dir): boolean {
    try {
      // Recovery owns both environment files until its pending plan is
      // complete. Store opens before EnvironmentManager resumes that plan.
      if (environmentReceipt(this.dir)?.pending?.some((plan) => plan.key === key || plan.root === root)) return false;
      const placed = instanceOfClone(this.homeFile, this.deferred, key, () => this.remoteNameOf(dir, key));
      const defaultOrigin = canonicalOrigin(this.homeFile.defaultInstance().origin);
      const registryOrigin = placed ?? defaultOrigin;
      // A clone placed at an instance names it as its environment's
      // instance, the default one included; one local only names none
      // (environments-11).
      const space = placed !== null ? canonicalOrigin(placed) : null;
      this.options.prepareRepository?.(root, key, registryOrigin, space);
      return true;
    }
    catch (error) { console.error(`spex: ${key} was not prepared: ${error instanceof Error ? error.message : String(error)}`); return false; }
  }

  /** The name of a clone's first placement's remote (storage-34,
   * storage-31), as its Git configuration holds it now; none for a
   * folder that is no repository of its own yet, or whose configuration
   * Git cannot read. */
  private remoteNameOf(dir: string, key: string): string | null {
    if (!existsSync(join(dir, ".git"))) return null;
    const placements = readPlacements((args) => {
      const run = spawnSync("git", ["-C", dir, ...args], { env: gitEnvironment(this.env), stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 });
      return { ok: !run.error && run.status === 0, stdout: run.stdout?.toString("utf8") ?? "" };
    }, key, this.homeFile, this.deferred, filedIn(dir), dir);
    return placements[0]?.name ?? null;
  }

  /** A clone's instance (storage-31), its remote's name as `remoteName`
   * gives it: the origin of the instance whose folder its key lies in —
   * one `home.yaml` lists, or the origin it records — else the one the
   * instances migration's deferred move of it names, else the listed
   * instance whose folder names its remote; null for a clone local only. */
  cloneInstance(key: string, remoteName: string | null): string | null {
    return instanceOfClone(this.home, this.deferredMoves(), key, () => remoteName);
  }

  /** Called before a project's pair is forgotten, with its working
   * folder: what exports wrote there is removed (environments-8). */
  onProjectRemoving?: (key: string, folder: string | undefined) => void;

  /** A clone becomes a repository on its `spex` branch with one commit;
   * where Git cannot run, it stays a plain folder until it can. */
  private initializeRepository(dir: string, generatedBootstrap = false): void {
    try { initializeClone(dir, { env: this.env, generatedBootstrap }); }
    catch (error) { console.error(`spex: ${dir} is not a repository yet: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /** Every clone under `workspace/` as the folders stand now: a folder
   * named `<name>-spex` inside plain group folders mirroring the Git host
   * (storage-1), under an instance's folder or your own group's, its key
   * up to WORKSPACE_DEPTH segments. The walk only reads: a clone found
   * again keeps its descriptor, and one gone leaves the map. */
  private currentRepositories(): Map<string, SpexRepository> {
    const found = new Map<string, string>();
    const walk = (dir: string, depth: number): void => {
      if (depth >= WORKSPACE_DEPTH) return;
      let entries: Dirent[];
      try { entries = readdirSync(dir, { withFileTypes: true }); }
      catch (error) {
        if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
        throw error;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
        const path = join(dir, entry.name);
        const key = this.homeFile.keyOf(path);
        if (key) found.set(key, path);
        else walk(path, depth + 1);
      }
    };
    walk(this.homeFile.workspace, 0);
    for (const key of [...this.repositories.keys()]) if (!found.has(key)) this.repositories.delete(key);
    for (const [key, dir] of found) if (!this.repositories.has(key)) this.repositories.set(key, spexRepository(key, dir));
    return this.repositories;
  }

  /** Each clone's `sessions/`, made where missing by the store's own
   * writes — its open, a registration, a move, a join — never by a read:
   * sessions are private, and Playbook's store refuses a sessions
   * directory that is not 0700. */
  private prepareSessionDirs(): void {
    for (const repository of this.currentRepositories().values()) mkdirSync(repository.sessionsDir, { recursive: true, mode: 0o700 });
  }

  /** `project.json` as it reads now (storage-3): the file, or the
   * diagnostic of one that will not read; neither where none stands. */
  private readProjectFile(repository: SpexRepository): { file?: ProjectFile; problem?: StorageDiagnostic } {
    if (!existsSync(repository.projectFile)) return {};
    try { return { file: parseProjectFile(readJsonFile(repository.projectFile), repository.projectFile) }; }
    catch (error) {
      if (!(error instanceof StorageFormatError)) throw error;
      return { problem: { file: error.file, reason: error.reason, blocking: false } };
    }
  }

  private projectInfo(repository: SpexRepository, path: string): ProjectInfo {
    const { instance, group, name } = splitKey(repository.key);
    let registeredAt = 0;
    try { const stat = statSync(repository.dir); registeredAt = Math.round(stat.birthtimeMs || stat.ctimeMs); } catch { registeredAt = 0; }
    return {
      id: repository.key,
      path,
      name: this.readProjectFile(repository).file?.name ?? (repository.key === this.homeFile.own() ? this.homeFile.ownName : basename(path)),
      registeredAt,
      // Your own group's folder lies outside every instance's: a namespace
      // at an instance bearing its name is not it (DR-127).
      repository: { key: repository.key, name, group, own: instance === null && group === this.homeFile.ownName },
    };
  }

  /** Every clone this home holds. */
  listRepositories(): SpexRepository[] {
    return [...this.currentRepositories().values()].sort((a, b) => a.key.localeCompare(b.key));
  }

  repository(key: string): SpexRepository | undefined { return this.currentRepositories().get(key); }

  /** Your own group's spex repository: made at the store's open alone
   * (storage-6), and refused, never made again, where it went since. */
  ownRepository(): SpexRepository {
    this.refreshHome();
    return this.requireRepository(this.homeFile.own());
  }

  private requireRepository(key: string): SpexRepository {
    const repository = this.repository(key);
    if (!repository) throw new StorageFormatError(join("workspace", key), i18n._({ id: "no records {key} on this computer",
      comment: "Refusal: the key names no project's or group's records under workspace/; {key} is their path", values: { key } }));
    return repository;
  }

  private saveHome(): void {
    if (this.homeProblem) throw new StorageFormatError(this.homeProblem.file, this.homeProblem.reason);
    this.homeFile.save();
  }

  /** `home.yaml` as it stands now (DR-111), read at each of the store's
   * operations and queries — never inside `Home`'s own getters, so a
   * change made and saved in one synchronous step is never read over. A
   * change made since this store last read or wrote it — an editor's —
   * is taken; a file that will not read, or was deleted once read, stands
   * as the home's problem, refusing every write that needs it, and from
   * its first failed read the store answers with an unsaved empty home
   * keeping the device last read, so no remembered pair routes a command
   * and work settling meanwhile stays this device's (storage-2); a
   * repaired file clears it and its pairs read. */
  private refreshHome(): void {
    try { this.homeFile.refresh(); }
    catch (error) {
      if (!(error instanceof StorageFormatError)) throw error;
      if (!this.homeProblem) this.homeFile = this.placeholderHome(this.homeFile.device);
      this.homeProblem = { file: error.file, reason: error.reason, blocking: true };
      return;
    }
    if (this.homeProblem && Home.exists(this.dir)) this.homeProblem = undefined;
  }

  /** A home not yet written, with no pairs: what this store answers
   * while `home.yaml` does not read (storage-2), keeping `device` where
   * one was read before. */
  private placeholderHome(device?: string): Home {
    return Home.create(this.dir, { ...(this.options.own ? { own: this.options.own } : {}), env: this.env, ...(device ? { device } : {}) });
  }

  /** The file the preferences were last read from or written to, by its
   * inode, size and change time: a write by anyone else — a sync's Apply
   * clearing viewed markers — reads as a different stamp. */
  private prefsStamp?: string;

  private stampOf(file: string): string {
    try { const info = statSync(file); return `${info.ino}:${info.size}:${info.mtimeMs}`; }
    catch { return "absent"; }
  }

  /** The preferences as `local/prefs.json` holds them now (storage-5):
   * the in-memory copy is a cache validated by the file's stamp at each
   * use, read again where the file changed (DR-111). */
  private currentPrefs(): Map<string, unknown> {
    const file = prefsFileOf(this.dir);
    const stamp = this.stampOf(file);
    if (stamp !== this.prefsStamp) this.loadPrefs();
    return this.prefs;
  }

  private loadPrefs(): void {
    const prefsFile = prefsFileOf(this.dir);
    this.prefs.clear();
    this.prefsProblem = undefined;
    this.prefsStamp = this.stampOf(prefsFile);
    try {
      for (const [key, value] of Object.entries(existsSync(prefsFile) ? parsePrefs(readJsonFile(prefsFile), prefsFile) : {})) this.prefs.set(key, value);
    } catch (error) {
      if (!(error instanceof StorageFormatError)) throw error;
      this.prefsProblem = {file:error.file, reason:error.reason, blocking:true};
    }
  }

  /** Change the preferences in one synchronous step: read as the file
   * holds them now, changed, and written whole (storage-5). */
  private changePrefs(change: (prefs: Map<string, unknown>) => boolean): void {
    const prefs = this.currentPrefs();
    if (!change(prefs)) return;
    this.savePrefs();
  }

  private savePrefs(): void {
    if (this.prefsProblem) return;
    const file = prefsFileOf(this.dir);
    writeAtomic(
      file,
      JSON.stringify({ format: 1, prefs: Object.fromEntries(this.prefs) }),
    );
    this.prefsStamp = this.stampOf(file);
  }

  private saveForgeCache(): void {
    const file = forgeCacheFileOf(this.dir);
    writeAtomic(
      file,
      JSON.stringify({ format: 1, entries: Object.fromEntries(this.forgeCache) }),
    );
    this.cacheProblem = undefined;
    this.cacheStamp = this.stampOf(file);
  }

  /** The forge cache file as last read or written, by the preferences'
   * stamp: a cache another writer changed, repaired or removed is read
   * again before its diagnostic is reported (storage-12). */
  private cacheStamp?: string;

  // -- load (the restart fold, CORE-10/52) ----------------------------------

  /**
   * After an in-app sync (space-20): each clone it brought gets its
   * `sessions/`, and the preferences and forge cache are read again from
   * the same loaders the restart fold uses; the home, project files and
   * intents are read when asked, and sessions re-index through their own
   * rescan.
   */
  reload(): void {
    this.prepareSessionDirs();
    this.loadApplication();
  }

  private loadApplication(): void {
    this.loadPrefs();
    this.loadForgeCache();
  }

  private loadForgeCache(): void {
    const cacheFile = forgeCacheFileOf(this.dir);
    this.forgeCache.clear();
    this.cacheProblem = undefined;
    this.cacheStamp = this.stampOf(cacheFile);
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
  }

  // -- sessions, one shared store per clone (storage-14) --------------------

  /** A clone's session store; your own group's by default: where the
   * XDG import lands (storage-18) and what a session-less caller reads.
   * A key naming no clone now is refused, never served by another's. */
  sessionStore(key?: string): SharedSessionStore {
    return (key === undefined ? this.ownRepository() : this.requireRepository(key)).store;
  }

  /** A session's open makes its clone's `sessions/` where missing, never
   * the clone (storage-2): one non-recursive, private mkdir, so a clone
   * gone since it was read stays absent. False only where that clone is
   * gone; every other failure is thrown. */
  openSessionsDir(key: string): boolean {
    const repository = this.repository(key);
    if (!repository) return false;
    try { mkdirSync(repository.sessionsDir, { mode: 0o700 }); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return false;
      if (code !== "EEXIST") throw error;
    }
    return true;
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
          if (!sidecar && (await shared.readManifest(id)).schemaVersion === 7) continue;
          const source = readJson<Record<string, unknown>>(sourcePath);
          if (!source) continue;
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
        if (this.repositories.get(repository.key) !== repository) break;
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
    const currentLocation = (): boolean => this.repositories.get(key) === repository &&
      (this.sessionLocations.get(id) ?? this.homeFile.own()) === key;
    const currentRead = (): boolean => currentLocation() && !(live === false && this.localSessions.has(id));
    let manifest: SessionManifest;
    let stored: StoredRecord[];
    let continuable = false;
    let reason: string | undefined;
    // The core's own reason is kept as a fact and phrased when read.
    let recoveryReason = false;
    let incompleteAfterSeq: number | undefined;
    let problem: StorageDiagnostic | undefined;
    let excludeFromSync: boolean | undefined;
    // Publish one observation only while it still describes this location
    // (storage-48), including failures whose fallback could not be read.
    const publishReadStatus = (): boolean => {
      if (!currentRead()) return false;
      if (excludeFromSync === true) this.untrackedSessions.add(id);
      else if (excludeFromSync === false) this.untrackedSessions.delete(id);
      if (problem) this.sessionProblems.set(id, problem);
      else this.sessionProblems.delete(id);
      return true;
    };
    try {
      const checked = await shared.validate(id);
      if (!currentRead()) return;
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
      if (!currentRead()) return;
      reason = error instanceof Error ? error.message : String(error);
      excludeFromSync = true;
      problem = {file:join(shared.sessionsDir, `${id}.json`), reason, blocking: !/unsupported.*version|version.*unsupported/i.test(reason)};
      // Unknown versions remain opaque and readable; these fields only
      // associate history, never authorize recovery or rewrite the file.
      let raw: Record<string, unknown> | undefined;
      // A bounded root keeps association fields readable even when a
      // referenced recovery chunk is damaged. These fields associate
      // history only; shared validation remains execution authority.
      try { raw = readJson<Record<string, unknown>>(join(shared.sessionsDir, `${id}.json`)); }
      catch { publishReadStatus(); return; }
      if (!raw || raw.sessionId !== id || typeof raw.cwd !== "string") { publishReadStatus(); return; }
      manifest = raw as unknown as SessionManifest;
      try {
        const history = await shared.readHistory(id);
        if (!currentRead()) return;
        stored = history.entries.map(({ v: _v, ...entry }) => entry as unknown as StoredRecord);
        if (history.incomplete) incompleteAfterSeq = history.lastReadableSeq;
      } catch { publishReadStatus(); return; }
    }
    if (!currentRead()) return;
    if (manifest.schemaVersion === 7 && !problem) excludeFromSync = false;
    if (typeof manifest.cwd !== "string") {
      problem = {file:join(shared.sessionsDir, `${id}.json`),reason:i18n._({
        id: "session working directory is missing or invalid",
        comment: "Session diagnostic: the session names no readable project folder",
      }),blocking:manifest.schemaVersion === 7};
      publishReadStatus();
      return;
    }
    let players: SessionInfo["players"] = [];
    let initialVisible: string[] = [];
    let hasContext = false;
    // The first runtime record names the session's runtime (storage-43).
    let runtime: AssignedRuntime | null | undefined;
    for (const entry of stored) {
      if (runtime === undefined) runtime = recordedRuntime(entry.record as TmuxPlayRecord);
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
    const writer = live ? "idle" : await shared.readLeaseState(id).catch((error: unknown) => {
      if (!currentRead()) return undefined;
      throw error;
    });
    if (!publishReadStatus()) return;
    // A session's last activity is the latest its own history records
    // (core-service-32): Playbook rewrites the manifest's updatedAt
    // whenever it releases the runtime, which need not be near the last
    // turn, so the manifest speaks only for records that carry no time.
    const lastRecorded = stored.reduce((last, {record}) => hasPresentationHeader(record) ? Math.max(last, record.timestamp) : last, 0);
    const meta: SessionMeta = {
      id, projectId: repository.key, cwd: manifest.cwd,
      createdAt: Date.parse(manifest.createdAt) || stored.find(({record}) => hasPresentationHeader(record))?.record.timestamp || 0,
      endedAt: live ? null : lastRecorded || Date.parse(manifest.updatedAt) || 0,
      live: live ?? prior?.live ?? false,
      ...(writer !== "idle" ? {externalWriter: writer} : {}),
      players, initialVisible, originDir: shared.sessionsDir,
      ...(runtime !== undefined ? { runtime } : {}),
      ...(continuable ? { continuable: true } : {}),
      ...(reason ? { continuationReason: reason } : recoveryReason ? { continuationRecovery: true } : {}),
      ...(manifest.state === "uncertain" && manifest.uncertain
        ? { recovery: {state: "uncertain", input: manifest.uncertain.input, discardable: discardable(manifest)} as const } : {}),
      ...(incompleteAfterSeq !== undefined ? { streamIncompleteAfterSeq: incompleteAfterSeq } : {}),
    };
    const previous = this.records.get(id) ?? [];
    const prefix = previous.every((entry,index) => isDeepStrictEqual(entry, stored[index]));
    if (prefix && previous.length === stored.length && JSON.stringify(prior) === JSON.stringify(meta)) return;
    if (!prefix) this.changePrefs((prefs) => prefs.delete(`viewed:${id}`));
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
    if (this.localSessions.has(id)) return;
    const shared = this.sessionStoreFor(id);
    const key = this.sessionLocations.get(id) ?? this.homeFile.own();
    const repository = this.repositories.get(key);
    const currentLocation = (): boolean => this.repositories.get(key) === repository &&
      (this.sessionLocations.get(id) ?? this.homeFile.own()) === key;
    const writer = await shared.readLeaseState(id).catch((error: unknown) => {
      if (!currentLocation() || this.localSessions.has(id)) return undefined;
      throw error;
    });
    const current = this.sessions.get(id);
    if (!currentLocation() || !current || current.live || this.localSessions.has(id)) return;
    const { externalWriter: _priorWriter, ...unchanged } = current;
    this.sessions.set(id, { ...unchanged, ...(writer === "idle" ? {} : { externalWriter: writer }) });
  }

  /** Each damaged session file's diagnostic while its file stands
   * (storage-12): one whose file is gone since leaves, and so does the
   * mark keeping an unindexed session's files out of Git once none of
   * them stands. */
  sessionDiagnostics(): { file: string; reason: string; blocking: boolean }[] {
    for (const id of [...this.sessionProblems.keys()]) this.sessionProblem(id);
    return [...this.sessionProblems.values()];
  }

  private sessionProblem(id: string): StorageDiagnostic | undefined {
    const problem = this.sessionProblems.get(id);
    if (!problem || existsSync(problem.file)) return problem;
    this.sessionProblems.delete(id);
    const dir = dirname(problem.file);
    if (!this.sessions.has(id) && !existsSync(join(dir, `${id}.json`)) && !existsSync(join(dir, `${id}.records.jsonl`)) && !existsSync(join(dir, `${id}.replay.json`)) && !existsSync(join(dir, `${id}.chunks`))) this.untrackedSessions.delete(id);
    return undefined;
  }

  /** The session files of one clone Playbook has yet to accept, relative
   * to the clone, so its rules keep them out of Git (storage-17). */
  untrackedSessionPaths(key: string): string[] {
    const repository = this.repository(key);
    if (!repository) return [];
    const directory = relative(repository.dir, repository.sessionsDir);
    if (directory.startsWith("..") || isAbsolute(directory)) return [];
    return [...this.untrackedSessions]
      .filter((id) => this.sessionLocations.get(id) === key)
      .flatMap((id) => [join(directory, `${id}.json`), join(directory, `${id}.records.jsonl`), ...[`${id}.replay.json`, `${id}.chunks`].filter((name) => existsSync(join(repository.sessionsDir, name))).map((name) => join(directory, name))]);
  }

  /** Reserve local admission before any asynchronous host/scan work; a
   * new session names the clone it is written into. */
  setLocalSession(id: string, owned: boolean, key?: string): void {
    if (key) this.sessionLocations.set(id, key);
    if (owned) this.localSessions.add(id); else this.localSessions.delete(id);
  }

  /** Refused while `home.yaml`, read now, does not stand (storage-12). */
  assertProjectsWritable(): void {
    this.refreshHome();
    if (this.homeProblem) throw new StorageFormatError(this.homeProblem.file, this.homeProblem.reason);
  }

  /** Whether the ledger's own acts can be written for this project
   * (dashboard-54): a verdict closing an intent goes through
   * assertWritable, and a viewed marker through the preferences file,
   * so a blocking problem in either refuses every answer a summons
   * could have. */
  ledgerActable(projectId: string): boolean {
    this.currentPrefs();
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
    const sessionProblem = scope.sessionId ? this.sessionProblem(scope.sessionId) : undefined;
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

  /** Fold one record this core appended: its turn and usage, and the
   * session's runtime where it is the stream's first runtime record
   * (storage-43). */
  foldStoredRecord(sessionId: string, record: TmuxPlayRecord): void {
    const meta = this.sessions.get(sessionId);
    if (meta && meta.runtime === undefined) {
      const runtime = recordedRuntime(record);
      if (runtime !== undefined) meta.runtime = runtime;
    }
    this.foldRecord(sessionId, record);
  }

  /** The runtime a session is assigned to (storage-43, DR-134): null
   * where its record cannot be read, undefined where it names none or
   * the session is unknown. */
  sessionRuntime(id: string): AssignedRuntime | null | undefined {
    return this.sessions.get(id)?.runtime;
  }

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
    // Read the untouched pre-DR-036 store. Windows uses Node's bundled
    // SQLite so a desktop install needs no Electron-ABI-specific addon.
    const require = createRequire(import.meta.url);
    const Database = (process.platform === "win32" ? require("node:sqlite").DatabaseSync : require("better-sqlite3")) as new (
      path: string,
      options?: { readonly?: boolean; readOnly?: boolean },
    ) => {
      prepare(sql: string): { all(...args: unknown[]): Record<string, unknown>[] };
      close(): void;
    };
    const db = new Database(legacyDbPath, process.platform === "win32" ? { readOnly: true } : { readonly: true });
    try {
      if (process.platform === "win32") db.prepare("PRAGMA schema_version").all();
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
    const project = paired ? this.getProject(paired) : undefined;
    if (project) return project;
    if (paired) throw new StorageFormatError(Home.file(this.dir), i18n._({ id: "path {path} needs explicit rebinding",
      comment: "Refusal: the folder is recorded for a project already, so Add cannot claim it", values: { path: normalized } }));
    const base = repositoryNameFor(name || basename(normalized)).slice(0, -"-spex".length);
    let key = `${this.homeFile.ownName}/${base}-spex`;
    for (let n = 2; existsSync(this.homeFile.clonePath(key)) || this.homeFile.folderOf(key); n += 1) {
      key = `${this.homeFile.ownName}/${base}-${n}-spex`;
    }
    const dir = this.homeFile.clonePath(key);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeApplicationFile(join(dir, "project.json"), { format: 1, name: name || basename(normalized), remote: folderRemote(normalized, this.env) });
    // The environment lives with the code (environments-26): written at
    // the working folder's root where it holds no `spex.yaml`, a stray
    // lock left as it is, a folder holding one being installed from it,
    // never in the clone (storage-6).
    if (!existsSync(join(normalized, "spex.yaml"))) this.prepareRepository(dir, key, normalized);
    this.initializeRepository(dir);
    this.homeFile.pair(normalized, key);
    this.saveHome();
    this.prepareSessionDirs();
    return this.getProject(key)!;
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
    return this.getProject(repository.key)!;
  }

  /** The account a sign-in at an instance read, written into that
   * origin's entry in `home.yaml` — appended after the listed ones where
   * none stands, signed in again where one does (storage-2). */
  signIn(origin: string, account: { id: string; login: string; displayName: string | null }): void {
    this.assertProjectsWritable();
    this.homeFile.signIn(origin, account);
    this.saveHome();
  }

  /** A listed instance's display name as its last read named it
   * (storage-2), written only where it changed; a home that does not
   * read keeps it unwritten until a later read. */
  setDisplayName(origin: string, displayName: string): void {
    this.refreshHome();
    if (this.homeProblem) return;
    const entry = this.homeFile.instance(origin);
    if (!entry || entry.displayName === displayName) return;
    this.homeFile.setDisplayName(origin, displayName);
    this.saveHome();
  }

  /** This device's user name as your own group's folder name: the name a
   * new home's folder takes, which a sign-in renames while the folder
   * still bears it (storage-2, space-59). */
  deviceOwnName(): string {
    return this.options.own ?? defaultOwnName(this.env);
  }

  /** An instance's credential went — the default instance's where none
   * is named; its account stays, marked signed out (git-host-4,
   * git-host-10). */
  signOut(origin?: string): void {
    this.refreshHome();
    if (this.homeProblem) return;
    this.homeFile.signOut(origin);
    this.saveHome();
  }

  /** A signed-out instance's entry removed from `home.yaml` (space-82,
   * storage-2); one still signed in is refused, its entry kept, as
   * InstanceRefused. False where the home listed none at that origin. */
  forget(origin: string): boolean {
    this.assertProjectsWritable();
    const removed = this.homeFile.forget(origin);
    if (removed) this.saveHome();
    return removed;
  }

  /**
   * Clones the caller already moved on disk (space-59, space-60): every
   * pair naming a moved key names its new one in `home.yaml`, your own
   * group's name follows where it was renamed, and the indexes — clones,
   * sessions, the preferences keyed by repository — follow in the same
   * step, so no reader sees a key that names nothing; intents are read
   * where their clones now lie.
   */
  moveRepositories(moves: { from: string; to: string }[], own?: string): void {
    this.assertProjectsWritable();
    if (moves.length === 0 && own === undefined) return;
    this.homeFile.move(moves, own);
    this.saveHome();
    const to = new Map(moves.map((entry) => [entry.from, entry.to]));
    for (const { from } of moves) this.repositories.delete(from);
    this.prepareSessionDirs();
    for (const [id, location] of [...this.sessionLocations]) {
      const next = to.get(location);
      if (!next) continue;
      this.sessionLocations.set(id, next);
      // A damaged session's diagnostic names its file where the clone now lies.
      const problem = this.sessionProblems.get(id);
      const inside = problem ? relative(this.homeFile.clonePath(location), problem.file) : "..";
      if (problem && inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)) this.sessionProblems.set(id, { ...problem, file: join(this.homeFile.clonePath(next), inside) });
    }
    for (const [id, meta] of [...this.sessions]) {
      const next = to.get(meta.projectId);
      if (!next) continue;
      const repository = this.repositories.get(next);
      this.sessions.set(id, { ...meta, projectId: next, ...(repository && meta.originDir ? { originDir: repository.sessionsDir } : {}) });
    }
    this.changePrefs((prefs) => {
      let changed = false;
      for (const { from, to: next } of moves) {
        for (const key of [...prefs.keys()].filter((name) => name.startsWith(`sync:${from}:`))) {
          prefs.set(`sync:${next}:${key.slice(`sync:${from}:`.length)}`, prefs.get(key));
          prefs.delete(key);
          changed = true;
        }
      }
      return changed;
    });
    for (const { from, to: next } of moves) {
      const cached = this.forgeCache.get(from);
      if (cached) { this.forgeCache.delete(from); this.forgeCache.set(next, cached); }
    }
    // A deferred clone moved is the migration's no longer (DR-127).
    this.settleDeferred(moves.map((move) => move.from));
  }

  /** Deferred clones moved, removed or found to be another clone at
   * their key: the instances migration's receipt names them no more, so
   * no later start or sync moves a clone made at that key since
   * (DR-127). */
  settleDeferred(keys: readonly string[]): void {
    const settled = keys.filter((key) => this.deferred.some((move) => move.from === key));
    if (settled.length === 0) return;
    this.deferred = this.deferred.filter((move) => !settled.includes(move.from));
    try { settleDeferred(this.dir, settled); }
    catch (error) { console.error(`spex: the instances migration's receipt still names ${settled.join(", ")}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /** A clone that came under `workspace/` from outside the store — a
   * join's — gets its `sessions/` (space-63); its intents are read when
   * asked. */
  adoptRepositories(): void {
    this.prepareSessionDirs();
  }

  /** Forget the pair and delete the clone (projects-9, projects-10); the
   * working folder stays as it is. */
  removeProject(key: string): boolean {
    this.assertProjectsWritable();
    const folder = this.homeFile.folderOf(key);
    const repository = this.repository(key);
    if (!folder && !repository) return false;
    try { this.onProjectRemoving?.(key, folder?.path); }
    catch (error) { console.error(`spex: exports of ${key} were not removed: ${error instanceof Error ? error.message : String(error)}`); }
    if (folder) { this.homeFile.unpair(key); this.saveHome(); }
    if (repository && key !== this.homeFile.own()) {
      for (const [id, location] of [...this.sessionLocations]) if (location === key) { this.dropSession(id); this.sessionLocations.delete(id); }
      rmSync(repository.dir, { recursive: true, force: true });
      this.repositories.delete(key);
      // A deferred clone removed waits for no move (DR-127).
      this.settleDeferred([key]);
    }
    return true;
  }

  /** Every damaged or unresolved stored file as the files read now
   * (core-service-86, storage-12): a repaired or removed file's report
   * leaves with it. */
  storageDiagnostics(): StorageDiagnostic[] {
    this.currentPrefs();
    if (this.stampOf(forgeCacheFileOf(this.dir)) !== this.cacheStamp) this.loadForgeCache();
    this.refreshHome();
    const repositories = this.listRepositories();
    const reports: StorageDiagnostic[] = [
      ...(this.homeProblem ? [this.homeProblem] : []),
      ...this.readIntents().problems,
      ...repositories.flatMap((repository) => this.readProjectFile(repository).problem ?? []),
      // A placement file that will not read names no placement, blocking
      // nothing (storage-12, storage-41).
      ...repositories.flatMap((repository) => readPlacementFiles(repository.dir).problems.map((problem) => ({ file: join(repository.dir, problem.file), reason: problem.reason, blocking: false }))),
      ...(this.prefsProblem ? [this.prefsProblem] : []),
      ...(this.cacheProblem ? [this.cacheProblem] : []),
    ];
    // A deferred clone whose destination is taken waits there, named
    // by that destination until it is moved aside (DR-127).
    for (const move of this.deferredMoves()) {
      const target = this.homeFile.clonePath(move.to);
      if (!occupied(this.homeFile.clonePath(move.from), target, this.homeFile.workspace)) continue;
      reports.push({ file: relative(this.dir, target), reason: deferredDestinationTaken(move.from), blocking: false });
    }
    const paired = new Set(this.homeFile.folders().map((folder) => folder.repository));
    for (const repository of repositories) {
      if (paired.has(repository.key)) continue;
      const held = [...this.sessions.values()].filter((meta) => meta.projectId === repository.key);
      // Your own group's clone needs a folder only once it holds sessions.
      if (repository.key === this.homeFile.own() && held.length === 0) continue;
      const directories = [...new Set(held.map((meta) => meta.cwd).filter((cwd): cwd is string => typeof cwd === "string"))].sort();
      const { group, name } = splitKey(repository.key);
      const label = this.readProjectFile(repository).file?.name ?? name;
      reports.push({
        file: relative(this.dir, repository.dir),
        reason: unpairedReason(label),
        blocking: false,
        repair: { kind: "repository", repository: repository.key, name, group, directories, sessions: held.length, key: repairKey(repository.key, directories) },
      });
    }
    const cloned = new Set(repositories.map((repository) => repository.key));
    for (const folder of this.homeFile.folders()) {
      if (cloned.has(folder.repository)) continue;
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

  /** Each paired folder's project, as `home.yaml`, its clone and its
   * `project.json` stand now (storage-2, storage-3). */
  listProjects(): ProjectInfo[] {
    this.refreshHome();
    const repositories = this.currentRepositories();
    return this.homeFile.folders()
      .flatMap((folder) => {
        const repository = repositories.get(folder.repository);
        return repository ? [this.projectInfo(repository, folder.path)] : [];
      })
      .sort((a, b) => a.registeredAt - b.registeredAt || a.id.localeCompare(b.id));
  }

  getProject(id: string): ProjectInfo | undefined {
    this.refreshHome();
    const folder = this.homeFile.folderOf(id);
    const repository = folder ? this.repository(id) : undefined;
    return folder && repository ? this.projectInfo(repository, folder.path) : undefined;
  }

  getProjectByPath(path: string): ProjectInfo | undefined {
    this.refreshHome();
    const key = this.homeFile.keyForFolder(path);
    return key ? this.getProject(key) : undefined;
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
    this.continuationRefusals.delete(id);
    this.sessionProblems.delete(id);
    this.untrackedSessions.delete(id);
    this.records.delete(id);
    this.turns.delete(id);
    this.usage.delete(id);
    this.changePrefs((prefs) => [prefs.delete(`viewed:${id}`), prefs.delete(agentSettingsKey(id)), prefs.delete(parkedRunKey(id))].some(Boolean));
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
    const project = this.getProject(meta.projectId);
    if (!project) return undefined;
    // The project's read took `home.yaml` as it stands: its device is
    // this runtime's (DR-134).
    return this.summarize(meta, project.path, this.homeFile.device);
  }

  /** A settled checkpoint this runtime may continue: never one of a
   * session assigned to another runtime (core-service-32, DR-134). */
  hasContinuableCheckpoint(id: string): boolean {
    const meta = this.sessions.get(id);
    return !!meta?.continuable && !meta.live && !meta.externalWriter &&
      (meta.runtime === undefined || runsElsewhere(meta.runtime, this.home.device) === undefined);
  }

  setContinuationRefusal(id: string, reason: string | undefined): void {
    if (reason === undefined) this.continuationRefusals.delete(id);
    else this.continuationRefusals.set(id, reason);
  }

  /** `device` is this runtime's, read once per listing (DR-134). */
  private summarize(meta: SessionMeta, path: string, device: string): SessionInfo {
    const turns = [...(this.turns.get(meta.id)?.values() ?? [])].sort(
      (a, b) => a.turnId - b.turnId,
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
    // Whether a failure still stands, read from the visible stream as
    // the ledger reads it — never whether one was ever recorded
    // (core-service-32, DR-061). A record without a presentation
    // header is opaque and says nothing (core-service-10).
    const failed = failureStands(records.filter((entry) =>
      hasPresentationHeader(entry.record) && !isHidden(entry.record)));
    const agentActiveMs = complete ? foldAgentActiveMs(records) : undefined;
    const agentReportedModels = complete ? foldAgentReportedModels(records) : undefined;
    const words = (turn: TurnRow | undefined): string | undefined =>
      turn?.prompt.trim() ? turn.prompt : turn?.attachmentTitle;
    // The work the session is doing is named by the turn that opened
    // it, as its stand-in entries are (core-service-49, DR-119): an
    // answer sent while a question stood is a turn of that work.
    const opening = turns.length > 1
      ? openingTurn(turns, answeringTurnIds(this.getRecords(meta.id)))
      : turns[0];
    const summary = sessionInfo(
      meta,
      path,
      words(turns[0]),
      words(opening),
      turns.length,
      failed,
      cost,
      this.sessionAgentSettings(meta.id),
      agentActiveMs,
      agentReportedModels,
      this.parkedRun(meta.id),
      // A session this core holds runs here; any other assigned to
      // another runtime runs there alone (core-service-32, DR-134).
      meta.live ? undefined : runsElsewhere(meta.runtime, device),
    );
    const refusal = this.continuationRefusals.get(meta.id);
    if (summary.continuable && refusal !== undefined) {
      delete summary.continuable;
      summary.continuationReason = refusal;
    }
    return summary;
  }

  listSessions(): SessionInfo[] {
    const out: SessionInfo[] = [];
    const projects = new Map(this.listProjects().map((project) => [project.id, project]));
    // Read with the projects, once for the listing (DR-134).
    const device = this.homeFile.device;
    for (const meta of [...this.sessions.values()].sort(
      (a, b) => a.createdAt - b.createdAt,
    )) {
      const project = projects.get(meta.projectId);
      // A session whose project left the registry stays on disk but
      // out of the listing (DR-036).
      if (!project) continue;
      out.push(this.summarize(meta, project.path, device));
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

  /** Every intent as the files of every clone read now (storage-4,
   * DR-111): each readable file by its id — the first clone by key
   * holding it — and a diagnostic for each file that will not read or
   * repeats an id, its intent listed nowhere. Nothing is kept between
   * reads. */
  private readIntents(): { intents: Map<string, { intent: IntentInfo; repository: SpexRepository }>; problems: StorageDiagnostic[] } {
    const intents = new Map<string, { intent: IntentInfo; repository: SpexRepository }>();
    const problems: StorageDiagnostic[] = [];
    for (const repository of this.listRepositories()) {
      const read = readIntentFiles(repository.intentsDir);
      problems.push(...read.problems);
      for (const file of read.intents) {
        if (intents.has(file.id)) {
          const path = join(repository.intentsDir, `${file.id}.json`);
          problems.push({ file: path, reason: i18n._({
            id: "duplicate queue {intentId}",
            comment: "Storage diagnostic: two acts queue the same intent",
            values: { intentId: file.id },
          }), blocking: false });
          continue;
        }
        intents.set(file.id, { intent: intentInfoOf(file, repository.key), repository });
      }
    }
    return { intents, problems };
  }

  /** One intent as its file reads at this instant (DR-111): an edit since
   * the last read is taken, and a file gone meanwhile names no intent;
   * a file of its id that will not read is refused with its cause. Each
   * write that follows lands in the same synchronous step. */
  private requireIntent(id: string): { intent: IntentInfo; repository: SpexRepository } {
    const { intents, problems } = this.readIntents();
    const found = intents.get(id);
    if (found) return found;
    const damaged = problems.find((problem) => basename(problem.file) === `${id}.json`);
    if (damaged) throw new StorageFormatError(damaged.file, damaged.reason);
    throw new StorageFormatError(join("intents", `${id}.json`), i18n._({
      id: "no intent {intentId}", comment: "Refusal: no intent of this id is in the ledger", values: { intentId: id } }));
  }

  /** An intent as its file reads now, or undefined where none stands. */
  currentIntent(id: string): IntentInfo | undefined {
    const { intents, problems } = this.readIntents();
    const found = intents.get(id);
    if (found) return structuredClone(found.intent);
    const damaged = problems.find((problem) => basename(problem.file) === `${id}.json`);
    if (damaged) throw new StorageFormatError(damaged.file, damaged.reason);
    return undefined;
  }

  /** Rewrite one intent's file whole (storage-4), as the intent read:
   * its format and runtime kept as they were. */
  private writeIntent(repository: SpexRepository, intent: IntentInfo): void {
    this.assertWritable({ projectId: intent.projectId });
    writeIntentFile(repository.intentsDir, intentFileOf(intent));
  }

  /** The directory beside an intent's file holding its attachments. */
  intentAssetsDir(id: string, projectId?: string): string {
    const key = projectId ?? this.readIntents().intents.get(id)?.repository.key;
    if (!key) throw new StorageFormatError(join("intents", `${id}.assets`), i18n._({
      id: "no intent {intentId}", comment: "Refusal: no intent of this id is in the ledger", values: { intentId: id } }));
    return join(this.requireRepository(key).intentsDir, `${id}.assets`);
  }

  /** Store a new intent as one file of its project's spex repository
   * (core-service-42): refused where any clone's intent holds its id or
   * a file stands at its name, read now and checked again at the instant
   * of the write, so no file is replaced. */
  addIntent(intent: IntentInfo): void {
    const repository = this.requireRepository(intent.projectId);
    this.assertWritable({ projectId: intent.projectId });
    const file = join(repository.intentsDir, `${intent.id}.json`);
    const duplicate = (): StorageFormatError => new StorageFormatError(file, i18n._({
      id: "duplicate queue {intentId}", comment: "Storage diagnostic: two acts queue the same intent", values: { intentId: intent.id } }));
    if (this.readIntents().intents.has(intent.id) || existsSync(file)) throw duplicate();
    try { writeIntentFile(repository.intentsDir, intentFileOf(structuredClone(intent)), true); }
    catch (error) {
      if (error instanceof VersionConflictError) throw duplicate();
      throw error;
    }
  }

  getIntent(id: string): IntentInfo | undefined {
    const found = this.readIntents().intents.get(id);
    return found ? structuredClone(found.intent) : undefined;
  }

  /** Every intent the files hold now, as stored. */
  private currentIntents(): IntentInfo[] {
    return [...this.readIntents().intents.values()].map((entry) => entry.intent);
  }

  /** The open intent holding a source artifact, if any (DR-035). */
  openIntentBySource(
    projectId: string,
    kind: IntentSourceKind,
    ref: string,
  ): IntentInfo | undefined {
    for (const intent of this.currentIntents()) {
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
    const projects = new Set(this.listProjects().map((project) => project.id));
    return this.currentIntents()
      .filter((intent) => intent.closedAt === undefined && projects.has(intent.projectId))
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
    return this.currentIntents()
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
    return this.currentIntents()
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
  }

  // -- prefs ----------------------------------------------------------------

  setPref(key: string, value: unknown): void {
    this.currentPrefs();
    if (this.prefsProblem) throw new StorageFormatError(this.prefsProblem.file, this.prefsProblem.reason);
    this.changePrefs((prefs) => { prefs.set(key, value); return true; });
  }

  /** The config the core seeded here, by its path and the version it
   * wrote (storage-5, DR-156); a preferences file that cannot be
   * written leaves the seed unrecorded, so it is never reseeded. */
  recordSeed(path: string, version: string): void {
    try { this.setPref(SEED_PREF, { path, version } satisfies SeedRecord); } catch { /* unrecorded */ }
  }

  getPref<T>(key: string): T | undefined {
    const prefs = this.currentPrefs();
    return prefs.has(key) ? (prefs.get(key) as T) : undefined;
  }

  /** The preference keys under one prefix, so a family can be pruned
   * of records naming things that no longer stand (space-54). */
  prefKeys(prefix: string): string[] {
    return [...this.currentPrefs().keys()].filter((key) => key.startsWith(prefix));
  }

  /** One of a placement's records in this device's preferences
   * (storage-5): under its remote's name, else, for the clone's first
   * placement (`first`), what a Spex before DR-128 recorded for the
   * repository. */
  placementPref<T>(key: string, name: string, kind: PlacementPrefKind, first: boolean): T | undefined {
    const prefs = this.currentPrefs();
    const own = placementPrefKey(key, name, kind);
    if (prefs.has(own)) return prefs.get(own) as T;
    const former = formerPlacementPrefKey(key, kind);
    return first && prefs.has(former) ? (prefs.get(former) as T) : undefined;
  }

  /** Record one of a placement's records (storage-5), in one step with
   * the read: for the clone's first placement (`first`), what a Spex
   * before DR-128 recorded for the repository becomes its own first —
   * the record written replacing its kind, the other moved under the
   * placement's name where none stands there — and the former keys
   * leave, so no later first placement reads them. */
  setPlacementPref(key: string, name: string, kind: PlacementPrefKind, value: unknown, first: boolean): void {
    this.currentPrefs();
    if (this.prefsProblem) throw new StorageFormatError(this.prefsProblem.file, this.prefsProblem.reason);
    this.changePrefs((prefs) => {
      if (first) adoptFormerPlacementPrefs(prefs, key, name);
      prefs.set(placementPrefKey(key, name, kind), value);
      return true;
    });
  }

  /** What a Spex before DR-128 recorded for a repository made its
   * current first placement's own, `name` (storage-5), as another
   * placement comes before it, so the record stays with the placement
   * it was read as. */
  adoptFormerPlacementPrefs(key: string, name: string): void {
    this.changePrefs((prefs) => adoptFormerPlacementPrefs(prefs, key, name));
  }

  /** A placement's records follow its remote's rename (storage-5): in
   * one step, re-keyed from its former name to `to`, nothing left under
   * either but what the placement recorded. */
  renamePlacementPrefs(key: string, from: string, to: string): void {
    if (from === to) return;
    this.changePrefs((prefs) => {
      let changed = false;
      for (const kind of PLACEMENT_PREF_KINDS) {
        const was = placementPrefKey(key, from, kind);
        const next = placementPrefKey(key, to, kind);
        if (prefs.has(was)) {
          prefs.set(next, prefs.get(was));
          prefs.delete(was);
          changed = true;
        } else if (prefs.delete(next)) changed = true;
      }
      return changed;
    });
  }

  /** A placement's records leave with its remote (storage-5, space-5):
   * in one step, those under its name, and, for the clone's first
   * placement (`first`), what a Spex before DR-128 recorded for the
   * repository; `kinds` limits them. */
  dropPlacementPrefs(key: string, name: string, first: boolean, kinds: readonly PlacementPrefKind[] = PLACEMENT_PREF_KINDS): void {
    this.changePrefs((prefs) => {
      let changed = false;
      for (const kind of kinds) {
        if (prefs.delete(placementPrefKey(key, name, kind))) changed = true;
        if (first && prefs.delete(formerPlacementPrefKey(key, kind))) changed = true;
      }
      return changed;
    });
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
    this.currentPrefs();
    if (this.prefsProblem) throw new StorageFormatError(this.prefsProblem.file, this.prefsProblem.reason);
    this.changePrefs((prefs) => prefs.delete(key));
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

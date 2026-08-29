// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The file state (DR-036, CORE-15): plain files under one state root
// are the durable truth, and every in-memory index rebuilds from them
// at startup. The core package is the only writer of the Spex-owned
// files. Sessions persist as one record-stream JSONL plus a project-
// binding sidecar per session; turns, titles, and usage fold from the
// stream and are never separately stored (CORE-10). Intents persist
// as per-project append-only act logs (CORE-52). Hidden records ride
// the stream with their visibility, so replay filters identically to
// live streaming. A root lease admits one core per root (CORE-61),
// and a legacy SQLite store imports once (CORE-64) through
// better-sqlite3 — the import path's only remaining use.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import type {
  ForgeState,
  IntentInfo,
  IntentSource,
  IntentSourceKind,
  ProjectInfo,
  SessionInfo,
  StoredRecord,
  TmuxPlayRecord,
} from "./protocol.js";
import {
  foldTurnEvent,
  foldUsage,
  type UsageEntry,
  type UsageTotals,
} from "./stream-fold.js";

export type { UsageEntry, UsageTotals } from "./stream-fold.js";

const META_VERSION = 1;

/** Another core instance holds the state root (CORE-61). */
export class StateRootHeldError extends Error {
  constructor(
    readonly holder: { pid: number; hostname: string; acquiredAt: number },
    dir: string,
  ) {
    super(
      `state root ${dir} is held by pid ${holder.pid} on ${holder.hostname}; ` +
        "one core serves a root at a time (DR-036)",
    );
    this.name = "StateRootHeldError";
  }
}

export interface StoreOptions {
  /** State root directory; unset runs the store in memory only. */
  dir?: string;
  /** Sessions directory; defaults to `<dir>/sessions`. */
  sessionsDir?: string;
  /** A legacy SQLite store to import once (CORE-64). */
  legacyDbPath?: string;
}

interface SessionMeta {
  id: string;
  projectId: string;
  createdAt: number;
  endedAt: number | null;
  live: boolean;
  players: SessionInfo["players"];
  initialVisible: string[];
}

interface TurnRow {
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

type IntentAct =
  | { act: "queue"; intent: IntentInfo }
  | { act: "edit"; id: string; text: string }
  | { act: "move"; id: string; rank: string }
  | { act: "link"; id: string; afterId: string | null }
  | { act: "dispatch"; id: string; sessionId: string; turnId: number; at: number }
  | { act: "close"; id: string; as: "done" | "dropped"; at: number };

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
): SessionInfo {
  return {
    id: meta.id,
    projectId: meta.projectId,
    projectPath: path,
    createdAt: meta.createdAt,
    live: meta.live,
    endedAt: meta.endedAt,
    players: meta.players,
    initialVisible: meta.initialVisible,
    ...(title !== undefined ? { title } : {}),
    turns,
    failed,
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
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

/** JSONL lines, tolerating one torn trailing line from a crash. */
function readLines<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8").split("\n");
  const out: T[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch (error) {
      if (i === lines.length - 1) break;
      throw error;
    }
  }
  return out;
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

export class Store {
  private readonly dir?: string;
  private readonly sessionsDir?: string;
  private lockDir?: string;

  private meta: StoreMeta = { version: META_VERSION };
  private readonly projects = new Map<string, ProjectInfo>();
  private readonly prefs = new Map<string, unknown>();
  private readonly forgeCache = new Map<string, { at: number; state: ForgeState }>();
  private readonly intents = new Map<string, IntentInfo>();
  private readonly sessions = new Map<string, SessionMeta>();
  private readonly records = new Map<string, StoredRecord[]>();
  private readonly turns = new Map<string, Map<number, TurnRow>>();
  private readonly usage = new Map<string, UsageEntry[]>();

  constructor(options: StoreOptions = {}) {
    this.dir = options.dir;
    if (!this.dir) return;
    mkdirSync(this.dir, { recursive: true });
    this.sessionsDir = options.sessionsDir ?? join(this.dir, "sessions");
    mkdirSync(this.sessionsDir, { recursive: true });
    mkdirSync(join(this.dir, "intents"), { recursive: true });
    this.acquireRootLease();
    try {
      this.meta = readJson<StoreMeta>(this.metaFile()) ?? { version: 0 };
      this.importLegacy(options.legacyDbPath);
      this.meta.version = META_VERSION;
      writeAtomic(this.metaFile(), JSON.stringify(this.meta));
      this.load();
    } catch (error) {
      this.releaseRootLease();
      throw error;
    }
  }

  // -- root lease (CORE-61) -------------------------------------------------

  private acquireRootLease(): void {
    const dir = this.dir as string;
    const lock = join(dir, ".lock");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        mkdirSync(lock);
        writeAtomic(
          join(lock, "owner.json"),
          JSON.stringify({ pid: process.pid, hostname: hostname(), acquiredAt: Date.now() }),
        );
        this.lockDir = lock;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const owner = readJson<{ pid: number; hostname: string; acquiredAt: number }>(
          join(lock, "owner.json"),
        );
        // A foreign host's lease is never broken (DR-036): liveness
        // cannot be probed across machines.
        if (owner && owner.hostname !== hostname()) {
          throw new StateRootHeldError(owner, dir);
        }
        if (owner && processAlive(owner.pid)) {
          throw new StateRootHeldError(owner, dir);
        }
        // Same host, dead pid (or an unreadable lock): retire and retry.
        rmSync(lock, { recursive: true, force: true });
      }
    }
    throw new Error(`state root ${dir} lease could not be acquired`);
  }

  private releaseRootLease(): void {
    if (this.lockDir) rmSync(this.lockDir, { recursive: true, force: true });
    this.lockDir = undefined;
  }

  // -- files ----------------------------------------------------------------

  private metaFile(): string {
    return join(this.dir as string, "meta.json");
  }

  private sidecarFile(sessionId: string): string {
    return join(this.sessionsDir as string, `${sessionId}.spex.json`);
  }

  private recordsFile(sessionId: string): string {
    return join(this.sessionsDir as string, `${sessionId}.records.jsonl`);
  }

  private intentsFile(projectId: string): string {
    return join(this.dir as string, "intents", `${projectId}.jsonl`);
  }

  private saveProjects(): void {
    if (!this.dir) return;
    writeAtomic(
      join(this.dir, "projects.json"),
      JSON.stringify([...this.projects.values()]),
    );
  }

  private savePrefs(): void {
    if (!this.dir) return;
    writeAtomic(
      join(this.dir, "prefs.json"),
      JSON.stringify(Object.fromEntries(this.prefs)),
    );
  }

  private saveForgeCache(): void {
    if (!this.dir) return;
    writeAtomic(
      join(this.dir, "forge-cache.json"),
      JSON.stringify(Object.fromEntries(this.forgeCache)),
    );
  }

  private saveSidecar(meta: SessionMeta): void {
    if (!this.sessionsDir) return;
    writeAtomic(this.sidecarFile(meta.id), JSON.stringify(meta));
  }

  private appendIntentAct(projectId: string, act: IntentAct): void {
    if (!this.dir) return;
    appendFileSync(this.intentsFile(projectId), `${JSON.stringify(act)}\n`);
  }

  // -- load (the restart fold, CORE-10/52) ----------------------------------

  private load(): void {
    const dir = this.dir as string;
    for (const project of readJson<ProjectInfo[]>(join(dir, "projects.json")) ?? []) {
      this.projects.set(project.id, project);
    }
    for (const [key, value] of Object.entries(
      readJson<Record<string, unknown>>(join(dir, "prefs.json")) ?? {},
    )) {
      this.prefs.set(key, value);
    }
    for (const [projectId, entry] of Object.entries(
      readJson<Record<string, { at: number; state: ForgeState }>>(
        join(dir, "forge-cache.json"),
      ) ?? {},
    )) {
      this.forgeCache.set(projectId, entry);
    }
    for (const file of readdirSync(join(dir, "intents"))) {
      if (!file.endsWith(".jsonl")) continue;
      for (const act of readLines<IntentAct>(join(dir, "intents", file))) {
        this.foldIntentAct(act);
      }
    }
    const sessionsDir = this.sessionsDir as string;
    for (const file of readdirSync(sessionsDir)) {
      if (!file.endsWith(".spex.json")) continue;
      const meta = readJson<SessionMeta>(join(sessionsDir, file));
      if (!meta) continue;
      this.sessions.set(meta.id, meta);
      const stored = readLines<StoredRecord>(this.recordsFile(meta.id));
      this.records.set(meta.id, stored);
      // Turns, titles, and usage are never separately stored: the
      // stream is the truth and the restart folds it (core-service-10).
      for (const entry of stored) {
        this.foldRecord(meta.id, entry.record);
      }
    }
  }

  private foldIntentAct(act: IntentAct): void {
    if (act.act === "queue") {
      this.intents.set(act.intent.id, { ...act.intent });
      return;
    }
    const intent = this.intents.get(act.id);
    if (!intent) return;
    switch (act.act) {
      case "edit":
        intent.text = act.text;
        break;
      case "move":
        intent.rank = act.rank;
        break;
      case "link":
        if (act.afterId === null) delete intent.afterId;
        else intent.afterId = act.afterId;
        break;
      case "dispatch":
        intent.dispatched = { sessionId: act.sessionId, turnId: act.turnId, at: act.at };
        break;
      case "close":
        intent.closedAt = act.at;
        intent.closedAs = act.as;
        break;
    }
  }

  private foldRecord(sessionId: string, record: TmuxPlayRecord): void {
    const turnEvent = foldTurnEvent(record);
    if (turnEvent) {
      if (turnEvent.kind === "start") {
        this.startTurnInMemory(sessionId, turnEvent.turnId, turnEvent.prompt, turnEvent.at);
      } else {
        this.endTurnInMemory(sessionId, turnEvent.turnId, turnEvent.status, turnEvent.at);
      }
    }
    const usage = foldUsage(sessionId, record);
    if (usage) this.usageOf(sessionId).push(usage);
  }

  // -- legacy import (CORE-64) ----------------------------------------------

  private importLegacy(legacyDbPath: string | undefined): void {
    if (!legacyDbPath || !existsSync(legacyDbPath)) return;
    if (this.meta.importedLegacy?.includes(legacyDbPath)) return;
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
      const projects = db
        .prepare("SELECT id, path, name, registered_at FROM projects")
        .all() as { id: string; path: string; name: string; registered_at: number }[];
      const rows = (sql: string): Record<string, unknown>[] => {
        try {
          return db.prepare(sql).all();
        } catch {
          // A table an older release never created imports as empty.
          return [];
        }
      };
      const dir = this.dir as string;
      writeAtomic(
        join(dir, "projects.json"),
        JSON.stringify(
          projects.map((row) => ({
            id: row.id,
            path: row.path,
            name: row.name,
            registeredAt: row.registered_at,
          })),
        ),
      );
      const prefs: Record<string, unknown> = {};
      for (const row of rows("SELECT key, value_json FROM prefs")) {
        prefs[row.key as string] = JSON.parse(row.value_json as string);
      }
      writeAtomic(join(dir, "prefs.json"), JSON.stringify(prefs));
      for (const row of rows("SELECT * FROM intents ORDER BY created_at, id")) {
        const source: IntentSource | undefined =
          row.source_kind != null && row.source_ref != null
            ? {
                kind: row.source_kind as IntentSource["kind"],
                ref: row.source_ref as string,
                ...(row.source_url != null ? { url: row.source_url as string } : {}),
              }
            : undefined;
        const intent: IntentInfo = {
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
        this.appendIntentAct(intent.projectId, { act: "queue", intent });
      }
      for (const row of rows(
        "SELECT id, project_id, created_at, ended_at, players_json, initial_visible_json FROM sessions",
      )) {
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
        this.saveSidecar(meta);
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
            record: JSON.parse(rec.payload_json as string) as TmuxPlayRecord,
            ...(rec.role != null ? { role: rec.role as string } : {}),
          };
          lines.push(JSON.stringify(stored));
        }
        if (lines.length > 0) {
          writeAtomic(this.recordsFile(meta.id), `${lines.join("\n")}\n`);
        }
      }
    } finally {
      db.close();
    }
    this.meta.importedLegacy = [...(this.meta.importedLegacy ?? []), legacyDbPath];
  }

  close(): void {
    this.releaseRootLease();
  }

  // -- projects -------------------------------------------------------------

  registerProject(path: string, name: string, at: number): ProjectInfo {
    const existing = this.getProjectByPath(path);
    if (existing) return existing;
    const project: ProjectInfo = { id: randomUUID(), path, name, registeredAt: at };
    this.projects.set(project.id, project);
    this.saveProjects();
    return project;
  }

  listProjects(): ProjectInfo[] {
    return [...this.projects.values()].sort((a, b) => a.registeredAt - b.registeredAt);
  }

  getProject(id: string): ProjectInfo | undefined {
    return this.projects.get(id);
  }

  getProjectByPath(path: string): ProjectInfo | undefined {
    return this.listProjects().find((project) => project.path === path);
  }

  removeProject(id: string): boolean {
    const removed = this.projects.delete(id);
    if (removed) this.saveProjects();
    return removed;
  }

  // -- sessions -------------------------------------------------------------

  createSession(session: SessionInfo): void {
    const meta: SessionMeta = {
      id: session.id,
      projectId: session.projectId,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      live: session.live,
      players: session.players,
      initialVisible: session.initialVisible,
    };
    this.sessions.set(meta.id, meta);
    this.saveSidecar(meta);
  }

  endSession(id: string, endedAt: number): void {
    const meta = this.sessions.get(id);
    if (!meta) return;
    meta.live = false;
    meta.endedAt = endedAt;
    this.saveSidecar(meta);
  }

  /** Startup recovery (CORE-10): a session live at shutdown is no longer live. */
  markAllSessionsNotLive(): void {
    for (const meta of this.sessions.values()) {
      if (!meta.live) continue;
      meta.live = false;
      this.saveSidecar(meta);
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
      (entry) => entry.record.type === "runtime_error",
    );
    const costed = (this.usage.get(meta.id) ?? []).filter(
      (entry) => entry.totalCostUsd !== undefined,
    );
    const cost =
      costed.length > 0
        ? costed.reduce((sum, entry) => sum + (entry.totalCostUsd ?? 0), 0)
        : undefined;
    return sessionInfo(meta, path, turns[0]?.prompt, turns.length, failed, cost);
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
  ): void {
    this.turnsOf(sessionId).set(turnId, {
      turnId,
      prompt,
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
      if (entry.record.type !== "runtime_error") continue;
      const turnId = entry.record.turnId;
      if (turnId !== null && turnId < fromTurnId) continue;
      if (toTurnId !== null && turnId !== null && turnId >= toTurnId) continue;
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
      record,
      ...(role !== undefined ? { role } : {}),
    };
    this.recordsOf(sessionId).push(stored);
    if (this.sessionsDir) {
      appendFileSync(this.recordsFile(sessionId), `${JSON.stringify(stored)}\n`);
    }
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

  // -- intents (DR-035, the act log of CORE-52) -----------------------------

  addIntent(intent: IntentInfo): void {
    this.intents.set(intent.id, { ...intent });
    this.appendIntentAct(intent.projectId, { act: "queue", intent });
  }

  getIntent(id: string): IntentInfo | undefined {
    const intent = this.intents.get(id);
    return intent ? { ...intent } : undefined;
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
        return { ...intent };
      }
    }
    return undefined;
  }

  /** Every open intent across projects, in project rank order. */
  listOpenIntents(): IntentInfo[] {
    return [...this.intents.values()]
      .filter((intent) => intent.closedAt === undefined)
      .sort((a, b) =>
        a.projectId === b.projectId
          ? a.rank < b.rank
            ? -1
            : 1
          : a.projectId < b.projectId
            ? -1
            : 1,
      )
      .map((intent) => ({ ...intent }));
  }

  /** One History page: closed intents newest first (DR-035). */
  listClosedIntents(
    projectId: string,
    limit: number,
    before?: { closedAt: number; intentId: string },
  ): IntentInfo[] {
    return [...this.intents.values()]
      .filter(
        (intent): intent is IntentInfo & { closedAt: number } =>
          intent.projectId === projectId && intent.closedAt !== undefined,
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
      .map((intent) => ({ ...intent }));
  }

  /** Every dispatch stamped into a session — open and closed intents
   * alike, because a closed dispatch still bounds its neighbours' turn
   * ranges (DR-035). */
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

  setIntentText(id: string, text: string): void {
    const intent = this.intents.get(id);
    if (!intent) return;
    intent.text = text;
    this.appendIntentAct(intent.projectId, { act: "edit", id, text });
  }

  setIntentRank(id: string, rank: string): void {
    const intent = this.intents.get(id);
    if (!intent) return;
    intent.rank = rank;
    this.appendIntentAct(intent.projectId, { act: "move", id, rank });
  }

  setIntentLink(id: string, afterId: string | null): void {
    const intent = this.intents.get(id);
    if (!intent) return;
    if (afterId === null) delete intent.afterId;
    else intent.afterId = afterId;
    this.appendIntentAct(intent.projectId, { act: "link", id, afterId });
  }

  /** The dispatch binding, stamped when the turn starts and re-written
   * by a later dispatch (DR-035). */
  stampIntentDispatch(
    id: string,
    sessionId: string,
    turnId: number,
    at: number,
  ): void {
    const intent = this.intents.get(id);
    if (!intent) return;
    intent.dispatched = { sessionId, turnId, at };
    this.appendIntentAct(intent.projectId, { act: "dispatch", id, sessionId, turnId, at });
  }

  closeIntent(id: string, as: "done" | "dropped", at: number): void {
    const intent = this.intents.get(id);
    if (!intent) return;
    intent.closedAt = at;
    intent.closedAs = as;
    this.appendIntentAct(intent.projectId, { act: "close", id, as, at });
  }

  // -- prefs ----------------------------------------------------------------

  setPref(key: string, value: unknown): void {
    this.prefs.set(key, value);
    this.savePrefs();
  }

  getPref<T>(key: string): T | undefined {
    return this.prefs.has(key) ? (this.prefs.get(key) as T) : undefined;
  }

  // -- forge cache (dashboard-14) -------------------------------------------

  getForgeCache(projectId: string): { at: number; state: ForgeState } | undefined {
    return this.forgeCache.get(projectId);
  }

  setForgeCache(projectId: string, entry: { at: number; state: ForgeState }): void {
    this.forgeCache.set(projectId, entry);
    this.saveForgeCache();
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

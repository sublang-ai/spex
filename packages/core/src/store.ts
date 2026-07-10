// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App-local SQLite store (DR-004, CORE-15): the core package is the
// only writer; schema is versioned with forward migrations applied at
// startup before any client is served. Hidden records are persisted
// with a flag so replay can filter identically to live streaming.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

import type { ProjectInfo, SessionInfo, StoredRecord, TmuxPlayRecord } from "./protocol.js";

const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    registered_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    created_at INTEGER NOT NULL,
    ended_at INTEGER,
    live INTEGER NOT NULL DEFAULT 0,
    players_json TEXT NOT NULL,
    initial_visible_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE turns (
    session_id TEXT NOT NULL,
    turn_id INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT,
    PRIMARY KEY (session_id, turn_id)
  );
  CREATE TABLE records (
    session_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    turn_id INTEGER,
    type TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0,
    timestamp INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (session_id, seq)
  );
  CREATE INDEX records_by_session ON records (session_id, seq);
  CREATE TABLE usage (
    session_id TEXT NOT NULL,
    turn_id INTEGER,
    actor_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    tool_uses INTEGER NOT NULL,
    total_cost_usd REAL,
    duration_ms INTEGER,
    at INTEGER NOT NULL
  );
  CREATE TABLE prefs (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
  `,
];

export interface UsageEntry {
  sessionId: string;
  turnId: number | null;
  actorId: string;
  inputTokens: number;
  outputTokens: number;
  toolUses: number;
  totalCostUsd?: number;
  durationMs?: number;
  at: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  toolUses: number;
  totalCostUsd: number;
}

interface SessionRow {
  id: string;
  project_id: string;
  created_at: number;
  ended_at: number | null;
  live: number;
  players_json: string;
  initial_visible_json: string;
  path: string;
}

function isHidden(record: TmuxPlayRecord): boolean {
  return (
    "visibility" in record &&
    (record as { visibility?: string }).visibility === "hidden"
  );
}

export class Store {
  private readonly db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    const migrateAll = this.db.transaction(() => {
      const hasMeta = this.db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
        )
        .get();
      let version = 0;
      if (hasMeta) {
        const row = this.db
          .prepare("SELECT value FROM meta WHERE key = 'schema_version'")
          .get() as { value: string } | undefined;
        version = row ? Number(row.value) : 0;
      }
      for (let next = version; next < MIGRATIONS.length; next += 1) {
        this.db.exec(MIGRATIONS[next]);
      }
      this.db
        .prepare(
          "INSERT INTO meta (key, value) VALUES ('schema_version', ?) " +
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(String(MIGRATIONS.length));
    });
    migrateAll();
  }

  close(): void {
    this.db.close();
  }

  // -- projects -------------------------------------------------------------

  registerProject(path: string, name: string, at: number): ProjectInfo {
    const existing = this.getProjectByPath(path);
    if (existing) return existing;
    const project: ProjectInfo = {
      id: randomUUID(),
      path,
      name,
      registeredAt: at,
    };
    this.db
      .prepare(
        "INSERT INTO projects (id, path, name, registered_at) VALUES (?, ?, ?, ?)",
      )
      .run(project.id, project.path, project.name, project.registeredAt);
    return project;
  }

  listProjects(): ProjectInfo[] {
    return (
      this.db
        .prepare(
          "SELECT id, path, name, registered_at FROM projects ORDER BY registered_at",
        )
        .all() as { id: string; path: string; name: string; registered_at: number }[]
    ).map((row) => ({
      id: row.id,
      path: row.path,
      name: row.name,
      registeredAt: row.registered_at,
    }));
  }

  getProject(id: string): ProjectInfo | undefined {
    return this.listProjects().find((project) => project.id === id);
  }

  getProjectByPath(path: string): ProjectInfo | undefined {
    return this.listProjects().find((project) => project.path === path);
  }

  removeProject(id: string): boolean {
    return this.db.prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0;
  }

  // -- sessions -------------------------------------------------------------

  createSession(session: SessionInfo): void {
    this.db
      .prepare(
        "INSERT INTO sessions (id, project_id, created_at, ended_at, live, players_json, initial_visible_json) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        session.id,
        session.projectId,
        session.createdAt,
        session.endedAt,
        session.live ? 1 : 0,
        JSON.stringify(session.players),
        JSON.stringify(session.initialVisible),
      );
  }

  endSession(id: string, endedAt: number): void {
    this.db
      .prepare("UPDATE sessions SET live = 0, ended_at = ? WHERE id = ?")
      .run(endedAt, id);
  }

  /** Startup recovery (CORE-10): a session live at shutdown is no longer live. */
  markAllSessionsNotLive(): void {
    this.db.prepare("UPDATE sessions SET live = 0 WHERE live = 1").run();
  }

  listSessions(): SessionInfo[] {
    const rows = this.db
      .prepare(
        "SELECT s.id, s.project_id, s.created_at, s.ended_at, s.live, s.players_json, s.initial_visible_json, p.path " +
          "FROM sessions s JOIN projects p ON p.id = s.project_id ORDER BY s.created_at",
      )
      .all() as SessionRow[];
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      projectPath: row.path,
      createdAt: row.created_at,
      live: row.live === 1,
      endedAt: row.ended_at,
      players: JSON.parse(row.players_json) as SessionInfo["players"],
      initialVisible: JSON.parse(row.initial_visible_json) as string[],
    }));
  }

  // -- turns ----------------------------------------------------------------

  startTurn(sessionId: string, turnId: number, prompt: string, at: number): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO turns (session_id, turn_id, prompt, started_at) VALUES (?, ?, ?, ?)",
      )
      .run(sessionId, turnId, prompt, at);
  }

  endTurn(sessionId: string, turnId: number, status: string, at: number): void {
    this.db
      .prepare(
        "UPDATE turns SET status = ?, ended_at = ? WHERE session_id = ? AND turn_id = ?",
      )
      .run(status, at, sessionId, turnId);
  }

  // -- records --------------------------------------------------------------

  appendRecord(sessionId: string, seq: number, record: TmuxPlayRecord): void {
    this.db
      .prepare(
        "INSERT INTO records (session_id, seq, turn_id, type, hidden, timestamp, payload_json) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        sessionId,
        seq,
        record.turnId,
        record.type,
        isHidden(record) ? 1 : 0,
        record.timestamp,
        JSON.stringify(record),
      );
  }

  getRecords(
    sessionId: string,
    options: { afterSeq?: number; includeHidden?: boolean } = {},
  ): StoredRecord[] {
    const rows = this.db
      .prepare(
        "SELECT seq, hidden, payload_json FROM records " +
          "WHERE session_id = ? AND seq > ? ORDER BY seq",
      )
      .all(sessionId, options.afterSeq ?? 0) as {
      seq: number;
      hidden: number;
      payload_json: string;
    }[];
    return rows
      .filter((row) => options.includeHidden || row.hidden === 0)
      .map((row) => ({
        seq: row.seq,
        record: JSON.parse(row.payload_json) as TmuxPlayRecord,
      }));
  }

  maxSeq(sessionId: string): number {
    const row = this.db
      .prepare("SELECT MAX(seq) AS max FROM records WHERE session_id = ?")
      .get(sessionId) as { max: number | null };
    return row.max ?? 0;
  }

  // -- usage ----------------------------------------------------------------

  addUsage(entry: UsageEntry): void {
    this.db
      .prepare(
        "INSERT INTO usage (session_id, turn_id, actor_id, input_tokens, output_tokens, " +
          "tool_uses, total_cost_usd, duration_ms, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        entry.sessionId,
        entry.turnId,
        entry.actorId,
        entry.inputTokens,
        entry.outputTokens,
        entry.toolUses,
        entry.totalCostUsd ?? null,
        entry.durationMs ?? null,
        entry.at,
      );
  }

  sessionUsage(sessionId: string): UsageTotals {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(input_tokens),0) AS input_tokens, " +
          "COALESCE(SUM(output_tokens),0) AS output_tokens, " +
          "COALESCE(SUM(tool_uses),0) AS tool_uses, " +
          "COALESCE(SUM(total_cost_usd),0) AS total_cost_usd " +
          "FROM usage WHERE session_id = ?",
      )
      .get(sessionId) as {
      input_tokens: number;
      output_tokens: number;
      tool_uses: number;
      total_cost_usd: number;
    };
    return {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      toolUses: row.tool_uses,
      totalCostUsd: row.total_cost_usd,
    };
  }

  // -- prefs ----------------------------------------------------------------

  setPref(key: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO prefs (key, value_json) VALUES (?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
      )
      .run(key, JSON.stringify(value));
  }

  getPref<T>(key: string): T | undefined {
    const row = this.db
      .prepare("SELECT value_json FROM prefs WHERE key = ?")
      .get(key) as { value_json: string } | undefined;
    return row ? (JSON.parse(row.value_json) as T) : undefined;
  }
}

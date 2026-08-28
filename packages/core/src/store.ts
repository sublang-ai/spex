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

import type {
  IntentInfo,
  IntentSource,
  IntentSourceKind,
  ProjectInfo,
  SessionInfo,
  StoredRecord,
  TmuxPlayRecord,
} from "./protocol.js";

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
  // Session players (DR-032). A player record carries the role of the
  // call it belongs to, and a cost carries the provenance cligent 0.22
  // reports. Both are nullable because both are genuinely unknown for
  // everything written before this migration — and because an absent
  // report is not a zero. SQLite cannot drop a NOT NULL, so the token
  // columns are rebuilt to admit the silence the new runtime reports.
  `
  ALTER TABLE records ADD COLUMN role TEXT;
  ALTER TABLE usage ADD COLUMN cost_source TEXT;
  CREATE TABLE usage_next (
    session_id TEXT NOT NULL,
    turn_id INTEGER,
    actor_id TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    tool_uses INTEGER NOT NULL,
    total_cost_usd REAL,
    cost_source TEXT,
    duration_ms INTEGER,
    at INTEGER NOT NULL
  );
  INSERT INTO usage_next SELECT session_id, turn_id, actor_id, input_tokens,
    output_tokens, tool_uses, total_cost_usd, cost_source, duration_ms, at
    FROM usage;
  DROP TABLE usage;
  ALTER TABLE usage_next RENAME TO usage;
  `,
  // The intent ledger (DR-035): acts and provenance only, no state
  // column — everything visible derives from these rows plus the
  // record stream. The partial unique index holds the one-open-intent-
  // per-source-artifact invariant; chat and unsourced intents are
  // unconstrained, and a closed intent releases its hold.
  `
  CREATE TABLE intents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    text TEXT NOT NULL,
    source_kind TEXT,
    source_ref TEXT,
    source_url TEXT,
    rank TEXT NOT NULL,
    after_id TEXT,
    created_at INTEGER NOT NULL,
    dispatched_session_id TEXT,
    dispatched_turn_id INTEGER,
    dispatched_at INTEGER,
    closed_at INTEGER,
    closed_as TEXT
  );
  CREATE INDEX intents_by_project ON intents (project_id, rank);
  CREATE UNIQUE INDEX intents_open_source ON intents (project_id, source_kind, source_ref)
    WHERE closed_at IS NULL AND source_kind IN ('issue','pr','record');
  `,
];

export interface UsageEntry {
  sessionId: string;
  turnId: number | null;
  /** The session player that spent it, or "captain" (DR-032). */
  actorId: string;
  /** Absent when the runtime reported no token accounting — which is
   * not the same as measuring zero (cligent 0.22). */
  inputTokens?: number;
  outputTokens?: number;
  toolUses: number;
  totalCostUsd?: number;
  /** How the runtime knew the cost: provider-reported, or an
   * estimate. An estimate is never presented as a bill. */
  costSource?: string;
  durationMs?: number;
  at: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  toolUses: number;
  totalCostUsd: number;
  /** Every provenance the summed cost came from, sorted. A cost is
   * only as good as its weakest source, so the reader gets the labels
   * rather than a number that hides them (DR-032). Empty when no
   * entry reported a cost at all. */
  costSources: string[];
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

/** One session row plus its gathered summary, in the single shape
 * every listing and broadcast shares (core-service-32). */
function sessionInfo(
  row: SessionRow,
  title: string | undefined,
  turns: number,
  failed: boolean,
  costUsd: number | undefined,
): SessionInfo {
  return {
    id: row.id,
    projectId: row.project_id,
    projectPath: row.path,
    createdAt: row.created_at,
    live: row.live === 1,
    endedAt: row.ended_at,
    players: JSON.parse(row.players_json) as SessionInfo["players"],
    initialVisible: JSON.parse(row.initial_visible_json) as string[],
    ...(title !== undefined ? { title } : {}),
    turns,
    failed,
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}

interface IntentRow {
  id: string;
  project_id: string;
  text: string;
  source_kind: string | null;
  source_ref: string | null;
  source_url: string | null;
  rank: string;
  after_id: string | null;
  created_at: number;
  dispatched_session_id: string | null;
  dispatched_turn_id: number | null;
  dispatched_at: number | null;
  closed_at: number | null;
  closed_as: string | null;
}

function intentInfo(row: IntentRow): IntentInfo {
  const source: IntentSource | undefined =
    row.source_kind !== null && row.source_ref !== null
      ? {
          kind: row.source_kind as IntentSource["kind"],
          ref: row.source_ref,
          ...(row.source_url !== null ? { url: row.source_url } : {}),
        }
      : undefined;
  return {
    id: row.id,
    projectId: row.project_id,
    text: row.text,
    ...(source ? { source } : {}),
    rank: row.rank,
    ...(row.after_id !== null ? { afterId: row.after_id } : {}),
    createdAt: row.created_at,
    ...(row.dispatched_session_id !== null &&
    row.dispatched_turn_id !== null &&
    row.dispatched_at !== null
      ? {
          dispatched: {
            sessionId: row.dispatched_session_id,
            turnId: row.dispatched_turn_id,
            at: row.dispatched_at,
          },
        }
      : {}),
    ...(row.closed_at !== null ? { closedAt: row.closed_at } : {}),
    ...(row.closed_as !== null
      ? { closedAs: row.closed_as as "done" | "dropped" }
      : {}),
  };
}

/** SQLite's GROUP_CONCAT gives a comma-joined list or null. */
function splitSources(joined: string | null): string[] {
  return joined ? [...new Set(joined.split(","))].filter(Boolean).sort() : [];
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

  /** One session's listing row, carrying the same conversation
   * summary a listing carries (core-service-32) — what the broadcasts
   * that must stay truthful between listings send (core-service-34). */
  describeSession(id: string): SessionInfo | undefined {
    const row = this.db
      .prepare(
        "SELECT s.id, s.project_id, s.created_at, s.ended_at, s.live, s.players_json, s.initial_visible_json, p.path " +
          "FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?",
      )
      .get(id) as SessionRow | undefined;
    if (!row) return undefined;
    const title = (
      this.db
        .prepare(
          "SELECT prompt FROM turns WHERE session_id = ? ORDER BY turn_id LIMIT 1",
        )
        .get(id) as { prompt: string } | undefined
    )?.prompt;
    const { turns } = this.db
      .prepare("SELECT COUNT(*) AS turns FROM turns WHERE session_id = ?")
      .get(id) as { turns: number };
    const failed = Boolean(
      this.db
        .prepare(
          "SELECT 1 FROM records WHERE session_id = ? AND type = 'runtime_error' LIMIT 1",
        )
        .get(id),
    );
    const { cost } = this.db
      .prepare("SELECT SUM(total_cost_usd) AS cost FROM usage WHERE session_id = ?")
      .get(id) as { cost: number | null };
    return sessionInfo(row, title, turns, failed, cost ?? undefined);
  }

  listSessions(): SessionInfo[] {
    const rows = this.db
      .prepare(
        "SELECT s.id, s.project_id, s.created_at, s.ended_at, s.live, s.players_json, s.initial_visible_json, p.path " +
          "FROM sessions s JOIN projects p ON p.id = s.project_id ORDER BY s.created_at",
      )
      .all() as SessionRow[];
    // The conversation summary each session carries (core-service-32),
    // gathered set-wise: one query per field class, never one per
    // session.
    const titles = new Map<string, string>();
    for (const row of this.db
      .prepare(
        "SELECT session_id, prompt FROM turns WHERE turn_id = " +
          "(SELECT MIN(turn_id) FROM turns t2 WHERE t2.session_id = turns.session_id)",
      )
      .all() as { session_id: string; prompt: string }[]) {
      titles.set(row.session_id, row.prompt);
    }
    const counts = new Map<string, number>();
    for (const row of this.db
      .prepare("SELECT session_id, COUNT(*) AS turns FROM turns GROUP BY session_id")
      .all() as { session_id: string; turns: number }[]) {
      counts.set(row.session_id, row.turns);
    }
    const failures = new Set<string>();
    for (const row of this.db
      .prepare(
        "SELECT DISTINCT session_id FROM records WHERE type = 'runtime_error'",
      )
      .all() as { session_id: string }[]) {
      failures.add(row.session_id);
    }
    const costs = new Map<string, number>();
    for (const row of this.db
      .prepare(
        "SELECT session_id, SUM(total_cost_usd) AS cost FROM usage GROUP BY session_id",
      )
      .all() as { session_id: string; cost: number | null }[]) {
      if (row.cost) costs.set(row.session_id, row.cost);
    }
    return rows.map((row) =>
      sessionInfo(
        row,
        titles.get(row.id),
        counts.get(row.id) ?? 0,
        failures.has(row.id),
        costs.get(row.id),
      ),
    );
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

  /** Every turn a session held, in order — the ledger fold's turn
   * ranges and statuses come from here (DR-035). */
  listTurns(
    sessionId: string,
  ): {
    turnId: number;
    prompt: string;
    startedAt: number;
    endedAt: number | null;
    status: string | null;
  }[] {
    return (
      this.db
        .prepare(
          "SELECT turn_id, prompt, started_at, ended_at, status FROM turns " +
            "WHERE session_id = ? ORDER BY turn_id",
        )
        .all(sessionId) as {
        turn_id: number;
        prompt: string;
        started_at: number;
        ended_at: number | null;
        status: string | null;
      }[]
    ).map((row) => ({
      turnId: row.turn_id,
      prompt: row.prompt,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
    }));
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
    const row = this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM records WHERE session_id = ? AND role = ? " +
          "AND type = 'player_prompt' AND turn_id >= ? AND (? IS NULL OR turn_id < ?)",
      )
      .get(sessionId, role, fromTurnId, toTurnId, toTurnId) as { n: number };
    return row.n;
  }

  /** Runtime-error records inside a turn range, oldest first — the
   * failure condition and its onset time (DR-035). */
  runtimeErrors(
    sessionId: string,
    fromTurnId: number,
    toTurnId: number | null,
  ): { turnId: number | null; timestamp: number }[] {
    return (
      this.db
        .prepare(
          "SELECT turn_id, timestamp FROM records WHERE session_id = ? " +
            "AND type = 'runtime_error' AND turn_id >= ? AND (? IS NULL OR turn_id < ?) " +
            "ORDER BY seq",
        )
        .all(sessionId, fromTurnId, toTurnId, toTurnId) as {
        turn_id: number | null;
        timestamp: number;
      }[]
    ).map((row) => ({ turnId: row.turn_id, timestamp: row.timestamp }));
  }

  // -- records --------------------------------------------------------------

  /** `role` is the resolved role a player record's call served, kept
   * beside the record so a replay reads exactly as the live stream did
   * (DR-032). */
  appendRecord(
    sessionId: string,
    seq: number,
    record: TmuxPlayRecord,
    role?: string,
  ): void {
    this.db
      .prepare(
        "INSERT INTO records (session_id, seq, turn_id, type, hidden, timestamp, payload_json, role) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        sessionId,
        seq,
        record.turnId,
        record.type,
        isHidden(record) ? 1 : 0,
        record.timestamp,
        JSON.stringify(record),
        role ?? null,
      );
  }

  getRecords(
    sessionId: string,
    options: { afterSeq?: number; includeHidden?: boolean } = {},
  ): StoredRecord[] {
    const rows = this.db
      .prepare(
        "SELECT seq, hidden, payload_json, role FROM records " +
          "WHERE session_id = ? AND seq > ? ORDER BY seq",
      )
      .all(sessionId, options.afterSeq ?? 0) as {
      seq: number;
      hidden: number;
      payload_json: string;
      role: string | null;
    }[];
    return rows
      .filter((row) => options.includeHidden || row.hidden === 0)
      .map((row) => ({
        seq: row.seq,
        record: JSON.parse(row.payload_json) as TmuxPlayRecord,
        ...(row.role !== null ? { role: row.role } : {}),
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
          "tool_uses, total_cost_usd, cost_source, duration_ms, at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        entry.sessionId,
        entry.turnId,
        entry.actorId,
        entry.inputTokens ?? null,
        entry.outputTokens ?? null,
        entry.toolUses,
        entry.totalCostUsd ?? null,
        entry.costSource ?? null,
        entry.durationMs ?? null,
        entry.at,
      );
  }

  usageByDay(): { day: string; totals: UsageTotals }[] {
    const rows = this.db
      .prepare(
        "SELECT date(at / 1000, 'unixepoch') AS day, " +
          "COALESCE(SUM(input_tokens),0) AS input_tokens, " +
          "COALESCE(SUM(output_tokens),0) AS output_tokens, " +
          "COALESCE(SUM(tool_uses),0) AS tool_uses, " +
          "COALESCE(SUM(total_cost_usd),0) AS total_cost_usd, " +
          "GROUP_CONCAT(DISTINCT cost_source) AS cost_sources " +
          "FROM usage GROUP BY day ORDER BY day DESC LIMIT 30",
      )
      .all() as {
      day: string;
      input_tokens: number;
      output_tokens: number;
      tool_uses: number;
      total_cost_usd: number;
      cost_sources: string | null;
    }[];
    return rows.map((row) => ({
      day: row.day,
      totals: {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        toolUses: row.tool_uses,
        totalCostUsd: row.total_cost_usd,
        costSources: splitSources(row.cost_sources),
      },
    }));
  }

  sessionUsage(sessionId: string): UsageTotals {
    const row = this.db
      .prepare(
        "SELECT COALESCE(SUM(input_tokens),0) AS input_tokens, " +
          "COALESCE(SUM(output_tokens),0) AS output_tokens, " +
          "COALESCE(SUM(tool_uses),0) AS tool_uses, " +
          "COALESCE(SUM(total_cost_usd),0) AS total_cost_usd, " +
          "GROUP_CONCAT(DISTINCT cost_source) AS cost_sources " +
          "FROM usage WHERE session_id = ?",
      )
      .get(sessionId) as {
      input_tokens: number;
      output_tokens: number;
      tool_uses: number;
      total_cost_usd: number;
      cost_sources: string | null;
    };
    return {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      toolUses: row.tool_uses,
      totalCostUsd: row.total_cost_usd,
      costSources: splitSources(row.cost_sources),
    };
  }

  // -- intents (DR-035) -----------------------------------------------------

  addIntent(intent: IntentInfo): void {
    this.db
      .prepare(
        "INSERT INTO intents (id, project_id, text, source_kind, source_ref, source_url, " +
          "rank, after_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        intent.id,
        intent.projectId,
        intent.text,
        intent.source?.kind ?? null,
        intent.source?.ref ?? null,
        intent.source?.url ?? null,
        intent.rank,
        intent.afterId ?? null,
        intent.createdAt,
      );
  }

  getIntent(id: string): IntentInfo | undefined {
    const row = this.db
      .prepare("SELECT * FROM intents WHERE id = ?")
      .get(id) as IntentRow | undefined;
    return row ? intentInfo(row) : undefined;
  }

  /** The open intent holding a source artifact, if any (DR-035). */
  openIntentBySource(
    projectId: string,
    kind: IntentSourceKind,
    ref: string,
  ): IntentInfo | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM intents WHERE project_id = ? AND source_kind = ? " +
          "AND source_ref = ? AND closed_at IS NULL",
      )
      .get(projectId, kind, ref) as IntentRow | undefined;
    return row ? intentInfo(row) : undefined;
  }

  /** Every open intent across projects, in project rank order. */
  listOpenIntents(): IntentInfo[] {
    return (
      this.db
        .prepare(
          "SELECT * FROM intents WHERE closed_at IS NULL ORDER BY project_id, rank",
        )
        .all() as IntentRow[]
    ).map(intentInfo);
  }

  /** One History page: closed intents newest first (DR-035). */
  listClosedIntents(
    projectId: string,
    limit: number,
    before?: { closedAt: number; intentId: string },
  ): IntentInfo[] {
    const rows = before
      ? (this.db
          .prepare(
            "SELECT * FROM intents WHERE project_id = ? AND closed_at IS NOT NULL " +
              "AND (closed_at < ? OR (closed_at = ? AND id < ?)) " +
              "ORDER BY closed_at DESC, id DESC LIMIT ?",
          )
          .all(
            projectId,
            before.closedAt,
            before.closedAt,
            before.intentId,
            limit,
          ) as IntentRow[])
      : (this.db
          .prepare(
            "SELECT * FROM intents WHERE project_id = ? AND closed_at IS NOT NULL " +
              "ORDER BY closed_at DESC, id DESC LIMIT ?",
          )
          .all(projectId, limit) as IntentRow[]);
    return rows.map(intentInfo);
  }

  /** Every dispatch stamped into a session — open and closed intents
   * alike, because a closed dispatch still bounds its neighbours' turn
   * ranges (DR-035). */
  listSessionDispatches(
    sessionId: string,
  ): { intentId: string; turnId: number; open: boolean }[] {
    return (
      this.db
        .prepare(
          "SELECT id, dispatched_turn_id, closed_at FROM intents " +
            "WHERE dispatched_session_id = ? AND dispatched_turn_id IS NOT NULL " +
            "ORDER BY dispatched_turn_id",
        )
        .all(sessionId) as {
        id: string;
        dispatched_turn_id: number;
        closed_at: number | null;
      }[]
    ).map((row) => ({
      intentId: row.id,
      turnId: row.dispatched_turn_id,
      open: row.closed_at === null,
    }));
  }

  setIntentText(id: string, text: string): void {
    this.db.prepare("UPDATE intents SET text = ? WHERE id = ?").run(text, id);
  }

  setIntentRank(id: string, rank: string): void {
    this.db.prepare("UPDATE intents SET rank = ? WHERE id = ?").run(rank, id);
  }

  setIntentLink(id: string, afterId: string | null): void {
    this.db
      .prepare("UPDATE intents SET after_id = ? WHERE id = ?")
      .run(afterId, id);
  }

  /** The dispatch binding, stamped when the turn starts and re-written
   * by a later dispatch (DR-035). */
  stampIntentDispatch(
    id: string,
    sessionId: string,
    turnId: number,
    at: number,
  ): void {
    this.db
      .prepare(
        "UPDATE intents SET dispatched_session_id = ?, dispatched_turn_id = ?, " +
          "dispatched_at = ? WHERE id = ?",
      )
      .run(sessionId, turnId, at, id);
  }

  closeIntent(id: string, as: "done" | "dropped", at: number): void {
    this.db
      .prepare("UPDATE intents SET closed_at = ?, closed_as = ? WHERE id = ?")
      .run(at, as, id);
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

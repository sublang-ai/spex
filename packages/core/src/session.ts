// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Session manager (DR-003, CORE-4..8): one embedded cligent runtime
// per project session, the Playbook Captain shell as captain (with an
// injected module loader per CORE-17), and a record bus that persists
// every record and reports it upward with its visibility flag so the
// server can filter at the channel boundary (CORE-14).

import { randomUUID } from "node:crypto";
import { createTmuxPlayRuntime } from "@sublang/cligent/tmux-play";
import type {
  Captain,
  PlayerAdapterImports,
  TmuxPlayRecord,
  TmuxPlayRuntime,
} from "@sublang/cligent/tmux-play";

import { PLAYBOOK_CAPTAIN_MODULE, type ComposedConfig, type LoadModule } from "./config.js";
import type { ProjectInfo, SessionInfo } from "./protocol.js";
import { Store } from "./store.js";

export class CoreError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "busy"
      | "aborted"
      | "conflict"
      | "invalid_config"
      | "invalid_request"
      | "internal",
    message: string,
  ) {
    super(message);
    this.name = "CoreError";
  }
}

export type CaptainFactory = (
  composed: ComposedConfig,
) => Promise<Captain>;

export interface SessionManagerOptions {
  store: Store;
  /** Module loader injected into the captain shell (CORE-17). */
  loadModule?: LoadModule;
  /** Test injection: replaces real agent adapters (CORE-18). */
  adapterImports?: PlayerAdapterImports;
  /** Test injection: replaces the Playbook Captain shell. */
  captainFactory?: CaptainFactory;
  now?: () => number;
}

export interface RecordEnvelope {
  sessionId: string;
  seq: number;
  record: TmuxPlayRecord;
  hidden: boolean;
}

interface LiveSession {
  info: SessionInfo;
  runtime: TmuxPlayRuntime;
  seq: number;
  turnActive: boolean;
}

function isHidden(record: TmuxPlayRecord): boolean {
  return (
    "visibility" in record &&
    (record as { visibility?: string }).visibility === "hidden"
  );
}

async function defaultCaptainFactory(
  composed: ComposedConfig,
  loadModule: LoadModule,
): Promise<Captain> {
  const moduleValue = (await loadModule(PLAYBOOK_CAPTAIN_MODULE)) as {
    default?: unknown;
  };
  const factory = moduleValue?.default;
  if (typeof factory !== "function") {
    throw new CoreError(
      "internal",
      `Captain module ${PLAYBOOK_CAPTAIN_MODULE} must export a default factory`,
    );
  }
  return (
    factory as (
      options: unknown,
      deps?: { loadModule?: LoadModule },
    ) => Captain
  )(composed.captainOptions, { loadModule });
}

export class SessionManager {
  private readonly store: Store;
  private readonly loadModule: LoadModule;
  private readonly adapterImports?: PlayerAdapterImports;
  private readonly captainFactory?: CaptainFactory;
  private readonly now: () => number;
  private readonly live = new Map<string, LiveSession>();
  private readonly liveByProject = new Map<string, string>();

  onRecord: (envelope: RecordEnvelope) => void = () => {};
  onSessionState: (session: SessionInfo) => void = () => {};

  constructor(options: SessionManagerOptions) {
    this.store = options.store;
    this.loadModule = options.loadModule ?? ((specifier) => import(specifier));
    this.adapterImports = options.adapterImports;
    this.captainFactory = options.captainFactory;
    this.now = options.now ?? Date.now;
  }

  listSessions(): SessionInfo[] {
    return this.store.listSessions().map((session) => ({
      ...session,
      live: this.live.has(session.id),
    }));
  }

  getLive(sessionId: string): LiveSession | undefined {
    return this.live.get(sessionId);
  }

  async createSession(
    project: ProjectInfo,
    composed: ComposedConfig,
  ): Promise<SessionInfo> {
    if (this.liveByProject.has(project.id)) {
      throw new CoreError(
        "conflict",
        `project ${project.path} already has a live session`,
      );
    }

    const captain = this.captainFactory
      ? await this.captainFactory(composed)
      : await defaultCaptainFactory(composed, this.loadModule);

    const info: SessionInfo = {
      id: randomUUID(),
      projectId: project.id,
      projectPath: project.path,
      createdAt: this.now(),
      live: true,
      endedAt: null,
      players: composed.players.map((player) => ({
        id: player.id,
        adapter: player.adapter,
        ...(player.model !== undefined ? { model: player.model } : {}),
      })),
      initialVisible: composed.initialVisible,
    };

    const entry: LiveSession = {
      info,
      runtime: undefined as unknown as TmuxPlayRuntime,
      seq: 0,
      turnActive: false,
    };

    const observer = {
      onRecord: (record: TmuxPlayRecord): void => {
        entry.seq += 1;
        const seq = entry.seq;
        this.store.appendRecord(info.id, seq, record);
        this.trackRecord(info.id, record);
        this.onRecord({
          sessionId: info.id,
          seq,
          record,
          hidden: isHidden(record),
        });
      },
    };

    try {
      entry.runtime = await createTmuxPlayRuntime({
        captain,
        captainConfig: composed.captainAgent,
        players: composed.players,
        observers: [observer],
        cwd: project.path,
        ...(this.adapterImports ? { adapterImports: this.adapterImports } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CoreError("invalid_config", `session failed to start: ${message}`);
    }

    this.store.createSession(info);
    this.live.set(info.id, entry);
    this.liveByProject.set(project.id, info.id);
    this.onSessionState(info);
    return info;
  }

  private trackRecord(sessionId: string, record: TmuxPlayRecord): void {
    switch (record.type) {
      case "turn_started": {
        const turn = (record as { turn: { id: number; prompt: string } }).turn;
        this.store.startTurn(sessionId, turn.id, turn.prompt, record.timestamp);
        break;
      }
      case "turn_finished":
        if (record.turnId !== null) {
          this.store.endTurn(sessionId, record.turnId, "finished", record.timestamp);
        }
        break;
      case "turn_aborted":
        if (record.turnId !== null) {
          this.store.endTurn(sessionId, record.turnId, "aborted", record.timestamp);
        }
        break;
      case "player_event":
      case "captain_event": {
        const event = (record as { event: { type: string; payload?: unknown } })
          .event;
        if (event.type === "done") {
          const payload = event.payload as {
            usage?: {
              inputTokens?: number;
              outputTokens?: number;
              toolUses?: number;
              totalCostUsd?: number;
            };
            durationMs?: number;
          };
          this.store.addUsage({
            sessionId,
            turnId: record.turnId,
            actorId:
              record.type === "player_event"
                ? (record as { playerId: string }).playerId
                : "captain",
            inputTokens: payload.usage?.inputTokens ?? 0,
            outputTokens: payload.usage?.outputTokens ?? 0,
            toolUses: payload.usage?.toolUses ?? 0,
            ...(payload.usage?.totalCostUsd !== undefined
              ? { totalCostUsd: payload.usage.totalCostUsd }
              : {}),
            ...(payload.durationMs !== undefined
              ? { durationMs: payload.durationMs }
              : {}),
            at: record.timestamp,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Start a boss turn (CORE-5). Rejects with busy while a turn is
   * active; otherwise resolves as soon as the turn is accepted.
   */
  submitTurn(sessionId: string, text: string): void {
    const entry = this.requireLive(sessionId);
    if (entry.turnActive) {
      throw new CoreError(
        "busy",
        "a turn is already running in this session",
      );
    }
    entry.turnActive = true;
    void entry.runtime
      .runBossTurn(text)
      .catch(() => {
        // Failures surface as runtime_error / turn_aborted records.
      })
      .finally(() => {
        entry.turnActive = false;
      });
  }

  abortTurn(sessionId: string): boolean {
    const entry = this.requireLive(sessionId);
    if (!entry.turnActive) return false;
    entry.runtime.abortActiveTurn();
    return true;
  }

  async disposeSession(sessionId: string): Promise<void> {
    const entry = this.requireLive(sessionId);
    await entry.runtime.dispose();
    this.live.delete(sessionId);
    this.liveByProject.delete(entry.info.projectId);
    const endedAt = this.now();
    this.store.endSession(sessionId, endedAt);
    this.onSessionState({ ...entry.info, live: false, endedAt });
  }

  async disposeAll(): Promise<void> {
    for (const sessionId of [...this.live.keys()]) {
      await this.disposeSession(sessionId);
    }
  }

  private requireLive(sessionId: string): LiveSession {
    const entry = this.live.get(sessionId);
    if (!entry) {
      throw new CoreError("not_found", `no live session ${sessionId}`);
    }
    return entry;
  }
}

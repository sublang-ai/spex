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
import { foldUsage, sanitizeRecord } from "./stream-fold.js";

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
  /** The role a player record's call served (DR-032). */
  role?: string;
}

/** One player call the trace opened and has not yet closed, keyed by
 * the lane it runs on. v8 rejects simultaneous calls resolving to one
 * player, so a lane holds at most one — the bracket is unambiguous by
 * construction (DR-032). */
type OpenCalls = Map<string, string>;

interface LiveSession {
  info: SessionInfo;
  runtime: TmuxPlayRuntime;
  seq: number;
  turnActive: boolean;
  openCalls: OpenCalls;
  /** The staged intent the next started turn dispatches (DR-035):
   * held from submission, stamped at turn_started, and never stamped
   * by a submission that starts no turn. */
  pendingIntentId?: string;
}

/** Resolves the role a player record's call is serving, by folding the
 * same trace the machine cards fold (DR-032). A `player.call.started`
 * opens its lane, the matching finish closes it, and every player
 * record in between belongs to that call's role. A trace that names no
 * resolved player invents nothing: the lane simply stays unlabelled. */
function trackCallBrackets(open: OpenCalls, record: TmuxPlayRecord): void {
  if (record.type !== "captain_telemetry") return;
  const telemetry = record as { topic: string; payload?: unknown };
  if (telemetry.topic !== "playbook.trace") return;
  const event = telemetry.payload as {
    type?: string;
    payload?: { roleId?: string; playerId?: string };
  };
  const playerId = event?.payload?.playerId;
  if (typeof playerId !== "string" || playerId.length === 0) return;
  if (event.type === "player.call.started") {
    const roleId = event.payload?.roleId;
    if (typeof roleId === "string" && roleId.length > 0) {
      open.set(playerId, roleId);
    }
  } else if (event.type === "player.call.finished") {
    open.delete(playerId);
  }
}

/** The role to stamp on this record, if it belongs to an open call. */
function roleFor(open: OpenCalls, record: TmuxPlayRecord): string | undefined {
  if (
    record.type !== "player_prompt" &&
    record.type !== "player_event" &&
    record.type !== "player_finished"
  ) {
    return undefined;
  }
  return open.get((record as { playerId: string }).playerId);
}

function isHidden(record: TmuxPlayRecord): boolean {
  return (
    "visibility" in record &&
    (record as { visibility?: string }).visibility === "hidden"
  );
}

/** Per-session captain options (DR-014): playbooks that take a `cwd`
 * option the config leaves unset run their script gears in the
 * session's project directory instead of the app process cwd. */
function withProjectCwd(
  composed: ComposedConfig,
  projectPath: string,
): ComposedConfig {
  const injectable = composed.playbooks.filter((p) => p.acceptsCwdOption);
  if (injectable.length === 0) return composed;
  const playbooks = { ...composed.captainOptions.playbooks };
  for (const playbook of injectable) {
    const block = playbooks[playbook.id];
    if (!block) continue;
    playbooks[playbook.id] = {
      ...block,
      options: { ...block.options, cwd: projectPath },
    };
  }
  return {
    ...composed,
    captainOptions: { ...composed.captainOptions, playbooks },
  };
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
  /** A session event moved ledger-derived state (DR-035): the fold's
   * consumers re-pull. Fired per project, debounced by the service. */
  onLedgerChange: (projectId: string) => void = () => {};

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

  /** The live lanes as the ledger fold consumes them (DR-035). */
  listLanes(): { sessionId: string; projectId: string; turnActive: boolean }[] {
    return [...this.live.values()].map((entry) => ({
      sessionId: entry.info.id,
      projectId: entry.info.projectId,
      turnActive: entry.turnActive,
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

    const sessionComposed = withProjectCwd(composed, project.path);
    const captain = this.captainFactory
      ? await this.captainFactory(sessionComposed)
      : await defaultCaptainFactory(sessionComposed, this.loadModule);

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
      // A session begins with no conversation to summarize
      // (core-service-32); the store fills these as it runs.
      turns: 0,
      failed: false,
    };

    const entry: LiveSession = {
      info,
      runtime: undefined as unknown as TmuxPlayRuntime,
      seq: 0,
      turnActive: false,
      openCalls: new Map(),
    };

    const append = (rawRecord: TmuxPlayRecord): void => {
      // One truth for live and replay: what subscribers see is what
      // the stream persists, and neither carries resume tokens.
      const record = sanitizeRecord(rawRecord);
      entry.seq += 1;
      const seq = entry.seq;
      // A player record is stamped with the role whose call is open on
      // its lane; the finish trace closes the bracket after the last
      // record it covers, so the order here is stamp-then-track only
      // for the trace itself (DR-032).
      const role = roleFor(entry.openCalls, record);
      trackCallBrackets(entry.openCalls, record);
      this.store.appendRecord(info.id, seq, record, role);
      this.trackRecord(info.id, record);
      this.onRecord({
        sessionId: info.id,
        seq,
        record,
        hidden: isHidden(record),
        ...(role !== undefined ? { role } : {}),
      });
    };
    const observer = {
      onRecord: (record: TmuxPlayRecord): void => {
        append(record);
        // A captain turn that ends in error carries its cause on a
        // hidden record only; the polite reply never names it. The
        // cause must land visibly (core-service-30, DR-010 §5) —
        // synthesized here so every session subscriber and the
        // Dashboard's failure derivation see the same record.
        if (record.type === "captain_finished" && isHidden(record)) {
          const result = (record as {
            result?: { status?: string; error?: string; finalText?: string };
          }).result;
          if (result?.status === "error") {
            const cause = result.error ?? result.finalText ?? "unknown error";
            append({
              type: "runtime_error",
              turnId: (record as { turnId: number | null }).turnId,
              timestamp: this.now(),
              message: `The Captain's turn failed: ${cause}`,
              sourceRecordType: "captain_finished",
            } as TmuxPlayRecord);
          }
        }
      },
    };

    try {
      // Spex validates agents against its own launcher-parity rules
      // (adapter set, effort names), so the composed shapes satisfy
      // cligent's per-adapter discriminated config union; the casts
      // bridge the union without widening what cligent checks at
      // runtime.
      entry.runtime = await createTmuxPlayRuntime({
        captain,
        captainConfig:
          composed.captainAgent as Parameters<
            typeof createTmuxPlayRuntime
          >[0]["captainConfig"],
        players: composed.players as unknown as Parameters<
          typeof createTmuxPlayRuntime
        >[0]["players"],
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

  /** A turn just changed the session's summary — its title, count,
   * failure marker and cost (core-service-34). */
  private refreshLiveState(sessionId: string): void {
    const entry = this.live.get(sessionId);
    if (entry) this.broadcastState(sessionId, true, null, entry.info);
  }

  private trackRecord(sessionId: string, record: TmuxPlayRecord): void {
    const entry = this.live.get(sessionId);
    const ledgerChanged = (): void => {
      if (entry) this.onLedgerChange(entry.info.projectId);
    };
    switch (record.type) {
      case "turn_started": {
        const turn = (record as { turn: { id: number; prompt: string } }).turn;
        this.store.startTurn(sessionId, turn.id, turn.prompt, record.timestamp);
        // The staged intent binds the moment its turn starts (DR-035);
        // a submission the runtime never turned into a turn stamps
        // nothing.
        if (entry?.pendingIntentId !== undefined) {
          this.store.stampIntentDispatch(
            entry.pendingIntentId,
            sessionId,
            turn.id,
            record.timestamp,
          );
          entry.pendingIntentId = undefined;
        }
        // A session earns its name the moment it is asked for something
        // (core-service-32): waiting for the turn to end would leave the
        // rail saying "no messages yet" about a session already at work.
        this.refreshLiveState(sessionId);
        ledgerChanged();
        break;
      }
      case "turn_finished":
        if (record.turnId !== null) {
          this.store.endTurn(sessionId, record.turnId, "finished", record.timestamp);
        }
        this.refreshLiveState(sessionId);
        ledgerChanged();
        break;
      case "turn_aborted":
        if (record.turnId !== null) {
          this.store.endTurn(sessionId, record.turnId, "aborted", record.timestamp);
        }
        this.refreshLiveState(sessionId);
        ledgerChanged();
        break;
      case "runtime_error":
      case "player_finished":
        ledgerChanged();
        break;
      case "captain_telemetry":
        if (
          (record as { topic?: string }).topic === "playbook.fsm.state"
        ) {
          ledgerChanged();
        }
        break;
      case "player_event":
      case "captain_event": {
        // One extraction shared with the store's restart fold
        // (DR-036): live tracking and replay derive the same usage.
        const usage = foldUsage(sessionId, record);
        if (usage) this.store.addUsage(usage);
        break;
      }
      default:
        break;
    }
  }

  /**
   * Start a boss turn (CORE-5). Rejects with busy while a turn is
   * active; otherwise resolves as soon as the turn is accepted. An
   * `intentId` rides along staged (DR-035): the dispatch stamps only
   * when the turn actually starts.
   */
  submitTurn(sessionId: string, text: string, intentId?: string): void {
    const entry = this.requireLive(sessionId);
    if (entry.turnActive) {
      throw new CoreError(
        "busy",
        "a turn is already running in this session",
      );
    }
    entry.turnActive = true;
    entry.pendingIntentId = intentId;
    void entry.runtime
      .runBossTurn(text)
      .catch(() => {
        // Failures surface as runtime_error / turn_aborted records.
      })
      .finally(() => {
        entry.turnActive = false;
        // A submission that never became a turn stamps nothing.
        entry.pendingIntentId = undefined;
        this.onLedgerChange(entry.info.projectId);
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
    // A runtime that failed to dispose is unusable either way, so the
    // session ends regardless (CORE-4): holding its project would
    // strand it until a restart. The failure still reaches the caller,
    // reported after the session's end is recorded.
    let failure: { error: unknown } | undefined;
    try {
      await entry.runtime.dispose();
    } catch (error) {
      failure = { error };
    }
    this.live.delete(sessionId);
    this.liveByProject.delete(entry.info.projectId);
    const endedAt = this.now();
    this.store.endSession(sessionId, endedAt);
    this.broadcastState(sessionId, false, endedAt, entry.info);
    // A session's death releases its unfinished dispatch by
    // derivation (DR-035): the fold's consumers re-pull.
    this.onLedgerChange(entry.info.projectId);
    if (failure) throw failure.error;
  }

  /** A session.state broadcast carries the conversation summary a
   * listing would (core-service-34): the creation-time record holds
   * zeros forever, and a client that replaces its entry with those
   * would blank a row the reader is watching. */
  private broadcastState(
    sessionId: string,
    live: boolean,
    endedAt: number | null,
    fallback: SessionInfo,
  ): void {
    const described = this.store.describeSession(sessionId);
    this.onSessionState({ ...(described ?? fallback), live, endedAt });
  }

  /**
   * Dispose every live session (CORE-39). One runtime's failure must
   * not skip another's disposal — that would orphan its agent
   * processes — so each is attempted and the failures are reported
   * together once none is left.
   */
  async disposeAll(): Promise<void> {
    const failures: unknown[] = [];
    for (const sessionId of [...this.live.keys()]) {
      try {
        await this.disposeSession(sessionId);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} session runtime(s) failed to dispose`,
      );
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

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pure record reducer (RUN-14..18): folds the session record stream
// into view state. Everything the run view renders derives from
// protocol messages — no other inputs (RUN-13).

import type { TmuxPlayRecord } from "@sublang/spex-core/protocol";

export interface UsageView {
  inputTokens: number;
  outputTokens: number;
  toolUses: number;
  totalCostUsd?: number;
}

/** Stable identity + wall-clock for every transcript entry. */
export interface SegmentMeta {
  /** Record seq that created the segment (stable React key). */
  seq: number;
  /** Record timestamp, ms epoch. */
  at: number;
}

export type TranscriptSegment = SegmentMeta &
  (
    | { kind: "prompt"; text: string }
    | { kind: "text"; text: string; streaming: boolean }
    | { kind: "thinking"; summary: string }
    | {
        kind: "tool";
        toolName: string;
        toolUseId: string;
        input: unknown;
        status?: "success" | "error" | "denied";
        output?: unknown;
        durationMs?: number;
      }
    | { kind: "error"; message: string }
    | {
        kind: "result";
        status: "ok" | "aborted" | "error";
        error?: string;
        usage?: UsageView;
      }
  );

export interface PlayerView {
  id: string;
  running: boolean;
  segments: TranscriptSegment[];
  turnUsage?: UsageView;
}

export interface CaptainLine {
  /** boss: the user's own message, echoed into the thread (RUN-30).
   * question: a player asking the Boss — a first-class incoming
   * message, not a log line (RUN-9, DR-010 §1). */
  kind: "status" | "speech" | "error" | "boss" | "question";
  text: string;
  turnId: number | null;
  at: number;
  data?: unknown;
  /** question lines: the asking player (pane id when resolvable). */
  player?: string;
}

export interface SessionView {
  captain: CaptainLine[];
  /** Streaming captain speech accumulated from visible deltas. */
  captainDraft: string;
  players: Record<string, PlayerView>;
  visible: string[];
  turnActive: boolean;
  currentTurnId: number | null;
  /** True while a history replay is loading after (re)subscription. */
  loading?: boolean;
  fsmState?: string;
  captainMode?: string;
  /** Set while the playbook is parked awaiting a Boss reply. */
  pendingQuestion?: string;
  /** The asking player for the parked question (pane id). */
  pendingQuestionPlayer?: string;
  lastSeq: number;
}

export function initialSessionView(
  players: readonly { id: string }[],
  initialVisible: readonly string[],
): SessionView {
  return {
    captain: [],
    captainDraft: "",
    players: Object.fromEntries(
      players.map((player) => [
        player.id,
        { id: player.id, running: false, segments: [] },
      ]),
    ),
    visible: [...initialVisible],
    turnActive: false,
    currentTurnId: null,
    lastSeq: 0,
  };
}

function player(view: SessionView, playerId: string): PlayerView {
  const existing = view.players[playerId];
  if (existing) return existing;
  const created: PlayerView = { id: playerId, running: false, segments: [] };
  view.players[playerId] = created;
  return created;
}

function pushCaptain(view: SessionView, line: CaptainLine): void {
  view.captain.push(line);
}

/** The runtime sends either a plain string or a structured object
 * ({player, question, ...}); normalize both (RUN-9/30). */
export function parseBossQuestion(
  value: unknown,
): { question: string; player?: string } | undefined {
  if (typeof value === "string") return { question: value };
  if (typeof value === "object" && value !== null) {
    const shaped = value as { player?: unknown; question?: unknown };
    const question =
      typeof shaped.question === "string" ? shaped.question : undefined;
    if (question === undefined) return undefined;
    return typeof shaped.player === "string"
      ? { question, player: shaped.player }
      : { question };
  }
  return undefined;
}

/** One name per agent (DR-010 §2): the runtime's role name ("coder")
 * resolves to the pane id the user sees ("code-coder") when one
 * matches by equality or suffix. */
export function resolvePlayerId(
  view: SessionView,
  player: string | undefined,
): string | undefined {
  if (!player) return undefined;
  const ids = Object.keys(view.players);
  const lower = player.toLowerCase();
  return (
    ids.find((id) => id.toLowerCase() === lower) ??
    ids.find((id) => id.toLowerCase().endsWith(`-${lower}`)) ??
    player
  );
}

/** Abort reasons are runtime plumbing; translate the known ones. */
function friendlyAbortReason(reason: string): string {
  if (reason === "runtime disposed") return "session ended";
  return reason;
}

function closeStreamingText(segments: TranscriptSegment[]): void {
  const last = segments[segments.length - 1];
  if (last && last.kind === "text" && last.streaming) last.streaming = false;
}

interface AgentEventLike {
  type: string;
  payload?: unknown;
}

function applyAgentEvent(
  target: PlayerView,
  event: AgentEventLike,
  meta: SegmentMeta,
): UsageView | undefined {
  const segments = target.segments;
  switch (event.type) {
    case "text_delta": {
      const delta = (event.payload as { delta?: string })?.delta ?? "";
      const last = segments[segments.length - 1];
      if (last && last.kind === "text" && last.streaming) {
        last.text += delta;
      } else {
        segments.push({ ...meta, kind: "text", text: delta, streaming: true });
      }
      return undefined;
    }
    case "text": {
      closeStreamingText(segments);
      const content = (event.payload as { content?: string })?.content ?? "";
      segments.push({ ...meta, kind: "text", text: content, streaming: false });
      return undefined;
    }
    case "thinking": {
      closeStreamingText(segments);
      segments.push({
        ...meta,
        kind: "thinking",
        summary: (event.payload as { summary?: string })?.summary ?? "",
      });
      return undefined;
    }
    case "tool_use": {
      closeStreamingText(segments);
      const payload = event.payload as {
        toolName?: string;
        toolUseId?: string;
        input?: unknown;
      };
      segments.push({
        ...meta,
        kind: "tool",
        toolName: payload?.toolName ?? "tool",
        toolUseId: payload?.toolUseId ?? "",
        input: payload?.input,
      });
      return undefined;
    }
    case "tool_result": {
      const payload = event.payload as {
        toolUseId?: string;
        status?: "success" | "error" | "denied";
        output?: unknown;
        durationMs?: number;
      };
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        const segment = segments[i];
        if (
          segment.kind === "tool" &&
          segment.toolUseId === payload?.toolUseId
        ) {
          segment.status = payload?.status;
          segment.output = payload?.output;
          segment.durationMs = payload?.durationMs;
          break;
        }
      }
      return undefined;
    }
    case "error": {
      closeStreamingText(segments);
      segments.push({
        ...meta,
        kind: "error",
        message:
          (event.payload as { message?: string })?.message ?? "agent error",
      });
      return undefined;
    }
    case "done": {
      closeStreamingText(segments);
      const usage = (event.payload as { usage?: UsageView })?.usage;
      return usage;
    }
    default:
      return undefined;
  }
}

/** Apply one record in stream order. Mutates and returns the view. */
export function applyRecord(
  view: SessionView,
  seq: number,
  record: TmuxPlayRecord,
): SessionView {
  view.lastSeq = Math.max(view.lastSeq, seq);
  const r = record as unknown as Record<string, unknown> & {
    type: string;
    turnId: number | null;
    timestamp: number;
  };
  const meta: SegmentMeta = { seq, at: r.timestamp };

  switch (r.type) {
    case "turn_started": {
      view.turnActive = true;
      const turn = r.turn as { id: number; prompt: string };
      view.currentTurnId = turn.id;
      pushCaptain(view, {
        kind: "boss",
        text: turn.prompt,
        turnId: turn.id,
        at: r.timestamp,
      });
      break;
    }
    case "turn_finished": {
      view.turnActive = false;
      break;
    }
    case "turn_aborted": {
      view.turnActive = false;
      const reason = r.reason
        ? `: ${friendlyAbortReason(String(r.reason))}`
        : "";
      pushCaptain(view, {
        kind: "status",
        text: `◆ turn aborted${reason}`,
        turnId: r.turnId,
        at: r.timestamp,
      });
      break;
    }
    case "player_prompt": {
      const target = player(view, String(r.playerId));
      target.running = true;
      target.turnUsage = undefined;
      target.segments.push({ ...meta, kind: "prompt", text: String(r.prompt) });
      break;
    }
    case "player_event": {
      const target = player(view, String(r.playerId));
      const usage = applyAgentEvent(target, r.event as AgentEventLike, meta);
      if (usage) target.turnUsage = usage;
      break;
    }
    case "player_finished": {
      const target = player(view, String(r.playerId));
      target.running = false;
      const result = r.result as {
        status: "ok" | "aborted" | "error";
        error?: string;
      };
      target.segments.push({
        ...meta,
        kind: "result",
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
        ...(target.turnUsage ? { usage: target.turnUsage } : {}),
      });
      break;
    }
    case "captain_prompt":
      break;
    case "captain_event": {
      const event = r.event as AgentEventLike;
      if (event.type === "text_delta") {
        view.captainDraft +=
          (event.payload as { delta?: string })?.delta ?? "";
      } else if (event.type === "text") {
        view.captainDraft =
          (event.payload as { content?: string })?.content ?? "";
      }
      break;
    }
    case "captain_finished": {
      const result = r.result as { finalText?: string; status: string };
      const text = result.finalText ?? view.captainDraft;
      if (text) {
        pushCaptain(view, { kind: "speech", text, turnId: r.turnId, at: r.timestamp });
      }
      view.captainDraft = "";
      break;
    }
    case "captain_status": {
      const message = String(r.message);
      // The runtime narrates the parked question as a status line too;
      // once it lives in the thread as a question bubble, the echo is
      // noise (DR-010 §1).
      if (
        view.pendingQuestion !== undefined &&
        message.includes(view.pendingQuestion)
      ) {
        break;
      }
      pushCaptain(view, {
        kind: "status",
        text: message,
        turnId: r.turnId,
        at: r.timestamp,
        data: r.data,
      });
      break;
    }
    case "captain_telemetry": {
      const topic = String(r.topic);
      const payload = r.payload as {
        to?: string;
        state?: string;
        pendingBossQuestion?: unknown;
      };
      if (topic === "playbook.fsm.state") {
        view.fsmState = payload?.to ?? payload?.state;
        if (view.fsmState === "awaitBossReply") {
          const parsed = parseBossQuestion(payload?.pendingBossQuestion);
          view.pendingQuestion = parsed?.question ?? view.pendingQuestion ?? "";
          view.pendingQuestionPlayer = resolvePlayerId(view, parsed?.player);
          if (parsed) {
            // The status narration of the same question may have
            // landed just before this record: replace it with the
            // first-class question bubble.
            for (let i = view.captain.length - 1; i >= 0; i -= 1) {
              const line = view.captain[i];
              if (line.kind === "boss") break;
              if (
                line.kind === "status" &&
                line.text.includes(parsed.question)
              ) {
                view.captain.splice(i, 1);
                break;
              }
            }
            pushCaptain(view, {
              kind: "question",
              text: parsed.question,
              player: view.pendingQuestionPlayer,
              turnId: r.turnId,
              at: r.timestamp,
            });
          }
        } else {
          view.pendingQuestion = undefined;
          view.pendingQuestionPlayer = undefined;
        }
      } else if (topic === "playbook.captain.fsm.state") {
        view.captainMode = payload?.to;
      }
      break;
    }
    case "player_view_changed": {
      view.visible = [...(r.visiblePlayerIds as string[])];
      break;
    }
    case "runtime_error": {
      pushCaptain(view, {
        kind: "error",
        text: String(r.message),
        turnId: r.turnId,
        at: r.timestamp,
      });
      break;
    }
    default:
      break;
  }
  return view;
}

export function applyRecords(
  view: SessionView,
  records: readonly { seq: number; record: TmuxPlayRecord }[],
): SessionView {
  for (const entry of records) applyRecord(view, entry.seq, entry.record);
  return view;
}

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

export type TranscriptSegment =
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
    };

export interface PlayerView {
  id: string;
  running: boolean;
  segments: TranscriptSegment[];
  turnUsage?: UsageView;
}

export interface CaptainLine {
  kind: "status" | "speech" | "error";
  text: string;
  turnId: number | null;
  data?: unknown;
}

export interface SessionView {
  captain: CaptainLine[];
  /** Streaming captain speech accumulated from visible deltas. */
  captainDraft: string;
  players: Record<string, PlayerView>;
  visible: string[];
  turnActive: boolean;
  currentTurnId: number | null;
  fsmState?: string;
  captainMode?: string;
  /** Set while the playbook is parked awaiting a Boss reply. */
  pendingQuestion?: string;
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
): UsageView | undefined {
  const segments = target.segments;
  switch (event.type) {
    case "text_delta": {
      const delta = (event.payload as { delta?: string })?.delta ?? "";
      const last = segments[segments.length - 1];
      if (last && last.kind === "text" && last.streaming) {
        last.text += delta;
      } else {
        segments.push({ kind: "text", text: delta, streaming: true });
      }
      return undefined;
    }
    case "text": {
      closeStreamingText(segments);
      const content = (event.payload as { content?: string })?.content ?? "";
      segments.push({ kind: "text", text: content, streaming: false });
      return undefined;
    }
    case "thinking": {
      closeStreamingText(segments);
      segments.push({
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
  };

  switch (r.type) {
    case "turn_started": {
      view.turnActive = true;
      view.currentTurnId = (r.turn as { id: number }).id;
      break;
    }
    case "turn_finished": {
      view.turnActive = false;
      break;
    }
    case "turn_aborted": {
      view.turnActive = false;
      const reason = r.reason ? `: ${String(r.reason)}` : "";
      pushCaptain(view, {
        kind: "status",
        text: `◆ turn aborted${reason}`,
        turnId: r.turnId,
      });
      break;
    }
    case "player_prompt": {
      const target = player(view, String(r.playerId));
      target.running = true;
      target.turnUsage = undefined;
      target.segments.push({ kind: "prompt", text: String(r.prompt) });
      break;
    }
    case "player_event": {
      const target = player(view, String(r.playerId));
      const usage = applyAgentEvent(target, r.event as AgentEventLike);
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
        pushCaptain(view, { kind: "speech", text, turnId: r.turnId });
      }
      view.captainDraft = "";
      break;
    }
    case "captain_status": {
      pushCaptain(view, {
        kind: "status",
        text: String(r.message),
        turnId: r.turnId,
        data: r.data,
      });
      break;
    }
    case "captain_telemetry": {
      const topic = String(r.topic);
      const payload = r.payload as {
        to?: string;
        state?: string;
        pendingBossQuestion?: string;
      };
      if (topic === "playbook.fsm.state") {
        view.fsmState = payload?.to ?? payload?.state;
        if (view.fsmState === "awaitBossReply") {
          view.pendingQuestion =
            payload?.pendingBossQuestion ?? view.pendingQuestion ?? "";
        } else {
          view.pendingQuestion = undefined;
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

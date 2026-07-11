// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Record-driven notification mapping (SHELL-2/3/4): pure logic so it
// is unit-testable without Electron.

import type { RecordEnvelope } from "@sublang/spex-core";

export type NotificationSink = "bell" | "desktop";

export interface AppNotification {
  event:
    | "turn_finished"
    | "turn_aborted"
    | "player_finished"
    | "boss_question"
    | "failure";
  sink: NotificationSink;
  title: string;
  body: string;
  sessionId: string;
}

/** Resolve a configured sink (off|bell|desktop), or null for silence. */
function sinkFor(
  prefs: Record<string, string>,
  event: string,
  fallback: "off" | NotificationSink,
): NotificationSink | null {
  const value = prefs[event] ?? fallback;
  if (value === "off") return null;
  return value === "bell" ? "bell" : "desktop";
}

/**
 * Map a record envelope to a notification, or null for silence.
 *
 * turn_finished / turn_aborted / player_finished honor the configured
 * notifications prefs (off|bell|desktop; defaults: turn_finished →
 * desktop, others → off). boss_question and failure are always shown
 * on the desktop sink — they are the app's own attention signals, not
 * config events.
 */
export function notificationFor(
  envelope: RecordEnvelope,
  prefs: Record<string, string>,
): AppNotification | null {
  if (envelope.hidden) return null;
  const record = envelope.record as unknown as Record<string, unknown> & {
    type: string;
  };
  const sessionId = envelope.sessionId;

  switch (record.type) {
    case "turn_finished": {
      const sink = sinkFor(prefs, "turn_finished", "desktop");
      if (!sink) return null;
      return {
        event: "turn_finished",
        sink,
        title: "Turn finished",
        body: "The Captain finished your turn.",
        sessionId,
      };
    }
    case "turn_aborted": {
      const sink = sinkFor(prefs, "turn_aborted", "off");
      if (!sink) return null;
      return {
        event: "turn_aborted",
        sink,
        title: "Turn aborted",
        body: String(record.reason ?? "aborted"),
        sessionId,
      };
    }
    case "player_finished": {
      const sink = sinkFor(prefs, "player_finished", "off");
      if (!sink) return null;
      const result = record.result as { status?: string } | undefined;
      return {
        event: "player_finished",
        sink,
        title: "Player finished",
        body: `${String(record.playerId ?? "player")} ${String(result?.status ?? "finished")}`,
        sessionId,
      };
    }
    case "captain_telemetry": {
      const payload = record.payload as {
        to?: string;
        pendingBossQuestion?: string;
      };
      if (
        String(record.topic) === "playbook.fsm.state" &&
        payload?.to === "awaitBossReply"
      ) {
        return {
          event: "boss_question",
          sink: "desktop",
          title: "A player needs you",
          body: payload.pendingBossQuestion ?? "A playbook is waiting for your reply.",
          sessionId,
        };
      }
      return null;
    }
    case "runtime_error":
      return {
        event: "failure",
        sink: "desktop",
        title: "Playbook error",
        body: String(record.message ?? "runtime error"),
        sessionId,
      };
    default:
      return null;
  }
}

/** Track the pending-attention count for the dock badge (SHELL-4). */
export class AttentionTracker {
  private readonly pending = new Map<
    string,
    { question: boolean; failure: boolean }
  >();

  apply(envelope: RecordEnvelope): number {
    const record = envelope.record as unknown as {
      type: string;
      topic?: string;
      payload?: { to?: string };
    };
    const state = this.pending.get(envelope.sessionId) ?? {
      question: false,
      failure: false,
    };
    if (
      record.type === "captain_telemetry" &&
      record.topic === "playbook.fsm.state"
    ) {
      state.question = record.payload?.to === "awaitBossReply";
      if (record.payload?.to === "failed") state.failure = true;
      this.pending.set(envelope.sessionId, state);
    } else if (record.type === "runtime_error") {
      state.failure = true;
      this.pending.set(envelope.sessionId, state);
    } else if (record.type === "turn_started") {
      state.failure = false;
      this.pending.set(envelope.sessionId, state);
    }
    return this.count();
  }

  clear(sessionId: string): number {
    this.pending.delete(sessionId);
    return this.count();
  }

  count(): number {
    return [...this.pending.values()].filter(
      (state) => state.question || state.failure,
    ).length;
  }
}

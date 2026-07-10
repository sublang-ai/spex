// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Record-driven notification mapping (SHELL-2/3/4): pure logic so it
// is unit-testable without Electron.

import type { RecordEnvelope } from "@sublang/spex-core";

export interface AppNotification {
  event: "turn_finished" | "turn_aborted" | "boss_question" | "failure";
  title: string;
  body: string;
  sessionId: string;
}

/** Map a record envelope to a notification, or null for silence. */
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
    case "turn_finished":
      if ((prefs.turn_finished ?? "desktop") === "off") return null;
      return {
        event: "turn_finished",
        title: "Turn finished",
        body: "The Captain finished your turn.",
        sessionId,
      };
    case "turn_aborted":
      if ((prefs.turn_aborted ?? "off") === "off") return null;
      return {
        event: "turn_aborted",
        title: "Turn aborted",
        body: String(record.reason ?? "aborted"),
        sessionId,
      };
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
  private readonly pending = new Map<string, boolean>();

  apply(envelope: RecordEnvelope): number {
    const record = envelope.record as unknown as {
      type: string;
      topic?: string;
      payload?: { to?: string };
    };
    if (
      record.type === "captain_telemetry" &&
      record.topic === "playbook.fsm.state"
    ) {
      this.pending.set(
        envelope.sessionId,
        record.payload?.to === "awaitBossReply",
      );
    }
    return this.count();
  }

  clear(sessionId: string): number {
    this.pending.delete(sessionId);
    return this.count();
  }

  count(): number {
    return [...this.pending.values()].filter(Boolean).length;
  }
}

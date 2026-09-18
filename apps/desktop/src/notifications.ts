// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Record-driven notification mapping (SHELL-2/3/4): pure logic so it
// is unit-testable without Electron.
//
// The shell's own words come from its catalog in the language the
// caller activated (app-shell-29); text the run relays — a question,
// an abort reason, an error message — stays as the record wrote it.

import type { I18n } from "@lingui/core";
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

/** A state reported by fsm telemetry: the playbook 2.0 shell sends
 * rich objects ({stateId, value, …}); the fake harness and older
 * playbooks send bare strings. Accept both. */
function stateText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const shape = value as { stateId?: unknown; value?: unknown };
    if (typeof shape.stateId === "string") return shape.stateId;
    if (typeof shape.value === "string") return shape.value;
  }
  return undefined;
}

/** The pending Boss question: a bare string, or the shell's
 * {player, question, …} record. */
function questionText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const shape = value as { question?: unknown };
    if (typeof shape.question === "string") return shape.question;
  }
  return undefined;
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
 *
 * `i18n` speaks the home's language already (app-shell-29): the caller
 * resolves and activates it, so this mapping stays pure.
 */
export function notificationFor(
  envelope: RecordEnvelope,
  prefs: Record<string, string>,
  i18n: I18n,
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
        title: i18n._("Turn finished"),
        body: i18n._("The Captain finished your turn."),
        sessionId,
      };
    }
    case "turn_aborted": {
      const sink = sinkFor(prefs, "turn_aborted", "off");
      if (!sink) return null;
      return {
        event: "turn_aborted",
        sink,
        title: i18n._("Turn aborted"),
        body: String(
          record.reason ??
            i18n._({
              id: "aborted",
              comment: "Notification body when an aborted turn names no reason",
            }),
        ),
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
        title: i18n._("Player finished"),
        body: i18n._("{playerId} {status}", {
          playerId: String(
            record.playerId ??
              i18n._({
                id: "player",
                comment: "Stands in for a player the record does not name",
              }),
          ),
          status: String(
            result?.status ??
              i18n._({
                id: "finished",
                comment: "Stands in for a result the record does not name",
              }),
          ),
        }),
        sessionId,
      };
    }
    case "captain_telemetry": {
      const payload = record.payload as {
        to?: unknown;
        state?: unknown;
        pendingBossQuestion?: unknown;
      };
      const to = stateText(payload?.to) ?? stateText(payload?.state);
      if (
        String(record.topic) === "playbook.fsm.state" &&
        to === "awaitBossReply"
      ) {
        return {
          event: "boss_question",
          sink: "desktop",
          title: i18n._("A player needs you"),
          body:
            questionText(payload?.pendingBossQuestion) ??
            i18n._("A playbook is waiting for your reply."),
          sessionId,
        };
      }
      // Playbook 2.0 resolves recoverable failures as a `failed`
      // workflow state without any runtime_error record, so the
      // failure notification must come from the state stream.
      if (String(record.topic) === "playbook.fsm.state" && to === "failed") {
        return {
          event: "failure",
          sink: "desktop",
          title: i18n._("Playbook failed"),
          body: i18n._("A playbook entered its failed state and needs attention."),
          sessionId,
        };
      }
      return null;
    }
    case "runtime_error":
      return {
        event: "failure",
        sink: "desktop",
        title: i18n._("Playbook error"),
        body: String(
          record.message ??
            i18n._({
              id: "runtime error",
              comment: "Notification body when a runtime error carries no message",
            }),
        ),
        sessionId,
      };
    default:
      return null;
  }
}

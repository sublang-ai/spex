// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A control's kind is execution evidence, not intent state. Playbook's
// turn record carries the control label but not whether it was a recovery
// or an ending, so the core keeps that fact in the same durable stream.

import type { TmuxPlayRecord } from "./protocol.js";

export type TurnControlKind = "recovery" | "ending";

/** The runtime terminal's durable discriminator for an explicit Boss
 * abort. Runtime failures also end with `turn_aborted`, so status alone
 * cannot distinguish stopped work from failed work. */
export const BOSS_ABORT_REASON = "aborted by the Boss";
export const CORE_STOP_REASON = "interrupted when Spex closed";

export function isStoppedTurnReason(value: unknown): boolean {
  return value === BOSS_ABORT_REASON || value === CORE_STOP_REASON;
}

const TOPIC = "spex.session.control";

export function controlRecord(
  turnId: number,
  kind: TurnControlKind,
  timestamp: number,
): TmuxPlayRecord {
  return {
    type: "captain_telemetry",
    topic: TOPIC,
    payload: { kind },
    turnId,
    timestamp,
    visibility: "hidden",
  } as unknown as TmuxPlayRecord;
}

export function controlKind(
  record: TmuxPlayRecord,
): TurnControlKind | undefined {
  if (record.type !== "captain_telemetry") return undefined;
  const telemetry = record as unknown as {
    topic?: unknown;
    payload?: { kind?: unknown };
  };
  if (telemetry.topic !== TOPIC) return undefined;
  return telemetry.payload?.kind === "recovery" ||
    telemetry.payload?.kind === "ending"
    ? telemetry.payload.kind
    : undefined;
}

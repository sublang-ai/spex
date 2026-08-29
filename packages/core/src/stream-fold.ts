// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The record stream is the one persisted truth for a session
// (DR-036, core-service-10): turns and usage fold from it. These
// helpers are the single extraction the live path (session.ts) and
// the store's load-time fold share, so a restart derives exactly what
// live tracking derived.

import type { TmuxPlayRecord } from "./protocol.js";

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

export type TurnEvent =
  | { kind: "start"; turnId: number; prompt: string; at: number }
  | { kind: "end"; turnId: number; status: "finished" | "aborted"; at: number };

/** The turn transition a record carries, if any. */
export function foldTurnEvent(record: TmuxPlayRecord): TurnEvent | undefined {
  switch (record.type) {
    case "turn_started": {
      const turn = (record as { turn: { id: number; prompt: string } }).turn;
      return { kind: "start", turnId: turn.id, prompt: turn.prompt, at: record.timestamp };
    }
    case "turn_finished":
      return record.turnId !== null
        ? { kind: "end", turnId: record.turnId, status: "finished", at: record.timestamp }
        : undefined;
    case "turn_aborted":
      return record.turnId !== null
        ? { kind: "end", turnId: record.turnId, status: "aborted", at: record.timestamp }
        : undefined;
    default:
      return undefined;
  }
}

/** The usage a done event carries, if any (DR-032 provenance rules). */
export function foldUsage(
  sessionId: string,
  record: TmuxPlayRecord,
): UsageEntry | undefined {
  if (record.type !== "player_event" && record.type !== "captain_event") {
    return undefined;
  }
  const event = (record as { event: { type: string; payload?: unknown } }).event;
  if (event.type !== "done") return undefined;
  const payload = event.payload as {
    usage?: {
      toolUses?: number;
      // cligent 0.22: an absent report means the runtime told us
      // nothing, which is not the same as measuring zero.
      tokens?: {
        coverage?: string;
        totals?: {
          input?: { total?: number };
          output?: { total?: number };
        };
      };
      cost?: { amount?: number; currency?: string; source?: string };
    };
    durationMs?: number;
  };
  const tokens = payload.usage?.tokens;
  const cost = payload.usage?.cost;
  return {
    sessionId,
    turnId: record.turnId,
    // Usage attributes to the lane that spent it, so a shared player's
    // rollup spans the playbooks sharing it (DR-032).
    actorId:
      record.type === "player_event"
        ? (record as { playerId: string }).playerId
        : "captain",
    // Totals are inclusive of cached reads: never re-added.
    ...(tokens?.totals
      ? {
          inputTokens: tokens.totals.input?.total ?? 0,
          outputTokens: tokens.totals.output?.total ?? 0,
        }
      : {}),
    toolUses: payload.usage?.toolUses ?? 0,
    ...(typeof cost?.amount === "number"
      ? {
          totalCostUsd: cost.amount,
          ...(cost.source ? { costSource: cost.source } : {}),
        }
      : {}),
    ...(payload.durationMs !== undefined ? { durationMs: payload.durationMs } : {}),
    at: record.timestamp,
  };
}

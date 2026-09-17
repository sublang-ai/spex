// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The record stream is the one persisted truth for a session
// (DR-036, core-service-10): turns, usage, and active time fold from it. These
// helpers are the single extraction the live path (session.ts) and
// the store's load-time fold share, so a restart derives exactly what
// live tracking derived.

import type { StoredRecord, TmuxPlayRecord } from "./protocol.js";
import { hasPresentationHeader } from "./protocol.js";

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

interface OpenAgentCall {
  actorId: string;
  turnId: number;
  at: number;
}

/**
 * Completed prompt-to-finish time by agent (DR-071). The fold is pure over
 * stored records so live summaries, restart replay, and foreign-session scans
 * cannot acquire different clocks or pairing state.
 */
export function foldAgentActiveMs(
  entries: readonly Pick<StoredRecord, "record">[],
): Record<string, number> | undefined {
  const openPlayers: OpenAgentCall[] = [];
  const openCaptains: OpenAgentCall[] = [];
  const totals = new Map<string, number>();

  const close = (
    open: OpenAgentCall[],
    actorId: string,
    turnId: number,
    at: number,
  ): void => {
    const index = open.findIndex(
      (call) => call.actorId === actorId && call.turnId === turnId,
    );
    if (index < 0) return;
    const [started] = open.splice(index, 1);
    totals.set(
      actorId,
      (totals.get(actorId) ?? 0) + Math.max(0, at - started.at),
    );
  };

  for (const { record } of entries) {
    if (!hasPresentationHeader(record)) continue;
    const turnId = (record as { turnId?: unknown }).turnId;
    if (typeof turnId !== "number" || !Number.isFinite(turnId)) continue;

    switch (record.type) {
      case "player_prompt": {
        const playerId = (record as { playerId?: unknown }).playerId;
        if (typeof playerId === "string") {
          openPlayers.push({ actorId: playerId, turnId, at: record.timestamp });
        }
        break;
      }
      case "player_finished": {
        const playerId = (record as { playerId?: unknown }).playerId;
        if (typeof playerId === "string") {
          close(openPlayers, playerId, turnId, record.timestamp);
        }
        break;
      }
      case "captain_prompt":
        openCaptains.push({ actorId: "captain", turnId, at: record.timestamp });
        break;
      case "captain_finished":
        close(openCaptains, "captain", turnId, record.timestamp);
        break;
      default:
        break;
    }
  }

  return totals.size > 0 ? Object.fromEntries(totals) : undefined;
}

/**
 * Strip provider resume tokens from a record before it is served or
 * persisted (DR-036): the playbook store classifies resume tokens as
 * opaque credentials for backend conversations, and the local
 * hints file is their only Spex-managed home — the record stream is a
 * token-free replay projection. Tokens ride as `resumeToken` fields
 * (player/captain results, playbook.trace payloads) and as the
 * string-valued `resume` selection in trace payloads; `resume: false`
 * is semantics, not a token, and survives.
 */
export function sanitizeRecord(record: TmuxPlayRecord): TmuxPlayRecord {
  return sanitizeValue(record) as TmuxPlayRecord;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "resumeToken") continue;
    if (key === "resume" && typeof entry === "string") continue;
    out[key] = sanitizeValue(entry);
  }
  return out;
}

export type TurnEvent =
  | { kind: "start"; turnId: number; prompt: string; at: number }
  | { kind: "end"; turnId: number; status: "finished" | "aborted"; at: number };

/** The turn transition a record carries, if any. */
export function foldTurnEvent(record: TmuxPlayRecord): TurnEvent | undefined {
  if (!hasPresentationHeader(record)) return undefined;
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
  if (!hasPresentationHeader(record)) return undefined;
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
      // The pre-0.22 flat shape, alive in stored streams: a released
      // stream is never rewritten, so the fold reads both generations
      // (core-service-15).
      inputTokens?: number;
      outputTokens?: number;
    };
    durationMs?: number;
  };
  const tokens = payload.usage?.tokens;
  const legacyTokens =
    !tokens?.totals &&
    (typeof payload.usage?.inputTokens === "number" ||
      typeof payload.usage?.outputTokens === "number")
      ? {
          inputTokens: payload.usage?.inputTokens ?? 0,
          outputTokens: payload.usage?.outputTokens ?? 0,
        }
      : undefined;
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
      : (legacyTokens ?? {})),
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

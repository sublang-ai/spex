// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A control's kind is execution evidence, not intent state. Playbook's
// turn record carries the control label but not whether it was a recovery
// or an ending, so the core keeps that fact in the same durable stream.

import { RESTORED_TOPIC, type FailureCause, type RestoredPosition, type RestoredRun, type TmuxPlayRecord } from "./protocol.js";

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

/** The cause a checkpointed failure carries: the runtime's
 * `{lastError: {cause: {code, evidence?}}}`, read as defensively as a
 * record's (DR-075), or nothing. */
function checkpointCause(context: unknown): FailureCause | undefined {
  const cause = (context as { lastError?: { cause?: { code?: unknown; evidence?: unknown } } } | null)
    ?.lastError?.cause;
  if (!cause || typeof cause.code !== "string" || cause.code === "") return undefined;
  const evidence = cause.evidence && typeof cause.evidence === "object" && !Array.isArray(cause.evidence)
    ? cause.evidence as Record<string, unknown>
    : undefined;
  return { code: cause.code, ...(evidence ? { evidence } : {}) };
}

/** The runs a settled Captain snapshot holds engaged, root to leaf
 * (core-service-82, DR-088): read from Playbook's public shell
 * snapshot, whose `engaged.parked` mode carries the frames, and none
 * where the Captain is back in chat. A frame lacking what a run needs
 * to be drawn is left out rather than guessed. */
export function restoredRuns(snapshot: unknown): RestoredRun[] {
  const shell = snapshot as { mode?: unknown; frames?: unknown } | undefined;
  if (shell?.mode !== "engaged.parked" || !Array.isArray(shell.frames)) return [];
  return shell.frames.flatMap((frame: unknown): RestoredRun[] => {
    const entry = frame as {
      sessionId?: unknown;
      playbookId?: unknown;
      depth?: unknown;
      parentSessionId?: unknown;
      runtime?: { state?: unknown; pendingBossQuestions?: unknown; machine?: { context?: unknown } };
    } | null;
    if (typeof entry?.sessionId !== "string" || typeof entry.playbookId !== "string") return [];
    const questions = entry.runtime?.pendingBossQuestions;
    const cause = checkpointCause(entry.runtime?.machine?.context);
    return [{
      sessionId: entry.sessionId,
      playbookId: entry.playbookId,
      depth: typeof entry.depth === "number" ? entry.depth : 0,
      ...(typeof entry.parentSessionId === "string" ? { parentSessionId: entry.parentSessionId } : {}),
      state: entry.runtime?.state ?? null,
      pendingBossQuestions: Array.isArray(questions) ? questions : [],
      ...(cause ? { cause } : {}),
    }];
  });
}

/** The visible record of a restore's settled position: one per restore
 * turn, so it also marks that turn as a report rather than work. */
export function restoredRecord(
  turnId: number,
  runs: RestoredRun[],
  timestamp: number,
): TmuxPlayRecord {
  return {
    type: "captain_telemetry",
    topic: RESTORED_TOPIC,
    payload: { runs } satisfies RestoredPosition,
    turnId,
    timestamp,
  } as unknown as TmuxPlayRecord;
}

/** The position a restore record states, or undefined for any other
 * record. */
export function restoredPosition(
  record: TmuxPlayRecord,
): RestoredPosition | undefined {
  if (record.type !== "captain_telemetry") return undefined;
  const telemetry = record as unknown as { topic?: unknown; payload?: { runs?: unknown } };
  if (telemetry.topic !== RESTORED_TOPIC) return undefined;
  const runs = telemetry.payload?.runs;
  return {
    runs: Array.isArray(runs)
      ? runs.filter((run): run is RestoredRun =>
        typeof (run as { sessionId?: unknown })?.sessionId === "string")
      : [],
  };
}

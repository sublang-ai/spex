// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The calls a run hands its players (run-view-180..183): one entry per
// traced player call, keyed by its trace session and call id — a call
// id counts within one runtime session only — with the outcome the
// Captain accepted for it and the repository identity the runtime wrote
// with that outcome. Pure over the record stream in its order, so a
// reopened session derives the same calls as the live one did.

import { effectIdentities } from "./step-words.js";

/** `lost`: the process died in the call, which never finished. */
export type StepCallStatus = "running" | "returned" | "aborted" | "failed" | "lost";

export interface StepCall {
  /** The trace session and its call id. */
  key: string;
  sessionId: string;
  callId: string;
  /** The run's playbook, and the playbooks from the root run down to it. */
  playbookId: string;
  path: string[];
  stateId: string;
  role?: string;
  playerId?: string;
  /** This call's place among the calls of the same step in its run. */
  round: number;
  startedAt: number;
  finishedAt?: number;
  status: StepCallStatus;
  /** The player's final reply. */
  finalText?: string;
  /** The seq of the lane's prompt this call's player record began. */
  promptSeq?: number;
  /** The outcome the Captain accepted for this call. */
  outcome?: string;
  /** The repository identities the runtime wrote with that outcome. */
  identities?: string[];
  /** No outcome can come any more: a later call of the step started,
   * the run ended or moved to its failure state, or the turn ended. */
  closed?: boolean;
  /** No outcome can come because the run failed — a judgment or the
   * runtime, not the Boss's stop (run-view-183). */
  failed?: boolean;
}

export interface StepCallState {
  calls: StepCall[];
  /** Each trace session's playbook and caller, for a call's path. */
  runs: Record<string, { playbookId: string; parentSessionId?: string }>;
  /** Each run's transition whose accepted outcomes are still being
   * collected: the records of one transition arrive together, its
   * outcomes straight after it, and the run's next record of another
   * type ends them (Playbook's `enqueueTransitionEmission`). Another
   * run's transition between them leaves this run's collecting. */
  batches: Record<string, Batch>;
}

interface Batch {
  output: unknown;
  /** The calls its outcomes went to. */
  keys: string[];
  /** Every outcome it accepted, whether or not a call took it. */
  outcomes: number;
  ends?: boolean;
  fails?: boolean;
}

export function initialStepCalls(): StepCallState {
  return { calls: [], runs: {}, batches: {} };
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

export function callKey(sessionId: string, callId: string): string {
  return `${sessionId}#${callId}`;
}

/** A run's batch's identities go to its one outcome's call: a
 * transition that accepted several outcomes — a call taking one or not —
 * names no identity for any of them. */
function seal(state: StepCallState, sessionId: string): void {
  const batch = state.batches[sessionId];
  if (!batch) return;
  delete state.batches[sessionId];
  // A transition that ended the run, or moved it to its failure state,
  // leaves every call it did not accept an outcome for owed none.
  if (batch.ends) closeRun(state, sessionId, batch.fails);
  if (batch.outcomes !== 1 || batch.keys.length !== 1) return;
  const call = state.calls.find((entry) => entry.key === batch.keys[0]);
  if (!call) return;
  const identities = effectIdentities(call.playbookId, call.stateId, batch.output);
  if (identities.length > 0) call.identities = identities;
}

function pathOf(state: StepCallState, sessionId: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  for (let id: string | undefined = sessionId; id && !seen.has(id); id = state.runs[id]?.parentSessionId) {
    seen.add(id);
    const run = state.runs[id];
    if (!run) break;
    path.unshift(run.playbookId);
  }
  return path;
}

/** Every call of a run still owed an outcome is owed none any more. */
function closeRun(state: StepCallState, sessionId?: string, failed = false): void {
  for (const call of state.calls) {
    if (sessionId !== undefined && call.sessionId !== sessionId) continue;
    if (call.status !== "returned" || call.outcome !== undefined || call.closed) continue;
    call.closed = true;
    if (failed) call.failed = true;
  }
}

/** Folds one `playbook.trace` payload into the calls. */
export function foldCallTrace(state: StepCallState, payload: unknown, at: number): void {
  const trace = (payload ?? {}) as Record<string, unknown>;
  const sessionId = asString(trace.sessionId);
  const playbookId = asString(trace.playbookId);
  const type = asString(trace.type);
  if (!sessionId || !playbookId || !type) return;
  state.runs[sessionId] ??= {
    playbookId,
    ...(asString(trace.parentSessionId) ? { parentSessionId: asString(trace.parentSessionId) } : {}),
  };
  // Only the same run's next record of another type ends a batch:
  // another run's records, or the state telemetry, may come between.
  if (type !== "outcome.accepted") seal(state, sessionId);
  const body = (trace.payload ?? {}) as Record<string, unknown>;
  const callId = asString(trace.callId);
  switch (type) {
    case "player.call.started": {
      const stateId = asString(body.stateId);
      if (!callId || !stateId) return;
      let round = 1;
      for (const call of state.calls) {
        if (call.sessionId !== sessionId || call.stateId !== stateId) continue;
        round += 1;
        if (call.outcome === undefined) call.closed = true;
      }
      const role = asString(body.roleId);
      const playerId = asString(body.playerId);
      state.calls.push({
        key: callKey(sessionId, callId),
        sessionId,
        callId,
        playbookId,
        path: pathOf(state, sessionId),
        stateId,
        ...(role ? { role } : {}),
        ...(playerId ? { playerId } : {}),
        round,
        startedAt: at,
        status: "running",
      });
      return;
    }
    case "player.call.finished": {
      if (!callId) return;
      const call = state.calls.find((entry) => entry.key === callKey(sessionId, callId));
      if (!call || call.status !== "running") return;
      call.finishedAt = at;
      const status = asString(body.status);
      call.status = status === "ok" ? "returned" : status === "aborted" ? "aborted" : "failed";
      const finalText = asString(body.finalText);
      if (finalText && call.status === "returned") call.finalText = finalText;
      return;
    }
    case "fsm.transition": {
      const event = body.event as { output?: unknown } | undefined;
      const next = body.state as { activeStateIds?: unknown; stateId?: unknown; status?: unknown } | undefined;
      const active = Array.isArray(next?.activeStateIds) ? next.activeStateIds : [next?.stateId];
      const ends = active.includes("failed") || (next?.status !== undefined && next.status !== "active");
      // A failure the Boss's own stop caused fails no call (run-view-187).
      const cause = (body.lastError as { cause?: { code?: unknown } } | undefined)?.cause?.code;
      const fails = active.includes("failed") && cause !== "aborted";
      state.batches[sessionId] = { output: event?.output, keys: [], outcomes: 0, ...(ends ? { ends } : {}), ...(fails ? { fails } : {}) };
      return;
    }
    case "outcome.accepted": {
      const source = asString(body.source);
      const outcome = asString(body.acceptedOutcome);
      if (!source || !outcome) return;
      const batch = state.batches[sessionId];
      if (batch) batch.outcomes += 1;
      // The latest call of that step, if it still waits for one: a
      // later call of the step closes the earlier, and another step's
      // calls — a parallel branch's — never take it.
      const call = [...state.calls]
        .reverse()
        .find((entry) => entry.sessionId === sessionId && entry.stateId === source);
      if (!call || call.status !== "returned" || call.outcome !== undefined || call.closed) return;
      call.outcome = outcome;
      batch?.keys.push(call.key);
      return;
    }
    case "session.disposed":
      closeRun(state, sessionId);
      return;
    default:
      return;
  }
}

/** The turn ended, or a restore moved the runs to their recorded
 * position: no call is owed an outcome any more, and a call still
 * open is one the process died in — it runs no more and takes no later
 * prompt (run-view-74). */
export function closeTurn(state: StepCallState): void {
  // A collection the turn's end cut off names no identity.
  state.batches = {};
  closeRun(state);
  for (const call of state.calls) {
    if (call.status !== "running") continue;
    call.status = "lost";
    call.closed = true;
  }
}

/** The call a player's prompt record begins: the earliest open call
 * of that player not yet given one, since a player's calls run one at
 * a time and its prompt follows its call's start. */
export function claimPrompt(state: StepCallState, playerId: string, seq: number): StepCall | undefined {
  const call = state.calls.find((entry) =>
    entry.playerId === playerId && entry.status === "running" && entry.promptSeq === undefined);
  if (call) call.promptSeq = seq;
  return call;
}

/** Whether the Captain is still judging what a returned call came
 * back with. */
export function judging(call: StepCall): boolean {
  return call.status === "returned" && call.outcome === undefined && !call.closed;
}

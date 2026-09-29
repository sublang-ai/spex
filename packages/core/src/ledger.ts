// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The intent-ledger fold (DR-035): every visible intent state derives
// here, deterministically, from intent rows, the persisted record
// stream, and the viewed markers — arrival-order-independent and
// restart-identical. This is the one derivation the Dashboard, the
// sidebar, and the dock badge consume; nothing else computes attention.

import { isDeepStrictEqual } from "node:util";

import type {
  AttentionEntry,
  DerivedIntent,
  FailureCause,
  IntentInfo,
  IntentStats,
  LedgerState,
  QueueSchedule,
  StoredRecord,
} from "./protocol.js";
import { controlKind, isStoppedTurnReason, restoredPosition } from "./control-record.js";
import type { Store } from "./store.js";

/** What the session manager knows live: the lanes and their activity. */
export interface LiveLane {
  sessionId: string;
  projectId: string;
  turnActive: boolean;
  /** Full settlement or an authorized handoff still owns the lane. */
  settling?: boolean;
}

/** The intent's display title: the first line of its text. */
export function intentTitle(intent: IntentInfo): string {
  const line = intent.text.split(/\r?\n/, 1)[0]?.trim();
  return line && line.length > 0 ? line : intent.text.trim();
}

interface Turn {
  turnId: number;
  prompt: string;
  startedAt: number;
  endedAt: number | null;
  status: string | null;
}

/** A session's standing needs-you conditions, folded from its visible
 * records exactly as the run view folds them (dashboard-10). */
export interface SessionConditions {
  /** A pending Boss question the runtime reported — a park at
   * awaitBossReply, or a state report carrying pending questions — and
   * has not yet reported gone (DR-085). */
  question?: { since: number; turnId: number | null };
  /**
   * A run stands parked in its failure state. Unlike a question, a
   * later Boss turn does not clear this: a failure is resolved by the
   * run leaving that state — recovered or ended — and not by talking
   * about something else (DR-062, dashboard-10). `cause` is the
   * structured cause the runtime attached to that failure, where it
   * attached one (DR-075).
   */
  failure?: { since: number; turnId: number | null; cause?: FailureCause };
  /** Latest structured failure cause, including an unparked failure. */
  failureCause?: FailureCause;
}

/** The cause a record carries, or nothing (core-service-49, DR-075).
 * The shape is the runtime's, so it is read defensively: anything
 * that is not `{ code: string }` with an optional JSON object beside
 * it is dropped rather than half-read, and no phrase is invented for
 * a record that carried none. */
export function readFailureCause(value: unknown): FailureCause | undefined {
  const holder = value as { lastError?: unknown; cause?: unknown } | null;
  if (!holder || typeof holder !== "object") return undefined;
  const inner = (holder.lastError as { cause?: unknown } | undefined)?.cause;
  const candidate = (inner ?? holder.cause) as
    | { code?: unknown; evidence?: unknown }
    | undefined;
  if (!candidate || typeof candidate !== "object") return undefined;
  if (typeof candidate.code !== "string" || candidate.code === "") return undefined;
  const evidence =
    candidate.evidence &&
    typeof candidate.evidence === "object" &&
    !Array.isArray(candidate.evidence)
      ? (candidate.evidence as Record<string, unknown>)
      : undefined;
  return { code: candidate.code, ...(evidence ? { evidence } : {}) };
}

/** The runtime reports an intentional stop as both a runtime_error and
 * a turn_aborted terminal. Ignore only that synthetic error: a genuine
 * earlier failure in the same turn must keep standing. */
function stoppedTurnErrorSeqs(records: StoredRecord[]): Set<number> {
  const ignored = new Set<number>();
  for (let index = 0; index < records.length; index += 1) {
    const terminal = records[index]?.record as {
      type?: unknown;
      turnId?: unknown;
      reason?: unknown;
    } | undefined;
    if (terminal?.type !== "turn_aborted" ||
        typeof terminal.turnId !== "number" ||
        !isStoppedTurnReason(terminal.reason)) continue;
    for (let before = index - 1; before >= 0; before -= 1) {
      const candidate = records[before];
      if (!candidate) continue;
      const record = candidate.record as {
        type?: unknown;
        turnId?: unknown;
        message?: unknown;
      };
      if (record.type === "turn_started") break;
      if (record.type === "runtime_error" &&
          record.turnId === terminal.turnId &&
          record.message === terminal.reason) {
        ignored.add(candidate.seq);
        break;
      }
    }
  }
  return ignored;
}

/** How many questions a state report's pending set holds (DR-085): the
 * set is an array, an object of questions, or one question, and an
 * entry counts when it is a string or carries a string `question` —
 * the same reading the run view's reducer gives it. */
function pendingQuestionCount(payload: {
  pendingBossQuestion?: unknown;
  pendingBossQuestions?: unknown;
}): number {
  const questions = payload.pendingBossQuestions;
  const list: unknown[] = Array.isArray(questions)
    ? questions
    : questions && typeof questions === "object"
      ? Object.values(questions)
      : [payload.pendingBossQuestion];
  return list.filter((entry) =>
    typeof entry === "string" ||
    (entry !== null &&
      typeof entry === "object" &&
      typeof (entry as { question?: unknown }).question === "string")
  ).length;
}

/** The state a trace, a state report or a restored run names: a string,
 * or an object carrying `stateId` or `value`. */
function stateName(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const shape = value as { stateId?: unknown; value?: unknown };
    if (typeof shape.stateId === "string") return shape.stateId;
    if (typeof shape.value === "string") return shape.value;
  }
  return undefined;
}

/** The turns a restore reported (core-service-82, DR-088): each is the
 * account of interrupted work, a stop rather than work that finished. */
function restoredTurnIds(records: StoredRecord[]): Set<number> {
  const ids = new Set<number>();
  for (const { record } of records) {
    if (!restoredPosition(record)) continue;
    const turnId = (record as { turnId?: unknown }).turnId;
    if (typeof turnId === "number") ids.add(turnId);
  }
  return ids;
}

/** The restores that brought a run back in its failure state
 * (dashboard-10, DR-088): each is a turn whose engagement settled
 * failed, the failure the Boss did not stop himself. */
function restoredFailures(
  records: StoredRecord[],
): { seq: number; turnId: number; timestamp: number }[] {
  return records.flatMap(({ seq, record }) => {
    const position = restoredPosition(record);
    const turnId = (record as { turnId?: unknown }).turnId;
    if (!position || typeof turnId !== "number") return [];
    return position.runs.some((run) => stateName(run.state) === "failed")
      ? [{ seq, turnId, timestamp: record.timestamp }]
      : [];
  });
}

/** A session's turns as every ledger read takes them (core-service-82,
 * DR-088): a restore's report ends finished, yet it accounts for work
 * that stopped, so it reads as the aborted turn it reports — it
 * finishes no intent, raises no review, and leaves the lane stopped. */
function ledgerTurns(store: Store, sessionId: string): Turn[] {
  const turns = store.listTurns(sessionId);
  const restored = restoredTurnIds(store.getRecords(sessionId));
  if (restored.size === 0) return turns;
  return turns.map((turn) =>
    restored.has(turn.turnId) && turn.status === "finished"
      ? { ...turn, status: "aborted" }
      : turn
  );
}

/** Whether a trace is the Captain shell's own machine rather than a
 * playbook run: its moves park nothing (core-service-107), the rule
 * the run view's frames draw by (run-view-74). */
function captainOwn(trace: { playbookId?: unknown; depth?: unknown }): boolean {
  return trace.playbookId === "captain" && (trace.depth === undefined || trace.depth === 0);
}

export function foldConditions(records: StoredRecord[]): SessionConditions {
  // The Captain shell's own move last traced, until the aggregate state
  // report that repeats it: that report is the shell's, not a run's.
  let captainMove: { from?: string; to?: string } | undefined;
  const abortErrors = stoppedTurnErrorSeqs(records);
  let fallbackQuestion: SessionConditions["question"];
  let fallbackFailure: SessionConditions["failure"];
  // The run-specific trace is authoritative where present. The shell's
  // aggregate state topic remains a fallback for older streams that did
  // not identify the machine which moved.
  const parkedQuestions = new Map<string, NonNullable<SessionConditions["question"]>>();
  const parkedFailures = new Map<string, NonNullable<SessionConditions["failure"]>>();
  // A cause belongs to the failure beside which the runtime emitted it;
  // it is never a session-global label. Hold an as-yet-unmatched cause
  // only until the next failure event consumes it, and retain a cause
  // separately for the latest unparked runtime error.
  let pendingCause: FailureCause | undefined;
  let pendingFromError = false;
  const pendingByRun = new Map<string, FailureCause>();
  let unparkedFailureCause: FailureCause | undefined;
  let latestFailure: "parked" | "fallback" | "unparked" | undefined;
  const bearsCause = (value: unknown, runId?: string): void => {
    const read = readFailureCause(value);
    if (!read) return;
    if (runId) {
      const parked = parkedFailures.get(runId);
      if (parked && !parked.cause) parked.cause = read;
      else pendingByRun.set(runId, read);
      return;
    }
    if (latestFailure === "fallback" && fallbackFailure) {
      if (!fallbackFailure.cause) fallbackFailure.cause = read;
      else if (!isDeepStrictEqual(fallbackFailure.cause, read)) {
        pendingCause = read;
        pendingFromError = false;
      }
      return;
    }
    if (latestFailure === "parked") {
      const parked = [...parkedFailures.values()].at(-1);
      if (parked && !parked.cause) parked.cause = read;
      else if (parked && !isDeepStrictEqual(parked.cause, read)) {
        pendingCause = read;
        pendingFromError = false;
      }
      return;
    }
    if (latestFailure === "unparked") {
      if (!unparkedFailureCause) unparkedFailureCause = read;
      else if (!isDeepStrictEqual(unparkedFailureCause, read)) {
        pendingCause = read;
        pendingFromError = false;
      }
      return;
    }
    pendingCause = read;
    pendingFromError = false;
  };
  for (const { seq, record } of records) {
    switch (record.type) {
      case "turn_started":
        // A Boss turn starting leaves a standing question standing: a
        // clarification, or a turn dispatching another intent, answers
        // nothing; only the runtime reporting the question gone clears
        // it (DR-085, dashboard-10).
        // An unparked failure is acknowledged by the next Boss turn;
        // genuinely parked failures keep their own causes through recovery.
        unparkedFailureCause = undefined;
        pendingCause = undefined;
        pendingFromError = false;
        pendingByRun.clear();
        latestFailure = parkedFailures.size > 0
          ? "parked"
          : fallbackFailure
            ? "fallback"
            : undefined;
        break;
      case "runtime_error": {
        if (abortErrors.has(seq)) break;
        const read: FailureCause | undefined = readFailureCause(record) ??
          (pendingFromError ? undefined : pendingCause);
        unparkedFailureCause = read;
        const parked = [...parkedFailures.values()].at(-1);
        if (parked) {
          if (read && !parked.cause) parked.cause = read;
          pendingCause = undefined;
          pendingFromError = false;
          latestFailure = "parked";
        } else if (fallbackFailure) {
          if (read && !fallbackFailure.cause) fallbackFailure.cause = read;
          pendingCause = undefined;
          pendingFromError = false;
          latestFailure = "fallback";
        } else {
          // A run-specific failed-state trace may follow the aggregate
          // runtime error. Keep only this error's own cause for it; the
          // next runtime_error replaces it even when it states none.
          pendingCause = read;
          pendingFromError = read !== undefined;
          latestFailure = "unparked";
        }
        break;
      }
      case "captain_status":
        bearsCause((record as { data?: unknown }).data);
        break;
      case "captain_telemetry": {
        const restored = restoredPosition(record);
        if (restored) {
          // A restore states where every run now stands (core-service-82,
          // DR-088): whatever the stream last said of the interrupted
          // turn's runs gives way to the position the checkpoint holds.
          parkedQuestions.clear();
          parkedFailures.clear();
          pendingByRun.clear();
          fallbackQuestion = undefined;
          fallbackFailure = undefined;
          pendingCause = undefined;
          pendingFromError = false;
          const at = {
            since: record.timestamp,
            turnId: (record as { turnId?: number | null }).turnId ?? null,
          };
          for (const run of restored.runs) {
            const state = stateName(run.state);
            const cause = readFailureCause(run);
            if (state === "failed") parkedFailures.set(run.sessionId, { ...at, ...(cause ? { cause } : {}) });
            if (
              state === "awaitBossReply" ||
              pendingQuestionCount({ pendingBossQuestions: run.pendingBossQuestions }) > 0
            ) parkedQuestions.set(run.sessionId, { ...at });
          }
          latestFailure = parkedFailures.size > 0
            ? "parked"
            : unparkedFailureCause
              ? "unparked"
              : undefined;
          break;
        }
        const telemetry = record as {
          topic?: string;
          payload?: {
            from?: unknown;
            to?: unknown;
            state?: unknown;
            pendingBossQuestion?: unknown;
            pendingBossQuestions?: unknown;
          };
          turnId: number | null;
          timestamp: number;
        };
        if (telemetry.topic === "playbook.trace") {
          const trace = telemetry.payload as unknown as {
            sessionId?: unknown;
            playbookId?: unknown;
            depth?: unknown;
            type?: unknown;
            payload?: { to?: unknown; from?: unknown };
          };
          if (typeof trace?.sessionId !== "string") break;
          if (captainOwn(trace)) {
            // The shell's own machine is not a run: an abort taken during
            // the Captain's call moves it to its failure state, which
            // parks nothing and waits for no one (core-service-107).
            captainMove = trace.type === "fsm.transition"
              ? { from: stateName(trace.payload?.from), to: stateName(trace.payload?.to) }
              : captainMove;
            break;
          }
          if (trace.type === "fsm.transition") captainMove = undefined;
          if (trace.type === "fsm.transition" || trace.type === "boss.input.settled") {
            bearsCause(trace.payload, trace.sessionId);
          }
          if (trace.type === "fsm.transition") {
            if (trace.payload?.to === "awaitBossReply") {
              // The identified trace subsumes an aggregate state report
              // that may have arrived first for this same transition.
              fallbackQuestion = undefined;
              parkedQuestions.set(trace.sessionId, {
                since: telemetry.timestamp,
                turnId: telemetry.turnId,
              });
            }
            else if (trace.payload?.from === "awaitBossReply") {
              parkedQuestions.delete(trace.sessionId);
            }
            if (trace.payload?.to === "failed") {
              const fallbackCause = fallbackFailure?.cause;
              fallbackFailure = undefined;
              const traceCause = readFailureCause(trace.payload) ??
                pendingByRun.get(trace.sessionId) ?? pendingCause ??
                fallbackCause;
              parkedFailures.set(trace.sessionId, {
                since: telemetry.timestamp,
                turnId: telemetry.turnId,
                ...(traceCause ? { cause: traceCause } : {}),
              });
              pendingByRun.delete(trace.sessionId);
              pendingCause = undefined;
              pendingFromError = false;
              latestFailure = "parked";
            }
            else if (trace.payload?.from === "failed") {
              parkedFailures.delete(trace.sessionId);
              pendingByRun.delete(trace.sessionId);
              latestFailure = parkedFailures.size > 0
                ? "parked"
                : fallbackFailure
                  ? "fallback"
                  : unparkedFailureCause
                    ? "unparked"
                    : undefined;
            }
          } else if (trace.type === "session.disposed") {
            // Outside a turn — no turn id — the host is releasing the
            // runtime at settlement, a pause the parked run survives
            // (core-service-93); inside one, the Captain dismissed it.
            if (telemetry.turnId !== null) parkedQuestions.delete(trace.sessionId);
            // A run disposed inside a turn was ended deliberately — the
            // Captain dismissed it, or the Boss dropped it — which is
            // one of the two ways a failure stops summoning (DR-062).
            if (telemetry.turnId !== null) {
              parkedFailures.delete(trace.sessionId);
              pendingByRun.delete(trace.sessionId);
              latestFailure = parkedFailures.size > 0
                ? "parked"
                : fallbackFailure
                  ? "fallback"
                  : unparkedFailureCause
                    ? "unparked"
                    : undefined;
            }
          }
          break;
        }
        if (telemetry.topic !== "playbook.fsm.state") break;
        const state =
          stateName(telemetry.payload?.to) ?? stateName(telemetry.payload?.state);
        const shellMove = captainMove;
        captainMove = undefined;
        if (shellMove && shellMove.to === state &&
            shellMove.from === stateName(telemetry.payload?.from)) break;
        const payload = telemetry.payload;
        if (
          payload != null &&
          typeof payload === "object" &&
          (Object.hasOwn(payload, "pendingBossQuestions") ||
            Object.hasOwn(payload, "pendingBossQuestion"))
        ) {
          // A report carrying the pending questions says outright
          // whether one stands, whatever its state is named (DR-085):
          // a non-empty set raises the question, an empty one is the
          // runtime reporting every question gone.
          if (pendingQuestionCount(payload) > 0) {
            if (parkedQuestions.size === 0) {
              fallbackQuestion ??= {
                since: telemetry.timestamp,
                turnId: telemetry.turnId,
              };
            }
          } else {
            fallbackQuestion = undefined;
            parkedQuestions.clear();
          }
        } else if (state === "awaitBossReply" && parkedQuestions.size === 0) {
          fallbackQuestion = fallbackQuestion ?? {
            since: telemetry.timestamp,
            turnId: telemetry.turnId,
          };
        } else if (stateName(telemetry.payload?.from) === "awaitBossReply") {
          // A shell-state report can clear only the aggregate fallback;
          // identified parked runs leave through their own trace.
          fallbackQuestion = undefined;
        }
        if (state === "failed" && parkedFailures.size === 0) {
          fallbackFailure = fallbackFailure ?? {
            since: telemetry.timestamp,
            turnId: telemetry.turnId,
            ...(pendingCause ? { cause: pendingCause } : {}),
          };
          pendingCause = undefined;
          pendingFromError = false;
          latestFailure = "fallback";
        } else if (stateName(telemetry.payload?.from) === "failed") {
          // As above, never let an aggregate report erase a different
          // run's identified failure park.
          fallbackFailure = undefined;
          latestFailure = parkedFailures.size > 0
            ? "parked"
            : unparkedFailureCause
              ? "unparked"
              : undefined;
        }
        break;
      }
      default:
        break;
    }
  }
  const firstByOnset = <T extends { since: number }>(
    values: Iterable<T>,
  ): T | undefined => [...values].sort((a, b) => a.since - b.since)[0];
  const question = firstByOnset(parkedQuestions.values()) ?? fallbackQuestion;
  const failure = firstByOnset(parkedFailures.values()) ?? fallbackFailure;
  return {
    ...(question ? { question } : {}),
    ...(failure ? { failure } : {}),
    ...(unparkedFailureCause ? { failureCause: unparkedFailureCause } : {}),
  };
}

function rangeOf(
  turns: Turn[],
  fromTurnId: number,
  endTurnId: number | null,
): Turn[] {
  return turns.filter(
    (turn) =>
      turn.turnId >= fromTurnId &&
      (endTurnId === null || turn.turnId < endTurnId),
  );
}

/** Whether a finished turn already received its ruling (DR-035): it
 * sits in some dispatch's range whose intent is still open (the open
 * intent carries the summons itself), or started before that intent's
 * verdict — a ruled turn never re-summons as a review stand-in, while
 * plain chat after a verdict is un-ledgered again. */
function turnIsRuled(store: Store, sessionId: string, turn: Turn): boolean {
  const dispatches = store.listSessionDispatches(sessionId);
  for (let i = 0; i < dispatches.length; i += 1) {
    const dispatch = dispatches[i];
    const end = dispatches[i + 1]?.turnId ?? Number.POSITIVE_INFINITY;
    if (turn.turnId < dispatch.turnId || turn.turnId >= end) continue;
    if (dispatch.open) return true;
    return (
      dispatch.closedAt !== undefined && turn.startedAt <= dispatch.closedAt
    );
  }
  return false;
}

export interface LedgerSources {
  store: Store;
  lanes: LiveLane[];
  now: () => number;
}

/** One lane's scheduling answer (core-service-107), derived only from
 * its stored stream plus live activity. */
export function queueSchedule(
  store: Store,
  lane?: LiveLane,
): QueueSchedule {
  if (!lane) return { standing: "manual-ready", manualStart: true };
  if (lane.turnActive || lane.settling) {
    return { standing: "after-current-work", manualStart: false };
  }

  const records = store.getRecords(lane.sessionId);
  const controlRecords = store.getRecords(lane.sessionId, { includeHidden: true });
  const abortErrors = stoppedTurnErrorSeqs(records);
  const conditions = foldConditions(records);
  if (conditions.failure) {
    return {
      standing: "failure-park",
      manualStart: false,
      ...(conditions.failure.cause ? { cause: conditions.failure.cause } : {}),
    };
  }
  if (conditions.question) {
    return { standing: "question-park", manualStart: false };
  }

  const latest = ledgerTurns(store, lane.sessionId).at(-1);
  if (latest) {
    const failed = records.some(({ seq, record }) => {
      if (record.type !== "runtime_error") return false;
      if (abortErrors.has(seq)) return false;
      const turnId = (record as { turnId?: unknown }).turnId;
      return turnId === latest.turnId ||
        (turnId === null && record.timestamp >= latest.startedAt);
    });
    if (failed) {
      return {
        standing: "failed",
        manualStart: true,
        ...(conditions.failureCause ? { cause: conditions.failureCause } : {}),
      };
    }
    const ending = controlRecords.some(({ record }) =>
      (record as { turnId?: unknown }).turnId === latest.turnId &&
      controlKind(record) === "ending"
    );
    if (latest.status === "aborted" || ending) {
      return { standing: "stopped", manualStart: true };
    }
  }
  return { standing: "manual-ready", manualStart: true };
}

/** Derive the whole ledger (DR-035): open intents with states, the
 * two-band attention queue, and the badge. */
export function foldLedger(sources: LedgerSources): LedgerState {
  const { store, lanes, now } = sources;
  const live = new Map(lanes.map((lane) => [lane.sessionId, lane]));
  const open = store.listOpenIntents();
  const openById = new Map(open.map((intent) => [intent.id, intent]));

  // Per-session context, loaded once per session the fold touches.
  const turnsBySession = new Map<string, Turn[]>();
  const conditionsBySession = new Map<string, SessionConditions>();
  const sessionTurns = (sessionId: string): Turn[] => {
    let turns = turnsBySession.get(sessionId);
    if (!turns) {
      turns = ledgerTurns(store, sessionId);
      turnsBySession.set(sessionId, turns);
    }
    return turns;
  };
  const sessionConditions = (sessionId: string): SessionConditions => {
    let conditions = conditionsBySession.get(sessionId);
    if (!conditions) {
      conditions = live.has(sessionId)
        ? foldConditions(store.getRecords(sessionId))
        : {};
      conditionsBySession.set(sessionId, conditions);
    }
    return conditions;
  };
  // The failures in a turn range, oldest first: every runtime error
  // but an intentional stop's, and every restore that brought a run
  // back in its failure state (dashboard-10, DR-088).
  const effectiveRuntimeErrors = (
    sessionId: string,
    fromTurnId: number,
    toTurnId: number | null,
  ) => {
    const records = store.getRecords(sessionId);
    const ignored = stoppedTurnErrorSeqs(records);
    const inRange = (turnId: number) =>
      turnId >= fromTurnId && (toTurnId === null || turnId < toTurnId);
    const errors = records.flatMap(({ seq, record }) => {
      if (record.type !== "runtime_error" || ignored.has(seq)) return [];
      const turnId = (record as { turnId?: unknown }).turnId;
      if (typeof turnId !== "number" || !inRange(turnId)) return [];
      return [{ seq, turnId, timestamp: record.timestamp }];
    });
    const restored = restoredFailures(records).filter(({ turnId }) => inRange(turnId));
    return [...errors, ...restored]
      .sort((a, b) => a.seq - b.seq)
      .map(({ turnId, timestamp }) => ({ turnId, timestamp }));
  };

  const derived: DerivedIntent[] = [];
  const attention: AttentionEntry[] = [];
  /** Turn ranges owned by open intents, per session, for stand-ins. */
  const ownedTurns = new Map<string, Set<number>>();

  for (const intent of open) {
    const blockedTarget = intent.afterId
      ? openById.get(intent.afterId)
      : undefined;
    const blockedBy = blockedTarget
      ? {
          intentId: blockedTarget.id,
          title: intentTitle(blockedTarget),
          projectId: blockedTarget.projectId,
        }
      : undefined;

    const bound = intent.dispatched;
    if (!bound) {
      derived.push({ intent, state: "queued", ...(blockedBy ? { blockedBy } : {}) });
      continue;
    }

    const turns = sessionTurns(bound.sessionId);
    const dispatchTurn = turns.find((turn) => turn.turnId === bound.turnId);
    const laneLive = live.has(bound.sessionId);
    // A dispatch whose turn aborted — or died with its session —
    // releases the intent by derivation (DR-035): back to its kept
    // rank, text editable again.
    const released =
      !dispatchTurn ||
      dispatchTurn.status === "aborted" ||
      (dispatchTurn.endedAt === null && !laneLive);
    if (released) {
      derived.push({ intent, state: "queued", ...(blockedBy ? { blockedBy } : {}) });
      continue;
    }

    const dispatches = store.listSessionDispatches(bound.sessionId);
    const nextDispatch = dispatches.find(
      (dispatch) =>
        dispatch.turnId > bound.turnId && dispatch.intentId !== intent.id,
    );
    const endTurnId = nextDispatch ? nextDispatch.turnId : null;
    const range = rangeOf(turns, bound.turnId, endTurnId);
    const owned = ownedTurns.get(bound.sessionId) ?? new Set<number>();
    for (const turn of range) owned.add(turn.turnId);
    ownedTurns.set(bound.sessionId, owned);

    const lastTurn = range[range.length - 1];
    const finishedTurns = range.filter((turn) => turn.status === "finished");
    const lastFinished = finishedTurns[finishedTurns.length - 1];
    const stats: IntentStats = {
      turns: range.length,
      ...(lastFinished || lastTurn
        ? {
            elapsedMs:
              (lastFinished?.endedAt ?? lastTurn?.endedAt ?? now()) - bound.at,
          }
        : {}),
    };
    const reviewRounds = store.countRolePrompts(
      bound.sessionId,
      "reviewer",
      bound.turnId,
      endTurnId,
    );
    if (reviewRounds > 0) stats.reviewRounds = reviewRounds;

    // Interruptions, red first (DR-035): an unacknowledged failure in
    // the range with no later Boss turn in the session; then a player
    // permission; then the parked question — the latter two only while
    // the lane is live, attributed to this intent when their turn
    // falls in its range (the newest open intent owns the tail).
    // Failure and permission are checked before working: each stands
    // only while no later Boss turn acknowledges it (a permission only
    // ever stands while its own turn is still open), so ranking
    // working above them would keep them out of the attention queue
    // for exactly as long as they summon the Boss.
    const errors = effectiveRuntimeErrors(bound.sessionId, bound.turnId, endTurnId);
    const lastError = errors[errors.length - 1];
    // DR-062: where the failure parked a run, only that run leaving its
    // failure state — recovered or ended — stops the summons. Where it
    // parked none, nothing is stuck and the next Boss turn acknowledges
    // it, which is the rule this fold has always had.
    const parkedFailure = laneLive
      ? sessionConditions(bound.sessionId).failure
      : undefined;
    const parked = parkedFailure !== undefined;
    const failureCause = laneLive
      ? parked
        ? parkedFailure.cause
        : sessionConditions(bound.sessionId).failureCause
      : undefined;
    const failureStands =
      lastError !== undefined &&
      (parked || !turns.some((turn) => turn.startedAt > lastError.timestamp));
    if (failureStands) {
      derived.push({
        intent,
        state: "interrupted",
        reason: "failure",
        stats,
        ...(blockedBy ? { blockedBy } : {}),
      });
      attention.push({
        band: "interrupted",
        kind: "failure",
        ...(parked ? { parked: true as const } : {}),
        // The row phrases what the runtime said, never a diagnosis of
        // its own (DR-075).
        ...(failureCause ? { cause: failureCause } : {}),
        intentId: intent.id,
        title: intentTitle(intent),
        projectId: intent.projectId,
        sessionId: bound.sessionId,
        ...(lastError.turnId !== null ? { turnId: lastError.turnId } : {}),
        since: lastError.timestamp,
        stats,
      });
      continue;
    }
    const conditions = laneLive ? sessionConditions(bound.sessionId) : {};
    const owns = (turnId: number | null): boolean =>
      turnId === null ||
      (turnId >= bound.turnId && (endTurnId === null || turnId < endTurnId));
    const working =
      laneLive && lastTurn !== undefined && lastTurn.endedAt === null;
    if (working) {
      derived.push({
        intent,
        state: "working",
        stats,
        ...(blockedBy ? { blockedBy } : {}),
      });
      continue;
    }

    // The parked question, after the working check (dashboard-10 ranks
    // working above question): a Boss turn running — a clarification
    // among them — reads working, and the question it did not clear
    // stands again once that turn ends (DR-085).
    if (conditions.question && owns(conditions.question.turnId)) {
      derived.push({
        intent,
        state: "interrupted",
        reason: "question",
        stats,
        ...(blockedBy ? { blockedBy } : {}),
      });
      attention.push({
        band: "interrupted",
        kind: "question",
        intentId: intent.id,
        title: intentTitle(intent),
        projectId: intent.projectId,
        sessionId: bound.sessionId,
        ...(conditions.question.turnId !== null
          ? { turnId: conditions.question.turnId }
          : {}),
        since: conditions.question.since,
        stats,
      });
      continue;
    }

    if (lastFinished) {
      derived.push({
        intent,
        state: "finished",
        stats,
        ...(blockedBy ? { blockedBy } : {}),
      });
      attention.push({
        band: "finished",
        kind: "finish",
        intentId: intent.id,
        title: intentTitle(intent),
        projectId: intent.projectId,
        sessionId: bound.sessionId,
        turnId: lastFinished.turnId,
        since: lastFinished.endedAt ?? bound.at,
        stats,
      });
      continue;
    }

    // Every turn in the range aborted after a re-dispatchable start:
    // nothing delivered, nothing running — released.
    derived.push({ intent, state: "queued", ...(blockedBy ? { blockedBy } : {}) });
  }

  // Session stand-ins (DR-035): a live session whose condition no open
  // intent owns still summons — the same bands, the session's own
  // words as the title.
  for (const lane of lanes) {
    const owned = ownedTurns.get(lane.sessionId) ?? new Set<number>();
    const turns = sessionTurns(lane.sessionId);
    const lastTurn = turns[turns.length - 1];
    const title = lastTurn?.prompt ?? "";
    const conditions = sessionConditions(lane.sessionId);
    const standsIn = (turnId: number | null): boolean =>
      turnId === null ? owned.size === 0 : !owned.has(turnId);
    const errors = effectiveRuntimeErrors(lane.sessionId, 0, null);
    const lastError = errors[errors.length - 1];
    // Where the failure parked a run, only that run leaving its failure
    // state stops the summons — the rule dashboard-4 already stated for
    // a session failure, which this branch used to ignore (DR-062).
    const parked = conditions.failure !== undefined;
    const standInCause = parked
      ? conditions.failure?.cause
      : conditions.failureCause;
    if (
      lastError &&
      standsIn(lastError.turnId) &&
      (parked ||
        !turns.some((turn) => turn.startedAt > lastError.timestamp))
    ) {
      attention.push({
        band: "interrupted",
        kind: "failure",
        ...(parked ? { parked: true as const } : {}),
        ...(standInCause ? { cause: standInCause } : {}),
        title,
        projectId: lane.projectId,
        sessionId: lane.sessionId,
        ...(lastError.turnId !== null ? { turnId: lastError.turnId } : {}),
        since: lastError.timestamp,
      });
    } else if (conditions.question && standsIn(conditions.question.turnId)) {
      attention.push({
        band: "interrupted",
        kind: "question",
        title,
        projectId: lane.projectId,
        sessionId: lane.sessionId,
        ...(conditions.question.turnId !== null
          ? { turnId: conditions.question.turnId }
          : {}),
        since: conditions.question.since,
      });
    } else if (
      lastTurn &&
      lastTurn.status === "finished" &&
      !owned.has(lastTurn.turnId) &&
      !turnIsRuled(store, lane.sessionId, lastTurn) &&
      !lane.turnActive
    ) {
      // The un-ledgered finished turn clears on viewing, exactly as
      // today (dashboard-10): the persisted marker decides.
      const viewed =
        store.getPref<number>(`viewed:${lane.sessionId}`) ?? -1;
      if (lastTurn.turnId > viewed) {
        attention.push({
          band: "finished",
          kind: "review",
          title,
          projectId: lane.projectId,
          sessionId: lane.sessionId,
          turnId: lastTurn.turnId,
          since: lastTurn.endedAt ?? lastTurn.startedAt,
        });
      }
    }
  }

  // Two bands, longest waiting first within each (DR-035).
  // Every summons has a door (DR-066): a project whose stored state
  // refuses a verdict or a marker write can answer none of its
  // entries, so it raises none — its conditions stand as storage
  // diagnostics, where the repair is (dashboard-54).
  const actable = new Map<string, boolean>();
  const canAnswer = (projectId: string): boolean => {
    let known = actable.get(projectId);
    if (known === undefined) {
      known = store.ledgerActable(projectId);
      actable.set(projectId, known);
    }
    return known;
  };
  const answerable = attention.filter((entry) => canAnswer(entry.projectId));

  answerable.sort((a, b) => {
    if (a.band !== b.band) return a.band === "interrupted" ? -1 : 1;
    return a.since - b.since;
  });

  // Presence of `next` is the project-local next marker: the first
  // queued unblocked row in rank order (DR-077).
  const lanesByProject = new Map(lanes.map((lane) => [lane.projectId, lane]));
  for (const projectId of new Set(derived.map((entry) => entry.intent.projectId))) {
    const lane = lanesByProject.get(projectId);
    const eligible = derived.filter((entry) =>
      entry.intent.projectId === projectId &&
      entry.state === "queued" &&
      !entry.blockedBy
    );
    const next = eligible[0];
    if (next) next.next = queueSchedule(store, lane);
  }

  return {
    intents: derived,
    attention: answerable,
    badge: answerable.length,
  };
}

/** The turns a dispatched intent attributes (DR-035): from its
 * dispatch turn up to the next dispatch of another intent in the
 * session, or the session's end. */
function attributedTurns(
  store: Store,
  intent: IntentInfo,
  bound: NonNullable<IntentInfo["dispatched"]>,
): { range: Turn[]; endTurnId: number | null } {
  const dispatches = store.listSessionDispatches(bound.sessionId);
  const next = dispatches.find(
    (dispatch) =>
      dispatch.turnId > bound.turnId && dispatch.intentId !== intent.id,
  );
  const endTurnId = next ? next.turnId : null;
  return {
    range: rangeOf(ledgerTurns(store, bound.sessionId), bound.turnId, endTurnId),
    endTurnId,
  };
}

/** Whether an intent was worked (DR-038): dispatched, with a turn it
 * attributes ended finished. A closed intent that never was leaves the
 * ledger without a trace — the history read excludes it. */
export function wasWorked(store: Store, intent: IntentInfo): boolean {
  const bound = intent.dispatched;
  if (!bound) return false;
  return attributedTurns(store, intent, bound).range.some(
    (turn) => turn.status === "finished",
  );
}

/** The run stats of a closed intent, for History rows (DR-035). */
export function closedStats(
  store: Store,
  intent: IntentInfo,
): IntentStats | undefined {
  const bound = intent.dispatched;
  if (!bound) return undefined;
  const { range, endTurnId } = attributedTurns(store, intent, bound);
  const lastEnded = [...range]
    .reverse()
    .find((turn) => turn.endedAt !== null);
  const stats: IntentStats = {
    turns: range.length,
    ...(lastEnded?.endedAt
      ? { elapsedMs: lastEnded.endedAt - bound.at }
      : {}),
  };
  const reviewRounds = store.countRolePrompts(
    bound.sessionId,
    "reviewer",
    bound.turnId,
    endTurnId,
  );
  if (reviewRounds > 0) stats.reviewRounds = reviewRounds;
  return stats;
}

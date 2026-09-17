// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The intent-ledger fold (DR-035): every visible intent state derives
// here, deterministically, from intent rows, the persisted record
// stream, and the viewed markers — arrival-order-independent and
// restart-identical. This is the one derivation the Dashboard, the
// sidebar, and the dock badge consume; nothing else computes attention.

import type {
  AttentionEntry,
  DerivedIntent,
  FailureCause,
  IntentInfo,
  IntentStats,
  LedgerState,
  StoredRecord,
} from "./protocol.js";
import type { Store } from "./store.js";

/** What the session manager knows live: the lanes and their activity. */
export interface LiveLane {
  sessionId: string;
  projectId: string;
  turnActive: boolean;
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
  /** The captain parked at awaitBossReply and nothing moved since. */
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

export function foldConditions(records: StoredRecord[]): SessionConditions {
  let question: SessionConditions["question"];
  let failure: SessionConditions["failure"];
  // Runs parked on a question, by trace session id: a run disposed
  // while parked — dismissed by the Captain — takes its question with
  // it (dashboard-10).
  const parkedRuns = new Set<string>();
  /** Runs parked in their failure state, by trace session id. */
  const parkedFailures = new Set<string>();
  /** The last cause the stream carried, which the runtime attaches to
   * the failure it decides on the transition, on the settled input and
   * on the failed-state status line alike (DR-075). Its record may
   * arrive either side of the state report the condition opens on, so
   * it is held here and attached whichever lands first. */
  let cause: FailureCause | undefined;
  const bearsCause = (value: unknown): void => {
    const read = readFailureCause(value);
    if (!read) return;
    cause = read;
    if (failure && !failure.cause) failure.cause = read;
  };
  for (const { record } of records) {
    switch (record.type) {
      case "turn_started":
        // The next Boss turn acknowledges the standing question,
        // even when it dispatches another intent (dashboard-10).
        question = undefined;
        parkedRuns.clear();
        break;
      case "captain_status":
        bearsCause((record as { data?: unknown }).data);
        break;
      case "captain_telemetry": {
        const telemetry = record as {
          topic?: string;
          payload?: { from?: unknown; to?: unknown; state?: unknown };
          turnId: number | null;
          timestamp: number;
        };
        if (telemetry.topic === "playbook.trace") {
          const trace = telemetry.payload as unknown as {
            sessionId?: unknown;
            type?: unknown;
            payload?: { to?: unknown; from?: unknown };
          };
          if (typeof trace?.sessionId !== "string") break;
          if (trace.type === "fsm.transition" || trace.type === "boss.input.settled") {
            bearsCause(trace.payload);
          }
          if (trace.type === "fsm.transition") {
            if (trace.payload?.to === "awaitBossReply") parkedRuns.add(trace.sessionId);
            else if (trace.payload?.from === "awaitBossReply") parkedRuns.delete(trace.sessionId);
            if (trace.payload?.to === "failed") parkedFailures.add(trace.sessionId);
            else if (trace.payload?.from === "failed") {
              if (parkedFailures.delete(trace.sessionId)) {
                failure = undefined;
                cause = undefined;
              }
            }
          } else if (trace.type === "session.disposed") {
            // Outside a turn — no turn id — the host is releasing the
            // runtime at settlement, a pause the parked run survives
            // (core-service-93); inside one, the Captain dismissed it.
            if (telemetry.turnId !== null && parkedRuns.delete(trace.sessionId)) question = undefined;
            // A run disposed inside a turn was ended deliberately — the
            // Captain dismissed it, or the Boss dropped it — which is
            // one of the two ways a failure stops summoning (DR-062).
            if (telemetry.turnId !== null && parkedFailures.delete(trace.sessionId)) {
              failure = undefined;
              cause = undefined;
            }
          }
          break;
        }
        if (telemetry.topic !== "playbook.fsm.state") break;
        const stateText = (value: unknown): string | undefined => {
          if (typeof value === "string") return value;
          if (value && typeof value === "object") {
            const shape = value as { stateId?: unknown; value?: unknown };
            if (typeof shape.stateId === "string") return shape.stateId;
            if (typeof shape.value === "string") return shape.value;
          }
          return undefined;
        };
        const state =
          stateText(telemetry.payload?.to) ?? stateText(telemetry.payload?.state);
        if (state === "awaitBossReply") {
          question = question ?? {
            since: telemetry.timestamp,
            turnId: telemetry.turnId,
          };
        } else if (stateText(telemetry.payload?.from) === "awaitBossReply") {
          // The parked machine leaving its park answers the question;
          // unrelated Captain state reports must not clear it.
          question = undefined;
        }
        if (state === "failed") {
          failure = failure ?? {
            since: telemetry.timestamp,
            turnId: telemetry.turnId,
            ...(cause ? { cause } : {}),
          };
        } else if (stateText(telemetry.payload?.from) === "failed") {
          // Only the failing machine leaving its failure state resolves
          // it; another machine's report, the Captain shell's rest
          // state included, leaves it standing (DR-061, DR-062).
          failure = undefined;
          cause = undefined;
        }
        break;
      }
      default:
        break;
    }
  }
  return {
    ...(question ? { question } : {}),
    ...(failure ? { failure } : {}),
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
      turns = store.listTurns(sessionId);
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
    const errors = store.runtimeErrors(bound.sessionId, bound.turnId, endTurnId);
    const lastError = errors[errors.length - 1];
    // DR-062: where the failure parked a run, only that run leaving its
    // failure state — recovered or ended — stops the summons. Where it
    // parked none, nothing is stuck and the next Boss turn acknowledges
    // it, which is the rule this fold has always had.
    const parkedFailure = laneLive
      ? sessionConditions(bound.sessionId).failure
      : undefined;
    const parked = parkedFailure !== undefined;
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
        ...(parkedFailure?.cause ? { cause: parkedFailure.cause } : {}),
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

    // The parked question, after the working check: a question is
    // acknowledged by the Boss's next turn, so a turn already running
    // means the Boss has replied and the park no longer stands.
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
    const errors = store.runtimeErrors(lane.sessionId, 0, null);
    const lastError = errors[errors.length - 1];
    // Where the failure parked a run, only that run leaving its failure
    // state stops the summons — the rule dashboard-4 already stated for
    // a session failure, which this branch used to ignore (DR-062).
    const parked = conditions.failure !== undefined;
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
        ...(conditions.failure?.cause ? { cause: conditions.failure.cause } : {}),
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
    range: rangeOf(store.listTurns(bound.sessionId), bound.turnId, endTurnId),
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

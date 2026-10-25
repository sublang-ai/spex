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
import { hasPresentationHeader } from "./protocol.js";
import { controlKind, isStoppedTurnReason, restoredPosition, restoreReports, runsElsewhere } from "./control-record.js";
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
  return line && line.length > 0 ? line : intent.text.trim() || (intent.attachments ?? []).map((asset) => asset.name ?? asset.mimeType).join(", ");
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
   * about something else (DR-062, dashboard-10). `turnId` is the turn
   * the park lies in: the one its move named, or the one open when it
   * was recorded where it named none, as a runtime_error naming none
   * lies (core-service-49) — null where none was open; a run a restore
   * re-stated keeps the park the stream showed (core-service-82).
   * `cause` is the structured cause the runtime emitted beside that
   * failure, where it emitted one (DR-075).
   */
  failure?: { since: number; turnId: number | null; cause?: FailureCause };
  /** Every standing failure park, `failure` first, ordered by onset:
   * each identified run's park, or the aggregate fallback park where no
   * identified one stands. Each belongs to the intent whose turn range
   * holds its turn (dashboard-33), so one park never stands for, or
   * hides, another. */
  failures?: { since: number; turnId: number | null; cause?: FailureCause }[];
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
  return new Set(restoreReports(records).map((report) => report.turnId));
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

/** The failures restores brought runs back into (dashboard-10, DR-088):
 * a recorded position holding a run in its failure state that the
 * stream did not already show parked there — a run the Boss had
 * stopped himself stays the stop he made, not a new failure. */
export interface RestoredFailure { seq: number; turnId: number; timestamp: number }

/** Whether a trace is the Captain shell's own machine rather than a
 * playbook run: its moves park nothing (core-service-107), the rule
 * the run view's frames draw by (run-view-74). */
function captainOwn(trace: { playbookId?: unknown; depth?: unknown }): boolean {
  return trace.playbookId === "captain" && (trace.depth === undefined || trace.depth === 0);
}

export function foldConditions(records: StoredRecord[]): SessionConditions {
  const { restoredFailures: _restored, settledFailures: _settled, answers: _answers, ...conditions } = foldConditionsDetail(records);
  return conditions;
}

/** The turns that started while a run of the session stood parked on a
 * Boss question (DR-119): an answer, or the Boss asking back — a turn of
 * the work that asked, never work of its own. A turn's first start
 * decides; a restore's report starting it again changes nothing. */
export function answeringTurnIds(records: StoredRecord[]): Set<number> {
  return foldConditionsDetail(records).answers;
}

/** The turn that opened the work a turn belongs to (DR-119): from the
 * turn named — the latest where none is named or it is not found — back
 * over the turns that answered a question or asked it back, to the
 * latest that started while none stood; never the answer sent since.
 * The one rule a stand-in's title and a summary's work title share
 * (core-service-49, core-service-32). */
export function openingTurn<T extends { turnId: number }>(
  turns: readonly T[],
  answers: ReadonlySet<number>,
  turnId?: number | null,
): T | undefined {
  let index = typeof turnId === "number"
    ? turns.findIndex((turn) => turn.turnId === turnId)
    : -1;
  if (index < 0) index = turns.length - 1;
  while (index > 0 && answers.has(turns[index]!.turnId)) index -= 1;
  return turns[index];
}

/** Whether a session's failure still stands (core-service-32, DR-061),
 * read from its visible records as the queue standing reads them
 * (core-service-107): a run remains parked on a failure, or a failure —
 * any runtime error but the one an intentional stop leaves — was
 * recorded in a turn no later-started turn has since settled without
 * one. A restore's report starts again under the id of the turn it
 * reports, so it is such a later turn. */
export function failureStands(records: StoredRecord[]): boolean {
  if (foldConditions(records).failure) return true;
  const stops = stoppedTurnErrorSeqs(records);
  let standing = false;
  let current: number | undefined;
  let currentFailed = false;
  for (const { seq, record } of records) {
    const turnId = (record as { turnId?: unknown }).turnId;
    switch (record.type) {
      case "turn_started": {
        const id = (record as { turn?: { id?: unknown } }).turn?.id;
        current = typeof id === "number" ? id : undefined;
        currentFailed = false;
        break;
      }
      case "runtime_error":
        if (stops.has(seq)) break;
        standing = true;
        // A failure naming no turn belongs to the latest one started.
        if (turnId === null || turnId === undefined || turnId === current) currentFailed = true;
        break;
      case "turn_finished":
      case "turn_aborted":
        if (turnId === current && !currentFailed) standing = false;
        break;
      default:
        break;
    }
  }
  return standing;
}

function foldConditionsDetail(
  records: StoredRecord[],
): SessionConditions & { restoredFailures: RestoredFailure[]; settledFailures: RestoredFailure[]; answers: Set<number> } {
  const restoredFailures: RestoredFailure[] = [];
  // The engagement settling failed (dashboard-10): a run's own move into
  // its failure state within a turn that then ended finished, its onset
  // that move, kept as history as a runtime_error is — whatever the run
  // does later, and whichever conversation is current. A turn a stop
  // ended — the Boss's abort, or a restore's report, the stop of the
  // turn it reports (core-service-82) — settles none, and a park a
  // restore re-stated keeps the onset the stream showed, never a new one.
  const settledFailures: RestoredFailure[] = [];
  const reportEnds = new Set(restoreReports(records).flatMap((report) =>
    report.endSeq === undefined ? [] : [report.endSeq]));
  const parkSeqs = new Map<string, number>();
  let fallbackSeq: number | undefined;
  const settledSeqs = new Set<number>();
  const settle = (seq: number | undefined, turnId: number, timestamp: number): void => {
    if (seq === undefined || settledSeqs.has(seq)) return;
    settledSeqs.add(seq);
    settledFailures.push({ seq, turnId, timestamp });
  };
  const answers = new Set<number>();
  const started = new Set<number>();
  // The turn open so far (dashboard-10, core-service-49): a failure
  // park naming no turn lies in it, as a runtime_error naming none does
  // — null while none is open, so no intent's range holds it. A
  // question keeps the turn its record named (DR-085).
  let currentTurn: number | null = null;
  const turnOf = (named: unknown): number | null =>
    typeof named === "number" ? named : currentTurn;
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
  // The latest park of a turn, by the order the parks stood up.
  const parkOfTurn = (turnId: number | null) =>
    [...parkedFailures.values()].filter((park) => park.turnId === turnId).at(-1);
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
      // A cause the shell states beside a failure belongs to a park of
      // the turn it arrives in (dashboard-10): where none stands yet, it
      // waits for the turn's next failure event — never lent to another
      // turn's park — unless a standing park already holds it, which is
      // a re-statement.
      const parked = parkOfTurn(currentTurn);
      if (parked && !parked.cause) parked.cause = read;
      else if (parked
        ? !isDeepStrictEqual(parked.cause, read)
        : ![...parkedFailures.values()].some((park) => isDeepStrictEqual(park.cause, read))) {
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
    // A turn ending closes the turn open (core-service-49): what follows
    // naming no turn lies in none until the next starts.
    if ((record.type === "turn_finished" || record.type === "turn_aborted") &&
        (record as { turnId?: unknown }).turnId === currentTurn) currentTurn = null;
    switch (record.type) {
      case "turn_started": {
        // A turn starting while a question stands answers it or asks
        // back: a turn of the work that asked (DR-119).
        const turnId = (record as { turn?: { id?: unknown } }).turn?.id ??
          (record as { turnId?: unknown }).turnId;
        if (typeof turnId === "number") currentTurn = turnId;
        if (typeof turnId === "number" && !started.has(turnId)) {
          started.add(turnId);
          if (parkedQuestions.size > 0 || fallbackQuestion !== undefined) answers.add(turnId);
        }
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
      }
      case "runtime_error": {
        if (abortErrors.has(seq)) break;
        const read: FailureCause | undefined = readFailureCause(record) ??
          (pendingFromError ? undefined : pendingCause);
        unparkedFailureCause = read;
        // A cause belongs to the failure beside which the runtime emitted
        // it (dashboard-10, core-service-49): the latest park of the
        // error's own turn — the one it names, or the one open when it
        // was recorded where it names none — never a park of another turn,
        // another intent's run among them.
        const errorTurn = turnOf((record as { turnId?: unknown }).turnId);
        const parked = parkOfTurn(errorTurn);
        if (parked) {
          if (read && !parked.cause) parked.cause = read;
          pendingCause = undefined;
          pendingFromError = false;
          latestFailure = "parked";
        } else if (fallbackFailure && fallbackFailure.turnId === errorTurn) {
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
      case "turn_finished": {
        const turnId = (record as { turnId?: unknown }).turnId;
        if (typeof turnId !== "number" || reportEnds.has(seq)) break;
        for (const [runId, park] of parkedFailures) {
          if (park.turnId === turnId) settle(parkSeqs.get(runId), turnId, park.since);
        }
        if (fallbackFailure?.turnId === turnId) settle(fallbackSeq, turnId, fallbackFailure.since);
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
          const parkedBefore = new Map(parkedFailures);
          const questionsBefore = new Map(parkedQuestions);
          const seqsBefore = new Map(parkSeqs);
          const failedBefore = new Set(parkedBefore.keys());
          parkedQuestions.clear();
          parkedFailures.clear();
          parkSeqs.clear();
          pendingByRun.clear();
          fallbackQuestion = undefined;
          fallbackFailure = undefined;
          fallbackSeq = undefined;
          pendingCause = undefined;
          pendingFromError = false;
          const named = (record as { turnId?: number | null }).turnId ?? null;
          const at = { since: record.timestamp, turnId: named };
          const parkAt = { since: record.timestamp, turnId: turnOf(named) };
          if (typeof parkAt.turnId === "number" && restored.runs.some((run) =>
            stateName(run.state) === "failed" && !failedBefore.has(run.sessionId))) {
            restoredFailures.push({ seq, turnId: parkAt.turnId, timestamp: record.timestamp });
          }
          for (const run of restored.runs) {
            const state = stateName(run.state);
            const cause = readFailureCause(run);
            if (state === "failed") {
              // A run the stream already showed parked is no new failure
              // of the restored turn (core-service-82): it keeps the park
              // it had — its onset, its turn and its settlement — taking
              // the checkpoint's cause only where that park had none. A
              // run the restore first shows failed lies in the restored
              // turn.
              const kept = parkedBefore.get(run.sessionId);
              const keptCause = kept?.cause ?? cause;
              parkedFailures.set(run.sessionId, kept
                ? { since: kept.since, turnId: kept.turnId, ...(keptCause ? { cause: keptCause } : {}) }
                : { ...parkAt, ...(cause ? { cause } : {}) });
              const keptSeq = kept ? seqsBefore.get(run.sessionId) : undefined;
              if (keptSeq !== undefined) parkSeqs.set(run.sessionId, keptSeq);
            }
            if (
              state === "awaitBossReply" ||
              pendingQuestionCount({ pendingBossQuestions: run.pendingBossQuestions }) > 0
            ) {
              // A run the stream already showed waiting on the Boss keeps
              // the question it had — its onset and its turn — as a
              // re-stated failure park does: the restore raises no
              // question of its own turn for it (core-service-82).
              parkedQuestions.set(run.sessionId, questionsBefore.get(run.sessionId) ?? { ...at });
            }
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
                turnId: turnOf(telemetry.turnId),
                ...(traceCause ? { cause: traceCause } : {}),
              });
              parkSeqs.set(trace.sessionId, seq);
              fallbackSeq = undefined;
              pendingByRun.delete(trace.sessionId);
              pendingCause = undefined;
              pendingFromError = false;
              latestFailure = "parked";
            }
            else if (trace.payload?.from === "failed") {
              parkedFailures.delete(trace.sessionId);
              parkSeqs.delete(trace.sessionId);
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
              parkSeqs.delete(trace.sessionId);
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
          if (!fallbackFailure) fallbackSeq = seq;
          fallbackFailure = fallbackFailure ?? {
            since: telemetry.timestamp,
            turnId: turnOf(telemetry.turnId),
            ...(pendingCause ? { cause: pendingCause } : {}),
          };
          pendingCause = undefined;
          pendingFromError = false;
          latestFailure = "fallback";
        } else if (stateName(telemetry.payload?.from) === "failed") {
          // As above, never let an aggregate report erase a different
          // run's identified failure park.
          fallbackFailure = undefined;
          fallbackSeq = undefined;
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
  const failures = parkedFailures.size > 0
    ? [...parkedFailures.values()].sort((a, b) => a.since - b.since)
    : fallbackFailure ? [fallbackFailure] : [];
  const failure = failures[0];
  return {
    ...(question ? { question } : {}),
    ...(failure ? { failure, failures } : {}),
    ...(unparkedFailureCause ? { failureCause: unparkedFailureCause } : {}),
    restoredFailures,
    settledFailures,
    answers,
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
  /** This runtime's device (DR-134): an intent or a session assigned to
   * another runtime summons nothing here and runs nowhere but there.
   * The home's device as `home.yaml` reads now, where none is given. */
  device?: string;
  /** Whether this core runs as a team server's seat (core-service-125,
   * DR-132): there an intent holding no runtime runs nowhere. */
  seat?: boolean;
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
    // A restore's report reuses the id of the turn it reports, whose
    // lost attempt may have failed: only what failed once the report
    // began is the report's own (core-service-107, DR-088).
    const report = restoreReports(records).filter((entry) => entry.turnId === latest.turnId).at(-1);
    const since = report?.startSeq ?? Number.NEGATIVE_INFINITY;
    const failed = records.some(({ seq, record }) => {
      if (record.type !== "runtime_error") return false;
      if (abortErrors.has(seq) || seq <= since) return false;
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
  const device = sources.device ?? store.home.device;
  const live = new Map(lanes.map((lane) => [lane.sessionId, lane]));
  const open = store.listOpenIntents();
  // Another runtime's records (DR-134): the label of the runtime a
  // session is assigned to where that is not this one, read once per
  // session the fold touches.
  const sessionElsewhere = new Map<string, string | undefined>();
  const sessionRunsOn = (sessionId: string): string | undefined => {
    if (!sessionElsewhere.has(sessionId)) {
      sessionElsewhere.set(sessionId, runsElsewhere(store.sessionRuntime(sessionId), device));
    }
    return sessionElsewhere.get(sessionId);
  };
  /** Intents assigned to another runtime, or worked by a session that
   * is: they enter no band and no badge here (core-service-49). */
  const elsewhereIntents = new Set<string>();

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
  // but an intentional stop's, every run's own park in a turn that then
  // ended finished, and every restore that brought a run back in its
  // failure state (dashboard-10, DR-062, DR-088). A runtime error naming
  // no turn lies in the turn open when it was recorded; one recorded with
  // none open — the core's record of a failure from before a turn of its
  // own started (core-service-135) — lies in no turn's range, and is listed
  // naming no turn, for a session's own reading, only with `between` and
  // once a turn has started (core-service-49). Each failure carries the
  // start of the attempt it lies in — a restore's report starts its turn
  // again under the same id — or, naming no turn, the end of the turn
  // before it.
  const effectiveRuntimeErrors = (
    sessionId: string,
    fromTurnId: number,
    toTurnId: number | null,
    between = false,
  ) => {
    const records = store.getRecords(sessionId);
    const ignored = stoppedTurnErrorSeqs(records);
    const inRange = (turnId: number) =>
      turnId >= fromTurnId && (toTurnId === null || turnId < toTurnId);
    const detail = foldConditionsDetail(records);
    // The fold's own failures sit at a record's seq — a run's move, a
    // restore's position — and take the attempt the walk reaches there.
    const folded = new Map<number, { turnId: number; timestamp: number }>();
    for (const failure of [...detail.settledFailures, ...detail.restoredFailures]) folded.set(failure.seq, failure);
    const latestStart = new Map<number, number>();
    let open: number | undefined;
    let started = false;
    let ended = -1;
    const failures: { turnId: number | null; timestamp: number; attempt: number }[] = [];
    for (const { seq, record } of records) {
      // The fold's own failures are read as the conditions and the queue
      // read them, whatever the record's header.
      const fold = folded.get(seq);
      if (fold) failures.push({ ...fold, attempt: latestStart.get(fold.turnId) ?? -1 });
      // Otherwise a record without a presentation header is opaque and
      // says nothing, as the session's summary reads it (core-service-10).
      if (!hasPresentationHeader(record)) continue;
      if (record.type === "turn_started") {
        const turnId = (record as { turn?: { id?: unknown } }).turn?.id ??
          (record as { turnId?: unknown }).turnId;
        if (typeof turnId === "number") {
          open = turnId;
          started = true;
          latestStart.set(turnId, seq);
        }
        continue;
      }
      if ((record.type === "turn_finished" || record.type === "turn_aborted") &&
          (record as { turnId?: unknown }).turnId === open) {
        open = undefined;
        ended = seq;
        continue;
      }
      if (record.type !== "runtime_error" || ignored.has(seq)) continue;
      const named = (record as { turnId?: unknown }).turnId;
      if (typeof named === "number") {
        failures.push({ turnId: named, timestamp: record.timestamp, attempt: latestStart.get(named) ?? -1 });
      } else if (named === null || named === undefined) {
        if (open !== undefined) failures.push({ turnId: open, timestamp: record.timestamp, attempt: latestStart.get(open) ?? -1 });
        else if (between && started) failures.push({ turnId: null, timestamp: record.timestamp, attempt: ended });
      }
    }
    return failures.filter(({ turnId }) => turnId === null || inRange(turnId));
  };
  // The failure an entry stands on (core-service-49): its onset is the
  // first failure recorded in the attempt its latest failure lies in —
  // the runtime's turn-scoped record before the core's own, a run's move
  // before the Captain's failed call — never a lost attempt's that the
  // turn's restore started again.
  const standingFailure = <T extends number | null>(
    errors: readonly { turnId: T; timestamp: number; attempt: number }[],
  ): { turnId: T; timestamp: number } | undefined => {
    const latest = errors.at(-1);
    if (!latest) return undefined;
    return errors.find((error) => error.turnId === latest.turnId && error.attempt === latest.attempt) ?? latest;
  };

  const derived: DerivedIntent[] = [];
  const attention: AttentionEntry[] = [];
  /** Turn ranges owned by open intents, per session, for stand-ins. */
  const ownedTurns = new Map<string, Set<number>>();

  for (const intent of open) {
    // Another runtime's work (core-service-107, DR-134): each row of an
    // intent assigned to another runtime carries that runtime's label,
    // and so does one naming none whose dispatch another runtime's
    // session holds; such a row is never next here.
    let runsOn = intent.runtime ? runsElsewhere(intent.runtime, device) : undefined;
    if (runsOn !== undefined) elsewhereIntents.add(intent.id);
    const place = (row: DerivedIntent): void => {
      derived.push(runsOn !== undefined ? { ...row, runsOn } : row);
    };
    const bound = intent.dispatched;
    if (!bound) {
      place({ intent, state: "queued" });
      continue;
    }

    const turns = sessionTurns(bound.sessionId);
    const dispatchTurn = turns.find((turn) => turn.turnId === bound.turnId);
    const laneLive = live.has(bound.sessionId);
    // A dispatch whose session is assigned to another runtime is never
    // derived as released here: its stop or abort is that runtime's to
    // read (core-service-47, DR-134), and its turn still open there is
    // work running there.
    const elsewhere = sessionRunsOn(bound.sessionId);
    if (elsewhere !== undefined) {
      elsewhereIntents.add(intent.id);
      runsOn ??= elsewhere;
    }
    // A dispatch whose turn aborted — or died with its session —
    // releases the intent by derivation (DR-035): back to its place
    // by age, text editable again.
    const released = elsewhere === undefined && (
      !dispatchTurn ||
      dispatchTurn.status === "aborted" ||
      (dispatchTurn.endedAt === null && !laneLive));
    if (released) {
      place({ intent, state: "queued" });
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
    const lastError = standingFailure(effectiveRuntimeErrors(bound.sessionId, bound.turnId, endTurnId)
      .flatMap((failure) => failure.turnId === null ? [] : [{ ...failure, turnId: failure.turnId }]));
    const conditions = laneLive ? sessionConditions(bound.sessionId) : {};
    // A question belongs to the intent whose range holds its turn
    // (dashboard-33); one naming no turn, to every one.
    const owns = (turnId: number | null): boolean =>
      turnId === null ||
      (turnId >= bound.turnId && (endTurnId === null || turnId < endTurnId));
    // DR-062: every standing park is tried against this intent's range
    // by the turn it lies in (dashboard-10) — a park lying in a turn of
    // it is this intent's, one lying in no turn no intent's. Where
    // the failure parked a run here, only that run leaving its failure
    // state — recovered or ended — stops the summons, the earliest such
    // park giving the entry its cause; a run parked in another intent's
    // range of the same conversation is that intent's summons alone,
    // keeping no failure here standing, lending it no cause, and hiding
    // no park of this intent's (dashboard-33). Where it parked none,
    // nothing is stuck and the next Boss turn acknowledges it, which is
    // the rule this fold has always had.
    const ownedParks = (conditions.failures ?? []).filter((park) =>
      park.turnId !== null && owns(park.turnId));
    const parkedFailure = ownedParks[0];
    const parked = parkedFailure !== undefined;
    const failureCause = parked
      ? parkedFailure.cause
      : laneLive
        ? conditions.failureCause
        : undefined;
    const failureStands =
      lastError !== undefined &&
      (parked || !turns.some((turn) => turn.startedAt > lastError.timestamp));
    if (failureStands) {
      place({
        intent,
        state: "interrupted",
        reason: "failure",
        stats,
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
    const working =
      (laneLive || elsewhere !== undefined) && lastTurn !== undefined && lastTurn.endedAt === null;
    if (working) {
      place({
        intent,
        state: "working",
        stats,
      });
      continue;
    }

    // The parked question, after the working check (dashboard-10 ranks
    // working above question): a Boss turn running — a clarification
    // among them — reads working, and the question it did not clear
    // stands again once that turn ends (DR-085).
    if (conditions.question && owns(conditions.question.turnId)) {
      place({
        intent,
        state: "interrupted",
        reason: "question",
        stats,
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
      place({
        intent,
        state: "finished",
        stats,
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
    // nothing delivered, nothing running — released, though where
    // another runtime's session holds the dispatch only there
    // (core-service-47, DR-134): the row keeps its label, never next.
    place({ intent, state: "queued" });
  }

  // Session stand-ins (DR-035): a live session whose condition no open
  // intent owns still summons — the same bands, the session's own
  // words as the title.
  for (const lane of lanes) {
    const owned = ownedTurns.get(lane.sessionId) ?? new Set<number>();
    const turns = sessionTurns(lane.sessionId);
    const lastTurn = turns[turns.length - 1];
    // The words are the turn that opened the work an entry stands for
    // (DR-119) — never the answer sent since.
    const answers = answeringTurnIds(store.getRecords(lane.sessionId));
    const titleAt = (turnId: number | null | undefined): string =>
      openingTurn(turns, answers, turnId)?.prompt ?? "";
    const conditions = sessionConditions(lane.sessionId);
    const standsIn = (turnId: number | null): boolean =>
      turnId === null ? owned.size === 0 : !owned.has(turnId);
    // Where the failure parked a run, only that run leaving its failure
    // state stops the summons — the rule dashboard-4 already stated for
    // a session failure, which this branch used to ignore (DR-062). The
    // park is the earliest standing one that stands in — lying in a turn
    // no open intent's range owns, or in none while no intent owns any
    // turn: a park an intent owns is that intent's summons, never the
    // session's (dashboard-33).
    const standInPark = (conditions.failures ?? []).find((park) => standsIn(park.turnId));
    const parked = standInPark !== undefined;
    const standInCause = parked
      ? standInPark.cause
      : conditions.failureCause;
    // A failure lying in a turn stands first; one recorded with no turn
    // open stands in as the session's own, naming no turn, only behind it
    // and only until a later turn starts (core-service-49). The failure
    // in a turn is the session's own only in a turn no open intent's
    // range owns (dashboard-33): an intent's failure, however late, is
    // that intent's summons alone, hiding no park of the session's own.
    const failures = effectiveRuntimeErrors(lane.sessionId, 0, null, true);
    const unanswered = (failure: { timestamp: number }) =>
      !turns.some((turn) => turn.startedAt > failure.timestamp);
    const inTurn = standingFailure(failures.filter((failure) =>
      failure.turnId !== null && standsIn(failure.turnId)));
    const between = standingFailure(failures.filter((failure) => failure.turnId === null));
    const lastError =
      inTurn && (parked || unanswered(inTurn))
        ? inTurn
        : between && standsIn(null) && unanswered(between)
          ? between
          : undefined;
    if (lastError) {
      attention.push({
        band: "interrupted",
        kind: "failure",
        ...(parked ? { parked: true as const } : {}),
        ...(standInCause ? { cause: standInCause } : {}),
        title: titleAt(lastError.turnId),
        projectId: lane.projectId,
        sessionId: lane.sessionId,
        ...(lastError.turnId !== null ? { turnId: lastError.turnId } : {}),
        since: lastError.timestamp,
      });
    } else if (conditions.question && standsIn(conditions.question.turnId)) {
      attention.push({
        band: "interrupted",
        kind: "question",
        title: titleAt(conditions.question.turnId),
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
          title: titleAt(lastTurn.turnId),
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
  // Another runtime's intents and sessions enter no band and no count:
  // that runtime's ledger carries them, their states still deriving for
  // History and the queue (core-service-49, DR-134).
  const answerable = attention.filter((entry) =>
    !(entry.intentId !== undefined && elsewhereIntents.has(entry.intentId)) &&
    sessionRunsOn(entry.sessionId) === undefined &&
    canAnswer(entry.projectId));

  answerable.sort((a, b) => {
    if (a.band !== b.band) return a.band === "interrupted" ? -1 : 1;
    return a.since - b.since;
  });

  // Presence of `next` is the project-local next marker: the oldest
  // queued row this runtime may run, by capture time then id — never one
  // of another runtime's, which keeps its place by age and offers no
  // manual start (core-service-107, DR-134). On a seat an intent holding
  // no runtime — a format 1 file, written before runtimes, by the
  // Playbook CLI or by a runtime that assigns nothing — runs nowhere
  // (core-service-125, DR-132): it keeps its place by age and its derived
  // state, and is never next. Its row carries no marker of its own: it
  // reads queued as any later row does, the specs giving a client
  // nothing more to read.
  const runsNowhere = (entry: DerivedIntent): boolean =>
    sources.seat === true && entry.intent.runtime === undefined;
  const lanesByProject = new Map(lanes.map((lane) => [lane.projectId, lane]));
  for (const projectId of new Set(derived.map((entry) => entry.intent.projectId))) {
    const lane = lanesByProject.get(projectId);
    const eligible = derived.filter((entry) =>
      entry.intent.projectId === projectId &&
      entry.state === "queued" &&
      entry.runsOn === undefined &&
      !runsNowhere(entry)
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

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pure record reducer (RUN-14..18): folds the session record stream
// into view state. Everything the run view renders derives from
// protocol messages — no other inputs (RUN-13).

import {
  hasPresentationHeader,
  RESTORED_TOPIC,
  RESTORING_TOPIC,
  type FailureCause,
  type RestoredPosition,
  type TmuxPlayRecord,
  type MachineGraph,
  type MediaAsset,
} from "@sublang/spex-core/protocol";

import { contextGraphs } from "../lib/session-context.js";
import { i18n } from "../i18n.js";
import { plainFailure } from "../lib/labels.js";
import { readRecordFailure } from "../lib/failure-catalogue.js";
import { storedAsset, type MediaOrigin } from "../lib/media.js";

/** What one call reported spending, in tokens and tool uses. Every
 * figure is optional because cligent 0.22 reports each independently,
 * and an absent report means unreported — never zero (DR-032). A cost
 * the runtime reported stays in the record and never reaches the
 * view (DR-044). */
export interface UsageView {
  inputTokens?: number;
  outputTokens?: number;
  toolUses: number;
}

/** Reads a cligent 0.22 `done` usage payload. Totals are inclusive of
 * cached reads, so they are taken as given and never re-added; the
 * payload's cost is left where it lies. */
export function readDoneUsage(payload: unknown): UsageView | undefined {
  const usage = (payload as { usage?: unknown } | undefined)?.usage as
    | {
        toolUses?: number;
        tokens?: { totals?: { input?: { total?: number }; output?: { total?: number } } };
      }
    | undefined;
  if (!usage) return undefined;
  const totals = usage.tokens?.totals;
  return {
    ...(typeof totals?.input?.total === "number"
      ? { inputTokens: totals.input.total }
      : {}),
    ...(typeof totals?.output?.total === "number"
      ? { outputTokens: totals.output.total }
      : {}),
    toolUses: usage.toolUses ?? 0,
  };
}

/** Stable identity + wall-clock for every transcript entry. */
export interface SegmentMeta {
  /** Record seq that created the segment (stable React key). */
  seq: number;
  /** Record timestamp, ms epoch. */
  at: number;
}

export type TranscriptSegment = SegmentMeta &
  (
    | { kind: "prompt"; text: string; role?: string }
    | { kind: "text"; text: string; streaming: boolean }
    | { kind: "thinking"; summary: string }
    | { kind: "media"; media: { mimeType: string; uri?: string; name?: string }; origin: MediaOrigin }
    | {
        kind: "tool";
        toolName: string;
        toolUseId: string;
        input: unknown;
        status?: "success" | "error" | "denied";
        output?: unknown;
        durationMs?: number;
      }
    | {
        kind: "error";
        message: string;
        /** How many identical failures this line stands for within
         * its call — a repeat folds into it (run-view-127). */
        count?: number;
      }
    | {
        kind: "result";
        status: "ok" | "aborted" | "error";
        error?: string;
        /** The error repeats the call's failure line above it, so the
         * result line says only that the call failed (run-view-127). */
        errorAbove?: boolean;
        usage?: UsageView;
      }
  );

/** The segments of the current call — everything since its prompt. */
function currentCall(segments: TranscriptSegment[]): TranscriptSegment[] {
  let start = 0;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i].kind === "prompt") { start = i; break; }
  }
  return segments.slice(start);
}

/** The call's standing failure line, if it has one. */
function callFailure(
  segments: TranscriptSegment[],
): Extract<TranscriptSegment, { kind: "error" }> | undefined {
  const call = currentCall(segments);
  for (let i = call.length - 1; i >= 0; i -= 1) {
    const segment = call[i];
    if (segment.kind === "error") return segment;
  }
  return undefined;
}

export interface PlayerView {
  id: string;
  running: boolean;
  segments: TranscriptSegment[];
  turnUsage?: UsageView;
}

import {
  FAILURE_STATE_ID,
  foldRestored,
  foldTrace,
  parkedFailure,
  type MachineFrame,
} from "../lib/machine-frames.js";

export type { MachineFrame };

export interface CaptainLine {
  /** boss: the user's own message, echoed into the thread (RUN-30).
   * question: a player asking the Boss — a first-class incoming
   * message, not a log line (RUN-9, DR-010 §1). */
  kind: "status" | "speech" | "error" | "boss" | "question" | "machine" | "media";
  attachments?: readonly MediaAsset[];
  evidence?: Extract<TmuxPlayRecord, { type: "playbook_evidence" }>;
  /** The settled frame a "machine" line carries (run-view-62). */
  frame?: MachineFrame;
  /** The run position when this failure arrived, never a later run's
   * current position. The edge and count distinguish repeated parks. */
  failure?: {
    traceSessionId: string;
    playbookId: string;
    step?: string;
    transitionAt: number;
    transitionCount: number;
  };
  text: string;
  turnId: number | null;
  at: number;
  data?: unknown;
  /** question lines: the asking player (pane id when resolvable). */
  player?: string;
  /** error lines: how many identical failures the line stands for —
   * a repeat that follows it in the same turn folds into it, so a
   * retry loop reads as one line with a count (run-view-2). */
  count?: number;
  /** error lines: what the runtime actually said, kept when the
   * shown text is its plain-spoken form (run-view-2, DR-010 §2). */
  raw?: string;
}

export interface SessionView {
  contexts: Record<number, Record<string, MachineGraph | null>>;
  captain: CaptainLine[];
  /** Streaming captain speech accumulated from visible deltas. */
  captainDraft: string;
  players: Record<string, PlayerView>;
  turnActive: boolean;
  currentTurnId: number | null;
  /** True while a history replay is loading after (re)subscription. */
  loading?: boolean;
  /** A failed backfill is separate from a refused session command. */
  loadError?: string;
  /** The last state the record stream reported, whichever machine
   * reported it — the Captain shell's own controller writes this
   * topic beside the leaf's runs, so it rests in the shell's `hub`
   * once a turn settles. It answers no question about a leaf run:
   * those are read from the frames below (DR-061). */
  fsmState?: string;
  captainMode?: string;
  /** Live machine frames, parents before children (run-view-60/63). */
  frames: MachineFrame[];
  /** Trace sessions whose run has settled — the tombstones that keep
   * a finished run's trailing reports from reviving it (run-view-74). */
  settledRuns: string[];
  /** Set while the playbook is parked awaiting a Boss reply. */
  pendingQuestion?: string;
  /** The asking player for the parked question (pane id). */
  pendingQuestionPlayer?: string;
  /** Set by a restore's marker until the next turn starts: that turn is
   * the restore's report of a message already drawn (run-view-110). */
  restoring?: boolean;
  lastSeq: number;
}

export function initialSessionView(
  players: readonly { id: string }[],
): SessionView {
  return {
    captain: [],
    contexts: {},
    captainDraft: "",
    players: Object.fromEntries(
      players.map((player) => [
        player.id,
        { id: player.id, running: false, segments: [] },
      ]),
    ),
    turnActive: false,
    currentTurnId: null,
    frames: [],
    settledRuns: [],
    lastSeq: 0,
  };
}

function player(view: SessionView, playerId: string): PlayerView {
  const existing = view.players[playerId];
  if (existing) return existing;
  const created: PlayerView = { id: playerId, running: false, segments: [] };
  view.players[playerId] = created;
  return created;
}

function failurePosition(frame: MachineFrame | undefined): CaptainLine["failure"] {
  if (!frame) return undefined;
  const step = frame.active === FAILURE_STATE_ID
    ? frame.lastFired?.from
    : frame.active ?? undefined;
  return {
    traceSessionId: frame.traceSessionId,
    playbookId: frame.playbookId,
    ...(step ? { step } : {}),
    transitionAt: frame.lastFired?.at ?? frame.openedAt,
    transitionCount: frame.transitions.length,
  };
}

function pushCaptain(view: SessionView, line: CaptainLine): void {
  if ((line.kind === "status" || line.kind === "error") && readRecordFailure(line.data)) {
    line.failure ??= failurePosition(parkedFailure(view.frames) ?? view.frames.at(-1));
  }
  // A failure identical to the line just before it, in the same turn,
  // is the same failure again: it counts rather than repeats, and no
  // delivered failure goes unshown (run-view-2).
  const last = view.captain[view.captain.length - 1];
  if (
    line.kind === "error" &&
    last?.kind === "error" &&
    last.text === line.text &&
    last.turnId === line.turnId &&
    last.failure?.traceSessionId === line.failure?.traceSessionId &&
    last.failure?.transitionAt === line.failure?.transitionAt &&
    last.failure?.transitionCount === line.failure?.transitionCount
  ) {
    last.count = (last.count ?? 1) + 1;
    return;
  }
  view.captain.push(line);
}

/** The runtime sends either a plain string or a structured object
 * ({player, question, ...}); normalize both (RUN-9/30). */
export function parseBossQuestion(
  value: unknown,
): { question: string; player?: string } | undefined {
  if (typeof value === "string") return { question: value };
  if (typeof value === "object" && value !== null) {
    const shaped = value as { player?: unknown; question?: unknown; asker?: { kind?: string; roleId?: string } };
    const question =
      typeof shaped.question === "string" ? shaped.question : undefined;
    if (question === undefined) return undefined;
    const player = shaped.asker?.kind === "captain" ? "Captain"
      : shaped.asker?.kind === "role" && typeof shaped.asker.roleId === "string" ? shaped.asker.roleId
      : typeof shaped.player === "string" ? shaped.player : undefined;
    return { question, ...(player === undefined ? {} : { player }) };
  }
  return undefined;
}

/** A pane is a session player, named by its own id (DR-032). A name
 * that is already a lane is one; anything else — a local role the
 * trace has not resolved — is left as it came, never guessed into a
 * lane by spelling. */
export function resolvePlayerId(
  view: SessionView,
  player: string | undefined,
): string | undefined {
  if (!player) return undefined;
  return Object.keys(view.players).find((id) => id === player) ?? player;
}

/** Abort reasons are runtime plumbing; put the known ones in words.
 * An unknown reason is the runtime's own prose — data, printed as it
 * came (localization-4). */
function friendlyAbortReason(reason: string): string {
  if (reason === "runtime disposed") return i18n._("session shut down");
  return reason;
}

function closeStreamingText(segments: TranscriptSegment[]): void {
  const last = segments[segments.length - 1];
  if (last && last.kind === "text" && last.streaming) last.streaming = false;
}

interface AgentEventLike {
  type: string;
  payload?: unknown;
  sessionId?: unknown;
}

function applyAgentEvent(
  target: PlayerView,
  event: AgentEventLike,
  meta: SegmentMeta,
  origin: {actorId?: unknown; turnId?: unknown},
): UsageView | undefined {
  const segments = target.segments;
  switch (event.type) {
    case "approval_request": {
      closeStreamingText(segments);
      const payload = event.payload as {toolName?: string};
      segments.push({...meta, kind: "text", streaming: false, text: i18n._("Requested tool approval: {tool}", {tool: payload?.toolName ?? i18n._("a tool")})});
      return undefined;
    }
    case "approval_response": {
      closeStreamingText(segments);
      const payload = event.payload as {decision?: string; source?: string};
      const text = payload?.source === "host"
        ? payload.decision === "allow_once" ? i18n._("Approved once; native execution is reported separately.") : i18n._("Tool request denied.")
        : payload?.source === "timeout" ? i18n._("Tool approval expired.")
          : payload?.source === "cancelled" ? i18n._("Tool approval cancelled.") : i18n._("Tool approval failed; the request was not approved.");
      segments.push({...meta, kind: "text", streaming: false, text});
      return undefined;
    }
    case "media": {
      closeStreamingText(segments);
      const payload = event.payload as { mimeType?: unknown; name?: unknown; toolUseId?: unknown; source?: { type?: string; uri?: unknown } } | undefined;
      if (typeof payload?.mimeType !== "string") return undefined;
      segments.push({ ...meta, kind: "media", origin: {
        ...(typeof origin.actorId === "string" && origin.actorId ? {actorId: origin.actorId} : {}),
        ...(typeof origin.turnId === "number" && Number.isSafeInteger(origin.turnId) && origin.turnId > 0 ? {turnId: origin.turnId} : {}),
        ...(typeof event.sessionId === "string" && event.sessionId ? {runtimeSessionId: event.sessionId} : {}),
        ...(typeof payload.toolUseId === "string" && payload.toolUseId ? {toolUseId: payload.toolUseId} : {}),
      }, media: {
        mimeType: payload.mimeType,
        ...(typeof payload.name === "string" ? { name: payload.name } : {}),
        ...(payload.source?.type === "uri" && typeof payload.source.uri === "string" ? { uri: payload.source.uri } : {}),
      } });
      return undefined;
    }
    case "text_delta": {
      const delta = (event.payload as { delta?: string })?.delta ?? "";
      const last = segments[segments.length - 1];
      if (last && last.kind === "text" && last.streaming) {
        last.text += delta;
      } else {
        segments.push({ ...meta, kind: "text", text: delta, streaming: true });
      }
      return undefined;
    }
    case "text": {
      closeStreamingText(segments);
      const content = (event.payload as { content?: string })?.content ?? "";
      segments.push({ ...meta, kind: "text", text: content, streaming: false });
      return undefined;
    }
    case "thinking": {
      closeStreamingText(segments);
      segments.push({
        ...meta,
        kind: "thinking",
        summary: (event.payload as { summary?: string })?.summary ?? "",
      });
      return undefined;
    }
    case "tool_use": {
      closeStreamingText(segments);
      const payload = event.payload as {
        toolName?: string;
        toolUseId?: string;
        input?: unknown;
      };
      segments.push({
        ...meta,
        kind: "tool",
        toolName: payload?.toolName ?? "tool",
        toolUseId: payload?.toolUseId ?? "",
        input: payload?.input,
      });
      return undefined;
    }
    case "tool_result": {
      const payload = event.payload as {
        toolUseId?: string;
        status?: "success" | "error" | "denied";
        output?: unknown;
        durationMs?: number;
      };
      for (let i = segments.length - 1; i >= 0; i -= 1) {
        const segment = segments[i];
        if (
          segment.kind === "tool" &&
          segment.toolUseId === payload?.toolUseId
        ) {
          segment.status = payload?.status;
          segment.output = payload?.output;
          segment.durationMs = payload?.durationMs;
          break;
        }
      }
      return undefined;
    }
    case "error": {
      closeStreamingText(segments);
      const message =
        (event.payload as { message?: string })?.message ??
        i18n._("agent error");
      // One failure, several channels (run-view-127, DR-003): an
      // adapter may say the same failure as prose, as repeated error
      // events, and in its result. The pane shows it once per call.
      const trimmed = message.trim();
      const start = segments.length - currentCall(segments).length;
      for (let i = segments.length - 1; i >= start; i -= 1) {
        const segment = segments[i];
        if (segment.kind === "text" && segment.text.trim() === trimmed) {
          // The failure passed off as prose gives way to its line.
          segments.splice(i, 1);
        }
      }
      const standing = callFailure(segments);
      if (standing && standing.message === message) {
        standing.count = (standing.count ?? 1) + 1;
        return undefined;
      }
      segments.push({ ...meta, kind: "error", message });
      return undefined;
    }
    case "done": {
      closeStreamingText(segments);
      return readDoneUsage(event.payload);
    }
    default:
      return undefined;
  }
}

/** Apply one record in stream order. Mutates and returns the view. */
export function applyRecord(
  view: SessionView,
  seq: number,
  record: TmuxPlayRecord,
  /** The role this record's call served, resolved by the core from the
   * trace (DR-032). A shared lane needs it to read as several calls
   * rather than one voice; the renderer never guesses it. */
  role?: string,
): SessionView {
  view.lastSeq = Math.max(view.lastSeq, seq);
  if (!hasPresentationHeader(record)) return view;
  const r = record as unknown as Record<string, unknown> & {
    type: string;
    turnId: number | null;
    timestamp: number;
  };
  const meta: SegmentMeta = { seq, at: r.timestamp };

  switch (r.type) {
    case "session_context": {
      const graphs = contextGraphs(r);
      if (graphs) view.contexts[seq] = graphs;
      break;
    }
    case "turn_started": {
      view.turnActive = true;
      const turn = r.turn as { id: number; prompt: string; attachments?: readonly MediaAsset[] };
      view.currentTurnId = turn.id;
      // A restore's report starts the interrupted turn again under its
      // own id and message (run-view-110): the message was sent once,
      // so where the lost attempt already drew it, it is not drawn again.
      const reported = view.restoring === true && view.captain.some((line) =>
        line.kind === "boss" && line.turnId === turn.id && line.text === turn.prompt);
      view.restoring = undefined;
      if (reported) break;
      pushCaptain(view, {
        kind: "boss",
        text: turn.prompt,
        ...(Array.isArray(turn.attachments) ? { attachments: turn.attachments.filter((asset) => storedAsset(asset)) } : {}),
        turnId: turn.id,
        at: r.timestamp,
      });
      break;
    }
    case "turn_finished": {
      view.turnActive = false;
      break;
    }
    case "turn_aborted": {
      view.turnActive = false;
      // One whole line per case (localization-4).
      pushCaptain(view, {
        kind: "status",
        text: r.reason
          ? i18n._("◆ turn aborted: {reason}", {
              reason: friendlyAbortReason(String(r.reason)),
            })
          : i18n._("◆ turn aborted"),
        turnId: r.turnId,
        at: r.timestamp,
      });
      break;
    }
    case "playbook_evidence": {
      const evidence = r as unknown as Extract<TmuxPlayRecord, { type: "playbook_evidence" }>;
      if (!storedAsset(evidence.asset) || typeof evidence.callId !== "string" || !evidence.callId
        || !Number.isSafeInteger(evidence.turnId) || evidence.turnId < 1
        || !evidence.origin || typeof evidence.origin.actorId !== "string" || !evidence.origin.actorId
        || !["player", "preparation"].includes(evidence.origin.kind)
        || (evidence.origin.runtimeSessionId !== undefined && typeof evidence.origin.runtimeSessionId !== "string")
        || (evidence.origin.toolUseId !== undefined && typeof evidence.origin.toolUseId !== "string")) break;
      pushCaptain(view, { kind: "media", text: "", at: r.timestamp, turnId: r.turnId,
        evidence });
      break;
    }
    case "player_prompt": {
      const target = player(view, String(r.playerId));
      target.running = true;
      target.turnUsage = undefined;
      target.segments.push({
        ...meta,
        kind: "prompt",
        text: String(r.prompt),
        ...(role !== undefined ? { role } : {}),
      });
      break;
    }
    case "player_event": {
      const target = player(view, String(r.playerId));
      const usage = applyAgentEvent(target, r.event as AgentEventLike, meta, {actorId: r.playerId, turnId: r.turnId});
      if (usage) target.turnUsage = usage;
      break;
    }
    case "player_finished": {
      const target = player(view, String(r.playerId));
      target.running = false;
      const result = r.result as {
        status: "ok" | "aborted" | "error";
        error?: string;
      };
      // The result's error is the failure line's words again more
      // often than not (run-view-127): the line then says only that
      // the call failed, the words kept for its tooltip.
      const errorAbove =
        !!result.error && callFailure(target.segments)?.message === result.error;
      target.segments.push({
        ...meta,
        kind: "result",
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
        ...(errorAbove ? { errorAbove: true } : {}),
        ...(target.turnUsage ? { usage: target.turnUsage } : {}),
      });
      break;
    }
    case "captain_prompt":
      break;
    case "captain_event": {
      const event = r.event as AgentEventLike;
      if (event.type === "text_delta") {
        view.captainDraft +=
          (event.payload as { delta?: string })?.delta ?? "";
      } else if (event.type === "text") {
        view.captainDraft =
          (event.payload as { content?: string })?.content ?? "";
      }
      break;
    }
    case "captain_reply": {
      // The playbook-7 shell speaks through captain_reply records —
      // its durable calls (and their captain_finished) are hidden, so
      // this record IS the Captain's visible prose (run-view-1). It
      // was dropped before the case existed, which read as a normal
      // chat producing nothing at all.
      const text = String((r as { text?: unknown }).text ?? "");
      if (text) {
        pushCaptain(view, {
          kind: view.pendingQuestion === undefined ? "speech" : "question",
          ...(view.pendingQuestion === undefined ? {} : { player: "Captain" }),
          text,
          turnId: r.turnId,
          at: r.timestamp,
        });
      }
      view.captainDraft = "";
      break;
    }
    case "captain_finished": {
      const result = r.result as {
        finalText?: string;
        status: string;
        error?: string;
      };
      // A visible errored result is a failure to show, never speech
      // to pass off as the Captain's words (run-view-2, DR-010 §5).
      if (result.status === "error") {
        pushCaptain(view, {
          kind: "error",
          ...plainFailure(
            result.error ??
              result.finalText ??
              i18n._("the Captain's turn failed"),
          ),
          turnId: r.turnId,
          at: r.timestamp,
        });
        view.captainDraft = "";
        break;
      }
      const text = result.finalText ?? view.captainDraft;
      if (text) {
        pushCaptain(view, { kind: "speech", text, turnId: r.turnId, at: r.timestamp });
      }
      view.captainDraft = "";
      break;
    }
    case "captain_status": {
      const message = String(r.message);
      if ((r.data as { kind?: string } | undefined)?.kind === "boss-question") break;
      // While a machine frame is open, the run's progress is drawn,
      // not narrated: the card absorbs it (run-view-60). Only the ◇
      // engagement and ◆ failure vocabularies stay in the thread
      // (run-view-1/2) — everything else a run narrates is machine
      // detail, including the bare event ids the runtime emits with
      // no glyph at all ("START_CODE", "→ noFindings").
      if (
        view.frames.length > 0 &&
        !/^[◇◆]/u.test(message.trimStart())
      ) {
        break;
      }
      // The runtime narrates the parked question as a status line too;
      // once it lives in the thread as a question bubble, the echo is
      // noise (DR-010 §1).
      if (
        view.pendingQuestion !== undefined &&
        message.includes(view.pendingQuestion)
      ) {
        break;
      }
      pushCaptain(view, {
        kind: "status",
        text: message,
        turnId: r.turnId,
        at: r.timestamp,
        data: r.data,
      });
      break;
    }
    case "captain_telemetry": {
      const topic = String(r.topic);
      const payload = r.payload as { from?: unknown; to?: unknown; state?: unknown; pendingBossQuestion?: unknown; pendingBossQuestions?: unknown; };
      // The playbook 2.0 shell reports states as rich objects
      // ({stateId, value, tags, …}); the fake harness and older
      // playbooks report bare strings. Accept both — never hand a
      // non-string to the label pipeline.
      const stateText = (value: unknown): string | undefined => {
        if (typeof value === "string") return value;
        if (value && typeof value === "object") {
          const shape = value as { stateId?: unknown; value?: unknown };
          if (typeof shape.stateId === "string") return shape.stateId;
          if (typeof shape.value === "string") return shape.value;
        }
        return undefined;
      };
      if (topic === "playbook.fsm.state") {
        view.fsmState = stateText(payload?.to) ?? stateText(payload?.state);
        const questions = payload?.pendingBossQuestions;
        const hasQuestions = payload != null &&
          (Object.hasOwn(payload, "pendingBossQuestions") || Object.hasOwn(payload, "pendingBossQuestion"));
        if (hasQuestions || view.fsmState === "awaitBossReply") {
          const list = Array.isArray(questions) ? questions
            : questions && typeof questions === "object" ? Object.values(questions)
            : [payload?.pendingBossQuestion];
          const parsed = list.map(parseBossQuestion).filter((question) => question !== undefined);
          view.pendingQuestion = parsed[0]?.question ?? (hasQuestions ? undefined : "");
          view.pendingQuestionPlayer = parsed.length === 1 ? resolvePlayerId(view, parsed[0]?.player) : undefined;
        } else if (stateText(payload?.from) === "awaitBossReply") {
          // Only the parked machine leaving its park answers the
          // question; the Captain's own machine reports its states
          // after the park and must not clear it (run-view-9).
          view.pendingQuestion = undefined;
          view.pendingQuestionPlayer = undefined;
        }
      } else if (topic === "playbook.captain.fsm.state") {
        view.captainMode = stateText(payload?.to);
      } else if (topic === RESTORING_TOPIC) {
        view.restoring = true;
      } else if (topic === RESTORED_TOPIC) {
        // A restore's recorded position (run-view-74, DR-088): the
        // restore traced no move, so the runs stand where the core
        // recorded them — a run brought back into its failure state
        // parks there, a lost call no longer runs, and a run the
        // checkpoint no longer holds settles unfinished.
        const runs = ((r.payload as Partial<RestoredPosition> | undefined)?.runs ?? [])
          .filter((run) => typeof run?.sessionId === "string" && typeof run.playbookId === "string");
        const failedBefore = new Set(view.frames
          .filter((frame) => frame.active === FAILURE_STATE_ID)
          .map((frame) => frame.traceSessionId));
        const fold = foldRestored(view.frames, runs, r.timestamp, view.settledRuns);
        // The call the process died in no longer runs: no lane reads as
        // working on it (run-view-74, run-view-7).
        for (const lane of Object.values(view.players)) lane.running = false;
        const graphs = typeof r.contextSeq === "number" ? view.contexts[r.contextSeq] : undefined;
        const bind = (frame: MachineFrame): void => {
          if (!("historicalGraph" in frame)) frame.historicalGraph = graphs?.[frame.playbookId] ?? null;
          for (const child of frame.settledCalls) bind(child);
        };
        for (const frame of [...fold.open, ...fold.closed]) bind(frame);
        view.frames = fold.open;
        view.settledRuns = fold.settled;
        for (const closed of fold.closed) {
          pushCaptain(view, {
            kind: "machine",
            text: `${closed.playbookId} ${closed.outcome ?? i18n._({ id: "finished", comment: "a run that ended with no outcome reported" })}`,
            frame: closed,
            turnId: r.turnId,
            at: r.timestamp,
          });
        }
        // A run the position moves into its failure state is a failure
        // the stream delivers, its account the cause the checkpoint
        // carries (run-view-147, DR-075): the card stands at the
        // position's place, and the notice says why from it. A run
        // already parked there keeps the account it was given.
        for (const run of runs) {
          const cause = (run as { cause?: FailureCause }).cause;
          if (stateText(run.state) !== FAILURE_STATE_ID || failedBefore.has(run.sessionId)) continue;
          if (typeof cause?.code !== "string") continue;
          pushCaptain(view, {
            kind: "status",
            // Machine words the record carries, kept for the tooltip.
            text: `${run.playbookId} ${FAILURE_STATE_ID}`,
            turnId: r.turnId,
            at: r.timestamp,
            data: { cause },
            failure: failurePosition(view.frames.find((frame) => frame.traceSessionId === run.sessionId)),
          });
        }
        // The questions the position holds are the ones standing
        // (run-view-9): the pre-turn stack brings back the question the
        // lost turn would have answered, and a position without one
        // leaves none.
        const asked = runs.flatMap((run) => {
          const pending = run.pendingBossQuestions;
          return (Array.isArray(pending) ? pending : []).map(parseBossQuestion)
            .filter((question) => question !== undefined);
        });
        const waiting = runs.some((run) => stateText(run.state) === "awaitBossReply");
        if (asked.length > 0 || waiting) {
          view.pendingQuestion = asked[0]?.question ?? "";
          view.pendingQuestionPlayer = asked.length === 1 ? resolvePlayerId(view, asked[0]?.player) : undefined;
        } else {
          view.pendingQuestion = undefined;
          view.pendingQuestionPlayer = undefined;
        }
      } else if (topic === "playbook.trace") {
        // The structured trace opens, moves, and settles the machine
        // frames the pane draws (run-view-60..63); folding is pure so
        // a replay reproduces the same cards (run-view-14).
        const fold = foldTrace(
          view.frames,
          r.payload,
          r.timestamp,
          view.settledRuns,
          r.turnId,
        );
        const graphs = typeof r.contextSeq === "number" ? view.contexts[r.contextSeq] : undefined;
        const bind = (frame: MachineFrame): void => {
          if (!("historicalGraph" in frame)) frame.historicalGraph = graphs?.[frame.playbookId] ?? null;
          for (const child of frame.settledCalls) bind(child);
        };
        for (const frame of fold.open) bind(frame);
        if (fold.closed) bind(fold.closed);
        view.frames = [...fold.open];
        view.settledRuns = [...fold.settled];
        if (fold.closed?.active === "awaitBossReply") {
          // A run dismissed while parked takes its question with it
          // (run-view-9).
          view.pendingQuestion = undefined;
          view.pendingQuestionPlayer = undefined;
        }
        if (fold.closed) {
          pushCaptain(view, {
            kind: "machine",
            // The playbook id and the run's outcome are machine words
            // the trace carries; only the stand-in is a text.
            text: `${fold.closed.playbookId} ${fold.closed.outcome ?? i18n._({ id: "finished", comment: "a run that ended with no outcome reported" })}`,
            frame: fold.closed,
            turnId: r.turnId,
            at: r.timestamp,
          });
        }
      }
      break;
    }
    case "player_view_changed":
      // A lane is the session's, not the current call's: the runtime's
      // narrowing tells the reducer nothing a pane should act on
      // (run-view-7).
      break;
    case "runtime_error": {
      // The line speaks plain (DR-010 §2): a leading "Error:" and
      // doubled periods go, a known runtime message maps to its
      // phrase, and the raw text survives for the tooltip. The
      // record's own data travels with it: where the runtime attached
      // a structured cause, the line draws as the failure card
      // instead (run-view-147, DR-075).
      pushCaptain(view, {
        kind: "error",
        ...plainFailure(String(r.message)),
        turnId: r.turnId,
        at: r.timestamp,
        data: r.data,
      });
      break;
    }
    default:
      break;
  }
  return view;
}

export function applyRecords(
  view: SessionView,
  records: readonly { seq: number; record: TmuxPlayRecord; role?: string }[],
): SessionView {
  for (const entry of records) {
    applyRecord(view, entry.seq, entry.record, entry.role);
  }
  return view;
}

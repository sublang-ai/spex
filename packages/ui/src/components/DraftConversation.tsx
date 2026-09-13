// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The authoring conversation (DR-058, playbook-library-53/54/55): the
// draft's records in record order — the Boss's bubbles, the system's
// lines, and the agent's segments as the run view draws them — with
// the agent's directive blocks drawn as cards; the agent chip that
// names who answers and opens the picker; and beneath it the house
// composer, dispatching or queueing by the draft's published state.

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentSummary,
  DraftInfo,
  ReadinessEntry,
  SessionPlayerSummary,
} from "@sublang/spex-core/protocol";

import type { CaptainLine, TranscriptSegment } from "../state/reducer.js";
import { AUTHOR_PLAYER, type DraftView } from "../state/store.js";
import { splitDirectives, type TextPart } from "../lib/directives.js";
import { absoluteTitle, duration } from "../lib/time.js";
import { useClock } from "../lib/useClock.js";
import { usePopover } from "../lib/usePopover.js";
import { useStickToBottom, jumpPillClasses } from "../lib/useStickToBottom.js";
import { AgentChip } from "./AgentChip.js";
import { SystemLine, ThreadLine } from "./CaptainPane.js";
import {
  ComposerBox,
  ComposerCaption,
  ComposerField,
  SEND_KEYS,
} from "./Composer.js";
import { Icon } from "./Icon.js";
import { Markdown } from "./Markdown.js";
import { Segment, latestCall } from "./PlayerPane.js";
import { RunningMark } from "./RunningMark.js";

const RENDER_WINDOW = 200;

/** The starter chips an empty thread offers (playbook-library-54):
 * each places its text in the field without sending. */
export const STARTER_CHIPS = [
  "Describe a workflow",
  "Adapt a SKILL.md",
  "Show me an example",
] as const;

export const EMPTY_THREAD_CAPTION =
  "Tell the agent what the playbook does, who does what, and when it is done";

type ThreadEntry =
  | { kind: "line"; seq: number; line: CaptainLine }
  | { kind: "segment"; seq: number; segment: TranscriptSegment };

/** The thread in record order: the Captain lines and the author's
 * segments merged by the sequence of the record behind each. */
export function threadEntries(draftView: DraftView | undefined): ThreadEntry[] {
  if (!draftView) return [];
  const lines = draftView.view.captain;
  const seqs = draftView.lineSeqs;
  const segments = draftView.view.players[AUTHOR_PLAYER]?.segments ?? [];
  const entries: ThreadEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < lines.length || j < segments.length) {
    const lineSeq = i < lines.length ? (seqs[i] ?? 0) : Number.POSITIVE_INFINITY;
    const segmentSeq =
      j < segments.length ? segments[j].seq : Number.POSITIVE_INFINITY;
    if (lineSeq <= segmentSeq) {
      entries.push({ kind: "line", seq: lineSeq, line: lines[i] });
      i += 1;
    } else {
      entries.push({ kind: "segment", seq: segmentSeq, segment: segments[j] });
      j += 1;
    }
  }
  return entries;
}

/** A system-origin turn — a relay or the success prompt, whose text
 * starts "Spex:" (playbook-library-64) — reads as a ◇ line, its first
 * line shown and the rest of the message behind a fold. */
function SystemTurn({ text, at }: { text: string; at: number }) {
  const [first, ...rest] = text.split("\n");
  const more = rest.join("\n").trim();
  return (
    <div data-testid="system-turn" className="flex flex-col gap-1">
      <SystemLine text={`◇ ${first}`} title={absoluteTitle(at)} />
      {more ? (
        <details className="pl-4 text-xs text-neutral-500">
          <summary className="cursor-pointer select-none">Show the message</summary>
          <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] font-mono">
            {more}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

/** A directive block as the thread draws it (playbook-library-53): a
 * card for a block Spex read, code with a caption for one it could
 * not — never fence text passed off as prose. */
function DirectiveCard({
  part,
  onOpenRegister,
}: {
  part: Extract<TextPart, { kind: "directive" }>;
  onOpenRegister: () => void;
}) {
  if (!part.directive) {
    return (
      <div
        data-testid="directive-malformed"
        className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50/60 px-2 py-1.5 dark:border-amber-800 dark:bg-amber-950/40"
      >
        <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-xs text-neutral-700 dark:text-neutral-300">
          {part.body}
        </pre>
        <span className="text-xs text-amber-800 dark:text-amber-200" title={part.error}>
          Spex could not read this block
        </span>
      </div>
    );
  }
  if (part.directive.kind === "compile") {
    return (
      <div
        data-testid="directive-card"
        data-kind="compile"
        className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-900"
      >
        Asked to compile
      </div>
    );
  }
  const proposal = part.directive;
  return (
    <div
      data-testid="directive-card"
      data-kind="register"
      className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Proposed registration</span>
        <button
          type="button"
          data-testid="open-register"
          onClick={onOpenRegister}
          className="ml-auto rounded-md border border-brand-300 px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
        >
          Open Register
        </button>
      </div>
      <div className="font-mono text-xs">/{proposal.command}</div>
      <div className="text-xs text-neutral-600 dark:text-neutral-400">{proposal.intent}</div>
      <ul className="flex flex-col gap-0.5 text-xs">
        {Object.entries(proposal.players).map(([role, playerId]) => (
          <li key={role} className="flex flex-wrap items-center gap-1 font-mono">
            <span>{role}</span>
            <span aria-hidden="true" className="text-neutral-400">
              →
            </span>
            <span className="sr-only">answered by</span>
            <span>{playerId}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The agent's text with its directive blocks lifted out as cards. */
function DirectiveText({
  text,
  streaming,
  onOpenRegister,
}: {
  text: string;
  streaming: boolean;
  onOpenRegister: () => void;
}) {
  const parts = useMemo(() => splitDirectives(text), [text]);
  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, index) =>
        part.kind === "prose" ? (
          <Markdown key={index} text={part.text} links="web-only" />
        ) : (
          <DirectiveCard key={index} part={part} onOpenRegister={onOpenRegister} />
        ),
      )}
      {streaming ? (
        <span className="inline-block h-3 w-1.5 animate-pulse bg-neutral-400 align-baseline" />
      ) : null}
    </div>
  );
}

/** The agent chip as a button and its picker (playbook-library-55):
 * "Captain" or the chosen roster player, wearing the adapter's
 * readiness; the popover follows the house idiom (DR-010 §6) and is
 * disabled while a turn runs, since a switch applies to the next. */
function AgentPicker({
  draft,
  players,
  captain,
  readiness,
  onPick,
}: {
  draft: DraftInfo;
  players: SessionPlayerSummary[];
  captain?: AgentSummary;
  readiness: ReadinessEntry[];
  onPick: (playerId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const rootRef = usePopover<HTMLDivElement>(open, {
    anchorRef,
    onClose: () => setOpen(false),
    menu: true,
  });
  const disabled = draft.activity === "turn";
  const readinessOf = (adapter: string) =>
    readiness.find((entry) => entry.adapter === adapter);
  const name = draft.player ?? "Captain";
  const options: { id: string | null; name: string; agent: AgentSummary }[] = [
    { id: null, name: "Captain", agent: captain ?? draft.agent },
    ...players.map((player) => ({ id: player.id, name: player.id, agent: player.agent })),
  ];

  async function choose(playerId: string | null): Promise<void> {
    setError(undefined);
    try {
      await onPick(playerId);
      setOpen(false);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <span className="relative flex min-w-0 items-center gap-1.5">
      <button
        ref={anchorRef}
        type="button"
        data-testid="draft-agent"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={
          disabled
            ? "Waits for the reply — the agent switches on the next turn"
            : "Choose which agent answers"
        }
        onClick={() => setOpen((current) => !current)}
        className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold hover:bg-neutral-100 disabled:opacity-60 disabled:hover:bg-transparent dark:hover:bg-neutral-800"
      >
        {/* A long player id truncates; the whole rides the title (DR-041). */}
        <span className="min-w-0 max-w-[10rem] truncate" title={name}>
          {name}
        </span>
        <Icon name="caretDown" className="h-3 w-3 shrink-0" />
      </button>
      {/* The model chip yields first in a narrow pane (DR-041 §9). */}
      <span className="hidden min-w-0 @md:inline-flex">
        <AgentChip
          agent={draft.agent}
          readiness={readinessOf(draft.agent.adapter)}
          label={name}
        />
      </span>
      {open ? (
        <div
          ref={rootRef}
          role="menu"
          aria-label="Answering agent"
          data-testid="agent-picker"
          className="absolute left-0 top-full z-20 mt-1 flex w-72 max-w-[calc(100vw-1rem)] flex-col gap-0.5 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {options.map((option) => (
            <button
              key={option.id ?? "captain"}
              type="button"
              role="menuitemradio"
              aria-checked={(draft.player ?? null) === option.id}
              data-testid={`agent-option-${option.id ?? "captain"}`}
              onClick={() => void choose(option.id)}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-neutral-50 aria-checked:bg-brand-50 dark:hover:bg-neutral-800 dark:aria-checked:bg-brand-950"
            >
              <span className="w-24 shrink-0 truncate font-medium" title={option.name}>
                {option.name}
              </span>
              <AgentChip
                agent={option.agent}
                readiness={readinessOf(option.agent.adapter)}
                label={option.name}
              />
            </button>
          ))}
          {error ? (
            <div className="px-2 py-1 text-xs text-red-600 dark:text-red-400">{error}</div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

export function DraftConversation({
  draft,
  draftView,
  players,
  captain,
  readiness,
  connected,
  composerText,
  error,
  onComposerChange,
  onSend,
  onAbort,
  onPickAgent,
  onDismissError,
  onOpenRegister,
}: {
  draft: DraftInfo;
  draftView?: DraftView;
  /** The session roster the picker offers (settings-26). */
  players: SessionPlayerSummary[];
  captain?: AgentSummary;
  readiness: ReadinessEntry[];
  connected: boolean;
  composerText: string;
  /** A refused command, kept above the composer with the text intact. */
  error?: string;
  onComposerChange: (text: string) => void;
  onSend: (text: string) => Promise<void>;
  onAbort: () => void;
  onPickAgent: (playerId: string | null) => Promise<void>;
  onDismissError: () => void;
  onOpenRegister: () => void;
}) {
  const entries = useMemo(() => threadEntries(draftView), [draftView]);
  const [windowSize, setWindowSize] = useState(RENDER_WINDOW);
  const turnRunning = draft.activity === "turn";
  const compiling = draft.activity === "compiling";
  const lastSeq = draftView?.view.lastSeq ?? 0;
  const { scrollRef, onScroll, newBelow, jump, stuckRef } = useStickToBottom(
    `${entries.length}:${lastSeq}:${turnRunning ? 1 : 0}`,
  );
  // The turn's clock (DR-010 §5): since the Boss's or the system's
  // message opened it, else since the agent's latest call.
  const since = useMemo(() => {
    if (!draftView) return undefined;
    for (let index = draftView.view.captain.length - 1; index >= 0; index -= 1) {
      const line = draftView.view.captain[index];
      if (line.kind === "boss") return line.at;
    }
    return latestCall(draftView.view.players[AUTHOR_PLAYER] ?? { id: AUTHOR_PLAYER, running: false, segments: [] })?.at;
  }, [draftView]);
  const now = useClock(turnRunning);

  const [sending, setSending] = useState(false);
  const [aborting, setAborting] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const readinessOf = (adapter: string) =>
    readiness.find((entry) => entry.adapter === adapter);

  useEffect(() => {
    if (!turnRunning) setAborting(false);
  }, [turnRunning]);
  useEffect(() => {
    if (error) setAborting(false);
  }, [error]);

  // What holds Send: an unreadable draft (playbook-library-70), else an
  // agent that is not ready (playbook-library-55).
  const requirement = draft.diagnostic
    ? "Unreadable draft — delete it, or repair the file and restart Spex"
    : draft.ready === false
      ? (readinessOf(draft.agent.adapter)?.requirement ??
        `${draft.agent.adapter} is not ready — check Settings`)
      : undefined;
  const busyKind = turnRunning ? "reply" : compiling ? "compile" : undefined;
  const placeholder = !connected
    ? "Connecting…"
    : busyKind === "reply"
      ? "Sends after the reply…"
      : busyKind === "compile"
        ? "Sends after the compile…"
        : "Describe the playbook…";

  function submit(): void {
    const trimmed = composerText.trim();
    if (!trimmed || sending || !connected || requirement) return;
    setSending(true);
    onSend(trimmed)
      .then(() => onComposerChange(""))
      .catch(() => {
        // The text stays; the strip above says why (playbook-library-54).
      })
      .finally(() => {
        setSending(false);
        fieldRef.current?.focus();
      });
  }

  const shown = entries.slice(-windowSize);
  // The scoped diagnostic stands in the thread's place: the core's,
  // for a damaged record or transcript, else the open's own failure
  // (playbook-library-62).
  const diagnostic = draft.diagnostic ?? draftView?.loadError;
  const empty =
    entries.length === 0 && !draftView?.loading && !diagnostic && !turnRunning;

  return (
    <section
      data-testid="draft-conversation"
      className="@container flex min-h-0 flex-1 flex-col gap-2"
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
          <AgentPicker
            draft={draft}
            players={players}
            captain={captain}
            readiness={readiness}
            onPick={onPickAgent}
          />
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {turnRunning ? (
              <>
                <RunningMark running data-testid="draft-running" title="Working" />
                <span
                  data-testid="draft-working"
                  title={since !== undefined ? `Working since ${absoluteTitle(since)}` : undefined}
                  className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400"
                >
                  working{since !== undefined ? ` · ${duration(now - since)}` : "…"}
                </span>
              </>
            ) : null}
          </span>
        </header>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            data-testid="draft-thread"
            className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2"
          >
            {diagnostic ? (
              <div
                role="alert"
                data-testid="draft-load-error"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
              >
                {diagnostic}
              </div>
            ) : null}
            {draftView?.loading && entries.length === 0 ? (
              <div className="m-auto text-xs text-neutral-500">Loading the conversation…</div>
            ) : null}
            {entries.length > windowSize ? (
              <button
                type="button"
                onClick={() => {
                  stuckRef.current = false;
                  setWindowSize((size) => size + RENDER_WINDOW);
                }}
                className="text-center text-xs text-neutral-500 hover:text-brand-500"
              >
                Show {Math.min(RENDER_WINDOW, entries.length - windowSize)} of{" "}
                {entries.length - windowSize} earlier entries
              </button>
            ) : null}
            {shown.map((entry) =>
              entry.kind === "line" ? (
                entry.line.kind === "boss" && /^Spex:/u.test(entry.line.text) ? (
                  <SystemTurn key={`l${entry.seq}`} text={entry.line.text} at={entry.line.at} />
                ) : (
                  <ThreadLine key={`l${entry.seq}`} line={entry.line} />
                )
              ) : entry.segment.kind === "text" ? (
                <DirectiveText
                  key={`s${entry.seq}`}
                  text={entry.segment.text}
                  streaming={entry.segment.streaming}
                  onOpenRegister={onOpenRegister}
                />
              ) : (
                <Segment key={`s${entry.seq}`} segment={entry.segment} />
              ),
            )}
            {empty ? (
              <div className="m-auto text-xs text-neutral-500">
                The agent's replies land here.
              </div>
            ) : null}
          </div>
          {newBelow ? (
            <button type="button" onClick={jump} className={jumpPillClasses()}>
              ↓ Latest
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-1.5">
        {error ? (
          <div
            data-testid="draft-error"
            role="status"
            className="flex shrink-0 items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="flex h-6 w-6 items-center justify-center rounded text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900"
              title="Dismiss"
              aria-label="Dismiss error"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
        {empty ? (
          <div
            data-testid="draft-starters"
            className="flex flex-col gap-1.5 px-1 text-xs text-neutral-500 dark:text-neutral-400"
          >
            <span>{EMPTY_THREAD_CAPTION}</span>
            <div className="flex flex-wrap gap-1.5">
              {STARTER_CHIPS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  data-testid="starter-chip"
                  onClick={() => {
                    onComposerChange(starter);
                    fieldRef.current?.focus();
                  }}
                  className="rounded-full border border-neutral-300 px-2.5 py-0.5 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {draft.queued.length > 0 ? (
          // The queue the core holds (playbook-library-54): a few
          // entries tall, its own scroll box (run-view-8, DR-041 §9).
          <div
            data-testid="draft-queue"
            className="relative flex max-h-40 min-h-0 flex-col items-end gap-1 overflow-y-auto"
          >
            {draft.queued.map((text, index) => (
              <div
                key={index}
                className="flex max-w-[85%] shrink-0 flex-col rounded-2xl rounded-br-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 dark:border-brand-700 dark:text-brand-300"
              >
                <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</span>
                <span className="mt-0.5 text-xs text-neutral-500">
                  {busyKind === "compile" ? "sends after the compile" : "sends after the reply"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <ComposerBox
          field={
            <ComposerField
              fieldRef={fieldRef}
              data-testid="draft-composer"
              value={composerText}
              onChange={(event) => onComposerChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={placeholder}
              disabled={!connected}
            />
          }
          caption={<ComposerCaption hint={requirement ?? "Enter sends"} />}
          actions={
            <>
              {turnRunning ? (
                <button
                  type="button"
                  data-testid="draft-abort"
                  onClick={() => {
                    setAborting(true);
                    onAbort();
                    fieldRef.current?.focus();
                  }}
                  disabled={aborting || !connected}
                  title={!connected ? "Not connected" : "Ends the turn; the transcript keeps what it got"}
                  className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {aborting ? "Aborting…" : "Abort"}
                </button>
              ) : null}
              <button
                type="button"
                data-testid="draft-send"
                onClick={submit}
                disabled={
                  composerText.trim().length === 0 ||
                  sending ||
                  !connected ||
                  requirement !== undefined
                }
                title={
                  !connected
                    ? "Not connected"
                    : (requirement ??
                      (busyKind ? `Sends after the ${busyKind} · ${SEND_KEYS}` : SEND_KEYS))
                }
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
              >
                {sending ? "Sending…" : busyKind ? "Send next" : "Send"}
              </button>
            </>
          }
        />
      </div>
    </section>
  );
}

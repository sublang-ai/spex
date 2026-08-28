// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The project session run view (RUN-1..12): Captain column with the
// Boss composer docked below, player panes for the visible roster.

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DerivedIntent,
  IntentSource,
  PlaybookSummary,
  SessionInfo,
} from "@sublang/spex-core/protocol";

import type { SessionView } from "../state/reducer.js";
import type { ComposerState } from "../state/store.js";
import { CaptainPane, type ThreadExtra } from "./CaptainPane.js";
import {
  CAPTAIN_SPLIT_DEFAULT,
  CAPTAIN_SPLIT_MAX,
  CAPTAIN_SPLIT_MIN,
  useAppStore,
} from "../state/store.js";
import { Composer } from "./Composer.js";
import { DeliveryCard, intentTitle } from "./DeliveryCard.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { PlayerPane } from "./PlayerPane.js";


/** The Captain/players divider (DR-030). A machine drawing has a
 * natural width that reflowing text does not, so the reader sets the
 * split: drag it, nudge it by arrow key, or double-click to restore
 * the default. */
function SplitDivider({
  percent,
  onChange,
  containerRef,
}: {
  percent: number;
  onChange(next: number): void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragging, setDragging] = useState(false);

  function fromClientX(clientX: number): number | undefined {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return undefined;
    return ((clientX - box.left) / box.width) * 100;
  }

  return (
    <div
      data-testid="captain-divider"
      data-dragging={dragging ? "1" : "0"}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the Captain pane"
      aria-valuenow={percent}
      aria-valuemin={CAPTAIN_SPLIT_MIN}
      aria-valuemax={CAPTAIN_SPLIT_MAX}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const next = fromClientX(event.clientX);
        if (next !== undefined) onChange(next);
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
      }}
      onDoubleClick={() => onChange(CAPTAIN_SPLIT_DEFAULT)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onChange(percent - 2);
        else if (event.key === "ArrowRight") onChange(percent + 2);
        else if (event.key === "Home") onChange(CAPTAIN_SPLIT_DEFAULT);
        else return;
        event.preventDefault();
      }}
      // A 12px hit target around a 2px rule: reachable without
      // becoming a visible bar (DR-010 §6).
      className="group relative -mx-1.5 w-3 shrink-0 cursor-col-resize touch-none focus:outline-none"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded ${
          dragging
            ? "bg-brand-500"
            : "bg-transparent group-hover:bg-neutral-300 group-focus:bg-brand-500 dark:group-hover:bg-neutral-700"
        }`}
      />
    </div>
  );
}

export function RunView({
  session,
  view,
  composer,
  connected,
  error,
  playbooks,
  readOnly,
  ending,
  onEnd,
  onStartNew,
  onCompileNew,
  onRetryLoad,
  onDraftChange,
  onSubmit,
  onAbort,
  onRemoveQueued,
  onDismissError,
  focusTurn,
  onFocusHandled,
}: {
  session: SessionInfo;
  view: SessionView;
  composer: ComposerState;
  connected: boolean;
  error?: string;
  playbooks?: PlaybookSummary[];
  /** Ended-session transcript browsing (RUN-33): input replaced. */
  readOnly?: boolean;
  /** The end request is in flight — the agents are shutting down. */
  ending?: boolean;
  /** End this session. Guarded here, never on the tab's close
   * control, which stops nothing (run-view-47). */
  onEnd?: () => void;
  onStartNew?: () => void;
  onCompileNew?: () => void;
  /** Retry a failed transcript load (read-only view). */
  onRetryLoad?: () => void;
  onDraftChange?: (draft: string) => void;
  onSubmit: (text: string) => Promise<void>;
  onAbort: () => void;
  onRemoveQueued: (index: number) => void;
  onDismissError: () => void;
  /** Attention activation (run-view-91): land at this turn's place —
   * its question bubble, failure line, or delivery card. */
  focusTurn?: number;
  onFocusHandled?: () => void;
}) {
  const machineGraphs = useAppStore((state) => state.machineGraphs);
  const captainSplit = useAppStore((state) => state.captainSplit);
  const setCaptainSplit = useAppStore((state) => state.setCaptainSplit);
  const ledger = useAppStore((state) => state.ledger);
  const staged = useAppStore((state) => state.stagedIntents[session.id]);
  const clearStagedIntent = useAppStore((state) => state.clearStagedIntent);
  const queueIntent = useAppStore((state) => state.queueIntent);
  const closeIntent = useAppStore((state) => state.closeIntent);
  const stageDispatch = useAppStore((state) => state.stageDispatch);
  const splitRef = useRef<HTMLDivElement>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // The intents this session's turns are bound to (DR-035): the open
  // fold serves them; a closed one survives below as a snapshot so its
  // delivery card can resolve in place rather than vanish.
  const bound = useMemo(
    () =>
      (ledger?.intents ?? []).filter(
        (entry) => entry.intent.dispatched?.sessionId === session.id,
      ),
    [ledger, session.id],
  );

  // Finished intents seen here, kept after their verdict closes them
  // (run-view-87: the card resolves in place). A released or re-worked
  // intent leaves the map — its card no longer belongs in the thread.
  const [delivered, setDelivered] = useState<Record<string, DerivedIntent>>({});
  useEffect(() => {
    if (!ledger) return;
    setDelivered((previous) => {
      const next = { ...previous };
      let changed = false;
      for (const entry of bound) {
        if (entry.state === "finished") {
          next[entry.intent.id] = entry;
          changed = true;
        } else if (previous[entry.intent.id]) {
          delete next[entry.intent.id];
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [ledger, bound]);

  // An intent's turn range runs from its dispatch turn up to the next
  // dispatch in this session (DR-035).
  const dispatchTurns = useMemo(() => {
    const turns = new Set<number>();
    for (const entry of bound) {
      if (entry.intent.dispatched) turns.add(entry.intent.dispatched.turnId);
    }
    for (const entry of Object.values(delivered)) {
      if (entry.intent.dispatched) turns.add(entry.intent.dispatched.turnId);
    }
    return [...turns].sort((a, b) => a - b);
  }, [bound, delivered]);

  function rangeOf(entry: DerivedIntent): [number, number] {
    const from = entry.intent.dispatched?.turnId ?? 0;
    const to =
      dispatchTurns.find((turn) => turn > from) ?? Number.POSITIVE_INFINITY;
    return [from, to];
  }

  // The working line (run-view-90): the newest open dispatched intent
  // owns the conversation.
  const workingIntent = useMemo(() => {
    const open = bound.filter(
      (entry) => entry.state === "working" || entry.state === "interrupted",
    );
    open.sort(
      (a, b) => (b.intent.dispatched?.at ?? 0) - (a.intent.dispatched?.at ?? 0),
    );
    return open[0];
  }, [bound]);

  // The bound turn's Boss bubble wears the intent's source chip
  // (run-view-89).
  const bossSources = useMemo(() => {
    const map = new Map<number, IntentSource>();
    for (const entry of [...Object.values(delivered), ...bound]) {
      const dispatched = entry.intent.dispatched;
      if (dispatched && entry.intent.source) {
        map.set(dispatched.turnId, entry.intent.source);
      }
    }
    return map;
  }, [bound, delivered]);

  // The project's next queued unblocked intent, the pull the delivery
  // card resolves into (run-view-87).
  const nextUp = useMemo(
    () =>
      (ledger?.intents ?? []).find(
        (entry) =>
          entry.intent.projectId === session.projectId &&
          entry.state === "queued" &&
          !entry.blockedBy,
      ),
    [ledger, session.projectId],
  );

  // Delivery cards anchored at each intent's final turn's end.
  const extras = useMemo<ThreadExtra[]>(() => {
    const list: ThreadExtra[] = [];
    for (const entry of Object.values(delivered)) {
      const [from, to] = rangeOf(entry);
      let anchor = -1;
      view.captain.forEach((line, index) => {
        if (line.turnId !== null && line.turnId >= from && line.turnId < to) {
          anchor = index;
        }
      });
      if (anchor < 0) continue;
      const stillOpen =
        ledger?.intents.some((open) => open.intent.id === entry.intent.id) ??
        true;
      list.push({
        key: `delivery-${entry.intent.id}`,
        afterIndex: anchor,
        focusKey: `card-${entry.intent.id}`,
        node: (
          <DeliveryCard
            derived={entry}
            closed={!stillOpen}
            live={session.live}
            next={nextUp}
            onClose={(as) => closeIntent(entry.intent.id, as)}
            onStartNext={(intent) => void stageDispatch(intent)}
            onQueueNext={async (text) => {
              await queueIntent({ projectId: session.projectId, text });
            }}
          />
        ),
      });
    }
    return list;
    // rangeOf reads only state derived in this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivered, dispatchTurns, view.captain, ledger, nextUp, session]);

  // Where an attention activation should land (run-view-91): the
  // delivery card, the question bubble, or the failure line of the
  // named turn — a boss bubble as the last resort.
  const focusKey = useMemo(() => {
    if (focusTurn === undefined) return undefined;
    // Finished intents straight from the ledger count before their
    // card has folded into the delivered map, so the focus never
    // lands on the wrong element in the interim.
    const cards = new Map<string, DerivedIntent>();
    for (const entry of bound) {
      if (entry.state === "finished") cards.set(entry.intent.id, entry);
    }
    for (const entry of Object.values(delivered)) {
      cards.set(entry.intent.id, entry);
    }
    for (const entry of cards.values()) {
      const [from, to] = rangeOf(entry);
      if (focusTurn >= from && focusTurn < to) return `card-${entry.intent.id}`;
    }
    for (const kind of ["question", "error", "boss"] as const) {
      for (let index = view.captain.length - 1; index >= 0; index -= 1) {
        const line = view.captain[index];
        if (line.kind === kind && line.turnId === focusTurn) {
          return `line-${index}`;
        }
      }
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTurn, bound, delivered, dispatchTurns, view.captain]);
  // A pane is a player lane, not a moment (DR-032): the session's
  // bound roster is the pane set for the session's whole life, so a
  // call that ends leaves its transcript where the reader last saw it.
  const lanes = session.players.map((player) => player.id);
  const metaById = new Map(session.players.map((player) => [player.id, player]));
  const title = session.title ?? "new session";
  const queued = composer.queued.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The conversation names itself, and ending it is a control of
          its own (run-view-69, run-view-47). */}
      <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-1.5 text-sm dark:border-neutral-800">
        <span className="min-w-0 truncate font-medium" title={title}>
          {title}
        </span>
        {readOnly ? (
          <span
            data-testid="session-ended-at"
            className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400"
          >
            ended{" "}
            {session.endedAt ? new Date(session.endedAt).toLocaleString() : ""}
          </span>
        ) : confirmEnd ? (
          <span className="ml-auto">
            <InlineConfirm
              question={
                (view.turnActive ? "A turn is running — end?" : "End session?") +
                (queued > 0
                  ? ` ${queued} queued message${queued === 1 ? "" : "s"} will be discarded.`
                  : "")
              }
              confirmLabel="end"
              cancelLabel="keep"
              onConfirm={() => {
                setConfirmEnd(false);
                onEnd?.();
              }}
              onCancel={() => setConfirmEnd(false)}
            />
          </span>
        ) : onEnd ? (
          <button
            type="button"
            data-testid="end-session"
            disabled={ending}
            onClick={() => setConfirmEnd(true)}
            title="Stop this session's agents"
            className="ml-auto shrink-0 rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:border-red-300 hover:text-red-600 disabled:animate-pulse dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-red-800 dark:hover:text-red-400"
          >
            {ending ? "Ending…" : "End session"}
          </button>
        ) : null}
      </div>
      <div ref={splitRef} className="flex min-h-0 flex-1 gap-3 p-3">
        <div
          data-testid="captain-column"
          style={{ width: `${captainSplit}%` }}
          className="flex min-w-[280px] flex-col gap-2"
        >
          <CaptainPane
            view={view}
            machineGraphs={machineGraphs}
            bossSources={bossSources}
            extras={extras}
            focusKey={focusKey}
            onFocusHandled={onFocusHandled}
          />
          {workingIntent && !readOnly ? (
            // Re-entry answered where the eye lands (run-view-90): the
            // lane names what it is working on, raw text in the tooltip.
            <div
              data-testid="working-line"
              title={workingIntent.intent.text}
              className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
            >
              <span className="shrink-0 font-medium">Working:</span>
              <span className="min-w-0 truncate">
                {intentTitle(workingIntent.intent)}
              </span>
            </div>
          ) : null}
          {readOnly ? (
            <>
              {error ? (
                // A failed history load must not read as an empty run
                // (DR-010 §5): name it and offer the retry.
                <div
                  data-testid="past-load-error"
                  className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                >
                  <span className="min-w-0 flex-1">{error}</span>
                  {onRetryLoad ? (
                    <button
                      type="button"
                      onClick={onRetryLoad}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-300"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div
                data-testid="ended-notice"
                className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900"
              >
                This session has ended — transcript is read-only.
                {onStartNew ? (
                  <button
                    type="button"
                    onClick={onStartNew}
                    className="ml-auto rounded-md border border-brand-300 px-2.5 py-1 text-xs text-brand-600 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
                  >
                    Start a new session
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <Composer
              view={view}
              composer={composer}
              connected={connected}
              error={error}
              playbooks={playbooks}
              staged={staged}
              onCompileNew={onCompileNew}
              onDraftChange={onDraftChange}
              onSubmit={onSubmit}
              onAbort={onAbort}
              onRemoveQueued={onRemoveQueued}
              onDismissError={onDismissError}
              onDetachStaged={() => clearStagedIntent(session.id)}
              onQueueInstead={async (text) => {
                // Queue instead of send (run-view-85): chat provenance
                // names this session; nothing is dispatched.
                await queueIntent({
                  projectId: session.projectId,
                  text,
                  source: { kind: "chat", ref: session.id },
                });
              }}
            />
          )}
        </div>
        <SplitDivider
          percent={captainSplit}
          onChange={setCaptainSplit}
          containerRef={splitRef}
        />
        <div
          data-testid="player-grid"
          className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto"
        >
          {lanes.map((playerId) => (
            <PlayerPane
              key={playerId}
              view={
                view.players[playerId] ?? {
                  id: playerId,
                  running: false,
                  segments: [],
                }
              }
              meta={metaById.get(playerId)}
            />
          ))}
          </div>
      </div>
    </div>
  );
}

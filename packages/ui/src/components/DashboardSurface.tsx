// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Dashboard (DR-035, dashboard-1..38): one question, top to
// bottom — what needs me, interrupted then finished, and where is
// each project. The two-band attention queue renders the core's one
// ledger fold as served; below it, one group per project carries
// History, Now, Up next, and Sources. Every state here is derived —
// the surface writes nothing but Boss acts (queue, move, close).

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  AttentionEntry,
  DerivedIntent,
  IntentInfo,
  IntentSource,
  IntentStats,
  ProjectInfo,
  SessionInfo,
} from "@sublang/spex-core/protocol";

import { useAppStore, type ProjectMeta } from "../state/store.js";
import { stateLabel, type StatusTone } from "../lib/labels.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { RunningMark } from "./RunningMark.js";
import { SourcesBand } from "./SourcesTabs.js";
import { openSourceIntents } from "./ForgeItemRow.js";

// ---------------------------------------------------------------------------
// Copy and formatting
// ---------------------------------------------------------------------------

/** Human reason labels for attention entries (DR-010 §2). */
const REASON_LABEL: Record<AttentionEntry["kind"], string> = {
  question: "needs your reply",
  permission: "awaiting permission",
  failure: "failed",
  finish: "finished — confirm?",
  review: "turn to review",
};

/** Band tones (DR-029): amber waits on the human, red means chase
 * this — only the unacknowledged failure wears it. */
function entryTone(entry: AttentionEntry): "amber" | "red" {
  return entry.kind === "failure" ? "red" : "amber";
}

const TONE_ROW: Record<"amber" | "red", string> = {
  amber:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  red: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

/** Session-state chip classes per tone (DR-013: brand purple stays
 * interactive, so status chips tint amber/red/neutral only; running
 * aliveness is the emerald mark, not a chip hue). */
const TONE_CHIP: Record<StatusTone, string> = {
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  emerald:
    "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  neutral:
    "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

export function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0] ?? text;
}

function elapsed(since: number, now: number): string {
  const minutes = Math.floor((now - since) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** The finished entry's stats line (dashboard-35): review rounds
 * foremost, omitted when absent. */
export function statsLine(stats: IntentStats): string {
  const parts: string[] = [];
  if (stats.reviewRounds) {
    parts.push(
      `${stats.reviewRounds} review round${stats.reviewRounds === 1 ? "" : "s"}`,
    );
  }
  parts.push(`${stats.turns} turn${stats.turns === 1 ? "" : "s"}`);
  if (stats.elapsedMs !== undefined) parts.push(duration(stats.elapsedMs));
  return parts.join(" · ");
}

/** A project's queue in served (rank) order. */
function queueOf(intents: DerivedIntent[], projectId: string): DerivedIntent[] {
  return intents.filter(
    (derived) =>
      derived.intent.projectId === projectId && derived.state === "queued",
  );
}

/** The globally next unblocked queue head, first by sidebar order
 * (dashboard-8): the all-clear state's pull. */
function nextUnblockedHead(
  intents: DerivedIntent[],
  projects: ProjectInfo[],
): DerivedIntent | undefined {
  for (const project of projects) {
    const head = queueOf(intents, project.id).find(
      (derived) => !derived.blockedBy,
    );
    if (head) return head;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Attention queue
// ---------------------------------------------------------------------------

function AttentionRow({
  entry,
  projectName,
  now,
  onOpen,
  onClose,
}: {
  entry: AttentionEntry;
  projectName: string;
  now: number;
  onOpen: () => void;
  onClose: (as: "done" | "dropped") => Promise<void>;
}) {
  const [busy, setBusy] = useState<"done" | "dropped">();
  const [confirmDrop, setConfirmDrop] = useState(false);
  const tone = entryTone(entry);
  const close = (as: "done" | "dropped") => {
    setBusy(as);
    void onClose(as).finally(() => setBusy(undefined));
  };
  const finishedIntent = entry.kind === "finish" && entry.intentId;
  return (
    <div
      data-testid={`attention-${entry.intentId ?? entry.sessionId}-${entry.kind}`}
      data-band={entry.band}
      data-tone={tone}
      className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm ${TONE_ROW[tone]}`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${entry.title} — ${REASON_LABEL[entry.kind]}`}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="shrink-0 rounded-full border border-current px-2 py-0.5 text-[11px] font-medium">
          {REASON_LABEL[entry.kind]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{entry.title}</span>
          {entry.stats ? (
            <span
              className="block truncate text-[11px] opacity-70"
              data-testid={`attention-stats-${entry.intentId ?? entry.sessionId}`}
            >
              {statsLine(entry.stats)}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[11px] opacity-70">{projectName}</span>
        <span
          className="shrink-0 text-[11px] opacity-70"
          title={new Date(entry.since).toLocaleString()}
        >
          {elapsed(entry.since, now)}
        </span>
      </button>
      {finishedIntent ? (
        confirmDrop ? (
          <InlineConfirm
            question="Drop this intent?"
            confirmLabel="drop"
            cancelLabel="keep"
            onConfirm={() => {
              setConfirmDrop(false);
              close("dropped");
            }}
            onCancel={() => setConfirmDrop(false)}
          />
        ) : (
          <span className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={busy !== undefined}
              data-testid={`attention-confirm-${entry.intentId}`}
              onClick={() => close("done")}
              className="min-h-6 rounded border border-current px-2 py-0.5 text-xs font-medium hover:bg-white/40 disabled:opacity-50 dark:hover:bg-black/20"
            >
              {busy === "done" ? "confirming…" : "Confirm"}
            </button>
            <button
              type="button"
              disabled={busy !== undefined}
              data-testid={`attention-drop-${entry.intentId}`}
              onClick={() => setConfirmDrop(true)}
              className="min-h-6 rounded px-1.5 py-0.5 text-xs opacity-70 hover:opacity-100 disabled:opacity-40"
            >
              {busy === "dropped" ? "dropping…" : "Drop"}
            </button>
          </span>
        )
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project group bands
// ---------------------------------------------------------------------------

function BandHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
      {children}
    </h4>
  );
}

function HistoryBand({ project, now }: { project: ProjectInfo; now: number }) {
  const history = useAppStore((state) => state.history[project.id]);
  const loadHistory = useAppStore((state) => state.loadHistory);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const more = history?.more ?? false;
  // Older pages load as the reader nears the end (dashboard-27); the
  // "older…" button below stays the accessible path.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !more || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (
        entries.some((entry) => entry.isIntersecting) &&
        !useAppStore.getState().history[project.id]?.loading
      ) {
        void loadHistory(project.id, true);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [more, history?.intents.length, project.id, loadHistory]);

  const rows = history?.intents ?? [];
  return (
    <div className="flex flex-col gap-1" data-testid={`history-${project.id}`}>
      <BandHeading>History</BandHeading>
      {rows.length === 0 ? (
        <div className="text-xs text-neutral-400">
          {history?.loading ? "loading…" : "No intent has closed here yet."}
        </div>
      ) : (
        <div className="max-h-40 overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {rows.map(({ intent }) => {
              const dropped = intent.closedAs === "dropped";
              return (
                <li
                  key={intent.id}
                  data-testid={`history-row-${intent.id}`}
                  data-verdict={intent.closedAs}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className={
                      dropped
                        ? "text-neutral-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }
                  >
                    {dropped ? "✕" : "✓"}
                  </span>
                  <span className="sr-only">
                    {dropped ? "dropped" : "done"}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      dropped ? "text-neutral-400 line-through" : ""
                    }`}
                    title={firstLine(intent.text)}
                  >
                    {firstLine(intent.text)}
                  </span>
                  {intent.closedAt !== undefined ? (
                    <span className="shrink-0 text-[11px] text-neutral-400">
                      {elapsed(intent.closedAt, now)}
                    </span>
                  ) : null}
                </li>
              );
            })}
            {more ? (
              <li>
                <div ref={sentinelRef} aria-hidden="true" />
                <button
                  type="button"
                  data-testid={`history-older-${project.id}`}
                  disabled={history?.loading}
                  onClick={() => void loadHistory(project.id, true)}
                  className="min-h-6 text-xs text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-300"
                >
                  {history?.loading ? "loading…" : "older…"}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      )}
    </div>
  );
}

function NowBand({
  project,
  session,
  intents,
  now,
  onOpenSession,
}: {
  project: ProjectInfo;
  session?: SessionInfo;
  intents: DerivedIntent[];
  now: number;
  onOpenSession: (sessionId: string) => void;
}) {
  const view = useAppStore((state) =>
    session ? state.views[session.id] : undefined,
  );
  if (!session) {
    // Quiet when no session is live (dashboard-8/28).
    return (
      <div className="flex flex-col gap-1" data-testid={`now-${project.id}`}>
        <BandHeading>Now</BandHeading>
        <div className="text-xs text-neutral-400">Idle — no live session.</div>
      </div>
    );
  }
  const label = stateLabel(view?.fsmState, {
    pendingQuestion: view?.pendingQuestion !== undefined,
    turnActive: view?.turnActive,
  });
  // The open intent this lane serves: the newest open dispatch into
  // the session owns the conversation (dashboard-28/33).
  const served = intents
    .filter(
      (derived) =>
        derived.intent.dispatched?.sessionId === session.id &&
        (derived.state === "working" || derived.state === "interrupted"),
    )
    .sort(
      (a, b) =>
        (b.intent.dispatched?.at ?? 0) - (a.intent.dispatched?.at ?? 0),
    )[0];
  const bossTurns = view?.captain.filter((line) => line.kind === "boss") ?? [];
  const title = firstLine(
    served?.intent.text ??
      bossTurns[bossTurns.length - 1]?.text ??
      session.title ??
      "no messages yet",
  );
  const playbook = view?.frames[0]?.playbookId;
  return (
    <div className="flex flex-col gap-1" data-testid={`now-${project.id}`}>
      <BandHeading>Now</BandHeading>
      <button
        type="button"
        data-testid={`now-session-${project.id}`}
        onClick={() => onOpenSession(session.id)}
        className="flex min-w-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <RunningMark running={view?.turnActive ?? false} />
        <span className="shrink-0 text-xs text-neutral-500">
          {playbook ?? "no playbook"}
        </span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${TONE_CHIP[label.tone]}`}
          title={view?.fsmState}
        >
          {label.text}
        </span>
        <span className="min-w-0 flex-1 truncate" title={title}>
          {title}
        </span>
        <span className="shrink-0 text-[11px] text-neutral-400">
          {elapsed(session.createdAt, now)}
        </span>
      </button>
    </div>
  );
}

function QueueRow({
  derived,
  index,
  queue,
  isNext,
  highlighted,
  projects,
  recordPath,
  onStart,
  onMove,
  onEdit,
  onDrop,
  onOpenIntent,
  onDragStart,
  onDropOn,
}: {
  derived: DerivedIntent;
  index: number;
  queue: DerivedIntent[];
  isNext: boolean;
  highlighted: boolean;
  projects: ProjectInfo[];
  /** The record path for a record-sourced row, when the tree knows it. */
  recordPath?: string;
  onStart: () => void;
  onMove: (afterIntentId: string | null) => void;
  onEdit: (text: string) => Promise<void>;
  onDrop: () => Promise<void>;
  onOpenIntent: (projectId: string, path: string) => void;
  onDragStart: () => void;
  onDropOn: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [confirmDrop, setConfirmDrop] = useState(false);
  const intent = derived.intent;
  const blocked = derived.blockedBy;
  const blockedForeign =
    blocked && blocked.projectId !== intent.projectId
      ? (projects.find((p) => p.id === blocked.projectId)?.name ??
        blocked.projectId)
      : undefined;

  // Keyboard reorder (dashboard-29): Alt+Arrow moves the focused row.
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (!event.altKey) return;
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      onMove(index >= 2 ? queue[index - 2].intent.id : null);
    } else if (event.key === "ArrowDown" && index < queue.length - 1) {
      event.preventDefault();
      onMove(queue[index + 1].intent.id);
    }
  };

  if (editing !== undefined) {
    return (
      <li className="flex items-center gap-2">
        <input
          // The edit replaces the row the user just acted on, so the
          // caret follows the action (same rationale as InlineConfirm).
          autoFocus
          data-testid={`upnext-edit-${intent.id}`}
          value={editing}
          onChange={(event) => setEditing(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && editing.trim()) {
              void onEdit(editing).then(() => setEditing(undefined));
            } else if (event.key === "Escape") {
              setEditing(undefined);
            }
          }}
          aria-label="Edit intent text"
          className="min-h-6 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </li>
    );
  }

  return (
    <li
      data-testid={`upnext-row-${intent.id}`}
      data-next={isNext ? "true" : undefined}
      data-blocked={blocked ? "true" : undefined}
      data-highlight={highlighted ? "true" : undefined}
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropOn();
      }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      title="Alt+↑/↓ reorders"
      className={`group relative flex min-h-6 items-center gap-2 rounded px-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        highlighted ? "ring-2 ring-brand-400" : ""
      }`}
    >
      <span
        className={`min-w-0 flex-1 truncate ${isNext ? "font-medium" : ""} ${
          blocked ? "text-neutral-400" : ""
        }`}
        title={intent.text}
      >
        {firstLine(intent.text)}
      </span>
      {blocked ? (
        <span
          className="shrink-0 truncate text-[11px] text-neutral-400"
          data-testid={`upnext-blocked-${intent.id}`}
        >
          after {blocked.title}
          {blockedForeign ? ` (${blockedForeign})` : ""}
        </span>
      ) : null}
      {isNext ? (
        <button
          type="button"
          data-testid={`upnext-start-${intent.id}`}
          onClick={onStart}
          className="min-h-6 shrink-0 rounded bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          Start
        </button>
      ) : blocked ? (
        // Disablement earned, not category color (DR-026 §2): the
        // reason rides the control.
        <button
          type="button"
          disabled
          data-testid={`upnext-start-${intent.id}`}
          title={`Blocked — waiting on “${blocked.title}”`}
          className="min-h-6 shrink-0 rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
        >
          Start
        </button>
      ) : null}
      <button
        type="button"
        aria-label={`Actions for ${firstLine(intent.text)}`}
        data-testid={`upnext-menu-${intent.id}`}
        onClick={() => setMenuOpen((current) => !current)}
        className="min-h-6 shrink-0 rounded px-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
      >
        ⋯
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-full z-10 mt-0.5 flex min-w-36 flex-col rounded-md border border-neutral-200 bg-white p-1 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {confirmDrop ? (
            <InlineConfirm
              question="Drop?"
              confirmLabel="drop"
              cancelLabel="keep"
              onConfirm={() => {
                setConfirmDrop(false);
                setMenuOpen(false);
                void onDrop();
              }}
              onCancel={() => setConfirmDrop(false)}
            />
          ) : (
            <>
              <button
                type="button"
                data-testid={`upnext-edit-action-${intent.id}`}
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(intent.text);
                }}
                className="min-h-6 rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Edit text
              </button>
              <button
                type="button"
                data-testid={`upnext-drop-action-${intent.id}`}
                onClick={() => setConfirmDrop(true)}
                className="min-h-6 rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Drop
              </button>
              {intent.source?.url ? (
                <a
                  href={intent.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-6 rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Open source
                </a>
              ) : intent.source?.kind === "record" && recordPath ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenIntent(intent.projectId, recordPath);
                  }}
                  className="min-h-6 rounded px-2 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Open source
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function UpNextBand({
  project,
  queue,
  projects,
  highlightId,
  onStartIntent,
  onOpenIntent,
  onCapture,
}: {
  project: ProjectInfo;
  queue: DerivedIntent[];
  projects: ProjectInfo[];
  highlightId?: string;
  onStartIntent: (intent: IntentInfo) => Promise<void> | void;
  onOpenIntent: (projectId: string, path: string) => void;
  onCapture: (input: {
    projectId: string;
    text: string;
    source?: IntentSource;
  }) => Promise<void>;
}) {
  const moveIntent = useAppStore((state) => state.moveIntent);
  const editIntent = useAppStore((state) => state.editIntent);
  const closeIntent = useAppStore((state) => state.closeIntent);
  const tree = useAppStore((state) => state.specTrees[project.id]);
  const [draft, setDraft] = useState("");
  const dragged = useRef<string | undefined>(undefined);

  const nextId = queue.find((derived) => !derived.blockedBy)?.intent.id;

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    void onCapture({ projectId: project.id, text }).then(() => setDraft(""));
  };

  return (
    <div className="flex flex-col gap-1" data-testid={`upnext-${project.id}`}>
      <BandHeading>Up next</BandHeading>
      {queue.length === 0 ? (
        <div className="text-xs text-neutral-400">
          Nothing queued — add an intent below, or Queue an issue, PR, or
          record from Sources.
        </div>
      ) : null}
      <ul className="flex flex-col gap-0.5">
        {queue.map((derived, index) => (
          <QueueRow
            key={derived.intent.id}
            derived={derived}
            index={index}
            queue={queue}
            isNext={derived.intent.id === nextId}
            highlighted={derived.intent.id === highlightId}
            projects={projects}
            recordPath={
              derived.intent.source?.kind === "record"
                ? tree?.intents.find(
                    (record) => record.id === derived.intent.source?.ref,
                  )?.path
                : undefined
            }
            onStart={() => void onStartIntent(derived.intent)}
            onMove={(afterIntentId) =>
              void moveIntent(derived.intent.id, afterIntentId)
            }
            onEdit={(text) => editIntent(derived.intent.id, text)}
            onDrop={() => closeIntent(derived.intent.id, "dropped")}
            onOpenIntent={onOpenIntent}
            onDragStart={() => {
              dragged.current = derived.intent.id;
            }}
            onDropOn={() => {
              const from = dragged.current;
              dragged.current = undefined;
              if (!from || from === derived.intent.id) return;
              // Dropping lands the dragged row at the target's place:
              // after the row above the target, skipping itself.
              const rest = queue.filter((entry) => entry.intent.id !== from);
              const at = rest.findIndex(
                (entry) => entry.intent.id === derived.intent.id,
              );
              void moveIntent(from, at > 0 ? rest[at - 1].intent.id : null);
            }}
          />
        ))}
      </ul>
      <input
        value={draft}
        data-testid={`add-intent-${project.id}`}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") add();
        }}
        placeholder="Add intent…"
        aria-label={`Add an intent to ${project.name}`}
        className="min-h-6 w-full rounded border border-dashed border-neutral-300 bg-transparent px-2 py-1 text-sm placeholder:text-neutral-400 focus:border-solid focus:border-brand-400 focus:outline-none dark:border-neutral-700"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The surface
// ---------------------------------------------------------------------------

export function DashboardSurface({
  onOpenSession,
  onOpenIntent,
  onStartIntent,
  onNavigate,
}: {
  /** Open a session; with a turnId, land at that turn's place. */
  onOpenSession: (sessionId: string, turnId?: number) => void;
  /** Open an intent record in its project's records reader. */
  onOpenIntent: (projectId: string, path: string) => void;
  /** Stage an intent's dispatch (the App wires this to the store's
   * stageDispatch and switches to the Workspace). */
  onStartIntent: (intent: IntentInfo) => Promise<void> | void;
  /** Optional Workspace navigation for empty-state guidance
   * (dashboard-8); plain copy stands in when the App leaves it
   * unwired. */
  onNavigate?: (surface: "Workspace") => void;
}) {
  const connection = useAppStore((state) => state.connection);
  const projects = useAppStore((state) => state.projects);
  const projectMeta = useAppStore((state) => state.projectMeta);
  const specTrees = useAppStore((state) => state.specTrees);
  const sessions = useAppStore((state) => state.sessions);
  const ledger = useAppStore((state) => state.ledger);
  const ledgerError = useAppStore((state) => state.ledgerError);
  const historyMap = useAppStore((state) => state.history);
  const loadLedger = useAppStore((state) => state.loadLedger);
  const loadHistory = useAppStore((state) => state.loadHistory);
  const loadProjectMeta = useAppStore((state) => state.loadProjectMeta);
  const loadSpecs = useAppStore((state) => state.loadSpecs);
  const queueIntent = useAppStore((state) => state.queueIntent);
  const closeIntent = useAppStore((state) => state.closeIntent);

  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [now, setNow] = useState(() => Date.now());
  const [highlightId, setHighlightId] = useState<string>();
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Keep elapsed labels honest during quiet periods.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  // The one fold, plus each group's inputs, load on demand.
  useEffect(() => {
    if (connection !== "open") return;
    if (!ledger && !ledgerError) void loadLedger();
    for (const project of projects) {
      if (!projectMeta[project.id]) void loadProjectMeta(project.id);
      if (!specTrees[project.id]) void loadSpecs(project.id);
      if (!historyMap[project.id]) void loadHistory(project.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, projects]);

  // Data age for the Sources line (dashboard-14): when this client
  // observed the served forge data. (The read model's own fetch time
  // is not on the wire yet — see the report.)
  const metaSeen = useRef(new Map<string, ProjectMeta>());
  const [fetchedAt, setFetchedAt] = useState<Record<string, number>>({});
  useEffect(() => {
    const updates: Record<string, number> = {};
    for (const project of projects) {
      const meta = projectMeta[project.id];
      if (meta && !meta.loading && metaSeen.current.get(project.id) !== meta) {
        metaSeen.current.set(project.id, meta);
        updates[project.id] = Date.now();
      }
    }
    if (Object.keys(updates).length > 0) {
      setFetchedAt((current) => ({ ...current, ...updates }));
    }
  }, [projectMeta, projects]);

  // Capture reveals the shelf (dashboard-31): the new row lands with
  // a brief highlight where it landed.
  const capture = async (input: {
    projectId: string;
    text: string;
    source?: IntentSource;
  }): Promise<void> => {
    const intent = await queueIntent(input);
    setHighlightId(intent.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(undefined), 2500);
  };

  const filtered =
    projectFilter === "all"
      ? projects
      : projects.filter((project) => project.id === projectFilter);
  const intents = ledger?.intents ?? [];
  const attention = (ledger?.attention ?? []).filter(
    (entry) =>
      projectFilter === "all" || entry.projectId === projectFilter,
  );
  const nextHead = nextUnblockedHead(intents, filtered);
  const projectName = (projectId: string) =>
    projects.find((project) => project.id === projectId)?.name ?? projectId;

  const workspaceLink = (label: string) =>
    onNavigate ? (
      <button
        type="button"
        onClick={() => onNavigate("Workspace")}
        className="text-brand-600 hover:underline dark:text-brand-300"
      >
        {label}
      </button>
    ) : (
      <>{label}</>
    );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 overflow-y-auto p-6">
      {ledgerError ? (
        <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <span className="min-w-0 flex-1 truncate">
            The ledger could not be loaded: {ledgerError}
          </span>
          <button
            type="button"
            onClick={() => void loadLedger()}
            className="shrink-0 rounded border border-current px-2 py-0.5 text-xs"
          >
            retry
          </button>
        </div>
      ) : null}

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">
            Needs attention
          </h2>
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="ml-auto rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            title="Filter by project (visibility only)"
            aria-label="Filter by project"
          >
            <option value="all">all projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2" data-testid="attention-queue">
          {attention.map((entry) => (
            <AttentionRow
              key={`${entry.intentId ?? entry.sessionId}-${entry.kind}`}
              entry={entry}
              projectName={projectName(entry.projectId)}
              now={now}
              onOpen={() => onOpenSession(entry.sessionId, entry.turnId)}
              onClose={(as) =>
                entry.intentId
                  ? closeIntent(entry.intentId, as)
                  : Promise.resolve()
              }
            />
          ))}
          {attention.length === 0 ? (
            <div
              data-testid="attention-all-clear"
              className="flex items-center gap-3 rounded-lg border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-500 dark:border-neutral-700"
            >
              {nextHead ? (
                <>
                  <span className="min-w-0 flex-1 truncate">
                    All clear. Next up:{" "}
                    <span className="font-medium text-neutral-700 dark:text-neutral-200">
                      {firstLine(nextHead.intent.text)}
                    </span>{" "}
                    <span className="text-neutral-400">
                      ({projectName(nextHead.intent.projectId)})
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid="all-clear-start"
                    onClick={() => void onStartIntent(nextHead.intent)}
                    className="min-h-6 shrink-0 rounded bg-brand-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
                  >
                    Start
                  </button>
                </>
              ) : (
                <span className="flex-1 text-center">
                  All clear — nothing waiting, nothing queued to start.
                </span>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-neutral-500">Projects</h2>
        {projects.length === 0 ? (
          <div
            data-testid="projects-empty"
            className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700"
          >
            No projects yet — register a repository in the{" "}
            {workspaceLink("Workspace")} to put its work here.
          </div>
        ) : (
          filtered.map((project) => {
            const session = sessions.find(
              (candidate) =>
                candidate.live && candidate.projectId === project.id,
            );
            const age = fetchedAt[project.id];
            const ageText =
              age !== undefined
                ? elapsed(age, now) === "just now"
                  ? "just now"
                  : `${elapsed(age, now)} ago`
                : undefined;
            return (
              <div
                key={project.id}
                data-testid={`project-group-${project.id}`}
                className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <h3 className="text-sm font-semibold">{project.name}</h3>
                <HistoryBand project={project} now={now} />
                <NowBand
                  project={project}
                  session={session}
                  intents={intents}
                  now={now}
                  onOpenSession={onOpenSession}
                />
                <UpNextBand
                  project={project}
                  queue={queueOf(intents, project.id)}
                  projects={projects}
                  highlightId={highlightId}
                  onStartIntent={onStartIntent}
                  onOpenIntent={onOpenIntent}
                  onCapture={capture}
                />
                <SourcesBand
                  project={project}
                  meta={projectMeta[project.id]}
                  tree={specTrees[project.id]}
                  openSources={openSourceIntents(ledger, project.id)}
                  ageText={ageText}
                  onRefresh={() => void loadProjectMeta(project.id, true)}
                  onQueue={(text, source) =>
                    capture({ projectId: project.id, text, source })
                  }
                  onOpenIntent={onOpenIntent}
                  onNavigateWorkspace={
                    onNavigate ? () => onNavigate("Workspace") : undefined
                  }
                />
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

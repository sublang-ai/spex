// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One project's ledger group (dashboard-26..30, DR-035): History,
// Now, Up next, and Sources, drawn by this one component wherever the
// group appears — the Dashboard lists every project's, the Overview
// tab pins one (projects-4, DR-038, DR-027). Every state here is
// derived; the group writes nothing but Boss acts (queue, move,
// close, remove).

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  ClosedIntent,
  DerivedIntent,
  IntentInfo,
  IntentSource,
  ProjectInfo,
  SessionInfo,
  SpecRecordInfo,
  SpecTreeState,
} from "@sublang/spex-core/protocol";

import { useAppStore, type ProjectMeta } from "../state/store.js";
import { stateLabel, type StatusTone } from "../lib/labels.js";
import { RunningMark } from "./RunningMark.js";
import { SourcesBand } from "./SourcesTabs.js";
import { openSourceIntents } from "./ForgeItemRow.js";

// ---------------------------------------------------------------------------
// Copy and formatting
// ---------------------------------------------------------------------------

export function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0] ?? text;
}

export function elapsed(since: number, now: number): string {
  const minutes = Math.floor((now - since) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

/** A project's queue in served (rank) order. */
export function queueOf(
  intents: DerivedIntent[],
  projectId: string,
): DerivedIntent[] {
  return intents.filter(
    (derived) =>
      derived.intent.projectId === projectId && derived.state === "queued",
  );
}

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

const TAG = "shrink-0 rounded-full px-1.5 py-0.5 text-[11px]";
const NEUTRAL_TAG = `${TAG} bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400`;
/** The band's one red tag (DR-038): a fixed bug, gone. */
const BUG_TAG = `${TAG} bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300`;

const MENU_ITEM =
  "min-h-6 rounded px-2 py-1 text-left hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-neutral-800";

export interface CaptureInput {
  projectId: string;
  text: string;
  source?: IntentSource;
}

// ---------------------------------------------------------------------------
// The group's inputs, shared by every surface that draws one
// ---------------------------------------------------------------------------

/** A slow clock for the elapsed labels: honest during quiet periods,
 * never a re-render storm. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The one fold, plus each group's inputs — meta, specs tree, History
 * first page — load on demand once connected. */
export function useGroupInputs(projects: readonly ProjectInfo[]): void {
  const connection = useAppStore((state) => state.connection);
  const key = projects.map((project) => project.id).join("\n");
  useEffect(() => {
    if (connection !== "open") return;
    const state = useAppStore.getState();
    if (!state.ledger && !state.ledgerError) void state.loadLedger();
    for (const project of projects) {
      if (!state.projectMeta[project.id]) void state.loadProjectMeta(project.id);
      if (!state.specTrees[project.id]) void state.loadSpecs(project.id);
      if (!state.history[project.id]) void state.loadHistory(project.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, key]);
}

/** Data age for the Sources line (dashboard-14): when this client
 * observed the served forge data. (The read model's own fetch time
 * is not on the wire yet — see the report.) */
export function useForgeAge(
  projects: readonly ProjectInfo[],
  now: number,
): (projectId: string) => string | undefined {
  const projectMeta = useAppStore((state) => state.projectMeta);
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
  return (projectId) => {
    const age = fetchedAt[projectId];
    if (age === undefined) return undefined;
    const text = elapsed(age, now);
    return text === "just now" ? text : `${text} ago`;
  };
}

/** Capture reveals the shelf (dashboard-31): the new row lands with
 * a brief highlight where it landed. */
export function useCaptureReveal(): {
  highlightId?: string;
  capture: (input: CaptureInput) => Promise<void>;
} {
  const queueIntent = useAppStore((state) => state.queueIntent);
  const [highlightId, setHighlightId] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const capture = async (input: CaptureInput): Promise<void> => {
    const intent = await queueIntent(input);
    setHighlightId(intent.id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlightId(undefined), 2500);
  };
  return { highlightId, capture };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function BandHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
      {children}
    </h4>
  );
}

export type HistoryRow =
  | { kind: "intent"; id: string; at: number; intent: IntentInfo }
  | { kind: "record"; id: string; at: number; record: SpecRecordInfo };

/** The band's one timeline (dashboard-27, DR-038): the served worked
 * closed intents and the tree's finished records, newest first — a
 * record a closed intent names as its provenance lists once, as that
 * intent. Intents order by close time, records by their file's last
 * change. */
export function historyRows(
  closed: readonly ClosedIntent[],
  records: readonly SpecRecordInfo[],
): HistoryRow[] {
  const named = new Set<string>();
  const rows: HistoryRow[] = [];
  for (const { intent } of closed) {
    if (intent.source?.kind === "record") named.add(intent.source.ref);
    rows.push({
      kind: "intent",
      id: intent.id,
      at: intent.closedAt ?? 0,
      intent,
    });
  }
  for (const record of records) {
    if (!record.finished || named.has(record.id)) continue;
    rows.push({
      kind: "record",
      id: record.id,
      at: record.updatedAt ?? 0,
      record,
    });
  }
  return rows.sort((a, b) => b.at - a.at);
}

/** A fixed bug (DR-038): an intent closed done whose captured source
 * labels carry a bug label — provenance, never a later forge read. */
export function isBugFix(intent: IntentInfo): boolean {
  return (
    intent.closedAs === "done" &&
    (intent.source?.labels ?? []).some((label) => /bug/i.test(label))
  );
}

function Check() {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 text-emerald-700 dark:text-emerald-400"
    >
      ✓
    </span>
  );
}

function Age({ at, now }: { at?: number; now: number }) {
  if (at === undefined) return null;
  return (
    <span className="shrink-0 text-[11px] text-neutral-500">
      {elapsed(at, now)}
    </span>
  );
}

/** The row grammar (dashboard-27): done wears a check; a fixed bug is
 * struck through under the red tag and wears none; work dropped
 * after it ran wears a quiet tag, dimmed, never struck. */
function IntentHistoryRow({
  intent,
  now,
}: {
  intent: IntentInfo;
  now: number;
}) {
  const verdict =
    intent.closedAs === "dropped"
      ? "dropped"
      : isBugFix(intent)
        ? "bug"
        : "done";
  const title = firstLine(intent.text);
  return (
    <li
      data-testid={`history-row-${intent.id}`}
      data-kind="intent"
      data-verdict={verdict}
      className={`flex items-center gap-2 text-sm ${
        verdict === "dropped" ? "text-neutral-500" : ""
      }`}
    >
      {verdict === "done" ? <Check /> : null}
      <span className="sr-only">
        {verdict === "bug" ? "bug fixed" : verdict}
      </span>
      {verdict === "bug" ? (
        <span data-testid="history-tag" className={BUG_TAG}>
          bug
        </span>
      ) : null}
      {verdict === "dropped" ? (
        <span data-testid="history-tag" className={NEUTRAL_TAG}>
          dropped
        </span>
      ) : null}
      <span
        className={`min-w-0 flex-1 truncate ${
          verdict === "bug" ? "line-through" : ""
        }`}
        title={title}
      >
        {title}
      </span>
      <Age at={intent.closedAt} now={now} />
    </li>
  );
}

/** A finished record (dashboard-27): a check under its ID tag, opening
 * in the records reader; a superseded one wears that word as its tag,
 * dimmed, with no check. */
function RecordHistoryRow({
  record,
  now,
  onOpen,
}: {
  record: SpecRecordInfo;
  now: number;
  onOpen: () => void;
}) {
  const superseded = record.finished === "superseded";
  return (
    <li
      data-testid={`history-row-${record.id}`}
      data-kind="record"
      data-verdict={superseded ? "superseded" : "done"}
      className={`flex items-center gap-2 text-sm ${
        superseded ? "text-neutral-500" : ""
      }`}
    >
      {superseded ? null : <Check />}
      <span className="sr-only">{superseded ? "superseded" : "done"}</span>
      <button
        type="button"
        onClick={onOpen}
        title={`${record.id}: ${record.title}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
      >
        <span
          data-testid="history-tag"
          className={superseded ? NEUTRAL_TAG : `${NEUTRAL_TAG} font-mono`}
        >
          {superseded ? "superseded" : record.id}
        </span>
        <span className="min-w-0 flex-1 truncate">{record.title}</span>
      </button>
      <Age at={record.updatedAt} now={now} />
    </li>
  );
}

function HistoryBand({
  project,
  tree,
  now,
  onOpenIntent,
}: {
  project: ProjectInfo;
  tree?: SpecTreeState;
  now: number;
  onOpenIntent: (projectId: string, path: string) => void;
}) {
  const history = useAppStore((state) => state.history[project.id]);
  const loadHistory = useAppStore((state) => state.loadHistory);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const more = history?.more ?? false;
  // Older intent pages load as the reader nears the end
  // (dashboard-27); the "older…" button below stays the accessible
  // path.
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

  const rows = historyRows(history?.intents ?? [], tree?.intents ?? []);
  return (
    <div className="flex flex-col gap-1" data-testid={`history-${project.id}`}>
      <BandHeading>History</BandHeading>
      {rows.length === 0 ? (
        <div className="text-xs text-neutral-500">
          {history?.loading ? "loading…" : "Nothing done here yet."}
        </div>
      ) : (
        <div className="max-h-40 overflow-y-auto">
          <ul className="flex flex-col gap-0.5">
            {rows.map((row) =>
              row.kind === "intent" ? (
                <IntentHistoryRow
                  key={`intent:${row.id}`}
                  intent={row.intent}
                  now={now}
                />
              ) : (
                <RecordHistoryRow
                  key={`record:${row.id}`}
                  record={row.record}
                  now={now}
                  onOpen={() => onOpenIntent(project.id, row.record.path)}
                />
              ),
            )}
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

// ---------------------------------------------------------------------------
// Now
// ---------------------------------------------------------------------------

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
        <div className="text-xs text-neutral-500">Idle — no live session.</div>
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
        <span className="shrink-0 text-[11px] text-neutral-500">
          {elapsed(session.createdAt, now)}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Up next
// ---------------------------------------------------------------------------

/** The provenance action, named after what it opens (dashboard-29,
 * DR-038): an issue or PR page, the record, or the capturing session. */
function ProvenanceAction({
  intent,
  recordPath,
  sessionKnown,
  onOpenIntent,
  onOpenSession,
  onDone,
}: {
  intent: IntentInfo;
  recordPath?: string;
  sessionKnown: boolean;
  onOpenIntent: (projectId: string, path: string) => void;
  onOpenSession: (sessionId: string) => void;
  onDone: () => void;
}) {
  const source = intent.source;
  if (!source) return null;
  const testId = `upnext-source-${intent.id}`;
  if (source.kind === "issue" || source.kind === "pr") {
    if (!source.url) return null;
    return (
      <a
        href={source.url}
        target="_blank"
        rel="noreferrer"
        data-testid={testId}
        onClick={onDone}
        className={MENU_ITEM}
      >
        {source.kind === "issue" ? "Issue" : "PR"} #{source.ref} ↗
      </a>
    );
  }
  if (source.kind === "record") {
    return (
      <button
        type="button"
        data-testid={testId}
        disabled={!recordPath}
        title={
          recordPath
            ? "Open the record in Specs"
            : "This record is not in the project's specs tree"
        }
        onClick={() => {
          onDone();
          if (recordPath) onOpenIntent(intent.projectId, recordPath);
        }}
        className={MENU_ITEM}
      >
        {source.ref}
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={!sessionKnown}
      title={
        sessionKnown
          ? "Open the session this was captured from"
          : "The capturing session is gone"
      }
      onClick={() => {
        onDone();
        onOpenSession(source.ref);
      }}
      className={MENU_ITEM}
    >
      Session
    </button>
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
  sessionKnown,
  onStart,
  onMove,
  onEdit,
  onRemove,
  onOpenIntent,
  onOpenSession,
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
  /** Whether a chat-sourced row's capturing session still exists. */
  sessionKnown: boolean;
  onStart: () => void;
  onMove: (afterIntentId: string | null) => void;
  onEdit: (text: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onOpenIntent: (projectId: string, path: string) => void;
  onOpenSession: (sessionId: string) => void;
  onDragStart: () => void;
  onDropOn: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<string>();
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
          blocked ? "text-neutral-500" : ""
        }`}
        title={intent.text}
      >
        {firstLine(intent.text)}
      </span>
      {blocked ? (
        <span
          className="shrink-0 truncate text-[11px] text-neutral-500"
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
          className="min-h-6 shrink-0 rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500"
        >
          Start
        </button>
      ) : null}
      <button
        type="button"
        aria-label={`Actions for ${firstLine(intent.text)}`}
        data-testid={`upnext-menu-${intent.id}`}
        onClick={() => setMenuOpen((current) => !current)}
        className="min-h-6 shrink-0 rounded px-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
      >
        ⋯
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-full z-10 mt-0.5 flex min-w-36 flex-col rounded-md border border-neutral-200 bg-white p-1 text-xs shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            data-testid={`upnext-edit-action-${intent.id}`}
            onClick={() => {
              setMenuOpen(false);
              setEditing(intent.text);
            }}
            className={MENU_ITEM}
          >
            Edit text
          </button>
          <button
            type="button"
            data-testid={`upnext-remove-action-${intent.id}`}
            // Remove acts on the click (dashboard-29, DR-038): no
            // confirmation, no history — a mistaken removal costs one
            // retyped line.
            onClick={() => {
              setMenuOpen(false);
              void onRemove();
            }}
            className={MENU_ITEM}
          >
            Remove
          </button>
          <ProvenanceAction
            intent={intent}
            recordPath={recordPath}
            sessionKnown={sessionKnown}
            onOpenIntent={onOpenIntent}
            onOpenSession={onOpenSession}
            onDone={() => setMenuOpen(false)}
          />
        </div>
      ) : null}
    </li>
  );
}

function UpNextBand({
  project,
  queue,
  projects,
  sessions,
  tree,
  highlightId,
  onStartIntent,
  onOpenIntent,
  onOpenSession,
  onCapture,
}: {
  project: ProjectInfo;
  queue: DerivedIntent[];
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  tree?: SpecTreeState;
  highlightId?: string;
  onStartIntent: (intent: IntentInfo) => Promise<void> | void;
  onOpenIntent: (projectId: string, path: string) => void;
  onOpenSession: (sessionId: string) => void;
  onCapture: (input: CaptureInput) => Promise<void>;
}) {
  const moveIntent = useAppStore((state) => state.moveIntent);
  const editIntent = useAppStore((state) => state.editIntent);
  const closeIntent = useAppStore((state) => state.closeIntent);
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
        <div className="text-xs text-neutral-500">
          Nothing queued — add an intent below, or Queue an issue, PR, or
          record from Sources.
        </div>
      ) : null}
      <ul className="flex flex-col gap-0.5">
        {queue.map((derived, index) => {
          const source = derived.intent.source;
          return (
            <QueueRow
              key={derived.intent.id}
              derived={derived}
              index={index}
              queue={queue}
              isNext={derived.intent.id === nextId}
              highlighted={derived.intent.id === highlightId}
              projects={projects}
              recordPath={
                source?.kind === "record"
                  ? tree?.intents.find((record) => record.id === source.ref)
                      ?.path
                  : undefined
              }
              sessionKnown={
                source?.kind === "chat" &&
                sessions.some((session) => session.id === source.ref)
              }
              onStart={() => void onStartIntent(derived.intent)}
              onMove={(afterIntentId) =>
                void moveIntent(derived.intent.id, afterIntentId)
              }
              onEdit={(text) => editIntent(derived.intent.id, text)}
              // A queued intent has never run, so the core's drop leaves
              // no trace (core-service-46): the row's Remove.
              onRemove={() => closeIntent(derived.intent.id, "dropped")}
              onOpenIntent={onOpenIntent}
              onOpenSession={onOpenSession}
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
          );
        })}
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
        className="min-h-6 w-full rounded border border-dashed border-neutral-300 bg-transparent px-2 py-1 text-sm placeholder:text-neutral-500 focus:border-solid focus:border-brand-400 focus:outline-none dark:border-neutral-700"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The group
// ---------------------------------------------------------------------------

export interface ProjectGroupProps {
  project: ProjectInfo;
  now: number;
  /** Age of the served forge data, e.g. "3m ago" (dashboard-14). */
  ageText?: string;
  /** The just-captured row to reveal (dashboard-31). */
  highlightId?: string;
  /** The Dashboard names each group; the Overview's header already
   * does, so it draws the group bare (projects-4). */
  heading?: boolean;
  /** Open a session; with a turnId, land at that turn's place. */
  onOpenSession: (sessionId: string, turnId?: number) => void;
  /** Open an intent record in its project's records reader. */
  onOpenIntent: (projectId: string, path: string) => void;
  /** Stage an intent's dispatch (run-view-86). */
  onStartIntent: (intent: IntentInfo) => Promise<void> | void;
  onCapture: (input: CaptureInput) => Promise<void>;
  /** Navigation to the project's Overview tab, where the repository
   * header shows the GitHub binding (dashboard-8); absent on the
   * Overview itself. */
  onOpenOverview?: () => void;
}

export function ProjectGroup({
  project,
  now,
  ageText,
  highlightId,
  heading = true,
  onOpenSession,
  onOpenIntent,
  onStartIntent,
  onCapture,
  onOpenOverview,
}: ProjectGroupProps) {
  const projects = useAppStore((state) => state.projects);
  const sessions = useAppStore((state) => state.sessions);
  const ledger = useAppStore((state) => state.ledger);
  const meta = useAppStore((state) => state.projectMeta[project.id]);
  const tree = useAppStore((state) => state.specTrees[project.id]);
  const loadProjectMeta = useAppStore((state) => state.loadProjectMeta);
  const intents = ledger?.intents ?? [];
  const session = sessions.find(
    (candidate) => candidate.live && candidate.projectId === project.id,
  );
  return (
    <div
      data-testid={`project-group-${project.id}`}
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {heading ? <h3 className="text-sm font-semibold">{project.name}</h3> : null}
      <HistoryBand
        project={project}
        tree={tree}
        now={now}
        onOpenIntent={onOpenIntent}
      />
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
        sessions={sessions}
        tree={tree}
        highlightId={highlightId}
        onStartIntent={onStartIntent}
        onOpenIntent={onOpenIntent}
        onOpenSession={onOpenSession}
        onCapture={onCapture}
      />
      <SourcesBand
        project={project}
        meta={meta}
        tree={tree}
        openSources={openSourceIntents(ledger, project.id)}
        ageText={ageText}
        onRefresh={() => void loadProjectMeta(project.id, true)}
        onQueue={(text, source) =>
          onCapture({ projectId: project.id, text, source })
        }
        onOpenIntent={onOpenIntent}
        onOpenOverview={onOpenOverview}
      />
    </div>
  );
}

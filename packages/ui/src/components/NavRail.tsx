// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The sidebar (DR-029, DR-030): the navigator. Surface entries around
// a Projects section — the internal name stays Workspace (DR-057) —
// listing every project and its sessions, so what
// exists is always on screen while the tabs hold only what is open.
// Two widgets, not one — a navigation list for the surfaces and one
// ARIA tree for the projects — because "current surface" and
// "selected session" are different words (run-view-67). Where any seat
// is open, the tree lists each place's projects under a heading naming
// the place, this computer's first, the heading a row of its own that
// shows its place on the Projects surface (run-view-168).

import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProjectInfo, SessionInfo } from "@sublang/spex-core/protocol";

import {
  ATTENTION_MARK_CLASS,
  ATTENTION_RANK,
  PROJECT_ATTENTION_WORDS,
  type AttentionItem,
} from "../state/dashboard.js";
import { useEachPlace } from "../state/place-context.js";
import { LOCAL_PLACE_KEY } from "../state/store.js";
import { i18n } from "../i18n.js";
import { isHistory } from "../lib/sessions.js";
import { keyLabel } from "../lib/shortcuts.js";
import { absoluteTitle, compactAge, relativeAge } from "../lib/time.js";
import { Icon, type IconName } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import logo from "../assets/spex-logo.svg";

/** Sessions listed per project before the reveal-the-rest control
 * (run-view-67); the idle window only — a working session always shows. */
const RECENT_WINDOW = 5;

export type Surface =
  | "Dashboard"
  | "Workspace"
  | "Playbooks"
  | "Space"
  | "Settings";

/** The sidebar's order; Cmd/Ctrl+1..5 walk it (run-view-49). */
export const SURFACES: readonly Surface[] = [
  "Dashboard",
  "Workspace",
  "Playbooks",
  "Space",
  "Settings",
];

/** What each surface is called on screen (DR-057, DR-103): the
 * Workspace reads "Projects" and Space reads "Groups" while every
 * identifier and state key keeps the internal name, so nothing stored
 * — the remembered surface among it — changes shape. Each label is a
 * thunk, never a string: a table read at module load would freeze the
 * language the module was imported in (localization-4). */
export const SURFACE_LABELS: Record<Surface, () => string> = {
  Dashboard: () => i18n._("Dashboard"),
  Workspace: () => i18n._("Projects"),
  Playbooks: () => i18n._("Playbooks"),
  Space: () => i18n._({ id: "Groups", comment: "the surface: your groups on the Git host and their spex repositories" }),
  Settings: () => i18n._("Settings"),
};

// The interaction hue's tinted fill is a hue shift, not a luminance
// one — measured at 1.01:1 against the rail in dark. So "active" is
// carried by a brand-500 edge (>=3:1 in both themes) alongside the
// fill and the weight, and survives greyscale (DR-026 §3, DR-010 §8).
const ACTIVE =
  "border-l-2 border-brand-500 bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300";
const INACTIVE =
  "border-l-2 border-transparent text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800";

const SURFACE_ICONS: Record<Surface, IconName> = {
  Dashboard: "grid",
  Workspace: "folder",
  Playbooks: "book",
  Space: "people",
  Settings: "gear",
};

/** One place's projects in the tree (run-view-67, run-view-168): its
 * core's own state, and acts taken at that core. */
export interface NavPlace {
  /** The place's key: "local", or a seat's. */
  key: string;
  /** What the place is shown by: "This computer", or the server's name. */
  label: string;
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  /** Non-idle attention by session id, the same derivation the badge
   * and the tab dots use (run-view-73). */
  attention: Map<string, AttentionItem>;
  /** The place's current project, which starts disclosed. */
  currentProjectId?: string;
  /** The session whose tab is showing at this place, if any. */
  activeSessionId?: string;
  /** Whether the Projects surface shows this place: only then is its
   * current project's row the selected one. */
  shown: boolean;
  /** Show this place on the Projects surface — its current project's
   * view, or its welcome page where it holds no project (run-view-168). */
  onShow(): void;
  /** Explicit disclosure; a project with no entry follows current. */
  expanded: Record<string, boolean>;
  onExpanded(projectId: string, expanded: boolean): void;
  onPickProject(projectId: string): void;
  onActivateSession(sessionId: string): void;
  onNewSession(projectId: string): void;
  /** Delete an idle session this core owns (DR-038); rejects with
   * the core's reason, which the row shows. */
  onDeleteSession(sessionId: string): Promise<void>;
}

export interface NavRailProps {
  surface: Surface;
  onSurface(surface: Surface): void;
  /** Cross-project attention count, every place's; rides the
   * Dashboard entry. */
  attentionCount: number;
  collapsed: boolean;
  onCollapsed(collapsed: boolean): void;
  /** Every place, this computer's first (run-view-168). */
  places: NavPlace[];
  onAddProject(): void;
  /** Config status / playbook count, the foot's other tenant. */
  foot?: ReactNode;
}

type Life = "question" | "failure" | "finish" | "review" | "running" | "idle-failed" | "idle" | "history" | "external-active" | "external-unknown";

/** Attention first, life second (run-view-73): the row says "answer
 * me" before it says "I am alive". The runtime is held only for a
 * turn (DR-051), so running means a turn in flight and everything
 * else is idle — or history, where the core cannot continue it. */
function lifeOf(session: SessionInfo, item: AttentionItem | undefined): Life {
  if (session.externalWriter) return session.externalWriter === "active" ? "external-active" : "external-unknown";
  if (item) return item.kind;
  if (session.live) return "running";
  if (isHistory(session)) return "history";
  return session.failed ? "idle-failed" : "idle";
}

/** Each phrase is a thunk, never a string: a table read at module load
 * would freeze the language it was imported in (localization-4). */
const LIFE_WORDS: Record<Life, () => string> = {
  question: () =>
    i18n._({
      id: "waiting for your reply",
      comment: "session row: the run parked on a question",
    }),
  failure: () => i18n._({ id: "failed", comment: "a piece of work's state: it failed" }),
  finish: () =>
    i18n._({
      id: "waiting for your verdict",
      comment: "session row: work delivered, a verdict is owed",
    }),
  review: () =>
    i18n._({ id: "unread turn", comment: "session row: a turn nobody has read" }),
  running: () =>
    i18n._({ id: "running", comment: "session row: a turn is in flight" }),
  "idle-failed": () => i18n._("idle, held a failure"),
  idle: () =>
    i18n._({ id: "idle", comment: "session row: no turn in flight" }),
  history: () => i18n._("history, can't be continued"),
  "external-active": () => i18n._("in use elsewhere"),
  "external-unknown": () => i18n._("ownership unknown"),
};

// A failure that summons is filled red; one still standing that
// summons nothing is history (hollow), and counts toward no badge. The
// core says whether it stands (core-service-32): a failure a later
// turn settled past no longer does.
const LIFE_MARKS: Record<Life, string> = {
  question: ATTENTION_MARK_CLASS.question,
  failure: ATTENTION_MARK_CLASS.failure,
  finish: ATTENTION_MARK_CLASS.finish,
  review: ATTENTION_MARK_CLASS.review,
  running: "bg-emerald-500",
  "idle-failed": "border-2 border-red-500",
  idle: "border-2 border-neutral-500",
  history: "border-2 border-neutral-300 dark:border-neutral-600",
  "external-active": "bg-emerald-500",
  "external-unknown": "border-2 border-neutral-500",
};

function sessionLabel(
  session: SessionInfo,
  life: Life,
  now: number,
  item: AttentionItem | undefined,
): string {
  const title = session.title ?? i18n._("no messages yet");
  const when = session.endedAt ?? session.createdAt;
  const turns = i18n._("{count, plural, one {# turn} other {# turns}}", {
    count: session.turns,
  });
  const life_ = LIFE_WORDS[life]();
  const age = relativeAge(when, now);
  // One whole accessible name per case, so no text is assembled from
  // fragments (localization-4).
  return item?.text
    ? i18n._("{title} — {life}, {age}, {turns} — {detail}", {
        title,
        life: life_,
        age,
        turns,
        detail: item.text,
      })
    : i18n._("{title} — {life}, {age}, {turns}", {
        title,
        life: life_,
        age,
        turns,
      });
}

/** The project row's accessible name: one whole name per attention
 * kind, never the row's own words glued to a shared clause
 * (localization-4). */
function projectRowName(
  name: string,
  worst: AttentionItem["kind"] | undefined,
): string {
  switch (worst) {
    case "failure":
      return i18n._("{name}, a session failed", { name });
    case "question":
      return i18n._("{name}, a session is waiting for your reply", { name });
    case "finish":
      return i18n._("{name}, a session is waiting for your verdict", { name });
    case "review":
      return i18n._("{name}, a session has an unread turn", { name });
    default:
      return name;
  }
}

interface Row {
  key: string;
  kind: "place" | "project" | "session" | "action";
  /** The place the row stands at. */
  place: NavPlace;
  /** The key of the project row this row belongs to; a place's
   * heading row is its own. */
  projectRow: string;
  projectId: string;
  /** What type-ahead matches: a place's name, a project's name or a
   * session's title. */
  label: string;
  activate(): void;
}

/** The key of a place's heading row (run-view-168). */
function headingRowOf(place: NavPlace): string {
  return `h:${place.key}`;
}

/** A place's key for one of its rows (run-view-168): the local place's
 * is the row's own, so this computer's rows read as they always have;
 * a seat's is qualified by its place, since one repository cloned at
 * two places has one project id at both. */
function placed(place: NavPlace, key: string): string {
  return place.key === LOCAL_PLACE_KEY ? key : `${key}@${place.key}`;
}

type Buckets = Map<string, { live: SessionInfo[]; idle: SessionInfo[] }>;

export function NavRail(props: NavRailProps) {
  const { surface, onSurface, attentionCount, collapsed, onCollapsed, places } = props;
  // Keyed by each row's placed key (run-view-168): a project or a
  // session at two places keeps two of each.
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [focusKey, setFocusKey] = useState<string>();
  // A delete confirm names an unsent draft it would take (DR-010 §4),
  // read from the session's own place.
  const composers = useEachPlace((state) => state.composers);
  const draftOf = (place: NavPlace, sessionId: string): string | undefined =>
    composers.find((entry) => entry.store.place.key === place.key)?.value[sessionId]?.draft;
  // Deletion is destructive and irreversible, so it keeps one inline
  // confirmation at the row (DR-038, DR-010 §4).
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const treeRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  // One clock per render keeps every row's age consistent.
  const now = Date.now();
  // A heading per place where any seat is open (run-view-67).
  const headed = places.length > 1;

  const isExpanded = (place: NavPlace, projectId: string): boolean =>
    place.expanded[projectId] ?? projectId === place.currentProjectId;

  // A working session first, then the rest by last activity
  // (run-view-67): the recent window applies to the idle ones only.
  // Each place's sessions bucket under that place's projects alone.
  const byPlace = useMemo(() => {
    const result = new Map<string, { buckets: Buckets; worst: Map<string, AttentionItem["kind"]> }>();
    for (const place of places) {
      const buckets: Buckets = new Map();
      for (const project of place.projects) buckets.set(project.id, { live: [], idle: [] });
      for (const session of place.sessions) {
        const bucket = buckets.get(session.projectId);
        if (!bucket) continue;
        if (session.live || session.externalWriter) bucket.live.push(session);
        else bucket.idle.push(session);
      }
      for (const bucket of buckets.values()) {
        bucket.live.sort((a, b) => b.createdAt - a.createdAt);
        bucket.idle.sort((a, b) => (b.endedAt ?? b.createdAt) - (a.endedAt ?? a.createdAt));
      }
      const worst = new Map<string, AttentionItem["kind"]>();
      for (const session of place.sessions) {
        const item = place.attention.get(session.id);
        if (!item) continue;
        const prior = worst.get(session.projectId);
        if (!prior || ATTENTION_RANK[item.kind] < ATTENTION_RANK[prior]) {
          worst.set(session.projectId, item.kind);
        }
      }
      result.set(place.key, { buckets, worst });
    }
    return result;
  }, [places]);
  const bucketOf = (place: NavPlace, projectId: string) =>
    byPlace.get(place.key)?.buckets.get(projectId) ?? { live: [], idle: [] };

  // The rows the tree can reach right now, in visual order — the one
  // list arrow keys, Home/End and type-ahead all walk, across places.
  const rows: Row[] = [];
  for (const place of places) {
    // A place's heading is a row too (run-view-168): the way to a place
    // holding no project is its heading alone.
    if (headed) {
      const key = headingRowOf(place);
      rows.push({
        key,
        kind: "place",
        place,
        projectRow: key,
        projectId: "",
        label: place.label,
        activate: () => place.onShow(),
      });
    }
    for (const project of place.projects) {
      const projectRow = placed(place, `p:${project.id}`);
      const projectKey = placed(place, project.id);
      rows.push({
        key: projectRow,
        kind: "project",
        place,
        projectRow,
        projectId: project.id,
        label: project.name,
        activate: () => place.onPickProject(project.id),
      });
      if (!isExpanded(place, project.id)) continue;
      const bucket = bucketOf(place, project.id);
      const ended = showAll[projectKey] ? bucket.idle : bucket.idle.slice(0, RECENT_WINDOW);
      for (const session of [...bucket.live, ...ended]) {
        rows.push({
          key: placed(place, `s:${session.id}`),
          kind: "session",
          place,
          projectRow,
          projectId: project.id,
          label: session.title ?? "",
          activate: () => place.onActivateSession(session.id),
        });
      }
      if (!showAll[projectKey] && bucket.idle.length > RECENT_WINDOW) {
        rows.push({
          key: placed(place, `m:${project.id}`),
          kind: "action",
          place,
          projectRow,
          projectId: project.id,
          label: "",
          activate: () => setShowAll((current) => ({ ...current, [projectKey]: true })),
        });
      }
      rows.push({
        key: placed(place, `n:${project.id}`),
        kind: "action",
        place,
        projectRow,
        projectId: project.id,
        label: "",
        activate: () => place.onNewSession(project.id),
      });
    }
  }
  const focused = rows.some((row) => row.key === focusKey)
    ? focusKey
    : rows[0]?.key;

  function moveFocus(key: string): void {
    setFocusKey(key);
    // Row keys carry ids, not CSS identifiers: find by value rather
    // than build a selector out of one.
    const rowElements = treeRef.current?.querySelectorAll<HTMLElement>("[data-row]");
    for (const element of rowElements ?? []) {
      if (element.dataset.row === key) {
        element.focus();
        return;
      }
    }
  }

  function onTreeKeyDown(event: React.KeyboardEvent): void {
    // The focused row comes from the event, not from state: a burst of
    // keys must not all navigate from the same stale place.
    const from =
      (event.target as HTMLElement | null)?.dataset?.row ?? focused;
    const index = rows.findIndex((row) => row.key === from);
    if (index < 0) return;
    const row = rows[index];
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus(rows[Math.min(index + 1, rows.length - 1)].key);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(rows[Math.max(index - 1, 0)].key);
        return;
      case "Home":
        event.preventDefault();
        moveFocus(rows[0].key);
        return;
      case "End":
        event.preventDefault();
        moveFocus(rows[rows.length - 1].key);
        return;
      case "ArrowRight":
        if (row.kind === "project") {
          event.preventDefault();
          if (!isExpanded(row.place, row.projectId)) row.place.onExpanded(row.projectId, true);
          else if (rows[index + 1]) moveFocus(rows[index + 1].key);
        }
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (row.kind === "project" && isExpanded(row.place, row.projectId)) {
          row.place.onExpanded(row.projectId, false);
        } else {
          moveFocus(row.projectRow);
        }
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        row.activate();
        return;
      default:
        break;
    }
    // APG type-ahead: reaching a session by its own first words is
    // the whole point of titling the rows.
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey) return;
    const at = Date.now();
    const text =
      (at - typeahead.current.at < 800 ? typeahead.current.text : "") +
      event.key.toLowerCase();
    typeahead.current = { text, at };
    const order = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
    const hit = order.find((candidate) =>
      candidate.label.toLowerCase().startsWith(text),
    );
    if (hit) {
      event.preventDefault();
      moveFocus(hit.key);
    }
  }

  /** Delete a session at its own place; its row's state is kept by
   * its placed key. */
  function deleteSession(place: NavPlace, sessionId: string): void {
    const key = placed(place, sessionId);
    setConfirmDelete(undefined);
    setDeleting((current) => ({ ...current, [key]: true }));
    setDeleteErrors(({ [key]: _, ...rest }) => rest);
    void place
      .onDeleteSession(sessionId)
      .catch((cause: Error) =>
        setDeleteErrors((current) => ({
          ...current,
          [key]: cause.message || i18n._("delete failed"),
        })),
      )
      .finally(() =>
        setDeleting(({ [key]: _, ...rest }) => rest),
      );
  }

  /** The row's own controls: a click or key inside them never
   * activates or navigates the row. */
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  const surfaceEntry = (name: Surface) => {
    const active = surface === name;
    const badge = name === "Dashboard" && attentionCount > 0;
    const label = SURFACE_LABELS[name]();
    return (
      <button
        key={name}
        type="button"
        // The entry is found by which surface it is, never by what it
        // says: an accessible name is a text (localization-4).
        data-surface={name}
        onClick={() => onSurface(name)}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        aria-label={
          badge
            ? i18n._(
                "{label} — {count, plural, one {# needs your attention} other {# need your attention}}",
                { label, count: attentionCount },
              )
            : label
        }
        className={`relative flex items-center gap-2 rounded-md py-1.5 pr-2.5 pl-2 text-left text-sm ${
          collapsed ? "justify-center" : ""
        } ${active ? ACTIVE : INACTIVE}`}
      >
        <Icon name={SURFACE_ICONS[name]} className="h-4 w-4 shrink-0" />
        {collapsed ? null : <span className="min-w-0 flex-1">{label}</span>}
        {badge ? (
          <span
            data-testid="nav-attention-badge"
            aria-hidden
            title={i18n._(
              "{count, plural, one {# needs your attention} other {# need your attention}}",
              { count: attentionCount },
            )}
            className={`rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-200 ${
              // Positioned at the entry's corner, beside the glyph,
              // never over it (run-view-108).
              collapsed
                ? "absolute -top-1 right-0 px-1 py-0 text-xs leading-4"
                : ""
            }`}
          >
            {/* The count prints "9+" past nine; the exact count rides
                the entry's accessible name and tooltip (run-view-108). */}
            {attentionCount > 9 ? "9+" : attentionCount}
          </span>
        ) : null}
      </button>
    );
  };

  // Selection says where the reader is, so it follows the surface
  // (run-view-67): off Projects the surface's own entry is the only
  // current place, and the remembered project lights again when
  // Projects comes back.
  // Of the places, only the one the surface shows has a selected row.
  const inWorkspace = surface === "Workspace";
  const selectedProjectOf = (place: NavPlace): string | undefined =>
    inWorkspace && place.shown ? place.currentProjectId : undefined;
  const shownSessionOf = (place: NavPlace): string | undefined =>
    inWorkspace && place.shown ? place.activeSessionId : undefined;

  /** One selection voice: the active row wears the interaction hue,
   * the treatment the surface entries already use (run-view-73). */
  function rowClass(active: boolean): string {
    return `flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-1.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
      active ? ACTIVE : INACTIVE
    }`;
  }

  // The add control keeps its icon-only form across the fold
  // (DR-030): collapse never hides the way to add a project.
  const paletteControl = (
    <button
      type="button"
      data-testid="sidebar-palette"
      onClick={props.onAddProject}
      title={i18n._("Add a local project")}
      aria-label={i18n._("Add a local project")}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 ${
        collapsed ? "self-center" : "-my-0.5"
      }`}
    >
      <Icon name="plus" className="h-3.5 w-3.5" />
    </button>
  );

  /** One project node and, disclosed, its sessions — every row's key
   * and test id placed (run-view-168), this computer's as they were. */
  const projectNode = (place: NavPlace, project: ProjectInfo) => {
    const open = isExpanded(place, project.id);
    const bucket = bucketOf(place, project.id);
    const worst = byPlace.get(place.key)?.worst.get(project.id);
    const projectKey = placed(place, project.id);
    const listed = showAll[projectKey]
      ? bucket.idle
      : bucket.idle.slice(0, RECENT_WINDOW);
    const hidden = bucket.idle.length - listed.length;
    const selectedProjectId = selectedProjectOf(place);
    const shownSessionId = shownSessionOf(place);
    const projectRow = placed(place, `p:${project.id}`);
    return (
      <div key={projectKey} className="flex flex-col">
        <div
          role="treeitem"
          aria-expanded={open}
          aria-selected={project.id === selectedProjectId}
          data-row={projectRow}
          data-testid={placed(place, `sidebar-project-${project.id}`)}
          tabIndex={focused === projectRow ? 0 : -1}
          onFocus={() => setFocusKey(projectRow)}
          onClick={() => place.onPickProject(project.id)}
          title={
            worst
              ? i18n._("{path} — needs you", { path: project.path })
              : project.path
          }
          aria-label={projectRowName(project.name, worst)}
          className={`${rowClass(
            project.id === selectedProjectId && !shownSessionId,
          )} pl-0.5`}
        >
          <button
            type="button"
            tabIndex={-1}
            data-testid={placed(place, `sidebar-disclose-${project.id}`)}
            aria-label={
              open
                ? i18n._("Hide sessions in {project}", {
                    project: project.name,
                  })
                : i18n._("Show sessions in {project}", {
                    project: project.name,
                  })
            }
            onClick={(event) => {
              // Disclosure is its own axis (DR-027): opening a
              // project never moves the workspace into it.
              event.stopPropagation();
              place.onExpanded(project.id, !open);
            }}
            // A 24px target inside a shorter row: the negative
            // margins keep the row's height (DR-010 §7).
            className="-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <Icon
              name={open ? "caretDown" : "caretRight"}
              className="h-3.5 w-3.5"
            />
          </button>
          <Icon name="folder" className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
          {worst ? (
            <span
              data-testid={placed(place, `sidebar-project-attention-${project.id}`)}
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${ATTENTION_MARK_CLASS[worst]}`}
              title={PROJECT_ATTENTION_WORDS[worst]()}
            />
          ) : null}
        </div>
        {open ? (
          <div role="group" className="flex flex-col">
            {[...bucket.live, ...listed].map((session) => {
              const item = place.attention.get(session.id);
              const life = lifeOf(session, item);
              const active = session.id === shownSessionId;
              // External ownership must be known idle before deletion.
              const deletable = !session.live && !session.externalWriter;
              const sessionKey = placed(place, session.id);
              const sessionRow = placed(place, `s:${session.id}`);
              const confirming = deletable && confirmDelete === sessionKey;
              const draft = draftOf(place, session.id)?.trim();
              return (
                <div
                  key={session.id}
                  role="treeitem"
                  aria-selected={active}
                  data-row={sessionRow}
                  data-testid={placed(place, `sidebar-session-${session.id}`)}
                  tabIndex={focused === sessionRow ? 0 : -1}
                  onFocus={() => setFocusKey(sessionRow)}
                  onClick={() => place.onActivateSession(session.id)}
                  aria-label={sessionLabel(session, life, now, item)}
                  title={sessionLabel(session, life, now, item)}
                  className={`${rowClass(active)} group pl-6`}
                >
                  <span
                    aria-hidden
                    data-testid={placed(place, `sidebar-mark-${session.id}`)}
                    data-life={life}
                    className={`h-2 w-2 shrink-0 rounded-full ${LIFE_MARKS[life]}`}
                  />
                  {confirming ? (
                    <span
                      data-testid={placed(place, `sidebar-delete-confirm-${session.id}`)}
                      onClick={stop}
                      onKeyDown={stop}
                      className="min-w-0 flex-1"
                    >
                      <InlineConfirm
                        // One whole question per case (localization-4):
                        // where it ran, and whether an unsent draft
                        // goes with it.
                        question={
                          session.foreign
                            ? draft
                              ? i18n._(
                                  "Delete this session? It was run from the terminal; its history goes too. Its unsent draft goes with it.",
                                )
                              : i18n._(
                                  "Delete this session? It was run from the terminal; its history goes too.",
                                )
                            : draft
                              ? i18n._(
                                  "Delete this session and its transcript? Its unsent draft goes with it.",
                                )
                              : i18n._(
                                  "Delete this session and its transcript?",
                                )
                        }
                        confirmLabel={i18n._({
                          id: "Delete",
                          comment: "confirm: delete this session for good",
                        })}
                        cancelLabel={i18n._({
                          id: "Keep",
                          comment:
                            "cancel a destructive confirm: leave things as they are",
                        })}
                        onConfirm={() => deleteSession(place, session.id)}
                        onCancel={() => setConfirmDelete(undefined)}
                      />
                    </span>
                  ) : (
                    <>
                      <span
                        className={`min-w-0 flex-1 truncate ${
                          session.title
                            ? ""
                            : "italic text-neutral-500 dark:text-neutral-400"
                        }`}
                      >
                        {session.title ?? i18n._("no messages yet")}
                      </span>
                      {deleteErrors[sessionKey] ? (
                        <span
                          data-testid={placed(place, `sidebar-delete-error-${session.id}`)}
                          title={deleteErrors[sessionKey]}
                          className="shrink-0 truncate text-xs text-red-600 dark:text-red-400"
                        >
                          {i18n._("not deleted")}
                        </span>
                      ) : (
                        // The one time vocabulary (run-view-73): a
                        // compact age with the exact moment on hover.
                        <span
                          data-testid={placed(place, `sidebar-age-${session.id}`)}
                          title={absoluteTitle(
                            session.endedAt ?? session.createdAt,
                          )}
                          className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400"
                        >
                          {deleting[sessionKey]
                            ? i18n._({
                                id: "deleting…",
                                comment:
                                  "session row, busy: the delete is in flight",
                              })
                            : compactAge(
                                session.endedAt ?? session.createdAt,
                                now,
                              )}
                        </span>
                      )}
                      {deletable ? (
                        // Revealed on hover or focus, reachable by
                        // Tab regardless (DR-010 §6).
                        <button
                          type="button"
                          data-testid={placed(place, `sidebar-delete-${session.id}`)}
                          aria-label={i18n._("Delete session {title}", {
                            title:
                              session.title ?? i18n._("no messages yet"),
                          })}
                          title={i18n._(
                            "Delete this session and its transcript",
                          )}
                          disabled={deleting[sessionKey]}
                          onClick={(event) => {
                            event.stopPropagation();
                            setConfirmDelete(sessionKey);
                          }}
                          onKeyDown={stop}
                          className="-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 opacity-0 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-40 dark:hover:text-red-400"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
            {hidden > 0 ? (
              <div
                role="treeitem"
                aria-selected={false}
                data-row={placed(place, `m:${project.id}`)}
                data-testid={placed(place, `sidebar-more-${project.id}`)}
                tabIndex={focused === placed(place, `m:${project.id}`) ? 0 : -1}
                onFocus={() => setFocusKey(placed(place, `m:${project.id}`))}
                onClick={() =>
                  setShowAll((current) => ({
                    ...current,
                    [projectKey]: true,
                  }))
                }
                aria-label={i18n._(
                  "Show all {count} sessions in {project}",
                  { count: bucket.idle.length, project: project.name },
                )}
                className={`${rowClass(false)} pl-6 text-xs text-brand-600 dark:text-brand-300`}
              >
                {i18n._("all {count}…", { count: bucket.idle.length })}
              </div>
            ) : null}
            <div
              role="treeitem"
              aria-selected={false}
              data-row={placed(place, `n:${project.id}`)}
              data-testid={placed(place, `sidebar-new-${project.id}`)}
              tabIndex={focused === placed(place, `n:${project.id}`) ? 0 : -1}
              onFocus={() => setFocusKey(placed(place, `n:${project.id}`))}
              onClick={() => place.onNewSession(project.id)}
              aria-label={i18n._("New session in {project}", {
                project: project.name,
              })}
              className={`${rowClass(false)} pl-6 text-neutral-500`}
            >
              <Icon name="plus" className="h-3 w-3 shrink-0" />
              {i18n._("New session")}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  /** One place's project nodes. */
  const placeNodes = (place: NavPlace) =>
    place.projects.map((project) => projectNode(place, project));

  const tree = (
    <div
      ref={treeRef}
      role="tree"
      aria-label={i18n._("Projects and sessions")}
      aria-multiselectable={false}
      onKeyDown={onTreeKeyDown}
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {headed
        ? // A heading per place (run-view-67, run-view-168): each
          // place's projects form a group named by the place, the
          // heading its visible name.
          places.map((place) => {
            const headingRow = headingRowOf(place);
            // The place the Projects surface shows is the current one
            // while that surface is up (run-view-67).
            const current = inWorkspace && place.shown;
            return (
              <div
                key={place.key}
                role="group"
                aria-label={place.label}
                data-place-key={place.key}
                className="flex flex-col"
              >
                {/* The heading shows its place (run-view-168): a row the
                    tree's keys reach, activated as every row is. */}
                <div
                  role="treeitem"
                  aria-selected={false}
                  aria-current={current ? "location" : undefined}
                  data-row={headingRow}
                  data-testid="sidebar-place-heading"
                  tabIndex={focused === headingRow ? 0 : -1}
                  onFocus={() => setFocusKey(headingRow)}
                  onClick={() => place.onShow()}
                  title={place.label}
                  className={`w-full cursor-default truncate rounded-md px-1 pb-0.5 pt-1.5 text-left text-[11px] font-medium outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-brand-400 dark:hover:bg-neutral-800 ${
                    current
                      ? "text-brand-700 dark:text-brand-300"
                      : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {place.label}
                </div>
                {placeNodes(place)}
              </div>
            );
          })
        : places.map((place) => <Fragment key={place.key}>{placeNodes(place)}</Fragment>)}
    </div>
  );

  return (
    <nav
      data-testid="sidebar"
      data-collapsed={collapsed ? "1" : "0"}
      aria-label={i18n._("Spex navigation")}
      className={`flex flex-col gap-1 border-r border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900 ${
        collapsed ? "w-14 items-stretch" : "w-56"
      }`}
    >
      <div
        className={`mb-1 flex items-center gap-2 px-1 ${collapsed ? "justify-center" : ""}`}
      >
        <img src={logo} alt="" className="h-6 w-6" />
        {collapsed ? null : (
          <span className="text-base font-bold tracking-tight">Spex</span>
        )}
      </div>

      {surfaceEntry("Dashboard")}

      {collapsed ? (
        <>
          {surfaceEntry("Workspace")}
          {paletteControl}
          {/* Entries keep their places across the fold: Playbooks,
              Groups and Settings stay at the foot in both states. */}
          <div className="flex-1" />
        </>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 px-1 pb-0.5 pt-2">
            <button
              type="button"
              data-testid="sidebar-workspace"
              onClick={() => onSurface("Workspace")}
              aria-current={surface === "Workspace" ? "page" : undefined}
              className={`min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs font-semibold uppercase tracking-wide ${
                surface === "Workspace"
                  ? "text-brand-700 dark:text-brand-300"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              }`}
            >
              {SURFACE_LABELS.Workspace()}
            </button>
            {paletteControl}
          </div>
          {tree}
        </section>
      )}

      {surfaceEntry("Playbooks")}
      {surfaceEntry("Space")}
      {surfaceEntry("Settings")}

      <div
        className={`mt-auto flex items-center gap-1 pt-2 ${
          collapsed ? "flex-col" : ""
        }`}
      >
        {props.foot}
        <button
          type="button"
          data-testid="sidebar-collapse"
          onClick={() => onCollapsed(!collapsed)}
          title={
            collapsed
              ? i18n._("Show the sidebar ({keys})", { keys: keyLabel("B") })
              : i18n._("Collapse the sidebar ({keys})", { keys: keyLabel("B") })
          }
          aria-label={
            collapsed
              ? i18n._("Show the sidebar")
              : i18n._("Collapse the sidebar")
          }
          aria-expanded={!collapsed}
          className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <Icon name="sidebar" className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

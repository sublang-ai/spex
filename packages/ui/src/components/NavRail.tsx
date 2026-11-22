// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The sidebar (DR-029, DR-030): the navigator. Surface entries around
// a Projects section — the internal name stays Workspace (DR-057) —
// listing every project and its sessions, so what
// exists is always on screen while the tabs hold only what is open.
// Two widgets, not one — a navigation list for the surfaces and one
// ARIA tree for the projects — because "current surface" and
// "selected session" are different words (run-view-67).
// is open, the tree lists each place's projects under a heading naming
// the place, this computer's first, the heading a row of its own that
// shows its place on the Projects surface (run-view-168).

import { useMemo, useRef, useState, type ReactNode } from "react";
import type { ProjectInfo, SessionInfo } from "@sublang/spex-core/protocol";

import {
  ATTENTION_MARK_CLASS,
  ATTENTION_RANK,
  PROJECT_ATTENTION_WORDS,
  type AttentionItem,
} from "../state/dashboard.js";
import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { isHistory } from "../lib/sessions.js";
import { keyLabel } from "../lib/shortcuts.js";
import { STEP_LINES, type OpeningProject } from "../lib/space.js";
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

/** The sidebar's order; Cmd/Ctrl+1..5 walk it (run-view-49,
 * run-view-67). Playbooks is the global page: the playbooks of your
 * global packages, which run in every project of yours (DR-176). */
export const SURFACES: readonly Surface[] = [
  "Dashboard",
  "Workspace",
  "Playbooks",
  "Space",
  "Settings",
];

/** What each surface is called on screen (DR-057, DR-103): the
 * Workspace reads "Projects" and Space reads "Space" while every
 * identifier and state key keeps the internal name, so nothing stored
 * — the remembered surface among it — changes shape. Each label is a
 * thunk, never a string: a table read at module load would freeze the
 * language the module was imported in (localization-4). */
export const SURFACE_LABELS: Record<Surface, () => string> = {
  Dashboard: () => i18n._("Dashboard"),
  Workspace: () => i18n._("Projects"),
  Playbooks: () =>
    i18n._({
      id: "Playbooks",
      comment: "the rail's Playbooks destination: the global playbooks, which run in every project of yours",
    }),
  Space: () => i18n._({ id: "Space", comment: "the Space destination: groups, projects and their shared records" }),
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
export interface ProjectTree {
  projects: ProjectInfo[];
  /** The projects opening at this place (run-view-168): each listed
   * after the projects, reading "Opening…" until the place's core lists
   * it, selected while it is the current project. */
  opening?: OpeningProject[];
  sessions: SessionInfo[];
  /** Non-idle attention by session id, the same derivation the badge
   * and the tab dots use (run-view-73). */
  attention: Map<string, AttentionItem>;
  /** The place's current project, which starts disclosed. */
  currentProjectId?: string;
  /** The session whose tab is showing at this place, if any. */
  activeSessionId?: string;
  /** Explicit disclosure; a project with no entry follows current. */
  expanded: Record<string, boolean>;
  onExpanded(projectId: string, expanded: boolean): void;
  onPickProject(projectId: string): void;
  onActivateSession(sessionId: string): void;
  onNewSession(projectId: string): void;
  /** Show that project with its Specs tab (run-view-67). */
  onOpenSpecs(projectId: string): void;
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
  projects: ProjectTree;
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
  kind: "project" | "session" | "action";
  /** The key of the project row this row belongs to; a place's
   * heading row is its own. */
  projectRow: string;
  projectId: string;
  /** What type-ahead matches: a place's name, a project's name or a
   * session's title. */
  label: string;
  activate(): void;
}

type Buckets = Map<string, { live: SessionInfo[]; idle: SessionInfo[] }>;

export function NavRail(props: NavRailProps) {
  const { surface, onSurface, attentionCount, collapsed, onCollapsed, projects: treeState } = props;
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [focusKey, setFocusKey] = useState<string>();
  // A delete confirm names an unsent draft it would take (DR-010 §4),
  // read from the session.
  const composers = useAppStore((state) => state.composers);
  const draftOf = (sessionId: string): string | undefined => composers[sessionId]?.draft;
  // Deletion is destructive and irreversible, so it keeps one inline
  // confirmation at the row (DR-038, DR-010 §4).
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const treeRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", at: 0 });
  // One clock per render keeps every row's age consistent.
  const now = Date.now();
  const isExpanded = (projectId: string): boolean =>
    treeState.expanded[projectId] ?? projectId === treeState.currentProjectId;

  // A working session first, then the rest by last activity
  // (run-view-67): the recent window applies to the idle ones only.
  // Bucket each session under its project.
  const { buckets, worst } = useMemo(() => {
    const buckets: Buckets = new Map();
    for (const project of treeState.projects) buckets.set(project.id, { live: [], idle: [] });
    for (const session of treeState.sessions) {
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
    for (const session of treeState.sessions) {
      const item = treeState.attention.get(session.id);
      if (!item) continue;
      const prior = worst.get(session.projectId);
      if (!prior || ATTENTION_RANK[item.kind] < ATTENTION_RANK[prior]) {
        worst.set(session.projectId, item.kind);
      }
    }
    return { buckets, worst };
  }, [treeState.projects, treeState.sessions, treeState.attention]);
  const bucketOf = (projectId: string) =>
    buckets.get(projectId) ?? { live: [], idle: [] };

  // The rows the tree can reach right now, in visual order — the one
  // list arrow keys, Home/End and type-ahead walk.
  const rows: Row[] = [];
  for (const project of treeState.projects) {
    const projectRow = `p:${project.id}`;
    const projectKey = project.id;
    rows.push({
      key: projectRow,
      kind: "project",
      projectRow,
      projectId: project.id,
      label: project.name,
      activate: () => treeState.onPickProject(project.id),
    });
    if (!isExpanded(project.id)) continue;
    const bucket = bucketOf(project.id);
    const ended = showAll[projectKey] ? bucket.idle : bucket.idle.slice(0, RECENT_WINDOW);
    for (const session of [...bucket.live, ...ended]) {
      rows.push({
        key: `s:${session.id}`,
        kind: "session",
        projectRow,
        projectId: project.id,
        label: session.title ?? "",
        activate: () => treeState.onActivateSession(session.id),
      });
    }
    if (!showAll[projectKey] && bucket.idle.length > RECENT_WINDOW) {
      rows.push({
        key: `m:${project.id}`,
        kind: "action",
        projectRow,
        projectId: project.id,
        label: "",
        activate: () => setShowAll((current) => ({ ...current, [projectKey]: true })),
      });
    }
    rows.push({
      key: `n:${project.id}`,
      kind: "action",
      projectRow,
      projectId: project.id,
      label: "",
      activate: () => treeState.onNewSession(project.id),
    });
  }
  // A project opening at the place (run-view-168): a row with no
  // sessions yet, reached and activated as a project's is.
  for (const entry of treeState.opening ?? []) {
    const projectRow = `o:${entry.id}`;
    rows.push({
      key: projectRow,
      kind: "project",
      projectRow,
      projectId: entry.id,
      label: entry.name,
      activate: () => treeState.onPickProject(entry.id),
    });
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
    // keys need the latest focus position.
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
          if (!isExpanded(row.projectId)) treeState.onExpanded(row.projectId, true);
          else if (rows[index + 1]) moveFocus(rows[index + 1].key);
        }
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (row.kind === "project" && isExpanded(row.projectId)) {
          treeState.onExpanded(row.projectId, false);
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
  function deleteSession(sessionId: string): void {
    const key = sessionId;
    setConfirmDelete(undefined);
    setDeleting((current) => ({ ...current, [key]: true }));
    setDeleteErrors(({ [key]: _, ...rest }) => rest);
    void treeState
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
  const inWorkspace = surface === "Workspace";
  const selectedProjectOf = (): string | undefined =>
    inWorkspace ? treeState.currentProjectId : undefined;
  const shownSessionOf = (): string | undefined =>
    inWorkspace ? treeState.activeSessionId : undefined;

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
  const projectNode = (project: ProjectInfo) => {
    const open = isExpanded(project.id);
    const bucket = bucketOf(project.id);
    const mark = worst.get(project.id);
    const projectKey = project.id;
    const listed = showAll[projectKey]
      ? bucket.idle
      : bucket.idle.slice(0, RECENT_WINDOW);
    const hidden = bucket.idle.length - listed.length;
    const selectedProjectId = selectedProjectOf();
    const shownSessionId = shownSessionOf();
    const projectRow = `p:${project.id}`;
    return (
      <div key={projectKey} className="flex flex-col">
        <div
          role="treeitem"
          aria-expanded={open}
          aria-selected={project.id === selectedProjectId}
          data-row={projectRow}
          data-testid={`sidebar-project-${project.id}`}
          tabIndex={focused === projectRow ? 0 : -1}
          onFocus={() => setFocusKey(projectRow)}
          onClick={() => treeState.onPickProject(project.id)}
          title={
            mark
              ? i18n._("{path} — needs you", { path: project.path })
              : project.path
          }
          aria-label={projectRowName(project.name, mark)}
          className={`${rowClass(
            project.id === selectedProjectId && !shownSessionId,
          )} group pl-0.5`}
        >
          <button
            type="button"
            tabIndex={-1}
            data-testid={`sidebar-disclose-${project.id}`}
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
              treeState.onExpanded(project.id, !open);
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
          {mark ? (
            <span
              data-testid={`sidebar-project-attention-${project.id}`}
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${ATTENTION_MARK_CLASS[mark]}`}
              title={PROJECT_ATTENTION_WORDS[mark]()}
            />
          ) : null}
          {/* The project's specs, a sidebar's step away for the
              pointer: shown on the current project, revealed on hover
              or the row's focus elsewhere; outside the tree's one tab
              stop, as the disclosure is, the keyboard reaching the
              specs by the Specs shortcut (run-view-67). */}
          <button
            type="button"
            tabIndex={-1}
            data-testid={`sidebar-specs-${project.id}`}
            aria-label={i18n._("Open the specs of {project}", { project: project.name })}
            title={i18n._("Open the specs of {project}", { project: project.name })}
            onClick={(event) => {
              event.stopPropagation();
              treeState.onOpenSpecs(project.id);
            }}
            className={`-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100 ${
              project.id === treeState.currentProjectId ? "" : "opacity-0"
            }`}
          >
            <Icon name="file" className="h-3.5 w-3.5" />
          </button>
        </div>
        {open ? (
          <div role="group" className="flex flex-col">
            {[...bucket.live, ...listed].map((session) => {
              const item = treeState.attention.get(session.id);
              const life = lifeOf(session, item);
              const active = session.id === shownSessionId;
              // External ownership must be known idle before deletion.
              const deletable = !session.live && !session.externalWriter;
              const sessionKey = session.id;
              const sessionRow = `s:${session.id}`;
              const confirming = deletable && confirmDelete === sessionKey;
              const draft = draftOf(session.id)?.trim();
              return (
                <div
                  key={session.id}
                  role="treeitem"
                  aria-selected={active}
                  data-row={sessionRow}
                  data-testid={`sidebar-session-${session.id}`}
                  tabIndex={focused === sessionRow ? 0 : -1}
                  onFocus={() => setFocusKey(sessionRow)}
                  onClick={() => treeState.onActivateSession(session.id)}
                  aria-label={sessionLabel(session, life, now, item)}
                  title={sessionLabel(session, life, now, item)}
                  className={`${rowClass(active)} group pl-6`}
                >
                  <span
                    aria-hidden
                    data-testid={`sidebar-mark-${session.id}`}
                    data-life={life}
                    className={`h-2 w-2 shrink-0 rounded-full ${LIFE_MARKS[life]}`}
                  />
                  {confirming ? (
                    <span
                      data-testid={`sidebar-delete-confirm-${session.id}`}
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
                        onConfirm={() => deleteSession(session.id)}
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
                          data-testid={`sidebar-delete-error-${session.id}`}
                          title={deleteErrors[sessionKey]}
                          className="shrink-0 truncate text-xs text-red-600 dark:text-red-400"
                        >
                          {i18n._("not deleted")}
                        </span>
                      ) : (
                        // The one time vocabulary (run-view-73): a
                        // compact age with the exact moment on hover.
                        <span
                          data-testid={`sidebar-age-${session.id}`}
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
                          data-testid={`sidebar-delete-${session.id}`}
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
                data-row={`m:${project.id}`}
                data-testid={`sidebar-more-${project.id}`}
                tabIndex={focused === `m:${project.id}` ? 0 : -1}
                onFocus={() => setFocusKey(`m:${project.id}`)}
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
              data-row={`n:${project.id}`}
              data-testid={`sidebar-new-${project.id}`}
              tabIndex={focused === `n:${project.id}` ? 0 : -1}
              onFocus={() => setFocusKey(`n:${project.id}`)}
              onClick={() => treeState.onNewSession(project.id)}
              aria-label={i18n._("New task in {project}", {
                project: project.name,
              })}
              className={`${rowClass(false)} pl-6 text-neutral-500`}
            >
              <Icon name="plus" className="h-3 w-3 shrink-0" />
              {i18n._("New task")}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  /** A project opening at its place (run-view-168): its name as its
   * code's, "Opening…" beside it and the step in flight as its title,
   * selected while it is the place's current project; it discloses
   * nothing, holding no session yet. */
  const openingNode = (entry: OpeningProject) => {
    const projectRow = `o:${entry.id}`;
    const selected = entry.id === selectedProjectOf() && !shownSessionOf();
    const opening = i18n._({ id: "Opening…", comment: "a project's row while it is opened here: its records and code clone" });
    return (
      <div
        key={projectRow}
        role="treeitem"
        aria-selected={selected}
        data-row={projectRow}
        data-testid={`sidebar-opening-${entry.id}`}
        tabIndex={focused === projectRow ? 0 : -1}
        onFocus={() => setFocusKey(projectRow)}
        onClick={() => treeState.onPickProject(entry.id)}
        title={STEP_LINES[entry.step]()}
        aria-label={`${entry.name}, ${opening}`}
        // The folder icon aligns with a project row's, past the width
        // its disclosure control takes.
        className={`${rowClass(selected)} pl-8`}
      >
        <Icon name="folder" className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{entry.name}</span>
        <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{opening}</span>
      </div>
    );
  };

  const tree = (
    <div
      ref={treeRef}
      role="tree"
      aria-label={i18n._("Projects and sessions")}
      aria-multiselectable={false}
      onKeyDown={onTreeKeyDown}
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {treeState.projects.map(projectNode)}
      {treeState.opening?.map(openingNode)}
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
              Space and Settings stay at the foot in both states. */}
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
              className={`min-h-6 min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs font-semibold uppercase tracking-wide ${
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

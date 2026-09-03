// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The project palette (DR-011): a centered command palette that is
// the one place projects are chosen, added, and created. Rows carry
// each project's live state so quiet runs in other projects stay one
// keystroke away. With nothing registered there is nothing to filter,
// so the palette opens as an add flow: the path field focused and the
// Academy example leading the list (projects-22). The palette owns
// focus while open — Tab wraps inside it and Escape closes from
// anywhere in it — and returns focus to the opener with any draft
// intact (run-view-42).

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectInfo, SessionInfo } from "@sublang/spex-core/protocol";

import type { SessionView } from "../state/reducer.js";
import { deriveAttention } from "../state/dashboard.js";
import { useAppStore } from "../state/store.js";
import { Icon } from "./Icon.js";

export interface ProjectPaletteProps {
  projects: ProjectInfo[];
  sessions: SessionInfo[];
  views: Record<string, SessionView>;
  currentProjectId?: string;
  onPickFolder?: () => Promise<string | null>;
  onPick: (projectId: string) => void;
  /** Register-or-init by path (store's addProjectByPath). */
  onAddPath: (path: string) => Promise<ProjectInfo>;
  onCreatePath: (path: string, scaffold: boolean) => Promise<ProjectInfo>;
  onClose: () => void;
}

interface ProjectRowState {
  running: number;
  attention: number;
  worst?: "question" | "failure";
}

const ROW_ACTIVE = "bg-neutral-100 dark:bg-neutral-800";

/** The controls Tab walks inside the dialog, in document order. */
const FOCUSABLE = "button:not([disabled]), input:not([disabled])";

export function ProjectPalette(props: ProjectPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [pathDraft, setPathDraft] = useState("");
  const [scaffold, setScaffold] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const pathRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(null);
  // Academy seeding (DR-015) lives on the store: registration and
  // project selection happen there, the palette only offers the row.
  const openAcademyExample = useAppStore((state) => state.openAcademyExample);
  // No project registered: the remedy is adding one, so the filter
  // goes and the add flow takes the front (projects-22).
  const empty = props.projects.length === 0;

  // The palette owns focus while open and hands it back on close.
  useEffect(() => {
    openerRef.current = document.activeElement;
    (empty ? pathRef.current : searchRef.current)?.focus();
    return () => {
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
    // The opening state decides where focus lands; later renders
    // must not steal it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowState = useMemo(() => {
    const attention = deriveAttention(props.sessions, props.views).filter(
      (item) => item.kind !== "idle",
    );
    const byProject = new Map<string, ProjectRowState>();
    for (const project of props.projects) {
      byProject.set(project.id, { running: 0, attention: 0 });
    }
    for (const session of props.sessions) {
      if (!session.live) continue;
      const row = byProject.get(session.projectId);
      if (row) row.running += 1;
    }
    for (const item of attention) {
      const session = props.sessions.find((s) => s.id === item.sessionId);
      const row = session && byProject.get(session.projectId);
      if (!row) continue;
      row.attention += 1;
      if (item.kind === "failure" || !row.worst) {
        row.worst = item.kind as "question" | "failure";
      }
    }
    return byProject;
  }, [props.projects, props.sessions, props.views]);

  const filtered = props.projects.filter(
    (project) =>
      project.name.toLowerCase().includes(query.toLowerCase()) ||
      project.path.toLowerCase().includes(query.toLowerCase()),
  );

  // Entries the arrow keys traverse, in visual order: the Academy row
  // where it leads the list, then projects, then Open folder…
  const lead = empty ? 1 : 0;
  const entryCount = lead + filtered.length + (props.onPickFolder ? 1 : 0);
  const clamped = Math.min(index, Math.max(0, entryCount - 1));
  const openFolderIndex = lead + filtered.length;

  function pick(projectId: string): void {
    props.onPick(projectId);
    props.onClose();
  }

  async function runAdd(create: boolean): Promise<void> {
    const path = pathDraft.trim();
    if (!path || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const project = create
        ? await props.onCreatePath(path, scaffold)
        : await props.onAddPath(path);
      pick(project.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runAcademy(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      // A typed path becomes the example's target; else the store's
      // default. The core expands ~ like any typed path.
      const project = await openAcademyExample(pathDraft.trim() || undefined);
      pick(project.id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openFolder(): void {
    void props.onPickFolder?.().then((path) => {
      if (!path) return;
      setBusy(true);
      setError(undefined);
      props
        .onAddPath(path)
        .then((project) => pick(project.id))
        .catch((cause: Error) => setError(cause.message))
        .finally(() => setBusy(false));
    });
  }

  /** Enter on the highlighted entry. */
  function activate(at: number): void {
    if (empty && at === 0) {
      void runAcademy();
      return;
    }
    const project = filtered[at - lead];
    if (project) pick(project.id);
    else if (props.onPickFolder && at === openFolderIndex) openFolder();
  }

  /** Arrow keys move the highlight from either input. */
  function moveHighlight(event: React.KeyboardEvent): boolean {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => (entryCount === 0 ? 0 : (i + 1) % entryCount));
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) =>
        entryCount === 0 ? 0 : (i - 1 + entryCount) % entryCount,
      );
      return true;
    }
    return false;
  }

  function searchKeydown(event: React.KeyboardEvent): void {
    if (moveHighlight(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      activate(clamped);
    }
  }

  function pathKeydown(event: React.KeyboardEvent): void {
    if (moveHighlight(event)) return;
    if (event.key === "Enter") {
      event.preventDefault();
      // A typed path adds; an empty field hands Enter to the
      // highlighted row, so the zero-state is one keystroke deep.
      if (pathDraft.trim()) void runAdd(false);
      else activate(clamped);
    }
  }

  /** The dialog's own keys: Escape closes from anywhere inside it,
   * and Tab wraps so focus never leaves it (DR-010 §6). */
  function dialogKeydown(event: React.KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!dialogRef.current?.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  const academyHint = pathDraft.trim()
    ? `— seeds ${pathDraft.trim()}`
    : empty
      ? "— a sample project with specs, ready to run"
      : "— seeds a sample project";

  return (
    <div
      data-testid="project-palette"
      // The gap above the dialog is a proportion of a tall window and
      // a fixed inch of a short one, and the overlay's padding is the
      // dialog's height budget (DR-041 §9): a fixed overlay grows past
      // the window with nothing able to scroll to what it hides.
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/20 p-4 pt-[min(18vh,4rem)]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={empty ? "Add a project" : "Choose a project"}
        onKeyDown={dialogKeydown}
        className="flex max-h-full w-[28rem] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        {empty ? null : (
          <input
            ref={searchRef}
            data-testid="palette-search"
            aria-label="Filter projects"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={searchKeydown}
            placeholder="Switch to a project…"
            className="border-b border-neutral-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-neutral-800"
          />
        )}
        {/* The list is what yields inside the dialog's bound: the
            path row, its options, and a failure message keep their
            place at every window height (projects-30). */}
        <div className="relative min-h-0 flex-1 overflow-y-auto py-1">
          {empty ? (
            <button
              type="button"
              data-testid="palette-academy"
              disabled={busy}
              onClick={() => void runAcademy()}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-brand-600 hover:bg-neutral-50 disabled:opacity-40 dark:text-brand-300 dark:hover:bg-neutral-800 ${
                clamped === 0 ? ROW_ACTIVE : ""
              }`}
            >
              <Icon name="book" className="h-3.5 w-3.5" />
              {busy ? "Seeding…" : "Try the Academy example"}
              <span className="text-xs text-neutral-500">{academyHint}</span>
            </button>
          ) : null}
          {filtered.map((project, i) => {
            const row = rowState.get(project.id);
            return (
              <button
                key={project.id}
                type="button"
                data-testid={`palette-project-${project.id}`}
                title={project.path}
                onClick={() => pick(project.id)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${
                  i + lead === clamped ? ROW_ACTIVE : ""
                }`}
              >
                <Icon name="folder" className="h-3.5 w-3.5 text-neutral-500" />
                <span className="truncate">{project.name}</span>
                {project.id === props.currentProjectId ? (
                  <span className="text-xs text-neutral-500">current</span>
                ) : null}
                <span className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
                  {row && row.attention > 0 ? (
                    <span
                      className={`flex items-center gap-1 font-medium ${
                        row.worst === "failure"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-300"
                      }`}
                      title={`${row.attention} session${row.attention === 1 ? "" : "s"} need${row.attention === 1 ? "s" : ""} you`}
                    >
                      <span
                        aria-hidden
                        className={`h-2 w-2 rounded-full ${
                          row.worst === "failure"
                            ? "bg-red-500"
                            : "bg-amber-500"
                        }`}
                      />
                      {row.attention} need{row.attention === 1 ? "s" : ""} you
                    </span>
                  ) : null}
                  {row && row.running > 0 ? (
                    <span
                      className="flex items-center gap-1"
                      title={`${row.running} running session${row.running === 1 ? "" : "s"}`}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"
                      />
                      {row.running} running
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && query ? (
            <div className="px-4 py-2 text-sm text-neutral-500">
              No project matches "{query}"
            </div>
          ) : null}
          {props.onPickFolder ? (
            <button
              type="button"
              data-testid="palette-open-folder"
              onClick={openFolder}
              disabled={busy}
              className={`flex w-full items-center gap-2 border-t border-neutral-100 px-4 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800 ${
                clamped === openFolderIndex ? ROW_ACTIVE : ""
              }`}
            >
              Open folder…
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-neutral-200 p-2 dark:border-neutral-800">
          <div className="flex gap-1.5">
            <input
              ref={pathRef}
              data-testid="palette-path"
              aria-label="Project path"
              value={pathDraft}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={pathKeydown}
              placeholder={
                empty
                  ? "Add a project by path…"
                  : "~/path — add an existing repo or create new"
              }
              className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
            <button
              type="button"
              data-testid="palette-add"
              disabled={!pathDraft.trim() || busy}
              onClick={() => void runAdd(false)}
              className="rounded border border-brand-300 px-2 py-1 text-xs text-brand-600 disabled:opacity-40 dark:border-brand-800 dark:text-brand-300"
            >
              Add
            </button>
            <button
              type="button"
              data-testid="palette-create"
              disabled={!pathDraft.trim() || busy}
              onClick={() => void runAdd(true)}
              className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40 dark:border-neutral-700"
            >
              Create
            </button>
          </div>
          {pathDraft.trim() ? (
            <label className="flex items-center gap-1.5 px-0.5 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={scaffold}
                onChange={(event) => setScaffold(event.target.checked)}
              />
              Scaffold specs when creating
            </label>
          ) : null}
          {empty ? null : (
            <button
              type="button"
              data-testid="palette-academy"
              disabled={busy}
              onClick={() => void runAcademy()}
              className="flex items-center gap-1.5 rounded px-0.5 py-0.5 text-left text-xs text-brand-600 hover:underline disabled:opacity-40 dark:text-brand-300"
            >
              Try the Academy example
              <span className="text-xs text-neutral-500">{academyHint}</span>
            </button>
          )}
          {error ? (
            <div
              data-testid="palette-error"
              className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The project palette (DR-011): a centered command palette that is
// the one place projects are chosen, added, and created. Rows carry
// each project's live state so quiet runs in other projects stay one
// keystroke away. The palette owns focus while open; Escape returns
// focus to the opener with any draft intact.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectInfo, SessionInfo } from "@sublang/spex-core/protocol";

import type { SessionView } from "../state/reducer.js";
import { deriveAttention } from "../state/dashboard.js";
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

export function ProjectPalette(props: ProjectPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [pathDraft, setPathDraft] = useState("");
  const [scaffold, setScaffold] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const searchRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(null);

  // The palette owns focus while open and hands it back on close.
  useEffect(() => {
    openerRef.current = document.activeElement;
    searchRef.current?.focus();
    return () => {
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
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

  // Entries the arrow keys traverse: projects, then Open folder…
  const entryCount = filtered.length + (props.onPickFolder ? 1 : 0);
  const clamped = Math.min(index, Math.max(0, entryCount - 1));

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

  function keydown(event: React.KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((i) => (entryCount === 0 ? 0 : (i + 1) % entryCount));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((i) =>
        entryCount === 0 ? 0 : (i - 1 + entryCount) % entryCount,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (clamped < filtered.length && filtered[clamped]) {
        pick(filtered[clamped].id);
      } else if (props.onPickFolder && clamped === filtered.length) {
        openFolder();
      }
    }
  }

  return (
    <div
      data-testid="project-palette"
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/20 pt-[18vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Choose a project"
        className="flex w-[28rem] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <input
          ref={searchRef}
          data-testid="palette-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={keydown}
          placeholder="Switch to a project…"
          className="border-b border-neutral-200 bg-transparent px-4 py-3 text-sm outline-none dark:border-neutral-800"
        />
        <div className="max-h-[40vh] overflow-y-auto py-1">
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
                  i === clamped ? "bg-neutral-100 dark:bg-neutral-800" : ""
                }`}
              >
                <Icon name="folder" className="h-3.5 w-3.5 text-neutral-500" />
                <span className="truncate">{project.name}</span>
                {project.id === props.currentProjectId ? (
                  <span className="text-[11px] text-neutral-400">current</span>
                ) : null}
                <span className="ml-auto flex items-center gap-2 text-[11px] text-neutral-500">
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
            <div className="px-4 py-2 text-sm text-neutral-400">
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
                clamped === filtered.length
                  ? "bg-neutral-100 dark:bg-neutral-800"
                  : ""
              }`}
            >
              Open folder…
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-neutral-200 p-2 dark:border-neutral-800">
          <div className="flex gap-1.5">
            <input
              data-testid="palette-path"
              value={pathDraft}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") props.onClose();
                if (event.key === "Enter" && pathDraft.trim()) {
                  void runAdd(false);
                }
              }}
              placeholder="~/path — add an existing repo or create new"
              className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
            <button
              type="button"
              data-testid="palette-add"
              disabled={!pathDraft.trim() || busy}
              onClick={() => void runAdd(false)}
              className="rounded border border-indigo-300 px-2 py-1 text-xs text-indigo-600 disabled:opacity-40 dark:border-indigo-800 dark:text-indigo-300"
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
            <label className="flex items-center gap-1.5 px-0.5 text-[11px] text-neutral-500">
              <input
                type="checkbox"
                checked={scaffold}
                onChange={(event) => setScaffold(event.target.checked)}
              />
              Scaffold specs when creating
            </label>
          ) : null}
          {error ? (
            <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

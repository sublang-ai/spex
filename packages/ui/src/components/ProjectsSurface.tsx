// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Projects surface (PROJ-1..8): register or create git projects,
// repo-state cards from local git, forge panels via the adapter.

import { useEffect, useState } from "react";
import type { ForgeItem, ForgeState } from "@sublang/spex-core/protocol";

import { useAppStore, type ProjectMeta } from "../state/store.js";

function ForgeList({ label, items }: { label: string; items: ForgeItem[] }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-semibold text-neutral-500">
        {label} ({items.length})
      </div>
      <ul className="flex flex-col gap-1">
        {items.slice(0, 8).map((item) => (
          <li key={item.number} className="truncate text-sm">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              #{item.number}
            </a>{" "}
            {item.title}
            {item.author ? (
              <span className="text-xs text-neutral-400"> · {item.author}</span>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? (
          <li className="text-xs text-neutral-400">none open</li>
        ) : null}
      </ul>
    </div>
  );
}

function ForgePanel({ forge }: { forge?: ForgeState }) {
  if (!forge) {
    return <div className="text-xs text-neutral-400">loading forge state…</div>;
  }
  if (forge.guidance && forge.authenticated !== true) {
    return (
      <div className="rounded border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700">
        {forge.guidance}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {forge.guidance ? (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          {forge.guidance}
        </div>
      ) : null}
      <div className="flex gap-6">
        <ForgeList label="Issues to do" items={forge.issues} />
        <ForgeList label="PRs to review" items={forge.prs} />
      </div>
    </div>
  );
}

function StatusBadges({ meta }: { meta?: ProjectMeta }) {
  const status = meta?.status;
  if (!status) return null;
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500">
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
        {status.branch}
      </span>
      {status.dirty ? (
        <span className="text-amber-600 dark:text-amber-400" title="uncommitted changes">
          ●
        </span>
      ) : null}
      {status.ahead > 0 ? <span title="ahead of upstream">↑{status.ahead}</span> : null}
      {status.behind > 0 ? <span title="behind upstream">↓{status.behind}</span> : null}
      {meta?.forge?.repo ? (
        <span className="text-neutral-400">{meta.forge.repo}</span>
      ) : null}
    </span>
  );
}

export function ProjectsSurface() {
  const projects = useAppStore((state) => state.projects);
  const projectMeta = useAppStore((state) => state.projectMeta);
  const sessions = useAppStore((state) => state.sessions);
  const registerProject = useAppStore((state) => state.registerProject);
  const createProject = useAppStore((state) => state.createProject);
  const loadProjectMeta = useAppStore((state) => state.loadProjectMeta);
  const openSession = useAppStore((state) => state.openSession);
  const removeProject = useAppStore((state) => state.removeProject);
  const connection = useAppStore((state) => state.connection);

  const [path, setPath] = useState("");
  const [mode, setMode] = useState<"register" | "create">("register");
  const [scaffold, setScaffold] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (connection === "open") {
      for (const project of projects) {
        if (!projectMeta[project.id]) void loadProjectMeta(project.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, projects.length]);

  function submit() {
    const trimmed = path.trim();
    if (!trimmed) return;
    setError(undefined);
    setBusy(true);
    const action =
      mode === "register"
        ? registerProject(trimmed)
        : createProject(trimmed, scaffold);
    action
      .then(() => setPath(""))
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Projects</h1>

      <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={mode === "register"}
              onChange={() => setMode("register")}
            />
            Register existing repo
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={mode === "create"}
              onChange={() => setMode("create")}
            />
            Create new
          </label>
          {mode === "create" ? (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={scaffold}
                onChange={(event) => setScaffold(event.target.checked)}
              />
              scaffold specs (spex)
            </label>
          ) : null}
        </div>
        <div className="flex gap-2">
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder={
              mode === "register"
                ? "/absolute/path/to/a/git/repo"
                : "/absolute/path/for/the/new/project"
            }
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            disabled={!path.trim() || busy}
            onClick={submit}
          >
            {busy ? "Working…" : mode === "register" ? "Register" : "Create"}
          </button>
        </div>
        {error ? (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3">
        {projects.map((project) => {
          const live = sessions.some(
            (session) => session.live && session.projectId === project.id,
          );
          const meta = projectMeta[project.id];
          return (
            <li
              key={project.id}
              data-testid={`project-card-${project.name}`}
              className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{project.name}</span>
                    <StatusBadges meta={meta} />
                  </div>
                  <div className="truncate text-xs text-neutral-500">
                    {project.path}
                  </div>
                </div>
                <button
                  type="button"
                  title="Refresh status and forge data"
                  className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  onClick={() => void loadProjectMeta(project.id, true)}
                >
                  ↻
                </button>
                {live ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    session live
                  </span>
                ) : (
                  <button
                    type="button"
                    className="rounded-md border border-indigo-300 px-2.5 py-1 text-sm text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:hover:bg-indigo-950"
                    onClick={() => {
                      setError(undefined);
                      openSession(project.id).catch((cause: Error) =>
                        setError(cause.message),
                      );
                    }}
                  >
                    Open session
                  </button>
                )}
                <button
                  type="button"
                  title="Remove from Spex (repo stays on disk)"
                  className="text-neutral-400 hover:text-red-500"
                  onClick={() => void removeProject(project.id)}
                >
                  ✕
                </button>
              </div>
              <details className="group">
                <summary className="cursor-pointer select-none text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                  Issues &amp; PRs
                </summary>
                <div className="mt-2">
                  <ForgePanel forge={meta?.forge} />
                </div>
              </details>
            </li>
          );
        })}
        {projects.length === 0 ? (
          <li className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Register a local git repository to run playbooks in it.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

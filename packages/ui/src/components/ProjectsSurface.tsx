// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Projects surface (PROJ-1..8): register or create git projects,
// repo-state cards from local git, forge panels via the adapter.

import { useEffect, useState } from "react";
import type { ForgeItem } from "@sublang/spex-core/protocol";

import { useAppStore, type ProjectMeta } from "../state/store.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";

function ForgeList({ label, items }: { label: string; items: ForgeItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 8);
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-semibold text-neutral-500">
        {label} ({items.length})
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((item) => (
          <li key={item.url} className="truncate text-sm">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-300"
            >
              #{item.number}
            </a>{" "}
            {item.title}
            {item.author ? (
              <span className="text-xs text-neutral-400"> · {item.author}</span>
            ) : null}
          </li>
        ))}
        {items.length > shown.length ? (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-indigo-600 hover:underline dark:text-indigo-300"
            >
              +{items.length - shown.length} more
            </button>
          </li>
        ) : null}
        {items.length === 0 ? (
          <li className="text-xs text-neutral-400">none open</li>
        ) : null}
      </ul>
    </div>
  );
}

function ForgePanel({ meta }: { meta?: ProjectMeta }) {
  if (meta?.forgeError) {
    return (
      <div className="text-xs text-red-500">
        Couldn't load GitHub data: {meta.forgeError}
      </div>
    );
  }
  const forge = meta?.forge;
  if (!forge) {
    return (
      <div className="text-xs text-neutral-400">
        {meta?.loading
          ? "loading GitHub state…"
          : "no GitHub data yet — refresh the card"}
      </div>
    );
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
  if (meta?.statusError) {
    return (
      <span
        className="text-[11px] text-red-500"
        title={meta.statusError}
      >
        repo unreadable — does the path still exist?
      </span>
    );
  }
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

export function ProjectsSurface({
  onOpenSession,
  onNavigate,
}: {
  onOpenSession: (sessionId: string) => void;
  onNavigate?: (surface: "Sessions") => void;
}) {
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
  const [cardError, setCardError] = useState<Record<string, string>>({});
  const [cardBusy, setCardBusy] = useState<Record<string, boolean>>({});
  const [confirmRemove, setConfirmRemove] = useState<string>();

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
    if (!trimmed || busy) return;
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

  function open(projectId: string) {
    setCardError((current) => ({ ...current, [projectId]: "" }));
    setCardBusy((current) => ({ ...current, [projectId]: true }));
    openSession(projectId)
      .then((session) => onOpenSession(session.id))
      .catch((cause: Error) =>
        setCardError((current) => ({ ...current, [projectId]: cause.message })),
      )
      .finally(() =>
        setCardBusy((current) => ({ ...current, [projectId]: false })),
      );
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
            Add an existing repo
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={mode === "create"}
              onChange={() => setMode("create")}
            />
            Create a new project
          </label>
          {mode === "create" ? (
            <label
              className="ml-auto flex items-center gap-1.5 text-xs text-neutral-500"
              title="Creates the specs/ tree (user, dev, test), CLAUDE.md/AGENTS.md agent instructions, and a LICENSE if missing — committed as the initial commit."
            >
              <input
                type="checkbox"
                checked={scaffold}
                onChange={(event) => setScaffold(event.target.checked)}
              />
              Scaffold specs
            </label>
          ) : null}
        </div>
        <div className="flex gap-2">
          {window.spexNative ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void window.spexNative!.pickDirectory().then((picked) => {
                  if (picked) setPath(picked);
                });
              }}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Choose folder…
            </button>
          ) : null}
          <input
            value={path}
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229)
                return;
              if (event.key === "Enter") submit();
            }}
            placeholder={
              mode === "register"
                ? "~/path/to/a/git/repo"
                : "~/path/for/the/new/project"
            }
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            type="button"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            disabled={!path.trim() || busy}
            onClick={submit}
          >
            {busy ? "Working…" : mode === "register" ? "Add project" : "Create project"}
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
          const liveSession = sessions.find(
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
                  title="Refresh status and GitHub data"
                  aria-label={`Refresh ${project.name}`}
                  disabled={meta?.loading}
                  className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:animate-pulse dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  onClick={() => void loadProjectMeta(project.id, true)}
                >
                  <Icon name="refresh" />
                </button>
                {liveSession ? (
                  <button
                    type="button"
                    onClick={() => onOpenSession(liveSession.id)}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    <span
                      className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"
                      aria-hidden="true"
                    />
                    Open live session
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={cardBusy[project.id]}
                    className="rounded-md border border-indigo-300 px-2.5 py-1 text-sm text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
                    onClick={() => open(project.id)}
                  >
                    {cardBusy[project.id] ? "Opening…" : "Open session"}
                  </button>
                )}
                {confirmRemove === project.id ? (
                  <InlineConfirm
                    question="remove?"
                    onConfirm={() => {
                      setConfirmRemove(undefined);
                      removeProject(project.id).catch((cause: Error) =>
                        setCardError((current) => ({
                          ...current,
                          [project.id]: cause.message,
                        })),
                      );
                    }}
                    onCancel={() => setConfirmRemove(undefined)}
                  />
                ) : (
                  <button
                    type="button"
                    title={
                      liveSession
                        ? "End the live session before removing"
                        : "Remove from Spex (repo stays on disk)"
                    }
                    aria-label={`Remove ${project.name}`}
                    disabled={Boolean(liveSession)}
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-red-500 disabled:opacity-30 dark:hover:bg-neutral-800"
                    onClick={() => setConfirmRemove(project.id)}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
              {cardError[project.id] ? (
                <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {cardError[project.id]}
                </div>
              ) : null}
              <details className="group">
                <summary className="cursor-pointer select-none text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                  Issues &amp; PRs
                </summary>
                <div className="mt-2">
                  <ForgePanel meta={meta} />
                </div>
              </details>
            </li>
          );
        })}
        {projects.length === 0 ? (
          <li className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Add a local git repo to run playbooks in it — or just{" "}
            {onNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate("Sessions")}
                className="text-indigo-600 hover:underline dark:text-indigo-300"
              >
                start from Sessions
              </button>
            ) : (
              "start from Sessions"
            )}
            .
          </li>
        ) : null}
      </ul>
    </div>
  );
}

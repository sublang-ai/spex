// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App shell: navigation rail, session tabs, connection state. The
// Dashboard, Projects, Library, and Settings surfaces land in their
// own iterations; Projects here is the minimal session launcher.

import { useState } from "react";

import { useAppStore } from "./state/store.js";
import { RunView } from "./components/RunView.js";

const SURFACES = ["Sessions", "Projects"] as const;
type Surface = (typeof SURFACES)[number];

function ConnectionBadge() {
  const connection = useAppStore((state) => state.connection);
  const styles: Record<string, string> = {
    open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    connecting:
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    closed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    mismatch: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  };
  return (
    <span
      data-testid="connection-badge"
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[connection]}`}
    >
      {connection === "mismatch" ? "protocol mismatch" : connection}
    </span>
  );
}

function ProjectsSurface() {
  const projects = useAppStore((state) => state.projects);
  const sessions = useAppStore((state) => state.sessions);
  const registerProject = useAppStore((state) => state.registerProject);
  const openSession = useAppStore((state) => state.openSession);
  const removeProject = useAppStore((state) => state.removeProject);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string>();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">Projects</h1>
      <div className="flex gap-2">
        <input
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="/absolute/path/to/a/git/repo"
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          disabled={!path.trim()}
          onClick={() => {
            setError(undefined);
            registerProject(path.trim())
              .then(() => setPath(""))
              .catch((cause: Error) => setError(cause.message));
          }}
        >
          Register
        </button>
      </div>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {projects.map((project) => {
          const live = sessions.some(
            (session) => session.live && session.projectId === project.id,
          );
          return (
            <li
              key={project.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{project.name}</div>
                <div className="truncate text-xs text-neutral-500">
                  {project.path}
                </div>
              </div>
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

function SessionsSurface() {
  const sessions = useAppStore((state) => state.sessions);
  const views = useAppStore((state) => state.views);
  const composers = useAppStore((state) => state.composers);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const focusSession = useAppStore((state) => state.focusSession);
  const disposeSession = useAppStore((state) => state.disposeSession);
  const submitBossText = useAppStore((state) => state.submitBossText);
  const abortTurn = useAppStore((state) => state.abortTurn);

  const live = sessions.filter((session) => session.live);
  const active =
    live.find((session) => session.id === activeSessionId) ?? live[0];

  if (!active) {
    return (
      <div className="m-auto max-w-md p-6 text-center text-sm text-neutral-500">
        No live session. Open one from{" "}
        <span className="font-medium">Projects</span> to start running
        playbooks.
      </div>
    );
  }

  const view = views[active.id];
  const composer = composers[active.id] ?? { queued: [], answering: false };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-neutral-200 px-3 pt-2 dark:border-neutral-800">
        {live.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => void focusSession(session.id)}
            className={`rounded-t-md px-3 py-1.5 text-sm ${
              session.id === active.id
                ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {session.projectPath.split("/").pop()}
          </button>
        ))}
        <button
          type="button"
          title="End session"
          className="ml-auto pb-1 text-xs text-neutral-400 hover:text-red-500"
          onClick={() => void disposeSession(active.id)}
        >
          end session
        </button>
      </div>
      {view ? (
        <RunView
          session={active}
          view={view}
          composer={composer}
          onSubmit={(text) => void submitBossText(active.id, text)}
          onAbort={() => void abortTurn(active.id)}
        />
      ) : null}
    </div>
  );
}

export function App() {
  const [surface, setSurface] = useState<Surface>("Projects");
  const configState = useAppStore((state) => state.configState);

  return (
    <div className="flex h-full">
      <nav className="flex w-44 flex-col gap-1 border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-base font-bold tracking-tight">Spex</span>
          <ConnectionBadge />
        </div>
        {SURFACES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setSurface(name)}
            className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
              surface === name
                ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            {name}
          </button>
        ))}
        <div className="mt-auto px-1 text-[11px] text-neutral-400">
          {configState?.status === "invalid" ? (
            <span className="text-red-500">config invalid</span>
          ) : configState?.status === "valid" ? (
            `${configState.summary.playbooks.length} playbook(s)`
          ) : null}
        </div>
      </nav>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {surface === "Projects" ? <ProjectsSurface /> : <SessionsSurface />}
      </main>
    </div>
  );
}

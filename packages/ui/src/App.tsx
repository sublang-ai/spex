// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App shell: navigation rail, session tabs, connection state. The
// Dashboard, Projects, Library, and Settings surfaces land in their
// own iterations; Projects here is the minimal session launcher.

import { useState } from "react";

import { useAppStore } from "./state/store.js";
import { RunView } from "./components/RunView.js";
import { ProjectsSurface } from "./components/ProjectsSurface.js";
import { DashboardSurface } from "./components/DashboardSurface.js";

const SURFACES = ["Dashboard", "Sessions", "Projects"] as const;
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
  const [surface, setSurface] = useState<Surface>("Dashboard");
  const configState = useAppStore((state) => state.configState);
  const focusSession = useAppStore((state) => state.focusSession);

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
        {surface === "Projects" ? (
          <ProjectsSurface />
        ) : surface === "Dashboard" ? (
          <DashboardSurface
            onOpenSession={(sessionId) => {
              void focusSession(sessionId);
              setSurface("Sessions");
            }}
          />
        ) : (
          <SessionsSurface />
        )}
      </main>
    </div>
  );
}

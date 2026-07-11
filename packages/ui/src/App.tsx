// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App shell: Sessions-first navigation (DR-007), session tabs with a
// "+" start tab, connection banner, and cross-surface navigation.

import { useMemo, useState } from "react";
import type { SessionInfo } from "@sublang/spex-core/protocol";

import { getClient, useAppStore } from "./state/store.js";
import { RunView } from "./components/RunView.js";
import { StartView } from "./components/StartView.js";
import { ProjectsSurface } from "./components/ProjectsSurface.js";
import { DashboardSurface } from "./components/DashboardSurface.js";
import { LibrarySurface } from "./components/LibrarySurface.js";
import { SettingsSurface } from "./components/SettingsSurface.js";

const SURFACES = [
  "Sessions",
  "Dashboard",
  "Projects",
  "Library",
  "Settings",
] as const;
export type Surface = (typeof SURFACES)[number];

declare global {
  interface Window {
    spexNative?: { pickDirectory(): Promise<string | null> };
  }
}

function ConnectionBanner() {
  const connection = useAppStore((state) => state.connection);
  if (connection === "open") return null;
  if (connection === "mismatch") {
    return (
      <div className="border-b border-red-300 bg-red-50 px-4 py-1.5 text-center text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        The Spex window and its core speak different protocol versions —
        restart the app (or update Spex) to fix this.
      </div>
    );
  }
  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      Reconnecting to the Spex core… actions are paused until the
      connection returns.
    </div>
  );
}

/** Tab titles: basename, disambiguated by parent dir on collisions. */
export function tabTitles(sessions: SessionInfo[]): Map<string, string> {
  const base = (path: string) => path.split("/").filter(Boolean).pop() ?? path;
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const name = base(session.projectPath);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const titles = new Map<string, string>();
  for (const session of sessions) {
    const parts = session.projectPath.split("/").filter(Boolean);
    const name = parts.pop() ?? session.projectPath;
    titles.set(
      session.id,
      (counts.get(name) ?? 0) > 1 && parts.length > 0
        ? `${name} — ${parts[parts.length - 1]}`
        : name,
    );
  }
  return titles;
}

function SessionsSurface() {
  const sessions = useAppStore((state) => state.sessions);
  const views = useAppStore((state) => state.views);
  const composers = useAppStore((state) => state.composers);
  const runErrors = useAppStore((state) => state.runErrors);
  const connection = useAppStore((state) => state.connection);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const focusSession = useAppStore((state) => state.focusSession);
  const disposeSession = useAppStore((state) => state.disposeSession);
  const submitBossText = useAppStore((state) => state.submitBossText);
  const removeQueued = useAppStore((state) => state.removeQueued);
  const abortTurn = useAppStore((state) => state.abortTurn);
  const clearRunError = useAppStore((state) => state.clearRunError);

  const configState = useAppStore((state) => state.configState);
  const readiness = useAppStore((state) => state.readiness);
  const projects = useAppStore((state) => state.projects);
  const registerProject = useAppStore((state) => state.registerProject);
  const createProject = useAppStore((state) => state.createProject);
  const openSession = useAppStore((state) => state.openSession);

  const [onStartTab, setOnStartTab] = useState(false);

  const live = sessions.filter((session) => session.live);
  const titles = useMemo(() => tabTitles(live), [live]);
  const active =
    live.find((session) => session.id === activeSessionId) ?? live[0];
  const showStart = onStartTab || !active;

  const summary =
    configState?.status === "valid" ? configState.summary : undefined;

  const startView = (
    <StartView
      projects={projects}
      playbooks={summary?.playbooks ?? []}
      captainRef={summary?.captain ?? ""}
      profiles={summary?.profiles ?? []}
      readiness={readiness}
      connected={connection === "open"}
      onPickFolder={
        window.spexNative
          ? () => window.spexNative!.pickDirectory()
          : undefined
      }
      onRegisterPath={registerProject}
      onCreateProject={createProject}
      onCaptainChange={(ref) => {
        void getClient()
          .command("config.edit", { op: { kind: "captain.set", ref } })
          .catch(() => {});
      }}
      onStart={async (projectId, text) => {
        const session = await openSession(projectId);
        await submitBossText(session.id, text);
        setOnStartTab(false);
      }}
    />
  );

  if (live.length === 0) {
    return <div className="flex min-h-0 flex-1 flex-col">{startView}</div>;
  }

  const view = active ? views[active.id] : undefined;
  const composer = active
    ? (composers[active.id] ?? { queued: [], answering: false })
    : { queued: [], answering: false };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-neutral-200 px-3 pt-2 dark:border-neutral-800">
        {live.map((session) => (
          <span
            key={session.id}
            className={`flex max-w-[14rem] items-center gap-1 rounded-t-md px-3 py-1.5 text-sm ${
              !showStart && session.id === active?.id
                ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
                : "text-neutral-500"
            }`}
          >
            <button
              type="button"
              title={session.projectPath}
              onClick={() => {
                setOnStartTab(false);
                void focusSession(session.id);
              }}
              className="truncate hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {titles.get(session.id)}
            </button>
            <button
              type="button"
              title="End this session"
              onClick={() => {
                const running = views[session.id]?.turnActive;
                if (
                  running &&
                  !window.confirm(
                    `A turn is still running in ${titles.get(session.id)}. End the session and abort it?`,
                  )
                ) {
                  return;
                }
                void disposeSession(session.id).catch(() => {});
              }}
              className="text-neutral-400 hover:text-red-500"
            >
              ✕
            </button>
          </span>
        ))}
        <button
          type="button"
          title="Start another session"
          onClick={() => setOnStartTab(true)}
          className={`rounded-t-md px-3 py-1.5 text-sm ${
            showStart
              ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          +
        </button>
      </div>
      {showStart ? (
        startView
      ) : active && view ? (
        view.loading ? (
          <div className="m-auto text-sm text-neutral-400">
            loading transcript…
          </div>
        ) : (
          <RunView
            key={active.id}
            session={active}
            view={view}
            composer={composer}
            connected={connection === "open"}
            error={runErrors[active.id]}
            onSubmit={(text) => submitBossText(active.id, text)}
            onAbort={() => void abortTurn(active.id)}
            onRemoveQueued={(index) => removeQueued(active.id, index)}
            onDismissError={() => clearRunError(active.id)}
          />
        )
      ) : null}
    </div>
  );
}

export function App() {
  const [surface, setSurface] = useState<Surface>("Sessions");
  const configState = useAppStore((state) => state.configState);
  const focusSession = useAppStore((state) => state.focusSession);

  const openSessionAndShow = (sessionId: string) => {
    void focusSession(sessionId);
    setSurface("Sessions");
  };

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner />
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-44 flex-col gap-1 border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-2 px-1">
            <span className="text-base font-bold tracking-tight">Spex</span>
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
          <div className="mt-auto px-1 text-[11px]">
            {configState && configState.status !== "valid" ? (
              <button
                type="button"
                onClick={() => setSurface("Settings")}
                className="rounded border border-red-300 px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                title="Open Settings to see what's wrong"
              >
                config {configState.status} →
              </button>
            ) : configState?.status === "valid" ? (
              <span className="text-neutral-400">
                {configState.summary.playbooks.length} playbook(s)
              </span>
            ) : null}
          </div>
        </nav>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {surface === "Projects" ? (
            <ProjectsSurface onOpenSession={openSessionAndShow} />
          ) : surface === "Library" ? (
            <LibrarySurface />
          ) : surface === "Settings" ? (
            <SettingsSurface />
          ) : surface === "Dashboard" ? (
            <DashboardSurface
              onOpenSession={openSessionAndShow}
              onNavigate={setSurface}
            />
          ) : (
            <SessionsSurface />
          )}
        </main>
      </div>
    </div>
  );
}

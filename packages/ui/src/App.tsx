// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App shell: Sessions-first navigation (DR-007), session tabs with a
// "+" start tab, connection banner, and cross-surface navigation.

import { useMemo, useState } from "react";
import type { SessionInfo } from "@sublang/spex-core/protocol";

import { useAppStore } from "./state/store.js";
import { deriveAttention } from "./state/dashboard.js";
import { saveProfileEssentials, setCaptain } from "./lib/config-ops.js";
import { RunView } from "./components/RunView.js";
import { CaptainHome } from "./components/CaptainHome.js";
import { ProjectsSurface } from "./components/ProjectsSurface.js";
import { DashboardSurface } from "./components/DashboardSurface.js";
import { LibrarySurface } from "./components/LibrarySurface.js";
import { SettingsSurface } from "./components/SettingsSurface.js";

const SURFACES = [
  "Sessions",
  "Dashboard",
  "Projects",
  "Playbooks",
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
  const everConnected = useAppStore((state) => state.everConnected);
  if (connection === "open") return null;
  // The first connect is not a "reconnect" — don't alarm a fresh boot.
  if (!everConnected && connection !== "mismatch") return null;
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

function SessionsSurface({ onNavigate }: { onNavigate: (surface: Surface) => void }) {
  const sessions = useAppStore((state) => state.sessions);
  const views = useAppStore((state) => state.views);
  const composers = useAppStore((state) => state.composers);
  const runErrors = useAppStore((state) => state.runErrors);
  const connection = useAppStore((state) => state.connection);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const focusSession = useAppStore((state) => state.focusSession);
  const loadPastSession = useAppStore((state) => state.loadPastSession);
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
  const [pastId, setPastId] = useState<string>();
  const [ending, setEnding] = useState<Record<string, boolean>>({});

  const live = sessions.filter((session) => session.live);
  const past = sessions
    .filter((session) => !session.live)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  const titles = useMemo(() => tabTitles(live), [live]);
  const active =
    live.find((session) => session.id === activeSessionId) ?? live[0];
  const showStart = onStartTab || !active;

  const summary =
    configState?.status === "valid" ? configState.summary : undefined;

  const startView = (
    <CaptainHome
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
      onInitProject={(path) => createProject(path, false)}
      onNavigate={onNavigate}
      onSelectCaptain={setCaptain}
      onSaveProfile={saveProfileEssentials}
      pastSessions={past.map((session) => ({
        id: session.id,
        projectName: session.projectPath.split("/").pop() ?? session.projectPath,
        endedAt: session.endedAt,
      }))}
      onOpenPast={(sessionId) => {
        setPastId(sessionId);
        void loadPastSession(sessionId).catch(() => {});
      }}
      onStart={async (projectId, text) => {
        const session = await openSession(projectId);
        await submitBossText(session.id, text);
        setOnStartTab(false);
        setPastId(undefined);
      }}
    />
  );

  const pastSession = past.find((session) => session.id === pastId);
  const pastView = pastId ? views[pastId] : undefined;
  const pastTranscript =
    pastSession && pastView ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setPastId(undefined)}
            className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            ← Back
          </button>
          <span className="font-medium">
            {pastSession.projectPath.split("/").pop()}
          </span>
          <span className="text-xs text-neutral-400">
            ended{" "}
            {pastSession.endedAt
              ? new Date(pastSession.endedAt).toLocaleString()
              : ""}
          </span>
        </div>
        <RunView
          key={pastSession.id}
          session={pastSession}
          view={pastView}
          composer={{ queued: [] }}
          connected={connection === "open"}
          readOnly
          onStartNew={() => {
            setPastId(undefined);
            void openSession(pastSession.projectId).catch(() => {});
          }}
          onSubmit={async () => {}}
          onAbort={() => {}}
          onRemoveQueued={() => {}}
          onDismissError={() => {}}
        />
      </div>
    ) : null;

  if (pastTranscript && (live.length === 0 || onStartTab)) {
    return pastTranscript;
  }
  if (live.length === 0) {
    return <div className="flex min-h-0 flex-1 flex-col">{startView}</div>;
  }

  const view = active ? views[active.id] : undefined;
  const composer = active
    ? (composers[active.id] ?? { queued: [] })
    : { queued: [] };

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
                setPastId(undefined);
                void focusSession(session.id);
              }}
              className="truncate hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {titles.get(session.id)}
            </button>
            <button
              type="button"
              title={
                ending[session.id]
                  ? "Shutting down the agents…"
                  : "End this session"
              }
              disabled={ending[session.id]}
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
                setEnding((current) => ({ ...current, [session.id]: true }));
                void disposeSession(session.id)
                  .catch(() => {})
                  .finally(() =>
                    setEnding((current) => ({
                      ...current,
                      [session.id]: false,
                    })),
                  );
              }}
              className="text-neutral-400 hover:text-red-500 disabled:animate-pulse"
            >
              {ending[session.id] ? "…" : "✕"}
            </button>
          </span>
        ))}
        <button
          type="button"
          title="Start another session"
          onClick={() => {
            setPastId(undefined);
            setOnStartTab(true);
          }}
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
            playbooks={summary?.playbooks ?? []}
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
  const sessions = useAppStore((state) => state.sessions);
  const views = useAppStore((state) => state.views);
  const attentionCount = deriveAttention(sessions, views).filter(
    (item) => item.kind !== "idle",
  ).length;

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
              {name === "Sessions" && attentionCount > 0 ? (
                <span
                  data-testid="nav-attention-badge"
                  className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                >
                  {attentionCount}
                </span>
              ) : null}
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
          ) : surface === "Playbooks" ? (
            <LibrarySurface />
          ) : surface === "Settings" ? (
            <SettingsSurface />
          ) : surface === "Dashboard" ? (
            <DashboardSurface
              onOpenSession={openSessionAndShow}
              onNavigate={setSurface}
            />
          ) : (
            <SessionsSurface onNavigate={setSurface} />
          )}
        </main>
      </div>
    </div>
  );
}

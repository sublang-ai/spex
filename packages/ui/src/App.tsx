// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App shell: Sessions-first navigation (DR-007), session tabs with a
// "+" start tab, connection banner, keyboard shortcuts (DR-010 §6),
// and cross-surface navigation.

import { useEffect, useMemo, useRef, useState } from "react";
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
import { InlineConfirm } from "./components/InlineConfirm.js";
import { Icon } from "./components/Icon.js";

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

/** Connected-but-blank is never presented as normal (DR-010 §5). */
function RefreshErrorBanner() {
  const refreshError = useAppStore((state) => state.refreshError);
  const refresh = useAppStore((state) => state.refresh);
  const connection = useAppStore((state) => state.connection);
  if (!refreshError || connection !== "open") return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      Connected, but {refreshError}
      <button
        type="button"
        onClick={() =>
          void refresh()
            .then(() => useAppStore.setState({ refreshError: undefined }))
            .catch((cause: Error) =>
              useAppStore.setState({
                refreshError: `app state failed to load: ${cause.message}`,
              }),
            )
        }
        className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
      >
        Retry
      </button>
    </div>
  );
}

/** One persistent polite live region (DR-010 §7): announces the
 * moments the product is built around without spamming. */
function Announcer() {
  const sessions = useAppStore((state) => state.sessions);
  const views = useAppStore((state) => state.views);
  const connection = useAppStore((state) => state.connection);
  const everConnected = useAppStore((state) => state.everConnected);
  const [message, setMessage] = useState("");
  const blocking = deriveAttention(sessions, views).filter(
    (item) => item.kind !== "idle",
  );
  const blockingCount = blocking.length;
  const latestDetail =
    blocking[0]?.kind === "question" ? blocking[0]?.text : undefined;
  const lastCount = useRef(0);
  const lastConnection = useRef(connection);

  useEffect(() => {
    if (blockingCount > lastCount.current) {
      setMessage(
        latestDetail
          ? `A player is waiting for your reply: ${latestDetail}`
          : `${blockingCount} session${blockingCount === 1 ? " needs" : "s need"} your attention`,
      );
    }
    lastCount.current = blockingCount;
  }, [blockingCount, latestDetail]);

  useEffect(() => {
    if (!everConnected) return;
    if (connection !== lastConnection.current) {
      if (connection === "open") setMessage("Connection restored.");
      else if (connection === "closed")
        setMessage("Connection to the Spex core lost — reconnecting.");
      lastConnection.current = connection;
    }
  }, [connection, everConnected]);

  return (
    <div aria-live="polite" role="status" className="sr-only">
      {message}
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

function SessionsSurface({
  onNavigate,
  onStartTab,
  setOnStartTab,
}: {
  onNavigate: (surface: Surface) => void;
  onStartTab: boolean;
  setOnStartTab: (value: boolean) => void;
}) {
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
  const setDraft = useAppStore((state) => state.setDraft);
  const homeDraft = useAppStore((state) => state.homeDraft);
  const setHomeDraft = useAppStore((state) => state.setHomeDraft);
  const refreshReadiness = useAppStore((state) => state.refreshReadiness);

  const configState = useAppStore((state) => state.configState);
  const readiness = useAppStore((state) => state.readiness);
  const projects = useAppStore((state) => state.projects);
  const registerProject = useAppStore((state) => state.registerProject);
  const createProject = useAppStore((state) => state.createProject);
  const openSession = useAppStore((state) => state.openSession);

  const [pastId, setPastId] = useState<string>();
  const [ending, setEnding] = useState<Record<string, boolean>>({});
  const [confirmClose, setConfirmClose] = useState<string>();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const live = sessions.filter((session) => session.live);
  const past = sessions
    .filter((session) => !session.live)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  const titles = useMemo(() => tabTitles(live), [live]);
  const active =
    live.find((session) => session.id === activeSessionId) ?? live[0];
  const showStart = onStartTab || !active;

  // Attention dots on background tabs close the badge → surface → tab
  // chain (DR-009/DR-010): same derivation as the nav badge, so the
  // signals never disagree.
  const attention = useMemo(
    () => deriveAttention(sessions, views),
    [sessions, views],
  );
  const attentionBySession = new Map(
    attention
      .filter((item) => item.kind !== "idle")
      .map((item) => [item.sessionId, item]),
  );

  // Keep the active tab reachable when the strip scrolls.
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    tabRefs.current
      .get(activeId)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeId]);

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
      configStatus={configState?.status}
      configErrors={
        configState && configState.status === "invalid"
          ? configState.errors
          : undefined
      }
      draft={homeDraft}
      onDraftChange={setHomeDraft}
      onRecheckReadiness={refreshReadiness}
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
        {pastView.loading ? (
          <div className="m-auto text-sm text-neutral-400">
            loading transcript…
          </div>
        ) : (
          <RunView
            key={pastSession.id}
            session={pastSession}
            view={pastView}
            composer={{ queued: [] }}
            connected={connection === "open"}
            error={runErrors[pastSession.id]}
            readOnly
            onRetryLoad={() => {
              void loadPastSession(pastSession.id, true).catch(() => {});
            }}
            onStartNew={() => {
              setPastId(undefined);
              void openSession(pastSession.projectId).catch(() => {});
            }}
            onSubmit={async () => {}}
            onAbort={() => {}}
            onRemoveQueued={() => {}}
            onDismissError={() => clearRunError(pastSession.id)}
          />
        )}
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

  function closeSession(session: SessionInfo): void {
    setConfirmClose(undefined);
    setEnding((current) => ({ ...current, [session.id]: true }));
    const index = live.findIndex((entry) => entry.id === session.id);
    void disposeSession(session.id)
      .catch(() => {})
      .finally(() => {
        setEnding((current) => ({ ...current, [session.id]: false }));
        // Keyboard flow: focus the neighboring tab, never <body>.
        const neighbor = live[index + 1] ?? live[index - 1];
        if (neighbor) tabRefs.current.get(neighbor.id)?.focus();
      });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-neutral-200 px-3 pt-2 dark:border-neutral-800">
        <div
          role="tablist"
          aria-label="Live sessions"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {live.map((session) => {
            const attentionItem = attentionBySession.get(session.id);
            const isActive = !showStart && session.id === active?.id;
            const queuedCount = composers[session.id]?.queued.length ?? 0;
            return (
              <span
                key={session.id}
                className={`flex min-w-[6rem] max-w-[14rem] items-center gap-1 rounded-t-md px-3 py-1.5 text-sm ${
                  isActive
                    ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
                    : "text-neutral-500"
                }`}
              >
                {confirmClose === session.id ? (
                  <InlineConfirm
                    question={
                      (views[session.id]?.turnActive
                        ? "A turn is running — end?"
                        : "End session?") +
                      (queuedCount > 0
                        ? ` ${queuedCount} queued message${queuedCount === 1 ? "" : "s"} will be discarded.`
                        : "")
                    }
                    confirmLabel="end"
                    cancelLabel="keep"
                    onConfirm={() => closeSession(session)}
                    onCancel={() => setConfirmClose(undefined)}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      ref={(element) => {
                        if (element) tabRefs.current.set(session.id, element);
                        else tabRefs.current.delete(session.id);
                      }}
                      title={
                        attentionItem
                          ? `${session.projectPath} — ${attentionItem.text}`
                          : session.projectPath
                      }
                      onClick={() => {
                        setOnStartTab(false);
                        setPastId(undefined);
                        void focusSession(session.id);
                      }}
                      className="flex min-w-0 items-center gap-1.5 hover:text-neutral-900 dark:hover:text-neutral-100"
                    >
                      {attentionItem && !isActive ? (
                        <span
                          data-testid={`tab-attention-${session.id}`}
                          aria-hidden
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            attentionItem.kind === "failure"
                              ? "bg-red-500"
                              : "bg-amber-500"
                          }`}
                        />
                      ) : null}
                      <span className="truncate">
                        {titles.get(session.id)}
                      </span>
                    </button>
                    <button
                      type="button"
                      title={
                        ending[session.id]
                          ? "Shutting down the agents…"
                          : "End this session"
                      }
                      aria-label={`End session ${titles.get(session.id)}`}
                      disabled={ending[session.id]}
                      onClick={() => setConfirmClose(session.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-red-500 disabled:animate-pulse dark:hover:bg-neutral-800"
                    >
                      {ending[session.id] ? (
                        "…"
                      ) : (
                        <Icon name="close" className="h-3 w-3" />
                      )}
                    </button>
                  </>
                )}
              </span>
            );
          })}
        </div>
        <button
          type="button"
          title="Start another session"
          aria-label="Start another session"
          onClick={() => {
            setPastId(undefined);
            setOnStartTab(true);
          }}
          className={`shrink-0 rounded-t-md px-3 py-1.5 text-sm ${
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
            onDraftChange={(draft) => setDraft(active.id, draft)}
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
  const [onStartTab, setOnStartTab] = useState(false);
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

  // Returning from a terminal sign-in self-heals readiness (DR-009).
  useEffect(() => {
    const onFocus = () => {
      const state = useAppStore.getState();
      if (
        state.connection === "open" &&
        state.readiness.some((entry) => entry.ready === false)
      ) {
        void state.refreshReadiness().catch(() => {});
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Application shortcuts (DR-010 §6), renderer-side so the UI runs
  // unmodified in a browser (SHELL-10): Cmd/Ctrl+1..5 surfaces,
  // Cmd/Ctrl+, settings, Cmd/Ctrl+N new session, Cmd/Ctrl+Shift+[ ]
  // cycles session tabs, and typing outside an input refocuses the
  // composer.
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && !event.shiftKey && !event.altKey) {
        const index = Number.parseInt(event.key, 10);
        if (index >= 1 && index <= SURFACES.length) {
          event.preventDefault();
          setSurface(SURFACES[index - 1]);
          return;
        }
        if (event.key === ",") {
          event.preventDefault();
          setSurface("Settings");
          return;
        }
        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          setSurface("Sessions");
          setOnStartTab(true);
          return;
        }
      }
      if (meta && event.shiftKey) {
        if (event.code === "BracketLeft" || event.code === "BracketRight") {
          const state = useAppStore.getState();
          const live = state.sessions.filter((session) => session.live);
          if (live.length < 2) return;
          event.preventDefault();
          const current = Math.max(
            0,
            live.findIndex((session) => session.id === state.activeSessionId),
          );
          const delta = event.code === "BracketRight" ? 1 : -1;
          const next = live[(current + delta + live.length) % live.length];
          setSurface("Sessions");
          setOnStartTab(false);
          void state.focusSession(next.id);
          return;
        }
      }
      // Type-to-compose (IM convention): a printable key outside any
      // input lands in the Boss composer.
      if (
        !meta &&
        !event.altKey &&
        event.key.length === 1 &&
        surface === "Sessions"
      ) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (
          tag !== "INPUT" &&
          tag !== "TEXTAREA" &&
          tag !== "SELECT" &&
          !target?.isContentEditable
        ) {
          const composer = document.querySelector<HTMLTextAreaElement>(
            '[data-testid="boss-composer"], [data-testid="start-composer"]',
          );
          composer?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [surface]);

  const playbookCount =
    configState?.status === "valid"
      ? configState.summary.playbooks.length
      : undefined;

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner />
      <RefreshErrorBanner />
      <Announcer />
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
              aria-current={surface === name ? "page" : undefined}
              aria-label={
                name === "Sessions" && attentionCount > 0
                  ? `Sessions — ${attentionCount} need${attentionCount === 1 ? "s" : ""} your attention`
                  : undefined
              }
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
                  aria-hidden
                  title={`${attentionCount} session${attentionCount === 1 ? "" : "s"} need${attentionCount === 1 ? "s" : ""} your reply`}
                  className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-200"
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
            ) : playbookCount !== undefined ? (
              <span className="text-neutral-400">
                {playbookCount === 0
                  ? "No playbooks yet"
                  : `${playbookCount} playbook${playbookCount === 1 ? "" : "s"}`}
              </span>
            ) : null}
          </div>
        </nav>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {surface === "Projects" ? (
            <ProjectsSurface
              onOpenSession={openSessionAndShow}
              onNavigate={setSurface}
            />
          ) : surface === "Playbooks" ? (
            <LibrarySurface onNavigate={setSurface} />
          ) : surface === "Settings" ? (
            <SettingsSurface />
          ) : surface === "Dashboard" ? (
            <DashboardSurface
              onOpenSession={openSessionAndShow}
              onNavigate={setSurface}
            />
          ) : (
            <SessionsSurface
              onNavigate={setSurface}
              onStartTab={onStartTab}
              setOnStartTab={setOnStartTab}
            />
          )}
        </main>
      </div>
    </div>
  );
}

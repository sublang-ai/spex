// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App shell (DR-011): project-first Workspace — a project bar over
// the project's session tabs plus pinned Specs and Repo tabs — with
// Dashboard, Playbooks, and Settings alongside. Keyboard shortcuts
// live renderer-side so the UI runs unmodified in a browser
// (SHELL-10).

import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionInfo } from "@sublang/spex-core/protocol";

import { useAppStore } from "./state/store.js";
import { deriveAttention } from "./state/dashboard.js";
import { saveProfileEssentials, setCaptain } from "./lib/config-ops.js";
import type { SessionView } from "./state/reducer.js";
import { RunView } from "./components/RunView.js";
import { CaptainHome } from "./components/CaptainHome.js";
import { DashboardSurface } from "./components/DashboardSurface.js";
import { LibrarySurface } from "./components/LibrarySurface.js";
import { SettingsSurface } from "./components/SettingsSurface.js";
import { RepoTab } from "./components/ProjectsSurface.js";
import { ProjectPalette } from "./components/ProjectPalette.js";
import {
  SpecView,
  initialSpecViewState,
  type SpecViewState,
} from "./components/SpecView.js";
import { InlineConfirm } from "./components/InlineConfirm.js";
import { Icon } from "./components/Icon.js";
import monogram from "./assets/sublang-monogram.png";

const SURFACES = ["Workspace", "Dashboard", "Playbooks", "Settings"] as const;
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
        className="font-medium text-brand-700 hover:underline dark:text-brand-300"
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

/** Session tab identity (DR-011): the first Boss turn names the tab
 * — the project name lives in the bar, not on tabs. */
export function sessionTitle(view: SessionView | undefined): string {
  const first = view?.captain.find((line) => line.kind === "boss");
  if (!first) return "new session";
  const flat = first.text.replace(/\s+/g, " ").trim();
  return flat.length > 26 ? `${flat.slice(0, 26)}…` : flat;
}

function sessionTooltip(
  session: SessionInfo,
  view: SessionView | undefined,
): string {
  const first = view?.captain.find((line) => line.kind === "boss");
  const started = new Date(session.createdAt).toLocaleString();
  return first ? `${first.text}\nstarted ${started}` : `started ${started}`;
}

function WorkspaceSurface({
  onNavigate,
  onOpenPalette,
}: {
  onNavigate: (surface: Surface) => void;
  onOpenPalette: () => void;
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
  const openSession = useAppStore((state) => state.openSession);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const setCurrentProject = useAppStore((state) => state.setCurrentProject);
  const workspaceTabs = useAppStore((state) => state.workspaceTabs);
  const setWorkspaceTab = useAppStore((state) => state.setWorkspaceTab);
  const specTrees = useAppStore((state) => state.specTrees);
  const specErrors = useAppStore((state) => state.specErrors);
  const loadSpecs = useAppStore((state) => state.loadSpecs);
  const readSpecRecord = useAppStore((state) => state.readSpecRecord);

  const [pastId, setPastId] = useState<string>();
  const [pastScope, setPastScope] = useState<"project" | "all">("project");
  const [ending, setEnding] = useState<Record<string, boolean>>({});
  const [confirmClose, setConfirmClose] = useState<string>();
  const [specViewStates, setSpecViewStates] = useState<
    Record<string, SpecViewState>
  >({});
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const project = projects.find((entry) => entry.id === currentProjectId);
  const live = sessions.filter(
    (session) => session.live && session.projectId === currentProjectId,
  );
  const past = sessions
    .filter((session) => !session.live)
    .filter(
      (session) =>
        pastScope === "all" || session.projectId === currentProjectId,
    )
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));

  // The workspace tab: per-project memory with live fallbacks.
  const remembered = currentProjectId
    ? workspaceTabs[currentProjectId]
    : undefined;
  const tab =
    remembered === "start" || remembered === "specs" || remembered === "repo"
      ? remembered
      : remembered && live.some((session) => session.id === remembered)
        ? remembered
        : (live.find((session) => session.id === activeSessionId)?.id ??
          live[0]?.id ??
          "start");

  // Attention dots on background tabs (DR-009/DR-011): the same
  // derivation as the nav badge, so the signals never disagree.
  const attention = useMemo(
    () => deriveAttention(sessions, views),
    [sessions, views],
  );
  const attentionBySession = new Map(
    attention
      .filter((item) => item.kind !== "idle")
      .map((item) => [item.sessionId, item]),
  );
  const otherAttention = attention.filter((item) => {
    if (item.kind === "idle") return false;
    const session = sessions.find((s) => s.id === item.sessionId);
    return session && session.projectId !== currentProjectId;
  });
  const otherWorst = otherAttention.some((item) => item.kind === "failure")
    ? "failure"
    : otherAttention[0]?.kind;

  // Keep the active tab reachable when the strip scrolls.
  useEffect(() => {
    tabRefs.current
      .get(tab)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [tab]);

  // Spec freshness (DR-011): re-read on tab activation and window
  // focus while the Specs tab is up; turn ends refresh via the store.
  useEffect(() => {
    if (tab !== "specs" || !currentProjectId) return;
    void loadSpecs(currentProjectId);
    const onFocus = () => void loadSpecs(currentProjectId);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, currentProjectId]);

  const summary =
    configState?.status === "valid" ? configState.summary : undefined;

  function pickTab(next: string): void {
    if (!currentProjectId) return;
    setPastId(undefined);
    if (next !== "start" && next !== "specs" && next !== "repo") {
      void focusSession(next);
    } else {
      setWorkspaceTab(currentProjectId, next);
    }
  }

  const startView = (
    <CaptainHome
      hasProject={Boolean(project)}
      projectName={project?.name}
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
      onOpenPalette={onOpenPalette}
      onNavigate={(surface) => onNavigate(surface)}
      onSelectCaptain={setCaptain}
      onSaveProfile={saveProfileEssentials}
      pastSessions={past.map((session) => ({
        id: session.id,
        projectName:
          session.projectPath.split("/").pop() ?? session.projectPath,
        endedAt: session.endedAt,
      }))}
      pastScope={pastScope}
      onTogglePastScope={() =>
        setPastScope((scope) => (scope === "project" ? "all" : "project"))
      }
      onOpenPast={(sessionId) => {
        setPastId(sessionId);
        void loadPastSession(sessionId).catch(() => {});
      }}
      onStart={async (text) => {
        if (!currentProjectId) return;
        const session = await openSession(currentProjectId);
        await submitBossText(session.id, text);
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

  const bar = (
    <div className="flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-1.5 dark:border-neutral-800 dark:bg-neutral-900">
      <button
        type="button"
        data-testid="project-bar-chip"
        onClick={onOpenPalette}
        title={
          project
            ? `${project.path} — switch project (⌘P)`
            : "Choose a project (⌘P)"
        }
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${
          project
            ? "border-neutral-300 font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            : "border-brand-400 font-medium text-brand-600 dark:border-brand-600 dark:text-brand-300"
        } hover:bg-neutral-100 dark:hover:bg-neutral-800`}
      >
        <Icon name="folder" className="h-3.5 w-3.5" />
        {project ? project.name : "Choose a project"}
        <Icon name="caretDown" className="h-3 w-3 text-neutral-400" />
        {otherAttention.length > 0 ? (
          <span
            data-testid="other-project-attention"
            aria-label={`${otherAttention.length} session${otherAttention.length === 1 ? "" : "s"} in other projects need you`}
            title={`${otherAttention.length} session${otherAttention.length === 1 ? "" : "s"} in other projects need you`}
            className={`ml-0.5 h-2 w-2 rounded-full ${
              otherWorst === "failure" ? "bg-red-500" : "bg-amber-500"
            }`}
          />
        ) : null}
      </button>
    </div>
  );

  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {bar}
        {pastTranscript ?? (
          <div className="flex min-h-0 flex-1 flex-col">{startView}</div>
        )}
      </div>
    );
  }

  const view =
    tab !== "start" && tab !== "specs" && tab !== "repo"
      ? views[tab]
      : undefined;
  const activeSession = live.find((session) => session.id === tab);
  const composer = activeSession
    ? (composers[activeSession.id] ?? { queued: [] })
    : { queued: [] };

  const strip = (
    <div className="flex items-center gap-1 border-b border-neutral-200 px-3 pt-2 dark:border-neutral-800">
      <div
        role="tablist"
        aria-label="Sessions and project views"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {live.map((session) => {
          const attentionItem = attentionBySession.get(session.id);
          const isActive = session.id === tab;
          const queuedCount = composers[session.id]?.queued.length ?? 0;
          const title = sessionTitle(views[session.id]);
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
                        ? `${sessionTooltip(session, views[session.id])}\n${attentionItem.text}`
                        : sessionTooltip(session, views[session.id])
                    }
                    onClick={() => pickTab(session.id)}
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
                    <span className="truncate">{title}</span>
                  </button>
                  <button
                    type="button"
                    title={
                      ending[session.id]
                        ? "Shutting down the agents…"
                        : "End this session"
                    }
                    aria-label={`End session ${title}`}
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
        <button
          type="button"
          role="tab"
          aria-selected={tab === "start" && live.length > 0}
          title="Start another session"
          aria-label="Start another session"
          onClick={() => pickTab("start")}
          className={`shrink-0 rounded-t-md px-3 py-1.5 text-sm ${
            tab === "start"
              ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          +
        </button>
      </div>
      {(["specs", "repo"] as const).map((pinned) => (
        <button
          key={pinned}
          type="button"
          role="tab"
          aria-selected={tab === pinned}
          data-testid={`workspace-tab-${pinned}`}
          ref={(element) => {
            if (element) tabRefs.current.set(pinned, element);
            else tabRefs.current.delete(pinned);
          }}
          title={
            pinned === "specs"
              ? "The project's spec packages (⌘⇧S)"
              : "Repo state, issues and PRs"
          }
          onClick={() => pickTab(pinned)}
          className={`shrink-0 rounded-t-md px-3 py-1.5 text-sm ${
            tab === pinned
              ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          {pinned === "specs" ? "Specs" : "Repo"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {bar}
      {strip}
      {pastTranscript && tab === "start" ? (
        pastTranscript
      ) : tab === "start" ? (
        startView
      ) : tab === "specs" ? (
        <SpecView
          tree={specTrees[project.id]}
          loading={!specTrees[project.id] && !specErrors[project.id]}
          error={specErrors[project.id]}
          onRefresh={() => void loadSpecs(project.id)}
          onReadRecord={(path) => readSpecRecord(project.id, path)}
          viewState={specViewStates[project.id] ?? initialSpecViewState}
          onViewState={(next) =>
            setSpecViewStates((current) => ({
              ...current,
              [project.id]: next,
            }))
          }
        />
      ) : tab === "repo" ? (
        <RepoTab
          projectId={project.id}
          onRemoved={() => setCurrentProject(undefined)}
        />
      ) : activeSession && view ? (
        view.loading ? (
          <div className="m-auto text-sm text-neutral-400">
            loading transcript…
          </div>
        ) : (
          <RunView
            key={activeSession.id}
            session={activeSession}
            view={view}
            composer={composer}
            playbooks={summary?.playbooks ?? []}
            connected={connection === "open"}
            error={runErrors[activeSession.id]}
            onDraftChange={(draft) => setDraft(activeSession.id, draft)}
            onSubmit={(text) => submitBossText(activeSession.id, text)}
            onAbort={() => void abortTurn(activeSession.id)}
            onRemoveQueued={(index) => removeQueued(activeSession.id, index)}
            onDismissError={() => clearRunError(activeSession.id)}
          />
        )
      ) : null}
    </div>
  );
}

export function App() {
  const [surface, setSurface] = useState<Surface>("Workspace");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const configState = useAppStore((state) => state.configState);
  const sessions = useAppStore((state) => state.sessions);
  const views = useAppStore((state) => state.views);
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const focusSession = useAppStore((state) => state.focusSession);
  const attentionCount = deriveAttention(sessions, views).filter(
    (item) => item.kind !== "idle",
  ).length;
  // Last non-Specs tab per project, for the Specs toggle shortcut.
  const prevTabRef = useRef<Record<string, string>>({});

  const openSessionAndShow = (sessionId: string) => {
    void focusSession(sessionId);
    setSurface("Workspace");
  };

  // Picking a project with parked attention lands on the session that
  // needs the human (DR-011), not the last-active tab.
  const pickProject = (projectId: string) => {
    const state = useAppStore.getState();
    const needy = deriveAttention(state.sessions, state.views).find((item) => {
      if (item.kind === "idle") return false;
      const session = state.sessions.find((s) => s.id === item.sessionId);
      return session?.projectId === projectId;
    });
    if (needy) {
      void state.focusSession(needy.sessionId);
    } else {
      state.setCurrentProject(projectId);
    }
    setSurface("Workspace");
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

  // Application shortcuts (DR-010 §6, DR-011), renderer-side so the
  // UI runs unmodified in a browser (SHELL-10).
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const state = useAppStore.getState();
      const projectId = state.currentProjectId;
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
        if (event.key.toLowerCase() === "p") {
          event.preventDefault();
          setPaletteOpen((open) => !open);
          return;
        }
        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          setSurface("Workspace");
          if (projectId) state.setWorkspaceTab(projectId, "start");
          else setPaletteOpen(true);
          return;
        }
      }
      if (meta && event.shiftKey) {
        if (event.code === "KeyS") {
          // Specs ↔ previous tab, one keystroke each way (DR-011).
          if (!projectId) return;
          event.preventDefault();
          setSurface("Workspace");
          const current = state.workspaceTabs[projectId];
          if (current === "specs") {
            state.setWorkspaceTab(
              projectId,
              prevTabRef.current[projectId] ?? "start",
            );
          } else {
            prevTabRef.current[projectId] = current ?? "start";
            state.setWorkspaceTab(projectId, "specs");
          }
          return;
        }
        if (event.code === "BracketLeft" || event.code === "BracketRight") {
          if (!projectId) return;
          const live = state.sessions.filter(
            (session) => session.live && session.projectId === projectId,
          );
          const order = [
            ...live.map((session) => session.id),
            "start",
            "specs",
            "repo",
          ];
          event.preventDefault();
          setSurface("Workspace");
          const current = Math.max(
            0,
            order.indexOf(state.workspaceTabs[projectId] ?? order[0]),
          );
          const delta = event.code === "BracketRight" ? 1 : -1;
          const next = order[(current + delta + order.length) % order.length];
          if (live.some((session) => session.id === next)) {
            void state.focusSession(next);
          } else {
            state.setWorkspaceTab(projectId, next);
          }
          return;
        }
      }
      // Type-to-compose (IM convention): a printable key outside any
      // input lands in the Boss composer.
      if (
        !meta &&
        !event.altKey &&
        event.key.length === 1 &&
        surface === "Workspace" &&
        !paletteOpen
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
  }, [surface, paletteOpen]);

  const playbookCount =
    configState?.status === "valid"
      ? configState.summary.playbooks.length
      : undefined;

  const addProjectByPath = useAppStore((state) => state.addProjectByPath);
  const createProject = useAppStore((state) => state.createProject);

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner />
      <RefreshErrorBanner />
      <Announcer />
      {paletteOpen ? (
        <ProjectPalette
          projects={projects}
          sessions={sessions}
          views={views}
          currentProjectId={currentProjectId}
          onPickFolder={
            window.spexNative
              ? () => window.spexNative!.pickDirectory()
              : undefined
          }
          onPick={pickProject}
          onAddPath={addProjectByPath}
          onCreatePath={(path, scaffold) => createProject(path, scaffold)}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-44 flex-col gap-1 border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-2 flex items-center gap-2 px-1">
            <img src={monogram} alt="" className="h-5 w-5" />
            <span className="text-base font-bold tracking-tight">Spex</span>
          </div>
          {SURFACES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setSurface(name)}
              aria-current={surface === name ? "page" : undefined}
              aria-label={
                name === "Workspace" && attentionCount > 0
                  ? `Workspace — ${attentionCount} need${attentionCount === 1 ? "s" : ""} your attention`
                  : undefined
              }
              className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
                surface === name
                  ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {name}
              {name === "Workspace" && attentionCount > 0 ? (
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
          {surface === "Playbooks" ? (
            <LibrarySurface onNavigate={setSurface} />
          ) : surface === "Settings" ? (
            <SettingsSurface />
          ) : surface === "Dashboard" ? (
            <DashboardSurface
              onOpenSession={openSessionAndShow}
              onNavigate={setSurface}
            />
          ) : (
            <WorkspaceSurface
              onNavigate={setSurface}
              onOpenPalette={() => setPaletteOpen(true)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App shell (DR-011, DR-029): the sidebar is the navigator — every
// project with its sessions — and the tab strip is the working set,
// the sessions the reader opened. Keyboard shortcuts live
// renderer-side so the UI runs unmodified in a browser (SHELL-10).

import { useEffect, useMemo, useRef, useState } from "react";
import type { IntentInfo, SessionInfo } from "@sublang/spex-core/protocol";

import { useAppStore } from "./state/store.js";
import type { AttentionItem } from "./state/dashboard.js";
import { setCaptain } from "./lib/config-ops.js";
import type { SessionView } from "./state/reducer.js";
import { RunView } from "./components/RunView.js";
import { CaptainHome } from "./components/CaptainHome.js";
import { DashboardSurface } from "./components/DashboardSurface.js";
import { LibrarySurface } from "./components/LibrarySurface.js";
import { SettingsSurface } from "./components/SettingsSurface.js";
import { RepoTab } from "./components/ProjectsSurface.js";
import { ProjectPalette } from "./components/ProjectPalette.js";
import { NavRail, SURFACES, type Surface } from "./components/NavRail.js";
import {
  SpecView,
  initialSpecViewState,
  type SpecViewState,
} from "./components/SpecView.js";
import { Icon } from "./components/Icon.js";

export type { Surface };

declare global {
  interface Window {
    spexNative?: { pickDirectory(): Promise<string | null> };
  }
}

/** The one attention fold (DR-035, dashboard-10): every dot and badge
 * re-sources from the core-derived ledger, grouped by session — never
 * from a client-side derivation of its own. Failure is the most
 * severe voice and wins a session's dot. */
function useLedgerAttention(): Map<string, AttentionItem> {
  const ledger = useAppStore((state) => state.ledger);
  const sessions = useAppStore((state) => state.sessions);
  return useMemo(() => {
    const map = new Map<string, AttentionItem>();
    for (const entry of ledger?.attention ?? []) {
      const kind = entry.kind === "failure" ? "failure" : "question";
      const existing = map.get(entry.sessionId);
      if (existing && (existing.kind === "failure" || kind !== "failure")) {
        continue;
      }
      const session = sessions.find((s) => s.id === entry.sessionId);
      map.set(entry.sessionId, {
        kind,
        sessionId: entry.sessionId,
        projectPath: session?.projectPath ?? "",
        text: entry.title,
      });
    }
    return map;
  }, [ledger, sessions]);
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
  const ledger = useAppStore((state) => state.ledger);
  const connection = useAppStore((state) => state.connection);
  const everConnected = useAppStore((state) => state.everConnected);
  const [message, setMessage] = useState("");
  // The core-derived attention queue is the one derivation (DR-035).
  const blockingCount = ledger?.badge ?? 0;
  const first = ledger?.attention?.[0];
  const latestDetail = first?.kind === "question" ? first.title : undefined;
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
 * — the project name lives in the sidebar, not on tabs. The listing's
 * own title covers a tab whose transcript is not loaded yet. */
export function sessionTitle(
  view: SessionView | undefined,
  session?: SessionInfo,
): string {
  const first = view?.captain.find((line) => line.kind === "boss");
  const text = first?.text ?? session?.title;
  if (!text) return "new session";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 26 ? `${flat.slice(0, 26)}…` : flat;
}

function sessionTooltip(
  session: SessionInfo,
  view: SessionView | undefined,
): string {
  const first = view?.captain.find((line) => line.kind === "boss");
  const text = first?.text ?? session.title;
  const started = new Date(session.createdAt).toLocaleString();
  return text ? `${text}\nstarted ${started}` : `started ${started}`;
}

function WorkspaceSurface({
  onNavigate,
  onOpenPalette,
  onEnded,
  attentionBySession,
  pendingFocus,
  onFocusHandled,
}: {
  onNavigate: (surface: Surface) => void;
  onOpenPalette: () => void;
  /** A session just ended: the sidebar reveals where it landed. */
  onEnded: (sessionId: string) => void;
  /** The ledger-fed attention map the nav shares (DR-035). */
  attentionBySession: Map<string, AttentionItem>;
  /** An attention activation still owed its landing (run-view-91). */
  pendingFocus?: { sessionId: string; turnId: number };
  onFocusHandled: () => void;
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
  const openTabs = useAppStore((state) => state.openTabs);
  const closeTab = useAppStore((state) => state.closeTab);
  const specTrees = useAppStore((state) => state.specTrees);
  const specErrors = useAppStore((state) => state.specErrors);
  const loadSpecs = useAppStore((state) => state.loadSpecs);
  const readSpecRecord = useAppStore((state) => state.readSpecRecord);
  const openAcademyExample = useAppStore(
    (state) => state.openAcademyExample,
  );
  const ledger = useAppStore((state) => state.ledger);
  const stagedIntents = useAppStore((state) => state.stagedIntents);
  const clearStagedIntent = useAppStore((state) => state.clearStagedIntent);
  const queueIntent = useAppStore((state) => state.queueIntent);
  const stageDispatch = useAppStore((state) => state.stageDispatch);

  const [ending, setEnding] = useState<Record<string, boolean>>({});
  const [specViewStates, setSpecViewStates] = useState<
    Record<string, SpecViewState>
  >({});
  const [seedErrors, setSeedErrors] = useState<
    Record<string, string | undefined>
  >({});
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const project = projects.find((entry) => entry.id === currentProjectId);
  // The working set (run-view-48): the sessions this project has open,
  // live and ended alike — not derived from liveness, so ending one
  // leaves its transcript exactly where the eye already is.
  const open = currentProjectId
    ? (openTabs[currentProjectId] ?? [])
        .map((id) => sessions.find((session) => session.id === id))
        .filter((session): session is SessionInfo => Boolean(session))
    : [];

  // The workspace tab: per-project memory with working-set fallbacks.
  const remembered = currentProjectId
    ? workspaceTabs[currentProjectId]
    : undefined;
  const tab =
    remembered === "start" || remembered === "specs" || remembered === "repo"
      ? remembered
      : remembered && open.some((session) => session.id === remembered)
        ? remembered
        : (open.find((session) => session.id === activeSessionId)?.id ??
          open[0]?.id ??
          "start");

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
    if (next !== "start" && next !== "specs" && next !== "repo") {
      void focusSession(next);
    } else {
      setWorkspaceTab(currentProjectId, next);
    }
  }

  // The current project's queue (run-view-88): the head unblocked
  // intent is the next card; the rest is the "+N more" count.
  const projectQueue = (ledger?.intents ?? []).filter(
    (entry) =>
      entry.intent.projectId === currentProjectId && entry.state === "queued",
  );
  const nextIntent = projectQueue.find((entry) => !entry.blockedBy);

  const startView = (
    <CaptainHome
      hasProject={Boolean(project)}
      hasProjects={projects.length > 0}
      projectName={project?.name}
      playbooks={summary?.playbooks ?? []}
      captain={summary?.captain}
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
      onSaveCaptain={setCaptain}
      next={
        nextIntent
          ? { intent: nextIntent.intent, more: projectQueue.length - 1 }
          : undefined
      }
      onStartIntent={async (intent) => {
        await stageDispatch(intent);
      }}
      staged={stagedIntents.home}
      onDetachStaged={() => clearStagedIntent("home")}
      onQueueInstead={
        currentProjectId
          ? async (text) => {
              await queueIntent({ projectId: currentProjectId, text });
            }
          : undefined
      }
      onStart={async (text) => {
        if (!currentProjectId) return;
        const session = await openSession(currentProjectId);
        // A dispatch staged on the home follows the text into the new
        // session, so the send stamps the intent (run-view-86/88).
        const state = useAppStore.getState();
        const homeStaged = state.stagedIntents.home;
        if (homeStaged) {
          const { home: _home, ...rest } = state.stagedIntents;
          useAppStore.setState({
            stagedIntents: { ...rest, [session.id]: homeStaged },
          });
        }
        await submitBossText(session.id, text);
      }}
    />
  );

  /** Ending stops the agents; it never moves the reader (run-view-69). */
  function endSession(session: SessionInfo): void {
    setEnding((current) => ({ ...current, [session.id]: true }));
    void disposeSession(session.id)
      .catch(() => {})
      .finally(() => {
        setEnding((current) => ({ ...current, [session.id]: false }));
        onEnded(session.id);
      });
  }

  /** Closing files the tab away and stops nothing (run-view-47). */
  function closeTabAt(session: SessionInfo): void {
    const index = open.findIndex((entry) => entry.id === session.id);
    closeTab(session.projectId, session.id);
    // Keyboard flow: focus the neighboring tab, never <body>.
    const neighbor = open[index + 1] ?? open[index - 1];
    if (neighbor) tabRefs.current.get(neighbor.id)?.focus();
  }

  if (!project) {
    return <div className="flex min-h-0 flex-1 flex-col">{startView}</div>;
  }

  const view =
    tab !== "start" && tab !== "specs" && tab !== "repo"
      ? views[tab]
      : undefined;
  const activeSession = open.find((session) => session.id === tab);
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
        {open.map((session) => {
          const attentionItem = attentionBySession.get(session.id);
          const isActive = session.id === tab;
          const title = sessionTitle(views[session.id], session);
          return (
            <span
              key={session.id}
              className={`flex min-w-[6rem] max-w-[14rem] items-center gap-1 rounded-t-md px-3 py-1.5 text-sm ${
                isActive
                  ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
                  : "text-neutral-500"
              }`}
            >
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
                {session.live ? null : (
                  <span
                    data-testid={`tab-ended-${session.id}`}
                    className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400"
                  >
                    ended
                  </span>
                )}
              </button>
              <button
                type="button"
                data-testid={`tab-close-${session.id}`}
                title="Close this tab — the session stays in the sidebar"
                aria-label={`Close tab ${title}`}
                onClick={() => closeTabAt(session)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <Icon name="close" className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "start" && open.length > 0}
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
      {strip}
      {tab === "start" ? (
        startView
      ) : tab === "specs" ? (
        <SpecView
          key={project.id}
          projectName={project.name}
          tree={specTrees[project.id]}
          loading={!specTrees[project.id] && !specErrors[project.id]}
          error={specErrors[project.id]}
          onRefresh={() => void loadSpecs(project.id)}
          onReadRecord={(path) => readSpecRecord(project.id, path)}
          onSeedExample={() => {
            setSeedErrors((current) => ({ ...current, [project.id]: undefined }));
            void openAcademyExample().catch((cause: Error) => {
              setSeedErrors((current) => ({
                ...current,
                [project.id]: cause.message || "seeding the example failed",
              }));
            });
          }}
          seedError={seedErrors[project.id]}
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
            readOnly={!activeSession.live}
            ending={ending[activeSession.id]}
            onEnd={
              activeSession.live ? () => endSession(activeSession) : undefined
            }
            onRetryLoad={() => {
              void loadPastSession(activeSession.id, true).catch(() => {});
            }}
            onStartNew={() => {
              setWorkspaceTab(activeSession.projectId, "start");
            }}
            onDraftChange={(draft) => setDraft(activeSession.id, draft)}
            onSubmit={(text) => submitBossText(activeSession.id, text)}
            onAbort={() => void abortTurn(activeSession.id)}
            onRemoveQueued={(index) => removeQueued(activeSession.id, index)}
            onDismissError={() => clearRunError(activeSession.id)}
            focusTurn={
              pendingFocus?.sessionId === activeSession.id
                ? pendingFocus.turnId
                : undefined
            }
            onFocusHandled={onFocusHandled}
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
  const railCollapsed = useAppStore((state) => state.railCollapsed);
  const setRailCollapsed = useAppStore((state) => state.setRailCollapsed);
  const expandedProjects = useAppStore((state) => state.expandedProjects);
  const toggleProjectExpanded = useAppStore(
    (state) => state.toggleProjectExpanded,
  );
  const workspaceTabs = useAppStore((state) => state.workspaceTabs);
  const connection = useAppStore((state) => state.connection);
  // The badge and every dot re-source from the one core-side ledger
  // fold (DR-035, dashboard-9/10).
  const attentionCount = useAppStore((state) => state.ledger?.badge ?? 0);
  const attentionBySession = useLedgerAttention();
  // An attention activation owed its landing in the thread
  // (run-view-91): held until the session's run view takes it.
  const [pendingFocus, setPendingFocus] = useState<{
    sessionId: string;
    turnId: number;
  }>();

  // The ledger loads with the connection; intents.changed keeps it
  // fresh from there (DR-035).
  useEffect(() => {
    if (connection === "open") {
      void useAppStore
        .getState()
        .loadLedger()
        .catch(() => {});
    }
  }, [connection]);
  // A just-ended session: its sidebar row lights up so the reader sees
  // where the conversation landed (run-view-69).
  const [revealSessionId, setRevealSessionId] = useState<string>();
  // Last non-Specs tab per project, for the Specs toggle shortcut.
  const prevTabRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!revealSessionId) return;
    const timer = setTimeout(() => setRevealSessionId(undefined), 2400);
    return () => clearTimeout(timer);
  }, [revealSessionId]);

  // Opening with a turn id lands at that turn's place in the thread
  // (run-view-91): the question bubble, failure line, or delivery card.
  const openSessionAndShow = (sessionId: string, turnId?: number) => {
    void focusSession(sessionId);
    setPendingFocus(
      turnId !== undefined ? { sessionId, turnId } : undefined,
    );
    setSurface("Workspace");
  };

  // Start on an intent stages its dispatch (run-view-86): the store
  // picks the lane — the live session's composer, or the Captain home.
  const startIntent = async (intent: IntentInfo) => {
    await useAppStore.getState().stageDispatch(intent);
    setSurface("Workspace");
  };

  // An intent picked off the Dashboard opens in its own project's
  // Specs surface, where the records reader lives (dashboard-24).
  const [pendingRecord, setPendingRecord] = useState<{
    projectId: string;
    path: string;
  } | null>(null);
  const openIntent = (projectId: string, path: string) => {
    const state = useAppStore.getState();
    state.setCurrentProject(projectId);
    state.setWorkspaceTab(projectId, "specs");
    setSurface("Workspace");
    setPendingRecord({ projectId, path });
  };

  // Picking a project with parked attention lands on the session that
  // needs the human (DR-011), not the last-active tab — read from the
  // one ledger fold (DR-035).
  const pickProject = (projectId: string) => {
    const state = useAppStore.getState();
    const needy = state.ledger?.attention.find(
      (entry) => entry.projectId === projectId,
    );
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
        if (event.key.toLowerCase() === "b") {
          event.preventDefault();
          state.setRailCollapsed(!state.railCollapsed);
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
          // The cycle walks the working set in strip order, pinned
          // tabs included (run-view-49).
          const openIds = state.openTabs[projectId] ?? [];
          const order = [...openIds, "start", "specs", "repo"];
          event.preventDefault();
          setSurface("Workspace");
          const current = Math.max(
            0,
            order.indexOf(state.workspaceTabs[projectId] ?? order[0]),
          );
          const delta = event.code === "BracketRight" ? 1 : -1;
          const next = order[(current + delta + order.length) % order.length];
          if (openIds.includes(next)) {
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
          !target?.isContentEditable &&
          // The sidebar owns its own letters: type-ahead reaches a
          // session by its first words (run-view-49).
          !target?.closest('[data-testid="sidebar"]')
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

  // The sidebar's selection: which session the workspace is showing.
  const activeTabSessionId = (projectId: string): string | undefined => {
    if (surface !== "Workspace") return undefined;
    const tab = workspaceTabs[projectId];
    if (!tab || tab === "start" || tab === "specs" || tab === "repo") {
      return undefined;
    }
    return tab;
  };

  // The rail foot's other tenant. A broken config keeps its red voice
  // in both rail states (DR-030) — a first-hour failure must not go
  // quiet because the chrome folded.
  const configFoot =
    configState && configState.status !== "valid" ? (
      <button
        type="button"
        data-testid="config-status"
        onClick={() => setSurface("Settings")}
        title="Open Settings to see what's wrong"
        aria-label={`Config ${configState.status} — open Settings`}
        className={`flex shrink-0 items-center justify-center rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 ${
          railCollapsed ? "h-6 w-6" : "px-1.5 py-0.5 text-[11px]"
        }`}
      >
        {railCollapsed ? (
          <Icon name="gear" className="h-3.5 w-3.5" />
        ) : (
          <>config {configState.status} →</>
        )}
      </button>
    ) : railCollapsed || playbookCount === undefined ? null : (
      <span className="px-1 text-[11px] text-neutral-400">
        {playbookCount === 0
          ? "No playbooks yet"
          : `${playbookCount} playbook${playbookCount === 1 ? "" : "s"}`}
      </span>
    );

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
        <NavRail
          surface={surface}
          onSurface={setSurface}
          attentionCount={attentionCount}
          collapsed={railCollapsed}
          onCollapsed={setRailCollapsed}
          projects={projects}
          sessions={sessions}
          attention={attentionBySession}
          currentProjectId={currentProjectId}
          activeSessionId={
            currentProjectId ? activeTabSessionId(currentProjectId) : undefined
          }
          expanded={expandedProjects}
          onExpanded={toggleProjectExpanded}
          onPickProject={pickProject}
          onActivateSession={openSessionAndShow}
          onNewSession={(projectId) => {
            const state = useAppStore.getState();
            state.setCurrentProject(projectId);
            state.setWorkspaceTab(projectId, "start");
            setSurface("Workspace");
          }}
          onOpenPalette={() => setPaletteOpen(true)}
          revealSessionId={revealSessionId}
          foot={configFoot}
        />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {surface === "Playbooks" ? (
            <LibrarySurface onNavigate={setSurface} />
          ) : surface === "Settings" ? (
            <SettingsSurface />
          ) : surface === "Dashboard" ? (
            <DashboardSurface
              onOpenSession={openSessionAndShow}
              onOpenIntent={openIntent}
              onStartIntent={startIntent}
              onNavigate={setSurface}
            />
          ) : (
            <WorkspaceSurface
              onNavigate={setSurface}
              onOpenPalette={() => setPaletteOpen(true)}
              onEnded={setRevealSessionId}
              attentionBySession={attentionBySession}
              pendingFocus={pendingFocus}
              onFocusHandled={() => setPendingFocus(undefined)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

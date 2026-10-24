// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App shell (DR-011, DR-029): the sidebar is the navigator — every
// project with its sessions — and the tab strip is the working set,
// the sessions the reader opened. Keyboard shortcuts live
// renderer-side so the UI runs unmodified in a browser (SHELL-10).

import { ApprovalInbox, ApprovalFeedback } from "./components/ApprovalInbox.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IntentInfo, LedgerState, SessionInfo } from "@sublang/spex-core/protocol";

import type { ProjectInfo } from "@sublang/spex-core/protocol";
import {
  isLocalPlace,
  LOCAL_PLACE_KEY,
  placeKey,
  placeLabel,
  safeStorageGet,
  safeStorageSet,
  SURFACE_KEY,
  useAppStore,
  type AppStore,
} from "./state/store.js";
import { usePlaces } from "./state/places.js";
import {
  PlaceStoreContext,
  useEachPlace,
  useJoinedAttention,
  usePlaceStore,
  usePlaceStores,
} from "./state/place-context.js";
import {
  ATTENTION_MARK_CLASS,
  ATTENTION_RANK,
  type AttentionItem,
} from "./state/dashboard.js";
import { setCaptain } from "./lib/config-ops.js";
import { currentLocale, i18n } from "./i18n.js";
import { causePhrase } from "./lib/failure-catalogue.js";
import { keyLabel } from "./lib/shortcuts.js";
import type { SessionView } from "./state/reducer.js";
import { RunView } from "./components/RunView.js";
import { CaptainHome } from "./components/CaptainHome.js";
import { DashboardSurface } from "./components/DashboardSurface.js";
import { LibrarySurface } from "./components/LibrarySurface.js";
import { SettingsSurface } from "./components/SettingsSurface.js";
import { SpaceSurface } from "./components/SpaceSurface.js";
import { PlaceSelector } from "./components/PlaceSelector.js";
import { OverviewTab } from "./components/ProjectsSurface.js";
import { ProjectPalette } from "./components/ProjectPalette.js";
import {
  NavRail,
  SURFACES,
  SURFACE_LABELS,
  type NavPlace,
  type Surface,
} from "./components/NavRail.js";
import {
  SpecView,
  initialSpecViewState,
  type RecordOrigin,
  type SpecViewState,
} from "./components/SpecView.js";

/** A record another surface asked the spec view to open, with where
 * it was asked from (spec-view-57), at the place of its project. */
type PendingRecord = { place: string; projectId: string; path: string; origin: RecordOrigin };
import { editorDirty, treeCounts } from "./lib/spec-view-model.js";
import { isHistory } from "./lib/sessions.js";
import { Icon } from "./components/Icon.js";
import { homeAttachmentKey, sessionAttachmentKey, useComposerAttachments } from "./lib/useComposerAttachments.js";

export type { Surface };

/** The pinned project views beside the sessions (run-view-58). "repo"
 * is the retired name of the Overview (DR-038): a remembered value
 * still lands there. */
/** What a tab's name says about its entry (run-view-48). Each is a
 * thunk, never a string: a table read at module load would freeze the
 * language it was imported in (localization-4). */
const TAB_WORDS: Record<AttentionItem["kind"], () => string> = {
  failure: () =>
    i18n._({ id: "failed", comment: "a piece of work's state: it failed" }),
  question: () =>
    i18n._({
      id: "needs your reply",
      comment: "tab name: the run parked on a question",
    }),
  finish: () =>
    i18n._({
      id: "needs your verdict",
      comment: "tab name: delivered, a verdict is owed",
    }),
  review: () =>
    i18n._({ id: "unread turn", comment: "tab name: a turn nobody has read" }),
};

function pinnedTab(tab: string | undefined): "start" | "specs" | "overview" | undefined {
  if (tab === "repo") return "overview";
  return tab === "start" || tab === "specs" || tab === "overview"
    ? tab
    : undefined;
}

declare global {
  interface Window {
    /** The native bridge (DR-008): OS pickers, since DR-057 a path
     * reveal, and since DR-103 the sign-in URL opened in the system
     * browser — feature-detected, absent on the served page. */
    spexNative?: {
      pickDirectory(): Promise<string | null>;
      /** An OS file picker, where the shell offers one (DR-008): the
       * Source tab's Pick file (playbook-library-56). */
      pickFile?(): Promise<string | null>;
      revealPath?(path: string): Promise<boolean>;
      /** Open an instance's sign-in URL in the system's default
       * browser (app-shell-37, space-3): false when the shell refuses
       * it — a URL not at an instance the home lists or is signing in
       * to — and the page then shows the URL as a link instead. */
      openExternal?(url: string): Promise<boolean>;
    };
  }
}

/** The one attention fold (DR-035, dashboard-10): every dot and badge
 * re-sources from the core-derived ledger, grouped by session — never
 * from a client-side derivation of its own. Where a session carries
 * several entries the most severe wins its mark, in the one rank
 * every surface shares. One place's fold, over that place's own
 * sessions (run-view-168). */
function attentionOf(
  ledger: LedgerState | undefined,
  sessions: readonly SessionInfo[],
  views: Record<string, SessionView>,
): Map<string, AttentionItem> {
  const map = new Map<string, AttentionItem>();
  for (const entry of ledger?.attention ?? []) {
    const view = views[entry.sessionId];
    const session = sessions.find((s) => s.id === entry.sessionId);
    // An earlier delivery still counts on the Dashboard, but does
    // not mean the later work is waiting for a reply.
    if (entry.band === "finished" && (session?.turnActive ?? view?.turnActive)) continue;
    // The entry's own kind travels (DR-066): a mark that says
    // "needs your reply" where a turn is merely unread names an act
    // the reader cannot take.
    const existing = map.get(entry.sessionId);
    if (existing && ATTENTION_RANK[existing.kind] <= ATTENTION_RANK[entry.kind]) {
      continue;
    }
    map.set(entry.sessionId, {
      kind: entry.kind,
      sessionId: entry.sessionId,
      projectPath: session?.projectPath ?? "",
      text: entry.title,
      // Why it failed, in the catalogue's phrase (DR-075): the mark
      // says what happened wherever it is read.
      ...(causePhrase(entry.cause) ? { why: causePhrase(entry.cause)! } : {}),
    });
  }
  return map;
}

/** How long a first boot may dial before the page raises the alarm:
 * a served core over a slow link, or a desktop core still starting,
 * needs longer than a flap (run-view-50). */
export const NEVER_CONNECTED_GRACE_MS = 8_000;

/** Redial one place alone (run-view-50): its connection is let go and
 * dialed afresh, every other place's untouched. */
function redial(store: AppStore): void {
  store.close();
  store.getState().connect();
}

/** One place's connection banner (run-view-50, run-view-168): the
 * local core's names its endpoint, a seat's names its server; each
 * reads its own store's connection alone. */
function ConnectionBanner({ store }: { store: AppStore }) {
  const connection = store((state) => state.connection);
  const everConnected = store((state) => state.everConnected);
  const coreUrl = store((state) => state.coreUrl);
  const local = isLocalPlace(store.place);
  const server = placeLabel(store.place);
  // A boot that never connects must say so (run-view-50): after a
  // grace period the page names the endpoint it keeps dialing.
  // The clock runs from mount, untouched by the dial-close-dial flaps
  // of a failing connection; the first open ends it for good.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (everConnected) return;
    const timer = setTimeout(() => setStalled(true), NEVER_CONNECTED_GRACE_MS);
    return () => clearTimeout(timer);
  }, [everConnected]);
  if (connection === "open") return null;
  if (!everConnected && connection !== "mismatch") {
    // The first connect is not a "reconnect" — a fresh boot gets a
    // few seconds before the page raises the alarm.
    if (!stalled) return null;
    const scrubbed = coreUrl?.replace(/([?&]token=)[^&]*/, "$1…");
    return (
      <div
        role="alert"
        data-place={store.place.key}
        className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
      >
        {local
          ? i18n._(
              "Can't reach the Spex core at {endpoint} — retrying every second. On a served page, check the link's token; on the desktop, restart the app.",
              { endpoint: scrubbed ?? i18n._("its endpoint") },
            )
          : i18n._({
              id: "Can't reach {server} — retrying every second.",
              comment: "banner: a team server's seat never answered; {server} is the server's name",
              values: { server },
            })}
        <button
          type="button"
          onClick={() => (local ? window.location.reload() : redial(store))}
          className="font-medium text-brand-700 hover:underline dark:text-brand-300"
        >
          {i18n._({ id: "Retry", comment: "take the failed read again" })}
        </button>
      </div>
    );
  }
  if (connection === "mismatch") {
    return (
      <div
        data-place={store.place.key}
        className="border-b border-red-300 bg-red-50 px-4 py-1.5 text-center text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
      >
        {local
          ? i18n._(
              "The Spex window and its core speak different protocol versions — restart the app (or update Spex) to fix this.",
            )
          : i18n._({
              id: "{server} speaks a different protocol version than this window — it needs the same Spex release as this app.",
              comment: "banner: a team server's seat runs another protocol version; {server} is the server's name",
              values: { server },
            })}
      </div>
    );
  }
  return (
    <div
      data-place={store.place.key}
      className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      {local
        ? i18n._(
            "Reconnecting to the Spex core… actions are paused until the connection returns.",
          )
        : i18n._({
            id: "Reconnecting to {server}… actions there are paused until the connection returns.",
            comment: "banner: the connection to a team server's seat dropped; {server} is the server's name",
            values: { server },
          })}
    </div>
  );
}

/** Connected-but-blank is never presented as normal (DR-010 §5), at
 * any place (run-view-168). */
function RefreshErrorBanner({ store }: { store: AppStore }) {
  const refreshError = store((state) => state.refreshError);
  const refresh = store((state) => state.refresh);
  const connection = store((state) => state.connection);
  if (!refreshError || connection !== "open") return null;
  return (
    <div
      data-place={store.place.key}
      className="flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      {/* The core's own words for what failed ride as data inside the
          one sentence the page owns (localization-4). */}
      {isLocalPlace(store.place)
        ? i18n._("Connected, but {reason}", { reason: refreshError })
        : i18n._({
            id: "Connected to {server}, but {reason}",
            comment: "banner: a team server's seat answered but its state failed to load; {server} is the server's name",
            values: { server: placeLabel(store.place), reason: refreshError },
          })}
      <button
        type="button"
        onClick={() =>
          void refresh()
            .then(() => store.setState({ refreshError: undefined }))
            .catch((cause: Error) =>
              store.setState({
                refreshError: i18n._("app state failed to load: {reason}", {
                  reason: cause.message,
                }),
              }),
            )
        }
        className="font-medium text-brand-700 hover:underline dark:text-brand-300"
      >
        {i18n._({ id: "Retry", comment: "take the failed read again" })}
      </button>
    </div>
  );
}

/** Each seat's banners, beside the local core's (run-view-168): a
 * connection, its banner and a protocol mismatch are per place. */
function SeatBanners({ banner }: { banner: "connection" | "refresh" }) {
  const seats = usePlaces((state) => state.seats);
  return seats.map(({ store }) =>
    banner === "connection" ? (
      <ConnectionBanner key={store.place.key} store={store} />
    ) : (
      <RefreshErrorBanner key={store.place.key} store={store} />
    ),
  );
}

/** One persistent polite live region (DR-010 §7): announces the
 * moments the product is built around without spamming. */
function Announcer() {
  const connection = useAppStore((state) => state.connection);
  const everConnected = useAppStore((state) => state.everConnected);
  const [message, setMessage] = useState("");
  // The core-derived attention queue is the one derivation (DR-035),
  // joined across the places (dashboard-9).
  const joined = useJoinedAttention();
  const blockingCount = joined.badge;
  const first = joined.entries[0]?.entry;
  const latestDetail = first?.kind === "question" ? first.title : undefined;
  const lastCount = useRef(0);
  const lastConnection = useRef(connection);
  // "Restored" is only true after a loss: the first open is a boot,
  // not a recovery, and must not be announced as one.
  const lost = useRef(false);

  useEffect(() => {
    if (blockingCount > lastCount.current) {
      setMessage(
        latestDetail
          ? i18n._("A player is waiting for your reply: {detail}", {
              detail: latestDetail,
            })
          : i18n._(
              "{count, plural, one {# session needs your attention} other {# sessions need your attention}}",
              { count: blockingCount },
            ),
      );
    }
    lastCount.current = blockingCount;
  }, [blockingCount, latestDetail]);

  useEffect(() => {
    if (!everConnected) return;
    if (connection !== lastConnection.current) {
      if (connection === "open") {
        if (lost.current) setMessage(i18n._("Connection restored."));
        lost.current = false;
      } else if (connection === "closed") {
        setMessage(
          i18n._("Connection to the Spex core lost — reconnecting."),
        );
        lost.current = true;
      }
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
  if (!text) return i18n._("new session");
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 26 ? `${flat.slice(0, 26)}…` : flat;
}

function sessionTooltip(
  session: SessionInfo,
  view: SessionView | undefined,
): string {
  const first = view?.captain.find((line) => line.kind === "boss");
  const text = first?.text ?? session.title;
  const started = new Date(session.createdAt).toLocaleString(currentLocale());
  // The session's own words are data on their own line; only the
  // second line is a text (localization-4).
  const line = i18n._("started {started}", { started });
  return text ? `${text}\n${line}` : line;
}

function WorkspaceSurface({
  onNavigate,
  onOpenPalette,
  onOpenOwnProject,
  attentionBySession,
  pendingFocus,
  onFocusHandled,
  onOpenSession,
  onOpenIntent,
  onStartIntent,
  pendingRecord,
  onRecordOpened,
  onReturn,
  specViewStates,
  onSpecViewState,
}: {
  onNavigate: (surface: Surface) => void;
  onOpenPalette: () => void;
  onOpenOwnProject: () => void;
  /** Per-project spec view state, held above the workspace so a
   * draft under edit survives every surface (spec-view-51), keyed by
   * place and project (run-view-168). */
  specViewStates: Record<string, SpecViewState>;
  onSpecViewState: (key: string, next: SpecViewState) => void;
  /** The Overview's ledger group actions, the Dashboard's own
   * (projects-4, DR-038). */
  onOpenSession: (sessionId: string, turnId?: number) => void;
  onOpenIntent: (projectId: string, path: string, anchor: string) => void;
  onStartIntent: (intent: IntentInfo) => Promise<void> | void;
  /** A record another surface asked the spec view to open, still
   * owed its landing (spec-view-7, dashboard-24), with where it was
   * asked from so Back can lead there (spec-view-57). */
  pendingRecord?: PendingRecord | null;
  onRecordOpened: () => void;
  /** The reader's Back on a record with an origin: return there. */
  onReturn: (origin: RecordOrigin) => void;
  /** The ledger-fed attention map the nav shares (DR-035). */
  attentionBySession: Map<string, AttentionItem>;
  /** An attention activation still owed its landing (run-view-91). */
  pendingFocus?: { sessionId: string; turnId: number };
  onFocusHandled: () => void;
}) {
  // The place this surface shows (run-view-168): every read and act
  // here is that place's core's.
  const store = usePlaceStore();
  const sessions = store((state) => state.sessions);
  const views = store((state) => state.views);
  const composers = store((state) => state.composers);
  const runErrors = store((state) => state.runErrors);
  const connection = store((state) => state.connection);
  const activeSessionId = store((state) => state.activeSessionId);
  const focusSession = store((state) => state.focusSession);
  const loadPastSession = store((state) => state.loadPastSession);
  const submitBossText = store((state) => state.submitBossText);
  const removeQueued = store((state) => state.removeQueued);
  const abortTurn = store((state) => state.abortTurn);
  const clearRunError = store((state) => state.clearRunError);
  const setDraft = store((state) => state.setDraft);
  const homeDraft = store((state) => state.homeDraft);
  const setHomeDraft = store((state) => state.setHomeDraft);
  const refreshReadiness = store((state) => state.refreshReadiness);
  const configState = store((state) => state.configState);
  const readiness = store((state) => state.readiness);
  const projects = store((state) => state.projects);
  const openSession = store((state) => state.openSession);
  const currentProjectId = store((state) => state.currentProjectId);
  const homeMedia = useComposerAttachments(currentProjectId ? homeAttachmentKey(currentProjectId) : undefined, currentProjectId ? { kind: "project", id: currentProjectId } : undefined);
  const setCurrentProject = store((state) => state.setCurrentProject);
  const workspaceTabs = store((state) => state.workspaceTabs);
  const setWorkspaceTab = store((state) => state.setWorkspaceTab);
  const openTabs = store((state) => state.openTabs);
  const closeTab = store((state) => state.closeTab);
  const specTrees = store((state) => state.specTrees);
  const specErrors = store((state) => state.specErrors);
  const loadSpecs = store((state) => state.loadSpecs);
  const readSpecRecord = store((state) => state.readSpecRecord);
  const writeSpec = store((state) => state.writeSpec);
  const openAcademyExample = store(
    (state) => state.openAcademyExample,
  );
  const ledger = store((state) => state.ledger);
  const markViewed = store((state) => state.markViewed);
  const stagedIntents = store((state) => state.stagedIntents);
  const clearStagedIntent = store((state) => state.clearStagedIntent);
  const queueIntent = store((state) => state.queueIntent);
  const stageDispatch = store((state) => state.stageDispatch);

  const [seedErrors, setSeedErrors] = useState<
    Record<string, string | undefined>
  >({});
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const project = projects.find((entry) => entry.id === currentProjectId);
  // The working set (run-view-48): the sessions this project has open,
  // working and idle alike — never derived from liveness, so a turn
  // settling leaves its transcript exactly where the eye already is.
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
    pinnedTab(remembered) ??
    (remembered && open.some((session) => session.id === remembered)
      ? remembered
      : (open.find((session) => session.id === activeSessionId)?.id ??
        open[0]?.id ??
        "start"));
  const projectSpecTree = currentProjectId ? specTrees[currentProjectId] : undefined;
  const projectSpecError = currentProjectId ? specErrors[currentProjectId] : undefined;
  const projectSpecItemCount = projectSpecTree?.present && !projectSpecTree.legacy && !projectSpecError
    ? treeCounts(projectSpecTree.files).items
    : 0;

  // The task start and pinned Specs tab need the project's real state
  // before anyone opens the reader. The Specs tab itself still re-reads
  // on activation and focus (DR-011).
  useEffect(() => {
    if (connection !== "open" || !currentProjectId || tab === "specs" || projectSpecTree || projectSpecError) return;
    void loadSpecs(currentProjectId);
  }, [connection, currentProjectId, tab, projectSpecTree, projectSpecError, loadSpecs]);

  // The last-viewed marker is a standing condition, not an event
  // (run-view-134): while the workspace shows a session with its
  // transcript loaded, that session's greatest ended turn is viewed —
  // however the reader arrived, and whether or not this core could
  // continue the conversation. Re-asserted whenever the fold moves, so
  // a write a Space operation refused is simply taken again.
  const shownView = pinnedTab(tab) ? undefined : views[tab];
  useEffect(() => {
    if (!shownView || shownView.loading) return;
    markViewed(tab);
  }, [tab, shownView, ledger, markViewed]);

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

  // A session runs with your own group's config and its project's on
  // top (core-service-2), so the slash menus offer that project's
  // composed catalog — yours alone while it is not read, or refused
  // (playbook-library-34, DR-104: every member gets the same tools).
  const projectConfigs = store((state) => state.projectConfigs);
  const loadProjectConfig = store((state) => state.loadProjectConfig);
  useEffect(() => {
    if (connection !== "open" || !currentProjectId) return;
    void loadProjectConfig(currentProjectId).catch(() => {});
  }, [connection, currentProjectId, loadProjectConfig]);
  const playbooksOf = (projectId: string | undefined) => {
    const composed = projectId ? projectConfigs[projectId] : undefined;
    return composed?.status === "valid"
      ? composed.summary.playbooks
      : (summary?.playbooks ?? []);
  };

  // The Captain's adapter not ready is the likeliest cause of a failed
  // turn: a live session's failure lines then carry the way to
  // Settings (run-view-2).
  const captainReadiness = summary?.captain
    ? readiness.find((entry) => entry.adapter === summary.captain?.adapter)
    : undefined;
  const readinessHint =
    captainReadiness?.ready === false
      ? {
          requirement: captainReadiness.requirement,
          onOpenSettings: () => onNavigate("Settings"),
        }
      : undefined;

  function pickTab(next: string): void {
    if (!currentProjectId) return;
    const pinned = pinnedTab(next);
    if (pinned) {
      setWorkspaceTab(currentProjectId, pinned);
    } else {
      void focusSession(next);
    }
  }

  // The current project's queue (run-view-88): the core marks the one
  // next intent and publishes its standing; every other queued row is
  // included in the "+N more" count.
  const projectQueue = (ledger?.intents ?? []).filter(
    (entry) =>
      entry.intent.projectId === currentProjectId && entry.state === "queued",
  );
  const nextIntent = projectQueue.find((entry) => entry.next);

  const startView = (
    <CaptainHome
      hasProject={Boolean(project)}
      hasProjects={projects.length > 0}
      projectName={project?.name}
      projectId={project?.id}
      specTree={projectSpecTree}
      specError={projectSpecError}
      onOpenSpecs={() => pickTab("specs")}
      playbooks={playbooksOf(project?.id)}
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
      attachments={homeMedia.controls}
      onDraftChange={setHomeDraft}
      onRecheckReadiness={refreshReadiness}
      onOpenPalette={onOpenPalette}
      onOpenOwnProject={onOpenOwnProject}
      onNavigate={(surface) => onNavigate(surface)}
      onSaveCaptain={(patch) => setCaptain(patch, store.getClient())}
      next={
        nextIntent
          ? {
              intent: nextIntent.intent,
              schedule: nextIntent.next!,
              more: projectQueue.length - 1,
            }
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
              await queueIntent({ projectId: currentProjectId, text, attachments: homeMedia.assets });
              homeMedia.consume();
            }
          : undefined
      }
      onStart={async (text) => {
        if (!currentProjectId) return;
        const session = await openSession(currentProjectId);
        store.getState().setDraft(session.id, text);
        store.getState().stageAttachmentAssets(sessionAttachmentKey(session.id), { kind: "project", id: currentProjectId }, homeMedia.assets);
        const transferredIds = store.getState().attachmentDrafts[sessionAttachmentKey(session.id)].map((file) => file.id);
        // A dispatch staged on the home follows the text into the new
        // session, so the send stamps the intent (run-view-86/88).
        const state = store.getState();
        const homeStaged = state.stagedIntents.home;
        if (homeStaged) {
          const { home: _home, ...rest } = state.stagedIntents;
          store.setState({
            stagedIntents: { ...rest, [session.id]: homeStaged },
          });
        }
        await submitBossText(session.id, text, homeMedia.assets);
        homeMedia.consume();
        store.getState().removeAttachmentFiles(sessionAttachmentKey(session.id), transferredIds);
        if (store.getState().composers[session.id]?.draft === text)
          store.getState().setDraft(session.id, "");
      }}
    />
  );

  /** Closing files the tab away and stops nothing (run-view-48). */
  function closeTabAt(session: SessionInfo): void {
    const index = open.findIndex((entry) => entry.id === session.id);
    closeTab(session.projectId, session.id);
    // Keyboard flow: focus the neighboring tab — the new-session tab
    // when no session tab is left, from which the start view's own
    // composer takes it as it mounts — never <body>.
    const neighbor = open[index + 1] ?? open[index - 1];
    (neighbor
      ? tabRefs.current.get(neighbor.id)
      : tabRefs.current.get("start")
    )?.focus();
  }

  // The strip is one tab list with one Tab stop (run-view-48): the
  // active tab is reachable by Tab, and the arrows, Home, and End walk
  // the rest — session tabs, the new-session control, and the pinned
  // views alike. Activation stays a click or Enter, so walking the
  // strip switches nothing.
  const tabOrder = [
    ...open.map((session) => session.id),
    "start",
    "specs",
    "overview",
  ];
  function walkTabs(event: React.KeyboardEvent, id: string): void {
    const index = tabOrder.indexOf(id);
    let next: string | undefined;
    if (event.key === "ArrowRight") {
      next = tabOrder[(index + 1) % tabOrder.length];
    } else if (event.key === "ArrowLeft") {
      next = tabOrder[(index - 1 + tabOrder.length) % tabOrder.length];
    } else if (event.key === "Home") {
      next = tabOrder[0];
    } else if (event.key === "End") {
      next = tabOrder[tabOrder.length - 1];
    }
    if (!next) return;
    event.preventDefault();
    tabRefs.current.get(next)?.focus();
  }

  if (!project) {
    return <div className="flex min-h-0 flex-1 flex-col">{startView}</div>;
  }

  const view = pinnedTab(tab) ? undefined : views[tab];
  const activeSession = open.find((session) => session.id === tab);
  const composer = activeSession
    ? (composers[activeSession.id] ?? { queued: [] })
    : { queued: [] };

  // One tablist holds every tab — the sessions, the "+", and the
  // pinned views — so assistive technology reads the strip whole
  // (run-view-50). Each close control is a pointer affordance hidden
  // from that tree; Delete on a focused tab closes it instead.
  const strip = (
    <div
      role="tablist"
      aria-label={i18n._("Sessions and project views")}
      className="flex items-center gap-1 border-b border-neutral-200 px-3 pt-2 dark:border-neutral-800"
    >
      <div className="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {open.map((session) => {
          const attentionItem = attentionBySession.get(session.id);
          const isActive = session.id === tab;
          const title = sessionTitle(views[session.id], session);
          // The dot's meaning is in the tab's name (run-view-48), so
          // color is never the only channel.
          // Only what the reader cannot act on is named: ownership, or
          // history the core cannot continue (run-view-48, DR-051).
          // Each note is a whole phrase and the name is one whole
          // message per case, never a translated stem with fragments
          // glued on (localization-4).
          const standing =
            session.externalWriter === "unknown"
              ? i18n._("ownership unknown")
              : session.externalWriter
                ? i18n._("in use elsewhere")
                : session.recovery && !session.live
                  ? i18n._("needs recovery")
                  : isHistory(session)
                    ? i18n._({
                        id: "history",
                        comment: "tab note: a conversation this core cannot continue",
                      })
                    : undefined;
          const summons = attentionItem
            ? TAB_WORDS[attentionItem.kind]()
            : undefined;
          const notes = [standing, summons].filter(
            (note): note is string => note !== undefined,
          );
          const name =
            notes.length === 2
              ? i18n._("{title} — {note} — {more}", {
                  title,
                  note: notes[0],
                  more: notes[1],
                })
              : notes.length === 1
                ? i18n._("{title} — {note}", { title, note: notes[0] })
                : title;
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
                aria-label={name}
                tabIndex={isActive ? 0 : -1}
                ref={(element) => {
                  if (element) tabRefs.current.set(session.id, element);
                  else tabRefs.current.delete(session.id);
                }}
                title={
                  attentionItem
                    ? [
                        sessionTooltip(session, views[session.id]),
                        attentionItem.text,
                        attentionItem.why,
                      ]
                        .filter(Boolean)
                        .join("\n")
                    : sessionTooltip(session, views[session.id])
                }
                aria-keyshortcuts="Delete"
                onKeyDown={(event) => {
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    closeTabAt(session);
                    return;
                  }
                  walkTabs(event, session.id);
                }}
                onClick={() => pickTab(session.id)}
                className="flex min-w-0 items-center gap-1.5 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                {attentionItem ? (
                  <span
                    data-testid={`tab-attention-${session.id}`}
                    aria-hidden
                    className={`h-2 w-2 shrink-0 rounded-full ${ATTENTION_MARK_CLASS[attentionItem.kind]}`}
                  />
                ) : null}
                <span className="truncate">{title}</span>
                {isHistory(session) ? (
                  <span
                    data-testid={`tab-history-${session.id}`}
                    className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400"
                  >
                    {i18n._({
                      id: "history",
                      comment: "tab note: a conversation this core cannot continue",
                    })}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                data-testid={`tab-close-${session.id}`}
                title={i18n._("Close this tab — the session stays in the sidebar")}
                aria-hidden
                tabIndex={-1}
                onClick={() => closeTabAt(session)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <Icon name="close" className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={tab === "start"}
          tabIndex={tab === "start" ? 0 : -1}
          ref={(element) => {
            if (element) tabRefs.current.set("start", element);
            else tabRefs.current.delete("start");
          }}
          title={i18n._("New task ({keys})", {
            keys: keyLabel("N"),
          })}
          onKeyDown={(event) => walkTabs(event, "start")}
          onClick={() => pickTab("start")}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-1.5 text-sm ${
            tab === "start"
              ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          <Icon name="plus" className="h-4 w-4" />
          <span>{i18n._("New task")}</span>
        </button>
      </div>
      {(["specs", "overview"] as const).map((pinned) => (
        <button
          key={pinned}
          type="button"
          role="tab"
          aria-selected={tab === pinned}
          tabIndex={tab === pinned ? 0 : -1}
          data-testid={`workspace-tab-${pinned}`}
          ref={(element) => {
            if (element) tabRefs.current.set(pinned, element);
            else tabRefs.current.delete(pinned);
          }}
          title={
            pinned === "specs"
              ? i18n._("The project's spec packages ({keys})", {
                  keys: keyLabel("⇧S"),
                })
              : i18n._(
                  "This project's overview: history, now, up next, sources, repo state",
                )
          }
          onKeyDown={(event) => walkTabs(event, pinned)}
          onClick={() => pickTab(pinned)}
          className={`shrink-0 rounded-t-md px-3 py-1.5 text-sm ${
            tab === pinned
              ? "border border-b-0 border-neutral-200 bg-white font-medium dark:border-neutral-800 dark:bg-neutral-900"
              : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          }`}
        >
          {pinned === "specs" ? (
            <>
              {i18n._({
                id: "Specs",
                comment: "tab name: the project's spec packages",
              })}
              {projectSpecItemCount > 0 ? (
                <>
                  <span aria-hidden="true" className="ml-1 text-xs text-neutral-500 dark:text-neutral-400">({projectSpecItemCount})</span>
                  <span className="sr-only">
                    {i18n._(", {count, plural, one {# spec item} other {# spec items}}", { count: projectSpecItemCount })}
                  </span>
                </>
              ) : null}
              {project && editorDirty(specViewStates[placeKey(store.place, project.id)]) ? (
                <>
                  <span className="sr-only">
                    {i18n._({
                      id: ", unsaved changes",
                      comment:
                        "spoken only, follows the Specs tab name when a draft is unsaved",
                    })}
                  </span>
                  <span aria-hidden="true" data-testid="specs-tab-unsaved">
                    {" "}
                    •
                  </span>
                </>
              ) : null}
            </>
          ) : (
            i18n._({
              id: "Overview",
              comment: "tab name: the project's own history, now and queue",
            })
          )}
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
          onWriteSpec={(path, content, baseVersion) =>
            writeSpec(project.id, path, content, baseVersion)
          }
          // The example is seeded at a folder this page names, so it is
          // this computer's alone: a seat's projects are opened among
          // the member's groups, its core allocating every folder
          // (run-view-169).
          onSeedExample={
            isLocalPlace(store.place)
              ? () => {
                  setSeedErrors((current) => ({ ...current, [project.id]: undefined }));
                  void openAcademyExample().catch((cause: Error) => {
                    setSeedErrors((current) => ({
                      ...current,
                      [project.id]:
                        cause.message || i18n._("seeding the example failed"),
                    }));
                  });
                }
              : undefined
          }
          seedError={seedErrors[project.id]}
          viewState={specViewStates[placeKey(store.place, project.id)] ?? initialSpecViewState}
          onViewState={(next) => onSpecViewState(placeKey(store.place, project.id), next)}
          openRecordPath={
            pendingRecord?.projectId === project.id && pendingRecord.place === store.place.key
              ? pendingRecord.path
              : undefined
          }
          openRecordOrigin={
            pendingRecord?.projectId === project.id && pendingRecord.place === store.place.key
              ? pendingRecord.origin
              : undefined
          }
          onRecordOpened={onRecordOpened}
          onReturn={onReturn}
        />
      ) : tab === "overview" ? (
        <OverviewTab
          key={project.id}
          projectId={project.id}
          onRemoved={() => setCurrentProject(undefined)}
          onOpenSession={onOpenSession}
          onOpenIntent={onOpenIntent}
          onStartIntent={onStartIntent}
        />
      ) : activeSession && view ? (
        view.loading ? (
          <div className="m-auto text-sm text-neutral-500">
            {i18n._("Loading transcript…")}
          </div>
        ) : (
          <RunView
            key={activeSession.id}
            session={activeSession}
            view={view}
            composer={composer}
            playbooks={playbooksOf(activeSession.projectId)}
            connected={connection === "open"}
            error={runErrors[activeSession.id]}
            readOnly={!!activeSession.externalWriter || (!activeSession.live && !activeSession.continuable)}
            readinessHint={readinessHint}
            onRecover={(action) => store.getState().recoverSession(activeSession.id, action)}
            onRetryLoad={() => {
              void loadPastSession(activeSession.id, true).catch(() => {});
            }}
            onStartNew={() => {
              setWorkspaceTab(activeSession.projectId, "start");
            }}
            onDraftChange={(draft) => setDraft(activeSession.id, draft)}
            onSubmit={(text, attachments) => submitBossText(activeSession.id, text, attachments)}
            onAbort={() => void abortTurn(activeSession.id)}
            attention={attentionBySession.get(activeSession.id)?.kind}
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
  // The surface the reader last stood on is remembered across launches
  // (run-view-67, DR-030), so a reload — after a crash or otherwise —
  // returns them where they were instead of to Projects.
  const [surface, setSurfaceState] = useState<Surface>(() => {
    const stored = safeStorageGet(SURFACE_KEY);
    return stored && (SURFACES as readonly string[]).includes(stored)
      ? (stored as Surface)
      : "Workspace";
  });
  const setSurface = useCallback((next: Surface) => {
    setSurfaceState(next);
    safeStorageSet(SURFACE_KEY, next);
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteAddProject, setPaletteAddProject] = useState(false);
  const openPalette = () => {
    setPaletteAddProject(false);
    setPaletteOpen(true);
  };
  const openAddProject = () => {
    setPaletteAddProject(true);
    setPaletteOpen(true);
  };
  const configState = useAppStore((state) => state.configState);
  const railCollapsed = useAppStore((state) => state.railCollapsed);
  const setRailCollapsed = useAppStore((state) => state.setRailCollapsed);
  const connection = useAppStore((state) => state.connection);
  // Every place (run-view-168): this computer's, then each open seat's.
  const stores = usePlaceStores();
  const storeAt = (place?: string): AppStore =>
    (place === undefined ? undefined : stores.find((store) => store.place.key === place)) ?? useAppStore;
  // The place the Projects surface shows: the one whose project or
  // session the reader last opened — this computer's until then, and
  // again once a seat it showed is closed.
  const [shownPlace, setShownPlace] = useState<string>(LOCAL_PLACE_KEY);
  const shown = storeAt(shownPlace);
  useEffect(() => {
    if (shown.place.key !== shownPlace) setShownPlace(LOCAL_PLACE_KEY);
  }, [shown, shownPlace]);
  // The place Settings, Playbooks, Groups and Environments show, as the
  // place selector names it (run-view-168): this computer's until the
  // reader picks a seat, and again once a seat it showed is closed.
  const [configuredPlace, setConfiguredPlace] = useState<string>(LOCAL_PLACE_KEY);
  const configured = storeAt(configuredPlace);
  useEffect(() => {
    if (configured.place.key !== configuredPlace) setConfiguredPlace(LOCAL_PLACE_KEY);
  }, [configured, configuredPlace]);
  // The code host a place's Groups row asked its Settings to take a
  // credential for (space-103, settings-48), until that place's
  // Credentials section has opened at it.
  const [credentialAsk, setCredentialAsk] = useState<{ place: string; host: string }>();
  /** Go to a surface on behalf of `store`'s place: Settings, Playbooks
   * and Groups open at that place (run-view-168). */
  const navigateFrom = (store: AppStore) => (next: Surface) => {
    if (next === "Settings" || next === "Playbooks" || next === "Space") {
      setConfiguredPlace(store.place.key);
    }
    setSurface(next);
  };
  // Each place's sidebar inputs, read from its own store.
  const placeStates = useEachPlace((state) => ({
    projects: state.projects,
    sessions: state.sessions,
    views: state.views,
    ledger: state.ledger,
    // The mark carries a catalog phrase, and the root re-renders rather
    // than remounts on a change of language (localization-3): the
    // language is an input, so the phrase is read again.
    language: state.language.resolved,
    currentProjectId: state.currentProjectId,
    expandedProjects: state.expandedProjects,
    workspaceTabs: state.workspaceTabs,
    // A seat's groups name the projects the palette opens there
    // (run-view-169), read once it is connected.
    space: state.space,
    connection: state.connection,
  }));
  const local = placeStates[0]!.value;
  // The badge and every dot re-source from the one core-side ledger
  // fold (DR-035, dashboard-9/10): each place's dots from its own, the
  // badge summing every place's (dashboard-9). A place speaking another
  // protocol version is no connected core: it marks nothing, as it adds
  // nothing to the queue and the badge (run-view-168).
  const attentionByPlace = useMemo(
    () =>
      new Map(
        placeStates.map(({ store, value }) => [
          store.place.key,
          attentionOf(
            value.connection === "mismatch" ? undefined : value.ledger,
            value.sessions,
            value.views,
          ),
        ]),
      ),
    [placeStates],
  );
  const attentionAt = (place: string): Map<string, AttentionItem> =>
    attentionByPlace.get(place) ?? new Map();
  const attentionCount = useJoinedAttention().badge;
  const attentionBySession = attentionAt(shown.place.key);
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
  // Last non-Specs tab per project, for the Specs toggle shortcut.
  const prevTabRef = useRef<Record<string, string>>({});

  /** Show `store`'s place on the Projects surface. */
  const showPlace = (store: AppStore) => {
    setShownPlace(store.place.key);
    setSurface("Workspace");
  };

  // Opening with a turn id lands at that turn's place in the thread
  // (run-view-91): the question bubble, failure line, or delivery card.
  // A session is opened at its own place, this computer's unless one
  // is named (dashboard-9, run-view-168).
  const openSessionAndShow = (sessionId: string, turnId?: number, place?: string) => {
    const store = storeAt(place);
    void store.getState().focusSession(sessionId);
    setPendingFocus(
      turnId !== undefined ? { sessionId, turnId } : undefined,
    );
    showPlace(store);
  };

  // Start on an intent stages its dispatch (run-view-86): the store
  // picks the lane — the live session's composer, or the Captain home —
  // at the intent's own place.
  const startIntentAt = (store: AppStore) => async (intent: IntentInfo) => {
    await store.getState().stageDispatch(intent);
    showPlace(store);
  };

  // An intent picked off the Dashboard or a project's Overview opens
  // in its own project's Specs surface, where the records reader
  // lives (dashboard-24), carrying where it was picked so the
  // reader's Back leads there (spec-view-57).
  const [pendingRecord, setPendingRecord] = useState<PendingRecord | null>(
    null,
  );
  const openIntentFrom =
    (surface: RecordOrigin["surface"], store: AppStore = useAppStore) =>
    (projectId: string, path: string, anchor: string) => {
      const state = store.getState();
      state.setCurrentProject(projectId);
      state.setWorkspaceTab(projectId, "specs");
      showPlace(store);
      setPendingRecord({
        place: store.place.key,
        projectId,
        path,
        origin: { surface, projectId, anchor },
      });
    };
  // Back to the origin: the surface first, then its invoking control
  // once that surface has rendered — a project gone from the registry
  // sends the Overview's origin to the Dashboard instead.
  const [pendingReturn, setPendingReturn] = useState<RecordOrigin>();
  const returnToOrigin = (origin: RecordOrigin) => {
    // The record was read on the Projects surface, at the place shown.
    const state = shown.getState();
    const registered = state.projects.some(
      (project) => project.id === origin.projectId,
    );
    if (origin.surface === "overview" && registered) {
      state.setCurrentProject(origin.projectId);
      state.setWorkspaceTab(origin.projectId, "overview");
      setSurface("Workspace");
    } else {
      setSurface("Dashboard");
    }
    setPendingReturn(origin);
  };
  useEffect(() => {
    if (!pendingReturn) return;
    setPendingReturn(undefined);
    const group = document.querySelector(
      `[data-testid="project-group-${pendingReturn.projectId}"]`,
    );
    const control = (group ?? document).querySelector<HTMLElement>(
      `[data-testid="${pendingReturn.anchor}"]`,
    );
    if (!control) return;
    if (typeof control.scrollIntoView === "function") {
      control.scrollIntoView({ block: "center" });
    }
    control.focus();
  }, [pendingReturn]);

  // Per-project spec view state lives here, above every surface, so
  // a draft under edit survives the workspace's own navigation
  // (spec-view-51); the page's leave guard covers closing the window
  // while any draft is unsaved (spec-view-49).
  const [specViewStates, setSpecViewStates] = useState<
    Record<string, SpecViewState>
  >({});
  const unsavedSpecs = Object.values(specViewStates).some(editorDirty);
  useEffect(() => {
    if (!unsavedSpecs) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [unsavedSpecs]);

  // Picking a project with parked attention lands on the session that
  // needs the human (DR-011), not the last-active tab — read from the
  // one ledger fold (DR-035) of the project's own place, this
  // computer's unless one is named (run-view-168).
  const pickProject = (projectId: string, place?: string) => {
    const store = storeAt(place);
    const state = store.getState();
    const needy = state.ledger?.attention.find(
      (entry) => entry.projectId === projectId,
    );
    if (needy) {
      void state.focusSession(needy.sessionId);
    } else {
      state.setCurrentProject(projectId);
    }
    showPlace(store);
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

  // A shortcut that opens a surface lands focus inside it, and the
  // sidebar binding lands on the sidebar's own control, so no shortcut
  // strands focus on the body (run-view-50, run-view-71, DR-010 §6).
  // The landing waits for the surface to render: the Boss composer
  // where the surface shows one, else the surface region itself, named
  // for what it is.
  const mainRef = useRef<HTMLElement>(null);
  const [landing, setLanding] = useState<{ on: "surface" | "rail" }>();
  useEffect(() => {
    if (!landing) return;
    // The open palette is modal and keeps focus (run-view-42); the
    // landing waits for it to close.
    if (paletteOpen) return;
    setLanding(undefined);
    if (landing.on === "rail") {
      const toggle = document.querySelector<HTMLElement>(
        '[data-testid="sidebar-collapse"]',
      );
      if (toggle) {
        toggle.focus();
        return;
      }
    }
    const main = mainRef.current;
    if (!main) return;
    const composer = main.querySelector<HTMLElement>(
      '[data-testid="boss-composer"], [data-testid="start-composer"]',
    );
    composer?.focus();
    if (document.activeElement !== composer) main.focus();
  }, [landing, paletteOpen]);

  // Application shortcuts (DR-010 §6, DR-011), renderer-side so the
  // UI runs unmodified in a browser (SHELL-10).
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      // The current project is the shown place's (run-view-168).
      const state = shown.getState();
      const projectId = state.currentProjectId;
      if (meta && !event.shiftKey && !event.altKey) {
        const index = Number.parseInt(event.key, 10);
        if (index >= 1 && index <= SURFACES.length) {
          event.preventDefault();
          setSurface(SURFACES[index - 1]);
          setLanding({ on: "surface" });
          return;
        }
        if (event.key === ",") {
          event.preventDefault();
          setSurface("Settings");
          setLanding({ on: "surface" });
          return;
        }
        if (event.key.toLowerCase() === "p") {
          event.preventDefault();
          setPaletteAddProject(false);
          setPaletteOpen((open) => !open);
          return;
        }
        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          setSurface("Workspace");
          if (projectId) {
            state.setWorkspaceTab(projectId, "start");
            setLanding({ on: "surface" });
          } else openPalette();
          return;
        }
        if (event.key.toLowerCase() === "b") {
          event.preventDefault();
          // The rail is the page's own chrome, kept by this computer's
          // store.
          const page = useAppStore.getState();
          page.setRailCollapsed(!page.railCollapsed);
          setLanding({ on: "rail" });
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
          const order = [...openIds, "start", "specs", "overview"];
          event.preventDefault();
          setSurface("Workspace");
          const remembered = state.workspaceTabs[projectId];
          const current = Math.max(
            0,
            order.indexOf(pinnedTab(remembered) ?? remembered ?? order[0]),
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
  }, [surface, paletteOpen, shown]);

  const playbookCount =
    configState?.status === "valid"
      ? configState.summary.playbooks.length
      : undefined;

  // The sidebar's selection: which session the workspace is showing,
  // read from the tabs of the place it shows.
  const activeTabSessionId = (
    workspaceTabs: Record<string, string>,
    projectId: string | undefined,
  ): string | undefined => {
    if (surface !== "Workspace" || !projectId) return undefined;
    const tab = workspaceTabs[projectId];
    if (!tab || pinnedTab(tab)) return undefined;
    return tab;
  };

  // The sidebar's places (run-view-67, run-view-168): each lists its
  // own projects and sessions, and every act on a row is taken at the
  // row's own place.
  const navPlaces: NavPlace[] = placeStates.map(({ store, value }) => ({
    key: store.place.key,
    label: placeLabel(store.place),
    projects: value.projects,
    sessions: value.sessions,
    attention: attentionAt(store.place.key),
    currentProjectId: value.currentProjectId,
    activeSessionId:
      store === shown
        ? activeTabSessionId(value.workspaceTabs, value.currentProjectId)
        : undefined,
    shown: store === shown,
    // The place's heading shows that place on the Projects surface: its
    // current project's view, or its welcome page where it holds no project.
    onShow: () => showPlace(store),
    expanded: value.expandedProjects,
    onExpanded: (projectId, expanded) =>
      store.getState().toggleProjectExpanded(projectId, expanded),
    onPickProject: (projectId) => pickProject(projectId, store.place.key),
    onActivateSession: (sessionId) =>
      openSessionAndShow(sessionId, undefined, store.place.key),
    onNewSession: (projectId) => {
      const state = store.getState();
      state.setCurrentProject(projectId);
      state.setWorkspaceTab(projectId, "start");
      showPlace(store);
    },
    onDeleteSession: (sessionId) => store.getState().deleteSession(sessionId),
  }));

  // The rail foot's other tenant. A broken config keeps its red voice
  // in both rail states (DR-030) — a first-hour failure must not go
  // quiet because the chrome folded.
  const configFoot =
    configState && configState.status !== "valid" ? (
      <button
        type="button"
        data-testid="config-status"
        onClick={() => navigateFrom(useAppStore)("Settings")}
        title={i18n._("Open Settings to see what's wrong")}
        // The status is the core's own enum: a machine word travels as
        // it is in every language (localization-1).
        aria-label={i18n._("Config {status} — open Settings", {
          status: configState.status,
        })}
        className={`flex shrink-0 items-center justify-center rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 ${
          railCollapsed ? "h-6 w-6" : "px-1.5 py-0.5 text-xs"
        }`}
      >
        {railCollapsed ? (
          <Icon name="gear" className="h-3.5 w-3.5" />
        ) : (
          i18n._("Config {status} →", { status: configState.status })
        )}
      </button>
    ) : railCollapsed || playbookCount === undefined ? null : (
      <span className="px-1 text-xs text-neutral-500">
        {playbookCount === 0
          ? i18n._("No playbooks yet")
          : i18n._("{count, plural, one {# playbook} other {# playbooks}}", {
              count: playbookCount,
            })}
      </span>
    );

  const addProjectByPath = useAppStore((state) => state.addProjectByPath);
  const createProject = useAppStore((state) => state.createProject);

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner store={useAppStore} />
      <SeatBanners banner="connection" />
      <ApprovalInbox />
      <ApprovalFeedback />
      <RefreshErrorBanner store={useAppStore} />
      <SeatBanners banner="refresh" />
      <Announcer />
      {paletteOpen ? (
        <ProjectPalette
          addProjectOnly={paletteAddProject}
          projects={local.projects}
          sessions={local.sessions}
          attention={attentionAt(LOCAL_PLACE_KEY)}
          // The current project is the shown place's (run-view-168).
          currentProjectId={shown === useAppStore ? local.currentProjectId : undefined}
          seats={placeStates.slice(1).map(({ store, value }) => ({
            key: store.place.key,
            label: placeLabel(store.place),
            projects: value.projects,
            sessions: value.sessions,
            attention: attentionAt(store.place.key),
            currentProjectId: store === shown ? value.currentProjectId : undefined,
            // A seat's project is opened among the member's groups there,
            // with no folder (run-view-169, space-103).
            groups: value.space,
            connected: value.connection === "open",
            onJoin: (instance, hostId) => store.getState().spaceJoin(instance, hostId),
            onReadGroups: () => {
              if (store.getState().connection === "open") {
                void store.getState().loadSpace().catch(() => {});
              }
            },
          }))}
          onPickFolder={
            window.spexNative
              ? () => window.spexNative!.pickDirectory()
              : undefined
          }
          onPick={(projectId) => pickProject(projectId)}
          onPickAt={(place, projectId) => pickProject(projectId, place)}
          onAddPath={addProjectByPath}
          onCreatePath={(path, scaffold) => createProject(path, scaffold)}
          onClose={() => {
            setPaletteOpen(false);
            setPaletteAddProject(false);
          }}
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
        <NavRail
          surface={surface}
          onSurface={setSurface}
          attentionCount={attentionCount}
          collapsed={railCollapsed}
          onCollapsed={setRailCollapsed}
          places={navPlaces}
          onAddProject={openAddProject}
          foot={configFoot}
        />
        <main
          ref={mainRef}
          // The surface region takes focus programmatically, never by
          // Tab: a shortcut lands here when the surface has no
          // composer, so the reader hears where they are.
          tabIndex={-1}
          aria-label={SURFACE_LABELS[surface]()}
          className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
        >
          {surface === "Playbooks" || surface === "Settings" || surface === "Space" ? (
            // Settings, Playbooks — with its Environments — and Groups
            // show one place at a time, the one the selector names
            // (run-view-168); with no seat open there is none to pick.
            <PlaceStoreContext.Provider value={configured}>
              {stores.length > 1 ? (
                <PlaceSelector
                  stores={stores}
                  shown={configured}
                  onShow={(store) => setConfiguredPlace(store.place.key)}
                />
              ) : null}
              {surface === "Playbooks" ? (
                <LibrarySurface key={configured.place.key} onNavigate={setSurface} />
              ) : surface === "Settings" ? (
                <SettingsSurface
                  key={configured.place.key}
                  credentialHost={
                    credentialAsk?.place === configured.place.key ? credentialAsk.host : undefined
                  }
                  onCredentialHostShown={() => setCredentialAsk(undefined)}
                />
              ) : (
                <SpaceSurface
                  key={configured.place.key}
                  onOpenSession={(sessionId) =>
                    openSessionAndShow(sessionId, undefined, configured.place.key)
                  }
                  onOpenProject={(projectId) => pickProject(projectId, configured.place.key)}
                  // A failed code clone's host opens this place's
                  // Credentials section at it (space-103, settings-48).
                  onAddCredential={(host) => {
                    setCredentialAsk({ place: configured.place.key, host });
                    setSurface("Settings");
                  }}
                />
              )}
            </PlaceStoreContext.Provider>
          ) : surface === "Dashboard" ? (
            <DashboardSurface
              onOpenSession={openSessionAndShow}
              onOpenIntent={openIntentFrom("dashboard")}
              onStartIntent={startIntentAt(useAppStore)}
              // A link to a project opens it at the project's place,
              // the Projects surface showing that place (run-view-168).
              onNavigate={(_surface, place) => showPlace(place)}
            />
          ) : (
            // The Projects surface reads the place it shows (run-view-168).
            <PlaceStoreContext.Provider value={shown}>
              <WorkspaceSurface
                key={shown.place.key}
                onNavigate={navigateFrom(shown)}
                onOpenPalette={openPalette}
                // This computer's welcome adds a local project; a seat's
                // greets the member with its server form, opening the
                // palette at its groups (run-view-174).
                onOpenOwnProject={openAddProject}
                attentionBySession={attentionBySession}
                pendingFocus={pendingFocus}
                onFocusHandled={() => setPendingFocus(undefined)}
                onOpenSession={(sessionId, turnId) =>
                  openSessionAndShow(sessionId, turnId, shown.place.key)
                }
                onOpenIntent={openIntentFrom("overview", shown)}
                onStartIntent={startIntentAt(shown)}
                pendingRecord={pendingRecord}
                onRecordOpened={() => setPendingRecord(null)}
                onReturn={returnToOrigin}
                specViewStates={specViewStates}
                onSpecViewState={(key, next) =>
                  setSpecViewStates((current) => ({
                    ...current,
                    [key]: next,
                  }))
                }
              />
            </PlaceStoreContext.Provider>
          )}
        </main>
      </div>
    </div>
  );
}

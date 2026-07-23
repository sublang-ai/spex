// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App store: wires the protocol client into view state. Composer
// submissions queue client-side while a turn is active and dispatch
// when it ends (RUN-8); the core enforces one turn at a time.
// Reconnects re-subscribe every live session and backfill missed
// records via history afterSeq, so panes never silently freeze.

import { create } from "zustand";
import type {
  BuiltinPlaybookInfo,
  ConfigState,
  ForgeState,
  ProjectInfo,
  ReadinessEntry,
  RepoStatusInfo,
  ServerMessage,
  SessionInfo,
  SpecTreeState,
} from "@sublang/spex-core/protocol";

import { SpexClient, defaultCoreUrl, type ConnectionStatus } from "../lib/client.js";
import {
  applyRecord,
  initialSessionView,
  type SessionView,
} from "./reducer.js";

export interface ComposerState {
  queued: string[];
  /** Unsent composer text — survives tab and surface switches. */
  draft?: string;
}

export interface ProjectMeta {
  status?: RepoStatusInfo;
  forge?: ForgeState;
  statusError?: string;
  forgeError?: string;
  loading?: boolean;
}

export interface CompileTracker {
  playbookId: string;
  running: boolean;
  ok?: boolean;
}

export interface AppState {
  connection: ConnectionStatus;
  /** True once a connection has ever opened (first-paint banner). */
  everConnected: boolean;
  configState?: ConfigState;
  readiness: ReadinessEntry[];
  projects: ProjectInfo[];
  projectMeta: Record<string, ProjectMeta>;
  compileProgress: Record<string, string[]>;
  activeCompile?: CompileTracker;
  /** Built-in playbook catalog (DR-015); undefined until first load. */
  builtins?: BuiltinPlaybookInfo[];
  sessions: SessionInfo[];
  views: Record<string, SessionView>;
  composers: Record<string, ComposerState>;
  /** Per-session command failures shown above the composer. */
  runErrors: Record<string, string>;
  activeSessionId?: string;
  /** The workspace's project context (DR-011): set only by the
   * palette, focusSession, or boot restoration. */
  currentProjectId?: string;
  /** Per-project last-active workspace tab: a session id, "start",
   * "specs", or "repo" (DR-011 workspace memory). */
  workspaceTabs: Record<string, string>;
  /** Parsed specs trees per project (specs.get). */
  specTrees: Record<string, SpecTreeState>;
  /** Spec-view load failures per project. */
  specErrors: Record<string, string>;
  /** Draft for the Captain-home start composer. */
  homeDraft: string;
  /** Bootstrap refresh failure — connected but app state missing. */
  refreshError?: string;

  connect(url?: string): void;
  refresh(): Promise<void>;
  setCurrentProject(projectId: string | undefined): void;
  setWorkspaceTab(projectId: string, tab: string): void;
  /** Register a folder, silently git-initializing non-repos
   * (RUN-27); the palette and any surface share this one action. */
  addProjectByPath(path: string): Promise<ProjectInfo>;
  /** Load (or refresh) the built-in playbook catalog (DR-015). */
  loadBuiltins(): Promise<void>;
  /** Seed the Academy example project (DR-015) and make it current.
   * Paths pass through as typed — the core expands a leading ~. */
  openAcademyExample(path?: string): Promise<ProjectInfo>;
  loadSpecs(projectId: string): Promise<void>;
  readSpecRecord(projectId: string, path: string): Promise<string>;
  refreshReadiness(): Promise<void>;
  registerProject(path: string): Promise<ProjectInfo>;
  createProject(path: string, scaffold: boolean): Promise<ProjectInfo>;
  removeProject(projectId: string): Promise<void>;
  loadProjectMeta(projectId: string, refresh?: boolean): Promise<void>;
  openSession(projectId: string): Promise<SessionInfo>;
  focusSession(sessionId: string): Promise<void>;
  /** Load an ended session's transcript without focusing tabs.
   * `force` retries after a failed load (clears the stale view). */
  loadPastSession(sessionId: string, force?: boolean): Promise<void>;
  disposeSession(sessionId: string): Promise<void>;
  submitBossText(sessionId: string, text: string): Promise<void>;
  removeQueued(sessionId: string, index: number): void;
  abortTurn(sessionId: string): Promise<void>;
  clearRunError(sessionId: string): void;
  setDraft(sessionId: string, draft: string): void;
  setHomeDraft(draft: string): void;
  abortCompile(): Promise<void>;
  runCompile(input: {
    playbookId: string;
    sourceText?: string;
    sourcePath?: string;
    roles: string[];
    command: string;
    intent: string;
    players: Record<string, string>;
  }): Promise<void>;
}

let client: SpexClient | undefined;

const CURRENT_PROJECT_KEY = "spex.currentProject";

/** localStorage access that tolerates non-browser test environments. */
function safeStorageGet(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort.
  }
}

/** Sessions with a history backfill in flight: live records buffer
 * here so a race can never skip the gap (they apply after the
 * backfill in seq order). */
const backfilling = new Map<
  string,
  { seq: number; record: import("@sublang/spex-core/protocol").TmuxPlayRecord }[]
>();

export function getClient(): SpexClient {
  if (!client) throw new Error("client not connected");
  return client;
}

/** Test seam: store actions resolve the module-local client, which
 * module mocks cannot reach — vitest injects a fake through here. */
export function setClientForTests(fake: SpexClient | undefined): void {
  client = fake;
}

export const useAppStore = create<AppState>((set, get) => {
  function setRunError(sessionId: string, message: string): void {
    set({ runErrors: { ...get().runErrors, [sessionId]: message } });
  }

  /** Dispatch the next queued composer message when a turn is idle
   * (RUN-8), from live records and backfills alike. */
  function maybeDispatchQueued(sessionId: string): void {
    const state = get();
    const view = state.views[sessionId];
    const composer = state.composers[sessionId];
    const next = composer?.queued[0];
    if (!view || view.turnActive || next === undefined) return;
    const session = state.sessions.find((s) => s.id === sessionId);
    if (session && !session.live) {
      // The session ended underneath the queue: drop it with a notice
      // instead of submitting into a disposed runtime.
      set({
        composers: { ...state.composers, [sessionId]: { queued: [] } },
        runErrors: {
          ...state.runErrors,
          [sessionId]: `queued message was not sent — the session ended: "${next}"`,
        },
      });
      return;
    }
    set({
      composers: {
        ...state.composers,
        [sessionId]: { queued: composer!.queued.slice(1) },
      },
    });
    void getClient()
      .command("turn.submit", { sessionId, text: next })
      .catch((cause: Error) =>
        setRunError(sessionId, `queued submission failed: ${cause.message}`),
      );
  }

  /** Subscribe and backfill a session's view (idempotent). Live
   * records arriving mid-backfill buffer and apply afterwards, so a
   * reconnect can never lose the gap. */
  async function ensureSubscribed(sessionId: string): Promise<void> {
    const state = get();
    const session = state.sessions.find((s) => s.id === sessionId);
    let view = state.views[sessionId];
    if (!view) {
      view = initialSessionView(
        session?.players ?? [],
        session?.initialVisible ?? [],
      );
      view.loading = true;
      set({ views: { ...state.views, [sessionId]: view } });
    }
    backfilling.set(sessionId, []);
    try {
      await getClient().subscribe({ kind: "session", sessionId });
      const history = await getClient().command("history.get", {
        sessionId,
        afterSeq: view.lastSeq,
      });
      const fresh = get();
      const target = fresh.views[sessionId];
      if (!target) return;
      for (const entry of history.records) {
        if (entry.seq > target.lastSeq) {
          applyRecord(target, entry.seq, entry.record);
        }
      }
      const buffered = backfilling.get(sessionId) ?? [];
      for (const entry of buffered) {
        if (entry.seq > target.lastSeq) {
          applyRecord(target, entry.seq, entry.record);
        }
      }
      target.loading = false;
      set({ views: { ...fresh.views, [sessionId]: { ...target } } });
      maybeDispatchQueued(sessionId);
    } catch (cause) {
      const failed = get().views[sessionId];
      if (failed?.loading) {
        failed.loading = false;
        set({ views: { ...get().views, [sessionId]: { ...failed } } });
      }
      setRunError(
        sessionId,
        `transcript could not be loaded: ${(cause as Error).message}`,
      );
      throw cause;
    } finally {
      backfilling.delete(sessionId);
    }
  }

  function handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "config.state":
        set({ configState: message.state });
        // Config edits flip catalog `configured` flags (DR-015):
        // refresh an already-loaded catalog so the Library stays true.
        if (get().builtins) {
          void get()
            .loadBuiltins()
            .catch(() => {});
        }
        break;
      case "readiness.state":
        set({ readiness: message.profiles });
        break;
      case "compile.progress": {
        const progress = get().compileProgress;
        set({
          compileProgress: {
            ...progress,
            [message.playbookId]: [
              ...(progress[message.playbookId] ?? []),
              message.line,
            ],
          },
        });
        break;
      }
      case "session.state": {
        const sessions = get().sessions.filter(
          (session) => session.id !== message.session.id,
        );
        sessions.push(message.session);
        sessions.sort((a, b) => a.createdAt - b.createdAt);
        set({ sessions });
        break;
      }
      case "record": {
        const { sessionId, seq, record } = message;
        const buffer = backfilling.get(sessionId);
        if (buffer) {
          buffer.push({ seq, record });
          break;
        }
        const state = get();
        const session = state.sessions.find((s) => s.id === sessionId);
        const view =
          state.views[sessionId] ??
          initialSessionView(
            session?.players ?? [],
            session?.initialVisible ?? [],
          );
        applyRecord(view, seq, record);

        const updates: Partial<AppState> = {
          views: { ...state.views, [sessionId]: { ...view } },
        };

        set(updates);
        // Dispatch a queued submission when the turn ends (RUN-8).
        if (record.type === "turn_finished" || record.type === "turn_aborted") {
          maybeDispatchQueued(sessionId);
          // Agents may have rewritten specs during the turn: re-read
          // any loaded tree for this project (DR-011 freshness).
          if (session && get().specTrees[session.projectId]) {
            void get().loadSpecs(session.projectId);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  return {
    connection: "closed",
    everConnected: false,
    readiness: [],
    projects: [],
    projectMeta: {},
    compileProgress: {},
    sessions: [],
    views: {},
    composers: {},
    runErrors: {},
    workspaceTabs: {},
    specTrees: {},
    specErrors: {},
    homeDraft: "",

    connect(url?: string): void {
      client = new SpexClient({
        url: url ?? defaultCoreUrl(),
        onMessage: handleMessage,
        onStatus: (connection) => {
          set({ connection });
          if (connection === "open") {
            set({ everConnected: true });
            // A failed bootstrap must not present as an empty app
            // (DR-010 §5): surface it with a retry.
            void get()
              .refresh()
              .then(() => set({ refreshError: undefined }))
              .catch((cause: Error) =>
                set({
                  refreshError: `app state failed to load: ${cause.message}`,
                }),
              );
          }
        },
      });
      client.connect();
    },

    async refresh(): Promise<void> {
      const [configState, readiness, projects, sessions] = await Promise.all([
        getClient().command("config.get", {}),
        getClient().command("readiness.get", {}),
        getClient().command("project.list", {}),
        getClient().command("session.list", {}),
      ]);
      set({ configState, readiness, projects, sessions });
      for (const project of projects) {
        void get().loadProjectMeta(project.id);
      }
      // Re-subscribe every live session (fresh connection or reconnect)
      // and backfill anything missed while disconnected.
      const live = sessions.filter((session) => session.live);
      for (const session of live) {
        await ensureSubscribed(session.id).catch(() => {});
      }
      // Boot the project context (DR-011): the persisted project when
      // it still exists, else the first live session's project.
      let current = get().currentProjectId;
      if (!current) {
        const persisted = safeStorageGet(CURRENT_PROJECT_KEY);
        if (persisted && projects.some((p) => p.id === persisted)) {
          current = persisted;
        } else if (live.length > 0) {
          current = live[0].projectId;
        }
        if (current) set({ currentProjectId: current });
      }
      // Bootstrap session activation happens within the current
      // project, never across it.
      const active = get().activeSessionId;
      const inProject = live.filter((s) => s.projectId === current);
      if ((!active || !live.some((s) => s.id === active)) && inProject[0]) {
        set({ activeSessionId: inProject[0].id });
      }
    },

    setCurrentProject(projectId: string | undefined): void {
      set({ currentProjectId: projectId });
      if (projectId) safeStorageSet(CURRENT_PROJECT_KEY, projectId);
    },

    setWorkspaceTab(projectId: string, tab: string): void {
      set({
        workspaceTabs: { ...get().workspaceTabs, [projectId]: tab },
      });
    },

    async addProjectByPath(path: string): Promise<ProjectInfo> {
      let project: ProjectInfo;
      try {
        project = await get().registerProject(path);
      } catch (cause) {
        if (/not the root of a git work tree/.test((cause as Error).message)) {
          // Not a repo yet: initialize one, no questions asked (RUN-27).
          project = await get().createProject(path, false);
        } else {
          throw cause;
        }
      }
      return project;
    },

    async loadBuiltins(): Promise<void> {
      const { builtins } = await getClient().command("library.builtins", {});
      set({ builtins });
    },

    async openAcademyExample(path?: string): Promise<ProjectInfo> {
      // Same path UX as the palette's typed paths: pass through as
      // written and let the core expand ~ (DR-015 example mode).
      const target = path?.trim() || "~/spex-academy";
      let project: ProjectInfo;
      try {
        project = await getClient().command("project.create", {
          path: target,
          example: true,
        });
      } catch (cause) {
        // A repeat visit: the example is already a registered
        // project — open it instead of surfacing the conflict. The
        // error names the expanded path, which the client cannot
        // derive itself.
        const registered = /^(.*) is already registered$/.exec(
          (cause as Error).message ?? "",
        )?.[1];
        const projects = await getClient().command("project.list", {});
        const existing = registered
          ? projects.find((entry) => entry.path === registered)
          : undefined;
        if (!existing) throw cause;
        set({ projects });
        void get().loadProjectMeta(existing.id);
        get().setCurrentProject(existing.id);
        return existing;
      }
      // Registration happened server-side: mirror the post-create
      // flow of addProjectByPath, then make the example current.
      set({ projects: await getClient().command("project.list", {}) });
      void get().loadProjectMeta(project.id);
      get().setCurrentProject(project.id);
      return project;
    },

    async loadSpecs(projectId: string): Promise<void> {
      try {
        const tree = await getClient().command("specs.get", { projectId });
        const { [projectId]: _, ...errors } = get().specErrors;
        set({
          specTrees: { ...get().specTrees, [projectId]: tree },
          specErrors: errors,
        });
      } catch (cause) {
        set({
          specErrors: {
            ...get().specErrors,
            [projectId]: (cause as Error).message,
          },
        });
      }
    },

    async readSpecRecord(projectId: string, path: string): Promise<string> {
      const reply = await getClient().command("specs.read", {
        projectId,
        path,
      });
      return reply.markdown;
    },

    async refreshReadiness(): Promise<void> {
      set({ readiness: await getClient().command("readiness.get", {}) });
    },

    async registerProject(path: string): Promise<ProjectInfo> {
      const project = await getClient().command("project.register", { path });
      set({ projects: await getClient().command("project.list", {}) });
      void get().loadProjectMeta(project.id);
      return project;
    },

    async createProject(path: string, scaffold: boolean): Promise<ProjectInfo> {
      const project = await getClient().command("project.create", {
        path,
        scaffold,
      });
      set({ projects: await getClient().command("project.list", {}) });
      void get().loadProjectMeta(project.id);
      return project;
    },

    async removeProject(projectId: string): Promise<void> {
      await getClient().command("project.remove", { projectId });
      set({ projects: await getClient().command("project.list", {}) });
    },

    async loadProjectMeta(projectId: string, refresh = false): Promise<void> {
      const before = get();
      set({
        projectMeta: {
          ...before.projectMeta,
          [projectId]: { ...before.projectMeta[projectId], loading: true },
        },
      });
      const [status, forge] = await Promise.allSettled([
        getClient().command("project.status", { projectId }),
        getClient().command("forge.items", { projectId, refresh }),
      ]);
      const meta: ProjectMeta = { loading: false };
      if (status.status === "fulfilled") meta.status = status.value;
      else meta.statusError = (status.reason as Error).message;
      if (forge.status === "fulfilled") meta.forge = forge.value;
      else meta.forgeError = (forge.reason as Error).message;
      set({ projectMeta: { ...get().projectMeta, [projectId]: meta } });
    },

    async openSession(projectId: string): Promise<SessionInfo> {
      const session = await getClient().command("session.create", {
        projectId,
      });
      const sessions = [
        ...get().sessions.filter((existing) => existing.id !== session.id),
        session,
      ].sort((a, b) => a.createdAt - b.createdAt);
      set({ sessions });
      await get().focusSession(session.id);
      return session;
    },

    async focusSession(sessionId: string): Promise<void> {
      if (!get().views[sessionId]) {
        await ensureSubscribed(sessionId);
      }
      set({ activeSessionId: sessionId });
      // Focusing a session always carries its project context along
      // (DR-011): Dashboard rows and palette rows route through here.
      const session = get().sessions.find((s) => s.id === sessionId);
      if (session) {
        get().setCurrentProject(session.projectId);
        get().setWorkspaceTab(session.projectId, sessionId);
      }
    },

    async loadPastSession(sessionId: string, force = false): Promise<void> {
      if (force) {
        // Retry after a failed load: the stale view would otherwise
        // short-circuit this into a no-op.
        const { [sessionId]: _, ...views } = get().views;
        set({ views });
        get().clearRunError(sessionId);
      }
      if (!get().views[sessionId]) {
        await ensureSubscribed(sessionId);
      }
    },

    async disposeSession(sessionId: string): Promise<void> {
      // The end-session confirm already named what gets discarded.
      const composer = get().composers[sessionId];
      if (composer?.draft) {
        set({
          composers: {
            ...get().composers,
            [sessionId]: { ...composer, draft: "" },
          },
        });
      }
      try {
        await getClient().command("session.dispose", { sessionId });
      } catch (cause) {
        const error = cause as { code?: string; message: string };
        // Already gone: reflect reality instead of erroring.
        if (error.code !== "not_found") {
          setRunError(sessionId, `end session failed: ${error.message}`);
          throw cause;
        }
      }
    },

    async submitBossText(sessionId: string, text: string): Promise<void> {
      const state = get();
      const view = state.views[sessionId];
      const enqueue = () => {
        const composer = get().composers[sessionId] ?? { queued: [] };
        set({
          composers: {
            ...get().composers,
            [sessionId]: { queued: [...composer.queued, text] },
          },
        });
      };
      if (view?.turnActive) {
        enqueue();
        return;
      }
      try {
        await getClient().command("turn.submit", { sessionId, text });
      } catch (cause) {
        const error = cause as { code?: string; message: string };
        if (error.code === "busy") {
          // The view lagged reality (e.g. right after a reconnect):
          // queueing is what the user meant.
          enqueue();
          return;
        }
        setRunError(sessionId, error.message);
        throw cause;
      }
    },

    removeQueued(sessionId: string, index: number): void {
      const composer = get().composers[sessionId];
      if (!composer) return;
      set({
        composers: {
          ...get().composers,
          [sessionId]: {
            ...composer,
            queued: composer.queued.filter((_, i) => i !== index),
          },
        },
      });
    },

    async abortTurn(sessionId: string): Promise<void> {
      try {
        await getClient().command("turn.abort", { sessionId });
      } catch (cause) {
        setRunError(sessionId, `abort failed: ${(cause as Error).message}`);
      }
    },

    clearRunError(sessionId: string): void {
      const { [sessionId]: _, ...rest } = get().runErrors;
      set({ runErrors: rest });
    },

    setDraft(sessionId: string, draft: string): void {
      const composer = get().composers[sessionId] ?? { queued: [] };
      set({
        composers: {
          ...get().composers,
          [sessionId]: { ...composer, draft },
        },
      });
    },

    setHomeDraft(draft: string): void {
      set({ homeDraft: draft });
    },

    async abortCompile(): Promise<void> {
      const active = get().activeCompile;
      if (!active?.running) return;
      try {
        await getClient().command("compile.abort", {
          playbookId: active.playbookId,
        });
      } catch (cause) {
        const progress = get().compileProgress;
        set({
          compileProgress: {
            ...progress,
            [active.playbookId]: [
              ...(progress[active.playbookId] ?? []),
              `✗ cancel failed: ${(cause as Error).message}`,
            ],
          },
        });
      }
    },

    async runCompile(input): Promise<void> {
      const playbookId = input.playbookId;
      set({
        activeCompile: { playbookId, running: true },
        compileProgress: { ...get().compileProgress, [playbookId]: [] },
      });
      const appendLine = (line: string) => {
        const progress = get().compileProgress;
        set({
          compileProgress: {
            ...progress,
            [playbookId]: [...(progress[playbookId] ?? []), line],
          },
        });
      };
      try {
        // Compiles legitimately run for minutes: no client timeout
        // (DR-010 §5) — a dropped socket still rejects the call.
        await getClient().command("compile.run", input, { timeoutMs: 0 });
        appendLine("✓ compiled and registered — see Configured playbooks");
        set({ activeCompile: { playbookId, running: false, ok: true } });
      } catch (cause) {
        const error = cause as { code?: string; message: string };
        // A user cancel already ends the log with the ◇ line; a busy
        // rejection means this very compile is still running.
        if (error.code === "aborted") {
          set({ activeCompile: { playbookId, running: false, ok: false } });
          return;
        }
        if (error.code === "busy") {
          appendLine(`… ${error.message}`);
          return;
        }
        appendLine(`✗ ${error.message}`);
        set({ activeCompile: { playbookId, running: false, ok: false } });
        throw cause;
      }
    },
  };
});

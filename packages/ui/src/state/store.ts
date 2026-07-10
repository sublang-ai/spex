// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// App store: wires the protocol client into view state. Composer
// submissions queue client-side while a turn is active and dispatch
// when it ends (RUN-8); the core enforces one turn at a time.

import { create } from "zustand";
import type {
  ConfigState,
  ForgeState,
  ProjectInfo,
  ReadinessEntry,
  RepoStatusInfo,
  ServerMessage,
  SessionInfo,
} from "@sublang/spex-core/protocol";

import { SpexClient, defaultCoreUrl, type ConnectionStatus } from "../lib/client.js";
import {
  applyRecord,
  initialSessionView,
  type SessionView,
} from "./reducer.js";

export interface ComposerState {
  queued: string[];
  /** True when the next submission answers a pending Boss question. */
  answering: boolean;
}

export interface ProjectMeta {
  status?: RepoStatusInfo;
  forge?: ForgeState;
}

export interface AppState {
  connection: ConnectionStatus;
  configState?: ConfigState;
  readiness: ReadinessEntry[];
  projects: ProjectInfo[];
  projectMeta: Record<string, ProjectMeta>;
  compileProgress: Record<string, string[]>;
  sessions: SessionInfo[];
  views: Record<string, SessionView>;
  composers: Record<string, ComposerState>;
  activeSessionId?: string;

  connect(url?: string): void;
  refresh(): Promise<void>;
  registerProject(path: string): Promise<ProjectInfo>;
  createProject(path: string, scaffold: boolean): Promise<ProjectInfo>;
  loadProjectMeta(projectId: string, refresh?: boolean): Promise<void>;
  removeProject(projectId: string): Promise<void>;
  openSession(projectId: string): Promise<SessionInfo>;
  focusSession(sessionId: string): Promise<void>;
  disposeSession(sessionId: string): Promise<void>;
  submitBossText(sessionId: string, text: string): Promise<void>;
  abortTurn(sessionId: string): Promise<void>;
}

let client: SpexClient | undefined;

export function getClient(): SpexClient {
  if (!client) throw new Error("client not connected");
  return client;
}

export const useAppStore = create<AppState>((set, get) => {
  function handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "config.state":
        set({ configState: message.state });
        break;
      case "readiness.state":
        set({ readiness: message.profiles });
        break;
      case "compile.progress": {
        const progress = get().compileProgress;
        const lines = progress[message.playbookId] ?? [];
        set({
          compileProgress: {
            ...progress,
            [message.playbookId]: [...lines.slice(-199), message.line],
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

        // Dispatch a queued submission when the turn ends (RUN-8).
        if (record.type === "turn_finished" || record.type === "turn_aborted") {
          const composer = state.composers[sessionId];
          const next = composer?.queued[0];
          if (next !== undefined) {
            updates.composers = {
              ...state.composers,
              [sessionId]: {
                queued: composer.queued.slice(1),
                answering: false,
              },
            };
            void getClient()
              .command("turn.submit", { sessionId, text: next })
              .catch(() => {});
          }
        }
        set(updates);
        break;
      }
      default:
        break;
    }
  }

  return {
    connection: "closed",
    readiness: [],
    projects: [],
    projectMeta: {},
    compileProgress: {},
    sessions: [],
    views: {},
    composers: {},

    connect(url?: string): void {
      client = new SpexClient({
        url: url ?? defaultCoreUrl(),
        onMessage: handleMessage,
        onStatus: (connection) => {
          set({ connection });
          if (connection === "open") void get().refresh();
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
      const live = sessions.filter((session) => session.live);
      for (const session of live) {
        await get().focusSession(session.id);
      }
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

    async loadProjectMeta(projectId: string, refresh = false): Promise<void> {
      const [status, forge] = await Promise.all([
        getClient()
          .command("project.status", { projectId })
          .catch(() => undefined),
        getClient()
          .command("forge.items", { projectId, refresh })
          .catch(() => undefined),
      ]);
      set({
        projectMeta: {
          ...get().projectMeta,
          [projectId]: { status, forge },
        },
      });
    },

    async removeProject(projectId: string): Promise<void> {
      await getClient().command("project.remove", { projectId });
      set({ projects: await getClient().command("project.list", {}) });
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
      const state = get();
      const session = state.sessions.find((s) => s.id === sessionId);
      if (!state.views[sessionId]) {
        const view = initialSessionView(
          session?.players ?? [],
          session?.initialVisible ?? [],
        );
        set({ views: { ...state.views, [sessionId]: view } });
        await getClient().subscribe({ kind: "session", sessionId });
        const history = await getClient().command("history.get", {
          sessionId,
        });
        const fresh = get();
        const target = fresh.views[sessionId];
        if (target) {
          for (const entry of history.records) {
            if (entry.seq > target.lastSeq) {
              applyRecord(target, entry.seq, entry.record);
            }
          }
          set({
            views: { ...fresh.views, [sessionId]: { ...target } },
            activeSessionId: sessionId,
          });
          return;
        }
      }
      set({ activeSessionId: sessionId });
    },

    async disposeSession(sessionId: string): Promise<void> {
      await getClient().command("session.dispose", { sessionId });
    },

    async submitBossText(sessionId: string, text: string): Promise<void> {
      const state = get();
      const view = state.views[sessionId];
      if (view?.turnActive) {
        const composer = state.composers[sessionId] ?? {
          queued: [],
          answering: false,
        };
        set({
          composers: {
            ...state.composers,
            [sessionId]: { ...composer, queued: [...composer.queued, text] },
          },
        });
        return;
      }
      await getClient().command("turn.submit", { sessionId, text });
    },

    async abortTurn(sessionId: string): Promise<void> {
      await getClient().command("turn.abort", { sessionId });
    },
  };
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The core service: config lifecycle (load/seed/watch, CORE-2/3),
// loopback WebSocket endpoint with hello/version handshake (CORE-1),
// command dispatch with schema validation (CORE-13), and record
// channels filtered by visibility at this boundary (CORE-8/14).

import { existsSync, readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";

import {
  checkAdapterReadiness,
  createModuleLoader,
  isKnownAdapter,
  loadConfig,
  resolveConfigPath,
  seedConfig,
  summarizeConfig,
  type ComposedConfig,
  type LoadModule,
} from "./config.js";
import {
  parseCommand,
  PROTOCOL_VERSION,
  type AdapterName,
  type Channel,
  type Command,
  type ConfigState,
  type ErrorCode,
  type ReadinessEntry,
  type ServerMessage,
} from "./protocol.js";
import { CoreError, SessionManager, type CaptainFactory, type RecordEnvelope } from "./session.js";
import { Store } from "./store.js";
import {
  GitHubForgeAdapter,
  createProjectRepo,
  defaultRunCommand,
  isWorkTreeRoot,
  repoStatus,
  type ForgeAdapter,
  type RunCommand,
} from "./forge.js";
import {
  editConfigFile,
  profileReferences,
  type ConfigEditOp,
} from "./config-edit.js";
import { resolveArtifacts } from "./artifacts.js";
import { parseSpecTree, resolveSpecPath } from "./specs.js";
import { checkToolchain, compilePlaybook, type LineSpawner } from "./compile.js";
import type { ForgeState } from "./protocol.js";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";

const CORE_VERSION = "0.1.0";

export interface CoreServiceOptions {
  /** Shared config path; defaults to the XDG playbook location. */
  configPath?: string;
  /** SQLite path; defaults to in-memory (callers should set it). */
  dbPath?: string;
  port?: number;
  loadModule?: LoadModule;
  adapterImports?: PlayerAdapterImports;
  captainFactory?: CaptainFactory;
  env?: NodeJS.ProcessEnv;
  home?: string;
  /** Disable the config file watcher (tests drive reload directly). */
  watchConfig?: boolean;
  /** Injectable external-command runner (git/gh; tests stub this). */
  runCommand?: RunCommand;
  forgeAdapter?: ForgeAdapter;
  /** Scaffold command for project creation, e.g. ["npx","-y","@sublang/spex"]. */
  scaffoldCommand?: string[];
  /** Compiled-playbook library directory (DR-005). */
  libraryDir?: string;
  /**
   * Handshake token required on the WS URL (?token=). Defaults to a
   * random value; embedding shells pass it to the UI. Foreign
   * browser origins are rejected regardless.
   */
  token?: string;
  /** Injectable line-streaming spawner for compile runs (tests). */
  compileSpawner?: LineSpawner;
}

const FORGE_CACHE_MS = 60_000;

interface ClientState {
  socket: WebSocket;
  channels: Set<string>;
}

function channelKey(channel: Channel): string {
  return `${channel.kind}:${channel.sessionId}`;
}

/** Expand a leading ~ so the most natural path spelling works. */
function expandPath(input: string, home: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") return home;
  if (trimmed.startsWith("~/")) return resolve(home, trimmed.slice(2));
  return resolve(trimmed);
}

export interface CoreServiceEvents {
  /** Local hook for an embedding shell (notifications, badges). */
  onRecord?: (envelope: RecordEnvelope) => void;
  onSessionState?: (session: import("./protocol.js").SessionInfo) => void;
}

export class CoreService {
  private readonly options: CoreServiceOptions;
  private readonly configPath: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly home: string;
  private readonly store: Store;
  private readonly sessions: SessionManager;
  private readonly clients = new Set<ClientState>();
  private authToken = "";
  readonly events: CoreServiceEvents = {};
  private wss?: WebSocketServer;
  private watcher?: FSWatcher;
  private reloadTimer?: NodeJS.Timeout;

  private configState: ConfigState;
  private composed?: ComposedConfig;
  private seeded = false;
  private readonly runCommand: RunCommand;
  private readonly forge: ForgeAdapter;
  private readonly forgeCache = new Map<
    string,
    { at: number; state: ForgeState }
  >();
  /** One in-flight compile per playbook id; abort via compile.abort. */
  private readonly activeCompiles = new Map<string, AbortController>();

  private constructor(options: CoreServiceOptions) {
    this.options = options;
    this.env = options.env ?? process.env;
    this.home = options.home ?? this.env.HOME ?? homedir();
    this.configPath =
      options.configPath ?? resolveConfigPath(this.env, this.home);
    if (!options.loadModule) {
      this.options = { ...options, loadModule: createModuleLoader(this.env) };
    }
    this.authToken = options.token ?? randomUUID();
    this.runCommand = options.runCommand ?? defaultRunCommand;
    this.forge =
      options.forgeAdapter ?? new GitHubForgeAdapter(this.runCommand);
    this.store = new Store(options.dbPath ?? ":memory:");
    this.configState = { status: "missing", path: this.configPath };
    this.sessions = new SessionManager({
      store: this.store,
      loadModule: options.loadModule,
      adapterImports: options.adapterImports,
      captainFactory: options.captainFactory,
    });
    this.sessions.onRecord = (envelope) => {
      this.dispatchRecord(envelope);
      this.events.onRecord?.(envelope);
    };
    this.sessions.onSessionState = (session) => {
      this.broadcast({ type: "session.state", session });
      this.events.onSessionState?.(session);
    };
  }

  static async start(options: CoreServiceOptions = {}): Promise<CoreService> {
    const service = new CoreService(options);
    service.store.markAllSessionsNotLive();
    service.seeded = seedConfig(service.configPath);
    await service.reloadConfig();
    if (options.watchConfig !== false) service.watchConfigFile();
    await service.listen(options.port ?? 0);
    return service;
  }

  port(): number {
    const address = this.wss?.address() as AddressInfo | null;
    if (!address || typeof address === "string") {
      throw new Error("service is not listening");
    }
    return address.port;
  }

  configStateSnapshot(): ConfigState {
    return this.configState;
  }

  /** Config notification preferences (event -> off|bell|desktop). */
  notificationPrefs(): Record<string, string> {
    const prefs = this.composed?.notifications;
    return typeof prefs === "object" && prefs !== null
      ? (prefs as Record<string, string>)
      : {};
  }

  /** True while any live session has an active boss turn. */
  hasActiveTurns(): boolean {
    return this.sessions
      .listSessions()
      .some((session) => session.live && this.sessions.getLive(session.id)?.turnActive);
  }

  async stop(): Promise<void> {
    this.watcher?.close();
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    // Kill any in-flight compile child so shutdown never orphans slc.
    for (const controller of this.activeCompiles.values()) controller.abort();
    await this.sessions.disposeAll();
    for (const client of this.clients) client.socket.close();
    await new Promise<void>((resolveClose) =>
      this.wss ? this.wss.close(() => resolveClose()) : resolveClose(),
    );
    this.store.close();
  }

  // -- config ---------------------------------------------------------------

  async reloadConfig(): Promise<void> {
    if (!existsSync(this.configPath)) {
      this.configState = { status: "missing", path: this.configPath };
      this.composed = undefined;
    } else {
      try {
        const loaded = await loadConfig(this.configPath, this.options.loadModule);
        this.composed = loaded.composed;
        this.configState = {
          status: "valid",
          summary: summarizeConfig(loaded),
          seeded: this.seeded,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.configState = {
          status: "invalid",
          path: this.configPath,
          errors: [message],
        };
        // Live sessions keep their previously composed config (CORE-2);
        // only new session creation is blocked.
        this.composed = undefined;
      }
    }
    this.broadcast({ type: "config.state", state: this.configState });
    this.broadcast({ type: "readiness.state", profiles: this.readiness() });
  }

  private watchConfigFile(): void {
    const dir = dirname(this.configPath);
    const file = basename(this.configPath);
    if (!existsSync(dir)) return;
    this.watcher = watch(dir, (_eventType, filename) => {
      if (filename && filename !== file) return;
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        void this.reloadConfig();
      }, 150);
    });
  }

  readiness(): ReadinessEntry[] {
    if (this.configState.status !== "valid") return [];
    const summary = this.configState.summary;
    const entries: ReadinessEntry[] = summary.profiles.map((profile) => {
      const readiness = checkAdapterReadiness(
        profile.adapter,
        this.env,
        this.home,
      );
      return {
        profileId: profile.id,
        adapter: profile.adapter,
        ready: readiness.ready,
        ...(readiness.requirement
          ? { requirement: readiness.requirement }
          : {}),
      };
    });
    // Adapter shorthands referenced directly (the captain ref or a
    // playbook player ref, e.g. a fresh install's "claude") get their
    // own entry, so a not-ready adapter warns before the first turn
    // fails cold. Shorthand = a non-profile ref naming a known adapter,
    // the same rule launcher-parity resolveAgent applies.
    const profileIds = new Set(summary.profiles.map((profile) => profile.id));
    const shorthands = new Set<AdapterName>();
    const collect = (ref: string): void => {
      if (!profileIds.has(ref) && isKnownAdapter(ref)) shorthands.add(ref);
    };
    collect(summary.captain);
    for (const playbook of summary.playbooks) {
      for (const player of Object.values(playbook.players)) {
        collect(player.ref);
      }
    }
    for (const shorthand of shorthands) {
      const readiness = checkAdapterReadiness(shorthand, this.env, this.home);
      entries.push({
        profileId: shorthand,
        adapter: shorthand,
        ready: readiness.ready,
        ...(readiness.requirement
          ? { requirement: readiness.requirement }
          : {}),
      });
    }
    return entries;
  }

  // -- websocket ------------------------------------------------------------

  /** The handshake token clients must present (?token=). */
  token(): string {
    return this.authToken;
  }

  private async listen(port: number): Promise<void> {
    this.wss = new WebSocketServer({
      host: "127.0.0.1",
      port,
      verifyClient: (info: { origin?: string; req: { url?: string } }) => {
        // Reject foreign browser origins outright: only the packaged
        // file:// renderer (origin "file://" or "null") and
        // non-browser clients (no Origin header) may connect.
        const origin = info.origin;
        if (
          origin &&
          origin !== "null" &&
          !origin.startsWith("file://") &&
          !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          return false;
        }
        const query = new URL(
          info.req.url ?? "/",
          "ws://127.0.0.1",
        ).searchParams;
        return query.get("token") === this.authToken;
      },
    });
    this.wss.on("connection", (socket) => {
      const client: ClientState = { socket, channels: new Set() };
      this.clients.add(client);
      socket.on("close", () => this.clients.delete(client));
      socket.on("message", (data) => {
        void this.handleMessage(client, String(data));
      });
      this.send(socket, {
        type: "hello",
        protocolVersion: PROTOCOL_VERSION,
        coreVersion: CORE_VERSION,
      });
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      this.wss?.once("listening", resolveListen);
      this.wss?.once("error", rejectListen);
    });
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients) this.send(client.socket, message);
  }

  private dispatchRecord(envelope: RecordEnvelope): void {
    const channel = envelope.hidden ? "debug" : "session";
    const key = `${channel}:${envelope.sessionId}`;
    for (const client of this.clients) {
      if (client.channels.has(key)) {
        this.send(client.socket, {
          type: "record",
          channel,
          sessionId: envelope.sessionId,
          seq: envelope.seq,
          record: envelope.record,
        });
      }
    }
  }

  private async handleMessage(client: ClientState, raw: string): Promise<void> {
    const parsed = parseCommand(raw);
    if (!parsed.ok) {
      this.send(client.socket, {
        type: "reply",
        id: parsed.id ?? "",
        ok: false,
        error: { code: "invalid_message", message: parsed.error },
      });
      return;
    }
    const command = parsed.command;
    try {
      const result = await this.execute(client, command);
      this.send(client.socket, {
        type: "reply",
        id: command.id,
        ok: true,
        result,
      });
    } catch (error) {
      const code: ErrorCode =
        error instanceof CoreError ? error.code : "internal";
      const message = error instanceof Error ? error.message : String(error);
      this.send(client.socket, {
        type: "reply",
        id: command.id,
        ok: false,
        error: { code, message },
      });
    }
  }

  private async execute(
    client: ClientState,
    command: Command,
  ): Promise<unknown> {
    switch (command.type) {
      case "config.get":
        return this.configState;
      case "readiness.get":
        return this.readiness();
      case "project.list":
        return this.store.listProjects();
      case "project.register": {
        const path = expandPath(command.path, this.home);
        if (!existsSync(path) || !statSync(path).isDirectory()) {
          throw new CoreError(
            "invalid_request",
            `${path} is not a directory`,
          );
        }
        if (!(await isWorkTreeRoot(path, this.runCommand))) {
          throw new CoreError(
            "invalid_request",
            `${path} is not the root of a git work tree (run git init first, or use project.create)`,
          );
        }
        return this.store.registerProject(path, basename(path), Date.now());
      }
      case "project.create": {
        const path = expandPath(command.path, this.home);
        if (this.store.getProjectByPath(path)) {
          throw new CoreError("conflict", `${path} is already registered`);
        }
        try {
          await createProjectRepo({
            path,
            scaffold: command.scaffold,
            run: this.runCommand,
            ...(this.options.scaffoldCommand
              ? { scaffoldCommand: this.options.scaffoldCommand }
              : {}),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new CoreError("invalid_request", message);
        }
        return this.store.registerProject(path, basename(path), Date.now());
      }
      case "project.status": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw new CoreError("not_found", `no project ${command.projectId}`);
        }
        return repoStatus(project.path, this.runCommand);
      }
      case "forge.items": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw new CoreError("not_found", `no project ${command.projectId}`);
        }
        const cached = this.forgeCache.get(project.id);
        if (
          !command.refresh &&
          cached &&
          Date.now() - cached.at < FORGE_CACHE_MS
        ) {
          return cached.state;
        }
        const status = await repoStatus(project.path, this.runCommand);
        const state = await this.forge.state(project.path, status.originUrl);
        this.forgeCache.set(project.id, { at: Date.now(), state });
        return state;
      }
      case "project.remove": {
        if (!this.store.removeProject(command.projectId)) {
          throw new CoreError("not_found", `no project ${command.projectId}`);
        }
        return null;
      }
      case "session.list":
        return this.sessions.listSessions();
      case "session.create": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw new CoreError("not_found", `no project ${command.projectId}`);
        }
        if (this.configState.status !== "valid" || !this.composed) {
          throw new CoreError(
            "invalid_config",
            this.configState.status === "invalid"
              ? `config is invalid: ${this.configState.errors.join("; ")}`
              : "config file is missing",
          );
        }
        return this.sessions.createSession(project, this.composed);
      }
      case "session.dispose":
        await this.sessions.disposeSession(command.sessionId);
        return null;
      case "turn.submit":
        this.sessions.submitTurn(command.sessionId, command.text);
        return { accepted: true };
      case "turn.abort":
        return { aborted: this.sessions.abortTurn(command.sessionId) };
      case "subscribe": {
        this.requireKnownSession(command.channel.sessionId);
        client.channels.add(channelKey(command.channel));
        return null;
      }
      case "unsubscribe":
        client.channels.delete(channelKey(command.channel));
        return null;
      case "history.get":
        this.requireKnownSession(command.sessionId);
        return {
          records: this.store.getRecords(command.sessionId, {
            afterSeq: command.afterSeq,
          }),
        };
      case "usage.get":
        this.requireKnownSession(command.sessionId);
        return this.store.sessionUsage(command.sessionId);
      case "usage.days":
        return this.store.usageByDay();
      case "config.edit": {
        if (!existsSync(this.configPath)) {
          throw new CoreError("invalid_config", "config file is missing");
        }
        const op = command.op as ConfigEditOp;
        if (op.kind === "profile.delete") {
          const references = profileReferences(
            readFileSync(this.configPath, "utf8"),
            op.id,
          );
          if (references.length > 0) {
            throw new CoreError(
              "conflict",
              `profile "${op.id}" is referenced by ${references.join(", ")}`,
            );
          }
        }
        const result = await editConfigFile(
          this.configPath,
          op,
          this.options.loadModule,
        );
        if (!result.ok) {
          throw new CoreError(
            "invalid_config",
            result.error ?? "edit rejected",
          );
        }
        await this.reloadConfig();
        return this.configState;
      }
      case "compile.check":
        return checkToolchain(this.env, this.options.compileSpawner);
      case "playbook.artifacts": {
        if (this.configState.status !== "valid" || !this.composed) {
          throw new CoreError("invalid_config", "config is not valid");
        }
        const playbook = this.composed.playbooks.find(
          (entry) => entry.id === command.playbookId,
        );
        if (!playbook) {
          throw new CoreError(
            "not_found",
            `no configured playbook ${command.playbookId}`,
          );
        }
        return resolveArtifacts(
          { id: playbook.id, from: playbook.from },
          this.env,
        );
      }
      case "compile.run": {
        if (!existsSync(this.configPath)) {
          throw new CoreError("invalid_config", "config file is missing");
        }
        // One compile per playbook id, fail-closed (DR-010 §5): a
        // duplicate submission is rejected, never queued or merged.
        if (this.activeCompiles.has(command.playbookId)) {
          throw new CoreError(
            "busy",
            `a compile is already running for ${command.playbookId}`,
          );
        }
        const controller = new AbortController();
        this.activeCompiles.set(command.playbookId, controller);
        try {
          const libraryDir =
            this.options.libraryDir ??
            join(
              this.env.XDG_DATA_HOME || join(this.home, ".local", "share"),
              "spex",
              "playbooks",
            );
          let result;
          try {
            result = await compilePlaybook({
              playbookId: command.playbookId,
              source: {
                ...(command.sourceText !== undefined
                  ? { text: command.sourceText }
                  : {}),
                ...(command.sourcePath ? { path: command.sourcePath } : {}),
              },
              roles: command.roles,
              command: command.command,
              intent: command.intent,
              libraryDir,
              env: this.env,
              signal: controller.signal,
              ...(this.options.compileSpawner
                ? { spawner: this.options.compileSpawner }
                : {}),
              onProgress: (line) => {
                // After an abort the ◇ canceled line (sent by the
                // compile.abort handler) stays the last progress output.
                if (controller.signal.aborted) return;
                this.broadcast({
                  type: "compile.progress",
                  playbookId: command.playbookId,
                  line,
                });
              },
            });
          } catch (error) {
            if (controller.signal.aborted) {
              throw new CoreError("aborted", "compile canceled");
            }
            const message =
              error instanceof Error ? error.message : String(error);
            throw new CoreError("invalid_request", message);
          }
          // The compiled entry's derived roles are authoritative
          // (DR-014): re-key the request's role -> profile assignments
          // onto them case-insensitively; an unmatched role fails
          // before any config write, keeping the artifacts for a
          // re-registration without recompiling.
          const assignments = new Map(
            Object.entries(command.players).map(([role, ref]) => [
              role.toLowerCase(),
              ref,
            ]),
          );
          const players: Record<string, string> = {};
          const unmatched: string[] = [];
          for (const role of result.roles) {
            const ref = assignments.get(role);
            if (ref === undefined) unmatched.push(role);
            else players[role] = ref;
          }
          if (unmatched.length > 0) {
            throw new CoreError(
              "invalid_request",
              `compiled, but the playbook's derived roles are [${result.roles.join(", ")}] and no profile was assigned for: ${unmatched.join(", ")}. Re-submit with players for the derived roles; the compiled artifacts are kept.`,
            );
          }
          const edit = await editConfigFile(
            this.configPath,
            {
              kind: "playbook.add",
              playbookId: command.playbookId,
              from: result.from,
              players,
            },
            this.options.loadModule,
          );
          if (!edit.ok) {
            throw new CoreError(
              "invalid_config",
              `compiled, but registration was refused: ${edit.error}`,
            );
          }
          await this.reloadConfig();
          return this.configState;
        } finally {
          this.activeCompiles.delete(command.playbookId);
        }
      }
      case "compile.abort": {
        const controller = this.activeCompiles.get(command.playbookId);
        if (!controller) {
          throw new CoreError(
            "not_found",
            `no compile is running for ${command.playbookId}`,
          );
        }
        controller.abort();
        this.broadcast({
          type: "compile.progress",
          playbookId: command.playbookId,
          line: "◇ compile canceled",
        });
        return null;
      }
      case "specs.get": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw new CoreError("not_found", `no project ${command.projectId}`);
        }
        return parseSpecTree(project.path);
      }
      case "specs.read": {
        const project = this.store.getProject(command.projectId);
        if (!project) {
          throw new CoreError("not_found", `no project ${command.projectId}`);
        }
        const resolved = resolveSpecPath(project.path, command.path);
        if (!resolved.ok) throw new CoreError(resolved.code, resolved.message);
        return { markdown: readFileSync(resolved.path, "utf8") };
      }
    }
  }

  private requireKnownSession(sessionId: string): void {
    const known = this.store
      .listSessions()
      .some((session) => session.id === sessionId);
    if (!known) throw new CoreError("not_found", `no session ${sessionId}`);
  }
}

export const createCoreService = CoreService.start;

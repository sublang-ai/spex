// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The journey harness (DR-039): every test boots the real server shell
// on a scratch root — scratch config, scratch state, scratch home —
// with the core's agent seams substituted (server-shell-20), and opens
// the shell's token URL in the browser. The live lane keeps the
// machine's agents and sign-in, redirecting only the state it writes.

import { test as base, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

import type {
  AgentOptions,
  Command,
  CommandResults,
  ServerMessage,
  SpaceState,
} from "@sublang/spex-core";
import {
  DEMO_CONFIG,
  demoAdapterImports,
  demoCaptain,
  seedDemoHistory,
  seedDemoProject,
  seedHistorySession,
  appendHistorySession,
  interruptDemoSession,
  fakeAdapterImports,
  prepareStorageGitFiles,
} from "@sublang/spex-core/testing";
import {
  startServer,
  type RunningServer,
  type ServerShellOptions,
} from "spex-server/dist/server.js";

export { expect };

/** The live lane: the machine's real adapters and Captain (DR-020). */
export const LIVE = process.env.SPEX_E2E_LIVE === "1";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const uiDist = join(repoRoot, "apps", "server", "ui-dist");

export interface AppOptions {
  /**
   * `demo` writes the two-player demo config before boot; `none`
   * leaves the path empty so the core seeds its installed template —
   * the true first run.
   */
  config?: "demo" | "none";
  /** Seed and register the demo project before the browser opens. */
  project?: boolean;
  /** With `project`: this many intents already worked and closed
   * done, written into the state root before boot — a History longer
   * than one intent page with nothing run. */
  history?: number;
  /** The core's environment; readiness derives from it. */
  env?: NodeJS.ProcessEnv;
  /** Serve the Sources band from a substitute forge adapter instead
   * of `gh`: open issues and a pull request carrying ordinary GitHub
   * labels, so a labelled row can be measured hermetically. */
  forge?: boolean;
  /**
   * How long each fake player call stays in flight; long enough to
   * act during a turn, short enough to keep the journey quick.
   */
  agentDelayMs?: number;
  /** Keep the real Captain journal/recovery; substitute only provider replies. */
  realCaptain?: boolean;
  /** The scripted root reports typed success, enabling intent advancement. */
  governedCompletion?: boolean;
  /** Substitute task-free model discovery; never start installed providers. */
  discoverAgentModels?: NonNullable<ServerShellOptions["core"]>["discoverAgentModels"];
  /**
   * Write the configuration inside the Spex home, at
   * `<dataDir>/playbook/playbook.config.yaml`, where the Space
   * surface shares it (DR-057); the scratch default lies outside the
   * home and reads "outside the space". Implied by `remote`.
   */
  homeConfig?: boolean;
  /**
   * A Git remote for the Space journeys (space-36, space-40 … space-44): `bare`
   * creates a bare repository in the scratch root, exposed as
   * `app.remotePath`, and leaves the home a plain directory; `peer`
   * also initializes the home (with `project`, one titled session run
   * through the core), pushes it, then clones the remote as a peer
   * home that pushes a differing configuration, the same session
   * changed and one queued intent — and changes the same session and
   * Settings on this device too, so the next sync asks two choices;
   * `seeded` leaves the home a plain directory while a peer home
   * pushes a differing configuration, a titled session of the demo
   * project and one queued intent, so Join a space asks one choice.
   * Each sets the core's Git environment: an isolated Git
   * configuration with no identity, and a sleeping `GIT_SSH_COMMAND`
   * for `app.sleepingRemote()`.
   */
  remote?: "bare" | "peer" | "seeded";
}

/** Deliberately omits the demo's current model, exercising retained custom IDs. */
function fixtureModelDiscovery(adapter: AgentOptions["adapter"]): AgentOptions["discovery"] {
  return {
    status: "available",
    ...(adapter === "claude" ? { unreportedEffortValues: ["ultracode"] } : {}),
    models: adapter === "claude" ? [{
      id: "claude-fable-5-1", name: "Claude Fable 5.1",
      effortValues: ["high", "max"], fastModeSupported: false,
    }] : adapter === "codex" ? [{
      id: "gpt-6-astra", name: "GPT-6 Astra",
      effortValues: ["high", "max"], fastModeSupported: true,
    }] : [],
  };
}

/** The substitute forge's data (dashboard-49): the labels are the
 * ordinary GitHub words a real repository carries. */
const FORGE_FIXTURE = {
  adapter: "github" as const,
  authenticated: true,
  repo: "sublang/demo-project",
  issues: [
    {
      number: 7,
      title: "Token refresh drops the session after ninety seconds",
      url: "https://github.com/sublang/demo-project/issues/7",
      labels: ["documentation", "help wanted", "auth"],
    },
    {
      number: 9,
      title: "The README badge is stale",
      url: "https://github.com/sublang/demo-project/issues/9",
      labels: ["good first issue"],
    },
  ],
  prs: [
    {
      number: 11,
      title: "Tighten the expiry tests",
      url: "https://github.com/sublang/demo-project/pull/11",
      labels: ["dependencies"],
    },
  ],
};

// ---------------------------------------------------------------------------
// A protocol client for arranging state (never for asserting the UI)
// ---------------------------------------------------------------------------

export class CoreClient {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on("message", (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) return resolve();
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
    await this.waitFor((m) => m.type === "hello");
  }

  close(): void {
    this.socket.close();
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<CommandResults[T]> {
    const id = `e2e${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor((m) => m.type === "reply" && m.id === id);
    if (reply.type !== "reply") throw new Error("unreachable");
    if (!reply.ok) {
      throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    }
    return reply.result as CommandResults[T];
  }

  async waitFor(
    check: (message: ServerMessage) => boolean,
    timeoutMs = 15_000,
  ): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.find(check);
      if (found) return found;
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `timeout; got ${JSON.stringify(this.messages.map((m) => m.type))}`,
        );
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  /** How many messages have arrived — a mark for `waitSpace`. */
  mark(): number {
    return this.messages.length;
  }

  /** The first `space.state` at or after `from` that `check` accepts. */
  async waitSpace(
    from: number,
    check: (state: SpaceState) => boolean,
    timeoutMs = 30_000,
  ): Promise<SpaceState> {
    const start = Date.now();
    for (;;) {
      for (let i = from; i < this.messages.length; i += 1) {
        const message = this.messages[i];
        if (message.type === "space.state" && check(message.state)) return message.state;
      }
      if (Date.now() - start > timeoutMs) {
        const seen = this.messages
          .slice(from)
          .filter((m) => m.type === "space.state")
          .map((m) => (m.type === "space.state" ? JSON.stringify(m.state.sync) : ""));
        throw new Error(`timeout waiting for space state; saw ${seen.join(" | ")}`);
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}

// ---------------------------------------------------------------------------
// Git for the Space journeys: the test's own, isolated from the machine
// ---------------------------------------------------------------------------

/** The journey's Git: an isolated configuration and a fixed identity,
 * for the bare remote and the peer home (never the core's). */
const peerGitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Peer",
  GIT_AUTHOR_EMAIL: "peer@example.test",
  GIT_COMMITTER_NAME: "Peer",
  GIT_COMMITTER_EMAIL: "peer@example.test",
  LC_ALL: "C",
};

/** Run Git in a directory and return its trimmed output. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    env: peerGitEnv,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** The peer's differing configuration: the demo config with another
 * Captain model, so Settings is one whole-file choice (space-17). */
export const PEER_CONFIG = DEMO_CONFIG.replace(
  "captain:\n  adapter: claude\n  model: claude-opus-5",
  "captain:\n  adapter: claude\n  model: claude-opus-5-peer",
);
/** The model this device sets before the daily sync, so Settings
 * differs on both sides. */
export const LOCAL_MODEL = "claude-opus-5-local";
/** The peer's prompt in the shared session (space-41). */
export const PEER_TURN = "Tighten the expiry tests";
/** This device's own prompt in the shared session. */
export const LOCAL_TURN = "Add the expiry test";
/** The shared session's title: its first turn. */
export const SESSION_TITLE = "Fix the login redirect";
/** The peer's own session in a seeded remote (space-36). */
export const PEER_SESSION_TITLE = "Plan the release on the other laptop";

// ---------------------------------------------------------------------------
// The app under test
// ---------------------------------------------------------------------------

export interface App {
  /** The one access URL: origin plus token. */
  url: string;
  origin: string;
  token: string;
  /** Scratch home (hermetic) — readiness and `~` resolve here. */
  home: string;
  dataDir: string;
  configPath: string;
  /** The demo project's path — registered when `project` was asked. */
  projectDir: string;
  projectId?: string;
  /** The shared session store the playbook CLI would write into —
   * scratch in both lanes, so a terminal-run fixture lands where the
   * core serves it (core-service-60). */
  sharedSessionsDir: string;
  server: RunningServer;
  /** Arrange-only protocol client on the running shell. */
  core: CoreClient;
  /** The bare repository standing in for `origin` (with `remote`). */
  remotePath?: string;
  /** The peer home's working copy (with `remote: "peer"`). */
  peerDir?: string;
  /** The session both homes changed (with `remote: "peer"`). */
  sessionId?: string;
  /** Run a long Space command and wait until the machine leaves
   * `running`, returning the state it settled in (arrange only). */
  settleSpace<T extends "space.sync" | "space.fetch">(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<SpaceState>;
  /** The peer changes its working copy and pushes to `origin` as
   * plain Git — the remote "moved" (with `remote`). */
  peerPush(mutate: (dir: string) => void | Promise<void>): Promise<string>;
  /**
   * The remote's `main` moves under the next `times` pushes: a
   * `pre-receive` hook on the bare repository commits a peer note on
   * `main` and declines each of those pushes as not fast-forward, so a
   * sync meets a remote that changed after its check — once for the
   * automatic re-check, twice for "The remote changed again".
   */
  rejectPushes(times: number): void;
  /** An `ssh://` remote whose transport never answers: the core's
   * `GIT_SSH_COMMAND` is a sleeping script, so a check against this
   * URL hangs until Stop or the transport limit (space-16). */
  sleepingRemote(): string;
  /** Stop the shell, keeping the root; `start` boots it again on the
   * same port so an open page's origin still reaches it. */
  stop(): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
  readConfig(): string;
}

async function boot(
  options: ServerShellOptions,
): Promise<{ server: RunningServer; core: CoreClient }> {
  const server = await startServer(options);
  const core = new CoreClient(
    server.url.replace(/^http/, "ws"),
  );
  await core.open();
  return { server, core };
}

export async function startApp(options: AppOptions = {}): Promise<App> {
  const scratch = mkdtempSync(join(tmpdir(), "spex-e2e-"));
  const home = join(scratch, "home");
  mkdirSync(home, { recursive: true });
  const dataDir = join(scratch, "state");
  const projectDir = join(scratch, "demo-project");
  if (options.project) seedDemoProject(projectDir);
  const homeConfig = options.homeConfig || options.remote !== undefined;
  const configPath = homeConfig
    ? join(dataDir, "playbook", "playbook.config.yaml")
    : join(scratch, "config", "playbook.config.yaml");
  mkdirSync(dirname(configPath), { recursive: true });
  if ((options.config ?? "demo") === "demo") {
    writeFileSync(configPath, DEMO_CONFIG);
  }
  if (options.project && options.history) {
    await seedDemoHistory(dataDir, projectDir, options.history);
  }
  const token = `e2e-${Math.random().toString(36).slice(2, 10)}`;
  // Both hosts use this explicit isolated Spex home.
  const sharedSessionsDir = join(dataDir, "sessions");
  mkdirSync(sharedSessionsDir, { recursive: true, mode: 0o700 });

  // The Space journeys' Git environment (space-32, space-37): Git found
  // on the PATH, configured only through this environment — no identity,
  // so the committer fallback engages — and an ssh transport that sleeps,
  // for `sleepingRemote()`; file-path remotes never reach it.
  const sleeper = join(scratch, "sleep-ssh.sh");
  let remotePath: string | undefined;
  if (options.remote) {
    writeFileSync(sleeper, "#!/bin/sh\nexec sleep 300\n");
    chmodSync(sleeper, 0o755);
    remotePath = join(scratch, "remote.git");
    git(scratch, "init", "-q", "--bare", "-b", "main", remotePath);
  }
  const env = options.env ?? {
    ANTHROPIC_API_KEY: "e2e-fake",
    OPENAI_API_KEY: "e2e-fake",
    SPEX_HOME: dataDir,
    ...(options.remote
      ? {
          PATH: process.env.PATH ?? "",
          HOME: home,
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_SSH_COMMAND: sleeper,
        }
      : {}),
  };
  const shellOptions: ServerShellOptions = {
    host: "127.0.0.1",
    port: 0,
    token,
    configPath,
    dataDir,
    legacyDb: join(scratch, "no-legacy.db"),
    insecure: false,
    uiDist,
    core: LIVE
      ? {
          // Real adapters and Captain; only what the run writes is
          // redirected, so the machine's own sessions stay untouched.
          env: { ...process.env, SPEX_HOME: dataDir },
        }
      : {
          adapterImports: options.realCaptain
            ? fakeAdapterImports({ fallback: { result: JSON.stringify({ action: "respond", text: "Acknowledged by the real Captain." }) } }).imports
            : demoAdapterImports({ delayMs: options.agentDelayMs ?? 400 }).imports,
          adapterRuntime: () => ({ usable: true }),
          discoverAgentModels: options.discoverAgentModels ?? (async (adapter) => fixtureModelDiscovery(adapter)),
          ...(options.realCaptain ? {} : { captainFactory: async (_composed: unknown, sessionId: string) => demoCaptain(sessionId, { governedCompletion: options.governedCompletion }) }),
          env,
          home,
          ...(options.forge
            ? { forgeAdapter: { state: async () => FORGE_FIXTURE } }
            : {}),
        },
  };

  let running: { server: RunningServer; core: CoreClient } | undefined =
    await boot(shellOptions);
  const live = () => {
    if (!running) throw new Error("the shell is stopped");
    return running;
  };
  const app: App = {
    get url() {
      return live().server.url;
    },
    get origin() {
      return new URL(live().server.url).origin;
    },
    token,
    home,
    dataDir,
    configPath,
    projectDir,
    sharedSessionsDir,
    get server() {
      return live().server;
    },
    get core() {
      return live().core;
    },
    remotePath,
    async settleSpace(type, fields) {
      const core = live().core;
      const from = core.mark();
      await core.command(type, fields);
      return core.waitSpace(from, (state) => state.sync.phase !== "running");
    },
    async peerPush(mutate) {
      const dir = app.peerDir ?? clonePeer(app);
      git(dir, "fetch", "-q", "origin");
      git(dir, "reset", "-q", "--hard", "origin/main");
      await mutate(dir);
      git(dir, "add", "-A", "--", ".");
      git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "peer change");
      git(dir, "push", "-q", "origin", "HEAD:main");
      return git(dir, "rev-parse", "HEAD");
    },
    rejectPushes(times) {
      if (!remotePath) throw new Error("rejectPushes needs a remote");
      const counter = join(scratch, "rejected-pushes");
      writeFileSync(counter, "0\n");
      const hook = join(remotePath, "hooks", "pre-receive");
      // The hook runs inside the bare repository during the core's
      // push, before any ref moves: it advances main by one real peer
      // commit — a note file over the current tree, written outside
      // the push's quarantine — and declines the push as the remote
      // would have, had the peer pushed first.
      writeFileSync(
        hook,
        [
          "#!/bin/sh",
          "unset GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_INDEX_FILE",
          'export GIT_DIR="$(pwd)"',
          `count=$(cat "${counter}")`,
          "count=$((count + 1))",
          `echo "$count" > "${counter}"`,
          `if [ "$count" -le ${times} ]; then`,
          `  export GIT_INDEX_FILE="${scratch}/peer-index-$count"`,
          "  git read-tree main",
          '  blob=$(printf "peer note %s\\n" "$count" | git hash-object -w --stdin)',
          '  git update-index --add --cacheinfo 100644 "$blob" "peer-note-$count.txt"',
          "  tree=$(git write-tree)",
          '  commit=$(git -c user.name=Peer -c user.email=peer@example.test commit-tree "$tree" -p main -m "peer moved $count")',
          '  git update-ref refs/heads/main "$commit"',
          '  echo "the peer pushed first: non-fast-forward, fetch first" >&2',
          "  exit 1",
          "fi",
          "exit 0",
          "",
        ].join("\n"),
      );
      chmodSync(hook, 0o755);
    },
    sleepingRemote() {
      if (!remotePath) throw new Error("sleepingRemote needs a remote");
      return "ssh://sleepy.invalid/space.git";
    },
    async stop() {
      if (!running) return;
      const port = running.server.port;
      running.core.close();
      await running.server.close();
      running = undefined;
      shellOptions.port = port;
    },
    async start() {
      if (running) return;
      running = await boot(shellOptions);
    },
    async close() {
      await app.stop();
      rmSync(scratch, { recursive: true, force: true });
    },
    readConfig() {
      return existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
    },
  };
  if (options.project) {
    const info = await app.core.command("project.register", { path: projectDir });
    app.projectId = info.id;
  }
  if (options.remote === "peer") await arrangePeer(app);
  else if (options.remote === "seeded") await seedRemote(app);
  return app;
}

/** Clone the bare remote as the peer's working copy. */
function clonePeer(app: App): string {
  if (!app.remotePath) throw new Error("the peer needs a remote");
  const dir = join(dirname(app.dataDir), "peer");
  git(dirname(app.dataDir), "clone", "-q", app.remotePath, dir);
  app.peerDir = dir;
  return dir;
}

/** Run one turn through the core and wait for the runtime's release. */
export async function runTurn(app: App, sessionId: string, text: string): Promise<void> {
  const before =
    (await app.core.command("session.list", {})).find((s) => s.id === sessionId)?.turns ?? 0;
  await app.core.command("turn.submit", { sessionId, text });
  await app.core.waitFor(
    (m) =>
      m.type === "session.state" &&
      m.session.id === sessionId &&
      !m.session.live &&
      m.session.turns > before,
    30_000,
  );
}

/**
 * The two-laptop arrangement (space-41, space-43, space-44): this home
 * initialized and pushed with one titled session; the peer pushing a
 * differing configuration, a second turn in that session and one
 * queued intent; this device then running its own second turn and
 * changing Settings — two conflicts and one incoming queue.
 */
async function arrangePeer(app: App): Promise<void> {
  if (!app.projectId || !app.remotePath) {
    throw new Error("remote: \"peer\" needs project: true");
  }
  const projectId = app.projectId;
  const session = await app.core.command("session.create", { projectId });
  app.sessionId = session.id;
  await runTurn(app, session.id, SESSION_TITLE);
  await app.core.command("space.init", {});
  await app.core.command("space.remote.set", { url: app.remotePath });
  const pushed = await app.settleSpace("space.sync", {});
  if (pushed.sync.phase !== "done") {
    throw new Error(`the first push ended ${JSON.stringify(pushed.sync)}`);
  }
  await app.peerPush(async (dir) => {
    writeFileSync(join(dir, "playbook", "playbook.config.yaml"), PEER_CONFIG);
    await appendHistorySession(join(dir, "sessions"), session.id, [
      { type: "turn_started", turnId: 2, turn: { id: 2, prompt: PEER_TURN }, timestamp: Date.now() },
      { type: "captain_reply", turnId: 2, timestamp: Date.now() + 1, text: "Done on the other laptop." },
      { type: "turn_finished", turnId: 2, timestamp: Date.now() + 2 },
    ]);
    mkdirSync(join(dir, "intents"), { recursive: true });
    const act = {
      v: 1,
      act: "queue",
      intent: { id: randomUUID(), projectId, text: "Queued on the other laptop", rank: "a", createdAt: Date.now() },
    };
    writeFileSync(join(dir, "intents", `${projectId}.jsonl`), `${JSON.stringify(act)}\n`);
  });
  await runTurn(app, session.id, LOCAL_TURN);
  await app.core.command("config.edit", {
    op: { kind: "captain.set", patch: { model: LOCAL_MODEL } },
  });
}

/**
 * The second device's arrangement (space-36): the remote already holds
 * a peer's space — a differing configuration, a titled session of the
 * demo project and one queued intent, under the managed rules — while
 * this home stays a plain directory with its own configuration, so a
 * Join a space asks exactly one choice, Settings.
 */
async function seedRemote(app: App): Promise<void> {
  if (!app.projectId || !app.remotePath) {
    throw new Error("remote: \"seeded\" needs project: true");
  }
  const projectId = app.projectId;
  const dir = clonePeer(app);
  mkdirSync(join(dir, "playbook"), { recursive: true });
  writeFileSync(join(dir, "playbook", "playbook.config.yaml"), PEER_CONFIG);
  prepareStorageGitFiles(dir);
  app.sessionId = await seedHistorySession(join(dir, "sessions"), app.projectDir, [
    { type: "turn_started", turnId: 1, turn: { id: 1, prompt: PEER_SESSION_TITLE }, timestamp: Date.now() },
    { type: "captain_reply", turnId: 1, timestamp: Date.now() + 1, text: "Planned on the other laptop." },
    { type: "turn_finished", turnId: 1, timestamp: Date.now() + 2 },
  ]);
  mkdirSync(join(dir, "intents"), { recursive: true });
  const act = {
    v: 1,
    act: "queue",
    intent: { id: randomUUID(), projectId, text: "Queued on the other laptop", rank: "a", createdAt: Date.now() },
  };
  writeFileSync(join(dir, "intents", `${projectId}.jsonl`), `${JSON.stringify(act)}\n`);
  git(dir, "add", "-A", "--", ".");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "peer space");
  git(dir, "push", "-q", "-u", "origin", "HEAD:main");
}

/**
 * A session the playbook CLI would have written into the shared store
 * (core-service-60): its captain-session record naming the demo
 * project as the working directory and a replay stream holding one
 * Boss turn. The core adopts it as a terminal-run session, served and
 * deletable (DR-042). Returns the session id.
 */
export async function writeTerminalSession(
  app: App,
  options: { id?: string; prompt?: string } = {},
): Promise<string> {
  const prompt = options.prompt ?? "from the terminal";
  return seedHistorySession(app.sharedSessionsDir, app.projectDir, [
    { type: "turn_started", turnId: 1, turn: { id: 1, prompt }, timestamp: 1000 },
    { type: "captain_reply", turnId: 1, timestamp: 1500, text: "Done from the terminal." },
    { type: "turn_finished", turnId: 1, timestamp: 2000 },
  ], options.id);
}

/** Simulate the durable interruption boundary with every local writer stopped. */
export async function interruptSession(app: App, sessionId: string, input: string): Promise<void> {
  await app.stop();
  await interruptDemoSession(app.sharedSessionsDir, sessionId, input);
  await app.start();
}

// ---------------------------------------------------------------------------
// Fixtures and page helpers
// ---------------------------------------------------------------------------

export const test = base.extend<{ app: App; appOptions: AppOptions }>({
  appOptions: [{}, { option: true }],
  app: async ({ appOptions }, use) => {
    const app = await startApp(appOptions);
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
});

/** Open the app at its token URL and wait for the shell to draw. */
export async function open(page: Page, app: App, path = ""): Promise<void> {
  if (process.env.SPEX_E2E_DEBUG) {
    const tag = `[${app.origin}]`;
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      const stamp = () => performance.now().toFixed(0);
      window.WebSocket = new Proxy(Native, {
        construct(target, args: [string, ...unknown[]]) {
          console.log(`[ws ctor ${stamp()}] ${args[0]}`);
          const socket = new target(...(args as [string]));
          socket.addEventListener("open", () =>
            console.log(`[ws opened ${stamp()}] ${args[0]}`),
          );
          socket.addEventListener("close", (event) =>
            console.log(
              `[ws closed ${stamp()}] ${args[0]} code=${event.code} reason=${event.reason}`,
            ),
          );
          const bag = window as unknown as { __sockets?: unknown[] };
          bag.__sockets ??= [];
          bag.__sockets.push(socket);
          return socket;
        },
      });
      // Log the connection banner's comings and goings against the
      // sockets' ready states, so a status flap shows its cause.
      let shown = false;
      const check = () => {
        const now = !!document.body && document.body.innerText.includes("actions are paused");
        if (now !== shown) {
          shown = now;
          const states = (
            (window as unknown as { __sockets?: { readyState: number }[] })
              .__sockets ?? []
          )
            .map((s) => s.readyState)
            .join(",");
          console.log(`[banner ${stamp()}] ${now ? "shown" : "hidden"} sockets=${states}`);
        }
      };
      new MutationObserver(check).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    page.on("console", (m) => console.log(tag, "console", m.type(), m.text()));
    page.on("websocket", (ws) => {
      console.log(tag, "ws open", ws.url());
      ws.on("close", () => console.log(tag, "ws close", ws.url()));
      ws.on("socketerror", (e) => console.log(tag, "ws error", e));
      ws.on("framesent", (f) => console.log(tag, "->", String(f.payload).slice(0, 120)));
      ws.on("framereceived", (f) =>
        console.log(tag, `<- @${Date.now() % 100000}`, String(f.payload).slice(0, 120)),
      );
    });
  }
  await page.goto(`${app.origin}/${path}?token=${encodeURIComponent(app.token)}`);
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
}

/** The sidebar entry for a surface. */
export function nav(
  page: Page,
  name: "Dashboard" | "Projects" | "Playbooks" | "Space" | "Settings",
) {
  return page.getByRole("button", { name, exact: true });
}

/** The Boss composer on the Captain home or in a session (the test
 * ids sit on the textareas themselves). */
export function composer(page: Page) {
  return page.getByTestId("start-composer").or(page.getByTestId("boss-composer"));
}

/** Send composer text and return once the send was accepted. */
export async function send(page: Page, text: string): Promise<void> {
  const box = composer(page);
  await box.fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

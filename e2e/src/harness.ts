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
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import WebSocket from "ws";
import { parseDocument } from "yaml";

import type {
  AgentOptions,
  Command,
  CommandResults,
  GroupsState,
  RepositoryState,
  ServerMessage,
} from "@sublang/spex-core";
import { ARTIFACT_SCHEMAS, suppliedCompiler, templatePath } from "@sublang/spex-core";
import { defaultRunCommand } from "../../packages/core/dist/forge.js";
import {
  DEMO_CONFIG,
  authoringScript,
  demoCaptain,
  demoScript,
  seedDemoHistory,
  seedDemoProject,
  seedHistorySession,
  appendHistorySession,
  interruptDemoSession,
  fakeAdapterImports,
  parkingScript,
  askingScript,
  compiledRunScript,
  prepareStorageGitFiles,
  STUB_SLC_RELEASE_FILE,
  startStandinHost,
  startStandinRegistry,
  stubSlcScriptedSource,
  type FakeScript,
  type StandinHost,
  type StandinRegistry,
  type StubSlcStep,
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
  /** Additional native-style provider rules for approval journeys. */
  approvalRules?: FakeScript["rules"];
  /** The core host's preferred languages, independent of the browser. */
  systemLanguages?: readonly string[];
  /**
   * `demo` writes the two-player demo config before boot; `none`
   * leaves the path empty so the core seeds its installed template —
   * the true first run.
   */
  config?: "demo" | "none";
  /** Real adapter constructors for credential-free capability/setup journeys.
   * These journeys never submit a provider prompt. */
  nativeBrowser?: boolean;
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
  /**
   * The real Captain shell with the parking script (DR-076): the first
   * Boss turn starts the real /code root, whose coder commits its
   * phase and leaves a stray file behind, so the run parks over one
   * unresolved effect and really advertises its controls. Implies
   * `realCaptain`, and needs `project` for a repository to commit in.
   */
  park?: boolean;
  /**
   * The real Captain shell with the asking script (DR-088): the first
   * Boss turn starts the real /code root, whose coder asks the Boss a
   * question the Captain relays; the answer is delivered, the coder
   * commits, and the nested review passes. Implies `realCaptain`, and
   * needs `project` for a repository to commit in.
   */
  ask?: boolean;
  /** The scripted root reports typed success, enabling intent advancement. */
  governedCompletion?: boolean;
  /** Substitute task-free model discovery; never start installed providers. */
  discoverAgentModels?: NonNullable<ServerShellOptions["core"]>["discoverAgentModels"];
  /**
   * Write the configuration inside the Spex home, in your own group's
   * spex repository at `workspace/<own>/<own>-spex/config/`, where it
   * syncs with that repository (storage-1, DR-103); the scratch default
   * lies outside the home. Implied by `remote` and `host`.
   */
  homeConfig?: boolean;
  /**
   * A bare Git repository in the scratch root, exposed as
   * `app.remotePath`, that a spex repository may name as a path remote
   * with no host (space-11) — the exploring journey's (space-42). It
   * sets the core's Git environment: an isolated Git configuration with
   * no identity. Journeys against a host use `host` instead.
   */
  remote?: "bare";
  /**
   * A stand-in Git host (git-host-12) for the Groups journeys, started
   * before the shell with its URL in `SPEX_HOST_URL`, so the new home
   * records it and signs in there by the device flow the served shell
   * runs (space-3). `registry` also starts a stand-in registry
   * (environments-18) the host fronts at its own origin, as spex.pub
   * serves both (DR-104); `share` points a second home at a host
   * another app started. The home's configuration lies in your own
   * group's spex repository and follows it when sign-in renames it
   * (space-59), and the core's Git is the isolated one of `remote`.
   */
  host?: boolean | { registry?: boolean; share?: { host: StandinHost; registry?: StandinRegistry } };
  /** Signed in at the stand-in before the page opens: the device flow
   * started over the protocol, its code approved through the script,
   * and the account's set-up awaited (space-4). Needs `host`. */
  signedIn?: boolean;
  /**
   * Playbook authoring (DR-058): a stub `slc` on the toolchain path
   * — passing, failing once at gears2fsm and then passing, asking for
   * clarification once and then passing, or blocking until canceled
   * — and the authoring agent's script laid before the demo's, so
   * sessions still draw the same run. The stub's entry declares the
   * two roles the authoring source names, and each phase stays open
   * `phaseDelayMs` so a running phase can be watched. With `hold`,
   * every run stays in its first phase until `app.releaseCompile(id)`:
   * a state-by-state walk then asserts the running state and scans it
   * at its own pace, however slow the machine, and releases the run
   * when done. The stub runs under the running Node, which stands in
   * for the system Node the compile floor checks (DR-005: >= 23.6), so
   * `startApp` refuses an older Node up front rather than letting
   * every compile fail "at toolchain".
   */
  authoring?: {
    script?: FakeScript;
    /** `fixture` passes by placing the committed compiled fixture
     * (`COMPILED_FIXTURE`) — the example as the real `slc` compiled it
     * — in place of the stub's own artifacts (playbook-library-87). */
    slc?: "ok" | "fail:gears2fsm" | "clarify" | "block" | "fixture";
    phaseDelayMs?: number;
    hold?: boolean;
  };
  /**
   * A compiled playbook run for real on substitute agents
   * (playbook-library-87, DR-089): the real Captain shell, whose
   * provider replies follow `compiledRunScript` — each hidden judgment
   * taking the outcome that goes straight on, the coder committing, the
   * reviewer finding nothing — behind an authoring agent that answers
   * a passing compile's turn proposing nothing. Needs `project` for a
   * repository to commit in.
   */
  compiled?: boolean;
  /**
   * A compile player (DR-086, release-25): the config is written
   * before boot as the installed template's text with one more roster
   * player, `compiler`, on this adapter, model and effort in cligent's
   * protected auto mode — bound to no role, so no session runs it,
   * for a journey to pick as a draft's agent so the conversation and
   * the compile run on its block while the Captain and every player a
   * playbook runs keep the template's. Takes the place of `config`;
   * the boot refuses a config the core does not read as valid.
   */
  compiler?: { adapter: string; model: string; effort?: string };
}

/** Every journey home's own group (storage-2): a fixed folder name, so
 * the paths under `workspace/` are known before the shell boots. */
export const E2E_OWN = "e2e";

/** The stand-in's account (git-host-12): sign-in renames your own group
 * after it (space-59). */
export const HOST_LOGIN = "ada";
/** The stand-in's team group and its id (git-host-12). */
export const HOST_GROUP = "acme";
export const HOST_GROUP_ID = "2002";

/** Your own group's name in a home: the one `home.yaml` records once
 * the home has written it — a sign-in renames it (space-59). */
export function ownName(dataDir: string): string {
  try {
    return /^own: (\S+)$/m.exec(readFileSync(join(dataDir, "home.yaml"), "utf8"))?.[1] ?? E2E_OWN;
  } catch {
    return E2E_OWN;
  }
}

/** Your own group's spex repository's key in a home (storage-1). */
export function ownKey(dataDir: string): string {
  const own = ownName(dataDir);
  return `${own}/${own}-spex`;
}

/** A spex repository's clone under a journey home (storage-1). */
export function clonePath(dataDir: string, key: string): string {
  return join(dataDir, "workspace", ...key.split("/"));
}

/** One repository's state out of the Groups state (space-30). */
export function repositoryOf(state: GroupsState, key: string): RepositoryState {
  for (const group of state.groups) {
    const found = group.repositories.find((repository) => repository.key === key);
    if (found) return found;
  }
  throw new Error(`no repository ${key}`);
}

/** The roster id `AppOptions.compiler` writes. */
export const COMPILER_PLAYER = "compiler";

/** The installed template's text (what `config: "none"` seeds) with
 * the compile player added under `players`, its comments kept. */
function compilerConfig(compiler: NonNullable<AppOptions["compiler"]>): string {
  const doc = parseDocument(readFileSync(templatePath(), "utf8"));
  doc.setIn(
    ["players", COMPILER_PLAYER],
    doc.createNode({
      adapter: compiler.adapter,
      model: compiler.model,
      ...(compiler.effort ? { effort: compiler.effort } : {}),
      permissions: { mode: "auto" },
    }),
  );
  return doc.toString();
}

/** The compile floor of DR-005 (`MIN_NODE_MAJOR.MIN_NODE_MINOR` in the
 * core's compile module): slc's dynamic import of `.ts` artifacts needs
 * Node's type stripping. */
const COMPILE_NODE_FLOOR = { major: 23, minor: 6 };

/** Refuse a running Node below the compile floor when the journey
 * compiles: the stub `slc` runs under it, and the compile check would
 * otherwise fail every run before the compiler starts. */
function assertCompileNode(): void {
  const match = /^v(\d+)\.(\d+)/.exec(process.version);
  const major = Number(match?.[1] ?? 0);
  const minor = Number(match?.[2] ?? 0);
  const ok = major > COMPILE_NODE_FLOOR.major
    || (major === COMPILE_NODE_FLOOR.major && minor >= COMPILE_NODE_FLOOR.minor);
  if (!ok) {
    throw new Error(
      `the authoring journeys compile with the stub slc under the running Node (${process.version}), below the compile floor ${COMPILE_NODE_FLOOR.major}.${COMPILE_NODE_FLOOR.minor} (DR-005); run the journeys on a newer Node`,
    );
  }
}

/** The two roles the authoring source names (`AUTHORING_SOURCE`),
 * as the stub's entry declares them. */
const AUTHORING_ROLES = "['Triager', 'Verifier']";

/** The stub's scripted runs per `authoring.slc`: the last step repeats. */
const STUB_STEPS: Record<NonNullable<AppOptions["authoring"]>["slc"] & string, StubSlcStep[]> = {
  ok: ["ok"],
  fixture: ["ok"],
  "fail:gears2fsm": ["fail:gears2fsm", "ok"],
  clarify: ["clarify", "ok"],
  block: ["block"],
};

/** A prompt of the authoring runner (playbook-library-65): the
 * preamble, a later turn's change line, a Boss or system origin, or
 * the malformed-block notice. Session players never see these. */
const AUTHORING_PROMPT = /^(You are helping the Boss|Since your last reply:|Boss: |Spex: |Spex could not read)/mu;

/**
 * The authoring script with its first reply and its relay reply held
 * in flight `delayMs`: a journey then sees the source land before
 * the turn ends, and a failed compile stand — its phase red, its line
 * in the thread — before the relay's own compile replaces it.
 */
export function slowAuthoringScript(delayMs = 2500): FakeScript {
  const script = authoringScript();
  const slowed = (match: string | RegExp) =>
    match === "Boss: I want" || String(match).includes("failed at");
  return {
    ...script,
    rules: (script.rules ?? []).map((rule) =>
      slowed(rule.match) ? { ...rule, response: { ...rule.response, delayMs } } : rule,
    ),
  };
}

/** The fake adapter's script: the demo narration alone, or the
 * authoring rules first — their fallback answering every other
 * authoring prompt — and the demo's rules and fallback behind them. */
function adapterScript(options: AppOptions): FakeScript {
  const demo = demoScript({ delayMs: options.agentDelayMs ?? 400 });
  if (options.approvalRules) demo.rules = [...options.approvalRules, ...(demo.rules ?? [])];
  if (!options.authoring) return demo;
  const author = options.authoring.script ?? authoringScript();
  return {
    rules: [
      ...(author.rules ?? []),
      ...(author.fallback ? [{ match: AUTHORING_PROMPT, response: author.fallback }] : []),
      ...(demo.rules ?? []),
    ],
    ...(demo.fallback ? { fallback: demo.fallback } : {}),
  };
}

/** The compiled run's script behind the authoring agent's: a passing
 * compile's turn is answered with no registration proposed, so the
 * Register tab stands on its derived defaults. */
function compiledScript(options: AppOptions): FakeScript {
  const run = compiledRunScript({ delayMs: options.agentDelayMs ?? 400 });
  return {
    rules: [{ match: AUTHORING_PROMPT, response: { result: "Compiled." } }, ...(run.rules ?? [])],
    ...(run.fallback ? { fallback: run.fallback } : {}),
  };
}

/** Claude's catalog carries an alias with the specific model it
 * resolves to — the demo's own `claude-opus-5-5`, a canonical pin it
 * recognizes without listing — the runtime's own descriptions and the
 * model it runs by default, as the runtime reports them (DR-091).
 * Codex's deliberately omits the demo's `gpt-6-sol`, exercising
 * retained custom IDs. */
function fixtureModelDiscovery(adapter: AgentOptions["adapter"]): AgentOptions["discovery"] {
  return {
    status: "available",
    ...(adapter === "claude" ? { unreportedEffortValues: ["ultracode"], defaultModel: "opus" } : {}),
    models: adapter === "claude" ? [{
      id: "opus", name: "Opus", resolvedModel: "claude-opus-5-5",
      description: "Opus 5.5 · Best for everyday, complex tasks",
      effortValues: ["low", "high", "max"], fastModeSupported: true,
    }, {
      id: "claude-fable-5-1", name: "Claude Fable 5.1",
      effortValues: ["high", "max"], fastModeSupported: false,
    }] : adapter === "codex" ? [{
      id: "gpt-6-astra", name: "GPT-6 Astra",
      description: "Workhorse model for coding and everyday work.",
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
    check: (state: GroupsState) => boolean,
    timeoutMs = 30_000,
  ): Promise<GroupsState> {
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
          .map((m) => (m.type === "space.state" ? JSON.stringify(m.state.groups.flatMap((group) => group.repositories.map((repository) => [repository.key, repository.sync]))) : ""));
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

/** The model this device sets in your own group's config before the
 * daily sync (space-41). */
export const LOCAL_MODEL = "claude-opus-5-local";
/** The peer's prompt in the shared session (space-41). */
export const PEER_TURN = "Tighten the expiry tests";
/** This device's own prompt in the shared session. */
export const LOCAL_TURN = "Add the expiry test";
/** The shared session's title: its first turn. */
export const SESSION_TITLE = "Fix the login redirect";
/** The peer's own session in the project it pushed (space-36). */
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
  /** Your own group's config file (with `host`, where sign-in moved it). */
  readonly configPath: string;
  /** The demo project's path — registered when `project` was asked. */
  projectDir: string;
  projectId?: string;
  /** The session store the playbook CLI would write into for the demo
   * project: its spex repository's `sessions/` (storage-14), or your own
   * group's before a project is registered — scratch in both lanes, so a
   * terminal-run fixture lands where the core serves it (core-service-60). */
  readonly sharedSessionsDir: string;
  server: RunningServer;
  /** Arrange-only protocol client on the running shell. */
  core: CoreClient;
  /** The stand-in Git host (with `host`): its `script` approves device
   * codes and holds the fixture (git-host-12). */
  host?: StandinHost;
  /** The stand-in registry the host fronts (with `host.registry`). */
  registry?: StandinRegistry;
  /** Your own group's spex repository's key, as `home.yaml` now names
   * it (storage-1). */
  readonly ownKey: string;
  /** The bare repository standing in for `origin` (with `remote`), or
   * the stand-in's bare repository of the project once it is there. */
  remotePath?: string;
  /** The peer home's working copy (with `remote: "peer"`). */
  peerDir?: string;
  /** The session both homes changed (with `remote: "peer"`). */
  sessionId?: string;
  /** Run a long command on one spex repository and wait until its
   * machine leaves `running`, returning the repository's state (arrange
   * only). */
  settleSpace<T extends "space.sync" | "space.fetch">(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<RepositoryState>;
  /** The peer changes its working copy of `remotePath` and pushes there
   * as plain Git — the host's copy "moved". */
  peerPush(mutate: (dir: string) => void | Promise<void>): Promise<string>;
  /**
   * The remote's `spex` moves under the next `times` pushes: an
   * `update` hook on the bare repository commits a peer note on `spex`
   * and declines each of those pushes as not fast-forward, so a sync
   * meets a remote that changed after its check — once for the
   * automatic re-check, twice for "The host changed again". Not a
   * `pre-receive` hook: Git reports that hook's decline as "pre-receive
   * hook declined", which is a host refusing by its rule (space-15),
   * not a race.
   */
  rejectPushes(times: number): void;
  /** An authoring session's playbook artifact in its spec package under
   * development, in the project's working folder, where the agent
   * writes `<id>.md` (environments-10, playbook-library-70). */
  draftDir(id: string): string;
  /** Let a held stub compile of the draft past its first phase (with
   * `authoring.hold`): one token per run, consumed when the run reads
   * it, so a token written before the run starts releases that run. */
  releaseCompile(id: string): void;
  /** The app preferences file's text, empty when none was written. */
  readPrefs(): string;
  /** Stop the shell, keeping the root; `start` boots it again on the
   * same port so an open page's origin still reaches it. */
  stop(): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
  readConfig(): string;
  /** The project's own config file in its spex repository, empty when
   * none was written (core-service-2). */
  readProjectConfig(): string;
}

async function boot(
  options: ServerShellOptions,
): Promise<{ server: RunningServer; core: CoreClient }> {
  const server = await startServer(options);
  const core = new CoreClient(
    server.url.replace(/^http/, "ws"),
  );
  try {
    await core.open();
  } catch (error) {
    // The failed connect is the one reported, whatever the close meets.
    await server.close().catch(() => undefined);
    throw error;
  }
  return { server, core };
}

export async function startApp(options: AppOptions = {}): Promise<App> {
  const scratch = mkdtempSync(join(tmpdir(), "spex-e2e-"));
  // A start that fails leaves no root behind: removed outright before
  // the shell boots, closed with the shell after.
  const started: Started = {};
  try {
    return await arrangeApp(scratch, options, started);
  } catch (error) {
    // The failure that stopped the start is the one reported.
    if (started.app) await started.app.close().catch(() => undefined);
    else {
      await started.closeOwned?.();
      rmSync(scratch, { recursive: true, force: true });
    }
    throw error;
  }
}

/** What a start has made so far, for its failure to undo. */
interface Started {
  app?: App;
  /** Close the stand-ins this start began. */
  closeOwned?: () => Promise<void>;
}

async function arrangeApp(
  scratch: string,
  options: AppOptions,
  started: Started,
): Promise<App> {
  const home = join(scratch, "home");
  mkdirSync(home, { recursive: true });
  const dataDir = join(scratch, "state");
  const projectDir = join(scratch, "demo-project");
  if (options.project) seedDemoProject(projectDir);
  const hostMode = options.host !== undefined && options.host !== false;
  if (options.signedIn && !hostMode) throw new Error("signedIn needs host");
  const homeConfig = options.homeConfig || options.remote !== undefined || hostMode;
  // Inside the home, the config is your own group's spex repository's
  // (storage-1, DR-103).
  const configPath = homeConfig
    ? join(clonePath(dataDir, `${E2E_OWN}/${E2E_OWN}-spex`), "config", "playbook.config.yaml")
    : join(scratch, "config", "playbook.config.yaml");
  mkdirSync(dirname(configPath), { recursive: true });
  // The stand-in Git host and, with it, the stand-in registry it fronts
  // (git-host-12, environments-18): started before the shell, so the
  // new home records the host from `SPEX_HOST_URL` (git-host-1).
  let host: StandinHost | undefined;
  let registry: StandinRegistry | undefined;
  const owned: { close(): Promise<void> }[] = [];
  if (hostMode) {
    const spec = typeof options.host === "object" ? options.host : {};
    if (spec.share) {
      host = spec.share.host;
      registry = spec.share.registry;
    } else {
      if (spec.registry) {
        registry = await startStandinRegistry({ dir: join(scratch, "registry") });
        owned.push(registry);
      }
      host = await startStandinHost({ dir: join(scratch, "host"), ...(registry ? { registry: registry.url } : {}) });
      owned.push(host);
    }
  }
  const closeOwned = async (): Promise<void> => {
    for (const service of owned.reverse()) await service.close().catch(() => undefined);
  };
  started.closeOwned = closeOwned;
  if (options.compiler) {
    writeFileSync(configPath, compilerConfig(options.compiler));
  } else if ((options.config ?? "demo") === "demo") {
    writeFileSync(configPath, DEMO_CONFIG);
  }
  if (options.project && options.history) {
    await seedDemoHistory(dataDir, projectDir, options.history, E2E_OWN, { env: { HOME: home }, homeDir: home });
  }
  const token = `e2e-${Math.random().toString(36).slice(2, 10)}`;
  // Both hosts use this explicit isolated Spex home.

  // The Groups journeys' Git environment (space-32, space-37): Git found
  // on the PATH, configured only through this environment — no identity,
  // so the committer fallback engages.
  let remotePath: string | undefined;
  if (options.remote) {
    remotePath = join(scratch, "remote.git");
    git(scratch, "init", "-q", "--bare", "-b", "spex", remotePath);
  }
  const baseEnv = options.env ?? {
    ANTHROPIC_API_KEY: "e2e-fake",
    OPENAI_API_KEY: "e2e-fake",
    SPEX_HOME: dataDir,
    ...(options.remote || hostMode
      ? {
          PATH: process.env.PATH ?? "",
          HOME: home,
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        }
      : {}),
    ...(host ? { SPEX_HOST_URL: host.url } : {}),
  };
  // The stub slc rides the toolchain path the core resolves
  // (playbook-library-8): the running Node runs it, and stands in for
  // the system Node the compile check probes.
  let env = baseEnv;
  if (options.authoring) {
    assertCompileNode();
    const stubPath = join(scratch, "stub-slc.cjs");
    writeFileSync(
      stubPath,
      stubSlcScriptedSource(STUB_STEPS[options.authoring.slc ?? "ok"], AUTHORING_ROLES, {
        phaseDelayMs: options.authoring.phaseDelayMs ?? 800,
        hold: options.authoring.hold ?? false,
        ...(options.authoring.slc === "fixture" ? { fixtureDir: COMPILED_FIXTURE } : {}),
      }),
    );
    env = { ...baseEnv, SPEX_SLC: `${process.execPath} ${stubPath}`, SPEX_NODE: process.execPath };
  }
  const shellOptions: ServerShellOptions = {
    host: "127.0.0.1",
    port: 0,
    token,
    // Signed in, your own group's folder is renamed after the account
    // (space-59): the core reads its config where it then lies only
    // when no path was named for it.
    ...(hostMode ? {} : { configPath }),
    dataDir,
    legacyDb: join(scratch, "no-legacy.db"),
    insecure: false,
    uiDist,
    core: LIVE
      ? {
          // Real adapters and Captain; only what the run writes is
          // redirected, so the machine's own sessions stay untouched.
          env: { ...process.env, SPEX_HOME: dataDir },
          own: E2E_OWN,
        }
      : {
          adapterImports: options.nativeBrowser ? undefined : options.park
            ? fakeAdapterImports(parkingScript({ delayMs: options.agentDelayMs ?? 1 })).imports
            : options.compiled
            ? fakeAdapterImports(compiledScript(options)).imports
            : options.ask
            ? fakeAdapterImports(askingScript({ delayMs: options.agentDelayMs ?? 1 })).imports
            : options.realCaptain
            ? fakeAdapterImports({ fallback: { result: JSON.stringify({ action: "respond", text: "Acknowledged by the real Captain." }) } }).imports
            : fakeAdapterImports(adapterScript(options)).imports,
          adapterRuntime: () => ({ usable: true }),
          discoverAgentModels: options.discoverAgentModels ?? (async (adapter) => fixtureModelDiscovery(adapter)),
          ...(options.realCaptain || options.park || options.ask || options.compiled ? {} : { captainFactory: async (_composed: unknown, sessionId: string) => demoCaptain(sessionId, { governedCompletion: options.governedCompletion }) }),
          env,
          home,
          own: E2E_OWN,
          // New projects must have a real baseline, independent of the
          // test host's identity and signing policy.
          runCommand: async (command, args, cwd, commandEnv) => {
            const result = await defaultRunCommand(command, args, cwd, commandEnv);
            if (command === "git" && args[0] === "init" && result.code === 0) {
              commitIdentity(args[1]);
            }
            return result;
          },
          ...(options.systemLanguages ? { systemLanguages: options.systemLanguages } : {}),
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
    // Your own group's config, where a sign-in may have moved it.
    get configPath() {
      return hostMode
        ? join(clonePath(dataDir, ownKey(dataDir)), "config", "playbook.config.yaml")
        : configPath;
    },
    projectDir,
    host,
    registry,
    get ownKey() {
      return ownKey(dataDir);
    },
    get sharedSessionsDir() {
      const key = app.projectId ?? ownKey(dataDir);
      const dir = join(clonePath(dataDir, key), "sessions");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      return dir;
    },
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
      const key = (fields as { repository: string }).repository;
      const state = await core.waitSpace(from, (candidate) => {
        try { return repositoryOf(candidate, key).sync.phase !== "running"; } catch { return false; }
      });
      return repositoryOf(state, key);
    },
    async peerPush(mutate) {
      const dir = app.peerDir ?? clonePeer(app);
      git(dir, "fetch", "-q", "origin");
      git(dir, "reset", "-q", "--hard", "origin/spex");
      await mutate(dir);
      git(dir, "add", "-A", "--", ".");
      git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "peer change");
      git(dir, "push", "-q", "origin", "HEAD:spex");
      return git(dir, "rev-parse", "HEAD");
    },
    rejectPushes(times) {
      // The bare repository the core pushes to: the scratch remote, or
      // the stand-in's copy of the project (git-host-12).
      const bare = app.remotePath;
      if (!bare) throw new Error("rejectPushes needs a remote");
      const counter = join(scratch, "rejected-pushes");
      writeFileSync(counter, "0\n");
      const hook = join(bare, "hooks", "update");
      // The hook runs inside the bare repository during the core's
      // push, before its ref moves: it advances spex by one real peer
      // commit — a note file over the current tree — and declines the
      // push as the remote would have, had the peer pushed first.
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
          "  git read-tree spex",
          '  blob=$(printf "peer note %s\\n" "$count" | git hash-object -w --stdin)',
          '  git update-index --add --cacheinfo 100644 "$blob" "peer-note-$count.txt"',
          "  tree=$(git write-tree)",
          '  commit=$(git -c user.name=Peer -c user.email=peer@example.test commit-tree "$tree" -p spex -m "peer moved $count")',
          '  git update-ref refs/heads/spex "$commit"',
          '  echo "the peer pushed first: non-fast-forward, fetch first" >&2',
          "  exit 1",
          "fi",
          "exit 0",
          "",
        ].join("\n"),
      );
      chmodSync(hook, 0o755);
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
      try {
        await app.stop();
      } finally {
        await closeOwned();
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    readConfig() {
      const path = app.configPath;
      return existsSync(path) ? readFileSync(path, "utf8") : "";
    },
    readProjectConfig() {
      if (!app.projectId) return "";
      const path = join(clonePath(dataDir, app.projectId), "config", "playbook.config.yaml");
      return existsSync(path) ? readFileSync(path, "utf8") : "";
    },
    draftDir(id) {
      // The playbook artifact of the spec package under development in
      // the project's working folder (environments-10).
      return join(projectDir, "spex-packages", id, "playbooks", "en", id);
    },
    releaseCompile(id) {
      if (!options.authoring?.hold) throw new Error("releaseCompile needs authoring.hold");
      writeFileSync(join(app.draftDir(id), STUB_SLC_RELEASE_FILE), "");
    },
    readPrefs() {
      const prefs = join(dataDir, "local", "prefs.json");
      return existsSync(prefs) ? readFileSync(prefs, "utf8") : "";
    },
  };
  started.app = app;
  if (options.compiler) {
    // The written file must be what the core reads as valid, or the
    // journey would meet a broken Settings rather than the roster.
    const config = await app.core.command("config.get", {});
    if (config.status !== "valid") {
      throw new Error(`the compile player's config reads ${JSON.stringify(config)}`);
    }
  }
  if (options.project) {
    const info = await app.core.command("project.register", { path: projectDir });
    app.projectId = info.id;
  }
  if (options.signedIn) await signInCore(app);
  return app;
}

/** Whether a Git command succeeds in a directory. */
function spawnGit(cwd: string, ...args: string[]): boolean {
  try { execFileSync("git", ["-C", cwd, ...args], { env: peerGitEnv, stdio: "ignore" }); return true; } catch { return false; }
}

/** One intent as a peer's spex repository holds it (storage-4). */
function writeIntentFile(dir: string, text: string): string {
  const id = randomUUID();
  mkdirSync(join(dir, "intents"), { recursive: true });
  writeFileSync(join(dir, "intents", `${id}.json`), JSON.stringify({ format: 1, id, text, createdAt: Date.now() }));
  return id;
}

/** The peer's and this device's project settings (core-service-2):
 * review's reviewer bound to different players, so the project's
 * Settings is one whole-file choice (space-17). */
export const PEER_PROJECT_CONFIG = "playbooks:\n  review:\n    roles:\n      coder: dev.coder\n      reviewer: dev.coder\n";
export const LOCAL_PROJECT_CONFIG = "playbooks:\n  review:\n    roles:\n      coder: dev.coder\n      reviewer: dev.reviewer\n";

/** Clone the bare remote as the peer's working copy. */
function clonePeer(app: App): string {
  if (!app.remotePath) throw new Error("the peer needs a remote");
  const dir = join(dirname(app.dataDir), "peer");
  git(dirname(app.dataDir), "clone", "-q", app.remotePath, dir);
  // A fresh remote holds no spex yet; the peer starts it.
  if (spawnGit(dir, "rev-parse", "-q", "--verify", "origin/spex")) git(dir, "checkout", "-q", "-B", "spex", "origin/spex");
  else git(dir, "checkout", "-q", "--orphan", "spex");
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
 * Wait until no session holds the runtime or a turn (DR-051): the
 * Captain's last line shows before the turn settles and the runtime is
 * released, and a Space operation is refused by name while either
 * stands (space-11) — a journey that sent a turn through the page
 * waits here before it syncs.
 */
export async function settled(app: App): Promise<void> {
  await expect
    .poll(
      async () =>
        (await app.core.command("session.list", {})).every(
          (session) => !session.live && !session.turnActive,
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

// ---------------------------------------------------------------------------
// The stand-in host: sign-in, picks and a peer (git-host-12, DR-103)
// ---------------------------------------------------------------------------

/** The stand-in's bare repository of a spex repository, by its key
 * (`<group>/<name>-spex`), as a peer reaches it on disk. */
export function bareOf(host: StandinHost, key: string): string {
  const found = host.script.repositories.find((repo) => `${repo.group.fullPath}/${repo.path}` === key);
  if (!found) throw new Error(`the stand-in holds no ${key}`);
  return found.bare;
}

/** The demo project's key as the core reads it now: a sign-in renames
 * your own group's folder and the clones under it (space-59), and a
 * pick moves the clone into its group (space-58). */
export async function refreshProjectKey(app: App): Promise<string | undefined> {
  const projects = await app.core.command("project.list", {});
  const found = projects.find((project) => project.path === app.projectDir);
  app.projectId = found?.id;
  return found?.id;
}

/**
 * Sign the home in at the stand-in over the protocol (arrange only):
 * the device flow the served core runs (space-3), its user code
 * approved through the script, and the account's set-up awaited —
 * your own group renamed after the login, created on the host and
 * pushed (space-4, space-59, space-65).
 */
export async function signInCore(app: App): Promise<GroupsState> {
  const host = app.host;
  if (!host) throw new Error("signing in needs a host");
  const from = app.core.mark();
  const started = await app.core.command("space.signin.start", {});
  if (started.flow !== "device") throw new Error(`the served core started the ${started.flow} flow`);
  host.script.approveDevice(started.userCode);
  const state = await app.core.waitSpace(from, (candidate) => ownSetUp(candidate), 60_000);
  await refreshProjectKey(app);
  return state;
}

/** Whether a sign-in's set-up has ended: signed in, nothing in flight,
 * and your own group's spex repository on the host (space-4). */
export function ownSetUp(state: GroupsState): boolean {
  if (state.account === null || state.signIn.phase !== "idle") return false;
  const login = state.account.login;
  try {
    const own = repositoryOf(state, `${login}/${login}-spex`);
    return own.state !== "local-only" && own.sync.phase !== "running";
  } catch {
    return false;
  }
}

/** Pick a group for the demo project's local-only spex repository over
 * the protocol (arrange only): `<name>-spex` created in that group and
 * pushed (space-58); the project's key and remote follow it. */
export async function pickGroup(
  app: App,
  options: { name?: string; groupId?: string; groupPath?: string } = {},
): Promise<RepositoryState> {
  const host = app.host;
  if (!host || !app.projectId) throw new Error("a pick needs a host and the project");
  const name = options.name ?? "demo-project";
  const key = `${options.groupPath ?? HOST_GROUP}/${name}-spex`;
  const from = app.core.mark();
  await app.core.command("space.pick", {
    repository: app.projectId,
    choice: { kind: "create", groupId: options.groupId ?? HOST_GROUP_ID, name },
  });
  const state = await app.core.waitSpace(from, (candidate) => {
    try { return repositoryOf(candidate, key).sync.phase === "done"; } catch { return false; }
  }, 60_000);
  app.projectId = key;
  app.remotePath = bareOf(host, key);
  return repositoryOf(state, key);
}

/**
 * The two-laptop arrangement against the stand-in (space-41, space-43,
 * space-44): this home signed in, its project picked into the team
 * group and pushed with one titled session; a peer pushing to the
 * stand-in's copy a differing configuration, a second turn in that
 * session and one queued intent; this device then running its own
 * second turn and changing Settings — two conflicts and one incoming
 * intent.
 */
export async function arrangeHostPeer(app: App): Promise<void> {
  if (!app.projectId || !app.host) throw new Error("the host peer needs project and host");
  if (app.core.messages.every((m) => m.type !== "space.state" || m.state.account === null)) {
    await signInCore(app);
  }
  const session = await app.core.command("session.create", { projectId: app.projectId });
  app.sessionId = session.id;
  await runTurn(app, session.id, SESSION_TITLE);
  await pickGroup(app);
  await app.peerPush(async (dir) => {
    mkdirSync(join(dir, "config"), { recursive: true });
    writeFileSync(join(dir, "config", "playbook.config.yaml"), PEER_PROJECT_CONFIG);
    await appendHistorySession(join(dir, "sessions"), session.id, [
      { type: "turn_started", turnId: 2, turn: { id: 2, prompt: PEER_TURN }, timestamp: Date.now() },
      { type: "captain_reply", turnId: 2, timestamp: Date.now() + 1, text: "Done on the other laptop." },
      { type: "turn_finished", turnId: 2, timestamp: Date.now() + 2 },
    ]);
    writeIntentFile(dir, "Queued on the other laptop");
  });
  await runTurn(app, session.id, LOCAL_TURN);
  await app.core.command("config.edit", {
    op: { kind: "captain.set", patch: { model: LOCAL_MODEL } },
  });
  const local = join(clonePath(app.dataDir, app.projectId), "config");
  mkdirSync(local, { recursive: true });
  writeFileSync(join(local, "playbook.config.yaml"), LOCAL_PROJECT_CONFIG);
}

/** The peer member of the team group the stand-in lists (git-host-12). */
export const PEER_MEMBER = { id: "1002", login: "bob", displayName: "Bob Peer", role: "Developer" };

/**
 * The second device's arrangement against the stand-in (space-36): the
 * team group holds the demo project's spex repository, which a peer —
 * `bob`, a member beside the account — pushed with a configuration, a
 * titled session and one queued intent, its `project.json` naming the
 * code by a path this machine serves. Returns the code's path.
 */
export async function seedHostProject(app: App): Promise<{ key: string; code: string }> {
  const host = app.host;
  if (!host) throw new Error("the seeded project needs a host");
  const code = join(dirname(app.dataDir), "code-remote", "demo-project");
  seedDemoProject(code);
  const repo = host.script.addRepository({
    group: HOST_GROUP,
    name: "demo-project-spex",
    project: { format: 1, name: "demo-project", remote: code },
    members: [PEER_MEMBER],
  });
  const key = `${HOST_GROUP}/demo-project-spex`;
  const dir = join(dirname(app.dataDir), "peer");
  git(dirname(app.dataDir), "clone", "-q", "--branch", "spex", repo.bare, dir);
  // The team's settings name players alone (core-service-2): the ones
  // the demo's run calls, which this home's own roster sets up.
  mkdirSync(join(dir, "config"), { recursive: true });
  writeFileSync(join(dir, "config", "playbook.config.yaml"), LOCAL_PROJECT_CONFIG);
  prepareStorageGitFiles(dir);
  app.sessionId = await seedHistorySession(join(dir, "sessions"), join(dirname(app.dataDir), "peer-code"), [
    { type: "turn_started", turnId: 1, turn: { id: 1, prompt: PEER_SESSION_TITLE }, timestamp: Date.now() },
    { type: "captain_reply", turnId: 1, timestamp: Date.now() + 1, text: "Planned on the other laptop." },
    { type: "turn_finished", turnId: 1, timestamp: Date.now() + 2 },
  ]);
  writeIntentFile(dir, "Queued on the other laptop");
  git(dir, "add", "-A", "--", ".");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "peer records");
  git(dir, "push", "-q", "origin", "HEAD:spex");
  app.peerDir = dir;
  app.remotePath = repo.bare;
  return { key, code };
}

/**
 * Sign in through the page (space-3): Groups' Sign in, the link to the
 * page that carries the code shown while the control reads "Signing
 * in…" and no code is, the code the link carries approved at the
 * stand-in as its page would, and the header reading the account.
 * Groups must be shown.
 */
export async function signInThroughPage(page: Page, app: App): Promise<void> {
  const host = app.host;
  if (!host) throw new Error("signing in needs a host");
  const header = page.getByTestId("space-header");
  await header.getByTestId("space-signin").click();
  const link = header.getByTestId("space-signin-link");
  await expect(link).toHaveText(/^Open .+ to sign in$/);
  await expect(header.getByTestId("space-signin")).toHaveText("Signing in…");
  await expect(header.getByTestId("space-signin")).toBeDisabled();
  const href = new URL((await link.getAttribute("href")) ?? "");
  expect(`${href.origin}${href.pathname}`).toBe(`${host.url}/login/device`);
  const code = href.searchParams.get("user_code") ?? "";
  expect(code).not.toBe("");
  await expect(page.getByTestId("space-surface")).not.toContainText(code);
  host.script.approveDevice(code);
  await expect(header.getByTestId("space-account")).toContainText(`Signed in as @${HOST_LOGIN}`);
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
export async function interruptSession(app: App, sessionId: string, input: string, options: { recorded?: boolean } = {}): Promise<void> {
  await app.stop();
  await interruptDemoSession(app.sharedSessionsDir, sessionId, input, options);
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
  await load(page, app, path);
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
}

/**
 * The same, for a page that may not speak English (localization-10):
 * the rail is waited on by what it is rather than by what it says,
 * since every label is translated and no attribute is.
 */
export async function openTranslated(
  page: Page,
  app: App,
  path = "",
): Promise<void> {
  await load(page, app, path);
  await expect(surfaceEntry(page, "Dashboard")).toBeVisible();
}

/**
 * The sidebar entry for a surface, by which surface it is rather than
 * by what it says. Projects is the rail's own tree heading while the
 * sidebar stands open and a plain entry while it is collapsed; either
 * shape answers here, and exactly one of them is ever drawn.
 */
export function surfaceEntry(page: Page, name: SurfaceName) {
  return page
    .getByTestId("sidebar")
    .locator(
      name === "Workspace"
        ? '[data-testid="sidebar-workspace"], [data-surface="Workspace"]'
        : `[data-surface="${name}"]`,
    );
}

/** Go to the token URL, with the debug instrumentation when asked. */
async function load(page: Page, app: App, path: string): Promise<void> {
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
}

/** The surfaces as the rail names them in its own attributes. */
export type SurfaceName =
  | "Dashboard"
  | "Workspace"
  | "Playbooks"
  | "Space"
  | "Settings";

/** The sidebar entry for a surface, by its English name. */
export function nav(
  page: Page,
  name: "Dashboard" | "Projects" | "Playbooks" | "Groups" | "Settings",
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

// ---------------------------------------------------------------------------
// The live lane's runs (DR-086): real agents, minutes to hours each
// ---------------------------------------------------------------------------

/** How many commits a repository's HEAD holds. */
export function commitCount(dir: string): number {
  return Number(git(dir, "rev-list", "--count", "HEAD"));
}

/**
 * Give a scratch repository its own committer, for the real agents
 * that commit there: an unset identity makes the Captain ask, and a
 * signing requirement in the machine's Git config can stall the
 * commit — neither is the machine's to decide.
 */
export function commitIdentity(dir: string): void {
  for (const [key, value] of [
    ["user.name", "Spex Test"],
    ["user.email", "spex@example.test"],
    ["commit.gpgsign", "false"],
  ]) {
    execFileSync("git", ["-C", dir, "config", key, value]);
  }
}

/** The open session's Captain pane and player grid, as evidence. */
export async function attachRun(page: Page, label: string): Promise<void> {
  const textOf = async (id: string) => {
    const element = page.getByTestId(id);
    return (await element.count()) > 0 ? element.innerText() : "(not shown)";
  };
  await test.info().attach(label, {
    body: [
      "--- captain ---",
      await textOf("captain-pane"),
      "--- players ---",
      await textOf("player-grid"),
    ].join("\n"),
    contentType: "text/plain",
  });
}

/** Where a watched run stands on one read of the page: stopped short
 * of what the journey waits for — a failed turn, a failure notice, or
 * a question for the Boss unless the journey answers questions —
 * waiting on the Boss's answer, or going on (undefined). One read, so
 * hours of polling stay light in the trace. */
async function runStand(
  page: Page,
  answering: boolean,
): Promise<{ stop: string } | "question" | undefined> {
  return page.evaluate((answering) => {
    const all = (id: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
    if (all("captain-pane").some((pane) => /turn failed/i.test(pane.innerText))) {
      return { stop: "the turn failed" };
    }
    const question = all("question-bubble").at(-1);
    if (question && !answering) return { stop: `the run asked the Boss: ${question.innerText}` };
    // A run parked on a question wears the parked-run notice too
    // (data-reason="question"): a journey that answers questions
    // leaves that park to its answer, and stops on a failed one.
    const parked = all("failed-workflow").find(
      (notice) => !answering || notice.dataset.reason !== "question",
    );
    if (parked) return { stop: `failed-workflow: ${parked.innerText}` };
    const unparked = all("unparked-failure-notice")[0];
    if (unparked) return { stop: `unparked-failure-notice: ${unparked.innerText}` };
    if (answering && all("boss-reply-banner").length > 0) return "question";
    return undefined;
  }, answering);
}

/** How a journey watches a run it waits on. */
export interface RunWatch {
  /** Called in the open session while a question waits for the Boss:
   * the journey answers it, and returns once the wait has cleared.
   * Without it, a question stops the run. */
  onQuestion?: () => Promise<void>;
  /** How long to wait between reads of the page: ten seconds by
   * default, for runs of minutes to hours. */
  pollMs?: number;
}

/**
 * Watch the open session until `reached` holds, polling the page, and
 * fail at once — the transcripts attached — when the run stops short
 * of it or the time runs out. A question for the Boss stops it too,
 * unless `onQuestion` answers it.
 */
export async function awaitRun(
  page: Page,
  what: string,
  reached: () => Promise<boolean>,
  timeout: number,
  watch: RunWatch = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const stand = await runStand(page, watch.onQuestion !== undefined);
    if (stand && stand !== "question") {
      await attachRun(page, `stopped before ${what}`);
      throw new Error(`${what}: ${stand.stop}`);
    }
    if (await reached()) return;
    if (stand === "question" && watch.onQuestion) {
      await watch.onQuestion();
      continue;
    }
    if (Date.now() > deadline) {
      await attachRun(page, `timed out before ${what}`);
      throw new Error(`${what}: not reached in ${Math.round(timeout / 60_000)} minutes`);
    }
    await new Promise((resolve) => setTimeout(resolve, watch.pollMs ?? 10_000));
  }
}

/** The Boss's one answer to any question a player asks in a live run
 * (DR-089): neutral, so the run goes on as the request asked. */
export const NEUTRAL_ANSWER = "Take the simplest option that satisfies the request, and go on.";

/**
 * A watch that answers each question a run asks through the session's
 * composer, as the Boss would (DR-085): the question standing as the
 * Captain's bubble with the banner naming the asking player, the
 * transcripts attached as `question <n>`, then `answer` sent and the
 * wait cleared within `clears`. `asked()` counts the questions
 * answered.
 */
export function answeringWith(
  page: Page,
  answer: string = NEUTRAL_ANSWER,
  clears = 60 * 60_000,
): RunWatch & { asked: () => number } {
  let asked = 0;
  return {
    asked: () => asked,
    onQuestion: async () => {
      asked += 1;
      const banner = page.getByTestId("boss-reply-banner");
      await expect(page.getByTestId("question-bubble").last()).toBeVisible();
      await expect(banner).toContainText("is waiting");
      await attachRun(page, `question ${asked}`);
      const box = page.getByTestId("boss-composer");
      await expect(box).toBeEnabled();
      await box.fill(answer);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(banner).toHaveCount(0, { timeout: clears });
    },
  };
}

/** Wait until the Captain pane has narrated `line` `times` times —
 * "/code finished" once per settled run — failing fast as `awaitRun`. */
export async function awaitCaptainLine(
  page: Page,
  line: string,
  timeout: number,
  times = 1,
  watch: RunWatch = {},
): Promise<void> {
  const lines = captainLines(page, line);
  await awaitRun(page, `${line} ×${times}`, async () => (await lines.count()) >= times, timeout, watch);
}

/** The Captain pane's status lines that carry `line`. */
export function captainLines(page: Page, line: string) {
  return page.getByTestId("captain-pane").getByTestId("system-line").filter({ hasText: line });
}

/** A player's pane carries the output of a call it served: no longer
 * idle, and more than `least` characters of text. */
export async function expectEngaged(page: Page, playerId: string, least = 50): Promise<void> {
  const pane = page.getByTestId(`player-pane-${playerId}`);
  await expect(pane).toBeVisible();
  await expect(pane).not.toContainText("Idle until the playbook calls");
  expect((await pane.innerText()).length, `${playerId}'s pane`).toBeGreaterThan(least);
}

/** The calls a player's pane shows it served, by their positions in
 * the session's record stream: each call opens on a prompt naming the
 * role it served (run-view-7), and every earlier entry is shown first,
 * so a long session's first calls count too. */
export async function callsServed(page: Page, playerId: string): Promise<number[]> {
  const pane = page.getByTestId(`player-pane-${playerId}`);
  const earlier = pane.getByRole("button", { name: /earlier entries/ });
  while ((await earlier.count()) > 0) await earlier.first().click();
  const ids = await pane
    .locator('[data-testid^="call-role-"]')
    .evaluateAll((labels) => labels.map((label) => label.getAttribute("data-testid") ?? ""));
  return ids.map((id) => Number(id.slice("call-role-".length))).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// The compiled example (DR-089): captured from a live compile, run in CI
// ---------------------------------------------------------------------------

/** The committed fixture of playbook-library-87: the app's own example
 * as the real `slc` compiled it, captured by playbook-library-86. */
export const COMPILED_FIXTURE = join(repoRoot, "e2e", "fixtures", "compiled", "workflow");

/** The example's draft id, which its Prefill opens and its compiled
 * entry carries. */
export const EXAMPLE_ID = "workflow";

/** Where a capture records what compiled the fixture. */
const CAPTURE_RECORD = "capture.json";

/** What a capture records: the compiler, and the engine generation —
 * the runtime ABI and the artifact schema — the fixture belongs to. */
export interface CompiledCapture {
  playbookId: string;
  capturedAt: string;
  compiler: { name: string; version: string };
  engine: { name: string; version: string; runtimeAbi: number; artifactSchema: number };
  agent?: { adapter: string; model: string; effort?: string };
}

/** A `@sublang/playbook` engine as Node resolves it from `fromDir`:
 * its version and the runtime ABI it declares. */
async function engineFrom(fromDir: string): Promise<{ version: string; runtimeAbi: number }> {
  const modulePath = createRequire(join(fromDir, "package.json")).resolve(
    "@sublang/playbook/xstate-runtime",
  );
  let dir = dirname(modulePath);
  while (!existsSync(join(dir, "package.json"))) dir = dirname(dir);
  const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string };
  const { RUNTIME_ABI } = (await import(pathToFileURL(modulePath).href)) as { RUNTIME_ABI: number };
  return { version, runtimeAbi: RUNTIME_ABI };
}

/**
 * Copy what the real compile of a draft produced — slc's `<id>.playbook/`
 * layout and the registry entry beside it, with the source it compiled —
 * into `dest`, replacing what stood there, and record the compiler and
 * its engine generation in `capture.json`. The journey's own packaging
 * (the bundles, the wrapper, the engine links) stays behind: the fixture
 * is the compiler's output, which the stub `slc` of playbook-library-87
 * places for the app to package again.
 */
export async function captureCompiled(
  app: App,
  id: string,
  dest: string,
  agent?: AppOptions["compiler"],
): Promise<CompiledCapture> {
  const draft = app.draftDir(id);
  const compiler = suppliedCompiler();
  if (!compiler) throw new Error("no supplied @sublang/slc to name in the capture");
  const { version } = JSON.parse(readFileSync(join(compiler.packageDir, "package.json"), "utf8")) as {
    version: string;
  };
  const engine = await engineFrom(compiler.packageDir);
  const entry = readFileSync(join(draft, `${id}.ts`), "utf8");
  const schema = /artifactSchema:\s*(\d+)/.exec(entry)?.[1];
  if (!schema) throw new Error(`the compiled entry ${id}.ts declares no artifactSchema`);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(join(draft, `${id}.playbook`), join(dest, `${id}.playbook`), {
    recursive: true,
    filter: (path) => !path.split(sep).includes("node_modules"),
  });
  cpSync(join(draft, `${id}.ts`), join(dest, `${id}.ts`));
  cpSync(join(draft, `${id}.md`), join(dest, `${id}.md`));
  const capture: CompiledCapture = {
    playbookId: id,
    capturedAt: new Date().toISOString(),
    compiler: { name: "@sublang/slc", version },
    engine: {
      name: "@sublang/playbook",
      version: engine.version,
      runtimeAbi: engine.runtimeAbi,
      artifactSchema: Number(schema),
    },
    ...(agent ? { agent } : {}),
  };
  writeFileSync(join(dest, CAPTURE_RECORD), `${JSON.stringify(capture, null, 2)}\n`);
  return capture;
}

/** The committed compiled fixture and its capture record, or undefined
 * while none has been captured. */
export function compiledFixture(): { dir: string; capture: CompiledCapture } | undefined {
  const record = join(COMPILED_FIXTURE, CAPTURE_RECORD);
  if (!existsSync(record)) return undefined;
  return {
    dir: COMPILED_FIXTURE,
    capture: JSON.parse(readFileSync(record, "utf8")) as CompiledCapture,
  };
}

/**
 * Refuse a fixture of another engine generation than the app installs
 * (DR-089): the fixture is regenerated whenever the playbook engine
 * changes its runtime ABI or artifact schema, so a stale one fails the
 * journey — naming the capture that renews it — rather than skipping.
 */
export async function assertFixtureGeneration(capture: CompiledCapture): Promise<void> {
  const app = await engineFrom(dirname(fileURLToPath(import.meta.resolve("@sublang/spex-core"))));
  const stale: string[] = [];
  if (capture.engine.runtimeAbi !== app.runtimeAbi) {
    stale.push(`runtime ABI ${capture.engine.runtimeAbi}, the app's ${app.runtimeAbi}`);
  }
  if (!ARTIFACT_SCHEMAS.includes(capture.engine.artifactSchema)) {
    stale.push(
      `artifact schema ${capture.engine.artifactSchema}, the app's ${ARTIFACT_SCHEMAS.join("/")}`,
    );
  }
  if (stale.length > 0) {
    throw new Error(
      `the compiled fixture belongs to another engine generation (${stale.join("; ")}): ` +
        "recapture it as e2e/fixtures/compiled/README.md says",
    );
  }
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The journey harness (DR-039): every test boots the real server shell
// on a scratch root — scratch config, scratch state, scratch home —
// with the core's agent seams substituted (server-shell-20), and opens
// the shell's token URL in the browser. The live lane keeps the
// machine's agents and sign-in, redirecting only the state it writes.

import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
  PlacementState,
  RepositoryState,
  ServerMessage,
} from "@sublang/spex-core";
import { ARTIFACT_SCHEMAS, suppliedCompiler, templatePath } from "@sublang/spex-core";
import { defaultRunCommand } from "../../packages/core/dist/forge.js";
import { canonicalOrigin, instanceFolder, instanceSegmentOf } from "@sublang/spex/instance";
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
  failingScript,
  askingScript,
  compiledRunScript,
  developRunScript,
  DEVELOP_CONFIG,
  type DevelopRunOptions,
  prepareStorageGitFiles,
  STUB_SLC_RELEASE_FILE,
  startStandinHost,
  startStandinRegistry,
  stubSlcScriptedSource,
  type FakeScript,
  type FakeRunOptions,
  type StandinHost,
  type StandinPerson,
  type StandinRegistry,
  type StandinServer,
  type StubSlcStep,
} from "@sublang/spex-core/testing";
// The stand-in hub (hub-2, hub-3) is the core's own test module, not
// re-exported from its testing entry.
import {
  STANDIN_HUB_CA,
  startStandinHub,
  type StandinHub,
} from "../../packages/core/dist/testing/standin-hub.js";
import {
  startServer,
  type RunningServer,
  type ServerShellOptions,
} from "spex-server/dist/server.js";

export { canonicalOrigin, expect };

/** The live lane: the machine's real adapters and Captain (DR-020). */
export const LIVE = process.env.SPEX_E2E_LIVE === "1";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
/** The staged UI bundle the shell serves: the built page as the
 * desktop's `file://` copy carries it, before the shell's retargeting. */
export const uiDist = join(repoRoot, "apps", "server", "ui-dist");

export interface AppOptions {
  /** Route the canonical registry to the stand-in while retaining its origin. */
  independentRegistry?: boolean;
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
  /**
   * With `project`: a bare clone of the demo project in the scratch
   * root, `code/demo-project.git`, set as its `origin` before it is
   * registered, so its `project.json` names the code by a path this
   * machine serves (space-36, space-96) — one a second home's Join
   * clones, reading as the reader set it on the row (space-1), with
   * neither "remote" nor "space" in it.
   */
  codeRemote?: boolean;
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
   * The real Captain shell with the failing script (DR-117): the first
   * Boss turn starts the real /code root, whose coder's call fails, so
   * the run parks in its failure state and really advertises a retry
   * of that step and a resume from an earlier one. Implies
   * `realCaptain`, and needs `project` for a repository to run in.
   */
  failPlayer?: boolean;
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
   * (environments-18) the host fronts at its own origin, as Spex Space
   * serves both (DR-104); `share` points a second home at a host
   * another app started, and its `second` at that app's second instance
   * (space-96), which this home reaches only by a sign-in naming it,
   * both left to their owner to close. The home's configuration lies in
   * your own group's spex repository and follows it when sign-in
   * renames it (space-59), and the core's Git is the isolated one of
   * `remote`.
   * `second` starts a second stand-in instance after it (DR-127), at an
   * origin of its own that the home reaches only by a sign-in naming it:
   * on a Git backend of its own (`separate`, the default) or over the
   * first's (`shared`), with its own display name, the person it signs
   * in and whether that person may make a root group; its `registry`
   * starts a stand-in registry of its own that the second fronts at its
   * origin, as each instance serves its own (environments-18).
   * `third` starts a third stand-in instance after the second (DR-128),
   * read as `second` is, `shared` meaning over the first's Git backend,
   * and named "Third stand-in" unless another name is given.
   */
  host?: boolean | {
    registry?: boolean;
    share?: { host: StandinHost; registry?: StandinRegistry; second?: StandinHost };
    second?: { backend?: "separate" | "shared"; displayName?: string; person?: StandinPerson; canCreateGroup?: boolean; registry?: boolean };
    third?: { backend?: "separate" | "shared"; displayName?: string; person?: StandinPerson; canCreateGroup?: boolean };
  };
  /** Signed in at the stand-in before the page opens: the device flow
   * started over the protocol, its code approved through the script,
   * and the account's set-up awaited (space-4). Needs `host`. */
  signedIn?: boolean;
  /**
   * Team servers for the places journeys (DR-133): each a stand-in hub
   * over TLS (hub-2, hub-3) listed by the stand-in instance as a server
   * of its team group under `name` (servers-5), its tickets redeemed
   * there, and its relays piped to a further core standing as the
   * person's seat — a plain served core on a scratch root of its own,
   * booted with `seat`'s options as a journey's app is, not in seat
   * mode — while this app's core trusts the hubs' fixture CA beside the
   * system's (core-service-128). A seat booted with `host: true` shares
   * this app's own stand-in instance, and the registry it fronts, in
   * place of starting one of its own (`host.share`), so its `signedIn`
   * signs the seat in there as the same person. Needs `host`.
   */
  servers?: { name: string; seat?: AppOptions }[];
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
   * The real Captain shell running the built-in /dev on substitute
   * agents (run-view-193): the analyst picks decide then code,
   * `decide` asks the coder and the reviewer in parallel and the coder
   * merges and commits, then `code` commits with its review passing.
   * The config binds every role the path reaches. Needs `project`.
   */
  develop?: DevelopRunOptions;
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
/** The second stand-in instance's display name unless one is named
 * (`host.second`, DR-127). */
export const SECOND_HOST_NAME = "Second stand-in";
/** The third stand-in instance's display name unless one is named
 * (`host.third`, DR-128). */
export const THIRD_HOST_NAME = "Third stand-in";
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

/** Every row of the Groups state, as your own group and the instances'
 * headings hold them (space-30). */
export function rowsOf(state: GroupsState): RepositoryState[] {
  return [...state.own.repositories, ...state.instances.flatMap((instance) => instance.groups.flatMap((group) => group.repositories))];
}

/** The entry the Groups state lists for the instance at `origin`, in any
 * spelling of it (space-30). */
export function instanceOf(state: GroupsState, origin: string): GroupsState["instances"][number] | undefined {
  const canonical = canonicalOrigin(origin);
  return state.instances.find((instance) => instance.origin === canonical);
}

/** One repository's state out of the Groups state (space-30): under
 * your own group or an instance's heading. */
export function repositoryOf(state: GroupsState, key: string): RepositoryState {
  const found = rowsOf(state).find((repository) => repository.key === key);
  if (found) return found;
  throw new Error(`no repository ${key}`);
}

/** A row's line for the placement at an instance by its origin, in any
 * spelling of it, or the path placement's for null (space-30,
 * space-87). */
export function placementOf(row: RepositoryState, origin: string | null): PlacementState {
  const wanted = origin === null ? null : canonicalOrigin(origin);
  const found = row.placements.find((line) => (line.instance === null ? null : canonicalOrigin(line.instance)) === wanted);
  if (found) return found;
  throw new Error(`no placement ${origin} on ${row.key}: ${JSON.stringify(row.placements.map((line) => line.instance))}`);
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

/** Keep the demo's provider call open at its terminal event until the
 * journey has inspected its live lane (release-31). Other calls pass
 * through unchanged, including the Captain's hidden routing calls. */
function heldDemoImports(
  script: FakeScript,
  wait: (playerId: string, signal?: AbortSignal) => Promise<void>,
): ReturnType<typeof fakeAdapterImports>["imports"] {
  type Adapter = new (...args: any[]) => {
    run(prompt: string, options?: FakeRunOptions): AsyncIterable<{ type: string }>;
  };
  const imports = fakeAdapterImports(script).imports;
  return Object.fromEntries(Object.entries(imports).map(([name, load]) => [name, async () => {
    const Base = await (load as () => Promise<Adapter>)();
    return class extends Base {
      async *run(prompt: string, options?: FakeRunOptions) {
        const playerId = prompt.startsWith("Implement:") ? "dev.coder"
          : prompt.startsWith("Review the change") ? "dev.reviewer" : undefined;
        for await (const event of super.run(prompt, options)) {
          if (playerId && event.type === "done") {
            await wait(playerId, options?.abortSignal);
            if (options?.abortSignal?.aborted) return;
          }
          yield event;
        }
      }
    };
  }])) as unknown as ReturnType<typeof fakeAdapterImports>["imports"];
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
          .map((m) => (m.type === "space.state" ? JSON.stringify(rowsOf(m.state).map((repository) => [repository.key, repository.sync])) : ""));
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

/** A team server of the journey (`AppOptions.servers`, DR-133). */
export interface TeamServer {
  /** The server as the stand-in instance lists it (servers-5). */
  server: StandinServer;
  /** Its stand-in hub: `admissions` holds each bearer it minted, and a
   * journey scripts its relays (hub-3). */
  hub: StandinHub;
  /** The core the hub relays to as the person's seat: an app of its
   * own, with its own arrange-only client, root and port. */
  seat: App;
  /** The seat's place, `<instance origin>#<server id>`
   * (core-service-128). */
  place: string;
}

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
   * codes and holds the fixture (git-host-12). The home's default
   * instance, from `SPEX_HOST_URL`. */
  host?: StandinHost;
  /** Every stand-in instance of the journey, the first being `host`,
   * the second `host.second`'s, or another app's `host.share.second`
   * (DR-127), and the third `host.third`'s (DR-128); empty without
   * `host`. */
  hosts: StandinHost[];
  /** The stand-in registry the host fronts (with `host.registry`):
   * `registries[0]`. */
  registry?: StandinRegistry;
  /** The stand-in registry each of `hosts` fronts, index for index,
   * undefined where that instance fronts none (`host.registry`,
   * `host.second.registry`, environments-18). */
  registries: (StandinRegistry | undefined)[];
  /** The team servers `AppOptions.servers` started, in its order. */
  servers: TeamServer[];
  /** Your own group's spex repository's key, as `home.yaml` now names
   * it (storage-1). */
  readonly ownKey: string;
  /** The bare repository standing in for `origin` (with `remote`), or
   * the stand-in's bare repository of the project once it is there. */
  remotePath?: string;
  /** The bare repository the demo project's code names as its
   * `origin` (with `codeRemote`). */
  codeOrigin?: string;
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
  /** Hold the demo player's next completion until the journey releases
   * it, leaving its prompt and streamed output available to inspect. */
  holdPlayer(playerId: "dev.coder" | "dev.reviewer"): void;
  releasePlayer(playerId: "dev.coder" | "dev.reviewer"): void;
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
  // The code's own remote, a bare path the project names before it is
  // registered, which the registration writes into `project.json`.
  let codeOrigin: string | undefined;
  if (options.codeRemote) {
    if (!options.project) throw new Error("codeRemote needs project");
    codeOrigin = join(scratch, "code", "demo-project.git");
    mkdirSync(dirname(codeOrigin), { recursive: true });
    git(scratch, "clone", "-q", "--bare", projectDir, codeOrigin);
    git(projectDir, "remote", "add", "origin", codeOrigin);
  }
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
  const hosts: StandinHost[] = [];
  const registries: (StandinRegistry | undefined)[] = [];
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
    hosts.push(host);
    registries.push(registry);
    // Another app's second instance, which this home reaches only by a
    // sign-in naming it (space-96); its owner closes it.
    if (spec.share?.second) {
      if (spec.second) throw new Error("host.share.second and host.second name two second instances");
      hosts.push(spec.share.second);
      registries.push(undefined);
    }
    // The second instance, after the first and closed before it: over
    // the first's Git backend or on one of its own (git-host-12),
    // fronting a registry of its own where asked, started before it and
    // closed after it (environments-18).
    if (spec.second) {
      const { backend, displayName, person, canCreateGroup } = spec.second;
      let fronted: StandinRegistry | undefined;
      if (spec.second.registry) {
        fronted = await startStandinRegistry({ dir: join(scratch, "registry-2") });
        owned.push(fronted);
      }
      const second = await startStandinHost({
        ...(backend === "shared" ? { gitBackend: host } : { dir: join(scratch, "host-2") }),
        displayName: displayName ?? SECOND_HOST_NAME,
        ...(person ? { person } : {}),
        ...(fronted ? { registry: fronted.url } : {}),
      });
      owned.push(second);
      if (canCreateGroup !== undefined) second.script.canCreateGroup = canCreateGroup;
      hosts.push(second);
      registries.push(fronted);
    }
    // The third instance, after the second and closed before it, over
    // the first's Git backend or on one of its own (DR-128).
    if (spec.third) {
      if (hosts.length < 2) throw new Error("host.third needs a second instance");
      const { backend, displayName, person, canCreateGroup } = spec.third;
      const third = await startStandinHost({
        ...(backend === "shared" ? { gitBackend: host } : { dir: join(scratch, "host-3") }),
        displayName: displayName ?? THIRD_HOST_NAME,
        ...(person ? { person } : {}),
      });
      owned.push(third);
      if (canCreateGroup !== undefined) third.script.canCreateGroup = canCreateGroup;
      hosts.push(third);
      registries.push(undefined);
    }
  }
  const closeOwned = async (): Promise<void> => {
    for (const service of owned.reverse()) await service.close().catch(() => undefined);
  };
  started.closeOwned = closeOwned;
  // The team servers (DR-133): each hub started, its seat's core booted
  // and the hub relaying to it, the server then listed by the instance
  // — closed after this app's core, the seat before its hub.
  const servers: TeamServer[] = [];
  if (options.servers?.length) {
    const instance = host;
    if (!instance) throw new Error("servers need host");
    for (const [index, entry] of options.servers.entries()) {
      const hub = await startStandinHub({ redeem: (ticket) => instance.script.redeemTicket(ticket) });
      owned.push(hub);
      // A seat asking for a host shares this app's instance, where its
      // `signedIn` signs it in.
      const seatOptions: AppOptions =
        entry.seat?.host === true
          ? { ...entry.seat, host: { share: { host: instance, ...(registry ? { registry } : {}) } } }
          : (entry.seat ?? {});
      const seat = await startApp(seatOptions);
      owned.push(seat);
      hub.relayTo(seat.url.replace(/^http/, "ws"));
      const server: StandinServer = { id: `srv_${index + 1}`, name: entry.name, group: HOST_GROUP, address: hub.url };
      instance.script.servers.push(server);
      servers.push({ server, hub, seat, place: `${canonicalOrigin(instance.url)}#${server.id}` });
    }
  }
  if (options.compiler) {
    writeFileSync(configPath, compilerConfig(options.compiler));
  } else if (options.develop) {
    writeFileSync(configPath, DEVELOP_CONFIG);
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
  const playerHolds = new Map<string, { promise: Promise<void>; release: () => void }>();
  const waitForPlayer = async (playerId: string, signal?: AbortSignal) => {
    const hold = playerHolds.get(playerId);
    if (!hold || signal?.aborted) return;
    let onAbort: (() => void) | undefined;
    try {
      await Promise.race([hold.promise, new Promise<void>((resolve) => {
        onAbort = resolve;
        signal?.addEventListener("abort", onAbort, { once: true });
      })]);
    } finally {
      if (onAbort) signal?.removeEventListener("abort", onAbort);
    }
  };
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
            : options.failPlayer
            ? fakeAdapterImports(failingScript({ delayMs: options.agentDelayMs ?? 1 })).imports
            : options.compiled
            ? fakeAdapterImports(compiledScript(options)).imports
            : options.develop
            ? fakeAdapterImports(developRunScript({ delayMs: options.agentDelayMs ?? 400, ...options.develop })).imports
            : options.ask
            ? fakeAdapterImports(askingScript({ delayMs: options.agentDelayMs ?? 1 })).imports
            : options.realCaptain
            ? fakeAdapterImports({ fallback: { result: JSON.stringify({ action: "respond", text: "Acknowledged by the real Captain." }) } }).imports
            : heldDemoImports(adapterScript(options), waitForPlayer),
          adapterRuntime: () => ({ usable: true }),
          discoverAgentModels: options.discoverAgentModels ?? (async (adapter) => fixtureModelDiscovery(adapter)),
          ...(options.realCaptain || options.park || options.failPlayer || options.ask || options.compiled || options.develop ? {} : { captainFactory: async (_composed: unknown, sessionId: string) => demoCaptain(sessionId, { governedCompletion: options.governedCompletion }) }),
          env,
          ...(options.independentRegistry && host ? { registryFetch: ((input, init) => {
            const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
            return fetch(target.origin === "https://spex.sublang.ai" ? `${host!.url}${target.pathname}${target.search}` : input, init);
          }) as typeof fetch } : {}),
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
          // The hubs' fixture CA, trusted beside the system's where the
          // core presents a ticket at a team server (DR-133).
          ...(options.servers?.length ? { serverCertificateAuthorities: [STANDIN_HUB_CA] } : {}),
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
    hosts,
    registry,
    registries,
    servers,
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
    codeOrigin,
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
      // the project's working folder, `spex-packages/<org>/<id>/`
      // (environments-10): the org folder holding it, else the
      // project's default org, its key's first segment.
      const base = join(projectDir, "spex-packages");
      const orgs = existsSync(base) ? readdirSync(base).filter((org) => existsSync(join(base, org, id))).sort() : [];
      const org = orgs[0] ?? app.projectId?.split("/")[0] ?? E2E_OWN;
      return join(base, org, id, "playbooks", "en", id);
    },
    holdPlayer(playerId) {
      if (playerHolds.has(playerId)) throw new Error(`${playerId} is already held`);
      let release!: () => void;
      const promise = new Promise<void>((resolve) => { release = resolve; });
      playerHolds.set(playerId, { promise, release });
    },
    releasePlayer(playerId) {
      const hold = playerHolds.get(playerId);
      if (!hold) throw new Error(`${playerId} is not held`);
      playerHolds.delete(playerId);
      hold.release();
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

/** The stand-in's folder under `workspace/` (DR-127):
 * `@127.0.0.1_<port>`. */
export function hostFolder(host: StandinHost): string {
  return instanceFolder(host.url);
}

/** The key of a spex repository the stand-in holds at `path`, its path
 * in the instance (`acme/<name>-spex`): under the stand-in's folder, as
 * its clone lies (DR-127). */
export function hostKey(host: StandinHost, path: string): string {
  return `${hostFolder(host)}/${path}`;
}

/** The stand-in's bare repository of a spex repository, by its key
 * (`<folder>/<group>/<name>-spex`) or its path in the instance, as a
 * peer reaches it on disk. */
export function bareOf(host: StandinHost, key: string): string {
  const folder = instanceSegmentOf(key);
  const path = folder === null ? key : key.slice(folder.length + 1);
  const found = host.script.repositories.find((repo) => `${repo.group.fullPath}/${repo.path}` === path);
  if (!found) throw new Error(`the stand-in holds no ${path}`);
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
 * Sign the home in at a stand-in instance over the protocol (arrange
 * only), by its origin — the home's default instance unless another
 * of `app.hosts` is named (DR-127): the device flow the served core
 * runs (space-3), its user code approved through the script, and the
 * account's set-up awaited — your own group renamed after the login,
 * created on the host and pushed (space-4, space-59, space-65).
 */
export async function signInCore(app: App, host: StandinHost | undefined = app.host): Promise<GroupsState> {
  if (!host) throw new Error("signing in needs a host");
  const from = app.core.mark();
  const started = await app.core.command("space.signin.start", { url: host.url });
  if (started.flow !== "device") throw new Error(`the served core started the ${started.flow} flow`);
  host.script.approveDevice(started.userCode);
  const state = await app.core.waitSpace(from, (candidate) => ownSetUp(candidate, host.url), 60_000);
  await refreshProjectKey(app);
  return state;
}

/** Arrange an independent registry grant, without changing Space state. */
export async function signInRegistryCore(app: App, host: StandinHost = app.host!): Promise<void> {
  const from = app.core.mark();
  const started = await app.core.command("registry.signin.start", { origin: host.url });
  if (started.flow !== "device") throw new Error("Expected a device registry sign-in");
  host.script.approveDevice(started.userCode);
  await app.core.waitFor((message) => app.core.messages.indexOf(message) >= from && message.type === "registry.state" && message.state.origin === host.url && message.state.account !== null && message.state.signIn.phase === "idle", 60_000);
}

/** A fixture explicitly chooses its package destination; joining a Space
 * never makes that choice for the product. */
export async function selectRegistryCore(app: App, origin: string, repository: string = app.projectId!): Promise<void> {
  await app.core.command("environment.registry.set", { repository, origin });
  await app.core.command("environment.resolve", { repository, wait: true });
}

/** Whether a sign-in's set-up has ended: signed in at the instance at
 * `origin` (the default instance unless named), nothing in flight, and
 * your own group's spex repository at an instance (space-4). */
export function ownSetUp(state: GroupsState, origin: string = state.defaultInstance): boolean {
  if (!instanceOf(state, origin)?.signedIn || state.signIn.phase !== "idle") return false;
  const { name } = state.own;
  const own = state.own.repositories.find((repository) => repository.key === `${name}/${name}-spex`);
  return own !== undefined && own.state !== "local-only" && own.sync.phase !== "running";
}

/** Pick a group for the demo project's local-only spex repository over
 * the protocol (arrange only), at the stand-in instance named — the
 * home's default instance unless another of `app.hosts` is — in its
 * team group, another group, or with `namespace` the account's
 * namespace there: `<name>-spex` created there and pushed, its clone
 * moving under that instance's folder (space-58, DR-127); the
 * project's key and remote follow it. */
export async function pickGroup(
  app: App,
  options: { host?: StandinHost; namespace?: boolean; name?: string; groupId?: string; groupPath?: string } = {},
): Promise<RepositoryState> {
  const host = options.host ?? app.host;
  if (!host || !app.projectId) throw new Error("a pick needs a host and the project");
  const name = options.name ?? "demo-project";
  const path = options.namespace ? host.script.person.login : options.groupPath ?? HOST_GROUP;
  const key = hostKey(host, `${path}/${name}-spex`);
  const from = app.core.mark();
  await app.core.command("space.pick", {
    repository: app.projectId,
    choice: { kind: "create", instance: host.url, groupId: options.namespace ? null : options.groupId ?? HOST_GROUP_ID, name },
  });
  const state = await app.core.waitSpace(from, (candidate) => {
    try { return repositoryOf(candidate, key).sync.phase === "done"; } catch { return false; }
  }, 60_000);
  app.projectId = key;
  app.remotePath = bareOf(host, key);
  return repositoryOf(state, key);
}

/** A project beside the demo's (space-85): a Git folder named `name`
 * in the scratch root, registered over the protocol (arrange only), its
 * spex repository local only under your own group (storage-6). */
export async function registerLocalProject(app: App, name: string): Promise<{ dir: string; key: string }> {
  const dir = join(dirname(app.dataDir), name);
  seedDemoProject(dir);
  const { id } = await app.core.command("project.register", { path: dir });
  return { dir, key: id };
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
  if (app.core.messages.every((m) => m.type !== "space.state" || m.state.instances.every((instance) => !instance.signedIn))) {
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
  const key = hostKey(host, `${HOST_GROUP}/demo-project-spex`);
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
  // The peer's Spex placed these records at the stand-in, so they carry
  // the tracked file naming that placement (storage-36), as every
  // computer opening them receives it: nothing of it is left to send.
  mkdirSync(join(dir, "placements"), { recursive: true });
  writeFileSync(
    join(dir, "placements", `${hostFolder(host)}.yaml`),
    `format: 1\ninstance: ${JSON.stringify(host.url)}\nid: ${JSON.stringify(repo.id)}\n`,
  );
  git(dir, "add", "-A", "--", ".");
  git(dir, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "peer records");
  git(dir, "push", "-q", "origin", "HEAD:spex");
  app.peerDir = dir;
  app.remotePath = repo.bare;
  return { key, code };
}

/** The sign-in card's chooser of Spaces (space-115): each Space of the
 * public registry's directory by its display name, then "Other
 * Space…", which reveals the field captioned "Space address". Where the
 * directory cannot be read the field stands alone and no chooser does. */
export function spaceChooser(card: Locator): Locator {
  return card.getByTestId("space-signin-chooser");
}

/** The field captioned "Space address" of a sign-in card (space-115):
 * standing behind "Other Space…", or alone where no directory reads. */
export function spaceAddress(card: Locator): Locator {
  return card.getByTestId("space-signin-address");
}

/** How the chooser's chosen entry reads (space-115): a native select's
 * chosen option, a listbox's selected option, or its trigger's text;
 * empty where no chooser stands. */
export async function chosenSpace(card: Locator): Promise<string> {
  return chosenEntry(spaceChooser(card));
}

/** Choose an entry of a sign-in card's chooser by the name it reads — a
 * Space's display name, or "Other Space…" (space-115) — whether the
 * chooser is a native select or a listbox. */
export async function chooseSpace(card: Locator, entry: string): Promise<void> {
  const chooser = spaceChooser(card).first();
  const native = await chooser.evaluate((root) => root instanceof HTMLSelectElement);
  const select = native ? chooser : chooser.locator("select");
  if (native || (await select.count()) > 0) {
    const value = await select.locator("option", { hasText: entry }).first().getAttribute("value");
    await select.selectOption(value !== null ? value : { label: entry });
    return;
  }
  const option = chooser.getByRole("option", { name: entry }).first();
  if (!(await option.isVisible())) {
    await chooser.locator('[role="combobox"], [aria-haspopup="listbox"]').first().click();
  }
  await option.click();
}

/** How a chooser's chosen entry reads — a native select's chosen
 * option, a listbox's selected option, or its trigger's text — empty
 * where no chooser stands; the chooser of Spaces (space-115) and of
 * registries (playbook-library-119) alike. */
export async function chosenEntry(chooser: Locator): Promise<string> {
  if ((await chooser.count()) === 0) return "";
  return chooser.first().evaluate((root) => {
    const select = root instanceof HTMLSelectElement ? root : root.querySelector("select");
    if (select) return (select.selectedOptions[0]?.textContent ?? "").trim();
    const selected = root.querySelector('[role="option"][aria-selected="true"]');
    if (selected) return (selected.textContent ?? "").trim();
    const trigger = root.querySelector('[role="combobox"], [aria-haspopup="listbox"], button');
    return (trigger?.textContent ?? root.textContent ?? "").trim();
  });
}

/**
 * Sign in through the page (space-3): while the home lists no instance,
 * the header card titled "Sign in to a Space"; where the home lists the
 * stand-in, signed out, its heading's "Sign in again"; where it lists
 * others alone, the card "Add a Space…" opens at the list's foot,
 * unless it stands open already. In a card, the chooser preselects the
 * default instance where the directory lists it (space-115) — the first
 * stand-in, whose directory a journey routing the public registry to
 * it reads — so another stand-in is chosen under "Other Space…" and its
 * origin typed in the field captioned "Space address", as it is where
 * the field stands alone and holds another. The card reads "Continue
 * in your browser" with the link "Open <Space>" to the page that
 * carries the code while the control reads "Signing in…" and no code
 * shows, `during` then asserting what holds while the flow runs; the
 * code the link carries is approved at the stand-in — `app.host`
 * unless another of `app.hosts` is named — as its page would, and the
 * stand-in's heading then reads the account's login beside Sign out.
 * Space must be shown.
 */
export async function signInThroughPage(
  page: Page,
  app: App,
  host: StandinHost | undefined = app.host,
  via?: "card" | "again" | "add",
  during?: () => Promise<void>,
): Promise<void> {
  if (!host) throw new Error("signing in needs a host");
  const section = page.getByTestId(`space-instance-${host.url}`);
  const listed = page.locator('[data-testid^="space-instance-http"]');
  const how = via ?? ((await section.count()) > 0 ? "again" : (await listed.count()) > 0 ? "add" : "card");
  // The card "Add a Space…" opens stands in its place until closed, as
  // after a start the core refused (space-3).
  const groups = page.getByTestId("space-groups");
  if (how === "add" && (await groups.getByTestId("space-add-card").count()) === 0) {
    await groups.getByTestId("space-add-space").click();
  }
  const where =
    how === "card"
      ? page.getByTestId("space-header").getByTestId("space-signin-card")
      : how === "add"
        ? groups.getByTestId("space-add-card")
        : section.getByTestId("space-instance-heading");
  const control = where.getByTestId(how === "again" ? "space-signin-again" : "space-signin");
  if (how !== "again") {
    const field = spaceAddress(where);
    if (!(await field.isVisible()) && host !== app.hosts[0]) await chooseSpace(where, "Other Space…");
    if ((await field.isVisible()) && (await field.inputValue()) !== host.url) await field.fill(host.url);
  }
  // The control's title names the Space it opens, as the link then does:
  // its display name as the home or the directory reads it, else its
  // host name (space-3).
  const title = (await control.getAttribute("title")) ?? "";
  const named = /^Opens (.+) in your browser$/.exec(title)?.[1];
  expect(named, title).toBeTruthy();
  await control.click();
  await expect(where).toContainText("Continue in your browser");
  const link = where.getByTestId("space-signin-link");
  await expect(link).toHaveText(`Open ${named}`);
  await expect(control).toHaveText("Signing in…");
  await expect(control).toBeDisabled();
  const href = new URL((await link.getAttribute("href")) ?? "");
  expect(`${href.origin}${href.pathname}`).toBe(`${host.url}/login/device`);
  const code = href.searchParams.get("user_code") ?? "";
  expect(code).not.toBe("");
  await expect(page.getByTestId("space-surface")).not.toContainText(code);
  await during?.();
  host.script.approveDevice(code);
  const heading = section.getByTestId("space-instance-heading");
  await expect(heading.getByTestId("space-signout")).toBeVisible();
  await expect(heading.getByRole("heading", { level: 2 })).toHaveText(new RegExp(` · @${host.script.person.login}$`));
}

/** An instance's section of the Groups list (space-1): its heading and
 * what it lists. Stand-ins share their host name, so a journey finds an
 * instance by its origin, never by its words. */
export function instanceSection(page: Page, host: StandinHost) {
  return page.getByTestId("space-groups").getByTestId(`space-instance-${host.url}`);
}

/** A spex repository's line for its placement at a stand-in instance,
 * or its path placement's for null, in its Sync tab (space-87, DR-159):
 * found by the instance's origin, as stand-ins share their host name.
 * The lines stand only while the row's name has opened its tabs. */
export function placementLine(page: Page, key: string, host: StandinHost | null) {
  return page.getByTestId(`space-lines-${key}`).getByTestId(`space-line-${host?.url ?? "path"}`);
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

/** What the page's sockets carried (`tapSockets`). */
export interface SocketTap {
  received: string[];
  sent: string[];
  urls: string[];
  /** Each socket's own frames, in the order the page dialed them. */
  sockets: { url: string; received: string[]; sent: string[] }[];
}

/** Every frame the page's sockets carried, each way, from its first
 * load on, with the URLs the page dialed. */
export function tapSockets(page: Page): SocketTap {
  const tap: SocketTap = { received: [], sent: [], urls: [], sockets: [] };
  page.on("websocket", (socket) => {
    const own = { url: socket.url(), received: [] as string[], sent: [] as string[] };
    tap.urls.push(own.url);
    tap.sockets.push(own);
    socket.on("framereceived", (frame) => {
      tap.received.push(String(frame.payload));
      own.received.push(String(frame.payload));
    });
    socket.on("framesent", (frame) => {
      tap.sent.push(String(frame.payload));
      own.sent.push(String(frame.payload));
    });
  });
  return tap;
}

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

/** The surfaces as the rail names them in its own attributes: the rail
 * holds Dashboard, Projects, Space and Settings (run-view-67, DR-172). */
export type SurfaceName =
  | "Dashboard"
  | "Workspace"
  | "Space"
  | "Settings";

/** The sidebar entry for a surface, by its English name. */
export function nav(
  page: Page,
  name: "Dashboard" | "Projects" | "Space" | "Settings",
) {
  return page.getByRole("button", { name, exact: true });
}

/** The project's pinned tabs this harness opens by name: beside Specs
 * and Overview, the playbooks a session in the project can run and its
 * packages (run-view-58, DR-172). */
export type ProjectTabName = "Playbooks" | "Packages";

/** The strip's control for one of the current project's pinned tabs. */
export function projectTabControl(page: Page, name: ProjectTabName): Locator {
  return page.getByTestId(`workspace-tab-${name.toLowerCase()}`);
}

/**
 * Open the current project's pinned Playbooks or Packages tab from
 * wherever the page stands — the Projects surface first where another
 * surface is shown — and return the tab's panel (run-view-58). The
 * Playbooks tab's panel gives way to a draft's workspace while one is
 * open, so callers reach into the page where a draft may stand.
 */
export async function projectTab(page: Page, name: ProjectTabName): Promise<Locator> {
  const control = projectTabControl(page, name);
  if (!(await control.isVisible())) await surfaceEntry(page, "Workspace").click();
  await control.click();
  await expect(control).toHaveAttribute("aria-selected", "true");
  return page.getByTestId(`${name.toLowerCase()}-tab`);
}

/** Where a row of the Playbooks tab comes from: the project's
 * environment, or your own group's, which the tab calls Personal
 * (playbook-library-1). */
export type PlaybookOrigin = "project" | "personal";

/** A playbook's row on the Playbooks tab from one environment: a
 * playbook both environments export is listed once per environment,
 * each row naming its origin (playbook-library-1). The row carries its
 * origin as the config it writes, `project` or `own`. */
export function playbookCard(scope: Page | Locator, id: string, origin: PlaybookOrigin): Locator {
  const config = origin === "personal" ? "own" : "project";
  return scope.locator(`[data-testid="playbook-card-${id}"][data-origin="${config}"]`);
}

/** One heading's half of the Packages tab: the project's packages under
 * "Packages", or those you added for yourself beneath them under
 * "Personal" (playbook-library-92). Each half holds its heading line —
 * "Registry: <registry>" with the account there and one "Add…"
 * (playbook-library-119) — its chips, its rows and its built-in line. */
export function packagesSection(page: Page, whose: PlaybookOrigin): Locator {
  return page.getByTestId(`packages-${whose}`);
}

/** A package's row in one heading's half of the Packages tab: its name,
 * version, source glyph, what it provides and its standing, with its one
 * overflow (playbook-library-92). */
export function packageRow(section: Locator, name: string): Locator {
  return section.getByTestId(`env-package-${name}`);
}

/** A package row's source glyph, whose tooltip names where the package
 * comes from: "From the registry · <range>", "From folder <path>",
 * "From Git <repository> at <rev>" or "Built in" (playbook-library-92). */
export function packageSource(row: Locator, name: string): Locator {
  return row.getByTestId(`env-source-${name}`);
}

/** The built-in playbooks' one quiet line of a heading's half
 * (playbook-library-92): "Built-in playbooks <locked>", with "· <shipped>
 * shipped with this app" and "Update to <shipped>" where the app ships a
 * newer release — never a removable row. */
export function builtinLine(section: Locator): Locator {
  return section.getByText(/^Built-in playbooks \d+\.\d+\.\d+/).first();
}

/** A heading's registry chooser (playbook-library-119): the control
 * reading "Registry: <display name>", opening the public registry and
 * the one that heading's spex.yaml names where that is another, by
 * display name, its last entry "Other…" revealing the field for a
 * registry's address. */
export function registryChooser(section: Locator): Locator {
  return section.getByTestId("registry-chooser");
}

/** The field for a registry's address that "Other…" reveals
 * (playbook-library-119). */
export function registryAddress(section: Locator): Locator {
  return section.getByTestId("registry-address");
}

/** The registry chooser's open list of entries, opening it unless open. */
async function registryMenu(section: Locator): Promise<Locator> {
  const menu = section.getByTestId("registry-chooser-menu");
  if (!(await menu.isVisible())) await registryChooser(section).click();
  await expect(menu).toBeVisible();
  return menu;
}

/** The registry chooser's entries as they read, in order — each
 * registry's display name, then "Other…" (playbook-library-119) —
 * leaving the list open. */
export async function registryEntries(section: Locator): Promise<string[]> {
  const menu = await registryMenu(section);
  const texts = await menu.locator('[role="menuitem"], [role="menuitemradio"]').allTextContents();
  return texts.map((text) => text.replace(/^\s*✓/, "").trim());
}

/** Choose a heading's registry (playbook-library-119): an entry by its
 * display name, or "Other…" with an address typed in the field it
 * reveals and entered, which writes it as that spex.yaml's `registry`. */
export async function chooseRegistry(section: Locator, entry: string, address?: string): Promise<void> {
  const menu = await registryMenu(section);
  await menu
    .locator('[role="menuitem"], [role="menuitemradio"]')
    .filter({ hasText: new RegExp(`^\\s*✓?\\s*${escapeRegExp(entry)}\\s*$`) })
    .first()
    .click();
  if (address === undefined) return;
  const field = registryAddress(section);
  await expect(field).toBeVisible();
  await field.fill(address);
  await field.press("Enter");
}

/** Open a heading's one "Add…" at one of its three tabs — Registry,
 * Folder or Git (playbook-library-92) — and return the heading's half,
 * which holds the popover's fields: the search "Search, or type
 * org/name" with its results and the row of a typed name the registry
 * does not list, the folder field, the Git fields, and the receipt. */
export async function addPackages(section: Locator, tab: "Registry" | "Folder" | "Git" = "Registry"): Promise<Locator> {
  const control = section.getByRole("tab", { name: tab, exact: true });
  if (!(await control.isVisible())) await section.getByRole("button", { name: "Add…", exact: true }).click();
  await control.click();
  await expect(control).toHaveAttribute("aria-selected", "true");
  return section;
}

/** Text that reads exactly `words`, whitespace aside. */
function exactly(words: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(words)}\\s*$`);
}

/** `text` as a regular expression matching it literally. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Open a package row's one overflow (playbook-library-92), unless it
 * stands open, and return its menu. */
export async function rowMenu(row: Locator): Promise<Locator> {
  const menu = row.getByRole("menu").first();
  if (!(await menu.isVisible())) await row.locator('[aria-haspopup="menu"]').first().click();
  await expect(menu).toBeVisible();
  return menu;
}

/** An act of a package row's overflow by its words — "Remove", "Publish",
 * "Sign in to publish" (playbook-library-92, playbook-library-113) —
 * opening the overflow to find it. */
export async function rowAct(row: Locator, words: string): Promise<Locator> {
  return (await rowMenu(row)).getByRole("menuitem").filter({ hasText: exactly(words) });
}

/**
 * Start Publish from a folder package's row (playbook-library-113): its
 * overflow's Publish — or the publish control's own Publish where an
 * earlier attempt left it standing beneath the row — up to the inline
 * preview, and return the row's publish control holding it.
 */
export async function publishFromRow(row: Locator): Promise<Locator> {
  const publish = row.getByTestId("publish");
  const summary = publish.getByTestId("publish-summary");
  const button = publish.getByTestId("publish-button");
  if (!(await button.isVisible())) await (await rowAct(row, "Publish")).click();
  await expect(summary.or(button).first()).toBeVisible();
  if (!(await summary.isVisible())) await button.click();
  await expect(summary).toBeVisible();
  return publish;
}

/** The control a row offers in Publish's place while no registry grant
 * stands (playbook-library-113, playbook-library-93): "Sign in to
 * publish" — the publish control's one button, opened by the overflow's
 * Publish where it does not stand open, or the overflow's own act. */
export async function rowSignInToPublish(row: Locator): Promise<Locator> {
  const button = row.getByTestId("publish").getByRole("button", { name: "Sign in to publish", exact: true });
  if (await button.isVisible()) return button;
  const menu = await rowMenu(row);
  const entry = menu.getByRole("menuitem").filter({ hasText: exactly("Sign in to publish") });
  if ((await entry.count()) > 0) return entry;
  await menu.getByRole("menuitem").filter({ hasText: exactly("Publish") }).click();
  return button;
}

/** The orgs New playbook's one "Org" field suggests (playbook-library-121),
 * as they read: its datalist's entries, or the listbox it opens. */
export async function orgSuggestions(page: Page): Promise<string[]> {
  const field = page.getByTestId("new-playbook-org");
  const list = await field.getAttribute("list");
  if (list) {
    return page
      .locator(`datalist[id="${list}"] option`)
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  }
  const listbox = page.getByTestId("new-playbook").getByRole("option");
  if ((await listbox.count()) === 0) await field.focus();
  return (await listbox.allTextContents()).map((text) => text.trim());
}

/** The project's New task tab, where its start composer stands. */
export async function newTaskTab(page: Page): Promise<void> {
  const control = page.getByRole("tab", { name: "New task", exact: true });
  if (!(await control.isVisible())) await surfaceEntry(page, "Workspace").click();
  await control.click();
  await expect(composer(page)).toBeVisible();
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
  await page.getByTestId("start-send").or(page.getByRole("button", { name: "Send", exact: true })).click();
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

/** A player's pane carries the output of a call it served: it stands,
 * as a lane does from its first call (run-view-7), with more than
 * `least` characters of text. */
export async function expectEngaged(page: Page, playerId: string, least = 50): Promise<void> {
  const pane = page.getByTestId(`player-pane-${playerId}`);
  await expect(pane).toBeVisible();
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

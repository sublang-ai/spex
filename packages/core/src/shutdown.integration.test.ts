// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Disposal-failure coverage (CORE-40/41): unproven runtime cleanup
// keeps project admission closed (DR-048), while shutdown still
// attempts every runtime and closes the endpoint (CORE-39).
//
// The failure is real rather than stubbed: the captain's dispose
// rejects, and cligent's own runtime disposal surfaces it, so the
// path under test is the one a broken SDK teardown takes. The bounded
// stop (DR-134) is driven against real processes that ignore SIGTERM.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { WebSocket } from "ws";

import { CoreService, type CoreServiceOptions } from "./service.js";
import { processAlive } from "./process-tree.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain } from "./testing/scripted-captain.js";
import type { Captain } from "@sublang/cligent/tmux-play";
import type { Command, CommandResults, ServerMessage } from "./protocol.js";
import { scratchDir } from "./testing/scratch.js";

const CONFIG = `
captain:
  adapter: claude
  model: claude-test
players:
  dev.coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    roles:
      coder: dev.coder
`;

const DISPOSE_FAILURE = "captain teardown exploded";
const PREPARE_FAILURE = "captain pre-close exploded";

/** A captain whose disposal fails the way a dead SDK child would. */
function brokenCaptain(): Captain {
  const captain = createScriptedCaptain(async () => {});
  return {
    ...captain,
    async dispose(): Promise<void> {
      throw new Error(DISPOSE_FAILURE);
    },
  };
}

/** A captain that records whether its disposal actually ran. */
function healthyCaptain(): { captain: Captain; disposed: () => boolean } {
  const inner = createScriptedCaptain(async () => {});
  let ran = false;
  return {
    captain: {
      ...inner,
      async dispose(): Promise<void> {
        ran = true;
        await inner.dispose?.();
      },
    },
    disposed: () => ran,
  };
}

class Client {
  private readonly socket: WebSocket;
  private readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
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
    await this.waitFor((message) => message.type === "hello");
  }

  close(): void {
    this.socket.close();
  }

  send<T extends Command["type"]>(type: T, fields: Omit<Extract<Command, { type: T }>, "type" | "id">): string {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    return id;
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<
    | { ok: true; result: CommandResults[T] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const id = this.send(type, fields);
    const reply = await this.waitFor(
      (message) => message.type === "reply" && message.id === id,
    );
    if (reply.type !== "reply") throw new Error("unreachable");
    return reply.ok
      ? { ok: true, result: reply.result as CommandResults[T] }
      : { ok: false, error: reply.error };
  }

  async expectOk<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<CommandResults[T]> {
    const reply = await this.command(type, fields);
    if (!reply.ok) {
      throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    }
    return reply.result;
  }

  private async waitFor(
    predicate: (message: ServerMessage) => boolean,
  ): Promise<ServerMessage> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const found = this.messages.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) throw new Error("timed out waiting for message");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

interface Harness {
  service: CoreService;
  projectDirs: string[];
  options: CoreServiceOptions;
}

/** Start a core whose captains are handed out in creation order. */
async function startHarness(captains: Captain[], extra: Partial<CoreServiceOptions> = {}): Promise<Harness> {
  const dir = scratchDir("spex-shutdown-it-");
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, CONFIG);
  const projectDirs = ["project-a", "project-b"].map((name) => {
    const path = join(dir, name);
    mkdirSync(path);
    execFileSync("git", ["init", "-q", path]);
    return path;
  });
  const { imports } = fakeAdapterImports({
    rules: [],
    fallback: { result: "ok" },
  });
  let handed = 0;
  const options: CoreServiceOptions = {
    token: "test",
    configPath,
    dataDir: join(dir, "state"),
    adapterImports: imports,
    adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => {
      const captain = captains[handed];
      handed += 1;
      if (!captain) throw new Error("no captain scripted for this session");
      return captain;
    },
    env: {},
    home: join(dir, "home"),
    watchConfig: false,
    ...extra,
  };
  const service = await CoreService.start(options);
  return { service, projectDirs, options };
}

test("CORE-40: a failed disposal keeps the session live and its project reserved", async (t) => {
  const harness = await startHarness([brokenCaptain()]);
  t.after(() => releaseFixtureLeases(harness.service));
  const client = new Client(harness.service.port());
  await client.open();
  try {
    const project = await client.expectOk("project.register", {
      path: harness.projectDirs[0] as string,
    });
    const session = await client.expectOk("session.create", {
      projectId: project.id,
    });

    // The client is told what went wrong (CORE-4).
    const disposal = await client.command("session.dispose", {
      sessionId: session.id,
    });
    assert.equal(disposal.ok, false);
    assert.match(
      disposal.ok === false ? disposal.error.message : "",
      new RegExp(DISPOSE_FAILURE),
    );

    // Failed teardown cannot prove external work stopped, so admission stays closed.
    const sessions = await client.expectOk("session.list", {});
    const retained = sessions.find((entry) => entry.id === session.id);
    assert.equal(retained?.live, true);
    assert.equal(retained?.endedAt, null);
    const replacement = await client.command("session.create", {
      projectId: project.id,
    });
    assert.equal(replacement.ok, false);
    assert.equal(replacement.ok === false ? replacement.error.code : "", "busy");
  } finally {
    client.close();
    await harness.service.stop().catch(() => {
      // The same broken runtime still rejects teardown at shutdown.
    });
  }
});

test("CORE-41: a failed disposal neither skips another nor holds the endpoint open", async (t) => {
  const healthy = healthyCaptain();
  const harness = await startHarness([brokenCaptain(), healthy.captain]);
  t.after(() => releaseFixtureLeases(harness.service));
  const port = harness.service.port();
  const client = new Client(port);
  await client.open();

  for (const path of harness.projectDirs) {
    const project = await client.expectOk("project.register", { path });
    await client.expectOk("session.create", { projectId: project.id });
  }
  client.close();

  // The first session's runtime fails to dispose; the stop reports it
  // only after every session has been attempted (CORE-39).
  await assert.rejects(
    harness.service.stop(),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError, "failures are reported together");
      assert.match(String(error.errors[0]), new RegExp(DISPOSE_FAILURE));
      return true;
    },
  );
  assert.ok(
    healthy.disposed(),
    "the second session's runtime is disposed despite the first one's failure",
  );

  // The endpoint is closed even though the disposal failed.
  await assert.rejects(
    new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
      socket.once("open", () => {
        socket.close();
        resolve();
      });
      socket.once("error", reject);
    }),
  );
});

test("CORE-41: shutdown drains an opening that already owns a session lease", async () => {
  let entered!: () => void;
  const initializing = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const events: string[] = [];
  const captain = createScriptedCaptain(async () => { events.push("turn"); });
  const harness = await startHarness([{
    ...captain,
    async init(session) {
      await captain.init?.(session);
      entered();
      await gate;
    },
    async dispose() {
      events.push("disposed");
      await captain.dispose?.();
    },
  }]);
  const client = new Client(harness.service.port());
  await client.open();
  const project = await client.expectOk("project.register", { path: harness.projectDirs[0] as string });
  const other = await client.expectOk("project.register", { path: harness.projectDirs[1] as string });
  const manager = harness.service["sessions"];
  // Retain the real opening promise solely to finish the failed-before
  // reproduction's cleanup; the request still enters through WebSocket.
  const create = manager.createSession.bind(manager);
  let opening: ReturnType<typeof create> | undefined;
  let sessionId: string | undefined;
  manager.createSession = (...args) => {
    opening = create(...args);
    return opening;
  };
  const store = harness.service["store"];
  const sessionStore = store.sessionStore(project.id);
  const acquire = sessionStore.acquire.bind(sessionStore);
  const getSessionStore = store.sessionStore.bind(store);
  store.sessionStore = (projectId) => projectId === project.id ? { ...sessionStore, acquire: async (id) => {
    sessionId = id;
    return acquire(id);
  } } : getSessionStore(projectId);
  const close = store.close.bind(store);
  store.close = () => { events.push("store-closed"); close(); };
  let composed!: () => void;
  const composing = new Promise<void>((resolve) => { composed = resolve; });
  let releaseConfig!: () => void;
  const configGate = new Promise<void>((resolve) => { releaseConfig = resolve; });
  const compose = harness.service["composedFor"].bind(harness.service);
  harness.service["composedFor"] = async (id) => {
    const result = await compose(id);
    if (id === other.id) { composed(); await configGate; }
    return result;
  };
  let stopped: Promise<void> | undefined;
  let waitingForConfig: ReturnType<Client["command"]> | undefined;
  let stoppedWhileHeld = false;
  try {
    client.send("session.create", { projectId: project.id });
    await initializing;
    assert.ok(sessionId);
    assert.equal(await sessionStore.readLeaseState(sessionId), "active", "the real shared lease is held before initialization completes");
    waitingForConfig = client.command("session.create", { projectId: other.id });
    await composing;
    stopped = harness.service.stop();
    releaseConfig();
    const overtaken = await waitingForConfig;
    assert.equal(overtaken.ok, false);
    assert.equal(overtaken.ok ? undefined : overtaken.error.code, "busy", "a request still composing cannot acquire a host after shutdown");
    const late = await client.command("session.create", { projectId: other.id });
    assert.equal(late.ok, false);
    assert.equal(late.ok ? undefined : late.error.code, "busy", "shutdown refuses new session admission");
    stoppedWhileHeld = await Promise.race([
      stopped.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
  } finally {
    releaseConfig();
    release();
    await waitingForConfig;
    await opening?.catch(() => {});
    await stopped;
    client.close();
    // The uncorrected core may publish the runtime after stop returned.
    // Dispose that owned fixture too; never leave the reproduction's lease.
    await manager.disposeAll();
  }
  assert.equal(stoppedWhileHeld, false, "shutdown returned while an acquired session was still opening");
  assert.ok(events.indexOf("disposed") >= 0 && events.indexOf("disposed") < events.indexOf("store-closed"), "runtime disposal precedes store closure");
  assert.equal(events.includes("turn"), false, "creation and shutdown start no Boss turn");
  assert.equal(await sessionStore.readLeaseState(sessionId!), "idle");
});

test("CORE-41: a continuation opening during shutdown cannot start its requested turn", async () => {
  let entered!: () => void;
  const initializing = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let turns = 0;
  let disposed = false;
  const captain = createScriptedCaptain(async () => { turns += 1; });
  const harness = await startHarness([healthyCaptain().captain, {
    ...captain,
    async init(session) { await captain.init?.(session); entered(); await gate; },
    async dispose() { disposed = true; await captain.dispose?.(); },
  }]);
  const client = new Client(harness.service.port());
  await client.open();
  const project = await client.expectOk("project.register", { path: harness.projectDirs[0] as string });
  const session = await client.expectOk("session.create", { projectId: project.id });
  await client.expectOk("session.dispose", { sessionId: session.id });
  const manager = harness.service["sessions"];
  const proceed = manager.continueSession.bind(manager);
  let opening: ReturnType<typeof proceed> | undefined;
  manager.continueSession = (...args) => { opening = proceed(...args); return opening; };
  const shared = harness.service["store"].sessionStore(project.id);
  let stopped: Promise<void> | undefined;
  try {
    client.send("turn.submit", { sessionId: session.id, text: "must not run during shutdown" });
    await initializing;
    assert.equal(await shared.readLeaseState(session.id), "active");
    stopped = harness.service.stop();
    const late = await client.command("turn.submit", { sessionId: session.id, text: "nor this turn" });
    assert.equal(late.ok, false);
    assert.equal(late.ok ? undefined : late.error.code, "busy");
  } finally {
    release();
    await opening?.catch(() => {});
    await stopped;
    client.close();
    await manager.disposeAll();
  }
  assert.equal(disposed, true);
  assert.equal(turns, 0);
  assert.equal(await shared.readLeaseState(session.id), "idle");
  assert.ok((await shared.readStream(session.id)).entries.every(({record}) => record.type !== "turn_started"));
});

for (const failure of ["initialization", "aggregate initialization", "prepare", "disposal", "both", "both before shutdown"] as const) test(failure === "initialization"
  ? "CORE-41: an opening initialization error with clean disposal does not fail shutdown"
  : failure === "aggregate initialization"
    ? "CORE-41: an ambiguous aggregate construction error leaves cleanup unconfirmed"
  : failure === "prepare"
    ? "CORE-41: a pre-close hook failure is observed while remaining cleanup is attempted"
  : failure === "disposal"
    ? "CORE-41: an opening cleanup failure is reported without skipping an existing runtime"
    : failure === "both"
      ? "CORE-41: failed initialization and disposal retain the unpublished session reservation"
      : "CORE-41: shutdown retains cleanup failure that settled before shutdown began", async () => {
  const cleanupFails = failure === "disposal" || failure === "both" || failure === "both before shutdown";
  const cleanupUnconfirmed = failure !== "initialization";
  const expectedFailure = cleanupFails ? DISPOSE_FAILURE : failure === "prepare" ? PREPARE_FAILURE : "fixture initialization failed";
  let entered!: () => void;
  const initializing = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const healthy = healthyCaptain();
  const initializingCaptain = cleanupFails ? brokenCaptain() : healthyCaptain().captain;
  let prepareCalled = false;
  let disposeCalled = false;
  const harness = await startHarness([healthy.captain, {
    ...initializingCaptain,
    async init(session) {
      await initializingCaptain.init?.(session);
      entered();
      await gate;
      if (failure === "aggregate initialization") throw new AggregateError([new Error("fixture initialization failed")], "fixture initialization failed");
      if (failure !== "disposal" && failure !== "prepare") throw new Error("fixture initialization failed");
    },
    async prepareDispose() {
      prepareCalled = true;
      if (failure === "prepare") throw new Error(PREPARE_FAILURE);
      await initializingCaptain.prepareDispose?.();
    },
    async dispose() { disposeCalled = true; await initializingCaptain.dispose?.(); },
  }]);
  const client = new Client(harness.service.port());
  await client.open();
  const first = await client.expectOk("project.register", { path: harness.projectDirs[0] as string });
  const second = await client.expectOk("project.register", { path: harness.projectDirs[1] as string });
  await client.expectOk("session.create", { projectId: first.id });
  const store = harness.service["store"];
  const shared = store.sessionStore(second.id);
  const acquire = shared.acquire.bind(shared);
  const original = store.sessionStore.bind(store);
  let lease: Awaited<ReturnType<typeof acquire>> | undefined;
  store.sessionStore = (id) => id === second.id ? { ...shared, acquire: async (sessionId) => {
    lease = await acquire(sessionId);
    return lease;
  } } : original(id);
  const manager = harness.service["sessions"];
  const create = manager.createSession.bind(manager);
  let opening: ReturnType<typeof create> | undefined;
  manager.createSession = (...args) => { opening = create(...args); return opening; };
  let stopped: Promise<void> | undefined;
  try {
    client.send("session.create", { projectId: second.id });
    await initializing;
    assert.ok(lease);
    if (failure !== "both before shutdown") stopped = harness.service.stop();
    release();
    await assert.rejects(opening!, new RegExp(expectedFailure));
    stopped ??= harness.service.stop();
    if (cleanupUnconfirmed) {
      await assert.rejects(stopped, (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.message, "session cleanup was not confirmed");
        assert.match(String(error.errors[0]), new RegExp(expectedFailure));
        return true;
      });
    } else await stopped;
    assert.equal(healthy.disposed(), true);
    assert.equal(prepareCalled, true);
    assert.equal(disposeCalled, true, "a pre-close failure does not skip the final disposal hook");
    assert.equal(store["localSessions"].has(lease.sessionId), cleanupUnconfirmed, "unconfirmed cleanup retains the local reservation even if no controller was returned");
    assert.equal(manager["opening"].has(second.id), cleanupUnconfirmed, "an unpublished host with unconfirmed cleanup still reserves its project");
    // The shared constructor releases its lease when its inner host fails
    // before returning. That does not establish that failed disposal stopped
    // the host, and must not make Spex release its own reservation.
    assert.equal(await shared.readLeaseState(lease.sessionId), failure === "disposal" || failure === "prepare" ? "active" : "idle");
  } finally {
    release();
    await opening?.catch(() => {});
    await stopped?.catch(() => {});
    client.close();
    // Only this still-held broken fixture lease is released after assertion.
    if (failure === "disposal" || failure === "prepare") await lease?.release();
  }
});

/** An agent that ignores SIGTERM and holds a child of its own that
 * ignores it too, each logging the SIGTERM it receives. Run as
 * `node agent.cjs <log> agent`; it prints its child's pid once that
 * child is listening for SIGTERM. */
const STUBBORN_AGENT = `
const { spawn } = require("node:child_process");
const { appendFileSync } = require("node:fs");
const [log, role] = process.argv.slice(2);
process.on("SIGTERM", () => appendFileSync(log, role + " SIGTERM " + Date.now() + "\\n"));
setInterval(() => {}, 1000);
if (role === "agent") {
  const child = spawn(process.execPath, [__filename, log, "child"], { stdio: ["ignore", "pipe", "ignore"] });
  child.stdout.once("data", () => process.stdout.write(child.pid + "\\n"));
} else {
  process.stdout.write("ready\\n");
}
`;

interface StubbornAgent {
  agent: ChildProcess;
  child: number;
}

/** A Captain whose turn starts the stubborn agent. A wedged one then
 * waits on it the way a stuck adapter does — no abort reaches it, so
 * the turn never settles and only the stop's bound ends it; otherwise
 * the turn ends at the abort, leaving the agent running. */
function stubbornCaptain(script: string, log: string, wedged: boolean): { captain: Captain; started: Promise<StubbornAgent> } {
  let started!: (agent: StubbornAgent) => void;
  const running = new Promise<StubbornAgent>((resolve) => { started = resolve; });
  const captain = createScriptedCaptain(async (_turn, context) => {
    const agent = spawn(process.execPath, [script, log, "agent"], { stdio: ["ignore", "pipe", "ignore"] });
    const child = await new Promise<number>((resolve, reject) => {
      agent.stdout?.once("data", (data: Buffer) => resolve(Number(String(data).trim())));
      agent.once("error", reject);
    });
    started({ agent, child });
    if (wedged) await new Promise<never>(() => {});
    await new Promise<void>((resolve) => {
      if (context.signal.aborted) resolve();
      else context.signal.addEventListener("abort", () => resolve(), { once: true });
    });
  });
  return { captain, started: running };
}

/** The roles that logged a SIGTERM, each with when it arrived. */
function sigterms(log: string): Map<string, number> {
  return new Map(readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => {
    const [role, , at] = line.split(" ");
    return [role as string, Number(at)];
  }));
}

/** A core over a fresh home whose one session's turn starts the
 * stubborn agent, with the stop's bounds shortened through the seams
 * and its real walk of the processes it started recorded; beside it, a
 * bystander this process started, as a host's own child, ignoring
 * SIGTERM the same way. */
async function stubbornTurn(t: TestContext, wedged: boolean, stop: { settleMs: number; killMs: number }) {
  const fixture = scratchDir("spex-stubborn-agent-");
  const script = join(fixture, "agent.cjs");
  writeFileSync(script, STUBBORN_AGENT);
  const log = join(fixture, "signals.log");
  writeFileSync(log, "");
  const stubborn = stubbornCaptain(script, log, wedged);
  const harness = await startHarness([stubborn.captain], { stop });
  const walks: number[][] = [];
  const started = harness.service["startedProcesses"];
  const walk = started.pids.bind(started);
  started.pids = async () => {
    const pids = await walk();
    walks.push(pids);
    return pids;
  };
  const bystander = spawn(process.execPath, [script, log, "bystander"], { stdio: ["ignore", "pipe", "ignore"] });
  t.after(() => {
    if (processAlive(bystander.pid as number)) bystander.kill("SIGKILL");
  });
  await new Promise<void>((resolve, reject) => {
    bystander.stdout?.once("data", () => resolve());
    bystander.once("error", reject);
  });
  const client = new Client(harness.service.port());
  await client.open();
  const workingFolder = harness.projectDirs[0] as string;
  const project = await client.expectOk("project.register", { path: workingFolder });
  const session = await client.expectOk("session.create", { projectId: project.id });
  await client.expectOk("turn.submit", { sessionId: session.id, text: "start the stubborn agent" });
  const { agent, child } = await stubborn.started;
  const killed = new Promise<{ signal: NodeJS.Signals | null; at: number }>((resolve) => {
    agent.once("exit", (_code, signal) => resolve({ signal, at: Date.now() }));
  });
  // A failed assertion leaves no fixture process behind.
  t.after(() => {
    for (const pid of [agent.pid as number, child]) if (processAlive(pid)) process.kill(pid, "SIGKILL");
  });
  client.close();
  return { harness, log, walks, workingFolder, session, agent, child, killed, bystander };
}

/** Every path under `dir` with its size and modification time. */
function snapshot(dir: string): string[] {
  const entries: string[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      const stats = statSync(full);
      entries.push(`${relative(dir, full)} ${stats.size} ${stats.mtimeMs}`);
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
  return entries.sort();
}

async function gone(pid: number, withinMs: number): Promise<boolean> {
  const deadline = Date.now() + withinMs;
  while (processAlive(pid)) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}

test("CORE-41: a stop bounded by its seams kills an agent ignoring SIGTERM and leaves its turn uncertain", { timeout: 60_000 }, async (t) => {
  const SETTLE_MS = 1_000;
  const KILL_MS = 1_000;
  const { harness, log, walks, workingFolder, session, agent, child, killed, bystander } =
    await stubbornTurn(t, true, { settleMs: SETTLE_MS, killMs: KILL_MS });
  const before = snapshot(workingFolder);

  const began = Date.now();
  await assert.rejects(harness.service.stop(), (error: unknown) => {
    assert.ok(error instanceof AggregateError, "the unconfirmed disposal is reported to the host");
    assert.equal(error.message, "session cleanup was not confirmed");
    assert.ok(
      error.errors.some((cause) => String(cause).includes(`session ${session.id} cleanup was not confirmed within the stop's bounds`)),
      String(error.errors),
    );
    return true;
  });
  const returned = Date.now();

  // The turn never settled, so SIGTERM waited out the first bound and
  // reached the agent and its child; SIGKILL followed at the second.
  const terms = sigterms(log);
  const agentTerm = terms.get("agent");
  assert.ok(agentTerm !== undefined, "the agent received SIGTERM");
  assert.ok(terms.has("child"), "the agent's own child received SIGTERM");
  assert.ok(agentTerm >= began + SETTLE_MS, `SIGTERM ${agentTerm - began} ms after the stop began`);
  const exit = await killed;
  assert.equal(exit.signal, "SIGKILL");
  assert.ok(exit.at >= agentTerm + KILL_MS - 50, `SIGKILL ${exit.at - agentTerm} ms after SIGTERM`);
  assert.ok(returned - began < SETTLE_MS + KILL_MS + 5_000, `the stop returned ${returned - began} ms after it began`);
  assert.ok(walks.some((pids) => pids.includes(agent.pid as number) && pids.includes(child)), "the walk found the agent and its child");
  assert.ok(await gone(child, 5_000), "the agent's child is gone");
  // Only the processes the core started are signalled: a host's own
  // child beside the core receives nothing.
  assert.ok(walks.every((pids) => !pids.includes(bystander.pid as number)), "the walk left the host's process out");
  assert.equal(sigterms(log).has("bystander"), false, "the host's process received no SIGTERM");
  assert.ok(processAlive(bystander.pid as number), "the host's process still runs");

  // The stop wrote nothing into the working folder and reverted nothing.
  assert.deepEqual(snapshot(workingFolder), before);

  // The home's next core reads the cut turn as uncertain, for Restore.
  const next = await CoreService.start({ ...harness.options, captainFactory: undefined, stop: undefined, agentProcesses: undefined });
  try {
    const reader = new Client(next.port());
    await reader.open();
    try {
      const listed = (await reader.expectOk("session.list", {})).find((entry) => entry.id === session.id);
      assert.equal(listed?.recovery?.state, "uncertain");
      assert.equal(listed?.externalWriter, undefined, "the stop released the session's lease");
    } finally {
      reader.close();
    }
  } finally {
    await next.stop();
  }
});

test("CORE-41: once the turns settle, an agent left alive receives SIGTERM at once and SIGKILL at the second bound", { timeout: 60_000 }, async (t) => {
  // A first bound the stop never reaches: only the settled turn can
  // have begun the signals.
  const SETTLE_MS = 30_000;
  const KILL_MS = 1_000;
  const { harness, log, walks, workingFolder, agent, child, killed, bystander } =
    await stubbornTurn(t, false, { settleMs: SETTLE_MS, killMs: KILL_MS });
  const before = snapshot(workingFolder);

  const began = Date.now();
  // The turn settled at its abort and its runtime was released, so the
  // disposal is confirmed.
  await harness.service.stop();
  const returned = Date.now();

  const terms = sigterms(log);
  const agentTerm = terms.get("agent");
  assert.ok(agentTerm !== undefined, "the agent received SIGTERM");
  assert.ok(terms.has("child"), "the agent's own child received SIGTERM");
  assert.ok(agentTerm < began + SETTLE_MS / 3, `SIGTERM ${agentTerm - began} ms after the stop began`);
  const exit = await killed;
  assert.equal(exit.signal, "SIGKILL");
  assert.ok(exit.at >= agentTerm + KILL_MS - 50, `SIGKILL ${exit.at - agentTerm} ms after SIGTERM`);
  assert.ok(returned >= agentTerm + KILL_MS - 50, "the stop waited for the agent SIGTERM reached");
  assert.ok(walks.some((pids) => pids.includes(agent.pid as number) && pids.includes(child)), "the walk found the agent and its child");
  assert.ok(await gone(child, 5_000), "the agent's child is gone");
  // Only the processes the core started are signalled: a host's own
  // child beside the core receives nothing.
  assert.ok(walks.every((pids) => !pids.includes(bystander.pid as number)), "the walk left the host's process out");
  assert.equal(sigterms(log).has("bystander"), false, "the host's process received no SIGTERM");
  assert.ok(processAlive(bystander.pid as number), "the host's process still runs");
  assert.deepEqual(snapshot(workingFolder), before);
});

async function releaseFixtureLeases(service: CoreService): Promise<void> {
  // The intentionally broken captains above have no external work. After
  // ownership assertions, close their retained file handles explicitly;
  // production must keep refusing admission after unproven disposal.
  const manager = service["sessions"];
  for (const session of manager.listSessions()) await manager.getLive(session.id)?.controller.lease.release();
}

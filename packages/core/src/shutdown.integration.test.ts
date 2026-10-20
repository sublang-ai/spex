// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Disposal-failure coverage (CORE-40/41): unproven runtime cleanup
// keeps project admission closed (DR-048), while shutdown still
// attempts every runtime and closes the endpoint (CORE-39).
//
// The failure is real rather than stubbed: the captain's dispose
// rejects, and cligent's own runtime disposal surfaces it, so the
// path under test is the one a broken SDK teardown takes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";

import { CoreService } from "./service.js";
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
}

/** Start a core whose captains are handed out in creation order. */
async function startHarness(captains: Captain[]): Promise<Harness> {
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
  const service = await CoreService.start({
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
  });
  return { service, projectDirs };
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


async function releaseFixtureLeases(service: CoreService): Promise<void> {
  // The intentionally broken captains above have no external work. After
  // ownership assertions, close their retained file handles explicitly;
  // production must keep refusing admission after unproven disposal.
  const manager = service["sessions"];
  for (const session of manager.listSessions()) await manager.getLive(session.id)?.controller.lease.release();
}

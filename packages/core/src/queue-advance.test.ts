// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Queue advancement executes the real core lifecycle and protocol; only
// provider replies and the Captain's root-run outcome are scripted.
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { createSessionStore } from "@sublang/playbook/session-store";
import { CoreService } from "./service.js";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createScriptedCaptain, type CaptainTurnScript } from "./testing/scripted-captain.js";
import type { Command, CommandResults, IntentInfo, LedgerState, ServerMessage, TmuxPlayRecord } from "./protocol.js";

const VALID_CONFIG = `
captain:
  adapter: claude
  model: claude-test
players:
  dev_coder:
    adapter: claude
    model: claude-test
playbooks:
  code:
    roles:
      coder: dev_coder
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Client {
  private readonly socket: WebSocket;
  readonly messages: ServerMessage[] = [];
  private nextId = 0;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/?token=test`);
    this.socket.on("message", (data) => {
      this.messages.push(JSON.parse(String(data)) as ServerMessage);
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    await this.waitFor((m) => m.type === "hello");
  }

  close(): void {
    this.socket.close();
  }

  private lastCaptured = 0;

  /** `intent.queue` a moment after the previous capture: the queue is
   * ordered by capture time (core-service-42), so no two captures here
   * share a millisecond and the order is the order queued. */
  async queue(
    fields: Omit<Extract<Command, { type: "intent.queue" }>, "type" | "id">,
  ): Promise<IntentInfo> {
    while (Date.now() <= this.lastCaptured) await sleep(1);
    const intent = await this.expectOk("intent.queue", fields);
    this.lastCaptured = intent.createdAt;
    return intent;
  }

  async command<T extends Command["type"]>(
    type: T,
    fields: Omit<Extract<Command, { type: T }>, "type" | "id">,
  ): Promise<
    | { ok: true; result: CommandResults[T] }
    | { ok: false; error: { code: string; message: string } }
  > {
    const id = `c${(this.nextId += 1)}`;
    this.socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await this.waitFor(
      (m) => m.type === "reply" && m.id === id,
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

  /** The count-th message satisfying the check, appearing or already seen. */
  async waitFor(
    check: (message: ServerMessage) => boolean,
    count = 1,
    timeoutMs = 10000,
  ): Promise<ServerMessage> {
    const start = Date.now();
    for (;;) {
      const found = this.messages.filter(check);
      if (found.length >= count) return found[count - 1];
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `timeout waiting; got ${JSON.stringify(this.messages.map((m) => m.type))}`,
        );
      }
      await sleep(10);
    }
  }

  /** Poll ledger.get until the fold satisfies the check — session
   * bookkeeping (the turnActive flag) settles just after the final
   * record lands. */
  async ledgerUntil(
    check: (ledger: LedgerState) => boolean,
    label: string,
    timeoutMs = 10000,
  ): Promise<LedgerState> {
    const start = Date.now();
    for (;;) {
      const ledger = await this.expectOk("ledger.get", {});
      if (check(ledger)) return ledger;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`timeout waiting for ${label}; ledger=${JSON.stringify(ledger)}`);
      }
      await sleep(25);
    }
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function harness(t: TestContext, script: CaptainTurnScript) {
  const dir = mkdtempSync(join(tmpdir(), "spex-advance-"));
  const configPath = join(dir, "playbook.config.yaml");
  writeFileSync(configPath, VALID_CONFIG);
  const projectDir = join(dir, "project");
  mkdirSync(projectDir);
  execFileSync("git", ["init", "-q", projectDir]);
  const options = {
    token: "test", configPath, dataDir: join(dir, "state"),
    adapterImports: fakeAdapterImports({}).imports,
    adapterRuntime: () => ({ usable: true }),
    captainFactory: async () => createScriptedCaptain(script),
    env: {}, home: join(dir, "home"), own: "tester", watchConfig: false,
  };
  const beforeStop: (() => void)[] = [];
  let service = await CoreService.start(options);
  let client = new Client(service.port());
  t.after(async () => {
    for (const cleanup of beforeStop) cleanup();
    client.close();
    await service.stop();
    rmSync(dir, { recursive: true, force: true });
  });
  await client.open();
  const project = await client.expectOk("project.register", { path: projectDir });
  const session = await client.expectOk("session.create", { projectId: project.id });
  await client.expectOk("subscribe", { channel: { kind: "session", sessionId: session.id } });
  return {
    get client() { return client; }, get service() { return service; },
    project, session, dir, beforeStop,
    async restart() {
      client.close();
      await service.stop();
      service = await CoreService.start(options);
      client = new Client(service.port());
      await client.open();
    },
  };
}

type Harness = Awaited<ReturnType<typeof harness>>;

async function settled(h: Harness, turns = 1): Promise<void> {
  await h.client.waitFor((message) => message.type === "session.state" &&
    message.session.id === h.session.id && message.session.turns === turns &&
    message.session.turnActive === false && !message.session.live);
  await h.service["sessions"].settled(h.session.id);
  await Promise.all([...h.service["advancing"]]);
  await h.client.expectOk("ledger.get", {});
}

async function terminal(
  session: Parameters<CaptainTurnScript>[2],
  kind = "success",
  depth = 0,
  playbookId = "code",
  options: { schemaVersion?: unknown; stateId?: string } = {},
): Promise<void> {
  const stateId = options.stateId ?? "done";
  await session.emitTelemetry({
    topic: "playbook.trace",
    payload: {
      schemaVersion: Object.hasOwn(options, "schemaVersion") ? options.schemaVersion : 4,
      sequence: 1, timestamp: Date.now(),
      type: "boss.input.settled", playbookId, depth,
      sessionId: depth ? "nested-review" : "root-code", rootSessionId: "root-code",
      payload: {
        outcome: "terminal", stateId, terminal: { kind, stateId },
        state: { value: stateId, activeStateIds: [stateId], tags: [], status: "done", quiescent: true, stateId },
      },
    },
  });
}

async function transition(
  session: Parameters<CaptainTurnScript>[2],
  runId: string,
  from: string,
  to: string,
  sequence = 1,
): Promise<void> {
  await session.emitTelemetry({
    topic: "playbook.trace",
    payload: {
      schemaVersion: 4,
      sequence,
      timestamp: Date.now(),
      type: "fsm.transition",
      playbookId: "code",
      depth: 0,
      sessionId: runId,
      rootSessionId: runId,
      payload: { from, to },
    },
  });
  await session.emitTelemetry({
    topic: "playbook.fsm.state",
    payload: { from, to },
  });
}

function entry(ledger: LedgerState, id: string) {
  const found = ledger.intents.find((row) => row.intent.id === id);
  assert.ok(found, `missing intent ${id}`);
  return found;
}

function starts(client: Client) {
  return client.messages.filter((message) => message.type === "record" && message.record.type === "turn_started");
}

function expectNext(
  ledger: LedgerState,
  id: string,
  standing: NonNullable<ReturnType<typeof entry>["next"]>["standing"],
  manualStart: boolean,
) {
  const row = entry(ledger, id);
  assert.equal(row.next?.standing, standing);
  assert.equal(row.next?.manualStart, manualStart);
  return row;
}

/** An abort Playbook settled at its saved progress (core-service-6,
 * DR-088): the conversation continues, owes no recovery, and stays the
 * project's lane (core-service-93). */
function expectStoppedLane(h: Harness, sessions: CommandResults["session.list"]) {
  const row = sessions.find((candidate) => candidate.id === h.session.id);
  assert.equal(row?.recovery, undefined);
  assert.equal(row?.continuable, true, row?.continuationReason ?? "no reason given");
  assert.deepEqual(
    h.service["sessions"].listLanes().filter((lane) => lane.projectId === h.project.id).map((lane) => lane.sessionId),
    [h.session.id],
  );
}

for (const mode of ["automatic", "manual race", "done during settlement", "drop during settlement"] as const) {
  test(`queue advance: settlement gates ${mode}`, { timeout: 20_000 }, async (t) => {
    const prompts: string[] = [];
    const h = await harness(t, async (turn, context) => {
      prompts.push(turn.prompt);
      await context.emitReply("Done");
    });
    const { client, project, session } = h;
    const first = await client.queue({ projectId: project.id, text: "First work" });
    // In the automatic case the row that is next at dispatch is let go,
    // and its successor captured, while the turn is active.
    const displaced = mode === "automatic"
      ? await client.queue({ projectId: project.id, text: "Previously next" }) : undefined;
    let next: IntentInfo | undefined = displaced
      ? undefined
      : await client.queue({ projectId: project.id, text: "Next work\nwith all details" });
    const otherDir = join(h.dir, "other");
    mkdirSync(otherDir);
    execFileSync("git", ["init", "-q", otherDir]);
    const other = await client.expectOk("project.register", { path: otherDir });
    const foreign = await client.queue({ projectId: other.id, text: "Other project" });

    const store = h.service["store"];
    const sessions = h.service["sessions"];
    const refresh = store.refreshSession.bind(store);
    const reached = deferred();
    const release = deferred();
    h.beforeStop.push(() => { release.resolve(); store.refreshSession = refresh; });
    store.refreshSession = async (id, live) => {
      if (id === session.id && live === false && !sessions.getLive(id)) {
        store.refreshSession = refresh;
        reached.resolve();
        await release.promise;
      }
      return refresh(id, live);
    };
    await client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
    await reached.promise;
    assert.equal(sessions.getLive(session.id), undefined, "runtime disposal alone must not advance");
    // The release/selection seam is still occupied. The ledger must not
    // expose a manual Start while the one automatic handoff is pending.
    expectNext(await client.expectOk("ledger.get", {}), displaced?.id ?? next!.id, "after-current-work", false);
    await client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-tuned" } } });
    let nextText = next?.text ?? "";
    if (mode === "automatic") {
      // A permission record is telemetry, not a queue hold. Append it only
      // after the runtime stream is complete so its sequence cannot race it.
      store.appendRecord(session.id, store.maxSeq(session.id) + 1, {
        type: "player_event",
        playerId: "dev_coder",
        event: { type: "permission_request" },
        turnId: 1,
        timestamp: Date.now(),
      } as unknown as TmuxPlayRecord, "coder");
      // Queue changes during the active turn decide the selection: the
      // older row is let go, and work captured now is the oldest left,
      // its latest text the one that runs (core-service-95).
      await client.expectOk("intent.close", { intentId: displaced!.id, as: "dropped" });
      next = await client.queue({ projectId: project.id, text: "Next work\nwith all details" });
      nextText = "Revised queued work\nwith the latest details";
      await client.expectOk("intent.edit", { intentId: next.id, text: nextText });
    }
    const queued = next!;
    const before = await client.expectOk("ledger.get", {});
    expectNext(before, queued.id, "after-current-work", false);
    assert.equal(entry(before, queued.id).intent.dispatched, undefined);
    assert.deepEqual(prompts, [first.text]);

    if (mode === "done during settlement" || mode === "drop during settlement") {
      await client.expectOk("intent.close", {
        intentId: first.id,
        as: mode === "done during settlement" ? "done" : "dropped",
      });
    }
    let pending: ReturnType<Client["command"]> | undefined;
    if (mode === "manual race") {
      const entering = deferred();
      const wait = sessions.settled.bind(sessions);
      sessions.settled = async (id) => { entering.resolve(); await wait(id); };
      h.beforeStop.push(() => { sessions.settled = wait; });
      pending = client.command("turn.submit", { sessionId: session.id, text: queued.text, intentId: queued.id });
      await entering.promise;
    }
    release.resolve();
    if (pending) {
      const reply = await pending;
      assert.ok(reply.ok || ["busy", "conflict"].includes(reply.error.code), JSON.stringify(reply));
    }
    const after = await client.ledgerUntil((ledger) => entry(ledger, queued.id).state === "finished", "the next intent to finish");
    await settled(h, 2);
    assert.deepEqual(prompts, [first.text, nextText], "the latest queued text and age select exactly one dispatch");
    // Let go before any work, the displaced row left no trace to dispatch.
    if (displaced) assert.equal(h.service["store"].getIntent(displaced.id), undefined);
    assert.equal(starts(client).length, 2);
    assert.equal(entry(after, queued.id).intent.dispatched?.sessionId, session.id);
    assert.equal(entry(after, queued.id).intent.dispatched?.turnId, 2);
    assert.equal(typeof entry(after, queued.id).intent.dispatched?.at, "number");
    if (mode === "done during settlement" || mode === "drop during settlement") {
      const history = await client.expectOk("ledger.history", { projectId: project.id });
      assert.ok(history.intents.some((row) => row.intent.id === first.id &&
        row.intent.closedAs === (mode === "done during settlement" ? "done" : "dropped")));
    } else {
      assert.equal(entry(after, first.id).state, "finished");
      assert.equal(entry(after, first.id).intent.closedAt, undefined);
      assert.ok(after.attention.some((row) => row.intentId === first.id && row.band === "finished" && row.turnId === 1));
    }
    // Another project's queue is never this conversation's successor.
    assert.equal(entry(after, foreign.id).intent.dispatched, undefined);
    const current = h.service["store"].listSessions().find((row) => row.id === session.id);
    assert.equal(current?.turns, 2);
    // The session context is emitted by normal continuation, not a separate
    // queue runner carrying the previous runtime's configuration.
    const contexts = h.service["store"].getRecords(session.id, { includeHidden: true }).flatMap(({ record }) =>
      (record as { type?: string }).type === "session_context"
        ? [record as unknown as { configuration: { captain: { model: { kind: string; value: string } } } }] : []);
    assert.deepEqual(contexts.at(-1)?.configuration.captain.model, { kind: "value", value: "claude-tuned" });
  });
}

test("queue advance: trace shapes and question prose add no completion gate", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context, session) => {
    prompts.push(turn.prompt);
    if (prompts.length === 1) {
      // Failed, child, non-terminal, and unsupported trace evidence are all
      // deliberately irrelevant when the actual turn settles cleanly.
      await terminal(session, "failure");
      await terminal(session, "success", 1, "review");
      await session.emitTelemetry({
        topic: "playbook.trace",
        payload: {
          schemaVersion: 5,
          sequence: 3,
          timestamp: Date.now(),
          type: "boss.input.settled",
          playbookId: "code",
          depth: 0,
          sessionId: "root-code",
          rootSessionId: "root-code",
          payload: {
            outcome: "quiescent",
            state: { value: "working", activeStateIds: ["working"], tags: [], status: "active", quiescent: true },
          },
        },
      });
    }
    await context.emitReply(prompts.length === 1 ? "Should we discuss one more detail?" : "Done");
  });
  const first = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "First intent" });
  const next = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "Next intent" });
  await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: first.text, intentId: first.id });
  const ledger = await h.client.ledgerUntil(
    (value) => entry(value, next.id).state === "finished",
    "trace-independent handoff",
  );
  await settled(h, 2);
  assert.equal(entry(ledger, next.id).intent.dispatched?.turnId, 2);
  assert.deepEqual(prompts, [first.text, next.text]);
  assert.equal(starts(h.client).length, 2);
});

test("queue advance: an unattributed lane turn holds Start but never hands off", { timeout: 20_000 }, async (t) => {
  const entered = deferred();
  const release = deferred();
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    entered.resolve();
    await release.promise;
    await context.emitReply("Ordinary chat");
  });
  h.beforeStop.push(release.resolve);
  const next = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "Queued work" });
  await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: "Talk first" });
  await entered.promise;
  expectNext(await h.client.expectOk("ledger.get", {}), next.id, "after-current-work", false);
  release.resolve();
  await settled(h);
  expectNext(await h.client.expectOk("ledger.get", {}), next.id, "manual-ready", true);
  assert.equal(entry(await h.client.expectOk("ledger.get", {}), next.id).intent.dispatched, undefined);
  assert.deepEqual(prompts, ["Talk first"]);
  assert.equal(starts(h.client).length, 1);
});

test("queue advance: a question park holds until the Boss answer settles", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context, session) => {
    prompts.push(turn.prompt);
    if (prompts.length === 1) {
      await transition(session, "question-run", "working", "awaitBossReply");
      await context.emitReply("Which target should I use?");
      return;
    }
    if (prompts.length === 2) {
      await transition(session, "question-run", "awaitBossReply", "working", 2);
    }
    await context.emitReply("Done");
  });
  const first = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "First intent" });
  const next = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "Next intent" });
  await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: first.text, intentId: first.id });
  await settled(h);
  expectNext(await h.client.expectOk("ledger.get", {}), next.id, "question-park", false);
  assert.deepEqual(prompts, [first.text]);

  await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: "Use the primary target" });
  const advanced = await h.client.ledgerUntil(
    (ledger) => entry(ledger, next.id).state === "finished",
    "the answered question to hand off",
  );
  await settled(h, 3);
  assert.equal(entry(advanced, next.id).intent.dispatched?.turnId, 3);
  assert.deepEqual(prompts, [first.text, "Use the primary target", next.text]);
});

for (const parked of [false, true] as const) {
  test(`queue advance: ${parked ? "parked" : "unparked"} failure holds until a clean recovery`, { timeout: 20_000 }, async (t) => {
    const prompts: string[] = [];
    const h = await harness(t, async (turn, context, session) => {
      prompts.push(turn.prompt);
      if (prompts.length === 1) {
        if (parked) await transition(session, "failure-run", "working", "failed");
        await context.emitReply("The work could not be completed");
        return;
      }
      if (parked && prompts.length === 2) {
        await transition(session, "failure-run", "failed", "working", 2);
      }
      await context.emitReply("Recovered cleanly");
    });
    const { client, project, session } = h;
    const first = await client.expectOk("intent.queue", { projectId: project.id, text: "First intent" });
    const next = await client.expectOk("intent.queue", { projectId: project.id, text: "Next intent" });

    // Add the runtime's failure at the settlement callback, after the
    // refreshed stream is authoritative but before the handoff decision.
    // This is the real gate case: a finished turn whose owner derives
    // Interrupted, not a thrown harness error that aborts the dispatch.
    const store = h.service["store"];
    const sessions = h.service["sessions"];
    const onTurnSettled = sessions.onTurnSettled;
    sessions.onTurnSettled = (...args) => {
      sessions.onTurnSettled = onTurnSettled;
      store.appendRecord(session.id, store.maxSeq(session.id) + 1, {
        type: "runtime_error",
        turnId: 1,
        timestamp: Date.now(),
        message: "The governed work failed",
        cause: { code: "commit-residual", evidence: { observed: "uncommitted-change" } },
      } as unknown as TmuxPlayRecord);
      onTurnSettled(...args);
    };
    h.beforeStop.push(() => { sessions.onTurnSettled = onTurnSettled; });
    await client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
    await settled(h);
    const held = parked
      ? await client.expectOk("ledger.get", {})
      : await client.ledgerUntil(
        (ledger) => entry(ledger, next.id).next?.standing === "failed",
        "the refused handoff to publish its failure standing",
      );
    expectNext(held, next.id, parked ? "failure-park" : "failed", !parked);
    assert.deepEqual(prompts, [first.text]);
    assert.equal(starts(client).length, 1);

    await client.expectOk("turn.submit", { sessionId: session.id, text: "Recover and continue" });
    const recovered = await client.ledgerUntil(
      (ledger) => entry(ledger, next.id).state === "finished",
      "the recovered work to hand off",
    );
    await settled(h, 3);
    assert.equal(entry(recovered, next.id).intent.dispatched?.turnId, 3);
    assert.deepEqual(prompts, [first.text, "Recover and continue", next.text]);
  });
}

test("queue advance: an aborted dispatch holds the queue at the stopped intent", { timeout: 20_000 }, async (t) => {
  const entered = deferred();
  const release = deferred();
  const prompts: string[] = [];
  const h = await harness(t, async (turn) => {
    prompts.push(turn.prompt);
    entered.resolve();
    await release.promise;
  });
  h.beforeStop.push(release.resolve);
  const first = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "First intent" });
  const next = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "Next intent" });
  await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: first.text, intentId: first.id });
  await entered.promise;
  await h.client.expectOk("turn.abort", { sessionId: h.session.id });
  release.resolve();
  await settled(h);
  expectNext(await h.client.expectOk("ledger.get", {}), first.id, "stopped", true);
  assert.equal(entry(await h.client.expectOk("ledger.get", {}), next.id).intent.dispatched, undefined);
  assert.deepEqual(prompts, [first.text]);
  expectStoppedLane(h, await h.client.expectOk("session.list", {}));
});

test("queue advance: a restore reports an interrupted follow-up and starts no successor", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    await context.emitReply("Done");
  });
  const { client, project, session } = h;
  const first = await client.queue({ projectId: project.id, text: "First intent" });
  await client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
  await settled(h);
  // Captured only after the first settlement, so only the later turn
  // could hand it on.
  const next = await client.queue({ projectId: project.id, text: "Next intent" });
  assert.equal(entry(await client.expectOk("ledger.get", {}), next.id).intent.dispatched, undefined);

  // A follow-up the writer lost after marking it: the released runtime
  // leaves the lease free, and the shared store — the project's clone's
  // sessions — says what a crash would.
  const shared = createSessionStore({ sessionsDir: h.service["store"].repository(project.id)!.sessionsDir });
  const lease = await shared.acquire(session.id);
  try {
    const prior = await lease.read();
    assert.ok(prior);
    await lease.beginTurn({ input: "Keep going", attemptId: randomUUID(), attemptedExecutionProjection: prior.lastAppliedExecutionProjection });
  } finally { await lease.release(); }
  await h.service["syncForeignSessions"]();
  await client.waitFor((message) => message.type === "session.state" && message.session.id === session.id && message.session.recovery?.input === "Keep going");

  const seen = client.messages.length;
  await client.expectOk("session.restore", { sessionId: session.id });
  await client.waitFor((message) => client.messages.indexOf(message) >= seen && message.type === "session.state" &&
    message.session.id === session.id && !message.session.recovery && !message.session.turnActive && !message.session.live);
  await h.service["sessions"].settled(session.id);
  await Promise.all([...h.service["advancing"]]);
  // The report settled, attributed to the open first intent, yet what
  // runs next is the Boss's choice (core-service-82, DR-088).
  const after = await client.expectOk("ledger.get", {});
  assert.equal(entry(after, next.id).intent.dispatched, undefined);
  // The report reads as the stop it accounts for (core-service-107).
  expectNext(after, next.id, "stopped", true);
  assert.ok(!prompts.includes(next.text), "the next intent never ran");
  assert.equal((await client.expectOk("session.list", {})).find((row) => row.id === session.id)?.continuable, true);
});

test("queue advance: a restore of an interrupted dispatch keeps its intent's standing and starts no successor", { timeout: 20_000 }, async (t) => {
  let turns = 0;
  const h = await harness(t, async () => {
    turns += 1;
    // The dispatch fails before its writer saved anything, leaving the
    // turn uncertain; the restore's own turn only reports.
    if (turns === 1) throw new Error("the writer stopped");
  });
  const { client, project, session } = h;
  const first = await client.expectOk("intent.queue", { projectId: project.id, text: "First intent" });
  const next = await client.expectOk("intent.queue", { projectId: project.id, text: "Next intent" });
  await client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
  await client.waitFor((message) => message.type === "session.state" && message.session.id === session.id &&
    message.session.recovery?.input === first.text && !message.session.turnActive && !message.session.live);
  await h.service["sessions"].settled(session.id);
  const before = await client.expectOk("ledger.get", {});
  const stamped = entry(before, first.id).intent.dispatched;
  assert.equal(stamped?.turnId, 1, "the dispatch was stamped when its turn started");
  // Until the restore, the lost attempt's failure is the lane's last word.
  expectNext(before, first.id, "failed", true);

  const seen = client.messages.length;
  await client.expectOk("session.restore", { sessionId: session.id });
  await client.waitFor((message) => client.messages.indexOf(message) >= seen && message.type === "session.state" &&
    message.session.id === session.id && !message.session.recovery && !message.session.turnActive && !message.session.live);
  await h.service["sessions"].settled(session.id);
  await Promise.all([...h.service["advancing"]]);
  // The report is the account of a stop, not of delivered work: the
  // intent keeps the standing its stopped dispatch gave it — released,
  // its stamps kept (dashboard-34) — and nothing runs next
  // (core-service-82).
  const after = await client.expectOk("ledger.get", {});
  assert.equal(entry(before, first.id).state, "queued");
  assert.equal(entry(after, first.id).state, "queued", "a restore's report finishes nothing");
  assert.deepEqual(entry(after, first.id).intent.dispatched, stamped, "the dispatch stamps stand as history");
  // The report reuses the lost attempt's turn id, yet that attempt's
  // failure is not the report's: the lane reads the stop the report
  // accounts for (core-service-107).
  expectNext(after, first.id, "stopped", true);
  assert.equal(entry(after, next.id).intent.dispatched, undefined);
  assert.ok(!after.attention.some((row) => row.band === "finished"), "no finish or review is raised");
  assert.equal(starts(client).length, 2, "the dispatch and the restore's report, and nothing after");
});

test("queue advance: an aborted follow-up cannot inherit an older finish", { timeout: 20_000 }, async (t) => {
  const entered = deferred();
  const release = deferred();
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    if (prompts.length === 1) {
      await context.emitReply("Initial delivery");
      return;
    }
    entered.resolve();
    await release.promise;
  });
  h.beforeStop.push(release.resolve);
  const first = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "First intent" });
  await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: first.text, intentId: first.id });
  await settled(h);
  const next = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "Next intent" });
  await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: "One more change" });
  await entered.promise;
  await h.client.expectOk("turn.abort", { sessionId: h.session.id });
  release.resolve();
  await settled(h, 2);
  const after = await h.client.expectOk("ledger.get", {});
  assert.equal(entry(after, first.id).state, "finished", "the older delivery still stands");
  expectNext(after, next.id, "stopped", true);
  assert.equal(entry(after, next.id).intent.dispatched, undefined);
  assert.deepEqual(prompts, [first.text, "One more change"]);
  expectStoppedLane(h, await h.client.expectOk("session.list", {}));
});

for (const verdict of ["done", "dropped"] as const) {
  test(`queue advance: ${verdict} after settlement and a later removal do not dispatch`, { timeout: 20_000 }, async (t) => {
    const prompts: string[] = [];
    const h = await harness(t, async (turn, context) => {
      prompts.push(turn.prompt);
      await context.emitReply("Done");
    });
    const first = await h.client.queue({ projectId: h.project.id, text: "First intent" });
    await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: first.text, intentId: first.id });
    await settled(h);
    // Captured after the settlement, so no handoff ever selected it.
    const waiting = await h.client.queue({ projectId: h.project.id, text: "Wait for the Boss" });
    await h.client.expectOk("intent.close", { intentId: first.id, as: verdict });
    await Promise.all([...h.service["advancing"]]);
    let after = await h.client.expectOk("ledger.get", {});
    expectNext(after, waiting.id, "manual-ready", true);
    assert.equal(entry(after, waiting.id).intent.dispatched, undefined);
    // Worked before its verdict, the closed intent is History, and
    // removing it initiates nothing either (core-service-94).
    await h.client.expectOk("intent.remove", { intentId: first.id });
    await Promise.all([...h.service["advancing"]]);
    after = await h.client.expectOk("ledger.get", {});
    expectNext(after, waiting.id, "manual-ready", true);
    assert.equal(entry(after, waiting.id).intent.dispatched, undefined);
    assert.deepEqual(prompts, [first.text]);
    assert.equal(starts(h.client).length, 1);
  });
}

test("queue advance: queue edits, verdict, subsequent plain chat, and restart never replay settlement", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    await context.emitReply("Done");
  });
  const { project, session } = h;
  const first = await h.client.queue({ projectId: project.id, text: "First work" });
  await h.client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
  await settled(h);
  // Captured after the settlement: no handoff ever selected it.
  const next = await h.client.queue({ projectId: project.id, text: "Wait for Confirm" });
  assert.equal(entry(await h.client.expectOk("ledger.get", {}), next.id).intent.dispatched, undefined);
  await h.client.expectOk("intent.close", { intentId: first.id, as: "done" });
  await h.client.expectOk("intent.edit", { intentId: next.id, text: "Edited after confirmation" });
  const added = await h.client.queue({ projectId: project.id, text: "Added after settlement" });
  let ledger = await h.client.expectOk("ledger.get", {});
  expectNext(ledger, next.id, "manual-ready", true);
  for (const id of [next.id, added.id]) {
    assert.equal(entry(ledger, id).state, "queued");
    assert.equal(entry(ledger, id).intent.dispatched, undefined);
  }
  assert.deepEqual(prompts, [first.text]);
  // A successful unbound turn after Confirm is new chat, even though
  // the session still stores the earlier intent's dispatch stamp.
  const chat = "Plain conversation after confirmation";
  await h.client.expectOk("turn.submit", { sessionId: session.id, text: chat });
  await settled(h, 2);
  ledger = await h.client.expectOk("ledger.get", {});
  for (const id of [next.id, added.id]) assert.equal(entry(ledger, id).intent.dispatched, undefined);
  assert.deepEqual(prompts, [first.text, chat]);
  assert.equal(starts(h.client).length, 2);
  await h.restart();
  ledger = await h.client.expectOk("ledger.get", {});
  for (const id of [next.id, added.id]) assert.equal(entry(ledger, id).intent.dispatched, undefined);
  assert.deepEqual(prompts, [first.text, chat], "stored settlement is evidence, not a restart trigger");
});

test("queue advance: shutdown keeps an active intent stopped across restart", { timeout: 20_000 }, async (t) => {
  const entered = deferred();
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    entered.resolve();
    await new Promise<void>((_resolve, reject) => {
      if (context.signal.aborted) {
        reject(context.signal.reason);
        return;
      }
      context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
    });
  });
  const first = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "Interrupted by shutdown" });
  const next = await h.client.expectOk("intent.queue", { projectId: h.project.id, text: "Must wait after restart" });
  await h.client.expectOk("turn.submit", { sessionId: h.session.id, text: first.text, intentId: first.id });
  await entered.promise;

  await h.restart();

  const ledger = await h.client.expectOk("ledger.get", {});
  expectNext(ledger, first.id, "stopped", true);
  assert.equal(entry(ledger, next.id).intent.dispatched, undefined);
  assert.deepEqual(prompts, [first.text]);
});

test("queue advance: invalid configuration refuses admission and repairing it does not retry", { timeout: 20_000 }, async (t) => {
  const reached = deferred();
  const release = deferred();
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context, session) => {
    prompts.push(turn.prompt);
    if (prompts.length === 1) {
      reached.resolve();
      await release.promise;
    }
    await context.emitReply("Done");
  });
  h.beforeStop.push(release.resolve);
  const { client, project, session } = h;
  const configPath = join(h.dir, "playbook.config.yaml");
  const first = await client.expectOk("intent.queue", { projectId: project.id, text: "First intent" });
  const next = await client.expectOk("intent.queue", { projectId: project.id, text: "Next intent" });
  await client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
  await reached.promise;
  writeFileSync(configPath, "captain: [invalid current config]\n");
  await h.service.reloadConfig();
  release.resolve();
  await settled(h);
  const refused = await client.expectOk("ledger.get", {});
  assert.equal(entry(refused, next.id).state, "queued");
  assert.equal(entry(refused, next.id).intent.dispatched, undefined);
  assert.equal(starts(client).length, 1);

  writeFileSync(configPath, VALID_CONFIG);
  await client.expectOk("config.edit", { op: { kind: "captain.set", patch: { model: "claude-test" } } });
  await Promise.all([...h.service["advancing"]]);
  assert.equal(entry(await client.expectOk("ledger.get", {}), next.id).intent.dispatched, undefined);
  assert.deepEqual(prompts, [first.text], "configuration repair does not replay completion");
  await client.expectOk("turn.submit", { sessionId: session.id, text: next.text, intentId: next.id });
  await settled(h, 2);
  assert.deepEqual(prompts, [first.text, next.text], "manual submission can resume after the repair");
  assert.equal(entry(await client.expectOk("ledger.get", {}), next.id).intent.dispatched?.turnId, 2);
});

/** Hold the automatic handoff right after it authorized its successor and
 * opened the continued runtime, until the test releases it. */
function holdAfterAuthorization(h: Harness) {
  const continued = h.service["continueSession"].bind(h.service);
  const opened = deferred();
  const release = deferred();
  h.beforeStop.push(() => { release.resolve(); h.service["continueSession"] = continued; });
  h.service["continueSession"] = async (id) => {
    await continued(id);
    opened.resolve();
    await release.promise;
  };
  return { opened: opened.promise, release: release.resolve };
}

/** A sync lands an intent another device captured: its file arrives in
 * the project's clone, and the store re-reads the clone as a sync's
 * refresh does (space-20). */
function arriveThroughSync(h: Harness, createdAt: number): IntentInfo {
  const store = h.service["store"];
  const id = randomUUID();
  const file = { format: 1, id, text: "Captured elsewhere, earlier", createdAt };
  writeFileSync(join(store.repository(h.project.id)!.intentsDir, `${id}.json`), `${JSON.stringify(file, null, 2)}\n`);
  store.reload();
  const intent = store.getIntent(id);
  assert.ok(intent, "the synced intent reads back");
  return intent;
}

test("queue advance: a capture and an edit after authorization keep the successor, with its latest text", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    await context.emitReply("Done");
  });
  const { client, project, session } = h;
  const first = await client.queue({ projectId: project.id, text: "First work" });
  const next = await client.queue({ projectId: project.id, text: "Authorized next" });
  const held = holdAfterAuthorization(h);
  await client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
  await held.opened;
  assert.ok(h.service["sessions"].getLive(session.id), "automatic admission opened the continued runtime");
  expectNext(await client.expectOk("ledger.get", {}), next.id, "after-current-work", false);
  // A capture is younger than the authorized row, so next stays next;
  // the edit is what the dispatch carries (core-service-94).
  const nextText = "Updated after authorization";
  await client.expectOk("intent.edit", { intentId: next.id, text: nextText });
  const captured = await client.queue({ projectId: project.id, text: "Captured after authorization" });
  const pending = await client.expectOk("ledger.get", {});
  expectNext(pending, next.id, "after-current-work", false);
  assert.equal(entry(pending, captured.id).next, undefined);
  held.release();
  // The capture then waits its turn by age: the successor's settlement
  // hands it on in turn.
  const after = await client.ledgerUntil(
    (ledger) => entry(ledger, captured.id).state === "finished",
    "the authorized successor and then the capture",
  );
  await settled(h, 3);
  assert.equal(entry(after, next.id).intent.dispatched?.turnId, 2);
  assert.equal(entry(after, captured.id).intent.dispatched?.turnId, 3);
  assert.deepEqual(prompts, [first.text, nextText, captured.text]);
  assert.equal(starts(client).length, 3);
});

test("queue advance: an older intent arriving through a sync after authorization cancels rather than substitutes work", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    await context.emitReply("Done");
  });
  const { client, project, session } = h;
  const first = await client.queue({ projectId: project.id, text: "First work" });
  const next = await client.queue({ projectId: project.id, text: "Must stay queued" });
  const held = holdAfterAuthorization(h);
  await client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
  await held.opened;
  assert.ok(h.service["sessions"].getLive(session.id), "automatic admission opened the continued runtime");
  expectNext(await client.expectOk("ledger.get", {}), next.id, "after-current-work", false);
  await client.expectOk("intent.edit", { intentId: next.id, text: "Updated after authorization" });
  // Captured on another device before the authorized row: by age, it is
  // now next (core-service-42, core-service-107).
  const synced = arriveThroughSync(h, next.createdAt - 60_000);
  const pending = await client.expectOk("ledger.get", {});
  expectNext(pending, synced.id, "after-current-work", false);
  assert.equal(entry(pending, next.id).next, undefined);
  await client.expectOk("intent.close", { intentId: first.id, as: "dropped" });
  held.release();
  await Promise.all([...h.service["advancing"]]);
  const after = await client.expectOk("ledger.get", {});
  expectNext(after, synced.id, "manual-ready", true);
  assert.equal(entry(after, next.id).intent.dispatched, undefined);
  assert.equal(entry(after, synced.id).intent.dispatched, undefined);
  assert.deepEqual(prompts, [first.text]);
  assert.equal(starts(client).length, 1);
  assert.equal(h.service["sessions"].getLive(session.id), undefined);
  assert.equal(h.service["sessions"].listSessions().find((row) => row.id === session.id)?.live, false);
});

test("queue advance: closing the authorized successor cancels rather than substitutes work", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    await context.emitReply("Done");
  });
  const { client, project, session } = h;
  const first = await client.queue({ projectId: project.id, text: "First work" });
  const next = await client.queue({ projectId: project.id, text: "Authorized next" });
  const later = await client.queue({ projectId: project.id, text: "Next by age once the successor goes" });
  const held = holdAfterAuthorization(h);
  await client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
  await held.opened;
  // Let go before any work, the successor leaves the queue, and the
  // younger row becomes next (core-service-46, core-service-107).
  await client.expectOk("intent.close", { intentId: next.id, as: "dropped" });
  expectNext(await client.expectOk("ledger.get", {}), later.id, "after-current-work", false);
  held.release();
  await Promise.all([...h.service["advancing"]]);
  const after = await client.expectOk("ledger.get", {});
  expectNext(after, later.id, "manual-ready", true);
  assert.equal(entry(after, later.id).intent.dispatched, undefined);
  assert.equal(h.service["store"].getIntent(next.id), undefined);
  assert.deepEqual(prompts, [first.text]);
  assert.equal(starts(client).length, 1);
  assert.equal(h.service["sessions"].getLive(session.id), undefined);
});

test("queue advance: a settled-owner verdict and removal do not cancel its authorized successor", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    await context.emitReply("Done");
  });
  const { client, project, session } = h;
  const first = await client.queue({ projectId: project.id, text: "First work" });
  const authorized = await client.queue({ projectId: project.id, text: "Already authorized" });
  const later = await client.queue({ projectId: project.id, text: "Next by age after it" });
  const held = holdAfterAuthorization(h);

  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: first.text,
    intentId: first.id,
  });
  await held.opened;
  expectNext(
    await client.expectOk("ledger.get", {}),
    authorized.id,
    "after-current-work",
    false,
  );
  await client.expectOk("intent.close", { intentId: first.id, as: "done" });
  await client.expectOk("intent.remove", { intentId: first.id });
  const pending = await client.expectOk("ledger.get", {});
  expectNext(pending, authorized.id, "after-current-work", false);
  assert.equal(entry(pending, later.id).next, undefined);

  held.release();
  const after = await client.ledgerUntil(
    (ledger) => entry(ledger, later.id).state === "finished",
    "the authorized row and then the next by age",
  );
  await settled(h, 3);
  assert.equal(entry(after, authorized.id).intent.dispatched?.turnId, 2);
  assert.equal(entry(after, later.id).intent.dispatched?.turnId, 3);
  assert.deepEqual(prompts, [first.text, authorized.text, later.text]);
  assert.equal(starts(client).length, 3);
});

test("queue advance: a verdict and removal before authorization do not cancel the successor", { timeout: 20_000 }, async (t) => {
  const prompts: string[] = [];
  const h = await harness(t, async (turn, context) => {
    prompts.push(turn.prompt);
    await context.emitReply("Done");
  });
  const { client, project, session } = h;
  const first = await client.queue({
    projectId: project.id,
    text: "First work",
  });
  const successor = await client.queue({
    projectId: project.id,
    text: "Successor independent of the verdict",
  });
  const later = await client.queue({
    projectId: project.id,
    text: "Next by age after it",
  });
  const store = h.service["store"];
  const sessions = h.service["sessions"];
  const refresh = store.refreshSession.bind(store);
  const reached = deferred();
  const releaseSettlement = deferred();
  h.beforeStop.push(() => {
    releaseSettlement.resolve();
    store.refreshSession = refresh;
  });
  store.refreshSession = async (id, live) => {
    if (id === session.id && live === false && !sessions.getLive(id)) {
      store.refreshSession = refresh;
      reached.resolve();
      await releaseSettlement.promise;
    }
    return refresh(id, live);
  };

  await client.expectOk("turn.submit", {
    sessionId: session.id,
    text: first.text,
    intentId: first.id,
  });
  await reached.promise;
  await client.expectOk("intent.close", { intentId: first.id, as: "done" });
  await client.expectOk("intent.remove", { intentId: first.id });
  const pending = await client.expectOk("ledger.get", {});
  expectNext(pending, successor.id, "after-current-work", false);
  assert.equal(entry(pending, later.id).next, undefined);

  releaseSettlement.resolve();
  const after = await client.ledgerUntil(
    (ledger) => entry(ledger, later.id).state === "finished",
    "the independent successor and then the next by age",
  );
  await settled(h, 3);
  assert.equal(entry(after, successor.id).intent.dispatched?.turnId, 2);
  assert.equal(entry(after, later.id).intent.dispatched?.turnId, 3);
  assert.deepEqual(prompts, [first.text, successor.text, later.text]);
  assert.equal(starts(client).length, 3);
});

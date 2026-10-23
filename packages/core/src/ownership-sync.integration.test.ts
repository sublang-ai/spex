// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Execution ownership over two homes (core-service-124, DR-134): two
// real cores on scratch homes, each its own runtime, pair one project
// at the same working-folder path and sync its records through one
// bare remote — so what one home created or captured reaches the other
// exactly as a sync leaves it — in a file budget of its own.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createSessionStore } from "@sublang/playbook/session-store";
import { fakeAdapterImports } from "./testing/fake-adapter.js";
import { createSpaceHarness } from "./testing/space-harness.js";

const fixture = createSpaceHarness();
const { bareRepo, otherDevice, addFolder, joinRemote, startHome, peerClone, peerPush } = fixture;
test.after(() => fixture.dispose());

type Home = Awaited<ReturnType<typeof startHome>>;
type Reply = Awaited<ReturnType<Home["client"]["command"]>>;

/** The first home's provider: the harness's scripted replies, and a
 * player call whose prompt says `hold:` staying in flight until its
 * turn is aborted — a turn caught mid-way. */
const holdingAdapter = () => fakeAdapterImports({
  rules: [
    { match: "route:", response: { result: '{"decision":"dispatch"}' } },
    { match: "hold:", response: { result: "held", untilAborted: true } },
  ],
  fallback: { deltas: ["hello ", "world"], result: "hello world" },
}).imports;

/** This home's runtime: its `device` in `home.yaml` (storage-2). */
function deviceOf(home: Home): string {
  return (parseYaml(readFileSync(join(home.dataDir, "home.yaml"), "utf8")) as { device: string }).device;
}

/** Two homes, each labelled, the second pairing the very folder the
 * first pairs — the same working-folder path — and joined to the
 * first's spex repository through one bare remote. */
async function pairedHomes(name: string, t: TestContext) {
  const bare = bareRepo();
  const a = await startHome(`${name}-a`, { extra: { runtimeLabel: "laptop-a", adapterImports: holdingAdapter() } });
  t.after(() => a.stop());
  const b = await startHome(`${name}-b`, { project: false, env: otherDevice(`${name}-b`), extra: { runtimeLabel: "laptop-b" } });
  t.after(() => b.stop());
  const { key, clone: aClone } = await addFolder(a, a.projectDir);
  await a.client.expectOk("space.remote.set", { repository: key, url: bare });
  await synced(a, key);
  const { key: bKey, clone: bClone } = await addFolder(b, a.projectDir);
  assert.equal(bKey, key, "one project");
  await b.client.expectOk("space.remote.set", { repository: key, url: bare });
  await joinRemote(b, key);
  assert.notEqual(deviceOf(a), deviceOf(b), "two homes are two runtimes");
  return { bare, a, b, key, aClone, bClone };
}

async function synced(home: Home, key: string): Promise<void> {
  const state = await home.client.settle("space.sync", { repository: key });
  assert.equal(state.sync.phase, "done", JSON.stringify(state.sync));
}

/** Submit one turn, naming an intent where given, and wait for the
 * runtime's release with that turn counted. */
async function turnOn(home: Home, sessionId: string, text: string, intentId?: string): Promise<void> {
  const before = (await home.client.expectOk("session.list", {})).find((s) => s.id === sessionId)?.turns ?? 0;
  await home.client.expectOk("turn.submit", { sessionId, text, ...(intentId ? { intentId } : {}) });
  await home.client.waitFor((m) => m.type === "session.state" && m.session.id === sessionId && !m.session.live && (m.session.turns ?? 0) > before, 20_000);
}

/** Refused with the phrase, its label in the details (core-service-43,
 * core-service-73). */
function refusedAs(reply: Reply, code: string, label: string, what: string): void {
  assert.ok(!reply.ok, `${what} is refused`);
  assert.equal(reply.error.code, code, what);
  assert.equal(reply.error.message, `Runs on ${label}`, what);
  assert.deepEqual((reply.error as { details?: unknown }).details, { runsOn: label }, what);
}

const runtimeRecords = async (sessionsDir: string, sessionId: string) =>
  (await createSessionStore({ sessionsDir }).readHistory(sessionId)).entries
    .filter(({ record }) => (record as { topic?: unknown }).topic === "spex.session.runtime");

/** A format 1 intent, as a Spex that recorded no runtime wrote it
 * (storage-4). */
function unassignedIntent(clone: string, text: string, createdAt: number): { id: string; text: string; createdAt: number } {
  const intent = { id: randomUUID(), text, createdAt };
  mkdirSync(join(clone, "intents"), { recursive: true });
  writeFileSync(join(clone, "intents", `${intent.id}.json`), `${JSON.stringify({ format: 1, ...intent }, null, 2)}\n`);
  return intent;
}

test("core-service-124: what the first home creates or captures runs there alone; the second, pairing the folder at the same path, reads it as the first's", { timeout: 240_000 }, async (t) => {
  const { bare, a, b, key, aClone, bClone } = await pairedHomes("owner", t);
  const first = { device: deviceOf(a), label: "laptop-a" };
  const label = first.label;
  const phrase = `Runs on ${label}`;

  // The first captures an intent and runs it in a session assigned to
  // it before its first turn: one hidden runtime record naming no turn
  // (core-service-4, core-service-42).
  const worked = await a.client.expectOk("intent.queue", { projectId: key, text: "Ship the parser" });
  assert.deepEqual(worked.runtime, first);
  const session = (await a.client.expectOk("session.create", { projectId: key })).id;
  const assigned = await runtimeRecords(join(aClone, "sessions"), session);
  assert.equal(assigned.length, 1);
  assert.deepEqual((assigned[0].record as { payload?: unknown }).payload, first);
  assert.equal((assigned[0].record as { turnId?: unknown }).turnId, null);
  await turnOn(a, session, worked.text, worked.id);
  const firstTurn = (await createSessionStore({ sessionsDir: join(aClone, "sessions") }).readHistory(session)).entries
    .find(({ record }) => record.type === "turn_started");
  assert.ok(firstTurn && assigned[0].seq < firstTurn.seq, "assigned before its first turn");
  const waiting = await a.client.expectOk("intent.queue", { projectId: key, text: "Document the parser" });
  const onFirst = await a.client.expectOk("ledger.get", {});
  assert.deepEqual(onFirst.attention.map((entry) => [entry.kind, entry.intentId]), [["finish", worked.id]]);
  assert.ok(onFirst.intents.find((row) => row.intent.id === waiting.id)?.next, "next on the home that captured it");
  await synced(a, key);
  await synced(b, key);

  // The second reads the session as the first's: `runsOn` with its
  // label, not continuable, the phrase its reason, no recovery
  // (core-service-124, core-service-32).
  const listed = (await b.client.expectOk("session.list", {})).find((s) => s.id === session);
  assert.equal(listed?.runsOn, label);
  assert.equal(listed?.continuable, undefined);
  assert.equal(listed?.continuationReason, phrase);
  assert.equal(listed?.recovery, undefined);
  assert.deepEqual((await runtimeRecords(join(bClone, "sessions"), session)).map(({ record }) => (record as { payload?: unknown }).payload), [first]);
  // Continuation, a control, Restore and Discard are refused
  // `invalid_request` with the phrase, writing nothing (core-service-124,
  // core-service-73, core-service-82, core-service-83).
  const streamFile = join(bClone, "sessions", `${session}.records.jsonl`);
  const streamBefore = readFileSync(streamFile);
  refusedAs(await b.client.command("turn.submit", { sessionId: session, text: "Keep going" }), "invalid_request", label, "a continuation");
  refusedAs(await b.client.command("session.control", { sessionId: session, kind: "recovery" }), "invalid_request", label, "session.control");
  refusedAs(await b.client.command("session.restore", { sessionId: session }), "invalid_request", label, "session.restore");
  refusedAs(await b.client.command("session.discard", { sessionId: session }), "invalid_request", label, "session.discard");
  assert.deepEqual(readFileSync(streamFile), streamBefore);
  // Never the second's lane (core-service-124, core-service-93), and
  // its work summons nothing there (core-service-124, core-service-49).
  assert.deepEqual(b.service["sessions"].listLanes().filter((lane) => lane.projectId === key), []);
  let onSecond = await b.client.expectOk("ledger.get", {});
  assert.deepEqual(onSecond.attention, []);
  assert.equal(onSecond.badge, 0);
  // The intents carry the first's runtime and list in the second's
  // queue with its label, kept by age and never next (core-service-124,
  // core-service-42, core-service-107).
  const row = (ledger: typeof onSecond, id: string) => ledger.intents.find((entry) => entry.intent.id === id);
  assert.deepEqual(row(onSecond, worked.id)?.intent.runtime, first);
  assert.deepEqual([row(onSecond, worked.id)?.state, row(onSecond, worked.id)?.runsOn], ["finished", label]);
  assert.deepEqual([row(onSecond, waiting.id)?.state, row(onSecond, waiting.id)?.runsOn, row(onSecond, waiting.id)?.next], ["queued", label, undefined]);

  // The second runs work of its own beside it. Its clean settlement
  // advances past the first's older intent to its own next: the
  // first's is never advanced into (core-service-124, core-service-94).
  const own = await b.client.expectOk("intent.queue", { projectId: key, text: "Write the changelog" });
  const successor = await b.client.expectOk("intent.queue", { projectId: key, text: "Tag the release" });
  assert.ok(waiting.createdAt < own.createdAt, "the first's intent is the older");
  const mine = (await b.client.expectOk("session.create", { projectId: key })).id;
  await b.client.expectOk("turn.submit", { sessionId: mine, text: own.text, intentId: own.id });
  await b.client.waitFor((m) => m.type === "session.state" && m.session.id === mine && !m.session.live && (m.session.turns ?? 0) >= 2, 20_000);
  await Promise.all([...b.service["advancing"]]);
  onSecond = await b.client.expectOk("ledger.get", {});
  assert.deepEqual(
    [own.id, successor.id].map((id) => [row(onSecond, id)?.state, row(onSecond, id)?.intent.dispatched?.turnId]),
    [["finished", 1], ["finished", 2]],
  );
  assert.deepEqual([row(onSecond, waiting.id)?.state, row(onSecond, waiting.id)?.intent.dispatched], ["queued", undefined]);
  const prompts = (await b.client.expectOk("history.get", { sessionId: mine })).records
    .flatMap(({ record }) => record.type === "turn_started" ? [(record as { turn?: { prompt?: string } }).turn?.prompt] : []);
  assert.deepEqual(prompts, [own.text, successor.text]);
  // A turn naming the first's intent, its edit and its close are
  // refused `conflict`, writing nothing (core-service-124,
  // core-service-47, core-service-43, core-service-46).
  const intentFile = (id: string) => join(bClone, "intents", `${id}.json`);
  const intentsBefore = [readFileSync(intentFile(worked.id)), readFileSync(intentFile(waiting.id))];
  refusedAs(await b.client.command("turn.submit", { sessionId: mine, text: waiting.text, intentId: waiting.id }), "conflict", label, "a turn naming it");
  refusedAs(await b.client.command("intent.edit", { intentId: waiting.id, text: "Document the parser for users" }), "conflict", label, "intent.edit");
  refusedAs(await b.client.command("intent.close", { intentId: worked.id, as: "done" }), "conflict", label, "intent.close done");
  refusedAs(await b.client.command("intent.close", { intentId: waiting.id, as: "dropped" }), "conflict", label, "intent.close dropped");
  assert.deepEqual([readFileSync(intentFile(worked.id)), readFileSync(intentFile(waiting.id))], intentsBefore);

  // Closed on the first, the intent is removed on the second as any
  // home may remove closed work (core-service-124, core-service-46).
  await a.client.expectOk("intent.close", { intentId: worked.id, as: "done" });
  await synced(a, key);
  await synced(b, key);
  await b.client.expectOk("intent.remove", { intentId: worked.id });
  assert.equal(existsSync(intentFile(worked.id)), false);
  // Deleting the first's session from the second succeeds as any
  // deletion does (core-service-124).
  await b.client.expectOk("session.delete", { sessionId: session });
  assert.equal((await b.client.expectOk("session.list", {})).some((s) => s.id === session), false);
  await synced(b, key);
  await synced(a, key);

  // An open dispatch of the first's session, as a sync carries it
  // mid-turn: an intent naming no runtime, dispatched in a session of
  // the first whose turn is still running there when its records reach
  // the remote.
  const unassigned = unassignedIntent(aClone, "hold: Migrate the schema", Date.now());
  const running = (await a.client.expectOk("session.create", { projectId: key })).id;
  await a.client.expectOk("turn.submit", { sessionId: running, text: unassigned.text, intentId: unassigned.id });
  const inFlight = async () => {
    for (let i = 0; i < 400; i += 1) {
      const found = (await a.client.expectOk("ledger.get", {})).intents.find((entry) => entry.intent.id === unassigned.id);
      if (found?.state === "working") return found;
      await fixture.sleep(25);
    }
    assert.fail("the dispatch never started");
  };
  assert.equal((await inFlight()).intent.dispatched?.sessionId, running);
  const peer = peerClone(bare);
  await peerPush(peer, (dir) => {
    mkdirSync(join(dir, "sessions"), { recursive: true });
    mkdirSync(join(dir, "intents"), { recursive: true });
    for (const file of [`sessions/${running}.json`, `sessions/${running}.records.jsonl`, `intents/${unassigned.id}.json`]) {
      copyFileSync(join(aClone, file), join(dir, file));
    }
  });
  // The first stops its turn: its own read releases the intent there.
  await a.client.expectOk("turn.abort", { sessionId: running });
  await a.client.waitFor((m) => m.type === "session.state" && m.session.id === running && !m.session.live, 20_000);
  assert.equal((await a.client.expectOk("ledger.get", {})).intents.find((entry) => entry.intent.id === unassigned.id)?.state, "queued");
  await synced(b, key);
  // The second never derives that dispatch as released: the intent is
  // the first's work, labelled and never next, and the session offers
  // no recovery and refuses Restore and Discard (core-service-124,
  // core-service-47, core-service-32, core-service-82, core-service-83).
  onSecond = await b.client.expectOk("ledger.get", {});
  const open = row(onSecond, unassigned.id);
  assert.equal(open?.intent.dispatched?.sessionId, running);
  assert.notEqual(open?.state, "queued", "not released");
  assert.equal(open?.runsOn, label);
  assert.equal(open?.next, undefined);
  // The second's own deliveries alone summon it.
  assert.deepEqual(onSecond.attention.map((entry) => [entry.kind, entry.intentId, entry.sessionId]), [
    ["finish", own.id, mine],
    ["finish", successor.id, mine],
  ]);
  assert.equal(onSecond.badge, 2);
  const midway = (await b.client.expectOk("session.list", {})).find((s) => s.id === running);
  assert.equal(midway?.runsOn, label);
  assert.equal(midway?.continuable, undefined);
  assert.equal(midway?.recovery, undefined);
  refusedAs(await b.client.command("session.restore", { sessionId: running }), "invalid_request", label, "session.restore mid-turn");
  refusedAs(await b.client.command("session.discard", { sessionId: running }), "invalid_request", label, "session.discard mid-turn");
  assert.deepEqual(b.service["sessions"].listLanes().filter((lane) => lane.sessionId === running), []);
});

test("core-service-124: a session and an intent carrying no runtime keep today's readings on both homes", { timeout: 180_000 }, async (t) => {
  const { a, b, key, aClone } = await pairedHomes("unassigned", t);
  // An intent written by a Spex that recorded no runtime, and a session
  // the Playbook CLI wrote in the shared folder and left mid-step: no
  // runtime record in either.
  const intent = unassignedIntent(aClone, "Ship the parser", Date.now() - 60_000);
  const writer = join(dirname(fileURLToPath(import.meta.url)), "testing", "stopped-writer.js");
  const child = spawn(process.execPath, [writer, join(aClone, "sessions"), a.projectDir, a.configPath, "Add a line to work.txt"], { stdio: ["ignore", "pipe", "inherit"] });
  const session = await new Promise<string>((resolveReady, reject) => {
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
      const ready = /READY (\S+)/.exec(out);
      if (ready) resolveReady(ready[1]!);
    });
    child.once("exit", (code) => reject(new Error(`the stopped writer exited early (${code}): ${out}`)));
  });
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  child.kill("SIGKILL");
  await exited;
  assert.deepEqual(await runtimeRecords(join(aClone, "sessions"), session), []);
  await a.service["syncForeignSessions"]();
  await synced(a, key);
  await synced(b, key);

  // Either home reads them as before: the session's interrupted step
  // offered for Restore under the folder rule, named on no runtime, and
  // the intent next on either (core-service-124, core-service-32,
  // core-service-107).
  for (const home of [a, b]) {
    const listed = (await home.client.expectOk("session.list", {})).find((s) => s.id === session);
    assert.equal(listed?.runsOn, undefined, home.dataDir);
    assert.deepEqual(listed?.recovery, { state: "uncertain", input: "Add a line to work.txt", discardable: false }, home.dataDir);
    const queued = (await home.client.expectOk("ledger.get", {})).intents.find((entry) => entry.intent.id === intent.id);
    assert.equal(queued?.intent.runtime, undefined);
    assert.equal(queued?.runsOn, undefined, home.dataDir);
    assert.equal(queued?.state, "queued");
    assert.ok(queued?.next, `next on ${home.dataDir}`);
  }
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A core running as a seat on a team server (core-service-125,
// core-service-127, DR-132), against the stand-in instance: the device
// request names the server and the person under the server's name; a
// sign-in as another account, or a denied code, stores nothing; your own
// group is placed at no instance and offered no pick or remote; every
// command naming a working folder is refused; and an intent holding no
// runtime runs nowhere there.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { credentialsPath } from "./git-host.js";
import { Home } from "./home.js";
import { clonePath, createSpaceHarness, hostKey, instanceOf, OWN_KEY } from "./testing/space-harness.js";
import type { GroupsState } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

const SEAT = { serverId: "srv_7f3a", serverName: "lab-1", personId: "1001" };
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const PATH_REFUSAL = /^Projects on a server are opened from their group$/;
const OWN_REFUSAL = /^Your own group stays on this server$/;

/** Your own group's own row in a state. */
function ownRow(state: GroupsState) {
  const row = state.own.repositories.find((repository) => repository.own);
  assert.ok(row, "your own group's row is listed");
  return row;
}

test("core-service-127, git-host-27: a seat's device request names the server and the person under the server's name; the sign-in of the admitted person stands", async (t) => {
  const host = await startHost();
  const home = await startHome("seat-request", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  await signIn(home, host);
  // The label is the server's name (core-service-125), and the request
  // carries the server's id and the person's id (git-host-27).
  assert.deepEqual(host.script.deviceRequests, [{ label: "Spex on lab-1", serverId: SEAT.serverId, personId: SEAT.personId }]);
  assert.equal(Home.load(home.dataDir).instance(host.url)?.account?.id, SEAT.personId);
  assert.ok(existsSync(credentialsPath(home.dataDir)), "the person's token is stored");
});

test("core-service-127, git-host-27: on a seat a sign-in as another account, and a denied code, each end failed storing nothing", async (t) => {
  const host = await startHost();
  const home = await startHome("seat-another", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());

  // The instance signs in bob, who bears another permanent id than the
  // person the seat was opened for.
  host.script.person = { id: "1002", login: "bob", displayName: "Bob" };
  let from = home.client.mark();
  const started = await home.client.expectOk("space.signin.start", { url: host.url });
  assert.equal(started.flow, "device");
  if (started.flow !== "device") return;
  host.script.approveDevice(started.userCode);
  const refused = await home.client.waitSpace(from, (state) => state.signIn.phase === "failed", 30_000);
  assert.ok(refused.signIn.phase === "failed");
  assert.equal(refused.signIn.cause, "refused");
  assert.match(refused.signIn.message, /signed you in as @bob; this seat is another member's$/);
  assert.equal(existsSync(credentialsPath(home.dataDir)), false, "no token is stored");
  assert.equal(Home.load(home.dataDir).instance(host.url)?.account, undefined, "no account is written");
  assert.notEqual(instanceOf(refused, host.url)?.signedIn, true);

  // A denied code ends it denied, storing nothing.
  host.script.person = { id: SEAT.personId, login: LOGIN, displayName: "Ada Lovelace" };
  from = home.client.mark();
  const denied = await home.client.expectOk("space.signin.start", { url: host.url });
  if (denied.flow !== "device") return assert.fail("a seat signs in through the device flow");
  host.script.denyDevice(denied.userCode);
  const ended = await home.client.waitSpace(from, (state) => state.signIn.phase === "failed", 30_000);
  assert.ok(ended.signIn.phase === "failed");
  assert.equal(ended.signIn.cause, "denied");
  assert.equal(existsSync(credentialsPath(home.dataDir)), false, "no token is stored");

  // Every request named the server and the person.
  assert.deepEqual(host.script.deviceRequests.map((request) => [request.serverId, request.personId]), [[SEAT.serverId, SEAT.personId], [SEAT.serverId, SEAT.personId]]);
});

test("core-service-127, space-102: on a seat your own group gains no placement at sign-in — nothing created or joined, its namespace's own repository left there — and takes no pick or remote", async (t) => {
  const host = await startHost();
  // The member's own records at the instance, from a device of their own.
  host.script.addRepository({ group: LOGIN, name: `${LOGIN}-spex` });
  const home = await startHome("seat-own", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  const read = await home.client.waitSpace(from, (state) => (instanceOf(state, host.url)?.readAt ?? null) !== null && state.signIn.phase === "idle");
  // Renamed after the login as on any home, its clone stays local only
  // with no remote; nothing is created at the instance and its own
  // repository there is neither joined nor cloned (space-102).
  const own = ownRow(read);
  assert.deepEqual([own.key, own.remote, own.instance, own.state], [HOST_OWN, null, null, "local-only"]);
  assert.equal(git(clonePath(home.dataDir, HOST_OWN), "remote"), "", "your own group's clone has no remote");
  assert.deepEqual(host.script.creations, [], "nothing is created at the instance");
  assert.equal(existsSync(clonePath(home.dataDir, hostKey(host, HOST_OWN))), false, "the member's own records are not cloned");
  const after = ownRow(await home.client.expectOk("space.get", {}));
  assert.deepEqual([after.remote, after.state], [null, "local-only"]);

  // No pick and no remote for your own group (space-102).
  await home.client.expectError("space.pick", { repository: HOST_OWN, choice: { kind: "create", instance: host.url, groupId: null, name: LOGIN } }, "invalid_request", OWN_REFUSAL);
  const listed = host.script.repositories.find((repository) => repository.path === `${LOGIN}-spex`);
  assert.ok(listed);
  await home.client.expectError("space.pick", { repository: HOST_OWN, choice: { kind: "join", instance: host.url, hostId: listed.id } }, "invalid_request", OWN_REFUSAL);
  await home.client.expectError("space.remote.set", { repository: HOST_OWN, url: `file://${join(scratch, "elsewhere.git")}` }, "invalid_request", OWN_REFUSAL);
  assert.deepEqual(host.script.creations, [], "still nothing is created");
  assert.equal(git(clonePath(home.dataDir, HOST_OWN), "remote"), "");
});

test("core-service-127: on a seat every command naming a working folder is refused with the phrase, changing nothing", async (t) => {
  const host = await startHost();
  const listed = host.script.addRepository({ group: "acme", name: "alpha-spex", project: { name: "alpha" } });
  const home = await startHome("seat-paths", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  await signIn(home, host);
  const folder = gitFolder("seat-work");
  const fresh = join(scratch, "seat-fresh");
  await home.client.expectError("project.register", { path: folder }, "invalid_request", PATH_REFUSAL);
  await home.client.expectError("project.create", { path: fresh }, "invalid_request", PATH_REFUSAL);
  await home.client.expectError("project.rebind", { projectId: OWN_KEY, path: folder }, "invalid_request", PATH_REFUSAL);
  mkdirSync(join(scratch, "seat-code"), { recursive: true });
  await home.client.expectError("space.join", { instance: host.url, hostId: listed.id, folder: join(scratch, "seat-code") }, "invalid_request", PATH_REFUSAL);
  assert.deepEqual(await home.client.expectOk("project.list", {}), [], "no project is registered");
  assert.equal(existsSync(fresh), false, "no folder is created");
  assert.equal(existsSync(clonePath(home.dataDir, hostKey(host, "acme/alpha-spex"))), false, "nothing is cloned");
});

test("core-service-125: a core without a seat names neither a server nor a person, under this machine's name", async (t) => {
  const host = await startHost();
  const home = await startHome("no-seat", { host, project: false });
  t.after(() => home.stop());
  await signIn(home, host);
  const [request] = host.script.deviceRequests;
  assert.deepEqual([request?.serverId, request?.personId], [null, null]);
  assert.notEqual(request?.label, "Spex on lab-1");
  // A home of one's own registers a folder as before.
  const folder = gitFolder("own-work");
  const project = await home.client.expectOk("project.register", { path: folder });
  assert.equal(project.path, folder);
});

test("core-service-127, core-service-125, core-service-107, core-service-47: on a seat an intent holding no runtime keeps its place but is never next, never advanced into and refused a turn, while its edit and close stand", { timeout: 60_000 }, async (t) => {
  // A home of one's own pairs a folder, and its project's records hold a
  // format 1 intent, older than anything captured since, as a sync or
  // the Playbook CLI leaves one (storage-4).
  const own = await startHome("seat-nowhere");
  t.after(() => own.stop());
  const { key: projectId, clone } = await addFolder(own, own.projectDir);
  const legacyId = randomUUID();
  const legacyFile = join(clone, "intents", `${legacyId}.json`);
  mkdirSync(join(clone, "intents"), { recursive: true });
  writeFileSync(legacyFile, `${JSON.stringify({ format: 1, id: legacyId, text: "Port the old parser", createdAt: Date.now() - 60_000 })}\n`);
  // Off a seat it runs on any runtime: it is next (core-service-107).
  const off = await own.client.expectOk("ledger.get", {});
  assert.ok(off.intents.find((entry) => entry.intent.id === legacyId)?.next, "next off a seat");
  await own.stop();

  // The same home runs as a seat: its captures name it, under the
  // server's name (core-service-42, core-service-125).
  const seat = await startHome("seat-nowhere", { dataDir: own.dataDir, extra: { seat: SEAT } });
  t.after(() => seat.stop());
  const first = await seat.client.expectOk("intent.queue", { projectId, text: "Ship the parser" });
  const second = await seat.client.expectOk("intent.queue", { projectId, text: "Document the parser" });
  assert.equal(first.runtime?.label, SEAT.serverName);
  // Listed queued in its place by age, with no runtime's label, but never
  // next: the oldest this seat captured is (core-service-107).
  let ledger = await seat.client.expectOk("ledger.get", {});
  const row = (id: string) => ledger.intents.find((entry) => entry.intent.id === id);
  const order = ledger.intents.filter((entry) => entry.intent.projectId === projectId).map((entry) => entry.intent.id);
  assert.deepEqual(order, [legacyId, first.id, second.id], "kept in its place by age");
  assert.deepEqual([row(legacyId)?.state, row(legacyId)?.runsOn, row(legacyId)?.next], ["queued", undefined, undefined]);
  assert.ok(row(first.id)?.next, "the oldest intent this seat captured is next");

  // A turn naming it is refused `conflict` with the phrase and no runtime
  // to name, writing nothing (core-service-47).
  const session = await seat.client.expectOk("session.create", { projectId });
  const before = readFileSync(legacyFile);
  const refused = await seat.client.command("turn.submit", { sessionId: session.id, text: "Port the old parser", intentId: legacyId });
  assert.ok(!refused.ok, "a turn naming it is refused");
  assert.equal(refused.error.code, "conflict");
  assert.equal(refused.error.message, "Runs nowhere yet");
  assert.equal((refused.error as { details?: unknown }).details, undefined);
  assert.deepEqual(readFileSync(legacyFile), before);

  // The seat runs its own: the first intent's turn, then automatic
  // advancement into the second, never into the older one
  // (core-service-94, core-service-107).
  await seat.client.expectOk("turn.submit", { sessionId: session.id, text: first.text, intentId: first.id });
  await seat.client.waitFor((m) => m.type === "session.state" && m.session.id === session.id &&
    m.session.turns === 2 && !m.session.turnActive && !m.session.live, 30_000);
  ledger = await seat.client.expectOk("ledger.get", {});
  assert.deepEqual([row(first.id)?.state, row(second.id)?.state], ["finished", "finished"]);
  assert.equal(row(second.id)?.intent.dispatched?.sessionId, session.id, "advanced into the seat's own");
  assert.deepEqual([row(legacyId)?.state, row(legacyId)?.next, row(legacyId)?.intent.dispatched], ["queued", undefined, undefined]);

  // Its edit and close stand (core-service-43, core-service-46): the
  // file keeps format 1 and names no runtime (storage-4).
  await seat.client.expectOk("intent.edit", { intentId: legacyId, text: "Port the old parser to the new grammar" });
  const edited = JSON.parse(readFileSync(legacyFile, "utf8")) as Record<string, unknown>;
  assert.deepEqual([edited.format, edited.text, "runtime" in edited], [1, "Port the old parser to the new grammar", false]);
  await seat.client.expectOk("intent.close", { intentId: legacyId, as: "dropped" });
  ledger = await seat.client.expectOk("ledger.get", {});
  assert.equal(row(legacyId), undefined, "dropped, it leaves the queue");
});

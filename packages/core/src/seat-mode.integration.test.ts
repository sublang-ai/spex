// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A core running as a seat on a team server (core-service-125,
// core-service-127, DR-132), against the stand-in instance: the device
// request names the server and the person under the server's name, and
// the ticket a start names, its reply naming the interval, a ticket
// refused off a seat (DR-164), and the stand-in granting a pending code
// on a spent ticket as Spex Space does; a sign-in as another account, or
// a denied code, stores nothing; your own group is placed at no instance
// and offered no pick or remote; every
// command naming a working folder is refused; a seat opens no seat on a
// team server, asking nothing; and an intent holding no runtime runs
// nowhere there.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { credentialsPath } from "@sublang/spex/git-host";
import { Home } from "./home.js";
import { seatsPath } from "./seats.js";
import { clonePath, createSpaceHarness, hostKey, instanceOf, OWN_KEY } from "./testing/space-harness.js";
import type { GroupsState } from "./protocol.js";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

const SEAT = { serverId: "srv_7f3a", serverName: "lab-1", personId: "1001" };
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const PATH_REFUSAL = /^Projects on a server are opened from their group$/;
const OPEN_REFUSAL = /^Already on a server — open it from your computer$/;
const OWN_REFUSAL = /^Personal records stay on this server$/;

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

test("git-host-27, git-host-28: a seat's start naming a ticket carries it in the device request, its reply naming the interval the stand-in set; off a seat a start naming a ticket is refused invalid_request, asking nothing", async (t) => {
  const host = await startHost();
  host.script.deviceInterval = 2;
  const home = await startHome("seat-ticket", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  const started = await home.client.expectOk("space.signin.start", { url: host.url, ticket: "spext_presented" });
  if (started.flow !== "device") return assert.fail("a seat signs in through the device flow");
  // The reply names the interval the instance set (git-host-3).
  assert.equal(started.interval, 2);
  // The request carries the ticket beside the server and the person
  // (git-host-27).
  assert.deepEqual(host.script.deviceRequests, [{ label: "Spex on lab-1", serverId: SEAT.serverId, personId: SEAT.personId, ticket: "spext_presented" }]);
  assert.deepEqual(await home.client.expectOk("space.signin.cancel", {}), { stopped: true });

  // Off a seat, a start naming a ticket is refused before anything is
  // asked (git-host-27).
  const member = await startHome("seat-ticket-member", { host, project: false });
  t.after(() => member.stop());
  const asked = host.script.requests.length;
  await member.client.expectError("space.signin.start", { url: host.url, ticket: "spext_presented" }, "invalid_request", /^This sign-in is for a server only — sign in on Space$/);
  assert.equal(host.script.requests.length, asked, "nothing is asked of the instance");
  assert.equal(host.script.deviceRequests.length, 1);
});

test("git-host-28, git-host-12: the stand-in grants a pending code on a minted ticket a server's admission spent, for that server and person, once; otherwise and while scripted to keep its page it answers authorization_pending", async () => {
  const host = await startHost();
  // A poll right after the request is not refused slow_down.
  host.script.devicePollFloor = 0;
  const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

  /** A device request as a seat sends it, with the ticket where named. */
  async function device(fields: { ticket?: string; serverId?: string; personId?: string }): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${host.url}/api/v1/auth/device`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: "spex", label: "Spex on lab-1", server_id: fields.serverId, person_id: fields.personId, ticket: fields.ticket }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }
  /** One poll of the token endpoint for a device code. */
  async function poll(deviceCode: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${host.url}/api/v1/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: DEVICE_GRANT, client_id: "spex", device_code: deviceCode }),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }
  /** A ticket the stand-in minted, spent by a server's admission where
   * `spent`, `spentAgoMs` back. */
  function mint(ticket: string, { spent = true, serverId = SEAT.serverId, personId = SEAT.personId, spentAgoMs = 0 } = {}): void {
    host.script.tickets.push({ ticket, serverId, personId, expiresAt: Date.now() + 600_000, spent: false, spentAt: null, signedIn: false });
    if (!spent) return;
    const redeemed = host.script.redeemTicket(ticket);
    assert.ok(!("code" in redeemed && redeemed.code === "ticket_invalid"), `the admission spends ${ticket}`);
    const entry = host.script.tickets.find((candidate) => candidate.ticket === ticket);
    if (spentAgoMs > 0 && entry) entry.spentAt = Date.now() - spentAgoMs;
  }
  /** A fresh device code for a seat's request carrying `ticket`, the
   * request recorded with it (git-host-12, git-host-28). */
  async function codeFor(ticket: string, { serverId = SEAT.serverId, personId = SEAT.personId } = {}): Promise<unknown> {
    const started = await device({ ticket, serverId, personId });
    assert.equal(started.status, 200);
    assert.deepEqual(host.script.deviceRequests.at(-1), { label: "Spex on lab-1", serverId, personId, ticket });
    return started.body.device_code;
  }
  const assertPending = async (deviceCode: unknown, why: string): Promise<void> => {
    const polled = await poll(deviceCode);
    assert.equal(polled.status, 400, why);
    assert.equal((polled.body.error as { code?: string } | undefined)?.code, "authorization_pending", why);
  };
  const assertGranted = async (deviceCode: unknown, why: string): Promise<void> => {
    const polled = await poll(deviceCode);
    assert.equal(polled.status, 200, why);
    assert.equal(typeof polled.body.access_token, "string", why);
    assert.deepEqual(host.script.tokenGrants.at(-1), { grantType: DEVICE_GRANT, ok: true, error: null, ticket: true }, why);
  };

  // A ticket the stand-in minted and a server's admission spent, for that
  // server and person: the first poll grants, without the page
  // (git-host-12).
  mint("spext_spent");
  await assertGranted(await codeFor("spext_spent"), "granted on a spent ticket");
  // Once: a second code carrying that ticket is not granted on it.
  await assertPending(await codeFor("spext_spent"), "a ticket signs one device in");
  // Minted but unspent: no admission spent it.
  mint("spext_unspent", { spent: false });
  await assertPending(await codeFor("spext_unspent"), "an unspent ticket grants nothing");
  // Spent, but the code names another server, or another person.
  mint("spext_other_server");
  await assertPending(await codeFor("spext_other_server", { serverId: "srv_other" }), "another server's code");
  mint("spext_other_person");
  await assertPending(await codeFor("spext_other_person", { personId: "1002" }), "another person's code");
  // Spent more than ten minutes ago.
  mint("spext_stale", { spentAgoMs: 10 * 60_000 + 1 });
  await assertPending(await codeFor("spext_stale"), "a ticket spent over ten minutes ago");
  // A ticket the stand-in never minted.
  await assertPending(await codeFor("spext_unknown"), "an unminted ticket");

  // Scripted to keep its page, as an older instance does: pending; the
  // switch keeps the page only while set (git-host-12).
  host.script.ticketGrants = false;
  mint("spext_kept");
  const kept = await codeFor("spext_kept");
  await assertPending(kept, "the page kept");
  host.script.ticketGrants = true;
  await assertGranted(kept, "granted once the switch is cleared");

  // A ticket comes with the server and the person, or is refused.
  const requests = host.script.deviceRequests.length;
  const alone = await device({ ticket: "spext_alone" });
  assert.equal(alone.status, 400);
  assert.equal((alone.body.error as { code?: string } | undefined)?.code, "invalid_request");
  assert.equal(host.script.deviceRequests.length, requests, "nothing is recorded");
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
  assert.match(refused.signIn.message, /signed you in as @bob — sign in with your own account$/);
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

test("core-service-127, space-102, space-104: on a seat your own group gains no placement at sign-in — nothing created or joined, its namespace's own repository left there — and takes no pick or remote", async (t) => {
  const host = await startHost();
  // The member's own records at the instance, from a device of their own.
  host.script.addRepository({ group: LOGIN, name: `${LOGIN}-spex` });
  const home = await startHome("seat-own", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  const from = home.client.mark();
  await signIn(home, host);
  const read = await home.client.waitSpace(from, (state) => (instanceOf(state, host.url)?.readAt ?? null) !== null && state.signIn.phase === "idle");
  // Renamed after the login as on any home, its clone stays local only
  // with no placement; nothing is created at the instance and its own
  // repository there is neither joined nor cloned (space-102).
  const own = ownRow(read);
  assert.deepEqual([own.key, own.placements, own.instance, own.state], [HOST_OWN, [], null, "local-only"]);
  assert.equal(git(clonePath(home.dataDir, HOST_OWN), "remote"), "", "your own group's clone has no remote");
  assert.deepEqual(host.script.creations, [], "nothing is created at the instance");
  assert.equal(existsSync(clonePath(home.dataDir, hostKey(host, HOST_OWN))), false, "the member's own records are not cloned");
  const after = ownRow(await home.client.expectOk("space.get", {}));
  assert.deepEqual([after.placements, after.state], [[], "local-only"]);

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

test("core-service-125: on a seat server.open is refused with the phrase before anything is asked, while server.list and server.close answer as on any core", async (t) => {
  const host = await startHost();
  host.script.servers.push({ id: "srv_lab9", name: "lab-9", group: "acme", address: "https://127.0.0.1:1" });
  const home = await startHome("seat-open", { host, project: false, extra: { seat: SEAT } });
  t.after(() => home.stop());
  await signIn(home, host);
  // Refused with consent and without it: a seat holds no seats of its
  // own, and nothing is asked of the instance (core-service-125).
  await home.client.expectError("server.open", { instance: host.url, serverId: "srv_lab9", consented: true }, "invalid_request", OPEN_REFUSAL);
  await home.client.expectError("server.open", { instance: host.url, serverId: "srv_lab9" }, "invalid_request", OPEN_REFUSAL);
  assert.deepEqual(host.script.serverCalls, [], "no listing and no ticket was asked");
  assert.deepEqual(host.script.tickets, []);
  assert.equal(existsSync(seatsPath(home.dataDir)), false, "no seat is written");
  // server.list and server.close stay as they are.
  assert.deepEqual(await home.client.expectOk("server.list", {}), { servers: [{ instance: host.url, id: "srv_lab9", name: "lab-9", group: "acme", open: false }], failures: [] });
  await home.client.expectError("server.close", { instance: host.url, serverId: "srv_lab9" }, "not_found", /^Not connected to this server$/);
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

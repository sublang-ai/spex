// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The places of one desktop (core-service-128, core-service-130,
// storage-45, storage-46, DR-133), through a real core against stand-in
// instances and a stand-in hub over TLS: `server.list` names each
// signed-in instance's servers, one instance's failure hiding no
// other's; `server.open` asks nothing without consent, and with it keeps
// the seat's entry owner-only and replies with no bearer; a server the
// listing does not name is no longer shared, no ticket asked; a refusal
// is relayed with its cause and writes nothing, a certificate that does
// not verify read as such; `server.close` removes the entry and
// announces `server.state`; a restarted core lists the seat again from
// its file without a new admission, its watch reconnecting the seat, and
// a seat refusing its bearer at that reopening goes; the seats file is
// written, read back, removed and, in another format, left as it was;
// and no reply, event or log carries the bearer or the endpoint. The
// relay (core-service-129), against a second core relayed to as a seat:
// the relay path admits the local token alone, from the origins `/`
// admits; the relayed hello and replies are the seat's; a seat speaking
// another protocol version reads mismatched alone; the attention count
// adds the seat's badge; a lease's end and a close each remove the path
// and the entry; no frame to the client carries the bearer; and an
// endpoint or a bearer no connection can present is refused at the
// admission and, held in the file, stops neither the core's start nor a
// client's connection.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { inspect } from "node:util";
import { WebSocket } from "ws";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { PROTOCOL_VERSION, type SeatState, type ServerMessage } from "./protocol.js";
import { seatsPath } from "./seats.js";
import { createSpaceHarness, instanceOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import { startStandinHub, type SeatAnswer, type StandinHub } from "./testing/standin-hub.js";

const fixture = createSpaceHarness();
const { startHome, startHost } = fixture;
const hubs: StandinHub[] = [];
test.after(async () => {
  await Promise.all(hubs.map((hub) => hub.close()));
  await fixture.dispose();
});

const SERVER = "srv_lab1";

type Home = Awaited<ReturnType<typeof startHome>>;

/** A stand-in hub redeeming the tickets `host` mints, registered there
 * as `lab-1` in the group `acme`; with `seat`, its relays pipe to that
 * core as the person's seat. */
async function startHub(host: StandinHost, id = SERVER, name = "lab-1", seat?: Home): Promise<StandinHub> {
  const hub = await startStandinHub({ redeem: (ticket) => host.script.redeemTicket(ticket) });
  hubs.push(hub);
  host.script.servers.push({ id, name, group: "acme", address: hub.url });
  if (seat) hub.relayTo(seatUrl(seat));
  return hub;
}

/** A second core standing as the person's seat: a plain core whose
 * endpoint the stand-in hub relays to, with its token. */
async function startSeat(t: TestContext, name: string): Promise<Home & { project: string }> {
  const seat = await startHome(name);
  t.after(() => seat.stop());
  const { key } = await fixture.addFolder(seat, seat.projectDir);
  return { ...seat, project: key };
}

function seatUrl(seat: Home): string {
  return `ws://127.0.0.1:${seat.service.port()}/?token=test`;
}

/** A place's relay path on the core's own endpoint (core-service-129). */
function relayPath(place: string): string {
  return `/seats/${encodeURIComponent(place)}`;
}

async function until(check: () => boolean, what: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting: ${what}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

/** A client connection at a path of a core's endpoint. */
interface Relayed {
  socket: WebSocket;
  /** Every frame it received, as text. */
  frames: string[];
  /** The code it closed with. */
  closed: Promise<number>;
  /** Send a command and wait for its reply. */
  command(type: string, fields?: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: { code: string } }>;
  /** The first frame of a type it received. */
  frame(type: string): Promise<Record<string, unknown>>;
}

/** Connect at `path` of the core on `port` with the token `test` —
 * `token` replacing it, null sending none — and `origin` where given;
 * the status where the core refused the upgrade. */
function connectAt(port: number, path: string, options: { token?: string | null; origin?: string } = {}): Promise<Relayed | { refused: number }> {
  const token = options.token === undefined ? "test" : options.token;
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}${token === null ? "" : `?token=${encodeURIComponent(token)}`}`, options.origin ? { origin: options.origin } : {});
  const frames: string[] = [];
  socket.on("message", (data) => { frames.push(String(data)); });
  const closed = new Promise<number>((resolveClose) => socket.once("close", (code) => resolveClose(code)));
  let next = 0;
  const parsed = (): Record<string, unknown>[] => frames.map((frame) => JSON.parse(frame) as Record<string, unknown>);
  const frame = async (type: string): Promise<Record<string, unknown>> => {
    let found: Record<string, unknown> | undefined;
    await until(() => (found = parsed().find((message) => message.type === type)) !== undefined, `a ${type} frame`);
    return found as Record<string, unknown>;
  };
  const command: Relayed["command"] = async (type, fields = {}) => {
    const id = `relayed-${(next += 1)}`;
    socket.send(JSON.stringify({ type, id, ...fields }));
    let reply: Record<string, unknown> | undefined;
    await until(() => (reply = parsed().find((message) => message.type === "reply" && message.id === id)) !== undefined, `the reply to ${type}`);
    return reply as { ok: boolean; result?: unknown; error?: { code: string } };
  };
  return new Promise((resolveConnect) => {
    socket.on("unexpected-response", (_req, res) => {
      res.resume();
      socket.terminate();
      resolveConnect({ refused: res.statusCode ?? 0 });
    });
    socket.on("error", () => resolveConnect({ refused: 0 }));
    socket.once("open", () => resolveConnect({ socket, frames, closed, command, frame }));
  });
}

function connected(outcome: Relayed | { refused: number }): Relayed {
  assert.ok(!("refused" in outcome), `the upgrade was refused ${"refused" in outcome ? outcome.refused : ""}`);
  return outcome;
}

/** The seats the last `server.state` from `from` on carried. */
async function seatsAfter(messages: () => ServerMessage[], from: number, check: (seats: SeatState[]) => boolean): Promise<SeatState[]> {
  const start = Date.now();
  for (;;) {
    const found = messages().slice(from).filter((m): m is Extract<ServerMessage, { type: "server.state" }> => m.type === "server.state").find((m) => check(m.seats));
    if (found) return found.seats;
    if (Date.now() - start > 10_000) throw new Error("no server.state matched");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

/** Sign a home in at an instance and wait for its host read, so a fault
 * a test scripts next meets the call the test makes. */
async function signIn(home: Awaited<ReturnType<typeof startHome>>, host: StandinHost): Promise<void> {
  const from = home.client.mark();
  await fixture.signIn(home, host);
  await home.client.waitSpace(from, (state) => (instanceOf(state, host.url)?.readAt ?? null) !== null && state.signIn.phase === "idle", 30_000);
}

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

/** Everything the cores in this process log from here on — the
 * console's every level and the standard error — as text, each call
 * passed through as it was. */
function captureLogs(t: TestContext): () => string {
  const spies = [
    ...(["log", "info", "warn", "error", "debug", "trace"] as const).map((level) => t.mock.method(console, level)),
    t.mock.method(process.stderr, "write"),
  ];
  return () => spies
    .flatMap((spy) => spy.mock.calls.flatMap((call) => (call.arguments as unknown[]).map((argument) => typeof argument === "string" ? argument : argument instanceof Uint8Array ? Buffer.from(argument).toString("utf8") : inspect(argument, { depth: 10 }))))
    .join("\n");
}

test("core-service-130: server.list names each signed-in instance's servers, one instance's failure hiding no other's", async (t) => {
  const first = await startHost({ displayName: "First" });
  const second = await startHost({ displayName: "Second" });
  await startHub(first);
  await startHub(second, "srv_lab2", "lab-2");
  const home = await startHome("places-list", { host: first, project: false });
  t.after(() => home.stop());
  await signIn(home, first);
  await signIn(home, second);

  // Each server by its id, name, group and instance, and no seat open.
  const listing = await home.client.expectOk("server.list", {});
  assert.deepEqual(listing, {
    servers: [
      { instance: first.url, id: SERVER, name: "lab-1", group: "acme", open: false },
      { instance: second.url, id: "srv_lab2", name: "lab-2", group: "acme", open: false },
    ],
    failures: [],
  });
  // Each read with its own instance's token.
  assert.equal(first.script.serverCalls.length, 1);
  assert.equal(second.script.serverCalls.length, 1);
  assert.notEqual(first.script.serverCalls[0]?.bearer, second.script.serverCalls[0]?.bearer);

  // The first refusing leaves the second's servers listed (git-host-11).
  first.script.faultServersListing(1, { code: "host_refused", message: "Your account is blocked: contact support." });
  const partial = await home.client.expectOk("server.list", {});
  assert.deepEqual(partial.servers, [{ instance: second.url, id: "srv_lab2", name: "lab-2", group: "acme", open: false }]);
  assert.deepEqual(partial.failures, [{ instance: first.url, message: "First refused: Your account is blocked: contact support." }]);
  // Nothing was asked for a ticket.
  assert.ok([...first.script.serverCalls, ...second.script.serverCalls].every((call) => call.method === "GET"));
});

test("core-service-130, storage-45: server.open asks nothing without consent; with it the seat's entry is written owner-only, the reply carries the place and the expiry alone, and server.close removes the entry and announces server.state", async (t) => {
  const host = await startHost();
  const hub = await startHub(host);
  const home = await startHome("places-open", { host, project: false, extra: { serverCertificateAuthorities: [hub.ca] } });
  t.after(() => home.stop());
  await signIn(home, host);
  const file = seatsPath(home.dataDir);

  // At the connection the core sent the seats it holds: none.
  await seatsAfter(() => home.client.messages, 0, (seats) => seats.length === 0);

  // Without consent: refused, and nothing asked of the instance or the hub.
  await home.client.expectError("server.open", { instance: host.url, serverId: SERVER }, "invalid_request", /^Read and accept the server's contract before opening a seat$/);
  await home.client.expectError("server.open", { instance: host.url, serverId: SERVER, consented: false }, "invalid_request", /contract/);
  assert.equal(host.script.serverCalls.length, 0, "no listing and no ticket was asked");
  assert.equal(host.script.tickets.length, 0);
  assert.equal(hub.admissions.length, 0);
  assert.equal(existsSync(file), false);

  // With consent: a ticket asked with the instance's token, presented at
  // the hub, the seat kept and announced.
  const from = home.client.mark();
  const opened = await home.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  const place = `${host.url}#${SERVER}`;
  assert.deepEqual(Object.keys(opened).sort(), ["leaseExpiresAt", "place"]);
  assert.equal(opened.place, place);
  assert.deepEqual(host.script.serverCalls.map((call) => [call.method, call.path]), [
    ["GET", "/api/v1/host/servers"],
    ["POST", `/api/v1/host/servers/${SERVER}/tickets`],
  ]);
  const [ticket] = host.script.tickets;
  assert.ok(ticket?.spent, "the hub redeemed the ticket at the instance");
  const [admission] = hub.admissions;
  assert.ok(admission?.bearer && admission.endpoint);
  assert.equal(admission.ticket, ticket.ticket);
  const { bearer, endpoint } = admission;

  // The entry, exactly, owner-only under an owner-only local/.
  assert.equal(mode(file), 0o600);
  assert.equal(mode(dirname(file)), 0o700);
  const written = parseYaml(readFileSync(file, "utf8")) as Record<string, unknown>;
  assert.deepEqual(written, { format: 1, seats: { [place]: { name: "lab-1", group: "acme", endpoint, bearer, leaseExpiresAt: opened.leaseExpiresAt } } });
  assert.ok(opened.leaseExpiresAt > Date.now() + 50 * 60_000, "the lease the hub answered, an hour ahead");

  // Announced to every client: the seat by its instance, server, name,
  // group, place, expiry and relay state — connecting, its watch not yet
  // having read the seat's hello.
  const seats = await seatsAfter(() => home.client.messages, from, (state) => state.length === 1);
  assert.deepEqual(seats, [{ instance: host.url, serverId: SERVER, name: "lab-1", group: "acme", place, leaseExpiresAt: opened.leaseExpiresAt, relay: "connecting" }]);
  assert.deepEqual((await home.client.expectOk("server.list", {})).servers, [{ instance: host.url, id: SERVER, name: "lab-1", group: "acme", open: true }]);

  // Close: the entry removed — the file with its last one — and announced.
  const closing = home.client.mark();
  assert.deepEqual(await home.client.expectOk("server.close", { instance: host.url, serverId: SERVER }), { closed: true });
  assert.equal(existsSync(file), false, "the file goes with its last seat");
  await seatsAfter(() => home.client.messages, closing, (state) => state.length === 0);
  assert.equal((await home.client.expectOk("server.list", {})).servers[0]?.open, false);
  await home.client.expectError("server.close", { instance: host.url, serverId: SERVER }, "not_found", /^No seat is open on this server$/);
  assert.equal(hub.admissions.length, 1, "closing asks nothing of the hub");

  // No reply or event to the client carried the bearer, the endpoint or
  // the ticket.
  const frames = JSON.stringify(home.client.messages);
  assert.ok(!frames.includes(bearer), "no frame carries the bearer");
  assert.ok(!frames.includes(endpoint), "no frame carries the endpoint");
  assert.ok(!frames.includes(ticket.ticket), "no frame carries the ticket");
});

test("core-service-130, core-service-128: a restarted core over the same home reopens the seat from its file through its watch without a new admission, and a seat refusing the bearer at the reopening is removed as a close removes it", async (t) => {
  const host = await startHost();
  const seat = await startSeat(t, "places-restart-seat");
  const hub = await startHub(host, SERVER, "lab-1", seat);
  const extra = { serverCertificateAuthorities: [hub.ca] };
  const first = await startHome("places-restart", { host, project: false, extra });
  let firstStopped = false;
  t.after(async () => { if (!firstStopped) await first.stop(); });
  await signIn(first, host);
  const opened = await first.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  await seatsAfter(() => first.client.messages, 0, (state) => state[0]?.relay === "open");
  await first.stop();
  firstStopped = true;
  assert.ok(existsSync(seatsPath(first.dataDir)), "the seat stands in its file across the stop");
  await until(() => hub.relays() === 0, "the stopped core's watch closed");
  const watches = hub.upgrades.length;

  const again = await startHome("places-restart", { host, project: false, extra, dataDir: first.dataDir });
  let againStopped = false;
  t.after(async () => { if (!againStopped) await again.stop(); });
  // Read from the file and reopened through the watch: open again
  // (core-service-128, core-service-129).
  const seats = await seatsAfter(() => again.client.messages, 0, (state) => state[0]?.relay === "open");
  assert.deepEqual(seats, [{ instance: host.url, serverId: SERVER, name: "lab-1", group: "acme", place: opened.place, leaseExpiresAt: opened.leaseExpiresAt, relay: "open" }]);
  assert.ok(hub.upgrades.length > watches, "the watch reconnected the seat");
  assert.ok(hub.upgrades.every((upgrade) => upgrade.status === 101 && upgrade.authorization && !upgrade.origin), "every upgrade presented the bearer and no Origin (hub-3)");
  assert.deepEqual((await again.client.expectOk("server.list", {})).servers, [{ instance: host.url, id: SERVER, name: "lab-1", group: "acme", open: true }]);
  assert.equal(hub.admissions.length, 1, "no new admission");
  assert.equal(host.script.tickets.length, 1, "no new ticket");
  const [admission] = hub.admissions;
  const frames = JSON.stringify(again.client.messages);
  assert.ok(admission?.bearer && !frames.includes(admission.bearer) && admission.endpoint && !frames.includes(admission.endpoint));
  await again.stop();
  againStopped = true;

  // The lease ended meanwhile: the seat refuses the bearer (401) at the
  // next reopening, and the entry goes as a close takes it
  // (core-service-128).
  hub.endLeases();
  const third = await startHome("places-restart", { host, project: false, extra, dataDir: first.dataDir });
  t.after(() => third.stop());
  await seatsAfter(() => third.client.messages, 0, (state) => state.length === 0);
  await until(() => !existsSync(seatsPath(first.dataDir)), "the refused seat's entry removed");
  assert.equal(hub.upgrades.at(-1)?.status, 401, "the seat refused the bearer");
  assert.equal((await third.client.expectOk("server.list", {})).servers[0]?.open, false);
  assert.equal(hub.admissions.length, 1, "a refusal asks no new admission");
});

test("core-service-128: a refusal of the listing, the ticket or the admission is relayed with its cause and writes nothing; a server the listing does not name asks no ticket", async (t) => {
  const host = await startHost();
  const hub = await startHub(host);
  const home = await startHome("places-refusals", { host, project: false, extra: { serverCertificateAuthorities: [hub.ca] } });
  t.after(() => home.stop());
  await signIn(home, host);
  const file = seatsPath(home.dataDir);
  const open = { instance: host.url, serverId: SERVER, consented: true };
  const listing = ["GET", "/api/v1/host/servers"];
  const ticketCall = (id: string): string[] => ["POST", `/api/v1/host/servers/${id}/tickets`];
  /** The servers calls one `server.open` sent. */
  async function refusedOpen(input: typeof open, code: string, message: RegExp): Promise<string[][]> {
    const from = host.script.serverCalls.length;
    await home.client.expectError("server.open", input, code, message);
    return host.script.serverCalls.slice(from).map((call) => [call.method, call.path]);
  }
  const [registered] = host.script.servers;
  assert.ok(registered);
  const needsDeveloper = "a seat on this server needs the Developer role or above in its group";

  // The instance's refusal of its listing, in its words; no ticket asked.
  host.script.faultServersListing(1, { code: "host_refused", message: "Your account is blocked: contact support." });
  assert.deepEqual(await refusedOpen(open, "invalid_request", /^Stand-in Git host refused: Your account is blocked: contact support\.$/), [listing]);

  // A server the listing does not name is no longer shared, and no
  // ticket is asked for it: one the listing leaves out — as it leaves out
  // a server whose group the person holds below Developer — and one the
  // instance does not know (core-service-128).
  registered.listed = false;
  assert.deepEqual(await refusedOpen(open, "not_found", /^No longer shared with you$/), [listing]);
  registered.listed = true;
  assert.deepEqual(await refusedOpen({ ...open, serverId: "srv_gone" }, "not_found", /^No longer shared with you$/), [listing]);

  // A listed server's ticket refused, in the instance's words
  // (git-host-11).
  host.script.faultTickets(1, { code: "host_refused", message: needsDeveloper });
  assert.deepEqual(await refusedOpen(open, "invalid_request", new RegExp(`^Stand-in Git host refused: ${needsDeveloper}$`)), [listing, ticketCall(SERVER)]);
  // The instance's not_found of a listed server's ticket as no longer
  // shared: gone by the ticket's asking.
  host.script.faultTickets(1, { code: "not_found" });
  assert.deepEqual(await refusedOpen(open, "not_found", /^No longer shared with you$/), [listing, ticketCall(SERVER)]);
  assert.equal(host.script.tickets.length, 0, "no refused call minted a ticket");
  assert.equal(hub.admissions.length, 0, "nothing reached the hub");

  // The hub's refusals, with their cause (hub-2).
  hub.refuse(1, 401, "ticket_invalid", "The ticket is not valid.");
  await home.client.expectError("server.open", open, "invalid_request", /^lab-1 refused the seat: The ticket is not valid\.$/);
  hub.refuse(1, 503, "seat_unavailable", "seat 1001 did not start within 30 seconds");
  await home.client.expectError("server.open", open, "invalid_request", /^lab-1 could not start your seat: seat 1001 did not start within 30 seconds$/);
  hub.refuse(1, 502, "instance_unreachable", "the instance did not answer");
  await home.client.expectError("server.open", open, "invalid_request", /^lab-1 could not reach Stand-in Git host$/);

  // The instance's 429 on the ticket with its seconds (git-host-11) —
  // last, as the instance is held meanwhile (git-host-21).
  host.script.faultTickets(1, { code: "rate_limited", retryAfter: "12" });
  assert.deepEqual(await refusedOpen(open, "invalid_request", /^Stand-in Git host asks to wait 12 seconds$/), [listing, ticketCall(SERVER)]);
  assert.equal(existsSync(file), false, "no refusal writes a seat");

  // A hub whose certificate the core does not trust is not reached: no
  // verification is turned off, and the person reads the certificate,
  // not a server out of reach.
  const untrusted = await startHome("places-untrusted", { host, project: false });
  t.after(() => untrusted.stop());
  await signIn(untrusted, host);
  const before = hub.admissions.length;
  await untrusted.client.expectError("server.open", open, "invalid_request", /^lab-1's certificate could not be verified$/);
  assert.equal(hub.admissions.length, before, "the admission never reached the hub");
  assert.equal(existsSync(seatsPath(untrusted.dataDir)), false);
  // A server no connection reaches reads otherwise.
  host.script.servers.push({ id: "srv_down", name: "lab-down", group: "acme", address: "https://127.0.0.1:1" });
  await untrusted.client.expectError("server.open", { ...open, serverId: "srv_down" }, "invalid_request", /^Could not reach lab-down$/);
  assert.equal(existsSync(seatsPath(untrusted.dataDir)), false);
  assert.ok(!JSON.stringify([...home.client.messages, ...untrusted.client.messages]).includes("spext_"), "no frame carries a ticket");
});

test("storage-46: the seats file is written owner-only under an owner-only local/ at an open, read back at the next start with every entry, removed at the close of its last entry; a file of another format is refused at an open and a close and left byte for byte; the bearer is in no reply, event or log", async (t) => {
  const logs = captureLogs(t);
  const host = await startHost();
  const hub = await startHub(host);
  // A second server at the same hub, in the same group.
  host.script.servers.push({ id: "srv_lab2", name: "lab-2", group: "acme", address: hub.url });
  const extra = { serverCertificateAuthorities: [hub.ca] };
  const first = await startHome("places-seats-file", { host, project: false, extra });
  let firstStopped = false;
  t.after(async () => { if (!firstStopped) await first.stop(); });
  await signIn(first, host);
  const file = seatsPath(first.dataDir);
  const one = `${host.url}#${SERVER}`;
  const two = `${host.url}#srv_lab2`;

  // Written at an open, owner-only under an owner-only local/
  // (storage-46): exactly the seat the open kept.
  const openedOne = await first.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  assert.equal(mode(file), 0o600, "the seats file is owner-only (storage-46)");
  assert.equal(mode(dirname(file)), 0o700, "local/ is owner-only (storage-46)");
  const [admittedOne] = hub.admissions;
  assert.ok(admittedOne?.bearer && admittedOne.endpoint);
  const entryOne = { name: "lab-1", group: "acme", endpoint: admittedOne.endpoint, bearer: admittedOne.bearer, leaseExpiresAt: openedOne.leaseExpiresAt };
  assert.deepEqual(parseYaml(readFileSync(file, "utf8")), { format: 1, seats: { [one]: entryOne } }, "the open's entry, exactly (storage-46)");
  // A second open adds its entry beside the first, the file owner-only
  // still (storage-46).
  const openedTwo = await first.client.expectOk("server.open", { instance: host.url, serverId: "srv_lab2", consented: true });
  const admittedTwo = hub.admissions[1];
  assert.ok(admittedTwo?.bearer && admittedTwo.endpoint);
  const entryTwo = { name: "lab-2", group: "acme", endpoint: admittedTwo.endpoint, bearer: admittedTwo.bearer, leaseExpiresAt: openedTwo.leaseExpiresAt };
  assert.deepEqual(parseYaml(readFileSync(file, "utf8")), { format: 1, seats: { [one]: entryOne, [two]: entryTwo } }, "every open's entry (storage-46)");
  assert.equal(mode(file), 0o600, "owner-only after every write (storage-46)");
  assert.equal(mode(dirname(file)), 0o700);
  const written = readFileSync(file);
  await first.stop();
  firstStopped = true;

  // Read back at the next start with every entry (storage-46): sent at
  // the connection, listed open, with no new ticket or admission and
  // the file as the opens left it.
  const again = await startHome("places-seats-file", { host, project: false, extra, dataDir: first.dataDir });
  t.after(() => again.stop());
  const seats = await seatsAfter(() => again.client.messages, 0, (state) => state.length === 2);
  // The hub relays to no seat here: each relay reads connecting or closed.
  assert.deepEqual(seats.map(({ relay: _relay, ...seat }) => seat), [
    { instance: host.url, serverId: SERVER, name: "lab-1", group: "acme", place: one, leaseExpiresAt: openedOne.leaseExpiresAt },
    { instance: host.url, serverId: "srv_lab2", name: "lab-2", group: "acme", place: two, leaseExpiresAt: openedTwo.leaseExpiresAt },
  ], "every entry read back at the next start (storage-46)");
  assert.deepEqual((await again.client.expectOk("server.list", {})).servers.map((server) => [server.id, server.open]), [[SERVER, true], ["srv_lab2", true]]);
  assert.equal(hub.admissions.length, 2, "no new admission at the start");
  assert.equal(host.script.tickets.length, 2, "no new ticket at the start");
  assert.ok(readFileSync(file).equals(written), "the start rewrote nothing");

  // Removed at the close of its last entry (storage-46): the first close
  // leaves the other entry, owner-only; the last takes the file.
  assert.deepEqual(await again.client.expectOk("server.close", { instance: host.url, serverId: SERVER }), { closed: true });
  assert.deepEqual(parseYaml(readFileSync(file, "utf8")), { format: 1, seats: { [two]: entryTwo } }, "the other entry stays (storage-46)");
  assert.equal(mode(file), 0o600);
  assert.deepEqual(await again.client.expectOk("server.close", { instance: host.url, serverId: "srv_lab2" }), { closed: true });
  assert.equal(existsSync(file), false, "the file goes with its last entry (storage-46)");

  // A file of another format is refused at an open and a close and left
  // byte for byte as it was (storage-46); the open asks nothing.
  const foreign = Buffer.from(`# a later Spex's seats\nformat: 2\nseats:\n  "${one}":\n    name: lab-1\n    future: kept\n`, "utf8");
  writeFileSync(file, foreign, { mode: 0o600 });
  const calls = host.script.serverCalls.length;
  const refusal = /unsupported format 2; preserved unchanged$/;
  await again.client.expectError("server.open", { instance: host.url, serverId: SERVER, consented: true }, "invalid_request", refusal);
  assert.ok(readFileSync(file).equals(foreign), "an open leaves the file byte for byte (storage-46)");
  assert.equal(host.script.serverCalls.length, calls, "the refused open asked no listing and no ticket");
  assert.equal(hub.admissions.length, 2, "nor any admission");
  await again.client.expectError("server.close", { instance: host.url, serverId: SERVER }, "invalid_request", refusal);
  assert.ok(readFileSync(file).equals(foreign), "a close leaves the file byte for byte (storage-46)");

  // The bearer — and the endpoint beside it — in no reply, event or log
  // (storage-46).
  const frames = JSON.stringify([...first.client.messages, ...again.client.messages]);
  const logged = logs();
  for (const entry of [entryOne, entryTwo]) {
    assert.ok(!frames.includes(entry.bearer), "no reply or event carries a bearer (storage-46)");
    assert.ok(!logged.includes(entry.bearer), "no log carries a bearer (storage-46)");
    assert.ok(!frames.includes(entry.endpoint) && !logged.includes(entry.endpoint), "nor an endpoint");
  }
});

test("core-service-130: the relay path admits the local token from the origins / admits and refuses a wrong token and a foreign origin; the relayed hello and a project.list are the seat's; no frame to the client carries the bearer", async (t) => {
  const logs = captureLogs(t);
  const host = await startHost();
  const seat = await startSeat(t, "places-relay-seat");
  const hub = await startHub(host, SERVER, "lab-1", seat);
  const home = await startHome("places-relay", { host, project: false, extra: { serverCertificateAuthorities: [hub.ca] } });
  t.after(() => home.stop());
  await signIn(home, host);
  const port = home.service.port();
  const place = `${host.url}#${SERVER}`;
  const path = relayPath(place);

  // No seat open: the path is refused.
  assert.deepEqual(await connectAt(port, path), { refused: 401 }, "no relay path before the seat is open");

  // Opened: connecting, then open once the watch read the seat's hello
  // (core-service-128, core-service-129).
  const from = home.client.mark();
  await home.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  const states = (): SeatState["relay"][] => home.client.messages.slice(from).flatMap((m) => (m.type === "server.state" ? m.seats.map((one) => one.relay) : []));
  await seatsAfter(() => home.client.messages, from, (seats) => seats[0]?.relay === "open");
  assert.deepEqual(states().slice(0, 2), ["connecting", "open"]);
  const [admission] = hub.admissions;
  assert.ok(admission?.bearer && admission.endpoint);

  // Admitted as / is (core-service-24): the local token, from no Origin
  // or the packaged renderer's; a wrong or missing token, a foreign
  // origin and any other path refused.
  assert.deepEqual(await connectAt(port, path, { token: "wrong" }), { refused: 401 });
  assert.deepEqual(await connectAt(port, path, { token: null }), { refused: 401 });
  assert.deepEqual(await connectAt(port, path, { origin: "https://evil.example" }), { refused: 401 });
  assert.deepEqual(await connectAt(port, relayPath(`${host.url}#srv_other`)), { refused: 401 });
  assert.deepEqual(await connectAt(port, `${path}/more`), { refused: 401 });
  assert.deepEqual(await connectAt(port, "/elsewhere"), { refused: 401 });
  const renderer = connected(await connectAt(port, path, { origin: "file://" }));
  const relayed = connected(await connectAt(port, path));

  // The hello relayed is the seat's, and what follows it too: the seat
  // holds no seat of its own, where this core holds one.
  const hello = await relayed.frame("hello");
  assert.equal(JSON.parse(relayed.frames[0] ?? "{}").type, "hello", "the seat's hello comes first, no word of this core's before it");
  assert.equal(hello.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual((await relayed.frame("server.state")).seats, [], "the seat's own server.state");
  // A project.list round-trips: the seat's projects, not this core's.
  const listed = await relayed.command("project.list");
  assert.ok(listed.ok);
  assert.deepEqual((listed.result as { id: string }[]).map((project) => project.id), [seat.project]);
  assert.deepEqual((await seat.client.expectOk("project.list", {})).map((project) => project.id), [seat.project]);
  assert.deepEqual(await home.client.expectOk("project.list", {}), [], "this core lists none of its own");
  // The renderer's connection is its own, request ids its own.
  const fromRenderer = await renderer.command("project.list");
  assert.ok(fromRenderer.ok);

  // Each client connection had one connection of its own to the seat,
  // beside the watch, every one presenting the bearer and no Origin
  // (hub-3).
  assert.equal(hub.relays(), 3, "the watch and one per client connection");
  assert.ok(hub.upgrades.length >= 3 && hub.upgrades.every((upgrade) => upgrade.status === 101 && upgrade.authorization && !upgrade.origin), JSON.stringify(hub.upgrades));
  // A client closing closes its connection to the seat.
  renderer.socket.close(1000);
  assert.equal(await renderer.closed, 1000);
  await until(() => hub.relays() === 2, "the renderer's connection to the seat closed");

  // No frame to a client carries the bearer or the endpoint, and no log.
  const frames = JSON.stringify([...home.client.messages, ...relayed.frames, ...renderer.frames]);
  assert.ok(!frames.includes(admission.bearer), "no frame carries the bearer");
  assert.ok(!frames.includes(admission.endpoint), "no frame carries the endpoint");
  const logged = logs();
  assert.ok(!logged.includes(admission.bearer) && !logged.includes(admission.endpoint), "no log carries the bearer or the endpoint");
  relayed.socket.close();
});

test("core-service-130: a seat whose hello carries another protocol version reads mismatched alone, its watch reconnecting no more", async (t) => {
  const host = await startHost();
  const seat = await startSeat(t, "places-mismatch-seat");
  const hub = await startHub(host, SERVER, "lab-1", seat);
  const other = await startHub(host, "srv_lab2", "lab-2", seat);
  other.helloVersion(PROTOCOL_VERSION + 1);
  const home = await startHome("places-mismatch", { host, project: false, extra: { serverCertificateAuthorities: [hub.ca] } });
  t.after(() => home.stop());
  await signIn(home, host);
  await home.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  await home.client.expectOk("server.open", { instance: host.url, serverId: "srv_lab2", consented: true });
  const seats = await seatsAfter(() => home.client.messages, 0, (state) => state.length === 2 && state[0]?.relay === "open" && state[1]?.relay === "mismatched");
  assert.deepEqual(seats.map((one) => [one.serverId, one.relay]), [[SERVER, "open"], ["srv_lab2", "mismatched"]]);
  // The mismatched watch stops reconnecting; the other seat stays open.
  const asked = other.upgrades.length;
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
  assert.equal(other.upgrades.length, asked, "no reconnection after a mismatch");
  assert.equal(other.relays(), 0, "the mismatched watch closed");
  assert.equal(hub.relays(), 1, "the other seat's watch stands");
  const last = home.client.messages.filter((m): m is Extract<ServerMessage, { type: "server.state" }> => m.type === "server.state").at(-1);
  assert.deepEqual(last?.seats.map((one) => [one.serverId, one.relay]), [[SERVER, "open"], ["srv_lab2", "mismatched"]]);
});

test("core-service-130: the attention count is this core's badge plus each open seat's last read badge, re-read on the seat's intents.changed", async (t) => {
  const host = await startHost();
  const seat = await startSeat(t, "places-attention-seat");
  const hub = await startHub(host, SERVER, "lab-1", seat);
  const home = await startHome("places-attention", { host, extra: { serverCertificateAuthorities: [hub.ca] } });
  t.after(() => home.stop());
  await signIn(home, host);
  let told = 0;
  /** The count the shell read at each time it was told. */
  const read: number[] = [];
  home.service.events.onLedgerChange = () => {
    told += 1;
    read.push(home.service.attentionCount());
  };
  await home.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  await seatsAfter(() => home.client.messages, 0, (state) => state[0]?.relay === "open");
  assert.equal(home.service.attentionCount(), 0);

  // A finished turn on the seat summons there: the watch re-reads the
  // seat's badge on its intents.changed, and the shell is told.
  await fixture.runTurn(seat, seat.project, "Seat work");
  await until(() => home.service.attentionCount() === 1, "the seat's badge counted");
  assert.equal((await seat.client.expectOk("ledger.get", {})).badge, 1);
  assert.equal(home.service.ledger().badge, 0, "this core's own badge is untouched");
  // This core's badge reads 0 throughout: a telling that reads 1 is the
  // seat's badge moving, not this core's ledger.
  await until(() => read.includes(1), "the shell was told the seat's badge moved");

  // This core's own summons adds to it.
  const { key } = await fixture.addFolder(home, home.projectDir);
  await fixture.runTurn(home, key, "Local work");
  await until(() => home.service.ledger().badge === 1, "this core's badge");
  assert.equal(home.service.attentionCount(), 2);

  // The seat closed: its badge counts no more, and the shell is told.
  const before = told;
  await home.client.expectOk("server.close", { instance: host.url, serverId: SERVER });
  assert.equal(home.service.attentionCount(), 1);
  assert.ok(told > before, "the shell was told the seat's badge left");
});

test("core-service-130: a lease-end close and server.close each remove the relay path and the entry and announce server.state", async (t) => {
  const host = await startHost();
  const seat = await startSeat(t, "places-ends-seat");
  const hub = await startHub(host, SERVER, "lab-1", seat);
  const home = await startHome("places-ends", { host, project: false, extra: { serverCertificateAuthorities: [hub.ca] } });
  t.after(() => home.stop());
  await signIn(home, host);
  const port = home.service.port();
  const place = `${host.url}#${SERVER}`;
  const path = relayPath(place);
  const file = seatsPath(home.dataDir);

  // The lease ends at the server: every relay closed with 4401, the
  // seat removed as a close removes it, and announced.
  await home.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  await seatsAfter(() => home.client.messages, 0, (state) => state[0]?.relay === "open");
  const relayed = connected(await connectAt(port, path));
  await relayed.frame("hello");
  const ending = home.client.mark();
  hub.endLeases();
  assert.equal(await relayed.closed, 4401, "the client's relay closed with the lease-end code");
  await seatsAfter(() => home.client.messages, ending, (state) => state.length === 0);
  await until(() => !existsSync(file), "the entry removed");
  assert.deepEqual(await connectAt(port, path), { refused: 401 }, "the path is gone");
  const afterEnd = hub.upgrades.length;
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_200));
  assert.equal(hub.upgrades.length, afterEnd, "the watch reconnects no more");

  // Opened again, then closed: the client's relay ends, the path goes,
  // the entry too, announced; the lease goes on at the server.
  const reopened = home.client.mark();
  await home.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  await seatsAfter(() => home.client.messages, reopened, (state) => state[0]?.relay === "open");
  const again = connected(await connectAt(port, path));
  await again.frame("hello");
  const closing = home.client.mark();
  assert.deepEqual(await home.client.expectOk("server.close", { instance: host.url, serverId: SERVER }), { closed: true });
  await again.closed;
  await seatsAfter(() => home.client.messages, closing, (state) => state.length === 0);
  assert.equal(existsSync(file), false);
  assert.deepEqual(await connectAt(port, path), { refused: 401 }, "the path is gone");
  await until(() => hub.relays() === 0, "every connection to the seat closed");
  const frames = JSON.stringify([...home.client.messages, ...relayed.frames, ...again.frames]);
  for (const admission of hub.admissions) {
    assert.ok(admission.bearer && !frames.includes(admission.bearer), "no frame carries a bearer");
  }
});

test("core-service-128, core-service-129: an admission whose endpoint or bearer no connection can present is refused and writes nothing; a seats file holding one still starts the core, the seat reading closed and never reconnecting, and a client at its relay path is closed while the core serves on", async (t) => {
  const logs = captureLogs(t);
  const host = await startHost();
  const seat = await startSeat(t, "places-unusable-seat");
  const hub = await startHub(host, SERVER, "lab-1", seat);
  host.script.servers.push({ id: "srv_lab2", name: "lab-2", group: "acme", address: hub.url });
  const extra = { serverCertificateAuthorities: [hub.ca] };
  const first = await startHome("places-unusable", { host, project: false, extra });
  let firstStopped = false;
  t.after(async () => { if (!firstStopped) await first.stop(); });
  await signIn(first, host);
  const file = seatsPath(first.dataDir);
  const open = { instance: host.url, serverId: SERVER, consented: true };

  // The hub answers an endpoint with a fragment or credentials, or a
  // bearer no Authorization header carries: no seat, nothing kept, no
  // connection tried with it.
  const unusable: ((answer: SeatAnswer) => SeatAnswer)[] = [
    (answer) => ({ ...answer, endpoint: `${answer.endpoint}#frag` }),
    (answer) => ({ ...answer, endpoint: answer.endpoint.replace("wss://", "wss://ada:secret@") }),
    (answer) => ({ ...answer, bearer: `${answer.bearer}\r\nX-Injected: 1` }),
    (answer) => ({ ...answer, bearer: `${answer.bearer}\u0100` }),
  ];
  for (const alter of unusable) {
    hub.misanswer(1, alter);
    await first.client.expectError("server.open", open, "invalid_request", /^lab-1 answered no seat$/);
    assert.equal(existsSync(file), false, "an unusable admission writes no seat");
  }
  assert.equal(hub.admissions.length, unusable.length);
  assert.equal(hub.upgrades.length, 0, "no connection was tried with an unusable admission");

  // Two seats opened as they should be, then their file altered while
  // the core is down: one endpoint carrying a fragment, the other bearer
  // one no header carries.
  const one = `${host.url}#${SERVER}`;
  const two = `${host.url}#srv_lab2`;
  await first.client.expectOk("server.open", open);
  await first.client.expectOk("server.open", { ...open, serverId: "srv_lab2" });
  await seatsAfter(() => first.client.messages, 0, (state) => state.length === 2 && state.every((each) => each.relay === "open"));
  await first.stop();
  firstStopped = true;
  await until(() => hub.relays() === 0, "the stopped core's watches closed");
  const doc = parseYaml(readFileSync(file, "utf8")) as { format: 1; seats: Record<string, { endpoint: string; bearer: string }> };
  const [seatOne, seatTwo] = [doc.seats[one], doc.seats[two]];
  assert.ok(seatOne && seatTwo);
  seatOne.endpoint = `${seatOne.endpoint}#frag`;
  seatTwo.bearer = `${seatTwo.bearer}\u0100`;
  writeFileSync(file, stringifyYaml(doc), { mode: 0o600 });
  const upgrades = hub.upgrades.length;

  // The core starts over that file: both seats listed, each reading
  // closed, neither reached nor retried.
  const again = await startHome("places-unusable", { host, project: false, extra, dataDir: first.dataDir });
  t.after(() => again.stop());
  const seats = await seatsAfter(() => again.client.messages, 0, (state) => state.length === 2);
  assert.deepEqual(seats.map((each) => [each.place, each.relay]), [[one, "closed"], [two, "closed"]]);
  await new Promise((resolveWait) => setTimeout(resolveWait, 1_200));
  assert.equal(hub.upgrades.length, upgrades, "no connection was tried with an unusable entry, nor retried");

  // A client at either relay path is admitted and closed, the core
  // serving on.
  const port = again.service.port();
  for (const place of [one, two]) {
    const relayed = connected(await connectAt(port, relayPath(place)));
    assert.equal(await relayed.closed, 1011, "the client's relay closed: the seat cannot be reached");
    assert.deepEqual(relayed.frames, [], "no frame relayed");
  }
  assert.equal(hub.upgrades.length, upgrades, "no connection to the seat was tried");
  assert.deepEqual((await again.client.expectOk("server.list", {})).servers.map((server) => [server.id, server.open]), [[SERVER, true], ["srv_lab2", true]]);

  // Each closes as any seat does, its entry removed and announced.
  for (const serverId of [SERVER, "srv_lab2"]) {
    assert.deepEqual(await again.client.expectOk("server.close", { instance: host.url, serverId }), { closed: true });
  }
  await seatsAfter(() => again.client.messages, 0, (state) => state.length === 0);
  assert.equal(existsSync(file), false);

  // Neither an altered endpoint nor bearer reached a client or a log.
  const frames = JSON.stringify([...first.client.messages, ...again.client.messages]);
  const logged = logs();
  for (const admission of hub.admissions) {
    assert.ok(admission.bearer && admission.endpoint);
    assert.ok(!frames.includes(admission.bearer) && !logged.includes(admission.bearer), "no frame or log carries a bearer");
    assert.ok(!frames.includes(admission.endpoint) && !logged.includes(admission.endpoint), "no frame or log carries an endpoint");
  }
});

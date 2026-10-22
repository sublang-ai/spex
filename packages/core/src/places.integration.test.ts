// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The places of one desktop (core-service-128, core-service-130,
// storage-45, DR-133), through a real core against stand-in instances
// and a stand-in hub over TLS: `server.list` names each signed-in
// instance's servers, one instance's failure hiding no other's;
// `server.open` asks nothing without consent, and with it keeps the
// seat's entry owner-only and replies with no bearer; a refusal is
// relayed with its cause and writes nothing; `server.close` removes the
// entry and announces `server.state`; a restarted core lists the seat
// again from its file without a new admission; and no reply or event to
// a client carries the bearer or the endpoint. The relay itself
// (core-service-129) is not yet here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import type { SeatState, ServerMessage } from "./protocol.js";
import { seatsPath } from "./seats.js";
import { createSpaceHarness, instanceOf } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import { startStandinHub, type StandinHub } from "./testing/standin-hub.js";

const fixture = createSpaceHarness();
const { startHome, startHost } = fixture;
const hubs: StandinHub[] = [];
test.after(async () => {
  await Promise.all(hubs.map((hub) => hub.close()));
  await fixture.dispose();
});

const SERVER = "srv_lab1";

/** A stand-in hub redeeming the tickets `host` mints, registered there
 * as `lab-1` in the group `acme`. */
async function startHub(host: StandinHost, id = SERVER, name = "lab-1"): Promise<StandinHub> {
  const hub = await startStandinHub({ redeem: (ticket) => host.script.redeemTicket(ticket) });
  hubs.push(hub);
  host.script.servers.push({ id, name, group: "acme", address: hub.url });
  return hub;
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
  // group, place, expiry and relay state.
  const seats = await seatsAfter(() => home.client.messages, from, (state) => state.length === 1);
  assert.deepEqual(seats, [{ instance: host.url, serverId: SERVER, name: "lab-1", group: "acme", place, leaseExpiresAt: opened.leaseExpiresAt, relay: "open" }]);
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

test("core-service-130: a restarted core over the same home lists the seat again from its file without a new admission", async (t) => {
  const host = await startHost();
  const hub = await startHub(host);
  const extra = { serverCertificateAuthorities: [hub.ca] };
  const first = await startHome("places-restart", { host, project: false, extra });
  let firstStopped = false;
  t.after(async () => { if (!firstStopped) await first.stop(); });
  await signIn(first, host);
  const opened = await first.client.expectOk("server.open", { instance: host.url, serverId: SERVER, consented: true });
  await first.stop();
  firstStopped = true;
  assert.ok(existsSync(seatsPath(first.dataDir)), "the seat stands in its file across the stop");

  const again = await startHome("places-restart", { host, project: false, extra, dataDir: first.dataDir });
  t.after(() => again.stop());
  // Sent at the connection, read from the file.
  const seats = await seatsAfter(() => again.client.messages, 0, (state) => state.length === 1);
  assert.deepEqual(seats, [{ instance: host.url, serverId: SERVER, name: "lab-1", group: "acme", place: opened.place, leaseExpiresAt: opened.leaseExpiresAt, relay: "open" }]);
  assert.deepEqual((await again.client.expectOk("server.list", {})).servers, [{ instance: host.url, id: SERVER, name: "lab-1", group: "acme", open: true }]);
  assert.equal(hub.admissions.length, 1, "no new admission");
  assert.equal(host.script.tickets.length, 1, "no new ticket");
  const [admission] = hub.admissions;
  const frames = JSON.stringify(again.client.messages);
  assert.ok(admission?.bearer && !frames.includes(admission.bearer) && admission.endpoint && !frames.includes(admission.endpoint));
});

test("core-service-128: a refusal of the listing, the ticket or the admission is relayed with its cause and writes nothing", async (t) => {
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

  // A member below the role a seat needs: the listing leaves the server
  // out, the ticket is asked all the same and the instance's refusal of
  // it is what the person reads, in its words (git-host-11).
  registered.listed = false;
  host.script.faultTickets(1, { code: "host_refused", message: needsDeveloper });
  assert.deepEqual(await refusedOpen(open, "invalid_request", new RegExp(`^Stand-in Git host refused: ${needsDeveloper}$`)), [listing, ticketCall(SERVER)]);
  // Listed, its ticket refused all the same.
  registered.listed = true;
  host.script.faultTickets(1, { code: "host_refused", message: needsDeveloper });
  assert.deepEqual(await refusedOpen(open, "invalid_request", new RegExp(`^Stand-in Git host refused: ${needsDeveloper}$`)), [listing, ticketCall(SERVER)]);

  // The instance's not_found of the ticket as no longer shared: a server
  // it does not know, and a listed one gone by the ticket's asking.
  assert.deepEqual(await refusedOpen({ ...open, serverId: "srv_gone" }, "not_found", /^No longer shared with you$/), [listing, ticketCall("srv_gone")]);
  host.script.faultTickets(1, { code: "not_found" });
  assert.deepEqual(await refusedOpen(open, "not_found", /^No longer shared with you$/), [listing, ticketCall(SERVER)]);
  assert.equal(host.script.tickets.length, 0, "no refused call minted a ticket");

  // A ticket minted for a server the listing leaves out is never
  // presented: the listing no longer shares it.
  registered.listed = false;
  assert.deepEqual(await refusedOpen(open, "not_found", /^No longer shared with you$/), [listing, ticketCall(SERVER)]);
  registered.listed = true;
  const [unpresented] = host.script.tickets;
  assert.ok(unpresented && !unpresented.spent, "the ticket was never presented");
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
  // verification is turned off.
  const untrusted = await startHome("places-untrusted", { host, project: false });
  t.after(() => untrusted.stop());
  await signIn(untrusted, host);
  const before = hub.admissions.length;
  await untrusted.client.expectError("server.open", open, "invalid_request", /^Could not reach lab-1$/);
  assert.equal(hub.admissions.length, before, "the admission never reached the hub");
  assert.equal(existsSync(seatsPath(untrusted.dataDir)), false);
  assert.ok(!JSON.stringify([...home.client.messages, ...untrusted.client.messages]).includes("spext_"), "no frame carries a ticket");
});

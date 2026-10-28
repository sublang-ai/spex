// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The local team server end to end (scripts/team-server-local.mjs): a
// member's served shell signs in at the stand-in instance, lists the
// server, opens a seat through the real hub over TLS — the fake helper
// starting the real server shell in seat mode — and relays it to the
// seat's core; the stop retires the server and leaves no process and no
// scratch directory.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { freePort, startLocalTeamServer } from "./team-server-local.mjs";

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A protocol client of a core's endpoint, over Node's own WebSocket. */
async function connect(url) {
  const socket = new WebSocket(url);
  const messages = [];
  socket.addEventListener("message", (event) => messages.push(JSON.parse(String(event.data))));
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", () => resolveOpen());
    socket.addEventListener("error", () => rejectOpen(new Error(`no connection at ${url.replace(/token=[^&]+/, "token=…")}`)));
  });
  let next = 0;
  const waitFor = async (check, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = messages.find(check);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(`timeout; got ${JSON.stringify(messages.map((message) => message.type))}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
  };
  const command = async (type, fields = {}) => {
    const id = `tsl${(next += 1)}`;
    socket.send(JSON.stringify({ type, id, ...fields }));
    const reply = await waitFor((message) => message.type === "reply" && message.id === id);
    if (!reply.ok) throw new Error(`${type} failed: ${reply.error.code} ${reply.error.message}`);
    return reply.result;
  };
  await waitFor((message) => message.type === "hello");
  return { messages, waitFor, command, close: () => socket.close() };
}

test("a member's core signs in, lists the server, opens a seat through the real hub and relays it; the stop leaves nothing running", { timeout: 90_000 }, async (t) => {
  const lines = [];
  const server = await startLocalTeamServer({
    members: 1,
    autoApprove: true,
    hubPort: await freePort(),
    out: (line) => lines.push(line),
  });
  let closed = false;
  t.after(async () => {
    if (!closed) await server.close();
  });
  const [member] = server.clients;
  const instance = server.hosts[0].url;
  const endpoint = member.origin.replace(/^http/, "ws");
  const core = await connect(`${endpoint}/?token=${member.token}`);
  let seatPid;
  try {
    // The served shell signs in by the device flow, approved at the
    // stand-in by the simulation.
    const started = await core.command("space.signin.start", { url: instance });
    assert.equal(started.flow, "device");
    await core.waitFor(
      (message) =>
        message.type === "space.state" &&
        message.state.signIn.phase === "idle" &&
        message.state.instances.some((entry) => entry.origin === instance && entry.signedIn),
    );

    const listing = await core.command("server.list");
    assert.deepEqual(listing, {
      servers: [{ instance, id: server.serverId, name: "Local team server", group: "acme", open: false }],
      failures: [],
    });

    // The ticket redeemed through the front, the seat started by the
    // helper, the bearer answered over TLS the core trusts.
    const opened = await core.command("server.open", { instance, serverId: server.serverId, consented: true });
    assert.deepEqual(Object.keys(opened).sort(), ["leaseExpiresAt", "place"]);
    assert.equal(opened.place, `${instance}#${server.serverId}`);
    assert.ok(opened.leaseExpiresAt > Date.now(), "the lease runs ahead");
    await core.waitFor(
      (message) =>
        message.type === "server.state" &&
        message.seats.some((seat) => seat.place === opened.place && seat.relay === "open"),
      30_000,
    );
    const seatDir = join(server.runDir, "1001");
    assert.ok(existsSync(join(seatDir, "core.sock")), "the seat listens on its socket in the hub's run directory");
    assert.ok(existsSync(join(seatDir, "token")), "the helper wrote the seat's token there");
    seatPid = Number(readFileSync(join(seatDir, "seat.pid"), "utf8"));
    assert.ok(alive(seatPid), "the seat runs");

    // The relay path reaches the seat's own core through the hub.
    const seat = await connect(`${endpoint}/seats/${encodeURIComponent(opened.place)}?token=${member.token}`);
    try {
      assert.deepEqual(await seat.command("session.list"), []);
    } finally {
      seat.close();
    }
  } finally {
    core.close();
  }
  assert.ok(lines.some((line) => line.startsWith("[hub] [spex-hub] admitted ada (1001)")), "the hub admitted the member");

  const pids = [seatPid, server.hub.pid, member.child.pid];
  const dir = server.dir;
  await server.close();
  closed = true;
  assert.ok(lines.some((line) => /^\[hub-retire\] retired: 1 seat\(s\) stopped/.test(line)), "the stop retired the server");
  for (const pid of pids) assert.equal(alive(pid), false, `process ${pid} is gone`);
  assert.equal(existsSync(dir), false, "the scratch directory is removed");
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The hub over real connections (hub-9): the real `spex-hub` process
// served over fixture TLS, a stand-in instance answering the servers
// routes with scripted answers, and a fake helper at a configured path
// that creates scratch homes and starts stub seats as the current user,
// each a WebSocket endpoint on the seat's Unix socket checking the
// handshake token the helper wrote from its standard input.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import WebSocket from "ws";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = join(packageDir, "dist", "main.js");
const REAPER = join(packageDir, "dist", "reaper.js");
const FIXTURES = join(packageDir, "test", "fixtures");
const FAKE_HELPER = join(FIXTURES, "fake-seatctl");
const FAKE_SYSTEMCTL = join(FIXTURES, "fake-systemctl");
const REAL_HELPER = join(packageDir, "bin", "spex-seatctl");
const TLS_CERT = join(FIXTURES, "tls", "cert.pem");
const TLS_KEY = join(FIXTURES, "tls", "key.pem");
const ADDRESS = "https://localhost:8443";

const SERVER_ID = randomBytes(16).toString("base64url");
const SERVER_TOKEN = `spexh_${randomBytes(32).toString("base64url")}`;

// ---------------------------------------------------------------------------
// Scratch, processes and cleanup

const roots: string[] = [];
const children = new Set<ChildProcess>();

function stopStubSeats(run: string): void {
  let ids: string[] = [];
  try {
    ids = readdirSync(run);
  } catch {
    return;
  }
  for (const id of ids) {
    try {
      process.kill(Number(readFileSync(join(run, id, "seat.pid"), "utf8")), "SIGKILL");
    } catch {
      // gone already
    }
  }
}

test.after(() => {
  for (const child of children) child.kill("SIGKILL");
  for (const root of roots) {
    stopStubSeats(join(root, "run"));
    rmSync(root, { recursive: true, force: true });
  }
});

interface Scenario {
  root: string;
  state: string;
  run: string;
  homes: string;
  log: string;
  events: string;
  script: string;
}

function scenario(): Scenario {
  const root = mkdtempSync(join(tmpdir(), "hub-"));
  roots.push(root);
  const s: Scenario = {
    root,
    state: join(root, "state"),
    run: join(root, "run"),
    homes: join(root, "homes"),
    log: join(root, "seatctl.log"),
    events: join(root, "events.log"),
    script: join(root, "script.json"),
  };
  mkdirSync(s.run);
  mkdirSync(s.homes);
  writeFileSync(s.log, "");
  writeFileSync(s.events, "");
  writeFileSync(s.script, "{}");
  return s;
}

function setScript(s: Scenario, script: unknown): void {
  writeFileSync(s.script, JSON.stringify(script));
}

function helperEnv(s: Scenario): NodeJS.ProcessEnv {
  return {
    ...process.env,
    FAKE_NODE: process.execPath,
    FAKE_RUN_DIR: s.run,
    FAKE_SEATS_HOME: s.homes,
    FAKE_SEATCTL_LOG: s.log,
    FAKE_SEAT_SCRIPT: s.script,
    FAKE_SEAT_EVENTS: s.events,
  };
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(s: Scenario, args: string[], input = ""): Promise<Run> {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [MAIN, ...args, `--state-dir=${s.state}`, ...(args[0] === "attach" ? [] : [`--run-dir=${s.run}`, `--helper=${FAKE_HELPER}`, "--sudo="])],
      { env: helperEnv(s), stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

/** The sweep run once over the hub's state, as its unit runs it (hub-5),
 * with the fake helper and the fake service manager. */
function sweepOnce(s: Scenario): Promise<Run> {
  return new Promise((resolveRun) => {
    const child = spawn(
      process.execPath,
      [REAPER, `--state-dir=${s.state}`, `--helper=${FAKE_HELPER}`, "--sudo=", `--systemctl=${FAKE_SYSTEMCTL}`],
      { env: helperEnv(s), stdio: ["ignore", "pipe", "pipe"] },
    );
    children.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => {
      children.delete(child);
      resolveRun({ code, stdout, stderr });
    });
  });
}

function attachArgs(instance: string): string[] {
  return [
    "attach",
    `--instance=${instance}`,
    `--server-id=${SERVER_ID}`,
    `--address=${ADDRESS}`,
    `--tls-cert=${TLS_CERT}`,
    `--tls-key=${TLS_KEY}`,
  ];
}

async function attach(s: Scenario, standin: Standin): Promise<void> {
  const run = await runCli(s, attachArgs(standin.url), `${SERVER_TOKEN}\n`);
  assert.equal(run.code, 0, run.stderr);
}

interface Hub {
  child: ChildProcess;
  port: number;
  output(): string;
  exited: Promise<number | null>;
  stop(): Promise<number | null>;
}

async function serve(
  s: Scenario,
  options: { renewIntervalMs?: number; seatTimeoutMs?: number } = {},
): Promise<Hub> {
  const child = spawn(
    process.execPath,
    [
      MAIN,
      "serve",
      `--state-dir=${s.state}`,
      `--run-dir=${s.run}`,
      `--helper=${FAKE_HELPER}`,
      "--sudo=",
      "--host=127.0.0.1",
      "--port=0",
      `--renew-interval-ms=${options.renewIntervalMs ?? 60_000}`,
      `--seat-timeout-ms=${options.seatTimeoutMs ?? 10_000}`,
    ],
    { env: helperEnv(s), stdio: ["ignore", "pipe", "pipe"] },
  );
  children.add(child);
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));
  const exited = new Promise<number | null>((resolveExit) =>
    child.on("close", (code) => {
      children.delete(child);
      resolveExit(code);
    }),
  );
  const port = await new Promise<number>((resolvePort, rejectPort) => {
    const timer = setTimeout(() => rejectPort(new Error(`the hub did not serve:\n${output}`)), 10_000);
    const check = () => {
      const match = /on port (\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolvePort(Number(match[1]));
      }
    };
    child.stdout?.on("data", check);
    void exited.then(() => {
      clearTimeout(timer);
      rejectPort(new Error(`the hub exited:\n${output}`));
    });
  });
  return {
    child,
    port,
    output: () => output,
    exited,
    stop: () => {
      child.kill("SIGTERM");
      return exited;
    },
  };
}

// ---------------------------------------------------------------------------
// The stand-in instance (spex.pub servers-7, -8, -9)

interface Person {
  id: string;
  login: string;
  display_name: string | null;
}

interface Answer {
  status: number;
  body: unknown;
}

interface Standin {
  url: string;
  server: Server;
  requests: { path: string; authorization?: string; body: unknown }[];
  leaseMs: number;
  tickets: Map<string, { person: Person; spent: boolean }>;
  /** Scripted lease answers by person id; absent, a fresh 200. */
  leaseAnswers: Map<string, Answer[] | ((id: string) => Answer)>;
  admitAnswer?: Answer;
  /** Where set, an admission is answered once it settles. */
  admitGate?: Promise<void>;
  ticket(person: Person): string;
  leaseRequests(id: string): number;
  close(): Promise<void>;
}

async function startStandin(leaseMs = 60 * 60 * 1000): Promise<Standin> {
  const standin = {
    requests: [],
    leaseMs,
    tickets: new Map(),
    leaseAnswers: new Map(),
  } as unknown as Standin;
  const reply = (res: import("node:http").ServerResponse, answer: Answer) => {
    res.writeHead(answer.status, { "content-type": "application/json" });
    res.end(JSON.stringify(answer.body));
  };
  const expires = () => new Date(Date.now() + standin.leaseMs).toISOString();
  const redeem = (body: unknown): Answer => {
    if (standin.admitAnswer) return standin.admitAnswer;
    const ticket = (body as { ticket?: unknown } | undefined)?.ticket;
    if (typeof ticket !== "string") {
      return { status: 400, body: { error: { code: "bad_request", message: "no ticket" } } };
    }
    const entry = standin.tickets.get(ticket);
    if (!entry || entry.spent) {
      return { status: 401, body: { error: { code: "ticket_invalid", message: "spent or unknown" } } };
    }
    entry.spent = true;
    return {
      status: 200,
      body: { person: entry.person, server: { id: SERVER_ID, name: "Team box" }, lease_expires_at: expires() },
    };
  };
  const server = createServer((req, res) => {
    let text = "";
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      standin.requests.push({ path: req.url ?? "", authorization: req.headers.authorization, body });
      if (req.headers.authorization !== `Bearer ${SERVER_TOKEN}`) {
        reply(res, { status: 401, body: { error: { code: "invalid_token", message: "no such server" } } });
        return;
      }
      if (req.method === "POST" && req.url === "/api/v1/servers/admit") {
        const gate = standin.admitGate;
        if (gate) void gate.then(() => reply(res, redeem(body)));
        else reply(res, redeem(body));
        return;
      }
      if (req.method === "POST" && req.url === "/api/v1/servers/lease") {
        const id = (body as { person_id?: unknown } | undefined)?.person_id;
        if (typeof id !== "string" || !id) {
          reply(res, { status: 400, body: { error: { code: "bad_request", message: "no person" } } });
          return;
        }
        const scripted = standin.leaseAnswers.get(id);
        if (typeof scripted === "function") reply(res, scripted(id));
        else if (scripted && scripted.length) reply(res, scripted.shift() as Answer);
        else reply(res, { status: 200, body: { lease_expires_at: expires() } });
        return;
      }
      reply(res, { status: 401, body: { error: { code: "invalid_token", message: "wrong route" } } });
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  standin.server = server;
  standin.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  standin.ticket = (person) => {
    const ticket = `spext_${randomBytes(32).toString("base64url")}`;
    standin.tickets.set(ticket, { person, spent: false });
    return ticket;
  };
  standin.leaseRequests = (id) =>
    standin.requests.filter(
      (request) =>
        request.path === "/api/v1/servers/lease" &&
        (request.body as { person_id?: unknown } | undefined)?.person_id === id,
    ).length;
  standin.close = () =>
    new Promise<void>((resolveClose) => {
      server.closeAllConnections();
      server.close(() => resolveClose());
    });
  return standin;
}

// ---------------------------------------------------------------------------
// Clients

function admit(port: number, body: string): Promise<{ status: number; body: Record<string, any> }> {
  return new Promise((resolveAdmit, rejectAdmit) => {
    const req = httpsRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/admit",
        method: "POST",
        rejectUnauthorized: false,
        headers: { "content-type": "application/json" },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => resolveAdmit({ status: res.statusCode ?? 0, body: JSON.parse(text) }));
      },
    );
    req.on("error", rejectAdmit);
    req.end(body);
  });
}

async function admitted(hub: Hub, ticket: string): Promise<{ bearer: string; body: Record<string, any> }> {
  const answer = await admit(hub.port, JSON.stringify({ ticket }));
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  return { bearer: answer.body.bearer as string, body: answer.body };
}

interface Opened {
  socket?: WebSocket;
  status?: number;
}

function openRelay(
  port: number,
  id: string,
  options: { bearer?: string; origin?: string; query?: string } = {},
): Promise<Opened> {
  return new Promise((resolveOpen, rejectOpen) => {
    const socket = new WebSocket(`wss://127.0.0.1:${port}/seats/${id}${options.query ?? ""}`, {
      rejectUnauthorized: false,
      headers: options.bearer ? { authorization: `Bearer ${options.bearer}` } : {},
      ...(options.origin ? { origin: options.origin } : {}),
    });
    const inbox: { data: Buffer; binary: boolean }[] = [];
    (socket as WebSocket & { inbox?: typeof inbox }).inbox = inbox;
    socket.on("message", (data, binary) =>
      inbox.push({
        data: Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data),
        binary,
      }),
    );
    socket.on("error", () => {});
    socket.once("open", () => resolveOpen({ socket }));
    socket.once("unexpected-response", (request, response) => {
      resolveOpen({ status: response.statusCode });
      request.destroy();
    });
    setTimeout(() => rejectOpen(new Error("the relay did not answer")), 10_000).unref();
  });
}

function inboxOf(socket: WebSocket): { data: Buffer; binary: boolean }[] {
  return (socket as WebSocket & { inbox: { data: Buffer; binary: boolean }[] }).inbox;
}

async function nextMessage(
  socket: WebSocket,
  predicate: (message: { data: Buffer; binary: boolean }) => boolean,
): Promise<{ data: Buffer; binary: boolean }> {
  let found: { data: Buffer; binary: boolean } | undefined;
  await waitFor(() => {
    found = inboxOf(socket).find(predicate);
    return found !== undefined;
  }, "a relayed frame");
  return found as { data: Buffer; binary: boolean };
}

function jsonOf(message: { data: Buffer }): Record<string, any> | undefined {
  try {
    return JSON.parse(String(message.data));
  } catch {
    return undefined;
  }
}

function closeOf(socket: WebSocket): Promise<number> {
  return new Promise((resolveClose) => {
    if (socket.readyState === WebSocket.CLOSED) resolveClose(-1);
    socket.once("close", (code) => resolveClose(code));
  });
}

async function waitFor(check: () => boolean, label: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
}

// ---------------------------------------------------------------------------
// Readings

interface HelperCall {
  argv: string[];
  stdinSha256: string | null;
  refused?: boolean;
}

function helperCalls(s: Scenario): HelperCall[] {
  return readFileSync(s.log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HelperCall);
}

function called(s: Scenario, command: string, id: string): number {
  return helperCalls(s).filter((call) => call.argv[0] === command && call.argv[1] === id).length;
}

function seatEvents(s: Scenario): { seat: string; event: string; code?: number; origin?: string | null; authorization?: boolean }[] {
  return readFileSync(s.events, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function leases(s: Scenario): Record<string, { login: string; expires_at: string; bearer_hash: string | null; stop_owed?: true }> {
  return JSON.parse(readFileSync(join(s.state, "leases.yaml"), "utf8"));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function mode(path: string): number {
  return statSync(path).mode & 0o777;
}

/** No secret appears in a process's output (hub-8). */
function assertNoSecret(output: string, secrets: string[]): void {
  for (const secret of secrets) {
    assert.ok(!output.includes(secret), "a secret appeared in the hub's output");
  }
}

const alice: Person = { id: "4201", login: "alice", display_name: "Alice" };

// ---------------------------------------------------------------------------

test("attach keeps the server owner-only and refuses each mistake by name (hub-1)", async () => {
  const s = scenario();
  const standin = await startStandin();
  try {
    const run = await runCli(s, attachArgs(standin.url), `${SERVER_TOKEN}\n`);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /will serve https:\/\/localhost:8443/);
    assertNoSecret(run.stdout + run.stderr, [SERVER_TOKEN]);
    assert.equal(mode(s.state), 0o700);
    assert.equal(mode(join(s.state, "state.yaml")), 0o600);
    const state = JSON.parse(readFileSync(join(s.state, "state.yaml"), "utf8"));
    assert.equal(state.instance, standin.url);
    assert.equal(state.server_id, SERVER_ID);
    assert.equal(state.address, ADDRESS);
    assert.equal(state.token, SERVER_TOKEN);

    const tokenFile = join(s.root, "token");
    writeFileSync(tokenFile, `${SERVER_TOKEN}\n`, { mode: 0o600 });
    const fromFile = await runCli(s, [...attachArgs(standin.url), `--token-file=${tokenFile}`]);
    assert.equal(fromFile.code, 0, fromFile.stderr);

    const refusals: [string[], string, RegExp][] = [
      [[...attachArgs(standin.url), `--token=${SERVER_TOKEN}`], "", /never taken from the command line/],
      [attachArgs(standin.url).map((arg) => (arg.startsWith("--server-id=") ? "--server-id=42" : arg)), SERVER_TOKEN, /--server-id is in the wrong format/],
      [attachArgs(standin.url), "spexh_short", /server token is in the wrong format/],
      [attachArgs(standin.url), "", /no server token/],
      [attachArgs(standin.url).map((arg) => (arg.startsWith("--address=") ? "--address=http://localhost:8443" : arg)), SERVER_TOKEN, /no https origin/],
      [attachArgs(standin.url).map((arg) => (arg.startsWith("--address=") ? "--address=https://localhost/hub" : arg)), SERVER_TOKEN, /no path/],
      [attachArgs(standin.url).filter((arg) => !arg.startsWith("--tls-key=")), SERVER_TOKEN, /--tls-key is missing/],
      [attachArgs(standin.url).map((arg) => (arg.startsWith("--tls-key=") ? `--tls-key=${TLS_CERT}` : arg)), SERVER_TOKEN, /no matching pair/],
      [attachArgs("http://instance.example"), SERVER_TOKEN, /--instance must be an https URL/],
    ];
    for (const [args, input, message] of refusals) {
      const refused = await runCli(s, args, input);
      assert.notEqual(refused.code, 0, `${args.join(" ")} was accepted`);
      assert.match(refused.stderr, message);
      assertNoSecret(refused.stdout + refused.stderr, [SERVER_TOKEN]);
    }
    // A refusal leaves the earlier attachment whole.
    assert.equal(JSON.parse(readFileSync(join(s.state, "state.yaml"), "utf8")).token, SERVER_TOKEN);
  } finally {
    await standin.close();
  }
});

test("an admission spends its ticket once and the relay pipes the member's frames unread (hub-2, hub-3, hub-4, hub-8)", async () => {
  const s = scenario();
  const standin = await startStandin();
  await attach(s, standin);
  const hub = await serve(s);
  const secrets = [SERVER_TOKEN];
  try {
    // hub-8: the hub makes the seats' locks' directory as it serves,
    // owner-only, before any admission.
    assert.equal(mode(join(s.state, "locks")), 0o700);
    assert.deepEqual(readdirSync(join(s.state, "locks")), []);

    // hub-2: the ticket redeemed with the server token, once.
    const ticket = standin.ticket(alice);
    const first = await admitted(hub, ticket);
    secrets.push(first.bearer);
    assert.equal(first.body.endpoint, "wss://localhost:8443/seats/4201");
    assert.match(first.bearer, /^[A-Za-z0-9_-]{43}$/);
    assert.deepEqual(first.body.person, alice);
    assert.ok(Number.isFinite(Date.parse(first.body.lease_expires_at)));
    const redemptions = standin.requests.filter((request) => request.path === "/api/v1/servers/admit");
    assert.equal(redemptions.length, 1);
    assert.equal(redemptions[0].authorization, `Bearer ${SERVER_TOKEN}`);
    assert.deepEqual(redemptions[0].body, { ticket });

    const again = await admit(hub.port, JSON.stringify({ ticket }));
    assert.equal(again.status, 401);
    assert.equal(again.body.error.code, "ticket_invalid");

    for (const body of ["not json", "[]", "null", JSON.stringify({ ticket: 5 }), JSON.stringify({})]) {
      const bad = await admit(hub.port, body);
      assert.equal(bad.status, 400, body);
      assert.equal(bad.body.error.code, "bad_request");
    }
    assert.equal(standin.requests.filter((request) => request.path === "/api/v1/servers/admit").length, 2);

    // hub-4: create then start, the token on standard input alone.
    const handshake = readFileSync(join(s.run, "4201", "token"), "utf8").trim();
    secrets.push(handshake);
    const calls = helperCalls(s);
    assert.deepEqual(
      calls.map((call) => call.argv),
      [
        ["create", "4201"],
        ["start", "4201"],
      ],
    );
    assert.equal(calls[0].stdinSha256, null);
    assert.equal(calls[1].stdinSha256, sha256(handshake));

    // hub-8: the lease recorded with the bearer's hash alone.
    assert.deepEqual(leases(s), {
      "4201": { login: "alice", expires_at: first.body.lease_expires_at, bearer_hash: sha256(first.bearer), stop_owed: true },
    });
    assert.equal(mode(join(s.state, "leases.yaml")), 0o600);
    // The seats' locks, taken at the admission (hub-5), stay owner-only.
    assert.equal(mode(join(s.state, "locks")), 0o700);
    for (const file of readdirSync(s.state, { recursive: true }) as string[]) {
      if (file === "control.sock" || statSync(join(s.state, file)).isDirectory()) continue;
      const text = readFileSync(join(s.state, file), "utf8");
      assert.ok(!text.includes(first.bearer) && !text.includes(handshake), `${file} holds a secret`);
    }

    // hub-3: the bearer in the header alone, no Origin at all.
    assert.equal((await openRelay(hub.port, "4201", { bearer: first.bearer, origin: ADDRESS })).status, 403);
    assert.equal((await openRelay(hub.port, "4201", { bearer: first.bearer, origin: "https://elsewhere.example" })).status, 403);
    assert.equal((await openRelay(hub.port, "4201")).status, 401);
    assert.equal((await openRelay(hub.port, "4201", { bearer: randomBytes(32).toString("base64url") })).status, 401);
    assert.equal(
      (await openRelay(hub.port, "4201", { query: `?bearer=${first.bearer}&access_token=${first.bearer}` })).status,
      401,
    );
    assert.equal((await openRelay(hub.port, "4299", { bearer: first.bearer })).status, 401);
    assert.equal(seatEvents(s).filter((event) => event.event === "open").length, 0);

    const relay = (await openRelay(hub.port, "4201", { bearer: first.bearer })).socket as WebSocket;
    assert.ok(relay, "the relay did not open");
    await nextMessage(relay, (message) => jsonOf(message)?.type === "hello");
    relay.send(JSON.stringify({ type: "project.list", id: "r1" }));
    const reply = jsonOf(await nextMessage(relay, (message) => jsonOf(message)?.id === "r1"));
    assert.deepEqual(reply, { type: "reply", id: "r1", ok: true, result: [{ id: "p1", name: "seat 4201" }] });
    relay.send(Buffer.from([0, 1, 2, 254, 255]), { binary: true });
    const echoed = await nextMessage(relay, (message) => message.binary);
    assert.deepEqual([...echoed.data], [0, 1, 2, 254, 255]);
    // The seat saw the handshake token and neither an Origin nor the bearer.
    const opened = seatEvents(s).filter((event) => event.event === "open");
    assert.deepEqual(opened, [{ seat: "4201", event: "open", origin: null, authorization: false }]);

    // The member closing closes the seat's side.
    const relayClosed = closeOf(relay);
    relay.close(4000, "bye");
    await relayClosed;
    await waitFor(() => seatEvents(s).some((event) => event.event === "close" && event.code === 4000), "the seat's side to close");

    // The seat closing closes the member's side.
    const second = (await openRelay(hub.port, "4201", { bearer: first.bearer })).socket as WebSocket;
    await nextMessage(second, (message) => jsonOf(message)?.type === "hello");
    const secondClosed = closeOf(second);
    second.send(JSON.stringify({ type: "test.close", code: 4002 }));
    assert.equal(await secondClosed, 4002);

    // A seat already running is not started again.
    const next = await admitted(hub, standin.ticket(alice));
    secrets.push(next.bearer);
    assert.equal(helperCalls(s).length, 2);

    const status = await runCli(s, ["status"]);
    assert.equal(status.code, 0, status.stderr);
    assert.match(status.stdout, /the hub is running/);
    assert.match(status.stdout, /4201\s+alice\s+running\s+until \S+\s+none/);
    assertNoSecret(status.stdout + status.stderr, secrets);

    assert.ok(helperCalls(s).every((call) => !call.refused));
  } finally {
    assert.equal(await hub.stop(), 0);
    await standin.close();
  }
  assertNoSecret(hub.output(), secrets);
  assert.match(hub.output(), /admitted alice \(4201\)/);
});

test("a seat that does not start answers 503 with its lease kept; the instance's refusals and absence are relayed (hub-2)", async () => {
  const s = scenario();
  const standin = await startStandin();
  await attach(s, standin);
  setScript(s, { nostart: ["4203"] });
  const hub = await serve(s, { seatTimeoutMs: 800 });
  try {
    const failed = await admit(hub.port, JSON.stringify({ ticket: standin.ticket({ id: "4203", login: "carol", display_name: null }) }));
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error.code, "seat_unavailable");
    assert.match(failed.body.error.message, /4203/);
    assert.equal(leases(s)["4203"].login, "carol");
    assert.ok(Date.parse(leases(s)["4203"].expires_at) > Date.now());
    // hub-8: the stop is owed from the admission, the seat half started.
    assert.equal(leases(s)["4203"].stop_owed, true);

    standin.admitAnswer = { status: 403, body: { error: { code: "token_scope", message: "not a server token" } } };
    const scoped = await admit(hub.port, JSON.stringify({ ticket: "spext_x" }));
    assert.equal(scoped.status, 403);
    assert.equal(scoped.body.error.code, "token_scope");

    await standin.close();
    const unreachable = await admit(hub.port, JSON.stringify({ ticket: "spext_y" }));
    assert.equal(unreachable.status, 502);
    assert.equal(unreachable.body.error.code, "instance_unreachable");
  } finally {
    await hub.stop();
    if (standin.server.listening) await standin.close();
  }
  assertNoSecret(hub.output(), [SERVER_TOKEN]);
});

test("a creation that fails answers 503 with its lease kept and is asked again at the next admission, which starts the seat (hub-2, hub-4)", async () => {
  const s = scenario();
  const standin = await startStandin();
  await attach(s, standin);
  setScript(s, { nocreate: ["4204"] });
  const hub = await serve(s);
  const ivy: Person = { id: "4204", login: "ivy", display_name: null };
  const secrets = [SERVER_TOKEN];
  try {
    const failed = await admit(hub.port, JSON.stringify({ ticket: standin.ticket(ivy) }));
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error.code, "seat_unavailable");
    assert.match(failed.body.error.message, /4204/);
    assert.equal(leases(s)["4204"].login, "ivy");
    assert.equal(leases(s)["4204"].stop_owed, true);
    assert.equal(called(s, "create", "4204"), 1);
    assert.equal(called(s, "start", "4204"), 0);

    // hub-4: the lease recorded, the next admission asks create again.
    setScript(s, {});
    const next = await admitted(hub, standin.ticket(ivy));
    secrets.push(next.bearer);
    assert.equal(called(s, "create", "4204"), 2);
    assert.equal(called(s, "start", "4204"), 1);
    assert.equal(leases(s)["4204"].bearer_hash, sha256(next.bearer));
    assert.match((await runCli(s, ["status"])).stdout, /4204\s+ivy\s+running\s+until/);
    assert.ok(helperCalls(s).every((call) => !call.refused));
  } finally {
    assert.equal(await hub.stop(), 0);
    await standin.close();
  }
  assertNoSecret(hub.output(), secrets);
  assert.match(hub.output(), /seat 4204 did not start: .*create refused by the test's script/);
});

test("leases renew at the interval while in use, end at a refusal, retry a 502 and survive a restart (hub-5)", async () => {
  const s = scenario();
  // Leases long enough to outlast a seat's start, but for the idle one.
  const standin = await startStandin(30_000);
  await attach(s, standin);
  const interval = 300;
  let hub = await serve(s, { renewIntervalMs: interval });
  const secrets = [SERVER_TOKEN];
  try {
    const relayed = await admitted(hub, standin.ticket({ id: "4301", login: "dan", display_name: "Dan" }));
    const relay = (await openRelay(hub.port, "4301", { bearer: relayed.bearer })).socket as WebSocket;
    assert.ok(relay, "the relay did not open");
    const working = await admitted(hub, standin.ticket({ id: "4302", login: "eve", display_name: "Eve" }));
    setScript(s, { turnActive: { "4302": true } });
    standin.leaseMs = 8000;
    const idle = await admitted(hub, standin.ticket({ id: "4303", login: "fay", display_name: "Fay" }));
    standin.leaseMs = 30_000;
    secrets.push(relayed.bearer, working.bearer, idle.bearer);

    // A relay open, or a turn running, renews with the server token.
    await waitFor(() => standin.leaseRequests("4301") >= 2 && standin.leaseRequests("4302") >= 2, "renewals");
    for (const request of standin.requests.filter((r) => r.path === "/api/v1/servers/lease")) {
      assert.equal(request.authorization, `Bearer ${SERVER_TOKEN}`);
    }
    await waitFor(
      () => Date.parse(leases(s)["4302"].expires_at) > Date.parse(working.body.lease_expires_at),
      "the renewed expiry to be recorded",
    );

    // An idle seat is not renewed: its lease lapses and the seat stops.
    await waitFor(() => called(s, "stop", "4303") === 1, "the idle seat to stop", 30_000);
    assert.equal(standin.leaseRequests("4303"), 0);
    assert.equal(leases(s)["4303"].bearer_hash, null);

    // The instance's refusal ends the lease at once: 4401 and a stop.
    const relayClosed = closeOf(relay);
    standin.leaseAnswers.set("4301", () => ({ status: 403, body: { error: { code: "reauth_required", message: "sign in again" } } }));
    assert.equal(await relayClosed, 4401);
    await waitFor(() => called(s, "stop", "4301") === 1, "the refused seat to stop");
    assert.equal(leases(s)["4301"].bearer_hash, null);
    assert.equal((await openRelay(hub.port, "4301", { bearer: relayed.bearer })).status, 401);

    // A 502 is retried at the interval, the lease standing.
    const before = standin.leaseRequests("4302");
    standin.leaseAnswers.set("4302", [
      { status: 502, body: { error: { code: "bad_gateway", message: "upstream" } } },
      { status: 502, body: { error: { code: "bad_gateway", message: "upstream" } } },
    ]);
    await waitFor(() => standin.leaseRequests("4302") >= before + 3, "the renewal to be retried");
    assert.equal(called(s, "stop", "4302"), 0);
    assert.ok(Date.parse(leases(s)["4302"].expires_at) > Date.now());

    // A restarted hub continues the recorded lease from its expiry.
    assert.equal(await hub.stop(), 0);
    secrets.push(readFileSync(join(s.run, "4302", "token"), "utf8").trim());
    assertNoSecret(hub.output(), secrets);
    const recorded = leases(s)["4302"];
    assert.equal(recorded.bearer_hash, sha256(working.bearer));
    hub = await serve(s, { renewIntervalMs: interval });
    assert.match(hub.output(), /continuing the lease of eve \(4302\)/);
    const afterRestart = standin.leaseRequests("4302");
    await waitFor(() => standin.leaseRequests("4302") >= afterRestart + 1, "a renewal after the restart");
    const continued = (await openRelay(hub.port, "4302", { bearer: working.bearer })).socket as WebSocket;
    assert.ok(continued, "the restarted hub refused the recorded lease's bearer");
    continued.send(JSON.stringify({ type: "project.list", id: "r2" }));
    await nextMessage(continued, (message) => jsonOf(message)?.id === "r2");
    continued.close();
    assert.equal(called(s, "stop", "4302"), 0);
    assert.ok(helperCalls(s).every((call) => !call.refused));
  } finally {
    await hub.stop();
    await standin.close();
  }
  assertNoSecret(hub.output(), secrets);
});

test("status, evict and retire act on the seats as their rows say (hub-6)", async () => {
  const s = scenario();
  const standin = await startStandin();
  await attach(s, standin);
  const hub = await serve(s);
  const secrets = [SERVER_TOKEN];
  try {
    const a = await admitted(hub, standin.ticket({ id: "4401", login: "gus", display_name: null }));
    const b = await admitted(hub, standin.ticket({ id: "4402", login: "hal", display_name: null }));
    secrets.push(a.bearer, b.bearer);
    for (const id of ["4401", "4402"]) {
      const local = join(s.homes, id, ".spex", "local");
      mkdirSync(local, { recursive: true });
      writeFileSync(join(local, "credentials.yaml"), "format: 1\n");
      writeFileSync(join(local, "code-credentials.yaml"), "format: 1\n");
      writeFileSync(join(local, "prefs.json"), "{}\n");
    }
    const relay = (await openRelay(hub.port, "4401", { bearer: a.bearer })).socket as WebSocket;
    await nextMessage(relay, (message) => jsonOf(message)?.type === "hello");

    const status = await runCli(s, ["status"]);
    assert.equal(status.code, 0, status.stderr);
    assert.match(status.stdout, /Team box/);
    assert.match(status.stdout, /4401\s+gus\s+running\s+until \S+\s+open/);
    assert.match(status.stdout, /4402\s+hal\s+running\s+until \S+\s+none/);

    const relayClosed = closeOf(relay);
    const evicted = await runCli(s, ["evict", "4401"]);
    assert.equal(evicted.code, 0, evicted.stderr);
    assert.equal(await relayClosed, 4401);
    assert.equal(called(s, "stop", "4401"), 1);
    assert.match((await runCli(s, ["status"])).stdout, /4401\s+gus\s+stopped\s+ended/);

    const unknown = await runCli(s, ["evict", "4499"]);
    assert.equal(unknown.code, 1);
    assert.match(unknown.stderr, /no seat 4499/);
    const malformed = await runCli(s, ["evict", "gus"]);
    assert.equal(malformed.code, 2);

    const retired = await runCli(s, ["retire"]);
    assert.equal(retired.code, 0, retired.stderr);
    assert.match(retired.stdout, /server token is forgotten/);
    assert.match(retired.stdout, new RegExp(`${standin.url}/account/servers`));
    assert.equal(await hub.exited, 0);
    assert.equal(called(s, "stop", "4402"), 1);
    assert.equal(called(s, "wipe", "4401"), 1);
    assert.equal(called(s, "wipe", "4402"), 1);
    for (const id of ["4401", "4402"]) {
      const local = join(s.homes, id, ".spex", "local");
      assert.deepEqual(readdirSync(local), ["prefs.json"]);
    }
    assert.equal(JSON.parse(readFileSync(join(s.state, "state.yaml"), "utf8")).token, null);
    for (const lease of Object.values(leases(s))) assert.equal(lease.bearer_hash, null);

    // With no hub running, status reads the state itself.
    const offline = await runCli(s, ["status"]);
    assert.equal(offline.code, 0, offline.stderr);
    assert.match(offline.stdout, /retired; the hub is not running/);
    assert.match(offline.stdout, /4402\s+hal\s+stopped\s+ended/);
    const again = await runCli(s, ["serve", "--port=0", "--host=127.0.0.1"]);
    assert.equal(again.code, 1);
    assert.match(again.stderr, /attach again/);
    assert.ok(helperCalls(s).every((call) => !call.refused));
    assertNoSecret(retired.stdout + retired.stderr + status.stdout + offline.stdout, secrets);
  } finally {
    if (hub.child.exitCode === null) await hub.stop();
    await standin.close();
  }
  assertNoSecret(hub.output(), secrets);
});

test("an admission while retire runs is refused before its ticket is redeemed, and a held one after; no seat starts after the retirement began (hub-2, hub-6)", async () => {
  const s = scenario();
  const standin = await startStandin();
  await attach(s, standin);
  const hub = await serve(s);
  const ana: Person = { id: "4501", login: "ana", display_name: null };
  const ben: Person = { id: "4502", login: "ben", display_name: null };
  const cyd: Person = { id: "4503", login: "cyd", display_name: null };
  const redemptions = (ticket?: string) =>
    standin.requests.filter(
      (request) =>
        request.path === "/api/v1/servers/admit" &&
        (ticket === undefined || (request.body as { ticket?: unknown } | undefined)?.ticket === ticket),
    ).length;
  const secrets = [SERVER_TOKEN];
  try {
    const a = await admitted(hub, standin.ticket(ana));
    secrets.push(a.bearer);
    const stopGate = join(s.root, "stop-4501");
    setScript(s, { holdstop: { "4501": stopGate } });

    // An admission the instance holds as retire begins.
    let answerHeld!: () => void;
    standin.admitGate = new Promise<void>((resolveGate) => {
      answerHeld = resolveGate;
    });
    const heldTicket = standin.ticket(cyd);
    const held = admit(hub.port, JSON.stringify({ ticket: heldTicket }));
    await waitFor(() => redemptions(heldTicket) === 1, "the held admission to reach the instance");
    const retiring = runCli(s, ["retire"]);
    await waitFor(() => called(s, "stop", "4501") === 1, "retire to stop the first seat");

    // hub-2: while retire runs, an admission is refused before its
    // ticket is redeemed, a running seat's person's as anyone's.
    const before = redemptions();
    const benTicket = standin.ticket(ben);
    const late = await admit(hub.port, JSON.stringify({ ticket: benTicket }));
    assert.equal(late.status, 503);
    assert.equal(late.body.error.code, "server_retiring");
    const again = await admit(hub.port, JSON.stringify({ ticket: standin.ticket(ana) }));
    assert.equal(again.status, 503);
    assert.equal(again.body.error.code, "server_retiring");
    assert.equal(redemptions(), before);
    assert.equal(standin.tickets.get(benTicket)?.spent, false);

    // The held admission, answered by the instance, is refused all the same.
    answerHeld();
    const answered = await held;
    assert.equal(answered.status, 503);
    assert.equal(answered.body.error.code, "server_retiring");
    assert.equal(standin.tickets.get(heldTicket)?.spent, true);

    // hub-6: retire finishes with the one seat its snapshot held.
    writeFileSync(stopGate, "");
    const retired = await retiring;
    assert.equal(retired.code, 0, retired.stderr);
    assert.match(retired.stdout, /retired: 1 seat\(s\) stopped/);
    assert.equal(await hub.exited, 0);
    for (const id of ["4502", "4503"]) {
      assert.equal(called(s, "create", id), 0);
      assert.equal(called(s, "start", id), 0);
      assert.equal(leases(s)[id], undefined);
    }
    assert.equal(called(s, "start", "4501"), 1);
    assert.equal(called(s, "wipe", "4501"), 1);
    assert.equal(leases(s)["4501"].bearer_hash, null);
    assert.equal(JSON.parse(readFileSync(join(s.state, "state.yaml"), "utf8")).token, null);
    assert.ok(helperCalls(s).every((call) => !call.refused));
    assertNoSecret(retired.stdout + retired.stderr, secrets);
  } finally {
    if (hub.child.exitCode === null) await hub.stop();
    await standin.close();
  }
  assertNoSecret(hub.output(), secrets);
});

test("a stop that fails leaves the lease ended, is reported by evict and retire with its cause and exit 1, and is asked again at the next renewal and at the hub's next start (hub-5, hub-6)", async () => {
  const s = scenario();
  const standin = await startStandin();
  await attach(s, standin);
  let hub = await serve(s, { renewIntervalMs: 300 });
  const secrets = [SERVER_TOKEN];
  const outputs: string[] = [];
  const cli = async (args: string[]): Promise<Run> => {
    const run = await runCli(s, args);
    outputs.push(run.stdout + run.stderr);
    return run;
  };
  // The lease's record of an owed stop (hub-8).
  const stopOwed = (id: string): true | undefined => leases(s)[id]?.stop_owed;
  try {
    const a = await admitted(hub, standin.ticket({ id: "4601", login: "kim", display_name: null }));
    const b = await admitted(hub, standin.ticket({ id: "4602", login: "lou", display_name: null }));
    secrets.push(a.bearer, b.bearer);
    // hub-8: owed from the admission, before any end.
    assert.equal(stopOwed("4601"), true);
    const relay = (await openRelay(hub.port, "4601", { bearer: a.bearer })).socket as WebSocket;
    assert.ok(relay, "the relay did not open");
    await nextMessage(relay, (message) => jsonOf(message)?.type === "hello");
    setScript(s, { nostop: ["4601", "4602"] });

    // hub-6: evict on a running hub ends the lease and reports the
    // stop's cause, exit 1.
    const relayClosed = closeOf(relay);
    const evicted = await cli(["evict", "4601"]);
    assert.equal(evicted.code, 1);
    assert.match(evicted.stdout, /evicted seat 4601: its lease ended; its files stand/);
    assert.match(evicted.stderr, /the seat did not stop: .*stop refused by the test's script/);
    assert.equal(await relayClosed, 4401);
    assert.equal(leases(s)["4601"].bearer_hash, null);
    assert.equal(stopOwed("4601"), true);
    assert.equal((await openRelay(hub.port, "4601", { bearer: a.bearer })).status, 401);
    assert.match((await cli(["status"])).stdout, /4601\s+kim\s+running\s+ended/);
    await waitFor(
      () => /\(4601\) ended: evicted; the seat did not stop: .*asked again at the next renewal/.test(hub.output()),
      "the failed stop to be logged",
    );
    // hub-5: the renewal round asks again while the socket is still open.
    await waitFor(() => called(s, "stop", "4601") >= 2, "the renewal round to ask again");

    // hub-6: with no hub running, evict acts itself and reports the same.
    assert.equal(await hub.stop(), 0);
    assertNoSecret(hub.output(), secrets);
    // hub-8: the hub's own command makes the locks' directory too, where
    // it went missing, owner-only.
    rmSync(join(s.state, "locks"), { recursive: true });
    const offline = await cli(["evict", "4602"]);
    assert.equal(mode(join(s.state, "locks")), 0o700);
    assert.equal(offline.code, 1);
    assert.match(offline.stdout, /evicted seat 4602: its lease ended; its files stand/);
    assert.match(offline.stderr, /the seat did not stop: .*stop refused by the test's script/);
    assert.equal(leases(s)["4602"].bearer_hash, null);
    assert.equal(stopOwed("4602"), true);
    const offlineStatus = await cli(["status"]);
    assert.match(offlineStatus.stdout, /the hub is not running/);
    assert.match(offlineStatus.stdout, /4602\s+lou\s+running\s+ended/);

    // The seat's core dies while the stop stays owed: its socket closes,
    // though the unit's other processes may remain.
    const pid4602 = Number(readFileSync(join(s.run, "4602", "seat.pid"), "utf8"));
    process.kill(pid4602, "SIGKILL");
    await waitFor(() => {
      try {
        process.kill(pid4602, 0);
        return false;
      } catch {
        return true;
      }
    }, "the seat's core to be gone");
    const stopsBefore4602 = called(s, "stop", "4602");

    // hub-5: the next start asks again for each owed stop, recorded on
    // the lease, the socket closed as well as open.
    const stopsBefore = called(s, "stop", "4601");
    setScript(s, { nostop: ["4602"] });
    hub = await serve(s, { renewIntervalMs: 300 });
    await waitFor(
      () =>
        /the lease of kim \(4601\) ended: its stop was still owed when the hub started; seat stopped/.test(
          hub.output(),
        ) &&
        /the lease of lou \(4602\) ended: its stop was still owed when the hub started; the seat did not stop: .*asked again at the next renewal and at the hub's next start/.test(
          hub.output(),
        ),
      "the next start to ask again",
    );
    assert.equal(called(s, "stop", "4601"), stopsBefore + 1);
    // The start's own ask, logged above; the renewal round may ask again.
    assert.ok(called(s, "stop", "4602") >= stopsBefore4602 + 1);
    assert.equal(stopOwed("4601"), undefined);
    assert.equal(stopOwed("4602"), true);
    const restarted = await cli(["status"]);
    assert.match(restarted.stdout, /4601\s+kim\s+stopped\s+ended/);
    assert.match(restarted.stdout, /4602\s+lou\s+stopped\s+ended/);

    // hub-5: the renewal round asks again, and the seat stops.
    setScript(s, {});
    await waitFor(() => /the seat of lou \(4602\) stopped at the retry/.test(hub.output()), "the asked-again stop");
    assert.equal(stopOwed("4602"), undefined);
    assert.match((await cli(["status"])).stdout, /4602\s+lou\s+stopped\s+ended/);

    // hub-6: retire reports an active seat's failed stop, exit 1, and
    // still wipes every seat and forgets the token.
    const c = await admitted(hub, standin.ticket({ id: "4603", login: "max", display_name: null }));
    secrets.push(c.bearer);
    setScript(s, { nostop: ["4603"] });
    const retired = await cli(["retire"]);
    assert.equal(retired.code, 1);
    assert.match(retired.stderr, /stop 4603 failed: .*stop refused by the test's script/);
    assert.match(retired.stderr, /run retire again once the cause is fixed/);
    assert.match(retired.stdout, /server token is forgotten/);
    assert.equal(await hub.exited, 0);
    for (const id of ["4601", "4602", "4603"]) assert.equal(called(s, "wipe", id), 1);
    assert.equal(leases(s)["4603"].bearer_hash, null);
    assert.equal(stopOwed("4603"), true);
    assert.equal(JSON.parse(readFileSync(join(s.state, "state.yaml"), "utf8")).token, null);

    // hub-6: with no hub to retry it, retire run again asks each stop and
    // wipe again.
    const stopsBefore4603 = called(s, "stop", "4603");
    setScript(s, {});
    const retiredAgain = await cli(["retire"]);
    assert.equal(retiredAgain.code, 0, retiredAgain.stderr);
    assert.match(retiredAgain.stdout, /server token is forgotten/);
    assert.equal(called(s, "stop", "4603"), stopsBefore4603 + 1);
    assert.equal(stopOwed("4603"), undefined);
    for (const id of ["4601", "4602", "4603"]) assert.equal(called(s, "wipe", id), 2);
    assert.equal(JSON.parse(readFileSync(join(s.state, "state.yaml"), "utf8")).token, null);
    assert.ok(helperCalls(s).every((call) => !call.refused));
    assertNoSecret(outputs.join("\n"), secrets);
  } finally {
    if (hub.child.exitCode === null) await hub.stop();
    await standin.close();
  }
  assertNoSecret(hub.output(), secrets);
});

test("an admission and a renewal wait on a seat's lock the sweep holds (hub-5, hub-8)", async () => {
  const s = scenario();
  const standin = await startStandin();
  await attach(s, standin);
  const hub = await serve(s, { renewIntervalMs: 300 });
  const pia: Person = { id: "4701", login: "pia", display_name: null };
  const lock = join(s.state, "locks", "4701.lock");
  const takeLock = (): boolean => {
    try {
      writeFileSync(lock, `${process.pid}\n`, { flag: "wx", mode: 0o644 });
      return true;
    } catch {
      return false;
    }
  };
  const waits = () => hub.output().split(`waiting for the lock of 4701 held by pid ${process.pid}`).length - 1;
  const recorded = () => (existsSync(join(s.state, "leases.yaml")) ? leases(s)["4701"] : undefined);
  const secrets = [SERVER_TOKEN];
  try {
    // The sweep holds the seat's lock as the admission comes, in the
    // directory the hub made as it served (hub-8).
    assert.ok(takeLock(), "the test took the seat's lock");
    const admission = admit(hub.port, JSON.stringify({ ticket: standin.ticket(pia) }));
    await waitFor(() => waits() === 1, "the admission to wait on the lock");
    // hub-5: no lease recorded and no seat started while the lock is held.
    assert.equal(recorded(), undefined);
    assert.equal(called(s, "create", "4701"), 0);
    assert.equal(called(s, "start", "4701"), 0);
    rmSync(lock);
    const answered = await admission;
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    secrets.push(answered.body.bearer);
    assert.equal(called(s, "start", "4701"), 1);
    assert.equal(recorded()?.expires_at, answered.body.lease_expires_at);
    assert.equal(existsSync(lock), false, "the hub released the lock it took");

    // hub-5: with a relay open the lease renews, its expiry recorded under
    // the lock, the instance's answer awaited outside it.
    const relay = (await openRelay(hub.port, "4701", { bearer: answered.body.bearer })).socket as WebSocket;
    assert.ok(relay, "the relay did not open");
    await waitFor(takeLock, "the test to take the seat's lock between renewals");
    const held = recorded()?.expires_at as string;
    await waitFor(() => waits() >= 2, "a renewal to wait on the lock");
    assert.equal(recorded()?.expires_at, held, "no expiry recorded while the lock is held");
    rmSync(lock);
    await waitFor(
      () => Date.parse(recorded()?.expires_at ?? "") > Date.parse(held),
      "the renewal to be recorded once the lock is released",
    );
    assert.match(hub.output(), /renewed the lease of pia \(4701\)/);
    relay.close();
    assert.ok(helperCalls(s).every((call) => !call.refused));
  } finally {
    assert.equal(await hub.stop(), 0);
    await standin.close();
  }
  assertNoSecret(hub.output(), secrets);
});

test("an admission waits on a lock whose holder no longer runs until the sweep clears it (hub-5, hub-8)", async () => {
  const s = scenario();
  const standin = await startStandin();
  await attach(s, standin);
  const hub = await serve(s);
  const quin: Person = { id: "4801", login: "quin", display_name: null };
  const lock = join(s.state, "locks", "4801.lock");
  const secrets = [SERVER_TOKEN];
  try {
    // A lock left by a holder that died, as a hub that crashed holding
    // it: a pid that ran and exited.
    const dead = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
    await new Promise((resolveExit) => dead.once("exit", resolveExit));
    writeFileSync(lock, `${dead.pid}\n`, { flag: "wx", mode: 0o644 });
    const admission = admit(hub.port, JSON.stringify({ ticket: standin.ticket(quin) }));
    await waitFor(
      () =>
        hub
          .output()
          .includes(`waiting for the lock of 4801 held by pid ${dead.pid}, whose hold is stale; the sweep clears it\n`),
      "the admission to wait on the stale lock",
    );
    // hub-5: the hub breaks no lock: it stands, and no seat is created.
    assert.equal(readFileSync(lock, "utf8"), `${dead.pid}\n`);
    assert.equal(called(s, "create", "4801"), 0);

    // hub-5: the sweep clears it, and the admission goes through.
    const swept = await sweepOnce(s);
    assert.equal(swept.code, 0, swept.stdout + swept.stderr);
    assert.ok(
      swept.stdout.includes(`[spex-seat-reaper] cleared the stale lock of 4801, left by pid ${dead.pid}\n`),
      swept.stdout,
    );
    const answered = await admission;
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    secrets.push(answered.body.bearer);
    assert.equal(called(s, "create", "4801"), 1);
    assert.equal(called(s, "start", "4801"), 1);
    assert.equal(leases(s)["4801"].bearer_hash, sha256(answered.body.bearer));
    assert.equal(existsSync(lock), false, "the hub released the lock it took");
    assert.ok(helperCalls(s).every((call) => !call.refused));
  } finally {
    assert.equal(await hub.stop(), 0);
    await standin.close();
  }
  assertNoSecret(hub.output(), secrets);
});

test("the helper refuses every invocation but its four forms (hub-4)", async () => {
  const forms: string[][] = [
    [],
    ["create"],
    ["destroy", "1"],
    ["start", "12a"],
    ["start", "-1"],
    ["stop", "123456789012345678901"],
    ["wipe", "1", "2"],
    ["start", "1; reboot"],
  ];
  for (const args of forms) {
    const run = await new Promise<Run>((resolveRun) => {
      const child = spawn(REAL_HELPER, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("close", (code) => resolveRun({ code, stdout, stderr }));
    });
    assert.equal(run.code, 64, `spex-seatctl ${args.join(" ")}: ${run.stderr}`);
    assert.match(run.stderr, /spex-seatctl: /);
  }
  if (process.getuid?.() !== 0) {
    const run = await new Promise<number | null>((resolveRun) => {
      spawn(REAL_HELPER, ["stop", "1"], { stdio: "ignore" }).on("close", resolveRun);
    });
    assert.equal(run, 77);
  }
});

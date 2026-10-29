#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A team server run end to end on this machine (DR-132, DR-133), with
// no root, no systemd and no Linux host, to click through in a browser:
//
//   served shell (one per member, the member's own core)
//     --server.open--> stand-in Spex Space instance: listing and ticket
//     --POST /admit--> the real hub (apps/hub) over TLS at 127.0.0.1
//       --> instance front: the ticket redeemed, the lease renewed
//       --> fake spex-seatctl --> the real server shell in seat mode
//           (apps/server, a real core) per admitted member
//     <--relay-- the member's core relays the seat to its page
//
//   node scripts/team-server-local.mjs [--members=1|2]
//     [--agents=captain|demo|real] [--agents-env=<file>] [--auto-approve]
//     [--hub-port=8443] [--keep]
//
// Faithful: the hub's attach, serve and retire commands, its TLS, its
// admission, lease table, relay and helper protocol; the seat's command
// line, Unix socket, token file and own home; the member's served shell,
// its device sign-in, server listing, ticket, admission and relay.
// Substituted: the instance is the core's stand-in Spex Space, with an
// in-process front answering the hub's two server routes, which the
// stand-in does not serve; the helper starts each seat as this user in a
// detached process group under /tmp instead of an OS account and a
// systemd unit; the TLS pair is the hub tests' self-signed fixture, which
// the members' cores trust through NODE_EXTRA_CA_CERTS; the seats'
// agents are the core's substitutes (--agents=captain: the real Captain
// over substitute adapters; demo: the demo's scripted run), unless
// --agents=real, which needs real credentials in --agents-env.
//
// Sign-ins use the device flow: approve each code at the stand-in's
// device page, or pass --auto-approve. A seat's sign-in needs neither:
// the stand-in grants it on the ticket its open presented (DR-164), so
// --auto-approve approves a code only once Spex would show its page, a
// seat's past the first poll interval and its margin. A stand-in signs
// in exactly one person, so --members=2 starts a second stand-in
// instance for bob over the first one's Git backend, the server
// registered at both: its `acme` group is a separate container, so the
// two members share no group project in that mode. Everything lives in
// one /tmp/spex-tsl-* directory, short enough for the seats' socket
// paths, removed at Ctrl-C unless --keep; the stop retires the server
// through the hub, which stops and wipes every seat.

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  createWriteStream,
  existsSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HUB_MAIN = join(ROOT, "apps/hub/dist/main.js");
const SERVER_MAIN = join(ROOT, "apps/server/dist/main.js");
const SERVER_UI = join(ROOT, "apps/server/ui-dist/index.html");
const CORE_TESTING = join(ROOT, "packages/core/dist/testing/index.js");
const SEATCTL = join(ROOT, "scripts/team-server-local/seatctl.mjs");
const TLS_CERT = join(ROOT, "apps/hub/test/fixtures/tls/cert.pem");
const TLS_KEY = join(ROOT, "apps/hub/test/fixtures/tls/key.pem");
const DESKTOP_START = join(ROOT, "scripts/start-desktop.mjs");

const SERVER_NAME = "Local team server";
const GROUP = "acme";
const PROJECT = "demo-project";
/** The second member, signed in by the second stand-in instance. */
const SECOND_PERSON = { id: "1002", login: "bob", displayName: "Bob" };
const AGENT_MODES = ["captain", "demo", "real"];
/** How long a code waits before --auto-approve approves it: past a
 * seat's first poll interval, one second at the stand-in, and the two
 * seconds' margin within which a grant on the ticket keeps the page
 * unshown (core-service-142), with a second to spare. */
const APPROVE_AFTER_MS = 4_000;
/** The lease the front renews for (Spex Space servers-8). */
const RENEW_MS = 60 * 60 * 1000;
/** Bounds on each stage of the start and the stop. */
const READY_MS = 60_000;
const CLIENT_STOP_MS = 20_000;
const RETIRE_MS = 120_000;
const SEAT_STOP_MS = 30_000;

// ---------------------------------------------------------------------------
// Small utilities

/** A free TCP port on the loopback, as the operating system hands one. */
export function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createNetServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

/** `promise`'s value, or undefined once `ms` passed, the timer cleared
 * either way so none outlives the race. */
async function within(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((resolveLate) => (timer = setTimeout(resolveLate, ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signal(pid, name) {
  try {
    process.kill(pid, name);
    return true;
  } catch {
    return false;
  }
}

/** The environment every child starts from: this one without what would
 * reach past the scratch directory — Spex's, Git's and XDG's settings —
 * or bind a child to this process's test runner. */
function cleanEnvironment() {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (/^(SPEX_|XDG_|GIT_)/.test(name)) continue;
    if (["NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "NODE_TEST_CONTEXT"].includes(name)) continue;
    env[name] = value;
  }
  return env;
}

/** Feed a stream's text to `onLine` a line at a time. */
function eachLine(stream, onLine) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      onLine(buffer.slice(0, end).replace(/\r$/, ""));
      buffer = buffer.slice(end + 1);
    }
  });
  stream.on("end", () => {
    if (buffer) onLine(buffer);
    buffer = "";
  });
}

export function checkPrerequisites() {
  if (process.platform === "win32") {
    throw new Error("the local team server runs on macOS or Linux: seats listen on Unix sockets");
  }
  for (const [file, build] of [
    [CORE_TESTING, "npm run build -w packages/core"],
    [SERVER_MAIN, "npm run build -w apps/server"],
    [SERVER_UI, "npm run build -w apps/server"],
    [HUB_MAIN, "npm run build -w apps/hub"],
  ]) {
    if (!existsSync(file)) throw new Error(`${relative(ROOT, file)} is not built: run npm run build (or ${build})`);
  }
  const git = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (git.error || git.status !== 0) throw new Error("git is not on PATH: the stand-in instance and the seats need it");
}

// ---------------------------------------------------------------------------
// A child process whose lines are logged

class Child {
  constructor(name, args, { env, cwd, logs, out }) {
    this.name = name;
    this.lines = [];
    this.listeners = new Set();
    this.logPath = join(logs, `${name.replace(/\s+/g, "-")}.log`);
    const file = createWriteStream(this.logPath, { flags: "a" });
    // A process group of its own, so a Ctrl-C at the terminal reaches
    // this script alone and the stop runs in its order.
    this.child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const onLine = (line) => {
      file.write(`${line}\n`);
      this.lines.push(line);
      if (this.lines.length > 60) this.lines.shift();
      out(`[${name}] ${line}`);
      for (const listener of this.listeners) listener(line);
    };
    eachLine(this.child.stdout, onLine);
    eachLine(this.child.stderr, onLine);
    this.result = undefined;
    this.exited = new Promise((resolveExit) => {
      this.child.once("error", (error) => {
        this.result ??= { code: null, signal: null, error };
        resolveExit(this.result);
      });
      this.child.once("close", (code, signalName) => {
        this.result ??= { code, signal: signalName };
        file.end();
        resolveExit(this.result);
      });
    });
  }

  get pid() {
    return this.child.pid;
  }

  get running() {
    return this.result === undefined && this.child.pid !== undefined;
  }

  tail() {
    return this.lines.slice(-15).join("\n");
  }

  /** The first line matching `pattern`, waiting up to `timeoutMs`. */
  waitFor(pattern, timeoutMs = READY_MS) {
    const seen = this.lines.map((line) => pattern.exec(line)).find(Boolean);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolveLine, rejectLine) => {
      const done = (outcome) => {
        clearTimeout(timer);
        this.listeners.delete(listener);
        outcome();
      };
      const listener = (line) => {
        const match = pattern.exec(line);
        if (match) done(() => resolveLine(match));
      };
      const timer = setTimeout(
        () => done(() => rejectLine(new Error(`${this.name} printed no ${pattern} within ${timeoutMs / 1000} s:\n${this.tail()}`))),
        timeoutMs,
      );
      this.listeners.add(listener);
      void this.exited.then((result) =>
        done(() =>
          rejectLine(
            new Error(
              `${this.name} exited (${result.error?.message ?? result.signal ?? `code ${result.code}`}) before printing ${pattern}:\n${this.tail()}`,
            ),
          ),
        ),
      );
    });
  }

  /** Signal it and wait up to `timeoutMs`; then kill its group. */
  async stop(signalName, timeoutMs) {
    if (!this.running) return this.exited;
    signal(this.pid, signalName);
    const settled = await within(this.exited, timeoutMs);
    if (settled) return settled;
    signal(-this.pid, "SIGKILL");
    return within(this.exited, 5_000);
  }
}

// ---------------------------------------------------------------------------
// The instance front (Spex Space servers-7, servers-8): the two routes a
// hub calls with the server token, which the stand-in does not serve.

function startFront({ token, hosts, note }) {
  const server = createServer((req, res) => {
    let text = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      if (text.length < 16 * 1024) text += chunk;
    });
    req.on("end", () => {
      const reply = (status, body) => {
        res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(body));
      };
      const route = req.method === "POST" ? new URL(req.url ?? "/", "http://front").pathname : undefined;
      if (route !== "/api/v1/servers/admit" && route !== "/api/v1/servers/lease") {
        reply(404, { error: { code: "not_found", message: "Nothing is here." } });
        return;
      }
      if (req.headers.authorization !== `Bearer ${token}`) {
        reply(401, { error: { code: "invalid_token", message: "The server token is not valid." } });
        return;
      }
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      if (route === "/api/v1/servers/admit") {
        if (typeof body?.ticket !== "string") {
          reply(400, { error: { code: "invalid_request", message: "A ticket is required." } });
          return;
        }
        // Each stand-in mints its own tickets: one it did not mint is
        // refused there unspent, so the next one is asked.
        let refusal;
        for (const host of hosts) {
          const answer = host.script.redeemTicket(body.ticket);
          if ("person" in answer) {
            note(`admitted ${answer.person.login} (${answer.person.id}) to ${answer.server.name} until ${answer.leaseExpiresAt}`);
            reply(200, {
              person: { id: answer.person.id, login: answer.person.login, display_name: answer.person.displayName },
              server: answer.server,
              lease_expires_at: answer.leaseExpiresAt,
            });
            return;
          }
          refusal ??= answer;
        }
        note(`refused a ticket: ${refusal.code}`);
        reply(refusal.status, { error: { code: refusal.code, message: refusal.message } });
        return;
      }
      if (typeof body?.person_id !== "string" || !body.person_id) {
        reply(400, { error: { code: "invalid_request", message: "A person_id is required." } });
        return;
      }
      const expires = new Date(Date.now() + RENEW_MS).toISOString();
      note(`renewed the lease of ${body.person_id} until ${expires}`);
      reply(200, { lease_expires_at: expires });
    });
  });
  return new Promise((resolveFront, rejectFront) => {
    server.once("error", rejectFront);
    server.listen(0, "127.0.0.1", () => {
      resolveFront({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => {
          server.closeAllConnections();
          return new Promise((resolveClose) => server.close(() => resolveClose()));
        },
      });
    });
  });
}

// ---------------------------------------------------------------------------
// The simulation

export class LocalTeamServer {
  /**
   * @param {object} options
   * @param {1|2} [options.members] members, each with a served shell
   * @param {"captain"|"demo"|"real"} [options.agents] the seats' agents
   * @param {string} [options.agentsEnv] a shared credential file to use
   * @param {boolean} [options.autoApprove] approve every device sign-in
   * @param {number} [options.hubPort] the hub's https port
   * @param {boolean} [options.keep] keep the scratch directory at the stop
   * @param {(line: string) => void} [options.out] where log lines go
   */
  constructor(options = {}) {
    this.members = options.members ?? 1;
    this.agents = options.agents ?? "captain";
    this.agentsEnv = options.agentsEnv;
    this.autoApprove = options.autoApprove === true;
    this.hubPort = options.hubPort ?? 8443;
    this.keep = options.keep === true;
    this.out = options.out ?? (() => {});
    if (![1, 2].includes(this.members)) throw new Error(`--members must be 1 or 2; got ${options.members}`);
    if (!AGENT_MODES.includes(this.agents)) {
      throw new Error(`--agents must be one of ${AGENT_MODES.join(", ")}; got ${JSON.stringify(options.agents)}`);
    }
    if (!Number.isInteger(this.hubPort) || this.hubPort < 1 || this.hubPort > 65535) {
      throw new Error(`--hub-port must be a port from 1 to 65535; got ${options.hubPort}`);
    }
    if (this.agentsEnv !== undefined && !existsSync(this.agentsEnv)) {
      throw new Error(`--agents-env ${this.agentsEnv} does not exist`);
    }
    this.hosts = [];
    this.clients = [];
    this.timers = [];
    this.closing = undefined;
    this.attached = false;
    this.serverId = randomBytes(16).toString("base64url");
    this.serverToken = `spexh_${randomBytes(32).toString("base64url")}`;
    this.address = `https://127.0.0.1:${this.hubPort}`;
    this.killOnExit = () => this.killNow();
    this.starting = undefined;
    this.stopRequested = new Promise((resolveStop) => (this.requestStop = resolveStop));
  }

  /** `promise`, unless the stop is asked for first: then the start ends
   * at once, leaving what it started to the stop. */
  step(promise) {
    const stopped = this.stopRequested.then(() => Promise.reject(new Error("the start was stopped")));
    stopped.catch(() => {});
    return Promise.race([promise, stopped]);
  }

  /** Everything the hub's commands and the helper need. */
  hubEnvironment() {
    const hosts = { "*": this.hosts[0].url };
    for (const host of this.hosts) hosts[host.script.person.id] = host.url;
    return {
      ...cleanEnvironment(),
      TSL_RUN: this.runDir,
      TSL_SEATS: this.seatsDir,
      TSL_LOGS: this.logs,
      TSL_SERVER_ID: this.serverId,
      TSL_SERVER_NAME: SERVER_NAME,
      TSL_HOSTS: JSON.stringify(hosts),
      TSL_SHARED_ENV: this.sharedEnv,
      TSL_AGENTS: this.agents,
      TSL_NODE: process.execPath,
    };
  }

  hubArgs(command) {
    return [
      HUB_MAIN,
      command,
      `--state-dir=${this.stateDir}`,
      `--run-dir=${this.runDir}`,
      `--helper=${SEATCTL}`,
      "--sudo=",
    ];
  }

  note(prefix, line) {
    this.instanceLog?.write(`${line}\n`);
    this.out(`[${prefix}] ${line}`);
  }

  /** Start everything, once; a stop asked for meanwhile ends it. */
  start() {
    this.starting ??= this.run();
    return this.starting;
  }

  async run() {
    checkPrerequisites();
    const testing = await this.step(import(pathToFileURL(CORE_TESTING).href));
    process.on("exit", this.killOnExit);
    // Under /tmp, not the system's per-user temp directory: a seat's
    // socket path must fit a Unix socket's 104 bytes on macOS.
    this.dir = mkdtempSync("/tmp/spex-tsl-");
    this.logs = join(this.dir, "logs");
    this.stateDir = join(this.dir, "hub-state");
    this.runDir = join(this.dir, "run");
    this.seatsDir = join(this.dir, "seats");
    mkdirSync(this.logs, { recursive: true });
    mkdirSync(this.runDir, { recursive: true, mode: 0o700 });
    mkdirSync(this.seatsDir, { recursive: true, mode: 0o700 });
    this.instanceLog = createWriteStream(join(this.logs, "instance.log"), { flags: "a" });

    // The instance: a stand-in Spex Space, and a second over its Git
    // backend for bob, each with a team project in its own `acme`.
    const first = await testing.startStandinHost({ dir: join(this.dir, "instance"), displayName: "Local Spex Space" });
    this.hosts.push(first);
    if (this.members === 2) {
      this.hosts.push(
        await testing.startStandinHost({ gitBackend: first, person: SECOND_PERSON, displayName: "Local Spex Space (bob)" }),
      );
    }
    await this.step(Promise.resolve());
    for (const host of this.hosts) {
      const code = join(this.dir, "code", host.script.person.login, PROJECT);
      testing.seedDemoProject(code);
      host.script.addRepository({
        group: GROUP,
        name: `${PROJECT}-spex`,
        project: { format: 1, name: PROJECT, remote: code },
      });
      host.script.servers.push({ id: this.serverId, name: SERVER_NAME, group: GROUP, address: this.address });
    }

    this.front = await startFront({
      token: this.serverToken,
      hosts: this.hosts,
      note: (line) => this.note("instance", line),
    });
    await this.step(Promise.resolve());

    const tokenFile = join(this.dir, "server.token");
    writeFileSync(tokenFile, `${this.serverToken}\n`, { mode: 0o600 });
    this.sharedEnv = join(this.dir, "agents.env");
    writeFileSync(
      this.sharedEnv,
      this.agentsEnv !== undefined
        ? readFileSync(this.agentsEnv, "utf8")
        : this.agents === "real"
          ? ""
          : "ANTHROPIC_API_KEY=local-fake\nOPENAI_API_KEY=local-fake\n",
      { mode: 0o600 },
    );

    // The hub, attached and served as its unit runs it.
    const attach = new Child(
      "hub-attach",
      [
        HUB_MAIN,
        "attach",
        `--state-dir=${this.stateDir}`,
        `--instance=${this.front.url}`,
        `--server-id=${this.serverId}`,
        `--address=${this.address}`,
        `--tls-cert=${TLS_CERT}`,
        `--tls-key=${TLS_KEY}`,
        `--token-file=${tokenFile}`,
      ],
      { env: this.hubEnvironment(), cwd: this.dir, logs: this.logs, out: this.out },
    );
    const attached = await this.step(attach.exited);
    if (attached.code !== 0) throw new Error(`spex-hub attach failed:\n${attach.tail()}`);
    this.attached = true;
    this.hub = new Child("hub", [...this.hubArgs("serve"), "--host=127.0.0.1"], {
      env: this.hubEnvironment(),
      cwd: this.dir,
      logs: this.logs,
      out: this.out,
    });
    try {
      await this.step(this.hub.waitFor(/\[spex-hub\] serving /));
    } catch (error) {
      if (!/EADDRINUSE/.test(this.hub.tail())) throw error;
      throw new Error(`the hub's port ${this.hubPort} is taken: pass --hub-port=<another port>`);
    }

    if (this.autoApprove) {
      // Each code approved as its person would, once Spex shows its page.
      const seen = new Map();
      const approve = () => {
        const now = Date.now();
        for (const host of this.hosts) {
          for (const code of host.script.pendingDevices()) {
            if (!seen.has(code)) seen.set(code, now);
            if (now - seen.get(code) < APPROVE_AFTER_MS) continue;
            host.script.approveDevice(code);
            this.note("instance", `approved device sign-in ${code} at ${host.url}`);
          }
        }
      };
      this.timers.push(setInterval(approve, 200));
    }
    // A seat's sign-in granted on its ticket, with no page (DR-164).
    const granted = new Map(this.hosts.map((host) => [host, 0]));
    this.timers.push(
      setInterval(() => {
        for (const host of this.hosts) {
          const grants = host.script.tokenGrants;
          for (const grant of grants.slice(granted.get(host))) {
            if (grant.ticket) this.note("instance", `granted a seat's device sign-in on its ticket at ${host.url}`);
          }
          granted.set(host, grants.length);
        }
      }, 200),
    );
    this.tailSeats();

    // One served shell per member: the member's own core, as a browser
    // reaches it, trusting the hub's fixture certificate.
    for (const host of this.hosts) {
      const login = host.script.person.login;
      const home = join(this.dir, "clients", login, "home");
      const spexHome = join(this.dir, "clients", login, "spex");
      mkdirSync(home, { recursive: true, mode: 0o700 });
      const token = randomBytes(18).toString("base64url");
      const child = new Child(`client-${login}`, [SERVER_MAIN, "--port=0", `--token=${token}`], {
        env: {
          ...cleanEnvironment(),
          HOME: home,
          SPEX_HOME: spexHome,
          SPEX_HOST_URL: host.url,
          NODE_EXTRA_CA_CERTS: TLS_CERT,
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        },
        cwd: home,
        logs: this.logs,
        out: this.out,
      });
      const client = { login, id: host.script.person.id, host, token, home, spexHome, child };
      this.clients.push(client);
      const [, url] = await this.step(child.waitFor(/serving at (\S+)/));
      client.url = url;
      client.origin = new URL(url).origin;
    }
    return this;
  }

  /** Echo each seat's log as it grows, a line at a time. */
  tailSeats() {
    const offsets = new Map();
    const partial = new Map();
    const read = () => {
      let names;
      try {
        names = readdirSync(this.logs).filter((name) => /^seat-\d+\.log$/.test(name));
      } catch {
        return;
      }
      for (const name of names) {
        const id = /^seat-(\d+)\.log$/.exec(name)[1];
        let fd;
        try {
          fd = openSync(join(this.logs, name), "r");
          const size = fstatSync(fd).size;
          let offset = offsets.get(name) ?? 0;
          if (size <= offset) continue;
          const buffer = Buffer.alloc(size - offset);
          readSync(fd, buffer, 0, buffer.length, offset);
          offset = size;
          offsets.set(name, offset);
          const text = (partial.get(name) ?? "") + buffer.toString("utf8");
          const lines = text.split("\n");
          partial.set(name, lines.pop() ?? "");
          for (const line of lines) this.out(`[seat ${id}] ${line}`);
        } catch {
          // Gone with the scratch directory.
        } finally {
          if (fd !== undefined) closeSync(fd);
        }
      }
    };
    this.timers.push(setInterval(read, 300));
    this.flushSeatLogs = read;
  }

  /** The seats the helper started, by person id, with their pids. */
  seatPids() {
    const pids = new Map();
    if (!this.runDir) return pids;
    let ids = [];
    try {
      ids = readdirSync(this.runDir);
    } catch {
      return pids;
    }
    for (const id of ids) {
      try {
        const pid = Number(readFileSync(join(this.runDir, id, "seat.pid"), "utf8"));
        if (Number.isInteger(pid) && pid > 0) pids.set(id, pid);
      } catch {
        // No seat started there, or it stopped.
      }
    }
    return pids;
  }

  summary() {
    const first = this.hosts[0];
    const lines = [
      "",
      `Local team server is up (scratch ${this.dir}${this.keep ? ", kept at the stop" : ", removed at the stop"}).`,
      "",
      `  Instance (stand-in Spex Space): ${this.hosts.map((host) => host.url).join(" and ")}`,
      `    device sign-in page: ${this.hosts.map((host) => `${host.url}/login/device`).join(" and ")}${this.autoApprove ? " (auto-approved)" : ""}`,
      `  Hub: ${this.address}, server "${SERVER_NAME}" of group ${GROUP}, id ${this.serverId}`,
      `    the hub's instance front: ${this.front.url}`,
      `  Seats' agents: ${
        this.agents === "captain"
          ? "the real Captain over substitute adapters"
          : this.agents === "demo"
            ? "the demo's scripted Captain and players"
            : "real agents"
      }`,
      "",
    ];
    for (const client of this.clients) {
      lines.push(`  Member ${client.login} (${client.id}): ${client.url}`);
      lines.push(`    sign in at ${client.host.url}, then open "${SERVER_NAME}" from the servers list`);
    }
    lines.push(
      "",
      "  The desktop instead of a browser (quit your own Spex desktop first):",
      `    SPEX_HOME=${join(this.dir, "clients", "desktop", "spex")} SPEX_HOST_URL=${first.url} NODE_EXTRA_CA_CERTS=${TLS_CERT} node ${DESKTOP_START}`,
      `  Hub status: node ${HUB_MAIN} status --state-dir=${this.stateDir}`,
      `  Logs: ${this.logs}`,
      "  Ctrl-C stops the clients, retires the server (stopping every seat) and removes the scratch.",
      "",
    );
    return lines.join("\n");
  }

  /** Stop everything, in the order a server is taken down. */
  close() {
    this.closing ??= (async () => {
      this.requestStop();
      await this.starting?.catch(() => undefined);
      for (const timer of this.timers) clearInterval(timer);
      this.timers = [];
      // The members' shells first, each within its own stop's bound.
      await Promise.all(this.clients.map((client) => client.child.stop("SIGINT", CLIENT_STOP_MS)));
      // Retire through the running hub, which stops and wipes every seat
      // and then stops; with no hub, the command does it itself.
      if (this.attached) {
        const retire = new Child("hub-retire", this.hubArgs("retire"), {
          env: this.hubEnvironment(),
          cwd: this.dir,
          logs: this.logs,
          out: this.out,
        });
        if (!(await within(retire.exited, RETIRE_MS))) await retire.stop("SIGTERM", 5_000);
      }
      if (this.hub) {
        if (!(await within(this.hub.exited, 10_000))) await this.hub.stop("SIGTERM", 10_000);
      }
      // Any seat the retire left running is stopped as its unit would be.
      await Promise.all(
        [...this.seatPids().values()].filter(alive).map(async (pid) => {
          signal(pid, "SIGTERM");
          const deadline = Date.now() + SEAT_STOP_MS;
          while (alive(pid) && Date.now() < deadline) await wait(100);
          signal(-pid, "SIGKILL");
        }),
      );
      this.flushSeatLogs?.();
      await this.front?.close();
      for (const host of [...this.hosts].reverse()) await host.close();
      await new Promise((resolveEnd) => (this.instanceLog ? this.instanceLog.end(resolveEnd) : resolveEnd()));
      process.off("exit", this.killOnExit);
      if (this.dir && !this.keep) rmSync(this.dir, { recursive: true, force: true });
    })();
    return this.closing;
  }

  /** At an exit with the stop not done: kill every child and seat. */
  killNow() {
    for (const child of [...this.clients.map((client) => client.child), this.hub]) {
      if (child?.running) signal(-child.pid, "SIGKILL");
    }
    for (const pid of this.seatPids().values()) signal(-pid, "SIGKILL");
  }
}

/** Start the simulation; on a failed start, stop what started. */
export async function startLocalTeamServer(options = {}) {
  const server = new LocalTeamServer(options);
  try {
    await server.start();
  } catch (error) {
    await server.close().catch(() => undefined);
    throw error;
  }
  return server;
}

// ---------------------------------------------------------------------------
// The command line

const USAGE = `usage: node scripts/team-server-local.mjs [options]

  --members=1|2        members, each with a served shell (default 1)
  --agents=captain|demo|real
                       the seats' agents (default captain)
  --agents-env=<file>  the shared credential file the seats read
                       (KEY=value lines; for --agents=real)
  --auto-approve       approve every device sign-in at the instance once
                       Spex shows its page; a seat's is granted on its
                       ticket without one
  --hub-port=<n>       the hub's https port (default 8443)
  --keep               keep the /tmp/spex-tsl-* directory at the stop`;

function parseCommandLine(argv) {
  const options = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    const [name, value] = match ? [match[1], match[2]] : [undefined, undefined];
    if (name === "help") return undefined;
    if (name === "auto-approve" && value === undefined) options.autoApprove = true;
    else if (name === "keep" && value === undefined) options.keep = true;
    else if (name === "members" && value !== undefined) options.members = Number(value);
    else if (name === "agents" && value !== undefined) options.agents = value;
    else if (name === "agents-env" && value) options.agentsEnv = resolve(value);
    else if (name === "hub-port" && value !== undefined) options.hubPort = Number(value);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseCommandLine(process.argv.slice(2));
  } catch (error) {
    console.error(`team-server-local: ${error.message}\n${USAGE}`);
    return 2;
  }
  if (!options) {
    console.log(USAGE);
    return 0;
  }
  let server;
  try {
    server = new LocalTeamServer({ ...options, out: (line) => process.stdout.write(`${line}\n`) });
  } catch (error) {
    console.error(`team-server-local: ${error.message}\n${USAGE}`);
    return 2;
  }
  let signals = 0;
  const stopped = new Promise((resolveStop) => {
    const onSignal = (name) => {
      signals += 1;
      if (signals > 1) {
        console.error(`team-server-local: ${name} again: killing everything now`);
        server.killNow();
        process.exit(130);
      }
      console.log(`\nteam-server-local: stopping (${name}); press Ctrl-C again to kill at once`);
      void server.close().then(() => resolveStop(0), (error) => {
        console.error(`team-server-local: the stop failed: ${error.message}`);
        resolveStop(1);
      });
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
  try {
    await server.start();
  } catch (error) {
    if (signals === 0) {
      console.error(`team-server-local: ${error.message}`);
      await server.close().catch(() => undefined);
      return 1;
    }
  }
  if (signals === 0) console.log(server.summary());
  return stopped;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}

#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The privileged lane (hub-10), run as root on a disposable Linux host
// with systemd and sudo, from a release checkout: it installs the hub
// with its helper and units by the checkout's install.sh, attaches it
// to a stand-in instance served from this process on the loopback,
// admits two members, and asserts that each seat runs as its own
// account unable to read the other's home, that the seat's token and
// socket are readable by the hub and that seat alone, that a stop at
// the lease's end kills a stubborn agent child within the unit's
// timeout with the seat's files standing, that the sweep's timer is
// enabled and, with the hub's unit stopped, stops a seat whose lease
// lapsed within two minutes of its expiry with its files standing, the
// hub's next start recording that lease ended, and that `retire` leaves
// the homes and removes the credentials (hub-4, hub-5, hub-6). Every
// assertion prints one PASS or FAIL line naming hub-10 and the items
// its clause cites; the exit status is 1 on any FAIL.
//
//   sudo apps/hub/scripts/privileged-lane.sh [--fresh]
//
// It refuses a host where a hub is installed already, unless --fresh,
// which first removes every account, file and unit an earlier install
// or lane made: run it on a disposable host alone. The stubborn agent
// is started inside the seat unit's control group by writing its pid to
// the group's cgroup.procs, not by a turn of the seat's core. No token,
// bearer, ticket or key is printed: every one is redacted from the
// output.

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECKOUT = resolve(HERE, "../../..");
const INSTALL = join(CHECKOUT, "apps/hub/deploy/install.sh");
const STUBBORN = join(HERE, "lane-stubborn-agent.cjs");

// The paths install.sh's header table names, for its default prefix.
const PREFIX = "/opt/spex";
const HELPER = `${PREFIX}/libexec/spex-seatctl`;
const COMMAND = `${PREFIX}/bin/spex-hub`;
const STATE_DIR = "/var/lib/spex-hub";
const RUN_BASE = "/run/spex";
const RUN_DIR = "/run/spex/seats";
const ETC = "/etc/spex";
const SERVER_ENV = `${ETC}/server.env`;
const AGENTS_ENV = `${ETC}/agents.env`;
const TOKEN_FILE = `${ETC}/server.token`;
const TLS_DIR = `${ETC}/lane-tls`;
const TLS_CERT = `${TLS_DIR}/cert.pem`;
const TLS_KEY = `${TLS_DIR}/key.pem`;
const UNIT_DIR = "/etc/systemd/system";
const UNITS = ["spex-hub.service", "spex-seat@.service", "spex-seat-reaper.service", "spex-seat-reaper.timer"];
const SWEEP = "spex-seat-reaper.service";
const SWEEP_TIMER = "spex-seat-reaper.timer";
/** The sweep's bound while no hub runs: its minute and the seat unit's
 * stop (hub-5). */
const SWEEP_BOUND_MS = 120_000;
const SUDOERS = "/etc/sudoers.d/spex-hub";
const TMPFILES = "/etc/tmpfiles.d/spex-hub.conf";
const NODE = "/usr/bin/node";

const HUB_PORT = 8443;
const ADDRESS = `https://127.0.0.1:${HUB_PORT}`;
const SERVER_NAME = "Lane box";
const PERSONS = [
  { id: "4100001", login: "ada-lane", display_name: "Ada Lane" },
  { id: "4100002", login: "bob-lane", display_name: null },
];
const LONG_LEASE_MS = 60 * 60 * 1000;
const SHORT_LEASE_MS = 20 * 1000;

// ---------------------------------------------------------------------------
// Output: every secret the lane learns is redacted from every line.

const secrets = new Set();
function secret(value) {
  if (value) secrets.add(value);
  return value;
}
function redact(text) {
  let out = String(text);
  for (const value of secrets) out = out.split(value).join("<redacted>");
  return out;
}
function say(line = "") {
  process.stdout.write(`${redact(line)}\n`);
}
function info(line) {
  say(`INFO ${line}`);
}
const tally = { pass: 0, fail: 0 };
function check(ok, items, what, detail) {
  if (ok) tally.pass += 1;
  else tally.fail += 1;
  say(`${ok ? "PASS" : "FAIL"} hub-10 ${items} ${what}${!ok && detail !== undefined ? ` -- ${detail}` : ""}`);
  return ok;
}
class Fatal extends Error {}
function must(ok, items, what, detail) {
  if (!check(ok, items, what, detail)) throw new Fatal(what);
}
function phase(title) {
  say("");
  say(`== ${title}`);
}

// ---------------------------------------------------------------------------
// Processes

function run(file, args = [], { input, env, timeoutMs = 120_000 } = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(file, args, { cwd: "/", env: env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolveRun({ code: -1, signal: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveRun({ code, signal, stdout, stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });
}

/** Run as another account, as root may with no password. */
function asUser(user, args, options) {
  return run("runuser", ["-u", user, "--", ...args], options);
}

function echo(result, prefix = "  | ") {
  for (const line of `${result.stdout}${result.stderr}`.split("\n")) if (line) say(`${prefix}${line}`);
}

function firstLine(text) {
  return String(text).trim().split("\n")[0] ?? "";
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitFor(predicate, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() > deadline) return false;
    await sleep(intervalMs);
  }
}

/** CLOCK_MONOTONIC in microseconds, as systemd's *Monotonic stamps. */
function monotonicUs() {
  return Number(process.hrtime.bigint() / 1000n);
}

// ---------------------------------------------------------------------------
// Accounts, files and units

function passwd(name) {
  for (const line of readFileSync("/etc/passwd", "utf8").split("\n")) {
    const fields = line.split(":");
    if (fields[0] === name) {
      return { name, uid: Number(fields[2]), gid: Number(fields[3]), home: fields[5], shell: fields[6], line };
    }
  }
  return undefined;
}

function group(name) {
  for (const line of readFileSync("/etc/group", "utf8").split("\n")) {
    const fields = line.split(":");
    if (fields[0] === name) {
      return { name, gid: Number(fields[2]), members: fields[3] ? fields[3].split(",") : [], line };
    }
  }
  return undefined;
}

function userName(uid) {
  for (const line of readFileSync("/etc/passwd", "utf8").split("\n")) {
    const fields = line.split(":");
    if (fields[2] === String(uid)) return fields[0];
  }
  return String(uid);
}

function groupName(gid) {
  for (const line of readFileSync("/etc/group", "utf8").split("\n")) {
    const fields = line.split(":");
    if (fields[2] === String(gid)) return fields[0];
  }
  return String(gid);
}

function stat(path) {
  try {
    const s = lstatSync(path);
    const type = s.isSocket() ? "socket" : s.isDirectory() ? "dir" : s.isFile() ? "file" : s.isSymbolicLink() ? "link" : "other";
    return { type, mode: s.mode & 0o7777, uid: s.uid, gid: s.gid, size: s.size };
  } catch {
    return undefined;
  }
}

function describe(path) {
  const s = stat(path);
  if (!s) return `${path} absent`;
  return `${path} ${s.type} ${s.mode.toString(8).padStart(4, "0")} ${userName(s.uid)}:${groupName(s.gid)}`;
}

/** Whether the path is the kind named, with this mode, owner and group. */
function hasMode(path, type, mode, owner, grp) {
  const s = stat(path);
  return (
    s !== undefined &&
    s.type === type &&
    s.mode === mode &&
    userName(s.uid) === owner &&
    groupName(s.gid) === grp
  );
}

function digest(path) {
  const s = stat(path);
  if (!s) return "absent";
  const content = s.type === "file" ? createHash("sha256").update(readFileSync(path)).digest("hex") : "-";
  return `${s.type} ${s.mode.toString(8)} ${s.uid}:${s.gid} ${content}`;
}

async function unitProperty(unit, property) {
  return (await run("systemctl", ["show", "-p", property, "--value", unit])).stdout.trim();
}

async function activeState(unit) {
  return (await run("systemctl", ["is-active", unit])).stdout.trim();
}

/** A systemd time span, e.g. `30s` or `1min 30s`, in microseconds. */
function spanUs(text) {
  const units = { h: 3600e6, min: 60e6, ms: 1e3, us: 1, s: 1e6 };
  let total = 0;
  for (const [, number, unit] of text.matchAll(/([\d.]+)\s*(h|min|ms|us|s)/g)) total += Number(number) * units[unit];
  return total;
}

/** PID 1's journal of a unit's stop since a monotonic time: its
 * Stopping and Stopped entries' times and every line it logged, timed
 * from an origin. */
async function stopLogged(unit, sinceUs, originUs) {
  const STOPPING = "de5b426a63be47a7b6ac3eaac82e2f6f";
  const STOPPED = "9d1aaa27d60140bd96365438aad20286";
  const journal = await run("journalctl", ["--no-pager", "-b", "-o", "json", `UNIT=${unit}`, "_PID=1"], { timeoutMs: 60_000 });
  const found = { stopping: undefined, stopped: undefined, lines: [] };
  for (const line of journal.stdout.split("\n")) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const at = Number(entry.__MONOTONIC_TIMESTAMP);
    if (!(at >= sinceUs)) continue;
    if (typeof entry.MESSAGE === "string") found.lines.push(`${((at - originUs) / 1e6).toFixed(3)} s after the lease's end: ${entry.MESSAGE}`);
    if (entry.MESSAGE_ID === STOPPING && found.stopping === undefined) found.stopping = at;
    if (entry.MESSAGE_ID === STOPPED) found.stopped = at;
  }
  return found;
}

function unitOf(id) {
  return `spex-seat@${id}.service`;
}

/** The pids in a unit's control group. */
async function cgroupPids(unit) {
  const path = await unitProperty(unit, "ControlGroup");
  if (!path) return [];
  try {
    return readFileSync(`/sys/fs/cgroup${path}/cgroup.procs`, "utf8").split("\n").filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

function uidOfPid(pid) {
  try {
    const line = readFileSync(`/proc/${pid}/status`, "utf8").split("\n").find((entry) => entry.startsWith("Uid:"));
    return line ? Number(line.split(/\s+/)[2]) : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a process lives: present and no zombie. */
function alive(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) !== "Z";
  } catch {
    return false;
  }
}

/** Whether the account may open the file for reading. */
async function canRead(user, path) {
  const test = await asUser(user, ["test", "-r", path]);
  const open = await asUser(user, ["/bin/sh", "-c", 'exec <"$1"', "sh", path]);
  return { test: test.code === 0, open: open.code === 0 };
}

/** Whether the account may connect to the Unix socket: "connected" or
 * the error's code. */
async function connectAs(user, path) {
  const script =
    'const s=require("node:net").connect(process.argv[1]);' +
    's.once("connect",()=>{console.log("connected");s.destroy()});' +
    's.once("error",(e)=>{console.log(e.code);process.exitCode=1})';
  const result = await asUser(user, [NODE, "-e", script, path]);
  return result.stdout.trim() || firstLine(result.stderr);
}

// ---------------------------------------------------------------------------
// The stand-in instance (spex.pub servers-7, -8): one server and its
// tickets, served over http on the loopback, which attach admits there.

async function startStandin(server) {
  const tickets = new Map();
  const requests = [];
  const http = createServer((req, res) => {
    let text = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (text += chunk));
    req.on("end", () => {
      requests.push(`${req.method} ${req.url}`);
      const reply = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      const route = req.method === "POST" ? req.url : undefined;
      if (route !== "/api/v1/servers/admit" && route !== "/api/v1/servers/lease") {
        reply(404, { error: { code: "not_found", message: "the lane's stand-in answers the servers routes alone" } });
        return;
      }
      if (req.headers.authorization !== `Bearer ${server.token}`) {
        reply(401, { error: { code: "invalid_token", message: "no such server" } });
        return;
      }
      if (route === "/api/v1/servers/admit") {
        const entry = typeof body?.ticket === "string" ? tickets.get(body.ticket) : undefined;
        if (!entry || entry.spent) {
          reply(401, { error: { code: "ticket_invalid", message: "spent or unknown" } });
          return;
        }
        entry.spent = true;
        entry.expiresAt = new Date(Date.now() + entry.leaseMs).toISOString();
        reply(200, {
          person: entry.person,
          server: { id: server.id, name: server.name },
          lease_expires_at: entry.expiresAt,
        });
        return;
      }
      const id = body?.person_id;
      if (typeof id !== "string" || !id) {
        reply(400, { error: { code: "bad_request", message: "no person" } });
        return;
      }
      reply(200, { lease_expires_at: new Date(Date.now() + LONG_LEASE_MS).toISOString() });
    });
  });
  await new Promise((resolveListen) => http.listen(0, "127.0.0.1", resolveListen));
  return {
    url: `http://127.0.0.1:${http.address().port}`,
    requests,
    tickets,
    ticket(person, leaseMs) {
      const ticket = secret(`spext_${randomBytes(32).toString("base64url")}`);
      tickets.set(ticket, { person, leaseMs, spent: false, expiresAt: undefined });
      return ticket;
    },
    close() {
      http.closeAllConnections();
      return new Promise((resolveClose) => http.close(() => resolveClose()));
    },
  };
}

// ---------------------------------------------------------------------------
// Clients of the hub, verifying its certificate

function admit(ca, body) {
  return new Promise((resolveAdmit) => {
    const req = httpsRequest(
      { host: "127.0.0.1", port: HUB_PORT, path: "/admit", method: "POST", ca, headers: { "content-type": "application/json" } },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          if (typeof json?.bearer === "string") secret(json.bearer);
          resolveAdmit({ status: res.statusCode, body: json });
        });
      },
    );
    req.on("error", (error) => resolveAdmit({ status: 0, error: error.message }));
    req.setTimeout(60_000, () => req.destroy(new Error("no answer within 60 s")));
    req.end(body);
  });
}

function probeHub(ca) {
  return new Promise((resolveProbe) => {
    const req = httpsRequest({ host: "127.0.0.1", port: HUB_PORT, path: "/admit", method: "GET", ca }, (res) => {
      res.resume();
      resolveProbe(res.statusCode);
    });
    req.on("error", () => resolveProbe(0));
    req.setTimeout(5000, () => req.destroy());
    req.end();
  });
}

/** Open a relay to a seat: the open socket and what it receives, or the
 * status the upgrade was refused with. */
function openRelay(WebSocket, ca, id, { bearer, origin } = {}) {
  return new Promise((resolveOpen) => {
    const socket = new WebSocket(`wss://127.0.0.1:${HUB_PORT}/seats/${id}`, {
      ca,
      perMessageDeflate: false,
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
      ...(origin ? { origin } : {}),
    });
    const relay = { socket, inbox: [], closeCode: undefined };
    socket.on("message", (data) => relay.inbox.push(String(data)));
    socket.on("close", (code) => (relay.closeCode = code));
    socket.on("error", (error) => resolveOpen({ error: error.message }));
    socket.once("open", () => resolveOpen(relay));
    socket.once("unexpected-response", (request, response) => {
      resolveOpen({ status: response.statusCode });
      request.destroy();
    });
    setTimeout(() => resolveOpen({ error: "no answer within 15 s" }), 15_000).unref();
  });
}

function messages(relay) {
  return relay.inbox.map((text) => {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  });
}

// ---------------------------------------------------------------------------
// A host the lane ran on before

function installedTraces() {
  return [
    PREFIX,
    ETC,
    STATE_DIR,
    RUN_BASE,
    SUDOERS,
    TMPFILES,
    ...UNITS.map((unit) => `${UNIT_DIR}/${unit}`),
  ]
    .filter((path) => existsSync(path))
    .concat(["spex-hub"].filter((name) => passwd(name)))
    .concat(["spex-hub", "spex-seats"].filter((name) => group(name)).map((name) => `group ${name}`));
}

function seatAccounts() {
  return readFileSync("/etc/passwd", "utf8")
    .split("\n")
    .map((line) => line.split(":")[0])
    .filter((name) => /^spex-[0-9]{1,20}$/.test(name));
}

async function removePrevious() {
  info("--fresh: removing what an earlier install or lane left on this host");
  await run("systemctl", ["disable", "--now", SWEEP_TIMER]);
  await run("systemctl", ["stop", SWEEP], { timeoutMs: 180_000 });
  await run("systemctl", ["disable", "--now", "spex-hub.service"]);
  const units = (await run("systemctl", ["list-units", "--all", "--plain", "--no-legend", "spex-seat@*"])).stdout;
  for (const line of units.split("\n")) {
    const unit = line.trim().split(/\s+/)[0];
    if (unit) await run("systemctl", ["stop", unit], { timeoutMs: 120_000 });
  }
  for (const account of seatAccounts()) {
    await run("pkill", ["-KILL", "-u", account]);
    await run("userdel", ["--remove", account]);
  }
  await run("pkill", ["-KILL", "-u", "spex-hub"]);
  if (passwd("spex-hub")) await run("userdel", ["spex-hub"]);
  for (const name of ["spex-hub", "spex-seats"]) if (group(name)) await run("groupdel", [name]);
  await run("rm", [
    "-rf",
    "--",
    PREFIX,
    ETC,
    STATE_DIR,
    RUN_BASE,
    SUDOERS,
    TMPFILES,
    ...UNITS.map((unit) => `${UNIT_DIR}/${unit}`),
  ]);
  await run("systemctl", ["daemon-reload"]);
  await run("systemctl", ["reset-failed"]);
  const left = installedTraces().concat(seatAccounts());
  if (left.length) throw new Fatal(`--fresh left ${left.join(", ")}`);
}

// ---------------------------------------------------------------------------
// The lane

const server = {
  id: randomBytes(16).toString("base64url"),
  name: SERVER_NAME,
  token: secret(`spexh_${randomBytes(32).toString("base64url")}`),
};
const agentToken = secret(`sk-ant-oat01-lane-${randomBytes(24).toString("base64url")}`);
const seatTokens = new Map();
const bearers = new Map();
let standin;
let ca;
let WebSocket;
let installOutput = "";

async function install() {
  phase("install.sh (hub-7)");
  const refused = await asUser("nobody", [INSTALL]);
  check(
    refused.code === 77,
    "[hub-7]",
    "install.sh run by an account other than root refuses with 77",
    `exit ${refused.code}: ${firstLine(refused.stderr)}`,
  );
  const traces = installedTraces();
  check(traces.length === 0, "[hub-7]", "the refused run changed nothing: no account, group, prefix, unit, fragment or /etc/spex", traces.join(", "));

  info("running install.sh as root: npm ci and npm run build in the checkout, then the install");
  const started = Date.now();
  const first = await run(INSTALL, [], { timeoutMs: 60 * 60 * 1000 });
  echo(first);
  installOutput = first.stdout;
  must(first.code === 0, "[hub-7]", `install.sh as root builds and installs from the checkout (${Math.round((Date.now() - started) / 1000)} s)`, `exit ${first.code}`);

  const hub = passwd("spex-hub");
  check(
    hub !== undefined && hub.uid < 1000 && hub.home === STATE_DIR && /nologin|false/.test(hub.shell) && groupName(hub.gid) === "spex-hub",
    "[hub-7]",
    "the hub's system account spex-hub, in its group spex-hub, with no login shell, its home the state directory",
    hub?.line ?? "no account",
  );
  check(group("spex-seats") !== undefined, "[hub-7]", "the seats' group spex-seats exists", "no group");
  check(hasMode(STATE_DIR, "dir", 0o700, "spex-hub", "spex-hub"), "[hub-8]", "the hub's state directory is spex-hub's alone (0700)", describe(STATE_DIR));
  check(hasMode(HELPER, "file", 0o755, "root", "root"), "[hub-4]", "the helper is installed root:root 0755", describe(HELPER));
  check(hasMode(COMMAND, "file", 0o755, "root", "root"), "[hub-7]", "the spex-hub command is installed root:root 0755", describe(COMMAND));
  for (const unit of UNITS) {
    check(hasMode(`${UNIT_DIR}/${unit}`, "file", 0o644, "root", "root"), "[hub-7]", `the unit ${unit} is installed root:root 0644`, describe(`${UNIT_DIR}/${unit}`));
  }
  const seatUnit = unitOf("1");
  const user = await unitProperty(seatUnit, "User");
  const killMode = await unitProperty(seatUnit, "KillMode");
  const timeout = await unitProperty(seatUnit, "TimeoutStopUSec");
  check(
    user === "spex-1" && killMode === "mixed" && spanUs(timeout) > 15e6,
    "[hub-4]",
    `systemd reads the seat unit: User=spex-<id>, KillMode=${killMode}, TimeoutStopSec=${timeout}, above the core's own bounds`,
    `User=${user}`,
  );
  check(hasMode(SUDOERS, "file", 0o440, "root", "root"), "[hub-4]", "the sudoers fragment is installed root:root 0440", describe(SUDOERS));
  const visudo = await run("visudo", ["-cf", SUDOERS]);
  check(visudo.code === 0, "[hub-4]", "the sudoers fragment passes visudo -cf", firstLine(visudo.stdout + visudo.stderr));
  const allowed = [];
  for (const form of ["create", "start", "stop", "wipe"]) {
    allowed.push((await run("sudo", ["-n", "-l", "-U", "spex-hub", HELPER, form, "1"])).code === 0);
  }
  const shell = await run("sudo", ["-n", "-l", "-U", "spex-hub", "/bin/sh"]);
  const other = await run("sudo", ["-n", "-l", "-U", "spex-hub", "/usr/bin/id"]);
  check(
    allowed.every(Boolean) && shell.code !== 0 && other.code !== 0,
    "[hub-4]",
    "sudo lets spex-hub run the helper's four forms as root and neither a shell nor another program",
    `forms ${allowed.join(",")}; /bin/sh ${shell.code}; /usr/bin/id ${other.code}`,
  );
  check(hasMode(TMPFILES, "file", 0o644, "root", "root"), "[hub-4]", "the tmpfiles fragment is installed root:root 0644", describe(TMPFILES));
  check(
    hasMode(RUN_BASE, "dir", 0o711, "root", "root") && hasMode(RUN_DIR, "dir", 0o711, "root", "root"),
    "[hub-4]",
    "the tmpfiles fragment made /run/spex and /run/spex/seats root:root 0711",
    `${describe(RUN_BASE)}; ${describe(RUN_DIR)}`,
  );
  check(
    hasMode(AGENTS_ENV, "file", 0o640, "root", "spex-seats") && stat(AGENTS_ENV).size === 0,
    "[hub-7]",
    "the shared credential file is made empty, root:spex-seats 0640",
    describe(AGENTS_ENV),
  );
  const help = await asUser("spex-hub", [COMMAND, "help"]);
  check(help.code === 0 && /usage: spex-hub/.test(help.stdout), "[hub-7]", "the spex-hub command runs as the hub's account", `exit ${help.code}`);
  const printed = [SERVER_ENV, AGENTS_ENV, TOKEN_FILE, "TLS certificate", `sudo -u spex-hub ${COMMAND} attach`, `--state-dir=${STATE_DIR}`, `--token-file=${TOKEN_FILE}`, "systemctl enable --now spex-hub"];
  const missing = printed.filter((text) => !installOutput.includes(text));
  check(missing.length === 0, "[hub-7]", "install.sh prints the four files to write and the attach and enable commands", `missing ${missing.join(", ")}`);
}

async function writeAdministratorsFiles() {
  phase("the administrator's four files");
  standin = await startStandin(server);
  info(`the stand-in instance serves ${standin.url}`);
  await run("install", ["-m", "0644", "-o", "root", "-g", "root", "/dev/null", SERVER_ENV]);
  writeFileSync(SERVER_ENV, `SPEX_HOST_URL=${standin.url}\nSPEX_SERVER_ID=${server.id}\nSPEX_SERVER_NAME=${server.name}\n`);
  await run("install", ["-m", "0640", "-o", "root", "-g", "spex-hub", "/dev/null", TOKEN_FILE]);
  writeFileSync(TOKEN_FILE, `${server.token}\n`);
  writeFileSync(AGENTS_ENV, `CLAUDE_CODE_OAUTH_TOKEN=${agentToken}\n`);
  await run("install", ["-d", "-m", "0755", "-o", "root", "-g", "root", TLS_DIR]);
  const result = await run("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    "-keyout", TLS_KEY, "-out", TLS_CERT,
  ]);
  must(result.code === 0, "[hub-1]", "a self-signed TLS pair for 127.0.0.1 is made", firstLine(result.stderr));
  await run("chown", ["root:spex-hub", TLS_KEY]);
  await run("chmod", ["0640", TLS_KEY]);
  await run("chmod", ["0644", TLS_CERT]);
  ca = readFileSync(TLS_CERT);
  check(
    hasMode(SERVER_ENV, "file", 0o644, "root", "root") &&
      hasMode(TOKEN_FILE, "file", 0o640, "root", "spex-hub") &&
      hasMode(AGENTS_ENV, "file", 0o640, "root", "spex-seats") &&
      hasMode(TLS_KEY, "file", 0o640, "root", "spex-hub"),
    "[hub-7]",
    "the administrator's files stand as install.sh asked: server.env 0644, server.token root:spex-hub 0640, agents.env root:spex-seats 0640, the key readable by spex-hub",
    [SERVER_ENV, TOKEN_FILE, AGENTS_ENV, TLS_KEY].map(describe).join("; "),
  );
}

async function installAgain() {
  phase("install.sh again (hub-7)");
  const files = [SERVER_ENV, TOKEN_FILE, AGENTS_ENV, TLS_CERT, TLS_KEY, STATE_DIR];
  const before = {
    files: files.map(digest),
    hub: passwd("spex-hub")?.line,
    groups: [group("spex-hub")?.line, group("spex-seats")?.line],
  };
  const second = await run(INSTALL, [], { timeoutMs: 60 * 60 * 1000 });
  echo(second);
  must(second.code === 0, "[hub-7]", "install.sh runs again and updates the installed files", `exit ${second.code}`);
  const after = {
    files: files.map(digest),
    hub: passwd("spex-hub")?.line,
    groups: [group("spex-hub")?.line, group("spex-seats")?.line],
  };
  const changed = files.filter((_, index) => before.files[index] !== after.files[index]);
  check(changed.length === 0, "[hub-7]", "the second run leaves the administrator's files as they were", `changed ${changed.join(", ")}`);
  check(
    before.hub === after.hub && before.groups.join() === after.groups.join(),
    "[hub-7]",
    "the second run leaves the hub's account and the groups as they were",
    "an account or group changed",
  );
}

async function attachAndStart() {
  phase("attach and start the hub (hub-1, hub-2)");
  const attach = await run("sudo", [
    "-u", "spex-hub", COMMAND, "attach",
    `--state-dir=${STATE_DIR}`,
    `--instance=${standin.url}`,
    `--server-id=${server.id}`,
    `--address=${ADDRESS}`,
    `--tls-cert=${TLS_CERT}`,
    `--tls-key=${TLS_KEY}`,
    `--token-file=${TOKEN_FILE}`,
  ]);
  echo(attach);
  must(attach.code === 0, "[hub-1]", "the printed attach command, filled in, attaches the server as spex-hub", firstLine(attach.stderr));
  const statePath = `${STATE_DIR}/state.yaml`;
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    state = undefined;
  }
  check(
    hasMode(statePath, "file", 0o600, "spex-hub", "spex-hub") && state?.token === server.token && state?.address === ADDRESS,
    "[hub-1] [hub-8]",
    "the hub keeps the server and its token in its own state, owner-only",
    describe(statePath),
  );
  const enable = await run("systemctl", ["enable", "--now", "spex-hub"]);
  must(enable.code === 0, "[hub-2]", "systemctl enable --now spex-hub starts the hub", firstLine(enable.stderr));
  const serving = await waitFor(async () => (await probeHub(ca)) === 405, 30_000);
  must(serving, "[hub-2]", `the hub serves ${ADDRESS} over TLS with the administrator's certificate`, `GET /admit answered ${await probeHub(ca)}`);
  const pid = Number(await unitProperty("spex-hub.service", "MainPID"));
  check(userName(uidOfPid(pid)) === "spex-hub", "[hub-2]", "the hub runs as spex-hub", `pid ${pid} uid ${uidOfPid(pid)}`);
}

async function admitBoth() {
  phase("admit two members (hub-2, hub-4)");
  for (const person of PERSONS) {
    const ticket = standin.ticket(person, LONG_LEASE_MS);
    const started = Date.now();
    const answer = await admit(ca, JSON.stringify({ ticket }));
    const entry = standin.tickets.get(ticket);
    const body = answer.body ?? {};
    must(
      answer.status === 200 &&
        body.endpoint === `wss://127.0.0.1:${HUB_PORT}/seats/${person.id}` &&
        typeof body.bearer === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(body.bearer) &&
        body.lease_expires_at === entry.expiresAt &&
        body.person?.id === person.id,
      "[hub-2] [hub-4]",
      `POST /admit for ${person.login} (${person.id}) answers 200 with the seat's endpoint, a bearer and the lease's expiry (${Math.round((Date.now() - started) / 1000)} s, the seat started)`,
      `${answer.status} ${JSON.stringify(answer.body ?? answer.error)}`,
    );
    bearers.set(person.id, body.bearer);
    if (person === PERSONS[0]) {
      const again = await admit(ca, JSON.stringify({ ticket }));
      check(
        again.status === 401 && again.body?.error?.code === "ticket_invalid",
        "[hub-2]",
        "the same ticket presented again answers 401 ticket_invalid",
        `${again.status} ${JSON.stringify(again.body)}`,
      );
    }
  }
  for (const person of PERSONS) {
    const account = `spex-${person.id}`;
    const entry = passwd(account);
    const groups = (await run("id", ["-Gn", account])).stdout.trim().split(/\s+/);
    check(
      entry !== undefined && groups.includes("spex-seats") && !groups.includes("spex-hub"),
      "[hub-4]",
      `the helper made the account ${account} in the group spex-seats, not in the hub's group`,
      `${entry?.line ?? "no account"}; groups ${groups.join(",")}`,
    );
    check(hasMode(`/home/${account}`, "dir", 0o700, account, account), "[hub-4]", `${account}'s home is readable by that account alone (0700)`, describe(`/home/${account}`));
    const unit = unitOf(person.id);
    const state = await activeState(unit);
    const user = await unitProperty(unit, "User");
    const main = Number(await unitProperty(unit, "MainPID"));
    const pids = await cgroupPids(unit);
    const owners = [...new Set(pids.map((pid) => userName(uidOfPid(pid))))];
    check(
      state === "active" && user === account && userName(uidOfPid(main)) === account && owners.length === 1 && owners[0] === account,
      "[hub-4]",
      `the unit ${unit} is active and every process in its control group runs as ${account}`,
      `${state}; User=${user}; main ${main} as ${userName(uidOfPid(main))}; ${pids.length} pids as ${owners.join(",")}`,
    );
  }
}

async function isolation() {
  phase("isolation (hub-4)");
  for (const [mine, theirs] of [PERSONS, [...PERSONS].reverse()]) {
    const me = `spex-${mine.id}`;
    const them = `spex-${theirs.id}`;
    const planted = await asUser(them, ["/bin/sh", "-c", 'umask 022 && echo "a file of its own" > "$1"', "sh", `/home/${them}/lane-private.txt`]);
    if (planted.code !== 0) info(`could not plant a file in ${them}'s home: ${firstLine(planted.stderr)}`);
    const home = await canRead(me, `/home/${them}`);
    const list = await asUser(me, ["ls", `/home/${them}`]);
    const file = await canRead(me, `/home/${them}/lane-private.txt`);
    check(
      !home.test && list.code !== 0 && !file.test && !file.open,
      "[hub-4]",
      `${me} cannot read ${them}'s home: test -r fails, ls fails, a file there cannot be opened`,
      `test -r ${home.test}; ls ${list.code}; file ${JSON.stringify(file)}`,
    );
  }
  const hubGroup = group("spex-hub");
  const hubAccount = passwd("spex-hub");
  const inHubGroup = readFileSync("/etc/passwd", "utf8")
    .split("\n")
    .filter((line) => line.split(":")[3] === String(hubGroup?.gid))
    .map((line) => line.split(":")[0]);
  check(
    hubGroup !== undefined && hubGroup.members.length === 0 && inHubGroup.length === 1 && inHubGroup[0] === hubAccount?.name,
    "[hub-4]",
    "the group spex-hub holds the hub's account alone",
    `members ${hubGroup?.members.join(",")}; primary of ${inHubGroup.join(",")}`,
  );
  for (const [mine, theirs] of [PERSONS, [...PERSONS].reverse()]) {
    const me = `spex-${mine.id}`;
    const them = `spex-${theirs.id}`;
    const dir = `${RUN_DIR}/${mine.id}`;
    const token = `${dir}/token`;
    const socket = `${dir}/core.sock`;
    try {
      seatTokens.set(mine.id, secret(readFileSync(token, "utf8").trim()));
    } catch {
      // checked below
    }
    check(
      hasMode(dir, "dir", 0o2750, me, "spex-hub") &&
        hasMode(token, "file", 0o640, me, "spex-hub") &&
        hasMode(socket, "socket", 0o660, me, "spex-hub"),
      "[hub-4]",
      `the seat's runtime directory, token and socket carry ${me} as owner, spex-hub as group, nothing for others`,
      [dir, token, socket].map(describe).join("; "),
    );
    const reads = {
      hub: await canRead("spex-hub", token),
      seat: await canRead(me, token),
      other: await canRead(them, token),
      nobody: await canRead("nobody", token),
    };
    check(
      reads.hub.open && reads.seat.open && !reads.other.test && !reads.other.open && !reads.nobody.open,
      "[hub-4]",
      `${token} is read by spex-hub and ${me}, and neither by ${them} nor by nobody`,
      JSON.stringify(reads),
    );
    const connects = {
      hub: await connectAs("spex-hub", socket),
      seat: await connectAs(me, socket),
      other: await connectAs(them, socket),
      nobody: await connectAs("nobody", socket),
    };
    check(
      connects.hub === "connected" && connects.seat === "connected" && connects.other === "EACCES" && connects.nobody === "EACCES",
      "[hub-4]",
      `${socket} admits a connection from spex-hub and ${me}, and refuses ${them} and nobody (EACCES)`,
      JSON.stringify(connects),
    );
  }
}

async function relay() {
  phase("relay (hub-3)");
  const [ada, bob] = PERSONS;
  const opened = await openRelay(WebSocket, ca, ada.id, { bearer: bearers.get(ada.id) });
  must(opened.socket !== undefined, "[hub-3]", "a relay opens with the bearer in the Authorization header and no Origin", JSON.stringify(opened));
  const hello = await waitFor(() => messages(opened).some((message) => message.type === "hello"), 15_000, 50);
  opened.socket.send(JSON.stringify({ type: "project.list", id: "lane-1" }));
  const replied = await waitFor(() => messages(opened).some((message) => message.type === "reply" && message.id === "lane-1"), 15_000, 50);
  const reply = messages(opened).find((message) => message.type === "reply" && message.id === "lane-1");
  check(
    hello && replied && reply?.ok === true && Array.isArray(reply.result),
    "[hub-3]",
    "the relay reaches the seat's core: its hello, then a project.list round trip",
    `hello ${hello}; reply ${JSON.stringify(reply)?.slice(0, 200)}`,
  );
  opened.socket.close(1000);
  const withOrigin = await openRelay(WebSocket, ca, ada.id, { bearer: bearers.get(ada.id), origin: "https://example.com" });
  const wrong = await openRelay(WebSocket, ca, ada.id, { bearer: bearers.get(bob.id) });
  const none = await openRelay(WebSocket, ca, ada.id);
  check(
    withOrigin.status === 403 && wrong.status === 401 && none.status === 401,
    "[hub-3]",
    "a relay with an Origin is refused 403, another seat's bearer or none 401",
    `${withOrigin.status} ${wrong.status} ${none.status}`,
  );
}

async function stopAtLeaseEnd() {
  const [ada, bob] = PERSONS;
  const account = `spex-${ada.id}`;
  const home = `/home/${account}`;
  const unit = unitOf(ada.id);
  phase(`the stop at the lease's end (hub-4, hub-5): ${unit}`);
  const marker = `${home}/projects/lane-marker.txt`;
  const planted = await asUser(account, ["/bin/sh", "-c", 'mkdir -p "$(dirname "$1")" && echo "the seat\'s own work" > "$1"', "sh", marker]);
  must(planted.code === 0, "[hub-5]", "the seat's account writes a file in its home", firstLine(planted.stderr));
  const listing = async () =>
    (await run("find", [home, "-xdev", "-printf", "%y %m %u %p\\n"])).stdout.split("\n").filter(Boolean).sort();
  const before = await listing();
  const timeout = await unitProperty(unit, "TimeoutStopUSec");
  const timeoutUs = spanUs(timeout);

  // The stubborn agent, started inside the seat unit's control group as
  // the seat's account: the shell moves itself into the group, then
  // becomes the agent, whose child is born there.
  const cgroup = await unitProperty(unit, "ControlGroup");
  const mainPid = Number(await unitProperty(unit, "MainPID"));
  const uid = passwd(account).uid;
  const gid = passwd(account).gid;
  const log = `${home}/lane-stubborn.log`;
  const agent = spawn(
    "/bin/sh",
    [
      "-c",
      'echo $$ > "$1" && exec setpriv --reuid="$2" --regid="$3" --init-groups -- "$4" "$5" "$6" agent',
      "sh",
      `/sys/fs/cgroup${cgroup}/cgroup.procs`,
      String(uid),
      String(gid),
      NODE,
      STUBBORN,
      log,
    ],
    { cwd: home, env: { PATH: "/usr/bin:/bin", HOME: home }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let agentOut = "";
  let agentErr = "";
  agent.stdout.on("data", (chunk) => (agentOut += chunk));
  agent.stderr.on("data", (chunk) => (agentErr += chunk));
  const agentExited = new Promise((resolveExit) => agent.once("exit", (code, signal) => resolveExit({ code, signal })));
  await waitFor(() => /^\d+\n/.test(agentOut), 15_000, 50);
  const childPid = Number(agentOut.trim().split("\n")[0]);
  const agentPid = agent.pid;
  must(childPid > 0, "[hub-5]", "the stubborn agent starts with its child", `stdout ${JSON.stringify(agentOut)} stderr ${firstLine(agentErr)}`);
  const pids = await cgroupPids(unit);
  check(
    pids.includes(agentPid) && pids.includes(childPid) && uidOfPid(agentPid) === uid && uidOfPid(childPid) === uid,
    "[hub-5]",
    `the stubborn agent ${agentPid} and its child ${childPid} run as ${account} in ${unit}'s control group`,
    `group pids ${pids.join(",")}`,
  );
  process.kill(agentPid, "SIGTERM");
  process.kill(childPid, "SIGTERM");
  await sleep(1500);
  check(alive(agentPid) && alive(childPid), "[hub-5]", "the agent and its child outlive a SIGTERM: they are stubborn", `agent ${alive(agentPid)} child ${alive(childPid)}`);

  // The member admitted again on a lease the instance grants for 20 s.
  const ticket = standin.ticket(ada, SHORT_LEASE_MS);
  const answer = await admit(ca, JSON.stringify({ ticket }));
  must(answer.status === 200, "[hub-2]", `${ada.login} is admitted again on a lease of ${SHORT_LEASE_MS / 1000} s`, `${answer.status} ${JSON.stringify(answer.body ?? answer.error)}`);
  bearers.set(ada.id, answer.body.bearer);
  const expiresAt = Date.parse(answer.body.lease_expires_at);
  const expiresMonoUs = monotonicUs() + (expiresAt - Date.now()) * 1000;
  const opened = await openRelay(WebSocket, ca, ada.id, { bearer: answer.body.bearer });
  check(opened.socket !== undefined, "[hub-3]", "a relay opens on the new bearer", JSON.stringify(opened));

  info(`waiting for the lease's end at ${answer.body.lease_expires_at} and the unit's stop (TimeoutStopSec=${timeout})`);
  // The unit's states as polled, and its stop as PID 1 logged it: an
  // inactive instance may be unloaded at once, its timestamps with it.
  const seen = {};
  const stopped = await waitFor(
    async () => {
      const state = await activeState(unit);
      seen[state] ??= monotonicUs();
      return state === "inactive" || state === "failed";
    },
    expiresAt - Date.now() + timeoutUs / 1000 + 30_000,
    100,
  );
  must(stopped, "[hub-5]", `${unit} stops after the lease's end`, `still ${await activeState(unit)}`);
  const logged = await stopLogged(unit, expiresMonoUs - 5e6, expiresMonoUs);
  for (const line of logged.lines) info(`journal: ${line}`);
  const stoppingUs = logged.stopping ?? seen.deactivating ?? seen.inactive ?? seen.failed;
  const stoppedUs = logged.stopped ?? seen.inactive ?? seen.failed;
  if (logged.stopping === undefined || logged.stopped === undefined) info("PID 1's Stopping/Stopped entries not found: timing from the polled states");
  const lagS = (stoppingUs - expiresMonoUs) / 1e6;
  const stopS = (stoppedUs - stoppingUs) / 1e6;
  check(lagS > -1 && lagS < 10, "[hub-5]", `the hub stopped the seat at the lease's end (${lagS.toFixed(2)} s after it)`, `${lagS.toFixed(2)} s`);
  check(
    stopS >= 0 && stopS * 1e6 <= timeoutUs + 1e6,
    "[hub-4] [hub-5]",
    `the unit stopped within its TimeoutStopSec (${stopS.toFixed(2)} s of ${timeoutUs / 1e6} s)`,
    `${stopS.toFixed(2)} s`,
  );
  await Promise.race([agentExited, sleep(5000)]);
  await waitFor(() => !alive(childPid), 5000, 100);
  let remaining = [];
  try {
    remaining = readFileSync(`/sys/fs/cgroup${cgroup}/cgroup.procs`, "utf8").split("\n").filter(Boolean);
  } catch {
    remaining = [];
  }
  check(
    !alive(agentPid) && !alive(childPid) && remaining.length === 0,
    "[hub-4] [hub-5]",
    "the stop killed the stubborn agent and its child; no process is left in the seat's control group",
    `agent ${alive(agentPid)} child ${alive(childPid)}; left ${remaining.join(",")}`,
  );
  info(`the stubborn agent ended ${JSON.stringify(await Promise.race([agentExited, sleep(10)]))}`);
  await waitFor(() => opened.closeCode !== undefined, 5000, 50);
  check(opened.closeCode === 4401, "[hub-3] [hub-5]", "the lease's end closed the member's relay with 4401", `close code ${opened.closeCode}`);
  // What the core's own graceful stop removes (core-service-39): the
  // lease it holds on its home, and its scratch for staged assets and
  // uploads; every other path stands.
  const coreRuntime = /\/\.spex\/(\.lease|local\/asset-staging|local\/uploads\/)/;
  const after = await listing();
  const gone = before.filter((line) => !after.includes(line));
  const released = gone.filter((line) => coreRuntime.test(line));
  const lost = gone.filter((line) => !coreRuntime.test(line));
  for (const line of released) info(`removed by the core's own stop: ${line}`);
  const mainKilled = logged.lines.some((line) => line.includes(`Killing process ${mainPid} `));
  check(
    mainPid > 0 && !mainKilled && released.some((line) => line.endsWith("/.spex/.lease")),
    "[hub-4]",
    `the core's graceful stop ran first: the main process ${mainPid} exited on SIGTERM unkilled and released its home's lease`,
    `main killed ${mainKilled}; released ${released.join("; ")}`,
  );
  let markerText;
  try {
    markerText = readFileSync(marker, "utf8");
  } catch {
    markerText = undefined;
  }
  check(
    lost.length === 0 && markerText === "the seat's own work\n" && hasMode(home, "dir", 0o700, account, account),
    "[hub-5]",
    `the seat's files stand: every path of ${home} before the stop but the core's own lease and scratch is there after it, the seat's work intact`,
    `lost ${lost.join("; ")}`,
  );
  check((await activeState(unitOf(bob.id))) === "active", "[hub-5]", `the other seat, ${unitOf(bob.id)}, runs on`, await activeState(unitOf(bob.id)));
  const status = await asUser("spex-hub", [COMMAND, "status"]);
  echo(status);
  const adaRow = status.stdout.split("\n").find((line) => line.startsWith(ada.id));
  const bobRow = status.stdout.split("\n").find((line) => line.startsWith(bob.id));
  check(
    status.code === 0 && /stopped\s+ended/.test(adaRow ?? "") && /running\s+until/.test(bobRow ?? ""),
    "[hub-6]",
    "spex-hub status lists the stopped seat's lease ended and the other seat running",
    `exit ${status.code}`,
  );
}

async function sweepWhileNoHub() {
  const [ada, bob] = PERSONS;
  const account = `spex-${ada.id}`;
  const home = `/home/${account}`;
  const unit = unitOf(ada.id);
  phase(`the sweep while no hub runs (hub-5, hub-10): ${unit}`);
  const enabled = (await run("systemctl", ["is-enabled", SWEEP_TIMER])).stdout.trim();
  const timerState = await activeState(SWEEP_TIMER);
  check(
    enabled === "enabled" && timerState === "active",
    "[hub-5] [hub-7]",
    `the sweep's timer ${SWEEP_TIMER} is enabled and active`,
    `is-enabled ${enabled}; is-active ${timerState}`,
  );
  const sweepUser = await unitProperty(SWEEP, "User");
  check(sweepUser === "", "[hub-5]", `systemd reads ${SWEEP} as root's, naming no User=`, `User=${sweepUser}`);

  // The member admitted again on a lease the instance grants for 20 s:
  // her seat, stopped at the last lease's end, starts anew.
  const ticket = standin.ticket(ada, SHORT_LEASE_MS);
  const answer = await admit(ca, JSON.stringify({ ticket }));
  must(
    answer.status === 200,
    "[hub-2]",
    `${ada.login} is admitted again on a lease of ${SHORT_LEASE_MS / 1000} s`,
    `${answer.status} ${JSON.stringify(answer.body ?? answer.error)}`,
  );
  bearers.set(ada.id, answer.body.bearer);
  const expiresAt = Date.parse(answer.body.lease_expires_at);
  must((await activeState(unit)) === "active", "[hub-4]", `${unit} runs again`, await activeState(unit));
  const listing = async () =>
    (await run("find", [home, "-xdev", "-printf", "%y %m %u %p\\n"])).stdout.split("\n").filter(Boolean).sort();
  const before = await listing();

  const sweptSince = Math.floor(Date.now() / 1000);
  const stopHub = await run("systemctl", ["stop", "spex-hub"], { timeoutMs: 180_000 });
  const hubState = await activeState("spex-hub.service");
  must(stopHub.code === 0 && hubState !== "active", "[hub-5]", "systemctl stop spex-hub stops the hub's unit", `exit ${stopHub.code}; ${hubState}`);
  const table = digest(`${STATE_DIR}/leases.yaml`);
  const running = await activeState(unit);
  check(
    running === "active" && Date.now() < expiresAt,
    "[hub-5]",
    `with no hub running, ${unit} runs on before its lease's end`,
    `${running}, ${expiresAt - Date.now()} ms before the end`,
  );

  info(`waiting for the lease's end at ${answer.body.lease_expires_at} and the sweep's stop within ${SWEEP_BOUND_MS / 1000} s of it`);
  let stoppedAt;
  const stopped = await waitFor(
    async () => {
      const state = await activeState(unit);
      if (state !== "inactive" && state !== "failed") return false;
      stoppedAt = Date.now();
      return true;
    },
    expiresAt - Date.now() + SWEEP_BOUND_MS,
    500,
  );
  must(stopped, "[hub-5]", `${unit} stops with no hub running`, `still ${await activeState(unit)}`);
  const afterS = (stoppedAt - expiresAt) / 1000;
  check(
    afterS >= 0 && afterS * 1000 <= SWEEP_BOUND_MS,
    "[hub-5]",
    `the sweep stopped the seat after its lease's end and within two minutes of it (${afterS.toFixed(1)} s after)`,
    `${afterS.toFixed(1)} s`,
  );
  let sweepLine;
  await waitFor(
    async () => {
      const journal = await run("journalctl", ["--no-pager", "-o", "cat", "-u", SWEEP, `--since=@${sweptSince}`], { timeoutMs: 60_000 });
      sweepLine = journal.stdout.split("\n").find((line) => line.includes(`stopped the seat of ${ada.login} (${ada.id})`));
      return sweepLine !== undefined;
    },
    15_000,
    500,
  );
  check(sweepLine !== undefined, "[hub-5]", `the sweep's journal records the stop: ${sweepLine ?? "-"}`, "no such line");
  check(
    digest(`${STATE_DIR}/leases.yaml`) === table,
    "[hub-5] [hub-8]",
    "the sweep left the lease table as the stopped hub left it",
    "leases.yaml changed",
  );
  // What the core's own graceful stop removes (core-service-39); every
  // other path stands.
  const coreRuntime = /\/\.spex\/(\.lease|local\/asset-staging|local\/uploads\/)/;
  const after = await listing();
  const lost = before.filter((line) => !after.includes(line) && !coreRuntime.test(line));
  check(
    lost.length === 0 && hasMode(home, "dir", 0o700, account, account),
    "[hub-5]",
    `the seat's files stand: every path of ${home} before the sweep's stop but the core's own lease and scratch is there after it`,
    `lost ${lost.join("; ")}`,
  );
  check((await activeState(unitOf(bob.id))) === "active", "[hub-5]", `the other seat, its lease holding, runs on`, await activeState(unitOf(bob.id)));

  // The hub's next start finds the stop it owes done.
  const startedSince = Math.floor(Date.now() / 1000);
  const start = await run("systemctl", ["start", "spex-hub"]);
  must(start.code === 0, "[hub-5]", "systemctl start spex-hub starts the hub again", firstLine(start.stderr));
  const serving = await waitFor(async () => (await probeHub(ca)) === 405, 30_000);
  must(serving, "[hub-5]", "the restarted hub serves", `GET /admit answered ${await probeHub(ca)}`);
  const endedLine = new RegExp(`the lease of ${ada.login} \\(${ada.id}\\) ended: its stop was still owed when the hub started; seat stopped`);
  const ended = await waitFor(
    async () =>
      endedLine.test(
        (await run("journalctl", ["--no-pager", "-o", "cat", "-u", "spex-hub.service", `--since=@${startedSince}`], { timeoutMs: 60_000 })).stdout,
      ),
    15_000,
    500,
  );
  check(ended, "[hub-5] [hub-8]", "the hub's next start records that lease ended, its owed stop found done", "no such line in the hub's journal");
  let lease;
  try {
    lease = JSON.parse(readFileSync(`${STATE_DIR}/leases.yaml`, "utf8"))[ada.id];
  } catch {
    lease = undefined;
  }
  check(lease !== undefined && lease.stop_owed === undefined && lease.bearer_hash === null, "[hub-8]", "the lease is recorded ended, its stop no longer owed", JSON.stringify(lease));
  const status = await asUser("spex-hub", [COMMAND, "status"]);
  echo(status);
  const adaRow = status.stdout.split("\n").find((line) => line.startsWith(ada.id));
  const bobRow = status.stdout.split("\n").find((line) => line.startsWith(bob.id));
  check(
    status.code === 0 && /stopped\s+ended/.test(adaRow ?? "") && /running\s+until/.test(bobRow ?? ""),
    "[hub-6]",
    "spex-hub status lists the swept seat stopped, its lease ended, and the other seat running",
    `exit ${status.code}`,
  );
}

async function retire() {
  phase("retire (hub-4, hub-6)");
  const kept = new Map();
  for (const person of PERSONS) {
    const account = `spex-${person.id}`;
    const planted = await asUser(account, [
      "/bin/sh",
      "-c",
      'umask 077 && mkdir -p "$1/.spex/local" && cd "$1/.spex/local" &&' +
        ' printf "format: 1\\nhosts: {}\\n" > credentials.yaml &&' +
        ' printf "format: 1\\nhosts: {}\\nagents: {}\\n" > code-credentials.yaml &&' +
        ' echo kept > lane-other.yaml && echo kept > "$1/lane-kept.txt"',
      "sh",
      `/home/${account}`,
    ]);
    must(planted.code === 0, "[hub-6]", `${account} holds an app token file and a code-credentials file under ~/.spex/local`, firstLine(planted.stderr));
    kept.set(person.id, [`/home/${account}/.spex/local/lane-other.yaml`, `/home/${account}/lane-kept.txt`, `/home/${account}/lane-private.txt`]);
  }
  const retired = await asUser("spex-hub", [COMMAND, "retire"], { timeoutMs: 5 * 60 * 1000 });
  echo(retired);
  check(
    retired.code === 0 && /retired: 2 seat\(s\)/.test(retired.stdout) && /group Owner retires the server/.test(retired.stdout),
    "[hub-6]",
    "spex-hub retire stops and wipes both seats and says a group Owner retires the server at the instance",
    `exit ${retired.code}: ${firstLine(retired.stderr)}`,
  );
  for (const person of PERSONS) {
    const account = `spex-${person.id}`;
    const home = `/home/${account}`;
    const state = await activeState(unitOf(person.id));
    check(state === "inactive" || state === "failed", "[hub-6]", `${unitOf(person.id)} is stopped`, state);
    const left = kept.get(person.id).filter((path) => !existsSync(path));
    check(
      hasMode(home, "dir", 0o700, account, account) && left.length === 0,
      "[hub-6]",
      `${home} stands with its files, ~/.spex/local's other files among them`,
      `missing ${left.join(", ")}`,
    );
    const credentials = [`${home}/.spex/local/credentials.yaml`, `${home}/.spex/local/code-credentials.yaml`];
    const present = credentials.filter((path) => existsSync(path));
    check(present.length === 0, "[hub-4] [hub-6]", `retire removed ${account}'s credentials.yaml and code-credentials.yaml`, `present ${present.join(", ")}`);
  }
  const statePath = `${STATE_DIR}/state.yaml`;
  const text = readFileSync(statePath, "utf8");
  let state;
  try {
    state = JSON.parse(text);
  } catch {
    state = undefined;
  }
  check(
    state !== undefined && state.token === null && !text.includes(server.token),
    "[hub-6] [hub-8]",
    "the hub's state forgets the server token",
    "the token is still in the state file",
  );
  const stoppedHub = await waitFor(async () => (await activeState("spex-hub.service")) !== "active", 15_000);
  info(`the retired hub stopped serving: ${stoppedHub}; spex-hub.service ${await activeState("spex-hub.service")}, Result=${await unitProperty("spex-hub.service", "Result")}`);
  const status = await asUser("spex-hub", [COMMAND, "status"]);
  echo(status);
  check(status.code === 0 && /retired/.test(status.stdout), "[hub-6]", "spex-hub status says the server is retired", `exit ${status.code}`);
}

async function noSecretsLogged() {
  phase("no secret in the logs (hub-8)");
  const units = ["spex-hub.service", SWEEP, ...PERSONS.map((person) => unitOf(person.id))];
  const journal = await run("journalctl", ["--no-pager", "-o", "cat", ...units.flatMap((unit) => ["-u", unit])], { timeoutMs: 60_000 });
  const values = [server.token, agentToken, ...bearers.values(), ...seatTokens.values()];
  const found = values.filter((value) => value && journal.stdout.includes(value)).length;
  check(
    journal.code === 0 && journal.stdout.length > 0 && found === 0,
    "[hub-8]",
    `the journal of the hub and the seats (${journal.stdout.split("\n").length} lines) holds no server token, bearer, seat token or agent sign-in`,
    `${found} found`,
  );
  const leases = readFileSync(`${STATE_DIR}/leases.yaml`, "utf8");
  check(
    [...bearers.values()].every((bearer) => !leases.includes(bearer)),
    "[hub-8]",
    "the lease table holds no bearer, its hash alone",
    "a bearer is in leases.yaml",
  );
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  const unknown = args.filter((arg) => arg !== "--fresh");
  if (unknown.length) {
    say(`privileged-lane: unknown argument ${unknown[0]}; usage: sudo apps/hub/scripts/privileged-lane.sh [--fresh]`);
    return 64;
  }
  if (process.getuid?.() !== 0) {
    say("privileged-lane: run as root: it installs the hub, creates accounts and starts units");
    return 77;
  }
  if (process.platform !== "linux" || !existsSync("/run/systemd/system")) {
    say("privileged-lane: a Linux host with systemd as its init is needed");
    return 69;
  }
  const release = /PRETTY_NAME="([^"]*)"/.exec(readFileSync("/etc/os-release", "utf8"))?.[1] ?? "unknown";
  const systemd = firstLine((await run("systemctl", ["--version"])).stdout);
  const sudo = firstLine((await run("sudo", ["--version"])).stdout);
  info(`host ${release}; kernel ${firstLine((await run("uname", ["-r"])).stdout)}; ${systemd}; ${sudo}; node ${process.versions.node} at ${process.execPath}`);
  info(`checkout ${CHECKOUT}${process.env.LANE_COMMIT ? ` at ${process.env.LANE_COMMIT}` : ""}; date ${new Date().toISOString()}`);
  const traces = installedTraces().concat(seatAccounts());
  if (traces.length) {
    if (!fresh) {
      say(`privileged-lane: this host holds an earlier install (${traces.join(", ")}); on a disposable host, run again with --fresh to remove it first`);
      return 2;
    }
    await removePrevious();
  }
  try {
    await install();
    WebSocket = createRequire(join(CHECKOUT, "apps/hub/package.json"))("ws");
    await writeAdministratorsFiles();
    await installAgain();
    await attachAndStart();
    await admitBoth();
    await isolation();
    await relay();
    await stopAtLeaseEnd();
    await sweepWhileNoHub();
    await retire();
    await noSecretsLogged();
  } catch (error) {
    if (!(error instanceof Fatal)) check(false, "", "the lane ran to its end", error?.stack ?? String(error));
    else say(`the lane stops here: ${error.message}`);
  } finally {
    if (standin) {
      info(`the stand-in instance answered ${standin.requests.length} requests: ${[...new Set(standin.requests)].join(", ")}`);
      await standin.close();
    }
  }
  say("");
  say(`lane: ${tally.pass} passed, ${tally.fail} failed`);
  return tally.fail === 0 ? 0 : 1;
}

process.exitCode = await main();

#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Fresh-install smoke (release-20, app-shell-35, server-shell-23,
// DR-086): installs the release the way the README tells a new user
// to and launches both shells the same way. It tests the committed
// tree — the clone checks out this checkout's HEAD, so uncommitted
// changes are not in it (a warning says so). Stages, fail-fast:
//
//   preflight  a display for the desktop render
//   clone      git clone of this checkout into a scratch directory
//   install    npm ci on an empty npm cache, no optional dependency lost
//   server     npm run start:server as the README runs it, on a scratch
//              Spex home, walked over its printed token URL — the page,
//              the WebSocket hello, the config seeded in the home, the
//              built-in catalog, the /code artifacts, the bound
//              adapters' readiness, the compiler check, the Academy
//              example — then stopped by SIGTERM
//   desktop    npm start in acceptance mode on scratch user data: the
//              build, the Electron rebuild, the render with its clicks
//              and screenshot, and the Node restore, all in the clone
//   clean      the scratch directory removed
//
// HOME stays the machine's, so readiness reports this machine's
// sign-ins; nothing asserts that an adapter is ready and no agent is
// called. The developer tree is only read: its native module is never
// rebuilt. Needs the network (npm ci, and Electron's binary on first
// launch unless Electron's own download cache holds it) and a display
// (xvfb-run on a headless Linux); never runs in CI. The scratch
// directory is removed on success and kept, its path printed, on
// failure; `--keep` keeps it always. `--hand-off=<file>` keeps it on
// success too and writes its path and the clone's to that file as
// JSON, for the smoke's `live` stage to run in the same clone
// (scripts/smoke.mjs), which then owns its removal.

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const keep = process.argv.includes("--keep");
const handOff = process.argv
  .find((arg) => arg.startsWith("--hand-off="))
  ?.slice("--hand-off=".length);

const INSTALL_BUDGET_MS = 20 * 60_000;
// The launcher builds every workspace before it prints the URL.
const SERVER_URL_BUDGET_MS = 6 * 60_000;
const SERVER_STOP_BUDGET_MS = 30_000;
const DESKTOP_BUDGET_MS = 10 * 60_000;
// Every playbook the seeded template enables, by command.
const TEMPLATE_COMMANDS = ["code", "review", "decide", "dev", "branch", "pr"];
// Rail entries the render activates by accessible name (NavRail's
// labels); a click that misses is a console error, which fails the
// render. The names are English, so the desktop's home stores English
// as its language: with no choice stored the app follows the system,
// and on a Chinese system every name would miss.
const CLICKS = "Playbooks,Settings,Dashboard";
// The steps `npm start` runs, in order (scripts/desktop-runner.mjs).
const DESKTOP_STEPS = [
  "workspace build",
  "Electron ABI rebuild",
  "Electron launch",
  "Node ABI restore",
];
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

let stage = "";
let stageStarted = 0;
let scratch;
const timings = [];
// Children in process groups of their own, still running.
const running = new Set();
let failing = false;

function elapsed(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function passed() {
  if (stage) timings.push(`${stage} ${elapsed(Date.now() - stageStarted)}`);
}

function begin(name) {
  passed();
  stage = name;
  stageStarted = Date.now();
  process.stdout.write(`\n=== install-smoke: ${name} ===\n`);
}

const say = (line) => process.stdout.write(`install-smoke: ${line}\n`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const describeExit = ({ code, signal, error }) =>
  error
    ? `failed to start: ${error.message}`
    : signal
      ? `was killed by ${signal}`
      : `exited ${code}`;

/** A quick command; non-zero exit fails the stage. */
/**
 * Your own group's config in a home (storage-1): the clone of the key
 * `home.yaml`'s `own` records (storage-2), or a path that cannot exist
 * where the home has no home file yet.
 */
function ownConfigPath(home) {
  const file = join(home, "home.yaml");
  const own = existsSync(file) ? /^own: ["']?([^"'\s]+)["']?$/m.exec(readFileSync(file, "utf8"))?.[1] : undefined;
  return join(home, "workspace", ...(own ?? "(no home.yaml)").split("/"), "config", "playbook.config.yaml");
}

function exec(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf-8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}:\n` +
        `${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

/** A first-time user's shell on this machine: its HOME and PATH, none
 * of this host's own Spex settings, and nothing stopping Electron from
 * fetching its binary. */
function userEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("SPEX_")) continue;
    if (key === "ELECTRON_SKIP_BINARY_DOWNLOAD") continue;
    if (key === "ELECTRON_RUN_AS_NODE") continue;
    env[key] = value;
  }
  return { ...env, ...extra };
}

const within = (promise, ms) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });

async function waitFor(check, budgetMs, what) {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(250);
  }
}

/** Start a command in a process group of its own, teeing its output,
 * keeping its stdout, and noting its last line for a timeout to name. */
function launch(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const run = { child, stdout: "", last: "", exit: undefined };
  const note = (chunk) => {
    const line = chunk
      .split("\n")
      .filter((text) => text.trim())
      .at(-1);
    if (line) run.last = line.trim();
  };
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk) => {
    run.stdout += chunk;
    note(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    note(chunk);
    process.stderr.write(chunk);
  });
  run.exited = new Promise((resolve) => {
    const settle = (exit) => {
      if (run.exit) return;
      run.exit = exit;
      running.delete(run);
      resolve(exit);
    };
    child.once("error", (error) => settle({ code: null, signal: null, error }));
    child.once("exit", (code, signal) => settle({ code, signal }));
  });
  run.closed = new Promise((resolve) => child.once("close", resolve));
  running.add(run);
  return run;
}

/** Signal a child's whole group; false when the group is gone. */
function signalGroup(run, signal) {
  if (!run.child.pid) return false;
  try {
    process.kill(-run.child.pid, signal);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

/** SIGTERM a group, then SIGKILL it once the grace runs out: `npm
 * start` needs the grace to stop its step and restore the module. */
async function stopGroup(run, graceMs) {
  if (!run.exit) {
    signalGroup(run, "SIGTERM");
    if (await within(run.exited, graceMs)) return;
  }
  signalGroup(run, "SIGKILL");
  await within(run.exited, 5_000);
}

function processes() {
  const listing = spawnSync("ps", ["-A", "-ww", "-o", "pid=,pgid=,command="], {
    encoding: "utf-8",
  });
  return (listing.stdout ?? "")
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, pid, pgid, command]) => ({
      pid: Number(pid),
      pgid: Number(pgid),
      command,
    }));
}

/** After a failure: the desktop launcher starts each step, Electron
 * included, in a group of its own, so anything still running from the
 * scratch clone is killed by name. */
function sweep() {
  if (!scratch) return;
  for (const { pid, command } of processes()) {
    if (pid === process.pid || !command.includes(scratch)) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

/** A port that refuses a connection is closed. */
function portRefuses(port) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(5_000);
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`port ${port} still accepts connections after the stop`));
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`port ${port} neither accepted nor refused a connection`));
    });
    socket.once("error", (error) =>
      error.code === "ECONNREFUSED"
        ? resolve()
        : reject(new Error(`port ${port}: ${error.code ?? error.message}`)),
    );
  });
}

/** Open the core's socket, take its hello, and send commands on it. */
async function connectCore(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const replies = new Map();
  let seq = 0;
  const hello = new Promise((resolve) => {
    socket.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.type === "hello") resolve(message);
      if (message.type === "reply") replies.get(message.id)?.(message);
    });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("the WebSocket never opened")),
      30_000,
    );
    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`the WebSocket failed: ${error.message}`));
    });
  });
  // A reply the closed socket can no longer bring fails now, not later.
  socket.on("close", () => {
    for (const settle of replies.values()) {
      settle({
        ok: false,
        error: { message: "the socket closed before the reply" },
      });
    }
  });
  const greeting = await within(hello, 10_000);
  assert(greeting, "the core sent no hello on the socket");
  const command = (type, fields = {}) =>
    new Promise((resolve, reject) => {
      const id = `i${(seq += 1)}`;
      const timer = setTimeout(
        () => reject(new Error(`${type}: no reply within 60s`)),
        60_000,
      );
      replies.set(id, (reply) => {
        clearTimeout(timer);
        replies.delete(id);
        if (reply.ok) resolve(reply.result);
        else reject(new Error(`${type}: ${reply.error.message}`));
      });
      socket.send(JSON.stringify({ type, id, ...fields }));
    });
  return { socket, hello: greeting, command };
}

/** The JSON block acceptance mode prints (apps/desktop/src/main.ts):
 * two-space indented, so only its own closing brace starts a line. */
function acceptanceReport(stdout) {
  const start = stdout.lastIndexOf('{\n  "acceptance": ');
  if (start < 0) return undefined;
  const end = stdout.indexOf("\n}", start);
  if (end < 0) return undefined;
  try {
    return JSON.parse(stdout.slice(start, end + 2));
  } catch {
    return undefined;
  }
}

async function fail(message, exitCode, { escalate = false } = {}) {
  if (failing) {
    // The first failure owns the cleanup; only a second signal cuts
    // its grace short.
    if (!escalate) return new Promise(() => {});
    for (const run of running) signalGroup(run, "SIGKILL");
    sweep();
    process.exit(exitCode);
  }
  failing = true;
  process.stderr.write(`\ninstall-smoke FAILED at ${stage}: ${message}\n`);
  await Promise.all([...running].map((run) => stopGroup(run, 90_000)));
  sweep();
  if (scratch) process.stderr.write(`scratch kept for debugging: ${scratch}\n`);
  process.exit(exitCode);
}

// The shells run in process groups of their own, which a terminal's
// interrupt does not reach: stop them here.
process.on("SIGINT", () =>
  void fail("interrupted by SIGINT", 130, { escalate: true }),
);
process.on("SIGTERM", () =>
  void fail("interrupted by SIGTERM", 143, { escalate: true }),
);

try {
  begin("preflight");
  if (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  ) {
    throw new Error(
      "no display for the desktop render: run the smoke under xvfb-run, " +
        "e.g. `xvfb-run -a npm run smoke`",
    );
  }

  begin("clone");
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "spex-install-smoke-")));
  const clone = join(scratch, "spex");
  const sha = exec("git", ["-C", root, "rev-parse", "HEAD"]).trim();
  if (exec("git", ["-C", root, "status", "--porcelain"]).trim()) {
    say(
      `WARNING: ${root} has uncommitted changes; ` +
        `they are not in the clone, which tests ${sha}`,
    );
  }
  exec("git", ["clone", "--no-hardlinks", "--quiet", root, clone]);
  exec("git", ["-C", clone, "checkout", "--quiet", sha]);
  assert(
    exec("git", ["-C", clone, "rev-parse", "HEAD"]).trim() === sha,
    `the clone is not at ${sha}`,
  );
  say(`cloned ${sha} into ${clone}`);

  begin("install");
  // An empty npm cache: every package comes from the registry, as on a
  // new machine. Electron's download cache sits in the user's cache
  // directory, not npm's, and may serve its binary at first launch.
  const install = launch(
    "npm",
    ["ci", "--no-audit", "--no-fund", "--cache", join(scratch, "npm-cache")],
    { cwd: clone, env: userEnv() },
  );
  const installed = await within(install.exited, INSTALL_BUDGET_MS);
  if (!installed) {
    await stopGroup(install, 10_000);
    throw new Error(
      `npm ci did not finish within ${elapsed(INSTALL_BUDGET_MS)}; ` +
        `its last output: ${install.last}`,
    );
  }
  assert(installed.code === 0, `npm ci ${describeExit(installed)}`);
  // npm drops an optional dependency it failed to fetch or build and
  // still exits 0, so a platform binary lost to a flaky network — the
  // bundler's binding, an agent SDK's executable — would leave a tree
  // that later stages may not touch: the install is incomplete.
  const logs = join(scratch, "npm-cache", "_logs");
  const dropped = (existsSync(logs) ? readdirSync(logs) : [])
    .flatMap((log) => [
      ...readFileSync(join(logs, log), "utf-8").matchAll(
        /reify failed optional dependency \S*node_modules\/(\S+)/g,
      ),
    ])
    .map(([, name]) => name);
  assert(
    dropped.length === 0,
    `npm ci exited 0 but dropped optional dependencies it failed to install: ` +
      `${dropped.join(", ")} — usually a fetch cut short; its log is in ${logs}`,
  );

  // Both shells keep their config and state off this machine's own:
  // the XDG homes hold no former config or store to relocate or import.
  const xdg = {
    XDG_CONFIG_HOME: join(scratch, "xdg"),
    XDG_DATA_HOME: join(scratch, "xdg-data"),
  };

  begin("server");
  // The README's command with the one variable that keeps it off this
  // machine's own home: SPEX_HOME. The host, the token, the config and
  // the state root are the shell's defaults, so the printed URL is the
  // loopback one with a generated token and the config seeds inside the
  // home. Beyond the README only the port: an ephemeral one keeps the
  // launch clear of a Spex server the developer may already run on the
  // default. The XDG homes above stand for a new machine's, holding no
  // former config or store for the core to relocate or import.
  const serverHome = join(scratch, "home");
  const server = launch("npm", ["run", "start:server", "--", "--port=0"], {
    cwd: clone,
    // The registry unreachable: a scaffold the shell did not supply
    // would fetch @sublang/spex through npx and fail here, so the
    // scaffolded Create below proves the clone's own CLI ran.
    env: userEnv({
      SPEX_HOME: serverHome,
      ...xdg,
      npm_config_registry: "http://127.0.0.1:9/",
    }),
  });
  const url = await waitFor(
    () => {
      const printed = /\[spex-server\] serving at (\S+)/.exec(server.stdout)?.[1];
      if (printed) return printed;
      if (server.exit) {
        throw new Error(
          `npm run start:server ${describeExit(server.exit)} before printing its URL`,
        );
      }
      return undefined;
    },
    SERVER_URL_BUDGET_MS,
    "the server's printed access URL",
  ).catch((error) => {
    throw new Error(`${error.message}; its last output: ${server.last}`);
  });
  const address = new URL(url);
  const port = Number(address.port);
  assert(
    address.protocol === "http:" &&
      address.hostname === "127.0.0.1" &&
      port > 0 &&
      (address.searchParams.get("token") ?? "").length >= 16,
    `the printed access URL is not the default loopback URL with a generated token: ${url}`,
  );

  const page = await fetch(url);
  const contentType = page.headers.get("content-type") ?? "";
  const html = await page.text();
  assert(
    page.status === 200 &&
      contentType.startsWith("text/html") &&
      /<html/i.test(html),
    `the access URL served ${page.status} ${contentType}`,
  );
  say(`page: ${page.status} ${contentType}`);

  const core = await connectCore(url.replace(/^http/, "ws"));
  say(
    `socket: hello, protocol ${core.hello.protocolVersion}, ` +
      `core ${core.hello.coreVersion}`,
  );

  const config = await core.command("config.get");
  assert(
    config.status === "valid",
    `the seeded config is not valid: ${JSON.stringify(config)}`,
  );
  assert(config.seeded === true, "the first start did not seed the config");
  // The config lands where the README's user finds it: inside the home,
  // in your own group's spex repository.
  const configPath = ownConfigPath(serverHome);
  assert(
    config.summary.path === configPath && existsSync(configPath),
    `the config was seeded at ${config.summary.path}, not ${configPath}`,
  );
  const commands = config.summary.playbooks.map((playbook) => playbook.command);
  const absent = TEMPLATE_COMMANDS.filter((name) => !commands.includes(name));
  assert(
    absent.length === 0,
    `template playbooks missing: ${absent.join(", ")} (have ${commands.join(", ")})`,
  );
  say(`config: seeded and valid with ${commands.map((name) => `/${name}`).join(" ")}`);

  const { builtins } = await core.command("library.builtins");
  for (const id of ["code", "review", "decide"]) {
    const entry = builtins.find((builtin) => builtin.id === id);
    assert(entry, `the built-in catalog lacks ${id}`);
    assert(
      entry.source?.startsWith(`# ${id[0].toUpperCase()}${id.slice(1)}`),
      `built-in ${id} source missing or unstripped`,
    );
  }
  const artifacts = await core.command("playbook.artifacts", {
    playbookId: "code",
  });
  assert(
    artifacts.missing.length === 0,
    `/code artifacts missing: ${artifacts.missing.join(", ")}`,
  );
  say("catalog: code, review and decide with their sources; /code artifacts complete");

  // One entry per adapter in use (ReadinessEntry): `ready` is true,
  // false with the requirement a human meets, or null where the adapter
  // has no preflight rule. This machine's sign-ins decide which.
  const readiness = await core.command("readiness.get");
  assert(
    Array.isArray(readiness) && readiness.length > 0,
    "readiness named no adapter",
  );
  for (const entry of readiness) {
    assert(
      typeof entry.adapter === "string" && entry.adapter,
      `a readiness entry names no adapter: ${JSON.stringify(entry)}`,
    );
    assert(
      entry.ready === true || entry.ready === false || entry.ready === null,
      `${entry.adapter}'s readiness carries no verdict: ${JSON.stringify(entry)}`,
    );
    assert(
      entry.ready !== false ||
        (typeof entry.requirement === "string" && entry.requirement.trim()),
      `${entry.adapter} is not ready and names no requirement`,
    );
  }
  // Readiness covers the Captain and the players a role binds: the
  // summary lists every roster player, but one bound to no role opens
  // no session lane, so its adapter is not probed (DR-032).
  const inUse = new Set([
    config.summary.captain.adapter,
    ...config.summary.players
      .filter((player) => player.boundBy.length > 0)
      .map((player) => player.agent.adapter),
  ]);
  for (const adapter of inUse) {
    assert(
      readiness.some((entry) => entry.adapter === adapter),
      `no readiness for the adapter in use ${adapter}`,
    );
  }
  for (const entry of readiness) {
    const verdict =
      entry.ready === null
        ? "no preflight rule"
        : entry.ready
          ? "ready"
          : `not ready: ${entry.requirement}`;
    say(`readiness: ${entry.adapter} ${verdict}`);
  }

  // The compiler is the clone's own @sublang/slc (server-shell-7).
  // Below slc's Node floor the check names the host's Node instead and
  // resolves no command; the core reaches that refusal only past the
  // supplied compiler, so any other refusal is a failed install.
  const toolchain = await core.command("compile.check");
  const compiler = toolchain.slc.command.find((part) =>
    part.includes(`${sep}@sublang${sep}slc${sep}`),
  );
  if (compiler || toolchain.slc.ok) {
    assert(
      compiler?.startsWith(join(clone, "node_modules") + sep),
      `the compiler check resolved ${toolchain.slc.command.join(" ")}, ` +
        "not the clone's own @sublang/slc",
    );
    const unavailable = toolchain.slc.ok
      ? ""
      : ` — unavailable: ${toolchain.slc.guidance}`;
    say(`compiler: ${compiler} on Node ${toolchain.node.version}${unavailable}`);
  } else {
    assert(
      !toolchain.node.ok && /\d+\.\d+/.test(toolchain.slc.guidance ?? ""),
      "the compile is unavailable for a reason other than the host's Node: " +
        toolchain.slc.guidance,
    );
    say(
      `compiler: unavailable on this host's Node ` +
        `(${toolchain.node.version ?? "none found"}): ${toolchain.slc.guidance}`,
    );
  }

  const project = await core.command("project.create", {
    path: join(scratch, "academy"),
    example: true,
  });
  const tree = await core.command("specs.get", { projectId: project.id });
  // The migrated Academy corpus: every file a package — 12 of them,
  // none flagged legacy, every one parsing clean.
  const broken = tree.files.filter((file) => file.error !== undefined).length;
  assert(
    tree.present && !tree.legacy && tree.files.length === 12 && broken === 0,
    `Academy tree unexpected: present=${tree.present} legacy=${tree.legacy} ` +
      `files=${tree.files.length} broken=${broken}`,
  );
  say(`academy: seeded, ${tree.files.length} packages, all parsed clean`);

  // The scaffold is the clone's own packages/cli on the shell's Node
  // (server-shell-7, projects-31): with the registry unreachable above,
  // only the supplied CLI can have generated these specs.
  const scaffolded = await core.command("project.create", {
    path: join(scratch, "scaffolded"),
    scaffold: true,
  });
  const scaffoldTree = await core.command("specs.get", { projectId: scaffolded.id });
  assert(
    scaffoldTree.present && !scaffoldTree.legacy,
    `scaffolded tree unexpected: present=${scaffoldTree.present} legacy=${scaffoldTree.legacy}`,
  );
  say(`scaffold: ${join(clone, "packages", "cli", "dist", "cli.js")} generated ${scaffoldTree.files.length} files with the registry unreachable`);

  core.socket.close();
  const stopping = Date.now();
  signalGroup(server, "SIGTERM");
  const stopped = await within(server.exited, SERVER_STOP_BUDGET_MS);
  assert(
    stopped,
    `npm run start:server did not exit within ${elapsed(SERVER_STOP_BUDGET_MS)} of SIGTERM`,
  );
  assert(
    stopped.code === 0,
    `npm run start:server ${describeExit(stopped)} on SIGTERM`,
  );
  await portRefuses(port);
  // No orphan (server-shell-6): nothing is left in the command's group.
  const orphanDeadline = Date.now() + 5_000;
  while (signalGroup(server, 0)) {
    if (Date.now() > orphanDeadline) {
      const left = processes()
        .filter(({ pgid }) => pgid === server.child.pid)
        .map(({ pid, command }) => `${pid} ${command}`);
      throw new Error(`processes outlived the server:\n${left.join("\n")}`);
    }
    await delay(100);
  }
  say(
    `stop: SIGTERM, exit 0 after ${Date.now() - stopping} ms, ` +
      `port ${port} closed, no process left`,
  );

  begin("desktop");
  const shot = join(scratch, "desktop.png");
  const userData = join(scratch, "userdata");
  // The Spex home the environment names, standing in for the
  // developer's own: the render must leave it untouched.
  const envHome = join(scratch, "home-desktop");
  // The home the app keeps under the smoke's user data stores English
  // as its language (storage-5), so the clicks' English names hold on
  // any system; the first start seeds the rest.
  mkdirSync(join(userData, "spex-home"), { recursive: true });
  mkdirSync(join(userData, "spex-home", "local"), { recursive: true });
  writeFileSync(
    join(userData, "spex-home", "local", "prefs.json"),
    JSON.stringify({ format: 1, prefs: { language: "en" } }),
  );
  const desktop = launch("npm", ["start"], {
    cwd: clone,
    env: userEnv({
      SPEX_ACCEPTANCE: shot,
      SPEX_ACCEPTANCE_CLICKS: CLICKS,
      SPEX_SMOKE_USERDATA: userData,
      SPEX_HOME: envHome,
      ...xdg,
    }),
  });
  const returned = await within(desktop.exited, DESKTOP_BUDGET_MS);
  if (!returned) {
    await stopGroup(desktop, 90_000);
    throw new Error(
      `npm start did not return within ${elapsed(DESKTOP_BUDGET_MS)}; ` +
        `its last output: ${desktop.last}`,
    );
  }
  await within(desktop.closed, 10_000);
  const report = acceptanceReport(desktop.stdout);
  const errors = report?.consoleErrors.length
    ? `; console errors: ${report.consoleErrors.join(" | ")}`
    : "";
  assert(returned.code === 0, `npm start ${describeExit(returned)}${errors}`);
  let after = 0;
  for (const step of DESKTOP_STEPS) {
    const at = desktop.stdout.indexOf(`=== desktop: ${step} ===`, after);
    assert(at >= 0, `npm start did not run its ${step} step in order`);
    after = at;
  }
  assert(report, "npm start printed no acceptance report");
  assert(report.acceptance.rootChildren > 0, "the desktop rendered an empty root");
  assert(
    report.consoleErrors.length === 0,
    `the render logged console errors:\n${report.consoleErrors.join("\n")}`,
  );
  assert(existsSync(shot), "the render wrote no screenshot");
  const png = readFileSync(shot);
  assert(
    png.length > PNG_SIGNATURE.length &&
      png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    "the screenshot is not a PNG",
  );
  // The lock and the state root live under the smoke's user data
  // (app-shell-24): the first start seeded its config there, and the
  // environment's Spex home stayed untouched.
  assert(
    existsSync(ownConfigPath(join(userData, "spex-home"))),
    `the app kept no state under ${userData}`,
  );
  assert(
    !existsSync(envHome),
    `the app wrote to the environment's Spex home ${envHome}`,
  );
  // Returned zero after the restore: the module loads on Node again.
  const restored = spawnSync(
    "node",
    ["-e", "new (require('better-sqlite3'))(':memory:').close()"],
    { cwd: join(clone, "packages", "core"), encoding: "utf-8" },
  );
  assert(
    restored.status === 0,
    `better-sqlite3 does not load on Node after npm start:\n${restored.stderr}`,
  );
  const firstLine = (report.acceptance.bodyText ?? "")
    .split("\n")
    .find((line) => line.trim());
  say(`render: root populated after ${CLICKS.split(",").join(", ")}, no console errors`);
  say(`render: first line "${(firstLine ?? "").trim()}"`);
  say(`screenshot: ${Math.round(png.length / 1024)} KB PNG${keep ? ` at ${shot}` : ""}`);
  say("native module: restored for Node");

  begin("clean");
  if (handOff) {
    writeFileSync(handOff, `${JSON.stringify({ scratch, clone })}\n`);
    say(`scratch handed to the live stage: ${scratch}`);
  } else if (keep) {
    say(`scratch kept (--keep): ${scratch}`);
  } else {
    rmSync(scratch, { recursive: true, force: true });
    say("scratch removed");
  }
  passed();
  process.stdout.write(`\ninstall-smoke: ${timings.join(" · ")}\n`);
  process.stdout.write("install-smoke: all stages passed\n");
} catch (error) {
  await fail(error.message, 1);
}

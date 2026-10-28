#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The local simulation's stand-in for spex-seatctl (hub-4), run by the
// real hub with `--sudo=` (scripts/team-server-local.mjs): the same four
// forms and exit statuses as apps/hub/bin/spex-seatctl, acting as the
// current user instead of root, with a detached process group in place
// of the systemd unit spex-seat@<id>:
//
//   create <id>  make <seats>/<id>/home, owner-only; idempotent
//   start <id>   write the handshake token read from standard input to
//                <run>/<id>/token, then start the seat — the server shell
//                in seat mode (seat.mjs) — detached, its output in
//                <logs>/seat-<id>.log; a seat already running is left
//                with the token it read at its start
//   stop <id>    SIGTERM the seat, SIGKILL its process group 30 seconds
//                later or once it exits (the unit's KillMode=mixed and
//                TimeoutStopSec=30); remove its token; its files stand
//   wipe <id>    delete the seat's app token and code-credentials files
//
// Every other invocation is refused with exit 64 and the usage line. The
// seat inherits none of this helper's standard streams, for the hub
// waits for the helper's streams to close.
//
// Configured by the environment the hub passes on, which the simulation
// gives the hub: TSL_RUN, TSL_SEATS, TSL_LOGS, TSL_SERVER_ID,
// TSL_SERVER_NAME, TSL_HOSTS (JSON: person id, or "*", to the instance
// URL that seat signs in at), TSL_SHARED_ENV, TSL_AGENTS
// (captain|demo|real) and TSL_NODE.

import { spawn } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "usage: spex-seatctl create|start|stop|wipe <id>";
const SEAT_ENTRY = join(dirname(fileURLToPath(import.meta.url)), "seat.mjs");
/** The seat unit's TimeoutStopSec. */
const STOP_TIMEOUT_MS = 30_000;

function fail(message, code) {
  console.error(`spex-seatctl: ${message}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const [command, id] = argv;
if (argv.length !== 2) {
  console.error(`spex-seatctl: takes exactly two arguments, a command and a seat id; got ${argv.length}`);
  fail(USAGE, 64);
}
if (!["create", "start", "stop", "wipe"].includes(command)) {
  console.error("spex-seatctl: unknown command");
  fail(USAGE, 64);
}
if (!/^[0-9]{1,20}$/.test(id)) {
  console.error("spex-seatctl: a seat id is the person's numeric account id, 1 to 20 digits");
  fail(USAGE, 64);
}

function setting(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is not set: run me from scripts/team-server-local.mjs`, 78);
  return value;
}

const runDir = setting("TSL_RUN");
const seatDir = join(runDir, id);
const home = join(setting("TSL_SEATS"), id, "home");
const pidFile = join(seatDir, "seat.pid");
const tokenFile = join(seatDir, "token");

/** The seat's pid while it runs: its unit is active. */
function runningPid() {
  try {
    const pid = Number(readFileSync(pidFile, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) return undefined;
    process.kill(pid, 0);
    return pid;
  } catch {
    return undefined;
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

function killGroup(pid) {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The group is gone already.
  }
}

/** The environment the seat unit gives the server shell: the account's
 * own home and the server's environment file, nothing of the hub's. No
 * system Git configuration is read, so no credential helper of this
 * machine's stores the member's token. */
function seatEnvironment(hostUrl) {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    SPEX_HOST_URL: hostUrl,
    SPEX_SERVER_ID: setting("TSL_SERVER_ID"),
    SPEX_SERVER_NAME: setting("TSL_SERVER_NAME"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  for (const name of ["USER", "LOGNAME", "SHELL", "LANG", "TMPDIR"]) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

switch (command) {
  case "create":
    mkdirSync(home, { recursive: true, mode: 0o700 });
    chmodSync(home, 0o700);
    break;

  case "start": {
    if (!existsSync(home)) fail(`no seat ${id}: create it first`, 67);
    // A running unit keeps the token it read at its start.
    if (runningPid() !== undefined) break;
    const token = readFileSync(0, "utf8").split("\n")[0];
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail("no handshake token on standard input", 65);
    let hosts;
    try {
      hosts = JSON.parse(setting("TSL_HOSTS"));
    } catch {
      fail("TSL_HOSTS is no JSON object", 78);
    }
    const hostUrl = hosts[id] ?? hosts["*"];
    if (!hostUrl) fail(`no instance for person ${id} in TSL_HOSTS`, 78);
    mkdirSync(seatDir, { recursive: true, mode: 0o700 });
    const staged = join(seatDir, `.token.${process.pid}`);
    writeFileSync(staged, `${token}\n`, { mode: 0o600 });
    renameSync(staged, tokenFile);
    const logs = setting("TSL_LOGS");
    mkdirSync(logs, { recursive: true });
    const log = openSync(join(logs, `seat-${id}.log`), "a");
    const args = [
      SEAT_ENTRY,
      `--agents=${setting("TSL_AGENTS")}`,
      "--seat",
      `--server-id=${setting("TSL_SERVER_ID")}`,
      `--server-name=${setting("TSL_SERVER_NAME")}`,
      `--person-id=${id}`,
      `--socket=${join(seatDir, "core.sock")}`,
      `--token-file=${tokenFile}`,
      `--shared-env=${setting("TSL_SHARED_ENV")}`,
    ];
    const child = spawn(setting("TSL_NODE"), args, {
      cwd: home,
      env: seatEnvironment(hostUrl),
      detached: true,
      stdio: ["ignore", log, log],
    });
    closeSync(log);
    const started = await new Promise((resolveSpawn) => {
      child.once("spawn", () => resolveSpawn(undefined));
      child.once("error", (error) => resolveSpawn(error));
    });
    if (started) fail(`the seat did not start: ${started.message}`, 1);
    writeFileSync(pidFile, String(child.pid));
    child.unref();
    break;
  }

  case "stop": {
    const pid = runningPid();
    if (pid !== undefined) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // It exited meanwhile.
      }
      const deadline = Date.now() + STOP_TIMEOUT_MS;
      while (alive(pid) && Date.now() < deadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
      // What remains of the seat's group — an agent the stop missed, or
      // the seat itself past the timeout — is killed.
      killGroup(pid);
    }
    rmSync(pidFile, { force: true });
    rmSync(tokenFile, { force: true });
    break;
  }

  case "wipe": {
    if (!existsSync(home)) break;
    const local = join(home, ".spex", "local");
    rmSync(join(local, "credentials.yaml"), { force: true });
    rmSync(join(local, "code-credentials.yaml"), { force: true });
    break;
  }
}

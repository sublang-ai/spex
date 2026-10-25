// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The tests' fake helper (hub-9): `create|start|stop|wipe <id>` as the
// real helper takes them, refusing every other form, acting as the
// current user. `create` makes a scratch home; `start` writes the token
// read from standard input under the seat's runtime directory and
// launches a stub seat listening on the seat's socket; `stop` ends it
// and removes the token; `wipe` deletes the seat's two credential files.
// Every call is logged with a hash of its standard input, never the
// input itself.
//
// Environment: FAKE_RUN_DIR, FAKE_SEATS_HOME, FAKE_SEATCTL_LOG, and
// FAKE_SEAT_SCRIPT, a JSON file read at each call: `nostart: [<id>]`
// writes the token but launches no stub seat; `nocreate: [<id>]` and
// `nostop: [<id>]` refuse `create` and `stop` with exit 70, touching
// nothing; `holdstop: {<id>: <path>}` holds `stop` until that file
// exists, up to 20 seconds.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const [command, id] = argv;
const runDir = process.env.FAKE_RUN_DIR;
const homes = process.env.FAKE_SEATS_HOME;
const logFile = process.env.FAKE_SEATCTL_LOG;

function record(entry) {
  appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
}

if (
  argv.length !== 2 ||
  !["create", "start", "stop", "wipe"].includes(command) ||
  !/^[0-9]{1,20}$/.test(id)
) {
  record({ argv, refused: true });
  console.error("usage: spex-seatctl create|start|stop|wipe <id>");
  process.exit(64);
}

const input = readFileSync(0, "utf8");
const endAudit = command === "stop" && process.env.FAKE_LEASE_STATE
  ? (() => {
    const lease = JSON.parse(readFileSync(process.env.FAKE_LEASE_STATE, "utf8"))[id];
    return {
      leaseEnded: lease.bearer_hash === null && lease.stop_owed === true,
      relayEnded: existsSync(join(process.env.FAKE_RELAY_END_DIR, id)),
    };
  })()
  : {};
record({
  argv,
  stdinSha256: input ? createHash("sha256").update(input.trim()).digest("hex") : null,
  ...endAudit,
});

function script() {
  try {
    return JSON.parse(readFileSync(process.env.FAKE_SEAT_SCRIPT, "utf8"));
  } catch {
    return {};
  }
}

const seatDir = join(runDir, id);
const pidFile = join(seatDir, "seat.pid");
const tokenFile = join(seatDir, "token");

function refuse(form) {
  console.error(`spex-seatctl: ${form} refused by the test's script`);
  process.exit(70);
}

function runningPid() {
  try {
    const pid = Number(readFileSync(pidFile, "utf8"));
    process.kill(pid, 0);
    return pid;
  } catch {
    return undefined;
  }
}

switch (command) {
  case "create":
    if ((script().nocreate ?? []).includes(id)) refuse("create");
    mkdirSync(join(homes, id), { recursive: true, mode: 0o700 });
    break;
  case "start": {
    // A running unit is left as it is, its token with it.
    if (runningPid() !== undefined) break;
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.trim())) {
      console.error("spex-seatctl: no token on standard input");
      process.exit(65);
    }
    mkdirSync(seatDir, { recursive: true, mode: 0o700 });
    writeFileSync(tokenFile, input.trim(), { mode: 0o600 });
    if ((script().nostart ?? []).includes(id)) break;
    const stub = join(dirname(fileURLToPath(import.meta.url)), "stub-seat.mjs");
    const child = spawn(process.execPath, [stub, id, join(seatDir, "core.sock"), tokenFile], {
      detached: true,
      stdio: "ignore",
    });
    writeFileSync(pidFile, String(child.pid));
    child.unref();
    break;
  }
  case "stop": {
    const { nostop = [], holdstop = {} } = script();
    if (nostop.includes(id)) refuse("stop");
    if (typeof holdstop[id] === "string") {
      const deadline = Date.now() + 20_000;
      while (!existsSync(holdstop[id]) && Date.now() < deadline) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      }
    }
    const pid = runningPid();
    if (pid !== undefined) {
      process.kill(pid, "SIGTERM");
      const deadline = Date.now() + 5000;
      for (;;) {
        try {
          process.kill(pid, 0);
        } catch {
          break;
        }
        if (Date.now() > deadline) {
          process.kill(pid, "SIGKILL");
          break;
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      }
    }
    rmSync(pidFile, { force: true });
    rmSync(tokenFile, { force: true });
    break;
  }
  case "wipe": {
    const local = join(homes, id, ".spex", "local");
    rmSync(join(local, "credentials.yaml"), { force: true });
    rmSync(join(local, "code-credentials.yaml"), { force: true });
    break;
  }
}

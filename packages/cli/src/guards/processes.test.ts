// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-12), DR-251: the processes a run starts.
 * Each test runs small Node programs through `runProcess` in a temp
 * folder of its own.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { lastWords, runProcess, stopProcesses, type Ran } from "./processes.js";

let dir = "";
let made = 0;

before(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-processes-")));
});

after(() => {
  if (dir !== "") rmSync(dir, { recursive: true, force: true });
});

/** Run Node on `code` with `seconds` as the time limit. `PID_FILE`
 * names a file the code may write a process's number to. */
function run(code: string, seconds = 60): { ran: Promise<Ran>; pidFile: string } {
  made += 1;
  const pidFile = join(dir, `pid-${made}`);
  const ran = runProcess(process.execPath, ["-e", code], {
    cwd: dir,
    env: { ...process.env, PID_FILE: pidFile },
    seconds,
    errors: join(dir, `errors-${made}.txt`),
  });
  return { ran, pidFile };
}

/** Whether no process of this number runs any more. One that was
 * killed and not yet collected by its parent counts as gone. */
function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return true;
  }
  if (process.platform === "win32") return false;
  if (existsSync("/proc/self/stat")) {
    try {
      // The state is the one letter after the name, which is in brackets.
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      return stat.charAt(stat.lastIndexOf(") ") + 2) === "Z";
    } catch {
      return true;
    }
  }
  try {
    return execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim().startsWith("Z");
  } catch {
    return true;
  }
}

/** Wait for the process of this number to be gone; a test that waits
 * for ever fails by the runner's own limit. */
async function untilGone(pid: number): Promise<void> {
  while (!gone(pid)) await pause(20);
}

/** Wait for the code to have written the number of a process. */
async function pidIn(file: string): Promise<number> {
  for (;;) {
    if (existsSync(file)) {
      const pid = Number(readFileSync(file, "utf8"));
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
    await pause(20);
  }
}

/** Code that starts a process which never ends and holds this one's
 * standard error, writes its number down, and goes on to `then`. */
const leaves = (then: string): string =>
  `const { spawn } = require("node:child_process");
const { writeFileSync, renameSync } = require("node:fs");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" });
child.unref();
writeFileSync(process.env.PID_FILE + ".part", String(child.pid));
renameSync(process.env.PID_FILE + ".part", process.env.PID_FILE);
${then}`;

describe("guards-12: processes: one program, stopped with all it started", () => {
  it("gives a program's status and the end of what it wrote on standard error", async () => {
    const { ran } = run('console.log("dropped"); console.error("first"); console.error("the build is broken"); process.exit(3);');
    assert.deepEqual(await ran, { code: 3, timedOut: false, errors: "first\nthe build is broken\n", failed: null });
    assert.deepEqual(await run("").ran, { code: 0, timedOut: false, errors: "", failed: null });
  });

  it("says why a program could not start", async () => {
    const ran = await runProcess(join(dir, "no-such-program"), [], {
      cwd: dir,
      env: process.env,
      seconds: 60,
      errors: join(dir, "errors-none.txt"),
    });
    assert.equal(ran.code, null);
    assert.equal(ran.timedOut, false);
    assert.match(ran.failed ?? "", /ENOENT/);
  });

  it("stops a program at the time limit", async () => {
    const ran = await run("setInterval(() => {}, 1000);", 1).ran;
    assert.equal(ran.timedOut, true);
    assert.notEqual(ran.code, 0);
  });

  it("does not wait for a process the program left running, and stops it", async () => {
    const { ran, pidFile } = run(leaves(""));
    const ended = await ran;
    assert.equal(ended.code, 0, "the program ended by itself, and the run did not wait for what holds its output");
    assert.equal(ended.timedOut, false);
    if (process.platform !== "win32") await untilGone(await pidIn(pidFile));
  });

  it("stops at the time limit a process the program started", async () => {
    const { ran, pidFile } = run(leaves("setInterval(() => {}, 1000);"), 1);
    assert.equal((await ran).timedOut, true);
    await untilGone(await pidIn(pidFile));
  });

  it("stops every running program, with what it started, when told to", async () => {
    const { ran, pidFile } = run(leaves("setInterval(() => {}, 1000);"));
    const pid = await pidIn(pidFile);
    stopProcesses();
    const ended = await ran;
    assert.equal(ended.timedOut, false);
    assert.notEqual(ended.code, 0, "it was stopped, not ended");
    await untilGone(pid);
  });
});

describe("guards-26: processes: the cause a process gave", () => {
  it("is the last line that is neither Node's version line nor a line of a stack", () => {
    const crash = [
      "[eval]:1",
      "null.x",
      "     ^",
      "",
      "TypeError: Cannot read properties of null (reading 'x')",
      "    at [eval]:1:6",
      "    at runScriptInThisContext (node:internal/vm:219:10)",
      "",
      "Node.js v22.23.5",
      "",
    ].join("\n");
    assert.equal(lastWords(crash), "TypeError: Cannot read properties of null (reading 'x')");
    assert.equal(lastWords("one\r\n  the build is broken  \r\n"), "the build is broken");
    assert.equal(lastWords("at the end of the day\n"), "", "a line starting with at is taken for a stack line");
    assert.equal(lastWords(""), "");
    assert.equal(lastWords("\n    at x (y.js:1:1)\nNode.js v24.0.0\n"), "");
  });

  it("is read from a real crash", async () => {
    const ran = await run("null.x").ran;
    assert.equal(ran.code, 1);
    assert.equal(lastWords(ran.errors), "TypeError: Cannot read properties of null (reading 'x')");
  });
});

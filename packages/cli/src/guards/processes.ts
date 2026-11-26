// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-12), DR-252: the processes a run starts,
 * each of a binding's commands and the copy's own process alike. A
 * process is stopped at the time limit, and whatever it started is
 * stopped with it: at the limit, when it ends, and when the run is
 * interrupted. The run never waits for what such a process prints:
 * standard error goes to a file, read once the process has ended.
 *
 * On POSIX a process leads a group of its own and the whole group is
 * killed; a process that has left that group, by starting a session
 * of its own, is not stopped. On Windows `taskkill /T /F` stops a process with all it
 * started; it finds them only while the process itself still runs,
 * so what a process left behind when it ended by itself stays.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

/** How one process ended. */
export type Ran = {
  /** Its exit status; null where a signal ended it. */
  code: number | null;
  /** It was stopped at the time limit. */
  timedOut: boolean;
  /** The end of what it wrote on standard error. */
  errors: string;
  /** Why it could not start, where it could not. */
  failed: string | null;
};

/** What `runProcess` needs beside the program and its words. */
export type RunOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** The time limit. */
  seconds: number;
  /** A file to hold what the process writes on standard error. */
  errors: string;
};

/** The most of a process's standard error that is read back. */
const MOST_ERRORS = 8000;

const running = new Set<ChildProcess>();
let hooked = false;

/** Stop one process and every process it started. `ended` says the
 * process itself is gone already. */
function stop(child: ChildProcess, ended: boolean): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    if (!ended) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    }
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Nothing of the group is left.
  }
}

/** Stop every process still running, with all they started. Safe to
 * call at any time; it waits for nothing. */
export function stopProcesses(): void {
  for (const child of running) stop(child, false);
}

function endOf(file: string): string {
  try {
    const fd = openSync(file, "r");
    try {
      const size = fstatSync(fd).size;
      const length = Math.min(size, MOST_ERRORS);
      const bytes = Buffer.alloc(length);
      readSync(fd, bytes, 0, length, size - length);
      return bytes.toString("utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return "";
  }
}

/**
 * Run one program to its end or to the time limit, whichever comes
 * first. What it prints on standard output is dropped. When it ends,
 * however it ends, every process it started is stopped too.
 */
export function runProcess(program: string, args: readonly string[], options: RunOptions): Promise<Ran> {
  if (!hooked) {
    hooked = true;
    process.on("exit", stopProcesses);
  }
  return new Promise((resolve) => {
    const errors = openSync(options.errors, "w");
    let child: ChildProcess;
    try {
      child = spawn(program, [...args], {
        cwd: options.cwd,
        env: options.env,
        // No pipe: a process left behind cannot hold one open.
        stdio: ["ignore", "ignore", errors],
        // A group of its own on POSIX, so the whole group can be stopped.
        detached: process.platform !== "win32",
        windowsHide: true,
      });
    } catch (error) {
      resolve({ code: null, timedOut: false, errors: "", failed: error instanceof Error ? error.message : String(error) });
      return;
    } finally {
      closeSync(errors);
    }
    running.add(child);
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stop(child, false);
      child.kill("SIGKILL");
    }, options.seconds * 1000);
    const settle = (code: number | null, failed: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(child);
      stop(child, true);
      resolve({ code, timedOut, errors: endOf(options.errors), failed });
    };
    child.on("error", (error) => {
      // Only a process that never started ends here.
      if (child.pid === undefined) settle(null, error.message);
    });
    child.on("exit", (code) => settle(code, null));
  });
}

/**
 * The cause a process gave for ending early: the last line of its
 * standard error that is neither Node's `Node.js v…` line nor a line
 * of a stack, starting `at `. Empty where it wrote none.
 */
export function lastWords(errors: string): string {
  const lines = errors
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^Node\.js v/.test(line) && !line.startsWith("at "));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}

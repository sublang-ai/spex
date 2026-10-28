// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The helper calls (hub-4): `spex-seatctl create|start|stop|wipe <id>`,
// run through sudo with no password prompt, the one thing the service
// manager's policy lets the hub's account run as root. `start` takes
// the seat's handshake token on standard input, so it is in no argv.

import { spawn } from "node:child_process";

import { PERSON_ID } from "./state.js";

export const DEFAULT_HELPER = "/opt/spex/libexec/spex-seatctl";
export const DEFAULT_SUDO = "sudo";

export type HelperCommand = "create" | "start" | "stop" | "wipe";

export interface HelperConfig {
  /** The helper's path. */
  helper: string;
  /** sudo's path; null runs the helper directly, as a test's fake. */
  sudo: string | null;
  /** How long one call may take; `stop` waits on the unit's own stop
   * timeout. */
  timeoutMs?: number;
}

/** How long one call may take where its config names no bound. */
export const HELPER_TIMEOUT_MS = 120_000;

/** A helper call its bound ran out on. */
export class HelperTimeout extends Error {}

/** Run one helper call, killed past `timeoutMs` — the config's bound by
 * default, an admission's time left where it passes one (hub-2). */
export async function runHelper(
  config: HelperConfig,
  command: HelperCommand,
  id: string,
  input?: string,
  timeoutMs = config.timeoutMs ?? HELPER_TIMEOUT_MS,
): Promise<void> {
  if (!PERSON_ID.test(id)) throw new Error(`no seat id: ${JSON.stringify(id)}`);
  const [file, args] = config.sudo
    ? [config.sudo, ["-n", config.helper, command, id]]
    : [config.helper, [command, id]];
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(file, args, { stdio: ["pipe", "ignore", "pipe"] });
    let settled = false;
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectRun(error);
      else resolveRun();
    };
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 4096) stderr += chunk;
    });
    // Answered at the bound, not at the pipe's close: a helper run
    // through sudo outlives sudo's kill and holds the pipe open while it
    // finishes on its own.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      child.stderr.destroy();
      settle(new HelperTimeout(`the helper's ${command} ${id} did not finish within ${timeoutMs} ms`));
    }, Math.max(timeoutMs, 0));
    child.once("error", (error) => {
      settle(new Error(`the helper's ${command} ${id} did not run: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      if (code === 0) {
        settle();
        return;
      }
      const cause = stderr.trim().split("\n")[0] || (signal ? `killed by ${signal}` : `exit ${code}`);
      settle(new Error(`the helper's ${command} ${id} failed: ${cause}`));
    });
    // A helper that exits before reading its input closes the pipe;
    // its exit status, not the write, tells the outcome.
    child.stdin.on("error", () => {});
    child.stdin.end(input === undefined ? "" : `${input}\n`);
  });
}

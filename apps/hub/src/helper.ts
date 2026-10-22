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

export async function runHelper(
  config: HelperConfig,
  command: HelperCommand,
  id: string,
  input?: string,
): Promise<void> {
  if (!PERSON_ID.test(id)) throw new Error(`no seat id: ${JSON.stringify(id)}`);
  const [file, args] = config.sudo
    ? [config.sudo, ["-n", config.helper, command, id]]
    : [config.helper, [command, id]];
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(file, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 4096) stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, config.timeoutMs ?? 120_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectRun(new Error(`the helper's ${command} ${id} did not run: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveRun();
        return;
      }
      const cause = stderr.trim().split("\n")[0] || (signal ? `killed by ${signal}` : `exit ${code}`);
      rejectRun(new Error(`the helper's ${command} ${id} failed: ${cause}`));
    });
    // A helper that exits before reading its input closes the pipe;
    // its exit status, not the write, tells the outcome.
    child.stdin.on("error", () => {});
    child.stdin.end(input === undefined ? "" : `${input}\n`);
  });
}

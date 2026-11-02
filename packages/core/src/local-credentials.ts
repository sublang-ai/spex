// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Whether an agent on this computer is signed in (settings-14, DR-189),
// asked of the agent's own status command where no credential variable
// is set. The agent's home folder says nothing: its runtime creates
// `~/.claude` and `~/.codex` on its first start, signed in or not. Only
// an answer saying the agent is signed out makes it not ready; a command
// that could not start, ran past its time, failed otherwise or answered
// in words not read here leaves its sign-in unconfirmed, never reported
// as signed out. The command runs with the environment an agent run
// inherits, so it reads the same configuration folder, settings and
// credential store the run would. No output of it is kept or reported.

import { execFile } from "node:child_process";
import { locateAgentExecutable } from "@sublang/cligent";

import { i18n } from "./i18n.js";

/** What a status command said of the agent's sign-in. */
export type SignInAnswer =
  | { state: "signed-in" }
  | { state: "signed-out" }
  | { state: "unconfirmed"; reason: string };

/** Asks an agent whether it is signed in, with the environment an
 * agent run inherits; injectable so tests spawn nothing. */
export type SignInProbe = (adapter: "claude" | "codex", env: NodeJS.ProcessEnv) => Promise<SignInAnswer>;

/** How long a status command may run before its answer counts as
 * unconfirmed; calibrated against cold starts on macOS and Windows. */
export const SIGN_IN_TIMEOUT_MS = 5_000;

/** How one run of a status command ended. */
export type StatusRun =
  | { ended: "exited"; code: number; stdout: string; stderr: string }
  | { ended: "unstarted" }
  | { ended: "timed-out" };

const ARGS: Record<"claude" | "codex", readonly string[]> = {
  claude: ["auth", "status"],
  codex: ["login", "status"],
};

const unconfirmed = (reason: string): SignInAnswer => ({ state: "unconfirmed", reason });

/** A run's answer: Claude's by the `loggedIn` its JSON states, Codex's
 * by exit 0, or "Not logged in" on a failing exit — the words its
 * status uses for no stored sign-in. */
export function readSignIn(adapter: "claude" | "codex", run: StatusRun): SignInAnswer {
  if (run.ended === "unstarted") {
    return unconfirmed(i18n._({ id: "its status command could not start", comment: "Why an agent's sign-in could not be confirmed" }));
  }
  if (run.ended === "timed-out") {
    return unconfirmed(i18n._({ id: "its status command did not answer in time", comment: "Why an agent's sign-in could not be confirmed" }));
  }
  if (adapter === "claude") {
    let loggedIn: unknown;
    try {
      loggedIn = (JSON.parse(run.stdout) as { loggedIn?: unknown } | null)?.loggedIn;
    } catch {
      loggedIn = undefined;
    }
    if (loggedIn === true) return { state: "signed-in" };
    if (loggedIn === false) return { state: "signed-out" };
  } else {
    if (run.code === 0) return { state: "signed-in" };
    if (/not logged in/i.test(`${run.stdout}\n${run.stderr}`)) return { state: "signed-out" };
  }
  return run.code === 0
    ? unconfirmed(i18n._({ id: "its status command gave an answer Spex could not read", comment: "Why an agent's sign-in could not be confirmed" }))
    : unconfirmed(i18n._({ id: "its status command reported an error", comment: "Why an agent's sign-in could not be confirmed" }));
}

/** The executable an agent run spawns, found by cligent's lookup, else
 * its name on `PATH`. */
function statusExecutable(adapter: "claude" | "codex"): string {
  try {
    const located = locateAgentExecutable(adapter);
    if (located.state === "present") return located.path;
  } catch {
    // Its name on PATH answers instead.
  }
  return adapter;
}

/** Runs a status command with exactly `env`, keeping how it ended: a
 * start failure and a timeout are their own endings, never an exit
 * code. */
export function runStatus(command: string, args: readonly string[], env: NodeJS.ProcessEnv, timeoutMs = SIGN_IN_TIMEOUT_MS): Promise<StatusRun> {
  return new Promise((resolve) => {
    try {
      execFile(command, [...args], { env, timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
        if (!error) return resolve({ ended: "exited", code: 0, stdout: String(stdout), stderr: String(stderr) });
        const failure = error as NodeJS.ErrnoException & { killed?: boolean; code?: unknown };
        if (typeof failure.code === "number") return resolve({ ended: "exited", code: failure.code, stdout: String(stdout), stderr: String(stderr) });
        if (failure.killed) return resolve({ ended: "timed-out" });
        resolve({ ended: "unstarted" });
      });
    } catch {
      resolve({ ended: "unstarted" });
    }
  });
}

export const probeSignIn: SignInProbe = async (adapter, env) => readSignIn(adapter, await runStatus(statusExecutable(adapter), ARGS[adapter], env));

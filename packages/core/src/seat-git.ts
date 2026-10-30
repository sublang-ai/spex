// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// On a seat, the seat account's own Git configuration names the app's
// credential helper in its member mode (core-service-125, git-host-9,
// DR-132), so a push an agent makes from a project's work tree carries
// the member's token. The core owns one include file, owner-only,
// naming that helper, and the account's global configuration includes
// it once: every other setting of the member's, their own credential
// helpers among them, stands as it is, and serves the hosts the app's
// helper answers nothing for. Neither file holds a secret: the helper
// reads the member's store (storage-44) when Git asks.
//
// The include is added once, at the end of the global configuration, so
// by Git's own order a helper the member lists there earlier is asked
// first for the same host, and the app's helper only where it answers
// nothing: the member's own choice, which stands.
//
// A global configuration Git cannot write — GIT_CONFIG_GLOBAL naming
// /dev/null or anything else that is no regular file, or such a file at
// ~/.gitconfig — takes no include, and the core writes nothing and says
// nothing: the account has opted out of a global file.

import { execFile } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeApplicationBytes } from "@sublang/spex/files";
import { memberHelperCommand } from "./git-credential.js";

/** The include file the core owns under the seat account's home. */
export function seatGitConfigPath(home: string): string {
  return join(home, ".config", "git", "spex-seat.gitconfig");
}

/** A value quoted for a Git configuration file. */
const quoted = (value: string): string => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const GIT_TIMEOUT_MS = 15_000;

/** One `git config` child in the core's environment, never a shell. */
function gitConfig(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile("git", ["config", ...args], { env, timeout: GIT_TIMEOUT_MS }, (error, stdout, stderr) => {
      const code = error ? typeof (error as { code?: unknown }).code === "number" ? (error as { code: number }).code : -1 : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/** Whether the global configuration Git would write stands as something
 * other than a regular file — /dev/null, a directory — which Git cannot
 * write. A file still missing is one Git creates; a path that will not
 * stat is left to Git, whose refusal is reported. */
function globalUnwritable(env: NodeJS.ProcessEnv, home: string): boolean {
  const file = env.GIT_CONFIG_GLOBAL || join(env.HOME || home, ".gitconfig");
  try {
    const stat = statSync(file, { throwIfNoEntry: false });
    return stat !== undefined && !stat.isFile();
  } catch {
    return false;
  }
}

/** Add the include file to the account's global configuration where
 * no include names it yet, so a restart adds no second one, then write
 * it naming the helper in its member mode; nothing where the global
 * configuration is no file Git can write. `env` is the environment the
 * core and its agents run Git in, its `HOME` the seat account's. */
export async function configureSeatGit(options: {
  home: string;
  env: NodeJS.ProcessEnv;
  runtime: { execPath: string; electron: boolean };
  storePath: string;
  helperPath?: string;
}): Promise<void> {
  if (globalUnwritable(options.env, options.home)) return;
  const command = memberHelperCommand(options.runtime, options.storePath, options.helperPath ? { helperPath: options.helperPath } : {});
  const file = seatGitConfigPath(options.home);
  const listed = await gitConfig(["--global", "--get-all", "--type=path", "include.path"], options.env);
  // Exit 1: no include at all.
  if (listed.code !== 0 && listed.code !== 1) throw new Error(`git config failed (${listed.code}): ${listed.stderr.trim()}`);
  if (!listed.stdout.split("\n").includes(file)) {
    const added = await gitConfig(["--global", "--add", "include.path", file], options.env);
    if (added.code !== 0) throw new Error(`git config failed (${added.code}): ${added.stderr.trim()}`);
  }
  // Written once the include names it, so a global configuration that
  // will not take the include leaves no file behind; Git skips an
  // include whose file is missing meanwhile.
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeApplicationBytes(file, `[credential]\n\thelper = ${quoted(command)}\n`);
}

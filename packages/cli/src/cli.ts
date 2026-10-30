#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { lint } from "./lint.js";
import { scaffold } from "./scaffold.js";
import { ATTACHED_USAGE, runAttached } from "./attached-cli.js";
import { packageInit } from "./package-init.js";
import { add } from "./commands/add.js";
import { install } from "./commands/install.js";
import { list } from "./commands/list.js";
import { login } from "./commands/login.js";
import { logout } from "./commands/logout.js";
import { remove } from "./commands/remove.js";
import { search } from "./commands/search.js";
import { update } from "./commands/update.js";
import { whoami } from "./commands/whoami.js";
import { runCommand, type Command } from "./commands/run.js";

const USAGE = `Usage: spex <command> [options]

Commands, on the environment of this folder (its spex.yaml, else its
Git work tree's top level, else this folder):
  add <org>/<pkg>[@<requirement>]                                  Request a spec package from the registry and install it
  add <org>/<pkg> --path <folder>                                  Request the spec package in a folder and install it
  remove <org>/<pkg>, rm                                           Drop a request and install what remains
  install, i                                                       Install the lock, resolving it where missing or stale
  update                                                           Resolve again from spex.yaml and install
  list, ls                                                         Show the requests, the lock, the exports
  search <query>                                                   Search the environment's registry

  scaffold [--update] [--lang <code>] [--agents <names>] [<path>]   Create the specs structure; --update refreshes its templates
  lint [<path>]                                                    Check the specs tree's structure, item IDs and citations
  login [--space <origin>] [--force]                               Sign this device in at a Space by the device flow
  logout [--space <origin>]                                        Sign this device out of a Space
  whoami [--space <origin>]                                        Say who is signed in at each Space, the default marked

Agent names: claude, codex, gemini, kimi, opencode, or all
A Space is named by its origin, e.g. https://spex.sublang.ai; the default is
the first one signed in to. The home is SPEX_HOME, else ~/.spex.

Package init (made from files at hand, no server):
  package init <org>/<name> [--skill <folder>]... [--spec <file>]
               [--language <tag>] [--description <text>] [--license <id>]
               [--move]

${ATTACHED_USAGE}`;

/** The commands run with the shared runner (cli-13): exit 0 on success,
 * 1 with the cause on standard error, 130 on an interrupt. */
const COMMANDS: Record<string, Command> = {
  add, remove, rm: remove, install, i: install, update, list, ls: list, search,
  login, logout, whoami,
};

/** The commands keeping their own contracts and exits. */
const OWN: Record<string, (args: string[]) => void> = { scaffold, lint };

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  // Made from files at hand, before any attached routing: it never
  // opens a connection (attached-cli-12).
  if (command === "package" && args[1] === "init") {
    process.exitCode = packageInit(args.slice(2));
    return;
  }

  if (["auth", "project", "package", "--server", "--timeout"].includes(command) || command.startsWith("--server=") || command.startsWith("--timeout=")) {
    process.exitCode = await runAttached(args);
    return;
  }

  const run = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (run) {
    const code = await runCommand(command, run, args.slice(1));
    // An interrupted command ends now, once its words are out, whatever
    // request it left pending (cli-13).
    if (code === 130) process.stdout.write("", () => process.stderr.write("", () => process.exit(code)));
    else process.exitCode = code;
    return;
  }
  const own = Object.hasOwn(OWN, command) ? OWN[command] : undefined;
  if (own) {
    own(args.slice(1));
    return;
  }
  console.error(`Unknown command: ${command}\n`);
  console.error(USAGE);
  process.exit(1);
}

void main();

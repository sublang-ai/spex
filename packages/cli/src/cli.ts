#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { readFileSync } from "node:fs";

import { lint } from "./lint.js";
import { scaffold } from "./scaffold.js";
import { add } from "./commands/add.js";
import { install } from "./commands/install.js";
import { list } from "./commands/list.js";
import { login } from "./commands/login.js";
import { newPackage } from "./commands/new.js";
import { publish } from "./commands/publish.js";
import { logout } from "./commands/logout.js";
import { remove } from "./commands/remove.js";
import { search } from "./commands/search.js";
import { update } from "./commands/update.js";
import { whoami } from "./commands/whoami.js";
import { commandHelp, commandNamed, runCommand, USAGE, type Command } from "./commands/run.js";

/** The commands run with the shared runner (cli-13): exit 0 on success,
 * 1 with the cause on standard error, 130 on an interrupt. */
const COMMANDS: Record<string, Command> = {
  add, remove, rm: remove, install, i: install, update, list, ls: list, search, new: newPackage, publish,
  login, logout, whoami,
};

/** The commands keeping their own contracts and exits. */
const OWN: Record<string, (args: string[]) => void> = { scaffold, lint };

/** Print what was asked on standard output and exit 0 (cli-21). */
function say(text: string): void {
  process.stdout.write(`${text}\n`);
  process.exitCode = 0;
}

/** Refuse a word naming no command, on one line (cli-13). */
function unknown(word: string): void {
  process.stderr.write(`${word.startsWith("-") ? "unknown option" : "unknown command:"} ${word} \u2014 spex --help\n`);
  process.exitCode = 1;
}

/** The installed `@sublang/spex`'s version, from its package.json. */
function version(): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
    return typeof manifest.version === "string" ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a command's words ask for its help: `--help` or `-h` before
 * any `--`. */
function asksHelp(args: string[]): boolean {
  const end = args.indexOf("--");
  return (end < 0 ? args : args.slice(0, end)).some((arg) => arg === "--help" || arg === "-h");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // The usage, a command's help and the version read and write nothing
  // (cli-21).
  if (command === undefined || command === "--help" || command === "-h") return say(USAGE);
  if (command === "--version" || command === "-V") {
    const installed = version();
    if (installed !== undefined) return say(`spex ${installed}`);
    process.stderr.write("spex: package.json does not read \u2014 reinstall @sublang/spex\n");
    process.exitCode = 1;
    return;
  }
  if (command === "help") {
    const asked = args[1];
    if (asked === undefined || asked === "--help" || asked === "-h") return say(USAGE);
    const help = commandHelp(asked);
    return help === undefined ? unknown(asked) : say(help);
  }
  const named = Object.hasOwn(COMMANDS, command) || Object.hasOwn(OWN, command) ? commandNamed(command) : undefined;
  if (named === undefined) return unknown(command);
  if (asksHelp(args.slice(1))) return say(commandHelp(command)!);

  const run = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (run) {
    const code = await runCommand(command, run, args.slice(1));
    // An interrupted command ends now, once its words are out, whatever
    // request it left pending (cli-13).
    if (code === 130) process.stdout.write("", () => process.stderr.write("", () => process.exit(code)));
    else process.exitCode = code;
    return;
  }
  OWN[command]!(args.slice(1));
}

void main();

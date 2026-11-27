// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-16, guards-17, guards-27, guards-41),
 * DR-252: the two commands. `spex verify [--keep <folder>] [<guard>…]`
 * checks every guard, or the ones named, and exits 0 only when each
 * passes. `spex approve <guard>` prints what a person is approving
 * and writes the approval record. Both keep their own exits, as
 * `spex lint` does.
 */

import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import * as nodeModule from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { resolveBase } from "../resolve-base.js";
import { compareApproval, readApproval, writeApproval } from "./approval.js";
import { KEPT_FILE } from "./checks.js";
import { removeCopies } from "./copy.js";
import { listGuards, loadGuard, type Guard } from "./files.js";
import { readItems, type ItemIndex } from "./items.js";
import { stopProcesses } from "./processes.js";
import { refuse, refuseUse, sayApproved, sayCount, sayGuard, sayHeading, sayNoGuards, type Since } from "./report.js";
import { findTools, type Tools } from "./tlc.js";
import { formFaults } from "./translation.js";
import { GuardError } from "./types.js";
import { checkGuard, passes } from "./verify.js";

/** The first option among a command's words, if any. */
function optionIn(args: readonly string[]): string | undefined {
  return args.find((arg) => arg.startsWith("-") && arg !== "-");
}

function causeOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A path with every link in the part of it that exists followed. */
function realPath(path: string): string {
  let known = resolve(path);
  const rest: string[] = [];
  while (!existsSync(known) && dirname(known) !== known) {
    rest.unshift(known.slice(dirname(known).length).replace(/^[\\/]/, ""));
    known = dirname(known);
  }
  return join(realpathSync(known), ...rest);
}

/**
 * Why `--keep <folder>` cannot be used, or null: the folder lies
 * among the project's files, unless Git ignores it there.
 */
function keepFault(root: string, keep: string): string | null {
  const base = realpathSync(root);
  if (keep !== base && !keep.startsWith(base + sep)) return null;
  try {
    if (keep !== base) {
      // Asked about as a folder: Git matches a rule such as `kept/`
      // against a path that is not there yet only where it ends in `/`.
      execFileSync("git", ["--no-optional-locks", "-C", base, "check-ignore", "-q", `${keep}/`], { stdio: "ignore" });
      return null;
    }
  } catch {
    // Git does not ignore it, or there is no Git to ask.
  }
  return "the folder lies among the project's files \u2014 name a folder outside the project, or one Git ignores";
}

/**
 * `spex verify [--keep <folder>] [<guard>…]` (guards-17). Returns the
 * exit status: 0
 * when every guard it checked passes or there is none, else 1. An
 * interrupt stops the copy being checked, removes every copy and
 * exits 130 at once; a quit exits 131, a request to end 143 and a
 * hangup 129 the same way (guards-27).
 */
export async function verify(words: string[]): Promise<number> {
  const args: string[] = [];
  let kept: string | undefined;
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at];
    if (word === "--keep" || word.startsWith("--keep=")) {
      const value = word === "--keep" ? words[++at] : word.slice("--keep=".length);
      if (value === undefined || value === "") {
        refuseUse("verify", "--keep needs a folder");
        return 1;
      }
      kept = value;
    } else if (word.startsWith("-") && word !== "-") {
      refuseUse("verify", `unknown option ${word}`);
      return 1;
    } else args.push(word);
  }
  // The process of a copy tells of the modules it loads through
  // module.registerHooks, which Node has from 22.15.
  if (typeof nodeModule.registerHooks !== "function") {
    refuse("verify", `needs Node 22.15 or newer to see what a copy's process loads; this is Node ${process.versions.node}`);
    return 1;
  }
  let root: string;
  let known: string[];
  try {
    root = resolveBase(undefined);
    known = listGuards(root);
  } catch (error) {
    refuse("verify", causeOf(error));
    return 1;
  }
  const unknown = args.find((name) => !known.includes(name));
  if (unknown !== undefined) {
    refuse("verify", `${unknown} is no guard under guards/`);
    return 1;
  }
  const names = args.length > 0 ? args : known;
  let keep: string | null = null;
  if (kept !== undefined) {
    try {
      keep = realPath(kept);
    } catch (error) {
      refuse("verify", `--keep ${kept}: ${causeOf(error)}`);
      return 1;
    }
    const fault = keepFault(root, keep);
    if (fault !== null) {
      refuse("verify", `--keep ${kept}: ${fault}`);
      return 1;
    }
    const taken = names.find((name) => existsSync(join(keep as string, name)) && !existsSync(join(keep as string, name, KEPT_FILE)));
    if (taken !== undefined) {
      refuse("verify", `--keep ${kept}: ${join(keep, taken)} was not kept by spex verify \u2014 remove it, or name another folder`);
      return 1;
    }
  }
  if (names.length === 0) {
    sayNoGuards();
    return 0;
  }

  // A signal stops the copy's processes with all they started, removes
  // every copy and exits at once with 128 plus the signal's number.
  // Each process a run starts leads a session of its own, so no key
  // typed at the terminal reaches it: SIGQUIT is handled as well.
  const signals = { SIGINT: 130, SIGQUIT: 131, SIGTERM: 143, SIGHUP: 129 } as const;
  const stops = Object.entries(signals).map(([signal, status]) => {
    const stop = (): void => {
      stopProcesses();
      removeCopies();
      process.exit(status);
    };
    process.on(signal, stop);
    return (): void => void process.off(signal, stop);
  });
  try {
    // The tree's items are read once, and only when a guard is loaded.
    let items: ItemIndex | undefined;
    const index = (): ItemIndex => (items ??= readItems(root));
    // Java and the jar are found once, and only when a guard needs TLC.
    let found: Promise<Tools> | undefined;
    const tools = (): Promise<Tools> => (found ??= findTools());
    sayHeading();
    let passing = 0;
    for (const name of names) {
      const report = await checkGuard(root, name, { index, tools, keep });
      if (passes(report)) passing += 1;
      sayGuard(report);
    }
    sayCount(passing, names.length);
    return passing === names.length ? 0 : 1;
  } catch (error) {
    // Nothing about a guard: the run itself could not go on.
    refuse("verify", causeOf(error));
    return 1;
  } finally {
    for (const off of stops) off();
    removeCopies();
  }
}

/**
 * `spex approve <guard>` (guards-16). Returns the exit status: 0 with
 * the record written, else 1 with nothing written. It runs no check
 * and asks no question.
 */
export async function approve(args: string[]): Promise<number> {
  const option = optionIn(args);
  if (option !== undefined) {
    refuseUse("approve", `unknown option ${option}`);
    return 1;
  }
  if (args.length === 0) {
    refuseUse("approve", "missing <guard>");
    return 1;
  }
  if (args.length > 1) {
    refuseUse("approve", `unexpected argument ${args[1]}`);
    return 1;
  }
  const name = args[0];
  try {
    const root = resolveBase(undefined);
    if (!listGuards(root).includes(name)) {
      refuse("approve", `${name} is no guard under guards/`);
      return 1;
    }
    let guard: Guard;
    try {
      guard = loadGuard(root, name);
    } catch (error) {
      refuse("approve", `${name} cannot be checked — ${causeOf(error)}`);
      return 1;
    }
    // A translation's form is checked by its text; TLC is not run.
    const faults = guard.translations.flatMap((translation) =>
      formFaults(translation).map(
        (fault) => `${translation.file}${fault.line === null ? "" : `:${fault.line}:${fault.col}`}: ${fault.message}`,
      ),
    );
    if (faults.length > 0) {
      refuse("approve", `${name} cannot be checked — ${faults.join("; ")}`);
      return 1;
    }
    let since: Since;
    try {
      const record = readApproval(root, name);
      since = record === null ? null : compareApproval(guard.inputs, record);
    } catch (error) {
      if (!(error instanceof GuardError)) throw error;
      since = error.message;
    }
    const record = writeApproval(root, name, guard.inputs);
    sayApproved(guard, since, record.path, record.written);
    return 0;
  } catch (error) {
    refuse("approve", causeOf(error));
    return 1;
  }
}

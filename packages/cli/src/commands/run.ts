// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The runner of the package commands (cli-13, DR-165): a command's
// success exits 0; a refusal or failure prints its cause on standard
// error and exits 1; an interrupt exits 130 once whatever the command
// was waiting on is cancelled. A command prints no secret: it names
// accounts, instances and the device flow's user code, never a token.

import { parseArgs, type ParseArgsConfig } from "node:util";

/** A refusal or failure the reader is told about, in the CLI's words. */
export class Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refusal";
  }
}

/** The command was interrupted while it waited. */
export class Interrupted extends Error {
  constructor(message = "interrupted") {
    super(message);
    this.name = "Interrupted";
  }
}

/** How a command meets an interrupt: while a hook is registered, an
 * interrupt calls it in place of ending the process, so the command
 * cancels what it waits on and ends itself; with none, the process ends
 * at once, 130. */
export interface Interrupt {
  /** Whether an interrupt arrived. */
  readonly requested: boolean;
  /** Register `hook` until the returned release is called. */
  hold(hook: () => void): () => void;
}

export type Command = (args: string[], interrupt: Interrupt) => Promise<void>;

/** A command's own options, parsed strictly: an unknown option or a
 * stray argument refuses the command. */
export function options<T extends NonNullable<ParseArgsConfig["options"]>>(name: string, args: string[], spec: T) {
  try {
    return parseArgs({ args, options: spec, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new Refusal(`${(error as Error).message}; see spex --help`);
  }
}

/** Run one command to its exit code, printing a cause on standard error. */
export async function runCommand(name: string, command: Command, args: string[]): Promise<number> {
  const hooks = new Set<() => void>();
  let requested = false;
  const interrupt: Interrupt = {
    get requested() { return requested; },
    hold(hook) {
      hooks.add(hook);
      return () => { hooks.delete(hook); };
    },
  };
  const onSignal = (): void => {
    requested = true;
    if (hooks.size === 0) {
      process.stderr.write(`spex ${name}: interrupted\n`);
      process.exit(130);
    }
    for (const hook of [...hooks]) hook();
  };
  process.on("SIGINT", onSignal);
  try {
    await command(args, interrupt);
    return 0;
  } catch (error) {
    if (error instanceof Interrupted) {
      process.stderr.write(`spex ${name}: ${error.message}\n`);
      return 130;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`spex ${name}: ${message}\n`);
    return 1;
  } finally {
    process.off("SIGINT", onSignal);
  }
}

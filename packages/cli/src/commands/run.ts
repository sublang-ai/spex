// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The runner of the package commands (cli-13, DR-165): a command's
// success exits 0; a refusal or failure prints its cause on standard
// error and exits 1; an interrupt exits 130 once whatever the command
// was waiting on is cancelled. A command prints no secret: it names
// accounts, registries, Spaces and the device flow's user code, never
// a token.
//
// It also holds the usage and each command's help (cli-21, DR-172):
// a refusal of how a command was called names the cause in the CLI's
// words, never Node's, followed by the command's one-line usage.

import { parseArgs, type ParseArgsConfig } from "node:util";

import { AGENT_TARGETS } from "../append-agent-specs.js";
import { SUPPORTED_LANGUAGES } from "../copy-templates.js";

/** The usage, as cli-21 writes it. */
export const USAGE = `Usage: spex <command> [options]

Packages in this folder (spex.yaml, spex.lock, .spex/)
  add <org>/<pkg>[@<version>]      Add a package (newest by default)
  add <org>/<pkg> --path <folder>  Add a package from a folder in this project
  remove, rm <org>/<pkg>           Remove a package
  install, i                       Install what spex.lock records
  update                           Update to the newest versions spex.yaml allows
  list, ls                         What is added, installed, and placed for your agents
  search <query>                   Find packages at the registry

Your packages
  new <org>/<pkg> [--skill <folder>]… [--spec <file>]   Start a package in spex-packages/<org>/<pkg>/
  publish [<org>/<pkg>] [--dry-run]                     Publish it to the registry

Sign-in
  login [--registry <url> | --space <url>]              Sign in with a code in your browser
  logout [--registry <url> | --space <url>]             Sign out
  whoami [--registry <url> | --space <url>]             Who you are signed in as, and where

Specs
  scaffold [<path> | --update]                          Start specs/ and point your agents at it
  lint [<path>]                                         Check specs/ for structure, IDs and citations

spex --version · spex <command> --help · Home: $SPEX_HOME or ~/.spex`;

/** An option of a command: its label, what it does, and, for one that
 * takes a value, what a refusal says it needs. */
type Option = readonly [label: string, text: string, needs?: string];

interface Help {
  /** The one-line usage, without the leading "Usage: ". */
  usage: string;
  /** The words it takes, as a refusal names one missing. */
  words?: string;
  options: readonly Option[];
}

const AGENTS: readonly string[] = AGENT_TARGETS.flatMap((target) => target.agents).sort();

/** "a or b", "a, b or c". */
function either(words: readonly string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
}

/** Each command's help, under its own name (cli-21). */
const HELP: Readonly<Record<string, Help>> = {
  add: {
    usage: "spex add <org>/<pkg>[@<version>] | <org>/<pkg> --path <folder>",
    words: "<org>/<pkg>",
    options: [["--path <folder>", "Add the package in this folder of the project", "a folder"]],
  },
  remove: { usage: "spex remove <org>/<pkg>", words: "<org>/<pkg>", options: [] },
  install: { usage: "spex install", options: [] },
  update: { usage: "spex update", options: [] },
  list: { usage: "spex list", options: [] },
  search: { usage: "spex search <query>", words: "<query>", options: [] },
  new: {
    usage: "spex new <org>/<pkg> [--skill <folder>]… [--spec <file>] [options]",
    words: "<org>/<pkg>",
    options: [
      ["--skill <folder>", "A skill folder to put in the package; repeat for more", "a folder"],
      ["--spec <file>", "A spec file, named <pkg>.md", "a file"],
      ["--language <tag>", "The language of its skills and spec (en by default)", "a language tag"],
      ["--description <text>", "What the package is for (by default from its first skill, else its spec)", "a description"],
      ["--license <id>", "Its license (by default from this project's LICENSE, else Apache-2.0)", "a license id"],
      ["--move", "Move the skill folders in, in place of copying them"],
    ],
  },
  publish: {
    usage: "spex publish [<org>/<pkg>] [--dry-run]",
    options: [["--dry-run", "List the files it would publish, and publish nothing"]],
  },
  login: {
    usage: "spex login [--registry <url> | --space <url>] [--force]",
    options: [
      ["--registry <url>", "Sign in at this registry, not this folder's", "a URL"],
      ["--space <url>", "Sign in at this Space", "a URL"],
      ["--force", "Sign in again where already signed in"],
    ],
  },
  logout: {
    usage: "spex logout [--registry <url> | --space <url>]",
    options: [
      ["--registry <url>", "Sign out at this registry, not this folder's", "a URL"],
      ["--space <url>", "Sign out at this Space", "a URL"],
    ],
  },
  whoami: {
    usage: "spex whoami [--registry <url> | --space <url>]",
    options: [
      ["--registry <url>", "Show this registry alone", "a URL"],
      ["--space <url>", "Show this Space alone", "a URL"],
    ],
  },
  scaffold: {
    usage: "spex scaffold [<path> | --update] [--lang <code>] [--agents <names>]",
    options: [
      ["<path>", "The folder to create it in (the Git repository's top level by default)"],
      ["--update", "Refresh the templates of this repository's specs/"],
      ["--lang <code>", `The language of the specs: ${either(SUPPORTED_LANGUAGES)}`],
      ["--agents <names>", `The agents to point at specs/, separated by commas: ${AGENTS.join(", ")}, or all`],
    ],
  },
  lint: {
    usage: "spex lint [<path>]",
    options: [["<path>", "The folder holding specs/ (the Git repository's top level by default)"]],
  },
};

/** The aliases the usage names beside a command. */
const ALIASES: Readonly<Record<string, string>> = { rm: "remove", i: "install", ls: "list" };

/** The command a word of the command line names, by its own name or an
 * alias, if any. */
export function commandNamed(word: string): string | undefined {
  if (Object.hasOwn(HELP, word)) return word;
  return Object.hasOwn(ALIASES, word) ? ALIASES[word] : undefined;
}

/** The commands a usage line names: its leading words, up to its first
 * argument. */
function namesOf(line: string): string[] {
  const names: string[] = [];
  for (const word of line.trim().split(/\s{2,}/)[0]!.split(" ")) {
    if (!/^[a-z]+,?$/.test(word)) break;
    names.push(word.replace(",", ""));
  }
  return names;
}

/** A command's lines of the usage, under their heading. */
function usageLinesOf(name: string): string[] {
  const lines = USAGE.split("\n").slice(1, -1);
  let heading = "";
  const found: string[] = [];
  for (const line of lines) {
    if (line === "") continue;
    if (!line.startsWith(" ")) heading = line;
    else if (namesOf(line).includes(name)) {
      if (found.length === 0) found.push(heading);
      found.push(line);
    }
  }
  return found;
}

/** A command's help: its one-line usage, its lines of the usage and
 * every option it takes (cli-21); none for a word naming no command. */
export function commandHelp(word: string): string | undefined {
  const name = commandNamed(word);
  if (name === undefined) return undefined;
  const help = HELP[name]!;
  const rows: Option[] = [...help.options, ["-h, --help", "Show this help"]];
  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  return [
    `Usage: ${help.usage}`,
    "",
    ...usageLinesOf(name),
    "",
    "Options",
    ...rows.map(([label, text]) => `  ${label.padEnd(width)}${text}`),
  ].join("\n");
}

/** A refusal of how a command was called: the cause, then the
 * command's one-line usage (cli-13, cli-21). */
export function misuse(name: string, cause: string): Refusal {
  const command = commandNamed(name);
  return new Refusal(command === undefined ? cause : `${cause}\nUsage: ${HELP[command]!.usage}`);
}

type Spec = NonNullable<ParseArgsConfig["options"]>;

/** What a command's option `--<key>` needs as its value, in words. */
export function needs(name: string, key: string): string {
  const command = commandNamed(name);
  const option = command === undefined ? undefined : HELP[command]!.options.find(([label]) => label.split(" ")[0] === `--${key}`);
  return option?.[2] ?? "a value";
}

/** Why `parseArgs` refused `args`, in the CLI's words: the first
 * argument it could not take, read by the same rules. */
function parseCause(name: string, args: string[], spec: Spec, positionals: boolean): string {
  const shorts = new Map(Object.entries(spec).flatMap(([key, option]) => (option.short === undefined ? [] : [[option.short, key] as const])));
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      if (!positionals && i + 1 < args.length) return `unexpected argument ${args[i + 1]}`;
      break;
    }
    if (arg === "-" || !arg.startsWith("-")) {
      if (!positionals) return `unexpected argument ${arg}`;
      continue;
    }
    const equals = arg.indexOf("=");
    const shown = arg.startsWith("--") && equals >= 0 ? arg.slice(0, equals) : arg;
    const key = arg.startsWith("--") ? shown.slice(2) : shorts.get(arg.slice(1));
    if (key === undefined || !Object.hasOwn(spec, key)) return `unknown option ${shown}`;
    const inline = shown !== arg;
    if (spec[key]!.type === "boolean") {
      if (inline) return `${shown} takes no value`;
      continue;
    }
    if (inline) continue;
    const next = args[i + 1];
    if (next === undefined || (next.length > 1 && next.startsWith("-"))) return `${shown} needs ${needs(name, key)}`;
    i++;
  }
  return "cannot read these options";
}

/** Refuse an option given an empty value, as one given none. */
function refuseEmpty(name: string, values: Record<string, unknown>, spec: Spec): void {
  for (const [key, value] of Object.entries(values)) {
    if (spec[key]?.type === "string" && (value === "" || (Array.isArray(value) && value.includes("")))) {
      throw misuse(name, `--${key} needs ${needs(name, key)}`);
    }
  }
}

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
 * stray argument refuses the command with its one-line usage. */
export function options<T extends Spec>(name: string, args: string[], spec: T) {
  const parse = () => parseArgs({ args, options: spec, strict: true, allowPositionals: false });
  let result: ReturnType<typeof parse>;
  try {
    result = parse();
  } catch {
    throw misuse(name, parseCause(name, args, spec, false));
  }
  refuseEmpty(name, result.values, spec);
  return result.values;
}

/** A command's options and its words, parsed strictly: an unknown
 * option, or fewer or more words than it takes, refuses the command
 * with its one-line usage. */
export function parsed<T extends Spec>(name: string, args: string[], spec: T, words: { min: number; max: number }) {
  let result;
  try {
    result = parseArgs({ args, options: spec, strict: true, allowPositionals: true });
  } catch {
    throw misuse(name, parseCause(name, args, spec, true));
  }
  refuseEmpty(name, result.values, spec);
  const { positionals } = result;
  if (positionals.length > words.max) throw misuse(name, `unexpected argument ${positionals[words.max]}`);
  if (positionals.length < words.min) {
    const command = commandNamed(name);
    throw misuse(name, `missing ${(command === undefined ? undefined : HELP[command]!.words) ?? "an argument"}`);
  }
  return { values: result.values, positionals };
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

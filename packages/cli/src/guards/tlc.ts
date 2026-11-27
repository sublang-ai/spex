// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-9, guards-40), DR-244 and DR-252: TLC, the
 * model checker of the TLA+ tools. This file finds Java and the
 * pinned `tla2tools.jar`, runs TLC once in a folder of its own with
 * fixed options, and reads
 * what TLC printed: its messages, a module that does not parse, the
 * values a file printed, a sequence, its counts and its state dump.
 * It evaluates no TLA+ and answers none of the four questions.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { constants as bufferLimits } from "node:buffer";
import { basename, dirname, join, resolve } from "node:path";
import { homeDir } from "../commands/home.js";
import { lastWords, runProcess } from "./processes.js";
import { parseState, parseTlaAll, type Tla } from "./tla.js";
import { GuardError } from "./types.js";

// ---------------------------------------------------------------
// Java and the jar
// ---------------------------------------------------------------

/** The one TLC that Spex pins. */
export const TLC_PIN = {
  version: "2.19",
  release: "v1.7.4",
  url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
  sha256: "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88",
} as const;

/** The oldest Java that runs TLC. */
const JAVA_FLOOR = 11;

/** What a run needs beside the project. */
export type Tools = {
  /** The Java program. */
  java: string;
  /** Its version, as it names it. */
  javaVersion: string;
  /** The jar holding TLC, as an absolute path. */
  jar: string;
  /** The jar's bytes are the pinned release's. */
  pinned: boolean;
};

/** The variables through which a host adds options to every JVM. A
 * run of TLC takes none of them. */
const JVM_OPTIONS = ["JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS"];

/** The environment TLC and `java -version` run in. */
function javaEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = { ...env };
  for (const name of JVM_OPTIONS) delete clean[name];
  return clean;
}

const NEEDS_JAVA = `spex verify runs TLC, which needs Java ${JAVA_FLOOR} or later`;

/**
 * Find Java: `$JAVA_HOME/bin/java` where that file is there, else
 * `java` on PATH. Throws a GuardError saying what to install or set.
 */
export function findJava(env: NodeJS.ProcessEnv = process.env): { java: string; javaVersion: string } {
  let java = "java";
  const home = env.JAVA_HOME?.trim();
  if (home) {
    const named = join(home, "bin", process.platform === "win32" ? "java.exe" : "java");
    if (existsSync(named)) java = named;
  }
  const ran = spawnSync(java, ["-version"], { env: javaEnv(env), encoding: "utf8", timeout: 60_000, windowsHide: true });
  if (ran.error !== undefined || ran.status !== 0) {
    throw new GuardError(`Java was not found: ${NEEDS_JAVA} — install one, or set JAVA_HOME to one`);
  }
  const named = /version "([^"]+)"/.exec(`${ran.stderr}\n${ran.stdout}`);
  if (named === null) {
    throw new GuardError(`${java} -version names no version: ${NEEDS_JAVA} — install one, or set JAVA_HOME to one`);
  }
  const parts = named[1].split(/[._-]/).map(Number);
  const major = parts[0] === 1 ? parts[1] : parts[0];
  if (!(major >= JAVA_FLOOR)) {
    throw new GuardError(`Java ${named[1]} is too old: ${NEEDS_JAVA} — install one, or set JAVA_HOME to one`);
  }
  return { java, javaVersion: named[1] };
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** Where the home keeps its copy of the pinned jar. */
export function homeJar(env: NodeJS.ProcessEnv = process.env): string {
  return join(homeDir(env), "tools", `tla2tools-${TLC_PIN.release.slice(1)}.jar`);
}

/** The program a download runs: Node itself, so that it follows the
 * host's proxy variables where this Node can. */
const DOWNLOAD = `const [, url, dest] = process.argv;
fetch(url, { redirect: "follow" })
  .then(async (answer) => {
    if (!answer.ok) throw new Error("the server answered " + answer.status);
    require("node:fs").writeFileSync(dest, Buffer.from(await answer.arrayBuffer()));
  })
  .catch((error) => {
    console.error((error.cause && error.cause.message) || error.message);
    process.exit(1);
  });`;

/**
 * Download `pin.url` to `dest`, once: the bytes are kept only where
 * their SHA-256 is `pin.sha256`. Throws a GuardError saying what to
 * do where the download fails or gives other bytes; nothing is then
 * left at `dest`.
 */
export async function downloadJar(
  pin: { version: string; url: string; sha256: string },
  dest: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const yourself = `download it yourself, check that its sha256 is ${pin.sha256}, and set SPEX_TLC_JAR to the file`;
  const folder = dirname(dest);
  const part = `${dest}.part-${process.pid}`;
  try {
    mkdirSync(folder, { recursive: true });
    const ran = await runProcess(process.execPath, ["-e", DOWNLOAD, pin.url, part], {
      cwd: folder,
      env: { ...env, NODE_USE_ENV_PROXY: "1" },
      seconds: 300,
      errors: `${part}.err`,
    });
    if (ran.failed !== null || ran.timedOut || ran.code !== 0 || !isFile(part)) {
      const cause = ran.timedOut ? "not done after 300 seconds" : (ran.failed ?? lastWords(ran.errors));
      throw new GuardError(
        `TLC ${pin.version} could not be downloaded from ${pin.url}${cause === "" ? "" : `: ${cause}`} — ${yourself}`,
      );
    }
    const got = sha256(part);
    if (got !== pin.sha256) {
      throw new GuardError(
        `what ${pin.url} gave is not TLC ${pin.version}: its sha256 is ${got}; nothing was kept — ${yourself}`,
      );
    }
    renameSync(part, dest);
  } catch (error) {
    if (error instanceof GuardError) throw error;
    const cause = error instanceof Error ? error.message : String(error);
    throw new GuardError(`TLC ${pin.version} could not be kept at ${dest}: ${cause} — ${yourself}`);
  } finally {
    rmSync(part, { force: true });
    rmSync(`${part}.err`, { force: true });
  }
}

/**
 * Find the jar: the one `SPEX_TLC_JAR` names where it is set, else
 * the home's copy of the pinned release, downloaded once and checked
 * where the home has none. Throws a GuardError saying what to set.
 */
export async function findJar(env: NodeJS.ProcessEnv = process.env): Promise<{ jar: string; pinned: boolean }> {
  const named = env.SPEX_TLC_JAR?.trim();
  if (named) {
    const jar = resolve(named);
    if (!isFile(jar)) {
      throw new GuardError(
        `SPEX_TLC_JAR names ${named}, which is no file — set it to a tla2tools.jar, or unset it for Spex to download TLC ${TLC_PIN.version}`,
      );
    }
    return { jar, pinned: sha256(jar) === TLC_PIN.sha256 };
  }
  const jar = homeJar(env);
  if (!isFile(jar) || sha256(jar) !== TLC_PIN.sha256) await downloadJar(TLC_PIN, jar, env);
  return { jar, pinned: true };
}

/** Find Java and the jar. Throws a GuardError saying what to install
 * or set. */
export async function findTools(env: NodeJS.ProcessEnv = process.env): Promise<Tools> {
  const java = findJava(env);
  return { ...java, ...(await findJar(env)) };
}

// ---------------------------------------------------------------
// One run
// ---------------------------------------------------------------

/** One message of TLC's `-tool` output. */
export type Message = { code: number; severity: number; text: string };

/** One run of TLC, as it ended. */
export type TlcRun = {
  module: string;
  /** Its exit status; null where it was stopped or never started. */
  status: number | null;
  /** It was stopped at the time limit. */
  timedOut: boolean;
  /** Why it could not start, where it could not. */
  failed: string | null;
  /** The end of what the JVM wrote on standard error. */
  errors: string;
  stdout: string;
  messages: Message[];
  /** What the module printed with PrintT. */
  user: string;
  /** The state dump, where one was asked for, the run was not
   * stopped at the time limit and the dump could be read. */
  dump: string | null;
  /** Why the state dump could not be read, where it could not. */
  unread: string | null;
  /** The command as run, the program first; its working folder is
   * the run's own. */
  command: string[];
};

/** The words of the command line after the program, for `module` in
 * the folder TLC runs in. Every path but the jar's is relative to
 * that folder, so the same line runs again anywhere. */
export function tlcArgs(jar: string, module: string, dump: boolean): string[] {
  return [
    "-XX:+UseParallelGC",
    "-Djava.io.tmpdir=java-tmp",
    "-cp",
    jar,
    "tlc2.TLC",
    "-tool",
    "-workers",
    "1",
    "-fp",
    "0",
    "-metadir",
    "states",
    "-userFile",
    `${module}.user`,
    ...(dump ? ["-dump", `${module}.dump`] : []),
    "-config",
    `${module}.cfg`,
    module,
  ];
}

/**
 * Run TLC once on `<module>.tla` with `<module>.cfg` in `folder`,
 * which holds them and every module they load and is used by no other
 * run. The run is stopped at `seconds`.
 */
export async function runTlc(
  tools: Tools,
  folder: string,
  module: string,
  options: { dump?: boolean; seconds: number; env?: NodeJS.ProcessEnv },
): Promise<TlcRun> {
  // TLC unpacks its standard modules into the JVM's temp folder, which
  // must be there and be this run's own.
  mkdirSync(join(folder, "java-tmp"), { recursive: true });
  const args = tlcArgs(tools.jar, module, options.dump === true);
  const out = join(folder, `${module}.out`);
  const ran = await runProcess(tools.java, args, {
    cwd: folder,
    env: javaEnv(options.env ?? process.env),
    seconds: options.seconds,
    errors: join(folder, `${module}.err`),
    output: out,
  });
  const read = (file: string): string | null => (isFile(file) ? readFileSync(file, "utf8") : null);
  const stdout = read(out) ?? "";
  // A run stopped at the time limit left its dump unfinished, and the
  // dump of a model without end is larger than any text Node holds.
  let dump: string | null = null;
  let unread: string | null = null;
  if (options.dump === true && !ran.timedOut) {
    const file = join(folder, `${module}.dump`);
    try {
      const size = isFile(file) ? statSync(file).size : 0;
      if (size > bufferLimits.MAX_STRING_LENGTH) unread = `it is too large, ${size} bytes`;
      else dump = read(file);
    } catch (error) {
      unread = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    module,
    status: ran.code,
    timedOut: ran.timedOut,
    failed: ran.failed,
    errors: ran.errors,
    stdout,
    messages: messagesOf(stdout),
    user: read(join(folder, `${module}.user`)) ?? "",
    dump,
    unread,
    command: [tools.java, ...args],
  };
}

// ---------------------------------------------------------------
// Reading what TLC printed
// ---------------------------------------------------------------

/** The messages of `-tool` output, in order. An error's text can hold
 * another message, so the codes are paired. */
export function messagesOf(stdout: string): Message[] {
  const messages: Message[] = [];
  const re = /@!@!@STARTMSG (\d+):(\d+) @!@!@\n([\s\S]*?)\n?@!@!@ENDMSG \1 @!@!@/g;
  for (const found of stdout.replace(/\r\n/g, "\n").matchAll(re)) {
    messages.push({ code: Number(found[1]), severity: Number(found[2]), text: found[3] });
  }
  return messages;
}

/** TLC's version, from its version line (message 2262): `2.19`. */
export function versionOf(run: TlcRun): string | null {
  const line = run.messages.find((message) => message.code === 2262)?.text ?? "";
  return /Version (\S+)/.exec(line)?.[1] ?? null;
}

/** Whether TLC got past the model's start: it reports the initial
 * states computed (message 2190). */
export function pastStart(run: TlcRun): boolean {
  return run.messages.some((message) => message.code === 2190);
}

/**
 * What the JVM wrote on standard error, on one line: its first two
 * lines that are no line of a stack. Java says why it could not run
 * TLC at the top, before any stack. Empty where it wrote nothing.
 */
export function javaWords(errors: string): string {
  return errors
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("at ") && !/^\.\.\. \d+ more$/.test(line))
    .slice(0, 2)
    .join(" ");
}

/** The modules TLC reports loading, by name, in its order. */
export function loadedModules(run: TlcRun): string[] {
  const names: string[] = [];
  for (const found of run.stdout.matchAll(/^Parsing file (.*)$/gm)) {
    const name = basename(found[1].trim().replace(/\\/g, "/")).replace(/\.tla$/, "");
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/** One thing the parser said of a module that does not parse. */
export type ParseFault = { module: string | null; line: number | null; col: number | null; message: string };

function oneLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).filter((line) => line !== "").join(" ");
}

/**
 * What TLC's parser said where the modules did not parse (exit 150):
 * each error with its module, line and column where it names them.
 * Empty where it said nothing this reads.
 */
export function parseFaults(run: TlcRun): ParseFault[] {
  const stdout = run.stdout.replace(/\r\n/g, "\n");
  const from = stdout.indexOf("@!@!@ENDMSG 2220 @!@!@");
  if (from < 0) return [];
  const rest = stdout.slice(from + "@!@!@ENDMSG 2220 @!@!@".length);
  const to = rest.indexOf("@!@!@STARTMSG");
  const said = (to < 0 ? rest : rest.slice(0, to))
    .split("\n")
    .filter((line) => !/^(Parsing file|Semantic processing of module) /.test(line))
    .join("\n");
  const failing = /Could not parse module (\w+) from file/.exec(said)?.[1] ?? null;

  const lexical = /^Lexical error at line (\d+), column (\d+)\.\s*(.*)$/m.exec(said);
  if (lexical !== null) {
    return [{ module: failing, line: Number(lexical[1]), col: Number(lexical[2]), message: `Lexical error. ${lexical[3].trim()}` }];
  }
  const syntax = /\*\*\*Parse Error\*\*\*\n([\s\S]*?)\n[ \t]*\n(?=Residual stack trace|Fatal errors)/.exec(said);
  if (syntax !== null) {
    const place = /at line (\d+),\s*column (\d+)/.exec(syntax[1]) ?? /line (\d+), col (\d+) to line/.exec(syntax[1]);
    return [
      {
        module: failing,
        line: place === null ? null : Number(place[1]),
        col: place === null ? null : Number(place[2]),
        message: oneLine(syntax[1]),
      },
    ];
  }
  const faults: ParseFault[] = [];
  const seen = new Set<string>();
  for (const block of said.split(/^Semantic errors:$/m).slice(1)) {
    const errors = block.split(/^\*\*\* Warnings: \d+$/m)[0];
    for (const found of errors.matchAll(/^line (\d+), col (\d+) to line \d+, col \d+ of module (\w+)\n\n([\s\S]*?)(?:\n[ \t]*\n|(?![\s\S]))/gm)) {
      const fault = { module: found[3], line: Number(found[1]), col: Number(found[2]), message: oneLine(found[4]) };
      const mark = JSON.stringify(fault);
      if (!seen.has(mark)) faults.push(fault);
      seen.add(mark);
    }
  }
  if (faults.length > 0) return faults;
  const abort = /\*\*\* Abort messages: \d+\n\n(.*)\n\n([\s\S]*?)(?:\n[ \t]*\n|$)/.exec(said);
  if (abort !== null) {
    return [{ module: /^In module (\w+)/.exec(abort[1])?.[1] ?? null, line: null, col: null, message: oneLine(abort[2]) }];
  }
  const all = oneLine(said);
  return all === "" ? [] : [{ module: null, line: null, col: null, message: all }];
}

/** A place TLC names in a module. */
export type Place = { module: string; line: number; col: number };

/** What TLC said where it could not evaluate an expression. */
export type EvalFault = {
  /** TLC's own words, on one line. */
  message: string;
  /** The line of the `ASSUME` it was evaluating, where it names one. */
  assume: number | null;
  /** The places it names, the innermost last. */
  places: Place[];
};

/** What TLC itself says of a Java stack overflow where it catches
 * one (its message 1005), said here too where it only names the
 * exception, so that one fault reads the same in every run. */
const STACK_OVERFLOW =
  "This was a Java StackOverflowError. It was probably the result of an incorrect recursive function definition that caused TLC to enter an infinite loop when trying to compute the function or its application to an element in its putative domain.";

/**
 * TLC's first error that is not a violated invariant: its message
 * and the places it names. Null where it reported none.
 */
export function evalFault(run: TlcRun): EvalFault | null {
  const error = run.messages.find(
    (message) => message.severity === 1 && ![2110, 2121, 2103, 3002].includes(message.code),
  );
  if (error === undefined) return null;
  // An error raised inside an operator of a standard module comes
  // as a message within the message: its marks are no words of TLC's.
  let text = error.text.replace(/@!@!@STARTMSG \d+:\d+ @!@!@\n?|\n?@!@!@ENDMSG \d+ @!@!@/g, "");
  // An error TLC met while evaluating comes wrapped in a notice of
  // the Java exception that carried it. Where Java itself threw, the
  // notice is followed by the exception and its stack: the stack is
  // left to `--keep`.
  const wrapped = /^TLC threw an unexpected exception\.[\s\S]*?\n: /.exec(text);
  const thrown = /^TLC threw an unexpected exception\.[\s\S]*?\nThe exception was a (\S+)(?:\n([^\n]*))?/.exec(text);
  if (wrapped !== null) text = text.slice(wrapped[0].length);
  else if (thrown !== null) {
    const said = (thrown[2] ?? "").trim();
    const own = said.startsWith(`${thrown[1]}: `) ? `: ${said.slice(thrown[1].length + 2)}` : "";
    text = thrown[1] === "java.lang.StackOverflowError" ? STACK_OVERFLOW : `TLC threw a ${thrown[1]}${own}`;
  }
  let assume: number | null = null;
  const assumption = /^Evaluating assumption line (\d+), col \d+ to line \d+, col \d+ of module \w+ failed\.\n?/.exec(text);
  if (assumption !== null) {
    assume = Number(assumption[1]);
    text = text.slice(assumption[0].length);
  }
  const places: Place[] = [];
  const nested = run.messages.find((message) => message.code === 2103);
  for (const found of (nested?.text ?? "").matchAll(/^\d+\. Line (\d+), column (\d+) to line \d+, column \d+ in (\w+)$/gm)) {
    places.push({ module: found[3], line: Number(found[1]), col: Number(found[2]) });
  }
  const lines = text.split("\n");
  const innermost = /^line (\d+), col (\d+) to line \d+, col \d+ of module (\w+)$/.exec(lines[lines.length - 1].trim());
  if (innermost !== null) {
    lines.pop();
    const place = { module: innermost[3], line: Number(innermost[1]), col: Number(innermost[2]) };
    const last = places[places.length - 1];
    if (last === undefined || last.module !== place.module || last.line !== place.line || last.col !== place.col) {
      places.push(place);
    }
  }
  return { message: oneLine(lines.join("\n")), assume, places };
}

/** The violated invariant's name (message 2110), or null. */
export function violated(run: TlcRun): string | null {
  const found = run.messages.find((message) => message.code === 2110);
  return found === undefined ? null : (/^Invariant (\S+) is violated\./.exec(found.text)?.[1] ?? null);
}

/** The states of the sequence TLC printed (messages 2217), in order,
 * each with its variables. */
export function traceOf(run: TlcRun): Record<string, Tla>[] {
  return run.messages
    .filter((message) => message.code === 2217)
    .map((message) => {
      const head = /^\d+: <[^>]*>\n/.exec(message.text);
      return parseState(head === null ? message.text : message.text.slice(head[0].length));
    });
}

/** The states TLC left on its queue (message 2199), whether it
 * reported its search complete (2193), and its own estimate of the
 * chance it missed a state. */
export type Stats = {
  left: number | null;
  complete: boolean;
  collision: string | null;
};

export function statsOf(run: TlcRun): Stats {
  const counts = run.messages.find((message) => message.code === 2199);
  const found =
    counts === undefined
      ? null
      : /^\d+ states generated, \d+ distinct states found, (\d+) states left on queue\./.exec(counts.text);
  const done = run.messages.find((message) => message.code === 2193);
  return {
    left: found === null ? null : Number(found[1]),
    complete: done !== undefined,
    collision: /calculated \(optimistic\):\s*val = (\S+)/.exec(done?.text ?? "")?.[1] ?? null,
  };
}

/** Whether a run of the model checker ended complete: by its exit
 * status and its messages, with no state left. */
export function completed(run: TlcRun): boolean {
  const stats = statsOf(run);
  return run.status === 0 && !run.timedOut && stats.complete && stats.left === 0;
}

/** What the module printed with PrintT, as values in the order
 * printed. */
export function printed(run: TlcRun): Tla[] {
  return parseTlaAll(run.user);
}

/** The states of a state dump, in the order TLC found them, each
 * with its variables. */
export function dumpStates(dump: string): Record<string, Tla>[] {
  const states: Record<string, Tla>[] = [];
  const re = /^State \d+:\n([\s\S]*?)(?=^State \d+:\n|(?![\s\S]))/gm;
  for (const found of dump.replace(/\r\n/g, "\n").matchAll(re)) states.push(parseState(found[1]));
  return states;
}

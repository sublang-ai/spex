// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-5, guards-13, guards-36), DR-244 and DR-252:
 * the process that causes events on one copy's code. `spex verify`
 * starts it with the copy as its working folder and the path of a job
 * file. It loads the binding's module from the copy and causes each
 * sequence of the job from a fresh start, writing the effects it
 * observed as it goes. It judges nothing: what an effect means is
 * said elsewhere. What the code prints takes no part in a result.
 *
 * Before the module loads, it asks Node to tell it of every module
 * resolved from then on, so a project file loaded from outside the
 * copy is seen and named. Everything this file needs is imported
 * above that point. Only modules resolved in this process's main
 * thread are seen: not those a worker thread loads, nor those of a
 * process the code starts.
 */

import * as nodeModule from "node:module";
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  GuardError,
  decodeFields,
  vocabulary,
  type Call,
  type Declaration,
  type EventDeclaration,
  type Fields,
} from "./types.js";

/** What the parent hands one copy's process. Everything in it was
 * loaded and checked by the parent, so the process reads no guard
 * file of its own. */
export type Job = {
  /** The project's root, as a real path. */
  root: string;
  /** The copy's folder, as a real path. */
  copy: string;
  /** Where the lines of the result are written. */
  result: string;
  /** The binding's module, relative to the copy, with `/`. */
  module: string;
  values: Record<string, readonly string[]>;
  events: Record<string, EventDeclaration>;
  /** The sequences to cause, each from a fresh start, in order. */
  sequences: Call[][];
};

/**
 * One line of the result. The process writes a line as soon as it
 * has one, so the sequences it caused to their end stand where it is
 * then stopped at the time limit or ends early; the effects of a
 * sequence it did not cause to its end are not written:
 * - `observed`: sequence `at` (from 0) was caused to its end and
 *   gave these effects, one for each of its events;
 * - `outside`: a project file was loaded from outside the copy;
 * - `ended`: a failing binding ended the process;
 * - `finished`: every sequence was caused.
 */
export type Line =
  | { kind: "observed"; at: number; effects: Fields[] }
  | { kind: "outside"; file: string }
  | { kind: "ended"; cause: string }
  | { kind: "finished" };

/** A failing binding (guards-36); its message is the cause. */
class Failing extends Error {}

function words(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0];
}

// ---------------------------------------------------------------
// Project files loaded from outside the copy (guards-13)
// ---------------------------------------------------------------

const outside: string[] = [];

function inside(folder: string, path: string): boolean {
  return path === folder || path.startsWith(folder + sep);
}

function watchModules(root: string, copy: string): void {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      if (resolved.url.startsWith("file:")) {
        let path = fileURLToPath(resolved.url);
        try {
          path = realpathSync(path);
        } catch {
          // A path that is not there fails on its own when loaded.
        }
        const mine = !inside(copy, path) && inside(root, path) && !path.split(sep).includes("node_modules");
        if (mine) outside.push(relative(root, path).split(sep).join("/"));
      }
      return resolved;
    },
  });
}

// ---------------------------------------------------------------
// The binding's module (guards-5, guards-36)
// ---------------------------------------------------------------

type Module = {
  start: () => unknown;
  events: Record<string, (state: unknown, params: unknown) => unknown>;
  stop?: (state: unknown) => unknown;
};

async function loadModule(job: Job): Promise<Module> {
  let loaded: Record<string, unknown>;
  try {
    loaded = (await import(pathToFileURL(join(job.copy, ...job.module.split("/"))).href)) as Record<string, unknown>;
  } catch (error) {
    throw new Failing(`binding.mjs does not load: ${words(error)}`);
  }
  if (typeof loaded.start !== "function") throw new Failing("binding.mjs exports no start function");
  const events = loaded.events;
  if (typeof events !== "object" || events === null) throw new Failing("binding.mjs exports no events");
  for (const event of Object.keys(job.events)) {
    if (!Object.hasOwn(events, event) || typeof (events as Record<string, unknown>)[event] !== "function") {
      throw new Failing(`binding.mjs exports no function for event ${event}`);
    }
  }
  if (loaded.stop !== undefined && typeof loaded.stop !== "function") {
    throw new Failing("binding.mjs exports a stop that is not a function");
  }
  return loaded as unknown as Module;
}

/** Cause one event and return its effect, read by its declared type. */
async function cause(binding: Module, declaration: Declaration, run: unknown, call: Call): Promise<Fields> {
  let observed: unknown;
  try {
    observed = await binding.events[call.event](run, structuredClone(call.params));
  } catch (error) {
    throw new Failing(`${call.event} threw: ${words(error)}`);
  }
  const declared = declaration.events[call.event].effect;
  // An event that declares no effect may return nothing.
  if (observed === undefined && Object.keys(declared).length === 0) observed = {};
  try {
    return decodeFields(declared, observed, declaration.vocabulary);
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    throw new Failing(`${call.event} returned what is not its declared effect: ${error.message}`);
  }
}

// ---------------------------------------------------------------
// The sequences
// ---------------------------------------------------------------

// A call that waits on something that never comes is stopped by the
// parent at the time limit; without this the process would just end.
const awake = setInterval(() => {}, 1 << 30);

const job = JSON.parse(readFileSync(process.argv[2], "utf8")) as Job;

function say(line: Line): void {
  appendFileSync(job.result, `${JSON.stringify(line)}\n`);
}

/** Tell of a project file loaded from outside the copy, once. */
function strayed(): boolean {
  if (outside.length === 0) return false;
  say({ kind: "outside", file: outside[0] });
  return true;
}

async function run(): Promise<void> {
  const declaration: Declaration = { vocabulary: vocabulary(job.values), events: job.events };
  try {
    watchModules(job.root, job.copy);
    const binding = await loadModule(job);
    if (strayed()) return;
    for (const [index, sequence] of job.sequences.entries()) {
      const effects: Fields[] = [];
      let state: unknown;
      try {
        state = await binding.start();
      } catch (error) {
        throw new Failing(`start threw: ${words(error)}`);
      }
      // The sequence's own failure comes before `stop`'s.
      let failure: unknown;
      try {
        for (const call of sequence) effects.push(await cause(binding, declaration, state, call));
      } catch (error) {
        failure = error;
      }
      try {
        await binding.stop?.(state);
      } catch (error) {
        failure ??= new Failing(`stop threw: ${words(error)}`);
      }
      if (failure !== undefined) throw failure;
      if (strayed()) return;
      say({ kind: "observed", at: index, effects });
    }
    say({ kind: "finished" });
  } catch (error) {
    if (!(error instanceof Failing)) throw error;
    if (!strayed()) say({ kind: "ended", cause: error.message });
  }
}

await run();
clearInterval(awake);
process.exit(0);

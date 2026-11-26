// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-5, guards-13, guards-21, guards-22,
 * guards-36), DR-252:
 * the process that runs one copy's checks. `spex verify` starts it
 * with the copy as its working folder and the path of a job file. It
 * loads the binding's module from the copy, runs the permitted
 * examples and the sampled check through it, and writes what it found
 * to a file. What the code prints takes no part in a result.
 *
 * Before the module loads, it asks Node to tell it of every module
 * resolved from then on, so a project file loaded from outside the
 * copy is seen and named. Everything this file needs is imported
 * above that point. Only modules resolved in this process's main
 * thread are seen: not those a worker thread loads, nor those of a
 * process the code starts.
 */

import * as nodeModule from "node:module";
import { readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fc from "fast-check";
import type { Sample } from "./files.js";
import { parseReading, walkSequence, type Reading, type Walk, type WalkStep } from "./reading.js";
import {
  GuardError,
  decodeFields,
  differences,
  vocabulary,
  type Call,
  type Declaration,
  type EventDeclaration,
  type Example,
  type Type,
  type Value,
  type Vocabulary,
} from "./types.js";

/** What the parent hands one copy's process. Everything in it was
 * loaded and checked by the parent, so the process reads no guard
 * file of its own. */
export type Job = {
  /** The project's root, as a real path. */
  root: string;
  /** The copy's folder, as a real path. */
  copy: string;
  /** Where the result is written. */
  result: string;
  /** The binding's module, relative to the copy, with `/`. */
  module: string;
  values: Record<string, readonly string[]>;
  events: Record<string, EventDeclaration>;
  readings: { name: string; file: string; text: string }[];
  examples: Example[];
  sample: Sample;
  /** Run the permitted examples before the sampled check. False for
   * a kept fault's copy. */
  examplesOnCode: boolean;
};

/** What ended the checks early. */
export type Ended = { kind: "binding" | "reading"; cause: string };

/** One permitted example run on the code. */
export type ExampleRun = {
  item: string;
  steps: WalkStep[];
  /** The step every reading forbids, by its place in `steps`. */
  violation: number | null;
  /** The first step the readings differ on. */
  undecided: number | null;
  /** Under every reading, the assertion applied at some step. */
  applied: boolean;
  /** Stated effect fields the code did not produce; `step` counts
   * from 1. */
  differences: { step: number; field: string; stated: Value; observed: Value }[];
};

/** A sequence of the sampled check worth showing; `sequence` counts
 * from 1. */
export type Shown = { sequence: number; steps: WalkStep[] };

/** What the sampled check found. The counts are exact only where
 * there is no violation. */
export type Sampled = {
  ran: number;
  applied: number;
  events: Record<string, { caused: number; skipped: number }>;
  violation: (Shown & { shrinks: number }) | null;
  undecidedEvent: Shown | null;
  undecidedStep: Shown | null;
};

/** What one copy's process found. */
export type RunnerResult = {
  /** The first project file loaded from outside the copy, relative to
   * the root. */
  outside: string | null;
  ended: Ended | null;
  examples: ExampleRun[];
  sampled: Sampled | null;
};

/** The most members drawn for a set of whole numbers. */
const MOST_NUMBERS = 32;

/** A failing binding (guards-36). */
class Failing extends Error {}

function words(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0];
}

// ---------------------------------------------------------------
// Project files loaded from outside the copy (guards-13)
// ---------------------------------------------------------------

const outside: string[] = [];

function within(folder: string, path: string): boolean {
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
        const mine = !within(copy, path) && within(root, path) && !path.split(sep).includes("node_modules");
        if (mine) outside.push(relative(root, path).split(sep).join("/"));
      }
      return resolved;
    },
  });
}

// ---------------------------------------------------------------
// Drawing sequences (guards-22)
// ---------------------------------------------------------------

function draw(type: Type, vocab: Vocabulary): fc.Arbitrary<Value> {
  switch (type.kind) {
    case "bool":
      return fc.boolean();
    case "int":
      return fc.integer({ min: type.min, max: type.max });
    case "value":
      return fc.constantFrom<Value>(...vocab.sets[type.set]);
    case "set": {
      const of = type.of;
      if (of.kind === "value") {
        // A subarray keeps the declared order.
        return fc.subarray<Value>([...vocab.sets[of.set]], { minLength: 0 });
      }
      if (of.kind !== "int") throw new GuardError(`a set of ${of.kind} cannot be drawn`);
      return fc
        .uniqueArray(fc.integer({ min: of.min, max: of.max }), {
          minLength: 0,
          maxLength: Math.min(of.max - of.min + 1, MOST_NUMBERS),
          size: "max",
        })
        .map((members) => [...members].sort((a, b) => a - b));
    }
    case "map": {
      const fields: Record<string, fc.Arbitrary<Value>> = {};
      for (const key of vocab.sets[type.key]) fields[key] = draw(type.to, vocab);
      return fc.record(fields);
    }
    case "optional":
      return fc.option(draw(type.of, vocab), { nil: null });
  }
}

type Drawn = [{ example: number; keep: number }, Call[]];

/** Every parameter is given, so nothing a binding's module sets for
 * fast-check as a whole reaches this check. */
function checkParameters(sample: Sample): fc.Parameters<[Drawn]> {
  return {
    seed: sample.seed,
    randomType: "xorshift128plus",
    numRuns: sample.sequences,
    maxSkipsPerRun: 100,
    timeout: undefined,
    skipAllAfterTimeLimit: undefined,
    interruptAfterTimeLimit: undefined,
    markInterruptAsFailure: false,
    skipEqualValues: false,
    ignoreEqualValues: false,
    path: "",
    unbiased: false,
    verbose: 0,
    examples: [],
    endOnFailure: false,
    reporter: undefined,
    asyncReporter: undefined,
    includeErrorInReport: false,
    noDefaultPlugins: false,
    noGlobalPlugins: true,
    plugins: [],
  };
}

// ---------------------------------------------------------------
// The checks
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
  const events = (loaded.events ?? {}) as Record<string, unknown>;
  if (typeof events !== "object") throw new Failing("binding.mjs exports no events");
  for (const event of Object.keys(job.events)) {
    if (typeof events[event] !== "function") {
      throw new Failing(`binding.mjs exports no function for event ${event}`);
    }
  }
  if (loaded.stop !== undefined && typeof loaded.stop !== "function") {
    throw new Failing("binding.mjs exports a stop that is not a function");
  }
  return loaded as unknown as Module;
}

async function check(job: Job): Promise<RunnerResult> {
  const result: RunnerResult = { outside: null, ended: null, examples: [], sampled: null };
  const vocab = vocabulary(job.values);
  const declaration: Declaration = { vocabulary: vocab, events: job.events };
  const readings: Reading[] = job.readings.map((reading) =>
    parseReading(reading.text, reading.name, reading.file, declaration),
  );
  const permitted = job.examples.filter((example) => example.kind === "permitted");

  watchModules(job.root, job.copy);
  const binding = await loadModule(job);
  if (outside.length > 0) return { ...result, outside: outside[0] };

  /** Run one sequence from a fresh start, calling `stop` however it
   * ends. */
  const run = async (sequence: readonly Call[], example: boolean): Promise<Walk> => {
    let state: unknown;
    try {
      state = await binding.start();
    } catch (error) {
      throw new Failing(`start threw: ${words(error)}`);
    }
    let walk: Walk | undefined;
    let failure: Error | undefined;
    try {
      walk = await walkSequence(
        readings,
        sequence,
        async (call) => {
          let observed: unknown;
          try {
            observed = await binding.events[call.event](state, structuredClone(call.params));
          } catch (error) {
            throw new Failing(`${call.event} threw: ${words(error)}`);
          }
          const declared = job.events[call.event].effect;
          // An event that declares no effect may return nothing.
          if (observed === undefined && Object.keys(declared).length === 0) observed = {};
          try {
            return decodeFields(declared, observed, vocab);
          } catch (error) {
            if (!(error instanceof GuardError)) throw error;
            throw new Failing(`${call.event} returned what is not its declared effect: ${error.message}`);
          }
        },
        { example },
      );
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    }
    try {
      await binding.stop?.(state);
    } catch (error) {
      failure ??= new Failing(`stop threw: ${words(error)}`);
    }
    if (failure !== undefined) throw failure;
    return walk as Walk;
  };

  /** Run `work`; a failing binding ends the checks and is noted. */
  const guarded = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof Failing)) throw error;
      result.ended ??= { kind: "binding", cause: error.message };
      return undefined;
    }
  };
  const stoppedBy = (walk: Walk): boolean => {
    if (walk.stopped === null) return false;
    result.ended ??= { kind: "reading", cause: walk.stopped.cause };
    return true;
  };

  // The permitted examples on the code (guards-21).
  if (job.examplesOnCode) {
    for (const example of permitted) {
      const walk = await guarded(() => run(example.steps, true));
      if (walk === undefined || stoppedBy(walk)) return finish(result);
      const found: ExampleRun = {
        item: example.item,
        steps: walk.steps,
        violation: walk.violation,
        undecided: walk.undecided[0] ?? null,
        applied: walk.applied,
        differences: [],
      };
      walk.steps.forEach((step, index) => {
        if (step.effect === null) return;
        for (const difference of differences(example.steps[index].effect, step.effect)) {
          found.differences.push({ step: index + 1, ...difference });
        }
      });
      result.examples.push(found);
      if (walk.violation !== null) return finish(result);
    }
  }

  // The sampled check (guards-22).
  const sampled: Sampled = {
    ran: 0,
    applied: 0,
    events: Object.fromEntries(Object.keys(job.events).map((event) => [event, { caused: 0, skipped: 0 }])),
    violation: null,
    undecidedEvent: null,
    undecidedStep: null,
  };
  result.sampled = sampled;

  const start = fc.oneof(
    ...permitted.map((example, index) =>
      fc.record({ example: fc.constant(index), keep: fc.nat({ max: example.steps.length }) }),
    ),
  );
  const event = fc.oneof(
    ...Object.entries(job.events).map(([name, declared]) => {
      const params: Record<string, fc.Arbitrary<Value>> = {};
      for (const [param, type] of Object.entries(declared.params)) params[param] = draw(type, vocab);
      return fc.record({ event: fc.constant(name), params: fc.record(params) });
    }),
  );
  const drawn = fc.tuple(start, fc.array(event, { minLength: 0, maxLength: job.sample.events, size: "max" }));
  const sequenceOf = ([from, generated]: Drawn): Call[] =>
    [
      ...permitted[from.example].steps.slice(0, from.keep).map((step) => ({ event: step.event, params: step.params })),
      ...generated,
    ].slice(0, job.sample.events);

  let crash: unknown;
  let crashed = false;
  let executions = 0;
  const property = fc.asyncProperty(drawn, async (value: Drawn) => {
    // Only a violation fails a sequence, so only a violation is shrunk.
    if (result.ended !== null || crashed) return true;
    executions += 1;
    let walk: Walk | undefined;
    try {
      walk = await guarded(() => run(sequenceOf(value), false));
    } catch (error) {
      crash = error;
      crashed = true;
      return true;
    }
    if (walk === undefined || stoppedBy(walk)) return true;
    if (walk.violation !== null) return false;
    if (walk.applied) sampled.applied += 1;
    for (const [index, step] of walk.steps.entries()) {
      if (step.caused) sampled.events[step.call.event].caused += 1;
      else if (step.legal === "none") sampled.events[step.call.event].skipped += 1;
      if (!walk.undecided.includes(index)) continue;
      const shown = { sequence: executions, steps: walk.steps.slice(0, index + 1) };
      if (step.caused) sampled.undecidedStep ??= shown;
      else sampled.undecidedEvent ??= shown;
    }
    return true;
  });
  const details = await fc.check(property, checkParameters(job.sample));
  if (crashed) throw crash;
  sampled.ran = details.numRuns;

  if (details.failed && details.counterexample !== null) {
    // Run the shrunk sequence once more to observe its effects.
    const walk = await guarded(() => run(sequenceOf(details.counterexample![0]), false));
    if (walk !== undefined && !stoppedBy(walk)) {
      if (walk.violation !== null) {
        sampled.violation = { sequence: details.numRuns, shrinks: details.numShrinks, steps: walk.steps };
      } else {
        result.ended ??= {
          kind: "binding",
          cause:
            "a sequence broke the assertion and did not when run again, so the binding does not control everything the code depends on",
        };
      }
    }
  } else if (details.failed && result.ended === null) {
    throw new Error("the sampled check ended without a result");
  }
  return finish(result);
}

function finish(result: RunnerResult): RunnerResult {
  if (outside.length > 0) result.outside = outside[0];
  return result;
}

// A check that waits on something that never comes is stopped by the
// parent at the time limit; without this the process would just end.
const awake = setInterval(() => {}, 1 << 30);

const job = JSON.parse(readFileSync(process.argv[2], "utf8")) as Job;
let found: RunnerResult;
try {
  found = await check(job);
} catch (error) {
  if (!(error instanceof Failing)) throw error;
  found = finish({ outside: null, ended: { kind: "binding", cause: error.message }, examples: [], sampled: null });
}
writeFileSync(`${job.result}.part`, JSON.stringify(found));
renameSync(`${job.result}.part`, job.result);
clearInterval(awake);
process.exit(0);

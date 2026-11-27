// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-244 and DR-252: the runs of TLC for one guard
 * (guards-40) and what `--keep` leaves of them (guards-41). Each
 * check writes one of Spex's own TLA+ files beside the declaration in
 * TLA+ and the translations, runs TLC once on it and reads what TLC
 * printed: a translation alone (guards-42), the cases under each
 * translation (guards-20), the translations against each other
 * (guards-39), the model against the rule (guards-38), and the
 * effects the code gave (guards-22). Spex evaluates no TLA+ here and
 * answers none of the four questions: it compares printed values for
 * equality and puts TLC's answers into words.
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { declarationModule } from "./declaration.js";
import type { Guard } from "./files.js";
import {
  CASES_MODULE,
  COMPARE_CFG,
  COMPARE_MODULE,
  EVALUATE_CFG,
  FORM_MODULE,
  JUDGE_MODULE,
  MODEL_CFG,
  MODEL_MODULE,
  casesModule,
  compareModule,
  formModule,
  judgeModule,
  modelModule,
  type Observation,
} from "./harness.js";
import {
  callFromTla,
  fieldsFromTla,
  key,
  showTla,
  type Tla,
} from "./tla.js";
import {
  completed,
  dumpStates,
  evalFault,
  javaWords,
  loadedModules,
  parseFaults,
  pastStart,
  printed,
  runTlc,
  statsOf,
  TLC_PIN,
  traceOf,
  versionOf,
  violated,
  type EvalFault,
  type TlcRun,
  type Tools,
} from "./tlc.js";
import { MAY_LOAD, formFaults, type Translation } from "./translation.js";
import {
  GuardError,
  compareFields,
  showFields,
  type Call,
  type Case,
  type Declaration,
  type Fields,
} from "./types.js";

/** `1 second`, `300 seconds`. */
export function seconds(count: number): string {
  return `${count} ${count === 1 ? "second" : "seconds"}`;
}

// ---------------------------------------------------------------
// Where TLC runs
// ---------------------------------------------------------------

/** What every run of TLC for one guard shares. */
export type Shop = {
  tools: Tools;
  guard: Guard;
  /** A fresh folder under the OS temp folder; each run of TLC gets a
   * folder of its own in it. */
  home: string;
  /** Where every generated file is left, or null: `<folder>/<guard>`
   * of `spex verify --keep <folder>`. */
  keep: string | null;
  /** TLC's version, set by its first run. */
  version: { tlc: string | null };
};

/** The first line of the file that marks a folder `--keep` wrote. */
export const KEPT_MARK = "Kept by spex verify.";

/** The name of that file in `<folder>/<guard>`. */
export const KEPT_FILE = "spex-verify.txt";

/** A word of a command line as a POSIX shell takes it. */
export function quoted(word: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

/**
 * Run TLC once for `shop.guard`: a fresh folder named `name` holding
 * the declaration in TLA+, the given translations and `files`, TLC
 * run on `module` there, and the folder removed. With `--keep` the
 * folder's files are left under that name, with the command line.
 */
async function tlc(
  shop: Shop,
  name: string,
  module: string,
  translations: readonly Translation[],
  files: Record<string, string>,
  dump = false,
): Promise<TlcRun> {
  const { guard } = shop;
  const folder = join(shop.home, name);
  mkdirSync(folder);
  try {
    const all: Record<string, string> = {
      "Declaration.tla": declarationModule(guard.binding, guard.binding.name),
      ...files,
    };
    for (const translation of translations) all[`${translation.name}.tla`] = translation.text;
    for (const [file, text] of Object.entries(all)) writeFileSync(join(folder, file), text);
    const run = await runTlc(shop.tools, folder, module, { dump, seconds: guard.limits.seconds });
    shop.version.tlc ??= versionOf(run);
    if (shop.keep !== null) {
      const kept = join(shop.keep, name);
      rmSync(join(folder, "java-tmp"), { recursive: true, force: true });
      rmSync(join(folder, "states"), { recursive: true, force: true });
      mkdirSync(join(folder, "java-tmp"));
      writeFileSync(
        join(folder, "command.txt"),
        [
          "# Run in this folder, with java-tmp empty and no states folder,",
          "# and without JAVA_TOOL_OPTIONS, _JAVA_OPTIONS and JDK_JAVA_OPTIONS.",
          run.command.map(quoted).join(" "),
          "",
        ].join("\n"),
      );
      cpSync(folder, kept, { recursive: true });
    }
    if (run.failed !== null) throw new GuardError(`TLC could not start: ${run.failed}`);
    // TLC's first message is its version: without it Java never ran
    // TLC, and no translation is at fault.
    if (!run.timedOut && versionOf(run) === null) throw new GuardError(javaFault(shop.tools, run));
    return run;
  } finally {
    rmSync(folder, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

/** That Java ended without running TLC: its status, its own words,
 * and what to set where the jar is not the pinned one. */
function javaFault(tools: Tools, run: TlcRun): string {
  const ended = run.status === null ? "was ended" : `ended with status ${run.status}`;
  const said = javaWords(run.errors);
  const jar = tools.pinned
    ? ""
    : ` \u2014 SPEX_TLC_JAR names ${tools.jar}, which is not the pinned tla2tools.jar: set it to a tla2tools.jar, or unset it for Spex to download TLC ${TLC_PIN.version}`;
  return `Java ${ended} before TLC started${said === "" ? "" : `: ${said}`}${jar}`;
}

/** Prepare `<folder>/<guard>` of `--keep`: an empty folder with its
 * mark. One that stands without the mark is not Spex's to replace. */
export function prepareKeep(keep: string, guard: string): string {
  const folder = join(keep, guard);
  if (existsSync(folder)) {
    if (!existsSync(join(folder, KEPT_FILE))) {
      throw new GuardError(`--keep: ${folder} was not kept by spex verify — remove it, or name another folder`);
    }
    rmSync(folder, { recursive: true, force: true });
  }
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, KEPT_FILE),
    [
      KEPT_MARK,
      `The files spex verify generated for the guard ${guard}, one folder for each run of TLC.`,
      "Each folder's command.txt holds the command line TLC was run with there.",
      "",
    ].join("\n"),
  );
  return folder;
}

// ---------------------------------------------------------------
// What a check hands back
// ---------------------------------------------------------------

/** One step as a report shows it: the event with its params, and an
 * effect in words, or null where none is shown. */
export type Shown = { call: Call; effect: string | null };

/** Why a guard cannot be checked: the cause, and where TLC met it. */
export type Cannot = { cause: string; note: string | null; steps: Shown[] };

/** An effect in words: its fields where it is a declared effect of
 * the event, else the value as TLC gave it. */
function effectWords(declaration: Declaration, event: string, effect: Tla): string {
  const fields = fieldsFromTla(declaration.events[event].effect, effect, declaration);
  return fields === null ? showTla(effect) : showFields(fields);
}

/** An event TLC printed, which is always a declared one. */
function callOf(declaration: Declaration, event: Tla): Call {
  const call = callFromTla(event, declaration);
  if (call === null) throw new GuardError(`TLC printed an event the declaration does not hold: ${showTla(event)}`);
  return call;
}

function fieldOf(value: Tla | undefined, name: string): Tla | undefined {
  return typeof value === "object" && "r" in value ? value.r[name] : undefined;
}

/** A printed step `[event |-> …, effect |-> …]` as shown. */
function shownStep(declaration: Declaration, step: Tla): Shown {
  const call = callOf(declaration, fieldOf(step, "event") ?? "");
  const effect = fieldOf(step, "effect");
  return { call, effect: effect === undefined ? null : effectWords(declaration, call.event, effect) };
}

/** A translation's file with the place TLC names in it, where it
 * names one: `<file>:<line>:<col>`. */
function placed(translation: Translation, fault: EvalFault): string {
  for (let at = fault.places.length - 1; at >= 0; at -= 1) {
    const place = fault.places[at];
    if (place.module === translation.name) return `${translation.file}:${place.line}:${place.col}`;
  }
  return translation.file;
}

/** The translation TLC was in when it could not go on: the one its
 * innermost place names, else `fallback`. */
function blamed(translations: readonly Translation[], fault: EvalFault, fallback: Translation | null): Translation | null {
  for (let at = fault.places.length - 1; at >= 0; at -= 1) {
    const found = translations.find((translation) => translation.name === fault.places[at].module);
    if (found !== undefined) return found;
  }
  return fallback;
}

/** How a run ended that neither finished nor was stopped at the time
 * limit: TLC's own words where it gave some, else Java's. */
function unexpected(run: TlcRun, doing: string): GuardError {
  const said = evalFault(run)?.message ?? parseFaults(run)[0]?.message ?? javaWords(run.errors);
  const status = run.status === null ? "was ended" : `ended with status ${run.status}`;
  return new GuardError(`TLC ${status} ${doing}${said === "" ? "" : `: ${said}`}`);
}

/** How many values a run printed before it ended, or -1 where what
 * it printed cannot be read. */
function printedSoFar(run: TlcRun): number {
  try {
    return printed(run).length;
  } catch (error) {
    if (error instanceof GuardError) return -1;
    throw error;
  }
}

/** That TLC was stopped at the time limit. */
function stopped(shop: Shop): string {
  return `TLC was stopped after ${seconds(shop.guard.limits.seconds)}`;
}

// ---------------------------------------------------------------
// 0. Form (guards-42)
// ---------------------------------------------------------------

/**
 * Check one translation alone: its form by its text, then TLC parses
 * it and reports what it loads. Returns each fault as
 * `<file>[:<line>:<col>]: <what>`; none where its form holds.
 */
export async function checkForm(shop: Shop, translation: Translation): Promise<string[]> {
  const { file, name } = translation;
  const at = (line: number | null, col: number | null): string =>
    line === null ? file : `${file}:${line}:${col ?? 1}`;
  const faults = formFaults(translation);
  if (faults.length > 0) return faults.map((fault) => `${at(fault.line, fault.col)}: ${fault.message}`);

  const run = await tlc(shop, `form-${name}`, FORM_MODULE, [translation], {
    [`${FORM_MODULE}.tla`]: formModule(name),
    [`${FORM_MODULE}.cfg`]: EVALUATE_CFG,
  });
  if (run.timedOut) return [`${file}: ${stopped(shop)} while it read the file`];
  if (run.status === 150) {
    const said = parseFaults(run);
    if (said.length === 0) throw unexpected(run, `reading ${file}`);
    return said.map((fault) => {
      if (fault.module === name) return `${at(fault.line, fault.col)}: ${fault.message}`;
      if (fault.module === "Declaration") {
        return `${shop.guard.binding.folder}/binding.yaml: the declaration in TLA+ does not parse: ${fault.message}`;
      }
      return `${file}: ${fault.message}`;
    });
  }
  if (!completed(run)) throw unexpected(run, `reading ${file}`);
  const allowed = new Set([FORM_MODULE, name, ...MAY_LOAD]);
  const stray = loadedModules(run).filter((module) => !allowed.has(module));
  return stray.map(
    (module) => `${file}: it loads the module ${module}; a translation loads only ${MAY_LOAD.join(", ")}`,
  );
}

// ---------------------------------------------------------------
// 1. Cases, without the code (guards-20)
// ---------------------------------------------------------------

/** A case a translation does not allow or forbid as marked; `case`
 * is null where the rule applies in no permitted case. */
export type CaseFailure = {
  case: string | null;
  kind: Case["kind"] | null;
  translation: string;
  /** What was found, in words. */
  found: string;
};

export type CasesCheck =
  | { kind: "done"; failures: CaseFailure[] }
  | { kind: "stopped"; cause: string }
  | { kind: "cannot"; cannot: Cannot[] };

/** A case's steps as shown: each with the effect fields it states. */
function caseSteps(entry: Case, upTo = entry.steps.length): Shown[] {
  return entry.steps.slice(0, upTo).map((step) => ({
    call: { event: step.event, params: step.params },
    effect: Object.keys(step.effect).length === 0 ? null : showFields(step.effect),
  }));
}

function inCase(entry: Case): string {
  return `TLC met it in the ${entry.kind} case "${entry.label}"`;
}

/**
 * Evaluate each case under each translation in one run of TLC. A
 * translation allows a permitted case where every step is legal, its
 * model gives each effect field the step states and no step is
 * forbidden. It forbids a forbidden case where the steps before the
 * last go so and, at the last, the rule applies and forbids every
 * declared effect that is as the step states.
 */
export async function checkCases(shop: Shop): Promise<CasesCheck> {
  const { guard } = shop;
  const { translations, cases, binding } = guard;
  const names = translations.map((translation) => translation.name);
  const built = casesModule(names, cases);
  const run = await tlc(shop, "cases", CASES_MODULE, translations, {
    [`${CASES_MODULE}.tla`]: built.text,
    [`${CASES_MODULE}.cfg`]: EVALUATE_CFG,
  });
  if (run.timedOut) return { kind: "stopped", cause: `${stopped(shop)} while it evaluated the cases` };
  const fault = run.status === 0 ? null : evalFault(run);
  if (fault !== null) {
    // The line TLC could not evaluate is the one it names, else the
    // one after the last whose value it printed.
    const assumed = fault.assume === null ? [...built.assumes.values()][printedSoFar(run)] : built.assumes.get(fault.assume);
    if (assumed === undefined) throw unexpected(run, "evaluating the cases");
    const translation = translations.find((one) => one.name === assumed.translation) as Translation;
    const entry = assumed.case === null ? null : cases[assumed.case - 1];
    return {
      kind: "cannot",
      cannot: [
        {
          cause: `${placed(translation, fault)}: ${fault.message}`,
          note: entry === null ? "TLC met it in the cases" : inCase(entry),
          steps: entry === null ? [] : caseSteps(entry),
        },
      ],
    };
  }
  if (run.status !== 0) throw unexpected(run, "evaluating the cases");

  const failures: CaseFailure[] = [];
  const cannot: Cannot[] = [];
  const answers = printed(run);
  if (answers.length !== names.length * (cases.length + 1)) throw unexpected(run, "evaluating the cases");
  for (const answer of answers) {
    const [what, name, third, fourth] = typeof answer === "object" && "t" in answer ? answer.t : [];
    const translation = translations.find((one) => one.name === name);
    if (translation === undefined) throw unexpected(run, "evaluating the cases");
    if (what === "applied") {
      if (third !== true) {
        failures.push({
          case: null,
          kind: null,
          translation: translation.name,
          found: `translation ${translation.name}: the rule applies at no step of a permitted case`,
        });
      }
      continue;
    }
    const entry = cases[(third as number) - 1];
    if (what !== "case" || entry === undefined) throw unexpected(run, "evaluating the cases");
    if (fieldOf(fourth, "pass") === true) continue;
    const step = fieldOf(fourth, "step") as number;
    const why = fieldOf(fourth, "why");
    const event = entry.steps[step - 1].event;
    const effect = fieldOf(fourth, "effect");
    const gives = effect === undefined ? "" : effectWords(binding, event, effect);
    const fail = (found: string): void => {
      failures.push({ case: entry.label, kind: entry.kind, translation: translation.name, found });
    };
    switch (why) {
      case "effect not declared":
        cannot.push({
          cause: `${translation.file}: the model gives ${event} an effect the declaration does not hold: ${gives}`,
          note: `${inCase(entry)}, at step ${step}`,
          steps: caseSteps(entry, step),
        });
        break;
      case "not legal":
        fail(`step ${step} is not legal`);
        break;
      case "rule does not apply":
        fail(`the rule does not apply at step ${step}`);
        break;
      case "effect differs":
        fail(`at step ${step} the model gives ${gives}`);
        break;
      case "forbidden":
        fail(`step ${step} is forbidden: the model gives ${gives}`);
        break;
      case "not forbidden": {
        const open = fieldOf(fourth, "allowed");
        const allowed = (typeof open === "object" && "s" in open ? open.s : [])
          .map((one) => fieldsFromTla(binding.events[event].effect, one, binding))
          .filter((one): one is Fields => one !== null)
          .sort((a, b) => compareFields(binding.events[event].effect, a, b, binding.vocabulary));
        const more = allowed.length > 1 ? ` and ${allowed.length - 1} more` : "";
        fail(`step ${step} is not forbidden: the rule allows ${allowed.length === 0 ? "it" : showFields(allowed[0])}${more}`);
        break;
      }
      default:
        fail(`step ${step}: ${typeof why === "string" ? why : "not as marked"}`);
    }
  }
  return cannot.length > 0 ? { kind: "cannot", cannot } : { kind: "done", failures };
}

// ---------------------------------------------------------------
// 2. Translations against each other (guards-39)
// ---------------------------------------------------------------

/** How a guard's translations compare. A difference is the
 * distinguishing sequence: steps every translation agrees on, then
 * the step `last` and the one question it puts, with each
 * translation's answer in name order. */
export type Comparison =
  | { kind: "agreement" }
  | {
      kind: "differ";
      about: "legal" | "effect" | "applies" | "forbidden";
      steps: Shown[];
      last: Call;
      /** The effect the question is about, for `forbidden`, and the
       * model's effect at that step, on which the translations agree. */
      effect: string | null;
      model: string | null;
      answers: { translation: string; answer: string }[];
    }
  | { kind: "not compared"; cause: string };

export type CompareCheck = Comparison | { kind: "cannot"; cannot: Cannot[] };

/** The steps of a printed sequence: every state whose `step` holds
 * one, in order. */
function traceSteps(declaration: Declaration, run: TlcRun): Shown[] {
  return traceOf(run)
    .map((state) => state.step)
    .filter((step) => typeof step === "object" && "r" in step)
    .map((step) => shownStep(declaration, step));
}

/** TLC could not evaluate a translation while it checked a model. */
function cannotEvaluate(
  shop: Shop,
  run: TlcRun,
  translations: readonly Translation[],
  fallback: Translation | null,
  where: string,
  doing: string,
): Cannot {
  const fault = evalFault(run);
  if (fault === null) throw unexpected(run, doing);
  const translation = blamed(translations, fault, fallback);
  const steps = traceSteps(shop.guard.binding, run);
  // TLC prints no sequence for some faults: it met such a one at the
  // start only where it had not yet computed the model's start.
  const at =
    steps.length > 0 ? ", after this sequence" : traceOf(run).length > 0 || !pastStart(run) ? ", at the start" : "";
  return {
    cause: `${translation === null ? "a translation" : placed(translation, fault)}: ${fault.message}`,
    note: `TLC met it ${where}${at}`,
    steps,
  };
}

/**
 * Model-check the translations side by side in one run of TLC: at
 * every step any of them reaches they give the same answers to the
 * four questions.
 * TLC's shortest sequence to a difference is the distinguishing
 * sequence.
 */
export async function compareTranslations(shop: Shop): Promise<CompareCheck> {
  const { guard } = shop;
  const { translations, binding } = guard;
  const names = translations.map((translation) => translation.name);
  const run = await tlc(shop, "compare", COMPARE_MODULE, translations, {
    [`${COMPARE_MODULE}.tla`]: compareModule(names),
    [`${COMPARE_MODULE}.cfg`]: COMPARE_CFG,
  });
  if (run.timedOut) return { kind: "not compared", cause: stopped(shop) };
  if (completed(run)) return { kind: "agreement" };
  if (run.status === 12 && violated(run) === "Agree") {
    const trace = traceOf(run);
    const diff = trace[trace.length - 1]?.diff;
    const about = fieldOf(diff, "on");
    const answers = fieldOf(diff, "answers");
    const last = callOf(binding, fieldOf(diff, "event") ?? "");
    const steps = traceSteps(binding, run);
    const yesNo = (value: Tla | undefined): string => (value === true ? "yes" : "no");
    const byName = (record: Tla | undefined, words: (value: Tla | undefined) => string) =>
      names.map((name) => ({ translation: name, answer: words(fieldOf(record, name)) }));
    const words = (value: Tla | undefined): string => (value === undefined ? "" : effectWords(binding, last.event, value));
    if (about === "undeclared") {
      // TLC says which translations' effects the declaration does not hold.
      const declared = fieldOf(diff, "declared");
      const cannot = translations
        .filter((translation) => fieldOf(declared, translation.name) === false)
        .map((translation) => ({
          cause: `${translation.file}: the model gives ${last.event} an effect the declaration does not hold: ${words(fieldOf(answers, translation.name))}`,
          note: `TLC met it comparing the translations, at step ${steps.length + 1} of this sequence`,
          steps: [...steps, { call: last, effect: null }],
        }));
      if (cannot.length === 0) throw unexpected(run, "comparing the translations");
      return { kind: "cannot", cannot };
    }
    if (about === "legal" || about === "applies") {
      return { kind: "differ", about, steps, last, effect: null, model: null, answers: byName(answers, yesNo) };
    }
    if (about === "effect") {
      return { kind: "differ", about, steps, last, effect: null, model: null, answers: byName(answers, words) };
    }
    if (about === "forbidden" && typeof answers === "object" && "f" in answers) {
      // The question is about the model's effect where the translations
      // differ on it, else about the first such effect in declared order.
      const declared = binding.events[last.event].effect;
      const model = key(fieldOf(diff, "model") ?? "");
      const split = answers.f
        .map(([effect, said]) => ({ effect, said, fields: fieldsFromTla(declared, effect, binding) }))
        .sort((a, b) =>
          a.fields === null || b.fields === null ? 0 : compareFields(declared, a.fields, b.fields, binding.vocabulary),
        );
      const asked = split.find((one) => key(one.effect) === model) ?? split[0];
      return {
        kind: "differ",
        about,
        steps,
        last,
        effect: effectWords(binding, last.event, asked.effect),
        model: words(fieldOf(diff, "model")),
        answers: byName(asked.said, yesNo),
      };
    }
    throw unexpected(run, "comparing the translations");
  }
  if (run.status !== 0 && evalFault(run) !== null) {
    return {
      kind: "cannot",
      cannot: [cannotEvaluate(shop, run, translations, null, "comparing the translations", "comparing the translations")],
    };
  }
  throw unexpected(run, "comparing the translations");
}

// ---------------------------------------------------------------
// 3. On the model (guards-38)
// ---------------------------------------------------------------

/** One step of the model: a legal event in one state of the model,
 * with the model's effect, the state after it and whether the rule
 * applies. A state is held by the one text of its printed value. */
export type Row = { from: string; call: Call; effect: Fields; next: string; applies: boolean };

/** TLC's table of the model's steps, in TLC's order, and a shortest
 * sequence of steps from the start to each state the model reaches. */
export type Table = { start: string; rows: Row[]; paths: Map<string, Row[]> };

export type ModelCheck =
  | {
      kind: "checked";
      table: Table;
      /** The steps at which the rule applies. */
      applied: number;
      /** TLC's own estimate of the chance it missed a state. */
      collision: string | null;
    }
  | { kind: "conflict"; steps: Shown[]; last: Call; effect: string }
  | { kind: "not checked"; cause: string }
  | { kind: "cannot"; cannot: Cannot[] };

/**
 * TLC's table from its state dump: every dumped state whose `step`
 * holds a step of the model is one row. The paths are found by
 * walking the table breadth first from the start, ties in TLC's
 * order.
 */
export function tableOf(declaration: Declaration, states: readonly Record<string, Tla>[]): Table {
  if (states.length === 0) throw new GuardError("TLC wrote no state of the model");
  const start = key(states[0].state);
  const rows: Row[] = [];
  for (const state of states) {
    const step = state.step;
    if (typeof step !== "object" || !("r" in step)) continue;
    const call = callOf(declaration, step.r.event);
    const effect = fieldsFromTla(declaration.events[call.event].effect, step.r.effect, declaration);
    if (effect === null || typeof step.r.applies !== "boolean") {
      throw new GuardError("TLC wrote a step of the model that cannot be read");
    }
    rows.push({ from: key(step.r.from), call, effect, next: key(step.r.next), applies: step.r.applies });
  }
  const from = new Map<string, Row[]>();
  for (const row of rows) {
    const list = from.get(row.from);
    if (list === undefined) from.set(row.from, [row]);
    else list.push(row);
  }
  const paths = new Map<string, Row[]>([[start, []]]);
  let frontier = [start];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const state of frontier) {
      for (const row of from.get(state) ?? []) {
        if (paths.has(row.next)) continue;
        paths.set(row.next, [...(paths.get(state) as Row[]), row]);
        next.push(row.next);
      }
    }
    frontier = next;
  }
  for (const row of rows) {
    if (!paths.has(row.from)) throw new GuardError("TLC wrote a step of the model from a state no step reaches");
  }
  return { start, rows, paths };
}

/**
 * Model-check the judging translation in one run of TLC: in every
 * state the model reaches, for every legal event, the model's effect
 * is a declared effect and the rule does not forbid it. The same run
 * writes TLC's table of the model's steps.
 */
export async function checkModel(shop: Shop, translation: Translation): Promise<ModelCheck> {
  const { binding } = shop.guard;
  const doing = "checking the model";
  const run = await tlc(
    shop,
    "model",
    MODEL_MODULE,
    [translation],
    { [`${MODEL_MODULE}.tla`]: modelModule(translation.name), [`${MODEL_MODULE}.cfg`]: MODEL_CFG },
    true,
  );
  if (run.timedOut) return { kind: "not checked", cause: stopped(shop) };
  if (completed(run)) {
    if (run.unread !== null) throw new GuardError(`TLC's table of the model's steps cannot be read: ${run.unread}`);
    if (run.dump === null) throw unexpected(run, doing);
    const table = tableOf(binding, dumpStates(run.dump));
    return {
      kind: "checked",
      table,
      applied: table.rows.filter((row) => row.applies).length,
      collision: statsOf(run).collision,
    };
  }
  const invariant = run.status === 12 ? violated(run) : null;
  if (invariant === "Kept" || invariant === "Declared") {
    const steps = traceOf(run)
      .map((state) => state.step)
      .filter((step) => typeof step === "object" && "r" in step);
    const last = steps[steps.length - 1];
    const shown = steps.slice(0, -1).map((step) => shownStep(binding, step));
    const call = callOf(binding, fieldOf(last, "event") ?? "");
    const effect = effectWords(binding, call.event, fieldOf(last, "effect") ?? "");
    if (invariant === "Kept") return { kind: "conflict", steps: shown, last: call, effect };
    return {
      kind: "cannot",
      cannot: [
        {
          cause: `${translation.file}: the model gives ${call.event} an effect the declaration does not hold: ${effect}`,
          note: `TLC met it on the model, at step ${steps.length} of this sequence`,
          steps: [...shown, { call, effect: null }],
        },
      ],
    };
  }
  if (run.status !== 0 && evalFault(run) !== null) {
    return { kind: "cannot", cannot: [cannotEvaluate(shop, run, [translation], translation, "on the model", doing)] };
  }
  throw unexpected(run, doing);
}

// ---------------------------------------------------------------
// 4. Judging effects the code gave (guards-22)
// ---------------------------------------------------------------

export type JudgeCheck =
  /** For each observation, in order: whether the rule forbids it. */
  | { kind: "judged"; forbidden: boolean[] }
  | { kind: "stopped"; cause: string }
  | { kind: "cannot"; cannot: Cannot[] };

/**
 * Ask TLC, in one run, whether the rule forbids each effect the code
 * gave that is not the model's. `name` names the run's folder.
 */
export async function judge(
  shop: Shop,
  name: string,
  translation: Translation,
  observed: readonly Observation[],
): Promise<JudgeCheck> {
  if (observed.length === 0) return { kind: "judged", forbidden: [] };
  const doing = "judging an effect the code gave";
  const run = await tlc(shop, name, JUDGE_MODULE, [translation], {
    [`${JUDGE_MODULE}.tla`]: judgeModule(translation.name, observed),
    [`${JUDGE_MODULE}.cfg`]: EVALUATE_CFG,
  });
  if (run.timedOut) return { kind: "stopped", cause: `${stopped(shop)} while it judged the effects the code gave` };
  const fault = run.status === 0 ? null : evalFault(run);
  if (fault !== null) {
    // The effect TLC could not judge is the one after the last it answered for.
    const one = observed[printedSoFar(run)];
    return {
      kind: "cannot",
      cannot: [
        {
          cause: `${placed(translation, fault)}: ${fault.message}`,
          note: "TLC met it judging the effect the code gave at the last step of this sequence",
          steps:
            one === undefined
              ? []
              : [...one.before.map((call) => ({ call, effect: null })), { call: one.call, effect: showFields(one.effect) }],
        },
      ],
    };
  }
  if (run.status !== 0) throw unexpected(run, doing);
  const answers = printed(run);
  if (answers.length !== observed.length) throw unexpected(run, doing);
  return {
    kind: "judged",
    forbidden: answers.map((answer, at) => {
      const [what, number, forbidden] = typeof answer === "object" && "t" in answer ? answer.t : [];
      if (what !== "judge" || number !== at + 1 || typeof forbidden !== "boolean") throw unexpected(run, doing);
      return forbidden;
    }),
  };
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-251: a reading. It is data: its own state, for
 * each event when the event is legal and how the state changes with
 * the observed effect, and the assertion as rules saying when each
 * applies and what must then hold of the effect.
 *
 * This module loads a reading, judges one step by it, walks an
 * example against it without any code, and walks a sequence through
 * several readings given whatever supplies each observed effect.
 */

import { compileAs, compileBool, evaluate, type Expr } from "./expr.js";
import {
  GuardError,
  decodeValue,
  inRange,
  isValuesSet,
  mapping,
  mappingOrNone,
  nameFault,
  parseType,
  parseYaml,
  showType,
  showValue,
  within,
  type Call,
  type Declaration,
  type Example,
  type Fields,
  type Type,
  type Value,
  type Vocabulary,
} from "./types.js";

/** A reading's memory: a value for each of its state variables. */
export type State = Fields;

/** What a reading says of one event. An event the file leaves out is
 * always legal and changes nothing. */
export type ReadingEvent = {
  legal: Expr;
  then: { name: string; type: Type; value: Expr }[];
  /** The effect fields `then` reads, in name order. */
  reads: string[];
};

/** One rule of the assertion. `checks` holds its two conditions
 * checked against each event it is on. */
export type Rule = {
  on: string[];
  when: string;
  shall: string;
  checks: Record<string, { when: Expr; shall: Expr }>;
};

/** A loaded reading. `events` has an entry for every declared event. */
export type Reading = {
  name: string;
  /** Its file, as given to `parseReading`. */
  file: string;
  vocabulary: Vocabulary;
  state: { name: string; type: Type; start: Value }[];
  events: Record<string, ReadingEvent>;
  rules: Rule[];
};

// ---------------------------------------------------------------
// Loading
// ---------------------------------------------------------------

/**
 * Read one reading from its YAML text and check every condition in it
 * against the binding's declaration. Every error is a GuardError
 * starting with `file`.
 */
export function parseReading(text: string, name: string, file: string, declaration: Declaration): Reading {
  return within(file, () => {
    const vocab = declaration.vocabulary;
    const top = mapping(parseYaml(text), ["format", "state", "events", "assertion"]);
    if (top.format !== 1) throw new GuardError("format must be 1");

    const paramsOf = new Map<string, string>();
    for (const [event, declared] of Object.entries(declaration.events)) {
      for (const param of Object.keys(declared.params)) paramsOf.set(param, event);
    }

    const state: Reading["state"] = [];
    const stateTypes: Record<string, Type> = {};
    for (const [variable, raw] of Object.entries(within("state", () => mappingOrNone(top.state)))) {
      within(`state ${variable}`, () => {
        const fault = nameFault(variable);
        if (fault !== null) throw new GuardError(fault);
        if (isValuesSet(vocab, variable)) throw new GuardError("this is also a values name; pick another");
        const event = paramsOf.get(variable);
        if (event !== undefined) {
          throw new GuardError(`this is also a param of event ${event}; pick another`);
        }
        const entry = mapping(raw, ["type", "start"]);
        if (!Object.hasOwn(entry, "type")) throw new GuardError("no type");
        if (!Object.hasOwn(entry, "start")) throw new GuardError("no start");
        const type = parseType(entry.type, vocab);
        const start = within("start", () => decodeValue(type, entry.start, vocab));
        state.push({ name: variable, type, start });
        stateTypes[variable] = type;
      });
    }

    const scope = (event: string, effect: boolean) => ({
      vocabulary: vocab,
      names: { ...stateTypes, ...declaration.events[event].params },
      effect: effect ? declaration.events[event].effect : null,
    });

    const written = within("events", () => mappingOrNone(top.events));
    for (const event of Object.keys(written)) {
      if (!Object.hasOwn(declaration.events, event)) {
        throw new GuardError(`event ${event}: the binding declares no such event`);
      }
    }
    const events: Record<string, ReadingEvent> = {};
    for (const event of Object.keys(declaration.events)) {
      within(`event ${event}`, () => {
        const entry = mappingOrNone(written[event], ["legal", "then"]);
        const legal = within("legal", () => compileBool(entry.legal ?? "true", scope(event, false)));
        const then: ReadingEvent["then"] = [];
        const fields = new Set<string>();
        for (const [variable, source] of Object.entries(within("then", () => mappingOrNone(entry.then)))) {
          within(`then ${variable}`, () => {
            if (!Object.hasOwn(stateTypes, variable)) throw new GuardError("not a state variable");
            const value = compileAs(source, scope(event, true), stateTypes[variable]);
            for (const field of value.reads) fields.add(field);
            then.push({ name: variable, type: stateTypes[variable], value });
          });
        }
        events[event] = { legal, then, reads: [...fields].sort() };
      });
    }

    if (!Array.isArray(top.assertion) || top.assertion.length === 0) {
      throw new GuardError("assertion must be a list of one or more rules");
    }
    const rules: Rule[] = top.assertion.map((raw: unknown, index: number) =>
      within(`rule ${index + 1}`, () => {
        const entry = mapping(raw, ["on", "when", "shall"]);
        const on = Array.isArray(entry.on) ? entry.on : [entry.on];
        if (on.length === 0 || on.some((event) => typeof event !== "string")) {
          throw new GuardError("on must be an event name or a list of event names");
        }
        const names = on as string[];
        for (const event of names) {
          if (!Object.hasOwn(declaration.events, event)) {
            throw new GuardError(`on: the binding declares no event ${event}`);
          }
        }
        if (new Set(names).size !== names.length) throw new GuardError("on names an event twice");
        if (entry.shall === undefined) throw new GuardError("no shall");
        const checks: Rule["checks"] = {};
        for (const event of names) {
          const place = names.length > 1 ? ` on ${event}` : "";
          checks[event] = {
            when: within(`when${place}`, () => compileBool(entry.when ?? "true", scope(event, false))),
            shall: within(`shall${place}`, () => compileBool(entry.shall, scope(event, true))),
          };
        }
        const first = checks[names[0]];
        return { on: names, when: first.when.source, shall: first.shall.source, checks };
      }),
    );

    return { name, file, vocabulary: vocab, state, events, rules };
  });
}

// ---------------------------------------------------------------
// One step
// ---------------------------------------------------------------

/** The state a reading starts every sequence in. */
export function startState(reading: Reading): State {
  const state: State = {};
  for (const variable of reading.state) state[variable.name] = variable.start;
  return state;
}

function eventOf(reading: Reading, call: Call): ReadingEvent {
  if (!Object.hasOwn(reading.events, call.event)) {
    throw new GuardError(`the binding declares no event ${call.event}`);
  }
  return reading.events[call.event];
}

/** What a reading settles before the event happens. */
export type Before = {
  legal: boolean;
  /** The rules that apply at this step, by their place in
   * `reading.rules`. */
  applying: number[];
};

/** Whether a reading forbids one step's effect. */
export type Verdict = {
  forbidden: boolean;
  /** The applying rules whose `shall` is false. */
  broken: number[];
};

/** What a reading settles once the effect is known. */
export type After = Verdict & { next: State };

/** One reading's whole verdict on one step. */
export type Judged = Before & After & { applies: boolean };

/**
 * Whether the event is legal in `state`, and which rules apply. Reads
 * no effect. A GuardError of kind `reading` reports a reading error.
 */
export function before(reading: Reading, state: State, call: Call): Before {
  return within(`reading ${reading.name}`, () => {
    const event = eventOf(reading, call);
    const names = { ...state, ...call.params };
    const legal = evaluate(event.legal, names) === true;
    const applying: number[] = [];
    reading.rules.forEach((rule, index) => {
      const check = rule.checks[call.event];
      if (check !== undefined && evaluate(check.when, names) === true) applying.push(index);
    });
    return { legal, applying };
  });
}

/** The effect fields a step reads, in name order: the `shall` of each
 * applying rule and, where the step moves the state, the event's
 * `then`. */
export function reads(reading: Reading, call: Call, applying: readonly number[], moves = true): string[] {
  const event = within(`reading ${reading.name}`, () => eventOf(reading, call));
  const fields = new Set(moves ? event.reads : []);
  for (const index of applying) {
    for (const field of reading.rules[index].checks[call.event].shall.reads) fields.add(field);
  }
  return [...fields].sort();
}

/**
 * Whether the effect is forbidden: some applying rule has a false
 * `shall`. Works out no next state, so a state that would leave its
 * range cannot hide a forbidden effect. `effect` must hold every
 * field those rules read. A GuardError of kind `reading` reports a
 * number beyond the safe range.
 */
export function forbids(
  reading: Reading,
  state: State,
  call: Call,
  effect: Fields,
  applying: readonly number[],
): Verdict {
  return within(`reading ${reading.name}`, () => {
    eventOf(reading, call);
    const names = { ...state, ...call.params };
    const broken = applying.filter(
      (index) => evaluate(reading.rules[index].checks[call.event].shall, names, effect) !== true,
    );
    return { forbidden: broken.length > 0, broken };
  });
}

/**
 * The state after the step: each variable's `then`, read at the state
 * before it. `effect` must hold every field `then` reads. A
 * GuardError of kind `reading` reports a reading error: a number
 * beyond the safe range, or a new value outside its declared type.
 */
export function move(reading: Reading, state: State, call: Call, effect: Fields): State {
  return within(`reading ${reading.name}`, () => {
    const event = eventOf(reading, call);
    const names = { ...state, ...call.params };
    const next: State = { ...state };
    for (const change of event.then) {
      const value = evaluate(change.value, names, effect);
      if (!inRange(change.type, value)) {
        throw new GuardError(
          `after ${call.event}, ${change.name} would be ${showValue(value)}, outside ${showType(change.type)}`,
          "reading",
        );
      }
      next[change.name] = value;
    }
    return next;
  });
}

/** One reading's whole verdict on a step whose effect is known:
 * `before`, `forbids` and `move`, in that order. */
export function judge(reading: Reading, state: State, call: Call, effect: Fields): Judged {
  const first = before(reading, state, call);
  const verdict = forbids(reading, state, call, effect, first.applying);
  return { ...first, applies: first.applying.length > 0, ...verdict, next: move(reading, state, call, effect) };
}

// ---------------------------------------------------------------
// An example against a reading, without the code
// ---------------------------------------------------------------

/** Something an example's walk found that its kind does not allow.
 * `step` counts from 1. */
export type ExampleFailure = {
  example: string | null;
  reading: string | null;
  step: number | null;
  found: string;
};

/** An example's step leaves out effect fields a reading reads there.
 * `step` counts from 1; `fields` are in name order. */
export class Unstated extends GuardError {
  constructor(
    readonly example: string,
    readonly step: number,
    reading: string,
    readonly fields: readonly string[],
  ) {
    const read = fields.map((field) => `effect.${field}`).join(" and ");
    super(`example ${example}, step ${step}: reading ${reading} reads ${read}, which the step does not state`);
  }
}

/** One example walked through one reading with its stated effects.
 * `steps` ends at a step that is not legal, and at a reading error
 * before the step it came at was judged or after it. */
export type ExampleCheck = {
  example: string;
  kind: Example["kind"];
  reading: string;
  steps: { legal: boolean; applies: boolean; forbidden: boolean }[];
  failures: ExampleFailure[];
  /** Some step applied: the example shows the protected behavior. */
  shows: boolean;
};

/**
 * Walk an example's steps from the reading's start state with the
 * stated effects. Permitted: every step legal, none forbidden.
 * Forbidden: every step legal, none before the last forbidden, the
 * last forbidden. Whether a step is forbidden is found before its
 * next state, and no next state is read after the last step. Throws
 * `Unstated` when the reading reads effect fields a step leaves out.
 */
export function checkExample(reading: Reading, example: Example): ExampleCheck {
  const check: ExampleCheck = {
    example: example.item,
    kind: example.kind,
    reading: reading.name,
    steps: [],
    failures: [],
    shows: false,
  };
  const fail = (step: number, found: string): void => {
    check.failures.push({ example: example.item, reading: reading.name, step, found });
  };
  let state = startState(reading);
  for (const [index, step] of example.steps.entries()) {
    const number = index + 1;
    const last = number === example.steps.length;
    try {
      const first = before(reading, state, step);
      if (!first.legal) {
        check.steps.push({ legal: false, applies: first.applying.length > 0, forbidden: false });
        fail(number, `step ${number} is not legal`);
        return check;
      }
      const unstated = reads(reading, step, first.applying, !last).filter((field) => !Object.hasOwn(step.effect, field));
      if (unstated.length > 0) throw new Unstated(example.item, number, reading.name, unstated);
      const verdict = forbids(reading, state, step, step.effect, first.applying);
      const applies = first.applying.length > 0;
      check.steps.push({ legal: true, applies, forbidden: verdict.forbidden });
      if (applies) check.shows = true;
      if (verdict.forbidden && example.kind === "permitted") fail(number, `step ${number} is forbidden`);
      if (verdict.forbidden && example.kind === "forbidden" && !last) {
        fail(number, `step ${number} is forbidden before the last step`);
      }
      if (!verdict.forbidden && example.kind === "forbidden" && last) {
        fail(number, `the last step is not forbidden`);
      }
      if (!last) state = move(reading, state, step, step.effect);
    } catch (error) {
      if (error instanceof GuardError && error.kind === "reading") {
        // The failure names its reading already.
        fail(number, `step ${number}: ${withoutReading(reading, error.message)}`);
        return check;
      }
      throw error;
    }
  }
  return check;
}

/** A reading error's cause without the `reading <name>: ` it opens
 * with, for a line that names the reading itself. */
function withoutReading(reading: Reading, cause: string): string {
  const opening = `reading ${reading.name}: `;
  return cause.startsWith(opening) ? cause.slice(opening.length) : cause;
}

/** Every example against every reading. */
export type ExamplesReport = {
  /** One per example and reading, examples in their order, readings
   * in theirs. */
  checks: ExampleCheck[];
  /** Every failure, and one more with no example when no permitted
   * example shows the protected behavior under every reading. */
  failures: ExampleFailure[];
  /** The permitted examples in which, under every reading, some step
   * applied. */
  shows: string[];
};

/** Check every example against every reading (design section 10 C). */
export function checkExamples(readings: readonly Reading[], examples: readonly Example[]): ExamplesReport {
  const checks: ExampleCheck[] = [];
  const shows: string[] = [];
  for (const example of examples) {
    const mine = readings.map((reading) => checkExample(reading, example));
    checks.push(...mine);
    if (example.kind === "permitted" && mine.length > 0 && mine.every((check) => check.shows)) {
      shows.push(example.item);
    }
  }
  const failures = checks.flatMap((check) => check.failures);
  if (shows.length === 0) {
    failures.push({
      example: null,
      reading: null,
      step: null,
      found: "no permitted example has a step at which the assertion applies under every reading",
    });
  }
  return { checks, failures, shows };
}

// ---------------------------------------------------------------
// A sequence through every reading
// ---------------------------------------------------------------

/** How the readings stand on one question. */
export type Agreement = "all" | "none" | "split";

function agreement(answers: readonly boolean[]): Agreement {
  if (answers.every((answer) => answer)) return "all";
  return answers.some((answer) => answer) ? "split" : "none";
}

/** One call of a walked sequence. `applies`, `forbidden` and `effect`
 * are null for an event that was not caused. `readings` follows the
 * order the readings were given in. */
export type WalkStep = {
  call: Call;
  legal: Agreement;
  caused: boolean;
  effect: Fields | null;
  applies: Agreement | null;
  forbidden: Agreement | null;
  readings: { legal: boolean; applies: boolean; forbidden: boolean }[];
};

/** A walked sequence. Places are indexes into `steps`, which follows
 * the sequence and ends at a violation or a reading error. */
export type Walk = {
  steps: WalkStep[];
  /** The step every reading forbids, where the walk ended. */
  violation: number | null;
  /** Events the readings split on as legal (not caused unless
   * `example`), and caused steps they split on as applying or as
   * forbidden. */
  undecided: number[];
  /** Under every reading, some caused step applied. */
  applied: boolean;
  /** A reading error: the place in the sequence and its message. */
  stopped: { at: number; cause: string } | null;
};

/** Causes one event and returns its observed effect, already decoded
 * against the declaration (every field present). */
export type Cause = (call: Call, index: number) => Fields | Promise<Fields>;

/**
 * Walk a sequence through every reading from their start states.
 * Each event is caused when every reading finds it legal, skipped
 * when none does, and left out as undecided when they split; with
 * `example` (an example run on the code) every event is caused
 * whatever the readings say. Whether a caused step is forbidden is
 * found for every reading before any reading's next state is worked
 * out. The walk ends at the first step every reading forbids, and no
 * next state is read after that step, nor after an example's last
 * step. An error `cause` throws passes through unchanged.
 */
export async function walkSequence(
  readings: readonly Reading[],
  sequence: readonly Call[],
  cause: Cause,
  options: { example?: boolean } = {},
): Promise<Walk> {
  if (readings.length === 0) throw new GuardError("a sequence needs at least one reading");
  const walk: Walk = { steps: [], violation: null, undecided: [], applied: false, stopped: null };
  let states = readings.map(startState);
  const applied = readings.map(() => false);
  /** Run `work`; a reading error ends the walk at `index`. */
  const read = <T>(index: number, work: () => T): T | undefined => {
    try {
      return work();
    } catch (error) {
      if (!(error instanceof GuardError) || error.kind !== "reading") throw error;
      walk.stopped = { at: index, cause: error.message };
      return undefined;
    }
  };
  for (const [index, call] of sequence.entries()) {
    const firsts = read(index, () => readings.map((reading, at) => before(reading, states[at], call)));
    if (firsts === undefined) break;
    const legal = agreement(firsts.map((first) => first.legal));
    const step: WalkStep = {
      call,
      legal,
      caused: legal === "all" || options.example === true,
      effect: null,
      applies: null,
      forbidden: null,
      readings: firsts.map((first) => ({ legal: first.legal, applies: false, forbidden: false })),
    };
    const place = walk.steps.length;
    walk.steps.push(step);
    if (!step.caused) {
      if (legal === "split") walk.undecided.push(place);
      continue;
    }
    const effect = await cause(call, index);
    step.effect = effect;
    const verdicts = read(index, () =>
      readings.map((reading, at) => forbids(reading, states[at], call, effect, firsts[at].applying)),
    );
    if (verdicts === undefined) break;
    verdicts.forEach((verdict, at) => {
      const applies = firsts[at].applying.length > 0;
      step.readings[at].applies = applies;
      step.readings[at].forbidden = verdict.forbidden;
      if (applies) applied[at] = true;
    });
    step.applies = agreement(step.readings.map((reading) => reading.applies));
    step.forbidden = agreement(step.readings.map((reading) => reading.forbidden));
    if (step.forbidden === "all") {
      walk.violation = place;
      break;
    }
    if (legal === "split" || step.applies === "split" || step.forbidden === "split") {
      walk.undecided.push(place);
    }
    if (options.example === true && index === sequence.length - 1) break;
    const next = read(index, () => readings.map((reading, at) => move(reading, states[at], call, effect)));
    if (next === undefined) break;
    states = next;
  }
  walk.applied = applied.every((flag) => flag);
  return walk;
}

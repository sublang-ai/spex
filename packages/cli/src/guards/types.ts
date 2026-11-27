// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: the declared types a binding is written in,
 * the values of those types as the guard file and the binding's module
 * hold them, and how such a value is read from YAML or JSON and
 * printed. Nothing here knows TLA+: `tla.ts` turns these values into
 * TLA+ text and back.
 *
 * A value in memory is plain JSON in one fixed form, so two equal
 * values always print and compare the same:
 *   bool -> boolean, a whole number -> number, a named value -> its
 *   string, the missing value -> null, a set -> array in declared
 *   order without repeats.
 */

import { parseDocument } from "yaml";

/** The one error the guards library throws on purpose. Its message is
 * plain words, ready to print; nothing else of it is for a person. */
export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}

/** Run `work`, and put `where` before the message of a GuardError it
 * throws: `<where>: <cause>`. */
export function within<T>(where: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof GuardError) throw new GuardError(`${where}: ${error.message}`);
    throw error;
  }
}

/** Order two texts by their code units, the same on every machine. */
export function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------
// Names
// ---------------------------------------------------------------

/** A values set, a param or an effect field: these become names of
 * the declaration in TLA+. */
const FIELD_RE = /^[a-z][A-Za-z0-9]*$/;

/** An event's name, which TLA+ holds as a string. */
const EVENT_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Why `name` cannot name a values set, a param or an effect field,
 * or null when it can. */
export function fieldFault(name: string): string | null {
  return FIELD_RE.test(name)
    ? null
    : `'${name}' is not a name (a lowercase letter, then letters and digits)`;
}

/** Why `name` cannot name an event, or null when it can. */
export function eventFault(name: string): string | null {
  return EVENT_RE.test(name) ? null : `'${name}' is not a name (a letter, then letters, digits and _)`;
}

/** The words a type is written with; none may name a values set. */
const TYPE_WORDS: ReadonlySet<string> = new Set(["bool", "set", "of"]);

// ---------------------------------------------------------------
// Types and values
// ---------------------------------------------------------------

/** A declared type. A set holds whole numbers or named values;
 * `optional` adds the missing value and is never nested. */
export type Type =
  | { kind: "bool" }
  | { kind: "int"; min: number; max: number }
  | { kind: "value"; set: string }
  | { kind: "set"; of: Type }
  | { kind: "optional"; of: Type };

/** A value of a declared type, in its one fixed form. */
export type Value = boolean | number | string | null | Value[];

/** Named values: an event's params or its effect. */
export type Fields = Record<string, Value>;

/** The binding's named finite sets. `home` finds a value's set and its
 * place in it; a value belongs to exactly one set. */
export type Vocabulary = {
  sets: Record<string, readonly string[]>;
  home: ReadonlyMap<string, { set: string; rank: number }>;
};

/** One event as a binding declares it. */
export type EventDeclaration = {
  params: Record<string, Type>;
  effect: Record<string, Type>;
};

/** What a case's steps are checked against: the binding's values and
 * events. `events` keeps the declared order. */
export type Declaration = {
  vocabulary: Vocabulary;
  events: Record<string, EventDeclaration>;
};

/** One event with its params: what a sequence is made of. */
export type Call = { event: string; params: Fields };

/** One step of a case: a call and the effect fields the case states
 * (fields left out are not compared). */
export type Step = Call & { effect: Fields };

/** A case of the guard item (guards-37) with its steps from the guard
 * file (guards-10). */
export type Case = {
  /** Its label, as the item writes it. */
  label: string;
  kind: "permitted" | "forbidden";
  /** Its plain words, from the item. */
  words: string;
  steps: Step[];
};

/** Build a vocabulary from `values` as binding.yaml writes it. */
export function vocabulary(values: Record<string, readonly string[]>): Vocabulary {
  const sets: Record<string, readonly string[]> = {};
  const home = new Map<string, { set: string; rank: number }>();
  for (const [set, members] of Object.entries(values)) {
    const fault = fieldFault(set);
    if (fault !== null) throw new GuardError(`values: ${fault}`);
    if (TYPE_WORDS.has(set)) throw new GuardError(`values: '${set}' is a word types are written with`);
    if (members.length === 0) throw new GuardError(`values ${set}: a set needs at least one value`);
    members.forEach((value, rank) => {
      const where = `values ${set}`;
      if (typeof value !== "string") {
        throw new GuardError(`${where}: a value is a plain string, found ${showData(value)}`);
      }
      if (value === "none" || value === "true" || value === "false") {
        throw new GuardError(`${where}: '${value}' cannot be a value`);
      }
      if (value === "" || value !== value.trim() || !/^[\x20-\x7e]*$/.test(value)) {
        throw new GuardError(
          `${where}: ${JSON.stringify(value)} cannot be a value (printable ASCII, no space at either end)`,
        );
      }
      const other = home.get(value);
      if (other !== undefined) {
        throw new GuardError(
          other.set === set
            ? `${where}: '${value}' is listed twice`
            : `${where}: '${value}' is also in values ${other.set}; a value belongs to one set`,
        );
      }
      home.set(value, { set, rank });
    });
    sets[set] = [...members];
  }
  return { sets, home };
}

/** Whether `name` is one of the vocabulary's sets. */
export function isValuesSet(vocab: Vocabulary, name: string): boolean {
  return Object.hasOwn(vocab.sets, name);
}

// ---------------------------------------------------------------
// Reading and writing a type
// ---------------------------------------------------------------

/**
 * Read a type as binding.yaml writes it: `bool`, `<a>..<b>`, a values
 * name, `set of <values name>`, `set of <a>..<b>`, and `<type>?`.
 * After `set of …` the `?` makes the set optional.
 */
export function parseType(text: unknown, vocab: Vocabulary): Type {
  if (typeof text !== "string") {
    throw new GuardError(`write the type as text, found ${showData(text)}`);
  }
  const bad = (cause: string): never => {
    throw new GuardError(`${cause} in type "${text}"`);
  };
  let rest = text.trim();
  let optional = false;
  if (rest.endsWith("?")) {
    optional = true;
    rest = rest.slice(0, -1).trim();
    if (rest.endsWith("?")) bad("a type takes one '?'");
  }
  const plain = (word: string): Type => {
    const range = /^(-?\d+)\s*\.\.\s*(-?\d+)$/.exec(word);
    if (range !== null) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      // TLC's whole numbers are 32 bits wide.
      if (Math.abs(min) > 2147483647 || Math.abs(max) > 2147483647) bad("a number is beyond what TLC holds");
      if (min > max) bad(`${min}..${max} holds no number`);
      return { kind: "int", min, max };
    }
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(word)) bad(word === "" ? "something is left out" : `unexpected '${word}'`);
    if (!isValuesSet(vocab, word)) bad(`'${word}' is not a type or a values name`);
    return { kind: "value", set: word };
  };
  let type: Type;
  const set = /^set\s+of\s+(.*)$/.exec(rest);
  if (set !== null) {
    if (set[1].trim() === "bool") bad("a set holds whole numbers or named values");
    type = { kind: "set", of: plain(set[1].trim()) };
  } else if (rest === "bool") {
    type = { kind: "bool" };
  } else {
    type = plain(rest);
  }
  return optional ? { kind: "optional", of: type } : type;
}

/** A type as it is written. */
export function showType(type: Type): string {
  switch (type.kind) {
    case "bool":
      return "bool";
    case "int":
      return `${type.min}..${type.max}`;
    case "value":
      return type.set;
    case "set":
      return `set of ${showType(type.of)}`;
    case "optional":
      return `${showType(type.of)}?`;
  }
}

// ---------------------------------------------------------------
// Values
// ---------------------------------------------------------------

/** Data that is not yet a value, printed for a message. */
export function showData(data: unknown): string {
  if (data === undefined) return "nothing";
  let text: string | undefined;
  try {
    text = JSON.stringify(data);
  } catch {
    text = undefined;
  }
  if (text === undefined) text = String(data);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

/** Put a set's members in declared order: whole numbers rising, named
 * values as their set lists them. */
export function inOrder(members: readonly Value[], vocab: Vocabulary): Value[] {
  const rank = (member: Value): number =>
    typeof member === "number" ? member : (vocab.home.get(member as string)?.rank ?? 0);
  return [...members].sort((a, b) => rank(a) - rank(b));
}

/**
 * Read data written as YAML or JSON as a value of `type`: a step's
 * params and effects, what a binding returns. Throws a GuardError
 * saying what was expected and what was found.
 */
export function decodeValue(type: Type, data: unknown, vocab: Vocabulary): Value {
  return decodeAs(type, data, vocab, type);
}

/** `shown` is the type a message names: the optional type where
 * `type` is what it holds. */
function decodeAs(type: Type, data: unknown, vocab: Vocabulary, shown: Type): Value {
  const bad = (): never => {
    throw new GuardError(`expected ${showType(shown)}, found ${showData(data)}`);
  };
  switch (type.kind) {
    case "optional":
      return data === null ? null : decodeAs(type.of, data, vocab, type);
    case "bool":
      return typeof data === "boolean" ? data : bad();
    case "int":
      return typeof data === "number" && Number.isSafeInteger(data) && data >= type.min && data <= type.max
        ? data
        : bad();
    case "value":
      return typeof data === "string" && vocab.home.get(data)?.set === type.set ? data : bad();
    case "set": {
      if (!Array.isArray(data)) return bad();
      const members = data.map((member) => {
        try {
          return decodeValue(type.of, member, vocab);
        } catch (error) {
          if (error instanceof GuardError) return bad();
          throw error;
        }
      });
      if (new Set(members).size !== members.length) {
        throw new GuardError(`a value repeats in ${showData(data)}`);
      }
      return inOrder(members, vocab);
    }
  }
}

/**
 * Read a record of named values against its declared fields. Every
 * declared field must be there unless `partial`; no other field may
 * be. The result keeps the declared order.
 */
export function decodeFields(
  declared: Record<string, Type>,
  data: unknown,
  vocab: Vocabulary,
  options: { partial?: boolean } = {},
): Fields {
  if (!isRecord(data)) {
    throw new GuardError(`expected named fields, found ${showData(data)}`);
  }
  for (const name of Object.keys(data)) {
    if (!Object.hasOwn(declared, name)) throw new GuardError(`'${name}' is not declared`);
  }
  const fields: Fields = {};
  for (const [name, type] of Object.entries(declared)) {
    if (!Object.hasOwn(data, name) || data[name] === undefined) {
      if (options.partial === true) continue;
      throw new GuardError(`no value for '${name}'`);
    }
    fields[name] = within(name, () => decodeValue(type, data[name], vocab));
  }
  return fields;
}

/** Whether two values are the same. */
export function sameValue(a: Value, b: Value): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether two records of named values are the same, field by field. */
export function sameFields(a: Fields, b: Fields): boolean {
  const names = Object.keys(a);
  return (
    names.length === Object.keys(b).length &&
    names.every((name) => Object.hasOwn(b, name) && sameValue(a[name], b[name]))
  );
}

/** The stated fields whose observed value is another: what a step
 * states of an effect against what the code produced. Fields the step
 * leaves out are not compared. In the stated order. */
export function differences(
  stated: Fields,
  observed: Fields,
): { field: string; stated: Value; observed: Value }[] {
  const found: { field: string; stated: Value; observed: Value }[] = [];
  for (const [field, value] of Object.entries(stated)) {
    const seen = Object.hasOwn(observed, field) ? observed[field] : null;
    if (!Object.hasOwn(observed, field) || !sameValue(value, seen)) {
      found.push({ field, stated: value, observed: seen });
    }
  }
  return found;
}

/**
 * Order two values of one declared type: the missing value first,
 * false before true, whole numbers rising, a values set in its
 * declared order, sets by size and then by their members in order.
 */
export function compareValues(type: Type, a: Value, b: Value, vocab: Vocabulary): number {
  switch (type.kind) {
    case "optional":
      if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
      return compareValues(type.of, a, b, vocab);
    case "bool":
      return Number(a) - Number(b);
    case "int":
      return (a as number) - (b as number);
    case "value":
      return (vocab.home.get(a as string)?.rank ?? 0) - (vocab.home.get(b as string)?.rank ?? 0);
    case "set": {
      const [x, y] = [a as Value[], b as Value[]];
      if (x.length !== y.length) return x.length - y.length;
      for (let at = 0; at < x.length; at += 1) {
        const order = compareValues(type.of, x[at], y[at], vocab);
        if (order !== 0) return order;
      }
      return 0;
    }
  }
}

/** Order two records of the same declared fields: by the first
 * field's value, then the second's, and so on. */
export function compareFields(declared: Record<string, Type>, a: Fields, b: Fields, vocab: Vocabulary): number {
  for (const [name, type] of Object.entries(declared)) {
    const order = compareValues(type, a[name], b[name], vocab);
    if (order !== 0) return order;
  }
  return 0;
}

/** A value as output prints it: `none`, `{a, b}` for a set. */
export function showValue(value: Value): string {
  if (value === null) return "none";
  if (Array.isArray(value)) return `{${value.map(showValue).join(", ")}}`;
  return String(value);
}

/** Named values on one line: `selected={zeta/kit} providing={}`. */
export function showFields(fields: Fields): string {
  return Object.entries(fields)
    .map(([name, value]) => `${name}=${showValue(value)}`)
    .join(" ");
}

// ---------------------------------------------------------------
// YAML
// ---------------------------------------------------------------

/** Parse one YAML file's text. A syntax error or a repeated key is a
 * GuardError. */
export function parseYaml(text: string): unknown {
  const document = parseDocument(text, { prettyErrors: true });
  const problem = document.errors[0];
  if (problem !== undefined) {
    throw new GuardError(`not readable as YAML — ${problem.message.split("\n")[0]}`);
  }
  return document.toJS();
}

/** `data` as a mapping, with only the `allowed` keys when they are
 * given; else a GuardError naming the unknown key. */
export function mapping(data: unknown, allowed?: readonly string[]): Record<string, unknown> {
  if (!isRecord(data)) {
    throw new GuardError(`expected a mapping, found ${showData(data)}`);
  }
  if (allowed !== undefined) {
    for (const key of Object.keys(data)) {
      if (!allowed.includes(key)) throw new GuardError(`unknown key '${key}'`);
    }
  }
  return data;
}

/** `data` as a mapping, or an empty one where the key was left out. */
export function mappingOrNone(data: unknown, allowed?: readonly string[]): Record<string, unknown> {
  return data === undefined || data === null ? {} : mapping(data, allowed);
}

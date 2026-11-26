// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-251: the declared types a binding and a reading
 * are written in, the values of those types, and how a value is read
 * from YAML or JSON and printed.
 *
 * A value in memory is plain JSON in one fixed form, so two equal
 * values always print and compare the same:
 *   bool -> boolean, int -> number, a named value -> its string,
 *   the missing value -> null, a set -> array in declared order
 *   without repeats, a map -> object with every key in declared order.
 */

import { parseDocument } from "yaml";

/** What went wrong, by where it was found: in a guard's files or
 * items, in data given for a declared type, or while a reading was
 * followed. */
export type GuardErrorKind = "files" | "value" | "reading";

/** The one error the guards library throws on purpose. Its message is
 * plain words, ready to print; nothing else of it is for a person. */
export class GuardError extends Error {
  readonly kind: GuardErrorKind;
  constructor(message: string, kind: GuardErrorKind = "files") {
    super(message);
    this.name = "GuardError";
    this.kind = kind;
  }
}

/** Run `work`, and put `where` before the message of a GuardError it
 * throws: `<where>: <cause>`. */
export function within<T>(where: string, work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof GuardError) {
      throw new GuardError(`${where}: ${error.message}`, error.kind);
    }
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

/** The words of the condition language; none may name a state
 * variable, a param, a values set or a bound variable. */
export const WORDS: ReadonlySet<string> = new Set([
  "true", "false", "none", "not", "and", "or", "implies", "in", "union",
  "minus", "intersect", "size", "min", "max", "default", "if", "then",
  "else", "all", "any", "map", "effect",
]);

/** The words a type is written with; none may name a values set. */
const TYPE_WORDS: ReadonlySet<string> = new Set(["bool", "int", "set", "of", "map", "to"]);

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why `name` cannot name an event, a field, a state variable or a
 * values set, or null when it can. */
export function nameFault(name: string): string | null {
  if (!NAME_RE.test(name)) {
    return `'${name}' is not a name (letters, digits and _, not starting with a digit)`;
  }
  if (name === "__proto__") return `'${name}' cannot be used as a name`;
  if (WORDS.has(name)) return `'${name}' is a word of the condition language`;
  return null;
}

// ---------------------------------------------------------------
// Types and values
// ---------------------------------------------------------------

/** A declared type (design section 4). A set holds ints or named
 * values; `optional` adds the missing value and is never nested. */
export type Type =
  | { kind: "bool" }
  | { kind: "int"; min: number; max: number }
  | { kind: "value"; set: string }
  | { kind: "set"; of: Type }
  | { kind: "map"; key: string; to: Type }
  | { kind: "optional"; of: Type };

/** A value of a declared type, in its one fixed form. */
export type Value = boolean | number | string | null | Value[] | { [key: string]: Value };

/** Named values: an event's params, its effect, a reading's state. */
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

/** What a reading and an example are checked against: the binding's
 * values and events. `events` keeps the declared order. */
export type Declaration = {
  vocabulary: Vocabulary;
  events: Record<string, EventDeclaration>;
};

/** One event with its params: what a sequence is made of. */
export type Call = { event: string; params: Fields };

/** One step of an example: a call and the effect fields its item
 * states (fields left out are not compared). */
export type Step = Call & { effect: Fields };

/** An example as guard.yaml stores it. */
export type Example = {
  item: string;
  kind: "permitted" | "forbidden";
  steps: Step[];
};

/** Build a vocabulary from `values` as binding.yaml writes it. */
export function vocabulary(values: Record<string, readonly string[]>): Vocabulary {
  const sets: Record<string, readonly string[]> = {};
  const home = new Map<string, { set: string; rank: number }>();
  for (const [set, members] of Object.entries(values)) {
    const fault = nameFault(set);
    if (fault !== null) throw new GuardError(`values: ${fault}`);
    if (TYPE_WORDS.has(set)) throw new GuardError(`values: '${set}' is a word types are written with`);
    if (members.length === 0) throw new GuardError(`values ${set}: a set needs at least one value`);
    members.forEach((value, rank) => {
      const where = `values ${set}`;
      if (typeof value !== "string") {
        throw new GuardError(`${where}: a value is a plain string, found ${showData(value)}`);
      }
      if (value === "none" || value === "true" || value === "false" || value === "__proto__") {
        throw new GuardError(`${where}: '${value}' cannot be a value`);
      }
      if (value === "" || value !== value.trim() || /['\u0000-\u001f]/.test(value)) {
        throw new GuardError(
          `${where}: ${JSON.stringify(value)} cannot be a value (no quote mark, line break, or space at either end)`,
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

type TypeToken = { text: string; int: boolean };

function typeTokens(text: string): TypeToken[] {
  const tokens: TypeToken[] = [];
  const re = /\s+|(-?\d+)|(\.\.|[?()])|([A-Za-z_][A-Za-z0-9_]*)/y;
  while (re.lastIndex < text.length) {
    const at = re.lastIndex;
    const match = re.exec(text);
    if (match === null) throw new GuardError(`unexpected '${text[at]}' in type "${text}"`);
    if (match[1] !== undefined) tokens.push({ text: match[1], int: true });
    else if (match[2] !== undefined) tokens.push({ text: match[2], int: false });
    else if (match[3] !== undefined) tokens.push({ text: match[3], int: false });
  }
  return tokens;
}

/**
 * Read a type as binding.yaml and a reading's `state` write it:
 * `bool`, `int <a>..<b>`, a values name, `set of <values name>`,
 * `set of int <a>..<b>`, `map <values name> to <type>`, and `<type>?`.
 * After `set of …` the `?` makes the set optional; after
 * `map … to …` it belongs to what the map holds. Parentheses group,
 * so `(map user to bool)?` is an optional map.
 */
export function parseType(text: unknown, vocab: Vocabulary): Type {
  if (typeof text !== "string") {
    throw new GuardError(`write the type as text, found ${showData(text)}`);
  }
  const tokens = typeTokens(text);
  let at = 0;
  const bad = (cause: string): never => {
    throw new GuardError(`${cause} in type "${text}"`);
  };
  const next = (): TypeToken => tokens[at++] ?? bad("something is left out");
  const word = (want: string): void => {
    const token = next();
    if (token.text !== want) bad(`expected '${want}' but found '${token.text}'`);
  };
  const range = (): Type => {
    const low = next();
    if (!low.int) bad(`expected a number after 'int' but found '${low.text}'`);
    word("..");
    const high = next();
    if (!high.int) bad(`expected a number after '..' but found '${high.text}'`);
    const min = Number(low.text);
    const max = Number(high.text);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) bad("a number is beyond the safe range");
    if (min > max) bad(`${min}..${max} holds no number`);
    return { kind: "int", min, max };
  };
  const named = (name: string): Type => {
    if (!isValuesSet(vocab, name)) bad(`'${name}' is not a type or a values name`);
    return { kind: "value", set: name };
  };
  const whole = (): Type => {
    const token = next();
    let type: Type;
    if (token.text === "(") {
      type = whole();
      word(")");
    } else if (token.text === "bool") {
      type = { kind: "bool" };
    } else if (token.text === "int") {
      type = range();
    } else if (token.text === "set") {
      word("of");
      const member = next();
      type = { kind: "set", of: member.text === "int" ? range() : named(member.text) };
    } else if (token.text === "map") {
      const key = next().text;
      if (!isValuesSet(vocab, key)) bad(`'${key}' is not a values name`);
      word("to");
      type = { kind: "map", key, to: whole() };
      return type;
    } else {
      type = named(token.text);
    }
    if (tokens[at]?.text === "?") {
      at += 1;
      if (type.kind === "optional" || tokens[at]?.text === "?") bad("a type takes one '?'");
      type = { kind: "optional", of: type };
    }
    return type;
  };
  const type = whole();
  if (at < tokens.length) bad(`unexpected '${tokens[at].text}'`);
  return type;
}

/** A type as it is written. */
export function showType(type: Type): string {
  switch (type.kind) {
    case "bool":
      return "bool";
    case "int":
      return `int ${type.min}..${type.max}`;
    case "value":
      return type.set;
    case "set":
      return `set of ${showType(type.of)}`;
    case "map":
      return `map ${type.key} to ${showType(type.to)}`;
    case "optional":
      return type.of.kind === "map" ? `(${showType(type.of)})?` : `${showType(type.of)}?`;
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

/** Put a set's members in declared order: ints rising, named values
 * as their set lists them. */
export function inOrder(members: readonly Value[], vocab: Vocabulary): Value[] {
  const rank = (member: Value): number =>
    typeof member === "number" ? member : (vocab.home.get(member as string)?.rank ?? 0);
  return [...members].sort((a, b) => rank(a) - rank(b));
}

/**
 * Read data written as YAML or JSON as a value of `type` (design
 * section 4, data encoding): an example's params and effects, a
 * reading's `start`, what a binding returns. Throws a GuardError of
 * kind `value` saying what was expected and what was found.
 */
export function decodeValue(type: Type, data: unknown, vocab: Vocabulary): Value {
  return decodeAs(type, data, vocab, type);
}

/** `shown` is the type a message names: the optional type where
 * `type` is what it holds. */
function decodeAs(type: Type, data: unknown, vocab: Vocabulary, shown: Type): Value {
  const bad = (): never => {
    throw new GuardError(`expected ${showType(shown)}, found ${showData(data)}`, "value");
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
        throw new GuardError(`a value repeats in ${showData(data)}`, "value");
      }
      return inOrder(members, vocab);
    }
    case "map": {
      if (!isRecord(data)) return bad();
      const keys = vocab.sets[type.key];
      for (const key of Object.keys(data)) {
        if (!keys.includes(key)) {
          throw new GuardError(`'${key}' is not a ${type.key} in ${showData(data)}`, "value");
        }
      }
      const map: { [key: string]: Value } = {};
      for (const key of keys) {
        if (!Object.hasOwn(data, key)) {
          throw new GuardError(`no value for '${key}' in ${showData(data)}`, "value");
        }
        map[key] = within(`'${key}'`, () => decodeValue(type.to, data[key], vocab));
      }
      return map;
    }
  }
}

/**
 * Read a record of named values against its declared fields. Every
 * declared field must be there unless `partial`; no other field may
 * be. The result keeps the declared order. Throws a GuardError of
 * kind `value`.
 */
export function decodeFields(
  declared: Record<string, Type>,
  data: unknown,
  vocab: Vocabulary,
  options: { partial?: boolean } = {},
): Fields {
  if (!isRecord(data)) {
    throw new GuardError(`expected named fields, found ${showData(data)}`, "value");
  }
  for (const name of Object.keys(data)) {
    if (!Object.hasOwn(declared, name)) {
      throw new GuardError(`'${name}' is not declared`, "value");
    }
  }
  const fields: Fields = {};
  for (const [name, type] of Object.entries(declared)) {
    if (!Object.hasOwn(data, name) || data[name] === undefined) {
      if (options.partial === true) continue;
      throw new GuardError(`no value for '${name}'`, "value");
    }
    fields[name] = within(name, () => decodeValue(type, data[name], vocab));
  }
  return fields;
}

/** Whether a value of the right shape also stays inside every int
 * range `type` declares. */
export function inRange(type: Type, value: Value): boolean {
  switch (type.kind) {
    case "optional":
      return value === null || inRange(type.of, value);
    case "int":
      return typeof value === "number" && value >= type.min && value <= type.max;
    case "set":
      return (value as Value[]).every((member) => inRange(type.of, member));
    case "map":
      return Object.values(value as { [key: string]: Value }).every((held) => inRange(type.to, held));
    default:
      return true;
  }
}

/** Whether two values are the same. */
export function sameValue(a: Value, b: Value): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The stated fields whose observed value is another: what an
 * example states of an effect against what the code produced. Fields
 * the example leaves out are not compared. In the stated order. */
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

/** A value as output prints it: `none`, `{a, b}` for a set,
 * `{k: v, …}` for a map. */
export function showValue(value: Value): string {
  if (value === null) return "none";
  if (Array.isArray(value)) return `{${value.map(showValue).join(", ")}}`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .map(([key, held]) => `${key}: ${showValue(held)}`)
      .join(", ")}}`;
  }
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

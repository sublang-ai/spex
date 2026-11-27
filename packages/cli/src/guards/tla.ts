// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-244 and DR-252: TLA+ values as TLC prints them.
 * This file reads a printed value, writes a value as TLA+ text,
 * compares two values for equality and turns a value of a declared
 * type into a TLA+ value and back. It evaluates no TLA+.
 *
 * A value in memory:
 *   "text"            a string        true / false      12
 *   { m: "Missing" }  a model value
 *   { s: [..] }       a set, members in one fixed order, each once
 *   { r: {k: v} }     a record, fields in name order
 *   { t: [..] }       a tuple; a function over no value is { t: [] }
 *   { f: [[k, v]] }   any other function, pairs in one fixed order
 */

import {
  GuardError,
  decodeFields,
  type Call,
  type Declaration,
  type Fields,
  type Type,
  type Value,
} from "./types.js";

export type Tla =
  | string
  | number
  | boolean
  | { m: string }
  | { s: Tla[] }
  | { r: Record<string, Tla> }
  | { t: Tla[] }
  | { f: [Tla, Tla][] };

/** The value of a field of a type `T?` that holds nothing. */
export const MISSING: Tla = { m: "Missing" };

function byKey(a: Tla, b: Tla): number {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The one form of a value: members and fields in a fixed order, a
 * member once, a record or function of nothing as the empty tuple. */
export function canon(value: Tla): Tla {
  if (typeof value !== "object") return value;
  if ("m" in value) return { m: value.m };
  if ("s" in value) {
    const members = value.s.map(canon).sort(byKey);
    return { s: members.filter((member, at) => at === 0 || byKey(member, members[at - 1]) !== 0) };
  }
  if ("t" in value) return { t: value.t.map(canon) };
  if ("r" in value) {
    const names = Object.keys(value.r).sort();
    if (names.length === 0) return { t: [] };
    const fields: Record<string, Tla> = {};
    for (const name of names) fields[name] = canon(value.r[name]);
    return { r: fields };
  }
  if (value.f.length === 0) return { t: [] };
  return {
    f: value.f.map(([k, v]): [Tla, Tla] => [canon(k), canon(v)]).sort((a, b) => byKey(a[0], b[0])),
  };
}

/** One text per value: two values are equal exactly when their keys
 * are. */
export function key(value: Tla): string {
  return JSON.stringify(canon(value));
}

// ---------------------------------------------------------------
// Reading what TLC printed
// ---------------------------------------------------------------

/** What TLC printed could not be read as a value. */
export class Unreadable extends GuardError {}

class Reader {
  at = 0;
  constructor(readonly text: string) {}

  fail(what: string): never {
    const near = this.text.slice(this.at, this.at + 40).replace(/\n/g, "\\n");
    throw new Unreadable(`TLC printed what is not a value (${what}) at offset ${this.at}: ${near}`);
  }

  space(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at])) this.at += 1;
  }

  take(word: string): boolean {
    this.space();
    if (!this.text.startsWith(word, this.at)) return false;
    this.at += word.length;
    return true;
  }

  need(word: string): void {
    if (!this.take(word)) this.fail(`expected ${word}`);
  }

  list(close: string): Tla[] {
    const items: Tla[] = [];
    if (this.take(close)) return items;
    do items.push(this.value());
    while (this.take(","));
    this.need(close);
    return items;
  }

  /** A name: a model value, `TRUE`, `FALSE` or a state's variable.
   * A record's field is read with a wider pattern: TLC prints a function
   * over strings as a record wherever every key is made of letters,
   * digits and `_`, and such a key may start with a digit. */
  word(name = /[A-Za-z_][A-Za-z0-9_]*/y): string {
    this.space();
    name.lastIndex = this.at;
    const found = name.exec(this.text);
    if (found === null) return this.fail("expected a name");
    this.at += found[0].length;
    return found[0];
  }

  string(): string {
    let out = "";
    this.at += 1;
    for (;;) {
      const c = this.text[this.at++];
      if (c === undefined) this.fail("a string does not end");
      if (c === '"') return out;
      if (c !== "\\") {
        out += c;
        continue;
      }
      const e = this.text[this.at++];
      out += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e === "f" ? "\f" : e;
    }
  }

  value(): Tla {
    this.space();
    if (this.text[this.at] === '"') return this.string();
    if (this.take("<<")) return { t: this.list(">>") };
    if (this.take("{")) return { s: this.list("}") };
    if (this.take("[")) {
      const fields: Record<string, Tla> = {};
      do {
        const name = this.word(/[A-Za-z0-9_]+/y);
        this.need("|->");
        fields[name] = this.value();
      } while (this.take(","));
      this.need("]");
      return { r: fields };
    }
    if (this.take("(")) {
      const pairs: [Tla, Tla][] = [];
      do {
        const k = this.value();
        this.need(":>");
        pairs.push([k, this.value()]);
      } while (this.take("@@"));
      this.need(")");
      return { f: pairs };
    }
    const number = /-?\d+/y;
    number.lastIndex = this.at;
    const digits = number.exec(this.text);
    if (digits !== null) {
      this.at += digits[0].length;
      const low = Number(digits[0]);
      // TLC prints an interval it never enumerated as lo..hi.
      if (this.text.startsWith("..", this.at)) {
        this.at += 2;
        number.lastIndex = this.at;
        const high = number.exec(this.text);
        if (high === null) return this.fail("expected a number after ..");
        this.at += high[0].length;
        const members: Tla[] = [];
        for (let n = low; n <= Number(high[0]); n += 1) members.push(n);
        return { s: members };
      }
      return low;
    }
    const word = this.word();
    if (word === "TRUE") return true;
    if (word === "FALSE") return false;
    return { m: word };
  }
}

/** Read one value that is the whole of `text`. */
export function parseTla(text: string): Tla {
  const reader = new Reader(text);
  const value = reader.value();
  reader.space();
  if (reader.at !== text.length) reader.fail("something follows the value");
  return canon(value);
}

/** Read every value of a text that holds values one after another. */
export function parseTlaAll(text: string): Tla[] {
  const reader = new Reader(text);
  const values: Tla[] = [];
  for (;;) {
    reader.space();
    if (reader.at >= text.length) return values;
    values.push(canon(reader.value()));
  }
}

/** Read the variables of one state of a TLC state dump or of a
 * printed sequence: lines `/\ name = value`, the value on as many
 * lines as TLC took. */
export function parseState(text: string): Record<string, Tla> {
  const reader = new Reader(text);
  const state: Record<string, Tla> = {};
  while (reader.take("/\\")) {
    const name = reader.word();
    reader.need("=");
    state[name] = canon(reader.value());
  }
  reader.space();
  if (reader.at !== text.length) reader.fail("something follows the state");
  return state;
}

// ---------------------------------------------------------------
// Writing TLA+ text
// ---------------------------------------------------------------

/** A string as TLA+ writes it. */
export function tlaString(text: string): string {
  if (!/^[\x20-\x7e]*$/.test(text)) {
    throw new GuardError(`a TLA+ string holds printable ASCII only: ${JSON.stringify(text)}`);
  }
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A value as TLA+ text. */
export function tlaText(value: Tla): string {
  if (typeof value === "string") return tlaString(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return value < 0 ? `(${value})` : String(value);
  if ("m" in value) return value.m;
  if ("s" in value) return `{${value.s.map(tlaText).join(", ")}}`;
  if ("t" in value) return `<<${value.t.map(tlaText).join(", ")}>>`;
  if ("r" in value) {
    const names = Object.keys(value.r);
    if (names.length === 0) return "<<>>";
    return `[${names.map((name) => `${name} |-> ${tlaText(value.r[name])}`).join(", ")}]`;
  }
  return `(${value.f.map(([k, v]) => `${tlaText(k)} :> ${tlaText(v)}`).join(" @@ ")})`;
}

// ---------------------------------------------------------------
// Values of declared types
// ---------------------------------------------------------------

/** A value of a declared type as a TLA+ value. */
export function toTla(value: Value): Tla {
  if (value === null) return MISSING;
  if (Array.isArray(value)) return canon({ s: value.map(toTla) });
  return value;
}

/** Named values as a TLA+ record; no field gives the empty tuple. */
export function fieldsToTla(fields: Fields): Tla {
  const record: Record<string, Tla> = {};
  for (const [name, value] of Object.entries(fields)) record[name] = toTla(value);
  return canon({ r: record });
}

/** An event with its params as the record the declaration in TLA+
 * holds for it: the field `event` names it. */
export function callToTla(call: Call): Tla {
  const record: Record<string, Tla> = { event: call.event };
  for (const [name, value] of Object.entries(call.params)) record[name] = toTla(value);
  return canon({ r: record });
}

/** A TLA+ value as plain JSON data, a set as a list and the missing
 * value as null; undefined where JSON holds no such value. */
function toData(value: Tla): unknown {
  if (typeof value !== "object") return value;
  if ("m" in value) return value.m === "Missing" ? null : undefined;
  if ("s" in value) return value.s.map(toData);
  if ("t" in value) return value.t.length === 0 ? {} : undefined;
  if ("r" in value) {
    const record: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(value.r)) record[name] = toData(field);
    return record;
  }
  return undefined;
}

/** A TLA+ record as the named values of `declared`, or null where it
 * is no such record. */
export function fieldsFromTla(declared: Record<string, Type>, value: Tla, declaration: Declaration): Fields | null {
  try {
    return decodeFields(declared, toData(value), declaration.vocabulary);
  } catch (error) {
    if (error instanceof GuardError) return null;
    throw error;
  }
}

/** A TLA+ event record as a call, or null where it is no declared
 * event with its params. */
export function callFromTla(value: Tla, declaration: Declaration): Call | null {
  if (typeof value !== "object" || !("r" in value)) return null;
  const { event, ...params } = value.r;
  if (typeof event !== "string" || !Object.hasOwn(declaration.events, event)) return null;
  const fields = fieldsFromTla(declaration.events[event].params, canon({ r: params }), declaration);
  return fields === null ? null : { event, params: fields };
}

/** A TLA+ value as a report prints it where it is no value of a
 * declared type: `none`, `{a, b}`, `<a, b>`, `{k: v}`. */
export function showTla(value: Tla): string {
  if (typeof value !== "object") return String(value);
  if ("m" in value) return value.m === "Missing" ? "none" : value.m;
  if ("s" in value) return `{${value.s.map(showTla).join(", ")}}`;
  if ("t" in value) return `<${value.t.map(showTla).join(", ")}>`;
  if ("r" in value) {
    return `{${Object.entries(value.r)
      .map(([name, field]) => `${name}: ${showTla(field)}`)
      .join(", ")}}`;
  }
  return `{${value.f.map(([k, v]) => `${showTla(k)}: ${showTla(v)}`).join(", ")}}`;
}

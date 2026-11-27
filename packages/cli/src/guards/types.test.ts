// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: declared types and their values, as
 * binding.yaml writes a type and as the guard file and a binding's
 * module hold a value.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GuardError,
  compareFields,
  compareValues,
  decodeFields,
  decodeValue,
  differences,
  eventFault,
  fieldFault,
  parseType,
  parseYaml,
  sameFields,
  showFields,
  showType,
  showValue,
  vocabulary,
  within,
  type Type,
} from "./types.js";

const vocab = vocabulary({ user: ["cy", "ann", "bob"], plan: ["free", "paid"] });

function message(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
    return error.message;
  }
  return assert.fail("expected a GuardError, but nothing was thrown");
}

describe("types: names and values sets", () => {
  it("takes the names the declaration in TLA+ can hold", () => {
    assert.equal(fieldFault("selected"), null);
    assert.equal(fieldFault("perUser2"), null);
    assert.equal(fieldFault("Selected"), "'Selected' is not a name (a lowercase letter, then letters and digits)");
    assert.equal(fieldFault("per_user"), "'per_user' is not a name (a lowercase letter, then letters and digits)");
    assert.equal(fieldFault("__proto__"), "'__proto__' is not a name (a lowercase letter, then letters and digits)");
    assert.equal(eventFault("install"), null);
    assert.equal(eventFault("Re_new2"), null);
    assert.equal(eventFault("__proto__"), "'__proto__' is not a name (a letter, then letters, digits and _)");
    assert.equal(eventFault("two words"), "'two words' is not a name (a letter, then letters, digits and _)");
  });

  it("builds a vocabulary with each value's set and place", () => {
    assert.deepEqual(vocab.sets, { user: ["cy", "ann", "bob"], plan: ["free", "paid"] });
    assert.deepEqual(vocab.home.get("ann"), { set: "user", rank: 1 });
    assert.deepEqual(vocabulary({ odd: ['a"b', "c\\d", "e f", "acme/kit"] }).sets.odd, ['a"b', "c\\d", "e f", "acme/kit"]);
  });

  const refused: [string, Record<string, unknown[]>, string][] = [
    ["a name TLA+ cannot hold", { Users: ["a"] }, "values: 'Users' is not a name (a lowercase letter, then letters and digits)"],
    ["a word types are written with", { bool: ["a"] }, "values: 'bool' is a word types are written with"],
    ["an empty set", { user: [] }, "values user: a set needs at least one value"],
    ["a value that is no string", { user: [1] }, "values user: a value is a plain string, found 1"],
    ["the word none", { user: ["none"] }, "values user: 'none' cannot be a value"],
    ["a value with a space at its end", { user: ["ann "] }, `values user: "ann " cannot be a value (printable ASCII, no space at either end)`],
    ["a value with a line break", { user: ["a\nb"] }, `values user: "a\\nb" cannot be a value (printable ASCII, no space at either end)`],
    ["a value beyond ASCII", { user: ["安"] }, `values user: "安" cannot be a value (printable ASCII, no space at either end)`],
    ["a value twice", { user: ["ann", "ann"] }, "values user: 'ann' is listed twice"],
    ["a value in two sets", { user: ["ann"], admin: ["ann"] }, "values admin: 'ann' is also in values user; a value belongs to one set"],
  ];
  for (const [name, values, expected] of refused) {
    it(`refuses ${name}`, () => {
      assert.equal(message(() => vocabulary(values as Record<string, string[]>)), expected);
    });
  }
});

describe("types: a type as written", () => {
  const types: [string, Type][] = [
    ["bool", { kind: "bool" }],
    ["user", { kind: "value", set: "user" }],
    ["0..3", { kind: "int", min: 0, max: 3 }],
    ["-2..3", { kind: "int", min: -2, max: 3 }],
    ["user?", { kind: "optional", of: { kind: "value", set: "user" } }],
    ["0..2?", { kind: "optional", of: { kind: "int", min: 0, max: 2 } }],
    ["set of user", { kind: "set", of: { kind: "value", set: "user" } }],
    ["set of 1..4", { kind: "set", of: { kind: "int", min: 1, max: 4 } }],
    ["set of user?", { kind: "optional", of: { kind: "set", of: { kind: "value", set: "user" } } }],
  ];
  for (const [text, type] of types) {
    it(`reads and writes ${text}`, () => {
      assert.deepEqual(parseType(text, vocab), type);
      assert.equal(showType(type), text);
    });
  }

  it("reads a type written with other spacing", () => {
    assert.deepEqual(parseType("  set   of  user ? ", vocab), parseType("set of user?", vocab));
    assert.deepEqual(parseType("0 .. 3", vocab), parseType("0..3", vocab));
  });

  const refused: [unknown, string][] = [
    [3, "write the type as text, found 3"],
    ["time", `'time' is not a type or a values name in type "time"`],
    ["int 0..3", `unexpected 'int 0..3' in type "int 0..3"`],
    ["3..0", `3..0 holds no number in type "3..0"`],
    ["user??", `a type takes one '?' in type "user??"`],
    ["set of bool", `a set holds whole numbers or named values in type "set of bool"`],
    ["set of set of user", `unexpected 'set of user' in type "set of set of user"`],
    ["map user to bool", `unexpected 'map user to bool' in type "map user to bool"`],
    ["", `something is left out in type ""`],
    ["0..9999999999", `a number is beyond what TLC holds in type "0..9999999999"`],
  ];
  for (const [text, expected] of refused) {
    it(`refuses ${JSON.stringify(text)}`, () => {
      assert.equal(message(() => parseType(text, vocab)), expected);
    });
  }
});

describe("types: values", () => {
  it("reads data of each type into its one fixed form", () => {
    assert.equal(decodeValue(parseType("bool", vocab), true, vocab), true);
    assert.equal(decodeValue(parseType("0..3", vocab), 2, vocab), 2);
    assert.equal(decodeValue(parseType("user", vocab), "ann", vocab), "ann");
    assert.equal(decodeValue(parseType("user?", vocab), null, vocab), null);
    assert.deepEqual(decodeValue(parseType("set of user", vocab), ["bob", "cy"], vocab), ["cy", "bob"], "in declared order");
    assert.deepEqual(decodeValue(parseType("set of 0..3", vocab), [3, 0], vocab), [0, 3]);
    assert.equal(decodeValue(parseType("set of user?", vocab), null, vocab), null);
  });

  const refused: [string, unknown, string][] = [
    ["bool", "yes", `expected bool, found "yes"`],
    ["0..3", 4, "expected 0..3, found 4"],
    ["0..3", 1.5, "expected 0..3, found 1.5"],
    ["user", "free", `expected user, found "free"`],
    ["user", null, "expected user, found null"],
    ["user?", 3, "expected user?, found 3"],
    ["set of user", "ann", `expected set of user, found "ann"`],
    ["set of user", ["ann", "dan"], `expected set of user, found ["ann","dan"]`],
    ["set of user", ["ann", "ann"], `a value repeats in ["ann","ann"]`],
  ];
  for (const [type, data, expected] of refused) {
    it(`refuses ${JSON.stringify(data)} as ${type}`, () => {
      assert.equal(message(() => decodeValue(parseType(type, vocab), data, vocab)), expected);
    });
  }

  const declared = { who: parseType("user", vocab), seats: parseType("0..3?", vocab) };

  it("reads a record of named values, whole or in part, in declared order", () => {
    assert.deepEqual(Object.entries(decodeFields(declared, { seats: null, who: "bob" }, vocab)), [["who", "bob"], ["seats", null]]);
    assert.deepEqual(decodeFields(declared, { seats: 2 }, vocab, { partial: true }), { seats: 2 });
    assert.equal(message(() => decodeFields(declared, { who: "bob" }, vocab)), "no value for 'seats'");
    assert.equal(message(() => decodeFields(declared, { who: "bob", seats: 1, more: 1 }, vocab)), "'more' is not declared");
    assert.equal(message(() => decodeFields(declared, { who: "dan", seats: 1 }, vocab)), `who: expected user, found "dan"`);
    assert.equal(message(() => decodeFields(declared, ["bob"], vocab)), `expected named fields, found ["bob"]`);
  });

  it("compares values, records and stated fields", () => {
    assert.equal(sameFields({ who: "bob", seats: 1 }, { seats: 1, who: "bob" }), true);
    assert.equal(sameFields({ who: "bob" }, { who: "bob", seats: 1 }), false);
    assert.deepEqual(differences({ seats: 2 }, { who: "bob", seats: 2 }), []);
    assert.deepEqual(differences({ seats: 2, who: "ann" }, { who: "bob", seats: null }), [
      { field: "seats", stated: 2, observed: null },
      { field: "who", stated: "ann", observed: "bob" },
    ]);
  });

  it("orders the values of a type: none first, false, numbers rising, a set's declared order, sets by size", () => {
    const order = (type: string, values: unknown[]): unknown[] =>
      [...values].sort((a, b) => compareValues(parseType(type, vocab), a as never, b as never, vocab));
    assert.deepEqual(order("bool", [true, false]), [false, true]);
    assert.deepEqual(order("user?", ["bob", "ann", null, "cy"]), [null, "cy", "ann", "bob"]);
    assert.deepEqual(order("set of user", [["ann", "bob"], ["bob"], [], ["cy", "bob"], ["cy"]]), [[], ["cy"], ["bob"], ["cy", "bob"], ["ann", "bob"]]);
    assert.ok(compareFields(declared, { who: "cy", seats: 3 }, { who: "ann", seats: null }, vocab) < 0, "by the first field first");
    assert.ok(compareFields(declared, { who: "cy", seats: 3 }, { who: "cy", seats: null }, vocab) > 0);
  });

  it("prints a value and named values", () => {
    assert.equal(showValue(null), "none");
    assert.equal(showValue(["ann", "bob"]), "{ann, bob}");
    assert.equal(showValue([]), "{}");
    assert.equal(showFields({ who: "ann", ok: false, seats: null, held: [] }), "who=ann ok=false seats=none held={}");
    assert.equal(showFields({}), "");
  });
});

describe("types: YAML and errors", () => {
  it("names where an error was found", () => {
    assert.equal(message(() => within("file.yaml", () => within("events", () => parseType("x", vocab)))), `file.yaml: events: 'x' is not a type or a values name in type "x"`);
  });

  it("refuses YAML that does not parse or repeats a key", () => {
    assert.match(message(() => parseYaml("a: {1\n")), /^not readable as YAML — /);
    assert.match(message(() => parseYaml("a: 1\na: 2\n")), /^not readable as YAML — /);
    assert.deepEqual(parseYaml("a: [1, x]\n"), { a: [1, "x"] });
  });
});

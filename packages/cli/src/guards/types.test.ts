// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-251: declared types, values and how data is read
 * as a value.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GuardError,
  decodeFields,
  decodeValue,
  differences,
  inRange,
  mapping,
  nameFault,
  parseType,
  parseYaml,
  sameValue,
  showFields,
  showType,
  showValue,
  vocabulary,
  within,
  type Type,
} from "./types.js";

const VOCAB = vocabulary({ package: ["acme/kit", "mid/kit", "zeta/kit"], user: ["ann", "bob"] });

function message(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
    return error.message;
  }
  return assert.fail("expected a GuardError, but nothing was thrown");
}

describe("guards-3: types: vocabulary", () => {
  it("finds each value's set and place", () => {
    assert.deepEqual(VOCAB.home.get("mid/kit"), { set: "package", rank: 1 });
    assert.deepEqual(VOCAB.home.get("bob"), { set: "user", rank: 1 });
    assert.deepEqual(VOCAB.sets.package, ["acme/kit", "mid/kit", "zeta/kit"]);
  });

  const cases: [string, Record<string, unknown[]>, string][] = [
    ["a value in two sets", { a: ["x"], b: ["x"] }, "values b: 'x' is also in values a; a value belongs to one set"],
    ["a value twice", { a: ["x", "x"] }, "values a: 'x' is listed twice"],
    ["none as a value", { a: ["none"] }, "values a: 'none' cannot be a value"],
    ["true as a value", { a: ["true"] }, "values a: 'true' cannot be a value"],
    ["false as a value", { a: ["false"] }, "values a: 'false' cannot be a value"],
    ["a number as a value", { a: [1] }, "values a: a value is a plain string, found 1"],
    ["an empty set", { a: [] }, "values a: a set needs at least one value"],
    ["a quote mark", { a: ["o'k"] }, `values a: "o'k" cannot be a value (no quote mark, line break, or space at either end)`],
    ["a set named by a word", { size: ["x"] }, "values: 'size' is a word of the condition language"],
    ["a set named by a type word", { int: ["x"] }, "values: 'int' is a word types are written with"],
    ["a set name that is no name", { "a-b": ["x"] }, "values: 'a-b' is not a name (letters, digits and _, not starting with a digit)"],
  ];
  for (const [name, values, expected] of cases) {
    it(`refuses ${name}`, () => {
      assert.equal(message(() => vocabulary(values as Record<string, string[]>)), expected);
    });
  }

  it("says why a name cannot be used", () => {
    assert.equal(nameFault("standing"), null);
    assert.equal(nameFault("_x1"), null);
    assert.equal(nameFault("effect"), "'effect' is a word of the condition language");
    assert.equal(nameFault("__proto__"), "'__proto__' cannot be used as a name");
    assert.match(nameFault("1x") ?? "", /is not a name/);
  });
});

describe("guards-3: types: parseType", () => {
  const cases: [string, Type, string?][] = [
    ["bool", { kind: "bool" }],
    ["int 0..9", { kind: "int", min: 0, max: 9 }],
    ["int -3..3", { kind: "int", min: -3, max: 3 }],
    ["int 5..5", { kind: "int", min: 5, max: 5 }],
    ["package", { kind: "value", set: "package" }],
    ["package?", { kind: "optional", of: { kind: "value", set: "package" } }],
    ["set of package", { kind: "set", of: { kind: "value", set: "package" } }],
    ["set of int 1..3", { kind: "set", of: { kind: "int", min: 1, max: 3 } }],
    ["set of package?", { kind: "optional", of: { kind: "set", of: { kind: "value", set: "package" } } }],
    ["map package to bool", { kind: "map", key: "package", to: { kind: "bool" } }],
    [
      "map user to int 0..9?",
      { kind: "map", key: "user", to: { kind: "optional", of: { kind: "int", min: 0, max: 9 } } },
    ],
    [
      "(map user to int 0..9)?",
      { kind: "optional", of: { kind: "map", key: "user", to: { kind: "int", min: 0, max: 9 } } },
    ],
    [
      "map user to set of package",
      { kind: "map", key: "user", to: { kind: "set", of: { kind: "value", set: "package" } } },
    ],
    ["  int   0 .. 9  ", { kind: "int", min: 0, max: 9 }, "int 0..9"],
    ["(bool)", { kind: "bool" }, "bool"],
  ];
  for (const [text, type, shown] of cases) {
    it(`reads "${text}" and writes it back`, () => {
      assert.deepEqual(parseType(text, VOCAB), type);
      assert.equal(showType(type), shown ?? text);
    });
  }

  const errors: [unknown, string][] = [
    ["string", `'string' is not a type or a values name in type "string"`],
    ["int 9..0", `9..0 holds no number in type "int 9..0"`],
    ["int 0", `something is left out in type "int 0"`],
    ["int a..b", `expected a number after 'int' but found 'a' in type "int a..b"`],
    ["set of bool", `'bool' is not a type or a values name in type "set of bool"`],
    ["set package", `expected 'of' but found 'package' in type "set package"`],
    ["map colour to bool", `'colour' is not a values name in type "map colour to bool"`],
    ["package??", `a type takes one '?' in type "package??"`],
    ["(package?)?", `a type takes one '?' in type "(package?)?"`],
    ["bool bool", `unexpected 'bool' in type "bool bool"`],
    ["int 0..99999999999999999999", `a number is beyond the safe range in type "int 0..99999999999999999999"`],
    ["bool!", `unexpected '!' in type "bool!"`],
    [7, "write the type as text, found 7"],
    ["", `something is left out in type ""`],
  ];
  for (const [text, expected] of errors) {
    it(`refuses ${JSON.stringify(text)}`, () => {
      assert.equal(message(() => parseType(text, VOCAB)), expected);
    });
  }
});

describe("guards-4: types: decodeValue", () => {
  const type = (text: string): Type => parseType(text, VOCAB);

  const good: [string, unknown, unknown][] = [
    ["bool", true, true],
    ["int 0..9", 9, 9],
    ["package", "mid/kit", "mid/kit"],
    ["package?", null, null],
    ["package?", "acme/kit", "acme/kit"],
    ["set of package", ["zeta/kit", "acme/kit"], ["acme/kit", "zeta/kit"]],
    ["set of package", [], []],
    ["set of int 0..9", [3, 1, 2], [1, 2, 3]],
    ["set of package?", null, null],
    ["map user to bool", { bob: true, ann: false }, { ann: false, bob: true }],
    ["map user to int 0..9?", { ann: null, bob: 4 }, { ann: null, bob: 4 }],
  ];
  for (const [text, data, value] of good) {
    it(`reads ${JSON.stringify(data)} as ${text}`, () => {
      const decoded = decodeValue(type(text), data, VOCAB);
      assert.deepEqual(decoded, value);
      assert.equal(JSON.stringify(decoded), JSON.stringify(value), "members and keys are in declared order");
    });
  }

  const bad: [string, unknown, string][] = [
    ["bool", "true", `expected bool, found "true"`],
    ["bool", null, "expected bool, found null"],
    ["int 0..9", 10, "expected int 0..9, found 10"],
    ["int 0..9", -1, "expected int 0..9, found -1"],
    ["int 0..9", 1.5, "expected int 0..9, found 1.5"],
    ["int 0..9", "1", `expected int 0..9, found "1"`],
    ["package", "ann", `expected package, found "ann"`],
    ["package", "nobody", `expected package, found "nobody"`],
    ["package", null, "expected package, found null"],
    ["package?", undefined, "expected package?, found nothing"],
    ["package?", "none", `expected package?, found "none"`],
    ["set of package?", "acme/kit", `expected set of package?, found "acme/kit"`],
    ["map user to int 0..9?", { ann: 10, bob: null }, "'ann': expected int 0..9?, found 10"],
    ["set of package", "acme/kit", `expected set of package, found "acme/kit"`],
    ["set of package", ["acme/kit", "ann"], `expected set of package, found ["acme/kit","ann"]`],
    ["set of package", ["acme/kit", "acme/kit"], `a value repeats in ["acme/kit","acme/kit"]`],
    ["set of package", null, "expected set of package, found null"],
    ["map user to bool", { ann: true }, `no value for 'bob' in {"ann":true}`],
    ["map user to bool", { ann: true, bob: false, cat: true }, `'cat' is not a user in {"ann":true,"bob":false,"cat":true}`],
    ["map user to bool", { ann: true, bob: 1 }, "'bob': expected bool, found 1"],
    ["map user to bool", [true, false], "expected map user to bool, found [true,false]"],
  ];
  for (const [text, data, expected] of bad) {
    it(`refuses ${JSON.stringify(data) ?? "nothing"} as ${text}`, () => {
      try {
        decodeValue(type(text), data, VOCAB);
        assert.fail("nothing was thrown");
      } catch (error) {
        assert.ok(error instanceof GuardError);
        assert.equal(error.kind, "value");
        assert.equal(error.message, expected);
      }
    });
  }

  it("prints data that JSON cannot hold", () => {
    assert.equal(message(() => decodeValue(type("bool"), 10n, VOCAB)), "expected bool, found 10");
    const long = "x".repeat(200);
    assert.equal(
      message(() => decodeValue(type("bool"), long, VOCAB)),
      `expected bool, found "${"x".repeat(76)}...`,
    );
  });
});

describe("guards-4: types: decodeFields", () => {
  const declared = {
    placed: parseType("package?", VOCAB),
    blocked: parseType("set of package", VOCAB),
  };

  it("reads every field in declared order", () => {
    const fields = decodeFields(declared, { blocked: ["zeta/kit", "acme/kit"], placed: null }, VOCAB);
    assert.equal(JSON.stringify(fields), `{"placed":null,"blocked":["acme/kit","zeta/kit"]}`);
  });

  it("leaves out unstated fields only when partial", () => {
    assert.deepEqual(decodeFields(declared, { placed: "mid/kit" }, VOCAB, { partial: true }), { placed: "mid/kit" });
    assert.equal(message(() => decodeFields(declared, { placed: "mid/kit" }, VOCAB)), "no value for 'blocked'");
    assert.equal(
      message(() => decodeFields(declared, { placed: "mid/kit", blocked: undefined }, VOCAB)),
      "no value for 'blocked'",
    );
  });

  it("refuses an extra field, a wrong value and data that is no record", () => {
    assert.equal(
      message(() => decodeFields(declared, { placed: null, blocked: [], extra: 1 }, VOCAB)),
      "'extra' is not declared",
    );
    assert.equal(
      message(() => decodeFields(declared, { placed: "ann", blocked: [] }, VOCAB)),
      `placed: expected package?, found "ann"`,
    );
    assert.equal(message(() => decodeFields(declared, ["x"], VOCAB)), `expected named fields, found ["x"]`);
    assert.equal(message(() => decodeFields(declared, undefined, VOCAB)), "expected named fields, found nothing");
    assert.deepEqual(decodeFields({}, {}, VOCAB), {});
  });
});

describe("guards-4: types: values", () => {
  it("checks int ranges inside sets, maps and optionals", () => {
    assert.equal(inRange(parseType("int 0..3", VOCAB), 3), true);
    assert.equal(inRange(parseType("int 0..3", VOCAB), 4), false);
    assert.equal(inRange(parseType("int 0..3?", VOCAB), null), true);
    assert.equal(inRange(parseType("set of int 0..3", VOCAB), [1, 5]), false);
    assert.equal(inRange(parseType("map user to int 0..3", VOCAB), { ann: 0, bob: 3 }), true);
    assert.equal(inRange(parseType("map user to int 0..3", VOCAB), { ann: 0, bob: -1 }), false);
    assert.equal(inRange(parseType("package", VOCAB), "acme/kit"), true);
  });

  it("prints values the way output shows them", () => {
    assert.equal(showValue(null), "none");
    assert.equal(showValue(true), "true");
    assert.equal(showValue(12), "12");
    assert.equal(showValue("acme/kit"), "acme/kit");
    assert.equal(showValue([]), "{}");
    assert.equal(showValue(["acme/kit", "zeta/kit"]), "{acme/kit, zeta/kit}");
    assert.equal(showValue({ ann: 1, bob: null }), "{ann: 1, bob: none}");
    assert.equal(
      showFields({ selected: ["zeta/kit"], providing: [], placed: null }),
      "selected={zeta/kit} providing={} placed=none",
    );
    assert.equal(showFields({}), "");
  });

  it("names the stated fields the observed effect differs in", () => {
    assert.deepEqual(differences({ placed: "zeta/kit" }, { placed: "zeta/kit", blocked: ["acme/kit"] }), []);
    assert.deepEqual(differences({}, { placed: null, blocked: [] }), []);
    assert.deepEqual(
      differences({ placed: "zeta/kit", blocked: [] }, { placed: "acme/kit", blocked: ["zeta/kit"] }),
      [
        { field: "placed", stated: "zeta/kit", observed: "acme/kit" },
        { field: "blocked", stated: [], observed: ["zeta/kit"] },
      ],
    );
    assert.deepEqual(differences({ placed: null }, { placed: "acme/kit" }), [
      { field: "placed", stated: null, observed: "acme/kit" },
    ]);
  });

  it("compares values", () => {
    assert.equal(sameValue(["a", "b"], ["a", "b"]), true);
    assert.equal(sameValue(null, false), false);
    assert.equal(sameValue({ ann: 1 }, { ann: 2 }), false);
  });
});

describe("guards-1: types: errors and YAML", () => {
  it("puts where before the cause and keeps the kind", () => {
    try {
      within("a.yaml", () => within("event x", () => {
        throw new GuardError("no", "reading");
      }));
      assert.fail("nothing was thrown");
    } catch (error) {
      assert.ok(error instanceof GuardError);
      assert.equal(error.message, "a.yaml: event x: no");
      assert.equal(error.kind, "reading");
      assert.equal(error.name, "GuardError");
    }
    assert.throws(() => within("a", () => {
      throw new TypeError("other");
    }), TypeError);
  });

  it("refuses YAML that does not parse or repeats a key", () => {
    assert.match(message(() => parseYaml("a: [1")), /^not readable as YAML — /);
    assert.match(message(() => parseYaml("a: 1\na: 2\n")), /^not readable as YAML — .*unique/i);
    assert.deepEqual(parseYaml("a: { b: [1, x] }\n"), { a: { b: [1, "x"] } });
  });

  it("names an unknown key", () => {
    assert.deepEqual(mapping({ a: 1 }, ["a", "b"]), { a: 1 });
    assert.equal(message(() => mapping({ a: 1, c: 2 }, ["a", "b"])), "unknown key 'c'");
    assert.equal(message(() => mapping([1], ["a"])), "expected a mapping, found [1]");
    assert.equal(message(() => mapping(null)), "expected a mapping, found null");
  });
});

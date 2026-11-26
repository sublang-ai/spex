// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: the condition language — how it groups,
 * what each operator gives, the rules for the missing value, that
 * every well-typed condition has a value, and every kind of error
 * with its message.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compile, compileAs, compileBool, evaluate, showExprType, type Scope } from "./expr.js";
import { GuardError, parseType, vocabulary, type Fields, type Type, type Value } from "./types.js";

const VOCAB = vocabulary({ package: ["acme/kit", "mid/kit", "zeta/kit"], user: ["ann", "bob"] });
const type = (text: string): Type => parseType(text, VOCAB);

const SCOPE: Scope = {
  vocabulary: VOCAB,
  names: {
    standing: type("package?"),
    selected: type("set of package"),
    providing: type("set of package"),
    n: type("int 0..9"),
    m: type("int 0..9?"),
    flag: type("bool"),
    owns: type("map package to bool"),
    until: type("map user to int 0..9?"),
    nums: type("set of int 0..9"),
    maybe: type("set of package?"),
  },
  effect: {
    placed: type("package?"),
    blocked: type("set of package"),
    ok: type("bool"),
    count: type("int 0..99"),
  },
};

const NAMES: Fields = {
  standing: "mid/kit",
  selected: ["acme/kit", "mid/kit"],
  providing: ["mid/kit", "zeta/kit"],
  n: 3,
  m: null,
  flag: true,
  owns: { "acme/kit": false, "mid/kit": true, "zeta/kit": false },
  until: { ann: null, bob: 5 },
  nums: [1, 2, 5],
  maybe: null,
};

const EFFECT: Fields = { placed: "mid/kit", blocked: ["acme/kit"], ok: false, count: 7 };

function value(source: string): Value {
  return evaluate(compile(source, SCOPE), NAMES, EFFECT);
}

function failure(work: () => unknown): GuardError {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
    return error;
  }
  return assert.fail("expected a GuardError, but nothing was thrown");
}

const ALL = ["acme/kit", "mid/kit", "zeta/kit"];

describe("guards-8: expr: values of conditions", () => {
  const cases: [string, Value][] = [
    // literals and names
    ["true", true],
    ["false", false],
    ["none", null],
    ["42", 42],
    ["'acme/kit'", "acme/kit"],
    ["{}", []],
    ["{'zeta/kit', 'acme/kit'}", ["acme/kit", "zeta/kit"]],
    ["{3, 1, 3}", [1, 3]],
    ["{n, n + 1}", [3, 4]],
    ["standing", "mid/kit"],
    ["package", ALL],
    ["effect.placed", "mid/kit"],
    ["effect.count", 7],
    // arithmetic
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["10 - 2 - 3", 5],
    ["-n + 1", -2],
    ["2 * -3", -6],
    ["- - 2", 2],
    ["n - -1", 4],
    ["effect.count + 1", 8],
    // comparisons
    ["1 < 2", true],
    ["2 <= 2", true],
    ["3 > 4", false],
    ["n >= 3", true],
    ["'acme/kit' < 'mid/kit'", true],
    ["'zeta/kit' <= 'acme/kit'", false],
    ["'bob' > 'ann'", true],
    ["standing == 'mid/kit'", true],
    ["standing != none", true],
    ["none == none", true],
    ["m == none", true],
    ["m == 3", false],
    ["m != 3", true],
    ["selected == {'mid/kit', 'acme/kit'}", true],
    ["{} == selected", false],
    ["maybe == none", true],
    ["maybe == selected", false],
    ["owns == (map p in package: p == 'mid/kit')", true],
    ["flag == true", true],
    ["1 + 1 == 2", true],
    // not, and, or, implies
    ["true or false and false", true],
    ["(true or false) and false", false],
    ["not true or true", true],
    ["not (true or true)", false],
    ["not not flag", true],
    ["not 1 == 2", true],
    ["false implies false", true],
    ["true implies false", false],
    ["false implies true implies false", true],
    ["(false implies true) implies false", false],
    ["true implies false or true", true],
    ["1 + 1 == 2 and 2 * 2 == 4", true],
    ["not effect.ok", true],
    // in
    ["'acme/kit' in selected", true],
    ["'zeta/kit' in selected", false],
    ["standing in selected", true],
    ["m in nums", false],
    ["none in selected", false],
    ["2 in nums", true],
    ["3 in {}", false],
    ["standing in selected == true", true],
    ["1 in nums and 5 in nums", true],
    ["not 'zeta/kit' in selected", true],
    ["'zeta/kit' in selected union providing", true],
    ["'mid/kit' in selected minus providing", false],
    ["n + 2 in nums", true],
    // union, minus, intersect
    ["selected union providing", ALL],
    ["providing union selected", ALL],
    ["selected minus providing", ["acme/kit"]],
    ["selected intersect providing", ["mid/kit"]],
    ["selected union providing minus selected", ["zeta/kit"]],
    ["selected minus providing intersect selected", ["acme/kit"]],
    ["(selected minus providing) intersect providing", []],
    ["{} union {}", []],
    ["nums union {9, 0}", [0, 1, 2, 5, 9]],
    ["package minus selected", ["zeta/kit"]],
    ["{n * 2} union nums", [1, 2, 5, 6]],
    // size, min, max, default
    ["size(selected)", 2],
    ["size({})", 0],
    ["size(selected) + 1", 3],
    ["min(selected)", "acme/kit"],
    ["max(selected)", "mid/kit"],
    ["min(nums)", 1],
    ["max(nums)", 5],
    ["min({})", null],
    ["max(selected minus selected)", null],
    ["min(selected) == standing", false],
    ["default(m, 0)", 0],
    ["default(standing, 'acme/kit')", "mid/kit"],
    ["default(until['bob'], 0) + 1", 6],
    ["default(until['ann'], 0)", 0],
    ["default(maybe, {})", []],
    ["default(min(nums), 0)", 1],
    ["default(none, 4)", 4],
    ["size(default(maybe, selected))", 2],
    // indexing
    ["owns['mid/kit']", true],
    ["owns[default(standing, 'acme/kit')]", true],
    ["until['bob']", 5],
    ["until['ann']", null],
    ["(map p in package: p in selected)['zeta/kit']", false],
    // if
    ["if flag then 1 else 2", 1],
    ["if n > 5 then 'acme/kit' else none", null],
    ["if n > 5 then none else 'acme/kit'", "acme/kit"],
    ["1 + (if flag then 2 else 3)", 3],
    ["if not flag then 1 else 2 + 10", 12],
    ["(if not flag then 1 else 2) + 10", 12],
    ["if flag then 1 else 2 + 10", 1],
    ["10 + if flag then 1 else 2", 11],
    ["if false then 1 else if false then 2 else 3", 3],
    ["if flag then selected else {}", ["acme/kit", "mid/kit"]],
    // all, any
    ["all p in selected: p in package", true],
    ["any p in selected: p == 'zeta/kit'", false],
    ["all p in selected minus selected: false", true],
    ["any p in selected minus selected: true", false],
    ["all p in selected: owns[p] implies effect.placed == p", true],
    ["any x in nums: x * x == 25", true],
    ["all x in nums: x < 5 or x == 5", true],
    ["all p in selected: any q in providing: p == q", false],
    ["any p in selected: any q in providing: p == q", true],
    ["flag and all p in selected: p != 'zeta/kit'", true],
    ["all p in selected: p != 'zeta/kit' and false", false],
    ["(all p in selected: p != 'zeta/kit') and false", false],
    ["not any p in selected: p == 'zeta/kit'", true],
    // {x in S: e} and map x in V: e
    ["{p in package: p != effect.placed}", ["acme/kit", "zeta/kit"]],
    ["{x in nums: x > 1}", [2, 5]],
    ["{p in selected: false}", []],
    ["size({p in selected: owns[p]})", 1],
    ["map p in package: p in selected", { "acme/kit": true, "mid/kit": true, "zeta/kit": false }],
    ["map u in user: default(until[u], 0) + 1", { ann: 1, bob: 6 }],
    ["map u in user: none", { ann: null, bob: null }],
    ["(map p in package: effect.placed == p)['mid/kit']", true],
    // the effect
    ["effect.placed == standing", true],
    ["effect.blocked == {'acme/kit'}", true],
    ["effect.placed in effect.blocked", false],
  ];
  for (const [source, expected] of cases) {
    it(`${source}`, () => {
      const actual = value(source);
      assert.deepEqual(actual, expected);
      assert.equal(JSON.stringify(actual), JSON.stringify(expected), "sets and maps come in declared order");
    });
  }

  it("takes a YAML true, false or whole number as its text", () => {
    assert.equal(evaluate(compile(true, SCOPE), NAMES), true);
    assert.equal(evaluate(compile(false, SCOPE), NAMES), false);
    assert.equal(evaluate(compile(-4, SCOPE), NAMES), -4);
    assert.equal(compile(7, SCOPE).source, "7");
  });

  it("lists the effect fields a condition reads", () => {
    assert.deepEqual(compile("effect.placed == standing and size(effect.blocked) > 0", SCOPE).reads, [
      "blocked",
      "placed",
    ]);
    assert.deepEqual(compile("if flag then effect.count else 0", SCOPE).reads, ["count"]);
    assert.deepEqual(compile("standing != none", SCOPE).reads, []);
  });

  it("gives each condition a type", () => {
    const shown = (source: string): string => showExprType(compile(source, SCOPE).type);
    assert.equal(shown("1 + n"), "int");
    assert.equal(shown("min(selected)"), "package?");
    assert.equal(shown("min(nums)"), "int?");
    assert.equal(shown("min({})"), "none");
    assert.equal(shown("{}"), "{}");
    assert.equal(shown("none"), "none");
    assert.equal(shown("package"), "set of package");
    assert.equal(shown("default(m, 0)"), "int");
    assert.equal(shown("if flag then none else 1"), "int?");
    assert.equal(shown("if flag then {} else selected"), "set of package");
    assert.equal(shown("map p in package: none"), "map package to none");
    assert.equal(shown("map u in user: until[u]"), "map user to int?");
    assert.equal(shown("maybe"), "set of package?");
    assert.equal(shown("if flag then owns else none"), "(map package to bool)?");
  });
});

describe("guards-9: expr: every condition has a value", () => {
  it("gives the missing value for min and max of an empty set", () => {
    assert.equal(value("min(selected intersect {'zeta/kit'})"), null);
    assert.equal(value("max({x in nums: x > 5})"), null);
    assert.equal(value("default(max({x in nums: x > 5}), 0)"), 0);
  });

  const beyond: string[] = [
    "9007199254740991 + 1",
    "9007199254740991 * 2",
    "-9007199254740991 - 1",
    "0 - 9007199254740991 - n",
  ];
  for (const source of beyond) {
    it(`reports a number beyond the safe range: ${source}`, () => {
      const error = failure(() => value(source));
      assert.equal(error.kind, "reading");
      assert.equal(error.message, `a number went beyond the safe range in "${source}"`);
    });
  }

  it("keeps the largest safe numbers exact", () => {
    assert.equal(value("9007199254740990 + 1"), 9007199254740991);
    assert.equal(value("-9007199254740991"), -9007199254740991);
  });

  it("does not work out the side a result does not need", () => {
    assert.equal(value("false and 9007199254740991 + 1 > 0"), false);
    assert.equal(value("true or 9007199254740991 + 1 > 0"), true);
    assert.equal(value("false implies 9007199254740991 + 1 > 0"), true);
    assert.equal(value("if flag then 1 else 9007199254740991 + 1"), 1);
  });
});

describe("guards-9: expr: type errors, found when the condition is compiled", () => {
  const cases: [string, string][] = [
    ["1 + true", "'+' needs int on both sides, found int and bool"],
    ["flag - 1", "'-' needs int on both sides, found bool and int"],
    ["'acme/kit' * 2", "'*' needs int on both sides, found package and int"],
    ["m + 1", "'+' needs int on both sides, found int? and int"],
    ["flag and 1", "'and' needs bool on both sides, found bool and int"],
    ["1 or 2", "'or' needs bool on both sides, found int and int"],
    ["1 implies true", "'implies' needs bool on both sides, found int and bool"],
    ["not 1", "'not' needs bool, found int"],
    ["-flag", "'-' needs int, found bool"],
    ["1 == true", "'==' cannot compare int with bool"],
    ["standing != 1", "'!=' cannot compare package? with int"],
    ["'ann' == 'acme/kit'", "'==' cannot compare user with package"],
    ["selected == nums", "'==' cannot compare set of package with set of int"],
    ["owns == until", "'==' cannot compare map package to bool with map user to int?"],
    ["standing < 'mid/kit'", "'<' needs two ints or two values of one set, found package? and package"],
    ["'ann' <= 'acme/kit'", "'<=' needs two ints or two values of one set, found user and package"],
    ["flag > flag", "'>' needs two ints or two values of one set, found bool and bool"],
    ["selected >= selected", "'>=' needs two ints or two values of one set, found set of package and set of package"],
    ["1 in 2", "'in' needs a set on the right, found int"],
    ["standing in maybe", "'in' needs a set on the right, found set of package?"],
    ["1 in selected", "'in': int is never in set of package"],
    ["'ann' in selected", "'in': user is never in set of package"],
    ["selected in selected", "'in' needs an int or a named value on the left, found set of package"],
    ["flag in nums", "'in' needs an int or a named value on the left, found bool"],
    ["selected union nums", "'union': set of package and set of int do not go together"],
    ["selected minus 1", "'minus' needs sets on both sides, found set of package and int"],
    ["maybe intersect selected", "'intersect' needs sets on both sides, found set of package? and set of package"],
    ["size(n)", "'size' needs a set, found int"],
    ["size(maybe)", "'size' needs a set, found set of package?"],
    ["min(1)", "'min' needs a set, found int"],
    ["max(owns)", "'max' needs a set, found map package to bool"],
    ["default(n, 0)", "'default' needs a value that may be missing first, found int"],
    ["default(m, none)", "'default' needs a value that is always there second, found none"],
    ["default(m, m)", "'default' needs a value that is always there second, found int?"],
    ["default(m, true)", "'default': int? and bool do not go together"],
    ["if 1 then 2 else 3", "'if' needs bool before 'then', found int"],
    ["if flag then 1 else true", "'if': int and bool do not go together"],
    ["if flag then selected else nums", "'if': set of package and set of int do not go together"],
    ["all p in n: true", "'all' needs a set after 'in', found int"],
    ["any p in maybe: true", "'any' needs a set after 'in', found set of package?"],
    ["all p in {}: true", "'all' cannot tell what {} holds"],
    ["any p in selected: p", "the condition after ':' must be bool, found package"],
    ["{p in selected: 1}", "the condition after ':' must be bool, found int"],
    ["{p in n: true}", "'{ in : }' needs a set after 'in', found int"],
    ["map p in selected: true", "'map' needs a values name after 'in', found 'selected'"],
    ["all standing in selected: true", "'standing' is already a name here; pick another"],
    ["all package in selected: true", "'package' is already a name here; pick another"],
    ["all p in selected: all p in selected: true", "'p' is already a name here; pick another"],
    ["map user in user: true", "'user' is already a name here; pick another"],
    ["{standing}", "a set holds ints or named values, not package?"],
    ["{true}", "a set holds ints or named values, not bool"],
    ["{selected}", "a set holds ints or named values, not set of package"],
    ["{none}", "a set holds ints or named values, not none"],
    ["{1, 'acme/kit'}", "a set of int cannot hold package"],
    ["{'ann', 'acme/kit'}", "a set of user cannot hold package"],
    ["'nobody'", "'nobody' is in no values set"],
    ["unknown", "unknown name 'unknown'"],
    ["p", "unknown name 'p'"],
    ["(all p in selected: true) and p == p", "unknown name 'p'"],
    ["effect.nope", "the event has no effect field 'nope'"],
    ["n[1]", "'[ ]' needs a map before it, found int"],
    ["owns['ann']", "the key in '[ ]' must be package, found user"],
    ["owns[standing]", "the key in '[ ]' must be package, found package?"],
    ["until['bob'] + 1", "'+' needs int on both sides, found int? and int"],
  ];
  for (const [source, cause] of cases) {
    it(`${source}`, () => {
      const error = failure(() => compile(source, SCOPE));
      assert.equal(error.kind, "files");
      assert.equal(error.message, `${cause} in "${source}"`);
    });
  }

  it("refuses the effect where it cannot be read", () => {
    const before: Scope = { ...SCOPE, effect: null };
    assert.equal(
      failure(() => compile("effect.placed == none", before)).message,
      `effect.placed cannot be read here, before the event happens in "effect.placed == none"`,
    );
    assert.equal(evaluate(compile("standing != none", before), NAMES), true);
  });

  it("refuses a condition of the wrong type for its place", () => {
    assert.equal(failure(() => compileBool("1 + 1", SCOPE)).message, `must be bool, found int in "1 + 1"`);
    assert.equal(compileBool("n > 1", SCOPE).source, "n > 1");
    const cases: [string, string, string | null][] = [
      ["none", "package?", null],
      ["'acme/kit'", "package?", null],
      ["min(selected)", "package?", null],
      ["effect.placed", "package?", null],
      ["standing", "package", "must be package, found package?"],
      ["'ann'", "package", "must be package, found user"],
      ["{}", "set of package", null],
      ["{}", "set of int 0..3", null],
      ["selected", "set of package?", null],
      ["none", "set of package?", null],
      ["nums", "set of package", "must be set of package, found set of int"],
      ["n + 1", "int 0..9", null],
      ["m", "int 0..9", "must be int 0..9, found int?"],
      ["n", "bool", "must be bool, found int"],
      ["map p in package: none", "map package to int 0..3?", null],
      ["map p in package: 1", "map package to int 0..3?", null],
      ["map p in package: true", "map package to int 0..3?", "must be map package to int 0..3?, found map package to bool"],
      ["map u in user: 1", "map package to int 0..3", "must be map package to int 0..3, found map user to int"],
      ["owns", "(map package to bool)?", null],
      ["none", "bool", "must be bool, found none"],
    ];
    for (const [source, declared, cause] of cases) {
      if (cause === null) {
        assert.equal(compileAs(source, SCOPE, type(declared)).source, source);
      } else {
        assert.equal(failure(() => compileAs(source, SCOPE, type(declared))).message, `${cause} in "${source}"`);
      }
    }
  });
});

describe("guards-8: expr: conditions that cannot be read", () => {
  const cases: [string, string][] = [
    ["1 +", "something is left out at the end"],
    ["", "something is left out at the end"],
    ["(1", "expected ')' but found 'the end'"],
    ["1 2", "unexpected '2'"],
    ["1 < 2 < 3", "comparisons do not chain; use 'and' at '<'"],
    ["1 == 2 != false", "comparisons do not chain; use 'and' at '!='"],
    ["1 in nums in nums", "unexpected 'in'"],
    ["flag ? 1 : 2", "unexpected '?'"],
    ["n = 1", "unexpected '='"],
    ["'abc", "a quote mark is not closed"],
    ["99999999999999999999", "the number 99999999999999999999 is beyond the safe range"],
    ["effect placed", "expected '.' but found 'placed'"],
    ["effect.'x'", "expected a name but found ''x''"],
    ["if flag then 1", "expected 'else' but found 'the end'"],
    ["all p selected: true", "expected 'in' but found 'selected'"],
    ["all size in selected: true", "expected a name but found 'size'"],
    ["{p in selected}", "expected ':' but found '}'"],
    ["{1, 2", "expected '}' but found 'the end'"],
    ["then", "unexpected 'then'"],
    ["1 + * 2", "unexpected '*'"],
    ["size selected", "expected '(' but found 'selected'"],
    ["default(m)", "expected ',' but found ')'"],
    ["owns['acme/kit'", "expected ']' but found 'the end'"],
    ["map p in package true", "expected ':' but found 'true'"],
  ];
  for (const [source, cause] of cases) {
    it(`${JSON.stringify(source)}`, () => {
      assert.equal(failure(() => compile(source, SCOPE)).message, `${cause} in "${source}"`);
    });
  }

  it("refuses what is not text", () => {
    assert.equal(
      failure(() => compile(null, SCOPE)).message,
      "write the condition as text ('none' for the missing value), found nothing",
    );
    assert.equal(failure(() => compile(["a"], SCOPE)).message, `write the condition as text, found ["a"]`);
    assert.equal(failure(() => compile(1.5, SCOPE)).message, "write the condition as text, found 1.5");
  });
});

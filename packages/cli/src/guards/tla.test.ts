// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-244 and DR-252: TLA+ values as TLC prints them,
 * read, written back and compared.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MISSING,
  Unreadable,
  callFromTla,
  callToTla,
  canon,
  fieldsFromTla,
  fieldsToTla,
  key,
  parseState,
  parseTla,
  parseTlaAll,
  showTla,
  tlaString,
  tlaText,
  toTla,
} from "./tla.js";
import { GuardError, parseType, vocabulary, type Declaration } from "./types.js";

const vocab = vocabulary({ user: ["cy", "ann", "bob"] });
const declaration: Declaration = {
  vocabulary: vocab,
  events: {
    take: {
      params: { who: parseType("user", vocab) },
      effect: { granted: parseType("bool", vocab), holder: parseType("user?", vocab), waiting: parseType("set of user", vocab) },
    },
    reset: { params: {}, effect: {} },
  },
};

describe("tla: reading what TLC printed", () => {
  it("reads each form of value", () => {
    assert.equal(parseTla('"acme/kit"'), "acme/kit");
    assert.equal(parseTla('"a\\"b\\\\c"'), 'a"b\\c');
    assert.equal(parseTla("12"), 12);
    assert.equal(parseTla("-3"), -3);
    assert.equal(parseTla("TRUE"), true);
    assert.equal(parseTla("FALSE"), false);
    assert.deepEqual(parseTla("Missing"), { m: "Missing" });
    assert.deepEqual(parseTla('{"b", "a"}'), { s: ["a", "b"] });
    assert.deepEqual(parseTla("{}"), { s: [] });
    assert.deepEqual(parseTla('<<"a", 1>>'), { t: ["a", 1] });
    assert.deepEqual(parseTla("<< >>"), { t: [] });
    assert.deepEqual(parseTla('[b |-> 1, a |-> {"x"}]'), { r: { a: { s: ["x"] }, b: 1 } });
    assert.deepEqual(parseTla('("b" :> 1 @@ "a" :> 2)'), { f: [["a", 2], ["b", 1]] });
    assert.deepEqual(parseTla("1..3"), { s: [1, 2, 3] });
    // TLC prints a function over strings as a record, and a key may start with a digit.
    assert.deepEqual(parseTla("[1a |-> 1, 2b |-> FALSE]"), { r: { "1a": 1, "2b": false } });
  });

  it("reads a value TLC wrapped over several lines", () => {
    const wrapped = `[ from |-> [standing |-> Missing],
  event |->
      [ event |-> "install",
        selected |-> {"zeta/kit"},
        providing |-> {"acme/kit", "mid/kit"} ],
  applies |-> FALSE ]`;
    assert.deepEqual(parseTla(wrapped), {
      r: {
        applies: false,
        event: { r: { event: "install", providing: { s: ["acme/kit", "mid/kit"] }, selected: { s: ["zeta/kit"] } } },
        from: { r: { standing: { m: "Missing" } } },
      },
    });
  });

  it("holds equal values in one form whatever order TLC printed them in", () => {
    assert.equal(key(parseTla('[b |-> {2, 1}, a |-> "x"]')), key(parseTla('[a |-> "x", b |-> {1, 2, 2}]')));
    assert.notEqual(key(parseTla('{"1"}')), key(parseTla("{1}")));
    assert.notEqual(key(parseTla('"Missing"')), key(parseTla("Missing")));
    assert.deepEqual(canon({ r: {} }), { t: [] }, "a record of no field is the empty tuple");
    assert.deepEqual(canon({ f: [] }), { t: [] });
  });

  it("reads the values a file printed one after another, and the variables of a state", () => {
    assert.deepEqual(parseTlaAll('<<"case", "a", 1, [pass |-> TRUE]>>\n<<"applied", "a", FALSE>>\n'), [
      { t: ["case", "a", 1, { r: { pass: true } }] },
      { t: ["applied", "a", false] },
    ]);
    assert.deepEqual(parseTlaAll(""), []);
    assert.deepEqual(parseState('/\\ state = [holder |-> Missing]\n/\\ step = Missing\n'), {
      state: { r: { holder: { m: "Missing" } } },
      step: { m: "Missing" },
    });
  });

  it("refuses what is no value", () => {
    assert.throws(() => parseTla('{"a"'), Unreadable);
    assert.throws(() => parseTla('"a" "b"'), Unreadable);
    assert.throws(() => parseTla('"never ends'), Unreadable);
    assert.throws(() => parseState("state = 1"), Unreadable);
  });
});

describe("tla: writing TLA+ text", () => {
  it("writes a value TLC reads back as the same value", () => {
    const values = ['"a\\"b\\\\c d"', "12", "TRUE", "Missing", '{"a", "b"}', '<<"a", 1>>', '[a |-> {"x"}, b |-> 1]', '("a" :> 2 @@ "b" :> 1)', "<<>>"];
    for (const text of values) assert.equal(tlaText(parseTla(text)), text);
    assert.equal(tlaText({ r: {} }), "<<>>");
    assert.equal(tlaText(-3), "(-3)", "a negative number in parentheses");
  });

  it("refuses a string TLA+ cannot hold", () => {
    assert.equal(tlaString('say "hi" \\ bye'), '"say \\"hi\\" \\\\ bye"');
    assert.throws(() => tlaString("café"), GuardError);
    assert.throws(() => tlaString("a\nb"), GuardError);
  });
});

describe("tla: values of declared types", () => {
  it("turns a call and an effect into TLA+ values and back", () => {
    const call = { event: "take", params: { who: "ann" } };
    assert.equal(tlaText(callToTla(call)), '[event |-> "take", who |-> "ann"]');
    assert.deepEqual(callFromTla(parseTla('[who |-> "ann", event |-> "take"]'), declaration), call);
    assert.equal(tlaText(callToTla({ event: "reset", params: {} })), '[event |-> "reset"]');
    assert.deepEqual(callFromTla(parseTla('[event |-> "reset"]'), declaration), { event: "reset", params: {} });

    const effect = { granted: false, holder: null, waiting: ["cy", "bob"] };
    assert.equal(tlaText(fieldsToTla(effect)), '[granted |-> FALSE, holder |-> Missing, waiting |-> {"bob", "cy"}]');
    assert.deepEqual(fieldsFromTla(declaration.events.take.effect, parseTla('[waiting |-> {"bob", "cy"}, holder |-> Missing, granted |-> FALSE]'), declaration), effect);
    assert.equal(tlaText(fieldsToTla({})), "<<>>");
    assert.deepEqual(fieldsFromTla({}, parseTla("<< >>"), declaration), {});
    assert.deepEqual(toTla(null), MISSING);
  });

  it("gives null for a value that is none of the declared ones", () => {
    assert.equal(fieldsFromTla(declaration.events.take.effect, parseTla('[granted |-> TRUE, holder |-> "dan", waiting |-> {}]'), declaration), null);
    assert.equal(fieldsFromTla(declaration.events.take.effect, parseTla("[granted |-> TRUE]"), declaration), null);
    assert.equal(fieldsFromTla(declaration.events.take.effect, parseTla("7"), declaration), null);
    assert.equal(callFromTla(parseTla('[event |-> "leave"]'), declaration), null);
    assert.equal(callFromTla(parseTla('[event |-> "take", who |-> Other]'), declaration), null);
  });

  it("prints a value of no declared type in Spex's own way", () => {
    assert.equal(showTla(parseTla('[holder |-> Missing, queue |-> 5, w |-> {"a"}, t |-> <<1, TRUE>>]')), "{holder: none, queue: 5, t: <1, true>, w: {a}}");
    assert.equal(showTla(parseTla('("a" :> 2)')), "{a: 2}");
  });
});

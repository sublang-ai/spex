// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-244 and DR-252: the form of a translation, as
 * its text shows it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bare, formFaults, translationNameFault, type FormFault } from "./translation.js";

const TEXT = `---- MODULE a ----
EXTENDS Declaration, FiniteSets

\\* The model's state. CHOOSE and INSTANCE are words of this comment only.
Start == [held |-> {}]  (* a note with VARIABLE (* nested *) in it *)

Legal(s, e) == TRUE
Effect(s, e) == [ok |-> e.who \\in s.held, note |-> "ASSUME nothing"]
After(s,
      e) ==
  s
When(e)==e.event = "use"
While(s, e) == TRUE
Shall(s, e, f) ==
  f.ok
====
`;

function faults(text: string, name = "a"): FormFault[] {
  return formFaults({ name, file: `guards/g/translations/${name}.tla`, text });
}

describe("translation: the check of form", () => {
  it("takes a module that defines the seven operators, whatever its comments and strings say", () => {
    assert.deepEqual(faults(TEXT), []);
    assert.deepEqual(faults(TEXT.replace(/\n/g, "\r\n")), []);
  });

  it("blanks comments and strings, every other character in its place", () => {
    const code = bare(TEXT);
    assert.equal(code.length, TEXT.length);
    assert.equal(code.split("\n").length, TEXT.split("\n").length);
    assert.ok(!/CHOOSE|INSTANCE|VARIABLE|ASSUME/.test(code));
    assert.ok(code.includes("Start == [held |-> {}]"));
    assert.equal(bare('x == "a\\"b" \\* c'), 'x == "    "     ');
  });

  it("names every word a translation may not hold, with its place", () => {
    const found = faults(
      TEXT.replace("EXTENDS Declaration, FiniteSets", "EXTENDS Declaration, FiniteSets\nCONSTANT Limit\nVARIABLES x").replace(
        "While(s, e) == TRUE",
        "While(s, e) == (CHOOSE u \\in s.held : TRUE) = e.who",
      ),
    );
    assert.deepEqual(found, [
      { line: 3, col: 1, message: "CONSTANT is not for a translation: a translation declares no constant" },
      { line: 4, col: 1, message: "VARIABLES is not for a translation: a translation declares no variable" },
      {
        line: 15,
        col: 17,
        message:
          "CHOOSE is not for a translation: choose among declared values with <Values>First or <Values>Rank, so no answer rests on TLC's own order",
      },
    ]);
    for (const word of ["INSTANCE", "CONSTANTS", "VARIABLE", "ASSUME", "ASSUMPTION", "AXIOM"]) {
      const one = faults(TEXT.replace("Legal(s, e) == TRUE", `${word} X\nLegal(s, e) == TRUE`));
      assert.equal(one.length, 1, word);
      assert.equal(one[0].line, 7);
      assert.ok(one[0].message.startsWith(`${word} is not for a translation: `));
    }
    assert.deepEqual(faults(TEXT.replace("Legal(s, e) == TRUE", "Legal(s, e) == ASSUMED(s)\nASSUMED(s) == TRUE")), [], "a word is refused, not a name that holds it");
  });

  it("refuses a prime, ENABLED and UNCHANGED: a translation speaks of the state it is given", () => {
    const why = "a translation speaks of the state it is given, never of the next";
    assert.deepEqual(faults(TEXT.replace("Legal(s, e) == TRUE", "Legal(s, e) == s' = s")), [
      { line: 7, col: 17, message: `' is not for a translation: ${why}` },
    ]);
    assert.deepEqual(faults(TEXT.replace("Legal(s, e) == TRUE", "Legal(s, e) == ENABLED TRUE")), [
      { line: 7, col: 16, message: `ENABLED is not for a translation: ${why}` },
    ]);
    assert.deepEqual(faults(TEXT.replace("Legal(s, e) == TRUE", "Legal(s, e) == UNCHANGED s")), [
      { line: 7, col: 16, message: `UNCHANGED is not for a translation: ${why}` },
    ]);
    assert.deepEqual(faults(TEXT.replace("Legal(s, e) == TRUE", 'Legal(s, e) == "it\'s" = "x" \\* the lock\'s holder')), [], "a prime in a string or a comment is none");
  });

  it("ends a line, and a comment, at a lone carriage return, as TLC does", () => {
    // For TLC the text after the carriage return is code: so it is here.
    const hidden = TEXT.replace("Legal(s, e) == TRUE", "\\* a note\rPick(S) == CHOOSE x \\in S : TRUE\nLegal(s, e) == TRUE");
    const found = faults(hidden);
    assert.equal(found.length, 1);
    assert.deepEqual({ line: found[0].line, col: found[0].col }, { line: 8, col: 12 }, "the place is the one TLC names");
    assert.ok(found[0].message.startsWith("CHOOSE is not for a translation: "));
  });

  it("names an operator left out and one with other parameters", () => {
    assert.deepEqual(faults(TEXT.replace("When(e)==", "Whenever(e)==")), [{ line: null, col: null, message: "it does not define When(e)" }]);
    assert.deepEqual(faults(TEXT.replace("Start == [held |-> {}]", "  Start == [held |-> {}]")), [{ line: null, col: null, message: "it does not define Start" }]);
    assert.deepEqual(faults(TEXT.replace("Shall(s, e, f) ==", "Shall(s, e) ==")), [
      { line: 14, col: 1, message: "it defines Shall with 2 parameters, not as Shall(s, e, f)" },
    ]);
    assert.deepEqual(faults(TEXT.replace("Start ==", "Start(x) ==")), [{ line: 5, col: 1, message: "it defines Start with 1 parameter, not as Start" }]);
  });

  it("wants one MODULE line that names the file", () => {
    const expected = [{ line: null, col: null, message: "the file holds one line ---- MODULE a ----, and no other MODULE line" }];
    assert.deepEqual(faults(TEXT.replace("MODULE a", "MODULE b")), expected);
    assert.deepEqual(faults(`${TEXT}---- MODULE c ----\n====\n`), expected);
    assert.deepEqual(faults(TEXT.replace("---- MODULE a ----\n", "")), expected);
  });

  it("refuses a name a file could not carry beside TLC's and Spex's own", () => {
    assert.equal(translationNameFault("a"), null);
    assert.equal(translationNameFault("by_claude_2"), null);
    for (const name of ["A", "2a", "a-b", "a.b", ""]) {
      assert.equal(translationNameFault(name), "a translation's name is a lowercase letter, then lowercase letters, digits and _");
    }
    for (const name of ["declaration", "naturals", "integers", "finitesets", "sequences", "tlc", "spexcases", "spex"]) {
      assert.equal(translationNameFault(name), `'${name}' is the name of a file TLC or Spex loads; pick another`);
    }
  });
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-31), DR-244 and DR-252: `spex verify` on
 * variants of the fixture project of `guards-fixture.test.ts`, each
 * with one error that leaves the guard one that cannot be checked.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TLC_PIN } from "./tlc.js";
import {
  A,
  B,
  BINDING_YAML,
  DECLARATION,
  GUARD_FILE,
  GUARD_YAML,
  TRANSLATIONS,
  TRANSLATION_A,
  TRANSLATION_B,
  cannot,
  scratch,
  swap,
  useFixture,
} from "./guards-fixture.test.js";

useFixture();

describe("spex verify: a guard that cannot be checked", { concurrency: 3 }, () => {
  it("every translation's errors of form are printed, each with its file and place, before any other check", async () => {
    const lines = await cannot({
      [A]: swap(TRANSLATION_A, "UserFirst(s.waiting), waiting", "(CHOOSE u \\in s.waiting : TRUE), waiting"),
      [B]: swap(TRANSLATION_B, "Holder(s) == s[1]", "Holder(s) = = s[1]"),
    });
    assert.deepEqual(lines, [
      `  Cannot be checked — ${A}:22:28: CHOOSE is not for a translation: choose among declared values with <Values>First or <Values>Rank, so no answer rests on TLC's own order`,
      `  Cannot be checked — ${B}:7:1: Was expecting "==== or more Module body" Encountered "Holder" at line 7, column 1 and token ">>"`,
    ]);
  });

  it("an operator left out, one with other parameters, an unknown name and a file that may not be loaded", async () => {
    assert.deepEqual(await cannot({ [A]: swap(TRANSLATION_A, "When(e) ==", "Whenever(e) ==") }), [
      `  Cannot be checked — ${A}: it does not define When(e)`,
    ]);
    assert.deepEqual(await cannot({ [A]: swap(TRANSLATION_A, "While(s, e) ==", "While(e) ==") }), [
      `  Cannot be checked — ${A}:34:1: it defines While with 1 parameter, not as While(s, e)`,
    ]);
    assert.deepEqual(await cannot({ [B]: swap(TRANSLATION_B, "e.who = Holder(s)", "e.who = Holdr(s)") }), [
      `  Cannot be checked — ${B}:12:42: Unknown operator: \`Holdr'.`,
    ]);
    assert.deepEqual(await cannot({ [B]: swap(TRANSLATION_B, "EXTENDS Declaration", "EXTENDS Declaration, TLC") }), [
      `  Cannot be checked — ${B}: it loads the module TLC; a translation loads only Declaration, Naturals, Integers, FiniteSets, Sequences`,
    ]);
  });

  it("an expression TLC cannot evaluate is told with its place in the translation and the sequence that reached it", async () => {
    // A leave with no user waiting asks for the first of an empty set.
    const lines = await cannot({
      [A]: swap(
        TRANSLATION_A,
        `         IF s.waiting = {}
         THEN [holder |-> Missing, waiting |-> {}]
         ELSE [holder |-> UserFirst(s.waiting), waiting |-> s.waiting \\ {UserFirst(s.waiting)}]`,
        "         [holder |-> UserFirst(s.waiting), waiting |-> s.waiting \\ {UserFirst(s.waiting)}]",
      ),
    });
    assert.deepEqual(lines, [
      `  Cannot be checked — ${A}:20:22: Attempted to compute the value of an expression of form CHOOSE x \\in S: P, but no element of S satisfied P.`,
      "    TLC met it on the model, after this sequence",
      "      1. take who=ann -> granted=true holder=ann waiting={}",
    ]);

    // A definition that calls itself without end, reached only with two users waiting:
    // TLC prints no sequence for it, and Java's stack is left out.
    const looping = await cannot({
      [A]: swap(
        swap(TRANSLATION_A, "After(s, e) ==", "RECURSIVE Loop(_)\nLoop(S) == IF Cardinality(S) = 2 THEN Loop(S) ELSE S\n\nAfter(s, e) =="),
        "ELSE [holder |-> s.holder, waiting |-> s.waiting \\cup {e.who}]",
        "ELSE [holder |-> s.holder, waiting |-> Loop(s.waiting \\cup {e.who})]",
      ),
      [B]: null,
    });
    assert.deepEqual(looping, [
      `  Cannot be checked — ${A}: This was a Java StackOverflowError. It was probably the result of an incorrect recursive function definition that caused TLC to enter an infinite loop when trying to compute the function or its application to an element in its putative domain.`,
      "    TLC met it on the model",
    ]);
  });

  it("an effect of the model that is no declared effect is told with its sequence", async () => {
    const lines = await cannot({
      [A]: swap(TRANSLATION_A, "queue |-> Cardinality(After(s, e).waiting)]", "queue |-> Cardinality(After(s, e).waiting) + 5]"),
      [B]: null,
    });
    assert.deepEqual(lines, [
      `  Cannot be checked — ${A}: the model gives leave an effect the declaration does not hold: {holder: none, queue: 5}`,
      "    TLC met it on the model, at step 2 of this sequence",
      "      1. take who=ann -> granted=true holder=ann waiting={}",
      "      2. leave who=ann",
    ]);

    // The same in a translation that is not the judging one: the comparison names it.
    const other = await cannot({
      [B]: swap(TRANSLATION_B, "queue |-> Cardinality(n[2])]", "queue |-> Cardinality(n[2]) + 5]"),
    });
    assert.deepEqual(other, [
      `  Cannot be checked — ${B}: the model gives leave an effect the declaration does not hold: {holder: none, queue: 5}`,
      "    TLC met it comparing the translations, at step 2 of this sequence",
      "      1. take who=ann -> granted=true holder=ann waiting={}",
      "      2. leave who=ann",
    ]);
  });

  it("a guard file, a declaration or a translation's name that does not load is told with its file", async () => {
    assert.deepEqual(await cannot({ [GUARD_FILE]: swap(GUARD_YAML, "limits: { seconds: 60 }", "limits: { runs: 4, seconds: 60 }") }), [
      `  Cannot be checked — ${GUARD_FILE}: limits: unknown key 'runs'`,
    ]);
    assert.deepEqual(await cannot({ [GUARD_FILE]: swap(GUARD_YAML, "seconds: 60", "seconds: 99999999") }), [
      `  Cannot be checked — ${GUARD_FILE}: limits.seconds must be a whole number from 1 to 2147483, found 99999999`,
    ]);
    assert.deepEqual(await cannot({ [DECLARATION]: swap(BINDING_YAML, "user: [ann, bob, cy]", "user: [ann, bob, cy]\n  row: [x]") }), [
      `  Cannot be checked — ${DECLARATION}: values: 'row' cannot name a values set: the declaration in TLA+ would define Row, which is taken`,
    ]);
    assert.deepEqual(await cannot({ [`${TRANSLATIONS}/Upper.tla`]: TRANSLATION_A }), [
      `  Cannot be checked — ${TRANSLATIONS}/Upper.tla: a translation's name is a lowercase letter, then lowercase letters, digits and _`,
    ]);
    assert.deepEqual(await cannot({ [A]: null, [B]: null }), [
      `  Cannot be checked — ${TRANSLATIONS}: no translation; a guard needs two or more`,
    ]);
  });

  it("without Java, or with SPEX_TLC_JAR naming no file, the guard cannot be checked and says what to set", async () => {
    const empty = join(scratch, "no-java");
    mkdirSync(empty, { recursive: true });
    assert.deepEqual(await cannot({}, { PATH: empty, JAVA_HOME: null }), [
      "  Cannot be checked — Java was not found: spex verify runs TLC, which needs Java 11 or later — install one, or set JAVA_HOME to one",
    ]);
    const missing = join(scratch, "no-such.jar");
    assert.deepEqual(await cannot({}, { SPEX_TLC_JAR: missing }), [
      `  Cannot be checked — SPEX_TLC_JAR names ${missing}, which is no file — set it to a tla2tools.jar, or unset it for Spex to download TLC ${TLC_PIN.version}`,
    ]);
    // A file that holds no TLC: Java says so, and no translation is named.
    const other = join(scratch, "no-tlc.jar");
    writeFileSync(other, "not a jar\n");
    const lines = await cannot({}, { SPEX_TLC_JAR: other });
    assert.equal(lines.length, 1, "one cause, whichever run of TLC ended first");
    assert.match(lines[0], /^ {2}Cannot be checked — Java ended with status \d+ before TLC started: .*tlc2\.TLC/);
    assert.ok(
      lines[0].endsWith(
        ` — SPEX_TLC_JAR names ${other}, which is not the pinned tla2tools.jar: set it to a tla2tools.jar, or unset it for Spex to download TLC ${TLC_PIN.version}`,
      ),
      lines[0],
    );
    assert.ok(!lines[0].includes(TRANSLATIONS), "no translation is named");
  });
});

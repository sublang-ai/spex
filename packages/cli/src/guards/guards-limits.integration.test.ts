// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-32, guards-33), DR-244 and DR-252: `spex
 * verify` on variants of the fixture project of
 * `guards-fixture.test.ts` in which one thing reaches the time limit:
 * the model's check, the run of TLC that judges the code's effects,
 * and a command of the binding. Each scenario waits for the limit, so
 * they are kept in a file of their own, apart from the suites whose
 * runs would slow the others they wait beside.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  A,
  B,
  BINDING_YAML,
  CODE,
  DECLARATION,
  GUARD_FILE,
  GUARD_YAML,
  SRC,
  TRANSLATION_A,
  lineOf,
  swap,
  under,
  useFixture,
  withinLimit,
} from "./guards-fixture.test.js";

useFixture();

describe("spex verify: what reaches the time limit", { concurrency: 3 }, () => {
  /** What every run prints where the code is not tested. */
  function untested(ran: { lines: string[]; code: number | null; stdout: string }, why: string): void {
    assert.equal(lineOf(ran.lines, "  On the code:"), `  On the code: not tested — ${why}`, ran.stdout);
    assert.equal(lineOf(ran.lines, "  Result:"), "  Result: Inconclusive");
    assert.equal(lineOf(ran.lines, "  Kept fault"), `  Kept fault grants-twice: not tried — ${why}`);
    assert.ok(ran.lines.includes("    no Git revision, no files copied"), ran.stdout);
    assert.equal(ran.code, 1);
  }

  it("a model TLC cannot finish in the time limit leaves the guard Inconclusive", async () => {
    // The model counts every reset: it reaches states without end. Each count is made slow
    // to work out, so TLC's table stays small however long the limit is.
    const endless = swap(
      swap(TRANSLATION_A, "Start == [holder |-> Missing, waiting |-> {}]", "Start == [holder |-> Missing, waiting |-> {}, resets |-> 0]"),
      '[] e.event = "reset" -> Start',
      '[] e.event = "reset" -> [holder |-> Missing, waiting |-> {}, resets |-> s.resets + Cardinality({x \\in SUBSET (1..14) : TRUE}) - 16383]',
    )
      .replace("THEN [holder |-> e.who, waiting |-> {}]", "THEN [holder |-> e.who, waiting |-> {}, resets |-> s.resets]")
      .replace("ELSE [holder |-> s.holder, waiting |-> s.waiting \\cup {e.who}]", "ELSE [holder |-> s.holder, waiting |-> s.waiting \\cup {e.who}, resets |-> s.resets]")
      .replace("THEN [holder |-> Missing, waiting |-> {}]", "THEN [holder |-> Missing, waiting |-> {}, resets |-> s.resets]")
      .replace(
        "ELSE [holder |-> UserFirst(s.waiting), waiting |-> s.waiting \\ {UserFirst(s.waiting)}]",
        "ELSE [holder |-> UserFirst(s.waiting), waiting |-> s.waiting \\ {UserFirst(s.waiting)}, resets |-> s.resets]",
      );
    // Only the model's run is to reach the limit, not the runs that read the file and evaluate the cases.
    const { ran, seconds } = await withinLimit(
      (limit) => ({ [A]: endless, [B]: null, [GUARD_FILE]: swap(GUARD_YAML, "seconds: 60", `seconds: ${limit}`) }),
      /TLC was stopped after \d+ seconds? while it (read the file|evaluated the cases)/,
    );
    assert.equal(lineOf(ran.lines, "  On the model:"), `  On the model: not checked — TLC was stopped after ${seconds} seconds`);
    untested(ran, "the model was not checked");
    assert.deepEqual(under(ran.lines, "  Result:")[0], `    a timeout: TLC was stopped after ${seconds} seconds while it checked the model`);
    assert.equal(lineOf(ran.lines, "    limits:"), `    limits: ${seconds} seconds for each run of TLC and each command`);
  });

  it("where the run of TLC that judges the code's effects is stopped, the steps it left are counted as not judged", async () => {
    // The rule takes without end to say whether a refused take that moves the lock is
    // forbidden. No case and no step of the model asks that; the code does, where cy
    // takes the lock bob holds, which no case reaches.
    const slow = swap(
      TRANSLATION_A,
      "Shall(s, e, f) == ~f.granted /\\ f.holder = s.holder /\\ e.who \\in f.waiting",
      "Shall(s, e, f) ==\n  IF ~f.granted /\\ f.holder # s.holder\n  THEN \\A x \\in SUBSET (1..40) : x # {41}\n  ELSE ~f.granted /\\ f.holder = s.holder /\\ e.who \\in f.waiting",
    );
    const moves = swap(
      CODE,
      "  if (lock.holder === null) {",
      '  if (lock.holder === "bob" && who === "cy") {\n    lock.waiting.push(who);\n    lock.holder = who;\n    return false;\n  }\n  if (lock.holder === null) {',
    );
    // Only the judging runs are to reach the limit: the one for the project's code, and
    // the one for the kept fault's copy.
    const { ran, seconds } = await withinLimit(
      (limit) => ({ [A]: slow, [B]: null, [SRC]: moves, [GUARD_FILE]: swap(GUARD_YAML, "seconds: 60", `seconds: ${limit}`) }),
      /TLC was stopped after \d+ seconds? while it (read the file|evaluated the cases)|not checked — TLC was stopped|a timeout: not done after/,
    );
    // The two takes by cy of the lock bob holds, with no one or with ann waiting, are not
    // judged; the five steps after them are not reached; and the counts add up to 40.
    assert.deepEqual(
      [lineOf(ran.lines, "  On the code:"), ...under(ran.lines, "  On the code:")],
      [
        "  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 33 gave the model's effect, 0 an effect the rule forbids, 0 another effect, 5 not reached, 2 not judged",
        "    the 2 permitted cases went as their steps state",
      ],
      ran.stdout,
    );
    assert.equal(lineOf(ran.lines, "  Result:"), "  Result: Inconclusive", "no higher row was found without them");
    assert.deepEqual(under(ran.lines, "  Result:")[0], `    a timeout: TLC was stopped after ${seconds} seconds while it judged the effects the code gave`);
    assert.equal(
      lineOf(ran.lines, "  Kept fault"),
      `  Kept fault grants-twice: not caught — TLC was stopped after ${seconds} seconds while it judged the effects the code gave`,
    );
    assert.equal(ran.lines.at(-1), "  Does not pass — only one translation; the result is Inconclusive; kept fault grants-twice not caught");
    assert.equal(ran.code, 1);
  });

  it("a command that does not end in the time limit is a timeout", async () => {
    // Only the command is to reach the limit, no run of TLC; the command
    // is run again for the kept fault's copy.
    const { ran: slow, seconds } = await withinLimit(
      (limit) => ({
        [DECLARATION]: `${BINDING_YAML}commands:\n  - [node, -e, "setTimeout(() => {}, 600000)"]\n`,
        [GUARD_FILE]: swap(GUARD_YAML, "seconds: 60", `seconds: ${limit}`),
      }),
      /TLC was stopped after/,
    );
    assert.equal(lineOf(slow.lines, "  On the code:"), "  On the code: not tested");
    assert.deepEqual(under(slow.lines, "  Result:")[0], `    a timeout: not done after ${seconds} seconds`);
    assert.equal(lineOf(slow.lines, "  Kept fault"), `  Kept fault grants-twice: not caught — a timeout: not done after ${seconds} seconds`);
  });
});

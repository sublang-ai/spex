// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-33), DR-243 and DR-244: `spex verify` on
 * variants of the fixture project of `guards-fixture.test.ts`, each
 * with one change to its code: the results a test on the code gives.
 * A failing binding is in `guards-binding.integration.test.ts`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CODE,
  FAULT_CAUGHT,
  NEXT,
  SRC,
  WAITS,
  lineOf,
  swap,
  under,
  useFixture,
  verified,
} from "./guards-fixture.test.js";

useFixture();

describe("spex verify: the tests on a copy of the code", { concurrency: 3 }, () => {
  it("code that gives an effect the rule forbids is Violated on the code, with the sequence and both effects", async () => {
    const ran = await verified({ [SRC]: swap(CODE, "  lock.waiting.push(who);\n  return false;", "  lock.waiting.push(who);\n  return true;") });
    assert.deepEqual(
      [lineOf(ran.lines, "  On the code:"), ...under(ran.lines, "  On the code:")],
      [
        "  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 10 gave the model's effect, 6 an effect the rule forbids, 0 another effect, 24 not reached",
        "    1 of 2 permitted cases went as their steps state",
        `    Violated on the code — found at step 2 of the permitted case "${WAITS}"`,
        "      1. take who=ann -> granted=true holder=ann waiting={}",
        "      2. take who=bob",
        "         the model gives granted=false holder=ann waiting={bob}",
        "         the code gave   granted=true holder=ann waiting={bob}",
        "         forbidden by the rule",
        `    Case failed — case "${WAITS}", step 2, field granted: stated false, observed true`,
      ],
      ran.stdout,
    );
    assert.equal(lineOf(ran.lines, "  Result:"), "  Result: Violated on the code");
    assert.ok(!ran.lines.some((line) => line.includes("assumes:")), "only the passing result states what it assumes");
    assert.equal(lineOf(ran.lines, "  Kept fault"), "  Kept fault grants-twice: not caught — the patch does not apply: the change at line 10 of src/lock.mjs matches nowhere in the file");
    assert.equal(ran.lines.at(-1), "  Does not pass — the result is Violated on the code; kept fault grants-twice not caught");
    assert.equal(ran.code, 1);
  });

  it("code that gives another effect the rule does not forbid is Code differs from the model", async () => {
    const ran = await verified({ [SRC]: swap(CODE, "lock.waiting.shift()", "lock.waiting.pop()") });
    assert.deepEqual(
      [lineOf(ran.lines, "  On the code:"), ...under(ran.lines, "  On the code:")],
      [
        "  On the code: 40 steps tested, each after a shortest sequence from a fresh start: 37 gave the model's effect, 0 an effect the rule forbids, 3 another effect, 0 not reached",
        "    1 of 2 permitted cases went as their steps state",
        "    Code differs from the model — found at step 4 of this sequence",
        "      1. take who=ann -> granted=true holder=ann waiting={}",
        "      2. take who=bob -> granted=false holder=ann waiting={bob}",
        "      3. take who=cy -> granted=false holder=ann waiting={bob, cy}",
        "      4. leave who=ann",
        "         the model gives holder=bob queue=1",
        "         the code gave   holder=cy queue=1",
        "         not forbidden by the rule",
        `    Case failed — case "${NEXT}", step 4, field holder: stated bob, observed cy`,
      ],
      ran.stdout,
    );
    assert.equal(lineOf(ran.lines, "  Result:"), "  Result: Code differs from the model");
    assert.deepEqual(under(ran.lines, "  Kept fault"), FAULT_CAUGHT.slice(1), "the kept fault is tried all the same");
    assert.equal(ran.lines.at(-1), "  Does not pass — the result is Code differs from the model");
  });

  it("a permitted case that does not go as stated, on a path no shortest sequence takes, is Case failed", async () => {
    // The code passes the lock to whoever waited first, so only the order
    // of the takes tells it from the model. TLC's order is fixed by its
    // inputs, one worker going breadth first: its shortest sequence to a
    // held lock with two users waiting takes them in the declared order,
    // and only the case, where cy takes before bob, shows the difference.
    const queue = swap(CODE, "  lock.waiting.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));\n", "");
    const ran = await verified({ [SRC]: queue });
    assert.deepEqual(
      [lineOf(ran.lines, "  On the code:"), ...under(ran.lines, "  On the code:")],
      [
        "  On the code: 40 steps tested, each after a shortest sequence from a fresh start: each gave the model's effect",
        "    1 of 2 permitted cases went as their steps state",
        `    Case failed — case "${NEXT}", step 4, field holder: stated bob, observed cy`,
      ],
      ran.stdout,
    );
    assert.equal(lineOf(ran.lines, "  Result:"), "  Result: Case failed");
    assert.deepEqual(under(ran.lines, "  Kept fault"), FAULT_CAUGHT.slice(1), "the kept fault is tried all the same");
    assert.equal(ran.lines.at(-1), "  Does not pass — the result is Case failed");
    assert.equal(ran.code, 1);
  });
});

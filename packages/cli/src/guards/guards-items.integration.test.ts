// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-32), DR-243 and DR-244: `spex verify` on
 * variants of the fixture project of `guards-fixture.test.ts`, each
 * with one change to a translation that TLC finds without the code.
 * A model TLC cannot finish is in `guards-limits.integration.test.ts`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TLC_PIN } from "./tlc.js";
import {
  A,
  AGREE,
  B,
  CASES_OK,
  GETS,
  NEXT,
  TRANSLATION_A,
  TRANSLATION_B,
  WAITS,
  lineOf,
  swap,
  under,
  useFixture,
  verified,
} from "./guards-fixture.test.js";

useFixture();

describe("spex verify: the checks TLC makes without the code", { concurrency: 3 }, () => {
  /** What every run prints where the code is not tested. */
  function untested(ran: { lines: string[]; code: number | null; stdout: string }, why: string, result = "Inconclusive"): void {
    assert.equal(lineOf(ran.lines, "  On the code:"), `  On the code: not tested — ${why}`, ran.stdout);
    assert.equal(lineOf(ran.lines, "  Result:"), `  Result: ${result}`);
    assert.equal(lineOf(ran.lines, "  Kept fault"), `  Kept fault grants-twice: not tried — ${why}`);
    assert.ok(ran.lines.includes("    no Git revision, no files copied"), ran.stdout);
    assert.equal(ran.code, 1);
  }

  it("a case a translation does not allow or forbid as marked fails the check of cases, and the code is not tested", async () => {
    // b's rule only refuses the taker: it allows the lock to change hands.
    const loose = await verified({ [B]: swap(TRANSLATION_B, "~f.granted /\\ f.holder = Holder(s) /\\ e.who \\in f.waiting", "f.granted \\/ ~f.granted") });
    assert.deepEqual(
      [lineOf(loose.lines, "  Cases"), ...under(loose.lines, "  Cases")],
      [
        "  Cases, without the code: 3 cases, 2 translations, 1 failure",
        `    forbidden case "${GETS}", translation b: step 2 is not forbidden: the rule allows granted=true holder=none waiting={} and 31 more`,
      ],
    );
    untested(loose, "the check of cases without the code failed");
    assert.deepEqual(under(loose.lines, "  Result:").slice(0, 2), ["    the check of cases without the code failed", "    the translations differ"]);
    assert.ok(loose.lines.at(-1)?.startsWith("  Does not pass — the check of cases without the code failed; the translations differ; the result is Inconclusive; "));

    // a's model lets bob in: the permitted case states another effect.
    const wrong = await verified({ [A]: swap(TRANSLATION_A, "granted |-> s.holder = Missing,", "granted |-> TRUE,"), [B]: null });
    assert.deepEqual(under(wrong.lines, "  Cases"), [
      `    permitted case "${WAITS}", translation a: at step 2 the model gives granted=true holder=ann waiting={bob}`,
      `    permitted case "${NEXT}", translation a: step 2 is forbidden: the model gives granted=true holder=ann waiting={cy}`,
      "    translation a: the rule applies at no step of a permitted case",
    ]);
    assert.equal(lineOf(wrong.lines, "  Result:"), "  Result: Conflict in the items", "the highest row found");

    // The rule's condition never holds.
    const never = await verified({ [A]: swap(TRANSLATION_A, "While(s, e) == s.holder # Missing /\\ s.holder # e.who", "While(s, e) == s.holder = e.who"), [B]: null });
    assert.deepEqual(under(never.lines, "  Cases"), [
      `    forbidden case "${GETS}", translation a: the rule does not apply at step 2`,
      "    translation a: the rule applies at no step of a permitted case",
    ]);
    assert.match(lineOf(never.lines, "  On the model:"), /the rule applied at 0 steps$/);
    assert.deepEqual(under(never.lines, "  Result:").slice(0, 2), ["    the check of cases without the code failed", "    the rule applied at no step of the model"]);
  });

  /** Verify with `text` as translation b, which differs from a: the
   * distinguishing sequence, the question its last step puts with each
   * answer, and that the sequence was not run on the code. */
  async function differ(text: string, question: string[], sequence: string[]): Promise<void> {
    const ran = await verified({ [B]: text });
    assert.deepEqual(
      [lineOf(ran.lines, "  Translations"), ...under(ran.lines, "  Translations")],
      [
        `  Translations against each other: 2 translations, they differ at step ${sequence.length} of this sequence`,
        ...sequence.map((line) => `    ${line}`),
        ...question.map((line) => `       ${line}`),
        // What the line says of effects is said of the earlier steps alone:
        // each answer to the question is one translation's own.
        sequence.length === 1
          ? "       not run on the code"
          : "       not run on the code: the effects of the earlier steps are the model's, on which the translations agree",
      ],
      ran.stdout,
    );
    untested(ran, "the translations differ");
    assert.deepEqual(under(ran.lines, "  Result:")[0], "    the translations differ");
    assert.ok(ran.lines.at(-1)?.startsWith("  Does not pass — the translations differ; the result is Inconclusive; "));
  }

  it("translations that differ on whether a step is legal or on what it gives print the distinguishing sequence and its one question", async () => {
    // b lets a user who waits take the lock again.
    await differ(
      swap(TRANSLATION_B, "e.who # Holder(s) /\\ e.who \\notin Waiting(s)", "e.who # Holder(s)"),
      ["is step 3 legal? a: no, b: yes"],
      ["1. take who=ann -> granted=true holder=ann waiting={}", "2. take who=bob -> granted=false holder=ann waiting={bob}", "3. take who=bob"],
    );
    // b lets no one make a free lock new: they differ at the first step, which has none before it.
    await differ(
      swap(TRANSLATION_B, "  ELSE IF e.event = \"leave\" THEN e.who = Holder(s)\n  ELSE TRUE", "  ELSE IF e.event = \"leave\" THEN e.who = Holder(s)\n  ELSE Holder(s) # Missing"),
      ["is step 1 legal? a: yes, b: no"],
      ["1. reset"],
    );
    // b's lock stays with a holder who leaves it free.
    await differ(
      swap(TRANSLATION_B, "THEN [holder |-> n[1], queue |-> Cardinality(n[2])]", "THEN [holder |-> IF Waiting(s) = {} THEN e.who ELSE n[1], queue |-> Cardinality(n[2])]"),
      ["what must step 2 give?", "  a: holder=none queue=0", "  b: holder=ann queue=0"],
      ["1. take who=ann -> granted=true holder=ann waiting={}", "2. leave who=ann"],
    );
  });

  it("translations that differ on whether the rule applies or on what it forbids print the distinguishing sequence and its one question", async () => {
    // b's rule also speaks of a reset of a held lock, and allows it.
    await differ(
      swap(
        swap(
          swap(TRANSLATION_B, 'When(e) == e.event = "take"', 'When(e) == e.event \\in {"take", "reset"}'),
          "While(s, e) == Holder(s) # Missing /\\ Holder(s) # e.who",
          'While(s, e) == Holder(s) # Missing /\\ (e.event = "reset" \\/ Holder(s) # e.who)',
        ),
        "Shall(s, e, f) == ~f.granted /\\ f.holder = Holder(s) /\\ e.who \\in f.waiting",
        'Shall(s, e, f) == e.event = "reset" \\/ (~f.granted /\\ f.holder = Holder(s) /\\ e.who \\in f.waiting)',
      ),
      ["does the rule apply at step 2? a: no, b: yes"],
      ["1. take who=ann -> granted=true holder=ann waiting={}", "2. reset"],
    );
    // b's rule wants the taker to be the only one waiting.
    await differ(
      swap(TRANSLATION_B, "e.who \\in f.waiting", "f.waiting = Waiting(s) \\cup {e.who}"),
      ["is this effect forbidden at step 2? granted=false holder=ann waiting={ann, bob}", "  a: no, b: yes", "the model gives granted=false holder=ann waiting={bob}"],
      ["1. take who=ann -> granted=true holder=ann waiting={}", "2. take who=bob"],
    );
    // b's rule forbids the very effect the model gives when ann takes the lock cy holds.
    await differ(
      swap(TRANSLATION_B, "e.who \\in f.waiting", 'e.who \\in f.waiting /\\ ~(Holder(s) = "cy" /\\ f.waiting = {"ann"})'),
      ["is this effect forbidden at step 2? granted=false holder=cy waiting={ann}", "  a: no, b: yes", "the model gives this effect"],
      ["1. take who=cy -> granted=true holder=cy waiting={}", "2. take who=ann"],
    );
  });

  it("a model that gives an effect the rule forbids is a Conflict in the items, with TLC's sequence", async () => {
    // Both models grant cy the lock bob holds, so the translations agree; no case goes there.
    const ran = await verified({
      [A]: swap(TRANSLATION_A, "granted |-> s.holder = Missing,", 'granted |-> s.holder = Missing \\/ (e.who = "cy" /\\ s.holder = "bob"),'),
      [B]: swap(TRANSLATION_B, "[granted |-> Holder(s) = Missing,", '[granted |-> Holder(s) = Missing \\/ (e.who = "cy" /\\ Holder(s) = "bob"),'),
    });
    assert.equal(lineOf(ran.lines, "  Cases"), CASES_OK);
    assert.equal(lineOf(ran.lines, "  Translations"), AGREE, "agreement shows the translations read the items alike, not that the reading is free of conflict");
    assert.deepEqual(
      [lineOf(ran.lines, "  On the model:"), ...under(ran.lines, "  On the model:")],
      [
        `  On the model: Conflict in the items — TLC ${TLC_PIN.version} found it at step 2 of this sequence, as translation a reads the items`,
        "    1. take who=bob -> granted=true holder=bob waiting={}",
        "    2. take who=cy",
        "       the model gives granted=true holder=bob waiting={cy}",
        "       forbidden by the rule",
      ],
    );
    untested(ran, "the model conflicts with the rule", "Conflict in the items");
    assert.equal(ran.lines.at(-1), "  Does not pass — the result is Conflict in the items; kept fault grants-twice not tried");
  });
});

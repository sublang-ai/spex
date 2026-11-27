// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-244 and DR-252: the TLA+ files Spex writes
 * around a guard's translations. What TLC makes of them is the
 * integration suite's to show; here, that they are written from the
 * data alone.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COMPARE_CFG, EVALUATE_CFG, MODEL_CFG, casesModule, compareModule, formModule, judgeModule, modelModule } from "./harness.js";
import type { Case } from "./types.js";

const CASES: Case[] = [
  {
    label: "a second taker waits",
    kind: "permitted",
    words: "",
    steps: [
      { event: "take", params: { who: "ann" }, effect: {} },
      { event: "take", params: { who: "bob" }, effect: { granted: false, holder: null, waiting: ["bob"] } },
    ],
  },
  { label: "a second taker gets it — 锁", kind: "forbidden", words: "", steps: [{ event: "reset", params: {}, effect: {} }] },
];

describe("harness: Spex's own TLA+ files", () => {
  it("writes the configuration files", () => {
    assert.equal(EVALUATE_CFG, "CONSTANT Missing = Missing\n");
    assert.equal(COMPARE_CFG, "CONSTANT Missing = Missing\nINIT Init\nNEXT Next\nINVARIANT Agree\nCHECK_DEADLOCK FALSE\n");
    assert.equal(MODEL_CFG, "CONSTANT Missing = Missing\nINIT Init\nNEXT Next\nINVARIANT Declared\nINVARIANT Kept\nCHECK_DEADLOCK FALSE\n");
  });

  it("writes each case's steps as values, and says which translation and case each ASSUME line evaluates", () => {
    const { text, assumes } = casesModule(["a", "b_2"], CASES);
    const lines = text.split("\n");
    assert.equal(lines[0], "---- MODULE SpexCases ----");
    assert.ok(lines.includes("T_a == INSTANCE a") && lines.includes("T_b_2 == INSTANCE b_2"));
    const at = lines.indexOf("Case_1 == <<");
    assert.deepEqual(lines.slice(at - 1, at + 4), [
      "\\* permitted: a second taker waits",
      "Case_1 == <<",
      '  [event |-> [event |-> "take", who |-> "ann"], stated |-> <<>>],',
      '  [event |-> [event |-> "take", who |-> "bob"], stated |-> [granted |-> FALSE, holder |-> Missing, waiting |-> {"bob"}]]',
      ">>",
    ]);
    assert.ok(lines.includes("\\* forbidden: a second taker gets it ? ?"), "a label is a comment in ASCII");
    assert.ok(lines.includes("Result_a_1 == Walk_a(Case_1, FALSE, 1, T_a!Start, {})"));
    assert.ok(lines.includes("Result_b_2_2 == Walk_b_2(Case_2, TRUE, 1, T_b_2!Start, {})"));
    assert.ok(lines.includes("Applied_a == (Result_a_1.pass /\\ Result_a_1.applied # {})"));
    assert.equal(assumes.size, 6);
    for (const [line, assumed] of assumes) {
      const written = lines[line - 1];
      assert.equal(
        written,
        assumed.case === null
          ? `ASSUME PrintT(<<"applied", "${assumed.translation}", Applied_${assumed.translation}>>)`
          : `ASSUME PrintT(<<"case", "${assumed.translation}", ${assumed.case}, Result_${assumed.translation}_${assumed.case}>>)`,
      );
    }
    assert.equal(casesModule(["a", "b_2"], CASES).text, text, "the same data gives the same file");
  });

  it("names every translation in the comparison, the first one's answers where one stands for all", () => {
    const text = compareModule(["a", "b", "c"]);
    assert.ok(text.includes("Legal(st, e)        == [a |-> T_a!Legal(st.a, e), b |-> T_b!Legal(st.b, e), c |-> T_c!Legal(st.c, e)]"));
    assert.ok(text.includes("  /\\ states = [a |-> T_a!Start, b |-> T_b!Start, c |-> T_c!Start]"));
    assert.ok(text.includes("          /\\ step' = [event |-> e, effect |-> Effect(states, e).a]"));
    assert.ok(text.includes("Forbidden_c(s, e, f) == Applies_c(s, e) /\\ ~T_c!Shall(s, e, f)"));
    assert.ok(!text.includes("CHOOSE"), "which differing effect is asked about is Spex's to pick, in declared order");
    // Each translation's effect is tested against the declaration before any effect is compared.
    assert.ok(text.includes("Declared(st, e)     == [a |-> T_a!Effect(st.a, e) \\in Effects(e), b |-> T_b!Effect(st.b, e) \\in Effects(e), c |-> T_c!Effect(st.c, e) \\in Effects(e)]"));
    assert.ok(text.includes('    THEN [on |-> "undeclared", event |-> e, answers |-> Effect(st, e), declared |-> Declared(st, e)]'));
    assert.ok(text.indexOf('"undeclared"') < text.indexOf('[on |-> "effect"'));
  });

  it("instantiates the one translation of the form, model and judge files", () => {
    assert.ok(formModule("a").includes("T == INSTANCE a\n"));
    assert.ok(modelModule("first").includes("M == INSTANCE first\n"));
    const text = judgeModule("a", [
      { before: [], call: { event: "take", params: { who: "ann" } }, effect: { granted: true } },
      { before: [{ event: "take", params: { who: "ann" } }, { event: "reset", params: {} }], call: { event: "reset", params: {} }, effect: {} },
    ]);
    const lines = text.split("\n").filter((line) => line.startsWith("ASSUME"));
    assert.deepEqual(lines, [
      'ASSUME PrintT(<<"judge", 1, Judge(<<>>, [event |-> "take", who |-> "ann"], [granted |-> TRUE])>>)',
      'ASSUME PrintT(<<"judge", 2, Judge(<<[event |-> "take", who |-> "ann"], [event |-> "reset"]>>, [event |-> "reset"], <<>>)>>)',
    ]);
  });
});

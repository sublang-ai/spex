// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-33), DR-244 and DR-252: `spex verify` on
 * variants of the fixture project of `guards-fixture.test.ts`, each
 * with one change to its binding: what leaves a test on the code
 * short of a result. A command stopped at the time limit is in
 * `guards-limits.integration.test.ts`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  BINDING_MJS,
  BINDING_YAML,
  DECLARATION,
  MODULE,
  SPEC,
  SPEC_FILE,
  block,
  lineOf,
  project,
  spex,
  swap,
  under,
  useFixture,
  verified,
  write,
} from "./guards-fixture.test.js";

useFixture();

describe("spex verify: a binding that leaves the tests on the code short", { concurrency: 3 }, () => {
  it("an event function that throws is a failing binding, and what a copy showed before it stands", async () => {
    const throws = await verified({ [MODULE]: swap(BINDING_MJS, "    leave(state.lock);", '    if (state.lock.waiting.length === 2) throw new Error("the queue is full");\n    leave(state.lock);') });
    assert.equal(lineOf(throws.lines, "  Result:"), "  Result: Inconclusive", throws.stdout);
    assert.deepEqual(under(throws.lines, "  Result:")[0], "    a failing binding: leave threw: the queue is full");
    assert.equal(lineOf(throws.lines, "  On the code:"), "  On the code: 0 of 40 steps tested", "the second permitted case met it");
    assert.deepEqual(under(throws.lines, "  On the code:"), ["    1 of 2 permitted cases went as their steps state"], "the first permitted case was caused");
    assert.equal(lineOf(throws.lines, "  Kept fault"), "  Kept fault grants-twice: caught at step 2 of the permitted case \"a second taker waits\"", "what a copy showed before it failed stands");
  });

  it("a binding that fails before any case is caused prints no line on the permitted cases", async () => {
    // Only a sequence caused to its end stands. With the four-step case first, the kept
    // fault's forbidden effect is given at its step 2 and the binding fails at its step 4.
    const entries = SPEC.slice(SPEC.indexOf("- permitted"));
    const [waits, gets, next] = [entries.indexOf("- permitted"), entries.indexOf("- forbidden"), entries.lastIndexOf("- permitted")];
    const reordered = `${entries.slice(next).trimEnd().replace(/\.$/, ";")}\n${entries.slice(waits, gets)}${entries.slice(gets, next).trimEnd().replace(/;$/, ".")}\n`;
    const early = await verified({
      [SPEC_FILE]: swap(SPEC, entries, reordered),
      [MODULE]: swap(BINDING_MJS, "    leave(state.lock);", '    throw new Error("no way out");'),
    });
    assert.deepEqual(under(early.lines, "  Result:")[0], "    a failing binding: leave threw: no way out", early.stdout);
    assert.equal(lineOf(early.lines, "  On the code:"), "  On the code: 0 of 40 steps tested");
    assert.deepEqual(under(early.lines, "  On the code:"), [], "no case was caused, so nothing is said of how the cases went");
    assert.equal(lineOf(early.lines, "  Kept fault"), "  Kept fault grants-twice: not caught — the binding failed: leave threw: no way out");
  });

  it("a cause names a path into the copy relative to the copy, so two runs print the same report", async () => {
    // The module imports a file that is not there: Node names both paths in full.
    const dir = await project({ [MODULE]: swap(BINDING_MJS, '"../../../src/lock.mjs"', '"../../../src/nope.mjs"') });
    const first = await spex(dir, ["verify"]);
    const lines = block(first.stdout);
    const cause = under(lines, "  Result:")[0];
    assert.ok(cause.startsWith("    a failing binding: binding.mjs does not load: "), first.stdout);
    assert.match(cause, /'src[\\/]nope\.mjs'/, "the file it did not find, from the copy");
    assert.match(cause, /guards[\\/]bindings[\\/]lock[\\/]binding\.mjs$/, "and the module that asked for it");
    assert.ok(!first.stdout.includes("spex-guard-"), `no line names the copy's fresh folder: ${first.stdout}`);
    assert.equal(lineOf(lines, "  On the code:"), "  On the code: 0 of 40 steps tested");
    assert.deepEqual(under(lines, "  On the code:"), [], "the binding failed before any event");
    assert.equal(lineOf(lines, "  Kept fault"), `  Kept fault grants-twice: not caught — the binding failed: ${cause.slice("    a failing binding: ".length)}`);
    const second = await spex(dir, ["verify"]);
    assert.equal(second.stdout, first.stdout, "the same inputs give the same report");
  });

  it("an effect out of its declared type is a failing binding naming the event, the field, the type and the value", async () => {
    const undeclared = await verified({ [MODULE]: swap(BINDING_MJS, "queue: state.lock.waiting.length }", "queue: state.lock.waiting.length + 7 }") });
    assert.deepEqual(under(undeclared.lines, "  Result:")[0], "    a failing binding: leave returned what is not its declared effect: queue: expected 0..2, found 8");
  });

  it("a sequence that gives another effect when caused again is Inconclusive, with both effects", async () => {
    // From its thirtieth start on, the binding reports the first take otherwise.
    const drifting = swap(
      swap(BINDING_MJS, "export function start() {", "let starts = 0;\n\nexport function start() {\n  starts += 1;"),
      "    return { granted, holder: state.lock.holder, waiting: [...state.lock.waiting].reverse() };",
      "    const all = starts >= 30 && state.lock.waiting.length === 0 ? [who] : [...state.lock.waiting].reverse();\n    return { granted, holder: state.lock.holder, waiting: all };",
    );
    const again = await verified({ [MODULE]: drifting });
    assert.equal(lineOf(again.lines, "  Result:"), "  Result: Inconclusive", again.stdout);
    const cause = under(again.lines, "  Result:");
    assert.equal(cause[0], "    a sequence did not repeat: caused again, its last step gave another effect");
    assert.match(cause[1], /^ {6}1\. take who=(ann|bob|cy)$/);
    assert.match(cause[2], /^ {9}first {2}granted=true holder=(ann|bob|cy) waiting=\{\}$/);
    assert.match(cause[3], /^ {9}again {2}granted=true holder=(ann|bob|cy) waiting=\{(ann|bob|cy)\}$/);
  });

  it("a project file loaded from outside the copy is named, and a command that fails is a failing binding", async () => {
    const dir = await project();
    write(dir, MODULE, swap(BINDING_MJS, '"../../../src/lock.mjs"', `${JSON.stringify(join(dir, "src", "lock.mjs"))}`));
    const outside = await spex(dir, ["verify"]);
    assert.deepEqual(under(block(outside.stdout), "  Result:")[0], "    a project file loaded from outside the copy: src/lock.mjs");

    const failing = await verified({ [DECLARATION]: `${BINDING_YAML}commands:\n  - [node, -e, "console.error('no build'); process.exit(3)"]\n` });
    assert.deepEqual(under(failing.lines, "  Result:")[0], "    a failing binding: command 1 (node -e console.error('no build'); process.exit(3)) ended with status 3: no build");
    assert.equal(lineOf(failing.lines, "  On the code:"), "  On the code: not tested", "the copy's process never started");
  });
});

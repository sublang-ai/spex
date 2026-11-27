// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-29), DR-243, DR-244 and DR-252: `spex verify`
 * on the fixture project of `guards-fixture.test.ts`, a guard that
 * passes and what passing takes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { TLC_PIN } from "./tlc.js";
import {
  AGREE,
  ASSUMES,
  B,
  CASES_OK,
  CASES_ON_CODE,
  CODE,
  CODE_OK,
  FAULT_CAUGHT,
  FAULT_FILE,
  GUARD,
  HEADING,
  LIMITS,
  MODEL_OK,
  OTHER_FAULT,
  OTHER_FAULT_FILE,
  PASSED,
  SPEX_VERSION,
  SRC,
  STATEMENT_SAID,
  TRANSLATION_B,
  block,
  lineOf,
  project,
  spex,
  tools,
  under,
  useFixture,
  verified,
  write,
} from "./guards-fixture.test.js";

useFixture();

describe("spex verify: the result Model checked, code tested", { concurrency: 3 }, () => {
  it("an approved guard whose kept fault is caught passes, with every line of its block", async () => {
    const ran = await verified();
    assert.equal(ran.stderr, "");
    assert.deepEqual(ran.lines.slice(0, 3), [
      `${GUARD} — checks the rule lock-3:`,
      "  While a user holds the lock, when another user takes it, the lock shall stay with its holder,",
      "  refuse the taker and report the taker among those waiting, as [lock-4] orders them.",
    ]);
    assert.equal(STATEMENT_SAID.length > 100, true, "the statement is wrapped");
    assert.deepEqual(ran.lines.slice(3, 7), ["  Approval: approved", CASES_OK, AGREE, MODEL_OK]);
    assert.match(ran.lines[7], /^ {4}TLC's own estimate of the chance it missed a state: \S+$/);
    assert.deepEqual(ran.lines.slice(8, 14), [CODE_OK, CASES_ON_CODE, PASSED, ...ASSUMES]);
    assert.equal(
      ran.lines[14],
      `    Spex ${SPEX_VERSION}, Node ${process.versions.node}, TLC ${TLC_PIN.version} (${tools.pinned ? "the pinned copy" : "not the pinned copy"}), Java ${tools.javaVersion}`,
    );
    assert.match(ran.lines[15], /^ {4}no Git revision, copied files sha256 [0-9a-f]{12}$/);
    assert.equal(ran.lines[16], LIMITS);
    assert.deepEqual(ran.lines.slice(17), [...FAULT_CAUGHT, "  Passes"]);
    assert.equal(ran.stdout, `${HEADING}\n\n${ran.lines.join("\n")}\n\n1 of 1 guards pass.\n`);
    assert.equal(ran.code, 0, "every guard passes: exit 0");
  });

  it("a guard with one translation runs in full and does not pass, and a Git revision is named", async () => {
    const dir = await project({ [B]: null });
    for (const args of [["init", "-q"], ["add", "-A"], ["-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-qm", "one"]]) {
      execFileSync("git", args, { cwd: dir });
    }
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    write(dir, SRC, `${CODE}\n`);
    const ran = await spex(dir, ["verify", GUARD]);
    const lines = block(ran.stdout);
    assert.equal(
      lineOf(lines, "  Cases"),
      "  Cases, without the code: the translation allows the 2 permitted cases and forbids the 1 forbidden case",
    );
    assert.equal(lineOf(lines, "  Translations"), "  Translations against each other: 1 translation, nothing to compare it with", ran.stdout);
    // It is checked and tested as any other guard, to its result.
    assert.equal(lineOf(lines, "  On the model:"), MODEL_OK);
    assert.equal(lineOf(lines, "  On the code:"), CODE_OK);
    assert.equal(lineOf(lines, "  Result:"), PASSED, "the result does not rest on the number of translations");
    assert.match(lineOf(lines, "    revision"), new RegExp(`^ {4}revision ${commit} with changes, copied files sha256 [0-9a-f]{12}$`));
    assert.equal(lineOf(lines, "  Kept fault"), FAULT_CAUGHT[0]);
    assert.equal(lines.at(-1), "  Does not pass — only one translation", "one translation is compared with nothing");
    assert.ok(ran.stdout.endsWith("\n0 of 1 guards pass.\n"));
    assert.equal(ran.code, 1, ran.stdout);
  });

  it("without an approval, with a changed input, without a kept fault or with one not caught it does not pass", async () => {
    const fresh = await verified({}, { approve: false });
    assert.deepEqual(under(fresh.lines, "  Approval:"), [`    review the guard's items and files, then run spex approve ${GUARD}`]);
    assert.equal(lineOf(fresh.lines, "  Approval:"), "  Approval: not approved — no approval record");
    assert.equal(lineOf(fresh.lines, "  Result:"), PASSED, "the result does not rest on the approval");
    assert.equal(fresh.lines.at(-1), "  Does not pass — not approved");
    assert.equal(fresh.code, 1);

    const dir = await project();
    write(dir, B, `${TRANSLATION_B}\n\\* A note.\n`);
    write(dir, FAULT_FILE, null);
    write(dir, OTHER_FAULT_FILE, OTHER_FAULT);
    const changed = await spex(dir, ["verify"]);
    const lines = block(changed.stdout);
    assert.equal(
      lineOf(lines, "  Approval:"),
      `  Approval: not approved — changed: file ${B}; added: file ${OTHER_FAULT_FILE}; gone: file ${FAULT_FILE}`,
    );
    assert.equal(
      lineOf(lines, "  Kept fault"),
      "  Kept fault last-waiting: not caught — the code gave no effect the rule forbids in 40 steps tested; 3 did not give the model's effect",
      "a difference from the model that the rule does not forbid catches no kept fault",
    );
    assert.equal(lines.at(-1), "  Does not pass — not approved; kept fault last-waiting not caught");

    const none = await verified({ [FAULT_FILE]: null });
    assert.equal(none.lines.at(-1), "  Does not pass — no kept fault");
    assert.equal(none.code, 1);
  });
});

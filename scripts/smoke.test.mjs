// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The smoke's plan (release-20, release-22): which stages a run takes,
// in which order, and which resumptions it refuses — read through
// `--dry-run`, which validates the arguments as a run does and then
// runs nothing.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const smoke = fileURLToPath(new URL("./smoke.mjs", import.meta.url));

function plan(...args) {
  const result = spawnSync(process.execPath, [smoke, ...args], { encoding: "utf-8" });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test("the smoke's four stages run in order, and --live appends the live stage", () => {
  assert.deepEqual(plan("--dry-run"), {
    code: 0,
    out: "smoke: --dry-run: build → lint → fresh-install → cli-user\n",
    err: "",
  });
  assert.deepEqual(plan("--live", "--dry-run"), {
    code: 0,
    out: "smoke: --dry-run: build → lint → fresh-install → cli-user → live\n",
    err: "",
  });
  assert.equal(
    plan("--live", "--from=fresh-install", "--dry-run").out,
    "smoke: --dry-run: fresh-install → cli-user → live\n",
  );
  assert.equal(plan("--from=cli-user", "--dry-run").out, "smoke: --dry-run: cli-user\n");
});

test("a live run resumes only where the fresh install's clone is made", () => {
  for (const from of ["cli-user", "live"]) {
    const refused = plan("--live", `--from=${from}`, "--dry-run");
    assert.equal(refused.code, 1);
    assert.equal(refused.out, "");
    assert.match(refused.err, /smoke FAILED at arguments: the live stage runs inside the fresh install's clone/);
  }
  const stageless = plan("--from=live", "--dry-run");
  assert.equal(stageless.code, 1);
  assert.match(stageless.err, /--from must name a stage: build, lint, fresh-install, cli-user\n/);
});

test("an unknown argument is refused, and --help names --live", () => {
  const unknown = plan("--desktop", "--dry-run");
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /unknown argument --desktop; the smoke takes --live/);
  const help = plan("--live", "--help");
  assert.equal(help.code, 0);
  assert.match(help.out, /^Usage: npm run smoke/);
  assert.match(help.out, /--live {11}add the live stage/);
});

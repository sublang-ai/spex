// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
// The repository-system audit of the merge gate (release-33, DR-145).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");
const workflow = parse(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"));

/** The jobs a pull request's run holds (release-34): the required checks (release-29). */
const PULL_REQUEST_CHECKS = [
  "test (ubuntu-latest, 22)", "test (ubuntu-latest, 24)", "test (windows-latest, 22)", "test (macos-latest, 22)",
  "journeys (ubuntu-latest)", "desktop-browser (ubuntu-latest)",
];

test("release-33: one run per pull-request head, cancelled by its next push and never for main (release-30)", () => {
  assert.equal(workflow.concurrency.group, "ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}");
  assert.equal(workflow.concurrency["cancel-in-progress"], "${{ github.event_name == 'pull_request' }}");
  assert.ok(Array.isArray(workflow.on.schedule) && workflow.on.schedule.length === 1, "a nightly schedule runs the full matrix");
});

test("release-33: a pull request runs the reduced matrix, main and the nightly the whole; the required checks are that run's jobs (release-29, release-34)", () => {
  // The matrices narrow by event through expressions: a job-level `if`
  // cannot read the matrix, so each matrix picks its own rows.
  const byEvent = (expression) => {
    const m = /^\$\{\{ github\.event_name == 'pull_request' && fromJSON\('(.*)'\) \|\| fromJSON\('(.*)'\) \}\}$/.exec(expression);
    assert.ok(m, `a matrix picked by event: ${expression}`);
    return { pullRequest: JSON.parse(m[1]), other: JSON.parse(m[2]) };
  };
  const test = workflow.jobs.test;
  const exclude = byEvent(test.strategy.matrix.exclude);
  assert.deepEqual(exclude.pullRequest, [{ os: "windows-latest", "node-version": 24 }, { os: "macos-latest", "node-version": 24 }]);
  assert.deepEqual(exclude.other, [{ os: "windows-latest", "node-version": 24 }]);
  for (const name of ["journeys", "desktop-browser"]) {
    const os = byEvent(workflow.jobs[name].strategy.matrix.os);
    assert.deepEqual(os.pullRequest, ["ubuntu-latest"], name);
    assert.deepEqual(os.other, ["ubuntu-latest", "macos-latest"], name);
  }
  // Every job the matrix runs on a pull request is a required check, and nothing else is.
  const excluded = new Set(exclude.pullRequest.map((row) => `${row.os}:${row["node-version"]}`));
  const onPullRequest = [];
  for (const os of test.strategy.matrix.os) for (const node of test.strategy.matrix["node-version"]) {
    if (excluded.has(`${os}:${node}`)) continue;
    onPullRequest.push(`test (${os}, ${node})`);
  }
  onPullRequest.push("journeys (ubuntu-latest)", "desktop-browser (ubuntu-latest)");
  assert.deepEqual(PULL_REQUEST_CHECKS.slice().sort(), onPullRequest.sort());
});

test("release-33: the pre-push check refuses a conflict marker (release-35)", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-prepush-"));
  execFileSync("git", ["init", "-q", dir]);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts/prepush.sh"), readFileSync(join(root, "scripts/prepush.sh")));
  writeFileSync(join(dir, "left.ts"), "const a = 1;\n<<<<<<< HEAD\nconst b = 2;\n=======\nconst b = 3;\n>>>>>>> origin/main\n");
  execFileSync("git", ["-C", dir, "add", "-A"]);
  const run = spawnSync("bash", [join(dir, "scripts/prepush.sh")], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /conflict markers left in the tree/);
  assert.match(run.stderr, /left\.ts/);
});

test("release-33: the Linux parity script names the runners' Node and Git (release-32)", () => {
  const dockerfile = readFileSync(join(root, "scripts/linux-ci/Dockerfile"), "utf8");
  assert.match(dockerfile, /FROM ubuntu:24\.04/);
  assert.match(dockerfile, /ppa:git-core\/ppa/, "the runners' current Git line");
  assert.match(dockerfile, /setup_22\.x/, "Node 22, the first matrix version");
  const script = readFileSync(join(root, "scripts/test-linux.sh"), "utf8");
  assert.match(script, /Node 22 and Git 2\.55/);
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["test:linux"], "bash scripts/test-linux.sh");
});

test("release-33: the merge-on-green script merges only a head whose checks are all green (release-29)", () => {
  const script = readFileSync(join(root, "scripts/merge-on-green.sh"), "utf8");
  assert.match(script, /all\(\. == "SUCCESS" or \. == "SKIPPED" or \. == "NEUTRAL"\)/, "every check green");
  assert.match(script, /The head moved; run again for the new head/, "a moved head is refused");
  assert.match(script, /gh pr merge "\$number" --merge/);
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["merge-on-green"], "bash scripts/merge-on-green.sh");
});

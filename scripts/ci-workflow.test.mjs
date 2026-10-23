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

test("release-33: the merge-on-green script merges only a head whose newest run's checks are all green (release-29)", () => {
  const script = readFileSync(join(root, "scripts/merge-on-green.sh"), "utf8");
  assert.match(script, /group_by\(\.workflowName\)/, "each workflow's checks grouped");
  assert.match(script, /\(map\(\.run\) \| max\) as \$m \| map\(select\(\.run == \$m\)\)/, "only each workflow's newest run kept");
  assert.match(script, /--jq "\(\$newest\)"' as \$checks \| \{head: \.headRefOid, mergeable, done: \(\(\$checks\|length\) > 0 and \(\[\$checks\[\] \| \.status\]/, "done read over the newest runs");
  assert.match(script, /green: \(\(\$checks\|length\) > 0 and \(\[\$checks\[\] \| \.conclusion\] \| all\(\. == "SUCCESS" or \. == "SKIPPED" or \. == "NEUTRAL"\)\)\)/, "every newest check green");
  assert.match(script, /--jq "\(\$newest\)"' \| \.\[\] \| select\(\.conclusion != "SUCCESS"/, "the failing checks listed from the newest runs");
  assert.doesNotMatch(script, /\.statusCheckRollup\[\]/, "no judgment over the whole rollup");
  assert.match(script, /The head moved; run again for the new head/, "a moved head is refused");
  assert.match(script, /if \[ -n "\$now" \] && \[ "\$now" != "\$head" \]; then/, "only a read naming another head is a move");
  assert.match(script, /gh pr merge "\$number" --merge/);
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["merge-on-green"], "bash scripts/merge-on-green.sh");
});

test("release-33: the merge-on-green script judges each workflow's newest run, keeping a status context (release-29)", (t) => {
  if (spawnSync("jq", ["--version"]).error) {
    t.skip("jq is not on PATH: the script's jq filters cannot run");
    return;
  }
  const script = readFileSync(join(root, "scripts/merge-on-green.sh"), "utf8");
  const newest = /^newest='([^']*)'$/m.exec(script)?.[1];
  const state = /--jq "\(\$newest\)"'( as \$checks [^']*)'/.exec(script)?.[1];
  const failing = /--jq "\(\$newest\)"'( \| \.\[\] [^']*)'/.exec(script)?.[1];
  assert.ok(newest && state && failing, "the script's jq filters");
  const jq = (filter, input) => {
    const run = spawnSync("jq", ["-c", filter], { input: JSON.stringify(input), encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim().split("\n").map((line) => JSON.parse(line));
  };
  const check = (name, run, status, conclusion) => ({
    __typename: "CheckRun", workflowName: "CI", name, status, conclusion,
    detailsUrl: `https://github.com/sublang-ai/spex/actions/runs/${run}/job/${run}1`,
  });
  // A close and reopen: the cancelled run's entries stay beside the new run's.
  // The new run's id has one digit more, so a textual comparison would keep the old run.
  const checks = [
    check("test (ubuntu-latest, 22)", 9973185691, "COMPLETED", "FAILURE"),
    check("journeys (ubuntu-latest)", 9973185691, "COMPLETED", "CANCELLED"),
    check("test (ubuntu-latest, 22)", 39980673777, "COMPLETED", "SUCCESS"),
    check("journeys (ubuntu-latest)", 39980673777, "COMPLETED", "SUCCESS"),
  ];
  const context = { __typename: "StatusContext", context: "ci/external", state: "SUCCESS", targetUrl: "https://ci.example.test/build/7" };
  const label = (entry) => `${entry.name ?? entry.context} ${entry.conclusion ?? entry.state}`;
  const [kept] = jq(newest, { statusCheckRollup: [...checks, context] });
  assert.deepEqual(kept.map(label).sort(), ["ci/external SUCCESS", "journeys (ubuntu-latest) SUCCESS", "test (ubuntu-latest, 22) SUCCESS"]);
  const pr = { headRefOid: "b6bd25a7", mergeable: "MERGEABLE", statusCheckRollup: checks };
  assert.deepEqual(jq(`(${newest})${state}`, pr), [{ head: "b6bd25a7", mergeable: "MERGEABLE", done: true, green: true }]);
  const red = { statusCheckRollup: [...checks.slice(0, 3), check("journeys (ubuntu-latest)", 39980673777, "COMPLETED", "FAILURE")] };
  assert.deepEqual(jq(`(${newest})${failing}`, red), ["journeys (ubuntu-latest) FAILURE"]);
});

test("release-33: the merge-on-green script polls again after a failed or empty read and refuses only another head (release-29)", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-merge-on-green-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // The stand-in gh answers its reads in turn from GH_REPLIES, `fail` failing as a dropped connection does.
  writeFileSync(join(bin, "gh"), [
    "#!/usr/bin/env bash",
    'echo "$*" >> "$GH_LOG"',
    '[ "$2" = merge ] && exit 0',
    'n=$(( $(cat "$GH_COUNT") + 1 )); echo "$n" > "$GH_COUNT"',
    'reply="$(sed -n "${n}p" "$GH_REPLIES")"',
    '[ "$reply" = fail ] && { echo "Post \\"https://api.github.com/graphql\\": dial tcp: i/o timeout" >&2; exit 1; }',
    "printf '%s\\n' \"$reply\"",
    "",
  ].join("\n"), { mode: 0o755 });
  writeFileSync(join(bin, "sleep"), '#!/usr/bin/env bash\necho "sleep $*" >> "$GH_LOG"\n', { mode: 0o755 });
  const state = (head) => JSON.stringify({ head, mergeable: "MERGEABLE", done: true, green: true });
  const cases = [
    { name: "a failed and an empty read, then green", replies: ["2b11055a", "fail", "", state("2b11055a")], status: 0, merged: true },
    { name: "a failed read, then another head", replies: ["2b11055a", "fail", state("3c22166b")], status: 2, merged: false },
  ];
  for (const [index, c] of cases.entries()) {
    const log = join(dir, `${index}.log`);
    const count = join(dir, `${index}.count`);
    const replies = join(dir, `${index}.replies`);
    writeFileSync(log, "");
    writeFileSync(count, "0");
    writeFileSync(replies, `${c.replies.join("\n")}\n`);
    const run = spawnSync("bash", [join(root, "scripts/merge-on-green.sh"), "232"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_LOG: log, GH_COUNT: count, GH_REPLIES: replies },
    });
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
    assert.equal(run.status, c.status, `${c.name}: ${run.stderr}`);
    assert.ok(calls.includes("sleep 60"), `${c.name}: the failed read waits the poll's 60 s and reads again`);
    assert.equal(calls.includes("pr merge 232 --merge"), c.merged, c.name);
    if (c.merged) {
      assert.match(run.stdout, /Merged #232/, c.name);
      assert.doesNotMatch(run.stderr, /The head moved/, c.name);
    } else {
      assert.match(run.stderr, /The head moved; run again for the new head\./, c.name);
    }
  }
});

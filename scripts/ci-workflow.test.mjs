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
const laneWorkflow = parse(readFileSync(join(root, ".github/workflows/hub-lane.yml"), "utf8"));

const AFFECTED = "needs.changes.outputs.affected";
const SUITE_CONDITION = "needs.changes.result == 'success' && needs.changes.outputs.docs-only != 'true'";
const FULL_APP_CONDITION = "needs.changes.result == 'success' && needs.changes.outputs.full == 'true' && needs.changes.outputs.channel == 'app'";
const invokeVerdict = (needs) => spawnSync(process.execPath, [join(root, "scripts/ci-verdict.mjs")], {
  encoding: "utf8", env: { ...process.env, CI_NEEDS: JSON.stringify(needs) },
});
const selected = ({ full = false, channel = "app", docsOnly = false, affected = "" } = {}) => ({
  changes: { result: "success", outputs: { full: String(full), channel, "docs-only": String(docsOnly), ...(affected ? { affected } : {}), "affected-json": JSON.stringify(affected) } },
  test: { result: docsOnly ? "skipped" : "success" },
  journeys: { result: full && channel === "app" ? "success" : "skipped" },
  "desktop-browser": { result: full && channel === "app" ? "success" : "skipped" },
  "hub-lane": { result: full && channel === "app" ? "success" : "skipped" },
});

test("release-33: PRs cancel only their superseded run; CI has reusable/manual full validation and no nightly or main push (release-30, release-34)", () => {
  assert.equal(workflow.concurrency.group, "ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}");
  assert.equal(workflow.concurrency["cancel-in-progress"], "${{ github.event_name == 'pull_request' }}");
  assert.deepEqual(Object.keys(workflow.on).sort(), ["pull_request", "workflow_call", "workflow_dispatch"]);
  assert.deepEqual(workflow.on.pull_request, { branches: ["main"] });
  assert.deepEqual(workflow.on.workflow_call.inputs, {
    full: { type: "boolean", default: false }, channel: { type: "string", default: "app" },
    "release-tag": { type: "string", default: "" },
  });
  assert.equal(workflow.on.workflow_dispatch.inputs.full.default, true);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.channel.options, ["app", "cli"]);
  assert.deepEqual(workflow.permissions, { contents: "read" });
});

test("release-33: the matrix runs affected Linux/Windows PR suites and retains every full platform row (release-34)", () => {
  const matrix = (full, affected) => {
    const run = spawnSync(process.execPath, [join(root, "scripts/ci-verdict.mjs"), "--matrix"], {
      encoding: "utf8", env: { ...process.env, CI_FULL: String(full), CI_AFFECTED: affected },
    });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout.trim().replace(/^matrix=/, ""));
  };
  const row = (os, version) => ({ os, "node-version": version });
  const linux = row("ubuntu-latest", 22);
  const windows = row("windows-latest", 22);
  for (const affected of ["", "apps/desktop", "apps/server", "e2e"]) {
    assert.deepEqual(matrix(false, affected), { include: [linux] }, affected);
  }
  for (const affected of ["all", "packages/cli", "packages/core apps/desktop", "packages/ui", "packages/ui-extra packages/cli"]) {
    assert.deepEqual(matrix(false, affected), { include: [linux, windows] }, affected);
  }
  assert.deepEqual(matrix(false, "packages/ui-extra"), { include: [linux] });
  for (const affected of ["all", "packages/cli"]) assert.deepEqual(matrix(true, affected), { include: [
    linux, row("ubuntu-latest", 24), row("macos-latest", 22), row("macos-latest", 24), windows,
  ] });
  assert.equal(workflow.jobs.test.strategy.matrix, "${{ fromJSON(needs.changes.outputs.matrix) }}");
  assert.equal(workflow.jobs.changes.outputs.matrix, "${{ steps.matrix.outputs.matrix }}");
  const step = workflow.jobs.changes.steps.find((step) => step.id === "matrix");
  assert.equal(step.run, 'node scripts/ci-verdict.mjs --matrix >> "$GITHUB_OUTPUT"');
  assert.deepEqual(step.env, { CI_FULL: "${{ steps.classify.outputs.full }}", CI_AFFECTED: "${{ steps.classify.outputs.affected }}" });
  for (const name of ["journeys", "desktop-browser"]) {
    assert.equal(workflow.jobs[name].needs, "changes");
    assert.equal(workflow.jobs[name].if, FULL_APP_CONDITION);
    assert.deepEqual(workflow.jobs[name].strategy.matrix.os, ["ubuntu-latest", "macos-latest"]);
  }
  assert.deepEqual(workflow.jobs.journeys.strategy.matrix.shard, [1, 2, 3]);
  assert.deepEqual(workflow.jobs["hub-lane"], {
    needs: "changes", if: FULL_APP_CONDITION, uses: "./.github/workflows/hub-lane.yml", permissions: { contents: "read" },
    with: { "release-tag": "${{ inputs.release-tag || '' }}" },
  });
});

test("release-33: classification chooses the exact full channel and keeps shared documentation gates; app provenance precedes installs (release-34, release-41)", () => {
  const changes = workflow.jobs.changes;
  assert.equal(changes["runs-on"], "ubuntu-latest");
  for (const output of ["docs-only", "affected", "full", "channel"]) {
    assert.equal(changes.outputs[output], `\${{ steps.classify.outputs.${output} }}`);
  }
  assert.equal(changes.outputs["affected-json"], "${{ toJSON(steps.classify.outputs.affected) }}", "an empty selection survives job-output serialization");
  const classifyAt = changes.steps.findIndex((step) => step.id === "classify");
  const classify = changes.steps[classifyAt];
  const nodeAt = changes.steps.findIndex((step) => step.uses?.startsWith("actions/setup-node@"));
  assert.ok(nodeAt >= 0 && nodeAt < classifyAt);
  assert.equal(changes.steps[nodeAt].with["node-version"], 22);
  assert.equal(classify.shell, "bash");
  assert.deepEqual(classify.env, { FULL: "${{ inputs.full || false }}", CHANNEL: "${{ inputs.channel || 'app' }}", BASE: "${{ github.base_ref || 'main' }}" });
  assert.match(classify.run, /node scripts\/affected-tests\.mjs --base "origin\/\$BASE" --github-output \| tee -a "\$GITHUB_OUTPUT"/);
  for (const channel of ["app", "cli", "unknown"]) {
    const dir = mkdtempSync(join(tmpdir(), "spex-classify-"));
    const output = join(dir, "output");
    writeFileSync(output, "");
    const run = spawnSync("bash", ["-e", "-o", "pipefail", "-c", classify.run], {
      cwd: root, encoding: "utf8", env: { ...process.env, FULL: "true", CHANNEL: channel, BASE: "main", GITHUB_OUTPUT: output },
    });
    if (channel === "unknown") assert.notEqual(run.status, 0);
    else {
      assert.equal(run.status, 0, run.stderr);
      assert.equal(readFileSync(output, "utf8"), `full=true\nchannel=${channel}\ndocs-only=false\naffected=${channel === "app" ? "all" : "packages/cli"}\n`);
    }
  }
  const guardAt = changes.steps.findIndex((step) => step.run === "node scripts/dependency-closure.mjs --registry-only");
  assert.ok(guardAt > classifyAt);
  assert.equal(changes.steps[guardAt].if, "steps.classify.outputs.full == 'true' && steps.classify.outputs.channel == 'app'");
  assert.ok(changes.steps.slice(0, guardAt).every((step) => !/npm ci/.test(step.run ?? "")));
  const gates = changes.steps.find((step) => step.name === "Documentation alone keeps the spec gates");
  assert.equal(gates.if, "steps.classify.outputs.docs-only == 'true'");
  assert.match(gates.run, /npm run build -w packages\/cli/);
  assert.match(gates.run, /node scripts\/affected-tests\.mjs --base "origin\/\$BASE" --run/);
  assert.equal(gates.env.BASE, "${{ github.base_ref || 'main' }}");
  assert.equal(workflow.jobs.test.needs, "changes");
  assert.equal(workflow.jobs.test.if, SUITE_CONDITION);
});

test("release-33: fast gates precede selected suites; Windows retains its supported subset (release-34)", () => {
  const steps = workflow.jobs.test.steps;
  const gateAt = steps.findIndex((step) => step.name === "Build, catalogs, types and specifications");
  assert.ok(gateAt > steps.findIndex((step) => step.run === "npm ci"));
  assert.equal(steps[gateAt].shell, "bash", "Windows stops after any failed gate command");
  assert.equal(steps[gateAt].run.trim(), "npm run build\nnode packages/cli/dist/cli.js lint\nnpm run typecheck -w e2e");
  const reachAt = steps.findIndex((step) => step.name === "Tests the change reaches");
  assert.ok(reachAt > gateAt);
  assert.equal(steps[reachAt].run, `node scripts/affected-tests.mjs --run "\${{ ${AFFECTED} }}"`);
  assert.equal(steps[reachAt].if, "runner.os != 'Windows'");
  const lfs = steps.find((step) => step.run === "git lfs version");
  assert.equal(lfs.if, `runner.os != 'Windows' && (${AFFECTED} == 'all' || contains(${AFFECTED}, 'packages/core'))`);
  const windows = [
    ["Windows scaffold tests", "packages/cli", "npm test -w packages/cli"],
    ["Windows UI tests", "packages/ui", "npm test -w packages/ui"],
    ["Windows native storage and unsupported-host refusal", "packages/core", "node --test packages/core/dist/platform.integration.test.js packages/core/dist/windows-storage.integration.test.js packages/core/dist/compile-module-scope.integration.test.js"],
  ];
  for (const [name, folder, run] of windows) {
    const step = steps.find((candidate) => candidate.name === name);
    assert.equal(step.run, run, name);
    assert.equal(step.if, `runner.os == 'Windows' && (${AFFECTED} == 'all' || contains(${AFFECTED}, '${folder}'))`, name);
  }
  // The store's and Git's removals, the clones' moves and the credential
  // helper's line run on the Node the app's Electron ships.
  const appNode = steps.find((candidate) => candidate.name === "Windows core suites on the app's Node");
  assert.equal(appNode.shell, "bash");
  assert.equal(appNode.if, `runner.os == 'Windows' && (${AFFECTED} == 'all' || contains(${AFFECTED}, 'packages/core'))`);
  assert.equal(appNode.run, "env -u ELECTRON_SKIP_BINARY_DOWNLOAD node node_modules/electron/install.js\nELECTRON_RUN_AS_NODE=1 \"$(node -p \"require('electron')\")\" --test packages/core/dist/store-removal.integration.test.js packages/core/dist/git-removal.integration.test.js packages/core/dist/git-credential.integration.test.js packages/core/dist/clone-moves.integration.test.js\n");
  assert.ok(!steps.some((step) => /^npm test\s*$/.test(step.run ?? "")));
});

test("release-33: one checks gate always evaluates every job with no stand-in or conditionally bypassed verdict (release-44)", () => {
  const checks = workflow.jobs.checks;
  assert.equal(checks.if, "always()");
  assert.deepEqual(checks.needs.slice().sort(), Object.keys(workflow.jobs).filter((name) => name !== "checks").sort());
  assert.deepEqual(checks.needs.slice().sort(), ["changes", "desktop-browser", "hub-lane", "journeys", "test"]);
  assert.equal(checks["continue-on-error"], undefined);
  assert.equal(checks.name, undefined);
  const verify = checks.steps.find((step) => step.run === "node scripts/ci-verdict.mjs");
  assert.deepEqual(verify.env, { CI_NEEDS: "${{ toJSON(needs) }}" });
  assert.equal(verify.if, undefined);
  assert.equal(verify["continue-on-error"], undefined);
  assert.ok(Object.values(workflow.jobs).every((job) => !job.name), "no job impersonates another check");
});

test("release-33: the real verdict accepts the selected PR, documentation and full channel plans and refuses failed, cancelled, skipped or missing work (release-44)", () => {
  const plans = [selected(), selected({ affected: "packages/ui" }), selected({ docsOnly: true }),
    selected({ full: true, affected: "all" }), selected({ full: true, channel: "cli", affected: "packages/cli" })];
  for (const plan of plans) {
    const pass = invokeVerdict(plan);
    assert.equal(pass.status, 0, pass.stderr);
    for (const name of Object.keys(plan)) {
      for (const result of ["failure", "cancelled", "skipped", "success", undefined]) {
        if (plan[name].result === result) continue;
        const broken = structuredClone(plan);
        if (result === undefined) delete broken[name];
        else broken[name].result = result;
        const run = invokeVerdict(broken);
        assert.notEqual(run.status, 0, `${name} ${result}: ${run.stdout}`);
      }
    }
  }
  for (const outputs of [undefined, {}, { full: "maybe" },
    { full: "true", channel: "app", "docs-only": "false", "affected-json": '"packages/ui"' },
    { full: "true", channel: "cli", "docs-only": "false", "affected-json": '"all"' },
    { full: "false", channel: "app", "docs-only": "true", "affected-json": '"packages/ui"' },
    { full: "false", channel: "unknown", "docs-only": "false", "affected-json": '""' },
    { full: "false", channel: "app", "docs-only": "false" },
    { full: "false", channel: "app", "docs-only": "false", "affected-json": 'null' },
    { full: "false", channel: "app", "docs-only": "false", "affected-json": '' }]) {
    const plan = selected();
    plan.changes.outputs = outputs;
    assert.notEqual(invokeVerdict(plan).status, 0, JSON.stringify(outputs));
  }
});

test("release-33: each journey shard runs its third of the journeys and keeps its own report (release-34, DR-185)", () => {
  const steps = workflow.jobs.journeys.steps;
  const journeys = steps.find((step) => step.name === "Browser journeys");
  assert.equal(journeys.run, "npm run e2e -- --shard=${{ matrix.shard }}/3");
  // npm reads an option after a script's name as its own unless a `--` precedes it, so the root script ends with one.
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.e2e, "npm run journeys -w e2e --", "the shard reaches Playwright");
  const report = steps.find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/upload-artifact@"));
  assert.ok(report && report.if === "failure()", "a failed shard keeps its report");
  assert.equal(report.with.name, "journey-report-${{ matrix.os }}-${{ matrix.shard }}", "one artifact name per shard");
});

test("release-33: the hub lane is reusable or manual only, runs as root and keeps its output (release-36)", () => {
  assert.deepEqual(Object.keys(laneWorkflow.on).sort(), ["workflow_call", "workflow_dispatch"]);
  assert.equal(laneWorkflow.concurrency["cancel-in-progress"], false);
  const jobs = Object.values(laneWorkflow.jobs);
  assert.equal(jobs.length, 1);
  const [lane] = jobs;
  assert.equal(lane["runs-on"], "ubuntu-latest");
  const steps = lane.steps.map((step) => step.run ?? step.uses ?? "");
  assert.ok(steps.some((step) => /^sudo -n env LANE_COMMIT="\$GITHUB_SHA" LANE_LOGS="\$LANE_LOGS" "\$CHECKOUT\/apps\/hub\/scripts\/privileged-lane\.sh"$/.test(step)), "the lane's script runs as root from the unpacked tree");
  assert.ok(steps.some((step) => step.includes("git archive --format=tar HEAD | sudo tar -x --no-same-owner -C \"$CHECKOUT\"")), "the commit's tree unpacked outside any home");
  assert.ok(steps.some((step) => step.includes("sha256sum --check --ignore-missing SHASUMS256.txt") && step.includes("/usr/lib/nodejs")), "Node checked against its sums and placed under root's own directories");
  const upload = lane.steps.find((step) => typeof step.uses === "string" && step.uses.startsWith("actions/upload-artifact@"));
  assert.ok(upload && upload.if === "always()" && upload.with.name === "hub-lane-log", "the lane's output kept as the run's artifact, pass or fail");
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

test("release-33: the merge-on-green script requires the newest CI checks gate and other checks to be green (release-29)", () => {
  const script = readFileSync(join(root, "scripts/merge-on-green.sh"), "utf8");
  assert.match(script, /group_by\(\.workflowName\)/, "each workflow's checks grouped");
  assert.match(script, /\(map\(\.run\) \| max\) as \$m \| map\(select\(\.run == \$m\)\)/, "only each workflow's newest run kept");
  assert.match(script, /--jq "\(\$newest\)"' as \$checks \| \{head: \.headRefOid, mergeable, done: \(\(\$checks\|length\) > 0 and \(\[\$checks\[\] \| \.status\]/, "done read over the newest runs");
  assert.match(script, /green: \(any\(\$checks\[\]; \.workflowName == "CI" and \.name == "checks" and \.status == "COMPLETED" and \.conclusion == "SUCCESS"\)/, "the newest CI run's checks gate must succeed");
  assert.match(script, /and \(\[\$checks\[\] \| \.conclusion\] \| all\(\. == "SUCCESS" or \. == "SKIPPED" or \. == "NEUTRAL"\)\)/, "every other newest check green");
  assert.match(script, /--jq "\(\$newest\)"' \| \.\[\] \| select\(\(\.conclusion != "SUCCESS"/, "the failing checks listed from the newest runs");
  assert.doesNotMatch(script, /\.statusCheckRollup\[\]/, "no judgment over the whole rollup");
  assert.match(script, /The head moved; run again for the new head/, "a moved head is refused");
  assert.match(script, /if \[ -n "\$now" \] && \[ "\$now" != "\$head" \]; then/, "only a read naming another head is a move");
  assert.match(script, /gh pr merge "\$number" --merge --match-head-commit "\$head"/, "the merge names the head checked");
  assert.match(script, /name: \(\.name \/\/ \.context\)/, "a status context named by its context");
  assert.match(script, /conclusion: \(\.conclusion \/\/ \.state\)/, "a status context judged by its state");
  assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["merge-on-green"], "bash scripts/merge-on-green.sh");
});

test("release-33: the merge-on-green script judges each workflow's newest run, keeping a status context judged by its state (release-29)", (t) => {
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
    check("checks", 39980673777, "COMPLETED", "SUCCESS"),
  ];
  const context = { __typename: "StatusContext", context: "ci/external", state: "SUCCESS", targetUrl: "https://ci.example.test/build/7" };
  const label = (entry) => `${entry.name ?? entry.context} ${entry.conclusion ?? entry.state}`;
  const [kept] = jq(newest, { statusCheckRollup: [...checks, context] });
  assert.deepEqual(kept.map(label).sort(), ["checks SUCCESS", "ci/external SUCCESS", "journeys (ubuntu-latest) SUCCESS", "test (ubuntu-latest, 22) SUCCESS"]);
  const pr = { headRefOid: "b6bd25a7", mergeable: "MERGEABLE", statusCheckRollup: checks };
  assert.deepEqual(jq(`(${newest})${state}`, pr), [{ head: "b6bd25a7", mergeable: "MERGEABLE", done: true, green: true }]);
  const red = { statusCheckRollup: [...checks.slice(0, 3), check("journeys (ubuntu-latest)", 39980673777, "COMPLETED", "FAILURE"), checks.at(-1)] };
  assert.deepEqual(jq(`(${newest})${failing}`, red), ["journeys (ubuntu-latest) FAILURE"]);
  // A commit status has no status or conclusion: its state decides both.
  assert.deepEqual(jq(`(${newest})${state}`, { ...pr, statusCheckRollup: [...checks, context] }), [{ head: "b6bd25a7", mergeable: "MERGEABLE", done: true, green: true }]);
  for (const waiting of ["PENDING", "EXPECTED"]) {
    assert.deepEqual(jq(`(${newest})${state}`, { ...pr, statusCheckRollup: [...checks, { ...context, state: waiting }] }), [{ head: "b6bd25a7", mergeable: "MERGEABLE", done: false, green: false }], waiting);
  }
  const failed = { ...pr, statusCheckRollup: [...checks, { ...context, state: "FAILURE" }] };
  assert.deepEqual(jq(`(${newest})${state}`, failed), [{ head: "b6bd25a7", mergeable: "MERGEABLE", done: true, green: false }]);
  assert.deepEqual(jq(`(${newest})${failing}`, failed), ["ci/external FAILURE"]);
  // An earlier successful gate, an unrelated workflow's namesake or an
  // optional status context cannot supply a missing gate in the newest CI run.
  for (const substitute of [
    check("checks", 9973185691, "COMPLETED", "SUCCESS"),
    { ...check("checks", 39980673778, "COMPLETED", "SUCCESS"), workflowName: "Other" },
    { ...context, context: "checks" },
  ]) {
    assert.deepEqual(jq(`(${newest})${state}`, { ...pr, statusCheckRollup: [...checks.slice(0, -1), substitute] }), [{ head: "b6bd25a7", mergeable: "MERGEABLE", done: true, green: false }]);
  }
  for (const conclusion of ["SKIPPED", "NEUTRAL", "FAILURE", "CANCELLED"]) {
    const blocked = { ...pr, statusCheckRollup: [...checks.slice(0, -1), check("checks", 39980673777, "COMPLETED", conclusion)] };
    assert.deepEqual(jq(`(${newest})${state}`, blocked), [{ head: "b6bd25a7", mergeable: "MERGEABLE", done: true, green: false }], conclusion);
    assert.deepEqual(jq(`(${newest})${failing}`, blocked), [`checks ${conclusion}`]);
  }
});

test("release-33: merge-on-green refuses missing or skipped CI checks gates even when every other result passes (release-29)", (t) => {
  if (spawnSync("jq", ["--version"]).error) {
    t.skip("jq is not on PATH: the script's jq filters cannot run");
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "spex-merge-required-gate-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), [
    "#!/usr/bin/env bash",
    '[ "$2" = merge ] && { echo "$*" >> "$GH_LOG"; exit 0; }',
    'while [ "$#" -gt 0 ]; do',
    '  if [ "$1" = --jq ]; then shift; jq -r "$1" "$GH_PR"; exit; fi',
    '  shift',
    'done',
    'exit 1',
    "",
  ].join("\n"), { mode: 0o755 });
  const check = (name, conclusion, run = 2) => ({
    __typename: "CheckRun", workflowName: "CI", name, status: "COMPLETED", conclusion,
    detailsUrl: `https://github.com/sublang-ai/spex/actions/runs/${run}/job/21`,
  });
  for (const [name, gate] of [
    ["missing", []],
    ["earlier successful gate only", [check("checks", "SUCCESS", 1)]],
    ["skipped", [check("checks", "SKIPPED")]],
  ]) {
    const fixture = join(dir, `${name}.json`);
    const log = join(dir, `${name}.log`);
    writeFileSync(log, "");
    writeFileSync(fixture, JSON.stringify({
      headRefOid: "2b11055a", mergeable: "MERGEABLE",
      statusCheckRollup: [check("changes", "SUCCESS"), check("test", "SUCCESS"), ...gate],
    }));
    const run = spawnSync("bash", [join(root, "scripts/merge-on-green.sh"), "232"], {
      encoding: "utf8", timeout: 10000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_PR: fixture, GH_LOG: log },
    });
    assert.equal(run.status, 1, `${name}: ${run.stderr}`);
    assert.match(run.stderr, /without a successful CI checks gate/, name);
    assert.equal(readFileSync(log, "utf8"), "", `${name}: no merge was attempted`);
    assert.doesNotMatch(run.stdout, /Merged #232/, name);
  }
});

test("release-33: the merge-on-green script polls again after a failed or empty read, refuses only another head and merges only the head it checked (release-29)", () => {
  const dir = mkdtempSync(join(tmpdir(), "spex-merge-on-green-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // The stand-in gh answers its reads in turn from GH_REPLIES, `fail` failing as a dropped connection does,
  // and refuses the merge while the file GH_MERGE_FAIL names exists, as GitHub does a moved head.
  writeFileSync(join(bin, "gh"), [
    "#!/usr/bin/env bash",
    'echo "$*" >> "$GH_LOG"',
    '[ "$2" = merge ] && [ -n "${GH_MERGE_FAIL:-}" ] && [ -e "$GH_MERGE_FAIL" ] && { echo "GraphQL: Head branch was modified. Review and try the merge again. (mergePullRequest)" >&2; exit 1; }',
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
    { name: "green, then a merge GitHub refuses", replies: ["2b11055a", state("2b11055a")], status: 2, merged: true, refused: true },
  ];
  const merge = "pr merge 232 --merge --match-head-commit 2b11055a";
  for (const [index, c] of cases.entries()) {
    const log = join(dir, `${index}.log`);
    const count = join(dir, `${index}.count`);
    const replies = join(dir, `${index}.replies`);
    writeFileSync(log, "");
    writeFileSync(count, "0");
    writeFileSync(replies, `${c.replies.join("\n")}\n`);
    const refuse = join(dir, `${index}.refuse`);
    if (c.refused) writeFileSync(refuse, "");
    const run = spawnSync("bash", [join(root, "scripts/merge-on-green.sh"), "232"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_LOG: log, GH_COUNT: count, GH_REPLIES: replies, GH_MERGE_FAIL: refuse },
    });
    const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
    assert.equal(run.status, c.status, `${c.name}: ${run.stderr}`);
    assert.equal(calls.includes("sleep 60"), c.replies.includes("fail"), `${c.name}: a failed read, and only a failed read, waits the poll's 60 s and reads again`);
    // Where the merge went, never how many times (release-31): the checked head, and no other.
    assert.equal(calls.includes(merge), c.merged, `${c.name}: the merge names the checked head`);
    assert.ok(calls.filter((call) => call.startsWith("pr merge ")).every((call) => call === merge), `${c.name}: no merge names another head`);
    if (c.status === 0) {
      assert.match(run.stdout, /Merged #232/, c.name);
      assert.doesNotMatch(run.stderr, /The head moved/, c.name);
    } else if (c.refused) {
      assert.match(run.stderr, /GitHub refused the merge; if the head moved, run again for the new head\./, c.name);
      assert.doesNotMatch(run.stdout, /Merged #232/, c.name);
    } else {
      assert.match(run.stderr, /The head moved; run again for the new head\./, c.name);
    }
  }
});


test("release-46: release CI injects the same version before installs, including the archived hub tree", () => {
  for (const name of ["changes", "test", "journeys", "desktop-browser"]) {
    const steps = workflow.jobs[name].steps;
    const at = steps.findIndex(step => step.name === "Prepare release version");
    assert(at > 0, name);
    assert.equal(steps[at].if, "inputs.release-tag != ''");
    assert.deepEqual(steps[at].env, { RELEASE_TAG: "${{ inputs.release-tag }}", RELEASE_CHANNEL: "${{ inputs.channel }}" });
    assert.equal(steps[at].run, "node scripts/release-version.mjs prepare");
    assert(steps.slice(0, at).every(step => !/npm ci/.test(step.run ?? "")), name);
  }
  const desktopBuild = workflow.jobs["desktop-browser"].steps.find(step => step.run?.includes("electron-builder"));
  assert.match(desktopBuild.run, /--config\.mac\.identity=null --config\.mac\.forceCodeSigning=false/);
  const hubSteps = Object.values(laneWorkflow.jobs).flatMap(job => job.steps ?? []);
  const archive = hubSteps.findIndex(step => step.run?.includes("git archive"));
  const stamp = hubSteps.findIndex(step => step.name === "Prepare the archived release version");
  assert(archive >= 0 && stamp > archive);
  assert.equal(hubSteps[stamp].if, "inputs.release-tag != ''");
  assert.match(hubSteps[stamp].run, /release-version\.mjs.*--channel=app/);
});

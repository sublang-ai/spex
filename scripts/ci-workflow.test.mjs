// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
// The repository-system audit of the merge gate (release-33, DR-145).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
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

test("release-33: the matrix runs affected Linux/Windows PR suites, the core's in four parts beside the rest, and retains every full platform row (release-34)", () => {
  const matrix = (full, affected) => {
    const run = spawnSync(process.execPath, [join(root, "scripts/ci-verdict.mjs"), "--matrix"], {
      encoding: "utf8", env: { ...process.env, CI_FULL: String(full), CI_AFFECTED: affected },
    });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout.trim().replace(/^matrix=/, ""));
  };
  const row = (os, version, part = "all") => ({ os, "node-version": version, part });
  // A row whose selection reaches the core: one runner for the rest, four for the core's parts.
  const split = (os, version) => ["rest", "core 1/4", "core 2/4", "core 3/4", "core 4/4"].map((part) => row(os, version, part));
  const linux = row("ubuntu-latest", 22);
  const windows = row("windows-latest", 22);
  for (const affected of ["", "apps/desktop", "apps/server", "e2e"]) {
    assert.deepEqual(matrix(false, affected), { include: [linux] }, affected);
  }
  for (const affected of ["packages/cli", "packages/ui", "packages/ui-extra packages/cli"]) {
    assert.deepEqual(matrix(false, affected), { include: [linux, windows] }, affected);
  }
  for (const affected of ["all", "packages/core apps/desktop"]) {
    assert.deepEqual(matrix(false, affected), { include: [...split("ubuntu-latest", 22), windows] }, affected);
  }
  assert.deepEqual(matrix(false, "packages/ui-extra"), { include: [linux] });
  assert.deepEqual(matrix(false, "packages/core-extra"), { include: [linux] });
  assert.deepEqual(matrix(true, "all"), { include: [
    ...split("ubuntu-latest", 22), ...split("ubuntu-latest", 24), ...split("macos-latest", 22), ...split("macos-latest", 24), windows,
  ] });
  assert.deepEqual(matrix(true, "packages/cli"), { include: [
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

test("release-33: fast gates precede selected suites, once per row; Windows retains its supported subset (release-34)", () => {
  const steps = workflow.jobs.test.steps;
  const buildAt = steps.findIndex((step) => step.name === "Build and catalogs");
  assert.ok(buildAt > steps.findIndex((step) => step.run === "npm ci"));
  assert.equal(steps[buildAt].run, "npm run build");
  assert.equal(steps[buildAt].if, undefined, "every part builds what its suites run");
  const gateAt = steps.findIndex((step) => step.name === "Types and specifications");
  assert.ok(gateAt > buildAt);
  assert.equal(steps[gateAt].shell, "bash", "Windows stops after any failed gate command");
  assert.equal(steps[gateAt].run.trim(), "node packages/cli/dist/cli.js lint\nnpm run typecheck -w e2e");
  assert.equal(steps[gateAt].if, "${{ !startsWith(matrix.part, 'core') }}", "the rest's runner or the whole row's runs the gates; no core part repeats them");
  const reachAt = steps.findIndex((step) => step.name === "Tests the change reaches");
  assert.ok(reachAt > gateAt);
  assert.equal(steps[reachAt].run, `node scripts/affected-tests.mjs --run "\${{ ${AFFECTED} }}" --part "\${{ matrix.part }}"`);
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

const workflowsByName = Object.fromEntries(["ci", "app-release", "release", "hub-lane", "caches"]
  .map((name) => [name, parse(readFileSync(join(root, `.github/workflows/${name}.yml`), "utf8"))]));
const DOWNLOAD_CACHES = "./.github/actions/download-caches";
const installs = (step) => /(^|\n)\s*npm ci(\s|$)/.test(step.run ?? "");

test("release-33: every workflow step running npm ci restores the download caches first, and a job installing nothing saves no npm cache (release-49)", () => {
  let seen = 0;
  for (const [name, current] of Object.entries(workflowsByName)) {
    for (const [jobName, job] of Object.entries(current.jobs)) {
      const steps = job.steps ?? [];
      const installAt = steps.findIndex(installs);
      const node = steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
      if (node?.with?.cache === "npm") assert.ok(installAt >= 0, `${name}/${jobName} saves an npm cache without installing`);
      steps.forEach((step, at) => {
        if (!installs(step)) return;
        seen += 1;
        const caches = steps.slice(0, at).find((candidate) => candidate.uses === DOWNLOAD_CACHES);
        assert.ok(caches, `${name}/${jobName} installs before restoring the download caches`);
        assert.equal(caches.if, step.if, `${name}/${jobName} restores the caches whenever it installs`);
      });
    }
  }
  assert.ok(seen >= 7, "every workflow install was inspected");
  assert.equal(workflow.jobs.changes.steps.find((step) => step.uses?.startsWith("actions/setup-node@")).with.cache, undefined, "the classifier saves no npm cache");
});

test("release-33: the download caches key each archive by platform and locked version, restoring Electron's where its installer and packager both read it (release-49)", () => {
  const action = parse(readFileSync(join(root, ".github/actions/download-caches/action.yml"), "utf8"));
  assert.equal(action.runs.using, "composite");
  const [locked, electron, dugite] = action.runs.steps;
  assert.equal(locked.id, "locked");
  assert.equal(electron.uses, "actions/cache@v4");
  assert.deepEqual(electron.with, { path: "${{ steps.locked.outputs.electron-cache }}", key: "electron-${{ runner.os }}-${{ runner.arch }}-${{ steps.locked.outputs.electron }}" });
  assert.equal(dugite.uses, "actions/cache@v4");
  assert.deepEqual(dugite.with, { path: "${{ runner.temp }}/dugite-cache", key: "dugite-${{ runner.os }}-${{ runner.arch }}-${{ steps.locked.outputs.dugite }}" });

  // The step itself, run over the repository's lockfile under a scratch home.
  const dir = mkdtempSync(join(tmpdir(), "spex-download-caches-"));
  const home = join(dir, "home");
  mkdirSync(home);
  const output = join(dir, "output");
  const env = join(dir, "env");
  writeFileSync(output, "");
  writeFileSync(env, "");
  const { XDG_CACHE_HOME: _xdg, LOCALAPPDATA: _local, electron_config_cache: _cache, ...base } = process.env;
  const run = spawnSync("bash", ["-e", "-c", locked.run], {
    cwd: root, encoding: "utf8", env: { ...base, HOME: home, GITHUB_OUTPUT: output, GITHUB_ENV: env, RUNNER_TEMP: dir },
  });
  assert.equal(run.status, 0, run.stderr);
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages;

  // Electron's installer and electron-builder each use their own copy of
  // @electron/get, neither naming a cache; under the same home both
  // default to the directory the action restores (release-49).
  const resolveFrom = (from, request) => execFileSync(process.execPath, ["-p", `require("node:module").createRequire(${JSON.stringify(join(root, from))}).resolve(${JSON.stringify(request)})`], { encoding: "utf8" }).trim();
  const installerCache = resolveFrom("node_modules/electron/install.js", "@electron/get").replace(/index\.js$/, "Cache.js");
  const packagerCache = resolveFrom("node_modules/app-builder-lib/out/util/electronGet.js", "@electron/get").replace(/index\.js$/, "Cache.js");
  const defaultRoot = (cacheModule) => {
    const probe = spawnSync(process.execPath, ["--input-type=module", "-e", `const { Cache } = await import(${JSON.stringify(pathToFileURL(cacheModule).href)}); console.log(new Cache().cacheRoot);`], {
      encoding: "utf8", env: { ...base, HOME: home },
    });
    assert.equal(probe.status, 0, probe.stderr);
    return probe.stdout.trim();
  };
  const shared = defaultRoot(installerCache);
  assert.equal(defaultRoot(packagerCache), shared, "the packager reuses the installer's archive");
  assert.equal(readFileSync(output, "utf8"), `electron=${lock["node_modules/electron"].version}\ndugite=${lock["node_modules/dugite"].version}\nelectron-cache=${shared}\n`);
  assert.equal(readFileSync(env, "utf8"), `DUGITE_CACHE_DIR=${dir}/dugite-cache\n`, "no Electron cache override parts the installer from the packager");
  for (const [name, current] of Object.entries(workflowsByName)) assert.doesNotMatch(JSON.stringify(current), /electron_config_cache|electronDownload/, name);
  assert.equal(JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8")).build.electronDownload, undefined, "the packager names no cache of its own");
  assert.match(readFileSync(join(root, "node_modules/dugite/script/config.js"), "utf8"), /process\.env\.DUGITE_CACHE_DIR/);
});

test("release-33: the cache seed runs on main's lockfile and cache-tooling changes or on request on main, refusing any other ref, installing and fetching Electron in jobs of their own on every platform, each retried, and running nothing else (release-50)", () => {
  const seed = workflowsByName.caches;
  assert.deepEqual(Object.keys(seed.on).sort(), ["push", "workflow_dispatch"]);
  assert.deepEqual(seed.on.push, { branches: ["main"], paths: ["package-lock.json", ".github/workflows/caches.yml", ".github/actions/download-caches/action.yml"] });
  assert.deepEqual(seed.permissions, { contents: "read" });
  assert.deepEqual(Object.keys(seed.jobs), ["ref", "install", "electron"]);
  // A request on any other ref would save caches no pull request or release reads.
  const ref = seed.jobs.ref;
  assert.equal(ref["runs-on"], "ubuntu-latest");
  assert.deepEqual(ref.steps.map((step) => step.uses ?? step.name), ["Seed only under main"]);
  assert.deepEqual(ref.steps[0].env, { REF: "${{ github.ref }}" });
  for (const [value, ok] of [["refs/heads/main", true], ["refs/heads/faster-ci", false], ["refs/tags/app-v1.0.0", false], ["refs/heads/main-old", false], ["", false]]) {
    const guard = spawnSync("bash", ["-e", "-c", ref.steps[0].run], { encoding: "utf8", env: { ...process.env, REF: value } });
    assert.equal(guard.status === 0, ok, value);
    if (!ok) assert.match(guard.stdout, /::error::.*main.*\b(dispatch|run) it on main\b/, value);
  }
  // Two jobs per platform, each saving only what its own success verified (DR-230).
  for (const name of ["install", "electron"]) {
    const job = seed.jobs[name];
    assert.equal(job.needs, "ref", `${name}: no platform installs or saves before the ref is main`);
    assert.deepEqual(job.strategy.matrix.os, ["ubuntu-latest", "macos-latest", "windows-latest"], name);
    assert.equal(job.strategy["fail-fast"], false, `${name}: one platform's failure cancels no other platform's save`);
    assert.equal(job["runs-on"], "${{ matrix.os }}", name);
    assert.equal(job["continue-on-error"], undefined, `${name}: a failed fetch fails its job, which then saves nothing`);
    for (const step of job.steps) assert.equal(step["continue-on-error"], undefined, `${name}: ${step.name ?? step.uses ?? step.run}`);
  }
  const install = seed.jobs.install;
  assert.deepEqual(install.steps.map((step) => step.uses ?? step.name), [
    "actions/checkout@v4", "actions/setup-node@v4", DOWNLOAD_CACHES, "Install, retrying a failed download",
  ]);
  assert.equal(install.steps[1].with.cache, "npm", "the install's success saves npm's cache");
  const electron = seed.jobs.electron;
  assert.deepEqual(electron.steps.map((step) => step.uses ?? step.run ?? step.name), [
    "actions/checkout@v4", "actions/setup-node@v4", DOWNLOAD_CACHES, "npm ci --ignore-scripts", electron.steps[4].run,
  ]);
  assert.equal(electron.steps[4].name, "Fetch Electron into its cache, retrying a failed download");
  assert.equal(electron.steps[1].with.cache, undefined, "an install without its scripts saves no npm cache");

  // dugite's own configuration names the archive in DUGITE_CACHE_DIR and its checksum; the install's cleanup reads them.
  const dugiteCache = mkdtempSync(join(tmpdir(), "spex-dugite-config-"));
  const dugiteConfig = JSON.parse(execFileSync(process.execPath, ["-p", 'JSON.stringify(require("./node_modules/dugite/script/config.js")())'], {
    cwd: root, encoding: "utf8", env: { ...process.env, DUGITE_CACHE_DIR: dugiteCache },
  }));
  assert.equal(resolve(dugiteConfig.tempFile, ".."), resolve(dugiteCache));
  assert.match(dugiteConfig.checksum, /^[0-9a-f]{64}$/);

  // Each retry loop, run with stand-ins: `npm ci` (or Electron's
  // installer) fails a given number of times, writing what a cut-short or
  // a whole download leaves in dugite's cache when told to, and npm's
  // rollback taking the project's dugite with it unless it stays installed;
  // `npm install --prefix` installs the locked dugite apart, unless the
  // registry is down; `sleep` records its delays without waiting. Each
  // fixture dugite configuration names the archive and its checksum.
  const GOOD = "a complete archive";
  const PARTIAL = "cut short";
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")).packages;
  const configModule = (tempFile) => `module.exports = () => ({ tempFile: ${JSON.stringify(tempFile)}, checksum: ${JSON.stringify(createHash("sha256").update(GOOD).digest("hex"))} });\n`;
  const retry = (step, failures, standIn, { restored, written, dugiteInstalled = false, registry = true } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "spex-seed-retry-"));
    const log = (name) => join(dir, `${name}.log`);
    const cache = join(dir, "dugite-cache");
    mkdirSync(cache);
    const tempFile = join(cache, "dugite.tar.gz");
    if (restored !== undefined) writeFileSync(tempFile, restored);
    if (dugiteInstalled) {
      mkdirSync(join(dir, "node_modules", "dugite", "script"), { recursive: true });
      writeFileSync(join(dir, "node_modules", "dugite", "script", "config.js"), configModule(tempFile));
    }
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ packages: { "node_modules/dugite": { version: lock["node_modules/dugite"].version } } }));
    const lockedConfig = join(dir, "locked-config.js");
    writeFileSync(lockedConfig, configModule(tempFile));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    const fake = (name, body) => writeFileSync(join(bin, name), ["#!/usr/bin/env bash", `echo "$*" >> "${log(name)}"`, body, ""].join("\n"), { mode: 0o755 });
    // A failing try writes, if told to, only where dugite would: a download is fetched afresh only when no archive stands.
    const write = written === undefined ? "" : `[ -e "${tempFile}" ] || printf %s ${JSON.stringify(written)} > "${tempFile}"; `;
    const tries = (counted) => `[ "$(grep -c '${counted}' "${log(standIn)}")" -gt ${failures} ] && exit 0; ${write}exit 1`;
    if (standIn === "npm") {
      fake("npm", [
        'if [ "$1" = install ]; then',
        registry ? `  prefix=$(printf '%s\\n' "$@" | sed -n '/^--prefix$/{n;p;}'); mkdir -p "$prefix/node_modules/dugite/script" && cp "${lockedConfig}" "$prefix/node_modules/dugite/script/config.js"; exit 0` : "  exit 1",
        "fi",
        tries("^ci"),
      ].join("\n"));
    } else {
      fake(standIn, tries("install.js"));
    }
    fake("sleep", "exit 0");
    assert.equal(step.shell, "bash");
    const runnerTemp = join(dir, "runner-temp");
    mkdirSync(runnerTemp);
    const run = spawnSync("bash", ["-c", step.run], {
      cwd: dir, encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...step.env, RETRY_SECONDS: String(step.env.RETRY_SECONDS), DUGITE_CACHE_DIR: cache, RUNNER_TEMP: runnerTemp },
    });
    const lines = (name) => (existsSync(log(name)) ? readFileSync(log(name), "utf8").split("\n").filter(Boolean) : []);
    const calls = lines(standIn).filter((line) => standIn !== "npm" || line.startsWith("ci")).length;
    return { status: run.status, calls, delays: lines("sleep"), archive: existsSync(tempFile) ? readFileSync(tempFile, "utf8") : null, installs: standIn === "npm" ? lines("npm").filter((line) => line.startsWith("install")) : [], warned: /::warning::No dugite checksum/.test(run.stdout) };
  };
  assert.deepEqual(install.steps[3].env, { RETRY_SECONDS: 60 });
  const installRun = install.steps[3];
  const pass = (calls, archive, extra = {}) => ({ status: 0, calls, delays: ["60", "120"].slice(0, calls - 1), archive, warned: false, ...extra });
  const strip = ({ installs: _installs, ...rest }) => rest;
  const first = retry(installRun, 0, "npm", { restored: GOOD });
  assert.deepEqual(strip(first), pass(1, GOOD));
  assert.equal(first.installs.length, 1, "the locked dugite is installed apart once");
  assert.match(first.installs[0], new RegExp(`^install --prefix \\S+ --no-save --ignore-scripts .*\\bdugite@${lock["node_modules/dugite"].version.replace(/\./g, "\\.")}$`), "the locked version, its scripts never run");
  assert.deepEqual(strip(retry(installRun, 1, "npm", { restored: GOOD })), pass(2, GOOD), "a restored archive stays though npm rolled the install back");
  assert.deepEqual(strip(retry(installRun, 2, "npm", { written: PARTIAL })), pass(3, null), "a partial archive is dropped though npm rolled dugite back");
  assert.deepEqual(strip(retry(installRun, 1, "npm", { written: GOOD })), pass(2, GOOD), "a cold cache keeps the archive dugite verified though another script's failure rolled the install back");
  assert.deepEqual(strip(retry(installRun, 2, "npm", { written: PARTIAL, dugiteInstalled: true, registry: false })), pass(3, null), "without the locked copy, the installed dugite's checksum still drops a partial archive");
  assert.deepEqual(strip(retry(installRun, 1, "npm", { written: PARTIAL, registry: false })), pass(2, PARTIAL, { warned: true }), "with no checksum at all, the cache is kept as it is and the run warns");
  assert.deepEqual(strip(retry(installRun, 3, "npm", { restored: GOOD })), { status: 1, calls: 3, delays: ["60", "120"], archive: GOOD, warned: false }, "three failed attempts fail the job");
  const fetchRun = electron.steps[4];
  assert.deepEqual(fetchRun.env, { RETRY_SECONDS: 60 });
  assert.deepEqual(strip(retry(fetchRun, 1, "node")), { status: 0, calls: 2, delays: ["60"], archive: null, warned: false });
  assert.deepEqual(strip(retry(fetchRun, 3, "node")), { status: 1, calls: 3, delays: ["60", "120"], archive: null, warned: false });
  // No other workflow gained a push-to-main or scheduled trigger.
  for (const [name, current] of Object.entries(workflowsByName)) {
    if (name === "caches") continue;
    assert.equal(current.on.schedule, undefined, name);
    assert.ok(!(current.on.push?.branches ?? []).includes("main"), name);
  }
});

test("release-33: the core's parts deal its test files largest first, every file in exactly one part (release-34)", () => {
  // The real runner over a fixture suite: files whose sizes order them f1 (largest) to f8.
  const dir = mkdtempSync(join(tmpdir(), "spex-core-parts-"));
  mkdirSync(join(dir, "scripts"));
  mkdirSync(join(dir, "dist", "nested"), { recursive: true });
  writeFileSync(join(dir, "scripts", "run-tests.cjs"), readFileSync(join(root, "packages/core/scripts/run-tests.cjs")));
  const names = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8"];
  names.forEach((name, at) => {
    const file = at === 4 ? join(dir, "dist", "nested", `${name}.test.js`) : join(dir, "dist", `${name}.test.js`);
    writeFileSync(file, `require("node:test").test("file-${name}", () => {});\n//${"x".repeat((names.length - at) * 100)}\n`);
  });
  writeFileSync(join(dir, "dist", "helper.js"), `//${"x".repeat(5000)}\n`);
  // Without this suite's own test context, so the nested run reports as a top-level one.
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const run = (shard) => {
    const result = spawnSync(process.execPath, [join(dir, "scripts", "run-tests.cjs")], {
      cwd: dir, encoding: "utf8", env: { ...env, SPEX_TEST_SHARD: shard ?? "" },
    });
    const ran = [...result.stdout.matchAll(/^(?:ok \d+ - |\s*✔ )file-(f\d)\b/gm)].map((match) => match[1]).sort();
    return { status: result.status, stderr: result.stderr, stdout: result.stdout, ran };
  };
  const whole = run();
  assert.equal(whole.status, 0, whole.stderr);
  assert.deepEqual(whole.ran, names, "with no part named, every file runs");
  const parts = ["1/3", "2/3", "3/3"].map(run);
  for (const part of parts) assert.equal(part.status, 0, part.stderr);
  assert.deepEqual(parts.map((part) => part.ran), [["f1", "f4", "f7"], ["f2", "f5", "f8"], ["f3", "f6"]], "dealt in turn, largest first");
  assert.deepEqual(parts.flatMap((part) => part.ran).sort(), names, "every file in exactly one part");
  assert.match(parts[0].stdout, /run-tests: part 1 of 3, 3 of 8 files/);
  const empty = run("9/9");
  assert.equal(empty.status, 0, empty.stderr);
  assert.deepEqual(empty.ran, []);
  for (const shard of ["4/3", "0/3", "3", "a/b"]) assert.equal(run(shard).status, 2, shard);
  // The core's own suite runs through this runner.
  assert.match(JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8")).scripts.test, /node scripts\/run-tests\.cjs$/);
});

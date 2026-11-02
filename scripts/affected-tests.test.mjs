// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The suites a change reaches (release-34, release-43, DR-185): the
// classifier run as CI and `npm run test:affected` run it, over a fixture
// monorepo, over this repository's own workspaces and with a stand-in npm.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
const script = join(root, "scripts/affected-tests.mjs");
const posixOnly = process.platform === "win32" && "the stand-in npm is a bash script";

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}

/**
 * A monorepo of five workspaces, each dependency field used once:
 * mid depends on base, app on mid (dev), tools on base (peer) and leaf
 * on base (optional); nothing depends on leaf. A folder under packages/
 * without a package.json is no workspace.
 */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "spex-affected-"));
  write(join(dir, "package.json"), { name: "fixture", private: true, workspaces: ["packages/*", "apps/*", "tools"] });
  write(join(dir, "packages/base/package.json"), { name: "@fx/base" });
  write(join(dir, "packages/mid/package.json"), { name: "@fx/mid", dependencies: { "@fx/base": "*", "left-pad": "^1.0.0" } });
  write(join(dir, "apps/app/package.json"), { name: "fx-app", devDependencies: { "@fx/mid": "*" } });
  write(join(dir, "apps/leaf/package.json"), { name: "fx-leaf", optionalDependencies: { "@fx/base": "*" } });
  write(join(dir, "tools/package.json"), { name: "fx-tools", peerDependencies: { "@fx/base": "*" } });
  write(join(dir, "packages/notes/README.txt"), "no workspace\n");
  return dir;
}

function reach(dir, paths, ...args) {
  const list = join(mkdtempSync(join(tmpdir(), "spex-affected-paths-")), "paths.txt");
  writeFileSync(list, `${paths.join("\n")}\n`);
  const run = spawnSync(process.execPath, [script, "--root", dir, "--paths", list, ...args], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  return args.includes("--github-output") ? run.stdout.trim().split("\n") : JSON.parse(run.stdout);
}

test("documentation alone reaches nothing: docs/, specs/ and Markdown anywhere", () => {
  const dir = fixture();
  assert.deepEqual(reach(dir, ["docs/guide.txt", "specs/decisions/001-x.md", "packages/base/README.md", "CHANGELOG.md"]), { docsOnly: true, all: false, workspaces: [] });
  assert.deepEqual(reach(dir, []), { docsOnly: false, all: false, workspaces: [] }, "no path is no documentation");
});

test("a workspace no other depends on reaches itself alone", () => {
  assert.deepEqual(reach(fixture(), ["apps/leaf/src/index.ts"]), { docsOnly: false, all: false, workspaces: ["apps/leaf"] });
});

test("a workspace reaches itself and every transitive dependent, through each dependency field", () => {
  const dir = fixture();
  assert.deepEqual(reach(dir, ["packages/base/src/x.ts"]).workspaces, ["apps/app", "apps/leaf", "packages/base", "packages/mid", "tools"]);
  assert.deepEqual(reach(dir, ["packages/mid/src/x.ts"]).workspaces, ["apps/app", "packages/mid"]);
  assert.deepEqual(reach(dir, ["tools/bin/run.mjs", "apps/leaf/x.ts"]).workspaces, ["apps/leaf", "tools"]);
});

test("a root path reaches everything", () => {
  const dir = fixture();
  for (const path of [".github/workflows/ci.yml", "package-lock.json", "scripts/x.mjs", "packages/notes/README.txt", "packages/base2/x.ts"]) {
    const result = reach(dir, [path, "apps/leaf/x.ts"]);
    assert.equal(result.all, true, path);
    assert.equal(result.docsOnly, false, path);
  }
});

test("documentation beside code is no documentation alone and adds nothing to the reach", () => {
  assert.deepEqual(reach(fixture(), ["specs/x.md", "docs/y.txt", "packages/mid/src/y.ts"]), { docsOnly: false, all: false, workspaces: ["apps/app", "packages/mid"] });
});

test("--github-output writes docs-only and affected: all, the folders or empty", () => {
  const dir = fixture();
  assert.deepEqual(reach(dir, ["specs/x.md"], "--github-output"), ["docs-only=true", "affected="]);
  assert.deepEqual(reach(dir, ["package.json"], "--github-output"), ["docs-only=false", "affected=all"]);
  assert.deepEqual(reach(dir, ["packages/mid/x.ts"], "--github-output"), ["docs-only=false", "affected=apps/app packages/mid"]);
});

test("the changed paths are the working tree's against the merge base, both sides of a rename", () => {
  const dir = fixture();
  write(join(dir, "apps/leaf/src/a.ts"), "export const a = 1;\n");
  write(join(dir, "apps/app/src/b.ts"), "export const b = 1;\n");
  const git = (...args) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", ...args], { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "change");
  // A move out of apps/leaf into tools: rename detection would name tools alone.
  mkdirSync(join(dir, "tools/src"), { recursive: true });
  renameSync(join(dir, "apps/leaf/src/a.ts"), join(dir, "tools/src/a.ts"));
  git("add", "-A");
  git("commit", "-q", "-m", "move");
  // main moves on past the branch point; its change is not this change's.
  git("checkout", "-q", "main");
  write(join(dir, "scripts/x.mjs"), "export {};\n");
  git("add", "-A");
  git("commit", "-q", "-m", "main moves");
  git("checkout", "-q", "change");
  // An uncommitted change to a tracked file counts.
  writeFileSync(join(dir, "apps/app/src/b.ts"), "export const b = 2;\n");
  const run = spawnSync(process.execPath, [script, "--root", dir, "--base", "main"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { docsOnly: false, all: false, workspaces: ["apps/app", "apps/leaf", "tools"] });
});

/** This repository's workspaces and what each depends on, read from its own package.json files. */
function repositoryWorkspaces() {
  const folders = [];
  for (const glob of JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces) {
    if (glob.endsWith("/*")) {
      const parent = glob.slice(0, -2);
      for (const entry of readdirSync(join(root, parent))) folders.push(`${parent}/${entry}`);
    } else folders.push(glob);
  }
  return folders.filter((folder) => existsSync(join(root, folder, "package.json"))).map((folder) => {
    const pkg = JSON.parse(readFileSync(join(root, folder, "package.json"), "utf8"));
    const names = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((field) => Object.keys(pkg[field] ?? {}));
    return { folder, name: pkg.name, names };
  });
}

test("this repository: the UI reaches itself, the core its dependents, the hub itself", () => {
  const workspaces = repositoryWorkspaces();
  // The core's dependents, to a fixpoint over the manifests.
  const reached = new Set(["packages/core"]);
  for (let grew = true; grew;) {
    grew = false;
    for (const workspace of workspaces) {
      if (reached.has(workspace.folder)) continue;
      const reachedNames = workspaces.filter((other) => reached.has(other.folder)).map((other) => other.name);
      if (workspace.names.some((name) => reachedNames.includes(name))) {
        reached.add(workspace.folder);
        grew = true;
      }
    }
  }
  const core = reach(root, ["packages/core/src/x.ts"]);
  assert.deepEqual(core.workspaces, [...reached].sort());
  assert.ok(core.workspaces.includes("packages/core"));
  assert.ok(core.workspaces.includes("packages/ui"), "the UI depends on the core");
  assert.ok(!core.workspaces.includes("packages/cli"), "the CLI is the core's dependency, not its dependent");
  assert.deepEqual(reach(root, ["packages/ui/src/x.ts"]), { docsOnly: false, all: false, workspaces: ["packages/ui"] });
  assert.deepEqual(reach(root, ["apps/hub/x.ts"]), { docsOnly: false, all: false, workspaces: ["apps/hub"] });
});

/** Runs the script with a stand-in npm that logs its arguments and fails with 3 on the command NPM_FAIL_ON names. */
function runWithNpm(args, failOn = "") {
  const dir = mkdtempSync(join(tmpdir(), "spex-affected-npm-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "npm.log");
  writeFileSync(log, "");
  writeFileSync(join(bin, "npm"), [
    "#!/usr/bin/env bash",
    'echo "$*" >> "$NPM_LOG"',
    '[ -n "$NPM_FAIL_ON" ] && [ "$*" = "$NPM_FAIL_ON" ] && exit 3',
    "exit 0",
    "",
  ].join("\n"), { mode: 0o755 });
  const run = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NPM_LOG: log, NPM_FAIL_ON: failOn },
  });
  return { status: run.status, stderr: run.stderr, calls: readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

test("--run runs the script tests, then everything's, each folder's or none", { skip: posixOnly }, () => {
  const all = runWithNpm(["--run", "all"]);
  assert.equal(all.status, 0, all.stderr);
  assert.deepEqual(all.calls, ["run test:scripts", "test --workspaces --if-present"]);
  const two = runWithNpm(["--run", "packages/core packages/ui"]);
  assert.equal(two.status, 0, two.stderr);
  assert.deepEqual(two.calls, ["run test:scripts", "test -w packages/core --if-present", "test -w packages/ui --if-present"]);
  const none = runWithNpm(["--run", ""]);
  assert.equal(none.status, 0, none.stderr);
  assert.deepEqual(none.calls, ["run test:scripts"]);
});

test("--run without an argument runs what the change reaches", { skip: posixOnly }, () => {
  const list = join(mkdtempSync(join(tmpdir(), "spex-affected-paths-")), "paths.txt");
  writeFileSync(list, "packages/mid/src/x.ts\n");
  const computed = runWithNpm(["--root", fixture(), "--run", "--paths", list]);
  assert.equal(computed.status, 0, computed.stderr);
  assert.deepEqual(computed.calls, ["run test:scripts", "test -w apps/app --if-present", "test -w packages/mid --if-present"]);
});

test("npm run test:affected runs what the change reaches, and the script tests run these tests", () => {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
  assert.equal(scripts["test:affected"], "node scripts/affected-tests.mjs --run");
  assert.ok(scripts["test:scripts"].split(/\s+/).includes("scripts/affected-tests.test.mjs"));
});

test("--run ends with the first failing command's status and runs nothing after it", { skip: posixOnly }, () => {
  const failed = runWithNpm(["--run", "packages/core packages/ui"], "test -w packages/core --if-present");
  assert.equal(failed.status, 3);
  assert.deepEqual(failed.calls, ["run test:scripts", "test -w packages/core --if-present"]);
});

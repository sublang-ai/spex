// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Repository-system audit: both release channels require full validation of
// their tagged tree; native downloads must publish together after packaging.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const workflow = parse(read(".github/workflows/app-release.yml"));
const cliWorkflow = parse(read(".github/workflows/release.yml"));
const desktop = JSON.parse(read("apps/desktop/package.json"));

test("release-45: exact-tag validation retains only the authorized beta.26 exception", () => {
  for (const [channel, current] of [["app", workflow], ["cli", cliWorkflow]]) {
    assert.deepEqual(current.on, { push: { tags: [`${channel}-v*`] } });
    assert.deepEqual(current.permissions, {});
    assert.deepEqual(current.jobs.validate, {
      uses: "./.github/workflows/ci.yml",
      permissions: { contents: "read" },
      with: { full: channel === "app" ? "${{ github.ref_name != 'app-v0.9.0-beta.26' }}" : true, channel },
    }, "a local reusable call validates the caller's exact commit with explicit full channel scope");
    assert.equal(current.jobs["require-ci-green"], undefined, "a prior CI run cannot substitute for full validation");
    const releaseNeeds = [current.jobs.release.needs].flat();
    assert.ok(releaseNeeds.includes("validate"), `${channel} publication directly requires full validation`);
    for (const [id, job] of Object.entries(current.jobs)) {
      assert.equal(job.if, undefined, `${channel}/${id} must skip when a required job fails, skips or is cancelled`);
      assert.equal(job["continue-on-error"], undefined, `${channel}/${id} cannot forgive failure`);
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("actions/checkout@")) {
          assert.equal(step.with?.ref, undefined, "check out the workflow's tagged tree, not a moving branch");
        }
      }
    }
  }
});

test("release-40: app preparation checks version, notes and runtime sources without repeating validated suites", () => {
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  const prepare = workflow.jobs.prepare;
  assert.equal(prepare.needs, "validate");
  const commands = prepare.steps.filter((s) => s.run).map((s) => s.run);
  assert.match(commands[0], /release-notes\.mjs check --tag="\$GITHUB_REF_NAME"/);
  assert.match(commands[1], /release-notes\.mjs notes/);
  assert.deepEqual(commands.slice(2, 3), ["node scripts/dependency-closure.mjs --registry-only"]);
  assert.equal(prepare.steps.find((s) => s.uses?.startsWith("actions/checkout@")).with["fetch-depth"], 0);
});

test("release-45: beta.26 requires a main merge with the exact green PR tree", () => {
  const guard = workflow.jobs.prepare.steps.find(step => step.name === "Require the accepted PR tree for the beta.26 exception");
  assert.equal(guard.if, "github.ref_name == 'app-v0.9.0-beta.26'");
  assert.equal(workflow.jobs.prepare.permissions.checks, "read");
  assert.match(guard.run, /set -euo pipefail/);
  assert.match(guard.run, /merge-base --is-ancestor HEAD origin\/main/);
  assert.match(guard.run, /rev-parse HEAD\^2/);
  assert.match(guard.run, /git diff --exit-code "\$accepted_head" HEAD/);
  assert.match(guard.run, /commits\/\$accepted_head\/check-runs/);
  assert.match(guard.run, /sort_by\(\.started_at\) \| last/);
  assert.match(guard.run, /test "\$conclusion" = success/);
});

test("release-45: the beta.26 shell gate refuses failed checks and unreviewed tree bytes", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "spex-release-guard-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: fixture, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-b", "main");
  git("config", "user.name", "Acceptance");
  git("config", "user.email", "acceptance@example.invalid");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(fixture, "source"), "base");
  git("add", "source"); git("commit", "-m", "base");
  git("checkout", "-b", "accepted");
  writeFileSync(join(fixture, "source"), "accepted");
  git("commit", "-am", "accepted");
  git("checkout", "main"); git("merge", "--no-ff", "accepted", "-m", "merge accepted");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  // Only the remote status response is recorded; Git ancestry and tree
  // checks execute against real commits through the workflow's own shell.
  const bin = join(fixture, "bin"); mkdirSync(bin);
  const gh = join(bin, "gh");
  writeFileSync(gh, '#!/bin/sh\nprintf "%s\\n" "$SPEX_GATE_RESULT"\n'); chmodSync(gh, 0o755);
  const guard = workflow.jobs.prepare.steps.find(step => step.name === "Require the accepted PR tree for the beta.26 exception");
  const check = conclusion => spawnSync("bash", ["-c", guard.run], {
    cwd: fixture, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_REPOSITORY: "sublang-ai/spex", SPEX_GATE_RESULT: conclusion },
  });
  assert.equal(check("success").status, 0);
  assert.notEqual(check("failure").status, 0);
  assert.notEqual(check("").status, 0);
  writeFileSync(join(fixture, "source"), "unreviewed");
  git("commit", "--amend", "-am", "unreviewed merge");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  assert.notEqual(check("success").status, 0);
});

test("release-45: CLI publication builds and inspects the package without repeating its validated lifecycle tests", () => {
  const release = cliWorkflow.jobs.release;
  assert.equal(release.needs, "validate");
  assert.deepEqual(release.permissions, { contents: "write", "id-token": "write" });
  const commands = release.steps.filter((step) => step.run).map((step) => step.run);
  const install = commands.indexOf("npm ci");
  const build = commands.indexOf("npm run build -w packages/cli");
  const publish = commands.indexOf("npm publish -w packages/cli --provenance --access public --ignore-scripts");
  assert.ok(install >= 0 && install < build && build < publish);
  assert.ok(publish >= 0, "publishing reuses full validation without rerunning prepublishOnly");
  assert.equal(commands.some((command) => /\bnpm (test|run build)$/.test(command)), false);
  assert.ok(commands.slice(build + 1, publish).some((command) => command.includes("npm pack --dry-run -w packages/cli")));
  assert.ok(commands.slice(build + 1, publish).some((command) => command.includes('"$TAG_VERSION" != "$PKG_VERSION"')));
  assert.ok(commands.slice(build + 1, publish).some((command) => command.includes('if [ ! -s /tmp/release-notes.md ]')));
  const cli = JSON.parse(read("packages/cli/package.json"));
  assert.equal(cli.scripts.prepublishOnly, "npm run build && npm test", "ordinary package publication retains its lifecycle gate");
});

test("release-40: both native jobs build locked dependencies and upload their exact versioned download", () => {
  const job = workflow.jobs.package;
  assert.equal(job.needs, "prepare");
  assert.equal(job.strategy["fail-fast"], false);
  assert.deepEqual(job.strategy.matrix.include, [
    { os: "macos-15", script: "package:mac", asset: "mac-arm64.dmg" },
    { os: "windows-2022", script: "package:windows", asset: "win-x64.exe" },
  ]);
  assert.equal(job["runs-on"], "${{ matrix.os }}");
  assert.deepEqual(job.permissions, { contents: "read" });
  assert.equal(workflow.env?.ELECTRON_SKIP_BINARY_DOWNLOAD, undefined);
  assert.equal(job.env?.ELECTRON_SKIP_BINARY_DOWNLOAD, undefined);
  assert.deepEqual(job.steps.filter((s) => s.run).map((s) => s.run), [
    "npm ci", "npm run build", "npm run ${{ matrix.script }} -w apps/desktop",
  ]);
  const checkout = job.steps.find((s) => s.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with.ref, undefined, "build this workflow's tagged tree, not moving main");
  const upload = job.steps.find((s) => s.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(upload.with.path, "apps/desktop/release/Spex-${{ needs.prepare.outputs.version }}-${{ matrix.asset }}");
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.equal(upload.with.name, "desktop-${{ matrix.asset }}");
  assert.equal(desktop.scripts.package, "npm run package:mac");
  for (const name of ["package:mac", "package:windows"]) {
    assert.match(desktop.scripts[name], /--publish never$/);
    assert.match(desktop.scripts[name], /rebuild:electron/);
  }
  assert.match(desktop.scripts["package:mac"], /--mac dmg --arm64/);
  assert.match(desktop.scripts["package:windows"], /stage:windows-runtime.*--win nsis --x64/);
  assert.deepEqual(desktop.build.mac.target, [{ target: "dmg", arch: ["arm64"] }]);
  assert.deepEqual(desktop.build.win.target, [{ target: "nsis", arch: ["x64"] }]);
  assert.equal(desktop.build.mac.artifactName, "Spex-${version}-mac-${arch}.${ext}");
  assert.equal(desktop.build.win.artifactName, "Spex-${version}-win-${arch}.${ext}");
  assert.equal(desktop.build.nsis.perMachine, false);
  assert.deepEqual(desktop.build.asarUnpack, ["node_modules/**/*"]);
});

test("release-40: the sole publisher waits for both platforms, requires both downloads and adds checksums", () => {
  const release = workflow.jobs.release;
  assert.deepEqual(release.needs, ["validate", "prepare", "package"]);
  assert.equal(release.if, undefined, "failed needs must skip publication");
  assert.deepEqual(release.permissions, { contents: "write" });
  assert.deepEqual(Object.entries(workflow.jobs).filter(([, j]) => j.permissions?.contents === "write").map(([id]) => id), ["release"]);
  assert.equal(release.steps.some((s) => s.run?.includes("npm publish")), false);
  const download = release.steps.find((s) => s.with?.pattern);
  assert.equal(download.with.pattern, "desktop-*");
  assert.equal(download.with["merge-multiple"], true);
  assert.equal(download.with.path, "artifacts");
  const sums = release.steps.find((s) => s.run);
  assert.equal(sums["working-directory"], "artifacts");
  assert.equal(sums.env.VERSION, "${{ needs.prepare.outputs.version }}");
  assert.match(sums.run, /set -euo pipefail/);
  assert.match(sums.run, /test -s "Spex-\$VERSION-mac-arm64\.dmg"/);
  assert.match(sums.run, /test -s "Spex-\$VERSION-win-x64\.exe"/);
  assert.match(sums.run, /sha256sum "Spex-\$VERSION-mac-arm64\.dmg" "Spex-\$VERSION-win-x64\.exe" > SHA256SUMS/);
  const publish = release.steps.at(-1);
  assert.ok(publish.uses.startsWith("softprops/action-gh-release@"));
  assert.equal(publish.with["fail_on_unmatched_files"], true);
  assert.deepEqual(publish.with.files.trim().split("\n"), ["artifacts/*.dmg", "artifacts/*.exe", "artifacts/SHA256SUMS"]);
  assert.equal(publish.with.prerelease, "${{ needs.prepare.outputs.beta == 'true' }}");
});

test("release-40: the publication command rejects a missing platform and hashes both supplied downloads", { skip: process.platform === "win32" }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "spex-release-assets-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const version = "1.2.3-beta.1";
  const mac = `Spex-${version}-mac-arm64.dmg`;
  const win = `Spex-${version}-win-x64.exe`;
  const command = workflow.jobs.release.steps.find((s) => s.run).run;
  const run = () => spawnSync("bash", ["-c", command], {
    cwd: dir, env: { ...process.env, VERSION: version }, encoding: "utf8",
  });
  writeFileSync(join(dir, mac), "mac fixture");
  assert.notEqual(run().status, 0);
  assert.equal(existsSync(join(dir, "SHA256SUMS")), false);
  writeFileSync(join(dir, win), "win fixture");
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const expected = [[mac, "mac fixture"], [win, "win fixture"]]
    .map(([name, bytes]) => `${createHash("sha256").update(bytes).digest("hex")}  ${name}\n`).join("");
  assert.equal(readFileSync(join(dir, "SHA256SUMS"), "utf8"), expected);
});

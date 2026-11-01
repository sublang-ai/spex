// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Repository-system audit: the tag-to-download graph must not publish a
// partial release or let a native packager publish ahead of the other OS.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const workflow = parse(read(".github/workflows/app-release.yml"));
const desktop = JSON.parse(read("apps/desktop/package.json"));

test("release-40: only app tags enter CI-gated preparation, with version and notes checked before builds", () => {
  assert.deepEqual(workflow.on, { push: { tags: ["app-v*"] } });
  assert.deepEqual(workflow.permissions, {});
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  const gate = workflow.jobs["require-ci-green"];
  assert.deepEqual(gate.permissions, { actions: "read" });
  const wait = gate.steps[0].run;
  assert.match(wait, /actions\/workflows\/ci\.yml\/runs\?head_sha=\$SHA/);
  assert.match(wait, /conclusion" = "success"/);
  assert.match(wait, /seq 1 60/);
  assert.match(wait, /Timed out/);
  const prepare = workflow.jobs.prepare;
  assert.equal(prepare.needs, "require-ci-green");
  const commands = prepare.steps.filter((s) => s.run).map((s) => s.run);
  assert.match(commands[0], /release-notes\.mjs check --tag="\$GITHUB_REF_NAME"/);
  assert.match(commands[1], /release-notes\.mjs notes/);
  assert.deepEqual(commands.slice(2), ["node scripts/dependency-closure.mjs --registry-only", "npm ci", "npm run build", "npm test"]);
  assert.equal(prepare.steps.find((s) => s.uses?.startsWith("actions/checkout@")).with["fetch-depth"], 0);
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
  assert.deepEqual(release.needs, ["prepare", "package"]);
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

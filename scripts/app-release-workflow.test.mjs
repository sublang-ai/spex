// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Repository-system audit: both release channels require full validation of
// their tagged tree; native downloads must publish together after packaging.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const workflow = parse(read(".github/workflows/app-release.yml"));
const cliWorkflow = parse(read(".github/workflows/release.yml"));
const desktop = JSON.parse(read("apps/desktop/package.json"));

test("release-45: tag-driven validation requires full checks for both channels", () => {
  for (const [channel, current] of [["app", workflow], ["cli", cliWorkflow]]) {
    assert.deepEqual(current.on.push, { tags: [`${channel}-v*`] });
    assert.equal(current.on.workflow_dispatch.inputs.tag.required, true);
    assert.deepEqual(current.permissions, {});
    assert.deepEqual(current.jobs.validate, {
      ...(channel === "app" ? { if: "github.event_name != 'workflow_dispatch' || !inputs.build-only" } : {}),
      needs: "prepare",
      uses: "./.github/workflows/ci.yml",
      permissions: { contents: "read" },
      with: { full: true, channel, "release-tag": "${{ inputs.tag || github.ref_name }}" },
    }, "a local reusable call validates the caller's exact commit with explicit full channel scope");
    assert.equal(current.jobs["require-ci-green"], undefined, "a prior CI run cannot substitute for full validation");
    const releaseNeeds = [current.jobs.release.needs].flat();
    assert.ok(releaseNeeds.includes("validate"), `${channel} publication directly requires full validation`);
    for (const [id, job] of Object.entries(current.jobs)) {
      if (channel === "app" && id === "validate") assert.equal(job.if, "github.event_name != 'workflow_dispatch' || !inputs.build-only");
      else assert.equal(job.if, undefined, `${channel}/${id} must skip when a required job fails, skips or is cancelled`);
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
  assert.equal(prepare.needs, undefined);
  const commands = prepare.steps.filter((s) => s.run && !s.if).map((s) => s.run);
  assert.equal(commands[0], "node scripts/release-version.mjs prepare --channel=app");
  assert.match(commands[1], /release-notes\.mjs notes/);
  assert.deepEqual(commands.slice(2, 3), ["node scripts/dependency-closure.mjs --registry-only"]);
  assert.equal(prepare.steps.find((s) => s.uses?.startsWith("actions/checkout@")).with["fetch-depth"], 0);
});

test("release-45: release preparation has no merge-parent or previous PR check dependency", () => {
  for (const current of [workflow, cliWorkflow]) {
    const text = JSON.stringify(current);
    assert.doesNotMatch(text, /HEAD\^2|accepted_head|check-runs|beta\.26|origin\/main/);
    assert.equal(current.jobs.prepare.permissions.contents, "read");
    const prepare = current.jobs.prepare.steps;
    assert(prepare.findIndex(s => s.run?.includes("release-version.mjs prepare")) < prepare.findIndex(s => s.run?.includes("release-notes.mjs notes")));
  }
});

test("release-45: CLI publication builds and inspects the package without repeating its validated lifecycle tests", () => {
  const release = cliWorkflow.jobs.release;
  assert.deepEqual(release.needs, ["prepare", "validate"]);
  assert.deepEqual(release.permissions, { contents: "write", "id-token": "write" });
  const commands = release.steps.filter((step) => step.run).map((step) => step.run);
  const install = commands.indexOf("npm ci");
  const build = commands.indexOf("npm run build -w packages/cli");
  const publish = commands.indexOf('npm publish "$TARBALL" --provenance --access public --ignore-scripts');
  assert.ok(install >= 0 && install < build && build < publish);
  assert.ok(publish >= 0, "publishing reuses full validation without rerunning prepublishOnly");
  assert.equal(commands.some((command) => /\bnpm (test|run build)$/.test(command)), false);
  assert.ok(commands.indexOf("node scripts/release-version.mjs prepare --channel=cli") < install);
  assert.ok(commands.slice(build + 1, publish).includes("npm pack -w packages/cli --ignore-scripts --json > packed.json"));
  assert.ok(commands.slice(build + 1, publish).includes("node scripts/release-artifacts.mjs npm --pack=packed.json"));
  assert.deepEqual(release.steps.find(s => s.name === "Publish to npm").env, { TARBALL: "${{ steps.packed.outputs.tarball }}" });
  assert.equal(release.steps.find(s => s.name === "Create GitHub release").with.body_path, "notes/release-notes.md");
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
  assert.deepEqual(job.steps.filter((s) => s.run && !s.if).map((s) => s.run), ["node scripts/release-version.mjs prepare --channel=app", "npm ci", "npm run build", "node scripts/release-artifacts.mjs app"]);
  const windowsBuild = job.steps.find(s => s.name === "Build native desktop package");
  assert.equal(windowsBuild.if, "runner.os != 'macOS'");
  assert.equal(windowsBuild.run, "npm run ${{ matrix.script }} -w apps/desktop");
  const macBuild = job.steps.find(s => s.name === "Build signed and notarized Mac package");
  assert.equal(macBuild.if, "runner.os == 'macOS'");
  assert.equal(macBuild.run, "npm run package:mac -w apps/desktop");
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
  assert.match(desktop.scripts["package:mac"], /node scripts\/package-macos\.mjs --publish never$/);
  assert.match(desktop.scripts["package:windows"], /stage:windows-runtime.*--win nsis --x64/);
  assert.deepEqual(desktop.build.mac.target, [{ target: "dmg", arch: ["arm64"] }]);
  assert.deepEqual(desktop.build.win.target, [{ target: "nsis", arch: ["x64"] }]);
  assert.equal(desktop.build.mac.artifactName, "Spex-${version}-mac-${arch}.${ext}");
  assert.equal(desktop.build.win.artifactName, "Spex-${version}-win-${arch}.${ext}");
  assert.equal(desktop.build.nsis.perMachine, false);
  assert.deepEqual(desktop.build.asarUnpack, ["node_modules/**/*"]);
});

test("app-shell-45: only the Mac path receives private credentials and requires signed verification", () => {
  const steps = workflow.jobs.package.steps;
  const prepare = steps.find(step => step.name === "Prepare private macOS signing inputs");
  const build = steps.find(step => step.name === "Build signed and notarized Mac package");
  const cleanup = steps.find(step => step.name === "Remove private macOS signing inputs");
  assert.equal(prepare.if, "runner.os == 'macOS'");
  assert.equal(prepare.shell, "python");
  assert.equal(Object.keys(prepare.env).length, 6);
  assert.match(prepare.run, /mode=0o700/);
  assert.match(prepare.run, /os\.chmod\(path, 0o600\)/);
  assert.match(prepare.run, /validate=True/);
  assert.equal(cleanup.if, "always() && runner.os == 'macOS'");
  assert(steps.indexOf(prepare) < steps.indexOf(build));
  assert(steps.indexOf(cleanup) > steps.indexOf(build));
  for (const step of steps) {
    if (Object.values(step.env ?? {}).some(value => String(value).includes("secrets."))) assert.equal(step.if, "runner.os == 'macOS'");
  }
  assert.equal(desktop.build.appId, "ai.sublang.spex");
  assert.equal(desktop.build.productName, "Spex");
  assert.equal(desktop.build.mac.identity, undefined);
  assert.equal(desktop.build.mac.forceCodeSigning, true);
  assert.equal(desktop.build.mac.hardenedRuntime, true);
  assert.equal(desktop.build.mac.notarize, false, "the recorded distribution pipeline owns notarization");
  assert.equal(desktop.build.dmg.sign, false, "fresh-keychain timestamped signing runs after DMG packaging");
  assert.equal(desktop.build.mac.entitlements, desktop.build.mac.entitlementsInherit);
  const receipt = steps.find(s => s.with?.name === "macos-signing-verification");
  assert.equal(receipt.if, "runner.os == 'macOS'");
  assert.equal(receipt.with["if-no-files-found"], "error");
  assert.match(receipt.with.path, /macos-signing\.json/);
  assert.doesNotMatch(receipt.with.path, /private|\.p12|\.p8|keychain/);
});

test("app-shell-46: the workflow's real Python preparation and cleanup keep decoded inputs private", { skip: process.platform === "win32" }, t => {
  const steps = workflow.jobs.package.steps;
  const prepare = steps.find(step => step.name === "Prepare private macOS signing inputs").run;
  const cleanup = steps.find(step => step.name === "Remove private macOS signing inputs").run;
  for (const mode of ["valid", "missing", "malformed"]) {
    const root = mkdtempSync(join(tmpdir(), "spex-mac-ci-inputs-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const env = { ...process.env, RUNNER_TEMP: root, GITHUB_ENV: join(root, "github-env"),
      MACOS_CERTIFICATE_P12_BASE64: Buffer.from("private p12 fixture").toString("base64"),
      MACOS_CERTIFICATE_PASSWORD: "private password fixture", APPLE_API_KEY_P8_BASE64: Buffer.from("private p8 fixture").toString("base64"),
      APPLE_API_KEY_ID: "KEYID", APPLE_API_ISSUER: "issuer", APPLE_TEAM_ID: "ABCDEFGHIJ" };
    if (mode === "missing") delete env.APPLE_TEAM_ID;
    if (mode === "malformed") env.APPLE_API_KEY_P8_BASE64 = "!invalid base64!";
    const result = spawnSync("python3", ["-c", prepare], { env, encoding: "utf8" });
    assert.equal(result.status === 0, mode === "valid", result.stderr);
    if (mode === "valid") {
      const directory = join(root, "spex-macos-secrets");
      assert.equal(statSync(directory).mode & 0o777, 0o700);
      for (const [file, bytes] of [["signing.p12", "private p12 fixture"], ["notary.p8", "private p8 fixture"]]) {
        assert.equal(readFileSync(join(directory, file), "utf8"), bytes);
        assert.equal(statSync(join(directory, file)).mode & 0o777, 0o600);
      }
      const variables = readFileSync(env.GITHUB_ENV, "utf8");
      assert.match(variables, /^CSC_LINK=.*signing\.p12$/m);
      assert.match(variables, /^APPLE_API_KEY=.*notary\.p8$/m);
      assert.doesNotMatch(variables, /private|fixture|password/);
    }
    assert.equal(spawnSync("python3", ["-c", cleanup], { env, encoding: "utf8" }).status, 0);
    assert.equal(existsSync(join(root, "spex-macos-secrets")), false);
  }
});

test("app-shell-44: both native packaging commands run the resume check after the build and before the packager", () => {
  assert.equal(desktop.scripts["check:claude-resume"], "node ../../packages/core/scripts/check-claude-resume.mjs");
  for (const name of ["package:mac", "package:windows"]) {
    const steps = desktop.scripts[name].split(" && ");
    assert.equal(steps[0], "npm run build", name);
    assert.equal(steps[1], "npm run check:claude-resume", name);
    assert.match(steps.at(-1), name === "package:mac" ? /^node scripts\/package-macos\.mjs / : /^electron-builder /, name);
  }
});

test("app-shell-44: the resume check passes only a resume of the same session on the changed default", async () => {
  const { freshVerdict, resumeVerdict } = await import(new URL("packages/core/scripts/check-claude-resume-verdict.mjs", root).href);
  const base = { explicit: "probe-explicit", changedDefault: "probe-default-b", freshToken: "session-1" };
  assert.equal(freshVerdict({ explicit: "probe-explicit", requests: ["probe-explicit"] }), undefined);
  assert.match(freshVerdict({ explicit: "probe-explicit", requests: [] }), /expected one request naming it/);
  assert.equal(resumeVerdict({ ...base, resumeToken: "session-1", requests: ["probe-default-b"] }), undefined);
  // A new session in place of the resume requests the default too, so the
  // request alone cannot tell it from a resume.
  assert.match(resumeVerdict({ ...base, resumeToken: "session-2", requests: ["probe-default-b"] }), /started a new session in place of the resume/);
  assert.match(resumeVerdict({ ...base, resumeToken: undefined, requests: ["probe-default-b"] }), /started a new session/);
  assert.match(resumeVerdict({ ...base, resumeToken: "session-1", requests: ["probe-explicit"] }), /restored the session's earlier model probe-explicit/);
  assert.match(resumeVerdict({ ...base, resumeToken: "session-1", requests: [] }), /expected one request naming the current default/);
  assert.match(resumeVerdict({ ...base, resumeToken: "session-1", requests: ["probe-default-b", "probe-default-b"] }), /expected one request/);
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


test("release-47: branch dispatch shares packaging but cannot publish or push a candidate tag", () => {
  for (const [channel, current] of [["app", workflow], ["cli", cliWorkflow]]) {
    assert.equal(current.env.RELEASE_TAG, "${{ inputs.tag || github.ref_name }}");
    const candidate = current.jobs.prepare.steps.find(s => s.name === "Create local candidate tag for branch validation");
    assert.equal(candidate.if, "github.event_name == 'workflow_dispatch'");
    assert.match(candidate.run, new RegExp(`check --tag=.*--channel=${channel}`));
    assert.match(candidate.run, /git -c tag\.gpgsign=false tag/);
    assert.doesNotMatch(candidate.run, /git push/);
    const effects = Object.values(current.jobs).flatMap(job => job.steps ?? []).filter(s => s.uses?.startsWith("softprops/action-gh-release@") || s.name === "Publish to npm");
    assert(effects.length > 0);
    for (const step of effects) assert.equal(step.if, `github.event_name == 'push' && startsWith(github.ref, 'refs/tags/${channel}-v')`);
    assert(current.jobs.release.steps.some(s => s.uses?.startsWith("actions/upload-artifact@")));
  }
});


test("release-47: targeted package diagnostics cannot satisfy the publication dependency", () => {
  assert.deepEqual(workflow.on.workflow_dispatch.inputs["build-only"], { description: "Diagnose native packages without full CI; cannot publish", type: "boolean", default: false });
  assert.equal(workflow.jobs.validate.if, "github.event_name != 'workflow_dispatch' || !inputs.build-only");
  assert(workflow.jobs.release.needs.includes("validate"));
  assert.equal(workflow.jobs.release.if, undefined, "default dependency success is required; a skipped validation cannot reach publication");
});

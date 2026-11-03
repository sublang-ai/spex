// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parseTag, prepareVersion, verifyVersion, requireUnpublished } from "./release-version.mjs";
import { verifyNpm, verifyApp } from "./release-artifacts.mjs";

const script = resolve(import.meta.dirname, "release-version.mjs");
const paths = ["apps/desktop", "apps/server", "packages/cli"];
const json = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
const load = file => JSON.parse(readFileSync(file, "utf8"));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "spex-tag-version-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packages = { "": { name: "fixture", version: "0.0.0" }, "node_modules/external": { version: "1.2.3", resolved: "https://registry.npmjs.org/external/-/external-1.2.3.tgz", integrity: "keep-exactly" } };
  for (const path of paths) {
    mkdirSync(join(root, path), { recursive: true });
    const value = { name: path === "packages/cli" ? "@sublang/spex" : path, version: "0.0.0-dev", dependencies: { external: "^1.2.3" } };
    json(join(root, path, "package.json"), value);
    packages[path] = { ...value };
  }
  json(join(root, "package-lock.json"), { lockfileVersion: 3, packages });
  return root;
}

test("release-46: tag-only preparation changes exactly the channel's version metadata and is idempotent", t => {
  for (const tag of ["cli-v5.0.1", "app-v1.2.3", "app-v1.2.3-beta.27"]) {
    const root = fixture(t);
    const before = load(join(root, "package-lock.json"));
    const release = parseTag(tag);
    prepareVersion(root, release);
    verifyVersion(root, release);
    const after = load(join(root, "package-lock.json"));
    for (const path of paths) {
      const selected = release.channel === "app" ? path !== "packages/cli" : path === "packages/cli";
      const expected = { ...before.packages[path], ...(selected ? { version: release.version } : {}) };
      assert.deepEqual(after.packages[path], expected);
      assert.deepEqual(load(join(root, path, "package.json")), expected);
    }
    assert.deepEqual(after.packages["node_modules/external"], before.packages["node_modules/external"]);
    const bytes = readFileSync(join(root, "package-lock.json"));
    prepareVersion(root, release);
    assert.deepEqual(readFileSync(join(root, "package-lock.json")), bytes);
    const cli = spawnSync(process.execPath, [script, "verify", `--root=${root}`], { env: { ...process.env, GITHUB_REF_NAME: tag }, encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
  }
});

test("release-46: malformed tags/channel mismatches fail before changing files", t => {
  const root = fixture(t);
  const before = readFileSync(join(root, "package-lock.json"));
  for (const tag of ["app-v01.2.3", "app-v1.2", "app-v1.2.3-beta.0", "app-v1.2.3-beta.01", "app-v1.2.3-rc.1", "cli-v1.2.3-beta.1", "app-v1.2.3+meta", "app-v1.2.3\nBAD=1", "app-v1.2.3\n", "../v1.2.3"]) {
    assert.throws(() => parseTag(tag), /Invalid release tag/);
    assert.notEqual(spawnSync(process.execPath, [script, "prepare", `--root=${root}`, `--tag=${tag}`]).status, 0);
  }
  assert.notEqual(spawnSync(process.execPath, [script, "prepare", `--root=${root}`, "--tag=app-v1.2.3", "--channel=cli"]).status, 0);
  assert.deepEqual(readFileSync(join(root, "package-lock.json")), before);
  const lock = load(join(root, "package-lock.json"));
  delete lock.packages["apps/server"];
  json(join(root, "package-lock.json"), lock);
  assert.throws(() => prepareVersion(root, parseTag("app-v1.2.3")), /Missing locked workspace/);
  assert.equal(load(join(root, "apps/desktop/package.json")).version, "0.0.0-dev");
});

test("release-46: real HTTP registry preflight refuses existing versions and network failures", async t => {
  const server = createServer((req, res) => {
    res.statusCode = req.url.endsWith("/1.2.3") ? 200 : req.url.endsWith("/1.2.4") ? 404 : 503;
    res.end("{}");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const options = { releases: [], registry: `http://127.0.0.1:${server.address().port}` };
  await assert.rejects(requireUnpublished(parseTag("cli-v1.2.3"), options), /npm version already exists/);
  await requireUnpublished(parseTag("cli-v1.2.4"), options);
  await assert.rejects(requireUnpublished(parseTag("cli-v1.2.5"), options), /503/);
  await assert.rejects(requireUnpublished(parseTag("app-v1.2.3"), { releases: [{ tag_name: "app-v1.2.3", draft: true }] }), /Release already exists/);
});

test("release-46: inspect a real npm tarball rather than trusting the source manifest", { skip: process.platform === "win32" }, t => {
  const root = fixture(t);
  const release = parseTag("cli-v1.2.3");
  prepareVersion(root, release);
  const pkg = join(root, "packed/package");
  mkdirSync(join(pkg, "dist"), { recursive: true });
  json(join(pkg, "package.json"), { name: "@sublang/spex", version: release.version, bin: { spex: "dist/cli.js" } });
  writeFileSync(join(pkg, "dist/cli.js"), "console.log('fixture');\n");
  const file = `sublang-spex-${release.version}.tgz`;
  const pack = () => assert.equal(spawnSync("tar", ["-czf", join(root, file), "-C", join(root, "packed"), "package"]).status, 0);
  pack();
  assert.equal(verifyNpm(root, release, [{ filename: file }]), file);
  json(join(pkg, "package.json"), { name: "@sublang/spex", version: "9.9.9", bin: { spex: "dist/cli.js" } });
  pack();
  assert.throws(() => verifyNpm(root, release, [{ filename: file }]), /packed version/);
  json(join(pkg, "package.json"), { name: "@sublang/spex", version: release.version, bin: { spex: "dist/cli.js" } });
  writeFileSync(join(pkg, "dist/leak.test.js"), "test");
  pack();
  assert.throws(() => verifyNpm(root, release, [{ filename: file }]), /contains tests/);
});

test("release-46: app receipts and native product metadata must match the tag on both platform paths", t => {
  for (const platform of ["darwin", "win32"]) {
    const output = fixture(t);
    const release = parseTag("app-v1.2.3-beta.2");
    const mac = platform === "darwin";
    const name = `Spex-${release.version}-${mac ? "mac-arm64.dmg" : "win-x64.exe"}`;
    const file = join(output, name);
    writeFileSync(file, "native installer fixture");
    const compiler = `compiler-check-${platform}-${mac ? "arm64" : "x64"}.json`;
    json(join(output, compiler), { status: "passed", appVersion: release.version });
    json(join(output, "macos-signing.json"), { status: "passed", version: release.version, appNotarization: { status: "Accepted" }, dmgNotarization: { status: "Accepted" }, dmg: { file: name, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") } });
    const options = { output, platform, inspect: () => release.version };
    assert.equal(verifyApp(output, release, options), file);
    assert.throws(() => verifyApp(output, release, { ...options, inspect: () => "1.2.3" }), /native product version/);
    json(join(output, compiler), { status: "passed", appVersion: "1.2.3" });
    assert.throws(() => verifyApp(output, release, options), /packaged app manifest/);
  }
});

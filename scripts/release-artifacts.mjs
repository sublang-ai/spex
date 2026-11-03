// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTag } from "./release-version.mjs";

export function verifyNpm(root, release, packed) {
  assert.equal(release.channel, "cli");
  assert.equal(packed.length, 1, "expected exactly one npm tarball");
  const entry = packed[0];
  assert.equal(entry.filename, `sublang-spex-${release.version}.tgz`);
  const file = join(root, entry.filename);
  const names = execFileSync("tar", ["-tzf", file], { encoding: "utf8" }).split("\n");
  assert(!names.some(name => /\.test\.(js|d\.ts)$/.test(name)), "tarball contains tests");
  const manifest = JSON.parse(execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf8" }));
  assert.equal(manifest.name, "@sublang/spex");
  assert.equal(manifest.version, release.version, "packed version differs from tag");
  assert.equal(manifest.bin.spex, "dist/cli.js");
  assert(names.includes("package/dist/cli.js"));
  return entry.filename;
}
export function verifyApp(root, release, { output = join(root, "apps/desktop/release"), platform = process.platform, inspect } = {}) {
  assert.equal(release.channel, "app");
  const mac = platform === "darwin";
  assert(mac || platform === "win32", "installer verification needs its native platform");
  const file = join(output, `Spex-${release.version}-${mac ? "mac-arm64.dmg" : "win-x64.exe"}`);
  assert(statSync(file).size > 0, "installer is empty");
  const actual = inspect ? inspect(file) : mac
    ? execFileSync("/usr/bin/plutil", ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", join(output, "mac-arm64/Spex.app/Contents/Info.plist")], { encoding: "utf8" }).trim()
    : execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "(Get-Item -LiteralPath $env.SPEX_RELEASE_INSTALLER).VersionInfo.ProductVersion"], { encoding: "utf8", env: { ...process.env, SPEX_RELEASE_INSTALLER: file } }).trim();
  assert.equal(actual, release.version, "native product version differs from tag");
  const compiler = JSON.parse(readFileSync(join(output, `compiler-check-${platform}-${mac ? "arm64" : "x64"}.json`), "utf8"));
  assert.equal(compiler.status, "passed");
  assert.equal(compiler.appVersion, release.version, "packaged app manifest differs from tag");
  if (mac) {
    const signing = JSON.parse(readFileSync(join(output, "macos-signing.json"), "utf8"));
    assert.equal(signing.status, "passed");
    assert.equal(signing.version, release.version);
    assert.equal(signing.appNotarization.status, "Accepted");
    assert.equal(signing.dmgNotarization.status, "Accepted");
    assert.equal(signing.dmg.file, basename(file));
    assert.equal(signing.dmg.sha256, createHash("sha256").update(readFileSync(file)).digest("hex"));
  }
  return file;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const options = Object.fromEntries(args.map(arg => { const match = /^--([a-z]+)=(.*)$/.exec(arg); if (!match) throw new Error(`Unknown argument: ${arg}`); return [match[1], match[2]]; }));
    const root = resolve(options.root ?? ".");
    const release = parseTag(options.tag ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME ?? "");
    if (command === "npm") {
      const tarball = verifyNpm(root, release, JSON.parse(readFileSync(options.pack, "utf8")));
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tarball=${tarball}\n`);
      console.log(tarball);
    } else if (command === "app") console.log(verifyApp(root, release));
    else throw new Error("Use npm or app");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

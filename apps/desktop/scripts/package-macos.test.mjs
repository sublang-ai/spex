// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Exercise the complete orchestration over recorded system-tool responses.
// Real Developer ID/Apple acceptance is separate from this hermetic test.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { packageMac } from "./package-macos.mjs";

async function fixture(t, failure) {
  const root = await mkdtemp(join(tmpdir(), "spex-mac-release-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const p12 = join(root, "signing.p12");
  const p8 = join(root, "notary.p8");
  await writeFile(p12, "fixture only");
  await writeFile(p8, "fixture only");
  const env = { CSC_LINK: p12, CSC_KEY_PASSWORD: "private-password", APPLE_API_KEY: p8,
    APPLE_API_KEY_ID: "private-key-id", APPLE_API_ISSUER: "private-issuer", APPLE_TEAM_ID: "ABCDEFGHIJ" };
  const calls = [];
  const identity = "Developer ID Application: Example Publisher (ABCDEFGHIJ)";
  let compilerChecks = 0;
  let submissions = 0;
  const run = async (command, args, options) => {
    calls.push({ command: basename(command), args, options });
    const name = basename(command);
    if (failure === "import" && name === "security" && args[0] === "import") {
      throw Object.assign(new Error("must never print full command private-password"), { code: 1, stderr: "bad private-password" });
    }
    if (name === "security" && args[0] === "list-keychains" && !args.includes("-s")) return { stdout: '    "/Users/example/Library/Keychains/login.keychain-db"\n', stderr: "" };
    if (name === "security" && args[0] === "find-identity") return { stdout: `1) ${"A".repeat(40)} "${failure === "team" ? identity.replace("ABCDEFGHIJ", "WRONGTEAMX") : identity}"\n 1 valid identities found`, stderr: "" };
    if (failure === "dmg-sign" && name === "codesign" && args.includes("--force")) throw Object.assign(new Error("sign failed"), { code: 1 });
    if (failure === "inner-validation" && name === "codesign" && args.at(-1).replaceAll("\\", "/").includes("/mounted/")) throw Object.assign(new Error("invalid App"), { code: 1 });
    if (name === "codesign" && args[0] === "-dv") return { stdout: "", stderr: `Authority=${identity}\nTeamIdentifier=ABCDEFGHIJ\nTimestamp=Nov 3, 2026\nflags=0x10000(runtime)\n` };
    if (args[0]?.replaceAll("\\", "/").endsWith("electron-builder/out/cli/cli.js")) {
      assert.equal(options.env.CSC_LINK, undefined);
      assert.equal(options.env.CSC_KEY_PASSWORD, undefined);
      assert.equal(options.env.APPLE_API_KEY, undefined);
      assert.equal(args[args.indexOf("--publish") + 1], "never");
      if (args.includes("dmg")) {
        const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
        await writeFile(join(root, `Spex-${manifest.version}-mac-arm64.dmg`), "packaged fixture");
        await writeFile(join(root, `Spex-${manifest.version}-mac-arm64.dmg.blockmap`), "pre-signing blockmap");
        await writeFile(join(root, "latest-mac.yml"), "pre-signing updater checksum");
      }
      if (failure === "builder") throw Object.assign(new Error("do not relay"), { code: 1 });
    }
    if (name === "xcrun" && args[0] === "notarytool") {
      if (args[1] === "submit") { submissions++; return { stdout: JSON.stringify({ id: "submission-" + calls.length }), stderr: "" }; }
      if (failure === "timeout" || (failure === "dmg-timeout" && submissions === 2)) throw Object.assign(new Error("timed out"), { code: 1 });
      return { stdout: JSON.stringify({ status: failure === "invalid" || (failure === "dmg-invalid" && submissions === 2) ? "Invalid" : "Accepted" }), stderr: "" };
    }
    if (failure === "gatekeeper" && name === "spctl") throw Object.assign(new Error("denied"), { code: 3 });
    if (name === "xcrun" && args[0] === "stapler") assert(!args[2].endsWith(".zip"), "staple the App, never its upload ZIP");
    return { stdout: "", stderr: "" };
  };
  return { root, env, calls, run, verifyCompiler: async () => { compilerChecks++; }, checks: () => compilerChecks };
}

test("app-shell-45: the entire Mac distribution chain signs with separate keychains and requires Accepted before packaging", async t => {
  const f = await fixture(t);
  const report = await packageMac({ ...f, outputDir: f.root });
  assert.equal(report.status, "passed");
  assert.equal(report.bundleId, "ai.sublang.spex");
  assert.equal(report.product, "Spex");
  assert.equal(report.identity, "Developer ID Application: Example Publisher (ABCDEFGHIJ)");
  assert.equal(f.checks(), 1, "strict packaged compiler runs after signing");
  const indexes = predicate => f.calls.flatMap((call, index) => predicate(call) ? [index] : []);
  const created = indexes(c => c.command === "security" && c.args[0] === "create-keychain");
  const deleted = indexes(c => c.command === "security" && c.args[0] === "delete-keychain");
  assert.equal(created.length, 2);
  assert.equal(deleted.length, 2);
  assert.notEqual(f.calls[created[0]].args.at(-1), f.calls[created[1]].args.at(-1));
  const dmgBuild = indexes(c => c.args.includes("--prepackaged"))[0];
  const appStaple = indexes(c => c.command === "xcrun" && c.args[0] === "stapler" && c.args[1] === "staple" && c.args[2].endsWith("Spex.app"))[0];
  assert(appStaple < dmgBuild && dmgBuild < created[1], "stapled App -> DMG -> fresh signing keychain");
  const dmgSign = f.calls.find(c => c.command === "codesign" && c.args.includes("--force"));
  assert(dmgSign.args.includes("--timestamp"));
  assert(dmgSign.args.includes("--keychain"));
  assert.equal(f.calls.some(c => c.command === "security" && c.args[0] === "default-keychain"), false);
  const restore = f.calls.filter(c => c.command === "security" && c.args.includes("-s") && c.args[0] === "list-keychains").filter(c => c.args.length === 5);
  assert.equal(restore.length, 2);
  assert.equal(f.calls.filter(c => c.command === "spctl").length, 3, "App, DMG and contained App assessed");
  assert.equal(JSON.parse(await readFile(join(f.root, "macos-signing.json"), "utf8")).status, "passed");
  await assert.rejects(readFile(join(f.root, "latest-mac.yml")), { code: "ENOENT" });
  await assert.rejects(readFile(join(f.root, report.dmg.file + ".blockmap")), { code: "ENOENT" });
});

test("app-shell-45: missing credentials fail before spawning tools", async t => {
  const f = await fixture(t);
  delete f.env.APPLE_API_KEY_ID;
  await assert.rejects(packageMac({ ...f, outputDir: f.root }), /Missing signing credential: APPLE_API_KEY_ID/);
  assert.equal(f.calls.length, 0);
});

for (const failure of ["import", "team", "builder", "invalid", "timeout", "gatekeeper"]) {
  test(`app-shell-45: ${failure} refuses the download and cleans its signing keychain`, async t => {
    const f = await fixture(t, failure);
    const error = await packageMac({ ...f, outputDir: f.root }).then(() => assert.fail("must refuse"), error => error);
    assert(!error.message.includes("private-password"), "credential is redacted even when security errors include it");
    await assert.rejects(readFile(join(f.root, "macos-signing.json")), { code: "ENOENT" });
    assert(f.calls.some(c => c.command === "security" && c.args[0] === "delete-keychain"));
    assert(f.calls.some(c => c.command === "security" && c.args[0] === "list-keychains" && c.args.length === 5 && c.args.includes("-s")));
    assert(!f.calls.some(c => c.args.includes("--prepackaged")), "failure before App acceptance cannot package a DMG");
  });
}

for (const failure of ["dmg-sign", "dmg-invalid", "dmg-timeout", "inner-validation"]) {
  test(`app-shell-46: ${failure} cannot mark a partial DMG as verified`, async t => {
    const f = await fixture(t, failure);
    await assert.rejects(packageMac({ ...f, outputDir: f.root }));
    await assert.rejects(readFile(join(f.root, "macos-signing.json")), { code: "ENOENT" });
    assert(f.calls.some(c => c.args.includes("--prepackaged")));
    assert.equal(f.calls.filter(c => c.command === "security" && c.args[0] === "delete-keychain").length, 2);
    if (failure === "inner-validation") assert(f.calls.some(c => c.command === "hdiutil" && c.args[0] === "detach"));
  });
}

test("app-shell-46: failed service stdout is diagnostic and credentials remain redacted", async t => {
  const f = await fixture(t);
  const recorded = f.run;
  const run = async (command, args, options) => {
    if (basename(command) === "xcrun" && args[0] === "notarytool") throw Object.assign(new Error("private-password"), { code: 68, stdout: "service upload failed private-key-id private-issuer", stderr: "" });
    return recorded(command, args, options);
  };
  await assert.rejects(packageMac({ ...f, run, outputDir: f.root }), error => {
    assert.match(error.message, /service upload failed/);
    assert.doesNotMatch(error.message, /private-key-id|private-issuer|private-password/);
    return true;
  });
});

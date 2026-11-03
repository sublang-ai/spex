// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The distribution path: signed App -> accepted/stapled App -> DMG ->
// fresh-keychain DMG signature -> accepted/stapled DMG. Never publish here.
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installed = createRequire(import.meta.url);
const execute = promisify(execFile);
const required = ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER", "APPLE_TEAM_ID"];
// Public Apple CA certificates, not signing credentials. Origins: macos-signing.md.
const chain = {
  "DeveloperIDG2CA.cer": "f16cd3c54c7f83cea4bf1a3e6a0819c8aaa8e4a1528fd144715f350643d2df3a",
  "AppleRootCA.cer": "b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024",
};

export async function packageMac({ env = process.env, outputDir = join(appDir, "release"), electronDist,
  run = execute, verifyCompiler, signal } = {}) {
  if (process.platform !== "darwin" && run === execute) throw new Error("Signed Mac packaging requires macOS");
  for (const key of required) if (!env[key]?.trim()) throw new Error(`Missing signing credential: ${key}`);
  if (!/^[A-Z0-9]{10}$/.test(env.APPLE_TEAM_ID)) throw new Error("Invalid APPLE_TEAM_ID");
  // CI decodes P12 and P8 to private files. Local callers provide the same paths.
  await readFile(env.CSC_LINK);
  await readFile(env.APPLE_API_KEY);
  for (const [file, hash] of Object.entries(chain)) {
    const bytes = await readFile(join(appDir, "build", "apple", file));
    if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error(`Apple CA checksum mismatch: ${file}`);
  }
  outputDir = resolve(outputDir);
  await mkdir(outputDir, { recursive: true });
  const reportPath = join(outputDir, "macos-signing.json");
  await rm(reportPath, { force: true });
  const scratch = await mkdtemp(join(tmpdir(), "spex-macos-signing-"));
  const secrets = [env.CSC_KEY_PASSWORD, env.APPLE_API_KEY_ID, env.APPLE_API_ISSUER];
  const redact = text => secrets.reduce((s, secret) => s.split(secret).join("[redacted]"), text);
  const baseEnv = { ...env };
  // Builder must use our temporary keychain, not import a second one or
  // notarize implicitly; notarization has its own recorded, fail-closed stage.
  for (const key of [...required, "CSC_KEYCHAIN", "CSC_NAME", "DEBUG"]) delete baseEnv[key];
  async function tool(command, args, { childEnv = baseEnv, timeout = 180_000, cleanup = false } = {}) {
    try {
      return await run(command, args, { cwd: appDir, env: childEnv, timeout, maxBuffer: 16 * 1024 * 1024,
        ...(cleanup ? {} : { signal }) });
    } catch (error) {
      // execFile errors contain the entire command line, including P12 or
      // keychain passwords for security(1). Never relay that error object.
      throw new Error(`${basename(command)} failed (${error.code ?? error.signal ?? "unknown"}): ${redact(String(error.stderr ?? "") + String(error.stdout ?? ""))}`);
    }
  }
  const builder = installed.resolve("electron-builder/out/cli/cli.js");
  const builderArgs = ["--arm64", "--publish", "never", `--config.directories.output=${outputDir}`];
  if (electronDist) builderArgs.push(`--config.electronDist=${resolve(electronDist)}`);
  const manifest = JSON.parse(await readFile(join(appDir, "package.json"), "utf8"));
  const product = manifest.build.productName;
  const app = join(outputDir, "mac-arm64", `${product}.app`);
  const dmg = join(outputDir, `${product}-${manifest.version}-mac-arm64.dmg`);
  const report = { product, bundleId: manifest.build.appId, version: manifest.version, teamId: env.APPLE_TEAM_ID };

  async function withKeychain(stage, action) {
    const before = (await tool("/usr/bin/security", ["list-keychains", "-d", "user"])).stdout;
    const paths = [...before.matchAll(/"(?:[^"\\]|\\.)*"/g)].map(match => JSON.parse(match[0]));
    const keychain = join(scratch, `${stage}.keychain-db`);
    const password = randomBytes(32).toString("hex");
    secrets.push(password);
    let created = false;
    try {
      await tool("/usr/bin/security", ["create-keychain", "-p", password, keychain]);
      created = true;
      await tool("/usr/bin/security", ["unlock-keychain", "-p", password, keychain]);
      await tool("/usr/bin/security", ["set-keychain-settings", "-lut", "3600", keychain]);
      await tool("/usr/bin/security", ["import", env.CSC_LINK, "-k", keychain, "-P", env.CSC_KEY_PASSWORD,
        "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"]);
      for (const file of Object.keys(chain)) await tool("/usr/bin/security", ["import", join(appDir, "build", "apple", file), "-k", keychain, "-t", "cert"]);
      await tool("/usr/bin/security", ["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password, keychain]);
      await tool("/usr/bin/security", ["list-keychains", "-d", "user", "-s", ...paths, keychain]);
      const identities = (await tool("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning", keychain])).stdout;
      const matches = [...identities.matchAll(/[A-Fa-f0-9]{40} "(Developer ID Application: [^"]+)"/g)]
        .map(match => match[1]).filter(name => name.endsWith(`(${env.APPLE_TEAM_ID})`));
      if (matches.length !== 1) throw new Error("Expected exactly one valid Developer ID Application identity for APPLE_TEAM_ID");
      report.identity = matches[0];
      await action({ ...baseEnv, CSC_KEYCHAIN: keychain, CSC_IDENTITY_AUTO_DISCOVERY: "true" }, matches[0], keychain);
    } finally {
      // Restore the original list even when import, signing or the child fails.
      // Never change the default keychain or install a trust override.
      try { await tool("/usr/bin/security", ["list-keychains", "-d", "user", "-s", ...paths], { cleanup: true }); }
      finally { if (created) await tool("/usr/bin/security", ["delete-keychain", keychain], { cleanup: true }); }
    }
  }

  async function verifySignature(target, kind) {
    await tool("/usr/bin/codesign", ["--verify", ...(kind === "app" ? ["--deep", "--strict"] : []), "--verbose=2", target]);
    const details = await tool("/usr/bin/codesign", ["-dv", "--verbose=4", target]);
    const text = details.stdout + details.stderr;
    if (!text.includes(`TeamIdentifier=${env.APPLE_TEAM_ID}`) || !text.includes("Authority=Developer ID Application:") || !/^Timestamp=/m.test(text)) {
      throw new Error(`${kind}: expected Developer ID team and secure timestamp`);
    }
    if (kind === "app" && !/flags=.*\bruntime\b/.test(text)) throw new Error("App is missing hardened runtime");
  }
  async function notarize(target, kind, stapleTarget = target) {
    const auth = ["--key", env.APPLE_API_KEY, "--key-id", env.APPLE_API_KEY_ID, "--issuer", env.APPLE_API_ISSUER,
      "--output-format", "json", "--no-progress"];
    console.log(`macOS signing: notarizing ${kind}`);
    const submitted = JSON.parse((await tool("/usr/bin/xcrun", ["notarytool", "submit", target, ...auth], { timeout: 600_000 })).stdout);
    if (!submitted.id) throw new Error(`${kind}: Apple returned no submission ID`);
    const receipt = join(outputDir, `macos-${kind}-notarization.json`);
    await writeFile(receipt, JSON.stringify(submitted, null, 2) + "\n");
    const result = JSON.parse((await tool("/usr/bin/xcrun", ["notarytool", "wait", submitted.id, "--timeout", "20m", ...auth], { timeout: 1_260_000 })).stdout);
    await writeFile(receipt, JSON.stringify(result, null, 2) + "\n");
    if (result.status !== "Accepted") throw new Error(`${kind}: notarization was ${result.status ?? "unknown"}, expected Accepted`);
    await tool("/usr/bin/xcrun", ["stapler", "staple", stapleTarget]);
    await tool("/usr/bin/xcrun", ["stapler", "validate", stapleTarget]);
    report[`${kind}Notarization`] = { id: submitted.id, status: result.status };
  }

  try {
    console.log("macOS signing: building Developer ID App");
    await withKeychain("app", async (childEnv, identity) => {
      const built = await tool(process.execPath, [builder, "--mac", "dir", ...builderArgs,
        `--config.mac.identity=${identity.replace(/^Developer ID Application: /, "")}`], { childEnv, timeout: 900_000 });
      console.log(redact(built.stdout));
    });
    await verifySignature(app, "app");
    // Signing must preserve Electron-as-Node, native bundling and strict SLC.
    const check = verifyCompiler ?? installed("./verify-packaged-compiler.cjs");
    await check({ appOutDir: dirname(app), electronPlatformName: "darwin", packager: { appInfo: { productFilename: product }, executableName: product } });
    const zip = join(scratch, `${product}-notary.zip`);
    await tool("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip], { timeout: 600_000 });
    await notarize(zip, "app", app);
    await tool("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", app]);
    const packed = await tool(process.execPath, [builder, "--prepackaged", app, "--mac", "dmg", ...builderArgs, "--config.dmg.sign=false"], { timeout: 900_000 });
    console.log(redact(packed.stdout));
    // Signing/stapling changes the DMG after builder hashes it. This
    // release channel publishes the final DMG and SHA256SUMS, not updater
    // manifests or blockmaps describing the pre-signing bytes.
    await rm(`${dmg}.blockmap`, { force: true });
    await rm(join(outputDir, "latest-mac.yml"), { force: true });
    await withKeychain("dmg", async (childEnv, identity, keychain) => {
      await tool("/usr/bin/codesign", ["--force", "--sign", identity, "--keychain", keychain, "--timestamp", dmg], { childEnv });
    });
    await verifySignature(dmg, "dmg");
    await notarize(dmg, "dmg");
    await tool("/usr/sbin/spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmg]);
    const mount = join(scratch, "mounted");
    await mkdir(mount);
    try {
      await tool("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, dmg]);
      const inner = join(mount, `${product}.app`);
      await verifySignature(inner, "app");
      await tool("/usr/bin/xcrun", ["stapler", "validate", inner]);
      await tool("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=4", inner]);
    } finally {
      await tool("/usr/bin/hdiutil", ["detach", mount], { cleanup: true });
    }
    report.dmg = { file: basename(dmg), sha256: createHash("sha256").update(await readFile(dmg)).digest("hex") };
    report.status = "passed";
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`macOS signing: verified App and DMG (${reportPath})`);
    return report;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const args = process.argv.slice(2);
    if (args.includes("--publish") && args[args.indexOf("--publish") + 1] !== "never") throw new Error("This command never publishes");
    await packageMac({ signal: controller.signal, outputDir: process.env.SPEX_MAC_OUTPUT_DIR || undefined, electronDist: process.env.SPEX_ELECTRON_DIST || undefined });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}

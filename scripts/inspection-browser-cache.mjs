// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Acceptance-only cache reuse. Never install into or change the source cache.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, cp, lstat, mkdir, readdir, readlink, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const describe = String.raw`
const { createRequire } = require("node:module");
const cligentRequire = createRequire(process.argv[1]);
const mcpManifest = cligentRequire.resolve("@playwright/mcp/package.json");
const runtimeRequire = createRequire(mcpManifest);
const { registry: native } = runtimeRequire("playwright-core/lib/coreBundle");
const entries = native.registry.resolveBrowsers(["chromium"], {});
const chromium = entries.find((entry) => entry.name === "chromium");
if (runtimeRequire("playwright").chromium.executablePath() !== chromium?.executablePath())
  throw new Error("Managed Playwright and its installer disagree about Chromium");
console.log(JSON.stringify({
  mcpVersion: runtimeRequire(mcpManifest).version,
  playwrightVersion: runtimeRequire("playwright/package.json").version,
  playwrightCoreVersion: runtimeRequire("playwright-core/package.json").version,
  revisions: entries.map((entry) => ({ name: entry.name, revision: entry.revision,
    browserVersion: entry.browserVersion, directory: entry.directory,
    executable: entry.executablePath(), marker: native.browserDirectoryToMarkerFilePath(entry.directory) }))
}));
`;

// A child gives the installed native registry its own cache path before import.
// The registry resolves platform overrides; no browser or installer is started.
export function describeInspectionBrowserCache(source) {
  const result = spawnSync(process.execPath, ["-e", describe, fileURLToPath(import.meta.resolve("@sublang/cligent"))], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve(source) },
    encoding: "utf8", timeout: 10_000,
  });
  assert.equal(result.status, 0, `Cannot inspect managed browser revisions: ${result.error?.message ?? result.stderr}`);
  const resultValue = JSON.parse(result.stdout);
  assert.ok(resultValue.revisions.length >= 3, "Managed Chromium installation must describe its dependencies");
  return resultValue;
}

function inside(root, path) {
  const part = relative(root, path);
  return part !== "" && part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function inventory(root) {
  const rows = [];
  const visit = async (path) => {
    const info = await lstat(path);
    const name = relative(root, path).split(sep).join("/");
    if (name === "DEPENDENCIES_VALIDATED") return;
    if (info.isSymbolicLink()) {
      const target = await readlink(path);
      assert.ok(!isAbsolute(target) && inside(root, await realpath(path)), `Cache link escapes its revision: ${path}`);
      rows.push([name, "link", target]);
    } else if (info.isDirectory()) {
      rows.push([name, "directory", info.mode & 0o777]);
      for (const child of (await readdir(path)).sort()) await visit(join(path, child));
    } else {
      assert.ok(info.isFile(), `Unsupported browser cache entry: ${path}`);
      rows.push([name, "file", info.mode & 0o777, info.size, await hashFile(path)]);
    }
  };
  assert.ok(!(await lstat(root)).isSymbolicLink(), `Browser revision must not be a symlink: ${root}`);
  await visit(root);
  return { sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"), entries: rows.length };
}

export async function prepareInspectionBrowserCache(source, destination) {
  const requestedTarget = resolve(destination);
  const target = join(await realpath(dirname(requestedTarget)), basename(requestedTarget));
  if (source === undefined) {
    await mkdir(target, { mode: 0o700 });
    return { freshBrowserCache: true, directory: target };
  }
  assert.ok(typeof source === "string" && source.trim() && isAbsolute(source), "Browser cache source must be an explicit absolute path");
  const origin = await realpath(source);
  assert.ok((await lstat(origin)).isDirectory(), "Browser cache source must be a directory");
  assert.ok(origin !== target && !inside(origin, target) && !inside(target, origin), "Source and owned browser caches must be separate");
  const description = describeInspectionBrowserCache(origin);
  const revisions = [];
  // Validate all matching installations before publishing any owned copy.
  for (const entry of description.revisions) {
    assert.equal(dirname(entry.directory), origin, "Native revision must be directly inside the selected cache");
    assert.ok(inside(entry.directory, entry.executable) && inside(entry.directory, entry.marker), "Native paths must stay inside their revision");
    assert.ok((await lstat(entry.directory)).isDirectory(), `Missing installed revision: ${entry.name}`);
    assert.ok((await lstat(entry.marker)).isFile(), `Incomplete installed revision: ${entry.name}`);
    assert.ok(inside(entry.directory, await realpath(entry.executable)), "Native executable escapes its revision");
    await access(entry.executable, constants.X_OK);
    revisions.push({ ...entry, sourceTree: await inventory(entry.directory), sourceBinarySha256: await hashFile(entry.executable) });
  }
  await mkdir(target, { mode: 0o700 });
  for (const entry of revisions) {
    const copiedDirectory = join(target, basename(entry.directory));
    await cp(entry.directory, copiedDirectory, { recursive: true, force: false, errorOnExist: true,
      verbatimSymlinks: true, filter: (path) => path !== join(entry.directory, "DEPENDENCIES_VALIDATED") });
    const copiedTree = await inventory(copiedDirectory);
    assert.deepEqual(copiedTree, entry.sourceTree, `Copied browser revision changed: ${entry.name}`);
    const copiedExecutable = join(copiedDirectory, relative(entry.directory, entry.executable));
    const copiedBinarySha256 = await hashFile(copiedExecutable);
    assert.equal(copiedBinarySha256, entry.sourceBinarySha256);
    entry.copiedDirectory = copiedDirectory;
    entry.copiedExecutable = copiedExecutable;
    entry.copiedTree = copiedTree;
    entry.copiedBinarySha256 = copiedBinarySha256;
  }
  return { freshBrowserCache: false, source: origin, directory: target, ...description, revisions };
}

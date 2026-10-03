// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { describeInspectionBrowserCache, prepareInspectionBrowserCache } from "./inspection-browser-cache.mjs";

async function fixture(t) {
  const scratch = await realpath(await mkdtemp(join(tmpdir(), "spex cache test ")));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const source = join(scratch, "existing cache");
  const target = join(scratch, "owned cache");
  await mkdir(source);
  // Real installed native registry, small file fixtures only: no launch/download.
  const description = describeInspectionBrowserCache(source);
  for (const entry of description.revisions) {
    await mkdir(dirname(entry.executable), { recursive: true });
    await writeFile(entry.executable, `fixture executable: ${entry.name}\n`, { mode: 0o755 });
    await chmod(entry.executable, 0o755);
    await writeFile(entry.marker, "");
    await writeFile(join(entry.directory, "DEPENDENCIES_VALIDATED"), "previous host");
  }
  await mkdir(join(source, ".links"));
  await writeFile(join(source, ".links", "other project"), "do not copy or edit");
  await mkdir(join(source, "__dirlock"));
  await mkdir(join(source, "unrelated-revision"));
  return { scratch, source, target, description };
}

test("default inspection cache is empty and never reuses an inherited cache", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "spex fresh cache test "));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const target = join(scratch, "owned");
  assert.deepEqual(await prepareInspectionBrowserCache(undefined, target), { freshBrowserCache: true, directory: join(await realpath(scratch), "owned") });
  assert.deepEqual(await readdir(target), []);
});

test("installed registry selects only its matching revisions and copies independent bytes, modes and internal links", async (t) => {
  const { source, target, description } = await fixture(t);
  const chromium = description.revisions.find((entry) => entry.name === "chromium");
  assert.ok(chromium);
  assert.ok(description.revisions.some((entry) => entry.name === "chromium-headless-shell"));
  assert.ok(description.revisions.some((entry) => entry.name === "ffmpeg"));
  const framework = join(chromium.directory, "fixture framework");
  await mkdir(join(framework, "Versions", "A"), { recursive: true });
  await writeFile(join(framework, "Versions", "A", "library"), "framework bytes", { mode: 0o755 });
  await symlink("A", join(framework, "Versions", "Current"));
  const receipt = await prepareInspectionBrowserCache(source, target);
  assert.equal(receipt.freshBrowserCache, false);
  assert.equal(receipt.source, await realpath(source));
  assert.match(receipt.mcpVersion, /^\d+\./);
  assert.equal(receipt.playwrightVersion, receipt.playwrightCoreVersion);
  assert.deepEqual((await readdir(target)).sort(), description.revisions.map((entry) => entry.directory.split(/[\\/]/).at(-1)).sort());
  for (const entry of receipt.revisions) {
    assert.equal(entry.sourceBinarySha256, entry.copiedBinarySha256);
    assert.deepEqual(entry.sourceTree, entry.copiedTree);
    assert.match(entry.copiedTree.sha256, /^[a-f0-9]{64}$/);
    assert.equal((await lstat(entry.copiedExecutable)).mode & 0o777, 0o755);
    assert.equal(await readFile(join(entry.directory, "DEPENDENCIES_VALIDATED"), "utf8"), "previous host");
    await assert.rejects(lstat(join(entry.copiedDirectory, "DEPENDENCIES_VALIDATED")), { code: "ENOENT" });
    assert.equal(await readFile(join(entry.copiedDirectory, relative(entry.directory, entry.marker)), "utf8"), "");
  }
  const copiedChromium = receipt.revisions.find((entry) => entry.name === "chromium");
  const copiedLink = join(copiedChromium.copiedDirectory, "fixture framework", "Versions", "Current");
  assert.equal(await readlink(copiedLink), "A");
  assert.ok((await realpath(copiedLink)).startsWith(copiedChromium.copiedDirectory));
  assert.equal(await readFile(join(source, ".links", "other project"), "utf8"), "do not copy or edit");
  await writeFile(chromium.executable, "source changed after copy");
  const copiedBytes = await readFile(copiedChromium.copiedExecutable);
  assert.equal(createHash("sha256").update(copiedBytes).digest("hex"), copiedChromium.copiedBinarySha256);
});

test("missing native installation marker fails before creating a destination or touching another revision", async (t) => {
  const { source, target, description } = await fixture(t);
  await rm(description.revisions.at(-1).marker);
  await assert.rejects(prepareInspectionBrowserCache(source, target), { code: "ENOENT" });
  await assert.rejects(lstat(target), { code: "ENOENT" });
  assert.equal(await readFile(join(source, ".links", "other project"), "utf8"), "do not copy or edit");
});

test("a destination reached through an alias parent preserves valid vendor links in the owned copy", async (t) => {
  const { scratch, source, description } = await fixture(t);
  await symlink(scratch, join(scratch, "alias parent"));
  const entry = description.revisions[0];
  await writeFile(join(entry.directory, "actual"), "library bytes");
  await symlink("actual", join(entry.directory, "vendor-link"));
  const receipt = await prepareInspectionBrowserCache(source, join(scratch, "alias parent", "copied"));
  assert.equal(receipt.directory, join(scratch, "copied"));
  assert.equal(await readFile(join(receipt.revisions[0].copiedDirectory, "vendor-link"), "utf8"), "library bytes");
  assert.deepEqual(receipt.revisions[0].sourceTree, receipt.revisions[0].copiedTree);
});

test("cache copying rejects external/absolute links, revision-root links and overlapping destinations", async (t) => {
  const { scratch, source, target, description } = await fixture(t);
  const entry = description.revisions[0];
  const link = join(entry.directory, "bad-link");
  await writeFile(join(scratch, "outside"), "not owned");
  for (const value of [join(scratch, "outside"), relative(entry.directory, join(scratch, "outside")), entry.executable]) {
    await symlink(value, link);
    await assert.rejects(prepareInspectionBrowserCache(source, target), /Cache link escapes/);
    await assert.rejects(lstat(target), { code: "ENOENT" });
    await rm(link);
  }
  for (const overlap of [source, join(source, "nested"), scratch])
    await assert.rejects(prepareInspectionBrowserCache(source, overlap), /must be separate/);
  await rm(entry.directory, { recursive: true });
  await symlink(description.revisions[1].directory, entry.directory);
  await assert.rejects(prepareInspectionBrowserCache(source, target), /Missing installed revision/);
  await assert.rejects(lstat(target), { code: "ENOENT" });
});

test("explicit invalid sources and occupied destinations never silently fall back or overwrite", async (t) => {
  const { source, target } = await fixture(t);
  for (const invalid of ["", " ", "relative-cache"])
    await assert.rejects(prepareInspectionBrowserCache(invalid, target), /explicit absolute path/);
  await mkdir(target);
  await writeFile(join(target, "keep"), "unchanged");
  await assert.rejects(prepareInspectionBrowserCache(source, target), { code: "EEXIST" });
  assert.equal(await readFile(join(target, "keep"), "utf8"), "unchanged");
});

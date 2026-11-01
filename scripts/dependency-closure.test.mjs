// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkDependencyClosure, checkPublishedRuntimes } from "./dependency-closure.mjs";

const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function installedTree(t) {
  const root = mkdtempSync(join(tmpdir(), "spex dependency closure "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lock = { name: "closure-fixture", version: "1.0.0", lockfileVersion: 3, packages: {} };
  function add(path, manifest) {
    const directory = join(root, path);
    mkdirSync(directory, { recursive: true });
    writeJson(join(directory, "package.json"), manifest);
    writeFileSync(join(directory, "index.js"), "module.exports = {};\n");
    lock.packages[path] = Object.fromEntries(["name", "version", "dependencies", "peerDependencies", "peerDependenciesMeta", "devDependencies", "optionalDependencies"].filter((key) => key in manifest).map((key) => [key, manifest[key]]));
    return directory;
  }
  add("", {
    name: "closure-fixture", version: "1.0.0", private: true,
    workspaces: ["packages/*", "apps/*"],
    dependencies: { "@sublang/playbook": "^18.0.0", "@sublang/cligent": "^0.36.1", xstate: "^5.33.0", "@sublang/slc": "^0.20.0" },
  });
  add("node_modules/@sublang/playbook", {
    name: "@sublang/playbook", version: "18.1.0", exports: { "./xstate-runtime": "./index.js" },
    dependencies: { "@sublang/cligent": "^0.36.1", xstate: "^5.33.0" },
  });
  // Every copy carries the same ABI; duplicated identity still fails.
  writeFileSync(join(root, "node_modules/@sublang/playbook/index.js"), "exports.RUNTIME_ABI = 1; exports.SUPPORTED_ARTIFACT_SCHEMAS = [3];\n");
  add("node_modules/@sublang/cligent", { name: "@sublang/cligent", version: "0.36.1", exports: { ".": { import: "./index.js" } } });
  add("node_modules/xstate", { name: "xstate", version: "5.33.0", main: "index.js" });
  add("node_modules/@sublang/slc", {
    name: "@sublang/slc", version: "0.20.0", exports: { ".": "./index.js" },
    peerDependencies: { "@sublang/playbook": "^18.1.0" },
    dependencies: { "@sublang/cligent": "^0.36.1", xstate: "^5.33.0" },
  });
  for (const [path, name, dependencies] of [
    ["packages/core", "@sublang/spex-core", { "@sublang/playbook": "^18.1.0", "@sublang/cligent": "^0.36.1" }],
    ["apps/desktop", "spex-desktop", { "@sublang/spex-core": "*", "@sublang/playbook": "^18.1.0", "@sublang/slc": "^0.20.0" }],
    ["apps/server", "spex-server", { "@sublang/spex-core": "*", "@sublang/playbook": "^18.1.0", "@sublang/slc": "^0.20.0" }],
  ]) {
    add(path, { name, version: "1.0.0", main: "index.js", dependencies });
    const link = join(root, "node_modules", name);
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(join(root, path), link, "junction");
    lock.packages[`node_modules/${name}`] = { resolved: path, link: true };
  }
  const save = () => writeJson(join(root, "package-lock.json"), lock);
  save();
  return { root, lock, add, save };
}

test("shared installed closure passes without conflating the separate scaffold grammar", (t) => {
  const tree = installedTree(t);
  tree.add("node_modules/@sublang/slc/node_modules/@sublang/spex", { name: "@sublang/spex", version: "3.0.0" });
  tree.add("node_modules/@sublang/playbook/node_modules/@sublang/spex", { name: "@sublang/spex", version: "3.1.0" });
  tree.save();
  assert.deepEqual(checkDependencyClosure(tree.root), { "@sublang/playbook": "18.1.0", "@sublang/cligent": "0.36.1", xstate: "5.33.0" });
});

function registryTree(t) {
  const tree = installedTree(t);
  for (const name of ["@sublang/cligent", "@sublang/playbook"]) {
    const entry = tree.lock.packages[`node_modules/${name}`];
    entry.resolved = `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${entry.version}.tgz`;
    entry.integrity = `sha512-${Buffer.alloc(64, 1).toString("base64")}`;
  }
  tree.save();
  return tree;
}

test("release-42: a registry lock passes without installing or needing a local runtime archive", (t) => {
  const tree = registryTree(t);
  assert.deepEqual(checkPublishedRuntimes(tree.root), { "@sublang/cligent": "0.36.1", "@sublang/playbook": "18.1.0" });
});

for (const name of ["@sublang/cligent", "@sublang/playbook"]) {
  test(`release-42: ${name} refuses non-registry or unverifiable lock sources`, (t) => {
    const tree = registryTree(t);
    const entry = tree.lock.packages[`node_modules/${name}`];
    const original = { ...entry };
    for (const change of [
      { resolved: "file:vendor/runtime.tgz" },
      { resolved: "git+https://github.com/example/runtime.git#abc" },
      { resolved: original.resolved.replace("registry.npmjs.org", "example.com") },
      { resolved: original.resolved.replace("https:", "http:") },
      { integrity: undefined },
      { link: true },
    ]) {
      tree.lock.packages[`node_modules/${name}`] = { ...original, ...change };
      tree.save();
      assert.throws(() => checkPublishedRuntimes(tree.root), /release requires a checksum-locked npm registry package/);
    }
  });
  test(`release-42: ${name} refuses a local manifest even when the lock names registry bytes`, (t) => {
    const tree = registryTree(t);
    const manifestPath = join(tree.root, "packages/core/package.json");
    const manifest = readJson(manifestPath);
    manifest.dependencies[name] = "file:../../vendor/runtime.tgz";
    writeJson(manifestPath, manifest);
    assert.throws(() => checkPublishedRuntimes(tree.root), /must select a published npm version/);
  });
}

for (const name of ["@sublang/playbook", "@sublang/cligent", "xstate"]) {
  test(`unlocked nested ${name} copy fails even at the same version and ABI`, (t) => {
    const { root } = installedTree(t);
    const nested = join(root, "node_modules/@sublang/slc/node_modules", name);
    mkdirSync(dirname(nested), { recursive: true });
    cpSync(join(root, "node_modules", name), nested, { recursive: true });
    assert.throws(() => checkDependencyClosure(root), /installed tree must contain one physical installation; found 2/);
  });
}

test("a duplicate lock entry fails even when the physical tree is deduplicated", (t) => {
  const tree = installedTree(t);
  tree.lock.packages["node_modules/@sublang/slc/node_modules/@sublang/playbook"] = tree.lock.packages["node_modules/@sublang/playbook"];
  tree.save();
  assert.throws(() => checkDependencyClosure(tree.root), /lockfile must contain one installation; found 2/);
});

test("a stale installed Playbook fails even when it satisfies the declared range", (t) => {
  const { root } = installedTree(t);
  const path = join(root, "node_modules/@sublang/playbook/package.json");
  writeJson(path, { ...readJson(path), version: "18.1.1" });
  assert.throws(() => checkDependencyClosure(root), /installed 18\.1\.1 .* differs from locked 18\.1\.0/);
});

test("a stale compiler fails against the lock", (t) => {
  const { root } = installedTree(t);
  const path = join(root, "node_modules/@sublang/slc/package.json");
  writeJson(path, { ...readJson(path), version: "0.19.1" });
  assert.throws(() => checkDependencyClosure(root), /installed version 0\.19\.1 differs from locked 0\.20\.0/);
});

test("a shell-local compiler fails when its compatible version is not locked at that path", (t) => {
  const { root } = installedTree(t);
  const nested = join(root, "apps/server/node_modules/@sublang/slc");
  mkdirSync(dirname(nested), { recursive: true });
  cpSync(join(root, "node_modules/@sublang/slc"), nested, { recursive: true });
  const path = join(nested, "package.json");
  writeJson(path, { ...readJson(path), version: "0.20.1" });
  assert.throws(() => checkDependencyClosure(root), /server compiler: installed package is missing from package-lock/);
});

test("an installed compiler missing from the lock fails", (t) => {
  const tree = installedTree(t);
  delete tree.lock.packages["node_modules/@sublang/slc"];
  tree.save();
  assert.throws(() => checkDependencyClosure(tree.root), /compiler: installed package is missing from package-lock/);
});

test("changing a shell dependency without updating its lock fails", (t) => {
  const { root } = installedTree(t);
  const path = join(root, "apps/server/package.json");
  const manifest = readJson(path);
  manifest.dependencies["@sublang/playbook"] = "^19.0.0";
  writeJson(path, manifest);
  assert.throws(() => checkDependencyClosure(root), /apps\/server: dependencies\.@sublang\/playbook differs from package-lock/);
});

test("an unlocked shell manifest cannot bypass declaration agreement", (t) => {
  const tree = installedTree(t);
  delete tree.lock.packages["apps/server"];
  tree.save();
  assert.throws(() => checkDependencyClosure(tree.root), /apps\/server: workspace manifest is missing from package-lock/);
});

test("compiler peer drift at an unchanged package version fails", (t) => {
  const { root } = installedTree(t);
  const path = join(root, "node_modules/@sublang/slc/package.json");
  const manifest = readJson(path);
  manifest.peerDependencies["@sublang/playbook"] = "^17.0.0";
  writeJson(path, manifest);
  assert.throws(() => checkDependencyClosure(root), /peerDependencies\.@sublang\/playbook differs from package-lock/);
});

test("npm rejects an installed compiler's incompatible required peer", (t) => {
  const tree = installedTree(t);
  const path = join(tree.root, "node_modules/@sublang/slc/package.json");
  const manifest = readJson(path);
  manifest.peerDependencies["@sublang/playbook"] = "^17.0.0";
  writeJson(path, manifest);
  tree.lock.packages["node_modules/@sublang/slc"].peerDependencies = manifest.peerDependencies;
  tree.save();
  assert.throws(() => checkDependencyClosure(tree.root), /npm dependency ranges are not satisfied/);
});

for (const mode of ["private", "optional", "absent"]) {
  test(`a ${mode} compiler Playbook dependency fails`, (t) => {
    const tree = installedTree(t);
    const path = join(tree.root, "node_modules/@sublang/slc/package.json");
    const manifest = readJson(path);
    if (mode === "private") manifest.dependencies["@sublang/playbook"] = "^18.1.0";
    if (mode === "optional") manifest.peerDependenciesMeta = { "@sublang/playbook": { optional: true } };
    if (mode === "absent") delete manifest.peerDependencies;
    writeJson(path, manifest);
    tree.lock.packages["node_modules/@sublang/slc"] = manifest;
    tree.save();
    assert.throws(() => checkDependencyClosure(tree.root), /Playbook must be a required peer/);
  });
}

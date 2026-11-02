// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHARED = ["@sublang/playbook", "@sublang/cligent", "xstate"];
const FOCUSED = [...SHARED, "@sublang/slc"];
const SPECIFIERS = {
  "@sublang/playbook": "@sublang/playbook/xstate-runtime",
  "@sublang/cligent": "@sublang/cligent",
  xstate: "xstate",
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const portable = (path) => path.replaceAll("\\", "/");
const ownsPackage = (path, name) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`);

/** Release tags consume published runtime packages, never developer snapshots.
 * This lock-only check runs before npm ci; npm verifies the actual integrity. */
export function checkPublishedRuntimes(root) {
  const lock = json(join(root, "package-lock.json"));
  if (!lock.packages || lock.lockfileVersion < 2) throw new Error("published runtimes: lockfile needs a packages table");
  const errors = [];
  const versions = {};
  for (const name of ["@sublang/cligent", "@sublang/playbook"]) {
    const entries = Object.entries(lock.packages).filter(([path]) => ownsPackage(path, name));
    if (entries.length !== 1) errors.push(`${name}: expected one locked registry package; found ${entries.length}`);
    for (const [path, entry] of entries) {
      let published = false;
      try {
        const url = new URL(entry.resolved);
        const archive = `${name}/-/${name.split("/").at(-1)}-${entry.version}.tgz`;
        published = url.protocol === "https:" && url.host === "registry.npmjs.org" &&
          !url.username && !url.password && !url.search && !url.hash &&
          decodeURIComponent(url.pathname) === `/${archive}`;
      } catch {}
      if (!published || entry.link || !/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity ?? "")) {
        errors.push(`${path}: release requires a checksum-locked npm registry package, not ${entry.resolved ?? "an unresolved dependency"}`);
      }
      versions[name] = entry.version;
    }
    for (const path of ["", "packages/core", "packages/cli", "apps/desktop", "apps/server"]) {
      const manifestPath = join(root, path, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = json(manifestPath);
      for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
        const value = manifest[field]?.[name];
        if (typeof value === "string" && (value.includes(":") || /^[./\\]/.test(value))) {
          errors.push(`${path || "."}: ${field}.${name} must select a published npm version, not ${value}`);
        }
      }
    }
  }
  if (errors.length) throw new Error(`published runtimes:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  return versions;
}

/** Node's ESM resolver needs this flag to accept an explicit parent on
 * every supported Node. Batch queries so the build starts two children,
 * and honor import-only exports (Cligent has no require entry). */
function resolvePackages(queries) {
  const result = spawnSync(process.execPath, ["--experimental-import-meta-resolve", "--input-type=module", "--eval", `
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const queries = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(queries.map(({ from, specifier }) => {
  try { return { url: import.meta.resolve(specifier, pathToFileURL(from).href) }; }
  catch (error) { return { error: error.message }; }
})));
`], { encoding: "utf8", input: JSON.stringify(queries), timeout: 30_000 });
  if (result.error || result.status !== 0) throw new Error(`ESM dependency resolution failed: ${result.error?.message || result.stderr.trim()}`);
  return JSON.parse(result.stdout).map((resolution, index) => {
    if (resolution.error) return resolution;
    try { return { value: owningPackage(fileURLToPath(resolution.url), queries[index].name) }; }
    catch (error) { return { error: error.message }; }
  });
}

function owningPackage(resolvedEntry, name) {
  const entry = realpathSync(resolvedEntry);
  let directory = dirname(entry);
  while (true) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest) && json(manifest).name === name) {
      return { directory: realpathSync(directory), entry, manifest: json(manifest) };
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`${resolvedEntry} resolved outside a ${name} package`);
    directory = parent;
  }
}

/** Resolve from the actual consumer, honoring package exports, then find
 * the owning package rather than assuming a hoisted installation. */
export function resolvePackage(from, name, specifier = SPECIFIERS[name] ?? name) {
  const [result] = resolvePackages([{ from, name, specifier }]);
  if (result.error) throw new Error(result.error);
  return result.value;
}

/** Visit physical dependency trees, including workspace-local and stale
 * nested packages absent from package-lock.json. Symlinks count once. */
function installedPackages(root, lock) {
  const found = new Map(SHARED.map((name) => [name, new Map()]));
  const visited = new Set();
  function visit(directory) {
    if (!existsSync(directory)) return;
    const canonical = realpathSync(directory);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.name.startsWith("@")) {
        visit(path);
        continue;
      }
      const manifestPath = join(path, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = json(manifestPath);
      found.get(manifest.name)?.set(realpathSync(path), manifest);
      visit(join(path, "node_modules"));
    }
  }
  visit(join(root, "node_modules"));
  // Workspaces may be absent from the root's symlinks in a damaged tree.
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (entry.link && typeof entry.resolved === "string") visit(join(root, entry.resolved, "node_modules"));
    else if (path && !path.includes("node_modules/")) visit(join(root, path, "node_modules"));
  }
  return found;
}

/** The source app and each compiler use one locked engine closure. This
 * runs before building, so it needs no generated workspace artifacts. */
export function checkDependencyClosure(root) {
  root = realpathSync(root);
  const lock = json(join(root, "package-lock.json"));
  if (!lock.packages || lock.lockfileVersion < 2) throw new Error("dependency closure: package-lock.json needs a packages table");
  const errors = [];
  for (const path of ["", "packages/core", "apps/desktop", "apps/server"]) {
    if (!lock.packages[path]) errors.push(`${path || "."}: workspace manifest is missing from package-lock.json`);
  }
  const installed = installedPackages(root, lock);
  const selected = new Map();
  for (const name of SHARED) {
    const entries = Object.entries(lock.packages).filter(([path]) => ownsPackage(path, name));
    if (entries.length !== 1) errors.push(`${name}: lockfile must contain one installation; found ${entries.length}`);
    const physical = installed.get(name);
    if (physical.size !== 1) errors.push(`${name}: installed tree must contain one physical installation; found ${physical.size}: ${[...physical.keys()].map((path) => portable(relative(root, path))).join(", ")}`);
    if (entries.length === 1 && physical.size === 1) {
      const [path, locked] = entries[0];
      const [directory, manifest] = physical.entries().next().value;
      if (portable(relative(root, directory)) !== path || manifest.version !== locked.version) {
        errors.push(`${name}: installed ${manifest.version} at ${portable(relative(root, directory))} differs from locked ${locked.version} at ${path}`);
      }
      selected.set(name, { directory, manifest });
    }
  }
  // Compare the dependency metadata npm installed with the declarations
  // it locked, including peer metadata; matching versions alone is weak.
  for (const [path, locked] of Object.entries(lock.packages)) {
    if (locked.link) continue;
    const local = !path || !path.includes("node_modules/");
    if (!local && !FOCUSED.some((name) => ownsPackage(path, name))) continue;
    const manifestPath = join(root, path, "package.json");
    if (!existsSync(manifestPath)) {
      errors.push(`${path || "."}: locked package is missing`);
      continue;
    }
    const manifest = json(manifestPath);
    if (!local && manifest.version !== locked.version) errors.push(`${path}: installed version ${manifest.version} differs from locked ${locked.version}`);
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "peerDependenciesMeta"]) {
      for (const name of FOCUSED) {
        // Published-package dev dependencies are not part of the lock.
        if (field === "devDependencies" && !local) continue;
        if (JSON.stringify(manifest[field]?.[name]) !== JSON.stringify(locked[field]?.[name])) {
          errors.push(`${path || "."}: ${field}.${name} differs from package-lock.json`);
        }
      }
    }
  }
  const consumers = [
    ["app root", join(root, "package.json")],
    ["core", join(root, "packages/core/package.json")],
    ["desktop", join(root, "apps/desktop/package.json")],
    ["server", join(root, "apps/server/package.json")],
  ];
  const shells = consumers.slice(2);
  const compilers = resolvePackages(shells.map(([, from]) => ({ from, name: "@sublang/slc", specifier: "@sublang/slc" })));
  for (const [index, [label]] of shells.entries()) {
    try {
      if (compilers[index].error) throw new Error(compilers[index].error);
      const compiler = compilers[index].value;
      const manifest = compiler.manifest;
      if (!lock.packages[portable(relative(root, compiler.directory))]) errors.push(`${label} compiler: installed package is missing from package-lock.json`);
      if (!manifest.peerDependencies?.["@sublang/playbook"] || manifest.peerDependenciesMeta?.["@sublang/playbook"]?.optional || manifest.dependencies?.["@sublang/playbook"] || manifest.optionalDependencies?.["@sublang/playbook"]) {
        errors.push(`${label} compiler: Playbook must be a required peer, without a private runtime dependency`);
      }
      consumers.push([`${label} compiler`, compiler.entry]);
    } catch (error) { errors.push(`${label} compiler: ${error.message}`); }
  }
  const playbook = selected.get("@sublang/playbook");
  if (playbook) consumers.push(["Playbook", join(playbook.directory, "package.json")]);
  const queries = consumers.flatMap(([label, from]) => SHARED.map((name) => ({ label, from, name, specifier: SPECIFIERS[name] })));
  const resolutions = resolvePackages(queries);
  for (const [index, { label, name }] of queries.entries()) {
    const resolved = resolutions[index];
    if (resolved.error) errors.push(`${label}: ${resolved.error}`);
    else if (selected.has(name) && selected.get(name).directory !== resolved.value.directory) errors.push(`${label}: ${name} resolves to a different installation at ${resolved.value.directory}`);
  }
  if (!errors.length) {
    // npm owns SemVer and peer acceptance. Query the four relevant
    // packages only, leaving the separate scaffold grammar out of this
    // singleton policy. npm ls is read-only and uses no registry access.
    const result = spawnSync("npm", ["ls", "--all", "--json", ...FOCUSED], {
      cwd: root, encoding: "utf8", shell: process.platform === "win32", timeout: 30_000,
    });
    if (result.error || result.status !== 0) {
      let problems;
      try { problems = JSON.parse(result.stdout).problems?.join("; "); } catch {}
      errors.push(`npm dependency ranges are not satisfied: ${problems || result.error?.message || result.stderr.trim()}`);
    }
  }
  if (errors.length) throw new Error(`dependency closure:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  return Object.fromEntries([...selected].map(([name, { manifest }]) => [name, manifest.version]));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const publishedOnly = process.argv.includes("--registry-only");
    const versions = publishedOnly ? checkPublishedRuntimes(root) : checkDependencyClosure(root);
    console.log(`${publishedOnly ? "published runtimes" : "dependency closure: one shared installation"} (${Object.entries(versions).map(([name, version]) => `${name}@${version}`).join(", ")})`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

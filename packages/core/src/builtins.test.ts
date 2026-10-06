// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";

import { loadBuiltinCatalog } from "./builtins.js";
import type { LoadModule } from "./config.js";
import {
  builtinPackage,
  builtinRegistrySource,
  compositeRegistry,
  ContentStore,
  gitSource,
  install,
  moduleLocations,
  parseRequests,
  RegistryClient,
  resolve,
  seedBuiltinPackage,
  type ModuleLocation,
} from "./environment/index.js";
import { scratchDir } from "./testing/scratch.js";

/** The built-in spec package seeded, resolved offline and installed in
 * a scratch clone: the locations an environment exports. */
async function installedBuiltins(): Promise<Map<string, ModuleLocation>> {
  const home = scratchDir("spex-builtins-");
  const store = new ContentStore(home);
  const cache = join(home, "cache");
  const shipped = builtinPackage();
  await seedBuiltinPackage(store, cache, shipped);
  const registry = compositeRegistry(builtinRegistrySource({ store, cacheDir: cache, shipped }), new RegistryClient({ url: "http://127.0.0.1:9" }));
  const clone = join(home, "workspace", "me", "me-spex");
  mkdirSync(clone, { recursive: true });
  const text = stringify({ format: 1, packages: { "sublang/playbooks": { version: `^${shipped.version}` } } });
  writeFileSync(join(clone, "spex.yaml"), text);
  const result = await resolve({ requests: parseRequests(text), requestsText: text, registry, workingFolder: null, git: gitSource(cache) });
  assert.ok(result.ok);
  if (!result.ok) throw new Error("unreachable");
  await install({ cloneDir: clone, lock: result.lock, store, cache, registry, git: gitSource(cache), workingFolder: null, requestsText: text });
  return moduleLocations(result.lock, clone, null);
}

test("playbook-library-34: the catalog serves every built-in of the installed spec package with its source", async () => {
  const locations = await installedBuiltins();
  const builtins = await loadBuiltinCatalog(locations, new Set(["code"]));
  assert.deepEqual(
    builtins.map((b) => [b.id, b.configured]).sort(),
    [["branch", false], ["code", true], ["decide", false], ["dev", false], ["inspect", false], ["pr", false], ["review", false]],
  );
  const review = builtins.find((b) => b.id === "review");
  assert.deepEqual(review?.roles, ["coder", "reviewer"]);
  assert.equal(review?.from, locations.get("review")?.module);
  // Served without their maintainer-facing comment headers (DR-015).
  assert.ok((review?.source ?? "").startsWith("# Review"));
  assert.doesNotMatch(review?.source ?? "", /<!--/);
  const inspect = builtins.find((entry) => entry.id === "inspect");
  assert.deepEqual(inspect?.roles, ["inspector"]);
  assert.match(inspect?.source ?? "", /^# Inspect/);
});

test("a built-in whose module fails to load is omitted", async () => {
  const locations = await installedBuiltins();
  const flaky: LoadModule = async (specifier) => {
    if (specifier === locations.get("code")?.module) return import(specifier);
    throw new Error("the module will not load");
  };
  const builtins = await loadBuiltinCatalog(locations, new Set(), flaky);
  assert.deepEqual(builtins.map((b) => b.id), ["code"]);
});

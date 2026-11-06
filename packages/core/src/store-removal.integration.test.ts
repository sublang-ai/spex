// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The store's read-only files removed on every platform (environments-53):
// a real core's start collecting the store, and installs replacing,
// failing and emptying trees of read-only files. Windows refuses to
// remove a read-only file, and the Node the app's Electron ships no
// longer makes one writable first, so CI runs this file on Windows on
// that Node.

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import {
  ContentStore,
  gitSource,
  install,
  InstallError,
  parseRequests,
  publishRelease,
  RegistryClient,
  resolve,
  sha256Hex,
  writeLock,
  type InstallOptions,
  type Lock,
} from "@sublang/spex/environment";
import { fileVersion } from "@sublang/spex/files";
import { makeRelease, startStandinRegistry, type StandinRegistry } from "@sublang/spex/testing";
import { installEngine } from "./compile.js";
import { CoreService } from "./service.js";
import { scratchDir } from "./testing/scratch.js";

const machineIdentity = "machine-id:v1:00000000-0000-4000-8000-0000000000b5";

let registry: StandinRegistry;
let client: RegistryClient;

before(async () => {
  registry = await startStandinRegistry({ dir: scratchDir("spex-standin-") });
  client = new RegistryClient({ url: registry.url });
  for (const version of ["1.0.0", "1.1.0"]) {
    const dir = join(scratchDir("spex-release-"), "release");
    await makeRelease(dir, {
      format: 2, org: "acme", name: "kit", version, description: "The acme/kit spec package", license: "Apache-2.0",
      artifacts: { tidy: { kind: "skill", language: "en" } },
    }, {
      "skills/en/tidy/SKILL.md": `---\nname: tidy\ndescription: The tidy skill\n---\n\nRelease ${version}.\n`,
      "skills/en/tidy/run.sh": { data: `echo ${version}\n`, executable: true },
    });
    await publishRelease(client, dir);
  }
});

after(async () => {
  await registry.close();
});

const requestsOf = (version: string): string => `format: 1\npackages:\n  acme/kit:\n    version: ${version}\n`;

/** Resolve `acme/kit` at `version` in `root`, writing its `spex.yaml`. */
async function lockAt(root: string, cache: string, version: string): Promise<Lock> {
  const text = requestsOf(version);
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "spex.yaml"), text);
  const result = await resolve({ requests: parseRequests(text), requestsText: text, registry: client, pathRoot: null, git: gitSource(cache) });
  if (!result.ok) assert.fail(`resolution failed: ${JSON.stringify(result.conflicts)}`);
  return result.lock;
}

/** Whether a file reads read-only: on Windows, its read-only mark. */
const readOnly = (path: string): boolean => (statSync(path).mode & 0o222) === 0;

/** Every stored file a lock selects. */
const storedFiles = (store: ContentStore, lock: Lock): string[] =>
  Object.values(lock.packages).flatMap((resolution) => resolution.files.map((file) => store.pathOf(file.sha256, file.executable)));

/** A real core on the scratch home `dataDir`, touching nothing of the host's. */
function startCore(root: string): Promise<CoreService> {
  return CoreService.start({
    dataDir: join(root, "home"),
    configPath: join(root, "config", "playbook.yaml"),
    machineIdentity,
    home: join(root, "user"),
    own: "tester",
    env: {},
    watchConfig: false,
    builtinPackage: null,
    adapterRuntime: () => ({ usable: true }),
    agentSignIn: async () => ({ state: "signed-out" }),
  });
}

/** A scratch home whose own group's environment installs `acme/kit`
 * 1.0.0 through a real core, with a read-only stored file no lock
 * selects beside it. */
async function homeWithStray(): Promise<{ root: string; store: ContentStore; lock: Lock; stray: string }> {
  const root = scratchDir("spex-store-removal-");
  await (await startCore(root)).stop();
  const home = join(root, "home");
  const own = join(home, "workspace", "tester", "tester-spex");
  const lock = await lockAt(own, join(home, "cache"), "1.0.0");
  await writeLock(join(own, "spex.lock"), lock);
  await (await startCore(root)).stop();
  const store = new ContentStore(home);
  for (const file of storedFiles(store, lock)) assert.ok(existsSync(file), "the start installed the lock through the store");
  const bytes = Buffer.from("selected by no lock\n");
  const stray = store.put(bytes, sha256Hex(bytes), false);
  assert.ok(readOnly(stray), "a stored file is read-only");
  return { root, store, lock, stray };
}

test("environments-53: a start removes a read-only stored file no lock selects and marks the files it keeps read-only again", async () => {
  const { root, store, lock, stray } = await homeWithStray();
  // A link removed on Windows leaves the stored file writable.
  const kept = storedFiles(store, lock);
  chmodSync(kept[0]!, 0o644);
  await (await startCore(root)).stop();
  assert.equal(existsSync(stray), false, "[environments-52] the read-only file no lock selects is removed");
  for (const file of kept) {
    assert.ok(existsSync(file), "[environments-52] a file a lock selects stays");
    assert.ok(readOnly(file), "[environments-52] every file kept reads read-only again");
  }
});

test("environments-53: a collection that fails fails no start", {
  skip: process.platform === "win32" || process.getuid?.() === 0,
}, async (t) => {
  const { root, store, stray } = await homeWithStray();
  const diagnostics = t.mock.method(console, "error", () => {});
  chmodSync(store.root, 0o555);
  try {
    await (await startCore(root)).stop();
  } finally {
    chmodSync(store.root, 0o755);
  }
  assert.ok(existsSync(stray), "[environments-52] the file the collection could not remove stays");
  const diagnostic = diagnostics.mock.calls.map((call) => String(call.arguments[0])).find((message) => message.includes("the store was not collected"));
  assert.ok(diagnostic, "[environments-52] a diagnostic reports the failed collection");
  assert.match(diagnostic, /EACCES|EPERM/, "[environments-52] naming its cause");
});

test("environments-53: installs replacing, failing and emptying trees of read-only files leave none behind, the stored files read-only", async (t) => {
  const home = scratchDir("spex-store-removal-");
  const store = new ContentStore(home);
  const cache = join(home, "cache");
  const root = join(home, "workspace", "acme", "kit-spex");
  const installed = join(root, ".spex", "packages");
  const run = async (lock: Lock, extra: Partial<InstallOptions> = {}) => {
    await writeLock(join(root, "spex.lock"), lock);
    return install({ root, lock, store, cache, registry: client, git: gitSource(cache), pathRoot: null, engine: installEngine(), lockVersion: fileVersion(join(root, "spex.lock")), ...extra });
  };
  const leftIn = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir) : []);
  const assertSealed = (lock: Lock, when: string): void => {
    for (const file of storedFiles(store, lock)) assert.ok(readOnly(file), `[environments-7] ${when}: the stored files read read-only`);
  };

  const first = await lockAt(root, cache, "1.0.0");
  await run(first);
  const skill = join(installed, "acme", "kit", "skills", "en", "tidy", "SKILL.md");
  assert.ok(readOnly(skill), "[environments-7] an installed file is read-only");
  assertSealed(first, "installed");

  // An install over the installed tree removes the obsolete one.
  const second = await lockAt(root, cache, "1.1.0");
  assert.deepEqual((await run(second)).installed, ["acme/kit"]);
  assert.deepEqual(leftIn(join(cache, "trash")), [], "[environments-7] no obsolete tree stays");
  assert.ok(readOnly(skill), "[environments-7] the new installed file is read-only");
  assertSealed(second, "replaced");

  // A failed install removes its staged tree, its own cause reported.
  writeFileSync(join(root, "spex.yaml"), requestsOf("1.0.0"));
  const cause = new Error("power cut");
  const diagnostics = t.mock.method(console, "error", () => {});
  await assert.rejects(run(first, { beforeReplace: () => { throw cause; } }), (error: unknown) => error instanceof InstallError && error.cause === cause);
  assert.deepEqual(leftIn(join(cache, "staging")), [], "[environments-7] no staged tree stays");
  assert.equal(diagnostics.mock.callCount(), 0, "[environments-7] the staged tree's removal succeeded");
  assertSealed(first, "after a failed install");

  // An emptied lock's install removes the package's installed tree.
  const emptied = "format: 1\npackages: {}\n";
  writeFileSync(join(root, "spex.yaml"), emptied);
  const none = await resolve({ requests: parseRequests(emptied), requestsText: emptied, registry: client, pathRoot: null, git: gitSource(cache) });
  if (!none.ok) assert.fail("an empty request resolves");
  await run(none.lock);
  assert.equal(existsSync(join(installed, "acme")), false, "[environments-7] the package's installed tree is removed");
  assert.deepEqual(leftIn(join(cache, "trash")), [], "[environments-7] no obsolete tree stays");
  assertSealed(second, "emptied");
});

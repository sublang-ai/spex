// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Stored files and installed trees removed on every platform
// (environments-53): a real core's start collecting the store, installs
// replacing, failing, copying across volumes and emptying trees, and a
// former tree of read-only hard links into the store replaced by copies
// (DR-251). Windows refuses to remove a read-only file — a stored file,
// or a former tree's — and the Node the app's Electron ships no longer
// makes one writable first, nor leaves a junction's target alone, so CI
// runs this file on Windows on that Node.

import assert from "node:assert/strict";
import fs, { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";

import {
  ContentStore,
  gitSource,
  install,
  INSTALL_RECORD,
  installedPackages,
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
import { ENGINE_LINKS, installEngine, provisionEngineLinks } from "./compile.js";
import { migrateEnvironments } from "./migrate-environment.js";
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

/** Every file a lock selects. */
const lockedFiles = (lock: Lock) => Object.values(lock.packages).flatMap((resolution) => resolution.files);

/** Every stored file a lock selects. */
const storedFiles = (store: ContentStore, lock: Lock): string[] => lockedFiles(lock).map((file) => store.pathOf(file.sha256));

/** Assert the store holds every file a lock selects at its digest. */
function assertStored(store: ContentStore, lock: Lock, when: string): void {
  for (const file of lockedFiles(lock)) {
    assert.equal(sha256Hex(readFileSync(store.pathOf(file.sha256))), file.sha256, `[environments-7] ${when}: the store holds ${file.path} with its bytes`);
  }
}

/** Where an earlier release kept an executable file's stored copy. */
const formerExecutable = (store: ContentStore, sha256: string): string => join(store.root, "x", sha256);

/** Turn the tree installed at `root` into one an earlier release
 * installed (DR-251): each file a read-only hard link into the store, an
 * executable one's stored copy under `store/x/` alone, the install
 * record of `format: 1`. */
function asFormerTree(root: string, lock: Lock, store: ContentStore): void {
  const tree = join(root, ".spex", "packages");
  for (const [name, resolution] of Object.entries(lock.packages)) {
    for (const file of resolution.files) {
      const installed = join(tree, ...name.split("/"), ...file.path.split("/"));
      const former = formerExecutable(store, file.sha256);
      if (file.executable && !existsSync(former)) {
        mkdirSync(dirname(former), { recursive: true });
        renameSync(store.pathOf(file.sha256), former);
        chmodSync(former, 0o555);
      }
      rmSync(installed);
      linkSync(file.executable ? former : store.pathOf(file.sha256), installed);
    }
  }
  const record = JSON.parse(readFileSync(join(tree, INSTALL_RECORD), "utf8")) as { format: number };
  assert.equal(record.format, 2, "an install records a tree of copies");
  writeFileSync(join(tree, INSTALL_RECORD), JSON.stringify({ ...record, format: 1 }));
}

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

/** A scratch home whose global environment installs `acme/kit`
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
  const stray = store.put(bytes, sha256Hex(bytes));
  assert.ok(readOnly(stray), "a stored file is read-only");
  return { root, store, lock, stray };
}

test("environments-53: a start removes a read-only stored file no lock selects and a former store/x/, keeping the files a lock selects", async () => {
  const { root, store, lock, stray } = await homeWithStray();
  // An executable file's copy as an earlier release kept it apart.
  const former = formerExecutable(store, sha256Hex("an earlier release's executable copy\n"));
  mkdirSync(dirname(former), { recursive: true });
  writeFileSync(former, "an earlier release's executable copy\n");
  chmodSync(former, 0o555);
  // A kept file made writable, as a removed link leaves one on Windows.
  const [writable, sealed] = storedFiles(store, lock);
  chmodSync(writable!, 0o644);
  await (await startCore(root)).stop();
  assert.equal(existsSync(stray), false, "[environments-52] the read-only file no lock selects is removed");
  assert.equal(existsSync(dirname(former)), false, "[environments-52] the former store/x/ is removed whole");
  assertStored(store, lock, "after a start");
  assert.equal(readOnly(writable!), false, "[environments-52] a kept file made writable is left writable");
  assert.equal(readOnly(sealed!), true, "[environments-52] a kept read-only file is left read-only");
});

test("environments-53: a start takes a former store/x/ copy that a stale lock selects as the stored file before removing store/x/", async () => {
  const { root, store, lock } = await homeWithStray();
  const own = join(root, "home", "workspace", "tester", "tester-spex");
  // The global environment as an earlier release installed it: its
  // executable file's only stored copy under store/x/.
  asFormerTree(own, lock, store);
  const executable = lockedFiles(lock).find((file) => file.executable)!;
  assert.equal(store.has(executable.sha256), false, "the executable file's bytes stand under store/x/ alone");
  // spex.yaml changed since: the lock is stale, so the start installs
  // nothing and takes no former copy at an install.
  writeFileSync(join(own, "spex.yaml"), requestsOf("^1.0.0"));
  await (await startCore(root)).stop();
  const record = JSON.parse(readFileSync(join(own, ".spex", "packages", INSTALL_RECORD), "utf8")) as { format: number };
  assert.equal(record.format, 1, "the stale lock installed nothing");
  assertStored(store, lock, "after a start over a stale lock");
  assert.equal(existsSync(join(store.root, "x")), false, "[environments-52] the former store/x/ is removed");
});

test("environments-53: a collection that fails fails no start", {
  skip: process.platform === "win32" || process.getuid?.() === 0,
}, async (t) => {
  const { root, store, lock, stray } = await homeWithStray();
  const diagnostics = t.mock.method(console, "error", () => {});
  chmodSync(store.root, 0o555);
  try {
    await (await startCore(root)).stop();
  } finally {
    chmodSync(store.root, 0o755);
  }
  assert.ok(existsSync(stray), "[environments-52] the file the collection could not remove stays");
  assertStored(store, lock, "after a failed collection");
  const diagnostic = diagnostics.mock.calls.map((call) => String(call.arguments[0])).find((message) => message.includes("the store was not collected"));
  assert.ok(diagnostic, "[environments-52] a diagnostic reports the failed collection");
  assert.match(diagnostic, /EACCES|EPERM/, "[environments-52] naming its cause");
});

/** A scratch home whose environments install `acme/kit`. */
function scratchInstalls() {
  const home = scratchDir("spex-store-removal-");
  const store = new ContentStore(home);
  const cache = join(home, "cache");
  const root = join(home, "workspace", "acme", "kit-spex");
  const installed = join(root, ".spex", "packages");
  /** Install `lock` at `at`, its `spex.lock` written first. */
  const run = async (lock: Lock, extra: Partial<InstallOptions> = {}, at = root) => {
    await writeLock(join(at, "spex.lock"), lock);
    return install({ root: at, lock, store, cache, registry: client, git: gitSource(cache), pathRoot: null, engine: installEngine(), lockVersion: fileVersion(join(at, "spex.lock")), ...extra });
  };
  /** Resolve `acme/kit` at `version` at `at` and install it; its lock. */
  const installAt = async (version: string, at = root): Promise<Lock> => {
    const lock = await lockAt(at, cache, version);
    assert.deepEqual((await run(lock, {}, at)).installed, ["acme/kit"]);
    return lock;
  };
  const leftIn = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir) : []);
  const assertSealed = (lock: Lock, when: string): void => assertStored(store, lock, when);
  const skillOf = (at: string): string => join(at, ".spex", "packages", "acme", "kit", "skills", "en", "tidy", "SKILL.md");
  /** Assert the tree at `at` holds every file of `lock` as a copy: its
   * bytes, sharing none with the store, writable. */
  const assertCopies = (at: string, lock: Lock, when: string): void => {
    for (const file of lockedFiles(lock)) {
      const path = join(at, ".spex", "packages", "acme", "kit", ...file.path.split("/"));
      assert.equal(sha256Hex(readFileSync(path)), file.sha256, `[environments-7] ${when}: ${file.path} holds its bytes`);
      assert.equal(statSync(path).nlink, 1, `[environments-7] ${when}: ${file.path} shares its bytes with no other file`);
      assert.equal(readOnly(path), false, `[environments-7] ${when}: ${file.path} is an ordinary writable file`);
      if (process.platform !== "win32") assert.equal((statSync(path).mode & 0o100) !== 0, file.executable, `[environments-7] ${when}: ${file.path} keeps its executable flag`);
    }
  };
  return { home, store, cache, root, installed, run, installAt, leftIn, assertSealed, assertCopies, skillOf };
}

test("environments-53: installs replacing, failing and emptying trees leave none behind, the stored files holding their bytes", async (t) => {
  const { cache, root, installed, run, installAt, leftIn, assertSealed, assertCopies } = scratchInstalls();
  const first = await installAt("1.0.0");
  assertCopies(root, first, "installed");
  assertSealed(first, "installed");

  // An install over the installed tree removes the obsolete one.
  const second = await installAt("1.1.0");
  assert.deepEqual(leftIn(join(cache, "trash")), [], "[environments-7] no obsolete tree stays");
  assertCopies(root, second, "replaced");
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

test("environments-53: an obsolete tree holding links, as a playbook artifact's engine links are, goes with them, the folders they point to whole", async () => {
  const { home, cache, installed, installAt, leftIn } = scratchInstalls();
  await installAt("1.0.0");
  // The engine's copies the links point to: on Windows, junctions, which
  // the Node the app's Electron ships follows in rmSync, emptying them.
  const modules = join(home, "engine", "node_modules");
  for (const name of ENGINE_LINKS) {
    mkdirSync(join(modules, name), { recursive: true });
    writeFileSync(join(modules, name, "package.json"), "{}\n");
  }
  const folder = join(installed, "acme", "kit", "skills", "en", "tidy");
  const links = provisionEngineLinks(folder, [modules]);
  assert.equal(links.length, ENGINE_LINKS.length, "the installed folder holds the engine's links");
  for (const link of links) assert.ok(lstatSync(link).isSymbolicLink());
  await installAt("1.1.0");
  assert.deepEqual(leftIn(join(cache, "trash")), [], "[environments-7] no obsolete tree stays, its links gone with it");
  assert.equal(existsSync(join(folder, "node_modules")), false, "[environments-7] the new tree holds none of the old links");
  for (const name of ENGINE_LINKS) {
    assert.equal(readFileSync(join(modules, name, "package.json"), "utf8"), "{}\n", `[environments-7] the ${name} folder a link pointed to stays whole`);
  }
});

test("environments-53: a staged tree copied into place, as across volumes, leaves none behind, the stored files holding their bytes", async () => {
  const { cache, root, installed, installAt, leftIn, assertSealed, assertCopies } = scratchInstalls();
  // The staged tree's move into `.spex/packages/` meets another volume:
  // node:fs is patched and its named exports synced, as no second
  // volume is at hand.
  const original = fs.renameSync;
  let refused = 0;
  fs.renameSync = (from: fs.PathLike, to: fs.PathLike): void => {
    if (String(to) === installed && String(from).includes(join(cache, "staging"))) {
      refused++;
      throw Object.assign(new Error(`EXDEV: cross-device link not permitted, rename '${String(from)}' -> '${String(to)}'`), { code: "EXDEV" });
    }
    original(from, to);
  };
  syncBuiltinESMExports();
  let lock: Lock;
  try {
    lock = await installAt("1.0.0");
  } finally {
    fs.renameSync = original;
    syncBuiltinESMExports();
  }
  assert.equal(refused, 1, "the move took the copy");
  assertCopies(root, lock, "copied into place");
  assert.deepEqual(leftIn(join(cache, "staging")), [], "[environments-7] no staged tree stays");
  assert.deepEqual(leftIn(join(root, ".spex")).filter((name) => name.includes(".new-")), [], "[environments-7] no copy stays beside the tree");
  assertSealed(lock, "copied into place");
});

test("environments-53: a staged tree copied into place whose move fails leaves no copy beside the tree, the last files standing", async () => {
  const { cache, root, installed, run, installAt, leftIn, assertCopies } = scratchInstalls();
  const first = await installAt("1.0.0");
  const second = await lockAt(root, cache, "1.1.0");
  // Another volume, as above, and the copy's own move into place refused.
  const original = fs.renameSync;
  const refusal = Object.assign(new Error("EACCES: permission denied, rename"), { code: "EACCES" });
  fs.renameSync = (from: fs.PathLike, to: fs.PathLike): void => {
    if (String(to) === installed && String(from).includes(join(cache, "staging"))) {
      throw Object.assign(new Error(`EXDEV: cross-device link not permitted, rename '${String(from)}' -> '${String(to)}'`), { code: "EXDEV" });
    }
    if (String(to) === installed && String(from).includes(".new-")) throw refusal;
    original(from, to);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(run(second), (error: unknown) => error instanceof InstallError && error.cause === refusal);
  } finally {
    fs.renameSync = original;
    syncBuiltinESMExports();
  }
  assert.deepEqual(leftIn(join(root, ".spex")).filter((name) => name.includes(".new-")), [], "[environments-7] no copy stays beside the tree");
  assert.deepEqual(leftIn(join(cache, "staging")), [], "[environments-7] no staged tree stays");
  assert.deepEqual(leftIn(join(cache, "trash")), [], "[environments-7] the last tree is put back");
  assertCopies(root, first, "after a failed move into place");
});

test("environments-53: an obsolete tree whose install record does not read is removed and the install stands, a second environment's files whole", async (t) => {
  const { cache, root, installed, installAt, leftIn, assertSealed, assertCopies } = scratchInstalls();
  const first = await installAt("1.0.0");
  // A second environment installs the same files of 1.0.0.
  const peer = join(dirname(root), "peer-spex");
  await installAt("1.0.0", peer);
  writeFileSync(join(installed, INSTALL_RECORD), JSON.stringify({ format: 1, packages: { "acme/kit": null } }));
  const diagnostics = t.mock.method(console, "error", () => {});
  const second = await installAt("1.1.0");
  assert.deepEqual(leftIn(join(cache, "trash")), [], "[environments-7] no obsolete tree stays");
  assert.equal(diagnostics.mock.callCount(), 0, "[environments-7] nothing failed");
  assertSealed(second, "over an unreadable record");
  assertSealed(first, "the obsolete release's, over an unreadable record");
  assertCopies(peer, first, "the second environment's, over an unreadable record");
});

test("environments-53: an install replaces a former tree of read-only hard links with copies, nothing fetched, a second former tree and the stored files whole", async () => {
  const { home, store, cache, root, run, installAt, leftIn, assertSealed, assertCopies, skillOf } = scratchInstalls();
  const lock = await installAt("1.0.0");
  const peer = join(dirname(root), "peer-spex");
  await installAt("1.0.0", peer);
  // Both trees as an earlier release installed them.
  asFormerTree(root, lock, store);
  asFormerTree(peer, lock, store);
  const record = (at: string): { format: number } => JSON.parse(readFileSync(join(at, ".spex", "packages", INSTALL_RECORD), "utf8")) as { format: number };
  assert.ok(readOnly(skillOf(root)) && statSync(skillOf(root)).nlink > 1, "a former tree's file is a read-only hard link into the store");
  assert.ok(installedPackages(root, lock).has("acme/kit"), "[environments-7] a former tree reads installed");

  // The registry unreachable: the copies come from the store, an
  // executable file's from its former copy apart.
  const unreachable = new RegistryClient({ url: "http://127.0.0.1:9" });
  const report = await run(lock, { registry: unreachable });
  assert.deepEqual(report.installed, ["acme/kit"], "[environments-7] the next install replaces the former tree");
  assert.equal(record(root).format, 2, "[environments-7] under a record of format 2");
  assertCopies(root, lock, "a former tree replaced");
  assertSealed(lock, "a former tree replaced");
  assert.deepEqual(leftIn(join(cache, "trash")), [], "[environments-7] no obsolete tree stays, its read-only links removed");
  assert.equal((await run(lock, { registry: unreachable })).unchanged, true, "[environments-7] a tree of copies is the lock's installed tree");

  // The second former tree stands as it was, reading installed, until
  // its own next install.
  assert.equal(record(peer).format, 1);
  for (const file of lockedFiles(lock)) {
    assert.equal(sha256Hex(readFileSync(join(peer, ".spex", "packages", "acme", "kit", ...file.path.split("/")))), file.sha256, `[environments-7] the second former tree holds ${file.path} with its bytes`);
  }
  assert.ok(installedPackages(peer, lock).has("acme/kit"));
  assert.deepEqual((await run(lock, { registry: unreachable }, peer)).installed, ["acme/kit"]);
  assertCopies(peer, lock, "the second former tree replaced");

  // The collection then removes the former copies apart.
  store.gc(new Set(lockedFiles(lock).map((file) => file.sha256)));
  assert.equal(existsSync(join(home, "store", "x")), false, "[environments-52] the former store/x/ is removed");
  assertSealed(lock, "collected");
});

test("environments-53: a former store/x/ copy that does not match its digest is not taken, and the install fetches the file", async () => {
  const { store, root, run, installAt, assertSealed, assertCopies } = scratchInstalls();
  const lock = await installAt("1.0.0");
  asFormerTree(root, lock, store);
  const executable = lockedFiles(lock).find((file) => file.executable)!;
  const former = formerExecutable(store, executable.sha256);
  chmodSync(former, 0o755);
  writeFileSync(former, "changed behind the store\n");
  registry.script.clearRequests();
  assert.deepEqual((await run(lock)).installed, ["acme/kit"]);
  assert.ok(registry.script.requests.includes(`GET /acme/kit/1.0.0/${executable.path}`), `[environments-7] the file is fetched: ${JSON.stringify(registry.script.requests)}`);
  assertCopies(root, lock, "over a former copy that does not match");
  assertSealed(lock, "over a former copy that does not match");
});

test("environments-53: the migration deleting a clone's former tree of read-only hard links leaves the stored files and a second environment's files whole", async () => {
  const { home, store, root: folder, installAt, assertSealed, assertCopies } = scratchInstalls();
  // The working folder holds its own environment at 1.1.0; the clone
  // holds 1.0.0 in the former layout, read-only hard links into the
  // store; a second environment installs 1.0.0 too.
  const second = await installAt("1.1.0");
  const clone = join(home, "workspace", "acme", "former-spex");
  const first = await installAt("1.0.0", clone);
  asFormerTree(clone, first, store);
  renameSync(join(clone, ".spex", "packages"), join(clone, "packages"));
  const peer = join(home, "workspace", "acme", "peer-spex");
  await installAt("1.0.0", peer);

  const moved = migrateEnvironments(home, [{ key: "acme/kit-spex", clone, own: false, folder, instance: null }]);
  assert.deepEqual(moved, ["acme/kit-spex"], "the migration ran");
  assert.equal(existsSync(join(clone, "packages")), false, "[environments-7] the former tree is deleted");
  assertSealed(first, "after the migration");
  assertSealed(second, "after the migration");
  assertCopies(peer, first, "the second environment's, after the migration");
});

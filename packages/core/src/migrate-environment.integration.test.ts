// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The environment migration through a real core (storage-25): a home
// whose project clones hold their environments, as Spex kept them before
// DR-113, starts and moves each into its working folder — the folder's
// own standing where it holds one, a folder missing on this device
// moving once paired — your own group's keeping its two files, each
// `spex.yaml` naming its placement's instance, the installed trees under
// the root's `.spex/` with no fetch where their record matches, one
// receipt left and the clone's deletion pushed by its next sync.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, lstatSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BUILTIN_PACKAGE_NAME, INSTALL_RECORD, parseLock, parseRequests, publishRelease, RegistryClient, requestsDigest, serializeLock } from "@sublang/spex/environment";
import type { EnvironmentState } from "./protocol.js";
import { bareOf, clonePath, createSpaceHarness, hostKey, ownClone } from "./testing/space-harness.js";
import type { StandinHost } from "./testing/standin-host.js";
import { makeRelease, startStandinRegistry, type StandinRegistry } from "@sublang/spex/testing";

const fixture = createSpaceHarness();
const { scratch, git, gitFolder, addFolder, sleep, startHome, startHost, signIn } = fixture;
test.after(() => fixture.dispose());

type Home = Awaited<ReturnType<typeof startHome>>;

/** The stand-in's default person, and your own group's repository once
 * signed in as them. */
const LOGIN = "ada";
const HOST_OWN = `${LOGIN}/${LOGIN}-spex`;
const FILES = ["spex.yaml", "spex.lock"] as const;

/** An environment as `environment.get` reads it once no operation runs
 * there and `check` holds. */
async function environmentOf(home: Home, key: string, check: (state: EnvironmentState) => boolean, timeoutMs = 60_000): Promise<EnvironmentState> {
  const start = Date.now();
  for (;;) {
    const state = await home.client.expectOk("environment.get", { repository: key });
    if (state.busy === null && check(state)) return state;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for the environment of ${key}: ${JSON.stringify(state)}`);
    await sleep(25);
  }
}

const installed = (state: EnvironmentState, name: string): boolean => state.packages.some((pkg) => pkg.name === name && pkg.installed);

/** Pick a project into your namespace at an instance (space-58): its key
 * there once its sync is done. */
async function pickAt(home: Home, local: string, host: StandinHost, name: string): Promise<string> {
  const key = hostKey(host, `${LOGIN}/${name}-spex`);
  const mark = home.client.mark();
  await home.client.expectOk("space.pick", { repository: local, choice: { kind: "create", instance: host.url, groupId: null, name } });
  const row = await home.client.waitRepository(mark, key, (repository) => repository.sync.phase !== "idle" && repository.sync.phase !== "running", 30_000);
  assert.equal(row.sync.phase, "done", JSON.stringify(row.sync));
  return key;
}

/** `spex.yaml` with its `space` line dropped and `spex.lock` following
 * its bytes: an environment as written before `space` existed. */
function withoutSpace(root: string): { requests: string; lock: string } {
  const requests = readFileSync(join(root, "spex.yaml"), "utf8").replace(/^space: .*\n/m, "");
  const lock = parseLock(readFileSync(join(root, "spex.lock"), "utf8"));
  return { requests, lock: serializeLock({ ...lock, requests: requestsDigest(requests) }) };
}

/** Each file under a folder by its path, as its inode and size. */
function inodes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (relativePath: string): void => {
    for (const name of readdirSync(join(dir, relativePath)).sort()) {
      const path = relativePath ? `${relativePath}/${name}` : name;
      const stat = lstatSync(join(dir, path));
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) out[path] = `${stat.ino}:${stat.size}`;
    }
  };
  if (existsSync(dir)) walk("");
  return out;
}

/** The home's environment receipts under `local/migrations/`. */
function environmentReceipts(home: Home): { steps: { step: string; key: string; outcome: string }[]; complete: boolean; inputs: unknown[] }[] {
  const dir = join(home.dataDir, "local", "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((id) => join(dir, id, "receipt.json")).filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, "utf8")) as { kind?: string; steps: { step: string; key: string; outcome: string }[]; complete: boolean; inputs: unknown[] })
    .filter((receipt) => receipt.kind === "environment");
}

/** A registry's requests for one spec package's files after a mark. */
function fetchesOf(registry: StandinRegistry, from: number, name: string): string[] {
  return registry.script.received.slice(from).filter((request) => request.path.includes(`/${name}/`)).map((request) => request.path);
}

test("storage-25, storage-24: a home whose project clones hold their environments moves each into its working folder at start, the folder's own standing, a missing folder's moving once paired, your own group's staying in its clone, each naming its instance as space, the installed trees moved without a fetch where their record matches and installed from the store where not, one receipt standing that a restart does not repeat, and the clone's deletion pushed by its sync", { timeout: 300_000 }, async (t) => {
  const registry = await startStandinRegistry({ dir: join(scratch, "migrate-registry") });
  t.after(() => registry.close());
  await publishRelease(new RegistryClient({ url: registry.url }), await makeRelease(join(scratch, "releases", "kit"), {
    format: 2, org: "acme", name: "kit", version: "1.0.0", description: "The kit", license: "Apache-2.0",
    artifacts: { "kit-skill": { kind: "skill", language: "en" } },
  }, { "skills/en/kit-skill/SKILL.md": "---\nname: kit-skill\ndescription: The kit skill\n---\n\nUse the kit.\n" }));
  const host = await startHost({ registry });
  let home = await startHome("migrate", { host, project: false });
  t.after(() => home.stop());
  const signing = home.client.mark();
  await signIn(home, host);
  await home.client.waitRepository(signing, HOST_OWN, (repository) => repository.sync.phase === "done", 30_000);

  // Three projects: the first and the second placed at the stand-in, the
  // third local only; the first and the third request a spec package
  // from the registry, its files in the store.
  const one = await pickAt(home, (await addFolder(home, gitFolder("one"))).key, host, "one");
  const two = await pickAt(home, (await addFolder(home, gitFolder("two"))).key, host, "two");
  const three = (await addFolder(home, gitFolder("three"))).key;
  for (const key of [one, two, three]) await environmentOf(home, key, (state) => installed(state, BUILTIN_PACKAGE_NAME));
  for (const key of [one, three]) {
    await home.client.expectOk("environment.request", { repository: key, name: "acme/kit", request: { kind: "registry", version: "^1.0.0" }, wait: true });
  }
  const folders = Object.fromEntries([one, two, three].map((key) => [key, (home.service as unknown as { store: { home: { folderOf(key: string): { path: string } | undefined } } }).store.home.folderOf(key)!.path]));
  const clones = Object.fromEntries([one, two, three].map((key) => [key, clonePath(home.dataDir, key)]));
  const own = ownClone(home.dataDir);
  await home.stop();

  // The former layout: each project's environment and installed trees in
  // its clone — the first's committed there and pushed to the host, as
  // its sync once pushed it — with no space named; the second's folder
  // holding its own environment too; the third's folder missing on this
  // device, its tree's install record matching no lock; your own group's
  // trees under its clone's root.
  const former = (key: string, keepFolder: boolean): void => {
    const folder = folders[key]!;
    const clone = clones[key]!;
    const files = withoutSpace(folder);
    writeFileSync(join(clone, "spex.yaml"), files.requests);
    writeFileSync(join(clone, "spex.lock"), files.lock);
    if (keepFolder) {
      writeFileSync(join(folder, "spex.yaml"), files.requests);
      writeFileSync(join(folder, "spex.lock"), files.lock);
      cpSync(join(folder, ".spex", "packages"), join(clone, "packages"), { recursive: true, verbatimSymlinks: true });
      cpSync(join(folder, ".spex", "skills"), join(clone, "skills"), { recursive: true, verbatimSymlinks: true });
      return;
    }
    for (const file of FILES) rmSync(join(folder, file));
    renameSync(join(folder, ".spex", "packages"), join(clone, "packages"));
    renameSync(join(folder, ".spex", "skills"), join(clone, "skills"));
    rmSync(join(folder, ".spex"), { recursive: true, force: true });
  };
  former(one, false);
  former(two, true);
  former(three, false);
  git(clones[one]!, "add", ...FILES);
  git(clones[one]!, "-c", "commit.gpgsign=false", "commit", "-q", "-m", "The environment, as kept before DR-113");
  git(clones[one]!, "push", "-q", bareOf(host, one), "spex:spex");
  assert.deepEqual(git(bareOf(host, one), "ls-tree", "--name-only", "spex").split("\n").filter((name) => FILES.includes(name as typeof FILES[number])), ["spex.lock", "spex.yaml"], "the host holds the first's environment");
  writeFileSync(join(clones[three]!, "packages", INSTALL_RECORD), JSON.stringify({ format: 1, packages: {} }));
  const away = `${folders[three]!}-away`;
  renameSync(folders[three]!, away);
  renameSync(join(own, ".spex", "packages"), join(own, "packages"));
  renameSync(join(own, ".spex", "skills"), join(own, "skills"));
  rmSync(join(own, ".spex"), { recursive: true, force: true });
  const ownFormer = withoutSpace(own);
  writeFileSync(join(own, "spex.yaml"), ownFormer.requests);
  writeFileSync(join(own, "spex.lock"), ownFormer.lock);
  const ownFiles = [ownFormer.requests, ownFormer.lock];
  assert.equal(parseRequests(ownFiles[0]!).space, undefined, "your own group's environment names no space yet");
  const formerFiles = Object.fromEntries([one, two, three].map((key) => [key, FILES.map((file) => readFileSync(join(clones[key]!, file), "utf8"))]));
  const formerTree = inodes(join(clones[one]!, "packages"));
  const twoTree = inodes(join(folders[two]!, ".spex", "packages"));
  const before = registry.script.received.length;

  // The start migrates.
  home = await startHome("migrate", { dataDir: home.dataDir, host, project: false });
  t.after(() => home.stop());

  // [storage-24] The first: the clone's two files at the folder's root,
  // naming the placement's instance as space, its lock current; its
  // installed tree with its record moved under .spex/ with no fetch; its
  // clone holding none of them.
  const first = await environmentOf(home, one, (state) => installed(state, "acme/kit"));
  assert.equal(first.stale, null, "the moved lock follows its spex.yaml");
  assert.equal(parseRequests(readFileSync(join(folders[one]!, "spex.yaml"), "utf8")).space, host.url);
  assert.equal(readFileSync(join(folders[one]!, "spex.yaml"), "utf8").replace(/^space: .*\n/m, ""), formerFiles[one]![0], "the requests moved as they were, but for space");
  assert.deepEqual(parseLock(readFileSync(join(folders[one]!, "spex.lock"), "utf8")).packages, parseLock(formerFiles[one]![1]!).packages, "the lock moved as it was");
  assert.deepEqual(inodes(join(folders[one]!, ".spex", "packages")), formerTree, "the installed tree moved whole, not installed again");
  assert.deepEqual(fetchesOf(registry, before, "acme/kit"), [], "nothing was fetched");
  assert.equal(readFileSync(join(folders[one]!, ".spex", ".gitignore"), "utf8"), "*\n");
  for (const entry of [...FILES, "packages", "skills", ".spex"]) assert.equal(existsSync(join(clones[one]!, entry)), false, `the first's clone holds no ${entry}`);

  // [storage-24] The second: the folder's own files unchanged but for
  // space, its tree standing; the clone's files and trees deleted.
  const second = await environmentOf(home, two, (state) => installed(state, BUILTIN_PACKAGE_NAME));
  assert.equal(second.stale, null);
  assert.equal(parseRequests(readFileSync(join(folders[two]!, "spex.yaml"), "utf8")).space, host.url);
  assert.equal(readFileSync(join(folders[two]!, "spex.yaml"), "utf8").replace(/^space: .*\n/m, ""), formerFiles[two]![0], "the folder's requests stand but for space");
  assert.deepEqual(inodes(join(folders[two]!, ".spex", "packages")), twoTree, "the folder's installed tree stands");
  for (const entry of [...FILES, "packages", "skills"]) assert.equal(existsSync(join(clones[two]!, entry)), false, `the second's clone holds no ${entry}`);

  // [storage-24] The third, its folder missing here: the clone keeps its
  // files and trees, and the environment has no root on this device.
  assert.deepEqual(FILES.map((file) => readFileSync(join(clones[three]!, file), "utf8")), formerFiles[three], "the third's clone keeps its files");
  assert.ok(existsSync(join(clones[three]!, "packages")), "and its trees");
  const missing = await home.client.expectOk("environment.get", { repository: three });
  assert.deepEqual([missing.pathRoot !== null && existsSync(missing.pathRoot), missing.packages], [false, []]);

  // [storage-24] Your own group's clone keeps its two files, naming the
  // instance its own repository's remote names, its trees under .spex/.
  const ownState = await environmentOf(home, HOST_OWN, (state) => installed(state, BUILTIN_PACKAGE_NAME));
  assert.equal(ownState.stale, null);
  assert.equal(parseRequests(readFileSync(join(own, "spex.yaml"), "utf8")).space, host.url);
  assert.equal(readFileSync(join(own, "spex.yaml"), "utf8").replace(/^space: .*\n/m, ""), ownFiles[0]);
  assert.ok(existsSync(join(own, ".spex", "packages", INSTALL_RECORD)), "its install record under .spex/");
  for (const entry of ["packages", "skills"]) assert.equal(existsSync(join(own, entry)), false, `your own group's clone holds no former ${entry}/`);

  // [storage-24] One receipt of kind environment.
  let receipts = environmentReceipts(home);
  assert.equal(receipts.length, 1, "one receipt");
  assert.equal(receipts[0]!.complete, true);
  assert.deepEqual(receipts[0]!.steps.map((entry) => [entry.step, entry.key, entry.outcome]).sort(), [["own", HOST_OWN, "own"], ["project", one, "moved"], ["project", two, "folder"]].sort());

  // [storage-24] A restart repeats nothing.
  const settled = [folders[one]!, folders[two]!, own].map((root) => FILES.map((file) => readFileSync(join(root, file), "utf8")));
  const receiptBefore = JSON.stringify(receipts);
  await home.stop();
  home = await startHome("migrate", { dataDir: home.dataDir, host, project: false });
  t.after(() => home.stop());
  await environmentOf(home, one, (state) => installed(state, "acme/kit"));
  assert.equal(JSON.stringify(environmentReceipts(home)), receiptBefore, "the receipt is as it was");
  assert.deepEqual([folders[one]!, folders[two]!, own].map((root) => FILES.map((file) => readFileSync(join(root, file), "utf8"))), settled, "no file moved again");
  assert.ok(existsSync(join(clones[three]!, "spex.yaml")), "the third's clone still keeps its files");

  // [storage-24] The third's folder paired: its move runs then, its
  // tree, whose record matches no lock, deleted and the lock installed
  // from the store with no fetch.
  const pairing = registry.script.received.length;
  await home.client.expectOk("project.rebind", { projectId: three, path: away });
  const third = await environmentOf(home, three, (state) => installed(state, "acme/kit") && installed(state, BUILTIN_PACKAGE_NAME));
  assert.equal(third.stale, null);
  assert.deepEqual(FILES.map((file) => readFileSync(join(away, file), "utf8")), formerFiles[three], "the clone's files moved, local only, naming no space");
  for (const entry of [...FILES, "packages", "skills"]) assert.equal(existsSync(join(clones[three]!, entry)), false, `the third's clone holds no ${entry}`);
  assert.ok(existsSync(join(away, ".spex", "packages", "acme", "kit", "skills", "en", "kit-skill", "SKILL.md")), "installed under .spex/");
  assert.deepEqual(fetchesOf(registry, pairing, "acme/kit"), [], "from the store");
  receipts = environmentReceipts(home);
  assert.equal(receipts.length, 1, "still one receipt");
  assert.ok(receipts[0]!.steps.some((entry) => entry.step === "project" && entry.key === three && entry.outcome === "moved"), "the pairing's move is recorded");

  // [storage-24] The first's sync pushes the deletion from its clone.
  const synced = await home.client.settle("space.sync", { repository: one }, 30_000);
  assert.equal(synced.sync.phase, "done", JSON.stringify(synced.sync));
  assert.deepEqual(git(bareOf(host, one), "ls-tree", "--name-only", "spex").split("\n").filter((name) => FILES.includes(name as typeof FILES[number])), [], "the host's spex holds neither file");
});

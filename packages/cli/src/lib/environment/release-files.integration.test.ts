// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Compiler-owned files at the folder/release boundary (environments-1):
// real folder reads, the CLI preview, a registry round trip and Git
// resolution omit them; immutable archives and existing locks keep them.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { fileVersion } from "../files.js";
import { makeRelease, startStandinRegistry, type StandinRegistry } from "../../testing/index.js";
import { ContentStore, gitSource, install, packFiles, parseRequests, publishRelease, readRelease, RegistryClient, resolve, sha256Hex, unpackRelease, writeLock, type Lock } from "./index.js";

const scratches: string[] = [];
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "spex-release-files-"));
  scratches.push(dir);
  return dir;
};
const NAME = "acme/ship-kit";
const BASE = "playbooks/en/ship/";
const CLI = fileURLToPath(new URL("../../cli.js", import.meta.url));
const kept: Record<string, string> = {
  [`${BASE}ship.md`]: "# Ship\n",
  [`${BASE}ship.ts`]: "export default {};\n",
  [`${BASE}ship.registry.ts`]: "export { default } from './ship';\n",
  [`${BASE}ship.registry.mjs`]: "export default { id: 'ship' };\n",
  [`${BASE}ship.playbook/ship.fsm.ts`]: "export const machine = {};\n",
  [`${BASE}ship.playbook/ship.playbook.ts`]: "export default {};\n",
  [`${BASE}ship.playbook/ship.gears.md`]: "# Gears\n",
  [`${BASE}ship.playbook/ship.gears.raw.md`]: "# Raw gears\n",
  [`${BASE}ship.playbook/ship.gears.opt1.md`]: "# Optimized gears\n",
  [`${BASE}ship.playbook/custom.test.ts`]: "export {};\n",
  [`${BASE}ship.playbook/other.prompt-contract.test.ts`]: "export {};\n",
  [`${BASE}other.fsm.bundle.mjs`]: "export {};\n",
  [`${BASE}support/ship.fsm.bundle.mjs`]: "export {};\n",
  [`${BASE}support/ship.prompt-contract.test.ts`]: "export {};\n",
  "skills/en/help/SKILL.md": "---\nname: help\ndescription: Help\n---\n",
  "skills/en/help/ship.playbook/ship.prompt-contract.test.ts": "export {};\n",
  "skills/en/help/ship.fsm.bundle.mjs": "export {};\n",
  "applets/view/index.html": "<!doctype html><title>View</title>\n",
  "applets/view/ship.playbook/ship.prompt-contract.test.ts": "export {};\n",
  "applets/view/ship.fsm.bundle.mjs": "export {};\n",
};
const generated: Record<string, string> = {
  [`${BASE}ship.fsm.bundle.mjs`]: "export const machine = {};\n",
  ...Object.fromEntries(["fsm.coverage", "fsm.introspect", "gears-fsm", "prompt-contract"].map((check) =>
    [`${BASE}ship.playbook/ship.${check}.test.ts`, 'import "./.slc-verify/verify.js";\n'])),
};
const compilerSupport = {
  [`${BASE}.slc/builds/0001/source.md`]: "# History\n",
  [`${BASE}ship.playbook/.slc/latest`]: "0001\n",
  [`${BASE}ship.playbook/.slc-verify/verify.js`]: "export {};\n",
};
const expected = ["meta.yaml", ...Object.keys(kept)].sort();
let registry: StandinRegistry;
let client: RegistryClient;

before(async () => {
  registry = await startStandinRegistry({ dir: scratch() });
  client = new RegistryClient({ url: registry.url });
});
after(async () => {
  await registry.close();
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
});

async function fixture(dir: string): Promise<string> {
  return makeRelease(dir, {
    format: 2, org: "acme", name: "ship-kit", version: "1.0.0",
    description: "Ship kit", license: "Apache-2.0",
    artifacts: { ship: { kind: "playbook", language: "en" }, help: { kind: "skill", language: "en" }, view: { kind: "applet" } },
  }, { ...kept, ...generated, ...compilerSupport });
}

function filesUnder(dir: string): Record<string, string> {
  return Object.fromEntries(readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = join(entry.parentPath, entry.name);
      return [relative(dir, file).split("\\").join("/"), readFileSync(file, "utf8")];
    }));
}

/** Resolve and install on a fresh home, preserving the lock's bytes. */
async function installed(text: string, changeLock?: (lock: Lock) => void): Promise<{ root: string; lock: Lock }> {
  const root = scratch();
  const home = scratch();
  writeFileSync(join(root, "spex.yaml"), text);
  const cache = join(home, "cache");
  const git = gitSource(cache);
  const result = await resolve({ requests: parseRequests(text), requestsText: text, registry: client, pathRoot: root, git });
  assert.ok(result.ok);
  changeLock?.(result.lock);
  await writeLock(join(root, "spex.lock"), result.lock);
  const before = readFileSync(join(root, "spex.lock"), "utf8");
  const report = await install({ root, lock: result.lock, lockVersion: fileVersion(join(root, "spex.lock")), store: new ContentStore(home), cache, registry: client, git, pathRoot: root });
  assert.deepEqual(report.installed, [NAME]);
  assert.equal(readFileSync(join(root, "spex.lock"), "utf8"), before, "[environments-3] installing leaves the lock unchanged");
  return { root: join(root, ".spex/packages/acme/ship-kit"), lock: result.lock };
}

test("environments-19/24: folder reads, CLI previews and registry installs omit only the compiler-owned paths", async () => {
  const root = scratch();
  const folder = await fixture(join(root, "spex-packages/acme/ship-kit"));
  const before = filesUnder(folder);
  const release = await readRelease(folder);
  assert.deepEqual(release.files.map((file) => file.path), expected, "[environments-1] exact release file set");

  // The path source is read in place, with no compiler outputs deleted.
  const text = `format: 1\nregistry: ${registry.url}\npackages:\n  ${NAME}: { path: spex-packages/acme/ship-kit }\n`;
  writeFileSync(join(root, "spex.yaml"), text);
  const cache = join(scratch(), "cache");
  const git = gitSource(cache);
  const path = await resolve({ requests: parseRequests(text), requestsText: text, registry: client, pathRoot: root, git });
  assert.ok(path.ok);
  assert.deepEqual(path.lock.packages[NAME]!.files, [], "[environments-3] path sources lock no files");
  await writeLock(join(root, "spex.lock"), path.lock);
  await install({ root, lock: path.lock, lockVersion: fileVersion(join(root, "spex.lock")), store: new ContentStore(scratch()), cache, registry: client, git, pathRoot: root });
  assert.deepEqual(filesUnder(folder), before, "[environments-7] a path source stays intact");

  registry.script.clearRequests();
  const preview = await promisify(execFile)(process.execPath, [CLI, "publish", NAME, "--dry-run"], { cwd: root, env: { ...process.env, SPEX_HOME: scratch() } });
  assert.deepEqual(preview.stdout.split("\n").filter((line) => line.startsWith("  ")).map((line) => line.slice(2)), expected);
  assert.deepEqual(registry.script.requests.filter((request) => request.startsWith("PUT ")), [], "[environments-10] the preview uploads nothing");

  await publishRelease(client, folder);
  const archive = unpackRelease(await client.archive(NAME, "1.0.0"), "ship-kit");
  assert.deepEqual(archive.issues, []);
  assert.deepEqual(archive.files.map((file) => file.path), expected);
  const second = await installed(`format: 1\npackages:\n  ${NAME}: { version: 1.0.0 }\n`);
  assert.deepEqual(Object.keys(filesUnder(second.root)).sort(), expected);
  assert.deepEqual(filesUnder(folder), before, "publishing leaves the author's files intact");
});

test("environments-21: new Git resolutions exclude compiler-owned paths while existing locks and archives retain their files", async (t) => {
  const folder = await fixture(scratch());
  const raw = filesUnder(folder);
  const legacyPaths = [...expected, ...Object.keys(generated)].sort();
  const legacyFiles = legacyPaths.map((path) => ({ path, executable: false, data: Buffer.from(raw[path]!) }));
  const archive = packFiles("ship-kit", legacyFiles);
  const unpacked = unpackRelease(archive, "ship-kit");
  assert.deepEqual(unpacked.issues, []);
  assert.deepEqual(unpacked.files.map((file) => file.path), legacyPaths, "[environments-7] an immutable archive is read whole");

  const git = (...args: string[]): Buffer => execFileSync("git", ["-C", folder, ...args]);
  git("init", "--quiet");
  git("add", ".");
  git("-c", "user.name=Spex Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Release fixture");
  const text = `format: 1\npackages:\n  ${NAME}: { git: ${JSON.stringify(folder)}, rev: HEAD }\n`;
  await t.test("a new Git resolution and install select the filtered files", async () => {
    const fresh = await installed(text);
    assert.deepEqual(fresh.lock.packages[NAME]!.files.map((file) => file.path), expected);
    assert.deepEqual(Object.keys(filesUnder(fresh.root)).sort(), expected);
  });
  await t.test("an existing Git lock installs every previously selected file", async () => {
    const legacy = await installed(text, (lock) => {
      lock.packages[NAME]!.files = legacyFiles.map((file) => ({ path: file.path, executable: file.executable, sha256: sha256Hex(file.data) }));
    });
    assert.deepEqual(Object.keys(filesUnder(legacy.root)).sort(), legacyPaths);
    for (const file of legacy.lock.packages[NAME]!.files) {
      assert.equal(sha256Hex(readFileSync(join(legacy.root, file.path))), file.sha256);
    }
  });
  await t.test("a registry release published by an older reader installs whole", async () => {
    await client.publish(NAME, "1.1.0", packFiles("ship-kit", legacyFiles.map((file) => file.path === "meta.yaml"
      ? { ...file, data: Buffer.from(raw["meta.yaml"]!.replace("version: 1.0.0", "version: 1.1.0")) } : file)));
    const legacy = await installed(`format: 1\npackages:\n  ${NAME}: { version: 1.1.0 }\n`);
    assert.deepEqual(Object.keys(filesUnder(legacy.root)).sort(), legacyPaths);
    for (const file of Object.keys(generated)) assert.ok(existsSync(join(legacy.root, file)));
  });
});

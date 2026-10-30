// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An install with no engine (cli-14, environments-7): the command line
// installs files and prepares nothing, so a playbook artifact's installed
// folder and a path source's folder hold exactly the release's files, no
// engine link beside them; the same install given an engine hands it
// each playbook folder, so the engine alone decides.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { fileVersion } from "../files.js";
import { makeRelease, startStandinRegistry, type ReleaseFixture, type StandinRegistry } from "../../testing/index.js";
import {
  ContentStore,
  gitSource,
  ENGINE_LINKS_EXCLUDE,
  install,
  parseRequests,
  publishRelease,
  RegistryClient,
  resolve,
  writeLock,
  type InstallEngine,
} from "./index.js";

const scratches: string[] = [];
const scratch = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratches.push(dir);
  return dir;
};

let registry: StandinRegistry;
let client: RegistryClient;

before(async () => {
  registry = await startStandinRegistry({ dir: scratch("spex-cli-standin-") });
  client = new RegistryClient({ url: registry.url });
  const dir = join(scratch("spex-cli-release-"), "release");
  await makeRelease(dir, manifestOf("acme/ship-kit", "1.0.0", { ship: { kind: "playbook", language: "en" } }), playbookFiles("ship"));
  await publishRelease(client, dir);
});

after(async () => {
  await registry.close();
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
});

function manifestOf(name: string, version: string, artifacts: Record<string, unknown>): Record<string, unknown> {
  const [org, pkg] = name.split("/");
  return { format: 2, org, name: pkg, version, description: `The ${name} spec package`, license: "Apache-2.0", artifacts };
}

function playbookFiles(id: string): Record<string, ReleaseFixture> {
  return {
    [`playbooks/en/${id}/${id}.md`]: `# ${id}\n\nRoles:\n\n- Worker\n`,
    [`playbooks/en/${id}/${id}.registry.mjs`]: `export default { id: ${JSON.stringify(id)} };\n`,
  };
}

/** Every file under a folder by its path there, `/`-separated. */
function filesUnder(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    out[relative(dir, path).split("\\").join("/")] = readFileSync(path, "utf8");
  }
  return out;
}

interface Environment {
  clone: string;
  workingFolder: string;
  base: Omit<Parameters<typeof install>[0], "lockVersion" | "engine">;
}

/** An install expecting `spex.lock` at the version it stands at now. */
const installAsOnDisk = (env: Environment, engine?: InstallEngine): ReturnType<typeof install> =>
  install({ ...env.base, ...(engine ? { engine } : {}), lockVersion: fileVersion(join(env.clone, "spex.lock")) });

/** A home and a Git working folder whose environment requests `acme/ship-kit`
 * from the stand-in and `acme/local-kit` by path, resolved and locked. */
async function environment(): Promise<Environment> {
  const home = scratch("spex-cli-home-");
  const clone = join(home, "workspace", "acme", "ship-spex");
  const workingFolder = scratch("spex-cli-wf-");
  execFileSync("git", ["init", "--quiet", workingFolder]);
  await makeRelease(join(workingFolder, "tools", "local"), manifestOf("acme/local-kit", "0.1.0", { walk: { kind: "playbook", language: "en" } }), playbookFiles("walk"));
  const text = `format: 1\npackages:\n  acme/ship-kit: {"version":"^1.0.0"}\n  acme/local-kit: {"path":"tools/local"}\n`;
  mkdirSync(clone, { recursive: true });
  writeFileSync(join(clone, "spex.yaml"), text);
  const cache = join(home, "cache");
  const git = gitSource(cache);
  const result = await resolve({ requests: parseRequests(text), requestsText: text, registry: client, pathRoot: workingFolder, git });
  if (!result.ok) assert.fail(`resolution failed: ${JSON.stringify(result.conflicts)}`);
  await writeLock(join(clone, "spex.lock"), result.lock);
  return {
    clone, workingFolder,
    base: { cloneDir: clone, lock: result.lock, store: new ContentStore(home), cache, registry: client, git, pathRoot: workingFolder },
  };
}

test("cli-14: an install with no engine places the release's files and prepares or links nothing", async (t) => {
  const env = await environment();
  // A link or an exclude tried without an engine is logged, not thrown.
  const logged = t.mock.method(console, "error", () => {});
  const local = join(env.workingFolder, "tools", "local");
  const localBefore = filesUnder(local);

  const report = await installAsOnDisk(env);
  assert.deepEqual(report.installed, ["acme/ship-kit"]);
  assert.deepEqual(report.engineKept, []);

  const installed = join(env.clone, "packages", "acme", "ship-kit");
  const ship = join(installed, "playbooks", "en", "ship");
  assert.deepEqual(filesUnder(ship), Object.fromEntries(Object.entries(playbookFiles("ship")).map(([path, text]) => [path.slice("playbooks/en/ship/".length), text])),
    "the installed playbook folder holds the release's files alone");
  assert.equal(existsSync(join(ship, "node_modules")), false, "no engine link in the installed playbook");
  assert.deepEqual(filesUnder(local), localBefore, "the path source is left as it is");
  assert.equal(existsSync(join(local, "playbooks", "en", "walk", "node_modules")), false, "no engine link in the path source");
  const exclude = join(env.workingFolder, ".git", "info", "exclude");
  assert.ok(!existsSync(exclude) || !readFileSync(exclude, "utf8").includes(ENGINE_LINKS_EXCLUDE), "no engine links excluded where none is made");

  // Installed already: an install finding the tree in place prepares nothing either.
  const again = await installAsOnDisk(env);
  assert.equal(again.unchanged, true);
  assert.deepEqual(again.engineKept, []);
  assert.equal(existsSync(join(ship, "node_modules")), false);
  assert.deepEqual(logged.mock.calls.map((call) => call.arguments.join(" ")), [], "nothing was tried and logged");
});

test("cli-14: the same install given an engine hands it every playbook folder", async () => {
  const env = await environment();
  const prepared: string[] = [];
  const linked: string[] = [];
  const engine: InstallEngine = {
    // Prepared where the install stages it, before the swap.
    prepare: async (folder, id) => { prepared.push(`${folder.split(/[\\/]/).slice(-5).join("/")}#${id}`); return null; },
    link: (folder) => { linked.push(relative(env.workingFolder, folder).split("\\").join("/")); },
  };
  const report = await installAsOnDisk(env, engine);
  assert.deepEqual(report.installed, ["acme/ship-kit"]);
  assert.deepEqual(prepared, ["acme/ship-kit/playbooks/en/ship#ship"]);
  assert.deepEqual(linked, ["tools/local/playbooks/en/walk"]);
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The package commands of the packed CLI (cli-15, cli-16, cli-18):
// `@sublang/spex`,
// packed with `npm pack` and installed into a scratch prefix, runs as a
// child process on a scratch home whose `home.yaml` names the library's
// stand-in registry as the default instance, in scratch Git working
// folders, with no core running. The stand-in runs in this process, so
// every run is asynchronous. What each command prints is a project's
// Packages tab's words (DR-172), the registry named by its descriptor's
// display name (cli-22).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { ContentStore, parseLock, publishRelease, readPublishableRelease, RegistryClient, requestsDigest, seedBuiltinPackage, serializeLock, type RegistrySourceLock, type Resolution } from "./lib/environment/index.js";
import { fileCredentialStore } from "./lib/git-host.js";
import { makeRelease, startStandinRegistry, type ReleaseFixture, type StandinRegistry } from "./testing/index.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SCRATCH = realpathSync(mkdtempSync(join(tmpdir(), "spex-package-commands-")));
const HOME = join(SCRATCH, "home");
/** A home signed in at the stand-in, which is not its default instance. */
const PUBLISHER = join(SCRATCH, "publisher");
const WORK = join(SCRATCH, "work");
/** The app token the stand-in accepts for the org `acme`. */
const TOKEN = `spex-at-${randomUUID()}`;

let CLI = "";
let registry: StandinRegistry;
let client: RegistryClient;
let host = "";
/** The stand-in registry's display name, as its descriptor gives it. */
const REGISTRY = "Stand-in Registry";
/** A pattern matching a text exactly. */
const exactly = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
/** Everything every run printed. */
const printed: string[] = [];

function npm(args: string[], cwd: string): string {
  const npmPath = process.env.npm_execpath;
  const result = npmPath && npmPath.endsWith(".js")
    ? spawnSync(process.execPath, [npmPath, ...args], { cwd, encoding: "utf8" })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

interface Ran { code: number | null; stdout: string; stderr: string }

/** The packed CLI in `cwd` on the scratch home, or the one named. */
function spex(cwd: string, ...args: string[]): Promise<Ran> {
  return spexAt(HOME, cwd, ...args);
}

function spexAt(home: string, cwd: string, ...args: string[]): Promise<Ran> {
  return spexWith({}, home, cwd, ...args);
}

/** The packed CLI with variables of its environment set beside the home. */
function spexWith(vars: NodeJS.ProcessEnv, home: string, cwd: string, ...args: string[]): Promise<Ran> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...vars, SPEX_HOME: home };
  delete env.SPEX_SERVER_URL;
  delete env.SPEX_HOST_URL;
  const proc = spawn(process.execPath, [CLI, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (data) => { stdout += String(data); });
  proc.stderr.on("data", (data) => { stderr += String(data); });
  return new Promise((resolveRun, rejectRun) => {
    proc.on("error", rejectRun);
    proc.on("close", (code) => {
      printed.push(stdout, stderr);
      resolveRun({ code, stdout, stderr });
    });
  });
}

/** A run that succeeded, with what it printed. */
async function ok(cwd: string, ...args: string[]): Promise<string> {
  return okAt(HOME, cwd, ...args);
}

async function okAt(home: string, cwd: string, ...args: string[]): Promise<string> {
  const ran = await spexAt(home, cwd, ...args);
  assert.equal(ran.code, 0, `spex ${args.join(" ")}: ${ran.stdout}${ran.stderr}`);
  return ran.stdout;
}

/** A scratch Git working folder. */
function workingFolder(dir: string): string {
  mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "--quiet", dir]);
  return dir;
}

/** Every path below a folder with its bytes, `.git` aside: what a
 * refusal leaves as it stood. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(dir)) return out;
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(dir, relative)).sort()) {
      if (!relative && entry === ".git") continue;
      const path = relative ? `${relative}/${entry}` : entry;
      const stat = lstatSync(join(dir, path));
      if (stat.isDirectory()) { out[`${path}/`] = ""; walk(path); }
      else out[path] = stat.isFile() ? readFileSync(join(dir, path), "base64") : "other";
    }
  };
  walk("");
  return out;
}

/** Every file below a folder with its bytes, its modification time and
 * its inode: what a run that rewrites nothing leaves as it stood. */
function stamps(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(snapshot(dir))) {
    if (path.endsWith("/")) continue;
    const stat = statSync(join(dir, ...path.split("/")));
    out[path] = `${bytes}:${stat.mtimeMs}:${stat.ino}`;
  }
  return out;
}

function manifestOf(name: string, version: string, artifacts: Record<string, unknown>, dependencies?: Record<string, string>): Record<string, unknown> {
  const [org, pkg] = name.split("/");
  return { format: 2, org, name: pkg, version, description: `The ${name} spec package`, license: "Apache-2.0", ...(dependencies ? { dependencies } : {}), artifacts };
}

function skillFiles(id: string, version: string): Record<string, ReleaseFixture> {
  return { [`skills/en/${id}/SKILL.md`]: `---\nname: ${id}\ndescription: The ${id} skill at ${version}\n---\n\nDo ${id}.\n` };
}

async function publish(name: string, version: string, artifacts: Record<string, unknown>, files: Record<string, ReleaseFixture>, dependencies?: Record<string, string>): Promise<void> {
  const dir = join(SCRATCH, "releases", `${name.replace("/", "-")}-${version}`);
  await makeRelease(dir, manifestOf(name, version, artifacts, dependencies), files);
  await publishRelease(client, dir);
}

const readYaml = (file: string): any => parseYaml(readFileSync(file, "utf8"));
const skill = { kind: "skill", language: "en" };

before(async () => {
  registry = await startStandinRegistry({ dir: join(SCRATCH, "registry") });
  client = new RegistryClient({ url: registry.url });
  host = new URL(registry.url).host;
  await publish("demo/tool", "1.0.0", { tool: skill }, skillFiles("tool", "1.0.0"));
  await publish("demo/base", "1.0.0", { base: { kind: "spec", language: "en" } }, {
    "specs/en/base.md": "# base: Base\n\n## Intent\n\nThe base.\n\n## External Behavior\n\n### base-1\n\nThe base shall stand.\n\n## Verification\n\n### base-2\n\nWhen read, the suite shall assert it stands [[base-1](#base-1)].\n",
  });
  for (const version of ["1.0.0", "1.2.0", "1.3.0", "2.0.0-beta.1"]) {
    await publish("demo/other", version, { other: skill }, skillFiles("other", version), { "demo/base": "^1.0.0" });
  }
  // The newest listed release that is no prerelease and not yanked is
  // 1.2.0.
  registry.script.yank("demo/other", "1.3.0");
  // A suppressed release is passed over too: 1.2.1 is never picked.
  await publish("demo/other", "1.2.1", { other: skill }, skillFiles("other", "1.2.1"), { "demo/base": "^1.0.0" });
  registry.script.suppress("demo/other", "1.2.1");

  // The home names the stand-in as its default instance (storage-2).
  mkdirSync(HOME, { recursive: true });
  writeFileSync(join(HOME, "home.yaml"), stringifyYaml({ format: 2, device: randomUUID(), origin: registry.url, instances: [], own: "tester", folders: [] }));

  // The published artifact: packed once, installed into a scratch prefix,
  // its dependencies from the npm cache where it holds them.
  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", SCRATCH], ROOT))[0];
  assert.ok(packed.files.some((file: { path: string }) => file.path === "dist/commands/settle.js"));
  const prefix = join(SCRATCH, "prefix");
  npm(["install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline", join(SCRATCH, packed.filename)], SCRATCH);
  CLI = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@sublang/spex/dist/cli.js");
  assert.ok(existsSync(CLI), CLI);
  workingFolder(WORK);
  writeFileSync(join(WORK, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
});

after(async () => {
  await registry?.close();
  rmSync(SCRATCH, { recursive: true, force: true });
});

test("cli-15: --help prints the usage, add and scaffold their lines and options, --version the installed version, each writing nothing", async () => {
  const spec = readFileSync(resolve(ROOT, "..", "..", "specs", "packages", "cli.md"), "utf8").replace(/\r\n/g, "\n");
  const usage = /```text\n([\s\S]*?)\n```/.exec(spec.slice(spec.indexOf("#### cli-21")))?.[1];
  assert.ok(usage, "cli-21 holds the usage block");
  const installed = (JSON.parse(readFileSync(join(CLI, "..", "..", "package.json"), "utf8")) as { version: string }).version;
  const dir = join(SCRATCH, "asked");
  const home = join(SCRATCH, "asked-home");
  workingFolder(dir);
  const before = snapshot(dir);
  const asked = async (...args: string[]): Promise<string> => {
    const ran = await spexAt(home, dir, ...args);
    assert.equal(ran.code, 0, `[cli-21] spex ${args.join(" ")} exits 0: ${ran.stderr}`);
    assert.equal(ran.stderr, "", `[cli-21] spex ${args.join(" ")} prints nothing on standard error`);
    return ran.stdout;
  };
  assert.equal(await asked("--help"), `${usage}\n`, "[cli-21] spex --help prints the usage as cli-21 writes it");
  const add = await asked("add", "--help");
  for (const line of usage.split("\n").filter((line) => line.startsWith("  add "))) assert.ok(add.split("\n").includes(line), `[cli-21] add's help holds ${JSON.stringify(line)}`);
  assert.match(add, /^ {2}--path <folder> {2,}\S/m, "[cli-21] add's help lists --path");
  assert.match(add, /^ {2}-h, --help {2,}\S/m, "[cli-21] add's help lists --help");
  const scaffold = await asked("scaffold", "--help");
  for (const line of usage.split("\n").filter((row) => row.startsWith("  scaffold "))) assert.ok(scaffold.split("\n").includes(line), `[cli-21] scaffold's help holds ${JSON.stringify(line)}`);
  for (const option of ["--update", "--lang <code>", "--agents <names>", "-h, --help"]) {
    assert.ok(scaffold.split("\n").some((row) => row.startsWith(`  ${option}  `)), `[cli-21] scaffold's help lists ${option}`);
  }
  assert.equal(await asked("--version"), `spex ${installed}\n`, "[cli-21] spex --version prints the installed version");
  assert.deepEqual(snapshot(dir), before, "[cli-21] asking writes nothing in the folder");
  assert.equal(existsSync(home), false, "[cli-21] asking makes no home");
});

test("cli-15: add writes the package into spex.yaml, installs under .spex/ and places its skills; each refusal writes nothing", async () => {
  const added = await ok(WORK, "add", "demo/tool@^1.0.0");
  // The file is made naming the default instance (cli-2).
  const requests = readYaml(join(WORK, "spex.yaml"));
  assert.deepEqual(requests, { format: 1, space: registry.url, packages: { "demo/tool": { version: "^1.0.0" } } }, "[cli-2] the requirement written into the existing spex.yaml, its space kept");
  assert.match(added, /^Added demo\/tool 1\.0\.0\n {2}tool {2}\.agents\/skills, \.claude\/skills$/m, "[cli-2] the package added, with its version and where its skill went");
  assert.equal(readFileSync(join(WORK, ".spex", ".gitignore"), "utf8"), "*\n", "[cli-2] .spex/ ignores everything in it");
  assert.match(readFileSync(join(WORK, ".spex", "packages", "demo", "tool", "skills", "en", "tool", "SKILL.md"), "utf8"), /at 1\.0\.0/);
  for (const folder of [".claude", ".agents"]) assert.match(readFileSync(join(WORK, folder, "skills", "tool", "SKILL.md"), "utf8"), /name: tool/, `[cli-2] exported into ${folder}/skills`);

  const other = await ok(WORK, "add", "demo/other");
  assert.equal(readYaml(join(WORK, "spex.yaml")).packages["demo/other"].version, "^1.2.0", "[cli-2] a caret at the newest listed release, no prerelease, none yanked or suppressed");
  assert.match(other, /^Added demo\/other 1\.2\.0$/m);
  assert.match(other, /^Added demo\/base 1\.0\.0 for demo\/other$/m, "[cli-2] what came beside it, and what for");
  const lock = readYaml(join(WORK, "spex.lock"));
  assert.deepEqual(Object.keys(lock.packages).sort(), ["demo/base", "demo/other", "demo/tool"]);
  assert.deepEqual(lock.packages["demo/base"]["required-by"], ["demo/other"]);
  assert.equal(lock.packages["demo/tool"].source.registry, registry.url);
  assert.ok(existsSync(join(WORK, ".claude", "skills", "demo-base", "base.md")), "[cli-2] the spec exported as a skill");
  // Git sees the two files and never the installed tree or the exports.
  const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: WORK, encoding: "utf8" });
  assert.deepEqual(status.trim().split("\n").sort(), ["?? spex.lock", "?? spex.yaml"], "[cli-2] Git sees spex.yaml and spex.lock alone");

  const refusals: [string, string[], RegExp][] = [
    ["a name that is not <org>/<pkg>", ["add", "Demo/tool"], /^spex add: "Demo\/tool" is not a package name — use <org>\/<pkg>, /m],
    ["a malformed version", ["add", "demo/tool@1.x"], /^spex add: "1\.x" is not a version — use 1\.2\.3, \^1\.2\.3 or ~1\.2\.3$/m],
    ["a version and a path together", ["add", "demo/tool@^1.0.0", "--path", "kits/tool"], /^spex add: a version and --path together — give one$/m],
    ["a path leading out of the root", ["add", "demo/tool", "--path", "../elsewhere"], /^spex add: --path \.\.\/elsewhere leads out of this project folder, .+ — use a folder inside it$/m],
    ["a path to no folder", ["add", "demo/tool", "--path", "kits/none"], /^spex add: --path kits\/none: no folder there — give the folder holding the package's meta\.yaml$/m],
    ["a folder holding no meta.yaml", ["add", "demo/tool", "--path", "kits/empty"], /^spex add: --path kits\/empty has no meta\.yaml, so it is no package — spex new demo\/tool starts one$/m],
    ["a folder holding another package", ["add", "demo/tool", "--path", "kits/wrong"], /^spex add: --path kits\/wrong holds demo\/other, not demo\/tool — spex add demo\/other --path kits\/wrong$/m],
    // A spex.yaml naming no registry reads with its Space's sign-in.
    ["a package the registry does not list", ["add", "demo/missing"], new RegExp(`^spex add: demo/missing: not at ${REGISTRY}, or private — spex login --space ${exactly(registry.url)}, then retry$`, "m")],
  ];
  // Each refusal, where spex.yaml stands and where none does yet; the
  // folders given by --path stand in this one alone.
  mkdirSync(join(WORK, "kits", "empty"), { recursive: true });
  await makeRelease(join(WORK, "kits", "wrong"), manifestOf("demo/other", "1.0.0", { other: skill }), skillFiles("other", "1.0.0"));
  const here = new Set(["a package the registry does not list", "a folder holding no meta.yaml", "a folder holding another package"]);
  const fresh = workingFolder(join(SCRATCH, "fresh"));
  for (const at of [WORK, fresh]) {
    for (const [label, args, cause] of refusals) {
      if (at === fresh && here.has(label)) continue;
      const before = snapshot(at);
      const ran = await spex(at, ...args);
      assert.equal(ran.code, 1, `${label}: ${ran.stdout}${ran.stderr}`);
      assert.match(ran.stderr, cause, `[cli-2] ${label} is refused naming the rule`);
      assert.deepEqual(snapshot(at), before, `[cli-2] ${label} writes nothing`);
    }
  }
  assert.deepEqual(snapshot(fresh), {}, "[cli-2] no spex.yaml made by a refusal");
});

test("cli-15: list heads with the folder and the registry's name, then what is added, installed and placed for the agents; search lists newest first", async () => {
  const listed = await ok(WORK, "list");
  assert.equal(listed, [
    `Folder    ${WORK}`,
    `Registry  ${REGISTRY}`,
    "Added",
    "  demo/other  ^1.2.0",
    "  demo/tool   ^1.0.0",
    "Installed",
    "  demo/base   1.0.0  from the registry  for demo/other  installed",
    "  demo/other  1.2.0  from the registry                  installed",
    "  demo/tool   1.0.0  from the registry                  installed",
    "Skills for agents",
    "  demo-base  .agents/skills, .claude/skills",
    "  other      .agents/skills, .claude/skills",
    "  tool       .agents/skills, .claude/skills",
    "",
  ].join("\n"), "[cli-6] the folder, the registry by its display name, each package added with its version, each installed with its version, source, what it came for and its state, each skill with its folders, and no last line while spex.lock stands");
  assert.ok(!listed.includes(host), "[cli-22] the registry named, never by its host while its descriptor names it");

  // A folder holding neither file: one line (cli-6).
  const empty = workingFolder(join(SCRATCH, "empty"));
  assert.equal(await ok(empty, "list"), `No packages in ${empty} yet — spex add <org>/<pkg>\n`, "[cli-6] the empty folder's one line");
  assert.deepEqual(snapshot(empty), {}, "[cli-6] list writes nothing");

  const found = await ok(WORK, "search", "other");
  assert.match(found, /^demo\/other {2}The demo\/other spec package\n {2}2\.0\.0-beta\.1, 1\.2\.0, 1\.0\.0$/m, "[cli-7] the match with its versions, newest first");
});

test("cli-15: install from the committed files alone writes no spex.lock and installs byte for byte; again it rewrites nothing", async () => {
  const second = workingFolder(join(SCRATCH, "second"));
  copyFileSync(join(WORK, "spex.yaml"), join(second, "spex.yaml"));
  copyFileSync(join(WORK, "spex.lock"), join(second, "spex.lock"));
  const lockBytes = readFileSync(join(second, "spex.lock"), "utf8");
  registry.script.clearRequests();
  const installed = await ok(second, "install");
  assert.deepEqual(registry.script.requests.filter((request) => /^GET \/api\/v1\/packages\/[^/]+\/[^/]+$/.test(request)), [], "[cli-4] no version index read: nothing resolved");
  assert.equal(readFileSync(join(second, "spex.lock"), "utf8"), lockBytes, "[cli-4] the lock as committed");
  assert.match(installed, /^Installed demo\/tool 1\.0\.0\n {2}tool {2}\.agents\/skills, \.claude\/skills$/m, "[cli-4] each package installed with its version, and where its skill went");
  assert.deepEqual(snapshot(join(second, ".spex", "packages")), snapshot(join(WORK, ".spex", "packages")), "[cli-4] byte-identical .spex/packages/");
  for (const folder of [".claude", ".agents"]) {
    assert.deepEqual(snapshot(join(second, folder, "skills")), snapshot(join(WORK, folder, "skills")), `[cli-4] byte-identical exports in ${folder}/skills`);
  }

  const before = { files: stamps(second) };
  const again = await ok(second, "install");
  assert.match(again, /^Already installed demo\/tool 1\.0\.0$/m, "[cli-4] installed already");
  const after = stamps(second);
  // Every file, the generated skills and the export manifests included,
  // keeps its bytes, its modification time and its inode.
  for (const path of Object.keys(before.files)) assert.equal(after[path], before.files[path], `[cli-4] ${path} is not rewritten`);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before.files).sort(), "[cli-4] no file made or removed");

  // With spex.yaml alone, the lock is resolved first.
  const third = workingFolder(join(SCRATCH, "third"));
  copyFileSync(join(WORK, "spex.yaml"), join(third, "spex.yaml"));
  const resolved = await ok(third, "install");
  assert.match(resolved, /^Wrote spex\.lock$/m, "[cli-4] the lock written first where it is missing");
  assert.equal(readFileSync(join(third, "spex.lock"), "utf8"), lockBytes, "[cli-4] the same lock");
  assert.deepEqual(snapshot(join(third, ".spex", "packages")), snapshot(join(WORK, ".spex", "packages")));

  // With neither, refused naming the folder and spex add.
  const fourth = workingFolder(join(SCRATCH, "fourth"));
  const refused = await spex(fourth, "install");
  assert.equal(refused.code, 1);
  assert.equal(refused.stderr, `spex install: no spex.yaml in ${fourth} — spex add <org>/<pkg>\n`, "[cli-4] refused naming the folder and spex add");
  assert.deepEqual(snapshot(fourth), {}, "[cli-4] nothing written");
});

test("cli-15: update takes a newer release, naming both versions, and then says it is up to date", async () => {
  await publish("demo/tool", "1.1.0", { tool: skill }, skillFiles("tool", "1.1.0"));
  const moved = await ok(WORK, "update");
  assert.match(moved, /^Updated demo\/tool 1\.0\.0 → 1\.1\.0$/m, "[cli-5] both versions");
  assert.equal(readYaml(join(WORK, "spex.lock")).packages["demo/tool"].source.version, "1.1.0");
  assert.match(readFileSync(join(WORK, ".claude", "skills", "tool", "SKILL.md"), "utf8"), /at 1\.1\.0/, "[cli-5] installed and exported");
  assert.equal((await ok(WORK, "update")).trim(), "Up to date", "[cli-5] nothing moved");

  const found = await ok(WORK, "search", "tool");
  assert.match(found, /^demo\/tool {2}The demo\/tool spec package\n {2}1\.1\.0, 1\.0\.0$/m, "[cli-7] newest first");
});

test("cli-15: remove takes the package out of spex.yaml, the files and the skills; one not added, and the built-in, are refused", async () => {
  const removed = await ok(WORK, "remove", "demo/other");
  assert.match(removed, /^Removed demo\/other 1\.2\.0$/m, "[cli-3] the loss");
  assert.match(removed, /^Removed demo\/base 1\.0\.0$/m);
  assert.deepEqual(Object.keys(readYaml(join(WORK, "spex.yaml")).packages), ["demo/tool"], "[cli-3] the request dropped");
  assert.equal(existsSync(join(WORK, ".spex", "packages", "demo", "other")), false, "[cli-3] the files gone");
  assert.equal(existsSync(join(WORK, ".claude", "skills", "other")), false, "[cli-3] the export gone");
  assert.equal(existsSync(join(WORK, ".agents", "skills", "demo-base")), false);

  const before = snapshot(WORK);
  const refused = await spex(WORK, "rm", "demo/other");
  assert.equal(refused.code, 1);
  assert.equal(refused.stderr, "spex rm: demo/other is not in spex.yaml — spex list shows what is added\n", "[cli-3] a package spex.yaml does not add is refused");
  assert.deepEqual(snapshot(WORK), before, "[cli-3] nothing written");
  // The built-in playbooks come with Spex, never a package to remove.
  const builtin = await spex(WORK, "remove", "sublang/playbooks");
  assert.equal(builtin.code, 1);
  assert.equal(builtin.stderr, "spex remove: sublang/playbooks comes with Spex\n", "[cli-3] the built-in refused");
  assert.deepEqual(snapshot(WORK), before, "[cli-3] nothing written");
});

test("cli-15: the root is found from a subfolder, and at the Git top level of a folder without spex.yaml", async () => {
  const deeper = join(WORK, "src", "deeper");
  mkdirSync(deeper, { recursive: true });
  assert.ok((await ok(deeper, "list")).startsWith(`Folder    ${WORK}\n`), "[cli-1] the nearest folder holding spex.yaml");

  const fifth = workingFolder(join(SCRATCH, "fifth"));
  const sub = join(fifth, "app", "lib");
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(fifth, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await ok(sub, "add", "demo/tool");
  assert.ok(existsSync(join(fifth, "spex.yaml")), "[cli-1] made at the Git top level");
  assert.equal(existsSync(join(sub, "spex.yaml")), false);
  assert.ok(existsSync(join(fifth, ".spex", "packages", "demo", "tool")));
  // The home holds nothing but what the commands wrote.
  assert.deepEqual(readdirSync(HOME).sort(), ["cache", "home.yaml", "store"], "[cli-1] no clone, lease or record of the home");
  assert.deepEqual(readdirSync(join(HOME, "cache", "registries")), [`@${host.replace(":", "_")}.json`], "[cli-22] the registry's name kept as fetched metadata in cache/");

  // A spex.yaml below the Git top level is the nearest, and its exports
  // are kept out of the work tree's Git all the same.
  const mono = workingFolder(join(SCRATCH, "mono"));
  const app = join(mono, "packages", "app");
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await ok(join(app, "src"), "add", "demo/tool@^1.0.0");
  assert.ok((await ok(join(app, "src"), "list")).startsWith(`Folder    ${app}\n`), "[cli-1] the nearest spex.yaml, below the Git top level");
  assert.equal(existsSync(join(mono, "spex.yaml")), false);
  assert.ok(existsSync(join(app, ".claude", "skills", "tool", "SKILL.md")));
  const monoStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: mono, encoding: "utf8" });
  assert.deepEqual(monoStatus.trim().split("\n").sort(), ["?? packages/app/spex.lock", "?? packages/app/spex.yaml"], "[cli-1] Git sees spex.yaml and spex.lock alone");

  // Outside any Git work tree and below no spex.yaml, the current folder.
  const loose = join(SCRATCH, "loose", "here");
  mkdirSync(loose, { recursive: true });
  writeFileSync(join(loose, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await ok(loose, "add", "demo/tool@^1.0.0");
  assert.ok(existsSync(join(loose, "spex.yaml")), "[cli-1] else the current folder");
  assert.equal(existsSync(join(SCRATCH, "loose", "spex.yaml")), false);

  // Never the home's own folders, nor the user's home folder, whose
  // agent folders are the user-level ones.
  const home = join(SCRATCH, "refusing-home");
  mkdirSync(home, { recursive: true });
  copyFileSync(join(HOME, "home.yaml"), join(home, "home.yaml"));
  const clone = workingFolder(join(home, "workspace", "tester", "tester-spex"));
  writeFileSync(join(clone, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  const user = join(SCRATCH, "user");
  mkdirSync(join(user, ".claude", "skills", "mine"), { recursive: true });
  writeFileSync(join(user, ".claude", "skills", "mine", "SKILL.md"), "---\nname: mine\ndescription: Mine\n---\n");
  const userVars = { HOME: user, USERPROFILE: user };
  for (const [label, vars, at, cause] of [
    ["a clone of the home", {}, join(clone, "sub"), /lies in the Spex home .+ — run spex in a project folder$/m],
    ["the home itself", {}, home, /lies in the Spex home .+ — run spex in a project folder$/m],
    ["the user's home folder", userVars, user, /is your home folder, where spex manages no packages — run spex in a project folder$/m],
  ] as [string, NodeJS.ProcessEnv, string, RegExp][]) {
    mkdirSync(at, { recursive: true });
    const before = { home: snapshot(home), user: snapshot(user) };
    const ran = await spexWith(vars, home, at, "add", "demo/tool@^1.0.0");
    assert.equal(ran.code, 1, `${label}: ${ran.stdout}${ran.stderr}`);
    assert.match(ran.stderr, cause, `[cli-1] ${label} is no root`);
    assert.deepEqual({ home: snapshot(home), user: snapshot(user) }, before, `[cli-1] ${label}: nothing written`);
  }
  // A seat's project below the home's projects/ is a working folder.
  const seat = workingFolder(join(home, "projects", `@${host.replace(":", "_")}`, "tester", "app"));
  writeFileSync(join(seat, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await ok(seat, "add", "demo/tool@^1.0.0");
  assert.ok(existsSync(join(seat, "spex.lock")), "[cli-1] a seat's project is a root");
});

test("cli-15: a Git source is shown with no network remote named, and a source changed at one version is an update", async () => {
  // A network remote is never printed, as a request, a source or Git's
  // failure: it may lie under an instance's Git origin (DR-120).
  const dir = workingFolder(join(SCRATCH, "git-source"));
  const remote = "http://127.0.0.1:1/acme/kit-spex.git";
  writeFileSync(join(dir, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages:\n  acme/kit:\n    git: ${remote}\n    rev: main\n`);
  const listed = await ok(dir, "list");
  assert.match(listed, /^ {2}acme\/kit {2}a Git remote at main$/m, "[cli-6] the Git package, its remote unnamed");
  const failed = await spex(dir, "install");
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /^spex install: acme\/kit: a Git remote answered with an error — check that Git on this computer can read it, then retry$/m, `[cli-13] the failure named: ${failed.stderr}`);
  for (const text of [listed, failed.stdout, failed.stderr]) assert.ok(!text.includes("127.0.0.1:1") && !text.includes("kit-spex"), `[cli-13] no remote named: ${text}`);

  // A registry package moved to a path source at the same version is a
  // move of its source, not a package gained.
  const moved = workingFolder(join(SCRATCH, "source-move"));
  writeFileSync(join(moved, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await ok(moved, "add", "demo/tool@~1.0.0");
  await makeRelease(join(moved, "vendor", "tool"), manifestOf("demo/tool", "1.0.0", { tool: skill }), skillFiles("tool", "1.0.0"));
  const changed = await ok(moved, "add", "demo/tool", "--path", "vendor/tool");
  assert.match(changed, /^Updated demo\/tool 1\.0\.0, now from folder vendor\/tool$/m, `[cli-2] the source changed: ${changed}`);
  assert.doesNotMatch(changed, /^Added /m);
  // Its folder's dependencies change at one version: no version moved.
  const meta = join(moved, "vendor", "tool", "meta.yaml");
  writeFileSync(meta, stringifyYaml(manifestOf("demo/tool", "1.0.0", { tool: skill }, { "demo/base": "^1.0.0" })));
  const updated = await ok(moved, "update");
  assert.match(updated, /^Added demo\/base 1\.0\.0 for demo\/tool$/m);
  assert.doesNotMatch(updated, /^Updated demo\/tool/m, "[cli-5] only a version changed is an update");
});

test("cli-15: list says the lock is missing or stale, and a skill a folder of yours keeps out", async () => {
  const dir = workingFolder(join(SCRATCH, "list-states"));
  writeFileSync(join(dir, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages:\n  demo/tool:\n    version: ^1.0.0\n`);
  assert.match(await ok(dir, "list"), /^Added\n {2}demo\/tool {2}\^1\.0\.0\nNot installed yet — spex install\n$/m, "[cli-6] the lock missing, last with the command that installs it");
  mkdirSync(join(dir, ".claude", "skills", "tool"), { recursive: true });
  writeFileSync(join(dir, ".claude", "skills", "tool", "SKILL.md"), "---\nname: tool\ndescription: Mine\n---\n");
  await ok(dir, "install");
  const listed = await ok(dir, "list");
  assert.match(listed, /^Skills for agents\n {2}tool {2}\.agents\/skills, not \.claude\/skills \(yours is there\)$/m, "[cli-6] the skill's folders, and the one yours keeps it out of");
  writeFileSync(join(dir, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages:\n  demo/tool:\n    version: ^1.0.0\n  demo/base:\n    version: ^1.0.0\n`);
  const stale = await ok(dir, "list");
  assert.match(stale, /^Added\n {2}demo\/base {2}\^1\.0\.0\n {2}demo\/tool {2}\^1\.0\.0$/m);
  assert.ok(stale.endsWith("\nspex.yaml changed — spex update\n"), `[cli-6] the lock stale, last with the command that updates it: ${stale}`);
  // A lock that stands, its files not installed here, as after a clone.
  const cloned = workingFolder(join(SCRATCH, "list-cloned"));
  copyFileSync(join(WORK, "spex.yaml"), join(cloned, "spex.yaml"));
  copyFileSync(join(WORK, "spex.lock"), join(cloned, "spex.lock"));
  const unplaced = await ok(cloned, "list");
  assert.match(unplaced, /^ {2}demo\/tool +1\.\d\.\d +from the registry +not installed$/m);
  assert.ok(unplaced.endsWith("\nNot installed yet — spex install\n"), `[cli-6] the files not installed, last with the command that installs them: ${unplaced}`);
  // A folder package whose meta.yaml no longer reads: fix it first.
  const kit = workingFolder(join(SCRATCH, "list-kit"));
  writeFileSync(join(kit, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await makeRelease(join(kit, "kit"), manifestOf("acme/kit", "0.1.0", { kit: skill }), skillFiles("kit", "0.1.0"));
  await ok(kit, "add", "acme/kit", "--path", "kit");
  writeFileSync(join(kit, "kit", "meta.yaml"), stringifyYaml(manifestOf("acme/kit", "0.2.0", { kit: skill })));
  assert.ok((await ok(kit, "list")).endsWith("\nacme/kit changed in kit: version 0.1.0 is now 0.2.0 — spex update\n"), "[cli-6] a folder package changed, in the Packages tab's words");
  writeFileSync(join(kit, "kit", "meta.yaml"), stringifyYaml(manifestOf("acme/kit", "0.2.0", {})));
  const broken = await ok(kit, "list");
  assert.match(broken, /\nacme\/kit changed in kit: its meta\.yaml cannot be read: .+ — fix kit\/meta\.yaml, then spex update\n$/, `[cli-6] a meta.yaml that cannot be read is fixed first: ${broken}`);
  assert.doesNotMatch(broken, /release/, "[cli-6] no word of the library's own");
});

test("cli-15: the built-in spec package a lock holds installs from this device's seed", async () => {
  // The home's store and cache hold the app's seed of sublang/playbooks;
  // no registry serves it (environments-7, environments-11).
  const home = join(SCRATCH, "seeded-home");
  mkdirSync(home, { recursive: true });
  copyFileSync(join(HOME, "home.yaml"), join(home, "home.yaml"));
  const staged = join(SCRATCH, "builtins", "18.1.0");
  await makeRelease(staged, manifestOf("sublang/playbooks", "18.1.0", { review: skill }), skillFiles("review", "18.1.0"));
  await seedBuiltinPackage(new ContentStore(home), join(home, "cache"), { name: "sublang/playbooks", version: "18.1.0", dir: staged });
  const dir = workingFolder(join(SCRATCH, "paired"));
  writeFileSync(join(dir, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages:\n  sublang/playbooks:\n    version: ^18.1.0\n`);
  const added = await okAt(home, dir, "add", "demo/tool@^1.0.0");
  assert.match(added, /^Added sublang\/playbooks 18\.1\.0$/m, "[cli-2] resolved from the seed");
  assert.match(added, /^Added demo\/tool 1\.\d\.\d$/m);
  const second = workingFolder(join(SCRATCH, "paired-clone"));
  copyFileSync(join(dir, "spex.yaml"), join(second, "spex.yaml"));
  copyFileSync(join(dir, "spex.lock"), join(second, "spex.lock"));
  assert.match(await okAt(home, second, "install"), /^Installed sublang\/playbooks 18\.1\.0$/m, "[cli-4] installed from the seed");
  assert.deepEqual(snapshot(join(second, ".spex", "packages")), snapshot(join(dir, ".spex", "packages")));
  assert.match(await okAt(home, second, "list"), /^ {2}sublang\/playbooks +18\.1\.0 +built in +installed$/m, "[cli-6] the built-in row reads built in");
});

test("cli-15: a lock recording the app's built-in at a checksum no registry serves installs the rest and marks the built-in built in", async () => {
  // A real resolution of demo/tool, made in a folder of its own.
  const made = workingFolder(join(SCRATCH, "app-made"));
  writeFileSync(join(made, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await ok(made, "add", "demo/tool@^1.0.0");
  const tool = parseLock(readFileSync(join(made, "spex.lock"), "utf8")).packages["demo/tool"]!;
  const toolVersion = (tool.source as RegistrySourceLock).version.replace(/\./g, "\\.");
  // The files as the app wrote them on a device of its own: the lock
  // records sublang/playbooks resolved from that device's seed, at the
  // checksum of the archive it packed there, which no registry serves;
  // this home holds no seed (environments-7, environments-11).
  const digest = (text: string): string => createHash("sha256").update(text).digest("hex");
  const locked = (name: string, version: string, id: string, paths: string[]): Resolution => ({
    source: { registry: registry.url, version, checksum: digest(`the archive of ${name} ${version} packed elsewhere`) },
    requiredBy: [],
    artifacts: { [id]: { language: "en", fallback: false } },
    files: ["meta.yaml", ...paths].map((path) => ({ path, sha256: digest(`${name} ${path}`), executable: false })),
    exports: { [id]: id },
  });
  const builtin = locked("sublang/playbooks", "18.1.0", "review", ["playbooks/en/review/review.md", "playbooks/en/review/review.playbook/review.registry.js"]);
  // spex.yaml requesting each at a caret of its locked version, and the
  // lock of it.
  const write = (dir: string, packages: Record<string, Resolution>): string => {
    const requests = Object.keys(packages).sort().map((name) => `  ${name}:\n    version: ^${(packages[name]!.source as RegistrySourceLock).version}\n`);
    const text = `format: 1\nspace: ${registry.url}\npackages:\n${requests.join("")}`;
    writeFileSync(join(dir, "spex.yaml"), text);
    writeFileSync(join(dir, "spex.lock"), serializeLock({ format: 1, requests: requestsDigest(text), packages }));
    return readFileSync(join(dir, "spex.lock"), "utf8");
  };
  const dir = workingFolder(join(SCRATCH, "app-written"));
  const lockBytes = write(dir, { "demo/tool": tool, "sublang/playbooks": builtin });

  const installed = await ok(dir, "install");
  assert.match(installed, /^sublang\/playbooks 18\.1\.0 {2}built in — the Spex app installs it when it opens this project$/m, "[cli-4] the built-in marked built in, the Spex app's to install");
  assert.match(installed, new RegExp(`^Installed demo/tool ${toolVersion}\n {2}tool {2}\\.agents/skills, \\.claude/skills$`, "m"), "[cli-4] the rest installed and placed");
  assert.doesNotMatch(installed, /not placed|yours is there/, "[cli-4] the exports cover the installed packages alone");
  assert.equal(readFileSync(join(dir, "spex.lock"), "utf8"), lockBytes, "[cli-4] the lock as written");
  assert.ok(existsSync(join(dir, ".spex", "packages", "demo", "tool", "skills", "en", "tool", "SKILL.md")), "[cli-4] demo/tool under .spex/packages/");
  assert.equal(existsSync(join(dir, ".spex", "packages", "sublang")), false, "[cli-4] the built-in left out");
  for (const folder of [".claude", ".agents"]) assert.ok(existsSync(join(dir, folder, "skills", "tool", "SKILL.md")), `[cli-4] demo/tool exported into ${folder}/skills`);

  const listed = await ok(dir, "list");
  assert.match(listed, /^ {2}sublang\/playbooks +18\.1\.0 +built in +not installed$/m, "[cli-6] the built-in read built in and not installed");
  assert.match(listed, new RegExp(`^  demo/tool +${toolVersion} +from the registry +installed$`, "m"), "[cli-6] the rest installed");
  assert.match(listed, /^ {2}review +not placed: the Spex app installs it$/m, "[cli-6] the built-in's skill not placed, and why");
  assert.doesNotMatch(listed, /Not installed yet/, "[cli-6] the built-in waits for the Spex app, nothing to install");

  // Again, it installs as it stands: the built-in named, nothing rewritten.
  const before = stamps(dir);
  assert.match(await ok(dir, "install"), /^sublang\/playbooks 18\.1\.0 {2}built in — the Spex app installs it when it opens this project$/m, "[cli-4] named again");
  assert.deepEqual(stamps(dir), before, "[cli-4] a second install rewrites no file");

  // Any other spec package nothing serves fails the install naming it,
  // installing nothing (environments-7).
  const failing = workingFolder(join(SCRATCH, "app-written-gone"));
  const gone = locked("demo/gone", "1.0.0", "gone", ["skills/en/gone/SKILL.md"]);
  write(failing, { "demo/gone": gone, "demo/tool": tool, "sublang/playbooks": builtin });
  const refused = await spex(failing, "install");
  assert.equal(refused.code, 1, `${refused.stdout}${refused.stderr}`);
  assert.equal(refused.stderr, `spex install: demo/gone: not at ${REGISTRY}, or private — spex login --space ${registry.url}, then retry\n`, "[cli-4] the ordinary package nothing serves named");
  assert.equal(existsSync(join(failing, ".spex", "packages")), false, "[cli-4] nothing installed");
});

const APACHE = "\n                                 Apache License\n                           Version 2.0, January 2004\n";
const GREET_MD = '---\nname: greet\ndescription: "Greets: whoever asks"\n---\n\n# Greet\n\nSay hello.\n';
const SPEC_MD = "<!-- SPDX-License-Identifier: Apache-2.0 -->\n\n# hello: Hello\n\n## Intent\n\nThis package states the greeting.\nIt has two lines.\n\nA second paragraph.\n\n## External Behavior\n\n### hello-1\n\nThe greeter shall greet.\n\n## Verification\n\n### hello-2\n\nWhen run, the suite shall assert it greets [[hello-1](#hello-1)].\n";
let projects = 0;
/** The folder cli-16 published acme/hello from. */
let publishedFrom = "";

/** A scratch Git working folder holding a LICENSE, a skill folder under
 * `.claude/skills/` with a nested executable script, and a spec file. A
 * release names each artifact once, so the skill beside the spec
 * `hello` is `greet`. */
function project(license: string | null = APACHE): string {
  const dir = workingFolder(join(SCRATCH, `project-${++projects}`));
  mkdirSync(join(dir, ".claude/skills/greet/scripts"), { recursive: true });
  mkdirSync(join(dir, "specs"), { recursive: true });
  if (license !== null) writeFileSync(join(dir, "LICENSE"), license);
  writeFileSync(join(dir, ".claude/skills/greet/SKILL.md"), GREET_MD);
  writeFileSync(join(dir, ".claude/skills/greet/scripts/wave.sh"), "#!/bin/sh\necho hello\n");
  chmodSync(join(dir, ".claude/skills/greet/scripts/wave.sh"), 0o755);
  writeFileSync(join(dir, "specs/hello.md"), SPEC_MD);
  return dir;
}

/** The skills Spex's export lists in an agent folder. */
const exportsIn = (dir: string, folder: string): string[] => {
  const file = join(dir, ...folder.split("/"), ".spex-exports.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).skills : [];
};

test("cli-15: new makes spex-packages/<org>/<pkg>/, adds it by path and places its skills; --move leaves the skill placed there by Spex", async () => {
  const dir = project();
  const made = await ok(dir, "new", "acme/hello", "--skill", ".claude/skills/greet", "--spec", "specs/hello.md");
  const folder = join(dir, "spex-packages", "acme", "hello");
  const release = await readPublishableRelease(folder);
  assert.deepEqual(release.manifest, {
    format: 2, org: "acme", name: "hello", version: "0.1.0",
    // The first skill's description; the license read from the Apache
    // LICENSE past its leading whitespace.
    description: "Greets: whoever asks", license: "Apache-2.0", dependencies: {},
    artifacts: { greet: { kind: "skill", language: "en", requires: [] }, hello: { kind: "spec", language: "en", requires: [] } },
  }, "[cli-8] the manifest");
  assert.deepEqual(release.files.map((file) => file.path), [
    "LICENSE", "README.md", "meta.yaml", "skills/en/greet/SKILL.md", "skills/en/greet/scripts/wave.sh", "specs/en/hello.md",
  ], "[cli-8] manifest, README, LICENSE, skill and spec");
  if (process.platform !== "win32") assert.equal(release.files.find((file) => file.path.endsWith("wave.sh"))?.executable, true, "[cli-8] the script stays executable");
  assert.equal(readFileSync(join(folder, "README.md"), "utf8"), "# acme/hello\n\nGreets: whoever asks\n");
  assert.equal(readFileSync(join(folder, "LICENSE"), "utf8"), APACHE);
  assert.equal(readFileSync(join(folder, "specs", "en", "hello.md"), "utf8"), SPEC_MD);
  // Requested by path in a spex.yaml made naming the default instance,
  // locked, and installed in place: nothing copied under .spex/packages/.
  assert.deepEqual(readYaml(join(dir, "spex.yaml")), { format: 1, registry: "https://spex.sublang.ai", packages: { "acme/hello": { path: "spex-packages/acme/hello" } } }, "[cli-8] the path request");
  const lock = readYaml(join(dir, "spex.lock"));
  assert.deepEqual(lock.packages["acme/hello"].source, { path: "spex-packages/acme/hello", version: "0.1.0", dependencies: {}, requires: {} });
  assert.equal(existsSync(join(dir, ".spex", "packages", "acme", "hello")), false, "[cli-8] a path source copies nothing");
  // The skill reaches the agents at once: .agents/skills/ by Spex's
  // export; .claude/skills/greet/ is the reader's own folder, copied
  // from, which the export keeps out of and says so.
  assert.equal(readFileSync(join(dir, ".agents", "skills", "greet", "SKILL.md"), "utf8"), GREET_MD, "[cli-8] exported into .agents/skills/greet/");
  assert.ok(exportsIn(dir, ".agents/skills").includes("greet"));
  assert.equal(readFileSync(join(dir, ".claude", "skills", "greet", "SKILL.md"), "utf8"), GREET_MD, "[cli-8] .claude/skills/greet/ holds the skill");
  assert.ok(!exportsIn(dir, ".claude/skills").includes("greet"));
  assert.match(made, /^ {2}greet +\.agents\/skills, not \.claude\/skills \(yours is there\)$/m, "[cli-8] the skill placed, and kept out of the reader's own folder");
  assert.ok(existsSync(join(dir, ".claude", "skills", "acme-hello", "hello.md")), "[cli-8] the spec exported as acme-hello");
  // It ends naming the folder and the two publish commands.
  assert.match(made, /^Made spex-packages\/acme\/hello\/ for acme\/hello \(skill greet, spec hello\)\.$/m, "[cli-8] the folder");
  assert.match(made, /^Next: edit spex-packages\/acme\/hello\/, then\n {2}spex publish acme\/hello --dry-run\n {2}spex publish acme\/hello$/m, "[cli-8] the next steps");

  // --move: the original folder now stands placed there by Spex.
  const moved = project();
  const movedOut = await ok(moved, "new", "acme/greeting", "--skill", ".claude/skills/greet", "--move");
  assert.ok(exportsIn(moved, ".claude/skills").includes("greet"), "[cli-8] .claude/skills/greet/ is Spex's export now");
  assert.equal(readFileSync(join(moved, ".claude", "skills", "greet", "SKILL.md"), "utf8"), GREET_MD);
  assert.ok(existsSync(join(moved, "spex-packages", "acme", "greeting", "skills", "en", "greet", "scripts", "wave.sh")));
  assert.match(movedOut, /^The skill greet now stands in \.claude\/skills\/greet\/, placed there by Spex\.$/m, "[cli-8] the moved-skill note");
  assert.doesNotMatch(movedOut, /yours is there/);

  // A spec alone: the description from its Intent; MIT past a byte
  // order mark; no LICENSE where the root has none.
  const mit = project("﻿\n  MIT License\n\nCopyright (c) 2026\n");
  await ok(mit, "new", "acme/hello", "--spec", "specs/hello.md");
  const spec = (await readPublishableRelease(join(mit, "spex-packages", "acme", "hello"))).manifest;
  assert.equal(spec.description, "This package states the greeting. It has two lines.");
  assert.equal(spec.license, "MIT");
  const bare = project(null);
  await ok(bare, "new", "acme/notes", "--skill", ".claude/skills/greet", "--description", 'Notes "quoted" #1: done', "--license", "MIT", "--language", "zh-Hans");
  const notes = await readPublishableRelease(join(bare, "spex-packages", "acme", "notes"));
  assert.equal(notes.manifest.description, 'Notes "quoted" #1: done');
  assert.equal(notes.manifest.license, "MIT");
  assert.deepEqual(notes.manifest.artifacts, { greet: { kind: "skill", language: "zh-Hans", requires: [] } });
  assert.equal(existsSync(join(bare, "spex-packages", "acme", "notes", "LICENSE")), false);
  // No LICENSE and no --license: Apache-2.0; --language places the spec;
  // no staging folder stays beside the package.
  const plain = project(null);
  await ok(plain, "new", "acme/hello", "--spec", "specs/hello.md", "--language", "zh-Hans");
  const placed = await readPublishableRelease(join(plain, "spex-packages", "acme", "hello"));
  assert.equal(placed.manifest.license, "Apache-2.0", "[cli-8] Apache-2.0 where the root holds no LICENSE");
  assert.ok(placed.files.some((file) => file.path === "specs/zh-Hans/hello.md"), "[cli-8] the spec at specs/<language>/<pkg>.md");
  assert.deepEqual(readdirSync(join(plain, "spex-packages", "acme")), ["hello"], "[cli-8] no staging folder left");
  if (process.platform !== "win32") {
    assert.equal(lstatSync(join(moved, "spex-packages", "acme", "greeting", "skills", "en", "greet", "scripts", "wave.sh")).mode & 0o100, 0o100, "[cli-8] a moved script stays executable");
  }
});

test("cli-15: new refuses each rule before writing anything", async () => {
  const dir = project();
  const skillAt = (name: string, text: string): void => {
    mkdirSync(join(dir, ".claude/skills", name), { recursive: true });
    writeFileSync(join(dir, ".claude/skills", name, "SKILL.md"), text);
  };
  mkdirSync(join(dir, ".claude/skills/empty"));
  writeFileSync(join(dir, ".claude/skills/empty/README.md"), "No skill here.\n");
  skillAt("spaced", "---\nname: Release Notes\ndescription: Spaced\n---\n");
  skillAt("twin", "---\nname: greet\ndescription: Twin\n---\n");
  skillAt("undescribed", "---\nname: undescribed\n---\n");
  skillAt("hello", "---\nname: hello\ndescription: Same id as the spec\n---\n");
  skillAt("marked", "\uFEFF---\nname: marked\ndescription: Marked\n---\n");
  skillAt("colon", "---\nname: colon\ndescription: Greets: whoever asks\n---\n");
  writeFileSync(join(dir, "specs/other.md"), "# other\n\n## Intent\n\nOther.\n");
  writeFileSync(join(dir, "specs/plain.md"), "# plain\n\nNo intent heading.\n");
  const links = process.platform !== "win32";
  if (links) {
    skillAt("linked", "---\nname: linked\ndescription: Linked\n---\n");
    symlinkSync("../greet/SKILL.md", join(dir, ".claude/skills/linked/other.md"));
    skillAt("piped", "---\nname: piped\ndescription: Piped\n---\n");
    execFileSync("mkfifo", [join(dir, ".claude/skills/piped/pipe")]);
  }
  // A skill at the root holds the destination itself.
  writeFileSync(join(dir, "SKILL.md"), "---\nname: rooted\ndescription: Rooted\n---\n");
  const skill = [".claude/skills/greet"];
  const cases: [string, string[], RegExp][] = [
    ["a name of capitals", ["acme/Hello", "--skill", ...skill], /<org>\/<pkg>.*lowercase/],
    ["a name of one part", ["hello", "--skill", ...skill], /<org>\/<pkg>/],
    ["a name part past 64 characters", [`acme/${"a".repeat(65)}`, "--skill", ...skill], /at most 64 characters/],
    ["no artifact", ["acme/hello"], /at least one skill or spec/],
    ["a skill folder that is not there", ["acme/hello", "--skill", ".claude/skills/absent"], /is not a folder holding a SKILL\.md/],
    ["a skill folder without SKILL.md", ["acme/hello", "--skill", ".claude/skills/empty"], /no SKILL\.md/],
    ["a SKILL.md behind a byte order mark", ["acme/hello", "--skill", ".claude/skills/marked"], /byte order mark/],
    ["a SKILL.md frontmatter that is no YAML", ["acme/hello", "--skill", ".claude/skills/colon"], /holds ": " unquoted/],
    ["a SKILL.md name that is no Agent Skills name", ["acme/hello", "--skill", ".claude/skills/spaced"], /names no skill/],
    ["two skills of one id", ["acme/hello", "--skill", ...skill, "--skill", ".claude/skills/twin"], /two skills are named greet/],
    ["a skill of the spec's id", ["acme/hello", "--skill", ".claude/skills/hello", "--spec", "specs/hello.md"], /takes the spec's name hello/],
    ["a spec of another basename", ["acme/hello", "--spec", "specs/other.md"], /must be named hello\.md/],
    ["no description from any source", ["acme/plain", "--skill", ".claude/skills/undescribed", "--spec", "specs/plain.md"], /--description/],
    ["a moved skill folder holding the destination", ["acme/hello", "--skill", ".", "--move"], /cannot move \.: it holds spex-packages\/acme\/hello\//],
    ...(links ? [
      ["a skill folder holding a link", ["acme/hello", "--skill", ".claude/skills/linked"], /holds a link at other\.md/],
      ["a skill folder holding a special file", ["acme/hello", "--skill", ".claude/skills/piped"], /holds a special file at pipe/],
    ] as [string, string[], RegExp][] : []),
  ];
  for (const [label, args, cause] of cases) {
    const before = snapshot(dir);
    const ran = await spex(dir, "new", ...args);
    assert.equal(ran.code, 1, `${label}: ${ran.stdout}${ran.stderr}`);
    assert.match(ran.stderr, cause, `[cli-8] ${label}`);
    assert.match(ran.stderr, /^spex new: [a-z"-]/, `[cli-13] ${label} is a phrase in the CLI's voice`);
    assert.equal(ran.stdout, "", label);
    assert.deepEqual(snapshot(dir), before, `[cli-8] ${label} writes nothing`);
    assert.equal(existsSync(join(dir, "spex-packages")), false, `${label} makes no spex-packages/`);
  }
  // An existing destination is refused and left as it was.
  mkdirSync(join(dir, "spex-packages/acme/hello"), { recursive: true });
  writeFileSync(join(dir, "spex-packages/acme/hello/keep.txt"), "mine\n");
  const before = snapshot(dir);
  const existing = await spex(dir, "new", "acme/hello", "--skill", ...skill, "--move");
  assert.equal(existing.code, 1);
  assert.match(existing.stderr, /spex-packages\/acme\/hello\/ already exists/, "[cli-8] an existing folder");
  assert.deepEqual(snapshot(dir), before, "[cli-8] an existing destination is left as it was");
});

test("cli-16: publish by name to the registry spex.yaml names, named by its own display name, a dry run publishing nothing, each refusal before any upload", async () => {
  // The publisher's home lists another instance first, its default, and
  // is signed in at the stand-in, which spex.yaml names as its space.
  const elsewhere = "http://127.0.0.1:9";
  mkdirSync(PUBLISHER, { recursive: true });
  writeFileSync(join(PUBLISHER, "home.yaml"), stringifyYaml({
    format: 2, device: randomUUID(), origin: elsewhere, own: "pat", folders: [],
    instances: [
      { origin: elsewhere, clientId: "spex", account: { id: "7", login: "pat", displayName: "Pat" } },
      { origin: registry.url, clientId: "spex", account: { id: "7", login: "pat", displayName: "Pat" }, displayName: "Stand-in Space" },
    ],
  }));
  assert.ok(fileCredentialStore(PUBLISHER, registry.url, "registry").replace(null, { access: TOKEN, accessExpiresAt: Date.now() + 86_400_000, refresh: `refresh-${TOKEN}` }));
  registry.script.setPrivate("acme", [TOKEN]);
  registry.script.clearRequests();
  const uploads = (): string[] => registry.script.requests.filter((request) => request.startsWith("PUT "));

  const dir = publishedFrom = project();
  writeFileSync(join(dir, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await okAt(PUBLISHER, dir, "new", "acme/hello", "--skill", ".claude/skills/greet", "--spec", "specs/hello.md");

  const dry = await okAt(PUBLISHER, dir, "publish", "acme/hello", "--dry-run");
  assert.equal(dry, [
    `Publishing acme/hello@0.1.0 to ${REGISTRY}`,
    "Files (dry run, nothing published):",
    "  LICENSE", "  README.md", "  meta.yaml", "  skills/en/greet/SKILL.md", "  skills/en/greet/scripts/wave.sh", "  specs/en/hello.md",
    "",
  ].join("\n"), "[cli-9] the registry's own name, never the Space entry's at its origin, the package and its files");
  assert.deepEqual(uploads(), [], "[cli-9] a dry run publishes nothing");

  const published = await okAt(PUBLISHER, dir, "publish", "acme/hello");
  assert.equal(published, `Publishing acme/hello@0.1.0 to ${REGISTRY}\nPublished: ${registry.url}/acme/hello\n`, "[cli-9] the package's page at the registry");
  assert.deepEqual(uploads(), ["PUT /api/v1/packages/acme/hello/0.1.0"]);
  const reader = new RegistryClient({ url: registry.url, token: async () => TOKEN });
  assert.deepEqual((await reader.index("acme/hello")).versions.map((entry) => entry.version), ["0.1.0"], "[cli-9] the release landed there");

  // With no name and one package under spex-packages/, that package.
  const meta = join(dir, "spex-packages", "acme", "hello", "meta.yaml");
  writeFileSync(meta, readFileSync(meta, "utf8").replace('version: "0.1.0"', 'version: "0.2.0"'));
  assert.match(await okAt(PUBLISHER, dir, "publish"), new RegExp(`^Publishing acme/hello@0\\.2\\.0 to ${REGISTRY}$`, "m"), "[cli-9] the one package");
  assert.equal(uploads().length, 2);

  // Each refusal, before any upload.
  cpSync(join(dir, "spex-packages", "acme", "hello"), join(dir, "spex-packages", "acme", "other"), { recursive: true });
  await makeRelease(join(dir, "spex-packages", "acme", "bare"), { format: 2, org: "acme", name: "bare", version: "0.1.0", description: "Bare", artifacts: { greet: skill } }, { "skills/en/greet/SKILL.md": GREET_MD });
  mkdirSync(join(dir, "spex-packages", "acme", "broken"));
  writeFileSync(join(dir, "spex-packages", "acme", "broken", "meta.yaml"), "format: 1\n");
  const refusals: [string, string, string[], RegExp][] = [
    ["no folder", PUBLISHER, ["publish", "acme/nothing"], /^spex publish: no folder for acme\/nothing at spex-packages\/acme\/nothing — spex new acme\/nothing starts one$/m],
    ["another package's manifest", PUBLISHER, ["publish", "acme/other"], /^spex publish: spex-packages\/acme\/other holds acme\/hello, not acme\/other — fix the name in its meta\.yaml, or publish acme\/hello$/m],
    ["a folder that is no release", PUBLISHER, ["publish", "acme/broken"], /^spex publish: spex-packages\/acme\/broken is not a package: .+ — fix it, then retry$/m],
    ["a missing license", PUBLISHER, ["publish", "acme/bare"], /^spex publish: spex-packages\/acme\/bare cannot be published: meta\.yaml: missing required field "license" — add it to its meta\.yaml$/m],
    ["several packages and no name", PUBLISHER, ["publish"], /^spex publish: spex-packages\/ holds 4 packages: acme\/bare, acme\/broken, acme\/hello, acme\/other — name one: spex publish <org>\/<pkg>$/m],
    ["a device signed out there", HOME, ["publish", "acme/hello"], new RegExp(`^spex publish: not signed in at ${REGISTRY} to publish — spex login, then retry$`, "m")],
  ];
  for (const [label, home, args, cause] of refusals) {
    const before = uploads().length;
    const ran = await spexAt(home, dir, ...args);
    assert.equal(ran.code, 1, `${label}: ${ran.stdout}${ran.stderr}`);
    assert.match(ran.stderr, cause, `[cli-9] ${label}`);
    assert.equal(uploads().length, before, `[cli-9] ${label} uploads nothing`);
  }
});

test("cli-18: exit 0, 1 and 130 with the cause on standard error, no token printed, an interrupted install leaving the last files and lock", async () => {
  // A refusal: 1, its cause on standard error naming the command.
  const unknown = await spex(WORK, "install", "--bogus");
  assert.equal(unknown.code, 1, "[cli-13] a refusal exits 1");
  assert.equal(unknown.stderr, "spex install: unknown option --bogus\nUsage: spex install\n", "[cli-13] the cause on standard error, in the CLI's words, then the command's usage");
  assert.equal(unknown.stdout, "");
  // A failure the registry answers, signed in: 1, its words, no token.
  const again = await spexAt(PUBLISHER, publishedFrom, "publish", "acme/hello");
  assert.equal(again.code, 1, again.stdout + again.stderr);
  assert.equal(again.stderr, `spex publish: acme/hello@0.2.0 is already at ${REGISTRY} — raise the version in meta.yaml, then retry\n`, "[cli-13] the registry's refusal named, with what to do");

  // An environment installed at demo/tool 1.1.0.
  const dir = workingFolder(join(SCRATCH, "interrupted"));
  writeFileSync(join(dir, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages:\n  demo/tool:\n    version: ^1.0.0\n`);
  assert.match(await ok(dir, "install"), /^Installed demo\/tool 1\.1\.0$/m, "[cli-13] success exits 0");
  // A newer lock arrives with the code, resolved on another device whose
  // store holds its files, so this home fetches them.
  await publish("demo/tool", "1.2.0", { tool: skill }, skillFiles("tool", "1.2.0"));
  const device = join(SCRATCH, "other-device");
  mkdirSync(device);
  copyFileSync(join(HOME, "home.yaml"), join(device, "home.yaml"));
  const elsewhere = workingFolder(join(SCRATCH, "elsewhere"));
  copyFileSync(join(dir, "spex.yaml"), join(elsewhere, "spex.yaml"));
  await okAt(device, elsewhere, "install");
  copyFileSync(join(elsewhere, "spex.lock"), join(dir, "spex.lock"));
  const lockBytes = readFileSync(join(dir, "spex.lock"), "utf8");
  assert.match(lockBytes, /version: 1\.2\.0/);
  const installed = snapshot(join(dir, ".spex", "packages"));
  const exported = snapshot(join(dir, ".claude", "skills"));

  // The install is interrupted while its download is held.
  const hold = registry.script.holdDownload();
  const env: NodeJS.ProcessEnv = { ...process.env, SPEX_HOME: HOME };
  delete env.SPEX_HOST_URL;
  const proc = spawn(process.execPath, [CLI, "install"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (data) => { stdout += String(data); });
  proc.stderr.on("data", (data) => { stderr += String(data); });
  const closed = new Promise<number | null>((resolveClose) => proc.on("close", resolveClose));
  try {
    assert.match(await hold.reached, /^\/(?:api\/v1\/packages\/)?demo\/tool\/1\.2\.0\//, "the download is held");
    proc.kill("SIGINT");
    const code = await closed;
    printed.push(stdout, stderr);
    // Windows ends a child on any kill without a signal for it to meet.
    if (process.platform !== "win32") {
      assert.equal(code, 130, `[cli-13] an interrupt exits 130: ${stdout}${stderr}`);
      assert.equal(stderr, "spex install: interrupted\n", "[cli-13] the interrupt said on standard error");
    }
  } finally {
    hold.release();
  }
  assert.equal(readFileSync(join(dir, "spex.lock"), "utf8"), lockBytes, "[cli-13] the lock stands");
  assert.deepEqual(snapshot(join(dir, ".spex", "packages")), installed, "[cli-13] the last installed files stand");
  assert.deepEqual(snapshot(join(dir, ".claude", "skills")), exported, "[cli-13] the last exports stand");
  // Run again, the install completes.
  assert.match(await ok(dir, "install"), /^Installed demo\/tool 1\.2\.0$/m);

  // No token, nor its refresh secret, in anything any run printed.
  assert.ok(printed.length > 0);
  for (const text of printed) {
    assert.ok(!text.includes(TOKEN), "[cli-13] no app token printed");
    assert.ok(!text.includes(`refresh-${TOKEN}`), "[cli-13] no refresh secret printed");
  }
});

test("cli-18: each cause of the table names the registry by its name and ends in what to do", async () => {
  // A folder whose spex.yaml names the stand-in as its registry, and a
  // private org whose packages only one token reads.
  const dir = workingFolder(join(SCRATCH, "causes"));
  writeFileSync(join(dir, "spex.yaml"), `format: 1\nregistry: ${registry.url}\npackages: {}\n`);
  await publish("secret/tool", "1.0.0", { tool: skill }, skillFiles("tool", "1.0.0"));
  registry.script.setPrivate("secret", [`spex-at-${randomUUID()}`]);
  const refusedWith = async (home: string, at: string, args: string[], cause: string, label: string): Promise<void> => {
    const before = snapshot(at);
    const ran = await spexAt(home, at, ...args);
    assert.equal(ran.code, 1, `${label}: ${ran.stdout}${ran.stderr}`);
    assert.equal(ran.stderr, `spex ${args[0]}: ${cause}\n`, `[cli-13] ${label}`);
    assert.deepEqual(snapshot(at), before, `[cli-13] ${label} writes nothing`);
  };

  // Signed out there: absent or private, and sign in.
  await refusedWith(HOME, dir, ["add", "secret/tool"], `secret/tool: not at ${REGISTRY}, or private — spex login, then retry`, "a private package to a device signed out");

  // Signed in as an account the org does not share with.
  const other = `spex-at-${randomUUID()}`;
  const signedIn = join(SCRATCH, "causes-home");
  mkdirSync(signedIn, { recursive: true });
  copyFileSync(join(HOME, "home.yaml"), join(signedIn, "home.yaml"));
  assert.ok(fileCredentialStore(signedIn, registry.url, "registry").replace(null, { access: other, accessExpiresAt: Date.now() + 86_400_000, refresh: `refresh-${other}` }));
  registry.script.setAccount(other, { id: "8", login: "sam" });
  await refusedWith(signedIn, dir, ["add", "secret/tool"], `secret/tool: not shared with @sam at ${REGISTRY} — ask its owner`, "a refused read (403)");
  await refusedWith(signedIn, dir, ["add", "demo/none"], `demo/none: not at ${REGISTRY}, or not shared with @sam — check the name, or ask its owner`, "a package the registry lists to no account signed in");
  await refusedWith(signedIn, publishedFrom, ["publish", "acme/hello"], `acme is not yours at ${REGISTRY} — claim it at ${registry.url}/account/orgs`, "a refused publish (403)");

  // The same package asked by spex.yaml, its spex.lock written by an
  // install or an update: the registry's answer, never a conflict of
  // versions.
  const asking = workingFolder(join(SCRATCH, "causes-asking"));
  writeFileSync(join(asking, "spex.yaml"), `format: 1\nregistry: ${registry.url}\npackages:\n  secret/tool:\n    version: ^1.0.0\n`);
  for (const command of ["install", "update"]) {
    await refusedWith(HOME, asking, [command], `secret/tool: not at ${REGISTRY}, or private — spex login, then retry`, `a private package to a device signed out, at ${command}`);
    await refusedWith(signedIn, asking, [command], `secret/tool: not shared with @sam at ${REGISTRY} — ask its owner`, `a refused read (403), at ${command}`);
  }

  // A spex.yaml naming no registry reads with its Space's sign-in.
  const legacy = workingFolder(join(SCRATCH, "causes-legacy"));
  writeFileSync(join(legacy, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await refusedWith(HOME, legacy, ["add", "secret/tool"], `secret/tool: not at ${REGISTRY}, or private — spex login --space ${registry.url}, then retry`, "a private package to a device signed out of the Space a spex.yaml naming no registry reads with");

  // The sign-in expired.
  registry.script.refuseTokens(other, "token_expired");
  try {
    await refusedWith(signedIn, dir, ["add", "demo/tool"], `sign-in expired at ${REGISTRY} — spex login`, "an expired sign-in (401)");
  } finally {
    registry.script.refuseTokens(null);
  }

  // A registry that cannot be reached, by its host where no descriptor
  // names it; one that is down, by its name.
  const unreachable = workingFolder(join(SCRATCH, "causes-unreachable"));
  writeFileSync(join(unreachable, "spex.yaml"), "format: 1\nregistry: http://127.0.0.1:1\npackages: {}\n");
  await refusedWith(HOME, unreachable, ["add", "demo/tool"], "127.0.0.1:1 could not be reached — check the connection, then retry", "an unreachable registry");
  registry.script.unavailable(1);
  await refusedWith(HOME, dir, ["add", "demo/tool"], `${REGISTRY} is down (500) — retry later`, "a registry that is down");

  // A spex.lock from a newer Spex: update Spex, never rewritten.
  const newer = workingFolder(join(SCRATCH, "causes-newer"));
  writeFileSync(join(newer, "spex.yaml"), `format: 1\nregistry: ${registry.url}\npackages:\n  demo/tool:\n    version: ^1.0.0\n`);
  writeFileSync(join(newer, "spex.lock"), "format: 2\n");
  for (const command of ["install", "update", "list"]) await refusedWith(HOME, newer, [command], "spex.lock is from a newer Spex — update Spex", `a lock from a newer Spex at ${command}`);

  // A spex.lock that does not read: spex update rewrites it.
  const unreadable = workingFolder(join(SCRATCH, "causes-unreadable"));
  writeFileSync(join(unreadable, "spex.yaml"), `format: 1\nregistry: ${registry.url}\npackages:\n  demo/tool:\n    version: ^1.0.0\n`);
  writeFileSync(join(unreadable, "spex.lock"), "format: 1\nrequests: 5\npackages: {}\n");
  await refusedWith(HOME, unreadable, ["install"], "spex.lock cannot be read: requests is not a digest — spex update rewrites it", "a lock that does not read");
  const rewritten = await ok(unreadable, "update");
  assert.match(rewritten, /^Wrote spex\.lock\nAdded demo\/tool 1\.\d\.\d$/m, "[cli-5] spex update rewrites a lock that does not read");
  assert.ok(parseLock(readFileSync(join(unreadable, "spex.lock"), "utf8")).packages["demo/tool"]);

  // A spex.lock naming a package's registry by no address: never asked,
  // on a home whose store lacks the files.
  const text = `format: 1\nregistry: ${registry.url}\npackages:\n  demo/tool:\n    version: ^1.0.0\n`;
  const made = workingFolder(join(SCRATCH, "causes-unasked-made"));
  writeFileSync(join(made, "spex.yaml"), text);
  await ok(made, "install");
  const unasked = workingFolder(join(SCRATCH, "causes-unasked"));
  writeFileSync(join(unasked, "spex.yaml"), text);
  const madeLock = readFileSync(join(made, "spex.lock"), "utf8");
  assert.ok(madeLock.includes(`registry: ${registry.url}\n`));
  writeFileSync(join(unasked, "spex.lock"), madeLock.replace(`registry: ${registry.url}\n`, "registry: spex-registry\n"));
  const bare = join(SCRATCH, "causes-bare-home");
  mkdirSync(bare, { recursive: true });
  copyFileSync(join(HOME, "home.yaml"), join(bare, "home.yaml"));
  await refusedWith(bare, unasked, ["install"], "demo/tool: spex.lock names no registry address for it — spex update writes spex.lock again", "a spex.lock naming its registry by no address");

  // A folder package whose folder is missing, holds no meta.yaml, or
  // holds one that does not read: the CLI's words and what to do.
  const folders = workingFolder(join(SCRATCH, "causes-folders"));
  writeFileSync(join(folders, "spex.yaml"), `format: 1\nregistry: ${registry.url}\npackages:\n  demo/tool:\n    path: kit\n`);
  await refusedWith(HOME, folders, ["install"], "demo/tool: no folder at kit — fix its path in spex.yaml, or spex remove demo/tool", "a folder package whose folder is missing");
  mkdirSync(join(folders, "kit"));
  await refusedWith(HOME, folders, ["update"], "demo/tool: kit has no meta.yaml, so it is no package — fix its path in spex.yaml, or spex remove demo/tool", "a folder package whose folder holds no meta.yaml");
  writeFileSync(join(folders, "kit", "meta.yaml"), stringifyYaml(manifestOf("demo/tool", "1.0.0", {})));
  const notPackage = await spex(folders, "install");
  assert.equal(notPackage.code, 1, notPackage.stdout + notPackage.stderr);
  assert.match(notPackage.stderr, /^spex install: demo\/tool: kit is not a package: .+ — fix its meta\.yaml, then retry\n$/, `[cli-13] a folder that is no package: ${notPackage.stderr}`);
});

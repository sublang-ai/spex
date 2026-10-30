// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The package commands of the packed CLI (cli-15): `@sublang/spex`,
// packed with `npm pack` and installed into a scratch prefix, runs as a
// child process on a scratch home whose `home.yaml` names the library's
// stand-in registry as the default instance, in scratch Git working
// folders, with no core running. The stand-in runs in this process, so
// every run is asynchronous.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { publishRelease, RegistryClient } from "./lib/environment/index.js";
import { makeRelease, startStandinRegistry, type ReleaseFixture, type StandinRegistry } from "./testing/index.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SCRATCH = realpathSync(mkdtempSync(join(tmpdir(), "spex-package-commands-")));
const HOME = join(SCRATCH, "home");
const WORK = join(SCRATCH, "work");

let CLI = "";
let registry: StandinRegistry;
let client: RegistryClient;
let host = "";
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

/** The packed CLI in `cwd` on the scratch home. */
function spex(cwd: string, ...args: string[]): Promise<Ran> {
  const env: NodeJS.ProcessEnv = { ...process.env, SPEX_HOME: HOME };
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
  const ran = await spex(cwd, ...args);
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
});

after(async () => {
  await registry?.close();
  rmSync(SCRATCH, { recursive: true, force: true });
});

test("cli-15: add writes the request, resolves, installs under .spex/ and exports; each refusal writes nothing", async () => {
  const added = await ok(WORK, "add", "demo/tool@^1.0.0");
  // The file is made naming the default instance (cli-2).
  const requests = readYaml(join(WORK, "spex.yaml"));
  assert.deepEqual(requests, { format: 1, space: registry.url, packages: { "demo/tool": { version: "^1.0.0" } } }, "[cli-2] the requirement given, space naming the default instance");
  assert.match(added, /^Added demo\/tool 1\.0\.0$/m, "[cli-2] the package gained, with its version");
  assert.match(added, /^ {2}tool: \.agents\/skills\/tool\/, \.claude\/skills\/tool\/$/m, "[cli-2] where its exports went");
  assert.equal(readFileSync(join(WORK, ".spex", ".gitignore"), "utf8"), "*\n", "[cli-2] .spex/ ignores everything in it");
  assert.match(readFileSync(join(WORK, ".spex", "packages", "demo", "tool", "skills", "en", "tool", "SKILL.md"), "utf8"), /at 1\.0\.0/);
  for (const folder of [".claude", ".agents"]) assert.match(readFileSync(join(WORK, folder, "skills", "tool", "SKILL.md"), "utf8"), /name: tool/, `[cli-2] exported into ${folder}/skills`);

  const other = await ok(WORK, "add", "demo/other");
  assert.equal(readYaml(join(WORK, "spex.yaml")).packages["demo/other"].version, "^1.2.0", "[cli-2] a caret at the newest listed release, no prerelease, none yanked");
  assert.match(other, /^Added demo\/other 1\.2\.0$/m);
  assert.match(other, /^Added demo\/base 1\.0\.0$/m, "[cli-2] what the lock gained beside it");
  const lock = readYaml(join(WORK, "spex.lock"));
  assert.deepEqual(Object.keys(lock.packages).sort(), ["demo/base", "demo/other", "demo/tool"]);
  assert.deepEqual(lock.packages["demo/base"]["required-by"], ["demo/other"]);
  assert.equal(lock.packages["demo/tool"].source.registry, registry.url);
  assert.ok(existsSync(join(WORK, ".claude", "skills", "demo-base", "base.md")), "[cli-2] the spec exported as a skill");
  // Git sees the two files and never the installed tree or the exports.
  const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: WORK, encoding: "utf8" });
  assert.deepEqual(status.trim().split("\n").sort(), ["?? spex.lock", "?? spex.yaml"], "[cli-2] Git sees spex.yaml and spex.lock alone");

  const refusals: [string, string[], RegExp][] = [
    ["a name that is not <org>/<pkg>", ["add", "Demo/tool"], /is not a <org>\/<pkg> name/],
    ["a malformed requirement", ["add", "demo/tool@1.x"], /is not a version requirement/],
    ["a requirement and a path together", ["add", "demo/tool@^1.0.0", "--path", "kits/tool"], /a requirement and --path together/],
    ["a path leading out of the root", ["add", "demo/tool", "--path", "../elsewhere"], /leads out of/],
    ["a spec package the registry does not list", ["add", "demo/missing"], /lists no spec package demo\/missing/],
  ];
  for (const [label, args, cause] of refusals) {
    const before = snapshot(WORK);
    const ran = await spex(WORK, ...args);
    assert.equal(ran.code, 1, `${label}: ${ran.stdout}${ran.stderr}`);
    assert.match(ran.stderr, cause, `[cli-2] ${label} is refused naming the rule`);
    assert.deepEqual(snapshot(WORK), before, `[cli-2] ${label} writes nothing`);
  }
});

test("cli-15: list names the instance, the requests, the lock, the exports and nothing left out; search lists newest first", async () => {
  const listed = await ok(WORK, "list");
  assert.match(listed, new RegExp(`^Space: ${host.replace(/\./g, "\\.")}$`, "m"), "[cli-6] the instance");
  assert.match(listed, /^ {2}demo\/other {2}\^1\.2\.0$/m, "[cli-6] each request with its requirement");
  assert.match(listed, /^ {2}demo\/tool {3}\^1\.0\.0$/m);
  const row = (name: string, version: string, by: string): RegExp => new RegExp(`^  ${name.replace("/", "\\/")} +${version.replace(/\./g, "\\.")} +${host.replace(/\./g, "\\.")} +${by} +installed$`, "m");
  assert.match(listed, row("demo/base", "1.0.0", "required by demo\\/other"), "[cli-6] version, source, who required it, installed");
  assert.match(listed, row("demo/other", "1.2.0", "requested"));
  assert.match(listed, row("demo/tool", "1.0.0", "requested"));
  assert.match(listed, /^ {2}tool +\.agents\/skills, \.claude\/skills$/m, "[cli-6] each exported skill with its folders");
  assert.match(listed, /^ {2}demo-base +\.agents\/skills, \.claude\/skills$/m);
  assert.match(listed, /^Left out: nothing$/m, "[cli-6] nothing left out");
  assert.doesNotMatch(listed, /^Lock: /m, "[cli-6] the lock is neither missing nor stale");

  const found = await ok(WORK, "search", "other");
  assert.match(found, /^demo\/other {2}The demo\/other spec package\n {2}2\.0\.0-beta\.1, 1\.2\.0, 1\.0\.0$/m, "[cli-7] the match with its versions, newest first");
});

test("cli-15: install from the committed files alone resolves nothing and installs byte for byte; again it rewrites nothing", async () => {
  const second = workingFolder(join(SCRATCH, "second"));
  copyFileSync(join(WORK, "spex.yaml"), join(second, "spex.yaml"));
  copyFileSync(join(WORK, "spex.lock"), join(second, "spex.lock"));
  const lockBytes = readFileSync(join(second, "spex.lock"), "utf8");
  registry.script.clearRequests();
  const installed = await ok(second, "install");
  assert.deepEqual(registry.script.requests.filter((request) => /^GET \/api\/v1\/packages\/[^/]+\/[^/]+$/.test(request)), [], "[cli-4] no version index read: nothing resolved");
  assert.equal(readFileSync(join(second, "spex.lock"), "utf8"), lockBytes, "[cli-4] the lock as committed");
  assert.match(installed, /^Installed demo\/tool 1\.0\.0$/m, "[cli-4] each package installed with its version");
  assert.match(installed, /^Exported tool to \.agents\/skills\/tool\/, \.claude\/skills\/tool\/$/m, "[cli-4] each export written");
  assert.deepEqual(snapshot(join(second, ".spex", "packages")), snapshot(join(WORK, ".spex", "packages")), "[cli-4] byte-identical .spex/packages/");
  for (const folder of [".claude", ".agents"]) {
    assert.deepEqual(snapshot(join(second, folder, "skills")), snapshot(join(WORK, folder, "skills")), `[cli-4] byte-identical exports in ${folder}/skills`);
  }

  const before = { files: stamps(second) };
  const again = await ok(second, "install");
  assert.match(again, /^Up to date demo\/tool 1\.0\.0$/m, "[cli-4] installed already");
  const after = stamps(second);
  for (const path of Object.keys(before.files)) {
    // The library regenerates `.spex/skills/` and each agent folder's
    // export manifest at every export, with the same bytes.
    if (path.startsWith(".spex/skills/") || path.endsWith("/.spex-exports.json")) assert.equal(after[path]?.split(":")[0], before.files[path]!.split(":")[0], `${path} keeps its bytes`);
    else assert.equal(after[path], before.files[path], `[cli-4] ${path} is not rewritten`);
  }
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before.files).sort(), "[cli-4] no file made or removed");

  // With spex.yaml alone, the lock is resolved first.
  const third = workingFolder(join(SCRATCH, "third"));
  copyFileSync(join(WORK, "spex.yaml"), join(third, "spex.yaml"));
  const resolved = await ok(third, "install");
  assert.match(resolved, /^Resolved spex\.lock\.$/m, "[cli-4] resolved first where the lock is missing");
  assert.equal(readFileSync(join(third, "spex.lock"), "utf8"), lockBytes, "[cli-4] the same lock");
  assert.deepEqual(snapshot(join(third, ".spex", "packages")), snapshot(join(WORK, ".spex", "packages")));

  // With neither, refused naming the folder and spex add.
  const fourth = workingFolder(join(SCRATCH, "fourth"));
  const refused = await spex(fourth, "install");
  assert.equal(refused.code, 1);
  assert.ok(refused.stderr.includes(`${fourth} holds no spex.yaml; spex add <org>/<pkg> makes one`), `[cli-4] ${refused.stderr}`);
  assert.deepEqual(snapshot(fourth), {}, "[cli-4] nothing written");
});

test("cli-15: update moves the lock to a newer release and then says nothing moved", async () => {
  await publish("demo/tool", "1.1.0", { tool: skill }, skillFiles("tool", "1.1.0"));
  const moved = await ok(WORK, "update");
  assert.match(moved, /^Moved demo\/tool 1\.0\.0 -> 1\.1\.0$/m, "[cli-5] both versions");
  assert.equal(readYaml(join(WORK, "spex.lock")).packages["demo/tool"].source.version, "1.1.0");
  assert.match(readFileSync(join(WORK, ".claude", "skills", "tool", "SKILL.md"), "utf8"), /at 1\.1\.0/, "[cli-5] installed and exported");
  assert.equal((await ok(WORK, "update")).trim(), "Nothing moved.", "[cli-5] nothing moved");

  const found = await ok(WORK, "search", "tool");
  assert.match(found, /^demo\/tool {2}The demo\/tool spec package\n {2}1\.1\.0, 1\.0\.0$/m, "[cli-7] newest first");
});

test("cli-15: remove drops the request, the files and the export; a name not requested is refused", async () => {
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
  assert.match(refused.stderr, /demo\/other is not requested in spex\.yaml/, "[cli-3] a name not requested is refused");
  assert.deepEqual(snapshot(WORK), before, "[cli-3] nothing written");
});

test("cli-15: the root is found from a subfolder, and at the Git top level of a folder without spex.yaml", async () => {
  const deeper = join(WORK, "src", "deeper");
  mkdirSync(deeper, { recursive: true });
  assert.ok((await ok(deeper, "list")).includes(`Root: ${WORK}\n`), "[cli-1] the nearest folder holding spex.yaml");

  const fifth = workingFolder(join(SCRATCH, "fifth"));
  const sub = join(fifth, "app", "lib");
  mkdirSync(sub, { recursive: true });
  await ok(sub, "add", "demo/tool");
  assert.ok(existsSync(join(fifth, "spex.yaml")), "[cli-1] made at the Git top level");
  assert.equal(existsSync(join(sub, "spex.yaml")), false);
  assert.ok(existsSync(join(fifth, ".spex", "packages", "demo", "tool")));
  // The home holds nothing but what the commands wrote.
  assert.deepEqual(readdirSync(HOME).sort(), ["cache", "home.yaml", "store"], "[cli-1] no clone, lease or record of the home");
});

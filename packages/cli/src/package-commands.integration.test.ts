// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The package commands of the packed CLI (cli-15, cli-16): `@sublang/spex`,
// packed with `npm pack` and installed into a scratch prefix, runs as a
// child process on a scratch home whose `home.yaml` names the library's
// stand-in registry as the default instance, in scratch Git working
// folders, with no core running. The stand-in runs in this process, so
// every run is asynchronous.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { publishRelease, readPublishableRelease, RegistryClient } from "./lib/environment/index.js";
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
  const env: NodeJS.ProcessEnv = { ...process.env, SPEX_HOME: home };
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

const APACHE = "\n                                 Apache License\n                           Version 2.0, January 2004\n";
const GREET_MD = '---\nname: greet\ndescription: "Greets: whoever asks"\n---\n\n# Greet\n\nSay hello.\n';
const SPEC_MD = "<!-- SPDX-License-Identifier: Apache-2.0 -->\n\n# hello: Hello\n\n## Intent\n\nThis package states the greeting.\nIt has two lines.\n\nA second paragraph.\n\n## External Behavior\n\n### hello-1\n\nThe greeter shall greet.\n\n## Verification\n\n### hello-2\n\nWhen run, the suite shall assert it greets [[hello-1](#hello-1)].\n";
let projects = 0;

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

test("cli-15: new makes spex-packages/<org>/<pkg>/, requests it by path and exports it; --move leaves the skill as Spex's export", async () => {
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
  assert.deepEqual(readYaml(join(dir, "spex.yaml")), { format: 1, space: registry.url, packages: { "acme/hello": { path: "spex-packages/acme/hello" } } }, "[cli-8] the path request");
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
  assert.match(made, /^Left out greet from \.claude\/skills: a folder of yours stands there$/m);
  assert.ok(existsSync(join(dir, ".claude", "skills", "acme-hello", "hello.md")), "[cli-8] the spec exported as acme-hello");
  // It ends naming the folder and the two publish commands.
  assert.match(made, /^Made spex-packages\/acme\/hello\/ for acme\/hello \(skill greet, spec hello\)\.$/m, "[cli-8] the folder");
  assert.match(made, /^Next: edit spex-packages\/acme\/hello\/, then\n {2}spex publish acme\/hello --dry-run\n {2}spex publish acme\/hello$/m, "[cli-8] the next steps");

  // --move: the original folder now stands as Spex's export.
  const moved = project();
  const movedOut = await ok(moved, "new", "acme/greeting", "--skill", ".claude/skills/greet", "--move");
  assert.ok(exportsIn(moved, ".claude/skills").includes("greet"), "[cli-8] .claude/skills/greet/ is Spex's export now");
  assert.equal(readFileSync(join(moved, ".claude", "skills", "greet", "SKILL.md"), "utf8"), GREET_MD);
  assert.ok(existsSync(join(moved, "spex-packages", "acme", "greeting", "skills", "en", "greet", "scripts", "wave.sh")));
  assert.match(movedOut, /^The skill greet moved from \.claude\/skills\/greet\/ now stands there as Spex's export\.$/m, "[cli-8] the moved-skill note");
  assert.doesNotMatch(movedOut, /^Left out/m);

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
    ["no artifact", ["acme/hello"], /at least one artifact/],
    ["a skill folder without SKILL.md", ["acme/hello", "--skill", ".claude/skills/empty"], /no SKILL\.md/],
    ["a SKILL.md name that is no Agent Skills name", ["acme/hello", "--skill", ".claude/skills/spaced"], /Agent Skills name/],
    ["two skills of one id", ["acme/hello", "--skill", ...skill, "--skill", ".claude/skills/twin"], /Two skills declare the id greet/],
    ["a skill of the spec's id", ["acme/hello", "--skill", ".claude/skills/hello", "--spec", "specs/hello.md"], /spec's id hello/],
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

test("cli-16: publish by name to the Space spex.yaml names, a dry run uploading nothing, each refusal before any upload", async () => {
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
  assert.ok(fileCredentialStore(PUBLISHER, registry.url).replace(null, { access: TOKEN, accessExpiresAt: Date.now() + 86_400_000, refresh: `refresh-${TOKEN}` }));
  registry.script.setPrivate("acme", [TOKEN]);
  registry.script.clearRequests();
  const uploads = (): string[] => registry.script.requests.filter((request) => request.startsWith("PUT "));

  const dir = project();
  writeFileSync(join(dir, "spex.yaml"), `format: 1\nspace: ${registry.url}\npackages: {}\n`);
  await okAt(PUBLISHER, dir, "new", "acme/hello", "--skill", ".claude/skills/greet", "--spec", "specs/hello.md");

  const dry = await okAt(PUBLISHER, dir, "publish", "acme/hello", "--dry-run");
  assert.equal(dry, [
    "Destination: Stand-in Space, acme/hello@0.1.0",
    "Files (dry run, nothing uploaded):",
    "  LICENSE", "  README.md", "  meta.yaml", "  skills/en/greet/SKILL.md", "  skills/en/greet/scripts/wave.sh", "  specs/en/hello.md",
    "",
  ].join("\n"), "[cli-9] the instance's name, the package and its files");
  assert.deepEqual(uploads(), [], "[cli-9] a dry run uploads nothing");

  const published = await okAt(PUBLISHER, dir, "publish", "acme/hello");
  assert.equal(published, `Destination: Stand-in Space, acme/hello@0.1.0\nPublished: ${registry.url}/acme/hello\n`, "[cli-9] the URL answered");
  assert.deepEqual(uploads(), ["PUT /api/v1/packages/acme/hello/0.1.0"]);
  const reader = new RegistryClient({ url: registry.url, token: async () => TOKEN });
  assert.deepEqual((await reader.index("acme/hello")).versions.map((entry) => entry.version), ["0.1.0"], "[cli-9] the release landed there");

  // With no name and one package under spex-packages/, that package.
  const meta = join(dir, "spex-packages", "acme", "hello", "meta.yaml");
  writeFileSync(meta, readFileSync(meta, "utf8").replace('version: "0.1.0"', 'version: "0.2.0"'));
  assert.match(await okAt(PUBLISHER, dir, "publish"), /^Destination: Stand-in Space, acme\/hello@0\.2\.0$/m, "[cli-9] the one package");
  assert.equal(uploads().length, 2);

  // Each refusal, before any upload.
  cpSync(join(dir, "spex-packages", "acme", "hello"), join(dir, "spex-packages", "acme", "other"), { recursive: true });
  await makeRelease(join(dir, "spex-packages", "acme", "bare"), { format: 2, org: "acme", name: "bare", version: "0.1.0", description: "Bare", artifacts: { greet: skill } }, { "skills/en/greet/SKILL.md": GREET_MD });
  mkdirSync(join(dir, "spex-packages", "acme", "broken"));
  writeFileSync(join(dir, "spex-packages", "acme", "broken", "meta.yaml"), "format: 1\n");
  const refusals: [string, string, string[], RegExp][] = [
    ["no folder", PUBLISHER, ["publish", "acme/nothing"], /no folder holds acme\/nothing: spex-packages\/acme\/nothing is not there/],
    ["another package's manifest", PUBLISHER, ["publish", "acme/other"], /spex-packages\/acme\/other holds acme\/hello, not acme\/other/],
    ["a folder that is no release", PUBLISHER, ["publish", "acme/broken"], /spex-packages\/acme\/broken is not a spec package release/],
    ["a missing license", PUBLISHER, ["publish", "acme/bare"], /spex-packages\/acme\/bare cannot be published: meta\.yaml: missing required field "license"/],
    ["several packages and no name", PUBLISHER, ["publish"], /spex-packages\/ holds 4 packages: acme\/bare, acme\/broken, acme\/hello, acme\/other; name one/],
    ["a device signed out there", HOME, ["publish", "acme/hello"], new RegExp(`not signed in at ${host.replace(/\./g, "\\.")}; spex login signs in to publish there`)],
  ];
  for (const [label, home, args, cause] of refusals) {
    const before = uploads().length;
    const ran = await spexAt(home, dir, ...args);
    assert.equal(ran.code, 1, `${label}: ${ran.stdout}${ran.stderr}`);
    assert.match(ran.stderr, cause, `[cli-9] ${label}`);
    assert.equal(uploads().length, before, `[cli-9] ${label} uploads nothing`);
  }
});

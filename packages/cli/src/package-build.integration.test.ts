// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The packed `@sublang/spex` (cli-19): installed into a scratch prefix
// from `npm pack`, it carries no agent SDK, Cligent, Playbook or
// compiler; the scaffold's files and the library's modules resolve by
// name from the installed package; the core's sources import the
// library from the workspace package and hold no copy of its modules;
// and the CLI's install of a playbook artifact, from the registry or by
// path, leaves its folder without engine links.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify as stringifyYaml } from "yaml";

import { ENGINE_LINKS_EXCLUDE, publishRelease, RegistryClient } from "./lib/environment/index.js";
import { makeRelease, startStandinRegistry, type ReleaseFixture, type StandinRegistry } from "./testing/index.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CORE_SRC = resolve(ROOT, "..", "core", "src");
const SCRATCH = realpathSync(mkdtempSync(join(tmpdir(), "spex-package-build-")));
const HOME = join(SCRATCH, "home");

let CLI = "";
/** The folder npm installed the prefix's packages in. */
let MODULES = "";
let registry: StandinRegistry;

function npm(args: string[], cwd: string): string {
  const npmPath = process.env.npm_execpath;
  const result = npmPath && npmPath.endsWith(".js")
    ? spawnSync(process.execPath, [npmPath, ...args], { cwd, encoding: "utf8" })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, encoding: "utf8", shell: process.platform === "win32" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function spex(cwd: string, ...args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, SPEX_HOME: HOME };
  delete env.SPEX_HOST_URL;
  const proc = spawn(process.execPath, [CLI, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  proc.stdout.on("data", (data) => { stdout += String(data); });
  proc.stderr.on("data", (data) => { stderr += String(data); });
  return new Promise((resolveRun, rejectRun) => {
    proc.on("error", rejectRun);
    proc.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

before(async () => {
  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", SCRATCH], ROOT))[0];
  const prefix = join(SCRATCH, "prefix");
  npm(["install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline", join(SCRATCH, packed.filename)], SCRATCH);
  MODULES = join(prefix, process.platform === "win32" ? "node_modules" : join("lib", "node_modules"));
  CLI = join(MODULES, "@sublang", "spex", "dist", "cli.js");
  assert.ok(existsSync(CLI), CLI);
  registry = await startStandinRegistry({ dir: join(SCRATCH, "registry") });
  mkdirSync(HOME, { recursive: true });
  writeFileSync(join(HOME, "home.yaml"), stringifyYaml({ format: 2, device: randomUUID(), origin: registry.url, instances: [], own: "tester", folders: [] }));
});

after(async () => {
  await registry?.close();
  rmSync(SCRATCH, { recursive: true, force: true });
});

/** A package an agent SDK, Cligent, Playbook or the compiler is. */
const FORBIDDEN = [/^@anthropic-ai\//, /^@openai\//, /^@opencode-ai\//, /^@google\/gemini/, /agent-sdk/, /^@sublang\/(cligent|playbook|slc)$/, /^(cligent|playbook|slc)$/];

/** Every package installed below a node_modules folder, by name. */
function installedNames(modules: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of existsSync(dir) ? readdirSync(dir) : []) {
      if (entry.startsWith(".")) continue;
      if (entry.startsWith("@")) {
        for (const scoped of readdirSync(join(dir, entry))) {
          out.push(`${entry}/${scoped}`);
          walk(join(dir, entry, scoped, "node_modules"));
        }
        continue;
      }
      out.push(entry);
      walk(join(dir, entry, "node_modules"));
    }
  };
  walk(modules);
  return out;
}

test("cli-19: the packed package depends on no agent SDK, Cligent, Playbook or compiler", () => {
  const manifest = JSON.parse(readFileSync(join(MODULES, "@sublang", "spex", "package.json"), "utf8"));
  const declared = Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies });
  for (const name of declared) assert.ok(!FORBIDDEN.some((rule) => rule.test(name)), `[cli-14] ${name} is declared`);
  const installed = installedNames(MODULES);
  assert.ok(installed.includes("@sublang/spex") && installed.includes("yaml"), installed.join(", "));
  for (const name of installed) assert.ok(!FORBIDDEN.some((rule) => rule.test(name)), `[cli-14] ${name} is installed with it`);
});

test("cli-19: the scaffold's files and the library's modules resolve by name from the installed package", () => {
  // A module of the prefix resolves the package by name, as a consumer
  // of the published package does.
  const probe = join(MODULES, "probe.mjs");
  writeFileSync(probe, [
    'import { readFileSync } from "node:fs";',
    'import { fileURLToPath } from "node:url";',
    "const out = {};",
    'for (const name of ["@sublang/spex/scaffold/specs/meta.md", "@sublang/spex/scaffold/i18n/zh/specs/meta.md"]) {',
    "  const file = fileURLToPath(import.meta.resolve(name));",
    "  out[name] = { file, text: readFileSync(file, 'utf8') };",
    "}",
    'for (const name of ["environment", "files", "instance", "git-host", "home-file", "words", "testing"]) {',
    "  out[name] = Object.keys(await import(`@sublang/spex/${name}`)).length;",
    "}",
    "console.log(JSON.stringify(out));",
  ].join("\n"));
  const result = spawnSync(process.execPath, [probe], { cwd: SCRATCH, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const out = JSON.parse(result.stdout);
  for (const name of ["@sublang/spex/scaffold/specs/meta.md", "@sublang/spex/scaffold/i18n/zh/specs/meta.md"]) {
    assert.ok(!relative(join(MODULES, "@sublang", "spex"), out[name].file).startsWith(".."), `[cli-14] ${name} resolves inside the installed package`);
    assert.match(out[name].text, /^Authoring language: /m, `[cli-14] ${name} is the scaffold's spec of specs`);
  }
  for (const name of ["environment", "files", "instance", "git-host", "home-file", "words", "testing"]) {
    assert.ok(out[name] > 0, `[cli-14] @sublang/spex/${name} exports its module`);
  }
});

/** Every TypeScript source under a folder, tests aside. */
function sources(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !/\.test\.ts$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

test("cli-19: the core imports the library from the workspace package and holds no copy of its modules", () => {
  const core = JSON.parse(readFileSync(join(CORE_SRC, "..", "package.json"), "utf8"));
  assert.ok(core.dependencies?.["@sublang/spex"] !== undefined, "[cli-14] the core depends on @sublang/spex");
  const coreSources = sources(CORE_SRC).map((file) => ({ file, text: readFileSync(file, "utf8") }));
  assert.ok(coreSources.some(({ text }) => /from "@sublang\/spex\/environment"/.test(text)), "[cli-14] the core imports @sublang/spex/environment");
  for (const { file, text } of coreSources) {
    // No reach into the CLI's sources or build by path.
    assert.doesNotMatch(text, /from "(?:\.\.\/)+(?:cli|packages\/cli)\/|from "[^"]*\/cli\/(?:src|dist)\//, `[cli-14] ${relative(CORE_SRC, file)} imports the library by path`);
  }
  // A module's copy declares its exported functions and classes: no core
  // source declares half or more of any library module's.
  const declared = (text: string, exported: boolean): Set<string> =>
    new Set([...text.matchAll(exported ? /^export (?:async )?(?:function|class) (\w+)/gm : /^(?:export )?(?:async )?(?:function|class) (\w+)/gm)].map((match) => match[1]!));
  const library = [...sources(join(ROOT, "src", "lib")), ...sources(join(ROOT, "src", "testing"))];
  for (const module of library) {
    const names = declared(readFileSync(module, "utf8"), true);
    if (names.size < 2) continue;
    for (const { file, text } of coreSources) {
      const shared = [...declared(text, false)].filter((name) => names.has(name));
      assert.ok(shared.length < Math.max(2, Math.ceil(names.size / 2)),
        `[cli-14] ${relative(CORE_SRC, file)} declares ${shared.join(", ")} of ${relative(ROOT, module)}`);
    }
  }
});

function playbookFiles(id: string): Record<string, ReleaseFixture> {
  return {
    [`playbooks/en/${id}/${id}.md`]: `# ${id}\n\nRoles:\n\n- Worker\n`,
    [`playbooks/en/${id}/${id}.registry.mjs`]: `export default { id: ${JSON.stringify(id)} };\n`,
  };
}

const manifestOf = (name: string, id: string): Record<string, unknown> => {
  const [org, pkg] = name.split("/");
  return { format: 2, org, name: pkg, version: "1.0.0", description: `The ${name} spec package`, license: "Apache-2.0", artifacts: { [id]: { kind: "playbook", language: "en" } } };
};

/** Every file below a folder by its `/`-separated path. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split("\\").join("/"))
    .sort();
}

test("cli-19: the CLI's install of a playbook artifact leaves its folder without engine links", async () => {
  const release = await makeRelease(join(SCRATCH, "ship-kit"), manifestOf("acme/ship-kit", "ship"), playbookFiles("ship"));
  await publishRelease(new RegistryClient({ url: registry.url }), release);
  const work = join(SCRATCH, "work");
  mkdirSync(work);
  execFileSync("git", ["init", "--quiet", work]);
  await makeRelease(join(work, "kits", "walk"), manifestOf("acme/walk-kit", "walk"), playbookFiles("walk"));

  for (const args of [["add", "acme/ship-kit"], ["add", "acme/walk-kit", "--path", "kits/walk"]]) {
    const ran = await spex(work, ...args);
    assert.equal(ran.code, 0, `${ran.stdout}${ran.stderr}`);
  }
  const ship = join(work, ".spex", "packages", "acme", "ship-kit", "playbooks", "en", "ship");
  assert.deepEqual(filesUnder(ship), ["ship.md", "ship.registry.mjs"], "[cli-14] the installed playbook folder holds the release's files alone");
  assert.equal(existsSync(join(ship, "node_modules")), false, "[cli-14] no engine link in the installed playbook");
  const walk = join(work, "kits", "walk", "playbooks", "en", "walk");
  assert.deepEqual(filesUnder(walk), ["walk.md", "walk.registry.mjs"], "[cli-14] the path source is left as it is");
  const exclude = join(work, ".git", "info", "exclude");
  assert.ok(!existsSync(exclude) || !readFileSync(exclude, "utf8").includes(ENGINE_LINKS_EXCLUDE), "[cli-14] no engine links excluded where none is made");
  // Each playbook still reaches the agent that runs playbooks.
  for (const id of ["ship", "walk"]) assert.ok(existsSync(join(work, ".claude", "skills", id, "SKILL.md")), `${id} exported`);
});

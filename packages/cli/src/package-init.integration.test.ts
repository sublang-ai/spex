// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// `spex package init` (attached-cli-13): the packed, installed CLI makes
// a package folder from a skill folder and a spec file in a scratch Git
// working folder, the core's own release reader accepts it, every
// refusal writes nothing, and no server or Spex storage is touched.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CORE = resolve(ROOT, "../core");
// Repository-only fixture transport and release reader, already owned by
// core; never a CLI dependency.
const { WebSocketServer } = createRequire(join(CORE, "package.json"))("ws");
const SCRATCH = realpathSync(mkdtempSync(join(tmpdir(), "spex-package-init-")));
const HOME = join(SCRATCH, "home");
const TOKEN = "init-must-not-connect";
const APACHE = "\n                                 Apache License\n                           Version 2.0, January 2004\n";
let CLI: string;
let readPublishableRelease: (dir: string) => Promise<{ manifest: any; files: { path: string; executable: boolean }[] }>;
let server: { url: string; connections: () => number; stop: () => Promise<void> };
let projects = 0;

function npm(args: string[], cwd: string): string {
  const npmPath = process.env.npm_execpath;
  const result = npmPath
    ? spawnSync(process.execPath, [npmPath, ...args], { cwd, encoding: "utf8" })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

/** The packed CLI in a working folder, with a running server and the
 * home's endpoint file both naming the fixture server it must not reach. */
function init(cwd: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const proc = spawn(process.execPath, [CLI, "package", "init", ...args], {
    cwd, env: { ...process.env, SPEX_SERVER_URL: server.url, SPEX_HOME: HOME }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  proc.stdout.on("data", (data) => { stdout += String(data); });
  proc.stderr.on("data", (data) => { stderr += String(data); });
  return new Promise((resolveRun, rejectRun) => {
    proc.on("error", rejectRun); proc.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

const SKILL_MD = '---\nname: release-notes\ndescription: "Writes release notes: from the changelog"\n---\n\n# Release notes\n\nRead CHANGELOG.md.\n';
const SPEC_MD = "<!-- SPDX-License-Identifier: Apache-2.0 -->\n\n# demo-pack: Demo Pack\n\n## Intent\n\nThis package states the demo's behavior.\nIt has two lines.\n\nA second paragraph.\n\n## External Behavior\n\n### demo-pack-1\n\nThe demo shall work.\n\n## Verification\n\n### demo-pack-2\n\nWhen run, the suite shall assert it works [[demo-pack-1](#demo-pack-1)].\n";

/** A scratch Git working folder holding a LICENSE, a skill folder under
 * `.claude/skills/` (with a nested executable script) and a spec file. */
function project(license: string | null = APACHE): string {
  const dir = join(SCRATCH, `project-${++projects}`);
  mkdirSync(join(dir, ".claude/skills/release-notes/scripts"), { recursive: true });
  mkdirSync(join(dir, "specs/packages"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  if (license !== null) writeFileSync(join(dir, "LICENSE"), license);
  writeFileSync(join(dir, ".claude/skills/release-notes/SKILL.md"), SKILL_MD);
  writeFileSync(join(dir, ".claude/skills/release-notes/scripts/collect.sh"), "#!/bin/sh\ngit log --oneline\n");
  chmodSync(join(dir, ".claude/skills/release-notes/scripts/collect.sh"), 0o755);
  writeFileSync(join(dir, "specs/packages/demo-pack.md"), SPEC_MD);
  return dir;
}

/** Every path below a folder with its bytes, `.git` aside: what a
 * refusal must leave exactly as it stood. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(dir, relative)).sort()) {
      if (!relative && entry === ".git") continue;
      const path = relative ? `${relative}/${entry}` : entry;
      const stat = lstatSync(join(dir, path));
      if (stat.isDirectory()) { out[`${path}/`] = ""; walk(path); }
      else out[path] = stat.isFile() ? readFileSync(join(dir, path), "base64") : stat.isSymbolicLink() ? "link" : "special";
    }
  };
  walk("");
  return out;
}

before(async () => {
  const packed = JSON.parse(npm(["pack", "--json", "--pack-destination", SCRATCH], ROOT))[0];
  assert(packed.files.some((f: any) => f.path === "dist/package-init.js"));
  const prefix = join(SCRATCH, "prefix");
  npm(["install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", join(SCRATCH, packed.filename)], SCRATCH);
  CLI = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@sublang/spex/dist/cli.js");
  ({ readPublishableRelease } = await import(pathToFileURL(join(CORE, "dist/environment/index.js")).href));
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(wss, "listening");
  let connections = 0;
  wss.on("connection", () => { connections++; });
  const url = `http://127.0.0.1:${wss.address().port}/?token=${TOKEN}`;
  server = { url, connections: () => connections, stop: () => new Promise<void>((done) => wss.close(() => done())) };
  mkdirSync(join(HOME, "local"), { recursive: true });
  writeFileSync(join(HOME, "local/endpoint.json"), JSON.stringify({ format: 1, url, pid: process.pid }), { mode: 0o600 });
});
after(async () => {
  await server?.stop();
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe("spex package init", () => {
  const homeBefore = () => snapshot(HOME);

  it("makes a release the core accepts from a skill and a spec, with the defaults and the next steps", async () => {
    const home = homeBefore();
    const dir = project();
    const result = await init(dir, ["acme/demo-pack", "--skill", ".claude/skills/release-notes", "--spec", "specs/packages/demo-pack.md"]);
    assert.equal(result.code, 0, result.stderr);
    const folder = join(dir, "spex-packages/demo-pack");
    const release = await readPublishableRelease(folder);
    assert.deepEqual(release.manifest, {
      format: 2, org: "acme", name: "demo-pack", version: "0.1.0",
      // The first skill's description stands; the license is read from
      // the Apache LICENSE past its leading whitespace.
      description: "Writes release notes: from the changelog", license: "Apache-2.0",
      dependencies: {},
      artifacts: {
        "release-notes": { kind: "skill", language: "en", requires: [] },
        "demo-pack": { kind: "spec", language: "en", requires: [] },
      },
    });
    assert.deepEqual(release.files.map((f) => f.path), [
      "LICENSE", "README.md", "meta.yaml",
      "skills/en/release-notes/SKILL.md", "skills/en/release-notes/scripts/collect.sh",
      "specs/en/demo-pack.md",
    ]);
    assert.equal(release.files.find((f) => f.path.endsWith("collect.sh"))?.executable, true, "the script stays executable");
    assert.equal(readFileSync(join(folder, "README.md"), "utf8"), "# acme/demo-pack\n\nWrites release notes: from the changelog\n");
    assert.equal(readFileSync(join(folder, "LICENSE"), "utf8"), APACHE);
    assert.equal(readFileSync(join(folder, "skills/en/release-notes/SKILL.md"), "utf8"), SKILL_MD);
    assert.equal(readFileSync(join(folder, "specs/en/demo-pack.md"), "utf8"), SPEC_MD);
    // A plain run copies: the skill's own folder stands.
    assert.equal(readFileSync(join(dir, ".claude/skills/release-notes/SKILL.md"), "utf8"), SKILL_MD);
    // The next steps name the folder, the IDE path and the two commands.
    assert.match(result.stdout, /spex-packages\/demo-pack\//);
    assert.match(result.stdout, /Playbooks → Add from folder with\s+acme\/demo-pack and spex-packages\/demo-pack, then Publish on its row/);
    assert(result.stdout.includes("spex package add acme/demo-pack --path spex-packages/demo-pack"));
    assert(result.stdout.includes("spex package publish spex-packages/demo-pack --dry-run"));
    assert.deepEqual(readdirSync(join(dir, "spex-packages")), ["demo-pack"], "no staging folder is left");
    assert.deepEqual(homeBefore(), home, "no Spex storage is touched");
  });

  it("takes the spec's first Intent paragraph without a skill, MIT past a byte order mark, and no LICENSE where the project has none", async () => {
    const mit = project("﻿\n  MIT License\n\nCopyright (c) 2026\n");
    const spec = await init(mit, ["acme/demo-pack", "--spec", "specs/packages/demo-pack.md"]);
    assert.equal(spec.code, 0, spec.stderr);
    const release = await readPublishableRelease(join(mit, "spex-packages/demo-pack"));
    assert.equal(release.manifest.description, "This package states the demo's behavior. It has two lines.");
    assert.equal(release.manifest.license, "MIT");
    assert.deepEqual(Object.keys(release.manifest.artifacts), ["demo-pack"]);

    const bare = project(null);
    const skill = await init(bare, ["acme/notes", "--skill", ".claude/skills/release-notes"]);
    assert.equal(skill.code, 0, skill.stderr);
    const unlicensed = await readPublishableRelease(join(bare, "spex-packages/notes"));
    assert.equal(unlicensed.manifest.license, "Apache-2.0", "Apache-2.0 without a LICENSE");
    assert.equal(existsSync(join(bare, "spex-packages/notes/LICENSE")), false);
  });

  it("lets --description, --license and --language override the defaults", async () => {
    const dir = project();
    const result = await init(dir, [
      "acme/demo-pack", "--skill=.claude/skills/release-notes", "--spec", "specs/packages/demo-pack.md",
      "--description", 'Notes "quoted" #1: done', "--license", "MIT", "--language", "zh-Hans",
    ]);
    assert.equal(result.code, 0, result.stderr);
    const release = await readPublishableRelease(join(dir, "spex-packages/demo-pack"));
    assert.equal(release.manifest.description, 'Notes "quoted" #1: done');
    assert.equal(release.manifest.license, "MIT");
    assert.deepEqual(release.manifest.artifacts, {
      "release-notes": { kind: "skill", language: "zh-Hans", requires: [] },
      "demo-pack": { kind: "spec", language: "zh-Hans", requires: [] },
    });
    assert(release.files.some((f) => f.path === "skills/zh-Hans/release-notes/SKILL.md"));
    assert(release.files.some((f) => f.path === "specs/zh-Hans/demo-pack.md"));
  });

  it("moves the skill folder with --move", async () => {
    const dir = project();
    const result = await init(dir, ["acme/notes", "--skill", ".claude/skills/release-notes", "--move"]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(join(dir, ".claude/skills/release-notes")), false, "the original folder is gone");
    const release = await readPublishableRelease(join(dir, "spex-packages/notes"));
    assert.deepEqual(release.files.map((f) => f.path), [
      "LICENSE", "README.md", "meta.yaml", "skills/en/release-notes/SKILL.md", "skills/en/release-notes/scripts/collect.sh",
    ]);
    assert.equal(statSync(join(dir, "spex-packages/notes/skills/en/release-notes/scripts/collect.sh")).mode & 0o111, 0o111);
  });

  it("refuses each rule before writing anything", async () => {
    const dir = project();
    mkdirSync(join(dir, ".claude/skills/empty"));
    writeFileSync(join(dir, ".claude/skills/empty/README.md"), "No skill here.\n");
    mkdirSync(join(dir, ".claude/skills/spaced"));
    writeFileSync(join(dir, ".claude/skills/spaced/SKILL.md"), "---\nname: Release Notes\ndescription: Spaced\n---\n");
    mkdirSync(join(dir, ".claude/skills/twin"));
    writeFileSync(join(dir, ".claude/skills/twin/SKILL.md"), "---\nname: release-notes\ndescription: Twin\n---\n");
    mkdirSync(join(dir, ".claude/skills/undescribed"));
    writeFileSync(join(dir, ".claude/skills/undescribed/SKILL.md"), "---\nname: undescribed\n---\n");
    mkdirSync(join(dir, ".claude/skills/demo-pack"));
    writeFileSync(join(dir, ".claude/skills/demo-pack/SKILL.md"), "---\nname: demo-pack\ndescription: Same id as the spec\n---\n");
    mkdirSync(join(dir, ".claude/skills/unquoted"));
    writeFileSync(join(dir, ".claude/skills/unquoted/SKILL.md"), "---\nname: unquoted\ndescription: Use it: always\n---\n");
    writeFileSync(join(dir, "specs/packages/other.md"), "# other\n\n## Intent\n\nOther.\n");
    writeFileSync(join(dir, "specs/packages/plain.md"), "# plain\n\nNo intent heading.\n");
    const links = process.platform !== "win32";
    if (links) {
      mkdirSync(join(dir, ".claude/skills/linked"));
      writeFileSync(join(dir, ".claude/skills/linked/SKILL.md"), "---\nname: linked\ndescription: Linked\n---\n");
      symlinkSync("../release-notes/SKILL.md", join(dir, ".claude/skills/linked/other.md"));
      mkdirSync(join(dir, ".claude/skills/piped"));
      writeFileSync(join(dir, ".claude/skills/piped/SKILL.md"), "---\nname: piped\ndescription: Piped\n---\n");
      execFileSync("mkfifo", [join(dir, ".claude/skills/piped/pipe")]);
    }
    // A skill at the working folder's root holds the destination itself.
    writeFileSync(join(dir, "SKILL.md"), "---\nname: rooted\ndescription: Rooted\n---\n");
    const skill = [".claude/skills/release-notes"];
    const cases: [string, string[], RegExp][] = [
      ["a name of capitals", ["Acme/demo-pack", "--skill", ...skill], /<org>\/<name>.*lowercase/],
      ["a name of one part", ["demo-pack", "--skill", ...skill], /<org>\/<name>/],
      ["a name part past 64 characters", [`acme/${"a".repeat(65)}`, "--skill", ...skill], /at most 64 characters/],
      ["no artifact", ["acme/demo-pack"], /at least one artifact/],
      ["a skill folder without SKILL.md", ["acme/demo-pack", "--skill", ".claude/skills/empty"], /no SKILL\.md/],
      ["a missing skill folder", ["acme/demo-pack", "--skill", ".claude/skills/missing"], /no folder holding a SKILL\.md/],
      ["a SKILL.md name that is no Agent Skills name", ["acme/demo-pack", "--skill", ".claude/skills/spaced"], /Agent Skills name/],
      ["a SKILL.md frontmatter YAML refuses", ["acme/demo-pack", "--skill", ".claude/skills/unquoted"], /no YAML.*quotes/],
      ["two skills of one id", ["acme/demo-pack", "--skill", ...skill, "--skill", ".claude/skills/twin"], /Two skills declare the id release-notes/],
      ["a skill of the spec's id", ["acme/demo-pack", "--skill", ".claude/skills/demo-pack", "--spec", "specs/packages/demo-pack.md"], /spec's id demo-pack/],
      ["a spec of another basename", ["acme/demo-pack", "--spec", "specs/packages/other.md"], /must be named demo-pack\.md/],
      ["no description from any source", ["acme/plain", "--skill", ".claude/skills/undescribed", "--spec", "specs/packages/plain.md"], /--description/],
      ["a moved skill folder holding the destination", ["acme/demo-pack", "--skill", ".", "--move"], /cannot move \.: it holds spex-packages\/demo-pack\//],
      ...(links ? [
        ["a skill folder holding a link", ["acme/demo-pack", "--skill", ".claude/skills/linked"], /holds a link at other\.md/],
        ["a skill folder holding a special file", ["acme/demo-pack", "--skill", ".claude/skills/piped"], /holds a special file at pipe/],
      ] as [string, string[], RegExp][] : []),
    ];
    for (const [label, args, message] of cases) {
      const before = snapshot(dir);
      const result = await init(dir, args);
      assert.equal(result.code, 1, `${label}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, message, label);
      assert.equal(result.stdout, "", label);
      assert.deepEqual(snapshot(dir), before, `${label} writes nothing`);
      assert.equal(existsSync(join(dir, "spex-packages")), false, `${label} makes no spex-packages/`);
    }
    // An existing destination is refused and left as it was.
    mkdirSync(join(dir, "spex-packages/demo-pack"), { recursive: true });
    writeFileSync(join(dir, "spex-packages/demo-pack/keep.txt"), "mine\n");
    const before = snapshot(dir);
    const existing = await init(dir, ["acme/demo-pack", "--skill", ...skill, "--move"]);
    assert.equal(existing.code, 1);
    assert.match(existing.stderr, /spex-packages\/demo-pack\/ already exists/);
    assert.deepEqual(snapshot(dir), before, "an existing destination is left as it was");
  });

  it("contacts no server", () => {
    assert.equal(server.connections(), 0);
  });
});

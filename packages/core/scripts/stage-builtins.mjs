#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Stage the built-in spec package (DR-104, environments-11): the
// playbooks the installed @sublang/playbook ships, laid out as the
// release `sublang/playbooks` at Playbook's version under
// assets/builtins/<version>/. Each playbook is an artifact in `en`: its
// text at playbooks/en/<id>/<id>.md and its shipped folder at
// playbooks/en/<id>/<id>.playbook/, with the JavaScript, Markdown and
// JSON files kept and the TypeScript sources, declarations and launcher
// template left out. A package.json marks the folder's JavaScript as
// ES modules, as Playbook's own package does. The copy is gitignored
// and rebuilt at build and test, so it never drifts from the
// dependency.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = join(here, "..");

/** The playbook package the core depends on, found as Node would. */
function findPlaybook() {
  let dir = coreRoot;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, "node_modules", "@sublang", "playbook");
    if (existsSync(join(candidate, "package.json"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("stage-builtins: @sublang/playbook is not installed; run npm ci");
}

const PLAYBOOKS = ["code", "review", "decide", "dev", "branch", "pr", "inspect"];
const REQUIRES = { code: ["review"], decide: ["review"] };
const KEPT = new Set([".js", ".mjs", ".cjs", ".md", ".json"]);
const LEFT_OUT = new Set(["playbook.config.template.yaml"]);

const playbookDir = findPlaybook();
const { version } = JSON.parse(readFileSync(join(playbookDir, "package.json"), "utf8"));
const sdlc = join(playbookDir, "reference", "sdlc");
const root = join(coreRoot, "assets", "builtins");
const target = join(root, version);

function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  chmodSync(to, statSync(from).mode & 0o100 ? 0o755 : 0o644);
}

function copyPlaybookFolder(from, to) {
  for (const name of readdirSync(from).sort()) {
    const source = join(from, name);
    const stat = statSync(source);
    if (stat.isDirectory()) {
      if (name === "node_modules") continue;
      copyPlaybookFolder(source, join(to, name));
      continue;
    }
    if (LEFT_OUT.has(name) || name.endsWith(".d.ts") || name.endsWith(".ts")) continue;
    if (!KEPT.has(extname(name))) continue;
    copyFile(source, join(to, name));
  }
}

rmSync(root, { recursive: true, force: true });
const artifacts = {};
for (const id of PLAYBOOKS) {
  const text = join(sdlc, `${id}.md`);
  const folder = join(sdlc, `${id}.playbook`);
  if (!existsSync(text) || !existsSync(folder)) throw new Error(`stage-builtins: Playbook ${version} ships no ${id} playbook`);
  const artifactDir = join(target, "playbooks", "en", id);
  copyFile(text, join(artifactDir, `${id}.md`));
  copyPlaybookFolder(folder, join(artifactDir, `${id}.playbook`));
  writeFileSync(join(artifactDir, "package.json"), `${JSON.stringify({ type: "module", private: true }, null, 2)}\n`);
  artifacts[id] = { kind: "playbook", language: "en", ...(REQUIRES[id] ? { requires: REQUIRES[id] } : {}) };
}
if (existsSync(join(playbookDir, "LICENSE"))) copyFile(join(playbookDir, "LICENSE"), join(target, "LICENSE"));
writeFileSync(join(target, "README.md"), [
  "# sublang/playbooks",
  "",
  `The built-in playbooks of Playbook ${version}, as the spec package Spex ships and seeds.`,
  "",
].join("\n"));
writeFileSync(join(target, "meta.yaml"), stringify({
  format: 2,
  org: "sublang",
  name: "playbooks",
  version,
  description: "The built-in playbooks Playbook ships: code, review, decide, dev, branch, pr and inspect",
  license: "Apache-2.0",
  repository: "https://github.com/sublang-ai/playbook",
  artifacts,
}, { lineWidth: 0 }));
console.log(`staged built-in spec package sublang/playbooks ${version} -> ${target}`);

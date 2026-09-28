#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pre-release smoke (release-20, DR-086, docs/release-smoke.md): the
// local pass a release candidate makes before tagging. The checks —
// unit, integration and browser journeys — are CI's, and its success
// for the tagged commit is their evidence (release-15), so none of
// them runs here. This builds the tree, lints the specs, installs the
// release from a fresh clone and launches both shells as a user does
// (scripts/install-smoke.mjs), and walks the packed CLI as a user does
// (scripts/cli-smoke.mjs). The desktop renders inside that clone, so
// the developer tree's native module is never flipped to Electron.
// Fail-fast; each stage names itself. `--from=<stage>` resumes at a
// stage once every earlier stage has passed on the current inputs;
// `--keep` keeps the fresh install's scratch directory.
//
// The build, the lint and the CLI user pass read the working tree
// while the fresh install clones HEAD, so a tree with uncommitted
// changes would pass the four stages on two different inputs: the
// smoke refuses one unless `--allow-dirty` says that is meant. The
// release records under docs/releases/ are exempt: no stage reads
// them, and a release's record is written while its gates run.

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const stages = ["build", "lint", "fresh-install", "cli-user"];
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const allowDirty = args.includes("--allow-dirty");
const from = args.find((arg) => arg.startsWith("--from="))?.slice(7) ?? "build";
const timings = [];
let stage = "";

function elapsed(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function selected(name) {
  const include = stages.indexOf(name) >= stages.indexOf(from);
  if (!include) process.stdout.write(`smoke: reusing prior ${name} verification\n`);
  return include;
}

function run(name, command, commandArgs) {
  stage = name;
  process.stdout.write(`\n=== smoke: ${name} ===\n`);
  const started = Date.now();
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`stage "${name}" failed (${command} ${commandArgs.join(" ")})`);
  }
  timings.push(`${name} ${elapsed(Date.now() - started)}`);
}

try {
  const unknown = args.filter(
    (arg) =>
      arg !== "--keep" && arg !== "--allow-dirty" && !arg.startsWith("--from="),
  );
  if (unknown.length > 0) {
    throw new Error(
      `unknown argument ${unknown.join(" ")}; ` +
        "the smoke takes --from=<stage>, --keep and --allow-dirty",
    );
  }
  if (!stages.includes(from)) {
    throw new Error(`--from must name a stage: ${stages.join(", ")}`);
  }
  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--", ".", ":(exclude)docs/releases"],
    { cwd: root, encoding: "utf-8" },
  );
  if (status.status !== 0) {
    throw new Error(`git status failed: ${status.stderr.trim()}`);
  }
  const changes = status.stdout.split("\n").filter(Boolean);
  if (changes.length > 0 && !allowDirty) {
    throw new Error(
      "the working tree has uncommitted changes, which the build, the " +
        "lint and the CLI user pass would test while the fresh install " +
        "tests HEAD; commit or stash them, or pass --allow-dirty:\n" +
        changes.map((line) => `  ${line}`).join("\n"),
    );
  }
  if (changes.length > 0) {
    process.stdout.write(
      `smoke: --allow-dirty: ${changes.length} uncommitted change(s) ` +
        "reach build, lint and cli-user but not the fresh install\n",
    );
  }
  if (selected("build")) run("build", "npm", ["run", "build"]);
  if (selected("lint")) run("lint", "node", ["packages/cli/dist/cli.js", "lint"]);
  // The app as a new user gets it: a fresh clone of the committed tree,
  // `npm ci`, the server shell walked over its token URL, and the
  // desktop rendered by `npm start` — all in a scratch directory.
  if (selected("fresh-install")) {
    run("fresh-install", "node", [
      "scripts/install-smoke.mjs",
      ...(keep ? ["--keep"] : []),
    ]);
  }
  // The CLI as a new user gets it: pack the real tarball, install it
  // into an isolated prefix, and walk the README journeys (fresh
  // scaffold, lint, --lang, --update, legacy detection) via the bin.
  if (selected("cli-user")) run("cli-user", "node", ["scripts/cli-smoke.mjs"]);
  process.stdout.write(`\nsmoke: ${timings.join(" · ")}\n`);
  process.stdout.write(
    from === "build"
      ? "smoke: all stages passed\n"
      : "smoke: selected stages passed; earlier results reused\n",
  );
} catch (error) {
  process.stderr.write(
    `\nsmoke FAILED at ${stage || "arguments"}: ${error.message}\n`,
  );
  process.exit(1);
}

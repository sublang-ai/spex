#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pre-release smoke (release-20, DR-086, DR-089, docs/release-smoke.md):
// the local pass a release candidate makes before tagging. The checks —
// unit, integration and browser journeys — are CI's, and its success
// for the tagged commit is their evidence (release-15), so none of
// them runs here. This builds the tree, lints the specs, installs the
// release from a fresh clone and launches both shells as a user does
// (scripts/install-smoke.mjs), and walks the packed CLI as a user does
// (scripts/cli-smoke.mjs). The desktop renders inside that clone, so
// the developer tree's native module is never flipped to Electron.
// With `--live`, a `live` stage follows: the live desktop smoke
// (scripts/desktop-smoke.mjs, release-22) run from the fresh install's
// clone, in it, on this machine's signed-in agents and a scratch Spex
// home — the app as a new user installed it, calling a real agent —
// its scratch profile made inside the fresh install's scratch, so a
// failure keeps the failed run's home, user data and project there.
// Fail-fast; each stage names itself; an interrupt stops the running
// stage, whose own cleanup runs, and keeps the scratch. `--from=<stage>` resumes at a
// stage once every earlier stage has passed on the current inputs;
// `--keep` keeps the fresh install's scratch directory; `--dry-run`
// names the stages a run would take and runs none.
//
// The build, the lint and the CLI user pass read the working tree
// while the fresh install clones HEAD, so a tree with uncommitted
// changes would pass the four stages on two different inputs: the
// smoke refuses one unless `--allow-dirty` says that is meant. The
// release records under docs/releases/ are exempt: no stage reads
// them, and a release's record is written while its gates run.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const FLAGS = ["--keep", "--allow-dirty", "--live", "--dry-run", "--help"];
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const allowDirty = args.includes("--allow-dirty");
const live = args.includes("--live");
const dryRun = args.includes("--dry-run");
const stages = ["build", "lint", "fresh-install", "cli-user", ...(live ? ["live"] : [])];
const from = args.find((arg) => arg.startsWith("--from="))?.slice(7) ?? "build";
const timings = [];
let stage = "";
/** The fresh install's scratch directory and clone, once handed to the
 * live stage; the smoke then owns their removal. */
let handed;
/** The running stage's process, and the signal that interrupted it. */
let child;
let interrupted;

const USAGE = `Usage: npm run smoke [-- <options>]

Stages, fail-fast: build, lint, fresh-install, cli-user; with --live,
then live — the live desktop smoke inside the fresh install's clone,
on this machine's signed-in agents.

  --live           add the live stage (every app release tag)
  --from=<stage>   resume at a stage once every earlier one has passed
                   on the current inputs; with --live, only up to
                   fresh-install, whose clone the live stage runs in
  --keep           keep the fresh install's scratch directory
  --allow-dirty    run over uncommitted changes, which reach build,
                   lint and cli-user but not the fresh install
  --dry-run        name the stages a run would take, and run none
  --help           print this and exit
`;

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

/** Run a stage's process to its exit, the event loop free meanwhile,
 * so an interrupt reaches the handler below while it runs. */
async function run(name, command, commandArgs, options = {}) {
  stage = name;
  process.stdout.write(`\n=== smoke: ${name} ===\n`);
  const started = Date.now();
  child = spawn(command, commandArgs, { cwd: root, stdio: "inherit", ...options });
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      resolve(code ?? 128 + (constants.signals[signal] ?? 0)),
    );
  }).finally(() => {
    child = undefined;
  });
  if (interrupted) throw new Error(`interrupted by ${interrupted}`);
  if (status !== 0) {
    throw new Error(`stage "${name}" failed (${command} ${commandArgs.join(" ")})`);
  }
  timings.push(`${name} ${elapsed(Date.now() - started)}`);
}

/** A first-time user's shell on this machine for the live stage: its
 * HOME and PATH, so the agents' sign-ins are this machine's, but none
 * of this host's own Spex settings. The driver makes its scratch
 * profile — the app's home and user data, its XDG homes, the Academy
 * project — inside the fresh install's scratch, which the smoke keeps
 * when the stage fails. */
function liveEnv(scratch) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("SPEX_")) continue;
    if (key === "ELECTRON_SKIP_BINARY_DOWNLOAD") continue;
    if (key === "ELECTRON_RUN_AS_NODE") continue;
    env[key] = value;
  }
  return { ...env, SPEX_SMOKE_SCRATCH_DIR: scratch };
}

/** The fresh install's scratch, handed to the live stage, goes once
 * nothing failed in it — unless `--keep` keeps it. */
function removeHanded() {
  if (!handed) return;
  if (keep) {
    process.stdout.write(`smoke: scratch kept (--keep): ${handed.scratch}\n`);
  } else {
    rmSync(handed.scratch, { recursive: true, force: true });
  }
}

/** Say where the smoke stopped and what it keeps: the live stage's
 * failure keeps the clone it failed in, and a failure before it lets
 * the fresh install's passed scratch go. */
function failed(message) {
  process.stderr.write(`\nsmoke FAILED at ${stage || "arguments"}: ${message}\n`);
  if (handed && (stage === "live" || interrupted)) {
    process.stderr.write(`scratch kept for debugging: ${handed.scratch}\n`);
  } else {
    removeHanded();
  }
}

// A terminal's interrupt reaches the running stage with the smoke, in
// one process group; a SIGTERM reaches the smoke alone, so it is passed
// on. Either way the stage runs its own cleanup — the live stage stops
// its app, keeps its scratch and restores its native module — and its
// exit ends the smoke, the scratch kept; between stages the smoke ends
// at once.
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.on(signal, () => {
    if (interrupted) return;
    interrupted = signal;
    process.exitCode = code;
    if (child) {
      if (signal === "SIGTERM") child.kill(signal);
      return;
    }
    failed(`interrupted by ${signal}`);
    process.exit(code);
  });
}

try {
  if (args.includes("--help")) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const unknown = args.filter((arg) => !FLAGS.includes(arg) && !arg.startsWith("--from="));
  if (unknown.length > 0) {
    throw new Error(
      `unknown argument ${unknown.join(" ")}; ` +
        "the smoke takes --live, --from=<stage>, --keep, --allow-dirty, --dry-run and --help",
    );
  }
  if (!stages.includes(from)) {
    throw new Error(`--from must name a stage: ${stages.join(", ")}`);
  }
  if (live && stages.indexOf(from) > stages.indexOf("fresh-install")) {
    throw new Error(
      "the live stage runs inside the fresh install's clone, which only a " +
        "run through fresh-install provides; with --live, --from names build, " +
        "lint or fresh-install",
    );
  }
  if (dryRun) {
    const planned = stages.filter((name) => stages.indexOf(name) >= stages.indexOf(from));
    process.stdout.write(`smoke: --dry-run: ${planned.join(" → ")}\n`);
    process.exit(0);
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
  if (selected("build")) await run("build", "npm", ["run", "build"]);
  if (selected("lint")) await run("lint", "node", ["packages/cli/dist/cli.js", "lint"]);
  // The app as a new user gets it: a fresh clone of the committed tree,
  // `npm ci`, the server shell walked over its token URL, and the
  // desktop rendered by `npm start` — all in a scratch directory, which
  // the live stage, when asked, takes over.
  if (selected("fresh-install")) {
    const handOff = live
      ? join(mkdtempSync(join(tmpdir(), "spex-smoke-")), "hand-off.json")
      : undefined;
    try {
      await run("fresh-install", "node", [
        "scripts/install-smoke.mjs",
        ...(keep ? ["--keep"] : []),
        ...(handOff ? [`--hand-off=${handOff}`] : []),
      ]);
      if (handOff) handed = JSON.parse(readFileSync(handOff, "utf-8"));
    } finally {
      if (handOff) rmSync(dirname(handOff), { recursive: true, force: true });
    }
  }
  // The CLI as a new user gets it: pack the real tarball, install it
  // into an isolated prefix, and walk the README journeys (fresh
  // scaffold, lint, --lang, --update, legacy detection) via the bin.
  if (selected("cli-user")) await run("cli-user", "node", ["scripts/cli-smoke.mjs"]);
  // The live desktop smoke as the new user would run it: the clone's
  // own driver, in the clone, flipping and restoring the clone's
  // native module, its app on this machine's signed-in agents.
  if (live) {
    await run("live", "node", [join(handed.clone, "scripts", "desktop-smoke.mjs")], {
      cwd: handed.clone,
      env: liveEnv(handed.scratch),
    });
    removeHanded();
  }
  process.stdout.write(`\nsmoke: ${timings.join(" · ")}\n`);
  process.stdout.write(
    from === "build"
      ? "smoke: all stages passed\n"
      : "smoke: selected stages passed; earlier results reused\n",
  );
} catch (error) {
  failed(error.message);
  process.exit(interrupted ? process.exitCode : 1);
}

#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Live migration smoke (DR-021): proves a previous-generation user
// can upgrade with what we ship. Copies the deliberately old-gen
// fixture (scripts/fixtures/legacy-tree) into a scratch repo,
// installs the packed CLI and the spec-structure-migration skill,
// and drives a REAL local coding agent through the migration, then
// gates on the skill's checker, `spex lint`, and content survival.
// Requires a signed-in agent CLI (claude and/or codex); NOT
// hermetic, NOT for CI — a local pre-release acceptance gate.
//
//   node scripts/migration-smoke.mjs [--agent claude|codex|both]
//     [--timeout <minutes>] [--keep] [--self-check]
//
// --self-check runs every hermetic stage plus the gates on both a
// known-bad tree (the unmigrated fixture must FAIL) and a
// known-good tree (demo/ must PASS) without launching any agent.

import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const fixture = join(root, "scripts", "fixtures", "legacy-tree");
const skillSource = join(root, "skills", "spec-structure-migration");

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : (args.splice(at, 2)[1] ?? true);
};
const has = (name) => {
  const at = args.indexOf(name);
  if (at === -1) return false;
  args.splice(at, 1);
  return true;
};
const selfCheck = has("--self-check");
const keep = has("--keep");
const agentArg = flag("--agent") ?? "claude";
const timeoutMs = Number(flag("--timeout") ?? 30) * 60_000;
const agents =
  agentArg === "both" ? ["claude", "codex"] : [String(agentArg)];
for (const a of agents) {
  if (a !== "claude" && a !== "codex") {
    console.error(`unknown --agent ${a} (claude | codex | both)`);
    process.exit(1);
  }
}

let stage = "setup";
const say = (line) => process.stdout.write(`migration-smoke: ${line}\n`);
const at = (name) => {
  stage = name;
  say(`— ${name}`);
};

function run(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${cmdArgs.join(" ")} failed`);
  }
}

/** Run and capture; returns {status, output} without throwing. */
function capture(command, cmdArgs, options = {}) {
  const result = spawnSync(command, cmdArgs, {
    encoding: "utf-8",
    ...options,
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

// ---------------------------------------------------------------------------
// Fixture inventory: what must survive the migration.
// ---------------------------------------------------------------------------

const ITEM_HEADING_RE = /^#{3,4} ([A-Z]+-([1-9][0-9]*))\s*$/;

/** Old item ids per file basename, scanned from the fixture. */
function fixtureInventory() {
  const inventory = [];
  for (const dir of ["packages", "compositions"]) {
    const full = join(fixture, "specs", dir);
    for (const file of readdirSync(full)) {
      if (!file.endsWith(".md")) continue;
      const basename = file.replace(/\.md$/, "");
      const numbers = [];
      for (const line of readFileSync(join(full, file), "utf-8").split("\n")) {
        const m = ITEM_HEADING_RE.exec(line);
        if (m) numbers.push(m[2]);
      }
      inventory.push({ basename, numbers });
    }
  }
  return inventory;
}

// Scoped to the fixture's own IR: `spex scaffold --update` seeds the
// current sample intent record beside it, whose boxes are not ours.
const FIXTURE_IR = "001-first-cut.md";

function checkboxCounts(intentsDir) {
  const text = readFileSync(join(intentsDir, FIXTURE_IR), "utf-8");
  return {
    checked: (text.match(/^- \[x\]/gim) ?? []).length,
    unchecked: (text.match(/^- \[ \]/gm) ?? []).length,
  };
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/** All *.md under dir, recursively, as [path, text]. */
function readTree(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        out.push([full, readFileSync(full, "utf-8")]);
      }
    }
  };
  walk(dir);
  return out;
}

/** Mechanical gates over a migrated scratch repo; returns problem list. */
function postGates(repo, spexBin, inventory, boxes, setupCommits) {
  const problems = [];
  const specs = join(repo, "specs");

  const checker = capture("python3", [
    join(repo, ".claude", "skills", "spec-structure-migration", "scripts", "check_specs.py"),
    specs,
  ]);
  if (checker.status !== 0) {
    problems.push(`check_specs.py reports problems:\n${checker.output}`);
  }

  const lint = capture(spexBin, ["lint"], { cwd: repo });
  if (lint.status !== 0) {
    problems.push(`spex lint reports errors:\n${lint.output}`);
  }

  if (existsSync(join(specs, "compositions"))) {
    problems.push("specs/compositions/ still exists");
  }

  // Content survival: every old item number resurfaces as
  // <basename>-<n> on a heading in some packages/ file, and each
  // fixture package/composition still has a file named after it.
  const packageFiles = existsSync(join(specs, "packages"))
    ? readTree(join(specs, "packages"))
    : [];
  const allText = packageFiles.map(([, text]) => text).join("\n");
  for (const { basename, numbers } of inventory) {
    const fileSurvives = packageFiles.some(([path]) =>
      path.endsWith(`${basename}.md`),
    );
    if (!fileSurvives) {
      problems.push(`no packages/**/${basename}.md in the migrated tree`);
    }
    for (const n of numbers) {
      const heading = new RegExp(`^#+\\s+${basename}-${n}\\s*$`, "m");
      if (!heading.test(allText)) {
        problems.push(`item ${basename}-${n} has no heading in packages/`);
      }
    }
  }

  const migratedBoxes = checkboxCounts(join(specs, "intents"));
  if (
    migratedBoxes.checked !== boxes.checked ||
    migratedBoxes.unchecked !== boxes.unchecked
  ) {
    problems.push(
      `IR checkbox states changed: ${boxes.checked}x/${boxes.unchecked}o -> ` +
        `${migratedBoxes.checked}x/${migratedBoxes.unchecked}o`,
    );
  }

  // The exact target is the agent's judgment call; retargeting to
  // ANY todo-list item proves the DR's citation was migrated, not
  // dropped.
  const dr = join(specs, "decisions", "001-storage-choice.md");
  if (!existsSync(dr) || !/todo-list-\d/.test(readFileSync(dr, "utf-8"))) {
    problems.push("DR-001 lost its retargeted todo-list reference");
  }

  const log = capture("git", ["rev-list", "--count", "HEAD"], { cwd: repo });
  if (Number(log.output.trim()) <= setupCommits) {
    problems.push("agent made no migration commit");
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Scratch repo setup (hermetic part of the user journey)
// ---------------------------------------------------------------------------

function packCli(base) {
  at("pack");
  const packDir = join(base, "pack");
  mkdirSync(packDir, { recursive: true });
  run("npm", ["pack", "--pack-destination", packDir], {
    cwd: join(root, "packages", "cli"),
  });
  const tarball = readdirSync(packDir).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("npm pack produced no tarball");
  return join(packDir, tarball);
}

function setupRepo(base, name, tarball) {
  at(`${name}: seed scratch repo`);
  const repo = join(base, name, "repo");
  mkdirSync(repo, { recursive: true });
  cpSync(fixture, repo, { recursive: true });
  const git = (...a) =>
    run("git", a, { cwd: repo, stdio: ["ignore", "ignore", "inherit"] });
  git("init", "-b", "main");
  git("config", "user.email", "smoke@sublang.ai");
  git("config", "user.name", "Migration Smoke");
  // The developer's global config may require signed commits; the
  // scratch repo (and the agent committing inside it) can't sign.
  git("config", "commit.gpgsign", "false");
  git("config", "tag.gpgsign", "false");
  git("add", "-A");
  git("commit", "-q", "-m", "chore: import legacy-generation fixture");

  at(`${name}: install packed CLI`);
  // A real user's install: the tarball into an isolated global
  // prefix (deps resolve from the npm cache/registry — acceptable
  // for a local gate; never touches the developer's real prefix).
  const prefix = join(base, name, "prefix");
  mkdirSync(prefix, { recursive: true });
  run("npm", ["install", "-g", "--prefix", prefix, tarball], { cwd: base });
  const spexBin = join(prefix, "bin", "spex");
  if (!existsSync(spexBin)) throw new Error("spex bin missing after install");
  const env = { ...process.env, PATH: `${join(prefix, "bin")}:${process.env.PATH}` };

  at(`${name}: refresh spec law (spex scaffold --update)`);
  const refresh = capture(spexBin, ["scaffold", "--update"], {
    cwd: repo,
    env,
  });
  process.stdout.write(refresh.output);
  if (refresh.status !== 0) throw new Error("spex scaffold --update failed");
  if (!refresh.output.includes("spec-structure-migration")) {
    throw new Error("legacy tree did not trigger the migration guidance");
  }
  run("git", ["add", "-A"], { cwd: repo });
  run("git", ["commit", "-q", "-m", "chore: refresh spec law templates"], {
    cwd: repo,
  });

  at(`${name}: install migration skill`);
  const skillTarget = join(repo, ".claude", "skills", "spec-structure-migration");
  mkdirSync(dirname(skillTarget), { recursive: true });
  cpSync(skillSource, skillTarget, { recursive: true });

  at(`${name}: pre-gate (fixture must be old-generation)`);
  const pre = capture("python3", [
    join(skillTarget, "scripts", "check_specs.py"),
    join(repo, "specs"),
  ]);
  if (pre.status === 0) {
    throw new Error("check_specs.py passed the unmigrated fixture");
  }
  const preLint = capture(spexBin, ["lint"], { cwd: repo, env });
  if (preLint.status === 0) {
    throw new Error("spex lint passed the unmigrated fixture");
  }

  return { repo, spexBin, env, setupCommits: 2 };
}

// ---------------------------------------------------------------------------
// Agent drivers
// ---------------------------------------------------------------------------

const KICKOFF =
  "Migrate the spec tree specs/ in this repository to the current spec " +
  "generation using the spec-structure-migration skill installed at " +
  ".claude/skills/spec-structure-migration — read its SKILL.md fully and " +
  "follow it, including references/meta-id-mapping.md and " +
  "scripts/check_specs.py. Work on the current branch (the tree is " +
  "clean); commit in reviewable steps. Loop on " +
  "`python3 .claude/skills/spec-structure-migration/scripts/check_specs.py specs` " +
  "and `spex lint` until both are clean. This is a synthetic sample repo " +
  "with no published releases: the item-ID renames are pre-approved, so " +
  "do not stop to ask for confirmation; note judgment calls in your " +
  "final summary instead.";

// Only what the migration needs: file edits (acceptEdits) plus the
// specific commands the skill loops on. Everything runs inside the
// scratch repo.
const CLAUDE_TOOLS = [
  "Bash(git:*)",
  "Bash(python3:*)",
  "Bash(spex:*)",
  "Bash(ls:*)",
  "Bash(cat:*)",
  "Bash(grep:*)",
  "Bash(rg:*)",
  "Bash(find:*)",
  "Bash(mkdir:*)",
  "Bash(mv:*)",
  "Bash(rm:*)",
  "Bash(sed:*)",
  "Bash(awk:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(wc:*)",
  "Bash(diff:*)",
  "Bash(sort:*)",
].join(",");

function agentCommand(agent) {
  if (agent === "claude") {
    return [
      "claude",
      [
        "-p",
        KICKOFF,
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        CLAUDE_TOOLS,
      ],
    ];
  }
  return [
    "codex",
    [
      "exec",
      "-s",
      "workspace-write",
      "-c",
      "shell_environment_policy.inherit=all",
      KICKOFF,
    ],
  ];
}

function driveAgent(agent, repo, env) {
  at(`${agent}: migrate (budget ${timeoutMs / 60_000} min)`);
  const [command, cmdArgs] = agentCommand(agent);
  return new Promise((resolve, reject) => {
    const child = spawn(command, cmdArgs, {
      cwd: repo,
      env,
      stdio: ["ignore", "inherit", "inherit"],
      detached: true,
    });
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
      reject(new Error(`${agent} exceeded the ${timeoutMs / 60_000} min budget`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(undefined);
      else reject(new Error(`${agent} exited with code ${code}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const inventory = fixtureInventory();
const boxes = checkboxCounts(join(fixture, "specs", "intents"));
const base = mkdtempSync(join(tmpdir(), "spex-migration-smoke-"));
const results = [];
let failed = false;

try {
  const tarball = packCli(base);

  if (selfCheck) {
    // Known-bad: the freshly seeded, unmigrated fixture must fail
    // the post-gates (they detect old-generation trees)...
    const { repo, spexBin, setupCommits } = setupRepo(base, "self", tarball);
    at("self-check: post-gates must fail on the unmigrated fixture");
    const bad = postGates(repo, spexBin, inventory, boxes, setupCommits);
    if (bad.length === 0) {
      throw new Error("post-gates passed an unmigrated tree");
    }
    say(`post-gates correctly flag the unmigrated fixture (${bad.length} problems)`);

    // ...and known-good: the migrated demo corpus passes the
    // mechanical gates, proving the gate plumbing itself works.
    at("self-check: checker and lint must pass demo/");
    const checker = capture("python3", [
      join(skillSource, "scripts", "check_specs.py"),
      join(root, "demo", "specs"),
    ]);
    if (checker.status !== 0) {
      throw new Error(`check_specs.py fails on demo/specs:\n${checker.output}`);
    }
    const lint = capture(spexBin, ["lint", join(root, "demo")]);
    if (lint.status !== 0) {
      throw new Error(`spex lint fails on demo/:\n${lint.output}`);
    }
    say("self-check ok");
  } else {
    for (const agent of agents) {
      const { repo, spexBin, env, setupCommits } = setupRepo(
        base,
        agent,
        tarball,
      );
      try {
        await driveAgent(agent, repo, env);
        at(`${agent}: post-gates`);
        const problems = postGates(repo, spexBin, inventory, boxes, setupCommits);
        if (problems.length > 0) {
          for (const p of problems) say(`${agent} FAIL: ${p}`);
          results.push([agent, `FAIL (${problems.length} problems)`, repo]);
          failed = true;
        } else {
          results.push([agent, "PASS", repo]);
        }
      } catch (err) {
        say(`${agent} FAIL: ${err.message}`);
        results.push([agent, "FAIL (run error)", repo]);
        failed = true;
      }
    }
    say("");
    say("agent            result");
    for (const [agent, result, repo] of results) {
      say(`${agent.padEnd(16)} ${result}${keep || result !== "PASS" ? `  (${repo})` : ""}`);
    }
  }
} catch (err) {
  failed = true;
  process.stderr.write(`\nmigration-smoke FAILED at ${stage}: ${err.message}\n`);
  process.stderr.write(`scratch kept for debugging: ${base}\n`);
  process.exit(1);
}

if (failed) {
  process.stderr.write(`\nmigration-smoke FAILED (scratch kept: ${base})\n`);
  process.exit(1);
}
if (keep) {
  say(`scratch kept: ${base}`);
} else {
  rmSync(base, { recursive: true, force: true });
}
say(selfCheck ? "self-check passed" : "all requested agents passed");

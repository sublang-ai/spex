#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// End-user CLI smoke (RELEASE-20, docs/release-smoke.md): packs the
// real @sublang/spex tarball, installs it globally into an isolated
// prefix, and replays the README's fresh-user and upgrading-user
// journeys through the installed `spex` bin — never node dist/cli.js.
// The global install resolves the tarball's runtime dependencies
// against the registry/npm cache; that network touch is acceptable
// for the local pre-release gate (this never runs in CI). Assumes
// `npm run build` already produced packages/cli/dist and scaffold/.
// The scratch dir is removed on success and kept (path printed) on
// failure for debugging.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL(".", import.meta.url)));
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "spex-cli-smoke-")));
const prefix = join(scratch, "prefix");
const binDir = join(prefix, "bin");

// The installed bin resolves via PATH exactly as an end user's would.
// /dev/null global/system git config keeps host settings (signing,
// hooks, init templates) out of both the fixture repos and the git
// calls spex itself makes.
const env = {
  ...process.env,
  PATH: `${binDir}${delimiter}${process.env.PATH}`,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};

let stage = "";

function begin(name) {
  stage = name;
  process.stdout.write(`\n=== cli-smoke: ${name} ===\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Run a setup command; non-zero exit is a stage failure. */
function exec(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    env,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}:\n` +
        `${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return result;
}

/** Run the installed spex bin; exit status is the caller's to assert. */
function spex(args, options) {
  const result = spawnSync("spex", args, { encoding: "utf-8", env, ...options });
  if (result.error) throw result.error;
  return result;
}

const git = (repo, ...args) => exec("git", ["-C", repo, ...args]);

function initRepo(name) {
  const repo = join(scratch, name);
  mkdirSync(repo);
  git(repo, "init", "--quiet");
  git(repo, "config", "user.name", "spex-smoke");
  git(repo, "config", "user.email", "smoke@sublang.ai");
  return repo;
}

function commitAll(repo, message) {
  git(repo, "add", "-A");
  git(repo, "commit", "--quiet", "-m", message);
}

const gitStatus = (repo) => git(repo, "status", "--porcelain").stdout;

function listTree(dir, prefixPath = "") {
  const entries = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry === ".DS_Store") continue;
    const abs = join(dir, entry);
    const rel = prefixPath === "" ? entry : `${prefixPath}/${entry}`;
    if (statSync(abs).isDirectory()) entries.push(...listTree(abs, rel));
    else entries.push(rel);
  }
  return entries;
}

const read = (path) => readFileSync(path, "utf-8");

// The exact seed set a fresh scaffold promises — nothing more, and
// no specs/compositions/ (composition is a package pattern, DR-000).
const SEEDED_SPECS = [
  "decisions/000-spec-structure-format.md",
  "intents/000-spdx-headers.md",
  "map.md",
  "meta.md",
  "packages/git.md",
  "packages/licensing.md",
];
const AGENT_FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];

try {
  begin("preflight");
  for (const staged of ["dist/cli.js", "scaffold/specs/meta.md"]) {
    assert(
      existsSync(join(root, "packages/cli", staged)),
      `packages/cli/${staged} missing — run \`npm run build\` first`,
    );
  }

  begin("pack");
  const pack = () => {
    const out = exec(
      "npm",
      ["pack", "--json", "--pack-destination", scratch],
      { cwd: join(root, "packages/cli") },
    ).stdout;
    return JSON.parse(out)[0].filename;
  };
  let tarballName;
  try {
    tarballName = pack();
  } catch {
    // Concurrent cli test runs restage packages/cli/scaffold; a pack
    // that catches the staging mid-flight gets one retry.
    tarballName = pack();
  }
  const tarball = join(scratch, tarballName);
  assert(existsSync(tarball), `npm pack reported ${tarballName} but wrote nothing`);
  process.stdout.write(`packed ${tarballName}\n`);

  begin("install");
  // A user-style `npm install -g`, isolated by --prefix so the
  // developer's real global prefix is never touched.
  exec(
    "npm",
    ["install", "--global", "--prefix", prefix, "--no-fund", "--no-audit", tarball],
    { cwd: scratch },
  );
  assert(
    existsSync(join(binDir, "spex")),
    `global install left no spex shim under ${binDir}`,
  );
  const usage = spex([], { cwd: scratch });
  assert(
    usage.status === 0 && usage.stdout.includes("Usage: spex"),
    "`spex` on PATH did not print usage",
  );

  begin("fresh-scaffold");
  const fresh = initRepo("fresh");
  const scaffolded = spex(["scaffold"], { cwd: fresh });
  assert(
    scaffolded.status === 0,
    `spex scaffold failed:\n${scaffolded.stdout}${scaffolded.stderr}`,
  );
  const freshTree = listTree(join(fresh, "specs"));
  assert(
    freshTree.join("\n") === SEEDED_SPECS.join("\n"),
    `scaffolded specs/ is not exactly the promised seeds:\n${freshTree.join("\n")}`,
  );
  assert(
    !existsSync(join(fresh, "specs/compositions")),
    "scaffold created specs/compositions/",
  );
  const license = read(join(fresh, "LICENSE"));
  assert(
    license.includes("Apache License") &&
      license.includes("Version 2.0, January 2004"),
    "root LICENSE is not the verbatim Apache-2.0 text",
  );
  for (const agentFile of AGENT_FILES) {
    assert(
      scaffolded.stdout.includes(`${agentFile} (created)`),
      `scaffold did not report ${agentFile} (created)`,
    );
    const content = read(join(fresh, agentFile));
    assert(
      content.includes("## Specs (Source of Truth)") &&
        content.includes("specs/map.md") &&
        content.includes("specs/meta.md"),
      `${agentFile} lacks the managed specs section pointing at map.md/meta.md`,
    );
  }
  // The try-it flow: IR-000 carries exactly the five IR sections and
  // is what `Complete IR-000` hands an agent.
  const ir = read(join(fresh, "specs/intents/000-spdx-headers.md"));
  const irSections = [...ir.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert(
    irSections.join(", ") === "Status, Intent, Deliverables, Tasks, Verification",
    `IR-000 sections are: ${irSections.join(", ")}`,
  );

  begin("fresh-lint-clean");
  const lintClean = spex(["lint"], { cwd: fresh });
  assert(
    lintClean.status === 0 &&
      lintClean.stdout.includes("spex lint: no problems found"),
    `lint on the fresh tree is not clean:\n${lintClean.stdout}${lintClean.stderr}`,
  );

  begin("fresh-rescaffold-idempotent");
  commitAll(fresh, "chore: scaffold specs");
  const rerun = spex(["scaffold"], { cwd: fresh });
  assert(rerun.status === 0, `re-scaffold failed:\n${rerun.stdout}${rerun.stderr}`);
  for (const line of [
    "specs/ (already exists)",
    "specs/meta.md (already exists)",
    "LICENSE (already exists)",
  ]) {
    assert(rerun.stdout.includes(line), `re-scaffold output missing "${line}"`);
  }
  assert(
    gitStatus(fresh) === "",
    `re-scaffold changed user content:\n${gitStatus(fresh)}`,
  );

  begin("agent-selection-switch");
  const agentSwitch = initRepo("agent-switch");
  const selectedAgents = spex(
    ["scaffold", "--agents=claude,kimi"],
    { cwd: agentSwitch },
  );
  assert(
    selectedAgents.status === 0,
    `explicit agent selection failed:\n${selectedAgents.stdout}${selectedAgents.stderr}`,
  );
  assert(
    existsSync(join(agentSwitch, "CLAUDE.md")) &&
      existsSync(join(agentSwitch, "AGENTS.md")) &&
      !existsSync(join(agentSwitch, "GEMINI.md")),
    "explicit Claude/Kimi selection did not map to CLAUDE.md and AGENTS.md only",
  );
  const agentsPath = join(agentSwitch, "AGENTS.md");
  writeFileSync(
    agentsPath,
    `${read(agentsPath).trimEnd()}\n\n## Local instructions\n\nKeep this text.\n`,
  );
  commitAll(agentSwitch, "chore: scaffold for selected agents");
  const switchedAgents = spex(
    ["scaffold", "--update", "--agents=gemini"],
    { cwd: agentSwitch },
  );
  assert(
    switchedAgents.status === 0,
    `agent switch during --update failed:\n${switchedAgents.stdout}${switchedAgents.stderr}`,
  );
  assert(
    !existsSync(join(agentSwitch, "CLAUDE.md")),
    "switching away from Claude kept its managed-only CLAUDE.md",
  );
  const preservedAgents = read(agentsPath);
  assert(
    preservedAgents.includes("## Local instructions") &&
      preservedAgents.includes("Keep this text.") &&
      !preservedAgents.includes("## Specs (Source of Truth)"),
    "switching away from Kimi did not preserve only AGENTS.md user content",
  );
  assert(
    read(join(agentSwitch, "GEMINI.md")).includes(
      "## Specs (Source of Truth)",
    ),
    "switching to Gemini did not create its managed instructions",
  );

  begin("fresh-lint-breakage");
  const gitPack = join(fresh, "specs/packages/git.md");
  const pristineGitPack = read(gitPack);
  // Two documented law breaks in one edit: an unenclosed citation and
  // a relationship-metadata line inside an item body.
  writeFileSync(
    gitPack,
    pristineGitPack.replace("[[git-1](#git-1)]", "[git-1](#git-1)") +
      "\nVerifies: [[git-2](#git-2)]\n",
  );
  const lintBroken = spex(["lint"], { cwd: fresh });
  assert(lintBroken.status !== 0, "lint exited 0 on a broken tree");
  assert(
    /^specs\/packages\/git\.md:\d+: error cite\/item-link: /m.test(lintBroken.stdout),
    `no <path>:<line>: error for the unenclosed citation:\n${lintBroken.stdout}`,
  );
  assert(
    /^specs\/packages\/git\.md:\d+: error item\/metadata-line: /m.test(
      lintBroken.stdout,
    ),
    `no error for the Verifies: metadata line:\n${lintBroken.stdout}`,
  );
  assert(
    /^spex lint: \d+ errors?, \d+ warnings?$/m.test(lintBroken.stdout),
    "broken-tree lint printed no summary count",
  );
  writeFileSync(gitPack, pristineGitPack);
  assert(gitStatus(fresh) === "", "breakage restore left the tree dirty");

  begin("fresh-update-clean");
  const updateClean = spex(["scaffold", "--update"], { cwd: fresh });
  assert(
    updateClean.status === 0,
    `--update failed on a clean tree:\n${updateClean.stdout}${updateClean.stderr}`,
  );
  for (const line of [
    "specs/meta.md (unchanged)",
    "specs/decisions/000-spec-structure-format.md (unchanged)",
    "specs/map.md (unchanged)",
    "specs/intents/000-spdx-headers.md (unchanged)",
    "specs/packages/git.md (unchanged)",
    "specs/packages/licensing.md (unchanged)",
    "spex scaffold --update completed.",
    "git diff -- specs",
    "spex lint",
    // The copy-paste AI merge prompt (bundled update-merge-prompt.md).
    "share this prompt with your AI agent",
    "spec update merge",
  ]) {
    assert(updateClean.stdout.includes(line), `--update output missing "${line}"`);
  }
  assert(gitStatus(fresh) === "", "clean --update changed the tree");

  begin("update-seed-kept");
  const customizedSeed = `${pristineGitPack}\nLocal note: customized by the smoke fixture.\n`;
  writeFileSync(gitPack, customizedSeed);
  commitAll(fresh, "docs: customize the git seed");
  const updateKept = spex(["scaffold", "--update"], { cwd: fresh });
  assert(
    updateKept.status === 0,
    `--update failed on a customized seed:\n${updateKept.stdout}${updateKept.stderr}`,
  );
  assert(
    updateKept.stdout.includes("specs/packages/git.md (kept — user-modified)"),
    `customized seed not reported kept:\n${updateKept.stdout}`,
  );
  assert(
    read(gitPack) === customizedSeed,
    "--update rewrote a customized seed",
  );

  begin("update-framework-overwritten");
  const metaPath = join(fresh, "specs/meta.md");
  const bundledMeta = read(metaPath);
  writeFileSync(metaPath, `${bundledMeta}\nLocal framework edit.\n`);
  commitAll(fresh, "docs: locally edit meta");
  const updateOverwrite = spex(["scaffold", "--update"], { cwd: fresh });
  assert(
    updateOverwrite.status === 0,
    `--update failed on a modified framework file:\n${updateOverwrite.stdout}${updateOverwrite.stderr}`,
  );
  assert(
    updateOverwrite.stdout.includes("specs/meta.md (overwritten — user-modified)"),
    `modified framework file not reported overwritten:\n${updateOverwrite.stdout}`,
  );
  assert(
    updateOverwrite.stderr.includes("WARNING") &&
      updateOverwrite.stderr.includes("specs/meta.md") &&
      updateOverwrite.stderr.includes("git history"),
    `no stderr warning naming the replaced framework file:\n${updateOverwrite.stderr}`,
  );
  assert(
    read(metaPath) === bundledMeta,
    "--update did not restore the bundled meta.md",
  );
  commitAll(fresh, "docs: accept the refreshed meta");

  begin("update-preconditions");
  const bare = join(scratch, "bare");
  mkdirSync(bare);
  const noGit = spex(["scaffold", "--update"], { cwd: bare });
  assert(
    noGit.status !== 0 &&
      noGit.stderr.includes("requires cwd inside a git repository"),
    `--update outside git did not name the precondition:\n${noGit.stderr}`,
  );
  assert(readdirSync(bare).length === 0, "--update outside git wrote files");
  const withPath = spex(["scaffold", "--update", "somewhere"], { cwd: bare });
  assert(
    withPath.status !== 0 &&
      withPath.stderr.includes("does not accept a <path> argument"),
    `--update <path> did not name the precondition:\n${withPath.stderr}`,
  );
  const withLang = spex(["scaffold", "--update", "--lang", "zh"], { cwd: bare });
  assert(
    withLang.status !== 0 && withLang.stderr.includes("does not accept --lang"),
    `--update --lang did not name the precondition:\n${withLang.stderr}`,
  );
  const mapPath = join(fresh, "specs/map.md");
  const cleanMap = read(mapPath);
  writeFileSync(mapPath, `${cleanMap}\nDirty edit.\n`);
  const dirty = spex(["scaffold", "--update"], { cwd: fresh });
  assert(
    dirty.status !== 0 &&
      dirty.stderr.includes("requires a clean specs/ working tree"),
    `--update on a dirty tree did not name the precondition:\n${dirty.stderr}`,
  );
  assert(
    gitStatus(fresh).trim() === "M specs/map.md",
    `dirty-tree --update wrote beyond the dirty edit:\n${gitStatus(fresh)}`,
  );
  writeFileSync(mapPath, cleanMap);

  begin("zh-scaffold");
  const zh = initRepo("zh");
  const priorLicense = "Pre-existing downstream license.\n";
  writeFileSync(join(zh, "LICENSE"), priorLicense);
  const zhScaffold = spex(["scaffold", "--lang", "zh"], { cwd: zh });
  assert(
    zhScaffold.status === 0,
    `spex scaffold --lang zh failed:\n${zhScaffold.stdout}${zhScaffold.stderr}`,
  );
  const zhTree = listTree(join(zh, "specs"));
  assert(
    zhTree.join("\n") === SEEDED_SPECS.join("\n"),
    `zh scaffold tree incomplete:\n${zhTree.join("\n")}`,
  );
  assert(
    read(join(zh, "specs/meta.md")).includes("Authoring language: zh"),
    "zh meta.md does not record the authoring language",
  );
  assert(
    zhScaffold.stdout.includes("LICENSE (already exists)") &&
      read(join(zh, "LICENSE")) === priorLicense,
    "pre-existing LICENSE was not kept byte-identical",
  );
  const zhLint = spex(["lint"], { cwd: zh });
  assert(
    zhLint.status === 0 && zhLint.stdout.includes("no problems found"),
    `lint on the zh tree is not clean:\n${zhLint.stdout}${zhLint.stderr}`,
  );

  begin("zh-update-reuses-language");
  commitAll(zh, "chore: scaffold zh specs");
  const zhUpdate = spex(["scaffold", "--update"], { cwd: zh });
  assert(
    zhUpdate.status === 0,
    `--update failed on the zh tree:\n${zhUpdate.stdout}${zhUpdate.stderr}`,
  );
  assert(
    zhUpdate.stdout.includes("specs/meta.md (unchanged)") &&
      read(join(zh, "specs/meta.md")).includes("Authoring language: zh"),
    "--update did not reuse the recorded zh authoring language",
  );

  begin("legacy-fixture");
  // A minimal previous-generation tree: a compositions/ directory,
  // ALLCAPS item ids, single-bracket citations, old-form meta.md.
  const legacy = initRepo("legacy");
  const legacyFiles = {
    "specs/meta.md": [
      "# Specs Meta",
      "",
      "Authoring language: en",
      "",
      "## META-1",
      "",
      "Spec items use ALLCAPS ids and single-bracket citations.",
      "",
    ].join("\n"),
    "specs/packages/auth.md": [
      "# AUTH: Login",
      "",
      "## AUTH-1",
      "",
      "The login form shall accept a GitHub token.",
      "",
    ].join("\n"),
    "specs/compositions/main.md": [
      "# MAIN: Product",
      "",
      "## MAIN-1",
      "",
      "The product composes [AUTH-1](../packages/auth.md#auth-1) into onboarding.",
      "",
    ].join("\n"),
  };
  for (const [relPath, content] of Object.entries(legacyFiles)) {
    const target = join(legacy, relPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  commitAll(legacy, "chore: legacy generation fixture");

  begin("legacy-lint");
  const legacyLint = spex(["lint"], { cwd: legacy });
  assert(legacyLint.status !== 0, "lint exited 0 on a legacy tree");
  assert(
    /^specs\/compositions:\d+: error structure\/legacy-layout: /m.test(
      legacyLint.stdout,
    ),
    `no structure/legacy-layout error for specs/compositions:\n${legacyLint.stdout}`,
  );
  assert(
    legacyLint.stdout.includes("spec-structure-migration"),
    "legacy-layout finding does not name the migration skill",
  );

  begin("legacy-scaffold-refused");
  const legacyScaffold = spex(["scaffold"], { cwd: legacy });
  assert(
    legacyScaffold.status !== 0,
    "plain scaffold succeeded on a legacy tree",
  );
  assert(
    legacyScaffold.stderr.includes("marks a legacy spec generation") &&
      legacyScaffold.stderr.includes("spex scaffold --update"),
    `refused scaffold did not direct to --update:\n${legacyScaffold.stderr}`,
  );
  assert(gitStatus(legacy) === "", "refused scaffold still wrote files");

  begin("legacy-update");
  const legacyUpdate = spex(["scaffold", "--update"], { cwd: legacy });
  assert(
    legacyUpdate.status === 0,
    `--update failed on the legacy tree:\n${legacyUpdate.stdout}${legacyUpdate.stderr}`,
  );
  for (const line of [
    "specs/meta.md (overwritten — user-modified)",
    "specs/decisions/000-spec-structure-format.md (updated)",
    "specs/map.md (created)",
    "specs/intents/000-spdx-headers.md (created)",
    "specs/packages/git.md (created)",
    "specs/packages/licensing.md (created)",
    "spex scaffold --update completed.",
    // Migration guidance after the completion message.
    "legacy spec generation",
    "skills/spec-structure-migration/",
    "docs/spec-migration.md",
    "spex lint",
  ]) {
    assert(
      legacyUpdate.stdout.includes(line),
      `legacy --update output missing "${line}"`,
    );
  }
  for (const relPath of ["specs/packages/auth.md", "specs/compositions/main.md"]) {
    assert(
      read(join(legacy, relPath)) === legacyFiles[relPath],
      `--update modified legacy file ${relPath}`,
    );
  }
  for (const agentFile of AGENT_FILES) {
    assert(
      existsSync(join(legacy, agentFile)) &&
        read(join(legacy, agentFile)).includes("## Specs (Source of Truth)"),
      `non-interactive --update did not create default ${agentFile}`,
    );
  }

  begin("cleanup");
  rmSync(scratch, { recursive: true, force: true });
  process.stdout.write("\ncli-smoke: all stages passed\n");
} catch (error) {
  process.stderr.write(`\ncli-smoke FAILED at ${stage}: ${error.message}\n`);
  process.stderr.write(`scratch kept for debugging: ${scratch}\n`);
  process.exit(1);
}

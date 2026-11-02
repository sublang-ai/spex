#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The suites a change reaches (release-34, release-43, DR-199): changed
// workspaces and known root tools select their owners and transitive
// dependents. Unknown root paths reach everything; documentation --
// docs/, specs/ and Markdown outside workspaces -- reaches nothing.
//
//   node scripts/affected-tests.mjs [--base <ref>] [--paths <file>] [--root <dir>]
//       prints {"docsOnly":bool,"all":bool,"workspaces":[...]}
//   ... --github-output
//       prints docs-only=true|false and affected=all|<folders>
//   ... --run [all|"<folders>"]
//       runs the script tests, then the tests of everything or of each folder
//       with no explicit selection, documentation alone runs CLI tests and lint

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
// Exact ownership, never a blanket exemption for scripts/ or .github/.
// Unlisted tooling, including dependency and localization configuration,
// keeps the conservative fallback to every workspace (release-34).
const ROOT_OWNERS = new Map([
  ...[
    ".github/workflows/ci.yml",
    ".github/workflows/app-release.yml",
    ".github/workflows/release.yml",
    ".github/workflows/hub-lane.yml",
    "scripts/affected-tests.mjs",
    "scripts/affected-tests.test.mjs",
    "scripts/ci-verdict.mjs",
    "scripts/ci-workflow.test.mjs",
    "scripts/app-release-workflow.test.mjs",
    "scripts/prepush.sh",
    "scripts/merge-on-green.sh",
    "scripts/test-linux.sh",
    "scripts/linux-ci/Dockerfile",
    "scripts/release-notes.mjs",
    "scripts/release-notes.test.mjs",
    "scripts/smoke.mjs",
    "scripts/smoke.test.mjs",
    "scripts/install-smoke.mjs",
    "scripts/cli-smoke.mjs",
    "scripts/desktop-smoke.mjs",
    "scripts/migration-smoke.mjs",
    "scripts/desktop-runner.test.mjs",
    "scripts/source-launch.integration.test.mjs",
    "scripts/live-output.test.mjs",
    "scripts/inspection-browser-cache.test.mjs",
    "scripts/inspection-evidence.test.mjs",
    "scripts/team-server-local.test.mjs",
  ].map((path) => [path, []]),
  ["scripts/start-desktop.mjs", ["apps/desktop"]],
  ["scripts/desktop-runner.mjs", ["apps/desktop"]],
  ["scripts/start-server.mjs", ["apps/server"]],
  ["scripts/storage-git.mjs", ["packages/core"]],
  ["scripts/native-approval-stage.mjs", ["packages/core"]],
  ["scripts/browser-preparation.ts", ["apps/desktop", "e2e"]],
]);

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Expands one workspace glob, `*` matching within a path segment, to the folders it names. */
function expand(root, pattern) {
  let folders = [""];
  for (const segment of pattern.replace(/\/+$/, "").split("/").filter(Boolean)) {
    const next = [];
    for (const folder of folders) {
      if (!segment.includes("*")) {
        next.push(posix.join(folder, segment));
        continue;
      }
      const matcher = new RegExp(`^${segment.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`);
      const parent = join(root, folder);
      if (!isDirectory(parent)) continue;
      for (const entry of readdirSync(parent).sort()) {
        if (!entry.startsWith(".") && matcher.test(entry)) next.push(posix.join(folder, entry));
      }
    }
    folders = next;
  }
  return folders;
}

/** The root's workspaces: each existing folder holding a package.json, with its name and the workspaces it depends on. */
export function readWorkspaces(root) {
  const manifest = readJson(join(root, "package.json"));
  const globs = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages ?? [];
  const found = new Map();
  for (const glob of globs) {
    for (const folder of expand(root, glob)) {
      const file = join(root, folder, "package.json");
      if (found.has(folder) || !existsSync(file)) continue;
      const pkg = readJson(file);
      found.set(folder, { folder, name: pkg.name, pkg });
    }
  }
  const byName = new Map([...found.values()].map((workspace) => [workspace.name, workspace.folder]));
  return [...found.values()].map(({ folder, name, pkg }) => {
    const dependsOn = new Set();
    for (const field of DEPENDENCY_FIELDS) {
      for (const dependency of Object.keys(pkg[field] ?? {})) {
        const target = byName.get(dependency);
        if (target && target !== folder) dependsOn.add(target);
      }
    }
    return { folder, name, dependsOn: [...dependsOn].sort() };
  });
}

/** Documentation: under docs/ or specs/, or a Markdown file outside every workspace -- a workspace's own Markdown is a fixture or a package readme and reaches the workspace. */
export function isDocumentation(path, workspaces = []) {
  if (path.startsWith("docs/") || path.startsWith("specs/")) return true;
  return path.endsWith(".md") && !workspaces.some((workspace) => path.startsWith(`${workspace.folder}/`));
}

/** The reach of a list of changed paths over the root's workspaces. */
export function classify(root, paths) {
  const workspaces = readWorkspaces(root);
  const changed = new Set();
  let all = false;
  let docsOnly = paths.length > 0;
  for (const path of paths) {
    if (isDocumentation(path, workspaces)) continue;
    docsOnly = false;
    const owner = workspaces.find((workspace) => path.startsWith(`${workspace.folder}/`));
    if (owner) changed.add(owner.folder);
    else {
      const owners = ROOT_OWNERS.get(path);
      if (owners === undefined || owners.some((folder) => !workspaces.some((workspace) => workspace.folder === folder))) all = true;
      else for (const folder of owners) changed.add(folder);
    }
  }
  // Every transitive dependent of a changed workspace is reached too.
  const dependents = new Map(workspaces.map((workspace) => [workspace.folder, []]));
  for (const workspace of workspaces) {
    for (const dependency of workspace.dependsOn) dependents.get(dependency).push(workspace.folder);
  }
  const reached = new Set(changed);
  const queue = [...changed];
  while (queue.length > 0) {
    for (const dependent of dependents.get(queue.shift())) {
      if (reached.has(dependent)) continue;
      reached.add(dependent);
      queue.push(dependent);
    }
  }
  return { docsOnly, all, workspaces: [...reached].sort() };
}

/** Tracked changes against the merge base, both sides of a rename, and untracked files outside Git's ignores. */
export function changedPaths(root, base) {
  const output = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", "--merge-base", base], { cwd: root, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  return [...new Set(`${output}${untracked}`.split("\0").filter(Boolean))].sort();
}

function readPathsFile(file) {
  return readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** The value `--github-output` writes for `affected`. */
export function affectedValue(result) {
  return result.all ? "all" : result.workspaces.join(" ");
}

/** The commands `--run` runs for an `affected` value: `all`, or space-separated folders, empty for none. */
export function commandsFor(affected) {
  const commands = [["run", "test:scripts"]];
  if (affected.trim() === "all") {
    commands.push(["test", "--workspaces", "--if-present"]);
  } else {
    for (const folder of affected.split(/\s+/).filter(Boolean)) commands.push(["test", "-w", folder, "--if-present"]);
  }
  return commands;
}

function runCommand(root, executable, args) {
  const label = executable === process.execPath ? "node" : executable;
  console.log(`affected-tests: ${label} ${args.join(" ")}`);
  const result = spawnSync(executable, args, { cwd: root, stdio: "inherit", shell: executable === "npm" && process.platform === "win32" });
  if (result.error) {
    console.error(`affected-tests: ${label} could not start: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function run(root, commands) {
  for (const args of commands) {
    const status = runCommand(root, "npm", args);
    if (status !== 0) return status;
  }
  return 0;
}

function parseArgs(argv) {
  const options = { base: "origin/main", paths: undefined, root: resolve(import.meta.dirname, ".."), githubOutput: false, run: false, runValue: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      i += 1;
      return argv[i];
    };
    if (arg === "--base") options.base = value();
    else if (arg === "--paths") options.paths = value();
    else if (arg === "--root") options.root = resolve(value());
    else if (arg === "--github-output") options.githubOutput = true;
    else if (arg === "--run") {
      options.run = true;
      // An argument that is an empty string means none; no argument means compute it.
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        i += 1;
        options.runValue = argv[i];
      }
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  const compute = () => classify(options.root, options.paths === undefined ? changedPaths(options.root, options.base) : readPathsFile(options.paths));
  if (options.run) {
    let affected = options.runValue;
    if (affected === undefined) {
      const result = compute();
      if (result.docsOnly) {
        console.log("affected-tests: documentation alone runs the CLI tests and spec lint");
        return run(options.root, [["test", "-w", "packages/cli"]])
          || runCommand(options.root, process.execPath, ["packages/cli/dist/cli.js", "lint"]);
      }
      affected = affectedValue(result);
      console.log(`affected-tests: the change reaches ${affected === "" ? "no workspace" : affected}`);
    }
    return run(options.root, commandsFor(affected));
  }
  const result = compute();
  if (options.githubOutput) {
    console.log(`docs-only=${result.docsOnly}`);
    console.log(`affected=${affectedValue(result)}`);
  } else {
    console.log(JSON.stringify(result));
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`affected-tests: ${error.message}`);
    process.exitCode = 2;
  }
}

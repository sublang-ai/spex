#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The suites a change reaches (release-34, release-43, DR-185): the
// paths a change touched, each classed as documentation, a workspace or
// the root, and the workspaces they reach through the internal
// dependency graph -- the changed ones and every transitive dependent.
// A root path reaches everything; documentation reaches nothing.
//
//   node scripts/affected-tests.mjs [--base <ref>] [--paths <file>] [--root <dir>]
//       prints {"docsOnly":bool,"all":bool,"workspaces":[...]}
//   ... --github-output
//       prints docs-only=true|false and affected=all|<folders>
//   ... --run [all|"<folders>"]
//       runs the script tests, then the tests of everything or of each folder

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve } from "node:path";

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

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

/** Documentation: under docs/ or specs/, or a Markdown file. */
export function isDocumentation(path) {
  return path.startsWith("docs/") || path.startsWith("specs/") || path.endsWith(".md");
}

/** The reach of a list of changed paths over the root's workspaces. */
export function classify(root, paths) {
  const workspaces = readWorkspaces(root);
  const changed = new Set();
  let all = false;
  let docsOnly = paths.length > 0;
  for (const path of paths) {
    if (isDocumentation(path)) continue;
    docsOnly = false;
    const owner = workspaces.find((workspace) => path.startsWith(`${workspace.folder}/`));
    if (owner) changed.add(owner.folder);
    else all = true;
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

/** The paths the working tree changed against the merge base with `base`, both sides of a rename. */
export function changedPaths(root, base) {
  const output = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", "--merge-base", base], { cwd: root, encoding: "utf8" });
  return output.split("\0").filter(Boolean);
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

function run(root, commands) {
  for (const args of commands) {
    console.log(`affected-tests: npm ${args.join(" ")}`);
    const result = spawnSync("npm", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
    if (result.error) {
      console.error(`affected-tests: npm could not start: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) return result.status ?? 1;
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
      affected = affectedValue(compute());
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

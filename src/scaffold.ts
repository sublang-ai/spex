// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { appendAgentSpecs } from "./append-agent-specs.js";
import {
  copyTemplates,
  getFrameworkSpecFiles,
  overwriteFrameworkSpecFiles,
  refreshPristineSeeds,
} from "./copy-templates.js";
import { createSpecsStructure } from "./create-specs-structure.js";
import { resolveBase } from "./resolve-base.js";

const FRAMEWORK_MERGE_PROMPT = `I just ran \`spex scaffold --update\`. The spex framework files in
my working tree (specs/meta.md and specs/decisions/000-spec-structure-format.md)
have new bundled versions; my prior versions are in HEAD.

Review the diffs. If section headings or requirement IDs in those
files changed, update citations across specs/ (DRs, IRs, items,
map.md) to match. If I had local extensions in DR-000, reapply
them on top of the new content. Stop and ask if framework intent
is ambiguous; don't guess.`;

type ScaffoldOptions =
  | { mode: "create"; pathArg?: string }
  | { mode: "update" };

function parseArgs(args: string[]): ScaffoldOptions {
  const updateIndex = args.indexOf("--update");
  if (updateIndex !== -1) {
    if (args.length !== 1) {
      throw new Error("--update does not accept a <path> argument");
    }
    return { mode: "update" };
  }

  if (args.length > 1) {
    throw new Error(`Unexpected arguments: ${args.slice(1).join(" ")}`);
  }

  return { mode: "create", pathArg: args[0] };
}

function getGitRoot(): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("--update requires cwd inside a git repository");
  }
}

function assertCleanSpecsTree(basePath: string): void {
  const status = execFileSync("git", ["status", "--porcelain", "--", "specs"], {
    cwd: basePath,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (status.trim() !== "") {
    throw new Error("--update requires a clean specs/ working tree");
  }
}

function assertFrameworkFilesTracked(basePath: string): void {
  const missing = getFrameworkSpecFiles().filter((relPath) => {
    try {
      execFileSync("git", ["cat-file", "-e", `HEAD:${relPath}`], {
        cwd: basePath,
        stdio: "ignore",
      });
      return false;
    } catch {
      return true;
    }
  });

  if (missing.length > 0) {
    throw new Error(
      `--update requires framework files tracked in HEAD: ${missing.join(", ")}`,
    );
  }
}

function updateScaffoldTemplates(): void {
  const basePath = getGitRoot();
  assertCleanSpecsTree(basePath);
  assertFrameworkFilesTracked(basePath);
  overwriteFrameworkSpecFiles(basePath);
  const seedReport = refreshPristineSeeds(basePath);
  console.log("");
  console.log(FRAMEWORK_MERGE_PROMPT);
  if (seedReport.refreshed.length > 0) {
    console.log("");
    console.log("Pristine seeds also refreshed (no prior customization detected):");
    for (const relPath of seedReport.refreshed) {
      console.log(`- ${relPath}`);
    }
  }
}

/**
 * Entry point for the scaffold subcommand.
 * @param args - Arguments after the scaffold subcommand
 */
export function scaffold(args: string[] = []): void {
  try {
    const options = parseArgs(args);

    if (options.mode === "update") {
      updateScaffoldTemplates();
      return;
    }

    const basePath = resolveBase(options.pathArg);

    createSpecsStructure(basePath);
    copyTemplates(basePath);
    appendAgentSpecs(basePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`spex scaffold: ${msg}`);
    process.exit(1);
  }
}

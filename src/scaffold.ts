// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { appendAgentSpecs } from "./append-agent-specs.js";
import {
  copyTemplates,
  getScaffoldSpecFiles,
  overwriteScaffoldSpecFiles,
} from "./copy-templates.js";
import { createSpecsStructure } from "./create-specs-structure.js";
import { resolveBase } from "./resolve-base.js";

const MERGE_PROMPT = `I just ran \`spex scaffold --update\` in this repo. My working tree
now has the new spex framework templates in \`specs/\`; my prior
customized versions are in HEAD.

Merge them: keep my project content from HEAD (my DRs, IRs, items,
map.md entries, any sections I added) while adopting the new
framework content from the working tree (meta.md rules, scaffolded
examples, conventions). For files in both, update my citations to
follow renamed sections or renumbered IDs.

Write the merged result to the working tree. Stop and ask if
framework intent is ambiguous; don't guess.`;

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

function assertScaffoldFilesTracked(basePath: string): void {
  const missing = getScaffoldSpecFiles().filter((relPath) => {
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
      `--update requires scaffold-provided files tracked in HEAD: ${missing.join(
        ", ",
      )}`,
    );
  }
}

function updateScaffoldTemplates(): void {
  const basePath = getGitRoot();
  assertCleanSpecsTree(basePath);
  assertScaffoldFilesTracked(basePath);
  overwriteScaffoldSpecFiles(basePath);
  console.log("");
  console.log(MERGE_PROMPT);
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

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { appendAgentSpecs } from "./append-agent-specs.js";
import { readBundledMarkdown } from "./bundled-scaffold.js";
import {
  copyTemplates,
  getFrameworkSpecFiles,
  overwriteFrameworkSpecFiles,
  refreshPristineSeeds,
} from "./copy-templates.js";
import { createSpecsStructure } from "./create-specs-structure.js";
import { resolveBase } from "./resolve-base.js";

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

function readUpdateMergePrompt(): string {
  return readBundledMarkdown("update-merge-prompt.md");
}

function updateScaffoldTemplates(): void {
  const basePath = getGitRoot();
  assertCleanSpecsTree(basePath);
  assertFrameworkFilesTracked(basePath);
  overwriteFrameworkSpecFiles(basePath);
  const seedReport = refreshPristineSeeds(basePath);
  console.log("");
  console.log("spex scaffold --update completed.");
  console.log("Review the file indicators above, then run `git diff -- specs`.");
  console.log(
    "Use this prompt with your AI agent to reconcile citations and local extensions:",
  );
  console.log("");
  console.log(readUpdateMergePrompt());
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

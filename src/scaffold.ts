// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { appendAgentSpecs } from "./append-agent-specs.js";
import { readBundledMarkdown } from "./bundled-scaffold.js";
import {
  copyTemplates,
  getSeedSpecFiles,
  migrateLegacyItemLayout,
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

function readUpdateMergePrompt(): string {
  return readBundledMarkdown("update-merge-prompt.md");
}

function updateScaffoldTemplates(): void {
  const basePath = getGitRoot();
  assertCleanSpecsTree(basePath);
  const legacyResults = migrateLegacyItemLayout(basePath);
  const seedPaths = new Set(getSeedSpecFiles());
  const migratedSeedSources = new Map<string, string>();
  for (const result of legacyResults) {
    if (result.status === "migrated" && seedPaths.has(result.targetRelPath)) {
      migratedSeedSources.set(result.targetRelPath, result.legacyRelPath);
    }
  }
  for (const result of legacyResults) {
    if (result.status === "conflict") {
      console.log(
        `  ${result.legacyRelPath} (kept — target exists at ${result.targetRelPath})`,
      );
    } else if (!seedPaths.has(result.targetRelPath)) {
      console.log(
        `  ${result.targetRelPath} (migrated from ${result.legacyRelPath})`,
      );
    }
  }
  overwriteFrameworkSpecFiles(basePath);
  refreshPristineSeeds(basePath, { migratedFrom: migratedSeedSources });
  console.log("");
  console.log("spex scaffold --update completed.");
  console.log(
    "Review the file indicators above and inspect changes (e.g., `git diff -- specs`).",
  );
  console.log(
    "Optionally, share this prompt with your AI agent to reconcile citations and local extensions:",
  );
  console.log("");
  console.log("```");
  console.log(readUpdateMergePrompt());
  console.log("```");
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

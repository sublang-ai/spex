// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendAgentSpecs } from "./append-agent-specs.js";
import { readBundledMarkdown } from "./bundled-scaffold.js";
import {
  copyTemplates,
  formatSupportedLanguages,
  getSeedSpecFiles,
  isSupportedLanguage,
  migrateLegacyItemLayout,
  overwriteFrameworkSpecFiles,
  refreshPristineSeeds,
  type ScaffoldLanguage,
} from "./copy-templates.js";
import { createSpecsStructure } from "./create-specs-structure.js";
import { resolveBase } from "./resolve-base.js";

type ScaffoldOptions =
  | { mode: "create"; pathArg?: string; language?: ScaffoldLanguage }
  | { mode: "update" };

const AUTHORING_LANGUAGE_RE = /^Authoring language:\s*([A-Za-z0-9-]+)\s*$/m;

function parseLanguage(code: string): ScaffoldLanguage {
  if (isSupportedLanguage(code)) return code;
  throw new Error(
    `Unsupported language code: ${code}. Supported codes: ${formatSupportedLanguages()}`,
  );
}

function parseArgs(args: string[]): ScaffoldOptions {
  let update = false;
  let language: ScaffoldLanguage | undefined;
  const pathArgs: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--update") {
      update = true;
      continue;
    }
    if (arg === "--lang") {
      const code = args[i + 1];
      if (code === undefined) {
        throw new Error("--lang requires a language code");
      }
      if (language !== undefined) {
        throw new Error("--lang may only be specified once");
      }
      language = parseLanguage(code);
      i += 1;
      continue;
    }
    if (arg.startsWith("--lang=")) {
      if (language !== undefined) {
        throw new Error("--lang may only be specified once");
      }
      language = parseLanguage(arg.slice("--lang=".length));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    pathArgs.push(arg);
  }

  if (update) {
    if (language !== undefined) {
      throw new Error("--update does not accept --lang");
    }
    if (pathArgs.length !== 0) {
      throw new Error("--update does not accept a <path> argument");
    }
    return { mode: "update" };
  }

  if (pathArgs.length > 1) {
    throw new Error(`Unexpected arguments: ${pathArgs.slice(1).join(" ")}`);
  }

  return { mode: "create", pathArg: pathArgs[0], language };
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

function readActiveLanguage(basePath: string): ScaffoldLanguage {
  const metaPath = join(basePath, "specs", "meta.md");
  if (!existsSync(metaPath)) return "en";

  const match = readFileSync(metaPath, "utf-8").match(AUTHORING_LANGUAGE_RE);
  if (match === null) return "en";
  return parseLanguage(match[1]);
}

function resolveCreateLanguage(
  basePath: string,
  requestedLanguage: ScaffoldLanguage | undefined,
): ScaffoldLanguage {
  const metaPath = join(basePath, "specs", "meta.md");
  if (!existsSync(metaPath)) return requestedLanguage ?? "en";

  const activeLanguage = readActiveLanguage(basePath);
  if (
    requestedLanguage !== undefined &&
    requestedLanguage !== activeLanguage
  ) {
    throw new Error(
      `--lang ${requestedLanguage} does not match existing authoring language ${activeLanguage}`,
    );
  }
  return activeLanguage;
}

function warnReplacedFrameworkFiles(replaced: string[]): void {
  if (replaced.length === 0) return;
  console.warn("");
  console.warn(
    "WARNING: --update replaced framework file(s) that contained local modifications:",
  );
  for (const relPath of replaced) {
    console.warn(`  - ${relPath}`);
  }
  console.warn(
    "These files are maintained by spex and were refreshed to the bundled version.",
  );
  console.warn(
    "Your previous content remains in git history; review what changed with",
  );
  console.warn(
    "`git diff -- specs` and reapply any local additions on top of the refreshed file.",
  );
}

function updateScaffoldTemplates(): void {
  const basePath = getGitRoot();
  assertCleanSpecsTree(basePath);
  const language = readActiveLanguage(basePath);
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
  const replacedFramework = overwriteFrameworkSpecFiles(basePath, language);
  refreshPristineSeeds(basePath, {
    language,
    migratedFrom: migratedSeedSources,
  });
  warnReplacedFrameworkFiles(replacedFramework);
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
    const language = resolveCreateLanguage(basePath, options.language);

    createSpecsStructure(basePath);
    copyTemplates(basePath, language);
    appendAgentSpecs(basePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`spex scaffold: ${msg}`);
    process.exit(1);
  }
}

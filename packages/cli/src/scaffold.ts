// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendAgentSpecs } from "./append-agent-specs.js";
import { readBundledMarkdown } from "./bundled-scaffold.js";
import {
  copyRootLicense,
  copyTemplates,
  formatSupportedLanguages,
  getFrameworkSpecFiles,
  getSeedSpecFiles,
  isPristine,
  isSupportedLanguage,
  listFiles,
  migrateLegacyItemLayout,
  overwriteFrameworkSpecFiles,
  refreshPristineSeeds,
  type ScaffoldLanguage,
} from "./copy-templates.js";
import { createSpecsStructure } from "./create-specs-structure.js";
import {
  migratePackageLayout,
  rewriteAllSpecCitations,
  type PackageMigrationOutcome,
} from "./migrate-package-layout.js";
import { resolveBase } from "./resolve-base.js";
import { restructureMap } from "./restructure-map.js";

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

function warnAnchorCollisions(
  collisions: PackageMigrationOutcome["anchorCollisions"],
): void {
  if (collisions.length === 0) return;
  console.warn("");
  console.warn(
    "NOTE: merging created duplicate section anchors; rename one of each pair",
  );
  console.warn("so citations stay unambiguous:");
  for (const { targetRelPath, slugs } of collisions) {
    console.warn(`  - ${targetRelPath}: #${slugs.join(", #")}`);
  }
}

/** Pristine framework/seed paths, sampled before any byte edits. */
function snapshotPristinePaths(
  basePath: string,
  language: ScaffoldLanguage,
): Set<string> {
  const pristine = new Set<string>();
  for (const relPath of [...getFrameworkSpecFiles(), ...getSeedSpecFiles()]) {
    if (isPristine(basePath, relPath, language) === "pristine") {
      pristine.add(relPath);
    }
  }
  return pristine;
}

function hasMarkdownFiles(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return listFiles(dir).some((file) => file.endsWith(".md"));
}

function updateScaffoldTemplates(): void {
  const basePath = getGitRoot();
  assertCleanSpecsTree(basePath);
  const language = readActiveLanguage(basePath);

  // Classify framework/seed files before any byte edits: recognized
  // bundled versions get replaced wholesale below, so the citation
  // rewrite and map restructure must leave them alone.
  const pristineSnapshot = snapshotPristinePaths(basePath, language);

  const legacyResults = migrateLegacyItemLayout(basePath);
  const provenance = new Map<string, string>();
  for (const result of legacyResults) {
    if (result.status === "migrated") {
      provenance.set(result.targetRelPath, result.legacyRelPath);
    }
  }

  const packageOutcome = migratePackageLayout(basePath, {
    language,
    provenance,
  });

  const rewritten = rewriteAllSpecCitations(basePath, pristineSnapshot);

  let mapRestructured = false;
  const mapPath = join(basePath, "specs", "map.md");
  if (
    packageOutcome.migratedPackages &&
    !pristineSnapshot.has("specs/map.md") &&
    existsSync(mapPath)
  ) {
    const restructured = restructureMap(
      readFileSync(mapPath, "utf-8"),
      language,
    );
    if (restructured !== null) {
      writeFileSync(mapPath, restructured);
      mapRestructured = true;
    }
  }

  // Reporting: one indicator line per path (SCAF-11). The items→flat
  // step reports only paths the package migration did not consume;
  // package targets on seed paths fold into the seed refresh line.
  const seedPaths = new Set<string>(getSeedSpecFiles());
  const frameworkPaths = new Set<string>(getFrameworkSpecFiles());
  const migratedSeedSources = new Map<string, string>();
  const reportedPaths = new Set<string>();

  for (const result of legacyResults) {
    if (result.status === "conflict") {
      console.log(
        `  ${result.legacyRelPath} (kept — target exists at ${result.targetRelPath})`,
      );
    } else if (existsSync(join(basePath, result.targetRelPath))) {
      // Still at the flat path: the package migration left it there.
      console.log(
        `  ${result.targetRelPath} (migrated from ${result.legacyRelPath})`,
      );
    }
  }

  for (const result of packageOutcome.results) {
    const sources = result.sourceRelPaths.join(", ");
    if (result.status === "conflict") {
      for (const source of result.sourceRelPaths) {
        console.log(
          `  ${source} (kept — target exists at ${result.targetRelPath})`,
        );
      }
      continue;
    }
    if (seedPaths.has(result.targetRelPath)) {
      migratedSeedSources.set(result.targetRelPath, sources);
      continue;
    }
    console.log(`  ${result.targetRelPath} (migrated from ${sources})`);
    reportedPaths.add(result.targetRelPath);
  }

  for (const relPath of rewritten) {
    if (
      seedPaths.has(relPath) ||
      frameworkPaths.has(relPath) ||
      reportedPaths.has(relPath)
    ) {
      continue;
    }
    console.log(`  ${relPath} (citations rewritten)`);
  }

  const replacedFramework = overwriteFrameworkSpecFiles(basePath, language);

  const indicatorOverrides = new Map<string, string>();
  if (mapRestructured) {
    indicatorOverrides.set(
      "specs/map.md",
      "restructured for the packages layout",
    );
  }
  for (const relPath of rewritten) {
    if (seedPaths.has(relPath) && !indicatorOverrides.has(relPath)) {
      indicatorOverrides.set(
        relPath,
        "kept — user-modified; citations rewritten",
      );
    }
  }
  refreshPristineSeeds(basePath, {
    language,
    migratedFrom: migratedSeedSources,
    indicatorOverrides,
  });

  appendAgentSpecs(basePath, { createMissing: false });

  warnReplacedFrameworkFiles(replacedFramework);
  warnAnchorCollisions(packageOutcome.anchorCollisions);

  console.log("");
  console.log("spex scaffold --update completed.");
  console.log(
    "Review the file indicators above and inspect changes (e.g., `git diff -- specs`),",
  );
  console.log("then run `spex lint` to check the specs tree.");
  console.log(
    "Optionally, share this prompt with your AI agent to reconcile citations and local extensions:",
  );
  console.log("");
  console.log("```");
  console.log(readBundledMarkdown("update-merge-prompt.md"));
  console.log("```");

  const interactionsEmpty = !hasMarkdownFiles(
    join(basePath, "specs", "interactions"),
  );
  const packagesPresent = hasMarkdownFiles(
    join(basePath, "specs", "packages"),
  );
  if (
    packageOutcome.migratedPackages ||
    (interactionsEmpty && packagesPresent)
  ) {
    console.log("");
    console.log(
      "specs/interactions/ is where cross-package behavior lives. Share this",
    );
    console.log("prompt with your AI agent to fill it in:");
    console.log("");
    console.log("```");
    console.log(readBundledMarkdown("interactions-prompt.md"));
    console.log("```");
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
    const language = resolveCreateLanguage(basePath, options.language);

    createSpecsStructure(basePath);
    copyTemplates(basePath, language);
    copyRootLicense(basePath);
    appendAgentSpecs(basePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`spex scaffold: ${msg}`);
    process.exit(1);
  }
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { appendAgentSpecs } from "./append-agent-specs.js";
import { getScaffoldDir, readBundledMarkdown } from "./bundled-scaffold.js";
import {
  canonicalContentHash,
  copyRootLicense,
  copyTemplates,
  formatSupportedLanguages,
  getFileHistory,
  isLegacyPristine,
  isPristine,
  isSupportedLanguage,
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

// SCAF-26 / SCAF-52: directories that mark a legacy spec generation.
// Structural migration of a legacy generation is agent-skill work, not
// CLI code (DR-021), so the CLI only detects these and points at the
// spec-structure-migration skill.
const LEGACY_GENERATION_DIRS = [
  "user",
  "dev",
  "test",
  "items",
  "interactions",
  "compositions",
  "iterations",
] as const;

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
  const resolved = resolveActiveLanguage(basePath);
  return resolved.kind === "undeterminable" ? "en" : resolved.language;
}

type LanguageResolution =
  | { kind: "declared"; language: ScaffoldLanguage }
  | { kind: "bundled-english"; language: "en" }
  | { kind: "undeterminable"; reason: "absent" | "unrecognized" };

/**
 * Resolve the tree's authoring language and how confidently.
 *
 * A declaration is definitive. Absent one, `specs/meta.md` matching a
 * version this CLI shipped is still definitive — every bundled base
 * `meta.md` is English — which keeps pre-marker trees updating
 * silently. What remains is genuinely undeterminable: a file we never
 * shipped that declares nothing (a localized tree whose marker line
 * was lost reads exactly like this), or no file at all. Guessing `en`
 * there replaces a localized tree's framework files with English, so
 * the caller stops instead.
 */
function resolveActiveLanguage(basePath: string): LanguageResolution {
  const metaPath = join(basePath, "specs", "meta.md");
  if (!existsSync(metaPath)) {
    return { kind: "undeterminable", reason: "absent" };
  }

  const content = readFileSync(metaPath);
  const match = content.toString("utf-8").match(AUTHORING_LANGUAGE_RE);
  if (match !== null) {
    return { kind: "declared", language: parseLanguage(match[1]) };
  }
  if (getFileHistory("specs/meta.md").includes(canonicalContentHash(content))) {
    return { kind: "bundled-english", language: "en" };
  }
  return { kind: "undeterminable", reason: "unrecognized" };
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

function hasLegacyGenerationDir(basePath: string): boolean {
  return LEGACY_GENERATION_DIRS.some((dir) => {
    const abs = join(basePath, "specs", dir);
    return existsSync(abs) && statSync(abs).isDirectory();
  });
}

// SCAF-26: a specs/meta.md matching a pre-packages bundled version in
// its chronological history is an old-generation marker. Every
// pre-packages bundled meta.md carried uppercase META-* item IDs, so a
// recognized bundled version with an uppercase item heading predates
// the packages generation.
function isOldGenerationMeta(
  basePath: string,
  language: ScaffoldLanguage,
): boolean {
  const relPath = "specs/meta.md";
  if (isPristine(basePath, relPath, language) !== "pristine") return false;
  const content = readFileSync(join(basePath, relPath), "utf-8");
  return /^#{1,6} META-\d+/m.test(content);
}

// SCAF-26 / SCAF-47: target content matching a retired bundled seed in
// the legacy manifest is an old-generation marker.
function matchesRetiredBundledSeed(basePath: string): boolean {
  const manifestPath = join(getScaffoldDir(), ".legacy-file-history.json");
  if (!existsSync(manifestPath)) return false;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
    string,
    string[]
  >;
  return Object.keys(manifest).some(
    (relPath) => isLegacyPristine(basePath, relPath) === "pristine",
  );
}

/** SCAF-26 legacy-generation detection, sampled before the refresh. */
function detectLegacyGeneration(
  basePath: string,
  language: ScaffoldLanguage,
): boolean {
  return (
    hasLegacyGenerationDir(basePath) ||
    isOldGenerationMeta(basePath, language) ||
    matchesRetiredBundledSeed(basePath)
  );
}

// SCAF-26: the guidance names the migration skill, its guide, and the
// lint gate. No path-level summary lines here — the per-file indicators
// above are the run's only path summary (SCAF-11).
function printMigrationGuidance(): void {
  console.log("");
  console.log(
    "This specs tree carries a legacy spec generation (spex 0.x). The template refresh",
  );
  console.log(
    "above left all legacy content untouched: structural migration is",
  );
  console.log("agent-skill work, not CLI code.");
  console.log(
    "To migrate, run the spec-structure-migration skill bundled with spex",
  );
  console.log(
    "(skills/spec-structure-migration/ in the spex repo); its guide is",
  );
  console.log("docs/spec-migration.md.");
  console.log(
    "The migrated tree must pass `spex lint` — the mechanical gate.",
  );
}

// SCAF-18: the four-step --update pipeline — framework overwrite, seed
// refresh, agent-file refresh, then the completion output.
function updateScaffoldTemplates(): void {
  const basePath = getGitRoot();
  assertCleanSpecsTree(basePath);
  const active = resolveActiveLanguage(basePath);
  if (active.kind === "undeterminable" && active.reason === "unrecognized") {
    throw new Error(
      "specs/meta.md declares no authoring language and matches no bundled " +
        "version, so the language cannot be determined and updating would " +
        "replace the framework files with English. Restore its " +
        "`Authoring language: <code>` line (`en` or `zh`) and run again.",
    );
  }
  if (active.kind === "undeterminable") {
    // Absent: an older tree being repaired, since --update creates
    // missing framework files. English is the only available answer,
    // but a localized tree lands mixed, so it is never silent.
    console.warn(
      "  warning: no specs/meta.md, so the authoring language is unknown; " +
        "creating framework files as en. On a localized tree, set the new " +
        "`Authoring language:` line to that language and run " +
        "`spex scaffold --update` again to refresh them from its overlay.",
    );
  }
  const language = active.kind === "undeterminable" ? "en" : active.language;

  // Sample legacy-generation markers before the framework overwrite
  // replaces specs/meta.md (SCAF-26).
  const legacyGeneration = detectLegacyGeneration(basePath, language);

  const replacedFramework = overwriteFrameworkSpecFiles(basePath, language);
  refreshPristineSeeds(basePath, { language });
  appendAgentSpecs(basePath, { createMissing: false });

  warnReplacedFrameworkFiles(replacedFramework);

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

  if (legacyGeneration) printMigrationGuidance();
}

// SCAF-52: a legacy tree gets guidance, not a re-scaffold — creating
// current seed targets beside legacy files would entangle two spec
// generations before the migration skill has run.
function assertNoLegacyLayout(basePath: string): void {
  for (const dir of LEGACY_GENERATION_DIRS) {
    const abs = join(basePath, "specs", dir);
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      throw new Error(
        `specs/${dir}/ marks a legacy spec generation (spex 0.x); run \`spex scaffold --update\` to refresh templates and get migration guidance before scaffolding`,
      );
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
    const language = resolveCreateLanguage(basePath, options.language);

    assertNoLegacyLayout(basePath);
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

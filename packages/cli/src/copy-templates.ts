// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
} from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { getScaffoldDir } from "./bundled-scaffold.js";

export const SUPPORTED_LANGUAGES = ["en", "zh"] as const;
export type ScaffoldLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// SCAF-19: framework vs seed classification.
const FRAMEWORK_FILES = [
  "specs/meta.md",
  "specs/decisions/000-spec-structure-format.md",
] as const;

const SEED_FILES = [
  "specs/map.md",
  "specs/iterations/000-spdx-headers.md",
  "specs/packages/git.md",
  "specs/packages/licensing.md",
  "specs/compositions/.gitkeep",
] as const;

const LEGACY_ITEM_DIRS = [
  ["specs/items/user", "specs/user"],
  ["specs/items/dev", "specs/dev"],
  ["specs/items/test", "specs/test"],
] as const;

export type PristineState = "pristine" | "modified" | "missing";
type SeedIndicator =
  | "created"
  | "updated"
  | "unchanged"
  | "kept — user-modified";
export type LegacyItemLayoutResult = {
  status: "migrated" | "conflict";
  targetRelPath: string;
  legacyRelPath: string;
};

type RefreshPristineSeedsOptions = {
  migratedFrom?: ReadonlyMap<string, string>;
  language?: ScaffoldLanguage;
  /**
   * Replacement indicator text for user-modified seeds that this run
   * transformed in place (e.g. a restructured map.md), so one line
   * reports the seed's true outcome.
   */
  indicatorOverrides?: ReadonlyMap<string, string>;
};

export function isSupportedLanguage(code: string): code is ScaffoldLanguage {
  return SUPPORTED_LANGUAGES.includes(code as ScaffoldLanguage);
}

export function formatSupportedLanguages(): string {
  return SUPPORTED_LANGUAGES.join(", ");
}

function getOverlayRelPath(language: ScaffoldLanguage, relPath: string): string {
  return posix.join("i18n", language, relPath);
}

function getOverlayBase(scaffoldDir: string, language: ScaffoldLanguage): string {
  return join(scaffoldDir, "i18n", language);
}

export function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === ".DS_Store") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function listBundledSpecRelPaths(
  scaffoldDir: string,
  language: ScaffoldLanguage,
): string[] {
  const relPaths = new Set(
    listFiles(join(scaffoldDir, "specs")).map((path) =>
      relative(scaffoldDir, path).replace(/\\/g, "/"),
    ),
  );

  if (language !== "en") {
    const overlayBase = getOverlayBase(scaffoldDir, language);
    const overlaySpecs = join(overlayBase, "specs");
    if (existsSync(overlaySpecs)) {
      for (const path of listFiles(overlaySpecs)) {
        relPaths.add(relative(overlayBase, path).replace(/\\/g, "/"));
      }
    }
  }

  return [...relPaths].sort();
}

export function getBundledSpecFilePath(
  relPath: string,
  language: ScaffoldLanguage = "en",
): string {
  const scaffoldDir = getScaffoldDir();
  if (language !== "en") {
    const overlayPath = join(scaffoldDir, getOverlayRelPath(language, relPath));
    if (existsSync(overlayPath)) return overlayPath;
  }
  return join(scaffoldDir, relPath);
}

/**
 * Copy bundled template files from scaffold/specs/ to target specs/.
 *
 * SCAF-8: recursively copies files; existing files are not overwritten.
 * SCAF-9: resolves scaffold/ from the dist/ output directory.
 */
export function copyTemplates(
  basePath: string,
  language: ScaffoldLanguage = "en",
): void {
  const scaffoldDir = getScaffoldDir();
  const srcSpecs = join(scaffoldDir, "specs");

  if (!existsSync(srcSpecs)) {
    throw new Error(`Bundled scaffold/specs/ not found: ${srcSpecs}`);
  }

  for (const relPath of listBundledSpecRelPaths(scaffoldDir, language)) {
    const target = join(basePath, relPath);
    if (existsSync(target)) {
      console.log(`  ${relPath} (already exists)`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(getBundledSpecFilePath(relPath, language), target);
    console.log(`  ${relPath}`);
  }
}

/**
 * Copy the bundled top-level LICENSE to the target repository root.
 *
 * SCAF-37: writes scaffold/LICENSE (verbatim Apache-2.0) to
 * <basePath>/LICENSE only when the target is absent, so an existing
 * downstream license is never overwritten. Not localized.
 */
export function copyRootLicense(basePath: string): void {
  const source = join(getScaffoldDir(), "LICENSE");
  const target = join(basePath, "LICENSE");
  if (existsSync(target)) {
    console.log(`  LICENSE (already exists)`);
    return;
  }
  copyFileSync(source, target);
  console.log(`  LICENSE`);
}

// SCAF-13.
export function getFrameworkSpecFiles(): readonly string[] {
  return FRAMEWORK_FILES;
}

// SCAF-20.
export function getSeedSpecFiles(): readonly string[] {
  return SEED_FILES;
}

function removeEmptyDirectories(dir: string): boolean {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  for (const entry of readdirSync(dir)) {
    removeEmptyDirectories(join(dir, entry));
  }
  if (readdirSync(dir).length === 0) {
    rmdirSync(dir);
    return true;
  }
  return false;
}

// SCAF-26.
export function migrateLegacyItemLayout(
  basePath: string,
): LegacyItemLayoutResult[] {
  const results: LegacyItemLayoutResult[] = [];

  for (const [legacyRootRel, targetRootRel] of LEGACY_ITEM_DIRS) {
    const legacyRoot = join(basePath, legacyRootRel);
    if (!existsSync(legacyRoot)) continue;

    for (const source of listFiles(legacyRoot)) {
      const suffix = relative(legacyRoot, source).replace(/\\/g, "/");
      const legacyRelPath = posix.join(legacyRootRel, suffix);
      const targetRelPath = posix.join(targetRootRel, suffix);
      const target = join(basePath, targetRelPath);

      if (existsSync(target)) {
        results.push({
          status: "conflict",
          targetRelPath,
          legacyRelPath,
        });
        continue;
      }

      mkdirSync(dirname(target), { recursive: true });
      renameSync(source, target);
      results.push({
        status: "migrated",
        targetRelPath,
        legacyRelPath,
      });
    }
  }

  removeEmptyDirectories(join(basePath, "specs", "items"));
  return results;
}

// SCAF-21.
export function getFileHistory(relPath: string): string[] {
  const manifestPath = join(getScaffoldDir(), ".file-history.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`File-history manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
    string,
    string[]
  >;
  return manifest[relPath] ?? [];
}

// Hash histories of bundled files that no longer ship (the legacy
// user/dev/test seeds), so migration can tell an untouched old seed
// from user-authored content.
export function getLegacyFileHistory(relPath: string): string[] {
  const manifestPath = join(getScaffoldDir(), ".legacy-file-history.json");
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Record<
    string,
    string[]
  >;
  return manifest[relPath] ?? [];
}

/** isPristine over the legacy manifest (removed bundled paths). */
export function isLegacyPristine(
  basePath: string,
  relPath: string,
): PristineState {
  const target = join(basePath, relPath);
  if (!existsSync(target)) return "missing";
  return getLegacyFileHistory(relPath).includes(hashFile(target))
    ? "pristine"
    : "modified";
}

function getRecognizedFileHistory(
  relPath: string,
  language: ScaffoldLanguage,
): string[] {
  const history = new Set(getFileHistory(relPath));
  if (language !== "en") {
    for (const hash of getFileHistory(getOverlayRelPath(language, relPath))) {
      history.add(hash);
    }
  }
  return [...history];
}

function hashFile(path: string): string {
  return canonicalContentHash(readFileSync(path));
}

export function canonicalContentHash(data: Buffer): string {
  return `sha256-${createHash("sha256")
    .update(canonicalHashInput(data))
    .digest("hex")}`;
}

function canonicalHashInput(data: Buffer): Buffer | string {
  if (data.includes(0)) return data;
  return data.toString("utf-8").replace(/\r\n?/g, "\n");
}

// SCAF-22.
export function isPristine(
  basePath: string,
  relPath: string,
  language: ScaffoldLanguage = "en",
): PristineState {
  const target = join(basePath, relPath);
  if (!existsSync(target)) return "missing";
  return getRecognizedFileHistory(relPath, language).includes(hashFile(target))
    ? "pristine"
    : "modified";
}

// SCAF-14. Returns the framework paths that were overwritten while
// carrying unrecognized (user-modified) content, so the caller can warn
// before the run completes (SCAF-18).
export function overwriteFrameworkSpecFiles(
  basePath: string,
  language: ScaffoldLanguage = "en",
): string[] {
  const replacedUserModified: string[] = [];
  for (const relPath of FRAMEWORK_FILES) {
    const state = isPristine(basePath, relPath, language);
    const target = join(basePath, relPath);
    const source = getBundledSpecFilePath(relPath, language);
    if (state !== "missing" && hashFile(target) === hashFile(source)) {
      console.log(`  ${relPath} (unchanged)`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    if (state === "modified") {
      replacedUserModified.push(relPath);
      console.log(`  ${relPath} (overwritten — user-modified)`);
    } else {
      console.log(`  ${relPath} (updated)`);
    }
  }
  return replacedUserModified;
}

// SCAF-23.
function formatSeedIndicator(
  relPath: string,
  indicator: SeedIndicator | string,
  migratedFrom?: ReadonlyMap<string, string>,
): string {
  const legacyRelPath = migratedFrom?.get(relPath);
  if (legacyRelPath === undefined) return indicator;
  if (indicator === "unchanged") return `migrated from ${legacyRelPath}`;
  return `migrated from ${legacyRelPath}; ${indicator}`;
}

export function refreshPristineSeeds(
  basePath: string,
  options: RefreshPristineSeedsOptions = {},
): void {
  const language = options.language ?? "en";
  for (const relPath of SEED_FILES) {
    const state = isPristine(basePath, relPath, language);
    // A .gitkeep only holds its directory open: never resurrect one
    // after the user filled the directory and removed it.
    if (
      state === "missing" &&
      relPath.endsWith("/.gitkeep") &&
      existsSync(join(basePath, dirname(relPath))) &&
      readdirSync(join(basePath, dirname(relPath))).length > 0
    ) {
      continue;
    }
    if (state === "modified") {
      const indicator = formatSeedIndicator(
        relPath,
        options.indicatorOverrides?.get(relPath) ?? "kept — user-modified",
        options.migratedFrom,
      );
      console.log(`  ${relPath} (${indicator})`);
      continue;
    }
    const target = join(basePath, relPath);
    const source = getBundledSpecFilePath(relPath, language);
    if (state === "pristine" && hashFile(target) === hashFile(source)) {
      const indicator = formatSeedIndicator(
        relPath,
        "unchanged",
        options.migratedFrom,
      );
      console.log(`  ${relPath} (${indicator})`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    const indicator = state === "missing" ? "created" : "updated";
    console.log(
      `  ${relPath} (${formatSeedIndicator(
        relPath,
        indicator,
        options.migratedFrom,
      )})`,
    );
  }
}

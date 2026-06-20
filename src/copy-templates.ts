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
  "specs/dev/git.md",
  "specs/dev/licensing.md",
  "specs/test/licensing.md",
  "specs/user/.gitkeep",
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

function listFiles(dir: string): string[] {
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

// SCAF-14.
export function overwriteFrameworkSpecFiles(
  basePath: string,
  language: ScaffoldLanguage = "en",
): void {
  for (const relPath of FRAMEWORK_FILES) {
    const target = join(basePath, relPath);
    const source = getBundledSpecFilePath(relPath, language);
    if (existsSync(target) && hashFile(target) === hashFile(source)) {
      console.log(`  ${relPath} (unchanged)`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    console.log(`  ${relPath} (updated)`);
  }
}

// SCAF-23.
function formatSeedIndicator(
  relPath: string,
  indicator: SeedIndicator,
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
    if (state === "modified") {
      const indicator = formatSeedIndicator(
        relPath,
        "kept — user-modified",
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

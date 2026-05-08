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

/**
 * Recursively copy files from srcDir to destDir.
 * Files that already exist at the destination are not overwritten (SCAF-8).
 * Prints status for each file relative to relRoot.
 */
function copyRecursive(
  srcDir: string,
  destDir: string,
  relRoot: string,
): void {
  const entries = readdirSync(srcDir);
  for (const entry of entries) {
    if (entry === ".DS_Store") continue;

    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const relPath = posix.join(relRoot, entry);

    if (statSync(srcPath).isDirectory()) {
      copyRecursive(srcPath, destPath, relPath);
    } else {
      if (existsSync(destPath)) {
        console.log(`  ${relPath} (already exists)`);
      } else {
        copyFileSync(srcPath, destPath);
        console.log(`  ${relPath}`);
      }
    }
  }
}

/**
 * Copy bundled template files from scaffold/specs/ to target specs/.
 *
 * SCAF-8: recursively copies files; existing files are not overwritten.
 * SCAF-9: resolves scaffold/ from the dist/ output directory.
 */
export function copyTemplates(basePath: string): void {
  const scaffoldDir = getScaffoldDir();
  const srcSpecs = join(scaffoldDir, "specs");
  const destSpecs = join(basePath, "specs");

  if (!existsSync(srcSpecs)) {
    throw new Error(`Bundled scaffold/specs/ not found: ${srcSpecs}`);
  }

  copyRecursive(srcSpecs, destSpecs, "specs");
}

// SCAF-13.
export function getFrameworkSpecFiles(): readonly string[] {
  return FRAMEWORK_FILES;
}

// SCAF-20.
export function getSeedSpecFiles(): readonly string[] {
  return SEED_FILES;
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
export function migrateLegacyItemLayout(basePath: string): {
  migrated: string[];
  conflicts: string[];
} {
  const migrated: string[] = [];
  const conflicts: string[] = [];

  for (const [legacyRootRel, targetRootRel] of LEGACY_ITEM_DIRS) {
    const legacyRoot = join(basePath, legacyRootRel);
    if (!existsSync(legacyRoot)) continue;

    for (const source of listFiles(legacyRoot)) {
      const suffix = relative(legacyRoot, source).replace(/\\/g, "/");
      const legacyRelPath = posix.join(legacyRootRel, suffix);
      const targetRelPath = posix.join(targetRootRel, suffix);
      const target = join(basePath, targetRelPath);

      if (existsSync(target)) {
        console.log(
          `  ${legacyRelPath} (kept — target exists at ${targetRelPath})`,
        );
        conflicts.push(legacyRelPath);
        continue;
      }

      mkdirSync(dirname(target), { recursive: true });
      renameSync(source, target);
      console.log(`  ${targetRelPath} (migrated from ${legacyRelPath})`);
      migrated.push(targetRelPath);
    }
  }

  removeEmptyDirectories(join(basePath, "specs", "items"));
  return { migrated, conflicts };
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
export function isPristine(basePath: string, relPath: string): PristineState {
  const target = join(basePath, relPath);
  if (!existsSync(target)) return "missing";
  return getFileHistory(relPath).includes(hashFile(target))
    ? "pristine"
    : "modified";
}

// SCAF-14.
export function overwriteFrameworkSpecFiles(basePath: string): void {
  const scaffoldDir = getScaffoldDir();
  for (const relPath of FRAMEWORK_FILES) {
    const target = join(basePath, relPath);
    const source = join(scaffoldDir, relPath);
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
export function refreshPristineSeeds(basePath: string): {
  refreshed: string[];
  unchanged: string[];
  modified: string[];
} {
  const scaffoldDir = getScaffoldDir();
  const refreshed: string[] = [];
  const unchanged: string[] = [];
  const modified: string[] = [];
  for (const relPath of SEED_FILES) {
    const state = isPristine(basePath, relPath);
    if (state === "modified") {
      console.log(`  ${relPath} (kept — user-modified)`);
      modified.push(relPath);
      continue;
    }
    const target = join(basePath, relPath);
    const source = join(scaffoldDir, relPath);
    if (state === "pristine" && hashFile(target) === hashFile(source)) {
      console.log(`  ${relPath} (unchanged)`);
      unchanged.push(relPath);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    console.log(`  ${relPath} (updated)`);
    refreshed.push(relPath);
  }
  return { refreshed, unchanged, modified };
}

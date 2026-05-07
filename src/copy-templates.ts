// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// SCAF-19: framework vs seed classification.
const FRAMEWORK_FILES = [
  "specs/meta.md",
  "specs/decisions/000-spec-structure-format.md",
] as const;

const SEED_FILES = [
  "specs/map.md",
  "specs/iterations/000-spdx-headers.md",
  "specs/items/dev/git.md",
  "specs/items/dev/licensing.md",
  "specs/items/test/licensing.md",
  "specs/items/user/.gitkeep",
] as const;

export type PristineState = "pristine" | "modified" | "missing";

/**
 * Resolve the bundled scaffold/ directory path.
 *
 * SCAF-9: navigate from dist/ output directory up to the package
 * root and return the scaffold/ directory path.
 */
export function getScaffoldDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // thisFile is in dist/ — go up one level to package root.
  const packageRoot = dirname(dirname(thisFile));
  return resolve(packageRoot, "scaffold");
}

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
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
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
    copyFileSync(source, target);
    console.log(`  ${relPath} (updated)`);
  }
}

// SCAF-23.
export function refreshPristineSeeds(basePath: string): {
  refreshed: string[];
  unchanged: string[];
  modified: string[];
  missing: string[];
} {
  const scaffoldDir = getScaffoldDir();
  const refreshed: string[] = [];
  const unchanged: string[] = [];
  const modified: string[] = [];
  const missing: string[] = [];
  for (const relPath of SEED_FILES) {
    const state = isPristine(basePath, relPath);
    if (state === "missing") {
      console.log(`  ${relPath} (kept — missing)`);
      missing.push(relPath);
      continue;
    }
    if (state === "modified") {
      console.log(`  ${relPath} (kept — user-modified)`);
      modified.push(relPath);
      continue;
    }
    const target = join(basePath, relPath);
    const source = join(scaffoldDir, relPath);
    if (hashFile(target) === hashFile(source)) {
      console.log(`  ${relPath} (unchanged)`);
      unchanged.push(relPath);
      continue;
    }
    copyFileSync(source, target);
    console.log(`  ${relPath} (updated)`);
    refreshed.push(relPath);
  }
  return { refreshed, unchanged, modified, missing };
}

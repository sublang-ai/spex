// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
    const relPath = join(relRoot, entry);

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

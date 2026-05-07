// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { readFileSync } from "node:fs";
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

export function stripBundledHeader(text: string): string {
  return text
    .replace(/^(?:<!-- SPDX-[\s\S]*?-->\r?\n)+\r?\n?/, "")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

export function readBundledMarkdown(relPath: string): string {
  return stripBundledHeader(
    readFileSync(join(getScaffoldDir(), relPath), "utf-8"),
  );
}

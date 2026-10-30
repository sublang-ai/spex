// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An environment's layout at its root (environments-26, DR-165):
// `spex.yaml` and `spex.lock` at the root, and under `.spex/` what Spex
// installs and generates — the installed spec packages with their
// install record, and the skills an export mirrors — beside a
// `.gitignore` of `*`, so the reader commits the two files and Git never
// sees the installed tree.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { VersionConflictError } from "../files.js";

/** The folder at an environment's root holding what Spex installs and
 * generates for it (environments-26). */
export const SPEX_DIR = ".spex";

/** `<root>/.spex/`. */
export function spexDir(root: string): string {
  return join(root, SPEX_DIR);
}

/** `<root>/.spex/packages/`: the installed spec packages and the install
 * record (environments-7). */
export function installedDir(root: string): string {
  return join(root, SPEX_DIR, "packages");
}

/** `<root>/.spex/skills/`: the generated and copied skills an export
 * mirrors into agent folders (environments-8). */
export function skillsDir(root: string): string {
  return join(root, SPEX_DIR, "skills");
}

const SPEX_GITIGNORE = "*\n";

/** Make `<root>/.spex/` with its `.gitignore` of one line, `*`, so Git
 * ignores everything in it (environments-26). The root itself is never
 * made: one gone meanwhile fails here. */
export function ensureSpexDir(root: string): string {
  const dir = spexDir(root);
  if (!existsSync(root)) throw new VersionConflictError(root);
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, ".gitignore");
  let current: string | null = null;
  try { current = readFileSync(ignore, "utf8"); } catch { current = null; }
  if (current !== SPEX_GITIGNORE) writeFileSync(ignore, SPEX_GITIGNORE);
  return dir;
}

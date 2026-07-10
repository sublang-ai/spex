// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve the base path for scaffold output.
 *
 * SCAF-1: explicit path (must exist and be a directory)
 * SCAF-2: no path, inside git repo → repo root
 * SCAF-3: no path, outside git repo → cwd
 */
export function resolveBase(pathArg?: string): string {
  if (pathArg !== undefined) {
    const abs = resolve(pathArg);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      throw new Error(`Path does not exist: ${abs}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${abs}`);
    }
    return abs;
  }

  // No explicit path — try git repo root, fall back to cwd.
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return root;
  } catch {
    return process.cwd();
  }
}

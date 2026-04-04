// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * SCAF-7 directories under specs/.
 */
const DIRS = [
  "specs",
  "specs/decisions",
  "specs/iterations",
  "specs/items",
  "specs/items/user",
  "specs/items/dev",
  "specs/items/test",
];

/**
 * Create the specs directory structure under basePath.
 *
 * SCAF-7: creates specs/ with subdirectories.
 * SCAF-4: skips existing directories with "(already exists)".
 */
export function createSpecsStructure(basePath: string): void {
  for (const dir of DIRS) {
    const target = join(basePath, dir);
    if (existsSync(target)) {
      console.log(`  ${dir}/ (already exists)`);
    } else {
      mkdirSync(target);
      console.log(`  ${dir}/`);
    }
  }
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { createSpecsStructure } from "./create-specs-structure.js";
import { resolveBase } from "./resolve-base.js";

/**
 * Entry point for the scaffold subcommand.
 * @param pathArg - Optional explicit target path
 */
export function scaffold(pathArg?: string): void {
  let basePath: string;
  try {
    basePath = resolveBase(pathArg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`spex scaffold: ${msg}`);
    process.exit(1);
  }

  createSpecsStructure(basePath);

  // Task 5: copyTemplates()
  // Task 6: appendAgentSpecs()

  console.error("scaffold: not yet fully implemented");
  process.exit(1);
}

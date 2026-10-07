// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The module of each playbook a Spex config enables, for a fixture that
// hands that config to Playbook's launcher beside the core (DR-105,
// environments-9). Spex's config names no `from`; the launcher takes
// each module supplied at launch. The modules are the built-in spec
// package's, from the release the build stages and the core seeds into
// every home's store, so a fixture needs no environment installed yet.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import { builtinPackage } from "../environment/builtins.js";
import { playbookModuleCandidates } from "../environment/exports.js";

/** Playbook id to the absolute path of its registry module, for every
 * playbook the config at `configPath` enables. */
export function builtinLaunchModules(configPath: string): Record<string, string> {
  const top = parseYaml(readFileSync(configPath, "utf8")) as { playbooks?: Record<string, unknown> } | null;
  const { dir } = builtinPackage();
  const modules: Record<string, string> = {};
  for (const id of Object.keys(top?.playbooks ?? {})) {
    const module = playbookModuleCandidates(join(dir, "playbooks", "en", id), id).find((candidate) => existsSync(candidate));
    if (!module) throw new Error(`the built-in spec package exports no playbook ${id}`);
    modules[id] = module;
  }
  return modules;
}

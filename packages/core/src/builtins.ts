// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Built-in playbook catalog (playbook-library-34, DR-104): the playbooks
// of the built-in spec package `sublang/playbooks`, as an environment
// installs it, served with the source text each artifact carries so the
// Playbooks surface can show and enable them before any config change.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { stripLeadingComments } from "./artifacts.js";
import { isValidRegistryEntry, type LoadModule } from "./config.js";
import type { ModuleLocation } from "./environment/index.js";
import type { BuiltinPlaybookInfo } from "./protocol.js";

/** The source text beside an installed playbook's module: `<id>.md` in
 * the artifact's folder, the module one or two levels below it. */
export function playbookSourcePath(location: Pick<ModuleLocation, "id" | "module">): string | undefined {
  const near = dirname(location.module);
  for (const dir of [near, dirname(near)]) {
    const candidate = join(dir, `${location.id}.md`);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Load the catalog from the built-in spec package's module locations:
 * every built-in playbook with its command, intent, roles and source,
 * `configured` where the config enables it. A playbook whose module
 * fails to load is omitted (playbook-library-34).
 */
export async function loadBuiltinCatalog(
  locations: ReadonlyMap<string, ModuleLocation>,
  configuredIds: ReadonlySet<string>,
  loadModule: LoadModule = (specifier) => import(specifier),
): Promise<BuiltinPlaybookInfo[]> {
  const builtins: BuiltinPlaybookInfo[] = [];
  for (const location of locations.values()) {
    if (!location.builtin || !location.present) continue;
    let entry: unknown;
    try {
      entry = ((await loadModule(location.module)) as { default?: unknown }).default;
    } catch {
      continue;
    }
    if (!isValidRegistryEntry(entry) || entry.id !== location.id) continue;
    const sourcePath = playbookSourcePath(location);
    builtins.push({
      id: location.id,
      command: entry.command,
      intent: entry.intent,
      from: location.module,
      roles: [...entry.requiredRoleIds],
      configured: configuredIds.has(location.id),
      ...(sourcePath
        ? { source: stripLeadingComments(readFileSync(sourcePath, "utf8")) }
        : {}),
    });
  }
  return builtins;
}

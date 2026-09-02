// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Built-in playbook catalog (DR-015/DR-019): the reference playbooks
// the core already depends on, served with the sources the installed
// package ships so the Library can show and enable them before any
// config change.

import { readFileSync } from "node:fs";

import { packagedSourcePath, stripLeadingComments } from "./artifacts.js";
import { isValidRegistryEntry, type LoadModule } from "./config.js";
import type { BuiltinPlaybookInfo } from "./protocol.js";

/** Registry specifiers of the built-ins shipped by @sublang/playbook. */
const BUILTIN_FROMS: Record<string, string> = {
  code: "@sublang/playbook/code/registry",
  review: "@sublang/playbook/review/registry",
  decide: "@sublang/playbook/decide/registry",
  dev: "@sublang/playbook/dev/registry",
};

/**
 * Load the catalog. A built-in whose registry fails to load is
 * omitted (the package may predate it); sources come from the
 * installed package and are absent rather than fatal when missing.
 */
export async function loadBuiltinCatalog(
  configuredIds: ReadonlySet<string>,
  loadModule: LoadModule = (specifier) => import(specifier),
): Promise<BuiltinPlaybookInfo[]> {
  const builtins: BuiltinPlaybookInfo[] = [];
  for (const [id, from] of Object.entries(BUILTIN_FROMS)) {
    let entry: unknown;
    try {
      entry = ((await loadModule(from)) as { default?: unknown }).default;
    } catch {
      continue;
    }
    if (!isValidRegistryEntry(entry) || entry.id !== id) continue;
    const sourcePath = packagedSourcePath(id, from);
    builtins.push({
      id,
      command: entry.command,
      intent: entry.intent,
      from,
      roles: [...entry.requiredRoleIds],
      configured: configuredIds.has(id),
      ...(sourcePath
        ? { source: stripLeadingComments(readFileSync(sourcePath, "utf8")) }
        : {}),
    });
  }
  return builtins;
}

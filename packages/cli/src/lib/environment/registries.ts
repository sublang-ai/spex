// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Registry installs retain the exact source in the lock (DR-168).
// Legacy manifests retain their previous ordered fallback during migration;
// independent manifests never scan unrelated signed-in Spaces.

import { canonicalOrigin } from "../instance.js";
import { RegistryError, type RegistrySource } from "./registry.js";

/** One place an install asks, in order: an instance's registry by its
 * canonical origin, or a recorded registry that names no instance's
 * origin and so is never asked. */
export type InstallRegistry = { origin: string } | { unasked: string };

/**
 * The order an install asks registries for a registry package's files
 * (environments-7): `instance`, the environment's instance; `recorded`,
 * the registry its lock records for the package; `signedIn`, the origin
 * of every instance the home is signed in to, in the home's order.
 * Independent mode instead asks only the pinned registry and explicitly
 * trusted equivalents, keeping sign-in separate from package trust.
 */
export function installRegistryOrder(instance: string, recorded: string, signedIn: readonly string[], options: { independent?: boolean; trusted?: readonly string[] } = {}): InstallRegistry[] {
  const out: InstallRegistry[] = [];
  const asked = new Set<string>();
  const add = (origin: string): void => {
    if (asked.has(origin)) return;
    asked.add(origin);
    out.push({ origin });
  };
  if (options.independent) {
    try { add(canonicalOrigin(recorded)); }
    catch { out.push({ unasked: recorded }); }

    for (const origin of options.trusted ?? []) add(canonicalOrigin(origin));
    return out;
  }
  add(canonicalOrigin(instance));
  let origin: string | null;
  try { origin = canonicalOrigin(recorded); } catch { origin = null; }
  if (origin !== null) add(origin);
  else out.push({ unasked: recorded });
  for (const entry of signedIn) {
    let at: string;
    try { at = canonicalOrigin(entry); } catch { continue; }
    add(at);
  }
  return out;
}

/** A registry a lock records under no instance's origin
 * (environments-7): never asked, every call failing naming it, so an
 * install no other registry serves says why this one was not asked. */
export function unaskedRegistry(url: string): RegistrySource {
  const unasked = (name: string): Promise<never> =>
    Promise.reject(new RegistryError("unavailable", name, `${name}: not asked, as it names no instance's origin`));
  return {
    url,
    index: (name) => unasked(name),
    version: (name) => unasked(name),
    file: (name) => unasked(name),
    archive: (name) => unasked(name),
    publish: (name) => unasked(name),
    search: () => Promise.resolve([]),
  };
}

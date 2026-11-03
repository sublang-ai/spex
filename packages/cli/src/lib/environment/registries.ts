// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Registry installs retain the exact source in the lock (DR-168).
// Package trust never follows the list of signed-in Spaces.

import { canonicalOrigin } from "../instance.js";
import { RegistryError, type RegistrySource } from "./registry.js";

/** A pinned package registry, or an invalid address kept for an honest
 * failure report without making a request. */
export type InstallRegistry = { origin: string } | { unasked: string };

/**
 * The order an install asks registries for a registry package's files
 * (environments-7): the registry its lock records and explicitly trusted
 * equivalents. The former instance, signed-in list and independent
 * option remain accepted for published API compatibility but confer no
 * package trust or account authority.
 */
export function installRegistryOrder(_instance: string, recorded: string, _signedIn: readonly string[], options: { independent?: boolean; trusted?: readonly string[] } = {}): InstallRegistry[] {
  const out: InstallRegistry[] = [];
  const asked = new Set<string>();
  const add = (origin: string): void => {
    if (asked.has(origin)) return;
    asked.add(origin);
    out.push({ origin });
  };
  try { add(canonicalOrigin(recorded)); }
  catch { out.push({ unasked: recorded }); }
  for (const origin of options.trusted ?? []) add(canonicalOrigin(origin));
  return out;
}

/** A registry a lock records under no instance's origin
 * (environments-7): never asked, every call failing naming it, so an
 * install no other registry serves says why this one was not asked. */
export function unaskedRegistry(url: string): RegistrySource {
  const unasked = (name: string): Promise<never> =>
    Promise.reject(new RegistryError("unavailable", name, `${name}: spex.lock names its registry as ${JSON.stringify(url)}, which is no registry address, so it is not asked`, "unasked"));
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

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The registries an install asks for a registry package's files
// (environments-7, DR-127, DR-165), as a rule either host applies: the
// registry of the environment's instance first, then the one its lock
// records, then that of every other instance the home is signed in to,
// in the home's order, each asked once. A recorded registry that names
// no instance's origin is never asked: it stands in the order to be
// named where no other serves.

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
 */
export function installRegistryOrder(instance: string, recorded: string, signedIn: readonly string[]): InstallRegistry[] {
  const out: InstallRegistry[] = [];
  const asked = new Set<string>();
  const add = (origin: string): void => {
    if (asked.has(origin)) return;
    asked.add(origin);
    out.push({ origin });
  };
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
    Promise.reject(new RegistryError("unavailable", name, `${name}: not asked, as ${url} names no instance's origin`));
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

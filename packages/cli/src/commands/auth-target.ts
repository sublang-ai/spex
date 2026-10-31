// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { dirname, join } from "node:path";
import { environmentRegistry, readRequestsFile } from "../lib/environment/requests.js";
import type { HomeFile, HomeInstance } from "../lib/home-file.js";
import type { AuthScope } from "../lib/git-host.js";
import { canonicalOrigin } from "../lib/instance.js";
import { defaultInstance, namedInstance } from "./home.js";
import { Refusal } from "./run.js";

/** The auth default is registry purpose, including for a legacy source.
 * Merely signing in never migrates that source or upgrades a Space slot. */
export function authTarget(home: HomeFile | null, values: { space?: string; registry?: string }): { target: HomeInstance; scope: AuthScope } {
  if (values.space !== undefined && values.registry !== undefined) throw new Refusal("--registry and --space are mutually exclusive");
  if (values.space !== undefined) return { target: namedInstance(home, values.space), scope: "space" };
  let origin = values.registry;
  if (origin === undefined) {
    let requests = null;
    for (let dir = process.cwd(); ; dir = dirname(dir)) {
      const read = readRequestsFile(join(dir, "spex.yaml"));
      if (read) { requests = read.requests; break; }
      if (dirname(dir) === dir) break;
    }
    origin = environmentRegistry(requests, { origin: defaultInstance(home).origin, instances: home?.instances ?? [] }).origin;
  }
  try { origin = canonicalOrigin(origin); }
  catch (error) { throw new Refusal(`--registry: ${(error as Error).message}`); }
  return { target: { origin, clientId: "spex" }, scope: "registry" };
}

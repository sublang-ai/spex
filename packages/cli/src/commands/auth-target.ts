// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { dirname, join } from "node:path";
import { environmentRegistry, readRequestsFile, RequestsError, type Requests } from "../lib/environment/requests.js";
import type { HomeFile, HomeInstance } from "../lib/home-file.js";
import type { AuthScope } from "../lib/git-host.js";
import { canonicalOrigin, OriginRefused } from "../lib/instance.js";
import { addressRefusal, defaultInstance, namedInstance } from "./home.js";
import { Refusal } from "./run.js";

/** The `spex.yaml` nearest the current folder, null where none stands;
 * one that does not read refuses the command (cli-13). */
function nearestRequests(): Requests | null {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    let read;
    try { read = readRequestsFile(join(dir, "spex.yaml")); }
    catch (error) {
      if (error instanceof RequestsError && error.newerFormat !== undefined) throw new Refusal("spex.yaml is from a newer Spex — update Spex");
      if (error instanceof RequestsError) throw new Refusal(`${error.message} — fix the file, then retry`);
      throw error;
    }
    if (read) return read.requests;
    if (dirname(dir) === dir) return null;
  }
}

/** The auth default is registry purpose, including for a legacy source.
 * Merely signing in never migrates that source or upgrades a Space slot. */
export function authTarget(home: HomeFile | null, values: { space?: string; registry?: string }): { target: HomeInstance; scope: AuthScope } {
  if (values.space !== undefined && values.registry !== undefined) throw new Refusal("--registry and --space together — give one");
  if (values.space !== undefined) return { target: namedInstance(home, values.space), scope: "space" };
  let origin = values.registry;
  if (origin === undefined) {
    origin = environmentRegistry(nearestRequests(), { origin: defaultInstance(home).origin, instances: home?.instances ?? [] }).origin;
  }
  try { origin = canonicalOrigin(origin); }
  catch (error) {
    if (error instanceof OriginRefused) throw addressRefusal("--registry", origin, error);
    throw error;
  }
  return { target: { origin, clientId: "spex" }, scope: "registry" };
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements in its clone's Git configuration
// (storage-34, DR-128): each placement a remote, named by its instance's
// folder or `origin` for the one the reader names, with the host's id
// for that repository, and the core's creation of it while one is owed
// (git-host-7), in that remote's own section, so a remote's rename and
// its removal carry its id and its creation mark with it.

import { instanceFolder, isInstanceFolder } from "./instance.js";

/** The remote the reader names: the clone's one path placement, which
 * records no id (storage-34, space-5). */
export const PATH_PLACEMENT = "origin";

/** Where a Spex before DR-128 kept the host's id, and the core's
 * creation of that repository, at the top level of the clone's Git
 * configuration: read only for a clone the instances migration
 * deferred until its move (storage-34), and moved into a remote's
 * section otherwise. */
export const LEGACY_ID_KEY = "spex.repositoryId";
export const LEGACY_CREATED_KEY = "spex.created";

/** The key recording, in a placement's remote's own section, the host's
 * id for its repository (storage-34). */
export function placementIdKey(name: string): string {
  return `remote.${name}.spexId`;
}

/** The key recording, in a placement's remote's own section, the core's
 * creation of its repository until a check is done with its default
 * branch (git-host-7): on the clone, so a restarted core keeps it. */
export function placementCreatedKey(name: string): string {
  return `remote.${name}.spexCreated`;
}

/** One synchronous local Git command in a clone — a config read or
 * write — by its exit and its output. */
export type ConfigRun = (args: string[]) => { ok: boolean; stdout: string };

/**
 * Move the host's id and the creation mark a clone records at the top
 * level of its Git configuration, as a Spex before DR-128 kept them,
 * into the section of its remote `name` (storage-34): each written there
 * first where that section holds none of its own, which then stands,
 * and only then removed from the top level, so no step loses it. With
 * no remote, `name` null, they are removed: a remote gone took its id.
 * A write Git refuses leaves that key at the top level for a later
 * attempt; returns whether every key moved.
 */
export function moveLegacyIds(run: ConfigRun, name: string | null): boolean {
  const read = (key: string): string | null => {
    const result = run(["config", "--get", key]);
    const value = result.ok ? result.stdout.trim() : "";
    return value.length > 0 ? value : null;
  };
  let moved = true;
  for (const [legacy, keyOf] of [[LEGACY_CREATED_KEY, placementCreatedKey], [LEGACY_ID_KEY, placementIdKey]] as const) {
    const value = read(legacy);
    if (value === null) continue;
    if (name !== null && read(keyOf(name)) === null && !run(["config", keyOf(name), value]).ok) {
      moved = false;
      continue;
    }
    run(["config", "--unset", legacy]);
  }
  return moved;
}

/** A placement as its clone's Git configuration holds it (storage-34):
 * its remote's name and URL, the host's id for its repository and the
 * core's creation of it while one is owed (git-host-7), and its
 * instance's origin — null for the path placement `origin`. */
export interface Placement {
  name: string;
  url: string;
  id: string | null;
  created: string | null;
  instance: string | null;
}

/** The keys one `git config -z --get-regexp` read of a clone's
 * placements takes: every remote's URL, id and creation mark, and the
 * id and mark a Spex before DR-128 kept at the top level. Git matches
 * them with the section and variable names lowercased. */
export const PLACEMENT_CONFIG_KEYS = "^(remote\\..+\\.(url|spexid|spexcreated)|spex\\.(repositoryid|created))$";

/** What resolves a placement's instance: the home's instances by their
 * folder (a listed one, or the origin it records) and by a key's folder. */
export interface PlacementHome {
  instanceByFolder(folder: string): { origin: string } | undefined;
  instanceOfKey(key: string): { origin: string } | undefined;
}

/** A remote of the clone, as the read gives it, in the order its URL
 * first stands in the Git configuration. */
interface ConfiguredRemote { name: string; url: string; id: string | null; created: string | null }

/** The remotes and the top-level id and mark one read over
 * PLACEMENT_CONFIG_KEYS gives, from `git config -z --get-regexp`'s
 * output: each entry a key, a newline and its value, ended by NUL. A
 * remote's name may hold dots, as an instance's folder does, so it is
 * what lies between `remote.` and the last dot; a remote holding no URL
 * is none, and of several URLs its first is the one Git fetches. */
function configuredRemotes(output: string): { remotes: ConfiguredRemote[]; legacy: { id: string | null; created: string | null } } {
  const urls = new Map<string, string>();
  const ids = new Map<string, string>();
  const created = new Map<string, string>();
  const legacy: { id: string | null; created: string | null } = { id: null, created: null };
  for (const entry of output.split("\0")) {
    if (entry === "") continue;
    const at = entry.indexOf("\n");
    const key = at < 0 ? entry : entry.slice(0, at);
    const value = at < 0 ? "" : entry.slice(at + 1).trim();
    if (value === "") continue;
    if (key === "spex.repositoryid") { legacy.id = value; continue; }
    if (key === "spex.created") { legacy.created = value; continue; }
    if (!key.startsWith("remote.")) continue;
    const dot = key.lastIndexOf(".");
    const name = key.slice("remote.".length, dot);
    const variable = key.slice(dot + 1);
    if (name === "") continue;
    if (variable === "url") { if (!urls.has(name)) urls.set(name, value); }
    else if (variable === "spexid") ids.set(name, value);
    else if (variable === "spexcreated") created.set(name, value);
  }
  const remotes = [...urls].map(([name, url]) => ({ name, url, id: ids.get(name) ?? null, created: created.get(name) ?? null }));
  return { remotes, legacy };
}

/**
 * A clone's placements (storage-34), from one read over
 * PLACEMENT_CONFIG_KEYS: its remotes in the order its Git configuration
 * holds them — the order they were added, a rename keeping its place —
 * each named by an instance's folder that names an instance of the home
 * (`instanceByFolder`), at most one per instance, then the path
 * placement `origin` last. A remote named by a folder no instance of the
 * home resolves, or by any other name, is no placement. A clone an
 * instances migration's receipt names deferred holds its remote,
 * whatever its name — the one named by its destination instance's
 * folder, else `origin`, else its first named by an instance's folder —
 * as its placement at the instance that entry names, with the id and
 * mark it records at the top level.
 */
export function placementsIn(output: string, key: string, home: PlacementHome, deferred: readonly { from: string; to: string }[]): Placement[] {
  const { remotes, legacy } = configuredRemotes(output);
  const move = deferred.find((entry) => entry.from === key);
  const movedTo = move ? home.instanceOfKey(move.to)?.origin ?? null : null;
  let held: ConfiguredRemote | undefined;
  if (movedTo !== null) {
    const folder = folderOf(movedTo);
    held = remotes.find((remote) => remote.name === folder)
      ?? remotes.find((remote) => remote.name === PATH_PLACEMENT)
      ?? remotes.find((remote) => isInstanceFolder(remote.name));
  }
  const placements: Placement[] = [];
  const at = new Set<string>();
  let path: Placement | undefined;
  for (const remote of remotes) {
    if (remote === held && movedTo !== null) {
      if (at.has(movedTo)) continue;
      at.add(movedTo);
      placements.push({ name: remote.name, url: remote.url, id: legacy.id, created: legacy.created, instance: movedTo });
      continue;
    }
    if (remote.name === PATH_PLACEMENT) {
      path = { ...remote, instance: null };
      continue;
    }
    if (!isInstanceFolder(remote.name)) continue;
    const instance = home.instanceByFolder(remote.name)?.origin;
    if (instance === undefined || at.has(instance)) continue;
    at.add(instance);
    placements.push({ ...remote, instance });
  }
  return path ? [...placements, path] : placements;
}

/** A clone's placements as its Git configuration holds them at this
 * instant (placementsIn), read by one synchronous command; none where
 * Git finds no key or cannot read the configuration. */
export function readPlacements(run: ConfigRun, key: string, home: PlacementHome, deferred: readonly { from: string; to: string }[]): Placement[] {
  const read = run(["config", "-z", "--get-regexp", PLACEMENT_CONFIG_KEYS]);
  return read.ok ? placementsIn(read.stdout, key, home, deferred) : [];
}

/** A clone's key placement (storage-31): its first placement with an
 * instance, which its key follows; none for a clone holding only the
 * path placement, or none. */
export function keyPlacement(placements: readonly Placement[]): Placement | undefined {
  return placements.find((placement) => placement.instance !== null);
}

/** An instance's folder under `workspace/`, or none where its origin
 * cannot stand as one. */
function folderOf(origin: string): string | null {
  try { return instanceFolder(origin); } catch { return null; }
}

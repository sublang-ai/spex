// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements in its clone's Git configuration
// (storage-34, DR-128): each placement a remote, named by its instance's
// folder or `origin` for the one the reader names, with the host's id
// for that repository, and the core's creation of it while one is owed
// (git-host-7), in that remote's own section, so a remote's rename and
// its removal carry its id and its creation mark with it.

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

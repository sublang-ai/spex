// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements as its row reads them (space-30,
// space-87, DR-128): the host repositories its clone holds as remotes,
// in the order added with the path placement last, then each one a
// placement file names that no remote here holds, then each instance a
// creation waits at. Pure functions over the state the core sends; the
// surfaces render them.

import type { GroupsState, InstanceState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { hostNameOf, instanceName, instanceOf, signedInInstances } from "./instances.js";

/** The placements the clone holds (space-87, storage-34): its remotes
 * in the order added, the path placement last. */
export function heldPlacements(repo: RepositoryState): PlacementState[] {
  return repo.placements.filter((placement) => placement.attached);
}

/** The held placements at an instance (space-88, space-89): every one
 * but the path placement. */
export function instancePlacements(repo: RepositoryState): PlacementState[] {
  return heldPlacements(repo).filter((placement) => placement.instance !== null);
}

/** The placement a clone's key follows (space-30, storage-38): its
 * first held placement at an instance, else its path placement; none
 * while it holds no placement — local only, or no clone here. */
export function keyPlacement(repo: RepositoryState): PlacementState | undefined {
  const held = heldPlacements(repo);
  return held.find((placement) => placement.instance !== null) ?? held[0];
}

/** The one placement a row with no clone here lists (space-30): the
 * host repository a Join would clone; none where a clone is here,
 * holding placements or local only. */
export function listedPlacement(repo: RepositoryState): PlacementState | undefined {
  if (repo.state === "local-only" || heldPlacements(repo).length > 0) return undefined;
  return repo.placements[0];
}

/** The placement a row reads as its own until each placement has its
 * line (space-30): its key placement, else, with no clone here, the one
 * it lists. */
export function rowPlacement(repo: RepositoryState): PlacementState | undefined {
  return keyPlacement(repo) ?? listedPlacement(repo);
}

/** A row's line at an instance, by its origin; null names the path
 * placement (space-29, space-87). */
export function placementAt(repo: RepositoryState, origin: string | null): PlacementState | undefined {
  return repo.placements.find((placement) => placement.instance === origin);
}

/** The first line a creation or a branch preparation waits on (space-64,
 * space-87). */
export function waitingOf(repo: RepositoryState): PlacementState | undefined {
  return repo.placements.find((placement) => placement.waiting !== null);
}

/** How a line names an instance (space-62, space-87): its display name
 * as the home last read it, else its origin's host name — an instance
 * this home does not list among them. */
export function instanceNameAt(state: GroupsState, origin: string): string {
  const instance = instanceOf(state, origin);
  return instance ? instanceName(instance) : hostNameOf(origin);
}

/** What a placement's line is named by (space-87): its instance, or,
 * for the path placement, its remote as a report reads it (space-15),
 * which the core sends as its path. */
export function placementName(state: GroupsState, line: PlacementState): string {
  return line.instance === null ? line.path : instanceNameAt(state, line.instance);
}

/** A placement's last sync (space-61): this device's last completed
 * sync with it, else the last one its clone holds — current where the
 * clone's `spex` is still that placement's — else none. */
export function placementLastSync(line: PlacementState | undefined): { at: number; current: boolean } | null {
  if (line?.lastSync) return { at: line.lastSync.at, current: true };
  return line?.branch?.agreed ?? null;
}

/** The instance governing a placement (space-61, space-60): its own
 * where signed in; where it reads reachable or read-only through a
 * signed-in instance it follows, the first signed-in one; else its own,
 * signed out. None for the path placement, which no instance governs. */
export function governingOfPlacement(state: GroupsState, line: PlacementState): InstanceState | undefined {
  if (line.instance === null) return undefined;
  const own = instanceOf(state, line.instance);
  if (own?.signedIn) return own;
  if (line.state === "reachable" || line.state === "read-only") return signedInInstances(state)[0] ?? own;
  return own;
}

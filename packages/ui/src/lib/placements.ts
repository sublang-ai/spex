// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements as its row reads them (space-30,
// space-87, DR-128): the host repositories its clone holds as remotes,
// in the order added with the path placement last, then each one a
// placement file names that no remote here holds, then each instance a
// creation waits at. Pure functions over the state the core sends; the
// surfaces render them.

import type { PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

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

/** The wait a row reads in place of its state until each placement has
 * its line (space-64): its first instance placement's, else, while it
 * holds none, the first line's that waits. */
export function rowWaiting(repo: RepositoryState): PlacementState["waiting"] {
  const key = instancePlacements(repo)[0];
  return key ? key.waiting : (waitingOf(repo)?.waiting ?? null);
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

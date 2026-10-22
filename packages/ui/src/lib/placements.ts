// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements as its row reads them (space-30,
// space-87, DR-128): the host repositories its clone holds as remotes,
// in the order added with the path placement last, then each one a
// placement file names that no remote here holds, then each instance a
// creation waits at. Pure functions over the state the core sends; the
// surfaces render them.

import type { GroupsState, InstanceGroupState, InstanceState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { currentLocale } from "../i18n.js";
import { governingOf, hostNameOf, instanceName, instanceOf, signedInInstances, standingOf } from "./instances.js";

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

/** The instance governing a placement (git-host-5, space-61, space-60):
 * for its key placement, the one the core names as governing the row;
 * for any other, its own where signed in; where it reads reachable or
 * read-only through a signed-in instance it follows, the first signed-in
 * one at which the clone holds no other placement; else its own, signed
 * out. None for the path placement, which no instance governs. */
export function governingOfPlacement(state: GroupsState, repo: RepositoryState, line: PlacementState): InstanceState | undefined {
  if (line.instance === null) return undefined;
  if (keyPlacement(repo)?.instance === line.instance) return governingOf(state, repo);
  const own = instanceOf(state, line.instance);
  if (own?.signedIn) return own;
  if (line.state === "reachable" || line.state === "read-only") {
    const held = new Set(instancePlacements(repo).map((placement) => placement.instance));
    return signedInInstances(state).find((instance) => !held.has(instance.origin)) ?? own;
  }
  return own;
}

/** The entry a placement stands in at the instance governing it
 * (space-78): the group the row stands under for its key placement —
 * none under your own group — and for any other, the group or namespace
 * whose listing names the row as placed there (space-1). */
export function standingEntry(state: GroupsState, repo: RepositoryState, line: PlacementState): InstanceGroupState | undefined {
  if (line.instance === null) return undefined;
  if (keyPlacement(repo)?.instance === line.instance) {
    const stands = standingOf(state, repo.key);
    return stands && !stands.own ? stands.group : undefined;
  }
  return governingOfPlacement(state, repo, line)?.groups.find((entry) => entry.placed.some((placed) => placed.key === repo.key));
}

/** The other instances a placement's members panel names (space-62):
 * every one the clone's placement files name but the line's own, each by
 * its display name as the home last read it, else its origin's host
 * name. */
export function alsoPlacedAt(state: GroupsState, repo: RepositoryState, line: PlacementState): string[] {
  return repo.placedAt.filter((origin) => origin !== line.instance).map((origin) => instanceNameAt(state, origin));
}

/** Names joined as the interface language joins a list (localization-5):
 * "A and B", "A、B和C". */
export function nameList(names: string[]): string {
  return new Intl.ListFormat(currentLocale(), { type: "conjunction" }).format(names);
}

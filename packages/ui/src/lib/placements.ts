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
import type { SpaceLastAct } from "../state/store.js";
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

/** Whether a sync can run a held placement (space-11): the path
 * placement, which this device reaches without an instance, or one
 * whose governing instance is signed in — its own, or one a signed-in
 * instance listing its host repository makes it follow (space-60). */
export function canRun(state: GroupsState, repo: RepositoryState, line: PlacementState): boolean {
  if (!line.attached) return false;
  return line.instance === null || governingOfPlacement(state, repo, line)?.signedIn === true;
}

/** Whether a sync admitted now takes a held placement's turn (space-11,
 * space-57): one it can run that reads reachable or read-only, or the
 * path placement. */
export function runnable(state: GroupsState, repo: RepositoryState, line: PlacementState): boolean {
  return canRun(state, repo, line) && (line.instance === null || line.state === "reachable" || line.state === "read-only");
}

/** Whether a placement's first push owes the sharing notice (space-57):
 * a held placement at an instance that takes pushes — a read-only one
 * never pushes, and the path placement owes none — whose notice this
 * device's reader has not seen, and whose repository has other members,
 * or a count the host's last read lacks with nothing synced with it from
 * here; or your own group's own repository's at an instance other than
 * its first placement's, never synced from here (space-4). */
export function owesNotice(repo: RepositoryState, line: PlacementState): boolean {
  if (!line.attached || line.instance === null || line.state !== "reachable" || line.noticed) return false;
  if (line.members === null ? line.lastSync === null : line.members > 1) return true;
  return repo.own && line.lastSync === null && instancePlacements(repo)[0]?.instance !== line.instance;
}

/** The instances "Place at…" offers a row (space-88): where its clone
 * holds a placement with an instance and the view says the person may
 * manage the members of every one it holds with an instance
 * (git-host-5), every signed-in instance it holds none at — a line a
 * placement file names, not on this device, or a creation waiting there
 * being no placement held — but one whose listing names the row as
 * placed there while the row carries no line there: a placement it
 * holds that instance lists too, one placement both list (space-1,
 * DR-128). None otherwise; whether the row is a project's is the row's
 * to say. */
export function placeInstances(state: GroupsState, repo: RepositoryState): InstanceState[] {
  const held = instancePlacements(repo);
  if (held.length === 0 || !held.every((line) => line.can.manageMembers)) return [];
  const at = new Set(held.map((line) => line.instance));
  return signedInInstances(state).filter(
    (instance) =>
      !at.has(instance.origin) &&
      (placementAt(repo, instance.origin) !== undefined ||
        !instance.groups.some((entry) => entry.placed.some((placed) => placed.key === repo.key))),
  );
}

/** The placements "Leave…" offers a row (space-89): every one its clone
 * holds at an instance — the path placement, which no instance holds,
 * is offered none — and none on your own group's own repository, which
 * every sign-in places (space-4). Whether the row is a project's is the
 * row's to say. */
export function leavePlacements(repo: RepositoryState): PlacementState[] {
  return repo.own ? [] : instancePlacements(repo);
}

/** Which confirm a Leave of a row's placement at `origin` asks
 * (space-89, space-98). */
export type LeaveStage = { stage: "first" } | { stage: "unreceived"; count: number } | { stage: "unread" };

/** A Leave's confirm (space-89, space-98): the first, unless the row's
 * phase is a Leave of that placement this page asked unconfirmed — a
 * stopped phase names no placement (space-30), so the page's memory of
 * the act says which — stopped for records no remaining placement
 * received, asking again with their count, or stopped at its read for
 * any other cause but a session's lease or Stop, saying that records
 * pushed there since the last sync may be left behind. */
export function leaveStage(repo: RepositoryState, act: SpaceLastAct | undefined, origin: string): LeaveStage {
  const sync = repo.sync;
  if (sync.phase !== "stopped" || sync.op !== "leave") return { stage: "first" };
  if (act?.op !== "leave" || act.instance !== origin || act.confirmed) return { stage: "first" };
  if (sync.cause === "unreceived") return { stage: "unreceived", count: sync.count ?? 0 };
  if (sync.step === "check" && sync.cause !== "lease" && sync.cause !== "stopped") return { stage: "unread" };
  return { stage: "first" };
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

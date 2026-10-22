// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A row's placements as the surface reads them (space-30, space-61):
// which it holds, which its key follows, which a row with no clone
// lists, and whether its clone is here.

import { describe, expect, test } from "vitest";

import { groupsState, instanceState, placementState, repositoryRow } from "../fixtures/groups-state.js";
import {
  governingOfPlacement,
  heldPlacements,
  instancePlacements,
  keyPlacement,
  listedPlacement,
  placementAt,
  rowPlacement,
  waitingOf,
} from "./placements.js";
import { cloneHere, lastSyncOf } from "./space.js";

const FIRST = "https://spex.example";
const SECOND = "https://second.example";
const THIRD = "https://third.example";
const FOURTH = "https://fourth.example";
const KEY = "@spex.example/acme/academy-spex";

const wait = (group: string) => ({ step: "create" as const, group, message: `You may not create projects in ${group}` });

describe("placements", () => {
  test("space-30: the key placement is the first held one with an instance, else the path placement; an absent row reads its listed placement; a waiting creation is no held placement", () => {
    // Held in the order added, the path placement last, then a line a
    // placement file names, then a creation waiting (space-30).
    const first = placementState({ instance: FIRST, path: "acme/academy-spex", id: "1" });
    const second = placementState({ instance: SECOND, path: "workshop/academy-spex", id: "2" });
    const path = placementState({ instance: null, path: "/srv/academy-spex.git" });
    const named = placementState({ instance: THIRD, path: "team/academy-spex", id: "3", attached: false, state: "absent" });
    const waiting = placementState({ instance: FOURTH, path: "lab/academy-spex", attached: false, state: "absent", waiting: wait("lab") });
    const placed = repositoryRow(KEY, { instance: FIRST, state: "reachable", placements: [first, second, path, named, waiting] });
    expect(heldPlacements(placed)).toEqual([first, second, path]);
    expect(instancePlacements(placed)).toEqual([first, second]);
    expect(keyPlacement(placed)).toBe(first);
    expect(rowPlacement(placed)).toBe(first);
    expect(listedPlacement(placed)).toBeUndefined();
    expect(placementAt(placed, SECOND)).toBe(second);
    expect(placementAt(placed, null)).toBe(path);
    expect(placementAt(placed, THIRD)).toBe(named);
    expect(placementAt(placed, "https://elsewhere.example")).toBeUndefined();
    expect(waitingOf(placed)).toBe(waiting);

    // A clone holding only the path placement: its key follows it, and
    // no instance placement stands.
    const pathOnly = repositoryRow(KEY, { state: "reachable", placements: [path] });
    expect(keyPlacement(pathOnly)).toBe(path);
    expect(instancePlacements(pathOnly)).toEqual([]);

    // A local-only clone whose creation waits holds no placement: no
    // key, nothing listed, and the wait read from its line.
    const local = repositoryRow(KEY, { state: "local-only", placements: [waiting] });
    expect(heldPlacements(local)).toEqual([]);
    expect(keyPlacement(local)).toBeUndefined();
    expect(listedPlacement(local)).toBeUndefined();
    expect(rowPlacement(local)).toBeUndefined();
    expect(waitingOf(local)).toBe(waiting);

    // A row an instance lists with no clone here reads its one listed
    // placement, which no clone holds.
    const listed = placementState({ instance: SECOND, path: "workshop/academy-spex", id: "2", attached: false, state: "absent", members: 3 });
    const absent = repositoryRow("@second.example/workshop/academy-spex", { instance: SECOND, state: "absent", placements: [listed] });
    expect(keyPlacement(absent)).toBeUndefined();
    expect(listedPlacement(absent)).toBe(listed);
    expect(rowPlacement(absent)).toBe(listed);
  });

  test("space-61: a clone is here while local only or holding any placement; its row reads its key placement's last sync", () => {
    const held = placementState({ instance: FIRST, path: "acme/academy-spex", id: "1" });
    const listed = placementState({ instance: FIRST, path: "acme/academy-spex", id: "1", attached: false, state: "absent" });
    const waiting = placementState({ instance: FIRST, path: "acme/academy-spex", attached: false, state: "absent", waiting: wait("acme") });
    expect(cloneHere(repositoryRow(KEY, { state: "local-only", placements: [] }))).toBe(true);
    expect(cloneHere(repositoryRow(KEY, { state: "local-only", placements: [waiting] }))).toBe(true);
    expect(cloneHere(repositoryRow(KEY, { state: "reachable", placements: [held] }))).toBe(true);
    expect(cloneHere(repositoryRow(KEY, { state: "unreachable", placements: [{ ...held, state: "unreachable" }] }))).toBe(true);
    expect(cloneHere(repositoryRow(KEY, { state: "reachable", placements: [placementState({ path: "/srv/academy-spex.git" })] }))).toBe(true);
    // No clone: a listed row, and one in a group named like a login.
    expect(cloneHere(repositoryRow(KEY, { state: "absent", placements: [listed] }))).toBe(false);
    expect(
      cloneHere(repositoryRow(`${KEY}@1`, { state: "unreachable", placements: [{ ...listed, state: "unreachable", reason: "a group named like your login" }] })),
    ).toBe(false);

    // The row's last sync is its key placement's: its record, else what
    // its clone holds, never a later placement's.
    const at = 1_700_000_000_000;
    const agreed = { ahead: 0, behind: 0, checkedAt: at, hostEmpty: false, unrelated: false, agreed: { at: at - 60_000, current: false } };
    const second = placementState({ instance: SECOND, path: "workshop/academy-spex", lastSync: { at: at + 1, sent: 1, received: 0 } });
    expect(lastSyncOf(repositoryRow(KEY, { state: "reachable", placements: [{ ...held, lastSync: { at, sent: 0, received: 2 } }, second] }))).toEqual({ at, current: true });
    expect(lastSyncOf(repositoryRow(KEY, { state: "reachable", placements: [{ ...held, branch: agreed }, second] }))).toEqual({ at: at - 60_000, current: false });
    expect(lastSyncOf(repositoryRow(KEY, { state: "reachable", placements: [held, second] }))).toBeNull();
  });

  test("space-61, space-60: a placement is governed by its own instance where signed in, by a signed-in one it follows where it reads reachable or read-only, else by its own, signed out; the key placement by the one the core names; the path placement by none", () => {
    const home = groupsState({
      instances: [instanceState(FIRST, { signedIn: false }), instanceState(SECOND), instanceState(THIRD)],
    });
    const at = (origin: string, over: Parameters<typeof placementState>[0] = {}) =>
      placementState({ instance: origin, path: "acme/academy-spex", ...over });
    // A row whose key placement stands at `key`, holding `line` beside it.
    const beside = (key: string, line: ReturnType<typeof placementState>) =>
      repositoryRow(KEY, { instance: key, governing: key, state: "reachable", placements: [at(key), line] });
    expect(governingOfPlacement(home, beside(THIRD, at(SECOND)), at(SECOND))?.origin).toBe(SECOND);
    expect(governingOfPlacement(home, beside(SECOND, at(THIRD, { state: "unreachable" })), at(THIRD, { state: "unreachable" }))?.origin).toBe(THIRD);
    // Its own signed out, a placement still read through a signed-in
    // instance follows it; one read through none stays with its own.
    expect(governingOfPlacement(home, beside(THIRD, at(FIRST)), at(FIRST))?.origin).toBe(SECOND);
    expect(governingOfPlacement(home, beside(THIRD, at(FIRST, { state: "read-only" })), at(FIRST, { state: "read-only" }))?.origin).toBe(SECOND);
    expect(governingOfPlacement(home, beside(THIRD, at(FIRST, { state: "unreachable" })), at(FIRST, { state: "unreachable" }))?.origin).toBe(FIRST);
    // No follow is made onto an instance at which the clone holds
    // another placement (git-host-5).
    expect(governingOfPlacement(home, beside(SECOND, at(FIRST)), at(FIRST))?.origin).toBe(THIRD);
    const path = placementState({ path: "/srv/academy-spex.git" });
    expect(governingOfPlacement(home, beside(SECOND, path), path)).toBeUndefined();
    // The key placement is governed by the instance the core names for
    // the row, not the first signed in; with none named, by its own.
    const keyed = repositoryRow(KEY, { instance: FIRST, governing: THIRD, state: "reachable", placements: [at(FIRST)] });
    expect(governingOfPlacement(home, keyed, at(FIRST))?.origin).toBe(THIRD);
    const ungoverned = repositoryRow(KEY, { instance: FIRST, governing: null, state: "reachable", placements: [at(FIRST)] });
    expect(governingOfPlacement(home, ungoverned, at(FIRST))?.origin).toBe(FIRST);
  });
});

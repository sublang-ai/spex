// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A Groups state as the core sends it (space-30, DR-127), for any test
// that holds one: your own group, and every instance the home lists
// with its groups. No test framework is imported, so any suite may build
// one.

import type {
  GroupsState,
  InstanceGroupState,
  InstanceState,
  PlacementBranch,
  PlacementState,
  RepositoryState,
  SpaceUnit,
} from "@sublang/spex-core/protocol";

/** What a read says the person may do in a group: nothing, as in a
 * namespace or before a read is held. */
export const NO_CAN: InstanceGroupState["can"] = { createSubgroup: false, manageMembers: false, rename: false, delete: false };

/** A namespace at an instance (space-1): your login's where `mine`,
 * another account's otherwise, holding its rows. */
export function namespace(login: string, repositories: RepositoryState[] = [], mine = true): InstanceGroupState {
  return { id: null, login, mine, fullPath: login, name: login, can: NO_CAN, placed: [], repositories };
}

/** An instance the home lists, signed in as `me` with a read held,
 * your namespace there empty unless a test says otherwise. */
export function instanceState(origin: string, over: Partial<InstanceState> = {}): InstanceState {
  const host = new URL(origin).hostname;
  return {
    origin,
    host,
    displayName: null,
    account: { id: "1", login: "me", displayName: null, canCreateGroup: false },
    signedIn: true,
    hostSignedOut: false,
    read: { phase: "idle" },
    readAt: 1,
    roles: [],
    groups: [namespace(over.account?.login ?? "me")],
    ...over,
  };
}

/** A home with your own group alone and no instance listed, its folder
 * still bearing this device's user name, unless a test says otherwise. */
export function groupsState(over: Partial<GroupsState> = {}): GroupsState {
  return {
    home: "/home/.spex",
    git: { ok: true, version: "2.50" },
    defaultInstance: "https://host.test",
    signIn: { phase: "idle" },
    own: { name: "me", named: true, repositories: [] },
    instances: [],
    diagnostics: [],
    issues: 0,
    ...over,
  };
}

/** A placement as the core sends one (space-30): held, reachable,
 * with nothing read or synced, unless a test says otherwise. */
export function placementState(over: Partial<PlacementState> = {}): PlacementState {
  return {
    instance: null,
    path: "",
    id: null,
    attached: true,
    state: "reachable",
    reason: null,
    waiting: null,
    members: null,
    visibility: null,
    can: { manageMembers: false, transfer: false },
    branch: null,
    incoming: [],
    conflicts: [],
    lastSync: null,
    noticed: false,
    outcome: null,
    ...over,
  };
}

/** What a test says of a row's key placement, on the row itself as a
 * row read before its lines did (space-30): `remote` is its path, as a
 * report reads it. */
export interface PlacementOver {
  remote?: string | null;
  waiting?: PlacementState["waiting"];
  members?: number | null;
  visibility?: string | null;
  can?: PlacementState["can"];
  branch?: PlacementBranch | null;
  incoming?: SpaceUnit[];
  lastSync?: PlacementState["lastSync"];
  noticed?: boolean;
}

/** What a test says of a row: its own fields, and its key placement's. */
export type RowOver = Partial<Omit<RepositoryState, keyof PlacementOver>> & PlacementOver;

/** A row's fields with its key placement's beside them, every one set. */
export type RowFields = Omit<RepositoryState, keyof PlacementOver | "placements"> &
  Required<PlacementOver> & { placements?: PlacementState[] };

/**
 * A row as the core sends it, from its fields and its key placement's
 * (space-30, space-87): a clone is here while the row is local only or
 * reads a branch, as the core reads none where none is. A clone holding
 * a placement holds one, its key placement, a path remote being the path
 * placement; a local-only one holds none, but for an unattached line a
 * creation waits on; a row with no clone lists one, unattached. Lines a
 * test gives stand as given. The row also carries its key placement's
 * fields itself while the protocol mirrors them.
 */
export function rowOf(fields: RowFields): RepositoryState {
  const { remote, waiting, members, visibility, can, branch, incoming, lastSync, noticed, placements, ...row } = fields;
  const here = row.state === "local-only" || branch !== null;
  const path = remote ?? row.key.replace(/^@[^/]+\//, "");
  const key = {
    instance: here && remote?.startsWith("/") ? null : row.instance,
    path,
    id: row.id,
    reason: row.reason,
    waiting,
    members,
    visibility,
    can,
    incoming,
    lastSync,
    noticed,
  };
  const lines: PlacementState[] =
    placements ??
    (row.state === "local-only"
      ? waiting
        ? [placementState({ instance: row.instance, path: `${waiting.group}/${row.name}`, attached: false, state: "absent", waiting })]
        : []
      : [
          placementState({
            ...key,
            attached: here,
            state: here ? row.state : row.state === "unreachable" ? "unreachable" : "absent",
            branch: here ? branch : null,
            conflicts: here ? row.conflicts : [],
          }),
        ]);
  return {
    ...row,
    placements: lines,
    remote,
    waiting,
    members,
    visibility,
    can,
    branch: branch === null ? null : { ...branch, mergePending: row.mergePending },
    incoming,
    lastSync,
    noticed,
  };
}

/** A repository row as the core sends one, local only on this device
 * unless a test says otherwise. */
export function repositoryRow(key: string, over: RowOver = {}): RepositoryState {
  return rowOf({
    key,
    instance: null,
    governing: null,
    name: key.split("/").pop() ?? key,
    id: null,
    own: false,
    code: null,
    folder: null,
    remote: null,
    state: "local-only",
    reason: null,
    mergePending: false,
    placedAt: [],
    waiting: null,
    members: null,
    visibility: null,
    can: { manageMembers: false, transfer: false },
    branch: null,
    local: [],
    incoming: [],
    conflicts: [],
    lastSync: null,
    noticed: false,
    sync: { phase: "idle" },
    ...over,
  });
}

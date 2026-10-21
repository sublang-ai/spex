// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A Groups state as the core sends it (space-30, DR-127), for any test
// that holds one: your own group, and every instance the home lists
// with its groups. No test framework is imported, so any suite may build
// one.

import type { GroupsState, InstanceGroupState, InstanceState, RepositoryState } from "@sublang/spex-core/protocol";

/** What a read says the person may do in a group: nothing, as in a
 * namespace or before a read is held. */
export const NO_CAN: InstanceGroupState["can"] = { createSubgroup: false, manageMembers: false, rename: false, delete: false };

/** A namespace at an instance (space-1): your login's where `mine`,
 * another account's otherwise, holding its rows. */
export function namespace(login: string, repositories: RepositoryState[] = [], mine = true): InstanceGroupState {
  return { id: null, login, mine, fullPath: login, name: login, can: NO_CAN, repositories };
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

/** A home with your own group alone and no instance listed, unless a
 * test says otherwise. */
export function groupsState(over: Partial<GroupsState> = {}): GroupsState {
  return {
    home: "/home/.spex",
    git: { ok: true, version: "2.50" },
    defaultInstance: "https://host.test",
    signIn: { phase: "idle" },
    own: { name: "me", repositories: [] },
    instances: [],
    diagnostics: [],
    issues: 0,
    ...over,
  };
}

/** A repository row as the core sends one, local only on this device
 * unless a test says otherwise. */
export function repositoryRow(key: string, over: Partial<RepositoryState> = {}): RepositoryState {
  return {
    key,
    instance: null,
    name: key.split("/").pop() ?? key,
    id: null,
    own: false,
    code: null,
    folder: null,
    remote: null,
    state: "local-only",
    reason: null,
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
  };
}

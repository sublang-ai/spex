// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A Groups state as the core sends it (space-30, DR-127), for any test
// that holds one: your own group, every instance the home lists with
// its groups, and the transitional mirrors of the default instance,
// derived from it as the core derives them until the surface reads the
// instances alone. No test framework is imported, so any suite may
// build one.

import type { GroupsState, InstanceGroupState, InstanceState, RepositoryState } from "@sublang/spex-core/protocol";

/** The fields the core mirrors from the default instance (space-30). */
type MirrorKey = "host" | "account" | "read" | "readAt" | "groups" | "roles";

/** A Groups state without its mirrors: what a test says. */
export type GroupsShape = Omit<GroupsState, MirrorKey>;

/** What a read says the person may do in a group: nothing, as in a
 * namespace or before a read is held. */
export const NO_CAN: InstanceGroupState["can"] = { createSubgroup: false, manageMembers: false, rename: false, delete: false };

/** The mirrors the core derives from the default instance (space-30):
 * its origin and display name, its account and read while signed in
 * there, its last view's time and roles, your own group holding your
 * namespace's rows there, then its other entries, and the sign-out of
 * this device it made. Mirrors a state already carries are derived
 * afresh. */
export function withMirrors(state: GroupsShape): GroupsState {
  const { host: _host, account: _account, read: _read, readAt: _readAt, groups: _groups, roles: _roles, ...shape } =
    state as GroupsState;
  const served = shape.instances.find((instance) => instance.origin === shape.defaultInstance);
  const signedIn = served?.signedIn === true;
  const mine = served?.groups.find((group) => group.mine);
  const own: GroupsState["groups"][number] = {
    id: null,
    fullPath: shape.own.name,
    name: mine?.name ?? shape.own.name,
    own: true,
    can: mine?.can ?? NO_CAN,
    repositories: [...shape.own.repositories, ...(mine?.repositories ?? [])],
  };
  const others = (served?.groups ?? [])
    .filter((group) => !group.mine)
    .map((group) => ({ id: group.id, fullPath: group.fullPath, name: group.name, own: false, can: group.can, repositories: group.repositories }));
  const signIn: GroupsState["signIn"] =
    shape.signIn.phase === "idle" && served && !signedIn && served.hostSignedOut
      ? { phase: "idle", signedOut: { by: "host", login: served.account.login } }
      : shape.signIn;
  return {
    ...shape,
    signIn,
    host: { url: shape.defaultInstance, displayName: served?.displayName ?? null },
    account: signedIn ? served.account : null,
    read: signedIn ? served.read : { phase: "idle" },
    readAt: served?.readAt ?? null,
    groups: [own, ...others],
    roles: served?.roles ?? [],
  };
}

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
export function groupsState(over: Partial<GroupsShape> = {}): GroupsState {
  return withMirrors({
    home: "/home/.spex",
    git: { ok: true, version: "2.50" },
    defaultInstance: "https://host.test",
    signIn: { phase: "idle" },
    own: { name: "me", repositories: [] },
    instances: [],
    diagnostics: [],
    issues: 0,
    ...over,
  });
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

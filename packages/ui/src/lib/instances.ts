// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instances of a Groups state (space-30, DR-127): your own group's
// rows and every instance's, each instance by its origin. Pure
// functions over the state the core sends; the surfaces render them.

import type { GroupsState, InstanceGroupState, InstanceState, RepositoryState } from "@sublang/spex-core/protocol";

/** Every spex repository of the home: your own group's rows, then each
 * instance's in the home's order, as the groups list stands them
 * (space-1). */
export function allRepositories(state: GroupsState): RepositoryState[] {
  return [
    ...state.own.repositories,
    ...state.instances.flatMap((instance) => instance.groups.flatMap((group) => group.repositories)),
  ];
}

/** The instance the home lists at an origin. */
export function instanceOf(state: GroupsState, origin: string | null | undefined): InstanceState | undefined {
  return origin ? state.instances.find((instance) => instance.origin === origin) : undefined;
}

/** Every instance the home is signed in to, in the home's order
 * (space-1, space-58). */
export function signedInInstances(state: GroupsState): InstanceState[] {
  return state.instances.filter((instance) => instance.signedIn);
}

/** Whether the home is signed in to any instance (space-1, space-58). */
export function anySignedIn(state: GroupsState | undefined): boolean {
  return state?.instances.some((instance) => instance.signedIn) ?? false;
}

/** An origin's host name, as the sign-in names the page it opens
 * (space-3): the URL's host name, or the text itself where it is no
 * URL. */
export function hostNameOf(origin: string): string {
  try {
    return new URL(origin).hostname || origin;
  } catch {
    return origin;
  }
}

/** The origin a URL names, as the core records an instance (DR-127): the
 * scheme, the host in lowercase and a port other than the scheme's; the
 * text itself where it is no URL. */
export function originOf(url: string): string {
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? url : origin;
  } catch {
    return url;
  }
}

/** How the surface names an instance (space-1, space-58): its display
 * name, its host name until a read names one. */
export function instanceName(instance: InstanceState): string {
  return instance.displayName ?? instance.host;
}

/** How the surface names the instance at an origin: as the home's
 * Groups state names it, its host name where the state lists none — a
 * seat's instance, named where its sign-in runs (run-view-168,
 * run-view-174). */
export function instanceNameAt(state: GroupsState | undefined, origin: string): string {
  const instance = state ? instanceOf(state, origin) : undefined;
  return instance ? instanceName(instance) : hostNameOf(origin);
}

/** Your namespace at an instance: the entry keyed by your login there
 * (space-1). */
export function namespaceOf(instance: InstanceState): InstanceGroupState | undefined {
  return instance.groups.find((group) => group.mine);
}

/** An entry's key within its instance, as test ids name it: a group by
 * its path, a namespace by `@` and its login — `@` begins no path the
 * host answers (DR-127), so a namespace never shares a group's key. */
export function groupTestKey(group: InstanceGroupState): string {
  return group.login !== null ? `@${group.login}` : group.fullPath;
}

/** Where a row stands (space-1): under an entry of an instance's
 * heading, or under your own group. */
export type Standing =
  | { own: true }
  | { own: false; instance: InstanceState; group: InstanceGroupState };

/** The place the core stood a row at, by its key; none for a key the
 * state does not hold. */
export function standingOf(state: GroupsState, key: string): Standing | undefined {
  if (state.own.repositories.some((repository) => repository.key === key)) return { own: true };
  for (const instance of state.instances) {
    for (const group of instance.groups) {
      if (group.repositories.some((repository) => repository.key === key)) return { own: false, instance, group };
    }
  }
  return undefined;
}

/** The instances "Pick a group" offers a local-only row (space-58):
 * every signed-in one, in the home's order, and its clone's instance
 * alone where its key lies under one. */
export function pickInstances(state: GroupsState, repo: RepositoryState): InstanceState[] {
  return signedInInstances(state).filter((instance) => repo.instance === null || instance.origin === repo.instance);
}

/** An instance's entries in the order its heading lists them (space-1):
 * every group in the order of their paths, then your namespace there,
 * then each other account's login — whatever order the state holds. */
export function entriesOf(instance: InstanceState): InstanceGroupState[] {
  const groups = instance.groups.filter((entry) => entry.login === null);
  const mine = instance.groups.filter((entry) => entry.login !== null && entry.mine);
  const others = instance.groups.filter((entry) => entry.login !== null && !entry.mine);
  return [
    ...groups.sort((a, b) => a.fullPath.localeCompare(b.fullPath)),
    ...mine,
    ...others.sort((a, b) => (a.login ?? "").localeCompare(b.login ?? "")),
  ];
}

/** The instance governing a row (space-1, space-61): the one the core
 * names as governing its spex repository (git-host-5), whose roles and
 * host name its members panel reads; while none does, its own instance,
 * signed out, whose sign-in its Sync waits for (space-11); none for a
 * row with no instance. */
export function governingOf(state: GroupsState, repo: RepositoryState): InstanceState | undefined {
  return instanceOf(state, repo.governing) ?? instanceOf(state, repo.instance);
}

/** The instance whose "Personal" holds your own group's own repository
 * (space-1): while it holds a placement with an instance, the instance
 * governing it, else its first such placement's, either among those the
 * home lists; none otherwise, the row standing under "This computer". */
export function ownPersonalAt(state: GroupsState): InstanceState | undefined {
  const own = state.own.repositories.find((repository) => repository.own);
  // Local only while its clone holds no placement (space-61).
  if (!own || own.state === "local-only") return undefined;
  const first = own.placements.find((placement) => placement.instance !== null);
  if (!first) return undefined;
  return instanceOf(state, own.governing) ?? instanceOf(state, first.instance);
}

/** The rows "This computer" holds (space-1): your own group's, but its
 * own repository while it stands under "Personal" at an instance. */
export function thisComputerRows(state: GroupsState): RepositoryState[] {
  const personal = ownPersonalAt(state) !== undefined;
  return state.own.repositories.filter((repository) => !(personal && repository.own));
}

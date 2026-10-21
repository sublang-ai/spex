// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instances of a Groups state (space-30, DR-127): your own group's
// rows and every instance's, each instance by its origin. Pure
// functions over the state the core sends; the surfaces render them.

import type { GroupsState, InstanceState, RepositoryState } from "@sublang/spex-core/protocol";

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

/** Whether the home is signed in to any instance (space-1, space-58). */
export function anySignedIn(state: GroupsState | undefined): boolean {
  return state?.instances.some((instance) => instance.signedIn) ?? false;
}

/** Whether the home lists its default instance and is signed in there:
 * where a publish goes (DR-127). */
export function defaultSignedIn(state: GroupsState | undefined): boolean {
  return state ? instanceOf(state, state.defaultInstance)?.signedIn === true : false;
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

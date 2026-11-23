// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Read personal project and account state from the core.

import type { SpaceState, InstanceState, RepositoryState } from "@sublang/spex-core/protocol";

export function allRepositories(state: SpaceState): RepositoryState[] {
  return state.repositories;
}

/** The instance the home lists at an origin. */
export function instanceOf(state: SpaceState, origin: string | null | undefined): InstanceState | undefined {
  return origin ? state.instances.find((instance) => instance.origin === origin) : undefined;
}

/** Every instance the home is signed in to, in the home's order
 * (space-1). */
export function signedInInstances(state: SpaceState): InstanceState[] {
  return state.instances.filter((instance) => instance.signedIn);
}

/** Whether the home is signed in to any instance (space-1). */
export function anySignedIn(state: SpaceState | undefined): boolean {
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

/** How the surface names an instance (space-1): its display
 * name, its host name until a read names one. */
export function instanceName(instance: InstanceState): string {
  return instance.displayName ?? instance.host;
}

/** The Space display name, or its hostname until the first read. */
export function instanceNameAt(state: SpaceState | undefined, origin: string): string {
  const instance = state ? instanceOf(state, origin) : undefined;
  return instance ? instanceName(instance) : hostNameOf(origin);
}

export function pickInstances(state: SpaceState, repo: RepositoryState): InstanceState[] {
  return signedInInstances(state).filter((instance) => repo.instance === null || instance.origin === repo.instance);
}

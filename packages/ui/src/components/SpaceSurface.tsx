// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface (space-1, DR-057): the Spex home at a glance, its
// setup, its changes and sync, and the read-only explorer. This is the
// mount point; the surface's content lands with the space package.

/** The surface root is the box the surface scrolls in (DR-041 §9): the
 * page itself never scrolls. */
export function SpaceSurface() {
  return (
    <section
      data-testid="space-surface"
      aria-label="Space"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
    >
      <h1 className="text-lg font-semibold">Space</h1>
    </section>
  );
}

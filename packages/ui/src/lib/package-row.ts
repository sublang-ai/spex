// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The way to a package's row (playbook-library-93, applets-1, DR-176):
// "Its package" beneath the Add form and an applet's "from <package>"
// line show the page the package's environment is managed on — the
// project's Packages tab for a project's package, the Playbooks surface
// for a global one — then bring the row into view once it draws.

import type { AppStore } from "../state/store.js";

/** How long the row is looked for while the page reads its packages. */
const LOOK_MS = 3000;

/** Where a package's row stands: the Packages tab of the project named,
 * or, for a global package, the Playbooks surface, which `show` brings
 * up. */
export type PackageRowPlace = { projectId: string } | { show: () => void };

/** Show the page `place` names and bring `name`'s row into view there. */
export function openPackageRow(store: AppStore, place: PackageRowPlace, name: string): void {
  let container: string;
  if ("projectId" in place) {
    store.getState().setWorkspaceTab(place.projectId, "packages");
    container = "packages-tab";
  } else {
    place.show();
    container = "playbooks-surface";
  }
  if (typeof document === "undefined" || typeof requestAnimationFrame !== "function") return;
  const row = `[data-testid="${container}"] [data-testid="env-package-${name}"]`;
  const started = Date.now();
  const look = (): void => {
    const found = document.querySelector<HTMLElement>(row);
    if (found) {
      found.scrollIntoView?.({ block: "center" });
      return;
    }
    if (Date.now() - started < LOOK_MS) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

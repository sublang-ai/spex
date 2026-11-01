// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The way to a package's row on a project's Packages tab
// (playbook-library-93, applets-1, DR-172): "Its package" beneath the
// Enable form and an applet's "from <package>" line show the tab, then
// bring the row into view once it draws — under "Packages" for the
// project's, under "Personal" for yours, wherever that section stands.

import type { AppStore } from "../state/store.js";

/** How long the row is looked for while the tab reads its packages. */
const LOOK_MS = 3000;

/** Show the project's Packages tab and bring `name`'s row into view in
 * the section its environment heads. */
export function openPackageRow(
  store: AppStore,
  projectId: string,
  name: string,
  section: "project" | "personal",
): void {
  store.getState().setWorkspaceTab(projectId, "packages");
  if (typeof document === "undefined" || typeof requestAnimationFrame !== "function") return;
  const row = `[data-testid="env-package-${name}"]`;
  const started = Date.now();
  const look = (): void => {
    const found =
      document.querySelector<HTMLElement>(`[data-testid="packages-${section}"] ${row}`) ??
      document.querySelector<HTMLElement>(`[data-testid="packages-tab"] ${row}`);
    if (found) {
      found.scrollIntoView?.({ block: "center" });
      return;
    }
    if (Date.now() - started < LOOK_MS) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The sidebar names one place at a time (run-view-122): leaving
// Projects leaves no project row lit beside the surface's own entry,
// and coming back lights the remembered project again; a project's
// Playbooks tab stands on Projects, and a Playbooks surface remembered
// from before it retired returns there (DR-172).

import { test, expect, open, nav, projectTab, projectTabControl } from "../src/harness";

test.use({ appOptions: { project: true } });

/** Where the page keeps the surface the reader last stood on. */
const SURFACE_KEY = "spex.surface";

test("run-view-122: the sidebar's selection follows the surface", async ({
  page,
  app,
}) => {
  await open(page, app);
  const projectRow = page.getByTestId(`sidebar-project-${app.projectId}`);
  const selectedRows = page.locator('[role="treeitem"][aria-selected="true"]');

  // Projects is where the reader is: the project's row says so.
  await expect(nav(page, "Projects")).toHaveAttribute("aria-current", "page");
  await expect(projectRow).toHaveAttribute("aria-selected", "true");

  // The Dashboard and Space are places of their own; neither leaves a
  // row behind claiming to be where the reader is.
  await nav(page, "Dashboard").click();
  await expect(nav(page, "Dashboard")).toHaveAttribute("aria-current", "page");
  await expect(selectedRows).toHaveCount(0);

  await nav(page, "Space").click();
  await expect(page.getByTestId("space-surface")).toBeVisible();
  await expect(nav(page, "Space")).toHaveAttribute("aria-current", "page");
  await expect(selectedRows).toHaveCount(0);
  await expect(projectRow).not.toHaveAttribute("aria-selected", "true");

  // The project is still remembered, so Projects selects it again.
  await nav(page, "Projects").click();
  await expect(page.getByTestId("captain-home")).toBeVisible();
  await expect(projectRow).toHaveAttribute("aria-selected", "true");

  // The project's Playbooks tab is one of its views: Projects stays the
  // surface and the project's row stays selected (run-view-58).
  await projectTab(page, "Playbooks");
  await expect(page.getByTestId("playbooks-enabled")).toBeVisible();
  await expect(nav(page, "Projects")).toHaveAttribute("aria-current", "page");
  await expect(projectRow).toHaveAttribute("aria-selected", "true");

  // The surface itself is remembered across launches (run-view-67):
  // reloading returns the reader where they stood, not to Projects.
  await nav(page, "Space").click();
  await expect(page.getByTestId("space-surface")).toBeVisible();
  await page.reload();
  await expect(nav(page, "Space")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("space-surface")).toBeVisible();

  // A Playbooks surface remembered from before it retired opens the
  // current project's Playbooks tab (run-view-67).
  await page.evaluate((key) => window.localStorage.setItem(key, "Playbooks"), SURFACE_KEY);
  await page.reload();
  await expect(nav(page, "Projects")).toHaveAttribute("aria-current", "page");
  await expect(projectTabControl(page, "Playbooks")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("playbooks-enabled")).toBeVisible();
  await expect(projectRow).toHaveAttribute("aria-selected", "true");
});

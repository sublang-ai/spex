// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The sidebar names one place at a time (run-view-122): leaving the
// Workspace leaves no project row lit beside the surface's own entry,
// and coming back lights the remembered project again.

import { test, expect, open, nav } from "../src/harness";

test.use({ appOptions: { project: true } });

test("run-view-122: the sidebar's selection follows the surface", async ({
  page,
  app,
}) => {
  await open(page, app);
  const projectRow = page.getByTestId(`sidebar-project-${app.projectId}`);
  const selectedRows = page.locator('[role="treeitem"][aria-selected="true"]');

  // The Workspace is where the reader is: the project's row says so.
  await expect(nav(page, "Workspace")).toHaveAttribute("aria-current", "page");
  await expect(projectRow).toHaveAttribute("aria-selected", "true");

  // The Dashboard and Playbooks are places of their own; neither
  // leaves a row behind claiming to be where the reader is.
  await nav(page, "Dashboard").click();
  await expect(nav(page, "Dashboard")).toHaveAttribute("aria-current", "page");
  await expect(selectedRows).toHaveCount(0);

  await nav(page, "Playbooks").click();
  await expect(page.getByTestId("builtins-section")).toBeVisible();
  await expect(nav(page, "Playbooks")).toHaveAttribute("aria-current", "page");
  await expect(selectedRows).toHaveCount(0);
  await expect(projectRow).not.toHaveAttribute("aria-selected", "true");

  // The project is still remembered, so the Workspace selects it again.
  await nav(page, "Workspace").click();
  await expect(page.getByTestId("captain-home")).toBeVisible();
  await expect(projectRow).toHaveAttribute("aria-selected", "true");
});

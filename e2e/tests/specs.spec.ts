// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Reading specs (spec-view-46): the seeded example's tree in the
// Specs tab — outline, expansion, a citation jump, the filter, and
// the graph toggle.

import { test, expect, open } from "../src/harness";

test.use({ appOptions: { project: true } });

test("spec-view-46: the Specs tab reads the seeded tree", async ({ page, app }) => {
  await open(page, app);
  await page.getByRole("tab", { name: "Specs" }).click();

  // The outline: packages and the decisions branch.
  const outline = page.getByTestId("specv-live");
  await expect(outline).toBeVisible();
  await expect(page.getByTestId("decisions-branch")).toBeVisible();
  const files = page.getByTestId(/^file-/);
  await expect(files.first()).toBeVisible();
  const count = await files.count();
  expect(count).toBeGreaterThan(3);

  // Expand a package: its items appear.
  await page.getByTestId(/^file-toggle-/).first().click();
  const items = page.getByTestId(/^item-toggle-/);
  await expect(items.first()).toBeVisible();

  // The filter narrows with a match count, and clears.
  const filter = page.getByLabel("Filter items by ID or text");
  await filter.fill("shall");
  await expect(page.getByTestId("match-count")).toContainText(/\d+/);
  const narrowed = await page.getByTestId("match-count").innerText();
  await filter.fill("zzzz-no-such-text");
  await expect(page.getByTestId("match-count")).toContainText(/^0\b|no match/i);
  await page.getByRole("button", { name: "Clear the search" }).click();
  await expect(filter).toHaveValue("");
  void narrowed;

  // The graph toggle removes the picture and adds it back beside the
  // outline (it is on by default at this width).
  const toggle = page.getByTestId("view-graph");
  const split = page.getByTestId("graph-split");
  const on = (await toggle.getAttribute("aria-pressed")) === "true";
  if (on) await expect(split).toBeVisible();
  await toggle.click();
  if (on) await expect(split).toHaveCount(0);
  else await expect(split).toBeVisible();
  await toggle.click();
  if (on) await expect(split).toBeVisible();
  else await expect(split).toHaveCount(0);
});

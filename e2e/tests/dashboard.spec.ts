// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The intent ledger as a user works it (dashboard-39, run-view-100's
// sibling flows): capture, start, watch, confirm, and the History that
// results — all through the Dashboard and the run view.

import { test, expect, open, nav } from "../src/harness";

test.use({ appOptions: { project: true, agentDelayMs: 2500 } });

test("dashboard-39: capture, start, confirm, and History through the page", async ({
  page,
  app,
}) => {
  await open(page, app);
  await nav(page, "Dashboard").click();
  const group = page.getByTestId(`project-group-${app.projectId}`);
  await expect(group).toBeVisible();

  // Empty bands carry guidance, never blanks.
  await expect(group).toContainText(/nothing done here yet/i);
  await expect(group).toContainText(/idle/i);
  await expect(group).toContainText(/nothing queued/i);
  await expect(page.getByTestId("attention-all-clear")).toContainText(/all clear/i);

  // Sources: collapsed summary, GitHub guidance in GitHub terms, and
  // the seeded example's open records with their Queue controls.
  const sourcesToggle = page.getByTestId(`sources-toggle-${app.projectId}`);
  await expect(sourcesToggle).toContainText(/open records/i);
  await sourcesToggle.click();
  await expect(page.getByTestId(`sources-guidance-${app.projectId}`)).toContainText(/github/i);
  await page.getByTestId(`sources-tab-records-${app.projectId}`).click();
  const record = page.getByTestId(new RegExp(`^source-record-${app.projectId}-`)).first();
  await expect(record).toBeVisible();

  // Inline capture reveals the row; the all-clear names it next.
  const add = page.getByRole("textbox", { name: /add an intent to demo-project/i });
  await add.fill("Add a README badge");
  await add.press("Enter");
  const row = page.getByTestId(/^upnext-row-/).filter({ hasText: "Add a README badge" });
  await expect(row).toBeVisible();
  await expect(add).toHaveValue("");
  await expect(page.getByTestId("attention-all-clear")).toContainText(/add a readme badge/i);

  // A second intent, removed before it ever ran, leaves no History.
  await add.fill("Second thought");
  await add.press("Enter");
  const second = page.getByTestId(/^upnext-row-/).filter({ hasText: "Second thought" });
  await expect(second).toBeVisible();
  await second.getByRole("button", { name: /actions for second thought/i }).click();
  await page.getByTestId(/^upnext-remove-action-/).click();
  await expect(second).toHaveCount(0);
  await expect(group).toContainText(/nothing done here yet/i);

  // Queue from a record: the row wears its provenance.
  await record.getByRole("button", { name: /queue/i }).click();
  await expect(page.getByTestId(/^upnext-row-/)).toHaveCount(2);
  await expect(page.getByTestId(/^upnext-row-/).nth(1)).toContainText(/IR-\d+/);

  // Start stages the head intent into the composer; Send dispatches.
  await page.getByTestId("all-clear-start").click();
  await expect(page.getByTestId("staged-intent-chip")).toContainText(/add a readme badge/i);
  await expect(page.getByTestId("start-composer")).toHaveValue("Add a README badge");
  await page.getByTestId("start-send").click();
  await expect(page.getByTestId("captain-pane")).toContainText("/code started");

  // Now shows the live session while it runs; the badge is quiet.
  await nav(page, "Dashboard").click();
  await expect(page.getByTestId(`now-session-${app.projectId}`)).toBeVisible();
  await expect(page.getByTestId(/^upnext-row-/)).toHaveCount(1);

  // Finished: the attention entry, its Confirm, then History.
  const confirm = page.getByTestId(/^attention-confirm-/);
  await expect(confirm).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("nav-attention-badge")).toContainText("1");
  await confirm.click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByTestId("nav-attention-badge")).toHaveCount(0);
  const history = page.getByTestId(/^history-row-/).filter({ hasText: "Add a README badge" });
  await expect(history).toBeVisible();
  await expect(history).not.toContainText(/dropped/i);
  await expect(group).not.toContainText(/nothing done here yet/i);
  // The next queued intent moved up, and the all-clear names it.
  await expect(page.getByTestId("attention-all-clear")).toContainText(/IR-\d+|next up/i);
});

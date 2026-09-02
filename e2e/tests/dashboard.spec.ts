// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The intent ledger as a user works it (dashboard-39, run-view-100's
// sibling flows): capture, start, watch, confirm, and the History that
// results — all through the Dashboard and the run view.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect, open, nav } from "../src/harness";

test.use({ appOptions: { project: true, agentDelayMs: 2500 } });

test("run-view-115, dashboard-39: an intent dropped from the working line leaves Now and lists in History as dropped", async ({
  page,
  app,
}) => {
  await open(page, app);
  await nav(page, "Dashboard").click();
  const add = page.getByRole("textbox", { name: /add an intent to demo-project/i });
  await add.fill("Drop me midway");
  await add.press("Enter");
  await expect(
    page.getByTestId(/^upnext-row-/).filter({ hasText: "Drop me midway" }),
  ).toBeVisible();
  await page.getByTestId("all-clear-start").click();
  await expect(page.getByTestId("start-composer")).toHaveValue("Drop me midway");
  await page.getByTestId("start-send").click();
  await expect(page.getByTestId("captain-pane")).toContainText("/code started");

  // The working line names the intent; Drop sits behind the inline
  // confirm, and Keep hands focus back to the control.
  const line = page.getByTestId("working-line");
  await expect(line).toContainText("Drop me midway");
  await page.getByTestId("working-drop").click();
  await expect(line).toContainText(/work is underway/i);
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(page.getByTestId("working-drop")).toBeFocused();
  await page.getByTestId("working-drop").click();
  await page.getByRole("button", { name: "Drop", exact: true }).click();
  await expect(line).toHaveCount(0);
  const note = page.getByTestId("working-note");
  await expect(note).toContainText(/dropped “drop me midway”/i);
  await expect(note).toHaveAttribute("role", "status");
  await expect(page.getByTestId("boss-composer")).toBeFocused();

  // Now still shows the live session, but serves no intent: no Drop
  // stands beside it, and the queue holds nothing.
  await nav(page, "Dashboard").click();
  const now = page.getByTestId(`now-session-${app.projectId}`);
  await expect(now).toBeVisible();
  await expect(now).not.toHaveAttribute("data-intent-id", /./);
  await expect(page.getByTestId(`now-drop-${app.projectId}`)).toHaveCount(0);
  await expect(page.getByTestId(/^upnext-row-/)).toHaveCount(0);

  // The turn it was dropped from ends finished: worked, then dropped,
  // so History lists it under the quiet tag, and no verdict is owed.
  const history = page
    .getByTestId(/^history-row-/)
    .filter({ hasText: "Drop me midway" });
  await expect(history).toBeVisible({ timeout: 20_000 });
  await expect(history).toHaveAttribute("data-verdict", "dropped");
  await expect(history).toContainText(/dropped/i);
  await expect(page.getByTestId(/^attention-confirm-/)).toHaveCount(0);
});

test("dashboard-39: a History record row opens the record in the Specs tab's reader", async ({
  page,
  app,
}) => {
  // A finished record in the seeded tree: History lists it.
  writeFileSync(
    join(app.projectDir, "specs", "intents", "004-shipped.md"),
    [
      "# IR-004: Shipped already",
      "",
      "## Status",
      "",
      "Done",
      "",
      "## Intent",
      "",
      "This one shipped before the app met the project.",
      "",
    ].join("\n"),
  );
  await open(page, app);
  await nav(page, "Dashboard").click();
  const row = page.getByTestId("history-row-IR-004");
  await expect(row).toContainText("Shipped already");
  await row.getByRole("button", { name: /open IR-004/i }).click();

  // The Specs tab, in the records reader, on that record.
  await expect(page.getByRole("tab", { name: "Specs" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const reader = page.getByTestId("record-reader");
  await expect(reader).toContainText("IR-004");
  await expect(reader).toContainText(/shipped before the app met the project/i);
});

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

test("dashboard-39: the row menu moves, removes with Undo, and closes on Escape", async ({
  page,
  app,
}) => {
  await open(page, app);
  await nav(page, "Dashboard").click();
  const add = page.getByRole("textbox", { name: /add an intent to demo-project/i });
  const rows = page.getByTestId(/^upnext-row-/);
  await add.fill("First");
  await add.press("Enter");
  await expect(rows).toHaveCount(1);
  await add.fill("Second");
  await add.press("Enter");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("First");

  // Move down from the menu: a single-pointer alternative to dragging.
  const trigger = page.getByRole("button", { name: /actions for first/i });
  await trigger.click();
  const menu = page.getByRole("menu", { name: /actions for first/i });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Move down" }).click();
  await expect(rows.nth(0)).toContainText("Second");
  await expect(rows.nth(1)).toContainText("First");

  // Escape closes the menu and puts focus back on its trigger.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  // Remove, then Undo brings the row back where it was.
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Remove" }).click();
  await expect(rows).toHaveCount(1);
  const removed = page.getByTestId(`upnext-removed-${app.projectId}`);
  await expect(removed).toContainText(/removed/i);
  await expect(removed).toHaveAttribute("role", "status");
  await removed.getByRole("button", { name: "Undo" }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText("First");
  await expect(removed).toBeHidden();
});

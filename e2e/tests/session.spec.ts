// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A session end to end (run-view-98, run-view-99, server-shell-21): the
// served page, its token gone from the address bar, running the
// scripted Captain's narration through the real core.

import { test, expect, open, send } from "../src/harness";

test.use({ appOptions: { project: true, agentDelayMs: 1500 } });

test("server-shell-21: the token URL connects, scrubs, and reloads", async ({
  page,
  app,
}) => {
  await open(page, app);
  await expect(page).toHaveURL(`${app.origin}/`);
  await page.reload();
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(/reconnecting to the spex core/i)).toHaveCount(0);
  // The overrides drive the served core: the fake environment is ready.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText(/claude/).first()).toBeVisible();
  await expect(page.getByText(/not ready|aren't ready/i)).toHaveCount(0);
});

test("run-view-98: the first task runs, queues, and ends", async ({ page, app }) => {
  await open(page, app);
  const home = page.getByTestId("captain-home");
  await expect(home).toContainText("demo-project");

  await send(page, "Fix the token refresh in auth.ts");

  // The tab and the sidebar row carry the task as the title.
  const tab = page.getByRole("tab", { name: /fix the token refresh/i });
  await expect(tab).toBeVisible();
  const tree = page.getByRole("tree", { name: "Projects and sessions" });
  await expect(tree).toContainText(/fix the token refresh/i);

  // The Captain narrates; the machine card draws the code run with
  // its nested review.
  const captain = page.getByTestId("captain-pane");
  await expect(captain).toContainText("/code started");
  const machines = page.getByTestId("live-machines");
  await expect(machines).toContainText(/code/i);

  // One pane per roster player; the coder streams and uses tools.
  const coder = page.getByTestId("player-pane-dev.coder");
  const reviewer = page.getByTestId("player-pane-dev.reviewer");
  await expect(coder).toBeVisible();
  await expect(reviewer).toBeVisible();
  await expect(coder).toContainText(/editing/i);
  await expect(coder).toContainText(/Edit|Read/);

  // A message during the turn queues — never reads as sent — and
  // goes out when the turn ends.
  const box = page.getByTestId("boss-composer");
  await expect(box).toHaveAttribute("placeholder", /sends after this turn/i);
  await box.fill("Also add a test for expiry skew");
  await page.getByRole("button", { name: "Send next", exact: true }).click();
  await expect(page.getByTestId("queue-indicator")).toBeVisible();
  await expect(page.getByTestId("queue-indicator")).toContainText(/expiry skew/i);
  await expect(page.getByTestId("queue-indicator")).toContainText(
    "sends when this turn ends",
  );
  await expect(captain).toContainText("/code finished");
  await expect(captain).toContainText(/review/i);
  await expect(coder).toContainText(/\$0\.12|2,?400/);
  // The queued message became the next turn.
  await expect(captain.getByTestId("boss-bubble").filter({ hasText: /expiry skew/i })).toBeVisible();
  await expect(page.getByTestId("queue-indicator")).toHaveCount(0);
  await expect(captain).toContainText("/code finished");

  // Text shelved instead of sent (run-view-85): the control and its
  // note name where it went, and the Overview's Up next holds it.
  await box.fill("Later: tighten the expiry tests");
  await page.getByRole("button", { name: "Add to Up next", exact: true }).click();
  await expect(page.getByTestId("queued-intent-note")).toHaveText(
    "Added to Up next — see the project's Overview.",
  );
  await expect(box).toHaveValue("");
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByTestId(`upnext-${app.projectId}`)).toContainText(
    /tighten the expiry tests/i,
  );
  await tab.click();

  // Ending: the inline confirm says a message can continue it, then
  // the notice reads the paused conversation above the composer,
  // which stays (run-view-33, DR-042).
  await page.getByTestId("end-session").click();
  await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
  await expect(page.getByText(/A message can continue it later/)).toBeVisible();
  await page.getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByTestId("ended-notice")).toContainText("a message continues it");
  await expect(page.getByTestId("boss-composer")).toBeEnabled();
  await expect(page.getByRole("button", { name: "New session", exact: true })).toBeVisible();
  await expect(tree).toContainText(/fix the token refresh/i);
});

test("run-view-99: a player question parks the session until the Boss replies", async ({
  page,
  app,
}) => {
  await open(page, app);
  await send(page, "ask before migrating");

  const question = page.getByTestId("question-bubble");
  await expect(question).toContainText(/migrate the legacy sessions/i);
  await expect(question).toContainText(/coder/i);
  const chip = page.getByTestId("state-chip");
  await expect(chip).toContainText(/wait/i);
  const box = page.getByTestId("boss-composer");
  await expect(box).toHaveAttribute("placeholder", /reply to coder/i);

  await box.fill("Yes, migrate them too");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const captain = page.getByTestId("captain-pane");
  await expect(captain).toContainText("/code finished");
  await expect(chip).not.toContainText(/wait/i);
});

// The working lane comes into view (run-view-7): stacked at a narrow
// width, the coder's pane starts below the fold and the grid scrolls
// to it when its call opens.
test("run-view-7: a lane's pane scrolls into view when its call opens", async ({
  page,
  app,
}) => {
  await page.setViewportSize({ width: 600, height: 500 });
  await open(page, app);
  await send(page, "Fix the token refresh in auth.ts");
  const grid = page.getByTestId("player-grid");
  const coder = page.getByTestId("player-pane-dev.coder");
  await expect(coder).toContainText("coder working");
  await expect
    .poll(async () => {
      const g = await grid.boundingBox();
      const p = await coder.boundingBox();
      if (!g || !p) return false;
      return p.y + 40 <= g.y + g.height && p.y >= g.y - 1;
    })
    .toBe(true);
});

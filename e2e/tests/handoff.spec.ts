// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The queue hands off on every commit (dashboard-64, DR-077, DR-089):
// the hermetic twin of the regression's new-project scenario. Two
// intents are captured, the first started from the Dashboard, and the
// scripted Captain's clean settlement of its turn dispatches the second
// with nothing pressed; both are confirmed and History lists them.

import { test, expect, open, surfaceEntry } from "../src/harness";

// Each demo player call stays in flight long enough to read the
// Dashboard while the first intent's turn runs.
test.use({ appOptions: { project: true, agentDelayMs: 4000 } });

const FIRST = "Fix the login redirect";
const SECOND = "Add the expiry test";

test("dashboard-64: a settled turn hands the queue to the next intent with nothing pressed", async ({
  page,
  app,
}) => {
  await open(page, app);
  const dashboard = surfaceEntry(page, "Dashboard");
  await dashboard.click();
  const add = page.getByRole("textbox", { name: /add an intent to demo-project/i });
  const capture = async (text: string): Promise<string> => {
    await add.fill(text);
    await add.press("Enter");
    const row = page.getByTestId(/^upnext-row-/).filter({ hasText: text });
    await expect(row).toBeVisible();
    return (await row.getAttribute("data-intent-id"))!;
  };
  const firstId = await capture(FIRST);
  const secondId = await capture(SECOND);

  // The first starts from its Up next row, staged into the composer.
  await page.getByTestId(`upnext-start-${firstId}`).click();
  await expect(page.getByTestId("start-composer")).toHaveValue(FIRST);
  await page.getByTestId("start-send").click();
  await expect(page.getByTestId("captain-pane")).toContainText("/code started");

  // While it runs, the second is the project's next: Queued, after the
  // current work, with no Start (dashboard-29, dashboard-59).
  await dashboard.click();
  const now = page.getByTestId(`now-session-${app.projectId}`);
  await expect(now).toHaveAttribute("data-intent-id", firstId);
  const second = page.getByTestId(`upnext-row-${secondId}`);
  await expect(second).toHaveAttribute("data-next", "true");
  await expect(page.getByTestId(`upnext-queued-${secondId}`)).toHaveText("Queued");
  await expect(page.getByTestId(`upnext-standing-${secondId}`)).toHaveText("after current work");
  await expect(page.getByTestId(`upnext-start-${secondId}`)).toHaveCount(0);

  // The first turn's clean settlement dispatches the second with no
  // Confirm pressed: Up next no longer lists it, Now shows it
  // (dashboard-29, dashboard-28), and the first stands finished in the
  // attention queue with Confirm (dashboard-1).
  await expect(second).toHaveCount(0, { timeout: 30_000 });
  await expect(now).toHaveAttribute("data-intent-id", secondId);
  await expect(page.getByTestId(`attention-${firstId}-finish`)).toBeVisible();
  await expect(page.getByTestId(`attention-confirm-${firstId}`)).toBeVisible();

  // Each confirmed leaves the attention queue (dashboard-4), and
  // History lists both as done (dashboard-27).
  for (const intentId of [firstId, secondId]) {
    const entry = page.getByTestId(`attention-${intentId}-finish`);
    await expect(entry).toBeVisible({ timeout: 30_000 });
    await page.getByTestId(`attention-confirm-${intentId}`).click();
    await expect(entry).toHaveCount(0);
  }
  for (const intentId of [firstId, secondId]) {
    await expect(page.getByTestId(`history-row-${intentId}`)).toHaveAttribute("data-verdict", "done");
  }
  await expect(page.getByTestId(/^upnext-row-/)).toHaveCount(0);
});

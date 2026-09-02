// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The live lane (run-view-104): the machine's signed-in agents and the
// real Captain, a minimal no-change task observed to a player's live
// output, then aborted — under DR-020's budget. Runs only with
// SPEX_E2E_LIVE=1.

import { test, expect, open, send, LIVE } from "../src/harness";

test.use({ appOptions: { config: "none", project: true } });

test("run-view-104 @live: a real /code task shows live output and aborts cleanly", async ({
  page,
  app,
}) => {
  test.skip(!LIVE, "live lane only");
  await open(page, app);
  await expect(page.getByTestId("captain-home")).toContainText("demo-project");

  await send(
    page,
    "/code Append a single line reading `smoke ok` to the end of README.md. Change nothing else.",
  );
  const captain = page.getByTestId("captain-pane");
  await expect(captain).toBeVisible();

  // A player's pane fills with the agent's live output.
  const pane = page.getByTestId(/^player-pane-/).filter({ hasText: /\S{20,}/ }).first();
  await expect(pane).toBeVisible({ timeout: 8 * 60_000 });

  // Abort acknowledges at once and the turn ends aborted.
  const abort = page.getByTestId("abort-button");
  await abort.click();
  await expect(abort).toContainText(/aborting/i);
  await expect(captain).toContainText(/abort/i, { timeout: 90_000 });
  await expect(page.getByTestId("boss-composer")).toBeEnabled({ timeout: 90_000 });

  await page.getByTestId("end-session").click();
  await page.getByRole("button", { name: "end", exact: true }).click();
  await expect(page.getByTestId("ended-notice")).toBeVisible();
});

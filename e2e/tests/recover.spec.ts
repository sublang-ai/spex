// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The failed-workflow round trip (run-view-132, DR-060): a workflow
// parked in its recoverable failure state used to offer nothing but
// prose in the composer. The notice stands with one control; pressing
// it sends the one canonical request as an ordinary, visible Boss
// turn, and the notice leaves when the run leaves `failed`.

import type { Page } from "@playwright/test";

import { test, expect, open, send } from "../src/harness";
import { setRail } from "../src/fit";

test.use({ appOptions: { project: true, agentDelayMs: 3000 } });

/** Two frames, so a container query has answered a resize before the
 * layout is measured. */
async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** The one sentence the control sends, every time (run-view-129). */
const RECOVERY_REQUEST =
  "Retry the failed workflow using the recovery action it offers.";

test("run-view-132: the failed workflow offers a way back, and it is an ordinary Boss turn", async ({
  page,
  app,
}) => {
  await open(page, app);
  await send(page, "Fail the token refresh patch");

  // The run parks in its failure state: the notice stands between the
  // pane and the composer, naming the workflow by its command and
  // saying what its control does.
  const captain = page.getByTestId("captain-pane");
  await expect(captain).toContainText("workflow failed; awaiting Boss recovery.");
  const notice = page.getByTestId("failed-workflow");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(
    "The /code workflow failed and is waiting for you.",
  );
  await expect(notice).toContainText(
    "Retry asks the Captain to run its recovery.",
  );
  await expect(notice).toHaveAttribute("title", "state: failed");

  // The turn settled and left the notice standing, so the way back is
  // there when the reader comes back to it.
  const retry = page.getByTestId("failed-workflow-retry");
  await expect(retry).toBeEnabled();
  await expect(page.getByTestId("boss-composer")).toBeEnabled();

  // At the reflow floor the control yields under the words rather
  // than overlapping them or leaving the notice's box (DR-041; the
  // 320px floor holds with the rail collapsed, since the open rail is
  // 224px wide). A simulated document cannot measure layout, so the
  // evidence is here.
  await setRail(page, false);
  await page.setViewportSize({ width: 320, height: 800 });
  await settleLayout(page);
  expect(
    await notice.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const words = el
        .querySelector('[data-testid="failed-workflow-what"]')!
        .getBoundingClientRect();
      const control = el
        .querySelector('[data-testid="failed-workflow-retry"]')!
        .getBoundingClientRect();
      return {
        under: control.top >= words.bottom - 1,
        inside:
          control.left >= box.left - 1 &&
          control.right <= box.right + 1 &&
          words.right <= box.right + 1,
        clipped: el.scrollWidth > el.clientWidth + 1,
      };
    }),
  ).toEqual({ under: true, inside: true, clipped: false });
  await setRail(page, true);
  await settleLayout(page);

  await retry.click();

  // The Captain's decision precedes its action, so the run is still
  // parked while that turn runs — and the control refuses a second
  // press for as long as it does.
  await expect(retry).toBeDisabled();
  // Nothing is hidden: the request stands in the thread in the Boss's
  // own words, exactly as sent.
  await expect(
    captain.getByTestId("boss-bubble").filter({ hasText: RECOVERY_REQUEST }),
  ).toHaveCount(1);

  // The run leaves `failed`: the way back is no longer owed.
  await expect(notice).toHaveCount(0);
  await expect(captain).toContainText("/code recovery started");
  await expect(page.getByTestId("boss-composer")).toBeEnabled();
});

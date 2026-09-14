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
    "Retry runs the workflow's own recovery. Drop ends the run.",
  );
  await expect(notice).toHaveAttribute("title", "state: failed");

  // The turn settled and left the notice standing, so the way out is
  // there when the reader comes back to it.
  const drop = page.getByTestId("failed-workflow-drop");
  await expect(drop).toBeEnabled();
  await expect(page.getByTestId("boss-composer")).toBeEnabled();

  // The chip beside the thread says what the notice says (run-view-59,
  // DR-061): the Captain shell's own controller reported its rest
  // state last, on the very topic the leaf used, so only the run's
  // frames can still answer for the run.
  const chip = page.getByTestId("state-chip");
  await expect(chip).toHaveText("needs attention");
  await expect(chip).toHaveClass(/red/);
  await expect(chip).toHaveAttribute("title", "state: failed");

  // The busy form never widens the control (DR-041 §2). The reserved
  // width is a layout fact, so it is measured here against the real
  // fonts and rules rather than inferred from a class name: the busy
  // word is put in the control's own box and the box is measured.
  const widths = await drop.evaluate((el) => {
    const rest = el.getBoundingClientRect().width;
    // A copy carries the busy word, so the control the reader is
    // about to press is never touched.
    const probe = el.cloneNode(true) as HTMLElement;
    probe.textContent = "Dropping…";
    el.parentElement!.append(probe);
    const busy = probe.getBoundingClientRect().width;
    probe.remove();
    return { rest, busy };
  });
  expect(widths.busy).toBeLessThanOrEqual(widths.rest + 0.5);

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
      // run-view-132: BOTH controls are measured. A pair where only one
      // is checked leaves the other free to stray out of the box.
      const controls = [...el.querySelectorAll("button")].map((b) =>
        b.getBoundingClientRect(),
      );
      if (controls.length === 0) throw new Error("the notice drew no control");
      return {
        under: controls.every((c) => c.top >= words.bottom - 1),
        inside: controls.every(
          (c) =>
            c.left >= box.left - 1 &&
            c.right <= box.right + 1 &&
            words.right <= box.right + 1,
        ),
        clipped: el.scrollWidth > el.clientWidth + 1,
      };
    }),
  ).toEqual({ under: true, inside: true, clipped: false });
  // The yield is a yield, not an overflow: the page itself still does
  // not scroll sideways at the floor (DR-041).
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await setRail(page, true);
  await settleLayout(page);

  // Activating a control the opened run cannot satisfy refuses with its
  // cause and costs neither the transcript nor the draft (run-view-130).
  // The harness opens a continued session with a fresh shell, so no
  // engagement is restored for it to advertise against — the successful
  // round trips are covered by the fixture stream (run-view-131) and by
  // the unit suite.
  await drop.click();
  await page.getByTestId("failed-workflow-drop-confirm").click();
  await expect(page.getByTestId("failed-workflow-error")).toContainText(
    "no way to end its run",
  );
  await expect(notice).toBeVisible();
  await expect(captain).toContainText("workflow failed; awaiting Boss recovery.");
  await expect(page.getByTestId("boss-composer")).toBeEnabled();

  // The confirm is a guardrail, not a formality: Keep backs out having
  // sent nothing (DR-010 §4).
  await page.getByTestId("failed-workflow-drop").click();
  await expect(page.getByTestId("failed-workflow-confirm-ask")).toBeVisible();
  await page.getByTestId("failed-workflow-drop-keep").click();
  await expect(page.getByTestId("failed-workflow-confirm-ask")).toHaveCount(0);
  await expect(notice).toBeVisible();
});

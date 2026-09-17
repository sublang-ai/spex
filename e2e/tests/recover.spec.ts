// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The failed-workflow round trip (run-view-132, DR-062, DR-075): a
// workflow parked in its recoverable failure state used to offer
// nothing but prose in the composer. The notice now draws one control
// per action the session summary publishes for that run, plus Drop,
// and none asks a model to read prose. The served harness's shell
// advertises nothing and restores no engagement on a continued
// session, so this lane's parked run publishes no controls: what it
// proves is the Drop-alone fallback — the notice appearing and
// standing through settlement, naming the composer as the way on,
// refusing an ending the opened run cannot satisfy with its cause and
// leaving the page intact, backing out of Drop's confirm having sent
// nothing, and no control's busy form widening it at 320 pixels. The
// published-controls path is the fixture stream's to prove
// (run-view-131).

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

test("run-view-132: the failed workflow's notice stands, refuses with its cause, and fits at 320px", async ({
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
  // No action is published for this run, so none is drawn and the
  // notice names the door that does work (run-view-128, DR-075).
  await expect(page.getByTestId("failed-workflow-action")).toHaveCount(0);
  await expect(notice).toContainText(
    "Send a message to pick it up, or drop the run",
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
  // Every control the notice draws is weighed, not just the one this
  // journey presses: a reserve that holds one busy word and not
  // another is the reflow DR-041 forbids, and it differs by platform
  // font.
  const widths = await notice.evaluate((el) => {
    const words: Record<string, string> = {
      Drop: "Dropping…",
      Keep: "Keep",
    };
    return [...el.querySelectorAll("button")].map((button) => {
      const rest = button.getBoundingClientRect().width;
      // A copy carries the busy word, so the control the reader is
      // about to press is never touched.
      const probe = button.cloneNode(true) as HTMLElement;
      probe.textContent = words[button.textContent?.trim() ?? ""] ?? "Working…";
      button.parentElement!.append(probe);
      const busy = probe.getBoundingClientRect().width;
      probe.remove();
      return { label: button.textContent?.trim() ?? "", rest, busy };
    });
  });
  expect(widths.length).toBeGreaterThan(0);
  for (const control of widths) {
    expect(
      control.busy,
      `${control.label}: busy ${control.busy} > rest ${control.rest}`,
    ).toBeLessThanOrEqual(control.rest + 0.5);
  }

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

// Every parked run has the same door (run-view-128, DR-073): a run
// waiting for the Boss's answer carries Drop, and no Retry — no
// recovery answers a question. The harness continues a session with no
// engagement restored, so what this lane proves is that the notice
// stands with the right controls beside the composer and that its
// refusal is reported where it was taken.
test("run-view-146: a run parked on a question carries Drop, and the composer answers it", async ({
  page,
  app,
}) => {
  await open(page, app);
  await send(page, "ask before migrating");

  const notice = page.getByTestId("failed-workflow");
  await expect(notice).toBeVisible();
  await expect(notice).toHaveAttribute("data-reason", "question");
  await expect(notice).toContainText(
    "The /code workflow is waiting for your answer.",
  );
  await expect(notice).toContainText("Answer below, or drop the run");
  await expect(notice).toHaveAttribute("title", "state: awaitBossReply");
  // A question advertises no recovery, so nothing offers one.
  await expect(page.getByTestId("failed-workflow-action")).toHaveCount(0);

  // The composer is the other door, and it still names the waiting
  // player (run-view-9).
  const box = page.getByTestId("boss-composer");
  await expect(box).toBeEnabled();
  await expect(box).toHaveAttribute("placeholder", /reply to coder/i);
  await expect(
    notice.evaluate(
      (el, id) =>
        Boolean(
          el.compareDocumentPosition(
            document.querySelector(`[data-testid="${id}"]`)!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      "boss-composer",
    ),
  ).resolves.toBe(true);

  // Drop asks first, and a refused ending is reported with the
  // transcript and the question intact (run-view-130).
  await page.getByTestId("failed-workflow-drop").click();
  await expect(page.getByTestId("failed-workflow-confirm-ask")).toBeVisible();
  await page.getByTestId("failed-workflow-drop-keep").click();
  await expect(page.getByTestId("failed-workflow-confirm-ask")).toHaveCount(0);
  await page.getByTestId("failed-workflow-drop").click();
  await page.getByTestId("failed-workflow-drop-confirm").click();
  await expect(page.getByTestId("failed-workflow-error")).toContainText(
    "no way to end its run",
  );
  await expect(notice).toBeVisible();
  await expect(page.getByTestId("question-bubble")).toBeVisible();

  // Answering leaves the park, and the way out goes with it.
  await box.fill("Yes, migrate them too");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
  await expect(notice).toHaveCount(0);
});

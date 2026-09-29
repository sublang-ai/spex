// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A player question reaches the Boss through the Captain (run-view-151,
// DR-085, DR-088). The real Captain shell runs the real /code root; only
// provider replies are substituted: the coder asks, the hidden judgment
// returns the question as awaiting the Boss, and Playbook's Captain
// relays it in its own words. The runtime's raw question status never
// becomes a message of its own, and the Boss's answer goes to the coder
// that asked, which commits, so the run finishes and the wait clears.
// The answer is sent from the live lane's own question hook, the run
// watched to its finish as the regression watches one (DR-089), so a
// hook that never answers fails here, on every commit.

import { ASKING } from "@sublang/spex-core/testing";

import { test, expect, open, send, awaitCaptainLine } from "../src/harness";

test.use({ appOptions: { project: true, ask: true } });

test("run-view-151: a player question reaches the Boss as the Captain's reply alone", async ({
  page,
  app,
}) => {
  await open(page, app);
  await send(page, ASKING.request);

  const captain = page.getByTestId("captain-pane");
  const question = page.getByTestId("question-bubble");
  const banner = page.getByTestId("boss-reply-banner");
  const coder = page.getByTestId("player-pane-dev.coder");
  let asked = 0;
  await awaitCaptainLine(page, "/code finished", 40_000, 1, {
    pollMs: 250,
    onQuestion: async () => {
      asked += 1;
      // The Captain's relay is the question's one visible wording.
      await expect(question).toHaveCount(1);
      await expect(question).toContainText(ASKING.relay);
      await expect(captain).not.toContainText(ASKING.question);
      // The coder's own words stay in its pane, where it asked them.
      await expect(coder).toContainText(ASKING.question);
      // The wait stands, and the composer invites the answer.
      await expect(banner).toBeVisible();
      const box = page.getByTestId("boss-composer");
      await expect(box).toBeEnabled();
      await expect(box).toHaveAttribute("placeholder", /reply to coder/i);
      await box.fill(ASKING.answer);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(banner).toHaveCount(0, { timeout: 30_000 });
    },
  });
  expect(asked, "the question was answered once").toBe(1);

  // The answer went to the coder that asked; the run finished and the
  // wait cleared, the relay still standing once in the thread.
  await expect(coder).toContainText(ASKING.done);
  // The coder's resumed prompt carries the Boss's own words.
  await expect(coder).toContainText(ASKING.answer);
  await expect(captain).toContainText("The session store migration is done and reviewed.");
  await expect(banner).toHaveCount(0);
  await expect(question).toHaveCount(1);
  await expect(captain).not.toContainText(ASKING.question);
});

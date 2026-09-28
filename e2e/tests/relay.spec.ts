// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A player question reaches the Boss through the Captain (run-view-151,
// DR-085, DR-088). The real Captain shell runs the real /code root; only
// provider replies are substituted: the coder asks, the hidden judgment
// returns the question as awaiting the Boss, and Playbook's Captain
// relays it in its own words. The runtime's raw question status never
// becomes a message of its own, and the Boss's answer goes to the coder
// that asked, which commits, so the run finishes and the wait clears.

import { ASKING } from "@sublang/spex-core/testing";

import { test, expect, open, send } from "../src/harness";

test.use({ appOptions: { project: true, ask: true } });

test("run-view-151: a player question reaches the Boss as the Captain's reply alone", async ({
  page,
  app,
}) => {
  await open(page, app);
  await send(page, ASKING.request);

  // The Captain's relay is the question's one visible wording.
  const captain = page.getByTestId("captain-pane");
  const question = page.getByTestId("question-bubble");
  await expect(question).toHaveCount(1, { timeout: 60_000 });
  await expect(question).toContainText(ASKING.relay);
  await expect(captain).not.toContainText(ASKING.question);
  // The coder's own words stay in its pane, where it asked them.
  await expect(page.getByTestId("player-pane-dev.coder")).toContainText(ASKING.question);

  // The wait stands, and the composer invites the answer.
  await expect(page.getByTestId("boss-reply-banner")).toBeVisible();
  const box = page.getByTestId("boss-composer");
  await expect(box).toBeEnabled();
  await expect(box).toHaveAttribute("placeholder", /reply to coder/i);

  // The answer goes to the coder that asked; the run finishes and the
  // wait clears, the relay still standing once in the thread.
  await box.fill(ASKING.answer);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const coder = page.getByTestId("player-pane-dev.coder");
  await expect(coder).toContainText(ASKING.done, { timeout: 60_000 });
  // The coder's resumed prompt carries the Boss's own words.
  await expect(coder).toContainText(ASKING.answer);
  await expect(captain).toContainText("The session store migration is done and reviewed.", { timeout: 60_000 });
  await expect(page.getByTestId("boss-reply-banner")).toHaveCount(0);
  await expect(question).toHaveCount(1);
  await expect(captain).not.toContainText(ASKING.question);
});

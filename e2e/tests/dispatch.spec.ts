// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Captain dispatches in plain sight (run-view-193, DR-160): the real
// Captain shell runs the built-in /dev on substitute agents that decide
// before they code, and the page says, from the records alone, which
// player runs which step, what each call came back with, and — when the
// Boss stops it — that the run was aborted, not failed.

import { DEVELOP_RUN } from "@sublang/spex-core/testing";

import { test, expect, open, send, surfaceEntry, git } from "../src/harness";

test.describe("the Captain's dispatching", () => {
  test.use({ appOptions: { project: true, develop: { reviewerDelayMs: 7000 }, agentDelayMs: 2500 } });

  test("run-view-193: each call's step, its players, its return and its commit", async ({ page, app }) => {
    test.setTimeout(180_000);
    await open(page, app);
    await surfaceEntry(page, "Workspace").click();
    await send(page, `/dev ${DEVELOP_RUN.request}`);

    // Both proposals at once: two chips, two running steps.
    const coderChip = page.getByTestId("dispatch-chip-dev.coder");
    const reviewerChip = page.getByTestId("dispatch-chip-dev.reviewer");
    await expect(reviewerChip).toContainText("Propose a design", { timeout: 60_000 });
    await expect(coderChip).toContainText("Propose a design");
    const decide = page.locator('[data-playbook="decide"]').first();
    await expect(decide.locator('[data-testid^="machine-performer-"][data-running="true"]')).toHaveCount(2);
    await reviewerChip.click();
    await expect(page.getByTestId("player-pane-dev.reviewer")).toBeInViewport();

    const captain = page.getByTestId("captain-pane");
    await expect(captain).toContainText(DEVELOP_RUN.closing, { timeout: 120_000 });
    await expect(page.getByTestId(/^delegation-line-/)).toHaveCount(7);
    await expect(page.getByTestId(/^return-line-/)).toHaveCount(7);
    const built = page.getByTestId("return-line-dev.coder").last();
    await expect(built.getByTestId("return-head")).toHaveText("← coder committed");
    await expect(built.getByTestId("return-identity")).toHaveText(git(app.projectDir, "rev-parse", "--short=7", "HEAD"));

    const merge = page.getByTestId("player-pane-dev.coder").getByText("decide › Merge the proposals");
    await merge.click();
    await expect(page.locator('[data-call-dispatch][data-flash="1"]')).toContainText("Merge the proposals");
  });
});

test.describe("a Boss stop", () => {
  test.use({ appOptions: { project: true, develop: { hold: "reviewerProposal" }, agentDelayMs: 1500 } });

  test("run-view-193: a run the Boss stopped reads aborted", async ({ page, app }) => {
    test.setTimeout(120_000);
    await open(page, app);
    await surfaceEntry(page, "Workspace").click();
    await send(page, `/dev ${DEVELOP_RUN.request}`);
    // The coder's proposal is back; the reviewer's still runs.
    await expect(page.getByTestId("return-line-dev.coder")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Abort", exact: true }).click();

    const notice = page.getByTestId("failed-workflow");
    await expect(notice).toHaveAttribute("data-aborted", "true", { timeout: 30_000 });
    await expect(page.getByTestId("state-chip")).toHaveText("aborted");
    const decide = page.locator('[data-playbook="decide"]').first();
    await expect(decide.locator('[data-testid^="machine-outcome-"]').first()).toHaveAttribute("data-status", "aborted");
    await expect(page.getByTestId("return-line-dev.reviewer")).toHaveAttribute("data-state", "aborted");
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
  });
});

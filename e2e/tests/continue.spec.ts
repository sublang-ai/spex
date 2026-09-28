// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Sessions continue (DR-042, DR-051, run-view-109): a settled session takes a
// message and runs again on the same id — after its end, and after
// the shell restarted underneath the page — and a session the
// terminal wrote can be deleted from the sidebar. The real Captain
// owns journal and recovery; only provider replies are substituted.

import { existsSync } from "node:fs";
import { join } from "node:path";

import { test, expect, open, nav, send, writeTerminalSession, interruptSession } from "../src/harness";

test.use({ appOptions: { project: true, realCaptain: true } });

test("run-view-109: a message continues a settled session on the current settings, before and after a restart", async ({
  page,
  app,
}) => {
  await open(page, app);
  await send(page, "Fix the token refresh in auth.ts");
  const captain = page.getByTestId("captain-pane");
  const finished = captain.getByText("Acknowledged by the real Captain.", { exact: true });
  await expect(finished).toHaveCount(1);
  const tab = page.getByRole("tab", { name: /fix the token refresh/i });
  await expect(tab).toBeVisible();

  // The turn settled: the runtime is held only for a turn (DR-051), so
  // the composer stands ready with nothing ending and nothing named.
  await expect(page.getByTestId("end-session")).toHaveCount(0);
  await expect(page.getByTestId("history-notice")).toHaveCount(0);
  const box = page.getByTestId("boss-composer");
  await expect(box).toBeEnabled();
  const coder = page.getByTestId("player-pane-dev.coder");
  await expect(coder).toContainText("claude-opus-5");

  // Settings change between turns: the coder's model. The next message
  // opens the runtime on the current settings (core-service-92), and
  // the coder's pane wears the new model.
  await nav(page, "Settings").click();
  await page.getByTestId("player-edit-dev.coder").click();
  const model = page.getByTestId("player-row-dev.coder").getByTestId("agent-model");
  await model.fill("claude-sonnet-5");
  await page.getByTestId("player-row-dev.coder").getByTestId("agent-save").click();
  await expect(page.getByTestId("player-saved-dev.coder")).toHaveText("Saved ✓");
  await nav(page, "Projects").click();
  await expect(box).toBeEnabled();

  // A message continues it on the same tab: working again, narrating.
  await box.fill("Now add the expiry test");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    captain.getByTestId("boss-bubble").filter({ hasText: /expiry test/i }),
  ).toBeVisible();
  await expect(finished).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /fix the token refresh/i })).toHaveCount(1);
  await expect(coder).toContainText("claude-sonnet-5");
  await expect(page.getByTestId("end-session")).toHaveCount(0);

  // The shell restarts underneath the page: the session lists idle
  // and still continues from its persisted snapshot.
  await app.stop();
  await expect(page.getByText(/reconnecting to the spex core/i).first()).toBeVisible();
  await app.start();
  await expect(page.getByText(/reconnecting to the spex core/i)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(box).toBeEnabled();
  await expect(page.getByTestId("history-notice")).toHaveCount(0);
  await box.fill("And document the skew");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    captain.getByTestId("boss-bubble").filter({ hasText: /document the skew/i }),
  ).toBeVisible();
  await expect(finished).toHaveCount(3);
});

test("run-view-109: a session the terminal wrote deletes from the sidebar, its history with it", async ({
  page,
  app,
}) => {
  const id = await writeTerminalSession(app, { prompt: "Triage the flaky test from the terminal" });
  await open(page, app);
  const tree = page.getByRole("tree", { name: "Projects and sessions" });
  const row = page.getByTestId(`sidebar-session-${id}`);
  await expect(row).toBeVisible();
  await expect(row).toContainText(/triage the flaky test/i);

  // The row's delete control, then the confirm worded for a terminal
  // session; Delete removes the files from the shared store.
  await row.hover();
  await page.getByTestId(`sidebar-delete-${id}`).click();
  const confirm = page.getByTestId(`sidebar-delete-confirm-${id}`);
  await expect(confirm).toContainText(
    "Delete this session and its transcript?",
  );
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(tree).not.toContainText(/triage the flaky test/i);
  await expect
    .poll(() => existsSync(join(app.sharedSessionsDir, `${id}.json`)))
    .toBe(false);
  expect(existsSync(join(app.sharedSessionsDir, `${id}.records.jsonl`))).toBe(false);
});


test("run-view-111: Restore reports interrupted work without repeating it, and Discard stands only where nothing was recorded", async ({ page, app }) => {
  const session = await app.core.command("session.create", { projectId: app.projectId! });
  await app.core.command("session.dispose", { sessionId: session.id });
  await interruptSession(app, session.id, "Restore this saved request");
  await open(page, app);
  await page.getByTestId(`sidebar-session-${session.id}`).click();
  const recovery = page.getByRole("region", { name: "Interrupted turn" });
  await expect(recovery).toContainText("Restore this saved request");
  await page.getByTestId("boss-composer").fill("Keep my draft");
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();

  // Nothing was recorded, so both acts stand; Discard asks first, and
  // the keyboard backs out of it.
  await recovery.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(recovery).toContainText("Discard the unprocessed message?");
  await expect(recovery.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(recovery).not.toContainText("Discard the unprocessed message?");

  // Restore acts at once and reports through the Captain; nothing runs
  // again, so no agent answers (DR-088).
  const restore = recovery.getByRole("button", { name: "Restore", exact: true });
  await expect(restore).toHaveAttribute("title", "Nothing is repeated");
  await restore.click();
  await expect(recovery).toBeHidden();
  const captain = page.getByTestId("captain-pane");
  await expect(captain.getByTestId("boss-bubble").filter({ hasText: "Restore this saved request" })).toHaveCount(1);
  await expect(captain).toContainText("The last message was not processed");
  await expect(captain.getByText("Acknowledged by the real Captain.", { exact: true })).toHaveCount(0);
  // The report settled and released the runtime (DR-051).
  await expect(page.getByTestId("end-session")).toHaveCount(0);
  await expect(send).toBeEnabled();

  // A step's start was saved before the writer stopped: that is recorded
  // work, so Restore stands alone and nothing explains Discard's absence.
  await interruptSession(app, session.id, "Restore this recorded step", { recorded: true });
  await expect(recovery).toContainText("Restore this recorded step");
  await expect(recovery.getByRole("button")).toHaveText(["Restore"]);
  await expect(recovery).not.toContainText(/discard/i);
  await recovery.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(recovery).toBeHidden();
  await expect(captain).toContainText("The exact stopping point was not saved");
  await expect(captain.getByText("Acknowledged by the real Captain.", { exact: true })).toHaveCount(0);

  await interruptSession(app, session.id, "Discard this unexecuted request");
  await expect(recovery).toContainText("Discard this unexecuted request");
  await recovery.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(recovery).toContainText("Discard the unprocessed message?");
  await recovery.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(recovery).toBeHidden();
  await expect(page.getByTestId("history-notice")).toHaveCount(0);
  await expect(captain.getByTestId("boss-bubble")).toHaveCount(2);
  await expect(captain).not.toContainText("Discard this unexecuted request");
  await expect(page.getByTestId("abort-button")).toHaveCount(0);
  await expect(page.getByTestId("working-indicator")).toHaveCount(0);
  await page.getByTestId("boss-composer").fill("Continue after discarding");
  await send.click();
  await expect(captain.getByTestId("boss-bubble").filter({ hasText: "Continue after discarding" })).toHaveCount(1);
  await expect(captain.getByText("Acknowledged by the real Captain.", { exact: true })).toHaveCount(1);
  await expect(page.getByTestId("queue-indicator")).toHaveCount(0);
});

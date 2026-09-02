// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Sessions continue (DR-042, run-view-105): an ended session takes a
// message and runs again on the same id — after its end, and after
// the shell restarted underneath the page — and a session the
// terminal wrote can be deleted from the sidebar. The scripted
// Captain carries no state, so this journey proves the page, the
// protocol, the runtime rebuild, and the stream; the real shell's
// snapshot restore is proven in the core's own integration suite.

import { existsSync } from "node:fs";
import { join } from "node:path";

import { test, expect, open, send, writeTerminalSession } from "../src/harness";

test.use({ appOptions: { project: true, agentDelayMs: 300 } });

test("run-view-105: a message continues an ended session, before and after a restart", async ({
  page,
  app,
}) => {
  await open(page, app);
  await send(page, "Fix the token refresh in auth.ts");
  const captain = page.getByTestId("captain-pane");
  const finished = captain.getByText("/code finished");
  await expect(finished).toHaveCount(1);
  const tab = page.getByRole("tab", { name: /fix the token refresh/i });
  await expect(tab).toBeVisible();

  // Ending pauses the conversation: the composer stays, saying so.
  await page.getByTestId("end-session").click();
  await page.getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByText(/a message continues it/i)).toBeVisible();
  const box = page.getByTestId("boss-composer");
  await expect(box).toBeEnabled();

  // A message continues it on the same tab: live again, narrating.
  await box.fill("Now add the expiry test");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    captain.getByTestId("boss-bubble").filter({ hasText: /expiry test/i }),
  ).toBeVisible();
  await expect(page.getByTestId("end-session")).toBeVisible();
  await expect(finished).toHaveCount(2);
  await expect(page.getByRole("tab", { name: /fix the token refresh/i })).toHaveCount(1);

  // The shell restarts underneath the page: the session lists ended
  // and still continues from its persisted snapshot.
  await app.stop();
  await expect(page.getByText(/reconnecting to the spex core/i).first()).toBeVisible();
  await app.start();
  await expect(page.getByText(/reconnecting to the spex core/i)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText(/a message continues it/i)).toBeVisible();
  await box.fill("And document the skew");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    captain.getByTestId("boss-bubble").filter({ hasText: /document the skew/i }),
  ).toBeVisible();
  await expect(finished).toHaveCount(3);
  await expect(page.getByTestId("end-session")).toBeVisible();
});

test("run-view-105: a session the terminal wrote deletes from the sidebar, its history with it", async ({
  page,
  app,
}) => {
  const id = writeTerminalSession(app, { prompt: "Triage the flaky test from the terminal" });
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
    "Delete this session? It was run from the terminal; its history goes too.",
  );
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(tree).not.toContainText(/triage the flaky test/i);
  await expect
    .poll(() => existsSync(join(app.sharedSessionsDir, `${id}.json`)))
    .toBe(false);
  expect(existsSync(join(app.sharedSessionsDir, `${id}.records.jsonl`))).toBe(false);
});

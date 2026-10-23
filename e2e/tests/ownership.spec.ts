// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Execution ownership as a user meets it (DR-134): a session and an
// intent the core's own runtime made, read first where they run and
// then by another runtime pairing the same folder at the same path —
// the same state root restarted under another `device` in `home.yaml`
// (storage-2), as a sync leaves the records on a second home. There the
// queue row reads where it runs with no Start and its provenance alone,
// the session reads the phrase with nothing to continue, restore or
// discard, nothing summons, and a turn naming the intent is refused.

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";

import { test, expect, open, interruptSession, surfaceEntry } from "../src/harness";

test.use({ appOptions: { project: true, realCaptain: true } });

test("dashboard-29, dashboard-10, dashboard-54, run-view-33: another runtime's session and intent read where they run, offer no act, and summon nothing", async ({
  page,
  app,
}) => {
  const projectId = app.projectId!;
  // The label a runtime records beside its device: the host name, as
  // no server names this one (DR-134).
  const phrase = `Runs on ${hostname()}`;

  // This runtime captures an intent and works it in a session, then
  // queues a second from that conversation; the session is then cut
  // short mid-turn, so it stands interrupted with its saved input.
  const worked = await app.core.command("intent.queue", { projectId, text: "Ship the parser" });
  const session = await app.core.command("session.create", { projectId });
  await app.core.command("turn.submit", { sessionId: session.id, text: worked.text, intentId: worked.id });
  await app.core.waitFor(
    (m) => m.type === "session.state" && m.session.id === session.id && !m.session.live && m.session.turns > 0,
    30_000,
  );
  const waiting = await app.core.command("intent.queue", {
    projectId,
    text: "Document the parser",
    source: { kind: "chat", ref: session.id },
  });
  await interruptSession(app, session.id, "Keep going on the parser");

  // Where they run, they are this runtime's: the finished intent
  // summons a verdict, the queue row offers every act, and the session
  // offers Restore.
  await open(page, app);
  // The rail's entry by what it is: its name carries the badge's count.
  const dashboard = surfaceEntry(page, "Dashboard");
  await dashboard.click();
  await expect(page.getByTestId("nav-attention-badge")).toHaveText("1");
  await expect(page.locator('[data-band="finished"]').filter({ hasText: "Ship the parser" })).toBeVisible();
  const row = page.getByTestId(`upnext-row-${waiting.id}`);
  await expect(row).toBeVisible();
  await expect(row).not.toContainText(phrase);
  const menu = page.getByRole("menu", { name: "Actions for Document the parser" });
  await page.getByTestId(`upnext-menu-${waiting.id}`).click();
  await expect(menu.getByRole("menuitem")).toHaveText(["Start", "Edit", "Remove", "Session"]);
  await page.keyboard.press("Escape");
  await page.getByTestId(`sidebar-session-${session.id}`).click();
  const recovery = page.getByRole("region", { name: "Interrupted turn" });
  await expect(recovery).toContainText("Keep going on the parser");
  await expect(recovery.getByRole("button", { name: "Restore", exact: true })).toBeVisible();

  // The reader stages the queued intent from its row's menu: no
  // conversation continues here, so it waits in the Captain home.
  await dashboard.click();
  await page.getByTestId(`upnext-menu-${waiting.id}`).click();
  await menu.getByRole("menuitem", { name: "Start" }).click();
  await expect(page.getByTestId("start-composer")).toHaveValue("Document the parser");
  await expect(page.getByTestId("staged-intent-chip")).toBeVisible();

  // The same records now stand on another runtime: the core restarts
  // under the page with another device in home.yaml.
  await app.stop();
  await expect(page.getByText(/reconnecting to the spex core/i).first()).toBeVisible();
  const homeFile = join(app.dataDir, "home.yaml");
  writeFileSync(homeFile, stringify({ ...(parse(readFileSync(homeFile, "utf8")) as object), device: randomUUID() }));
  await app.start();
  await expect(page.getByText(/reconnecting to the spex core/i)).toHaveCount(0, { timeout: 15_000 });

  // A turn naming the intent is refused with the phrase, and nothing
  // runs: the staged send opens a session of this runtime's own and
  // the core refuses the dispatch (core-service-47).
  await page.getByTestId("start-send").click();
  await expect(page.getByTestId("run-error")).toContainText(phrase);
  await expect(page.getByTestId("captain-pane")).not.toContainText("Acknowledged by the real Captain.");

  // Nothing of theirs summons here: no attention entry, no badge
  // (dashboard-10, dashboard-54).
  await dashboard.click();
  await expect(page.getByTestId("attention-all-clear")).toBeVisible();
  await expect(page.locator("[data-band]")).toHaveCount(0);
  await expect(page.getByTestId("nav-attention-badge")).toHaveCount(0);
  await expect(page.getByTestId("running-empty")).toBeVisible();

  // The queue row keeps its Queued tag and its place, reads where it
  // runs in the standing's place, carries no Start, and its menu offers
  // its provenance alone (dashboard-29).
  await expect(row.getByTestId(`upnext-queued-${waiting.id}`)).toHaveText("Queued");
  await expect(row.getByTestId(`upnext-standing-${waiting.id}`)).toHaveText(phrase);
  await expect(row.getByTestId(`upnext-standing-${waiting.id}`)).toHaveAttribute("title", phrase);
  await expect(row.getByTestId(`upnext-start-${waiting.id}`)).toHaveCount(0);
  await expect(row).not.toHaveAttribute("data-next", /./);
  await page.getByTestId(`upnext-menu-${waiting.id}`).click();
  await expect(menu.getByRole("menuitem")).toHaveText(["Session"]);

  // The provenance opens the session, which reads the phrase as the
  // core's reason and offers nothing to continue, restore or discard
  // (run-view-33).
  await menu.getByRole("menuitem", { name: "Session" }).click();
  const notice = page.getByTestId("history-notice");
  await expect(notice).toContainText(phrase);
  await expect(recovery).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Restore", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Discard", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("boss-composer")).toHaveCount(0);
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's journeys (DR-057): first-time setup against a
// bare remote (space-40), the daily sync with conflicts chosen by
// keyboard, a remote that moves under the push, and Stop against a
// sleeping transport (space-41), the explorer with its privacy panel
// and Copy path (space-42), fit at every width in both sidebar states
// (space-43), and axe in both themes (space-44). Every remote is a
// bare repository in the scratch root and every transport a local
// path or a sleeping script: hermetic, no network, no credentials.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedDemoProject } from "@sublang/spex-core/testing";

import {
  LOCAL_MODEL,
  LOCAL_TURN,
  PEER_TURN,
  SESSION_TITLE,
  expect,
  git,
  nav,
  open,
  runTurn,
  send,
  test,
  type App,
} from "../src/harness";
import {
  HEIGHTS,
  OPEN_RAIL_MIN_WIDTH,
  TALL,
  WIDTHS,
  compareNames,
  measure,
  record,
  setRail,
} from "../src/fit";

/** Git's own words never lead on the surface (space-27). */
const GIT_WORDS = /\b(ours|theirs|HEAD|MERGE_HEAD)\b|origin\/main/;

/** Note any Git word in the surface's visible text. */
async function scanVocabulary(page: Page, where: string, found: string[]): Promise<void> {
  const text = await page.getByTestId("space-surface").innerText();
  const hit = GIT_WORDS.exec(text);
  if (hit) found.push(`${where}: "${hit[0]}" in "${text.slice(Math.max(0, hit.index - 40), hit.index + 40)}"`);
}

/**
 * Record every text an element reads while the journey acts — a busy
 * label or a step line changes faster than an assertion can follow —
 * and return a reader of the sequence (consecutive repeats folded).
 */
async function watch(page: Page, selector: string): Promise<() => Promise<string[]>> {
  await page.evaluate((sel) => {
    const bag = ((window as unknown as { __seen?: Record<string, string[]> }).__seen ??= {});
    const list: string[] = (bag[sel] = []);
    const note = () => {
      const el = document.querySelector(sel);
      const text = el ? (el.textContent ?? "").trim() : "";
      if (text && list[list.length - 1] !== text) list.push(text);
    };
    note();
    new MutationObserver(note).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, selector);
  return () =>
    page.evaluate(
      (sel) => (window as unknown as { __seen: Record<string, string[]> }).__seen[sel],
      selector,
    );
}

/** Open the Space surface from the sidebar. */
async function showSpace(page: Page): Promise<void> {
  await nav(page, "Space").click();
  await expect(page.getByTestId("space-surface")).toBeVisible();
  await expect(page.getByTestId("space-header")).toBeVisible();
}

/** The step lines in their order (space-12). */
const STEP_LINES = [
  "Saving changes…",
  "Checking remote…",
  "Comparing…",
  "Applying…",
  "Refreshing…",
  "Pushing…",
];

/** Whether `seen` names steps in the rail's order, skipping none twice. */
function inStepOrder(seen: string[]): boolean {
  let last = -1;
  for (const line of seen) {
    const index = STEP_LINES.indexOf(line);
    if (index <= last) return false;
    last = index;
  }
  return true;
}

// ---------------------------------------------------------------------------
// space-40: the first-time setup
// ---------------------------------------------------------------------------

test.describe("first-time setup", () => {
  test.use({ appOptions: { project: true, remote: "bare" } });

  test("space-40: Initialize, the remote, the first sync, and a session sent", async ({
    page,
    app,
  }) => {
    test.setTimeout(120_000);
    await open(page, app);
    await showSpace(page);
    const header = page.getByTestId("space-header");

    // Not a repository yet: Initialize and Join a space, the config
    // inside the home so nothing reads "outside the space" (space-3).
    await expect(header.getByTestId("space-repository")).toContainText("Not a repository yet");
    const setup = page.getByTestId("space-setup");
    await expect(setup.getByTestId("space-initialize")).toHaveText("Initialize");
    await expect(setup.getByTestId("space-join-space")).toHaveText("Join a space");
    await expect(setup).toContainText("Sessions, queues, projects, Settings and playbook sources sync.");
    await expect(header.getByTestId("space-outside-config")).toHaveCount(0);
    await expect(page.getByTestId("space-local-list")).toHaveCount(0);

    // Initialize reads "Initializing…" in flight, then the header
    // reads main, "No remote" and "Never synced" (space-4).
    const initLabels = await watch(page, '[data-testid="space-initialize"]');
    await setup.getByTestId("space-initialize").click();
    await expect(header.getByTestId("space-repository")).toContainText("main");
    await expect(header.getByTestId("space-remote")).toContainText("No remote");
    await expect(header.getByTestId("space-last-sync")).toContainText("Never synced");
    expect(await initLabels()).toEqual(["Initialize", "Initializing…"]);
    await expect(header.getByTestId("space-primary")).toHaveText("Sync");
    await expect(header.getByTestId("space-primary")).toBeDisabled();
    await expect(header.getByTestId("space-primary-caption")).toHaveText("Add a remote first");
    await expect(page.getByTestId("space-sync-tab")).toContainText("Nothing to send from this device");

    // Add remote, the bare path, Save: the remote field follows the
    // save and Sync is admitted (space-5).
    await expect(header.getByTestId("space-remote-edit")).toHaveText("Add remote");
    await header.getByTestId("space-remote-edit").click();
    await header.getByTestId("space-remote-input").fill(app.remotePath!);
    await header.getByTestId("space-remote-editor").getByRole("button", { name: "Save", exact: true }).click();
    await expect(header.getByTestId("space-remote-url")).toHaveText(app.remotePath!);
    await expect(header.getByTestId("space-remote-edit")).toHaveText("Change remote");
    await expect(header.getByTestId("space-primary")).toBeEnabled();
    await expect(header.getByTestId("space-primary-caption")).toHaveCount(0);

    // Sync reads "Syncing…" and the step line names each step it
    // passes; the empty remote takes the initial commit whole and
    // the line counts what was sent (space-12).
    const primaryLabels = await watch(page, '[data-testid="space-primary"]');
    const stepLines = await watch(page, '[data-testid="space-step-line"]');
    await header.getByTestId("space-primary").click();
    const done = page.getByTestId("space-done-line");
    await expect(done).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    const labels = await primaryLabels();
    expect(labels[0]).toBe("Sync");
    expect(labels, labels.join(" → ")).toContain("Syncing…");
    expect(labels.at(-1)).toBe("Sync");
    const steps = await stepLines();
    expect(steps, steps.join(" → ")).toContain("Checking remote…");
    expect(steps, steps.join(" → ")).toContain("Pushing…");
    expect(inStepOrder(steps), steps.join(" → ")).toBe(true);
    await expect(header.getByTestId("space-last-sync")).toHaveText(/^Synced just now$/);
    await expect(header.getByTestId("space-last-sync")).toHaveAttribute("title", /\d/);
    expect(git(app.remotePath!, "rev-parse", "main")).toBe(git(app.dataDir, "rev-parse", "main"));

    // Nothing moved on the second sync: the line ends "Everything is
    // in sync" with the sync time in the header (space-12).
    await header.getByTestId("space-primary").click();
    await expect(page.getByTestId("space-primary")).toHaveText("Syncing…");
    await expect(done).toHaveText("Everything is in sync");
    await expect(header.getByTestId("space-last-sync")).toHaveText(/^Synced just now$/);

    // A session run from the Captain home lists under local changes
    // by its title and project; Open session opens its tab; Sync
    // sends it, the bare main holding both bundle files (space-7).
    await nav(page, "Projects").click();
    await expect(page.getByTestId("captain-home")).toContainText("demo-project");
    await send(page, "Fix the token refresh in auth.ts");
    await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
    await showSpace(page);
    const row = page.getByTestId("space-local-list").locator('[data-testid^="space-unit-mine-sessions/"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Fix the token refresh in auth.ts");
    await expect(row).toContainText("demo-project");
    await expect(row).toHaveAttribute("data-change", "new");
    await expect(header.getByTestId("space-local-count")).toHaveAccessibleName("1 local change");
    const sessionId = (await row.getAttribute("data-testid"))!.replace("space-unit-mine-sessions/", "");
    await row.getByRole("button", { name: "Open session" }).click();
    await expect(page.getByRole("tab", { name: /fix the token refresh/i })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText("Fix the token refresh in auth.ts");
    await showSpace(page);
    await header.getByTestId("space-primary").click();
    await expect(done).toHaveText(/^Synced just now · 1 sent · 0 received$/);
    await expect(page.getByTestId("space-sync-tab")).toContainText("Nothing to send from this device");
    const tracked = git(app.remotePath!, "ls-tree", "-r", "--name-only", "main").split("\n");
    expect(tracked).toContain(`sessions/${sessionId}.json`);
    expect(tracked).toContain(`sessions/${sessionId}.records.jsonl`);
    expect(tracked.some((path) => path.endsWith(".hints.json") || path.startsWith("local/") || path === "prefs.json")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// space-41: the daily sync with conflicts
// ---------------------------------------------------------------------------

test.describe("daily sync", () => {
  test.use({ appOptions: { project: true, remote: "peer" } });

  test("space-41: Check remote, choices by keyboard, the confirm, a remote that moved, and Stop", async ({
    page,
    app,
  }) => {
    test.setTimeout(180_000);
    const sessionUnit = `sessions/${app.sessionId}`;
    const settingsUnit = "playbook/playbook.config.yaml";
    const queueUnit = `intents/${app.projectId}.jsonl`;
    const words: string[] = [];
    await open(page, app);
    await showSpace(page);
    const header = page.getByTestId("space-header");
    const tab = page.getByTestId("space-sync-tab");

    // Check remote lists the peer's session and Settings as incoming,
    // the conflicts marked, and the header reads behind (space-8).
    await expect(tab.getByTestId("space-check")).toHaveText("Check remote");
    await tab.getByTestId("space-check").click();
    const incoming = tab.getByTestId("space-incoming-list");
    const incomingSession = incoming.getByTestId(`space-unit-remote-${sessionUnit}`);
    await expect(incomingSession).toContainText(SESSION_TITLE);
    await expect(incomingSession).toContainText("demo-project");
    await expect(incomingSession).toHaveAttribute("data-change", "updated");
    await expect(incomingSession.getByTestId(`space-choose-${sessionUnit}`)).toContainText("choose");
    const incomingSettings = incoming.getByTestId(`space-unit-remote-${settingsUnit}`);
    await expect(incomingSettings).toContainText("Settings changed");
    await expect(incomingSettings.getByTestId(`space-choose-${settingsUnit}`)).toContainText("choose");
    await expect(incoming.getByTestId(`space-unit-remote-${queueUnit}`)).toContainText(
      "1 change in demo-project's queue",
    );
    await expect(header.getByTestId("space-ahead-behind")).toContainText(/0 ahead/);
    await expect(header.getByTestId("space-ahead-behind")).toContainText(/1 behind/);
    // A unit the remote changed too is a choice, not a local unit
    // (space-7): the local list and its count leave both out.
    await expect(header.getByTestId("space-local-count")).toHaveAccessibleName("0 local changes");
    await expect(tab.locator('[data-testid^="space-unit-mine-"]')).toHaveCount(0);
    await scanVocabulary(page, "after the check", words);

    // A draft typed in the session before the apply must survive the
    // history the sync replaces (run-view-124).
    await page
      .getByRole("tree", { name: "Projects and sessions" })
      .getByRole("treeitem", { name: new RegExp(SESSION_TITLE, "i") })
      .click();
    const sessionTab = page.getByRole("tab", { name: new RegExp(SESSION_TITLE, "i") });
    await expect(sessionTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText(LOCAL_TURN);
    const draft = "Draft kept across the sync";
    await page.getByTestId("boss-composer").fill(draft);
    await showSpace(page);

    // Sync ends "Needs your choice" with Apply disabled reading
    // "0 of 2 chosen" (space-9, space-14, space-17).
    await header.getByTestId("space-primary").click();
    const note = tab.getByTestId("space-choices-note");
    await expect(note.getByTestId("space-step-line")).toHaveText("Needs your choice");
    await expect(note).toContainText("Your changes are saved; nothing is pushed yet");
    const picker = tab.getByTestId("space-picker");
    await expect(picker).toContainText("Choose for 2 conflicts");
    await expect(picker.getByTestId("space-chosen")).toHaveText("0 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeDisabled();
    await expect(picker.getByRole("radio", { checked: true })).toHaveCount(0);
    await scanVocabulary(page, "needs your choice", words);

    // "Take remote" for the session and "Keep mine" for Settings, by
    // keyboard: each row is a radio group named by the unit's label,
    // arrow keys moving within it (space-17).
    const sessionGroup = picker.getByRole("radiogroup", { name: SESSION_TITLE });
    const settingsGroup = picker.getByRole("radiogroup", { name: "Settings changed" });
    await expect(sessionGroup).toContainText(/Keep mine\s+updated/);
    await expect(sessionGroup).toContainText(/Take remote\s+updated/);
    await expect(sessionGroup).toContainText("2 turns");
    await sessionGroup.getByRole("radio", { name: /Keep mine/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(sessionGroup.getByRole("radio", { name: /Take remote/ })).toBeChecked();
    await expect(sessionGroup.getByRole("radio", { name: /Take remote/ })).toBeFocused();
    await expect(picker.getByTestId("space-chosen")).toHaveText("1 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeDisabled();
    await settingsGroup.getByRole("radio", { name: /Take remote/ }).focus();
    await page.keyboard.press("ArrowUp");
    await expect(settingsGroup.getByRole("radio", { name: /Keep mine/ })).toBeChecked();
    await expect(picker.getByTestId("space-chosen")).toHaveText("2 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeEnabled();
    // Settings carries a diff per side (space-10).
    await settingsGroup.getByRole("button", { name: "View diff" }).last().click();
    const diff = picker.getByTestId(`space-diff-remote-${settingsUnit}`);
    await expect(diff).toContainText("The remote against the common ancestor");
    await expect(diff).toContainText(/^\+.*claude-opus-5-peer/m);
    await settingsGroup.getByRole("button", { name: "Hide diff" }).click();
    await expect(diff).toHaveCount(0);

    // Apply's confirm names one replaced unit with Cancel focused;
    // Escape keeps the choices; confirming ends synced (space-18).
    await picker.getByTestId("space-apply").click();
    const confirm = picker.getByTestId("space-apply-confirm");
    await expect(confirm).toContainText("Replace 1 unit with the remote's version?");
    await expect(confirm).toContainText("The other version stays in Git history");
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(picker.getByTestId("space-chosen")).toHaveText("2 of 2 chosen");
    await expect(sessionGroup.getByRole("radio", { name: /Take remote/ })).toBeChecked();
    await expect(settingsGroup.getByRole("radio", { name: /Keep mine/ })).toBeChecked();
    await picker.getByTestId("space-apply").click();
    await confirm.getByRole("button", { name: "Apply" }).click();
    const done = tab.getByTestId("space-done-line");
    await expect(done).toHaveText(/^Synced just now · 1 sent · 2 received$/);
    await expect(tab.getByTestId("space-picker")).toHaveCount(0);
    await expect(header.getByTestId("space-ahead-behind")).toContainText(/0 ahead/);
    await expect(header.getByTestId("space-ahead-behind")).toContainText(/0 behind/);
    await scanVocabulary(page, "synced", words);
    expect(git(app.remotePath!, "rev-parse", "main")).toBe(git(app.dataDir, "rev-parse", "main"));

    // The session's tab shows the remote's turns; Settings shows this
    // device's configuration (space-20).
    await nav(page, "Projects").click();
    await expect(sessionTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText(PEER_TURN);
    await expect(page.getByTestId("captain-pane")).not.toContainText(LOCAL_TURN);
    await expect(page.getByTestId("boss-composer")).toHaveValue(draft);
    await nav(page, "Settings").click();
    await expect(page.getByTestId("captain-section").getByTestId("agent-chip")).toContainText(LOCAL_MODEL);
    expect(readFileSync(app.configPath, "utf8")).toContain(`model: ${LOCAL_MODEL}`);

    // The peer's main moves under the push: one automatic re-check,
    // then "changed again" with the ahead count in the header; a
    // second Sync pushes (space-15).
    await showSpace(page);
    // Something to send — an intent queued meanwhile, the arrange
    // client standing in for the Boss — so the push runs and meets the
    // moved remote; a home level with the remote has nothing to push.
    await app.core.command("intent.queue", { projectId: app.projectId!, text: "Queued after the merge" });
    await expect(header.getByTestId("space-local-count")).toHaveAccessibleName("1 local change");
    app.rejectPushes(2);
    await header.getByTestId("space-primary").click();
    const stopped = tab.getByTestId("space-stopped");
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Push stopped — The remote changed again");
    await expect(stopped).toContainText(/Your changes are saved locally \([1-9]\d* commits? ahead\)/);
    await expect(stopped.getByTestId("space-retry")).toBeVisible();
    await expect(header.getByTestId("space-ahead-behind")).toContainText(/[1-9]\d* ahead/);
    await expect(header.getByTestId("space-status-dot")).toHaveAttribute("data-tone", "attention");
    await scanVocabulary(page, "changed again", words);
    await header.getByTestId("space-primary").click();
    await expect(done).toHaveText(/^Synced just now · 1 sent · 1 received$/);
    await expect(tab.getByTestId("space-stopped")).toHaveCount(0);
    expect(git(app.remotePath!, "rev-parse", "main")).toBe(git(app.dataDir, "rev-parse", "main"));
    expect(git(app.remotePath!, "ls-tree", "-r", "--name-only", "main").split("\n")).toContain("peer-note-2.txt");

    // Stop during a check against a sleeping transport ends the check
    // with its stopped state and Retry (space-16).
    await header.getByTestId("space-remote-edit").click();
    await header.getByTestId("space-remote-input").fill(app.sleepingRemote());
    await header.getByTestId("space-remote-editor").getByRole("button", { name: "Save", exact: true }).click();
    await expect(header.getByTestId("space-remote-url")).toHaveText("ssh://sleepy.invalid/space.git");
    await expect(header.getByTestId("space-ahead-behind")).toHaveCount(0);
    await tab.getByTestId("space-check").click();
    const rail = tab.getByTestId("space-rail");
    await expect(rail.getByTestId("space-step-line")).toHaveText("Checking remote…");
    await expect(tab.getByTestId("space-check")).toHaveText("Checking…");
    await rail.getByTestId("space-stop").click();
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Check stopped — No answer from sleepy.invalid");
    await expect(stopped).toContainText("Git runs without prompts");
    await expect(stopped.getByTestId("space-retry")).toHaveText("Retry");
    await expect(tab.getByTestId("space-check")).toHaveText("Check remote");
    await expect(header.getByTestId("space-status-dot")).toHaveAttribute("data-tone", "stopped");
    await scanVocabulary(page, "check stopped", words);

    // No visible text on the surface names Git's sides (space-27).
    expect(words, words.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// space-42: exploring
// ---------------------------------------------------------------------------

test.describe("exploring", () => {
  test.use({ appOptions: { project: true, remote: "bare" } });

  test("space-42: the tree, the previews, what stays here, and Copy path", async ({
    page,
    app,
    context,
  }) => {
    test.setTimeout(90_000);
    // A finished session, its hints file, and the repository holding
    // the bundle, so the manifest reads Shared and the hints Stays here.
    const session = await app.core.command("session.create", { projectId: app.projectId! });
    await runTurn(app, session.id, SESSION_TITLE);
    writeFileSync(join(app.dataDir, "sessions", `${session.id}.hints.json`), "{}\n");
    await app.core.command("space.init", {});
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: app.origin });

    await open(page, app);
    await showSpace(page);
    await page.getByTestId("space-tab-explore").click();
    const explore = page.getByTestId("space-explore-tab");
    const tree = explore.getByRole("tree", { name: "Files in the space" });
    await expect(tree).toBeVisible();

    // The session's files group under one node titled by its first
    // turn: the manifest Shared, the hints Stays here (space-23).
    const sessionsDir = tree.getByTestId("space-node-sessions");
    await expect(sessionsDir).toContainText("sessions/");
    await sessionsDir.click();
    const sessionNode = tree.getByTestId(`space-node-session:${session.id}`);
    await expect(sessionNode).toContainText(SESSION_TITLE);
    await expect(sessionNode).toContainText("demo-project");
    await sessionNode.click();
    const manifest = tree.getByTestId(`space-node-sessions/${session.id}.json`);
    const records = tree.getByTestId(`space-node-sessions/${session.id}.records.jsonl`);
    const hints = tree.getByTestId(`space-node-sessions/${session.id}.hints.json`);
    await expect(manifest).toContainText("manifest");
    await expect(manifest).toContainText("Shared");
    await expect(manifest.locator("[data-sync]")).toHaveAttribute("data-sync", "shared");
    await expect(records).toContainText("records");
    await expect(records).toContainText("Shared");
    await expect(hints).toContainText("provider hints");
    await expect(hints).toContainText("Stays here");
    await expect(hints.locator("[data-sync]")).toHaveAttribute("data-sync", "local");
    await expect(tree.getByTestId("space-node-.git")).toContainText("Git data");
    await expect(tree.getByTestId("space-node-.git")).not.toHaveAttribute("aria-expanded", /.*/);

    // The manifest previews as pretty-printed JSON; the records offer
    // Open session; the hints read withheld (space-24).
    const preview = explore.getByTestId("space-preview");
    await manifest.click();
    await expect(preview).toContainText("session manifest");
    await expect(preview.getByTestId("space-preview-owner")).toContainText(`"${SESSION_TITLE}" — demo-project`);
    const json = preview.getByTestId("space-preview-text");
    await expect(json).toContainText('"sessionId"');
    expect((await json.textContent())!.startsWith('{\n  "')).toBe(true);
    await records.click();
    await expect(preview.getByTestId("space-preview-jsonl")).toContainText(/\d+ records/);
    await expect(preview.getByTestId("space-preview-jsonl")).toContainText("reads better as a conversation");
    await expect(preview.getByTestId("space-preview-jsonl").getByRole("button", { name: "Open session" })).toBeVisible();
    await hints.click();
    await expect(preview.getByTestId("space-preview-withheld")).toContainText("May hold provider tokens — not shown");
    await expect(preview.getByTestId("space-preview-text")).toHaveCount(0);
    // The tree is one focus stop; arrow keys move within it.
    await manifest.focus();
    await page.keyboard.press("ArrowDown");
    await expect(records).toBeFocused();
    expect(await tree.locator('[role="treeitem"][tabindex="0"]').count()).toBe(1);

    // "Stays on this device" names the seven families with their
    // reasons (space-25).
    const privacy = explore.getByTestId("space-privacy");
    const toggle = privacy.getByTestId("space-privacy-toggle");
    await expect(toggle).toContainText("Stays on this device (7 kinds)");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    const families: [string, RegExp][] = [
      ["provider hints", /resume tokens for this machine's agent conversations/],
      ["leases and locks", /which process is writing right now/],
      ["local project paths", /where your projects live on this machine/],
      ["preferences", /where you last stopped reading in each session/],
      ["forge cache", /GitHub lists the app fetches again/],
      ["migration receipts and inputs", /original files kept from an upgrade/],
      ["config backups and temporary files", /copies made while writing/],
    ];
    const list = privacy.locator("#space-privacy-list");
    await expect(list.locator("dt")).toHaveCount(7);
    for (const [family, reason] of families) {
      await expect(list.locator("dt", { hasText: family })).toHaveCount(1);
      await expect(list).toContainText(reason);
    }
    // Folded state is chrome preference: it survives a reload.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await showSpace(page);
    await page.getByTestId("space-tab-explore").click();
    await expect(page.getByTestId("space-privacy-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("space-privacy-toggle").click();

    // The served page offers Copy path and no reveal control, and
    // acknowledges the copy in words (space-26).
    const header = page.getByTestId("space-header");
    await expect(header.getByTestId("space-path-reveal")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Show in (Finder|folder)/ })).toHaveCount(0);
    const copy = header.getByTestId("space-path-copy");
    await expect(copy).toHaveText("Copy path");
    await copy.click();
    await expect(copy).toHaveText("Copied");
    await expect(page.getByTestId("space-live")).toHaveText(`Copied ${app.dataDir}`);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(app.dataDir);
    await expect(copy).toHaveText("Copy path");
  });
});

// ---------------------------------------------------------------------------
// space-43: fit
// ---------------------------------------------------------------------------

/** Every unit kind changed locally on top of the peer arrangement, and
 * a sync ended in choices: the surface at its fullest (space-43,
 * space-44). */
async function arrangeChoices(app: App): Promise<void> {
  const projectId = app.projectId!;
  for (const text of ["Add a README badge", "Tighten the expiry tests", "Retire the legacy sessions"]) {
    await app.core.command("intent.queue", { projectId, text });
  }
  const second = join(app.dataDir, "..", "second-project");
  seedDemoProject(second);
  await app.core.command("project.register", { path: second });
  mkdirSync(join(app.dataDir, "playbooks", "demo"), { recursive: true });
  writeFileSync(join(app.dataDir, "playbooks", "demo", "demo.md"), "# Demo\n\nA one-player demo workflow.\n");
  appendFileSync(join(app.dataDir, ".gitignore"), "# authored\n/scratch/\n");
  writeFileSync(join(app.dataDir, "notes.txt"), "a stray note\n");
  const state = await app.settleSpace("space.sync", {});
  if (state.sync.phase !== "choices") {
    throw new Error(`the arranged sync ended ${JSON.stringify(state.sync)}`);
  }
}

test.describe("fit", () => {
  test.use({ appOptions: { project: true, remote: "peer" } });

  test("space-43: the Sync and Explore tabs fit at every width, in both sidebar states", async ({
    page,
    app,
  }) => {
    test.setTimeout(300_000);
    await arrangeChoices(app);
    page.on("pageerror", (error) => console.log(`[space fit] page error: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: TALL });
    await open(page, app);
    await showSpace(page);
    const tab = page.getByTestId("space-sync-tab");
    await expect(tab.getByTestId("space-picker")).toContainText(/Choose for \d+ conflicts/);
    // A diff open in the picker, so the diff canvas is measured too.
    const settingsGroup = tab.getByRole("radiogroup", { name: "Settings changed" });
    await settingsGroup.getByRole("button", { name: "View diff" }).first().click();
    await expect(tab.getByTestId("space-diff-mine-playbook/playbook.config.yaml")).toContainText("This device against");

    const defects: string[] = [];
    const containers = ['[role="radiogroup"]', '[data-testid="space-picker"]', '[data-testid="space-header"]'];
    const views: { name: string; show: () => Promise<void>; ready: () => Promise<void> }[] = [
      {
        name: "Sync",
        show: () => page.getByTestId("space-tab-sync").click(),
        ready: async () => {
          await expect(tab.getByTestId("space-picker")).toBeVisible();
          // The ahead and behind numbers ride the field's accessible
          // name where its words hide (space-28).
          const field = page.getByTestId("space-ahead-behind");
          await expect(field).toHaveText(/\d+ ahead/);
          await expect(field).toHaveText(/\d+ behind/);
        },
      },
      {
        name: "Explore",
        show: async () => {
          await page.getByTestId("space-tab-explore").click();
          const tree = page.getByRole("tree", { name: "Files in the space" });
          await tree.getByTestId("space-node-sessions").click();
          const node = tree.getByTestId(`space-node-session:${app.sessionId}`);
          await node.click();
          await tree.getByTestId(`space-node-sessions/${app.sessionId}.json`).click();
          await expect(page.getByTestId("space-preview-text")).toContainText('"sessionId"');
          const privacy = page.getByTestId("space-privacy-toggle");
          if ((await privacy.getAttribute("aria-expanded")) !== "true") await privacy.click();
        },
        ready: async () => {
          await expect(page.getByRole("tree", { name: "Files in the space" })).toBeVisible();
          await expect(page.getByTestId("space-preview-text")).toBeVisible();
        },
      },
    ];
    for (const view of views) {
      await page.setViewportSize({ width: 1280, height: TALL });
      await view.show();
      for (const railOpen of [false, true]) {
        await setRail(page, railOpen);
        let reference: string[] | undefined;
        for (const width of WIDTHS) {
          if (railOpen && width < OPEN_RAIL_MIN_WIDTH) continue;
          for (const height of HEIGHTS) {
            await page.setViewportSize({ width, height });
            await view.ready();
            const where = `Space ${view.name} · sidebar ${railOpen ? "open" : "collapsed"} · ${width}×${height}`;
            const found = await measure(page, containers);
            record(where, found, defects);
            reference = compareNames(where, found, reference, defects);
          }
        }
      }
    }
    expect(defects, defects.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// space-44: accessibility
// ---------------------------------------------------------------------------

test.describe("accessibility", () => {
  test.use({ appOptions: { project: true, remote: "peer" } });

  for (const theme of ["light", "dark"] as const) {
    test(`space-44: no serious or critical violation with the picker standing (${theme})`, async ({
      page,
      app,
    }) => {
      test.setTimeout(120_000);
      await arrangeChoices(app);
      await page.emulateMedia({ colorScheme: theme });
      await open(page, app);
      await showSpace(page);
      const scan = async (where: string): Promise<string[]> => {
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        return results.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map(
            (v) =>
              `${where}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}; e.g. ${v.nodes[0]?.target.join(" ")} :: ${v.nodes[0]?.html.slice(0, 160)})`,
          );
      };
      const found: string[] = [];

      // The picker's radio groups and the tabs are named (space-17).
      const tab = page.getByTestId("space-sync-tab");
      await expect(tab.getByTestId("space-picker")).toBeVisible();
      await expect(tab.getByRole("radiogroup", { name: SESSION_TITLE })).toBeVisible();
      await expect(tab.getByRole("radiogroup", { name: "Settings changed" })).toBeVisible();
      await expect(page.getByRole("tablist", { name: "Space views" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Sync" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: "Explore" })).toBeVisible();
      found.push(...(await scan("Space · Sync")));

      // The tree is named (space-23).
      await page.getByTestId("space-tab-explore").click();
      const tree = page.getByRole("tree", { name: "Files in the space" });
      await expect(tree).toBeVisible();
      await tree.getByTestId("space-node-sessions").click();
      await tree.getByTestId(`space-node-session:${app.sessionId}`).click();
      await tree.getByTestId(`space-node-sessions/${app.sessionId}.json`).click();
      await expect(page.getByTestId("space-preview-text")).toBeVisible();
      found.push(...(await scan("Space · Explore")));

      expect(found, found.join("\n")).toEqual([]);
    });
  }
});

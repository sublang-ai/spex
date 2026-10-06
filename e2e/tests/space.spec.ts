// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's journeys (DR-057, DR-103): a project's spex
// repository given a bare remote and synced for the first time
// (space-40), the daily sync with conflicts chosen by keyboard, a host
// that moves under the push, and Stop against a sleeping transport
// (space-41), the explorer with its privacy panel and Copy path
// (space-42), fit at every width in both sidebar states (space-43),
// and axe in both themes (space-44). Every remote is a bare repository
// in the scratch root on its `spex` branch and every transport a local
// path or a sleeping script: hermetic, no network, no credentials.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedDemoProject } from "@sublang/spex-core/testing";

import {
  E2E_OWN,
  LOCAL_MODEL,
  LOCAL_PROJECT_CONFIG,
  clonePath,
  LOCAL_TURN,
  PEER_TURN,
  SESSION_TITLE,
  expect,
  git,
  nav,
  open,
  runTurn,
  send,
  settled,
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
const GIT_WORDS = /\b(ours|theirs|HEAD|MERGE_HEAD)\b|origin\/(main|spex)/;

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

/** Give the opened repository a remote through its own editor (space-5). */
async function setRemote(page: Page, url: string): Promise<void> {
  const panel = page.getByTestId("space-repository");
  await panel.getByTestId("space-remote-edit").click();
  await panel.getByTestId("space-remote-input").fill(url);
  await panel.getByTestId("space-remote-editor").getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByTestId("space-remote-editor")).toHaveCount(0);
}

/** Open the Space surface from the sidebar. */
async function showSpace(page: Page): Promise<void> {
  await nav(page, "Space").click();
  await expect(page.getByTestId("space-surface")).toBeVisible();
  await expect(page.getByTestId("space-header")).toBeVisible();
}

/** Activate a spex repository's row, opening its Sync and Explore tabs
 * beneath the groups list (space-1). */
async function openRepository(page: Page, key: string): Promise<void> {
  const row = page.getByTestId(`space-repo-${key}`);
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("space-repository")).toBeVisible();
}

/** The step lines in their order (space-12). */
const STEP_LINES = [
  "Saving changes…",
  "Checking host…",
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

/** Your own group's spex repository in every journey home (storage-2). */
const OWN_REPOSITORY = `${E2E_OWN}/${E2E_OWN}-spex`;

// ---------------------------------------------------------------------------
// space-40: the first sync of a project's spex repository
// ---------------------------------------------------------------------------

// What awaits sign-in (space-3, space-4, space-58, space-65): the
// account in the header, your own group's spex repository created and
// pushed on the Git host, and "Pick a group" for a local-only project.
// Until the host exists here, a project's repository reaches a remote
// through Set remote (space-5) and syncs against it as any other.
test.describe("first sync", () => {
  test.use({ appOptions: { project: true, remote: "bare" } });

  test("space-40: the groups list, Set remote, the first sync, and a session and an intent sent", async ({
    page,
    app,
  }) => {
    test.setTimeout(120_000);
    const key = app.projectId!;
    const clone = clonePath(app.dataDir, key);
    await open(page, app);
    await showSpace(page);
    const header = page.getByTestId("space-header");

    // The header reads the home and that nothing is signed in; the
    // groups list holds your own group with its repositories, your own
    // group's first, each local only (space-1, space-61).
    await expect(header.getByTestId("space-account")).toHaveText("Not signed in");
    const group = page.getByTestId(`space-group-${E2E_OWN}`);
    await expect(group.getByRole("heading", { level: 2 })).toContainText(E2E_OWN);
    await expect(group.locator('[data-testid^="space-repo-"][data-state]')).toHaveCount(2);
    await expect(group.locator('[data-testid^="space-repo-"][data-state]').first()).toHaveAttribute(
      "data-testid",
      `space-repo-${OWN_REPOSITORY}`,
    );
    const row = page.getByTestId(`space-repo-${key}`);
    await expect(row).toHaveAccessibleName("demo-project-spex");
    await expect(page.getByTestId(`space-repo-state-${key}`)).toHaveText("Only on this device");
    await expect(page.getByTestId(`space-repo-folder-${key}`)).toContainText("demo-project");
    await expect(page.getByTestId(`space-repo-code-${key}`)).toHaveText("No code");
    await expect(page.getByTestId("space-repository")).toHaveCount(0);

    // The row opens the repository's tabs; Set remote names the bare
    // remote, and the row turns reachable, never synced (space-5,
    // space-61).
    await openRepository(page, key);
    const panel = page.getByTestId("space-repository");
    await expect(panel.getByTestId("space-last-sync")).toHaveText("Never synced");
    await setRemote(page, app.remotePath!);
    await expect(page.getByTestId(`space-repo-state-${key}`)).toHaveText("Never synced");
    expect(git(clone, "remote", "get-url", "origin")).toBe(app.remotePath);

    // The first sync sends what the clone holds: the step line names
    // each step in order, the control reads "Syncing…", and the done
    // line counts what the empty host took (space-12).
    const labels = await watch(page, '[data-testid="space-primary"]');
    const stepLines = await watch(page, '[data-testid="space-step-line"]');
    await expect(panel.getByTestId("space-primary")).toHaveText("Sync");
    await panel.getByTestId("space-primary").click();
    const done = panel.getByTestId("space-done-line");
    await expect(done).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    await expect(panel.getByTestId("space-primary")).toHaveText("Sync");
    await expect(panel.getByTestId("space-primary")).toBeEnabled();
    expect(await labels()).toEqual(["Sync", "Syncing…", "Sync"]);
    const steps = await stepLines();
    expect(steps, steps.join(" → ")).toContain("Pushing…");
    expect(inStepOrder(steps), steps.join(" → ")).toBe(true);
    await expect(panel.getByTestId("space-last-sync")).toHaveText(/^Synced just now$/);
    await expect(panel.getByTestId("space-last-sync")).toHaveAttribute("title", /\d/);
    await expect(page.getByTestId(`space-repo-state-${key}`)).toHaveText("Synced just now");
    expect(git(app.remotePath!, "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));

    // Nothing moved on the second sync: the line reads "Everything is
    // in sync" (space-12).
    await panel.getByTestId("space-primary").click();
    await expect(done).toHaveText("Everything is in sync");

    // A session run from the Captain home lists under local changes by
    // its title; Open session opens its tab; Sync sends it, the host's
    // spex holding both bundle files (space-7).
    await nav(page, "Projects").click();
    await expect(page.getByTestId("captain-home")).toContainText("demo-project");
    await send(page, "Fix the token refresh in auth.ts");
    await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
    // The turn settles and the runtime is released after that line;
    // Sync is refused by name until then (space-11).
    await settled(app);
    await showSpace(page);
    await openRepository(page, key);
    const local = panel.getByTestId("space-local-list");
    const sessionRow = local.locator('[data-testid^="space-unit-mine-sessions/"]');
    await expect(sessionRow).toHaveCount(1);
    await expect(sessionRow).toContainText("Fix the token refresh in auth.ts");
    await expect(sessionRow).toHaveAttribute("data-change", "new");
    const sessionId = (await sessionRow.getAttribute("data-testid"))!.replace("space-unit-mine-sessions/", "");
    await sessionRow.getByRole("button", { name: "Open session" }).click();
    await expect(page.getByRole("tab", { name: /fix the token refresh/i })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText("Fix the token refresh in auth.ts");
    await showSpace(page);
    await openRepository(page, key);
    await panel.getByTestId("space-primary").click();
    await expect(done).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    await expect(panel.getByTestId("space-sync-tab")).toContainText("Nothing to send from this device");
    const tracked = git(app.remotePath!, "ls-tree", "-r", "--name-only", "spex").split("\n");
    expect(tracked).toContain(`sessions/${sessionId}.json`);
    expect(tracked).toContain(`sessions/${sessionId}.records.jsonl`);
    expect(tracked.some((path) => path.endsWith(".hints.json") || path.startsWith("local/") || path === "prefs.json")).toBe(false);

    // An intent queued while Space is shown lists under local changes
    // with Refresh never activated — the ledger's announcement re-reads
    // the state — and Refresh's caption reads the time of the read
    // (space-2, space-7).
    await app.core.command("intent.queue", { projectId: key, text: "Queued while Space is shown" });
    const intentRow = local.locator('[data-testid^="space-unit-mine-intents/"]');
    await expect(intentRow).toHaveCount(1);
    await expect(intentRow).toContainText("Queued while Space is shown");
    await expect(intentRow).toHaveAttribute("data-change", "new");
    await expect(panel.getByTestId("space-local-count")).toHaveAccessibleName("1 local change");
    await page.getByTestId("space-refresh").click();
    await expect(page.getByTestId("space-read-at")).toHaveText("Read just now");
    await expect(page.getByTestId("space-read-at")).toHaveAttribute("title", /\d/);
  });
});

// ---------------------------------------------------------------------------
// space-41: the daily sync with conflicts
// ---------------------------------------------------------------------------

test.describe("daily sync", () => {
  test.use({ appOptions: { project: true, remote: "peer" } });

  test("space-41: Check host, choices by keyboard, the confirm, a host that moved, and Stop", async ({
    page,
    app,
  }) => {
    test.setTimeout(180_000);
    const key = app.projectId!;
    const clone = clonePath(app.dataDir, key);
    const sessionUnit = `sessions/${app.sessionId}`;
    const settingsUnit = "config/playbook.config.yaml";
    const words: string[] = [];
    await open(page, app);
    await showSpace(page);
    await openRepository(page, key);
    const panel = page.getByTestId("space-repository");
    const tab = panel.getByTestId("space-sync-tab");

    // Check host lists the peer's session, Settings and intent as
    // incoming, the units changed on both sides marked, and the
    // repository reads behind (space-8).
    await expect(tab.getByTestId("space-check")).toHaveText("Check host");
    await tab.getByTestId("space-check").click();
    const incoming = tab.getByTestId("space-incoming-list");
    const incomingSession = incoming.getByTestId(`space-unit-remote-${sessionUnit}`);
    await expect(incomingSession).toContainText(SESSION_TITLE);
    await expect(incomingSession).toHaveAttribute("data-change", "updated");
    await expect(incomingSession.getByTestId(`space-choose-${sessionUnit}`)).toContainText("choose");
    const incomingSettings = incoming.getByTestId(`space-unit-remote-${settingsUnit}`);
    await expect(incomingSettings).toContainText("Settings changed");
    await expect(incomingSettings.getByTestId(`space-choose-${settingsUnit}`)).toContainText("choose");
    const incomingIntent = incoming.locator('[data-testid^="space-unit-remote-intents/"]');
    await expect(incomingIntent).toHaveCount(1);
    await expect(incomingIntent).toContainText("Queued on the other laptop");
    await expect(incomingIntent).toHaveAttribute("data-change", "new");
    await expect(panel.getByTestId("space-ahead-behind")).toContainText(/0 ahead/);
    await expect(panel.getByTestId("space-ahead-behind")).toContainText(/1 behind/);
    // A unit the host changed too is a choice, not a local unit
    // (space-7): the local list and its count leave both out.
    await expect(panel.getByTestId("space-local-count")).toHaveAccessibleName("0 local changes");
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
    await openRepository(page, key);

    // Sync ends "Needs your choice" with Apply disabled reading
    // "0 of 2 chosen" (space-9, space-14, space-17).
    await panel.getByTestId("space-primary").click();
    const note = tab.getByTestId("space-choices-note");
    await expect(note.getByTestId("space-step-line")).toHaveText("Needs your choice");
    await expect(note).toContainText("Your changes are saved; nothing is pushed yet");
    const picker = tab.getByTestId("space-picker");
    await expect(picker).toContainText("Choose for 2 conflicts");
    await expect(picker.getByTestId("space-chosen")).toHaveText("0 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeDisabled();
    await expect(picker.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(panel.getByTestId("space-status-dot")).toHaveAttribute("data-tone", "attention");
    await scanVocabulary(page, "needs your choice", words);

    // "Take host's" for the session and "Keep mine" for Settings, by
    // keyboard: each row is a radio group named by the unit's label,
    // arrow keys moving within it (space-17).
    const sessionGroup = picker.getByRole("radiogroup", { name: SESSION_TITLE });
    const settingsGroup = picker.getByRole("radiogroup", { name: "Settings changed" });
    await expect(sessionGroup).toContainText(/Keep mine\s+updated/);
    await expect(sessionGroup).toContainText(/Take host's\s+updated/);
    await expect(sessionGroup).toContainText("2 turns");
    await sessionGroup.getByRole("radio", { name: /Keep mine/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(sessionGroup.getByRole("radio", { name: /Take host's/ })).toBeChecked();
    await expect(sessionGroup.getByRole("radio", { name: /Take host's/ })).toBeFocused();
    await expect(picker.getByTestId("space-chosen")).toHaveText("1 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeDisabled();
    await settingsGroup.getByRole("radio", { name: /Take host's/ }).focus();
    await page.keyboard.press("ArrowUp");
    await expect(settingsGroup.getByRole("radio", { name: /Keep mine/ })).toBeChecked();
    await expect(picker.getByTestId("space-chosen")).toHaveText("2 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeEnabled();
    // Settings carries a diff per side, the host's adding the peer's
    // binding (space-10).
    await settingsGroup.getByRole("button", { name: "View diff" }).last().click();
    const diff = picker.getByTestId(`space-diff-remote-${settingsUnit}`);
    await expect(diff).toContainText("The host's version against the common ancestor");
    await expect(diff).toContainText(/^\+\s*reviewer: dev\.coder/m);
    await settingsGroup.getByRole("button", { name: "Hide diff" }).click();
    await expect(diff).toHaveCount(0);

    // Apply's confirm names one replaced unit with Cancel focused;
    // Escape keeps the choices; confirming ends synced (space-18).
    await picker.getByTestId("space-apply").click();
    const confirm = picker.getByTestId("space-apply-confirm");
    await expect(confirm).toContainText("Replace 1 unit with the host's version?");
    await expect(confirm).toContainText("The other version stays in Git history");
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(picker.getByTestId("space-chosen")).toHaveText("2 of 2 chosen");
    await expect(sessionGroup.getByRole("radio", { name: /Take host's/ })).toBeChecked();
    await expect(settingsGroup.getByRole("radio", { name: /Keep mine/ })).toBeChecked();
    await picker.getByTestId("space-apply").click();
    await confirm.getByRole("button", { name: "Apply" }).click();
    const done = tab.getByTestId("space-done-line");
    await expect(done).toHaveText(/^Synced just now · 1 sent · 2 received$/);
    await expect(tab.getByTestId("space-picker")).toHaveCount(0);
    await expect(panel.getByTestId("space-ahead-behind")).toContainText(/0 ahead/);
    await expect(panel.getByTestId("space-ahead-behind")).toContainText(/0 behind/);
    await scanVocabulary(page, "synced", words);
    expect(git(app.remotePath!, "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));
    // This device's Settings stood, the host's taking its version too
    // (space-19).
    expect(readFileSync(join(clone, "config", "playbook.config.yaml"), "utf8")).toBe(LOCAL_PROJECT_CONFIG);
    expect(git(app.remotePath!, "show", `spex:${settingsUnit}`) + "\n").toBe(LOCAL_PROJECT_CONFIG);

    // The session's tab shows the host's turns, the composer's draft
    // kept; your own group's Settings were never part of this
    // repository's sync (space-20).
    await nav(page, "Projects").click();
    await expect(sessionTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText(PEER_TURN);
    await expect(page.getByTestId("captain-pane")).not.toContainText(LOCAL_TURN);
    await expect(page.getByTestId("boss-composer")).toHaveValue(draft);
    await nav(page, "Settings").click();
    await expect(page.getByTestId("captain-section").getByTestId("agent-chip")).toContainText(LOCAL_MODEL);
    expect(readFileSync(app.configPath, "utf8")).toContain(`model: ${LOCAL_MODEL}`);

    // The host's spex moves under the push: one automatic re-check,
    // then "changed again" with the ahead count; a second Sync pushes
    // (space-15).
    await showSpace(page);
    await openRepository(page, key);
    // Something to send — an intent queued meanwhile, the arrange
    // client standing in for the Boss — so the push runs and meets the
    // moved host; a clone level with the host has nothing to push.
    await app.core.command("intent.queue", { projectId: key, text: "Queued after the merge" });
    await expect(panel.getByTestId("space-local-count")).toHaveAccessibleName("1 local change");
    app.rejectPushes(2);
    await panel.getByTestId("space-primary").click();
    const stopped = tab.getByTestId("space-stopped");
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Push stopped — The host changed again");
    await expect(stopped).toContainText(/Your changes are saved locally \([1-9]\d* commits? ahead\)/);
    await expect(stopped.getByTestId("space-retry")).toBeVisible();
    await expect(panel.getByTestId("space-ahead-behind")).toContainText(/[1-9]\d* ahead/);
    await expect(panel.getByTestId("space-status-dot")).toHaveAttribute("data-tone", "attention");
    await scanVocabulary(page, "changed again", words);
    await panel.getByTestId("space-primary").click();
    await expect(done).toHaveText(/^Synced just now · 1 sent · 1 received$/);
    await expect(tab.getByTestId("space-stopped")).toHaveCount(0);
    expect(git(app.remotePath!, "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(git(app.remotePath!, "ls-tree", "-r", "--name-only", "spex").split("\n")).toContain("peer-note-2.txt");

    // Stop during a check against a sleeping transport ends the check
    // with its stopped state and Retry (space-15, space-16).
    await setRemote(page, app.sleepingRemote());
    expect(git(clone, "remote", "get-url", "origin")).toBe(app.sleepingRemote());
    await expect(panel.getByTestId("space-ahead-behind")).toHaveCount(0);
    const checkLabels = await watch(page, '[data-testid="space-check"]');
    await tab.getByTestId("space-check").click();
    const rail = tab.getByTestId("space-rail");
    await expect(rail.getByTestId("space-step-line")).toHaveText("Checking host…");
    await expect(rail.getByTestId("space-step-save")).toHaveCount(0);
    await rail.getByTestId("space-stop").click();
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Check stopped — No answer from sleepy.invalid");
    await expect(stopped).toContainText("Git runs without prompts");
    await expect(stopped.getByTestId("space-retry")).toHaveText("Retry");
    await expect(tab.getByTestId("space-check")).toHaveText("Check host");
    expect(await checkLabels()).toEqual(["Check host", "Checking…", "Check host"]);
    await expect(panel.getByTestId("space-status-dot")).toHaveAttribute("data-tone", "stopped");
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
    const key = app.projectId!;
    const clone = clonePath(app.dataDir, key);
    // A finished session committed by a sync, then its hints file, so
    // the manifest reads Shared and the hints Stays here.
    const session = await app.core.command("session.create", { projectId: key });
    await runTurn(app, session.id, SESSION_TITLE);
    await app.core.command("space.remote.set", { repository: key, url: app.remotePath! });
    const synced = await app.settleSpace("space.sync", { repository: key });
    if (synced.sync.phase !== "done") throw new Error(`the arranged sync ended ${JSON.stringify(synced.sync)}`);
    writeFileSync(join(app.sharedSessionsDir, `${session.id}.hints.json`), "{}\n");
    // intents/ with nothing queued yet: a tracked kind, nothing committed.
    mkdirSync(join(clone, "intents"), { recursive: true });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: app.origin });

    await open(page, app);
    await showSpace(page);
    await openRepository(page, key);
    await page.getByTestId("space-tab-explore").click();
    const explore = page.getByTestId("space-explore-tab");
    const tree = explore.getByRole("tree", { name: "Files in demo-project-spex" });
    await expect(tree).toBeVisible();
    // The tree is the repository's clone (space-23).
    await expect(explore).toContainText(join("workspace", ...key.split("/")));

    // The session's files group under one node titled by its first
    // turn: the manifest Shared, the hints Stays here (space-23).
    const sessionsDir = tree.getByTestId("space-node-sessions");
    await expect(sessionsDir).toContainText("sessions/");
    await sessionsDir.click();
    const sessionNode = tree.getByTestId(`space-node-session:${session.id}`);
    await expect(sessionNode).toContainText(SESSION_TITLE);
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
    // An empty directory of a tracked kind — intents/ before any queued
    // intent — reads not yet shared, never "Stays here" (space-23).
    const intents = tree.getByTestId("space-node-intents");
    await expect(intents).toContainText("intents");
    await expect(intents).toContainText("0 entries");
    await expect(intents).toContainText("Not yet shared");
    await expect(intents.locator("[data-sync]")).toHaveAttribute("data-sync", "pending");

    // The manifest previews as pretty-printed JSON; the records offer
    // Open session; the hints read withheld (space-24).
    const preview = explore.getByTestId("space-preview");
    await manifest.click();
    await expect(preview).toContainText("session manifest");
    await expect(preview.getByTestId("space-preview-owner")).toHaveText(`"${SESSION_TITLE}"`);
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

    // "Stays on this device" names the eight families with their
    // reasons (space-25).
    const privacy = explore.getByTestId("space-privacy");
    const toggle = privacy.getByTestId("space-privacy-toggle");
    await expect(toggle).toContainText("Stays on this device (8 kinds)");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    const families: [string, RegExp][] = [
      ["provider hints", /resume tokens for this machine's agent conversations/],
      ["leases and locks", /which process is writing right now/],
      ["installed spec packages and exported skills", /copies installed from the lock/],
      ["where projects live", /where your working folders are on this machine/],
      ["preferences", /where you last stopped reading in each session/],
      ["credentials", /this device's sign-in to the Git host/],
      ["migration receipts and inputs", /original files kept from an upgrade/],
      ["temporary files", /copies made while writing/],
    ];
    const list = privacy.locator("#space-privacy-list");
    await expect(list.locator("dt")).toHaveCount(8);
    for (const [family, reason] of families) {
      await expect(list.locator("dt", { hasText: new RegExp(`^${family}$`) })).toHaveCount(1);
      await expect(list).toContainText(reason);
    }
    // Folded state is chrome preference: it survives a reload.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await showSpace(page);
    await openRepository(page, key);
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
  const clone = clonePath(app.dataDir, projectId);
  for (const text of ["Add a README badge", "Tighten the expiry tests", "Retire the legacy sessions"]) {
    await app.core.command("intent.queue", { projectId, text });
  }
  const second = join(app.dataDir, "..", "second-project");
  seedDemoProject(second);
  await app.core.command("project.register", { path: second });
  appendFileSync(join(clone, ".gitignore"), "# authored\n/scratch/\n");
  writeFileSync(join(clone, "notes.txt"), "a stray note\n");
  const state = await app.settleSpace("space.sync", { repository: projectId });
  if (state.sync.phase !== "choices") {
    throw new Error(`the arranged sync ended ${JSON.stringify(state.sync)}`);
  }
}

test.describe("fit", () => {
  test.use({ appOptions: { project: true, remote: "peer" } });

  test("space-43: the groups list and the Sync and Explore tabs fit at every width, in both sidebar states", async ({
    page,
    app,
  }) => {
    test.setTimeout(300_000);
    await arrangeChoices(app);
    page.on("pageerror", (error) => console.log(`[space fit] page error: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: TALL });
    await open(page, app);
    await showSpace(page);
    await openRepository(page, app.projectId!);
    const tab = page.getByTestId("space-sync-tab");
    await expect(tab.getByTestId("space-picker")).toContainText(/Choose for \d+ conflicts/);
    // A diff open in the picker, so the diff canvas is measured too.
    const settingsGroup = tab.getByRole("radiogroup", { name: "Settings changed" });
    await settingsGroup.getByRole("button", { name: "View diff" }).first().click();
    await expect(tab.getByTestId("space-diff-mine-config/playbook.config.yaml")).toContainText("This device against");

    const defects: string[] = [];
    const containers = [
      '[role="radiogroup"]',
      '[data-testid="space-picker"]',
      '[data-testid="space-header"]',
      '[data-testid="space-repository-header"]',
      '[data-testid="space-groups"] h2',
    ];
    const views: { name: string; show: () => Promise<void>; ready: () => Promise<void> }[] = [
      {
        name: "Sync",
        show: () => page.getByTestId("space-tab-sync").click(),
        ready: async () => {
          await expect(tab.getByTestId("space-picker")).toBeVisible();
          await expect(page.getByTestId(`space-repo-${app.projectId}`)).toBeVisible();
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
          const tree = page.getByRole("tree", { name: "Files in demo-project-spex" });
          await tree.getByTestId("space-node-sessions").click();
          const node = tree.getByTestId(`space-node-session:${app.sessionId}`);
          await node.click();
          await tree.getByTestId(`space-node-sessions/${app.sessionId}.json`).click();
          await expect(page.getByTestId("space-preview-text")).toContainText('"sessionId"');
          const privacy = page.getByTestId("space-privacy-toggle");
          if ((await privacy.getAttribute("aria-expanded")) !== "true") await privacy.click();
        },
        ready: async () => {
          await expect(page.getByRole("tree", { name: "Files in demo-project-spex" })).toBeVisible();
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

      // The groups list and each repository's row are named (space-1).
      await expect(page.getByRole("region", { name: "Groups" })).toBeVisible();
      await expect(page.getByRole("button", { name: "demo-project-spex" })).toHaveAttribute("aria-expanded", "false");
      found.push(...(await scan("Space · groups")));
      await openRepository(page, app.projectId!);

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
      const tree = page.getByRole("tree", { name: "Files in demo-project-spex" });
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

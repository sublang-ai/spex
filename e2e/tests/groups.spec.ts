// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface's journeys (DR-103; DR-057 named it Space),
// against the stand-in Git host (git-host-12): the first start and the
// first sign-in by the device flow the served shell runs (space-40);
// the daily sync with conflicts chosen by keyboard, a host that moves
// under the push, Stop against a sleeping transport and the members
// (space-41); the explorer with its privacy panel and Copy path
// (space-42); fit at every width in both sidebar states (space-43);
// axe in both themes (space-44); and a second device joining a project
// a peer pushed (space-36). Every host is the in-process stand-in on
// loopback, every peer plain Git on its bare repositories, and the
// exploring journey's remote a bare path: hermetic, no network, no
// credential of the machine's.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { seedDemoProject } from "@sublang/spex-core/testing";

import {
  HOST_GROUP,
  HOST_LOGIN,
  LOCAL_MODEL,
  LOCAL_PROJECT_CONFIG,
  LOCAL_TURN,
  PEER_MEMBER,
  PEER_SESSION_TITLE,
  PEER_TURN,
  SESSION_TITLE,
  arrangeHostPeer,
  bareOf,
  clonePath,
  expect,
  git,
  nav,
  open,
  runTurn,
  seedHostProject,
  send,
  settled,
  signInThroughPage,
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

/** Git's own words, and the words the surface never uses for the
 * host's things, never lead on it (space-27). */
const FORBIDDEN_WORDS = /\b(ours|theirs|HEAD|MERGE_HEAD)\b|origin\/spex|\b[Nn]amespace\b|\b[Ss]pace\b/;

/** Note any forbidden word in the surface's visible text (space-27). */
async function scanVocabulary(page: Page, where: string, found: string[]): Promise<void> {
  const text = await page.getByTestId("space-surface").innerText();
  const hit = FORBIDDEN_WORDS.exec(text);
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

/** Open the Groups surface from the sidebar. */
async function showGroups(page: Page): Promise<void> {
  await nav(page, "Groups").click();
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

/** A branch's commit in a repository, or "" while it has none. */
function headOf(dir: string, branch: string): string {
  try {
    return git(dir, "rev-parse", "--verify", "-q", branch);
  } catch {
    return "";
  }
}

/** The demo project's spex repository once picked into the team group. */
const TEAM_KEY = `${HOST_GROUP}/demo-project-spex`;
/** Your own group's spex repository once signed in (space-59). */
const OWN_KEY = `${HOST_LOGIN}/${HOST_LOGIN}-spex`;

// ---------------------------------------------------------------------------
// space-40: the first start and the first sign-in
// ---------------------------------------------------------------------------

test.describe("first start", () => {
  test.use({ appOptions: { host: true } });

  test("space-40: not signed in, a project added, the device sign-in, a group picked, a session and an intent sent", async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    const host = app.host!;
    await open(page, app);
    await showGroups(page);
    const header = page.getByTestId("space-header");

    // Not signed in: the header is one card saying what signing in
    // brings, Sign in its one primary control, with no home path, read
    // time or Refresh; your own group stands alone beneath, called so,
    // its row with no control (space-1, space-3).
    await expect(header.getByTestId("space-account").getByRole("heading", { level: 2 })).toHaveText("Not signed in");
    await expect(header.getByTestId("space-signin-body")).toHaveText(
      "Sign in to see your groups and share each project's records with the people in them." +
        "Until you do, everything stays on this device and nothing is contacted.",
    );
    await expect(header.getByTestId("space-signin")).toHaveText("Sign in");
    await expect(header.locator("button.bg-brand-600")).toHaveCount(1);
    await expect(header.locator("button.bg-brand-600")).toHaveAttribute("data-testid", "space-signin");
    await expect(header.getByRole("button")).toHaveCount(1);
    await expect(header).not.toContainText("/");
    await expect(page.getByTestId("space-refresh")).toHaveCount(0);
    await expect(page.getByTestId("space-read-at")).toHaveCount(0);
    await expect(page.getByTestId("space-home")).toHaveCount(0);
    const groups = page.getByTestId("space-groups");
    await expect(groups.locator('[data-testid^="space-group-"]')).toHaveCount(1);
    await expect(groups.getByTestId("space-group-e2e")).toBeVisible();
    const own = groups.getByRole("group", { name: "Your own group" });
    await expect(own.getByRole("heading", { level: 2 })).toHaveText("Your own group");
    const ownRow = own.locator('[data-testid^="space-row-"]');
    await expect(ownRow).toHaveCount(1);
    await expect(ownRow.locator('[data-testid^="space-repo-state-"]')).toHaveText("On this device only — shared once you sign in");
    await expect(ownRow.locator('button:not([data-testid^="space-repo-"])')).toHaveCount(0);
    // Nothing was contacted.
    expect(host.script.requests.filter((request) => request.path.startsWith("/api/"))).toEqual([]);

    // A project added from the palette lists under your own group as
    // "On this device only", with no control while signed out
    // (space-61).
    seedDemoProject(app.projectDir);
    await page.getByRole("button", { name: "Switch or add a project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    await expect(palette).toBeHidden();
    await showGroups(page);
    const localKey = "e2e/demo-project-spex";
    await expect(page.getByTestId(`space-row-${localKey}`)).toBeVisible();
    await expect(page.getByTestId(`space-repo-state-${localKey}`)).toHaveText("On this device only");
    await expect(page.getByTestId(`space-row-${localKey}`).locator('button:not([data-testid^="space-repo-"])')).toHaveCount(0);

    // Sign in links the page that carries the code, naming the host
    // read at Sign in, and shows no code, reading "Signing in…" until
    // the stand-in approves; then the header reads the account and
    // Refresh, your own group bears its login, and the surface ends in
    // where this device's files are (space-3, space-4, space-1).
    await header.getByTestId("space-signin").click();
    await expect(header.getByTestId("space-signin-link")).toHaveText("Open Stand-in Git host to sign in");
    await expect(header.getByTestId("space-signin-body")).toContainText(
      "Sign in with your Stand-in Git host account there and approve; you return here signed in.",
    );
    await expect(page.getByTestId("space-surface").getByRole("button", { name: /^Sign/ })).toHaveCount(1);
    await header.getByTestId("space-signin-cancel").click();
    await expect(header.getByTestId("space-signin")).toHaveText("Sign in");
    await signInThroughPage(page, app);
    await expect(header.getByTestId("space-account")).toContainText(`Signed in as @${HOST_LOGIN} at Stand-in Git host`);
    await expect(header.getByTestId("space-signout")).toHaveText("Sign out");
    await expect(header.getByTestId("space-refresh")).toHaveText("Refresh");
    await expect(page.getByTestId("space-home")).toHaveText(/^Spex keeps this device's files in /);
    await expect(page.getByTestId("space-home")).toHaveAttribute("title", app.dataDir);
    await expect(groups.getByTestId(`space-group-${HOST_LOGIN}`)).toBeVisible();
    await expect(groups.getByTestId("space-group-e2e")).toHaveCount(0);
    await expect(page.getByTestId(`space-repo-${OWN_KEY}`)).toHaveAccessibleName(`${HOST_LOGIN}-spex`);
    const projectKey = `${HOST_LOGIN}/demo-project-spex`;
    await expect(page.getByTestId(`space-repo-state-${projectKey}`)).toHaveText("On this device only");
    // Your own group's spex repository stands on the host, pushed.
    await expect.poll(() => host.script.repositories.map((repo) => `${repo.group.fullPath}/${repo.path}`)).toContain(OWN_KEY);
    await expect.poll(() => headOf(bareOf(host, OWN_KEY), "spex"), { timeout: 30_000 }).toMatch(/^[0-9a-f]{40}$/);

    // Pick a group offers the stand-in's groups; picking the team's
    // turns the row reachable with a sync time, the stand-in holding
    // `<name>-spex` on its `spex` branch (space-58, space-12).
    await page.getByTestId(`space-row-pick-${projectKey}`).click();
    const picker = page.getByTestId(`space-picker-${projectKey}`);
    await expect(picker).toBeVisible();
    for (const group of [HOST_LOGIN, HOST_GROUP, `${HOST_GROUP}/research`]) {
      await expect(picker.getByTestId(`space-pick-group-${group}`)).toHaveText(group);
    }
    await expect(picker.getByTestId(`space-pick-name-${projectKey}`)).toHaveValue("demo-project");
    await picker.getByTestId(`space-pick-group-${HOST_GROUP}`).click();
    await expect(page.getByTestId(`space-repo-state-${TEAM_KEY}`)).toHaveText("Synced just now", { timeout: 30_000 });
    await expect(page.getByTestId(`space-row-${TEAM_KEY}`)).toHaveAttribute("data-state", "reachable");
    await expect(page.getByTestId(`space-row-sync-${TEAM_KEY}`)).toHaveText("Sync");
    const clone = clonePath(app.dataDir, TEAM_KEY);
    expect(git(bareOf(host, TEAM_KEY), "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));

    // A session run from the Captain home lists under the repository's
    // local changes by its title; Open session opens its tab; Sync sends
    // it, the host's `spex` holding both bundle files (space-7, space-12).
    // The project's key moved with the sign-in and the pick (space-59,
    // space-58, space-60); the page follows it with no reload, so the
    // Captain home addresses the project where it now is.
    await nav(page, "Projects").click();
    await page
      .getByRole("tree", { name: "Projects and sessions" })
      .getByRole("treeitem", { name: "demo-project", exact: true })
      .click();
    await expect(page.getByTestId("captain-home")).toContainText("demo-project");
    await send(page, "Fix the token refresh in auth.ts");
    await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
    // The turn settles and the runtime is released after that line;
    // Sync is refused by name until then (space-11).
    await settled(app);
    await showGroups(page);
    await openRepository(page, TEAM_KEY);
    const panel = page.getByTestId("space-repository");
    const local = panel.getByTestId("space-local-list");
    const sessionRow = local.locator('[data-testid^="space-unit-mine-sessions/"]');
    await expect(sessionRow).toHaveCount(1);
    await expect(sessionRow).toContainText("Fix the token refresh in auth.ts");
    await expect(sessionRow).toHaveAttribute("data-change", "new");
    const sessionId = (await sessionRow.getAttribute("data-testid"))!.replace("space-unit-mine-sessions/", "");
    await sessionRow.getByRole("button", { name: "Open session" }).click();
    await expect(page.getByRole("tab", { name: /fix the token refresh/i })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText("Fix the token refresh in auth.ts");
    await showGroups(page);
    await openRepository(page, TEAM_KEY);
    const labels = await watch(page, `[data-testid="space-row-sync-${TEAM_KEY}"]`);
    await page.getByTestId(`space-row-sync-${TEAM_KEY}`).click();
    const done = panel.getByTestId("space-done-line");
    await expect(done).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    await expect(page.getByTestId(`space-row-sync-${TEAM_KEY}`)).toHaveText("Sync");
    expect(await labels()).toEqual(["Sync", "Syncing…", "Sync"]);
    await expect(panel.getByTestId("space-sync-tab")).toContainText("Nothing to send from this device");
    const tracked = git(bareOf(host, TEAM_KEY), "ls-tree", "-r", "--name-only", "spex").split("\n");
    expect(tracked).toContain(`sessions/${sessionId}.json`);
    expect(tracked).toContain(`sessions/${sessionId}.records.jsonl`);
    expect(tracked.some((path) => path.endsWith(".hints.json") || path.startsWith("local/"))).toBe(false);

    // An intent queued while Groups is shown lists under local changes
    // with Refresh never activated — the ledger's announcement re-reads
    // the state — and Refresh's caption reads the time of the read
    // (space-2, space-7).
    await app.core.command("intent.queue", { projectId: TEAM_KEY, text: "Queued while Groups is shown" });
    const intentRow = local.locator('[data-testid^="space-unit-mine-intents/"]');
    await expect(intentRow).toHaveCount(1);
    await expect(intentRow).toContainText("Queued while Groups is shown");
    await expect(intentRow).toHaveAttribute("data-change", "new");
    await header.getByTestId("space-refresh").click();
    await expect(header.getByTestId("space-read-at")).toHaveText("Host read just now");
    await expect(header.getByTestId("space-refresh")).toHaveAttribute("title", /^Reads the host again · last read .*\d/);
  });
});

// ---------------------------------------------------------------------------
// space-58, projects-1: a folder added while signed in
// ---------------------------------------------------------------------------

test.describe("a folder added while signed in", () => {
  test.use({ appOptions: { host: true, signedIn: true } });

  test("space-58, projects-1: the palette's Add asks for the group in place, and a pick puts the project there", async ({
    page,
    app,
  }) => {
    test.setTimeout(120_000);
    const host = app.host!;
    seedDemoProject(app.projectDir);
    await open(page, app);

    // The folder pairs with a spex repository through the picker of
    // matching spex repositories and groups, standing in the palette
    // in place of its list (projects-1, space-58).
    await page.getByRole("button", { name: "Switch or add a project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    const localKey = `${HOST_LOGIN}/demo-project-spex`;
    const picker = palette.getByTestId(`space-picker-${localKey}`);
    await expect(picker).toBeVisible();
    await expect(palette.getByTestId("palette-path")).toHaveCount(0);
    for (const group of [HOST_LOGIN, HOST_GROUP, `${HOST_GROUP}/research`]) {
      await expect(picker.getByTestId(`space-pick-group-${group}`)).toHaveText(group);
    }
    await expect(picker.getByTestId(`space-pick-name-${localKey}`)).toHaveValue("demo-project");

    // Picking the team's group creates `<name>-spex` there and pushes;
    // the palette closes, and the row is reachable in that group with
    // the project followed to its key (space-58, space-60).
    await picker.getByTestId(`space-pick-group-${HOST_GROUP}`).click();
    await expect(palette).toBeHidden();
    await showGroups(page);
    await expect(page.getByTestId(`space-repo-state-${TEAM_KEY}`)).toHaveText("Synced just now", { timeout: 30_000 });
    await expect(page.getByTestId(`space-row-${TEAM_KEY}`)).toHaveAttribute("data-state", "reachable");
    expect(headOf(bareOf(host, TEAM_KEY), "spex")).toMatch(/^[0-9a-f]{40}$/);
    await nav(page, "Projects").click();
    await expect(page.getByTestId("captain-home")).toContainText("demo-project");
    await expect(
      page.getByRole("tree", { name: "Projects and sessions" }).getByRole("treeitem", { name: "demo-project", exact: true }),
    ).toBeVisible();
    expect((await app.core.command("project.list", {})).map((project) => project.id)).toEqual([TEAM_KEY]);
  });
});

// ---------------------------------------------------------------------------
// space-41: the daily sync with conflicts
// ---------------------------------------------------------------------------

test.describe("daily sync", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  test("space-41: Check host, choices by keyboard, the confirm, a host that moved, Stop, and the members", async ({
    page,
    app,
  }) => {
    test.setTimeout(180_000);
    await arrangeHostPeer(app);
    const host = app.host!;
    const clone = clonePath(app.dataDir, TEAM_KEY);
    const sessionUnit = `sessions/${app.sessionId}`;
    const settingsUnit = "config/playbook.config.yaml";
    const words: string[] = [];
    await open(page, app);
    await showGroups(page);
    await openRepository(page, TEAM_KEY);
    const panel = page.getByTestId("space-repository");
    const tab = panel.getByTestId("space-sync-tab");
    const counts = page.getByTestId(`space-repo-counts-${TEAM_KEY}`);
    const sync = page.getByTestId(`space-row-sync-${TEAM_KEY}`);

    // Check host lists the peer's session and Settings as incoming, the
    // units changed on both sides marked, and the row reads behind
    // (space-8).
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
    await expect(counts).toContainText("0 ahead");
    await expect(counts).toContainText("1 behind");
    // A unit the host changed too is a choice, not a local unit
    // (space-7): the local list leaves both out.
    await expect(tab.locator('[data-testid^="space-unit-mine-"]')).toHaveCount(0);
    await scanVocabulary(page, "after the check", words);

    // A draft typed in the session before the apply survives the
    // history the sync replaces.
    await page
      .getByRole("tree", { name: "Projects and sessions" })
      .getByRole("treeitem", { name: new RegExp(SESSION_TITLE, "i") })
      .click();
    const sessionTab = page.getByRole("tab", { name: new RegExp(SESSION_TITLE, "i") });
    await expect(sessionTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText(LOCAL_TURN);
    const draft = "Draft kept across the sync";
    await page.getByTestId("boss-composer").fill(draft);
    await showGroups(page);
    await openRepository(page, TEAM_KEY);

    // Sync ends "Needs your choice" with Apply disabled reading
    // "0 of 2 chosen" (space-9, space-14, space-17).
    await sync.click();
    const note = tab.getByTestId("space-choices-note");
    await expect(note.getByTestId("space-step-line")).toHaveText("Needs your choice");
    await expect(note).toContainText("Your changes are saved; nothing is pushed yet");
    const picker = tab.getByTestId("space-picker");
    await expect(picker).toContainText("Choose for 2 conflicts");
    await expect(picker.getByTestId("space-chosen")).toHaveText("0 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeDisabled();
    await expect(picker.getByRole("radio", { checked: true })).toHaveCount(0);
    // The incoming list stands above the picker (space-9).
    const above = await tab.getByTestId("space-incoming-list").boundingBox();
    const below = await picker.boundingBox();
    expect(above!.y + above!.height).toBeLessThanOrEqual(below!.y + 1);
    await scanVocabulary(page, "needs your choice", words);

    // "Take host's" for the session and "Keep mine" for Settings, by
    // keyboard: each row is a radio group named by the unit's label,
    // arrow keys moving within it (space-17).
    const sessionGroup = picker.getByRole("radiogroup", { name: SESSION_TITLE });
    const settingsGroup = picker.getByRole("radiogroup", { name: "Settings changed" });
    await expect(sessionGroup).toContainText(/Keep mine\s+updated/);
    await expect(sessionGroup).toContainText(/Take host's\s+updated/);
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
    await expect(counts).toContainText("0 ahead");
    await expect(counts).toContainText("0 behind");
    await scanVocabulary(page, "synced", words);
    expect(git(bareOf(host, TEAM_KEY), "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(readFileSync(join(clone, settingsUnit), "utf8")).toBe(LOCAL_PROJECT_CONFIG);
    expect(git(bareOf(host, TEAM_KEY), "show", `spex:${settingsUnit}`) + "\n").toBe(LOCAL_PROJECT_CONFIG);

    // The session's tab shows the host's turns, the composer's draft
    // kept; Settings shows this device's configuration (space-20).
    await nav(page, "Projects").click();
    await expect(sessionTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText(PEER_TURN);
    await expect(page.getByTestId("captain-pane")).not.toContainText(LOCAL_TURN);
    await expect(page.getByTestId("boss-composer")).toHaveValue(draft);
    await nav(page, "Settings").click();
    await expect(page.getByTestId("captain-section").getByTestId("agent-chip")).toContainText(LOCAL_MODEL);
    expect(readFileSync(app.configPath, "utf8")).toContain(`model: ${LOCAL_MODEL}`);

    // The host's `spex` moves under the push: one automatic re-check,
    // then "changed again" with the ahead count on the row; a second
    // Sync pushes (space-15).
    await showGroups(page);
    await openRepository(page, TEAM_KEY);
    await app.core.command("intent.queue", { projectId: TEAM_KEY, text: "Queued after the merge" });
    await expect(tab.locator('[data-testid^="space-unit-mine-intents/"]')).toHaveCount(1);
    app.rejectPushes(2);
    await sync.click();
    const stopped = tab.getByTestId("space-stopped");
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Push stopped — The host changed again");
    await expect(stopped).toContainText(/Your changes are saved locally \([1-9]\d* commits? ahead\)/);
    await expect(stopped.getByTestId("space-retry")).toBeVisible();
    await expect(counts).toContainText(/[1-9]\d* ahead/);
    await scanVocabulary(page, "changed again", words);
    await sync.click();
    await expect(done).toHaveText(/^Synced just now · 1 sent · 1 received$/);
    await expect(tab.getByTestId("space-stopped")).toHaveCount(0);
    expect(git(bareOf(host, TEAM_KEY), "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(git(bareOf(host, TEAM_KEY), "ls-tree", "-r", "--name-only", "spex").split("\n")).toContain("peer-note-2.txt");

    // Stop during a check against a sleeping transport ends the check
    // with its stopped state and Retry (space-15, space-16).
    host.script.sleepTransport(120_000);
    const checkLabels = await watch(page, '[data-testid="space-check"]');
    await tab.getByTestId("space-check").click();
    const rail = tab.getByTestId("space-rail");
    await expect(rail.getByTestId("space-step-line")).toHaveText("Checking host…");
    // Stop stands once Git's own transport is in flight, sleeping at the
    // host, the host read before it offering none (space-16).
    const stop = rail.getByTestId("space-stop");
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Check stopped — No answer from Stand-in Git host");
    await expect(stopped.getByTestId("space-retry")).toHaveText("Retry");
    await expect(tab.getByTestId("space-check")).toHaveText("Check host");
    expect(await checkLabels()).toEqual(["Check host", "Checking…", "Check host"]);
    await expect(panel.getByTestId("space-status-dot")).toHaveAttribute("data-tone", "stopped");
    host.script.sleepTransport(0);
    await scanVocabulary(page, "check stopped", words);

    // Members lists the stand-in's members with the host's role names
    // and its members page (space-62).
    const listed = host.script.repositories.find((repo) => `${repo.group.fullPath}/${repo.path}` === TEAM_KEY)!;
    listed.members.push(PEER_MEMBER);
    await page.getByTestId(`space-row-members-${TEAM_KEY}`).click();
    const members = page.getByTestId(`space-members-${TEAM_KEY}`);
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toContainText("Ada Lovelace");
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toContainText("Owner");
    await expect(members.getByTestId(`space-member-${PEER_MEMBER.login}`)).toContainText(PEER_MEMBER.displayName);
    await expect(members.getByTestId(`space-member-${PEER_MEMBER.login}`)).toContainText("Developer");
    const link = members.getByTestId(`space-members-link-${TEAM_KEY}`);
    await expect(link).toHaveText("Members change on Stand-in Git host");
    await expect(link).toHaveAttribute("href", `${host.url}/${TEAM_KEY}/-/project_members`);
    await scanVocabulary(page, "members", words);

    // No visible text on the surface names Git's sides or calls the
    // host's things by another word (space-27).
    expect(words, words.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// space-42: exploring
// ---------------------------------------------------------------------------

test.describe("exploring", () => {
  // The demo project's spex repository synced once to a bare path, so
  // its session's files are committed and read "Shared".
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
    await showGroups(page);
    await openRepository(page, key);
    await page.getByTestId("space-tab-explore").click();
    const explore = page.getByTestId("space-explore-tab");
    const tree = explore.getByRole("tree", { name: "Files in demo-project-spex" });
    await expect(tree).toBeVisible();
    // The tree is the repository's clone (space-23).
    await expect(explore).toContainText(join("workspace", ...key.split("/")));

    // The session's files group under one node titled by its first
    // turn: the manifest Shared, the hints Stays here, the records
    // offering Open session (space-23).
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
    await expect(intents).not.toContainText("Stays here");
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
    await showGroups(page);
    await openRepository(page, key);
    await page.getByTestId("space-tab-explore").click();
    await expect(page.getByTestId("space-privacy-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.getByTestId("space-privacy-toggle").click();

    // The served page offers Copy path beside the repository and no
    // reveal control, and acknowledges the copy in words (space-26).
    await expect(page.getByRole("button", { name: /Show in (Finder|folder)/ })).toHaveCount(0);
    const copy = page.getByTestId("space-clone-path-copy");
    await expect(copy).toHaveAccessibleName("Copy path");
    await copy.click();
    await expect(page.getByTestId("space-repository-header")).toContainText("Copied");
    await expect(page.getByTestId("space-live")).toHaveText(`Copied ${clone}`);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(clone);
    await expect(page.getByTestId("space-repository-header")).not.toContainText("Copied");
  });
});

// ---------------------------------------------------------------------------
// space-43, space-44: the surface at its fullest
// ---------------------------------------------------------------------------

/**
 * Local changes of every kind on top of the two-laptop arrangement, and
 * a sync ended in choices: the surface at its fullest (space-43,
 * space-44) — a session of this device's own, queued intents, an
 * authoring session, the environment's requests, the code remote, the
 * sync rules and a stray file, beside the Settings and session choices.
 */
async function arrangeChoices(app: App): Promise<void> {
  await arrangeHostPeer(app);
  const projectId = app.projectId!;
  const clone = clonePath(app.dataDir, projectId);
  const own = await app.core.command("session.create", { projectId });
  await runTurn(app, own.id, "Retire the legacy sessions");
  for (const text of ["Add a README badge", "Tighten the expiry tests", "Retire the legacy sessions"]) {
    await app.core.command("intent.queue", { projectId, text });
  }
  await app.core.command("draft.create", { projectId, draftId: "triage" });
  appendFileSync(join(clone, "spex.yaml"), "# requested for the team\n");
  const code = JSON.parse(readFileSync(join(clone, "project.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(clone, "project.json"), `${JSON.stringify({ ...code, remote: "git@example.com:acme/demo-project.git" }, null, 2)}\n`);
  appendFileSync(join(clone, ".gitignore"), "# authored\n/scratch/\n");
  writeFileSync(join(clone, "notes.txt"), "a stray note\n");
  const state = await app.settleSpace("space.sync", { repository: projectId });
  if (state.sync.phase !== "choices") {
    throw new Error(`the arranged sync ended ${JSON.stringify(state.sync)}`);
  }
}

test.describe("fit", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  test("space-43: the groups list and the Sync and Explore tabs fit at every width, in both sidebar states", async ({
    page,
    app,
  }) => {
    test.setTimeout(300_000);
    await arrangeChoices(app);
    page.on("pageerror", (error) => console.log(`[groups fit] page error: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: TALL });
    await open(page, app);
    await showGroups(page);
    await openRepository(page, TEAM_KEY);
    const tab = page.getByTestId("space-sync-tab");
    await expect(tab.getByTestId("space-picker")).toContainText("Choose for 2 conflicts");
    // Every kind of local change stands listed (space-7).
    const local = tab.getByTestId("space-local-list");
    for (const kind of ["Sessions", "Intents", "Authoring", "Environment", "Code", "Sync rules", "Other"]) {
      await expect(local.getByRole("heading", { name: kind, exact: true })).toBeVisible();
    }
    // A diff open in the picker, so the diff canvas is measured too.
    const settingsGroup = tab.getByRole("radiogroup", { name: "Settings changed" });
    await settingsGroup.getByRole("button", { name: "View diff" }).first().click();
    await expect(tab.getByTestId("space-diff-mine-config/playbook.config.yaml")).toContainText("This device against");

    const defects: string[] = [];
    const containers = [
      '[data-testid="space-header"]',
      '[data-testid="space-groups"] h2',
      '[data-testid^="space-row-"]',
      '[data-testid^="space-unit-"]',
      '[data-testid="space-picker"]',
      '[role="radiogroup"]',
      '[data-testid="space-repository-header"]',
    ];
    const views: { name: string; show: () => Promise<void>; ready: () => Promise<void> }[] = [
      {
        name: "Sync",
        show: () => page.getByTestId("space-tab-sync").click(),
        ready: async () => {
          await expect(tab.getByTestId("space-picker")).toBeVisible();
          await expect(page.getByTestId(`space-repo-${TEAM_KEY}`)).toBeVisible();
        },
      },
      {
        name: "Explore",
        show: async () => {
          await page.getByTestId("space-tab-explore").click();
          const tree = page.getByRole("tree", { name: "Files in demo-project-spex" });
          await tree.getByTestId("space-node-sessions").click();
          await tree.getByTestId(`space-node-session:${app.sessionId}`).click();
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
            const where = `Groups ${view.name} · sidebar ${railOpen ? "open" : "collapsed"} · ${width}×${height}`;
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

test.describe("accessibility", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  for (const theme of ["light", "dark"] as const) {
    test(`space-44: no serious or critical violation with the picker standing (${theme})`, async ({
      page,
      app,
    }) => {
      test.setTimeout(120_000);
      await arrangeChoices(app);
      await page.emulateMedia({ colorScheme: theme });
      await open(page, app);
      await showGroups(page);
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

      // The groups list, each group and each repository's row are
      // named (space-1).
      await expect(page.getByRole("region", { name: "Your groups" })).toBeVisible();
      await expect(page.getByRole("group", { name: HOST_GROUP, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "demo-project-spex", exact: true })).toHaveAttribute("aria-expanded", "false");
      found.push(...(await scan("Groups · list")));
      await openRepository(page, TEAM_KEY);

      // The picker's radio groups and the tabs are named (space-17).
      const tab = page.getByTestId("space-sync-tab");
      await expect(tab.getByTestId("space-picker")).toBeVisible();
      await expect(tab.getByRole("radiogroup", { name: SESSION_TITLE })).toBeVisible();
      await expect(tab.getByRole("radiogroup", { name: "Settings changed" })).toBeVisible();
      await expect(page.getByRole("tablist", { name: "Views of demo-project-spex" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Sync" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: "Explore" })).toBeVisible();
      found.push(...(await scan("Groups · Sync")));

      // The tree is named (space-23).
      await page.getByTestId("space-tab-explore").click();
      const tree = page.getByRole("tree", { name: "Files in demo-project-spex" });
      await expect(tree).toBeVisible();
      await tree.getByTestId("space-node-sessions").click();
      await tree.getByTestId(`space-node-session:${app.sessionId}`).click();
      await tree.getByTestId(`space-node-sessions/${app.sessionId}.json`).click();
      await expect(page.getByTestId("space-preview-text")).toBeVisible();
      found.push(...(await scan("Groups · Explore")));

      expect(found, found.join("\n")).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// space-36: a second device joins a project a peer pushed
// ---------------------------------------------------------------------------

test.describe("second device", () => {
  test.use({ appOptions: { host: true } });

  test("space-36: after sign-in a peer's project lists to Join; Join clones it and its code; a session synced lands beside the peer's", async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    const host = app.host!;
    const { key, code } = await seedHostProject(app);
    const peerSession = app.sessionId!;
    const folder = join(app.home, "work", "demo-project");
    await open(page, app);
    await showGroups(page);
    await signInThroughPage(page, app);

    // After sign-in the group's row lists the project as "Not on this
    // device" with Join (space-61).
    const groupRows = page.getByTestId(`space-group-${HOST_GROUP}`);
    await expect(groupRows.getByTestId(`space-row-${key}`)).toHaveAttribute("data-state", "absent");
    await expect(page.getByTestId(`space-repo-state-${key}`)).toHaveText("Not on this device");
    const join_ = page.getByTestId(`space-row-join-${key}`);
    await expect(join_).toHaveText("Join");

    // Join clones the spex repository and, the code remote a path this
    // machine serves, the code into the folder the page names; the row
    // reads reachable and the project lists in the sidebar with the
    // peer's session and intent (space-63, space-20).
    await join_.click();
    const editor = page.getByTestId(`space-join-${key}`);
    await expect(editor).toContainText("Folder for its code on this device");
    await editor.getByTestId(`space-join-${key}-path`).fill(folder);
    await editor.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page.getByTestId(`space-row-${key}`)).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    await expect(page.getByTestId(`space-repo-state-${key}`)).toHaveText(/^(Synced just now|Never synced)$/);
    expect(existsSync(join(clonePath(app.dataDir, key), "project.json"))).toBe(true);
    expect(existsSync(join(folder, "README.md"))).toBe(true);
    expect(git(folder, "remote", "get-url", "origin")).toBe(code);
    // The joined project lists in the sidebar with no reload.
    const tree = page.getByRole("tree", { name: "Projects and sessions" });
    await expect(tree.getByRole("treeitem", { name: "demo-project", exact: true })).toBeVisible();
    await tree.getByRole("treeitem", { name: "demo-project", exact: true }).click();
    await expect(tree.getByRole("treeitem", { name: new RegExp(PEER_SESSION_TITLE, "i") })).toBeVisible();
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByText("Queued on the other laptop")).toBeVisible();

    // A session run here and synced lands on the stand-in's `spex`
    // beside the peer's (space-12); the repository's other member makes
    // its first push say what goes there (space-57).
    await page.getByRole("tab", { name: "Start another session" }).click();
    await send(page, "Fix the token refresh in auth.ts");
    await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
    await settled(app);
    await showGroups(page);
    await openRepository(page, key);
    const local = page.getByTestId("space-local-list");
    const sessionRow = local.locator('[data-testid^="space-unit-mine-sessions/"]');
    await expect(sessionRow).toContainText("Fix the token refresh in auth.ts");
    const ownSession = (await sessionRow.getAttribute("data-testid"))!.replace("space-unit-mine-sessions/", "");
    await page.getByTestId(`space-row-sync-${key}`).click();
    const notice = page.getByTestId("space-notice-confirm");
    await expect(notice).toContainText("Every session goes there whole — hidden parts and attachments included");
    await notice.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByTestId("space-done-line")).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    const tracked = git(bareOf(host, key), "ls-tree", "-r", "--name-only", "spex").split("\n");
    expect(tracked).toContain(`sessions/${ownSession}.json`);
    expect(tracked).toContain(`sessions/${peerSession}.json`);
  });
});

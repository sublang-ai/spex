// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Groups surface's journeys (DR-103; DR-057 named it Space),
// against the stand-in Git host (git-host-12): the first start and the
// first sign-in by the device flow the served shell runs (space-40);
// the daily sync with conflicts chosen by keyboard, a host that moves
// under the push, Stop against a sleeping transport and the members
// (space-41); the explorer with its privacy panel and Copy path
// (space-42); fit at every width in both sidebar states (space-43);
// axe in both themes (space-44); a second device joining a project a
// peer pushed (space-36); a folder picking a team's project, which
// says the sharing notice first (space-81); the organizer creating
// groups, picking a project into one and sharing them (space-71); the
// surface naming
// nothing behind the instance, in English and in Chinese (space-75);
// undo in Spex — a group renamed and deleted, a project moved, each
// refusal in place (space-80); a second instance signed in from the
// list's foot, a project picked into it and pushed there, the first
// signed out, refused Forget and signed in again, "Place at…" and
// "Leave…" open at the floor (space-85); a
// folder added while signed in at two instances, paired at the second
// (projects-17); a project placed at a second instance through the
// page, a second home joining it and attaching that placement from its
// file, each home's session reaching both (space-96); and over three
// instances, your own group's later placements continued, a project
// placed at the third from the choice of two, then left placement by
// placement until it stands on this device only (space-88, space-89,
// space-98, space-4, space-57, storage-38).
// Every host is the in-process stand-in on
// loopback, every peer plain Git on its bare repositories, and the
// exploring journey's remote a bare path: hermetic, no network, no
// credential of the machine's.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { STANDIN_STORAGE, seedDemoProject } from "@sublang/spex-core/testing";

import {
  HOST_GROUP,
  HOST_LOGIN,
  LOCAL_MODEL,
  LOCAL_PROJECT_CONFIG,
  LOCAL_TURN,
  PEER_MEMBER,
  PEER_SESSION_TITLE,
  PEER_TURN,
  SECOND_HOST_NAME,
  SESSION_TITLE,
  THIRD_HOST_NAME,
  arrangeHostPeer,
  bareOf,
  clonePath,
  expect,
  git,
  hostFolder,
  hostKey,
  instanceOf,
  instanceSection,
  nav,
  open,
  pickGroup,
  placementLine,
  placementOf,
  registerLocalProject,
  repositoryOf,
  runTurn,
  seedHostProject,
  send,
  settled,
  signInCore,
  signInThroughPage,
  startApp,
  surfaceEntry,
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

/** Note any forbidden word in the surface's visible text (space-27), or
 * any of the journey's own `words`. It reads the Groups surface alone:
 * space-27 governs the copy on the surface, so the Projects tree, the
 * Captain home and a session's transcript a journey also shows are
 * other surfaces' words, which no space item governs. */
async function scanVocabulary(page: Page, where: string, found: string[], words: RegExp = FORBIDDEN_WORDS): Promise<void> {
  const text = await page.getByTestId("space-surface").innerText();
  const hit = words.exec(text);
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

/** How a picker reads each of the stand-in's entries (space-58,
 * space-78): as the list reads them, your namespace by your login, a
 * group by its name, then its path after the separator where the two
 * differ (space-1). */
const PICKED_AS: Record<string, string> = {
  [HOST_LOGIN]: HOST_LOGIN,
  [HOST_GROUP]: `Acme · ${HOST_GROUP}`,
  [`${HOST_GROUP}/research`]: `Research · ${HOST_GROUP}/research`,
};

/** An entry's key in a picker's test ids: your namespace by `@` and
 * your login, which begins no path the host answers, a group by its
 * path (DR-127). */
const entryKey = (entry: string): string => (entry === HOST_LOGIN ? `@${HOST_LOGIN}` : entry);

/** A group picker's section for an instance (space-58): what it offers
 * there, under the instance's display name — the first stand-in's
 * unless another is named. */
async function pickSection(picker: Locator, host: { url: string }, name = "Stand-in Git host"): Promise<Locator> {
  const section = picker.getByTestId(`space-pick-instance-${host.url}`);
  await expect(section.getByRole("heading", { level: 3 })).toHaveText(name);
  return section;
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

/** The demo project's spex repository once picked into the team group:
 * its path in the instance, its key under the stand-in's folder
 * (DR-127). */
const TEAM_PATH = `${HOST_GROUP}/demo-project-spex`;
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
    const TEAM_KEY = hostKey(host, TEAM_PATH);
    await open(page, app);
    await showGroups(page);
    const header = page.getByTestId("space-header");

    // Not signed in: the header is one card saying what signing in
    // brings, its "Instance" field holding the stand-in's origin, Sign in
    // its one primary control, with no home path, read time or Refresh;
    // your own group stands alone beneath, called so, its row with no
    // control (space-1, space-3).
    await expect(header.getByTestId("space-signin-card").getByRole("heading", { level: 2 })).toHaveText("Not signed in");
    await expect(header.getByTestId("space-signin-body")).toHaveText(
      "Sign in to see your groups and share each project's records with the people in them." +
        "Until you do, everything stays on this device and nothing is contacted.",
    );
    await expect(header.getByRole("textbox", { name: "Instance" })).toHaveValue(host.url);
    await expect(header.getByTestId("space-signin-instance")).toBeEditable();
    await expect(header.getByTestId("space-signin")).toHaveText("Sign in");
    await expect(header.locator("button.bg-brand-600")).toHaveCount(1);
    await expect(header.locator("button.bg-brand-600")).toHaveAttribute("data-testid", "space-signin");
    await expect(header.getByRole("button")).toHaveCount(1);
    await expect(header).not.toContainText("/");
    await expect(page.getByTestId("space-refresh")).toHaveCount(0);
    await expect(page.getByTestId("space-read-at")).toHaveCount(0);
    await expect(page.getByTestId("space-home")).toHaveCount(0);
    const groups = page.getByTestId("space-groups");
    await expect(groups.locator('[data-testid^="space-instance-"]')).toHaveCount(0);
    await expect(groups.locator('[data-testid^="space-group-"]')).toHaveCount(0);
    const own = groups.getByRole("group", { name: "Your own group" });
    await expect(own).toHaveAttribute("data-testid", "space-own");
    await expect(own.getByRole("heading", { level: 2 })).toHaveText("Your own group · named after your login at sign-in");
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
    await page.getByTestId("sidebar").getByRole("button", { name: "Add a local project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    await expect(palette).toBeHidden();
    await showGroups(page);
    const localKey = "e2e/demo-project-spex";
    await expect(page.getByTestId(`space-row-${localKey}`)).toBeVisible();
    await expect(page.getByTestId(`space-repo-state-${localKey}`)).toHaveText("On this device only");
    await expect(page.getByTestId(`space-row-${localKey}`).locator('button:not([data-testid^="space-repo-"])')).toHaveCount(0);

    // Sign in links the page that carries the code, named by its host
    // name, and shows no code, reading "Signing in…" until the stand-in
    // approves; then the instance's heading reads the account with Sign
    // out and the header Refresh, your own group bears its login, your
    // namespace stands under the instance, and the surface ends in where
    // this device's files are (space-3, space-4, space-1).
    await header.getByTestId("space-signin").click();
    await expect(header.getByTestId("space-signin-link")).toHaveText(`Open ${new URL(host.url).hostname} to sign in`);
    await expect(header.getByTestId("space-signin-body")).toContainText("Sign in there and approve; you return here signed in.");
    await expect(page.getByTestId("space-surface").getByRole("button", { name: /^Sign/ })).toHaveCount(1);
    await header.getByTestId("space-signin-cancel").click();
    await expect(header.getByTestId("space-signin")).toHaveText("Sign in");
    await signInThroughPage(page, app);
    const instance = groups.getByTestId(`space-instance-${host.url}`);
    await expect(instance).toHaveAttribute("aria-label", "Stand-in Git host");
    await expect(instance.getByRole("heading", { level: 2 })).toHaveText(`Stand-in Git host · Signed in as @${HOST_LOGIN}`);
    await expect(instance.getByTestId("space-signout")).toHaveText("Sign out");
    await expect(header.getByTestId("space-signin-card")).toHaveCount(0);
    await expect(header.getByTestId("space-signout")).toHaveCount(0);
    await expect(header.getByTestId("space-refresh")).toHaveText("Refresh");
    await expect(header.getByTestId("space-refresh")).toHaveAttribute("title", "Reads each signed-in instance again");
    await expect(page.getByTestId("space-home")).toHaveText(/^Spex keeps this device's files in /);
    await expect(page.getByTestId("space-home")).toHaveAttribute("title", app.dataDir);
    await expect(own.getByRole("heading", { level: 2 })).toHaveText(`Your own group · ${HOST_LOGIN}`);
    await expect(instance.getByTestId(`space-group-@${HOST_LOGIN}`)).toBeVisible();
    await expect(instance.getByTestId(`space-group-@${HOST_LOGIN}`).getByRole("heading", { level: 3 })).toHaveText(HOST_LOGIN);
    await expect(page.getByTestId(`space-repo-${OWN_KEY}`)).toHaveAccessibleName(`${HOST_LOGIN}-spex`);
    const projectKey = `${HOST_LOGIN}/demo-project-spex`;
    await expect(page.getByTestId(`space-repo-state-${projectKey}`)).toHaveText("On this device only");
    // Your own group's spex repository stands on the host, pushed.
    await expect.poll(() => host.script.repositories.map((repo) => `${repo.group.fullPath}/${repo.path}`)).toContain(OWN_KEY);
    await expect.poll(() => headOf(bareOf(host, OWN_KEY), "spex"), { timeout: 30_000 }).toMatch(/^[0-9a-f]{40}$/);

    // Pick a group offers, under the stand-in's display name, your
    // namespace by your login and its groups, each by its name and its
    // path; picking the team's turns the row reachable with a sync time,
    // the stand-in holding `<name>-spex` on its `spex` branch (space-58,
    // space-12).
    await page.getByTestId(`space-row-pick-${projectKey}`).click();
    const picker = page.getByTestId(`space-picker-${projectKey}`);
    await expect(picker).toBeVisible();
    await expect(picker.locator('[data-testid^="space-pick-instance-"]')).toHaveCount(1);
    const section = await pickSection(picker, host);
    for (const group of [HOST_LOGIN, HOST_GROUP, `${HOST_GROUP}/research`]) {
      await expect(section.getByTestId(`space-pick-group-${entryKey(group)}`)).toHaveText(PICKED_AS[group]!);
    }
    await expect(picker.getByTestId(`space-pick-name-${projectKey}`)).toHaveValue("demo-project");
    await section.getByTestId(`space-pick-group-${HOST_GROUP}`).click();
    await expect(page.getByTestId(`space-repo-state-${TEAM_KEY}`)).toHaveText("Synced just now", { timeout: 30_000 });
    await expect(page.getByTestId(`space-row-${TEAM_KEY}`)).toHaveAttribute("data-state", "reachable");
    // Beneath the row, its one placement's line names the stand-in by its
    // display name and the repository's path there, and says what the
    // sync did there (space-87, space-12).
    const line = page.getByTestId(`space-row-${TEAM_KEY}`).getByTestId(`space-line-${host.url}`);
    await expect(line).toHaveAttribute("data-state", "reachable");
    await expect(line.getByTestId("space-line-instance")).toHaveText("Stand-in Git host");
    await expect(line.getByTestId("space-line-at")).toHaveText(TEAM_PATH);
    await expect(line.getByTestId("space-line-state")).toHaveText(/^Synced just now/);
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
    expect(tracked).toContain(`sessions/${sessionId}.replay.json`);
    expect(tracked.some((path) => path.endsWith(".hints.json") || path.startsWith("local/"))).toBe(false);

    // An intent queued while Groups is shown lists under local changes
    // with Refresh never activated — the ledger's announcement re-reads
    // the state — and the instance's heading reads the time of the read
    // Refresh begins (space-2, space-7, space-1).
    await app.core.command("intent.queue", { projectId: TEAM_KEY, text: "Queued while Groups is shown" });
    const intentRow = local.locator('[data-testid^="space-unit-mine-intents/"]');
    await expect(intentRow).toHaveCount(1);
    await expect(intentRow).toContainText("Queued while Groups is shown");
    await expect(intentRow).toHaveAttribute("data-change", "new");
    await header.getByTestId("space-refresh").click();
    await expect(instance.getByTestId("space-read-at")).toHaveText("Read just now");
    await expect(instance.getByTestId("space-read-at")).toHaveAttribute("title", /\d/);
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
    const TEAM_KEY = hostKey(host, TEAM_PATH);
    seedDemoProject(app.projectDir);
    await open(page, app);

    // The folder pairs with a spex repository through the picker of
    // matching spex repositories and groups, standing in the palette
    // in place of its list (projects-1, space-58).
    await page.getByTestId("sidebar").getByRole("button", { name: "Add a local project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    const localKey = `${HOST_LOGIN}/demo-project-spex`;
    const picker = palette.getByTestId(`space-picker-${localKey}`);
    await expect(picker).toBeVisible();
    await expect(palette.getByTestId("palette-path")).toHaveCount(0);
    const section = await pickSection(picker, host);
    for (const group of [HOST_LOGIN, HOST_GROUP, `${HOST_GROUP}/research`]) {
      await expect(section.getByTestId(`space-pick-group-${entryKey(group)}`)).toHaveText(PICKED_AS[group]!);
    }
    await expect(picker.getByTestId(`space-pick-name-${localKey}`)).toHaveValue("demo-project");

    // Picking the team's group creates `<name>-spex` there and pushes;
    // the palette closes, and the row is reachable in that group with
    // the project followed to its key (space-58, space-60).
    await section.getByTestId(`space-pick-group-${HOST_GROUP}`).click();
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
// projects-17, projects-1, space-58: a folder added at two instances
// ---------------------------------------------------------------------------

test.describe("a folder added while signed in at two instances", () => {
  // A second stand-in on a Git backend of its own, holding its own
  // `acme` (git-host-12, DR-127).
  test.use({ appOptions: { host: { second: { backend: "separate" } }, signedIn: true } });

  test("projects-17, projects-1, space-58: the palette's picker offers the acme of each instance, and picking the second's pairs the folder with a spex repository the second lists and the first does not", async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    const first = app.hosts[0]!;
    const second = app.hosts[1]!;
    // Signed in at both instances (arrange only).
    await signInCore(app, second);
    seedDemoProject(app.projectDir);
    await open(page, app);

    // The palette's Add asks in place, under each signed-in instance's
    // display name, each offering its own `acme` (projects-1, space-58).
    await page.getByTestId("sidebar").getByRole("button", { name: "Add a local project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    const localKey = `${HOST_LOGIN}/demo-project-spex`;
    const picker = palette.getByTestId(`space-picker-${localKey}`);
    await expect(picker).toBeVisible();
    await expect(picker.locator('[data-testid^="space-pick-instance-"]')).toHaveCount(2);
    const firstPick = await pickSection(picker, first);
    const secondPick = await pickSection(picker, second, SECOND_HOST_NAME);
    for (const section of [firstPick, secondPick]) {
      await expect(section.getByTestId(`space-pick-group-${HOST_GROUP}`)).toHaveText(PICKED_AS[HOST_GROUP]!);
    }

    // Picking the second's creates `<name>-spex` at the second and pairs
    // the folder with it: the second lists it, the first does not, and
    // the project follows it to its key under the second's folder
    // (projects-17, space-58).
    await secondPick.getByTestId(`space-pick-group-${HOST_GROUP}`).click();
    await expect(palette).toBeHidden();
    const SECOND_KEY = hostKey(second, TEAM_PATH);
    await expect
      .poll(async () => (await app.core.command("project.list", {})).map((project) => [project.id, project.path]), { timeout: 30_000 })
      .toEqual([[SECOND_KEY, app.projectDir]]);
    const listedBy = (host: App["hosts"][number]) => host.script.repositories.map((repo) => `${repo.group.fullPath}/${repo.path}`);
    expect(listedBy(second)).toContain(TEAM_PATH);
    expect(listedBy(first)).not.toContain(TEAM_PATH);
    await showGroups(page);
    const row = instanceSection(page, second).getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${SECOND_KEY}`);
    await expect(row).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    await expect(row.getByTestId(`space-repo-state-${SECOND_KEY}`)).toHaveText("Synced just now", { timeout: 30_000 });
    await expect(instanceSection(page, first).getByTestId(`space-row-${SECOND_KEY}`)).toHaveCount(0);
    expect(headOf(bareOf(second, SECOND_KEY), "spex")).toBe(git(clonePath(app.dataDir, SECOND_KEY), "rev-parse", "spex"));
  });
});

// ---------------------------------------------------------------------------
// space-81: a pick joining a team's project says the sharing notice first
// ---------------------------------------------------------------------------

test.describe("a folder joining a team's project", () => {
  test.use({ appOptions: { host: true, signedIn: true } });

  for (const unknown of [false, true]) {
    test(`space-81: a pick joining a team's project ${unknown ? "whose members' count is unknown" : "with another member"} says the sharing notice in the picker, and Continue joins it`, async ({
      page,
      app,
    }) => {
      test.setTimeout(120_000);
      const host = app.host!;
      // The team's project a peer pushed, `bob` its member beside the
      // account, its `project.json` as the peer's Spex writes it; this
      // device's folder holds the same code, added while signed in, so
      // its spex repository is on this device only and the two agree
      // on that file.
      const { key, code } = await seedHostProject(app);
      await app.peerPush((dir) => writeFileSync(join(dir, "project.json"), JSON.stringify({ format: 1, name: "demo-project", remote: code })));
      git(dirname(app.projectDir), "clone", "-q", code, app.projectDir);
      // With every members route failing, the host's read holds no count.
      if (unknown) host.script.failMembers(true);
      const before = instanceOf(await app.core.command("space.get", {}), host.url)?.readAt ?? 0;
      const fromRead = app.core.mark();
      await app.core.command("space.refresh", {});
      await app.core.waitSpace(fromRead, (state) => (instanceOf(state, host.url)?.readAt ?? 0) > before, 30_000);
      const localKey = (await app.core.command("project.register", { path: app.projectDir })).id;
      expect(localKey).toBe(`${HOST_LOGIN}/demo-project-spex`);
      await open(page, app);
      await showGroups(page);
      await expect(page.getByTestId(`space-repo-state-${localKey}`)).toHaveText("On this device only");

      // Pick a group lists the team's project for the same code, with
      // its group read as its heading reads and its members' count
      // where the host read one (space-58).
      await page.getByTestId(`space-row-pick-${localKey}`).click();
      const picker = page.getByTestId(`space-picker-${localKey}`);
      const section = await pickSection(picker, host);
      const listed = section.getByTestId(`space-pick-repo-${key}`);
      await expect(listed).toContainText("demo-project-spex");
      await expect(section.getByTestId(`space-pick-listed-group-${key}`)).toHaveText(PICKED_AS[HOST_GROUP]!);
      if (unknown) await expect(listed).not.toContainText("member");
      else await expect(listed).toContainText("2 members");

      // Picking it says the notice in the picker, beneath it, Cancel
      // focused; Escape closes the notice alone and sends nothing, focus
      // back on the repository (space-57).
      await listed.click();
      const notice = picker.getByTestId(`space-pick-notice-${localKey}`);
      await expect(notice).toContainText("Every session goes there whole — hidden parts and attachments included");
      await expect(notice).toContainText("nothing recalls what others downloaded");
      await expect(notice.getByRole("button", { name: "Cancel" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(notice).toHaveCount(0);
      await expect(picker).toBeVisible();
      await expect(listed).toBeFocused();
      expect(repositoryOf(await app.core.command("space.get", {}), localKey).state).toBe("local-only");

      // Continue joins it: the picker closes, the project's row stands
      // reachable in the team's group with the notice recorded, and the
      // peer's records are in the clone, which the stand-in holds
      // (space-57, space-58, space-13).
      await listed.click();
      await notice.getByRole("button", { name: "Continue" }).click();
      await expect(picker).toHaveCount(0);
      const row = page.getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${key}`);
      await expect(row).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
      await expect(page.getByTestId(`space-repo-state-${key}`)).toHaveText(/^Synced (just now|\d+m ago)$/, { timeout: 30_000 });
      const joined = repositoryOf(await app.core.command("space.get", {}), key);
      expect(placementOf(joined, host.url).noticed).toBe(true);
      expect(joined.folder).toBe(app.projectDir);
      const clone = clonePath(app.dataDir, key);
      expect(git(clone, "rev-parse", "spex")).toBe(git(bareOf(host, key), "rev-parse", "spex"));
      expect(git(clone, "ls-tree", "-r", "--name-only", "spex").split("\n")).toContain(`sessions/${app.sessionId}.json`);
    });
  }
});

// ---------------------------------------------------------------------------
// space-71: the organizer's groups and members
// ---------------------------------------------------------------------------

test.describe("organizing", () => {
  test.use({ appOptions: { host: true, signedIn: true } });

  test("space-71: a group at the head and a subgroup in acme, a member added, refused twice and removed", async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    const host = app.host!;
    // By default the stand-in lets the person create groups at the
    // instance's root, and subgroups and members in `acme`, whose `can`
    // it leaves unset (git-host-12): what the sign-in's read already said.
    expect(host.script.canCreateGroup).toBe(true);
    const MEMBER = host.script.accounts.find((account) => account.login === "grace")!;
    const UNKNOWN = "zed";
    expect(host.script.accounts.some((account) => account.login === UNKNOWN)).toBe(false);
    const standinGroup = (fullPath: string) => host.script.groups.find((group) => group.fullPath === fullPath);
    const standinMembers = (fullPath: string) => (standinGroup(fullPath)?.members ?? []).map((m) => `${m.login}:${m.role}`);

    await open(page, app);
    await showGroups(page);
    const list = page.getByTestId("space-groups");

    // "New group" stands on the instance's heading; Create names the
    // group, which stands with its full path as the editor closes
    // (space-1, space-68).
    const newGroup = list.getByTestId(`space-instance-${host.url}`).getByTestId("space-instance-heading").getByTestId("space-new-group");
    await expect(newGroup).toHaveText("New group");
    await newGroup.click();
    const top = list.getByTestId("space-new-group-editor");
    await expect(top).toContainText("Group name");
    await top.getByTestId("space-new-group-editor-name").fill("Platform");
    await top.getByTestId("space-new-group-editor-create").click();
    await expect(top).toBeHidden();
    const platform = list.getByTestId("space-group-platform");
    await expect(platform.getByRole("heading")).toContainText("Platform");
    await expect(platform.getByRole("heading")).toContainText("platform");
    expect(standinGroup("platform")?.name).toBe("Platform");

    // "New subgroup" on `acme`'s heading creates inside it, the subgroup
    // listed under its full path (space-1, space-68).
    await list.getByTestId(`space-group-subgroup-${HOST_GROUP}`).click();
    const sub = list.getByTestId(`space-subgroup-${HOST_GROUP}`);
    await expect(sub).toContainText("Group name");
    await sub.getByTestId(`space-subgroup-${HOST_GROUP}-name`).fill("Design Team");
    await sub.getByTestId(`space-subgroup-${HOST_GROUP}-create`).click();
    await expect(sub).toBeHidden();
    const SUBGROUP = `${HOST_GROUP}/design-team`;
    const design = list.getByTestId(`space-group-${SUBGROUP}`);
    await expect(design.getByRole("heading")).toContainText("Design Team");
    await expect(design.getByRole("heading")).toContainText(SUBGROUP);
    expect(standinGroup(SUBGROUP)?.name).toBe("Design Team");

    // A project added from the palette is offered, under the stand-in's
    // display name, your login and then every group by its name, its
    // path after it where the two differ, and picked into the new
    // subgroup: `<name>-spex` stands there on the stand-in's `spex`
    // (space-58).
    seedDemoProject(app.projectDir);
    await page.getByTestId("sidebar").getByRole("button", { name: "Add a local project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    const localKey = `${HOST_LOGIN}/demo-project-spex`;
    const picker = palette.getByTestId(`space-picker-${localKey}`);
    const section = await pickSection(picker, host);
    await expect(section.locator('[data-testid^="space-pick-group-"]')).toHaveText([
      PICKED_AS[HOST_LOGIN]!,
      PICKED_AS[HOST_GROUP]!,
      `Design Team · ${SUBGROUP}`,
      PICKED_AS[`${HOST_GROUP}/research`]!,
      "Platform · platform",
    ]);
    await section.getByTestId(`space-pick-group-${SUBGROUP}`).click();
    await expect(palette).toBeHidden();
    await showGroups(page);
    const picked = hostKey(host, `${SUBGROUP}/demo-project-spex`);
    await expect(design.getByTestId(`space-repo-state-${picked}`)).toHaveText("Synced just now", { timeout: 30_000 });
    expect(headOf(bareOf(host, picked), "spex")).toMatch(/^[0-9a-f]{40}$/);

    // Share on the subgroup stands in the members panel its heading's
    // Members opens, listing the person who created it (space-69).
    await design.getByTestId(`space-group-members-${SUBGROUP}`).click();
    const PANEL = `group:${SUBGROUP}`;
    const members = design.getByTestId(`space-members-${PANEL}`);
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toContainText("Owner");
    await expect(members.getByTestId(`space-member-${MEMBER.login}`)).toHaveCount(0);

    // Share adds a login at Maintainer: the line says so, the panel
    // lists the member the reply carries, and the stand-in holds them
    // (space-69).
    const hostName = new URL(host.url).hostname;
    const share = members.getByTestId(`space-share-${PANEL}`);
    await share.click();
    const editor = members.getByTestId(`space-share-${PANEL}-editor`);
    await expect(editor).toContainText(`Login at ${hostName}`);
    const login = editor.getByTestId(`space-share-${PANEL}-login`);
    await login.fill(MEMBER.login);
    await editor.getByTestId(`space-share-${PANEL}-role`).selectOption({ label: "Maintainer" });
    await editor.getByTestId(`space-share-${PANEL}-add`).click();
    await expect(editor).toBeHidden();
    await expect(members.getByTestId(`space-members-outcome-${PANEL}`)).toHaveText(`@${MEMBER.login} added as Maintainer`);
    const row = members.getByTestId(`space-member-${MEMBER.login}`);
    await expect(row).toContainText(MEMBER.displayName!);
    await expect(row).toContainText("Maintainer");
    expect(standinMembers(SUBGROUP)).toContain(`${MEMBER.login}:Maintainer`);

    // The same login again is refused in place with the stand-in's
    // words, the login kept (space-69).
    await share.click();
    await expect(editor).toBeVisible();
    await login.fill(MEMBER.login);
    await editor.getByTestId(`space-share-${PANEL}-add`).click();
    await expect(editor.getByRole("alert")).toContainText("Member already exists");
    await expect(login).toHaveValue(MEMBER.login);
    expect(standinMembers(SUBGROUP).filter((entry) => entry.startsWith(`${MEMBER.login}:`))).toHaveLength(1);

    // A login the stand-in knows no account for is refused naming it,
    // the login kept (space-69).
    await login.fill(UNKNOWN);
    await editor.getByTestId(`space-share-${PANEL}-add`).click();
    await expect(editor.getByRole("alert")).toContainText(`No account is named ${UNKNOWN}`);
    await expect(login).toHaveValue(UNKNOWN);
    await editor.getByTestId(`space-share-${PANEL}-cancel`).click();
    await expect(editor).toBeHidden();

    // The new controls fit at the 320-pixel floor with the sidebar
    // collapsed, the subgroup editor and Share open (space-28).
    await setRail(page, false);
    await page.setViewportSize({ width: 320, height: TALL });
    await list.getByTestId(`space-group-subgroup-${HOST_GROUP}`).click();
    await expect(sub).toBeVisible();
    await share.click();
    await expect(editor).toBeVisible();
    const defects: string[] = [];
    record(
      "Groups organizing · 320",
      await measure(page, ['[data-testid^="space-group-"]', '[data-testid="space-instance-heading"] > div']),
      defects,
    );
    expect(defects, defects.join("\n")).toEqual([]);
    await editor.getByTestId(`space-share-${PANEL}-cancel`).click();
    await sub.getByTestId(`space-subgroup-${HOST_GROUP}-cancel`).click();
    await page.setViewportSize({ width: 1280, height: TALL });

    // Remove asks with the inline confirm, Keep focused; Remove takes
    // the member out, the panel listing the reply's members and the
    // stand-in no longer holding them (space-72).
    await row.getByTestId(`space-member-remove-${MEMBER.login}`).click();
    const confirm = row.getByTestId(`space-member-confirm-${MEMBER.login}`);
    await expect(confirm.getByRole("button", { name: "Keep" })).toBeFocused();
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(members.getByTestId(`space-members-outcome-${PANEL}`)).toHaveText(`@${MEMBER.login} removed`);
    await expect(row).toHaveCount(0);
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toBeVisible();
    expect(standinMembers(SUBGROUP).some((entry) => entry.startsWith(`${MEMBER.login}:`))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// space-75: the instance alone, in both languages
// ---------------------------------------------------------------------------

test.describe("the instance alone", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  test("space-75: no link, no URL behind the instance and no Git system's name on Groups, in English and in Chinese", async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    const host = app.host!;
    const TEAM_KEY = hostKey(host, TEAM_PATH);
    // The project's records pushed into acme over the protocol, and a
    // spex repository another account shares from its own group: every
    // remote URL lies under the stand-in's Git origin (git-host-12).
    await pickGroup(app);
    host.script.addRepository({ group: "bob", name: "notes-spex", role: "Developer" });
    expect(git(clonePath(app.dataDir, TEAM_KEY), "remote", "get-url", hostFolder(host)).startsWith(`${host.gitOrigin}/${STANDIN_STORAGE}/`)).toBe(true);

    /** Every text, title, accessible name and link target on the surface
     * that names something behind the instance (space-1, space-62). */
    const leaks = async (): Promise<string[]> => {
      const surface = page.getByTestId("space-surface");
      const said = await surface.evaluate((root) => {
        const out = [(root as HTMLElement).innerText];
        for (const element of Array.from(root.querySelectorAll("*"))) {
          for (const name of ["title", "aria-label", "href", "src"]) {
            const value = element.getAttribute(name);
            if (value) out.push(value);
          }
        }
        return out;
      });
      return said.filter((text) => app.hosts.some((each) => text.includes(`${each.url}/`) || text.includes(each.storage)) || /gitlab/i.test(text));
    };
    const scan = async (where: string): Promise<void> => {
      const surface = page.getByTestId("space-surface");
      // bob's own group stands under his login, under the instance, its
      // heading carrying no control (space-1).
      const bob = surface.getByTestId(`space-instance-${host.url}`).getByTestId("space-group-@bob");
      await expect(bob.getByTestId(`space-row-${hostKey(host, "bob/notes-spex")}`)).toBeVisible();
      await expect(bob.getByTestId("space-group-members-bob")).toHaveCount(0);
      await expect(bob.getByTestId("space-group-subgroup-bob")).toHaveCount(0);
      // The project's placement's members panel, opened from its line,
      // links no page (space-62, space-87).
      const line = surface.getByTestId(`space-row-${TEAM_KEY}`).getByTestId(`space-line-${host.url}`);
      const members = line.getByTestId(`space-members-${TEAM_KEY}@${host.url}`);
      if (!(await members.isVisible())) await line.getByTestId("space-line-members").click();
      await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toBeVisible();
      await expect(surface.locator("a")).toHaveCount(0);
      expect(await leaks(), where).toEqual([]);
    };

    await open(page, app);
    await showGroups(page);
    await page.getByTestId("space-refresh").click();
    await expect(page.getByTestId("space-group-@bob")).toBeVisible();
    await scan("English");

    // Chinese, chosen in Settings: the same surface names nothing more
    // (localization-10).
    await surfaceEntry(page, "Settings").click();
    await page.getByTestId("language-section").getByTestId("language-select").selectOption("zh");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    await surfaceEntry(page, "Space").click();
    await expect(page.getByTestId("space-surface")).toBeVisible();
    await scan("Chinese");
  });
});

// ---------------------------------------------------------------------------
// space-80: undo in Spex
// ---------------------------------------------------------------------------

/** Every text, title, accessible name and link target on the Groups
 * surface that names something behind an instance (space-1): a URL
 * under any stand-in instance's own, its storage group, or the Git
 * system. */
async function surfaceLeaks(page: Page, hosts: App["hosts"]): Promise<string[]> {
  const said = await page.getByTestId("space-surface").evaluate((root) => {
    const out = [(root as HTMLElement).innerText];
    for (const element of Array.from(root.querySelectorAll("*"))) {
      for (const name of ["title", "aria-label", "href", "src"]) {
        const value = element.getAttribute(name);
        if (value) out.push(value);
      }
    }
    return out;
  });
  return said.filter((text) => hosts.some((host) => text.includes(`${host.url}/`) || text.includes(host.storage)) || /gitlab/i.test(text));
}

test.describe("undo", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  test("space-80: a group renamed, its deletion refused then done, the project moved and its clone moved by its Sync, each refusal in place, nothing behind the instance named", async ({
    page,
    app,
  }) => {
    test.setTimeout(180_000);
    const host = app.host!;
    const TEAM_KEY = hostKey(host, TEAM_PATH);
    // The project's records pushed into acme over the protocol.
    await pickGroup(app);
    const standinGroup = (fullPath: string) => host.script.groups.find((group) => group.fullPath === fullPath);
    /** No link, and nothing behind the instance, on the surface now. */
    const clean = async (where: string): Promise<void> => {
      await expect(page.getByTestId("space-surface").locator("a")).toHaveCount(0);
      expect(await surfaceLeaks(page, app.hosts), where).toEqual([]);
    };

    await open(page, app);
    await showGroups(page);
    const list = page.getByTestId("space-groups");

    // A group made from the instance's heading (space-68).
    await list.getByTestId("space-new-group").click();
    const top = list.getByTestId("space-new-group-editor");
    await top.getByTestId("space-new-group-editor-name").fill("Platform");
    await top.getByTestId("space-new-group-editor-create").click();
    await expect(top).toBeHidden();
    const platform = list.getByTestId("space-group-platform");
    await expect(platform.getByRole("heading")).toContainText("Platform");

    // Rename opens the editor holding its name and path; a rename the
    // stand-in refuses stands in the editor with its words and the name
    // kept, and the next one renames it (space-76).
    host.script.refuseGroupRename("Renames are paused for this group.");
    await platform.getByTestId("space-group-rename-platform").click();
    const editor = platform.getByTestId("space-rename-platform");
    const name = editor.getByTestId("space-rename-platform-name");
    const path = editor.getByTestId("space-rename-platform-path");
    await expect(name).toHaveValue("Platform");
    await expect(path).toHaveValue("platform");
    await name.fill("Core Platform");
    await path.fill("core-platform");
    await clean("the rename editor");
    await editor.getByTestId("space-rename-platform-save").click();
    await expect(editor.getByRole("alert")).toContainText("Renames are paused for this group.");
    await expect(name).toHaveValue("Core Platform");
    host.script.refuseGroupRename(null);
    await editor.getByTestId("space-rename-platform-save").click();
    const renamed = list.getByTestId("space-group-core-platform");
    await expect(renamed.getByRole("heading")).toContainText("Core Platform");
    await expect(renamed.getByRole("heading")).toContainText("core-platform");
    await expect(list.getByTestId("space-group-platform")).toHaveCount(0);
    expect(standinGroup("core-platform")?.name).toBe("Core Platform");

    // acme, holding the project, carries no Delete; the renamed group's
    // asks with Keep focused, a deletion the stand-in refuses stands
    // beneath its heading, and a second Delete removes it (space-1,
    // space-77).
    await expect(list.getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${TEAM_KEY}`)).toBeVisible();
    await expect(list.getByTestId(`space-group-delete-${HOST_GROUP}`)).toHaveCount(0);
    host.script.refuseGroupDelete("Deletions are paused for this group.");
    await renamed.getByTestId("space-group-delete-core-platform").click();
    const confirm = renamed.getByTestId("space-group-confirm-core-platform");
    await expect(confirm).toContainText("Delete core-platform?");
    await expect(confirm.getByRole("button", { name: "Keep" })).toBeFocused();
    await clean("the delete confirm");
    await confirm.getByRole("button", { name: "Delete" }).click();
    await expect(renamed.getByTestId("space-group-refusal-core-platform")).toContainText("Deletions are paused for this group.");
    expect(standinGroup("core-platform")).toBeTruthy();
    host.script.refuseGroupDelete(null);
    await renamed.getByTestId("space-group-delete-core-platform").click();
    await renamed.getByTestId("space-group-confirm-core-platform").getByRole("button", { name: "Delete" }).click();
    await expect(renamed).toHaveCount(0);
    expect(standinGroup("core-platform")).toBeUndefined();

    // Move… on the project's placement line offers your login and every
    // group but acme, each read as the pick reads it; a move the
    // stand-in refuses stands in the picker, and a move into
    // acme/research lists the row there at once, its key unchanged
    // (space-78, space-87).
    const RESEARCH = `${HOST_GROUP}/research`;
    host.script.refuseTransfer("Moves are paused for this project.");
    const move = list.getByTestId(`space-row-${TEAM_KEY}`).getByTestId(`space-line-${host.url}`).getByTestId("space-line-move");
    await expect(move).toHaveText("Move…");
    await expect(move).toHaveAttribute("aria-label", "Move to another group");
    await move.click();
    const picker = list.getByTestId(`space-move-${TEAM_KEY}@${host.url}`);
    await expect(picker.locator('[data-testid^="space-move-group-"]')).toHaveText([PICKED_AS[HOST_LOGIN]!, PICKED_AS[RESEARCH]!]);
    await clean("the move picker");
    await picker.getByTestId(`space-move-group-${RESEARCH}`).click();
    await expect(picker.getByRole("alert")).toContainText("Moves are paused for this project.");
    await expect(list.getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${TEAM_KEY}`)).toBeVisible();
    host.script.refuseTransfer(null);
    await picker.getByTestId(`space-move-group-${RESEARCH}`).click();
    const research = list.getByTestId(`space-group-${RESEARCH}`);
    await expect(research.getByTestId(`space-row-${TEAM_KEY}`)).toBeVisible();
    await expect(list.getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${TEAM_KEY}`)).toHaveCount(0);
    await expect(picker).toHaveCount(0);
    expect(existsSync(clonePath(app.dataDir, TEAM_KEY))).toBe(true);

    // The row's Sync then moves the clone under acme/research's folder
    // (space-78).
    await research.getByTestId(`space-row-sync-${TEAM_KEY}`).click();
    const MOVED = hostKey(host, `${RESEARCH}/demo-project-spex`);
    await expect(research.getByTestId(`space-repo-state-${MOVED}`)).toHaveText("Synced just now", { timeout: 30_000 });
    expect(existsSync(clonePath(app.dataDir, MOVED))).toBe(true);
    expect(existsSync(clonePath(app.dataDir, TEAM_KEY))).toBe(false);
    await clean("after the move");

    // The new controls fit at the 320-pixel floor with the sidebar
    // collapsed, the rename editor and the move picker open (space-28).
    await setRail(page, false);
    await page.setViewportSize({ width: 320, height: TALL });
    await research.getByTestId(`space-group-rename-${RESEARCH}`).click();
    await expect(research.getByTestId(`space-rename-${RESEARCH}`)).toBeVisible();
    const movedLine = research.getByTestId(`space-row-${MOVED}`).getByTestId(`space-line-${host.url}`);
    await movedLine.getByTestId("space-line-move").click();
    await expect(movedLine.getByTestId(`space-move-${MOVED}@${host.url}`)).toBeVisible();
    const defects: string[] = [];
    record(
      "Groups undo · 320",
      await measure(page, ['[data-testid^="space-group-"]', '[data-testid="space-instance-heading"] > div']),
      defects,
    );
    expect(defects, defects.join("\n")).toEqual([]);
    await movedLine.getByTestId(`space-move-cancel-${MOVED}@${host.url}`).click();
    await research.getByTestId(`space-rename-${RESEARCH}-cancel`).click();
    await page.setViewportSize({ width: 1280, height: TALL });

    // In Chinese, with the move picker open, the surface names nothing
    // more (space-1, localization-10).
    await surfaceEntry(page, "Settings").click();
    await page.getByTestId("language-section").getByTestId("language-select").selectOption("zh");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    await surfaceEntry(page, "Space").click();
    await expect(page.getByTestId("space-surface")).toBeVisible();
    await page.getByTestId(`space-row-${MOVED}`).getByTestId(`space-line-${host.url}`).getByTestId("space-line-move").click();
    const zhPicker = page.getByTestId(`space-move-${MOVED}@${host.url}`);
    await expect(zhPicker).toHaveAttribute("aria-label", "将 demo-project-spex 移到另一个群组");
    await expect(zhPicker.getByTestId(`space-move-group-${entryKey(HOST_LOGIN)}`)).toHaveText(HOST_LOGIN);
    await clean("the move picker in Chinese");
  });
});

// ---------------------------------------------------------------------------
// space-85: a second instance, through the page
// ---------------------------------------------------------------------------

/** The second instance's person (space-85): an account of its own
 * there, whose namespace reads by its login. */
const SECOND_PERSON = { id: "1002", login: "bob", displayName: "Bob" };

/** The rows an instance's heading and the list's foot lay out side by
 * side, measured at the 320-pixel floor (space-28). */
const INSTANCE_ROWS = [
  '[data-testid^="space-instance-http"]',
  '[data-testid="space-instance-heading"] > div',
  '[data-testid="space-groups"] h2',
  '[data-testid="space-groups"] h3',
  '[data-testid^="space-group-"]',
  '[data-testid="space-add-card"]',
  '[data-testid="space-add-card"] > div',
  '[data-testid="space-add-card"] label',
];

/** A project's rows and lines with what its "Place at…" and "Leave…"
 * open beneath it — the picker, the choice, the confirm — measured at
 * the floor (space-28, space-43, space-88, space-89). */
const PLACEMENT_ROWS = [
  ...INSTANCE_ROWS,
  '[data-testid^="space-row-"]',
  '[data-testid^="space-line-"]',
  '[data-testid^="space-place-"]',
  '[data-testid^="space-leave-"]',
];

test.describe("a second instance", () => {
  // Signed in at the first stand-in with the demo project registered; a
  // second stand-in on a Git backend of its own, holding its own `acme`,
  // whose read says the person may not make a group (git-host-12,
  // DR-127).
  test.use({
    appOptions: {
      host: { second: { backend: "separate", canCreateGroup: false, person: SECOND_PERSON } },
      project: true,
      signedIn: true,
    },
  });

  test("space-85: Add instance… signs a second instance in, each acme beneath its own heading; a project picked at the second pushes there and moves only there; the first signed out keeps its heading, Forget refused, until Sign in again", async ({
    page,
    app,
  }) => {
    test.setTimeout(240_000);
    const first = app.hosts[0]!;
    const second = app.hosts[1]!;
    const FIRST_KEY = hostKey(first, TEAM_PATH);
    // The first's project synced in its `acme`, and a project on this
    // device only beside it (arrange only).
    await pickGroup(app);
    const local = await registerLocalProject(app, "atlas");
    expect(local.key).toBe(`${HOST_LOGIN}/atlas-spex`);
    const SECOND_KEY = hostKey(second, `${HOST_GROUP}/atlas-spex`);
    const clean = async (where: string): Promise<void> => {
      await expect(page.getByTestId("space-surface").locator("a")).toHaveCount(0);
      expect(await surfaceLeaks(page, app.hosts), where).toEqual([]);
    };
    const fit = async (where: string, show?: () => Promise<void>, containers: string[] = INSTANCE_ROWS): Promise<void> => {
      await setRail(page, false);
      await page.setViewportSize({ width: 320, height: TALL });
      await show?.();
      const defects: string[] = [];
      record(where, await measure(page, containers), defects);
      expect(defects, defects.join("\n")).toEqual([]);
      await page.setViewportSize({ width: 1280, height: TALL });
    };

    await open(page, app);
    await showGroups(page);
    const list = page.getByTestId("space-groups");
    const firstSection = instanceSection(page, first);
    const firstHeading = firstSection.getByTestId("space-instance-heading");
    const firstRow = firstSection.getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${FIRST_KEY}`);
    await expect(firstRow).toHaveAttribute("data-state", "reachable");
    // Nothing has asked the second anything: the home does not list it.
    expect(second.script.requests).toEqual([]);

    // "Add instance…" stands at the list's foot, after every instance's
    // section, bearing "Another instance" as its title and accessible
    // name; it opens the card in its place, named so, its "Instance"
    // field holding the first's origin, focused; Escape closes the card
    // and "Add instance…" stands again, focused (space-1, space-3).
    const add = list.getByTestId("space-add-instance");
    await expect(add).toHaveText("Add instance…");
    await expect(add).toHaveAccessibleName("Another instance");
    await expect(add).toHaveAttribute("title", "Another instance");
    expect(await list.evaluate((root) => root.lastElementChild?.querySelector('[data-testid="space-add-instance"]') != null)).toBe(true);
    await add.click();
    const card = list.getByRole("group", { name: "Another instance" });
    await expect(card).toHaveAttribute("data-testid", "space-add-card");
    await expect(add).toHaveCount(0);
    const field = card.getByRole("textbox", { name: "Instance" });
    await expect(field).toHaveValue(first.url);
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    await expect(add).toBeFocused();

    // An origin with a path is refused in the card as one sentence, the
    // field keeping it, and nothing reaches the second (space-3,
    // git-host-2).
    await add.click();
    await field.fill(`${second.url}/x`);
    await card.getByTestId("space-signin").click();
    await expect(card.getByTestId("space-signin-error")).toHaveText("An instance's URL names no path, only its scheme, host and port.");
    await expect(field).toHaveValue(`${second.url}/x`);
    await expect(card.getByTestId("space-signin")).toHaveText("Sign in");
    expect(second.script.requests).toEqual([]);

    // The second's origin, in the same card, signs in through the device
    // flow the harness approves; the card closes, "Add instance…"
    // standing again (space-3).
    await signInThroughPage(page, app, second, "add");
    await expect(card).toHaveCount(0);
    await expect(add).toBeEnabled();

    // Each instance stands under a heading of its display name, in the
    // home's order, with "Signed in as @<login>", Sign out and its read
    // time; the first's carries "New group", the second's the phrase
    // naming who makes groups there; each `acme` stands beneath its own
    // instance (space-1).
    const secondSection = instanceSection(page, second);
    const secondHeading = secondSection.getByTestId("space-instance-heading");
    expect(
      await list.locator('[data-testid^="space-instance-http"]').evaluateAll((sections) => sections.map((section) => section.getAttribute("data-testid"))),
    ).toEqual([`space-instance-${first.url}`, `space-instance-${second.url}`]);
    for (const [section, heading, name, login] of [
      [firstSection, firstHeading, "Stand-in Git host", HOST_LOGIN],
      [secondSection, secondHeading, SECOND_HOST_NAME, SECOND_PERSON.login],
    ] as const) {
      await expect(section).toHaveAttribute("aria-label", name);
      await expect(heading.getByRole("heading", { level: 2 })).toHaveText(`${name} · Signed in as @${login}`);
      await expect(heading.getByTestId("space-signout")).toHaveText("Sign out");
      await expect(heading.getByTestId("space-read-at")).toHaveText(/^Read /);
    }
    await expect(firstHeading.getByTestId("space-new-group")).toHaveText("New group");
    await expect(firstHeading.getByTestId("space-groups-made-by")).toHaveCount(0);
    await expect(secondHeading.getByTestId("space-groups-made-by")).toHaveText(`Groups are made by the people who run ${SECOND_HOST_NAME}`);
    await expect(secondHeading.getByTestId("space-new-group")).toHaveCount(0);
    for (const section of [firstSection, secondSection]) {
      await expect(section.getByTestId(`space-group-${HOST_GROUP}`).getByRole("heading", { level: 3 })).toHaveText(PICKED_AS[HOST_GROUP]!);
    }
    await expect(firstRow).toBeVisible();
    await expect(secondSection.getByTestId(`space-row-${FIRST_KEY}`)).toHaveCount(0);

    // "Pick a group" on the row on this device only offers, under each
    // instance's display name, your namespace there by its login and its
    // groups; picking the second's `acme` creates `<name>-spex` at the
    // second, on its `spex` branch, and the row stands reachable beneath
    // the second's `acme`; the first holds nothing of it (space-58).
    await list.getByTestId("space-own").getByTestId(`space-row-pick-${local.key}`).click();
    const picker = list.getByTestId(`space-picker-${local.key}`);
    await expect(picker.locator('[data-testid^="space-pick-instance-"]')).toHaveCount(2);
    const firstPick = await pickSection(picker, first);
    const secondPick = await pickSection(picker, second, SECOND_HOST_NAME);
    await expect(firstPick.locator('[data-testid^="space-pick-group-"]')).toHaveText([
      PICKED_AS[HOST_LOGIN]!,
      PICKED_AS[HOST_GROUP]!,
      PICKED_AS[`${HOST_GROUP}/research`]!,
    ]);
    await expect(secondPick.locator('[data-testid^="space-pick-group-"]')).toHaveText([
      SECOND_PERSON.login,
      PICKED_AS[HOST_GROUP]!,
      PICKED_AS[`${HOST_GROUP}/research`]!,
    ]);
    await expect(picker.getByTestId(`space-pick-name-${local.key}`)).toHaveValue("atlas");
    await secondPick.getByTestId(`space-pick-group-${HOST_GROUP}`).click();
    const secondRow = secondSection.getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${SECOND_KEY}`);
    await expect(secondRow).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    await expect(secondRow.getByTestId(`space-repo-state-${SECOND_KEY}`)).toHaveText("Synced just now", { timeout: 30_000 });
    const clone = clonePath(app.dataDir, SECOND_KEY);
    expect(headOf(bareOf(second, SECOND_KEY), "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(first.script.repositories.some((repo) => repo.path === "atlas-spex")).toBe(false);

    // The row's Sync then pushes what changed here to the second, with
    // the second's credential (space-12).
    await expect
      .poll(async () => (await app.core.command("project.list", {})).find((project) => project.path === local.dir)?.id, { timeout: 30_000 })
      .toBe(SECOND_KEY);
    const queued = await app.core.command("intent.queue", { projectId: SECOND_KEY, text: "Queued at the second instance" });
    await openRepository(page, SECOND_KEY);
    const panel = page.getByTestId("space-repository");
    await expect(panel.getByTestId("space-local-list").getByTestId(`space-unit-mine-intents/${queued.id}`)).toContainText("Queued at the second instance");
    const pushes = second.script.transportCredentials.length;
    const sync = secondRow.getByTestId(`space-row-sync-${SECOND_KEY}`);
    const labels = await watch(page, `[data-testid="space-row-sync-${SECOND_KEY}"]`);
    await sync.click();
    const bare = bareOf(second, SECOND_KEY);
    await expect
      .poll(() => git(bare, "ls-tree", "-r", "--name-only", "spex").split("\n"), { timeout: 30_000 })
      .toContain(`intents/${queued.id}.json`);
    await expect(sync).toHaveText("Sync");
    expect(await labels()).toEqual(["Sync", "Syncing…", "Sync"]);
    await expect(panel.getByTestId("space-done-line")).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    expect(git(bare, "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(second.script.transportCredentials.slice(pushes).some((entry) => entry.instance === second.url && entry.push)).toBe(true);
    await page.getByTestId(`space-repo-${SECOND_KEY}`).click();
    await expect(page.getByTestId("space-repository")).toHaveCount(0);

    // "Move…" on that row's placement line offers the second's groups
    // alone: your namespace there, then every group but the row's own
    // (space-78, space-87).
    const secondLine = secondRow.getByTestId(`space-line-${second.url}`);
    await secondLine.getByTestId("space-line-move").click();
    const mover = secondLine.getByTestId(`space-move-${SECOND_KEY}@${second.url}`);
    await expect(mover.locator('[data-testid^="space-move-group-"]')).toHaveText([
      SECOND_PERSON.login,
      PICKED_AS[`${HOST_GROUP}/research`]!,
    ]);
    await expect(mover.getByTestId(`space-move-group-${entryKey(HOST_LOGIN)}`)).toHaveCount(0);
    await mover.getByTestId(`space-move-cancel-${SECOND_KEY}@${second.url}`).click();
    await expect(mover).toHaveCount(0);

    // Sign out on the first's heading keeps it, signed out, with Forget
    // and "Sign in again": its project unreachable with no Retry, the
    // second's reachable (space-6, space-61).
    await firstHeading.getByTestId("space-signout").click();
    await expect(firstHeading.getByTestId("space-signin-again")).toHaveText("Sign in again");
    await expect(firstHeading.getByTestId("space-forget")).toHaveText("Forget");
    await expect(firstHeading.getByTestId("space-signout")).toHaveCount(0);
    await expect(firstHeading.getByRole("heading", { level: 2 })).toHaveText("Stand-in Git host");
    await expect(firstRow).toHaveAttribute("data-state", "unreachable");
    await expect(firstRow.getByTestId(`space-row-retry-${FIRST_KEY}`)).toHaveCount(0);
    await expect(secondRow).toHaveAttribute("data-state", "reachable");
    await expect(secondHeading.getByTestId("space-signout")).toHaveText("Sign out");

    // Forget is refused naming the first's project, kept under it, the
    // heading standing with "Sign in again" (space-82).
    await firstHeading.getByTestId("space-forget").click();
    await expect(firstHeading.getByTestId("space-forget-refusal")).toHaveText("Still kept under Stand-in Git host: demo-project-spex");
    await expect(firstSection).toBeVisible();
    await expect(firstHeading.getByTestId("space-signin-again")).toBeEnabled();
    await expect(firstRow).toHaveAttribute("data-state", "unreachable");
    await clean("the first signed out, Forget refused");
    await fit("Groups · the first signed out · 320");

    // "Sign in again" signs the first in through the device flow, its
    // flow reading on its heading and "Add instance…" disabled until it
    // ends; the first's project is reachable again (space-3, space-61).
    await signInThroughPage(page, app, first, "again", async () => {
      await expect(add).toBeDisabled();
    });
    await expect(add).toBeEnabled();
    await expect(firstHeading.getByTestId("space-signout")).toHaveText("Sign out");
    await expect(firstRow).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    await expect(secondRow).toHaveAttribute("data-state", "reachable");

    // The new controls fit at the 320-pixel floor, the card "Add
    // instance…" opens standing too (space-28).
    await fit("Groups · two instances, the card open · 320", async () => {
      await add.click();
      await expect(card).toBeVisible();
    });
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);

    // "Place at…" on the first's project opens the second's picker
    // beneath the row, and "Leave…" its inline confirm: each fits at the
    // floor, measured with the rows and lines (space-88, space-89,
    // space-28).
    const placeControl = firstRow.getByTestId(`space-row-place-${FIRST_KEY}`);
    await expect(placeControl).toHaveAccessibleName(`Also place at ${SECOND_HOST_NAME}`);
    const placePicker = firstRow.getByTestId(`space-place-${FIRST_KEY}`);
    await fit(
      "Groups · Place at… open · 320",
      async () => {
        await placeControl.click();
        await expect(placePicker).toBeVisible();
      },
      PLACEMENT_ROWS,
    );
    await placePicker.getByTestId(`space-pick-cancel-${FIRST_KEY}`).click();
    await expect(placePicker).toHaveCount(0);
    const leaveControl = firstRow.getByTestId(`space-row-leave-${FIRST_KEY}`);
    await expect(leaveControl).toHaveAccessibleName("Remove from Stand-in Git host");
    const leaveConfirm = firstRow.getByTestId(`space-leave-confirm-${FIRST_KEY}`);
    await fit(
      "Groups · Leave… asking · 320",
      async () => {
        await leaveControl.click();
        await expect(leaveConfirm).toBeVisible();
      },
      PLACEMENT_ROWS,
    );
    await leaveConfirm.getByRole("button", { name: "Keep" }).click();
    await expect(leaveConfirm).toHaveCount(0);

    // In English and in Chinese, the surface holds no link and nothing
    // under either stand-in's URL but its origin, nor the Git system's
    // name (space-1, localization-10).
    await clean("two instances");
    await surfaceEntry(page, "Settings").click();
    await page.getByTestId("language-section").getByTestId("language-select").selectOption("zh");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    await surfaceEntry(page, "Space").click();
    await expect(page.getByTestId("space-surface")).toBeVisible();
    await expect(add).toHaveAccessibleName("另一个实例");
    await clean("two instances in Chinese");
  });
});

// ---------------------------------------------------------------------------
// space-96: a project placed at two instances, across two homes
// ---------------------------------------------------------------------------

/** The second instance's group the project is placed in (space-96). */
const WORKSHOP = "workshop";
/** The project's spex repository there, by its path in the instance. */
const WORKSHOP_PATH = `${WORKSHOP}/demo-project-spex`;
/** Each home's session, by the first turn that titles it. */
const FIRST_HOME_TURN = "Fix the token refresh in auth.ts";
const SECOND_HOME_TURN = "Plan the release from the second laptop";
/** A placement's line reading what its last sync did there (space-87,
 * space-12): what moved, or that nothing had to. */
const SYNCED_LINE = /^(Synced just now · \d+ sent · \d+ received|Everything is in sync)$/;
/** A line whose sync sent this device's changes and brought nothing. */
const SENT_LINE = /^Synced just now · [1-9]\d* sent · 0 received$/;

/** The words space-96 keeps off the surface beside space-27's: a host's
 * `spex` named by its instance, and "remote". */
const PLACEMENT_WORDS = new RegExp(`${FORBIDDEN_WORDS.source}|@[^\\s/]+\\/spex|\\b[Rr]emote\\b`);

/** A project's rows and lines, what they open, and the lines a group
 * shows for a row placed in it, measured at the floor (space-28,
 * space-1). */
const PLACED_ROWS = [...PLACEMENT_ROWS, '[data-testid^="space-placed-"]'];

test.describe("placed at two instances", () => {
  // Signed in at the first stand-in with the demo project registered,
  // its code on a bare path this machine serves; a second stand-in on a
  // Git backend of its own (git-host-12, DR-128).
  test.use({
    appOptions: {
      host: { second: { backend: "separate" } },
      project: true,
      codeRemote: true,
      signedIn: true,
    },
  });

  test("space-96: Place at… puts the project in the second's workshop through the page and Continue pushes there; a session reaches both; a second home joins it from the first and attaches the second from its file; its session reaches both and the first home's Sync brings it", async ({
    page,
    app,
    browser,
  }) => {
    test.setTimeout(300_000);
    const first = app.hosts[0]!;
    const second = app.hosts[1]!;
    const KEY = hostKey(first, TEAM_PATH);
    // The project synced in the first's `acme`, the home signed in at the
    // second too, where `workshop` holds `bob` beside the account, so a
    // placement there owes the sharing notice (arrange only, space-57).
    await pickGroup(app);
    await signInCore(app, second);
    const fromGroup = app.core.mark();
    const { group } = await app.core.command("space.group.create", { instance: second.url, name: "Workshop", path: WORKSHOP, parent: null });
    await app.core.command("space.share", { instance: second.url, group: group.id, login: PEER_MEMBER.login, role: "developer" });
    await app.core.waitSpace(fromGroup, (state) => instanceOf(state, second.url)?.groups.some((entry) => entry.fullPath === WORKSHOP) ?? false);

    // What every page passes: no forbidden word, and every row, line,
    // picker, notice and group line inside its box at the 320-pixel
    // floor (space-27, space-28), each finding named where it was met.
    // "No visible text" is the surface's: the bullet verifies space-27,
    // which governs the copy on the Groups surface, so each scan reads
    // the surface, not the Projects tree or the Captain home the session
    // steps pass through.
    const words: string[] = [];
    const scan = (on: Page, where: string): Promise<void> => scanVocabulary(on, where, words, PLACEMENT_WORDS);
    const defects: string[] = [];
    const fit = async (on: Page, where: string): Promise<void> => {
      await setRail(on, false);
      await on.setViewportSize({ width: 320, height: TALL });
      record(where, await measure(on, PLACED_ROWS), defects);
      await setRail(on, true);
    };

    await open(page, app);
    await showGroups(page);
    const row = instanceSection(page, first).getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${KEY}`);
    const lines = row.getByTestId(`space-lines-${KEY}`).locator(":scope > li");
    const firstLine = placementLine(page, KEY, first);
    const secondLine = placementLine(page, KEY, second);
    await expect(row).toHaveAttribute("data-state", "reachable");
    await expect(lines).toHaveCount(1);
    await expect(firstLine.getByTestId("space-line-instance")).toHaveText("Stand-in Git host");
    await expect(firstLine.getByTestId("space-line-at")).toHaveText(TEAM_PATH);
    await scan(page, "page one, placed at the first");

    // "Place at…" on the project's row, the second the one instance to
    // offer, is titled and named for it, and opens the second's picker
    // alone beneath the row — your namespace and its groups there,
    // `workshop` among them — which fits at the floor (space-88,
    // space-28).
    const place = row.getByTestId(`space-row-place-${KEY}`);
    await expect(place).toHaveText("Place at…");
    await expect(place).toHaveAttribute("title", `Also place at ${SECOND_HOST_NAME}`);
    await expect(place).toHaveAccessibleName(`Also place at ${SECOND_HOST_NAME}`);
    await place.click();
    const picker = row.getByTestId(`space-place-${KEY}`);
    await expect(picker).toHaveAttribute("aria-label", `Also place at ${SECOND_HOST_NAME}`);
    await expect(picker.locator('[data-testid^="space-pick-instance-"]')).toHaveCount(1);
    const section = await pickSection(picker, second, SECOND_HOST_NAME);
    await expect(section.getByTestId(`space-pick-group-${WORKSHOP}`)).toHaveText(`Workshop · ${WORKSHOP}`);
    await expect(picker.getByTestId(`space-pick-name-${KEY}`)).toHaveValue("demo-project");
    await scan(page, "page one, the Place picker");
    await fit(page, "page one · Place at… open · 320");

    // Picking `workshop` creates `<name>-spex` there, "Place at…"
    // reading "Placing…" until the placement is made and synced; the row
    // then names both placements, in the order added, each by its
    // instance's display name and its path there (space-88, space-97,
    // space-87).
    const placing = await watch(page, `[data-testid="space-row-place-${KEY}"]`);
    await section.getByTestId(`space-pick-group-${WORKSHOP}`).click();
    await expect(picker).toHaveCount(0);
    await expect(secondLine).toBeVisible({ timeout: 30_000 });
    await expect(place).toHaveCount(0, { timeout: 30_000 });
    expect(await placing()).toEqual(["Place at…", "Placing…"]);
    await expect(lines).toHaveCount(2);
    expect(await lines.evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")))).toEqual([
      `space-line-${first.url}`,
      `space-line-${second.url}`,
    ]);
    await expect(secondLine.getByTestId("space-line-instance")).toHaveText(SECOND_HOST_NAME);
    await expect(secondLine.getByTestId("space-line-at")).toHaveText(WORKSHOP_PATH);
    await expect(row).toHaveAttribute("data-state", "reachable");

    // The second's repository has another member, so its line waits for
    // the sharing notice with Continue while the first's reads synced;
    // Continue says the notice on the line, naming the second's display
    // name and the path there, Cancel focused (space-57, space-87).
    await expect(secondLine.getByTestId("space-line-state")).toHaveText("Waiting for you to continue", { timeout: 30_000 });
    await expect(firstLine.getByTestId("space-line-state")).toHaveText(SYNCED_LINE);
    const proceed = secondLine.getByTestId("space-line-continue");
    await expect(proceed).toHaveText("Continue");
    await proceed.click();
    const notice = secondLine.getByTestId("space-line-notice");
    await expect(notice).toContainText(`Records go to ${WORKSHOP_PATH} at ${SECOND_HOST_NAME}.`);
    await expect(notice).toContainText("Every session goes there whole — hidden parts and attachments included");
    await expect(notice.getByRole("button", { name: "Cancel" })).toBeFocused();
    await scan(page, "page one, the second's notice");
    await fit(page, "page one · the second's notice · 320");

    // Continue pushes there with the second's credential, the line then
    // reading what went, the notice recorded for that placement; the
    // second's `workshop`, whose listing holds the placement, shows one
    // line naming the row and the group it stands under — its name, its
    // path beside it, as the list heads it — with no control, and no
    // Delete (space-57, space-12, space-1, space-77).
    const pushes = second.script.transportCredentials.length;
    await notice.getByRole("button", { name: "Continue" }).click();
    await expect(notice).toHaveCount(0);
    await expect(secondLine.getByTestId("space-line-state")).toHaveText(SENT_LINE, { timeout: 30_000 });
    const clone = clonePath(app.dataDir, KEY);
    const firstBare = bareOf(first, KEY);
    const workshopBare = bareOf(second, WORKSHOP_PATH);
    await expect.poll(() => headOf(workshopBare, "spex"), { timeout: 30_000 }).toBe(git(clone, "rev-parse", "spex"));
    expect(second.script.transportCredentials.slice(pushes).some((entry) => entry.instance === second.url && entry.push)).toBe(true);
    expect(placementOf(repositoryOf(await app.core.command("space.get", {}), KEY), second.url).noticed).toBe(true);
    const workshop = instanceSection(page, second).getByTestId(`space-group-${WORKSHOP}`);
    const placed = workshop.getByTestId(`space-placed-${KEY}`);
    await expect(placed).toHaveText(`demo-project-spex stands under Acme · ${HOST_GROUP} at Stand-in Git host`);
    await expect(placed.getByRole("button")).toHaveCount(0);
    await expect(workshop.locator('[data-testid^="space-row-"]')).toHaveCount(0);
    await expect(workshop.getByTestId(`space-group-delete-${WORKSHOP}`)).toHaveCount(0);
    await scan(page, "page one, placed at both");
    await fit(page, "page one · placed at both · 320");

    // A session run on the first page and synced lands on both
    // stand-ins' `spex` branches, each line reading what went (space-12).
    await nav(page, "Projects").click();
    await page
      .getByRole("tree", { name: "Projects and sessions" })
      .getByRole("treeitem", { name: "demo-project", exact: true })
      .click();
    await expect(page.getByTestId("captain-home")).toContainText("demo-project");
    await send(page, FIRST_HOME_TURN);
    await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
    await settled(app);
    await showGroups(page);
    await openRepository(page, KEY);
    const firstSessionRow = page.getByTestId("space-local-list").locator('[data-testid^="space-unit-mine-sessions/"]');
    await expect(firstSessionRow).toContainText(FIRST_HOME_TURN);
    const firstSession = (await firstSessionRow.getAttribute("data-testid"))!.replace("space-unit-mine-sessions/", "");
    await row.getByTestId(`space-row-sync-${KEY}`).click();
    for (const line of [firstLine, secondLine]) {
      await expect(line.getByTestId("space-line-state")).toHaveText(SENT_LINE, { timeout: 30_000 });
    }
    for (const bare of [firstBare, workshopBare]) {
      await expect
        .poll(() => git(bare, "ls-tree", "-r", "--name-only", "spex").split("\n"), { timeout: 30_000 })
        .toContain(`sessions/${firstSession}.json`);
    }
    await scan(page, "page one, a session synced to both");
    await page.getByTestId(`space-repo-${KEY}`).click();
    await expect(page.getByTestId("space-repository")).toHaveCount(0);

    // A second home, signed in at both instances as the same accounts
    // there through device flows the harness approves (arrange only),
    // its page in a browser context of its own.
    const other = await startApp({ host: { share: { host: first, second } } });
    const context = await browser.newContext({ locale: "en-US" });
    try {
      await signInCore(other, first);
      await signInCore(other, second);
      const page2 = await context.newPage();
      await open(page2, other);
      await showGroups(page2);

      // The project, joined from the first's `acme` with its code cloned
      // into the folder the page names, names the second's placement as
      // not on this device, with Attach (space-63, space-87).
      const row2 = instanceSection(page2, first).getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${KEY}`);
      await expect(row2).toHaveAttribute("data-state", "absent");
      await row2.getByTestId(`space-row-join-${KEY}`).click();
      const folder = join(other.home, "work", "demo-project");
      const editor = page2.getByTestId(`space-join-${KEY}`);
      await editor.getByTestId(`space-join-${KEY}-path`).fill(folder);
      await editor.getByRole("button", { name: "Join", exact: true }).click();
      await expect(row2).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
      expect(git(folder, "remote", "get-url", "origin")).toBe(app.codeOrigin);
      const firstLine2 = placementLine(page2, KEY, first);
      const secondLine2 = placementLine(page2, KEY, second);
      await expect(firstLine2).toHaveAttribute("data-attached", "true");
      await expect(secondLine2).toHaveAttribute("data-attached", "false", { timeout: 30_000 });
      await expect(secondLine2).toHaveAttribute("data-state", "absent");
      await expect(secondLine2.getByTestId("space-line-instance")).toHaveText(SECOND_HOST_NAME);
      await expect(secondLine2.getByTestId("space-line-at")).toHaveText(WORKSHOP_PATH);
      await expect(secondLine2.getByTestId("space-line-state")).toHaveText("Not on this device");
      const attach = secondLine2.getByTestId("space-line-attach");
      await expect(attach).toHaveText("Attach");
      await scan(page2, "page two, joined");

      // Attach says the notice on its line, naming the second's display
      // name and the path there, Cancel focused; Cancel attaches nothing,
      // Attach standing again (space-90, space-57).
      await attach.click();
      const notice2 = secondLine2.getByTestId("space-line-notice");
      await expect(notice2).toContainText(`Records go to ${WORKSHOP_PATH} at ${SECOND_HOST_NAME}.`);
      await expect(notice2).toContainText("Every session goes there whole — hidden parts and attachments included");
      await expect(notice2.getByRole("button", { name: "Cancel" })).toBeFocused();
      await scan(page2, "page two, the Attach notice");
      await fit(page2, "page two · the Attach notice · 320");
      await notice2.getByRole("button", { name: "Cancel" }).click();
      await expect(notice2).toHaveCount(0);
      await expect(attach).toBeFocused();
      await expect(attach).toHaveText("Attach");
      await expect(secondLine2).toHaveAttribute("data-attached", "false");

      // Continue attaches it, Attach reading "Attaching…" until the
      // attach's sync ends; the line then reads synced, the notice
      // recorded for that placement (space-90, space-99, space-87).
      const attaching = await watch(
        page2,
        `[data-testid="space-row-${KEY}"] [data-testid="space-line-${second.url}"] [data-testid="space-line-attach"]`,
      );
      await attach.click();
      await notice2.getByRole("button", { name: "Continue" }).click();
      await expect(secondLine2).toHaveAttribute("data-attached", "true", { timeout: 30_000 });
      await expect(attach).toHaveCount(0, { timeout: 30_000 });
      expect(await attaching()).toEqual(["Attach", "Attaching…"]);
      await expect(secondLine2.getByTestId("space-line-state")).toHaveText(SYNCED_LINE);
      expect(placementOf(repositoryOf(await other.core.command("space.get", {}), KEY), second.url).noticed).toBe(true);
      await scan(page2, "page two, attached");
      await fit(page2, "page two · attached · 320");

      // A session run on the second page and synced reaches both
      // stand-ins, each line reading what went (space-12).
      await page2
        .getByRole("tree", { name: "Projects and sessions" })
        .getByRole("treeitem", { name: "demo-project", exact: true })
        .click();
      await page2.getByRole("tab", { name: "Start another session" }).click();
      await send(page2, SECOND_HOME_TURN);
      await expect(page2.getByTestId("captain-pane")).toContainText("/code finished");
      await settled(other);
      await showGroups(page2);
      await openRepository(page2, KEY);
      const secondSessionRow = page2.getByTestId("space-local-list").locator('[data-testid^="space-unit-mine-sessions/"]');
      await expect(secondSessionRow).toContainText(SECOND_HOME_TURN);
      const secondSession = (await secondSessionRow.getAttribute("data-testid"))!.replace("space-unit-mine-sessions/", "");
      await row2.getByTestId(`space-row-sync-${KEY}`).click();
      for (const line of [firstLine2, secondLine2]) {
        await expect(line.getByTestId("space-line-state")).toHaveText(SENT_LINE, { timeout: 30_000 });
      }
      for (const bare of [firstBare, workshopBare]) {
        await expect
          .poll(() => git(bare, "ls-tree", "-r", "--name-only", "spex").split("\n"), { timeout: 30_000 })
          .toContain(`sessions/${secondSession}.json`);
      }
      await scan(page2, "page two, a session synced to both");

      // The first page's Sync brings it: its first line reads what came,
      // and the session lists in the first page's sidebar by its title
      // (space-12).
      await row.getByTestId(`space-row-sync-${KEY}`).click();
      await expect(firstLine.getByTestId("space-line-state")).toHaveText(/^Synced just now · \d+ sent · [1-9]\d* received$/, {
        timeout: 30_000,
      });
      expect(git(clone, "ls-tree", "-r", "--name-only", "spex").split("\n")).toContain(`sessions/${secondSession}.json`);
      const project = page.getByTestId(`sidebar-project-${KEY}`);
      if ((await project.getAttribute("aria-expanded")) !== "true") await page.getByTestId(`sidebar-disclose-${KEY}`).click();
      await expect(
        page.getByRole("tree", { name: "Projects and sessions" }).getByRole("treeitem", { name: new RegExp(SECOND_HOME_TURN, "i") }),
      ).toBeVisible({ timeout: 30_000 });
      await scan(page, "page one, the second home's session brought");
    } finally {
      await context.close();
      await other.close();
    }

    expect(words, words.join("\n")).toEqual([]);
    expect(defects, defects.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Placing and leaving over three instances
// ---------------------------------------------------------------------------

/** The project's spex repository in your namespace there, by its path
 * in the instance (space-88). */
const NAMESPACE_PATH = `${HOST_LOGIN}/demo-project-spex`;
/** Your own group's spex repository's name (space-4). */
const OWN_NAME = `${HOST_LOGIN}-spex`;
/** The session run before the leaves, by the first turn that titles it. */
const LEAVE_TURN = "Write the release notes before the move";

/** The test ids of a list's items, in their order. */
async function testIds(items: Locator): Promise<(string | null)[]> {
  return items.evaluateAll((all) => all.map((item) => item.getAttribute("data-testid")));
}

test.describe("three instances", () => {
  // Signed in at the first stand-in with the demo project registered; a
  // second and a third stand-in, each on a Git backend of its own
  // (git-host-12, DR-128).
  test.use({
    appOptions: {
      host: { second: { backend: "separate" }, third: { backend: "separate" } },
      project: true,
      signedIn: true,
    },
  });

  test("space-88, space-89, space-98, space-87, space-1, space-4, space-57, storage-38, space-28: your own group placed at each later instance waits for Continue; Place at… opens the choice of two instances and places the project at the third; Leave… stops for records no other placement received, then leaves the first, the clone moving under the third, and the last, leaving it on this device only", async ({
    page,
    app,
  }) => {
    test.setTimeout(300_000);
    const first = app.hosts[0]!;
    const second = app.hosts[1]!;
    const third = app.hosts[2]!;
    const KEY = hostKey(first, TEAM_PATH);
    const MOVED_KEY = hostKey(third, NAMESPACE_PATH);
    // On this device only, under your own group's folder, which bears
    // your login (storage-38, space-59).
    const LOCAL_KEY = `${HOST_LOGIN}/demo-project-spex`;
    // The home signed in at the second and the third, your own group
    // placed at each, and the project synced in the first's `acme`
    // (arrange only, space-4, space-58).
    await signInCore(app, second);
    await signInCore(app, third);
    await pickGroup(app);

    // Every row, line, choice, confirm and notice inside its box at the
    // 320-pixel floor (space-28), each finding named where it was met.
    const defects: string[] = [];
    const fit = async (where: string): Promise<void> => {
      await setRail(page, false);
      await page.setViewportSize({ width: 320, height: TALL });
      record(where, await measure(page, PLACED_ROWS), defects);
      await setRail(page, true);
    };

    await open(page, app);
    await showGroups(page);
    const list = page.getByTestId("space-groups");

    // Your own group is placed at every instance the home signed in to,
    // in your namespace there, in the order signed in; its row offers
    // neither "Place at…" nor "Leave…", and each namespace, the first's
    // among them, shows one line naming it under your own group, with no
    // control (space-4, space-88, space-89, space-87, space-1).
    const ownRow = list.getByTestId("space-own").getByTestId(`space-row-${OWN_KEY}`);
    const ownLines = ownRow.getByTestId(`space-lines-${OWN_KEY}`).locator(":scope > li");
    await expect(ownLines).toHaveCount(3, { timeout: 30_000 });
    expect(await testIds(ownLines)).toEqual([`space-line-${first.url}`, `space-line-${second.url}`, `space-line-${third.url}`]);
    for (const host of [first, second, third]) {
      await expect(placementLine(page, OWN_KEY, host).getByTestId("space-line-at")).toHaveText(OWN_KEY);
    }
    await expect(ownRow.getByTestId(`space-row-place-${OWN_KEY}`)).toHaveCount(0);
    await expect(ownRow.getByTestId(`space-row-leave-${OWN_KEY}`)).toHaveCount(0);
    for (const host of [first, second, third]) {
      const placed = instanceSection(page, host).getByTestId(`space-group-@${HOST_LOGIN}`).getByTestId(`space-placed-${OWN_KEY}`);
      await expect(placed).toHaveText(`${OWN_NAME} stands under your own group`);
      await expect(placed.getByRole("button")).toHaveCount(0);
    }

    // Each placement after the first waits for the sharing notice, its
    // line reading "Waiting for you to continue" with Continue, the
    // first's not; Continue says the notice on its line, naming that
    // instance's display name and the path there, Cancel focused, and
    // its Continue pushes there alone, the other still waiting (space-4,
    // space-57, space-87).
    await expect(placementLine(page, OWN_KEY, first).getByTestId("space-line-continue")).toHaveCount(0);
    for (const host of [second, third]) {
      const line = placementLine(page, OWN_KEY, host);
      await expect(line.getByTestId("space-line-state")).toHaveText("Waiting for you to continue", { timeout: 30_000 });
      await expect(line.getByTestId("space-line-continue")).toHaveText("Continue");
    }
    const ownClone = clonePath(app.dataDir, OWN_KEY);
    for (const [host, name] of [
      [second, SECOND_HOST_NAME],
      [third, THIRD_HOST_NAME],
    ] as const) {
      const line = placementLine(page, OWN_KEY, host);
      await line.getByTestId("space-line-continue").click();
      const notice = line.getByTestId("space-line-notice");
      await expect(notice).toContainText(`Records go to ${OWN_KEY} at ${name}.`);
      await expect(notice).toContainText("Every session goes there whole — hidden parts and attachments included");
      await expect(notice.getByRole("button", { name: "Cancel" })).toBeFocused();
      if (host === second) await fit("Groups · your own group's notice at the second · 320");
      await notice.getByRole("button", { name: "Continue" }).click();
      await expect(notice).toHaveCount(0);
      await expect(line.getByTestId("space-line-state")).toHaveText(SENT_LINE, { timeout: 30_000 });
      await expect.poll(() => headOf(bareOf(host, OWN_KEY), "spex"), { timeout: 30_000 }).toBe(git(ownClone, "rev-parse", "spex"));
      expect(placementOf(repositoryOf(await app.core.command("space.get", {}), OWN_KEY), host.url).noticed).toBe(true);
      if (host === second) {
        await expect(placementLine(page, OWN_KEY, third).getByTestId("space-line-state")).toHaveText("Waiting for you to continue", {
          timeout: 30_000,
        });
      }
    }

    // "Place at…" on the project's row, synced in the first's `acme`,
    // offers the two instances it holds no placement at: it opens the
    // choice of them in place, each by its display name, titled and
    // named "Also place at <display name>", focus on the first; Escape
    // closes it, choosing nothing (space-88, space-28).
    const row = instanceSection(page, first).getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${KEY}`);
    const lines = row.getByTestId(`space-lines-${KEY}`).locator(":scope > li");
    const firstLine = placementLine(page, KEY, first);
    const thirdLine = placementLine(page, KEY, third);
    await expect(row).toHaveAttribute("data-state", "reachable");
    expect(await testIds(lines)).toEqual([`space-line-${first.url}`]);
    const place = row.getByTestId(`space-row-place-${KEY}`);
    await expect(place).toHaveText("Place at…");
    await expect(place).toHaveAccessibleName("Place at…");
    await expect(place).not.toHaveAttribute("title");
    await place.click();
    const choice = row.getByTestId(`space-place-choice-${KEY}`);
    await expect(choice).toHaveAccessibleName("Place at…");
    const offered = choice.locator('[data-testid^="space-place-instance-"]');
    expect(await testIds(offered)).toEqual([`space-place-instance-${second.url}`, `space-place-instance-${third.url}`]);
    await expect(offered).toHaveText([SECOND_HOST_NAME, THIRD_HOST_NAME]);
    for (const [option, name] of [
      [offered.nth(0), SECOND_HOST_NAME],
      [offered.nth(1), THIRD_HOST_NAME],
    ] as const) {
      await expect(option).toHaveAttribute("title", `Also place at ${name}`);
      await expect(option).toHaveAccessibleName(`Also place at ${name}`);
    }
    await expect(offered.nth(0)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(choice).toHaveCount(0);
    await expect(place).toBeFocused();
    await place.click();
    await expect(choice).toBeVisible();
    await fit("Groups · the Place choice open · 320");

    // The third chosen opens its picker alone beneath the row — your
    // namespace and its groups there — and picking your namespace
    // creates `<name>-spex` there with no notice, its only member being
    // the account; "Place at…" reads "Placing…" until the placement is
    // made and synced, the third's line then reading what went, and
    // "Place at…" names the second alone (space-88, space-97, space-57,
    // space-87).
    await choice.getByTestId(`space-place-instance-${third.url}`).click();
    const picker = row.getByTestId(`space-place-${KEY}`);
    await expect(picker).toHaveAttribute("aria-label", `Also place at ${THIRD_HOST_NAME}`);
    await expect(picker.locator('[data-testid^="space-pick-instance-"]')).toHaveCount(1);
    const section = await pickSection(picker, third, THIRD_HOST_NAME);
    await expect(section.locator('[data-testid^="space-pick-group-"]')).toHaveText([
      PICKED_AS[HOST_LOGIN]!,
      PICKED_AS[HOST_GROUP]!,
      PICKED_AS[`${HOST_GROUP}/research`]!,
    ]);
    await expect(picker.getByTestId(`space-pick-name-${KEY}`)).toHaveValue("demo-project");
    const placing = await watch(page, `[data-testid="space-row-place-${KEY}"]`);
    await section.getByTestId(`space-pick-group-${entryKey(HOST_LOGIN)}`).click();
    await expect(picker).toHaveCount(0);
    await expect(thirdLine.getByTestId("space-line-state")).toHaveText(SENT_LINE, { timeout: 30_000 });
    await expect(place).toHaveText("Place at…", { timeout: 30_000 });
    expect(await placing()).toEqual(["Place at…", "Placing…", "Place at…"]);
    expect(await testIds(lines)).toEqual([`space-line-${first.url}`, `space-line-${third.url}`]);
    await expect(thirdLine.getByTestId("space-line-instance")).toHaveText(THIRD_HOST_NAME);
    await expect(thirdLine.getByTestId("space-line-at")).toHaveText(NAMESPACE_PATH);
    await expect(firstLine.getByTestId("space-line-state")).toHaveText(SYNCED_LINE);
    await expect(place).toHaveAttribute("title", `Also place at ${SECOND_HOST_NAME}`);
    await expect(place).toHaveAccessibleName(`Also place at ${SECOND_HOST_NAME}`);
    const clone = clonePath(app.dataDir, KEY);
    const firstBare = bareOf(first, KEY);
    const thirdBare = bareOf(third, NAMESPACE_PATH);
    await expect.poll(() => headOf(thirdBare, "spex"), { timeout: 30_000 }).toBe(git(clone, "rev-parse", "spex"));

    // Your namespace at the third, whose listing holds the placement,
    // shows one line naming the row and the group it stands under, as
    // the list heads it, with no control (space-1).
    const thirdNamespace = instanceSection(page, third).getByTestId(`space-group-@${HOST_LOGIN}`);
    const placed = thirdNamespace.getByTestId(`space-placed-${KEY}`);
    await expect(placed).toHaveText(`demo-project-spex stands under Acme · ${HOST_GROUP} at Stand-in Git host`);
    await expect(placed.getByRole("button")).toHaveCount(0);

    // A session run on the page, not synced.
    await nav(page, "Projects").click();
    await page
      .getByRole("tree", { name: "Projects and sessions" })
      .getByRole("treeitem", { name: "demo-project", exact: true })
      .click();
    await expect(page.getByTestId("captain-home")).toContainText("demo-project");
    await send(page, LEAVE_TURN);
    await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
    await settled(app);
    await showGroups(page);

    // "Leave…" on the placed project opens the choice of its placements,
    // each by its display name, named "Remove from <display name>",
    // focus on the first (space-89, space-28).
    const leave = row.getByTestId(`space-row-leave-${KEY}`);
    await expect(leave).toHaveText("Leave…");
    await expect(leave).toHaveAccessibleName("Leave…");
    await leave.click();
    const leaveChoice = row.getByTestId(`space-leave-choice-${KEY}`);
    await expect(leaveChoice).toHaveAccessibleName("Leave…");
    const held = leaveChoice.locator('[data-testid^="space-leave-instance-"]');
    expect(await testIds(held)).toEqual([`space-leave-instance-${first.url}`, `space-leave-instance-${third.url}`]);
    for (const [option, name] of [
      [held.nth(0), "Stand-in Git host"],
      [held.nth(1), THIRD_HOST_NAME],
    ] as const) {
      await expect(option).toContainText(name);
      await expect(option).toHaveAttribute("title", `Remove from ${name}`);
      await expect(option).toHaveAccessibleName(`Remove from ${name}`);
    }
    await expect(held.nth(0)).toBeFocused();
    await fit("Groups · the Leave choice open · 320");

    // The third chosen asks inline, Keep focused, and Escape keeps it,
    // focus back on "Leave…" (space-89).
    await leaveChoice.getByTestId(`space-leave-instance-${third.url}`).click();
    const confirm = row.getByTestId(`space-leave-confirm-${KEY}`);
    await expect(confirm).toHaveAttribute("data-stage", "first");
    await expect(confirm).toContainText(`Remove from ${THIRD_HOST_NAME}? Nothing at ${THIRD_HOST_NAME} changes; these records stop syncing there.`);
    await expect(confirm.getByRole("button", { name: "Keep" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(leave).toBeFocused();
    await expect(lines).toHaveCount(2);

    // Remove sends the Leave, "Leaving…" until it stops: the session
    // reached no remaining placement, so it asks again naming the count,
    // Keep focused, and Keep leaves the placement held, the row saying
    // how the Leave stopped (space-89, space-98, space-15).
    await leave.click();
    await leaveChoice.getByTestId(`space-leave-instance-${third.url}`).click();
    const leaving = await watch(page, `[data-testid="space-row-leave-${KEY}"]`);
    await confirm.getByRole("button", { name: "Remove" }).click();
    await expect(confirm).toHaveAttribute("data-stage", "unreceived", { timeout: 30_000 });
    await expect(confirm).toContainText(`1 unit has reached no other instance yet. Remove from ${THIRD_HOST_NAME} anyway?`);
    await expect(confirm.getByRole("button", { name: "Keep" })).toBeFocused();
    expect(await leaving()).toEqual(["Leave…", "Leaving…", "Leave…"]);
    await fit("Groups · Leave… asking again · 320");
    await confirm.getByRole("button", { name: "Keep" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(row.getByTestId(`space-row-caption-${KEY}`)).toHaveText("Check stopped — 1 record has reached no other placement");
    await expect(thirdLine).toHaveAttribute("data-attached", "true");
    expect(placementOf(repositoryOf(await app.core.command("space.get", {}), KEY), third.url).attached).toBe(true);

    // Sync sends the session to both placements.
    await row.getByTestId(`space-row-sync-${KEY}`).click();
    for (const line of [firstLine, thirdLine]) {
      await expect(line.getByTestId("space-line-state")).toHaveText(SENT_LINE, { timeout: 30_000 });
    }
    await expect(row.getByTestId(`space-row-caption-${KEY}`)).toHaveCount(0);
    for (const bare of [firstBare, thirdBare]) {
      await expect.poll(() => headOf(bare, "spex"), { timeout: 30_000 }).toBe(git(clone, "rev-parse", "spex"));
    }

    // Leaving the first, with the row opened: Remove drops it, nothing at
    // the first changing, and the clone moves to the third's path, the
    // row standing under your namespace there, opened as it was, with
    // the third's line alone, the live note saying so and focus on its
    // "Leave…" (space-89, space-98, storage-38).
    await openRepository(page, KEY);
    const atFirst = headOf(firstBare, "spex");
    await leave.click();
    await leaveChoice.getByTestId(`space-leave-instance-${first.url}`).click();
    await expect(confirm).toHaveAttribute("data-stage", "first");
    await expect(confirm).toContainText(`Remove from Stand-in Git host? Nothing at Stand-in Git host changes; these records stop syncing there.`);
    await confirm.getByRole("button", { name: "Remove" }).click();
    const moved = thirdNamespace.getByTestId(`space-row-${MOVED_KEY}`);
    await expect(moved).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    expect(await testIds(moved.getByTestId(`space-lines-${MOVED_KEY}`).locator(":scope > li"))).toEqual([`space-line-${third.url}`]);
    await expect(thirdNamespace.getByTestId(`space-placed-${KEY}`)).toHaveCount(0);
    await expect(page.getByTestId(`space-repo-${MOVED_KEY}`)).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("space-repository")).toHaveAttribute("aria-label", "demo-project-spex");
    await expect(page.getByTestId("space-tab-sync")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("space-live")).toHaveText("Removed from Stand-in Git host");
    const leaveMoved = moved.getByTestId(`space-row-leave-${MOVED_KEY}`);
    await expect(leaveMoved).toHaveAccessibleName(`Remove from ${THIRD_HOST_NAME}`);
    await expect(leaveMoved).toHaveAttribute("title", `Remove from ${THIRD_HOST_NAME}`);
    await expect(leaveMoved).toBeFocused();
    expect(existsSync(clonePath(app.dataDir, MOVED_KEY))).toBe(true);
    expect(existsSync(clone)).toBe(false);
    expect(headOf(firstBare, "spex")).toBe(atFirst);
    await expect
      .poll(async () => (await app.core.command("project.list", {})).find((project) => project.path === app.projectDir)?.id, { timeout: 30_000 })
      .toBe(MOVED_KEY);
    await fit("Groups · moved under the third · 320");

    // Leaving the last, titled and named for the third, asks first, then
    // again naming every unit, none being held by another placement; its
    // Remove drops it, nothing at the third changing, and the clone moves
    // under your own group's folder, on this device only with "Pick a
    // group", focused, still opened (space-89, space-98, storage-38,
    // space-61).
    const atThird = headOf(thirdBare, "spex");
    await leaveMoved.click();
    const lastConfirm = moved.getByTestId(`space-leave-confirm-${MOVED_KEY}`);
    await expect(lastConfirm).toHaveAttribute("data-stage", "first");
    await expect(lastConfirm).toContainText(`Remove from ${THIRD_HOST_NAME}? Nothing at ${THIRD_HOST_NAME} changes; these records stop syncing there.`);
    await lastConfirm.getByRole("button", { name: "Remove" }).click();
    await expect(lastConfirm).toHaveAttribute("data-stage", "unreceived", { timeout: 30_000 });
    await expect(lastConfirm).toContainText(new RegExp(`[1-9]\\d* units have reached no other instance yet\\. Remove from ${THIRD_HOST_NAME} anyway\\?`));
    await lastConfirm.getByRole("button", { name: "Remove" }).click();
    const local = list.getByTestId("space-own").getByTestId(`space-row-${LOCAL_KEY}`);
    await expect(local).toHaveAttribute("data-state", "local-only", { timeout: 30_000 });
    await expect(local.getByTestId(`space-repo-state-${LOCAL_KEY}`)).toHaveText("On this device only");
    await expect(local.getByTestId(`space-row-pick-${LOCAL_KEY}`)).toHaveText("Pick a group");
    await expect(local.getByTestId(`space-row-pick-${LOCAL_KEY}`)).toBeFocused();
    await expect(local.getByTestId(`space-lines-${LOCAL_KEY}`)).toHaveCount(0);
    await expect(local.getByTestId(`space-row-leave-${LOCAL_KEY}`)).toHaveCount(0);
    await expect(local.getByTestId(`space-row-place-${LOCAL_KEY}`)).toHaveCount(0);
    await expect(page.getByTestId(`space-repo-${LOCAL_KEY}`)).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("space-live")).toHaveText(`Removed from ${THIRD_HOST_NAME}`);
    expect(existsSync(clonePath(app.dataDir, LOCAL_KEY))).toBe(true);
    expect(existsSync(clonePath(app.dataDir, MOVED_KEY))).toBe(false);
    expect(headOf(thirdBare, "spex")).toBe(atThird);
    await expect
      .poll(async () => (await app.core.command("project.list", {})).find((project) => project.path === app.projectDir)?.id, { timeout: 30_000 })
      .toBe(LOCAL_KEY);

    expect(defects, defects.join("\n")).toEqual([]);
  });
});

test.describe("one Git backend", () => {
  // Signed in at the first stand-in with the demo project registered; a
  // second stand-in over the first's Git backend, listing the accounts'
  // namespaces under the same ids, and a third on one of its own
  // (git-host-12, DR-128).
  test.use({
    appOptions: {
      host: { second: { backend: "shared" }, third: { backend: "separate" } },
      project: true,
      signedIn: true,
    },
  });

  test("space-1, space-88, space-89, storage-38: a host repository both of two instances over one Git backend list is one placement — your namespace at the second names the project's row and your own group's in one line each, with no control, and Place at… offers the third alone; placed there, leaving the first while it still lists that host repository keeps the opened row, its tabs and focus on the moved clone, not on the row of no clone standing under the former key", async ({
    page,
    app,
  }) => {
    test.setTimeout(180_000);
    const first = app.hosts[0]!;
    const second = app.hosts[1]!;
    const third = app.hosts[2]!;
    const KEY = hostKey(first, NAMESPACE_PATH);
    const MOVED_KEY = hostKey(third, NAMESPACE_PATH);
    // The home signed in at the second and the third, and the project
    // synced in your namespace at the first, which the second lists too
    // (arrange only, space-4, space-58).
    await signInCore(app, second);
    await signInCore(app, third);
    await pickGroup(app, { namespace: true });

    await open(page, app);
    await showGroups(page);

    // Refresh reads every signed-in instance, the second's listing now
    // holding the project (space-1, git-host-5). The row stands in your
    // namespace at the first with that one line; your namespace at the
    // second, whose listing holds the same placement, stands no row for
    // it and names it in one line with no control, as it and your
    // namespace at the first name your own group's own repository
    // (space-1, DR-128).
    await page.getByTestId("space-refresh").click();
    await expect(page.getByTestId("space-refresh")).toHaveText("Refresh", { timeout: 30_000 });
    const row = instanceSection(page, first).getByTestId(`space-group-@${HOST_LOGIN}`).getByTestId(`space-row-${KEY}`);
    await expect(row).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    expect(await testIds(row.getByTestId(`space-lines-${KEY}`).locator(":scope > li"))).toEqual([`space-line-${first.url}`]);
    const secondNamespace = instanceSection(page, second).getByTestId(`space-group-@${HOST_LOGIN}`);
    await expect(secondNamespace.locator(`[data-testid^="space-row-"]`)).toHaveCount(0);
    const placed = secondNamespace.getByTestId(`space-placed-${KEY}`);
    await expect(placed).toHaveText(`demo-project-spex stands under ${HOST_LOGIN} at Stand-in Git host`);
    await expect(placed.getByRole("button")).toHaveCount(0);
    for (const host of [first, second]) {
      const own = instanceSection(page, host).getByTestId(`space-group-@${HOST_LOGIN}`).getByTestId(`space-placed-${OWN_KEY}`);
      await expect(own).toHaveText(`${OWN_NAME} stands under your own group`);
      await expect(own.getByRole("button")).toHaveCount(0);
    }

    // "Place at…" offers the third alone, titled and named for it, the
    // second holding that placement already: it opens the third's picker
    // with no choice, and Cancel closes it, choosing nothing (space-88).
    const place = row.getByTestId(`space-row-place-${KEY}`);
    await expect(place).toHaveText("Place at…");
    await expect(place).toHaveAttribute("title", `Also place at ${THIRD_HOST_NAME}`);
    await expect(place).toHaveAccessibleName(`Also place at ${THIRD_HOST_NAME}`);
    await place.click();
    await expect(row.getByTestId(`space-place-choice-${KEY}`)).toHaveCount(0);
    const picker = row.getByTestId(`space-place-${KEY}`);
    await expect(picker).toHaveAttribute("aria-label", `Also place at ${THIRD_HOST_NAME}`);
    expect(await testIds(picker.locator('[data-testid^="space-pick-instance-"]'))).toEqual([`space-pick-instance-${third.url}`]);
    await picker.getByTestId(`space-pick-cancel-${KEY}`).click();
    await expect(picker).toHaveCount(0);
    expect(await testIds(row.getByTestId(`space-lines-${KEY}`).locator(":scope > li"))).toEqual([`space-line-${first.url}`]);

    // Placed at the third in your namespace there — its only member the
    // account, so no notice — the row holds both placements (space-88,
    // space-97, space-87).
    await place.click();
    const section = await pickSection(picker, third, THIRD_HOST_NAME);
    await section.getByTestId(`space-pick-group-${entryKey(HOST_LOGIN)}`).click();
    await expect(picker).toHaveCount(0);
    await expect(placementLine(page, KEY, third).getByTestId("space-line-state")).toHaveText(SENT_LINE, { timeout: 30_000 });

    // Leaving the first with the row opened, the first still listing that
    // host repository: the clone moves under the third, and the first's
    // listing stands as a row of no clone under the former key, closed;
    // the moved row stays open with its Sync tab, the live note says the
    // placement left, and focus goes to the moved row's Leave… (space-89,
    // space-98, storage-38).
    await openRepository(page, KEY);
    await row.getByTestId(`space-row-leave-${KEY}`).click();
    await row.getByTestId(`space-leave-choice-${KEY}`).getByTestId(`space-leave-instance-${first.url}`).click();
    const confirm = row.getByTestId(`space-leave-confirm-${KEY}`);
    await expect(confirm).toHaveAttribute("data-stage", "first");
    await confirm.getByRole("button", { name: "Remove" }).click();
    const moved = instanceSection(page, third).getByTestId(`space-group-@${HOST_LOGIN}`).getByTestId(`space-row-${MOVED_KEY}`);
    await expect(moved).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    const former = instanceSection(page, first).getByTestId(`space-group-@${HOST_LOGIN}`).getByTestId(`space-row-${KEY}`);
    await expect(former).toHaveAttribute("data-state", "absent");
    await expect(page.getByTestId(`space-repo-${KEY}`)).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId(`space-repo-${MOVED_KEY}`)).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("space-repository")).toHaveAttribute("aria-label", "demo-project-spex");
    await expect(page.getByTestId("space-tab-sync")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("space-live")).toHaveText("Removed from Stand-in Git host");
    await expect(moved.getByTestId(`space-row-leave-${MOVED_KEY}`)).toBeFocused();
    expect(existsSync(clonePath(app.dataDir, MOVED_KEY))).toBe(true);
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
    const TEAM_KEY = hostKey(host, TEAM_PATH);
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
    // units changed on both sides marked, under the placement's instance,
    // and the row reads behind (space-8).
    await expect(tab.getByTestId("space-check")).toHaveText("Check host");
    await tab.getByTestId("space-check").click();
    const incoming = tab.getByTestId("space-incoming-list");
    await expect(tab.getByTestId(`space-incoming-${host.url}`).getByRole("heading", { level: 3 })).toHaveText("Stand-in Git host");
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
    await expect(note).toContainText("Your changes are saved; nothing is pushed to Stand-in Git host yet");
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
    // The host's side names the placement's instance (space-17).
    await expect(sessionGroup).toContainText(/Take host's\s+Stand-in Git host\s+·\s+updated/);
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
    // Applying choices runs Save through Push; filesystem and transport
    // work need more than the generic UI assertion budget.
    await expect(done).toHaveText(/^Synced just now · 1 sent · 2 received$/, { timeout: 30_000 });
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
    // Two passes against the host: Save, Check, Compare and a push the
    // host rejects, then the re-check's Check, Compare, Apply, Refresh
    // and a second rejected push. Twice a sync's work, twice its budget.
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Push stopped — The host changed again", { timeout: 30_000 });
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

    // Members on the placement's line lists the stand-in's members with
    // the host's role names and links no page of the host (space-62,
    // space-87).
    const listed = host.script.repositories.find((repo) => `${repo.group.fullPath}/${repo.path}` === TEAM_PATH)!;
    listed.members.push(PEER_MEMBER);
    const line = page.getByTestId(`space-row-${TEAM_KEY}`).getByTestId(`space-line-${host.url}`);
    await line.getByTestId("space-line-members").click();
    const members = line.getByTestId(`space-members-${TEAM_KEY}@${host.url}`);
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toContainText("Ada Lovelace");
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toContainText("Owner");
    await expect(members.getByTestId(`space-member-${PEER_MEMBER.login}`)).toContainText(PEER_MEMBER.displayName);
    await expect(members.getByTestId(`space-member-${PEER_MEMBER.login}`)).toContainText("Developer");
    await expect(members.locator("a")).toHaveCount(0);
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
    const sessionRoot = `sessions/${session.id}.json`;
    const replayRoot = `sessions/${session.id}.replay.json`;
    const chunkDirectory = `sessions/${session.id}.chunks`;
    const chunkNames = readdirSync(join(clone, chunkDirectory)).sort();
    expect(chunkNames.length).toBeGreaterThan(0);
    expect(chunkNames.every((name) => /^[0-9a-f]{64}$/.test(name))).toBe(true);
    const savedFiles = [sessionRoot, replayRoot, ...chunkNames.map((name) => `${chunkDirectory}/${name}`)]
      .map((path) => ({ path, bytes: readFileSync(join(clone, path)) }));
    for (const file of savedFiles) expect(file.bytes.length).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(JSON.parse(savedFiles[0]!.bytes.toString())).toMatchObject({ schemaVersion: 8, kind: "captain-session-storage", sessionId: session.id });
    const replayDescriptor = JSON.parse(savedFiles[1]!.bytes.toString());
    expect(replayDescriptor).toMatchObject({ schemaVersion: 1, kind: "captain-session-replay", sessionId: session.id });
    expect(replayDescriptor.byteLength).toBeGreaterThan(0);
    expect(replayDescriptor.head.sha256).toMatch(/^[0-9a-f]{64}$/);
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
    // turn: bounded roots and chunks Shared, hints Stays here, and
    // owned files offering Open session (space-23).
    const sessionsDir = tree.getByTestId("space-node-sessions");
    await expect(sessionsDir).toContainText("sessions/");
    await sessionsDir.click();
    const sessionNode = tree.getByTestId(`space-node-session:${session.id}`);
    await expect(sessionNode).toContainText(SESSION_TITLE);
    await sessionNode.click();
    const manifest = tree.getByTestId(`space-node-sessions/${session.id}.json`);
    const records = tree.getByTestId(`space-node-sessions/${session.id}.replay.json`);
    const chunks = tree.getByTestId(`space-node-${chunkDirectory}`);
    const hints = tree.getByTestId(`space-node-sessions/${session.id}.hints.json`);
    await expect(manifest).toContainText("manifest");
    await expect(manifest).toContainText("Shared");
    await expect(manifest.locator("[data-sync]")).toHaveAttribute("data-sync", "shared");
    await expect(records).toContainText("records");
    await expect(records).toContainText("Shared");
    await expect(chunks).toContainText("session chunks");
    await expect(chunks.locator("[data-sync]")).toHaveAttribute("data-sync", "shared");
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

    // Both bounded roots preview as pretty-printed JSON; their owned
    // chunks stay shared, records offer Open session, and hints are withheld.
    const preview = explore.getByTestId("space-preview");
    await manifest.click();
    await expect(preview).toContainText("session manifest");
    await expect(preview.getByTestId("space-preview-owner")).toHaveText(`"${SESSION_TITLE}"`);
    const json = preview.getByTestId("space-preview-text");
    await expect(json).toContainText('"sessionId"');
    expect((await json.textContent())!.startsWith('{\n  "')).toBe(true);
    await records.click();
    await expect(json).toContainText('"captain-session-replay"');
    expect(JSON.parse((await json.textContent())!)).toEqual(replayDescriptor);
    expect((await json.textContent())!.startsWith('{\n  "')).toBe(true);
    await expect(preview.getByRole("button", { name: "Open session" })).toBeVisible();
    await chunks.click();
    const chunk = tree.getByTestId(`space-node-${chunkDirectory}/${chunkNames[0]}`);
    await expect(chunk.locator("[data-sync]")).toHaveAttribute("data-sync", "shared");
    await chunk.click();
    await expect(preview).toContainText("session chunks");
    await expect(preview.getByTestId("space-preview-owner")).toHaveText(`"${SESSION_TITLE}"`);
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
      ["credentials", /this device's sign-in to each instance/],
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

    // Opening the conversation navigates without rewriting its immutable
    // evidence or replacing either bounded root (space-23).
    if ((await sessionsDir.getAttribute("aria-expanded")) !== "true") await sessionsDir.click();
    if ((await sessionNode.getAttribute("aria-expanded")) !== "true") await sessionNode.click();
    await records.click();
    await preview.getByRole("button", { name: "Open session" }).click();
    await expect(page.getByRole("tab", { name: new RegExp(SESSION_TITLE, "i") })).toHaveAttribute("aria-selected", "true");
    for (const file of savedFiles) expect(readFileSync(join(clone, file.path))).toEqual(file.bytes);
    expect(readdirSync(join(clone, chunkDirectory)).sort()).toEqual(chunkNames);
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
  await app.core.command("draft.create", { projectId, draftId: "triage", org: "acme", license: "Apache-2.0" });
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
    const TEAM_KEY = hostKey(app.host!, TEAM_PATH);
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
      '[data-testid="space-instance-heading"] > div',
      '[data-testid="space-groups"] h2',
      '[data-testid="space-groups"] h3',
      '[data-testid^="space-row-"]',
      '[data-testid^="space-line-"]',
      '[data-testid^="space-place-"]',
      '[data-testid^="space-leave-"]',
      '[data-testid^="space-incoming-"]',
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
    // "Leave…" asking beneath the row fits at the floor too (space-89,
    // space-28).
    await setRail(page, false);
    await page.setViewportSize({ width: 320, height: TALL });
    await page.getByTestId(`space-row-leave-${TEAM_KEY}`).click();
    const leaveConfirm = page.getByTestId(`space-leave-confirm-${TEAM_KEY}`);
    await expect(leaveConfirm).toBeVisible();
    record(`Groups · Leave… asking · sidebar collapsed · 320×${TALL}`, await measure(page, containers), defects);
    await leaveConfirm.getByRole("button", { name: "Keep" }).click();
    await expect(leaveConfirm).toHaveCount(0);
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
      const TEAM_KEY = hostKey(app.host!, TEAM_PATH);
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
    // reads reachable once the code is there, and the project lists in
    // the sidebar with the peer's session and intent (space-63,
    // space-61, space-20).
    await join_.click();
    const editor = page.getByTestId(`space-join-${key}`);
    await expect(editor).toContainText("Folder for its code on this device");
    await editor.getByTestId(`space-join-${key}-path`).fill(folder);
    await editor.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page.getByTestId(`space-row-${key}`)).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    // The joined clone holds the host's `spex`: it reads synced at the
    // peer's last push, never "Never synced" (space-61).
    await expect(page.getByTestId(`space-repo-state-${key}`)).toHaveText(/^Synced (just now|\d+m ago)$/);
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
    await page.getByRole("tab", { name: "New task" }).click();
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
    // It leads with where the records go: the placement's path at its
    // instance, as its line names them (space-57, space-87).
    const placed = page.getByTestId(`space-row-${key}`).getByTestId(`space-line-${host.url}`);
    const at = await placed.getByTestId("space-line-at").textContent();
    await expect(notice).toContainText(`Records go to ${at} at Stand-in Git host.`);
    await expect(notice).toContainText("Every session goes there whole — hidden parts and attachments included");
    await notice.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByTestId("space-done-line")).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    const tracked = git(bareOf(host, key), "ls-tree", "-r", "--name-only", "spex").split("\n");
    expect(tracked).toContain(`sessions/${ownSession}.json`);
    expect(tracked).toContain(`sessions/${peerSession}.json`);
  });
});

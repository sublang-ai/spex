// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's journeys (DR-103, DR-057, DR-172), against the
// stand-in Git host (git-host-12): the first start and the first
// sign-in by the device flow the served shell runs, from the card
// titled "Sign in to a Space" (space-40); a folder added while signed
// in, shared into a group from the palette (space-58, projects-1), and
// at two Spaces (projects-17); a folder joining a team's project, which
// asks the sharing confirm first (space-81); the organizer making a
// group, sharing a project into it and adding a member (space-71); the
// surface naming nothing behind the Space, in English and in Chinese
// (space-75); a second Space signed in from "Add a Space…", a project
// shared into it and pushed there, the first signed out, refused
// "Remove from this list" and signed in again (space-85); the daily
// sync with choices made by keyboard, a Space that moves under the
// send, Stop against a sleeping transport and the members (space-41);
// the explorer with what stays on this computer and Copy path
// (space-42); fit at every width in both sidebar states (space-43); axe
// in both themes (space-44); and a second computer opening a project a
// peer pushed (space-36). The acts DR-172 cuts — Move, Place at, Leave,
// Attach, Rename, Delete and New subgroup — are asserted unoffered where
// a journey opens the menus that held them.
// Every host is the in-process stand-in on loopback, every peer plain
// Git on its bare repositories, and the exploring journey's remote a
// bare path: hermetic, no network, no credential of the machine's.

import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { STANDIN_STORAGE, seedDemoProject } from "@sublang/spex-core/testing";

import {
  E2E_OWN,
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
  arrangeHostPeer,
  bareOf,
  chooseSpace,
  chosenSpace,
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
  spaceAddress,
  spaceChooser,
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

/** The stand-ins' display names (git-host-12): each names its Space on
 * the surface, as any display name may, so a scan for the words the
 * surface never says reads past them — "Stand-in Git host" holds one. */
const DISPLAY_NAMES = ["Stand-in Git host", SECOND_HOST_NAME];

/** Git's own words, a host's `spex` branch and the records' `-spex`
 * suffix, which never lead on the surface (space-27, space-41). */
const GIT_WORDS = /\b(ours|theirs|HEAD|MERGE_HEAD)\b|origin\/spex|@[^\s/]+\/spex|-spex\b/;

/** The words the surface never says for a Space's things (space-27,
 * space-41). */
const SPACE_WORDS = /\b(instances?|hosts?|namespaces?|devices?|spex repositor(?:y|ies))\b/i;

/** Note any forbidden word in the surface's visible text (space-27,
 * space-41). It reads the Space surface alone: space-27 governs the copy
 * on the surface, so the Projects tree, the Captain home and a session's
 * transcript a journey also shows are other surfaces' words, which no
 * space item governs. A placement's line names its path in the Space
 * (space-87), the one place the records' path reads, and each display
 * name is a Space's own name; both are read past. */
async function scanVocabulary(page: Page, where: string, found: string[]): Promise<void> {
  const surface = page.getByTestId("space-surface");
  let text = await surface.innerText();
  for (const path of await surface.locator('[data-testid="space-line-at"]').allInnerTexts()) {
    if (path.trim()) text = text.split(path.trim()).join(" ");
  }
  for (const name of DISPLAY_NAMES) text = text.split(name).join(" ");
  for (const words of [GIT_WORDS, SPACE_WORDS]) {
    const hit = words.exec(text);
    if (hit) found.push(`${where}: "${hit[0]}" in "${text.slice(Math.max(0, hit.index - 40), hit.index + 40)}"`);
  }
}

/** The words no text, title or accessible name on the surface says
 * (space-75, space-27): "instance", "placement", "seat" and "spex
 * repository", and the Chinese terms the glossary retires
 * (localization-6). */
const LEAK_WORDS = /\b(instances?|placements?|seats?|spex repositor(?:y|ies))\b|实例|托管平台|放置|此设备/i;

/** Every text, title, accessible name and link target on the Space
 * surface that names something behind a Space (space-1, space-75): a
 * URL under any stand-in's own, its storage group or the Git system —
 * or a word no surface says for a Space's things. */
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
  return said.filter(
    (text) =>
      hosts.some((host) => text.includes(`${host.url}/`) || text.includes(host.storage)) ||
      /gitlab/i.test(text) ||
      LEAK_WORDS.test(text),
  );
}

/** A full stop ending a clause: a sentence, which the sign-in card never
 * holds (space-3, DR-069). */
const SENTENCE = /[.。](\s|$)/;

/** Assert that an element's visible text holds no sentence. */
async function expectNoSentence(where: Locator, what: string): Promise<void> {
  const text = await where.innerText();
  expect(text, `${what}: ${text}`).not.toMatch(SENTENCE);
}

/** The three phrases the sharing confirm stands over (space-57). */
const SHARING_PHRASES = [
  "Every session, whole, attachments included",
  "Past and future records",
  "Members keep what they download",
];

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
async function showGroups(page: Page): Promise<void> {
  await nav(page, "Space").click();
  await expect(page.getByTestId("space-surface")).toBeVisible();
  await expect(page.getByTestId("space-header")).toBeVisible();
}

/** Activate a project's row by its name, opening its Sync and Explore
 * tabs beneath the groups list, the Sync tab carrying its placements'
 * lines (space-1, space-87). */
async function openRepository(page: Page, key: string): Promise<void> {
  const row = page.getByTestId(`space-repo-${key}`);
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("space-repository")).toBeVisible();
}

/** A menu's entry (space-1, space-111): its trigger opened where the
 * menu is not standing. Escape closes it again. */
async function menuEntry(page: Page, trigger: string, entry: string): Promise<Locator> {
  const menu = page.getByTestId(`${trigger}-menu`);
  if ((await menu.count()) === 0) await page.getByTestId(trigger).click();
  await expect(menu).toBeVisible();
  return menu.getByTestId(entry);
}

/** Activate a menu's entry: its trigger opened, the entry clicked. */
async function menuAct(page: Page, trigger: string, entry: string): Promise<void> {
  await (await menuEntry(page, trigger, entry)).click();
  await expect(page.getByTestId(`${trigger}-menu`)).toHaveCount(0);
}

/** A row's act from its one overflow control, "More" (space-1):
 * `sync`, `members`, `explore`. */
async function rowAct(page: Page, key: string, act: string): Promise<void> {
  await menuAct(page, `space-row-more-${key}`, `space-row-${act}-${key}`);
}

/** A row's "More" entry by its act, the menu left standing. */
function rowEntry(page: Page, key: string, act: string): Promise<Locator> {
  return menuEntry(page, `space-row-more-${key}`, `space-row-${act}-${key}`);
}

/** What a project row's "More" holds (space-1): "Sync now", Members and
 * "Explore records", and none of the acts DR-172 cuts — "Move…",
 * "Place at…", "Leave…" or Attach. The menu is left standing. */
async function expectRowMenu(page: Page, key: string): Promise<void> {
  await rowEntry(page, key, "sync");
  await expect(page.getByTestId(`space-row-more-${key}-menu`).getByRole("menuitem")).toHaveText([
    "Sync now",
    "Members",
    "Explore records",
  ]);
}

/** A Space heading's "More" entry, "Remove from this list" (space-1,
 * space-82), its menu opened where it is not standing: each heading
 * carries its own "More", found within its section. */
async function removeEntry(section: Locator): Promise<Locator> {
  const menu = section.getByTestId("space-instance-more-menu");
  if ((await menu.count()) === 0) await section.getByTestId("space-instance-more").click();
  await expect(menu).toBeVisible();
  return menu.getByTestId("space-instance-remove");
}

/** A group heading's act from its "More" (space-1): `members`. */
async function groupAct(page: Page, path: string, act: string): Promise<void> {
  await menuAct(page, `space-group-more-${path}`, `space-group-${act}-${path}`);
}

/** Close whatever menu stands, by Escape. */
async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="menu"]')).toHaveCount(0);
}

/** A row's one standing phrase (space-120). */
const phraseOf = (page: Page, key: string): Locator => page.getByTestId(`space-repo-state-${key}`);

/** A row reading no phrase (space-120): its phrase empty, or absent. */
async function expectNoPhrase(page: Page, key: string): Promise<void> {
  const phrase = phraseOf(page, key);
  await expect
    .poll(async () => ((await phrase.count()) === 0 ? "" : (await phrase.first().innerText()).trim()))
    .toBe("");
}

/** How a group picker's "Share into" reads each of the stand-in's
 * entries (space-58): your namespace "Personal", first, then a group by
 * its name and its path after the separator where the two differ, as the
 * list reads them (space-1). */
const PICKED_AS: Record<string, string> = {
  [HOST_LOGIN]: "Personal",
  [HOST_GROUP]: `Acme · ${HOST_GROUP}`,
  [`${HOST_GROUP}/research`]: `Research · ${HOST_GROUP}/research`,
};

/** An entry's key in a picker's test ids: your namespace by `@` and
 * your login, which begins no path the host answers, a group by its
 * path (DR-127). */
const entryKey = (entry: string): string => (entry === HOST_LOGIN ? `@${HOST_LOGIN}` : entry);

/** A group picker's section for a Space (space-58): what it offers
 * there, under the Space's display name — the first stand-in's unless
 * another is named — and no field naming the new records. */
async function pickSection(picker: Locator, host: { url: string }, name = "Stand-in Git host"): Promise<Locator> {
  const section = picker.getByTestId(`space-pick-instance-${host.url}`);
  await expect(section.getByRole("heading", { level: 3 })).toHaveText(name);
  await expect(section.getByRole("textbox")).toHaveCount(0);
  return section;
}

/** The step lines in their order (space-12): the Check step names the
 * Space it checks. */
const STEP_LINES = [/^Saving…$/, /^Checking \S.*…$/, /^Comparing…$/, /^Merging…$/, /^Reloading…$/, /^Sending…$/];

/** Whether `seen` names steps in the rail's order, skipping none twice. */
function inStepOrder(seen: string[]): boolean {
  let last = -1;
  for (const line of seen) {
    const index = STEP_LINES.findIndex((step) => step.test(line));
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

/** The demo project's records once shared into the team group: their
 * path in the Space, their key under the stand-in's folder (DR-127). */
const TEAM_PATH = `${HOST_GROUP}/demo-project-spex`;
/** Your own records before any sign-in (storage-2). */
const OWN_BEFORE = `${E2E_OWN}/${E2E_OWN}-spex`;
/** Your own records once signed in (space-59). */
const OWN_KEY = `${HOST_LOGIN}/${HOST_LOGIN}-spex`;
/** The routes of the public registry's directory, which a journey
 * routing the public registry to the stand-in has it answer (space-115,
 * space-119): no call of the Space itself. */
const DIRECTORY_ROUTES = ["/api/v1/spaces", "/api/v1/registry"];

// ---------------------------------------------------------------------------
// space-40: the first start and the first sign-in
// ---------------------------------------------------------------------------

test.describe("first start", () => {
  // The public registry's directory routed to the stand-in, which lists
  // itself by its display name (git-host-12), so the card's chooser
  // reads it (space-115).
  test.use({ appOptions: { host: true, independentRegistry: true } });

  test("space-40: signed out, a project added, the device sign-in, a project shared into a group, a session and an intent sent", async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    const host = app.host!;
    const TEAM_KEY = hostKey(host, TEAM_PATH);
    await open(page, app);
    await showGroups(page);
    const header = page.getByTestId("space-header");
    const card = header.getByTestId("space-signin-card");

    // Signed out: the header is the card titled "Sign in to a Space" with
    // no sentence, its chooser preselecting the default instance — the
    // stand-in, by its display name, the field captioned "Space address"
    // standing behind "Other Space…" — and Sign in its one primary
    // control, with no home path or Refresh (space-3, space-115,
    // space-1).
    await expect(card.getByRole("heading", { name: "Sign in to a Space", exact: true })).toBeVisible();
    await expect.poll(() => chosenSpace(card)).toContain("Stand-in Git host");
    await expect(spaceAddress(card)).toBeHidden();
    await expect(card.getByTestId("space-signin")).toHaveText("Sign in");
    await expect(header.locator("button.bg-brand-600")).toHaveCount(1);
    await expect(header.locator("button.bg-brand-600")).toHaveAttribute("data-testid", "space-signin");
    await expectNoSentence(card, "the sign-in card");
    await expect(page.getByTestId("space-refresh")).toHaveCount(0);
    await expect(page.getByTestId("space-home")).toHaveCount(0);

    // "This computer" alone stands beneath it, its "Your sessions" row
    // reading no phrase and carrying no control but its name and its
    // overflow (space-1, space-61, space-120).
    const groups = page.getByTestId("space-groups");
    await expect(groups.locator('[data-testid^="space-instance-"]')).toHaveCount(0);
    await expect(groups.locator('[data-testid^="space-group-"]')).toHaveCount(0);
    const here = groups.getByTestId("space-own");
    await expect(here).toHaveAttribute("role", "group");
    await expect(here).toHaveAttribute("aria-label", "This computer");
    await expect(here.getByRole("heading").first()).toHaveText("This computer");
    await expect(here.locator('li[data-testid^="space-row-"]')).toHaveCount(1);
    const ownRow = here.getByTestId(`space-row-${OWN_BEFORE}`);
    await expect(page.getByTestId(`space-repo-${OWN_BEFORE}`)).toHaveText("Your sessions");
    await expectNoPhrase(page, OWN_BEFORE);
    const controls = 'button:not([data-testid^="space-repo-"]):not([data-testid^="space-row-more-"])';
    await expect(ownRow.locator(controls)).toHaveCount(0);
    // This Space was not contacted: only the public registry's directory,
    // which the stand-in answers in the registry's place, was read.
    expect(
      host.script.requests.filter((request) => request.path.startsWith("/api/") && !DIRECTORY_ROUTES.includes(request.path)),
    ).toEqual([]);

    // A project added from the palette lists under "This computer" with
    // no phrase and "Add to a group…" disabled and titled "Sign in to a
    // Space first" (space-61).
    seedDemoProject(app.projectDir);
    await page.getByTestId("sidebar").getByRole("button", { name: "Add a local project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    await expect(palette).toBeHidden();
    await showGroups(page);
    const localKey = `${E2E_OWN}/demo-project-spex`;
    await expect(here.getByTestId(`space-row-${localKey}`)).toBeVisible();
    await expect(page.getByTestId(`space-repo-${localKey}`)).toHaveText("demo-project");
    await expectNoPhrase(page, localKey);
    const pickBefore = page.getByTestId(`space-row-pick-${localKey}`);
    await expect(pickBefore).toHaveText("Add to a group…");
    await expect(pickBefore).toBeDisabled();
    await expect(pickBefore).toHaveAttribute("title", "Sign in to a Space first");

    // Sign in reads "Continue in your browser" with the link "Open
    // <Space>" — the stand-in's display name — to the page that carries
    // the code, shows no code and no sentence, and reads "Signing in…"
    // disabled beside Cancel, no other control offering a sign-in; Cancel
    // brings back the chooser and Sign in (space-3).
    await card.getByTestId("space-signin").click();
    await expect(card).toContainText("Continue in your browser");
    await expect(card.getByTestId("space-signin-link")).toHaveText("Open Stand-in Git host");
    await expect(card.getByTestId("space-signin")).toHaveText("Signing in…");
    await expect(card.getByTestId("space-signin")).toBeDisabled();
    await expectNoSentence(card, "the sign-in in flight");
    await expect(page.getByTestId("space-surface").getByRole("button", { name: /^Sign/ })).toHaveCount(1);
    await card.getByTestId("space-signin-cancel").click();
    await expect(card.getByTestId("space-signin")).toHaveText("Sign in");
    await expect.poll(() => chosenSpace(card)).toContain("Stand-in Git host");

    // Signed in through the device flow the stand-in approves: the
    // instance's heading reads its display name beside the account's
    // login, with Sign out, and the header Refresh; "Your sessions"
    // stands under "Personal", whose heading carries no control; and the
    // surface ends in where this computer's files are kept (space-3,
    // space-4, space-1).
    await signInThroughPage(page, app);
    const instance = instanceSection(page, host);
    await expect(instance).toHaveAttribute("aria-label", "Stand-in Git host");
    const heading = instance.getByTestId("space-instance-heading");
    await expect(heading.getByRole("heading", { level: 2 })).toHaveText(`Stand-in Git host · @${HOST_LOGIN}`);
    await expect(heading.getByTestId("space-signout")).toHaveText("Sign out");
    await expect(header.getByTestId("space-signin-card")).toHaveCount(0);
    await expect(header.getByTestId("space-signout")).toHaveCount(0);
    await expect(header.getByTestId("space-refresh")).toHaveText("Refresh");
    await expect(page.getByTestId("space-home")).toHaveText(/^Spex keeps this computer's files in /);
    await expect(page.getByTestId("space-home")).toHaveAttribute("title", app.dataDir);
    const personal = instance.getByTestId(`space-group-@${HOST_LOGIN}`);
    await expect(personal.getByRole("heading", { level: 3 }).first()).toHaveText("Personal");
    await expect(personal.getByTestId(`space-row-${OWN_KEY}`)).toBeVisible();
    await expect(page.getByTestId(`space-repo-${OWN_KEY}`)).toHaveAccessibleName("Your sessions");
    await expect(personal.locator('[data-testid^="space-group-more-"]')).toHaveCount(0);
    // The project stays under "This computer", with no phrase, its
    // "Add to a group…" now offered (space-1, space-61).
    const projectKey = `${HOST_LOGIN}/demo-project-spex`;
    await expect(here.getByTestId(`space-row-${projectKey}`)).toBeVisible();
    await expect(here.getByTestId(`space-row-${OWN_KEY}`)).toHaveCount(0);
    await expectNoPhrase(page, projectKey);
    // Your own records stand on the host, pushed (space-4).
    await expect.poll(() => host.script.repositories.map((repo) => `${repo.group.fullPath}/${repo.path}`)).toContain(OWN_KEY);
    await expect.poll(() => headOf(bareOf(host, OWN_KEY), "spex"), { timeout: 30_000 }).toMatch(/^[0-9a-f]{40}$/);

    // "Add to a group…" offers, under the stand-in's display name, "Share
    // into" with "Personal" first and then its groups, each by its name
    // and its path, and no field naming the new records; picking the
    // team's turns the row reachable with a sync time, the stand-in
    // holding `<name>-spex` on its `spex` branch (space-58, space-12).
    const pick = page.getByTestId(`space-row-pick-${projectKey}`);
    await expect(pick).toHaveText("Add to a group…");
    await expect(pick).toBeEnabled();
    await pick.click();
    const picker = page.getByTestId(`space-picker-${projectKey}`);
    await expect(picker).toBeVisible();
    await expect(picker.locator('[data-testid^="space-pick-instance-"]')).toHaveCount(1);
    const section = await pickSection(picker, host);
    await expect(section).toContainText("Share into");
    await expect(section.locator('[data-testid^="space-pick-group-"]')).toHaveText([
      PICKED_AS[HOST_LOGIN]!,
      PICKED_AS[HOST_GROUP]!,
      PICKED_AS[`${HOST_GROUP}/research`]!,
    ]);
    await section.getByTestId(`space-pick-group-${HOST_GROUP}`).click();
    await expect(page.getByTestId(`space-repo-state-${TEAM_KEY}`)).toHaveText("Synced just now", { timeout: 30_000 });
    await expect(page.getByTestId(`space-row-${TEAM_KEY}`)).toHaveAttribute("data-state", "reachable");
    await expect(page.getByTestId(`space-repo-${TEAM_KEY}`)).toHaveText("demo-project");
    // No placement's line on the row: in its Sync tab, the row's name
    // opening it, its one placement's line names the stand-in by its
    // display name and the records' path there, and says what the sync
    // did there (space-87, space-12).
    await expect(page.getByTestId(`space-row-${TEAM_KEY}`).locator('[data-testid^="space-line-"]')).toHaveCount(0);
    await openRepository(page, TEAM_KEY);
    const line = placementLine(page, TEAM_KEY, host);
    await expect(line).toHaveAttribute("data-state", "reachable");
    await expect(line.getByTestId("space-line-instance")).toHaveText("Stand-in Git host");
    await expect(line.getByTestId("space-line-at")).toHaveText(TEAM_PATH);
    await expect(line.getByTestId("space-line-state")).toHaveText(/^Synced just now/);
    // "Sync now" stands in the row's overflow beside Members and
    // "Explore records", and nothing else (space-1).
    await expectRowMenu(page, TEAM_KEY);
    await closeMenu(page);
    const clone = clonePath(app.dataDir, TEAM_KEY);
    expect(git(bareOf(host, TEAM_KEY), "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));

    // A session run from the Captain home lists under the records' "To
    // send (1)" by its title, the row reading "1 to send"; Open session
    // opens its tab; Sync sends it, the host's `spex` holding both bundle
    // files (space-7, space-120, space-12). The project's key moved with
    // the sign-in and the pick (space-59, space-58, space-60); the page
    // follows it with no reload, so the Captain home addresses the
    // project where it now is.
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
    await expect(panel.getByRole("heading", { name: "To send (1)", exact: true })).toBeVisible();
    await expect(phraseOf(page, TEAM_KEY)).toHaveText("1 to send");
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
    // "Sync now" sends it, the row's phrase naming each step in flight
    // and then its last sync (space-12, space-120).
    const phrases = await watch(page, `[data-testid="space-repo-state-${TEAM_KEY}"]`);
    await rowAct(page, TEAM_KEY, "sync");
    const done = panel.getByTestId("space-done-line");
    await expect(done).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    await expect(phraseOf(page, TEAM_KEY)).toHaveText("Synced just now");
    const seen = await phrases();
    expect(seen[0]).toBe("1 to send");
    expect(seen.at(-1)).toBe("Synced just now");
    expect(inStepOrder(seen.slice(1, -1)), seen.join(" → ")).toBe(true);
    await expect(await rowEntry(page, TEAM_KEY, "sync")).toHaveText("Sync now");
    await closeMenu(page);
    await expect(panel.getByTestId("space-sync-tab")).toContainText("Nothing to send from this computer");
    const tracked = git(bareOf(host, TEAM_KEY), "ls-tree", "-r", "--name-only", "spex").split("\n");
    expect(tracked).toContain(`sessions/${sessionId}.json`);
    expect(tracked).toContain(`sessions/${sessionId}.replay.json`);
    expect(tracked.some((path) => path.endsWith(".hints.json") || path.startsWith("local/"))).toBe(false);

    // An intent queued while Space is shown lists under "To send (1)"
    // with Refresh never activated — the ledger's announcement re-reads
    // the state — the row reading "1 to send" (space-2, space-7,
    // space-120).
    await app.core.command("intent.queue", { projectId: TEAM_KEY, text: "Queued while Space is shown" });
    const intentRow = local.locator('[data-testid^="space-unit-mine-intents/"]');
    await expect(intentRow).toHaveCount(1);
    await expect(intentRow).toContainText("Queued while Space is shown");
    await expect(intentRow).toHaveAttribute("data-change", "new");
    await expect(panel.getByRole("heading", { name: "To send (1)", exact: true })).toBeVisible();
    await expect(phraseOf(page, TEAM_KEY)).toHaveText("1 to send");
  });
});

// ---------------------------------------------------------------------------
// space-58, projects-1: a folder added while signed in
// ---------------------------------------------------------------------------

test.describe("a folder added while signed in", () => {
  test.use({ appOptions: { host: true, signedIn: true } });

  test("space-58, projects-1: the palette's Add asks for the group in place, and a pick shares the project there", async ({
    page,
    app,
  }) => {
    test.setTimeout(120_000);
    const host = app.host!;
    const TEAM_KEY = hostKey(host, TEAM_PATH);
    seedDemoProject(app.projectDir);
    await open(page, app);

    // The folder pairs with records through the picker, standing in the
    // palette in place of its list: under the stand-in's display name,
    // "Share into" with "Personal" first and then its groups, and no
    // field naming the new records (projects-1, space-58).
    await page.getByTestId("sidebar").getByRole("button", { name: "Add a local project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    const localKey = `${HOST_LOGIN}/demo-project-spex`;
    const picker = palette.getByTestId(`space-picker-${localKey}`);
    await expect(picker).toBeVisible();
    await expect(palette.getByTestId("palette-path")).toHaveCount(0);
    const section = await pickSection(picker, host);
    await expect(section).toContainText("Share into");
    await expect(section.locator('[data-testid^="space-pick-group-"]')).toHaveText([
      PICKED_AS[HOST_LOGIN]!,
      PICKED_AS[HOST_GROUP]!,
      PICKED_AS[`${HOST_GROUP}/research`]!,
    ]);

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
// projects-17, projects-1, space-58: a folder added at two Spaces
// ---------------------------------------------------------------------------

test.describe("a folder added while signed in at two Spaces", () => {
  // A second stand-in on a Git backend of its own, holding its own
  // `acme` (git-host-12, DR-127).
  test.use({ appOptions: { host: { second: { backend: "separate" } }, signedIn: true } });

  test("projects-17, projects-1, space-58: the palette's picker offers the acme of each Space, and picking the second's pairs the folder with records the second lists and the first does not", async ({
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

    // The palette's Add asks in place, under each signed-in Space's
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
// space-81: a pick joining a team's project asks the sharing confirm first
// ---------------------------------------------------------------------------

test.describe("a folder joining a team's project", () => {
  test.use({ appOptions: { host: true, signedIn: true } });

  for (const unknown of [false, true]) {
    test(`space-81: a pick joining a team's project ${unknown ? "whose members' count is unknown" : "with another member"} asks the sharing confirm in the picker, and Share joins it`, async ({
      page,
      app,
    }) => {
      test.setTimeout(120_000);
      const host = app.host!;
      // The team's project a peer pushed, `bob` its member beside the
      // account, its `project.json` as the peer's Spex writes it; this
      // computer's folder holds the same code, added while signed in, so
      // its records are on this computer only and the two agree on that
      // file.
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
      // The folder's records stand under "This computer", reading no
      // phrase (space-1, space-120).
      await expect(page.getByTestId("space-own").getByTestId(`space-row-${localKey}`)).toBeVisible();
      await expectNoPhrase(page, localKey);

      // "Add to a group…" lists the team's project for the same code
      // under "Join the records already in", by its name, with its group
      // read as its heading reads and no member count from the full read
      // (space-58).
      await page.getByTestId(`space-row-pick-${localKey}`).click();
      const picker = page.getByTestId(`space-picker-${localKey}`);
      const section = await pickSection(picker, host);
      await expect(section).toContainText("Join the records already in");
      const listed = section.getByTestId(`space-pick-repo-${key}`);
      await expect(listed).toContainText("demo-project");
      await expect(listed).not.toContainText("-spex");
      await expect(section.getByTestId(`space-pick-listed-group-${key}`)).toHaveText(PICKED_AS[HOST_GROUP]!);
      await expect(listed).not.toContainText("member");

      // Picking it shows the sharing confirm in the picker, beneath it,
      // titled "Share with Acme at <display name>?" over its three
      // phrases, Cancel focused; Escape closes the confirm alone and
      // sends nothing, focus back on the records (space-57).
      await listed.click();
      const confirm = picker.getByTestId(`space-pick-notice-${localKey}`);
      await expect(confirm).toContainText("Share with Acme at Stand-in Git host?");
      for (const phrase of SHARING_PHRASES) await expect(confirm).toContainText(phrase);
      await expect(confirm.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(confirm).toHaveCount(0);
      await expect(picker).toBeVisible();
      await expect(listed).toBeFocused();
      expect(repositoryOf(await app.core.command("space.get", {}), localKey).state).toBe("local-only");

      // Share joins it: the picker closes, the project's row stands
      // reachable in the team's group with the confirm recorded, and the
      // peer's records are in the clone, which the stand-in holds
      // (space-57, space-58, space-13).
      await listed.click();
      await confirm.getByRole("button", { name: "Share", exact: true }).click();
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
// space-71: the organizer's group and members
// ---------------------------------------------------------------------------

test.describe("organizing", () => {
  test.use({ appOptions: { host: true, signedIn: true } });

  test("space-71: a group made at the Space's heading, a project shared into it, a member added, refused twice and removed", async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    const host = app.host!;
    // By default the stand-in lets the person create groups at the
    // instance's root and manage members there (git-host-12): what the
    // sign-in's read already said.
    expect(host.script.canCreateGroup).toBe(true);
    const MEMBER = host.script.accounts.find((account) => account.login === "grace")!;
    const UNKNOWN = "zed";
    expect(host.script.accounts.some((account) => account.login === UNKNOWN)).toBe(false);
    const standinGroup = (fullPath: string) => host.script.groups.find((group) => group.fullPath === fullPath);
    const standinMembers = (fullPath: string) => (standinGroup(fullPath)?.members ?? []).map((m) => `${m.login}:${m.role}`);

    await open(page, app);
    await showGroups(page);
    const list = page.getByTestId("space-groups");

    // "New group" stands on the Space's heading; Create names the group,
    // which stands by its name as the editor closes, its full path naming
    // its section (space-1, space-68).
    const newGroup = instanceSection(page, host).getByTestId("space-instance-heading").getByTestId("space-new-group");
    await expect(newGroup).toHaveText("New group");
    await expect(newGroup).toBeEnabled();
    await newGroup.click();
    const top = list.getByTestId("space-new-group-editor");
    await expect(top).toContainText("Group name");
    await top.getByTestId("space-new-group-editor-name").fill("Platform");
    await top.getByTestId("space-new-group-editor-create").click();
    await expect(top).toBeHidden();
    const platform = list.getByTestId("space-group-platform");
    await expect(platform.getByRole("heading").first()).toHaveText(/^Platform( · platform)?( · \d+ members?)?$/);
    await expect(platform).toHaveAttribute("aria-label", "platform");
    expect(standinGroup("platform")?.name).toBe("Platform");
    // Its heading's "More" holds Members alone: no "New subgroup",
    // Rename or Delete (space-1).
    await expect(await menuEntry(page, "space-group-more-platform", "space-group-members-platform")).toHaveText("Members");
    await expect(page.getByTestId("space-group-more-platform-menu").getByRole("menuitem")).toHaveCount(1);
    await closeMenu(page);

    // A project added from the palette is offered, under the stand-in's
    // display name and "Share into", "Personal" and then every group by
    // its name, its path after it where the two differ, and shared into
    // the new group: `<name>-spex` stands there on the stand-in's `spex`
    // (space-58).
    seedDemoProject(app.projectDir);
    await page.getByTestId("sidebar").getByRole("button", { name: "Add a local project" }).click();
    const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
    await palette.getByTestId("palette-path").fill(app.projectDir);
    await palette.getByTestId("palette-add").click();
    const localKey = `${HOST_LOGIN}/demo-project-spex`;
    const picker = palette.getByTestId(`space-picker-${localKey}`);
    const section = await pickSection(picker, host);
    await expect(section).toContainText("Share into");
    await expect(section.locator('[data-testid^="space-pick-group-"]')).toHaveText([
      PICKED_AS[HOST_LOGIN]!,
      PICKED_AS[HOST_GROUP]!,
      PICKED_AS[`${HOST_GROUP}/research`]!,
      "Platform · platform",
    ]);
    await section.getByTestId("space-pick-group-platform").click();
    await expect(palette).toBeHidden();
    await showGroups(page);
    const picked = hostKey(host, "platform/demo-project-spex");
    await expect(platform.getByTestId(`space-repo-state-${picked}`)).toHaveText("Synced just now", { timeout: 30_000 });
    expect(headOf(bareOf(host, picked), "spex")).toMatch(/^[0-9a-f]{40}$/);

    // Share on the new group stands in the members panel Members in its
    // heading's "More" opens, listing the person who made it (space-62,
    // space-69).
    await groupAct(page, "platform", "members");
    const PANEL = "group:platform";
    const members = platform.getByTestId(`space-members-${PANEL}`);
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toContainText("Owner");
    await expect(members.getByTestId(`space-member-${MEMBER.login}`)).toHaveCount(0);

    // Share adds a login at Maintainer, its field captioned "Login at
    // <display name>": the line says so, the panel lists the member the
    // reply carries by login alone, and the stand-in holds them
    // (space-69, space-62).
    const share = members.getByTestId(`space-share-${PANEL}`);
    await expect(share).toHaveText("Share");
    await share.click();
    const editor = members.getByTestId(`space-share-${PANEL}-editor`);
    await expect(editor).toContainText("Login at Stand-in Git host");
    const login = editor.getByTestId(`space-share-${PANEL}-login`);
    await login.fill(MEMBER.login);
    await editor.getByTestId(`space-share-${PANEL}-role`).selectOption({ label: "Maintainer" });
    await editor.getByTestId(`space-share-${PANEL}-add`).click();
    await expect(editor).toBeHidden();
    await expect(members.getByTestId(`space-members-outcome-${PANEL}`)).toHaveText(`@${MEMBER.login} added as Maintainer`);
    const row = members.getByTestId(`space-member-${MEMBER.login}`);
    await expect(row).toContainText(MEMBER.login);
    await expect(row).not.toContainText(MEMBER.displayName!);
    await expect(row).toContainText("Maintainer");
    expect(standinMembers("platform")).toContain(`${MEMBER.login}:Maintainer`);

    // The same login again is refused in place with the stand-in's
    // words, the login kept (space-69).
    await share.click();
    await expect(editor).toBeVisible();
    await login.fill(MEMBER.login);
    await editor.getByTestId(`space-share-${PANEL}-add`).click();
    await expect(editor.getByRole("alert")).toContainText("Member already exists");
    await expect(login).toHaveValue(MEMBER.login);
    expect(standinMembers("platform").filter((entry) => entry.startsWith(`${MEMBER.login}:`))).toHaveLength(1);

    // A login the stand-in knows no account for is refused naming it,
    // the login kept (space-69).
    await login.fill(UNKNOWN);
    await editor.getByTestId(`space-share-${PANEL}-add`).click();
    await expect(editor.getByRole("alert")).toContainText(`No account is named ${UNKNOWN}`);
    await expect(login).toHaveValue(UNKNOWN);
    await editor.getByTestId(`space-share-${PANEL}-cancel`).click();
    await expect(editor).toBeHidden();

    // The new controls fit at the 320-pixel floor with the sidebar
    // collapsed, the group editor and Share open (space-28).
    await setRail(page, false);
    await page.setViewportSize({ width: 320, height: TALL });
    await newGroup.click();
    await expect(top).toBeVisible();
    await share.click();
    await expect(editor).toBeVisible();
    const defects: string[] = [];
    record(
      "Space organizing · 320",
      await measure(page, ['[data-testid^="space-group-"]', '[data-testid="space-instance-heading"] > div']),
      defects,
    );
    expect(defects, defects.join("\n")).toEqual([]);
    await editor.getByTestId(`space-share-${PANEL}-cancel`).click();
    await top.getByTestId("space-new-group-editor-cancel").click();
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
    expect(standinMembers("platform").some((entry) => entry.startsWith(`${MEMBER.login}:`))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// space-75: the Space alone, in both languages
// ---------------------------------------------------------------------------

test.describe("the Space alone", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  test("space-75: no link, no URL behind the Space, no Git system's name and none of the words the surface never says, in English and in Chinese", async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    const host = app.host!;
    const TEAM_KEY = hostKey(host, TEAM_PATH);
    // The project's records pushed into acme over the protocol, and
    // records another account shares from its own namespace: every
    // remote URL lies under the stand-in's Git origin (git-host-12).
    await pickGroup(app);
    host.script.addRepository({ group: "bob", name: "notes-spex", role: "Developer" });
    expect(git(clonePath(app.dataDir, TEAM_KEY), "remote", "get-url", hostFolder(host)).startsWith(`${host.gitOrigin}/${STANDIN_STORAGE}/`)).toBe(true);

    const scan = async (where: string): Promise<void> => {
      const surface = page.getByTestId("space-surface");
      // bob's records stand under "Shared by @bob", under the Space, the
      // heading carrying no control (space-1).
      const bob = instanceSection(page, host).getByTestId("space-group-@bob");
      await expect(bob.getByRole("heading", { level: 3 }).first()).toHaveText(where === "English" ? "Shared by @bob" : "@bob 共享的");
      await expect(bob.getByTestId(`space-row-${hostKey(host, "bob/notes-spex")}`)).toBeVisible();
      await expect(bob.locator('[data-testid^="space-group-more-"]')).toHaveCount(0);
      // The project's placement's members panel, opened from its line in
      // the row's Sync tab, links no page (space-62, space-87).
      await openRepository(page, TEAM_KEY);
      const line = placementLine(page, TEAM_KEY, host);
      const members = line.getByTestId(`space-members-${TEAM_KEY}@${host.url}`);
      if (!(await members.isVisible())) await line.getByTestId("space-line-members").click();
      await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toBeVisible();
      await expect(surface.locator("a")).toHaveCount(0);
      expect(await surfaceLeaks(page, app.hosts), where).toEqual([]);
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
// space-85: a second Space, through the page
// ---------------------------------------------------------------------------

/** The second Space's person (space-85): an account of its own there. */
const SECOND_PERSON = { id: "1002", login: "bob", displayName: "Bob" };

/** The rows a Space's heading and the list's foot lay out side by side,
 * measured at the 320-pixel floor (space-28). */
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

test.describe("a second Space", () => {
  // Signed in at the first stand-in with the demo project registered; a
  // second stand-in on a Git backend of its own, holding its own `acme`,
  // whose read says the person may not make a group (git-host-12,
  // DR-127); the public registry's directory routed to the first, which
  // lists itself alone (space-115).
  test.use({
    appOptions: {
      host: { second: { backend: "separate", canCreateGroup: false, person: SECOND_PERSON } },
      project: true,
      signedIn: true,
      independentRegistry: true,
    },
  });

  test("space-85: Add a Space… signs a second Space in, each acme beneath its own heading; a project shared into the second's acme pushes there; the first signed out keeps its heading, Remove from this list refused, until Sign in again", async ({
    page,
    app,
  }) => {
    test.setTimeout(240_000);
    const first = app.hosts[0]!;
    const second = app.hosts[1]!;
    const FIRST_KEY = hostKey(first, TEAM_PATH);
    // The first's project synced in its `acme`, and a project on this
    // computer only beside it (arrange only).
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

    // "Add a Space…" stands at the list's foot, after every Space's
    // section; it opens the card titled "Sign in to a Space" in its
    // place, with no sentence, its chooser preselecting the default
    // instance — the first, by its display name; Escape closes the card
    // and "Add a Space…" stands again, focused (space-1, space-3,
    // space-115).
    const add = list.getByTestId("space-add-space");
    await expect(add).toHaveText("Add a Space…");
    expect(await list.evaluate((root) => root.lastElementChild?.querySelector('[data-testid="space-add-space"]') != null)).toBe(true);
    await add.click();
    const card = list.getByTestId("space-add-card");
    await expect(card.getByRole("heading", { name: "Sign in to a Space", exact: true })).toBeVisible();
    await expect(add).toHaveCount(0);
    await expect.poll(() => chosenSpace(card)).toContain("Stand-in Git host");
    await expect(spaceAddress(card)).toBeHidden();
    // The chooser holds focus as the card opens, and Escape from it
    // closes the card (space-3, DR-010 §6).
    await expect(spaceChooser(card)).toBeFocused();
    await expectNoSentence(card, "the card Add a Space… opens");
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);
    await expect(add).toBeFocused();

    // "Other Space…" reveals the field captioned "Space address", empty
    // with its placeholder; an origin with a path is refused in the card
    // in the core's words, the field keeping it, and nothing reaches the
    // second (space-115, space-3, core-service-145).
    await add.click();
    await chooseSpace(card, "Other Space…");
    const field = card.getByRole("textbox", { name: "Space address" });
    await expect(field).toBeVisible();
    await expect(field).toHaveValue("");
    await expect(field).toHaveAttribute("placeholder", "https://…");
    await field.fill(`${second.url}/x`);
    await card.getByTestId("space-signin").click();
    await expect(card.getByTestId("space-signin-error")).toContainText("Enter just the Space's address, like https://spex.sublang.ai");
    await expect(field).toHaveValue(`${second.url}/x`);
    await expect(card.getByTestId("space-signin")).toHaveText("Sign in");
    expect(second.script.requests).toEqual([]);

    // The second's origin, in the same card, signs in through the device
    // flow the harness approves; the card closes, "Add a Space…"
    // standing again (space-3).
    await signInThroughPage(page, app, second, "add");
    await expect(card).toHaveCount(0);
    await expect(add).toBeEnabled();

    // Each Space stands under a heading of its display name beside
    // "@<login>", in the home's order, with Sign out and one "More"
    // holding "Remove from this list", disabled while signed in; the
    // first's carries "New group", the second's "New group" disabled and
    // titled "Made by the people who run <display name>"; each `acme`
    // stands beneath its own Space (space-1).
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
      await expect(heading.getByRole("heading", { level: 2 })).toHaveText(`${name} · @${login}`);
      await expect(heading.getByTestId("space-signout")).toHaveText("Sign out");
      const remove = await removeEntry(heading);
      await expect(remove).toContainText("Remove from this list");
      await expect(remove).toBeDisabled();
      await closeMenu(page);
    }
    await expect(firstHeading.getByTestId("space-new-group")).toHaveText("New group");
    await expect(firstHeading.getByTestId("space-new-group")).toBeEnabled();
    await expect(secondHeading.getByTestId("space-new-group")).toHaveText("New group");
    await expect(secondHeading.getByTestId("space-new-group")).toBeDisabled();
    await expect(secondHeading.getByTestId("space-new-group")).toHaveAttribute("title", `Made by the people who run ${SECOND_HOST_NAME}`);
    for (const section of [firstSection, secondSection]) {
      // A group's name, its full path beside it where the two differ and
      // its member count where a read holds one (space-1).
      await expect(section.getByTestId(`space-group-${HOST_GROUP}`).getByRole("heading", { level: 3 }).first()).toHaveText(
        /^Acme( · acme)?( · \d+ members?)?$/,
      );
    }
    await expect(firstRow).toBeVisible();
    await expect(secondSection.getByTestId(`space-row-${FIRST_KEY}`)).toHaveCount(0);

    // "Add to a group…" on the row under "This computer" offers, under
    // each Space's display name, "Personal" there and its groups;
    // picking the second's `acme` creates `<name>-spex` at the second,
    // on its `spex` branch, and the row stands reachable beneath the
    // second's `acme`; the first holds nothing of it (space-58).
    await list.getByTestId("space-own").getByTestId(`space-row-pick-${local.key}`).click();
    const picker = list.getByTestId(`space-picker-${local.key}`);
    await expect(picker.locator('[data-testid^="space-pick-instance-"]')).toHaveCount(2);
    const firstPick = await pickSection(picker, first);
    const secondPick = await pickSection(picker, second, SECOND_HOST_NAME);
    for (const section of [firstPick, secondPick]) {
      await expect(section.locator('[data-testid^="space-pick-group-"]')).toHaveText([
        PICKED_AS[HOST_LOGIN]!,
        PICKED_AS[HOST_GROUP]!,
        PICKED_AS[`${HOST_GROUP}/research`]!,
      ]);
    }
    await secondPick.getByTestId(`space-pick-group-${HOST_GROUP}`).click();
    const secondRow = secondSection.getByTestId(`space-group-${HOST_GROUP}`).getByTestId(`space-row-${SECOND_KEY}`);
    await expect(secondRow).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    await expect(secondRow.getByTestId(`space-repo-state-${SECOND_KEY}`)).toHaveText("Synced just now", { timeout: 30_000 });
    const clone = clonePath(app.dataDir, SECOND_KEY);
    expect(headOf(bareOf(second, SECOND_KEY), "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(first.script.repositories.some((repo) => repo.path === "atlas-spex")).toBe(false);

    // The row's "Sync now" then sends what changed here to the second,
    // with the second's credential, its phrase reading "1 to send", then
    // each step and then its last sync (space-12, space-120); its "More"
    // holds no act DR-172 cuts (space-1).
    await expect
      .poll(async () => (await app.core.command("project.list", {})).find((project) => project.path === local.dir)?.id, { timeout: 30_000 })
      .toBe(SECOND_KEY);
    const queued = await app.core.command("intent.queue", { projectId: SECOND_KEY, text: "Queued at the second Space" });
    await openRepository(page, SECOND_KEY);
    const panel = page.getByTestId("space-repository");
    await expect(panel.getByTestId("space-local-list").getByTestId(`space-unit-mine-intents/${queued.id}`)).toContainText("Queued at the second Space");
    await expect(phraseOf(page, SECOND_KEY)).toHaveText("1 to send");
    const pushes = second.script.transportCredentials.length;
    const phrases = await watch(page, `[data-testid="space-repo-state-${SECOND_KEY}"]`);
    await expectRowMenu(page, SECOND_KEY);
    await closeMenu(page);
    await rowAct(page, SECOND_KEY, "sync");
    const bare = bareOf(second, SECOND_KEY);
    await expect
      .poll(() => git(bare, "ls-tree", "-r", "--name-only", "spex").split("\n"), { timeout: 30_000 })
      .toContain(`intents/${queued.id}.json`);
    await expect(panel.getByTestId("space-done-line")).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    await expect(phraseOf(page, SECOND_KEY)).toHaveText("Synced just now");
    const seen = await phrases();
    expect(inStepOrder(seen.slice(1, -1)), seen.join(" → ")).toBe(true);
    expect(git(bare, "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(second.script.transportCredentials.slice(pushes).some((entry) => entry.instance === second.url && entry.push)).toBe(true);
    await page.getByTestId(`space-repo-${SECOND_KEY}`).click();
    await expect(page.getByTestId("space-repository")).toHaveCount(0);

    // Sign out on the first's heading keeps it, signed out, reading its
    // display name with "Sign in again" and its overflow's "Remove from
    // this list" offered; its project reads "Signed out of <display
    // name>" with no Retry, the second's reachable (space-6, space-61,
    // space-120).
    await firstHeading.getByTestId("space-signout").click();
    await expect(firstHeading.getByTestId("space-signin-again")).toHaveText("Sign in again");
    await expect(firstHeading.getByTestId("space-signout")).toHaveCount(0);
    await expect(firstHeading.getByRole("heading", { level: 2 })).toHaveText("Stand-in Git host");
    const remove = await removeEntry(firstHeading);
    await expect(remove).toHaveText("Remove from this list");
    await expect(remove).toBeEnabled();
    await closeMenu(page);
    await expect(firstRow).toHaveAttribute("data-state", "unreachable");
    await expect(phraseOf(page, FIRST_KEY)).toHaveText("Signed out of Stand-in Git host");
    await expect(firstRow.getByTestId(`space-row-retry-${FIRST_KEY}`)).toHaveCount(0);
    await expect(secondRow).toHaveAttribute("data-state", "reachable");
    await expect(secondHeading.getByTestId("space-signout")).toHaveText("Sign out");

    // "Remove from this list" is refused reading "Still syncing:
    // <project> — stop them first" with the first's project, the heading
    // standing with "Sign in again" (space-82).
    await (await removeEntry(firstHeading)).click();
    await expect(firstHeading.getByTestId("space-instance-more-menu")).toHaveCount(0);
    await expect(firstSection.getByTestId("space-remove-refusal")).toHaveText("Still syncing: demo-project — stop them first");
    await expect(firstSection).toBeVisible();
    await expect(firstHeading.getByTestId("space-signin-again")).toBeEnabled();
    await expect(firstRow).toHaveAttribute("data-state", "unreachable");
    await clean("the first signed out, Remove from this list refused");
    await fit("Space · the first signed out · 320");

    // "Sign in again" signs the first in through the device flow, its
    // flow reading on its heading and "Add a Space…" disabled until it
    // ends; the first's project is reachable again (space-3, space-61).
    await signInThroughPage(page, app, first, "again", async () => {
      await expect(add).toBeDisabled();
    });
    await expect(add).toBeEnabled();
    await expect(firstHeading.getByTestId("space-signout")).toHaveText("Sign out");
    await expect(firstRow).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    await expect(secondRow).toHaveAttribute("data-state", "reachable");

    // The new controls fit at the 320-pixel floor, the card "Add a
    // Space…" opens standing too (space-28).
    await fit("Space · two Spaces, the card open · 320", async () => {
      await add.click();
      await expect(card).toBeVisible();
    });
    await expect(spaceChooser(card)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card).toHaveCount(0);

    // In English and in Chinese, the surface holds no link, nothing under
    // either stand-in's URL but its origin, nor the Git system's name, nor
    // a word it never says (space-1, space-27, localization-10).
    await clean("two Spaces");
    await surfaceEntry(page, "Settings").click();
    await page.getByTestId("language-section").getByTestId("language-select").selectOption("zh");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    await surfaceEntry(page, "Space").click();
    await expect(page.getByTestId("space-surface")).toBeVisible();
    await clean("two Spaces in Chinese");
  });
});

// ---------------------------------------------------------------------------
// space-41: the daily sync with choices
// ---------------------------------------------------------------------------

test.describe("daily sync", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  test("space-41: Check, choices by keyboard, the diffs, the confirm, a Space that moved, Stop, and the members", async ({
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
    // Ahead and behind ride the placement's line's title in the Sync tab
    // (space-8, space-87).
    const counts = placementLine(page, TEAM_KEY, host).getByTestId("space-line-state");
    const sync = { click: () => rowAct(page, TEAM_KEY, "sync") };

    // Check lists the peer's session and Settings under "From <display
    // name> (<n>)", <n> counting the incoming units — the peer's queued
    // intent beside them — the units changed on both sides marked, and
    // the placement's line reads behind, the row's phrase its recorded
    // last sync (space-8, space-61, space-120).
    await expect(tab.getByTestId("space-check")).toHaveText("Check");
    await tab.getByTestId("space-check").click();
    const incoming = tab.getByTestId("space-incoming-list");
    const incomingSession = incoming.getByTestId(`space-unit-remote-${sessionUnit}`);
    await expect(incomingSession).toContainText(SESSION_TITLE);
    await expect(incomingSession).toHaveAttribute("data-change", "updated");
    await expect(incomingSession.getByTestId(`space-choose-${sessionUnit}`)).toBeVisible();
    const incomingSettings = incoming.getByTestId(`space-unit-remote-${settingsUnit}`);
    await expect(incomingSettings).toContainText("Settings changed");
    await expect(incomingSettings.getByTestId(`space-choose-${settingsUnit}`)).toBeVisible();
    const incomingIntent = incoming.locator('[data-testid^="space-unit-remote-intents/"]');
    await expect(incomingIntent).toHaveCount(1);
    await expect(incomingIntent).toContainText("Queued on the other laptop");
    const incomingCount = await incoming.locator('[data-testid^="space-unit-remote-"]').count();
    expect(incomingCount).toBe(3);
    await expect(
      tab.getByTestId(`space-incoming-${host.url}`).getByRole("heading", { name: `From Stand-in Git host (${incomingCount})`, exact: true }),
    ).toBeVisible();
    await expect(counts).toHaveAttribute("title", /0 commits ahead, 1 commit behind/);
    await expect(phraseOf(page, TEAM_KEY)).toHaveText(/^Synced /);
    // A unit the host changed too is a choice, not one to send (space-7):
    // the local list leaves both out.
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

    // Sync ends "Needs your choice", saying nothing is sent to the Space
    // yet, with Apply disabled reading "0 of 2 chosen" (space-9,
    // space-14, space-17).
    await sync.click();
    const note = tab.getByTestId("space-choices-note");
    await expect(note.getByTestId("space-step-line")).toHaveText("Needs your choice");
    await expect(note).toContainText("Your changes are saved; nothing is sent to Stand-in Git host yet");
    const picker = tab.getByTestId("space-picker");
    await expect(picker.getByTestId("space-chosen")).toHaveText("0 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeDisabled();
    await expect(picker.getByRole("radio", { checked: true })).toHaveCount(0);
    // The incoming list stands above the picker (space-9).
    const above = await tab.getByTestId("space-incoming-list").boundingBox();
    const below = await picker.boundingBox();
    expect(above!.y + above!.height).toBeLessThanOrEqual(below!.y + 1);
    await scanVocabulary(page, "needs your choice", words);

    // The row reads that the records changed here and at the Space, with
    // Resolve (space-14, space-120).
    await expect(phraseOf(page, TEAM_KEY)).toHaveText("Changed here and at Stand-in Git host");
    await expect(page.getByTestId(`space-row-resolve-${TEAM_KEY}`)).toHaveText("Resolve");

    // View diff on the Settings row shows this computer's side headed
    // "Changes on this computer" and the stand-in's headed "Changes at
    // <display name>"; Hide diff removes each (space-10).
    const settingsGroup = picker.getByRole("radiogroup", { name: "Settings changed" });
    const mineDiff = tab.getByTestId(`space-diff-mine-${settingsUnit}`);
    const remoteDiff = tab.getByTestId(`space-diff-remote-${settingsUnit}`);
    await settingsGroup.getByRole("button", { name: "View diff" }).first().click();
    await expect(mineDiff).toContainText("Changes on this computer");
    await scanVocabulary(page, "this computer's diff", words);
    await settingsGroup.getByRole("button", { name: "View diff" }).last().click();
    await expect(remoteDiff).toContainText("Changes at Stand-in Git host");
    await scanVocabulary(page, "the Space's diff", words);
    await settingsGroup.getByRole("button", { name: "Hide diff" }).click();
    await expect(mineDiff).toHaveCount(0);
    await expect(remoteDiff).toHaveCount(0);

    // "Take Stand-in Git host's" for the session and "Keep this
    // computer's" for Settings, by keyboard: each row is a radio group
    // named by the unit's label, arrow keys moving within it (space-17).
    const sessionGroup = picker.getByRole("radiogroup", { name: SESSION_TITLE });
    const keep = /Keep this computer's/;
    // The other side names the placement's Space (space-17).
    const take = /Take Stand-in Git host's/;
    await expect(sessionGroup).toContainText(/Keep this computer's\s+updated/);
    await expect(sessionGroup).toContainText(/Take Stand-in Git host's\s+updated/);
    await sessionGroup.getByRole("radio", { name: keep }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(sessionGroup.getByRole("radio", { name: take })).toBeChecked();
    await expect(sessionGroup.getByRole("radio", { name: take })).toBeFocused();
    await expect(picker.getByTestId("space-chosen")).toHaveText("1 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeDisabled();
    await settingsGroup.getByRole("radio", { name: take }).focus();
    await page.keyboard.press("ArrowUp");
    await expect(settingsGroup.getByRole("radio", { name: keep })).toBeChecked();
    await expect(picker.getByTestId("space-chosen")).toHaveText("2 of 2 chosen");
    await expect(picker.getByTestId("space-apply")).toBeEnabled();

    // Apply's confirm names the one the Space's version replaces and that
    // the other version stays in Git history, with Cancel focused; Escape
    // keeps the choices; confirming ends synced (space-18).
    await picker.getByTestId("space-apply").click();
    const confirm = picker.getByTestId("space-apply-confirm");
    await expect(confirm).toContainText("Take Stand-in Git host's version of 1 record? The other stays in Git history");
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await scanVocabulary(page, "the apply confirm", words);
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(picker.getByTestId("space-chosen")).toHaveText("2 of 2 chosen");
    await expect(sessionGroup.getByRole("radio", { name: take })).toBeChecked();
    await expect(settingsGroup.getByRole("radio", { name: keep })).toBeChecked();
    await picker.getByTestId("space-apply").click();
    await confirm.getByRole("button", { name: "Apply" }).click();
    const done = tab.getByTestId("space-done-line");
    // Applying choices runs Save through Push; filesystem and transport
    // work need more than the generic UI assertion budget.
    await expect(done).toHaveText(/^Synced just now · 1 sent · 2 received$/, { timeout: 30_000 });
    await expect(tab.getByTestId("space-picker")).toHaveCount(0);
    await expect(counts).toHaveAttribute("title", /0 commits ahead, 0 commits behind/);
    await expect(phraseOf(page, TEAM_KEY)).toHaveText("Synced just now");
    await scanVocabulary(page, "synced", words);
    expect(git(bareOf(host, TEAM_KEY), "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(readFileSync(join(clone, settingsUnit), "utf8")).toBe(LOCAL_PROJECT_CONFIG);
    expect(git(bareOf(host, TEAM_KEY), "show", `spex:${settingsUnit}`) + "\n").toBe(LOCAL_PROJECT_CONFIG);

    // The session's tab shows the host's turns, the composer's draft
    // kept; Settings shows this computer's configuration (space-20).
    await nav(page, "Projects").click();
    await expect(sessionTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("captain-pane")).toContainText(PEER_TURN);
    await expect(page.getByTestId("captain-pane")).not.toContainText(LOCAL_TURN);
    await expect(page.getByTestId("boss-composer")).toHaveValue(draft);
    await nav(page, "Settings").click();
    await expect(page.getByTestId("captain-section").getByTestId("agent-chip")).toContainText(LOCAL_MODEL);
    expect(readFileSync(app.configPath, "utf8")).toContain(`model: ${LOCAL_MODEL}`);

    // The host's `spex` moves under the send: one automatic re-check,
    // then "<display name> changed again", the ahead count on the
    // placement's line and the row reading the count still to send; a
    // second Sync sends it (space-15, space-8, space-120).
    await showGroups(page);
    await openRepository(page, TEAM_KEY);
    await app.core.command("intent.queue", { projectId: TEAM_KEY, text: "Queued after the merge" });
    await expect(tab.locator('[data-testid^="space-unit-mine-intents/"]')).toHaveCount(1);
    app.rejectPushes(2);
    await sync.click();
    const stopped = tab.getByTestId("space-stopped");
    // Two passes against the host: Save, Check, Compare and a send the
    // host rejects, then the re-check's Check, Compare, Merge, Reload
    // and a second rejected send. Twice a sync's work, twice its budget.
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Sending stopped — Stand-in Git host changed again", { timeout: 30_000 });
    await expect(counts).toHaveAttribute("title", /[1-9]\d* commits? ahead/);
    await expect(stopped.getByTestId("space-retry")).toBeVisible();
    await expect(phraseOf(page, TEAM_KEY)).toHaveText(/^[1-9]\d* to send$/);
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
    await expect(rail.getByTestId("space-step-line")).toHaveText("Checking Stand-in Git host…");
    // Stop stands once Git's own transport is in flight, sleeping at the
    // host, the host read before it offering none (space-16).
    const stop = rail.getByTestId("space-stop");
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(stopped.getByTestId("space-stopped-title")).toHaveText("Checking stopped — No answer from Stand-in Git host");
    await expect(stopped.getByTestId("space-retry")).toHaveText("Retry");
    await expect(tab.getByTestId("space-check")).toHaveText("Check");
    expect(await checkLabels()).toEqual(["Check", "Checking…", "Check"]);
    host.script.sleepTransport(0);
    await scanVocabulary(page, "check stopped", words);

    // Members on the placement's line lists the stand-in's members with
    // the host's role names and links no page of the host (space-62,
    // space-87).
    const listed = host.script.repositories.find((repo) => `${repo.group.fullPath}/${repo.path}` === TEAM_PATH)!;
    listed.members.push(PEER_MEMBER);
    const line = placementLine(page, TEAM_KEY, host);
    await line.getByTestId("space-line-members").click();
    const members = line.getByTestId(`space-members-${TEAM_KEY}@${host.url}`);
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toContainText(HOST_LOGIN);
    await expect(members.getByTestId(`space-member-${HOST_LOGIN}`)).toContainText("Owner");
    await expect(members.getByTestId(`space-member-${PEER_MEMBER.login}`)).toContainText(PEER_MEMBER.login);
    await expect(members.getByTestId(`space-member-${PEER_MEMBER.login}`)).toContainText("Developer");
    await expect(members.locator("a")).toHaveCount(0);
    await scanVocabulary(page, "members", words);

    // No visible text on the surface names Git's sides or the records'
    // suffix, or calls a Space's things by another word (space-27).
    expect(words, words.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// space-42: exploring
// ---------------------------------------------------------------------------

test.describe("exploring", () => {
  // The demo project's records synced once to a bare path, so its
  // session's files are committed and read "Shared".
  test.use({ appOptions: { project: true, remote: "bare" } });

  test("space-42: the tree, the previews, what stays on this computer, and Copy path", async ({
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
    const tree = explore.getByRole("tree", { name: "Files in demo-project" });
    await expect(tree).toBeVisible();
    // The tree is the records' clone (space-23).
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
    await expect(manifest).toContainText("session file");
    await expect(manifest).not.toContainText("manifest");
    await expect(manifest).toContainText("Shared");
    await expect(manifest.locator("[data-sync]")).toHaveAttribute("data-sync", "shared");
    await expect(records).toContainText("transcript");
    await expect(records).toContainText("Shared");
    await expect(chunks).toContainText("session history");
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
    await expect(preview).toContainText("session file");
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
    await expect(preview).toContainText("session history");
    await expect(preview.getByTestId("space-preview-owner")).toHaveText(`"${SESSION_TITLE}"`);
    await hints.click();
    await expect(preview.getByTestId("space-preview-withheld")).toContainText("May hold provider tokens — not shown");
    await expect(preview.getByTestId("space-preview-text")).toHaveCount(0);
    // The tree is one focus stop; arrow keys move within it.
    await manifest.focus();
    await page.keyboard.press("ArrowDown");
    await expect(records).toBeFocused();
    expect(await tree.locator('[role="treeitem"][tabindex="0"]').count()).toBe(1);

    // "Stays on this computer" names the eight families with their
    // reasons (space-25).
    const privacy = explore.getByTestId("space-privacy");
    const toggle = privacy.getByTestId("space-privacy-toggle");
    await expect(toggle).toContainText("Stays on this computer");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    const families: [string, RegExp][] = [
      ["provider hints", /resume tokens for this computer's agent conversations; they work nowhere else/],
      ["in-use files", /which process is writing right now/],
      ["installed packages and skills for agents", /copies installed from spex\.lock; every computer installs its own/],
      ["where projects live", /where your project folders are on this computer, in the home file/],
      ["preferences", /where you last stopped reading in each session/],
      ["credentials", /this computer's sign-in to each Space/],
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

    // The served page offers Copy path beside the records and no reveal
    // control, and acknowledges the copy in words (space-26).
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
 * Changes to send of every kind on top of the two-laptop arrangement,
 * and a sync ended in choices: the surface at its fullest (space-43,
 * space-44) — a session of this computer's own, queued intents, an
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
  // The clone still holding the project's environment, as one the
  // environment migration has not reached does (storage-24), its
  // requests changed on this computer.
  for (const file of ["spex.yaml", "spex.lock"]) {
    if (existsSync(join(app.projectDir, file))) copyFileSync(join(app.projectDir, file), join(clone, file));
  }
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
    page.on("pageerror", (error) => console.log(`[space fit] page error: ${error.message}`));
    await page.setViewportSize({ width: 1280, height: TALL });
    await open(page, app);
    await showGroups(page);
    await openRepository(page, TEAM_KEY);
    const tab = page.getByTestId("space-sync-tab");
    await expect(tab.getByTestId("space-picker")).toBeVisible();
    // Every kind of change to send stands listed (space-7).
    const local = tab.getByTestId("space-local-list");
    for (const kind of ["Sessions", "Intents", "Authoring", "Packages", "Code", "Sync rules", "Other"]) {
      await expect(local.getByRole("heading", { name: kind, exact: true })).toBeVisible();
    }
    // A diff open in the picker, so the diff canvas is measured too.
    const settingsGroup = tab.getByRole("radiogroup", { name: "Settings changed" });
    await settingsGroup.getByRole("button", { name: "View diff" }).first().click();
    await expect(tab.getByTestId("space-diff-mine-config/playbook.config.yaml")).toContainText("Changes on this computer");

    const defects: string[] = [];
    const containers = [
      '[data-testid="space-header"]',
      '[data-testid="space-instance-heading"] > div',
      '[data-testid="space-groups"] h2',
      '[data-testid="space-groups"] h3',
      '[data-testid^="space-row-"]',
      '[data-testid^="space-line-"]',
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
          const tree = page.getByRole("tree", { name: "Files in demo-project" });
          await tree.getByTestId("space-node-sessions").click();
          await tree.getByTestId(`space-node-session:${app.sessionId}`).click();
          await tree.getByTestId(`space-node-sessions/${app.sessionId}.json`).click();
          await expect(page.getByTestId("space-preview-text")).toContainText('"sessionId"');
          const privacy = page.getByTestId("space-privacy-toggle");
          if ((await privacy.getAttribute("aria-expanded")) !== "true") await privacy.click();
        },
        ready: async () => {
          await expect(page.getByRole("tree", { name: "Files in demo-project" })).toBeVisible();
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

      // The groups list, each group and each project's row are named
      // (space-1).
      await expect(page.getByRole("region", { name: "Your groups" })).toBeVisible();
      await expect(page.getByRole("group", { name: HOST_GROUP, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "demo-project", exact: true })).toHaveAttribute("aria-expanded", "false");
      found.push(...(await scan("Space · list")));
      await openRepository(page, TEAM_KEY);

      // The picker's radio groups and the tabs are named (space-17).
      const tab = page.getByTestId("space-sync-tab");
      await expect(tab.getByTestId("space-picker")).toBeVisible();
      await expect(tab.getByRole("radiogroup", { name: SESSION_TITLE })).toBeVisible();
      await expect(tab.getByRole("radiogroup", { name: "Settings changed" })).toBeVisible();
      await expect(page.getByRole("tablist", { name: "Views of demo-project" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Sync" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("tab", { name: "Explore" })).toBeVisible();
      found.push(...(await scan("Space · Sync")));

      // The tree is named (space-23).
      await page.getByTestId("space-tab-explore").click();
      const tree = page.getByRole("tree", { name: "Files in demo-project" });
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

// ---------------------------------------------------------------------------
// space-36: a second computer opens a project a peer pushed
// ---------------------------------------------------------------------------

test.describe("second computer", () => {
  test.use({ appOptions: { host: true } });

  test("space-36: after sign-in a peer's project offers Open here; Open here clones its records and code; a session synced lands beside the peer's", async ({
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

    // After sign-in the group's row lists the project not on this
    // computer, reading no phrase and no "Here", with "Open here" titled
    // as downloading the records and the code to this computer
    // (space-61, space-111, space-1).
    const groupRows = page.getByTestId(`space-group-${HOST_GROUP}`);
    await expect(groupRows.getByTestId(`space-row-${key}`)).toHaveAttribute("data-state", "absent");
    await expect(page.getByTestId(`space-repo-${key}`)).toHaveText("demo-project");
    await expectNoPhrase(page, key);
    await expect(page.getByTestId(`space-row-here-${key}`)).toHaveCount(0);
    const openHere = page.getByTestId(`space-row-open-${key}`);
    await expect(openHere).toHaveText("Open here");
    await expect(openHere).toHaveAttribute("data-entry", `space-row-open-here-${key}`);
    await expect(openHere).toHaveAttribute("title", /records and the code to this computer/);

    // "Open here" clones the records and, the code remote a path this
    // machine serves, the code into the folder the page names; the row
    // reads reachable once the code is there, "Here" on it, and the
    // project lists in the sidebar with the peer's session and intent
    // (space-63, space-61, space-20, space-111).
    await openHere.click();
    const editor = page.getByTestId(`space-join-${key}`);
    await expect(editor).toBeVisible();
    await expect(editor).toContainText("on this computer");
    await expect(editor).not.toContainText(/\bdevice\b/);
    await editor.getByTestId(`space-join-${key}-path`).fill(folder);
    await editor.getByRole("button", { name: "Open here", exact: true }).click();
    await expect(page.getByTestId(`space-row-${key}`)).toHaveAttribute("data-state", "reachable", { timeout: 30_000 });
    // The opened clone holds the host's `spex`: it reads synced at the
    // peer's last push, never "Never synced" (space-61).
    await expect(page.getByTestId(`space-repo-state-${key}`)).toHaveText(/^Synced (just now|\d+m ago)$/);
    await expect(page.getByTestId(`space-row-here-${key}`)).toHaveText("Here");
    await expect(page.getByTestId(`space-row-open-${key}`)).toHaveText("Show");
    expect(existsSync(join(clonePath(app.dataDir, key), "project.json"))).toBe(true);
    expect(existsSync(join(folder, "README.md"))).toBe(true);
    expect(git(folder, "remote", "get-url", "origin")).toBe(code);
    // The opened project lists in the sidebar with no reload.
    const tree = page.getByRole("tree", { name: "Projects and sessions" });
    await expect(tree.getByRole("treeitem", { name: "demo-project", exact: true })).toBeVisible();
    await tree.getByRole("treeitem", { name: "demo-project", exact: true }).click();
    await expect(tree.getByRole("treeitem", { name: new RegExp(PEER_SESSION_TITLE, "i") })).toBeVisible();
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByText("Queued on the other laptop")).toBeVisible();

    // A session run here and synced lands on the stand-in's `spex`
    // beside the peer's (space-12); the records' other member makes its
    // first send ask the sharing confirm beneath the row, titled "Share
    // with Acme at <display name>?" over its three phrases, and Share
    // sends (space-57).
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
    await rowAct(page, key, "sync");
    const confirm = page.getByTestId("space-notice-confirm");
    await expect(confirm).toContainText("Share with Acme at Stand-in Git host?");
    for (const phrase of SHARING_PHRASES) await expect(confirm).toContainText(phrase);
    await confirm.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByTestId("space-done-line")).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
    const tracked = git(bareOf(host, key), "ls-tree", "-r", "--name-only", "spex").split("\n");
    expect(tracked).toContain(`sessions/${ownSession}.json`);
    expect(tracked).toContain(`sessions/${peerSession}.json`);
  });
});

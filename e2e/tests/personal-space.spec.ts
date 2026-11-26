// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { Page } from "@playwright/test";
import { Home } from "@sublang/spex-core";
import { seedDemoProject } from "@sublang/spex-core/testing";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LOCAL_MODEL, LOCAL_PROJECT_CONFIG, LOCAL_TURN, PEER_TURN, SESSION_TITLE,
  arrangeHostPeer, bareOf, clonePath, expect, git, instanceSection, nav, open,
  placementLine, repositoryOf, runTurn, signInThroughPage, startApp, test,
} from "../src/harness";

async function showSpace(page: Page): Promise<void> {
  await nav(page, "Space").click();
  await expect(page.getByTestId("space-projects")).toBeVisible();
}

async function openRepository(page: Page, key: string): Promise<void> {
  if (await page.getByTestId("space-repository").count() === 0) {
    await page.getByTestId(`space-repo-${key}`).click();
  }
  await expect(page.getByTestId("space-repository")).toBeVisible();
}

function phraseOf(page: Page, key: string) {
  return page.getByTestId(`space-repo-state-${key}`);
}

async function rowAct(page: Page, key: string, action: "sync" | "explore" | "destination"): Promise<void> {
  await page.getByTestId(`space-row-more-${key}`).click();
  await page.getByTestId(`space-row-${action}-${key}`).click();
}

const DISPLAY_NAMES = ["Stand-in Git host"];
const GIT_WORDS = /\b(ours|theirs|HEAD|MERGE_HEAD)\b|origin\/spex/;
const SPACE_WORDS = /\b(instances?|namespaces?|seats?)\b/i;

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

test.describe("daily sync", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  test("space-41: Check, keyboard conflict choices, diffs, and confirmed sync", async ({
    page,
    app,
  }) => {
    test.setTimeout(180_000);
    await arrangeHostPeer(app);
    const host = app.host!;
    const PROJECT_KEY = app.projectId!;
    const clone = clonePath(app.dataDir, PROJECT_KEY);
    const sessionUnit = `sessions/${app.sessionId}`;
    const settingsUnit = "config/playbook.config.yaml";
    const words: string[] = [];
    await open(page, app);
    await showSpace(page);
    await openRepository(page, PROJECT_KEY);
    const panel = page.getByTestId("space-repository");
    const tab = panel.getByTestId("space-sync-tab");
    // Ahead and behind ride the placement's line's title in the Sync tab
    // (space-8, space-87).
    const counts = placementLine(page, PROJECT_KEY, host).getByTestId("space-line-state");
    const sync = { click: () => rowAct(page, PROJECT_KEY, "sync") };

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
    await expect(phraseOf(page, PROJECT_KEY)).toHaveText(/^Synced /);
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
    await showSpace(page);
    await openRepository(page, PROJECT_KEY);

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
    await expect(phraseOf(page, PROJECT_KEY)).toHaveText("Changed here and at Stand-in Git host");
    await expect(page.getByTestId(`space-row-resolve-${PROJECT_KEY}`)).toHaveText("Resolve");

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
    await expect(phraseOf(page, PROJECT_KEY)).toHaveText("Synced just now");
    await scanVocabulary(page, "synced", words);
    expect(git(bareOf(host, PROJECT_KEY), "rev-parse", "spex")).toBe(git(clone, "rev-parse", "spex"));
    expect(readFileSync(join(clone, settingsUnit), "utf8")).toBe(LOCAL_PROJECT_CONFIG);
    expect(git(bareOf(host, PROJECT_KEY), "show", `spex:${settingsUnit}`) + "\n").toBe(LOCAL_PROJECT_CONFIG);

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

  });
});

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
    const replayDirectory = `sessions/${session.id}.replay`;
    const segmentNames = readdirSync(join(clone, replayDirectory)).sort();
    expect(segmentNames.length).toBeGreaterThan(0);
    expect(segmentNames.every((name) => /^[0-9]{12}\.jsonl$/.test(name))).toBe(true);
    const savedFiles = [sessionRoot, ...segmentNames.map((name) => `${replayDirectory}/${name}`)]
      .map((path) => ({ path, bytes: readFileSync(join(clone, path)) }));
    for (const file of savedFiles) expect(file.bytes.length).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(JSON.parse(savedFiles[0]!.bytes.toString())).toMatchObject({ schemaVersion: 9, kind: "captain-session-storage", sessionId: session.id });
    const firstSegment = savedFiles[1]!.bytes.toString().split("\n")[0]!;
    expect(JSON.parse(firstSegment)).toMatchObject({ v: 1, seq: 1 });
    // intents/ with nothing queued yet: a tracked kind, nothing committed.
    mkdirSync(join(clone, "intents"), { recursive: true });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: app.origin });

    await open(page, app);
    await showSpace(page);
    await openRepository(page, key);
    await page.getByTestId("space-tab-explore").click();
    const explore = page.getByTestId("space-explore-tab");
    const tree = explore.getByRole("tree", { name: "Files in demo-project" });
    await expect(tree).toBeVisible();
    // The tree is the records' clone (space-23).
    await expect(explore).toContainText(join("workspace", ...key.split("/")));

    // The session's files group under one node titled by its first
    // turn: its manifest file and replay Shared, hints Stays here, and
    // owned files offering Open session (space-23).
    const sessionsDir = tree.getByTestId("space-node-sessions");
    await expect(sessionsDir).toContainText("sessions/");
    await sessionsDir.click();
    const sessionNode = tree.getByTestId(`space-node-session:${session.id}`);
    await expect(sessionNode).toContainText(SESSION_TITLE);
    await sessionNode.click();
    const manifest = tree.getByTestId(`space-node-sessions/${session.id}.json`);
    const records = tree.getByTestId(`space-node-${replayDirectory}`);
    const hints = tree.getByTestId(`space-node-sessions/${session.id}.hints.json`);
    await expect(manifest).toContainText("session file");
    await expect(manifest).not.toContainText("manifest");
    await expect(manifest).toContainText("Shared");
    await expect(manifest.locator("[data-sync]")).toHaveAttribute("data-sync", "shared");
    await expect(records).toContainText("transcript");
    await expect(records).toContainText("Shared");
    await expect(records.locator("[data-sync]")).toHaveAttribute("data-sync", "shared");
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

    // The manifest file previews as pretty-printed JSON; its replay
    // segments stay shared and offer Open session, and hints are withheld.
    const preview = explore.getByTestId("space-preview");
    await manifest.click();
    await expect(preview).toContainText("session file");
    await expect(preview.getByTestId("space-preview-owner")).toHaveText(`"${SESSION_TITLE}"`);
    const json = preview.getByTestId("space-preview-text");
    await expect(json).toContainText('"sessionId"');
    expect((await json.textContent())!.startsWith('{\n  "')).toBe(true);
    await records.click();
    const segment = tree.getByTestId(`space-node-${replayDirectory}/${segmentNames[0]}`);
    await expect(segment.locator("[data-sync]")).toHaveAttribute("data-sync", "shared");
    await segment.click();
    await expect(preview.getByTestId("space-preview-owner")).toHaveText(`"${SESSION_TITLE}"`);
    await expect(preview.getByRole("button", { name: "Open session" })).toBeVisible();
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
    await showSpace(page);
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

test.describe("personal projects on two computers", () => {
  test.use({ appOptions: { host: { displayName: "Personal Space" } } });

  for (const [existing, title] of [
    [true, "space-40: sync and open a personal project in an existing folder"],
    [false, "space-36: sync and open a personal project by cloning into a new folder"],
  ] as const) {
    test(title, async ({ app, page, browser }) => {
      test.setTimeout(120_000);
      const host = app.host!;
      seedDemoProject(app.projectDir);
      const remote = join(app.home, "demo-project.git");
      git(app.home, "clone", "-q", "--bare", app.projectDir, remote);
      git(app.projectDir, "remote", "add", "origin", remote);
      await open(page, app);
      if (existing) {
        await nav(page, "Space").click();
        await signInThroughPage(page, app);
        await nav(page, "Projects").click();
      }
      await page.getByTestId("home-add-project").click();
      const palette = page.getByTestId("project-palette");
      await palette.getByTestId("palette-path").fill(app.projectDir);
      await palette.getByTestId("palette-add").click();
      // A successful local add returns straight to the project task (space-40).
      await expect(palette).toBeHidden();
      await expect(page.getByTestId("captain-home")).toContainText("demo-project");
      const localKey = (await app.core.command("project.list", {})).find((project) => project.path === app.projectDir)!.id;
      if (existing) {
        // Create while signed in, where the old destination chooser could appear.
        await page.getByTestId("sidebar-palette").click();
        await palette.getByTestId("palette-create-start").click();
        const folder = join(app.home, "created-project");
        await palette.getByTestId("palette-new-path").fill(folder);
        await palette.getByTestId("palette-create").click();
        await expect(palette).toBeHidden();
        await expect(page.getByTestId("captain-home")).toContainText("created-project");
        expect(existsSync(join(folder, ".git"))).toBe(true);
      }
      const work = await app.core.command("session.create", { projectId: localKey });
      await runTurn(app, work.id, SESSION_TITLE);
      const intent = await app.core.command("intent.queue", { projectId: localKey, text: "Document the login redirect" });
      await nav(page, "Space").click();
      if (!existing) await signInThroughPage(page, app);
      const personal = instanceSection(page, host);
      await expect(personal.getByRole("heading", { name: /Personal Space/ })).toBeVisible();
      const onThisComputer = page.getByRole("group", { name: "This computer" });
      if (existing) {
        await expect(onThisComputer.getByRole("button", { name: "created-project", exact: true })).toBeVisible();
        await expect(personal.getByRole("button", { name: "created-project", exact: true })).toHaveCount(0);
      }
      const localRow = onThisComputer.getByRole("button", { name: "demo-project", exact: true });
      await expect(localRow).toBeVisible();
      const localRecordsKey = (await localRow.getAttribute("data-testid"))!.slice("space-repo-".length);
      const local = repositoryOf(await app.core.command("space.get", {}), localRecordsKey);
      expect(local.state).toBe("local-only");
      expect(local.placements).toEqual([]);
      await rowAct(page, localRecordsKey, "destination");
      const destination = page.getByTestId(`space-destination-${localRecordsKey}`);
      await expect(destination.getByRole("combobox", { name: "Space" })).toHaveValue(host.url);
      await destination.getByRole("button", { name: "Sync records" }).click();
      const row = personal.getByRole("button", { name: "demo-project", exact: true });
      await expect(row).toBeVisible({ timeout: 45_000 });
      const key = (await row.getAttribute("data-testid"))!.slice("space-repo-".length);
      await expect(phraseOf(page, key)).toHaveText(/^Synced /, { timeout: 45_000 });
      const projectRow = personal.getByTestId(`space-row-${key}`);
      await rowAct(page, key, "explore");
      await expect(projectRow.getByRole("tab", { name: "Explore" })).toHaveAttribute("aria-selected", "true");
      await expect(projectRow.getByRole("tab", { name: "Sync" })).toBeVisible();
      const second = await startApp({ host: { share: { host } } });
      const secondPage = await browser.newPage();
      try {
        const folder = join(second.home, "second-project");
        if (existing) git(second.home, "clone", "-q", remote, folder);
        await open(secondPage, second);
        await nav(secondPage, "Space").click();
        await signInThroughPage(secondPage, second);
        await nav(secondPage, "Projects").click();
        await secondPage.getByTestId("home-open-from-space").click();
        const secondRow = instanceSection(secondPage, host).getByTestId(`space-row-${key}`);
        await expect(secondRow).toHaveAttribute("data-state", "absent");
        await expect(secondRow.getByTestId(`space-repo-state-${key}`)).toHaveText("");
        expect(repositoryOf(await second.core.command("space.get", {}), key).folder).toBeNull();
        await secondRow.getByRole("button", { name: "Open here", exact: true }).click();
        const editor = secondRow.getByTestId(`space-join-${key}`);
        await editor.getByRole("textbox").fill(folder);
        await editor.getByRole("button", { name: "Open here" }).click();
        const sidebarProject = secondPage.getByTestId(`sidebar-project-${key}`);
        await expect(sidebarProject).toBeVisible({ timeout: 45_000 });
        if (await sidebarProject.getAttribute("aria-expanded") === "false") {
          await sidebarProject.getByRole("button", { name: /Show sessions in / }).click();
        }
        await expect(secondPage.getByTestId(`sidebar-session-${work.id}`)).toBeVisible();
        await expect(secondRow).toHaveAttribute("data-state", "reachable");
        expect(realpathSync(repositoryOf(await second.core.command("space.get", {}), key).folder!)).toBe(realpathSync(folder));
        expect(existsSync(join(folder, "README.md"))).toBe(true);
        expect(git(folder, "remote", "get-url", "origin")).toBe(remote);
        await secondRow.getByRole("button", { name: "Open project", exact: true }).click();
        await secondPage.getByRole("tab", { name: "Overview" }).click();
        await expect(secondPage.getByTestId("overview-tab")).toContainText(intent.text);
        await expect(secondPage.getByRole("button", { name: /^(Servers|Groups)$/ })).toHaveCount(0);
        const tree = secondPage.getByRole("tree", { name: "Projects and sessions" });
        // One project, its saved session, and its new-task action.
        await expect(tree.getByRole("treeitem")).toHaveCount(3);

        if (!existing) {
          const secondWork = await second.core.command("session.create", { projectId: key });
          await runTurn(second, secondWork.id, "Review the redirect");
          await showSpace(secondPage);
          await secondRow.getByTestId(`space-repo-${key}`).click();
          await rowAct(secondPage, key, "sync");
          await expect(secondRow.getByTestId("space-done-line")).toHaveText(/^Synced just now · [1-9]\d* sent · 0 received$/);
          const tracked = git(bareOf(host, key), "ls-tree", "-r", "--name-only", "spex").split("\n");
          expect(tracked).toContain(`sessions/${work.id}.json`);
          expect(tracked).toContain(`sessions/${secondWork.id}.json`);
        }
      } finally {
        await secondPage.close();
        await second.close();
      }
      if (existing) {
        // Arrange a saved conversation whose records no longer have a paired folder (space-40).
        await app.stop();
        renameSync(app.projectDir, join(app.home, "relocated-project"));
        const home = Home.load(app.dataDir);
        home.unpair(key);
        home.save();
        await app.start();
        await open(page, app);
        await showSpace(page);
        await personal.getByTestId("space-signout").click();
        await expect(personal.getByTestId("space-signin-again")).toBeVisible();
        await page.getByTestId("space-issues").click();
        await page.getByRole("button", { name: SESSION_TITLE, exact: true }).click();
        await expect(page.getByTestId("saved-conversation-reader")).toContainText(SESSION_TITLE);
      }
    });
  }
});

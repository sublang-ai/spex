// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { appendFileSync, copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  SESSION_TITLE, arrangeHostPeer, clonePath, expect, git, hostKey,
  instanceSection, nav, open, runTurn, surfaceEntry, test, type App,
} from "../src/harness";
import {
  HEIGHTS, OPEN_RAIL_MIN_WIDTH, TALL, WIDTHS, compareNames,
  expectSurfaceGuttersToScroll, measure, record, setRail,
} from "../src/fit";

async function showSpace(page: Page): Promise<void> {
  await nav(page, "Space").click();
  await expect(page.getByTestId("space-projects")).toBeVisible();
}

async function openRepository(page: Page, key: string): Promise<void> {
  const row = page.getByTestId(`space-repo-${key}`);
  await expect(row).toBeVisible();
  if (await row.getAttribute("aria-expanded") !== "true") await row.click();
  await expect(page.getByTestId("space-repository")).toBeVisible();
}

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
  appendFileSync(join(clone, "spex.yaml"), "# Local request note\n");
  // Save captures the paired code folder's actual remote. A direct edit
  // of project.json would be replaced by that capture before Sync.
  const hasOrigin = git(app.projectDir, "remote").split(/\r?\n/).includes("origin");
  git(app.projectDir, "remote", ...(hasOrigin ? ["set-url", "origin"] : ["add", "origin"]), "git@example.com:acme/demo-project.git");
  appendFileSync(join(clone, ".gitignore"), "# authored\n/scratch/\n");
  writeFileSync(join(clone, "notes.txt"), "a stray note\n");
  const state = await app.settleSpace("space.sync", { repository: projectId });
  if (state.sync.phase !== "choices") {
    throw new Error(`the arranged sync ended ${JSON.stringify(state.sync)}`);
  }
  expect(state.local.some((unit) => unit.kind === "code")).toBe(true);
}

test.describe("fit", () => {
  test.use({ appOptions: { host: true, project: true, signedIn: true } });

  test("space-43: project names and opening actions align above readable code captions", async ({ page, app }, testInfo) => {
    test.setTimeout(90_000);
    const host = app.host!;
    const name = "goodme-remote-smoke-20261104-with-a-long-project-name";
    host.script.addRepository({
      group: host.script.person.login,
      name: `${name}-spex`,
      project: { format: 1, name, remote: "https://code.example/team/smoke.git" },
    });
    const key = hostKey(host, `${host.script.person.login}/${name}-spex`);
    host.script.addRepository({ group: host.script.person.login, name: "plain-remote-project-spex" });
    const plainKey = hostKey(host, `${host.script.person.login}/plain-remote-project-spex`);
    const mark = app.core.mark();
    await app.core.command("space.refresh", {});
    await app.core.waitSpace(mark, (state) => state.repositories.some((repo) => repo.key === key) && state.repositories.some((repo) => repo.key === plainKey), 30_000);
    await open(page, app);
    await showSpace(page);
    const title = page.getByTestId(`space-repo-${key}`);
    const code = page.getByTestId(`space-row-${key}`).getByText("Code: code.example", { exact: true });
    await expect(title).toHaveText(name);
    await expect(title).toHaveAttribute("title", name);
    await expect(page.getByTestId(`space-row-${plainKey}`).getByText(/^Code:/)).toHaveCount(0);

    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await setRail(page, true);
      await expect(code).toBeVisible();
      await expect(code).toHaveText("Code: code.example");
      await expect(code.locator("svg, .sr-only")).toHaveCount(0);
      const nameBounds = (await title.boundingBox())!;
      const codeBounds = (await code.boundingBox())!;
      expect(Math.abs(nameBounds.x - codeBounds.x), `${theme}: the caption aligns with its name`).toBeLessThanOrEqual(1);
      expect(codeBounds.y, `${theme}: the caption is below its name`).toBeGreaterThanOrEqual(nameBounds.y + nameBounds.height - 1);
      // The row with a code caption and its neighbor whose records
      // have no project metadata both align their action with the name.
      for (const row of [
        { key, action: `space-row-open-${key}` },
        { key: plainKey, action: `space-row-open-${plainKey}` },
      ]) {
        const rowTitle = page.getByTestId(`space-repo-${row.key}`);
        await rowTitle.scrollIntoViewIfNeeded();
        const titleBox = (await rowTitle.boundingBox())!;
        const actionBox = (await page.getByTestId(row.action).boundingBox())!;
        const titleCenter = titleBox.y + titleBox.height / 2;
        const actionCenter = actionBox.y + actionBox.height / 2;
        expect(Math.abs(titleCenter - actionCenter), `${theme}: ${row.key} aligns its name and action`).toBeLessThanOrEqual(1);
      }
      await title.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`row-alignment-${theme}-1280.png`) });
      await setRail(page, false);
      await page.setViewportSize({ width: 320, height: 400 });
      await expect(code).toBeHidden();
      const fit = await measure(page);
      expect({ overflow: fit.overflow, vertical: fit.vertical, overlap: fit.overlap }, `${theme}: the compact row fits`).toEqual({ overflow: [], vertical: [], overlap: [] });
      await page.screenshot({ path: testInfo.outputPath(`row-alignment-${theme}-320.png`) });
    }
  });

  test("space-43: records expand beneath their project and both gutters scroll the bounded Space content", async ({ page, app }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1600, height: 400 });
    await open(page, app);
    await setRail(page, true);
    await page.setViewportSize({ width: 1600, height: 400 });
    await showSpace(page);
    await openRepository(page, app.projectId!);
    const surface = page.getByTestId("space-surface");
    const records = page.getByTestId("space-repository");
    const attachment = await records.evaluate((panel) => {
      const row = panel.parentElement!;
      const summary = row.firstElementChild!;
      return {
        owner: row.getAttribute("data-testid"),
        followsSummary: panel.previousElementSibling === summary,
        gap: panel.getBoundingClientRect().top - summary.getBoundingClientRect().bottom,
      };
    });
    expect(attachment.owner).toBe(`space-row-${app.projectId!}`);
    expect(attachment.followsSummary).toBe(true);
    expect(attachment.gap, "records follow their row").toBeGreaterThanOrEqual(0);
    expect(attachment.gap, "records stay attached to their row").toBeLessThanOrEqual(8);
    await expect(records).toHaveCount(1);
    await expect(records.getByTestId("space-repository-header")).toBeInViewport();
    await expectSurfaceGuttersToScroll(page, surface, surface.getByTestId("space-surface-content"));

    for (const language of ["en", "zh"] as const) {
      await surfaceEntry(page, "Settings").click();
      await page.getByTestId("language-select").selectOption(language);
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await surfaceEntry(page, "Space").click();
      await openRepository(page, app.projectId!);
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        for (const width of [1600, 320]) {
          await setRail(page, width === 1600);
          await page.setViewportSize({ width, height: TALL });
          await records.getByTestId("space-repository-header").scrollIntoViewIfNeeded();
          const fit = await measure(page);
          expect({ overflow: fit.overflow, vertical: fit.vertical, overlap: fit.overlap }, `${language}/${theme} at ${width}px`).toEqual({ overflow: [], vertical: [], overlap: [] });
          await page.screenshot({ path: testInfo.outputPath(`records-context-${language}-${theme}-${width}.png`) });
        }
      }
    }
  });

  test("space-43: personal projects and the Sync and Explore tabs fit at every width, in both sidebar states", async ({
    page,
    app,
  }) => {
    test.setTimeout(300_000);
    await arrangeChoices(app);
    const projectKey = app.projectId!;
    await page.setViewportSize({ width: 1280, height: TALL });
    await open(page, app);
    await showSpace(page);
    await openRepository(page, projectKey);
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
      '[data-testid="space-projects"] h2',
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
          await expect(page.getByTestId(`space-repo-${projectKey}`)).toBeVisible();
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
            const attachment = await page.getByTestId("space-repository").evaluate((panel) => ({
              owner: panel.parentElement?.getAttribute("data-testid"),
              followsSummary: panel.previousElementSibling === panel.parentElement?.firstElementChild,
              gap: panel.getBoundingClientRect().top - panel.previousElementSibling!.getBoundingClientRect().bottom,
              endInsideRow: panel.lastElementChild!.getBoundingClientRect().bottom <= panel.parentElement!.getBoundingClientRect().bottom + 1,
            }));
            expect(attachment.owner, where).toBe(`space-row-${projectKey}`);
            expect(attachment.followsSummary, where).toBe(true);
            expect(attachment.gap, `${where}: records follow their row`).toBeGreaterThanOrEqual(0);
            expect(attachment.gap, `${where}: records stay attached to their row`).toBeLessThanOrEqual(8);
            expect(attachment.endInsideRow, `${where}: the owning row contains the whole panel`).toBe(true);
            if (view.name === "Explore") {
              const panesInside = await page.getByTestId("space-preview").evaluate((preview) => {
                const split = preview.parentElement!;
                const bounds = split.getBoundingClientRect();
                return [split.firstElementChild!, preview].every((pane) => {
                  const box = pane.getBoundingClientRect();
                  return box.top >= bounds.top - 1 && box.bottom <= bounds.bottom + 1 && box.left >= bounds.left - 1 && box.right <= bounds.right + 1;
                });
              });
              expect(panesInside, `${where}: the tree and preview stay inside their shared viewport`).toBe(true);
            }
            const found = await measure(page, containers);
            record(where, found, defects);
            reference = compareNames(where, found, reference, defects);
          }
        }
      }
    }
    expect(defects, defects.join("\n")).toEqual([]);

    // The narrow preview keeps its wrapped header and the full file in
    // one native scroll viewport, including in a short window.
    await setRail(page, false);
    await page.setViewportSize({ width: 320, height: 400 });
    const preview = page.getByTestId("space-preview");
    await preview.scrollIntoViewIfNeeded();
    await preview.evaluate((element) => { element.scrollTop = 0; });
    expect(await preview.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
    const box = (await preview.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 10_000);
    await expect.poll(() => preview.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop), "the preview's file end is reachable").toBeLessThanOrEqual(1);
    await page.mouse.wheel(0, -10_000);
    await expect.poll(() => preview.evaluate((element) => element.scrollTop), "the preview header is reachable again").toBe(0);
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
      const projectKey = app.projectId!;
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

      // The personal project is identified within its Space.
      await expect(instanceSection(page, app.host!).getByTestId(`space-row-${projectKey}`)).toBeVisible();
      await expect(page.getByRole("button", { name: "demo-project", exact: true })).toHaveAttribute("aria-expanded", "false");
      found.push(...(await scan("Space · list")));
      await openRepository(page, projectKey);

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

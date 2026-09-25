// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The interface language through the page (localization-10, DR-078):
// a browser that asks for Chinese gets Chinese with nothing stored,
// the home's choice re-renders the page that made it and reaches
// another page of the same home, prose the core composed for the page
// follows the change, and the Chinese interface fits the 320px floor
// (DR-041). Every Chinese phrase asserted here is the `msgstr` its
// `msgid` carries in packages/ui/locales/zh/messages.po — except the
// core's own, which comes from packages/core/src/locales/zh/messages.po.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

import {
  test,
  expect,
  nav,
  open,
  openTranslated,
  surfaceEntry,
  type SurfaceName,
} from "../src/harness";
import { HEIGHTS, TALL, measure, record } from "../src/fit";

/** The rail's five entries as the `zh` catalog translates them. */
const RAIL_ZH: [SurfaceName, string][] = [
  ["Dashboard", "仪表盘"],
  ["Workspace", "项目"],
  ["Playbooks", "规程"],
  ["Space", "空间"],
  ["Settings", "设置"],
];

/** The same entries in the English the source authors. */
const RAIL_EN: [SurfaceName, string][] = [
  ["Dashboard", "Dashboard"],
  ["Workspace", "Projects"],
  ["Playbooks", "Playbooks"],
  ["Space", "Space"],
  ["Settings", "Settings"],
];

/** Every rail entry reads its name in the language the page speaks. */
async function expectRail(
  page: Page,
  entries: [SurfaceName, string][],
): Promise<void> {
  for (const [surface, label] of entries) {
    await expect(surfaceEntry(page, surface)).toHaveAccessibleName(label);
  }
}

/** Collapse the sidebar whatever the page speaks: the control says
 * whether it stands open in an attribute, which never translates. */
async function collapseRail(page: Page): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: TALL });
  const control = page.getByTestId("sidebar-collapse");
  if ((await control.getAttribute("aria-expanded")) === "true") {
    await control.click();
  }
  await expect(control).toHaveAttribute("aria-expanded", "false");
  if (size) await page.setViewportSize(size);
}

/**
 * A PNG for local visual review, and only when asked for: with
 * `SPEX_E2E_SHOTS` naming a directory the journey leaves one there,
 * and with the variable unset it does nothing, so the journey carries
 * no path of its own.
 */
async function shoot(page: Page, name: string): Promise<void> {
  const dir = process.env.SPEX_E2E_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

// ---------------------------------------------------------------------------
// The browser's own languages, with nothing stored
// ---------------------------------------------------------------------------

test.describe("a browser that asks for Chinese", () => {
  test.use({ locale: "zh-CN" });

  test("localization-10: with no stored choice the page speaks Chinese and declares zh", async ({
    page,
    app,
  }) => {
    expect(app.readPrefs()).not.toContain("language");
    await openTranslated(page, app);
    await expectRail(page, RAIL_ZH);
    // The document says which language it speaks, so fonts and glyph
    // forms follow it.
    await expect(page.locator("html")).toHaveAttribute("lang", "zh");
    // A surface the rail reaches reads its own Chinese, not only the
    // rail: 需要关注 is "Needs attention", 运行中 is "Running".
    await surfaceEntry(page, "Dashboard").click();
    const dashboard = page.getByTestId("dashboard-scroll");
    await expect(dashboard).toContainText("需要关注");
    await expect(dashboard).toContainText("运行中");
    await expect(dashboard).not.toContainText("Needs attention");
  });
});

// ---------------------------------------------------------------------------
// The choice is the home's
// ---------------------------------------------------------------------------

test("localization-10: choosing 简体中文 re-renders this page and reaches a second page of the home", async ({
  page,
  app,
  browser,
}) => {
  await open(page, app);
  await expectRail(page, RAIL_EN);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  // A mark on this page's window: a reload would take it with it.
  await page.evaluate(() => {
    (window as unknown as { __spexSameDocument?: boolean }).__spexSameDocument =
      true;
  });

  // What this page holds when the language changes, which the change
  // must keep (localization-3): a message typed into the Captain home's
  // composer, and a form under edit on the surface the choice is made
  // from — the page re-renders whole, it never remounts.
  const typed = "a message that outlives the language";
  await page.getByTestId("start-composer").fill(typed);
  const playerId = "qa.keeps-its-words";

  await nav(page, "Settings").click();
  await page.getByTestId("player-add").click();
  await page.getByTestId("player-add-id").fill(playerId);
  const section = page.getByTestId("language-section");
  const select = section.getByTestId("language-select");
  await expect(select).toHaveValue("system");
  await expect(
    select.locator("option").evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).textContent),
    ),
  ).resolves.toEqual(["System", "English", "简体中文"]);

  await select.selectOption("zh");
  // The whole interface changes language: the root re-renders off the
  // resolved language, so every surface is painted anew — the language
  // section among them, which carries its own landed-write tick
  // (settings-37).
  await expectRail(page, RAIL_ZH);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh");
  // 设置 is the Settings heading; 界面语言 names the control itself.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("设置");
  await expect(select).toHaveAccessibleName("界面语言");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __spexSameDocument?: boolean })
          .__spexSameDocument === true,
    ),
    "the page re-rendered without a reload",
  ).toBe(true);
  // Re-rendered, not remounted: the form under edit still holds its
  // id, and the composer its message.
  await expect(page.getByTestId("player-add-id")).toHaveValue(playerId);
  await surfaceEntry(page, "Workspace").click();
  await expect(page.getByTestId("start-composer")).toHaveValue(typed);
  await surfaceEntry(page, "Settings").click();

  // A second page of the same home, whose own browser asks for
  // English: it paints in what it prefers, then follows the home's
  // choice once the core answers, so Chinese is waited for.
  const second = await browser.newContext({ locale: "en-US" });
  const other = await second.newPage();
  try {
    await openTranslated(other, app);
    await expectRail(other, RAIL_ZH);
    await expect(other.locator("html")).toHaveAttribute("lang", "zh");

    // System on either page returns both: the core broadcasts the
    // choice, and each page resolves it against its own browser.
    await surfaceEntry(other, "Settings").click();
    await other.getByTestId("language-select").selectOption("system");
    await expectRail(other, RAIL_EN);
    await expect(other.locator("html")).toHaveAttribute("lang", "en");
    await expectRail(page, RAIL_EN);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(select).toHaveValue("system");
  } finally {
    await second.close();
  }
});

// ---------------------------------------------------------------------------
// The core's own prose follows the choice
// ---------------------------------------------------------------------------

/** The Sources guidance the core composes where the project names no
 * GitHub origin (`src/forge.ts`), in the English the source authors
 * and in the `msgstr` the core's own `zh` catalog carries. */
const GUIDANCE_EN =
  "No GitHub origin remote. Add one (git remote add origin …) to see issues and PRs.";
const GUIDANCE_ZH =
  "没有 GitHub origin 远程仓库。添加一个（git remote add origin …）即可查看 Issue 与 PR。";

test.describe("prose the core composed for the page", () => {
  // The demo project is a plain `git init` with no remote, and the
  // real forge adapter answers such a project with its guidance alone
  // — no `gh` is ever run, so the band is hermetic.
  test.use({ appOptions: { project: true } });

  test("localization-10: the Sources guidance reads in Chinese without a reload", async ({
    page,
    app,
  }) => {
    await open(page, app);
    await nav(page, "Dashboard").click();
    const guidance = page.getByTestId(`sources-guidance-${app.projectId}`);
    // Sources stands open on its Issues tab (dashboard-20), where the
    // guidance replaces the lists; open the band and pick the tab
    // through their own attributes should a launch have folded it.
    const toggle = page.getByTestId(`sources-toggle-${app.projectId}`);
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    const issues = page.getByTestId(`sources-tab-issues-${app.projectId}`);
    if ((await issues.getAttribute("aria-selected")) !== "true") {
      await issues.click();
    }
    await expect(guidance).toContainText(GUIDANCE_EN);

    // A mark on this page's window: a reload would take it with it.
    await page.evaluate(() => {
      (window as unknown as { __spexSameDocument?: boolean }).__spexSameDocument =
        true;
    });

    await nav(page, "Settings").click();
    await page.getByTestId("language-select").selectOption("zh");
    await expectRail(page, RAIL_ZH);

    // Back to the band on the same page: the choice made the page
    // re-read what the core had composed for it, so the guidance is
    // waited for in Chinese rather than asserted at once.
    await surfaceEntry(page, "Dashboard").click();
    await expect(guidance).toContainText(GUIDANCE_ZH);
    await expect(guidance).not.toContainText(GUIDANCE_EN);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __spexSameDocument?: boolean })
            .__spexSameDocument === true,
      ),
      "the page re-rendered without a reload",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The Chinese interface at the 320px floor
// ---------------------------------------------------------------------------

test.describe("the Chinese interface at the floor", () => {
  test.use({ appOptions: { project: true } });

  test("localization-10: the Chinese Dashboard and Settings fit 320px with the sidebar collapsed", async ({
    page,
    app,
  }) => {
    await page.setViewportSize({ width: 1024, height: TALL });
    await open(page, app);
    await nav(page, "Settings").click();
    await page.getByTestId("language-select").selectOption("zh");
    await expectRail(page, RAIL_ZH);

    // Roomy first, for a reviewer's own eyes: one shot per surface,
    // written only when a directory was named.
    const surfaces: [SurfaceName, string, string][] = [
      ["Dashboard", "dashboard", "dashboard-scroll"],
      ["Settings", "settings", "captain-section"],
      ["Space", "space", "space-header"],
      ["Playbooks", "playbooks", "builtins-section"],
      ["Workspace", "projects", "captain-home"],
    ];
    for (const [surface, name, ready] of surfaces) {
      await surfaceEntry(page, surface).click();
      await expect(page.getByTestId(ready)).toBeVisible();
      await shoot(page, `${name}-1024`);
    }

    // The floor is stated with the sidebar collapsed (DR-041).
    await collapseRail(page);

    // The floor is measured on the two surfaces localization-10 names,
    // the first two above.
    const defects: string[] = [];
    for (const [surface, name, ready] of surfaces.slice(0, 2)) {
      await surfaceEntry(page, surface).click();
      await expect(page.getByTestId(ready)).toBeVisible();
      for (const height of HEIGHTS) {
        await page.setViewportSize({ width: 320, height });
        await expect(page.getByTestId(ready)).toBeVisible();
        record(
          `${surface} in Chinese · sidebar collapsed · 320×${height}`,
          await measure(page),
          defects,
        );
        if (height === TALL) await shoot(page, `${name}-320`);
      }
      await page.setViewportSize({ width: 1024, height: TALL });
    }
    expect(defects, defects.join("\n")).toEqual([]);
  });
});

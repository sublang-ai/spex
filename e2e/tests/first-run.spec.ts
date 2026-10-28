// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The first run (run-view-97, projects-28): an empty machine, no
// config, no project — what a new user sees and how they get going.

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { seedDemoProject } from "@sublang/spex-core/testing";

import { test, expect, open, openTranslated, nav, git, clonePath, surfaceEntry } from "../src/harness";
import { expectOnboardingFit } from "../src/fit";

test.use({ appOptions: { config: "none" } });

/** Keep the three PR screenshots optional, like the language journeys. */
async function shoot(page: Page, name: string): Promise<void> {
  const dir = process.env.SPEX_E2E_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

const ONBOARDING = [
  {
    locale: "en-US",
    lang: "en",
    headline: "Write clear specs. Build with playbooks.",
    addProject: "Add a local project",
    signIn: "Sign in to your Space",
    chooseFolder: "Choose a project folder…",
    newFolder: "New folder path",
    guidance: "Describe your goal. AI helps write specs for how the system should work and how to check it, then follows playbooks to build and review changes.",
    playbook: "A playbook is a workflow written in plain language. Spex turns it into steps for AI to follow.",
    task: "New task",
    viewSpecs: "View specs",
    specsTab: /Specs.*[1-9]\d* spec items?/,
  },
  {
    locale: "zh-CN",
    lang: "zh",
    headline: "写清规约，按规程开发。",
    addProject: "添加本地项目",
    signIn: "登录你的空间",
    chooseFolder: "选择项目文件夹…",
    newFolder: "新文件夹路径",
    guidance: "说说你的目标。AI 帮你把系统该做什么、怎样检查结果写成规约，再按规程开发和审阅。",
    playbook: "规程是用自然语言描述的工作流，Spex 将它转成 AI 可执行的步骤。",
    task: "新任务",
    viewSpecs: "查看规约",
    specsTab: /规约.*[1-9]\d* 个规约条目/,
  },
] as const;

for (const copy of ONBOARDING) {
  test.describe(`first run in ${copy.lang}`, () => {
    test.use({ locale: copy.locale, viewport: { width: 1440, height: 838 } });

    test("run-view-97: welcome, local-project choice, Academy task and slash discovery", async ({
      page,
      app,
    }) => {
      // Supply only the native picker boundary. All project and specs
      // operations still go through the real served shell and core.
      await page.addInitScript(() => {
        (window as unknown as { spexNative: unknown }).spexNative = {
          pickDirectory: async () => null,
        };
      });
      await openTranslated(page, app);
      await expect(page.locator("html")).toHaveAttribute("lang", copy.lang);
      const welcome = page.getByTestId("welcome-home");
      await expect(welcome.getByRole("heading", { level: 1 })).toHaveText(copy.headline);
      await expect(welcome.getByTestId("home-add-project")).toHaveText(copy.addProject);
      await expect(welcome.getByTestId("home-academy")).toBeVisible();
      // [run-view-172] signed in nowhere, the welcome page leads to the
      // sign-in beside its two ways in.
      await expect(welcome.getByTestId("home-sign-in")).toHaveText(copy.signIn);
      await expect(welcome.getByTestId("home-open-from-groups")).toHaveCount(0);
      await expect(page.getByTestId("start-composer")).toHaveCount(0);
      await expect(page.getByTestId("captain-settings")).toHaveCount(0);
      if (copy.lang === "zh") await shoot(page, "welcome");
      await expectOnboardingFit(page, `welcome ${copy.lang}`);

      await welcome.getByTestId("home-add-project").click();
      const palette = page.getByRole("dialog");
      await expect(palette).toHaveAttribute("aria-modal", "true");
      const folder = palette.getByTestId("palette-open-folder");
      await expect(folder).toHaveText(copy.chooseFolder);
      await expect(folder).toBeFocused();
      await expect(palette.getByTestId("palette-search")).toHaveCount(0);
      await expect(palette.getByTestId("palette-path")).toHaveCount(0);
      await expect(palette.getByTestId("palette-academy")).toHaveCount(0);
      if (copy.lang === "zh") await shoot(page, "add-local-project");
      // Canceling a native pick leaves the choice open and unchanged.
      await folder.click();
      await expect(palette).toBeVisible();
      await palette.getByTestId("palette-create-start").click();
      await expect(palette.getByTestId("palette-new-path")).toBeFocused();
      await expect(palette).toContainText(copy.newFolder);
      await expect(folder).toBeVisible();
      await expect(palette.getByTestId("palette-path")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(palette).toBeHidden();
      await expect(welcome.getByTestId("home-add-project")).toBeFocused();

      // Academy opens the project task, without starting a conversation.
      await welcome.getByTestId("home-academy").click();
      const home = page.getByTestId("captain-home");
      await expect(home.getByRole("heading", { level: 1 })).toContainText("spex-academy");
      await expect(page.getByRole("tree")).toContainText("spex-academy");
      await expect(home).toContainText(copy.guidance);
      await expect(home.getByTestId("playbook-preview")).toContainText(copy.playbook);
      await expect(home.getByTestId("playbook-preview")).toContainText("/code");
      await expect(home.getByTestId("playbook-preview")).toContainText("/review");
      await expect(home.getByTestId("project-spec-status")).toContainText(copy.viewSpecs);
      await expect(page.getByRole("tab", { name: copy.specsTab })).toBeVisible();
      await expect(page.getByTestId("captain-pane")).toHaveCount(0);
      if (copy.lang === "zh") await shoot(page, "academy-project");
      await expectOnboardingFit(page, `project task ${copy.lang}`);

      // The specs link reaches the real reader and the named New task
      // tab returns to the same draft, without submitting it.
      const box = page.getByTestId("start-composer");
      await box.fill("Fix the login bug");
      await home.getByRole("button", { name: copy.viewSpecs, exact: true }).click();
      await expect(page.getByTestId("specv-live")).toBeVisible();
      await page.getByRole("tab", { name: copy.task, exact: true }).click();
      await expect(box).toHaveValue("Fix the login bug");

      // Slash discovery lists all seven installed playbooks; Escape
      // keeps the draft, and typing filters it to the matching command.
      await box.fill("/");
      const menu = page.getByRole("listbox");
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("option", { name: /^\// })).toHaveCount(7);
      await expect(menu).toContainText("/code");
      await expect(menu).toContainText("/review");
      await box.press("Escape");
      await expect(menu).toBeHidden();
      await expect(box).toHaveValue("/");
      await box.press("c");
      await expect(menu).toBeVisible();
      await expect(menu).toContainText("/code");
      await expect(menu).not.toContainText("/review");
    });
  });
}

test("run-view-97: signed in nowhere, the welcome page's Sign in to your Space shows the Space surface's sign-in", async ({
  page,
  app,
}) => {
  await open(page, app);
  const welcome = page.getByTestId("welcome-home");
  // [run-view-172] the sign-in card of the Space surface (space-3).
  await welcome.getByTestId("home-sign-in").click();
  await expect(surfaceEntry(page, "Space")).toHaveAttribute("aria-current", "page");
  const card = page.getByTestId("space-signin-card");
  await expect(card.getByRole("heading", { level: 2 })).toHaveText("Not signed in");
  await expect(card.getByTestId("space-signin-instance")).toBeVisible();
});

test("run-view-42, projects-42: the browser add form keeps paths distinct and owns its keys", async ({
  page,
  app,
}) => {
  await open(page, app);
  const welcome = page.getByTestId("welcome-home");
  const addProject = welcome.getByTestId("home-add-project");
  const palette = page.getByRole("dialog", { name: "Add a project" });

  // A browser without the native bridge offers an existing path.
  await addProject.click();
  await expect(palette).toBeVisible();
  const path = palette.getByTestId("palette-path");
  await expect(path).toBeFocused();
  await expect(path).toHaveAttribute("placeholder", "/path/to/existing-project");
  await expect(palette.getByTestId("palette-open-folder")).toHaveCount(0);
  await expect(palette.getByTestId("palette-academy")).toHaveCount(0);
  const create = palette.getByTestId("palette-create-start");

  // Tab wraps between the last and first enabled controls.
  await path.press("Shift+Tab");
  await expect(create).toBeFocused();
  await create.press("Tab");
  await expect(path).toBeFocused();

  await create.click();
  const newPath = palette.getByTestId("palette-new-path");
  await expect(newPath).toBeFocused();
  await expect(newPath).toHaveAttribute("placeholder", "/path/to/new-project");
  await expect(path).toHaveCount(0);
  await newPath.fill(`${app.home}/new-project`);
  await palette.getByTestId("palette-manual-path-start").click();
  await expect(path).toBeFocused();
  await expect(newPath).toHaveCount(0);

  await path.press("Escape");
  await expect(palette).toBeHidden();
  await expect(addProject).toBeFocused();
});

test("projects-28: the palette adds, refuses, switches, and the Overview removes", async ({
  page,
  app,
}) => {
  await open(page, app);
  const openPalette = () => page.keyboard.press("ControlOrMeta+p");

  // A path that is no git work tree: guidance, nothing registered.
  await openPalette();
  const palette = page.getByRole("dialog", { name: /Add a project|Choose a project/ });
  const path = palette.getByTestId("palette-path");
  await path.fill(app.home);
  await palette.getByTestId("palette-add").click();
  await expect(palette).toContainText(/git work tree/i);
  const tree = page.getByRole("tree", { name: "Projects and sessions" });
  await expect(tree).not.toContainText("home");

  // An existing repository adds and becomes current.
  seedDemoProject(app.projectDir);
  await path.fill(app.projectDir);
  await palette.getByTestId("palette-add").click();
  await expect(palette).toBeHidden();
  await expect(tree).toContainText("demo-project");
  await expect(page.getByTestId("captain-home")).toContainText("demo-project");

  // The same path again switches without a duplicate.
  await openPalette();
  await palette.getByTestId("palette-path").fill(app.projectDir);
  await palette.getByTestId("palette-add").click();
  await expect(palette).toBeHidden();
  await expect(tree.getByText("demo-project", { exact: true })).toHaveCount(1);

  // The Overview: the branch, and GitHub guidance in GitHub terms
  // (projects-4, projects-7, projects-25).
  const key = (await app.core.command("project.list", {})).find((project) => project.path === app.projectDir)!.id;
  await page.getByRole("tab", { name: "Overview" }).click();
  const overview = page.getByTestId("overview-tab");
  await expect(overview).toContainText(git(app.projectDir, "symbolic-ref", "--short", "HEAD"));
  await expect(overview.getByText(/GitHub/).first()).toBeVisible();
  await expect(overview.getByText(/no github origin remote/i).first()).toBeVisible();
  await expect(page.getByText(/\bforge\b/i)).toHaveCount(0);

  // Removal confirms with Remove and Keep; the clone holds records that
  // never reached the host, so a second confirm names their count; then
  // the project leaves the sidebar, its clone is deleted, and the
  // working folder stays (projects-9).
  await overview.getByRole("button", { name: "Remove project" }).click();
  await expect(overview).toContainText("Remove from Spex? The repo stays on disk.");
  await expect(overview.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
  await overview.getByRole("button", { name: "Remove", exact: true }).click();
  const unsent = overview.getByTestId("remove-project-unsent");
  await expect(unsent).toContainText(/[1-9]\d* records? (has|have) not reached the host and would be lost; confirm to remove anyway Remove anyway\?/);
  await expect(tree).toContainText("demo-project");
  await unsent.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(tree).not.toContainText("demo-project");
  expect(existsSync(`${app.projectDir}/.git`)).toBe(true);
  expect(existsSync(clonePath(app.dataDir, key))).toBe(false);
  await nav(page, "Dashboard").click();
  await expect(page.getByTestId("projects-empty")).toBeVisible();
});

test("projects-28: the Overview names the project's spex repository and its state", async ({
  page,
  app,
}) => {
  // The Overview's repository header carries the records field — the
  // spex repository's name with its group, and its state (projects-4,
  // space-61).
  seedDemoProject(app.projectDir);
  await app.core.command("project.register", { path: app.projectDir });
  await open(page, app);
  await page.getByRole("tab", { name: "Overview" }).click();
  const overview = page.getByTestId("overview-tab");
  await expect(overview).toContainText("demo-project-spex", { timeout: 5_000 });
  await expect(overview).toContainText("On this computer only", { timeout: 5_000 });
});

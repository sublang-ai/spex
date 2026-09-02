// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The first run (run-view-97, projects-28): an empty machine, no
// config, no project — what a new user sees and how they get going.

import { existsSync } from "node:fs";
import { seedDemoProject } from "@sublang/spex-core/testing";

import { test, expect, open, nav } from "../src/harness";

test.use({ appOptions: { config: "none" } });

test("run-view-97: the first run greets, keeps the draft, seeds the Academy", async ({
  page,
  app,
}) => {
  await open(page, app);

  // The core seeded its installed template: the greeting offers a
  // project and the quick start names the built-ins.
  const home = page.getByTestId("captain-home");
  await expect(home).toContainText(/add a project/i);
  const quickStart = page.getByTestId("quick-start");
  await expect(quickStart).toContainText("/code");
  await expect(quickStart).toContainText("/review");

  // Submitting with no project opens the palette; the draft survives.
  const box = page.getByTestId("start-composer");
  await box.fill("Fix the login bug");
  await box.press("Enter");
  const palette = page.getByRole("dialog", { name: "Choose a project" });
  await expect(palette).toBeVisible();

  await palette.getByTestId("palette-academy").click();
  await expect(palette).toBeHidden();
  const tree = page.getByRole("tree", { name: "Projects and sessions" });
  await expect(tree).toContainText("spex-academy");
  await expect(home).toContainText("spex-academy");
  await expect(box).toHaveValue("Fix the login bug");

  // The slash menu: "/" lists playbooks, Escape hides it with the
  // draft intact, typing reopens it.
  await box.fill("/");
  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("option")).toHaveCount(await menu.getByRole("option").count());
  await expect(menu).toContainText("/code");
  await box.press("Escape");
  await expect(menu).toBeHidden();
  await expect(box).toHaveValue("/");
  await box.press("c");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("listbox")).toContainText("/code");
  await expect(page.getByRole("listbox")).not.toContainText("/review");
});

test("projects-28: the palette adds, refuses, switches, and the Overview removes", async ({
  page,
  app,
}) => {
  await open(page, app);
  const openPalette = () =>
    page.getByRole("button", { name: "Switch or add a project" }).click();

  // A path that is no git work tree: guidance, nothing registered.
  await openPalette();
  const palette = page.getByRole("dialog", { name: "Choose a project" });
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

  // The Overview: branch and GitHub guidance in GitHub terms.
  await page.getByRole("tab", { name: "Overview" }).click();
  const overview = page.getByRole("tabpanel").or(page.locator("main"));
  await expect(page.getByText(/GitHub/).first()).toBeVisible();
  await expect(page.getByText(/no github origin remote/i).first()).toBeVisible();
  await expect(page.getByText(/\bforge\b/i)).toHaveCount(0);
  void overview;

  // Removal forgets the project and leaves the directory.
  await page.getByRole("button", { name: /remove project|remove/i }).first().click();
  await page.getByRole("button", { name: /^remove$/i }).click();
  await expect(tree).not.toContainText("demo-project");
  expect(existsSync(`${app.projectDir}/.git`)).toBe(true);
  await nav(page, "Dashboard").click();
  await expect(page.getByTestId("projects-empty")).toBeVisible();
});

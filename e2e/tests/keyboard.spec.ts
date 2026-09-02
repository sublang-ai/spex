// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The keyboard journey (run-view-101): the palette, the surfaces, the
// sidebar, and the composer, without a pointer.

import { test, expect, open } from "../src/harness";

test.use({ appOptions: { project: true } });

const MOD = "ControlOrMeta";

test("run-view-101: palette, surfaces, sidebar, and composer by keyboard", async ({
  page,
  app,
}) => {
  await open(page, app);
  const focusedIsBody = () =>
    page.evaluate(() => document.activeElement === document.body || !document.activeElement);

  // The palette: open, move, pick, reopen, escape.
  await page.keyboard.press(`${MOD}+p`);
  const palette = page.getByRole("dialog", { name: "Choose a project" });
  await expect(palette).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(page.getByTestId("captain-home")).toContainText("demo-project");
  await page.keyboard.press(`${MOD}+p`);
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  expect(await focusedIsBody()).toBe(false);

  // Surfaces by number; the sidebar by B.
  await page.keyboard.press(`${MOD}+1`);
  await expect(page.getByTestId("attention-all-clear")).toBeVisible();
  await page.keyboard.press(`${MOD}+3`);
  await expect(page.getByTestId("builtins-section")).toBeVisible();
  await page.keyboard.press(`${MOD}+4`);
  await expect(page.getByTestId("captain-section")).toBeVisible();
  await page.keyboard.press(`${MOD}+2`);
  await expect(page.getByTestId("captain-home")).toBeVisible();
  await page.keyboard.press(`${MOD}+b`);
  await expect(page.getByRole("button", { name: "Show the sidebar" })).toBeVisible();
  await page.keyboard.press(`${MOD}+b`);
  await expect(page.getByRole("button", { name: "Collapse the sidebar" })).toBeVisible();

  // A Tab sequence from the page start reaches the composer.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const box = page.getByTestId("start-composer");
  let reached = false;
  for (let i = 0; i < 40 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await box.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);

  // Enter sends; Shift+Enter breaks a line.
  await page.keyboard.type("line one");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("line two");
  await expect(box).toHaveValue("line one\nline two");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: /line one/i })).toBeVisible();
  await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
  expect(await focusedIsBody()).toBe(false);

  // The strip walks by arrow keys, Home, and End without switching
  // tabs; Delete closes the focused tab and focus lands on a tab, never
  // on the body (run-view-48).
  const sessionTab = page.getByRole("tab", { name: /line one/i });
  const plusTab = page.getByRole("tab", { name: "Start another session" });
  await sessionTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(plusTab).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Overview" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(sessionTab).toBeFocused();
  await expect(sessionTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Delete");
  await expect(page.getByRole("tab", { name: /line one/i })).toHaveCount(0);
  // The last session tab closed: the start view's composer is ready.
  await expect(page.getByTestId("start-composer")).toBeFocused();
  expect(await focusedIsBody()).toBe(false);
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, readdirSync, rmSync } from "node:fs";
import { parse } from "yaml";
import { test, expect, open, nav } from "../src/harness";
import { measure, record, setRail } from "../src/fit";

test.describe("honest browser capability facts", () => {
  test.use({ appOptions: { project: true } });
  test("settings-45: unknown adapter support leaves a stale browser choice clearable and fits", async ({ page, app }) => {
    await app.core.command("config.edit", { op: { kind: "captain.set", patch: { browser: true } } });
    await open(page, app);
    await nav(page, "Settings").click();
    const captain = page.getByTestId("captain-section");
    await captain.getByTestId("captain-edit").click();
    const editor = captain.getByTestId("agent-editor");
    const browser = editor.getByRole("checkbox", { name: "Browser", exact: true });
    await expect(browser).toBeChecked();
    await expect(editor.getByRole("button", { name: "Set up browser" })).toHaveCount(0);
    await expect(editor).toContainText(/capabilit|unverified/i);
    await setRail(page, false);
    const defects: string[] = [];
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      record(`Browser editor ${width}px`, await measure(page), defects);
    }
    expect(defects).toEqual([]);
    await browser.uncheck();
    await expect(browser).toBeDisabled();
    await captain.getByTestId("agent-save").click();
    await expect.poll(() => parse(app.readConfig()).captain.browser).toBe(false);
  });
});

test.describe("native browser preparation", () => {
  test.use({ appOptions: { project: true, nativeBrowser: true } });
  test("settings-45: real host launch and screenshot precede an explicit browser save", async ({ page, app }) => {
    test.setTimeout(960_000);
    // The test browser is already running. Only the host-side managed
    // browser bootstrap receives this separate, initially empty cache.
    const managedCache = process.env.SPEX_E2E_BROWSER_CACHE;
    const priorCache = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (managedCache) {
      expect(!existsSync(managedCache) || readdirSync(managedCache).length === 0).toBe(true);
      process.env.PLAYWRIGHT_BROWSERS_PATH = managedCache;
    }
    try {
      // Only native runtime construction and browser preparation run; no
      // provider prompt or model credential is needed for this journey.
      await app.core.command("config.edit", { op: { kind: "captain.set", patch: { adapter: "codex", model: null, effort: null, permissions: { mode: "auto" }, browser: false } } });
      const before = app.readConfig();
      await open(page, app);
      await nav(page, "Settings").click();
      const captain = page.getByTestId("captain-section");
      await captain.getByTestId("captain-edit").click();
      const editor = captain.getByTestId("agent-editor");
      const browser = editor.getByRole("checkbox", { name: "Browser", exact: true });
      await expect(browser).not.toBeChecked();
      await editor.getByRole("button", { name: "Set up browser" }).click();
      const outcome = editor.getByText(/^(Browser ready|Browser setup failed)$/);
      await expect(outcome).toBeVisible({ timeout: 930_000 });
      const detail = await editor.getByRole("status").filter({ hasText: /Browser ready|Browser setup failed/ }).innerText();
      expect(await outcome.innerText(), detail).toBe("Browser ready");
      await expect(browser).not.toBeChecked();
      expect(app.readConfig()).toBe(before);
      await browser.check();
      await captain.getByTestId("agent-save").click();
      await expect.poll(() => parse(app.readConfig()).captain.browser).toBe(true);
      await captain.getByTestId("captain-edit").click();
      await expect(browser).toBeChecked();
    } finally {
      try {
        // Stop and await host preparation before removing the cache that
        // this attempt alone populated. A retry must also start cold.
        await app.stop();
        if (managedCache) rmSync(managedCache, { recursive: true, force: true });
      } finally {
        if (priorCache === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
        else process.env.PLAYWRIGHT_BROWSERS_PATH = priorCache;
      }
    }
  });
});

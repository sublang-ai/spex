// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync, readdirSync, rmSync } from "node:fs";
import { parse } from "yaml";
import { test, expect, open, nav } from "../src/harness";
import { measure, record, setRail } from "../src/fit";
import { waitForBrowserPreparation } from "../../scripts/browser-preparation";

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
      await waitForBrowserPreparation(editor);
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

test("settings-43/settings-45: rendered setup outcomes stop promptly and long diagnostics fit without hiding Retry", async ({ page, app }, testInfo) => {
  // Substitute only capability/setup replies at the socket boundary. The real
  // served editor, client, rendering, cancellation and shared driver wait run.
  let reply: ((result: unknown) => void) | undefined;
  let preparations = 0;
  let turns = 0;
  await page.routeWebSocket(/.*/, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw));
      const respond = (result: unknown) => socket.send(JSON.stringify({ type: "reply", id: message.id, ok: true, result }));
      if (message.type === "agent.capabilities") respond({ browser: { status: "supported" } });
      else if (message.type === "browser.prepare") { preparations++; reply = respond; }
      else if (message.type === "browser.cancel") respond({ canceled: true });
      else { if (message.type === "turn.submit") turns++; server.send(raw); }
    });
  });
  await open(page, app);
  await nav(page, "Settings").click();
  const captain = page.getByTestId("captain-section");
  await captain.getByTestId("captain-edit").click();
  const control = captain.getByTestId("browser-control");
  const before = app.readConfig();
  // Initial idle is never mistaken for a cancelled or successful attempt.
  await expect(waitForBrowserPreparation(captain, { timeoutMs: 100 })).rejects.toThrow("did not reach a terminal state");
  await control.getByRole("button", { name: "Set up browser" }).click();
  await expect.poll(() => reply !== undefined).toBe(true);
  const firstLine = `Managed Chromium installation failed. ${"Long host diagnostic ".repeat(80)}`;
  const plain = `${firstLine}\n${"getaddrinfo ENOTFOUND cdn.playwright.dev\n".repeat(45)}<script>safe text</script>\nfinal diagnostic`;
  reply!({ status: "not-ready", code: "install-failed", message: `\u001b[31m${plain}\u001b[0m` });
  const failure = await waitForBrowserPreparation(captain, { timeoutMs: 5000 }).then(() => undefined, (error: Error) => error);
  expect(failure?.message).toBe(`Browser preparation failed: ${plain}`);
  expect(await control.locator("details").getAttribute("open")).toBeNull();
  await setRail(page, false);
  const defects: string[] = [];
  for (const width of [320, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await control.scrollIntoViewIfNeeded();
    const disclosure = control.locator("summary");
    await disclosure.focus();
    await page.keyboard.press("Enter");
    await expect(control.locator("details")).toHaveAttribute("open", "");
    const diagnostic = control.getByTestId("browser-diagnostic");
    expect(await diagnostic.textContent()).toBe(plain);
    expect(await diagnostic.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await expect(control.getByRole("button", { name: "Retry browser setup" })).toBeInViewport();
    record(`Browser failure ${width}px`, await measure(page), defects);
    await testInfo.attach(`browser-failure-${width}`, { body: await page.screenshot(), contentType: "image/png" });
    await disclosure.focus();
    await page.keyboard.press("Enter");
  }
  expect(defects).toEqual([]);
  await control.getByRole("button", { name: "Retry browser setup" }).click();
  await expect(control.getByRole("status")).toContainText("Preparing browser");
  await control.getByRole("button", { name: "Cancel browser setup" }).click();
  await expect(waitForBrowserPreparation(captain, { timeoutMs: 5000 })).rejects.toThrow("Browser preparation cancelled: Browser setup cancelled");
  reply!({ status: "ready", checkedAt: 1 }); // A cancelled attempt's late reply stays ignored.
  await expect(control.getByRole("status")).toContainText("Browser not prepared");
  reply = undefined;
  await control.getByRole("button", { name: "Set up browser" }).click();
  await expect.poll(() => reply !== undefined).toBe(true);
  let continued = false;
  const ready = waitForBrowserPreparation(captain, { timeoutMs: 5000 }).then(() => { continued = true; });
  await expect(control.getByRole("status")).toContainText("Preparing browser");
  expect(continued).toBe(false);
  reply!({ status: "ready", checkedAt: 2 });
  await ready;
  expect(continued).toBe(true);
  await control.getByRole("button", { name: "Check browser" }).click();
  await expect(control.getByRole("status")).toContainText("Preparing browser");
  await expect(waitForBrowserPreparation(captain, { timeoutMs: 100 })).rejects.toThrow("did not reach a terminal state");
  await control.getByRole("button", { name: "Cancel browser setup" }).click();
  expect(preparations).toBe(4);
  expect(turns).toBe(0);
  expect(app.readConfig()).toBe(before);
  await expect(control.getByRole("checkbox", { name: "Browser", exact: true })).not.toBeChecked();
});

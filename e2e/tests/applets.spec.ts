// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An applet in the IDE (applets-8, DR-161): a release holding an applet
// whose page lists the working folder through `~/` and shows its README
// is requested through Add from registry; its tab stands after
// Overview, the frame it shows is sandboxed and confined, Reload reads
// the README again, and Remove takes the tab away.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APPLET_ID, APPLET_PACKAGE, APPLET_VERSION, publishAppletRelease } from "@sublang/spex-core/testing";

import { expect, nav, open, test } from "../src/harness";

test.use({ appOptions: { project: true, host: { registry: true } } });

test("applets-8: an applet installed from the registry stands as a tab, shows the working folder in a confined frame, reloads, and leaves with its package", async ({ page, app }) => {
  test.setTimeout(180_000);
  const registry = app.registry;
  if (!registry) throw new Error("a stand-in registry is required");
  await publishAppletRelease(join(app.home, "applet-release"), registry.url);
  const readme = "Applet journey: the first README.\n";
  writeFileSync(join(app.projectDir, "README.md"), readme);
  mkdirSync(join(app.projectDir, "notes"), { recursive: true });
  writeFileSync(join(app.projectDir, "notes", "today.md"), "A note.\n");
  // The served page's policy refusing a frame says so on the console.
  const refusals: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|frame-src/i.test(message.text())) refusals.push(message.text());
  });

  await open(page, app);
  await nav(page, "Playbooks").click();
  await page.getByTestId("add-from-registry").click();
  await page.getByTestId("registry-query").fill("report-kit");
  const result = page.getByTestId(`registry-result-${APPLET_PACKAGE}`);
  await expect(result).toBeVisible();
  await result.getByTestId(`registry-add-${APPLET_PACKAGE}`).click();
  const row = page.getByTestId(`env-package-${APPLET_PACKAGE}`);
  await expect(row.getByTestId(`env-installed-${APPLET_PACKAGE}`)).toHaveText("Installed");
  await expect(row.getByTestId(`env-artifact-${APPLET_PACKAGE}-${APPLET_ID}`)).toContainText("applet");

  // The tab stands after Overview, named by the applet's id and
  // naming its spec package and version (applets-1).
  await nav(page, "Projects").click();
  const strip = page.getByRole("tablist", { name: "Sessions and project views" });
  const tab = strip.getByRole("tab", { name: APPLET_ID, exact: true });
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute("title", `Applet from ${APPLET_PACKAGE} ${APPLET_VERSION}`);
  const names = await strip.getByRole("tab").allTextContents();
  expect(names.indexOf(APPLET_ID)).toBeGreaterThan(names.findIndex((name) => name.startsWith("Overview")));

  // Shown, it fills the pane with a sandboxed frame under the line
  // naming the spec package and version (applets-2), whose page lists
  // the working folder and shows the README read through the core
  // (applets-4).
  await tab.click();
  await expect(page.getByTestId("applet-source")).toHaveText(`${APPLET_PACKAGE} ${APPLET_VERSION} · applet ${APPLET_ID}`);
  const iframe = page.locator("iframe[sandbox]");
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-downloads");
  await expect(iframe).toHaveAttribute("src", /^http:\/\/127\.0\.0\.1:\d+\/applets\/[A-Za-z0-9_-]{43}\/$/);
  const frame = page.frameLocator("iframe[sandbox]");
  await expect(frame.locator("#readme")).toHaveText(readme.trim());
  await expect(frame.locator('#listing li[data-kind="file"]', { hasText: "README.md" })).toBeVisible();
  await expect(frame.locator('#listing li[data-kind="folder"]', { hasText: "notes" })).toBeVisible();

  // The page's origin is opaque: it reaches neither the IDE's document
  // nor any storage (applets-2, applets-5).
  const applet = page.frames().find((candidate) => /\/applets\//.test(candidate.url()));
  if (!applet) throw new Error("the applet's frame is not loaded");
  expect(await applet.evaluate(() => {
    try {
      return window.parent.document ? "reached" : "none";
    } catch {
      return "threw";
    }
  })).toBe("threw");
  expect(await applet.evaluate(() => {
    try {
      window.localStorage.setItem("probe", "1");
      return "reached";
    } catch {
      return "threw";
    }
  })).toBe("threw");

  // After an edit to the README, Reload shows the new text (applets-2).
  const edited = "Applet journey: the README after an edit.\n";
  writeFileSync(join(app.projectDir, "README.md"), edited);
  await page.getByTestId("applet-reload").click();
  await expect(frame.locator("#readme")).toHaveText(edited.trim());

  // The served page's policy admits the frame (applets-6): it loaded,
  // and nothing was refused framing.
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy).toContain("frame-src 'self' http://127.0.0.1:* http://localhost:*");
  expect(refusals).toEqual([]);

  // Remove of the spec package takes the tab away (applets-1).
  await nav(page, "Playbooks").click();
  await row.getByTestId(`env-remove-${APPLET_PACKAGE}`).click();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(row).toHaveCount(0);
  await nav(page, "Projects").click();
  await expect(strip.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(strip.getByRole("tab", { name: APPLET_ID, exact: true })).toHaveCount(0);
  await expect(page.locator("iframe[sandbox]")).toHaveCount(0);
});

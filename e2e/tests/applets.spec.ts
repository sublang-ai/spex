// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An applet in the IDE (applets-8, DR-161): a release holding an applet
// whose page lists the working folder through `~/` and shows its README
// is requested through Add from registry; its tab stands after
// Overview, the frame it shows is sandboxed and confined — a navigation
// of the frame off the endpoint's origin refused — Reload reads the
// README again, and Remove takes the tab away.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { APPLET_ID, APPLET_PACKAGE, APPLET_VERSION, publishAppletRelease } from "@sublang/spex-core/testing";

import { expect, nav, open, selectRegistryCore, test, uiDist } from "../src/harness";

test.use({ appOptions: { project: true, host: { registry: true } } });

test("applets-8: an applet installed from the registry stands as a tab, shows the working folder in a confined frame, reloads, and leaves with its package", async ({ page, app }) => {
  test.setTimeout(180_000);
  const registry = app.registry;
  if (!registry) throw new Error("a stand-in registry is required");
  await publishAppletRelease(join(app.home, "applet-release"), registry.url);
  await selectRegistryCore(app, app.host!.url);
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
  await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
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
  // Sent no referrer, the page learns nothing of the IDE page's address
  // (applets-2) — on the served shell the frame's address shares that
  // page's origin, so a referrer would carry its whole address.
  expect(await applet.evaluate(() => document.referrer)).toBe("");

  // The frame navigates nowhere but the endpoint's origin (applets-9):
  // the page's own script sending its frame to a sink at another
  // loopback port, the README's text in the URL, is refused — the sink
  // hears nothing, no frame stands at the sink's origin, the page's
  // console names `frame-src`, and the Reload that follows brings the
  // page back. Chromium commits its own refusal page in the frame.
  expect(refusals).toEqual([]);
  const hits: string[] = [];
  const sink = createServer((req, res) => {
    hits.push(req.url ?? "");
    res.end("ok");
  });
  await new Promise<void>((resolve) => sink.listen(0, "127.0.0.1", resolve));
  try {
    const sinkPort = (sink.address() as AddressInfo).port;
    await applet.evaluate((port) => {
      location.assign(`http://127.0.0.1:${port}/?d=${encodeURIComponent(document.getElementById("readme")?.textContent ?? "")}`);
    }, sinkPort).catch(() => undefined);
    await page.waitForTimeout(1500);
    expect(hits).toEqual([]);
    expect(page.frames().map((candidate) => candidate.url())).not.toContainEqual(expect.stringContaining(`127.0.0.1:${sinkPort}`));
    expect(refusals.some((line) => /frame-src/.test(line))).toBe(true);
  } finally {
    sink.close();
  }

  // After an edit to the README, Reload shows the new text (applets-2).
  const edited = "Applet journey: the README after an edit.\n";
  writeFileSync(join(app.projectDir, "README.md"), edited);
  await page.getByTestId("applet-reload").click();
  await expect(frame.locator("#readme")).toHaveText(edited.trim());

  // The served page's policy frames `'self'` alone (applets-9), and the
  // staged bundle's page — the desktop's `file://` copy as built —
  // the loopback origins (applets-6).
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy).toMatch(/frame-src 'self'$/);
  const built = readFileSync(join(uiDist, "index.html"), "utf8");
  expect(built).toContain("frame-src 'self' http://127.0.0.1:* http://localhost:*");

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

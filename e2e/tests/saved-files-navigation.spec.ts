// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Optional recovery stays in Space, including when every reminder has
// been dismissed and no project is open (DR-214). Exercise the real
// home, persisted dismissal and saved transcript through the served UI.

import { Home } from "@sublang/spex-core";
import { expect, openTranslated, surfaceEntry, test, writeTerminalSession } from "../src/harness";

for (const locale of ["en-US", "zh-CN"]) {
  test.describe(locale, () => {
    test.use({ locale, appOptions: { project: true } });

    test("run-view-70, space-122: dismissed folder choices stay reachable through Files & history", async ({ page, app }, testInfo) => {
      const chinese = locale === "zh-CN";
      const label = chinese ? "文件与历史记录" : "Files & history";
      const prompt = "Plan the next release";
      await writeTerminalSession(app, { prompt });
      await app.stop();
      const home = Home.load(app.dataDir);
      home.unpair(app.projectId!);
      home.save();
      await app.start();

      await openTranslated(page, app);
      await expect(page.getByTestId(`sidebar-project-${app.projectId}`)).toHaveCount(0);
      await expect(page.getByTestId("sidebar-locate-files")).toHaveCount(0);
      await surfaceEntry(page, "Space").click();
      const control = page.getByTestId("space-issues");
      await expect(control).toContainText(label);
      await expect(control).toHaveAttribute("aria-expanded", "false");
      await control.click();
      await expect(page.getByRole("button", { name: prompt, exact: true })).toBeVisible();
      await page.getByTestId("space-repair-decline").click();
      await expect(control).toHaveText(label);
      await expect(page.getByTestId("space-deferred-notice")).toContainText(label);

      // The dismissal persists in the real home. A fresh page recovers
      // it through the named Space destination, without a project row.
      await surfaceEntry(page, "Dashboard").click();
      await page.reload();
      await page.getByTestId("sidebar-collapse").click();
      await page.setViewportSize({ width: 320, height: 640 });
      await surfaceEntry(page, "Space").click();
      await expect(control).toHaveText(label);
      await control.click();
      const dismissed = page.getByTestId("space-dismissed");
      await expect(dismissed).not.toHaveAttribute("open");
      await dismissed.locator(":scope > summary").click();
      await expect(page.getByRole("button", { name: prompt, exact: true })).toBeVisible();

      // The longer descriptive label fits beside the collapsed rail
      // in both offered languages, with no page-wide overflow.
      expect(await control.evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= window.innerWidth && button.scrollWidth <= button.clientWidth + 1;
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("files-and-history-narrow.png") });

      await page.getByRole("button", { name: prompt, exact: true }).click();
      await expect(page.getByTestId("saved-conversation-reader")).toBeVisible();
      await expect(page.getByTestId("saved-conversation-reader")).toContainText("Done from the terminal.");
      await expect(page.getByTestId("boss-composer")).toHaveCount(0);
      await page.getByRole("button", { name: chinese ? "返回 Space" : "Back to Space", exact: true }).click();
      await expect(control).toBeFocused();
      await expect(dismissed).toHaveAttribute("open", "");
      await expect(page.getByRole("button", { name: prompt, exact: true })).toBeVisible();
      await expect(page.getByTestId("sidebar-locate-files")).toHaveCount(0);
      await expect(page.getByTestId(`sidebar-project-${app.projectId}`)).toHaveCount(0);
    });
  });
}

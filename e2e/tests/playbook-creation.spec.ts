// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A playbook starts as local writing, without a registry account or a
// publishing name. Only publication asks for its name and license;
// publishing a snapshot leaves the working package and its request
// intact. Measure the actual served form in both interface languages.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { AUTHORING_SOURCE } from "@sublang/spex-core/testing";

import {
  expect,
  openTranslated,
  orgSuggestions,
  packageRow,
  packagesSection,
  rowMenu,
  projectTab,
  selectRegistryCore,
  signInRegistryCore,
  test,
} from "../src/harness";
import { measure } from "../src/fit";

async function fitAndCapture(page: Page, panel: Locator, stage: string, testInfo: TestInfo): Promise<void> {
  const collapse = page.getByTestId("sidebar-collapse");
  for (const size of [{ width: 1280, height: 800 }, { width: 800, height: 400 }, { width: 320, height: 800 }]) {
    // Changing the rail is an explicit action, performed at a width
    // where its control is reachable in either language.
    await page.setViewportSize({ width: 1280, height: 800 });
    const expanded = (await collapse.getAttribute("aria-expanded")) === "true";
    if (stage === "01-start-writing" && expanded !== (size.width !== 320)) await collapse.click();
    await page.setViewportSize(size);
    await panel.evaluate((element) => element.scrollIntoView({ block: "start", inline: "nearest" }));
    const fit = await measure(page, [`[data-testid="${await panel.getAttribute("data-testid")}"]`]);
    expect({ overflow: fit.overflow, vertical: fit.vertical, overlap: fit.overlap }, `${stage} at ${size.width}x${size.height}`).toEqual({ overflow: [], vertical: [], overlap: [] });
    if (size.width !== 800) {
      const screenshotPanel = stage === "02-publish-details" ? page.getByRole("dialog") : panel;
      await screenshotPanel.screenshot({ path: testInfo.outputPath(`${stage}-${size.width}.png`) });
      await page.screenshot({ path: testInfo.outputPath(`${stage}-context-${size.width}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  if (stage === "01-start-writing" && (await collapse.getAttribute("aria-expanded")) !== "true") await collapse.click();
}

for (const locale of ["en-US", "zh-CN"]) {
  test.describe(locale, () => {
    test.use({
      locale,
      appOptions: {
        project: true,
        host: { registry: true, displayName: "Workshop registry" },
        independentRegistry: true,
        authoring: { slc: "ok", phaseDelayMs: 30, script: { fallback: { deltas: ["Compiled."], result: "Compiled." } } },
      },
    });

    test("playbook-library-125: create locally, add, then choose publication details without renaming local files", async ({ page, app }, testInfo) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      await openTranslated(page, app);
      await projectTab(page, "Playbooks");
      const form = page.getByTestId("new-playbook");
      const command = page.getByTestId("new-playbook-id");
      await expect(command).toHaveAccessibleName(locale === "zh-CN" ? "命令" : "Command");
      await expect(form.locator("input")).toHaveCount(1);
      await expect(page.getByTestId("new-playbook-org")).toHaveCount(0);
      await expect(page.getByTestId("new-playbook-license")).toHaveCount(0);
      await command.fill("Code-fast");
      await command.press("Enter");
      await expect(page.getByTestId("new-playbook-error")).toBeVisible();
      expect(await app.core.command("draft.list", {})).toEqual([]);
      await command.fill("code-fast");
      await expect(page.getByTestId("new-playbook-caption")).toContainText("/code-fast");
      await fitAndCapture(page, form, "01-start-writing", testInfo);
      await command.press("Enter");
      await expect(page.getByTestId("authoring-workspace")).toBeVisible();
      const [draft] = await app.core.command("draft.list", {});
      expect(draft?.package).toBe("local/code-fast");
      const metaPath = join(app.projectDir, "spex-packages", "local", "code-fast", "meta.yaml");
      const originalMeta = readFileSync(metaPath, "utf8");
      expect(originalMeta).not.toMatch(/^license:/m);
      expect(app.registry!.script.received.filter((request) => /orgs/.test(request.path))).toEqual([]);

      // Authoring and local use need no publication setup or account.
      await page.getByRole("button", { name: locale === "zh-CN" ? "粘贴" : "Paste", exact: true }).click();
      await page.getByTestId("paste-text").fill(AUTHORING_SOURCE.replaceAll("<id>", "code-fast"));
      await page.getByTestId("paste-use").click();
      await page.getByTestId("compile-button").click();
      await expect(page.getByTestId("draft-chip")).toContainText(locale === "zh-CN" ? "已编译" : "Compiled", { timeout: 30_000 });
      await page.getByTestId("tab-add").click();
      await page.getByTestId("register-player-Triager").selectOption("dev.coder");
      await page.getByTestId("register-player-Verifier").selectOption("dev.reviewer");
      await page.getByTestId("register-submit").click();
      await expect(page.getByTestId("playbook-card-code-fast")).toBeVisible();
      const localBefore = await app.core.command("environment.get", { repository: app.projectId! });
      const sourceBefore = localBefore.requests["local/code-fast"];
      const localMetaBefore = readFileSync(metaPath, "utf8");
      expect(sourceBefore).toEqual({ kind: "path", path: "spex-packages/local/code-fast" });

      // Publication is a separate, deliberate step. A registry account
      // is arranged without signing in to a Space or changing its state.
      await selectRegistryCore(app, app.host!.url);
      await signInRegistryCore(app);
      app.registry!.script.setOrgs(app.host!.url, [{ name: "acme", path: "acme", role: "Owner" }]);
      await page.getByTestId("draft-open-code-fast").click();
      await page.getByTestId("tab-add").click();
      // Collapse before opening the modal; its backdrop correctly
      // prevents changes to background navigation while it is open.
      await page.getByTestId("sidebar-collapse").click();
      await page.getByTestId("publish-button").click();
      const setup = page.getByTestId("publish-setup");
      await expect(setup).toBeVisible();
      await page.getByTestId("publish-org").fill("acme");
      await page.getByTestId("publish-license").fill("Apache-2.0");
      await expect.poll(() => orgSuggestions(page)).toEqual(["acme"]);
      await fitAndCapture(page, setup, "02-publish-details", testInfo);
      await page.getByTestId("publish-review").click();
      const preview = page.getByTestId("publish-summary");
      await expect(preview).toContainText("acme/code-fast");
      await expect(preview).toContainText("0.1.0");
      await page.getByTestId("publish-confirm").click();
      await expect(page.getByTestId("publish-done")).toBeVisible({ timeout: 30_000 });
      expect((await fetch(`${app.registry!.url}/api/v1/packages/acme/code-fast/0.1.0`)).status).toBe(200);
      expect(readFileSync(metaPath, "utf8")).toBe(localMetaBefore);
      const localAfter = await app.core.command("environment.get", { repository: app.projectId! });
      expect(localAfter.requests["local/code-fast"]).toEqual(sourceBefore);
      expect(localAfter.requests["acme/code-fast"]).toBeUndefined();
      expect((await app.core.command("draft.list", {}))[0]?.package).toBe("local/code-fast");

      // The package remains publishable after its authoring
      // conversation is deleted; the local package row owns that act.
      await page.getByTestId("publish-close").click();
      await page.getByTestId("workspace-back").click();
      const draftRow = page.getByTestId("draft-row-code-fast");
      await draftRow.getByTestId("draft-delete-code-fast").click();
      await draftRow.getByRole("button", { name: locale === "zh-CN" ? "删除" : "Delete", exact: true }).click();
      await expect(draftRow).toHaveCount(0);
      expect(await app.core.command("draft.list", {})).toEqual([]);
      await projectTab(page, "Packages");
      const row = packageRow(packagesSection(page, "project"), "local/code-fast");
      await rowMenu(row);
      await row.getByTestId("env-publish-local/code-fast").click();
      await expect(page.getByTestId("publish-setup")).toBeVisible();
      await expect(page.getByRole("heading", { name: locale === "zh-CN" ? "发布规约包" : "Publish package", exact: true })).toBeVisible();
      await page.getByTestId("publish-setup-cancel").click();
      await expect(page.getByTestId("publish-setup")).toHaveCount(0);
      expect(readFileSync(metaPath, "utf8")).toBe(localMetaBefore);
    });
  });
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// When the core is out of reach (run-view-100): a wrong token, and
// the shell going away and coming back under an open page.

import { test, expect, open } from "../src/harness";

test.use({ appOptions: { project: true } });

test("run-view-100: a wrong token fails loudly, with retry", async ({ page, app }) => {
  await page.goto(`${app.origin}/?token=wrong-token`);
  const banner = page.getByRole("alert").or(page.getByText(/can.t reach the spex core/i));
  await expect(banner.first()).toBeVisible({ timeout: 15_000 });
  await expect(banner.first()).toContainText(new RegExp(app.origin.replace(/^http/, "ws")));
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByTestId("start-composer")).toBeDisabled();
});

test("run-view-100: the page says it is reconnecting and recovers", async ({
  page,
  app,
}) => {
  await open(page, app);
  const tree = page.getByRole("tree", { name: "Projects and sessions" });
  await expect(tree).toContainText("demo-project");

  await app.stop();
  await expect(page.getByText(/reconnecting to the spex core/i).first()).toBeVisible();
  await expect(page.getByTestId("start-composer")).toBeDisabled();

  await app.start();
  await expect(page.getByText(/reconnecting to the spex core/i)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("start-composer")).toBeEnabled();
  await expect(tree).toContainText("demo-project");
});

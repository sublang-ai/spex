// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface as a user works it (playbook-library-41):
// what is configured, enabling a built-in, reading a pipeline, and
// removing a playbook — each landing in the shared config.

import { test, expect, open, nav } from "../src/harness";

test.use({ appOptions: { project: true } });

test("playbook-library-41: list, enable a built-in, read a pipeline, remove", async ({
  page,
  app,
}) => {
  await open(page, app);
  await nav(page, "Playbooks").click();

  // The configured playbooks with their bindings.
  await expect(page.getByText("/code", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("/review", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("role-binding-review-reviewer")).toContainText("dev.reviewer");

  // A built-in absent from the config: adding it writes the config
  // and lists it; the home's slash menu then offers it.
  const builtins = page.getByTestId("builtins-section");
  await expect(builtins.getByTestId("builtin-decide")).toBeVisible();
  await builtins.getByTestId("builtin-add-decide").click();
  await expect.poll(() => app.readConfig()).toContain("decide:");
  await expect(page.getByText("/decide", { exact: true }).first()).toBeVisible();
  await expect(builtins.getByTestId("builtin-decide")).toHaveCount(0);

  // The pipeline view names its stages.
  await page.getByRole("button", { name: "Pipeline" }).first().click();
  const pipeline = page.getByTestId(/^pipeline-/).first();
  await expect(pipeline).toBeVisible();
  await expect(pipeline).toContainText("Source");

  // Removing asks once, then the config no longer names it.
  await page.getByRole("button", { name: "Remove /review from the config" }).click();
  await page.getByRole("button", { name: /^(yes|remove)$/i }).click();
  await expect.poll(() => app.readConfig()).not.toContain("review:");
  await expect(
    page.getByRole("button", { name: "Remove /review from the config" }),
  ).toHaveCount(0);
  // …and it is offered again among the built-ins.
  await expect(builtins.getByTestId("builtin-review")).toBeVisible();

  // The Captain home's slash menu follows the config.
  await page.getByRole("button", { name: "Workspace" }).click();
  const box = page.getByTestId("start-composer");
  await box.fill("/");
  const menu = page.getByRole("listbox");
  await expect(menu).toContainText("/decide");
  await expect(menu).not.toContainText("/review");
});

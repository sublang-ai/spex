// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface as a user works it (playbook-library-41):
// what is configured, enabling a built-in, working a card's stage
// row, and removing a playbook — each landing in the shared config.

import { test, expect, open, nav } from "../src/harness";

test.use({ appOptions: { project: true } });

test("playbook-library-41: list, enable a built-in, work the stage row, remove", async ({
  page,
  app,
}) => {
  await open(page, app);
  await nav(page, "Playbooks").click();

  // The configured playbooks with their bindings.
  await expect(page.getByText("/code", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("/review", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("role-binding-review-reviewer")).toContainText("dev.reviewer");

  // A built-in absent from the config: enabling it writes the config
  // and lists it; the home's slash menu then offers it.
  const builtins = page.getByTestId("builtins-section");
  await expect(builtins.getByTestId("builtin-decide")).toBeVisible();
  await expect(builtins.getByTestId("builtin-add-decide")).toHaveText("Enable");
  await builtins.getByTestId("builtin-add-decide").click();
  await expect.poll(() => app.readConfig()).toContain("decide:");
  await expect(page.getByText("/decide", { exact: true }).first()).toBeVisible();
  await expect(builtins.getByTestId("builtin-decide")).toHaveCount(0);

  // The stage row stands on the card: a press opens that stage, a
  // press beside it swaps, a second press closes.
  const row = page.getByTestId("stages-code");
  const stage = (name: string) => row.getByRole("button", { name });
  await expect(stage("Source")).toBeVisible();
  await expect(page.getByTestId("pipeline-code")).toHaveCount(0);

  await stage("Source").click();
  await expect(page.getByTestId("pipeline-code")).toBeVisible();
  await expect(stage("Source")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pipeline-code")).not.toContainText("loading…");

  await stage("State machine").click();
  await expect(stage("Source")).toHaveAttribute("aria-pressed", "false");
  await expect(stage("State machine")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("pipeline-code")).toContainText("states");

  await stage("State machine").click();
  await expect(page.getByTestId("pipeline-code")).toHaveCount(0);

  // Removing asks once — Remove or Keep — then the config no longer
  // names it.
  await page.getByRole("button", { name: "Remove /review from the config" }).click();
  await expect(page.getByRole("button", { name: "Keep", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
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

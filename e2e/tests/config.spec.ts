// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A broken config on disk while the app runs (run-view-103): the home
// names the error with the way to Settings, and recovers on repair.

import { writeFileSync } from "node:fs";
import { DEMO_CONFIG } from "@sublang/spex-core/testing";

import { test, expect, open } from "../src/harness";

test.use({ appOptions: { project: true } });

test("run-view-103: a broken config is named, and repair restores the home", async ({
  page,
  app,
}) => {
  await open(page, app);
  const home = page.getByTestId("captain-home");
  await expect(home).toContainText("demo-project");

  // Break the file: a captain block naming no adapter at all.
  writeFileSync(app.configPath, "captain:\n  model: claude-opus-5\nplayers: {}\nplaybooks: {}\n");
  await expect(home).toContainText(/invalid|error/i, { timeout: 15_000 });
  await expect(home.getByRole("button", { name: /settings/i })).toBeVisible();
  await expect(page.getByTestId("config-status")).toContainText(/invalid/i);

  // Repair it: the badge goes and the greeting returns.
  writeFileSync(app.configPath, DEMO_CONFIG);
  await expect(page.getByTestId("config-status")).toHaveCount(0, { timeout: 15_000 });
  await expect(home).not.toContainText(/invalid/i);
  await expect(home).toContainText(/tell me what to do/i);
});

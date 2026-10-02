// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { parse } from "yaml";
import { test, expect, open, nav } from "../src/harness";

test.use({ appOptions: { project: true, nativeBrowser: true } });
test("playbook-library-34: existing homes explicitly enable Inspect and a browser worker without reseeding", async ({ page, app }) => {
  const before = app.readConfig();
  expect(parse(before).playbooks.inspect).toBeUndefined();
  await open(page, app);
  await nav(page, "Playbooks").click();
  const inspect = page.getByTestId("builtin-inspect");
  await expect(inspect).toBeVisible();
  await inspect.getByRole("button", { name: "View source" }).click();
  await expect(inspect).toContainText(/inspect/i);
  expect(app.readConfig()).toBe(before);
  await inspect.getByRole("button", { name: "Configure inspector" }).click();
  const editor = inspect.getByTestId("agent-editor");
  await editor.getByTestId("agent-adapter-codex").click();
  await editor.getByRole("checkbox", { name: "Browser", exact: true }).check();
  await editor.getByTestId("agent-save").click();
  expect(app.readConfig()).toBe(before);
  await inspect.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(inspect).toHaveCount(0);
  const config = parse(app.readConfig());
  expect(config.playbooks.inspect).toEqual({ from: "@sublang/playbook/inspect/registry", roles: { inspector: "dev.inspector" } });
  expect(config.players["dev.inspector"]).toMatchObject({ adapter: "codex", browser: true });
  expect(config.playbooks.code).toEqual(parse(before).playbooks.code);
  expect(config.captain).toEqual(parse(before).captain);
  await expect(page.getByTestId("role-binding-inspect-inspector")).toContainText("dev.inspector");
  await page.getByTestId("stages-inspect").getByRole("button", { name: "State machine", exact: true }).click();
  await expect(page.getByTestId("pipeline-inspect")).toBeVisible();
});

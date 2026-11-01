// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { parse } from "yaml";
import { test, expect, open, playbookCard, projectTab } from "../src/harness";

test.use({ appOptions: { project: true, nativeBrowser: true } });
test("playbook-library-34: existing homes explicitly enable Inspect and a browser worker without reseeding", async ({ page, app }) => {
  const before = app.readConfig();
  expect(parse(before).playbooks.inspect).toBeUndefined();
  await open(page, app);
  await projectTab(page, "Playbooks");
  // Its one row, though both environments export it: your own group's
  // config, where the roster and each player's agent live, is written
  // through the overflow (playbook-library-1, playbook-library-34).
  await expect(page.getByTestId("playbook-card-inspect")).toHaveCount(1);
  const inspect = playbookCard(page.getByTestId("playbooks-available"), "inspect");
  await expect(inspect).toBeVisible();
  // Enabled nowhere, it wears no where-enabled chip (playbook-library-1).
  await expect(inspect.getByTestId("playbook-enabled-inspect")).toHaveCount(0);
  // Browsing its source changes no config.
  await inspect.getByTestId("stages-inspect").getByRole("button", { name: "Source", exact: true }).click();
  await expect(inspect.getByTestId("pipeline-inspect")).toContainText(/inspect/i);
  expect(app.readConfig()).toBe(before);
  // The proposed player's agent is set before anything is written.
  await expect(inspect.getByTestId("enable-player-inspect-inspector")).toHaveValue("dev.inspector");
  await inspect.getByRole("button", { name: "Configure dev.inspector" }).click();
  const editor = page.getByTestId("agent-editor");
  await editor.getByTestId("agent-adapter-codex").click();
  await editor.getByRole("checkbox", { name: "Browser", exact: true }).check();
  await editor.getByTestId("agent-save").click();
  expect(app.readConfig()).toBe(before);
  await inspect.getByTestId("playbook-personal-inspect").click();
  await inspect.getByTestId("playbook-enable-personal-inspect").click();
  await expect(page.getByTestId("playbooks-available").getByTestId("playbook-card-inspect")).toHaveCount(0);
  const config = parse(app.readConfig());
  expect(config.playbooks.inspect).toEqual({ roles: { inspector: "dev.inspector" } });
  expect(config.players["dev.inspector"]).toMatchObject({ adapter: "codex", browser: true });
  expect(config.playbooks.code).toEqual(parse(before).playbooks.code);
  expect(config.captain).toEqual(parse(before).captain);
  expect(app.readProjectConfig()).not.toContain("inspect:");
  const enabled = playbookCard(page.getByTestId("playbooks-enabled"), "inspect");
  await expect(enabled.getByTestId("role-binding-inspect-inspector")).toHaveText("Iinspector");
  await expect(enabled.getByTestId("role-binding-inspect-inspector")).toHaveAttribute("title", /^dev\.inspector · /);
  await enabled.getByTestId("stages-inspect").getByRole("button", { name: "State machine", exact: true }).click();
  await expect(enabled.getByTestId("pipeline-inspect")).toBeVisible();
});

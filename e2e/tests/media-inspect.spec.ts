// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { parse } from "yaml";
import { test, expect, nav, open, playbookCard, projectTab } from "../src/harness";

test.use({ appOptions: { project: true, nativeBrowser: true } });
test("playbook-library-34: an existing home's Inspect runs on its default player, set up as a browser worker without reseeding", async ({ page, app }) => {
  const before = app.readConfig();
  expect(parse(before).playbooks.inspect).toBeUndefined();
  expect(parse(before).players["dev.inspector"]).toBeUndefined();
  await open(page, app);
  await projectTab(page, "Playbooks");
  // Placed by the global environment and bound by no entry, it lists
  // once under Global with its role on the default `dev.inspector`
  // (playbook-library-1, playbook-library-34, core-service-2).
  await expect(page.getByTestId("playbook-card-inspect")).toHaveCount(1);
  const inspect = playbookCard(page.getByTestId("playbooks-global"), "inspect");
  await expect(inspect).toBeVisible();
  await expect(inspect.getByTestId("role-binding-inspect-inspector")).toHaveText("Iinspector");
  await expect(inspect.getByTestId("role-binding-inspect-inspector")).toHaveAttribute("title", /^dev\.inspector · /);
  // Browsing its source changes no config.
  await inspect.getByTestId("stages-inspect").getByRole("button", { name: "Source", exact: true }).click();
  await expect(inspect.getByTestId("pipeline-inspect")).toContainText(/inspect/i);
  expect(app.readConfig()).toBe(before);

  // Settings lists the player the default names and the roster lacks as
  // one to set up, playing on the Captain's agent meanwhile; Add creates
  // it from the Captain's block, then its own editor makes it a browser
  // worker (settings-46).
  await nav(page, "Settings").click();
  const row = page.getByTestId("player-row-dev.inspector");
  await expect(row).toHaveAttribute("data-to-set-up", "true");
  await expect(row.getByTestId("player-setup-dev.inspector")).toHaveText("Plays on the Captain's agent");
  await row.getByTestId("player-setup-add-dev.inspector").click();
  await expect.poll(() => parse(app.readConfig()).players["dev.inspector"]?.adapter).toBe(parse(before).captain.adapter);
  await expect(page.getByTestId("player-row-dev.inspector")).not.toHaveAttribute("data-to-set-up", "true");
  await page.getByTestId("player-edit-dev.inspector").click();
  const editor = page.getByTestId("player-row-dev.inspector").getByTestId("agent-editor");
  await editor.getByTestId("agent-adapter-codex").click();
  await editor.getByRole("checkbox", { name: "Browser", exact: true }).check();
  await editor.getByTestId("agent-save").click();
  await expect.poll(() => parse(app.readConfig()).players["dev.inspector"]).toMatchObject({ adapter: "codex", browser: true });
  const config = parse(app.readConfig());
  // No entry is written for it: the default binds its role.
  expect(config.playbooks.inspect).toBeUndefined();
  expect(config.playbooks.code).toEqual(parse(before).playbooks.code);
  expect(config.captain).toEqual(parse(before).captain);
  expect(app.readProjectConfig()).not.toContain("inspect:");

  await projectTab(page, "Playbooks");
  await expect(inspect.getByTestId("role-binding-inspect-inspector")).toHaveAttribute("title", /^dev\.inspector · /);
  await inspect.getByTestId("stages-inspect").getByRole("button", { name: "State machine", exact: true }).click();
  await expect(inspect.getByTestId("pipeline-inspect")).toBeVisible();
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Settings as a user edits them (settings-29): the Captain row's editor
// writing the shared config with its comment kept, a refused edit,
// readiness per adapter, and an outside edit reflected live.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "yaml";

import { test, expect, open, nav, clonePath } from "../src/harness";

test.use({ appOptions: { project: true } });

test("settings-36: runtime model choices narrow tuning and preserve custom drafts on refresh", async ({ page, app }) => {
  // The Captain starts on a model this runtime no longer lists.
  await app.core.command("config.edit", { op: { kind: "captain.set", patch: { model: "claude-opus-5" } } });
  await open(page, app);
  await nav(page, "Settings").click();
  const captain = page.getByTestId("captain-section");
  const before = app.readConfig();
  await captain.getByTestId("captain-edit").click();
  const modelTrigger = captain.getByTestId("agent-model-trigger");
  const modelList = captain.getByTestId("agent-model-listbox");
  const custom = captain.getByTestId("agent-model");
  const effort = captain.getByTestId("agent-effort");

  // An omitted current model stays editable; discovery never replaces it.
  await expect(modelTrigger).toHaveText("Custom model…");
  await expect(custom).toHaveValue("claude-opus-5");
  await expect(captain).toContainText("Not in this runtime's list");
  await expect(captain.getByTestId("agent-fast-mode")).toBeVisible();
  await expect.poll(() => effort.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(["", "minimal", "low", "medium", "high", "xhigh", "max", "ultracode"]);

  // Each row names the specific model the runtime reports, with its own
  // description; the provider default names the model it runs
  // (settings-38, settings-39).
  await modelTrigger.click();
  await expect(modelList).toBeVisible();
  const rows = modelList.getByRole("option");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAccessibleName("Provider default");
  await expect(rows.nth(0)).toHaveAccessibleDescription("Opus · claude-opus-5-5");
  await expect(rows.nth(1)).toHaveAccessibleName("Opus claude-opus-5-5");
  await expect(rows.nth(1)).toHaveAccessibleDescription("Opus 5.5 · Best for everyday, complex tasks");
  await expect(rows.nth(2)).toHaveAccessibleName("Claude Fable 5.1 claude-fable-5-1");
  await expect(rows.nth(3)).toHaveAccessibleName("Custom model…");
  await expect(rows.nth(3)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(modelList).toHaveCount(0);
  await expect(modelTrigger).toBeFocused();
  await expect(captain.getByTestId("agent-editor")).toBeVisible();

  // Exact discovered IDs are the list's choices, taken from the
  // keyboard, with this model's narrower effort list and known lack of
  // fast-mode support (settings-40).
  await page.keyboard.press("Enter");
  await expect(modelList).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(modelList).toHaveCount(0);
  await expect(modelTrigger).toBeFocused();
  await expect(modelTrigger).toHaveText("Claude Fable 5.1 claude-fable-5-1");
  await expect(custom).toHaveCount(0);
  await expect.poll(() => effort.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(["", "high", "max", "ultracode"]);
  await expect(captain.getByTestId("agent-fast-mode")).toHaveCount(0);
  expect(app.readConfig()).toBe(before);
  await effort.selectOption("high");
  await captain.getByTestId("agent-save").click();
  await expect(captain.getByTestId("agent-chip")).toContainText("claude-fable-5-1");
  await expect.poll(() => app.readConfig()).toContain("model: claude-fable-5-1");

  await captain.getByTestId("captain-edit").click();
  await expect(modelTrigger).toHaveText("Claude Fable 5.1 claude-fable-5-1");
  await modelTrigger.click();
  await modelList.getByRole("option", { name: "Custom model…" }).click();
  await custom.fill("manual-private-model");
  const refresh = captain.getByRole("button", { name: "Refresh models", exact: true });
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await expect(custom).toHaveValue("manual-private-model");
  await expect(captain).toContainText("Adapter option; model support unverified");
  await captain.getByTestId("agent-fast-mode").check();
  await captain.getByTestId("agent-save").click();
  await expect(captain.getByTestId("agent-chip")).toContainText("manual-private-model");
  const readCaptain = () => parse(app.readConfig()).captain;
  await expect.poll(readCaptain).toMatchObject({ adapter: "claude", model: "manual-private-model", effort: "high", fastMode: true });

  // Deliberately switching adapters clears saved tuning; discovery alone
  // above preserved it. All three resets reach the actual YAML writer.
  const beforeSwitch = app.readConfig();
  await captain.getByTestId("captain-edit").click();
  await expect(custom).toHaveValue("manual-private-model");
  await expect(effort).toHaveValue("high");
  await expect(captain.getByTestId("agent-fast-mode")).toBeChecked();
  await captain.getByTestId("agent-adapter-codex").click();
  await expect(modelTrigger).toHaveText("Provider default");
  await expect(effort).toHaveValue("");
  await expect(captain.getByTestId("agent-fast-mode")).not.toBeChecked();
  expect(app.readConfig()).toBe(beforeSwitch);
  await captain.getByTestId("agent-save").click();
  await expect(captain.getByTestId("agent-editor")).toBeHidden();
  await expect.poll(() => readCaptain().adapter).toBe("codex");
  const switched = readCaptain();
  for (const key of ["model", "effort", "fastMode"]) expect(Object.hasOwn(switched, key)).toBe(false);
});

test("settings-29: the Captain row's editor round-trips the shared config", async ({
  page,
  app,
}) => {
  await open(page, app);
  await nav(page, "Settings").click();

  // The captain block as configured: a collapsed row, its chip naming
  // the model, the editor opening on the pencil (settings-1).
  const captain = page.getByTestId("captain-section");
  await expect(captain).toBeVisible();
  const chip = captain.getByTestId("agent-chip");
  await expect(chip).toContainText("claude-opus-5-5");
  await expect(captain.getByTestId("agent-editor")).toHaveCount(0);
  await captain.getByTestId("captain-edit").click();
  // A canonical pin the runtime lists through an alias reads as itself.
  const trigger = captain.getByTestId("agent-model-trigger");
  await expect(trigger).toHaveText("claude-opus-5-5");
  await trigger.click();
  await captain.getByTestId("agent-model-listbox").getByRole("option", { name: "Custom model…" }).click();
  const model = captain.getByTestId("agent-model");
  await expect(model).toHaveValue("claude-opus-5-5");

  // Change the model; the editor closes, the row ticks Saved and
  // shows the new value, and the file keeps its comment and key order.
  await model.fill("claude-sonnet-5");
  await captain.getByTestId("agent-save").click();
  await expect(captain.getByTestId("captain-saved")).toHaveText("Saved ✓");
  await expect(captain.getByTestId("agent-editor")).toHaveCount(0);
  await expect(chip).toContainText("claude-sonnet-5");
  await expect.poll(() => app.readConfig()).toContain("claude-sonnet-5");
  const written = app.readConfig();
  expect(written.startsWith("# Spex demo config")).toBe(true);
  // The served page prints the shell's version, never "dev"
  // (settings-31, server-shell-4).
  await expect(page.getByText(/^Spex \d+\.\d+\.\d+/)).toBeVisible();
  await expect(page.getByText(/^Spex dev/)).toHaveCount(0);
  expect(written.indexOf("captain:")).toBeLessThan(written.indexOf("players:"));
  expect(written.indexOf("players:")).toBeLessThan(written.indexOf("playbooks:"));

  // The readiness panel: one entry per adapter the config names.
  const agents = page.getByTestId("agents-section");
  await expect(agents.getByTestId("agent-row-claude")).toBeVisible();
  await expect(agents.getByTestId("agent-row-codex")).toBeVisible();

  // The shortcut sheet names the palette binding with this platform's
  // modifier, and the terminal theme stands last under its CLI name.
  const sheet = page.getByTestId("shortcuts-section");
  await expect(sheet).toContainText("Switch or add a project");
  await expect(sheet.getByRole("row").nth(1)).toContainText(/⌘P|Ctrl\+P/);
  await expect(page.getByRole("heading", { level: 2 }).last()).toHaveText(
    "Terminal pane theme (CLI only)",
  );

  // A refused edit: a player id that already exists is turned back
  // with its message, and the file stays as it was.
  const before = app.readConfig();
  await page.getByTestId("player-add").click();
  await page.getByTestId("player-add-id").fill("dev.coder");
  await page.getByTestId("player-add-form").getByRole("button", { name: /add|save/i }).click();
  await expect(page.getByTestId("player-add-error")).toBeVisible();
  expect(app.readConfig()).toBe(before);

  // An outside edit lands on the surface without a reload.
  writeFileSync(app.configPath, before.replace("claude-sonnet-5", "claude-opus-5-5"));
  await expect(chip).toContainText("claude-opus-5-5");
});

test.describe("a player the project names", () => {
  test.use({ appOptions: { project: true, homeConfig: true } });

  test("settings-46: a player the project names and your own roster lacks is added here from the neutral block", async ({
    page,
    app,
  }) => {
    const projectConfig = join(clonePath(app.dataDir, app.projectId!), "config", "playbook.config.yaml");
    await open(page, app);
    await nav(page, "Settings").click();
    await expect(page.getByTestId("players-section")).toBeVisible();

    // The project's config binds review's reviewer to a player your
    // own group's roster lacks, by name alone (core-service-2), as a
    // teammate's file arrives while the core runs: it reloads on the
    // change, with no restart.
    mkdirSync(dirname(projectConfig), { recursive: true });
    writeFileSync(projectConfig, "playbooks:\n  review:\n    roles:\n      coder: dev.coder\n      reviewer: dev.auditor\n");

    // The surface names the file it writes — your own group's — by its
    // spex repository, and points a project's bindings to Playbooks.
    const scope = page.getByTestId("settings-scope");
    await expect(scope).toHaveText(`Your own group's config, in ${app.ownKey}`);
    await expect(scope).toHaveAttribute("title", "A project's playbooks and role bindings are edited in Playbooks");

    // The roster shows the missing player, named by its project, with
    // Add (settings-46).
    const missing = page.getByTestId("player-missing-dev.auditor");
    await expect(missing).toBeVisible();
    await expect(missing.getByTestId("player-missing-note-dev.auditor")).toHaveText("Named by demo-project, not set up here");
    await expect(missing.getByTestId("player-missing-note-dev.auditor")).toHaveAttribute("title", "Answers review.reviewer");
    expect(parse(app.readConfig()).players["dev.auditor"]).toBeUndefined();
    await missing.getByTestId("player-missing-add-dev.auditor").click();
    await expect.poll(() => parse(app.readConfig()).players["dev.auditor"]).toMatchObject({ adapter: "claude" });
    await expect(missing).toHaveCount(0);
    await expect(page.getByTestId("players-section").getByTestId("player-row-dev.auditor")).toBeVisible();
  });
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface as a user works it (playbook-library-41):
// what is configured, enabling a built-in, working a card's stage
// row, and removing a playbook — each landing in the shared config.

import { test, expect, open, nav } from "../src/harness";
import { parse } from "yaml";

test.use({ appOptions: { project: true } });

test.describe("runtime binding options", () => {
  test.use({ appOptions: {
    project: true,
    discoverAgentModels: async () => ({
      status: "available", unreportedEffortValues: ["ultracode"], models: [
        { id: "claude-fable-5-1", name: "Claude Fable 5.1", effortValues: ["low", "high"], fastModeSupported: false },
        { id: "opus", name: "Claude Opus 5.5", resolvedModel: "claude-opus-5-5", effortValues: ["low", "high", "max"], fastModeSupported: true },
      ],
    }),
  } });

  test("playbook-library-39: discovered binding tuning saves explicit Off and restores inheritance", async ({ page, app }) => {
    await app.core.command("config.edit", { op: { kind: "player.set", playerId: "dev.coder", patch: { fastMode: true } } });
    const readRole = () => parse(app.readConfig()).playbooks.code.roles.coder;
    await open(page, app);
    await nav(page, "Playbooks").click();
    const edit = page.getByTestId("role-bind-code-coder");
    const editor = page.getByTestId("binding-editor-coder");
    await edit.click();
    // The player's model, known only through an alias's resolution,
    // is inherited by name as it reads (playbook-library-4).
    await expect(editor.getByTestId("binding-model-mode").locator("option").first()).toHaveText("inherit the player (claude-opus-5-5)");
    await editor.getByTestId("binding-model-mode").selectOption("pin");
    const model = editor.getByTestId("binding-model-value-trigger");
    const list = editor.getByTestId("binding-model-value-listbox");
    /** Open the model list and choose the row holding `value`. */
    const choose = async (value: string) => {
      await model.click();
      await list.locator(`[role="option"][data-value="${value}"]`).click();
      await expect(list).toHaveCount(0);
    };
    // A canonical pin reads as itself, never rewritten to its alias.
    await expect(model).toHaveText("claude-opus-5-5");
    await expect(editor).not.toContainText("Not in this runtime's list");
    await expect(editor).not.toContainText("model support unverified");
    const configBefore = app.readConfig();
    await choose("__spex_custom__");
    const custom = editor.getByTestId("binding-model-value");
    await custom.fill("");
    await expect(editor.getByTestId("binding-model-mode")).toHaveValue("pin");
    await expect(editor.getByRole("alert")).toContainText("Enter a model ID");
    await expect(editor.getByTestId("binding-save")).toBeDisabled();
    expect(app.readConfig()).toBe(configBefore);
    await custom.fill("claude-opus-5-5");
    await expect(editor).not.toContainText("Not in this runtime's list");
    await expect(editor).not.toContainText("model support unverified");
    await editor.getByTestId("binding-save").click();
    await expect(editor).toBeHidden();
    await expect.poll(readRole).toEqual({ player: "dev.coder", model: "claude-opus-5-5" });

    await edit.click();
    await expect(model).toHaveText("claude-opus-5-5");
    await choose("claude-fable-5-1");
    await expect(model).toHaveText("Claude Fable 5.1 claude-fable-5-1");
    await editor.getByTestId("binding-effort-mode").selectOption("pin");
    const effort = editor.getByTestId("binding-effort-value");
    await expect.poll(() => effort.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(["", "low", "high", "ultracode"]);
    await effort.selectOption("high");
    await expect(editor.getByTestId("binding-save")).toBeDisabled();
    await editor.getByTestId("binding-fast-mode").selectOption("off");
    // The role's own subagent model and subagent effort (DR-093,
    // DR-095): the player sets neither, so inheriting them reads as
    // "Same as agent" and "Agent chooses", and the pinned effort is one
    // of the adapter's without its orchestration value.
    await expect(editor.getByTestId("binding-subagent-model-mode").locator("option").first()).toHaveText("inherit the player (Same as agent)");
    await editor.getByTestId("binding-subagent-model-mode").selectOption("pin");
    await editor.getByTestId("binding-subagent-model-value").fill("claude-haiku-5");
    await expect(editor.getByTestId("binding-subagent-effort-mode").locator("option").first()).toHaveText("inherit the player (Agent chooses)");
    await editor.getByTestId("binding-subagent-effort-mode").selectOption("pin");
    const subagentEffort = editor.getByTestId("binding-subagent-effort-value");
    await expect.poll(() => subagentEffort.locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value)))
      .toEqual(["", "minimal", "low", "medium", "high", "xhigh", "max"]);
    await subagentEffort.selectOption("low");
    await editor.getByTestId("binding-save").click();
    await expect(editor).toBeHidden();
    await expect.poll(readRole).toEqual({ player: "dev.coder", model: "claude-fable-5-1", subagentModel: "claude-haiku-5", subagentEffort: "low", effort: "high", fastMode: false });

    await edit.click();
    await expect(editor.getByTestId("binding-fast-mode")).toHaveValue("off");
    await choose("opus");
    await expect(model).toHaveText("Claude Opus 5.5 claude-opus-5-5");
    await expect(editor.getByTestId("binding-save")).toBeEnabled();
    await effort.selectOption("ultracode");
    await editor.getByTestId("binding-save").click();
    await expect(editor).toBeHidden();
    await expect.poll(readRole).toEqual({ player: "dev.coder", model: "opus", subagentModel: "claude-haiku-5", subagentEffort: "low", effort: "ultracode", fastMode: false });

    await edit.click();
    await expect(editor.getByTestId("binding-fast-mode")).toHaveValue("off");
    await editor.getByTestId("binding-fast-mode").selectOption("inherit");
    await expect(editor.getByTestId("binding-subagent-model-mode")).toHaveValue("pin");
    await editor.getByTestId("binding-subagent-model-mode").selectOption("inherit");
    await expect(editor.getByTestId("binding-subagent-effort-mode")).toHaveValue("pin");
    await editor.getByTestId("binding-subagent-effort-mode").selectOption("inherit");
    await editor.getByTestId("binding-save").click();
    await expect(editor).toBeHidden();
    await expect.poll(readRole).toEqual({ player: "dev.coder", model: "opus", effort: "ultracode" });
    expect(parse(app.readConfig()).players["dev.coder"].fastMode).toBe(true);
  });
});

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

  // The derived state list is the stage's pinned header: it stands
  // outside the frame, so scrolling the module to its end leaves the
  // states where they were.
  const states = page.getByTestId("stage-states-code");
  await expect(states).toContainText("states");
  const stateBox = await states.boundingBox();
  await page.getByTestId("stage-box-code").evaluate((box) => {
    box.scrollTop = box.scrollHeight;
  });
  await expect(states).toBeVisible();
  expect((await states.boundingBox())!.y).toBeCloseTo(stateBox!.y, 0);
  expect(
    await page
      .getByTestId("stage-box-code")
      .evaluate((box) => box.scrollTop > 0),
  ).toBe(true);

  await stage("State machine").click();
  await expect(page.getByTestId("pipeline-code")).toHaveCount(0);

  // The Gears stage is the outline's rows over the artifact's own
  // items: collapsed on their IDs, one expanding to its body.
  await stage("Gears").click();
  const firstRow = page.getByTestId("pipeline-code").getByRole("listitem").first();
  await expect(firstRow).toBeVisible();
  const firstToggle = page
    .getByTestId("pipeline-code")
    .locator("[data-testid^='item-toggle-']")
    .first();
  await expect(firstToggle).toHaveAttribute("aria-expanded", "false");
  await firstToggle.click();
  await expect(firstToggle).toHaveAttribute("aria-expanded", "true");
  await stage("Gears").click();
  await expect(page.getByTestId("pipeline-code")).toHaveCount(0);

  // The open stage's artifact sits in a frame the reader sets: the
  // grip names the stage it caps, drags the box taller, and the height
  // stands after a reload (DR-030).
  await stage("Source").click();
  const stageBox = page.getByTestId("stage-box-code");
  const grip = page.getByTestId("stage-box-code-grip");
  const heightOf = (el: HTMLElement) => el.getBoundingClientRect().height;
  await expect(grip).toHaveAttribute("aria-label", "Resize the Source stage");
  await expect(grip).toHaveAttribute("aria-valuenow", "24");
  const capped = await stageBox.evaluate(heightOf);
  await grip.hover();
  const handle = (await grip.boundingBox())!;
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.down();
  await page.mouse.move(x, y + 64, { steps: 8 });
  await page.mouse.up();
  await expect(grip).toHaveAttribute("aria-valuenow", "28");
  expect(await stageBox.evaluate(heightOf)).toBeCloseTo(capped + 64, 0);

  await page.reload();
  await nav(page, "Playbooks").click();
  await stage("Source").click();
  await expect(page.getByTestId("stage-box-code-grip")).toHaveAttribute(
    "aria-valuenow",
    "28",
  );
  await stage("Source").click();
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
  await nav(page, "Projects").click();
  const box = page.getByTestId("start-composer");
  await box.fill("/");
  const menu = page.getByRole("listbox");
  await expect(menu).toContainText("/decide");
  await expect(menu).not.toContainText("/review");
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface as a user works it (playbook-library-41,
// DR-104): a view over the environments of the current project and
// your own group — what each lists and where each playbook is enabled,
// enabling a built-in in the project, a card's stage row, disabling
// with no confirm and removing a spec package behind one — each landing
// in the spex repository's config it names; and a role's tuning saved
// in your own group's config (playbook-library-39).

import type { Page } from "@playwright/test";
import { parse } from "yaml";

import { test, expect, open, nav } from "../src/harness";

test.use({ appOptions: { project: true } });

/** The built-in spec package every environment requests (environments-11). */
const BUILTINS = "sublang/playbooks";

/** Show one side of the Playbooks surface (playbook-library-1). */
async function showSide(page: Page, side: "project" | "own"): Promise<void> {
  const control = page.getByTestId(`side-${side}`);
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`side-${side === "own" ? "project" : "own"}`)).toHaveAttribute("aria-pressed", "false");
}

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
    // Your own group's entry carries each role's tuning (playbook-library-3).
    await showSide(page, "own");
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

test("playbook-library-41: both sides listed, a built-in enabled in the project, the stage row, disable and remove", async ({
  page,
  app,
}) => {
  test.setTimeout(90_000);
  await open(page, app);
  await nav(page, "Playbooks").click();

  // The switch stands between the project's side and your own group's
  // (playbook-library-1): the project's first, its environment named
  // by its spex repository.
  const sides = page.getByRole("group", { name: "Spex repository shown" });
  await expect(sides.getByTestId("side-project")).toHaveText("demo-project");
  await expect(sides.getByTestId("side-own")).toHaveText("Your own group");
  await expect(sides.getByTestId("side-project")).toHaveAttribute("aria-pressed", "true");
  const environment = page.getByTestId("environment-section");
  await expect(environment).toContainText(app.projectId!);
  await expect(environment.getByTestId(`env-package-${BUILTINS}`)).toBeVisible();

  // Your own group's side: every enabled playbook with its command,
  // intent, spec package and role bindings (playbook-library-1,
  // playbook-library-29).
  await showSide(page, "own");
  await expect(environment).toContainText(app.ownKey);
  const enabled = page.getByTestId("playbooks-enabled");
  const code = enabled.getByTestId("playbook-card-code");
  const review = enabled.getByTestId("playbook-card-review");
  await expect(code).toContainText("/code");
  await expect(code).toContainText("implement a coding intent in reviewed, one-commit phases");
  await expect(code.getByTestId("playbook-enabled-code")).toHaveText("Enabled in your own group");
  await expect(code.getByTestId("playbook-from-code")).toHaveText(/^from\s*sublang\/playbooks \d+\.\d+\.\d+$/);
  await expect(code.getByTestId("role-binding-code-coder")).toHaveText("dev.coder");
  await expect(review).toContainText("/review");
  await expect(review.getByTestId("role-binding-review-coder")).toHaveText("dev.coder");
  await expect(review.getByTestId("role-binding-review-reviewer")).toHaveText("dev.reviewer");

  // The project's side lists the same playbooks from its own
  // environment, none enabled there: the built-ins enabled in neither
  // config stand beside them (playbook-library-1, playbook-library-34).
  await showSide(page, "project");
  await expect(page.getByTestId("playbooks-empty")).toBeVisible();
  const available = page.getByTestId("playbooks-available");
  await expect(available.getByTestId("playbook-enabled-code")).toHaveText("Enabled in your own group");
  const decide = available.getByTestId("playbook-card-decide");
  await expect(decide.getByTestId("playbook-enabled-decide")).toHaveText("Not enabled");
  await expect(decide.getByTestId("playbook-enable-decide")).toHaveText("Enable");
  // Enabling it writes the project's config and lists it among the
  // enabled there.
  expect(app.readProjectConfig()).not.toContain("decide:");
  await decide.getByTestId("playbook-enable-decide").click();
  await expect.poll(() => app.readProjectConfig()).toContain("decide:");
  expect(app.readConfig()).not.toMatch(/^\s{2}decide:/m);
  await expect(enabled.getByTestId("playbook-card-decide")).toBeVisible();
  await expect(enabled.getByTestId("playbook-enabled-decide")).toHaveText("Enabled in the project");
  await expect(available.getByTestId("playbook-card-decide")).toHaveCount(0);

  // The stage row stands on the card: a press opens that stage, a
  // press beside it swaps, a second press closes (playbook-library-22).
  await showSide(page, "own");
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
  expect(await page.getByTestId("stage-box-code").evaluate((box) => box.scrollTop > 0)).toBe(true);

  await stage("State machine").click();
  await expect(page.getByTestId("pipeline-code")).toHaveCount(0);

  // The Gears stage is the outline's rows over the artifact's own
  // items: collapsed on their IDs, one expanding to its body.
  await stage("Gears").click();
  const firstRow = page.getByTestId("pipeline-code").getByRole("listitem").first();
  await expect(firstRow).toBeVisible();
  const firstToggle = page.getByTestId("pipeline-code").locator("[data-testid^='item-toggle-']").first();
  await expect(firstToggle).toHaveAccessibleName(/^CODE-\d+: /);
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
  await showSide(page, "own");
  await page.getByTestId("stages-code").getByRole("button", { name: "Source" }).click();
  await expect(page.getByTestId("stage-box-code-grip")).toHaveAttribute("aria-valuenow", "28");
  await page.getByTestId("stages-code").getByRole("button", { name: "Source" }).click();
  await expect(page.getByTestId("pipeline-code")).toHaveCount(0);

  // Disabling asks for no confirm: your own group's config no longer
  // names it, and it lists among those not enabled (playbook-library-26,
  // playbook-library-3).
  await page.getByRole("button", { name: "Disable /review" }).click();
  await expect.poll(() => app.readConfig()).not.toMatch(/^\s{2}review:/m);
  await expect(page.getByRole("button", { name: "Disable /review" })).toHaveCount(0);
  await expect(page.getByTestId("playbooks-available").getByTestId("playbook-card-review")).toBeVisible();

  // Removing a spec package asks Remove or Keep; Keep leaves it
  // requested (playbook-library-26, playbook-library-92).
  const requested = page.getByTestId("environment-section").getByTestId(`env-package-${BUILTINS}`);
  await requested.getByRole("button", { name: `Remove ${BUILTINS}` }).click();
  await expect(requested).toContainText(`Remove ${BUILTINS}?`);
  await expect(requested.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await requested.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(requested.getByRole("button", { name: `Remove ${BUILTINS}` })).toBeVisible();
  await expect(requested.getByTestId(`env-installed-${BUILTINS}`)).toHaveText("Installed");

  // The Captain home's slash menu follows your own group's config.
  await nav(page, "Projects").click();
  const box = page.getByTestId("start-composer");
  await box.fill("/");
  const menu = page.getByRole("listbox");
  await expect(menu).toContainText("/code");
  await expect(menu).not.toContainText("/review");
});

test("playbook-library-41: the Captain home's slash menu offers a built-in enabled in the project", async ({
  page,
  app,
}) => {
  // The home's slash menu lists the project's composed catalog — your
  // own group's config with the project's on top (playbook-library-41,
  // -34, core-service-2).
  await open(page, app);
  await nav(page, "Playbooks").click();
  await showSide(page, "project");
  await page.getByTestId("playbook-enable-decide").click();
  await expect.poll(() => app.readProjectConfig()).toContain("decide:");
  await nav(page, "Projects").click();
  await page.getByTestId("start-composer").fill("/");
  await expect(page.getByRole("listbox")).toContainText("/decide", { timeout: 5_000 });
});

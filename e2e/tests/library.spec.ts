// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Playbooks and Packages tabs as a user works them
// (playbook-library-41, DR-104, DR-172): the Playbooks tab lists the
// playbooks of the project's environment and your own group's together
// — where each is enabled, enabling a built-in in the project, a card's
// stage row, disabling with no confirm — and the Packages tab holds
// both environments' packages, removing one behind a confirm; each
// change lands in the spex repository's config it names; and a role's
// tuning saved in your own group's config (playbook-library-39).

import { parse } from "yaml";

import {
  test,
  expect,
  open,
  newTaskTab,
  packagesSection,
  playbookCard,
  projectTab,
} from "../src/harness";

test.use({ appOptions: { project: true } });

/** The built-in spec package every environment requests (environments-11). */
const BUILTINS = "sublang/playbooks";

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
    await projectTab(page, "Playbooks");
    // Your own group's entry carries each role's tuning
    // (playbook-library-3): its row of /code, listed beside the
    // project's (playbook-library-1).
    const edit = playbookCard(page, "code", "personal").getByTestId("role-bind-code-coder");
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

test("playbook-library-41: both environments listed together, a built-in enabled in the project, the stage row, disable and remove", async ({
  page,
  app,
}) => {
  test.setTimeout(90_000);
  await open(page, app);
  await projectTab(page, "Playbooks");

  // The tab stands with no switch between the project and your own
  // group, and holds no package list, add control or registry account,
  // which stand on the project's Packages tab (playbook-library-1).
  await expect(page.getByTestId("playbooks-switch")).toHaveCount(0);
  await expect(page.getByTestId("environment-section")).toHaveCount(0);
  await expect(page.getByTestId("add-packages")).toHaveCount(0);
  await expect(page.getByTestId("registry-account")).toHaveCount(0);
  await projectTab(page, "Packages");

  // The Packages tab: the project's environment, named by the project
  // and never by its spex repository (DR-159), with the ways to add a
  // spec package, and your own group's beneath it (playbook-library-92).
  const precedes = (first: string, second: string) =>
    page.evaluate(
      ([a, b]) => {
        const one = document.querySelector(`[data-testid="${a}"]`);
        const two = document.querySelector(`[data-testid^="${b}"]`);
        return Boolean(one && two && one.compareDocumentPosition(two) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
      [first, second] as const,
    );
  const environment = packagesSection(page, "project").getByTestId("environment-section");
  await expect(environment.getByRole("heading")).toHaveText("Environment of demo-project");
  await expect(environment).not.toContainText(app.projectId!);
  await expect(environment).not.toContainText("-spex");
  await expect(environment.getByTestId(`env-package-${BUILTINS}`)).toBeVisible();
  await expect(packagesSection(page, "project").getByTestId("add-from-registry")).toBeVisible();
  const ownEnvironment = packagesSection(page, "personal").getByTestId("environment-section");
  await expect(ownEnvironment.getByRole("heading")).toHaveText("Environment of your own group");
  await expect(ownEnvironment).not.toContainText(app.ownKey);
  await expect(ownEnvironment.getByTestId(`env-package-${BUILTINS}`)).toBeVisible();
  expect(await precedes("packages-project", "packages-personal")).toBe(true);

  // Your own group's rows: every enabled playbook with its command,
  // intent, spec package and role bindings (playbook-library-1,
  // playbook-library-29).
  await projectTab(page, "Playbooks");
  const enabled = page.getByTestId("playbooks-enabled");
  const code = playbookCard(enabled, "code", "personal");
  const review = playbookCard(enabled, "review", "personal");
  await expect(code).toContainText("/code");
  await expect(code).toContainText("implement a coding intent in reviewed, one-commit phases");
  await expect(code.getByTestId("playbook-enabled-code")).toHaveText("Enabled in your own group");
  await expect(code.getByTestId("playbook-from-code")).toHaveText(/^from\s*sublang\/playbooks \d+\.\d+\.\d+$/);
  await expect(code.getByTestId("role-binding-code-coder")).toHaveText("Ccoder");
  await expect(code.getByTestId("role-binding-code-coder")).toHaveAttribute("title", /^dev\.coder · /);
  await expect(review).toContainText("/review");
  await expect(review.getByTestId("role-binding-review-coder")).toHaveText("Ccoder");
  await expect(review.getByTestId("role-binding-review-coder")).toHaveAttribute("title", /^dev\.coder · /);
  await expect(review.getByTestId("role-binding-review-reviewer")).toHaveText("Rreviewer");
  await expect(review.getByTestId("role-binding-review-reviewer")).toHaveAttribute("title", /^dev\.reviewer · /);

  // The project's rows list the same playbooks from its own
  // environment, none enabled in its config: those your own group
  // enables stand under Enabled naming it, so the list never reads as
  // empty, and the built-ins enabled in neither config below them
  // (playbook-library-1, playbook-library-34).
  await expect(playbookCard(enabled, "code", "project").getByTestId("playbook-enabled-code")).toHaveText("Enabled in your own group");
  await expect(page.getByTestId("playbooks-empty")).toHaveCount(0);
  const available = page.getByTestId("playbooks-available");
  await expect(available.getByTestId("playbook-card-code")).toHaveCount(0);
  const decide = playbookCard(available, "decide", "project");
  await expect(decide.getByTestId("playbook-enabled-decide")).toHaveText("Not enabled");
  await expect(decide.getByTestId("playbook-enable-decide")).toHaveText("Enable");
  // Enabling it writes the project's config and lists it among the
  // enabled there.
  expect(app.readProjectConfig()).not.toContain("decide:");
  await decide.getByTestId("playbook-enable-decide").click();
  await expect.poll(() => app.readProjectConfig()).toContain("decide:");
  expect(app.readConfig()).not.toMatch(/^\s{2}decide:/m);
  const enabledDecide = playbookCard(enabled, "decide", "project");
  await expect(enabledDecide).toBeVisible();
  await expect(enabledDecide.getByTestId("playbook-enabled-decide")).toHaveText("Enabled in the project");
  await expect(available.getByTestId("playbook-card-decide")).toHaveCount(0);

  // The stage row stands on the card — here your own group's row of
  // /code: a press opens that stage, a press beside it swaps, a second
  // press closes (playbook-library-22).
  const row = code.getByTestId("stages-code");
  const stage = (name: string) => row.getByRole("button", { name });
  const pipeline = code.getByTestId("pipeline-code");
  await expect(stage("Source")).toBeVisible();
  await expect(pipeline).toHaveCount(0);

  await stage("Source").click();
  await expect(pipeline).toBeVisible();
  await expect(stage("Source")).toHaveAttribute("aria-pressed", "true");
  await expect(pipeline).not.toContainText("loading…");

  await stage("State machine").click();
  await expect(stage("Source")).toHaveAttribute("aria-pressed", "false");
  await expect(stage("State machine")).toHaveAttribute("aria-pressed", "true");

  // The derived state list is the stage's pinned header: it stands
  // outside the frame, so scrolling the module to its end leaves the
  // states where they were.
  const states = code.getByTestId("stage-states-code");
  await expect(states).toContainText("states");
  const stateBox = await states.boundingBox();
  await code.getByTestId("stage-box-code").evaluate((box) => {
    box.scrollTop = box.scrollHeight;
  });
  await expect(states).toBeVisible();
  expect((await states.boundingBox())!.y).toBeCloseTo(stateBox!.y, 0);
  expect(await code.getByTestId("stage-box-code").evaluate((box) => box.scrollTop > 0)).toBe(true);

  await stage("State machine").click();
  await expect(pipeline).toHaveCount(0);

  // The Gears stage is the outline's rows over the artifact's own
  // items: collapsed on their IDs, one expanding to its body.
  await stage("Gears").click();
  const firstRow = pipeline.getByRole("listitem").first();
  await expect(firstRow).toBeVisible();
  const firstToggle = pipeline.locator("[data-testid^='item-toggle-']").first();
  await expect(firstToggle).toHaveAccessibleName(/^CODE-\d+: /);
  await expect(firstToggle).toHaveAttribute("aria-expanded", "false");
  await firstToggle.click();
  await expect(firstToggle).toHaveAttribute("aria-expanded", "true");
  await stage("Gears").click();
  await expect(pipeline).toHaveCount(0);

  // The open stage's artifact sits in a frame the reader sets: the
  // grip names the stage it caps, drags the box taller, and the height
  // stands after a reload (DR-030).
  await stage("Source").click();
  const stageBox = code.getByTestId("stage-box-code");
  const grip = code.getByTestId("stage-box-code-grip");
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
  await projectTab(page, "Playbooks");
  await stage("Source").click();
  await expect(grip).toHaveAttribute("aria-valuenow", "28");
  await stage("Source").click();
  await expect(pipeline).toHaveCount(0);

  // Disabling asks for no confirm: your own group's config no longer
  // names it, and it lists among those not enabled (playbook-library-26,
  // playbook-library-3).
  await page.getByRole("button", { name: "Disable /review" }).click();
  await expect.poll(() => app.readConfig()).not.toMatch(/^\s{2}review:/m);
  await expect(page.getByRole("button", { name: "Disable /review" })).toHaveCount(0);
  await expect(playbookCard(available, "review", "personal")).toBeVisible();

  // Removing a spec package from your own group's, on the Packages
  // tab, asks Remove or Keep; Keep leaves it requested
  // (playbook-library-26, playbook-library-92).
  await projectTab(page, "Packages");
  const requested = packagesSection(page, "personal").getByTestId(`env-package-${BUILTINS}`);
  await requested.getByRole("button", { name: `Remove ${BUILTINS}` }).click();
  await expect(requested).toContainText(`Remove ${BUILTINS}?`);
  await expect(requested.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
  await requested.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(requested.getByRole("button", { name: `Remove ${BUILTINS}` })).toBeVisible();
  await expect(requested.getByTestId(`env-installed-${BUILTINS}`)).toHaveText("Installed");

  // The Captain home's slash menu follows your own group's config.
  await newTaskTab(page);
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
  await projectTab(page, "Playbooks");
  await playbookCard(page, "decide", "project").getByTestId("playbook-enable-decide").click();
  await expect.poll(() => app.readProjectConfig()).toContain("decide:");
  await newTaskTab(page);
  await page.getByTestId("start-composer").fill("/");
  await expect(page.getByRole("listbox")).toContainText("/decide", { timeout: 5_000 });
});

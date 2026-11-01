// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Playbooks and Packages tabs as a user works them
// (playbook-library-41, DR-104, DR-172): the Playbooks tab lists the
// playbooks of the project's packages and your Personal ones together
// under Enabled and Available, each once — naming where it is enabled,
// "in <project>" or "Personal", a built-in reading "built in" — enables
// a built-in in the project, opens a card's stage row and disables
// through a row's overflow with no confirm, and its "Manage packages"
// opens the Packages tab, whose
// "Packages" and "Personal" headings each carry one "Add…" and the
// built-in line, a row's Remove carrying its consequence as its tooltip;
// each change lands in the config it names; and a role's tuning saved
// in your Personal config (playbook-library-39).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { makeRelease } from "@sublang/spex-core/testing";

import {
  test,
  expect,
  open,
  builtinLine,
  newTaskTab,
  packageRow,
  packagesSection,
  playbookCard,
  projectTab,
  projectTabControl,
  rowAct,
} from "../src/harness";

test.use({ appOptions: { project: true } });

/** The built-in spec package every environment requests (environments-11). */
const BUILTINS = "sublang/playbooks";

/** The project as its tabs name it (playbook-library-1). */
const PROJECT = "demo-project";

/** A package of the project's own, added by folder, whose row's
 * overflow holds Remove (playbook-library-92). */
const NOTES = "acme/notes-kit";
const NOTES_PATH = "spex-packages/acme/notes-kit";

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
    // (playbook-library-3): /code, enabled there alone, shows its
    // bindings on its one row (playbook-library-1).
    const edit = playbookCard(page, "code").getByTestId("role-bind-code-coder");
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

test("playbook-library-41: both tabs' words, a built-in enabled in the project, the stage row, disable, and Remove's consequence", async ({
  page,
  app,
}) => {
  test.setTimeout(90_000);
  // A package by folder in the project's spex.yaml (arranged over the
  // protocol), so the project's heading holds a row of its own.
  await makeRelease(join(app.projectDir, NOTES_PATH), {
    format: 2, org: "acme", name: "notes-kit", version: "0.1.0", description: "A note reader", license: "Apache-2.0",
    artifacts: { "notes-reader": { kind: "skill", language: "en" } },
  }, { "skills/en/notes-reader/SKILL.md": "---\nname: notes-reader\ndescription: Read a note\n---\nRead the note without changes.\n" });
  await app.core.command("environment.request", { repository: app.projectId!, name: NOTES, request: { kind: "path", path: NOTES_PATH } });
  await open(page, app);
  const playbooks = await projectTab(page, "Playbooks");

  // The tab stands with no switch between the project and Personal,
  // and holds no package list, add control or registry account — only
  // "Manage packages", opening the project's Packages tab
  // (playbook-library-1).
  await expect(page.getByTestId("playbooks-switch")).toHaveCount(0);
  await expect(playbooks.getByTestId(/^env-package-/)).toHaveCount(0);
  await expect(playbooks.getByRole("button", { name: "Add…", exact: true })).toHaveCount(0);
  await expect(playbooks.getByTestId("add-packages")).toHaveCount(0);
  await expect(playbooks.getByTestId("registry-chooser")).toHaveCount(0);
  await expect(playbooks.getByTestId("registry-account")).toHaveCount(0);
  await playbooks.getByText("Manage packages", { exact: true }).click();
  await expect(projectTabControl(page, "Packages")).toHaveAttribute("aria-selected", "true");

  // The Packages tab: the project's packages under "Packages", yours
  // beneath them under "Personal", whose tooltip says what it holds;
  // each heading carries one "Add…" and the built-in playbooks as one
  // quiet line, and neither names a spex repository (playbook-library-92,
  // DR-159).
  const precedes = (first: string, second: string) =>
    page.evaluate(
      ([a, b]) => {
        const one = document.querySelector(`[data-testid="${a}"]`);
        const two = document.querySelector(`[data-testid^="${b}"]`);
        return Boolean(one && two && one.compareDocumentPosition(two) & Node.DOCUMENT_POSITION_FOLLOWING);
      },
      [first, second] as const,
    );
  const packages = packagesSection(page, "project");
  const personal = packagesSection(page, "personal");
  await expect(packages.getByRole("heading", { name: "Packages", exact: true })).toBeVisible();
  await expect(personal.getByRole("heading", { name: "Personal", exact: true })).toHaveAttribute(
    "title",
    "Packages added for yourself, available in every project",
  );
  for (const section of [packages, personal]) {
    await expect(section.getByRole("button", { name: "Add…", exact: true })).toHaveCount(1);
    // The built-in spec package stands as the one quiet line, never a
    // removable row.
    await expect(builtinLine(section)).toBeVisible();
    await expect(packageRow(section, BUILTINS)).toHaveCount(0);
    await expect(section).not.toContainText("-spex");
  }
  await expect(packages).not.toContainText(app.projectId!);
  await expect(personal).not.toContainText(app.ownKey);
  expect(await precedes("packages-project", "packages-personal")).toBe(true);
  await expect(packageRow(packages, NOTES)).toBeVisible();

  // Every enabled playbook once, though both environments export the
  // built-ins: its command, intent, the built-in reading "built in",
  // where it is enabled and the role bindings of your Personal config,
  // which alone enables it (playbook-library-1, playbook-library-29).
  await projectTab(page, "Playbooks");
  const enabled = page.getByTestId("playbooks-enabled");
  const available = page.getByTestId("playbooks-available");
  await expect(enabled.getByRole("heading").first()).toHaveText("Enabled");
  await expect(available.getByRole("heading").first()).toHaveText("Available");
  await expect(page.getByTestId("playbook-card-code")).toHaveCount(1);
  await expect(page.getByTestId("playbook-card-review")).toHaveCount(1);
  const code = playbookCard(enabled, "code");
  const review = playbookCard(enabled, "review");
  await expect(code).toContainText("/code");
  await expect(code).toContainText("implement a coding intent in reviewed, one-commit phases");
  await expect(code.getByTestId("playbook-enabled-code")).toHaveText("Personal");
  await expect(code.getByTestId("playbook-from-code")).toHaveText("built in");
  await expect(code.getByTestId("role-binding-code-coder")).toHaveText("Ccoder");
  await expect(code.getByTestId("role-binding-code-coder")).toHaveAttribute("title", /^dev\.coder · /);
  await expect(review).toContainText("/review");
  await expect(review.getByTestId("playbook-enabled-review")).toHaveText("Personal");
  await expect(review.getByTestId("role-binding-review-coder")).toHaveText("Ccoder");
  await expect(review.getByTestId("role-binding-review-coder")).toHaveAttribute("title", /^dev\.coder · /);
  await expect(review.getByTestId("role-binding-review-reviewer")).toHaveText("Rreviewer");
  await expect(review.getByTestId("role-binding-review-reviewer")).toHaveAttribute("title", /^dev\.reviewer · /);

  // Enabled for you alone, the project's config enabling none, a row's
  // primary act is "Enable for <project>" and its overflow holds
  // "Disable for Personal"; the list never reads as empty, and the
  // built-ins enabled in neither config stand beneath under Available,
  // each once and reading "built in" (playbook-library-1,
  // playbook-library-34).
  await expect(code.getByTestId("playbook-enable-code")).toHaveText(`Enable for ${PROJECT}`);
  await expect(code.getByTestId("playbook-disable-code")).toHaveCount(0);
  await code.getByTestId("playbook-personal-code").click();
  await expect(code.getByTestId("playbook-personal-code-menu").getByRole("menuitem")).toHaveText(["Disable for Personal"]);
  await page.keyboard.press("Escape");
  await expect(code.getByTestId("playbook-personal-code-menu")).toHaveCount(0);
  await expect(page.getByTestId("playbooks-empty")).toHaveCount(0);
  await expect(available.getByTestId("playbook-card-code")).toHaveCount(0);
  await expect(page.getByTestId("playbook-card-decide")).toHaveCount(1);
  const decide = playbookCard(available, "decide");
  await expect(decide.getByTestId("playbook-from-decide")).toHaveText("built in");
  await expect(decide).not.toContainText(`in ${PROJECT}`);
  await expect(decide).not.toContainText("Personal");
  await expect(decide.getByTestId("playbook-enable-decide")).toHaveText(`Enable for ${PROJECT}`);
  // Its "Enable for <project>" writes the project's config and lists it
  // among the enabled, reading "in <project>" with Disable.
  expect(app.readProjectConfig()).not.toContain("decide:");
  await decide.getByTestId("playbook-enable-decide").click();
  await expect.poll(() => app.readProjectConfig()).toContain("decide:");
  expect(app.readConfig()).not.toMatch(/^\s{2}decide:/m);
  const enabledDecide = playbookCard(enabled, "decide");
  await expect(enabledDecide).toBeVisible();
  await expect(enabledDecide.getByTestId("playbook-enabled-decide")).toHaveText(`in ${PROJECT}`);
  await expect(enabledDecide.getByTestId("playbook-disable-decide")).toHaveText("Disable");
  await expect(available.getByTestId("playbook-card-decide")).toHaveCount(0);

  // The stage row stands on the card — here /code's:
  // a press opens that stage, a press beside it swaps, a second press
  // closes (playbook-library-22).
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

  // Disabling through the overflow's "Disable for Personal" asks for no
  // confirm: your Personal config no longer names it, and it lists once
  // under Available (playbook-library-1, playbook-library-26,
  // playbook-library-3).
  await review.getByTestId("playbook-personal-review").click();
  await review.getByTestId("playbook-disable-personal-review").click();
  await expect.poll(() => app.readConfig()).not.toMatch(/^\s{2}review:/m);
  await expect(enabled.getByTestId("playbook-card-review")).toHaveCount(0);
  await expect(page.getByTestId("playbook-card-review")).toHaveCount(1);
  await expect(playbookCard(available, "review")).toBeVisible();

  // Remove in a package row's overflow carries its consequence as its
  // tooltip (playbook-library-92, playbook-library-26); Escape leaves
  // the package where it is.
  await projectTab(page, "Packages");
  const notes = packageRow(packages, NOTES);
  const remove = await rowAct(notes, "Remove");
  await expect(remove).toHaveAttribute("title", `Removes ${NOTES} from spex.yaml and uninstalls it`);
  await page.keyboard.press("Escape");
  await expect(notes.getByRole("menu")).toHaveCount(0);
  await expect(notes).toBeVisible();
  expect(readFileSync(join(app.projectDir, "spex.yaml"), "utf8")).toContain(NOTES);

  // The Captain home's slash menu follows your Personal config.
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
  await playbookCard(page, "decide").getByTestId("playbook-enable-decide").click();
  await expect.poll(() => app.readProjectConfig()).toContain("decide:");
  await newTaskTab(page);
  await page.getByTestId("start-composer").fill("/");
  await expect(page.getByRole("listbox")).toContainText("/decide", { timeout: 5_000 });
});

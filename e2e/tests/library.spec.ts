// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project's Playbooks and Packages tabs and the Playbooks surface as a
// user works them (playbook-library-41, DR-176): the Playbooks tab lists
// what runs in the project under its name and "Global", each playbook
// once — the built-ins under Global though both environments place
// them — with no switch and no Enable or Disable; a built-in's role
// overridden for the project under Global carries a dot and writes the
// project's config, and "Same as global" takes the entry out again; the
// card's stage row opens, swaps and closes; "Manage packages" opens the
// Packages tab, whose one heading, "Packages", carries one "Add…"; the
// rail's Playbooks entry opens the global page, whose ✎ writes the
// global config, a row's Remove carrying its consequence as its tooltip;
// a role's tuning saved in the global entry from that page
// (playbook-library-39); and a project's playbook taking /inspect, the
// built-in standing aside until its package goes (playbook-library-94).

import { join } from "node:path";
import { parse } from "yaml";
import { AUTHORING_SOURCE, makeRelease } from "@sublang/spex-core/testing";

import {
  test,
  expect,
  open,
  newTaskTab,
  packageRow,
  packagesSection,
  playbookCard,
  playbooksSurface,
  projectTab,
  projectTabControl,
  requestBuiltinsInProject,
  rowAct,
} from "../src/harness";

test.use({ appOptions: { project: true } });

/** The built-in spec package the global environment requests as the
 * home is made (environments-11). */
const BUILTINS = "sublang/playbooks";

/** The project as its tabs name it (playbook-library-1). */
const PROJECT = "demo-project";

/** The project's config as a person left it: a comment and an entry of
 * its own, which every override and set-back leaves byte for byte
 * (playbook-library-21, playbook-library-16). */
const PROJECT_CONFIG = [
  "# The team's notes on this file stay as written.",
  "playbooks:",
  "  # Branches are cut by the reviewer here.",
  "  branch:",
  "    roles:",
  "      coder: dev.reviewer # the reviewer cuts branches",
  "",
].join("\n");

/** The project's config text with the `<id>` entry an override wrote
 * taken out: the rest is what stood before it. */
function withoutEntry(text: string, id: string): string {
  const lines = text.split("\n");
  const start = lines.indexOf(`  ${id}:`);
  if (start < 0) return text;
  let end = start + 1;
  while (end < lines.length && lines[end]!.startsWith("    ")) end += 1;
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

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
    // The global entry carries each role's tuning (playbook-library-4):
    // ✎ on the Playbooks surface edits it (playbook-library-122).
    const surface = await playbooksSurface(page);
    const edit = playbookCard(surface, "code").getByTestId("role-bind-code-coder");
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

test("playbook-library-41: the tabs' and the surface's words, an override under Global, the stage row, and Remove's consequence", async ({
  page,
  app,
}) => {
  test.setTimeout(90_000);
  // The project's environment requests the built-ins beside the global
  // one, and a package by folder of its own (arranged over the
  // protocol), so its Packages tab holds a row of its own.
  await requestBuiltinsInProject(app);
  await makeRelease(join(app.projectDir, NOTES_PATH), {
    format: 2, org: "acme", name: "notes-kit", version: "0.1.0", description: "A note reader", license: "Apache-2.0",
    artifacts: { "notes-reader": { kind: "skill", language: "en" } },
  }, { "skills/en/notes-reader/SKILL.md": "---\nname: notes-reader\ndescription: Read a note\n---\nRead the note without changes.\n" });
  await app.core.command("environment.request", { repository: app.projectId!, name: NOTES, request: { kind: "path", path: NOTES_PATH } });
  // The project's config holds a comment and an entry of its own.
  app.writeProjectConfig(PROJECT_CONFIG);
  await open(page, app);
  const playbooks = await projectTab(page, "Playbooks");

  // The tab holds no switch, no package list, add control or registry
  // account — only "Manage packages", opening the project's Packages
  // tab (playbook-library-1).
  await expect(page.getByTestId("playbooks-switch")).toHaveCount(0);
  await expect(playbooks.getByTestId(/^env-package-/)).toHaveCount(0);
  await expect(playbooks.getByRole("button", { name: "Add…", exact: true })).toHaveCount(0);
  await expect(playbooks.getByTestId("add-packages")).toHaveCount(0);
  await expect(playbooks.getByTestId("registry-chooser")).toHaveCount(0);
  await expect(playbooks.getByTestId("registry-account")).toHaveCount(0);
  await playbooks.getByText("Manage packages", { exact: true }).click();
  await expect(projectTabControl(page, "Packages")).toHaveAttribute("aria-selected", "true");

  // The Packages tab: the project's packages alone under one heading,
  // "Packages", with one "Add…", naming no spex repository; the built-in
  // spec package the project requests is one row among the rest
  // (playbook-library-92, DR-159).
  const packages = packagesSection(page, "project");
  await expect(page.getByTestId("packages-tab").getByRole("heading")).toHaveText(["Packages"]);
  await expect(packages.getByRole("button", { name: "Add…", exact: true })).toHaveCount(1);
  await expect(page.getByTestId("packages-personal")).toHaveCount(0);
  await expect(packages).not.toContainText("-spex");
  await expect(packages).not.toContainText(app.projectId!);
  await expect(packageRow(packages, NOTES)).toBeVisible();
  await expect(packageRow(packages, BUILTINS)).toBeVisible();

  // Every playbook that runs, once: the built-ins under Global though
  // both environments place them, each with its command, intent,
  // `from <org/pkg> <version>` and its roles — no heading for the
  // project, which places none of its own (playbook-library-1,
  // playbook-library-29, playbook-library-34).
  await projectTab(page, "Playbooks");
  const global = page.getByTestId("playbooks-global");
  await expect(global.getByRole("heading").first()).toHaveText("Global");
  await expect(page.getByTestId("playbooks-project")).toHaveCount(0);
  for (const id of ["code", "review", "decide"]) await expect(page.getByTestId(`playbook-card-${id}`)).toHaveCount(1);
  const code = playbookCard(global, "code");
  const review = playbookCard(global, "review");
  await expect(code).toContainText("/code");
  await expect(code).toContainText("implement a coding intent in reviewed, one-commit phases");
  await expect(code.getByTestId("playbook-from-code")).toHaveText(new RegExp(`^from ${BUILTINS} \\d+\\.\\d+\\.\\d+$`));
  await expect(code.getByTestId("role-binding-code-coder")).toHaveText("Ccoder");
  await expect(code.getByTestId("role-binding-code-coder")).toHaveAttribute("title", /^dev\.coder · /);
  await expect(review.getByTestId("role-binding-review-coder")).toHaveText("Ccoder");
  await expect(review.getByTestId("role-binding-review-reviewer")).toHaveText("Rreviewer");
  await expect(review.getByTestId("role-binding-review-reviewer")).toHaveAttribute("title", /^dev\.reviewer · /);
  // No switch, no Enable or Disable, no scope (playbook-library-26).
  for (const words of ["Enable", "Disable", "Available", "Personal", `in ${PROJECT}`, "built in"]) {
    await expect(playbooks).not.toContainText(words);
  }

  // A built-in's role overridden for the project under Global: the
  // editor offers "Same as global" first and the player alone; a choice
  // writes the project's entry, the other roles as the global binding
  // has them, and the role carries a dot — no confirm asked
  // (playbook-library-4, playbook-library-3, playbook-library-1).
  const editor = page.getByTestId("binding-editor-reviewer");
  await review.getByTestId("role-bind-review-reviewer").click();
  await expect(editor.getByTestId("binding-player").locator("option").first()).toHaveText("Same as global");
  await expect(editor.getByTestId("binding-player")).toHaveValue("");
  await expect(editor.getByTestId("binding-tuning-note")).toHaveText("Tuning lives in your players, in Settings");
  const globalBefore = app.readConfig();
  await editor.getByTestId("binding-player").selectOption("dev.coder");
  await editor.getByTestId("binding-save").click();
  await expect(editor).toBeHidden();
  await expect.poll(() => parse(app.readProjectConfig() || "{}")?.playbooks?.review?.roles).toEqual({ coder: "dev.coder", reviewer: "dev.coder" });
  expect(app.readConfig()).toBe(globalBefore);
  // The comments and the unrelated entry stand byte for byte, the entry
  // written aside (playbook-library-21).
  expect(withoutEntry(app.readProjectConfig(), "review")).toBe(PROJECT_CONFIG);
  await expect(review.getByTestId("role-override-dot-review-reviewer")).toBeVisible();
  await expect(review.getByTestId("role-override-dot-review-coder")).toHaveCount(0);
  // The roles one player plays stand on one line (playbook-library-38).
  await expect(review.locator('[data-roles="coder reviewer"]')).toHaveCount(1);
  // Set back to "Same as global", no role differs: the entry leaves the
  // project's config and the dot goes.
  await review.getByTestId("role-bind-review-reviewer").click();
  await expect(editor.getByTestId("binding-player")).toHaveValue("dev.coder");
  await editor.getByTestId("binding-player").selectOption("");
  await editor.getByTestId("binding-save").click();
  await expect(editor).toBeHidden();
  await expect.poll(() => parse(app.readProjectConfig() || "{}")?.playbooks?.review).toBeUndefined();
  // Set back, the file reads as the person left it, byte for byte.
  expect(app.readProjectConfig()).toBe(PROJECT_CONFIG);
  await expect(review.getByTestId("role-override-dot-review-reviewer")).toHaveCount(0);
  await expect(review.getByTestId("role-binding-review-reviewer")).toHaveText("Rreviewer");

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

  // The rail's Playbooks entry opens the global page: the global spec
  // packages, each with the playbooks it places beneath it, "Add…", the
  // Authoring section's "New playbook", and no project's playbook or
  // name (playbook-library-122).
  const surface = await playbooksSurface(page);
  const global_ = packagesSection(page, "global");
  await expect(global_.getByRole("heading", { name: "Playbooks", exact: true })).toBeVisible();
  await expect(global_.getByRole("button", { name: "Add…", exact: true })).toHaveCount(1);
  const builtins = packageRow(global_, BUILTINS);
  await expect(builtins).toBeVisible();
  const placed = surface.getByTestId(`surface-playbooks-${BUILTINS}`);
  for (const id of ["code", "review", "decide"]) await expect(playbookCard(placed, id)).toHaveCount(1);
  await expect(surface.getByTestId("new-playbook")).toBeVisible();
  await expect(surface).not.toContainText(PROJECT);
  for (const words of ["Enable", "Disable", "Available", "Personal", "built in"]) {
    await expect(surface).not.toContainText(words);
  }
  // ✎ there writes the global config — the first edit of a playbook on
  // its default binding writing its entry — the project's config
  // unchanged (playbook-library-4).
  expect(parse(app.readConfig()).playbooks.branch).toBeUndefined();
  const projectBefore = app.readProjectConfig();
  await expect(playbookCard(placed, "branch").getByTestId("role-binding-branch-coder")).toHaveAttribute("title", /^dev\.coder · /);
  await playbookCard(placed, "branch").getByTestId("role-bind-branch-coder").click();
  const surfaceEditor = page.getByTestId("binding-editor-coder");
  await expect(surfaceEditor.getByTestId("binding-player").locator("option").first()).not.toHaveText("Same as global");
  await surfaceEditor.getByTestId("binding-player").selectOption("dev.reviewer");
  await surfaceEditor.getByTestId("binding-save").click();
  await expect(surfaceEditor).toBeHidden();
  await expect.poll(() => parse(app.readConfig()).playbooks.branch?.roles).toEqual({ coder: "dev.reviewer" });
  await expect(playbookCard(placed, "branch").getByTestId("role-binding-branch-coder")).toHaveAttribute("title", /^dev\.reviewer · /);
  expect(app.readProjectConfig()).toBe(projectBefore);

  // Remove in a package row's overflow carries its consequence as its
  // tooltip (playbook-library-92, playbook-library-26); Escape leaves
  // the package where it is.
  const remove = await rowAct(builtins, "Remove");
  await expect(remove).toHaveAttribute("title", `Removes ${BUILTINS} from spex.yaml and uninstalls it`);
  await page.keyboard.press("Escape");
  await expect(builtins.getByRole("menu")).toHaveCount(0);
  await expect(builtins).toBeVisible();
});

test("playbook-library-41: the Captain home's slash menu offers a placed playbook no entry binds", async ({
  page,
  app,
}) => {
  // The home's slash menu lists the project's composed catalog: a
  // placed playbook runs on its default binding, nothing enabled
  // (playbook-library-34, core-service-2).
  expect(parse(app.readConfig()).playbooks.decide).toBeUndefined();
  await open(page, app);
  await newTaskTab(page);
  await page.getByTestId("start-composer").fill("/");
  await expect(page.getByRole("listbox")).toContainText("/decide", { timeout: 5_000 });
  await expect(page.getByRole("listbox")).toContainText("/review");
});

test.describe("a project's playbook taking a built-in's command", () => {
  // An authored playbook added to the project with the command /inspect,
  // its spec package requested by path from the working folder
  // (playbook-library-7): compiled by the passing stub, as the authoring
  // journeys compile.
  test.use({
    appOptions: {
      project: true,
      authoring: { slc: "ok", phaseDelayMs: 50, script: { fallback: { deltas: ["Compiled."], result: "Compiled." } } },
    },
  });

  test("playbook-library-94: the built-in /inspect stands aside for the project's, and lists with its roles once the package is removed", async ({
    page,
    app,
  }) => {
    test.setTimeout(120_000);
    const projectId = app.projectId!;
    const org = projectId.split("/")[0]!;
    const id = "check";
    const name = `${org}/${id}`;
    const { instance } = await app.core.command("draft.create", { projectId, draftId: id, org, license: "Apache-2.0" });
    await app.core.command("draft.source.write", { projectId, draftId: id, instance: instance!, content: AUTHORING_SOURCE.replaceAll("<id>", id) });
    await app.core.command("draft.compile", { projectId, draftId: id, instance: instance! });
    await expect
      .poll(async () => (await app.core.command("draft.list", {})).find((draft) => draft.id === id)?.state, { timeout: 60_000 })
      .toBe("compiled");
    await app.core.command("draft.register", {
      projectId,
      draftId: id,
      instance: instance!,
      command: "inspect",
      intent: "Check a change against the house rules",
      bindings: { Triager: "dev.coder", Verifier: "dev.reviewer" },
    });
    await open(page, app);
    const playbooks = await projectTab(page, "Playbooks");

    // The project's playbook lists under its name with its roles; the
    // built-in /inspect under Global reads that it stands aside, naming
    // the package whose playbook takes the command, in place of its
    // roles (playbook-library-1, core-service-2).
    const own = page.getByTestId("playbooks-project");
    await expect(own.getByRole("heading").first()).toHaveText(PROJECT);
    const check = playbookCard(own, id);
    await expect(check).toContainText("/inspect");
    await expect(check.getByTestId(`playbook-from-${id}`)).toHaveText(new RegExp(`^from\\s*${name} 0\\.1\\.0$`));
    await expect(check.getByTestId(`role-binding-${id}-Triager`)).toHaveAttribute("title", /^dev\.coder · /);
    const inspect = playbookCard(page.getByTestId("playbooks-global"), "inspect");
    await expect(inspect.getByTestId("playbook-aside-inspect")).toHaveText(`Stands aside · /inspect is ${name}'s`);
    await expect(inspect.getByTestId("role-binding-inspect-inspector")).toHaveCount(0);
    for (const words of ["Enabled", "Available", "Personal", `in ${PROJECT}`, "built in"]) await expect(playbooks).not.toContainText(words);

    // Its package removed from the Packages tab, the written entry stands
    // marked with its failure and Remove under the project's name
    // (playbook-library-2); Remove deletes that entry alone, and the tab
    // reads the Global heading alone, /inspect listing with its roles.
    await projectTab(page, "Packages");
    const row = packageRow(packagesSection(page, "project"), name);
    await (await rowAct(row, "Remove")).click();
    await expect(row).toHaveCount(0);
    await projectTab(page, "Playbooks");
    await expect(own.getByTestId(`playbook-invalid-${id}`)).toBeVisible();
    await own.getByTestId(`playbook-remove-${id}`).click();
    await expect.poll(() => parse(app.readProjectConfig() || "{}")?.playbooks?.[id]).toBeUndefined();
    await expect(own).toHaveCount(0);
    await expect(inspect.getByTestId("playbook-aside-inspect")).toHaveCount(0);
    await expect(inspect.getByTestId("role-binding-inspect-inspector")).toHaveAttribute("title", /^dev\.inspector · /);
  });
});

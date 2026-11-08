// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Playbooks surface over a real core on a scratch home
// (playbook-library-123, DR-176): the global environment's authoring
// session lists there and not on the project's tab, the project's there
// and not on the surface; a spec package of the global environment's
// folder added through the surface's Add… lists its playbook beneath its
// row at once and under Global on the project's tab; ✎ on the surface
// shows on the project's tab as the role's new player under Global, no
// dot; and with every package removed, the built-in one among them, the
// surface reads "No playbooks yet" above Add… while the project's tab
// holds no Global heading.

import { parse } from "yaml";
import { AUTHORING_SOURCE } from "@sublang/spex-core/testing";

import {
  addPackages,
  expect,
  open,
  packageRow,
  packagesSection,
  playbookCard,
  playbooksSurface,
  projectTab,
  rowAct,
  test,
} from "../src/harness";
import { expectSurfaceGuttersToScroll, setRail } from "../src/fit";

/** The built-in spec package the global environment requests as the
 * home is made (environments-11). */
const BUILTINS = "sublang/playbooks";

test.use({
  appOptions: {
    project: true,
    // The authored playbook compiles on the passing stub, as the
    // authoring journeys compile (playbook-library-7).
    authoring: { slc: "ok", phaseDelayMs: 50, script: { fallback: { deltas: ["Compiled."], result: "Compiled." } } },
  },
});

test("playbook-library-123: both gutters scroll the bounded Playbooks content", async ({ page, app }) => {
  await page.setViewportSize({ width: 1600, height: 400 });
  await open(page, app);
  await setRail(page, true);
  await page.setViewportSize({ width: 1600, height: 400 });
  const surface = await playbooksSurface(page);
  await expect(surface.getByTestId(`surface-playbooks-${BUILTINS}`)).toBeVisible();
  await expectSurfaceGuttersToScroll(page, surface, surface.getByTestId("playbooks-surface-content"));
});

test("playbook-library-123: the surface adds, binds and removes the global packages, the project's tab following", async ({ page, app }) => {
  test.setTimeout(150_000);
  const ownKey = app.ownKey;
  const projectId = app.projectId!;

  // A playbook authored in the global environment and added there: its
  // spec package under development in your own group's clone, requested
  // by path from the global environment (playbook-library-51, -61).
  // Anonymous registry defaults intentionally suggest no org; this scenario
  // supplies the author's explicit choice, as the authoring UI permits.
  const org = "acme";
  const id = "sweep";
  const name = `${org}/${id}`;
  const { instance } = await app.core.command("draft.create", { projectId: ownKey, draftId: id, org, license: "Apache-2.0" });
  await app.core.command("draft.source.write", { projectId: ownKey, draftId: id, instance: instance!, content: AUTHORING_SOURCE.replaceAll("<id>", id) });
  await app.core.command("draft.compile", { projectId: ownKey, draftId: id, instance: instance! });
  await expect
    .poll(async () => (await app.core.command("draft.list", {})).find((draft) => draft.id === id)?.state, { timeout: 60_000 })
    .toBe("compiled");
  await app.core.command("draft.register", {
    projectId: ownKey,
    draftId: id,
    instance: instance!,
    command: "sweep",
    intent: "Sweep the issue list for stale entries",
    bindings: { Triager: "dev.coder", Verifier: "dev.reviewer" },
  });
  const path = (await app.core.command("draft.list", {})).find((draft) => draft.id === id)?.packagePath;
  if (!path) throw new Error("the global authoring session names no package folder");
  // And an authoring session of the project's own.
  const projectDraft = "tidy";
  await app.core.command("draft.create", { projectId, draftId: projectDraft, org, license: "Apache-2.0" });

  await open(page, app);

  // (d) Each page lists its own environment's authoring sessions alone
  // (playbook-library-50).
  const playbooks = await projectTab(page, "Playbooks");
  await expect(playbooks.getByTestId(`draft-row-${projectDraft}`)).toBeVisible();
  await expect(playbooks.getByTestId(`draft-row-${id}`)).toHaveCount(0);
  const surface = await playbooksSurface(page);
  await expect(surface.getByTestId(`draft-row-${id}`)).toBeVisible();
  await expect(surface.getByTestId(`draft-row-${projectDraft}`)).toHaveCount(0);

  // (a) Removed, then added again through the surface's Add… from its
  // folder: the package's playbook lists beneath its row at once
  // (playbook-library-122, playbook-library-92).
  const global = packagesSection(page, "global");
  const authored = packageRow(global, name);
  await expect(authored).toBeVisible();
  await (await rowAct(authored, "Remove")).click();
  await expect(authored).toHaveCount(0);
  await addPackages(global, "Folder");
  const folder = page.getByTestId("folder-request-path");
  await folder.fill(path);
  await expect(page.getByTestId("folder-request-derived")).toHaveText(name);
  await page.getByTestId("folder-request-submit").click();
  await expect(global.getByTestId("add-note")).toContainText(`Added ${name}`);
  const beneath = surface.getByTestId(`surface-playbooks-${name}`);
  await expect(playbookCard(beneath, id)).toBeVisible();
  await expect(playbookCard(beneath, id)).toContainText("/sweep");
  // It is requested in the global spex.yaml, and the project's requests
  // nothing.
  const environments = async () => ({
    own: await app.core.command("environment.get", { repository: ownKey }),
    project: await app.core.command("environment.get", { repository: projectId }),
  });
  expect((await environments()).own.requests[name]).toEqual({ kind: "path", path });
  expect((await environments()).project.requests[name]).toBeUndefined();
  // On the project's tab it lists under Global (playbook-library-1).
  await projectTab(page, "Playbooks");
  await expect(playbookCard(page.getByTestId("playbooks-global"), id)).toBeVisible();
  await expect(page.getByTestId("playbooks-project")).toHaveCount(0);

  // (b) ✎ on the surface writes the global entry; the project's tab
  // lists the role's new player under Global with no dot, the project's
  // config untouched (playbook-library-4, playbook-library-1).
  await playbooksSurface(page);
  const placed = surface.getByTestId(`surface-playbooks-${BUILTINS}`);
  const projectBefore = app.readProjectConfig();
  await playbookCard(placed, "branch").getByTestId("role-bind-branch-coder").click();
  const editor = page.getByTestId("binding-editor-coder");
  await editor.getByTestId("binding-player").selectOption("dev.reviewer");
  await editor.getByTestId("binding-save").click();
  await expect(editor).toBeHidden();
  await expect.poll(() => parse(app.readConfig()).playbooks.branch?.roles).toEqual({ coder: "dev.reviewer" });
  expect(app.readProjectConfig()).toBe(projectBefore);
  await projectTab(page, "Playbooks");
  const branch = playbookCard(page.getByTestId("playbooks-global"), "branch");
  await expect(branch.getByTestId("role-binding-branch-coder")).toHaveAttribute("title", /^dev\.reviewer · /);
  await expect(branch.getByTestId("role-override-dot-branch-coder")).toHaveCount(0);

  // (c) Every package removed through its row's Remove, the built-in one
  // among them: the surface reads "No playbooks yet" above its one
  // Add…, and the project's tab holds no Global heading
  // (playbook-library-122, playbook-library-92, playbook-library-1).
  await playbooksSurface(page);
  for (const pkg of [name, BUILTINS]) {
    const row = packageRow(global, pkg);
    await (await rowAct(row, "Remove")).click();
    await expect(row).toHaveCount(0);
  }
  const empty = global.getByTestId("playbooks-surface-empty");
  await expect(empty).toBeVisible();
  await expect(empty.locator("p")).toHaveText("No playbooks yet");
  await expect(global.getByRole("button", { name: "Add…", exact: true })).toHaveCount(1);
  await expect(empty.getByRole("button", { name: "Add…", exact: true })).toBeVisible();
  expect(
    await empty.evaluate((card) => {
      const words = card.querySelector("p")!;
      const add = card.querySelector('[data-testid="add-open"]')!;
      return Boolean(words.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING);
    }),
  ).toBe(true);
  await projectTab(page, "Playbooks");
  await expect(page.getByTestId("playbooks-global")).toHaveCount(0);
});

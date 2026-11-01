// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Publishing at the project's instance and installing elsewhere
// (playbook-library-95, DR-104, DR-127): a home signed in to two
// stand-in instances, each fronting a stand-in registry of its own at
// its own origin as spex.pub serves both, the first its default
// instance, holds a compiled authoring session enabled in a project
// picked into its namespace at the second; Publish uploads its spec
// package under development to the second's registry alone, as the
// account there, and a second scratch home signed in to the second
// instance alone finds it by search, requests it, and enables its
// playbook; the first home, signed out of the second Space, still
// publishes, and signed out of the second's registry offers "Sign in to
// publish" in Publish's place (DR-172).

import type { Locator, Page } from "@playwright/test";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUTHORING_SOURCE } from "@sublang/spex-core/testing";

import {
  HOST_LOGIN,
  SECOND_HOST_NAME,
  addPackages,
  builtinLine,
  expect,
  instanceSection,
  nav,
  open,
  packageRow,
  packageSource,
  packagesSection,
  pickGroup,
  playbookCard,
  projectTab,
  publishFromRow,
  rowAct,
  rowMenu,
  rowSignInToPublish,
  signInCore,
  signInRegistryCore,
  selectRegistryCore,
  startApp,
  test,
  type App,
} from "../src/harness";

/** The authoring session's playbook, its spec package named under the
 * org New playbook gives it — here the signed-in account's — with the
 * license the registry requires (playbook-library-51, -70). */
const ID = "triage";
const PACKAGE = `${HOST_LOGIN}/${ID}`;

/** A compiled authoring session enabled in the project, arranged over
 * the protocol (playbook-library-7): created, its source written,
 * compiled by the passing stub `slc`, and enabled with a roster player
 * per role. */
async function arrangeEnabled(app: App): Promise<void> {
  const projectId = app.projectId!;
  const { instance } = await app.core.command("draft.create", { projectId, draftId: ID, org: HOST_LOGIN, license: "Apache-2.0" });
  await app.core.command("draft.source.write", {
    projectId,
    draftId: ID,
    instance: instance!,
    content: AUTHORING_SOURCE.replaceAll("<id>", ID),
  });
  await app.core.command("draft.compile", { projectId, draftId: ID, instance: instance! });
  await expect
    .poll(async () => (await app.core.command("draft.list", {})).find((draft) => draft.id === ID)?.state, {
      timeout: 60_000,
    })
    .toBe("compiled");
  await app.core.command("draft.register", {
    projectId,
    draftId: ID,
    instance: instance!,
    command: ID,
    intent: "Triage a new issue into the repository's labels",
    bindings: { Triager: "dev.coder", Verifier: "dev.reviewer" },
  });
  await expect
    .poll(async () => (await app.core.command("draft.list", {})).find((draft) => draft.id === ID)?.state, {
      timeout: 30_000,
    })
    .toBe("enabled");
}

/** The project as its tabs name it (playbook-library-1). */
const PROJECT = "demo-project";

/** Publish's inline preview names the destination registry by its
 * display name, its origin in a tooltip, over the file count and the
 * account and org it publishes as (playbook-library-93). */
async function expectPreview(summary: Locator, name: string, registry: string, origin: string): Promise<void> {
  await expect(summary.getByTestId("publish-target")).toHaveText(`Publish ${name} 0.1.0 to ${registry}`);
  await expect(summary.locator(`[title="${origin}"]`).first()).toBeVisible();
  const files = await summary.getByTestId("publish-files").locator("li").count();
  expect(files).toBeGreaterThan(1);
  await expect(summary).toContainText(`${files} files`);
  await expect(summary).toContainText(`as @${HOST_LOGIN} in ${HOST_LOGIN}`);
  await expect(summary).not.toContainText(`Publish to ${origin}`);
}

/** Open the authoring session's Enable tab (playbook-library-61) from
 * the project's Playbooks tab. */
async function openEnableTab(page: Page): Promise<void> {
  await projectTab(page, "Playbooks");
  await page.getByTestId(`draft-open-${ID}`).click();
  await expect(page.getByTestId("authoring-workspace")).toBeVisible();
  await page.getByRole("tablist", { name: "Draft artifacts" }).getByRole("tab", { name: "Enable", exact: true }).click();
  await expect(page.getByTestId("register-form")).toBeVisible();
}

test.use({
  appOptions: {
    project: true,
    host: { registry: true, second: { registry: true } },
    signedIn: true,
    authoring: { slc: "ok", phaseDelayMs: 50, script: { fallback: { deltas: ["Compiled."], result: "Compiled." } } },
  },
});

test("playbook-library-95: Publish from a project at the second instance reads the version with its link to the second's registry, the first's holding no such release; a home signed in to the second alone installs and enables it; Space sign-out preserves publication while registry sign-out asks for its own grant", async ({
  page,
  app,
}) => {
  test.setTimeout(240_000);
  const [first, second] = app.hosts;
  const [firstRegistry, secondRegistry] = app.registries;
  if (!first || !second || !firstRegistry || !secondRegistry) throw new Error("two instances, each fronting a registry");
  // Signed in to the second as well, the first staying the default
  // instance, and the project picked into the account's namespace at
  // the second, so a publish from it goes to the second (arrange only).
  await signInCore(app, second);
  const project = await pickGroup(app, { host: second, namespace: true });
  await selectRegistryCore(app, second.url, project.key);
  await signInRegistryCore(app, second);
  expect(project.instance).toBe(second.url);
  await arrangeEnabled(app);
  await open(page, app);
  await openEnableTab(page);

  // Publish shows, inline, "Publish <org>/<pkg> <version> to
  // <registry>" — the second's registry by its display name, its origin
  // in the tooltip — over the count of the files it would upload and the
  // account and org it publishes as, then uploads them; the published
  // version reads with a link to its page at the second's registry,
  // which holds the release, uploaded as the account there, while the
  // first's holds none (playbook-library-93).
  const publish = page.getByTestId("publish");
  await publish.getByTestId("publish-button").click();
  const summary = publish.getByTestId("publish-summary");
  await expectPreview(summary, PACKAGE, SECOND_HOST_NAME, second.url);
  await expect(summary.getByTestId("publish-files")).toContainText("meta.yaml");
  await expect(summary.getByTestId("publish-files")).toContainText(`playbooks/en/${ID}/${ID}.md`);
  await expect(summary.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(summary.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  await summary.getByTestId("publish-confirm").click();
  const done = publish.getByTestId("publish-done");
  await expect(done).toContainText(new RegExp(`Published (${PACKAGE} )?0\\.1\\.0`), { timeout: 30_000 });
  await expect(done.getByTestId("publish-link")).toHaveAttribute("href", `${second.url}/${PACKAGE}`);
  expect((await fetch(`${secondRegistry.url}/api/v1/packages/${PACKAGE}/0.1.0`)).status).toBe(200);
  expect(secondRegistry.script.received.filter((request) => request.method === "PUT")).toEqual([
    { method: "PUT", path: `/api/v1/packages/${PACKAGE}/0.1.0`, instance: second.url, account: HOST_LOGIN, bearer: true },
  ]);
  expect((await fetch(`${firstRegistry.url}/api/v1/packages/${PACKAGE}/0.1.0`)).status).toBe(404);
  expect(firstRegistry.script.received.filter((request) => request.method === "PUT")).toEqual([]);

  // A second scratch home signed in to the second instance alone finds
  // it by search in its project's Add…, Add adds it with the receipt
  // naming what arrived, its row reads its version, its source glyph and
  // its standing, and its playbook lists on the Playbooks tab from the
  // registry source and enables (playbook-library-92,
  // playbook-library-34).
  const other = await startApp({ project: true, host: { share: { host: second, registry: secondRegistry } }, signedIn: true });
  try {
    const listed = (await other.core.command("space.get", {})).instances;
    expect(listed.map((instance) => [instance.origin, instance.signedIn])).toEqual([[second.url, true]]);
    await selectRegistryCore(other, second.url);
    await open(page, other);
    await projectTab(page, "Packages");
    const packages = await addPackages(packagesSection(page, "project"), "Registry");
    await packages.getByTestId("registry-query").fill(ID);
    const result = packages.getByTestId(`registry-result-${PACKAGE}`);
    await expect(result).toBeVisible();
    await expect(result.getByTestId(`registry-version-${PACKAGE}`)).toContainText("0.1.0 exactly");
    await result.getByTestId(`registry-add-${PACKAGE}`).click();
    const receipt = packages.getByTestId("add-receipt");
    await expect(receipt.getByTestId("add-note")).toHaveText(`Added ${PACKAGE} 0.1.0 · 1 playbook`, { timeout: 30_000 });
    await expect(receipt.getByRole("button", { name: "Enable", exact: true })).toBeVisible();
    const added = packageRow(packages, PACKAGE);
    await expect(added.getByTestId(`env-version-${PACKAGE}`)).toHaveText("0.1.0", { timeout: 30_000 });
    await expect(packageSource(added, PACKAGE)).toHaveAttribute("title", /^From the registry · /);
    await expect(added).toContainText("1 playbook");
    await expect(added.getByTestId(`env-installed-${PACKAGE}`)).toHaveText("Installed");
    await projectTab(page, "Playbooks");
    const card = playbookCard(page.getByTestId("playbooks-available"), ID, "project");
    await expect(card).toContainText(`/${ID}`);
    await expect(card.getByTestId(`playbook-from-${ID}`)).toHaveText(new RegExp(`^from\\s*${PACKAGE} 0\\.1\\.0$`));
    await card.getByTestId(`playbook-enable-${ID}`).click();
    const enabled = playbookCard(page.getByTestId("playbooks-enabled"), ID, "project");
    await expect(enabled.getByTestId(`playbook-enabled-${ID}`)).toHaveText(`in ${PROJECT}`);
    await expect.poll(() => other.readProjectConfig()).toContain(`${ID}:`);
  } finally {
    await other.close();
  }

  // Signed out of the second Space alone, the first instance still
  // signed in and the default, the first home still publishes; signed
  // out of the second's registry, one button "Sign in to publish" stands
  // in Publish's place (playbook-library-93).
  await open(page, app);
  await nav(page, "Space").click();
  const secondSection = instanceSection(page, second);
  await secondSection.getByTestId("space-signout").click();
  await expect(secondSection.getByTestId("space-signin-again")).toHaveText("Sign in again");
  await expect(instanceSection(page, first).getByTestId("space-account")).toContainText(`@${HOST_LOGIN}`);
  await openEnableTab(page);
  await expect(page.getByTestId("publish-button")).toBeVisible();
  await app.core.command("registry.signout", { origin: second.url });
  await expect(page.getByTestId("publish").getByRole("button", { name: "Sign in to publish", exact: true })).toBeVisible();
  await expect(page.getByTestId("publish-button")).toHaveCount(0);
});


test("playbook-library-114: a local spec-and-skill package publishes without a playbook, repeated versions refuse honestly, and another project installs it", async ({ page, app }) => {
  test.setTimeout(180_000);
  const [first, second] = app.hosts;
  const [firstRegistry, registry] = app.registries;
  if (!first || !second || !firstRegistry || !registry) throw new Error("two configured instances and registries");
  await signInCore(app, second);
  const project = await pickGroup(app, { host: second, namespace: true });
  await selectRegistryCore(app, second.url, project.key);
  await signInRegistryCore(app, second);
  const id = "notes-tools";
  const name = `${HOST_LOGIN}/${id}`;
  const path = `spex-packages/${HOST_LOGIN}/${id}`;
  const folder = join(app.projectDir, path);
  const spec = `# notes-tools: Notes\n\n## Intent\nDescribe one local note.\n\n## External Behavior\n### notes-tools-1\nThe page shall retain one note.\n\n## Verification\n### notes-tools-2\nWhen a browser reloads the page, the system test shall verify note retention [[notes-tools-1](#notes-tools-1)].\n`;
  const skill = "---\nname: notes-summary\ndescription: Summarize the notes contract\n---\nRead the notes contract and summarize it without changes.\n";
  mkdirSync(join(folder, "specs", "en"), { recursive: true });
  mkdirSync(join(folder, "skills", "en", "notes-summary"), { recursive: true });
  writeFileSync(join(folder, "specs", "en", `${id}.md`), spec);
  writeFileSync(join(folder, "skills", "en", "notes-summary", "SKILL.md"), skill);
  writeFileSync(join(folder, "meta.yaml"), `format: 2\norg: ${HOST_LOGIN}\nname: ${id}\nversion: 0.1.0\ndescription: Reusable notes requirements and a summary skill\nlicense: Apache-2.0\nartifacts:\n  notes-tools: {kind: spec, language: en}\n  notes-summary: {kind: skill, language: en}\n`);
  await app.core.command("environment.request", { repository: project.key, name, request: { kind: "path", path } });
  expect(await app.core.command("draft.list", {})).toEqual([]);
  await open(page, app);
  await projectTab(page, "Packages");
  const packages = packagesSection(page, "project");
  const row = packageRow(packages, name);
  // The folder package's row offers Publish in its overflow with no
  // authoring session or compilation, and the built-in line none
  // (playbook-library-113).
  await expect(packageSource(row, name)).toHaveAttribute("title", `From folder ${path}`);
  await expect(row).toContainText("1 spec · 1 skill");
  await expect(await rowAct(row, "Publish")).toBeVisible();
  await expect(await rowAct(row, "Remove")).toBeVisible();
  await page.keyboard.press("Escape");
  // The built-in spec package stands as the one quiet line, never a
  // row with an overflow of its own (playbook-library-92).
  await expect(builtinLine(packages)).toBeVisible();
  await expect(packageRow(packages, "sublang/playbooks")).toHaveCount(0);
  // The preview names the destination registry by its display name, the
  // package, version, file count and org; Cancel uploads nothing
  // (playbook-library-113, playbook-library-93).
  let publish = await publishFromRow(row);
  await expectPreview(publish.getByTestId("publish-summary"), name, SECOND_HOST_NAME, second.url);
  await expect(publish.getByTestId("publish-files")).toContainText(`specs/en/${id}.md`);
  await expect(publish.getByTestId("publish-files")).toContainText("skills/en/notes-summary/SKILL.md");
  await publish.getByTestId("publish-cancel").click();
  await expect(publish.getByTestId("publish-summary")).toHaveCount(0);
  expect(registry.script.received.filter((request) => request.method === "PUT")).toEqual([]);

  // A request changed while the preview is open cannot confirm its old
  // folder: the open preview goes (playbook-library-113).
  publish = await publishFromRow(row);
  const replacement = `spex-packages/${HOST_LOGIN}/${id}-copy`;
  cpSync(folder, join(app.projectDir, replacement), { recursive: true });
  await app.core.command("environment.request", { repository: project.key, name, request: { kind: "path", path: replacement } });
  await expect(packageSource(row, name)).toHaveAttribute("title", `From folder ${replacement}`);
  await expect(publish.getByTestId("publish-summary")).toHaveCount(0);
  await app.core.command("environment.request", { repository: project.key, name, request: { kind: "path", path } });
  await expect(packageSource(row, name)).toHaveAttribute("title", `From folder ${path}`);

  // Confirmed, it publishes at the environment's instance, the version
  // reading with its link (playbook-library-113).
  publish = await publishFromRow(row);
  await expect(publish.getByTestId("publish-target")).toHaveText(`Publish ${name} 0.1.0 to ${SECOND_HOST_NAME}`);
  await publish.getByTestId("publish-confirm").click();
  await expect(publish.getByTestId("publish-done")).toContainText(new RegExp(`Published (${name} )?0\\.1\\.0`));
  await expect(publish.getByTestId("publish-link")).toHaveAttribute("href", `${second.url}/${name}`);
  expect(registry.script.received.filter((request) => request.method === "PUT").map(({ instance, account, path }) => [instance, account, path])).toEqual([[second.url, HOST_LOGIN, `/api/v1/packages/${name}/0.1.0`]]);
  expect(firstRegistry.script.received.filter((request) => request.method === "PUT")).toEqual([]);
  // Two more attempts at the same version each show the registry's
  // refusal, never the earlier receipt as a new success
  // (playbook-library-93).
  for (let attempt = 0; attempt < 2; attempt++) {
    publish = await publishFromRow(row);
    await publish.getByTestId("publish-confirm").click();
    await expect(publish.getByTestId("publish-error")).toContainText(/version|exists|published/i);
    await expect(publish.getByTestId("publish-done")).toHaveCount(0);
  }

  const other = await startApp({ project: true, host: { share: { host: second, registry } }, signedIn: true });
  try {
    await selectRegistryCore(other, second.url);
    await open(page, other);
    await projectTab(page, "Packages");
    // The second project adds it through Add…'s Registry tab; its row
    // reads the exact resolved version, what it provides — the spec and
    // the skill — and its standing, its overflow offering no Publish of
    // the installed copy (playbook-library-92, playbook-library-113).
    const otherPackages = await addPackages(packagesSection(page, "project"), "Registry");
    await otherPackages.getByTestId("registry-query").fill(id);
    const result = otherPackages.getByTestId(`registry-result-${name}`);
    await expect(result).toBeVisible();
    await result.getByTestId(`registry-add-${name}`).click();
    await expect(otherPackages.getByTestId("add-note")).toContainText(`Added ${name} 0.1.0 · 1 spec · 1 skill`);
    const installed = packageRow(otherPackages, name);
    await expect(installed.getByTestId(`env-version-${name}`)).toHaveText("0.1.0");
    await expect(packageSource(installed, name)).toHaveAttribute("title", /^From the registry · /);
    await expect(installed).toContainText("1 spec · 1 skill");
    await expect(installed.getByTestId(`env-installed-${name}`)).toHaveText("Installed");
    const acts = await rowMenu(installed);
    await expect(acts.getByRole("menuitem").filter({ hasText: /^\s*Remove\s*$/ })).toBeVisible();
    await expect(acts.getByRole("menuitem").filter({ hasText: /Publish/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(installed.getByTestId("publish")).toHaveCount(0);
    expect(readFileSync(join(other.projectDir, ".agents", "skills", "notes-summary", "SKILL.md"), "utf8")).toBe(skill);
    expect(readFileSync(join(other.projectDir, ".agents", "skills", `${HOST_LOGIN}-${id}`, `${id}.md`), "utf8")).toBe(spec);
  } finally { await other.close(); }

  // Signed out of the second Space, the row still publishes; signed out
  // of its registry, "Sign in to publish" stands in Publish's place
  // (playbook-library-113, playbook-library-93).
  await open(page, app);
  await nav(page, "Space").click();
  const atSecond = instanceSection(page, second);
  await atSecond.getByTestId("space-signout").click();
  await expect(atSecond.getByTestId("space-signin-again")).toBeVisible();
  await projectTab(page, "Packages");
  await expect(await rowAct(row, "Publish")).toBeVisible();
  await page.keyboard.press("Escape");
  await app.core.command("registry.signout", { origin: second.url });
  await expect(await rowSignInToPublish(row)).toBeVisible();
  await expect(row.getByTestId("publish-summary")).toHaveCount(0);
  await expect(row.getByTestId("publish-button")).toHaveCount(0);
});

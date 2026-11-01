// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A typed name the registry does not list adds a private release without
// search (playbook-library-115–117): Add…'s Registry tab reads it as one
// row "<name> · not listed publicly" with a version and Add; the
// stand-in supplies only registry/identity IO.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeRelease } from "@sublang/spex-core/testing";
import { HOST_LOGIN, addPackages, expect, open, packageRow, packageSource, packagesSection, pickGroup, projectTab, signInCore, signInRegistryCore, selectRegistryCore, test } from "../src/harness";

test.use({ appOptions: { project: true, signedIn: true, host: { registry: true, second: { registry: true } } } });

test("playbook-library-117: install a private known package with explicit requirements and normal access", async ({ page, app }) => {
  test.setTimeout(180_000);
  const [, instance] = app.hosts;
  const [firstRegistry, registry] = app.registries;
  if (!instance || !firstRegistry || !registry) throw new Error("two instances and registries required");
  await signInCore(app, instance);
  const project = await pickGroup(app, { host: instance, namespace: true });
  await selectRegistryCore(app, instance.url, project.key);
  await signInRegistryCore(app, instance);
  const org = "private-notes";
  const name = `${org}/notes`;
  const refusedOrg = "private-refused";
  const refusedName = `${refusedOrg}/unreadable`;
  const skill = "---\nname: note-reader\ndescription: Read a supplied note\n---\nRead the note without changes.\n";
  async function release(namespace: string, pkg: string, version: string) {
    const path = `spex-packages/${namespace}/${pkg}`;
    const artifact = pkg === "notes" ? "note-reader" : "unreadable-reader";
    await makeRelease(join(app.projectDir, path), {
      format: 2, org: namespace, name: pkg, version, description: "Notes package", license: "MIT",
      artifacts: { [artifact]: { kind: "skill", language: "en" } },
    }, { [`skills/en/${artifact}/SKILL.md`]: skill.replaceAll("note-reader", artifact) });
    await app.core.command("environment.publish", { repository: project.key, name: `${namespace}/${pkg}` });
    await expect.poll(async () => {
      const state = await app.core.command("environment.get", { repository: project.key });
      return state.busy === null ? `${state.published?.name}@${state.published?.version}` : "busy";
    }).toBe(`${namespace}/${pkg}@${version}`);
  }
  for (const version of ["1.2.3", "1.2.4", "1.3.0"]) await release(org, "notes", version);
  await release(refusedOrg, "unreadable", "1.2.3");
  // A distinct exported name avoids an unrelated export-name collision.
  const publicPath = "spex-packages/public/notes";
  await makeRelease(join(app.projectDir, publicPath), {
    format: 2, org: "public", name: "notes", version: "1.0.0", description: "Public notes", license: "MIT",
    artifacts: { "public-reader": { kind: "skill", language: "en" } },
  }, { "skills/en/public-reader/SKILL.md": skill.replaceAll("note-reader", "public-reader") });
  await app.core.command("environment.publish", { repository: project.key, name: "public/notes" });
  await expect.poll(async () => (await app.core.command("environment.get", { repository: project.key })).published?.name).toBe("public/notes");
  registry.script.setPrivate(org, [instance.url]);
  registry.script.setPrivate(refusedOrg, []);
  registry.script.clearRequests();
  firstRegistry.script.clearRequests();

  await open(page, app);
  await projectTab(page, "Packages");
  // The project's packages, under the "Packages" heading of its
  // Packages tab, through its Add…'s Registry tab (playbook-library-92).
  const packages = await addPackages(packagesSection(page, "project"), "Registry");
  const query = packages.getByTestId("registry-query");
  await expect(query).toHaveAttribute("placeholder", "Search, or type org/name");
  // The private org lists nothing in public search.
  await query.fill(org);
  await expect(packages.getByTestId("registry-none")).toBeVisible();
  await expect(packages.getByTestId(`registry-result-${name}`)).toHaveCount(0);
  // A typed text that is no org/name reads as no row to add.
  const unlisted = packages.getByTestId("known-package-request");
  await query.fill("not-a-package");
  await expect(packages.getByTestId("registry-none")).toBeVisible();
  await expect(unlisted).toHaveCount(0);
  // The typed name the registry does not list reads as one row, "<name>
  // · not listed publicly", with a version and Add.
  await query.fill(name);
  await expect(unlisted).toContainText(`${name} · not listed publicly`);
  await expect(packages.getByTestId(`registry-result-${name}`)).toHaveCount(0);
  const submit = unlisted.getByTestId("known-package-request-submit");
  const versionField = unlisted.getByTestId("known-package-version");
  await expect(versionField).toHaveValue("");
  await expect(submit).toBeDisabled();
  const beforeInvalid = (await app.core.command("environment.get", { repository: project.key })).requests;
  for (const version of ["*", ">=1.2.3", "1.2"]) {
    await versionField.fill(version);
    await submit.click();
    await expect(submit).toBeEnabled();
    await expect(unlisted.getByTestId("known-package-request-error")).toContainText(/version/i);
  }
  expect((await app.core.command("environment.get", { repository: project.key })).requests).toEqual(beforeInvalid);
  // Each requirement keeps its meaning, the source glyph's tooltip
  // reading it (playbook-library-92).
  for (const [requirement, selected, range] of [["1.2.3", "1.2.3", "1.2.3 exactly"], ["^1.2.3", "1.3.0", "any 1.x"], ["~1.2.3", "1.2.4", "any 1.2.x"]]) {
    await addPackages(packages, "Registry");
    if ((await query.inputValue()) !== name) await query.fill(name);
    await expect(unlisted).toContainText(`${name} · not listed publicly`);
    // Add makes no search call of its own.
    const searches = registry.script.received.filter(({ path }) => path === "/api/v1/search").length;
    await unlisted.getByTestId("known-package-version").fill(`  ${requirement}  `);
    await unlisted.getByTestId("known-package-request-submit").click();
    await expect(packages.getByTestId("add-note")).toContainText(`Added ${name} ${selected} · 1 skill`);
    const row = packageRow(packages, name);
    await expect(row.getByTestId(`env-version-${name}`)).toHaveText(selected!);
    await expect(packageSource(row, name)).toHaveAttribute("title", `From the registry · ${range}`);
    await expect(row.getByTestId(`env-installed-${name}`)).toHaveText("Installed");
    expect(registry.script.received.filter(({ path }) => path === "/api/v1/search")).toHaveLength(searches);
    const state = await app.core.command("environment.get", { repository: project.key });
    expect(state.requests[name]).toEqual({ kind: "registry", version: requirement });
  }
  expect(readFileSync(join(app.projectDir, ".agents/skills/note-reader/SKILL.md"), "utf8")).toBe(skill);
  expect(firstRegistry.script.received.filter(({ path }) => path.includes(org))).toEqual([]);
  const reads = registry.script.received.filter(({ path }) => path.startsWith(`/api/v1/packages/${org}/`));
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every((request) => request.instance === instance.url && request.account === HOST_LOGIN && request.bearer)).toBe(true);

  // A registry access refusal shows in place and never reads as
  // installed (playbook-library-92).
  await addPackages(packages, "Registry");
  await query.fill(refusedName);
  await expect(unlisted).toContainText(`${refusedName} · not listed publicly`);
  await unlisted.getByTestId("known-package-version").fill("1.2.3");
  await unlisted.getByTestId("known-package-request-submit").click();
  await expect(packages.getByTestId("environment-error")).toContainText(refusedName);
  await expect(packages.getByTestId("environment-error")).toContainText(/not shared with you at .+ — ask its owner/);
  await expect(packageRow(packages, refusedName).getByTestId(`env-installed-${refusedName}`)).toHaveText(/^Not installed/);
  expect(registry.script.received.some((request) => request.path === `/api/v1/packages/${refusedName}` && request.instance === instance.url && request.account === HOST_LOGIN && request.bearer)).toBe(true);
  registry.script.setPrivate(refusedOrg, [instance.url]);
  // A public search result still adds from its own row, its versions
  // read as exact or caret requirements, and no not-listed row stands
  // for a name the registry lists.
  await addPackages(packages, "Registry");
  await query.fill("public/notes");
  const publicResult = packages.getByTestId("registry-result-public/notes");
  await expect(publicResult).toBeVisible();
  await expect(unlisted).toHaveCount(0);
  const versions = publicResult.getByTestId("registry-version-public/notes");
  await expect(versions).toContainText("1.0.0 exactly");
  await expect(versions).toContainText("1.0.0 and newer 1.x");
  await publicResult.getByTestId("registry-add-public/notes").click();
  await expect(packages.getByTestId("env-installed-public/notes")).toHaveText("Installed");
  const state = await app.core.command("environment.get", { repository: project.key });
  expect(state.requests["public/notes"]).toEqual({ kind: "registry", version: "^1.0.0" });

  // The Personal heading beneath holds an Add… of its own, carrying
  // nothing of the project's (playbook-library-92).
  const personal = packagesSection(page, "personal");
  await expect(personal.getByTestId("add-note")).toHaveCount(0);
  await addPackages(personal, "Registry");
  await expect(personal.getByTestId("registry-query")).toHaveValue("");
  await expect(personal.getByTestId("known-package-request")).toHaveCount(0);
  await expect(personal.getByTestId("known-package-request-error")).toHaveCount(0);
});

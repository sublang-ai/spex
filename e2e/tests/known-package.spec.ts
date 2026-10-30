// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A real environment request installs a private release without search
// (playbook-library-115–117); the stand-in supplies only registry/identity IO.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeRelease } from "@sublang/spex-core/testing";
import { HOST_LOGIN, expect, nav, open, pickGroup, signInCore, test } from "../src/harness";

test.use({ appOptions: { project: true, signedIn: true, host: { registry: true, second: { registry: true } } } });

test("playbook-library-117: install a private known package with explicit requirements and normal access", async ({ page, app }) => {
  test.setTimeout(180_000);
  const [, instance] = app.hosts;
  const [firstRegistry, registry] = app.registries;
  if (!instance || !firstRegistry || !registry) throw new Error("two instances and registries required");
  await signInCore(app, instance);
  const project = await pickGroup(app, { host: instance, namespace: true });
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
  await nav(page, "Playbooks").click();
  await page.getByTestId("add-from-registry").click();
  await page.getByTestId("registry-query").fill(org);
  await expect(page.getByTestId("registry-none")).toBeVisible();
  await expect(page.getByTestId(`registry-result-${name}`)).toHaveCount(0);
  // Clear the independent public-search field before direct submissions.
  await page.getByTestId("registry-query").fill("");
  await page.getByTestId("add-by-name").click();
  const form = page.getByTestId("known-package-request");
  const submit = form.getByTestId("known-package-request-submit");
  const nameField = form.getByTestId("known-package-name");
  const versionField = form.getByTestId("known-package-version");
  await expect(submit).toBeDisabled();
  await nameField.fill(name);
  await expect(submit).toBeDisabled();
  const beforeInvalid = (await app.core.command("environment.get", { repository: project.key })).requests;
  await nameField.fill("not-a-package");
  await versionField.fill("1.2.3");
  await submit.click();
  await expect(form.getByTestId("known-package-request-error")).toContainText("org/name");
  await nameField.fill(name);
  for (const version of ["*", ">=1.2.3", "1.2"]) {
    await versionField.fill(version);
    await submit.click();
    await expect(submit).toBeEnabled();
    await expect(form.getByTestId("known-package-request-error")).toContainText(/version/i);
  }
  expect((await app.core.command("environment.get", { repository: project.key })).requests).toEqual(beforeInvalid);
  const searches = registry.script.received.filter(({ path }) => path === "/api/v1/search");
  for (const [requirement, selected] of [["1.2.3", "1.2.3"], ["^1.2.3", "1.3.0"], ["~1.2.3", "1.2.4"]]) {
    await versionField.fill(`  ${requirement}  `);
    await submit.click();
    await expect(page.getByTestId("add-note")).toHaveText(`Requested ${name}`);
    const row = page.getByTestId(`env-package-${name}`);
    await expect(row.getByTestId(`env-source-${name}`)).toHaveText(`registry ${requirement}`);
    await expect(row.getByTestId(`env-version-${name}`)).toHaveText(selected!);
    await expect(row.getByTestId(`env-installed-${name}`)).toHaveText("Installed");
    const state = await app.core.command("environment.get", { repository: project.key });
    expect(state.requests[name]).toEqual({ kind: "registry", version: requirement });
  }
  expect(readFileSync(join(app.projectDir, ".agents/skills/note-reader/SKILL.md"), "utf8")).toBe(skill);
  expect(registry.script.received.filter(({ path }) => path === "/api/v1/search")).toEqual(searches);
  expect(firstRegistry.script.received.filter(({ path }) => path.includes(org))).toEqual([]);
  const reads = registry.script.received.filter(({ path }) => path.startsWith(`/api/v1/packages/${org}/`));
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every((request) => request.instance === instance.url && request.account === HOST_LOGIN && request.bearer)).toBe(true);

  await nameField.fill(refusedName);
  await versionField.fill("1.2.3");
  await submit.click();
  await expect(page.getByTestId("environment-error")).toContainText(refusedName);
  await expect(page.getByTestId("environment-error")).toContainText(/may not fetch|forbidden/i);
  await expect(page.getByTestId(`env-installed-${refusedName}`)).toHaveCount(0);
  expect(registry.script.received.some((request) => request.path === `/api/v1/packages/${refusedName}` && request.instance === instance.url && request.account === HOST_LOGIN && request.bearer)).toBe(true);
  registry.script.setPrivate(refusedOrg, [instance.url]);
  await page.getByTestId("registry-query").fill("public/notes");
  const publicResult = page.getByTestId("registry-result-public/notes");
  await expect(publicResult).toBeVisible();
  await publicResult.getByTestId("registry-add-public/notes").click();
  await expect(page.getByTestId("env-installed-public/notes")).toHaveText("Installed");
  const state = await app.core.command("environment.get", { repository: project.key });
  expect(state.requests["public/notes"]).toEqual({ kind: "registry", version: "^1.0.0" });

  await page.getByTestId("side-own").click();
  await expect(page.getByTestId("add-note")).toHaveCount(0);
  await page.getByTestId("add-from-registry").click();
  await page.getByTestId("add-by-name").click();
  await expect(page.getByTestId("known-package-name")).toHaveValue("");
  await expect(page.getByTestId("known-package-version")).toHaveValue("");
  await expect(page.getByTestId("known-package-request-error")).toHaveCount(0);
});

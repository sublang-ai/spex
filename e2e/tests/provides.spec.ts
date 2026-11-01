// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What a package provides, placed where it goes (playbook-library-94,
// spec-view-67, DR-174): the stand-in registry serves a handbook whose
// spec cites a glossary it requires and a style guide by address, a
// skill its spec requires standing as that spec's support. Added
// through the project's Add…, the handbook's row counts and lists only
// what it provides, its spec line reads where the copy stands under the
// scaffolded specs/ with the links that wait for the style guide and
// their Add, which requests it; the Specs tab reads the placed copy with
// its provenance in Edit's place; the line follows the copy hand-edited,
// a project file of a package's name and a folder without specs/; and
// under "Personal" the spec reads placed as a skill.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { publishRelease, RegistryClient } from "@sublang/spex/environment";
import { makeRelease } from "@sublang/spex-core/testing";
import type { Locator } from "@playwright/test";

import { addPackages, expect, open, packageRow, packagesSection, projectTab, test } from "../src/harness";

// The public registry the environments name answers as the stand-in.
test.use({ appOptions: { project: true, host: { registry: true }, independentRegistry: true } });

/** The spec packages the stand-in serves (environments-1): the handbook
 * requiring the glossary, the style guide its spec cites alone, and one
 * named as a spec of the demo project's own. */
const HANDBOOK = "acme/handbook";
const GLOSSARY = "acme/glossary";
const STYLE = "acme/style";
const SERVICES = "acme/platform-services";

/** A spec as a release holds it: its sections, items and citations. */
function spec(pkg: string, title: string, intent: string, behaviors: string[], verification: string): string {
  const items = behaviors.map((behavior, index) => `### ${pkg}-${index + 1}\n\n${behavior}\n`).join("\n");
  return `# ${pkg}: ${title}\n\n## Intent\n\n${intent}\n\n## External Behavior\n\n${items}\n## Verification\n\n### ${pkg}-${behaviors.length + 1}\n\n${verification}\n`;
}

const HANDBOOK_SPEC = spec("handbook", "Handbook", "The house rules a project's pages follow.", [
  "A page shall use the glossary's terms [[glossary-1](spex:acme/glossary#glossary-1)].",
  "A page shall keep the house style [[style-1](spex:acme/style#style-1)] [[style-2](spex:acme/style#style-2)].",
], "When a reviewer reads a page, the review shall check its terms [[handbook-1](#handbook-1)] and its style [[handbook-2](#handbook-2)].");

const GLOSSARY_SPEC = spec("glossary", "Glossary", "The terms a project's pages use.", [
  "A page shall use each term in the one sense this glossary gives it.",
], "When a reviewer reads a page, the review shall flag a term used in another sense [[glossary-1](#glossary-1)].");

const STYLE_SPEC = spec("style", "Style", "How a project's pages read.", [
  "A page shall keep one sentence per line.",
  "A page shall address its reader as you.",
], "When a reviewer reads a page, the review shall flag two sentences on a line [[style-1](#style-1)] and a reader addressed otherwise [[style-2](#style-2)].");

const SERVICES_SPEC = spec("platform-services", "Platform Services", "The services a platform offers.", [
  "The platform shall answer each request.",
], "When a client sends a request, the test suite shall assert its answer [[platform-services-1](#platform-services-1)].");

/** A package row's expanded lines (playbook-library-92), opening its
 * disclosure unless it stands open. */
async function linesOf(section: Locator, name: string): Promise<Locator> {
  const disclosure = packageRow(section, name).getByRole("button", { name: `What ${name} provides` });
  if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  return packageRow(section, name).getByTestId(`env-artifacts-${name}`);
}

/** A package's spec line in its expanded row (playbook-library-92). */
async function specLine(section: Locator, name: string, pkg: string): Promise<Locator> {
  return (await linesOf(section, name)).getByTestId(`env-artifact-${name}-${pkg}`);
}

test("playbook-library-94, spec-view-67: a provided spec is placed in specs/, its line says where it stands, and the Specs tab reads it read-only", async ({ page, app }) => {
  test.setTimeout(90_000);
  const registry = app.registry;
  if (!registry) throw new Error("a stand-in registry is required");
  const client = new RegistryClient({ url: registry.url });
  const release = async (pkg: string, manifest: Record<string, unknown>, files: Record<string, string>): Promise<void> => {
    const dir = await makeRelease(join(app.home, "releases", pkg), {
      format: 2, org: "acme", name: pkg, version: "1.0.0", license: "Apache-2.0", ...manifest,
    }, files);
    await publishRelease(client, dir);
  };
  // A skill the handbook's spec requires is that spec's support, whatever
  // `provides` lists (environments-1).
  await release("handbook", {
    description: "The house rules for a project's pages",
    dependencies: { [GLOSSARY]: "^1.0.0" },
    provides: ["spec", "skill"],
    artifacts: {
      handbook: { kind: "spec", language: "en", requires: ["handbook-checks"] },
      "handbook-checks": { kind: "skill", language: "en" },
    },
  }, {
    "specs/en/handbook.md": HANDBOOK_SPEC,
    "skills/en/handbook-checks/SKILL.md": "---\nname: handbook-checks\ndescription: Check a page against the handbook\n---\nCheck the page against each handbook item.\n",
  });
  await release("glossary", {
    description: "The terms a project's pages use",
    provides: ["spec"],
    artifacts: { glossary: { kind: "spec", language: "en" } },
  }, { "specs/en/glossary.md": GLOSSARY_SPEC });
  await release("style", {
    description: "How a project's pages read",
    artifacts: { style: { kind: "spec", language: "en" } },
  }, { "specs/en/style.md": STYLE_SPEC });
  await release("platform-services", {
    description: "The services a platform offers",
    artifacts: { "platform-services": { kind: "spec", language: "en" } },
  }, { "specs/en/platform-services.md": SERVICES_SPEC });
  // Your own group's environment requests the handbook beside the
  // built-in spec package (arranged over the protocol).
  await app.core.command("environment.request", { repository: app.ownKey, name: HANDBOOK, request: { kind: "registry", version: "^1.0.0" }, wait: true });
  // The demo project's own spec of the name a package's spec takes.
  const servicesPath = join(app.projectDir, "specs", "packages", "platform-services.md");
  const ownServices = readFileSync(servicesPath, "utf8");

  await open(page, app);
  await projectTab(page, "Packages");
  // Added through Add…'s Registry tab under the scaffolded specs/, the
  // receipt and the row count only what the handbook provides, its
  // spec, the skill its spec requires uncounted (playbook-library-92).
  const packages = await addPackages(packagesSection(page, "project"), "Registry");
  await packages.getByTestId("registry-query").fill("handbook");
  const result = packages.getByTestId(`registry-result-${HANDBOOK}`);
  await expect(result).toBeVisible();
  await result.getByTestId(`registry-add-${HANDBOOK}`).click();
  await expect(packages.getByTestId("add-note")).toHaveText(`Added ${HANDBOOK} 1.0.0 · 1 spec`, { timeout: 30_000 });
  const handbook = packageRow(packages, HANDBOOK);
  await expect(handbook.getByTestId(`env-installed-${HANDBOOK}`)).toHaveText("Installed");
  await expect(handbook.getByTestId(`env-provides-${HANDBOOK}`)).toHaveText("1 spec");
  await expect(packageRow(packages, GLOSSARY).getByTestId(`env-provides-${GLOSSARY}`)).toHaveText("1 spec");
  // Expanded, the row lists its provided spec alone, the support skill
  // unlisted; the spec's line reads where the copy stands in specs/,
  // the glossary's links resolved there and the style guide's two
  // waiting with one Add (playbook-library-92).
  const lines = await linesOf(packages, HANDBOOK);
  await expect(lines.getByTestId(`env-artifact-${HANDBOOK}-handbook`)).toHaveText("spec · in specs/packages/handbook.md");
  await expect(lines.getByTestId(`env-skills-placed-${HANDBOOK}`)).toHaveCount(0);
  await expect(lines.getByTestId(`env-skills-unplaced-${HANDBOOK}`)).toHaveCount(0);
  await expect(lines).not.toContainText("handbook-checks");
  await expect(lines.getByTestId(`env-waiting-${HANDBOOK}-${GLOSSARY}`)).toHaveCount(0);
  const waiting = lines.getByTestId(`env-waiting-${HANDBOOK}-${STYLE}`);
  await expect(waiting).toContainText(`2 links wait for ${STYLE}`);
  await expect(await specLine(packages, GLOSSARY, "glossary")).toHaveText("spec · in specs/packages/glossary.md");
  const placed = join(app.projectDir, "specs", "packages", "handbook.md");
  expect(readFileSync(placed, "utf8")).toMatch(/^<!-- Placed by Spex from acme\/handbook 1\.0\.0; an edit makes this file yours\. -->\n\n# handbook: Handbook\n/);
  expect(readFileSync(placed, "utf8")).toContain("[[glossary-1](glossary.md#glossary-1)]");
  // Add requests the package the links wait for, as Add… does, its
  // receipt following; once its spec stands, the links appear and the
  // line is gone (playbook-library-92).
  const add = waiting.getByTestId(`env-waiting-add-${HANDBOOK}-${STYLE}`);
  await expect(add).toHaveText("Add");
  await add.click();
  await expect(packages.getByTestId("add-note")).toHaveText(`Added ${STYLE} 1.0.0 · 1 spec`, { timeout: 30_000 });
  await expect(packageRow(packages, STYLE).getByTestId(`env-installed-${STYLE}`)).toHaveText("Installed");
  await expect(waiting).toHaveCount(0);
  expect((await app.core.command("environment.get", { repository: app.projectId! })).requests[STYLE]).toEqual({ kind: "registry", version: "^1.0.0" });
  expect(readFileSync(placed, "utf8")).toContain("[[style-1](style.md#style-1)] [[style-2](style.md#style-2)]");

  // The Specs tab reads the placed copy: its node offers no Edit, its
  // provenance standing in the control's place with its tooltip, its
  // items offering none, and nothing opens the editor on it, while a
  // file of the project's own keeps its controls and opens the editor
  // (spec-view-2, spec-view-3, spec-view-48).
  await page.getByRole("tab", { name: "Specs" }).click();
  await page.getByTestId("file-toggle-handbook").click();
  const provenance = page.getByTestId("file-placed-handbook");
  await expect(provenance).toHaveText(`From ${HANDBOOK} 1.0.0 · placed by Spex`);
  await expect(provenance).toHaveAttribute("title", `Written by Spex from ${HANDBOOK} 1.0.0 — an edit makes it yours`);
  await expect(page.getByTestId("file-edit-handbook")).toHaveCount(0);
  await expect(page.getByTestId("items-head-handbook").getByRole("button")).toHaveCount(1);
  await page.getByTestId("item-toggle-handbook-1").click();
  await expect(page.getByTestId("item-toggle-handbook-1")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("item-edit-handbook-1")).toHaveCount(0);
  await provenance.click();
  await expect(page.getByTestId("spec-editor")).toHaveCount(0);
  await page.getByTestId("file-toggle-admin-bootstrap").click();
  await expect(page.getByTestId("file-placed-admin-bootstrap")).toHaveCount(0);
  await page.getByTestId("item-toggle-admin-bootstrap-1").click();
  await expect(page.getByTestId("item-edit-admin-bootstrap-1")).toHaveCount(1);
  await page.getByTestId("file-edit-admin-bootstrap").click();
  await expect(page.getByTestId("spec-editor")).toBeVisible();
  await page.getByTestId("editor-cancel").click();
  await expect(page.getByTestId("spec-editor")).toHaveCount(0);

  // Hand-edited, the copy is the project's own, and the tab, read
  // again, says it is left as yours (playbook-library-92).
  writeFileSync(placed, `${readFileSync(placed, "utf8")}\nA house note of our own.\n`);
  await projectTab(page, "Playbooks");
  await projectTab(page, "Packages");
  await expect(await specLine(packages, HANDBOOK, "handbook")).toHaveText("spec · edited in specs/ — left as yours");

  // A package whose spec takes the name of a project file is not placed
  // over it (playbook-library-92).
  await app.core.command("environment.request", { repository: app.projectId!, name: SERVICES, request: { kind: "registry", version: "^1.0.0" }, wait: true });
  await expect(packageRow(packages, SERVICES).getByTestId(`env-installed-${SERVICES}`)).toHaveText("Installed", { timeout: 30_000 });
  await expect(await specLine(packages, SERVICES, "platform-services")).toHaveText("spec · not placed — specs/ holds platform-services.md already");
  expect(readFileSync(servicesPath, "utf8")).toBe(ownServices);

  // In a working folder without specs/, the line asks for it to be
  // scaffolded (playbook-library-92).
  renameSync(join(app.projectDir, "specs"), join(app.projectDir, "specs-aside"));
  await projectTab(page, "Playbooks");
  await projectTab(page, "Packages");
  await expect(await specLine(packages, HANDBOOK, "handbook")).toHaveText("spec · needs specs/ — scaffold first");

  // Under "Personal", whose root holds no specs/, the spec is placed as a
  // skill, its row counting it alone and listing no waiting links
  // (playbook-library-92).
  const personal = packagesSection(page, "personal");
  await expect(packageRow(personal, HANDBOOK).getByTestId(`env-provides-${HANDBOOK}`)).toHaveText("1 spec");
  const personalLines = await linesOf(personal, HANDBOOK);
  await expect(personalLines.getByTestId(`env-artifact-${HANDBOOK}-handbook`)).toHaveText("spec · placed as a skill");
  await expect(personalLines.getByTestId(`env-waiting-${HANDBOOK}-${STYLE}`)).toHaveCount(0);
  await expect(personalLines).not.toContainText("handbook-checks");
});

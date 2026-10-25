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
// playbook; the first home, signed out of the second alone, offers
// "Sign in to publish at <name>" instead, naming the second.

import type { Page } from "@playwright/test";
import { AUTHORING_SOURCE } from "@sublang/spex-core/testing";

import {
  HOST_LOGIN,
  SECOND_HOST_NAME,
  expect,
  instanceSection,
  nav,
  open,
  pickGroup,
  signInCore,
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

/** Open the authoring session's Enable tab (playbook-library-61). */
async function openEnableTab(page: Page): Promise<void> {
  await nav(page, "Playbooks").click();
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

test("playbook-library-95: Publish from a project at the second instance reads the version with its link to the second's registry, the first's holding no such release; a home signed in to the second alone installs and enables it; the first home, signed out of the second alone, is asked to sign in there", async ({
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
  expect(project.instance).toBe(second.url);
  await arrangeEnabled(app);
  await open(page, app);
  await openEnableTab(page);

  // Publish shows the package, its version and the files it would
  // upload inline, then uploads them; the published version reads with
  // a link to its page at the second's registry, which holds the
  // release, uploaded as the account there, while the first's holds
  // none (playbook-library-93).
  const publish = page.getByTestId("publish");
  await publish.getByTestId("publish-button").click();
  const summary = publish.getByTestId("publish-summary");
  await expect(summary).toContainText(`${PACKAGE} 0.1.0`);
  await expect(summary.getByTestId("publish-files")).toContainText("meta.yaml");
  await expect(summary.getByTestId("publish-files")).toContainText(`playbooks/en/${ID}/${ID}.md`);
  await expect(summary.getByRole("button", { name: "Cancel" })).toBeVisible();
  await summary.getByTestId("publish-confirm").click();
  const done = publish.getByTestId("publish-done");
  await expect(done).toContainText(`Published ${PACKAGE} 0.1.0`, { timeout: 30_000 });
  await expect(done.getByTestId("publish-link")).toHaveAttribute("href", `${second.url}/${PACKAGE}`);
  expect((await fetch(`${secondRegistry.url}/api/v1/packages/${PACKAGE}/0.1.0`)).status).toBe(200);
  expect(secondRegistry.script.received.filter((request) => request.method === "PUT")).toEqual([
    { method: "PUT", path: `/api/v1/packages/${PACKAGE}/0.1.0`, instance: second.url, account: HOST_LOGIN, bearer: true },
  ]);
  expect((await fetch(`${firstRegistry.url}/api/v1/packages/${PACKAGE}/0.1.0`)).status).toBe(404);
  expect(firstRegistry.script.received.filter((request) => request.method === "PUT")).toEqual([]);

  // A second scratch home signed in to the second instance alone finds
  // it by search, Add requests it, and its playbook lists from the
  // registry source and enables (playbook-library-92,
  // playbook-library-34).
  const other = await startApp({ project: true, host: { share: { host: second, registry: secondRegistry } }, signedIn: true });
  try {
    const listed = (await other.core.command("space.get", {})).instances;
    expect(listed.map((instance) => [instance.origin, instance.signedIn])).toEqual([[second.url, true]]);
    await open(page, other);
    await nav(page, "Playbooks").click();
    await expect(page.getByTestId("side-project")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("add-from-registry").click();
    await page.getByTestId("registry-query").fill(ID);
    const result = page.getByTestId(`registry-result-${PACKAGE}`);
    await expect(result).toBeVisible();
    await expect(result.getByTestId(`registry-version-${PACKAGE}`)).toHaveValue("0.1.0");
    await result.getByTestId(`registry-add-${PACKAGE}`).click();
    await expect(page.getByTestId("add-note")).toHaveText(`Requested ${PACKAGE}`);
    const requested = page.getByTestId("environment-section").getByTestId(`env-package-${PACKAGE}`);
    await expect(requested.getByTestId(`env-version-${PACKAGE}`)).toHaveText("0.1.0", { timeout: 30_000 });
    await expect(requested.getByTestId(`env-source-${PACKAGE}`)).toHaveText("registry ^0.1.0");
    await expect(requested.getByTestId(`env-installed-${PACKAGE}`)).toHaveText("Installed");
    const card = page.getByTestId("playbooks-available").getByTestId(`playbook-card-${ID}`);
    await expect(card).toContainText(`/${ID}`);
    await expect(card.getByTestId(`playbook-from-${ID}`)).toHaveText(new RegExp(`^from\\s*${PACKAGE} 0\\.1\\.0$`));
    await card.getByTestId(`playbook-enable-${ID}`).click();
    const enabled = page.getByTestId("playbooks-enabled").getByTestId(`playbook-card-${ID}`);
    await expect(enabled.getByTestId(`playbook-enabled-${ID}`)).toHaveText("Enabled in the project");
    await expect.poll(() => other.readProjectConfig()).toContain(`${ID}:`);
  } finally {
    await other.close();
  }

  // Signed out of the second alone, the first instance still signed in
  // and the default, the first home shows "Sign in to publish at
  // <name>" with the second's display name in the control's place
  // (playbook-library-93).
  await open(page, app);
  await nav(page, "Space").click();
  const secondSection = instanceSection(page, second);
  await secondSection.getByTestId("space-signout").click();
  await expect(secondSection.getByTestId("space-signin-again")).toHaveText("Sign in again");
  await expect(instanceSection(page, first).getByTestId("space-account")).toContainText(`Signed in as @${HOST_LOGIN}`);
  await openEnableTab(page);
  await expect(page.getByTestId("publish").getByTestId("publish-signin")).toHaveText(`Sign in to publish at ${SECOND_HOST_NAME}`);
  await expect(page.getByTestId("publish-button")).toHaveCount(0);
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Publishing and installing elsewhere (playbook-library-95, DR-104):
// a home signed in at the stand-in Git host, which fronts the stand-in
// registry at its own origin as spex.pub serves both, holds a compiled
// authoring session enabled in its project; Publish uploads its spec
// package under development, and a second scratch home on the same
// host finds it by search, requests it, and enables its playbook; the
// first home, signed out, offers "Sign in to publish" instead.

import type { Page } from "@playwright/test";
import { AUTHORING_SOURCE } from "@sublang/spex-core/testing";

import {
  HOST_LOGIN,
  expect,
  nav,
  open,
  startApp,
  test,
  type App,
} from "../src/harness";

/** The authoring session's playbook, its spec package named after the
 * signed-in account (playbook-library-70). */
const ID = "triage";
const PACKAGE = `${HOST_LOGIN}/${ID}`;

/** A compiled authoring session enabled in the project, arranged over
 * the protocol (playbook-library-7): created, its source written,
 * compiled by the passing stub `slc`, and enabled with a roster player
 * per role. */
async function arrangeEnabled(app: App): Promise<void> {
  const projectId = app.projectId!;
  const { instance } = await app.core.command("draft.create", { projectId, draftId: ID });
  await app.core.command("draft.source.write", {
    projectId,
    draftId: ID,
    instance,
    content: AUTHORING_SOURCE.replaceAll("<id>", ID),
  });
  await app.core.command("draft.compile", { projectId, draftId: ID, instance });
  await expect
    .poll(async () => (await app.core.command("draft.list", {})).find((draft) => draft.id === ID)?.state, {
      timeout: 60_000,
    })
    .toBe("compiled");
  await app.core.command("draft.register", {
    projectId,
    draftId: ID,
    instance,
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
    host: { registry: true },
    signedIn: true,
    authoring: { slc: "ok", phaseDelayMs: 50, script: { fallback: { deltas: ["Compiled."], result: "Compiled." } } },
  },
});

test("playbook-library-95: Publish reads the version with its link, a second home installs and enables it, a signed-out home is asked to sign in", async ({
  page,
  app,
}) => {
  test.setTimeout(180_000);
  const host = app.host!;
  const registry = app.registry!;
  await arrangeEnabled(app);
  await open(page, app);
  await openEnableTab(page);

  // Publish shows the package, its version and the files it would
  // upload inline, then uploads them; the published version reads with
  // a link to its page at the registry (playbook-library-93).
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
  await expect(done.getByTestId("publish-link")).toHaveAttribute("href", `${host.url}/${PACKAGE}`);
  // The registry holds the release.
  expect((await fetch(`${registry.url}/api/v1/packages/${PACKAGE}/0.1.0`)).status).toBe(200);

  // A second scratch home on the same host finds it by search, Add
  // requests it, and its playbook lists from the registry source and
  // enables (playbook-library-92, playbook-library-34).
  const second = await startApp({ project: true, host: { share: { host, registry } } });
  try {
    await open(page, second);
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
    await expect.poll(() => second.readProjectConfig()).toContain(`${ID}:`);
  } finally {
    await second.close();
  }

  // Signed out, the first home shows "Sign in to publish" in the
  // control's place (playbook-library-93).
  await open(page, app);
  await nav(page, "Groups").click();
  await page.getByTestId("space-header").getByTestId("space-signout").click();
  await expect(page.getByTestId("space-header").getByTestId("space-account")).toContainText("Not signed in");
  await openEnableTab(page);
  await expect(page.getByTestId("publish").getByTestId("publish-signin")).toHaveText("Sign in to publish");
  await expect(page.getByTestId("publish-button")).toHaveCount(0);
});

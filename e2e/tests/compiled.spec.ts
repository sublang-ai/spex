// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A compiled playbook runs in CI (playbook-library-87, DR-089): the
// app's own example as the real `slc` compiled it — the committed
// fixture under e2e/fixtures/compiled/, captured by the regression's
// live journey (playbook-library-86) — is placed by a stub `slc`,
// packaged by the app as any compile is, enabled on the Enable
// tab's defaults, and run by the real Captain shell to a finished turn
// on substitute agents. A stub-compiled machine would prove nothing of
// the run path (DR-086), so without a captured fixture the journey
// skips, naming the capture; a fixture of another engine generation
// fails it.

import { COMPILED_RUN } from "@sublang/spex-core/testing";
import { parse } from "yaml";

import {
  test,
  expect,
  open,
  nav,
  send,
  EXAMPLE_ID,
  assertFixtureGeneration,
  commitCount,
  compiledFixture,
  expectEngaged,
  surfaceEntry,
} from "../src/harness";

const fixture = compiledFixture();

test.describe("the compiled example", () => {
  test.skip(
    !fixture,
    "no compiled fixture yet: the regression's playbook-library-86 captures it (e2e/fixtures/compiled/README.md)",
  );
  test.use({
    appOptions: {
      project: true,
      compiled: true,
      authoring: { slc: "fixture", phaseDelayMs: 50 },
    },
  });

  test("playbook-library-87: the example as slc compiled it enables and runs to its finish", async ({
    page,
    app,
  }) => {
    await assertFixtureGeneration(fixture!.capture);
    await open(page, app);
    await nav(page, "Playbooks").click();
    await page.getByTestId("example-prefill").click();
    await expect(page.getByTestId("authoring-workspace")).toBeVisible();
    await page.getByTestId("paste-use").click();
    await expect(page.getByTestId("source-markdown")).toContainText("Two-Agent Change-and-Review Workflow");

    // The stub places the fixture; the app packages it as any compile.
    await page.getByTestId("compile-button").click();
    const band = page.getByTestId("compile-band");
    await expect(band).not.toHaveAttribute("data-outcome", "running", { timeout: 60_000 });
    await expect(band, await band.innerText()).toHaveAttribute("data-outcome", "ok");
    await expect(page.getByTestId("draft-chip")).toContainText("Compiled");
    await expect(page.getByTestId("compile-roles")).toHaveText(/^roles: coder, reviewer$/i);
    await expect(page.getByTestId("draft-working")).toHaveCount(0);

    // Enabled on the Enable tab's defaults: nothing typed or chosen.
    const tabs = page.getByRole("tablist", { name: "Draft artifacts" });
    await tabs.getByRole("tab", { name: "Enable", exact: true }).click();
    await expect(page.getByTestId("register-form")).toContainText("Prefilled from the source and the compiled roles");
    await page.getByTestId("register-submit").click();
    // The surface lists it among the enabled playbooks (playbook-library-10),
    // its spec package requested by path in the project's environment.
    const card = page.getByTestId("playbooks-enabled").getByTestId(`playbook-card-${EXAMPLE_ID}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText(`/${EXAMPLE_ID}`);
    const config = parse(app.readProjectConfig()) as { playbooks: Record<string, { roles: Record<string, string> }> };
    expect(Object.keys(config.playbooks[EXAMPLE_ID].roles)).toHaveLength(2);

    // A new session's turn runs the fixture's machine, through the
    // registry module wrapping its entry, to its finish with both role
    // players engaged and the coder's commit made (playbook-library-14).
    const commits = commitCount(app.projectDir);
    await surfaceEntry(page, "Workspace").click();
    await send(page, `/${EXAMPLE_ID} ${COMPILED_RUN.task}`);
    const captain = page.getByTestId("captain-pane");
    await expect(captain).toContainText(`/${EXAMPLE_ID} started`);
    await expect(captain).toContainText(`/${EXAMPLE_ID} finished`, { timeout: 60_000 });
    await expect(captain).toContainText(COMPILED_RUN.closing);
    await expect(captain).not.toContainText(/turn failed/i);
    await expectEngaged(page, "dev.coder");
    await expectEngaged(page, "dev.reviewer");
    await expect(page.getByTestId("player-pane-dev.coder")).toContainText(COMPILED_RUN.done);
    await expect(page.getByTestId("player-pane-dev.reviewer")).toContainText(COMPILED_RUN.review);
    expect(commitCount(app.projectDir)).toBe(commits + 1);
  });
});

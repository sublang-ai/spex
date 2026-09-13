// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Accessibility as a journey (run-view-102): every surface scanned by
// axe-core at WCAG 2.1 AA, in both themes; serious and critical
// violations fail the run. The authoring workspace is scanned in each
// of its states (playbook-library-77): empty, paste mode, a turn with
// the source appearing, compiling, failed, compiled with each tab,
// the editor, and the agent picker.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { test, expect, open, nav, send, slowAuthoringScript } from "../src/harness";

test.use({
  appOptions: {
    project: true,
    // The failing-then-passing stub, with the replies and phases held
    // long enough for a scan inside each state.
    authoring: { script: slowAuthoringScript(4000), slc: "fail:gears2fsm", phaseDelayMs: 1200 },
  },
});

async function scan(page: Page, surface: string): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${surface}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? "" : "s"}; e.g. ${v.nodes[0]?.target.join(" ")} :: ${v.nodes[0]?.html.slice(0, 160)})`,
    );
}

for (const theme of ["light", "dark"] as const) {
  test(`run-view-102: no serious or critical violation on any surface (${theme})`, async ({
    page,
    app,
  }) => {
    test.setTimeout(150_000);
    await page.emulateMedia({ colorScheme: theme });
    await open(page, app);
    const found: string[] = [];

    found.push(...(await scan(page, "Captain home")));

    await send(page, "Fix the token refresh in auth.ts");
    await expect(page.getByTestId("captain-pane")).toContainText("/code finished");
    found.push(...(await scan(page, "Session")));

    await nav(page, "Dashboard").click();
    await expect(page.getByTestId(`project-group-${app.projectId}`)).toBeVisible();
    found.push(...(await scan(page, "Dashboard")));

    await nav(page, "Projects").click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByTestId("overview-tab")).toBeVisible();
    found.push(...(await scan(page, "Overview")));

    await page.getByRole("tab", { name: "Specs" }).click();
    await expect(page.getByTestId("specv-live")).toBeVisible();
    found.push(...(await scan(page, "Specs")));

    await nav(page, "Playbooks").click();
    await expect(page.getByTestId("builtins-section")).toBeVisible();
    found.push(...(await scan(page, "Playbooks")));

    // The authoring workspace, state by state (DR-058).
    const idField = page.getByTestId("new-playbook-id");
    await idField.fill("triage");
    await idField.press("Enter");
    await expect(page.getByTestId("authoring-workspace")).toBeVisible();
    found.push(...(await scan(page, "Workspace (no source)")));
    await page.getByRole("button", { name: "Paste", exact: true }).click();
    await expect(page.getByTestId("paste-text")).toBeVisible();
    found.push(...(await scan(page, "Workspace (paste mode)")));
    await page.getByTestId("paste-cancel").click();
    await page.getByTestId("draft-composer").fill("I want a playbook that triages new issues into labels.");
    await page.getByTestId("draft-send").click();
    await expect(page.getByTestId("source-markdown")).toContainText("Triager");
    await expect(page.getByTestId("draft-working")).toBeVisible();
    found.push(...(await scan(page, "Workspace (turn running, source appearing)")));
    const band = page.getByTestId("compile-band");
    await expect(band).toHaveAttribute("data-outcome", "running");
    found.push(...(await scan(page, "Workspace (compiling)")));
    await expect(band).toHaveAttribute("data-outcome", "failed");
    await expect(page.getByTestId("compile-output")).toBeVisible();
    found.push(...(await scan(page, "Workspace (failed)")));
    await expect(
      page.locator('[data-testid="directive-card"][data-kind="register"]'),
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("draft-chip")).toContainText("Compiled");
    await expect(page.getByTestId("draft-working")).toHaveCount(0);
    found.push(...(await scan(page, "Workspace (compiled)")));
    const tabs = page.getByRole("tablist", { name: "Draft artifacts" });
    await tabs.getByRole("tab", { name: "Gears", exact: true }).click();
    await expect(page.getByTestId("item-toggle-triage-1")).toBeVisible();
    found.push(...(await scan(page, "Workspace (Gears)")));
    await tabs.getByRole("tab", { name: "Machine", exact: true }).click();
    await expect(page.getByTestId("stage-states-draft-triage")).toBeVisible();
    found.push(...(await scan(page, "Workspace (Machine)")));
    await tabs.getByRole("tab", { name: "Register", exact: true }).click();
    await expect(page.getByTestId("register-form")).toBeVisible();
    found.push(...(await scan(page, "Workspace (Register)")));
    await tabs.getByRole("tab", { name: "Source", exact: true }).click();
    await page.getByTestId("source-edit").click();
    await expect(page.getByTestId("spec-editor")).toBeVisible();
    found.push(...(await scan(page, "Workspace (editing)")));
    await page.getByTestId("editor-cancel").click();
    await page.getByTestId("draft-agent").click();
    await expect(page.getByTestId("agent-picker")).toBeVisible();
    found.push(...(await scan(page, "Workspace (agent picker)")));
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("agent-picker")).toHaveCount(0);
    await page.getByTestId("workspace-back").click();
    await expect(page.getByTestId("drafts-section")).toBeVisible();
    found.push(...(await scan(page, "Playbooks (with a draft)")));

    // Space before its home is a repository: the setup card stands
    // (space-3); the picker and the tree are scanned by space-44.
    await nav(page, "Space").click();
    await expect(page.getByTestId("space-setup")).toBeVisible();
    found.push(...(await scan(page, "Space")));

    await nav(page, "Settings").click();
    await expect(page.getByTestId("captain-section")).toBeVisible();
    // The Captain's editor opens in place; scan the surface with it
    // standing, so the shared editor's controls are covered too.
    await page.getByTestId("captain-edit").click();
    await expect(page.getByTestId("agent-editor")).toBeVisible();
    found.push(...(await scan(page, "Settings")));

    expect(found, found.join("\n")).toEqual([]);
  });
}

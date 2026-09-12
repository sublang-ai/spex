// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A playbook authored through the page (playbook-library-77, DR-058):
// the served shell with the authoring fake script and a stub `slc` on
// the toolchain path — failing once at gears2fsm, then passing — worked
// from "New playbook" to a registered `/triage`, with the workspace
// measured stacked at the 320px floor along the way.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { AUTHORING_SOURCE } from "@sublang/spex-core/testing";

import { test, expect, open, nav, slowAuthoringScript } from "../src/harness";

test.use({
  appOptions: {
    project: true,
    authoring: { script: slowAuthoringScript(2500), slc: "fail:gears2fsm" },
  },
});

/** The source the relay turn writes, which the passing compile reads
 * (`AUTHORING_SOURCE` with the fake's fix, named for the draft). */
const FIXED_SOURCE = AUTHORING_SOURCE.replace(
  "- `labeled`: the labels were applied.",
  "- `labeled`: every proposed label was applied.",
).replaceAll("<id>", "triage");

const FIRST_MESSAGE = "I want a playbook that triages new issues into labels.";
const QUEUED_MESSAGE = "Also make the Verifier cite the label definitions.";

/** The accessible names of the workspace's buttons, in document order. */
async function workspaceNames(page: Page): Promise<string[]> {
  return page.getByTestId("authoring-workspace").evaluate((root) =>
    Array.from(root.querySelectorAll("button")).map((button) => {
      const label = button.getAttribute("aria-label");
      const text = (button.textContent ?? "").trim().replace(/\s+/g, " ");
      return label ?? (text || (button.getAttribute("title") ?? ""));
    }),
  );
}

/** Whether the page scrolls in either direction. */
async function pageScrolls(page: Page): Promise<{ x: boolean; y: boolean }> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      x: root.scrollWidth > root.clientWidth + 1,
      y: root.scrollHeight > root.clientHeight + 1,
    };
  });
}

test("playbook-library-77: a new playbook is authored, compiled, and registered through the page", async ({
  page,
  app,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, app);
  await nav(page, "Playbooks").click();
  await expect(page.getByTestId("builtins-section")).toBeVisible();

  // ── New playbook: the id inline, `Triage` refused naming the rule,
  //    `triage` opened as the workspace (playbook-library-51/52/54).
  await expect(page.getByTestId("drafts-section")).toHaveCount(0);
  const idField = page.getByTestId("new-playbook-id");
  await idField.fill("Triage");
  await idField.press("Enter");
  await expect(page.getByTestId("new-playbook-error")).toContainText("Lowercase");
  expect(await app.core.command("draft.list", {})).toEqual([]);
  await idField.fill("triage");
  await idField.press("Enter");
  const workspace = page.getByTestId("authoring-workspace");
  await expect(workspace).toBeVisible();
  const chip = page.getByTestId("draft-chip");
  await expect(chip).toContainText("No source");
  const divider = page.getByTestId("authoring-divider");
  await expect(divider).toBeVisible();
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  const tabs = page.getByRole("tablist", { name: "Draft artifacts" });
  for (const name of ["Source", "Gears", "Machine", "Register"]) {
    await expect(tabs.getByRole("tab", { name, exact: true })).toBeVisible();
  }
  for (const name of ["Gears", "Machine", "Register"]) {
    await expect(tabs.getByRole("tab", { name, exact: true })).toBeDisabled();
  }
  const compile = page.getByTestId("compile-button");
  await expect(compile).toBeDisabled();
  await expect(compile).toHaveAttribute("title", "No source yet");
  await expect(page.getByTestId("source-empty")).toContainText("triage.md");
  const starters = page.getByTestId("starter-chip");
  await expect(starters).toHaveCount(3);
  await expect(starters.nth(0)).toHaveText("Describe a workflow");
  // A chip places its text in the field without sending.
  await starters.nth(0).click();
  await expect(page.getByTestId("draft-composer")).toHaveValue("Describe a workflow");
  await expect(page.getByTestId("boss-bubble")).toHaveCount(0);
  await page.getByTestId("draft-composer").fill("");

  // Returning shows the Drafts row; Open comes back to the workspace
  // with nothing ended (playbook-library-50).
  await page.getByTestId("workspace-back").click();
  const row = page.getByTestId("draft-row-triage");
  await expect(row).toBeVisible();
  await expect(row.getByTestId("draft-chip")).toContainText("No source");
  await expect(row.getByTestId("draft-age-triage")).toHaveText(/just now|ago/);
  await page.getByTestId("draft-open-triage").click();
  await expect(workspace).toBeVisible();

  // ── The first message: a Boss bubble, the agent's write as a tool
  //    card, the source in the tab before the turn ends, the compile
  //    block as a card (playbook-library-53/56).
  const composer = page.getByTestId("draft-composer");
  const send = page.getByTestId("draft-send");
  await expect(send).toHaveText("Send");
  await composer.fill(FIRST_MESSAGE);
  await send.click();
  await expect(page.getByTestId("boss-bubble").first()).toContainText(FIRST_MESSAGE);
  await expect(page.getByTestId("draft-working")).toContainText("working");
  await expect(page.getByTestId("draft-starters")).toHaveCount(0);
  const source = page.getByTestId("source-markdown");
  await expect(source).toContainText("Triager");
  await expect(source).toContainText("Verifier");
  // The turn is still running: the Source tab followed the write.
  await expect(page.getByTestId("draft-working")).toBeVisible();
  await expect(page.getByTestId("draft-abort")).toHaveText("Abort");
  await expect(compile).toHaveAttribute("title", "Waits for the reply");
  await expect(page.getByTestId("source-caption")).toContainText("by the agent");
  await expect(chip).toContainText("Draft");
  const thread = page.getByTestId("draft-thread");
  await expect(thread.getByTestId(/^tool-subject-/).filter({ hasText: "triage.md" }).first()).toBeVisible();
  const compileCards = thread.locator('[data-testid="directive-card"][data-kind="compile"]');
  await expect(compileCards.first()).toHaveText("Asked to compile");
  // Spex read the block: nothing stands as code with a caption.
  await expect(thread.getByTestId("directive-malformed")).toHaveCount(0);

  // ── The band while the agent's compile runs (playbook-library-57).
  const band = page.getByTestId("compile-band");
  await expect(band).toHaveAttribute("data-outcome", "running");
  await expect(chip).toContainText("Compiling");
  await expect(compile).toHaveText("Compiling…");
  await expect(compile).toBeDisabled();
  const phases = page.getByTestId("compile-phases");
  await expect(phases).toContainText("Normalize");
  await expect(phases.locator("[data-status='running']")).toBeVisible();
  await expect(page.getByTestId("last-output")).toContainText("last output");
  await expect(page.getByTestId("compile-by")).toHaveText("asked by the agent");
  await expect(page.getByTestId("compile-cancel")).toHaveText("Cancel");
  await expect(
    thread.getByTestId("system-line").filter({ hasText: "Compiling — asked by the agent" }),
  ).toBeVisible();
  // The compiler's ids ride the tooltips, the human words the row.
  await expect(page.getByTestId("phase-text2gears")).toContainText("Spec items");
  await expect(page.getByTestId("phase-text2gears")).toHaveAttribute("title", /text2gears/);

  // ── The failing stub: a red phase with its output open, the
  //    "sent to the agent" line, then the relay's compile passes
  //    (playbook-library-58/60).
  await expect(band).toHaveAttribute("data-outcome", "failed");
  await expect(chip).toContainText("Failed");
  await expect(page.getByTestId("phase-gears2fsm")).toHaveAttribute("data-status", "failed");
  await expect(page.getByTestId("compile-output")).toContainText("result 'labeled' declared twice");
  await expect(page.getByTestId("compile-caption")).toHaveText("sent to the agent");
  await expect(
    thread.getByTestId("system-line").filter({ hasText: "Compile failed at gears2fsm — sent to the agent" }),
  ).toBeVisible();
  await expect(compile).toBeDisabled();
  await expect(compile).toHaveAttribute("title", "Waits for the reply");
  await expect(page.getByTestId("source-edit")).toBeEnabled();
  // Save waits while the agent may be editing the same file.
  await page.getByTestId("source-edit").click();
  await expect(page.getByTestId("editor-save")).toBeDisabled();
  await expect(page.getByTestId("editor-save")).toHaveAttribute("title", "Waits for the reply");
  await page.getByTestId("editor-cancel").click();
  await expect(page.getByTestId("spec-editor")).toHaveCount(0);

  // The relay turn fixes the source and asks again.
  await expect(compileCards).toHaveCount(2);
  await expect(band).toHaveAttribute("data-outcome", "running");

  // ── A message sent during the compile queues with "Send next" and
  //    dispatches afterwards (playbook-library-54).
  await expect(composer).toHaveAttribute("placeholder", "Sends after the compile…");
  await composer.fill(QUEUED_MESSAGE);
  await expect(send).toHaveText("Send next");
  await send.click();
  const queue = page.getByTestId("draft-queue");
  await expect(queue).toContainText(QUEUED_MESSAGE);
  await expect(queue).toContainText("sends after the compile");
  await expect(composer).toHaveValue("");

  await expect(chip).toContainText("Compiled", { timeout: 30_000 });
  await expect(
    thread.getByTestId("system-line").filter({ hasText: "Compiled — roles: Triager, Verifier" }),
  ).toBeVisible();
  await expect(band).toHaveAttribute("data-outcome", "ok");
  await expect(page.getByTestId("compile-roles")).toHaveText("roles: Triager, Verifier");
  await expect(queue).toHaveCount(0);
  await expect(page.getByTestId("boss-bubble").filter({ hasText: QUEUED_MESSAGE })).toBeVisible();
  const proposal = thread.locator('[data-testid="directive-card"][data-kind="register"]');
  await expect(proposal).toContainText("Proposed registration");
  await expect(proposal).toContainText("/triage");
  await expect(proposal).toContainText("dev.triager");
  await expect(page.getByTestId("draft-working")).toHaveCount(0);
  await expect(send).toHaveText("Send");

  // The compiled tabs: Gears rows and the Machine's state list.
  await expect(tabs.getByRole("tab", { name: "Gears", exact: true })).toBeEnabled();
  await tabs.getByRole("tab", { name: "Gears", exact: true }).click();
  await expect(page.getByTestId("item-toggle-triage-1")).toBeVisible();
  await tabs.getByRole("tab", { name: "Machine", exact: true }).click();
  await expect(page.getByTestId("stage-states-draft-triage")).toContainText("ready");
  await expect(page.getByTestId("tab-dot-register")).toBeVisible();
  await tabs.getByRole("tab", { name: "Source", exact: true }).click();

  // ── Edit, Save, a forced conflict, and Paste (playbook-library-56).
  await page.getByTestId("source-edit").click();
  const editor = page.getByTestId("editor-text");
  await expect(editor).toHaveValue(FIXED_SOURCE);
  await editor.fill(`${FIXED_SOURCE}\nA note from the Boss.\n`);
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("spec-editor")).toHaveCount(0);
  await expect(source).toContainText("A note from the Boss.");
  await expect(page.getByTestId("source-caption")).toContainText("by you");
  expect(readFileSync(join(app.draftDir("triage"), "triage.md"), "utf8")).toContain("A note from the Boss.");
  // The source differs from the compiled one now.
  await expect(chip).toContainText("Changed");

  // A file changed behind the editor is a conflict offering Reload or
  // Overwrite; Reload takes the disk's text.
  await page.getByTestId("source-edit").click();
  await editor.fill(`${FIXED_SOURCE}\nEdited while another write landed.\n`);
  await app.core.command("draft.source.write", {
    draftId: "triage",
    content: "# triage\n\nForced from outside the editor.\n",
  });
  await page.getByTestId("editor-save").click();
  await expect(page.getByTestId("editor-conflict")).toBeVisible();
  await expect(page.getByTestId("editor-overwrite")).toHaveText("Overwrite");
  await page.getByTestId("editor-reload").click();
  await page.getByTestId("editor-confirm").getByRole("button", { name: "Reload", exact: true }).click();
  await expect(editor).toHaveValue("# triage\n\nForced from outside the editor.\n");
  await page.getByTestId("editor-cancel").click();
  await expect(page.getByTestId("spec-editor")).toHaveCount(0);
  await expect(source).toContainText("Forced from outside the editor.");

  // Paste's "Use as source" writes the file: the compiled text again,
  // so the draft reads compiled once more.
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await page.getByTestId("paste-text").fill(FIXED_SOURCE);
  await expect(page.getByTestId("paste-use")).toHaveText("Use as source");
  await page.getByTestId("paste-use").click();
  await expect(page.getByTestId("paste-text")).toHaveCount(0);
  await expect(source).toContainText("every proposed label was applied");
  expect(readFileSync(join(app.draftDir("triage"), "triage.md"), "utf8")).toBe(FIXED_SOURCE);
  await expect(chip).toContainText("Compiled");

  // ── The agent picker offers Captain and each roster player; a
  //    switch survives a reload with its system line (playbook-library-55).
  const agent = page.getByTestId("draft-agent");
  await expect(agent).toContainText("Captain");
  await agent.click();
  const picker = page.getByTestId("agent-picker");
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId("agent-option-captain")).toHaveAttribute("aria-checked", "true");
  await expect(picker.getByTestId("agent-option-dev.coder")).toBeVisible();
  await expect(picker.getByTestId("agent-option-dev.reviewer")).toBeVisible();
  await picker.getByTestId("agent-option-dev.reviewer").click();
  await expect(picker).toHaveCount(0);
  await expect(agent).toContainText("dev.reviewer");
  const switched = thread
    .getByTestId("system-line")
    .filter({ hasText: "Now answering: dev.reviewer — the conversation so far was replayed to it" });
  await expect(switched).toBeVisible();
  await expect.poll(() => app.readPrefs()).toContain("draft:triage:player");

  // ── A reload restores the transcript, the source, and the compiled
  //    tabs (playbook-library-62).
  await page.reload();
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
  await nav(page, "Playbooks").click();
  await expect(page.getByTestId("draft-row-triage").getByTestId("draft-chip")).toContainText("Compiled");
  await page.getByTestId("draft-open-triage").click();
  await expect(workspace).toBeVisible();
  await expect(page.getByTestId("boss-bubble").first()).toContainText(FIRST_MESSAGE);
  await expect(page.getByTestId("boss-bubble").filter({ hasText: QUEUED_MESSAGE })).toBeVisible();
  await expect(compileCards).toHaveCount(2);
  await expect(proposal).toContainText("Proposed registration");
  await expect(switched).toBeVisible();
  await expect(agent).toContainText("dev.reviewer");
  await expect(source).toContainText("every proposed label was applied");
  await expect(chip).toContainText("Compiled");
  await expect(page.getByTestId("compile-roles")).toHaveText("roles: Triager, Verifier");
  await tabs.getByRole("tab", { name: "Gears", exact: true }).click();
  await expect(page.getByTestId("item-toggle-triage-1")).toBeVisible();
  await tabs.getByRole("tab", { name: "Machine", exact: true }).click();
  await expect(page.getByTestId("stage-states-draft-triage")).toContainText("ready");
  await tabs.getByRole("tab", { name: "Source", exact: true }).click();

  // ── The 320px floor with the rail collapsed: the panes stack under
  //    the horizontal grip, the chip in view, every control keeps its
  //    accessible name, and the page scrolls in neither direction
  //    (playbook-library-52, DR-041).
  const collapse = page.getByRole("button", { name: "Collapse the sidebar" });
  if (await collapse.isVisible()) await collapse.click();
  await expect(page.getByRole("button", { name: "Show the sidebar" })).toBeVisible();
  const wideNames = await workspaceNames(page);
  await page.setViewportSize({ width: 320, height: 800 });
  const grip = page.getByTestId("authoring-grip");
  await expect(grip).toBeVisible();
  await expect(grip).toHaveAttribute("aria-orientation", "horizontal");
  await expect(divider).toBeHidden();
  const conversation = (await page.getByTestId("conversation-pane").boundingBox())!;
  const artifacts = (await page.getByTestId("artifacts-pane").boundingBox())!;
  const gripBox = (await grip.boundingBox())!;
  expect(conversation.y + conversation.height).toBeLessThanOrEqual(gripBox.y + 1);
  expect(gripBox.y + gripBox.height).toBeLessThanOrEqual(artifacts.y + 1);
  expect(artifacts.x).toBeLessThan(conversation.x + conversation.width);
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.x).toBeGreaterThanOrEqual(0);
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(320);
  expect(chipBox.y).toBeGreaterThanOrEqual(0);
  expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(800);
  await expect(chip).toBeInViewport();
  expect(await pageScrolls(page)).toEqual({ x: false, y: false });
  // The tabs collapsed to icons keep their names.
  expect(await workspaceNames(page)).toEqual(wideNames);
  for (const name of ["Source", "Gears", "Machine", "Register"]) {
    await expect(tabs.getByRole("tab", { name, exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(divider).toBeVisible();

  // ── Register: the tab prefilled from the proposal, then `/triage`
  //    configured with the Drafts section gone (playbook-library-61).
  await tabs.getByRole("tab", { name: "Register", exact: true }).click();
  const form = page.getByTestId("register-form");
  await expect(form).toContainText("Prefilled from the agent's proposal");
  await expect(page.getByTestId("register-id")).toHaveValue("triage");
  await expect(page.getByTestId("register-command")).toHaveValue("triage");
  await expect(page.getByTestId("register-intent")).toHaveValue(
    "Triage a new issue into the repository's labels",
  );
  await expect(page.getByTestId("register-player-Triager")).toHaveValue("new:dev.triager");
  await expect(page.getByTestId("register-player-Verifier")).toHaveValue("dev.coder");
  await expect(page.getByTestId("tab-dot-register")).toHaveCount(0);
  const configBefore = app.readConfig();
  expect(configBefore).not.toContain("triage:");
  await page.getByTestId("register-submit").click();
  await expect(page.getByTestId("playbook-card-triage")).toBeVisible();
  await expect(page.getByTestId("playbook-card-triage")).toContainText("/triage");
  await expect(page.getByTestId("drafts-section")).toHaveCount(0);
  await expect(workspace).toHaveCount(0);
  await expect.poll(() => app.readConfig()).toContain("triage:");
  expect(app.readConfig()).toContain("dev.triager:");
  expect(await app.core.command("draft.list", {})).toEqual([]);

  // ── Delete asks Delete or Keep and removes the row (playbook-library-63).
  await idField.fill("secaudit");
  await idField.press("Enter");
  await expect(workspace).toBeVisible();
  await page.getByTestId("workspace-back").click();
  const draftRow = page.getByTestId("draft-row-secaudit");
  await expect(draftRow).toBeVisible();
  await draftRow.getByTestId("draft-delete-secaudit").click();
  const keep = draftRow.getByRole("button", { name: "Keep", exact: true });
  await expect(keep).toBeVisible();
  await expect(keep).toBeFocused();
  await expect(draftRow.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await keep.click();
  await expect(draftRow).toBeVisible();
  await expect(draftRow.getByTestId("draft-delete-secaudit")).toBeVisible();
  await draftRow.getByTestId("draft-delete-secaudit").click();
  await draftRow.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(draftRow).toHaveCount(0);
  await expect(page.getByTestId("drafts-section")).toHaveCount(0);
  expect(await app.core.command("draft.list", {})).toEqual([]);
});

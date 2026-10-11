// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, expect, open, nav } from "../src/harness";
import { measure, record, setRail } from "../src/fit";

const approval = {toolName: "desktop.inspect", input: {app: "Task-owned Example", action: "read-window", target: "<img src=x onerror=alert(1)>"}, reason: "Inspect only this task-owned window", details: {title: "Read the Example window?", description: "The inspector wants to read the task-owned Example window to describe its contents.", blockedPath: "/task-owned/example"}};
test.use({appOptions: {project: true, approvalRules: [{match: "Implement: Permission unavailable", response: {result: "", failWith: {code: "PERMISSION_UNAVAILABLE", message: "The external desktop tool cannot access the task-owned Example app. Check access in the controlling application."}}}, {match: "Implement:", response: {approval, result: "Approved action completed", writes: {"approval-effect.txt": "once"}}}],
  authoring: {script: {fallback: {approval, result: "Approved author action completed"}}}}});

test("approvals-8: fresh served UI reviews actual pending scope, denies safely, reconnects and approves once", async ({page, app}) => {
  test.setTimeout(60_000);
  await open(page, app);
  await page.getByTestId("start-composer").fill("Inspect the task-owned fixture");
  await page.getByTestId("start-composer").press("Enter");
  const notice = page.getByRole("button", {name: "Tool approval needed (1)", exact: true});
  await expect(notice).toBeVisible();
  await expect(page.getByTestId("boss-composer")).toBeDisabled();
  expect(existsSync(join(app.projectDir, "approval-effect.txt"))).toBe(false);
  await notice.click();
  const inbox = page.getByRole("region", {name: "Tool approvals", exact: true});
  await expect(inbox).toContainText("dev.coder · Turn 1");
  await expect(inbox).toContainText("Task-owned Example");
  await expect(inbox).toContainText("<img src=x onerror=alert(1)>");
  expect(await inbox.locator("img").count()).toBe(0);
  await expect(inbox.getByRole("button", {name: "Deny", exact: true})).toBeFocused();
  await inbox.getByRole("button", {name: "Deny", exact: true}).press("Enter");
  await expect(inbox).toHaveCount(0);
  await expect(page.getByTestId("boss-composer")).toBeEnabled();
  expect(existsSync(join(app.projectDir, "approval-effect.txt"))).toBe(false);
  await page.getByTestId("boss-composer").fill("Inspect the second fixture");
  await page.getByTestId("boss-composer").press("Enter");
  await expect(notice).toBeVisible();
  const before = await app.core.command("approval.list", {});
  await page.reload();
  await page.getByRole("button", {name: "Tool approvals (1)", exact: true}).click();
  const after = await app.core.command("approval.list", {});
  expect(after.pending[0].id).toBe(before.pending[0].id);
  const defects: string[] = [];
  await setRail(page, false);
  for (const width of [320, 900]) {
    await page.setViewportSize({width, height: 900});
    record(`Tool approval ${width}px`, await measure(page), defects);
    if (width === 900) await test.info().attach("Tool approval 900px", {
      body: await page.screenshot(), contentType: "image/png",
    });
  }
  expect(defects).toEqual([]);
  await inbox.getByRole("button", {name: "Approve once", exact: true}).click();
  await expect(inbox).toHaveCount(0);
  await expect.poll(() => existsSync(join(app.projectDir, "approval-effect.txt"))).toBe(true);
  const sessions = await app.core.command("session.list", {});
  await expect.poll(async () => (await app.core.command("session.list", {})).find((session) => session.id === sessions[0].id)?.turnActive).toBe(false);
  await app.stop();
  await app.start();
  await page.reload();
  await expect(page.getByRole("button", {name: /^Tool approvals \(/})).toHaveCount(0);
  expect((await app.core.command("approval.list", {})).pending).toEqual([]);
});

test("approvals-8: authoring approval has draft scope and disappears on abort", async ({page, app}) => {
  await open(page, app);
  await nav(page, "Playbooks").click();
  await page.getByTestId("new-playbook-id").fill("approval-draft");
  await page.getByTestId("new-playbook-id").press("Enter");
  await page.getByTestId("draft-composer").fill("Inspect the task-owned fixture");
  await page.getByTestId("draft-send").click();
  await page.getByRole("button", {name: "Tool approval needed (1)", exact: true}).click();
  const inbox = page.getByRole("region", {name: "Tool approvals", exact: true});
  await expect(inbox).toContainText("Draft: approval-draft");
  await expect(inbox).toContainText("author · Turn 1");
  const draft = (await app.core.command("draft.list", {})).find((entry) => entry.id === "approval-draft")!;
  await app.core.command("draft.abort", {projectId: app.projectId!, draftId: "approval-draft", instance: draft.instance!});
  await expect(inbox).toHaveCount(0);
  await expect(page.getByTestId("draft-working")).toHaveCount(0);
  await page.reload();
  expect((await app.core.command("approval.list", {})).pending).toEqual([]);
});


test("approvals-8: unavailable external app access stays an honest tool error without an invented grant", async ({page, app}) => {
  await open(page, app);
  await page.getByTestId("start-composer").fill("Permission unavailable");
  await page.getByTestId("start-composer").press("Enter");
  await expect(page.getByTestId("player-pane-dev.coder")).toContainText("Check access in the controlling application.");
  await expect(page.getByRole("button", {name: /^Tool approvals \(/})).toHaveCount(0);
  expect((await app.core.command("approval.list", {})).pending).toEqual([]);
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Real served layout and hit testing; deterministic providers only.
import { writeFile } from "node:fs/promises";
import { composer, expect, openTranslated, runTurn, test } from "../src/harness";

test.use({ locale: "zh-CN", appOptions: { project: true } });

test("run-view-166: a stacked Chinese long draft keeps Send above player panes", async ({ page, app }, testInfo) => {
  const session = await app.core.command("session.create", { projectId: app.projectId! });
  // Arrange actual stored player calls in both lanes, then a real question.
  await runTurn(app, session.id, "Fix the token refresh in auth.ts");
  await runTurn(app, session.id, "ask before migrating");
  await page.setViewportSize({ width: 630, height: 665 });
  await openTranslated(page, app);
  await page.getByTestId(`sidebar-session-${session.id}`).click();
  await expect(page.getByTestId("boss-reply-banner")).toBeVisible();
  await expect(page.getByTestId("player-pane-dev.coder")).toContainText("Editing auth.ts");
  await expect(page.getByTestId("player-pane-dev.reviewer")).toContainText("token refresh looks");

  const draft = "Captain, explain the question. I am not answering yet.\n" +
    "请说明上一阶段的独立审阅证据和当前待决事项，保留已完成的提交，不要替负责人作出新的批准。\n".repeat(24);
  await composer(page).fill(draft);
  const send = page.getByTestId("send-button");
  await expect(send).toHaveText("发送");
  await expect(send).toBeEnabled();
  for (const size of [{ width: 630, height: 665 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize({ width: 1280, height: 800 });
    const rail = page.getByTestId("sidebar-collapse");
    if ((await rail.getAttribute("aria-expanded")) !== "true") await rail.click();
    await expect(rail).toHaveAttribute("aria-expanded", "true");
    await page.setViewportSize(size);
    await page.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const geometry = await send.evaluate((button) => {
      const b = button.getBoundingClientRect();
      const column = button.closest('[data-testid="captain-column"]')!;
      const c = column.getBoundingClientRect();
      const field = column.querySelector("textarea")!;
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { button: { top: b.top, bottom: b.bottom }, column: { top: c.top, bottom: c.bottom },
        hitWithinButton: !!hit && button.contains(hit), hitText: hit?.textContent?.slice(0, 100),
        fieldHeight: field.getBoundingClientRect().height, scrollHeight: field.scrollHeight,
        clientHeight: field.clientHeight, lineHeight: parseFloat(getComputedStyle(field).lineHeight),
        paddingTop: parseFloat(getComputedStyle(field).paddingTop),
        paddingBottom: parseFloat(getComputedStyle(field).paddingBottom),
        pageHeight: document.documentElement.scrollHeight, viewportHeight: window.innerHeight };
    });
    const layoutPath = testInfo.outputPath(`layout-${size.width}x${size.height}.json`);
    await writeFile(layoutPath, JSON.stringify(geometry, null, 2));
    await testInfo.attach(`layout-${size.width}x${size.height}.json`, { path: layoutPath, contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath(`chinese-long-draft-${size.width}x${size.height}.png`) });
    expect(geometry.button.top).toBeGreaterThanOrEqual(geometry.column.top);
    expect(geometry.button.bottom).toBeLessThanOrEqual(geometry.column.bottom + 1);
    expect(geometry.hitWithinButton, JSON.stringify(geometry)).toBe(true);
    // The draft scrolls in a field taller than its one-row floor.
    expect(geometry.fieldHeight).toBeGreaterThan(geometry.lineHeight + geometry.paddingTop + geometry.paddingBottom);
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  }
  await page.setViewportSize({ width: 630, height: 665 });
  const before = (await app.core.command("session.list", {})).find(s => s.id === session.id)!.turns;
  await send.click();
  await expect(page.getByTestId("boss-composer")).toHaveValue("");
  await expect.poll(async () => (await app.core.command("session.list", {})).find(s => s.id === session.id)?.turns)
    .toBe(before + 1);
});

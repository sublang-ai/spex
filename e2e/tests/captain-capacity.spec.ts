// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { writeFile } from "node:fs/promises";
import { expect, openTranslated, runTurn, test } from "../src/harness";

test.use({ locale: "zh-CN", appOptions: { project: true } });

test("run-view-167: short Chinese Captain chrome scrolls inside its column", async ({ page, app }, testInfo) => {
  const session = await app.core.command("session.create", { projectId: app.projectId! });
  await runTurn(app, session.id, "Fix the token refresh in auth.ts");
  await page.setViewportSize({ width: 630, height: 665 });
  await openTranslated(page, app);
  await page.getByTestId(`sidebar-session-${session.id}`).click();
  // Navigation can still show the home composer until session history loads.
  const field = page.getByTestId("boss-composer");
  const draft = "Captain, explain the question. I am not answering yet.\n" +
    "请说明上一阶段的独立审阅证据和当前待决事项，保留已完成的提交，不要替负责人作出新的批准。\n".repeat(24);
  await field.fill(draft);
  await expect(field).toHaveValue(draft);
  // The new chrome arrives after the draft: neither value nor viewport
  // changes can stand in for the constraint's own content-size signal.
  await runTurn(app, session.id, "ask before migrating");
  await expect(page.getByTestId("boss-reply-banner")).toBeVisible();
  await expect(field).toHaveValue(draft);
  await expect(field).toBeFocused();

  const column = page.getByTestId("captain-column");
  // Assert the arriving chrome fits before any resize can refit it.
  await expect.poll(async () => column.evaluate(c => {
    const box = c.getBoundingClientRect();
    const send = c.querySelector('[data-testid="send-button"]')!;
    const button = send.getBoundingClientRect();
    const field = c.querySelector('textarea')!;
    const f = field.getBoundingClientRect();
    const hit = document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2);
    return { sendInside: button.top >= box.top && button.bottom <= box.bottom,
      sendOwnsHit: !!hit && send.contains(hit),
      fieldInside: f.top >= box.top && f.bottom <= box.bottom,
      fieldScrolls: field.scrollHeight > field.clientHeight && getComputedStyle(field).overflowY === 'auto',
      pageFits: document.documentElement.scrollHeight <= window.innerHeight,
      unchangedViewport: window.innerWidth === 630 && window.innerHeight === 665 };
  })).toEqual({ sendInside: true, sendOwnsHit: true, fieldInside: true,
    fieldScrolls: true, pageFits: true, unchangedViewport: true });
  for (const size of [{ width: 320, height: 400 }, { width: 630, height: 665 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize({ width: 1280, height: 800 });
    const rail = page.getByTestId("sidebar-collapse");
    const expanded = size.width >= 480;
    if ((await rail.getAttribute("aria-expanded")) !== String(expanded)) await rail.click();
    await expect(rail).toHaveAttribute("aria-expanded", String(expanded));
    await page.setViewportSize(size);
    await column.evaluate(c => { c.scrollTop = 0; });
    await page.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const layout = await column.evaluate((c) => {
      const header = c.querySelector('[data-testid="captain-pane"] header')!.getBoundingClientRect();
      const pane = c.querySelector('[data-testid="captain-pane"]')!.getBoundingClientRect();
      const notice = c.querySelector('[data-testid="failed-workflow"]')!.getBoundingClientRect();
      const field = c.querySelector("textarea")!;
      return { column: { top: c.getBoundingClientRect().top, bottom: c.getBoundingClientRect().bottom,
        scrollHeight: c.scrollHeight, clientHeight: c.clientHeight },
        header: { top: header.top, bottom: header.bottom }, pane: { top: pane.top, bottom: pane.bottom },
        notice: { top: notice.top, bottom: notice.bottom }, fieldHeight: field.getBoundingClientRect().height,
        fieldLine: parseFloat(getComputedStyle(field).lineHeight),
        fieldOneRow: parseFloat(getComputedStyle(field).lineHeight) + parseFloat(getComputedStyle(field).paddingTop) + parseFloat(getComputedStyle(field).paddingBottom),
        fieldOverflow: getComputedStyle(field).overflowY,
        fieldScrollHeight: field.scrollHeight, fieldClientHeight: field.clientHeight,
        playerHeaders: Array.from(document.querySelectorAll('[data-testid^="player-pane-"]')).map(p => {
          const pane = p.getBoundingClientRect(); const header = p.querySelector('header')!.getBoundingClientRect();
          return { paneBottom: pane.bottom, headerBottom: header.bottom };
        }),
        pageHeight: document.documentElement.scrollHeight, viewportHeight: window.innerHeight };
    });
    const path = testInfo.outputPath(`capacity-${size.width}x${size.height}.json`);
    await writeFile(path, JSON.stringify(layout, null, 2));
    await testInfo.attach(`capacity-${size.width}x${size.height}.json`, { path, contentType: "application/json" });
    expect(layout.header.bottom).toBeLessThanOrEqual(layout.pane.bottom + 1);
    expect(layout.header.bottom).toBeLessThanOrEqual(layout.notice.top);
    expect(layout.fieldHeight).toBeGreaterThanOrEqual(layout.fieldOneRow);
    expect(layout.column.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.pageHeight).toBeLessThanOrEqual(layout.viewportHeight + 1);
    for (const player of layout.playerHeaders) expect(player.headerBottom).toBeLessThanOrEqual(player.paneBottom);
    if (size.width === 320) {
      expect(layout.fieldHeight).toBeLessThanOrEqual(layout.fieldOneRow + 1);
      expect(layout.fieldScrollHeight).toBeGreaterThan(layout.fieldClientHeight);
      expect(layout.fieldOverflow).toBe("auto");
      const scrolled = await field.evaluate(field => {
        field.scrollTop = field.scrollHeight;
        return field.scrollTop;
      });
      expect(scrolled).toBeGreaterThan(0);
      // Text shorter than the preferred growth cap still scrolls when
      // the actual constrained field has yielded to one row.
      await field.fill("First line\nSecond line\nThird line");
      const shorter = await field.evaluate(field => {
        field.scrollTop = field.scrollHeight;
        return { height: field.clientHeight, wanted: field.scrollHeight,
          top: field.scrollTop, cap: window.innerHeight * 0.4,
          overflow: getComputedStyle(field).overflowY };
      });
      expect(shorter.wanted).toBeLessThanOrEqual(shorter.cap);
      expect(shorter.wanted).toBeGreaterThan(shorter.height);
      expect(shorter.overflow).toBe("auto");
      expect(shorter.top).toBeGreaterThan(0);
      const shorterPath = testInfo.outputPath("capacity-shorter-field.json");
      await writeFile(shorterPath, JSON.stringify(shorter, null, 2));
      await testInfo.attach("capacity-shorter-field.json", { path: shorterPath, contentType: "application/json" });
      await field.fill(draft);
    }

    // Each real chrome control is reachable by scrolling its owning column,
    // without a body scroll or a sibling player taking its pointer hit.
    const controls = column.locator('[data-testid="captain-pane"] header button, [data-testid="failed-workflow"] button, [data-testid="composer-box"] button');
    for (const control of await controls.all()) {
      await control.scrollIntoViewIfNeeded();
      const hit = await control.evaluate((button) => {
        const b = button.getBoundingClientRect();
        const c = button.closest('[data-testid="captain-column"]')!.getBoundingClientRect();
        const target = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return { top: b.top, bottom: b.bottom, columnTop: c.top, columnBottom: c.bottom,
          ownsHit: !!target && button.contains(target) };
      });
      expect(hit.top).toBeGreaterThanOrEqual(hit.columnTop);
      expect(hit.bottom).toBeLessThanOrEqual(hit.columnBottom + 1);
      expect(hit.ownsHit, JSON.stringify(hit)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath(`capacity-${size.width}x${size.height}.png`) });
  }
  await page.setViewportSize({ width: 320, height: 400 });
  const rail = page.getByTestId("sidebar-collapse");
  if ((await rail.getAttribute("aria-expanded")) === "true") await rail.click();
  const before = (await app.core.command("session.list", {})).find(s => s.id === session.id)!.turns;
  await page.getByTestId("send-button").click();
  await expect(field).toHaveValue("");
  await expect.poll(async () => (await app.core.command("session.list", {})).find(s => s.id === session.id)?.turns)
    .toBe(before + 1);
});

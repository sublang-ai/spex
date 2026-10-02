// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test, expect, open, send, settled } from "../src/harness";

test.use({ appOptions: { project: true, agentDelayMs: 100 } });

test("run-view-121: rendered growth follows until the reader moves away", async ({ page, app }) => {
  await page.setViewportSize({ width: 1000, height: 420 });
  await open(page, app);
  await send(page, "Fix the token refresh in auth.ts");
  await settled(app);
  const captain = page.getByTestId("captain-pane");
  await expect(captain).toContainText("Done — the requested change is ready.");
  const thread = captain.locator("div.overflow-y-auto").first();
  const gap = () => thread.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
  const top = () => thread.evaluate((el) => el.scrollTop);
  const latest = captain.getByRole("button", { name: "↓ Latest", exact: true });

  // A controlled late-rendering block changes real browser layout without
  // changing Captain's record count, like a card or an image finishing layout.
  await thread.evaluate((el) => {
    const block = document.createElement("div");
    block.dataset.testid = "controlled-late-content";
    block.style.height = "300px";
    block.style.flexShrink = "0";
    block.textContent = "Late-rendering fixture content";
    el.firstElementChild!.append(block);
  });
  await expect.poll(gap).toBeLessThan(1);
  await expect(latest).toHaveCount(0);

  // Native wheel movement detaches; later content must not pull the reader.
  await thread.hover();
  await page.mouse.wheel(0, -120);
  await expect.poll(gap).toBeGreaterThan(80);
  const wheelTop = await top();
  await captain.getByTestId("controlled-late-content").evaluate((el) => {
    el.style.height = "400px";
  });
  await expect(latest).toBeVisible();
  await expect.poll(top).toBe(wheelTop);
  await latest.click();
  await expect.poll(gap).toBeLessThan(1);

  // An actual keyboard scroll has the same authority as the wheel. Focusing
  // the existing disclosure without scrolling keeps the starting geometry.
  await captain.locator('[data-testid^="machine-disclose-"]').first().evaluate((el) => {
    (el as HTMLElement).focus({ preventScroll: true });
  });
  await page.keyboard.press("PageUp");
  await expect.poll(gap).toBeGreaterThan(80);
  // Wait for the browser's native smooth keyboard scroll to complete before
  // comparing its retained position: scrollend with a stable-frame fallback.
  await thread.evaluate((el) => new Promise<void>((resolve) => {
    let frame: number;
    let prior = el.scrollTop;
    let still = 0;
    const check = () => {
      const next = el.scrollTop;
      still = next === prior ? still + 1 : 0;
      prior = next;
      if (still >= 3) resolve();
      else frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    el.addEventListener("scrollend", () => { cancelAnimationFrame(frame); resolve(); }, { once: true });
  }));
  const keyTop = await top();
  await captain.getByTestId("controlled-late-content").evaluate((el) => {
    el.style.height = "500px";
  });
  await expect(latest).toBeVisible();
  await expect.poll(top).toBe(keyTop);
  await latest.click();
  await expect.poll(gap).toBeLessThan(1);

  // Change content and reader position together inside one animation frame.
  // ResizeObserver sees the real upward movement before the queued scroll
  // event; neither callback may reinterpret it as geometry-only movement.
  const concurrent = await thread.evaluate((el) => new Promise<number>((resolve) => {
    requestAnimationFrame(() => {
      const position = el.scrollTop - 90;
      const block = el.querySelector<HTMLElement>('[data-testid="controlled-late-content"]')!;
      block.style.height = "600px";
      el.scrollTop = position;
      resolve(position);
    });
  }));
  await expect(latest).toBeVisible();
  await expect.poll(top).toBe(concurrent);
  await captain.getByTestId("controlled-late-content").evaluate((el) => {
    el.style.height = "700px";
  });
  await expect.poll(top).toBe(concurrent);
  await latest.click();
  await expect.poll(gap).toBeLessThan(1);
  await expect(latest).toHaveCount(0);
});

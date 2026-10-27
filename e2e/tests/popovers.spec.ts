// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What only opens on a gesture (settings-33, playbook-library-43,
// projects-30, spec-view-59, spec-view-26, dashboard-49,
// forge-work-lists-1; DR-041 §9):
// the fit journey measures every surface at every width but never
// opens a popover, hovers a graph node, or shows the palette, so the
// chrome that appears in place is measured here — each box lying
// inside the box that must show it, with the page scrolling in
// neither direction.

import type { Locator, Page } from "@playwright/test";

import { test, expect, open, nav } from "../src/harness";

const FLOOR = 320;
const SHORT = 400;
const TOLERANCE = 1;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  expect(box, "the element has no box").not.toBeNull();
  return box!;
}

/** The page scrolls in neither direction (DR-041 §9). */
async function pageDoesNotScroll(page: Page): Promise<void> {
  const scroll = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      sideways: root.scrollWidth - root.clientWidth,
      down: root.scrollHeight - root.clientHeight,
      width: root.clientWidth,
      height: root.clientHeight,
    };
  });
  expect(scroll.sideways, "the page scrolls sideways").toBeLessThanOrEqual(TOLERANCE);
  expect(scroll.down, "the page scrolls vertically").toBeLessThanOrEqual(TOLERANCE);
}

/** `inner` lies inside `outer`, named when it does not. */
function expectInside(inner: Box, outer: Box, what: string): void {
  expect(
    Math.round(inner.x),
    `${what} starts left of its box (${Math.round(inner.x)} of ${Math.round(outer.x)})`,
  ).toBeGreaterThanOrEqual(Math.round(outer.x) - TOLERANCE);
  expect(
    Math.round(inner.x + inner.width),
    `${what} ends right of its box`,
  ).toBeLessThanOrEqual(Math.round(outer.x + outer.width) + TOLERANCE);
  expect(Math.round(inner.y), `${what} starts above its box`).toBeGreaterThanOrEqual(
    Math.round(outer.y) - TOLERANCE,
  );
  expect(
    Math.round(inner.y + inner.height),
    `${what} ends below its box`,
  ).toBeLessThanOrEqual(Math.round(outer.y + outer.height) + TOLERANCE);
}

/** How two paired fields stand (settings-1, playbook-library-4,
 * DR-095): beside each other on one row, or the second under the first. */
async function pairing(container: Locator, first: string, second: string): Promise<"side by side" | "stacked"> {
  // Discovery can grow and refit the entire popover between browser
  // round trips. Compare both fields in the same layout snapshot.
  const [a, b] = await container.evaluate((element, ids) => ids.map((id) => {
    const matches = element.querySelectorAll(`[data-testid=${CSS.escape(id)}]`);
    if (matches.length !== 1) throw new Error(`expected one field: ${id}`);
    const field = matches[0]!;
    if (field.getClientRects().length === 0) throw new Error(`the field has no box: ${id}`);
    const { x, y, width, height } = field.getBoundingClientRect();
    return { x, y, width, height };
  }), [first, second] as const);
  if (Math.abs(a.y - b.y) <= TOLERANCE && b.x >= a.x + a.width - TOLERANCE) return "side by side";
  if (b.y >= a.y + a.height - TOLERANCE) return "stacked";
  throw new Error(`the pair overlaps: ${JSON.stringify({ a, b })}`);
}

async function viewport(page: Page): Promise<Box> {
  const size = page.viewportSize()!;
  return { x: 0, y: 0, width: size.width, height: size.height };
}

/** Collapse the sidebar, so the 320px floor is measured with the rail
 * out of the way as DR-041 states it. */
async function collapseRail(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const control = page.getByRole("button", { name: "Collapse the sidebar" });
  if (await control.isVisible()) await control.click();
  await expect(page.getByRole("button", { name: "Show the sidebar" })).toBeVisible();
}

test.describe("the role editors on the Playbooks surface", () => {
  let releaseDiscovery: (() => void) | undefined;
  test.use({ appOptions: {
    discoverAgentModels: async () => {
      await new Promise<void>((resolve) => { releaseDiscovery = resolve; });
      return { status: "available", models: [{ id: "fixture-model", name: "Fixture model" }] };
    },
  } });
  test.afterEach(() => releaseDiscovery?.());

  async function finishDiscovery(editor: Locator): Promise<void> {
    await expect(editor).toContainText("Loading model options…");
    await expect.poll(() => Boolean(releaseDiscovery)).toBe(true);
    releaseDiscovery!();
    releaseDiscovery = undefined;
    await expect(editor).toContainText("Models reported by the installed runtime.");
  }

  test("settings-29, playbook-library-41: an editor opened at a role's control stands inside the pane", async ({
    page,
    app,
  }) => {
    await open(page, app);
    await collapseRail(page);
    await nav(page, "Playbooks").click();
    await expect(page.getByTestId("playbooks-enabled")).toBeVisible();

    for (const width of [FLOOR, 480, 1280]) {
      await page.setViewportSize({ width, height: 800 });

      // The agent editor hangs from a 24px gear near the left of its
      // card, and asks for 384px (settings-33).
      const gear = page.getByTestId(/^enable-configure-/).first();
      await gear.click();
      const popover = page.getByTestId("agent-popover");
      await expect(popover).toBeVisible();
      expectInside(
        await boxOf(popover),
        await viewport(page),
        `the agent editor at ${width}px`,
      );
      // Resolve discovery only after the initial fit: the model picker,
      // custom-value warning and tuning guidance grow the open dialog.
      await finishDiscovery(popover);
      await expect(async () => expectInside(
        await boxOf(popover), await viewport(page),
        `the agent editor after discovery at ${width}px`,
      )).toPass();
      await expect(popover.getByTestId("agent-adapter-claude")).toBeVisible();
      expectInside(
        await boxOf(popover.getByTestId("agent-adapter-claude")),
        await boxOf(popover),
        `the adapter group at ${width}px`,
      );
      // Each model beside its effort, stacked at the floor (settings-1).
      const paired = width === FLOOR ? "stacked" : "side by side";
      expect(await pairing(popover, "agent-model-cell", "agent-effort-cell"), `the agent editor's model and effort at ${width}px`).toBe(paired);
      expect(await pairing(popover, "agent-subagent-model-cell", "agent-subagent-effort-cell"), `the agent editor's subagent pair at ${width}px`).toBe(paired);
      await pageDoesNotScroll(page);
      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);

      // The binding editor grows rightwards from a control that sits
      // further along a wrapping roles row (playbook-library-43).
      const bind = page.getByTestId("role-bind-review-reviewer");
      await bind.scrollIntoViewIfNeeded();
      await bind.click();
      const editor = page.getByTestId("binding-editor-reviewer");
      await expect(editor).toBeVisible();
      expectInside(
        await boxOf(editor),
        await viewport(page),
        `the binding editor at ${width}px`,
      );
      await finishDiscovery(editor);
      // Each model beside its effort, stacked at the floor
      // (playbook-library-4).
      expect(await pairing(editor, "binding-model-mode", "binding-effort-mode"), `the binding editor's model and effort at ${width}px`).toBe(width === FLOOR ? "stacked" : "side by side");
      await editor.getByTestId("binding-model-mode").selectOption("pin");
      await expect(editor.getByTestId("binding-model-value")).toBeVisible();
      await expect(async () => expectInside(
        await boxOf(editor), await viewport(page),
        `the binding editor after pinning a custom model at ${width}px`,
      )).toPass();
      await pageDoesNotScroll(page);
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);
    }
  });
});

/** The box that must show `locator`: its nearest ancestor that clips,
 * else the window (DR-041 §9, lib/popover-fit.ts). */
async function clippingBox(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        const rect = node.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
      }
    }
    const root = document.documentElement;
    return { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight };
  });
}

test.describe("a model list at the floor", () => {
  // A catalog long enough that the list must scroll its own rows, each
  // with the second line the runtime's description gives it (DR-091).
  test.use({ appOptions: {
    discoverAgentModels: async () => ({
      status: "available",
      defaultModel: "fixture-model-1",
      models: Array.from({ length: 12 }, (_, index) => ({
        id: `fixture-model-${index + 1}`,
        name: `Fixture Model ${index + 1}`,
        resolvedModel: `fixture-model-${index + 1}-2026-09-28`,
        description: `Fixture model ${index + 1} · a description long enough to meet the edge of a narrow list`,
      })),
    }),
  } });

  test("settings-29: a model list opened in an agent editor stays inside the box that must show it", async ({
    page,
    app,
  }) => {
    await open(page, app);
    await collapseRail(page);
    await nav(page, "Settings").click();
    const captain = page.getByTestId("captain-section");

    for (const height of [800, SHORT]) {
      await page.setViewportSize({ width: FLOOR, height });
      await captain.getByTestId("captain-edit").click();
      const trigger = captain.getByTestId("agent-model-trigger");
      await expect(trigger).toBeVisible();
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
      const list = captain.getByTestId("agent-model-listbox");
      await expect(list).toBeVisible();
      const popup = list.locator("xpath=..");
      const where = `the model list at ${FLOOR}×${height}`;
      await expect(async () => {
        expectInside(await boxOf(popup), await clippingBox(popup), where);
        expectInside(await boxOf(popup), await viewport(page), `${where}, in the window`);
      }).toPass();

      // The last row is reached by the list's own scrolling, never the
      // page's.
      await page.keyboard.press("End");
      const last = list.getByRole("option").last();
      await expect(last).toHaveAccessibleName("Custom model…");
      await expect(async () => expectInside(await boxOf(last), await boxOf(list), `the last row of ${where}`)).toPass();
      await pageDoesNotScroll(page);

      // Escape takes the list alone; the editor stands until it too is
      // dismissed.
      await page.keyboard.press("Escape");
      await expect(list).toHaveCount(0);
      await expect(captain.getByTestId("agent-editor")).toBeVisible();
      await captain.getByTestId("agent-cancel").click();
      await expect(captain.getByTestId("agent-editor")).toHaveCount(0);
    }
  });
});

test.describe("the project palette", () => {
  test.use({ appOptions: { project: true } });

  test("projects-28: a refused path shows its message inside a short window", async ({
    page,
    app,
  }) => {
    await open(page, app);
    await page.setViewportSize({ width: 900, height: SHORT });
    await page.getByTestId("sidebar").getByRole("button", { name: "Add a local project" }).click();
    const palette = page.getByRole("dialog", {
      name: /Add a project|Choose a project/,
    });
    await expect(palette).toBeVisible();

    // The home directory is no git work tree, so the palette refuses
    // it and says why (projects-1) — the message a 400px-tall window
    // used to cut off (projects-30).
    await palette.getByTestId("palette-path").fill(app.home);
    await palette.getByTestId("palette-add").click();
    const message = palette.getByTestId("palette-error");
    await expect(message).toBeVisible();
    const window = await viewport(page);
    expectInside(await boxOf(palette), window, "the palette");
    expectInside(await boxOf(message), window, "the palette's message");
    await pageDoesNotScroll(page);
  });
});

test.describe("the Specs surface at its floor", () => {
  test.use({ appOptions: { project: true } });

  test("spec-view-56: the outline keeps its height and the graph's card stays in its pane", async ({
    page,
    app,
  }) => {
    await open(page, app);
    await collapseRail(page);
    await page.getByRole("tab", { name: "Specs" }).click();
    await expect(page.getByTestId("specv-live")).toBeVisible();
    const graphToggle = page.getByTestId("view-graph");
    if ((await graphToggle.getAttribute("aria-pressed")) !== "true") {
      await graphToggle.click();
    }
    await expect(graphToggle).toHaveAttribute("aria-pressed", "true");

    // Narrow and short: the split stacks, and the outline's filter row
    // wraps to three lines (spec-view-59).
    await page.setViewportSize({ width: FLOOR, height: SHORT });
    const outline = page.getByTestId("specs-outline");
    await expect(outline).toBeVisible();
    const list = await boxOf(outline);
    expect(list.height, "the outline collapsed to nothing").toBeGreaterThan(40);
    await expect(page.getByTestId(/^file-toggle-/).first()).toBeVisible();
    await pageDoesNotScroll(page);

    // The details card is centred on its mark, so the marks at the
    // pane's own edges are where it used to paint outside
    // (spec-view-26). Keyboard focus asks for the card the way a
    // reader walking the graph does — and reaches a mark another mark
    // overlaps, which a pointer cannot.
    await page.setViewportSize({ width: 800, height: 800 });
    const pane = page.getByTestId("spec-graph");
    await expect(pane).toBeVisible();
    const nodes = page.getByTestId(/^graph-node-/);
    const centres = await nodes.evaluateAll((elements) =>
      elements.map((element, index) => {
        const box = element.getBoundingClientRect();
        return { index, x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }),
    );
    expect(centres.length).toBeGreaterThan(0);
    const edges = [
      centres.reduce((a, b) => (b.x < a.x ? b : a)),
      centres.reduce((a, b) => (b.x > a.x ? b : a)),
      centres.reduce((a, b) => (b.y > a.y ? b : a)),
    ];
    const paneBox = await boxOf(pane);
    for (const at of new Set(edges.map((edge) => edge.index))) {
      const node = nodes.nth(at);
      await node.focus();
      const card = page.getByTestId("graph-card");
      await expect(card).toBeVisible();
      expectInside(
        await boxOf(card),
        paneBox,
        `the card for the node at the pane's edge (${at})`,
      );
      await node.blur();
    }

    // The relationship panel stands at the top-right; selecting the
    // package nearest that corner moves the camera the least that
    // clears it — no zoom, half the view still over the fitted frame —
    // and clearing returns the fit (spec-view-43, spec-view-25,
    // spec-view-27).
    const layer = pane.locator("svg > g").first();
    const frame = page.getByTestId("graph-frame");
    const frameBox = await boxOf(frame);
    const corner = await nodes.evaluateAll(
      (elements, at) =>
        elements
          .map((element, index) => {
            const box = element.getBoundingClientRect();
            return {
              index,
              d: Math.hypot(at.right - (box.x + box.width / 2), box.y + box.height / 2 - at.top),
              foot: element.getAttribute("data-foot") === "true",
            };
          })
          .filter((entry) => !entry.foot)
          .sort((a, b) => a.d - b.d)[0].index,
      { right: frameBox.x + frameBox.width, top: frameBox.y },
    );
    const chosen = nodes.nth(corner);
    const name = (await chosen.getAttribute("data-testid"))!.replace("graph-node-", "");
    await chosen.focus();
    await chosen.press("Enter");
    const panel = page.getByTestId("graph-relationships");
    await expect(panel).toBeVisible();
    await expectRevealed(page, name);
    const camera = await layer.getAttribute("transform");
    const [, tx, ty, k] = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(camera!)!.map(Number);
    expect(k, "the reveal zoomed").toBe(1);
    const svgBox = await boxOf(pane.locator("svg").first());
    for (const [shift, span] of [
      [tx, svgBox.width],
      [ty, svgBox.height],
    ]) {
      const overlap = Math.min(span, span - shift) - Math.max(0, -shift);
      expect(overlap, "the view left the fitted frame").toBeGreaterThanOrEqual(span / 2 - 0.5);
    }
    await pane.locator("svg").first().press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(layer).toHaveAttribute("transform", "translate(0,0) scale(1)");

    // At the browser's floor with the sidebar collapsed, only the
    // drawing scrolls sideways; the controls, the panel and the key
    // stay in the pane's visible width, and a selection brings its node
    // into it clear of the panel (spec-view-59, spec-view-43).
    await page.setViewportSize({ width: FLOOR, height: SHORT });
    const scroller = page.getByTestId("graph-scroller");
    await expect(scroller).toBeVisible();
    const scroll = await scroller.evaluate((element) => ({
      width: element.scrollWidth,
      client: element.clientWidth,
    }));
    expect(scroll.client, "the graph is wider than the floor it was measured at").toBeLessThan(320);
    expect(scroll.width).toBeGreaterThanOrEqual(320);
    await pageDoesNotScroll(page);
    const narrow = await boxOf(frame);
    for (const id of ["graph-toolbar", "graph-legend"]) {
      const box = await boxOf(page.getByTestId(id));
      expect(box.x, `${id} starts left of the pane`).toBeGreaterThanOrEqual(narrow.x - 0.5);
      expect(box.x + box.width, `${id} runs past the pane`).toBeLessThanOrEqual(narrow.x + narrow.width + 0.5);
    }
    await chosen.focus();
    await chosen.press("Enter");
    await expect(panel).toBeVisible();
    const panelBox = await boxOf(panel);
    expect(panelBox.x).toBeGreaterThanOrEqual(narrow.x - 0.5);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(narrow.x + narrow.width + 0.5);
    await expectRevealed(page, name);
    await pane.locator("svg").first().press("Escape");
    await pageDoesNotScroll(page);
  });
});

/** The selected node and its circle lie in the graph's visible frame,
 * clear of the relationship panel (spec-view-43). */
async function expectRevealed(page: Page, name: string): Promise<void> {
  await expect
    .poll(async () => {
      const [frame, panel, circle] = await Promise.all([
        boxOf(page.getByTestId("graph-frame")),
        boxOf(page.getByTestId("graph-relationships")),
        boxOf(page.getByTestId(`graph-node-${name}`)),
      ]);
      const label = page.getByTestId(`graph-label-${name}`);
      const marks = [circle];
      if (await label.count()) marks.push(await boxOf(label));
      return marks.every(
        (mark) =>
          mark.x >= frame.x - 0.5 &&
          mark.x + mark.width <= frame.x + frame.width + 0.5 &&
          (mark.x + mark.width <= panel.x ||
            mark.x >= panel.x + panel.width ||
            mark.y >= panel.y + panel.height ||
            mark.y + mark.height <= panel.y),
      );
    }, { message: `${name} lies under the panel or outside the frame` })
    .toBe(true);
}

test.describe("a labelled Sources row", () => {
  test.use({ appOptions: { project: true, forge: true } });

  test("dashboard-49, forge-work-lists-1: an issue row with labels does not widen the Dashboard", async ({
    page,
    app,
  }) => {
    const projectId = app.projectId!;
    // A second queued intent sourced from issue #7, so its row wears
    // the longest state the band can show (dashboard-30).
    await app.core.command("intent.queue", {
      projectId,
      text: "Add a README badge",
    });
    await app.core.command("intent.queue", {
      projectId,
      text: "Address #7: Token refresh drops the session after ninety seconds",
      source: { kind: "issue", ref: "7" },
    });

    await open(page, app);
    await collapseRail(page);
    await nav(page, "Dashboard").click();
    await page.getByTestId(`sources-tab-issues-${projectId}`).click();
    const row = page.getByTestId(`source-issue-${projectId}-7`);
    await expect(row).toBeVisible();
    await expect(page.getByTestId(`source-issue-${projectId}-7-state`)).toBeVisible();

    await page.setViewportSize({ width: FLOOR, height: 800 });
    await expect(row).toBeVisible();
    const rowBox = await boxOf(row);
    // Every child inside the row, and the row no wider than its box.
    const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow, "the labelled row is wider than its box").toBeLessThanOrEqual(
      TOLERANCE,
    );
    const children = await row.locator(":scope > *").all();
    for (const [index, child] of children.entries()) {
      const box = await child.boundingBox();
      if (!box) continue;
      expectInside(box, rowBox, `child ${index} of the labelled row`);
    }
    // The label tags yielded; their words ride the row's title.
    await expect(row.getByText("documentation")).toBeHidden();
    await expect(row.getByRole("link")).toHaveAttribute(
      "title",
      /documentation, help wanted, auth$/,
    );
    await pageDoesNotScroll(page);
  });
});

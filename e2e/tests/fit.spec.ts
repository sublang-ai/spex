// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The fit journey (run-view-105, spec-view-56, dashboard-43,
// settings-30; DR-041 §9): every surface, both sidebar states, six
// widths — the page never scrolls sideways, nothing but a canvas is
// wider than its box, no two siblings in a row overlap, every child
// stays inside its parent, and every control keeps its accessible
// name. Simulated documents cannot measure layout, so this is the one
// home of that evidence.

import { join } from "node:path";
import type { Page } from "@playwright/test";
import { seedDemoProject } from "@sublang/spex-core/testing";

import { test, expect, open, nav, send } from "../src/harness";


// Long enough that a turn is still in flight while a surface is
// measured at eleven widths.
test.use({ appOptions: { project: true, agentDelayMs: 4000 } });

const WIDTHS = [320, 480, 640, 800, 1024, 1280];
/** An unbroken token longer than any pane (run-view-3): it rides the
 * task into the Boss bubble, the coder's prompt, and the tab and row
 * titles, and must wrap or truncate everywhere rather than scroll a
 * pane sideways. */
const LONG_URL = `https://example.com/${"a".repeat(380)}`;
const TASK = `Fix the token refresh in auth.ts — see ${LONG_URL}`;
const HEIGHT = 800;
/** The open sidebar is 224px wide, so the 320px floor holds with it
 * collapsed (DR-041): the open state is measured from 480px. */
const OPEN_RAIL_MIN_WIDTH = 480;

interface Measured {
  /** Elements wider than their box outside a scrolling canvas. */
  overflow: string[];
  /** Sibling pairs that overlap, and children outside their parent,
   * within tab lists, toolbars, headers, list rows, and composer boxes. */
  overlap: string[];
  /** Every button's accessible name, in document order. */
  names: string[];
}

/** One measurement of the current layout, taken in the page. */
async function measure(page: Page): Promise<Measured> {
  // Two frames so container queries and the auto-growing field have
  // settled after a resize.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return page.evaluate(() => {
    const TOLERANCE = 1;
    const describe = (el: Element): string => {
      const id = el.getAttribute("data-testid");
      const tag = el.tagName.toLowerCase();
      const cls = (el.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .join(".");
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
      return `${tag}${id ? `[data-testid=${id}]` : ""}${cls ? `.${cls}` : ""}${
        text ? ` "${text}"` : ""
      }`;
    };
    const styleOf = (el: Element) => getComputedStyle(el);
    const scrolls = (el: Element): boolean => {
      const ox = styleOf(el).overflowX;
      return ox === "auto" || ox === "scroll";
    };
    const shown = (el: Element): boolean => {
      const style = styleOf(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (style.position === "fixed" || style.position === "absolute") return false;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    // An inline element paints as line fragments; its union box says
    // nothing about overlap, so each fragment is measured on its own.
    const rects = (el: Element): DOMRect[] =>
      styleOf(el).display === "inline"
        ? Array.from(el.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
        : [el.getBoundingClientRect()];
    const intersect = (a: DOMRect, b: DOMRect): boolean =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOLERANCE &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOLERANCE;
    const inside = (child: DOMRect, parent: DOMRect): boolean =>
      child.left >= parent.left - TOLERANCE &&
      child.right <= parent.right + TOLERANCE &&
      child.top >= parent.top - TOLERANCE &&
      child.bottom <= parent.bottom + TOLERANCE;

    // (i) Sideways overflow: the page, then every element that is
    // not a scrolling canvas, not a truncating text box, and not the
    // one-pixel clipped box that carries screen-reader-only text.
    const overflow: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      overflow.push(`document scrolls sideways: ${root.scrollWidth} > ${root.clientWidth}`);
    }
    const inCanvas = new Map<Element, boolean>();
    const insideCanvas = (el: Element): boolean => {
      const known = inCanvas.get(el);
      if (known !== undefined) return known;
      const parent = el.parentElement;
      const found = parent ? scrolls(parent) || insideCanvas(parent) : false;
      inCanvas.set(el, found);
      return found;
    };
    const viewportWidth = document.documentElement.clientWidth;
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!(el instanceof HTMLElement)) continue;
      const style = styleOf(el);
      if (style.display === "none" || style.display === "inline") continue;
      if (scrolls(el) || style.textOverflow === "ellipsis") continue;
      if (el.clientWidth <= 1) continue;
      // A text field scrolls its own value; its box is what counts.
      const field = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (!field && el.scrollWidth > el.clientWidth + TOLERANCE) {
        overflow.push(`${describe(el)}: ${el.scrollWidth} > ${el.clientWidth}`);
      }
      // Nothing paints outside the viewport but inside a canvas
      // (DR-041's 320px floor) — positioned chrome included.
      const box = el.getBoundingClientRect();
      if (
        box.width > 0 &&
        (box.right > viewportWidth + TOLERANCE || box.left < -TOLERANCE) &&
        !insideCanvas(el)
      ) {
        overflow.push(
          `${describe(el)} extends past the viewport (${Math.round(box.left)}..${Math.round(box.right)} of ${viewportWidth})`,
        );
      }
    }

    // (ii) Overlap and containment within the rows that lay controls
    // side by side.
    const overlap: string[] = [];
    const seen = new Set<Element>();
    const containers = Array.from(
      document.querySelectorAll('[role="tablist"], [role="toolbar"], header, li'),
    );
    for (const box of Array.from(document.querySelectorAll('[data-testid$="-composer"]'))) {
      if (box.parentElement) containers.push(box.parentElement);
    }
    const check = (parent: Element): void => {
      if (seen.has(parent)) return;
      seen.add(parent);
      const parentBox = parent.getBoundingClientRect();
      const children = Array.from(parent.children).filter(shown);
      const parentScrolls = scrolls(parent);
      const parentHasBox = parentBox.width > 0 && parentBox.height > 0;
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        const childRects = rects(child);
        if (parentHasBox && !parentScrolls) {
          for (const r of childRects) {
            if (!inside(r, parentBox)) {
              overlap.push(
                `${describe(child)} leaves ${describe(parent)} (${Math.round(r.left)}..${Math.round(r.right)} vs ${Math.round(parentBox.left)}..${Math.round(parentBox.right)})`,
              );
              break;
            }
          }
        }
        for (let j = i + 1; j < children.length; j += 1) {
          const other = children[j];
          const hit = childRects.some((a) => rects(other).some((b) => intersect(a, b)));
          if (hit) {
            overlap.push(`${describe(child)} overlaps ${describe(other)} in ${describe(parent)}`);
          }
        }
      }
      for (const child of children) check(child);
    };
    for (const container of containers) {
      if (shown(container)) check(container);
    }

    // (iii) Accessible names of every button, in document order. The
    // Now row names the live run's current state, which advances
    // between measurements; its words are live content, not chrome,
    // so it stays out of the stability check.
    const names = Array.from(document.querySelectorAll("button"))
      .filter((button) => !button.closest('[data-testid^="now-session-"]'))
      .map((button) => {
        const label = button.getAttribute("aria-label");
        const text = (button.textContent ?? "").trim().replace(/\s+/g, " ");
        return label ?? (text || (button.getAttribute("title") ?? ""));
      });
    return { overflow, overlap, names };
  });
}

interface Surface {
  name: string;
  /** Bring the surface up once. */
  show: () => Promise<void>;
  /** Hold before each measurement: the surface is drawn and in the
   * state the journey measures. */
  ready: () => Promise<void>;
}

test("run-view-105: chrome fits at every width, in both sidebar states", async ({
  page,
  app,
}) => {
  test.setTimeout(120_000);
  const projectId = app.projectId!;

  // Arrange through the protocol: a queued intent with a second one
  // blocked behind it, and ten parked sessions in other projects so
  // the attention queue holds ten entries and the badge passes nine.
  const first = await app.core.command("intent.queue", {
    projectId,
    text: "Add a README badge",
  });
  await app.core.command("intent.queue", {
    projectId,
    text: "Tighten the expiry tests once the badge lands on the README",
    afterIntentId: first.id,
  });
  for (let index = 0; index < 10; index += 1) {
    const dir = join(app.projectDir, "..", `parked-${index}`);
    seedDemoProject(dir);
    const project = await app.core.command("project.register", { path: dir });
    const session = await app.core.command("session.create", {
      projectId: project.id,
    });
    await app.core.command("turn.submit", {
      sessionId: session.id,
      text: "ask before migrating",
    });
  }
  await expect
    .poll(async () => (await app.core.command("ledger.get", {})).badge, {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(10);

  page.on("pageerror", (error) => console.log(`[fit] page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`[fit] console error: ${message.text()}`);
  });
  await open(page, app);
  // Several projects are registered, so the demo project is chosen
  // by hand from the sidebar.
  await page.getByTestId(`sidebar-project-${projectId}`).click();
  await expect(page.getByTestId("captain-home")).toContainText("demo-project");

  const abort = page.getByTestId("abort-button");
  const ensureTurnRunning = async () => {
    if (await abort.isVisible()) return;
    await page.getByTestId("boss-composer").fill(TASK);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(abort).toBeVisible();
  };

  const surfaces: Surface[] = [
    {
      name: "Captain home",
      show: async () => {},
      ready: () => expect(page.getByTestId("captain-home")).toBeVisible(),
    },
    {
      name: "Session (turn in flight)",
      show: async () => {
        await send(page, TASK);
        await expect(page.getByTestId("captain-pane")).toContainText("/code started");
      },
      ready: async () => {
        await expect(page.getByTestId("captain-pane")).toBeVisible();
        await ensureTurnRunning();
      },
    },
    {
      name: "Dashboard",
      // The entry's name carries the attention count (run-view-34).
      show: () => page.getByRole("button", { name: /^Dashboard\b/ }).click(),
      ready: async () => {
        await expect(page.getByTestId(`project-group-${projectId}`)).toBeVisible();
        await expect(page.getByTestId(/^attention-/).first()).toBeVisible();
      },
    },
    {
      name: "Overview",
      show: async () => {
        await page.getByRole("button", { name: "Workspace" }).click();
        await page.getByRole("tab", { name: "Overview" }).click();
      },
      ready: () => expect(page.getByTestId("overview-tab")).toBeVisible(),
    },
    {
      name: "Specs (graph on)",
      show: async () => {
        await page.getByRole("tab", { name: "Specs" }).click();
        await expect(page.getByTestId("specv-live")).toBeVisible();
        const toggle = page.getByTestId("view-graph");
        if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "true");
        const file = page.getByTestId(/^file-toggle-/).first();
        if ((await file.getAttribute("aria-expanded")) !== "true") await file.click();
        await expect(page.getByTestId(/^item-toggle-/).first()).toBeVisible();
      },
      ready: () => expect(page.getByTestId("specv-live")).toBeVisible(),
    },
    {
      name: "Playbooks",
      show: () => nav(page, "Playbooks").click(),
      ready: () => expect(page.getByTestId("builtins-section")).toBeVisible(),
    },
    {
      name: "Settings",
      show: () => nav(page, "Settings").click(),
      ready: () => expect(page.getByTestId("captain-section")).toBeVisible(),
    },
  ];

  const setRail = async (open: boolean) => {
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    const control = page.getByRole("button", {
      name: open ? "Show the sidebar" : "Collapse the sidebar",
    });
    if (await control.isVisible()) await control.click();
    await expect(
      page.getByRole("button", { name: open ? "Collapse the sidebar" : "Show the sidebar" }),
    ).toBeVisible();
  };

  const defects: string[] = [];
  const started = Date.now();
  const log = (line: string) => {
    if (!process.env.SPEX_E2E_DEBUG) return;
    console.log(`[fit +${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`);
  };
  for (const surface of surfaces) {
    await page.setViewportSize({ width: 1280, height: HEIGHT });
    await surface.show();
    log(`${surface.name}: shown`);
    for (const railOpen of [false, true]) {
      await setRail(railOpen);
      let reference: string[] | undefined;
      for (const width of WIDTHS) {
        if (railOpen && width < OPEN_RAIL_MIN_WIDTH) continue;
        await page.setViewportSize({ width, height: HEIGHT });
        await surface.ready();
        const where = `${surface.name} · sidebar ${railOpen ? "open" : "collapsed"} · ${width}px`;
        const found = await measure(page);
        log(`${where}: measured`);
        for (const line of found.overflow) defects.push(`${where}: overflow — ${line}`);
        for (const line of found.overlap) defects.push(`${where}: ${line}`);
        // (iii) Names hold across widths: the widest measurement of
        // this sidebar state is the reference.
        if (!reference) {
          reference = found.names;
        } else if (found.names.length !== reference.length) {
          defects.push(
            `${where}: ${found.names.length} buttons, ${reference.length} at ${WIDTHS[WIDTHS.length - 1]}px`,
          );
        } else {
          found.names.forEach((name, index) => {
            if (name !== reference![index]) {
              defects.push(`${where}: button ${index} reads "${name}", "${reference![index]}" at the reference width`);
            }
          });
        }
      }
    }
  }
  // The collapsed rail's badge caps at "9+", the count in the name
  // (run-view-108).
  await setRail(false);
  await expect(page.getByTestId("nav-attention-badge")).toHaveText("9+");
  await expect(
    page.getByRole("button", { name: /^Dashboard — 10 need your attention$/ }),
  ).toBeVisible();

  expect(defects, defects.join("\n")).toEqual([]);
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The fit measurement (DR-041 §9), shared by the fit journeys: one
// reading of the current layout — sideways overflow, vertical fit,
// overlap and containment within the rows that lay controls side by
// side, and every button's accessible name — taken in the page, with
// the widths, heights and sidebar states the law is measured at.

import { expect, type Page } from "@playwright/test";

export const WIDTHS = [320, 480, 640, 800, 1024, 1280];
/** The law is measured in a tall window and a short one (DR-041 §9):
 * the shell fills either, and the surface scrolls inside its box. */
export const TALL = 800;
export const SHORT = 400;
export const HEIGHTS = [TALL, SHORT];
/** The open sidebar is 224px wide, so the 320px floor holds with it
 * collapsed (DR-041): the open state is measured from 480px. */
export const OPEN_RAIL_MIN_WIDTH = 480;

export interface Measured {
  /** Elements wider than their box outside a scrolling canvas. */
  overflow: string[];
  /** The page scrolling vertically, and outermost scroll containers
   * whose box ends past the bottom of the viewport. */
  vertical: string[];
  /** Sibling pairs that overlap, and children outside their parent,
   * within tab lists, toolbars, headers, list rows, and composer boxes. */
  overlap: string[];
  /** Every button's accessible name, in document order. */
  names: string[];
}

/** One measurement of the current layout, taken in the page. Extra
 * selectors name further rows whose siblings must not overlap. */
export async function measure(page: Page, containers: string[] = []): Promise<Measured> {
  // Two frames so container queries and the auto-growing field have
  // settled after a resize.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return page.evaluate((extraContainers: string[]) => {
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
    const scrollsDown = (el: Element): boolean => {
      const oy = styleOf(el).overflowY;
      return oy === "auto" || oy === "scroll";
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

    // (ii) Vertical fit: the page itself never scrolls, and every
    // surface scrolls inside a box that ends inside the viewport. A
    // scroll container nested in another one is skipped — its own
    // parent may have scrolled it out of sight, which is the point.
    const vertical: string[] = [];
    const viewportHeight = root.clientHeight;
    if (root.scrollHeight > root.clientHeight + TOLERANCE) {
      vertical.push(
        `document scrolls vertically: ${root.scrollHeight} > ${root.clientHeight}`,
      );
    }
    const inScroller = new Map<Element, boolean>();
    const insideScroller = (el: Element): boolean => {
      const known = inScroller.get(el);
      if (known !== undefined) return known;
      const parent = el.parentElement;
      const found = parent ? scrollsDown(parent) || insideScroller(parent) : false;
      inScroller.set(el, found);
      return found;
    };
    // A positioned box is carried by the page itself unless a scroll
    // box contains it: its containing block — the offset parent, or
    // the page for a fixed box — must be, or sit inside, something
    // that clips. Screen-reader-only text is the usual culprit: it is
    // absolutely positioned, one pixel tall, and invisible, so only
    // the page's height shows that it escaped.
    const contained = (el: HTMLElement): boolean => {
      let node: Element | null =
        styleOf(el).position === "fixed" ? null : el.offsetParent;
      while (node && node !== document.body && node !== root) {
        const style = styleOf(node);
        if (style.overflowY !== "visible" || style.overflowX !== "visible") {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      if (!(el instanceof HTMLElement)) continue;
      const style = styleOf(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const box = el.getBoundingClientRect();
      const positioned = style.position === "absolute" || style.position === "fixed";
      if (!positioned && (!scrollsDown(el) || insideScroller(el))) continue;
      if (box.height <= 0 || box.bottom <= viewportHeight + TOLERANCE) continue;
      if (positioned) {
        if (!contained(el)) {
          vertical.push(
            `${describe(el)} is positioned past the viewport with no scroll box containing it (bottom ${Math.round(box.bottom)} of ${viewportHeight})`,
          );
        }
      } else {
        vertical.push(
          `${describe(el)} scrolls but ends past the viewport (bottom ${Math.round(box.bottom)} of ${viewportHeight})`,
        );
      }
    }

    // (iii) Overlap and containment within the rows that lay controls
    // side by side.
    const overlap: string[] = [];
    const seen = new Set<Element>();
    const containers = Array.from(
      document.querySelectorAll(
        ['[role="tablist"]', '[role="toolbar"]', "header", "li", ...extraContainers].join(", "),
      ),
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

    // (iv) Accessible names of every button, in document order. The
    // Now row names the live run's current state, which advances
    // between measurements, and a Running row stands only while its
    // turn is in flight; both are live content, not chrome, so they
    // stay out of the stability check.
    const names = Array.from(document.querySelectorAll("button"))
      .filter(
        (button) =>
          !button.closest('[data-testid^="now-session-"]') &&
          !button.closest('[data-testid^="running-session-"]'),
      )
      .map((button) => {
        const label = button.getAttribute("aria-label");
        const text = (button.textContent ?? "").trim().replace(/\s+/g, " ");
        return label ?? (text || (button.getAttribute("title") ?? ""));
      });
    return { overflow, vertical, overlap, names };
  }, containers);
}

/** File one measurement's findings against the place it was taken. */
export function record(where: string, found: Measured, defects: string[]): void {
  for (const line of found.overflow) defects.push(`${where}: overflow — ${line}`);
  for (const line of found.vertical) defects.push(`${where}: vertical — ${line}`);
  for (const line of found.overlap) defects.push(`${where}: ${line}`);
}

/** Put the sidebar in the state to be measured, from a width where
 * both of its controls are reachable. */
export async function setRail(page: Page, railOpen: boolean): Promise<void> {
  await page.setViewportSize({ width: 1280, height: TALL });
  const control = page.getByRole("button", {
    name: railOpen ? "Show the sidebar" : "Collapse the sidebar",
  });
  if (await control.isVisible()) await control.click();
  await expect(
    page.getByRole("button", {
      name: railOpen ? "Collapse the sidebar" : "Show the sidebar",
    }),
  ).toBeVisible();
}

/** Names hold at every size: the reference is the first measurement
 * of a sidebar state; every later one must read the same buttons. */
export function compareNames(
  where: string,
  found: Measured,
  reference: string[] | undefined,
  defects: string[],
): string[] {
  if (!reference) return found.names;
  if (found.names.length !== reference.length) {
    defects.push(
      `${where}: ${found.names.length} buttons, ${reference.length} at the reference size`,
    );
  } else {
    found.names.forEach((name, index) => {
      if (name !== reference[index]) {
        defects.push(`${where}: button ${index} reads "${name}", "${reference[index]}" at the reference size`);
      }
    });
  }
  return reference;
}

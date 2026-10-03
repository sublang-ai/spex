// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A text field that grows with its text to a stated maximum and then
// scrolls (DR-041 §9): no native resize grip, and scrolling only when
// text exceeds the actual field box. The height follows its scroll height on every
// value change and on every change to the box the text wraps in —
// the field's own, since a divider drag or a collapsing sidebar
// rewraps the draft with no window resize behind it, and the window's,
// for the viewport share the maximum is capped at. `field-sizing:
// content` covers the first paint where the browser knows it, and the
// explicit height wins where it does. The field is never shorter than
// one row, whatever the viewport reports — a window laid out before it
// is shown reports no height at all.

import { useLayoutEffect, type RefObject } from "react";

/** Lines the field grows to before it scrolls. */
export const AUTO_GROW_MAX_LINES = 8;
/** The viewport share the field never exceeds. */
export const AUTO_GROW_MAX_VIEWPORT = 0.4;

/** Size one field to its text within the stated maximum. */
export function fitTextArea(
  el: HTMLTextAreaElement,
  maxLines = AUTO_GROW_MAX_LINES,
  boundary?: HTMLElement | null,
): void {
  // Measure from the collapsed height so a shortened text shrinks
  // the field back rather than keeping its tallest size.
  el.style.height = "auto";
  const wanted = el.scrollHeight;
  if (wanted === 0) {
    // No layout (an unpainted or simulated document): leave the
    // field to its rows.
    el.style.height = "";
    return;
  }
  const style = getComputedStyle(el);
  const line = parseFloat(style.lineHeight) || 20;
  const padding =
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0);
  const oneRow = line + padding;
  const max = Math.max(
    oneRow,
    Math.min(
      line * maxLines + padding,
      window.innerHeight * AUTO_GROW_MAX_VIEWPORT,
    ),
  );
  const preferred = Math.min(Math.max(wanted, oneRow), max);
  el.style.height = `${preferred}px`;
  // The boundary owns all its chrome. Yield only the field's spare
  // height before asking that box to scroll; its measured overflow
  // already includes the actual wrapped captions, notices and actions.
  // No second set of chrome dimensions is needed here.
  if (boundary && boundary.clientHeight > 0) {
    const excess = Math.max(0, boundary.scrollHeight - boundary.clientHeight);
    el.style.height = `${Math.max(oneRow, preferred - excess)}px`;
  }
  // CSS may shrink a field below its preferred size. Let the browser
  // show scrolling by its actual box, including below the growth cap.
  el.style.overflowY = boundary || wanted > max ? "auto" : "hidden";
}

export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxLines = AUTO_GROW_MAX_LINES,
  boundarySelector?: string,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const boundary = boundarySelector
      ? el.closest<HTMLElement>(boundarySelector)
      : null;
    let width = el.clientWidth;
    const boxes = new Map<HTMLElement, { width: number; height: number }>();
    const rememberBoxes = (): void => {
      for (const box of boxes.keys()) {
        boxes.set(box, { width: box.clientWidth, height: box.clientHeight });
      }
    };
    const refit = (): void => {
      fitTextArea(el, maxLines, boundary);
      // Read the settled dimensions after the height we wrote: the
      // resulting resize is not a new constraint to fit against.
      width = el.clientWidth;
      rememberBoxes();
    };
    refit();
    window.addEventListener("resize", refit);
    // Width decides wrapping; the boundary and its direct children
    // decide available room. Transcript descendants are not watched:
    // their streaming text stays in the pane's own scrolling box.
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            if (el.clientWidth === width && [...boxes].every(([box, size]) =>
              box.clientWidth === size.width && box.clientHeight === size.height)) return;
            refit();
          });
    observer?.observe(el);
    const watchChrome = (): void => {
      if (!boundary) return;
      const next = new Set([boundary, ...Array.from(boundary.children).filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      )]);
      for (const box of boxes.keys()) {
        if (!next.has(box)) {
          observer?.unobserve(box);
          boxes.delete(box);
        }
      }
      for (const box of next) {
        if (!boxes.has(box)) {
          boxes.set(box, { width: box.clientWidth, height: box.clientHeight });
          observer?.observe(box);
        }
      }
    };
    watchChrome();
    const children = boundary && typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => { watchChrome(); refit(); })
      : undefined;
    if (children && boundary) children.observe(boundary, { childList: true });
    return () => {
      observer?.disconnect();
      children?.disconnect();
      window.removeEventListener("resize", refit);
    };
  }, [ref, value, maxLines, boundarySelector]);
}

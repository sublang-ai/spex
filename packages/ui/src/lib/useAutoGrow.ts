// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A text field that grows with its text to a stated maximum and then
// scrolls (DR-041 §9): no native resize grip, no scrollbar before the
// maximum. The height follows the field's own scroll height on every
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
  el.style.height = `${Math.min(Math.max(wanted, oneRow), max)}px`;
  el.style.overflowY = wanted > max ? "auto" : "hidden";
}

export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxLines = AUTO_GROW_MAX_LINES,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    fitTextArea(el, maxLines);
    const refit = (): void => fitTextArea(el, maxLines);
    window.addEventListener("resize", refit);
    // The field's own width decides how the draft wraps, and the
    // gestures that change it — a divider drag, the sidebar folding,
    // panes stacking — move no window. Only a width change refits, so
    // the height this very effect writes cannot feed itself back.
    let width = el.clientWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            refit();
          });
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", refit);
    };
  }, [ref, value, maxLines]);
}

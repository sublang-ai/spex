// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A text field that grows with its text to a stated maximum and then
// scrolls (DR-041 §9): no native resize grip, no scrollbar before the
// maximum. The height follows the field's own scroll height on every
// value change; `field-sizing: content` covers the first paint where
// the browser knows it, and the explicit height wins where it does.

import { useLayoutEffect, type RefObject } from "react";

/** Lines the field grows to before it scrolls. */
export const AUTO_GROW_MAX_LINES = 8;
/** The viewport share the field never exceeds. */
export const AUTO_GROW_MAX_VIEWPORT = 0.4;

export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxLines = AUTO_GROW_MAX_LINES,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
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
    const max = Math.min(
      line * maxLines + padding,
      window.innerHeight * AUTO_GROW_MAX_VIEWPORT,
    );
    el.style.height = `${Math.min(wanted, max)}px`;
    el.style.overflowY = wanted > max ? "auto" : "hidden";
  }, [ref, value, maxLines]);
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The house popover idiom (DR-009, DR-010 §6), one hook behind every
// anchored menu and editor: focus moves into the popover when it
// opens and returns to its trigger when it closes; Escape and a click
// outside close it; a menu also walks its items with the arrow keys
// and closes on Tab. Closing never strands focus on the page body.

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PopoverOptions {
  /** The control that opened the popover: a click on it is not an
   * outside click, and focus returns to it on close. */
  anchorRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** A menu walks its items with ↑/↓ and Home/End, and Tab closes it
   * (the menu-button pattern); an editor keeps its natural tab order. */
  menu?: boolean;
}

/** Wire a popover while `open`; the returned ref goes on its root. */
export function usePopover<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  { anchorRef, onClose, menu = false }: PopoverOptions,
): RefObject<T | null> {
  const rootRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    root?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (!menu || !root) return;
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      const step =
        event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowUp"
            ? -1
            : event.key === "Home" || event.key === "End"
              ? 0
              : undefined;
      if (step === undefined) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (at + step + items.length) % items.length;
      items[next]?.focus();
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      // Focus goes home only when closing would strand it: a user who
      // already moved on (Tab out of an editor) keeps their place.
      const active = document.activeElement;
      const stranded =
        !active ||
        active === document.body ||
        !active.isConnected ||
        root?.contains(active) === true;
      if (!stranded) return;
      const home = anchorRef?.current?.isConnected
        ? anchorRef.current
        : opener?.isConnected
          ? opener
          : null;
      home?.focus();
    };
    // The anchor ref object is stable; onClose is read through closeRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, menu]);

  return rootRef;
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Shared IM scroll behavior (DR-010 §1): stick to bottom while the
// user is there, stop when they scroll up, and surface a jump pill
// when new content lands below the fold.
//
// Only the reader detaches a pane from its end (run-view-120). A pane
// that changes size — the sidebar folding, a divider dragged, a lane
// opening — is chrome moving, not reading; its reflow both moves the
// scroll position and fires a scroll event, and the page fires that
// event before it delivers the size change, so the box as last seen is
// what tells the two apart.

import { useEffect, useRef, useState } from "react";

export function useStickToBottom(contentKey: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);
  /** The pane's own box as last seen. A resize's reflow fires a scroll
   * event of its own, and the page fires it before it delivers the
   * size change, so the box is what tells the two apart. */
  const boxRef = useRef({ width: 0, height: 0 });
  const [detached, setDetached] = useState(false);
  const [newBelow, setNewBelow] = useState(false);

  // Runs on every content change: follow the bottom while stuck,
  // otherwise flag that something new arrived below.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stuckRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      setNewBelow(true);
    }
    // contentKey is the effect's real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  // The box's own size changing is chrome, never the reader: re-pin
  // to the end the resize moved.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    boxRef.current = { width: el.clientWidth, height: el.clientHeight };
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      boxRef.current = { width: el.clientWidth, height: el.clientHeight };
      if (stuckRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function onScroll(event: React.UIEvent<HTMLDivElement>): void {
    const el = event.currentTarget;
    if (
      el.clientWidth !== boxRef.current.width ||
      el.clientHeight !== boxRef.current.height
    ) {
      // The box moved under the reader, and the page delivers this
      // scroll before the size change: a pane at its end stays there.
      boxRef.current = { width: el.clientWidth, height: el.clientHeight };
      if (stuckRef.current) {
        el.scrollTop = el.scrollHeight;
        return;
      }
    }
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    stuckRef.current = atBottom;
    setDetached(!atBottom);
    if (atBottom) setNewBelow(false);
  }

  function jump(): void {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stuckRef.current = true;
    setDetached(false);
    setNewBelow(false);
  }

  return { scrollRef, onScroll, detached, newBelow, jump, stuckRef };
}

/** Floating "new content below" pill; render inside a relative parent
 * wrapping the scroll container. */
export function jumpPillClasses(): string {
  return "absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white shadow hover:bg-brand-500";
}

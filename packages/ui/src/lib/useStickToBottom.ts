// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Follow rendered geometry, including cards and media that resize without
// changing a transcript counter. Only actual reader movement detaches a pane.
import { useEffect, useRef, useState } from "react";

interface Geometry {
  width: number;
  height: number;
  content: number;
  top: number;
}

function measure(el: HTMLDivElement): Geometry {
  return {
    width: el.clientWidth,
    height: el.clientHeight,
    content: el.scrollHeight,
    top: el.scrollTop,
  };
}

function atBottom(box: Geometry): boolean {
  return box.content - box.top - box.height < 40;
}

function movedUp(before: Geometry, next: Geometry): boolean {
  // Shrinking content/viewport reflow can clamp the native position; that
  // clamp alone is not reader movement. Read the actual position, not the
  // requested scrollHeight used to pin (which is beyond the native maximum).
  const clamped = Math.min(before.top, Math.max(0, next.content - next.height));
  return next.top < clamped - 1 && !atBottom(next);
}

export function useStickToBottom(contentKey: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // A callback ref also reconnects the observer when a folded player remounts.
  const [content, contentRef] = useState<HTMLDivElement | null>(null);
  const stuckRef = useRef(true);
  const boxRef = useRef<Geometry>({ width: 0, height: 0, content: 0, top: 0 });
  const [detached, setDetached] = useState(false);
  const [newBelow, setNewBelow] = useState(false);

  function pin(el: HTMLDivElement): void {
    el.scrollTop = el.scrollHeight;
    boxRef.current = measure(el);
  }

  function resized(el: HTMLDivElement, newContent: boolean): void {
    const box = measure(el);
    const before = boxRef.current;
    // A real scroll may already have moved the element while its scroll
    // event is still queued behind this ResizeObserver/content callback.
    if (stuckRef.current && movedUp(before, box)) {
      stuckRef.current = false;
      setDetached(true);
    }
    if (stuckRef.current) {
      pin(el);
    } else {
      boxRef.current = box;
      if (newContent || box.content > before.content) setNewBelow(true);
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (el) resized(el, true);
    // contentKey reports new text; geometry observation handles the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !content) return;
    resized(el, false);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => resized(el, false));
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
    // The mounted content owns both observed elements and their cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  function onScroll(event: React.UIEvent<HTMLDivElement>): void {
    const el = event.currentTarget;
    const box = measure(el);
    const before = boxRef.current;
    const geometryChanged =
      box.width !== before.width ||
      box.height !== before.height ||
      box.content !== before.content;
    if (stuckRef.current && geometryChanged && !movedUp(before, box)) {
      // A queued event from our earlier pin may arrive after content grows.
      // Its unchanged position does not mean the reader scrolled away.
      pin(el);
      return;
    }
    const following = atBottom(box);
    stuckRef.current = following;
    boxRef.current = box;
    setDetached(!following);
    if (following) setNewBelow(false);
  }

  function jump(): void {
    const el = scrollRef.current;
    if (!el) return;
    pin(el);
    stuckRef.current = true;
    setDetached(false);
    setNewBelow(false);
  }

  return { scrollRef, contentRef, onScroll, detached, newBelow, jump, stuckRef };
}

/** Floating "new content below" pill; render inside a relative parent
 * wrapping the scroll container. */
export function jumpPillClasses(): string {
  return "absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white shadow hover:bg-brand-500";
}

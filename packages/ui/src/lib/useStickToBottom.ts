// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Shared IM scroll behavior (DR-010 §1): stick to bottom while the
// user is there, stop when they scroll up, and surface a jump pill
// when new content lands below the fold.

import { useEffect, useRef, useState } from "react";

export function useStickToBottom(contentKey: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);
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

  function onScroll(event: React.UIEvent<HTMLDivElement>): void {
    const el = event.currentTarget;
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

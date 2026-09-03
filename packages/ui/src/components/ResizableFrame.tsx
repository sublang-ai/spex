// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A capped frame (DR-030): a scroll box that holds content of
// unbounded length at a height the reader sets. The divider idiom
// turned horizontal — the bottom edge drags, arrow keys nudge it a
// step at a time, Home and a double-click restore the default, the
// height is bounded and remembered per frame as chrome preference.
// The grip stands only while content waits past the edge: a frame its
// content fits has nothing to page through, so it takes that
// content's height and offers nothing to pull.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { useAppStore } from "../state/store.js";

export interface ResizableFrameProps extends HTMLAttributes<HTMLElement> {
  /** Frame identity: what the remembered height is remembered under. */
  frameId: string;
  /** The grip's accessible name, e.g. "Resize History". */
  label: string;
  /** Pixels per step — a row for a list, a rem for a text box — so a
   * frame stated in rows stays exact. */
  unit: number;
  defaultSteps: number;
  minSteps: number;
  maxSteps: number;
  /** The scrolling element itself; a list frame is a `ul`. */
  as?: "ul" | "div";
  /** Classes for the wrapper holding the box and its grip. */
  outerClassName?: string;
  /** Told whenever content starts or stops running past the frame, so
   * the caller can draw its own cut edges or take focus. */
  onOverflow?: (overflowing: boolean) => void;
  /** Test id of the scroll box; the grip takes it with `-grip`. */
  "data-testid"?: string;
  children?: ReactNode;
}

export function ResizableFrame({
  frameId,
  label,
  unit,
  defaultSteps,
  minSteps,
  maxSteps,
  as: Box = "div",
  outerClassName,
  onOverflow,
  className,
  style,
  children,
  ...rest
}: ResizableFrameProps) {
  // The height is chrome preference, held where the rail's state and
  // the Captain split are held (DR-030); a frame with none, or one
  // remembered outside this frame's bounds, stands at its default.
  const stored = useAppStore((state) => state.frameHeights[frameId]);
  const setFrameHeight = useAppStore((state) => state.setFrameHeight);
  const steps =
    stored !== undefined && stored >= minSteps && stored <= maxSteps
      ? Math.round(stored)
      : defaultSteps;
  const [overflowing, setOverflowing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; steps: number }>({ y: 0, steps });

  const apply = useCallback(
    (next: number): void => {
      setFrameHeight(
        frameId,
        Math.min(maxSteps, Math.max(minSteps, Math.round(next))),
      );
    },
    [frameId, maxSteps, minSteps, setFrameHeight],
  );

  const read = useCallback((): void => {
    const el = boxRef.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, []);

  // Whether content runs past the edge is measured, never counted, so
  // a frame the reader resized answers for itself. Content changes
  // arrive with a render, so the read rides every one of them.
  useLayoutEffect(read);

  // The box also changes size without a render — a window resize, a
  // pane divider moving — and the observer catches those.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [read]);

  useEffect(() => {
    onOverflow?.(overflowing);
  }, [overflowing, onOverflow]);

  const testId = rest["data-testid"];

  return (
    <div className={outerClassName}>
      <Box
        // A scroll box is a positioned box, so what it holds is
        // contained by it rather than carried by the page (DR-041 §9).
        ref={boxRef as never}
        data-overflowing={overflowing ? "true" : undefined}
        className={`relative overflow-y-auto ${className ?? ""}`}
        style={{ maxHeight: `${steps * unit}px`, ...style }}
        {...rest}
      >
        {children}
      </Box>
      {overflowing ? (
        <div
          data-testid={testId ? `${testId}-grip` : undefined}
          data-dragging={dragging ? "1" : "0"}
          role="separator"
          aria-orientation="horizontal"
          aria-label={label}
          aria-valuenow={steps}
          aria-valuemin={minSteps}
          aria-valuemax={maxSteps}
          tabIndex={0}
          onPointerDown={(event) => {
            drag.current = { y: event.clientY, steps };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (!dragging) return;
            apply(drag.current.steps + (event.clientY - drag.current.y) / unit);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            setDragging(false);
          }}
          onDoubleClick={() => apply(defaultSteps)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") apply(steps - 1);
            else if (event.key === "ArrowDown") apply(steps + 1);
            else if (event.key === "Home") apply(defaultSteps);
            else return;
            event.preventDefault();
          }}
          // A 24px hit target carrying a drawn handle: the frame's
          // bottom edge is a control, so it is reachable by pointer
          // and by key, and says so by its shape rather than by its
          // colour alone (DR-010 §6/§7).
          className="group flex h-6 w-full cursor-row-resize touch-none items-center justify-center focus:outline-none"
        >
          <span
            aria-hidden
            className={`h-1 w-8 rounded-full ${
              dragging
                ? "bg-brand-500"
                : "bg-neutral-300 group-hover:bg-neutral-400 group-focus-visible:bg-brand-500 group-focus-visible:ring-2 group-focus-visible:ring-brand-400 dark:bg-neutral-700 dark:group-hover:bg-neutral-600"
            }`}
          />
        </div>
      ) : null}
    </div>
  );
}

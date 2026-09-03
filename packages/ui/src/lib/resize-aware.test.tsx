// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-106 / run-view-120: the composer field and the transcript
// panes follow their own boxes, not the window. A divider drag, the
// sidebar folding, and panes stacking all resize a pane with no window
// resize behind them, and both mechanisms went stale on exactly that.

import { afterEach, describe, expect, test } from "vitest";
import { useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";

afterEach(cleanup);

import { useAutoGrow } from "./useAutoGrow.js";
import { useStickToBottom } from "./useStickToBottom.js";

const restore: (() => void)[] = [];
afterEach(() => {
  while (restore.length) restore.pop()!();
});

/** A stand-in for the browser's ResizeObserver: a simulated document
 * has none, so a box's own size change is delivered by hand. */
function observeResizes(): { fire(target: Element): void } {
  interface Watcher {
    target: Element;
    fire(): void;
  }
  const watchers = new Set<Watcher>();
  const previous = Reflect.get(globalThis, "ResizeObserver");
  class Stub {
    private readonly mine = new Set<Watcher>();
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element): void {
      const watcher: Watcher = {
        target,
        fire: () => this.callback([], this as unknown as ResizeObserver),
      };
      this.mine.add(watcher);
      watchers.add(watcher);
    }
    unobserve(): void {}
    disconnect(): void {
      for (const watcher of this.mine) watchers.delete(watcher);
      this.mine.clear();
    }
  }
  Reflect.set(globalThis, "ResizeObserver", Stub);
  restore.push(() => {
    if (previous === undefined) Reflect.deleteProperty(globalThis, "ResizeObserver");
    else Reflect.set(globalThis, "ResizeObserver", previous);
  });
  return {
    fire(target: Element): void {
      for (const watcher of [...watchers]) {
        if (watcher.target === target) watcher.fire();
      }
    },
  };
}

/** Give an element the geometry a painted document would report. */
function measured(
  el: HTMLElement,
  values: Record<string, () => number>,
): void {
  for (const [key, get] of Object.entries(values)) {
    Object.defineProperty(el, key, { configurable: true, get });
  }
}

describe("run-view-106: the field refits when its own box resizes", () => {
  function Field({ value }: { value: string }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useAutoGrow(ref, value);
    return <textarea data-testid="field" ref={ref} value={value} readOnly />;
  }

  test("a narrower field grows to the lines the draft now needs", () => {
    const observers = observeResizes();
    render(<Field value="a draft long enough to wrap" />);
    const field = screen.getByTestId("field") as HTMLTextAreaElement;
    // The field is 500px wide and the draft fits in three rows.
    const box = { width: 500, wanted: 60 };
    measured(field, {
      clientWidth: () => box.width,
      scrollHeight: () => box.wanted,
    });
    act(() => observers.fire(field));
    expect(field.style.height).toBe("60px");

    // The sidebar opens: the field narrows with no window resize, and
    // the same draft now wraps to six rows.
    box.width = 320;
    box.wanted = 120;
    act(() => observers.fire(field));
    expect(field.style.height).toBe("120px");
    // Under the maximum it never shows a scrollbar of its own.
    expect(field.style.overflowY).toBe("hidden");

    // The height this very fit wrote is not a reason to fit again:
    // only a width change refits, so the observer cannot feed itself.
    box.wanted = 999;
    act(() => observers.fire(field));
    expect(field.style.height).toBe("120px");
  });
});

describe("run-view-120: a pane at its end keeps following through a resize", () => {
  function Pane({ contentKey }: { contentKey: number }) {
    const { scrollRef, onScroll, detached } = useStickToBottom(contentKey);
    return (
      <div
        data-testid="pane"
        ref={scrollRef}
        onScroll={onScroll}
        data-detached={detached ? "1" : "0"}
      />
    );
  }

  test("a narrowing pane re-pins rather than counting as a scroll away", () => {
    const observers = observeResizes();
    render(<Pane contentKey={1} />);
    const pane = screen.getByTestId("pane");
    // A simulated document has no scrolling box; the pane reports the
    // geometry a painted one would.
    const box = { height: 440, top: 0 };
    Object.defineProperty(pane, "scrollTop", {
      configurable: true,
      get: () => box.top,
      set: (next: number) => {
        box.top = next;
      },
    });
    measured(pane, { scrollHeight: () => box.height, clientHeight: () => 240 });

    // The reader is at the end.
    act(() => observers.fire(pane));
    expect(box.top).toBe(440);

    // The pane narrows: the same transcript now needs 712px, and
    // scroll anchoring would leave the reader 170px above the end.
    box.height = 712;
    act(() => observers.fire(pane));
    expect(box.top).toBe(712);
    expect(pane.getAttribute("data-detached")).toBe("0");
  });

  test("the scroll a resize fires does not read as the reader leaving", () => {
    const observers = observeResizes();
    render(<Pane contentKey={1} />);
    const pane = screen.getByTestId("pane");
    const box = { height: 440, top: 0, client: 240 };
    Object.defineProperty(pane, "scrollTop", {
      configurable: true,
      get: () => box.top,
      set: (next: number) => {
        box.top = next;
      },
    });
    measured(pane, {
      scrollHeight: () => box.height,
      clientHeight: () => box.client,
      clientWidth: () => 600,
    });
    act(() => observers.fire(pane));
    expect(box.top).toBe(440);

    // The pane narrows: the reflow moves the position and fires its
    // own scroll event, which arrives before the size change does.
    box.client = 180;
    box.height = 712;
    box.top = 302;
    act(() => {
      pane.dispatchEvent(new Event("scroll"));
    });
    expect(box.top).toBe(712);
    expect(pane.getAttribute("data-detached")).toBe("0");
  });

  test("a reader who scrolls up is left where they went", () => {
    const observers = observeResizes();
    render(<Pane contentKey={1} />);
    const pane = screen.getByTestId("pane");
    const box = { height: 440, top: 440 };
    Object.defineProperty(pane, "scrollTop", {
      configurable: true,
      get: () => box.top,
      set: (next: number) => {
        box.top = next;
      },
    });
    measured(pane, { scrollHeight: () => box.height, clientHeight: () => 240 });
    // One resize so the pane knows the box the reader then scrolls in.
    act(() => observers.fire(pane));

    box.top = 40;
    act(() => {
      pane.dispatchEvent(new Event("scroll"));
    });
    expect(pane.getAttribute("data-detached")).toBe("1");
    // Chrome moving does not drag them back down.
    box.height = 712;
    act(() => observers.fire(pane));
    expect(box.top).toBe(40);
  });
});

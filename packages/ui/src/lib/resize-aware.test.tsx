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
import { CaptainPane } from "../components/CaptainPane.js";
import { applyRecords, initialSessionView } from "../state/reducer.js";
import type { TmuxPlayRecord } from "@sublang/spex-core/protocol";
import type { MachineGraph } from "@sublang/spex-core/protocol";
import { MACHINE_RUN } from "../fixtures/sample-run.js";

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
    // Without a containing chrome boundary, the preferred cap controls scrolling.
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
    const { scrollRef, contentRef, onScroll, detached } = useStickToBottom(contentKey);
    return (
      <div
        data-testid="pane"
        ref={scrollRef}
        onScroll={onScroll}
        data-detached={detached ? "1" : "0"}
      >
        <div ref={contentRef} />
      </div>
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
        box.top = Math.max(0, Math.min(next, box.height - 240));
      },
    });
    measured(pane, { scrollHeight: () => box.height, clientHeight: () => 240 });

    // The reader is at the end.
    act(() => observers.fire(pane));
    expect(box.top).toBe(200);

    // The pane narrows: the same transcript now needs 712px, and
    // scroll anchoring would leave the reader 170px above the end.
    box.height = 712;
    act(() => observers.fire(pane));
    expect(box.top).toBe(472);
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
        box.top = Math.max(0, Math.min(next, box.height - box.client));
      },
    });
    measured(pane, {
      scrollHeight: () => box.height,
      clientHeight: () => box.client,
      clientWidth: () => 600,
    });
    act(() => observers.fire(pane));
    expect(box.top).toBe(200);

    // The pane narrows: the reflow moves the position and fires its
    // own scroll event, which arrives before the size change does.
    box.client = 180;
    box.height = 712;
    box.top = 302;
    act(() => {
      pane.dispatchEvent(new Event("scroll"));
    });
    expect(box.top).toBe(532);
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
        box.top = Math.max(0, Math.min(next, box.height - 240));
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

describe("run-view-163: a final reply and settlement render together", () => {
  test.each([false, true])("preserves the reader's following choice (scrolled up: %s)", (scrolledUp) => {
    const observers = observeResizes();
    const record = (seq: number, fields: Record<string, unknown>) => ({
      seq,
      record: { timestamp: 1_700_000_000_000 + seq, turnId: 1, ...fields } as unknown as TmuxPlayRecord,
    });
    const view = applyRecords(initialSessionView([]), [record(1, {
      type: "turn_started", turn: { id: 1, prompt: "Complete the change" },
    })]);
    const { rerender } = render(<CaptainPane view={view} />);
    const pane = screen.getByTestId("captain-pane").querySelector<HTMLElement>(".overflow-y-auto")!;
    const box = { height: 800, top: 0 };
    measured(pane, {
      clientWidth: () => 600,
      clientHeight: () => 240,
      scrollHeight: () => box.height,
    });
    Object.defineProperty(pane, "scrollTop", {
      configurable: true,
      get: () => box.top,
      set: (next: number) => { box.top = Math.max(0, Math.min(next, box.height - 240)); },
    });
    act(() => observers.fire(pane));
    expect(box.top).toBe(560);
    if (scrolledUp) {
      box.top = 40;
      act(() => { pane.dispatchEvent(new Event("scroll")); });
    }

    // The last reply adds one line while settlement removes the active
    // turn. Summing these independent inputs would hide the new content.
    box.height = 920;
    applyRecords(view, [
      record(2, { type: "captain_reply", text: "The requested change is ready." }),
      record(3, { type: "turn_finished" }),
    ]);
    rerender(<CaptainPane view={view} />);
    expect(screen.getByText("The requested change is ready.")).toBeTruthy();
    expect(box.top).toBe(scrolledUp ? 40 : 680);
    expect(screen.queryByRole("button", { name: "↓ Latest" }) !== null).toBe(scrolledUp);
  });
});

describe("run-view-163: live machine content follows before a queued scroll", () => {
  test.each([false, true])("preserves the reader's choice across frame and graph changes (scrolled up: %s)", (scrolledUp) => {
    const observers = observeResizes();
    const view = applyRecords(initialSessionView([]), MACHINE_RUN.slice(0, 2));
    const { rerender } = render(<CaptainPane view={view} />);
    const pane = screen.getByTestId("captain-pane").querySelector<HTMLElement>(".overflow-y-auto")!;
    const box = { height: 400, top: 0 };
    measured(pane, {
      clientWidth: () => 336,
      clientHeight: () => 118,
      scrollHeight: () => box.height,
    });
    Object.defineProperty(pane, "scrollTop", {
      configurable: true,
      get: () => box.top,
      set: (next: number) => { box.top = Math.max(0, Math.min(next, box.height - 118)); },
    });
    act(() => observers.fire(pane));
    expect(box.top).toBe(282);
    if (scrolledUp) {
      box.top = 40;
      act(() => { pane.dispatchEvent(new Event("scroll")); });
    }
    const textCount = view.captain.length;
    // A real trace opens the live machine without adding a chat line.
    // The earlier programmatic scroll is still queued while this mounts.
    box.height = 585;
    applyRecords(view, MACHINE_RUN.slice(2, 3));
    expect(view.captain).toHaveLength(textCount);
    rerender(<CaptainPane view={view} />);
    expect(screen.getByTestId("live-machines")).toBeTruthy();
    act(() => { pane.dispatchEvent(new Event("scroll")); });
    expect(box.top).toBe(scrolledUp ? 40 : 467);
    expect(screen.queryByRole("button", { name: "↓ Latest" }) !== null).toBe(scrolledUp);

    // A frame supplied without a captured definition can acquire its
    // current drawing independently of the text/trace. Captured graphs
    // remain immutable; this exercises the component's supplied-graph path.
    delete view.frames[0].historicalGraph;
    const graph: MachineGraph = {
      initial: "ready",
      nodes: [{ id: "ready", kind: "state", tags: [] }, { id: "done", kind: "final", tags: [] }],
      edges: [{ id: "ready::COMPLETE::done", from: "ready", to: "done", event: "COMPLETE" }],
    };
    box.height = 785;
    rerender(<CaptainPane view={view} machineGraphs={{ code: graph }} />);
    expect(screen.getByTestId("machine-state-t-code-done")).toBeTruthy();
    act(() => { pane.dispatchEvent(new Event("scroll")); });
    expect(box.top).toBe(scrolledUp ? 40 : 667);
    expect(screen.queryByRole("button", { name: "↓ Latest" }) !== null).toBe(scrolledUp);
  });
});

describe("run-view-163: content changes without a new line", () => {
  test.each([false, true])("follows coalesced records and same-count extras only while attached (scrolled up: %s)", (scrolledUp) => {
    const observers = observeResizes();
    const failure = (seq: number) => ({ seq, record: {
      type: "runtime_error", timestamp: seq, turnId: 1, message: "The runtime refused the operation.",
    } as unknown as TmuxPlayRecord });
    const view = applyRecords(initialSessionView([]), [failure(1)]);
    let extras = [{ key: "delivery", afterIndex: 0, node: <div>Awaiting verdict</div> }];
    const { rerender } = render(<CaptainPane view={view} extras={extras} />);
    const pane = screen.getByTestId("captain-pane").querySelector<HTMLElement>(".overflow-y-auto")!;
    const box = { height: 400, top: 0 };
    measured(pane, { clientWidth: () => 336, clientHeight: () => 118, scrollHeight: () => box.height });
    Object.defineProperty(pane, "scrollTop", {
      configurable: true, get: () => box.top,
      set: (next: number) => { box.top = Math.max(0, Math.min(next, box.height - 118)); },
    });
    act(() => observers.fire(pane));
    if (scrolledUp) {
      box.top = 40;
      act(() => { pane.dispatchEvent(new Event("scroll")); });
    }
    // The reducer coalesces the repeated failure, retaining one line.
    applyRecords(view, [failure(2)]);
    expect(view.captain).toHaveLength(1);
    expect(view.captain[0].count).toBe(2);
    box.height = 440;
    rerender(<CaptainPane view={view} extras={extras} />);
    expect(box.top).toBe(scrolledUp ? 40 : 322);
    const seq = view.lastSeq;
    extras = [{ key: "delivery", afterIndex: 0, node: <div>Confirmed with a detailed delivery summary</div> }];
    box.height = 520;
    rerender(<CaptainPane view={view} extras={extras} />);
    expect(view.lastSeq).toBe(seq);
    expect(extras).toHaveLength(1);
    expect(screen.getByText("Confirmed with a detailed delivery summary")).toBeTruthy();
    expect(box.top).toBe(scrolledUp ? 40 : 402);
    expect(screen.queryByRole("button", { name: "↓ Latest" }) !== null).toBe(scrolledUp);
  });
});

describe("run-view-163: detached growth retains its Latest notice", () => {
  test.each(["scroll-first", "resize-first"])("offers Latest when growth is reported %s", (ordering) => {
    const observers = observeResizes();
    const view = applyRecords(initialSessionView([]), MACHINE_RUN.slice(0, 2));
    render(<CaptainPane view={view} />);
    const pane = screen.getByTestId("captain-pane").querySelector<HTMLElement>(".overflow-y-auto")!;
    const box = { height: 400, top: 0 };
    measured(pane, { clientWidth: () => 336, clientHeight: () => 118, scrollHeight: () => box.height });
    Object.defineProperty(pane, "scrollTop", {
      configurable: true, get: () => box.top,
      set: (next: number) => { box.top = Math.max(0, Math.min(next, box.height - 118)); },
    });
    act(() => observers.fire(pane));
    expect(box.top).toBe(282);
    box.top = 150;
    act(() => { pane.dispatchEvent(new Event("scroll")); });
    expect(screen.queryByRole("button", { name: "↓ Latest" })).toBeNull();

    // Late content can grow without a React transcript/key update. The
    // browser may report its queued scroll before the resize notification.
    pane.firstElementChild!.append(document.createElement("div"));
    box.height = 500;
    act(() => {
      if (ordering === "resize-first") observers.fire(pane);
      pane.dispatchEvent(new Event("scroll"));
      if (ordering === "scroll-first") observers.fire(pane);
    });
    expect(box.top).toBe(150);
    const latest = screen.getByRole("button", { name: "↓ Latest" });
    act(() => { latest.click(); });
    expect(box.top).toBe(382);
    expect(screen.queryByRole("button", { name: "↓ Latest" })).toBeNull();
  });
});

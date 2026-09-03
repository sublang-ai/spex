// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The placement behind every anchored popover (DR-041 §9): whatever
// the anchor's own place, the dialog lands inside the box that must
// show it, and a dialog with nowhere to go keeps its leading edge.

import { describe, expect, test } from "vitest";

import { fitOffset, POPOVER_INSET as INSET } from "./popover-fit.js";

const pane = { left: 56, top: 0, width: 264, height: 800 };

describe("settings-33/playbook-library-43: a popover lands inside its box", () => {
  test("a box already inside is left where it is", () => {
    expect(fitOffset({ left: 100, top: 100, width: 120, height: 200 }, pane)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  test("a right-anchored dialog hanging off the left edge moves in", () => {
    // 384px pinned to an anchor near the pane's left edge.
    const box = { left: -140, top: 40, width: 248, height: 300 };
    const { dx } = fitOffset(box, pane);
    expect(box.left + dx).toBe(pane.left + INSET);
  });

  test("a left-anchored dialog running past the right edge moves in", () => {
    const box = { left: 200, top: 40, width: 248, height: 300 };
    const { dx } = fitOffset(box, pane);
    expect(box.left + box.width + dx).toBe(pane.left + pane.width - INSET);
  });

  test("a dialog wider than the room keeps its leading edge", () => {
    const box = { left: 10, top: 0, width: 500, height: 100 };
    const { dx } = fitOffset(box, pane);
    expect(box.left + dx).toBe(pane.left + INSET);
  });

  test("a dialog opening past the top or the bottom moves along that axis", () => {
    const short = { left: 0, top: 0, width: 900, height: 400 };
    expect(fitOffset({ left: 10, top: -156, width: 200, height: 386 }, short).dy).toBe(
      156 + INSET,
    );
    expect(fitOffset({ left: 10, top: 300, width: 200, height: 200 }, short).dy).toBe(
      -(300 + 200 - (400 - INSET)),
    );
  });
});

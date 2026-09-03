// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A forge row yields (forge-work-lists-1, DR-041): at most two label
// tags show, the rest fold into a "+N" tag that lists every label,
// the tags leave the row below 28rem with their words in its title,
// and no chip in the trailing cluster refuses to shrink.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { DerivedIntent } from "@sublang/spex-core/protocol";

import { ForgeItemRow } from "./ForgeItemRow.js";

afterEach(cleanup);

const ITEM = {
  number: 7,
  title: "Fix the bug",
  url: "https://github.com/x/y/issues/7",
  updatedAt: 1,
};

describe("forge-work-lists-1: label tags cap at two", () => {
  test("two labels show as they are", () => {
    render(
      <ul>
        <ForgeItemRow
          item={{ ...ITEM, labels: ["bug", "urgent"] } as never}
          kind="issue"
          onQueue={() => {}}
          testId="row"
        />
      </ul>,
    );
    const row = screen.getByTestId("row");
    expect(row.textContent).toContain("bug");
    expect(row.textContent).toContain("urgent");
    expect(screen.queryByTestId("row-more-labels")).toBeNull();
  });

  test("more than two fold into +N with every label in its title", () => {
    render(
      <ul>
        <ForgeItemRow
          item={{ ...ITEM, labels: ["bug", "urgent", "auth", "needs-repro"] } as never}
          kind="issue"
          onQueue={() => {}}
          testId="row"
        />
      </ul>,
    );
    const row = screen.getByTestId("row");
    expect(row.textContent).toContain("bug");
    expect(row.textContent).toContain("urgent");
    expect(row.textContent).not.toContain("needs-repro");
    const more = screen.getByTestId("row-more-labels");
    expect(more.textContent).toBe("+2");
    expect(more.title).toBe("bug, urgent, auth, needs-repro");
    expect(more.getAttribute("aria-label")).toBe("2 more labels: auth, needs-repro");
  });
});

describe("forge-work-lists-1: the trailing cluster yields before the row widens", () => {
  test("the tags leave a narrow row, their words kept in its title", () => {
    render(
      <ul>
        <ForgeItemRow
          item={{ ...ITEM, labels: ["documentation", "help wanted", "auth"] } as never}
          kind="issue"
          onQueue={() => {}}
          testId="row"
        />
      </ul>,
    );
    const row = screen.getByTestId("row");
    expect(row.className).toContain("@container");
    // Every tag is gated on the row's own width, not the window's.
    for (const tag of ["documentation", "help wanted"]) {
      const chip = screen.getByTitle(tag);
      expect(chip.className).toContain("hidden");
      expect(chip.className).toContain("@md:inline-block");
      expect(chip.className).toContain("max-w-24");
    }
    const more = screen.getByTestId("row-more-labels");
    expect(more.className).toContain("hidden");
    expect(more.className).toContain("@md:inline-block");
    expect(screen.getByRole("link").title).toBe(
      "Fix the bug — documentation, help wanted, auth",
    );
  });

  test("the captured state is bounded and truncates", () => {
    const derived = {
      intent: { id: "i1", projectId: "p1", text: "Address #7", rank: "1a", createdAt: 1 },
      state: "interrupted",
      reason: "permission",
    } as unknown as DerivedIntent;
    render(
      <ul>
        <ForgeItemRow
          item={ITEM as never}
          kind="issue"
          captured={derived}
          onQueue={() => {}}
          testId="row"
        />
      </ul>,
    );
    const state = screen.getByTestId("row-state");
    expect(state.textContent).toBe("awaiting permission");
    expect(state.className).toContain("max-w-24");
    expect(state.className).toContain("truncate");
    expect(state.className).not.toContain("shrink-0");
    expect(state.title).toBe("awaiting permission (interrupted)");
  });
});

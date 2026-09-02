// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A forge row yields (forge-work-lists-1, DR-041): at most two label
// tags show, the rest fold into a "+N" tag that lists every label.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

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

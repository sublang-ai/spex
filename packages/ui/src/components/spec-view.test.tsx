// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SPECV-1..9 component coverage: the spec view rendered from a
// fixture SpecTreeState — outline shape, package nodes, document
// order with sections, filters, search, citation jumps, records
// reader, and the empty state.

import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

afterEach(cleanup);

import { SpecView, initialSpecViewState } from "./SpecView.js";
import type { SpecTreeState } from "@sublang/spex-core/protocol";

const TREE: SpecTreeState = {
  present: true,
  readAt: Date.now(),
  notices: [],
  decisions: [
    {
      id: "DR-011",
      title: "Project workspace",
      path: "decisions/011-project-workspace.md",
    },
  ],
  iterations: [
    {
      id: "IR-016",
      title: "Workspace iteration",
      path: "iterations/016-project-workspace.md",
    },
  ],
  packages: [
    {
      key: "auth",
      dir: "",
      basename: "auth",
      shortForm: "AUTH",
      notices: [],
      groups: {
        user: {
          path: "specs/user/auth.md",
          intent: "How users sign in.",
          items: [
            // Document order is deliberately not ID order (META-12).
            {
              id: "AUTH-2",
              group: "user",
              section: "Login",
              firstLine: "The form shall validate credentials.",
              text: "The form shall validate **credentials** before submit.",
              verifies: [],
            },
            {
              id: "AUTH-1",
              group: "user",
              section: "Login",
              firstLine: "The app shall render a sign-in form.",
              text: "The app shall render a sign-in form.",
              verifies: [],
            },
            {
              id: "AUTH-3",
              group: "user",
              section: "Recovery",
              firstLine: "The app shall offer password reset.",
              text: "The app shall offer password reset.",
              verifies: [],
            },
          ],
        },
        dev: {
          path: "specs/dev/auth.md",
          intent: "Auth implementation constraints.",
          items: [
            {
              id: "AUTH-10",
              group: "dev",
              section: "Notes",
              firstLine: "The token store shall be encrypted.",
              text: "The token store shall be encrypted at rest.",
              verifies: [],
            },
          ],
        },
        test: {
          path: "specs/test/auth.md",
          intent: "Auth acceptance checks.",
          items: [
            {
              id: "AUTH-30",
              group: "test",
              firstLine: "Login round-trips against a fresh profile.",
              text: "Given a fresh profile, when the user signs in, login succeeds.",
              verifies: ["AUTH-1", "AUTH-99"],
            },
          ],
        },
      },
    },
    {
      key: "flows/checkout",
      dir: "flows",
      basename: "checkout",
      shortForm: "CKOUT",
      notices: [],
      groups: {
        // No user file: the package intent falls back to dev's.
        dev: {
          path: "specs/dev/flows/checkout.md",
          intent: "Checkout flow internals.",
          items: [
            {
              id: "CKOUT-11",
              group: "dev",
              firstLine: "The cart shall persist across restarts.",
              text: "The cart shall persist across restarts.",
              verifies: [],
            },
          ],
        },
        test: {
          path: "specs/test/flows/checkout.md",
          intent: "Checkout acceptance.",
          items: [],
          error: "line 12: item heading without an ID",
        },
      },
    },
  ],
};

const EMPTY_TREE: SpecTreeState = {
  present: false,
  packages: [],
  decisions: [],
  iterations: [],
  notices: [],
  readAt: Date.now(),
};

function Harness({
  tree = TREE,
  loading,
  error,
  onRefresh = () => {},
  onReadRecord = async () => "",
}: {
  tree?: SpecTreeState;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onReadRecord?: (path: string) => Promise<string>;
}) {
  const [viewState, setViewState] = useState(initialSpecViewState);
  return (
    <SpecView
      tree={tree}
      loading={loading}
      error={error}
      onRefresh={onRefresh}
      onReadRecord={onReadRecord}
      viewState={viewState}
      onViewState={setViewState}
    />
  );
}

/** a precedes b in the document. */
function before(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & 4); // DOCUMENT_POSITION_FOLLOWING
}

describe("SPECV-1/2: outline shape and package nodes", () => {
  test("directories nest packages; counts and intents render", () => {
    render(<Harness />);
    // Directory level for the nested package, default open.
    expect(screen.getByText("flows/")).toBeTruthy();
    const auth = screen.getByTestId("pkg-auth");
    expect(within(auth).getByText("AUTH")).toBeTruthy();
    expect(within(auth).getByText("How users sign in.")).toBeTruthy();
    expect(within(auth).getByLabelText("3 user items")).toBeTruthy();
    expect(within(auth).getByLabelText("1 dev items")).toBeTruthy();
    expect(within(auth).getByLabelText("1 test items")).toBeTruthy();
    // Header totals.
    expect(screen.getByText("2 packages · 6 items")).toBeTruthy();
    // Packages default collapsed: no item rows yet.
    expect(screen.queryByTestId("item-AUTH-2")).toBeNull();
  });

  test("intent falls back to the dev file; zero counts stay, muted", () => {
    render(<Harness />);
    const checkout = screen.getByTestId("pkg-flows/checkout");
    expect(
      within(checkout).getByText("Checkout flow internals."),
    ).toBeTruthy();
    // Zero renders muted, not absent.
    expect(within(checkout).getByLabelText("0 user items")).toBeTruthy();
  });
});

describe("SPECV-2: expanded package keeps document order and sections", () => {
  test("items render in document order with section sub-headings", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    const login = screen.getByText("Login");
    const recovery = screen.getByText("Recovery");
    const a2 = screen.getByTestId("item-AUTH-2");
    const a1 = screen.getByTestId("item-AUTH-1");
    const a3 = screen.getByTestId("item-AUTH-3");
    // AUTH-2 before AUTH-1: never re-sorted by ID.
    expect(before(login, a2)).toBe(true);
    expect(before(a2, a1)).toBe(true);
    // The section heading appears exactly where the section changes.
    expect(before(a1, recovery)).toBe(true);
    expect(before(recovery, a3)).toBe(true);
    // Dev-only section from the dev file renders too.
    expect(screen.getByText("Notes")).toBeTruthy();
    // Per-file parse error shows as an amber notice inside the package.
    fireEvent.click(screen.getByTestId("pkg-toggle-flows/checkout"));
    expect(
      screen.getByText(/line 12: item heading without an ID/),
    ).toBeTruthy();
  });

  test("Expand all opens every item body in the package", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    fireEvent.click(screen.getByTestId("expand-all-auth"));
    expect(
      screen.getByTestId("item-toggle-AUTH-1").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByTestId("item-toggle-AUTH-30").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("Collapse all")).toBeTruthy();
  });
});

describe("SPECV-3: item rows", () => {
  test("expanding an item renders its markdown body", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-2"));
    // **credentials** renders as <strong>.
    expect(screen.getByText("credentials").tagName).toBe("STRONG");
  });

  test("clicking the ID chip copies the ID and ticks", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<Harness />);
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    const chip = screen.getByRole("button", { name: "Copy AUTH-2" });
    fireEvent.click(chip);
    expect(writeText).toHaveBeenCalledWith("AUTH-2");
    await waitFor(() => expect(chip.textContent).toContain("✓"));
  });
});

describe("SPECV-4: group filters", () => {
  test("toggling a group off hides its items, not the package", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    expect(screen.getByTestId("item-AUTH-10")).toBeTruthy();
    const devFilter = screen.getByTestId("filter-dev");
    expect(devFilter.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(devFilter);
    expect(devFilter.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("item-AUTH-10")).toBeNull();
    // Other groups' items and the package itself stay.
    expect(screen.getByTestId("item-AUTH-2")).toBeTruthy();
    expect(screen.getByTestId("pkg-auth")).toBeTruthy();
  });

  test("a package emptied by filters says so when expanded", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("filter-dev"));
    fireEvent.click(screen.getByTestId("filter-test"));
    fireEvent.click(screen.getByTestId("pkg-toggle-flows/checkout"));
    expect(screen.getByText("no items in active groups")).toBeTruthy();
    expect(screen.getByTestId("pkg-flows/checkout")).toBeTruthy();
  });
});

describe("SPECV-5: search", () => {
  test("narrows to matches, auto-expands, and restores on clear", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    const input = screen.getByPlaceholderText("Filter items — ID or text…");
    fireEvent.change(input, { target: { value: "ckout-11" } });
    // Case-insensitive ID match; the matching package auto-expands.
    expect(screen.getByTestId("match-count").textContent).toBe("1 match");
    expect(screen.getByTestId("item-CKOUT-11")).toBeTruthy();
    expect(screen.queryByTestId("item-AUTH-2")).toBeNull();
    // Clearing restores the prior expansion state.
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByTestId("item-CKOUT-11")).toBeNull();
    expect(screen.getByTestId("item-AUTH-2")).toBeTruthy();
  });

  test("text matches count across packages", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("Filter items — ID or text…");
    // Every item but AUTH-30 (a Given/When/Then test item) says "shall".
    fireEvent.change(input, { target: { value: "shall" } });
    expect(screen.getByTestId("match-count").textContent).toBe("5 matches");
  });
});

describe("SPECV-6: citation jumps and backlinks", () => {
  test("backlinks are computed from inbound Verifies", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    const target = screen.getByTestId("item-AUTH-1");
    expect(within(target).getByText(/verified by AUTH-30/)).toBeTruthy();
  });

  test("a Verifies link reveals a filtered-off target with a note", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("filter-user"));
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    expect(screen.queryByTestId("item-AUTH-1")).toBeNull();
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-30"));
    fireEvent.click(screen.getByTestId("link-AUTH-30-AUTH-1"));
    const target = screen.getByTestId("item-AUTH-1");
    expect(within(target).getByText("shown despite filter")).toBeTruthy();
    // The target's body is expanded by the jump.
    expect(
      screen.getByTestId("item-toggle-AUTH-1").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  test("a dead citation says not found and never navigates", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("pkg-toggle-auth"));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-30"));
    fireEvent.click(screen.getByTestId("link-AUTH-30-AUTH-99"));
    expect(screen.getByText("not found")).toBeTruthy();
    expect(screen.queryByTestId("item-AUTH-99")).toBeNull();
  });
});

describe("SPECV-7: records footer and reader", () => {
  test("footer opens the list; picking a record swaps to the reader", async () => {
    const onReadRecord = vi
      .fn()
      .mockResolvedValue("# Record body\n\nHello from the record.");
    render(<Harness onReadRecord={onReadRecord} />);
    fireEvent.click(screen.getByTestId("records-toggle"));
    const popover = screen.getByTestId("records-popover");
    expect(within(popover).getByText("Project workspace")).toBeTruthy();
    expect(within(popover).getByText("IR-016")).toBeTruthy();
    fireEvent.click(within(popover).getByText("Project workspace"));
    expect(onReadRecord).toHaveBeenCalledWith(
      "decisions/011-project-workspace.md",
    );
    await screen.findByText("Hello from the record.");
    expect(screen.getByText("DR-011")).toBeTruthy();
    // Back returns to the tree.
    fireEvent.click(screen.getByText("← Back"));
    expect(screen.getByTestId("pkg-auth")).toBeTruthy();
  });

  test("Escape closes the records popover", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("records-toggle"));
    expect(screen.getByTestId("records-popover")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("records-popover")).toBeNull();
  });
});

describe("SPECV-8: freshness and failure states", () => {
  test("the refresh control shows the last-read time and refetches", () => {
    const onRefresh = vi.fn();
    render(<Harness onRefresh={onRefresh} />);
    expect(screen.getByText("read just now")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh specs" }));
    expect(onRefresh).toHaveBeenCalled();
  });

  test("a load error renders a red strip with Retry", () => {
    const onRefresh = vi.fn();
    render(<Harness error="specs read failed" onRefresh={onRefresh} />);
    expect(screen.getByText("specs read failed")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRefresh).toHaveBeenCalled();
  });
});

describe("SPECV-9: empty and loading states", () => {
  test("no specs/ shows the instructive scaffold empty state", () => {
    render(<Harness tree={EMPTY_TREE} />);
    const empty = screen.getByTestId("specs-empty");
    expect(empty.textContent).toContain("npx @sublang/spex");
    expect(
      within(empty).getByRole("button", { name: "Copy scaffold command" }),
    ).toBeTruthy();
  });

  test("first load with no tree yet reads as loading", () => {
    render(<Harness tree={EMPTY_TREE} loading />);
    expect(screen.getByText("reading specs…")).toBeTruthy();
  });
});

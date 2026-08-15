// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SPECV component coverage over the packages-collection model: the
// spec view rendered from a fixture SpecTreeState — directory/file
// outline, document order with section and topic labels, group
// filters, search with transient chevron overrides, plain citation
// rows and grouped backlinks (SPECV-19), cross-file rollups on every
// file row, citation jumps with the one-step return chip and focus
// landing, the meta.md route, the polite live region, records reader
// focus flow, and the empty/legacy states.

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

import {
  SpecView,
  initialSpecViewState,
  type SpecViewState,
} from "./SpecView.js";
import type { SpecTreeState } from "@sublang/spex-core/protocol";

// An Academy-shaped mini-corpus in the packages-only layout that
// exercises the SPECV-19 citation presentation: a package item citing
// a peer's item, same-file citations, a test item citing the behavior
// items it verifies (one target dead), a root-level file citing into
// subdirectory files, an item-body link into meta.md — plus one
// parse-degraded file carrying a basename-disagreement notice
// (SPECV-11).
const TREE: SpecTreeState = {
  present: true,
  legacy: false,
  readAt: Date.now(),
  notices: [],
  decisions: [
    {
      id: "DR-011",
      title: "Project workspace",
      path: "decisions/011-project-workspace.md",
    },
  ],
  intents: [
    {
      id: "IR-016",
      title: "Workspace intent",
      path: "intents/016-project-workspace.md",
    },
  ],
  files: [
    {
      path: "specs/packages/identity/auth.md",
      key: "identity/auth",
      dir: "identity",
      basename: "auth",
      title: "GitHub Login",
      intent: "How users sign in.",
      notices: [],
      items: [
        // Document order is deliberately not ID order (META-12).
        {
          id: "AUTH-2",
          group: "external",
          section: "External Behavior",
          topic: "Sign-In",
          firstLine: "The form shall validate credentials.",
          text: "The form shall validate **credentials** before submit ([AUTH-1](#auth-1)).",
          cites: ["AUTH-1"],
        },
        {
          id: "AUTH-1",
          group: "external",
          section: "External Behavior",
          topic: "Sign-In",
          firstLine: "The app shall render a sign-in form.",
          text: "The app shall render a sign-in form.",
          cites: [],
        },
        {
          id: "AUTH-3",
          group: "external",
          section: "External Behavior",
          topic: "Recovery",
          firstLine: "The app shall offer password reset.",
          text: "The app shall offer password reset.",
          cites: [],
        },
        {
          id: "AUTH-8",
          group: "internal",
          section: "Internal Behavior",
          topic: "Session Mechanics",
          firstLine: "Session state shall travel in cookies.",
          text: "Session state shall travel in cookies. Decided in [DR-011](../../decisions/011-project-workspace.md).",
          cites: [],
        },
        {
          id: "AUTH-10",
          group: "test",
          section: "Verification",
          topic: "Sign-In Coverage",
          firstLine: "Sign-in round-trips against a stub provider.",
          // AUTH-99 is a dead citation: the outbound row keeps it and
          // the jump says "not found".
          text: "Given a stub provider, the suite shall assert sign-in succeeds ([AUTH-1](#auth-1), [AUTH-99](#auth-99)).",
          cites: ["AUTH-1", "AUTH-99"],
        },
      ],
    },
    {
      path: "specs/packages/catalog/courses.md",
      key: "catalog/courses",
      dir: "catalog",
      basename: "courses",
      title: "Course Catalog",
      intent: "What the catalog lists.",
      // The basename is the package identifier (SPECV-11): a
      // disagreeing H1 prefix arrives as a per-file notice.
      notices: ['heading "# CAT: Course Catalog" disagrees with basename "courses"'],
      error: "line 12: item heading without an ID",
      items: [
        {
          id: "CAT-1",
          group: "external",
          section: "External Behavior",
          firstLine: "The catalog shall list published courses.",
          // A peer-file citation.
          text: "The catalog shall list published courses, reusing credential validation ([AUTH-2](../identity/auth.md#auth-2)).",
          cites: ["AUTH-2"],
        },
      ],
    },
    {
      path: "specs/packages/guard.md",
      key: "guard",
      dir: "",
      basename: "guard",
      title: "Protected Content",
      intent: "The whole gating surface in one place.",
      notices: [],
      items: [
        {
          id: "GUARD-1",
          group: "external",
          section: "External Behavior",
          firstLine: "The site shall present each surface per the map.",
          text: "The site shall present each surface per the map ([AUTH-1](identity/auth.md#auth-1)), gated via eligibility ([GUARD-5](#guard-5)).",
          cites: ["AUTH-1", "GUARD-5"],
        },
        {
          id: "GUARD-5",
          group: "internal",
          section: "Internal Behavior",
          firstLine: "Eligibility shall be the deployment's answer.",
          // The body carries an inert sibling link (map) and a dead
          // citation-shaped link (SET-99) beyond its two live cites.
          text: "Where the catalog lists published courses ([CAT-1](catalog/courses.md#cat-1)), eligibility shall be the deployment's answer, feeding session mechanics ([AUTH-8](identity/auth.md#auth-8)); see the [index](../map.md) and ([SET-99](settings.md#set-99)).",
          cites: ["CAT-1", "AUTH-8"],
        },
        {
          id: "GUARD-6",
          group: "internal",
          section: "Internal Behavior",
          firstLine: "Eligibility also covers the media path.",
          // A non-enclosed meta.md link: readable, never a citation.
          text: "Eligibility also covers the media path ([AUTH-8](identity/auth.md#auth-8)); terms are defined in [meta-14](../meta.md#meta-14).",
          cites: ["AUTH-8"],
        },
        {
          id: "GUARD-3",
          group: "test",
          section: "Verification",
          firstLine: "The suite shall sweep the map.",
          text: "The acceptance suite shall sweep the map ([GUARD-1](#guard-1), [GUARD-5](#guard-5)) and check the catalog listing ([CAT-1](catalog/courses.md#cat-1)).",
          cites: ["GUARD-1", "GUARD-5", "CAT-1"],
        },
      ],
    },
  ],
};

const EMPTY_TREE: SpecTreeState = {
  present: false,
  legacy: false,
  files: [],
  decisions: [],
  intents: [],
  notices: [],
  readAt: Date.now(),
};

const LEGACY_TREE: SpecTreeState = {
  present: true,
  legacy: true,
  files: [],
  decisions: [
    {
      id: "DR-001",
      title: "Old decision",
      path: "decisions/001-old-decision.md",
    },
  ],
  intents: [],
  notices: [],
  readAt: Date.now(),
};

const AUTH = "identity/auth";
const CAT = "catalog/courses";
const GUARD = "guard";

function Harness({
  tree = TREE,
  loading,
  error,
  onRefresh = () => {},
  onReadRecord = async () => "",
  onSeedExample,
  seedError,
}: {
  tree?: SpecTreeState;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onReadRecord?: (path: string) => Promise<string>;
  onSeedExample?: () => void;
  seedError?: string;
}) {
  const [viewState, setViewState] = useState(initialSpecViewState);
  return (
    <SpecView
      tree={tree}
      loading={loading}
      error={error}
      onRefresh={onRefresh}
      onReadRecord={onReadRecord}
      onSeedExample={onSeedExample}
      seedError={seedError}
      viewState={viewState}
      onViewState={setViewState}
    />
  );
}

/** a precedes b in the document. */
function before(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & 4); // DOCUMENT_POSITION_FOLLOWING
}

const searchInput = () =>
  screen.getByPlaceholderText("Filter items — ID or text…");

const liveText = () => screen.getByTestId("specv-live").textContent;

describe("SPECV-1/2: outline shape and file nodes", () => {
  test("the collection root nests directories and files; counts and intents render", () => {
    render(<Harness />);
    // One packages root, default open.
    const packagesRoot = screen.getByTestId("branch-packages");
    expect(packagesRoot.textContent).toContain("Packages");
    // Directories sort alphabetically; the root-level file follows.
    const catalogDir = screen.getByText("catalog/");
    const identityDir = screen.getByText("identity/");
    expect(before(catalogDir, identityDir)).toBe(true);
    const auth = screen.getByTestId(`file-${AUTH}`);
    // The package-identifier chip is the basename (SPECV-11).
    expect(within(auth).getByText("auth")).toBeTruthy();
    expect(within(auth).getByText("How users sign in.")).toBeTruthy();
    expect(within(auth).getByLabelText("3 external items")).toBeTruthy();
    expect(within(auth).getByLabelText("1 internal items")).toBeTruthy();
    expect(within(auth).getByLabelText("1 test items")).toBeTruthy();
    // Header totals across the collection.
    expect(screen.getByText("3 packages · 10 items")).toBeTruthy();
    // Files default collapsed: no item rows yet.
    expect(screen.queryByTestId("item-AUTH-2")).toBeNull();
  });

  test("zero counts stay, muted; a root file needs no directory", () => {
    render(<Harness />);
    const courses = screen.getByTestId(`file-${CAT}`);
    // Zero renders muted, not absent.
    expect(within(courses).getByLabelText("0 internal items")).toBeTruthy();
    expect(within(courses).getByLabelText("0 test items")).toBeTruthy();
    const guard = screen.getByTestId(`file-${GUARD}`);
    expect(within(guard).getByText("guard")).toBeTruthy();
    expect(
      within(guard).getByText("The whole gating surface in one place."),
    ).toBeTruthy();
  });

  test("expanding shows the full intent as a prose block; collapsed keeps the truncated line", () => {
    render(<Harness />);
    expect(screen.queryByTestId(`intent-${AUTH}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    const intent = screen.getByTestId(`intent-${AUTH}`);
    expect(intent.textContent).toBe("How users sign in.");
    // The header's truncated copy yields to the full block: one copy.
    expect(screen.getAllByText("How users sign in.").length).toBe(1);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    expect(screen.queryByTestId(`intent-${AUTH}`)).toBeNull();
    expect(within(screen.getByTestId(`file-${AUTH}`)).getByText("How users sign in.")).toBeTruthy();
  });
});

describe("SPECV-2: expanded file keeps document order with sections and topics", () => {
  test("items render in document order under section and topic labels", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    const external = screen.getByText("External Behavior");
    const signIn = screen.getByText("Sign-In");
    const recovery = screen.getByText("Recovery");
    const internal = screen.getByText("Internal Behavior");
    const verification = screen.getByText("Verification");
    const a2 = screen.getByTestId("item-AUTH-2");
    const a1 = screen.getByTestId("item-AUTH-1");
    const a3 = screen.getByTestId("item-AUTH-3");
    const a8 = screen.getByTestId("item-AUTH-8");
    const a10 = screen.getByTestId("item-AUTH-10");
    // AUTH-2 before AUTH-1: never re-sorted by ID.
    expect(before(external, signIn)).toBe(true);
    expect(before(signIn, a2)).toBe(true);
    expect(before(a2, a1)).toBe(true);
    // The topic label repeats only where the topic changes.
    expect(screen.getAllByText("Sign-In").length).toBe(1);
    expect(before(a1, recovery)).toBe(true);
    expect(before(recovery, a3)).toBe(true);
    expect(before(a3, internal)).toBe(true);
    expect(before(internal, a8)).toBe(true);
    expect(before(a8, verification)).toBe(true);
    expect(before(verification, a10)).toBe(true);
    expect(screen.getByText("Session Mechanics")).toBeTruthy();
    expect(screen.getByText("Sign-In Coverage")).toBeTruthy();
  });

  test("per-file notices and parse errors show amber inside the node", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    // The basename-disagreement notice (SPECV-11) and the parse error.
    expect(
      screen.getByText(/disagrees with basename "courses"/),
    ).toBeTruthy();
    expect(
      screen.getByText(/line 12: item heading without an ID/),
    ).toBeTruthy();
    // The degraded file still renders its parsed items.
    expect(screen.getByTestId("item-CAT-1")).toBeTruthy();
  });

  test("Expand all opens every item body in the file", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId(`expand-all-${AUTH}`));
    expect(
      screen.getByTestId("item-toggle-AUTH-1").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByTestId("item-toggle-AUTH-10").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByText("Collapse all")).toBeTruthy();
  });
});

describe("SPECV-3: item rows", () => {
  test("expanding an item renders its markdown body", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-2"));
    // **credentials** renders as <strong>.
    expect(screen.getByText("credentials").tagName).toBe("STRONG");
  });

  test("collapsed rows carry a complete muted citation-count hint", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    // Outbound and inbound: CAT-1 cites AUTH-2 and is cited by
    // GUARD-5 and GUARD-3.
    expect(screen.getByTestId("item-toggle-CAT-1").textContent).toContain(
      "cites 1 · cited by 2",
    );
    // Inbound only, intra-file citers included (unlike the file
    // rollup): AUTH-1 ← AUTH-2, AUTH-10, GUARD-1.
    expect(screen.getByTestId("item-toggle-AUTH-1").textContent).toContain(
      "cited by 3",
    );
    // Outbound only, dead target included.
    expect(screen.getByTestId("item-toggle-AUTH-10").textContent).toContain(
      "cites 2",
    );
    // No citations either way: no hint.
    expect(screen.getByTestId("item-toggle-AUTH-3").textContent).not.toContain(
      "cite",
    );
  });

  test("clicking the ID chip copies the ID, ticks, and narrates", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    const chip = screen.getByRole("button", { name: "Copy AUTH-2" });
    fireEvent.click(chip);
    expect(writeText).toHaveBeenCalledWith("AUTH-2");
    await waitFor(() => expect(chip.textContent).toContain("✓"));
    expect(liveText()).toBe("Copied AUTH-2");
  });

  test("a failed copy is visible beside the chip and narrated (DR-010 §5)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByRole("button", { name: "Copy AUTH-2" }));
    await waitFor(() => expect(liveText()).toBe("Copy failed for AUTH-2"));
    expect(screen.getByText("copy failed")).toBeTruthy();
  });
});

describe("SPECV-4: group filters", () => {
  test("toggling a group off hides its items across files, not the files", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    expect(screen.getByTestId("item-AUTH-8")).toBeTruthy();
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
    const internalFilter = screen.getByTestId("filter-internal");
    expect(internalFilter.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(internalFilter);
    expect(internalFilter.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("item-AUTH-8")).toBeNull();
    expect(screen.queryByTestId("item-GUARD-5")).toBeNull();
    // Other groups' items and the files themselves stay.
    expect(screen.getByTestId("item-AUTH-2")).toBeTruthy();
    expect(screen.getByTestId(`file-${AUTH}`)).toBeTruthy();
    expect(screen.getByTestId(`file-${GUARD}`)).toBeTruthy();
  });

  test("a file emptied by filters says so when expanded", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("filter-external"));
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    expect(screen.getByText("no items in active groups")).toBeTruthy();
    expect(screen.getByTestId(`file-${CAT}`)).toBeTruthy();
  });

  test("turning a filter back on retires that group's jump reveals", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("filter-external"));
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-10"));
    fireEvent.click(screen.getByTestId("link-AUTH-10-AUTH-1"));
    expect(screen.getByTestId("item-AUTH-1")).toBeTruthy();
    // Filter back on: everything visible, badge gone.
    fireEvent.click(screen.getByTestId("filter-external"));
    expect(
      within(screen.getByTestId("item-AUTH-1")).queryByText(
        "shown despite filter",
      ),
    ).toBeNull();
    // Off again: the old reveal died with the filter cycle.
    fireEvent.click(screen.getByTestId("filter-external"));
    expect(screen.queryByTestId("item-AUTH-1")).toBeNull();
  });
});

describe("SPECV-5: search", () => {
  test("narrows to matches, auto-expands, and restores on clear", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.change(searchInput(), { target: { value: "cat-1" } });
    // Case-insensitive match on ID and text (GUARD-5 and GUARD-3 cite
    // CAT-1 in their bodies); matching files auto-expand.
    expect(screen.getByTestId("match-count").textContent).toBe("3 matches");
    expect(screen.getByTestId("item-CAT-1")).toBeTruthy();
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
    expect(screen.queryByTestId("item-AUTH-2")).toBeNull();
    // Clearing restores the prior expansion state.
    fireEvent.change(searchInput(), { target: { value: "" } });
    expect(screen.queryByTestId("item-CAT-1")).toBeNull();
    expect(screen.getByTestId("item-AUTH-2")).toBeTruthy();
  });

  test("text matches count across files and respect filters", () => {
    render(<Harness />);
    fireEvent.change(searchInput(), { target: { value: "shall" } });
    // Every item but GUARD-6 says "shall".
    expect(screen.getByTestId("match-count").textContent).toBe("9 matches");
    // Filtered-off groups leave the count.
    fireEvent.click(screen.getByTestId("filter-test"));
    expect(screen.getByTestId("match-count").textContent).toBe("7 matches");
  });

  test("chevrons override computed expansion transiently; persisted expansion untouched", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.change(searchInput(), { target: { value: "cat-1" } });
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
    // A chevron collapses the matching file without touching state.
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    expect(screen.queryByTestId("item-GUARD-5")).toBeNull();
    expect(screen.getByTestId("match-count").textContent).toBe("3 matches");
    // And re-opens it.
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    // Clearing restores pre-search expansion: auth open, guard closed.
    fireEvent.change(searchInput(), { target: { value: "" } });
    expect(screen.getByTestId("item-AUTH-2")).toBeTruthy();
    expect(screen.queryByTestId("item-GUARD-5")).toBeNull();
    // Overrides died with the search: a new search recomputes.
    fireEvent.change(searchInput(), { target: { value: "cat-1" } });
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
  });
});

describe("SPECV-19/37: citation rows and backlinks", () => {
  test("outbound rows list the item's cites in document order", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-3"));
    const row = screen.getByTestId("cites-GUARD-3");
    expect(row.textContent).toContain("cites");
    const g1 = within(row).getByTestId("link-GUARD-3-GUARD-1");
    const g5 = within(row).getByTestId("link-GUARD-3-GUARD-5");
    const c1 = within(row).getByTestId("link-GUARD-3-CAT-1");
    // Document order, never re-sorted.
    expect(before(g1, g5)).toBe(true);
    expect(before(g5, c1)).toBe(true);
  });

  test("a same-file citation renders as a plain outbound row too", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-2"));
    const row = screen.getByTestId("cites-AUTH-2");
    expect(within(row).getByTestId("link-AUTH-2-AUTH-1")).toBeTruthy();
    // An item without citations carries no outbound row.
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-1"));
    expect(screen.queryByTestId("cites-AUTH-1")).toBeNull();
  });

  test("backlinks group on the cited target, collapsed by count", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    // AUTH-8 is cited by GUARD-5 and GUARD-6.
    const citedBy = screen.getByTestId("inbound-AUTH-8");
    expect(citedBy.textContent).toContain("cited by 2");
    expect(citedBy.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("link-AUTH-8-GUARD-5")).toBeNull();
    fireEvent.click(citedBy);
    expect(citedBy.getAttribute("aria-expanded")).toBe("true");
    // Entries are named by the citing item ID.
    expect(screen.getByTestId("link-AUTH-8-GUARD-5")).toBeTruthy();
    expect(screen.getByTestId("link-AUTH-8-GUARD-6")).toBeTruthy();
    // A backlink is a full jump: the citing item opens in view.
    fireEvent.click(screen.getByTestId("link-AUTH-8-GUARD-5"));
    expect(
      screen.getByTestId("item-toggle-GUARD-5").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  test("an outbound row entry jumps in view", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    fireEvent.click(screen.getByTestId("item-toggle-CAT-1"));
    fireEvent.click(screen.getByTestId("link-CAT-1-AUTH-2"));
    expect(
      screen.getByTestId("item-toggle-AUTH-2").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  test("a cite link reveals a filtered-off target with a note", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("filter-external"));
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    expect(screen.queryByTestId("item-AUTH-1")).toBeNull();
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-10"));
    fireEvent.click(screen.getByTestId("link-AUTH-10-AUTH-1"));
    const target = screen.getByTestId("item-AUTH-1");
    expect(within(target).getByText("shown despite filter")).toBeTruthy();
    // The target's body is expanded by the jump.
    expect(
      screen.getByTestId("item-toggle-AUTH-1").getAttribute("aria-expanded"),
    ).toBe("true");
    // The landing narrates the reveal (DR-010 §7).
    expect(liveText()).toBe("Jumped to AUTH-1 — shown despite filter");
  });

  test("a dead citation says not found and never navigates", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-10"));
    fireEvent.click(screen.getByTestId("link-AUTH-10-AUTH-99"));
    expect(screen.getByText("not found")).toBeTruthy();
    expect(screen.queryByTestId("item-AUTH-99")).toBeNull();
    expect(liveText()).toBe("AUTH-99 not found");
  });

  test("an inline dead citation says not found and never navigates", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-5"));
    // SET-99 is citation-shaped but neither an item nor a record.
    fireEvent.click(screen.getByRole("link", { name: "SET-99" }));
    expect(screen.getByText("not found")).toBeTruthy();
    expect(screen.queryByTestId("record-reader")).toBeNull();
    expect(screen.queryByTestId("item-SET-99")).toBeNull();
  });

  test("an inline body link to an item ID jumps cross-file", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-5"));
    // The rendered markdown link [AUTH-8](identity/auth.md#auth-8)
    // resolves in-view: the target's file expands and the body opens.
    fireEvent.click(screen.getByRole("link", { name: "AUTH-8" }));
    expect(screen.getByTestId("item-AUTH-8")).toBeTruthy();
    expect(
      screen.getByTestId("item-toggle-AUTH-8").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  test("an inline DR link opens the records reader; others stay inert", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# DR body\n\nDecided.");
    render(<Harness onReadRecord={onReadRecord} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-5"));
    // A relative link that is neither an item nor a record is inert.
    fireEvent.click(screen.getByRole("link", { name: "index" }));
    expect(screen.queryByTestId("record-reader")).toBeNull();
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
    // A DR citation swaps to the records reader.
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    fireEvent.click(screen.getByRole("link", { name: "DR-011" }));
    expect(onReadRecord).toHaveBeenCalledWith(
      "decisions/011-project-workspace.md",
    );
    await screen.findByText("Decided.");
    expect(screen.getByTestId("record-reader")).toBeTruthy();
  });
});

describe("citation entries: target-group color, tooltip, hit target", () => {
  test("entries color by the target's group with a digest tooltip", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-3"));
    const g1 = screen.getByTestId("link-GUARD-3-GUARD-1");
    // GUARD-1 is external: sky, with the digest previewed.
    expect(g1.className).toContain("text-sky-600");
    expect(g1.getAttribute("title")).toBe(
      "GUARD-1 — The site shall present each surface per the map.",
    );
    // GUARD-5 is internal: fuchsia.
    expect(
      screen.getByTestId("link-GUARD-3-GUARD-5").className,
    ).toContain("text-fuchsia-600");
    // Hit target grows by padding, density kept by negative margin
    // (DR-010 §7).
    expect(g1.className).toContain("py-1");
    expect(g1.className).toContain("-my-1");
  });

  test("a dead target keeps the neutral link style with no tooltip", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-10"));
    const dead = screen.getByTestId("link-AUTH-10-AUTH-99");
    expect(dead.className).toContain("text-brand-600");
    expect(dead.getAttribute("title")).toBeNull();
  });

  test("backlink entries color by the citing item's group", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    fireEvent.click(screen.getByTestId("inbound-AUTH-8"));
    expect(
      screen.getByTestId("link-AUTH-8-GUARD-5").className,
    ).toContain("text-fuchsia-600");
  });
});

describe("SPECV-2/19: cross-file rollups on every file row", () => {
  test("collapsed rows carry the rollup; intra-file citations never count", () => {
    render(<Harness />);
    // All rows are collapsed — the rollups render regardless.
    // auth out: only AUTH-10 → AUTH-99 (dead counts; both AUTH-1 cites
    // are intra-file). in: CAT-1 → AUTH-2, GUARD-1 → AUTH-1,
    // GUARD-5/GUARD-6 → AUTH-8.
    const auth = screen.getByTestId(`rollup-${AUTH}`);
    expect(auth.textContent).toBe("cites 1 · cited by 4");
    expect(auth.getAttribute("aria-label")).toBe(
      `Citations: ${auth.textContent}`,
    );
    expect(screen.getByTestId(`rollup-${CAT}`).textContent).toBe(
      "cites 1 · cited by 2",
    );
    // guard's inbound is all intra-file: outbound side only.
    expect(screen.getByTestId(`rollup-${GUARD}`).textContent).toBe("cites 5");
    // Expansion keeps the rollup on the row.
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    expect(screen.getByTestId(`rollup-${AUTH}`).textContent).toBe(
      "cites 1 · cited by 4",
    );
  });
});

describe("SPECV-6: jump return chip", () => {
  test("jumps push origins; the chip pops one level and lands back", () => {
    render(<Harness />);
    expect(screen.queryByTestId("jump-back")).toBeNull();
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    fireEvent.click(screen.getByTestId("item-toggle-CAT-1"));
    fireEvent.click(screen.getByTestId("link-CAT-1-AUTH-2"));
    // The chip carries a real accessible name.
    const chip = screen.getByRole("button", { name: "back to CAT-1" });
    expect(chip).toBe(screen.getByTestId("jump-back"));
    // A second hop stacks: AUTH-2 → AUTH-1.
    fireEvent.click(screen.getByTestId("link-AUTH-2-AUTH-1"));
    expect(screen.getByTestId("jump-back").textContent).toBe(
      "back to AUTH-2",
    );
    // Pop lands back on AUTH-2 and uncovers the older origin.
    fireEvent.click(screen.getByTestId("jump-back"));
    expect(document.activeElement).toBe(screen.getByTestId("item-AUTH-2"));
    expect(screen.getByTestId("jump-back").textContent).toBe("back to CAT-1");
    fireEvent.click(screen.getByTestId("jump-back"));
    expect(document.activeElement).toBe(screen.getByTestId("item-CAT-1"));
    // The stack is empty: the chip leaves.
    expect(screen.queryByTestId("jump-back")).toBeNull();
  });

  test("a dead citation pushes no origin", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-10"));
    fireEvent.click(screen.getByTestId("link-AUTH-10-AUTH-99"));
    expect(screen.queryByTestId("jump-back")).toBeNull();
  });
});

describe("SPECV-6: search-time reveal", () => {
  test("a jump target hidden by the search reveals with the badge", () => {
    render(<Harness />);
    fireEvent.change(searchInput(), { target: { value: "cat-1" } });
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-5"));
    fireEvent.click(screen.getByTestId("link-GUARD-5-AUTH-8"));
    // AUTH-8 does not match "cat-1": revealed, marked, file opened.
    const target = screen.getByTestId("item-AUTH-8");
    expect(within(target).getByText("shown despite filter")).toBeTruthy();
    expect(liveText()).toBe("Jumped to AUTH-8 — shown despite filter");
    // The reveal is not a match: the count is untouched.
    expect(screen.getByTestId("match-count").textContent).toBe("3 matches");
    // Clearing the search clears the badge — the item is plainly
    // visible once its file (never persisted as expanded mid-search)
    // is opened again.
    fireEvent.change(searchInput(), { target: { value: "" } });
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    expect(
      within(screen.getByTestId("item-AUTH-8")).queryByText(
        "shown despite filter",
      ),
    ).toBeNull();
  });

  test("a jump into a chevron-collapsed file reopens it", () => {
    render(<Harness />);
    fireEvent.change(searchInput(), { target: { value: "auth-8" } });
    // auth and guard both match; collapse guard by chevron.
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    expect(screen.queryByTestId("item-GUARD-5")).toBeNull();
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    fireEvent.click(screen.getByTestId("inbound-AUTH-8"));
    fireEvent.click(screen.getByTestId("link-AUTH-8-GUARD-5"));
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
  });
});

describe("DR-010 §6: focus follows", () => {
  test("a jump focuses the landed item row", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    fireEvent.click(screen.getByTestId("item-toggle-CAT-1"));
    fireEvent.click(screen.getByTestId("link-CAT-1-AUTH-2"));
    const row = screen.getByTestId("item-AUTH-2");
    expect(row.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(row);
  });

  test("the reader takes focus on Back and returns it to the popover's toggle", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# DR\n\nBody.");
    render(<Harness onReadRecord={onReadRecord} />);
    fireEvent.click(screen.getByTestId("records-toggle"));
    // The popover's first entry takes focus on open.
    const popover = screen.getByTestId("records-popover");
    const first = within(popover).getAllByRole("button")[0];
    expect(document.activeElement).toBe(first);
    fireEvent.click(first);
    await screen.findByText("Body.");
    const back = screen.getByText("← Back");
    expect(document.activeElement).toBe(back);
    fireEvent.click(back);
    // Closing hands focus back to the records toggle.
    expect(document.activeElement).toBe(screen.getByTestId("records-toggle"));
  });

  test("a body-link record open returns focus to the citing item row", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# DR\n\nDecided.");
    render(<Harness onReadRecord={onReadRecord} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    fireEvent.click(screen.getByRole("link", { name: "DR-011" }));
    await screen.findByText("Decided.");
    fireEvent.click(screen.getByText("← Back"));
    expect(document.activeElement).toBe(screen.getByTestId("item-AUTH-8"));
  });

  test("outside pointerdown dismisses the popover and restores the toggle", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("records-toggle"));
    expect(screen.getByTestId("records-popover")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId("records-popover")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("records-toggle"));
  });

  test("Escape closes the records popover and restores the toggle", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("records-toggle"));
    expect(screen.getByTestId("records-popover")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("records-popover")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("records-toggle"));
  });
});

describe("DR-010 §7: accessible names and affordances", () => {
  test("section and topic labels are exposed; toggles carry names", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Toggle Packages" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Toggle identity/" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Toggle auth" })).toBeTruthy();
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    // Section/topic labels are no longer aria-hidden.
    expect(
      screen
        .getByText("External Behavior")
        .closest("li")
        ?.getAttribute("aria-hidden"),
    ).toBeNull();
    expect(
      screen.getByText("Sign-In").closest("li")?.getAttribute("aria-hidden"),
    ).toBeNull();
    // Item toggles name the item.
    expect(
      screen.getByTestId("item-toggle-AUTH-2").getAttribute("aria-label"),
    ).toBe("AUTH-2: The form shall validate credentials.");
    // The expand-all control names its file.
    expect(
      screen.getByRole("button", { name: "Expand all items in auth" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId(`expand-all-${AUTH}`));
    expect(
      screen.getByRole("button", { name: "Collapse all items in auth" }),
    ).toBeTruthy();
  });

  test("the copy chip advertises itself as a control", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    const chip = screen.getByRole("button", { name: "Copy AUTH-2" });
    expect(chip.className).toContain("cursor-pointer");
    expect(chip.className).toContain("hover:ring-1");
  });
});

describe("SPECV-6/7: meta.md routing", () => {
  test("the footer offers meta directly; the popover stays records-only", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# meta\n\nGlossary.");
    render(<Harness onReadRecord={onReadRecord} />);
    fireEvent.click(screen.getByTestId("records-toggle"));
    expect(
      within(screen.getByTestId("records-popover")).queryByText("meta"),
    ).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    const meta = screen.getByTestId("records-meta");
    expect(meta.textContent).toBe("meta");
    fireEvent.click(meta);
    expect(onReadRecord).toHaveBeenCalledWith("meta.md");
    await screen.findByText("Glossary.");
    expect(
      within(screen.getByTestId("record-reader")).getByText("meta.md"),
    ).toBeTruthy();
    // Back lands on the meta control (DR-010 §6).
    fireEvent.click(screen.getByText("← Back"));
    expect(document.activeElement).toBe(screen.getByTestId("records-meta"));
  });

  test("an item-body link resolving to meta.md opens the reader", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# meta\n\nTerms.");
    render(<Harness onReadRecord={onReadRecord} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-6"));
    fireEvent.click(screen.getByRole("link", { name: "meta-14" }));
    expect(onReadRecord).toHaveBeenCalledWith("meta.md");
    await screen.findByText("Terms.");
    expect(screen.getByTestId("record-reader")).toBeTruthy();
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
    // The open narrates through the live region.
    expect(liveText()).toBe("Opened DR-011");
    await screen.findByText("Hello from the record.");
    expect(screen.getByText("DR-011")).toBeTruthy();
    // Back returns to the tree.
    fireEvent.click(screen.getByText("← Back"));
    expect(screen.getByTestId(`file-${AUTH}`)).toBeTruthy();
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

describe("SPECV-9/17/18: empty, legacy, and loading states", () => {
  test("no specs/ shows the instructive scaffold empty state", () => {
    render(<Harness tree={EMPTY_TREE} />);
    const empty = screen.getByTestId("specs-empty");
    expect(empty.textContent).toContain("npx @sublang/spex");
    expect(
      within(empty).getByRole("button", {
        name: "Copy command npx @sublang/spex",
      }),
    ).toBeTruthy();
    // Without a seeding wire-up, the Academy offer stays hidden.
    expect(screen.queryByTestId("specs-empty-academy")).toBeNull();
  });

  test("the empty state offers the Academy example when wired", () => {
    const onSeedExample = vi.fn();
    render(<Harness tree={EMPTY_TREE} onSeedExample={onSeedExample} />);
    const button = screen.getByTestId("specs-empty-academy");
    expect(button.textContent).toBe("Try the Academy example");
    fireEvent.click(button);
    expect(onSeedExample).toHaveBeenCalledTimes(1);
  });

  test("a failed seed surfaces its error beside the Academy offer", () => {
    render(
      <Harness
        tree={EMPTY_TREE}
        onSeedExample={() => {}}
        seedError="target directory exists and is not empty"
      />,
    );
    const alert = screen.getByTestId("specs-empty-seed-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toContain("not empty");
    // Without a failure there is no error line.
    cleanup();
    render(<Harness tree={EMPTY_TREE} onSeedExample={() => {}} />);
    expect(screen.queryByTestId("specs-empty-seed-error")).toBeNull();
  });

  test("a legacy tree renders the migration notice instead of a tree", () => {
    render(<Harness tree={LEGACY_TREE} />);
    const legacy = screen.getByTestId("specs-legacy");
    // The notice covers both legacy shapes: group directories and the
    // compositions/ collection (SPECV-18).
    expect(
      within(legacy).getByText("This project uses a legacy specs layout"),
    ).toBeTruthy();
    expect(legacy.textContent).toContain("compositions/");
    expect(legacy.textContent).toContain("npx @sublang/spex scaffold --update");
    // The command prints a migration prompt rather than migrating, so
    // the notice must not promise the tree becomes browsable by
    // running it (spec-view-18, DR-022).
    expect(legacy.textContent).toContain("migration prompt");
    expect(legacy.textContent).not.toContain(
      "Update it to the current packages layout to browse it here",
    );
    expect(
      within(legacy).getByRole("button", {
        name: "Copy command npx @sublang/spex scaffold --update",
      }),
    ).toBeTruthy();
    // No tree, no filters: guidance replaces the outline.
    expect(screen.queryByTestId("branch-packages")).toBeNull();
    expect(screen.queryByTestId("filter-external")).toBeNull();
  });

  test("first load with no tree yet reads as loading", () => {
    render(<Harness tree={EMPTY_TREE} loading />);
    expect(screen.getByText("reading specs…")).toBeTruthy();
  });
});

describe("view-state migration", () => {
  test("a stale pre-DR-015 view state resets to defaults, not a crash", () => {
    const stale = {
      filters: { user: true, dev: false, test: true },
      search: "",
      expandedPackages: ["auth"],
      expandedItems: [],
    } as unknown as SpecViewState;
    render(
      <SpecView
        tree={TREE}
        onRefresh={() => {}}
        onReadRecord={async () => ""}
        viewState={stale}
        onViewState={() => {}}
      />,
    );
    expect(screen.getByTestId("branch-packages")).toBeTruthy();
    // Defaults: all three DR-015 groups on.
    for (const group of ["external", "internal", "test"]) {
      expect(
        screen.getByTestId(`filter-${group}`).getAttribute("aria-pressed"),
      ).toBe("true");
    }
  });
});

// spec-view-20/21: the graph projection of the same tree.
describe("spec-view-20: citation graph projection", () => {
  const GRAPH_TREE: SpecTreeState = {
    present: true,
    legacy: false,
    readAt: Date.now(),
    notices: [],
    decisions: [],
    intents: [],
    files: [
      {
        path: "specs/packages/auth.md",
        key: "auth",
        dir: "",
        basename: "auth",
        title: "Auth",
        intent: "Sign-in.",
        notices: [],
        items: [
          {
            id: "auth-1",
            group: "external",
            section: "External Behavior",
            firstLine: "The app shall sign users in.",
            text: "The app shall sign users in.",
            cites: [],
          },
        ],
      },
      {
        path: "specs/packages/billing.md",
        key: "billing",
        dir: "",
        basename: "billing",
        title: "Billing",
        intent: "Charging.",
        notices: [],
        items: [
          {
            id: "billing-1",
            group: "external",
            section: "External Behavior",
            firstLine: "Charges require a signed-in user.",
            text: "Charges require a signed-in user [[auth-1](auth.md#auth-1)].",
            cites: ["auth-1"],
          },
          {
            id: "billing-2",
            group: "external",
            section: "External Behavior",
            firstLine: "Receipts identify the user.",
            text: "Receipts identify the user [[auth-1](auth.md#auth-1)].",
            cites: ["auth-1"],
          },
        ],
      },
    ],
  };

  test("toggling renders nodes, weighted directed edges, roles, and the click expansion", () => {
    render(<Harness tree={GRAPH_TREE} />);
    fireEvent.click(screen.getByTestId("graph-toggle"));

    // One node per file (spec-view-20).
    expect(screen.getByTestId("spec-graph")).toBeTruthy();
    expect(screen.getByTestId("graph-node-auth")).toBeTruthy();
    expect(screen.getByTestId("graph-node-billing")).toBeTruthy();

    // Role colors (spec-view-20): the cited package is a contract,
    // the zero-inbound package a composition.
    expect(
      screen.getByTestId("graph-node-auth").getAttribute("data-role"),
    ).toBe("contract");
    expect(
      screen.getByTestId("graph-node-billing").getAttribute("data-role"),
    ).toBe("composition");

    // One directed edge, citing -> cited, carrying both citations'
    // weight (spec-view-20).
    const edge = screen.getByTestId("graph-edge-billing--auth");
    expect(edge.getAttribute("stroke-width")).toBe(String(0.6 + (2.2 * 2) / 2));
    expect(screen.queryByTestId("graph-edge-auth--billing")).toBeNull();

    // Clicking a node keeps the graph beside the outline and expands
    // that file (spec-view-20) — one selection, two projections.
    fireEvent.click(screen.getByTestId("graph-node-auth"));
    expect(screen.getByTestId("spec-graph")).toBeTruthy();
    expect(
      screen.getByTestId("file-toggle-auth").getAttribute("aria-expanded"),
    ).toBe("true");
  });
});

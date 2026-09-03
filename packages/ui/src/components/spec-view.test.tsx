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
import { cardPlacement } from "./SpecGraph.js";
import { editorDirty } from "../lib/spec-view-model.js";
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
          text: "Where the catalog lists published courses ([CAT-1](catalog/courses.md#cat-1)), eligibility shall be the deployment's answer, feeding session mechanics ([AUTH-8](identity/auth.md#auth-8)); see the [index](../map.md), the [guide](../../README.md) and ([SET-99](settings.md#set-99)).",
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
  onWriteSpec,
  onSeedExample,
  seedError,
}: {
  tree?: SpecTreeState;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onReadRecord?: (
    path: string,
  ) => Promise<string | { markdown: string; version?: string }>;
  onWriteSpec?: (
    path: string,
    content: string,
    baseVersion?: string,
  ) => Promise<{ version: string }>;
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
      onWriteSpec={onWriteSpec}
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
    // No collection root row spends a level (spec-view-1).
    expect(screen.queryByTestId("branch-packages")).toBeNull();
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
    fireEvent.click(screen.getByTestId(`file-chevron-${AUTH}`));
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
    await waitFor(() =>
      expect(screen.getByTestId("copied-AUTH-2")).toBeTruthy(),
    );
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
    fireEvent.click(screen.getByTestId(`file-chevron-${GUARD}`));
    expect(screen.queryByTestId("item-GUARD-5")).toBeNull();
    expect(screen.getByTestId("match-count").textContent).toBe("3 matches");
    // And re-opens it.
    fireEvent.click(screen.getByTestId(`file-chevron-${GUARD}`));
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`file-chevron-${GUARD}`));
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
    fireEvent.click(screen.getByRole("link", { name: "guide" }));
    expect(screen.queryByTestId("record-reader")).toBeNull();
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
    // map.md is a reader target of its own now (spec-view-7).
    fireEvent.click(screen.getByRole("link", { name: "index" }));
    expect(onReadRecord).toHaveBeenCalledWith("map.md");
    await screen.findByText("Decided.");
    fireEvent.click(screen.getByText("← Back"));
    // A DR citation swaps to the records reader.
    fireEvent.click(screen.getByTestId(`file-chevron-${AUTH}`));
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
    fireEvent.click(screen.getByTestId(`file-chevron-${GUARD}`));
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

  test("the reader takes focus on Back and returns it to the record's row", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# DR\n\nBody.");
    render(<Harness onReadRecord={onReadRecord} />);
    // The branch is closed until asked for (spec-view-7).
    fireEvent.click(screen.getByTestId("decisions-toggle"));
    const row = screen.getByTestId("record-DR-011");
    fireEvent.click(row);
    await screen.findByText("Body.");
    const back = screen.getByText("← Back");
    expect(document.activeElement).toBe(back);
    fireEvent.click(back);
    // Closing hands focus back to the invoking row (spec-view-7).
    expect(document.activeElement).toBe(screen.getByTestId("record-DR-011"));
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

});

describe("DR-010 §7: accessible names and affordances", () => {
  test("section and topic labels are exposed; toggles carry names", () => {
    render(<Harness />);
    expect(
      screen.getByRole("button", { name: "Decisions, 1 records" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Toggle identity/" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "auth" })).toBeTruthy();
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
  test("the footer offers meta and map directly", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# meta\n\nGlossary.");
    render(<Harness onReadRecord={onReadRecord} />);
    // The footer carries the two tree-wide documents and nothing
    // else (spec-view-7).
    expect(screen.getByTestId("records-map").textContent).toBe("map");
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

describe("spec-view-7/45: records in their places", () => {
  test("the decisions branch stands last and opens the reader", async () => {
    const onReadRecord = vi
      .fn()
      .mockResolvedValue("# Record body\n\nHello from the record.");
    render(<Harness onReadRecord={onReadRecord} />);
    // Decisions are a branch of the outline, and intents are nowhere
    // in the view — they belong to the Dashboard (spec-view-7).
    const branch = screen.getByTestId("decisions-branch");
    fireEvent.click(screen.getByTestId("decisions-toggle"));
    expect(within(branch).getByText("Project workspace")).toBeTruthy();
    expect(screen.queryByText("IR-016")).toBeNull();
    // Each row is the one record row (dashboard-40): the identifier
    // chip the package rows wear, the title, pointer, named as an
    // opener.
    const row = screen.getByTestId("record-DR-011");
    expect(row.getAttribute("aria-label")).toBe("Open DR-011: Project workspace");
    expect(row.getAttribute("title")).toBe("Open DR-011");
    expect(row.className).toContain("cursor-pointer");
    expect(within(row).getByText("DR-011").className).toContain("font-mono");
    expect(within(row).getByText("DR-011").className).toContain("bg-neutral-100");
    // Last in the outline, after every package.
    const rows = screen.getAllByTestId(/^(file-|decisions-branch)/);
    expect(rows[rows.length - 1]).toBe(branch);
    fireEvent.click(within(branch).getByText("Project workspace"));
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

  test("the branch stands on a file-less tree and narrows with search", () => {
    // Records outlive their packages: a tree with no package files
    // still reaches its decisions (spec-view-7).
    const fileLess: SpecTreeState = {
      ...TREE,
      files: [],
      decisions: [
        { id: "DR-001", title: "Scaffold localization", path: "decisions/001-scaffold.md" },
        { id: "DR-011", title: "Project workspace", path: "decisions/011-workspace.md" },
      ],
    };
    render(<Harness tree={fileLess} />);
    const branch = screen.getByTestId("decisions-branch");
    fireEvent.click(screen.getByTestId("decisions-toggle"));
    expect(within(branch).getByText("Scaffold localization")).toBeTruthy();
    expect(within(branch).getByText("Project workspace")).toBeTruthy();

    // A search narrows the branch by record ID and title, the way it
    // narrows packages (spec-view-5).
    fireEvent.change(screen.getByLabelText("Filter items by ID or text"), {
      target: { value: "DR-011" },
    });
    expect(screen.queryByTestId("record-DR-001")).toBeNull();
    expect(screen.getByTestId("record-DR-011")).toBeTruthy();

    // A group filter is a lens on items and leaves the branch whole
    // (spec-view-7).
    // The branch is still open from before the search.
    fireEvent.click(screen.getByTestId("search-clear"));
    fireEvent.click(screen.getByTestId("filter-external"));
    expect(screen.getByTestId("record-DR-001")).toBeTruthy();
    expect(screen.getByTestId("record-DR-011")).toBeTruthy();
  });

  test("spec-view-57: a record asked from another surface names it on Back and hands the origin back", async () => {
    const origin = {
      surface: "dashboard" as const,
      projectId: "p1",
      anchor: "record-row-DR-011",
    };
    const onReturn = vi.fn();
    const onReadRecord = vi.fn().mockResolvedValue("# DR\n\nAsked for.");
    function Requested() {
      const [viewState, setViewState] = useState<SpecViewState>(initialSpecViewState);
      const [path, setPath] = useState<string>();
      return (
        <>
          <SpecView
            tree={TREE}
            onRefresh={() => {}}
            onReadRecord={onReadRecord}
            viewState={viewState}
            onViewState={setViewState}
            openRecordPath={path}
            openRecordOrigin={path ? origin : undefined}
            onRecordOpened={() => setPath(undefined)}
            onReturn={onReturn}
          />
          <button type="button" onClick={() => setPath("decisions/011-project-workspace.md")}>
            request
          </button>
        </>
      );
    }
    render(<Requested />);
    fireEvent.click(screen.getByText("request"));
    await screen.findByText("Asked for.");
    // Back names where the record came from, and takes focus on open.
    const back = screen.getByTestId("reader-back");
    expect(back.textContent).toBe("← Back to Dashboard");
    expect(document.activeElement).toBe(back);
    // The request is answered once: the origin outlives its clearing.
    expect(screen.queryByText("request")).toBeTruthy();
    fireEvent.click(back);
    // Back closes the reader and hands the origin to the host, which
    // owns the return — no focus is thrown at the tree.
    expect(screen.queryByTestId("record-reader")).toBeNull();
    expect(onReturn).toHaveBeenCalledWith(origin);
    expect(screen.getByTestId(`file-${AUTH}`)).toBeTruthy();
  });

  test("spec-view-7: a record picked in the view keeps Back to the tree", async () => {
    const onReturn = vi.fn();
    const onReadRecord = vi.fn().mockResolvedValue("# DR\n\nPicked here.");
    render(
      <SpecView
        tree={TREE}
        onRefresh={() => {}}
        onReadRecord={onReadRecord}
        viewState={initialSpecViewState}
        onViewState={() => {}}
        onReturn={onReturn}
      />,
    );
    fireEvent.click(screen.getByTestId("decisions-toggle"));
    fireEvent.click(screen.getByTestId("record-DR-011"));
    await screen.findByText("Picked here.");
    const back = screen.getByTestId("reader-back");
    expect(back.textContent).toBe("← Back");
    fireEvent.click(back);
    expect(onReturn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByTestId("record-DR-011"));
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
    expect(screen.getByTestId(`file-${AUTH}`)).toBeTruthy();
    // Defaults: all three DR-015 groups on.
    for (const group of ["external", "internal", "test"]) {
      expect(
        screen.getByTestId(`filter-${group}`).getAttribute("aria-pressed"),
      ).toBe("true");
    }
  });
});

// The citation graph beside the outline (spec-view-20, spec-view-22
// through spec-view-29), verified per spec-view-21 and spec-view-38
// through spec-view-41.
describe("spec-view-20: citation graph beside the outline", () => {
  const item = (
    id: string,
    group: "external" | "internal" | "test",
    cites: string[] = [],
  ) => ({
    id,
    group,
    section:
      group === "test"
        ? "Verification"
        : group === "internal"
          ? "Internal Behavior"
          : "External Behavior",
    firstLine: `${id} line.`,
    text: `${id} body.`,
    cites,
  });

  const file = (
    basename: string,
    items: ReturnType<typeof item>[],
  ) => ({
    path: `specs/packages/${basename}.md`,
    key: basename,
    dir: "",
    basename,
    title: basename,
    intent: `${basename} intent.`,
    notices: [],
    items,
  });

  // Differing item counts, a reciprocally citing pair
  // (billing <-> session), and a package no citation reaches
  // (glossary) — the shapes spec-view-38 and spec-view-40 name.
  const GRAPH_TREE: SpecTreeState = {
    present: true,
    legacy: false,
    readAt: Date.now(),
    notices: [],
    decisions: [],
    intents: [],
    files: [
      file("auth", [item("auth-1", "external")]),
      file("billing", [
        item("billing-1", "external", ["auth-1"]),
        item("billing-2", "external", ["auth-1"]),
        item("billing-3", "internal", ["session-1"]),
      ]),
      file("session", [
        item("session-1", "external", ["auth-1"]),
        item("session-2", "test", ["billing-1"]),
      ]),
      file("glossary", [item("glossary-1", "external")]),
    ],
  };

  /** A pane with real dimensions, so the camera has something to fit
   * (spec-view-27); jsdom reports zero otherwise. */
  const sized = () => {
    const width = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientWidth",
    );
    const height = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "clientHeight",
    );
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 800,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => 600,
    });
    // The graph measures its own drawing surface, which jsdom reports
    // as zero unless the box is stubbed too.
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600,
        width: 800, height: 600, toJSON: () => ({}),
      } as DOMRect;
    };
    return () => {
      Element.prototype.getBoundingClientRect = rect;
      if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
      if (height)
        Object.defineProperty(HTMLElement.prototype, "clientHeight", height);
    };
  };

  const showGraph = () => {
    // The graph is on by default (spec-view-20): nothing to click.
    render(<Harness tree={GRAPH_TREE} />);
  };

  const node = (name: string) => screen.getByTestId(`graph-node-${name}`);
  const circleOf = (name: string) =>
    node(name).querySelector("circle:not([data-testid])") as SVGCircleElement;
  const radiusOf = (name: string) => Number(circleOf(name).getAttribute("r"));
  const edge = (from: string, to: string) =>
    screen.getByTestId(`graph-edge-${from}--${to}`);
  /** The graph pane's share of the split, as the style carries it. */
  const graphPaneShare = () => {
    const pane = screen.getByTestId("spec-graph").parentElement as HTMLElement;
    return parseFloat(pane.style.getPropertyValue("--graph-share"));
  };

  test("the toggle adds the graph beside the outline and keeps one selection", () => {
    const restore = sized();
    render(<Harness tree={GRAPH_TREE} />);

    // The graph opens with the view, beside a permanent outline
    // (spec-view-20).
    expect(screen.getByTestId("spec-graph")).toBeTruthy();
    expect(screen.getByTestId("file-toggle-auth")).toBeTruthy();
    // The outline and its own controls stay beside it (spec-view-29).
    expect(screen.getByTestId("file-toggle-auth")).toBeTruthy();
    expect(screen.getByTestId("filter-external")).toBeTruthy();

    // One node per file, one directed edge per citing -> cited pair
    // (spec-view-20).
    for (const name of ["auth", "billing", "session", "glossary"]) {
      expect(node(name)).toBeTruthy();
    }
    expect(edge("billing", "auth")).toBeTruthy();
    expect(edge("session", "auth")).toBeTruthy();
    expect(screen.queryByTestId("graph-edge-auth--billing")).toBeNull();

    // Choosing a node expands that file in the outline without
    // taking the outline off screen (spec-view-20).
    fireEvent.click(node("auth"));
    expect(screen.getByTestId("spec-graph")).toBeTruthy();
    expect(
      screen.getByTestId("file-toggle-auth").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByTestId(`graph-halo-auth`)).toBeTruthy();

    // A live search expands its matching files by computation rather
    // than by the persisted set, so choosing such a file's node must
    // open — never collapse — it.
    fireEvent.change(screen.getByLabelText("Filter items by ID or text"), {
      target: { value: "billing-3" },
    });
    fireEvent.click(node("billing"));
    expect(
      screen.getByTestId("file-toggle-billing").getAttribute("aria-expanded"),
    ).toBe("true");

    // Activating empty graph space clears the selection (spec-view-20).
    fireEvent.click(screen.getByLabelText("Spec package citation graph"));
    expect(screen.queryByTestId("graph-halo-billing")).toBeNull();

    // The link runs both ways: activating a package row selects it on
    // the graph, and arranging leaves the selection alone
    // (spec-view-42).
    fireEvent.change(screen.getByLabelText("Filter items by ID or text"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("file-toggle-session"));
    expect(screen.getByTestId("graph-halo-session")).toBeTruthy();
    fireEvent.click(screen.getByTestId("file-chevron-session"));
    expect(screen.getByTestId("graph-halo-session")).toBeTruthy();

    // The divider moves the split, within bounds (spec-view-20).
    const divider = screen.getByTestId("graph-split");
    fireEvent.keyDown(divider, { key: "ArrowRight" });
    const wider = graphPaneShare();
    fireEvent.keyDown(divider, { key: "ArrowLeft" });
    expect(graphPaneShare()).toBeLessThan(wider);

    // Toggling off leaves the outline alone on the surface, and back
    // on restores the graph.
    fireEvent.click(screen.getByTestId("view-graph"));
    expect(screen.queryByTestId("spec-graph")).toBeNull();
    expect(screen.getByTestId("filter-external")).toBeTruthy();
    expect(screen.getByTestId("records-meta")).toBeTruthy();
    fireEvent.click(screen.getByTestId("view-graph"));
    expect(screen.getByTestId("spec-graph")).toBeTruthy();
    restore();
  });

  test("the toggle's state persists with the rest of the view state", () => {
    // The toggle lives in the persisted view state, not in the
    // component, so a remount restores it (spec-view-20).
    let saved: SpecViewState = initialSpecViewState;
    const Persisting = () => {
      const [state, setState] = useState(saved);
      saved = state;
      return (
        <SpecView
          tree={GRAPH_TREE}
          onRefresh={() => {}}
          onReadRecord={async () => ""}
          viewState={state}
          onViewState={setState}
        />
      );
    };
    const first = render(<Persisting />);
    fireEvent.click(screen.getByTestId("view-graph"));
    expect(screen.queryByTestId("spec-graph")).toBeNull();
    expect(saved.graph).toBe(false);
    first.unmount();

    render(<Persisting />);
    expect(screen.queryByTestId("spec-graph")).toBeNull();
  });

  // spec-view-38: the encodings, and the legend that keys them.
  test("node area counts items, edge width counts citations, direction reads at rest", () => {
    const restore = sized();
    showGraph();

    // Node area carries the item count, stated as a numeral on the
    // node (spec-view-22).
    expect(radiusOf("billing")).toBeGreaterThan(radiusOf("session"));
    expect(radiusOf("session")).toBeGreaterThan(radiusOf("auth"));
    expect(node("billing").getAttribute("data-items")).toBe("3");
    expect(within(node("billing")).getByText("3")).toBeTruthy();
    expect(within(node("auth")).getByText("1")).toBeTruthy();

    // The two roles, without the reserved hues: solid ink where peers
    // cite, ink ring on a tint where none do (spec-view-22).
    expect(node("auth").getAttribute("data-role")).toBe("cited");
    expect(node("glossary").getAttribute("data-role")).toBe("uncited");
    const citedFill = circleOf("auth").getAttribute("class") ?? "";
    const uncitedFill = circleOf("glossary").getAttribute("class") ?? "";
    expect(citedFill).toContain("fill-neutral-700");
    expect(uncitedFill).toContain("stroke-neutral-700");
    for (const cls of [citedFill, uncitedFill]) {
      expect(cls).not.toMatch(/brand|sky|fuchsia|teal|emerald|amber|red/);
    }

    // Width carries the citation count on an absolute scale — a
    // weight-2 edge measures the same in every tree (spec-view-23).
    const heavy = Number(edge("billing", "auth").getAttribute("stroke-width"));
    const light = Number(edge("session", "auth").getAttribute("stroke-width"));
    expect(heavy).toBeCloseTo(2 * Math.SQRT2, 5);
    expect(light).toBeCloseTo(2, 5);
    expect(heavy).toBeGreaterThan(light);

    // Direction reads at rest, through a glyph whose size never
    // follows the edge's width (spec-view-23).
    expect(edge("session", "auth").getAttribute("marker-end")).toBeTruthy();
    const marker = document.querySelector("#spec-graph-arrow");
    expect(marker?.getAttribute("markerUnits")).toBe("userSpaceOnUse");
    const markerWidth = marker?.getAttribute("markerWidth");
    expect(
      document
        .querySelector("#spec-graph-arrow-emphasis")
        ?.getAttribute("markerWidth"),
    ).toBe(markerWidth);

    // The reciprocal pair draws as two offset edges, never one edge
    // with two heads (spec-view-23).
    const forward = edge("billing", "session");
    const back = edge("session", "billing");
    const midpoint = (line: Element) => [
      (Number(line.getAttribute("x1")) + Number(line.getAttribute("x2"))) / 2,
      (Number(line.getAttribute("y1")) + Number(line.getAttribute("y2"))) / 2,
    ];
    const [ax, ay] = midpoint(forward);
    const [bx, by] = midpoint(back);
    expect(Math.hypot(ax - bx, ay - by)).toBeGreaterThan(10);

    // Every channel and affordance in use is keyed (spec-view-24).
    const graph = screen.getByTestId("spec-graph");
    for (const key of [
      "cited by packages",
      "not cited by packages",
      "size — items",
      "width — citations",
      "arrow — cites",
    ]) {
      expect(within(graph).getByText(key)).toBeTruthy();
    }
    expect(within(graph).getByText(/click opens/)).toBeTruthy();
    expect(screen.getByTestId("graph-fit")).toBeTruthy();
    restore();
  });

  // spec-view-39: contrast as a computed composite, not a judgement.
  test("every resting mark clears its contrast floor in both themes", () => {
    const restore = sized();
    showGraph();

    // The tokens these classes name (index.css), and the surface each
    // theme paints behind the graph.
    const TOKENS: Record<string, { light: string; dark: string }> = {
      "neutral-50": { light: "#f7f4ef", dark: "#f7f4ef" },
      "neutral-100": { light: "#efeae2", dark: "#efeae2" },
      "neutral-200": { light: "#e3ded5", dark: "#e3ded5" },
      "neutral-300": { light: "#d8d2c6", dark: "#d8d2c6" },
      "neutral-400": { light: "#a3a3a3", dark: "#a3a3a3" },
      "neutral-500": { light: "#696969", dark: "#737373" },
      "neutral-600": { light: "#525252", dark: "#525252" },
      "neutral-700": { light: "#404040", dark: "#404040" },
      "neutral-800": { light: "#262626", dark: "#262626" },
      "neutral-950": { light: "#0a0a0a", dark: "#0a0a0a" },
      "brand-400": { light: "#bb6ee9", dark: "#bb6ee9" },
      "brand-600": { light: "#890fbc", dark: "#890fbc" },
    };
    const SURFACE = { light: "#f7f4ef", dark: "#0a0a0a" };

    const luminance = (hex: string) => {
      const channel = (i: number) => {
        const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
        return value <= 0.03928
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
    };
    const ratio = (a: string, b: string) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };
    /** The token a class list paints in one theme: the dark: variant
     * wins there, the bare utility elsewhere. */
    const paint = (
      classes: string,
      property: "fill" | "stroke" | "text",
      theme: "light" | "dark",
    ) => {
      const pattern = new RegExp(
        `(^|\\s)${theme === "dark" ? "dark:" : ""}${property}-(neutral|brand)-(\\d+)`,
        "g",
      );
      const matches = [...classes.matchAll(pattern)];
      const last = matches[matches.length - 1];
      if (!last && theme === "dark") return paint(classes, property, "light");
      if (!last) throw new Error(`no ${property} token in "${classes}"`);
      const token = TOKENS[`${last[2]}-${last[3]}`];
      if (!token) throw new Error(`unknown token ${last[2]}-${last[3]}`);
      return token[theme];
    };

    const citedCircle = circleOf("auth").getAttribute("class") ?? "";
    const uncitedCircle = circleOf("glossary").getAttribute("class") ?? "";
    const edgeLine = edge("billing", "auth").getAttribute("class") ?? "";
    const label =
      screen.getByTestId("graph-label-auth").getAttribute("class") ?? "";
    const numeral =
      node("auth").querySelectorAll("text")[0].getAttribute("class") ?? "";
    const legend =
      screen.getByText("size — items").parentElement?.getAttribute("class") ??
      "";

    for (const theme of ["light", "dark"] as const) {
      const ground = SURFACE[theme];
      // Graphical marks: the 3:1 non-text floor (WCAG 1.4.11).
      expect(ratio(paint(citedCircle, "fill", theme), ground)).toBeGreaterThanOrEqual(3);
      expect(
        ratio(paint(uncitedCircle, "stroke", theme), ground),
      ).toBeGreaterThanOrEqual(3);
      expect(ratio(paint(edgeLine, "stroke", theme), ground)).toBeGreaterThanOrEqual(3);
      // Text marks: the 4.5:1 floor, the numeral against its own fill.
      expect(ratio(paint(label, "fill", theme), ground)).toBeGreaterThanOrEqual(4.5);
      expect(
        ratio(paint(numeral, "fill", theme), paint(citedCircle, "fill", theme)),
      ).toBeGreaterThanOrEqual(4.5);
      expect(ratio(paint(legend, "text", theme), ground)).toBeGreaterThanOrEqual(4.5);
    }
    restore();
  });

  // spec-view-40: the settled layout, and what a drag does not keep.
  test("the layout settles the same picture twice and keeps no drag", () => {
    const restore = sized();
    const positions = () =>
      ["auth", "billing", "session", "glossary"].map((name) => [
        Number(circleOf(name).getAttribute("cx")),
        Number(circleOf(name).getAttribute("cy")),
      ]);

    const first = render(<Harness tree={GRAPH_TREE} />);
    const settled = positions();
    // A package no citation reaches still holds a place in the
    // layout (spec-view-28).
    const glossary = settled[3];
    expect(Number.isFinite(glossary[0])).toBe(true);
    expect(Number.isFinite(glossary[1])).toBe(true);

    // The solved presentation: nothing overlaps, and every node keeps
    // its activation-target floor (spec-view-28).
    const marks = ["auth", "billing", "session", "glossary"].map((name) => {
      const circle = circleOf(name);
      const label = screen.getByTestId(`graph-label-${name}`);
      return {
        name,
        x: Number(circle.getAttribute("cx")),
        y: Number(circle.getAttribute("cy")),
        r: Number(circle.getAttribute("r")),
        // The rendered label's own box, as the solve measured it.
        half: Math.max(
          Number(circle.getAttribute("r")),
          (label.textContent?.length ?? 0) * 3.2,
        ),
      };
    });
    for (const mark of marks) expect(mark.r).toBeGreaterThanOrEqual(12);
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        const a = marks[i];
        const b = marks[j];
        const apart =
          Math.abs(a.x - b.x) >= a.half + b.half ||
          Math.abs(a.y - b.y) >= a.r + b.r + 6 + 12;
        expect(
          apart,
          `${a.name} and ${b.name} overlap in the solved picture`,
        ).toBe(true);
      }
    }

    // Dragging moves the held node (spec-view-28).
    // Driven as MouseEvents: jsdom has no PointerEvent, and a plain
    // synthetic event carries no coordinates to drag by.
    const target = node("auth");
    const pointer = (type: string, x: number, y: number) =>
      fireEvent(
        target,
        new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
      );
    pointer("pointerdown", 0, 0);
    pointer("pointermove", 700, 500);
    expect(Number(circleOf("auth").getAttribute("cx"))).not.toBeCloseTo(
      settled[0][0],
      3,
    );
    pointer("pointerup", 700, 500);
    // A release that moved the node is a drag, not a choice: it moves
    // the node and leaves the selection alone (spec-view-28).
    fireEvent.click(target);
    expect(screen.queryByTestId("graph-halo-auth")).toBeNull();
    expect(
      screen.getByTestId("file-toggle-auth").getAttribute("aria-expanded"),
    ).toBe("false");
    first.unmount();

    // The same tree settles the same picture, and the drag is gone
    // (spec-view-28).
    render(<Harness tree={GRAPH_TREE} />);
    expect(positions()).toEqual(settled);
    restore();
  });

  // spec-view-41: emphasis, keyboard, cards, camera, and scoping.
  test("selection holds through transit, and the keyboard drives the graph", () => {
    const restore = sized();
    showGraph();

    // A selection is the stable base state, and hovering never takes
    // it — a hover reads numbers and leaves the picture whole
    // (spec-view-25).
    fireEvent.click(node("auth"));
    expect(screen.getByTestId("graph-halo-auth")).toBeTruthy();
    const dimBefore = node("glossary").getAttribute("opacity");
    fireEvent.mouseEnter(node("glossary"));
    expect(screen.getByTestId("graph-halo-auth")).toBeTruthy();
    expect(node("glossary").getAttribute("opacity")).toBe(dimBefore);
    expect(screen.queryByTestId("graph-halo-glossary")).toBeNull();
    fireEvent.mouseLeave(node("glossary"));

    // Keyboard focus reaches a node, shows its card, and Enter opens
    // it (spec-view-25, spec-view-26).
    fireEvent.focus(node("billing"));
    const card = screen.getByTestId("graph-card");
    expect(within(card).getByText("billing")).toBeTruthy();
    expect(within(card).getByText(/3 items in total/)).toBeTruthy();
    // The breakdown is a list in the outline's count grammar.
    expect(within(card).getByLabelText("2 external items")).toBeTruthy();
    expect(within(card).getByLabelText("1 internal items")).toBeTruthy();
    expect(within(card).getByLabelText("0 test items")).toBeTruthy();
    expect(within(card).getByText(/cites 3 · cited by 1/)).toBeTruthy();
    fireEvent.keyDown(node("billing"), { key: "Enter" });
    expect(
      screen.getByTestId("file-toggle-billing").getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.blur(node("billing"));

    // Escape dismisses the selection once no hover holds the
    // emphasis (spec-view-25).
    const surface = screen.getByLabelText("Spec package citation graph");
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(screen.queryByTestId("graph-halo-auth")).toBeNull();

    // The camera zooms and returns to the fitted whole (spec-view-27).
    const layer = () =>
      screen.getByTestId("spec-graph").querySelector("svg > g") as SVGGElement;
    const scaleOf = (element: SVGGElement) =>
      Number(/scale\(([-\d.]+)\)/.exec(element.getAttribute("transform") ?? "")?.[1]);
    const fitted = scaleOf(layer());
    expect(fitted).toBeGreaterThan(0);
    fireEvent.keyDown(surface, { key: "+" });
    expect(scaleOf(layer())).toBeGreaterThan(fitted);
    fireEvent.click(screen.getByTestId("graph-fit"));
    expect(scaleOf(layer())).toBeCloseTo(fitted, 6);
    restore();
  });

  test("a search narrows the outline to the packages that answer it", () => {
    const restore = sized();
    showGraph();
    const search = screen.getByLabelText("Filter items by ID or text");

    // A package holding no match leaves the outline for the search's
    // duration; a group filter leaves every package standing
    // (spec-view-5, spec-view-4).
    fireEvent.change(search, { target: { value: "billing-3" } });
    expect(screen.getByTestId("file-toggle-billing")).toBeTruthy();
    expect(screen.queryByTestId("file-toggle-auth")).toBeNull();
    expect(screen.queryByTestId("file-toggle-glossary")).toBeNull();
    // The graph still maps the whole tree (spec-view-29).
    expect(node("glossary")).toBeTruthy();

    // The box offers a way out, and so does Escape (spec-view-5).
    fireEvent.click(screen.getByTestId("search-clear"));
    expect(screen.getByTestId("file-toggle-auth")).toBeTruthy();
    expect(screen.queryByTestId("search-clear")).toBeNull();

    fireEvent.change(search, { target: { value: "billing-3" } });
    expect(screen.queryByTestId("file-toggle-auth")).toBeNull();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.getByTestId("file-toggle-auth")).toBeTruthy();

    // A filter, by contrast, keeps every package on screen
    // (spec-view-4).
    fireEvent.click(screen.getByTestId("filter-external"));
    expect(screen.getByTestId("file-toggle-auth")).toBeTruthy();
    expect(screen.getByTestId("file-toggle-glossary")).toBeTruthy();
    restore();
  });

  test("the axes stay independent: arranging, jumping, and searching leave the selection", () => {
    const restore = sized();
    showGraph();

    // Selecting A, then arranging B, leaves the selection on A — and
    // collapsing either never clears it (spec-view-42).
    fireEvent.click(node("auth"));
    expect(screen.getByTestId("graph-halo-auth")).toBeTruthy();
    fireEvent.click(screen.getByTestId("file-chevron-billing"));
    expect(screen.getByTestId("graph-halo-auth")).toBeTruthy();
    expect(screen.queryByTestId("graph-halo-billing")).toBeNull();
    fireEvent.click(screen.getByTestId("file-chevron-auth"));
    expect(screen.getByTestId("graph-halo-auth")).toBeTruthy();

    // A search over a selection keeps the selected package standing,
    // said in the reveals' own words (spec-view-44).
    const search = screen.getByLabelText("Filter items by ID or text");
    fireEvent.change(search, { target: { value: "billing-3" } });
    expect(screen.getByTestId("file-toggle-auth")).toBeTruthy();
    expect(screen.getByTestId("retained-auth").textContent).toContain(
      "shown despite search",
    );
    expect(screen.getByTestId("graph-halo-auth")).toBeTruthy();
    // Both voices sound at once: the match ring survives the
    // selection's isolation (spec-view-44).
    expect(screen.getByTestId("graph-match-billing")).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });

    // The ladder: Escape from the outline pane clears the selection
    // once nothing else claims it (spec-view-42).
    fireEvent.keyDown(screen.getByTestId("file-toggle-auth"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("graph-halo-auth")).toBeNull();
    restore();
  });

  test("search marks the graph while filters leave its counts whole", () => {
    const restore = sized();
    showGraph();

    // A search marks the packages holding matches without moving a
    // node (spec-view-29).
    const before = Number(circleOf("billing").getAttribute("cx"));
    fireEvent.change(screen.getByLabelText("Filter items by ID or text"), {
      target: { value: "billing-3" },
    });
    expect(node("billing").getAttribute("data-match")).toBe("true");
    expect(screen.getByTestId("graph-match-billing")).toBeTruthy();
    expect(node("auth").getAttribute("data-match")).toBeNull();
    expect(Number(circleOf("billing").getAttribute("cx"))).toBeCloseTo(before, 6);

    // The graph's counts follow the whole tree, whatever the filters
    // exclude (spec-view-29).
    fireEvent.change(screen.getByLabelText("Filter items by ID or text"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByTestId("filter-external"));
    expect(node("billing").getAttribute("data-items")).toBe("3");
    expect(radiusOf("billing")).toBeGreaterThan(radiusOf("auth"));
    restore();
  });

  // spec-view-59: neither half of the split is squeezed away.
  test("both panes keep a floor and the split scrolls rather than clipping", () => {
    const restore = sized();
    showGraph();
    const graphPane = screen.getByTestId("spec-graph").parentElement as HTMLElement;
    const outlinePane = screen.getByTestId("file-toggle-auth").closest("div.flex.min-h-40");
    expect(outlinePane).not.toBeNull();
    expect(graphPane.className).toContain("min-h-24");
    // The stacked split scrolls as one, so a floor that outgrows the
    // surface is reachable instead of clipped by the root.
    const split = graphPane.parentElement as HTMLElement;
    expect(split.className).toContain("min-h-full");
    expect((split.parentElement as HTMLElement).className).toContain("overflow-y-auto");
    restore();
  });
});

// ---------------------------------------------------------------------------
// DR-041 §9: the outline row and the graph's card fit their panes
// ---------------------------------------------------------------------------

describe("spec-view-55/26: nothing outgrows the pane it is drawn in", () => {
  test("a long item id truncates rather than widening its row", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    const chip = screen.getByRole("button", { name: "Copy AUTH-2" });
    expect(chip.className).toContain("truncate");
    expect(chip.className).toContain("max-w-40");
    expect(chip.className).not.toContain("shrink-0");
  });

  test("the card moves in by its own half-width at either edge", () => {
    const pane = { width: 300, height: 400 };
    const card = { width: 224, height: 150 };
    expect(cardPlacement({ left: 4, top: 10 }, pane, card).left).toBe(112);
    expect(cardPlacement({ left: 296, top: 10 }, pane, card).left).toBe(188);
    // Untouched where the mark leaves room on both sides.
    expect(cardPlacement({ left: 150, top: 10 }, pane, card).left).toBe(150);
  });

  test("a pane narrower than the card still holds the whole card", () => {
    // The card takes the pane's width there, so its half follows.
    const placed = cardPlacement(
      { left: 12, top: 10 },
      { width: 180, height: 400 },
      { width: 180, height: 150 },
    );
    expect(placed.left).toBe(90);
  });

  test("a tall card rides above the legend instead of through it", () => {
    const placed = cardPlacement(
      { left: 100, top: 380 },
      { width: 300, height: 400 },
      { width: 224, height: 220 },
    );
    expect(placed.top).toBe(172);
    // A card taller than its pane keeps its head in view.
    expect(
      cardPlacement({ left: 100, top: 40 }, { width: 300, height: 120 }, { width: 224, height: 220 }).top,
    ).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// spec-view-53: the whole-file editor (DR-043)
// ---------------------------------------------------------------------------

describe("spec-view-53: the editor", () => {
  const AUTH_PATH = "packages/identity/auth.md";
  const DR_PATH = "decisions/011-project-workspace.md";
  const AUTH_TEXT =
    "# auth: GitHub Login\n\n## External Behavior\n\n### Sign-In\n\n#### AUTH-2\n\nThe form shall validate credentials.\n\n#### auth-1\n\nThe app shall render a sign-in form.\n";
  const DR_TEXT = "# DR-011: Project workspace\n\n## Status\n\nAccepted\n";

  /** Reads serving text with tokens (spec-view-16), by path. */
  const reads = () =>
    vi.fn(async (path: string) =>
      path === AUTH_PATH
        ? { markdown: AUTH_TEXT, version: "v-auth" }
        : { markdown: DR_TEXT, version: "v-dr" },
    );
  const conflict = () =>
    Object.assign(new Error("changed on disk"), { code: "conflict" });

  const field = () =>
    screen.getByRole("textbox", { name: /^Edit / }) as HTMLTextAreaElement;

  async function openRecordEditor() {
    fireEvent.click(screen.getByTestId("decisions-toggle"));
    fireEvent.click(screen.getByTestId("record-DR-011"));
    await screen.findByText("Accepted");
    fireEvent.click(screen.getByTestId("reader-edit"));
    return screen.getByTestId("spec-editor");
  }

  test("no Edit control shows where the host wires no write", async () => {
    render(<Harness onReadRecord={reads()} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    expect(screen.queryByTestId(`file-edit-${AUTH}`)).toBeNull();
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-2"));
    expect(screen.queryByTestId("item-edit-AUTH-2")).toBeNull();
    fireEvent.click(screen.getByTestId("decisions-toggle"));
    fireEvent.click(screen.getByTestId("record-DR-011"));
    await screen.findByText("Accepted");
    expect(screen.queryByTestId("reader-edit")).toBeNull();
  });

  test("the reader's Edit opens the record with Save disabled; a clean Cancel returns to the reader", async () => {
    const onWriteSpec = vi.fn();
    render(<Harness onReadRecord={reads()} onWriteSpec={onWriteSpec} />);
    await openRecordEditor();
    // The editor holds the whole text as read, labeled by its path,
    // and takes focus (spec-view-48).
    expect(field().value).toBe(DR_TEXT);
    expect(field().getAttribute("aria-label")).toBe(`Edit ${DR_PATH}`);
    expect(field().getAttribute("spellcheck")).toBe("false");
    expect(document.activeElement).toBe(field());
    expect(screen.getByTestId("spec-editor").textContent).toContain(DR_PATH);
    expect((screen.getByTestId("editor-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("editor-dirty")).toBeNull();
    expect(screen.getByTestId("editor-edit").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("editor-preview").getAttribute("aria-pressed")).toBe("false");
    // A clean draft closes at once (spec-view-49), back into the
    // reader with focus on Back.
    fireEvent.click(screen.getByTestId("editor-cancel"));
    expect(screen.queryByTestId("editor-confirm")).toBeNull();
    expect(screen.getByTestId("record-reader")).toBeTruthy();
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByText("← Back"));
    expect(onWriteSpec).not.toHaveBeenCalled();
  });

  test("an expanded package's Edit opens its file; an item's Edit lands the caret on its heading", async () => {
    const onReadRecord = reads();
    render(<Harness onReadRecord={onReadRecord} onWriteSpec={vi.fn()} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId(`file-edit-${AUTH}`));
    await screen.findByTestId("spec-editor");
    expect(onReadRecord).toHaveBeenCalledWith(AUTH_PATH);
    expect(field().value).toBe(AUTH_TEXT);
    expect(liveText()).toBe(`Editing ${AUTH_PATH}`);
    // Cancel returns to the outline, focus on the package's Edit.
    fireEvent.click(screen.getByTestId("editor-cancel"));
    expect(screen.queryByTestId("spec-editor")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId(`file-edit-${AUTH}`));

    // From an item: the caret sits at the start of the item's heading
    // line — matched case-insensitively, as the file spells it.
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-1"));
    fireEvent.click(screen.getByTestId("item-edit-AUTH-1"));
    await screen.findByTestId("spec-editor");
    const lines = AUTH_TEXT.split("\n");
    const headingLine = lines.indexOf("#### auth-1");
    const offset = lines
      .slice(0, headingLine)
      .reduce((sum, line) => sum + line.length + 1, 0);
    expect(field().selectionStart).toBe(offset);
    expect(field().value.slice(offset).split("\n")[0]).toBe("#### auth-1");
  });

  test("Preview renders the draft with links inert; Save writes under the token and closes into the reader", async () => {
    const onWriteSpec = vi.fn(async () => ({ version: "v-dr-2" }));
    const onRefresh = vi.fn();
    render(
      <Harness onReadRecord={reads()} onWriteSpec={onWriteSpec} onRefresh={onRefresh} />,
    );
    await openRecordEditor();
    const edited = DR_TEXT.replace(
      "Accepted",
      "Accepted, see [DR-001](001-scaffold.md) and [AUTH-1](../packages/identity/auth.md#auth-1)",
    );
    fireEvent.change(field(), { target: { value: edited } });
    // The unsaved mark and an enabled Save (spec-view-48).
    expect(screen.getByTestId("editor-dirty")).toBeTruthy();
    expect((screen.getByTestId("editor-save") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("editor-preview"));
    expect(screen.getByTestId("editor-preview").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("textbox", { name: /^Edit / })).toBeNull();
    const pane = screen.getByTestId("editor-preview-pane");
    expect(pane.textContent).toContain("Accepted, see DR-001 and AUTH-1");
    // Links render but never navigate or jump: the click is cancelled
    // and the view stays in the editor.
    const link = within(pane).getByRole("link", { name: "AUTH-1" });
    expect(fireEvent.click(link)).toBe(false);
    expect(screen.getByTestId("spec-editor")).toBeTruthy();

    fireEvent.click(screen.getByTestId("editor-save"));
    // The write carries the read's token (spec-view-50, spec-view-47).
    expect(onWriteSpec).toHaveBeenCalledWith(DR_PATH, edited, "v-dr");
    const reader = await screen.findByTestId("record-reader");
    expect(reader.textContent).toContain("Accepted, see DR-001 and AUTH-1");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(liveText()).toBe(`Saved ${DR_PATH}`);
  });

  test("Cmd/Ctrl+S saves and Escape asks first on a changed draft", async () => {
    const onWriteSpec = vi.fn(async () => ({ version: "v-dr-2" }));
    render(<Harness onReadRecord={reads()} onWriteSpec={onWriteSpec} />);
    await openRecordEditor();
    fireEvent.change(field(), { target: { value: `${DR_TEXT}\nMore.\n` } });
    // Escape: the confirm's safe default keeps the draft (spec-view-49).
    fireEvent.keyDown(field(), { key: "Escape" });
    const confirm = screen.getByTestId("editor-confirm");
    expect(confirm.textContent).toContain("Discard unsaved changes?");
    expect(document.activeElement).toBe(within(confirm).getByText("Keep"));
    fireEvent.click(within(confirm).getByText("Keep"));
    expect(screen.queryByTestId("editor-confirm")).toBeNull();
    expect(field().value).toBe(`${DR_TEXT}\nMore.\n`);
    // Cmd+S writes the draft under the token.
    fireEvent.keyDown(field(), { key: "s", metaKey: true });
    expect(onWriteSpec).toHaveBeenCalledWith(DR_PATH, `${DR_TEXT}\nMore.\n`, "v-dr");
    await screen.findByTestId("record-reader");
  });

  test("Discard closes a changed draft; Ctrl+S on a clean draft writes nothing", async () => {
    const onWriteSpec = vi.fn(async () => ({ version: "v-dr-2" }));
    render(<Harness onReadRecord={reads()} onWriteSpec={onWriteSpec} />);
    await openRecordEditor();
    fireEvent.keyDown(field(), { key: "s", ctrlKey: true });
    expect(onWriteSpec).not.toHaveBeenCalled();
    fireEvent.change(field(), { target: { value: "# DR-011: Changed\n" } });
    fireEvent.click(screen.getByTestId("editor-cancel"));
    fireEvent.click(within(screen.getByTestId("editor-confirm")).getByText("Discard"));
    // Back in the reader, the text as read stands.
    const reader = screen.getByTestId("record-reader");
    expect(reader.textContent).toContain("Accepted");
    expect(reader.textContent).not.toContain("Changed");
    expect(onWriteSpec).not.toHaveBeenCalled();
  });

  test("a conflict keeps the draft: Overwrite writes without a token", async () => {
    const onWriteSpec = vi
      .fn<(path: string, content: string, baseVersion?: string) => Promise<{ version: string }>>()
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ version: "v-dr-3" });
    render(<Harness onReadRecord={reads()} onWriteSpec={onWriteSpec} />);
    await openRecordEditor();
    const edited = `${DR_TEXT}\nMine.\n`;
    fireEvent.change(field(), { target: { value: edited } });
    fireEvent.click(screen.getByTestId("editor-save"));
    const strip = await screen.findByTestId("editor-conflict");
    expect(strip.textContent).toContain("This file changed on disk since you opened it");
    expect(field().value).toBe(edited);
    fireEvent.click(screen.getByTestId("editor-overwrite"));
    expect(onWriteSpec).toHaveBeenLastCalledWith(DR_PATH, edited, undefined);
    const reader = await screen.findByTestId("record-reader");
    expect(reader.textContent).toContain("Mine.");
  });

  test("a conflict's Reload asks first, then replaces the draft with the file as it is", async () => {
    const onReadRecord = vi
      .fn<(path: string) => Promise<{ markdown: string; version: string }>>()
      .mockResolvedValueOnce({ markdown: DR_TEXT, version: "v-dr" })
      .mockResolvedValueOnce({ markdown: `${DR_TEXT}\nTheirs.\n`, version: "v-dr-2" });
    const onWriteSpec = vi.fn(async () => {
      throw conflict();
    });
    render(<Harness onReadRecord={onReadRecord} onWriteSpec={onWriteSpec} />);
    await openRecordEditor();
    fireEvent.change(field(), { target: { value: `${DR_TEXT}\nMine.\n` } });
    fireEvent.click(screen.getByTestId("editor-save"));
    await screen.findByTestId("editor-conflict");
    fireEvent.click(screen.getByTestId("editor-reload"));
    const confirm = screen.getByTestId("editor-confirm");
    expect(confirm.textContent).toContain("Reload from disk");
    fireEvent.click(within(confirm).getByText("Reload"));
    await waitFor(() => expect(field().value).toBe(`${DR_TEXT}\nTheirs.\n`));
    expect(onReadRecord).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("editor-conflict")).toBeNull();
    expect(screen.queryByTestId("editor-dirty")).toBeNull();
    // The next save carries the reloaded token.
    fireEvent.change(field(), { target: { value: `${DR_TEXT}\nTheirs. Mine.\n` } });
    fireEvent.click(screen.getByTestId("editor-save"));
    expect(onWriteSpec).toHaveBeenLastCalledWith(DR_PATH, `${DR_TEXT}\nTheirs. Mine.\n`, "v-dr-2");
  });

  test("any other failure keeps the draft with a retry", async () => {
    const onWriteSpec = vi
      .fn<(path: string, content: string, baseVersion?: string) => Promise<{ version: string }>>()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce({ version: "v-dr-2" });
    render(<Harness onReadRecord={reads()} onWriteSpec={onWriteSpec} />);
    await openRecordEditor();
    fireEvent.change(field(), { target: { value: `${DR_TEXT}\nMore.\n` } });
    fireEvent.click(screen.getByTestId("editor-save"));
    const strip = await screen.findByTestId("editor-error");
    expect(strip.textContent).toContain("disk full");
    expect(field().value).toBe(`${DR_TEXT}\nMore.\n`);
    fireEvent.click(within(strip).getByText("Retry"));
    await screen.findByTestId("record-reader");
    expect(onWriteSpec).toHaveBeenCalledTimes(2);
  });

  test("a remount restores the draft from the lifted view state, still unsaved", async () => {
    function Lifted() {
      const [viewState, setViewState] = useState<SpecViewState>(initialSpecViewState);
      const [shown, setShown] = useState(true);
      return (
        <>
          {shown ? (
            <SpecView
              tree={TREE}
              onRefresh={() => {}}
              onReadRecord={reads()}
              onWriteSpec={vi.fn()}
              viewState={viewState}
              onViewState={setViewState}
            />
          ) : null}
          <button type="button" onClick={() => setShown((s) => !s)}>
            toggle
          </button>
          <span data-testid="dirty">{String(editorDirty(viewState))}</span>
        </>
      );
    }
    render(<Lifted />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId(`file-edit-${AUTH}`));
    await screen.findByTestId("spec-editor");
    fireEvent.change(field(), { target: { value: `${AUTH_TEXT}\nDraft.\n` } });
    fireEvent.click(screen.getByTestId("editor-preview"));
    expect(screen.getByTestId("dirty").textContent).toBe("true");
    fireEvent.click(screen.getByText("toggle"));
    expect(screen.queryByTestId("spec-editor")).toBeNull();
    fireEvent.click(screen.getByText("toggle"));
    // Back as it was: the draft, the mode, and the unsaved mark
    // (spec-view-51).
    expect(screen.getByTestId("spec-editor")).toBeTruthy();
    expect(screen.getByTestId("editor-preview").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("editor-preview-pane").textContent).toContain("Draft.");
    expect(screen.getByTestId("editor-dirty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("editor-edit"));
    expect(field().value).toBe(`${AUTH_TEXT}\nDraft.\n`);
  });

  test("a record requested while a draft stands opens beneath it, discarding nothing", async () => {
    function Requested() {
      const [viewState, setViewState] = useState<SpecViewState>(initialSpecViewState);
      const [path, setPath] = useState<string>();
      return (
        <>
          <SpecView
            tree={TREE}
            onRefresh={() => {}}
            onReadRecord={reads()}
            onWriteSpec={vi.fn()}
            viewState={viewState}
            onViewState={setViewState}
            openRecordPath={path}
            onRecordOpened={() => setPath(undefined)}
          />
          <button type="button" onClick={() => setPath(DR_PATH)}>
            request
          </button>
        </>
      );
    }
    render(<Requested />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId(`file-edit-${AUTH}`));
    await screen.findByTestId("spec-editor");
    fireEvent.change(field(), { target: { value: `${AUTH_TEXT}\nDraft.\n` } });
    fireEvent.click(screen.getByText("request"));
    expect(screen.getByTestId("spec-editor")).toBeTruthy();
    expect(field().value).toBe(`${AUTH_TEXT}\nDraft.\n`);
    // Once the draft is discarded, the requested record is there.
    fireEvent.click(screen.getByTestId("editor-cancel"));
    fireEvent.click(within(screen.getByTestId("editor-confirm")).getByText("Discard"));
    // The reader mounts before its read resolves: wait for the words.
    const reader = await screen.findByTestId("record-reader");
    await within(reader).findByText(/Accepted/);
  });
});

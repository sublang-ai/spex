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
  act,
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
import { zoomIdentity } from "d3-zoom";
import {
  boundCamera,
  buildGraphModel,
  cardPlacement,
  floatingCardPlacement,
  revealShift,
} from "./SpecGraph.js";
import { HOVER_INTENT_MS, PREVIEW_CARD_ID } from "./CitationPreview.js";
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
      title: "Projects intent",
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

const COMMENT_SPEC = `<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- spex-i18n-source: meta-1 sha256-hidden-source-pin -->

# Readable specification

Visible before <!-- hidden-inline-comment --> and after.

<!--
hidden-multiline-comment
-->

<!-- hidden-leading-comment --> Visible trailing text.

<div>Visible wrapped text <!-- hidden-wrapped-comment --></div>

Inline example: \`<!-- visible-inline-example -->\`.

\`\`\`markdown
<!-- visible-block-example -->
\`\`\`

<span data-raw-comment-test="unsafe">Raw HTML stays text.</span>
`;

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
    // Counts are numerals in group columns, each naming its group in
    // full for assistive technology (spec-view-2).
    expect(within(auth).getByLabelText("3 external behavior items").textContent).toBe("3");
    expect(within(auth).getByLabelText("1 internal behavior items").textContent).toBe("1");
    expect(within(auth).getByLabelText("1 test items").textContent).toBe("1");
    // Header totals across the collection.
    expect(screen.getByText("3 packages · 10 items")).toBeTruthy();
    // Files default collapsed: no item rows yet.
    expect(screen.queryByTestId("item-AUTH-2")).toBeNull();
  });

  test("zero counts stay, as a dash; a root file needs no directory", () => {
    render(<Harness />);
    const courses = screen.getByTestId(`file-${CAT}`);
    // Zero renders as a muted dash, not absent (spec-view-2).
    expect(within(courses).getByLabelText("0 internal behavior items").textContent).toBe("—");
    expect(within(courses).getByLabelText("0 test items").textContent).toBe("—");
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
    // Sections head by their group's name and count; topics keep the
    // author's words (spec-view-2).
    const external = screen.getByTestId("section-AUTH-2");
    const signIn = screen.getByText("Sign-In");
    const recovery = screen.getByText("Recovery");
    const internal = screen.getByTestId("section-AUTH-8");
    const verification = screen.getByTestId("section-AUTH-10");
    expect(external.textContent).toBe("External behavior · 3");
    expect(internal.textContent).toBe("Internal behavior · 1");
    expect(verification.textContent).toBe("Tests · 1");
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
    expect(screen.getByText("Collapse all items")).toBeTruthy();
    // The items bar stands between the intent and the items, stating
    // the count and naming each control for its object (spec-view-2).
    const bar = screen.getByTestId(`items-head-${AUTH}`);
    expect(bar.textContent).toMatch(/^\d+ items/);
    expect(within(bar).getByTestId(`expand-all-${AUTH}`)).toBeTruthy();
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

  test("rows carry a complete muted citation summary and no group word", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    // Outbound and inbound: CAT-1 cites AUTH-2 and is cited by
    // GUARD-5 and GUARD-3.
    expect(screen.getByTestId("cite-summary-CAT-1").textContent).toBe(
      "cites 1 · cited by 2",
    );
    // Inbound only, intra-file citers included (unlike the file
    // rollup): AUTH-1 ← AUTH-2, AUTH-10, GUARD-1.
    expect(screen.getByTestId("cite-summary-AUTH-1").textContent).toBe(
      "cited by 3",
    );
    // Outbound only, dead target included.
    expect(screen.getByTestId("cite-summary-AUTH-10").textContent).toBe(
      "cites 2",
    );
    // No citations either way: no summary.
    expect(screen.queryByTestId("cite-summary-AUTH-3")).toBeNull();
    // The section heading names the group; the row repeats no group
    // word (spec-view-3).
    expect(
      within(screen.getByTestId("item-AUTH-2")).queryByText("external behavior"),
    ).toBeNull();
    // The summary stands expanded too.
    fireEvent.click(screen.getByTestId("item-toggle-CAT-1"));
    expect(screen.getByTestId("cite-summary-CAT-1")).toBeTruthy();
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

  test("backlinks list on the cited target, every entry at once", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    // AUTH-8 is cited by GUARD-5 and GUARD-6, listed without a toggle
    // (spec-view-19).
    const citedBy = screen.getByTestId("inbound-AUTH-8");
    expect(citedBy.textContent).toContain("cited by 2");
    expect(citedBy.querySelector("[aria-expanded]")).toBeNull();
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
    // The outbound row marks it unresolved where it stands
    // (spec-view-19).
    expect(screen.getByTestId("unresolved-AUTH-10-AUTH-99").textContent).toBe(
      "unresolved",
    );
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
    fireEvent.click(screen.getByTestId("reader-back"));
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

describe("citation entries: target-group color, hit target", () => {
  test("entries color by the target's group, with no native tooltip", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-3"));
    const g1 = screen.getByTestId("link-GUARD-3-GUARD-1");
    // GUARD-1 is external: sky. The digest arrives in the card at
    // hand now, never in a native title (spec-view-61).
    expect(g1.className).toContain("text-sky-700");
    expect(g1.getAttribute("title")).toBeNull();
    // GUARD-5 is internal: lime.
    expect(
      screen.getByTestId("link-GUARD-3-GUARD-5").className,
    ).toContain("text-lime-700");
    // Hit target grows by padding, density kept by negative margin
    // (DR-010 §7).
    expect(g1.className).toContain("py-1");
    expect(g1.className).toContain("-my-1");
  });

  test("a dead target keeps the neutral link style", () => {
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
    ).toContain("text-lime-700");
  });
});

// The card at hand behind every citation entry (spec-view-61): the
// hover intent and the immediate focus, one card at a time, the
// dismissals, an absent target, and the three anchors.
describe("SPECV-61: the citation preview", () => {
  afterEach(() => vi.useRealTimers());

  const card = () => screen.queryByTestId("citation-preview");

  /** The pointer settles on an entry: hover, then the intent. */
  const settle = (entry: Element) => {
    fireEvent.mouseEnter(entry);
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS));
  };

  function openGuard3() {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-3"));
  }

  test("a settled hover raises the card; leaving first raises nothing", () => {
    openGuard3();
    const entry = screen.getByTestId("link-GUARD-3-GUARD-1");
    // Nothing until the pointer settles: crossing a row of chips
    // flashes no card.
    fireEvent.mouseEnter(entry);
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS - 20));
    expect(card()).toBeNull();
    act(() => vi.advanceTimersByTime(20));
    // The cited item's chip, its first line, and its body's opening.
    expect(card()!.textContent).toContain("GUARD-1");
    expect(card()!.textContent).toContain(
      "The site shall present each surface per the map",
    );
    // The statement heads the card; the body beneath it never
    // repeats it.
    expect(
      card()!.textContent!.match(/The site shall present each surface/g),
    ).toHaveLength(1);
    expect(card()!.getAttribute("role")).toBe("tooltip");
    expect(entry.getAttribute("aria-describedby")).toBe(PREVIEW_CARD_ID);

    // Leaving closes it, and the description goes with it.
    fireEvent.mouseLeave(entry);
    expect(card()).toBeNull();
    expect(entry.getAttribute("aria-describedby")).toBeNull();

    // A pointer that leaves before the intent settles opens nothing.
    fireEvent.mouseEnter(entry);
    fireEvent.mouseLeave(entry);
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS * 2));
    expect(card()).toBeNull();
  });

  test("keyboard focus raises it at once, and blur drops it", () => {
    openGuard3();
    const entry = screen.getByTestId("link-GUARD-3-GUARD-5");
    act(() => (entry as HTMLElement).focus());
    expect(card()!.textContent).toContain("GUARD-5");
    act(() => (entry as HTMLElement).blur());
    expect(card()).toBeNull();
  });

  test("Escape drops the card without clearing anything else", () => {
    openGuard3();
    settle(screen.getByTestId("link-GUARD-3-GUARD-1"));
    expect(card()).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(card()).toBeNull();
    // The item the card was raised over is untouched.
    expect(
      screen.getByTestId("item-toggle-GUARD-3").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  test("one card stands at a time", () => {
    openGuard3();
    settle(screen.getByTestId("link-GUARD-3-GUARD-1"));
    settle(screen.getByTestId("link-GUARD-3-CAT-1"));
    expect(screen.getAllByTestId("citation-preview")).toHaveLength(1);
    expect(card()!.textContent).toContain("The catalog shall list published");
    expect(
      screen.getByTestId("link-GUARD-3-GUARD-1").getAttribute("aria-describedby"),
    ).toBeNull();
  });

  test("an ID the tree does not carry reads as not in the tree", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-10"));
    settle(screen.getByTestId("link-AUTH-10-AUTH-99"));
    expect(card()!.textContent).toContain("AUTH-99 — not in the tree");
  });

  test("a backlink entry raises it, and the jump drops it", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    fireEvent.click(screen.getByTestId("inbound-AUTH-8"));
    const entry = screen.getByTestId("link-AUTH-8-GUARD-5");
    settle(entry);
    expect(card()!.textContent).toContain(
      "Eligibility shall be the deployment's answer",
    );
    // The jump answers the entry: the card has nothing left to say.
    fireEvent.click(entry);
    expect(card()).toBeNull();
  });

  test("an inline citation in a body raises the same card", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-5"));
    const inline = screen.getByRole("link", { name: "CAT-1" });
    fireEvent.mouseOver(inline);
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS));
    expect(card()!.textContent).toContain("The catalog shall list published");
    expect(inline.getAttribute("aria-describedby")).toBe(PREVIEW_CARD_ID);
    fireEvent.mouseOut(inline);
    expect(card()).toBeNull();

    // Keyboard focus answers at once, and a link that opens the
    // records reader instead is no citation to preview.
    act(() => (inline as HTMLElement).focus());
    expect(card()!.textContent).toContain("CAT-1");
    act(() => (inline as HTMLElement).blur());
    const record = screen.getByRole("link", { name: "index" });
    fireEvent.mouseOver(record);
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS));
    expect(card()).toBeNull();
  });
});

describe("SPECV-2/19: cross-file rollups on every file row", () => {
  test("collapsed rows carry the rollup; intra-file and dead citations never count", () => {
    render(<Harness />);
    // All rows are collapsed — the rollups render regardless.
    // auth out: none — AUTH-10 → AUTH-99 names an absent item and both
    // AUTH-1 cites are intra-file. in: CAT-1 → AUTH-2, GUARD-1 →
    // AUTH-1, GUARD-5/GUARD-6 → AUTH-8.
    const auth = screen.getByTestId(`rollup-${AUTH}`);
    expect(auth.textContent).toBe("— · 4");
    expect(auth.getAttribute("aria-label")).toBe("Citations: cited by 4");
    // The dead citation stands apart, never yielding (spec-view-19).
    const unresolved = screen.getByTestId(`unresolved-${AUTH}`);
    expect(unresolved.getAttribute("aria-label")).toBe(
      "1 citation names an item absent from the tree",
    );
    // A neutral mark in a narrow slot: no column, no status hue.
    expect(unresolved.textContent).toBe("!");
    expect(unresolved.getAttribute("title")).toBe("1 citation names an item absent from the tree");
    expect(unresolved.className).not.toMatch(/amber|orange|red|brand/);
    expect(screen.queryByTestId(`unresolved-${CAT}`)).toBeNull();
    expect(screen.getByTestId(`rollup-${CAT}`).textContent).toBe("1 · 2");
    // guard's inbound is all intra-file: outbound side only.
    expect(screen.getByTestId(`rollup-${GUARD}`).textContent).toBe("5 · —");
    // Expansion keeps the rollup on the row.
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    expect(screen.getByTestId(`rollup-${AUTH}`).textContent).toBe("— · 4");
  });
});

// spec-view-65: the outline reads as a table under its filters.
describe("spec-view-65: columns and filters", () => {
  test("one heading row names the columns; a filtered group leaves them, said once", () => {
    render(<Harness />);
    const heads = screen.getByTestId("outline-columns");
    expect(within(heads).getByLabelText("External behavior")).toBeTruthy();
    expect(within(heads).getByLabelText("Internal behavior")).toBeTruthy();
    expect(within(heads).getByLabelText("Tests")).toBeTruthy();
    expect(heads.className).toContain("sticky");
    // The toggles: full names, a definition each, pressed as a
    // filled control with a check (spec-view-4).
    const internal = screen.getByTestId("filter-internal");
    expect(internal.textContent).toContain("Internal behavior");
    expect(internal.getAttribute("title")).toBe(
      "How the package behaves inside, hidden from its users",
    );
    expect(internal.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("hidden-groups")).toBeNull();

    fireEvent.click(internal);
    // The column leaves the rows and the heading row; every package
    // stays (spec-view-2, spec-view-4).
    expect(screen.queryByTestId("column-internal")).toBeNull();
    expect(screen.queryByTestId(`count-${AUTH}-internal`)).toBeNull();
    expect(screen.getByTestId(`count-${AUTH}-external`)).toBeTruthy();
    expect(screen.getByTestId(`file-${GUARD}`)).toBeTruthy();
    const hidden = screen.getByTestId("hidden-groups");
    expect(hidden.textContent).toContain("Hidden: Internal behavior (3)");

    fireEvent.click(screen.getByTestId("filter-test"));
    expect(screen.getByTestId("hidden-groups").textContent).toContain(
      "Internal behavior (3), Tests (2)",
    );
    fireEvent.click(screen.getByTestId("show-all-groups"));
    expect(screen.queryByTestId("hidden-groups")).toBeNull();
    expect(screen.getByTestId("column-internal")).toBeTruthy();
    expect(screen.getByTestId("filter-test").getAttribute("aria-pressed")).toBe("true");
  });
});

// spec-view-60: the summary card behind an item's citation summary.
describe("spec-view-60: the citation summary card", () => {
  afterEach(() => vi.useRealTimers());

  test("hover or focus raises the summary; activation opens the citation block", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    const summary = screen.getByTestId("cite-summary-CAT-1");
    fireEvent.mouseEnter(summary);
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS));
    const card = screen.getByTestId("citation-summary");
    expect(within(card).getByTestId("summary-cites").textContent).toContain(
      "AUTH-2",
    );
    expect(within(card).getByTestId("summary-cited-by").textContent).toContain(
      "GUARD-5",
    );
    expect(within(card).getByTestId("summary-cited-by").textContent).toContain(
      "The suite shall sweep the map.",
    );
    expect(summary.getAttribute("aria-describedby")).toBe(PREVIEW_CARD_ID);
    fireEvent.mouseLeave(summary);
    expect(screen.queryByTestId("citation-summary")).toBeNull();

    // Keyboard focus raises it at once; Escape drops it and keeps
    // focus on the summary.
    act(() => summary.focus());
    expect(screen.getByTestId("citation-summary")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("citation-summary")).toBeNull();
    expect(document.activeElement).toBe(summary);

    // Activation expands the item and lands focus on its citations.
    fireEvent.click(summary);
    expect(
      screen.getByTestId("item-toggle-CAT-1").getAttribute("aria-expanded"),
    ).toBe("true");
    expect(document.activeElement).toBe(screen.getByTestId("citations-CAT-1"));
  });

  test("a long direction lists five and counts the rest", () => {
    vi.useFakeTimers();
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `fan-${i + 1}`,
      group: "external" as const,
      section: "External Behavior",
      firstLine: `Fan ${i + 1} shall cite the hub.`,
      text: `Fan ${i + 1} shall cite the hub ([hub-1](hub.md#hub-1)).`,
      cites: ["hub-1"],
    }));
    const tree: SpecTreeState = {
      ...TREE,
      files: [
        {
          path: "specs/packages/hub.md",
          key: "hub",
          dir: "",
          basename: "hub",
          title: "Hub",
          intent: "The hub.",
          notices: [],
          items: [
            {
              id: "hub-1",
              group: "external",
              section: "External Behavior",
              firstLine: "The hub shall answer.",
              text: "The hub shall answer.",
              cites: [],
            },
          ],
        },
        {
          path: "specs/packages/fan.md",
          key: "fan",
          dir: "",
          basename: "fan",
          title: "Fan",
          intent: "The fans.",
          notices: [],
          items: many,
        },
      ],
    };
    render(<Harness tree={tree} />);
    fireEvent.click(screen.getByTestId("file-toggle-hub"));
    act(() => screen.getByTestId("cite-summary-hub-1").focus());
    const citedBy = screen.getByTestId("summary-cited-by");
    expect(citedBy.querySelectorAll("li")).toHaveLength(5);
    expect(citedBy.textContent).toContain("See all 7");
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
    // Past one step, the control states how many it holds.
    expect(screen.getByTestId("jump-back").textContent).toBe(
      "←back to AUTH-2(2 steps)",
    );
    // Pop lands back on AUTH-2 and uncovers the older origin.
    fireEvent.click(screen.getByTestId("jump-back"));
    expect(document.activeElement).toBe(screen.getByTestId("item-AUTH-2"));
    expect(screen.getByTestId("jump-back").textContent).toBe("←back to CAT-1");
    // Alt+Left walks back as the control does (spec-view-6).
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    expect(document.activeElement).toBe(screen.getByTestId("item-CAT-1"));
    // The stack is empty: the chip leaves.
    expect(screen.queryByTestId("jump-back")).toBeNull();
  });

  test("the record is one excursion: a repeat counts once, a selection clears it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    fireEvent.click(screen.getByTestId("item-toggle-CAT-1"));
    fireEvent.click(screen.getByTestId("link-CAT-1-AUTH-2"));
    fireEvent.click(screen.getByTestId("link-CAT-1-AUTH-2"));
    // The same place twice records once (spec-view-6).
    expect(screen.getByTestId("jump-back").textContent).toBe("←back to CAT-1");
    // Selecting a package ends the excursion (spec-view-6).
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    expect(screen.queryByTestId("jump-back")).toBeNull();
  });

  test("a jump from a package's intent returns to that package", () => {
    const tree: SpecTreeState = {
      ...TREE,
      files: TREE.files.map((file) =>
        file.basename === "courses"
          ? { ...file, intent: "What the catalog lists; see [AUTH-2](../identity/auth.md#auth-2)." }
          : file,
      ),
    };
    render(<Harness tree={tree} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    const link = within(screen.getByTestId(`file-${CAT}`)).getByRole("link", { name: "AUTH-2" });
    fireEvent.click(link);
    expect(screen.getByTestId("jump-back").textContent).toBe("←back to courses's intent");
    // The pointer's back button walks back too (spec-view-6).
    fireEvent.mouseUp(window, { button: 3 });
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

  test("a body-link record open returns focus to the citing item row", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# DR\n\nDecided.");
    render(<Harness onReadRecord={onReadRecord} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    fireEvent.click(screen.getByRole("link", { name: "DR-011" }));
    await screen.findByText("Decided.");
    fireEvent.click(screen.getByTestId("reader-back"));
    expect(document.activeElement).toBe(screen.getByTestId("item-AUTH-8"));
  });

});

describe("DR-010 §7: accessible names and affordances", () => {
  test("section and topic labels are exposed; toggles carry names", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "decision records 1" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Toggle identity/" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "auth" })).toBeTruthy();
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    // Section/topic labels are no longer aria-hidden.
    expect(screen.getByTestId("section-AUTH-2").getAttribute("aria-hidden")).toBeNull();
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
  test("spec-view-64: expanded items hide source comments and retain code examples", () => {
    const tree = structuredClone(TREE);
    tree.files[0]!.items[0]!.text = COMMENT_SPEC;
    render(<Harness tree={tree} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-2"));
    expect(screen.getByText("Readable specification")).toBeTruthy();
    expect(document.body.textContent).not.toContain("hidden-source-pin");
    expect(document.body.textContent).not.toContain("hidden-inline-comment");
    expect(document.body.textContent).not.toContain("hidden-multiline-comment");
    expect(document.body.textContent).not.toContain("hidden-leading-comment");
    expect(document.body.textContent).not.toContain("hidden-wrapped-comment");
    expect(document.body.textContent).toContain("Visible trailing text.");
    expect(document.body.textContent).toContain("Visible wrapped text");
    expect(document.body.textContent).toContain("<!-- visible-inline-example -->");
    expect(document.body.textContent).toContain("<!-- visible-block-example -->");
    expect(document.querySelector("[data-raw-comment-test]")).toBeNull();
  });

  test("the footer offers meta and map directly", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# meta\n\nGlossary.");
    render(<Harness onReadRecord={onReadRecord} />);
    // The outline pane's footer carries the decision records and the
    // two tree-wide documents, each named by its file and use
    // (spec-view-7).
    expect(screen.getByTestId("records-footer").textContent).toBe(
      "Referencedecision records 1·map.md index·meta.md spec format",
    );
    const meta = screen.getByTestId("records-meta");
    fireEvent.click(meta);
    expect(onReadRecord).toHaveBeenCalledWith("meta.md");
    await screen.findByText("Glossary.");
    expect(
      within(screen.getByTestId("record-reader")).getByText("meta.md"),
    ).toBeTruthy();
    // Back lands on the meta control (DR-010 §6).
    fireEvent.click(screen.getByTestId("reader-back"));
    expect(document.activeElement).toBe(screen.getByTestId("records-meta"));
    // A search that narrows the outline to nothing leaves the footer
    // standing (spec-view-7).
    fireEvent.change(screen.getByLabelText("Filter items by ID or text"), {
      target: { value: "no item reads like this" },
    });
    expect(screen.getByTestId("records-map")).toBeTruthy();
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
  test("the footer's decision records open their list, a record its reader", async () => {
    const onReadRecord = vi.fn().mockImplementation(async (path: string) =>
      path === "map.md"
        ? "| [DR-011](decisions/011-project-workspace.md) | 011-project-workspace.md | The workspace in one line |"
        : "# Record body\n\nHello from the record.",
    );
    render(<Harness onReadRecord={onReadRecord} />);
    // No record stands in the outline, and intents are nowhere in the
    // view — they belong to the Dashboard (spec-view-7).
    expect(screen.queryByTestId("record-DR-011")).toBeNull();
    expect(screen.queryByText("IR-016")).toBeNull();
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("records-decisions"));
    const list = screen.getByTestId("records-list");
    expect(document.activeElement).toBe(screen.getByTestId("records-back"));
    // Each row is the one record row (dashboard-40), its summary from
    // map.md beneath (spec-view-7).
    const row = within(list).getByTestId("record-DR-011");
    expect(row.getAttribute("aria-label")).toBe("Open DR-011: Project workspace");
    expect(row.getAttribute("title")).toBe("Open DR-011");
    expect(row.className).toContain("cursor-pointer");
    expect(within(row).getByText("DR-011").className).toContain("font-mono");
    expect((await screen.findByTestId("record-summary-DR-011")).textContent).toBe(
      "The workspace in one line",
    );
    // The filter narrows by ID and title.
    fireEvent.change(screen.getByTestId("records-filter"), { target: { value: "011" } });
    expect(within(list).getByTestId("record-DR-011")).toBeTruthy();
    fireEvent.click(row);
    expect(onReadRecord).toHaveBeenCalledWith("decisions/011-project-workspace.md");
    expect(liveText()).toBe("Opened DR-011");
    await screen.findByText("Hello from the record.");
    // The reader's Back returns to the list, its filter standing.
    const back = screen.getByTestId("reader-back");
    expect(back.textContent).toBe("← Back to decision records");
    fireEvent.click(back);
    expect((screen.getByTestId("records-filter") as HTMLInputElement).value).toBe("011");
    expect(document.activeElement).toBe(screen.getByTestId("record-DR-011"));
    // The list's Back returns to the specs as they were: the package
    // stood expanded beneath it all along.
    fireEvent.click(screen.getByTestId("records-back"));
    expect(screen.queryByTestId("records-list")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("records-decisions"));
    expect(screen.getByTestId(`file-toggle-${AUTH}`).getAttribute("aria-expanded")).toBe("true");
  });

  test("a file-less tree still reaches its decision records, newest first", () => {
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
    // The outline pane's footer stands here too (spec-view-7).
    expect(screen.getByTestId("records-meta")).toBeTruthy();
    expect(screen.getByTestId("records-map")).toBeTruthy();
    fireEvent.click(screen.getByTestId("records-decisions"));
    const rows = within(screen.getByTestId("records-list")).getAllByTestId(/^record-DR-/);
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "record-DR-011",
      "record-DR-001",
    ]);
    // The list's own filter narrows by ID and title (spec-view-7).
    fireEvent.change(screen.getByTestId("records-filter"), { target: { value: "scaffold" } });
    expect(screen.queryByTestId("record-DR-011")).toBeNull();
    expect(screen.getByTestId("record-DR-001")).toBeTruthy();
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
    fireEvent.click(screen.getByTestId("records-decisions"));
    fireEvent.click(screen.getByTestId("record-DR-011"));
    await screen.findByText("Picked here.");
    const back = screen.getByTestId("reader-back");
    expect(back.textContent).toBe("← Back to decision records");
    // The reader takes focus on Back, and closing hands it back to the
    // invoking row (DR-010 §6).
    expect(document.activeElement).toBe(back);
    fireEvent.click(back);
    expect(onReturn).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByTestId("record-DR-011"));
  });

  test("spec-view-45: a package's intent links the record it cites; the collapsed line reads its text", async () => {
    const onReadRecord = vi.fn().mockResolvedValue("# DR\n\nDecided there.");
    const tree = structuredClone(TREE);
    tree.files[0]!.intent =
      "How users sign in, as [DR-011](../../decisions/011-project-workspace.md) decides.";
    render(<Harness tree={tree} onReadRecord={onReadRecord} />);
    // Collapsed, the one line reads the link by its text alone
    // (spec-view-2).
    const auth = screen.getByTestId(`file-${AUTH}`);
    const line = within(auth).getByText("How users sign in, as DR-011 decides.");
    expect(line.getAttribute("title")).toBe("How users sign in, as DR-011 decides.");
    expect(auth.textContent).not.toContain("decisions/011");
    // Expanded, the intent renders as an item body does: the record's
    // ID is a link, and nothing of its path is printed (spec-view-2).
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    const intent = screen.getByTestId(`intent-${AUTH}`);
    expect(intent.textContent).toBe("How users sign in, as DR-011 decides.");
    const link = within(intent).getByRole("link", { name: "DR-011" });
    // The link opens the record in the reader (spec-view-6), and Back
    // hands focus to the package's row (DR-010 §6).
    fireEvent.click(link);
    expect(onReadRecord).toHaveBeenCalledWith(
      "decisions/011-project-workspace.md",
    );
    await screen.findByText("Decided there.");
    fireEvent.click(screen.getByTestId("reader-back"));
    expect(document.activeElement).toBe(
      screen.getByTestId(`file-toggle-${AUTH}`),
    );
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

  test("a requested re-read turns its icon, then says the tree was read again", () => {
    vi.useFakeTimers();
    try {
      const onRefresh = vi.fn();
      const { rerender } = render(<Harness onRefresh={onRefresh} />);
      fireEvent.click(screen.getByRole("button", { name: "Refresh specs" }));
      const icon = () => screen.getByTestId("specs-refresh").querySelector("svg")!;
      // However fast the read lands, the icon turns at least 0.6s
      // (spec-view-8).
      rerender(<Harness onRefresh={onRefresh} tree={{ ...TREE, readAt: TREE.readAt + 1 }} />);
      expect(icon().getAttribute("class")).toContain("animate-spin");
      act(() => vi.advanceTimersByTime(300));
      expect(icon().getAttribute("class")).toContain("animate-spin");
      act(() => vi.advanceTimersByTime(300));
      expect(icon().getAttribute("class")).not.toContain("animate-spin");
      expect(screen.getByTestId("specs-read-age").textContent).toBe("read again");
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByTestId("specs-read-age").textContent).toBe("read just now");
    } finally {
      vi.useRealTimers();
    }
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
    expect(empty.textContent).toContain("npx @sublang/spex scaffold");
    expect(
      within(empty).getByRole("button", {
        name: "Copy command npx @sublang/spex scaffold",
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
    const heading = within(legacy).getByText("This project uses a legacy specs layout");
    // Which directories mark the layout rides the heading's title, the
    // notice itself one phrase (DR-069).
    expect(heading.getAttribute("title")).toContain("user/, dev/, test/ or items/ groups");
    expect(heading.getAttribute("title")).toContain("compositions/");
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

  // Differing item counts, a heavy and a light pair (billing → auth
  // twice, session → auth once), a reciprocally citing pair
  // (billing <-> session), a citation of an absent ID (billing-2 →
  // auth-99), and a package no citation reaches (glossary) — the
  // shapes spec-view-38 and spec-view-40 name. The backbone holds each
  // package's heaviest pair, so auth–session is the light pair a
  // threshold of two leaves out.
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
        item("billing-2", "external", ["auth-1", "auth-99"]),
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
  const sized = (box = { width: 800, height: 600 }) => {
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
        x: 0, y: 0, left: 0, top: 0, right: box.width, bottom: box.height,
        width: box.width, height: box.height, toJSON: () => ({}),
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
  const pair = (a: string, b: string) =>
    screen.getByTestId(`graph-pair-${a}--${b}`);
  /** The graph pane's share of the split, as the style carries it. */
  const graphPaneShare = () => {
    const pane = screen.getByTestId("spec-graph").parentElement as HTMLElement;
    return parseFloat(pane.style.getPropertyValue("--graph-share"));
  };

  test("a line's card says who cites whom how many times", () => {
    vi.useFakeTimers();
    const restore = sized();
    try {
      showGraph();
      const hoverLine = (line: Element) => {
        // The wide invisible companion beside the line takes the hover.
        fireEvent.mouseEnter(line.nextElementSibling as Element);
        act(() => vi.advanceTimersByTime(200));
        return screen.getByTestId("graph-card").textContent;
      };

      // A backbone line names each direction that carries citations
      // as a sentence, no arrows (spec-view-26).
      const backbone = document.querySelector('[data-testid^="graph-pair-"]')!;
      const [a, b] = backbone.getAttribute("data-testid")!.replace("graph-pair-", "").split("--");
      const text = hoverLine(backbone)!;
      expect(text).not.toMatch(/[→↔]/);
      expect(text).toMatch(new RegExp(`${a} cites ${b} \\d+ times?|${b} cites ${a} \\d+ times?`));
      fireEvent.mouseLeave(backbone.nextElementSibling as Element);

      // A directed line under the selection reads the same way.
      fireEvent.click(node("billing"));
      const own = edge("billing", "auth");
      const weight = Number(own.getAttribute("data-weight"));
      expect(hoverLine(own)).toBe(
        `billing cites auth ${weight} ${weight === 1 ? "time" : "times"}`,
      );
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  test("a package row is one target; the selected row folds; the graph toggle names its act", () => {
    const restore = sized();
    try {
      render(<Harness tree={GRAPH_TREE} />);
      const toggle = screen.getByTestId("file-toggle-auth");
      // A click on the row's counts acts as its button does
      // (spec-view-42).
      fireEvent.click(screen.getByTestId("file-row-auth").lastElementChild!);
      expect(toggle.getAttribute("aria-current")).toBe("true");
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByTestId("file-row-auth").className).toContain("cursor-pointer");
      expect(screen.getByTestId("file-row-auth").className).not.toMatch(/(^|\s)(bg|ring)-brand/);
      // Activating the selected, expanded row folds it, the selection
      // standing (spec-view-42).
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.getAttribute("aria-current")).toBe("true");
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-expanded")).toBe("true");

      // The graph's toggle ends the graph's own line, beside the divider
      // it folds toward, while it shows, heads the filter row while it
      // is hidden, and says what it does (spec-view-20).
      const graph = screen.getByTestId("view-graph");
      expect(graph.getAttribute("aria-label")).toBe("Hide the citation graph");
      expect(graph.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId("graph-toolbar").lastElementChild!.contains(graph)).toBe(true);
      fireEvent.click(graph);
      const shown = screen.getByTestId("view-graph");
      expect(shown.getAttribute("aria-label")).toBe("Show the citation graph");
      expect(shown.parentElement).toBe(screen.getByTestId("filter-external").parentElement);
      expect(shown.parentElement!.firstElementChild).toBe(shown);

      // Each filter leads with a checkbox, filled when pressed and
      // empty when not (spec-view-4).
      const box = () => screen.getByTestId("filter-box-internal");
      expect(box().className).toContain("bg-lime-600");
      expect(box().querySelector("svg")).toBeTruthy();
      fireEvent.click(screen.getByTestId("filter-internal"));
      expect(box().className).not.toContain("bg-lime-600");
      expect(box().querySelector("svg")).toBeNull();
    } finally {
      restore();
    }
  });

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
    // (spec-view-20), drawn once a package is selected (spec-view-23).
    for (const name of ["auth", "billing", "session", "glossary"]) {
      expect(node(name)).toBeTruthy();
    }
    fireEvent.click(node("auth"));
    expect(edge("billing", "auth")).toBeTruthy();
    expect(edge("session", "auth")).toBeTruthy();
    expect(screen.queryByTestId("graph-edge-auth--billing")).toBeNull();
    fireEvent.click(screen.getByLabelText("Spec package citation graph"));

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
  test("node area counts items; the backbone rests undirected; the selection draws its own", () => {
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
      expect(cls).not.toMatch(/brand|sky|lime|teal|emerald|amber|red/);
    }

    // At rest only the backbone draws: one undirected line per pair,
    // of uniform width, with no glyph, and no directed edge draws. Three
    // pairs among three linked packages fit the budget at the first
    // stop, so the default draws them all (spec-view-23, spec-view-66).
    const field = () => screen.getByTestId("graph-threshold") as HTMLInputElement;
    const sentence = () =>
      screen.getByTestId("graph-threshold-sentence").getAttribute("aria-label");
    const drawn = () =>
      document.querySelectorAll('[data-testid^="graph-pair-"]').length;
    expect(field().value).toBe("1");
    // Stop 3 draws what stop 2 draws, so the field's last stop is 2.
    expect(field().getAttribute("aria-valuemax")).toBe("2");
    expect(sentence()).toBe("Only pairs with ≥ 1 citation (all pairs)");
    expect(field().getAttribute("aria-valuetext")).toBe(sentence());
    expect(
      (screen.getByTestId("graph-threshold-down") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(drawn()).toBe(3);
    const heavy = pair("auth", "billing");
    const reciprocal = pair("billing", "session");
    expect(heavy.getAttribute("data-weight")).toBe("2");
    expect(reciprocal.getAttribute("data-weight")).toBe("2");
    for (const line of [heavy, reciprocal]) {
      expect(line.getAttribute("stroke-width")).toBe("2");
      expect(line.getAttribute("marker-end")).toBeNull();
    }
    expect(document.querySelector('[data-testid^="graph-edge-"]')).toBeNull();

    // Raised to two, the light pair leaves while each package keeps its
    // heaviest; no node moves; the last stop draws the heaviest pairs
    // alone (spec-view-23, spec-view-66).
    const at = (name: string) => [circleOf(name).getAttribute("cx"), circleOf(name).getAttribute("cy")];
    const before = ["auth", "billing", "session"].map(at);
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    expect(field().value).toBe("2");
    expect(screen.queryByTestId("graph-pair-auth--session")).toBeNull();
    expect(sentence()).toBe(
      "Only pairs with ≥ 2 citations (each package's strongest only)",
    );
    expect(
      (screen.getByTestId("graph-threshold-up") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(drawn()).toBe(2);
    expect(["auth", "billing", "session"].map(at)).toEqual(before);
    // A typed number takes the stop drawing the same lines; the arrows
    // step back down (spec-view-66).
    fireEvent.change(field(), { target: { value: "1" } });
    fireEvent.blur(field());
    expect(field().value).toBe("1");
    expect(drawn()).toBe(3);
    fireEvent.change(field(), { target: { value: "9" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("2");
    fireEvent.click(screen.getByTestId("graph-threshold-down"));
    expect(field().value).toBe("1");
    fireEvent.keyDown(field(), { key: "End" });
    expect(field().value).toBe("2");
    expect(drawn()).toBe(2);
    // Every node without a line has no cross-file citation.
    const lined = new Set(
      [...document.querySelectorAll('[data-testid^="graph-pair-"]')].flatMap((line) =>
        line.getAttribute("data-testid")!.replace("graph-pair-", "").split("--"),
      ),
    );
    for (const name of ["auth", "billing", "session", "glossary"]) {
      expect(lined.has(name)).toBe(node(name).getAttribute("data-foot") !== "true");
    }

    // Selected, billing's pairs draw directed in two hues, all one
    // width, each ending in the same constant-size glyph; the pair it
    // does not touch draws nothing (spec-view-23, spec-view-25).
    fireEvent.click(node("billing"));
    // A selection sets the threshold aside for its own pairs; the
    // value returns once it clears (spec-view-66).
    expect(screen.queryByTestId("graph-threshold")).toBeNull();
    expect(screen.getByTestId("graph-threshold-selection").textContent).toBe(
      "2 packages sharing citations with billing",
    );
    const own = edge("billing", "auth");
    const citer = edge("session", "billing");
    expect(own.getAttribute("data-direction")).toBe("cites");
    // Orange for its own citations, ink for its citers, and the
    // selection's halo in ink — no interaction purple on the marks
    // (spec-view-23, spec-view-42).
    expect(own.getAttribute("class")).toContain("stroke-orange-700");
    expect(screen.getByTestId("graph-halo-billing").getAttribute("class")).toContain(
      "stroke-neutral-700",
    );
    expect(citer.getAttribute("data-direction")).toBe("cited");
    expect(citer.getAttribute("class")).toContain("stroke-neutral-700");
    for (const line of [own, citer, edge("billing", "session")]) {
      expect(line.getAttribute("stroke-width")).toBe("2");
      expect(line.getAttribute("marker-end")).toBeTruthy();
    }
    expect(screen.queryByTestId("graph-edge-session--auth")).toBeNull();
    expect(screen.queryByTestId("graph-pair-auth--billing")).toBeNull();
    // Every edge meets the selection outside its halo, so the halo
    // covers no glyph (spec-view-23).
    const halo = screen.getByTestId("graph-halo-billing");
    const reach =
      Number(halo.getAttribute("r")) + Number(halo.getAttribute("stroke-width")) / 2;
    const [hx, hy] = [Number(halo.getAttribute("cx")), Number(halo.getAttribute("cy"))];
    for (const [line, end] of [
      [own, "1"],
      [citer, "2"],
      [edge("billing", "session"), "1"],
    ] as const) {
      const ex = Number(line.getAttribute(`x${end}`));
      const ey = Number(line.getAttribute(`y${end}`));
      expect(Math.hypot(ex - hx, ey - hy)).toBeGreaterThan(reach);
    }
    for (const id of ["#spec-graph-arrow-cites", "#spec-graph-arrow-cited"]) {
      const marker = document.querySelector(id);
      expect(marker?.getAttribute("markerUnits")).toBe("userSpaceOnUse");
      expect(marker?.getAttribute("markerWidth")).toBe("10");
    }

    // The reciprocal pair draws as two offset edges, never one edge
    // with two heads (spec-view-23).
    const midpoint = (line: Element) => [
      (Number(line.getAttribute("x1")) + Number(line.getAttribute("x2"))) / 2,
      (Number(line.getAttribute("y1")) + Number(line.getAttribute("y2"))) / 2,
    ];
    const [ax, ay] = midpoint(edge("billing", "session"));
    const [bx, by] = midpoint(citer);
    expect(Math.hypot(ax - bx, ay - by)).toBeGreaterThan(5);

    // Counts ride the neighbors' names, agreeing with the outline's
    // rollups, the absent ID counted in neither (spec-view-25,
    // spec-view-19).
    expect(screen.getByTestId("graph-label-auth").textContent).toBe("auth →2");
    expect(screen.getByTestId("graph-label-session").textContent).toBe(
      "session →1 ←1",
    );
    expect(screen.getByTestId("rollup-billing").textContent).toBe("3 · 1");
    expect(screen.getByTestId("unresolved-billing")).toBeTruthy();

    // The sentence above the graph keys the two hues with samples of
    // the edges themselves, while the pinned card states its counts in
    // ink; the key below names the roles alone, holds no control, and
    // reads the same either way (spec-view-24, spec-view-26,
    // spec-view-66).
    const sample = (id: string) =>
      screen.getByTestId(id).querySelector("line")!.getAttribute("class") ?? "";
    expect(sample("graph-key-cites")).toContain("stroke-orange-700");
    expect(sample("graph-key-cited")).toContain("stroke-neutral-700");
    expect(screen.getByTestId("graph-key-cites").textContent).toBe("cites");
    expect(screen.getByTestId("graph-key-cited").textContent).toBe("cited by");
    const pinned = screen.getByTestId("graph-selection-card");
    const totals = within(pinned).getByTestId("graph-card-totals");
    expect(totals.textContent).toBe("3 items · cites 3 · cited by 1");
    expect(totals.className).not.toMatch(/brand/);
    expect(totals.querySelector("span")).toBeNull();
    const legend = screen.getByTestId("graph-legend");
    const selectedKey = legend.textContent;
    expect(legend.textContent).toBe("cited by other packagesnot cited by other packages");
    expect(legend.querySelector("button, input, a")).toBeNull();
    fireEvent.click(screen.getByLabelText("Spec package citation graph"));
    expect(legend.textContent).toBe(selectedKey);
    expect(field().value).toBe("2");
    // Above the picture stands the threshold sentence alone; the fit
    // rests in the canvas's corner while the camera shows the fitted
    // frame (spec-view-66, spec-view-27).
    const toolbar = screen.getByTestId("graph-toolbar");
    expect(toolbar.querySelectorAll("input")).toHaveLength(1);
    expect(within(toolbar).queryByTestId("graph-fit")).toBeNull();
    const fit = screen.getByRole("button", { name: "Fit to window" });
    expect(within(screen.getByTestId("graph-frame")).getByTestId("graph-fit")).toBe(fit);
    expect((fit as HTMLButtonElement).disabled).toBe(true);
    restore();
  });

  // spec-view-38: the citation list names every neighbor, whatever room
  // the names found.
  test("the citation list opens to every neighbor, most first; focus lifts one and activation selects it", () => {
    const restore = sized({ width: 330, height: 300 });
    const spokes = Array.from({ length: 14 }, (_, i) =>
      file(`spoke-${String(i + 1).padStart(2, "0")}`, [
        item(`spoke-${String(i + 1).padStart(2, "0")}-1`, "external", ["hub-1"]),
      ]),
    );
    // The heavier spokes cite the hub from a second item too.
    for (const spoke of spokes.slice(0, 3)) {
      spoke.items.push(item(`${spoke.basename}-2`, "external", ["hub-1"]));
    }
    const tree: SpecTreeState = {
      ...GRAPH_TREE,
      files: [file("hub", [item("hub-1", "external")]), ...spokes],
    };
    render(<Harness tree={tree} />);
    fireEvent.click(node("hub"));
    // The pinned card reads like any card, and its list starts closed
    // behind a control naming the neighbor count (spec-view-25,
    // spec-view-26).
    const card = screen.getByTestId("graph-selection-card");
    expect(within(card).getByTestId("graph-card-totals").textContent).toBe(
      "1 item · cites 0 · cited by 17",
    );
    expect(screen.queryByTestId("graph-citations")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Expand hub's citation list" });
    expect(toggle.textContent).toBe("Citation list (14 packages)");
    // The list's heads name the two directions and its counts read in
    // ink, a zero as a dash (spec-view-25).
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    const list = screen.getByRole("list", { name: "hub's citation list" });
    const entries = within(list).getAllByRole("listitem");
    expect(entries).toHaveLength(14);
    // Most first: the three spokes citing twice lead.
    expect(entries[0].textContent).toBe("spoke-01—2");
    expect(entries[13].textContent).toMatch(/—1$/);
    const heads = list.previousElementSibling as HTMLElement;
    expect(heads.textContent).toBe("citescited by");
    expect(heads.innerHTML).not.toMatch(/brand/);
    // Focus lifts the entry's node.
    const entry = within(entries[5]).getByRole("button");
    act(() => entry.focus());
    const name = entries[5].getAttribute("data-testid")!.replace("graph-citation-", "");
    const ring = screen.getByTestId(`graph-halo-${name}`);
    // Its edge stops outside the ring it now wears (spec-view-23).
    const spokeEdge = screen.getByTestId(`graph-edge-${name}--hub`);
    expect(
      Math.hypot(
        Number(spokeEdge.getAttribute("x1")) - Number(ring.getAttribute("cx")),
        Number(spokeEdge.getAttribute("y1")) - Number(ring.getAttribute("cy")),
      ),
    ).toBeGreaterThan(
      Number(ring.getAttribute("r")) + Number(ring.getAttribute("stroke-width")) / 2,
    );
    act(() => entry.blur());

    // Each entry names both counts against the selection, so a hidden
    // label hides no count (spec-view-25).
    expect(entry.getAttribute("aria-label")).toBe(`${name}: cites hub 1, cited by hub 0`);

    // A name without a place shows once its node takes keyboard focus
    // (spec-view-22).
    const unnamed = spokes
      .map((spoke) => spoke.basename)
      .find((spoke) => !screen.queryByTestId(`graph-label-${spoke}`));
    expect(unnamed).toBeTruthy();
    act(() => (node(unnamed!) as unknown as HTMLElement).focus());
    expect(screen.getByTestId(`graph-label-${unnamed}`)).toBeTruthy();
    act(() => (node(unnamed!) as unknown as HTMLElement).blur());

    // Activating an entry selects that package, and the list stays
    // open for it (spec-view-25).
    fireEvent.click(within(entries[0]).getByRole("button"));
    expect(screen.getByTestId("graph-halo-spoke-01")).toBeTruthy();
    expect(screen.queryByTestId("graph-halo-hub")).toBeNull();
    expect(
      within(screen.getByRole("list", { name: "spoke-01's citation list" })).getAllByRole("listitem"),
    ).toHaveLength(1);

    // Closed, the list stays closed for the next selection until opened
    // (spec-view-25).
    const close = screen.getByRole("button", { name: "Collapse spoke-01's citation list" });
    expect(close.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(close);
    expect(screen.queryByTestId("graph-citations")).toBeNull();
    expect(within(screen.getByTestId("graph-selection-card")).getByText("spoke-01")).toBeTruthy();
    fireEvent.click(node("hub"));
    expect(screen.queryByTestId("graph-citations")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand hub's citation list" }));
    expect(within(screen.getByTestId("graph-citations")).getAllByRole("listitem")).toHaveLength(14);
    restore();
  });

  // spec-view-41: one card per package, and Escape's ladder for the
  // pointer and the keyboard.
  test("the selected node floats no second card, and Escape closes a card before the selection", () => {
    const restore = sized();
    vi.useFakeTimers();
    showGraph();
    const hover = (name: string) => {
      fireEvent.mouseEnter(node(name));
      act(() => vi.advanceTimersByTime(200));
    };

    // Selected, the package's card is pinned alone; hovering or
    // focusing its node raises no second one (spec-view-26).
    fireEvent.click(node("auth"));
    fireEvent.mouseLeave(node("auth"));
    expect(screen.getByTestId("graph-selection-card")).toBeTruthy();
    expect(screen.queryByTestId("graph-card")).toBeNull();
    hover("auth");
    expect(screen.queryByTestId("graph-card")).toBeNull();
    fireEvent.mouseLeave(node("auth"));
    act(() => (node("auth") as unknown as HTMLElement).focus());
    expect(screen.queryByTestId("graph-card")).toBeNull();
    act(() => (node("auth") as unknown as HTMLElement).blur());

    // The pointer: the hovered card first, then the selection
    // (spec-view-25).
    const surface = screen.getByLabelText("Spec package citation graph");
    hover("billing");
    expect(within(screen.getByTestId("graph-card")).getByText("billing")).toBeTruthy();
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(screen.queryByTestId("graph-card")).toBeNull();
    expect(screen.getByTestId("graph-halo-auth")).toBeTruthy();
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(screen.queryByTestId("graph-halo-auth")).toBeNull();
    fireEvent.mouseLeave(node("billing"));

    // The keyboard: the focused node's card closes with focus kept,
    // then the selection clears, and that card stays closed until
    // focus moves on (spec-view-25).
    fireEvent.click(node("auth"));
    const billing = node("billing") as unknown as HTMLElement;
    act(() => billing.focus());
    expect(within(screen.getByTestId("graph-card")).getByText("billing")).toBeTruthy();
    fireEvent.keyDown(billing, { key: "Escape" });
    expect(screen.queryByTestId("graph-card")).toBeNull();
    expect(document.activeElement).toBe(billing);
    expect(screen.getByTestId("graph-halo-auth")).toBeTruthy();
    fireEvent.keyDown(billing, { key: "Escape" });
    expect(screen.queryByTestId("graph-halo-auth")).toBeNull();
    expect(document.activeElement).toBe(billing);
    expect(screen.queryByTestId("graph-card")).toBeNull();
    const session = node("session") as unknown as HTMLElement;
    act(() => {
      billing.blur();
      session.focus();
    });
    expect(within(screen.getByTestId("graph-card")).getByText("session")).toBeTruthy();
    vi.useRealTimers();
    restore();
  });

  // spec-view-26: a floating card yields the pinned card first and its
  // own node last.
  test("a floating card covers the least by the order of yielding", () => {
    const view = { x0: 0, y0: 0, x1: 400, y1: 400 };
    const card = { width: 200, height: 100 };
    const covers = (at: { left: number; top: number }, box: { x0: number; y0: number; x1: number; y1: number }) =>
      at.left < box.x1 && box.x0 < at.left + card.width && at.top < box.y1 && box.y0 < at.top + card.height;
    const node = { x0: 180, y0: 180, x1: 220, y1: 220 };
    const label = { x0: 170, y0: 225, x1: 230, y1: 241 };

    // Room for it: it covers nothing — here above, the label lying
    // below.
    const free = floatingCardPlacement(card, view, { pinned: null, selection: [], label, node }, 8);
    expect(covers(free, node) || covers(free, label)).toBe(false);

    // Every place costs the pinned card or more: it covers that alone.
    const wide = { x0: 0, y0: 0, x1: 400, y1: 172 };
    const pinnedOnly = floatingCardPlacement(
      card,
      view,
      { pinned: wide, selection: [{ x0: 0, y0: 249, x1: 400, y1: 400 }], label, node },
      8,
    );
    expect(covers(pinnedOnly, wide)).toBe(true);
    expect(covers(pinnedOnly, node) || covers(pinnedOnly, label)).toBe(false);

    // Every place costs the selection or more: it covers the selection
    // and keeps clear of the node and its label.
    const above = { x0: 0, y0: 0, x1: 400, y1: 172 };
    const below = { x0: 0, y0: 249, x1: 400, y1: 400 };
    const selectionToo = floatingCardPlacement(
      card,
      view,
      { pinned: null, selection: [above, below], label, node },
      8,
    );
    expect(covers(selectionToo, above) || covers(selectionToo, below)).toBe(true);
    expect(covers(selectionToo, node) || covers(selectionToo, label)).toBe(false);

    // Every place costs its own label or more: it covers the label and
    // never the node, and no place costing less was passed over.
    const tall = { x0: 150, y0: 110, x1: 250, y1: 290 };
    const tight = { x0: 0, y0: 0, x1: 400, y1: 300 };
    const labelled = { x0: 120, y0: 60, x1: 280, y1: 100 };
    const yielded = floatingCardPlacement(
      card,
      tight,
      { pinned: null, selection: [], label: labelled, node: tall },
      8,
    );
    expect(covers(yielded, tall)).toBe(false);
    expect(covers(yielded, labelled)).toBe(true);
    expect(yielded.top).toBeGreaterThanOrEqual(8);
    expect(yielded.top + card.height).toBeLessThanOrEqual(300 - 8);
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
      "neutral-500": { light: "#696969", dark: "#949494" },
      "neutral-600": { light: "#525252", dark: "#525252" },
      "neutral-700": { light: "#404040", dark: "#404040" },
      "neutral-800": { light: "#262626", dark: "#262626" },
      "neutral-900": { light: "#171717", dark: "#171717" },
      white: { light: "#ffffff", dark: "#ffffff" },
      "brand-300": { light: "#d4a4f4", dark: "#d4a4f4" },
      "neutral-950": { light: "#0a0a0a", dark: "#0a0a0a" },
      "brand-400": { light: "#bb6ee9", dark: "#bb6ee9" },
      "brand-600": { light: "#890fbc", dark: "#890fbc" },
      "orange-400": { light: "#fb923c", dark: "#fb923c" },
      "orange-700": { light: "#c2410c", dark: "#c2410c" },
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
      property: "fill" | "stroke" | "text" | "bg",
      theme: "light" | "dark",
    ): string => {
      const pattern = new RegExp(
        `(^|\\s)${theme === "dark" ? "dark:" : ""}${property}-((neutral|brand|orange)-(\\d+)|white)(?=\\s|$)`,
        "g",
      );
      const matches = [...classes.matchAll(pattern)];
      const last = matches[matches.length - 1];
      if (!last && theme === "dark") return paint(classes, property, "light");
      if (!last) throw new Error(`no ${property} token in "${classes}"`);
      const token = TOKENS[last[2]!];
      if (!token) throw new Error(`unknown token ${last[2]}`);
      return token[theme];
    };

    const citedCircle = circleOf("auth").getAttribute("class") ?? "";
    const uncitedCircle = circleOf("glossary").getAttribute("class") ?? "";
    const edgeLine = pair("auth", "billing").getAttribute("class") ?? "";
    const label =
      screen.getByTestId("graph-label-auth").getAttribute("class") ?? "";
    const numeral =
      node("auth").querySelectorAll("text")[0].getAttribute("class") ?? "";
    const legend =
      screen.getByText("cited by other packages").parentElement?.getAttribute("class") ??
      "";

    // The selection's line samples clear the 3:1 non-text floor on the
    // surface (spec-view-66).
    fireEvent.click(node("auth"));
    const samples = ["graph-key-cites", "graph-key-cited"].map(
      (id) => screen.getByTestId(id).querySelector("line")!.getAttribute("class") ?? "",
    );
    fireEvent.click(screen.getByLabelText("Spec package citation graph"));

    for (const theme of ["light", "dark"] as const) {
      for (const stroke of samples) {
        expect(ratio(paint(stroke, "stroke", theme), SURFACE[theme])).toBeGreaterThanOrEqual(3);
      }
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
    // A package no citation reaches stands in the foot row, with no
    // caption, below every arranged node, and its card says why
    // (spec-view-28, spec-view-26).
    const glossary = settled[3];
    expect(node("glossary").getAttribute("data-foot")).toBe("true");
    expect(screen.queryByText("Packages without citations")).toBeNull();
    expect(document.querySelector("svg line[stroke-width='1']")).toBeNull();
    for (const [, y] of settled.slice(0, 3)) {
      expect(glossary[1]).toBeGreaterThan(y);
    }
    act(() => (node("glossary") as unknown as HTMLElement).focus());
    expect(
      within(screen.getByTestId("graph-card")).getByTestId("graph-card-totals").textContent,
    ).toBe("1 item · No citations with other packages");
    act(() => (node("glossary") as unknown as HTMLElement).blur());

    // Every node keeps its activation-target floor (spec-view-28), and
    // every shown name keeps 5px from other circles, clears the other
    // names, and keeps 10px inside the canvas (spec-view-22). jsdom
    // measures text at 6.4px a character.
    const names = ["auth", "billing", "session", "glossary"];
    const circles = names.map((name) => ({
      name,
      x: Number(circleOf(name).getAttribute("cx")),
      y: Number(circleOf(name).getAttribute("cy")),
      r: Number(circleOf(name).getAttribute("r")),
    }));
    for (const circle of circles) expect(circle.r).toBeGreaterThanOrEqual(12);
    const boxes = names.flatMap((name) => {
      const label = screen.queryByTestId(`graph-label-${name}`);
      if (!label) return [];
      const width = (label.textContent?.length ?? 0) * 6.4;
      const x = Number(label.getAttribute("x"));
      const y = Number(label.getAttribute("y"));
      return [{ name, x0: x - width / 2, x1: x + width / 2, y0: y - 12, y1: y + 4 }];
    });
    expect(boxes.length).toBe(4);
    for (const box of boxes) {
      expect(box.x0).toBeGreaterThanOrEqual(10 - 0.01);
      expect(box.y0).toBeGreaterThanOrEqual(10 - 0.01);
      expect(box.x1).toBeLessThanOrEqual(800 - 10 + 0.01);
      expect(box.y1).toBeLessThanOrEqual(600 - 10 + 0.01);
      for (const circle of circles) {
        if (circle.name === box.name) continue;
        const nx = Math.max(box.x0, Math.min(circle.x, box.x1));
        const ny = Math.max(box.y0, Math.min(circle.y, box.y1));
        expect(
          Math.hypot(circle.x - nx, circle.y - ny) - circle.r,
          `${box.name}'s name crowds ${circle.name}`,
        ).toBeGreaterThanOrEqual(5 - 0.01);
      }
      for (const other of boxes) {
        if (other === box) continue;
        const apart =
          box.x1 <= other.x0 || other.x1 <= box.x0 || box.y1 <= other.y0 || other.y1 <= box.y0;
        expect(apart, `${box.name} and ${other.name} overlap`).toBe(true);
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

  // spec-view-40: a pane too short for its marks keeps the picture.
  test("a short pane keeps the arrangement spread over half its height", () => {
    const restore = sized({ width: 800, height: 150 });
    render(<Harness tree={GRAPH_TREE} />);
    const ys = ["auth", "billing", "session", "glossary"].map((name) =>
      Number(circleOf(name).getAttribute("cy")),
    );
    // Half the padded height: 150 less twice the 14px fit padding,
    // where the marks' own margins used to eat the whole span
    // (spec-view-28).
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(60);
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

    // A press focuses its node too, but no card follows it once the
    // pointer leaves: only a keyboard's focus inspects (spec-view-26).
    fireEvent.pointerDown(node("billing"));
    act(() => (node("billing") as unknown as HTMLElement).focus());
    expect(screen.queryByTestId("graph-card")).toBeNull();
    act(() => (node("billing") as unknown as HTMLElement).blur());

    // Keyboard focus reaches a node, shows its card, and Enter opens
    // it (spec-view-25, spec-view-26).
    act(() => (node("billing") as unknown as HTMLElement).focus());
    const card = screen.getByTestId("graph-card");
    expect(within(card).getByText("billing")).toBeTruthy();
    expect(within(card).getByTestId("graph-card-totals").textContent).toBe(
      "3 items · cites 3 · cited by 1",
    );
    // The breakdown is a list in the outline's count grammar, a zero
    // included.
    expect(within(card).getByLabelText("2 external behavior items")).toBeTruthy();
    expect(within(card).getByLabelText("1 internal behavior items")).toBeTruthy();
    expect(within(card).getByLabelText("0 test items")).toBeTruthy();
    // The pinned card reads the same lines in the same order
    // (spec-view-26).
    const lines = (box: Element) => [
      box.children[0]?.textContent,
      box.children[1]?.textContent,
      ...[...(box.children[2]?.querySelectorAll("li") ?? [])].map((line) => line.textContent),
    ];
    const floating = lines(card);
    act(() => (node("billing") as unknown as HTMLElement).blur());
    fireEvent.click(node("billing"));
    expect(lines(screen.getByTestId("graph-selection-card").children[0]!)).toEqual(floating);
    fireEvent.click(node("auth"));
    act(() => (node("billing") as unknown as HTMLElement).focus());
    fireEvent.keyDown(node("billing"), { key: "Enter" });
    expect(
      screen.getByTestId("file-toggle-billing").getAttribute("aria-expanded"),
    ).toBe("true");
    act(() => (node("billing") as unknown as HTMLElement).blur());

    // Escape dismisses the selection once no hover holds the
    // emphasis (spec-view-25).
    const surface = screen.getByLabelText("Spec package citation graph");
    fireEvent.keyDown(surface, { key: "Escape" });
    expect(screen.queryByTestId("graph-halo-auth")).toBeNull();

    // The camera zooms and returns to the fitted whole (spec-view-27).
    const layer = () =>
      screen.getByTestId("spec-graph").querySelector("svg[role=application] > g") as SVGGElement;
    const scaleOf = (element: SVGGElement) =>
      Number(/scale\(([-\d.]+)\)/.exec(element.getAttribute("transform") ?? "")?.[1]);
    const fitted = scaleOf(layer());
    expect(fitted).toBeGreaterThan(0);
    const fit = screen.getByTestId("graph-fit") as HTMLButtonElement;
    expect(fit.disabled).toBe(true);
    fireEvent.keyDown(surface, { key: "+" });
    expect(scaleOf(layer())).toBeGreaterThan(fitted);
    expect(fit.disabled).toBe(false);
    fireEvent.click(fit);
    expect(scaleOf(layer())).toBeCloseTo(fitted, 6);
    expect(fit.disabled).toBe(true);
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
    const outlinePane = screen.getByTestId("file-toggle-auth").closest("div.flex.min-w-0.flex-1");
    expect(outlinePane).not.toBeNull();
    expect(graphPane.className).toContain("min-h-[34rem]");
    // Side by side only above both floors, and the share clamped to
    // them whatever was persisted (spec-view-20).
    expect(graphPane.className).toContain(
      "@min-[49rem]:w-[clamp(320px,var(--graph-share),calc(100%-28rem-17px))]",
    );
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

  // spec-view-27: the camera is bounded by the fitted frame, never by
  // how far the layout reaches.
  test("the camera keeps half its view over the fitted frame", () => {
    const frame = { width: 400, height: 300 };
    // At the fit the bound is half the frame each way.
    const far = boundCamera(zoomIdentity.translate(900, -900), frame);
    expect([far.x, far.y]).toEqual([200, -150]);
    const inside = zoomIdentity.translate(120, -60);
    expect(boundCamera(inside, frame)).toBe(inside);
    // Zoomed in, the view is smaller and still reaches the frame's
    // far edge, keeping half of itself over it.
    const zoomed = boundCamera(zoomIdentity.translate(-5000, 0).scale(2), frame);
    expect(zoomed.x).toBe(200 - 800);
    const view = { x0: -zoomed.x / 2, x1: (400 - zoomed.x) / 2 };
    expect(Math.min(400, view.x1) - Math.max(0, view.x0)).toBe((view.x1 - view.x0) / 2);
  });

  // spec-view-43: the reveal clears the panel by the least move.
  test("a node under the panel moves below it, or left where that is shorter", () => {
    const view = { x0: 0, y0: 0, x1: 400, y1: 440 };
    const panel = { x0: 192, y0: 8, x1: 392, y1: 205 };
    // In the top-right corner, under the panel: down past it.
    expect(revealShift({ x0: 300, y0: 20, x1: 380, y1: 120 }, view, panel, 5)).toEqual({
      dx: 0,
      dy: 190,
    });
    // At the panel's left edge, stepping left is the shorter way.
    expect(revealShift({ x0: 180, y0: 100, x1: 230, y1: 150 }, view, panel, 5)).toEqual({
      dx: -43,
      dy: 0,
    });
    // Already clear: no move.
    expect(revealShift({ x0: 20, y0: 300, x1: 100, y1: 380 }, view, panel, 5)).toBeNull();
    // Outside the view with no panel: the least move into it.
    expect(revealShift({ x0: -50, y0: 100, x1: 30, y1: 150 }, view, null, 5)).toEqual({
      dx: 55,
      dy: 0,
    });
  });

  // spec-view-66: a tree whose every pair totals one falls back to
  // each package's heaviest pair.
  test("the default threshold keeps within 1.5 pairs a package", () => {
    const names = ["a", "b", "c", "d", "e"];
    const files = names.map((name) => ({
      path: `specs/packages/${name}.md`,
      key: name,
      dir: "",
      basename: name,
      title: name,
      intent: "",
      notices: [],
      items: [
        {
          id: `${name}-1`,
          group: "external" as const,
          section: "External Behavior",
          firstLine: "",
          text: "",
          cites: names.filter((other) => other > name).map((other) => `${other}-1`),
        },
      ],
    }));
    const model = buildGraphModel(files, (text) => text.length * 6.4);
    expect(model.pairs).toHaveLength(10);
    expect(model.maxTotal).toBe(1);
    // Ten pairs exceed 7.5 at the first stop, so the last stop holds.
    expect(model.defaultThreshold).toBe(2);
    const floor = model.pairs.filter((pair) => pair.backbone);
    expect(floor.length).toBeLessThanOrEqual(names.length);
    // Ties go to the partner first by name: e's heaviest is a–e.
    expect(floor.some((pair) => pair.a === "a" && pair.b === "e")).toBe(true);
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
    fireEvent.click(screen.getByTestId("records-decisions"));
    fireEvent.click(screen.getByTestId("record-DR-011"));
    await screen.findByText("Accepted");
    fireEvent.click(screen.getByTestId("reader-edit"));
    return screen.getByTestId("spec-editor");
  }

  test("spec-view-64: record and preview hide comments while editing and saving preserve them", async () => {
    const onReadRecord = vi.fn(async () => ({ markdown: COMMENT_SPEC, version: "v-comments" }));
    const onWriteSpec = vi.fn(async () => ({ version: "v-edited" }));
    render(<Harness onReadRecord={onReadRecord} onWriteSpec={onWriteSpec} />);
    fireEvent.click(screen.getByTestId("records-meta"));
    await screen.findByText("Readable specification");
    const checkRendering = (pane: HTMLElement) => {
      expect(pane.textContent).not.toContain("SPDX-License-Identifier");
      expect(pane.textContent).not.toContain("hidden-source-pin");
      expect(pane.textContent).not.toContain("hidden-inline-comment");
      expect(pane.textContent).not.toContain("hidden-multiline-comment");
      expect(pane.textContent).not.toContain("hidden-leading-comment");
      expect(pane.textContent).not.toContain("hidden-wrapped-comment");
      expect(pane.textContent).toContain("Visible trailing text.");
      expect(pane.textContent).toContain("Visible wrapped text");
      expect(pane.textContent).toContain("<!-- visible-inline-example -->");
      expect(pane.textContent).toContain("<!-- visible-block-example -->");
      expect(pane.textContent).toContain('<span data-raw-comment-test="unsafe">');
      expect(pane.querySelector("[data-raw-comment-test]")).toBeNull();
    };
    checkRendering(screen.getByTestId("record-reader"));
    fireEvent.click(screen.getByTestId("reader-edit"));
    expect(field().value).toBe(COMMENT_SPEC);
    const edited = COMMENT_SPEC.replace("Visible before", "Revised before");
    fireEvent.change(field(), { target: { value: edited } });
    fireEvent.click(screen.getByTestId("editor-preview"));
    checkRendering(screen.getByTestId("editor-preview-pane"));
    fireEvent.click(screen.getByTestId("editor-save"));
    expect(onWriteSpec).toHaveBeenCalledWith("meta.md", edited, "v-comments");
    checkRendering(await screen.findByTestId("record-reader"));
  });

  test("no Edit control shows where the host wires no write", async () => {
    render(<Harness onReadRecord={reads()} />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    expect(screen.queryByTestId(`file-edit-${AUTH}`)).toBeNull();
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-2"));
    expect(screen.queryByTestId("item-edit-AUTH-2")).toBeNull();
    fireEvent.click(screen.getByTestId("records-decisions"));
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
    expect(document.activeElement).toBe(screen.getByTestId("reader-back"));
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
      // The list's map.md read comes first (spec-view-7).
      .mockResolvedValueOnce({ markdown: "", version: "v-map" })
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
    expect(onReadRecord).toHaveBeenCalledTimes(3);
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

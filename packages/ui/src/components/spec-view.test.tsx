// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// SPECV component coverage over the DR-015 packages-layout model as
// amended by DR-016: the spec view rendered from a fixture
// SpecTreeState — branch/dir/file outline, document order with
// section and topic labels, group filters, search, classified
// relationship rows and inbound groups, citation jumps, rollups,
// inline-link resolution, records reader, and the empty/legacy
// states.

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

// An Academy-shaped mini-corpus in the DR-012/DR-015 shape that
// exercises every DR-016 relationship kind: a package using a peer
// (uses), a same-file internal reference, a package Verification test
// (verifies), a binding with clients and provisions around its
// `shall` (serves/provides), a no-`shall` binding (degraded plain
// cites), a scenario composing a package via a same-file binding
// (composes/via), and a composition test (executes/verifies) — plus
// one parse-degraded file.
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
      kind: "package",
      key: "identity/auth",
      dir: "identity",
      basename: "auth",
      shortForm: "AUTH",
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
          // The same-file citation is an unlabeled internal reference
          // (DR-016): no outgoing row, a generic cited-by backlink.
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
          text: "Given a stub provider, the suite shall assert sign-in succeeds ([AUTH-1](#auth-1), [AUTH-99](#auth-99)).",
          cites: ["AUTH-1", "AUTH-99"],
        },
      ],
    },
    {
      path: "specs/packages/catalog/courses.md",
      kind: "package",
      key: "catalog/courses",
      dir: "catalog",
      basename: "courses",
      shortForm: "CAT",
      title: "Course Catalog",
      intent: "What the catalog lists.",
      notices: [],
      error: "line 12: item heading without an ID",
      items: [
        {
          id: "CAT-1",
          group: "external",
          section: "External Behavior",
          firstLine: "The catalog shall list published courses.",
          // A peer-file citation from a package behavior item: uses.
          text: "The catalog shall list published courses, reusing credential validation ([AUTH-2](../identity/auth.md#auth-2)).",
          cites: ["AUTH-2"],
        },
      ],
    },
    {
      path: "specs/compositions/guard.md",
      kind: "composition",
      key: "guard",
      dir: "",
      basename: "guard",
      shortForm: "GUARD",
      title: "Protected Content",
      intent: "The whole gating surface in one place.",
      notices: [],
      items: [
        {
          id: "GUARD-5",
          group: "internal",
          section: "Binding",
          firstLine: "Eligibility shall be the deployment's answer.",
          // One-sentence binding grammar: CAT-1 before `shall` is a
          // client (serves), AUTH-8 after it a provision (provides).
          text: "Where the catalog lists published courses ([CAT-1](../packages/catalog/courses.md#cat-1)), eligibility shall be the deployment's answer, feeding session mechanics ([AUTH-8](../packages/identity/auth.md#auth-8)); see the [index](../map.md).",
          cites: ["CAT-1", "AUTH-8"],
        },
        {
          id: "GUARD-6",
          group: "internal",
          section: "Binding",
          firstLine: "Eligibility also covers the media path.",
          // No standalone `shall`: degrades to a plain cites row.
          text: "Eligibility also covers the media path ([AUTH-8](../packages/identity/auth.md#auth-8)).",
          cites: ["AUTH-8"],
        },
        {
          id: "GUARD-1",
          group: "external",
          section: "Scenario",
          firstLine: "The site shall present each surface per the map.",
          // Scenario: the package target composes, the same-file
          // binding is the via.
          text: "The site shall present each surface per the map ([AUTH-1](../packages/identity/auth.md#auth-1)), gated via eligibility ([GUARD-5](#guard-5)).",
          cites: ["AUTH-1", "GUARD-5"],
        },
        {
          id: "GUARD-3",
          group: "test",
          section: "Tests",
          firstLine: "The suite shall sweep the map.",
          // Composition test: same-file scenario and binding targets
          // execute; the package behavior target verifies.
          text: "The acceptance suite shall sweep the map ([GUARD-1](#guard-1), [GUARD-5](#guard-5)) and check the catalog listing ([CAT-1](../packages/catalog/courses.md#cat-1)).",
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

const AUTH = "package:identity/auth";
const CAT = "package:catalog/courses";
const GUARD = "composition:guard";

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

describe("SPECV-1/2: outline shape and file nodes", () => {
  test("branches nest directories and files; counts and intents render", () => {
    render(<Harness />);
    // The two top branches, then collection directories, default open.
    const packagesBranch = screen.getByTestId("branch-package");
    const compositionsBranch = screen.getByTestId("branch-composition");
    expect(packagesBranch.textContent).toContain("Packages");
    expect(compositionsBranch.textContent).toContain("Compositions");
    expect(before(packagesBranch, compositionsBranch)).toBe(true);
    // Directories sort alphabetically within their branch.
    const catalogDir = screen.getByText("catalog/");
    const identityDir = screen.getByText("identity/");
    expect(before(catalogDir, identityDir)).toBe(true);
    const auth = screen.getByTestId(`file-${AUTH}`);
    expect(within(auth).getByText("AUTH")).toBeTruthy();
    expect(within(auth).getByText("auth")).toBeTruthy();
    expect(within(auth).getByText("How users sign in.")).toBeTruthy();
    expect(within(auth).getByLabelText("3 external items")).toBeTruthy();
    expect(within(auth).getByLabelText("1 internal items")).toBeTruthy();
    expect(within(auth).getByLabelText("1 test items")).toBeTruthy();
    // Header totals across both collections.
    expect(
      screen.getByText("2 packages · 1 composition · 10 items"),
    ).toBeTruthy();
    // Files default collapsed: no item rows yet.
    expect(screen.queryByTestId("item-AUTH-2")).toBeNull();
  });

  test("zero counts stay, muted; root composition needs no directory", () => {
    render(<Harness />);
    const courses = screen.getByTestId(`file-${CAT}`);
    // Zero renders muted, not absent.
    expect(within(courses).getByLabelText("0 internal items")).toBeTruthy();
    expect(within(courses).getByLabelText("0 test items")).toBeTruthy();
    const guard = screen.getByTestId(`file-${GUARD}`);
    expect(within(guard).getByText("GUARD")).toBeTruthy();
    expect(
      within(guard).getByText("The whole gating surface in one place."),
    ).toBeTruthy();
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

  test("composition sections render verbatim; parse errors show amber", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    const guard = within(screen.getByTestId(`file-${GUARD}`));
    const binding = guard.getByText("Binding");
    const scenario = guard.getByText("Scenario");
    const tests = guard.getByText("Tests");
    expect(before(binding, scenario)).toBe(true);
    expect(before(scenario, tests)).toBe(true);
    // Per-file parse error shows as an amber notice inside the file.
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
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

  test("clicking the ID chip copies the ID and ticks", async () => {
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
});

describe("SPECV-5: search", () => {
  test("narrows to matches, auto-expands, and restores on clear", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    const input = screen.getByPlaceholderText("Filter items — ID or text…");
    fireEvent.change(input, { target: { value: "cat-1" } });
    // Case-insensitive match on ID and text (GUARD-5 and GUARD-3 cite
    // CAT-1 in their bodies); matching files auto-expand.
    expect(screen.getByTestId("match-count").textContent).toBe("3 matches");
    expect(screen.getByTestId("item-CAT-1")).toBeTruthy();
    expect(screen.getByTestId("item-GUARD-5")).toBeTruthy();
    expect(screen.queryByTestId("item-AUTH-2")).toBeNull();
    // Clearing restores the prior expansion state.
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByTestId("item-CAT-1")).toBeNull();
    expect(screen.getByTestId("item-AUTH-2")).toBeTruthy();
  });

  test("text matches count across files and respect filters", () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("Filter items — ID or text…");
    fireEvent.change(input, { target: { value: "shall" } });
    // Every item but the degraded no-shall binding says "shall".
    expect(screen.getByTestId("match-count").textContent).toBe("9 matches");
    // Filtered-off groups leave the count.
    fireEvent.click(screen.getByTestId("filter-test"));
    expect(screen.getByTestId("match-count").textContent).toBe("7 matches");
  });
});

describe("SPECV-6: relationship classification (DR-016)", () => {
  test("package peer citations are uses; same-file stay unlabeled", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    fireEvent.click(screen.getByTestId("item-toggle-CAT-1"));
    const uses = screen.getByTestId("row-CAT-1-uses");
    expect(uses.textContent).toContain("uses");
    expect(within(uses).getByTestId("link-CAT-1-AUTH-2")).toBeTruthy();
    // The glyph is decorative: aria-hidden, the word is the channel.
    expect(
      uses.querySelector('[aria-hidden="true"]')?.textContent,
    ).toContain("→");
    // AUTH-2's same-file citation of AUTH-1 renders no outgoing row.
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-2"));
    expect(screen.queryByTestId("row-AUTH-2-uses")).toBeNull();
    expect(screen.queryByTestId("row-AUTH-2-cites")).toBeNull();
    // The target still gets the generic cited-by backlink group.
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-1"));
    const citedBy = screen.getByTestId("inbound-AUTH-1-cites");
    expect(citedBy.textContent).toContain("cited by 1");
  });

  test("a binding splits clients from provisions around its shall", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-5"));
    const serves = screen.getByTestId("row-GUARD-5-serves");
    expect(serves.textContent).toContain("serves");
    expect(within(serves).getByTestId("link-GUARD-5-CAT-1")).toBeTruthy();
    const provides = screen.getByTestId("row-GUARD-5-provides");
    expect(provides.textContent).toContain("provides");
    expect(within(provides).getByTestId("link-GUARD-5-AUTH-8")).toBeTruthy();
  });

  test("a binding outside the grammar keeps a plain cites row", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-6"));
    const plain = screen.getByTestId("row-GUARD-6-cites");
    expect(plain.textContent).toContain("cites");
    expect(within(plain).getByTestId("link-GUARD-6-AUTH-8")).toBeTruthy();
    // Never an invented clause side.
    expect(screen.queryByTestId("row-GUARD-6-serves")).toBeNull();
    expect(screen.queryByTestId("row-GUARD-6-provides")).toBeNull();
  });

  test("a scenario composes package targets via same-file bindings", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-1"));
    const composes = screen.getByTestId("row-GUARD-1-composes");
    expect(composes.textContent).toContain("composes");
    expect(within(composes).getByTestId("link-GUARD-1-AUTH-1")).toBeTruthy();
    const via = screen.getByTestId("row-GUARD-1-via");
    expect(via.textContent).toContain("via");
    expect(within(via).getByTestId("link-GUARD-1-GUARD-5")).toBeTruthy();
  });

  test("tests verify behavior and execute same-file scenario/bindings", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-3"));
    const executes = screen.getByTestId("row-GUARD-3-executes");
    expect(executes.textContent).toContain("executes");
    expect(within(executes).getByTestId("link-GUARD-3-GUARD-1")).toBeTruthy();
    expect(within(executes).getByTestId("link-GUARD-3-GUARD-5")).toBeTruthy();
    const verifies = screen.getByTestId("row-GUARD-3-verifies");
    expect(within(verifies).getByTestId("link-GUARD-3-CAT-1")).toBeTruthy();
    // A package Verification item verifies its targets, dead or not.
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-10"));
    const authVerifies = screen.getByTestId("row-AUTH-10-verifies");
    expect(
      within(authVerifies).getByTestId("link-AUTH-10-AUTH-1"),
    ).toBeTruthy();
    expect(
      within(authVerifies).getByTestId("link-AUTH-10-AUTH-99"),
    ).toBeTruthy();
  });

  test("collapsed rows carry at most two kind-aware hints", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    // Outgoing kind first, then verified-by.
    expect(screen.getByTestId("item-toggle-CAT-1").textContent).toContain(
      "→ uses 1 · ✓ verified by 1",
    );
    // Outgoing only.
    expect(screen.getByTestId("item-toggle-AUTH-10").textContent).toContain(
      "✓ verifies 2",
    );
    expect(screen.getByTestId("item-toggle-GUARD-3").textContent).toContain(
      "✓ verifies 1 · ▸ executes 2",
    );
    // Two outgoing kinds cap the hints; inbound drops off.
    expect(screen.getByTestId("item-toggle-GUARD-5").textContent).toContain(
      "⊸ serves 1 · ⊸ provides 1",
    );
    // Inbound-only: verified-by outranks the other inbound kinds.
    expect(screen.getByTestId("item-toggle-AUTH-1").textContent).toContain(
      "✓ verified by 1 · ∘ composed in 1",
    );
    expect(screen.getByTestId("item-toggle-AUTH-2").textContent).toContain(
      "→ used by 1",
    );
  });

  test("inbound groups render collapsed by count and expand to jumps", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-8"));
    // AUTH-8 is the provision GUARD-5 resolves to ("supplies") and is
    // plainly cited by the degraded GUARD-6 ("cited by").
    const supplies = screen.getByTestId("inbound-AUTH-8-provides");
    expect(supplies.textContent).toContain("supplies 1");
    expect(supplies.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("link-AUTH-8-GUARD-5")).toBeNull();
    fireEvent.click(supplies);
    expect(supplies.getAttribute("aria-expanded")).toBe("true");
    const citedBy = screen.getByTestId("inbound-AUTH-8-cites");
    expect(citedBy.textContent).toContain("cited by 1");
    fireEvent.click(citedBy);
    expect(screen.getByTestId("link-AUTH-8-GUARD-6")).toBeTruthy();
    // A backlink is a full jump: the citing binding opens in view.
    fireEvent.click(screen.getByTestId("link-AUTH-8-GUARD-5"));
    expect(
      screen.getByTestId("item-toggle-GUARD-5").getAttribute("aria-expanded"),
    ).toBe("true");
  });

  test("relationship targets jump in view for every kind", () => {
    render(<Harness />);
    // uses: CAT-1 → AUTH-2.
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    fireEvent.click(screen.getByTestId("item-toggle-CAT-1"));
    fireEvent.click(screen.getByTestId("link-CAT-1-AUTH-2"));
    expect(
      screen.getByTestId("item-toggle-AUTH-2").getAttribute("aria-expanded"),
    ).toBe("true");
    // via: GUARD-1 → GUARD-5.
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-1"));
    fireEvent.click(screen.getByTestId("link-GUARD-1-GUARD-5"));
    expect(
      screen.getByTestId("item-toggle-GUARD-5").getAttribute("aria-expanded"),
    ).toBe("true");
    // executes: GUARD-3 → GUARD-1 (already expanded target stays).
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-3"));
    fireEvent.click(screen.getByTestId("link-GUARD-3-GUARD-1"));
    expect(
      screen.getByTestId("item-toggle-GUARD-1").getAttribute("aria-expanded"),
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
  });

  test("a dead citation says not found and never navigates", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    fireEvent.click(screen.getByTestId("item-toggle-AUTH-10"));
    fireEvent.click(screen.getByTestId("link-AUTH-10-AUTH-99"));
    expect(screen.getByText("not found")).toBeTruthy();
    expect(screen.queryByTestId("item-AUTH-99")).toBeNull();
  });

  test("an inline body link to an item ID jumps cross-file", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    fireEvent.click(screen.getByTestId("item-toggle-GUARD-5"));
    // The rendered markdown link [AUTH-8](../packages/...#auth-8)
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

describe("SPECV-2/6: file relationship rollups (DR-016)", () => {
  test("an expanded file header rolls up per-kind counts, in and out", () => {
    render(<Harness />);
    // Collapsed files carry no rollup line.
    expect(screen.queryByTestId(`rollup-${AUTH}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`file-toggle-${AUTH}`));
    const auth = screen.getByTestId(`rollup-${AUTH}`);
    expect(auth.textContent).toBe(
      "used by 1 · supplies 1 · composed in 1 · verifies 2 · verified by 1 · cited by 2",
    );
    expect(auth.getAttribute("aria-label")).toBe(
      `Relationships: ${auth.textContent}`,
    );
    fireEvent.click(screen.getByTestId(`file-toggle-${CAT}`));
    expect(screen.getByTestId(`rollup-${CAT}`).textContent).toBe(
      "uses 1 · served by 1 · verified by 1",
    );
    fireEvent.click(screen.getByTestId(`file-toggle-${GUARD}`));
    expect(screen.getByTestId(`rollup-${GUARD}`).textContent).toBe(
      "serves 1 · provides 1 · composes 1 · via 1 · composed via 1 · " +
        "verifies 1 · executes 2 · executed by 2 · cites 1",
    );
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
    expect(screen.getByTestId(`file-${AUTH}`)).toBeTruthy();
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

describe("SPECV-9: empty, legacy, and loading states", () => {
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

  test("a legacy tree renders migration guidance and no tree", () => {
    render(<Harness tree={LEGACY_TREE} />);
    const legacy = screen.getByTestId("specs-legacy");
    expect(
      within(legacy).getByText("This project uses the legacy specs layout"),
    ).toBeTruthy();
    expect(legacy.textContent).toContain("npx @sublang/spex scaffold --update");
    expect(
      within(legacy).getByRole("button", {
        name: "Copy command npx @sublang/spex scaffold --update",
      }),
    ).toBeTruthy();
    // No tree, no filters: guidance replaces the outline.
    expect(screen.queryByTestId("branch-package")).toBeNull();
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
    expect(screen.getByTestId("branch-package")).toBeTruthy();
    // Defaults: all three DR-015 groups on.
    for (const group of ["external", "internal", "test"]) {
      expect(
        screen.getByTestId(`filter-${group}`).getAttribute("aria-pressed"),
      ).toBe("true");
    }
  });
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// dashboard-25: intent records list as next work, because an intent
// is work to finish rather than spec law (DR-027), and activating one
// sends it home to the surface that can actually read it.

import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

afterEach(cleanup);

const { commandMock } = vi.hoisted(() => ({ commandMock: vi.fn() }));

vi.mock("../state/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/store.js")>();
  return { ...actual, getClient: () => ({ command: commandMock }) };
});

import { DashboardSurface } from "./DashboardSurface.js";
import { useAppStore } from "../state/store.js";
import type { SpecTreeState } from "@sublang/spex-core/protocol";

const tree = (intents: { id: string; title: string; path: string }[]) =>
  ({
    present: true,
    legacy: false,
    readAt: Date.now(),
    notices: [],
    decisions: [],
    intents,
    files: [],
  }) satisfies SpecTreeState;

describe("dashboard-24/25: intents as next work", () => {
  test("a project's intents list and open in its own Specs surface", () => {
    commandMock.mockResolvedValue({ days: [] });
    useAppStore.setState({
      connection: "open",
      sessions: [],
      views: {},
      projects: [
        { id: "p1", name: "spex", path: "/tmp/spex" },
        { id: "p2", name: "quiet", path: "/tmp/quiet" },
      ] as never,
      projectMeta: {},
      specTrees: {
        p1: tree([
          { id: "IR-033", title: "Linked views", path: "intents/033-linked.md" },
          { id: "IR-034", title: "Records places", path: "intents/034-records.md" },
        ]),
        // A tree that lists no intents contributes no list.
        p2: tree([]),
      },
    });

    const onOpenIntent = vi.fn();
    render(
      <DashboardSurface
        onOpenSession={() => {}}
        onNavigate={() => {}}
        onOpenIntent={onOpenIntent}
      />,
    );

    const lists = screen.getByTestId("intent-lists");
    // Entries name the record by ID and title (dashboard-24).
    expect(within(lists).getByText("IR-033")).toBeTruthy();
    expect(within(lists).getByText("Linked views")).toBeTruthy();
    expect(within(lists).getByText("spex")).toBeTruthy();
    // The project with no intents contributes nothing.
    expect(within(lists).queryByText("quiet")).toBeNull();

    // Activating one opens that record in its project's Specs
    // surface, the only place a record can be read (dashboard-24).
    fireEvent.click(screen.getByTestId("intent-p1-IR-033"));
    expect(onOpenIntent).toHaveBeenCalledWith("p1", "intents/033-linked.md");
  });

  test("no project with intents renders no list at all", () => {
    commandMock.mockResolvedValue({ days: [] });
    useAppStore.setState({
      connection: "open",
      sessions: [],
      views: {},
      projects: [{ id: "p2", name: "quiet", path: "/tmp/quiet" }] as never,
      projectMeta: {},
      specTrees: { p2: tree([]) },
    });
    render(
      <DashboardSurface
        onOpenSession={() => {}}
        onNavigate={() => {}}
        onOpenIntent={() => {}}
      />,
    );
    expect(screen.queryByTestId("intent-lists")).toBeNull();
  });
});

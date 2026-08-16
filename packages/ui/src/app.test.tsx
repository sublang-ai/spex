// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-70/72: the sidebar is the navigator and the tabs are the
// working set (DR-029), and the chrome folds without dropping a duty
// (DR-030). Both drive the whole App against store state, because the
// contract is about how the rail, the strip and the run view agree.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(cleanup);

const { commandMock } = vi.hoisted(() => ({ commandMock: vi.fn() }));

vi.mock("./state/store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./state/store.js")>();
  return { ...actual, getClient: () => ({ command: commandMock }) };
});

import { App } from "./App.js";
import { setClientForTests, useAppStore } from "./state/store.js";
import { initialSessionView, type SessionView } from "./state/reducer.js";
import type { SessionInfo } from "@sublang/spex-core/protocol";

// A live clock: the rows print ages relative to now.
const NOW = Date.now();
const PLAYERS = [{ id: "code-coder", adapter: "claude" as const }];

function session(over: Partial<SessionInfo> & { id: string }): SessionInfo {
  return {
    projectId: "p1",
    projectPath: "/tmp/alpha",
    createdAt: NOW - 60_000,
    live: false,
    endedAt: NOW - 30_000,
    players: PLAYERS,
    initialVisible: ["code-coder"],
    turns: 1,
    failed: false,
    ...over,
  };
}

/** A loaded transcript; `question` parks it awaiting a Boss reply. */
function view(question?: string): SessionView {
  const loaded = initialSessionView(PLAYERS, ["code-coder"]);
  loaded.loading = false;
  if (question) loaded.pendingQuestion = question;
  return loaded;
}

const OLD_ENDED = Array.from({ length: 6 }, (_, index) =>
  session({
    id: `old-${index}`,
    title: `older work ${index}`,
    endedAt: NOW - 3_600_000 * (index + 2),
  }),
);

const SESSIONS: SessionInfo[] = [
  session({
    id: "a-live",
    title: "harden the session refresh",
    live: true,
    endedAt: null,
    createdAt: NOW - 120_000,
    turns: 2,
    costUsd: 0.42,
  }),
  session({
    id: "a-failed",
    title: "chase the flaky test",
    failed: true,
    endedAt: NOW - 600_000,
  }),
  session({ id: "a-bare", turns: 0, endedAt: NOW - 900_000 }),
  ...OLD_ENDED,
  session({
    id: "b-live",
    projectId: "p2",
    projectPath: "/tmp/beta",
    title: "beta is asking",
    live: true,
    endedAt: null,
  }),
  session({
    id: "b-ended",
    projectId: "p2",
    projectPath: "/tmp/beta",
    title: "beta wrapped up",
  }),
];

function seed(): void {
  useAppStore.setState({
    connection: "open",
    everConnected: true,
    projects: [
      { id: "p1", name: "alpha", path: "/tmp/alpha", registeredAt: 0 },
      { id: "p2", name: "beta", path: "/tmp/beta", registeredAt: 1 },
    ] as never,
    projectMeta: {},
    sessions: SESSIONS,
    views: {
      "a-live": view("Which migration should I run first?"),
      "b-live": view("Should I rebase?"),
      "b-ended": view(),
    },
    composers: {},
    runErrors: {},
    currentProjectId: "p1",
    activeSessionId: "a-live",
    workspaceTabs: { p1: "a-live" },
    openTabs: { p1: ["a-live"] },
    expandedProjects: {},
    railCollapsed: false,
    specTrees: {},
    specErrors: {},
    homeDraft: "",
    readiness: [],
    machineGraphs: {},
    configState: {
      status: "valid",
      summary: { playbooks: [], captain: undefined },
    } as never,
  });
}

// jsdom has no layout, so the strip's keep-in-view call needs a stub.
Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  commandMock.mockReset();
  commandMock.mockResolvedValue({});
  // Store actions resolve the module-local client, which the module
  // mock above cannot reach.
  setClientForTests({
    command: commandMock,
    subscribe: vi.fn(async () => {}),
  } as never);
  seed();
});

describe("run-view-70: the sidebar navigates, the tabs hold what is open", () => {
  test("rows read as conversations, attention first, history quiet", () => {
    render(<App />);

    // Dashboard stands first and carries the cross-project count
    // (run-view-34): both live sessions are waiting.
    const rail = screen.getByTestId("sidebar");
    const entries = Array.from(rail.querySelectorAll("button")).map(
      (button) => button.textContent,
    );
    expect(entries[0]).toContain("Dashboard");
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("2");

    // The current project is disclosed; its live row wears amber for
    // the waiting question, not emerald for merely being alive.
    const liveRow = screen.getByTestId("sidebar-session-a-live");
    expect(liveRow.dataset.selected).toBeUndefined();
    expect(
      screen.getByTestId("sidebar-mark-a-live").dataset.life,
    ).toBe("question");
    expect(liveRow.textContent).toContain("harden the session refresh");
    // Relative time is printed, and the fuller scent is in the
    // accessible description rather than behind a hover.
    expect(liveRow.textContent).toContain("2m");
    expect(liveRow.getAttribute("aria-label")).toContain("2 turns");
    expect(liveRow.getAttribute("aria-label")).toContain("$0.42");

    // A failure the session ended holding is history, not a summons.
    expect(
      screen.getByTestId("sidebar-mark-a-failed").dataset.life,
    ).toBe("ended-failed");
    expect(
      screen.getByTestId("sidebar-session-a-failed").getAttribute("aria-label"),
    ).toContain("held a failure");

    // A session that never spoke says so instead of faking a name.
    expect(screen.getByTestId("sidebar-session-a-bare").textContent).toContain(
      "no messages yet",
    );

    // The other project is collapsed and still shows it needs a human.
    expect(screen.queryByTestId("sidebar-session-b-ended")).toBeNull();
    expect(screen.getByTestId("sidebar-project-attention-p2")).toBeTruthy();
  });

  test("the recent window holds, and its control reveals the rest", () => {
    render(<App />);
    // Six ended sessions plus the live one: only five ended list.
    expect(screen.queryByTestId("sidebar-session-old-5")).toBeNull();
    fireEvent.click(screen.getByTestId("sidebar-more-p1"));
    expect(screen.getByTestId("sidebar-session-old-5")).toBeTruthy();
  });

  test("disclosing another project leaves the workspace where it is", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("sidebar-disclose-p2"));
    expect(screen.getByTestId("sidebar-session-b-ended")).toBeTruthy();
    expect(useAppStore.getState().currentProjectId).toBe("p1");
  });

  test("a foreign session opens as a read-only tab, once", async () => {
    commandMock.mockResolvedValue({ records: [] });
    render(<App />);
    fireEvent.click(screen.getByTestId("sidebar-disclose-p2"));

    await act(async () => {
      fireEvent.click(screen.getByTestId("sidebar-session-b-ended"));
    });
    expect(useAppStore.getState().currentProjectId).toBe("p2");
    expect(useAppStore.getState().openTabs.p2).toEqual(["b-ended"]);
    // Ended means read-only: the composer gives way to the notice.
    expect(screen.getByTestId("ended-notice")).toBeTruthy();
    expect(screen.queryByTestId("end-session")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByTestId("sidebar-session-b-ended"));
    });
    expect(useAppStore.getState().openTabs.p2).toEqual(["b-ended"]);
  });

  test("ending keeps the transcript put and marks the row ended", async () => {
    render(<App />);
    expect(screen.getByTestId("end-session")).toBeTruthy();

    fireEvent.click(screen.getByTestId("end-session"));
    await act(async () => {
      fireEvent.click(screen.getByText("end"));
    });
    expect(commandMock).toHaveBeenCalledWith("session.dispose", {
      sessionId: "a-live",
    });

    // The core answers with the ended state; the tab must not move.
    await act(async () => {
      useAppStore.setState({
        sessions: SESSIONS.map((entry) =>
          entry.id === "a-live"
            ? { ...entry, live: false, endedAt: NOW }
            : entry,
        ),
      });
    });
    expect(useAppStore.getState().openTabs.p1).toEqual(["a-live"]);
    expect(screen.getByTestId("ended-notice")).toBeTruthy();
    expect(screen.getByTestId("tab-ended-a-live")).toBeTruthy();
    expect(screen.getByTestId("sidebar-mark-a-live").dataset.life).toBe(
      "ended",
    );
  });

  test("the tree walks by keyboard and keeps its own letters", async () => {
    render(<App />);
    const project = screen.getByTestId("sidebar-project-p1");
    project.focus();

    // One focus stop, arrow keys within it (run-view-67).
    fireEvent.keyDown(project, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      screen.getByTestId("sidebar-session-a-live"),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(project);

    // Disclosure by keyboard, and it never moves the workspace.
    fireEvent.keyDown(project, { key: "ArrowLeft" });
    expect(project.getAttribute("aria-expanded")).toBe("false");
    expect(useAppStore.getState().currentProjectId).toBe("p1");

    // Type-ahead reaches a session by its own first words, and the
    // composer does not steal the letter (run-view-49).
    fireEvent.keyDown(project, { key: "ArrowRight" });
    fireEvent.keyDown(project, { key: "c" });
    expect(document.activeElement).toBe(
      screen.getByTestId("sidebar-session-a-failed"),
    );
  });

  test("closing a tab files the session back, still listed", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("tab-close-a-live"));
    expect(useAppStore.getState().openTabs.p1).toEqual([]);
    // Closing stops nothing: no dispose was asked for.
    expect(commandMock).not.toHaveBeenCalledWith(
      "session.dispose",
      expect.anything(),
    );
    expect(screen.getByTestId("sidebar-session-a-live")).toBeTruthy();
  });
});

describe("run-view-72: the chrome folds without dropping a duty", () => {
  test("the binding collapses and the foot control restores", () => {
    const { unmount } = render(<App />);
    expect(screen.getByTestId("sidebar").dataset.collapsed).toBe("0");

    fireEvent.keyDown(window, { key: "b", metaKey: true });
    const collapsed = screen.getByTestId("sidebar");
    expect(collapsed.dataset.collapsed).toBe("1");
    // Collapsed entries keep their names and the count survives.
    expect(screen.getByLabelText(/^Playbooks$/)).toBeTruthy();
    expect(screen.getByTestId("nav-attention-badge").textContent).toBe("2");
    // Sessions stop listing, but the open tab is still the reach.
    expect(screen.queryByTestId("sidebar-session-a-live")).toBeNull();
    expect(screen.getByRole("tab", { selected: true })).toBeTruthy();

    // Chrome state is a preference: it survives a remount.
    unmount();
    render(<App />);
    expect(screen.getByTestId("sidebar").dataset.collapsed).toBe("1");

    fireEvent.click(screen.getByTestId("sidebar-collapse"));
    expect(screen.getByTestId("sidebar").dataset.collapsed).toBe("0");
  });

  test("a broken config keeps its red voice while collapsed", () => {
    useAppStore.setState({
      configState: { status: "invalid", errors: ["captain: missing"] } as never,
      railCollapsed: true,
    });
    render(<App />);
    expect(
      screen.getByLabelText("Config invalid — open Settings"),
    ).toBeTruthy();
  });
});

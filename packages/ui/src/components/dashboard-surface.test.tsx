// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Dashboard as the intent ledger's surface (DR-035): the two-band
// attention queue with its verdict acts (dashboard-1..4), the
// all-clear pull (dashboard-8), the per-project groups' four bands
// (dashboard-26..30), capture with the shelf reveal (dashboard-30/31,
// 37), the paged Sources tabs with the captured-artifact swap
// (dashboard-19/20/24/25), History paging (dashboard-27/38), empty
// states without takeover (dashboard-8/21/22), and the Repo tab's
// shared row representation (forge-work-lists-1, projects-6).

import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type {
  AttentionEntry,
  DerivedIntent,
  ForgeState,
  IntentInfo,
  LedgerState,
  SpecTreeState,
} from "@sublang/spex-core/protocol";

import { DashboardSurface } from "./DashboardSurface.js";
import { RepoTab } from "./ProjectsSurface.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { initialSessionView } from "../state/reducer.js";

afterEach(() => {
  cleanup();
  setClientForTests(undefined);
});

const commandMock = vi.fn();

const NOW = Date.now();
const MIN = 60_000;

const PROJECTS = [
  { id: "p1", name: "alpha", path: "/tmp/alpha", registeredAt: 0 },
  { id: "p2", name: "beta", path: "/tmp/beta", registeredAt: 1 },
];

const EMPTY_TREE: SpecTreeState = {
  present: true,
  legacy: false,
  files: [],
  decisions: [],
  intents: [],
  notices: [],
  readAt: NOW,
};

const EMPTY_LEDGER: LedgerState = { intents: [], attention: [], badge: 0 };

function info(
  over: Partial<IntentInfo> & { id: string; projectId: string; text: string },
): IntentInfo {
  return { rank: "m", createdAt: NOW - 60 * MIN, ...over };
}

function q(
  id: string,
  projectId: string,
  text: string,
  over: Partial<DerivedIntent> = {},
): DerivedIntent {
  return { intent: info({ id, projectId, text }), state: "queued", ...over };
}

/** Seed the real store; the client is faked via setClientForTests. */
function seed(over: Record<string, unknown> = {}) {
  useAppStore.setState({
    connection: "open",
    projects: PROJECTS,
    projectMeta: { p1: {}, p2: {} },
    specTrees: { p1: EMPTY_TREE, p2: EMPTY_TREE },
    sessions: [],
    views: {},
    history: {
      p1: { intents: [], more: false },
      p2: { intents: [], more: false },
    },
    ledger: EMPTY_LEDGER,
    ledgerError: undefined,
    stagedIntents: {},
    ...over,
  } as never);
}

beforeEach(() => {
  commandMock.mockReset();
  commandMock.mockImplementation(async (type: string) => {
    if (type === "ledger.get") {
      return useAppStore.getState().ledger ?? EMPTY_LEDGER;
    }
    if (type === "ledger.history") return { intents: [], more: false };
    return {};
  });
  setClientForTests({
    command: commandMock,
    subscribe: vi.fn(async () => null),
  } as never);
});

function renderSurface(over: {
  onOpenSession?: Mock<(sessionId: string, turnId?: number) => void>;
  onOpenIntent?: Mock<(projectId: string, path: string) => void>;
  onStartIntent?: Mock<(intent: IntentInfo) => void>;
  onNavigate?: Mock<(surface: "Workspace") => void>;
} = {}) {
  const onOpenSession =
    over.onOpenSession ?? vi.fn<(sessionId: string, turnId?: number) => void>();
  const onOpenIntent =
    over.onOpenIntent ?? vi.fn<(projectId: string, path: string) => void>();
  const onStartIntent =
    over.onStartIntent ?? vi.fn<(intent: IntentInfo) => void>();
  const onNavigate = over.onNavigate ?? vi.fn<(surface: "Workspace") => void>();
  render(
    <DashboardSurface
      onOpenSession={onOpenSession}
      onOpenIntent={onOpenIntent}
      onStartIntent={onStartIntent}
      onNavigate={onNavigate}
    />,
  );
  return { onOpenSession, onOpenIntent, onStartIntent, onNavigate };
}

function callsOf(type: string) {
  return commandMock.mock.calls
    .filter((call) => call[0] === type)
    .map((call) => call[1]);
}

// ---------------------------------------------------------------------------
// Attention queue
// ---------------------------------------------------------------------------

const ATTENTION: AttentionEntry[] = [
  {
    band: "interrupted",
    kind: "question",
    intentId: "iq",
    title: "Fix login",
    projectId: "p1",
    sessionId: "s1",
    turnId: 4,
    since: NOW - 10 * MIN,
  },
  {
    band: "interrupted",
    kind: "permission",
    title: "claude wants to push",
    projectId: "p1",
    sessionId: "s6",
    since: NOW - 6 * MIN,
  },
  {
    band: "interrupted",
    kind: "failure",
    intentId: "if",
    title: "Migrate DB",
    projectId: "p2",
    sessionId: "s2",
    since: NOW - 5 * MIN,
  },
  {
    band: "finished",
    kind: "finish",
    intentId: "id1",
    title: "Ship docs",
    projectId: "p1",
    sessionId: "s3",
    turnId: 9,
    since: NOW - 30 * MIN,
    stats: { reviewRounds: 2, turns: 3, elapsedMs: 12 * MIN },
  },
  {
    band: "finished",
    kind: "finish",
    intentId: "id2",
    title: "Tidy CI",
    projectId: "p2",
    sessionId: "s5",
    since: NOW - 8 * MIN,
    stats: { turns: 1, elapsedMs: MIN },
  },
  {
    band: "finished",
    kind: "review",
    title: "chat about tests",
    projectId: "p2",
    sessionId: "s4",
    turnId: 2,
    since: NOW - 2 * MIN,
  },
];

describe("dashboard-1/2/3/35: the two-band attention queue", () => {
  test("bands render in served order with human reasons and tones", () => {
    seed({ ledger: { intents: [], attention: ATTENTION, badge: 6 } });
    const { onOpenSession } = renderSurface();

    const queue = screen.getByTestId("attention-queue");
    const rows = Array.from(queue.querySelectorAll("[data-band]"));
    expect(rows.map((row) => row.getAttribute("data-testid"))).toEqual([
      "attention-iq-question",
      "attention-s6-permission",
      "attention-if-failure",
      "attention-id1-finish",
      "attention-id2-finish",
      "attention-s4-review",
    ]);
    // Interrupted before finished, as the fold serves it.
    expect(rows.map((row) => row.getAttribute("data-band"))).toEqual([
      "interrupted",
      "interrupted",
      "interrupted",
      "finished",
      "finished",
      "finished",
    ]);
    // Amber waits on the human; only the unacknowledged failure is red.
    expect(
      rows.map((row) => row.getAttribute("data-tone")),
    ).toEqual(["amber", "amber", "red", "amber", "amber", "amber"]);

    // Status speaks human (DR-010 §2), and the row names its project
    // and how long it has waited.
    const question = screen.getByTestId("attention-iq-question");
    expect(question.textContent).toContain("needs your reply");
    expect(question.textContent).toContain("Fix login");
    expect(question.textContent).toContain("alpha");
    expect(question.textContent).toContain("10m");
    expect(
      screen.getByTestId("attention-s6-permission").textContent,
    ).toContain("awaiting permission");
    expect(screen.getByTestId("attention-if-failure").textContent).toContain(
      "failed",
    );
    expect(screen.getByTestId("attention-id1-finish").textContent).toContain(
      "finished — confirm?",
    );
    expect(screen.getByTestId("attention-s4-review").textContent).toContain(
      "turn to review",
    );

    // Finished stats: review rounds foremost, omitted when zero
    // (dashboard-35).
    expect(screen.getByTestId("attention-stats-id1").textContent).toBe(
      "2 review rounds · 3 turns · 12m",
    );
    expect(screen.getByTestId("attention-stats-id2").textContent).toBe(
      "1 turn · 1m",
    );

    // Activation opens the session at the entry's place (dashboard-3).
    fireEvent.click(
      within(question).getByRole("button", { name: /Open Fix login/ }),
    );
    expect(onOpenSession).toHaveBeenCalledWith("s1", 4);
  });

  test("Confirm closes done with an in-frame busy state; Drop guards", async () => {
    seed({ ledger: { intents: [], attention: ATTENTION, badge: 6 } });
    let settleClose!: () => void;
    commandMock.mockImplementation(async (type: string) => {
      if (type === "intent.close") {
        return new Promise((resolve) => {
          settleClose = () => resolve({});
        });
      }
      if (type === "ledger.get") return useAppStore.getState().ledger;
      return {};
    });
    renderSurface();

    const confirm = screen.getByTestId("attention-confirm-id1");
    fireEvent.click(confirm);
    // The action acknowledges where it was taken (DR-010 §5).
    expect(confirm.textContent).toBe("confirming…");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(callsOf("intent.close")).toEqual([
      { intentId: "id1", as: "done" },
    ]);
    await act(async () => settleClose());

    // Drop is guarded, then closes dropped (dashboard-4: a verdict).
    fireEvent.click(screen.getByTestId("attention-drop-id2"));
    const row = screen.getByTestId("attention-id2-finish");
    expect(row.textContent).toContain("Drop this intent?");
    fireEvent.click(within(row).getByRole("button", { name: "drop" }));
    expect(callsOf("intent.close")).toEqual([
      { intentId: "id1", as: "done" },
      { intentId: "id2", as: "dropped" },
    ]);
    await act(async () => settleClose());
  });
});

describe("dashboard-8: the all-clear names the globally next head", () => {
  test("the first unblocked head by sidebar order carries Start", () => {
    // p1 holds only a blocked intent, so p2's head is globally next.
    seed({
      ledger: {
        intents: [
          q("b1", "p1", "Wait on upstream", {
            blockedBy: { intentId: "n1", title: "Polish README", projectId: "p2" },
          }),
          q("n1", "p2", "Polish README\nwith details"),
        ],
        attention: [],
        badge: 0,
      },
    });
    const { onStartIntent } = renderSurface();

    const allClear = screen.getByTestId("attention-all-clear");
    expect(allClear.textContent).toContain("Polish README");
    expect(allClear.textContent).toContain("beta");
    fireEvent.click(screen.getByTestId("all-clear-start"));
    expect(onStartIntent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "n1", text: "Polish README\nwith details" }),
    );
  });

  test("plain all-clear copy when no unblocked head exists", () => {
    seed({
      ledger: {
        intents: [
          q("b1", "p1", "Blocked", {
            blockedBy: { intentId: "x", title: "Elsewhere", projectId: "p2" },
          }),
        ],
        attention: [],
        badge: 0,
      },
    });
    renderSurface();
    expect(
      screen.getByTestId("attention-all-clear").textContent,
    ).toContain("All clear — nothing waiting");
    expect(screen.queryByTestId("all-clear-start")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Project groups: Up next
// ---------------------------------------------------------------------------

describe("dashboard-26/29: groups and the queue band", () => {
  const QUEUE_LEDGER: LedgerState = {
    intents: [
      q("q1", "p1", "First thing"),
      q("q2", "p1", "Blocked thing", {
        blockedBy: { intentId: "x1", title: "Upstream fix", projectId: "p2" },
      }),
      q("q3", "p1", "Third thing"),
    ],
    attention: [],
    badge: 0,
  };

  test("groups render in sidebar order with all four bands", () => {
    seed({ ledger: QUEUE_LEDGER });
    renderSurface();
    const groups = screen.getAllByTestId(/^project-group-/);
    expect(groups.map((el) => el.getAttribute("data-testid"))).toEqual([
      "project-group-p1",
      "project-group-p2",
    ]);
    const p1 = screen.getByTestId("project-group-p1");
    expect(within(p1).getByTestId("history-p1")).toBeTruthy();
    expect(within(p1).getByTestId("now-p1")).toBeTruthy();
    expect(within(p1).getByTestId("upnext-p1")).toBeTruthy();
    expect(within(p1).getByTestId("sources-p1")).toBeTruthy();
  });

  test("head emphasized with Start; blocked visible, disabled, reasoned", () => {
    seed({ ledger: QUEUE_LEDGER });
    const { onStartIntent } = renderSurface();

    const head = screen.getByTestId("upnext-row-q1");
    expect(head.getAttribute("data-next")).toBe("true");
    fireEvent.click(screen.getByTestId("upnext-start-q1"));
    expect(onStartIntent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "q1" }),
    );

    // The blocked row stays visible at its place with "after ⟨title⟩",
    // the predecessor's project named when foreign (dashboard-29).
    expect(screen.getByTestId("upnext-blocked-q2").textContent).toBe(
      "after Upstream fix (beta)",
    );
    const blockedStart = screen.getByTestId(
      "upnext-start-q2",
    ) as HTMLButtonElement;
    expect(blockedStart.disabled).toBe(true);
    expect(blockedStart.title).toContain("Upstream fix");

    // A queued row that is neither head nor blocked carries no Start.
    expect(screen.queryByTestId("upnext-start-q3")).toBeNull();
  });

  test("Alt+Arrow reorders the focused row through intent.move", async () => {
    seed({ ledger: QUEUE_LEDGER });
    renderSurface();

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("upnext-row-q3"), {
        key: "ArrowUp",
        altKey: true,
      });
    });
    expect(callsOf("intent.move")).toEqual([
      { intentId: "q3", afterIntentId: "q1" },
    ]);

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("upnext-row-q2"), {
        key: "ArrowUp",
        altKey: true,
      });
    });
    expect(callsOf("intent.move")).toEqual([
      { intentId: "q3", afterIntentId: "q1" },
      { intentId: "q2", afterIntentId: null },
    ]);
  });

  test("the row popover edits queued text and drops with a guard", async () => {
    seed({ ledger: QUEUE_LEDGER });
    renderSurface();

    fireEvent.click(screen.getByTestId("upnext-menu-q1"));
    fireEvent.click(screen.getByTestId("upnext-edit-action-q1"));
    const input = screen.getByTestId("upnext-edit-q1") as HTMLInputElement;
    expect(input.value).toBe("First thing");
    fireEvent.change(input, { target: { value: "First thing, sharper" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(callsOf("intent.edit")).toEqual([
      { intentId: "q1", text: "First thing, sharper" },
    ]);

    fireEvent.click(screen.getByTestId("upnext-menu-q3"));
    fireEvent.click(screen.getByTestId("upnext-drop-action-q3"));
    const row = screen.getByTestId("upnext-row-q3");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "drop" }));
    });
    expect(callsOf("intent.close")).toEqual([
      { intentId: "q3", as: "dropped" },
    ]);
  });

  test("the inline add row captures and the shelf reveals the row", async () => {
    let current: LedgerState = { ...QUEUE_LEDGER };
    commandMock.mockImplementation(async (type: string, fields) => {
      if (type === "intent.queue") {
        const input = fields as { projectId: string; text: string };
        current = {
          ...current,
          intents: [
            ...current.intents,
            q("i-new", input.projectId, input.text),
          ],
        };
        return info({ id: "i-new", projectId: input.projectId, text: input.text });
      }
      if (type === "ledger.get") return current;
      return {};
    });
    seed({ ledger: QUEUE_LEDGER });
    renderSurface();

    const add = screen.getByTestId("add-intent-p1");
    fireEvent.change(add, { target: { value: "New idea" } });
    await act(async () => {
      fireEvent.keyDown(add, { key: "Enter" });
    });
    // Captured with no source (dashboard-29's inline add).
    expect(callsOf("intent.queue")).toEqual([
      { projectId: "p1", text: "New idea" },
    ]);
    const row = await screen.findByTestId("upnext-row-i-new");
    expect(row.getAttribute("data-highlight")).toBe("true");
    expect((add as HTMLInputElement).value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Project groups: Now
// ---------------------------------------------------------------------------

describe("dashboard-28: the Now band reads the live lane", () => {
  test("mark, playbook, state label, served intent, and elapsed", () => {
    const view = initialSessionView([]);
    view.turnActive = true;
    view.fsmState = "codeReview";
    view.frames = [{ playbookId: "code" } as never];
    seed({
      sessions: [
        {
          id: "s-live",
          projectId: "p1",
          projectPath: "/tmp/alpha",
          createdAt: NOW - 45 * MIN,
          live: true,
          endedAt: null,
          players: [],
          initialVisible: [],
          turns: 3,
          failed: false,
        },
      ],
      views: { "s-live": view },
      ledger: {
        intents: [
          {
            intent: info({
              id: "w1",
              projectId: "p1",
              text: "Fix login flow\nmore detail",
              dispatched: { sessionId: "s-live", turnId: 3, at: NOW - 10 * MIN },
            }),
            state: "working",
            stats: { turns: 1 },
          },
        ],
        attention: [],
        badge: 0,
      },
    });
    const { onOpenSession } = renderSurface();

    const row = screen.getByTestId("now-session-p1");
    expect(
      row.querySelector("[data-running]")?.getAttribute("data-running"),
    ).toBe("true");
    expect(row.textContent).toContain("code");
    // Humanized state, raw id in the tooltip (DR-010 §2).
    expect(row.textContent).toContain("code review");
    expect(row.querySelector('[title="codeReview"]')).toBeTruthy();
    expect(row.textContent).toContain("Fix login flow");
    expect(row.textContent).toContain("45m");
    fireEvent.click(row);
    expect(onOpenSession).toHaveBeenCalledWith("s-live");

    // A project with no live session stays quiet (dashboard-8).
    expect(screen.getByTestId("now-p2").textContent).toContain(
      "Idle — no live session.",
    );
  });
});

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const FORGE: ForgeState = {
  adapter: "github",
  authenticated: true,
  repo: "x/y",
  issues: [
    {
      number: 7,
      title: "Fix the bug",
      url: "https://github.com/x/y/issues/7",
      labels: ["bug", "urgent"],
    },
  ],
  prs: [
    {
      number: 8,
      title: "Add tests",
      url: "https://github.com/x/y/pull/8",
      labels: ["ci"],
    },
  ],
};

const RECORD_TREE: SpecTreeState = {
  ...EMPTY_TREE,
  intents: [
    {
      id: "IR-2",
      title: "Old finished",
      path: "intents/002-old.md",
      status: "Done (2026-01-05)",
    },
    { id: "IR-3", title: "Half done", path: "intents/003-half.md", status: "In review" },
  ],
};

function seedSources(over: Record<string, unknown> = {}) {
  seed({
    projectMeta: { p1: { forge: FORGE }, p2: {} },
    specTrees: { p1: RECORD_TREE, p2: EMPTY_TREE },
    ...over,
  });
}

describe("dashboard-19/20/24/25/30/37: the Sources band", () => {
  test("collapsed counts and age, tabs, labels, and queue seeds", async () => {
    seedSources();
    const { onOpenIntent } = renderSurface();

    // Collapsed line: counts with data age (dashboard-20/14).
    const toggle = screen.getByTestId("sources-toggle-p1");
    expect(toggle.textContent).toContain("1 issue · 1 PR · 1 open record");
    expect(toggle.textContent).toContain("just now");

    fireEvent.click(toggle);
    // Issues tab first: number, title link, forge labels as tags.
    const issue = screen.getByTestId("source-issue-p1-7");
    expect(issue.textContent).toContain("#7");
    expect(issue.textContent).toContain("Fix the bug");
    expect(issue.textContent).toContain("bug");
    expect(issue.textContent).toContain("urgent");
    expect(
      issue.querySelector("a")?.getAttribute("href"),
    ).toBe("https://github.com/x/y/issues/7");

    // Queue seeds the spec table's text with the URL as provenance
    // (dashboard-30/37).
    await act(async () => {
      fireEvent.click(
        within(issue).getByRole("button", { name: /Queue issue #7/ }),
      );
    });
    expect(callsOf("intent.queue")).toEqual([
      {
        projectId: "p1",
        text: "Address #7: Fix the bug\nhttps://github.com/x/y/issues/7",
        source: {
          kind: "issue",
          ref: "7",
          url: "https://github.com/x/y/issues/7",
        },
      },
    ]);

    // PRs tab seeds the review text.
    fireEvent.click(screen.getByTestId("sources-tab-prs-p1"));
    const pr = screen.getByTestId("source-pr-p1-8");
    expect(pr.textContent).toContain("ci");
    await act(async () => {
      fireEvent.click(
        within(pr).getByRole("button", { name: /Queue PR #8/ }),
      );
    });
    expect(callsOf("intent.queue")[1]).toEqual({
      projectId: "p1",
      text: "Review PR #8: Add tests\nhttps://github.com/x/y/pull/8",
      source: { kind: "pr", ref: "8", url: "https://github.com/x/y/pull/8" },
    });

    // Records tab lists only unfinished records (dashboard-24/25):
    // the Done record does not list.
    fireEvent.click(screen.getByTestId("sources-tab-records-p1"));
    expect(screen.queryByTestId("source-record-p1-IR-2")).toBeNull();
    const record = screen.getByTestId("source-record-p1-IR-3");
    await act(async () => {
      fireEvent.click(
        within(record).getByRole("button", { name: /Queue record IR-3/ }),
      );
    });
    expect(callsOf("intent.queue")[2]).toEqual({
      projectId: "p1",
      text: "Resume IR-3: Half done",
      source: { kind: "record", ref: "IR-3" },
    });
    // The record's title opens the records reader (dashboard-24).
    fireEvent.click(within(record).getByTitle("Half done"));
    expect(onOpenIntent).toHaveBeenCalledWith("p1", "intents/003-half.md");
  });

  test("a captured artifact swaps its Queue control for the intent's state and regains it on close", () => {
    const captured: DerivedIntent = {
      intent: info({
        id: "c1",
        projectId: "p1",
        text: "Address #7: Fix the bug",
        source: {
          kind: "issue",
          ref: "7",
          url: "https://github.com/x/y/issues/7",
        },
        dispatched: { sessionId: "s1", turnId: 1, at: NOW - MIN },
      }),
      state: "working",
    };
    seedSources({
      ledger: { intents: [captured], attention: [], badge: 0 },
    });
    renderSurface();
    fireEvent.click(screen.getByTestId("sources-toggle-p1"));

    const issue = screen.getByTestId("source-issue-p1-7");
    const state = within(issue).getByTestId("source-issue-p1-7-state");
    expect(state.textContent).toBe("working");
    expect(state.getAttribute("title")).toBe("working");
    expect(within(issue).queryByRole("button", { name: /Queue/ })).toBeNull();

    // The intent closes: the ledger no longer serves it, and the row
    // regains its control (dashboard-30).
    act(() => {
      useAppStore.setState({ ledger: EMPTY_LEDGER });
    });
    expect(
      within(screen.getByTestId("source-issue-p1-7")).getByRole("button", {
        name: /Queue issue #7/,
      }),
    ).toBeTruthy();
  });

  test("pages of six with a quiet in-place pager; refresh re-fetches", async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      number: index + 1,
      title: `Issue ${index + 1}`,
      url: `https://github.com/x/y/issues/${index + 1}`,
    }));
    commandMock.mockImplementation(async (type: string) => {
      if (type === "forge.items") return { ...FORGE, issues: many };
      if (type === "ledger.get") return useAppStore.getState().ledger;
      if (type === "ledger.history") return { intents: [], more: false };
      return {};
    });
    seedSources({
      projectMeta: { p1: { forge: { ...FORGE, issues: many } }, p2: {} },
    });
    renderSurface();
    fireEvent.click(screen.getByTestId("sources-toggle-p1"));

    expect(screen.getByTestId("source-issue-p1-6")).toBeTruthy();
    expect(screen.queryByTestId("source-issue-p1-7")).toBeNull();
    expect(screen.getByText("1 / 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByTestId("source-issue-p1-7")).toBeTruthy();
    expect(screen.queryByTestId("source-issue-p1-1")).toBeNull();

    // Manual refresh calls the adapter regardless of cache age
    // (dashboard-14).
    await act(async () => {
      fireEvent.click(screen.getByTestId("sources-refresh-p1"));
    });
    expect(callsOf("forge.items")).toEqual([
      { projectId: "p1", refresh: true },
    ]);
  });

  test("an adapter failure keeps the last lists and surfaces itself", () => {
    seedSources({
      projectMeta: {
        p1: { forge: FORGE, forgeError: "gh: network unreachable" },
        p2: {},
      },
    });
    renderSurface();
    // Keep-last-good (dashboard-14): the failure rides beside the
    // data, which stays served.
    expect(screen.getByTestId("sources-error-p1").textContent).toContain(
      "keeping the last data",
    );
    fireEvent.click(screen.getByTestId("sources-toggle-p1"));
    expect(screen.getByTestId("source-issue-p1-7")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

describe("dashboard-27/38: History pages newest first", () => {
  test("closed intents render with verdicts and older pages append", async () => {
    const page1 = {
      intents: [
        {
          intent: info({
            id: "h1",
            projectId: "p1",
            text: "Newest done",
            closedAt: NOW - 2 * MIN,
            closedAs: "done",
          }),
        },
        {
          intent: info({
            id: "h2",
            projectId: "p1",
            text: "Dropped one",
            closedAt: NOW - 5 * MIN,
            closedAs: "dropped",
          }),
        },
      ],
      more: true,
    };
    const page2 = {
      intents: [
        {
          intent: info({
            id: "h3",
            projectId: "p1",
            text: "Older done",
            closedAt: NOW - 60 * MIN,
            closedAs: "done",
          }),
        },
      ],
      more: false,
    };
    commandMock.mockImplementation(async (type: string, fields) => {
      if (type === "ledger.history") {
        return (fields as { before?: unknown }).before ? page2 : page1;
      }
      if (type === "ledger.get") return useAppStore.getState().ledger;
      return {};
    });
    // History absent for p1: the band loads its first page itself.
    seed({
      projects: [PROJECTS[0]],
      projectMeta: { p1: {} },
      specTrees: { p1: EMPTY_TREE },
      history: {},
    });
    renderSurface();

    const first = await screen.findByTestId("history-row-h1");
    const second = screen.getByTestId("history-row-h2");
    // Newest first, dropped struck (dashboard-27).
    expect(
      first.compareDocumentPosition(second) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(second.getAttribute("data-verdict")).toBe("dropped");
    expect(second.querySelector(".line-through")).toBeTruthy();
    expect(second.textContent).toContain("✕");
    expect(first.textContent).toContain("✓");

    // The accessible older control fetches the next page with the
    // cursor of the last served row (dashboard-38).
    await act(async () => {
      fireEvent.click(screen.getByTestId("history-older-p1"));
    });
    expect(callsOf("ledger.history")[1]).toEqual({
      projectId: "p1",
      before: { closedAt: NOW - 5 * MIN, intentId: "h2" },
    });
    expect(await screen.findByTestId("history-row-h3")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByTestId("history-older-p1")).toBeNull(),
    );
  });
});

// ---------------------------------------------------------------------------
// Empty states, no takeover, filter
// ---------------------------------------------------------------------------

describe("dashboard-8/21/22/32: empty states, no takeover, the filter", () => {
  test("no registered project: guidance with Workspace navigation, no takeover", () => {
    seed({
      projects: [],
      projectMeta: {},
      specTrees: {},
      history: {},
      ledger: EMPTY_LEDGER,
    });
    const { onNavigate } = renderSurface();
    // The attention queue still renders (dashboard-21): no takeover.
    expect(screen.getByTestId("attention-all-clear")).toBeTruthy();
    const empty = screen.getByTestId("projects-empty");
    expect(empty.textContent).toContain("register");
    fireEvent.click(within(empty).getByRole("button", { name: "Workspace" }));
    expect(onNavigate).toHaveBeenCalledWith("Workspace");
  });

  test("a registered project with an empty ledger keeps every band instructive", () => {
    seed({ projects: [PROJECTS[0]] });
    renderSurface();
    expect(screen.getByTestId("history-p1").textContent).toContain(
      "No intent has closed here yet.",
    );
    expect(screen.getByTestId("now-p1").textContent).toContain(
      "Idle — no live session.",
    );
    // The add row stays as the capture path (dashboard-8/29).
    expect(screen.getByTestId("add-intent-p1")).toBeTruthy();
    expect(screen.getByTestId("upnext-p1").textContent).toContain(
      "Nothing queued",
    );
    // No forge binding: the collapsed line still counts, and the
    // expanded tab guides to the Workspace.
    fireEvent.click(screen.getByTestId("sources-toggle-p1"));
    expect(screen.getByTestId("sources-p1").textContent).toContain(
      "No GitHub connection yet",
    );
  });

  test("the project filter is visibility only (dashboard-32)", () => {
    seed({ ledger: { intents: [], attention: ATTENTION, badge: 6 } });
    renderSurface();
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by project" }), {
      target: { value: "p2" },
    });
    // Only beta's entries and group stay visible.
    expect(screen.queryByTestId("attention-iq-question")).toBeNull();
    expect(screen.getByTestId("attention-if-failure")).toBeTruthy();
    expect(screen.queryByTestId("project-group-p1")).toBeNull();
    expect(screen.getByTestId("project-group-p2")).toBeTruthy();
    // No ledger write rode the filter change.
    expect(callsOf("intent.move")).toEqual([]);
    expect(callsOf("intent.close")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The Repo tab shares the row representation (forge-work-lists-1)
// ---------------------------------------------------------------------------

describe("projects-6, forge-work-lists-1: the Repo tab's shared rows", () => {
  test("labels, Queue with the same seed, and the captured swap", async () => {
    seedSources();
    render(<RepoTab projectId="p1" onRemoved={() => {}} />);

    const issue = screen.getByTestId("repo-issue-p1-7");
    expect(issue.textContent).toContain("#7");
    expect(issue.textContent).toContain("bug");
    expect(
      issue.querySelector("a")?.getAttribute("href"),
    ).toBe("https://github.com/x/y/issues/7");
    await act(async () => {
      fireEvent.click(
        within(issue).getByRole("button", { name: /Queue issue #7/ }),
      );
    });
    expect(callsOf("intent.queue")).toEqual([
      {
        projectId: "p1",
        text: "Address #7: Fix the bug\nhttps://github.com/x/y/issues/7",
        source: {
          kind: "issue",
          ref: "7",
          url: "https://github.com/x/y/issues/7",
        },
      },
    ]);

    // The captured artifact shows its intent's state here too.
    act(() => {
      useAppStore.setState({
        ledger: {
          intents: [
            {
              intent: info({
                id: "c1",
                projectId: "p1",
                text: "Review PR #8: Add tests",
                source: { kind: "pr", ref: "8" },
              }),
              state: "queued",
            },
          ],
          attention: [],
          badge: 0,
        },
      });
    });
    const pr = screen.getByTestId("repo-pr-p1-8");
    expect(
      within(pr).getByTestId("repo-pr-p1-8-state").textContent,
    ).toBe("queued");
    expect(within(pr).queryByRole("button", { name: /Queue/ })).toBeNull();
  });
});

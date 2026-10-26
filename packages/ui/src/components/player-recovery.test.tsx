// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-180/181/182 (DR-154): players read by name and mark, each
// call's delegation line rebuilt from its records, and a failure's ways
// back to the agent it names.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { RunView } from "./RunView.js";
import { applyRecords, initialSessionView, type SessionView } from "../state/reducer.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import type { SessionInfo, TmuxPlayRecord } from "@sublang/spex-core/protocol";
import type { FixtureEntry } from "../fixtures/sample-run.js";

afterEach(cleanup);

const t = 1_700_000_000_000;
const rec = (seq: number, record: Record<string, unknown>): FixtureEntry & { role?: string } =>
  ({ seq, record: { turnId: 1, timestamp: t + seq, ...record } as unknown as TmuxPlayRecord });
const prompt = (seq: number, playerId: string, role: string | undefined, contextSeq?: number) => ({
  ...rec(seq, { type: "player_prompt", playerId, prompt: "go", ...(contextSeq ? { contextSeq } : {}) }),
  ...(role ? { role } : {}),
});
const finished = (seq: number, playerId: string) =>
  rec(seq, { type: "player_finished", playerId, result: { status: "ok" } });
const value = (model: string) => ({ kind: "value", value: model });
const providerDefault = { kind: "provider-default" };

function context(seq: number, reviewerModel: string) {
  return rec(seq, {
    type: "session_context",
    contextVersion: 1,
    captainId: "captain",
    graphs: [],
    initialVisible: [],
    configuration: {
      schemaVersion: 2,
      captain: { adapter: "claude", model: value("claude-opus-5-5") },
      players: [
        { id: "dev.coder", adapter: "claude", model: value("claude-opus-5-5") },
        { id: "dev.reviewer", adapter: "codex", model: value(reviewerModel) },
        { id: "dev.analyst", adapter: "claude", model: value("claude-opus-5-5") },
        { id: "inspect.inspector", adapter: "claude", model: providerDefault },
      ],
      catalog: {
        code: { roles: { coder: { playerId: "dev.coder", model: value("claude-opus-5-5") } } },
        review: { roles: {
          coder: { playerId: "dev.coder", model: value("claude-opus-5-5") },
          reviewer: { playerId: "dev.reviewer", model: value(reviewerModel) },
        } },
        // One player, one role, two bindings that disagree.
        dev: { roles: { planner: { playerId: "dev.analyst", model: value("claude-opus-5-5") } } },
        plan: { roles: { planner: { playerId: "dev.analyst", model: value("claude-sonnet-5-5") } } },
        inspect: { roles: { inspector: { playerId: "inspect.inspector", model: providerDefault } } },
      },
    },
  });
}

const DELEGATIONS = [
  rec(1, { type: "turn_started", turn: { id: 1, prompt: "/review fix the login bug" } }),
  context(2, "gpt-6-sol"),
  prompt(3, "dev.coder", "coder", 2),
  rec(4, { type: "player_event", playerId: "dev.coder", event: { type: "init", payload: { model: "claude-opus-5-5", reportedModel: "claude-opus-5-5-20261001" } } }),
  finished(5, "dev.coder"),
  prompt(6, "dev.reviewer", "reviewer", 2),
  finished(7, "dev.reviewer"),
  // A second round of review on the same model adds no line.
  prompt(8, "dev.coder", "coder", 2),
  finished(9, "dev.coder"),
  prompt(10, "dev.reviewer", "reviewer", 2),
  finished(11, "dev.reviewer"),
  // The reviewer's model changes, so its next call says so.
  context(12, "gpt-6-mini"),
  prompt(13, "dev.reviewer", "reviewer", 12),
  finished(14, "dev.reviewer"),
  prompt(15, "dev.analyst", "planner", 12),
  finished(16, "dev.analyst"),
  prompt(17, "inspect.inspector", "inspector", 12),
  finished(18, "inspect.inspector"),
];

const PLAYERS = [
  { id: "dev.coder", adapter: "claude" as const, model: "claude-opus-5-5" },
  { id: "dev.reviewer", adapter: "codex" as const, model: "gpt-6-sol" },
  { id: "dev.analyst", adapter: "claude" as const },
  { id: "inspect.inspector", adapter: "claude" as const },
];
// A second reviewer, whose last segment the first one shares.
const DOCS_REVIEWER = { id: "docs.reviewer", adapter: "claude" as const };

const SESSION: SessionInfo = {
  id: "s1",
  projectId: "p1",
  projectPath: "/tmp/p1",
  title: "fix login",
  createdAt: t,
  updatedAt: t,
  live: true,
  continuable: true,
  turnActive: false,
  players: PLAYERS,
  initialVisible: [],
} as unknown as SessionInfo;

const SUMMARY = {
  path: "/tmp/playbook.config.yaml",
  captain: { adapter: "claude" as const, model: "claude-opus-5-5", effort: "high" },
  players: PLAYERS.map((player) => ({ id: player.id, agent: { adapter: player.adapter, ...(player.model ? { model: player.model } : {}) }, display: player.adapter, boundBy: [] as string[] })),
  playbooks: [],
};

function fold(entries: (FixtureEntry & { role?: string })[]): SessionView {
  return applyRecords(initialSessionView(PLAYERS), entries);
}

function mount(entries: (FixtureEntry & { role?: string })[], over: Partial<Parameters<typeof RunView>[0]> = {}, configured = true, players = PLAYERS) {
  setClientForTests({ command: vi.fn(async () => ({ adapter: "claude", effortValues: ["high"], discovery: { status: "available", models: [] } })) } as never);
  useAppStore.setState({
    collapsedLanes: {},
    configState: configured ? { status: "valid", summary: SUMMARY, seeded: false } : undefined,
    ledger: undefined,
    stagedIntents: {},
  } as never);
  return render(
    <RunView
      session={{ ...SESSION, players }}
      view={fold(entries)}
      composer={{ queued: [] }}
      connected
      onSubmit={async () => {}}
      onAbort={() => {}}
      onRemoveQueued={() => {}}
      onDismissError={() => {}}
      {...over}
    />,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("run-view-180: a player reads by its name and mark", () => {
  test("the last segment names a player, a shared one its full id", () => {
    mount([prompt(1, "dev.coder", undefined), prompt(2, "dev.reviewer", undefined), prompt(3, "docs.reviewer", undefined)],
      {}, true, [...PLAYERS, DOCS_REVIEWER]);
    const coder = screen.getByTestId("player-pane-dev.coder");
    const name = within(coder).getByTestId("player-name-dev.coder");
    expect(name.textContent).toBe("coder");
    expect(name.getAttribute("title")).toBe("dev.coder");
    const mark = within(coder).getByTestId("player-mark");
    expect(mark.textContent).toBe("C");
    // One neutral colour for every player, never the Captain's brand.
    expect(mark.className).toMatch(/bg-neutral-500/);
    expect(mark.className).not.toMatch(/bg-brand/);
    expect(screen.getByTestId("player-name-dev.reviewer").textContent).toBe("dev.reviewer");
    expect(screen.getByTestId("player-name-docs.reviewer").textContent).toBe("docs.reviewer");
    // The rail keeps the name and the mark.
    fireEvent.click(within(coder).getByRole("button", { name: "Collapse coder" }));
    const rail = screen.getByTestId("player-pane-dev.coder");
    expect(within(rail).getByTestId("player-name-dev.coder").textContent).toBe("coder");
    expect(within(rail).getByTestId("player-mark").textContent).toBe("C");
  });
});

describe("run-view-181: a delegation line per first call and per changed model", () => {
  const lines = () => screen.queryAllByTestId(/^delegation-line-/).map((line) => line.textContent);

  test("each line reads its own call's model and survives a later change", () => {
    mount(DELEGATIONS);
    expect(lines()).toEqual([
      // Reported in `init`, so the runtime's model.
      "CHanded to coder · claude · claude-opus-5-5-20261001",
      "RHanded to reviewer · codex · gpt-6-sol",
      "RHanded to reviewer · codex · gpt-6-mini",
      // Two bindings disagree on the role: no model is claimed.
      "AHanded to analyst · claude",
      "IHanded to inspector · claude · provider default",
    ]);
  });

  test("stored records rebuild the same lines in the same places", () => {
    const live = fold(DELEGATIONS);
    const again = fold(DELEGATIONS.map((entry) => ({ ...entry })));
    const shape = (view: SessionView) => view.captain.map((line) => [line.kind, line.delegation]);
    expect(shape(again)).toEqual(shape(live));
    // Each line stands at its call's place in the thread.
    expect(live.captain[0].kind).toBe("boss");
    expect(live.captain[1].delegation?.player).toBe("dev.coder");
  });

  test("a delegation that fails before its player records anything adds no line", () => {
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/review" } }),
      rec(2, { type: "runtime_error", message: "Unknown player: dev.reviewer" }),
    ]);
    expect(lines()).toEqual([]);
  });

  test("activating a line brings its lane into view", () => {
    mount(DELEGATIONS);
    fireEvent.click(screen.getAllByTestId("delegation-line-dev.reviewer")[0]);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    const pane = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.contexts.at(-1) as HTMLElement;
    expect(pane.dataset.testid).toBe("player-pane-dev.reviewer");
  });
});

describe("run-view-182: a failure's ways back to its agent", () => {
  const playerFailure = (seq: number, message: string) => rec(seq, {
    type: "runtime_error",
    message: `dev.reviewer failed: ${message}`,
    data: { cause: { code: "player-failed", evidence: { playerId: "dev.reviewer", error: { message } } } },
  });
  const entries = (failure: FixtureEntry, withLane = true) => [
    rec(1, { type: "turn_started", turn: { id: 1, prompt: "/review" } }),
    ...(withLane ? [prompt(2, "dev.reviewer", "reviewer")] : []),
    failure,
  ];

  test.each([
    ["an expired sign-in", "401 Unauthorized", { adjust: false, settings: true }],
    ["a rate limit", "429 rate limit reached", { adjust: false, settings: true }],
    ["a command not installed", "spawn codex ENOENT", { adjust: false, settings: false }],
    ["an unknown adapter", 'Unknown adapter "codx"', { adjust: false, settings: true }],
    ["an unrecognized message", "The model gpt-6-sol does not exist", { adjust: true, settings: true }],
  ])("%s offers its row of entries", (_case, message, offered) => {
    mount(entries(playerFailure(3, message)), { onOpenAgentSettings: () => {} });
    expect(screen.getByTestId("failure-card-why").textContent).toMatch(/^reviewer failed/);
    expect(!!screen.queryByTestId("failure-adjust-dev.reviewer")).toBe(offered.adjust);
    expect(!!screen.queryByTestId("failure-settings-dev.reviewer")).toBe(offered.settings);
    if (offered.adjust) expect(screen.getByTestId("failure-adjust-dev.reviewer").textContent).toBe("Adjust reviewer");
    if (offered.settings) expect(screen.getByTestId("failure-settings-dev.reviewer").textContent).toBe("Change reviewer in Settings");
  });

  test("Adjust brings the lane into view, points at its chip, then opens its popover there", () => {
    vi.useFakeTimers();
    try {
      mount(entries(playerFailure(3, "The model gpt-6-sol does not exist")));
      fireEvent.click(screen.getByTestId("failure-adjust-dev.reviewer"));
      act(() => { vi.advanceTimersByTime(50); });
      const pane = screen.getByTestId("player-pane-dev.reviewer");
      expect((Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.contexts).toContain(pane);
      expect(pane.querySelector('[data-highlighted="1"]')).not.toBeNull();
      expect(screen.queryByTestId("agent-settings-dev.reviewer")).toBeNull();
      act(() => { vi.advanceTimersByTime(500); });
      expect(within(pane).getByTestId("agent-settings-dev.reviewer")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  test("with no lane, the popover hangs from the failure", () => {
    mount(entries(playerFailure(2, "The model gpt-6-sol does not exist"), false));
    expect(screen.queryByTestId("player-pane-dev.reviewer")).toBeNull();
    fireEvent.click(screen.getByTestId("failure-adjust-dev.reviewer"));
    const card = screen.getByTestId("failure-card");
    expect(within(card).getByTestId("agent-settings-dev.reviewer")).toBeTruthy();
  });

  test("Change in Settings asks for that agent's row", () => {
    const onOpenAgentSettings = vi.fn();
    mount(entries(playerFailure(3, "401 Unauthorized")), { onOpenAgentSettings });
    fireEvent.click(screen.getByTestId("failure-settings-dev.reviewer"));
    expect(onOpenAgentSettings).toHaveBeenCalledWith("dev.reviewer");
  });

  const captainFailure = (message: string) => [
    rec(1, { type: "turn_started", turn: { id: 1, prompt: "hello" } }),
    rec(2, { type: "captain_finished", result: { status: "error", error: message } }),
  ];

  test("the Captain's own failure opens the Captain's chip and row", () => {
    const onOpenAgentSettings = vi.fn();
    mount(captainFailure("The model claude-opus-5-5 does not exist"), { onOpenAgentSettings });
    fireEvent.click(screen.getByTestId("failure-adjust-captain"));
    const header = screen.getByTestId("captain-pane").querySelector("header") as HTMLElement;
    expect(within(header).getByTestId("agent-settings-captain")).toBeTruthy();
    fireEvent.click(screen.getByTestId("failure-settings-captain"));
    expect(onOpenAgentSettings).toHaveBeenCalledWith("captain");
    expect(screen.getByTestId("failure-settings-captain").textContent).toBe("Change Captain in Settings");
  });

  test("without the Captain's chip, only Settings and the words stand", () => {
    mount(captainFailure("The model claude-opus-5-5 does not exist"), { onOpenAgentSettings: () => {} }, false);
    expect(screen.queryByTestId("failure-adjust-captain")).toBeNull();
    expect(screen.getByTestId("failure-settings-captain")).toBeTruthy();
  });
});

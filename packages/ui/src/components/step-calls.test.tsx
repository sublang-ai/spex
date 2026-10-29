// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// run-view-190..192 (DR-160): the Captain's dispatching read from the
// records — a delegation and a return line per call, each call's step on
// its lane, the steps' players on the card, the strip of who is at work,
// and one status vocabulary — over a /dev run that decides before it
// codes, recorded from the real runtime on substitute agents, and over
// the cases a recording cannot pose.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { RunView } from "./RunView.js";
import { applyRecords, initialSessionView, type SessionView } from "../state/reducer.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { activateLanguage } from "../i18n.js";
import type { SessionInfo, TmuxPlayRecord } from "@sublang/spex-core/protocol";
import type { FixtureEntry } from "../fixtures/sample-run.js";
import developRun from "../fixtures/records/develop-run.json";
import developAbort from "../fixtures/records/develop-abort.json";

afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

type Entry = FixtureEntry & { role?: string };
const RUN = developRun as unknown as Entry[];
const ABORT = developAbort as unknown as Entry[];

const PLAYERS = [
  { id: "dev.analyst", adapter: "claude" as const, model: "claude-opus-5-5" },
  { id: "dev.coder", adapter: "claude" as const, model: "claude-opus-5-5" },
  { id: "dev.reviewer", adapter: "codex" as const, model: "gpt-6-sol" },
];

const SESSION = {
  id: "s1",
  projectId: "p1",
  projectPath: "/tmp/p1",
  title: "Add a 404 page",
  createdAt: 0,
  updatedAt: 0,
  live: true,
  continuable: true,
  turnActive: false,
  players: PLAYERS,
  initialVisible: [],
} as unknown as SessionInfo;

function fold(entries: readonly Entry[]): SessionView {
  return applyRecords(initialSessionView(PLAYERS), entries.map((entry) => ({ ...entry })));
}

/** The records up to and including `seq`. */
const upTo = (entries: readonly Entry[], seq: number): Entry[] => entries.filter((entry) => entry.seq <= seq);

/** The seq of the first record matching `match`. */
function seqOf(entries: readonly Entry[], match: (record: Record<string, unknown>) => boolean): number {
  const found = entries.find((entry) => match(entry.record as unknown as Record<string, unknown>));
  if (!found) throw new Error("no such record");
  return found.seq;
}
const trace = (type: string, extra: (payload: Record<string, unknown>) => boolean = () => true) =>
  (record: Record<string, unknown>) => {
    const payload = record.payload as { type?: string; payload?: Record<string, unknown> } | undefined;
    return record.type === "captain_telemetry" && record.topic === "playbook.trace" &&
      payload?.type === type && extra(payload.payload ?? {});
  };

/** The commit a step's accepted transition carried. */
function committed(entries: readonly Entry[], source: string): string {
  const at = entries.findIndex((entry) => trace("outcome.accepted", (p) => p.source === source)(entry.record as never));
  for (let index = at; index >= 0; index -= 1) {
    const payload = (entries[index].record as unknown as { payload?: { type?: string; payload?: { event?: { output?: { latestCommit?: string } } } } }).payload;
    if (payload?.type === "fsm.transition") return payload.payload!.event!.output!.latestCommit!.slice(0, 7);
  }
  throw new Error("no transition");
}

function mount(entries: readonly Entry[], session: Partial<SessionInfo> = {}) {
  return mountView(fold(entries), session);
}

function mountView(view: SessionView, session: Partial<SessionInfo> = {}) {
  setClientForTests({ command: vi.fn(async () => ({})) } as never);
  useAppStore.setState({ collapsedLanes: {}, configState: undefined, ledger: undefined, stagedIntents: {} } as never);
  return render(
    <RunView
      session={{ ...SESSION, ...session }}
      view={view}
      composer={{ queued: [] }}
      connected
      onSubmit={async () => {}}
      onAbort={() => {}}
      onRemoveQueued={() => {}}
      onDismissError={() => {}}
    />,
  );
}

const texts = (testId: RegExp) => screen.queryAllByTestId(testId).map((node) => node.textContent);

describe("run-view-190: a /dev run that decides before it codes, live and stored", () => {
  test("a delegation line per call, naming its step, and the model at each player's first call", () => {
    mount(RUN);
    expect(texts(/^delegation-line-/)).toEqual([
      "AHanded to analyst · Choose the approach · claude · claude-opus-5-5",
      "CHanded to coder · Propose a design · claude · claude-opus-5-5",
      "RHanded to reviewer · Propose a design · codex · gpt-6-sol",
      "CHanded to coder · Merge the proposals",
      "RHanded to reviewer · Review",
      "CHanded to coder · Implement",
      "RHanded to reviewer · Review",
    ]);
  });

  test("a return line per call, with its accepted outcome, the runtime's commit and its reply's first line", () => {
    mount(RUN);
    const heads = screen.getAllByTestId(/^return-line-/).map((line) => ({
      head: within(line).getByTestId("return-head").textContent,
      identity: within(line).queryAllByTestId("return-identity").map((node) => node.textContent),
      first: within(line).queryByTestId("return-first-line")?.textContent,
      state: line.dataset.state,
    }));
    expect(heads.map((line) => [line.head, line.identity, line.state])).toEqual([
      ["← analyst chose /decide, then /code", [], "accepted"],
      ["← coder proposed a design", [], "accepted"],
      ["← reviewer proposed a design", [], "accepted"],
      ["← coder committed", [committed(RUN, "synthesizeCommit")], "accepted"],
      ["← reviewer found no problems", [committed(RUN, "synthesizeCommit")], "accepted"],
      ["← coder committed", [committed(RUN, "firstPhase")], "accepted"],
      ["← reviewer found no problems", [committed(RUN, "firstPhase")], "accepted"],
    ]);
    expect(heads[3].first).toBe("Added DR-001 for the 404 page and committed it as one commit.");
  });

  test("each call on its lane names its playbook and step, the whole path in its tooltip", () => {
    mount(RUN);
    const coder = screen.getByTestId("player-pane-dev.coder");
    const labels = within(coder).getAllByTestId(/^call-label-/);
    expect(labels.map((label) => label.textContent)).toEqual([
      "decide › Propose a design",
      "decide › Merge the proposals",
      "code › Implement",
    ]);
    expect(labels[1].getAttribute("title")).toBe("dev › decide › Merge the proposals");
  });

  test("the parallel proposals stand together: both steps running with their players, both chips in the strip", () => {
    // Both proposal calls open, neither back yet.
    const both = seqOf(RUN, (record) => record.type === "player_prompt" && record.playerId === "dev.reviewer");
    mount(upTo(RUN, both), { turnActive: true });
    const decide = screen.getAllByTestId(/^machine-card-/).find((node) => node.dataset.playbook === "decide")!;
    const running = within(decide).getAllByTestId(/^machine-performer-/).filter((mark) => mark.dataset.running === "true");
    expect(running.map((mark) => mark.dataset.player).sort()).toEqual(["dev.coder", "dev.reviewer"]);
    const active = within(decide).getAllByTestId(/^machine-state-/).filter((node) => node.dataset.active === "true");
    expect(active.map((node) => node.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("ask coder proposal"), expect.stringContaining("ask reviewer proposal")]),
    );
    expect(texts(/^dispatch-chip-/).map((text) => text?.replace(/ · [^·]*running$/u, " · Nrunning"))).toEqual([
      "Ccoder · Propose a design · Nrunning",
      "Rreviewer · Propose a design · Nrunning",
    ]);
  });

  test("a call back but not yet judged says so, and its outcome and commit follow", () => {
    const back = seqOf(RUN, trace("player.call.finished", (p) => p.stateId === "synthesizeCommit"));
    mount(upTo(RUN, back), { turnActive: true });
    const line = screen.getAllByTestId("return-line-dev.coder").at(-1)!;
    expect(line.dataset.state).toBe("judging");
    expect(within(line).getByTestId("return-head").textContent).toBe("← coder handed back");
    expect(within(line).queryAllByTestId("return-identity")).toHaveLength(0);
  });

  test("activating a delegation line brings its lane to that call, and the call's label leads back", () => {
    mount(RUN);
    fireEvent.click(screen.getAllByTestId("delegation-line-dev.coder")[1]);
    const pane = (Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mock.contexts.at(-1) as HTMLElement;
    expect(pane.dataset.testid).toBe("player-pane-dev.coder");
    const label = within(screen.getByTestId("player-pane-dev.coder")).getAllByTestId(/^call-label-/)[1];
    fireEvent.click(label);
    const dispatch = screen.getAllByTestId("delegation-line-dev.coder")[1];
    expect(dispatch.dataset.flash).toBe("1");
  });

  test("records taken one at a time, as live, draw what the stored session draws", () => {
    let live = initialSessionView(PLAYERS);
    for (const entry of RUN) live = applyRecords(live, [{ ...entry }]);
    const shape = (view: SessionView) => ({
      lines: view.captain.map((line) => [line.kind, line.callKey, line.delegation?.showRuns]),
      calls: view.stepCalls.calls,
      frames: view.frames,
    });
    expect(shape(live)).toEqual(shape(fold(RUN)));
    const drawn = () => [...texts(/^delegation-line-/), ...texts(/^return-line-/), ...texts(/^call-label-/)];
    mount(RUN);
    const stored = drawn();
    cleanup();
    mountView(live);
    expect(drawn()).toEqual(stored);
  });

  test("a line's parts stay apart in its accessible name", () => {
    mount(RUN);
    expect(screen.getByRole("button", { name: "Handed to coder, Merge the proposals" }).dataset.testid)
      .toBe("delegation-line-dev.coder");
    const merged = committed(RUN, "synthesizeCommit");
    expect(screen.getByRole("button", { name: `← coder committed ${merged}, <1s` })).toBeTruthy();
  });
});

describe("run-view-190: the same run in Chinese", () => {
  afterEach(() => activateLanguage("en"));

  test("the step and outcome words, the strip and the lane's place read in Chinese", () => {
    activateLanguage("zh");
    mount(RUN);
    expect(texts(/^delegation-line-/)[3]).toBe("C交给 coder · 合并方案");
    const merge = screen.getAllByTestId("return-line-dev.coder")[1];
    expect(within(merge).getByTestId("return-head").textContent).toBe("← coder 已提交");
    const coder = screen.getByTestId("player-pane-dev.coder");
    expect(within(coder).getAllByTestId(/^call-label-/).map((label) => label.textContent))
      .toEqual(["decide › 写方案", "decide › 合并方案", "code › 实现"]);
  });
});

describe("run-view-191: a Boss abort reads aborted, and only where it landed", () => {
  test("the run, its card, its notice and the chip read aborted; the call stopped reads aborted; the call back reads unconfirmed", () => {
    mount(ABORT);
    const decide = screen.getAllByTestId(/^machine-card-/).find((node) => node.dataset.playbook === "decide")!;
    expect(within(decide).getByTestId(/^machine-outcome-/).dataset.status).toBe("aborted");
    // Its caller, waiting on it, reads aborted too: no card is left running.
    const dev = screen.getAllByTestId(/^machine-card-/).find((node) => node.dataset.playbook === "dev")!;
    expect(dev.querySelector('[data-testid^="machine-outcome-"]')!.getAttribute("data-status")).toBe("aborted");
    expect(screen.getByTestId("state-chip").textContent).toBe("aborted");
    const notice = screen.getByTestId("failed-workflow");
    expect(notice.dataset.aborted).toBe("true");
    expect(notice.textContent).not.toMatch(/failed/u);
    expect(screen.getByTestId("failure-card").dataset.aborted).toBe("true");
    // The runtime's own error repeating the stop is no failure line.
    expect(screen.queryAllByTestId("failure-line")).toHaveLength(0);
    const reviewer = screen.getByTestId("return-line-dev.reviewer");
    expect(reviewer.dataset.state).toBe("aborted");
    expect(within(reviewer).getByTestId("return-head").textContent).toBe("← reviewer aborted");
    // The coder came back before the stop; its outcome was never judged.
    const coder = screen.getByTestId("return-line-dev.coder");
    expect(coder.dataset.state).toBe("unconfirmed");
    expect(within(coder).getByTestId("return-head").textContent).toBe("← coder handed back");
  });
});

// --- Cases a recording cannot pose ------------------------------------------

const t0 = 1_700_000_000_000;
let sequence = 0;
const rec = (seq: number, record: Record<string, unknown>): Entry =>
  ({ seq, record: { turnId: 1, timestamp: t0 + seq * 1000, ...record } as unknown as TmuxPlayRecord });
const traced = (seq: number, sessionId: string, playbookId: string, type: string, payload: Record<string, unknown>, callId?: string) =>
  rec(seq, {
    type: "captain_telemetry",
    topic: "playbook.trace",
    payload: { schemaVersion: 4, sessionId, playbookId, rootSessionId: sessionId, depth: 0, sequence: ++sequence, type, ...(callId ? { callId } : {}), payload },
  });
const started = (seq: number, s: string, p: string, stateId: string, role: string, playerId: string, callId: string) =>
  traced(seq, s, p, "player.call.started", { stateId, roleId: role, playerId, prompt: "go" }, callId);
const ended = (seq: number, s: string, p: string, stateId: string, callId: string, status = "ok", finalText = "Done.") =>
  traced(seq, s, p, "player.call.finished", { stateId, status, finalText }, callId);
const moved = (seq: number, s: string, p: string, from: unknown, to: unknown, output: Record<string, unknown> = {}, status = "active") =>
  traced(seq, s, p, "fsm.transition", { from, to, event: { type: "x", output }, state: { value: to, status, activeStateIds: [typeof to === "string" ? to : "x"] } });
const accepted = (seq: number, s: string, p: string, source: string, outcome: string) =>
  traced(seq, s, p, "outcome.accepted", { source, target: "next", acceptedOutcome: outcome });
const emitted = (seq: number, s: string, p: string) => traced(seq, s, p, "status.emitted", { message: "→" });
const promptOf = (seq: number, playerId: string) => rec(seq, { type: "player_prompt", playerId, prompt: "go" });
const finishOf = (seq: number, playerId: string) => rec(seq, { type: "player_finished", playerId, result: { status: "ok" } });

/** A record read under the session context recorded at `contextSeq`. */
const inContext = (entry: Entry, contextSeq: number): Entry =>
  ({ ...entry, record: { ...entry.record, contextSeq } as unknown as TmuxPlayRecord });

const returnState = () => screen.getAllByTestId(/^return-line-/).map((line) => [line.dataset.testid, line.dataset.state, within(line).getByTestId("return-head").textContent]);

describe("run-view-192: outcomes reach their own calls", () => {
  test("a step walked twice: each round's line takes its own round's outcome, its label its round", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/review" } }),
      started(2, "r", "review", "firstReview", "reviewer", "dev.reviewer", "player-1"), promptOf(3, "dev.reviewer"), finishOf(4, "dev.reviewer"),
      ended(5, "r", "review", "firstReview", "player-1"),
      moved(6, "r", "review", "firstReview", "fixFindings"), accepted(7, "r", "review", "firstReview", "hasFindings"), emitted(8, "r", "review"),
      started(9, "r", "review", "fixFindings", "coder", "dev.coder", "player-2"), promptOf(10, "dev.coder"), finishOf(11, "dev.coder"),
      ended(12, "r", "review", "fixFindings", "player-2"),
      moved(13, "r", "review", "fixFindings", "firstReview", { latestCommit: "abcdef0123456789" }), accepted(14, "r", "review", "fixFindings", "committed"), emitted(15, "r", "review"),
      started(16, "r", "review", "firstReview", "reviewer", "dev.reviewer", "player-3"), promptOf(17, "dev.reviewer"), finishOf(18, "dev.reviewer"),
      ended(19, "r", "review", "firstReview", "player-3"),
      moved(20, "r", "review", "firstReview", "done", { evaluatedRevision: "abcdef0123456789" }, "done"), accepted(21, "r", "review", "firstReview", "noFindings"), emitted(22, "r", "review"),
    ]);
    expect(returnState()).toEqual([
      ["return-line-dev.reviewer", "accepted", "← reviewer found problems"],
      ["return-line-dev.coder", "accepted", "← coder committed"],
      ["return-line-dev.reviewer", "accepted", "← reviewer found no problems"],
    ]);
    const reviewer = screen.getByTestId("player-pane-dev.reviewer");
    expect(within(reviewer).getAllByTestId(/^call-label-/).map((label) => label.textContent))
      .toEqual(["review › Review", "review › Review, round 2"]);
  });

  test("branches ending apart each take their own step's outcome, a sibling's new call cutting off neither", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/decide" } }),
      started(2, "d", "decide", "askReviewerProposal", "reviewer", "dev.reviewer", "player-1"), promptOf(3, "dev.reviewer"),
      started(4, "d", "decide", "askCoderProposal", "coder", "dev.coder", "player-2"), promptOf(5, "dev.coder"),
      finishOf(6, "dev.coder"), ended(7, "d", "decide", "askCoderProposal", "player-2"),
      moved(8, "d", "decide", "x", "y"), accepted(9, "d", "decide", "askCoderProposal", "proposed"), emitted(10, "d", "decide"),
      finishOf(11, "dev.reviewer"), ended(12, "d", "decide", "askReviewerProposal", "player-1"),
      moved(13, "d", "decide", "y", "synthesizeCommit"), accepted(14, "d", "decide", "askReviewerProposal", "proposed"), emitted(15, "d", "decide"),
    ]);
    expect(returnState()).toEqual([
      ["return-line-dev.coder", "accepted", "← coder proposed a design"],
      ["return-line-dev.reviewer", "accepted", "← reviewer proposed a design"],
    ]);
  });

  test("one transition accepting two outcomes words each line and names no commit on either", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/decide" } }),
      started(2, "d", "decide", "askCoderProposal", "coder", "dev.coder", "player-1"), promptOf(3, "dev.coder"),
      started(4, "d", "decide", "askReviewerProposal", "reviewer", "dev.reviewer", "player-2"), promptOf(5, "dev.reviewer"),
      finishOf(6, "dev.coder"), ended(7, "d", "decide", "askCoderProposal", "player-1"),
      finishOf(8, "dev.reviewer"), ended(9, "d", "decide", "askReviewerProposal", "player-2"),
      moved(10, "d", "decide", "x", "synthesizeCommit", { latestCommit: "abcdef0123456789" }),
      // Another run's record and the state telemetry come between, and seal nothing.
      traced(11, "other", "code", "status.emitted", { message: "→" }),
      rec(12, { type: "captain_telemetry", topic: "playbook.fsm.state", payload: { to: "synthesizeCommit" } }),
      accepted(13, "d", "decide", "askCoderProposal", "proposed"), accepted(14, "d", "decide", "askReviewerProposal", "proposed"), emitted(15, "d", "decide"),
    ]);
    expect(returnState().map(([, state, head]) => [state, head])).toEqual([
      ["accepted", "← coder proposed a design"],
      ["accepted", "← reviewer proposed a design"],
    ]);
    expect(screen.queryAllByTestId("return-identity")).toHaveLength(0);
  });

  test("a batch never sealed words its outcome and names no commit", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/code" } }),
      started(2, "c", "code", "firstPhase", "coder", "dev.coder", "player-1"), promptOf(3, "dev.coder"), finishOf(4, "dev.coder"),
      ended(5, "c", "code", "firstPhase", "player-1"),
      moved(6, "c", "code", "firstPhase", "reviewNewIntentPhase", { latestCommit: "abcdef0123456789" }), accepted(7, "c", "code", "firstPhase", "directCommit"),
    ], { turnActive: true });
    expect(within(screen.getByTestId("return-line-dev.coder")).getByTestId("return-head").textContent).toBe("← coder committed");
    expect(screen.queryAllByTestId("return-identity")).toHaveLength(0);
  });

  test("a run that ends with no outcome for a call leaves it unconfirmed, never judging", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/decide" } }),
      started(2, "d", "decide", "synthesizeCommit", "coder", "dev.coder", "player-1"), promptOf(3, "dev.coder"), finishOf(4, "dev.coder"),
      ended(5, "d", "decide", "synthesizeCommit", "player-1"),
      moved(6, "d", "decide", "synthesizeCommit", "askCoderProposal"), emitted(7, "d", "decide"),
      traced(8, "d", "decide", "session.disposed", { state: { status: "active" } }),
      rec(9, { type: "turn_finished" }),
    ]);
    expect(screen.getByTestId("return-line-dev.coder").dataset.state).toBe("unconfirmed");
  });

  test("a judgment that fails leaves the call's line failed, not judging or unconfirmed", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/dev" } }),
      started(2, "v", "dev", "planAnalysis", "analyst", "dev.analyst", "player-1"), promptOf(3, "dev.analyst"), finishOf(4, "dev.analyst"),
      ended(5, "v", "dev", "planAnalysis", "player-1"),
      traced(6, "v", "dev", "fsm.transition", { from: "planAnalysis", to: "failed", event: { type: "x" }, state: { value: "failed", status: "active", activeStateIds: ["failed"] }, lastError: { message: "judge transport failed", cause: { code: "judge-failed" } } }),
      emitted(7, "v", "dev"),
    ]);
    expect(screen.getByTestId("return-line-dev.analyst").dataset.state).toBe("failed");
  });

  test("a question to the Boss waits for him on its line", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/code" } }),
      started(2, "c", "code", "firstPhase", "coder", "dev.coder", "player-1"), promptOf(3, "dev.coder"), finishOf(4, "dev.coder"),
      ended(5, "c", "code", "firstPhase", "player-1", "ok", "Should I migrate the archived sessions too?"),
      moved(6, "c", "code", "firstPhase", "awaitBossReply"), accepted(7, "c", "code", "firstPhase", "needsBossReply"), emitted(8, "c", "code"),
      rec(9, { type: "captain_telemetry", topic: "playbook.fsm.state", payload: { to: "awaitBossReply", pendingBossQuestion: { question: "Should I migrate the archived sessions too?", asker: { kind: "role", roleId: "coder" } } } }),
    ]);
    const line = screen.getByTestId("return-line-dev.coder");
    expect(line.dataset.state).toBe("waiting");
    expect(within(line).getByTestId("return-head").textContent).toBe("← coder asks you");
    // The question itself reaches the Boss in the Captain's words alone.
    expect(within(line).queryByTestId("return-first-line")).toBeNull();
    expect(line.textContent).not.toContain("archived sessions");
  });

  test("a call that fails before its player records anything puts a line that leads nowhere, and no return line", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/code" } }),
      started(2, "c", "code", "firstPhase", "coder", "dev.coder", "player-1"),
      ended(3, "c", "code", "firstPhase", "player-1", "error"),
    ]);
    const line = screen.getByTestId("delegation-line-dev.coder");
    expect(line.tagName).not.toBe("BUTTON");
    expect(line.textContent).toBe("CHanded to coder · Implement");
    expect(screen.queryAllByTestId(/^return-line-/)).toHaveLength(0);
    expect(screen.queryByTestId("player-pane-dev.coder")).toBeNull();
  });

  test("a playbook of one's own reads its step and outcome ids as words and names no commit", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/ship" } }),
      started(2, "s", "ship", "draftNotes", "writer", "dev.coder", "player-1"), promptOf(3, "dev.coder"), finishOf(4, "dev.coder"),
      ended(5, "s", "ship", "draftNotes", "player-1"),
      moved(6, "s", "ship", "draftNotes", "done", { latestCommit: "abcdef0123456789" }), accepted(7, "s", "ship", "draftNotes", "notesDrafted"), emitted(8, "s", "ship"),
    ]);
    expect(screen.getByTestId("delegation-line-dev.coder").textContent).toContain("Handed to coder · draft notes");
    expect(within(screen.getByTestId("return-line-dev.coder")).getByTestId("return-head").textContent).toBe("← coder notes drafted");
    expect(screen.queryAllByTestId("return-identity")).toHaveLength(0);
  });
});

describe("run-view-192: batches, lost calls and stops kept apart", () => {
  test("another run's transition between a transition and its outcome leaves its commit to its own call", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/code" } }),
      started(2, "c", "code", "firstPhase", "coder", "dev.coder", "player-1"), promptOf(3, "dev.coder"), finishOf(4, "dev.coder"),
      ended(5, "c", "code", "firstPhase", "player-1"),
      moved(6, "c", "code", "firstPhase", "reviewNewIntentPhase", { latestCommit: "abcdef0123456789" }),
      moved(7, "r", "review", "start", "firstReview"),
      traced(8, "r", "review", "session.disposed", { state: { status: "active" } }),
      accepted(9, "c", "code", "firstPhase", "directCommit"), emitted(10, "c", "code"),
    ], { turnActive: true });
    const line = screen.getByTestId("return-line-dev.coder");
    expect(within(line).getByTestId("return-head").textContent).toBe("← coder committed");
    expect(within(line).getAllByTestId("return-identity").map((node) => node.textContent)).toEqual(["abcdef0"]);
  });

  test("a transition accepting an outcome no call takes beside one a call takes names no commit", () => {
    sequence = 0;
    mount([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/code" } }),
      started(2, "c", "code", "firstPhase", "coder", "dev.coder", "player-1"), promptOf(3, "dev.coder"), finishOf(4, "dev.coder"),
      ended(5, "c", "code", "firstPhase", "player-1"),
      moved(6, "c", "code", "firstPhase", "reviewNewIntentPhase", { latestCommit: "abcdef0123456789" }),
      accepted(7, "c", "code", "firstPhase", "directCommit"), accepted(8, "c", "code", "otherBranch", "done"), emitted(9, "c", "code"),
    ]);
    expect(within(screen.getByTestId("return-line-dev.coder")).getByTestId("return-head").textContent).toBe("← coder committed");
    expect(screen.queryAllByTestId("return-identity")).toHaveLength(0);
  });

  test("a call the process died in runs no more after the restore, and the player's next prompt goes to its next call", () => {
    sequence = 0;
    const view = fold([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/code" } }),
      started(2, "c", "code", "firstPhase", "coder", "dev.coder", "player-1"),
      rec(3, { type: "captain_telemetry", topic: "spex.session.restored", payload: { runs: [] } }),
      started(4, "c2", "code", "firstPhase", "coder", "dev.coder", "player-1"), promptOf(5, "dev.coder"),
    ]);
    expect(view.stepCalls.calls.map((call) => [call.key, call.status, call.promptSeq])).toEqual([
      ["c#player-1", "lost", undefined],
      ["c2#player-1", "running", 5],
    ]);
  });

  test("a runtime failure ending its turn with its own error keeps its failure line", () => {
    sequence = 0;
    const view = fold([
      rec(1, { type: "turn_started", turn: { id: 1, prompt: "/code" } }),
      rec(2, { type: "runtime_error", message: "provider unreachable" }),
      rec(3, { type: "turn_aborted", reason: "provider unreachable" }),
    ]);
    expect(view.captain.map((line) => line.kind)).toEqual(["boss", "error", "status"]);
  });


  test("a step not called yet wears the player its run was bound to, not a later binding", () => {
    const graph = {
      initial: "firstReview",
      nodes: [
        { id: "firstReview", kind: "state", tags: [], role: "reviewer" },
        { id: "fixFindings", kind: "state", tags: [], role: "coder" },
        { id: "done", kind: "final", tags: [] },
      ],
      edges: [
        { id: "e1", from: "firstReview", to: "fixFindings", event: "hasFindings" },
        { id: "e2", from: "fixFindings", to: "done", event: "committed" },
      ],
    };
    const bound = (coder: string) => ({ catalog: { review: { roles: { coder: { playerId: coder }, reviewer: { playerId: "dev.reviewer" } } } } });
    sequence = 0;
    mount([
      rec(1, { type: "session_context", contextVersion: 1, graphs: [{ playbookId: "review", graph }], configuration: bound("dev.coder") }),
      rec(2, { type: "turn_started", turn: { id: 1, prompt: "/review" } }),
      inContext(started(3, "r", "review", "firstReview", "reviewer", "dev.reviewer", "player-1"), 1),
      rec(4, { type: "session_context", contextVersion: 1, graphs: [{ playbookId: "review", graph }], configuration: bound("dev.other") }),
    ]);
    const marks = screen.getAllByTestId(/^machine-performer-/).map((mark) => mark.dataset.player);
    expect(marks).toContain("dev.coder");
    expect(marks).not.toContain("dev.other");
  });
});

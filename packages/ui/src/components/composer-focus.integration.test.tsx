// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import {afterEach, beforeEach, expect, test} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {RunView} from "./RunView.js";
import {initialSessionView, type SessionView} from "../state/reducer.js";
import {useAppStore} from "../state/store.js";
import {INITIAL_VISIBLE, PLAYERS} from "../fixtures/sample-run.js";

const session = {
  id: "focus-session", projectId: "p1", projectPath: "/tmp/demo", createdAt: 0,
  live: true, endedAt: null, players: PLAYERS, initialVisible: INITIAL_VISIBLE,
  turns: 1, failed: false,
};
const props = {
  session, composer: {queued: []}, connected: true, onSubmit: async () => {},
  onAbort: () => {}, onRemoveQueued: () => {}, onDismissError: () => {},
};
const question = {pendingQuestion: "Migrate the legacy sessions?", pendingQuestionPlayer: "dev.coder"};
let previous: ReturnType<typeof useAppStore.getState>;
beforeEach(() => {
  previous = useAppStore.getState();
  useAppStore.setState({collapsedLanes: {}, ledger: undefined, stagedIntents: {}});
});
afterEach(() => {
  cleanup();
  useAppStore.setState(previous, true);
});

function collapseReviewer(): HTMLElement {
  fireEvent.click(screen.getByRole("button", {name: "Collapse dev.reviewer"}));
  const expand = screen.getByRole("button", {name: "Expand dev.reviewer"});
  expect(document.activeElement).toBe(expand);
  return expand;
}

test.each(["question", "settlement"])("run-view-24: late %s preserves the selected lane control", (transition) => {
  const before: SessionView = {...initialSessionView(PLAYERS),
    ...(transition === "settlement" ? {...question, turnActive: true} : {})};
  const {rerender} = render(<RunView {...props} view={before} />);
  const expand = collapseReviewer();
  rerender(<RunView {...props} view={{...before, ...question, turnActive: false}} />);
  expect((screen.getByTestId("boss-composer") as HTMLTextAreaElement).disabled).toBe(false);
  expect(document.activeElement).toBe(expand);
});

test.each(["success", "refusal"])("run-view-24: delayed submission %s preserves the selected lane control", async (outcome) => {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const pending = new Promise<void>((done, fail) => {resolve = done; reject = fail;});
  render(<RunView {...props} view={initialSessionView(PLAYERS)} onSubmit={() => pending} />);
  const field = screen.getByTestId("boss-composer");
  expect(document.activeElement).toBe(field);
  fireEvent.change(field, {target: {value: "Continue the review"}});
  fireEvent.keyDown(field, {key: "Enter"});
  const expand = collapseReviewer();
  await act(async () => {if (outcome === "success") resolve(); else reject(new Error("Turn is busy"));});
  expect(document.activeElement).toBe(expand);
});

test("run-view-24: settlement restores available input when focus is unclaimed", () => {
  const active = {...initialSessionView(PLAYERS), ...question, turnActive: true};
  const {rerender} = render(<RunView {...props} view={active} />);
  collapseReviewer().blur();
  expect(document.activeElement).toBe(document.body);
  rerender(<RunView {...props} view={{...active, turnActive: false}} />);
  expect(document.activeElement).toBe(screen.getByTestId("boss-composer"));
});

test("run-view-24: submission completion restores input when focus is unclaimed", async () => {
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => {complete = resolve;});
  render(<RunView {...props} view={initialSessionView(PLAYERS)} onSubmit={() => pending} />);
  const field = screen.getByTestId("boss-composer");
  fireEvent.change(field, {target: {value: "Continue the review"}});
  fireEvent.keyDown(field, {key: "Enter"});
  (field as HTMLTextAreaElement).blur();
  expect(document.activeElement).toBe(document.body);
  await act(async () => {complete();});
  expect(document.activeElement).toBe(field);
});


test.each([false, true])("run-view-94: a busy Drop hands off temporary focus unless the reader moved it (%s)", async (selectLane) => {
  useAppStore.setState({
    ledger: {intents: [{state: "working", intent: {
      id: "drop-intent", projectId: session.projectId, text: "Drop me midway", createdAt: 0,
      dispatched: {sessionId: session.id, turnId: 1, at: 1},
    }}], attention: [], badge: 0},
    closeIntent: async () => {useAppStore.setState({ledger: {intents: [], attention: [], badge: 0}});},
  });
  const active = {...initialSessionView(PLAYERS), turnActive: true};
  const {rerender} = render(<RunView {...props} view={active} />);
  fireEvent.click(screen.getByTestId("working-drop"));
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Drop"}));});
  const note = screen.getByTestId("working-note");
  expect(document.activeElement).toBe(note);
  expect((screen.getByTestId("boss-composer") as HTMLTextAreaElement).disabled).toBe(true);
  const selected = selectLane ? collapseReviewer() : undefined;
  rerender(<RunView {...props} view={{...active, turnActive: false}} />);
  expect(document.activeElement).toBe(selected ?? screen.getByTestId("boss-composer"));
});

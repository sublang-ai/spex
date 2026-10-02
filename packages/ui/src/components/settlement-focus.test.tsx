// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { afterEach, expect, test } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { SessionInfo, TmuxPlayRecord } from "@sublang/spex-core/protocol";
import { RunView } from "./RunView.js";
import { applyRecords, initialSessionView, type SessionView } from "../state/reducer.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { PLAYERS, TURN_TWO_QUESTION } from "../fixtures/sample-run.js";

const previous = useAppStore.getState();
afterEach(() => {
  cleanup();
  setClientForTests(undefined);
  useAppStore.setState(previous, true);
});

const session: SessionInfo = {
  id: "focus-session", projectId: "focus-project", projectPath: "/tmp/focus-project",
  createdAt: 0, live: true, endedAt: null, players: PLAYERS,
  initialVisible: PLAYERS.map((player) => player.id), turns: 1, failed: false,
};

function record(seq: number, fields: Record<string, unknown>) {
  return { seq, record: { turnId: 2, timestamp: seq, ...fields } as unknown as TmuxPlayRecord };
}

function conversation(view: SessionView, id = session.id) {
  return <RunView key={id} session={{ ...session, id }} view={view} composer={{ queued: [] }} connected
    onSubmit={async () => {}} onAbort={() => {}} onRemoveQueued={() => {}} onDismissError={() => {}} />;
}

function start(question = false) {
  useAppStore.setState({ collapsedLanes: {}, ledger: undefined, stagedIntents: {} });
  const view = applyRecords(initialSessionView(PLAYERS), question
    ? TURN_TWO_QUESTION.filter((entry) => entry.record.type !== "turn_finished")
    : [record(1, { type: "turn_started", turn: { id: 2, prompt: "Do the task" } })]);
  const rendered = render(conversation(view));
  const settle = () => {
    applyRecords(view, [record(999, { type: "turn_finished" })]);
    rendered.rerender(conversation(view));
  };
  return { view, settle, ...rendered };
}

test("run-view-165: settlement preserves an explicitly collapsed lane's focus", () => {
  const { view, settle } = start(true);
  expect(view.pendingQuestion).toBeDefined();
  expect(view.turnActive).toBe(true);
  const collapse = screen.getByRole("button", { name: "Collapse dev.reviewer" });
  act(() => collapse.focus());
  fireEvent.click(collapse);
  const expand = screen.getByRole("button", { name: "Expand dev.reviewer" });
  expect(document.activeElement).toBe(expand);
  settle();
  expect(document.activeElement).toBe(expand);
  expect((screen.getByTestId("boss-composer") as HTMLTextAreaElement).disabled).toBe(false);
});

test.each([false, true])("run-view-165: body focus returns to available input (question: %s)", (question) => {
  const { settle } = start(question);
  act(() => (document.activeElement as HTMLElement)?.blur());
  expect(document.activeElement).toBe(document.body);
  settle();
  expect(document.activeElement).toBe(screen.getByTestId("boss-composer"));
});

test("run-view-165: ordinary settlement preserves the composer draft and selection", () => {
  useAppStore.setState({ collapsedLanes: {}, ledger: undefined, stagedIntents: {} });
  const view = initialSessionView(PLAYERS);
  const { rerender } = render(conversation(view));
  const field = screen.getByTestId("boss-composer") as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: "Keep this draft" } });
  field.setSelectionRange(2, 7);
  applyRecords(view, [record(1, { type: "turn_started", turn: { id: 2, prompt: "Do the task" } })]);
  rerender(conversation(view));
  applyRecords(view, [record(2, { type: "turn_finished" })]);
  rerender(conversation(view));
  expect(document.activeElement).toBe(field);
  expect(field.value).toBe("Keep this draft");
  expect([field.selectionStart, field.selectionEnd]).toEqual([2, 7]);
});

test("run-view-165: settlement preserves the real agent editor's focused control", async () => {
  setClientForTests({ command: async () => ({
    adapter: "claude", effortValues: ["low", "high"], discovery: { status: "available", models: [] },
  }) } as never);
  useAppStore.setState({ configState: { status: "valid", seeded: false, summary: {
    path: "/tmp/focus-config.yaml", captain: { adapter: "claude", model: "fixture-model" },
    players: PLAYERS.map((player) => ({ id: player.id, agent: { adapter: player.adapter }, display: player.id, boundBy: [] })),
    playbooks: [],
  } } } as never);
  const { settle } = start(true);
  fireEvent.click(screen.getByTestId("agent-chip-captain"));
  const editor = await screen.findByTestId("agent-settings-captain");
  const control = within(editor).getByTestId("agent-captain-model-mode");
  act(() => control.focus());
  expect(document.activeElement).toBe(control);
  settle();
  expect(document.activeElement).toBe(control);
  expect(screen.getByTestId("agent-settings-captain")).toBe(editor);
});

test("run-view-165: explicit new conversation arrival still focuses its composer", () => {
  const { rerender } = start();
  const laneControl = screen.getByRole("button", { name: "Collapse dev.reviewer" });
  act(() => laneControl.focus());
  expect(document.activeElement).toBe(laneControl);
  rerender(conversation(initialSessionView(PLAYERS), "new-conversation"));
  expect(document.activeElement).toBe(screen.getByTestId("boss-composer"));
});

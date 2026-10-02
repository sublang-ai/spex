// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SessionInfo, TmuxPlayRecord } from "@sublang/spex-core/protocol";
import { RunView } from "./RunView.js";
import { applyRecords, initialSessionView } from "../state/reducer.js";
import { setClientForTests, useAppStore } from "../state/store.js";
import { PLAYERS } from "../fixtures/sample-run.js";

const previous = useAppStore.getState();
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setClientForTests(undefined);
  useAppStore.setState(previous, true);
});

const session: SessionInfo = {
  id: "drop-session", projectId: "drop-project", projectPath: "/tmp/drop-project",
  createdAt: 0, live: true, endedAt: null, players: PLAYERS,
  initialVisible: PLAYERS.map((player) => player.id), turns: 1, failed: false,
};

function record(seq: number, fields: Record<string, unknown>) {
  return { seq, record: { turnId: 1, timestamp: seq, ...fields } as unknown as TmuxPlayRecord };
}

async function dropWhileBusy() {
  const command = vi.fn(async (type: string) => type === "ledger.get"
    ? { intents: [], attention: [], badge: 0 } : {});
  setClientForTests({ command } as never);
  useAppStore.setState({ collapsedLanes: {}, stagedIntents: {}, ledger: {
    intents: [{ intent: { id: "drop-intent", projectId: session.projectId, text: "Drop me midway",
      rank: "m", createdAt: 0, dispatched: { sessionId: session.id, turnId: 1, at: 0 } }, state: "working" }],
    attention: [], badge: 0,
  } });
  const view = applyRecords(initialSessionView(PLAYERS), [record(1, {
    type: "turn_started", turn: { id: 1, prompt: "Drop me midway" },
  })]);
  const conversation = () => <RunView session={session} view={view} composer={{ queued: [] }} connected
    onSubmit={async () => {}} onAbort={() => {}} onRemoveQueued={() => {}} onDismissError={() => {}} />;
  const rendered = render(conversation());
  const field = screen.getByTestId("boss-composer") as HTMLTextAreaElement;
  expect(field.disabled).toBe(true);
  fireEvent.click(screen.getByTestId("working-drop"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Drop$/ })));
  expect(command).toHaveBeenCalledWith("intent.close", { intentId: "drop-intent", as: "dropped" });
  expect(screen.queryByTestId("working-line")).toBeNull();
  const note = screen.getByTestId("working-note");
  expect(document.activeElement).toBe(note);
  const settle = () => {
    applyRecords(view, [record(2, { type: "turn_finished" })]);
    rendered.rerender(conversation());
    expect(field.disabled).toBe(false);
  };
  return { note, field, settle };
}

test("run-view-115: busy Drop hands notice focus to the composer when the turn settles", async () => {
  vi.useFakeTimers();
  const { field, settle } = await dropWhileBusy();
  settle();
  expect(document.activeElement).toBe(field);
  act(() => vi.advanceTimersByTime(6_000));
  expect(screen.queryByTestId("working-note")).toBeNull();
  expect(document.activeElement).toBe(field);
});

test("run-view-115: Drop never takes back a lane control chosen while its notice stood", async () => {
  vi.useFakeTimers();
  const { field, settle } = await dropWhileBusy();
  const control = screen.getByRole("button", { name: "Collapse dev.reviewer" });
  act(() => control.focus());
  settle();
  expect(document.activeElement).toBe(control);
  act(() => vi.advanceTimersByTime(6_000));
  expect(screen.queryByTestId("working-note")).toBeNull();
  expect(document.activeElement).toBe(control);
  expect(field.disabled).toBe(false);
});

test("run-view-115: a busy notice may expire before ordinary settlement readies the composer", async () => {
  vi.useFakeTimers();
  const { field, settle } = await dropWhileBusy();
  act(() => vi.advanceTimersByTime(6_000));
  expect(screen.queryByTestId("working-note")).toBeNull();
  expect(field.disabled).toBe(true);
  expect(document.activeElement).toBe(document.body);
  settle();
  expect(document.activeElement).toBe(field);
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";
import test from "node:test";
import { successfulInspectionText } from "./inspection-evidence.mjs";

const prompt = (playerId = "inspector", turnId = 2) => ({ type: "player_prompt", playerId, turnId, prompt: "Read the supplied image" });
const event = (type, payload, playerId = "inspector", turnId = 2) => ({ type: "player_event", playerId, turnId, event: { type, agent: "codex", payload } });
const text = (content, playerId, turnId) => event("text", { content }, playerId, turnId);

test("Codex-shaped native text and a successful terminal prove the same invocation without done.result", () => {
  const records = [text("old answer"), prompt(), text("Parcel reference: "), text("ORCHID89ABCDEF"), event("done", { status: "success", usage: {} })];
  assert.equal(successfulInspectionText(records, "inspector", 2), "Parcel reference: ORCHID89ABCDEF");
});

test("Claude-shaped optional terminal summaries never duplicate or replace visible evidence", () => {
  const records = [prompt(), text("ORCHID89ABCDEF"), event("done", { status: "success", result: "different optional summary" })];
  for (const record of records) if (record.event) record.event.agent = "claude";
  assert.equal(successfulInspectionText(records, "inspector", 2), "ORCHID89ABCDEF");
  assert.throws(() => successfulInspectionText([prompt(), event("done", { status: "success", result: "ORCHID89ABCDEF" })], "inspector", 2), /native visible text/);
});

test("declared native agent/session conflicts and errors cannot be combined with a success", () => {
  const records = [prompt(), text("ORCHID89ABCDEF"), event("done", { status: "success" })];
  records[1].event.sessionId = "native-a";
  records[2].event.sessionId = "native-b";
  assert.throws(() => successfulInspectionText(records, "inspector", 2), /mix declared native sessions/);
  records[2].event.sessionId = "native-a";
  assert.equal(successfulInspectionText(records, "inspector", 2), "ORCHID89ABCDEF");
  records[2].event.agent = "claude";
  assert.throws(() => successfulInspectionText(records, "inspector", 2), /mix native agents/);
  assert.throws(() => successfulInspectionText([prompt(), text("ORCHID89ABCDEF"), event("error", { message: "transport failed" }), event("done", { status: "success" })], "inspector", 2), /native error/);
});

test("other actors, prior turns, hidden text and prompts cannot supply the visual answer", () => {
  const records = [prompt("inspector", 1), text("ORCHID89ABCDEF", "inspector", 1), event("done", { status: "success" }, "inspector", 1),
    prompt(), prompt("other"), text("ORCHID89ABCDEF", "other"), event("done", { status: "success" }, "other"),
    event("thinking", { content: "ORCHID89ABCDEF" }), text("actual visible answer"), event("done", { status: "success" })];
  assert.equal(successfulInspectionText(records, "inspector", 2), "actual visible answer");
});

test("failed, unfinished, duplicate, late and ambiguous invocations cannot satisfy perception", () => {
  for (const status of ["error", "cancelled"]) assert.throws(() => successfulInspectionText([
    prompt(), text("ORCHID89ABCDEF"), event("done", { status })], "inspector", 2), /must succeed/);
  assert.throws(() => successfulInspectionText([prompt(), text("ORCHID89ABCDEF")], "inspector", 2), /one native terminal/);
  assert.throws(() => successfulInspectionText([prompt(), text("ORCHID89ABCDEF"), event("done", { status: "success" }), event("done", { status: "success" })], "inspector", 2), /one native terminal/);
  assert.throws(() => successfulInspectionText([prompt(), event("done", { status: "success" }), text("ORCHID89ABCDEF")], "inspector", 2), /Text after/);
  assert.throws(() => successfulInspectionText([prompt(), text("old"), event("done", { status: "success" }), prompt(), text("new"), event("done", { status: "success" })], "inspector", 2), /exactly one working invocation/);
  assert.throws(() => successfulInspectionText([text("ORCHID89ABCDEF"), event("done", { status: "success" })], "inspector", 2), /exactly one working invocation/);
});

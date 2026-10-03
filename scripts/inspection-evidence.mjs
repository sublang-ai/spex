// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import assert from "node:assert/strict";

// This acceptance has one working invocation per actor/turn. Native visible
// text is portable; a provider's optional done.result is not that contract.
export function successfulInspectionText(records, playerId, turnId) {
  const starts = records.flatMap((record, index) => record.type === "player_prompt" &&
    record.playerId === playerId && record.turnId === turnId ? [index] : []);
  assert.equal(starts.length, 1, "Inspection evidence requires exactly one working invocation");
  const events = records.slice(starts[0] + 1).filter((record) => record.type === "player_event" &&
    record.playerId === playerId && record.turnId === turnId).map((record) => record.event);
  const agents = [...new Set(events.map((event) => event.agent))];
  assert.ok(agents.length === 1 && typeof agents[0] === "string", "Inspection evidence cannot mix native agents");
  const sessions = new Set(events.map((event) => event.sessionId).filter((id) => id !== undefined));
  assert.ok(sessions.size <= 1, "Inspection evidence cannot mix declared native sessions");
  assert.ok(!events.some((event) => event.type === "error"), "A native error cannot prove successful perception");
  const terminals = events.filter((event) => event.type === "done");
  assert.equal(terminals.length, 1, "Inspection evidence requires one native terminal");
  assert.equal(terminals[0].payload.status, "success", "Inspection's native invocation must succeed");
  const terminalIndex = events.indexOf(terminals[0]);
  assert.ok(!events.slice(terminalIndex + 1).some((event) => event.type === "text"), "Text after a terminal cannot prove its invocation");
  const text = events.slice(0, terminalIndex).filter((event) => event.type === "text").map((event) => {
    assert.equal(typeof event.payload.content, "string");
    return event.payload.content;
  }).join("");
  assert.ok(text.trim(), "Inspection evidence requires native visible text");
  return text;
}

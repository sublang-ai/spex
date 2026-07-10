// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCommand, PROTOCOL_VERSION } from "./protocol.js";

test("protocol version is a positive integer", () => {
  assert.ok(Number.isInteger(PROTOCOL_VERSION) && PROTOCOL_VERSION >= 1);
});

test("parseCommand accepts a valid command from JSON text", () => {
  const parsed = parseCommand(
    JSON.stringify({ type: "turn.submit", id: "c1", sessionId: "s1", text: "go" }),
  );
  assert.ok(parsed.ok);
  if (parsed.ok) {
    assert.equal(parsed.command.type, "turn.submit");
    assert.equal(parsed.command.id, "c1");
  }
});

test("parseCommand accepts subscribe with a channel", () => {
  const parsed = parseCommand({
    type: "subscribe",
    id: "c2",
    channel: { kind: "debug", sessionId: "s1" },
  });
  assert.ok(parsed.ok);
});

test("parseCommand rejects non-JSON text without a state change", () => {
  const parsed = parseCommand("{nope");
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.match(parsed.error, /JSON/);
});

test("parseCommand rejects unknown command types but recovers the id", () => {
  const parsed = parseCommand({ type: "definitely.not.a.command", id: "c3" });
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.equal(parsed.id, "c3");
});

test("parseCommand rejects missing required fields", () => {
  const parsed = parseCommand({ type: "turn.submit", id: "c4", sessionId: "s1" });
  assert.ok(!parsed.ok);
  if (!parsed.ok) assert.match(parsed.error, /text/);
});

test("parseCommand rejects empty submission text", () => {
  const parsed = parseCommand({
    type: "turn.submit",
    id: "c5",
    sessionId: "s1",
    text: "",
  });
  assert.ok(!parsed.ok);
});

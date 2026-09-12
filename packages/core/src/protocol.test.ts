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

test("parseCommand accepts the space commands and their optional fields", () => {
  const ok = [
    { type: "space.get", id: "s1" },
    { type: "space.init", id: "s2", remote: "/tmp/bare.git" },
    { type: "space.remote.set", id: "s3", url: null },
    { type: "space.fetch", id: "s4" },
    { type: "space.sync", id: "s5", choices: { "sessions/a": "remote" }, join: true },
    { type: "space.cancel", id: "s6" },
    { type: "space.diff", id: "s7", unit: ".gitignore", path: ".gitignore", side: "mine" },
    { type: "space.tree", id: "s8" },
    { type: "space.read", id: "s9", path: "projects.json" },
  ];
  for (const command of ok) {
    const parsed = parseCommand(command);
    assert.ok(parsed.ok, `${command.type}: ${parsed.ok ? "" : parsed.error}`);
  }
});

test("parseCommand rejects a space command with an unknown field or side", () => {
  const extra = parseCommand({ type: "space.get", id: "s1", verbose: true });
  assert.ok(!extra.ok);
  const side = parseCommand({
    type: "space.sync",
    id: "s2",
    choices: { "sessions/a": "theirs" },
  });
  assert.ok(!side.ok);
  const missing = parseCommand({ type: "space.read", id: "s3" });
  assert.ok(!missing.ok);
  if (!missing.ok) assert.match(missing.error, /path/);
});

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

// Playbook drafts (DR-058): the draft channel and the draft.* family.

test("parseCommand accepts subscribe with a draft channel", () => {
  const parsed = parseCommand({
    type: "subscribe",
    id: "d1",
    channel: { kind: "draft", draftId: "triage" },
  });
  assert.ok(parsed.ok);
});

test("parseCommand rejects a draft channel without a draft id", () => {
  const parsed = parseCommand({ type: "subscribe", id: "d2", channel: { kind: "draft" } });
  assert.ok(!parsed.ok);
});

test("parseCommand accepts every draft command", () => {
  const commands = [
    { type: "draft.list", id: "d3" },
    { type: "draft.create", id: "d4", draftId: "triage" },
    { type: "draft.open", id: "d5", draftId: "triage", afterSeq: 4 },
    { type: "draft.send", id: "d6", draftId: "triage", text: "Compile it." },
    { type: "draft.abort", id: "d7", draftId: "triage" },
    { type: "draft.source.write", id: "d8", draftId: "triage", content: "# Triage", baseVersion: "v1" },
    { type: "draft.source.write", id: "d9", draftId: "triage", sourcePath: "/tmp/triage.md" },
    { type: "draft.compile", id: "d10", draftId: "triage" },
    {
      type: "draft.register",
      id: "d11",
      draftId: "triage",
      command: "triage",
      intent: "Triage a new issue",
      bindings: { Triager: "dev.triager", Verifier: "dev.reviewer" },
      newPlayers: { "dev.triager": { adapter: "claude", model: "opus" } },
    },
    { type: "draft.player.set", id: "d12", draftId: "triage", playerId: "dev.reviewer" },
    { type: "draft.player.set", id: "d13", draftId: "triage", playerId: null },
    { type: "draft.delete", id: "d14", draftId: "triage" },
    { type: "draft.artifacts", id: "d15", draftId: "triage" },
  ];
  for (const command of commands) {
    const parsed = parseCommand(command);
    assert.ok(parsed.ok, `${command.type}: ${parsed.ok ? "" : parsed.error}`);
    if (parsed.ok) assert.equal(parsed.command.type, command.type);
  }
});

test("parseCommand rejects a draft id outside the lowercase rule", () => {
  for (const draftId of ["Triage", "1st", "with space", ""]) {
    const parsed = parseCommand({ type: "draft.create", id: "d16", draftId });
    assert.ok(!parsed.ok, draftId);
    if (!parsed.ok) assert.match(parsed.error, /draftId/);
  }
});

test("parseCommand rejects an empty draft message", () => {
  const parsed = parseCommand({ type: "draft.send", id: "d17", draftId: "triage", text: "" });
  assert.ok(!parsed.ok);
});

test("parseCommand rejects a draft registration missing its fields", () => {
  const parsed = parseCommand({
    type: "draft.register",
    id: "d18",
    draftId: "triage",
    command: "triage",
    bindings: { Triager: "Not A Player" },
  });
  assert.ok(!parsed.ok);
  if (!parsed.ok) {
    assert.match(parsed.error, /intent/);
    assert.match(parsed.error, /bindings/);
  }
});

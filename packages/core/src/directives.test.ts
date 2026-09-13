// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDirectives, parseSpexBlock, splitDirectives, topLevelFences } from "./directives.js";

test("a compile block and a register block parse; the last per kind wins", () => {
  const parsed = parseDirectives([
    "Compiling now.",
    "```spex",
    "kind: compile",
    "```",
    "```spex",
    "kind: register",
    "command: one",
    "intent: First",
    "players:",
    "  Coder: dev.coder",
    "```",
    "```spex",
    "kind: register",
    "command: two",
    "intent: Second",
    "players:",
    "  Coder: dev.coder",
    "  Reviewer: dev.reviewer",
    "```",
  ].join("\n"));
  assert.equal(parsed.compile, true);
  assert.deepEqual(parsed.register, { command: "two", intent: "Second", players: { Coder: "dev.coder", Reviewer: "dev.reviewer" } });
  assert.deepEqual(parsed.malformed, []);
  assert.deepEqual(parsed.blocks.map((b) => b.kind), ["compile", "register", "register"]);
});

test("a fence nested in another fence is content, not a directive", () => {
  const text = ["````markdown", "```spex", "kind: compile", "```", "````", "", "prose"].join("\n");
  assert.deepEqual(topLevelFences(text).map((f) => f.info), ["markdown"]);
  const parsed = parseDirectives(text);
  assert.equal(parsed.compile, false);
  assert.equal(parsed.blocks.length, 0);
  // A three-backtick outer fence: the inner opening line has an info
  // string, so it never closes the outer fence.
  const inner = ["```markdown", "```spex", "kind: compile", "```", "", "```spex", "kind: compile", "```"].join("\n");
  const second = parseDirectives(inner);
  assert.equal(second.compile, true);
  assert.equal(second.blocks.length, 1);
});

test("malformed blocks stay as code: unknown keys or kinds, missing keys, bad players, parse failures", () => {
  const cases = [
    "kind: compile\nextra: 1",
    "kind: deploy",
    "kind: register\ncommand: x\nintent: y",
    "kind: register\ncommand: x\nintent: y\nplayers:\n  Coder: Not A Player",
    "kind: register\ncommand: ''\nintent: y\nplayers: {}",
    "kind: [unclosed",
    "- just\n- a list",
  ];
  const parsed = parseDirectives(cases.map((body) => `\`\`\`spex\n${body}\n\`\`\``).join("\n\n"));
  assert.equal(parsed.compile, false);
  assert.equal(parsed.register, undefined);
  assert.deepEqual(parsed.malformed, cases);
  assert.ok(parsed.blocks.every((b) => b.malformed));
});

test("CommonMark fences: up to three spaces of indent, tildes, a longer info string, any case of spex", () => {
  const text = [
    "  ```spex",
    "  kind: compile",
    "  ```",
    "~~~Spex yaml",
    "kind: register",
    "command: tilde",
    "intent: Read through a tilde fence",
    "players:",
    "  Coder: dev.coder",
    "~~~",
  ].join("\n");
  const parsed = parseDirectives(text);
  assert.equal(parsed.compile, true);
  assert.deepEqual(parsed.register, { command: "tilde", intent: "Read through a tilde fence", players: { Coder: "dev.coder" } });
  assert.deepEqual(parsed.malformed, []);
  // The opener's indentation comes off the body; CRLF reads the same.
  assert.deepEqual(topLevelFences(text.split("\n").join("\r\n"))[0], { info: "spex", body: "kind: compile" });
});

test("the thread's split and the core's parse read one reply alike", () => {
  const text = "Compiling now.\n```spex\nkind: compile\n```\n```md\n# not a directive\n```\n```spex\nkind: deploy\n```\nDone.";
  const parts = splitDirectives(text);
  assert.deepEqual(parts, [
    { kind: "prose", text: "Compiling now." },
    { kind: "directive", body: "kind: compile", directive: { kind: "compile" } },
    { kind: "prose", text: "```md\n# not a directive\n```" },
    { kind: "directive", body: "kind: deploy", error: "unknown kind deploy" },
    { kind: "prose", text: "Done." },
  ]);
  const parsed = parseDirectives(text);
  assert.equal(parsed.compile, true);
  assert.deepEqual(parsed.malformed, ["kind: deploy"]);
  // YAML the agent may well write reads as the core does, not as a
  // looser line reader would: a folded intent, a quoted colon.
  assert.deepEqual(parseSpexBlock("kind: register\ncommand: c\nintent: >-\n  Draft notes\n  since the last tag\nplayers: {Coder: dev.coder}"), {
    directive: { kind: "register", command: "c", intent: "Draft notes since the last tag", players: { Coder: "dev.coder" } },
  });
  assert.match((parseSpexBlock("kind: register\ncommand: c\nintent: Triage: everything\nplayers: {}") as { error: string }).error, /not YAML/);
  assert.deepEqual(parseSpexBlock("kind: register\ncommand: c\nintent: 'Triage: everything'\nplayers: {}"), {
    directive: { kind: "register", command: "c", intent: "Triage: everything", players: {} },
  });
});

test("a spex fence inside a tilde fence is content; a backtick opener with a backtick in its info string is no fence", () => {
  const nested = ["~~~markdown", "```spex", "kind: compile", "```", "~~~"].join("\n");
  assert.deepEqual(topLevelFences(nested).map((f) => f.info), ["markdown"]);
  assert.equal(parseDirectives(nested).compile, false);
  // The stray line never opens a fence, so the block after it stands.
  const stray = ["``` `spex", "```spex", "kind: compile", "```"].join("\n");
  assert.equal(parseDirectives(stray).compile, true);
  // An unclosed fence is no block.
  assert.equal(parseDirectives("```spex\nkind: compile").compile, false);
});

test("other fences and prose are ignored", () => {
  const parsed = parseDirectives("```yaml\nkind: compile\n```\n\nkind: compile\n\n```\nkind: compile\n```");
  assert.equal(parsed.compile, false);
  assert.equal(parsed.blocks.length, 0);
});

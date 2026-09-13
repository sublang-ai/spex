// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The thread's reading of the agent's spex blocks (playbook-library-53):
// the core's parser, re-exported — top-level fences become directives,
// nested ones stay content, and a block the core refuses is named
// malformed rather than drawn as a card.

import { describe, expect, test } from "vitest";

import { parseSpexBlock, splitDirectives } from "./directives.js";

describe("splitDirectives", () => {
  test("prose around a compile block, the block read as a directive", () => {
    const parts = splitDirectives(
      "Compiling now.\n```spex\nkind: compile\n```\nBack soon.",
    );
    expect(parts).toEqual([
      { kind: "prose", text: "Compiling now." },
      { kind: "directive", body: "kind: compile", directive: { kind: "compile" } },
      { kind: "prose", text: "Back soon." },
    ]);
  });

  test("a register block carries command, intent, and players", () => {
    const [part] = splitDirectives(
      [
        "```spex",
        "kind: register",
        "command: triage",
        "intent: Triage a new issue into the repository's labels",
        "players:",
        "  Triager: dev.triager",
        "  Verifier: dev.verifier",
        "```",
      ].join("\n"),
    );
    expect(part.kind).toBe("directive");
    expect(part.kind === "directive" && part.directive).toEqual({
      kind: "register",
      command: "triage",
      intent: "Triage a new issue into the repository's labels",
      players: { Triager: "dev.triager", Verifier: "dev.verifier" },
    });
  });

  test("a spex fence inside another fence is content, not a directive", () => {
    const parts = splitDirectives(
      "Here is how a block looks:\n````markdown\n```spex\nkind: compile\n```\n````\nDone.",
    );
    expect(parts.every((part) => part.kind === "prose")).toBe(true);
    expect(parts.map((part) => (part.kind === "prose" ? part.text : "")).join("\n")).toContain(
      "```spex",
    );
  });

  test("CommonMark fences: indent removed, tildes, a longer info string, any case, CRLF", () => {
    const parts = splitDirectives(
      ["  ```Spex yaml", "  kind: compile", "  ```", "~~~markdown", "```spex", "kind: compile", "```", "~~~"].join("\r\n"),
    );
    expect(parts[0]).toEqual({ kind: "directive", body: "kind: compile", directive: { kind: "compile" } });
    expect(parts[1].kind).toBe("prose");
    expect(parts).toHaveLength(2);
  });

  test("an unclosed fence stays prose", () => {
    const parts = splitDirectives("Working…\n```spex\nkind: comp");
    expect(parts).toEqual([{ kind: "prose", text: "Working…\n```spex\nkind: comp" }]);
  });

  test("other fences stay in the prose as code", () => {
    const parts = splitDirectives("```md\n# Title\n```\n```spex\nkind: compile\n```");
    expect(parts[0]).toEqual({ kind: "prose", text: "```md\n# Title\n```" });
    expect(parts[1].kind).toBe("directive");
  });
});

describe("parseSpexBlock", () => {
  test("compile with any other key is malformed", () => {
    expect(parseSpexBlock("kind: compile\ncommand: x")).toMatchObject({
      error: expect.stringContaining("compile takes no keys"),
    });
  });

  test("register with an unknown key, a missing field, or a bad player id is malformed", () => {
    expect(
      parseSpexBlock("kind: register\ncommand: a\nintent: b\nplayers:\n  R: dev.r\nextra: 1"),
    ).toMatchObject({ error: "unknown key extra" });
    expect(parseSpexBlock("kind: register\ncommand: a\nplayers:\n  R: dev.r")).toMatchObject({
      error: "register needs an intent",
    });
    expect(
      parseSpexBlock("kind: register\ncommand: a\nintent: b\nplayers:\n  R: Dev Coder"),
    ).toMatchObject({ error: expect.stringContaining("invalid player id") });
  });

  test("an unknown kind, no kind, or a non-mapping body is malformed", () => {
    expect(parseSpexBlock("kind: deploy")).toEqual({ error: "unknown kind deploy" });
    expect(parseSpexBlock("command: a")).toEqual({ error: "no kind" });
    expect(parseSpexBlock("- just\n- a list")).toMatchObject({
      error: expect.stringContaining("not a mapping"),
    });
    expect(parseSpexBlock("kind: [unclosed")).toMatchObject({
      error: expect.stringContaining("not YAML"),
    });
  });

  test("quoted values, a folded intent, and a flow players mapping read the same", () => {
    expect(
      parseSpexBlock("kind: register\ncommand: changelog\nintent: >-\n  Draft notes\n  since the last tag\nplayers:\n  Coder: dev.coder"),
    ).toEqual({
      directive: {
        kind: "register",
        command: "changelog",
        intent: "Draft notes since the last tag",
        players: { Coder: "dev.coder" },
      },
    });
    expect(
      parseSpexBlock('kind: register\ncommand: "changelog"\nintent: \'Draft notes\'\nplayers: {Coder: dev.coder, Reviewer: dev.reviewer}'),
    ).toEqual({
      directive: {
        kind: "register",
        command: "changelog",
        intent: "Draft notes",
        players: { Coder: "dev.coder", Reviewer: "dev.reviewer" },
      },
    });
  });
});

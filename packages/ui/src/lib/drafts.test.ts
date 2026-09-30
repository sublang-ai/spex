// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The draft helpers behind the chips and the Register tab's defaults
// (playbook-library-50, playbook-library-61).

import { describe, expect, test } from "vitest";
import type { DraftInfo } from "@sublang/spex-core/protocol";

import {
  agentBlockOf,
  draftChipTitle,
  draftChipWord,
  derivedIntent,
  firstProseParagraph,
  newPlayerId,
} from "./drafts.js";

const t = 1_700_000_000_000;

function draft(overrides: Partial<DraftInfo>): DraftInfo {
  return {
    id: "triage",
    createdAt: t,
    touchedAt: t,
    firstLine: null,
    activity: "idle",
    state: "draft",
    queued: [],
    player: null,
    agent: { adapter: "claude", model: "claude-opus-5" },
    ready: true,
    failures: 0,
    ...overrides,
  };
}

describe("draft chips", () => {
  test("every state has its word, each within the 14-character budget", () => {
    const words = (
      ["no-source", "draft", "compiling", "failed", "interrupted", "compiled", "changed"] as const
    ).map((state) => draftChipWord(draft({ state })));
    expect(words).toEqual([
      "No source",
      "Draft",
      "Compiling",
      "Failed",
      "Interrupted",
      "Compiled",
      "Changed",
    ]);
    expect(draftChipWord(draft({ sourceMissing: true }))).toBe("Source missing");
    for (const word of [...words, "Source missing"]) {
      expect(word.length).toBeLessThanOrEqual(14);
    }
  });

  test("a failure's phase and age live in the title, in human words with the id", () => {
    const failed = draft({
      state: "failed",
      compile: { at: t - 9 * 3600_000, by: "agent", outcome: "failed", phase: "gears2fsm" },
    });
    expect(draftChipTitle(failed, t)).toBe("Failed at Machine (gears2fsm), 9h ago");
    const packaging = draft({
      state: "failed",
      compile: { at: t - 60_000, by: "boss", outcome: "failed", phase: "packaging" },
    });
    expect(draftChipTitle(packaging, t)).toBe("Failed at Package (packaging), 1m ago");
  });
});

describe("firstProseParagraph", () => {
  test("skips the title, the roles list, quotes, and code to the first prose", () => {
    const source = [
      "# Triage",
      "",
      "Roles:",
      "- Triager",
      "- Verifier",
      "",
      "```markdown",
      "not prose",
      "```",
      "",
      "> not prose either",
      "",
      "When an issue arrives, Captain shall prompt Triager:",
      "wrapped onto a second line.",
      "",
      "Second paragraph.",
    ].join("\n");
    expect(firstProseParagraph(source)).toBe(
      "When an issue arrives, Captain shall prompt Triager: wrapped onto a second line.",
    );
    expect(firstProseParagraph("# Only a title")).toBe("");
  });
});

describe("derivedIntent", () => {
  test("the first prose paragraph, else the title outside code", () => {
    expect(derivedIntent("# Triage\n\nLabel each new issue.\n")).toBe("Label each new issue.");
    // The app's own example: a title over a roles list and numbered
    // steps, no prose paragraph.
    expect(
      derivedIntent(
        "# Two-Agent Change-and-Review Workflow #\n\nRoles:\n\n- Coder\n- Reviewer\n\n## Procedure\n\n1. Step one.\n",
      ),
    ).toBe("Two-Agent Change-and-Review Workflow");
    expect(derivedIntent("```\n# not a title\n```\n\n## Only a section\n")).toBe("");
  });
});

describe("new lanes", () => {
  test("a role mints dev.<role> in lowercase", () => {
    expect(newPlayerId("Triager")).toBe("dev.triager");
    expect(newPlayerId("Code Reviewer")).toBe("dev.code-reviewer");
  });

  test("the draft's agent becomes a block without instruction or fast mode", () => {
    expect(
      agentBlockOf({
        adapter: "codex",
        model: "gpt-6",
        effort: "high",
        fastMode: true,
        instruction: "x",
        permissions: { mode: "bypass" },
      }),
    ).toEqual({
      adapter: "codex",
      model: "gpt-6",
      effort: "high",
      permissions: { mode: "bypass" },
    });
    // The subagent model travels with the model (DR-093).
    expect(
      agentBlockOf({ adapter: "claude", model: "claude-opus-5-5", subagentModel: "claude-sonnet-5-5" }),
    ).toEqual({
      adapter: "claude",
      model: "claude-opus-5-5",
      subagentModel: "claude-sonnet-5-5",
      permissions: { mode: "auto" },
    });
    expect(agentBlockOf({ adapter: "claude" })).toEqual({
      adapter: "claude",
      permissions: { mode: "auto" },
    });
  });
});

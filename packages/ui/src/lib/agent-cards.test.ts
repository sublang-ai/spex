// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { describe, expect, test } from "vitest";
import type { AgentModelOption } from "@sublang/spex-core/protocol";
import { distinctRunModels } from "./agent-cards.js";

const MODELS: AgentModelOption[] = [
  { id: "default", name: "Default", resolvedModel: "claude-opus-5-5" },
  { id: "opus", name: "Opus", resolvedModel: "claude-opus-5-5" },
  { id: "claude-opus-5-5", name: "Opus 5.5" },
  { id: "sonnet", name: "Sonnet", resolvedModel: "claude-sonnet-5-5" },
];

describe("settings-5: a card counts the models its agents run, not how they are written", () => {
  test("Provider default and the default model written out are one model", () => {
    expect(distinctRunModels(["", "claude-opus-5-5"], MODELS, "claude-opus-5-5")).toEqual([""]);
    expect(distinctRunModels(["claude-opus-5-5", ""], MODELS, "default")).toEqual([""]);
  });

  test("an alias and the model it resolves to are one model", () => {
    expect(distinctRunModels(["opus", "claude-opus-5-5"], MODELS, undefined)).toEqual(["opus"]);
  });

  test("different models stay several, and Provider default with no default named stands apart", () => {
    expect(distinctRunModels(["opus", "sonnet"], MODELS, "default")).toEqual(["opus", "sonnet"]);
    expect(distinctRunModels(["", "opus"], MODELS, undefined)).toEqual(["", "opus"]);
  });
});

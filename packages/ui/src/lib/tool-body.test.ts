// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A tool card's body (run-view-4): string fields verbatim, the rest
// as JSON, in the input's own order.

import { describe, expect, test } from "vitest";

import { inputBlocks, outputBlock } from "./tool-body.js";

describe("inputBlocks", () => {
  test("a string input is one verbatim block", () => {
    expect(inputBlocks("git show --stat HEAD")).toEqual([
      { text: "git show --stat HEAD", kind: "text" },
    ]);
  });

  test("an object prints each string field verbatim and the rest as JSON, in order", () => {
    const blocks = inputBlocks({
      command: 'npm test -- "auth"\n',
      timeout: 120_000,
      patch: "-a\n+b",
      todos: [{ content: "ship it" }],
    });
    expect(blocks).toEqual([
      { label: "command", text: 'npm test -- "auth"\n', kind: "text" },
      { label: "timeout", text: "120000", kind: "json" },
      { label: "patch", text: "-a\n+b", kind: "text" },
      {
        label: "todos",
        text: JSON.stringify([{ content: "ship it" }], null, 2),
        kind: "json",
      },
    ]);
  });

  test("anything else is one JSON block, and nothing is nothing", () => {
    expect(inputBlocks(["a", "b"])).toEqual([
      { text: '[\n  "a",\n  "b"\n]', kind: "json" },
    ]);
    expect(inputBlocks(undefined)).toEqual([]);
  });
});

describe("outputBlock", () => {
  test("a string result is verbatim, a structured one JSON, none absent", () => {
    expect(outputBlock("ok\nall green")).toEqual({
      label: "output",
      text: "ok\nall green",
      kind: "text",
    });
    expect(outputBlock({ exit: 0 })).toEqual({
      label: "output",
      text: '{\n  "exit": 0\n}',
      kind: "json",
    });
    expect(outputBlock(undefined)).toBeUndefined();
  });
});

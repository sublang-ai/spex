// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A tool card's body (run-view-4): what the call was given and what
// it returned, each string field verbatim — a command, a patch, an
// old and new string, a file's content — and only the values that are
// not strings as JSON. A command wrapped in quotes and escapes is a
// payload; the same command as it was typed is what the reader came
// to see.

export interface ToolBlock {
  /** The field's name; absent for a whole-value block. */
  label?: string;
  text: string;
  kind: "text" | "json";
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

/** The blocks a tool call's input yields, in the input's own order. */
export function inputBlocks(input: unknown): ToolBlock[] {
  if (input === undefined) return [];
  if (typeof input === "string") return [{ text: input, kind: "text" }];
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return Object.entries(input as Record<string, unknown>).map(
      ([label, value]) =>
        typeof value === "string"
          ? { label, text: value, kind: "text" }
          : { label, text: json(value), kind: "json" },
    );
  }
  return [{ text: json(input), kind: "json" }];
}

/** The block a tool result yields, once delivered. */
export function outputBlock(output: unknown): ToolBlock | undefined {
  if (output === undefined) return undefined;
  return typeof output === "string"
    ? { label: "output", text: output, kind: "text" }
    : { label: "output", text: json(output), kind: "json" };
}

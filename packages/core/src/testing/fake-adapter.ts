// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Scripted fake adapter (CORE-18): satisfies cligent's AgentAdapter
// contract in-memory so contract tests exercise the full record path
// with no network access and no agent credentials.

import { randomUUID } from "node:crypto";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";

export interface FakeUsage {
  inputTokens?: number;
  outputTokens?: number;
  toolUses?: number;
  totalCostUsd?: number;
}

export interface FakeResponse {
  /** Streamed as text_delta events before the terminal done. */
  deltas?: string[];
  thinking?: string;
  /** done.result — also the finalText the runtime reports. */
  result: string;
  status?: "success" | "error" | "interrupted";
  usage?: FakeUsage;
  /** Sleep before the terminal done, to test in-flight behavior. */
  delayMs?: number;
}

export interface FakeRule {
  match: string | RegExp;
  response: FakeResponse;
}

export interface FakeScript {
  rules?: FakeRule[];
  fallback?: FakeResponse;
}

interface FakeEvent {
  type: string;
  agent: string;
  timestamp: number;
  sessionId: string;
  payload: unknown;
}

const DEFAULT_FALLBACK: FakeResponse = {
  deltas: ["ack"],
  result: "ack",
};

function pick(script: FakeScript, prompt: string): FakeResponse {
  for (const rule of script.rules ?? []) {
    const hit =
      typeof rule.match === "string"
        ? prompt.includes(rule.match)
        : rule.match.test(prompt);
    if (hit) return rule.response;
  }
  return script.fallback ?? DEFAULT_FALLBACK;
}

export interface FakeAdapterStats {
  constructed: number;
  runs: { prompt: string; resume?: string; cwd?: string }[];
}

/**
 * Build an adapterImports map whose four entries all resolve to the
 * same scripted fake class. `stats` observes construction and runs so
 * tests can assert no real adapter was ever involved.
 */
export function fakeAdapterImports(
  script: FakeScript,
  stats: FakeAdapterStats = { constructed: 0, runs: [] },
): { imports: PlayerAdapterImports; stats: FakeAdapterStats } {
  class FakeAdapter {
    readonly agent = "fake";

    constructor() {
      stats.constructed += 1;
    }

    async *run(
      prompt: string,
      options?: { resume?: string; cwd?: string; abortSignal?: AbortSignal },
    ): AsyncGenerator<FakeEvent, void, void> {
      stats.runs.push({
        prompt,
        ...(options?.resume ? { resume: options.resume } : {}),
        ...(options?.cwd ? { cwd: options.cwd } : {}),
      });
      const sessionId = randomUUID();
      const response = pick(script, prompt);
      const base = { agent: this.agent, sessionId };
      for (const delta of response.deltas ?? []) {
        yield { ...base, type: "text_delta", timestamp: Date.now(), payload: { delta } };
      }
      if (response.thinking !== undefined) {
        yield {
          ...base,
          type: "thinking",
          timestamp: Date.now(),
          payload: { summary: response.thinking },
        };
      }
      if (response.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, response.delayMs));
      }
      yield {
        ...base,
        type: "done",
        timestamp: Date.now(),
        payload: {
          status: response.status ?? "success",
          result: response.result,
          resumeToken: `fake-resume-${sessionId}`,
          usage: {
            inputTokens: response.usage?.inputTokens ?? prompt.length,
            outputTokens: response.usage?.outputTokens ?? response.result.length,
            toolUses: response.usage?.toolUses ?? 0,
            ...(response.usage?.totalCostUsd !== undefined
              ? { totalCostUsd: response.usage.totalCostUsd }
              : {}),
          },
          durationMs: 1,
        },
      };
    }

    async isAvailable(): Promise<boolean> {
      return true;
    }
  }

  const load = async () =>
    FakeAdapter as unknown as Awaited<
      ReturnType<PlayerAdapterImports["claude"]>
    >;
  return {
    imports: { claude: load, codex: load, gemini: load, opencode: load },
    stats,
  };
}

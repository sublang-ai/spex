// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Scripted fake adapter (CORE-18): satisfies cligent's AgentAdapter
// contract in-memory so contract tests exercise the full record path
// with no network access and no agent credentials.

import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";

export interface FakeUsage {
  inputTokens?: number;
  outputTokens?: number;
  toolUses?: number;
  totalCostUsd?: number;
}

/** One scripted tool call: emitted as a tool_use/tool_result pair, so
 * a fake run exercises the same transcript path a real one takes. */
export interface FakeToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  durationMs?: number;
}

export interface FakeResponse {
  /** Streamed as text_delta events before the terminal done. */
  deltas?: string[];
  /** Files written relative to the run's `cwd` before the tool events
   * — a source-writing authoring agent (DR-058). A `<id>` in a path
   * names the cwd's basename, the draft id. */
  writes?: Record<string, string>;
  /** Run in the run's `cwd` before the tool events — a player that
   * really touches its repository, so Playbook classifies the receipt
   * it actually finds rather than a scripted one (core-service-91). */
  effect?: (cwd: string) => void;
  /** Emitted after the deltas, in order. */
  tools?: FakeToolCall[];
  thinking?: string;
  /** done.result — also the finalText the runtime reports. */
  result: string;
  status?: "success" | "error" | "interrupted";
  usage?: FakeUsage;
  /** Sleep before the terminal done, to test in-flight behavior. */
  delayMs?: number;
  /** Stay in flight until the run's signal aborts. */
  untilAborted?: boolean;
  /** End in an error event carrying this code, then done(error) — the
   * provider refusing a resume (playbook-library-64). With
   * `onlyResumed` the failure applies only to a run given `resume`;
   * a fresh run answers normally. */
  failWith?: { code: string; message?: string; onlyResumed?: boolean };
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

export interface FakeRunOptions {
  resume?: string;
  cwd?: string;
  model?: string;
  permissions?: Record<string, unknown>;
  allowedTools?: string[];
  disallowedTools?: string[];
  abortSignal?: AbortSignal;
}

export interface FakeAdapterStats {
  constructed: number;
  runs: {
    prompt: string;
    resume?: string;
    cwd?: string;
    model?: string;
    permissions?: Record<string, unknown>;
    allowedTools?: string[];
    disallowedTools?: string[];
  }[];
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
      options?: FakeRunOptions,
    ): AsyncGenerator<FakeEvent, void, void> {
      stats.runs.push({
        prompt,
        ...(options?.resume ? { resume: options.resume } : {}),
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        ...(options?.model ? { model: options.model } : {}),
        ...(options?.permissions ? { permissions: options.permissions } : {}),
        ...(options?.allowedTools ? { allowedTools: options.allowedTools } : {}),
        ...(options?.disallowedTools ? { disallowedTools: options.disallowedTools } : {}),
      });
      const sessionId = randomUUID();
      // `<id>` names the cwd's basename — the draft id — in paths,
      // deltas, tool inputs, and the result, so one script serves any
      // draft.
      const id = options?.cwd ? basename(options.cwd) : "<id>";
      const named = (text: string): string => text.replaceAll("<id>", id);
      const namedInput = (input: Record<string, unknown>): Record<string, unknown> =>
        Object.fromEntries(
          Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? named(value) : value]),
        );
      const picked = pick(script, prompt);
      const response: FakeResponse = {
        ...picked,
        result: named(picked.result),
        ...(picked.deltas ? { deltas: picked.deltas.map(named) } : {}),
      };
      const base = { agent: this.agent, sessionId };
      if (response.failWith && (!response.failWith.onlyResumed || options?.resume)) {
        yield {
          ...base,
          type: "error",
          timestamp: Date.now(),
          payload: {
            code: response.failWith.code,
            message: response.failWith.message ?? `the provider refused: ${response.failWith.code}`,
            recoverable: false,
          },
        };
        yield {
          ...base,
          type: "done",
          timestamp: Date.now(),
          payload: { status: "error", usage: { toolUses: 0 }, durationMs: 1 },
        };
        return;
      }
      for (const delta of response.deltas ?? []) {
        yield { ...base, type: "text_delta", timestamp: Date.now(), payload: { delta } };
      }
      if (response.writes && options?.cwd) {
        for (const [relative, content] of Object.entries(response.writes)) {
          const target = join(options.cwd, named(relative));
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, named(content));
        }
      }
      if (response.effect && options?.cwd) response.effect(options.cwd);
      for (const [index, tool] of (response.tools ?? []).entries()) {
        const toolUseId = `fake-tool-${index}`;
        yield {
          ...base,
          type: "tool_use",
          timestamp: Date.now(),
          payload: { toolName: tool.toolName, toolUseId, input: namedInput(tool.input) },
        };
        yield {
          ...base,
          type: "tool_result",
          timestamp: Date.now(),
          payload: {
            toolUseId,
            toolName: tool.toolName,
            status: "success",
            output: tool.output ?? "ok",
            ...(tool.durationMs !== undefined
              ? { durationMs: tool.durationMs }
              : {}),
          },
        };
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
      if (response.untilAborted) {
        // cligent drains the run on abort and synthesizes the
        // interrupted done itself; the fake only has to wait.
        await new Promise<void>((resolve) => {
          const signal = options?.abortSignal;
          if (!signal || signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        return;
      }
      yield {
        ...base,
        type: "done",
        timestamp: Date.now(),
        payload: {
          status: response.status ?? "success",
          result: response.result,
          resumeToken: `fake-resume-${sessionId}`,
          // The shape cligent 0.22 reports: an optional token report
          // with inclusive totals, and a cost carrying its provenance.
          usage: {
            toolUses: response.usage?.toolUses ?? 0,
            tokens: {
              coverage: "complete",
              totals: {
                input: { total: response.usage?.inputTokens ?? prompt.length },
                output: {
                  total: response.usage?.outputTokens ?? response.result.length,
                },
              },
            },
            ...(response.usage?.totalCostUsd !== undefined
              ? {
                  cost: {
                    amount: response.usage.totalCostUsd,
                    currency: "USD",
                    source: "provider-reported",
                  },
                }
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

  // One fake constructor serves every adapter slot. cligent's
  // PlayerAdapterImports parameterizes each loader by adapter name (each slot
  // wants an AgentAdapter over that adapter's own effort vocabulary), so the
  // single fake loader is assigned through one object-level cast rather than
  // matching four distinct per-adapter signatures.
  const load = async () => FakeAdapter;
  const imports = {
    claude: load,
    codex: load,
    gemini: load,
    opencode: load,
  } as unknown as PlayerAdapterImports;
  return { imports, stats };
}

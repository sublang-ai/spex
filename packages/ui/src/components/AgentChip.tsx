// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one agent chip (DR-019): a compact "adapter · model @ effort"
// one-liner with the adapter's readiness dot, used everywhere an
// agent is shown. Absent parts are omitted, never placeholdered. An
// agent in fast mode wears a lightning mark after them (DR-038).

import type {
  AgentBlockInput,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

/** An agent block as the chip reads it: the config's inline block,
 * plus the adapter-scoped fast mode a summary carries (DR-038). */
export type ChipAgent = AgentBlockInput & { fastMode?: boolean };

/** The mark fast mode wears (DR-038, run-view-25). */
export const FAST_MODE_MARK = "⚡";

function chipBase(agent: ChipAgent): string {
  let text = agent.adapter;
  if (agent.model) text += ` · ${agent.model}`;
  if (agent.effort) text += ` @ ${agent.effort}`;
  return text;
}

export function agentChipText(agent: ChipAgent): string {
  const base = chipBase(agent);
  return agent.fastMode ? `${base} ${FAST_MODE_MARK}` : base;
}

export function AgentChip({
  agent,
  readiness,
  label,
}: {
  agent: ChipAgent;
  /** The adapter's deduped readiness entry, when known. */
  readiness?: ReadinessEntry;
  /** Position context for assistive tech, e.g. "Captain" or a role. */
  label?: string;
}) {
  const text = chipBase(agent);
  const state =
    readiness === undefined
      ? undefined
      : readiness.ready === true
        ? "ready"
        : readiness.ready === false
          ? "not ready"
          : "readiness unknown";
  return (
    <span
      data-testid="agent-chip"
      aria-label={`${label ? `${label}: ` : ""}${text}${agent.fastMode ? ", fast mode" : ""}${state ? ` (${state})` : ""}`}
      className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
    >
      {text}
      {agent.fastMode ? (
        <span
          aria-hidden
          data-testid="fast-mode-mark"
          title="fast mode"
          className="text-amber-500"
        >
          {FAST_MODE_MARK}
        </span>
      ) : null}
      {readiness ? (
        readiness.ready === true ? (
          <span aria-hidden className="text-emerald-500" title="ready">
            ●
          </span>
        ) : readiness.ready === false ? (
          <span
            aria-hidden
            className="text-red-500"
            title={readiness.requirement ?? "not ready"}
          >
            ●
          </span>
        ) : (
          <span
            aria-hidden
            className="text-neutral-400"
            title={
              readiness.requirement ??
              "no automatic check for this adapter — verify sign-in yourself"
            }
          >
            ●
          </span>
        )
      ) : null}
    </span>
  );
}

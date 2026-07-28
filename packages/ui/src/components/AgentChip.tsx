// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The one agent chip (DR-019): a compact "adapter · model @ effort"
// one-liner with the adapter's readiness dot, used everywhere an
// agent is shown. Absent parts are omitted, never placeholdered.

import type {
  AgentBlockInput,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

export function agentChipText(agent: AgentBlockInput): string {
  let text = agent.adapter;
  if (agent.model) text += ` · ${agent.model}`;
  if (agent.effort) text += ` @ ${agent.effort}`;
  return text;
}

export function AgentChip({
  agent,
  readiness,
  label,
}: {
  agent: AgentBlockInput;
  /** The adapter's deduped readiness entry, when known. */
  readiness?: ReadinessEntry;
  /** Position context for assistive tech, e.g. "Captain" or a role. */
  label?: string;
}) {
  const text = agentChipText(agent);
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
      aria-label={`${label ? `${label}: ` : ""}${text}${state ? ` (${state})` : ""}`}
      className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
    >
      {text}
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

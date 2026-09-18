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

import { i18n } from "../i18n.js";

/** The words a chip lends its tooltip and its accessible name: one
 * for fast mode, one per readiness state. Functions, never constants:
 * a text read at module load would freeze the language the module was
 * imported in (localization-4). */
export function fastModeWord(): string {
  return i18n._({
    id: "fast mode",
    comment: "an agent runs in its adapter's fast mode",
  });
}

export function readinessWord(ready: boolean | null | undefined): string {
  if (ready === true) {
    return i18n._({ id: "ready", comment: "the adapter is signed in and usable" });
  }
  if (ready === false) {
    return i18n._({ id: "not ready", comment: "the adapter needs something before it can run" });
  }
  return i18n._({
    id: "readiness unknown",
    comment: "no automatic check exists for this adapter",
  });
}

export function noCheckNote(): string {
  return i18n._("no automatic check for this adapter — verify sign-in yourself");
}

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
  const state = readiness === undefined ? undefined : readinessWord(readiness.ready);
  // The name is a position, a run of ids, and the words above: only
  // the punctuation between them is assembled here.
  return (
    <span
      data-testid="agent-chip"
      aria-label={`${label ? `${label}: ` : ""}${text}${agent.fastMode ? `, ${fastModeWord()}` : ""}${state ? ` (${state})` : ""}`}
      className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
    >
      {/* The words truncate in a narrow row (DR-041); the accessible
          name above carries them whole. */}
      <span className="min-w-0 truncate">{text}</span>
      {agent.fastMode ? (
        <span
          aria-hidden
          data-testid="fast-mode-mark"
          title={fastModeWord()}
          className="text-amber-500"
        >
          {FAST_MODE_MARK}
        </span>
      ) : null}
      {readiness ? (
        readiness.ready === true ? (
          <span aria-hidden className="text-emerald-500" title={readinessWord(true)}>
            ●
          </span>
        ) : readiness.ready === false ? (
          // What the adapter requires is the core's own sentence.
          <span
            aria-hidden
            className="text-red-500"
            title={readiness.requirement ?? readinessWord(false)}
          >
            ●
          </span>
        ) : (
          <span
            aria-hidden
            className="text-neutral-500"
            title={readiness.requirement ?? noCheckNote()}
          >
            ●
          </span>
        )
      ) : null}
    </span>
  );
}

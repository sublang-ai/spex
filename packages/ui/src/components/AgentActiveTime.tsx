// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { duration } from "../lib/time.js";

export function activeTimeDescription(ms: number): string {
  return `Completed active time this session: ${duration(ms)} · parallel calls overlap`;
}

export function activeTimeDescriptionId(agentId: string): string {
  return `agent-active-description-${agentId}`;
}

/** One agent-local cumulative reading (run-view-143). Its full meaning
 * remains available to assistive technology when the compact phrase
 * yields or a live player reading occupies the visual slot. */
export function AgentActiveTime({
  agentId,
  ms,
  visible = true,
}: {
  agentId: string;
  ms: number;
  visible?: boolean;
}) {
  const value = duration(ms);
  const description = activeTimeDescription(ms);
  return (
    <>
      <span
        id={activeTimeDescriptionId(agentId)}
        data-testid={`agent-active-description-${agentId}`}
        className="sr-only"
      >
        {description}
      </span>
      {visible ? (
        <span
          aria-hidden="true"
          data-testid={`agent-active-${agentId}`}
          title={description}
          className="hidden whitespace-nowrap text-xs text-neutral-500 @lg:inline dark:text-neutral-400"
        >
          active · {value}
        </span>
      ) : null}
    </>
  );
}

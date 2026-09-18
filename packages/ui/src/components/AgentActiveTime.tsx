// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { i18n } from "../i18n.js";
import { duration } from "../lib/time.js";

export function activeTimeDescription(ms: number): string {
  return i18n._("Completed active time this session: {span} · parallel calls overlap", {
    span: duration(ms),
  });
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
          {i18n._({
            id: "active · {span}",
            values: { span: value },
            comment: "compact reading in a pane header: time this agent was active",
          })}
        </span>
      ) : null}
    </>
  );
}

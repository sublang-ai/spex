// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What a session's agents are set to run (DR-067): the session's own
// tuning read over the configured values. One reading, so the chip in
// a pane header, the chip on the Captain, and the panel's rows can
// never disagree about the same agent.

import {
  CAPTAIN_AGENT_ID,
  type AdapterName,
  type ConfigSummary,
  type SessionAgentTuning,
  type SessionInfo,
} from "@sublang/spex-core/protocol";

/** How a value reads once the provider's own default is chosen: there
 * is no id to print, and printing nothing would read as unset. */
export const PROVIDER_DEFAULT_READING = "provider default";

export interface TuningAgent {
  /** The reserved `captain`, or a player of the session's roster. */
  id: string;
  /** What the reader calls it: "Captain", or the player's own id. */
  name: string;
  adapter: AdapterName;
  configured: { model?: string; effort?: string; fastMode?: boolean };
  tuning?: SessionAgentTuning;
  /** `<playbook>.<role>` for every binding that tunes this player of
   * its own accord — one session tuning runs them all alike. */
  divergentRoles: string[];
}

/** What this agent is set to run: the session's tuning of a field,
 * else the configured value. A chip is a setting, not a receipt. */
export function effectiveTuning(agent: TuningAgent): {
  model?: string;
  effort?: string;
  fastMode?: boolean;
} {
  const pick = (chosen: string | false | undefined, configured: string | undefined): string | undefined =>
    chosen === false ? PROVIDER_DEFAULT_READING : chosen ?? configured;
  return {
    ...(pick(agent.tuning?.model, agent.configured.model) !== undefined ? { model: pick(agent.tuning?.model, agent.configured.model) } : {}),
    ...(pick(agent.tuning?.effort, agent.configured.effort) !== undefined ? { effort: pick(agent.tuning?.effort, agent.configured.effort) } : {}),
    ...((agent.tuning?.fastMode ?? agent.configured.fastMode) !== undefined ? { fastMode: agent.tuning?.fastMode ?? agent.configured.fastMode } : {}),
  };
}

/** The fields this session tunes on one agent, in the reader's words,
 * so a row says what it departs from rather than only that it does. */
export function tunedFields(tuning: SessionAgentTuning | undefined): string[] {
  if (!tuning) return [];
  const named: string[] = [];
  if (tuning.model !== undefined) named.push("model");
  if (tuning.effort !== undefined) named.push("effort");
  if (tuning.fastMode !== undefined) named.push("fast mode");
  return named;
}

/** The session's agents, the Captain first and then its players in
 * pane order — the roster the panel lists and the panes draw. */
export function sessionAgents(
  session: Pick<SessionInfo, "players" | "tuning">,
  summary: ConfigSummary | undefined,
): TuningAgent[] {
  if (!summary) return [];
  const divergentFor = (playerId: string): string[] =>
    (summary.playbooks ?? []).flatMap((playbook) =>
      Object.entries(playbook.roles)
        .filter(([, binding]) =>
          binding.playerId === playerId &&
          (binding.model !== undefined || binding.effort !== undefined || binding.fastMode !== undefined))
        .map(([role]) => `${playbook.id}.${role}`));
  const agentOf = (id: string, name: string, block: ConfigSummary["captain"] | undefined, adapter: AdapterName, divergentRoles: string[]): TuningAgent => ({
    id,
    name,
    adapter,
    configured: {
      ...(block?.model !== undefined ? { model: block.model } : {}),
      ...(block?.effort !== undefined ? { effort: block.effort } : {}),
      ...(block?.fastMode !== undefined ? { fastMode: block.fastMode } : {}),
    },
    ...(session.tuning?.[id] ? { tuning: session.tuning[id] } : {}),
    divergentRoles,
  });
  // A summary without a captain block — a partial config a client has
  // not finished loading — contributes no Captain row rather than an
  // agent whose adapter nothing could name.
  const agents = summary.captain
    ? [agentOf(CAPTAIN_AGENT_ID, "Captain", summary.captain, summary.captain.adapter, [])]
    : [];
  for (const player of session.players) {
    // A player the config no longer holds still has a lane and a
    // pane; it reads its own adapter and tunes nothing it cannot.
    const configured = (summary.players ?? []).find(({ id }) => id === player.id);
    agents.push(agentOf(player.id, player.id, configured?.agent, configured?.agent.adapter ?? player.adapter, divergentFor(player.id)));
  }
  return agents;
}

/** How many of a session's agents it tunes — the standing answer to
 * "is this conversation running my defaults?". */
export function tunedCount(session: Pick<SessionInfo, "tuning">): number {
  return Object.keys(session.tuning ?? {}).length;
}

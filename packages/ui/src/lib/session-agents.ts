// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What a session's agents are set to run (DR-067): the session's own
// settings read over the configured ones. One reading, so a pane's
// chip and the editor it opens can never disagree about the agent.

import {
  CAPTAIN_AGENT_ID,
  type AdapterName,
  type AgentReportedModel,
  type ConfigSummary,
  type SessionAgentSettings,
  type SessionInfo,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";

/** How a value reads once the provider's own default is chosen: there
 * is no id to print, and printing nothing would read as unset. A
 * function, never a constant: a text read at module load would freeze
 * the language the module was imported in (localization-4). */
export function providerDefaultReading(): string {
  return i18n._({
    id: "provider default",
    comment: "an agent chip's model reading when the provider's own default is taken",
  });
}

export interface SessionAgent {
  /** The reserved `captain`, or a player of the session's roster. */
  id: string;
  /** What the reader calls it: "Captain", or the player's own id. */
  name: string;
  adapter: AdapterName;
  configured: { model?: string; subagentModel?: string | false; effort?: string; subagentEffort?: string; fastMode?: boolean };
  settings?: SessionAgentSettings;
  /** `<playbook>.<role>` for every binding that tunes this player of
   * its own accord — one session tuning runs them all alike. */
  divergentRoles: string[];
  /** The model the runtime reported for this agent's latest call to
   * report one, with the settings that call began under
   * (core-service-115). */
  reported?: AgentReportedModel;
}

/** What this agent is set to run: this conversation's own value for a
 * field, else the configured one. A chip is a setting, not a receipt. */
export function effectiveSettings(agent: SessionAgent): {
  model?: string;
  /** Read by the editor alone: the chip never reads either (DR-093,
   * DR-095). */
  subagentModel?: string | false;
  effort?: string;
  subagentEffort?: string;
  fastMode?: boolean;
} {
  const pick = (chosen: string | false | undefined, configured: string | undefined): string | undefined =>
    chosen === false ? providerDefaultReading() : chosen ?? configured;
  // A subagent model's `false` is "Off" — no subagent model sent — and
  // stays itself rather than taking the provider's words (DR-095).
  const subagentModel = agent.settings?.subagentModel !== undefined ? agent.settings.subagentModel : agent.configured.subagentModel;
  const subagentEffort = agent.settings?.subagentEffort === false ? undefined : agent.settings?.subagentEffort ?? agent.configured.subagentEffort;
  return {
    ...(pick(agent.settings?.model, agent.configured.model) !== undefined ? { model: pick(agent.settings?.model, agent.configured.model) } : {}),
    ...(subagentModel !== undefined ? { subagentModel } : {}),
    ...(subagentEffort !== undefined ? { subagentEffort } : {}),
    ...(pick(agent.settings?.effort, agent.configured.effort) !== undefined ? { effort: pick(agent.settings?.effort, agent.configured.effort) } : {}),
    ...((agent.settings?.fastMode ?? agent.configured.fastMode) !== undefined ? { fastMode: agent.settings?.fastMode ?? agent.configured.fastMode } : {}),
  };
}

/** What this agent is set to run on, in the encoding a runtime report's
 * settings use: its adapter, and a model setting where a string pins
 * and `false` takes the provider's default. */
function currentSettings(agent: SessionAgent): AgentReportedModel["settings"] {
  const chosen = agent.settings?.model;
  return {
    adapter: agent.adapter,
    model: chosen !== undefined ? chosen : agent.configured.model ?? false,
  };
}

/** The model the runtime reported for this agent's latest call, while
 * the agent still runs on the adapter and model setting that call began
 * under — effort and fast mode leave which model runs unchanged; once
 * either changes, nothing: the chip then reads what is set, as a
 * setting does (run-view-139, DR-091). */
export function reportedModel(agent: SessionAgent): string | undefined {
  const reported = agent.reported;
  // A report whose settings cannot be read is compared with nothing:
  // nothing is guessed (DR-091).
  if (!reported?.settings || typeof reported.model !== "string") return undefined;
  const now = currentSettings(agent);
  const began = reported.settings;
  return now.adapter === began.adapter && now.model === began.model ? reported.model : undefined;
}

/** The fields this conversation set on one agent, in the reader's own
 * words, so a chip and its editor say what departs rather than only
 * that something does. */
export function changedFields(settings: SessionAgentSettings | undefined): string[] {
  if (!settings) return [];
  const named: string[] = [];
  if (settings.model !== undefined) named.push("model");
  if (settings.subagentModel !== undefined) named.push("subagent model");
  if (settings.effort !== undefined) named.push("effort");
  if (settings.subagentEffort !== undefined) named.push("subagent effort");
  if (settings.fastMode !== undefined) named.push("fast mode");
  return named;
}

/** The session's agents, the Captain first and then its players in
 * pane order — one per pane the view draws. */
export function sessionAgents(
  session: Pick<SessionInfo, "players" | "agentSettings" | "agentReportedModels">,
  summary: ConfigSummary | undefined,
): SessionAgent[] {
  if (!summary) return [];
  const divergentFor = (playerId: string): string[] =>
    (summary.playbooks ?? []).flatMap((playbook) =>
      Object.entries(playbook.roles)
        .filter(([, binding]) =>
          binding.playerId === playerId &&
          (binding.model !== undefined || binding.subagentModel !== undefined || binding.effort !== undefined || binding.subagentEffort !== undefined || binding.fastMode !== undefined))
        .map(([role]) => `${playbook.id}.${role}`));
  const agentOf = (id: string, name: string, block: ConfigSummary["captain"] | undefined, adapter: AdapterName, divergentRoles: string[]): SessionAgent => ({
    id,
    name,
    adapter,
    configured: {
      ...(block?.model !== undefined ? { model: block.model } : {}),
      ...(block?.subagentModel !== undefined ? { subagentModel: block.subagentModel } : {}),
      ...(block?.subagentEffort !== undefined ? { subagentEffort: block.subagentEffort } : {}),
      ...(block?.effort !== undefined ? { effort: block.effort } : {}),
      ...(block?.fastMode !== undefined ? { fastMode: block.fastMode } : {}),
    },
    ...(session.agentSettings?.[id] ? { settings: session.agentSettings[id] } : {}),
    divergentRoles,
    ...(session.agentReportedModels?.[id] ? { reported: session.agentReportedModels[id] } : {}),
  });
  // A summary without a captain block — a partial config a client has
  // not finished loading — contributes no Captain row rather than an
  // agent whose adapter nothing could name.
  const agents = summary.captain
    ? [
        agentOf(
          CAPTAIN_AGENT_ID,
          i18n._({ id: "Captain", comment: "the session's controlling agent, by name" }),
          summary.captain,
          summary.captain.adapter,
          [],
        ),
      ]
    : [];
  for (const player of session.players) {
    // A player the config no longer holds still has a lane and a
    // pane; it reads its own adapter and tunes nothing it cannot.
    const configured = (summary.players ?? []).find(({ id }) => id === player.id);
    agents.push(agentOf(player.id, player.id, configured?.agent, configured?.agent.adapter ?? player.adapter, divergentFor(player.id)));
  }
  return agents;
}


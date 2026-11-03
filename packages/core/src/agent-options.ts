// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import * as cligent from "@sublang/cligent";
import { subagentEffortValues } from "./config.js";
import type { AdapterName, AgentOptions } from "./protocol.js";

export type AgentModelDiscovery = (adapter: AdapterName, options: { env: NodeJS.ProcessEnv; timeoutMs: number }) => Promise<AgentOptions["discovery"]>;

/** Discovery failures leave configuration editing available. */
export async function readAgentOptions(
  adapter: AdapterName,
  env: NodeJS.ProcessEnv,
  discover: AgentModelDiscovery = cligent.discoverAgentModels,
): Promise<AgentOptions> {
  let discovery: AgentOptions["discovery"];
  try {
    discovery = await discover(adapter, { env, timeoutMs: 10_000 });
  } catch (cause) {
    discovery = { status: "unavailable", reason: cause instanceof Error ? cause.message : String(cause) };
  }
  // Cligent names no default where Claude Code's settings set
  // `ANTHROPIC_MODEL`, which a run then applies over the one it
  // inherits; the run environment carries those settings already, so
  // its value is the model a run selects (settings-35, DR-204).
  const model = env.ANTHROPIC_MODEL?.trim();
  if (adapter === "claude" && discovery.status === "available" && discovery.defaultModel === undefined && model) {
    discovery = { ...discovery, defaultModel: model };
  }
  const effort = cligent.getEffortSupport(adapter);
  return {
    adapter,
    effortValues: effort?.values ?? [],
    fastModeSupported: cligent.isFastModeSupported(adapter),
    subagentModelSupported: cligent.isSubagentModelSupported(adapter),
    // The adapter's efforts less its orchestration values (DR-095).
    subagentEffortValues: subagentEffortValues(adapter),
    discovery,
  };
}

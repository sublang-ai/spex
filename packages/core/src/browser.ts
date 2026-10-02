// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { Cligent, type PermissionPolicy } from "@sublang/cligent";
import { type PlayerAdapterImports } from "@sublang/cligent/tmux-play";
import { loadAgentAdapter } from "./agent-runtime.js";
import { subagentTuningOf } from "./config.js";
import type { AdapterName, AgentBlockInput } from "./protocol.js";

/** Use the same adapter and effective permissions as the execution host.
 * Construction and capabilities never open a provider conversation. */
export async function browserAgent(
  agent: AgentBlockInput & {adapter: AdapterName},
  cwd: string,
  authoring: boolean,
  imports?: PlayerAdapterImports,
): Promise<Cligent<string, boolean, string, string>> {
  const Adapter = await loadAgentAdapter(agent.adapter, imports);
  return new Cligent<string, boolean, string, string>(new Adapter(), {
    cwd,
    model: agent.model,
    effort: agent.effort,
    fastMode: agent.fastMode,
    ...subagentTuningOf(agent),
    permissions: authoring ? {mode: "auto"} : agent.permissions as PermissionPolicy | undefined,
  });
}

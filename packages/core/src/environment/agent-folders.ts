// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent folder table (environments-16, DR-124, DR-130): per agent
// Spex drives, the home folders that show this device has it and
// whether the skill generated for a playbook goes there — Spex's own
// facts — and the folder where it reads project-level skills, relative
// to a working folder, and the one where it reads user-level skills,
// relative to the user's home, as Cligent publishes them in its
// native-skill support: Claude Code reads `.claude/skills`, the other
// four `.agents/skills`.

import { getNativeSkillSupport } from "@sublang/cligent";

export interface AgentFolders {
  /** Relative to the user's home, each written with a leading `~/`:
   * any one standing shows this device has the agent. */
  homes: readonly string[];
  /** Relative to a working folder. */
  project: string;
  /** Relative to the user's home, written with a leading `~/`. */
  user: string;
  /** Whether the skill generated for a playbook goes here. It is for a
   * person's own agent, so it stays from runtimes that invoke a skill
   * unasked or read it in a Captain's decisions. */
  playbooks: boolean;
}

/** What Spex itself knows of each agent it drives. */
const SPEX_FACTS: Readonly<Record<string, Pick<AgentFolders, "homes" | "playbooks">>> = {
  claude: { homes: ["~/.claude"], playbooks: true },
  codex: { homes: ["~/.codex"], playbooks: false },
  gemini: { homes: ["~/.gemini"], playbooks: false },
  kimi: { homes: ["~/.kimi-code"], playbooks: false },
  opencode: { homes: ["~/.config/opencode", "~/.local/share/opencode"], playbooks: false },
};

function agentFolders(agent: string, facts: Pick<AgentFolders, "homes" | "playbooks">): Readonly<AgentFolders> {
  // `getNativeSkillSupport` maps Spex's `claude` to Cligent's `claude-code`.
  const folders = getNativeSkillSupport(agent)?.folders;
  if (folders === undefined) throw new Error(`Cligent publishes no native-skill folders for agent "${agent}"`);
  return Object.freeze({ homes: Object.freeze([...facts.homes]), project: folders.project, user: folders.user, playbooks: facts.playbooks });
}

export const AGENT_FOLDERS: Readonly<Record<string, Readonly<AgentFolders>>> = Object.freeze(
  Object.fromEntries(Object.entries(SPEX_FACTS).map(([agent, facts]) => [agent, agentFolders(agent, facts)])),
);

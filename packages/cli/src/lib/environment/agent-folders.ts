// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent folder table (environments-16, DR-124, DR-130, DR-165): per
// agent Spex drives, the home folders that show this device has it,
// whether the skill generated for a playbook goes there, and the folder
// where it reads project-level skills, relative to a working folder, and
// the one where it reads user-level skills, relative to the user's home,
// as Cligent's published native-skill support states them: Claude Code
// reads `.claude/skills`, the other four `.agents/skills`. The table is
// the library's own data, so the command line carries no agent SDK; a
// test of the core checks the folders against Cligent's.

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

const TABLE: Record<string, AgentFolders> = {
  claude: { homes: ["~/.claude"], project: ".claude/skills", user: "~/.claude/skills", playbooks: true },
  codex: { homes: ["~/.codex"], project: ".agents/skills", user: "~/.agents/skills", playbooks: false },
  gemini: { homes: ["~/.gemini"], project: ".agents/skills", user: "~/.agents/skills", playbooks: false },
  kimi: { homes: ["~/.kimi-code"], project: ".agents/skills", user: "~/.agents/skills", playbooks: false },
  opencode: { homes: ["~/.config/opencode", "~/.local/share/opencode"], project: ".agents/skills", user: "~/.agents/skills", playbooks: false },
};

export const AGENT_FOLDERS: Readonly<Record<string, Readonly<AgentFolders>>> = Object.freeze(
  Object.fromEntries(Object.entries(TABLE).map(([agent, folders]) => [agent, Object.freeze({ ...folders, homes: Object.freeze([...folders.homes]) })])),
);

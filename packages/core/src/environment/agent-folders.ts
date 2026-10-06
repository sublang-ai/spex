// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent folder table (environments-16): per agent Cligent drives,
// the folder where it reads project-level skills, relative to a working
// folder, and the one where it reads user-level skills, relative to the
// user's home. An agent absent here receives no export. Replaced by
// Cligent's answer once Cligent reports where each agent reads skills.

export interface AgentFolders {
  /** Relative to a working folder. */
  project: string;
  /** Relative to the user's home, written with a leading `~/`. */
  user: string;
}

export const AGENT_FOLDERS: Readonly<Record<string, AgentFolders>> = Object.freeze({
  claude: Object.freeze({ project: ".claude/skills", user: "~/.claude/skills" }),
});

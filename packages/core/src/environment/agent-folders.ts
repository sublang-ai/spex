// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The agent folder table (environments-16, DR-124): per agent Spex
// drives, the home folders that show this device has it, the folder
// where it reads project-level skills, relative to a working folder,
// the one where it reads user-level skills, relative to the user's
// home, and whether the skill generated for a playbook goes there. The
// folders are those Cligent's DR-036 names, leaving the copying to the
// host: Claude Code reads `.claude/skills`, the other four
// `.agents/skills`.

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

const AGENTS_FOLDER = { project: ".agents/skills", user: "~/.agents/skills", playbooks: false } as const;

export const AGENT_FOLDERS: Readonly<Record<string, Readonly<AgentFolders>>> = Object.freeze({
  claude: Object.freeze({ homes: Object.freeze(["~/.claude"]), project: ".claude/skills", user: "~/.claude/skills", playbooks: true }),
  codex: Object.freeze({ homes: Object.freeze(["~/.codex"]), ...AGENTS_FOLDER }),
  gemini: Object.freeze({ homes: Object.freeze(["~/.gemini"]), ...AGENTS_FOLDER }),
  kimi: Object.freeze({ homes: Object.freeze(["~/.kimi-code"]), ...AGENTS_FOLDER }),
  opencode: Object.freeze({ homes: Object.freeze(["~/.config/opencode", "~/.local/share/opencode"]), ...AGENTS_FOLDER }),
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { AgentAdapter } from "@sublang/cligent";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";
import type { AdapterName } from "./protocol.js";

const DEFAULT_ADAPTER_IMPORTS: PlayerAdapterImports = {
  claude: async () => (await import("@sublang/cligent/adapters/claude-code")).ClaudeCodeAdapter,
  codex: async () => (await import("@sublang/cligent/adapters/codex")).CodexAdapter,
  gemini: async () => (await import("@sublang/cligent/adapters/gemini")).GeminiAdapter,
  kimi: async () => (await import("@sublang/cligent/adapters/kimi")).KimiAdapter,
  opencode: async () => (await import("@sublang/cligent/adapters/opencode")).OpenCodeAdapter,
};

/** Runtime capability validation belongs to the loaded adapter. */
export async function loadAgentAdapter(adapter: AdapterName, imports = DEFAULT_ADAPTER_IMPORTS): Promise<new () => AgentAdapter<string, boolean, string, string>> {
  return await imports[adapter]() as new () => AgentAdapter<string, boolean, string, string>;
}

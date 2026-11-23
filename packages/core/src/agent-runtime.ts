// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import type { AgentAdapter } from "@sublang/cligent";
import type { PlayerAdapterImports } from "@sublang/cligent/tmux-play";
import type { AdapterName } from "./protocol.js";

export const DEFAULT_ADAPTER_IMPORTS: PlayerAdapterImports = {
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

/** Apply the current user settings before each agent run. */
export function withRunSettings(imports: PlayerAdapterImports, before: (adapter: string) => void): PlayerAdapterImports {
  type Runner = new (...args: any[]) => { run(...args: unknown[]): unknown };
  const wrapped = new Map<string, WeakMap<Runner, Runner>>();
  const loaders: Record<string, () => Promise<Runner>> = {};
  for (const [adapter, load] of Object.entries(imports) as [string, () => Promise<Runner>][]) {
    loaders[adapter] = async () => {
      const Adapter = await load();
      let cache = wrapped.get(adapter);
      if (!cache) { cache = new WeakMap(); wrapped.set(adapter, cache); }
      let WithSettings = cache.get(Adapter);
      if (!WithSettings) {
        WithSettings = class extends Adapter {
          run(...args: unknown[]): unknown {
            before(adapter);
            return super.run(...args);
          }
        };
        cache.set(Adapter, WithSettings);
      }
      return WithSettings;
    };
  }
  return loaders as unknown as PlayerAdapterImports;
}

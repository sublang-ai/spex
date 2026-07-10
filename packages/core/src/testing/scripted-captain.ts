// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Scripted Captain (CORE-18): a deterministic stand-in for the
// Playbook Captain shell so contract tests can drive the real cligent
// runtime and record path without any LLM.

import type {
  BossTurn,
  Captain,
  CaptainContext,
  CaptainSession,
} from "@sublang/cligent/tmux-play";

export type CaptainTurnScript = (
  turn: BossTurn,
  context: CaptainContext,
  session: CaptainSession,
) => Promise<void>;

export function createScriptedCaptain(script: CaptainTurnScript): Captain {
  let activeSession: CaptainSession | undefined;
  return {
    async init(session: CaptainSession): Promise<void> {
      activeSession = session;
    },
    async handleBossTurn(
      turn: BossTurn,
      context: CaptainContext,
    ): Promise<void> {
      if (!activeSession) throw new Error("init must be called first");
      await script(turn, context, activeSession);
    },
    async dispose(): Promise<void> {
      activeSession = undefined;
    },
  };
}

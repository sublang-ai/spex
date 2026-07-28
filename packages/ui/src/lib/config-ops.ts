// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Shared config operations for in-place editors (DR-009, DR-019):
// every write goes through the core's validated config.edit path as
// a merge patch — only the provided keys change, so hand-written
// fields (instruction, granular permissions) survive.

import type { AgentBlockInput } from "@sublang/spex-core/protocol";

import { getClient } from "../state/store.js";

/** A merge patch over an existing agent block (DR-019): provided
 * keys change, absent keys survive, and an explicit null unsets a
 * key so the agent falls back to its adapter's default. */
export type AgentPatch = {
  adapter?: string;
  model?: string | null;
  effort?: string | null;
  permissions?: AgentBlockInput["permissions"] | null;
};

export function setCaptain(patch: AgentPatch): Promise<unknown> {
  return getClient().command("config.edit", {
    op: { kind: "captain.set", patch },
  });
}

export function patchPlayer(
  playbookId: string,
  role: string,
  patch: AgentPatch,
): Promise<unknown> {
  return getClient().command("config.edit", {
    op: { kind: "playbook.player.set", playbookId, role, patch },
  });
}

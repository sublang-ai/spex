// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Shared config operations for in-place editors (DR-009): every
// write goes through the core's validated config.edit path.

import type { ProfileSummary } from "@sublang/spex-core/protocol";

import { getClient } from "../state/store.js";

export function setCaptain(ref: string): Promise<unknown> {
  return getClient().command("config.edit", {
    op: { kind: "captain.set", ref },
  });
}

export function setPlaybookPlayer(
  playbookId: string,
  role: string,
  ref: string,
): Promise<unknown> {
  return getClient().command("config.edit", {
    op: { kind: "playbook.player.set", playbookId, role, ref },
  });
}

/** Save model/effort tweaks via the merging patch op: every other
 * field (instruction, permission policies, comments) is untouched. */
export function saveProfileEssentials(
  profile: ProfileSummary,
  patch: { model?: string; effort?: string },
): Promise<unknown> {
  return getClient().command("config.edit", {
    op: { kind: "profile.patch", id: profile.id, patch },
  });
}

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

/** Save model/effort tweaks, preserving the profile's other fields. */
export function saveProfileEssentials(
  profile: ProfileSummary,
  patch: { model?: string; reasoningEffort?: string },
): Promise<unknown> {
  const model = patch.model ?? profile.model;
  const reasoningEffort = patch.reasoningEffort ?? profile.reasoningEffort;
  return getClient().command("config.edit", {
    op: {
      kind: "profile.save",
      id: profile.id,
      profile: {
        adapter: profile.adapter,
        ...(model ? { model } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(profile.permissions ? { permissions: profile.permissions } : {}),
      },
    },
  });
}

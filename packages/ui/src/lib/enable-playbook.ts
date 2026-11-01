// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Enabling a playbook in one config (playbook-library-3, DR-172): the
// one write behind Enable, wherever it stands — on the Playbooks tab, or
// in place on a package's expanded row on the Packages tab. Each role
// gets a player — `dev.<role>` unless one is chosen — and a player your
// own roster lacks is written to it first, carrying the block chosen for
// its role, so no binding is written dangling.

import type { AgentBlockInput, SessionPlayerSummary } from "@sublang/spex-core/protocol";

import type { SpexClient } from "./client.js";
import { NEUTRAL_BLOCK } from "./config-ops.js";
import { newPlayerId } from "./drafts.js";

export interface EnablePlaybook {
  /** The spex repository whose config is written. */
  repository: string;
  playbookId: string;
  roles: readonly string[];
  /** Your own group's roster, which every binding names. */
  roster: readonly SessionPlayerSummary[];
  /** The player chosen per role; absent, `dev.<role>`. */
  players?: Readonly<Record<string, string>>;
  /** The block a minted player is written with, per role; absent, the
   * neutral default (DR-019). */
  blocks?: Readonly<Record<string, AgentBlockInput>>;
}

/** The player a role is bound to: the one chosen, else `dev.<role>`. */
export function rolePlayer(role: string, players: Readonly<Record<string, string>> = {}): string {
  return (players[role] ?? newPlayerId(role)).trim();
}

/** Write `playbooks.<id>` with a player per role into the config of
 * `repository`, minting each player the roster lacks first; two roles
 * naming one player write it once, from the first. */
export async function enablePlaybook(client: Pick<SpexClient, "command">, input: EnablePlaybook): Promise<void> {
  const { repository, playbookId, roles, roster, players = {}, blocks = {} } = input;
  const existing = new Set(roster.map((player) => player.id));
  const mint = roles
    .map((role) => [rolePlayer(role, players), role] as const)
    .filter(([id], index, all) => all.findIndex(([other]) => other === id) === index)
    .filter(([id]) => !existing.has(id));
  for (const [playerId, role] of mint) {
    await client.command("config.edit", {
      op: { kind: "player.set", playerId, patch: blocks[role] ?? NEUTRAL_BLOCK },
    });
  }
  await client.command("config.edit", {
    repository,
    op: {
      kind: "playbook.add",
      playbookId,
      roles: Object.fromEntries(roles.map((role) => [role, rolePlayer(role, players)])),
    },
  });
}

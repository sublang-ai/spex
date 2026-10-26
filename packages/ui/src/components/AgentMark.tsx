// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// An agent's mark (run-view-177, DR-155): one letter in a circle. The
// Captain keeps the brand colour; every player wears one neutral
// colour, so a coder's "C" and the Captain's differ by colour and name.

import { i18n } from "../i18n.js";
import { markLetter } from "../lib/player-names.js";

const SIZES = {
  sm: "h-4 w-4 text-[10px]",
  md: "h-5 w-5 text-xs",
  lg: "h-6 w-6 text-xs",
} as const;

export function AgentMark({
  player,
  size = "md",
  className = "",
}: {
  /** The player's name; absent for the Captain. */
  player?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const tone = player === undefined
    ? "bg-brand-600 text-white"
    : "bg-neutral-500 text-white dark:bg-neutral-600";
  return (
    <span
      aria-hidden="true"
      data-testid={player === undefined ? "captain-mark" : "player-mark"}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${SIZES[size]} ${tone} ${className}`}
    >
      {player === undefined
        ? i18n._({
            id: "C",
            comment: "the Captain's avatar: one letter standing for Captain",
          })
        : markLetter(player)}
    </span>
  );
}

/** A player's mark and name, its full id in the tooltip. */
export function PlayerName({
  id,
  name,
  size = "md",
  className = "",
  nameClassName = "",
  testId,
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
  nameClassName?: string;
  testId?: string;
}) {
  return (
    <span title={id} className={`inline-flex min-w-0 items-center gap-1.5 ${className}`} {...(testId ? { "data-testid": testId } : {})}>
      <AgentMark player={name} size={size} />
      <span className={`min-w-0 truncate ${nameClassName}`}>{name}</span>
    </span>
  );
}

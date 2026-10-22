// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements beneath its row (space-87, DR-128):
// one line per placement in the order the core sends them — those its
// clone holds in the order added, the path placement last, then each a
// placement file names that no remote here holds, then each instance a
// creation waits at — naming its instance's display name and its path
// there, or the path placement's remote, with what that placement did:
// the step in flight at it, a step waiting at the host, the outcome the
// last sync left there, or its own state and last sync (space-61,
// space-12, space-15, space-64). A row with no clone here carries none.
// The instance's name owns the slack, the path yields below @md and the
// phrase truncates with its title (space-28).

import type { GroupsState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { placementName } from "../lib/placements.js";
import { cloneHere, placementPhrase, type LinePhrase } from "../lib/space.js";

/** A line's phrase tone: the status palette's attention and stopped
 * words (DR-010 §8); everything else reads in the secondary tone. */
const TONES: Record<LinePhrase["tone"], string> = {
  idle: "text-neutral-500",
  running: "text-neutral-500",
  attention: "text-amber-700 dark:text-amber-300",
  stopped: "text-red-600 dark:text-red-400",
};

/** The lines of a row whose clone is here (space-87); none otherwise. */
export function PlacementLines({
  groups,
  repo,
  now,
  dismissed,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  now: number;
  /** The sync phase the reader dismissed on this row's Sync tab. */
  dismissed?: string;
}) {
  if (!cloneHere(repo) || repo.placements.length === 0) return null;
  return (
    <ul data-testid={`space-lines-${repo.key}`} className="flex min-w-0 flex-col gap-0.5 pl-6">
      {repo.placements.map((line) => (
        <PlacementLine
          key={line.instance ?? "path"}
          groups={groups}
          repo={repo}
          line={line}
          now={now}
          dismissed={dismissed}
        />
      ))}
    </ul>
  );
}

/** One placement's line (space-87): its instance, its path there and
 * its phrase, each truncating with its title. */
function PlacementLine({
  groups,
  repo,
  line,
  now,
  dismissed,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  line: PlacementState;
  now: number;
  dismissed?: string;
}) {
  const name = placementName(groups, line);
  const phrase = placementPhrase(repo, line, now, dismissed);
  return (
    <li
      data-testid={`space-line-${line.instance ?? "path"}`}
      data-state={line.state}
      data-attached={String(line.attached)}
      className="flex min-w-0 items-center gap-2 px-2 text-xs"
    >
      <span data-testid="space-line-instance" className="min-w-0 flex-1 truncate" title={name}>
        {name}
      </span>
      {/* The path placement is named by its remote; an instance's
          placement by its instance, its path beside it (space-87). */}
      {line.instance !== null ? (
        <span
          data-testid="space-line-at"
          className="hidden min-w-0 max-w-[35%] truncate text-neutral-500 @md:inline"
          title={line.path}
        >
          {line.path}
        </span>
      ) : null}
      <span
        data-testid="space-line-state"
        data-tone={phrase.tone}
        className={`min-w-0 max-w-[55%] shrink truncate ${TONES[phrase.tone]}`}
        title={phrase.title}
      >
        {phrase.text}
      </span>
    </li>
  );
}

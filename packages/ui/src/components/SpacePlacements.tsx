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
// A reachable placement at an instance carries Members, its panel
// beneath the line naming the other instances the records are placed at
// (space-62), and, on a project's where the view lets the person,
// "Move…" opening that instance's groups beneath the line (space-78);
// each acts on that placement at the instance governing it, and each
// control is described by the line's instance name, so two lines' alike
// controls are told apart. The instance's name owns the slack, the path
// yields below @md, the phrase truncates with its title, Members shows
// its mark below @md and below @xs the controls wrap beneath (space-28).

import { useId, useRef, useState } from "react";
import type { GroupsState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { alsoPlacedAt, governingOfPlacement, placementName } from "../lib/placements.js";
import { cloneHere, placementPhrase, type LinePhrase } from "../lib/space.js";
import { Icon } from "./Icon.js";
import { MovePicker } from "./SpaceGroups.js";
import { MembersPanel } from "./SpaceMembers.js";
import { SECONDARY, type Note } from "./SpaceSurface.js";

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
  movable,
  connected,
  refreshes,
  onNote,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  now: number;
  /** The sync phase the reader dismissed on this row's Sync tab. */
  dismissed?: string;
  /** A project's row, whose placements may move to another group; a
   * group's own records stay in their group, and your own group's in
   * yours (space-78, DR-103). */
  movable: boolean;
  connected: boolean;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  onNote: Note;
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
          movable={movable}
          connected={connected}
          refreshes={refreshes}
          onNote={onNote}
        />
      ))}
    </ul>
  );
}

/** One placement's line (space-87): its instance, its path there and
 * its phrase, each truncating with its title, then the acts on that
 * placement, what they open standing beneath it. */
function PlacementLine({
  groups,
  repo,
  line,
  now,
  dismissed,
  movable,
  connected,
  refreshes,
  onNote,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  line: PlacementState;
  now: number;
  dismissed?: string;
  movable: boolean;
  connected: boolean;
  refreshes: number;
  onNote: Note;
}) {
  const spaceRepositoryMove = useAppStore((state) => state.spaceRepositoryMove);
  const [opened, setOpened] = useState<"members" | "move">();
  const [moving, setMoving] = useState(false);
  const nameId = useId();
  const membersRef = useRef<HTMLButtonElement>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const name = placementName(groups, line);
  const phrase = placementPhrase(repo, line, now, dismissed);
  // The instance governing the placement: its roles and host name, and
  // whether its acts stand (space-1, space-62, git-host-5).
  const governing = governingOfPlacement(groups, repo, line);
  const governed = line.attached && line.instance !== null && governing?.signedIn === true;
  // Members on a reachable placement at an instance (space-87, space-62).
  const showMembers = governed && line.state === "reachable";
  // Move on a project's placement the view lets the person move
  // (space-87, space-78).
  const showMove = governed && movable && line.can.transfer;
  const membersLabel = i18n._({ id: "Members", comment: "list the people the host lets read a spex repository" });
  const moveName = i18n._({ id: "Move to another group", comment: "move a spex repository into another group of the instance, or your own" });
  const origin = line.instance ?? "path";

  const close = (ref: { current: HTMLButtonElement | null }) => {
    setOpened(undefined);
    // Closing never strands focus (DR-010 §6).
    setTimeout(() => ref.current?.focus(), 0);
  };

  /** Move this placement into a group of its instance, or your namespace
   * there where `groupId` is null (space-78): the control reads
   * "Moving…" until the reply, after which the placement stands in its
   * new group as the core holds it — the row under it for the key
   * placement; a refusal is the picker's to show. */
  const move = async (groupId: string | null): Promise<void> => {
    if (line.instance === null) return;
    setMoving(true);
    try {
      await spaceRepositoryMove(repo.key, line.instance, groupId);
      setOpened(undefined);
      // The row may stand under another group now: focus follows this
      // line's Move there (DR-010 §6).
      setTimeout(
        () =>
          document
            .querySelector<HTMLElement>(
              `[data-testid="space-row-${repo.key}"] [data-testid="space-line-${origin}"] [data-testid="space-line-move"]`,
            )
            ?.focus(),
        0,
      );
    } catch (cause) {
      onNote((cause as Error).message);
      throw cause;
    } finally {
      setMoving(false);
    }
  };

  return (
    <li
      data-testid={`space-line-${origin}`}
      data-state={line.state}
      data-attached={String(line.attached)}
      className="flex min-w-0 flex-col gap-1"
    >
      {/* Below @xs the controls wrap beneath the name and the phrase
          (DR-041). */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-2 text-xs @xs:flex-nowrap">
        <span id={nameId} data-testid="space-line-instance" className="min-w-0 flex-1 basis-16 truncate" title={name}>
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
        {showMembers || showMove ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {showMembers ? (
              <button
                ref={membersRef}
                type="button"
                data-testid="space-line-members"
                aria-label={membersLabel}
                aria-describedby={nameId}
                title={membersLabel}
                aria-expanded={opened === "members"}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected}
                onClick={() => setOpened((was) => (was === "members" ? undefined : "members"))}
              >
                {/* Below @md the control keeps its name and shows its mark
                    (DR-041). */}
                <span className="hidden @md:inline">{membersLabel}</span>
                <Icon name="list" className="h-3.5 w-3.5 @md:hidden" />
              </button>
            ) : null}
            {showMove ? (
              <button
                ref={moveRef}
                type="button"
                data-testid="space-line-move"
                // The long name is its title and its accessible name; the
                // label keeps to the row's budget (space-28, DR-041).
                aria-label={moving ? undefined : moveName}
                aria-describedby={nameId}
                title={moveName}
                aria-expanded={opened === "move"}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || moving}
                onClick={() => setOpened((was) => (was === "move" ? undefined : "move"))}
              >
                {moving
                  ? i18n._({ id: "Moving…", comment: "the Move control, while the host moves the spex repository" })
                  : i18n._({ id: "Move…", comment: "open the groups a spex repository may move to; its full name is 'Move to another group'" })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {opened === "members" && showMembers && governing && line.instance !== null ? (
        <MembersPanel
          instance={governing}
          target={{ repository: repo.key, instance: line.instance }}
          id={`${repo.key}@${line.instance}`}
          name={repo.name}
          canManage={line.can.manageMembers}
          alsoPlacedAt={alsoPlacedAt(groups, repo, line)}
          connected={connected}
          refreshes={refreshes}
          onClose={() => close(membersRef)}
          onNote={onNote}
        />
      ) : null}
      {opened === "move" && showMove ? (
        <MovePicker
          groups={groups}
          repo={repo}
          line={line}
          busy={moving}
          connected={connected}
          onMove={move}
          onClose={() => close(moveRef)}
        />
      ) : null}
    </li>
  );
}

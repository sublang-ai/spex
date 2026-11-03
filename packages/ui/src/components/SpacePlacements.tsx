// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements in its Sync tab (space-87, DR-128,
// DR-159, DR-172), never on its row: one line per placement in the order
// the core sends them — those its clone holds in the order added, the
// path placement last, then each a placement file names that no remote
// here holds, then each instance a creation waits at — naming its
// Space's display name and the path of the group it is in there, nothing
// in your namespace and never the records' own `-spex` name, or the path
// placement's remote, with what that placement did: the step in flight at it, a step
// waiting at the Space, the outcome the last sync left there, or its own
// state and last sync (space-61, space-12, space-15, space-64). A row
// with no clone here carries none.
//
// A reachable placement at a Space carries Members, its panel beneath
// the line (space-62). The outcome the last sync left carries its way
// forward: records started separately "Combine…", confirmed
// inline (space-13); a stop Retry (space-15); and an unreachable
// placement whose Space is signed in, on a row still reachable, Retry
// reading the Spaces again (space-61). A placement a file of the clone
// names and no remote here holds reads "Not on this computer" with no
// control: attaching it is not offered here (DR-172). An act confirmed
// beneath the line hands focus back to the control that asked, or to
// the row's name while that control is busy (DR-010 §6). Each control is
// described by the line's Space name, so two lines' alike controls are
// told apart. The Space's name owns the slack, the path yields below
// @md, the phrase truncates with its title, Members shows its mark below
// @md and below @xs the controls wrap beneath (space-28).

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { GroupsState, InstanceGroupState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { instanceOf } from "../lib/instances.js";
import { alsoPlacedAt, governingOfPlacement, placementName, standingEntry } from "../lib/placements.js";
import { cloneHere, lineOutcome, personalLabel, phraseNames, placementPhrase, seatName, type LinePhrase } from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { MembersPanel } from "./SpaceMembers.js";
import { ATTACHED_OWNER } from "./SpacePanel.js";
import { SECONDARY, type Note } from "./SpaceSurface.js";

/** How an entry an instance lists is named where records are shared
 * into it (space-57, space-58): a group by its name, your namespace
 * "Personal", another account's by its login. */
export function entryName(entry: InstanceGroupState): string {
  if (entry.login === null) return entry.name;
  return entry.mine ? personalLabel() : `@${entry.login}`;
}

/** The path of the group a placement is in at its Space (space-87):
 * the part of its path before the last "/", never the records' own
 * `-spex` name; none in your namespace there, which reads as Personal,
 * nor for the path placement. */
export function placementGroupPath(groups: GroupsState, repo: RepositoryState, line: PlacementState): string | null {
  if (line.instance === null || repo.own) return null;
  const parent = line.path.split("/").slice(0, -1).join("/");
  if (!parent) return null;
  const standing = standingEntry(groups, repo, line);
  if (standing?.login != null && standing.mine) return null;
  const login = instanceOf(groups, line.instance)?.account.login;
  return login !== undefined && parent.toLowerCase() === login.toLowerCase() ? null : parent;
}

/** "Combine…" (space-13, DR-172): records started separately at a Space
 * brought into one; its confirm follows. */
export const combineLabel = (): string =>
  i18n._({ id: "Combine…", comment: "beside \"Started separately at <display name>\": asks to bring both sets of records into one; its confirm follows" });

/** The busy form of "Combine…". */
export const combiningLabel = (): string =>
  i18n._({ id: "Combining…", comment: "the Combine… control while both sets of records are brought into one" });

/** The inline confirm of "Combine…" (space-13, DR-010 §4): both sets of
 * records become one, and anything present on both sides differently
 * asks for a choice. */
export function CombineConfirm({ onConfirm, onCancel }: { onConfirm(): void; onCancel(): void }) {
  return (
    <InlineConfirm
      question={
        <>
          <span className="font-medium">
            {i18n._({ id: "Combine both sets of records into one?", comment: "the confirm of Combine… on records started separately at a Space" })}
          </span>
          <span className="text-neutral-600 dark:text-neutral-300">
            {i18n._({ id: "Anything that differs asks you to choose", comment: "the confirm of Combine…: records changed on both sides ask which to keep" })}
          </span>
        </>
      }
      confirmLabel={i18n._({ id: "Combine", comment: "confirm: bring both sets of records into one" })}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

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
  rowName,
  connected,
  refreshes,
  onNote,
  onPendingChange,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  now: number;
  /** The sync phase the reader dismissed on this row's Sync tab. */
  dismissed?: string;
  /** The row's name, which its panels read (space-1). */
  rowName: string;
  connected: boolean;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  onNote: Note;
  onPendingChange?(pending: boolean): void;
}) {
  const [pendingMembers, setPendingMembers] = useState<ReadonlySet<string | null>>(() => new Set());
  const onLinePendingChange = useCallback((instance: string | null, pending: boolean) => {
    setPendingMembers((current) => {
      if (current.has(instance) === pending) return current;
      const next = new Set(current);
      if (pending) next.add(instance); else next.delete(instance);
      return next;
    });
  }, []);
  useEffect(() => { onPendingChange?.(pendingMembers.size > 0); }, [pendingMembers, onPendingChange]);
  useEffect(() => () => { onPendingChange?.(false); }, [onPendingChange]);
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
          rowName={rowName}
          connected={connected}
          refreshes={refreshes}
          onNote={onNote}
          onPendingChange={onLinePendingChange}
        />
      ))}
    </ul>
  );
}

/** What a placement's line answers for the reader (space-87):
 * combining its records, or a retry. */
type LineAct = "combine" | "retry";

/** One placement's line (space-87): its Space, its path there and its
 * phrase, each truncating with its title, then the acts on that
 * placement, what they open standing beneath it. */
function PlacementLine({
  groups,
  repo,
  line,
  now,
  dismissed,
  rowName,
  connected,
  refreshes,
  onNote,
  onPendingChange,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  rowName: string;
  line: PlacementState;
  now: number;
  dismissed?: string;
  connected: boolean;
  refreshes: number;
  onNote: Note;
  onPendingChange(instance: string | null, pending: boolean): void;
}) {
  const store = usePlaceStore();
  const spaceSync = store((state) => state.spaceSync);
  const spaceFetch = store((state) => state.spaceFetch);
  const spaceRefresh = store((state) => state.spaceRefresh);
  const spaceLastAct = store((state) => state.spaceLastAct);
  const [opened, setOpened] = useState<"members" | "combine">();
  const [membersPending, setMembersPending] = useState(false);
  useEffect(() => { onPendingChange(line.instance, membersPending); }, [line.instance, membersPending, onPendingChange]);
  useEffect(() => () => { onPendingChange(line.instance, false); }, [line.instance, onPendingChange]);
  const [membersFocus, setMembersFocus] = useState(0);
  const [busy, setBusy] = useState<LineAct>();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ act: LineAct; key: string }>();
  const [error, setError] = useState<string>();
  const nameId = useId();
  const membersId = useId();
  const membersRef = useRef<HTMLButtonElement>(null);
  const combineRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const name = placementName(groups, line);
  const groupPath = placementGroupPath(groups, repo, line);
  const phrase = placementPhrase(repo, line, now, dismissed, phraseNames(groups, repo, seatName(store.place)));

  const sync = repo.sync;
  const running = sync.phase === "running";
  const machineKey = `${repo.state}|${JSON.stringify(sync)}|${JSON.stringify(line.outcome)}`;
  useEffect(() => {
    if (accepted && accepted.key !== machineKey) setAccepted(undefined);
  }, [accepted, machineKey]);
  const pending = busy !== undefined || accepted !== undefined || running;
  const workingOn = (act: LineAct): boolean => busy === act || accepted?.act === act;
  // The outcome the last sync left on the line, its way forward beside
  // it (space-87): records started separately (space-13), a stop that
  // retrying can help (space-15).
  const outcome = lineOutcome(repo, line, dismissed);
  const showCombine =
    line.attached &&
    (outcome?.kind === "unrelated" ||
      line.branch?.unrelated === true ||
      (sync.phase === "unrelated" && sync.placement === line.instance));
  const stoppedRetry = line.attached && outcome?.kind === "stopped" && outcome.retry;
  // An unreachable placement whose Space is signed in reads the Spaces
  // again, where the row offers no Retry of its own: none while its
  // Space is signed out (space-61).
  const unreachableRetry =
    !stoppedRetry &&
    line.attached &&
    line.state === "unreachable" &&
    line.instance !== null &&
    instanceOf(groups, line.instance)?.signedIn === true &&
    repo.state !== "unreachable";
  const showRetry = stoppedRetry || unreachableRetry;
  // The Space governing the placement: its roles and display name, and
  // whether its acts stand (space-1, space-62, git-host-5).
  const governing = governingOfPlacement(groups, repo, line);
  const governed = line.attached && line.instance !== null && governing?.signedIn === true;
  // Members on a reachable placement at a Space (space-87, space-62).
  const showMembers = governed && line.state === "reachable";
  const membersLabel = i18n._({ id: "Members", comment: "list the people who read a project's records, or a group's members, at the Space" });

  const close = (ref: { current: HTMLButtonElement | null }) => {
    if (membersPending) return;
    setOpened(undefined);
    // Closing never strands focus (DR-010 §6).
    setTimeout(() => ref.current?.focus(), 0);
  };

  /** Close what an act was confirmed in, its focus going to the line's
   * control that asked, or to the row's name where that control is
   * gone or disabled — busy until the machine moves — as a row's panel
   * hands it back (DR-010 §6); focus another part took meanwhile, such
   * as the confirm a refusal says, stays there. */
  const settle = (ref: { current: HTMLButtonElement | null }) => {
    setOpened(undefined);
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const target = ref.current;
      const named = document.querySelector<HTMLElement>(
        `[data-testid="space-row-${repo.key}"] [data-testid="space-repo-${repo.key}"]`,
      );
      (target && target.isConnected && !target.disabled ? target : named)?.focus();
    }, 0);
  };

  /** Send one of the line's acts: accepted at once, its control busy
   * until the machine's state moves (space-29). A refusal stands on
   * the line. */
  const send = async (
    act: LineAct,
    run: () => Promise<unknown>,
    options: { holds?: boolean } = {},
  ): Promise<void> => {
    const key = machineKey;
    setBusy(act);
    setError(undefined);
    try {
      await run();
      if (options.holds !== false) setAccepted({ act, key });
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  /** Combine this placement's records with the clone's (space-13). */
  const combine = () => {
    settle(combineRef);
    void send("combine", () => spaceSync(repo.key, { placement: line.instance, join: true }));
  };

  /** Run again what stopped (space-15): a stopped check checks again,
   * any other stop syncs again — as the join of the placement the page's
   * own join named, as the Sync tab's Retry does, and plainly otherwise,
   * records started separately then offering "Combine…" again
   * (space-13); an unreachable placement reads every signed-in Space
   * again, as the row's Retry does (space-2). */
  const retry = () => {
    if (!stoppedRetry) {
      void send("retry", () => spaceRefresh(), { holds: false });
      return;
    }
    if (sync.phase === "stopped" && sync.op === "check") {
      void send("retry", () => spaceFetch(repo.key));
      return;
    }
    const act = spaceLastAct(repo.key);
    const joined = act?.op === "join" ? act.instance : undefined;
    void send("retry", () => spaceSync(repo.key, joined !== undefined ? { placement: joined, join: true } : {}));
  };

  const origin = line.instance ?? "path";
  return (
    <li
      data-testid={`space-line-${origin}`}
      data-state={line.state}
      data-attached={String(line.attached)}
      className={`flex min-w-0 flex-col gap-1 ${opened === "members" ? ATTACHED_OWNER : ""}`}
    >
      {/* Below @xs the controls wrap beneath the name and the phrase
          (DR-041). */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-2 text-xs @xs:flex-nowrap">
        <span id={nameId} data-testid="space-line-instance" className="min-w-0 flex-1 basis-16 truncate" title={name}>
          {name}
        </span>
        {/* The path placement is named by its remote; a Space's
            placement by its Space, the path of its group beside it —
            none in your namespace (space-87). */}
        {groupPath !== null ? (
          <span
            data-testid="space-line-at"
            className="hidden min-w-0 max-w-[35%] truncate text-neutral-500 @md:inline"
            title={groupPath}
          >
            {groupPath}
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
        {showMembers || showCombine || showRetry ? (
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
                aria-controls={opened === "members" ? membersId : undefined}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || membersPending}
                onClick={() => { setOpened("members"); setMembersFocus((value) => value + 1); }}
              >
                {/* Below @md the control keeps its name and shows its mark
                    (DR-041). */}
                <span className="hidden @md:inline">{membersLabel}</span>
                <Icon name="list" className="h-3.5 w-3.5 @md:hidden" />
              </button>
            ) : null}
            {/* The outcome's way forward stands last, the line's primary
                act (DR-041). */}
            {showCombine ? (
              <button
                ref={combineRef}
                type="button"
                data-testid="space-line-combine"
                aria-describedby={nameId}
                aria-expanded={opened === "combine"}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || pending || membersPending}
                onClick={() => setOpened((was) => (was === "combine" ? undefined : "combine"))}
              >
                {workingOn("combine") ? combiningLabel() : combineLabel()}
              </button>
            ) : null}
            {showRetry ? (
              <button
                ref={retryRef}
                type="button"
                data-testid="space-line-retry"
                aria-describedby={nameId}
                // Reading the Spaces again is what it does where no stop
                // is retried (space-2).
                title={unreachableRetry ? i18n._({ id: "Reads every signed-in Space again", comment: "the title of Retry on records a Space could not be read for" }) : undefined}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || pending || membersPending}
                onClick={retry}
              >
                {workingOn("retry")
                  ? i18n._({ id: "Retrying…", comment: "the Retry control, while the retry is in flight" })
                  : i18n._({ id: "Retry", comment: "run the stopped step again" })}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <p data-testid="space-line-error" role="alert" className="px-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {opened === "combine" && showCombine ? (
        <div data-testid="space-line-combine-confirm" className="px-2">
          <CombineConfirm onConfirm={combine} onCancel={() => close(combineRef)} />
        </div>
      ) : null}
      {opened === "members" && showMembers && governing && line.instance !== null ? (
        <div id={membersId} className="min-w-0">
          <MembersPanel
            embedded
            focusRequest={membersFocus}
            onPendingChange={setMembersPending}
            instance={governing}
            target={{ repository: repo.key, instance: line.instance }}
            id={`${repo.key}@${line.instance}`}
            name={rowName}
            canManage={line.can.manageMembers}
            alsoPlacedAt={alsoPlacedAt(groups, repo, line)}
            connected={connected}
            refreshes={refreshes}
            onClose={() => close(membersRef)}
            onNote={onNote}
          />
        </div>
      ) : null}
    </li>
  );
}

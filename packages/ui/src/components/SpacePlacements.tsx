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
// forward: a first send waiting on the sharing confirm Continue, the
// confirm "Share with <group> at <display name>?" standing beneath the
// line (space-57); records started separately "Combine…", confirmed
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

import { useEffect, useId, useRef, useState } from "react";
import type { GroupsState, InstanceGroupState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import type { SpexCommandError } from "../lib/client.js";
import { instanceOf } from "../lib/instances.js";
import { alsoPlacedAt, governingOfPlacement, placementName, standingEntry } from "../lib/placements.js";
import { cloneHere, lineOutcome, personalLabel, phraseNames, placementPhrase, seatName, type LinePhrase } from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { MembersPanel } from "./SpaceMembers.js";
import { SECONDARY, type Note } from "./SpaceSurface.js";

/** How an entry an instance lists is named where records are shared
 * into it (space-57, space-58): a group by its name, your namespace
 * "Personal", another account's by its login. */
export function entryName(entry: InstanceGroupState): string {
  if (entry.login === null) return entry.name;
  return entry.mine ? personalLabel() : `@${entry.login}`;
}

/** The group a placement is in, as the sharing confirm names it
 * (space-57): the entry it stands in at its Space — your own group's own
 * repository's being "Personal" — else the entry its path lies in, else
 * that path's parent as the Space holds it. */
export function placementGroupName(groups: GroupsState, repo: RepositoryState, line: PlacementState): string {
  const standing = standingEntry(groups, repo, line);
  if (standing) return entryName(standing);
  if (repo.own) return personalLabel();
  const parent = line.path.split("/").slice(0, -1).join("/");
  const instance = instanceOf(groups, line.instance);
  if (instance) {
    const lower = parent.toLowerCase();
    const entry = instance.groups.find((each) => (each.login ?? each.fullPath).toLowerCase() === lower);
    if (entry) return entryName(entry);
    if (lower === instance.account.login.toLowerCase()) return personalLabel();
  }
  return parent || line.path;
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

/** The sharing confirm (space-57, DR-172): "Share with <group> at
 * <display name>?" over what goes there — every session whole, past and
 * future records, what members keep — and, where the records are public,
 * that anyone can read them; Share and Cancel, Cancel focused and Escape
 * cancelling (DR-010 §4). */
export function SharingConfirm({
  group,
  name,
  visibility,
  disabled,
  onShare,
  onCancel,
}: {
  /** The group the records go to, "Personal" for your namespace. */
  group: string;
  /** The display name of the Space they go to. */
  name: string;
  visibility: PlacementState["visibility"];
  disabled?: boolean;
  onShare(): void;
  onCancel(): void;
}) {
  return (
    <InlineConfirm
      question={
        <span data-testid="space-sharing-confirm" className="flex min-w-0 basis-full flex-col gap-0.5">
          <span className="font-medium">
            {i18n._({
              id: "Share with {group} at {name}?",
              values: { group, name },
              comment:
                "the sharing confirm's title, before a project's records first go to a group others read; {group} is the group's name, or Personal; {name} the Space's display name",
            })}
          </span>
          <ul className="list-disc pl-4 text-neutral-600 dark:text-neutral-300">
            <li>{i18n._({ id: "Every session, whole, attachments included", comment: "the sharing confirm: what goes to the group" })}</li>
            <li>{i18n._({ id: "Past and future records", comment: "the sharing confirm: the records made before and after the share both go" })}</li>
            <li>{i18n._({ id: "Members keep what they download", comment: "the sharing confirm: nothing recalls what the group's members downloaded" })}</li>
            {visibility === "public" ? (
              <li>{i18n._({ id: "Public: anyone can read", comment: "the sharing confirm, on records at a public place of the Space" })}</li>
            ) : null}
          </ul>
        </span>
      }
      confirmLabel={i18n._({ id: "Share", comment: "the sharing confirm's control: send the records to the group" })}
      cancelLabel={i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
      disabled={disabled}
      onConfirm={onShare}
      onCancel={onCancel}
    />
  );
}

/** The control a first send waiting on the sharing confirm offers,
 * opening that confirm (space-57, space-87). */
export const continueLabel = (): string =>
  i18n._({
    id: "Continue",
    comment: "beside \"Waiting for you to continue\": opens the sharing confirm for that project's first send to a group",
  });

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
          rowName={rowName}
          connected={connected}
          refreshes={refreshes}
          onNote={onNote}
        />
      ))}
    </ul>
  );
}

/** What a placement's line answers for the reader (space-87): the
 * sharing confirm it owes, combining its records, or a retry. */
type LineAct = "continue" | "combine" | "retry";

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
}) {
  const store = usePlaceStore();
  const spaceSync = store((state) => state.spaceSync);
  const spaceFetch = store((state) => state.spaceFetch);
  const spaceRefresh = store((state) => state.spaceRefresh);
  const spaceLastAct = store((state) => state.spaceLastAct);
  const [opened, setOpened] = useState<"members" | "notice" | "combine">();
  const [busy, setBusy] = useState<LineAct>();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ act: LineAct; key: string }>();
  const [error, setError] = useState<string>();
  // What the confirm's Share sends beside `noticed`: the join a refusal
  // for want of the confirm held back (space-57, space-13).
  const [carried, setCarried] = useState<{ join?: true }>({});
  const nameId = useId();
  const membersRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const combineRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  // The control the confirm answers, which Cancel hands focus back to.
  const askedRef = useRef<HTMLButtonElement | null>(null);
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
  // it (space-87): the confirm owed (space-57), records started
  // separately (space-13), a stop that retrying can help (space-15).
  const outcome = lineOutcome(repo, line, dismissed);
  const showContinue = line.attached && line.instance !== null && outcome?.kind === "waiting";
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

  /** Say the sharing confirm beneath the line, answering `from`, its
   * Share sending what `answer` holds beside `noticed` (space-57). */
  const askConfirm = (from: HTMLButtonElement | null, answer: { join?: true } = {}) => {
    askedRef.current = from;
    setCarried(answer);
    setError(undefined);
    setOpened("notice");
  };

  /** Send one of the line's acts: accepted at once, its control busy
   * until the machine's state moves (space-29). A sync refused for the
   * confirm this placement owes — one the page's read missed — says the
   * confirm on the line instead, its Share carrying what was asked
   * (space-57); any other refusal stands on the line. */
  const send = async (
    act: LineAct,
    run: () => Promise<unknown>,
    options: { holds?: boolean; answer?: { join?: true }; from?: HTMLButtonElement | null } = {},
  ): Promise<void> => {
    const key = machineKey;
    setBusy(act);
    setError(undefined);
    try {
      await run();
      if (options.holds !== false) setAccepted({ act, key });
    } catch (cause) {
      const details = (cause as SpexCommandError).details;
      const named = details?.placement === undefined ? line.instance : details.placement;
      if (options.answer && details?.notice === true && named === line.instance) {
        askConfirm(options.from ?? null, options.answer);
        return;
      }
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  /** Sync this placement with its confirm answered (space-57), and its
   * join where the confirm held one back (space-13). */
  const share = () => {
    settle(askedRef);
    void send("continue", () => spaceSync(repo.key, { placement: line.instance, ...carried, noticed: true }));
  };

  /** Combine this placement's records with the clone's (space-13). */
  const combine = () => {
    settle(combineRef);
    void send("combine", () => spaceSync(repo.key, { placement: line.instance, join: true }), {
      answer: { join: true },
      from: combineRef.current,
    });
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
      void send("retry", () => spaceFetch(repo.key), { from: retryRef.current });
      return;
    }
    const act = spaceLastAct(repo.key);
    const joined = act?.op === "join" ? act.instance : undefined;
    void send("retry", () => spaceSync(repo.key, joined !== undefined ? { placement: joined, join: true } : {}), {
      // The confirm this line owes carries the join where it is this
      // line's (space-57).
      answer: joined === line.instance ? { join: true } : {},
      from: retryRef.current,
    });
  };

  const origin = line.instance ?? "path";
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
        {showMembers || showContinue || showCombine || showRetry ? (
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
            {/* The outcome's way forward stands last, the line's primary
                act (DR-041). */}
            {showContinue ? (
              <button
                ref={continueRef}
                type="button"
                data-testid="space-line-continue"
                aria-describedby={nameId}
                aria-expanded={opened === "notice"}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || pending}
                onClick={() => (opened === "notice" ? close(continueRef) : askConfirm(continueRef.current))}
              >
                {continueLabel()}
              </button>
            ) : null}
            {showCombine ? (
              <button
                ref={combineRef}
                type="button"
                data-testid="space-line-combine"
                aria-describedby={nameId}
                aria-expanded={opened === "combine"}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || pending}
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
                disabled={!connected || pending}
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
      {opened === "notice" && line.instance !== null ? (
        <div data-testid="space-line-notice" className="px-2">
          <SharingConfirm
            group={placementGroupName(groups, repo, line)}
            name={name}
            visibility={line.visibility}
            disabled={!connected}
            onShare={share}
            onCancel={() => close(askedRef)}
          />
        </div>
      ) : null}
      {opened === "combine" && showCombine ? (
        <div data-testid="space-line-combine-confirm" className="px-2">
          <CombineConfirm onConfirm={combine} onCancel={() => close(combineRef)} />
        </div>
      ) : null}
      {opened === "members" && showMembers && governing && line.instance !== null ? (
        <MembersPanel
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
      ) : null}
    </li>
  );
}

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
// each acts on that placement at the instance governing it. The outcome
// the last sync left carries its way forward: a placement owing its
// sharing notice Continue, saying the notice beneath the line first
// (space-57); an unrelated history Join, confirmed inline (space-13); a
// stop Retry (space-15); and an unreachable placement whose instance is
// signed in, on a row still reachable, Retry reading the instances again
// (space-61). A placement a file of the clone names and no remote here
// holds — another device's or another member's proposal — reads "Not on
// this device" with Attach, which says the sharing notice beneath the
// line whatever its members and attaches only on Continue, reading
// "Attaching…" until the attach that follows has run (space-90). Each
// control is described by the line's instance name, so two lines' alike
// controls are told apart. The instance's name owns the slack, the path
// yields below @md, the phrase truncates with its title, Members shows
// its mark below @md and below @xs the controls wrap beneath (space-28).

import { useEffect, useId, useRef, useState } from "react";
import type { GroupsState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import type { SpexCommandError } from "../lib/client.js";
import { instanceOf } from "../lib/instances.js";
import { alsoPlacedAt, governingOfPlacement, placementName } from "../lib/placements.js";
import { cloneHere, lineOutcome, placementPhrase, type LinePhrase } from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { MovePicker } from "./SpaceGroups.js";
import { MembersPanel } from "./SpaceMembers.js";
import { SECONDARY, type Note } from "./SpaceSurface.js";

/** The sharing notice's words (space-57): what goes to a repository
 * others share, and that a public one's records are public. */
export function sharingNotice(visibility: PlacementState["visibility"]): string {
  return visibility === "public"
    ? i18n._(
        "Every session goes there whole — hidden parts and attachments included — and nothing recalls what others downloaded. This repository is public, so its records are public.",
      )
    : i18n._(
        "Every session goes there whole — hidden parts and attachments included — and nothing recalls what others downloaded.",
      );
}

/** The notice's acknowledging control, and a waiting placement's
 * control that says the notice (space-57). */
export const continueLabel = (): string =>
  i18n._({
    id: "Continue",
    comment:
      "confirm: go on with the first sync, or the pick joining a repository others share; on a placement's line waiting for the sharing notice, opens that notice",
  });

/** The sharing notice for one placement (space-57): where its records go
 * — its path at its instance — then what goes there and, where it is
 * public, that its records are public; Continue and Cancel, Cancel
 * focused and Escape cancelling (DR-010 §4). The two sentences are
 * whole messages side by side. */
export function PlacementNotice({
  groups,
  line,
  disabled,
  onContinue,
  onCancel,
}: {
  groups: GroupsState;
  line: PlacementState;
  disabled?: boolean;
  onContinue(): void;
  onCancel(): void;
}) {
  const lead = i18n._({
    id: "Records go to {path} at {name}.",
    values: { path: line.path, name: placementName(groups, line) },
    comment: "the sharing notice's first sentence: {path} is the placement's path at the instance, {name} the instance's display name",
  });
  return (
    <InlineConfirm
      question={
        <>
          <span>{lead}</span>
          <span>{sharingNotice(line.visibility)}</span>
        </>
      }
      confirmLabel={continueLabel()}
      disabled={disabled}
      onConfirm={onContinue}
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

/** What a placement's line answers for the reader (space-87): the
 * sharing notice it owes, the join of its history, a retry, or bringing
 * here a placement another device named. */
type LineAct = "continue" | "join" | "retry" | "attach";

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
  const spaceSync = useAppStore((state) => state.spaceSync);
  const spaceFetch = useAppStore((state) => state.spaceFetch);
  const spaceRefresh = useAppStore((state) => state.spaceRefresh);
  const spaceAttach = useAppStore((state) => state.spaceAttach);
  const spaceLastAct = useAppStore((state) => state.spaceLastAct);
  // "notice" says the sharing notice for a sync, "attach" for an Attach.
  const [opened, setOpened] = useState<"members" | "move" | "notice" | "attach" | "join">();
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState<LineAct>();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ act: LineAct; key: string }>();
  const [error, setError] = useState<string>();
  // What the notice's Continue sends beside `noticed`: the join a
  // refusal for want of the notice held back (space-57, space-13).
  const [carried, setCarried] = useState<{ join?: true }>({});
  // This line's Attach was continued: its control reads "Attaching…"
  // through the attach that follows, the placement held by then.
  const [attachAsked, setAttachAsked] = useState(false);
  const nameId = useId();
  const membersRef = useRef<HTMLButtonElement>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const joinRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const attachRef = useRef<HTMLButtonElement>(null);
  // The control the notice answers, which Cancel hands focus back to.
  const askedRef = useRef<HTMLButtonElement | null>(null);
  const name = placementName(groups, line);
  const phrase = placementPhrase(repo, line, now, dismissed);

  const sync = repo.sync;
  const running = sync.phase === "running";
  const machineKey = `${repo.state}|${JSON.stringify(sync)}|${JSON.stringify(line.outcome)}`;
  useEffect(() => {
    if (accepted && accepted.key !== machineKey) setAccepted(undefined);
  }, [accepted, machineKey]);
  const pending = busy !== undefined || accepted !== undefined || running;
  const workingOn = (act: LineAct): boolean => busy === act || accepted?.act === act;
  // An Attach runs from Continue until the operation it starts ends
  // (space-99): the reply comes once the placement is added, and the
  // sync after it runs as an attach.
  const attachRuns = running && sync.op === "attach";
  const attachHeld = workingOn("attach");
  const attaching = attachHeld || (attachAsked && attachRuns);
  useEffect(() => {
    if (attachAsked && !attachHeld && !attachRuns) setAttachAsked(false);
  }, [attachAsked, attachHeld, attachRuns]);
  // The outcome the last sync left on the line, its way forward beside
  // it (space-87): the notice owed (space-57), an unrelated history
  // (space-13), a stop that retrying can help (space-15).
  const outcome = lineOutcome(repo, line, dismissed);
  const showContinue = line.attached && line.instance !== null && outcome?.kind === "waiting";
  const showJoin =
    line.attached &&
    (outcome?.kind === "unrelated" ||
      line.branch?.unrelated === true ||
      (sync.phase === "unrelated" && sync.placement === line.instance));
  const stoppedRetry = line.attached && outcome?.kind === "stopped" && outcome.retry;
  // An unreachable placement whose instance is signed in reads its
  // instances again, where the row offers no Retry of its own: none
  // while its instance is signed out (space-61).
  const unreachableRetry =
    !stoppedRetry &&
    line.attached &&
    line.state === "unreachable" &&
    line.instance !== null &&
    instanceOf(groups, line.instance)?.signedIn === true &&
    repo.state !== "unreachable";
  const showRetry = stoppedRetry || unreachableRetry;
  // A placement a file of the clone names that no remote here holds,
  // no creation waiting at it: Attach brings it here (space-87,
  // space-90); its control stays, busy, while its attach runs.
  const showAttach =
    (!line.attached && line.waiting === null && line.state === "absent" && line.instance !== null) || attaching;
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

  /** Say the sharing notice beneath the line, answering `from`, its
   * Continue sending what `answer` holds beside `noticed` (space-57). */
  const askNotice = (from: HTMLButtonElement | null, answer: { join?: true } = {}) => {
    askedRef.current = from;
    setCarried(answer);
    setError(undefined);
    setOpened("notice");
  };

  /** Say the sharing notice for an Attach beneath the line, whatever its
   * members (space-90), Cancel handing focus back to Attach. */
  const askAttach = () => {
    askedRef.current = attachRef.current;
    setError(undefined);
    setOpened("attach");
  };

  /** Send one of the line's acts: accepted at once, its control busy
   * until the machine's state moves (space-29). A sync refused for the
   * notice this placement owes — one the page's read missed — says the
   * notice on the line instead, its Continue carrying what was asked
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
        askNotice(options.from ?? null, options.answer);
        return;
      }
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  /** Sync this placement with its notice seen (space-57), and its join
   * where the notice held one back (space-13). */
  const continueSync = () => {
    setOpened(undefined);
    void send("continue", () => spaceSync(repo.key, { placement: line.instance, ...carried, noticed: true }));
  };

  /** Attach this placement with its notice seen (space-90, space-99): a
   * refusal stands on the line. */
  const attach = () => {
    const instance = line.instance;
    if (instance === null) return;
    setOpened(undefined);
    setAttachAsked(true);
    void send("attach", () => spaceAttach(repo.key, instance));
  };

  /** Join this placement's history with the clone's (space-13). */
  const join = () => {
    setOpened(undefined);
    void send("join", () => spaceSync(repo.key, { placement: line.instance, join: true }), {
      answer: { join: true },
      from: joinRef.current,
    });
  };

  /** Run again what stopped (space-15): a stopped check checks again,
   * any other stop syncs again — as the join of the placement the page's
   * own join named, as the Sync tab's Retry does, and plainly otherwise,
   * an unrelated history then offering Join again (space-13); an
   * unreachable placement reads every signed-in instance again, as the
   * row's Retry does (space-2). */
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
      // The notice this line owes carries the join where it is this
      // line's (space-57).
      answer: joined === line.instance ? { join: true } : {},
      from: retryRef.current,
    });
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
        {showMembers || showMove || showContinue || showJoin || showRetry || showAttach ? (
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
                onClick={() => (opened === "notice" ? close(continueRef) : askNotice(continueRef.current))}
              >
                {continueLabel()}
              </button>
            ) : null}
            {showJoin ? (
              <button
                ref={joinRef}
                type="button"
                data-testid="space-line-join"
                aria-describedby={nameId}
                aria-expanded={opened === "join"}
                // What the control does is its own to say (DR-069); a
                // running control's word says it already.
                title={workingOn("join") ? undefined : i18n._("Brings both histories into one and asks about anything that differs")}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || pending}
                onClick={() => setOpened((was) => (was === "join" ? undefined : "join"))}
              >
                {workingOn("join")
                  ? i18n._({ id: "Joining…", comment: "the Join control, while the join runs" })
                  : i18n._({ id: "Join", comment: "confirm: join both histories into one" })}
              </button>
            ) : null}
            {showRetry ? (
              <button
                ref={retryRef}
                type="button"
                data-testid="space-line-retry"
                aria-describedby={nameId}
                // Reading the instances again is what it does where no
                // stop is retried (space-2).
                title={unreachableRetry ? i18n._("Reads each signed-in instance again") : undefined}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || pending}
                onClick={retry}
              >
                {workingOn("retry")
                  ? i18n._({ id: "Retrying…", comment: "the Retry control, while the retry is in flight" })
                  : i18n._({ id: "Retry", comment: "run the stopped step again" })}
              </button>
            ) : null}
            {showAttach ? (
              <button
                ref={attachRef}
                type="button"
                data-testid="space-line-attach"
                aria-describedby={nameId}
                aria-expanded={opened === "attach"}
                className={`${SECONDARY} shrink-0 whitespace-nowrap`}
                disabled={!connected || pending}
                onClick={() => (opened === "attach" ? close(attachRef) : askAttach())}
              >
                {attaching
                  ? i18n._({ id: "Attaching…", comment: "the Attach control while the placement is added and synced" })
                  : i18n._({
                      id: "Attach",
                      comment:
                        "on a line naming a placement another device named, not yet on this device: brings it here after the sharing notice",
                    })}
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
      {opened === "notice" || (opened === "attach" && showAttach) ? (
        <div data-testid="space-line-notice" className="px-2">
          <PlacementNotice
            groups={groups}
            line={line}
            disabled={!connected}
            onContinue={opened === "attach" ? attach : continueSync}
            onCancel={() => close(askedRef)}
          />
        </div>
      ) : null}
      {opened === "join" && showJoin ? (
        <div data-testid="space-line-join-confirm" className="px-2">
          <InlineConfirm
            question={i18n._("Join both histories into one? Anything that differs will ask you to choose.")}
            confirmLabel={i18n._({ id: "Join", comment: "confirm: join both histories into one" })}
            onConfirm={join}
            onCancel={() => close(joinRef)}
          />
        </div>
      ) : null}
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

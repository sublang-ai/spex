// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Sync tab's placement lines, with progress, outcomes and conflict actions.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SpaceState, PlacementState, RepositoryState } from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { instanceOf } from "../lib/instances.js";
import { placementName } from "../lib/placements.js";
import { cloneHere, lineOutcome, phraseNames, placementPhrase, type LinePhrase } from "../lib/space.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { ALERT_INK, ATTENTION_INK } from "./SpacePanel.js";
import { SECONDARY, type Note } from "./SpaceSurface.js";

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
  attention: ATTENTION_INK,
  stopped: ALERT_INK,
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
  groups: SpaceState;
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
  groups: SpaceState;
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
  const store = useAppStore;
  const spaceSync = store((state) => state.spaceSync);
  const spaceFetch = store((state) => state.spaceFetch);
  const spaceRefresh = store((state) => state.spaceRefresh);
  const spaceLastAct = store((state) => state.spaceLastAct);
  const [opened, setOpened] = useState<"combine">();
  const [busy, setBusy] = useState<LineAct>();
  // A long command's reply is only "accepted": its control stays busy
  // until the machine's state moves (DR-010 §3, space-29).
  const [accepted, setAccepted] = useState<{ act: LineAct; key: string }>();
  const [error, setError] = useState<string>();
  const nameId = useId();
  const combineRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const name = placementName(groups, line);
  const phrase = placementPhrase(repo, line, now, dismissed, phraseNames(groups, repo));

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

        <span
          data-testid="space-line-state"
          data-tone={phrase.tone}
          className={`min-w-0 max-w-[55%] shrink truncate ${TONES[phrase.tone]}`}
          title={phrase.title}
        >
          {phrase.text}
        </span>
        {showCombine || showRetry ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
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
        <p data-testid="space-line-error" role="alert" className={`px-2 text-xs ${ALERT_INK}`}>
          {error}
        </p>
      ) : null}
      {opened === "combine" && showCombine ? (
        <div data-testid="space-line-combine-confirm" className="px-2">
          <CombineConfirm onConfirm={combine} onCancel={() => close(combineRef)} />
        </div>
      ) : null}
    </li>
  );
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's Sync tab (DR-057, DR-103, DR-128, DR-159,
// DR-172): its placements' lines (space-87), "To send (<n>)" and each
// placement's "From <display name> (<n>)" by kind in human words
// (space-7, space-8), the running rail with its step line, the placement
// in flight and Stop (space-12, space-16), the choices picker for one
// placement with its one inline confirm (space-9, space-17, space-18) —
// the same picker its row's Resolve shows beneath the row, sharing its
// choices (space-14) — the stopped card with its cause, guidance and
// Retry (space-15), a combining only where this page asked it
// (space-13) — the "Started separately" card (space-13) and in-place
// line diffs headed "Changes on this computer" and "Changes at <display
// name>" (space-10). Every side is this computer's — at a seat's place
// the server's (space-112) — or the Space's by its display name
// (space-17, space-27); Git's own words never lead.

import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  GroupsState,
  PlacementState,
  RepositoryState,
  SpaceChoice,
  SpaceConflict,
  SpaceOp,
  SpaceSide,
  SpaceUnit,
  SyncStep,
} from "@sublang/spex-core/protocol";

import { usePlaceStore } from "../state/place-context.js";
import type { SpaceLastAct } from "../state/store.js";
import { i18n } from "../i18n.js";
import { heldPlacements, instanceNameAt, keyPlacement, placementAt, placementName } from "../lib/placements.js";
import { relativeAge } from "../lib/time.js";
import {
  KIND_LABELS,
  KIND_SINGULAR,
  STEP_LINES,
  STEP_NAMES,
  STEP_ORDER,
  cloneHere,
  groupUnits,
  lineOutcome,
  notHerePhrase,
  phraseNames,
  seatName,
  startedSeparately,
  stoppedPhrase,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { PlacementLines } from "./SpacePlacements.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

type Side = SpaceChoice;
/** What a sync the tab starts carries (space-18, space-29): the choices
 * and the join, each for the placement `placement` names. */
export type SyncInput = { placement?: string | null; choices?: Record<string, Side>; join?: boolean };

/** One unit's line diff in place (space-10): the ancestor against this
 * computer's version, headed "Changes on this computer", or the Space's,
 * headed "Changes at <display name>", `+` and `−` marking every line in
 * text beside its tint, scrolling sideways as a canvas (DR-041). */
function DiffBox({
  repository,
  unit,
  side,
  placement,
  name,
  testId,
}: {
  /** The spex repository's key every `space.*` call names. */
  repository: string;
  unit: SpaceUnit;
  side: Side;
  /** The placement the Space's side is of: its Space's origin, null for
   * the path placement (space-10, space-29). */
  placement?: string | null;
  /** That placement's display name, or the path placement's remote. */
  name: string;
  testId: string;
}) {
  const store = usePlaceStore();
  const spaceDiff = store((state) => state.spaceDiff);
  const seat = seatName(store.place);
  const [patches, setPatches] = useState<{ path: string; patch: string; truncated: boolean }[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setPatches(undefined);
    setError(undefined);
    const paths = unit.paths.length > 0 ? unit.paths : [unit.unit];
    // This computer's side is the clone's own; the Space's is one
    // placement's (space-10).
    const of = side === "remote" ? placement : undefined;
    Promise.all(
      paths.map((path) => spaceDiff(repository, unit.unit, path, side, of).then((result) => ({ path, ...result }))),
    )
      .then((results) => {
        if (!cancelled) setPatches(results);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [repository, unit.unit, unit.paths, side, placement, spaceDiff]);

  if (error) {
    return (
      <p role="alert" data-testid={testId} className="text-xs text-red-600 dark:text-red-400">
        {i18n._("Couldn't load the diff: {reason}", { reason: error })}
      </p>
    );
  }
  if (!patches) {
    return (
      <p data-testid={testId} className="text-xs text-neutral-500">
        {i18n._("Loading diff…")}
      </p>
    );
  }
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <span data-testid={`${testId}-heading`} className="text-xs text-neutral-500">
        {side === "mine"
          ? seat === undefined
            ? i18n._({ id: "Changes on this computer", comment: "a diff's heading: this computer's version against the last version both sides shared" })
            : i18n._({
                id: "Changes on {place}",
                values: { place: seat },
                comment: "a diff's heading on a team server's Space: the server's version against the last version both sides shared; {place} is the server's name",
              })
          : i18n._({
              id: "Changes at {name}",
              values: { name },
              comment: "a diff's heading: the Space's version against the last version both sides shared; {name} is the Space's display name",
            })}
      </span>
      {patches.map(({ path, patch, truncated }) => (
        <div key={path} className="flex min-w-0 flex-col">
          {patches.length > 1 ? (
            <span className="truncate font-mono text-xs text-neutral-500" title={path}>
              {path}
            </span>
          ) : null}
          {/* The box is the canvas (space-28): it scrolls sideways and
              takes focus for the keyboard; each line is inline text, so
              nothing but the box itself is wider than its place. */}
          <pre
            tabIndex={0}
            className="max-h-64 overflow-auto font-mono text-xs leading-5 whitespace-pre"
          >
            {patch === "" ? (
              <span className="text-neutral-500">{i18n._("No difference")}</span>
            ) : (
              patch.split("\n").map((line, index) => {
                const tone =
                  line.startsWith("+") && !line.startsWith("+++")
                    ? "text-emerald-700 dark:text-emerald-300"
                    : line.startsWith("-") && !line.startsWith("---")
                      ? "text-red-700 dark:text-red-300"
                      : line.startsWith("@@")
                        ? "text-brand-700 dark:text-brand-300"
                        : "";
                return (
                  <span key={index} className={tone}>
                    {line}
                    {"\n"}
                  </span>
                );
              })
            )}
          </pre>
          {truncated ? (
            <span className="text-xs text-neutral-500">
              {i18n._("The diff is cut here; the file is longer.")}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** One change row (space-7): the label owns the slack, the detail
 * hides below @md, and the row's control keeps its accessible name in
 * its icon form (space-28). */
function UnitRow({
  repository,
  unit,
  side,
  placement,
  name,
  conflict,
  onOpenSession,
}: {
  repository: string;
  unit: SpaceUnit;
  side: Side;
  /** The placement an incoming row came from (space-8, space-10). */
  placement?: string | null;
  /** The display name its diff heads the Space's side with. */
  name: string;
  conflict: boolean;
  onOpenSession(sessionId: string): void;
}) {
  const [diffOpen, setDiffOpen] = useState(false);
  const detailLines = unit.detail?.split("\n").filter(Boolean) ?? [];
  const label = labelLines(unit.label);
  // A local session row opens the session as a tab (space-7); an
  // incoming one may not exist on this computer yet.
  const canOpen =
    side === "mine" && unit.kind === "session" && unit.sessionId && unit.change !== "deleted";
  return (
    <li
      data-testid={`space-unit-${side}-${unit.unit}`}
      data-change={unit.change}
      className="@container flex flex-col gap-1"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            unit.change === "deleted" ? "bg-red-400" : unit.change === "new" ? "bg-emerald-500" : "bg-neutral-400"
          }`}
        />
        <span className="min-w-0 flex-1 truncate" title={unit.label}>
          {label.first}
        </span>
        {detailLines.length === 1 ? (
          <span className="hidden shrink-0 text-xs text-neutral-500 @md:inline" title={unit.detail}>
            {detailLines[0]}
          </span>
        ) : null}
        <span className="shrink-0 text-xs text-neutral-500">{changeWord(unit.change)}</span>
        {conflict ? (
          <span
            data-testid={`space-choose-${unit.unit}`}
            className="shrink-0 text-xs text-amber-700 dark:text-amber-300"
            title={i18n._({ id: "Changed here and at {name}", values: { name }, comment: "a project's row or placement line: a sync found records changed both on this computer and at that Space, choices owed; {name} is the Space's display name; Resolve stands beside it" })}
          >
            <span aria-hidden>⚠ </span>
            {i18n._({ id: "choose", comment: "mark on a unit changed on both sides" })}
          </span>
        ) : null}
        {canOpen ? (
          <button
            type="button"
            aria-label={i18n._("Open session")}
            title={i18n._("Open session")}
            className={`${SECONDARY} shrink-0`}
            onClick={() => onOpenSession(unit.sessionId!)}
          >
            <span className="hidden @md:inline">{i18n._("Open session")}</span>
            <Icon name="open" className="h-3.5 w-3.5 @md:hidden" />
          </button>
        ) : null}
        {unit.diff ? (
          <button
            type="button"
            aria-label={diffOpen ? i18n._("Hide diff") : i18n._("View diff")}
            title={diffOpen ? i18n._("Hide diff") : i18n._("View diff")}
            aria-expanded={diffOpen}
            className={`${SECONDARY} shrink-0`}
            onClick={() => setDiffOpen((open) => !open)}
          >
            <span className="hidden @md:inline">
              {diffOpen ? i18n._("Hide diff") : i18n._("View diff")}
            </span>
            <Icon name="diff" className="h-3.5 w-3.5 @md:hidden" />
          </button>
        ) : null}
      </div>
      {label.rest.length > 0 ? (
        <ul className="pl-3.5 text-sm">
          {label.rest.map((line) => (
            <li key={line} className="truncate" title={line}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {detailLines.length > 1 ? (
        <ul className="pl-3.5 text-xs text-neutral-500">
          {detailLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {diffOpen ? (
        <DiffBox
          repository={repository}
          unit={unit}
          side={side}
          placement={placement}
          name={name}
          testId={`space-diff-${side}-${unit.unit}`}
        />
      ) : null}
    </li>
  );
}

function UnitList({
  repository,
  units,
  side,
  placement,
  name,
  conflicts,
  level = 3,
  onOpenSession,
  testId,
}: {
  repository: string;
  units: SpaceUnit[];
  side: Side;
  /** The placement an incoming list is of (space-8, space-10). */
  placement?: string | null;
  /** That placement's display name, or the path placement's remote. */
  name: string;
  conflicts: Set<string>;
  /** The kinds' heading level: beneath a placement's heading on the
   * incoming side, one below it. */
  level?: 3 | 4;
  onOpenSession(sessionId: string): void;
  testId: string;
}) {
  const Heading = level === 4 ? "h4" : "h3";
  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      {groupUnits(units).map((group) => (
        <div key={group.kind} className="flex flex-col gap-1">
          <Heading className="text-xs font-medium text-neutral-500">{KIND_LABELS[group.kind]()}</Heading>
          <ul className="flex flex-col gap-1 pl-2">
            {group.units.map((unit) => (
              <UnitRow
                key={unit.unit}
                repository={repository}
                unit={unit}
                side={side}
                placement={placement}
                name={name}
                // The incoming list marks the units this computer changed
                // too (space-8); the local list lists them plainly.
                conflict={side === "remote" && conflicts.has(unit.unit)}
                onOpenSession={onOpenSession}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A unit's change as a word (space-17): the protocol's enum, phrased
 * for the reader; an enum value the page does not know reads as itself. */
function changeWord(change: SpaceSide["change"]): string {
  switch (change) {
    case "new":
      return i18n._({ id: "new", comment: "a sync unit's change: it is new on this side" });
    case "updated":
      return i18n._({ id: "updated", comment: "a sync unit's change: it changed on this side" });
    case "deleted":
      return i18n._({ id: "deleted", comment: "a sync unit's change: it is gone on this side" });
    default:
      return change;
  }
}

/** A side's summary in the picker (space-17): its change, when, and its
 * detail — a deleting side reads "deleted" once, never twice. */
function sideSummary(side: SpaceSide, now: number): string {
  const parts: string[] = [changeWord(side.change)];
  if (side.at !== undefined) parts.push(relativeAge(side.at, now));
  const text = parts.join(" ");
  return side.detail && side.detail !== side.change ? `${text} · ${side.detail}` : text;
}

/** A label's lines (space-7): the registry names one difference per
 * line; the first line owns the row, the rest stand beneath it. */
function labelLines(label: string): { first: string; rest: string[] } {
  const [first = "", ...rest] = label.split("\n").filter((line, index) => index === 0 || line.trim() !== "");
  return { first, rest };
}

/** One conflict row: a radio group named by the unit's label with two
 * exclusive choices, nothing preselected, arrow keys moving within it
 * (space-17, DR-010 §6). */
function ConflictRow({
  repository,
  conflict,
  choice,
  marked,
  now,
  placement,
  name,
  labels,
  scope,
  disabled,
  onChoice,
}: {
  repository: string;
  conflict: SpaceConflict;
  choice?: Side;
  marked: boolean;
  now: number;
  /** The placement the choices are for (space-9, space-10). */
  placement: string | null;
  /** Its display name, which the Space's diff is headed by. */
  name: string;
  /** The two choices' words (space-17): this place's side, and the
   * side of the Space the choices are for. */
  labels: { mine: string; remote: string };
  /** Which picker the row stands in — beneath the row or in its Sync
   * tab — so two standing at once never share a radio group. */
  scope: string;
  disabled: boolean;
  onChoice(unit: string, side: Side): void;
}) {
  const { unit } = conflict;
  const [diffSide, setDiffSide] = useState<Side>();
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
    if (!forward && !backward) return;
    event.preventDefault();
    const radios = Array.from(
      groupRef.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [],
    );
    if (radios.length === 0) return;
    const current = radios.findIndex((radio) => radio === document.activeElement);
    const start = current < 0 ? radios.findIndex((radio) => radio.checked) : current;
    const next = radios[(start + (forward ? 1 : -1) + radios.length) % radios.length];
    next.focus();
    onChoice(unit.unit, next.value as Side);
  };

  const label = labelLines(unit.label);
  const option = (side: Side, label: string, summary: SpaceSide) => {
    const id = `${scope}-choice-${side}-${unit.unit}`;
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor={id} className="flex min-w-0 items-center gap-2 text-sm">
          <input
            id={id}
            data-testid={`space-choice-${side}-${unit.unit}`}
            type="radio"
            name={`${scope}-choice-${unit.unit}`}
            value={side}
            checked={choice === side}
            disabled={disabled}
            onChange={() => onChoice(unit.unit, side)}
            className="accent-brand-600"
          />
          <span className="shrink-0 font-medium">{label}</span>
          {/* A spoken space: the radio's name reads "Keep this
              computer's updated…", never two words run together. */}
          {" "}
          <span className="min-w-0 truncate text-xs text-neutral-500" title={sideSummary(summary, now)}>
            {sideSummary(summary, now)}
          </span>
        </label>
        {summary.diff ? (
          <button
            type="button"
            aria-label={diffSide === side ? i18n._("Hide diff") : i18n._("View diff")}
            aria-expanded={diffSide === side}
            className={SECONDARY}
            onClick={() => setDiffSide((open) => (open === side ? undefined : side))}
          >
            {diffSide === side ? i18n._("Hide diff") : i18n._("View diff")}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={unit.label}
      data-testid={`space-conflict-${unit.unit}`}
      data-marked={marked ? "1" : undefined}
      onKeyDown={onKeyDown}
      className={`flex flex-col gap-1 rounded-lg border p-2 ${
        marked
          ? "border-red-300 dark:border-red-800"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="shrink-0 text-xs text-neutral-500">{KIND_SINGULAR[unit.kind]()}</span>
        <span className="min-w-0 flex-1 truncate font-medium" title={unit.label}>
          {label.first}
        </span>
      </div>
      {label.rest.length > 0 ? (
        <ul className="pl-3.5 text-sm">
          {label.rest.map((line) => (
            <li key={line} className="truncate" title={line}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {option("mine", labels.mine, conflict.mine)}
      {/* The other side names the Space the choices are for
          (space-17). */}
      {option("remote", labels.remote, conflict.remote)}
      {diffSide ? (
        <DiffBox
          repository={repository}
          unit={unit}
          side={diffSide}
          placement={placement}
          name={name}
          testId={`space-diff-${diffSide}-${unit.unit}`}
        />
      ) : null}
    </div>
  );
}

/** The operations whose rail lists the steps (space-12): a sync, a
 * join, a Place and an Attach run them; a check and a Leave read their
 * step line alone. */
const STEPPED_OPS: ReadonlySet<SpaceOp> = new Set(["sync", "join", "place", "attach"]);

/** The six-step rail (space-12): done steps ticked, the current one
 * named by the step line — "Checking <display name>…" while a Space is
 * read — the upcoming muted, the placement in flight named beside the
 * step line where the clone holds more than one; Stop stands only while
 * a transport step runs (space-16). */
function Rail({
  step,
  cancelable,
  op,
  lineName,
  placement,
  onStop,
  stopping,
}: {
  step: SyncStep;
  cancelable: boolean;
  op: SpaceOp;
  /** The placement in flight, by its line's name, which the step line
   * reads; none where the step is at none. */
  lineName?: string;
  /** The same, named beside the step line; none where the clone holds
   * one placement alone or the step line names it already. */
  placement?: string;
  onStop(): void;
  stopping: boolean;
}) {
  const current = STEP_ORDER.indexOf(step);
  return (
    <div
      data-testid="space-rail"
      className="flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950"
    >
      {STEPPED_OPS.has(op) ? (
        <ol
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
          aria-label={i18n._("Sync steps")}
        >
          {STEP_ORDER.map((name, index) => {
            const state = index < current ? "done" : index === current ? "current" : "upcoming";
            return (
              <li
                key={name}
                data-testid={`space-step-${name}`}
                data-state={state}
                className={`flex items-center gap-1 ${
                  state === "upcoming"
                    ? "text-neutral-500"
                    : state === "current"
                      ? "font-medium text-emerald-800 dark:text-emerald-200"
                      : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {state === "done" ? (
                  <Icon name="check" className="h-3 w-3" />
                ) : (
                  <span
                    aria-hidden
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      state === "current" ? "animate-pulse bg-emerald-500" : "bg-neutral-400"
                    }`}
                  />
                )}
                {STEP_NAMES[name]()}
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="space-step-line" className="font-medium">
          {STEP_LINES[step](lineName)}
        </span>
        {/* Apart from the step line, which reads the step alone. */}
        {placement !== undefined ? (
          <>
            <span aria-hidden className="text-xs text-emerald-800 dark:text-emerald-200">
              ·
            </span>
            <span
              data-testid="space-step-placement"
              className="min-w-0 truncate text-xs text-emerald-800 dark:text-emerald-200"
              title={placement}
            >
              {placement}
            </span>
          </>
        ) : null}
        {cancelable ? (
          <button
            type="button"
            data-testid="space-stop"
            className={SECONDARY}
            disabled={stopping}
            onClick={onStop}
          >
            {stopping
              ? i18n._({ id: "Stopping…", comment: "the Stop control, while the stop is in flight" })
              : i18n._({ id: "Stop", comment: "stop the running sync" })}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Card({
  testId,
  tone,
  children,
}: {
  testId: string;
  tone: "red" | "amber" | "emerald" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    red: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950",
    amber: "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950",
    emerald: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950",
    neutral: "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
  };
  return (
    <div data-testid={testId} className={`flex flex-col gap-2 rounded-lg border p-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

/** What Retry sends for a stopped sync (space-15, space-18): the
 * choices last sent, with every conflict's choice standing where all
 * are made, for the placement they are for; and the join this page
 * asked, of the placement it named — a join stopped on its way as the
 * join of its key placement — where no other placement's choices
 * stand. Records started separately that nobody here asked to combine
 * sync plainly, stopping as "Started separately" again with
 * "Combine…" on their line, the confirm still the reader's (space-13). */
export function stoppedRetryInput(
  groups: GroupsState,
  repo: RepositoryState,
  stored: SyncInput | undefined,
  choices: Record<string, Side> | undefined,
  act: SpaceLastAct | undefined,
): SyncInput {
  const input: SyncInput = { ...stored };
  delete input.join;
  const { line, conflicts, units } = conflictsOf(groups, repo);
  const chosen = chosenOf(choices, units);
  if (line && conflicts.length > 0 && Object.keys(chosen).length === conflicts.length) {
    input.placement = line.instance;
    input.choices = chosen;
  }
  const joining = act?.op === "join" ? act : repo.sync.phase === "stopped" && repo.sync.op === "join" ? keyPlacement(repo) : undefined;
  if (joining && (input.placement === undefined || input.placement === joining.instance)) {
    input.placement = joining.instance;
    input.join = true;
  }
  return input;
}

/** A spex repository's Sync tab (space-7..space-18): what this computer
 * changed, what each Space holds that is new, the running rail, the
 * outcome cards and the choices picker. */
export function SyncTab({
  groups,
  repo,
  now,
  connected,
  dismissed,
  rowName,
  refreshes,
  onDismiss,
  onOpenSession,
  onNote,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  now: number;
  connected: boolean;
  /** The row's name, which its panels read (space-1). */
  rowName: string;
  /** The sync phase whose outcome the reader dismissed: the surface
   * holds it, so its placement lines and its row put the same outcomes
   * away (space-87). */
  dismissed?: string;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  onDismiss(phase: string): void;
  onOpenSession(sessionId: string): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const spaceFetch = store((state) => state.spaceFetch);
  const spaceSync = store((state) => state.spaceSync);
  const spaceLastAct = store((state) => state.spaceLastAct);
  const spaceCancel = store((state) => state.spaceCancel);
  const key = repo.key;
  const sync = repo.sync;
  const running = sync.phase === "running";
  const held = heldPlacements(repo);
  const seat = seatName(store.place);

  const [busy, setBusy] = useState<"check" | "retry" | "stop">();
  // An accepted long command keeps its control busy until the machine's
  // state moves (DR-010 §3, space-29): the running frame, or the
  // outcome that landed first.
  const [accepted, setAccepted] = useState<{ where: "check" | "retry" | "stop"; key: string }>();
  const [error, setError] = useState<{ where: "check" | "retry"; message: string }>();
  const useChoices = useContext(ChoicesContext);
  const choicesKey = `${store.place.key}|${key}`;
  const picker = conflictsOf(groups, repo);
  const { line: choicesLine, name: choicesName, units: conflictUnits } = picker;

  const phaseKey = JSON.stringify(sync);
  useEffect(() => {
    if (accepted && accepted.key !== phaseKey) setAccepted(undefined);
  }, [accepted, phaseKey]);
  const showStopped = sync.phase === "stopped" && dismissed !== phaseKey;
  const showDone = sync.phase === "done" && dismissed !== phaseKey;

  /** One placement's incoming units (space-8): what the core lists as
   * incoming, and the units changed on both sides, which it lists under
   * conflicts alone — their rows read the Space's change beside the mark
   * to choose. */
  const unitsOf = (line: PlacementState): SpaceUnit[] => [
    ...line.incoming,
    ...line.conflicts
      .filter((conflict) => !line.incoming.some((unit) => unit.unit === conflict.unit.unit))
      .map((conflict) => ({ ...conflict.unit, change: conflict.remote.change })),
  ];
  /** What one placement's section lists, or why it lists nothing
   * (space-8): records started separately list nothing — until a
   * combining compares against the empty tree and asks its choices
   * (space-9) — a Space holding no records says Sync will send these,
   * and one whose check stopped says so. */
  const incomingOf = (line: PlacementState, name: string): { units: SpaceUnit[]; empty?: string } => {
    const joining = sync.phase === "choices" && sync.placement === line.instance;
    if ((sync.phase === "unrelated" && sync.placement === line.instance) || (line.branch?.unrelated && !joining)) {
      return { units: [], empty: startedSeparately(name) };
    }
    if (line.branch?.hostEmpty) {
      return {
        units: [],
        empty: i18n._({
          id: "{name} holds no records yet; Sync will send these",
          values: { name },
          comment: "a Sync tab's incoming section: the Space holds none of this project's records yet; {name} is the Space's display name",
        }),
      };
    }
    const units = unitsOf(line);
    const checked = line.branch != null && line.branch.checkedAt !== null;
    if (checked && units.length > 0) return { units };
    const outcome = lineOutcome(repo, line, dismissed);
    if (outcome?.kind === "stopped" && outcome.step === "check") {
      return { units: [], empty: stoppedPhrase(outcome.step, outcome.message) };
    }
    return {
      units: [],
      empty: checked
        ? i18n._({ id: "Nothing new at {name}", values: { name }, comment: "a Sync tab's incoming section after a check: the Space holds nothing this computer lacks; {name} is its display name" })
        : i18n._({ id: "Not checked yet", comment: "a Sync tab's incoming section before any check" }),
    };
  };
  // While choices stand, the incoming area lists that placement's units
  // alone, above the picker (space-9); otherwise every placement the
  // clone holds, in order (space-8).
  const sections = (sync.phase === "choices" && choicesLine ? [choicesLine] : held).map((line) => {
    const name = placementName(groups, line);
    return { line, name, ...incomingOf(line, name) };
  });

  // The placement in flight, named on the step line — "Checking <display
  // name>…" — and beside it where the clone holds more than one
  // (space-12).
  const inFlight = running && sync.placement !== undefined ? placementAt(repo, sync.placement) : undefined;
  const flightName = inFlight
    ? placementName(groups, inFlight)
    : running && sync.placement
      ? instanceNameAt(groups, sync.placement)
      : undefined;

  const run = async (
    where: "check" | "retry",
    action: () => Promise<unknown>,
  ) => {
    const phase = phaseKey;
    setBusy(where);
    setError(undefined);
    try {
      await action();
      setAccepted({ where, key: phase });
    } catch (cause) {
      const message = (cause as Error).message;
      setError({ where, message });
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  // A stopped Leave names no placement (space-30) and was asked by no
  // page of this surface (DR-172): it offers no Retry. A Place or an
  // Attach stops only in the sync that follows its add, so its Retry
  // syncs (space-97, space-99).
  const retryOffered = sync.phase === "stopped" && sync.retry && sync.op !== "leave";

  const retry = () => {
    if (sync.phase !== "stopped") return;
    if (sync.op === "check") return run("retry", () => spaceFetch(key));
    const { inputs, choices } = useChoices.getState();
    const input = stoppedRetryInput(groups, repo, inputs[choicesKey], choices[choicesKey], spaceLastAct(key));
    return run("retry", () => spaceSync(key, input));
  };

  const stop = async () => {
    const phase = phaseKey;
    setBusy("stop");
    try {
      const stopped = await spaceCancel(key);
      if (stopped) setAccepted({ where: "stop", key: phase });
      else onNote(i18n._("Nothing to stop"));
    } catch (cause) {
      onNote((cause as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const disabled = !connected;
  const pending = busy !== undefined || accepted !== undefined;

  if (!groups.git.ok) {
    return (
      <div data-testid="space-sync-tab" className="flex flex-col gap-3">
        {/* The core names the install act for this computer (space-1). */}
        <p className="text-sm">{groups.git.guidance}</p>
      </div>
    );
  }

  if (!cloneHere(repo)) {
    return (
      <div data-testid="space-sync-tab" className="flex flex-col gap-3">
        <p className="text-sm text-neutral-500">{notHerePhrase(seat)}</p>
      </div>
    );
  }

  const checkLabel =
    busy === "check" || accepted?.where === "check" || (running && sync.op === "check")
      ? i18n._({ id: "Checking…", comment: "sync step running: reading what the Space holds" })
      : i18n._({ id: "Check", comment: "a Sync tab's control: read what each Space holds that this computer lacks, bringing nothing in yet" });
  // Records only on this computer have no Space's copy to check
  // (space-29: `space.fetch` refuses a local-only one).
  const checkDisabled =
    disabled || running || pending || repo.mergePending || repo.state === "local-only";
  const nothingToSend =
    seat === undefined
      ? i18n._({ id: "Nothing to send from this computer", comment: "a Sync tab's To send list with nothing in it" })
      : i18n._({
          id: "Nothing to send from {place}",
          values: { place: seat },
          comment: "a Sync tab's To send list on a team server's Space, nothing in it; {place} is the server's name",
        });

  return (
    <div data-testid="space-sync-tab" className="flex flex-col gap-3">
      {/* The records' places, one line per placement, stand here and on
          no row (space-87, DR-159). */}
      <PlacementLines
        groups={groups}
        repo={repo}
        now={now}
        dismissed={dismissed}
        rowName={rowName}
        connected={connected}
        refreshes={refreshes}
        onNote={onNote}
      />
      {repo.mergePending ? (
        <Card testId="space-merge-note" tone="amber">
          {i18n._({ id: "Finish or abort the merge in your terminal", comment: "a Git merge started in a terminal is pending in a project's records" })}
        </Card>
      ) : null}

      {running ? (
        <Rail
          step={sync.step}
          cancelable={sync.cancelable}
          op={sync.op}
          lineName={flightName}
          placement={held.length > 1 && sync.step !== "check" ? flightName : undefined}
          onStop={() => void stop()}
          stopping={busy === "stop" || accepted?.where === "stop"}
        />
      ) : null}
      {sync.phase === "choices" ? (
        <Card testId="space-choices-note" tone="amber">
          <span data-testid="space-step-line" className="font-medium">
            {i18n._("Needs your choice")}
          </span>
          <span className="text-xs">
            {i18n._({
              id: "Your changes are saved; nothing is sent to {name} yet",
              values: { name: choicesName },
              comment: "the choices note; {name} is that placement's Space's display name, or the path placement's remote",
            })}
          </span>
        </Card>
      ) : null}
      {sync.phase === "unrelated" ? (
        <Card testId="space-unrelated" tone="amber">
          <span className="font-medium">
            {startedSeparately(phraseNames(groups, repo, seat).nameAt(sync.placement))}
          </span>
        </Card>
      ) : null}
      {showStopped && sync.phase === "stopped" ? (
        <Card testId="space-stopped" tone={sync.cause === "rejected" ? "amber" : "red"}>
          <span className="font-medium" data-testid="space-stopped-title">
            {stoppedPhrase(sync.step, sync.message)}
          </span>
          {/* One block: the guidance names what the Space said and the
              way forward (space-50). */}
          {sync.guidance ? <span className="text-xs">{sync.guidance}</span> : null}
          {sync.step === "push" && (keyPlacement(repo)?.branch?.ahead ?? 0) > 0 ? (
            <span className="text-xs">
              {seat === undefined
                ? i18n._({ id: "Saved on this computer, not sent yet", comment: "a stopped send's card: the records are saved here and wait to be sent" })
                : i18n._({
                    id: "Saved on {place}, not sent yet",
                    values: { place: seat },
                    comment: "a stopped send's card on a team server's Space: the records are saved there and wait to be sent; {place} is the server's name",
                  })}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {retryOffered ? (
              <button
                type="button"
                data-testid="space-retry"
                className={SECONDARY}
                disabled={disabled || pending}
                onClick={() => void retry()}
              >
                {busy === "retry" || accepted?.where === "retry"
                  ? i18n._({ id: "Retrying…", comment: "the Retry control, while the retry is in flight" })
                  : i18n._({ id: "Retry", comment: "run the stopped step again" })}
              </button>
            ) : null}
            <button
              type="button"
              data-testid="space-dismiss"
              className={SECONDARY}
              onClick={() => onDismiss(phaseKey)}
            >
              {i18n._({ id: "Dismiss", comment: "put this outcome card away" })}
            </button>
            {error?.where === "retry" ? (
              <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                {error.message}
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}
      {showDone && sync.phase === "done" ? (
        <Card testId="space-done" tone="emerald">
          <div className="flex flex-wrap items-center gap-2">
            <Icon name="check" className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
            <span className="font-medium" data-testid="space-done-line">
              {!sync.pushed && repo.state === "read-only"
                ? i18n._({
                    id: "{received} received; nothing sent",
                    values: { received: sync.received },
                    comment: "a read-only project's Sync tab after a sync: how many records came back; nothing was sent, the Space letting this account only read",
                  })
                : sync.sent + sync.received === 0
                  ? i18n._("Everything is in sync")
                  : i18n._("Synced {age} · {sent} sent · {received} received", {
                      age: relativeAge(sync.at, now),
                      sent: sync.sent,
                      received: sync.received,
                    })}
            </span>
            <button
              type="button"
              data-testid="space-dismiss"
              className={SECONDARY}
              onClick={() => onDismiss(phaseKey)}
            >
              {i18n._({ id: "Dismiss", comment: "put this outcome card away" })}
            </button>
          </div>
        </Card>
      ) : null}

      <section aria-labelledby="space-local-heading" className="flex flex-col gap-2">
        <h2 id="space-local-heading" className="text-sm font-medium">
          {i18n._({ id: "To send ({count})", values: { count: repo.local.length }, comment: "a Sync tab's heading over the records this computer changed that no Space holds yet; {count} how many" })}
        </h2>
        {repo.local.length === 0 ? (
          <p className="text-sm text-neutral-500">{nothingToSend}</p>
        ) : (
          <UnitList
            repository={key}
            units={repo.local}
            side="mine"
            name=""
            conflicts={conflictUnits}
            onOpenSession={onOpenSession}
            testId="space-local-list"
          />
        )}
      </section>

      <section aria-label={i18n._({ id: "Incoming", comment: "the Sync tab's part listing what each Space holds that this computer lacks" })} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {error?.where === "check" ? (
            <span role="alert" className="min-w-0 flex-1 text-xs text-red-600 dark:text-red-400">
              {error.message}
            </span>
          ) : null}
          <button
            type="button"
            data-testid="space-check"
            className={SECONDARY}
            disabled={checkDisabled}
            onClick={() => void run("check", () => spaceFetch(key))}
          >
            {checkLabel}
          </button>
        </div>
        {sections.length === 0 ? (
          // Records held at no Space have none to check (space-29).
          <p className="text-sm text-neutral-500">{i18n._({ id: "Not checked yet", comment: "a Sync tab's incoming section before any check" })}</p>
        ) : (
          // Each placement's units under "From <display name> (<n>)", the
          // path placement's under its remote (space-8).
          sections.map(({ line, name, units, empty }) => {
            const checkedAt = line.branch?.checkedAt ?? null;
            const headingId = `space-incoming-heading-${line.instance ?? "path"}`;
            return (
              <div
                key={line.instance ?? "path"}
                role="group"
                aria-labelledby={headingId}
                data-testid={`space-incoming-${line.instance ?? "path"}`}
                className="flex min-w-0 flex-col gap-1"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 id={headingId} className="min-w-0 truncate text-sm font-medium" title={name}>
                    {i18n._({
                      id: "From {name} ({count})",
                      values: { name, count: units.length },
                      comment: "a Sync tab's heading over what one Space holds that this computer lacks; {name} is the Space's display name, {count} how many",
                    })}
                  </h2>
                  {checkedAt !== null ? (
                    <span className="hidden shrink-0 text-xs text-neutral-500 @2xl:inline">
                      {i18n._("· checked {age}", { age: relativeAge(checkedAt, now) })}
                    </span>
                  ) : null}
                </div>
                {empty !== undefined ? (
                  <p className="text-sm text-neutral-500">{empty}</p>
                ) : (
                  <UnitList
                    repository={key}
                    units={units}
                    side="remote"
                    placement={line.instance}
                    name={name}
                    // Marked to choose from this placement's own
                    // conflicts (space-8).
                    conflicts={new Set(line.conflicts.map((conflict) => conflict.unit.unit))}
                    level={4}
                    onOpenSession={onOpenSession}
                    testId="space-incoming-list"
                  />
                )}
              </div>
            );
          })
        )}
      </section>

      {picker.stands ? (
        <ConflictsPicker groups={groups} repo={repo} now={now} connected={connected} scope="space" onNote={onNote} />
      ) : null}
    </div>
  );
}

/** What a repository's choices picker is for (space-9, space-14,
 * space-17): the placement the sync ended in choices at, else — a
 * stopped Apply names none — the first in order holding conflicts; its
 * name, its conflicts and their units; whether the picker stands; and
 * the unit a stopped Apply's refusal names. */
export function conflictsOf(
  groups: GroupsState,
  repo: RepositoryState,
): { line?: PlacementState; name: string; conflicts: SpaceConflict[]; units: Set<string>; stands: boolean; marked?: string } {
  const sync = repo.sync;
  const firstWithConflicts = heldPlacements(repo).find((line) => line.conflicts.length > 0);
  const line =
    sync.phase === "choices"
      ? (placementAt(repo, sync.placement) ?? firstWithConflicts)
      : sync.phase === "stopped" && sync.step === "apply"
        ? firstWithConflicts
        : undefined;
  const name = line
    ? placementName(groups, line)
    : sync.phase === "choices" && sync.placement !== null
      ? instanceNameAt(groups, sync.placement)
      : "";
  const conflicts = line?.conflicts ?? [];
  const stands =
    line !== undefined && conflicts.length > 0 && (sync.phase === "choices" || (sync.phase === "stopped" && sync.step === "apply"));
  const marked =
    sync.phase === "stopped" && sync.step === "apply"
      ? conflicts.find((conflict) => sync.message.includes(conflict.unit.label))?.unit.unit
      : undefined;
  return { line, name, conflicts, units: new Set(conflicts.map((conflict) => conflict.unit.unit)), stands, marked };
}

/** The choices made for each repository's conflicts, by its place and
 * key, and the last sync the surface sent with them (space-14,
 * space-17). */
interface Choices {
  choices: Record<string, Record<string, Side>>;
  inputs: Record<string, SyncInput>;
}
export type ChoicesStore = UseBoundStore<StoreApi<Choices>>;

/** One surface's choices: shared by every picker of a repository it
 * shows — beneath its row and in its Sync tab — and kept while the
 * surface stands, until that repository's sync completes. */
export function createChoices(): ChoicesStore {
  return create<Choices>(() => ({ choices: {}, inputs: {} }));
}

/** The choices of the surface a picker stands in. */
export const ChoicesContext = createContext<ChoicesStore>(createChoices());

/** Forget the choices of every repository whose sync has completed
 * since they were made: a later round asks afresh, nothing preselected
 * (space-17). */
export function forgetCompleted(store: ChoicesStore, place: string, repos: readonly RepositoryState[]): void {
  const { choices, inputs } = store.getState();
  const done = repos
    .filter((repo) => repo.sync.phase === "done" || repo.sync.phase === "idle")
    .map((repo) => `${place}|${repo.key}`)
    .filter((key) => key in choices || key in inputs);
  if (done.length === 0) return;
  const drop = <T,>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).filter(([key]) => !done.includes(key)));
  store.setState({ choices: drop(choices), inputs: drop(inputs) });
}

/** The choices still standing: one for a unit that is no longer a
 * conflict is dropped, the rest stand. */
function chosenOf(choices: Record<string, Side> | undefined, units: Set<string>): Record<string, Side> {
  return Object.fromEntries(Object.entries(choices ?? {}).filter(([unit]) => units.has(unit)));
}

/** A repository's choices picker (space-17, space-18): a row per
 * conflicting unit with "Keep this computer's" — at a seat's place
 * "Keep <server>'s" (space-112) — and "Take <display name>'s",
 * nothing preselected; "All here" and "All <display name>'s" filling
 * every row; Apply disabled with "N of M chosen" until every row has a
 * choice, then one inline confirm, Cancel focused, starting the sync
 * carrying the choices for that placement, and its join while its
 * history is unrelated. It stands beneath the row, by Resolve, and in
 * the Sync tab, the two sharing their choices; `scope` keeps their
 * radio groups apart. */
export function ConflictsPicker({
  groups,
  repo,
  now,
  connected,
  scope,
  onNote,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  now: number;
  connected: boolean;
  scope: string;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const spaceSync = store((state) => state.spaceSync);
  const useChoices = useContext(ChoicesContext);
  const key = `${store.place.key}|${repo.key}`;
  const choices = useChoices((state) => state.choices[key]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState<string>();
  const [error, setError] = useState<string>();
  const { line, name, conflicts, units, marked } = conflictsOf(groups, repo);
  const chosen = chosenOf(choices, units);
  const chosenCount = Object.keys(chosen).length;
  const total = conflicts.length;
  const remoteCount = Object.values(chosen).filter((side) => side === "remote").length;
  const phaseKey = JSON.stringify(repo.sync);
  useEffect(() => {
    if (accepted !== undefined && accepted !== phaseKey) setAccepted(undefined);
  }, [accepted, phaseKey]);
  const applying = busy || accepted !== undefined;
  const seat = seatName(store.place);
  const ids = useId();

  const choose = (next: Record<string, Side>) =>
    useChoices.setState((state) => ({ choices: { ...state.choices, [key]: next } }));

  /** Apply the choices for that placement, and its join while its
   * history is unrelated (space-18): accepted at once, Apply busy until
   * the machine moves. */
  const apply = async () => {
    if (!line) return;
    const input: SyncInput = {
      placement: line.instance,
      choices: chosen,
      ...(line.branch?.unrelated ? { join: true } : {}),
    };
    useChoices.setState((state) => ({ inputs: { ...state.inputs, [key]: input } }));
    const phase = phaseKey;
    setBusy(true);
    setError(undefined);
    try {
      await spaceSync(repo.key, input);
      setAccepted(phase);
    } catch (cause) {
      const message = (cause as Error).message;
      setError(message);
      onNote(message);
    } finally {
      setBusy(false);
    }
  };

  if (!line || total === 0) return null;
  const disabled = !connected;
  const labels = {
    mine:
      seat === undefined
        ? i18n._({ id: "Keep this computer's", comment: "a choice on records changed on both sides: keep this computer's version" })
        : i18n._({
            id: "Keep {place}'s",
            values: { place: seat },
            comment: "a choice on records changed on both sides, on a team server's Space: keep the server's version; {place} is the server's name",
          }),
    remote: i18n._({
      id: "Take {name}'s",
      values: { name },
      comment: "a choice on records changed on both sides: take the Space's version; {name} is the Space's display name",
    }),
  };
  const chosenId = `${ids}-chosen`;
  return (
    <section data-testid="space-picker" aria-labelledby={`${ids}-heading`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${ids}-heading`} className="min-w-0 flex-1 text-sm font-medium">
          {i18n._("Choose for {count, plural, one {# conflict} other {# conflicts}}", { count: total })}
        </h2>
        <span id={chosenId} data-testid="space-chosen" className="text-xs text-neutral-500">
          {i18n._("{chosen} of {total} chosen", { chosen: chosenCount, total })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {conflicts.map((conflict) => (
          <ConflictRow
            key={conflict.unit.unit}
            repository={repo.key}
            conflict={conflict}
            choice={chosen[conflict.unit.unit]}
            marked={marked === conflict.unit.unit}
            now={now}
            placement={line.instance}
            name={name}
            labels={labels}
            scope={scope}
            disabled={disabled || applying}
            onChoice={(unit, side) => choose({ ...chosen, [unit]: side })}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="space-all-mine"
          className={SECONDARY}
          disabled={disabled}
          onClick={() => choose(Object.fromEntries(conflicts.map((c) => [c.unit.unit, "mine" as Side])))}
        >
          {i18n._({ id: "All here", comment: "choose this computer's version for every record changed on both sides" })}
        </button>
        <button
          type="button"
          data-testid="space-all-remote"
          className={SECONDARY}
          disabled={disabled}
          onClick={() => choose(Object.fromEntries(conflicts.map((c) => [c.unit.unit, "remote" as Side])))}
        >
          {i18n._({
            id: "All {name}'s",
            values: { name },
            comment: "choose the Space's version for every record changed on both sides; {name} is the Space's display name",
          })}
        </button>
        <span className="flex-1" />
        {confirming ? (
          <span data-testid="space-apply-confirm">
            <InlineConfirm
              question={
                remoteCount === 0
                  ? seat === undefined
                    ? i18n._({
                        id: "{count, plural, one {Keep this computer's version? {name}'s stays in Git history} other {Keep this computer's version of all #? {name}'s stays in Git history}}",
                        values: { count: total, name },
                        comment: "Apply's confirm, every choice keeping this computer's side; {name} is the Space's display name",
                      })
                    : i18n._({
                        id: "{count, plural, one {Keep {place}'s version? {name}'s stays in Git history} other {Keep {place}'s version of all #? {name}'s stays in Git history}}",
                        values: { count: total, place: seat, name },
                        comment: "Apply's confirm on a team server's Space, every choice keeping the server's side; {place} is the server's name, {name} the Space's display name",
                      })
                  : i18n._({
                      id: "{count, plural, one {Take {name}'s version of # record?} other {Take {name}'s version of # records?}} The other stays in Git history; a replaced session loses its resume hints and where you stopped reading",
                      values: { count: remoteCount, name },
                      comment: "Apply's confirm where some choices take the Space's side; {name} is the Space's display name, {count} how many records it replaces",
                    })
              }
              confirmLabel={i18n._({ id: "Apply", comment: "confirm: apply the chosen versions" })}
              onConfirm={() => {
                setConfirming(false);
                void apply();
              }}
              onCancel={() => setConfirming(false)}
            />
          </span>
        ) : (
          <button
            type="button"
            data-testid="space-apply"
            className={PRIMARY}
            aria-describedby={chosenId}
            disabled={disabled || chosenCount < total || applying}
            onClick={() => setConfirming(true)}
          >
            {applying
              ? i18n._({ id: "Applying…", comment: "sync step running: applying the chosen versions" })
              : i18n._({ id: "Apply", comment: "confirm: apply the chosen versions" })}
          </button>
        )}
        {error ? (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </span>
        ) : null}
      </div>
    </section>
  );
}

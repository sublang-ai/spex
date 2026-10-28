// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's Sync tab (DR-057, DR-103, DR-128, DR-159): its
// placements' lines (space-87), local units and each placement's
// incoming units by kind in human words (space-7, space-8), the running
// rail with its step line, the placement in flight and Stop (space-12,
// space-16), the choices picker for one placement with its one inline
// confirm (space-9, space-17, space-18) — the same picker its row's
// Resolve shows beneath the row, sharing its choices (space-14) — the
// stopped card with its cause, guidance and Retry (space-15) — a
// stopped Leave's sending that Leave again (space-89), and a join only
// where this page joined that placement (space-13) — the
// unrelated-history card (space-13) and in-place line diffs
// (space-10); and the home's issues list with its repairs, each named
// by its project and group (space-46..space-55). Every side is this
// place's or the instance's (space-17, space-27); Git's own words never
// lead.

import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import type {
  DiagnosticRepair,
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
import { isLocalPlace } from "../state/store.js";
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
  projectName,
  seatName,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { LINK } from "./SpaceSurface.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { PlacementLines } from "./SpacePlacements.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

type Side = SpaceChoice;
/** What a sync the tab starts carries (space-18, space-29): the choices
 * and the join, each for the placement `placement` names. */
type SyncInput = { placement?: string | null; choices?: Record<string, Side>; join?: boolean };

/** One unit's line diff in place (space-10): the ancestor against this
 * device's version or the host's, `+` and `−` marking every line in
 * text beside its tint, scrolling sideways as a canvas (DR-041). */
function DiffBox({
  repository,
  unit,
  side,
  placement,
  testId,
}: {
  /** The spex repository's key every `space.*` call names. */
  repository: string;
  unit: SpaceUnit;
  side: Side;
  /** The placement the host's side is of: its instance's origin, null
   * for the path placement (space-10, space-29). */
  placement?: string | null;
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
    // This device's side is the clone's own; the host's is one
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
      <span className="text-xs text-neutral-500">
        {side === "mine"
          ? seat === undefined
            ? i18n._("This device against the common ancestor")
            : i18n._({
                id: "{place} against the common ancestor",
                values: { place: seat },
                comment: "a diff's heading on a team server's Space: the server's version against the common ancestor; {place} is the server's name",
              })
          : i18n._("The host's version against the common ancestor")}
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
  conflict,
  onOpenSession,
}: {
  repository: string;
  unit: SpaceUnit;
  side: Side;
  /** The placement an incoming row came from (space-8, space-10). */
  placement?: string | null;
  conflict: boolean;
  onOpenSession(sessionId: string): void;
}) {
  const [diffOpen, setDiffOpen] = useState(false);
  const detailLines = unit.detail?.split("\n").filter(Boolean) ?? [];
  const label = labelLines(unit.label);
  // A local session row opens the session as a tab (space-7); an
  // incoming one may not exist on this device yet.
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
            title={i18n._("Changed on both sides — choose which version to keep")}
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
                // The incoming list marks the units this device changed
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

/** The pending-merge diagnostic the core folds into the issues (space-1)
 * reads in plain words; Git's own file name survives in the title
 * (space-27). */
const MERGE_HEAD_FILE = ".git/MERGE_HEAD";

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
  /** The two choices' words (space-17): this place's side, and the
   * side of the instance the choices are for. */
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
          {/* A spoken space: the radio's name reads "Keep what's here
              updated…", never two words run together. */}
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
      {/* The other side names the instance the choices are for
          (space-17). */}
      {option("remote", labels.remote, conflict.remote)}
      {diffSide ? (
        <DiffBox
          repository={repository}
          unit={unit}
          side={diffSide}
          placement={placement}
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
 * named by the step line, the upcoming muted, the placement in flight
 * named beside the step line where the clone holds more than one; Stop
 * stands only while a transport step runs (space-16). */
function Rail({
  step,
  cancelable,
  op,
  placement,
  onStop,
  stopping,
}: {
  step: SyncStep;
  cancelable: boolean;
  op: SpaceOp;
  /** The placement in flight, by its line's name; none where the clone
   * holds one alone or the step is at none. */
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
          {STEP_LINES[step]()}
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

/**
 * A repair the core folded (space-46). A spex repository no working
 * folder here pairs asks the one question that follows: which folder
 * on this device is it? Pairing one is picking a folder, so the row
 * speaks of projects and folders and never of a folder "having" a
 * project (DR-065). A working folder whose clone is missing has no
 * records here to pair, so its row offers to forget the folder.
 *
 * Declining leaves the row standing and quiet, still offering what it
 * offered, so changing your mind needs no separate undo.
 */
function RepairRow({
  repair,
  disabled,
  focusSeq,
  onResolved,
  onNote,
}: {
  repair: DiagnosticRepair;
  disabled: boolean;
  /** Set when focus moves here; a new value moves it again. */
  focusSeq?: number;
  onResolved(key: string, summary: string, projectId?: string): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const rebindProject = store((state) => state.rebindProject);
  const removeProject = store((state) => state.removeProject);
  const decline = store((state) => state.spaceRepairDecline);
  // A remote place's core allocates every project's folder (space-103,
  // run-view-169): no folder is named there, picked or typed; its words
  // name the server where they would name this device (space-112).
  const local = isLocalPlace(store.place);
  const seat = seatName(store.place);
  const proposal = repair.proposal;
  const recorded = repair.directories[0] ?? "";
  const folderRepair = repair.kind === "folder";
  const [editing, setEditing] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [path, setPath] = useState(proposal?.path ?? recorded);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string>();
  const fieldRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusSeq !== undefined) firstRef.current?.focus();
  }, [focusSeq]);

  useEffect(() => {
    if (!editing) return;
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [editing]);

  const declined = repair.declined !== undefined;
  const lastSegment = (p: string): string => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? p;
  // A spex repository's repair is named by the project — its name with
  // its `-spex` dropped — and its group, the folder it remembers
  // secondary; a folder's by the folder (space-46, DR-159).
  const named = repair.name ?? (repair.repository ? lastSegment(repair.repository) : undefined);
  const name = folderRepair
    ? recorded || repair.repository || ""
    : named !== undefined
      ? projectName(named)
      : recorded
        ? lastSegment(recorded)
        : i18n._({
            id: "these sessions",
            comment: "stands where a project name would, for sessions with no folder",
          });
  const group = folderRepair ? undefined : repair.group;

  /** Pairing is picking a folder: the spex repository keeps its key,
   * and the folders its sessions recorded ride as aliases so every
   * session under them resolves (space-47). The reader stays put. */
  const add = async (chosen: string): Promise<void> => {
    if (!repair.repository) return;
    setBusy(true);
    setRefusal(undefined);
    try {
      const project = await rebindProject(repair.repository, chosen, repair.directories);
      const summary =
        repair.sessions > 0
          ? i18n._(
              "{name} · now a project at {path}, {count, plural, one {# session} other {# sessions}} listed",
              { name: project.name, path: project.path, count: repair.sessions },
            )
          : i18n._("{name} · now a project at {path}", {
              name: project.name,
              path: project.path,
            });
      onResolved(repair.key, summary, project.id);
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Forget a folder whose clone is missing (projects-9): there is no
   * record here to lose, so the core is told so at once. */
  const forget = async (): Promise<void> => {
    if (!repair.repository) return;
    setBusy(true);
    setRefusal(undefined);
    try {
      await removeProject(repair.repository, true);
      onResolved(
        repair.key,
        seat === undefined
          ? i18n._("{path} · forgotten on this device", { path: name })
          : i18n._({
              id: "{path} · forgotten on {place}",
              values: { path: name, place: seat },
              comment: "a folder repair's outcome on a team server's Space; {place} is the server's name",
            }),
      );
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setDeclined = async (next: boolean): Promise<void> => {
    setBusy(true);
    try {
      await decline(repair.key, next);
      if (next) onNote(i18n._("{name} not added.", { name }));
    } catch (cause) {
      setRefusal((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const checkedRecorded = (repair.checked ?? []).find((entry) => entry.path === recorded);
  const evidence = folderRepair
    ? seat === undefined
      ? i18n._("Its spex repository is not on this device.")
      : i18n._({
          id: "Its spex repository is not on {place}.",
          values: { place: seat },
          comment: "a folder repair's evidence on a team server's Space; {place} is the server's name",
        })
    : proposal && local
      ? i18n._("That folder is here and is a git repository. Add it as a project?")
      : checkedRecorded?.here === false
        ? seat === undefined
          ? i18n._("That folder is no longer on this device.")
          : i18n._({
              id: "That folder is no longer on {place}.",
              values: { place: seat },
              comment: "a repair's evidence on a team server's Space; {place} is the server's name",
            })
        : checkedRecorded?.claimedBy
          ? i18n._("That folder already belongs to {owner}.", {
              owner: checkedRecorded.claimedBy,
            })
          : checkedRecorded?.here && !checkedRecorded.repo
            ? i18n._("That folder is here but is not a git repository.")
            : undefined;

  const refusalLine = refusal ? (
    <span role="alert" className="text-xs text-red-600 dark:text-red-400">
      {refusal}
    </span>
  ) : null;

  const controls = folderRepair ? (
    <div className="flex flex-wrap items-center gap-2">
      {forgetting ? (
        <InlineConfirm
          question={i18n._("Forget this folder here? The folder stays on disk.")}
          confirmLabel={i18n._({ id: "Forget", comment: "confirm: forget a folder whose records are gone from this device" })}
          disabled={busy}
          onConfirm={() => {
            setForgetting(false);
            void forget();
          }}
          onCancel={() => setForgetting(false)}
        />
      ) : (
        <button
          type="button"
          ref={firstRef}
          data-testid="space-repair-forget"
          className={SECONDARY}
          disabled={disabled || busy || !repair.repository}
          onClick={() => setForgetting(true)}
        >
          {i18n._({ id: "Forget folder", comment: "forget a working folder whose spex repository is missing" })}
        </button>
      )}
      {refusalLine}
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      {proposal && local ? (
        <button
          type="button"
          ref={firstRef}
          data-testid="space-repair-add"
          className={SECONDARY}
          disabled={disabled || busy || !repair.repository}
          onClick={() => void add(proposal.path)}
        >
          {busy
            ? i18n._({ id: "Adding…", comment: "the Add project control, while the add is in flight" })
            : i18n._("Add project")}
        </button>
      ) : null}
      {local ? (
        <button
          type="button"
          ref={proposal ? undefined : firstRef}
          data-testid="space-repair-choose"
          className={SECONDARY}
          disabled={disabled || busy || !repair.repository}
          onClick={() => setEditing(true)}
        >
          {i18n._("Choose folder…")}
        </button>
      ) : null}
      {!declined ? (
        <button
          type="button"
          data-testid="space-repair-decline"
          className={SECONDARY}
          disabled={disabled || busy}
          onClick={() => void setDeclined(true)}
        >
          {i18n._({
            id: "Not on this computer",
            comment: "on a repair: answer that this project is not kept on this computer, so it stops counting as an issue",
          })}
        </button>
      ) : null}
      {refusalLine}
    </div>
  );

  const editor = (
    <div className="flex min-w-0 flex-col gap-1 rounded border border-neutral-300 p-2 dark:border-neutral-700">
      <label className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="shrink-0 text-neutral-500">
          {i18n._("Which folder on this device is {name}?", { name })}
        </span>
        <input
          ref={fieldRef}
          data-testid="space-repair-path"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Escape") { event.stopPropagation(); setEditing(false); }
            if (event.key === "Enter") void submit();
          }}
          spellCheck={false}
          disabled={busy}
          className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
        />
        {window.spexNative ? (
          <button
            type="button"
            className={SECONDARY}
            disabled={busy}
            onClick={async () => {
              const picked = await window.spexNative!.pickDirectory();
              if (picked) setPath(picked);
            }}
          >
            {i18n._("Open folder…")}
          </button>
        ) : null}
      </label>
      <p className="text-xs text-neutral-500">
        {i18n._("Where a project lives is recorded on this device only; this never syncs.")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={SECONDARY} disabled={busy} onClick={() => void submit()}>
          {busy
            ? i18n._({ id: "Adding…", comment: "the Add project control, while the add is in flight" })
            : i18n._("Add project")}
        </button>
        <button type="button" className={SECONDARY} disabled={busy} onClick={() => setEditing(false)}>
          {i18n._({ id: "Cancel", comment: "leave the editor without changing anything" })}
        </button>
        {refusalLine}
      </div>
    </div>
  );

  return (
    <li
      data-testid={declined ? "space-repair-declined" : "space-repair"}
      data-kind={repair.kind}
      className={`flex min-w-0 flex-col gap-1${declined ? " text-neutral-500" : ""}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span aria-hidden>{declined ? "○" : "●"}</span>
        <span data-testid="space-repair-title" className="min-w-0 flex-1">
          {folderRepair ? (
            <span className="font-mono text-xs">{name}</span>
          ) : (
            <span className="font-medium">
              {group
                ? i18n._({
                    id: "{project} in {group}: its folder on this computer is missing",
                    values: { project: name, group },
                    comment: "a repair row: the project's records are here, the working folder it ran in is not; {project} is the project's name, {group} the group holding it",
                  })
                : i18n._({
                    id: "{project}: its folder on this computer is missing",
                    values: { project: name },
                    comment: "a repair row of a project in no group: the project's records are here, the working folder it ran in is not",
                  })}
            </span>
          )}
          {declined
            ? i18n._({
                id: " · not added",
                comment: "follows the project's name on a repair the reader declined",
              })
            : ""}
        </span>
      </div>
      {!folderRepair && recorded ? (
        // The folder it remembers, secondary (space-46).
        <p data-testid="space-repair-folder" className="min-w-0 truncate pl-5 text-xs text-neutral-500" title={recorded}>
          <span className="font-mono">{recorded}</span>
          {repair.sessions > 0
            ? i18n._({
                id: " · {count, plural, one {# session ran there} other {# sessions ran there}}",
                values: { count: repair.sessions },
                comment: "follows the folder a repair remembers: how many sessions ran in it",
              })
            : ""}
        </p>
      ) : null}
      {!declined && evidence ? <p className="text-xs text-neutral-500">{evidence}</p> : null}
      {/* The editor opens from "Choose folder…" alone, which a remote
          place never offers. */}
      {editing ? editor : controls}
    </li>
  );

  function submit(): void {
    const chosen = path.trim();
    if (!chosen) { setRefusal(i18n._("Name the folder on this device.")); return; }
    void add(chosen);
  }
}

/** What the reader's own act made of a repair (space-48): a pairing
 * names the project it made, a forgotten folder none. */
interface RepairOutcome {
  summary: string;
  projectId?: string;
}

/** A resolved repair's outcome, standing in the row it replaced
 * (space-48): Open project is the one way off the surface. */
function RepairOutcomeRow({
  outcome,
  focusSeq,
  onOpenProject,
}: {
  outcome: RepairOutcome;
  /** Set when focus moves here; a new value moves it again. */
  focusSeq?: number;
  onOpenProject(projectId: string): void;
}) {
  const openRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusSeq !== undefined) openRef.current?.focus();
  }, [focusSeq]);
  const projectId = outcome.projectId;
  return (
    <li data-testid="space-repair-resolved" className="flex min-w-0 flex-wrap items-center gap-2">
      <span aria-hidden>✓</span>
      <span className="min-w-0 flex-1">{outcome.summary}</span>
      {projectId ? (
        <button ref={openRef} type="button" className={LINK} onClick={() => onOpenProject(projectId)}>
          {i18n._("Open project")}
        </button>
      ) : null}
    </li>
  );
}

type IssueEntry = GroupsState["diagnostics"][number];

/** One row's place in the issues list: a repair keeps its place as it
 * changes condition, its outcome taking the same one. */
const issueRowId = (entry: IssueEntry): string =>
  entry.repair ? `repair:${entry.repair.key}` : `diagnostic:${entry.file}:${entry.reason}`;
const outcomeRowId = (key: string): string => `repair:${key}`;

/**
 * The home's issues list (space-1, space-46..space-55): every repair
 * the core folded and every diagnostic no repair folds. It opens from
 * the header's issues control, and stands by itself while a blocking
 * diagnostic does.
 */
export function IssuesList({
  groups,
  connected,
  open,
  refreshes,
  onOpenProject,
  onNote,
}: {
  groups: GroupsState;
  connected: boolean;
  /** The header's issues control opened it. */
  open: boolean;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  onOpenProject(projectId: string): void;
  onNote: Note;
}) {
  // A resolved repair's outcome stands in its row's place, and a
  // declined row keeps its place, until the reader's own Refresh or his
  // leaving the surface (space-48, space-55), so no list reflows under
  // the pointer. The layout is the order the list last drew, ids of
  // rows gone meanwhile kept so an outcome landing late finds its place.
  const [outcomes, setOutcomes] = useState<Record<string, RepairOutcome>>({});
  const layout = useRef<string[]>([]);
  const [focusTo, setFocusTo] = useState<{ id: string; seq: number }>();
  const seenRefreshes = useRef(refreshes);
  useEffect(() => {
    if (refreshes === seenRefreshes.current) return;
    seenRefreshes.current = refreshes;
    layout.current = [];
    setOutcomes({});
    setFocusTo(undefined);
  }, [refreshes]);

  // The core carries the count (space-1): what the reader has not
  // answered. Rows he has set aside stand on, quietly.
  const issueCount = groups.issues;
  const declinedCount = groups.diagnostics.filter((entry) => entry.repair?.declined !== undefined).length;
  const blocking = groups.diagnostics.some((entry) => entry.blocking);
  // The rows as a fresh layout orders them: the core's order, a
  // declined repair after those still unanswered (space-46).
  const fresh = [...groups.diagnostics].sort((a, b) =>
    Number(a.repair?.declined !== undefined) - Number(b.repair?.declined !== undefined));
  const rows = new Map<string, { outcomeKey: string } | { entry: IssueEntry }>();
  for (const entry of fresh) {
    rows.set(
      issueRowId(entry),
      entry.repair && outcomes[entry.repair.key] ? { outcomeKey: entry.repair.key } : { entry },
    );
  }
  // An outcome outlives its repair's report (space-48).
  for (const key of Object.keys(outcomes)) {
    if (!rows.has(outcomeRowId(key))) rows.set(outcomeRowId(key), { outcomeKey: key });
  }
  // Each row keeps the place it last had; a row new since then follows.
  const arrived = [...rows.keys()].filter((id) => !layout.current.includes(id));
  const placed = [...layout.current.filter((id) => rows.has(id)), ...arrived];
  const nextLayout = [...layout.current, ...arrived];
  // What a resolution reads when its act lands: the store has often
  // re-read the state by then, the repair's row already gone.
  const latest = useRef({ groups, outcomes });
  useLayoutEffect(() => {
    layout.current = nextLayout;
    latest.current = { groups, outcomes };
  });
  const listOpen = rows.size > 0 && (open || blocking);

  /** The reader's act resolved a repair (space-48): its outcome takes
   * the row's place, and focus and the live region move on. */
  const onResolved = (key: string, summary: string, projectId?: string): void => {
    const { groups: state, outcomes: done } = latest.current;
    const unanswered = (entry: IssueEntry): boolean =>
      entry.repair !== undefined &&
      entry.repair.key !== key &&
      entry.repair.declined === undefined &&
      !done[entry.repair.key];
    // What the header will count: the other unanswered repairs, and
    // every diagnostic no repair folds (space-1).
    const left = state.diagnostics.filter((entry) => !entry.repair || unanswered(entry)).length;
    // Focus moves to the next unanswered repair below, wrapping to the
    // top, or else onto this outcome's Open project. The layout still
    // holds the row's place even where its report is gone.
    const id = outcomeRowId(key);
    const order = layout.current;
    const at = order.indexOf(id);
    const targets = new Set(state.diagnostics.filter(unanswered).map(issueRowId));
    const next = [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0))]
      .find((row) => targets.has(row));
    setOutcomes((was) => ({ ...was, [key]: { summary, projectId } }));
    setFocusTo((was) => ({ id: next ?? id, seq: (was?.seq ?? 0) + 1 }));
    onNote(left
      ? i18n._("{count, plural, one {# issue} other {# issues}} left.", { count: left })
      : i18n._("All issues resolved."));
  };
  const focusSeq = (id: string): number | undefined =>
    focusTo?.id === id ? focusTo.seq : undefined;

  if (!listOpen) return null;
  return (
    <section
      data-testid="space-issues-list"
      aria-label={i18n._({
        // Its own id: these are problems, apart from the Sources tab's GitHub issues.
        id: "space.issues",
        message: "Issues",
        comment: "the list of unanswered space issues (problems, not GitHub issues)",
      })}
      // Amber is attention. With nothing unanswered there is none to
      // pay, so the card stands neutral and the rows stay readable.
      className={`flex flex-col gap-1 rounded-lg border p-3 text-sm ${
        issueCount > 0
          ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
          : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
      }`}
    >
      <h2
        className={`text-xs font-medium ${
          issueCount > 0
            ? "text-amber-800 dark:text-amber-200"
            : "text-neutral-500"
        }`}
      >
        {i18n._("Issues ({count})", { count: issueCount })}
        {declinedCount > 0
          ? i18n._({
              id: " · {count} not added",
              values: { count: declinedCount },
              comment: "follows the issues heading: repairs the reader declined",
            })
          : ""}
      </h2>
      <ul className="flex flex-col gap-1">
        {placed.map((id) => {
          const row = rows.get(id)!;
          if ("outcomeKey" in row) {
            return (
              <RepairOutcomeRow
                key={id}
                outcome={outcomes[row.outcomeKey]!}
                focusSeq={focusSeq(id)}
                onOpenProject={onOpenProject}
              />
            );
          }
          const entry = row.entry;
          if (entry.file.endsWith(MERGE_HEAD_FILE)) {
            return (
              <li key={id} title={entry.file}>
                {i18n._("A Git merge is pending; finish or abort it in your terminal.")}
              </li>
            );
          }
          if (entry.repair) {
            return (
              <RepairRow
                key={id}
                repair={entry.repair}
                disabled={!connected}
                focusSeq={focusSeq(id)}
                onResolved={onResolved}
                onNote={onNote}
              />
            );
          }
          return (
            <li key={id} className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-mono text-xs" title={entry.file}>
                {entry.file}
              </span>
              <span className="min-w-0 flex-1">— {entry.reason}</span>
              {entry.blocking ? (
                <span className="shrink-0 rounded-full border border-current px-1.5 text-xs">
                  {i18n._({ id: "blocking", comment: "mark on an issue that stops a sync" })}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A spex repository's Sync tab (space-7..space-18): what this device
 * changed, what the host holds that is new, the running rail, the
 * outcome cards and the choices picker. */
export function SyncTab({
  groups,
  repo,
  now,
  connected,
  dismissed,
  movable,
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
  /** A project's, whose placements may move to another group (space-78). */
  movable: boolean;
  /** How many times the reader's own Refresh has re-read the state. */
  refreshes: number;
  onDismiss(phase: string): void;
  onOpenSession(sessionId: string): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const spaceFetch = store((state) => state.spaceFetch);
  const spaceSync = store((state) => state.spaceSync);
  const spaceLeave = store((state) => state.spaceLeave);
  const spaceLastAct = store((state) => state.spaceLastAct);
  const spaceCancel = store((state) => state.spaceCancel);
  const key = repo.key;
  const sync = repo.sync;
  const running = sync.phase === "running";
  const held = heldPlacements(repo);

  const [busy, setBusy] = useState<"check" | "retry" | "stop">();
  // An accepted long command keeps its control busy until the machine's
  // state moves (DR-010 §3, space-29): the running frame, or the
  // outcome that landed first.
  const [accepted, setAccepted] = useState<{ where: "check" | "retry" | "stop"; key: string }>();
  const [error, setError] = useState<{ where: "check" | "retry"; message: string }>();
  const useChoices = useContext(ChoicesContext);
  const choicesKey = `${store.place.key}|${key}`;
  const choices = useChoices((state) => state.choices[choicesKey]);
  const picker = conflictsOf(groups, repo);
  const { line: choicesLine, name: choicesName, conflicts, units: conflictUnits } = picker;
  // The picker's choices outlive a stop and a re-plan: a choice for a
  // unit that is no longer a conflict is dropped, the rest stand.
  const chosenChoices = chosenOf(choices, conflictUnits);
  const total = conflicts.length;

  const phaseKey = JSON.stringify(sync);
  useEffect(() => {
    if (accepted && accepted.key !== phaseKey) setAccepted(undefined);
  }, [accepted, phaseKey]);
  const showStopped = sync.phase === "stopped" && dismissed !== phaseKey;
  const showDone = sync.phase === "done" && dismissed !== phaseKey;

  /** One placement's incoming units (space-8): what the core lists as
   * incoming, and the units changed on both sides, which it lists under
   * conflicts alone — their rows read the host's change beside the mark
   * to choose. */
  const unitsOf = (line: PlacementState): SpaceUnit[] => [
    ...line.incoming,
    ...line.conflicts
      .filter((conflict) => !line.incoming.some((unit) => unit.unit === conflict.unit.unit))
      .map((conflict) => ({ ...conflict.unit, change: conflict.remote.change })),
  ];
  /** What one placement's section lists, or why it lists nothing
   * (space-8): an unrelated history lists nothing — until a join of it
   * compares against the empty tree and asks its choices (space-9) — a
   * placement holding no records says Sync will send these, and one
   * whose check stopped says so. */
  const incomingOf = (line: PlacementState): { units: SpaceUnit[]; empty?: string } => {
    const joining = sync.phase === "choices" && sync.placement === line.instance;
    if ((sync.phase === "unrelated" && sync.placement === line.instance) || (line.branch?.unrelated && !joining)) {
      return { units: [], empty: i18n._("Unrelated history") };
    }
    if (line.branch?.hostEmpty) {
      return { units: [], empty: i18n._("The host holds no records yet; Sync will send these") };
    }
    const units = unitsOf(line);
    const checked = line.branch != null && line.branch.checkedAt !== null;
    if (checked && units.length > 0) return { units };
    const outcome = lineOutcome(repo, line, dismissed);
    if (outcome?.kind === "stopped" && outcome.step === "check") {
      return {
        units: [],
        empty: i18n._({
          id: "{step} stopped — {message}",
          values: { step: STEP_NAMES[outcome.step](), message: outcome.message },
          comment: "{step} is the sync step's name; {message} is the cause the host gave",
        }),
      };
    }
    return { units: [], empty: checked ? i18n._("Nothing new on the host") : i18n._("Not checked yet") };
  };
  // While choices stand, the incoming area lists that placement's units
  // alone, above the picker (space-9); otherwise every placement the
  // clone holds, in order (space-8).
  const sections = (sync.phase === "choices" && choicesLine ? [choicesLine] : held).map((line) => ({
    line,
    ...incomingOf(line),
  }));
  const incomingCount = sections.reduce((sum, section) => sum + section.units.length, 0);

  // The placement in flight, named beside the step line where the
  // clone holds more than one (space-12).
  const inFlight = running && sync.placement !== undefined && held.length > 1 ? placementAt(repo, sync.placement) : undefined;
  const flightName = inFlight
    ? placementName(groups, inFlight)
    : running && sync.placement && held.length > 1
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

  // A stopped Leave names no placement (space-30): its Retry sends again
  // the Leave this page asked, confirmed as it was, and with no memory
  // of one — another page's, or before a reload — none is offered, its
  // row's Leave… still standing (space-89). A Place or an Attach stops
  // only in the sync that follows its add — a refused add ends the
  // operation where it stood — so its Retry syncs (space-97, space-99).
  const lastAct = sync.phase === "stopped" && sync.op === "leave" ? spaceLastAct(key) : undefined;
  const leaveAgain = lastAct?.op === "leave" ? lastAct : undefined;
  const retryOffered = sync.phase === "stopped" && sync.retry && (sync.op !== "leave" || leaveAgain !== undefined);

  const retry = () => {
    if (sync.phase !== "stopped") return;
    if (sync.op === "check") return run("retry", () => spaceFetch(key));
    if (sync.op === "leave") {
      if (!leaveAgain) return;
      return run("retry", () => spaceLeave(key, leaveAgain.instance, leaveAgain.confirmed));
    }
    const input: SyncInput = { ...useChoices.getState().inputs[choicesKey] };
    delete input.join;
    if (choicesLine && total > 0 && Object.keys(chosenChoices).length === total) {
      input.placement = choicesLine.instance;
      input.choices = chosenChoices;
    }
    // Only a join this page sent runs again as a join, of the placement
    // it named, and a join stopped on its way as the join of its
    // placement (space-13): an unrelated placement nobody here joined
    // syncs plainly, stopping as "Unrelated history" again with "Merge
    // histories…" on its line, the confirm still the reader's.
    const act = spaceLastAct(key);
    const joining = act?.op === "join" ? act : sync.op === "join" ? keyPlacement(repo) : undefined;
    if (joining && (input.placement === undefined || input.placement === joining.instance)) {
      input.placement = joining.instance;
      input.join = true;
    }
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
        {/* The core names the install act for this host (space-1). */}
        <p className="text-sm">{groups.git.guidance}</p>
      </div>
    );
  }

  if (!cloneHere(repo)) {
    return (
      <div data-testid="space-sync-tab" className="flex flex-col gap-3">
        <p className="text-sm text-neutral-500">{notHerePhrase(seatName(store.place))}</p>
      </div>
    );
  }

  const checkLabel =
    busy === "check" || accepted?.where === "check" || (running && sync.op === "check")
      ? i18n._({ id: "Checking…", comment: "the Check host control, while the check runs" })
      : i18n._("Check host");
  // A repository only on this device has no host copy to check
  // (space-29: `space.fetch` refuses a local-only one).
  const checkDisabled =
    disabled || running || pending || repo.mergePending || repo.state === "local-only";

  return (
    <div data-testid="space-sync-tab" className="flex flex-col gap-3">
      {/* The records' Git, one line per placement, stands here and on no
          row (space-87, DR-159). */}
      <PlacementLines
        groups={groups}
        repo={repo}
        now={now}
        dismissed={dismissed}
        movable={movable}
        rowName={rowName}
        connected={connected}
        refreshes={refreshes}
        onNote={onNote}
      />
      {repo.mergePending ? (
        <Card testId="space-merge-note" tone="amber">
          {i18n._("A merge is in progress in your terminal. Finish or abort it there.")}
        </Card>
      ) : null}

      {running ? (
        <Rail
          step={sync.step}
          cancelable={sync.cancelable}
          op={sync.op}
          placement={flightName}
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
              id: "Your changes are saved; nothing is pushed to {name} yet",
              values: { name: choicesName },
              comment: "the choices note; {name} is that placement's instance's display name, or the path placement's remote",
            })}
          </span>
        </Card>
      ) : null}
      {sync.phase === "unrelated" ? (
        <Card testId="space-unrelated" tone="amber">
          <span className="font-medium">{i18n._("Unrelated history")}</span>
          <span>{i18n._("Merge both histories into one to sync.")}</span>
        </Card>
      ) : null}
      {showStopped && sync.phase === "stopped" ? (
        <Card testId="space-stopped" tone={sync.cause === "rejected" ? "amber" : "red"}>
          <span className="font-medium" data-testid="space-stopped-title">
            {i18n._({
              id: "{step} stopped — {message}",
              values: { step: STEP_NAMES[sync.step](), message: sync.message },
              comment: "{step} is the sync step's name; {message} is the cause the host gave",
            })}
          </span>
          {/* One block: the guidance names what the host said and the
              way forward (space-50). */}
          {sync.guidance ? <span className="text-xs">{sync.guidance}</span> : null}
          {sync.step === "push" && (keyPlacement(repo)?.branch?.ahead ?? 0) > 0 ? (
            <span className="text-xs">
              {i18n._(
                "Your changes are saved locally ({count, plural, one {# commit} other {# commits}} ahead).",
                { count: keyPlacement(repo)?.branch?.ahead ?? 0 },
              )}
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
                ? i18n._("Brought {received}; nothing sent", { received: sync.received })
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
          {i18n._("Local changes ({count})", { count: repo.local.length })}
        </h2>
        {repo.local.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {seatName(store.place) === undefined
              ? i18n._("Nothing to send from this device")
              : i18n._({
                  id: "Nothing to send from {place}",
                  values: { place: seatName(store.place)! },
                  comment: "a Sync tab's local changes on a team server's Space, none standing; {place} is the server's name",
                })}
          </p>
        ) : (
          <UnitList
            repository={key}
            units={repo.local}
            side="mine"
            conflicts={conflictUnits}
            onOpenSession={onOpenSession}
            testId="space-local-list"
          />
        )}
      </section>

      <section aria-labelledby="space-incoming-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="space-incoming-heading" className="min-w-0 flex-1 text-sm font-medium">
            {i18n._("From the host ({count})", { count: incomingCount })}
          </h2>
          <button
            type="button"
            data-testid="space-check"
            className={SECONDARY}
            disabled={checkDisabled}
            onClick={() => void run("check", () => spaceFetch(key))}
          >
            {checkLabel}
          </button>
          {error?.where === "check" ? (
            <span role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error.message}
            </span>
          ) : null}
        </div>
        {sections.length === 0 ? (
          // A clone holding no placement has no host to check (space-29).
          <p className="text-sm text-neutral-500">{i18n._("Not checked yet")}</p>
        ) : (
          // Each placement's units under its instance's display name, the
          // path placement's under its remote (space-8).
          sections.map(({ line, units, empty }) => {
            const name = placementName(groups, line);
            const checkedAt = line.branch?.checkedAt ?? null;
            return (
              <div
                key={line.instance ?? "path"}
                data-testid={`space-incoming-${line.instance ?? "path"}`}
                className="flex min-w-0 flex-col gap-1"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <h3 className="min-w-0 truncate text-xs font-medium" title={name}>
                    {name}
                  </h3>
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
 * conflicting unit with "Keep what's here" — at a seat's place "Keep
 * what's on <server>" (space-112) — and "Take <display name>'s",
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
        ? i18n._({ id: "Keep what's here", comment: "conflict choice: keep this place's version of the unit" })
        : i18n._({
            id: "Keep what's on {place}",
            values: { place: seat },
            comment: "conflict choice on a team server's Space: keep the server's version of the unit; {place} is the server's name",
          }),
    remote: i18n._({
      id: "Take {name}'s",
      values: { name },
      comment: "conflict choice: take the version at that instance; {name} is the instance's display name",
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
          {i18n._({ id: "All here", comment: "choose this place's version for every conflict" })}
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
            comment: "choose the version at that instance for every conflict; {name} is the instance's display name",
          })}
        </button>
        <span className="flex-1" />
        {confirming ? (
          <span data-testid="space-apply-confirm">
            <InlineConfirm
              question={
                remoteCount === 0
                  ? seat === undefined
                    ? i18n._(
                        "{count, plural, one {Keep this device's version of the unit? The host's version stays in Git history.} other {Keep this device's version of all # units? The host's version stays in Git history.}}",
                        { count: total },
                      )
                    : i18n._({
                        id: "{count, plural, one {Keep {place}'s version of the unit? The host's version stays in Git history.} other {Keep {place}'s version of all # units? The host's version stays in Git history.}}",
                        values: { count: total, place: seat },
                        comment: "Apply's confirm on a team server's Space, every choice keeping the server's side; {place} is the server's name",
                      })
                  : i18n._(
                      "Replace {count, plural, one {# unit} other {# units}} with the host's version? The other version stays in Git history; a replaced session loses its local resume hints and where you stopped reading.",
                      { count: remoteCount },
                    )
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

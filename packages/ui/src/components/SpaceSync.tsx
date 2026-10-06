// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's Sync tab (DR-057, DR-103): local and incoming
// units by kind in human words (space-7, space-8), the running rail
// with its step line and Stop (space-12, space-16), the choices picker
// with its one inline confirm (space-9, space-17, space-18), the
// stopped card with its cause, guidance and Retry (space-15), the
// unrelated-history card (space-13) and in-place line diffs
// (space-10); and the home's issues list with its repairs (space-46..
// space-55). Every side is "mine" or "the host's" (space-27); Git's
// own words never lead.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  DiagnosticRepair,
  GroupsState,
  RepositoryState,
  SpaceChoice,
  SpaceConflict,
  SpaceOp,
  SpaceSide,
  SpaceUnit,
  SyncStep,
} from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { i18n } from "../i18n.js";
import { relativeAge } from "../lib/time.js";
import {
  KIND_LABELS,
  KIND_SINGULAR,
  STEP_LINES,
  STEP_NAMES,
  STEP_ORDER,
  groupUnits,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { LINK } from "./SpaceSurface.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

type Side = SpaceChoice;

/** One unit's line diff in place (space-10): the ancestor against this
 * device's version or the host's, `+` and `−` marking every line in
 * text beside its tint, scrolling sideways as a canvas (DR-041). */
function DiffBox({
  repository,
  unit,
  side,
  testId,
}: {
  /** The spex repository's key every `space.*` call names. */
  repository: string;
  unit: SpaceUnit;
  side: Side;
  testId: string;
}) {
  const spaceDiff = useAppStore((state) => state.spaceDiff);
  const [patches, setPatches] = useState<{ path: string; patch: string; truncated: boolean }[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setPatches(undefined);
    setError(undefined);
    const paths = unit.paths.length > 0 ? unit.paths : [unit.unit];
    Promise.all(
      paths.map((path) => spaceDiff(repository, unit.unit, path, side).then((result) => ({ path, ...result }))),
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
  }, [repository, unit.unit, unit.paths, side, spaceDiff]);

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
          ? i18n._("This device against the common ancestor")
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
  conflict,
  onOpenSession,
}: {
  repository: string;
  unit: SpaceUnit;
  side: Side;
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
        <DiffBox repository={repository} unit={unit} side={side} testId={`space-diff-${side}-${unit.unit}`} />
      ) : null}
    </li>
  );
}

function UnitList({
  repository,
  units,
  side,
  conflicts,
  onOpenSession,
  testId,
}: {
  repository: string;
  units: SpaceUnit[];
  side: Side;
  conflicts: Set<string>;
  onOpenSession(sessionId: string): void;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      {groupUnits(units).map((group) => (
        <div key={group.kind} className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-neutral-500">{KIND_LABELS[group.kind]()}</h3>
          <ul className="flex flex-col gap-1 pl-2">
            {group.units.map((unit) => (
              <UnitRow
                key={unit.unit}
                repository={repository}
                unit={unit}
                side={side}
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
  disabled,
  onChoice,
}: {
  repository: string;
  conflict: SpaceConflict;
  choice?: Side;
  marked: boolean;
  now: number;
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
    const id = `space-choice-${side}-${unit.unit}`;
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor={id} className="flex min-w-0 items-center gap-2 text-sm">
          <input
            id={id}
            type="radio"
            name={`space-choice-${unit.unit}`}
            value={side}
            checked={choice === side}
            disabled={disabled}
            onChange={() => onChoice(unit.unit, side)}
            className="accent-brand-600"
          />
          <span className="shrink-0 font-medium">{label}</span>
          {/* A spoken space: the radio's name reads "Keep mine updated…",
              never two words run together. */}
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
      {option(
        "mine",
        i18n._({ id: "Keep mine", comment: "conflict choice: keep this device's version" }),
        conflict.mine,
      )}
      {option(
        "remote",
        i18n._({ id: "Take host's", comment: "conflict choice: take the host's version" }),
        conflict.remote,
      )}
      {diffSide ? (
        <DiffBox repository={repository} unit={unit} side={diffSide} testId={`space-diff-${diffSide}-${unit.unit}`} />
      ) : null}
    </div>
  );
}

/** The six-step rail (space-12): done steps ticked, the current one
 * named by the step line, the upcoming muted; Stop stands only while a
 * transport step runs (space-16). */
function Rail({
  step,
  cancelable,
  op,
  onStop,
  stopping,
}: {
  step: SyncStep;
  cancelable: boolean;
  op: SpaceOp;
  onStop(): void;
  stopping: boolean;
}) {
  const current = STEP_ORDER.indexOf(step);
  return (
    <div
      data-testid="space-rail"
      className="flex flex-col gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950"
    >
      {op !== "check" ? (
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
  const rebindProject = useAppStore((state) => state.rebindProject);
  const removeProject = useAppStore((state) => state.removeProject);
  const decline = useAppStore((state) => state.spaceRepairDecline);
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
  // A spex repository's repair is named by its name with its group; a
  // folder's by the folder (space-46).
  const name = folderRepair
    ? recorded || repair.repository || ""
    : repair.name ??
      repair.repository ??
      (recorded
        ? lastSegment(recorded)
        : i18n._({
            id: "these sessions",
            comment: "stands where a project name would, for sessions with no folder",
          }));
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
      onResolved(repair.key, i18n._("{path} · forgotten on this device", { path: name }));
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
    ? i18n._("Its spex repository is not on this device.")
    : proposal
      ? i18n._("That folder is here and is a git repository. Add it as a project?")
      : checkedRecorded?.here === false
        ? i18n._("That folder is no longer on this device.")
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
      {proposal ? (
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
      {!declined ? (
        <button
          type="button"
          data-testid="space-repair-decline"
          className={SECONDARY}
          disabled={disabled || busy}
          onClick={() => void setDeclined(true)}
        >
          {i18n._({ id: "Don't add", comment: "decline adding this folder as a project" })}
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
        <span className="min-w-0 flex-1">
          <span className={folderRepair ? "font-mono text-xs" : "font-medium"}>{name}</span>
          {group
            ? i18n._({
                id: " · in {group}",
                values: { group },
                comment: "follows a spex repository's name on a repair row: the group holding it",
              })
            : ""}
          {repair.sessions > 0 && !folderRepair
            ? i18n._({
                id: " · {count, plural, one {# session} other {# sessions}} ran in {path}",
                values: { count: repair.sessions, path: recorded },
                comment: "follows the project's name on a repair row",
              })
            : ""}
          {declined
            ? i18n._({
                id: " · not added",
                comment: "follows the project's name on a repair the reader declined",
              })
            : ""}
        </span>
      </div>
      {!declined && evidence ? <p className="text-xs text-neutral-500">{evidence}</p> : null}
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

/** Whether any spex repository's operation is running: while one
 * runs, the repairs naming it are refused (space-47). */
function runningRepositories(groups: GroupsState): Set<string> {
  const keys = new Set<string>();
  for (const group of groups.groups) {
    for (const repo of group.repositories) {
      if (repo.sync.phase === "running") keys.add(repo.key);
    }
  }
  return keys;
}

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

  const busy = runningRepositories(groups);
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
                disabled={!connected || (entry.repair.repository !== undefined && busy.has(entry.repair.repository))}
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
  onOpenSession,
  onNote,
}: {
  groups: GroupsState;
  repo: RepositoryState;
  now: number;
  connected: boolean;
  onOpenSession(sessionId: string): void;
  onNote: Note;
}) {
  const spaceFetch = useAppStore((state) => state.spaceFetch);
  const spaceSync = useAppStore((state) => state.spaceSync);
  const spaceCancel = useAppStore((state) => state.spaceCancel);
  const key = repo.key;
  const sync = repo.sync;
  const branch = repo.branch;
  const running = sync.phase === "running";

  const [choices, setChoices] = useState<Record<string, Side>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"check" | "apply" | "retry" | "stop">();
  // An accepted long command keeps its control busy until the machine's
  // state moves (DR-010 §3, space-29): the running frame, or the
  // outcome that landed first.
  const [accepted, setAccepted] = useState<{ where: "check" | "apply" | "retry" | "stop"; key: string }>();
  const [error, setError] = useState<{ where: "check" | "apply" | "retry"; message: string }>();
  const [dismissed, setDismissed] = useState<string>();
  const lastSyncInput = useRef<{ choices?: Record<string, Side>; join?: boolean }>({});

  // The picker's choices outlive a stop and a re-plan: a choice for a
  // unit that is no longer a conflict is dropped, the rest stand.
  const conflictUnits = new Set(repo.conflicts.map((conflict) => conflict.unit.unit));
  // The incoming list carries the conflicts too (space-8): the core
  // lists a unit changed on both sides under conflicts alone, and its
  // row here reads the host's change beside the mark to choose.
  const incomingUnits: SpaceUnit[] = [
    ...repo.incoming,
    ...repo.conflicts
      .filter((conflict) => !repo.incoming.some((unit) => unit.unit === conflict.unit.unit))
      .map((conflict) => ({ ...conflict.unit, change: conflict.remote.change })),
  ];
  const chosen = Object.entries(choices).filter(([unit]) => conflictUnits.has(unit));
  const chosenChoices = Object.fromEntries(chosen) as Record<string, Side>;
  const total = repo.conflicts.length;
  const remoteCount = chosen.filter(([, side]) => side === "remote").length;

  const phaseKey = JSON.stringify(sync);
  useEffect(() => {
    if (accepted && accepted.key !== phaseKey) setAccepted(undefined);
  }, [accepted, phaseKey]);
  const showStopped = sync.phase === "stopped" && dismissed !== phaseKey;
  const showDone = sync.phase === "done" && dismissed !== phaseKey;
  const pickerStands =
    total > 0 &&
    (sync.phase === "choices" || (sync.phase === "stopped" && sync.step === "apply"));
  const marked =
    sync.phase === "stopped" && sync.step === "apply"
      ? repo.conflicts.find((conflict) => sync.message.includes(conflict.unit.label))?.unit.unit
      : undefined;

  const run = async (
    where: "check" | "apply" | "retry",
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

  // While the histories are still unrelated — a join's merge has not
  // landed — every sync the tab starts is a join (space-13, space-18).
  const joinNeeded = branch?.unrelated === true || sync.phase === "unrelated";

  const apply = () =>
    run("apply", () => {
      const input = { choices: chosenChoices, ...(joinNeeded ? { join: true } : {}) };
      lastSyncInput.current = input;
      return spaceSync(key, input);
    });

  const retry = () => {
    if (sync.phase !== "stopped") return;
    if (sync.op === "check") return run("retry", () => spaceFetch(key));
    const input = { ...lastSyncInput.current };
    if (total > 0 && chosen.length === total) input.choices = chosenChoices;
    if (joinNeeded || sync.op === "join") input.join = true;
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

  if (repo.state === "absent") {
    return (
      <div data-testid="space-sync-tab" className="flex flex-col gap-3">
        <p className="text-sm text-neutral-500">{i18n._("Not on this device")}</p>
      </div>
    );
  }

  const checkLabel =
    busy === "check" || accepted?.where === "check" || (running && sync.op === "check")
      ? i18n._({ id: "Checking…", comment: "the Check host control, while the check runs" })
      : i18n._("Check host");
  const checkDisabled = disabled || running || pending || branch?.mergePending === true;

  return (
    <div data-testid="space-sync-tab" className="flex flex-col gap-3">
      {branch?.mergePending ? (
        <Card testId="space-merge-note" tone="amber">
          {i18n._("A merge is in progress in your terminal. Finish or abort it there.")}
        </Card>
      ) : null}

      {running ? (
        <Rail
          step={sync.step}
          cancelable={sync.cancelable}
          op={sync.op}
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
            {i18n._("Your changes are saved; nothing is pushed yet")}
          </span>
        </Card>
      ) : null}
      {sync.phase === "unrelated" ? (
        <Card testId="space-unrelated" tone="amber">
          <span className="font-medium">{i18n._("Unrelated history")}</span>
          <span>{i18n._("Join both histories into one to sync.")}</span>
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
          {sync.step === "push" && (branch?.ahead ?? 0) > 0 ? (
            <span className="text-xs">
              {i18n._(
                "Your changes are saved locally ({count, plural, one {# commit} other {# commits}} ahead).",
                { count: branch?.ahead ?? 0 },
              )}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {sync.retry ? (
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
              onClick={() => setDismissed(phaseKey)}
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
              onClick={() => setDismissed(phaseKey)}
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
            {i18n._("Nothing to send from this device")}
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
            {i18n._("From the host ({count})", { count: incomingUnits.length })}
            {branch?.checkedAt != null ? (
              <span className="hidden text-xs font-normal text-neutral-500 @2xl:inline">
                {" "}
                {i18n._("· checked {age}", { age: relativeAge(branch.checkedAt, now) })}
              </span>
            ) : null}
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
        {sync.phase === "unrelated" || (branch?.unrelated && sync.phase !== "choices") ? (
          // Unrelated histories list nothing (space-8) — until a join has
          // compared them against the empty tree and asks its choices,
          // whereupon the incoming list stands above the picker (space-9).
          <p className="text-sm text-neutral-500">{i18n._("Unrelated history")}</p>
        ) : branch?.hostEmpty ? (
          <p className="text-sm text-neutral-500">
            {i18n._("The host holds no records yet; Sync will send these")}
          </p>
        ) : !branch || branch.checkedAt === null ? (
          <p className="text-sm text-neutral-500">{i18n._("Not checked yet")}</p>
        ) : incomingUnits.length === 0 ? (
          <p className="text-sm text-neutral-500">{i18n._("Nothing new on the host")}</p>
        ) : (
          <UnitList
            repository={key}
            units={incomingUnits}
            side="remote"
            conflicts={conflictUnits}
            onOpenSession={onOpenSession}
            testId="space-incoming-list"
          />
        )}
      </section>

      {pickerStands ? (
        <section
          data-testid="space-picker"
          aria-labelledby="space-picker-heading"
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="space-picker-heading" className="min-w-0 flex-1 text-sm font-medium">
              {i18n._(
                "Choose for {count, plural, one {# conflict} other {# conflicts}}",
                { count: total },
              )}
            </h2>
            <span id="space-chosen" data-testid="space-chosen" className="text-xs text-neutral-500">
              {i18n._("{chosen} of {total} chosen", { chosen: chosen.length, total })}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {repo.conflicts.map((conflict) => (
              <ConflictRow
                key={conflict.unit.unit}
                repository={key}
                conflict={conflict}
                choice={chosenChoices[conflict.unit.unit]}
                marked={marked === conflict.unit.unit}
                now={now}
                disabled={disabled || busy === "apply" || accepted?.where === "apply"}
                onChoice={(unit, side) => setChoices((current) => ({ ...current, [unit]: side }))}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="space-all-mine"
              className={SECONDARY}
              disabled={disabled}
              onClick={() =>
                setChoices(Object.fromEntries(repo.conflicts.map((c) => [c.unit.unit, "mine" as Side])))
              }
            >
              {i18n._({ id: "All mine", comment: "choose this device's version for every conflict" })}
            </button>
            <button
              type="button"
              data-testid="space-all-remote"
              className={SECONDARY}
              disabled={disabled}
              onClick={() =>
                setChoices(Object.fromEntries(repo.conflicts.map((c) => [c.unit.unit, "remote" as Side])))
              }
            >
              {i18n._({ id: "All host's", comment: "choose the host's version for every conflict" })}
            </button>
            <span className="flex-1" />
            {confirming ? (
              <span data-testid="space-apply-confirm">
                <InlineConfirm
                  question={
                    remoteCount === 0
                      ? i18n._(
                          "{count, plural, one {Keep this device's version of the unit? The host's version stays in Git history.} other {Keep this device's version of all # units? The host's version stays in Git history.}}",
                          { count: total },
                        )
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
                aria-describedby="space-chosen"
                disabled={disabled || chosen.length < total || pending}
                onClick={() => setConfirming(true)}
              >
                {busy === "apply" || accepted?.where === "apply"
                  ? i18n._({ id: "Applying…", comment: "sync step running: applying the chosen versions" })
                  : i18n._({ id: "Apply", comment: "confirm: apply the chosen versions" })}
              </button>
            )}
            {error?.where === "apply" ? (
              <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                {error.message}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

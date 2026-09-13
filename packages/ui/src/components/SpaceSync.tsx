// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Sync tab (DR-057): local and incoming units by kind in human
// words (space-7, space-8), the running rail with its step line and
// Stop (space-12, space-16), the choices picker with its one inline
// confirm (space-9, space-17, space-18), the stopped card with its
// cause, guidance and Retry (space-15), the unrelated-history card
// (space-13), in-place line diffs (space-10) and the issues list. Every
// side is "mine" or "remote" (space-27); Git's own words never lead.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type {
  SpaceChoice,
  SpaceConflict,
  SpaceSide,
  SpaceState,
  SpaceUnit,
  SyncStep,
} from "@sublang/spex-core/protocol";

import { useAppStore } from "../state/store.js";
import { relativeAge } from "../lib/time.js";
import {
  KIND_LABELS,
  STEP_LINES,
  STEP_NAMES,
  STEP_ORDER,
  groupUnits,
  plural,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import { PRIMARY, SECONDARY, type Note } from "./SpaceSurface.js";

type Side = SpaceChoice;

/** One unit's line diff in place (space-10): the ancestor against this
 * device's version or the remote's, `+` and `−` marking every line in
 * text beside its tint, scrolling sideways as a canvas (DR-041). */
function DiffBox({
  unit,
  side,
  testId,
}: {
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
      paths.map((path) => spaceDiff(unit.unit, path, side).then((result) => ({ path, ...result }))),
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
  }, [unit.unit, unit.paths, side, spaceDiff]);

  if (error) {
    return (
      <p role="alert" data-testid={testId} className="text-xs text-red-600 dark:text-red-400">
        Couldn't load the diff: {error}
      </p>
    );
  }
  if (!patches) {
    return (
      <p data-testid={testId} className="text-xs text-neutral-500">
        Loading diff…
      </p>
    );
  }
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1 rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <span className="text-xs text-neutral-500">
        {side === "mine" ? "This device against the common ancestor" : "The remote against the common ancestor"}
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
              <span className="text-neutral-500">No difference</span>
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
            <span className="text-xs text-neutral-500">The diff is cut here; the file is longer.</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** One change row (space-7): the label owns the slack, the project
 * chip and detail hide below @md, and the row's control keeps its
 * accessible name in its icon form (space-28). */
function UnitRow({
  unit,
  side,
  conflict,
  onOpenSession,
}: {
  unit: SpaceUnit;
  side: Side;
  conflict: boolean;
  onOpenSession(sessionId: string): void;
}) {
  const [diffOpen, setDiffOpen] = useState(false);
  const project = unit.project?.name ?? unit.project?.id;
  const detailLines = unit.detail?.split("\n").filter(Boolean) ?? [];
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
          {unit.label}
        </span>
        {project ? (
          <span
            className="hidden max-w-32 shrink-0 truncate rounded-full bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-500 @md:inline-block dark:bg-neutral-800 dark:text-neutral-400"
            title={project}
          >
            {project}
          </span>
        ) : null}
        {detailLines.length === 1 ? (
          <span className="hidden shrink-0 text-xs text-neutral-500 @md:inline" title={unit.detail}>
            {detailLines[0]}
          </span>
        ) : null}
        <span className="shrink-0 text-xs text-neutral-500">{unit.change}</span>
        {conflict ? (
          <span
            data-testid={`space-choose-${unit.unit}`}
            className="shrink-0 text-xs text-amber-700 dark:text-amber-300"
            title="Changed on both sides — choose which version to keep"
          >
            <span aria-hidden>⚠ </span>choose
          </span>
        ) : null}
        {canOpen ? (
          <button
            type="button"
            aria-label="Open session"
            title="Open session"
            className={`${SECONDARY} shrink-0`}
            onClick={() => onOpenSession(unit.sessionId!)}
          >
            <span className="hidden @md:inline">Open session</span>
            <Icon name="open" className="h-3.5 w-3.5 @md:hidden" />
          </button>
        ) : null}
        {unit.diff ? (
          <button
            type="button"
            aria-label={diffOpen ? "Hide diff" : "View diff"}
            title={diffOpen ? "Hide diff" : "View diff"}
            aria-expanded={diffOpen}
            className={`${SECONDARY} shrink-0`}
            onClick={() => setDiffOpen((open) => !open)}
          >
            <span className="hidden @md:inline">{diffOpen ? "Hide diff" : "View diff"}</span>
            <Icon name="diff" className="h-3.5 w-3.5 @md:hidden" />
          </button>
        ) : null}
      </div>
      {detailLines.length > 1 ? (
        <ul className="pl-3.5 text-xs text-neutral-500">
          {detailLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {diffOpen ? (
        <DiffBox unit={unit} side={side} testId={`space-diff-${side}-${unit.unit}`} />
      ) : null}
    </li>
  );
}

function UnitList({
  units,
  side,
  conflicts,
  onOpenSession,
  testId,
}: {
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
          <h3 className="text-xs font-medium text-neutral-500">{KIND_LABELS[group.kind]}</h3>
          <ul className="flex flex-col gap-1 pl-2">
            {group.units.map((unit) => (
              <UnitRow
                key={unit.unit}
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

/** A side's summary in the picker (space-17). */
function sideSummary(side: SpaceSide, now: number): string {
  const parts: string[] = [side.change];
  if (side.at !== undefined) parts.push(relativeAge(side.at, now));
  const text = parts.join(" ");
  return side.detail ? `${text} · ${side.detail}` : text;
}

/** One conflict row: a radio group named by the unit's label with two
 * exclusive choices, nothing preselected, arrow keys moving within it
 * (space-17, DR-010 §6). */
function ConflictRow({
  conflict,
  choice,
  marked,
  now,
  disabled,
  onChoice,
}: {
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

  const project = unit.project?.name ?? unit.project?.id;
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
            aria-label={diffSide === side ? `Hide diff` : `View diff`}
            aria-expanded={diffSide === side}
            className={SECONDARY}
            onClick={() => setDiffSide((open) => (open === side ? undefined : side))}
          >
            {diffSide === side ? "Hide diff" : "View diff"}
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
        <span className="shrink-0 text-xs text-neutral-500">{KIND_LABELS[unit.kind].replace(/s$/, "")}</span>
        <span className="min-w-0 flex-1 truncate font-medium" title={unit.label}>
          {unit.label}
        </span>
        {project ? (
          <span className="hidden max-w-32 shrink-0 truncate text-xs text-neutral-500 @md:inline" title={project}>
            {project}
          </span>
        ) : null}
      </div>
      {option("mine", "Keep mine", conflict.mine)}
      {option("remote", "Take remote", conflict.remote)}
      {diffSide ? (
        <DiffBox unit={unit} side={diffSide} testId={`space-diff-${diffSide}-${unit.unit}`} />
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
  op: "sync" | "check" | "init";
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
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-label="Sync steps">
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
                {STEP_NAMES[name]}
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="space-step-line" className="font-medium">
          {STEP_LINES[step]}
        </span>
        {cancelable ? (
          <button
            type="button"
            data-testid="space-stop"
            className={SECONDARY}
            disabled={stopping}
            onClick={onStop}
          >
            {stopping ? "Stopping…" : "Stop"}
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

export function SyncTab({
  space,
  now,
  connected,
  issuesOpen,
  onOpenSession,
  onOpenPalette,
  onNote,
}: {
  space: SpaceState;
  now: number;
  connected: boolean;
  issuesOpen: boolean;
  onOpenSession(sessionId: string): void;
  onOpenPalette(): void;
  onNote: Note;
}) {
  const spaceFetch = useAppStore((state) => state.spaceFetch);
  const spaceSync = useAppStore((state) => state.spaceSync);
  const spaceInit = useAppStore((state) => state.spaceInit);
  const spaceCancel = useAppStore((state) => state.spaceCancel);
  const repo = space.repository;
  const sync = space.sync;
  const running = sync.phase === "running";

  const [choices, setChoices] = useState<Record<string, Side>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"check" | "apply" | "retry" | "stop">();
  const [error, setError] = useState<{ where: "check" | "apply" | "retry"; message: string }>();
  const [dismissed, setDismissed] = useState<string>();
  const lastSyncInput = useRef<{ choices?: Record<string, Side>; join?: boolean }>({});

  // The picker's choices outlive a stop and a re-plan: a choice for a
  // unit that is no longer a conflict is dropped, the rest stand.
  const conflictUnits = new Set(space.conflicts.map((conflict) => conflict.unit.unit));
  // The incoming list carries the conflicts too (space-8): the core
  // lists a unit changed on both sides under conflicts alone, and its
  // row here reads the remote's change beside the mark to choose.
  const incomingUnits: SpaceUnit[] = [
    ...space.incoming,
    ...space.conflicts
      .filter((conflict) => !space.incoming.some((unit) => unit.unit === conflict.unit.unit))
      .map((conflict) => ({ ...conflict.unit, change: conflict.remote.change })),
  ];
  const chosen = Object.entries(choices).filter(([unit]) => conflictUnits.has(unit));
  const chosenChoices = Object.fromEntries(chosen) as Record<string, Side>;
  const total = space.conflicts.length;
  const remoteCount = chosen.filter(([, side]) => side === "remote").length;

  const phaseKey = JSON.stringify(sync);
  const showStopped = sync.phase === "stopped" && dismissed !== phaseKey;
  const showDone = sync.phase === "done" && dismissed !== phaseKey;
  const pickerStands =
    total > 0 &&
    (sync.phase === "choices" || (sync.phase === "stopped" && sync.step === "apply"));
  const marked =
    sync.phase === "stopped" && sync.step === "apply"
      ? space.conflicts.find((conflict) => sync.message.includes(conflict.unit.label))?.unit.unit
      : undefined;

  const run = async (
    where: "check" | "apply" | "retry",
    action: () => Promise<unknown>,
  ) => {
    setBusy(where);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      const message = (cause as Error).message;
      setError({ where, message });
      onNote(message);
    } finally {
      setBusy(undefined);
    }
  };

  const apply = () =>
    run("apply", () => {
      lastSyncInput.current = { choices: chosenChoices };
      return spaceSync({ choices: chosenChoices });
    });

  const retry = () => {
    if (sync.phase !== "stopped") return;
    if (sync.op === "check") return run("retry", () => spaceFetch());
    if (sync.op === "init") {
      return run("retry", () => spaceInit(repo?.remote ?? undefined));
    }
    const input = { ...lastSyncInput.current };
    if (total > 0 && chosen.length === total) input.choices = chosenChoices;
    return run("retry", () => spaceSync(input));
  };

  const stop = async () => {
    setBusy("stop");
    try {
      const stopped = await spaceCancel();
      if (!stopped) onNote("Nothing to stop");
    } catch (cause) {
      onNote((cause as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const disabled = !connected;
  const issueCount = space.diagnostics.length + (repo?.mergePending ? 1 : 0);
  const blocking = space.diagnostics.some((entry) => entry.blocking);

  const issues =
    issueCount > 0 && (issuesOpen || blocking) ? (
      <section
        data-testid="space-issues-list"
        aria-label="Issues"
        className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950"
      >
        <h2 className="text-xs font-medium text-amber-800 dark:text-amber-200">
          Issues ({issueCount})
        </h2>
        <ul className="flex flex-col gap-1">
          {repo?.mergePending ? (
            <li>A Git merge is pending; finish or abort it in your terminal.</li>
          ) : null}
          {space.diagnostics.map((entry) => (
            <li key={`${entry.file}:${entry.reason}`} className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-mono text-xs" title={entry.file}>
                {entry.file}
              </span>
              <span className="min-w-0 flex-1">— {entry.reason}</span>
              {entry.blocking ? (
                <span className="shrink-0 rounded-full border border-current px-1.5 text-xs">blocking</span>
              ) : null}
              {/folder|bind|palette|working directory/i.test(entry.reason) ? (
                <button type="button" className={SECONDARY} onClick={onOpenPalette}>
                  Open palette
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  if (!space.git.ok) {
    return (
      <div data-testid="space-sync-tab" className="flex flex-col gap-3">
        <p className="text-sm">Git is not installed. Install Git, then reopen Space.</p>
      </div>
    );
  }

  if (!repo) {
    // The setup card stands in the header (space-3): no changes list.
    return <div data-testid="space-sync-tab" className="flex flex-col gap-3">{issues}</div>;
  }

  const checkLabel = busy === "check" || (running && sync.op === "check") ? "Checking…" : "Check remote";
  const checkDisabled =
    disabled || running || busy !== undefined || !repo.remote || repo.branch !== "main";

  return (
    <div data-testid="space-sync-tab" className="flex flex-col gap-3">
      {blocking ? issues : null}
      {repo.branch !== "main" ? (
        <Card testId="space-branch-note" tone="amber">
          This space is on <span className="font-mono">{repo.branch ?? "no branch"}</span>. The app
          syncs <span className="font-mono">main</span>; check it out in a terminal.
        </Card>
      ) : null}
      {repo.mergePending ? (
        <Card testId="space-merge-note" tone="amber">
          A merge is in progress in your terminal. Finish or abort it there.
        </Card>
      ) : null}

      {running ? (
        <Rail
          step={sync.step}
          cancelable={sync.cancelable}
          op={sync.op}
          onStop={() => void stop()}
          stopping={busy === "stop"}
        />
      ) : null}
      {sync.phase === "choices" ? (
        <Card testId="space-choices-note" tone="amber">
          <span data-testid="space-step-line" className="font-medium">
            Needs your choice
          </span>
          <span className="text-xs">Your changes are saved; nothing is pushed yet</span>
        </Card>
      ) : null}
      {sync.phase === "unrelated" ? (
        <Card testId="space-unrelated" tone="amber">
          <span className="font-medium">Unrelated history</span>
          <span>
            This device and the remote have separate histories. Join both into one space with
            Join above — anything present in both differently will ask you to choose. A wrong
            remote URL is the other explanation.
          </span>
        </Card>
      ) : null}
      {showStopped && sync.phase === "stopped" ? (
        <Card testId="space-stopped" tone={sync.cause === "rejected" ? "amber" : "red"}>
          <span className="font-medium" data-testid="space-stopped-title">
            {STEP_NAMES[sync.step]} stopped — {sync.message}
          </span>
          {sync.guidance ? <span className="text-xs">{sync.guidance}</span> : null}
          {sync.step === "push" && (repo.ahead ?? 0) > 0 ? (
            <span className="text-xs">
              Your changes are saved locally ({plural(repo.ahead ?? 0, "commit")} ahead).
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {sync.retry ? (
              <button
                type="button"
                data-testid="space-retry"
                className={SECONDARY}
                disabled={disabled || busy !== undefined}
                onClick={() => void retry()}
              >
                {busy === "retry" ? "Retrying…" : "Retry"}
              </button>
            ) : null}
            <button
              type="button"
              data-testid="space-dismiss"
              className={SECONDARY}
              onClick={() => setDismissed(phaseKey)}
            >
              Dismiss
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
              {sync.sent + sync.received === 0
                ? "Everything is in sync"
                : `Synced ${relativeAge(sync.at, now)} · ${sync.sent} sent · ${sync.received} received`}
            </span>
            <button
              type="button"
              data-testid="space-dismiss"
              className={SECONDARY}
              onClick={() => setDismissed(phaseKey)}
            >
              Dismiss
            </button>
          </div>
        </Card>
      ) : null}

      <section aria-labelledby="space-local-heading" className="flex flex-col gap-2">
        <h2 id="space-local-heading" className="text-sm font-medium">
          Local changes ({space.local.length})
        </h2>
        {space.local.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing to send from this device</p>
        ) : (
          <UnitList
            units={space.local}
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
            From the remote ({incomingUnits.length})
            {repo.checkedAt !== null ? (
              <span className="hidden text-xs font-normal text-neutral-500 @2xl:inline">
                {" "}
                · checked {relativeAge(repo.checkedAt, now)}
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            data-testid="space-check"
            className={SECONDARY}
            disabled={checkDisabled}
            onClick={() => void run("check", () => spaceFetch())}
          >
            {checkLabel}
          </button>
          {error?.where === "check" ? (
            <span role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error.message}
            </span>
          ) : null}
        </div>
        {!repo.remote ? (
          <p className="text-sm text-neutral-500">Add a remote to share this space</p>
        ) : repo.unrelated || sync.phase === "unrelated" ? (
          <p className="text-sm text-neutral-500">Unrelated history</p>
        ) : repo.remoteEmpty ? (
          <p className="text-sm text-neutral-500">The remote is empty; Sync will send this space</p>
        ) : repo.checkedAt === null ? (
          <p className="text-sm text-neutral-500">Not checked yet</p>
        ) : incomingUnits.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing new on the remote</p>
        ) : (
          <UnitList
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
              Choose for {plural(total, "conflict")}
            </h2>
            <span id="space-chosen" data-testid="space-chosen" className="text-xs text-neutral-500">
              {chosen.length} of {total} chosen
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {space.conflicts.map((conflict) => (
              <ConflictRow
                key={conflict.unit.unit}
                conflict={conflict}
                choice={chosenChoices[conflict.unit.unit]}
                marked={marked === conflict.unit.unit}
                now={now}
                disabled={disabled || busy === "apply"}
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
                setChoices(Object.fromEntries(space.conflicts.map((c) => [c.unit.unit, "mine" as Side])))
              }
            >
              All mine
            </button>
            <button
              type="button"
              data-testid="space-all-remote"
              className={SECONDARY}
              disabled={disabled}
              onClick={() =>
                setChoices(Object.fromEntries(space.conflicts.map((c) => [c.unit.unit, "remote" as Side])))
              }
            >
              All remote
            </button>
            <span className="flex-1" />
            {confirming ? (
              <span data-testid="space-apply-confirm">
                <InlineConfirm
                  question={
                    remoteCount === 0
                      ? `Keep this device's version of ${total === 1 ? "the unit" : `all ${total} units`}? The remote's version stays in Git history.`
                      : `Replace ${plural(remoteCount, "unit")} with the remote's version? The other version stays in Git history; a replaced session loses its local resume hints and where you stopped reading.`
                  }
                  confirmLabel="Apply"
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
                disabled={disabled || chosen.length < total || busy !== undefined}
                onClick={() => setConfirming(true)}
              >
                {busy === "apply" ? "Applying…" : "Apply"}
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

      {!blocking ? issues : null}
    </div>
  );
}

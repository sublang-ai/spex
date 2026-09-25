// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The compile band under the tab strip (playbook-library-57/58/59):
// the pipeline's phases in human words with the compiler's ids in the
// tooltips, the running phase's elapsed time and the age of the
// compiler's last line ticking beside it, a folded log, Cancel, and
// who asked. A failed phase opens its output — or the compiler's
// questions — beneath the row; an interrupted compile says so and
// hands the next one to a person.

import { useMemo } from "react";
import type { DraftCompileRelay, DraftInfo } from "@sublang/spex-core/protocol";

import { foldCompileLog, phaseLabel, type PhaseView } from "../lib/compile-log.js";
import { i18n } from "../i18n.js";
import { duration, preciseAge, relativeAge } from "../lib/time.js";
import { useClock } from "../lib/useClock.js";
import { ResizableFrame } from "./ResizableFrame.js";
import { RunningMark } from "./RunningMark.js";

const GLYPH: Record<PhaseView["status"], string> = {
  waiting: "○",
  running: "●",
  done: "✓",
  failed: "✗",
};

/** How a phase stands, in the word a screen reader speaks and the
 * tooltip repeats. A function, never a table of strings: a text read
 * at module load would freeze the language the module was imported in
 * (localization-4). */
function statusWord(status: PhaseView["status"]): string {
  switch (status) {
    case "waiting":
      return i18n._({ id: "waiting", comment: "compile phase: not started yet" });
    case "running":
      return i18n._({ id: "running", comment: "compile phase: under way" });
    case "done":
      return i18n._({ id: "done", comment: "compile phase: finished well" });
    case "failed":
      return i18n._({ id: "failed", comment: "compile phase: stopped on an error" });
  }
}

const TONE: Record<PhaseView["status"], string> = {
  waiting: "text-neutral-400 dark:text-neutral-500",
  running: "text-emerald-700 dark:text-emerald-400",
  done: "text-emerald-700 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
};

function PhaseRow({ phases, now }: { phases: PhaseView[]; now: number }) {
  return (
    // The row wraps under @md (playbook-library-57): each phase is one
    // unbreakable token, so a narrow band reads as lines of phases.
    <div
      data-testid="compile-phases"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
    >
      {phases.map((phase, index) => {
        const elapsed =
          phase.status === "running" && phase.startedAt !== undefined
            ? duration(now - phase.startedAt)
            : phase.elapsed;
        return (
          <span key={phase.id} className="flex items-center gap-1">
            {/* The phase's name and the compiler's id for it are the
                pipeline's own words; how it stands is a text. */}
            <span
              data-testid={`phase-${phase.id}`}
              data-status={phase.status}
              title={i18n._("{label} — the compiler's {id} phase, {status}", {
                label: phase.label,
                id: phase.id,
                status: statusWord(phase.status),
              })}
              className={`inline-flex items-center gap-1 whitespace-nowrap ${TONE[phase.status]}`}
            >
              {phase.status === "running" ? (
                <RunningMark running title={i18n._({ id: "Running", comment: "this compile phase is under way" })} />
              ) : (
                <span aria-hidden="true">{GLYPH[phase.status]}</span>
              )}
              <span className="sr-only">{statusWord(phase.status)}</span>
              <span className={phase.status === "waiting" ? "" : "font-medium"}>
                {phase.label}
              </span>
              {elapsed ? (
                <span className="text-neutral-500 dark:text-neutral-400">{elapsed}</span>
              ) : null}
            </span>
            {index < phases.length - 1 ? (
              <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-600">
                →
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** What became of a failed compile, phrased from the draft's state
 * (playbook-library-58): relayed to the agent, the relay stopped after
 * three in a row, or carried by the Boss's queued message. A record
 * with no relay (an older one, a toolchain failure) falls back on the
 * failure count. */
function relayCaption(relay: DraftCompileRelay | undefined, failures: number): string {
  switch (relay) {
    case "sent":
      return i18n._("sent to the agent");
    case "stopped":
      return i18n._("three in a row — tell the agent how to proceed");
    case "queued":
      return i18n._("waiting for your queued message");
    default:
      return failures >= 3
        ? i18n._("three in a row — tell the agent how to proceed")
        : i18n._("sent to the agent");
  }
}

export function CompileBand({
  draftId,
  draft,
  lines,
  times,
  connected,
  onCancel,
}: {
  draftId: string;
  draft: DraftInfo;
  /** This compile's progress lines and their arrival times. */
  lines: string[];
  times: number[];
  connected: boolean;
  onCancel: () => void;
}) {
  const compile = draft.compile;
  const fold = useMemo(() => foldCompileLog(lines, times), [lines, times]);
  const running = draft.activity === "compiling" || compile?.outcome === "running";
  const now = useClock(running);
  if (!compile && lines.length === 0) return null;

  const outcome =
    compile?.outcome ??
    (fold.canceled ? "canceled" : fold.complete ? "ok" : fold.failed ? "failed" : "running");
  const askedBy = compile ? (compile.by === "agent" ? i18n._("asked by the agent") : i18n._("asked by you")) : undefined;
  // The phases as the lines drew them; a restored failure that kept no
  // lines draws its one failed phase with the output the draft holds.
  const folded: PhaseView[] =
    lines.length > 0
      ? fold.phases
      : compile?.phase && outcome === "failed" && compile.phase !== "toolchain"
        ? [
            {
              id: compile.phase,
              label: phaseLabel(compile.phase),
              status: "failed",
              output: compile.output ? compile.output.split("\n") : [],
            },
          ]
        : [];
  // A compile that failed with no ✗ line — the compiler died in a phase
  // it left open — names that phase on the draft: it is the failed one,
  // never drawn as still running (playbook-library-58, DR-010 §5).
  const named = outcome === "failed" && compile?.phase && compile.phase !== "toolchain" ? compile.phase : undefined;
  const heldOutput = compile?.output ? compile.output.split("\n") : [];
  const phases: PhaseView[] =
    named && !folded.some((phase) => phase.status === "failed")
      ? folded.some((phase) => phase.id === named)
        ? folded.map((phase) => {
            if (phase.id !== named) return phase;
            const { startedAt: _started, ...rest } = phase;
            return { ...rest, status: "failed", output: phase.output.length > 0 ? phase.output : heldOutput };
          })
        : [...folded, { id: named, label: phaseLabel(named), status: "failed", output: heldOutput }]
      : folded;
  const failed = fold.failed ?? phases.find((phase) => phase.status === "failed");
  const output =
    failed && failed.output.length > 0
      ? failed.output
      : compile?.output
        ? compile.output.split("\n")
        : [];
  const questions = compile?.questions ?? [];
  const roles = compile?.roles ?? fold.roles;
  const lastOutputAt = fold.lastOutputAt ?? compile?.at;

  return (
    <div
      data-testid="compile-band"
      data-outcome={outcome}
      // In a short pane the band yields inside its own box rather than
      // pushing the panel out of the pane (DR-041 §9); positioned, so its
      // screen-reader-only words stay inside that box too.
      className="relative flex min-h-0 shrink flex-col gap-1.5 overflow-y-auto border-b border-neutral-200 px-3 py-2 dark:border-neutral-800"
    >
      {outcome === "running" ? (
        <>
          {phases.some((phase) => phase.status !== "waiting") ? (
            <PhaseRow phases={phases} now={now} />
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-neutral-500">
              <RunningMark running title={i18n._({ id: "Running", comment: "this compile phase is under way" })} />
              {i18n._("Starting the compiler…")}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {lastOutputAt !== undefined ? (
              <span data-testid="last-output">
                {i18n._("last output {age}", { age: preciseAge(lastOutputAt, now) })}
              </span>
            ) : null}
            {askedBy ? <span data-testid="compile-by">{askedBy}</span> : null}
            <button
              type="button"
              data-testid="compile-cancel"
              disabled={!connected}
              onClick={onCancel}
              className="ml-auto rounded-md border border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {i18n._({ id: "Cancel", comment: "stop the running compile" })}
            </button>
          </div>
        </>
      ) : outcome === "failed" && compile?.phase === "toolchain" ? (
        <div
          data-testid="compile-toolchain"
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {/* What the toolchain check said, where it said anything. */}
          {compile.output || i18n._("The compile toolchain is not ready.")}
        </div>
      ) : outcome === "failed" ? (
        <>
          <PhaseRow phases={phases} now={now} />
          {questions.length > 0 ? (
            <ResizableFrame
              frameId={`draft-output:${draftId}`}
              label={i18n._("Resize the compiler's questions")}
              unit={16}
              defaultSteps={14}
              minSteps={6}
              maxSteps={40}
              data-testid="compile-questions"
              className="rounded-md border border-red-200 bg-red-50/40 p-2 text-xs dark:border-red-900 dark:bg-red-950/30"
            >
              <ol className="flex flex-col gap-2">
                {questions.map((question) => (
                  <li key={question.id} className="flex flex-col gap-0.5">
                    <span className="font-medium">{question.question}</span>
                    <span className="text-neutral-600 dark:text-neutral-400">{question.reason}</span>
                    {question.evidence ? (
                      <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-neutral-600 dark:text-neutral-400">
                        {question.evidence}
                      </pre>
                    ) : null}
                    {question.choices && question.choices.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {question.choices.map((choice) => (
                          <span
                            key={choice}
                            className="rounded-full border border-neutral-300 px-2 py-0.5 dark:border-neutral-700"
                          >
                            {choice}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </ResizableFrame>
          ) : output.length > 0 ? (
            <ResizableFrame
              frameId={`draft-output:${draftId}`}
              label={i18n._("Resize the compiler output")}
              unit={16}
              defaultSteps={12}
              minSteps={6}
              maxSteps={40}
              data-testid="compile-output"
              className="rounded-md border border-red-200 bg-red-50/40 p-2 dark:border-red-900 dark:bg-red-950/30"
            >
              <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-xs text-neutral-700 dark:text-neutral-300">
                {output.join("\n")}
              </pre>
            </ResizableFrame>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {/* What became of the failure, from the draft's own state
                (playbook-library-58) — never from the thread's words. */}
            <span data-testid="compile-caption">{relayCaption(compile?.relay, draft.failures)}</span>
            {askedBy ? <span data-testid="compile-by">{askedBy}</span> : null}
          </div>
        </>
      ) : outcome === "interrupted" ? (
        <div
          data-testid="compile-interrupted"
          className="flex flex-wrap items-center gap-x-3 text-xs text-amber-700 dark:text-amber-300"
        >
          <span>{i18n._("Compile interrupted when Spex closed")}</span>
          {askedBy ? <span className="text-neutral-500">{askedBy}</span> : null}
        </div>
      ) : outcome === "canceled" ? (
        <div data-testid="compile-canceled" className="text-xs text-neutral-500 dark:text-neutral-400">
          {i18n._("Compile canceled")}
        </div>
      ) : (
        <>
          {phases.some((phase) => phase.status !== "waiting") ? (
            <PhaseRow phases={phases} now={now} />
          ) : compile ? (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              <span aria-hidden="true">✓ </span>
              {i18n._("Compiled {age}", { age: relativeAge(compile.at, now) })}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {roles && roles.length > 0 ? (
              <span data-testid="compile-roles">{i18n._("roles: {roles}", { roles: roles.join(", ") })}</span>
            ) : null}
            {askedBy ? <span data-testid="compile-by">{askedBy}</span> : null}
          </div>
        </>
      )}
      {lines.length > 0 ? (
        <details data-testid="compile-log" className="text-xs">
          <summary className="cursor-pointer select-none text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
            {i18n._({ id: "Show log", comment: "unfold the compiler's raw output" })}
          </summary>
          <pre className="relative mt-1 max-h-48 overflow-y-auto rounded bg-neutral-100 p-2 font-mono text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
            {lines.join("\n")}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

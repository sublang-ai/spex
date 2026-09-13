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
import type { DraftInfo } from "@sublang/spex-core/protocol";

import { foldCompileLog, phaseLabel, type PhaseView } from "../lib/compile-log.js";
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
            <span
              data-testid={`phase-${phase.id}`}
              data-status={phase.status}
              title={`${phase.label} — the compiler's ${phase.id} phase, ${phase.status}`}
              className={`inline-flex items-center gap-1 whitespace-nowrap ${TONE[phase.status]}`}
            >
              {phase.status === "running" ? (
                <RunningMark running title="Running" />
              ) : (
                <span aria-hidden="true">{GLYPH[phase.status]}</span>
              )}
              <span className="sr-only">{phase.status}</span>
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

export function CompileBand({
  draftId,
  draft,
  lines,
  times,
  threadCaption,
  connected,
  onCancel,
}: {
  draftId: string;
  draft: DraftInfo;
  /** This compile's progress lines and their arrival times. */
  lines: string[];
  times: number[];
  /** What the thread's system line said about the failure — "sent to
   * the agent", "three in a row; …", "waiting for your queued message"
   * — so the band and the thread never disagree. */
  threadCaption?: string;
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
  const askedBy = compile ? (compile.by === "agent" ? "asked by the agent" : "asked by you") : undefined;
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
              <RunningMark running title="Running" />
              Starting the compiler…
            </span>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {lastOutputAt !== undefined ? (
              <span data-testid="last-output">
                last output {preciseAge(lastOutputAt, now)}
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
              Cancel
            </button>
          </div>
        </>
      ) : outcome === "failed" && compile?.phase === "toolchain" ? (
        <div
          data-testid="compile-toolchain"
          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {compile.output || "The compile toolchain is not ready."}
        </div>
      ) : outcome === "failed" ? (
        <>
          <PhaseRow phases={phases} now={now} />
          {questions.length > 0 ? (
            <ResizableFrame
              frameId={`draft-output:${draftId}`}
              label="Resize the compiler's questions"
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
              label="Resize the compiler output"
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
            <span data-testid="compile-caption">
              {threadCaption ??
                (draft.failures >= 3
                  ? "three in a row — tell the agent how to proceed"
                  : "sent to the agent")}
            </span>
            {askedBy ? <span data-testid="compile-by">{askedBy}</span> : null}
          </div>
        </>
      ) : outcome === "interrupted" ? (
        <div
          data-testid="compile-interrupted"
          className="flex flex-wrap items-center gap-x-3 text-xs text-amber-700 dark:text-amber-300"
        >
          <span>Compile interrupted when Spex closed</span>
          {askedBy ? <span className="text-neutral-500">{askedBy}</span> : null}
        </div>
      ) : outcome === "canceled" ? (
        <div data-testid="compile-canceled" className="text-xs text-neutral-500 dark:text-neutral-400">
          Compile canceled
        </div>
      ) : (
        <>
          {phases.some((phase) => phase.status !== "waiting") ? (
            <PhaseRow phases={phases} now={now} />
          ) : compile ? (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              <span aria-hidden="true">✓ </span>Compiled {relativeAge(compile.at, now)}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            {roles && roles.length > 0 ? (
              <span data-testid="compile-roles">roles: {roles.join(", ")}</span>
            ) : null}
            {askedBy ? <span data-testid="compile-by">{askedBy}</span> : null}
          </div>
        </>
      )}
      {lines.length > 0 ? (
        <details data-testid="compile-log" className="text-xs">
          <summary className="cursor-pointer select-none text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
            Show log
          </summary>
          <pre className="relative mt-1 max-h-48 overflow-y-auto rounded bg-neutral-100 p-2 font-mono text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
            {lines.join("\n")}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Captain's dispatching, said in its thread (run-view-178,
// run-view-181..183): a line where each call leaves for its player and
// one where it comes back, and a strip of who is at work on which step.
// Each names the player by its mark and name, the step by the words the
// lanes and the card use, and the outcome in the one status vocabulary,
// so the Captain reads as the one handing work out and taking it back.

import type { CaptainLine } from "../state/reducer.js";
import { judging, type StepCall } from "../lib/step-calls.js";
import { QUESTION_OUTCOME, outcomeWords, stepName } from "../lib/step-words.js";
import { STATUS_INK, STATUS_WORDS } from "../lib/status-words.js";
import { providerDefaultReading } from "../lib/session-agents.js";
import { duration } from "../lib/time.js";
import { i18n } from "../i18n.js";
import { AgentMark } from "./AgentMark.js";
import { RunningMark } from "./RunningMark.js";

/** A call's step as its label reads (run-view-181): the step's name,
 * with its round where the run walked that step before. */
export function stepLabel(call: StepCall): string {
  const step = stepName(call.playbookId, call.stateId);
  return call.round > 1
    ? i18n._({
        id: "{step}, round {round}",
        values: { step, round: call.round },
        comment: "a step a run walks again: its name and which time this is",
      })
    : step;
}

/** The call's place, from its own playbook down — "decide › Merge
 * the proposals" — and its whole path from the root run for the
 * tooltip. */
export function callPlace(call: StepCall): { short: string; full: string } {
  const step = stepLabel(call);
  return {
    short: `${call.playbookId} › ${step}`,
    full: [...(call.path.length > 0 ? call.path : [call.playbookId]), step].join(" › "),
  };
}

/** The first line of a reply, for a line that quotes it. */
export function firstLine(text: string | undefined): string | undefined {
  const line = text?.split(/\r?\n/u).map((part) => part.trim()).find((part) => part.length > 0);
  // Read as words: the reply's own Markdown marks would read as noise
  // on one line.
  const plain = line?.replace(/^[#>*\-\s]+/u, "").replace(/\*\*|__|`/gu, "").trim();
  return line ? plain || line : undefined;
}

// Only the dot is hidden from assistive technology: the spaces around
// it stay, so a line's parts never run together in its accessible name.
const SEP = <span className="text-neutral-400"> <span aria-hidden="true">·</span> </span>;

/** A call leaving for its player (run-view-178): the player, the step,
 * and — at the player's first call or a changed model — what it runs. */
export function DispatchLine({
  line,
  call,
  name,
  time,
  lane,
  onShow,
}: {
  line: CaptainLine;
  call?: StepCall;
  name: string;
  time: string;
  /** The player's lane stands, so the line leads to its call. */
  lane: boolean;
  onShow?: () => void;
}) {
  const delegation = line.delegation;
  if (!delegation) return null;
  const model = delegation.reported ??
    (delegation.model === false ? providerDefaultReading() : delegation.model);
  const runs = delegation.showRuns
    ? [delegation.adapter, model].filter((part): part is string => !!part)
    : [];
  const place = call ? callPlace(call) : undefined;
  const handed = i18n._({
    id: "Handed to {player}",
    values: { player: name },
    comment: "a delegation line: the Captain gave this call to the named player",
  });
  // Read as it is drawn, its parts apart: the dots between them are
  // drawn only.
  const spoken = [handed, ...(call ? [stepLabel(call)] : []), ...runs].join(", ");
  const body = (
    <>
      <AgentMark player={name} size="sm" />
      <span>
        {handed}
        {call ? (
          <>
            {SEP}
            <span data-testid="dispatch-step" title={place?.full}>{stepLabel(call)}</span>
          </>
        ) : null}
        {runs.map((part) => (
          <span key={part}>
            {SEP}
            <span className="font-mono">{part}</span>
          </span>
        ))}
      </span>
    </>
  );
  const className = "flex items-center gap-1.5 self-start rounded text-left text-xs leading-5 text-neutral-600 dark:text-neutral-400";
  // A call that failed before its player recorded anything has no
  // lane to lead to: the line says where it went, and nothing more.
  return lane ? (
    <button
      type="button"
      data-testid={`delegation-line-${delegation.player}`}
      data-call-dispatch={line.callKey}
      aria-label={spoken}
      onClick={onShow}
      title={`${delegation.player} · ${time}`}
      className={`${className} hover:text-neutral-900 dark:hover:text-neutral-100`}
    >
      {body}
    </button>
  ) : (
    <div
      data-testid={`delegation-line-${delegation.player}`}
      data-call-dispatch={line.callKey}
      title={`${delegation.player} · ${time}`}
      className={className}
    >
      {body}
    </div>
  );
}

/** A call coming back (run-view-182): what it came back with as the
 * Captain accepted it, the repository identity the runtime wrote, how
 * long it ran, and its reply's first line, the whole reply a click
 * away. Until the outcome is accepted the line says the call came
 * back and the Captain is judging it. */
export function ReturnLine({
  call,
  name,
  time,
  asking,
  lane,
  onShow,
}: {
  call: StepCall;
  name: string;
  time: string;
  /** The question this call asked still waits for the Boss. */
  asking: boolean;
  lane: boolean;
  onShow?: () => void;
}) {
  const span = call.finishedAt !== undefined ? duration(call.finishedAt - call.startedAt) : undefined;
  const head = call.status === "aborted"
    ? i18n._({
        id: "← {player} aborted",
        values: { player: name },
        comment: "a return line: the named player's call was stopped before it finished; ← stays as it is",
      })
    : call.outcome !== undefined
      ? i18n._({
          id: "← {player} {outcome}",
          values: { player: name, outcome: outcomeWords(call.playbookId, call.stateId, call.outcome) },
          comment: "a return line: the named player came back with this outcome; ← stays as it is",
        })
      : i18n._({
          id: "← {player} handed back",
          values: { player: name },
          comment: "a return line: the named player's call came back, its outcome not yet accepted; ← stays as it is",
        });
  const tag = call.status === "aborted"
    ? undefined
    : call.outcome === QUESTION_OUTCOME
      ? asking ? { word: STATUS_WORDS.waiting(), ink: STATUS_INK.waiting, state: "waiting" } : undefined
      : call.outcome !== undefined
        ? undefined
        : call.failed
          ? { word: STATUS_WORDS.failed(), ink: STATUS_INK.failed, state: "failed" }
        : judging(call)
          ? {
              word: i18n._({ id: "judging", comment: "a return line's tag: the Captain is judging what the call came back with" }),
              ink: STATUS_INK.running,
              state: "judging",
            }
          : {
              word: i18n._({ id: "unconfirmed", comment: "a return line's tag: no outcome was accepted for the call" }),
              ink: STATUS_INK.done,
              state: "unconfirmed",
            };
  const spoken = [
    [head, ...(call.identities ?? [])].join(" "),
    ...(tag ? [tag.word] : []),
    ...(span ? [span] : []),
  ].join(", ");
  // A question reaches the Boss in the Captain's words alone (DR-085):
  // its line says that the player asks, never what.
  const first = call.outcome === QUESTION_OUTCOME ? undefined : firstLine(call.finalText);
  const words = (
    <>
      <span data-testid="return-head" className={call.status === "aborted" ? STATUS_INK.aborted : undefined}>
        {head}
      </span>
      {call.identities?.map((identity) => (
        <span key={identity}>
          {" "}
          <span data-testid="return-identity" className="font-mono">{identity}</span>
        </span>
      ))}
      {tag ? (
        <>
          {SEP}
          <span data-testid="return-tag" className={tag.ink}>{tag.word}</span>
        </>
      ) : null}
      {span ? (
        <>
          {SEP}
          <span className="tabular-nums">{span}</span>
        </>
      ) : null}
    </>
  );
  return (
    <div
      data-testid={`return-line-${call.playerId ?? call.stateId}`}
      data-call-return={call.key}
      data-state={tag?.state ?? (call.status === "aborted" ? "aborted" : "accepted")}
      title={`${call.playerId ?? ""} · ${callPlace(call).full} · ${time}`}
      className="flex min-w-0 items-start gap-1.5 self-start text-xs leading-5 text-neutral-600 dark:text-neutral-400"
    >
      <AgentMark player={name} size="sm" className="mt-0.5" />
      {first ? (
        <details className="min-w-0 flex-1">
          {/* One line: the reply's first line ends in an ellipsis where
              the pane is narrower than it, its whole a click away. */}
          <summary className="cursor-pointer select-none">
            <span className="inline-flex w-[calc(100%-1rem)] min-w-0 items-baseline align-bottom">
            <span className="shrink-0">
            {lane ? (
              <button
                type="button"
                aria-label={spoken}
                onClick={(event) => {
                  event.preventDefault();
                  onShow?.();
                }}
                className="hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                {words}
              </button>
            ) : words}
            <span aria-hidden="true" className="px-1 text-neutral-400">·</span>
            </span>
            <span data-testid="return-first-line" title={first} className="min-w-0 truncate">{first}</span>
            </span>
          </summary>
          <div className="mt-1 whitespace-pre-wrap rounded bg-neutral-50 px-2 py-1 [overflow-wrap:anywhere] dark:bg-neutral-800/60">
            {call.finalText}
          </div>
        </details>
      ) : lane ? (
        <button type="button" aria-label={spoken} onClick={onShow} className="text-left hover:text-neutral-900 dark:hover:text-neutral-100">
          {words}
        </button>
      ) : (
        <span>{words}</span>
      )}
    </div>
  );
}

/** Who is at work, on which step and for how long (run-view-183): one
 * chip per open call, each leading to its lane. */
export function DispatchStrip({
  calls,
  names,
  now,
  onShow,
}: {
  calls: readonly StepCall[];
  names: (id: string) => string;
  now: number;
  onShow?: (call: StepCall) => void;
}) {
  return (
    <div data-testid="dispatch-strip" className="flex flex-wrap gap-1.5">
      {calls.map((call) => {
        const name = call.playerId ? names(call.playerId) : call.role ?? call.stateId;
        return (
          <button
            key={call.key}
            type="button"
            data-testid={`dispatch-chip-${call.playerId ?? call.stateId}`}
            onClick={() => onShow?.(call)}
            title={`${call.playerId ?? ""} · ${callPlace(call).full}`}
            className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 py-0.5 pr-2 pl-0.5 text-xs text-emerald-800 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          >
            <AgentMark player={name} size="sm" />
            <span>
              {i18n._({
                id: "{player} · {step} · {span}",
                values: { player: name, step: stepLabel(call), span: duration(Math.max(0, now - call.startedAt)) },
                comment: "a working chip: the player, the step it runs, and how long its call has run",
              })}
            </span>
            <RunningMark running />
          </button>
        );
      })}
    </div>
  );
}

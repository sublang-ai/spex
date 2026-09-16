// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One session's own tuning (DR-067, run-view-138): the Captain and
// each of its players, what each is set to run and where that came
// from, with model, effort and fast mode changeable for this
// conversation alone. It writes no configuration — the claim that a
// default cannot change from here is kept by there being no path that
// could, so this file imports nothing from the config edit ops.

import { useEffect, useRef, useState, type RefObject } from "react";
import type { SessionAgentTuning } from "@sublang/spex-core/protocol";

import { useAgentOptions, modelTuning } from "../lib/agent-options.js";
import { usePopover } from "../lib/usePopover.js";
import { useFitInBox } from "../lib/popover-fit.js";
import {
  effectiveTuning,
  tunedFields,
  type TuningAgent,
} from "../lib/session-tuning.js";
import { FAST_MODE_MARK } from "./AgentChip.js";
import { TuningField } from "./TuningField.js";

/** One agent's change, in the tri-state the config's own bindings use:
 * a value pins, `false` takes the provider's default, `null` clears
 * this session's own, and an absent key preserves it (DR-032). */
export interface TuningChange {
  model?: string | false | null;
  effort?: string | false | null;
  fastMode?: boolean | null;
}

/** What an agent is set to run, as a chip reads it. */
export function tuningReading(agent: TuningAgent): string {
  const effective = effectiveTuning(agent);
  let text = effective.model ?? agent.adapter;
  if (effective.effort) text += ` @ ${effective.effort}`;
  return text;
}

function Row({
  agent,
  open,
  onOpen,
  onTune,
  disabled,
}: {
  agent: TuningAgent;
  open: boolean;
  onOpen(): void;
  onTune(agentId: string, change: TuningChange): Promise<unknown>;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<SessionAgentTuning>(agent.tuning ?? {});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A row reopened after someone else's change starts from what stands
  // now, never from a draft the session has moved past.
  useEffect(() => { if (open) setDraft(agent.tuning ?? {}); }, [open, agent.tuning]);

  const discovery = useAgentOptions(agent.adapter);
  const pinnedModel = draft.model === false ? "" : draft.model ?? agent.configured.model ?? "";
  const tuning = modelTuning(discovery.options, pinnedModel);
  const models = discovery.options?.discovery?.status === "available" ? discovery.options.discovery.models ?? [] : [];
  const effectiveEffort = draft.effort === false ? undefined : draft.effort ?? agent.configured.effort;
  const invalidEffort = draft.effort === "" || Boolean(discovery.options && effectiveEffort && !tuning.efforts.includes(effectiveEffort));
  const invalidModel = typeof draft.model === "string" && !draft.model.trim();
  const adapterFastMode = discovery.options?.fastModeSupported;
  const effectiveFastMode = draft.fastMode ?? agent.configured.fastMode ?? false;
  const invalidFastMode = (adapterFastMode === false && draft.fastMode != null) || (effectiveFastMode && tuning.fastModeSupported === false);

  const named = tunedFields(agent.tuning);
  const reading = tuningReading(agent);
  const fastMode = effectiveTuning(agent).fastMode;

  const apply = (change: TuningChange) => {
    setBusy(true);
    setError(undefined);
    void Promise.resolve(onTune(agent.id, change))
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  };

  return (
    <li data-testid={`tuning-row-${agent.id}`} className="flex flex-col gap-1 border-b border-neutral-200 py-2 last:border-b-0 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        {/* The row is about its agent, so the name never yields first;
            the chip owns the slack and truncates, its whole reading in
            its title (DR-041). */}
        <span className="max-w-[11rem] shrink-0 truncate text-xs font-semibold" title={agent.name}>{agent.name}</span>
        <span
          data-testid={`tuning-reading-${agent.id}`}
          title={reading}
          className="min-w-0 flex-1 truncate rounded bg-neutral-100 px-1.5 py-0.5 text-right font-mono text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {reading}
          {fastMode ? <span aria-label="fast mode" title="fast mode" className="ml-1 text-amber-500">{FAST_MODE_MARK}</span> : null}
        </span>
        {named.length > 0 && !disabled ? (
          <button
            type="button"
            data-testid={`tuning-reset-${agent.id}`}
            disabled={busy}
            onClick={() => apply({ model: null, effort: null, fastMode: null })}
            className="shrink-0 rounded px-1.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Reset
          </button>
        ) : null}
        {disabled ? null : (
          <button
            type="button"
            data-testid={`tuning-open-${agent.id}`}
            aria-expanded={open}
            onClick={onOpen}
            className="shrink-0 rounded px-1.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {open ? "Done" : "Tune"}
          </button>
        )}
      </div>
      <p data-testid={`tuning-origin-${agent.id}`} className="text-xs text-neutral-500 dark:text-neutral-400">
        {named.length > 0 ? `This session: ${named.join(", ")}.` : "From Settings."}
        {agent.divergentRoles.length > 0
          ? ` ${agent.divergentRoles.join(", ")} ${agent.divergentRoles.length === 1 ? "tunes" : "tune"} this lane too — one choice here runs ${agent.divergentRoles.length === 1 ? "it" : "them"} alike.`
          : ""}
      </p>
      {open ? (
        <div className="mt-1 flex flex-col gap-2">
          <TuningField
            label="model"
            testIdPrefix={`tuning-${agent.id}`}
            inheritLabel="from Settings"
            value={draft.model}
            playerDefault={agent.configured.model}
            models={models}
            onChange={(next) => setDraft((current) => ({ ...current, ...(next === null ? { model: undefined } : { model: next }) }))}
          />
          <TuningField
            label="effort"
            testIdPrefix={`tuning-${agent.id}`}
            inheritLabel="from Settings"
            value={draft.effort}
            playerDefault={agent.configured.effort}
            efforts={tuning.efforts}
            additionalEfforts={tuning.additionalEfforts}
            onChange={(next) => setDraft((current) => ({ ...current, ...(next === null ? { effort: undefined } : { effort: next }) }))}
          />
          {(adapterFastMode === true || draft.fastMode != null || effectiveFastMode) && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">Fast mode</span>
              <select
                data-testid={`tuning-${agent.id}-fast-mode`}
                value={draft.fastMode == null ? "inherit" : draft.fastMode ? "on" : "off"}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  ...(event.target.value === "inherit" ? { fastMode: undefined } : { fastMode: event.target.value === "on" }),
                }))}
                className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="inherit">from Settings ({agent.configured.fastMode ? "on" : "off"})</option>
                {adapterFastMode === true && (tuning.fastModeSupported !== false || draft.fastMode === true) && (
                  <option value="on">On{tuning.fastModeSupported === false ? " (unsupported)" : ""}</option>
                )}
                {adapterFastMode === true && <option value="off">Off</option>}
                {adapterFastMode !== true && draft.fastMode != null && (
                  <option value={draft.fastMode ? "on" : "off"}>{draft.fastMode ? "On" : "Off"} ({adapterFastMode === false ? "unsupported" : "current"})</option>
                )}
              </select>
            </label>
          )}
          <ModelDiscoveryNote agentId={agent.id} discovery={discovery} />
          {invalidFastMode && <p role="alert" className="text-xs text-red-600">{adapterFastMode === false ? "Clear the fast-mode choice; this adapter does not accept it." : "Turn off fast mode for this model."}</p>}
          {invalidEffort && <p role="alert" className="text-xs text-red-600">Choose a listed effort, take the configured value, or use the provider default.</p>}
          {invalidModel && <p role="alert" className="text-xs text-red-600">Enter a model ID, take the configured value, or use the provider default.</p>}
          {error ? <p role="alert" data-testid={`tuning-error-${agent.id}`} className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              data-testid={`tuning-apply-${agent.id}`}
              disabled={busy || invalidEffort || invalidModel || invalidFastMode}
              onClick={() => apply({
                model: draft.model ?? null,
                effort: draft.effort ?? null,
                fastMode: draft.fastMode ?? null,
              })}
              className="min-h-6 rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {busy ? "Applying…" : "Apply"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ModelDiscoveryNote({ agentId, discovery }: { agentId: string; discovery: ReturnType<typeof useAgentOptions> }) {
  if (discovery.loading) return <p className="text-xs text-neutral-500">Loading model options…</p>;
  if (discovery.error || discovery.options?.discovery?.status === "unavailable") {
    const reason = discovery.error ?? (discovery.options?.discovery?.status === "unavailable" ? discovery.options.discovery.reason : "");
    return (
      <p className="text-xs text-neutral-500">
        Model list unavailable: {reason}{" "}
        <button type="button" data-testid={`tuning-${agentId}-refresh`} onClick={discovery.refresh} className="underline">
          Refresh models
        </button>
      </p>
    );
  }
  return null;
}

/** An agent's chip, and the control that tunes it (run-view-139): the
 * reading is what the agent is set to run, and the chip itself is the
 * door — a gear here would name the Settings surface, which is the one
 * promise this control must not make. */
export function TuningChip({
  agent,
  onOpen,
  anchorRef,
  open = false,
}: {
  agent: TuningAgent;
  onOpen(): void;
  anchorRef?: RefObject<HTMLButtonElement | null>;
  open?: boolean;
}) {
  const reading = tuningReading(agent);
  const tuned = tunedFields(agent.tuning).length > 0;
  const fastMode = effectiveTuning(agent).fastMode;
  return (
    <button
      type="button"
      ref={anchorRef}
      data-testid={`tuning-chip-${agent.id}`}
      data-tuned={tuned ? "true" : undefined}
      aria-expanded={open}
      aria-label={`Tune ${agent.name}: ${reading}${fastMode ? ", fast mode" : ""}${tuned ? ", tuned for this session" : ""}`}
      title={`${reading}${tuned ? " — tuned for this session" : ""}`}
      onClick={onOpen}
      className={`flex min-h-6 min-w-0 max-w-full items-center rounded px-1.5 py-0.5 text-xs whitespace-nowrap hover:bg-neutral-200 dark:hover:bg-neutral-700 ${
        tuned
          ? "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-400 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-500"
          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
      }`}
    >
      <span className="min-w-0 truncate">{reading}</span>
      {fastMode ? (
        <span data-testid={`tuning-fast-mode-${agent.id}`} aria-hidden title="fast mode" className="ml-1 text-amber-500">{FAST_MODE_MARK}</span>
      ) : null}
    </button>
  );
}

/** The panel, anchored at whichever control opened it (run-view-138):
 * a pane's own chip, or the session header's count. */
export function SessionTuningPopover({
  agents,
  openAgentId,
  side = "right",
  turnActive,
  readOnly,
  anchorRef,
  onTune,
  onClose,
}: {
  agents: TuningAgent[];
  /** The agent whose row opens expanded — the one whose chip was used. */
  openAgentId?: string;
  /** Which edge of its anchor the panel hangs from: a pane's chip sits
   * at the left of a narrow header, the session's control at the right. */
  side?: "left" | "right";
  turnActive: boolean;
  /** A session another host owns, or history the core cannot continue,
   * reads its tuning without writing it. */
  readOnly: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onTune(agentId: string, change: TuningChange): Promise<unknown>;
  onClose(): void;
}) {
  const [open, setOpen] = useState<string | undefined>(openAgentId);
  const boxRef = usePopover<HTMLDivElement>(true, { anchorRef, onClose });
  useFitInBox(boxRef);
  const clearing = useRef(false);
  const [busy, setBusy] = useState(false);
  const tuned = agents.filter((agent) => tunedFields(agent.tuning).length > 0);

  return (
    <div
      ref={boxRef}
      data-testid="session-tuning"
      role="dialog"
      aria-label="This session's tuning"
      className={`absolute ${side === "left" ? "left-0" : "right-0"} top-7 z-20 flex max-h-[min(28rem,calc(100vh-4rem))] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-lg border border-neutral-300 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900`}
    >
      <p className="text-xs font-semibold">This session's tuning</p>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        {readOnly
          ? "This conversation is in use elsewhere — its tuning reads only."
          : turnActive
            ? "Applies from your next message. This turn keeps the settings it started with."
            : "Applies from your next message. Your defaults in Settings do not change."}
      </p>
      <ul className="mt-1 flex flex-col">
        {agents.map((agent) => (
          <Row
            key={agent.id}
            agent={agent}
            open={open === agent.id}
            onOpen={() => setOpen((current) => (current === agent.id ? undefined : agent.id))}
            onTune={onTune}
            disabled={readOnly}
          />
        ))}
      </ul>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Adapter, instruction and permissions live in Settings — changing them needs a new session.
      </p>
      {tuned.length > 1 && !readOnly ? (
        <div className="mt-2 flex justify-start">
          <button
            type="button"
            data-testid="session-tuning-clear"
            disabled={busy}
            onClick={() => {
              if (clearing.current) return;
              clearing.current = true;
              setBusy(true);
              // One at a time: each change is a read-modify-write on the
              // session's own tuning, and the reader sees them land.
              void (async () => {
                for (const agent of tuned) {
                  await onTune(agent.id, { model: null, effort: null, fastMode: null }).catch(() => undefined);
                }
              })().finally(() => { clearing.current = false; setBusy(false); });
            }}
            className="min-h-6 rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {busy ? "Clearing…" : "Use defaults"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

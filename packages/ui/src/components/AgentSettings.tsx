// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One agent's settings for one conversation (DR-068, run-view-138):
// the chip in a pane's header reads what that agent is set to run and
// opens an editor for that agent alone — model, effort, fast mode, in
// the tri-state grammar the role-binding editor already uses. There is
// no roster and no name for the act: it is an agent's settings, here.
//
// It writes no configuration, so this file imports nothing from the
// config edit ops — the claim that a default cannot change from here is
// kept by there being no path that could.

import { useState, type RefObject } from "react";
import type { SessionAgentSettings } from "@sublang/spex-core/protocol";

import { useAgentOptions, modelTuning } from "../lib/agent-options.js";
import { usePopover } from "../lib/usePopover.js";
import { useFitInBox } from "../lib/popover-fit.js";
import {
  changedFields,
  effectiveSettings,
  type SessionAgent,
} from "../lib/session-agents.js";
import { FAST_MODE_MARK } from "./AgentChip.js";
import { TuningField } from "./TuningField.js";

/** One agent's change, in the tri-state the config's own bindings use:
 * a value pins, `false` takes the provider's default, `null` clears
 * this conversation's own, and an absent key preserves it (DR-032). */
export interface AgentSettingsChange {
  model?: string | false | null;
  effort?: string | false | null;
  fastMode?: boolean | null;
}

/** What an agent is set to run, as a chip reads it. */
export function agentReading(agent: SessionAgent): string {
  const effective = effectiveSettings(agent);
  let text = effective.model ?? agent.adapter;
  if (effective.effort) text += ` @ ${effective.effort}`;
  return text;
}

/** An agent's chip, and the control that edits it (run-view-139): the
 * reading is what the agent is set to run, and the chip itself is the
 * door — a gear here would name the Settings surface, which is the one
 * promise this control must not make. */
export function AgentChipButton({
  agent,
  onOpen,
  anchorRef,
  open = false,
}: {
  agent: SessionAgent;
  onOpen(): void;
  anchorRef?: RefObject<HTMLButtonElement | null>;
  open?: boolean;
}) {
  const reading = agentReading(agent);
  const changed = changedFields(agent.settings).length > 0;
  const fastMode = effectiveSettings(agent).fastMode;
  return (
    <button
      type="button"
      ref={anchorRef}
      data-testid={`agent-chip-${agent.id}`}
      data-changed={changed ? "true" : undefined}
      aria-expanded={open}
      aria-label={`${agent.name} settings: ${reading}${fastMode ? ", fast mode" : ""}${changed ? ", changed for this conversation" : ""}`}
      title={`${reading}${changed ? " — changed for this conversation" : ""}`}
      className={`flex min-h-6 min-w-0 max-w-full items-center rounded px-1.5 py-0.5 text-xs whitespace-nowrap hover:bg-neutral-200 dark:hover:bg-neutral-700 ${
        changed
          ? "bg-neutral-100 text-neutral-700 ring-1 ring-neutral-400 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-500"
          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
      }`}
      onClick={onOpen}
    >
      <span className="min-w-0 truncate">{reading}</span>
      {fastMode ? (
        <span data-testid={`agent-fast-mode-${agent.id}`} aria-hidden title="fast mode" className="ml-1 text-amber-500">
          {FAST_MODE_MARK}
        </span>
      ) : null}
    </button>
  );
}

/** This agent's settings for this conversation, anchored at its own
 * chip (run-view-138). Three fields, what it cannot change, and where
 * the change lands — the role-binding editor's shape, one scope over. */
export function AgentSettingsPopover({
  agent,
  side = "left",
  readOnly,
  anchorRef,
  onSave,
  onClose,
}: {
  agent: SessionAgent;
  /** Which edge of its anchor the editor hangs from. */
  side?: "left" | "right";
  /** A conversation another host owns, or history the core cannot
   * continue, reads its agents' settings without writing them. */
  readOnly: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onSave(change: AgentSettingsChange): Promise<unknown>;
  onClose(): void;
}) {
  const [draft, setDraft] = useState<SessionAgentSettings>(agent.settings ?? {});
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const boxRef = usePopover<HTMLDivElement>(true, { anchorRef, onClose });
  useFitInBox(boxRef);

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
  const changed = changedFields(agent.settings).length > 0 || changedFields(draft).length > 0;
  const unavailable = discovery.error
    ?? (discovery.options?.discovery?.status === "unavailable" ? discovery.options.discovery.reason : undefined);

  return (
    <div
      ref={boxRef}
      data-testid={`agent-settings-${agent.id}`}
      role="dialog"
      aria-label={`${agent.name} settings for this conversation`}
      className={`absolute ${side === "left" ? "left-0" : "right-0"} top-7 z-20 flex max-h-[min(26rem,calc(100vh-4rem))] w-72 max-w-[calc(100vw-1rem)] flex-col gap-2 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900`}
    >
      <p className="text-xs font-semibold">{agent.name}</p>

      {readOnly ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          This conversation is in use elsewhere — its settings read only.
        </p>
      ) : null}

      <TuningField
        label="model"
        testIdPrefix={`agent-${agent.id}`}
        inheritLabel="from Settings"
        value={draft.model}
        playerDefault={agent.configured.model}
        models={models}
        onChange={(next) => setDraft((current) => ({ ...current, ...(next === null ? { model: undefined } : { model: next }) }))}
      />
      <TuningField
        label="effort"
        testIdPrefix={`agent-${agent.id}`}
        inheritLabel="from Settings"
        value={draft.effort}
        playerDefault={agent.configured.effort}
        efforts={tuning.efforts}
        additionalEfforts={tuning.additionalEfforts}
        onChange={(next) => setDraft((current) => ({ ...current, ...(next === null ? { effort: undefined } : { effort: next }) }))}
      />
      {(adapterFastMode === true || draft.fastMode != null || effectiveFastMode) && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">fast mode</span>
          <select
            data-testid={`agent-${agent.id}-fast-mode`}
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

      {discovery.loading && <p className="text-xs text-neutral-500">Loading model options…</p>}
      {unavailable !== undefined && (
        <p className="text-xs text-neutral-500">
          Model list unavailable: {unavailable}{" "}
          <button type="button" data-testid={`agent-${agent.id}-refresh`} onClick={discovery.refresh} className="underline">
            Refresh models
          </button>
        </p>
      )}
      {!tuning.effortKnown && <p className="text-xs text-neutral-500">Effort options apply to the adapter; support for this model is unverified.</p>}
      {invalidFastMode && <p role="alert" className="text-xs text-red-600">{adapterFastMode === false ? "Clear the fast-mode choice; this adapter does not accept it." : "Turn off fast mode for this model."}</p>}
      {invalidEffort && <p role="alert" className="text-xs text-red-600">Choose a listed effort, take the configured value, or use the provider default.</p>}
      {invalidModel && <p role="alert" className="text-xs text-red-600">Enter a model ID, take the configured value, or use the provider default.</p>}

      {/* Where the change lands, and what it cannot reach. */}
      <p data-testid={`agent-scope-${agent.id}`} className="text-xs text-neutral-500 dark:text-neutral-400">
        This conversation only — your Settings do not change.
        {agent.divergentRoles.length > 0
          ? ` ${agent.divergentRoles.join(", ")} ${agent.divergentRoles.length === 1 ? "sets" : "set"} this agent too, and one choice here runs ${agent.divergentRoles.length === 1 ? "it" : "them"} alike.`
          : ""}
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Adapter, instruction and permissions live in Settings — changing them needs a new session.
      </p>

      {error ? <p role="alert" data-testid={`agent-error-${agent.id}`} className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      {readOnly ? null : (
        <div className="flex items-center justify-end gap-2">
          {changed ? (
            <button
              type="button"
              data-testid={`agent-default-${agent.id}`}
              onClick={() => setDraft({})}
              className="mr-auto min-h-6 rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Use default
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-6 rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid={`agent-save-${agent.id}`}
            disabled={busy || invalidEffort || invalidModel || invalidFastMode}
            onClick={() => {
              setBusy(true);
              setError(undefined);
              void Promise.resolve(onSave({
                model: draft.model ?? null,
                effort: draft.effort ?? null,
                fastMode: draft.fastMode ?? null,
              }))
                .then(() => onClose())
                .catch((cause: Error) => { setError(cause.message); setBusy(false); });
            }}
            className="min-h-6 rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

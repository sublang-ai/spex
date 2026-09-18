// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The role-binding editor (DR-032): which session player answers a
// role, plus that role's own model and effort. Adapter, permissions
// and workspace belong to the player's envelope and have no control
// here, because in the released model a binding cannot carry them.

import { useState, type RefObject } from "react";
import type {
  RoleBindingSummary,
  SessionPlayerSummary,
} from "@sublang/spex-core/protocol";

import { useAgentOptions, modelTuning } from "../lib/agent-options.js";
import { i18n } from "../i18n.js";
import { TuningField } from "./TuningField.js";
import { ModelDiscoveryStatus } from "./ModelDiscoveryStatus.js";
import { useFitInBox } from "../lib/popover-fit.js";
import { usePopover } from "../lib/usePopover.js";

export interface BindingChange {
  playerId: string;
  model?: string | false | null;
  effort?: string | false | null;
  fastMode?: boolean | null;
}

export function BindingEditorPopover({
  role,
  position,
  binding,
  players,
  anchorRef,
  onSave,
  onClose,
}: {
  role: string;
  /** This binding's own position, `<playbook>.<role>`, so the lane's
   * other holders can be named without counting this one. */
  position: string;
  binding: RoleBindingSummary;
  players: SessionPlayerSummary[];
  anchorRef: RefObject<HTMLButtonElement | null>;
  onSave(next: BindingChange): Promise<unknown>;
  onClose(): void;
}) {
  const [draft, setDraft] = useState<BindingChange>({
    playerId: binding.playerId,
    model: binding.model,
    effort: binding.effort,
    fastMode: binding.fastMode,
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The house popover idiom (DR-010 §6): focus enters on open and
  // returns to the role's control on close; Escape and an outside
  // click close.
  const boxRef = usePopover<HTMLDivElement>(true, { anchorRef, onClose });
  // And it lies inside the box that must show it, however narrow the
  // pane or far along the roles row its control sits
  // (playbook-library-43, DR-041 §9).
  useFitInBox(boxRef);
  const lane = players.find((player) => player.id === draft.playerId);
  const discovery = useAgentOptions(lane?.agent.adapter ?? "claude");
  const effectiveModel = draft.model === false ? "" : draft.model ?? lane?.agent.model ?? "";
  const tuning = modelTuning(discovery.options, effectiveModel);
  const models = discovery.options?.discovery.status === "available" ? discovery.options.discovery.models : [];
  const effectiveEffort = draft.effort === false ? undefined : draft.effort ?? lane?.agent.effort;
  const invalidEffort = draft.effort === "" || Boolean(discovery.options && effectiveEffort && !tuning.efforts.includes(effectiveEffort));
  const effectiveFastMode = draft.fastMode ?? lane?.agent.fastMode ?? false;
  const adapterFastMode = discovery.options?.fastModeSupported;
  const invalidFastMode = (adapterFastMode === false && draft.fastMode != null) || (effectiveFastMode && tuning.fastModeSupported === false);
  const invalidModel = typeof draft.model === "string" && !draft.model.trim();
  // Every other position this lane already answers: picking it here
  // joins that one conversation rather than opening a new one.
  const others = (lane?.boundBy ?? []).filter((held) => held !== position);

  return (
    <div
      ref={boxRef}
      data-testid={`binding-editor-${role}`}
      role="dialog"
      aria-label={i18n._("Bind {role}", { role })}
      className="absolute left-0 top-7 z-20 flex w-72 max-w-[calc(100vw-1rem)] flex-col gap-2 overflow-y-auto rounded-lg border border-neutral-300 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">
          {i18n._("{role} runs as", { role })}
        </span>
        <select
          data-testid="binding-player"
          value={draft.playerId}
          onChange={(event) =>
            setDraft((current) => ({ ...current, playerId: event.target.value }))
          }
          className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono dark:border-neutral-700 dark:bg-neutral-900"
        >
          {players.map((player) => (
            <option key={player.id} value={player.id}>
              {player.id} · {player.display}
            </option>
          ))}
        </select>
        {others.length > 0 ? (
          <span
            data-testid="binding-shared-note"
            className="text-xs text-brand-700 dark:text-brand-300"
          >
            {i18n._("Also answers {positions}", { positions: others.join(", ") })}
          </span>
        ) : null}
      </label>

      <TuningField
        label="model"
        value={draft.model === null ? undefined : draft.model}
        playerDefault={lane?.agent.model}
        models={models}
        onChange={(next) => setDraft((current) => ({ ...current, model: next }))}
      />
      <TuningField
        label="effort"
        value={draft.effort === null ? undefined : draft.effort}
        playerDefault={lane?.agent.effort}
        efforts={tuning.efforts}
        additionalEfforts={tuning.additionalEfforts}
        onChange={(next) => setDraft((current) => ({ ...current, effort: next }))}
      />

      {(adapterFastMode === true || draft.fastMode != null || effectiveFastMode) && <label className="flex flex-col gap-1 text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">{i18n._({ id: "Fast mode", comment: "switch: run this agent in its adapter's fast mode" })}</span>
        <select data-testid="binding-fast-mode" value={draft.fastMode == null ? "inherit" : draft.fastMode ? "on" : "off"}
          onChange={(event) => setDraft((current) => ({ ...current, fastMode: event.target.value === "inherit" ? null : event.target.value === "on" }))}
          className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900">
          {/* Each choice is one whole phrase: what it inherits, or what
              it pins and how the runtime stands toward it. */}
          <option value="inherit">{lane?.agent.fastMode ? i18n._("Inherit the player (on)") : i18n._("Inherit the player (off)")}</option>
          {adapterFastMode === true && (tuning.fastModeSupported !== false || draft.fastMode === true) && <option value="on">{tuning.fastModeSupported === false ? i18n._("On (unsupported)") : i18n._({ id: "On", comment: "fast mode is pinned on" })}</option>}
          {adapterFastMode === true && <option value="off">{i18n._({ id: "Off", comment: "fast mode is pinned off" })}</option>}
          {adapterFastMode !== true && draft.fastMode != null && <option value={draft.fastMode ? "on" : "off"}>{draft.fastMode
            ? (adapterFastMode === false ? i18n._("On (unsupported)") : i18n._("On (current)"))
            : (adapterFastMode === false ? i18n._("Off (unsupported)") : i18n._("Off (current)"))}</option>}
        </select>
        {!tuning.fastModeKnown && <span className="text-neutral-500">{i18n._("Adapter option; model support unverified.")}</span>}
      </label>}
      <ModelDiscoveryStatus state={discovery} />
      {!tuning.effortKnown && <p className="text-xs text-neutral-500">{i18n._("Effort options apply to the adapter; support for this model is unverified.")}</p>}
      {invalidFastMode && <p role="alert" className="text-xs text-red-600">{adapterFastMode === false ? i18n._("Clear the fast-mode override; this adapter does not accept it.") : i18n._("Turn off fast mode for this model.")}</p>}
      {invalidEffort && <p role="alert" className="text-xs text-red-600">{i18n._("Choose a listed effort, inherit, or use the provider default.")}</p>}
      {invalidModel && <p role="alert" className="text-xs text-red-600">{i18n._("Enter a model ID, inherit, or use the provider default.")}</p>}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-6 rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {i18n._({ id: "Cancel", comment: "leave an editor without saving" })}
        </button>
        <button
          type="button"
          data-testid="binding-save"
          disabled={busy || invalidEffort || invalidModel || invalidFastMode}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            void Promise.resolve(onSave(draft))
              .catch((cause: Error) => setError(cause.message))
              .finally(() => setBusy(false));
          }}
          className="min-h-6 rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? i18n._({ id: "Saving…", comment: "a save is in flight" }) : i18n._({ id: "Save", comment: "commit the edits in this editor" })}
        </button>
      </div>
    </div>
  );
}

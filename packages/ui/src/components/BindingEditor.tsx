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

import { usePopover } from "../lib/usePopover.js";

export interface BindingChange {
  playerId: string;
  model?: string | false | null;
  effort?: string | false | null;
}

/** A tuning field is tri-state: inherit the player's default, take the
 * provider's current default, or pin a value (DR-032). */
function TuningField({
  label,
  value,
  playerDefault,
  onChange,
}: {
  label: string;
  value: string | false | undefined;
  playerDefault: string | undefined;
  onChange(next: string | false | null): void;
}) {
  const mode = value === undefined ? "inherit" : value === false ? "provider" : "pin";
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <select
        data-testid={`binding-${label}-mode`}
        value={mode}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "inherit") onChange(null);
          else if (next === "provider") onChange(false);
          else onChange(playerDefault ?? "");
        }}
        className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
      >
        <option value="inherit">
          inherit the player{playerDefault ? ` (${playerDefault})` : ""}
        </option>
        <option value="provider">the provider's default</option>
        <option value="pin">pin a value…</option>
      </select>
      {mode === "pin" ? (
        <input
          data-testid={`binding-${label}-value`}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono dark:border-neutral-700 dark:bg-neutral-900"
        />
      ) : null}
    </label>
  );
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
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The house popover idiom (DR-010 §6): focus enters on open and
  // returns to the role's control on close; Escape and an outside
  // click close.
  const boxRef = usePopover<HTMLDivElement>(true, { anchorRef, onClose });
  const lane = players.find((player) => player.id === draft.playerId);
  // Every other position this lane already answers: picking it here
  // joins that one conversation rather than opening a new one.
  const others = (lane?.boundBy ?? []).filter((held) => held !== position);

  return (
    <div
      ref={boxRef}
      data-testid={`binding-editor-${role}`}
      role="dialog"
      aria-label={`Bind ${role}`}
      className="absolute left-0 top-7 z-20 flex w-72 flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">
          {role} runs as
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
            Also answers {others.join(", ")} — one conversation across them.
          </span>
        ) : null}
      </label>

      <TuningField
        label="model"
        value={draft.model === null ? undefined : draft.model}
        playerDefault={lane?.agent.model}
        onChange={(next) => setDraft((current) => ({ ...current, model: next }))}
      />
      <TuningField
        label="effort"
        value={draft.effort === null ? undefined : draft.effort}
        playerDefault={lane?.agent.effort}
        onChange={(next) => setDraft((current) => ({ ...current, effort: next }))}
      />

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Adapter and permissions belong to the player — edit them in
        Settings.
      </p>

      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-6 rounded px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="binding-save"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            void Promise.resolve(onSave(draft))
              .catch((cause: Error) => setError(cause.message))
              .finally(() => setBusy(false));
          }}
          className="min-h-6 rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

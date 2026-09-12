// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Register tab (playbook-library-61, playbook-library-7): the
// registration form over the compiled entry's derived roles —
// command, intent, and one player per role — prefilled in the
// precedence the Boss's own edits, then the agent's latest proposal,
// then derived defaults. A role's row offers the roster and a new
// lane `dev.<role>` carrying the draft's agent block, editable in
// place as a built-in's is; a proposal that names a role the entry
// lacks is shown as a mismatch with the derived roles authoritative.
// Nothing is written until Register.

import { useRef, useState } from "react";
import type {
  AgentBlockInput,
  AgentSummary,
  DraftInfo,
  ReadinessEntry,
  SessionPlayerSummary,
} from "@sublang/spex-core/protocol";

import type { DraftRegisterForm, DraftSourceState } from "../state/store.js";
import { applyLocalPatch } from "../lib/config-ops.js";
import {
  agentBlockOf,
  busyReason,
  firstProseParagraph,
  newPlayerId,
} from "../lib/drafts.js";
import { AgentChip } from "./AgentChip.js";
import { AgentEditorPopover } from "./AgentEditor.js";
import { Icon } from "./Icon.js";

const NEW_PREFIX = "new:";

export interface RegisterInput {
  command: string;
  intent: string;
  bindings: Record<string, string>;
  newPlayers?: Record<string, AgentBlockInput>;
}

/** The form's effective values (playbook-library-61): the Boss's edits
 * win over the proposal, which wins over the derived defaults. */
export function resolveRegisterForm(
  draft: DraftInfo,
  source: DraftSourceState | null | undefined,
  players: SessionPlayerSummary[],
  form: DraftRegisterForm | undefined,
): {
  roles: string[];
  command: string;
  intent: string;
  /** Role → roster id, or `new:<id>` for a lane to mint. */
  choices: Record<string, string>;
  /** Role → the id its "New player" option would mint. */
  newIds: Record<string, string>;
  mismatch?: { extra: string[]; missing: string[] };
} {
  const roles = draft.compile?.outcome === "ok" ? (draft.compile.roles ?? []) : [];
  const proposal = draft.proposal;
  const roster = new Set(players.map((player) => player.id));
  const choices: Record<string, string> = {};
  const newIds: Record<string, string> = {};
  for (const role of roles) {
    const proposed = proposal?.players[role];
    // A proposed player the roster lacks is offered as that new player.
    const newId = proposed && !roster.has(proposed) ? proposed : newPlayerId(role);
    newIds[role] = newId;
    const fromProposal = proposed
      ? roster.has(proposed)
        ? proposed
        : `${NEW_PREFIX}${proposed}`
      : undefined;
    choices[role] = form?.players[role] ?? fromProposal ?? `${NEW_PREFIX}${newId}`;
  }
  const extra = proposal
    ? Object.keys(proposal.players).filter((role) => !roles.includes(role))
    : [];
  const missing = proposal ? roles.filter((role) => !(role in proposal.players)) : [];
  return {
    roles,
    command: form?.command ?? proposal?.command ?? draft.id,
    intent:
      form?.intent ?? proposal?.intent ?? firstProseParagraph(source?.markdown ?? ""),
    choices,
    newIds,
    ...(extra.length > 0 || missing.length > 0 ? { mismatch: { extra, missing } } : {}),
  };
}

const INPUT_CLASS =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950";

export function DraftRegisterTab({
  draft,
  source,
  players,
  captain,
  readiness,
  form,
  connected,
  onForm,
  onRegister,
}: {
  draft: DraftInfo;
  source: DraftSourceState | null | undefined;
  players: SessionPlayerSummary[];
  captain?: AgentSummary;
  readiness: ReadinessEntry[];
  form?: DraftRegisterForm;
  connected: boolean;
  onForm: (form: DraftRegisterForm) => void;
  onRegister: (input: RegisterInput) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [openRole, setOpenRole] = useState<string>();
  const gearRef = useRef<HTMLButtonElement>(null);
  const readinessByAdapter = new Map(readiness.map((entry) => [entry.adapter as string, entry]));
  const resolved = resolveRegisterForm(draft, source, players, form);
  const current: DraftRegisterForm = form ?? { players: {}, newPlayers: {} };
  const draftBlock = agentBlockOf(draft.agent);
  const waiting = busyReason(draft);

  const blockFor = (newId: string): AgentBlockInput =>
    current.newPlayers[newId] ?? draftBlock;
  const complete =
    resolved.command.trim().length > 0 &&
    resolved.intent.trim().length > 0 &&
    resolved.roles.every((role) => resolved.choices[role]);
  const disabled = !connected || busy || !complete || waiting !== undefined;

  async function register(): Promise<void> {
    if (disabled) return;
    setBusy(true);
    setError(undefined);
    const bindings: Record<string, string> = {};
    const newPlayers: Record<string, AgentBlockInput> = {};
    for (const role of resolved.roles) {
      const choice = resolved.choices[role];
      if (choice.startsWith(NEW_PREFIX)) {
        const id = choice.slice(NEW_PREFIX.length);
        bindings[role] = id;
        newPlayers[id] = blockFor(id);
      } else {
        bindings[role] = choice;
      }
    }
    try {
      await onRegister({
        command: resolved.command.trim(),
        intent: resolved.intent.trim(),
        bindings,
        ...(Object.keys(newPlayers).length > 0 ? { newPlayers } : {}),
      });
    } catch (cause) {
      // The refusal stands inline and the form stays (playbook-library-61).
      setError((cause as Error).message);
      setBusy(false);
    }
  }

  return (
    <div data-testid="register-form" className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500">
        {draft.proposal
          ? "Prefilled from the agent's proposal — edit anything"
          : "Prefilled from the source and the compiled roles — edit anything"}
      </p>
      {draft.state === "changed" ? (
        <p data-testid="register-changed" className="text-xs text-amber-700 dark:text-amber-300">
          Registers the last compile — the source changed since.
        </p>
      ) : null}
      {resolved.mismatch ? (
        <p
          data-testid="register-mismatch"
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {resolved.mismatch.extra.length > 0
            ? `The proposal names ${resolved.mismatch.extra.join(", ")}, which the compiled entry lacks. `
            : ""}
          {resolved.mismatch.missing.length > 0
            ? `It gives no player for ${resolved.mismatch.missing.join(", ")}. `
            : ""}
          The compiled roles stand: {resolved.roles.join(", ")}.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-2 @md:grid-cols-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Playbook id</span>
          <input
            data-testid="register-id"
            value={draft.id}
            readOnly
            className={`${INPUT_CLASS} font-mono text-neutral-500`}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Slash command</span>
          <input
            data-testid="register-command"
            value={resolved.command}
            onChange={(event) => onForm({ ...current, command: event.target.value })}
            className={`${INPUT_CLASS} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-0.5 @md:col-span-2">
          <span className="text-xs text-neutral-500">
            Intent (one line; the Captain routes free text with it)
          </span>
          <input
            data-testid="register-intent"
            value={resolved.intent}
            onChange={(event) => onForm({ ...current, intent: event.target.value })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        {resolved.roles.map((role) => {
          const choice = resolved.choices[role];
          const newId = choice.startsWith(NEW_PREFIX)
            ? choice.slice(NEW_PREFIX.length)
            : resolved.newIds[role];
          const chosenPlayer = players.find((player) => player.id === choice);
          const block = chosenPlayer ? chosenPlayer.agent : blockFor(newId);
          // A roster lane bound elsewhere is a shared conversation, and
          // the row says so (DR-032).
          const sharedWith = chosenPlayer?.boundBy ?? [];
          return (
            <div
              key={role}
              data-testid={`register-role-${role}`}
              className="relative flex flex-wrap items-center gap-2 text-sm"
            >
              <span className="w-24 shrink-0 truncate font-mono" title={role}>
                {role}
              </span>
              <select
                data-testid={`register-player-${role}`}
                aria-label={`Player for ${role}`}
                value={choice}
                onChange={(event) =>
                  onForm({
                    ...current,
                    players: { ...current.players, [role]: event.target.value },
                  })
                }
                className="min-w-0 max-w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              >
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.id} — {player.display}
                  </option>
                ))}
                <option value={`${NEW_PREFIX}${newId}`}>New player {newId}</option>
              </select>
              <AgentChip
                agent={block}
                readiness={readinessByAdapter.get(block.adapter)}
                label={role}
              />
              {sharedWith.length > 0 ? (
                <span
                  data-testid={`register-shared-${role}`}
                  title={`This lane also answers ${sharedWith.join(", ")} — one conversation across them`}
                  className="rounded-full bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                >
                  also {sharedWith[0]}
                  {sharedWith.length > 1 ? ` +${sharedWith.length - 1}` : ""}
                </span>
              ) : null}
              {!chosenPlayer ? (
                <>
                  <button
                    type="button"
                    ref={openRole === role ? gearRef : undefined}
                    data-testid={`register-configure-${role}`}
                    title={`Tweak the ${newId} agent in place`}
                    aria-label={`Configure ${newId}`}
                    onClick={() =>
                      setOpenRole((open) => (open === role ? undefined : role))
                    }
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  >
                    <Icon name="edit" />
                  </button>
                  {openRole === role ? (
                    <AgentEditorPopover
                      title={`${newId} agent`}
                      direction="down"
                      initial={blockFor(newId)}
                      readiness={readiness}
                      captain={captain}
                      anchorRef={gearRef}
                      onSave={(patch) => {
                        onForm({
                          ...current,
                          newPlayers: {
                            ...current.newPlayers,
                            [newId]: applyLocalPatch(blockFor(newId), patch),
                          },
                        });
                        setOpenRole(undefined);
                      }}
                      onClose={() => setOpenRole(undefined)}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? (
        <div
          role="alert"
          data-testid="register-error"
          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">
          {waiting ??
            (complete
              ? "Writes the playbook and any new player to the shared config"
              : "Every role needs a player, and the command and intent their words")}
        </span>
        <button
          type="button"
          data-testid="register-submit"
          disabled={disabled}
          title={waiting}
          onClick={() => void register()}
          className="ml-auto rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
        >
          {busy ? "Registering…" : "Register"}
        </button>
      </div>
    </div>
  );
}

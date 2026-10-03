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
  derivedIntent,
  existingRolePlayerId,
  newPlayerId,
} from "../lib/drafts.js";
import { i18n } from "../i18n.js";
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
  // The compiled entry keys roles as it derived them; the agent's
  // proposal may spell a role in another case (playbook-library-32
  // re-keys bindings case-insensitively), so a proposal is read by
  // the role's lower-cased name.
  const proposedFor = (role: string): string | undefined => {
    if (!proposal) return undefined;
    const key = Object.keys(proposal.players).find(
      (name) => name.toLowerCase() === role.toLowerCase(),
    );
    return key === undefined ? undefined : proposal.players[key];
  };
  const proposedRoles = new Set(
    Object.keys(proposal?.players ?? {}).map((name) => name.toLowerCase()),
  );
  const choices: Record<string, string> = {};
  const newIds: Record<string, string> = {};
  // An explicit id is a sharing decision, even when several roles
  // name it. Reserve later roles' choices before automatic allocation
  // so no derived default silently joins their provider conversation.
  const occupied = new Set(roster);
  const reservedRoster = new Set<string>();
  for (const role of roles) {
    const proposed = proposedFor(role);
    if (proposed && !roster.has(proposed)) occupied.add(proposed);
    const edited = form?.players[role];
    if (edited?.startsWith(NEW_PREFIX)) occupied.add(edited.slice(NEW_PREFIX.length));
    const explicit = edited ?? proposed;
    if (explicit) {
      const id = explicit.startsWith(NEW_PREFIX) ? explicit.slice(NEW_PREFIX.length) : explicit;
      if (roster.has(id)) reservedRoster.add(id);
    }
  }
  for (const role of roles) {
    const proposed = proposedFor(role);
    const edited = form?.players[role];
    const editedNew = edited?.startsWith(NEW_PREFIX)
      ? edited.slice(NEW_PREFIX.length)
      : undefined;
    const explicitNew = editedNew && !roster.has(editedNew)
      ? editedNew
      : proposed && !roster.has(proposed)
        ? proposed
        : undefined;
    const minted = newPlayerId(role);
    const newId = explicitNew ?? (occupied.has(minted) ? freeId(minted, occupied) : minted);
    occupied.add(newId);
    newIds[role] = newId;
    const fromProposal = proposed
      ? roster.has(proposed)
        ? proposed
        : `${NEW_PREFIX}${proposed}`
      : undefined;
    const existingOwnId = existingRolePlayerId(role);
    const byDefault = existingOwnId && roster.has(existingOwnId) && !reservedRoster.has(existingOwnId)
      ? existingOwnId
      : `${NEW_PREFIX}${newId}`;
    // Reserve the named default independently of the Boss's current
    // choice; choosing this row's New option must not move another
    // role onto its previously contested roster conversation.
    if (existingOwnId && roster.has(existingOwnId)) reservedRoster.add(existingOwnId);
    choices[role] = form?.players[role] ?? fromProposal ?? byDefault;
  }
  const extra = proposal
    ? Object.keys(proposal.players).filter(
        (name) => !roles.some((role) => role.toLowerCase() === name.toLowerCase()),
      )
    : [];
  const missing = proposal ? roles.filter((role) => !proposedRoles.has(role.toLowerCase())) : [];
  return {
    roles,
    command: form?.command ?? proposal?.command ?? draft.id,
    intent:
      form?.intent ?? proposal?.intent ?? derivedIntent(source?.markdown ?? ""),
    choices,
    newIds,
    ...(extra.length > 0 || missing.length > 0 ? { mismatch: { extra, missing } } : {}),
  };
}

/** The first `<id>-2`, `<id>-3`, … no reserved lane holds. */
function freeId(id: string, occupied: Set<string>): string {
  for (let n = 2; ; n += 1) {
    const candidate = `${id}-${n}`;
    if (!occupied.has(candidate)) return candidate;
  }
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
          ? i18n._("Prefilled from the agent's proposal — edit anything")
          : i18n._("Prefilled from the source and the compiled roles — edit anything")}
      </p>
      {draft.state === "changed" ? (
        <p data-testid="register-changed" className="text-xs text-amber-700 dark:text-amber-300">
          {i18n._("Registers the last compile — the source changed since.")}
        </p>
      ) : null}
      {resolved.mismatch ? (
        <p
          data-testid="register-mismatch"
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          {/* Whole sentences, each standing or not on its own. */}
          {resolved.mismatch.extra.length > 0
            ? `${i18n._("The proposal names {roles}, which the compiled entry lacks.", { roles: resolved.mismatch.extra.join(", ") })} `
            : ""}
          {resolved.mismatch.missing.length > 0
            ? `${i18n._("It gives no player for {roles}.", { roles: resolved.mismatch.missing.join(", ") })} `
            : ""}
          {i18n._("The compiled roles stand: {roles}.", { roles: resolved.roles.join(", ") })}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-2 @md:grid-cols-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">{i18n._("Playbook id")}</span>
          <input
            data-testid="register-id"
            value={draft.id}
            readOnly
            className={`${INPUT_CLASS} font-mono text-neutral-500`}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">{i18n._("Slash command")}</span>
          <input
            data-testid="register-command"
            value={resolved.command}
            onChange={(event) => onForm({ ...current, command: event.target.value })}
            className={`${INPUT_CLASS} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-0.5 @md:col-span-2">
          <span className="text-xs text-neutral-500">
            {i18n._("Intent (one line; the Captain routes free text with it)")}
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
                aria-label={i18n._("Player for {role}", { role })}
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
                <option value={`${NEW_PREFIX}${newId}`}>{i18n._("New player {id}", { id: newId })}</option>
              </select>
              <AgentChip
                agent={block}
                readiness={readinessByAdapter.get(block.adapter)}
                label={role}
              />
              {sharedWith.length > 0 ? (
                <span
                  data-testid={`register-shared-${role}`}
                  title={i18n._("This lane also answers {positions} — one conversation across them", { positions: sharedWith.join(", ") })}
                  className="rounded-full bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                >
                  {i18n._("also {position}", { position: sharedWith[0] })}
                  {sharedWith.length > 1 ? ` +${sharedWith.length - 1}` : ""}
                </span>
              ) : null}
              {!chosenPlayer ? (
                <>
                  <button
                    type="button"
                    ref={openRole === role ? gearRef : undefined}
                    data-testid={`register-configure-${role}`}
                    title={i18n._("Tweak the {name} agent in place", { name: newId })}
                    aria-label={i18n._("Configure {name}", { name: newId })}
                    onClick={() =>
                      setOpenRole((open) => (open === role ? undefined : role))
                    }
                    className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  >
                    <Icon name="edit" />
                  </button>
                  {openRole === role ? (
                    <AgentEditorPopover
                      title={i18n._("{name} agent", { name: newId })}
                      direction="down"
                      initial={blockFor(newId)}
                      context={{ kind: "draft", id: draft.id }}
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
              ? i18n._("Writes the playbook and any new player to the shared config")
              : i18n._("Every role needs a player, and the command and intent their words"))}
        </span>
        <button
          type="button"
          data-testid="register-submit"
          disabled={disabled}
          title={waiting}
          onClick={() => void register()}
          className="ml-auto rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
        >
          {busy ? i18n._({ id: "Registering…", comment: "the registration is in flight" }) : i18n._({ id: "Register", comment: "write the compiled playbook into the config" })}
        </button>
      </div>
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Settings surface (SET-1..10): a validated editor over the shared
// playbook config. Every save round-trips through the core, which
// refuses launcher-invalid states and preserves file comments.
// DR-019: agents are inline blocks. DR-032 forks the editors: the
// Captain and the session-player roster are identities and live here,
// while which player answers a role is a binding and lives with its
// playbook in the Library. The Agents panel shows per-adapter
// readiness.

import { useEffect, useState } from "react";
import {
  PROTOCOL_VERSION,
  type AgentBlockInput,
  type ConfigEditOpInput,
  type ReadinessEntry,
  type SessionPlayerSummary,
} from "@sublang/spex-core/protocol";

import { getClient, useAppStore } from "../state/store.js";
import { patchPlayer, setCaptain } from "../lib/config-ops.js";
import { NOTIFICATION_LABELS } from "../lib/labels.js";
import { AgentChip } from "./AgentChip.js";
import { AgentEditor } from "./AgentEditor.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";

const NOTIFICATION_EVENTS = [
  "player_finished",
  "turn_finished",
  "turn_aborted",
] as const;
const SINKS = ["off", "bell", "desktop"] as const;

function ReadinessBadge({ entry }: { entry?: ReadinessEntry }) {
  if (!entry) return null;
  if (entry.ready === true) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        ready
      </span>
    );
  }
  if (entry.ready === false) {
    return (
      <span
        className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700 dark:bg-red-950 dark:text-red-300"
        title={entry.requirement}
      >
        not ready
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800"
      title={
        entry.requirement ??
        "no automatic check for this adapter — verify sign-in yourself"
      }
    >
      unverified
    </span>
  );
}

/** "captain", or a player id trailing the roles it answers, as
 * `dev.coder (code.coder, fix.coder)` → chip copy (DR-010 §2). The
 * chip shows the lane; the whole string stays in its title. */
function positionLabel(position: string): string {
  if (position === "captain") return "Captain";
  const paren = position.indexOf(" (");
  return paren === -1 ? position : position.slice(0, paren);
}

function ThemeInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <input
      value={draft}
      placeholder="auto"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
      className="w-48 rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
    />
  );
}


/** The starting block for a lane the user is adding: a deliberate,
 * visible choice rather than a blank the launcher would refuse. */
const NEW_PLAYER_BLOCK: AgentBlockInput = {
  adapter: "claude",
  model: "claude-opus-5",
  effort: "high",
  permissions: { mode: "auto" },
};

/** The session-player roster (DR-032): each lane is one identity and
 * one provider conversation, edited here whole. Removal is refused by
 * the core while a binding still names the lane, and that refusal is
 * what the user reads. */
function PlayerRoster({
  players,
  readiness,
  captain,
}: {
  players: SessionPlayerSummary[];
  readiness: ReadinessEntry[];
  captain: AgentBlockInput;
}) {
  const [editing, setEditing] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [error, setError] = useState<{ playerId: string; message: string }>();
  const readinessByAdapter = new Map(
    readiness.map((entry) => [entry.adapter, entry]),
  );

  function remove(playerId: string): void {
    setError(undefined);
    void getClient()
      .command("config.edit", { op: { kind: "player.delete", playerId } })
      .then(() => setConfirmDelete(undefined))
      .catch((cause: Error) =>
        setError({ playerId, message: cause.message }),
      );
  }

  return (
    <section data-testid="players-section" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Session players
        </h2>
        <span className="text-xs text-neutral-500">
          Each player is one conversation for the whole session; roles bind
          to them in the Library.
        </span>
      </div>
      {players.map((player) => (
        <div
          key={player.id}
          data-testid={`player-row-${player.id}`}
          className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-medium">{player.id}</span>
            <AgentChip
              agent={player.agent}
              readiness={readinessByAdapter.get(player.agent.adapter)}
              label={player.id}
            />
            {player.boundBy.length > 0 ? (
              <span
                data-testid={`player-bound-${player.id}`}
                title={`Answers ${player.boundBy.join(", ")}`}
                className="flex flex-wrap gap-1"
              >
                {player.boundBy.map((position) => (
                  <span
                    key={position}
                    className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  >
                    {position}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-[11px] text-neutral-500">
                bound to no role yet
              </span>
            )}
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                data-testid={`player-edit-${player.id}`}
                aria-label={`Edit ${player.id}`}
                title="Edit this player's agent"
                onClick={() =>
                  setEditing((current) =>
                    current === player.id ? undefined : player.id,
                  )
                }
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <Icon name="edit" />
              </button>
              {confirmDelete === player.id ? (
                <InlineConfirm
                  question={`Remove ${player.id}?`}
                  confirmLabel="remove"
                  onConfirm={() => remove(player.id)}
                  onCancel={() => setConfirmDelete(undefined)}
                />
              ) : (
                <button
                  type="button"
                  data-testid={`player-delete-${player.id}`}
                  aria-label={`Remove ${player.id}`}
                  title="Remove this player from the roster"
                  onClick={() => setConfirmDelete(player.id)}
                  className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-red-500 dark:hover:bg-neutral-800"
                >
                  <Icon name="close" />
                </button>
              )}
            </span>
          </div>
          {error?.playerId === player.id ? (
            <p
              data-testid={`player-error-${player.id}`}
              className="text-xs text-red-600 dark:text-red-400"
            >
              {error.message}
            </p>
          ) : null}
          {editing === player.id ? (
            <AgentEditor
              key={JSON.stringify(player.agent)}
              initial={player.agent}
              readiness={readiness}
              captain={captain}
              onSave={(patch) =>
                patchPlayer(player.id, patch).then((result) => {
                  setEditing(undefined);
                  return result;
                })
              }
              onCancel={() => setEditing(undefined)}
            />
          ) : null}
        </div>
      ))}
      {players.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-700">
          No players yet — enabling a playbook in the Library adds the ones
          its roles need.
        </p>
      ) : null}
      {adding ? (
        <div
          data-testid="player-add-form"
          className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-neutral-500 dark:text-neutral-400">
              Player id — lowercase, dots to group (e.g. dev.coder)
            </span>
            <input
              data-testid="player-add-id"
              value={newId}
              onChange={(event) => setNewId(event.target.value)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          {error?.playerId === "" ? (
            <p
              data-testid="player-add-error"
              className="text-xs text-red-600 dark:text-red-400"
            >
              {error.message}
            </p>
          ) : null}
          <AgentEditor
            initial={NEW_PLAYER_BLOCK}
            readiness={readiness}
            captain={captain}
            saveLabel="Add player"
            allowUnchanged
            onSave={(patch) => {
              // Adding never overwrites: an id already in the roster
              // is turned back to its own editor (settings-27).
              const id = newId.trim();
              if (!id) {
                setError({ playerId: "", message: "Give the player an id first." });
                return Promise.reject(new Error("no id"));
              }
              if (players.some((player) => player.id === id)) {
                setError({
                  playerId: "",
                  message: `A player named ${id} already exists — edit it above instead.`,
                });
                return Promise.reject(new Error("duplicate id"));
              }
              return patchPlayer(id, patch).then(
                (result) => {
                  setAdding(false);
                  setNewId("");
                  setError(undefined);
                  return result;
                },
                (cause: Error) => {
                  setError({ playerId: "", message: cause.message });
                  throw cause;
                },
              );
            }}
            onCancel={() => {
              setAdding(false);
              setError(undefined);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          data-testid="player-add"
          onClick={() => setAdding(true)}
          className="self-start rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Add a player
        </button>
      )}
    </section>
  );
}

export function SettingsSurface() {
  const configState = useAppStore((state) => state.configState);
  const readiness = useAppStore((state) => state.readiness);
  const refreshReadiness = useAppStore((state) => state.refreshReadiness);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  if (!configState) {
    return (
      <div className="m-auto text-sm text-neutral-500">loading config…</div>
    );
  }
  if (configState.status !== "valid") {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <div className="font-semibold">
            {configState.status === "missing"
              ? "Config file missing"
              : "Config file invalid"}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-xs">{configState.path}</span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(configState.path);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded border border-red-300 px-1.5 py-0.5 text-[11px] hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
            >
              {copied ? "Copied" : "Copy path"}
            </button>
          </div>
          {configState.status === "invalid" ? (
            <ul className="mt-2 list-disc pl-5">
              {configState.errors.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 text-xs">
            Fix the file in your editor; Spex reloads it live.
          </div>
        </div>
      </div>
    );
  }

  const summary = configState.summary;
  const readinessByAdapter = new Map(
    readiness.map((entry) => [entry.adapter, entry]),
  );

  function edit(op: ConfigEditOpInput) {
    setError(undefined);
    getClient()
      .command("config.edit", { op })
      .catch((cause: Error) => setError(cause.message));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 overflow-y-auto p-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-0.5 text-xs text-neutral-500">
          Shared with the playbook CLI:{" "}
          <span className="font-mono">{summary.path}</span> — external edits
          appear here live.
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-500">
          Spex {new URLSearchParams(window.location.search).get("version") ?? "dev"}
          {" · protocol "}
          {PROTOCOL_VERSION}
        </p>
      </div>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section data-testid="captain-section" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">Captain</h2>
        <div className="flex items-center gap-2 text-sm">
          <AgentChip
            agent={summary.captain}
            readiness={readinessByAdapter.get(summary.captain.adapter)}
            label="Captain"
          />
          <span className="text-xs text-neutral-500">
            The agent that reads your messages and picks the playbook to run.
          </span>
        </div>
        <AgentEditor
          key={JSON.stringify(summary.captain)}
          initial={summary.captain}
          readiness={readiness}
          onSave={(patch) => setCaptain(patch)}
        />
      </section>

      <PlayerRoster
        players={summary.players}
        readiness={readiness}
        captain={summary.captain}
      />

      <section data-testid="agents-section" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">Agents</h2>
          <button
            type="button"
            title="Re-run adapter readiness checks (e.g. after signing in)"
            onClick={() => void refreshReadiness()}
            className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Re-check readiness
          </button>
        </div>
        {readiness.map((entry) => (
          <div
            key={entry.adapter}
            data-testid={`agent-row-${entry.adapter}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <span className="font-mono font-medium">{entry.adapter}</span>
            <ReadinessBadge entry={entry} />
            {entry.ready === false && entry.requirement ? (
              <span className="min-w-0 flex-1 text-[11px] text-neutral-500">
                {entry.requirement}
              </span>
            ) : null}
            <span className="ml-auto flex flex-wrap gap-1">
              {entry.usedBy.map((position) => (
                <span
                  key={position}
                  title={position}
                  className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                >
                  {positionLabel(position)}
                </span>
              ))}
            </span>
          </div>
        ))}
        {readiness.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-700">
            No adapters in use yet — assign agents to the Captain or a
            playbook role and their readiness shows here.
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Notifications
        </h2>
        <div className="flex flex-col gap-1.5">
          {NOTIFICATION_EVENTS.map((event) => (
            <div key={event} className="flex items-center gap-3 text-sm">
              <span className="w-56 text-xs" title={event}>
                {NOTIFICATION_LABELS[event] ?? event}
              </span>
              <select
                aria-label={`${NOTIFICATION_LABELS[event] ?? event} — where to notify`}
                value={summary.notifications?.[event] ?? "off"}
                onChange={(changeEvent) =>
                  edit({
                    kind: "notifications.set",
                    prefs: {
                      ...(summary.notifications ?? {}),
                      [event]: changeEvent.target.value,
                    },
                  })
                }
                className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
              >
                {SINKS.map((sink) => (
                  <option key={sink}>{sink}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">Theme</h2>
        <div className="flex items-center gap-2 text-sm">
          <ThemeInput
            value={summary.theme ?? ""}
            onCommit={(value) =>
              edit({ kind: "theme.set", theme: value || null })
            }
          />
          <span className="text-xs text-neutral-500">
            Pane theme carried to tmux-play (e.g. a catppuccin flavor or
            auto); Spex itself follows your OS theme.
          </span>
        </div>
      </section>
    </div>
  );
}

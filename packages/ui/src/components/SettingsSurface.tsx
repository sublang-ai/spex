// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Settings surface (SET-1..10): a validated editor over the shared
// playbook config. Every save round-trips through the core, which
// refuses launcher-invalid states and preserves file comments.

import { useEffect, useState } from "react";
import {
  PROTOCOL_VERSION,
  type ConfigEditOpInput,
  type ProfileSummary,
  type ReadinessEntry,
} from "@sublang/spex-core/protocol";

import { getClient, useAppStore } from "../state/store.js";
import { NOTIFICATION_LABELS } from "../lib/labels.js";

const ADAPTERS = ["claude", "codex", "gemini", "opencode"] as const;
const EFFORTS = ["", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
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
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800">
      unverified
    </span>
  );
}

function ProfileEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: ProfileSummary;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [id, setId] = useState(initial?.id ?? "");
  const [adapter, setAdapter] = useState(initial?.adapter ?? "claude");
  const [model, setModel] = useState(initial?.model ?? "");
  const [effort, setEffort] = useState(initial?.reasoningEffort ?? "");
  const [mode, setMode] = useState(initial?.permissions?.mode ?? "auto");
  const [writablePaths, setWritablePaths] = useState(
    (initial?.permissions?.writablePaths ?? []).join(", "),
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function save() {
    setBusy(true);
    setError(undefined);
    const paths = writablePaths
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const op: ConfigEditOpInput = {
      kind: "profile.save",
      id: id.trim(),
      profile: {
        adapter,
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(effort ? { reasoningEffort: effort } : {}),
        permissions: {
          mode,
          ...(paths.length > 0 ? { writablePaths: paths } : {}),
        },
      },
    };
    getClient()
      .command("config.edit", { op })
      .then(() => onSaved())
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setBusy(false));
  }

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel?.();
      }}
      className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-900 dark:bg-brand-950/30"
    >
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Profile id</span>
          <input
            value={id}
            disabled={initial !== undefined}
            onChange={(event) => setId(event.target.value)}
            placeholder="e.g. claude-opus"
            className="rounded border border-neutral-300 bg-white px-2 py-1 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Adapter</span>
          <select
            value={adapter}
            onChange={(event) =>
              setAdapter(event.target.value as (typeof ADAPTERS)[number])
            }
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {ADAPTERS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Model (optional)</span>
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="e.g. claude-opus-4-8[1m]"
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Reasoning effort</span>
          <select
            value={effort}
            onChange={(event) => setEffort(event.target.value)}
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {EFFORTS.map((name) => (
              <option key={name} value={name}>
                {name || "(default)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">Permission mode</span>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="auto">auto (protected)</option>
            <option value="bypass">bypass</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-xs text-neutral-500">
            Writable paths (comma-separated)
          </span>
          <input
            value={writablePaths}
            onChange={(event) => setWritablePaths(event.target.value)}
            placeholder="e.g. .git"
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      </div>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !id.trim()}
          onClick={save}
          className="rounded-md bg-brand-600 px-3 py-1 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-40"
        >
          Save
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
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

export function SettingsSurface() {
  const configState = useAppStore((state) => state.configState);
  const readiness = useAppStore((state) => state.readiness);
  const refreshReadiness = useAppStore((state) => state.refreshReadiness);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
  const readinessById = new Map(readiness.map((entry) => [entry.profileId, entry]));

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
        <p className="mt-0.5 text-[11px] text-neutral-400">
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

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">Profiles</h2>
          <button
            type="button"
            title="Re-run adapter readiness checks (e.g. after signing in)"
            onClick={() => void refreshReadiness()}
            className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Re-check readiness
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto rounded-md border border-brand-300 px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950"
          >
            Add profile
          </button>
        </div>
        {adding ? (
          <ProfileEditor
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        ) : null}
        {summary.profiles.map((profile) =>
          editing === profile.id ? (
            <ProfileEditor
              key={profile.id}
              initial={profile}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div
              key={profile.id}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span className="font-mono font-medium">{profile.id}</span>
              <span className="text-xs text-neutral-500">
                {profile.model ?? profile.adapter}
                {profile.reasoningEffort ? ` · ${profile.reasoningEffort}` : ""}
              </span>
              <ReadinessBadge entry={readinessById.get(profile.id)} />
              {readinessById.get(profile.id)?.requirement ? (
                <span className="min-w-0 flex-1 text-[11px] text-neutral-400">
                  {readinessById.get(profile.id)?.requirement}
                </span>
              ) : null}
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(profile.id)}
                  className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                >
                  Edit
                </button>
                {confirmDelete === profile.id ? (
                  <span className="flex items-center gap-1 text-xs">
                    delete?
                    <button
                      type="button"
                      className="text-red-600 hover:underline dark:text-red-400"
                      onClick={() => {
                        setConfirmDelete(null);
                        edit({ kind: "profile.delete", id: profile.id });
                      }}
                    >
                      yes
                    </button>
                    <button
                      type="button"
                      className="text-neutral-500 hover:underline"
                      onClick={() => setConfirmDelete(null)}
                    >
                      no
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(profile.id)}
                    className="text-xs text-neutral-400 hover:text-red-500"
                  >
                    Delete
                  </button>
                )}
              </span>
            </div>
          ),
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">Captain</h2>
        <div className="flex items-center gap-2 text-sm">
          <select
            value={summary.captain}
            onChange={(event) =>
              edit({ kind: "captain.set", ref: event.target.value })
            }
            className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
          >
            {summary.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.id}
              </option>
            ))}
            <option value="claude">claude (shorthand)</option>
            <option value="codex">codex (shorthand)</option>
          </select>
          <span className="text-xs text-neutral-500">
            The agent that reads your messages and picks the playbook to run.
          </span>
        </div>
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

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Settings surface (SET-1..10): a validated editor over the shared
// playbook config. Every save round-trips through the core, which
// refuses launcher-invalid states and preserves file comments.
// DR-019: agents are inline blocks — the Captain edits here, players
// edit with their playbooks in the Library, and the Agents panel
// shows per-adapter readiness.

import { useEffect, useState } from "react";
import {
  PROTOCOL_VERSION,
  type ConfigEditOpInput,
  type ReadinessEntry,
} from "@sublang/spex-core/protocol";

import { getClient, useAppStore } from "../state/store.js";
import { setCaptain } from "../lib/config-ops.js";
import { NOTIFICATION_LABELS } from "../lib/labels.js";
import { AgentChip } from "./AgentChip.js";
import { AgentEditor } from "./AgentEditor.js";

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

/** "captain" or "<playbook>.<role>" → human chip copy (DR-010 §2). */
function positionLabel(position: string): string {
  if (position === "captain") return "Captain";
  const dot = position.indexOf(".");
  return dot === -1
    ? position
    : `${position.slice(0, dot)} · ${position.slice(dot + 1)}`;
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
              <span className="min-w-0 flex-1 text-[11px] text-neutral-400">
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

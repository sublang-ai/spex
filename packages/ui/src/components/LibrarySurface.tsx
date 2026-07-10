// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Library surface (PBLIB-1..10): configured playbooks with role→
// profile mapping, and the compile flow driving slc through the core
// with streamed progress.

import { useEffect, useState } from "react";
import type {
  CommandResults,
  ConfigEditOpInput,
} from "@sublang/spex-core/protocol";

import { getClient, useAppStore } from "../state/store.js";

type Toolchain = CommandResults["compile.check"];

function MappingSelect({
  value,
  profiles,
  onChange,
}: {
  value: string;
  profiles: string[];
  onChange: (ref: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
    >
      {profiles.map((profile) => (
        <option key={profile} value={profile}>
          {profile}
        </option>
      ))}
      {!profiles.includes(value) ? <option value={value}>{value}</option> : null}
      <option value="claude">claude (shorthand)</option>
      <option value="codex">codex (shorthand)</option>
    </select>
  );
}

export function LibrarySurface() {
  const configState = useAppStore((state) => state.configState);
  const compileProgress = useAppStore((state) => state.compileProgress);
  const [toolchain, setToolchain] = useState<Toolchain>();
  const [error, setError] = useState<string>();

  // Compile form state.
  const [playbookId, setPlaybookId] = useState("");
  const [command, setCommand] = useState("");
  const [intent, setIntent] = useState("");
  const [rolesText, setRolesText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [playerRefs, setPlayerRefs] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);

  const connection = useAppStore((state) => state.connection);
  useEffect(() => {
    if (connection === "open") {
      getClient().command("compile.check", {}).then(setToolchain).catch(() => {});
    }
  }, [connection]);

  if (!configState || configState.status !== "valid") {
    return (
      <div className="m-auto max-w-md p-6 text-center text-sm text-neutral-500">
        The Library needs a valid config — check{" "}
        <span className="font-medium">Settings</span>.
      </div>
    );
  }
  const summary = configState.summary;
  const profileIds = summary.profiles.map((profile) => profile.id);
  const roles = rolesText
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);

  function edit(op: ConfigEditOpInput) {
    setError(undefined);
    getClient()
      .command("config.edit", { op })
      .catch((cause: Error) => setError(cause.message));
  }

  function runCompile() {
    setError(undefined);
    setRunning(true);
    getClient()
      .command("compile.run", {
        playbookId: playbookId.trim(),
        ...(sourcePath.trim()
          ? { sourcePath: sourcePath.trim() }
          : { sourceText }),
        roles,
        command: command.trim() || playbookId.trim(),
        intent: intent.trim(),
        players: Object.fromEntries(
          roles.map((role) => [role, playerRefs[role] ?? profileIds[0] ?? "claude"]),
        ),
      })
      .then(() => {
        setPlaybookId("");
        setSourceText("");
        setSourcePath("");
        setRolesText("");
        setIntent("");
        setCommand("");
      })
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setRunning(false));
  }

  const progressLines = playbookId.trim()
    ? (compileProgress[playbookId.trim()] ?? [])
    : [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Library</h1>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Configured playbooks
        </h2>
        {summary.playbooks.map((playbook) => (
          <div
            key={playbook.id}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">
                /{playbook.command}
              </span>
              <span className="text-xs text-neutral-500">{playbook.id}</span>
              <span className="ml-auto truncate font-mono text-[11px] text-neutral-400">
                {playbook.from}
              </span>
              <button
                type="button"
                title="Remove from the config (compiled artifacts stay in the library)"
                onClick={() =>
                  edit({ kind: "playbook.delete", playbookId: playbook.id })
                }
                className="text-neutral-400 hover:text-red-500"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
              {Object.entries(playbook.players).map(([role, ref]) => (
                <label key={role} className="flex items-center gap-1">
                  <span className="font-mono">{role}:</span>
                  <MappingSelect
                    value={ref}
                    profiles={profileIds}
                    onChange={(next) =>
                      edit({
                        kind: "playbook.player.set",
                        playbookId: playbook.id,
                        role,
                        ref: next,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        {summary.playbooks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No playbooks enabled.
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-neutral-500">
          Compile a new playbook
        </h2>
        {toolchain && (!toolchain.node.ok || toolchain.slc.guidance) ? (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              toolchain.node.ok
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                : "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {toolchain.node.guidance ?? toolchain.slc.guidance}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">Playbook id</span>
            <input
              value={playbookId}
              onChange={(event) => setPlaybookId(event.target.value)}
              placeholder="e.g. triage"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Slash command (default: id)
            </span>
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="e.g. triage"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Intent (one line; the Captain routes free text with it)
            </span>
            <input
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="e.g. triage new bug reports into labeled issues"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Player roles (comma-separated local role ids)
            </span>
            <input
              value={rolesText}
              onChange={(event) => setRolesText(event.target.value)}
              placeholder="e.g. triager, verifier"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          {roles.length > 0 ? (
            <div className="col-span-2 flex flex-wrap gap-3 text-xs">
              {roles.map((role) => (
                <label key={role} className="flex items-center gap-1">
                  <span className="font-mono">{role}:</span>
                  <MappingSelect
                    value={playerRefs[role] ?? profileIds[0] ?? "claude"}
                    profiles={profileIds}
                    onChange={(ref) =>
                      setPlayerRefs((current) => ({ ...current, [role]: ref }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Workflow prose (or give a source file path below)
            </span>
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              rows={6}
              placeholder="Describe the workflow as prose or paste a skill…"
              className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Source file path (optional, overrides prose)
            </span>
            <input
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder="/path/to/workflow.md"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <div className="col-span-2">
            <button
              type="button"
              disabled={
                running ||
                !playbookId.trim() ||
                !intent.trim() ||
                roles.length === 0 ||
                (!sourceText.trim() && !sourcePath.trim()) ||
                (toolchain !== undefined && !toolchain.node.ok)
              }
              onClick={runCompile}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {running ? "Compiling… (agent-driven, this takes a while)" : "Compile & register"}
            </button>
            <span className="ml-2 text-xs text-neutral-400">
              Runs slc with your configured coding agent; progress streams
              below.
            </span>
          </div>
          {progressLines.length > 0 ? (
            <pre className="col-span-2 max-h-48 overflow-y-auto rounded bg-neutral-100 p-2 font-mono text-[11px] text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400">
              {progressLines.join("\n")}
            </pre>
          ) : null}
        </div>
      </section>
    </div>
  );
}

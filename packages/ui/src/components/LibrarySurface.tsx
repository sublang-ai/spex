// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Library surface (PBLIB): configured playbooks with role→profile
// mapping and the pipeline view (Source → Gears → State machine),
// plus the compile flow driving slc through the core with streamed,
// persistent progress.

import { useEffect, useState } from "react";
import type {
  CommandResults,
  ConfigEditOpInput,
  PlaybookArtifacts,
} from "@sublang/spex-core/protocol";

import { getClient, useAppStore } from "../state/store.js";
import { saveProfileEssentials, setPlaybookPlayer } from "../lib/config-ops.js";
import { Markdown } from "./Markdown.js";
import { ProfilePopover } from "./ProfilePopover.js";

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

const STAGES = [
  { key: "source", label: "Source", hint: "The workflow markdown the playbook was compiled from" },
  { key: "gears", label: "Gears", hint: "One normative spec item per state behavior — the compiler's middle stage" },
  { key: "fsm", label: "State machine", hint: "The compiled XState machine that drives the players" },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

/** Pipeline view (PBLIB-22/23): Source → Gears → State machine. */
function PipelinePanel({ playbookId }: { playbookId: string }) {
  const [artifacts, setArtifacts] = useState<PlaybookArtifacts>();
  const [error, setError] = useState<string>();
  const [stage, setStage] = useState<StageKey>("source");

  useEffect(() => {
    getClient()
      .command("playbook.artifacts", { playbookId })
      .then((loaded) => {
        setArtifacts(loaded);
        // Land on the first stage that actually exists.
        const first = STAGES.find((entry) => loaded[entry.key] !== null);
        if (first) setStage(first.key);
      })
      .catch((cause: Error) => setError(cause.message));
  }, [playbookId]);

  if (error) {
    return <div className="text-xs text-red-500">{error}</div>;
  }
  if (!artifacts) {
    return <div className="text-xs text-neutral-400">loading pipeline…</div>;
  }

  const content = artifacts[stage];

  return (
    <div className="flex flex-col gap-2" data-testid={`pipeline-${playbookId}`}>
      <div className="flex items-center gap-1">
        {STAGES.map((entry, index) => (
          <span key={entry.key} className="flex items-center gap-1">
            {index > 0 ? (
              <span className="text-neutral-300 dark:text-neutral-600">→</span>
            ) : null}
            <button
              type="button"
              disabled={artifacts[entry.key] === null}
              title={
                artifacts[entry.key] === null
                  ? `${entry.label} not found next to this playbook's registry`
                  : entry.hint
              }
              onClick={() => setStage(entry.key)}
              className={`rounded-md px-2 py-0.5 text-xs ${
                stage === entry.key
                  ? "bg-indigo-100 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : artifacts[entry.key] === null
                    ? "text-neutral-300 line-through dark:text-neutral-600"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {entry.label}
            </button>
          </span>
        ))}
      </div>
      {artifacts.stateIds ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
            states
          </span>
          {artifacts.stateIds.map((state) => (
            <span
              key={state}
              className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            >
              {state}
            </span>
          ))}
        </div>
      ) : null}
      {artifacts.missing.length > 0 ? (
        <div className="text-[11px] text-amber-600 dark:text-amber-400">
          missing stages: {artifacts.missing.join(", ")}
        </div>
      ) : null}
      <div className="max-h-96 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
        {content === null ? (
          <div className="text-xs text-neutral-400">
            this stage was not found for this playbook
          </div>
        ) : stage === "fsm" ? (
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
            {content}
          </pre>
        ) : (
          <Markdown text={content} />
        )}
      </div>
    </div>
  );
}

export function LibrarySurface() {
  const configState = useAppStore((state) => state.configState);
  const compileProgress = useAppStore((state) => state.compileProgress);
  const readiness = useAppStore((state) => state.readiness);
  const activeCompile = useAppStore((state) => state.activeCompile);
  const runCompile = useAppStore((state) => state.runCompile);
  const connection = useAppStore((state) => state.connection);

  const [toolchain, setToolchain] = useState<Toolchain>();
  const [error, setError] = useState<string>();
  const [openPipeline, setOpenPipeline] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [rolePopover, setRolePopover] = useState<{
    playbookId: string;
    role: string;
  }>();

  // Compile form state.
  const [playbookId, setPlaybookId] = useState("");
  const [command, setCommand] = useState("");
  const [intent, setIntent] = useState("");
  const [rolesText, setRolesText] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [playerRefs, setPlayerRefs] = useState<Record<string, string>>({});

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

  const compiling = activeCompile?.running === true;
  const missingRequirement = !playbookId.trim()
    ? "give the playbook an id"
    : !intent.trim()
      ? "describe the intent — the Captain routes free text with it"
      : roles.length === 0
        ? "declare at least one player role"
        : !sourceText.trim() && !sourcePath.trim()
          ? "provide the workflow source (text or file path)"
          : toolchain && !toolchain.node.ok
            ? "install Node >= 23.6 for the compile toolchain"
            : undefined;

  function startCompile() {
    setError(undefined);
    runCompile({
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
      .catch(() => {
        // The progress log carries the failure line.
      });
  }

  const progressId = activeCompile?.playbookId;
  const progressLines = progressId ? (compileProgress[progressId] ?? []) : [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Playbooks</h1>
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
              <span
                className="truncate text-xs text-neutral-500"
                title={playbook.intent}
              >
                {playbook.intent}
              </span>
              <span className="ml-auto" />
              <button
                type="button"
                onClick={() =>
                  setOpenPipeline((current) =>
                    current === playbook.id ? undefined : playbook.id,
                  )
                }
                className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {openPipeline === playbook.id ? "Hide pipeline" : "Pipeline"}
              </button>
              {confirmDelete === playbook.id ? (
                <span className="flex items-center gap-1 text-xs">
                  remove from config?
                  <button
                    type="button"
                    className="rounded border border-red-300 px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                    onClick={() => {
                      setConfirmDelete(undefined);
                      edit({ kind: "playbook.delete", playbookId: playbook.id });
                    }}
                  >
                    yes
                  </button>
                  <button
                    type="button"
                    className="text-neutral-500 hover:underline"
                    onClick={() => setConfirmDelete(undefined)}
                  >
                    no
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  title="Remove from the config (compiled artifacts stay in the library)"
                  onClick={() => setConfirmDelete(playbook.id)}
                  className="text-neutral-400 hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
              {Object.entries(playbook.players).map(([role, player]) => (
                <span key={role} className="relative flex items-center gap-1">
                  <span className="font-mono">{role}:</span>
                  <MappingSelect
                    value={player.ref}
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
                  <button
                    type="button"
                    title={`Switch or tweak the ${role} profile in place`}
                    onClick={() =>
                      setRolePopover((current) =>
                        current?.playbookId === playbook.id &&
                        current.role === role
                          ? undefined
                          : { playbookId: playbook.id, role },
                      )
                    }
                    className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  >
                    ⚙
                  </button>
                  {rolePopover?.playbookId === playbook.id &&
                  rolePopover.role === role ? (
                    <ProfilePopover
                      title={`${role} profile`}
                      direction="down"
                      profiles={summary.profiles}
                      readiness={readiness}
                      currentRef={player.ref}
                      onSelect={(next) =>
                        setPlaybookPlayer(playbook.id, role, next)
                      }
                      onSaveProfile={saveProfileEssentials}
                      onClose={() => setRolePopover(undefined)}
                    />
                  ) : null}
                </span>
              ))}
              <span
                className="ml-auto max-w-[16rem] truncate font-mono text-[10px] text-neutral-400"
                title={playbook.from}
              >
                {playbook.from}
              </span>
            </div>
            {openPipeline === playbook.id ? (
              <PipelinePanel playbookId={playbook.id} />
            ) : null}
          </div>
        ))}
        {summary.playbooks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700">
            No playbooks enabled — compile one below.
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
              Workflow source (or give a source file path below)
            </span>
            <textarea
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              rows={6}
              placeholder="Describe the workflow — prose or a pasted skill…"
              className="rounded border border-neutral-300 bg-white px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-0.5">
            <span className="text-xs text-neutral-500">
              Source file path (optional, overrides the text)
            </span>
            <input
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder="/path/to/workflow.md"
              className="rounded border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
            />
          </label>
          <div className="col-span-2 flex items-center gap-2">
            <button
              type="button"
              disabled={compiling || missingRequirement !== undefined}
              onClick={startCompile}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {compiling
                ? "Compiling… (agent-driven, this takes a while)"
                : "Compile & register"}
            </button>
            <span className="text-xs text-neutral-400">
              {compiling
                ? "progress streams below"
                : (missingRequirement ??
                  "runs slc with your configured coding agent")}
            </span>
          </div>
          {progressLines.length > 0 ? (
            <pre
              data-testid="compile-progress"
              className="col-span-2 max-h-48 overflow-y-auto rounded bg-neutral-100 p-2 font-mono text-[11px] text-neutral-600 dark:bg-neutral-950 dark:text-neutral-400"
            >
              {progressLines.join("\n")}
            </pre>
          ) : null}
        </div>
      </section>
    </div>
  );
}

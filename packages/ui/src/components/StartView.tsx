// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Captain-first start view (DR-007, RUN-25..27): one motion from
// a thought to a running session. Props-driven so RUN-29 can exercise
// it without a live core.

import { useMemo, useRef, useState } from "react";
import type {
  PlaybookSummary,
  ProfileSummary,
  ProjectInfo,
  ReadinessEntry,
} from "@sublang/spex-core/protocol";

export interface StartViewProps {
  projects: ProjectInfo[];
  playbooks: PlaybookSummary[];
  captainRef: string;
  profiles: ProfileSummary[];
  readiness: ReadinessEntry[];
  connected: boolean;
  /** Native picker when the shell bridge exists (DR-008). */
  onPickFolder?: () => Promise<string | null>;
  onRegisterPath: (path: string) => Promise<ProjectInfo>;
  onCreateProject: (path: string, scaffold: boolean) => Promise<ProjectInfo>;
  onCaptainChange: (ref: string) => void;
  onStart: (projectId: string, text: string) => Promise<void>;
}

export function StartView(props: StartViewProps) {
  const {
    projects,
    playbooks,
    captainRef,
    profiles,
    readiness,
    connected,
  } = props;

  const [projectId, setProjectId] = useState<string>();
  const [text, setText] = useState("");
  const [pathDraft, setPathDraft] = useState("");
  const [showPathInput, setShowPathInput] = useState(false);
  const [offerCreate, setOfferCreate] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const selected =
    projects.find((project) => project.id === projectId) ?? projects[0];

  const notReady = useMemo(
    () => readiness.filter((entry) => entry.ready === false),
    [readiness],
  );
  const captainReadiness = readiness.find(
    (entry) => entry.profileId === captainRef,
  );

  async function addFolder(path: string): Promise<void> {
    setError(undefined);
    setOfferCreate(undefined);
    setBusy(true);
    try {
      const project = await props.onRegisterPath(path);
      setProjectId(project.id);
      setShowPathInput(false);
      setPathDraft("");
    } catch (cause) {
      const message = (cause as Error).message;
      if (/not the root of a git work tree/.test(message)) {
        setOfferCreate(path);
        setError(`${path} is not a git repository yet.`);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createHere(path: string): Promise<void> {
    setError(undefined);
    setBusy(true);
    try {
      const project = await props.onCreateProject(path, true);
      setProjectId(project.id);
      setOfferCreate(undefined);
      setShowPathInput(false);
      setPathDraft("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function start(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !selected) return;
    setError(undefined);
    setBusy(true);
    try {
      await props.onStart(selected.id, trimmed);
      setText("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const startDisabled =
    busy || !connected || !selected || text.trim().length === 0;
  const disabledReason = !connected
    ? "waiting for the Spex core connection"
    : !selected
      ? "add a project folder first — playbooks run inside a git repository"
      : text.trim().length === 0
        ? "describe what to do, or pick a playbook command"
        : undefined;

  return (
    <div
      data-testid="start-view"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 p-8"
    >
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          What should we run?
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          The Captain routes your words to a playbook and drives the players
          in your project.
        </p>
      </div>

      {notReady.length > 0 ? (
        <div
          data-testid="readiness-notice"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          {notReady.map((entry) => (
            <div key={entry.profileId}>
              <span className="font-mono font-semibold">{entry.profileId}</span>{" "}
              is not ready — {entry.requirement}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <textarea
          ref={composerRef}
          data-testid="start-composer"
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void start();
            }
          }}
          rows={3}
          placeholder="Describe a task, or pick a playbook below…"
          className="max-h-[40vh] w-full resize-y rounded-md border-0 bg-transparent px-1 py-1 text-sm outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-2 dark:border-neutral-800">
          <select
            data-testid="start-project-select"
            value={selected?.id ?? ""}
            onChange={(event) => setProjectId(event.target.value)}
            className="max-w-[16rem] truncate rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-950"
          >
            {projects.length === 0 ? (
              <option value="">no project yet</option>
            ) : null}
            {projects.map((project) => (
              <option key={project.id} value={project.id} title={project.path}>
                {project.name}
              </option>
            ))}
          </select>
          {props.onPickFolder ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void props.onPickFolder?.().then((path) => {
                  if (path) return addFolder(path);
                });
              }}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Choose folder…
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowPathInput((value) => !value)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Add folder by path…
            </button>
          )}
          <span className="ml-auto" />
          <button
            type="button"
            data-testid="start-send"
            disabled={startDisabled}
            title={disabledReason}
            onClick={() => void start()}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "Starting…" : "Start"}
          </button>
        </div>
        {disabledReason && !busy ? (
          <div className="text-right text-[11px] text-neutral-400">
            {disabledReason}
          </div>
        ) : null}
      </div>

      {showPathInput ? (
        <div className="flex gap-2">
          <input
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229)
                return;
              if (event.key === "Enter" && pathDraft.trim() && !busy) {
                void addFolder(pathDraft.trim());
              }
            }}
            placeholder="~/path/to/a/git/repo"
            className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
          <button
            type="button"
            disabled={!pathDraft.trim() || busy}
            onClick={() => void addFolder(pathDraft.trim())}
            className="rounded-md border border-indigo-300 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
          >
            Add
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
          {offerCreate ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void createHere(offerCreate)}
              className="ml-2 rounded border border-red-300 px-2 py-0.5 text-xs hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
            >
              Initialize a git repo here (with specs scaffold)
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {playbooks.map((playbook) => (
          <button
            key={playbook.id}
            type="button"
            data-testid={`playbook-chip-${playbook.id}`}
            title={playbook.intent}
            onClick={() => {
              setText((current) =>
                current.startsWith(`/${playbook.command}`)
                  ? current
                  : `/${playbook.command} ${current}`.trimEnd() + " ",
              );
              composerRef.current?.focus();
            }}
            className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs hover:border-indigo-400 hover:text-indigo-600 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:text-indigo-300"
          >
            <span className="font-mono font-semibold">/{playbook.command}</span>
            <span className="text-neutral-400"> — {playbook.intent}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
        <span>Captain:</span>
        <select
          data-testid="captain-select"
          value={captainRef}
          onChange={(event) => props.onCaptainChange(event.target.value)}
          className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-950"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.id}
              {profile.model ? ` (${profile.model})` : ""}
            </option>
          ))}
          {!profiles.some((profile) => profile.id === captainRef) ? (
            <option value={captainRef}>{captainRef}</option>
          ) : null}
        </select>
        {captainReadiness ? (
          captainReadiness.ready === true ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              ready
            </span>
          ) : captainReadiness.ready === false ? (
            <span
              className="text-red-500 dark:text-red-400"
              title={captainReadiness.requirement}
            >
              not ready
            </span>
          ) : null
        ) : null}
      </div>
    </div>
  );
}

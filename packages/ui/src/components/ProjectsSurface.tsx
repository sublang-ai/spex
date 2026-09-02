// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The workspace's Overview tab (projects-4, DR-011, DR-038): the
// current project's repository header — git state, GitHub binding,
// refresh, removal — over the project's own ledger group, drawn by
// the same component the Dashboard uses. Registry management (add,
// create) lives in the project palette; removal lives here.

import { useMemo, useState } from "react";
import type { IntentInfo } from "@sublang/spex-core/protocol";

import { useAppStore, type ProjectMeta } from "../state/store.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";
import {
  ProjectGroup,
  useCaptureReveal,
  useForgeAge,
  useGroupInputs,
  useNow,
} from "./ProjectGroup.js";

function StatusBadges({ meta }: { meta?: ProjectMeta }) {
  if (meta?.statusError) {
    return (
      <span
        className="text-[11px] text-red-500"
        title={meta.statusError}
      >
        repo unreadable — does the path still exist?
      </span>
    );
  }
  const status = meta?.status;
  if (!status) return null;
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500">
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
        {status.branch}
      </span>
      {status.dirty ? (
        <span className="text-amber-600 dark:text-amber-400" title="uncommitted changes">
          ●
        </span>
      ) : null}
      {status.ahead > 0 ? <span title="ahead of upstream">↑{status.ahead}</span> : null}
      {status.behind > 0 ? <span title="behind upstream">↓{status.behind}</span> : null}
      {meta?.forge?.repo ? (
        <span className="text-neutral-400">{meta.forge.repo}</span>
      ) : null}
    </span>
  );
}

export function OverviewTab({
  projectId,
  onRemoved,
  onOpenSession,
  onOpenIntent,
  onStartIntent,
}: {
  projectId: string;
  /** Called after the project is removed from the registry. */
  onRemoved: () => void;
  /** Open a session; with a turnId, land at that turn's place. */
  onOpenSession: (sessionId: string, turnId?: number) => void;
  /** Open an intent record in this project's records reader. */
  onOpenIntent: (projectId: string, path: string) => void;
  /** Stage an intent's dispatch (run-view-86). */
  onStartIntent: (intent: IntentInfo) => Promise<void> | void;
}) {
  const projects = useAppStore((state) => state.projects);
  const projectMeta = useAppStore((state) => state.projectMeta);
  const sessions = useAppStore((state) => state.sessions);
  const loadProjectMeta = useAppStore((state) => state.loadProjectMeta);
  const removeProject = useAppStore((state) => state.removeProject);

  const [error, setError] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const project = projects.find((entry) => entry.id === projectId);
  const meta = projectMeta[projectId];
  const liveCount = sessions.filter(
    (session) => session.live && session.projectId === projectId,
  ).length;

  // The Overview pins one project (DR-038): the group's inputs load
  // for it alone, the way the Dashboard loads every project's.
  const pinned = useMemo(() => (project ? [project] : []), [project]);
  const now = useNow();
  useGroupInputs(pinned);
  const ageOf = useForgeAge(pinned, now);
  const { highlightId, capture } = useCaptureReveal();

  if (!project) {
    return (
      <div className="m-auto text-sm text-neutral-400">
        This project is no longer registered.
      </div>
    );
  }

  return (
    <div
      data-testid="overview-tab"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-y-auto p-6"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{project.name}</span>
            <StatusBadges meta={meta} />
          </div>
          <div className="truncate text-xs text-neutral-500">
            {project.path}
          </div>
        </div>
        <button
          type="button"
          title="Refresh status and GitHub data"
          aria-label={`Refresh ${project.name}`}
          disabled={meta?.loading}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:animate-pulse dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          onClick={() => void loadProjectMeta(project.id, true)}
        >
          <Icon name="refresh" />
        </button>
        {confirmRemove ? (
          // Removal forgets a project: the one confirm this tab keeps
          // (projects-9, DR-010 §4).
          <InlineConfirm
            question="Remove from Spex? The repo stays on disk."
            confirmLabel="remove"
            cancelLabel="keep"
            onConfirm={() => {
              setConfirmRemove(false);
              removeProject(project.id)
                .then(onRemoved)
                .catch((cause: Error) => setError(cause.message));
            }}
            onCancel={() => setConfirmRemove(false)}
          />
        ) : (
          <button
            type="button"
            disabled={liveCount > 0}
            title={
              liveCount > 0
                ? "End the live sessions before removing"
                : "Remove from Spex (repo stays on disk)"
            }
            onClick={() => setConfirmRemove(true)}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Remove project
          </button>
        )}
      </div>
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <ProjectGroup
        project={project}
        heading={false}
        now={now}
        ageText={ageOf(project.id)}
        highlightId={highlightId}
        onOpenSession={onOpenSession}
        onOpenIntent={onOpenIntent}
        onStartIntent={onStartIntent}
        onCapture={capture}
      />
    </div>
  );
}

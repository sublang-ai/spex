// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The workspace's Repo tab (PROJ, DR-011): the current project's
// git state and GitHub issues/PRs. Registry management (add, create)
// lives in the project palette; removal lives here.

import { useEffect, useState } from "react";
import type { ForgeItem } from "@sublang/spex-core/protocol";

import { useAppStore, type ProjectMeta } from "../state/store.js";
import { Icon } from "./Icon.js";
import { InlineConfirm } from "./InlineConfirm.js";

function ForgeList({ label, items }: { label: string; items: ForgeItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, 8);
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-semibold text-neutral-500">
        {label} ({items.length})
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((item) => (
          <li key={item.url} className="truncate text-sm">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline dark:text-indigo-300"
            >
              #{item.number}
            </a>{" "}
            {item.title}
            {item.author ? (
              <span className="text-xs text-neutral-400"> · {item.author}</span>
            ) : null}
          </li>
        ))}
        {items.length > shown.length ? (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-indigo-600 hover:underline dark:text-indigo-300"
            >
              +{items.length - shown.length} more
            </button>
          </li>
        ) : null}
        {items.length === 0 ? (
          <li className="text-xs text-neutral-400">none open</li>
        ) : null}
      </ul>
    </div>
  );
}

function ForgePanel({ meta }: { meta?: ProjectMeta }) {
  if (meta?.forgeError) {
    return (
      <div className="text-xs text-red-500">
        Couldn't load GitHub data: {meta.forgeError}
      </div>
    );
  }
  const forge = meta?.forge;
  if (!forge) {
    return (
      <div className="text-xs text-neutral-400">
        {meta?.loading
          ? "loading GitHub state…"
          : "no GitHub data yet — refresh the card"}
      </div>
    );
  }
  if (forge.guidance && forge.authenticated !== true) {
    return (
      <div className="rounded border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700">
        {forge.guidance}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {forge.guidance ? (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          {forge.guidance}
        </div>
      ) : null}
      <div className="flex gap-6">
        <ForgeList label="Issues to do" items={forge.issues} />
        <ForgeList label="PRs to review" items={forge.prs} />
      </div>
    </div>
  );
}

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

export function RepoTab({
  projectId,
  onRemoved,
}: {
  projectId: string;
  /** Called after the project is removed from the registry. */
  onRemoved: () => void;
}) {
  const projects = useAppStore((state) => state.projects);
  const projectMeta = useAppStore((state) => state.projectMeta);
  const sessions = useAppStore((state) => state.sessions);
  const loadProjectMeta = useAppStore((state) => state.loadProjectMeta);
  const removeProject = useAppStore((state) => state.removeProject);
  const connection = useAppStore((state) => state.connection);

  const [error, setError] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState(false);

  const project = projects.find((entry) => entry.id === projectId);
  const meta = projectMeta[projectId];
  const liveCount = sessions.filter(
    (session) => session.live && session.projectId === projectId,
  ).length;

  useEffect(() => {
    if (connection === "open" && project && !projectMeta[project.id]) {
      void loadProjectMeta(project.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, projectId]);

  if (!project) {
    return (
      <div className="m-auto text-sm text-neutral-400">
        This project is no longer registered.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
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
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <ForgePanel meta={meta} />
      </div>
    </div>
  );
}

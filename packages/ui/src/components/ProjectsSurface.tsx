// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The workspace's Overview tab (projects-4, DR-011, DR-038): the
// current project's repository header — git state, GitHub binding,
// refresh, removal — over the project's own ledger group, drawn by
// the same component the Dashboard uses. Registry management (add,
// create) lives in the project palette; removal lives here.

import { useEffect, useMemo, useRef, useState } from "react";
import type { IntentInfo, ProjectInfo } from "@sublang/spex-core/protocol";

import type { ProjectMeta } from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import { i18n } from "../i18n.js";
import { recordsStatePhrase } from "../lib/space.js";
import { allRepositories, standingOf } from "../lib/instances.js";
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
        className="text-xs text-red-500"
        title={meta.statusError}
      >
        {i18n._("Repo unreadable — does the path still exist?")}
      </span>
    );
  }
  const status = meta?.status;
  if (!status) return null;
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs text-neutral-500">
      <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
        {status.branch}
      </span>
      {status.dirty ? (
        <span
          className="text-amber-600 dark:text-amber-400"
          title={i18n._("uncommitted changes")}
        >
          ●
        </span>
      ) : null}
      {status.ahead > 0 ? (
        <span title={i18n._("ahead of upstream")}>↑{status.ahead}</span>
      ) : null}
      {status.behind > 0 ? (
        <span title={i18n._("behind upstream")}>↓{status.behind}</span>
      ) : null}
      {meta?.forge?.repo ? (
        <span className="text-neutral-500">{meta.forge.repo}</span>
      ) : null}
    </span>
  );
}

/** The GitHub binding's state, named in the header (projects-7): the
 * guidance for an unmet condition, or the load failure, so a user
 * never has to open the Sources band to learn why it is empty — and
 * only while that band is folded, since an open band says it itself
 * (DR-069: a surface explains nothing its controls show). */
function GitHubLine({ meta, projectId }: { meta?: ProjectMeta; projectId: string }) {
  const store = usePlaceStore();
  const folded = store((state) => state.foldedSources[projectId] ?? false);
  const forge = meta?.forge;
  if (!folded) return null;
  const ready =
    forge !== undefined && !(forge.guidance && forge.authenticated !== true);
  if (ready) return null;
  const text = forge?.guidance
    ? forge.guidance
    : meta?.forgeError
      ? i18n._("Couldn't load GitHub data: {reason}", {
          reason: meta.forgeError,
        })
      : meta?.loading
        ? i18n._("Loading GitHub state…")
        : undefined;
  if (!text) return null;
  return (
    <div
      data-testid="overview-github"
      className="text-xs text-neutral-500 [overflow-wrap:anywhere]"
    >
      {i18n._("GitHub: {state}", { state: text })}
    </div>
  );
}

/** Where the project's records are (projects-4, DR-172): "Records ·
 * <group> · <standing>" — the group holding them as the Space surface
 * heads it, "Personal" for the person's own and left out while they are
 * in none, and their standing as the Space surface words it (space-61),
 * or a waiting step where one waits (space-64) — read from the Space
 * state, which this line asks for when nothing has read it yet. No
 * records' key or repository name is named. */
function RecordsLine({ project, now }: { project: ProjectInfo; now: number }) {
  const store = usePlaceStore();
  const space = store((state) => state.space);
  const loadSpace = store((state) => state.loadSpace);
  const connected = store((state) => state.connection === "open");
  useEffect(() => {
    if (connected && !store.getState().space) void loadSpace().catch(() => {});
  }, [connected, loadSpace]);
  const { key } = project.repository;
  const row = space ? allRepositories(space).find((repository) => repository.key === key) : undefined;
  const standing = space && row ? standingOf(space, key) : undefined;
  // The group the records stand under (space-1): none while they are in
  // no group — your own group's rows stand under "This computer".
  const entry = standing && !standing.own ? standing.group : undefined;
  const group = !entry
    ? undefined
    : entry.login !== null && entry.mine
      ? i18n._({ id: "Personal", comment: "your own records and packages at a Space, never \"your namespace\"" })
      : entry.login !== null
        ? i18n._({
            id: "Shared by @{login}",
            values: { login: entry.login },
            comment: "records another account keeps at a Space and shares with you; {login} is that account",
          })
        : entry.name;
  const state = row ? recordsStatePhrase(row, now) : "";
  return (
    <div
      data-testid="overview-records"
      className="truncate text-xs text-neutral-500"
      title={entry && entry.login === null && entry.fullPath !== entry.name ? entry.fullPath : undefined}
    >
      {i18n._({ id: "Records", comment: "the Overview's field naming where the project's records are: its group and their standing follow" })}
      {group ? (
        <>
          <span aria-hidden> · </span>
          <span data-testid="overview-records-group">{group}</span>
        </>
      ) : null}
      {state ? (
        <>
          <span aria-hidden> · </span>
          <span data-testid="overview-records-state">{state}</span>
        </>
      ) : null}
    </div>
  );
}

/** The sidebar's Dashboard entry — the place focus lands once this
 * project is gone (projects-9, DR-010 §6), since the Overview it
 * stood on goes with it. The rail and the entry are found by what
 * they are, never by what they say: an accessible name is a text and
 * reads differently in every language (localization-4). */
function focusDashboardEntry(): void {
  const rail = document.querySelector('[data-testid="sidebar"]');
  rail?.querySelector<HTMLButtonElement>('[data-surface="Dashboard"]')?.focus();
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
  onOpenIntent: (projectId: string, path: string, anchor: string) => void;
  /** Stage an intent's dispatch (run-view-86). */
  onStartIntent: (intent: IntentInfo) => Promise<void> | void;
}) {
  const store = usePlaceStore();
  const projects = store((state) => state.projects);
  const projectMeta = store((state) => state.projectMeta);
  const sessions = store((state) => state.sessions);
  const loadProjectMeta = store((state) => state.loadProjectMeta);
  const removeProject = store((state) => state.removeProject);

  const [error, setError] = useState<string>();
  const [confirmRemove, setConfirmRemove] = useState(false);
  // The second confirm (projects-9): the core refused the first with
  // `conflict`, counting the records that never reached a Space; the
  // count rides the question so the reader sees what would be lost, the
  // core's words where it carries none.
  const [unsent, setUnsent] = useState<{ count?: number; reason: string }>();
  const removeRef = useRef<HTMLButtonElement>(null);
  const returnToRemove = useRef(false);
  // Keep — or a failed removal — hands focus back to the control the
  // confirm replaced, never to the page body (DR-010 §6).
  useEffect(() => {
    if (!confirmRemove && unsent === undefined && returnToRemove.current) {
      returnToRemove.current = false;
      removeRef.current?.focus();
    }
  }, [confirmRemove, unsent, error]);

  /** Remove, the second time with `confirm` (projects-9): records that
   * never reached a Space are refused `conflict` the first time, and the
   * second confirm asks again with their count. */
  const remove = (confirm: boolean) => {
    if (!project) return;
    removeProject(project.id, confirm)
      .then(() => {
        onRemoved();
        focusDashboardEntry();
      })
      .catch((cause: Error & { code?: string; details?: Record<string, unknown> }) => {
        if (!confirm && cause.code === "conflict") {
          const units = cause.details?.units;
          setUnsent({ reason: cause.message, ...(typeof units === "number" ? { count: units } : {}) });
          return;
        }
        returnToRemove.current = true;
        setError(cause.message);
      });
  };

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
  const fetchedAt = useForgeAge(pinned);
  const { highlightId, capture } = useCaptureReveal();

  if (!project) {
    return (
      <div className="m-auto text-sm text-neutral-500">
        {i18n._("This project is no longer registered.")}
      </div>
    );
  }

  return (
    // The tab root is the box the Overview scrolls in (DR-041 §9):
    // height-constrained, and the containing block for its own
    // positioned content, so the page itself never scrolls.
    <div
      data-testid="overview-tab"
      className="relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-4 overflow-y-auto p-6"
    >
      {/* The header fits its pane (DR-041): the name owns the slack and
          the controls wrap under it when the pane is too narrow. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate text-lg font-semibold">
              {project.name}
            </span>
            <StatusBadges meta={meta} />
          </div>
          <div className="truncate text-xs text-neutral-500">
            {project.path}
          </div>
          <RecordsLine project={project} now={now} />
          <GitHubLine meta={meta} projectId={project.id} />
        </div>
        <button
          type="button"
          title={i18n._("Refresh status and GitHub data")}
          aria-label={i18n._("Refresh {project}", { project: project.name })}
          disabled={meta?.loading}
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:animate-pulse dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          onClick={() => void loadProjectMeta(project.id, true)}
        >
          <Icon name="refresh" />
        </button>
        {unsent !== undefined ? (
          <span data-testid="remove-project-unsent">
            <InlineConfirm
              question={
                unsent.count !== undefined
                  ? i18n._({
                      id: "{count, plural, one {# record never reached a Space. Remove anyway?} other {# records never reached a Space. Remove anyway?}}",
                      values: { count: unsent.count },
                      comment: "the Overview's second confirm of a removal: how many of the project's records were never sent to any Space",
                    })
                  : i18n._("{reason} Remove anyway?", { reason: unsent.reason })
              }
              confirmLabel={i18n._({
                id: "Remove",
                comment: "confirm: forget this project, leaving the repo on disk",
              })}
              cancelLabel={i18n._({
                id: "Keep",
                comment: "cancel a destructive confirm: leave things as they are",
              })}
              onConfirm={() => {
                setUnsent(undefined);
                remove(true);
              }}
              onCancel={() => {
                returnToRemove.current = true;
                setUnsent(undefined);
              }}
            />
          </span>
        ) : confirmRemove ? (
          // Removal forgets a project: the one confirm this tab keeps
          // (projects-9, DR-010 §4).
          <InlineConfirm
            question={i18n._("Remove from Spex? The repo stays on disk.")}
            confirmLabel={i18n._({
              id: "Remove",
              comment: "confirm: forget this project, leaving the repo on disk",
            })}
            cancelLabel={i18n._({
              id: "Keep",
              comment: "cancel a destructive confirm: leave things as they are",
            })}
            onConfirm={() => {
              setConfirmRemove(false);
              setError(undefined);
              remove(false);
            }}
            onCancel={() => {
              returnToRemove.current = true;
              setConfirmRemove(false);
            }}
          />
        ) : (
          <button
            ref={removeRef}
            type="button"
            disabled={liveCount > 0}
            title={
              liveCount > 0
                ? i18n._(
                    "Wait for the running turn to finish, or abort it, before removing",
                  )
                : i18n._("Remove from Spex (repo stays on disk)")
            }
            onClick={() => setConfirmRemove(true)}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {i18n._("Remove project")}
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
        fetchedAt={fetchedAt(project.id)}
        highlightId={highlightId}
        onOpenSession={onOpenSession}
        onOpenIntent={onOpenIntent}
        onStartIntent={onStartIntent}
        onCapture={capture}
      />
    </div>
  );
}

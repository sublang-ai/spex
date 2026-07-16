// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Dashboard surface (DASH-1..9, DASH-20): attention first, then
// running sessions, work lists grouped by project, usage rollups.

import { useEffect, useState, type ReactNode } from "react";
import type { ForgeItem } from "@sublang/spex-core/protocol";

import { deriveAttention, type AttentionItem } from "../state/dashboard.js";
import { getClient, useAppStore } from "../state/store.js";
import { stateLabel, type StatusTone } from "../lib/labels.js";
import type { Surface } from "../App.js";

const KIND_STYLE: Record<AttentionItem["kind"], string> = {
  question:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  failure:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
  idle: "border-neutral-200 bg-white text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
};

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  question: "needs your reply",
  failure: "failed",
  idle: "awaiting direction",
};

/** Session-state chip classes per tone (DR-010 §8 as amended by
 * DR-013: brand purple stays interactive, so status chips tint
 * amber/red/neutral only). */
const TONE_CHIP: Record<StatusTone, string> = {
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  emerald: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  neutral: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

function elapsed(since: number, now: number): string {
  const minutes = Math.floor((now - since) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

type ProjectItems = {
  projectId: string;
  projectName: string;
  items: ForgeItem[];
};

function byRecency(a: ForgeItem, b: ForgeItem): number {
  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
}

function WorkList({
  title,
  groups,
  emptyText,
}: {
  title: string;
  groups: ProjectItems[];
  emptyText: ReactNode;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const nonEmpty = groups.filter((group) => group.items.length > 0);
  return (
    <div className="min-w-0">
      <h2 className="mb-2 text-sm font-semibold text-neutral-500">{title}</h2>
      {nonEmpty.length === 0 ? (
        <div className="text-xs text-neutral-400">{emptyText}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {nonEmpty.map((group) => {
            const shown = expanded[group.projectId]
              ? group.items
              : group.items.slice(0, 6);
            return (
              <div key={group.projectId}>
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
                  {group.projectName}
                  <span className="rounded-full bg-neutral-100 px-1.5 text-[11px] text-neutral-500 dark:bg-neutral-800">
                    {group.items.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1">
                  {shown.map((item) => (
                    <li
                      key={`${group.projectId}:${item.url}`}
                      className="truncate text-sm"
                      title={item.title}
                    >
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 hover:underline dark:text-brand-300"
                      >
                        #{item.number}
                      </a>{" "}
                      {item.title}
                      {item.labels?.map((label) => (
                        <span
                          key={label}
                          className="ml-1 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                        >
                          {label}
                        </span>
                      ))}
                    </li>
                  ))}
                  {group.items.length > shown.length ? (
                    <li>
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((current) => ({
                            ...current,
                            [group.projectId]: true,
                          }))
                        }
                        className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                      >
                        +{group.items.length - shown.length} more
                      </button>
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DashboardSurface({
  onOpenSession,
  onNavigate,
}: {
  onOpenSession: (sessionId: string) => void;
  onNavigate: (surface: Surface) => void;
}) {
  const sessions = useAppStore((state) => state.sessions);
  const views = useAppStore((state) => state.views);
  const projects = useAppStore((state) => state.projects);
  const projectMeta = useAppStore((state) => state.projectMeta);
  const connection = useAppStore((state) => state.connection);

  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [now, setNow] = useState(() => Date.now());
  const [usage, setUsage] = useState<{
    state: "loading" | "ready" | "error";
    days: {
      day: string;
      totals: { totalCostUsd: number; inputTokens: number; outputTokens: number };
    }[];
  }>({ state: "loading", days: [] });

  // Keep elapsed labels honest during quiet periods.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (connection === "open") {
      getClient()
        .command("usage.days", {})
        .then((days) => setUsage({ state: "ready", days }))
        .catch(() => setUsage({ state: "error", days: [] }));
    }
  }, [connection, sessions]);

  const attention = deriveAttention(sessions, views);
  const live = sessions.filter((session) => session.live);

  const filtered =
    projectFilter === "all"
      ? projects
      : projects.filter((project) => project.id === projectFilter);
  const issueGroups: ProjectItems[] = filtered.map((project) => ({
    projectId: project.id,
    projectName: project.name,
    items: [...(projectMeta[project.id]?.forge?.issues ?? [])].sort(byRecency),
  }));
  const prGroups: ProjectItems[] = filtered.map((project) => ({
    projectId: project.id,
    projectName: project.name,
    items: [...(projectMeta[project.id]?.forge?.prs ?? [])].sort(byRecency),
  }));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 overflow-y-auto p-6">
      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">
          Needs attention
        </h2>
        <div className="flex flex-col gap-2" data-testid="attention-queue">
          {attention.map((item) => (
            <button
              key={item.sessionId + item.kind}
              type="button"
              onClick={() => onOpenSession(item.sessionId)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm ${KIND_STYLE[item.kind]}`}
            >
              <span className="rounded-full border border-current px-2 py-0.5 text-[11px] font-medium">
                {KIND_LABEL[item.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.text}</span>
              <span
                className="font-mono text-[11px] opacity-70"
                title={item.projectPath}
              >
                {item.projectPath.split("/").pop()}
              </span>
            </button>
          ))}
          {attention.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700">
              Nothing needs you right now.
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">
          Running sessions
        </h2>
        <div className="flex flex-col gap-2">
          {live.map((session) => {
            const view = views[session.id];
            const label = view?.fsmState
              ? stateLabel(view.fsmState, {
                  pendingQuestion: view.pendingQuestion !== undefined,
                  turnActive: view.turnActive,
                })
              : undefined;
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onOpenSession(session.id)}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <span className="font-medium" title={session.projectPath}>
                  {session.projectPath.split("/").pop()}
                </span>
                {label ? (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] ${TONE_CHIP[label.tone]}`}
                    title={view?.fsmState}
                  >
                    {label.text}
                  </span>
                ) : null}
                {view?.turnActive ? (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                ) : null}
                <span className="ml-auto text-xs text-neutral-400">
                  started {elapsed(session.createdAt, now)} ago
                </span>
              </button>
            );
          })}
          {live.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700">
              No live sessions —{" "}
              <button
                type="button"
                onClick={() => onNavigate("Workspace")}
                className="text-brand-600 hover:underline dark:text-brand-300"
              >
                start one
              </button>
              .
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-500">Next work</h2>
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="ml-auto rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            title="Filter by project"
          >
            <option value="all">all projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <WorkList
            title="Issues to do"
            groups={issueGroups}
            emptyText={
              <>
                No open issues yet — connect GitHub in the project's{" "}
                <button
                  type="button"
                  onClick={() => onNavigate("Workspace")}
                  className="text-brand-600 hover:underline dark:text-brand-300"
                >
                  Repo tab
                </button>
                .
              </>
            }
          />
          <WorkList
            title="PRs to review"
            groups={prGroups}
            emptyText="No open pull requests yet."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">Usage</h2>
        <div className="flex flex-wrap gap-2">
          {usage.state === "loading" ? (
            <div className="text-xs text-neutral-400">loading usage…</div>
          ) : usage.state === "error" ? (
            <div className="text-xs text-red-500">
              usage could not be loaded — is the core connected?
            </div>
          ) : usage.days.length === 0 ? (
            <div className="text-xs text-neutral-400">
              No usage recorded yet — costs appear after your first turn.
            </div>
          ) : (
            usage.days.slice(0, 7).map((entry) => (
              <div
                key={entry.day}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="font-mono text-neutral-500">{entry.day}</div>
                <div className="mt-0.5 font-medium">
                  ${entry.totals.totalCostUsd.toFixed(2)}
                </div>
                <div className="text-neutral-400">
                  {entry.totals.inputTokens.toLocaleString()}→
                  {entry.totals.outputTokens.toLocaleString()} tok
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

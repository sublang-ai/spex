// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Dashboard surface (DASH-1..9): attention first, then running
// sessions, next work from the forge, and usage rollups.

import { useEffect, useState } from "react";

import { deriveAttention, type AttentionItem } from "../state/dashboard.js";
import { getClient, useAppStore } from "../state/store.js";

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

function elapsed(since: number): string {
  const minutes = Math.floor((Date.now() - since) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function DashboardSurface({
  onOpenSession,
}: {
  onOpenSession: (sessionId: string) => void;
}) {
  const sessions = useAppStore((state) => state.sessions);
  const views = useAppStore((state) => state.views);
  const projects = useAppStore((state) => state.projects);
  const projectMeta = useAppStore((state) => state.projectMeta);
  const connection = useAppStore((state) => state.connection);

  const [usageDays, setUsageDays] = useState<
    { day: string; totals: { totalCostUsd: number; inputTokens: number; outputTokens: number } }[]
  >([]);

  useEffect(() => {
    if (connection === "open") {
      getClient()
        .command("usage.days", {})
        .then(setUsageDays)
        .catch(() => {});
    }
  }, [connection, sessions]);

  const attention = deriveAttention(sessions, views);
  const live = sessions.filter((session) => session.live);

  const issues = projects.flatMap((project) =>
    (projectMeta[project.id]?.forge?.issues ?? []).map((item) => ({
      ...item,
      project: project.name,
    })),
  );
  const prs = projects.flatMap((project) =>
    (projectMeta[project.id]?.forge?.prs ?? []).map((item) => ({
      ...item,
      project: project.name,
    })),
  );

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
              <span className="font-mono text-[11px] opacity-70">
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
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => onOpenSession(session.id)}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-left text-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <span className="font-medium">
                  {session.projectPath.split("/").pop()}
                </span>
                {view?.fsmState ? (
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
                    {view.fsmState}
                  </span>
                ) : null}
                {view?.turnActive ? (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                ) : null}
                <span className="ml-auto text-xs text-neutral-400">
                  started {elapsed(session.createdAt)} ago
                </span>
              </button>
            );
          })}
          {live.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 px-4 py-5 text-center text-sm text-neutral-500 dark:border-neutral-700">
              No live sessions.
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">
            Issues to do
          </h2>
          <ul className="flex flex-col gap-1.5">
            {issues.slice(0, 10).map((item) => (
              <li key={item.url} className="truncate text-sm">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  #{item.number}
                </a>{" "}
                {item.title}
                <span className="text-xs text-neutral-400"> · {item.project}</span>
              </li>
            ))}
            {issues.length === 0 ? (
              <li className="text-xs text-neutral-400">
                No open issues across bound projects.
              </li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">
            PRs to review
          </h2>
          <ul className="flex flex-col gap-1.5">
            {prs.slice(0, 10).map((item) => (
              <li key={item.url} className="truncate text-sm">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  #{item.number}
                </a>{" "}
                {item.title}
                <span className="text-xs text-neutral-400"> · {item.project}</span>
              </li>
            ))}
            {prs.length === 0 ? (
              <li className="text-xs text-neutral-400">
                No open pull requests across bound projects.
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">Usage</h2>
        <div className="flex flex-wrap gap-2">
          {usageDays.slice(0, 7).map((entry) => (
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
          ))}
          {usageDays.length === 0 ? (
            <div className="text-xs text-neutral-400">No usage recorded yet.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

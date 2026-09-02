// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A project group's Sources band (dashboard-20/6/24/30, DR-035): a
// collapsed counts-and-age line expanding in place to three paged
// tabs — Issues, PRs, Open records — whose rows carry the one shared
// representation (forge-work-lists-1) and the one-gesture Queue
// control. Expanding, switching, and paging are visibility only.

import { useState, type ReactNode } from "react";
import type {
  DerivedIntent,
  ForgeItem,
  IntentSource,
  ProjectInfo,
  SpecRecordInfo,
  SpecTreeState,
} from "@sublang/spex-core/protocol";

import type { ProjectMeta } from "../state/store.js";
import { absoluteTitle, relativeAge } from "../lib/time.js";
import { Icon } from "./Icon.js";
import { RecordRow } from "./RecordRow.js";
import {
  CapturedState,
  ForgeItemRow,
  QueueControl,
  forgeSeedText,
} from "./ForgeItemRow.js";

const PAGE_SIZE = 6;

function plural(count: number, noun: string, nouns = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : nouns}`;
}

/** The records the core's read classifies as open (spec-view-14,
 * dashboard-24): a finished one lists in History instead, so every
 * record lands in exactly one band (DR-038). */
export function openRecordsOf(tree: SpecTreeState | undefined): SpecRecordInfo[] {
  return (tree?.intents ?? []).filter((record) => !record.finished);
}

/** One tab's quiet in-place pager (dashboard-20). */
function Paged<T>({
  items,
  page,
  onPage,
  render,
  empty,
}: {
  items: T[];
  page: number;
  onPage: (page: number) => void;
  render: (item: T) => ReactNode;
  empty: ReactNode;
}) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount - 1);
  const shown = items.slice(clamped * PAGE_SIZE, clamped * PAGE_SIZE + PAGE_SIZE);
  if (items.length === 0) {
    return <div className="text-xs text-neutral-500">{empty}</div>;
  }
  return (
    <>
      <ul className="flex flex-col gap-1">{shown.map(render)}</ul>
      {pageCount > 1 ? (
        <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
          <button
            type="button"
            aria-label="Previous page"
            disabled={clamped === 0}
            onClick={() => onPage(clamped - 1)}
            className="min-h-6 min-w-6 rounded px-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
          >
            ‹
          </button>
          <span>
            {clamped + 1} / {pageCount}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={clamped === pageCount - 1}
            onClick={() => onPage(clamped + 1)}
            className="min-h-6 min-w-6 rounded px-1 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
          >
            ›
          </button>
        </div>
      ) : null}
    </>
  );
}

type SourceTab = "issues" | "prs" | "records";

export function SourcesBand({
  project,
  meta,
  tree,
  openSources,
  fetchedAt,
  now,
  onRefresh,
  onQueue,
  onOpenIntent,
  onOpenOverview,
}: {
  project: ProjectInfo;
  meta?: ProjectMeta;
  tree?: SpecTreeState;
  /** Open intents by `kind:ref` — the captured-artifact swap. */
  openSources: Map<string, DerivedIntent>;
  /** When this client observed the served forge data — the line's
   * data age (dashboard-14). */
  fetchedAt?: number;
  now: number;
  onRefresh: () => void;
  onQueue: (text: string, source: IntentSource) => void | Promise<unknown>;
  onOpenIntent: (projectId: string, path: string) => void;
  /** Navigation to the project's Overview tab, whose header shows the
   * GitHub binding (dashboard-8); absent on the Overview itself. */
  onOpenOverview?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<SourceTab>("issues");
  const [pages, setPages] = useState<Record<SourceTab, number>>({
    issues: 0,
    prs: 0,
    records: 0,
  });

  const forge = meta?.forge;
  const forgeReady =
    forge !== undefined && !(forge.guidance && forge.authenticated !== true);
  // No meta yet is a read in flight, never "not connected"
  // (dashboard-20): the group asks for it on mount.
  const forgeLoading = meta === undefined || (meta.loading === true && !forge);
  const issues = (forgeReady ? forge.issues : undefined) ?? [];
  const prs = (forgeReady ? forge.prs : undefined) ?? [];
  const records = openRecordsOf(tree);

  const setPage = (which: SourceTab) => (page: number) =>
    setPages((current) => ({ ...current, [which]: page }));

  // The setup guidance names the unmet condition (projects-7) in place
  // of the lists, here and on the Overview alike (dashboard-8).
  const forgeGuidance = (
    <div
      data-testid={`sources-guidance-${project.id}`}
      className="rounded border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700"
    >
      {forge?.guidance ??
        (meta?.forgeError
          ? `Couldn't load GitHub data: ${meta.forgeError}`
          : forgeLoading
            ? "Loading GitHub state…"
            : "No GitHub connection yet — a GitHub origin remote and a signed-in gh CLI put issues and PRs here.")}{" "}
      {onOpenOverview ? (
        <button
          type="button"
          onClick={onOpenOverview}
          className="text-brand-600 hover:underline dark:text-brand-300"
        >
          Open the project's Overview
        </button>
      ) : null}
    </div>
  );

  const tabButton = (which: SourceTab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === which}
      data-testid={`sources-tab-${which}-${project.id}`}
      onClick={() => setTab(which)}
      className={`min-h-6 rounded px-2 py-0.5 text-xs ${
        tab === which
          ? "bg-neutral-100 font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div data-testid={`sources-${project.id}`}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={expanded}
          data-testid={`sources-toggle-${project.id}`}
          onClick={() => setExpanded((current) => !current)}
          className="flex min-h-6 min-w-0 items-center gap-1 rounded text-left text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          <Icon
            name={expanded ? "caretDown" : "caretRight"}
            className="h-3.5 w-3.5 shrink-0"
          />
          <span className="truncate">
            {/* Zero counts would read as "no issues" when GitHub is
                simply not connected: the summary names the state
                instead (dashboard-20, projects-7). */}
            Sources:{" "}
            {forgeReady
              ? `${plural(issues.length, "issue")} · ${plural(prs.length, "PR")}`
              : forgeLoading
                ? "Loading GitHub…"
                : "GitHub not connected"}{" "}
            · {plural(records.length, "open record")}
            {fetchedAt !== undefined ? (
              <span
                className="text-neutral-500"
                title={absoluteTitle(fetchedAt)}
              >
                {" "}
                — {relativeAge(fetchedAt, now)}
              </span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Refresh sources for ${project.name}`}
          title="Refresh GitHub data"
          disabled={meta?.loading}
          onClick={onRefresh}
          data-testid={`sources-refresh-${project.id}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:animate-pulse dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
        </button>
        {meta?.forgeError ? (
          // Keep-last-good (dashboard-14): the failure rides beside the
          // age; the served lists stay.
          <span
            className="truncate text-xs text-red-600 dark:text-red-400"
            title={meta.forgeError}
            data-testid={`sources-error-${project.id}`}
          >
            GitHub refresh failed — keeping the last data
          </span>
        ) : null}
      </div>
      {expanded ? (
        <div className="mt-1.5 flex flex-col gap-1.5 pl-4">
          <div role="tablist" className="flex items-center gap-1">
            {tabButton("issues", "Issues")}
            {tabButton("prs", "PRs")}
            {tabButton("records", "Open records")}
          </div>
          {tab === "records" ? (
            <Paged
              items={records}
              page={pages.records}
              onPage={setPage("records")}
              empty="No unfinished intent records."
              render={(record) => {
                const captured = openSources.get(`record:${record.id}`);
                return (
                  <li
                    key={record.id}
                    className="flex min-w-0 items-center gap-2 text-sm"
                    data-testid={`source-record-${project.id}-${record.id}`}
                  >
                    {/* The one record row (dashboard-40): it opens in
                     * place, so no brand link — that is for what
                     * leaves the app. */}
                    <RecordRow
                      record={record}
                      onClick={() => onOpenIntent(project.id, record.path)}
                      className="flex-1"
                    />
                    {captured ? (
                      <CapturedState
                        derived={captured}
                        testId={`source-record-${project.id}-${record.id}-state`}
                      />
                    ) : (
                      <QueueControl
                        ariaLabel={`Queue record ${record.id} as an intent`}
                        onQueue={() =>
                          onQueue(`Resume ${record.id}: ${record.title}`, {
                            kind: "record",
                            ref: record.id,
                          })
                        }
                      />
                    )}
                  </li>
                );
              }}
            />
          ) : !forgeReady ? (
            forgeGuidance
          ) : (
            <Paged
              items={tab === "issues" ? issues : prs}
              page={pages[tab]}
              onPage={setPage(tab)}
              empty={tab === "issues" ? "No open issues." : "No open pull requests."}
              render={(item: ForgeItem) => {
                const kind = tab === "issues" ? "issue" : "pr";
                return (
                  <ForgeItemRow
                    key={item.url}
                    item={item}
                    kind={kind}
                    captured={openSources.get(`${kind}:${item.number}`)}
                    testId={`source-${kind}-${project.id}-${item.number}`}
                    // The labels ride as provenance (dashboard-30,
                    // DR-038): a fixed bug is known as one from
                    // capture, never from a later forge read.
                    onQueue={() =>
                      onQueue(forgeSeedText(kind, item), {
                        kind,
                        ref: String(item.number),
                        url: item.url,
                        ...(item.labels?.length ? { labels: item.labels } : {}),
                      })
                    }
                  />
                );
              }}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

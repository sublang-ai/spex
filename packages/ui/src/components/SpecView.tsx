// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Per-project spec view (SPECV; DR-011 as amended by DR-015): a
// read-only, left-rooted collapsible outline of the project's specs/
// tree — Packages and Compositions branches → collection directories →
// file nodes → items in document order under their section headings —
// with group filters, filter-as-you-type search, citation jumps, and a
// records reader. Pure props: the host wires specs.get / specs.read
// and persists the lifted SpecViewState per project.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type {
  SpecFileInfo,
  SpecItemInfo,
  SpecRecordInfo,
  SpecTreeState,
} from "@sublang/spex-core/protocol";

import {
  ancestorKeys,
  buildBranches,
  buildInboundIndex,
  buildItemIndex,
  fileCounts,
  fileKey,
  initialSpecViewState,
  linkItemTarget,
  normalizeSpecViewState,
  recordForHref,
  relativeReadTime,
  searchDigest,
  treeCounts,
  visibleFileItems,
  GROUP_ORDER,
  type SpecDirNode,
  type SpecGroup,
  type SpecViewState,
} from "../lib/spec-view-model.js";
import { Icon } from "./Icon.js";
import { Markdown } from "./Markdown.js";

export { initialSpecViewState };
export type { SpecViewState };

// Group colors keep DR-011's three hues under DR-015's section-kind
// groups: external sky, internal fuchsia, test teal — outside the
// status palette (DR-010 §8 with DR-013: emerald, amber, red, brand
// purple keep their meanings). Color is never the only channel: every
// chip and count carries the group word and an aria-label.
const GROUP_CHIP: Record<SpecGroup, string> = {
  external: "text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950",
  internal:
    "text-fuchsia-700 bg-fuchsia-50 dark:text-fuchsia-300 dark:bg-fuchsia-950",
  test: "text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-950",
};
const GROUP_TEXT: Record<SpecGroup, string> = {
  external: "text-sky-600 dark:text-sky-400",
  internal: "text-fuchsia-600 dark:text-fuchsia-400",
  test: "text-teal-600 dark:text-teal-400",
};
/** Filter toggle labels (DR-015). */
const FILTER_LABEL: Record<SpecGroup, string> = {
  external: "External",
  internal: "Internal",
  test: "Tests",
};

const MUTED_CHIP =
  "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500";

const LINK_CLASS = "text-brand-600 hover:underline dark:text-brand-300";

const COPY_BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800";

function itemDomId(id: string): string {
  return `specv-item-${id}`;
}

/** Transient string state that clears itself (copy tick, not-found
 * note, flash highlight); the timer dies with the component. */
function useTransient(
  ms: number,
): [string | undefined, (value: string) => void] {
  const [value, setValue] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const set = useCallback(
    (next: string) => {
      setValue(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(undefined), ms);
    },
    [ms],
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [value, set];
}

export interface SpecViewProps {
  /** Absent while the first specs.get is still in flight. */
  tree?: SpecTreeState;
  /** First load in flight. */
  loading?: boolean;
  /** Load failure; rendered with a Retry (DR-010 §5). */
  error?: string;
  onRefresh: () => void;
  /** Fetch one DR/IR's markdown (specs.read). */
  onReadRecord: (path: string) => Promise<string>;
  /** Seed the Academy example into this project (DR-015); the empty
   * state offers it only when wired. */
  onSeedExample?: () => void;
  viewState: SpecViewState;
  onViewState: (next: SpecViewState) => void;
}

type ReaderState = {
  record: SpecRecordInfo;
  loading: boolean;
  markdown?: string;
  error?: string;
};

export function SpecView(props: SpecViewProps) {
  const { onViewState } = props;
  // A stale persisted shape (pre-DR-015 user/dev/test state) resets to
  // defaults instead of crashing the view.
  const viewState = normalizeSpecViewState(props.viewState);
  // A missing tree is the first load (or its failure) — never
  // dereferenced (DR-010 §5: loading is a state, not a crash).
  const tree: SpecTreeState = props.tree ?? {
    present: false,
    legacy: false,
    files: [],
    decisions: [],
    iterations: [],
    notices: [],
    readAt: 0,
  };

  // Branch/directory collapse is cosmetic and local: levels default
  // open.
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // Items revealed by a citation jump despite their group filter.
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [reader, setReader] = useState<ReaderState | null>(null);
  const [pendingJump, setPendingJump] = useState<string>();
  const [copiedId, setCopiedId] = useTransient(1500);
  const [notFoundKey, setNotFoundKey] = useTransient(2000);
  const [flashId, setFlashId] = useTransient(1200);
  const [now, setNow] = useState(() => Date.now());

  const branches = useMemo(() => buildBranches(tree.files), [tree]);
  const itemIndex = useMemo(() => buildItemIndex(tree.files), [tree]);
  const inbound = useMemo(() => buildInboundIndex(tree.files), [tree]);
  const totals = useMemo(() => treeCounts(tree.files), [tree]);
  const records = useMemo(
    () => [...tree.decisions, ...tree.iterations],
    [tree],
  );

  const searching = viewState.search.trim().length > 0;
  const search = useMemo(
    () => searchDigest(tree.files, viewState),
    [tree, viewState.search, viewState.filters], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const revealedFiles = useMemo(() => {
    const keys = new Set<string>();
    for (const id of revealed) {
      const loc = itemIndex.get(id);
      if (loc) keys.add(loc.fileKey);
    }
    return keys;
  }, [revealed, itemIndex]);

  const expandedFiles = useMemo(
    () => new Set(viewState.expandedFiles),
    [viewState.expandedFiles],
  );
  const expandedItems = useMemo(
    () => new Set(viewState.expandedItems),
    [viewState.expandedItems],
  );

  // Keep "read Xm ago" honest without a re-read.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Escape closes the records popover (DR-010 §6).
  useEffect(() => {
    if (!recordsOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRecordsOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [recordsOpen]);

  // After a citation jump commits its expansion, scroll the target
  // into view and flash it.
  useEffect(() => {
    if (!pendingJump) return;
    const element = document.getElementById(itemDomId(pendingJump));
    if (element && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "center" });
    }
    setFlashId(pendingJump);
    setPendingJump(undefined);
  }, [pendingJump, setFlashId]);

  /** A file is effectively expanded while searching when it has
   * matches (computed — expandedFiles is not mutated, so clearing
   * the search restores the prior expansion). */
  function isFileExpanded(key: string): boolean {
    if (searching) {
      return search.fileKeys.has(key) || revealedFiles.has(key);
    }
    return expandedFiles.has(key);
  }

  function toggleFile(key: string) {
    const next = expandedFiles.has(key)
      ? viewState.expandedFiles.filter((entry) => entry !== key)
      : [...viewState.expandedFiles, key];
    onViewState({ ...viewState, expandedFiles: next });
  }

  function toggleItem(id: string) {
    const next = expandedItems.has(id)
      ? viewState.expandedItems.filter((entry) => entry !== id)
      : [...viewState.expandedItems, id];
    onViewState({ ...viewState, expandedItems: next });
  }

  function setAllItems(file: SpecFileInfo, expand: boolean) {
    const ids = new Set(file.items.map((item) => item.id));
    const kept = viewState.expandedItems.filter((id) => !ids.has(id));
    onViewState({
      ...viewState,
      expandedItems: expand ? [...kept, ...ids] : kept,
    });
  }

  function toggleFilter(group: SpecGroup) {
    onViewState({
      ...viewState,
      filters: { ...viewState.filters, [group]: !viewState.filters[group] },
    });
  }

  function copyText(text: string) {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopiedId(text))
      .catch(() => {});
  }

  /** Citation jump (DR-011): expand ancestors, reveal past filters,
   * scroll and flash — never navigate; a dead ID says "not found"
   * next to the clicked link. */
  function jumpTo(linkKey: string, targetId: string) {
    const loc = itemIndex.get(targetId);
    if (!loc) {
      setNotFoundKey(linkKey);
      return;
    }
    if (!viewState.filters[loc.group]) {
      setRevealed((current) => new Set(current).add(targetId));
    }
    setCollapsedDirs((current) => {
      const keys = ancestorKeys(loc.kind, loc.dir);
      if (!keys.some((key) => current.has(key))) return current;
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
    onViewState({
      ...viewState,
      expandedFiles: expandedFiles.has(loc.fileKey)
        ? viewState.expandedFiles
        : [...viewState.expandedFiles, loc.fileKey],
      expandedItems: expandedItems.has(targetId)
        ? viewState.expandedItems
        : [...viewState.expandedItems, targetId],
    });
    setPendingJump(targetId);
  }

  function openRecord(record: SpecRecordInfo) {
    setRecordsOpen(false);
    setReader({ record, loading: true });
    props
      .onReadRecord(record.path)
      .then((markdown) =>
        setReader((current) =>
          current?.record.id === record.id
            ? { record, loading: false, markdown }
            : current,
        ),
      )
      .catch((cause: Error) =>
        setReader((current) =>
          current?.record.id === record.id
            ? { record, loading: false, error: cause.message }
            : current,
        ),
      );
  }

  /** Inline links in item bodies (META-20 citations): item IDs jump
   * in-view, DR/IR links open the records reader, external URLs pass
   * through to the OS browser, and everything else is inert. */
  function onBodyLinkClick(itemId: string, event: ReactMouseEvent) {
    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:\/\//.test(href)) return;
    event.preventDefault();
    const target = linkItemTarget(anchor.textContent ?? "", href);
    if (target && itemIndex.has(target)) {
      jumpTo(`${itemId}:${target}`, target);
      return;
    }
    const record = recordForHref(href, records);
    if (record) openRecord(record);
    // Anything else (dead anchors, sibling spec files, map.md) is
    // inert: no navigation ever happens inside the view.
  }

  // -------------------------------------------------------------------------
  // Records reader swaps the whole view (DR-011).
  // -------------------------------------------------------------------------

  if (reader) {
    return (
      <div
        className="mx-auto flex w-full max-w-3xl flex-col gap-3 overflow-y-auto p-6"
        data-testid="record-reader"
      >
        <div>
          <button
            type="button"
            onClick={() => setReader(null)}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            ← Back
          </button>
        </div>
        <h1 className="text-lg font-semibold">
          {reader.record.id}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {reader.record.title}
          </span>
        </h1>
        {reader.loading ? (
          <div className="text-sm text-neutral-400">
            reading {reader.record.id}…
          </div>
        ) : reader.error ? (
          <div className="flex items-center gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <span className="min-w-0 flex-1">{reader.error}</span>
            <button
              type="button"
              onClick={() => openRecord(reader.record)}
              className="rounded-md border border-red-300 px-2 py-0.5 text-xs hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Markdown text={reader.markdown ?? ""} />
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Empty and degraded whole-view states (DR-011: never blank).
  // -------------------------------------------------------------------------

  const copyCommand = (command: string) => (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
      <code className="min-w-0 flex-1 text-left font-mono text-sm">
        {command}
      </code>
      <button
        type="button"
        aria-label={`Copy command ${command}`}
        onClick={() => copyText(command)}
        className={COPY_BUTTON_CLASS}
      >
        {copiedId === command ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );

  if (!tree.present) {
    if (props.loading) {
      return (
        <div className="m-auto p-6 text-sm text-neutral-400">
          reading specs…
        </div>
      );
    }
    if (props.error) {
      return (
        <div className="m-auto max-w-md p-6">
          <ErrorStrip error={props.error} onRetry={props.onRefresh} />
        </div>
      );
    }
    return (
      <div
        className="m-auto flex max-w-md flex-col gap-3 p-6 text-center text-sm text-neutral-500"
        data-testid="specs-empty"
      >
        <h1 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">
          Specs
        </h1>
        <p>
          This project has no <span className="font-mono">specs/</span>{" "}
          directory yet — it holds the spec packages, compositions, and
          decision records this view navigates.
        </p>
        <p>Scaffold one in the project directory:</p>
        {copyCommand("npx @sublang/spex")}
        {props.onSeedExample ? (
          <div>
            <button
              type="button"
              data-testid="specs-empty-academy"
              onClick={props.onSeedExample}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Try the Academy example
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // The pre-DR-012 user/dev/test layout renders migration guidance
  // instead of a tree (DR-015).
  if (tree.legacy) {
    return (
      <div
        className="m-auto flex max-w-md flex-col gap-3 p-6 text-center text-sm text-neutral-500"
        data-testid="specs-legacy"
      >
        <h1 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">
          This project uses the legacy specs layout
        </h1>
        <p>
          Its <span className="font-mono">specs/</span> tree still holds the
          old <span className="font-mono">user/</span>,{" "}
          <span className="font-mono">dev/</span>, and{" "}
          <span className="font-mono">test/</span> group directories. Update
          it to the packages layout to browse it here:
        </p>
        {copyCommand("npx @sublang/spex scaffold --update")}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main outline view.
  // -------------------------------------------------------------------------

  const renderFile = (file: SpecFileInfo): ReactNode => {
    const key = fileKey(file);
    const expanded = isFileExpanded(key);
    const counts = fileCounts(file);
    const items = visibleFileItems(file, viewState, revealed);
    const dimmed = searching && !expanded;
    const allIds = file.items.map((item) => item.id);
    const allExpanded =
      allIds.length > 0 && allIds.every((id) => expandedItems.has(id));

    return (
      <li key={key} data-testid={`file-${key}`}>
        <div
          className={`flex items-center gap-2 rounded px-1 py-1 ${
            dimmed ? "opacity-50" : ""
          }`}
        >
          <button
            type="button"
            data-testid={`file-toggle-${key}`}
            aria-expanded={expanded}
            onClick={() => toggleFile(key)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <Icon
              name="caretDown"
              className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${
                expanded ? "" : "-rotate-90"
              }`}
            />
            {file.shortForm ? (
              <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {file.shortForm}
              </span>
            ) : null}
            <span className="shrink-0 text-sm font-medium">
              {file.basename}
            </span>
            {file.intent ? (
              <span
                className="truncate text-xs text-neutral-500 dark:text-neutral-400"
                title={file.intent}
              >
                {file.intent}
              </span>
            ) : null}
          </button>
          <span className="flex shrink-0 items-center gap-1">
            {GROUP_ORDER.map((group) => (
              <span
                key={group}
                aria-label={`${counts[group]} ${group} items`}
                className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                  counts[group] > 0 && viewState.filters[group]
                    ? GROUP_CHIP[group]
                    : MUTED_CHIP
                }`}
              >
                {counts[group]} {group}
              </span>
            ))}
          </span>
        </div>
        {expanded ? (
          <div className="ml-[7px] flex flex-col gap-1 border-l border-neutral-200 py-1 pl-4 dark:border-neutral-800">
            {file.notices.map((notice) => (
              <div
                key={notice}
                className="text-[11px] text-amber-600 dark:text-amber-400"
              >
                {notice}
              </div>
            ))}
            {file.error ? (
              <div className="text-[11px] text-amber-600 dark:text-amber-400">
                {file.path}: {file.error}
              </div>
            ) : null}
            {allIds.length > 0 && items.length > 0 ? (
              <div>
                <button
                  type="button"
                  data-testid={`expand-all-${key}`}
                  onClick={() => setAllItems(file, !allExpanded)}
                  className={`text-[11px] ${LINK_CLASS}`}
                >
                  {allExpanded ? "Collapse all" : "Expand all"}
                </button>
              </div>
            ) : null}
            <FileItems
              items={items}
              expandedItems={expandedItems}
              filters={viewState.filters}
              revealed={revealed}
              inbound={inbound}
              copiedId={copiedId}
              flashId={flashId}
              notFoundKey={notFoundKey}
              onToggleItem={toggleItem}
              onCopy={copyText}
              onJump={jumpTo}
              onBodyLinkClick={onBodyLinkClick}
            />
            {items.length === 0 ? (
              <div className="text-xs text-neutral-400">
                {searching
                  ? "no items match the search"
                  : "no items in active groups"}
              </div>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  const renderDir = (dir: SpecDirNode, label?: string): ReactNode => {
    const open = searching || !collapsedDirs.has(dir.path);
    return (
      <li key={dir.path}>
        <button
          type="button"
          aria-expanded={open}
          data-testid={label ? `branch-${dir.path}` : undefined}
          onClick={() =>
            setCollapsedDirs((current) => {
              const next = new Set(current);
              if (next.has(dir.path)) next.delete(dir.path);
              else next.add(dir.path);
              return next;
            })
          }
          className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
            label
              ? "text-neutral-600 dark:text-neutral-300"
              : "text-neutral-500"
          }`}
        >
          <Icon
            name="caretDown"
            className={`h-3 w-3 text-neutral-400 transition-transform ${
              open ? "" : "-rotate-90"
            }`}
          />
          {label ? null : (
            <Icon name="folder" className="h-3.5 w-3.5 text-neutral-400" />
          )}
          {label ?? `${dir.name}/`}
        </button>
        {open ? (
          <ul className="ml-[7px] flex flex-col border-l border-neutral-200 pl-3 dark:border-neutral-800">
            {dir.dirs.map((child) => renderDir(child))}
            {dir.files.map(renderFile)}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Specs</h1>
        <span className="text-xs text-neutral-400">
          {totals.packages} package{totals.packages === 1 ? "" : "s"} ·{" "}
          {totals.compositions} composition
          {totals.compositions === 1 ? "" : "s"} · {totals.items} items
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Refresh specs"
            title="Re-read the specs/ tree"
            disabled={props.loading}
            onClick={props.onRefresh}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Icon name="refresh" />
          </button>
          <span className="text-xs text-neutral-400">
            {props.loading
              ? "reading…"
              : `read ${relativeReadTime(tree.readAt, now)}`}
          </span>
        </span>
      </div>

      {props.error ? (
        <ErrorStrip error={props.error} onRetry={props.onRefresh} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {GROUP_ORDER.map((group) => {
          const on = viewState.filters[group];
          return (
            <button
              key={group}
              type="button"
              data-testid={`filter-${group}`}
              aria-pressed={on}
              title={
                on
                  ? `Hide ${group} items`
                  : `Show ${group} items`
              }
              onClick={() => toggleFilter(group)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                on
                  ? `border-transparent ${GROUP_CHIP[group]}`
                  : "border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500"
              }`}
            >
              {FILTER_LABEL[group]}{" "}
              <span
                aria-label={`${totals.perGroup[group]} ${group} items`}
                className={on ? "font-semibold" : "opacity-60"}
              >
                {totals.perGroup[group]}
              </span>
            </button>
          );
        })}
        <input
          type="search"
          value={viewState.search}
          onChange={(event) =>
            onViewState({ ...viewState, search: event.target.value })
          }
          placeholder="Filter items — ID or text…"
          aria-label="Filter items by ID or text"
          className="min-w-40 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
        />
        {searching ? (
          <span data-testid="match-count" className="text-xs text-neutral-500">
            {search.count} {search.count === 1 ? "match" : "matches"}
          </span>
        ) : null}
      </div>

      {tree.notices.length > 0 ? (
        <div className="text-xs text-neutral-400">
          {tree.notices.join(" · ")}
        </div>
      ) : null}

      <ul className="flex flex-col">
        {branches.map((branch) => renderDir(branch.root, branch.label))}
      </ul>
      {tree.files.length === 0 ? (
        <div className="text-sm text-neutral-400">
          specs/ is present but holds no spec files yet.
        </div>
      ) : null}

      <div className="relative mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-800">
        <button
          type="button"
          data-testid="records-toggle"
          aria-expanded={recordsOpen}
          onClick={() => setRecordsOpen((open) => !open)}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          {tree.decisions.length} decisions · {tree.iterations.length}{" "}
          iterations
        </button>
        {recordsOpen ? (
          <div
            data-testid="records-popover"
            role="dialog"
            aria-label="Decision and iteration records"
            className="absolute bottom-full left-0 z-10 mb-1 flex max-h-80 w-96 max-w-full flex-col overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            {records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => openRecord(record)}
                className="flex items-baseline gap-2 rounded px-2 py-1 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="shrink-0 font-mono text-xs font-semibold text-neutral-500">
                  {record.id}
                </span>
                <span className="min-w-0 flex-1 truncate">{record.title}</span>
              </button>
            ))}
            {records.length === 0 ? (
              <div className="px-2 py-1 text-xs text-neutral-400">
                no records yet
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ErrorStrip({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      <span className="min-w-0 flex-1">{error}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-red-300 px-2 py-0.5 text-xs hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
      >
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One expanded file's items in document order, grouped under their
// verbatim `##` section headings with `###` topics as nested labels
// whenever they change between consecutive items (DR-011/DR-015 —
// never sorted by ID; META-12 makes numbering non-positional).
// ---------------------------------------------------------------------------

function FileItems({
  items,
  expandedItems,
  filters,
  revealed,
  inbound,
  copiedId,
  flashId,
  notFoundKey,
  onToggleItem,
  onCopy,
  onJump,
  onBodyLinkClick,
}: {
  items: SpecItemInfo[];
  expandedItems: ReadonlySet<string>;
  filters: SpecViewState["filters"];
  revealed: ReadonlySet<string>;
  inbound: Map<string, string[]>;
  copiedId?: string;
  flashId?: string;
  notFoundKey?: string;
  onToggleItem: (id: string) => void;
  onCopy: (id: string) => void;
  onJump: (linkKey: string, targetId: string) => void;
  onBodyLinkClick: (itemId: string, event: ReactMouseEvent) => void;
}) {
  if (items.length === 0) return null;
  const rows: ReactNode[] = [];
  let previousSection: string | undefined;
  let previousTopic: string | undefined;
  for (const item of items) {
    if (item.section && item.section !== previousSection) {
      rows.push(
        <li
          key={`section-${item.id}`}
          aria-hidden="true"
          className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
        >
          {item.section}
        </li>,
      );
      previousTopic = undefined;
    }
    previousSection = item.section || previousSection;
    if (item.topic && item.topic !== previousTopic) {
      rows.push(
        <li
          key={`topic-${item.id}`}
          aria-hidden="true"
          className="ml-2 text-[11px] font-medium text-neutral-400"
        >
          {item.topic}
        </li>,
      );
    }
    previousTopic = item.topic;
    rows.push(
      <ItemRow
        key={item.id}
        item={item}
        expanded={expandedItems.has(item.id)}
        despiteFilter={!filters[item.group] && revealed.has(item.id)}
        backlinks={inbound.get(item.id) ?? []}
        copied={copiedId === item.id}
        flashed={flashId === item.id}
        notFoundKey={notFoundKey}
        onToggle={() => onToggleItem(item.id)}
        onCopy={() => onCopy(item.id)}
        onJump={onJump}
        onBodyLinkClick={onBodyLinkClick}
      />,
    );
  }
  return <ul className="flex flex-col">{rows}</ul>;
}

function ItemRow({
  item,
  expanded,
  despiteFilter,
  backlinks,
  copied,
  flashed,
  notFoundKey,
  onToggle,
  onCopy,
  onJump,
  onBodyLinkClick,
}: {
  item: SpecItemInfo;
  expanded: boolean;
  despiteFilter: boolean;
  backlinks: string[];
  copied: boolean;
  flashed: boolean;
  notFoundKey?: string;
  onToggle: () => void;
  onCopy: () => void;
  onJump: (linkKey: string, targetId: string) => void;
  onBodyLinkClick: (itemId: string, event: ReactMouseEvent) => void;
}) {
  const group = item.group;
  // Cites rows render on test items; external/internal items carry
  // the computed inbound "cited by" backlinks instead (DR-011 as
  // amended by DR-015).
  const showCites = group === "test" && item.cites.length > 0;
  const showBacklinks = group !== "test" && backlinks.length > 0;

  const citation = (target: string) => {
    const linkKey = `${item.id}:${target}`;
    return (
      <span key={target} className="inline-flex items-center gap-1">
        <button
          type="button"
          data-testid={`link-${item.id}-${target}`}
          onClick={() => onJump(linkKey, target)}
          className={`font-mono text-xs ${LINK_CLASS}`}
        >
          {target}
        </button>
        {notFoundKey === linkKey ? (
          <span className="text-[11px] text-neutral-400">not found</span>
        ) : null}
      </span>
    );
  };

  return (
    <li
      id={itemDomId(item.id)}
      data-testid={`item-${item.id}`}
      className={`rounded ${
        flashed ? "ring-2 ring-brand-400 dark:ring-brand-500" : ""
      }`}
    >
      <div className="flex items-center gap-2 py-0.5">
        <button
          type="button"
          aria-label={`Copy ${item.id}`}
          title={`Copy ${item.id}`}
          onClick={onCopy}
          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${GROUP_CHIP[group]}`}
        >
          {item.id}
          {copied ? <span aria-hidden="true"> ✓</span> : null}
        </button>
        <span className={`shrink-0 text-[11px] ${GROUP_TEXT[group]}`}>
          {group}
        </span>
        <button
          type="button"
          data-testid={`item-toggle-${item.id}`}
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          <span className="truncate" title={item.firstLine}>
            {item.firstLine}
          </span>
          {showCites ? (
            <span className="shrink-0 text-[11px] text-neutral-400">
              → cites {item.cites.length}
            </span>
          ) : null}
          {showBacklinks ? (
            <span
              className="shrink-0 truncate text-[11px] text-neutral-400"
              title={`Cited by ${backlinks.join(", ")}`}
            >
              ✓ cited by {backlinks.join(", ")}
            </span>
          ) : null}
        </button>
        {despiteFilter ? (
          <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            shown despite filter
          </span>
        ) : null}
      </div>
      {expanded ? (
        <div className="mb-1 ml-2 flex flex-col gap-1 border-l border-neutral-200 pl-3 dark:border-neutral-800">
          <div
            className="overflow-x-auto"
            onClick={(event) => onBodyLinkClick(item.id, event)}
          >
            <Markdown text={item.text} />
          </div>
          {showCites ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-neutral-400">Cites:</span>
              {item.cites.map(citation)}
            </div>
          ) : null}
          {showBacklinks ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-neutral-400">Cited by:</span>
              {backlinks.map(citation)}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

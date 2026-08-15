// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Per-project spec view (SPECV; DR-011 as amended by DR-015): a
// read-only, left-rooted collapsible outline of the project's specs/
// packages collection — collection directories → file nodes → items in
// document order under their section headings — with group filters,
// filter-as-you-type search, plain citation rows and backlinks
// (SPECV-19), citation jumps with a one-step return chip, a records
// reader that also serves meta.md, and one polite live region for the
// transient outcomes (DR-010 §5–§7). Pure props: the host wires
// specs.get / specs.read and persists the lifted SpecViewState per
// project.

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
import { SpecGraph } from "./SpecGraph.js";

import {
  ancestorKeys,
  buildCitationModel,
  buildDirTree,
  buildItemIndex,
  citationSummary,
  fileCounts,
  groupOf,
  initialSpecViewState,
  itemMatches,
  linkItemTargets,
  normalizeSpecViewState,
  recordForHref,
  relativeReadTime,
  searchDigest,
  treeCounts,
  visibleFileItems,
  GROUP_ORDER,
  type CitationModel,
  type ItemLocation,
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

/** meta.md read through the records reader (specs.read serves any
 * specs/-relative markdown path), so the law the tree is read by is
 * reachable from the view. */
const META_RECORD: SpecRecordInfo = {
  id: "meta",
  title: "meta.md",
  path: "meta.md",
};

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
  /** Fetch one record's markdown (specs.read). */
  onReadRecord: (path: string) => Promise<string>;
  /** Seed the Academy example into this project (DR-015); the empty
   * state offers it only when wired. */
  onSeedExample?: () => void;
  /** Failure from the last seed attempt, shown in the empty state. */
  seedError?: string;
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
    intents: [],
    notices: [],
    readAt: 0,
  };

  // Branch/directory collapse is cosmetic and local: levels default
  // open.
  // Graph is the map projection of the same tree (spec-view-33):
  // cosmetic, local, never persisted.
  const [graphMode, setGraphMode] = useState(false);
  const [collapsedDirs, setCollapsedDirs] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // Items revealed by a citation jump despite their group filter or an
  // active search that would hide them.
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  // Per-file chevron overrides while a search computes expansion;
  // cleared with the search so expandedFiles is never written
  // mid-search.
  const [searchOverrides, setSearchOverrides] = useState<
    ReadonlyMap<string, boolean>
  >(new Map());
  // Jump origins, newest last: every in-view jump pushes its citing
  // item so the floating chip can walk back one level at a time.
  const [jumpOrigins, setJumpOrigins] = useState<readonly string[]>([]);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [reader, setReader] = useState<ReaderState | null>(null);
  const [pendingJump, setPendingJump] = useState<string>();
  const [copiedId, setCopiedId] = useTransient(1500);
  const [copyFailedId, setCopyFailedId] = useTransient(2000);
  const [notFoundKey, setNotFoundKey] = useTransient(2000);
  const [flashId, setFlashId] = useTransient(1200);
  // The one polite live region's current announcement (DR-010 §7).
  const [liveNote, setLiveNote] = useTransient(3000);
  const [now, setNow] = useState(() => Date.now());

  const readerBackRef = useRef<HTMLButtonElement | null>(null);
  // DOM id that takes focus back when the reader closes (§6).
  const readerReturnId = useRef<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const recordsToggleRef = useRef<HTMLButtonElement | null>(null);

  const outlineRoot = useMemo(() => buildDirTree(tree.files), [tree]);
  const itemIndex = useMemo(() => buildItemIndex(tree.files), [tree]);
  // Backlinks and cross-file per-file citation rollups (SPECV-19).
  const citations = useMemo(() => buildCitationModel(tree.files), [tree]);
  const totals = useMemo(() => treeCounts(tree.files), [tree]);
  const records = useMemo(
    () => [...tree.decisions, ...tree.intents],
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

  // The records popover is at-hand and keyboard-first (DR-010 §6):
  // Escape or an outside pointerdown closes it, its first entry takes
  // focus on open, and any close hands focus back to the toggle — a
  // disconnected toggle means the reader took over and owns focus.
  useEffect(() => {
    if (!recordsOpen) return;
    popoverRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRecordsOpen(false);
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (popoverRef.current?.contains(target)) return;
      if (recordsToggleRef.current?.contains(target)) return;
      setRecordsOpen(false);
    };
    window.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
      if (recordsToggleRef.current?.isConnected) {
        recordsToggleRef.current.focus();
      }
    };
  }, [recordsOpen]);

  // The reader takes focus on its Back control when it opens and hands
  // focus back to its invoker's DOM id on close (§6: never strand).
  const readerPath = reader?.record.path;
  useEffect(() => {
    if (readerPath) {
      readerBackRef.current?.focus();
      return;
    }
    const returnId = readerReturnId.current;
    if (!returnId) return;
    readerReturnId.current = null;
    document.getElementById(returnId)?.focus();
  }, [readerPath]);

  // After a citation jump commits its expansion, scroll the target
  // into view, move focus onto its row (§6), and flash it.
  useEffect(() => {
    if (!pendingJump) return;
    const element = document.getElementById(itemDomId(pendingJump));
    if (element && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "center" });
    }
    element?.focus({ preventScroll: true });
    setFlashId(pendingJump);
    setPendingJump(undefined);
  }, [pendingJump, setFlashId]);

  // Chevron overrides are search-scoped: they die with the search so a
  // cleared box restores the persisted expansion untouched.
  useEffect(() => {
    if (searching) return;
    setSearchOverrides((current) => (current.size > 0 ? new Map() : current));
  }, [searching]);

  /** A file is effectively expanded while searching when it has
   * matches or reveals, unless a chevron overrode that (computed —
   * expandedFiles is not mutated, so clearing the search restores the
   * prior expansion). */
  function isFileExpanded(key: string): boolean {
    if (searching) {
      const override = searchOverrides.get(key);
      if (override !== undefined) return override;
      return search.fileKeys.has(key) || revealedFiles.has(key);
    }
    return expandedFiles.has(key);
  }

  function toggleFile(key: string) {
    if (searching) {
      const next = new Map(searchOverrides);
      next.set(key, !isFileExpanded(key));
      setSearchOverrides(next);
      return;
    }
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
    // A filter coming back on retires that group's jump reveals — the
    // "shown despite filter" state never outlives the filtering that
    // earned it.
    if (!viewState.filters[group]) {
      setRevealed((current) => {
        const kept = [...current].filter(
          (id) => itemIndex.get(id)?.group !== group,
        );
        return kept.length === current.size ? current : new Set(kept);
      });
    }
    onViewState({
      ...viewState,
      filters: { ...viewState.filters, [group]: !viewState.filters[group] },
    });
  }

  /** Copy with visible success and failure (§3, §5): the tick or the
   * failure note lands on the invoking control and in the live
   * region. */
  function copyText(text: string) {
    const write = navigator.clipboard?.writeText(text);
    if (!write) {
      setCopyFailedId(text);
      setLiveNote(`Copy failed for ${text}`);
      return;
    }
    void write
      .then(() => {
        setCopiedId(text);
        setLiveNote(`Copied ${text}`);
      })
      .catch(() => {
        setCopyFailedId(text);
        setLiveNote(`Copy failed for ${text}`);
      });
  }

  /** Shared jump landing: expand ancestors, reveal a target hidden by
   * its group filter or the active search, then scroll/focus/flash via
   * pendingJump. False when the target is not in the tree. */
  function revealTarget(targetId: string): boolean {
    const loc = itemIndex.get(targetId);
    if (!loc) return false;
    const hidden =
      !viewState.filters[loc.group] ||
      (searching && !itemMatches(loc.item, viewState.search));
    if (hidden) {
      setRevealed((current) => new Set(current).add(targetId));
    }
    setCollapsedDirs((current) => {
      const keys = ancestorKeys(loc.dir);
      if (!keys.some((key) => current.has(key))) return current;
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
    // A chevron-collapsed file reopens for the landing.
    if (searching && searchOverrides.get(loc.fileKey) === false) {
      const next = new Map(searchOverrides);
      next.set(loc.fileKey, true);
      setSearchOverrides(next);
    }
    onViewState({
      ...viewState,
      // While searching, file expansion is computed from matches and
      // reveals — expandedFiles is never written mid-search.
      expandedFiles:
        searching || expandedFiles.has(loc.fileKey)
          ? viewState.expandedFiles
          : [...viewState.expandedFiles, loc.fileKey],
      expandedItems: expandedItems.has(targetId)
        ? viewState.expandedItems
        : [...viewState.expandedItems, targetId],
    });
    setLiveNote(
      hidden
        ? `Jumped to ${targetId} — shown despite filter`
        : `Jumped to ${targetId}`,
    );
    setPendingJump(targetId);
    return true;
  }

  /** Citation jump (DR-011): land on the target, remembering the
   * citing item so the floating chip can walk back — never navigate;
   * a dead ID says "not found" next to the clicked link. */
  function jumpTo(linkKey: string, targetId: string, originId: string) {
    if (!revealTarget(targetId)) {
      setNotFoundKey(linkKey);
      setLiveNote(`${targetId} not found`);
      return;
    }
    setJumpOrigins((stack) => [...stack, originId]);
  }

  /** The floating chip pops one origin and lands back on it. */
  function popJumpOrigin() {
    const origin = jumpOrigins[jumpOrigins.length - 1];
    if (!origin) return;
    setJumpOrigins((stack) => stack.slice(0, -1));
    revealTarget(origin);
  }

  /** Swap to the records reader; returnFocusId names the DOM id that
   * takes focus back when the reader closes (§6) — absent on the
   * reader's own Retry so the original invoker is kept. */
  function openRecord(record: SpecRecordInfo, returnFocusId?: string) {
    if (returnFocusId) readerReturnId.current = returnFocusId;
    setRecordsOpen(false);
    setLiveNote(`Opened ${record.id}`);
    setReader({ record, loading: true });
    props
      .onReadRecord(record.path)
      .then((markdown) =>
        setReader((current) =>
          current?.record.path === record.path
            ? { record, loading: false, markdown }
            : current,
        ),
      )
      .catch((cause: Error) =>
        setReader((current) =>
          current?.record.path === record.path
            ? { record, loading: false, error: cause.message }
            : current,
        ),
      );
  }

  /** Inline links in item bodies (META-20 citations): item IDs jump
   * in-view, DR/IR and meta.md links open the records reader, external
   * URLs pass through to the OS browser, and everything else is
   * inert. */
  function onBodyLinkClick(itemId: string, event: ReactMouseEvent) {
    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:\/\//.test(href)) return;
    event.preventDefault();
    const candidates = linkItemTargets(anchor.textContent ?? "", href);
    const target = candidates.find((c) => itemIndex.has(c)) ?? candidates[0];
    if (target && itemIndex.has(target)) {
      jumpTo(`${itemId}:${target}`, target, itemId);
      return;
    }
    // The citing file's specs/-relative path anchors the href
    // resolution. An href resolving to exactly the tree's meta.md
    // opens the synthetic meta record.
    const sourcePath = itemIndex.get(itemId)?.sourcePath ?? "";
    const record = recordForHref(sourcePath, href, [...records, META_RECORD]);
    if (record) {
      openRecord(record, itemDomId(itemId));
      return;
    }
    // A citation-shaped link that is neither a live item nor a
    // record gets the SPECV-6 "not found" note; jumpTo owns that
    // path. Record links are tried first because their label ("DR-011")
    // is citation-shaped too. The body: prefix keeps the note off
    // the identically keyed citation rows.
    if (target) {
      jumpTo(`body:${itemId}:${target}`, target, itemId);
      return;
    }
    // Anything else (sibling spec files, map.md) is inert: no
    // navigation ever happens inside the view.
  }

  // One persistent polite live region (DR-010 §7) narrates the
  // transient outcomes: copies, jump landings, reader opens.
  const liveRegion = (
    <div
      aria-live="polite"
      role="status"
      className="sr-only"
      data-testid="specv-live"
    >
      {liveNote}
    </div>
  );

  // -------------------------------------------------------------------------
  // Records reader swaps the whole view (DR-011).
  // -------------------------------------------------------------------------

  if (reader) {
    return (
      <div
        className="mx-auto flex w-full max-w-3xl flex-col gap-3 overflow-y-auto p-6"
        data-testid="record-reader"
      >
        {liveRegion}
        <div>
          <button
            ref={readerBackRef}
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
        {copiedId === command
          ? "Copied ✓"
          : copyFailedId === command
            ? "Copy failed"
            : "Copy"}
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
        {liveRegion}
        <h1 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">
          Specs
        </h1>
        <p>
          This project has no <span className="font-mono">specs/</span>{" "}
          directory yet — it holds the spec packages and the decision and
          intent records this view navigates.
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
        {props.seedError ? (
          <p
            className="text-sm text-red-600 dark:text-red-400"
            data-testid="specs-empty-seed-error"
            role="alert"
          >
            {props.seedError}
          </p>
        ) : null}
      </div>
    );
  }

  // A legacy layout — user/dev/test group directories or a
  // compositions/ collection — renders migration guidance instead of
  // a tree (SPECV-18).
  if (tree.legacy) {
    return (
      <div
        className="m-auto flex max-w-md flex-col gap-3 p-6 text-center text-sm text-neutral-500"
        data-testid="specs-legacy"
      >
        {liveRegion}
        <h1 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">
          This project uses a legacy specs layout
        </h1>
        <p>
          Its <span className="font-mono">specs/</span> tree still holds
          directories from an earlier layout — the{" "}
          <span className="font-mono">user/</span>,{" "}
          <span className="font-mono">dev/</span>,{" "}
          <span className="font-mono">test/</span>, or{" "}
          <span className="font-mono">items/</span> groups, or an{" "}
          <span className="font-mono">interactions/</span> or{" "}
          <span className="font-mono">compositions/</span> collection.
          Run this to refresh the spec law and print a migration prompt;
          an AI agent applies it, and this view opens once the tree is
          migrated:
        </p>
        {copyCommand("npx @sublang/spex scaffold --update")}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main outline view.
  // -------------------------------------------------------------------------

  const renderFile = (file: SpecFileInfo): ReactNode => {
    const key = file.key;
    const expanded = isFileExpanded(key);
    const counts = fileCounts(file);
    const items = visibleFileItems(file, viewState, revealed);
    const dimmed = searching && !expanded;
    const allIds = file.items.map((item) => item.id);
    const allExpanded =
      allIds.length > 0 && allIds.every((id) => expandedItems.has(id));
    // Cross-file citation rollup, carried on every file row —
    // collapsed included — so the outline reads as a dependency map at
    // a glance; intra-file wiring never counts (SPECV-19).
    const fileCites = citations.rollups.get(key);
    const rollup = fileCites
      ? citationSummary(fileCites.out, fileCites.in)
      : undefined;

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
            aria-label={`Toggle ${file.basename}`}
            onClick={() => toggleFile(key)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
            <Icon
              name="caretDown"
              className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${
                expanded ? "" : "-rotate-90"
              }`}
            />
            {/* The package identifier is the basename (META-10). */}
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {file.basename}
            </span>
            {/* Collapsed keeps the truncated intent; expanded yields
             * to the full prose block below. */}
            {file.intent && !expanded ? (
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
            {rollup ? (
              <span
                data-testid={`rollup-${key}`}
                aria-label={`Citations: ${rollup}`}
                className="ml-1 text-[11px] text-neutral-400"
              >
                {rollup}
              </span>
            ) : null}
          </span>
        </div>
        {expanded ? (
          <div className="ml-[7px] flex flex-col gap-1 border-l border-neutral-200 py-1 pl-4 dark:border-neutral-800">
            {file.intent ? (
              <p
                data-testid={`intent-${key}`}
                className="max-w-prose text-xs text-neutral-500 dark:text-neutral-400"
              >
                {file.intent}
              </p>
            ) : null}
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
                  aria-label={`${allExpanded ? "Collapse" : "Expand"} all items in ${file.basename}`}
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
              search={viewState.search}
              revealed={revealed}
              citations={citations}
              itemIndex={itemIndex}
              copiedId={copiedId}
              copyFailedId={copyFailedId}
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
          aria-label={`Toggle ${label ?? `${dir.name}/`}`}
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
      {liveRegion}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Specs</h1>
        <span className="text-xs text-neutral-400">
          {totals.packages} package{totals.packages === 1 ? "" : "s"} ·{" "}
          {totals.items} items
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
        <button
          type="button"
          data-testid="graph-toggle"
          aria-pressed={graphMode}
          title={graphMode ? "Show the outline" : "Show the citation graph"}
          onClick={() => setGraphMode((mode) => !mode)}
          className={`rounded border px-2 py-1 text-xs ${
            graphMode
              ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
              : "border-neutral-300 text-neutral-500 hover:text-neutral-700 dark:border-neutral-700 dark:hover:text-neutral-300"
          }`}
        >
          {graphMode ? "Tree" : "Graph"}
        </button>
      </div>

      {tree.notices.length > 0 ? (
        <div className="text-xs text-neutral-400">
          {tree.notices.join(" · ")}
        </div>
      ) : null}

      {graphMode && tree.files.length > 0 ? (
        <SpecGraph
          files={tree.files}
          expandedKeys={expandedFiles}
          onOpenFile={(fileKey) => {
            setGraphMode(false);
            if (!expandedFiles.has(fileKey)) toggleFile(fileKey);
          }}
        />
      ) : (
        <ul className="flex flex-col">
          {tree.files.length > 0
            ? renderDir(outlineRoot, outlineRoot.name)
            : null}
        </ul>
      )}
      {tree.files.length === 0 ? (
        <div className="text-sm text-neutral-400">
          specs/ is present but holds no spec files yet.
        </div>
      ) : null}

      <div className="relative mt-2 flex items-center gap-1.5 border-t border-neutral-200 pt-2 text-xs text-neutral-500 dark:border-neutral-800">
        <button
          ref={recordsToggleRef}
          id="specv-records-toggle"
          type="button"
          data-testid="records-toggle"
          aria-expanded={recordsOpen}
          onClick={() => setRecordsOpen((open) => !open)}
          className="hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          {tree.decisions.length} decisions · {tree.intents.length}{" "}
          intents
        </button>
        <span aria-hidden="true">·</span>
        {/* meta.md opens directly — the popover stays records-only. */}
        <button
          id="specv-records-meta"
          type="button"
          data-testid="records-meta"
          onClick={() => openRecord(META_RECORD, "specv-records-meta")}
          className="hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          meta
        </button>
        {recordsOpen ? (
          <div
            ref={popoverRef}
            data-testid="records-popover"
            role="dialog"
            aria-label="Decision and intent records"
            className="absolute bottom-full left-0 z-10 mb-1 flex max-h-80 w-96 max-w-full flex-col overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            {records.map((record) => (
              <button
                key={record.path}
                type="button"
                onClick={() => openRecord(record, "specv-records-toggle")}
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
      {jumpOrigins.length > 0 ? (
        <button
          type="button"
          data-testid="jump-back"
          onClick={popJumpOrigin}
          className="sticky bottom-2 z-10 self-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs text-neutral-600 shadow-md hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          back to {jumpOrigins[jumpOrigins.length - 1]}
        </button>
      ) : null}
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
  search,
  revealed,
  citations,
  itemIndex,
  copiedId,
  copyFailedId,
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
  search: string;
  revealed: ReadonlySet<string>;
  citations: CitationModel;
  itemIndex: Map<string, ItemLocation>;
  copiedId?: string;
  copyFailedId?: string;
  flashId?: string;
  notFoundKey?: string;
  onToggleItem: (id: string) => void;
  onCopy: (id: string) => void;
  onJump: (linkKey: string, targetId: string, originId: string) => void;
  onBodyLinkClick: (itemId: string, event: ReactMouseEvent) => void;
}) {
  if (items.length === 0) return null;
  const searching = search.trim().length > 0;
  const rows: ReactNode[] = [];
  let previousSection: string | undefined;
  let previousTopic: string | undefined;
  for (const item of items) {
    if (item.section && item.section !== previousSection) {
      rows.push(
        <li
          key={`section-${item.id}`}
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
        despiteFilter={
          revealed.has(item.id) &&
          (!filters[item.group] || (searching && !itemMatches(item, search)))
        }
        inbound={citations.inbound.get(item.id) ?? []}
        itemIndex={itemIndex}
        copied={copiedId === item.id}
        copyFailed={copyFailedId === item.id}
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
  inbound,
  itemIndex,
  copied,
  copyFailed,
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
  /** Citing item IDs in encounter order (SPECV-19 backlinks). */
  inbound: string[];
  itemIndex: Map<string, ItemLocation>;
  copied: boolean;
  copyFailed: boolean;
  flashed: boolean;
  notFoundKey?: string;
  onToggle: () => void;
  onCopy: () => void;
  onJump: (linkKey: string, targetId: string, originId: string) => void;
  onBodyLinkClick: (itemId: string, event: ReactMouseEvent) => void;
}) {
  const group = item.group;
  // The outbound row lists the item's citations in document order;
  // the backlink group renders collapsed by count and expands to jump
  // links (SPECV-19). Whether it is open is cosmetic and local.
  const [inboundOpen, setInboundOpen] = useState(false);
  // Collapsed rows keep a muted citation-count hint (SPECV-3) —
  // complete in both directions, unlike the cross-file file rollup.
  const hint = citationSummary(item.cites.length, inbound.length);

  // Citation entries color by the TARGET's group and preview it in a
  // title tooltip; a dead target keeps the neutral link style. The
  // padding/negative-margin pair grows the hit target past 24px
  // without changing the row's visual density (DR-010 §7).
  const citation = (target: string) => {
    const linkKey = `${item.id}:${target}`;
    const targetGroup = groupOf(itemIndex, target);
    const targetItem = itemIndex.get(target)?.item;
    return (
      <span key={target} className="inline-flex items-center gap-1">
        <button
          type="button"
          data-testid={`link-${item.id}-${target}`}
          title={
            targetItem ? `${target} — ${targetItem.firstLine}` : undefined
          }
          onClick={() => onJump(linkKey, target, item.id)}
          className={`-mx-1 -my-1 rounded px-1 py-1 font-mono text-xs hover:underline ${
            targetGroup ? GROUP_TEXT[targetGroup] : LINK_CLASS
          }`}
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
      // Jump landings move focus here (DR-010 §6).
      tabIndex={-1}
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
          className={`shrink-0 cursor-pointer rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold hover:ring-1 hover:ring-neutral-400 dark:hover:ring-neutral-500 ${GROUP_CHIP[group]}`}
        >
          {item.id}
          {copied ? <span aria-hidden="true"> ✓</span> : null}
        </button>
        {copyFailed ? (
          <span className="shrink-0 text-[11px] text-red-600 dark:text-red-400">
            copy failed
          </span>
        ) : null}
        <span className={`shrink-0 text-[11px] ${GROUP_TEXT[group]}`}>
          {group}
        </span>
        <button
          type="button"
          data-testid={`item-toggle-${item.id}`}
          aria-expanded={expanded}
          aria-label={`${item.id}: ${item.firstLine}`}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          <span className="truncate" title={item.firstLine}>
            {item.firstLine}
          </span>
          {hint ? (
            <span className="shrink-0 text-[11px] text-neutral-400">
              {hint}
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
          {notFoundKey?.startsWith(`body:${item.id}:`) ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="font-mono text-neutral-500">
                {notFoundKey.slice(`body:${item.id}:`.length)}
              </span>
              <span className="text-[11px] text-neutral-400">not found</span>
            </div>
          ) : null}
          {item.cites.length > 0 ? (
            <div
              data-testid={`cites-${item.id}`}
              className="flex flex-wrap items-center gap-1.5 text-xs"
            >
              <span className="text-neutral-400">cites</span>
              {item.cites.map(citation)}
            </div>
          ) : null}
          {inbound.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                data-testid={`inbound-${item.id}`}
                aria-expanded={inboundOpen}
                onClick={() => setInboundOpen((open) => !open)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                cited by {inbound.length}
              </button>
              {inboundOpen ? inbound.map(citation) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

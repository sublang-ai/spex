// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Per-project spec view (SPECV; DR-011 as amended by DR-015 and
// DR-043): a left-rooted collapsible outline of the project's specs/
// packages collection — collection directories → file nodes → items in
// document order under their section headings — with group filters,
// filter-as-you-type search, plain citation rows and backlinks
// (SPECV-19), citation jumps with a one-step return chip, a records
// reader that also serves meta.md, a whole-file editor with a preview
// (spec-view-48), and one polite live region for the transient
// outcomes (DR-010 §5–§7). Pure props: the host wires specs.get /
// specs.read / specs.write and persists the lifted SpecViewState per
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
import { SpecEditor } from "./SpecEditor.js";
import { SpecGraph } from "./SpecGraph.js";

import {
  ancestorKeys,
  buildCitationModel,
  buildDirTree,
  buildItemIndex,
  citationSummary,
  fileCounts,
  fileKeyOf,
  groupOf,
  headingLine,
  initialSpecViewState,
  isRecordPath,
  itemMatches,
  linkItemTargets,
  normalizeSpecViewState,
  recordForHref,
  relativeReadTime,
  searchDigest,
  treeCounts,
  visibleFileItems,
  GROUP_ORDER,
  MAX_GRAPH_WIDTH,
  MIN_GRAPH_WIDTH,
  type CitationModel,
  type ItemLocation,
  type SpecDirNode,
  type SpecGroup,
  type SpecViewState,
} from "../lib/spec-view-model.js";
import { Icon } from "./Icon.js";
import { Markdown } from "./Markdown.js";
import { RecordRow } from "./RecordRow.js";

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
  "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500";

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

/** The tree's own index, promoted beside meta (spec-view-7). */
const MAP_RECORD: SpecRecordInfo = {
  id: "map",
  title: "map.md",
  path: "map.md",
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

/** One file as specs.read serves it: its text with the version token
 * a save must carry (spec-view-16); no token means the save
 * overwrites. */
export interface SpecRead {
  markdown: string;
  version?: string;
}

export interface SpecViewProps {
  /** The project whose tree this is; names the surface, since "Specs"
   * is already the tab's own word. */
  projectName?: string;
  /** Absent while the first specs.get is still in flight. */
  tree?: SpecTreeState;
  /** First load in flight. */
  loading?: boolean;
  /** Load failure; rendered with a Retry (DR-010 §5). */
  error?: string;
  onRefresh: () => void;
  /** Fetch one file's text (specs.read) — a bare string is a read
   * that carries no token. */
  onReadRecord: (path: string) => Promise<string | SpecRead>;
  /** Write one file's whole text under the token its read handed out
   * (spec-view-47); absent, the view offers no Edit control. */
  onWriteSpec?: (
    path: string,
    content: string,
    baseVersion?: string,
  ) => Promise<{ version: string }>;
  /** Seed the Academy example into this project (DR-015); the empty
   * state offers it only when wired. */
  onSeedExample?: () => void;
  /** Failure from the last seed attempt, shown in the empty state. */
  seedError?: string;
  viewState: SpecViewState;
  onViewState: (next: SpecViewState) => void;
  /** A record another surface asked to read — the Dashboard sending
   * an intent home, since the reader lives here (dashboard-24). */
  openRecordPath?: string;
  onRecordOpened?: () => void;
}

type ReaderState = {
  record: SpecRecordInfo;
  loading: boolean;
  markdown?: string;
  /** The token the read handed out, carried into an edit. */
  version?: string;
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
  // Two projections of one tree (spec-view-20): the outline is
  // permanent and the graph joins it under one persisted toggle. The
  // selection is shared, so both projections point at one file.
  const [graphSelection, setGraphSelection] = useState<string | null>(null);
  // The split's live fraction while the divider is under the pointer;
  // committed to the view state on release.
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [dragSplit, setDragSplit] = useState<number | null>(null);
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

  // The editor (spec-view-48): its draft is lifted state
  // (spec-view-51); what is local here is a failed open, shown beside
  // the control that asked, and where focus returns when it closes.
  const canEdit = Boolean(props.onWriteSpec);
  const editor = canEdit ? viewState.editor : undefined;
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;
  const [openFailure, setOpenFailure] = useState<{
    anchor: string;
    message: string;
  } | null>(null);
  // "reader", or the file key whose Edit control takes focus back.
  const editorReturn = useRef<string | null>(null);

  const outlineRoot = useMemo(() => buildDirTree(tree.files), [tree]);
  const itemIndex = useMemo(() => buildItemIndex(tree.files), [tree]);
  // Backlinks and cross-file per-file citation rollups (SPECV-19).
  const citations = useMemo(() => buildCitationModel(tree.files), [tree]);
  const totals = useMemo(() => treeCounts(tree.files), [tree]);
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

  // A record requested from elsewhere opens here, where the reader
  // lives (spec-view-7, dashboard-24).
  const requestedRecord = props.openRecordPath;
  const onRecordOpened = props.onRecordOpened;
  const treeLoaded = props.tree !== undefined;
  useEffect(() => {
    // The request outlives a tree still in flight: it is answered
    // once a loaded tree can name the record, or drops when a loaded
    // tree lacks it — never before.
    if (!requestedRecord || !treeLoaded) return;
    const record = [...tree.decisions, ...tree.intents].find(
      (entry) => entry.path === requestedRecord,
    );
    if (record) openRecord(record);
    else setLiveNote(`${requestedRecord} is not in the tree`);
    onRecordOpened?.();
    // openRecord is stable for this purpose: it only reads props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRecord, props.tree]);

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

  /** Arrangement alone: expanding or collapsing never writes the
   * selection, the camera, or anything else (spec-view-42). */
  function toggleFile(key: string) {
    const opening = !isFileExpanded(key);
    if (searching) {
      const next = new Map(searchOverrides);
      next.set(key, opening);
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
    setLiveNote(`Opened ${record.id}`);
    setReader({ record, loading: true });
    readSpec(record.path)
      .then(({ markdown, version }) =>
        setReader((current) =>
          current?.record.path === record.path
            ? { record, loading: false, markdown, version }
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

  /** One file's text with its token; a host serving bare strings
   * yields no token (spec-view-16). */
  function readSpec(path: string): Promise<SpecRead> {
    return props
      .onReadRecord(path)
      .then((served) =>
        typeof served === "string" ? { markdown: served } : served,
      );
  }

  /** Stand the editor on a file's text (spec-view-48); `itemId` lands
   * the caret on that item's heading. */
  function standEditor(path: string, served: SpecRead, itemId?: string) {
    onViewState({
      ...viewStateRef.current,
      editor: {
        path,
        original: served.markdown,
        draft: served.markdown,
        version: served.version,
        preview: false,
        caretLine: itemId ? headingLine(served.markdown, itemId) : undefined,
      },
    });
    setLiveNote(`Editing ${path}`);
  }

  /** Open the editor from the outline: fetch the file first, and say
   * so beside the control that asked when the fetch fails (§5). */
  function openEditor(anchor: string, path: string, itemId?: string) {
    setOpenFailure(null);
    readSpec(path)
      .then((served) => standEditor(path, served, itemId))
      .catch((cause: Error) => {
        setOpenFailure({
          anchor,
          message: cause.message || "could not read the file",
        });
        setLiveNote(`Could not open ${path}`);
      });
  }

  /** Leave the editor (spec-view-50): a record closes into the reader
   * — with the saved text when there is one — and a package into the
   * outline; a save re-reads the tree and is announced. */
  function closeEditor(
    path: string,
    saved?: { content: string; version: string },
  ) {
    const { editor: closed, ...rest } = viewStateRef.current;
    onViewState(rest);
    if (isRecordPath(path)) {
      const record =
        reader?.record.path === path
          ? reader.record
          : [...tree.decisions, ...tree.intents, META_RECORD, MAP_RECORD].find(
              (entry) => entry.path === path,
            );
      if (record) {
        setReader({
          record,
          loading: false,
          markdown: saved?.content ?? closed?.original ?? "",
          version: saved?.version ?? closed?.version,
        });
      }
    }
    editorReturn.current = isRecordPath(path)
      ? "reader"
      : (fileKeyOf(path) ?? null);
    if (saved) {
      setLiveNote(`Saved ${path}`);
      props.onRefresh();
    }
  }

  // Leaving the editor hands focus back (§6): to the reader's Back
  // control, or to the package's Edit control in the outline.
  const editorPath = editor?.path;
  useEffect(() => {
    if (editorPath) return;
    const target = editorReturn.current;
    if (!target) return;
    editorReturn.current = null;
    if (target === "reader") {
      readerBackRef.current?.focus();
      return;
    }
    document
      .querySelector<HTMLElement>(`[data-testid="file-edit-${target}"]`)
      ?.focus();
  }, [editorPath]);

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
    // Links inside a body — and inside the reader — reach every
    // record the tree lists, plus the two tree-wide documents
    // (spec-view-7).
    const record = recordForHref(sourcePath, href, [
      ...tree.decisions,
      ...tree.intents,
      META_RECORD,
      MAP_RECORD,
    ]);
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
  // The editor swaps the whole view, above the reader (spec-view-48).
  // -------------------------------------------------------------------------

  if (editor && props.onWriteSpec) {
    const write = props.onWriteSpec;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {liveRegion}
        <SpecEditor
          key={editor.path}
          state={editor}
          onState={(next) =>
            onViewState({ ...viewStateRef.current, editor: next })
          }
          onWrite={(content, baseVersion) =>
            write(editor.path, content, baseVersion)
          }
          onRead={() => readSpec(editor.path)}
          onSaved={(content, version) =>
            closeEditor(editor.path, { content, version })
          }
          onCancel={() => closeEditor(editor.path)}
        />
      </div>
    );
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
        {liveRegion}
        <div className="flex items-center gap-2">
          <button
            ref={readerBackRef}
            type="button"
            onClick={() => setReader(null)}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            ← Back
          </button>
          {canEdit && !reader.loading && !reader.error ? (
            <button
              type="button"
              data-testid="reader-edit"
              onClick={() =>
                standEditor(reader.record.path, {
                  markdown: reader.markdown ?? "",
                  version: reader.version,
                })
              }
              className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Edit
            </button>
          ) : null}
        </div>
        <h1 className="text-lg font-semibold">
          {reader.record.id}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {reader.record.title}
          </span>
        </h1>
        {reader.loading ? (
          <div className="text-sm text-neutral-500">
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

  /** The decision records as the outline's last branch: rows that
   * open the reader, not tree nodes to expand (spec-view-7). Its own
   * collapse key cannot collide with a collection directory, which
   * always carries the "packages/" prefix (meta-31). */
  const DECISIONS_KEY = "\u0000decisions";
  // Closed by default: the records are an annex to the packages, and
  // a search opens the branch to show what it matched.
  const renderDecisions = (): ReactNode => {
    const open = searching || collapsedDirs.has(DECISIONS_KEY);
    const shown = searching
      ? tree.decisions.filter(
          (record) =>
            record.id.toLowerCase().includes(viewState.search.trim().toLowerCase()) ||
            record.title
              .toLowerCase()
              .includes(viewState.search.trim().toLowerCase()),
        )
      : tree.decisions;
    if (searching && shown.length === 0) return null;
    return (
      <li key={DECISIONS_KEY} data-testid="decisions-branch">
        <button
          type="button"
          data-testid="decisions-toggle"
          aria-expanded={open}
          aria-label={`Decisions, ${tree.decisions.length} records`}
          onClick={() =>
            setCollapsedDirs((current) => {
              // The set holds the branch when it is OPEN, since the
              // branch is the one node that starts closed.
              const next = new Set(current);
              if (next.has(DECISIONS_KEY)) next.delete(DECISIONS_KEY);
              else next.add(DECISIONS_KEY);
              return next;
            })
          }
          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          <Icon
            name="caretDown"
            className={`h-3 w-3 text-neutral-500 transition-transform ${
              open ? "" : "-rotate-90"
            }`}
          />
          decisions
          <span className="text-neutral-500">{tree.decisions.length}</span>
        </button>
        {open ? (
          <ul className="ml-[7px] flex flex-col border-l border-neutral-200 pl-3 dark:border-neutral-800">
            {/* The one record row (dashboard-40): the chip the package
             * rows wear, the title, hover and pointer. */}
            {shown.map((record) => (
              <li key={record.path} className="flex">
                <RecordRow
                  id={`specv-record-${record.id}`}
                  data-testid={`record-${record.id}`}
                  record={record}
                  onClick={() => openRecord(record, `specv-record-${record.id}`)}
                  className="flex-1 py-0.5 text-xs"
                />
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

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
        <div className="m-auto p-6 text-sm text-neutral-500">
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
        {/* A legacy tree parses no packages, but its records are read
            all the same and stay reachable (spec-view-18). */}
        <div className="flex items-center justify-center gap-1.5 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-800">
          <button
            id="specv-records-meta"
            type="button"
            data-testid="records-meta"
            onClick={() => openRecord(META_RECORD, "specv-records-meta")}
            className="hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            meta
          </button>
          <span aria-hidden="true">·</span>
          <button
            id="specv-records-map"
            type="button"
            data-testid="records-map"
            onClick={() => openRecord(MAP_RECORD, "specv-records-map")}
            className="hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            map
          </button>
        </div>
        {tree.decisions.length > 0 ? (
          <ul className="flex flex-col text-left">{renderDecisions()}</ul>
        ) : null}
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
    const selected = graphSelection === key;
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
          } ${
            selected
              ? "bg-brand-50 ring-1 ring-brand-600 dark:bg-brand-950 dark:ring-brand-400"
              : ""
          }`}
        >
          {/* The chevron arranges and nothing else; it is a pointer
              target only, since Left/Right on the row carry the same
              gesture for the keyboard (spec-view-42). */}
          <span
            data-testid={`file-chevron-${key}`}
            aria-hidden="true"
            onClick={(event) => {
              event.stopPropagation();
              toggleFile(key);
            }}
            className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Icon
              name="caretDown"
              className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${
                expanded ? "" : "-rotate-90"
              }`}
            />
          </span>
          <button
            type="button"
            data-testid={`file-toggle-${key}`}
            aria-expanded={expanded}
            aria-current={selected ? "true" : undefined}
            aria-label={file.basename}
            onClick={() => selectFile(key)}
            onKeyDown={(event) => {
              // Arranging by keyboard, never selecting (spec-view-42).
              if (event.key === "ArrowRight" && !expanded) {
                event.preventDefault();
                toggleFile(key);
              } else if (event.key === "ArrowLeft" && expanded) {
                event.preventDefault();
                toggleFile(key);
              }
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
          >
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
            {searching && !search.fileKeys.has(key) && selected ? (
              <span
                data-testid={`retained-${key}`}
                className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700 dark:bg-brand-950 dark:text-brand-300"
              >
                shown despite search
              </span>
            ) : null}
            {rollup ? (
              <span
                data-testid={`rollup-${key}`}
                aria-label={`Citations: ${rollup}`}
                className="ml-1 text-[11px] text-neutral-500"
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
            {(allIds.length > 0 && items.length > 0) || canEdit ? (
              <div className="flex flex-wrap items-center gap-3">
                {allIds.length > 0 && items.length > 0 ? (
                  <button
                    type="button"
                    data-testid={`expand-all-${key}`}
                    aria-label={`${allExpanded ? "Collapse" : "Expand"} all items in ${file.basename}`}
                    onClick={() => setAllItems(file, !allExpanded)}
                    className={`text-[11px] ${LINK_CLASS}`}
                  >
                    {allExpanded ? "Collapse all" : "Expand all"}
                  </button>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    data-testid={`file-edit-${key}`}
                    aria-label={`Edit ${file.basename}.md`}
                    onClick={() =>
                      openEditor(`file:${key}`, `packages/${key}.md`)
                    }
                    className={`text-[11px] ${LINK_CLASS}`}
                  >
                    Edit
                  </button>
                ) : null}
                {openFailure?.anchor === `file:${key}` ? (
                  <span
                    role="alert"
                    className="text-[11px] text-red-600 dark:text-red-400"
                  >
                    {openFailure.message}
                  </span>
                ) : null}
              </div>
            ) : null}
            <FileItems
              items={items}
              onEditItem={
                canEdit
                  ? (item) =>
                      openEditor(
                        `item:${item.id}`,
                        `packages/${key}.md`,
                        item.id,
                      )
                  : undefined
              }
              editFailure={openFailure}
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
              <div className="text-xs text-neutral-500">
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

  // A search is a query with an answer set, so packages holding no
  // answer leave the outline rather than lining up empty
  // (spec-view-5). A jump target revealed despite the search keeps its
  // package on screen (spec-view-6). Group filters are a lens on item
  // kinds instead, so they leave every package standing.
  const fileMatches = (file: SpecFileInfo): boolean =>
    !searching ||
    search.fileKeys.has(file.key) ||
    file.key === graphSelection ||
    file.items.some((item) => revealed.has(item.id));
  const dirMatches = (dir: SpecDirNode): boolean =>
    !searching ||
    dir.files.some(fileMatches) ||
    dir.dirs.some(dirMatches);

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
            className={`h-3 w-3 text-neutral-500 transition-transform ${
              open ? "" : "-rotate-90"
            }`}
          />
          {label ? null : (
            <Icon name="folder" className="h-3.5 w-3.5 text-neutral-500" />
          )}
          {label ?? `${dir.name}/`}
        </button>
        {open ? (
          <ul className="ml-[7px] flex flex-col border-l border-neutral-200 pl-3 dark:border-neutral-800">
            {dir.dirs.filter(dirMatches).map((child) => renderDir(child))}
            {dir.files.filter(fileMatches).map(renderFile)}
          </ul>
        ) : null}
      </li>
    );
  };

  // With the graph on, the surface fills like an IDE editor split;
  // the outline alone keeps a readable document column.
  const graphful = viewState.graph && tree.files.length > 0;

  /** Reveal: the one write a selection is allowed to make beyond its
   * own axis, and additive only — it opens and scrolls, never
   * collapses or clears (spec-view-43). */
  const revealFile = (fileKey: string) => {
    // Effective expansion, not the persisted set: while searching,
    // toggleFile flips the computed state, so gating on the persisted
    // list would collapse a search-expanded file instead of opening it.
    if (!isFileExpanded(fileKey)) toggleFile(fileKey);
    // Next frame, so a just-expanded file exists to scroll to.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="file-${fileKey}"]`,
      );
      el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  /** The selection gesture, wherever it is made — a package row or a
   * graph node. Re-selecting the selected package re-fires its
   * reveal (spec-view-42). */
  const selectFile = (fileKey: string) => {
    setGraphSelection(fileKey);
    revealFile(fileKey);
  };

  return (
    <div
      onKeyDown={(event) => {
        // Last rung: whatever had something to dismiss has already
        // claimed the key (spec-view-42).
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          graphSelection !== null
        ) {
          event.preventDefault();
          setGraphSelection(null);
        }
      }}
      className={
        graphful
          ? "flex h-full w-full flex-col gap-3 overflow-hidden p-6"
          : "mx-auto flex w-full max-w-3xl flex-col gap-3 overflow-y-auto p-6"
      }
    >
      {liveRegion}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">
          {props.projectName ?? "Specs"}
        </h1>
        <span className="text-xs text-neutral-500">
          {totals.packages} package{totals.packages === 1 ? "" : "s"} ·{" "}
          {totals.items} items
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {/* One toggle, not a mode set: the outline never leaves, so
              there is no state where nothing is shown (spec-view-20). */}
          <button
            type="button"
            data-testid="view-graph"
            aria-pressed={viewState.graph}
            title="Show the citation graph beside the outline"
            onClick={() =>
              onViewState({ ...viewState, graph: !viewState.graph })
            }
            className={`rounded border px-2 py-0.5 text-xs ${
              viewState.graph
                ? "border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950 dark:text-brand-300"
                : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            }`}
          >
            Graph
          </button>
          <button
            type="button"
            aria-label="Refresh specs"
            title="Re-read the specs/ tree"
            disabled={props.loading}
            onClick={props.onRefresh}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-40 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Icon name="refresh" />
          </button>
          <span className="text-xs text-neutral-500">
            {props.loading
              ? "reading…"
              : `read ${relativeReadTime(tree.readAt, now)}`}
          </span>
        </span>
      </div>

      {props.error ? (
        <ErrorStrip error={props.error} onRetry={props.onRefresh} />
      ) : null}

      {tree.notices.length > 0 ? (
        <div className="text-xs text-neutral-500">
          {tree.notices.join(" · ")}
        </div>
      ) : null}

      {(() => {
        // Item filters and search govern the outline alone, so they
        // ride inside its pane rather than over the whole surface
        // (spec-view-29).
        const outlineControls = (
          <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2">
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
                      : "border-neutral-200 text-neutral-500 dark:border-neutral-700 dark:text-neutral-500"
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
              onKeyDown={(event) => {
                // Live search has nothing to submit; Escape is the
                // standard way out of a search field.
                if (event.key === "Escape" && viewState.search) {
                  event.preventDefault();
                  onViewState({ ...viewState, search: "" });
                }
              }}
              placeholder="Filter items — ID or text…"
              aria-label="Filter items by ID or text"
              className="min-w-40 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
            />
            {searching ? (
              <button
                type="button"
                data-testid="search-clear"
                aria-label="Clear the search"
                title="Clear the search (Escape)"
                onClick={() => onViewState({ ...viewState, search: "" })}
                className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ✕
              </button>
            ) : null}
            {searching ? (
              <span
                data-testid="match-count"
                className="text-xs text-neutral-500"
              >
                {search.count} {search.count === 1 ? "match" : "matches"}
              </span>
            ) : null}
          </div>
        );

        const decisionsBranch =
          tree.decisions.length > 0 ? renderDecisions() : null;
        const outline =
          tree.files.length > 0 ? (
            <>
              {outlineRoot.dirs.filter(dirMatches).map((child) => renderDir(child))}
              {outlineRoot.files.filter(fileMatches).map(renderFile)}
            </>
          ) : null;

        // The outline is permanent; the graph joins it beside
        // (spec-view-20). Both panes scroll independently, and the
        // graph's own affordances live on the graph pane.
        const share = dragSplit ?? viewState.graphWidth;
        const commitSplit = (fraction: number) => {
          const clamped = Math.min(
            MAX_GRAPH_WIDTH,
            Math.max(MIN_GRAPH_WIDTH, fraction),
          );
          setDragSplit(null);
          onViewState({ ...viewState, graphWidth: clamped });
        };
        const fractionAt = (clientX: number): number | null => {
          const box = splitRef.current?.getBoundingClientRect();
          if (!box || !box.width) return null;
          return Math.min(
            MAX_GRAPH_WIDTH,
            Math.max(MIN_GRAPH_WIDTH, (clientX - box.left) / box.width),
          );
        };

        return graphful ? (
          <div
            ref={splitRef}
            className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-0"
          >
            <div
              className="min-h-0 flex-1 lg:h-full lg:w-[var(--graph-share)] lg:flex-none"
              style={{ ["--graph-share" as string]: `${share * 100}%` }}
            >
              <SpecGraph
                files={tree.files}
                selectedKey={graphSelection}
                matchedKeys={search.fileKeys}
                searching={searching}
                onClearSelection={() => setGraphSelection(null)}
                onOpenFile={selectFile}
              />
            </div>
            {/* The reader sets the balance, within bounds that keep
                both panes readable (spec-view-20). */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize the graph pane"
              aria-valuenow={Math.round((dragSplit ?? viewState.graphWidth) * 100)}
              aria-valuemin={Math.round(MIN_GRAPH_WIDTH * 100)}
              aria-valuemax={Math.round(MAX_GRAPH_WIDTH * 100)}
              tabIndex={0}
              data-testid="graph-split"
              className="group hidden shrink-0 cursor-col-resize items-stretch px-2 lg:flex"
              onPointerDown={(event) => {
                (event.currentTarget as Element).setPointerCapture?.(
                  event.pointerId,
                );
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                  return;
                }
                const next = fractionAt(event.clientX);
                if (next !== null) setDragSplit(next);
              }}
              onPointerUp={(event) => {
                const next = fractionAt(event.clientX);
                commitSplit(next ?? share);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  commitSplit(share - 0.05);
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  commitSplit(share + 0.05);
                }
              }}
            >
              <span className="w-px bg-neutral-200 transition-colors group-hover:bg-brand-600 dark:bg-neutral-800 dark:group-hover:bg-brand-400" />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {outlineControls}
              <ul className="flex min-h-0 flex-col overflow-y-auto pr-1">
                {outline}
                {decisionsBranch}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {outlineControls}
            <ul className="flex flex-col">
              {outline}
              {decisionsBranch}
            </ul>
          </div>
        );
      })()}
      {tree.files.length === 0 ? (
        <div className="text-sm text-neutral-500">
          specs/ is present but holds no spec files yet.
        </div>
      ) : null}

      {/* The footer keeps only the two tree-wide documents; the
          decision records live in the outline now (spec-view-7). */}
      <div className="mt-2 flex shrink-0 items-center gap-1.5 border-t border-neutral-200 pt-2 text-xs text-neutral-500 dark:border-neutral-800">
        <button
          id="specv-records-meta"
          type="button"
          data-testid="records-meta"
          onClick={() => openRecord(META_RECORD, "specv-records-meta")}
          className="hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          meta
        </button>
        <span aria-hidden="true">·</span>
        <button
          id="specv-records-map"
          type="button"
          data-testid="records-map"
          onClick={() => openRecord(MAP_RECORD, "specv-records-map")}
          className="hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          map
        </button>
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
  onEditItem,
  editFailure,
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
  /** Open an item's file in the editor (spec-view-48). */
  onEditItem?: (item: SpecItemInfo) => void;
  /** The last failed open, keyed by the control that asked. */
  editFailure?: { anchor: string; message: string } | null;
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
          className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500"
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
          className="ml-2 text-[11px] font-medium text-neutral-500"
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
        onEdit={onEditItem ? () => onEditItem(item) : undefined}
        editFailure={
          editFailure?.anchor === `item:${item.id}`
            ? editFailure.message
            : undefined
        }
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
  onEdit,
  editFailure,
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
  /** Open the item's file in the editor with the caret on its heading
   * (spec-view-48); absent where the host wires no write. */
  onEdit?: () => void;
  /** Why the last Edit from this row could not open (DR-010 §5). */
  editFailure?: string;
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
          <span className="text-[11px] text-neutral-500">not found</span>
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
        </button>
        {copied ? (
          <span
            data-testid={`copied-${item.id}`}
            className="shrink-0 text-[11px] text-neutral-500 dark:text-neutral-400"
          >
            copied
          </span>
        ) : null}
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
            <span className="shrink-0 text-[11px] text-neutral-500">
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
              <span className="text-[11px] text-neutral-500">not found</span>
            </div>
          ) : null}
          {item.cites.length > 0 || onEdit ? (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {item.cites.length > 0 ? (
                <div
                  data-testid={`cites-${item.id}`}
                  className="flex flex-wrap items-center gap-1.5 text-xs"
                >
                  <span className="text-neutral-500">cites</span>
                  {item.cites.map(citation)}
                </div>
              ) : null}
              {onEdit ? (
                <button
                  type="button"
                  data-testid={`item-edit-${item.id}`}
                  aria-label={`Edit ${item.id} in its file`}
                  onClick={onEdit}
                  className={`text-[11px] ${LINK_CLASS}`}
                >
                  Edit
                </button>
              ) : null}
              {editFailure ? (
                <span
                  role="alert"
                  className="text-[11px] text-red-600 dark:text-red-400"
                >
                  {editFailure}
                </span>
              ) : null}
            </div>
          ) : null}
          {inbound.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                data-testid={`inbound-${item.id}`}
                aria-expanded={inboundOpen}
                onClick={() => setInboundOpen((open) => !open)}
                className="text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300"
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

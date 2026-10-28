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
  type FocusEvent as ReactFocusEvent,
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
  CitationPreview,
  CitationSummaryCard,
  useCitationPreview,
  type SummaryEntry,
} from "./CitationPreview.js";

import {
  ancestorKeys,
  buildCitationModel,
  buildDirTree,
  buildItemIndex,
  citationSummary,
  fileCounts,
  fileKeyOf,
  headingLine,
  initialSpecViewState,
  isRecordPath,
  itemMatches,
  linkItemTargets,
  linksAsText,
  normalizeSpecViewState,
  recordForHref,
  relativeReadTime,
  searchDigest,
  treeCounts,
  visibleFileItems,
  GROUP_DEFINITION,
  GROUP_NAME,
  GROUP_ORDER,
  GROUP_SHORT,
  GROUP_WORD,
  MAX_GRAPH_WIDTH,
  MIN_GRAPH_WIDTH,
  type CitationModel,
  type ItemLocation,
  type SpecDirNode,
  type SpecGroup,
  type SpecViewState,
} from "../lib/spec-view-model.js";
import { Icon } from "./Icon.js";
import { i18n } from "../i18n.js";
import { Markdown } from "./Markdown.js";
import { RecordRow } from "./RecordRow.js";
import { Rich } from "./Rich.js";
import {
  citationsDomId,
  itemDomId,
  SpecItemRows,
  GROUP_CHIP,
  GROUP_TEXT,
  LINK_CLASS,
} from "./SpecItemRows.js";

export { initialSpecViewState };
export type { SpecViewState };

/** A package row's count columns and their heading cells share one
 * width, so the numerals align under their names (spec-view-2): room
 * for four digits and a separator, and for a full name on two lines. */
/** The split's pixel floors (spec-view-20): the graph's width, the
 * outline's in rem, and the divider between them. */
const GRAPH_FLOOR_PX = 320;
const OUTLINE_FLOOR_REM = 28;
const DIVIDER_PX = 17;

const COUNT_CELL = "w-7 shrink-0 text-right @xs:w-10 @md:w-[4.5rem]";
/** The cross-package rollup's column (spec-view-19). */
const ROLLUP_CELL =
  "hidden w-24 shrink-0 whitespace-nowrap text-right @md:block";
/** The unresolved mark's narrow slot, under no heading and held on
 * every row so the columns before it never shift (spec-view-19). */
const UNRESOLVED_CELL = "flex w-4 shrink-0 justify-end";
/** A pressed filter's checkbox, filled in its group's color
 * (spec-view-4). */
const FILTER_BOX: Record<SpecGroup, string> = {
  external: "border-sky-700 bg-sky-700 dark:border-sky-400 dark:bg-sky-400",
  internal: "border-lime-600 bg-lime-600 dark:border-lime-400 dark:bg-lime-400",
  test: "border-teal-700 bg-teal-700 dark:border-teal-400 dark:bg-teal-400",
};

/** How long a requested re-read turns its icon at least, and how long
 * the label then says so (spec-view-8). */
const REFRESH_TURN_MS = 600;
const REFRESH_SAID_MS = 2000;

/** A count as the columns print it: tabular numerals with the
 * locale's separators, a zero as a dash (spec-view-2). */
function countText(count: number): string {
  return count === 0 ? "—" : count.toLocaleString(i18n.locale);
}

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
  /** Settles once the re-read has landed or failed (spec-view-8). */
  onRefresh: () => Promise<void> | void;
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
   * an intent home, since the reader lives here (dashboard-24) — and
   * where it was asked from, so Back can lead there (spec-view-57). */
  openRecordPath?: string;
  openRecordOrigin?: RecordOrigin;
  onRecordOpened?: () => void;
  /** Back on a record with an origin hands that origin to the host,
   * which returns to the surface and its invoking control. */
  onReturn?: (origin: RecordOrigin) => void;
}

/** Where a record was requested from (spec-view-57): the surface, the
 * project it was listed under, and the test id of the control that
 * asked — the row, or the control that reopens it where the row
 * leaves with its activation. */
export type RecordOrigin = {
  surface: "dashboard" | "overview";
  projectId: string;
  anchor: string;
};

/** The Back control's name for each origin. */
const ORIGIN_NAMES: Record<RecordOrigin["surface"], () => string> = {
  dashboard: () => i18n._("Dashboard"),
  overview: () => i18n._({ id: "Overview", comment: "the project's Overview tab" }),
};

/** Where a rendered link sits (spec-view-6): the specs/-relative path
 * its href resolves against, the item citing it — none for a
 * package's intent, which leaves no return to walk — the DOM id that
 * takes focus back from the reader, and the key its "not found" note
 * and its preview ride. */
type LinkSource = {
  sourcePath: string;
  itemId?: string;
  /** The package whose intent holds the link, when an intent does. */
  intentOf?: string;
  focusId: string;
  noteKey: string;
  /** The records reader's body: an item citation leaves the reader,
   * a record link keeps its Back (spec-view-7). */
  inReader?: true;
};

/** Where an in-view jump left from: an item, or a package's intent
 * (spec-view-6). */
type JumpOrigin = { item: string } | { intent: string };

const JUMP_RETURN_LIMIT = 20;

/** A record's number, for newest-first order (spec-view-7). */
function recordNumber(id: string): number {
  return Number(/\d+/.exec(id)?.[0] ?? -1);
}

/** Each decision record's summary from map.md's decisions table:
 * `| [DR-158](decisions/…) | file | summary |` (spec-view-7). */
function mapSummaries(markdown: string): ReadonlyMap<string, string> {
  const summaries = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    const row = /^\|\s*\[(DR-\d+)\]\([^)]*\)\s*\|[^|]*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (row) summaries.set(row[1]!, row[2]!);
  }
  return summaries;
}

function sameOrigin(a: JumpOrigin, b: JumpOrigin): boolean {
  return "item" in a ? "item" in b && a.item === b.item : "intent" in b && a.intent === b.intent;
}

function originOf(source: LinkSource): JumpOrigin | undefined {
  if (source.itemId) return { item: source.itemId };
  if (source.intentOf) return { intent: source.intentOf };
  return undefined;
}

/** The DOM id of a package row's toggle, where focus returns from a
 * record its intent opened (DR-010 §6). */
function fileDomId(key: string): string {
  return `specv-file-${key}`;
}

type ReaderState = {
  record: SpecRecordInfo;
  loading: boolean;
  markdown?: string;
  /** The token the read handed out, carried into an edit. */
  version?: string;
  error?: string;
  /** Set when another surface asked for the record: Back leads
   * there instead of to the tree (spec-view-57). */
  origin?: RecordOrigin;
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
  // The heading row's measured height: an expanded package's header
  // pins beneath it, and a revealed row lands clear of it (spec-view-2,
  // spec-view-43).
  const [headHeight, setHeadHeight] = useState(0);
  const headObserver = useRef<ResizeObserver | null>(null);
  const headRef = useCallback((element: HTMLDivElement | null) => {
    headObserver.current?.disconnect();
    headObserver.current = null;
    if (!element) return;
    const measure = () => setHeadHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    headObserver.current = new ResizeObserver(measure);
    headObserver.current.observe(element);
  }, []);
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
  const [jumpOrigins, setJumpOrigins] = useState<readonly JumpOrigin[]>([]);
  // A requested re-read acknowledged however fast it lands: the icon
  // turns for at least REFRESH_TURN_MS, then — the read having
  // succeeded — the label says the tree was read again for
  // REFRESH_SAID_MS; a failure stops the turn and leaves its error
  // standing (spec-view-8). Only the latest request settles it.
  const [refresh, setRefresh] = useState<"idle" | "reading" | "done">("idle");
  const refreshFrom = useRef({ at: 0, request: 0 });
  const [refreshSettled, setRefreshSettled] = useState(0);
  const startRefresh = () => {
    const request = refreshFrom.current.request + 1;
    refreshFrom.current = { at: Date.now(), request };
    setRefresh("reading");
    const settle = () => setRefreshSettled(request);
    void Promise.resolve(props.onRefresh()).then(settle, settle);
  };
  const readLanded = refreshSettled === refreshFrom.current.request;
  useEffect(() => {
    if (refresh === "reading" && readLanded) {
      const left = Math.max(0, REFRESH_TURN_MS - (Date.now() - refreshFrom.current.at));
      const next = props.error === undefined ? "done" : "idle";
      const timer = setTimeout(() => setRefresh(next), left);
      return () => clearTimeout(timer);
    }
    if (refresh === "done") {
      const timer = setTimeout(() => setRefresh("idle"), REFRESH_SAID_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [refresh, readLanded, props.error]);
  const [reader, setReader] = useState<ReaderState | null>(null);
  // The decision records' list, standing over the specs like the
  // reader; its filter and each record's summary from map.md
  // (spec-view-7).
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsFilter, setRecordsFilter] = useState("");
  const [summaries, setSummaries] = useState<ReadonlyMap<string, string>>(new Map());
  const recordsBackRef = useRef<HTMLButtonElement | null>(null);
  const recordsReturn = useRef(false);
  const [pendingJump, setPendingJump] = useState<string>();
  // An item whose summary was activated: once expanded, its citation
  // block scrolls into view and takes focus (spec-view-60).
  const [pendingCitations, setPendingCitations] = useState<string>();
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

  // The citation preview (spec-view-61): one card at a time, laid
  // inside the box the outline scrolls in — the outline pane with the
  // graph beside it, the surface root without — so it never carries
  // width or scroll onto the page (spec-view-59).
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const outlineBoxRef = useRef<HTMLDivElement | null>(null);
  const preview = useCitationPreview(
    useCallback(() => outlineBoxRef.current ?? surfaceRef.current, []),
  );

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
  // The unresolved slot is held on every row only where some package
  // has one, so a clean tree spends no width on it (spec-view-19).
  const anyUnresolved = citations.unresolved.size > 0;
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
    if (record) openRecord(record, undefined, props.openRecordOrigin);
    else setLiveNote(i18n._("{path} is not in the tree", { path: requestedRecord }));
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

  // The list takes focus on its Back when it opens and hands it back
  // to the footer's entry when it closes (§6).
  useEffect(() => {
    if (recordsOpen) {
      recordsBackRef.current?.focus({ preventScroll: true });
    } else if (recordsReturn.current) {
      recordsReturn.current = false;
      document.getElementById("specv-records-decisions")?.focus();
    }
  }, [recordsOpen]);

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

  useEffect(() => {
    if (!pendingCitations) return;
    const element = document.getElementById(citationsDomId(pendingCitations));
    if (element && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "nearest" });
    }
    element?.focus({ preventScroll: true });
    setPendingCitations(undefined);
  }, [pendingCitations]);

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
    // Collapsing a package ends the reading excursion (spec-view-6).
    if (!opening) setJumpOrigins([]);
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

  /** A summary's activation: the item opens onto its citation block
   * (spec-view-60). */
  function openCitations(id: string) {
    if (!expandedItems.has(id)) {
      onViewState({
        ...viewState,
        expandedItems: [...viewState.expandedItems, id],
      });
    }
    setPendingCitations(id);
  }

  /** Every group back on, from the hidden-groups line (spec-view-4). */
  function showAllGroups() {
    onViewState({
      ...viewState,
      filters: { external: true, internal: true, test: true },
    });
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
      setLiveNote(i18n._("Copy failed for {what}", { what: text }));
      return;
    }
    void write
      .then(() => {
        setCopiedId(text);
        setLiveNote(i18n._("Copied {what}", { what: text }));
      })
      .catch(() => {
        setCopyFailedId(text);
        setLiveNote(i18n._("Copy failed for {what}", { what: text }));
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
        ? i18n._("Jumped to {id} — shown despite filter", { id: targetId })
        : i18n._("Jumped to {id}", { id: targetId }),
    );
    setPendingJump(targetId);
    return true;
  }

  /** Citation jump (DR-011): land on the target, remembering the place
   * it left — a citing item, or a package's intent — so the return
   * control can walk back; never navigate. A dead ID says "not found"
   * next to the clicked link (spec-view-6). */
  function jumpTo(linkKey: string, targetId: string, origin?: JumpOrigin | string) {
    // The jump answers the entry the card was previewing: the card
    // has nothing left to say (spec-view-61).
    preview.close();
    if (!revealTarget(targetId)) {
      setNotFoundKey(linkKey);
      setLiveNote(i18n._("{id} not found", { id: targetId }));
      return;
    }
    if (origin) {
      const place = typeof origin === "string" ? { item: origin } : origin;
      // One reading excursion: a jump from the place just recorded
      // adds nothing, and only the latest places stay (spec-view-6).
      setJumpOrigins((stack) => {
        const last = stack[stack.length - 1];
        if (last && sameOrigin(last, place)) return stack;
        return [...stack, place].slice(-JUMP_RETURN_LIMIT);
      });
    }
  }

  /** The return pops one origin and lands back on it: an item as a
   * jump lands, an intent on its package's row (spec-view-6). */
  function popJumpOrigin() {
    const origin = jumpOrigins[jumpOrigins.length - 1];
    if (!origin) return;
    setJumpOrigins((stack) => stack.slice(0, -1));
    if ("item" in origin) {
      revealTarget(origin.item);
    } else {
      revealFile(origin.intent);
      requestAnimationFrame(() =>
        document.getElementById(fileDomId(origin.intent))?.focus({ preventScroll: true }),
      );
    }
  }

  // Selecting a package or changing the search ends the excursion
  // (spec-view-6).
  useEffect(() => {
    setJumpOrigins([]);
  }, [graphSelection, viewState.search]);

  // Alt+Left and the pointer's back button walk back too, while there
  // is somewhere to return to (spec-view-6).
  // Not while a record, the records' list or the editor stands over
  // the specs, nor from a text field, where Alt+Left moves by word.
  const popRef = useRef(popJumpOrigin);
  popRef.current = popJumpOrigin;
  const returnHeld = useRef(false);
  returnHeld.current = Boolean(reader || recordsOpen || editor);
  const canReturn = jumpOrigins.length > 0;
  useEffect(() => {
    if (!canReturn) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.key !== "ArrowLeft" || event.metaKey || event.ctrlKey) return;
      if (event.defaultPrevented || returnHeld.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
      event.preventDefault();
      popRef.current();
    };
    const onPointer = (event: MouseEvent) => {
      if (event.button !== 3 || event.defaultPrevented || returnHeld.current) return;
      event.preventDefault();
      popRef.current();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onPointer);
    };
  }, [canReturn]);

  /** Swap to the records reader; returnFocusId names the DOM id that
   * takes focus back when the reader closes (§6) — absent on the
   * reader's own Retry so the original invoker is kept; origin names
   * the surface Back leads to instead (spec-view-57). */
  function openRecord(
    record: SpecRecordInfo,
    returnFocusId?: string,
    origin?: RecordOrigin,
  ) {
    if (returnFocusId) readerReturnId.current = returnFocusId;
    setLiveNote(i18n._("Opened {id}", { id: record.id }));
    setReader({ record, loading: true, origin });
    readSpec(record.path)
      .then(({ markdown, version }) =>
        setReader((current) =>
          current?.record.path === record.path
            ? { record, loading: false, markdown, version, origin }
            : current,
        ),
      )
      .catch((cause: Error) =>
        setReader((current) =>
          current?.record.path === record.path
            ? { record, loading: false, error: cause.message, origin }
            : current,
        ),
      );
  }

  /** The footer's decision records entry: their list over the specs,
   * each row's summary read from map.md (spec-view-7). */
  function openRecordsList() {
    setRecordsOpen(true);
    setLiveNote(i18n._("Opened the decision records"));
    readSpec(MAP_RECORD.path)
      .then(({ markdown }) => setSummaries(mapSummaries(markdown)))
      .catch(() => setSummaries(new Map()));
  }

  function closeRecordsList() {
    recordsReturn.current = true;
    setRecordsOpen(false);
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
    setLiveNote(i18n._("Editing {path}", { path }));
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
          message: cause.message || i18n._("could not read the file"),
        });
        setLiveNote(i18n._("Could not open {path}", { path }));
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
          origin: reader?.record.path === path ? reader.origin : undefined,
        });
      }
    }
    editorReturn.current = isRecordPath(path)
      ? "reader"
      : (fileKeyOf(path) ?? null);
    if (saved) {
      setLiveNote(i18n._("Saved {path}", { path }));
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

  /** An item body's links resolve from its file and return to its row. */
  function itemSource(itemId: string): LinkSource {
    return {
      sourcePath: itemIndex.get(itemId)?.sourcePath ?? "",
      itemId,
      focusId: itemDomId(itemId),
      noteKey: `body:${itemId}`,
    };
  }

  /** A package's intent is rendered as item bodies are (spec-view-2):
   * its links resolve from its file and hand focus back to its row. */
  function intentSource(fileKey: string): LinkSource {
    return {
      sourcePath: `packages/${fileKey}.md`,
      intentOf: fileKey,
      focusId: fileDomId(fileKey),
      noteKey: `intent:${fileKey}`,
    };
  }

  /** Inline links in rendered prose (META-20 citations): item IDs
   * jump in-view, DR/IR and meta.md links open the records reader,
   * external URLs pass through to the OS browser, and everything else
   * is inert. */
  function followLink(source: LinkSource, event: ReactMouseEvent) {
    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:\/\//.test(href)) return;
    event.preventDefault();
    const candidates = linkItemTargets(anchor.textContent ?? "", href);
    const target = candidates.find((c) => itemIndex.has(c)) ?? candidates[0];
    if (target && itemIndex.has(target)) {
      if (source.inReader) {
        readerReturnId.current = null;
        setReader(null);
        setRecordsOpen(false);
      }
      jumpTo(`${source.noteKey}:${target}`, target, originOf(source));
      return;
    }
    // The citing file's specs/-relative path anchors the href
    // resolution. An href resolving to exactly the tree's meta.md
    // opens the synthetic meta record. Links inside rendered prose —
    // and inside the reader — reach every record the tree lists, plus
    // the two tree-wide documents (spec-view-7).
    const record = recordForHref(source.sourcePath, href, [
      ...tree.decisions,
      ...tree.intents,
      META_RECORD,
      MAP_RECORD,
    ]);
    if (record) {
      if (source.inReader) openRecord(record, undefined, reader?.origin);
      else openRecord(record, source.focusId);
      return;
    }
    // A citation-shaped link that is neither a live item nor a
    // record gets the SPECV-6 "not found" note; jumpTo owns that
    // path. Record links are tried first because their label ("DR-011")
    // is citation-shaped too. The source's prefix keeps the note off
    // the identically keyed citation rows.
    if (target) {
      jumpTo(`${source.noteKey}:${target}`, target, originOf(source));
      return;
    }
    // Anything else (sibling spec files, map.md) is inert: no
    // navigation ever happens inside the view.
  }

  function onBodyLinkClick(itemId: string, event: ReactMouseEvent) {
    followLink(itemSource(itemId), event);
  }

  /** The item a rendered link cites, for the preview: the ID a click
   * would jump to, an ID absent from the tree included — and nothing
   * for a record link or a web URL, which a click sends elsewhere
   * (spec-view-6). */
  function linkCitation(
    source: LinkSource,
    anchor: Element,
  ): string | undefined {
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:\/\//.test(href)) return undefined;
    const candidates = linkItemTargets(anchor.textContent ?? "", href);
    const target = candidates.find((c) => itemIndex.has(c)) ?? candidates[0];
    if (!target) return undefined;
    if (itemIndex.has(target)) return target;
    return recordForHref(source.sourcePath, href, [
      ...tree.decisions,
      ...tree.intents,
      META_RECORD,
      MAP_RECORD,
    ])
      ? undefined
      : target;
  }

  /** An inline citation raises the same card as a citation row —
   * settled hover, or focus at once (spec-view-61). Rendered prose's
   * anchors are the markdown's, not React's, so the handler is
   * delegated from the prose's container. */
  function previewLink(
    source: LinkSource,
    event: ReactMouseEvent | ReactFocusEvent,
    immediate: boolean,
  ) {
    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!(anchor instanceof HTMLElement)) return;
    const target = linkCitation(source, anchor);
    if (!target) return;
    const raise = immediate ? preview.focus : preview.hover;
    raise(anchor, target, `${source.noteKey}:${target}`);
  }

  function onBodyLinkPreview(
    itemId: string,
    event: ReactMouseEvent | ReactFocusEvent,
    immediate: boolean,
  ) {
    previewLink(itemSource(itemId), event, immediate);
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

  // A record or the decision records' list stands over the specs
  // rather than replacing them, so returning finds the selection,
  // expansion, scroll and camera as they were (spec-view-7).
  const readerView = reader ? (
      <div
        className="relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-6"
        data-testid="record-reader"
      >
        {/* Over the specs, their live region speaks for it. */}
        {!tree.present || tree.legacy ? liveRegion : null}
        <div className="flex items-center gap-2">
          <button
            ref={readerBackRef}
            type="button"
            data-testid="reader-back"
            onClick={() => {
              // Asked from another surface, Back leads there
              // (spec-view-57); picked here, to the tree.
              const origin = reader.origin;
              setReader(null);
              if (origin) props.onReturn?.(origin);
            }}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {reader.origin
              ? i18n._("← Back to {surface}", {
                  surface: ORIGIN_NAMES[reader.origin.surface](),
                })
              : recordsOpen
                ? i18n._("← Back to decision records")
                : i18n._("← Back to specs")}
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
              {i18n._({ id: "Edit", comment: "open this file in the editor" })}
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
            {i18n._("reading {id}…", { id: reader.record.id })}
          </div>
        ) : reader.error ? (
          <div className="flex items-center gap-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <span className="min-w-0 flex-1">{reader.error}</span>
            <button
              type="button"
              onClick={() => openRecord(reader.record, undefined, reader.origin)}
              className="rounded-md border border-red-300 px-2 py-0.5 text-xs hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900"
            >
              {i18n._({ id: "Retry", comment: "read the record again" })}
            </button>
          </div>
        ) : (
          <div
            className="relative overflow-x-auto"
            data-testid="reader-body"
            onClick={(event) =>
              followLink(
                {
                  sourcePath: reader.record.path,
                  focusId: "",
                  noteKey: "reader",
                  inReader: true,
                },
                event,
              )
            }
          >
            <Markdown text={reader.markdown ?? ""} hideComments />
          </div>
        )}
      </div>
  ) : null;

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
        aria-label={i18n._("Copy command {command}", { command })}
        onClick={() => copyText(command)}
        className={COPY_BUTTON_CLASS}
      >
        {copiedId === command
          ? i18n._({ id: "Copied ✓", comment: "the copy control, just after it copied" })
          : copyFailedId === command
            ? i18n._({ id: "Copy failed", comment: "the command could not be copied" })
            : i18n._({ id: "Copy", comment: "copy the command to the clipboard" })}
      </button>
    </div>
  );

  if (readerView && !tree.present) return readerView;

  if (!tree.present) {
    if (props.loading) {
      return (
        <div className="m-auto p-6 text-sm text-neutral-500">
          {i18n._("reading specs…")}
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
        className="relative m-auto flex max-h-full max-w-md flex-col gap-3 overflow-y-auto p-6 text-center text-sm text-neutral-500"
        data-testid="specs-empty"
      >
        {liveRegion}
        <h1 className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">
          {i18n._({ id: "Specs", comment: "the spec view's own heading" })}
        </h1>
        <p>
          <Rich
            text={i18n._(
              "No <0>specs/</0> directory yet — it holds spec packages and decision and intent records.",
            )}
            components={[<span className="font-mono" key="specs" />]}
          />
        </p>
        <p>{i18n._("Scaffold one in the project directory:")}</p>
        {/* The CLI's bare command prints its usage; `scaffold` writes
            the tree (spec-view-9). */}
        {copyCommand("npx @sublang/spex scaffold")}
        {props.onSeedExample ? (
          <div>
            <button
              type="button"
              data-testid="specs-empty-academy"
              onClick={props.onSeedExample}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              {i18n._("Try the Academy example")}
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

  /** The tree's two documents, in the outline pane's footer outside
   * its scroll, named by file and use; every tree form carries the
   * same footer (spec-view-7). */
  const recordsFooter = (placement: string): ReactNode => (
    <div
      data-testid="records-footer"
      className={`flex flex-wrap items-center gap-x-1.5 border-neutral-200 text-xs text-neutral-500 dark:border-neutral-800 ${placement}`}
    >
      <span className="mr-1">
        {i18n._({ id: "Reference", comment: "spec view footer: the records beside the specs" })}
      </span>
      {tree.decisions.length > 0 ? (
        <>
          <button
            id="specv-records-decisions"
            type="button"
            data-testid="records-decisions"
            onClick={openRecordsList}
            className="hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            {i18n._("decision records {count}", { count: tree.decisions.length })}
          </button>
          <span aria-hidden="true">·</span>
        </>
      ) : null}
      <button
        id="specv-records-map"
        type="button"
        data-testid="records-map"
        onClick={() => openRecord(MAP_RECORD, "specv-records-map")}
        className="hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        {i18n._({
          id: "map.md index",
          comment: "spec view footer link: the tree's index file",
        })}
      </button>
      <span aria-hidden="true">·</span>
      <button
        id="specv-records-meta"
        type="button"
        data-testid="records-meta"
        onClick={() => openRecord(META_RECORD, "specv-records-meta")}
        className="hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        {i18n._({
          id: "meta.md spec format",
          comment: "spec view footer link: the file defining how specs are written",
        })}
      </button>
    </div>
  );

  /** The decision records' list (spec-view-7): newest first, filtered
   * by ID and title, each row with its summary from map.md. */
  const recordsQuery = recordsFilter.trim().toLowerCase();
  const listedRecords = [...tree.decisions]
    .sort((a, b) => recordNumber(b.id) - recordNumber(a.id))
    .filter(
      (record) =>
        !recordsQuery ||
        record.id.toLowerCase().includes(recordsQuery) ||
        record.title.toLowerCase().includes(recordsQuery),
    );
  const recordsView = recordsOpen ? (
    <div
      className="relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-6"
      data-testid="records-list"
    >
      <div>
        <button
          ref={recordsBackRef}
          type="button"
          data-testid="records-back"
          onClick={closeRecordsList}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {i18n._("← Back to specs")}
        </button>
      </div>
      <div>
        <h1 className="text-lg font-semibold">
          {i18n._({ id: "Decision records", comment: "heading of the decision records' list" })}
          <span className="ml-2 text-sm font-normal text-neutral-500">
            {i18n._("{count, plural, one {# record} other {# records}}", {
              count: tree.decisions.length,
            })}
          </span>
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          {i18n._(
            "Each record states a design decision's context and reasons; spec items cite them by their DR number.",
          )}
        </p>
      </div>
      <input
        type="search"
        data-testid="records-filter"
        value={recordsFilter}
        onChange={(event) => setRecordsFilter(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && recordsFilter) {
            event.preventDefault();
            setRecordsFilter("");
          }
        }}
        placeholder={i18n._("Filter — number or title…")}
        aria-label={i18n._("Filter decision records by number or title")}
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
      <ul className="flex flex-col">
        {listedRecords.map((record) => {
          const summary = summaries.get(record.id);
          const open = () => openRecord(record, `specv-record-${record.id}`);
          return (
            <li
              key={record.path}
              className="border-b border-neutral-200 py-1 dark:border-neutral-800"
            >
              {/* The one record row (dashboard-40), its summary beneath. */}
              <RecordRow
                id={`specv-record-${record.id}`}
                data-testid={`record-${record.id}`}
                record={record}
                onClick={open}
                className="w-full py-0.5 text-sm"
              />
              {summary ? (
                <div
                  data-testid={`record-summary-${record.id}`}
                  onClick={open}
                  className="cursor-pointer truncate pl-1 text-xs text-neutral-500"
                >
                  {summary}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {listedRecords.length === 0 ? (
        <p className="text-sm text-neutral-500">{i18n._("No decision record matches.")}</p>
      ) : null}
    </div>
  ) : null;
  const overlay = readerView ?? recordsView;

  // A legacy layout — user/dev/test group directories or a
  // compositions/ collection — renders migration guidance instead of
  // a tree (SPECV-18).
  if (tree.legacy) {
    if (overlay) return overlay;
    return (
      <div
        className="relative m-auto flex max-h-full max-w-md flex-col gap-3 overflow-y-auto p-6 text-center text-sm text-neutral-500"
        data-testid="specs-legacy"
      >
        {liveRegion}
        {/* A key phrase where it applies (DR-069); which directories
            mark the layout rides the heading's title. */}
        <h1
          className="text-lg font-semibold text-neutral-700 dark:text-neutral-200"
          title={i18n._(
            "Its specs/ tree holds an earlier layout's directories: the user/, dev/, test/ or items/ groups, or an interactions/ or compositions/ collection.",
          )}
        >
          {i18n._("This project uses a legacy specs layout")}
        </h1>
        <p>
          {i18n._(
            "This command refreshes the spec law and prints a migration prompt for an AI agent to apply:",
          )}
        </p>
        {copyCommand("npx @sublang/spex scaffold --update")}
        {/* A legacy tree parses no packages, but its records are read
            all the same and stay reachable, through the same footer
            (spec-view-18, spec-view-7). */}
        {recordsFooter("justify-center border-t pt-3")}
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
    // a glance; intra-file wiring never counts, and a citation of an
    // absent ID stands apart as the unresolved count (SPECV-19).
    const fileCites = citations.rollups.get(key);
    const rollup = fileCites
      ? citationSummary(fileCites.out, fileCites.in)
      : undefined;
    const unresolved = citations.unresolved.get(key) ?? 0;
    const unresolvedSays = i18n._(
      "{count, plural, one {# citation names an item} other {# citations name items}} absent from the tree",
      { count: unresolved },
    );

    return (
      // The row fits its own width (spec-view-1, DR-041): the intent
      // yields first, the identifier chip then truncates, and below
      // @md the rollup rides the row's title while an unresolved count
      // stays as a compact mark.
      <li
        key={key}
        data-testid={`file-${key}`}
        className="@container"
        style={{ scrollMarginTop: headHeight }}
      >
        {/* Expanded, the header pins beneath the heading row while its
            contents scroll, so the package's name stays in sight; the
            selection's outline is drawn inside the row so no scroll box
            clips it (spec-view-2, spec-view-42). The whole row is the
            package's one target: a click anywhere on it acts as its
            button does, and the button's keyboard focus rings the row. */}
        <div
          data-testid={`file-row-${key}`}
          onClick={() => activateFile(key)}
          title={rollup ? i18n._("Citations: {summary}", { summary: rollup }) : undefined}
          style={expanded ? { top: graphful ? headHeight : `calc(${headHeight}px - 1.5rem)` } : undefined}
          className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 @xs:gap-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-brand-600 dark:has-[:focus-visible]:ring-brand-400 ${
            expanded ? "sticky z-[1]" : ""
          } ${dimmed ? "opacity-50" : ""} ${
            selected
              ? "bg-neutral-200 ring-1 ring-inset ring-neutral-700 dark:bg-neutral-800 dark:ring-neutral-300"
              : expanded
                ? "bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-950 dark:hover:bg-neutral-900"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
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
            id={fileDomId(key)}
            data-testid={`file-toggle-${key}`}
            aria-expanded={expanded}
            aria-current={selected ? "true" : undefined}
            aria-label={file.basename}
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
            // The row wears this button's focus ring; the app-wide
            // outline would frame the name alone.
            style={{ outline: "none" }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded text-left"
          >
            {/* The package identifier is the basename (META-10). */}
            <span
              className="min-w-0 truncate rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              title={file.basename}
            >
              {file.basename}
            </span>
            {/* Collapsed keeps the truncated intent; expanded yields
             * to the full prose block below. */}
            {file.intent && !expanded ? (
              // The first thing to yield: below 28rem it leaves the row
              // rather than standing as a fragment (spec-view-1).
              <span
                className="hidden min-w-0 flex-1 truncate text-xs text-neutral-500 @md:inline dark:text-neutral-400"
                title={linksAsText(file.intent)}
              >
                {linksAsText(file.intent)}
              </span>
            ) : null}
          </button>
          {searching && !search.fileKeys.has(key) && selected ? (
            <span
              data-testid={`retained-${key}`}
              className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-xs text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              {i18n._("shown despite search")}
            </span>
          ) : null}
          {/* Numerals in aligned columns under the heading row, one
              column per group still on (spec-view-2). */}
          {GROUP_ORDER.filter((group) => viewState.filters[group]).map(
            (group) => (
              <span
                key={group}
                data-testid={`count-${key}-${group}`}
                aria-label={i18n._("{count} {group} items", {
                  count: counts[group],
                  group: GROUP_WORD[group](),
                })}
                title={i18n._("{count} {group} items", {
                  count: counts[group],
                  group: GROUP_WORD[group](),
                })}
                className={`${COUNT_CELL} text-xs tabular-nums ${
                  counts[group] > 0
                    ? `font-semibold ${GROUP_TEXT[group]}`
                    : "text-neutral-400 dark:text-neutral-600"
                }`}
              >
                {countText(counts[group])}
              </span>
            ),
          )}
          <span
            data-testid={`rollup-${key}`}
            aria-label={
              rollup ? i18n._("Citations: {summary}", { summary: rollup }) : undefined
            }
            className={`${ROLLUP_CELL} whitespace-nowrap text-xs tabular-nums text-neutral-500`}
          >
            {fileCites ? (
              <>
                {countText(fileCites.out)}
                <span aria-hidden="true" className="text-neutral-400 dark:text-neutral-600"> · </span>
                {countText(fileCites.in)}
              </>
            ) : (
              <span className="text-neutral-400 dark:text-neutral-600">—</span>
            )}
          </span>
          {/* Never yields: a package whose only citations name absent
              items must not look uncited (spec-view-19, spec-view-1). */}
          {anyUnresolved ? (
            <span className={UNRESOLVED_CELL}>
              {unresolved > 0 ? (
                // A quality warning, not a property every package has:
                // a neutral mark whose name carries the count, so it
                // stays apart from every hue the page uses
                // (spec-view-19, spec-view-1).
                <span
                  data-testid={`unresolved-${key}`}
                  role="img"
                  aria-label={unresolvedSays}
                  title={unresolvedSays}
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-neutral-400 text-[9px] font-bold leading-none text-neutral-500 dark:border-neutral-500 dark:text-neutral-400"
                >
                  !
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        {expanded ? (
          <div className="ml-[7px] flex flex-col gap-1 border-l border-neutral-200 py-1 pl-4 dark:border-neutral-800">
            {/* The intent reads as an item body does (spec-view-2): its
                citations and record links route as theirs do and raise
                the same card (spec-view-6, spec-view-61). */}
            {file.intent ? (
              <div
                data-testid={`intent-${key}`}
                className="relative max-w-prose overflow-x-auto text-neutral-500 dark:text-neutral-400"
                onClick={(event) => followLink(intentSource(key), event)}
                onMouseOver={(event) =>
                  previewLink(intentSource(key), event, false)
                }
                onMouseOut={preview.close}
                onFocus={(event) => previewLink(intentSource(key), event, true)}
                onBlur={preview.close}
              >
                <Markdown text={file.intent} hideComments />
              </div>
            ) : null}
            {notFoundKey?.startsWith(`intent:${key}:`) ? (
              <div className="flex items-center gap-1 text-xs">
                <span className="font-mono text-neutral-500">
                  {notFoundKey.slice(`intent:${key}:`.length)}
                </span>
                <span className="text-xs text-neutral-500">
                  {i18n._({ id: "not found", comment: "the cited item is not in this tree" })}
                </span>
              </div>
            ) : null}
            {file.notices.map((notice) => (
              <div
                key={notice}
                className="text-xs text-amber-600 dark:text-amber-400"
              >
                {notice}
              </div>
            ))}
            {file.error ? (
              <div className="text-xs text-amber-600 dark:text-amber-400">
                {file.path}: {file.error}
              </div>
            ) : null}
            {/* The items' heading: a rule above it alone sets it off from
                the intent, so it heads the list below rather than standing
                as a row of its own, and its controls read as acting on the
                items and the file (spec-view-2). */}
            {(allIds.length > 0 && items.length > 0) || canEdit ? (
              <div
                data-testid={`items-head-${key}`}
                className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-200 pt-2 dark:border-neutral-800"
              >
                <span className="mr-auto text-xs text-neutral-500">
                  {i18n._("{count, plural, one {# item} other {# items}}", {
                    count: allIds.length,
                  })}
                </span>
                {allIds.length > 0 && items.length > 0 ? (
                  <button
                    type="button"
                    data-testid={`expand-all-${key}`}
                    aria-label={
                      allExpanded
                        ? i18n._("Collapse all items in {name}", { name: file.basename })
                        : i18n._("Expand all items in {name}", { name: file.basename })
                    }
                    onClick={() => setAllItems(file, !allExpanded)}
                    className={`flex items-center gap-1 text-xs ${LINK_CLASS}`}
                  >
                    <Icon name={allExpanded ? "collapseAll" : "expandAll"} className="h-3.5 w-3.5" />
                    {allExpanded ? i18n._("Collapse all items") : i18n._("Expand all items")}
                  </button>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    data-testid={`file-edit-${key}`}
                    aria-label={i18n._("Edit {name}.md", { name: file.basename })}
                    onClick={() =>
                      openEditor(`file:${key}`, `packages/${key}.md`)
                    }
                    className={`flex items-center gap-1 text-xs ${LINK_CLASS}`}
                  >
                    <Icon name="edit" className="h-3.5 w-3.5" />
                    {i18n._({ id: "Edit spec file", comment: "open this package's spec file in the editor" })}
                  </button>
                ) : null}
                {openFailure?.anchor === `file:${key}` ? (
                  <span
                    role="alert"
                    className="text-xs text-red-600 dark:text-red-400"
                  >
                    {openFailure.message}
                  </span>
                ) : null}
              </div>
            ) : null}
            <SpecItemRows
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
              onOpenCitations={openCitations}
              onToggleItem={toggleItem}
              onCopy={copyText}
              onJump={jumpTo}
              onBodyLinkClick={onBodyLinkClick}
              onBodyLinkPreview={onBodyLinkPreview}
              preview={preview}
            />
            {items.length === 0 ? (
              <div className="text-xs text-neutral-500">
                {searching
                  ? i18n._("no items match the search")
                  : i18n._("no items in active groups")}
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
          aria-label={i18n._("Toggle {name}", { name: label ?? `${dir.name}/` })}
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

  // The standing card, laid in the box the outline scrolls in — the
  // outline pane with the graph beside it, the surface root without
  // (spec-view-61, spec-view-59).
  const previewLocation = preview.open
    ? itemIndex.get(preview.open.target)
    : undefined;
  // A summary's card lists the item's citations both ways; an entry's
  // previews the one item it names (spec-view-60, spec-view-61).
  const summaryOf = preview.open?.key.startsWith("summary:")
    ? itemIndex.get(preview.open.key.slice("summary:".length))
    : undefined;
  const entry = (id: string): SummaryEntry => {
    const location = itemIndex.get(id);
    return {
      id,
      item: location?.item,
      chipClass: location ? GROUP_CHIP[location.group] : undefined,
    };
  };
  const previewCard = !preview.open ? null : summaryOf ? (
    <CitationSummaryCard
      open={preview.open}
      cites={summaryOf.item.cites.map(entry)}
      citedBy={(citations.inbound.get(summaryOf.item.id) ?? []).map(entry)}
    />
  ) : (
    <CitationPreview
      open={preview.open}
      item={previewLocation?.item}
      chipClass={
        previewLocation ? GROUP_CHIP[previewLocation.group] : undefined
      }
    />
  );

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

  /** A package row's activation: the selected row, expanded, folds
   * as a file tree's does, the selection standing; otherwise it
   * selects (spec-view-42). */
  const activateFile = (fileKey: string) => {
    if (graphSelection === fileKey && isFileExpanded(fileKey)) toggleFile(fileKey);
    else selectFile(fileKey);
  };

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      {/* Outside the inert specs, so it speaks for whatever stands
          over them too (DR-010 §7). */}
      {liveRegion}
      {overlay ? (
        <div className="absolute inset-0 z-20 flex flex-col bg-neutral-50 dark:bg-neutral-950">
          {overlay}
        </div>
      ) : null}
      <div
        inert={overlay ? true : undefined}
        ref={surfaceRef}
        onKeyDown={(event) => {
          // The citation card is a rung of its own, above the selection
          // (spec-view-61, spec-view-42).
          if (event.key === "Escape" && !event.defaultPrevented && preview.open) {
            event.preventDefault();
            preview.close();
            return;
          }
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
        // The surface root is the box the Specs tab scrolls in (DR-041
        // §9): height-constrained, and the containing block for its own
        // positioned content, so the page itself never scrolls. With the
        // graph shown the outline and the canvas scroll inside it.
        className={
          graphful
            ? "relative flex min-h-0 w-full flex-1 flex-col gap-3 overflow-hidden p-6"
            : "relative mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-6"
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">
            {props.projectName ?? i18n._({ id: "Specs", comment: "the spec view's own heading" })}
          </h1>
          <span className="text-xs text-neutral-500">
            {i18n._(
              "{packages, plural, one {# package} other {# packages}} · {items} items",
              { packages: totals.packages, items: totals.items },
            )}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              data-testid="specs-refresh"
              aria-label={i18n._("Refresh specs")}
              title={i18n._("Re-read the specs/ tree")}
              disabled={props.loading || refresh !== "idle"}
              onClick={startRefresh}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-60 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <Icon
                name="refresh"
                className={`h-4 w-4 ${props.loading || refresh === "reading" ? "animate-spin" : ""}`}
              />
            </button>
            <span data-testid="specs-read-age" className="text-xs text-neutral-500">
              {props.loading || refresh === "reading"
                ? i18n._({ id: "reading…", comment: "the specs tree is being re-read" })
                : refresh === "done"
                  ? i18n._({ id: "read again", comment: "the specs tree was just re-read on request" })
                  : i18n._("read {age}", { age: relativeReadTime(tree.readAt, now) })}
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
          // One toggle, not a mode set: the outline never leaves, so there
          // is no state where nothing is shown. It heads the graph's own
          // line while the graph shows and the outline's filter row while
          // it is hidden, named for its act (spec-view-20).
          const graphToggle = (
            <button
              type="button"
              data-testid="view-graph"
              aria-pressed={viewState.graph}
              aria-label={
                viewState.graph
                  ? i18n._("Hide the citation graph")
                  : i18n._("Show the citation graph")
              }
              title={
                viewState.graph
                  ? i18n._("Hide the citation graph")
                  : i18n._("Show the citation graph")
              }
              onClick={() => onViewState({ ...viewState, graph: !viewState.graph })}
              // The glyph says which way the graph goes; no fill marks a
              // pressed state the direction already tells (spec-view-20).
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <Icon name={viewState.graph ? "paneFold" : "paneOpen"} className="h-5 w-5" />
            </button>
          );
          // The walk back from in-view jumps, at the outline's head where
          // the reader looks after landing (spec-view-6).
          const lastOrigin = jumpOrigins[jumpOrigins.length - 1];
          const jumpBack = lastOrigin ? (
            <button
              type="button"
              data-testid="jump-back"
              onClick={popJumpOrigin}
              title={i18n._("Return (Alt+Left)")}
              className={`mb-2 flex shrink-0 items-center gap-1 self-start rounded px-1 py-0.5 text-xs ${LINK_CLASS}`}
            >
              <span aria-hidden="true">←</span>
              {"item" in lastOrigin
                ? i18n._("back to {id}", { id: lastOrigin.item })
                : i18n._("back to {name}'s intent", {
                    name:
                      tree.files.find((file) => file.key === lastOrigin.intent)?.basename ??
                      lastOrigin.intent,
                  })}
              {jumpOrigins.length > 1 ? (
                <span className="text-neutral-500">
                  {i18n._("({count} steps)", { count: jumpOrigins.length })}
                </span>
              ) : null}
            </button>
          ) : null;
          const outlineControls = (
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 pb-2">
              {graphful ? null : graphToggle}
              {GROUP_ORDER.map((group) => {
                const on = viewState.filters[group];
                return (
                  // A filter, read as one: a checkbox filled in the
                  // group's color with a check when pressed, an empty box
                  // beside a muted name when not; the title says what the
                  // group holds (spec-view-4).
                  <button
                    key={group}
                    type="button"
                    data-testid={`filter-${group}`}
                    aria-pressed={on}
                    title={GROUP_DEFINITION[group]()}
                    onClick={() => toggleFilter(group)}
                    className={`flex items-center gap-1.5 rounded py-0.5 text-xs ${
                      on ? `font-medium ${GROUP_TEXT[group]}` : "text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      data-testid={`filter-box-${group}`}
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border ${
                        on ? FILTER_BOX[group] : "border-neutral-400 bg-white dark:border-neutral-500 dark:bg-neutral-900"
                      }`}
                    >
                      {on ? (
                        <Icon name="check" className="h-3 w-3 text-white dark:text-neutral-950" />
                      ) : null}
                    </span>
                    <span className="@md:hidden">{GROUP_SHORT[group]()}</span>
                    <span className="hidden @md:inline">{GROUP_NAME[group]()}</span>
                    <span
                      aria-label={i18n._("{count} {group} items", {
                        count: totals.perGroup[group],
                        group: GROUP_WORD[group](),
                      })}
                      className="tabular-nums"
                    >
                      {totals.perGroup[group].toLocaleString(i18n.locale)}
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
                placeholder={i18n._("Filter items — ID or text…")}
                aria-label={i18n._("Filter items by ID or text")}
                className="min-w-40 flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
              />
              {searching ? (
                <button
                  type="button"
                  data-testid="search-clear"
                  aria-label={i18n._("Clear the search")}
                  title={i18n._("Clear the search (Escape)")}
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
                  {i18n._("{count, plural, one {# match} other {# matches}}", {
                    count: search.count,
                  })}
                </span>
              ) : null}
            </div>
          );

          // What a filter hides is said where the filters stand, with
          // one way back (spec-view-4).
          const hiddenGroups = GROUP_ORDER.filter(
            (group) => !viewState.filters[group],
          );
          const hiddenLine =
            hiddenGroups.length > 0 ? (
              <div
                data-testid="hidden-groups"
                className="flex shrink-0 flex-wrap items-center gap-x-2 pb-2 text-xs text-neutral-500"
              >
                <span>
                  {i18n._("Hidden: {groups}", {
                    groups: hiddenGroups
                      .map((group) =>
                        i18n._("{group} ({count})", {
                          group: GROUP_NAME[group](),
                          count: totals.perGroup[group],
                        }),
                      )
                      .join(i18n._({ id: ", ", comment: "list separator" })),
                  })}
                </span>
                <button
                  type="button"
                  data-testid="show-all-groups"
                  onClick={showAllGroups}
                  className={LINK_CLASS}
                >
                  {i18n._({ id: "Show all", comment: "turn every item group back on" })}
                </button>
              </div>
            ) : null;

          // One heading row over the package rows' columns, pinned while
          // they scroll (spec-view-2). The chevron and name take the
          // slack, so the cells line up with the rows' own.
          const columnHeads =
            tree.files.length > 0 ? (
              <div
                ref={headRef}
                data-testid="outline-columns"
                // Pinned at the scroll box's own edge: alone, the outline
                // scrolls in the padded surface root, so the heading row
                // rides up over that padding rather than letting rows
                // show above it.
                className={`sticky ${graphful ? "top-0" : "-top-6"} z-[2] flex items-end gap-1 @xs:gap-2 border-b border-neutral-200 bg-neutral-50 px-1 pb-1 pt-0.5 text-xs leading-tight text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950`}
              >
                <span className="min-w-0 flex-1" />
                {GROUP_ORDER.filter((group) => viewState.filters[group]).map(
                  (group) => (
                    <span
                      key={group}
                      data-testid={`column-${group}`}
                      title={GROUP_NAME[group]()}
                      aria-label={GROUP_NAME[group]()}
                      className={`${COUNT_CELL} ${GROUP_TEXT[group]}`}
                    >
                      <span className="@md:hidden">{GROUP_SHORT[group]()}</span>
                      <span className="hidden @md:inline">{GROUP_NAME[group]()}</span>
                    </span>
                  ),
                )}
                <span
                  data-testid="column-rollup"
                  title={i18n._("Citations across packages: cites · cited by")}
                  className={ROLLUP_CELL}
                >
                  {i18n._({
                    id: "cites · cited by",
                    comment: "outline column heading: citations between packages, out and in",
                  })}
                </span>
                {anyUnresolved ? (
                  <span aria-hidden="true" className={UNRESOLVED_CELL} />
                ) : null}
              </div>
            ) : null;

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
          /** The share bounded by the panes' pixel floors — a 320px graph,
           * a 28rem outline beside the divider — within the persisted
           * share's own range (spec-view-20). */
          const boundShare = (fraction: number): number => {
            const width = splitRef.current?.getBoundingClientRect().width ?? 0;
            const rem = parseFloat(
              getComputedStyle(document.documentElement).fontSize || "16",
            ) || 16;
            const low = width > 0 ? Math.max(MIN_GRAPH_WIDTH, GRAPH_FLOOR_PX / width) : MIN_GRAPH_WIDTH;
            const high =
              width > 0
                ? Math.min(MAX_GRAPH_WIDTH, 1 - (OUTLINE_FLOOR_REM * rem + DIVIDER_PX) / width)
                : MAX_GRAPH_WIDTH;
            return Math.min(Math.max(low, high), Math.max(low, fraction));
          };
          const commitSplit = (fraction: number) => {
            setDragSplit(null);
            onViewState({ ...viewState, graphWidth: boundShare(fraction) });
          };
          const fractionAt = (clientX: number): number | null => {
            const box = splitRef.current?.getBoundingClientRect();
            if (!box || !box.width) return null;
            return boundShare((clientX - box.left) / box.width);
          };

          return graphful ? (
            // The split answers its own pane's width, not the window's
            // (DR-041): side by side while it holds both pixel floors
            // (spec-view-20), stacked below
            // it. Each half keeps a readable floor and the split itself
            // scrolls when the surface cannot hold both, so neither is
            // squeezed to nothing under the root's clip (spec-view-59).
            // Beside the outline the split takes the box's own height,
            // and the graph's half is a column its pane grows in, so the
            // drawing surface fills the half in either arrangement
            // instead of resting at an svg's default height. The half's
            // floor holds in both arrangements: a box shorter than it
            // scrolls, as it does for the outline's floor.
            <div
              ref={outlineBoxRef}
              className="@container/split relative flex min-h-0 flex-1 items-start overflow-y-auto"
            >
            <div
              ref={splitRef}
              className="flex min-h-full w-full flex-col gap-4 @min-[49rem]:h-full @min-[49rem]:flex-row @min-[49rem]:gap-0"
            >
              {/* Side by side only while the box holds a 320px graph
                  beside a 28rem outline; the share is clamped between
                  those floors whatever was persisted (spec-view-20). */}
              <div
                className="flex min-h-[34rem] flex-1 flex-col @min-[49rem]:h-full @min-[49rem]:w-[clamp(320px,var(--graph-share),calc(100%-28rem-17px))] @min-[49rem]:flex-none"
                style={{ ["--graph-share" as string]: `${share * 100}%` }}
              >
                <SpecGraph
                  files={tree.files}
                  selectedKey={graphSelection}
                  matchedKeys={search.fileKeys}
                  searching={searching}
                  onClearSelection={() => setGraphSelection(null)}
                  onOpenFile={selectFile}
                  toggle={graphToggle}
                />
              </div>
              {/* The reader sets the balance, within bounds that keep
                  both panes readable (spec-view-20). */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={i18n._("Resize the graph pane")}
                aria-valuenow={Math.round((dragSplit ?? viewState.graphWidth) * 100)}
                aria-valuemin={Math.round(MIN_GRAPH_WIDTH * 100)}
                aria-valuemax={Math.round(MAX_GRAPH_WIDTH * 100)}
                tabIndex={0}
                data-testid="graph-split"
                className="group hidden shrink-0 cursor-col-resize items-stretch px-2 @min-[49rem]:flex"
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
              <div className="@container flex min-h-[22rem] min-w-0 flex-1 flex-col @min-[49rem]:min-h-40">
                {outlineControls}
                {jumpBack}
                {hiddenLine}
                {/* Its own scroll box only beside the graph; stacked, the
                    split scrolls as one and the heading row pins to it. */}
                <div className="relative min-h-0 pr-1 @min-[49rem]/split:overflow-y-auto">
                  {columnHeads}
                  <ul data-testid="specs-outline" className="flex flex-col">
                    {outline}
                  </ul>
                </div>
                {recordsFooter("mt-auto shrink-0 border-t pt-2")}
              </div>
            </div>
            {/* The card belongs to the box that scrolls the split, so it
                is placed against what the reader can see (spec-view-61). */}
            {previewCard}
            </div>
          ) : (
            <div className="@container flex flex-col">
              {outlineControls}
              {jumpBack}
              {hiddenLine}
              {columnHeads}
              <ul data-testid="specs-outline" className="flex flex-col">
                {outline}
              </ul>
              {tree.files.length === 0 ? (
                <div className="text-sm text-neutral-500">
                  {i18n._("specs/ is present but holds no spec files yet.")}
                </div>
              ) : null}
              {previewCard}
              {/* Below the outline's scroll, held at the surface's foot
                  while it scrolls (spec-view-7). */}
              {recordsFooter(
                "sticky -bottom-6 z-[1] -mx-6 mt-2 border-t bg-neutral-50 px-6 py-2 dark:bg-neutral-950",
              )}
            </div>
          );
        })()}

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
        {i18n._({ id: "Retry", comment: "read the specs tree again" })}
      </button>
    </div>
  );
}

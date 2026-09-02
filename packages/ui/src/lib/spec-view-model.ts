// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pure view-model helpers for the spec view (SPECV; DR-011 as amended
// by DR-015): directory tree shaping over the flat packages-collection
// file list, counts, the plain citation model (backlinks and per-file
// rollups), search matching, inline-link resolution, and relative time
// — no DOM, so logic stays testable without rendering.

import type {
  SpecFileInfo,
  SpecGroup,
  SpecItemInfo,
  SpecRecordInfo,
} from "@sublang/spex-core/protocol";

export type { SpecGroup };

/** Filter toggle and count order (DR-015 group model). */
export const GROUP_ORDER: readonly SpecGroup[] = [
  "external",
  "internal",
  "test",
];

// ---------------------------------------------------------------------------
// View state (lifted to the host so it survives project switches)
// ---------------------------------------------------------------------------

export interface SpecViewState {
  filters: { external: boolean; internal: boolean; test: boolean };
  search: string;
  /** File keys (collection-relative path minus .md) with the node
   * expanded. */
  expandedFiles: string[];
  /** Item IDs with the full body expanded. */
  expandedItems: string[];
  /** Whether the citation graph stands beside the outline; the
   * outline itself is permanent (spec-view-20). */
  graph: boolean;
  /** The graph pane's share of the split, as a fraction of the
   * surface's width (spec-view-20). */
  graphWidth: number;
  /** The whole-file editor standing for this project, draft included
   * (spec-view-51). */
  editor?: SpecEditorState;
}

/** The editor's lifted state (spec-view-51): the draft lives here, not
 * in the component, so it survives the workspace's own navigation. */
export interface SpecEditorState {
  /** specs/-relative path of the file under edit. */
  path: string;
  /** The text as specs.read served it; the draft compares to it. */
  original: string;
  draft: string;
  /** The version token the read handed out (spec-view-47); absent
   * when the read carried none, and the save then overwrites. */
  version?: string;
  preview: boolean;
  /** Zero-based line the text field lands its caret on when it
   * mounts — the item's heading when opened from an item
   * (spec-view-48); consumed by that landing. */
  caretLine?: number;
}

/** The split's bounds: neither pane may be squeezed past reading
 * (spec-view-20). */
export const MIN_GRAPH_WIDTH = 0.25;
export const MAX_GRAPH_WIDTH = 0.65;

export const initialSpecViewState: SpecViewState = {
  filters: { external: true, internal: true, test: true },
  search: "",
  expandedFiles: [],
  expandedItems: [],
  graph: true,
  graphWidth: 0.4,
};

/** Coerce a possibly-stale persisted view state to the current shape.
 * The pre-DR-015 shape (user/dev/test filters, expandedPackages) — or
 * anything else unrecognizable — resets to defaults instead of
 * crashing the view. */
export function normalizeSpecViewState(value: unknown): SpecViewState {
  if (typeof value !== "object" || value === null) {
    return initialSpecViewState;
  }
  const state = value as {
    filters?: Record<string, unknown>;
    search?: unknown;
    expandedFiles?: unknown;
    expandedItems?: unknown;
    graph?: unknown;
    graphWidth?: unknown;
    editor?: unknown;
  };
  const strings = (entry: unknown): entry is string[] =>
    Array.isArray(entry) && entry.every((e) => typeof e === "string");
  if (
    typeof state.filters !== "object" ||
    state.filters === null ||
    GROUP_ORDER.some((group) => typeof state.filters?.[group] !== "boolean") ||
    typeof state.search !== "string" ||
    !strings(state.expandedFiles) ||
    !strings(state.expandedItems)
  ) {
    return initialSpecViewState;
  }
  // The graph fields joined the persisted state after the ones above;
  // a state written before them stays valid and takes the defaults
  // (spec-view-20).
  const graph =
    typeof state.graph === "boolean" ? state.graph : initialSpecViewState.graph;
  const graphWidth =
    typeof state.graphWidth === "number" &&
    state.graphWidth >= MIN_GRAPH_WIDTH &&
    state.graphWidth <= MAX_GRAPH_WIDTH
      ? state.graphWidth
      : initialSpecViewState.graphWidth;
  // An editor of the wrong shape is dropped rather than rendered
  // (spec-view-51): a draft is never worth a crash, and nothing
  // persisted this shape before the editor existed.
  const editor = validEditor(state.editor) ? state.editor : undefined;
  if (
    graph !== state.graph ||
    graphWidth !== state.graphWidth ||
    editor !== state.editor
  ) {
    const { editor: _dropped, ...rest } = value as SpecViewState;
    return { ...rest, graph, graphWidth, ...(editor ? { editor } : {}) };
  }
  return value as SpecViewState;
}

function validEditor(value: unknown): value is SpecEditorState {
  if (typeof value !== "object" || value === null) return false;
  const editor = value as Record<string, unknown>;
  return (
    typeof editor.path === "string" &&
    typeof editor.original === "string" &&
    typeof editor.draft === "string" &&
    (editor.version === undefined || typeof editor.version === "string") &&
    typeof editor.preview === "boolean" &&
    (editor.caretLine === undefined || typeof editor.caretLine === "number")
  );
}

// ---------------------------------------------------------------------------
// The editor (spec-view-48 to spec-view-51)
// ---------------------------------------------------------------------------

/** Whether a project's editor holds unsaved text (spec-view-49). */
export function editorDirty(state: SpecViewState | undefined): boolean {
  return (
    state?.editor !== undefined && state.editor.draft !== state.editor.original
  );
}

/** A specs/-relative path the records reader serves — a record or one
 * of the two tree-wide documents (spec-view-7) — so a saved or
 * cancelled edit of it closes into the reader (spec-view-50). */
export function isRecordPath(path: string): boolean {
  return (
    /^(decisions|intents|iterations)\//.test(path) ||
    path === "meta.md" ||
    path === "map.md"
  );
}

/** The collection-relative file key of a package path, the way the
 * outline keys its nodes (`packages/<key>.md` → `<key>`). */
export function fileKeyOf(path: string): string | undefined {
  return path.startsWith("packages/") && path.endsWith(".md")
    ? path.slice("packages/".length, -".md".length)
    : undefined;
}

/** The zero-based line of `id`'s item heading in a file's text, for
 * the editor's caret (spec-view-48); undefined when absent. */
export function headingLine(text: string, id: string): number | undefined {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^#{3,4}\\s+${escaped}\\s*$`, "i");
  const index = text
    .split("\n")
    .findIndex((line) => pattern.test(line.replace(/\r$/, "")));
  return index === -1 ? undefined : index;
}

// ---------------------------------------------------------------------------
// Directory tree
// ---------------------------------------------------------------------------

export interface SpecDirNode {
  /** Last path segment; the collection label on the root. */
  name: string;
  /** Collapse key: "packages" on the root, "packages/<dir>" below —
   * the collection segment keeps a subdirectory literally named
   * "packages" from colliding with the root. */
  path: string;
  dirs: SpecDirNode[];
  files: SpecFileInfo[];
}

/** The packages-collection outline root nesting collection-directory
 * nodes and file nodes. Directories sort by name; files by basename
 * within their directory (DR-011). */
export function buildDirTree(files: SpecFileInfo[]): SpecDirNode {
  const root: SpecDirNode = {
    name: "Packages",
    path: "packages",
    dirs: [],
    files: [],
  };
  const byPath = new Map<string, SpecDirNode>([["", root]]);
  const dirNode = (path: string): SpecDirNode => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf("/");
    const parent = dirNode(slash === -1 ? "" : path.slice(0, slash));
    const node: SpecDirNode = {
      name: slash === -1 ? path : path.slice(slash + 1),
      path: `packages/${path}`,
      dirs: [],
      files: [],
    };
    parent.dirs.push(node);
    byPath.set(path, node);
    return node;
  };
  for (const file of files) dirNode(file.dir).files.push(file);
  const sortNode = (node: SpecDirNode): void => {
    node.dirs.sort((a, b) => a.name.localeCompare(b.name));
    node.files.sort((a, b) =>
      a.basename.toUpperCase().localeCompare(b.basename.toUpperCase()),
    );
    node.dirs.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

/** Collapse keys above a file, outermost first: the collection root,
 * then each ancestor directory (e.g. "a/b" → ["packages",
 * "packages/a", "packages/a/b"]). */
export function ancestorKeys(dir: string): string[] {
  const keys: string[] = ["packages"];
  if (dir) {
    const segments = dir.split("/");
    for (let index = 0; index < segments.length; index += 1) {
      keys.push(`packages/${segments.slice(0, index + 1).join("/")}`);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export function fileCounts(file: SpecFileInfo): Record<SpecGroup, number> {
  const counts: Record<SpecGroup, number> = {
    external: 0,
    internal: 0,
    test: 0,
  };
  for (const item of file.items) counts[item.group] += 1;
  return counts;
}

export function treeCounts(files: SpecFileInfo[]): {
  perGroup: Record<SpecGroup, number>;
  items: number;
  packages: number;
} {
  const perGroup: Record<SpecGroup, number> = {
    external: 0,
    internal: 0,
    test: 0,
  };
  for (const file of files) {
    for (const item of file.items) perGroup[item.group] += 1;
  }
  return {
    perGroup,
    items: perGroup.external + perGroup.internal + perGroup.test,
    packages: files.length,
  };
}

// ---------------------------------------------------------------------------
// Citation model (SPECV-19; META-14): the citation is the only
// relationship between packages — no derived classes, no relationship
// metadata. Outbound rows come straight from an item's cites in
// document order; the model adds the inverted index and the per-file
// rollups.
// ---------------------------------------------------------------------------

export interface ItemLocation {
  /** File key (collection-relative path minus .md). */
  fileKey: string;
  /** specs/-relative file path, anchoring record-link resolution. */
  sourcePath: string;
  /** Collection subdirectory, for ancestor collapse keys. */
  dir: string;
  group: SpecGroup;
  item: SpecItemInfo;
}

/** Item ID → location, for citation jumps. */
export function buildItemIndex(
  files: SpecFileInfo[],
): Map<string, ItemLocation> {
  const index = new Map<string, ItemLocation>();
  for (const file of files) {
    for (const item of file.items) {
      index.set(item.id, {
        fileKey: file.key,
        sourcePath: `packages/${file.key}.md`,
        dir: file.dir,
        group: item.group,
        item,
      });
    }
  }
  return index;
}

/** Group of an indexed item, for citation-entry rendering; undefined
 * for a dead target so the caller renders the entry unclassified. */
export function groupOf(
  index: Map<string, ItemLocation>,
  id: string,
): SpecGroup | undefined {
  return index.get(id)?.group;
}

export interface CitationModel {
  /** Cited item ID → citing item IDs in encounter order — complete,
   * intra-file citers included; the citing side is already
   * de-duplicated per item by the parse. */
  inbound: Map<string, string[]>;
  /** File key → cross-file citation totals: only citations whose
   * source and target items live in different files count, so
   * intra-file wiring never inflates a file row. A dead outbound
   * target still counts out (the citation exists); inbound accrues
   * only to items the file actually has. Files with neither
   * direction are absent. */
  rollups: Map<string, { out: number; in: number }>;
}

/** Index every citation in the tree: complete backlinks on the cited
 * target, cross-file-only totals on the per-file rollups (SPECV-19). */
export function buildCitationModel(files: SpecFileInfo[]): CitationModel {
  const fileOf = new Map<string, string>();
  const inbound = new Map<string, string[]>();
  for (const file of files) {
    for (const item of file.items) {
      fileOf.set(item.id, file.key);
      for (const target of item.cites) {
        const list = inbound.get(target);
        if (list) list.push(item.id);
        else inbound.set(target, [item.id]);
      }
    }
  }
  const rollups = new Map<string, { out: number; in: number }>();
  for (const file of files) {
    let out = 0;
    let inn = 0;
    for (const item of file.items) {
      for (const target of item.cites) {
        // A dead target has no file, so the mismatch counts it out.
        if (fileOf.get(target) !== file.key) out += 1;
      }
      for (const citer of inbound.get(item.id) ?? []) {
        if (fileOf.get(citer) !== file.key) inn += 1;
      }
    }
    if (out > 0 || inn > 0) rollups.set(file.key, { out, in: inn });
  }
  return { inbound, rollups };
}

/** "cites N · cited by M" — the collapsed-row hint and the file-header
 * rollup share one wording; a zero side drops, both zero yields
 * undefined so the caller renders nothing. */
export function citationSummary(
  outbound: number,
  inbound: number,
): string | undefined {
  const parts: string[] = [];
  if (outbound > 0) parts.push(`cites ${outbound}`);
  if (inbound > 0) parts.push(`cited by ${inbound}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

// ---------------------------------------------------------------------------
// Inline-link resolution (citations live in item bodies per META-20)
// ---------------------------------------------------------------------------

// Old-generation ALLCAPS ids and current-generation lowercase kebab
// ids (meta-11) both jump; a served tree indexes one or the other.
const OLD_ITEM_ID = /^[A-Z][A-Z0-9]*-\d+$/;
const NEW_ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/;
const ITEM_ID_PATTERN = /^(?:[A-Z][A-Z0-9]*|[a-z0-9]+(?:-[a-z0-9]+)*)-\d+$/;

/** The item IDs an inline markdown link may target: the link text
 * when it is a bare item ID, else the href's `#anchor` read as a
 * current-generation id and as an old-generation anchor (whose
 * heading uppercased). An anchor like `auth-3` is ambiguous between
 * generations, so both spellings are returned and the caller picks
 * the one the tree actually indexes. Empty for every other link. */
export function linkItemTargets(text: string, href: string): string[] {
  const trimmed = text.trim();
  if (ITEM_ID_PATTERN.test(trimmed)) return [trimmed];
  const hash = href.indexOf("#");
  if (hash === -1) return [];
  const anchor = href.slice(hash + 1);
  const candidates: string[] = [];
  if (NEW_ITEM_ID.test(anchor)) candidates.push(anchor);
  const upper = anchor.toUpperCase();
  if (OLD_ITEM_ID.test(upper)) candidates.push(upper);
  return candidates;
}

/** The DR/IR record an inline link's relative href points at.
 * The href is resolved against the citing file's specs/-relative
 * path — hrefs are file-relative — and only an exact `record.path`
 * match opens a record, so `../packages/decisions/001-x.md` (a
 * collection subdirectory, meta-31) and a bare sibling basename in
 * a non-record directory stay inert, and `..` escaping specs/ never
 * matches. */
export function recordForHref(
  sourcePath: string,
  href: string,
  records: SpecRecordInfo[],
): SpecRecordInfo | undefined {
  const path = href.split("#")[0];
  if (!path.endsWith(".md")) return undefined;
  if (path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return undefined;
  }
  const stack = sourcePath.split("/").slice(0, -1);
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return undefined;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  const resolved = stack.join("/");
  return records.find((record) => record.path === resolved);
}

// ---------------------------------------------------------------------------
// Search and visibility
// ---------------------------------------------------------------------------

/** Case-insensitive match on item ID or item text. */
export function itemMatches(item: SpecItemInfo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.id.toLowerCase().includes(q) ||
    item.firstLine.toLowerCase().includes(q) ||
    item.text.toLowerCase().includes(q)
  );
}

/** Items of one file that render under the active filters, search,
 * and force-reveals (citation jumps bypass a toggled-off group
 * filter, DR-011). Document order is preserved. */
export function visibleFileItems(
  file: SpecFileInfo,
  state: Pick<SpecViewState, "filters" | "search">,
  revealed: ReadonlySet<string>,
): SpecItemInfo[] {
  const searching = state.search.trim().length > 0;
  return file.items.filter((item) => {
    if (revealed.has(item.id)) return true;
    if (!state.filters[item.group]) return false;
    return !searching || itemMatches(item, state.search);
  });
}

/** Search digest: how many filter-visible items match, and which
 * files auto-expand while the search is active. */
export function searchDigest(
  files: SpecFileInfo[],
  state: Pick<SpecViewState, "filters" | "search">,
): { count: number; fileKeys: Set<string> } {
  const fileKeys = new Set<string>();
  let count = 0;
  if (!state.search.trim()) return { count, fileKeys };
  for (const file of files) {
    for (const item of file.items) {
      if (!state.filters[item.group]) continue;
      if (itemMatches(item, state.search)) {
        count += 1;
        fileKeys.add(file.key);
      }
    }
  }
  return { count, fileKeys };
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/** "just now" / "2m ago" / "3h ago" / "2d ago" — tiny on purpose,
 * no dependency (DR-011 freshness display). */
export function relativeReadTime(readAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - readAt) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

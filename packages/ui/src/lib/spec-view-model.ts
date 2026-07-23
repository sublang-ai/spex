// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pure view-model helpers for the spec view (SPECV; DR-011 as amended
// by DR-015): branch/dir tree shaping over the flat SpecFileInfo list,
// counts, citation indices, search matching, inline-link resolution,
// and relative time — no DOM, so logic stays testable without
// rendering.

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
  /** Namespaced file keys (`<kind>:<key>`) with the node expanded. */
  expandedFiles: string[];
  /** Item IDs with the full body expanded. */
  expandedItems: string[];
}

export const initialSpecViewState: SpecViewState = {
  filters: { external: true, internal: true, test: true },
  search: "",
  expandedFiles: [],
  expandedItems: [],
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
  return value as SpecViewState;
}

/** Namespaced identity for expansion state and test ids — package and
 * composition keys may collide (both collections can hold "foo.md"). */
export function fileKey(file: Pick<SpecFileInfo, "kind" | "key">): string {
  return `${file.kind}:${file.key}`;
}

// ---------------------------------------------------------------------------
// Branch and directory tree
// ---------------------------------------------------------------------------

export interface SpecDirNode {
  /** Last path segment; the collection label on a branch root. */
  name: string;
  /** Collapse key: `<kind>` on the branch root, `<kind>:<dir>` below. */
  path: string;
  dirs: SpecDirNode[];
  files: SpecFileInfo[];
}

export interface SpecBranch {
  kind: SpecFileInfo["kind"];
  /** "Packages" / "Compositions". */
  label: string;
  root: SpecDirNode;
  fileCount: number;
}

const BRANCHES: readonly { kind: SpecFileInfo["kind"]; label: string }[] = [
  { kind: "package", label: "Packages" },
  { kind: "composition", label: "Compositions" },
];

function fileSortKey(file: SpecFileInfo): string {
  return (file.shortForm ?? file.basename).toUpperCase();
}

/** The two top branches — Packages, then Compositions — each nesting
 * collection-directory nodes and file nodes. Branches without files
 * are omitted. Directories sort by name; files by short form (fallback
 * basename) within their directory, like `map.md` (DR-011). */
export function buildBranches(files: SpecFileInfo[]): SpecBranch[] {
  const branches: SpecBranch[] = [];
  for (const { kind, label } of BRANCHES) {
    const own = files.filter((file) => file.kind === kind);
    if (own.length === 0) continue;
    const root: SpecDirNode = { name: label, path: kind, dirs: [], files: [] };
    const byPath = new Map<string, SpecDirNode>([["", root]]);
    const dirNode = (path: string): SpecDirNode => {
      const existing = byPath.get(path);
      if (existing) return existing;
      const slash = path.lastIndexOf("/");
      const parent = dirNode(slash === -1 ? "" : path.slice(0, slash));
      const node: SpecDirNode = {
        name: slash === -1 ? path : path.slice(slash + 1),
        path: `${kind}:${path}`,
        dirs: [],
        files: [],
      };
      parent.dirs.push(node);
      byPath.set(path, node);
      return node;
    };
    for (const file of own) dirNode(file.dir).files.push(file);
    const sortNode = (node: SpecDirNode): void => {
      node.dirs.sort((a, b) => a.name.localeCompare(b.name));
      node.files.sort((a, b) => fileSortKey(a).localeCompare(fileSortKey(b)));
      node.dirs.forEach(sortNode);
    };
    sortNode(root);
    branches.push({ kind, label, root, fileCount: own.length });
  }
  return branches;
}

/** Collapse keys above a file, outermost first: its branch, then each
 * ancestor directory (e.g. package + "a/b" → ["package", "package:a",
 * "package:a/b"]). */
export function ancestorKeys(
  kind: SpecFileInfo["kind"],
  dir: string,
): string[] {
  const keys: string[] = [kind];
  if (dir) {
    const segments = dir.split("/");
    for (let index = 0; index < segments.length; index += 1) {
      keys.push(`${kind}:${segments.slice(0, index + 1).join("/")}`);
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
  compositions: number;
} {
  const perGroup: Record<SpecGroup, number> = {
    external: 0,
    internal: 0,
    test: 0,
  };
  let packages = 0;
  let compositions = 0;
  for (const file of files) {
    if (file.kind === "package") packages += 1;
    else compositions += 1;
    for (const item of file.items) perGroup[item.group] += 1;
  }
  return {
    perGroup,
    items: perGroup.external + perGroup.internal + perGroup.test,
    packages,
    compositions,
  };
}

// ---------------------------------------------------------------------------
// Citation indices
// ---------------------------------------------------------------------------

export interface ItemLocation {
  /** Namespaced file key (`<kind>:<key>`). */
  fileKey: string;
  kind: SpecFileInfo["kind"];
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
        fileKey: fileKey(file),
        kind: file.kind,
        dir: file.dir,
        group: item.group,
        item,
      });
    }
  }
  return index;
}

/** Inbound citation index: cited item ID → citing item IDs in
 * encounter order ("cited by" backlinks; DR-011 as amended). */
export function buildInboundIndex(
  files: SpecFileInfo[],
): Map<string, string[]> {
  const inbound = new Map<string, string[]>();
  for (const file of files) {
    for (const item of file.items) {
      for (const target of item.cites) {
        const list = inbound.get(target);
        if (list) {
          if (!list.includes(item.id)) list.push(item.id);
        } else {
          inbound.set(target, [item.id]);
        }
      }
    }
  }
  return inbound;
}

// ---------------------------------------------------------------------------
// Inline-link resolution (citations live in item bodies per META-20)
// ---------------------------------------------------------------------------

const ITEM_ID_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;

/** The item ID an inline markdown link targets: the link text when it
 * is a bare item ID, else the href's `#anchor` uppercased when it
 * looks like an item anchor. Undefined for every other link. */
export function linkItemTarget(
  text: string,
  href: string,
): string | undefined {
  const trimmed = text.trim();
  if (ITEM_ID_PATTERN.test(trimmed)) return trimmed;
  const hash = href.indexOf("#");
  if (hash === -1) return undefined;
  const anchor = href.slice(hash + 1).toUpperCase();
  return ITEM_ID_PATTERN.test(anchor) ? anchor : undefined;
}

/** The DR/IR record an inline link's relative href points at, matched
 * by file basename (record paths are specs/-relative while hrefs are
 * file-relative, so prefixes differ). */
export function recordForHref(
  href: string,
  records: SpecRecordInfo[],
): SpecRecordInfo | undefined {
  const path = href.split("#")[0];
  if (!path.endsWith(".md")) return undefined;
  const base = path.split("/").pop();
  if (!base) return undefined;
  return records.find((record) => record.path.split("/").pop() === base);
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
        fileKeys.add(fileKey(file));
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

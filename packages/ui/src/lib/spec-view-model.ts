// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pure view-model helpers for the spec view (SPECV, DR-011): tree
// shaping, counts, citation indices, search matching, and relative
// time — no DOM, so logic stays testable without rendering.

import type {
  SpecGroupFile,
  SpecItemInfo,
  SpecPackageInfo,
} from "@sublang/spex-core/protocol";

export type SpecGroup = "user" | "dev" | "test";

/** Group render order inside an expanded package (DR-011). */
export const GROUP_ORDER: readonly SpecGroup[] = ["user", "dev", "test"];

// ---------------------------------------------------------------------------
// View state (lifted to the host so it survives project switches)
// ---------------------------------------------------------------------------

export interface SpecViewState {
  filters: { user: boolean; dev: boolean; test: boolean };
  search: string;
  /** Package keys with the node expanded. */
  expandedPackages: string[];
  /** Item IDs with the full body expanded. */
  expandedItems: string[];
}

export const initialSpecViewState: SpecViewState = {
  filters: { user: true, dev: true, test: true },
  search: "",
  expandedPackages: [],
  expandedItems: [],
};

// ---------------------------------------------------------------------------
// Directory tree
// ---------------------------------------------------------------------------

export interface SpecDirNode {
  /** Last path segment; "" only on the root. */
  name: string;
  /** Full directory path relative to the group roots. */
  path: string;
  dirs: SpecDirNode[];
  packages: SpecPackageInfo[];
}

function packageSortKey(pkg: SpecPackageInfo): string {
  return (pkg.shortForm ?? pkg.basename).toUpperCase();
}

/** Nest packages under their (possibly multi-segment) directories.
 * Directories sort by name; packages by short form (fallback
 * basename) within their directory, like `map.md` (DR-011). */
export function buildDirTree(packages: SpecPackageInfo[]): SpecDirNode {
  const root: SpecDirNode = { name: "", path: "", dirs: [], packages: [] };
  const byPath = new Map<string, SpecDirNode>([["", root]]);
  const dirNode = (path: string): SpecDirNode => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const slash = path.lastIndexOf("/");
    const parent = dirNode(slash === -1 ? "" : path.slice(0, slash));
    const node: SpecDirNode = {
      name: slash === -1 ? path : path.slice(slash + 1),
      path,
      dirs: [],
      packages: [],
    };
    parent.dirs.push(node);
    byPath.set(path, node);
    return node;
  };
  for (const pkg of packages) dirNode(pkg.dir).packages.push(pkg);
  const sortNode = (node: SpecDirNode) => {
    node.dirs.sort((a, b) => a.name.localeCompare(b.name));
    node.packages.sort((a, b) =>
      packageSortKey(a).localeCompare(packageSortKey(b)),
    );
    node.dirs.forEach(sortNode);
  };
  sortNode(root);
  return root;
}

/** Ancestor directory paths of a package, outermost first
 * (e.g. dir "a/b" → ["a", "a/b"]). */
export function ancestorDirs(dir: string): string[] {
  if (!dir) return [];
  const segments = dir.split("/");
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

// ---------------------------------------------------------------------------
// Package digests
// ---------------------------------------------------------------------------

/** Present group files in user → dev → test order. */
export function presentGroups(
  pkg: SpecPackageInfo,
): { group: SpecGroup; file: SpecGroupFile }[] {
  const out: { group: SpecGroup; file: SpecGroupFile }[] = [];
  for (const group of GROUP_ORDER) {
    const file = pkg.groups[group];
    if (file) out.push({ group, file });
  }
  return out;
}

/** Intent one-liner: the user file's intent, falling back dev then
 * test (DR-011). */
export function packageIntent(pkg: SpecPackageInfo): string | undefined {
  return (
    pkg.groups.user?.intent ?? pkg.groups.dev?.intent ?? pkg.groups.test?.intent
  );
}

export function packageCounts(pkg: SpecPackageInfo): Record<SpecGroup, number> {
  return {
    user: pkg.groups.user?.items.length ?? 0,
    dev: pkg.groups.dev?.items.length ?? 0,
    test: pkg.groups.test?.items.length ?? 0,
  };
}

export function treeCounts(packages: SpecPackageInfo[]): {
  perGroup: Record<SpecGroup, number>;
  items: number;
  packages: number;
} {
  const perGroup: Record<SpecGroup, number> = { user: 0, dev: 0, test: 0 };
  for (const pkg of packages) {
    for (const group of GROUP_ORDER) {
      perGroup[group] += pkg.groups[group]?.items.length ?? 0;
    }
  }
  return {
    perGroup,
    items: perGroup.user + perGroup.dev + perGroup.test,
    packages: packages.length,
  };
}

// ---------------------------------------------------------------------------
// Citation indices
// ---------------------------------------------------------------------------

export interface ItemLocation {
  packageKey: string;
  packageDir: string;
  group: SpecGroup;
  item: SpecItemInfo;
}

/** Item ID → location, for citation jumps. */
export function buildItemIndex(
  packages: SpecPackageInfo[],
): Map<string, ItemLocation> {
  const index = new Map<string, ItemLocation>();
  for (const pkg of packages) {
    for (const { group, file } of presentGroups(pkg)) {
      for (const item of file.items) {
        index.set(item.id, {
          packageKey: pkg.key,
          packageDir: pkg.dir,
          group,
          item,
        });
      }
    }
  }
  return index;
}

/** Inbound Verifies index: cited item ID → citing item IDs in
 * encounter order ("verified by" backlinks, DR-011). */
export function buildInboundIndex(
  packages: SpecPackageInfo[],
): Map<string, string[]> {
  const inbound = new Map<string, string[]>();
  for (const pkg of packages) {
    for (const { file } of presentGroups(pkg)) {
      for (const item of file.items) {
        for (const target of item.verifies) {
          const list = inbound.get(target);
          if (list) {
            if (!list.includes(item.id)) list.push(item.id);
          } else {
            inbound.set(target, [item.id]);
          }
        }
      }
    }
  }
  return inbound;
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

/** Items of one group file that render under the active filters,
 * search, and force-reveals (citation jumps bypass a toggled-off
 * group filter, DR-011). */
export function visibleGroupItems(
  file: SpecGroupFile,
  group: SpecGroup,
  state: Pick<SpecViewState, "filters" | "search">,
  revealed: ReadonlySet<string>,
): SpecItemInfo[] {
  const searching = state.search.trim().length > 0;
  return file.items.filter((item) => {
    if (revealed.has(item.id)) return true;
    if (!state.filters[group]) return false;
    return !searching || itemMatches(item, state.search);
  });
}

/** Search digest: how many filter-visible items match, and which
 * packages auto-expand while the search is active. */
export function searchDigest(
  packages: SpecPackageInfo[],
  state: Pick<SpecViewState, "filters" | "search">,
): { count: number; packageKeys: Set<string> } {
  const packageKeys = new Set<string>();
  let count = 0;
  if (!state.search.trim()) return { count, packageKeys };
  for (const pkg of packages) {
    for (const { group, file } of presentGroups(pkg)) {
      if (!state.filters[group]) continue;
      for (const item of file.items) {
        if (itemMatches(item, state.search)) {
          count += 1;
          packageKeys.add(pkg.key);
        }
      }
    }
  }
  return { count, packageKeys };
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

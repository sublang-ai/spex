// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pure view-model helpers for the spec view (SPECV; DR-011 as amended
// by DR-015/DR-016): branch/dir tree shaping over the flat
// SpecFileInfo list, counts, citation classification and relationship
// indices, search matching, inline-link resolution, and relative time
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

// ---------------------------------------------------------------------------
// Relationship classification (DR-016): each citation edge classified
// from the citing item alone — the protocol carries no relationship
// metadata, so the split is a client-side derivation over the tree.
// ---------------------------------------------------------------------------

/** Classified citation-edge kinds; "cites" is the unclassified rest —
 * degraded bindings and out-of-grammar citations keep today's plain
 * row (classification never invents an edge it cannot place). */
export type RelationKind =
  | "uses"
  | "serves"
  | "provides"
  | "composes"
  | "via"
  | "verifies"
  | "executes"
  | "cites";

/** Canonical kind order for rows, inbound groups, and rollups. */
export const RELATION_ORDER: readonly RelationKind[] = [
  "uses",
  "serves",
  "provides",
  "composes",
  "via",
  "verifies",
  "executes",
  "cites",
];

/** Fixed glyph-and-word grammar (DR-016 §Presentation). The word is
 * the channel — glyphs are decorative (aria-hidden) and kind is never
 * conveyed by color. `out` labels the citing item's row; `in` labels
 * the inbound backlink group on the target:
 * uses→used by, serves→served by (the binding serves this client),
 * provides→supplies (this provision supplies the binding),
 * composes→composed in, via→composed via, verifies→verified by,
 * executes→executed by, cites→cited by. */
export const RELATION_LABEL: Record<
  RelationKind,
  { glyph: string; out: string; in: string }
> = {
  uses: { glyph: "→", out: "uses", in: "used by" },
  serves: { glyph: "⊸", out: "serves", in: "served by" },
  provides: { glyph: "⊸", out: "provides", in: "supplies" },
  composes: { glyph: "∘", out: "composes", in: "composed in" },
  via: { glyph: "∘", out: "via", in: "composed via" },
  verifies: { glyph: "✓", out: "verifies", in: "verified by" },
  executes: { glyph: "▸", out: "executes", in: "executed by" },
  cites: { glyph: "→", out: "cites", in: "cited by" },
};

/** The row/group/rollup wording for one edge kind and direction. */
export function relationPhrase(
  kind: RelationKind,
  direction: "out" | "in",
): string {
  const label = RELATION_LABEL[kind];
  return direction === "out" ? label.out : label.in;
}

const INLINE_LINK = /\[([^\]]+)\]\(([^()\s]+)\)/g;
const FENCE = /^\s*(?:```|~~~)/;
/** The GEARS shall marker, mirroring the linter's vocabulary: the
 * English word, or zh 应 excluding common non-shall compounds
 * (应用, 反应, …). */
const STANDALONE_SHALL =
  /\bshall\b|(?<![反相对适响供效回报感一])应(?![用对答邀酬])/;

/** Localized section headings normalize to the canonical grammar
 * names (META-28/34: localized scaffolds translate the headings; the
 * zh names mirror the scaffold/linter vocabulary). */
const CANONICAL_SECTION: ReadonlyMap<string, string> = new Map([
  ["External Behavior", "External Behavior"],
  ["外部行为", "External Behavior"],
  ["Internal Behavior", "Internal Behavior"],
  ["内部行为", "Internal Behavior"],
  ["Verification", "Verification"],
  ["验证", "Verification"],
  ["Binding", "Binding"],
  ["绑定", "Binding"],
  ["Scenario", "Scenario"],
  ["场景", "Scenario"],
  ["Tests", "Tests"],
  ["测试", "Tests"],
]);

function canonicalSection(section: string): string {
  return CANONICAL_SECTION.get(section) ?? section;
}

/** The cited item ID an inline-link match carries, mirroring the
 * server's citation extraction (META-16/META-20): bare-ID link text
 * and an item-anchor fragment in the href. */
function citedId(text: string, href: string): string | undefined {
  if (!ITEM_ID_PATTERN.test(text)) return undefined;
  const hash = href.indexOf("#");
  if (hash === -1) return undefined;
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(href.slice(hash + 1))
    ? text
    : undefined;
}

export interface BindingClauses {
  /** Citations before the binding's `shall` — the clients it serves. */
  clients: string[];
  /** Citations after it — the provisions it resolves to. */
  provisions: string[];
}

/** Split a Binding item's citations by clause side per the
 * one-sentence binding grammar (DR-016): the split point is the
 * body's first standalone `shall` outside code fences, inline code,
 * and link hrefs. Undefined when the body has no such `shall`, a
 * second prose paragraph, or a second sentence — the caller
 * degrades to a plain cites row. A citation cited on both sides
 * classifies by its first occurrence. */
export function splitBindingClauses(text: string): BindingClauses | undefined {
  const clients: string[] = [];
  const provisions: string[] = [];
  const seen = new Set<string>();
  let inFence = false;
  let shallSeen = false;
  let paragraphs = 0;
  let inParagraph = false;
  let sentences = 0;
  for (const line of text.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Paragraph accounting (grammar conformance, DR-016): a binding
    // reads as one GEARS sentence (META-36), so a second prose
    // paragraph is out of grammar.
    if (line.trim() === "") {
      inParagraph = false;
    } else if (!inParagraph) {
      inParagraph = true;
      paragraphs += 1;
    }
    // Blank inline code spans and link hrefs (space-padded, so
    // offsets hold): `shall` inside either is not clause text.
    const bare = line.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
    const prose = bare.replace(
      /\]\([^()\s]+\)/g,
      (span) => `]${" ".repeat(span.length - 1)}`,
    );
    // Sentence accounting (META-36): ASCII terminators count only
    // before whitespace or line end (so `.md`, versions, and link
    // labels stay silent), the fullwidth 。！？ count anywhere, and
    // e.g./i.e. never end a sentence.
    const spoken = prose.replace(/\b[ei]\.(?:g|e)\./gi, "eg");
    sentences += [...spoken.matchAll(/[.!?](?=\s|$)|[。！？]/g)].length;
    const shallAt = shallSeen ? -1 : prose.search(STANDALONE_SHALL);
    for (const match of bare.matchAll(INLINE_LINK)) {
      const id = citedId(match[1], match[2]);
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      const at = match.index ?? 0;
      const after = shallSeen || (shallAt !== -1 && at > shallAt);
      (after ? provisions : clients).push(id);
    }
    if (shallAt !== -1) shallSeen = true;
  }
  // Out-of-grammar bodies degrade (DR-016): no shall, a second
  // prose paragraph, or a second sentence — a binding reads as one
  // GEARS sentence (META-36). Multiple shalls in that ONE sentence
  // stay classified: META-36 allows several coordinated provision
  // mappings (Academy's PUB-1 carries four), and the FIRST shall is
  // still the Where/provision boundary that places every citation.
  if (!shallSeen || paragraphs > 1 || sentences > 1) return undefined;
  return { clients, provisions };
}

export interface RelationRow {
  kind: RelationKind;
  /** Target item IDs in citation order. */
  targets: string[];
}

export interface ClassifiedCites {
  /** Labeled relationship rows, RELATION_ORDER order, never empty. */
  rows: RelationRow[];
  /** Same-file targets left as unlabeled internal references — no
   * outgoing row (rendered as today); the target still gets a
   * generic cited-by backlink. */
  internal: string[];
}

/** Classify one item's citation edges from the citing item alone
 * (DR-016 §Classification). Sections outside the DR-012 grammar keep
 * today's behavior: plain cites on test items, unlabeled internal
 * references elsewhere. */
export function classifyCites(
  item: SpecItemInfo,
  file: Pick<SpecFileInfo, "kind" | "key" | "shortForm">,
  itemIndex: Map<string, ItemLocation>,
): ClassifiedCites {
  const key = fileKey(file);
  const buckets = new Map<RelationKind, string[]>();
  const internal: string[] = [];
  const add = (kind: RelationKind, target: string): void => {
    const list = buckets.get(kind);
    if (list) list.push(target);
    else buckets.set(kind, [target]);
  };
  /** Same-file test: resolved targets by location; dead targets by
   * prefix against the citing file's short form (the citing side is
   * all the classifier has — dead IDs keep their inert handling). */
  const sameFile = (target: string): boolean => {
    const loc = itemIndex.get(target);
    if (loc) return loc.fileKey === key;
    return (
      file.shortForm !== undefined &&
      target.replace(/-\d+$/, "") === file.shortForm
    );
  };
  const fallback = (): void => {
    if (item.group === "test") for (const t of item.cites) add("cites", t);
    else internal.push(...item.cites);
  };
  const section = canonicalSection(item.section);
  if (file.kind === "package") {
    if (
      section === "External Behavior" ||
      section === "Internal Behavior"
    ) {
      // Peer-file targets are uses; same-file citations stay
      // unlabeled internal references.
      for (const t of item.cites) {
        if (sameFile(t)) internal.push(t);
        else add("uses", t);
      }
    } else if (section === "Verification") {
      for (const t of item.cites) add("verifies", t);
    } else {
      fallback();
    }
  } else if (section === "Binding") {
    const split = splitBindingClauses(item.text);
    if (!split) {
      // Out-of-grammar binding: plain cites row, never an invented edge.
      for (const t of item.cites) add("cites", t);
    } else {
      const placed = new Set([...split.clients, ...split.provisions]);
      for (const t of split.clients) {
        if (item.cites.includes(t)) add("serves", t);
      }
      for (const t of split.provisions) {
        if (item.cites.includes(t)) add("provides", t);
      }
      // A cite the splitter could not place (extraction drift) stays plain.
      for (const t of item.cites) {
        if (!placed.has(t)) add("cites", t);
      }
    }
  } else if (section === "Scenario") {
    for (const t of item.cites) {
      const loc = itemIndex.get(t);
      if (loc && loc.fileKey === key) {
        // Same-file binding targets are the bindings the scenario
        // runs via; other same-file citations stay unlabeled.
        if (loc.group === "internal") add("via", t);
        else internal.push(t);
      } else if (sameFile(t)) {
        internal.push(t);
      } else {
        add("composes", t);
      }
    }
  } else if (section === "Tests") {
    for (const t of item.cites) {
      const loc = itemIndex.get(t);
      // Same-file scenario and binding targets are what the
      // composition test executes; everything else it verifies.
      if (loc && loc.fileKey === key && loc.group !== "test") {
        add("executes", t);
      } else {
        add("verifies", t);
      }
    }
  } else {
    fallback();
  }
  return {
    rows: RELATION_ORDER.filter((kind) => buckets.has(kind)).map((kind) => ({
      kind,
      targets: buckets.get(kind) as string[],
    })),
    internal,
  };
}

export interface InboundGroup {
  kind: RelationKind;
  /** Citing item IDs in encounter order. */
  sources: string[];
}

export interface RollupEntry {
  kind: RelationKind;
  direction: "out" | "in";
  count: number;
}

export interface RelationModel {
  /** Citing item ID → its classified outgoing edges. */
  outgoing: Map<string, ClassifiedCites>;
  /** Target item ID → inbound backlink groups in RELATION_ORDER;
   * internal references and plain cites arrive as generic "cites". */
  inbound: Map<string, InboundGroup[]>;
  /** File key → per-kind relationship rollup, kind-major with out
   * before in; zero-count kinds omitted; files without edges absent. */
  rollups: Map<string, RollupEntry[]>;
}

/** Classify every citation edge in the tree and index both directions
 * plus per-file rollups (DR-016). */
export function buildRelationModel(
  files: SpecFileInfo[],
  itemIndex: Map<string, ItemLocation>,
): RelationModel {
  const outgoing = new Map<string, ClassifiedCites>();
  const inboundRaw = new Map<string, Map<RelationKind, string[]>>();
  const record = (target: string, kind: RelationKind, from: string): void => {
    let groups = inboundRaw.get(target);
    if (!groups) {
      groups = new Map();
      inboundRaw.set(target, groups);
    }
    const list = groups.get(kind);
    if (list) {
      if (!list.includes(from)) list.push(from);
    } else {
      groups.set(kind, [from]);
    }
  };
  for (const file of files) {
    for (const item of file.items) {
      const classified = classifyCites(item, file, itemIndex);
      outgoing.set(item.id, classified);
      for (const row of classified.rows) {
        for (const target of row.targets) record(target, row.kind, item.id);
      }
      for (const target of classified.internal) {
        record(target, "cites", item.id);
      }
    }
  }
  const inbound = new Map<string, InboundGroup[]>();
  for (const [target, groups] of inboundRaw) {
    inbound.set(
      target,
      RELATION_ORDER.filter((kind) => groups.has(kind)).map((kind) => ({
        kind,
        sources: groups.get(kind) as string[],
      })),
    );
  }
  const rollups = new Map<string, RollupEntry[]>();
  for (const file of files) {
    const out = new Map<RelationKind, number>();
    const inn = new Map<RelationKind, number>();
    for (const item of file.items) {
      for (const row of outgoing.get(item.id)?.rows ?? []) {
        out.set(row.kind, (out.get(row.kind) ?? 0) + row.targets.length);
      }
      for (const group of inbound.get(item.id) ?? []) {
        inn.set(group.kind, (inn.get(group.kind) ?? 0) + group.sources.length);
      }
    }
    const entries: RollupEntry[] = [];
    for (const kind of RELATION_ORDER) {
      const o = out.get(kind);
      if (o) entries.push({ kind, direction: "out", count: o });
      const i = inn.get(kind);
      if (i) entries.push({ kind, direction: "in", count: i });
    }
    if (entries.length > 0) rollups.set(fileKey(file), entries);
  }
  return { outgoing, inbound, rollups };
}

export interface RelationHint {
  kind: RelationKind;
  direction: "out" | "in";
  count: number;
}

/** Inbound kinds by hint strength: verified-by first (DR-016
 * collapsed hints), then the canonical order. */
const INBOUND_HINT_ORDER: readonly RelationKind[] = [
  "verifies",
  ...RELATION_ORDER.filter((kind) => kind !== "verifies"),
];

/** At most two kind-aware hints for a collapsed item row: outgoing
 * rows first in canonical order, then inbound groups led by
 * verified-by. */
export function collapsedHints(
  outgoing: ClassifiedCites | undefined,
  inbound: InboundGroup[] | undefined,
): RelationHint[] {
  const hints: RelationHint[] = [];
  for (const row of outgoing?.rows ?? []) {
    hints.push({ kind: row.kind, direction: "out", count: row.targets.length });
  }
  const groups = inbound ?? [];
  for (const kind of INBOUND_HINT_ORDER) {
    const group = groups.find((entry) => entry.kind === kind);
    if (group) {
      hints.push({ kind, direction: "in", count: group.sources.length });
    }
  }
  return hints.slice(0, 2);
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

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Records' Explore tab (DR-057, DR-103, DR-172): their folder as one
// read-only ARIA tree with a single focus stop and arrow keys, every
// entry annotated from the catalog in the reader's words — `spex.yaml`
// and `spex.lock` by their file names, the file naming a Space the
// records are kept at as "kept at <Space>" (space-23, space-27); a
// preview pane by type beside it (space-24); the "Stays on this
// computer" panel with one reason per ignored family (space-25); reveal
// and copy for the selected entry (space-26). The tree and preview
// stand side by side from 42rem behind a persisted divider (DR-030) and
// stack below it (space-28).

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { GroupsState, RepositoryState, SpaceEntry, SpaceReadResult } from "@sublang/spex-core/protocol";

import {
  SPACE_SPLIT_DEFAULT,
  SPACE_SPLIT_MAX,
  SPACE_SPLIT_MIN,
} from "../state/store.js";
import { usePlaceStore } from "../state/place-context.js";
import { instanceName } from "../lib/instances.js";
import {
  SHARING_LABELS,
  absolutePath,
  familyName,
  formatSize,
  prettyJson,
  previewKindOf,
  sessionPartName,
  seatName,
  staysHere,
  withheldPhrase,
} from "../lib/space.js";
import { Icon } from "./Icon.js";
import { currentLocale, i18n } from "../i18n.js";
import { Markdown } from "./Markdown.js";
import { PathControls, SECONDARY, type Note } from "./SpaceSurface.js";

/** A tree node: one catalog entry, or a session's files grouped under
 * one node titled by the session (space-23). */
type Node =
  | { kind: "entry"; id: string; entry: SpaceEntry; children?: Node[]; loading?: boolean; error?: string }
  | {
      kind: "session";
      id: string;
      sessionId: string;
      /** The session's own title; none reads as "untitled session",
       * phrased at render so a change of language reaches it. */
      title?: string;
      path: string;
      children: Node[];
    };

interface Row {
  node: Node;
  level: number;
  parentId?: string;
  expandable: boolean;
  expanded: boolean;
}

function isExpandable(node: Node): boolean {
  if (node.kind === "session") return true;
  return node.entry.kind === "dir";
}

/** Entries of one level as nodes, a session's files grouped under its
 * node; directories first as the core lists them. */
function nodesOf(entries: SpaceEntry[]): Node[] {
  const nodes: Node[] = [];
  const groups = new Map<string, Extract<Node, { kind: "session" }>>();
  for (const entry of entries) {
    const sessionId = entry.owner?.sessionId;
    if (sessionId && /^sessions\/[^/]+$/.test(entry.path)) {
      let group = groups.get(sessionId);
      if (!group) {
        group = {
          kind: "session",
          id: `session:${sessionId}`,
          sessionId,
          title: entry.owner?.title?.trim() || undefined,
          path: entry.path.replace(/\/[^/]*$/, ""),
          children: [],
        };
        groups.set(sessionId, group);
        nodes.push(group);
      }
      group.children.push({ kind: "entry", id: entry.path, entry });
      continue;
    }
    nodes.push({ kind: "entry", id: entry.path, entry });
  }
  return nodes;
}

/** A session node's title as shown: its own, else the catalog's. */
function sessionTitle(node: Extract<Node, { kind: "session" }>): string {
  return node.title ?? i18n._({ id: "untitled session", comment: "a session with no title of its own" });
}

function flatten(nodes: Node[], expanded: Set<string>, level = 1, parentId?: string): Row[] {
  const rows: Row[] = [];
  for (const node of nodes) {
    const expandable = isExpandable(node);
    const open = expandable && expanded.has(node.id);
    rows.push({ node, level, parentId, expandable, expanded: open });
    if (open) {
      const children = node.kind === "session" ? node.children : node.children ?? [];
      rows.push(...flatten(children, expanded, level + 1, node.id));
    }
  }
  return rows;
}

function updateNode(nodes: Node[], id: string, patch: (node: Node) => Node): Node[] {
  return nodes.map((node) => {
    if (node.id === id) return patch(node);
    if (node.kind === "entry" && node.children) {
      return { ...node, children: updateNode(node.children, id, patch) };
    }
    if (node.kind === "session") {
      return { ...node, children: updateNode(node.children, id, patch) };
    }
    return node;
  });
}

/** The sharing mark as a chip: the word carries it, never the colour
 * alone (space-23, DR-010 §8). */
function SharingChip({ sync }: { sync: SpaceEntry["sync"] }) {
  const tone =
    sync === "pending"
      ? "border border-amber-500 text-amber-700 dark:text-amber-300"
      : sync === "local"
        ? "border border-neutral-400 text-neutral-600 dark:border-neutral-600 dark:text-neutral-400"
        : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
  return (
    <span data-sync={sync} className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${tone}`}>
      {SHARING_LABELS[sync]()}
    </span>
  );
}

/** An entry's annotation in the reader's words (space-23, space-27,
 * DR-172): the core names the entry's family in its own closed
 * vocabulary, and the word the row reads is this interface's own — the
 * two environment files by their file names, and a file naming a Space
 * the records are kept at by that Space's display name, its folder as
 * where the records are kept. */
function entryAnnotation(entry: SpaceEntry, groups?: GroupsState): string {
  if (entry.kind === "git") {
    return i18n._({ id: "Git data", comment: "entry mark: the repository's own files" });
  }
  switch (entry.family) {
    case "spec package requests":
      return "spex.yaml";
    case "spec package lock":
      return "spex.lock";
    case "placement": {
      if (entry.kind === "dir") {
        return i18n._({ id: "where these records are kept", comment: "the Explore tab's annotation of the folder naming each Space these records are kept at" });
      }
      // The file is named by its Space's folder, `@<host>.yaml`.
      const host = entry.name.replace(/^@/, "").replace(/\.ya?ml$/i, "");
      const listed = groups?.instances.find((instance) => instance.host === host);
      return i18n._({
        id: "kept at {space}",
        values: { space: listed ? instanceName(listed) : host },
        comment: "the Explore tab's annotation of a file naming a Space these records are kept at; {space} is its display name",
      });
    }
    default:
      return familyName(entry.family);
  }
}

/** The annotation of an entry, read against the place's Spaces. */
function useAnnotate(): (entry: SpaceEntry) => string {
  const groups = usePlaceStore()((state) => state.space);
  return (entry) => entryAnnotation(entry, groups);
}

function entrySize(entry: SpaceEntry): string | undefined {
  if (entry.kind === "dir") {
    return entry.count !== undefined
      ? i18n._("{count, plural, one {# entry} other {# entries}}", { count: entry.count })
      : undefined;
  }
  return entry.size !== undefined ? formatSize(entry.size) : undefined;
}

/** The "Stays on this computer" panel (space-25): every ignored family
 * with its reason, the server named at a team server's place
 * (space-112); folded state is chrome preference (DR-030). */
function PrivacyPanel() {
  const store = usePlaceStore();
  const collapsed = store((state) => state.spacePrivacyCollapsed);
  const setCollapsed = store((state) => state.setSpacePrivacyCollapsed);
  const seat = seatName(store.place);
  const families = staysHere(seat);
  return (
    <div
      data-testid="space-privacy"
      className="rounded-lg border border-neutral-200 bg-white p-2 text-sm dark:border-neutral-800 dark:bg-neutral-900"
    >
      <button
        type="button"
        data-testid="space-privacy-toggle"
        aria-expanded={!collapsed}
        aria-controls="space-privacy-list"
        className="flex items-center gap-1 text-sm font-medium"
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icon name={collapsed ? "caretRight" : "caretDown"} className="h-3.5 w-3.5" />
        {seat === undefined
          ? i18n._({ id: "Stays on this computer", comment: "the Explore tab's panel of what never syncs" })
          : i18n._({
              id: "Stays on {place}",
              values: { place: seat },
              comment: "the Explore tab's panel of what never syncs, on a team server's Space; {place} is the server's name",
            })}
      </button>
      {collapsed ? null : (
        <dl id="space-privacy-list" className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs @md:grid-cols-[auto_1fr]">
          {families.map(({ family, reason }) => (
            <div key={family} className="contents">
              <dt className="font-medium">{family}</dt>
              <dd className="text-neutral-500">{reason}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** The tree/preview divider (DR-030): dragged by pointer, nudged by
 * arrow keys, Home and a double-click restoring the default, bounded,
 * remembered as chrome preference. Stands only side by side. */
function SplitDivider({
  percent,
  onChange,
  containerRef,
}: {
  percent: number;
  onChange(next: number): void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragging, setDragging] = useState(false);
  const fromClientX = (clientX: number): number | undefined => {
    const el = containerRef.current;
    if (!el) return undefined;
    const box = el.getBoundingClientRect();
    if (box.width <= 0) return undefined;
    return ((clientX - box.left) / box.width) * 100;
  };
  return (
    <div
      data-testid="space-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={i18n._("Resize the tree pane")}
      aria-valuenow={percent}
      aria-valuemin={SPACE_SPLIT_MIN}
      aria-valuemax={SPACE_SPLIT_MAX}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const next = fromClientX(event.clientX);
        if (next !== undefined) onChange(next);
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        setDragging(false);
      }}
      onDoubleClick={() => onChange(SPACE_SPLIT_DEFAULT)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onChange(percent - 2);
        else if (event.key === "ArrowRight") onChange(percent + 2);
        else if (event.key === "Home") onChange(SPACE_SPLIT_DEFAULT);
        else return;
        event.preventDefault();
      }}
      className="group relative hidden w-3 shrink-0 cursor-col-resize touch-none focus:outline-none @2xl:block"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded ${
          dragging
            ? "bg-brand-500"
            : "bg-neutral-200 group-hover:bg-neutral-400 group-focus:bg-brand-500 dark:bg-neutral-800 dark:group-hover:bg-neutral-600"
        }`}
      />
    </div>
  );
}

/** The preview pane's body by type (space-24). */
function PreviewBody({
  entry,
  result,
  loading,
  error,
  onOpenSession,
}: {
  entry: SpaceEntry;
  result?: SpaceReadResult;
  loading: boolean;
  error?: string;
  onOpenSession(sessionId: string): void;
}) {
  const annotate = useAnnotate();
  if (entry.kind === "git") {
    return (
      <p className="text-sm text-neutral-500">
        {i18n._({ id: "Git data · not shown", comment: "the Explore tab's preview of the records' own Git folder, which it never opens" })}
      </p>
    );
  }
  if (entry.kind === "dir") {
    return (
      <p className="text-sm text-neutral-500">
        {entry.count !== undefined
          ? i18n._({
              id: "{annotation} · {count, plural, one {# entry} other {# entries}}",
              values: { annotation: annotate(entry), count: entry.count },
              comment: "{annotation} is the core's word for the directory",
            })
          : annotate(entry)}
      </p>
    );
  }
  if (entry.preview === "withheld") {
    return (
      <p data-testid="space-preview-withheld" className="text-sm text-neutral-500">
        {withheldPhrase()}
      </p>
    );
  }
  if (entry.preview === "binary") {
    return (
      <p className="text-sm text-neutral-500">
        {entry.size !== undefined
          ? i18n._("binary file · {size}", { size: formatSize(entry.size) })
          : i18n._("binary file")}
      </p>
    );
  }
  if (entry.preview === "none") {
    return <p className="text-sm text-neutral-500">{i18n._({ id: "No preview", comment: "the Explore tab's preview of a file it does not show" })}</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {i18n._("Couldn't read it: {reason}", { reason: error })}
      </p>
    );
  }
  if (loading || !result) {
    return <p className="text-sm text-neutral-500">{i18n._("Loading…")}</p>;
  }
  if (result.kind === "withheld") {
    // The kind is what says a read was withheld; the words are this
    // page's own, so the core's reason is never matched or echoed.
    return (
      <p data-testid="space-preview-withheld" className="text-sm text-neutral-500">
        {withheldPhrase()}
      </p>
    );
  }
  if (result.kind === "binary") {
    return (
      <p className="text-sm text-neutral-500">
        {i18n._("binary file · {size}", { size: formatSize(result.size) })}
      </p>
    );
  }
  const kind = previewKindOf(entry.name);
  const cut = result.truncated ? (
    <p className="text-xs text-neutral-500">
      {i18n._({
        id: "First {lines} lines shown",
        values: { lines: result.lines.toLocaleString(currentLocale()) },
        comment: "the Explore tab's preview of a long file: only its first lines stand",
      })}
    </p>
  ) : null;
  if (kind === "markdown") {
    return (
      <div data-testid="space-preview-markdown" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" tabIndex={0}>
        <Markdown text={result.text} />
        {cut}
      </div>
    );
  }
  if (kind === "jsonl") {
    const records = result.text.split("\n").filter((line) => line.trim() !== "");
    const isSession = entry.family === "session records" && entry.owner?.sessionId;
    return (
      <div data-testid="space-preview-jsonl" className="flex min-h-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <span>
            {i18n._("{count, plural, one {# record} other {# records}}", {
              count: records.length,
            })}
          </span>
          {isSession ? (
            <>
              <span>
                {i18n._({
                  id: "· reads better as a conversation",
                  comment: "follows the record count on a session's record file",
                })}
              </span>
              <button
                type="button"
                className={SECONDARY}
                onClick={() => onOpenSession(entry.owner!.sessionId!)}
              >
                {i18n._("Open session")}
              </button>
            </>
          ) : null}
        </div>
        <ol className="min-h-0 flex-1 list-decimal overflow-auto rounded bg-neutral-100 p-2 pl-10 font-mono text-xs leading-5 dark:bg-neutral-950" tabIndex={0}>
          {records.map((line, index) => (
            <li key={index} className="whitespace-pre">
              {line}
            </li>
          ))}
        </ol>
        {cut}
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <pre
        data-testid="space-preview-text"
        className="min-h-0 flex-1 overflow-auto rounded bg-neutral-100 p-2 font-mono text-xs leading-5 whitespace-pre dark:bg-neutral-950"
        tabIndex={0}
      >
        {kind === "json" ? prettyJson(result.text) : result.text}
      </pre>
      {cut}
    </div>
  );
}

export function ExploreTab({
  repo,
  name,
  root,
  connected,
  onOpenSession,
  onNote,
}: {
  repo: RepositoryState;
  /** The row's name, which the tree is named by (space-1). */
  name: string;
  /** The clone's absolute path, every entry's path relative to it. */
  root: string;
  connected: boolean;
  onOpenSession(sessionId: string): void;
  onNote: Note;
}) {
  const store = usePlaceStore();
  const annotate = useAnnotate();
  const spaceTree = store((state) => state.spaceTree);
  const spaceRead = store((state) => state.spaceRead);
  const split = store((state) => state.spaceSplit);
  const setSplit = store((state) => state.setSpaceSplit);

  const [roots, setRoots] = useState<Node[]>();
  const [rootError, setRootError] = useState<string>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string>();
  const [focusedId, setFocusedId] = useState<string>();
  const [read, setRead] = useState<{ path: string; result?: SpaceReadResult; error?: string }>();
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const splitRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | undefined>(undefined);

  const loadRoot = useCallback(async () => {
    try {
      const { entries } = await spaceTree(repo.key);
      setRoots(nodesOf(entries));
      setRootError(undefined);
    } catch (cause) {
      setRootError((cause as Error).message);
    }
  }, [spaceTree, repo.key]);

  // The root reads when the tab opens; a finished sync changed files,
  // so it reads again then (space-20) — never on a timer (space-2).
  const done = repo.sync.phase === "done" ? repo.sync.at : undefined;
  useEffect(() => {
    void loadRoot();
  }, [loadRoot, root, done]);

  const loadChildren = useCallback(
    async (node: Extract<Node, { kind: "entry" }>) => {
      setRoots((current) =>
        current ? updateNode(current, node.id, (n) => ({ ...n, loading: true, error: undefined }) as Node) : current,
      );
      try {
        const { entries } = await spaceTree(repo.key, node.entry.path);
        setRoots((current) =>
          current
            ? updateNode(current, node.id, (n) => ({ ...n, loading: false, children: nodesOf(entries) }) as Node)
            : current,
        );
      } catch (cause) {
        setRoots((current) =>
          current
            ? updateNode(current, node.id, (n) => ({ ...n, loading: false, error: (cause as Error).message }) as Node)
            : current,
        );
      }
    },
    [spaceTree, repo.key],
  );

  const rows = roots ? flatten(roots, expanded) : [];

  const toggle = (row: Row, open?: boolean) => {
    if (!row.expandable) return;
    if (row.node.kind === "entry" && row.node.entry.kind === "git") return;
    const next = new Set(expanded);
    const willOpen = open ?? !next.has(row.node.id);
    if (willOpen) {
      next.add(row.node.id);
      if (row.node.kind === "entry" && !row.node.children && !row.node.loading) {
        void loadChildren(row.node);
      }
    } else {
      next.delete(row.node.id);
    }
    setExpanded(next);
  };

  const select = (row: Row) => {
    setSelectedId(row.node.id);
    setFocusedId(row.node.id);
    if (row.node.kind === "entry" && row.node.entry.kind === "file" && row.node.entry.preview === "text") {
      const path = row.node.entry.path;
      setRead({ path });
      spaceRead(repo.key, path)
        .then((result) => setRead((current) => (current?.path === path ? { path, result } : current)))
        .catch((cause: Error) =>
          setRead((current) => (current?.path === path ? { path, error: cause.message } : current)),
        );
    } else {
      setRead(undefined);
    }
  };

  const focusRow = (id: string) => {
    setFocusedId(id);
    pendingFocus.current = id;
  };

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = undefined;
    rowRefs.current.get(id)?.focus();
  });

  const onTreeKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (rows.length === 0) return;
    const index = Math.max(0, rows.findIndex((row) => row.node.id === focusedId));
    const row = rows[index];
    switch (event.key) {
      case "ArrowDown":
        focusRow(rows[Math.min(rows.length - 1, index + 1)].node.id);
        break;
      case "ArrowUp":
        focusRow(rows[Math.max(0, index - 1)].node.id);
        break;
      case "ArrowRight":
        if (row.expandable && !row.expanded) toggle(row, true);
        else if (row.expanded && rows[index + 1]?.parentId === row.node.id) {
          focusRow(rows[index + 1].node.id);
        }
        break;
      case "ArrowLeft":
        if (row.expanded) toggle(row, false);
        else if (row.parentId) focusRow(row.parentId);
        break;
      case "Home":
        focusRow(rows[0].node.id);
        break;
      case "End":
        focusRow(rows[rows.length - 1].node.id);
        break;
      case "Enter":
      case " ":
        select(row);
        if (row.expandable) toggle(row);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const selectedRow = rows.find((row) => row.node.id === selectedId);
  const activeId = focusedId ?? selectedId ?? rows[0]?.node.id;

  return (
    <div data-testid="space-explore-tab" className="flex min-h-0 flex-1 flex-col gap-3">
      <PrivacyPanel />
      <div
        ref={splitRef}
        className="flex min-h-0 flex-1 flex-col gap-3 @2xl:flex-row @2xl:gap-0"
        style={{ ["--space-split" as string]: `${split}%` }}
      >
        <div className="flex min-h-48 flex-col rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 @2xl:min-h-0 @2xl:w-[var(--space-split)] @2xl:flex-none">
          <div className="flex items-center gap-2 border-b border-neutral-200 px-2 py-1 text-xs text-neutral-500 dark:border-neutral-800">
            <span className="truncate font-mono" title={root}>
              {root}
            </span>
          </div>
          {rootError ? (
            <p role="alert" className="p-2 text-sm text-red-600 dark:text-red-400">
              {i18n._("Couldn't read the files: {reason}", { reason: rootError })}
            </p>
          ) : !roots ? (
            <p className="p-2 text-sm text-neutral-500">
              {i18n._({ id: "Reading…", comment: "the tree is being read" })}
            </p>
          ) : (
            <ul
              role="tree"
              aria-label={i18n._("Files in {name}", { name })}
              data-testid="space-tree"
              className="min-h-0 flex-1 overflow-y-auto p-1"
              onKeyDown={onTreeKeyDown}
            >
              {rows.map((row) => {
                const { node } = row;
                const id = node.id;
                const selected = selectedId === id;
                const isGit = node.kind === "entry" && node.entry.kind === "git";
                return (
                  <li
                    key={id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(id, el);
                      else rowRefs.current.delete(id);
                    }}
                    role="treeitem"
                    aria-level={row.level}
                    aria-selected={selected}
                    aria-expanded={row.expandable && !isGit ? row.expanded : undefined}
                    tabIndex={activeId === id ? 0 : -1}
                    data-testid={`space-node-${id}`}
                    onFocus={() => setFocusedId(id)}
                    onClick={() => {
                      select(row);
                      if (row.expandable) toggle(row);
                    }}
                    className={`@container flex min-w-0 cursor-default items-center gap-1.5 rounded px-1 py-0.5 text-sm ${
                      selected
                        ? "border-l-2 border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200"
                        : "border-l-2 border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                    style={{ paddingLeft: `${(row.level - 1) * 0.75 + 0.25}rem` }}
                  >
                    {row.expandable && !isGit ? (
                      <Icon name={row.expanded ? "caretDown" : "caretRight"} className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <span className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={node.kind === "session" ? sessionTitle(node) : node.entry.path}
                    >
                      {node.kind === "session"
                        ? sessionTitle(node)
                        : row.parentId?.startsWith("session:")
                          ? sessionPartName(node.entry)
                          : node.entry.kind === "dir"
                            ? `${node.entry.name}/`
                            : node.entry.name}
                    </span>
                    {node.kind === "session" ? null : (
                      <>
                        <span className="hidden shrink-0 text-xs text-neutral-500 @md:inline">
                          {annotate(node.entry)}
                        </span>
                        <SharingChip sync={node.entry.sync} />
                        {entrySize(node.entry) ? (
                          <span className="hidden shrink-0 text-xs text-neutral-500 @2xl:inline">
                            {entrySize(node.entry)}
                          </span>
                        ) : null}
                      </>
                    )}
                    {node.kind === "entry" && node.loading ? (
                      <span className="text-xs text-neutral-500">…</span>
                    ) : null}
                    {node.kind === "entry" && node.error ? (
                      <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                        {node.error}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <SplitDivider percent={split} onChange={setSplit} containerRef={splitRef} />
        <div
          data-testid="space-preview"
          className="flex min-h-48 min-w-0 flex-1 flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900 @2xl:min-h-0"
        >
          {selectedRow ? (
            <PreviewPane
              row={selectedRow}
              home={root}
              read={read}
              connected={connected}
              onOpenSession={onOpenSession}
              onNote={onNote}
            />
          ) : (
            <p className="text-sm text-neutral-500">{i18n._({ id: "Select an entry to preview", comment: "the Explore tab's preview pane before an entry is selected" })}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  row,
  home,
  read,
  connected,
  onOpenSession,
  onNote,
}: {
  row: Row;
  home: string;
  read?: { path: string; result?: SpaceReadResult; error?: string };
  connected: boolean;
  onOpenSession(sessionId: string): void;
  onNote: Note;
}) {
  // At a team server's place the server is named where this computer
  // would be (space-112).
  const seat = seatName(usePlaceStore().place);
  const annotate = useAnnotate();
  const { node } = row;
  if (node.kind === "session") {
    return (
      <>
        <PreviewHeader
          title={sessionTitle(node)}
          path={node.path}
          home={home}
          annotation={i18n._({ id: "Session", comment: "an entry's kind in the Explore tab: a session" })}
          onNote={onNote}
          controls={
            <button
              type="button"
              className={SECONDARY}
              disabled={!connected}
              onClick={() => onOpenSession(node.sessionId)}
            >
              {i18n._("Open session")}
            </button>
          }
        />
        <p className="text-sm text-neutral-500">
          {seat === undefined
            ? i18n._({
                id: "{count, plural, one {# file} other {# files}} · the session's file, its transcript and, where this computer ran it, provider hints",
                values: { count: node.children.length },
                comment: "a session's node in the Explore tab: the files it holds",
              })
            : i18n._({
                id: "{count, plural, one {# file} other {# files}} · the session's file, its transcript and, where {place} ran it, provider hints",
                values: { count: node.children.length, place: seat },
                comment: "a session's node in the Explore tab on a team server's Space; {place} is the server's name",
              })}
        </p>
      </>
    );
  }
  const { entry } = node;
  // The session's or the intent's title, where the family belongs to
  // one (space-23).
  const owner = entry.owner?.title ? `"${entry.owner.title}"` : undefined;
  const size = entrySize(entry);
  return (
    <>
      <PreviewHeader
        title={entry.name}
        path={entry.path}
        home={home}
        annotation={annotate(entry)}
        chip={<SharingChip sync={entry.sync} />}
        size={size}
        owner={owner}
        onNote={onNote}
        controls={
          entry.owner?.sessionId ? (
            <button
              type="button"
              className={SECONDARY}
              disabled={!connected}
              onClick={() => onOpenSession(entry.owner!.sessionId!)}
            >
              {i18n._("Open session")}
            </button>
          ) : undefined
        }
      />
      <PreviewBody
        entry={entry}
        result={read?.path === entry.path ? read.result : undefined}
        loading={read?.path === entry.path && !read.result && !read.error}
        error={read?.path === entry.path ? read.error : undefined}
        onOpenSession={onOpenSession}
      />
    </>
  );
}

function PreviewHeader({
  title,
  path,
  home,
  annotation,
  chip,
  size,
  owner,
  controls,
  onNote,
}: {
  title: string;
  path: string;
  home: string;
  annotation: string;
  chip?: ReactNode;
  size?: string;
  owner?: string;
  controls?: ReactNode;
  onNote: Note;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-800">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
          {path}
        </span>
        {controls}
        <PathControls path={absolutePath(home, path)} testId="space-preview-path" onNote={onNote} />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-neutral-500">{annotation}</span>
        {chip}
        {size ? <span className="text-xs text-neutral-500">{size}</span> : null}
      </div>
      {owner ? (
        <span data-testid="space-preview-owner" className="text-xs text-neutral-500">
          {owner}
        </span>
      ) : null}
    </div>
  );
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The outline's item rows (SPECV-3/SPECV-19), lifted out of the spec
// view so a second surface can draw the same rows: a row is an ID chip
// in its group colour, the group word, and the item's first line,
// expanding to the body with its citations. Everything the spec view
// alone owns — group filters, search reveals, the copy tick, the Edit
// control, inbound backlinks — is optional, so the Playbooks card can
// draw a parsed Gears artifact with nothing but items, an index, and a
// jump (PBLIB-22).

import {
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import type { SpecItemInfo } from "@sublang/spex-core/protocol";

import type { CitationAnchors } from "./CitationPreview.js";

import {
  citationSummary,
  groupOf,
  itemMatches,
  type CitationModel,
  type ItemLocation,
  type SpecGroup,
  type SpecViewState,
} from "../lib/spec-view-model.js";
import { Markdown } from "./Markdown.js";

// Group colors keep DR-011's three hues under DR-015's section-kind
// groups: external sky, internal fuchsia, test teal — outside the
// status palette (DR-010 §8 with DR-013: emerald, amber, red, brand
// purple keep their meanings). Color is never the only channel: every
// chip and count carries the group word and an aria-label.
export const GROUP_CHIP: Record<SpecGroup, string> = {
  external: "text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950",
  internal:
    "text-fuchsia-700 bg-fuchsia-50 dark:text-fuchsia-300 dark:bg-fuchsia-950",
  test: "text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-950",
};
export const GROUP_TEXT: Record<SpecGroup, string> = {
  external: "text-sky-600 dark:text-sky-400",
  internal: "text-fuchsia-600 dark:text-fuchsia-400",
  test: "text-teal-600 dark:text-teal-400",
};

export const LINK_CLASS = "text-brand-600 hover:underline dark:text-brand-300";

/** A row's DOM id, scoped by its host: the spec view owns one outline
 * per surface, while two Playbooks cards can hold open item lists at
 * once, so each list names its own rows. */
export function itemDomId(id: string, prefix = "specv"): string {
  return `${prefix}-item-${id}`;
}

// ---------------------------------------------------------------------------
// One expanded file's items in document order, grouped under their
// verbatim `##` section headings with `###` topics as nested labels
// whenever they change between consecutive items (DR-011/DR-015 —
// never sorted by ID; META-12 makes numbering non-positional).
// ---------------------------------------------------------------------------

export function SpecItemRows({
  items,
  idPrefix,
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
  onBodyLinkPreview,
  preview,
  onEditItem,
  editFailure,
}: {
  items: SpecItemInfo[];
  /** DOM-id scope for the rows; the spec view keeps the default. */
  idPrefix?: string;
  expandedItems: ReadonlySet<string>;
  /** Group filters, where the host has them; without them no row is
   * ever shown despite a filter. */
  filters?: SpecViewState["filters"];
  search?: string;
  revealed?: ReadonlySet<string>;
  /** Inbound backlinks, where the host computes them (SPECV-19). */
  citations?: CitationModel;
  itemIndex: Map<string, ItemLocation>;
  copiedId?: string;
  copyFailedId?: string;
  flashId?: string;
  notFoundKey?: string;
  onToggleItem: (id: string) => void;
  /** Copy an item ID, where the host offers it; without it the chip
   * is a plain chip. */
  onCopy?: (id: string) => void;
  onJump: (linkKey: string, targetId: string, originId: string) => void;
  onBodyLinkClick?: (itemId: string, event: ReactMouseEvent) => void;
  /** Raise the preview for an inline citation, where the host renders
   * the body's links live (spec-view-61). */
  onBodyLinkPreview?: (
    itemId: string,
    event: ReactMouseEvent | ReactFocusEvent,
    immediate: boolean,
  ) => void;
  /** The card a citation entry raises, where the host holds one
   * (spec-view-61); without it an entry only jumps. */
  preview?: CitationAnchors;
  /** Open an item's file in the editor (spec-view-48). */
  onEditItem?: (item: SpecItemInfo) => void;
  /** The last failed open, keyed by the control that asked. */
  editFailure?: { anchor: string; message: string } | null;
}) {
  if (items.length === 0) return null;
  const query = search ?? "";
  const searching = query.trim().length > 0;
  const rows: ReactNode[] = [];
  let previousSection: string | undefined;
  let previousTopic: string | undefined;
  for (const item of items) {
    if (item.section && item.section !== previousSection) {
      rows.push(
        <li
          key={`section-${item.id}`}
          className="mt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500"
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
          className="ml-2 text-xs font-medium text-neutral-500"
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
        idPrefix={idPrefix}
        expanded={expandedItems.has(item.id)}
        despiteFilter={
          filters !== undefined &&
          (revealed?.has(item.id) ?? false) &&
          (!filters[item.group] || (searching && !itemMatches(item, query)))
        }
        inbound={citations?.inbound.get(item.id) ?? []}
        itemIndex={itemIndex}
        copied={copiedId === item.id}
        copyFailed={copyFailedId === item.id}
        flashed={flashId === item.id}
        notFoundKey={notFoundKey}
        onToggle={() => onToggleItem(item.id)}
        onCopy={onCopy ? () => onCopy(item.id) : undefined}
        onJump={onJump}
        onBodyLinkClick={onBodyLinkClick}
        onBodyLinkPreview={onBodyLinkPreview}
        preview={preview}
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
  idPrefix,
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
  onBodyLinkPreview,
  preview,
  onEdit,
  editFailure,
}: {
  item: SpecItemInfo;
  idPrefix?: string;
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
  /** Copy this item's ID; absent where the host offers no clipboard. */
  onCopy?: () => void;
  onJump: (linkKey: string, targetId: string, originId: string) => void;
  onBodyLinkClick?: (itemId: string, event: ReactMouseEvent) => void;
  onBodyLinkPreview?: (
    itemId: string,
    event: ReactMouseEvent | ReactFocusEvent,
    immediate: boolean,
  ) => void;
  preview?: CitationAnchors;
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

  // Citation entries color by the TARGET's group and raise the card at
  // hand instead of the browser's slow native tooltip (spec-view-61);
  // a dead target keeps the neutral link style. The
  // padding/negative-margin pair grows the hit target past 24px
  // without changing the row's visual density (DR-010 §7).
  const citation = (target: string) => {
    const linkKey = `${item.id}:${target}`;
    const targetGroup = groupOf(itemIndex, target);
    return (
      <span key={target} className="inline-flex items-center gap-1">
        <button
          type="button"
          data-testid={`link-${item.id}-${target}`}
          onClick={() => onJump(linkKey, target, item.id)}
          onMouseEnter={
            preview && ((event) => preview.hover(event.currentTarget, target, linkKey))
          }
          onMouseLeave={preview?.close}
          onFocus={
            preview && ((event) => preview.focus(event.currentTarget, target, linkKey))
          }
          onBlur={preview?.close}
          className={`-mx-1 -my-1 rounded px-1 py-1 font-mono text-xs hover:underline ${
            targetGroup ? GROUP_TEXT[targetGroup] : LINK_CLASS
          }`}
        >
          {target}
        </button>
        {notFoundKey === linkKey ? (
          <span className="text-xs text-neutral-500">not found</span>
        ) : null}
      </span>
    );
  };

  // A long id truncates rather than widening the row past the
  // outline pane (spec-view-55); the whole id rides the tooltip and
  // the accessible name the copy chip already carries.
  const chipClass = `min-w-0 max-w-40 truncate rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${GROUP_CHIP[group]}`;

  return (
    <li
      id={itemDomId(item.id, idPrefix)}
      data-testid={`item-${item.id}`}
      // Jump landings move focus here (DR-010 §6).
      tabIndex={-1}
      className={`rounded ${
        flashed ? "ring-2 ring-brand-400 dark:ring-brand-500" : ""
      }`}
    >
      {/* The row wraps before anything leaves it (DR-041's ladder):
          the first line owns the slack, and the row's action drops to
          a line of its own where the ID chip leaves it no room. */}
      <div className="group/item flex flex-wrap items-center gap-2 py-0.5">
        {onCopy ? (
          <button
            type="button"
            aria-label={`Copy ${item.id}`}
            title={`Copy ${item.id}`}
            onClick={onCopy}
            className={`cursor-pointer hover:ring-1 hover:ring-neutral-400 dark:hover:ring-neutral-500 ${chipClass}`}
          >
            {item.id}
          </button>
        ) : (
          <span className={chipClass}>{item.id}</span>
        )}
        {copied ? (
          <span
            data-testid={`copied-${item.id}`}
            className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400"
          >
            copied
          </span>
        ) : null}
        {copyFailed ? (
          <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
            copy failed
          </span>
        ) : null}
        {/* The group word duplicates the chip's color and accessible
            name, so it hides first below @md (spec-view-55). */}
        <span className={`hidden shrink-0 text-xs @md:inline ${GROUP_TEXT[group]}`}>
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
            // An at-a-glance extra (spec-view-55): the expanded row's
            // citation rows carry the counts, so it hides first.
            <span className="hidden shrink-0 text-xs text-neutral-500 @md:inline">
              {hint}
            </span>
          ) : null}
        </button>
        {despiteFilter ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            shown despite filter
          </span>
        ) : null}
        {/* The row's own action, at its end: the row's hover or a
            focus within it reveals the control, and the keyboard
            always reaches it (spec-view-3, DR-010 §6). */}
        {onEdit ? (
          <button
            type="button"
            data-testid={`item-edit-${item.id}`}
            aria-label={`Edit ${item.id} in its file`}
            onClick={onEdit}
            className={`ml-auto shrink-0 rounded px-1 text-xs opacity-0 focus:opacity-100 group-hover/item:opacity-100 group-focus-within/item:opacity-100 ${LINK_CLASS}`}
          >
            Edit
          </button>
        ) : null}
        {editFailure ? (
          <span
            role="alert"
            title={editFailure}
            className="max-w-40 shrink truncate text-xs text-red-600 dark:text-red-400"
          >
            {editFailure}
          </span>
        ) : null}
      </div>
      {expanded ? (
        <div className="mb-1 ml-2 flex flex-col gap-1 border-l border-neutral-200 pl-3 dark:border-neutral-800">
          {/* The rendered body's citations are the markdown's own
              anchors: the row delegates their hover and focus to the
              same card the citation rows raise (spec-view-61). */}
          <div
            className="relative overflow-x-auto"
            onClick={
              onBodyLinkClick
                ? (event) => onBodyLinkClick(item.id, event)
                : undefined
            }
            onMouseOver={
              onBodyLinkPreview &&
              ((event) => onBodyLinkPreview(item.id, event, false))
            }
            onMouseOut={onBodyLinkPreview && preview?.close}
            onFocus={
              onBodyLinkPreview &&
              ((event) => onBodyLinkPreview(item.id, event, true))
            }
            onBlur={onBodyLinkPreview && preview?.close}
          >
            <Markdown text={item.text} />
          </div>
          {notFoundKey?.startsWith(`body:${item.id}:`) ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="font-mono text-neutral-500">
                {notFoundKey.slice(`body:${item.id}:`.length)}
              </span>
              <span className="text-xs text-neutral-500">not found</span>
            </div>
          ) : null}
          {/* One citations block: the outbound row and the backlink
              row read down a single label column, their entries
              wrapping in the slack beside it (spec-view-19). */}
          {item.cites.length > 0 || inbound.length > 0 ? (
            <div className="flex flex-col gap-1 text-xs">
              {item.cites.length > 0 ? (
                <div
                  data-testid={`cites-${item.id}`}
                  className="flex items-start gap-2"
                >
                  <span className="w-20 shrink-0 text-neutral-500">cites</span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {item.cites.map(citation)}
                  </span>
                </div>
              ) : null}
              {inbound.length > 0 ? (
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    data-testid={`inbound-${item.id}`}
                    aria-expanded={inboundOpen}
                    onClick={() => setInboundOpen((open) => !open)}
                    className="w-20 shrink-0 text-left text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    cited by {inbound.length}
                  </button>
                  {inboundOpen ? (
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      {inbound.map(citation)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

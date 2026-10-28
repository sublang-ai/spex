// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The outline's item rows (SPECV-3/SPECV-19), lifted out of the spec
// view so a second surface can draw the same rows: a row is an ID chip
// in its group colour and the item's first line under its section's
// group heading, expanding to the body with its citations. Everything the spec view
// alone owns — group filters, search reveals, the copy tick, the Edit
// control, inbound backlinks — is optional, so the Playbooks card can
// draw a parsed Gears artifact with nothing but items, an index, and a
// jump (PBLIB-22).

import {
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
  sectionGroup,
  GROUP_NAME,
  type CitationModel,
  type ItemLocation,
  type SpecGroup,
  type SpecViewState,
} from "../lib/spec-view-model.js";
import { i18n } from "../i18n.js";
import { Markdown } from "./Markdown.js";

// Group colors keep DR-011's three hues under DR-015's section-kind
// groups: external sky, internal lime, test teal — outside the
// status palette (DR-010 §8 with DR-013: emerald, amber, red, brand
// purple keep their meanings). Color is never the only channel: every
// chip and count carries the group word and an aria-label.
export const GROUP_CHIP: Record<SpecGroup, string> = {
  external: "text-sky-700 bg-sky-50 dark:text-sky-300 dark:bg-sky-950",
  internal:
    "text-lime-700 bg-lime-100 dark:text-lime-300 dark:bg-lime-950",
  test: "text-teal-700 bg-teal-50 dark:text-teal-300 dark:bg-teal-950",
};
export const GROUP_TEXT: Record<SpecGroup, string> = {
  external: "text-sky-700 dark:text-sky-400",
  internal: "text-lime-700 dark:text-lime-400",
  test: "text-teal-700 dark:text-teal-400",
};

export const LINK_CLASS = "text-brand-600 hover:underline dark:text-brand-300";

/** A row's DOM id, scoped by its host: the spec view owns one outline
 * per surface, while two Playbooks cards can hold open item lists at
 * once, so each list names its own rows. */
export function itemDomId(id: string, prefix = "specv"): string {
  return `${prefix}-item-${id}`;
}

/** The DOM id of an expanded item's citation block, where its summary
 * hands focus (spec-view-60). */
export function citationsDomId(id: string, prefix = "specv"): string {
  return `${prefix}-cites-${id}`;
}

/** The link key a summary's card rides, so the one card machine tells
 * a summary from an entry (spec-view-60). */
export function summaryKey(id: string): string {
  return `summary:${id}`;
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
  onOpenCitations,
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
  /** Open an item onto its citation block, where the host offers the
   * summary card (spec-view-60); without it the summary is a hint. */
  onOpenCitations?: (id: string) => void;
}) {
  if (items.length === 0) return null;
  const query = search ?? "";
  const searching = query.trim().length > 0;
  const rows: ReactNode[] = [];
  let previousSection: string | undefined;
  let previousTopic: string | undefined;
  // A section heads its items by its group's name and count, a
  // section outside the package grammar by its own words; a topic is
  // the author's own sub-heading beneath it (spec-view-2).
  const sectionCounts = new Map<string, number>();
  for (const item of items) {
    if (item.section) {
      sectionCounts.set(item.section, (sectionCounts.get(item.section) ?? 0) + 1);
    }
  }
  for (const item of items) {
    if (item.section && item.section !== previousSection) {
      const group = sectionGroup(item.section);
      rows.push(
        <li
          key={`section-${item.id}`}
          data-testid={`section-${item.id}`}
          className={`mt-2 text-xs font-semibold ${
            group ? GROUP_TEXT[group] : "text-neutral-500"
          }`}
        >
          {group ? GROUP_NAME[group]() : item.section}
          <span className="font-normal text-neutral-500">
            {" · "}
            {sectionCounts.get(item.section)}
          </span>
        </li>,
      );
      previousTopic = undefined;
    }
    previousSection = item.section || previousSection;
    if (item.topic && item.topic !== previousTopic) {
      rows.push(
        <li
          key={`topic-${item.id}`}
          data-testid={`topic-${item.id}`}
          className="ml-1 mt-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300"
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
        onOpenCitations={
          onOpenCitations ? () => onOpenCitations(item.id) : undefined
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
  onOpenCitations,
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
  /** Expand onto the citation block (spec-view-60). */
  onOpenCitations?: () => void;
}) {
  const group = item.group;
  // The row keeps a muted citation summary, collapsed or expanded
  // (spec-view-3) — complete in both directions, unlike the cross-file
  // file rollup — and where the host holds the card it is the
  // summary card's control (spec-view-60).
  const hint = citationSummary(item.cites.length, inbound.length);
  const summaryLinkKey = summaryKey(item.id);

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
          <span className="text-xs text-neutral-500">
            {i18n._({ id: "not found", comment: "the cited item is not in this tree" })}
          </span>
        ) : targetGroup === undefined && itemIndex.size > 0 ? (
          // A citation the tree cannot resolve says so where it
          // stands (spec-view-19).
          <span
            data-testid={`unresolved-${item.id}-${target}`}
            className="text-xs text-neutral-500"
          >
            {i18n._({ id: "unresolved", comment: "this citation names an item absent from the tree" })}
          </span>
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
            aria-label={i18n._("Copy {id}", { id: item.id })}
            title={i18n._("Copy {id}", { id: item.id })}
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
            {i18n._({ id: "copied", comment: "the item's ID went to the clipboard" })}
          </span>
        ) : null}
        {copyFailed ? (
          <span className="shrink-0 text-xs text-red-600 dark:text-red-400">
            {i18n._({ id: "copy failed", comment: "the item's ID could not be copied" })}
          </span>
        ) : null}
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
          {hint && !(onOpenCitations && preview) ? (
            // An at-a-glance extra (spec-view-55): the expanded row's
            // citation rows carry the counts, so it hides first.
            <span className="hidden shrink-0 text-xs text-neutral-500 @md:inline">
              {hint}
            </span>
          ) : null}
        </button>
        {hint && onOpenCitations && preview ? (
          // Its own control, so it can raise the summary card and open
          // the citation block; an at-a-glance extra that hides first
          // in a narrow row (spec-view-55, spec-view-60).
          <button
            type="button"
            data-testid={`cite-summary-${item.id}`}
            onClick={() => {
              preview.close();
              onOpenCitations();
            }}
            onMouseEnter={(event) =>
              preview.hover(event.currentTarget, summaryLinkKey, summaryLinkKey)
            }
            onMouseLeave={preview.close}
            onFocus={(event) =>
              preview.focus(event.currentTarget, summaryLinkKey, summaryLinkKey)
            }
            onBlur={preview.close}
            className="-my-1 hidden shrink-0 rounded px-1 py-1 text-xs text-neutral-500 hover:text-neutral-700 hover:underline @md:inline dark:hover:text-neutral-300"
          >
            {hint}
          </button>
        ) : null}
        {despiteFilter ? (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {i18n._("shown despite filter")}
          </span>
        ) : null}
        {/* The row's own action, at its end: the row's hover or a
            focus within it reveals the control, and the keyboard
            always reaches it (spec-view-3, DR-010 §6). */}
        {onEdit ? (
          <button
            type="button"
            data-testid={`item-edit-${item.id}`}
            aria-label={i18n._("Edit {id} in its file", { id: item.id })}
            onClick={onEdit}
            className={`ml-auto shrink-0 rounded px-1 text-xs opacity-0 focus:opacity-100 group-hover/item:opacity-100 group-focus-within/item:opacity-100 ${LINK_CLASS}`}
          >
            {i18n._({ id: "Edit", comment: "open this file in the editor" })}
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
            <Markdown text={item.text} hideComments />
          </div>
          {notFoundKey?.startsWith(`body:${item.id}:`) ? (
            <div className="flex items-center gap-1 text-xs">
              <span className="font-mono text-neutral-500">
                {notFoundKey.slice(`body:${item.id}:`.length)}
              </span>
              <span className="text-xs text-neutral-500">
                {i18n._({ id: "not found", comment: "the cited item is not in this tree" })}
              </span>
            </div>
          ) : null}
          {/* One citations block: the outbound row and the backlink
              row read down a single label column, their entries
              wrapping in the slack beside it (spec-view-19). */}
          {item.cites.length > 0 || inbound.length > 0 ? (
            <div
              id={citationsDomId(item.id, idPrefix)}
              data-testid={`citations-${item.id}`}
              // The summary hands focus here (spec-view-60).
              tabIndex={-1}
              aria-label={i18n._("Citations of {id}", { id: item.id })}
              className="flex flex-col gap-1 rounded text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              {item.cites.length > 0 ? (
                <div
                  data-testid={`cites-${item.id}`}
                  className="flex items-start gap-2"
                >
                  <span className="w-20 shrink-0 text-neutral-500">
                    {i18n._({ id: "cites", comment: "row label over the items this one cites" })}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {item.cites.map(citation)}
                  </span>
                </div>
              ) : null}
              {inbound.length > 0 ? (
                // Every backlink listed, never behind a toggle
                // (spec-view-19).
                <div
                  data-testid={`inbound-${item.id}`}
                  className="flex items-start gap-2"
                >
                  <span className="w-20 shrink-0 text-neutral-500">
                    {i18n._({
                      id: "cited by {in}",
                      values: { in: inbound.length },
                      comment: "how many items cite this one",
                    })}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {inbound.map(citation)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

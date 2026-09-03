// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The citation preview at hand (spec-view-61): one card behind every
// citation entry in the spec view — an outbound row's entry, a
// backlink, or an item citation inside a rendered body. It follows
// the graph's details card (spec-view-26) rather than the browser's
// native tooltip: a rendered card, opened once the pointer settles
// and at once on keyboard focus, laid inside the scrolling box it
// belongs to so it never widens or scrolls the page (DR-041 §9).

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpecItemInfo } from "@sublang/spex-core/protocol";

import { Markdown } from "./Markdown.js";

/** How long a pointer settles on an entry before its card opens: long
 * enough that crossing a row of chips flashes nothing, short enough
 * to read as an answer to the hover (spec-view-61). */
export const HOVER_INTENT_MS = 120;

/** The one card's DOM id: the entry it describes points here with
 * aria-describedby, and only one card ever stands. */
export const PREVIEW_CARD_ID = "specv-citation-preview";

/** The card's width, and the margin it keeps from its box's edges. */
const CARD_WIDTH = 288;
const EDGE = 8;
/** The gap between the entry and its card. */
const GAP = 6;
/** The card's height budget, for choosing below or above the entry
 * before the card itself is measured. */
const CARD_HEIGHT = 210;
/** Body lines the card carries; the rest is cut by the fade. */
const OPENING_LINES = 8;

/** Markdown read as the words it renders, for comparing a body's
 * opening with the digest the parse cut from it. */
function plain(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The body's opening as the card shows it, under the first line the
 * card already carries: the statement's own paragraph drops, so the
 * card adds the item's attachment rather than repeating its heading
 * [[meta-29]]. Link syntax is reduced to its text and a bare URL read
 * as code, so the card holds no focusable target — closing it can then
 * never strand focus (DR-010 §6). */
export function previewOpening(text: string, firstLine = ""): string {
  const paragraphs = text.split(/\n{2,}/);
  const probe = plain(firstLine).slice(0, 24);
  const rest =
    probe && plain(paragraphs[0] ?? "").startsWith(probe)
      ? paragraphs.slice(1)
      : paragraphs;
  return rest
    .join("\n\n")
    .split("\n")
    .slice(0, OPENING_LINES)
    .join("\n")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "`$&`")
    .trim();
}

/** The standing card: which entry raised it, the item it names, and
 * where it sits in its box's content coordinates. */
export interface CitationPreviewOpen {
  /** The entry's link key, so a rendered entry knows it is described. */
  key: string;
  /** The cited item ID — named even when the tree has no such item. */
  target: string;
  left: number;
  top: number;
  /** Laid above its entry, there being no room below. */
  above: boolean;
}

/** What a citation entry needs to raise and drop the card. */
export type CitationAnchors = Omit<CitationPreviewApi, "open">;

export interface CitationPreviewApi {
  open: CitationPreviewOpen | null;
  /** Hover: the card opens once the pointer has settled. */
  hover: (anchor: HTMLElement, target: string, key: string) => void;
  /** Keyboard focus: the card opens at once. */
  focus: (anchor: HTMLElement, target: string, key: string) => void;
  /** Pointer leave, blur, Escape, or the entry's jump. */
  close: () => void;
}

/** Where the card sits inside `box` for an entry: below the entry by
 * default, above it where the box has no room, and never past the
 * box's edges (DR-041 §9). Coordinates are the box's own content
 * space, since the card is absolute inside it. */
function placeIn(
  box: HTMLElement | null,
  anchor: HTMLElement,
): Pick<CitationPreviewOpen, "left" | "top" | "above"> {
  if (!box) return { left: EDGE, top: GAP, above: false };
  const boxAt = box.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const width = Math.min(CARD_WIDTH, Math.max(box.clientWidth - 2 * EDGE, 0));
  const room = boxAt.bottom - at.bottom;
  const above = room < CARD_HEIGHT && at.top - boxAt.top > room;
  const left =
    Math.min(
      Math.max(at.left - boxAt.left, EDGE),
      Math.max(box.clientWidth - width - EDGE, EDGE),
    ) + box.scrollLeft;
  const top = above
    ? at.top - boxAt.top + box.scrollTop - GAP
    : at.bottom - boxAt.top + box.scrollTop + GAP;
  return { left, top, above };
}

/** The preview's state machine, owned by the view that holds the
 * card's box: `boxOf` names the box as it stands when a card opens —
 * the outline pane with the graph beside it, the surface root without
 * (spec-view-61). */
export function useCitationPreview(
  boxOf: () => HTMLElement | null,
): CitationPreviewApi {
  const [open, setOpen] = useState<CitationPreviewOpen | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Entries inside a rendered body are the markdown's own anchors, not
  // React's: the description lands on the element and comes off again
  // when the card closes, so every entry is described the same way.
  const described = useRef<HTMLElement | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const undescribe = useCallback(() => {
    described.current?.removeAttribute("aria-describedby");
    described.current = null;
  }, []);

  const focus = useCallback(
    (anchor: HTMLElement, target: string, key: string) => {
      stopTimer();
      undescribe();
      anchor.setAttribute("aria-describedby", PREVIEW_CARD_ID);
      described.current = anchor;
      setOpen({ key, target, ...placeIn(boxOf(), anchor) });
    },
    [boxOf, stopTimer, undescribe],
  );

  const hover = useCallback(
    (anchor: HTMLElement, target: string, key: string) => {
      stopTimer();
      timer.current = setTimeout(
        () => focus(anchor, target, key),
        HOVER_INTENT_MS,
      );
    },
    [focus, stopTimer],
  );

  const close = useCallback(() => {
    stopTimer();
    undescribe();
    setOpen(null);
  }, [stopTimer, undescribe]);

  // Escape dismisses the card wherever focus sits — a hover raised it
  // without moving focus at all. The view's own Escape rung claims the
  // key first while the card stands, so the ladder keeps its order
  // (spec-view-42).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  return { open, hover, focus, close };
}

/** The card itself: the cited item's chip, its first line, and the
 * opening of its body under a fade — or, for an ID the tree does not
 * carry, that plain fact (spec-view-61). */
export function CitationPreview({
  open,
  item,
  chipClass,
}: {
  open: CitationPreviewOpen;
  /** The cited item; absent when the tree carries no such ID. */
  item?: SpecItemInfo;
  /** The target group's chip colors, as the outline spells them. */
  chipClass?: string;
}) {
  const opening = item ? previewOpening(item.text, item.firstLine) : "";
  return (
    <div
      id={PREVIEW_CARD_ID}
      role="tooltip"
      data-testid="citation-preview"
      // Never a pointer target: the card is read, not used, so the
      // pointer leaving its entry always closes it.
      className={`pointer-events-none absolute z-20 w-72 max-w-[calc(100%-1rem)] rounded-lg border border-neutral-200 bg-white p-2.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 ${
        open.above ? "-translate-y-full" : ""
      }`}
      style={{ left: open.left, top: open.top }}
    >
      {item ? (
        <>
          <div className="flex items-start gap-2">
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
                chipClass ?? ""
              }`}
            >
              {open.target}
            </span>
            {/* The item's statement heads the card, three lines at
                most: a long one is read in full at its own row. */}
            <span className="line-clamp-3 min-w-0 flex-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {item.firstLine}
            </span>
          </div>
          {/* About six lines of what follows the statement, the cut
              fading out rather than ending mid-word (DR-026's honest
              edge). */}
          {opening ? (
            <div className="mt-1.5 max-h-[7.5rem] overflow-hidden text-neutral-600 [mask-image:linear-gradient(to_bottom,black_calc(100%-1.5rem),transparent)] dark:text-neutral-300">
              <Markdown text={opening} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          <span className="font-mono text-xs">{open.target}</span> — not in the
          tree
        </div>
      )}
    </div>
  );
}

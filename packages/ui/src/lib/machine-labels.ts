// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The machine card's words (run-view-60/61/76/81, DR-010 §8): the type
// steps a room can read from a projector, boxes as wide as their
// longest label, captions that fall back before they spill, exits
// that keep quiet until walked, and the rule by which a drawing
// scales to its pane or scrolls. Pure over the solved layout, so the
// geometry law stays where it is solved and the card only dresses it.

import type { MachineGraph, MachineGraphNode } from "@sublang/spex-core/protocol";

import type {
  MachineFrame,
  MachineLayout,
  MachinePlacement,
} from "./machine-frames.js";
import { ROW_GAP, STATE_W } from "./machine-frames.js";
import { humanizeId } from "./labels.js";

/** State names, captions, and exit labels: 13 / 12 / 11px — the
 * small step and one below it for the exits, which are the only
 * text on the card allowed under 12px because a box, not a line,
 * carries their meaning (DR-010 §8). */
export const NAME_PX = 13;
export const CAPTION_PX = 12;
export const EXIT_PX = 11;

/** A system sans face averages a little over half an em per character
 * in mixed-case words; the estimate leans wide so a box never spills,
 * since SVG text cannot ellipsize. */
const EM_PER_CHAR = 0.54;

/** The name's inset on either side, and the caption's — the running
 * mark takes the caption's left inset. */
const NAME_INSET = 24;
const CAPTION_INSET = 28;

/** No box grows past this: a longer caption falls back to its role,
 * and a longer name is trimmed with its whole in the title. */
export const STATE_W_MAX = 240;

/** The estimated pixel width of `text` set at `px`. */
export function textWidth(text: string, px: number): number {
  return Math.ceil(text.length * px * EM_PER_CHAR);
}

/** The caption a state wears: the call it runs, or the role the
 * machine asked for with the player answering it — a lane several
 * roles share makes the pair the only unambiguous label (DR-032). */
export function stateCaption(
  node: MachineGraphNode,
  frame: MachineFrame,
): { text: string; role?: string } | undefined {
  const call = [...frame.calls].reverse().find((c) => c.stateId === node.id);
  if (call) return { text: `call /${call.playbookId}` };
  const player =
    frame.activePlayer && frame.activePlayer.stateId === node.id
      ? frame.activePlayer
      : undefined;
  if (player) {
    return player.playerId && player.playerId !== player.role
      ? { text: `${player.role} · ${player.playerId}`, role: player.role }
      : { text: player.role, role: player.role };
  }
  return node.role ? { text: humanizeId(node.role) } : undefined;
}

/** The words a caption shows in a box of `boxWidth`: the whole
 * caption where it fits, the role alone where the pair does not, and
 * a trimmed role as the last resort — the full text stays in the
 * box's title (run-view-61). */
export function fitCaption(
  caption: { text: string; role?: string },
  boxWidth: number,
): string {
  const room = Math.max(0, boxWidth - CAPTION_INSET);
  if (textWidth(caption.text, CAPTION_PX) <= room) return caption.text;
  const fallback = caption.role ?? caption.text;
  if (textWidth(fallback, CAPTION_PX) <= room) return fallback;
  const chars = Math.max(
    3,
    Math.floor(room / (CAPTION_PX * EM_PER_CHAR)) - 1,
  );
  return `${fallback.slice(0, chars)}…`;
}

/** A state name in a box of `boxWidth`, trimmed only past the cap. */
export function fitName(name: string, boxWidth: number): string {
  const room = Math.max(0, boxWidth - NAME_INSET);
  if (textWidth(name, NAME_PX) <= room) return name;
  const chars = Math.max(3, Math.floor(room / (NAME_PX * EM_PER_CHAR)) - 1);
  return `${name.slice(0, chars)}…`;
}

/** The width a box needs for its name and caption. */
export function labelWidth(name: string, caption?: string): number {
  const forName = textWidth(name, NAME_PX) + NAME_INSET;
  const forCaption = caption ? textWidth(caption, CAPTION_PX) + CAPTION_INSET : 0;
  return Math.min(STATE_W_MAX, Math.max(STATE_W, forName, forCaption));
}

/** The solved layout re-dressed with boxes as wide as their column's
 * longest label (run-view-60): each column takes the width its widest
 * name or caption needs, from the geometry's own floor up to the cap,
 * and the columns shift right to make room — rank heights, kinds, and
 * order untouched, so the geometry law solved once stays solved. */
export function widenLayout(
  layout: MachineLayout,
  graph: MachineGraph,
  frame: MachineFrame,
): MachineLayout {
  const columnOf = (place: MachinePlacement): number =>
    Math.round(place.x / (STATE_W + ROW_GAP));
  const widths = new Map<number, number>();
  for (const node of graph.nodes) {
    const place = layout.nodes.get(node.id);
    if (!place) continue;
    const column = columnOf(place);
    const need = labelWidth(humanizeId(node.id), stateCaption(node, frame)?.text);
    widths.set(column, Math.max(widths.get(column) ?? STATE_W, need));
  }
  const columns = [...widths.keys()].sort((a, b) => a - b);
  const offsets = new Map<number, number>();
  let x = 0;
  for (const column of columns) {
    offsets.set(column, x);
    x += (widths.get(column) as number) + ROW_GAP;
  }
  const nodes = new Map<string, MachinePlacement>();
  let width = 0;
  for (const [id, place] of layout.nodes) {
    const column = columnOf(place);
    const boxWidth = widths.get(column) ?? STATE_W;
    const left = offsets.get(column) ?? place.x;
    nodes.set(id, { ...place, x: left, width: boxWidth });
    width = Math.max(width, left + boxWidth);
  }
  return { ...layout, nodes, width: Math.max(width, 1) };
}

/** A state the run parks in or fails to — the exits into it are the
 * noise of a machine's every escape hatch, so they fold until walked
 * (run-view-76). An observed drawing carries no tags; the failed
 * state still names itself. */
export function isRestState(node: MachineGraphNode | undefined): boolean {
  if (!node) return false;
  return node.tags.includes("playbook.parked") || /fail/i.test(node.id);
}

/** A drawing scales down to its pane when its natural width exceeds
 * the pane by less than this share; past it, the drawing keeps its
 * size and scrolls (run-view-81) — scaled further, the names it
 * exists to show fall under the type floor. */
export const SCALE_HEADROOM = 0.25;

/** The narrowest pane a drawing of `natural` width scales into. */
export function scaleFloor(natural: number): number {
  return Math.round((natural / (1 + SCALE_HEADROOM)) * 10) / 10;
}

/** Whether a drawing of `natural` width scales to a pane `pane` wide
 * rather than scrolling — the rule the card's CSS expresses. */
export function fitsByScaling(natural: number, pane: number): boolean {
  return pane < natural && pane >= scaleFloor(natural);
}

/** The card's CSS for the rule (DR-041: width-dependent form as a
 * container query, never a width hook): `--fit` is 1px while the pane
 * clears the floor and 0px below it; the drawing's width is the pane
 * while `--fit` holds and its natural width otherwise; the edge mask
 * fades only while the drawing scrolls. */
export function drawingWidthRule(natural: number): {
  fit: string;
  beyond: string;
  width: string;
} {
  const floor = scaleFloor(natural);
  return {
    fit: `clamp(0px, (100cqw - ${floor}px) * 1000000, 1px)`,
    beyond: "calc(var(--fit) * 1000000)",
    width: `min(${natural}px, 100cqw + (1px - var(--fit)) * 1000000)`,
  };
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The pipeline's stage idiom (playbook-library-22): the row of stages
// a configured playbook wears, the capped box an open stage's artifact
// stands in, the State machine's pinned state list, and the Gears
// artifact drawn as the outline's own item rows. The Library's cards
// and the authoring workspace's Gears and Machine tabs (DR-058) draw
// from these same parts, so no second artifact grammar exists.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SpecFileInfo } from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import { ResizableFrame } from "./ResizableFrame.js";
import { CitationPreview, useCitationPreview } from "./CitationPreview.js";
import { GROUP_CHIP, itemDomId, SpecItemRows } from "./SpecItemRows.js";
import { buildItemIndex } from "../lib/spec-view-model.js";

/** The pipeline's stages. Each label and hint is read when the row
 * draws, never when this module loads, so the table never freezes the
 * language it was imported in (localization-4); the key stays a plain
 * identifier, and a stage row takes the words as the strings they
 * already are. */
export const STAGES = [
  {
    key: "source",
    get label() {
      return i18n._({ id: "Source", comment: "pipeline stage: the authored workflow" });
    },
    get hint() {
      return i18n._("The workflow markdown the playbook was compiled from");
    },
  },
  {
    key: "gears",
    get label() {
      return i18n._({
        id: "Gears",
        comment: "pipeline stage: the compiler's normative spec items (a proper name)",
      });
    },
    get hint() {
      return i18n._(
        "One normative spec item per state behavior — the compiler's middle stage",
      );
    },
  },
  {
    key: "fsm",
    get label() {
      return i18n._({ id: "State machine", comment: "pipeline stage: the compiled machine" });
    },
    get hint() {
      return i18n._("The compiled XState machine that drives the players");
    },
  },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

/** The pipeline as a row (PBLIB-22): a card wears its stages joined
 * by arrows, each stage a toggle opening its artifact beneath. The
 * row is a control row on a card, so labels hold the 14-character
 * budget (DR-041) and every stage keeps a 24px target (DR-010 §7). */
export function StageRow<Key extends string>({
  stages,
  open,
  absent,
  onPress,
  testId,
}: {
  stages: readonly { key: Key; label: string; hint: string }[];
  /** The stage standing open, if any — one at a time per card. */
  open?: Key;
  /** Stages the load reported missing; empty until it lands. */
  absent?: readonly string[];
  onPress: (key: Key) => void;
  testId: string;
}) {
  return (
    // The row is flush with the card's content: the first label's
    // own padding is pulled back, and each arrow travels with the
    // stage before it so a wrapped line starts on a label.
    <div className="-ml-2 flex flex-wrap items-center gap-1" data-testid={testId}>
      {stages.map((entry, index) => {
        const missing = absent?.includes(entry.key) ?? false;
        return (
          <span key={entry.key} className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={open === entry.key}
              disabled={missing}
              title={
                missing
                  ? i18n._("{stage} not found next to this playbook's registry", {
                      stage: entry.label,
                    })
                  : entry.hint
              }
              onClick={() => onPress(entry.key)}
              className={`inline-flex min-h-6 items-center rounded-md px-2 text-xs ${
                open === entry.key
                  ? "bg-brand-100 font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  : missing
                    ? "text-neutral-400 line-through dark:text-neutral-500"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {entry.label}
            </button>
            {index < stages.length - 1 ? (
              <span
                aria-hidden="true"
                className="text-neutral-400 dark:text-neutral-500"
              >
                →
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** The open stage's box, in rem steps (playbook-library-22): 24rem
 * standing, 8rem to 48rem once the reader has pulled its bottom edge,
 * one height serving a card's stages (DR-030). */
const STAGE_UNIT = 16;
const STAGE_DEFAULT = 24;
const STAGE_MIN = 8;
const STAGE_MAX = 48;

/** The open stage's artifact, in the capped frame beneath the row —
 * with what the stage pins standing above the frame, so it holds its
 * place at every scroll position and every height the reader sets. */
export function StageBox({
  id,
  stage,
  header,
  children,
}: {
  id: string;
  /** The open stage's label, so the grip names what it resizes. */
  stage: string;
  /** The stage's pinned header, outside the scrolling frame. */
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {header}
      <ResizableFrame
        frameId={`stage:${id}`}
        label={i18n._("Resize the {stage} stage", { stage })}
        unit={STAGE_UNIT}
        defaultSteps={STAGE_DEFAULT}
        minSteps={STAGE_MIN}
        maxSteps={STAGE_MAX}
        data-testid={`stage-box-${id}`}
        className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
      >
        {children}
      </ResizableFrame>
    </div>
  );
}

/** The State machine stage's derived state list (PBLIB-22), pinned
 * above the frame: the chips wrap rather than overflow (DR-041 §9), so
 * the states stay in view at any scroll position and any height. */
export function StateList({ id, states }: { id: string; states: string[] }) {
  return (
    <div
      data-testid={`stage-states-${id}`}
      className="flex flex-wrap items-center gap-1"
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {i18n._({
          id: "states",
          comment: "heading over the machine's state chips",
        })}
      </span>
      {states.map((state) => (
        <span
          key={state}
          className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
        >
          {state}
        </span>
      ))}
    </div>
  );
}

/** The Gears stage as the outline's own item rows (PBLIB-22): the
 * artifact is a GEARS package file, so the card draws the parse the
 * core serves — rows collapsed, each expanding to its body, a citation
 * of a sibling landing on it inside the box — never a wall of
 * markdown. Read-only: no filters, no edit, no tree beyond this file. */
export function GearsItems({ id, file }: { id: string; file: SpecFileInfo }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pendingJump, setPendingJump] = useState<string>();
  const [flashId, setFlashId] = useState<string>();
  const [notFoundKey, setNotFoundKey] = useState<string>();
  // One artifact, one index: a citation resolves within this file or
  // it resolves nowhere — the card holds no spec tree.
  const itemIndex = useMemo(() => buildItemIndex([file]), [file]);
  const prefix = `gears-${id}`;
  // The same card the outline's entries raise (spec-view-61), laid in
  // this list's own box so the stage frame contains it.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const preview = useCitationPreview(useCallback(() => boxRef.current, []));
  const previewed = preview.open
    ? itemIndex.get(preview.open.target)
    : undefined;

  // The landing waits for the expansion to commit, then scrolls the
  // row into the box, takes focus (DR-010 §6), and flashes it.
  useEffect(() => {
    if (!pendingJump) return;
    const element = document.getElementById(itemDomId(pendingJump, prefix));
    if (element && typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "center" });
    }
    element?.focus({ preventScroll: true });
    setFlashId(pendingJump);
    setPendingJump(undefined);
  }, [pendingJump, prefix]);

  useEffect(() => {
    if (!flashId) return;
    const timer = setTimeout(() => setFlashId(undefined), 1200);
    return () => clearTimeout(timer);
  }, [flashId]);

  return (
    <div ref={boxRef} className="relative">
      <SpecItemRows
        items={file.items}
        idPrefix={prefix}
        itemIndex={itemIndex}
        expandedItems={expanded}
        flashId={flashId}
        notFoundKey={notFoundKey}
        preview={preview}
        onToggleItem={(itemId) =>
          setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(itemId)) next.add(itemId);
            return next;
          })
        }
        onJump={(linkKey, targetId) => {
          preview.close();
          if (!itemIndex.has(targetId)) {
            setNotFoundKey(linkKey);
            return;
          }
          setNotFoundKey(undefined);
          setExpanded((current) => new Set(current).add(targetId));
          setPendingJump(targetId);
        }}
      />
      {preview.open ? (
        <CitationPreview
          open={preview.open}
          item={previewed?.item}
          chipClass={previewed ? GROUP_CHIP[previewed.group] : undefined}
        />
      ) : null}
    </div>
  );
}

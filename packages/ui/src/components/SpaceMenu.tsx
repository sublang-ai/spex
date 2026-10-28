// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The Space surface's menus (space-1, space-111, run-view-170, DR-159):
// a row's and a group heading's one overflow control, "More", and a
// row's Open where it offers more than one place. One trigger opens a
// menu of acts anchored beneath it through the house popover idiom
// (usePopover): focus moves into the menu, ↑/↓ walk it, Escape, Tab and
// a click outside close it, focus going back to the trigger. An entry
// the state does not offer now stands disabled with its reason beside
// its words; an entry whose words are short of its full name carries
// that name as its title and accessible name (space-28, DR-041).

import { useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { i18n } from "../i18n.js";
import { usePopover } from "../lib/usePopover.js";
import { SECONDARY } from "./SpaceSurface.js";

/** One act of a menu. */
export interface MenuEntry {
  /** Its words. */
  label: string;
  /** Its full name, as its title and accessible name, where the words
   * are shorter. */
  name?: string;
  /** What it does, as its title, where its name says less. */
  title?: string;
  /** Words beside the label in the secondary tone: why a disabled
   * entry is not offered now. */
  hint?: string;
  testId: string;
  disabled?: boolean;
  onSelect(): void;
}

const MENU_ITEM =
  "flex min-h-6 w-full min-w-0 flex-col items-start rounded px-2 py-1 text-left text-xs hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-neutral-800";

/** The words "More" the overflow control is named by (space-1). */
export const moreLabel = (): string =>
  i18n._({ id: "More", comment: "the one overflow control of a Space row, a group's heading or a server's line: opens its other acts" });

/** A menu button: the trigger, and while open, its entries beneath it.
 * `trigger` is what the button shows; `name` its accessible name. */
export function MenuButton({
  trigger,
  name,
  title,
  testId,
  entries,
  disabled,
  buttonRef,
  className,
  describedBy,
}: {
  trigger: ReactNode;
  name: string;
  title?: string;
  testId: string;
  entries: MenuEntry[];
  disabled?: boolean;
  /** The trigger, for a caller handing focus back to it. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
  className?: string;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const ownRef = useRef<HTMLButtonElement>(null);
  const anchorRef = buttonRef ?? ownRef;
  const menuId = useId();
  const menuRef = usePopover<HTMLDivElement>(open, {
    anchorRef,
    onClose: () => setOpen(false),
    menu: true,
  });
  return (
    <span className="relative inline-flex shrink-0">
      <button
        ref={anchorRef}
        type="button"
        data-testid={testId}
        aria-label={name}
        title={title ?? name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-describedby={describedBy}
        className={className ?? `${SECONDARY} shrink-0 whitespace-nowrap`}
        disabled={disabled}
        onClick={() => setOpen((was) => !was)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={name}
          data-testid={`${testId}-menu`}
          className="absolute right-0 top-full z-20 mt-0.5 flex w-max min-w-40 max-w-[16rem] flex-col rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {entries.map((entry) => (
            <button
              key={entry.testId}
              type="button"
              role="menuitem"
              data-testid={entry.testId}
              aria-label={entry.name}
              title={entry.title ?? entry.name ?? entry.hint}
              className={MENU_ITEM}
              disabled={entry.disabled}
              onClick={() => {
                setOpen(false);
                entry.onSelect();
              }}
            >
              <span className="min-w-0 max-w-full truncate">{entry.label}</span>
              {entry.hint ? (
                <span className="min-w-0 max-w-full whitespace-normal break-words text-neutral-500">{entry.hint}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/** The overflow control (space-1): "⋯" for the eye, "More for <name>"
 * for assistive technology and the title, opening its entries. */
export function MoreMenu({
  of,
  testId,
  entries,
  disabled,
  buttonRef,
}: {
  /** What the menu acts on, which names it. */
  of: string;
  testId: string;
  entries: MenuEntry[];
  disabled?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  if (entries.length === 0) return null;
  const name = i18n._({
    id: "More for {name}",
    values: { name: of },
    comment: "the accessible name of the overflow control \"More\" on a Space row, a group's heading or a server's line; {name} is what it acts on",
  });
  return (
    <MenuButton
      trigger={
        <>
          <span aria-hidden>⋯</span>
          <span className="sr-only">{moreLabel()}</span>
        </>
      }
      name={name}
      testId={testId}
      entries={entries}
      disabled={disabled}
      buttonRef={buttonRef}
      className="min-h-6 min-w-6 shrink-0 rounded px-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
    />
  );
}

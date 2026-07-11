// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Slash menu (RUN-27): typing "/" at the start of a composer lists
// the configured playbooks filtered by prefix, with intents as
// hints. Parents own the keyboard state; this module provides the
// matching logic and the list rendering.

import type { PlaybookSummary } from "@sublang/spex-core/protocol";

/** Playbooks matching a composer draft, or null when the menu is closed. */
export function slashMatches(
  text: string,
  playbooks: PlaybookSummary[],
): PlaybookSummary[] | null {
  if (!text.startsWith("/") || text.includes(" ") || text.includes("\n")) {
    return null;
  }
  const query = text.slice(1).toLowerCase();
  const matches = playbooks.filter((playbook) =>
    playbook.command.toLowerCase().startsWith(query),
  );
  return matches.length > 0 ? matches : null;
}

export function SlashMenuList({
  items,
  activeIndex,
  onPick,
  onCompileNew,
}: {
  items: PlaybookSummary[];
  activeIndex: number;
  onPick: (playbook: PlaybookSummary) => void;
  /** Discoverable creation entry (DR-009, RUN-34). */
  onCompileNew?: () => void;
}) {
  return (
    <div
      data-testid="slash-menu"
      className="absolute bottom-full left-0 z-10 mb-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      {items.map((playbook, index) => (
        <button
          key={playbook.id}
          type="button"
          onMouseDown={(event) => {
            // Fire before the textarea loses focus.
            event.preventDefault();
            onPick(playbook);
          }}
          className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${
            index === activeIndex
              ? "bg-indigo-50 dark:bg-indigo-950"
              : "hover:bg-neutral-50 dark:hover:bg-neutral-800"
          }`}
        >
          <span className="font-mono font-semibold">/{playbook.command}</span>
          <span className="truncate text-xs text-neutral-500">
            {playbook.intent}
          </span>
        </button>
      ))}
      {onCompileNew ? (
        <button
          type="button"
          data-testid="slash-compile-new"
          onMouseDown={(event) => {
            event.preventDefault();
            onCompileNew();
          }}
          className="flex w-full items-baseline gap-2 border-t border-neutral-100 px-3 py-1.5 text-left text-xs text-neutral-500 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
        >
          + Compile a new playbook…
        </button>
      ) : null}
    </div>
  );
}

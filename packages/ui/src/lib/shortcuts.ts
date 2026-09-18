// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The application's keyboard shortcuts, named once (run-view-49,
// DR-010 §6): the handler in App reads its bindings here, every
// tooltip prints the platform's own modifier, and Settings lists the
// sheet from this table.
//
// A sheet entry's words are read from the catalog when the row draws,
// never stored at module load, or the table would freeze the language
// it was imported in (localization-4). They are getters rather than
// thunks so the sheet reads as the plain table it is at every call
// site; key glyphs stay as they are in every language.

import { i18n } from "../i18n.js";

/** The modifier glyph for the platform the page runs on: ⌘ on a
 * Mac, Ctrl elsewhere — the handler accepts both keys, the label
 * shows the one the reader has. */
export function modKey(): string {
  const platform =
    typeof navigator === "undefined"
      ? ""
      : ((navigator as { userAgentData?: { platform?: string } }).userAgentData
          ?.platform ?? navigator.platform ?? "");
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
}

/** "⌘P" or "Ctrl+P": the modifier joined to a key the platform way. */
export function keyLabel(...keys: string[]): string {
  const mod = modKey();
  return mod === "⌘" ? `⌘${keys.join("")}` : [mod, ...keys].join("+");
}

export interface Shortcut {
  /** The keys after the modifier, as shown: "P", "⇧S", "1–5". */
  keys: string;
  /** What it does, in the reader's words. */
  does: string;
}

/** The sheet, in the order a user learns them. */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: "P", get does() { return i18n._("Switch or add a project"); } },
  { keys: "N", get does() { return i18n._("Start a new session in the current project"); } },
  { keys: "1–5", get does() { return i18n._("Go to Dashboard, Projects, Playbooks, Space, Settings"); } },
  { keys: ",", get does() { return i18n._("Open Settings"); } },
  { keys: "B", get does() { return i18n._("Collapse or show the sidebar"); } },
  { keys: "⇧S", get does() { return i18n._("Open the project's Specs"); } },
  { keys: "⇧[", get does() { return i18n._("Previous tab in Projects"); } },
  { keys: "⇧]", get does() { return i18n._("Next tab in Projects"); } },
];

/** Shortcuts that need no modifier. */
export const PLAIN_SHORTCUTS: readonly Shortcut[] = [
  { keys: "Enter", get does() { return i18n._("Send the message; Shift+Enter adds a line"); } },
  { keys: "Escape", get does() { return i18n._("Close the menu, palette, or editor at hand"); } },
  { keys: "Delete", get does() { return i18n._("Close the focused session tab"); } },
  { keys: "Alt+↑ / Alt+↓", get does() { return i18n._("Move the focused Up next row"); } },
  {
    // The one "key" that is a phrase rather than a glyph.
    get keys() { return i18n._({ id: "any letter", comment: "keyboard shortcut column: pressing any letter key" }); },
    get does() { return i18n._("Start typing in the composer from anywhere in Projects"); },
  },
];

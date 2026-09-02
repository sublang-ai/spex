// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The application's keyboard shortcuts, named once (run-view-49,
// DR-010 §6): the handler in App reads its bindings here, every
// tooltip prints the platform's own modifier, and Settings lists the
// sheet from this table.

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
  /** The keys after the modifier, as shown: "P", "⇧S", "1–4". */
  keys: string;
  /** What it does, in the reader's words. */
  does: string;
}

/** The sheet, in the order a user learns them. */
export const SHORTCUTS: readonly Shortcut[] = [
  { keys: "P", does: "Switch or add a project" },
  { keys: "N", does: "Start a new session in the current project" },
  { keys: "1–4", does: "Go to Dashboard, Workspace, Playbooks, Settings" },
  { keys: ",", does: "Open Settings" },
  { keys: "B", does: "Collapse or show the sidebar" },
  { keys: "⇧S", does: "Open the project's Specs" },
  { keys: "⇧[", does: "Previous tab in the Workspace" },
  { keys: "⇧]", does: "Next tab in the Workspace" },
];

/** Shortcuts that need no modifier. */
export const PLAIN_SHORTCUTS: readonly Shortcut[] = [
  { keys: "Enter", does: "Send the message; Shift+Enter adds a line" },
  { keys: "Escape", does: "Close the menu, palette, or editor at hand" },
  { keys: "Delete", does: "Close the focused session tab" },
  { keys: "Alt+↑ / Alt+↓", does: "Move the focused Up next row" },
  { keys: "any letter", does: "Start typing in the composer from anywhere in the Workspace" },
];

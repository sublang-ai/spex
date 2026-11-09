// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/** An inline task and the heading or row it belongs to share one frame. */
export const ATTACHED_OWNER = "rounded-md border-l-2 border-brand-300 bg-neutral-100/60 dark:border-brand-700 dark:bg-neutral-900/60";

/** The task continues beneath its owner, without another raised card. */
export const ATTACHED_PANEL = "mx-2 mb-2 border-t border-neutral-200 pt-3 dark:border-neutral-800";

/* Space's warm page and attached tint are darker than a white card, so
   light-theme status words take one step darker than the stock amber and
   red to hold WCAG AA (DR-010 §7); dark-theme tones stay as they were. */

/** A needs-you word (DR-010 §8) on a Space surface. */
export const ATTENTION_INK = "text-amber-800 dark:text-amber-300";

/** A failed or refused word (DR-010 §8) on a Space surface. */
export const ALERT_INK = "text-red-700 dark:text-red-400";

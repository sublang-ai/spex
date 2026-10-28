// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// One status vocabulary (run-view-186): a run, a step on its card, a
// player's lane and a call's return line say where they stand in the
// same five words and the same five colours, so no surface calls
// failed what another calls running.

import { i18n } from "../i18n.js";

export type Status = "running" | "done" | "aborted" | "failed" | "waiting";

export const STATUS_WORDS: Record<Status, () => string> = {
  running: () =>
    i18n._({ id: "running", comment: "a status word: at work now" }),
  done: () =>
    i18n._({ id: "done", comment: "a status word: it finished its work" }),
  aborted: () =>
    i18n._({ id: "aborted", comment: "a status word: it was stopped before it finished" }),
  failed: () =>
    i18n._({ id: "failed", comment: "a status word: it failed" }),
  waiting: () =>
    i18n._({ id: "waiting for you", comment: "a status word: it waits for the Boss to act" }),
};

/** Each status's pill: its ground and its ink. */
export const STATUS_PILL: Record<Status, string> = {
  running: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  done: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  aborted: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  waiting: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

/** Each status's ink alone, for a word in running text. */
export const STATUS_INK: Record<Status, string> = {
  running: "text-emerald-700 dark:text-emerald-400",
  done: "text-neutral-600 dark:text-neutral-400",
  aborted: "text-neutral-600 dark:text-neutral-400",
  failed: "text-red-600 dark:text-red-400",
  waiting: "text-amber-700 dark:text-amber-300",
};

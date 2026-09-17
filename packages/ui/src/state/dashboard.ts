// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The shape of one session's attention mark. Its content comes from
// the core's one ledger fold (dashboard-10) — no surface derives a
// summons of its own, so every dot, badge and row says the same thing
// and clears on the same act (DR-066).

/** The attention kinds a session's mark can wear, worst first: every
 * one of them names an act the reader can reach (dashboard-53). */
export type AttentionKind = "failure" | "question" | "finish" | "review";

export interface AttentionItem {
  kind: AttentionKind;
  sessionId: string;
  projectPath: string;
  text: string;
  /** Why a failure failed, in the catalogue's phrase (run-view-147,
   * DR-075): the mark's tooltip says it wherever the mark is read. */
  why?: string;
}

/** Worst-first order for a session carrying more than one entry. */
export const ATTENTION_RANK: Record<AttentionKind, number> = {
  failure: 0,
  question: 1,
  finish: 2,
  review: 3,
};

/** The one status-palette mark for each kind (DR-010 §8). */
export const ATTENTION_MARK_CLASS: Record<AttentionKind, string> = {
  failure: "bg-red-500",
  question: "bg-amber-500",
  finish: "bg-amber-500",
  review: "bg-amber-500",
};

/** What a project's mark says, in its worst entry's own words. */
export const PROJECT_ATTENTION_WORDS: Record<AttentionKind, string> = {
  failure: "failed",
  question: "is waiting for your reply",
  finish: "is waiting for your verdict",
  review: "has an unread turn",
};

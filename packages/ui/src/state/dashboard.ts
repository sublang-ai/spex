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
}

/** Worst-first order for a session carrying more than one entry. */
export const ATTENTION_RANK: Record<AttentionKind, number> = {
  failure: 0,
  question: 1,
  finish: 2,
  review: 3,
};

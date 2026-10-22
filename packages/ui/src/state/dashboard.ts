// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The shape of one session's attention mark. Its content comes from
// the core's one ledger fold (dashboard-10) — no surface derives a
// summons of its own, so every dot, badge and row says the same thing
// and clears on the same act (DR-066).

import type { AttentionEntry, LedgerState } from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";

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

/** What a project's mark says, in its worst entry's own words: one
 * whole sentence per kind, never a fragment another surface completes
 * (localization-4). Each is a thunk, never a string, because a table
 * read at module load would freeze the language it was imported in. */
export const PROJECT_ATTENTION_WORDS: Record<AttentionKind, () => string> = {
  failure: () => i18n._("A session failed"),
  question: () => i18n._("A session is waiting for your reply"),
  finish: () => i18n._("A session is waiting for your verdict"),
  review: () => i18n._("A session has an unread turn"),
};

/** One attention entry and the place whose core it is answered at
 * (dashboard-9). */
export interface PlacedEntry<P> {
  place: P;
  entry: AttentionEntry;
}

/** The attention queue across the places, and the count it publishes. */
export interface JoinedAttention<P> {
  entries: PlacedEntry<P>[];
  badge: number;
}

/** The bands, in the order the queue shows them (dashboard-54). */
const BANDS: readonly AttentionEntry["band"][] = ["interrupted", "finished"];

/** Join each place's ledger fold into one queue (dashboard-9, DR-133):
 * band by band, each band interleaved by onset — the place whose next
 * entry began first goes next, the earlier place in `places` on a tie,
 * this computer's where the caller lists it first — so each core's own
 * order stands. The count sums the badges of the folds read; a place
 * whose fold is not read, or not given, adds nothing. */
export function joinAttention<P>(
  places: readonly { place: P; ledger?: LedgerState | null }[],
): JoinedAttention<P> {
  const entries: PlacedEntry<P>[] = [];
  for (const band of BANDS) {
    const lanes = places.map(({ place, ledger }) => ({
      place,
      queue: (ledger?.attention ?? []).filter((entry) => entry.band === band),
      next: 0,
    }));
    for (;;) {
      let pick: (typeof lanes)[number] | undefined;
      for (const lane of lanes) {
        const head = lane.queue[lane.next];
        if (head && (!pick || head.since < pick.queue[pick.next]!.since)) pick = lane;
      }
      if (!pick) break;
      entries.push({ place: pick.place, entry: pick.queue[pick.next]! });
      pick.next += 1;
    }
  }
  const badge = places.reduce((sum, { ledger }) => sum + (ledger?.badge ?? 0), 0);
  return { entries, badge };
}

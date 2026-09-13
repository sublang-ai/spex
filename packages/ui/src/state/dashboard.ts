// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Deterministic attention derivation (DASH-1..3, DASH-11): a pure
// selector over protocol-derived state, ranked so human-blocking
// items come first.

import type { SessionInfo } from "@sublang/spex-core/protocol";

import { parkedFailure } from "../lib/machine-frames.js";
import type { SessionView } from "./reducer.js";

export type AttentionKind = "question" | "failure" | "idle";

export interface AttentionItem {
  kind: AttentionKind;
  sessionId: string;
  projectPath: string;
  text: string;
}

const RANK: Record<AttentionKind, number> = {
  question: 0,
  failure: 1,
  idle: 2,
};

export function deriveAttention(
  sessions: readonly SessionInfo[],
  views: Record<string, SessionView>,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const session of sessions) {
    if (!session.live) continue;
    const view = views[session.id];
    if (!view) continue;

    if (view.pendingQuestion !== undefined) {
      items.push({
        kind: "question",
        sessionId: session.id,
        projectPath: session.projectPath,
        text: view.pendingQuestion || "A player is waiting for your reply.",
      });
      continue;
    }
    // A run parked in its failure state summons until it leaves that
    // state — the answer the failed-workflow notice gives, read from
    // the same frames (run-view-34, DR-061). The session's last
    // reported state cannot answer: the Captain shell's own machine
    // writes that topic once the turn settles.
    const parked = parkedFailure(view.frames) !== undefined;
    // A failure that parked no machine is carried by its turn: only
    // errors from the LATEST turn count, so a clean later turn clears
    // the flag instead of pinning it forever.
    const lastError = [...view.captain]
      .reverse()
      .find(
        (line) =>
          line.kind === "error" && line.turnId === view.currentTurnId,
      );
    if (parked || (lastError && !view.turnActive)) {
      items.push({
        kind: "failure",
        sessionId: session.id,
        projectPath: session.projectPath,
        text: lastError?.text ?? "The playbook entered a failed state.",
      });
      continue;
    }
    if (!view.turnActive && view.captain.length > 0) {
      items.push({
        kind: "idle",
        sessionId: session.id,
        projectPath: session.projectPath,
        text: "Turn finished — review the result and direct the next step.",
      });
    }
  }
  return items.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

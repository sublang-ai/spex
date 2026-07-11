// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Status speaks human (DR-010 §2): internal identifiers never serve
// as primary copy. Known states map to plain phrases; unknown
// playbook-authored ids are humanized; the raw id belongs in a
// tooltip, not in the label.

export type StatusTone = "amber" | "red" | "emerald" | "neutral";

const STATE_LABELS: Record<string, string> = {
  awaitBossReply: "waiting for your reply",
  failed: "needs attention",
  idle: "idle",
  ready: "ready",
};

/** camelCase / snake_case / kebab-case → spaced lowercase words. */
export function humanizeId(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
}

/** Human label + tone for a session state. Tone keys off signals the
 * reducer derives (a pending question, failure), not open-ended
 * playbook-authored state names. */
export function stateLabel(
  fsmState: string | undefined,
  options?: { pendingQuestion?: boolean; turnActive?: boolean },
): { text: string; tone: StatusTone } {
  if (options?.pendingQuestion || fsmState === "awaitBossReply") {
    return { text: STATE_LABELS.awaitBossReply, tone: "amber" };
  }
  if (fsmState === "failed") {
    return { text: STATE_LABELS.failed, tone: "red" };
  }
  if (!fsmState) {
    return {
      text: options?.turnActive ? "players working" : "idle",
      tone: options?.turnActive ? "emerald" : "neutral",
    };
  }
  return {
    text: STATE_LABELS[fsmState] ?? humanizeId(fsmState),
    tone: options?.turnActive ? "emerald" : "neutral",
  };
}

/** Notification event labels (SET): wire ids stay in tooltips. */
export const NOTIFICATION_LABELS: Record<string, string> = {
  player_finished: "A player finishes its step",
  turn_finished: "A turn finishes",
  turn_aborted: "A turn is aborted",
};

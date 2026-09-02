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
  // The captain shell's own control loop rests here between runs;
  // "hub" is its wire id, not a thing to tell a person about.
  hub: "idle",
};

/** camelCase / snake_case / kebab-case → spaced lowercase words.
 * Coerces defensively: ids arrive from protocol payloads, and a
 * non-string here once masked a real error as
 * "e.replace is not a function". */
export function humanizeId(id: string): string {
  return String(id)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
}

/** Human label + tone for a session state. Tone keys off signals the
 * reducer derives (a pending question, failure), not open-ended
 * playbook-authored state names. While a turn is active and the
 * state names no leaf — no state yet, or the shell's own rest states
 * — the label says what the turn is doing: "working" while a player
 * runs, "deciding" while the Captain has the floor; a live turn never
 * reads "idle" (run-view-59). */
export function stateLabel(
  fsmState: string | undefined,
  options?: {
    pendingQuestion?: boolean;
    turnActive?: boolean;
    playersRunning?: boolean;
  },
): { text: string; tone: StatusTone } {
  if (options?.pendingQuestion || fsmState === "awaitBossReply") {
    return { text: STATE_LABELS.awaitBossReply, tone: "amber" };
  }
  if (fsmState === "failed") {
    return { text: STATE_LABELS.failed, tone: "red" };
  }
  const resting = !fsmState || STATE_LABELS[fsmState] === "idle";
  if (resting && options?.turnActive) {
    return {
      text: options.playersRunning ? "working" : "deciding",
      tone: "emerald",
    };
  }
  if (!fsmState) return { text: "idle", tone: "neutral" };
  return {
    text: STATE_LABELS[fsmState] ?? humanizeId(fsmState),
    tone: options?.turnActive ? "emerald" : "neutral",
  };
}

/** The runtime failures a person meets often enough to deserve a
 * plain phrase (DR-010 §2, run-view-2); the raw text rides the line's
 * tooltip. Order matters: the first match wins. */
const KNOWN_FAILURES: { test: RegExp; text: (match: RegExpExecArray) => string }[] = [
  {
    test: /repository-effect reconciliation failed: (.+)/i,
    text: (m) => `Couldn't reconcile the repository: ${m[1]}`,
  },
  {
    test: /oauth session expired|not logged in|unauthori[sz]ed|\b401\b|authentication/i,
    text: () => "The agent's sign-in has expired — sign in again",
  },
  {
    test: /rate limit|\b429\b/i,
    text: () => "The provider rate-limited the call — it can be retried",
  },
  {
    test: /timed out|timeout/i,
    text: () => "The call timed out",
  },
  {
    test: /exited (?:with code|on signal) (\S+)/i,
    text: (m) => `The agent process exited unexpectedly (${m[1]})`,
  },
  {
    test: /ENOENT|is not installed|could not resolve '([^']+)'/i,
    text: (m) =>
      m[1]
        ? `${m[1]} is not installed`
        : "A command the run needs is not installed",
  },
  {
    test: /Unknown adapter "([^"]+)"/,
    text: (m) => `No adapter named "${m[1]}" — check the config`,
  },
  {
    test: /Unknown player:? "?([^"\s]+)"?/,
    text: (m) => `No player named "${m[1]}" — check the config`,
  },
];

/** A failure message as a person reads it: a leading "Error:" gone,
 * doubled periods healed, a known runtime message mapped to its plain
 * phrase — and the raw text kept when the words changed, so a tooltip
 * can still show what the runtime said. */
export function plainFailure(raw: string): { text: string; raw?: string } {
  const message = String(raw);
  let text = message
    .replace(/^\s*(?:error|uncaught|unhandled)\s*:\s*/i, "")
    .replace(/^\s*error\s*:\s*/i, "")
    .replace(/\.{2,}(?!\.)/g, ".")
    .replace(/\s+\./g, ".")
    .trim();
  const captain = /^The Captain's turn failed:\s*(.*)$/s.exec(text);
  const cause = captain ? captain[1].trim() : text;
  const known = KNOWN_FAILURES.find((entry) => entry.test.test(cause));
  const plainCause = known
    ? known.text(known.test.exec(cause) as RegExpExecArray)
    : cause;
  text = captain ? `The Captain's turn failed — ${plainCause}` : plainCause;
  if (!text) text = message.trim() || "failed";
  return text === message ? { text } : { text, raw: message };
}

/** Notification event labels (SET): wire ids stay in tooltips. */
export const NOTIFICATION_LABELS: Record<string, string> = {
  player_finished: "A player finishes its step",
  turn_finished: "A turn finishes",
  turn_aborted: "A turn is aborted",
};

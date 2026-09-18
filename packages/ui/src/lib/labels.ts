// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Status speaks human (DR-010 §2): internal identifiers never serve
// as primary copy. Known states map to plain phrases; unknown
// playbook-authored ids are humanized; the raw id belongs in a
// tooltip, not in the label.
//
// Every phrase here is a message of the catalog, held as a thunk and
// read at the moment it is shown (localization-4): a table of strings
// evaluated as this module loads would freeze the language it was
// imported in. The regexes are the other way round — they match the
// runtime's own English messages, which are input, not copy.

import { i18n } from "../i18n.js";

export type StatusTone = "amber" | "red" | "emerald" | "neutral";

/** The resting phrase, shared by every state that means it, so "is
 * this state a resting one" stays one identity comparison. */
const idle = (): string =>
  i18n._({ id: "idle", comment: "session status: nothing is running" });

const STATE_LABELS: Record<string, () => string> = {
  awaitBossReply: () =>
    i18n._({
      id: "waiting for your reply",
      comment: "session status: a player asked the Boss a question",
    }),
  failed: () =>
    i18n._({
      id: "needs attention",
      comment: "session status: the run failed and waits for the Boss",
    }),
  idle,
  ready: () =>
    i18n._({ id: "ready", comment: "session status: ready to be told what to do" }),
  // The captain shell's own control loop rests here between runs;
  // "hub" is its wire id, not a thing to tell a person about.
  hub: idle,
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

/** Human label + tone for a session state, with the raw state id the
 * label speaks for — the tooltip's business, never the copy. Tone
 * keys off signals the reducer derives (a pending question, a run
 * parked in its failure state), not open-ended playbook-authored
 * state names. The reported state belongs to whichever machine
 * reported it last — the Captain shell's controller writes the same
 * topic as the leaf — so at rest the leaf's own frames answer for the
 * leaf (DR-061, run-view-59). While a turn is active and the state
 * names no leaf — no state yet, or the shell's own rest states — the
 * label says what the turn is doing: "working" while a player runs,
 * "deciding" while the Captain has the floor; a live turn never
 * reads "idle" (run-view-59). */
export function stateLabel(
  fsmState: string | undefined,
  options?: {
    pendingQuestion?: boolean;
    /** The state id of the run standing parked in its recoverable
     * failure state, where one stands (run-view-59). */
    parkedFailure?: string;
    turnActive?: boolean;
    playersRunning?: boolean;
  },
): { text: string; tone: StatusTone; state?: string } {
  if (options?.pendingQuestion || fsmState === "awaitBossReply") {
    return {
      text: STATE_LABELS.awaitBossReply(),
      tone: "amber",
      state: fsmState,
    };
  }
  // A live turn keeps its own voice, so the parked leaf speaks only
  // once the turn settles — where the reported state is the shell's.
  const parked = options?.turnActive ? undefined : options?.parkedFailure;
  if (fsmState === "failed" || parked) {
    return {
      text: STATE_LABELS.failed(),
      tone: "red",
      state: parked ?? fsmState,
    };
  }
  const resting = !fsmState || STATE_LABELS[fsmState] === idle;
  if (resting && options?.turnActive) {
    return {
      text: options.playersRunning
        ? i18n._({
            id: "working",
            comment: "session status: a player is running its step",
          })
        : i18n._({
            id: "deciding",
            comment: "session status: the Captain has the floor",
          }),
      tone: "emerald",
      state: fsmState,
    };
  }
  if (!fsmState) return { text: idle(), tone: "neutral" };
  return {
    text: STATE_LABELS[fsmState]?.() ?? humanizeId(fsmState),
    tone: options?.turnActive ? "emerald" : "neutral",
    state: fsmState,
  };
}

/** A remedy a caller may speak to in its own words — named, never
 * matched on its phrase, which changes with the language. */
export type RemedyKind = "sign-in";

/** The runtime failures a person meets often enough to deserve a
 * plain phrase (DR-010 §2, run-view-2); the raw text rides the line's
 * tooltip. `step` is what the Boss does about it outside Spex, where
 * anything can be done there (run-view-147, DR-075) — the failure
 * catalogue reads it from here rather than testing these patterns
 * again. Order matters: the first match wins. Each pattern reads the
 * runtime's own English message, which is data; only the phrases it
 * maps to are the interface's words. */
const KNOWN_FAILURES: {
  test: RegExp;
  text: (match: RegExpExecArray) => string;
  step?: (match: RegExpExecArray) => string;
  stepKind?: RemedyKind;
}[] = [
  {
    test: /repository-effect reconciliation failed: (.+)/i,
    text: (m) =>
      i18n._("Couldn't reconcile the repository: {detail}", { detail: m[1] }),
  },
  {
    test: /oauth session expired|not logged in|unauthori[sz]ed|\b401\b|authentication/i,
    text: () =>
      i18n._(
        "The agent's sign-in has expired — in a terminal, sign in again with that agent's CLI",
      ),
    step: () => i18n._("Sign in again with that agent's CLI"),
    stepKind: "sign-in",
  },
  {
    test: /rate limit|\b429\b/i,
    text: () => i18n._("The provider rate-limited the call — it can be retried"),
  },
  {
    test: /timed out|timeout/i,
    text: () => i18n._("The call timed out"),
  },
  {
    test: /exited (?:with code|on signal) (\S+)/i,
    text: (m) =>
      i18n._("The agent process exited unexpectedly ({code})", { code: m[1] }),
  },
  {
    test: /ENOENT|is not installed|could not resolve '([^']+)'/i,
    text: (m) =>
      m[1]
        ? i18n._("{command} is not installed", { command: m[1] })
        : i18n._("A command the run needs is not installed"),
    step: (m) =>
      m[1]
        ? i18n._("Install {command}", { command: m[1] })
        : i18n._("Install the missing command"),
  },
  {
    test: /Unknown adapter "([^"]+)"/,
    text: (m) =>
      i18n._('No adapter named "{adapter}" — check the config', {
        adapter: m[1],
      }),
    step: () => i18n._("Fix the adapter in Settings"),
  },
  {
    test: /Unknown player:? "?([^"\s]+)"?/,
    text: (m) =>
      i18n._('No player named "{player}" — check the config', { player: m[1] }),
    step: () => i18n._("Fix the player in Settings"),
  },
];

/** What the Boss does outside Spex about a known runtime message, or
 * nothing where nothing outside Spex answers it (run-view-147,
 * DR-075). Read from the one table above, so a phrase and its step
 * can never drift apart; `kind` names the remedy for a caller that
 * phrases it differently. */
export function failureRemedy(
  raw: string,
): { text: string; kind?: RemedyKind } | undefined {
  const message = String(raw);
  const known = KNOWN_FAILURES.find((entry) => entry.test.test(message));
  if (!known?.step) return undefined;
  return {
    text: known.step(known.test.exec(message) as RegExpExecArray),
    ...(known.stepKind ? { kind: known.stepKind } : {}),
  };
}

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
  text = captain
    ? i18n._("The Captain's turn failed — {cause}", { cause: plainCause })
    : plainCause;
  if (!text) {
    text =
      message.trim() ||
      i18n._({ id: "failed", comment: "last resort: a failure with no words" });
  }
  return text === message ? { text } : { text, raw: message };
}

/** Notification event labels (SET): wire ids stay in tooltips. Thunks,
 * read at the moment they are shown (localization-4). */
export const NOTIFICATION_LABELS: Record<string, () => string> = {
  player_finished: () => i18n._("A player finishes its step"),
  turn_finished: () => i18n._("A turn finishes"),
  turn_aborted: () => i18n._("A turn is aborted"),
};

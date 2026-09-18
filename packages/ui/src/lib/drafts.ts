// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Pure helpers for playbook drafts (DR-058): the chip's word and
// tooltip per state (playbook-library-50), the id rule the New
// playbook field checks (playbook-library-51), the reason a control
// waits (playbook-library-56/57), and the Register tab's derived
// defaults (playbook-library-61). No DOM, so each is testable alone.

import type {
  AgentBlockInput,
  AgentSummary,
  DraftInfo,
} from "@sublang/spex-core/protocol";

import { phaseLabel } from "./compile-log.js";
import { ageSpan, relativeAge } from "./time.js";
import { i18n } from "../i18n.js";
import type { StatusTone } from "./labels.js";

/** A draft id names the file, the directory, and the /command. */
export const DRAFT_ID_RULE = /^[a-z][a-z0-9_-]*$/u;

/** The id field's caption (playbook-library-51). A function, never a
 * constant: a text read at module load would freeze the language the
 * module was imported in (localization-4). */
export function draftIdCaption(): string {
  return i18n._(
    "Lowercase; it names the file and the /command — the command can change at registration",
  );
}

/** The rule, as the refusal names it. */
export function draftIdRuleText(): string {
  return i18n._("Lowercase letters, digits, - or _, starting with a letter");
}

/** The chip's word (playbook-library-50): at most 14 characters, the
 * details in its title (DR-041 §9). */
export function draftChipWord(draft: DraftInfo): string {
  if (draft.sourceMissing) {
    return i18n._({
      id: "Source missing",
      comment: "draft state chip, at most 14 characters: the draft's library directory is gone",
    });
  }
  switch (draft.state) {
    case "no-source":
      return i18n._({
        id: "No source",
        comment: "draft state chip, at most 14 characters: nothing written to the draft's source file yet",
      });
    case "draft":
      return i18n._({
        id: "Draft",
        comment: "draft state chip, at most 14 characters: a source stands, never compiled",
      });
    case "compiling":
      return i18n._({
        id: "Compiling",
        comment: "draft state chip, at most 14 characters: a compile is running",
      });
    case "failed":
      return i18n._({
        id: "Failed",
        comment: "draft state chip, at most 14 characters: the last compile failed",
      });
    case "interrupted":
      return i18n._({
        id: "Interrupted",
        comment: "draft state chip, at most 14 characters: Spex closed while the draft compiled",
      });
    case "compiled":
      return i18n._({
        id: "Compiled",
        comment: "draft state chip, at most 14 characters: the last compile succeeded",
      });
    case "changed":
      return i18n._({
        id: "Changed",
        comment: "draft state chip, at most 14 characters: the source changed after the last compile",
      });
  }
}

/** The chip's tone: emerald for the live compile and a compiled draft,
 * red for a failure or a missing source, amber for what needs a hand,
 * neutral otherwise (DR-013: brand hue stays with interaction). */
export function draftChipTone(draft: DraftInfo): StatusTone {
  if (draft.sourceMissing) return "red";
  switch (draft.state) {
    case "compiling":
    case "compiled":
      return "emerald";
    case "failed":
      return "red";
    case "interrupted":
    case "changed":
      return "amber";
    default:
      return "neutral";
  }
}

/** The chip's tooltip: the failed phase and the compile's age, never
 * in the chip itself (playbook-library-50). */
export function draftChipTitle(draft: DraftInfo, now: number): string | undefined {
  if (draft.sourceMissing) {
    return i18n._("The draft's library directory is gone; only Delete remains");
  }
  const compile = draft.compile;
  if (!compile) return undefined;
  const age = relativeAge(compile.at, now);
  switch (compile.outcome) {
    case "failed": {
      // The compiler's own phase id rides along where the pipeline
      // table names that phase; where it does not, the id stands alone.
      const phase = compile.phase;
      if (!phase) return i18n._("Failed at an unknown phase, {age}", { age });
      return phaseLabel(phase) === phase
        ? i18n._("Failed at {phase}, {age}", { phase, age })
        : i18n._("Failed at {phase} ({id}), {age}", {
            phase: phaseLabel(phase),
            id: phase,
            age,
          });
    }
    case "running":
      // "since" already says it is an age, so the span comes without
      // "ago" rather than having the word cut off a translated text.
      return i18n._("Compiling since {age}", { age: ageSpan(compile.at, now) });
    case "interrupted":
      return i18n._("Interrupted {age} — Spex closed while it compiled", { age });
    case "canceled":
      return i18n._("Canceled {age}", { age });
    case "ok":
      return draft.state === "changed"
        ? i18n._("Compiled {age}; the source changed since", { age })
        : i18n._("Compiled {age}", { age });
  }
}

/** Why a control that writes the source or starts a compile must wait,
 * in the words its tooltip or caption uses (playbook-library-56/57). */
export function busyReason(draft: DraftInfo): string | undefined {
  if (draft.activity === "turn") {
    return i18n._({
      id: "Waits for the reply",
      comment: "why a control is held: the draft's agent turn is running",
    });
  }
  if (draft.activity === "compiling") {
    return i18n._({
      id: "Compiling",
      comment: "why a control is held: the draft's compile is running",
    });
  }
  return undefined;
}

/** The agent block a new lane minted from a draft carries: the draft's
 * effective agent, less the fields a lane does not take from it. */
export function agentBlockOf(agent: AgentSummary): AgentBlockInput {
  const block: AgentBlockInput = { adapter: agent.adapter };
  if (agent.model) block.model = agent.model;
  if (agent.effort) block.effort = agent.effort;
  block.permissions = agent.permissions?.mode
    ? { mode: agent.permissions.mode }
    : { mode: "auto" };
  return block;
}

/** The lane a derived role would mint: `dev.<role>` (DR-032). */
export function newPlayerId(role: string): string {
  return `dev.${role.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-")}`;
}

/** The source's first prose paragraph, on one line — the intent's
 * derived default (playbook-library-61). Headings, the `Roles:` list,
 * list items, blockquotes, and fenced code are not prose. */
export function firstProseParagraph(markdown: string): string {
  const blocks = markdown.replace(/\r\n/gu, "\n").split(/\n\s*\n/u);
  let fenced = false;
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.some((line) => line.startsWith("```"))) {
      // A fence toggles on each marker; a block with an odd count opens
      // or closes one, and everything inside is code.
      const markers = lines.filter((line) => line.startsWith("```")).length;
      if (markers % 2 === 1) fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const first = lines[0];
    if (
      /^#/u.test(first) ||
      /^roles?\s*:/iu.test(first) ||
      /^[-*+]\s/u.test(first) ||
      /^\d+[.)]\s/u.test(first) ||
      first.startsWith(">") ||
      first.startsWith("|")
    ) {
      continue;
    }
    return lines.join(" ");
  }
  return "";
}

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
import { relativeAge } from "./time.js";
import type { StatusTone } from "./labels.js";

/** A draft id names the file, the directory, and the /command. */
export const DRAFT_ID_RULE = /^[a-z][a-z0-9_-]*$/u;

/** The id field's caption (playbook-library-51). */
export const DRAFT_ID_CAPTION =
  "Lowercase; it names the file and the /command — the command can change at registration";

/** The rule, as the refusal names it. */
export const DRAFT_ID_RULE_TEXT =
  "Lowercase letters, digits, - or _, starting with a letter";

/** The chip's word (playbook-library-50): at most 14 characters, the
 * details in its title (DR-041 §9). */
export function draftChipWord(draft: DraftInfo): string {
  if (draft.sourceMissing) return "Source missing";
  switch (draft.state) {
    case "no-source":
      return "No source";
    case "draft":
      return "Draft";
    case "compiling":
      return "Compiling";
    case "failed":
      return "Failed";
    case "interrupted":
      return "Interrupted";
    case "compiled":
      return "Compiled";
    case "changed":
      return "Changed";
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
  if (draft.sourceMissing) return "The draft's library directory is gone; only Delete remains";
  const compile = draft.compile;
  if (!compile) return undefined;
  const age = relativeAge(compile.at, now);
  switch (compile.outcome) {
    case "failed": {
      const phase = compile.phase;
      const where = phase
        ? phaseLabel(phase) === phase
          ? phase
          : `${phaseLabel(phase)} (${phase})`
        : "an unknown phase";
      return `Failed at ${where}, ${age}`;
    }
    case "running":
      return `Compiling since ${age.replace(" ago", "")}`;
    case "interrupted":
      return `Interrupted ${age} — Spex closed while it compiled`;
    case "canceled":
      return `Canceled ${age}`;
    case "ok":
      return draft.state === "changed"
        ? `Compiled ${age}; the source changed since`
        : `Compiled ${age}`;
  }
}

/** Why a control that writes the source or starts a compile must wait,
 * in the words its tooltip or caption uses (playbook-library-56/57). */
export function busyReason(draft: DraftInfo): string | undefined {
  if (draft.activity === "turn") return "Waits for the reply";
  if (draft.activity === "compiling") return "Compiling";
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

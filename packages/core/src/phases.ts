// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The compile pipeline's phases with their human names (DR-010 §2,
// playbook-library-57): slc's ids — normalize, text2gears, optimize,
// gears2fsm, link — and Spex's own packaging step. The core speaks
// the human word wherever the Boss reads it (the thread's ◇ lines);
// the id stays in what the agent reads and in the tooltips. Shared
// with the UI over the protocol entry so both name a phase alike.

/** The pipeline in order, with its human names. */
export const PIPELINE_PHASES: readonly { id: string; label: string }[] = [
  { id: "normalize", label: "Normalize" },
  { id: "text2gears", label: "Spec items" },
  { id: "optimize", label: "Optimize" },
  { id: "gears2fsm", label: "Machine" },
  { id: "link", label: "Link" },
  { id: "spex", label: "Package" },
];

/** The human name of a compiler phase id; an unknown id reads as
 * itself, so a new phase is never renamed into nonsense. */
export function phaseLabel(id: string): string {
  if (id === "packaging") return "Package";
  return PIPELINE_PHASES.find((phase) => phase.id === id)?.label ?? id;
}

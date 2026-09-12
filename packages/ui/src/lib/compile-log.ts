// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The compile band's fold (playbook-library-57, DR-058): slc reports
// its pipeline as lines — `→ <phase>` opens one, `✓ <phase> … (<elapsed>)`
// finishes it, `✗ <phase> failed … (<elapsed>)` fails it, and
// `… <phase> still running (<elapsed>)` is the heartbeat it emits every
// thirty seconds of silence — and Spex adds its own `running:`,
// `packaging:`, `introspected states:`, `derived roles:`, and
// `compile complete` lines around them. The band draws phases, not a
// log, so the lines fold here into one row of human-named phases with
// the compiler's ids kept for the tooltips (DR-010 §2). A phase the
// compiler names that the row lacks is appended, so a future slc
// phase still shows rather than vanishing.

export type PhaseStatus = "waiting" | "running" | "done" | "failed";

export interface PhaseView {
  /** The compiler's id: `normalize`, `text2gears`, …, or `spex` for
   * Spex's own packaging step. */
  id: string;
  /** The human name the row shows. */
  label: string;
  status: PhaseStatus;
  /** The compiler's own elapsed text for a finished or failed phase
   * (`2s`, `6m40s`), or the heartbeat's last report while running. */
  elapsed?: string;
  /** When the phase's `→` line arrived, for a live elapsed clock. */
  startedAt?: number;
  /** The lines the compiler printed under this phase: a failed phase's
   * output, or the packaging step's own reports. */
  output: string[];
}

export interface CompileLogFold {
  phases: PhaseView[];
  /** When the compiler last said anything, heartbeat included. */
  lastOutputAt?: number;
  /** The `◇ compile canceled` line landed. */
  canceled: boolean;
  /** Spex's `compile complete` line landed. */
  complete: boolean;
  /** The failed phase, when a `✗` line landed. */
  failed?: PhaseView;
  /** The derived roles Spex reported. */
  roles?: string[];
  /** Lines that belong to no phase: `◇` status and `running:`. */
  status: string[];
}

/** The pipeline in order, with its human names (playbook-library-6). */
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

const OPEN = /^→ (\S+)/u;
const DONE = /^✓ (\S+)(?: .*)?\((\S+)\)\s*$/u;
const FAILED = /^✗ (\S+) failed(?: .*)?\((\S+)\)\s*$/u;
const HEARTBEAT = /^… (\S+) still running \((\S+)\)\s*$/u;
const ROLES = /^derived roles: (.*)$/u;
/** Spex's own lines around the compiler: the last four are the
 * packaging step's reports. */
const PACKAGE_LINE = /^(packaging|introspected states):/u;

/** Fold the progress lines of one compile into its phases. `at` holds
 * each line's arrival time when the caller kept it, so the running
 * phase's elapsed and the "last output" age can tick. */
export function foldCompileLog(
  lines: readonly string[],
  at?: readonly number[],
): CompileLogFold {
  const phases: PhaseView[] = PIPELINE_PHASES.map((phase) => ({
    ...phase,
    status: "waiting",
    output: [],
  }));
  const byId = new Map(phases.map((phase) => [phase.id, phase]));
  const phase = (id: string): PhaseView => {
    const existing = byId.get(id);
    if (existing) return existing;
    // A phase the row does not know is appended before Spex's own
    // packaging step, so the compiler's order is kept and Package
    // stays last.
    const created: PhaseView = { id, label: id, status: "waiting", output: [] };
    const packageIndex = phases.findIndex((entry) => entry.id === "spex");
    phases.splice(packageIndex === -1 ? phases.length : packageIndex, 0, created);
    byId.set(id, created);
    return created;
  };
  const fold: CompileLogFold = {
    phases,
    canceled: false,
    complete: false,
    status: [],
  };
  // The phase the next unmarked line belongs to: the one just opened,
  // the one that just failed, or Spex's packaging step.
  let current: PhaseView | undefined;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    const when = at?.[index];
    if (when !== undefined) fold.lastOutputAt = when;
    if (!line.trim()) return;
    let match: RegExpExecArray | null;
    if ((match = OPEN.exec(line))) {
      const target = phase(match[1]);
      target.status = "running";
      if (when !== undefined) target.startedAt = when;
      current = target;
      return;
    }
    if ((match = DONE.exec(line))) {
      const target = phase(match[1]);
      target.status = "done";
      target.elapsed = match[2];
      current = undefined;
      return;
    }
    if ((match = FAILED.exec(line))) {
      const target = phase(match[1]);
      target.status = "failed";
      target.elapsed = match[2];
      fold.failed = target;
      current = target;
      return;
    }
    if ((match = HEARTBEAT.exec(line))) {
      const target = phase(match[1]);
      if (target.status === "waiting") target.status = "running";
      target.elapsed = match[2];
      return;
    }
    if (line.startsWith("◇")) {
      fold.status.push(line);
      if (/canceled/u.test(line)) fold.canceled = true;
      return;
    }
    if (line.startsWith("running:")) {
      fold.status.push(line);
      return;
    }
    if ((match = ROLES.exec(line))) {
      fold.roles = match[1]
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean);
      const target = phase("spex");
      if (target.status !== "failed") target.status = "running";
      target.output.push(line);
      current = target;
      return;
    }
    if (PACKAGE_LINE.test(line)) {
      const target = phase("spex");
      if (target.status === "waiting") {
        target.status = "running";
        if (when !== undefined) target.startedAt = when;
      }
      target.output.push(line);
      current = target;
      return;
    }
    if (line === "compile complete") {
      const target = phase("spex");
      target.status = "done";
      fold.complete = true;
      current = undefined;
      return;
    }
    // Anything else is the compiler talking under its current phase —
    // a failed phase's captured output above all.
    if (current) current.output.push(line);
    else fold.status.push(line);
  });
  return fold;
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-16, guards-26, guards-27), DR-251: every
 * word `spex verify` and `spex approve` print. Reports go to standard
 * output and a refusal's cause to standard error. Nothing else in the
 * guards code prints.
 */

import { misuse } from "../commands/run.js";
import type { ApprovalState } from "./approval.js";
import type { Guard } from "./files.js";
import type { WalkStep } from "./reading.js";
import { showFields, showValue, type Fields } from "./types.js";
import { seconds, type Checked, type Finding, type GuardReport, type Place } from "./verify.js";

/** The widest a wrapped line may be. */
const WIDTH = 100;

/** Print lines on standard output. */
function out(lines: readonly string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** Print a refusal's cause on standard error. */
export function refuse(command: string, cause: string): void {
  process.stderr.write(`spex ${command}: ${cause}\n`);
}

/** Print a refusal of how a command was called: the cause and the
 * command's usage line. */
export function refuseUse(command: string, cause: string): void {
  refuse(command, misuse(command, cause).message);
}

/** `text` in lines no wider than the limit, each after `indent`. */
function wrap(text: string, indent: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((part) => part !== "")) {
    if (line !== "" && indent.length + line.length + 1 + word.length > WIDTH) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(indent + line);
  return lines;
}

// ---------------------------------------------------------------
// Steps
// ---------------------------------------------------------------

/** One step: its number, its event, each param, then `->` and each
 * effect field. */
function stepLine(number: number, event: string, params: Fields, effect: Fields | null): string {
  const said = [`${number}.`, event];
  if (Object.keys(params).length > 0) said.push(showFields(params));
  if (effect !== null && Object.keys(effect).length > 0) said.push("->", showFields(effect));
  return said.join(" ");
}

function yesNo(answers: readonly boolean[], names: readonly string[]): string {
  return answers.map((answer, index) => `${names[index]}: ${answer ? "yes" : "no"}`).join(", ");
}

/** The lines of a sequence as it ran: each caused step, and the last
 * one whether caused or not, with `note` under it. */
function sequenceLines(steps: readonly WalkStep[], indent: string, note: (last: WalkStep) => string[]): string[] {
  const lines: string[] = [];
  let number = 0;
  steps.forEach((step, index) => {
    const last = index === steps.length - 1;
    if (!step.caused && !last) return;
    number += 1;
    lines.push(indent + stepLine(number, step.call.event, step.call.params, step.effect) + (step.caused ? "" : " (not caused)"));
    if (last) for (const line of note(step)) lines.push(`${indent}   ${line}`);
  });
  return lines;
}

/** What each reading found at a step the readings differ on. */
function findingsOf(step: WalkStep, readings: readonly string[]): string[] {
  const lines: string[] = [];
  if (step.legal === "split") lines.push(`legal — ${yesNo(step.readings.map((found) => found.legal), readings)}`);
  if (step.applies === "split") {
    lines.push(`applies — ${yesNo(step.readings.map((found) => found.applies), readings)}`);
  }
  if (step.forbidden === "split") {
    lines.push(`forbidden — ${yesNo(step.readings.map((found) => found.forbidden), readings)}`);
  }
  return lines;
}

function placeOf(place: Place): string {
  return "example" in place ? `in example ${place.example}` : `at sequence ${place.sequence}`;
}

// ---------------------------------------------------------------
// One guard's block (guards-26)
// ---------------------------------------------------------------

function approvalLines(name: string, approval: Checked["approval"]): string[] {
  if (approval.approved) return ["  Approval: approved"];
  const said = approval.unreadable ?? (approval.recorded ? changes(approval).join("; ") : "no approval record");
  return [`  Approval: not approved — ${said}`, `    run spex approve ${name} after reviewing`];
}

/** `changed: …`, `added: …` and `gone: …`, each where it has a label. */
function changes(approval: ApprovalState): string[] {
  const said: string[] = [];
  if (approval.changed.length > 0) said.push(`changed: ${approval.changed.join(", ")}`);
  if (approval.added.length > 0) said.push(`added: ${approval.added.join(", ")}`);
  if (approval.gone.length > 0) said.push(`gone: ${approval.gone.join(", ")}`);
  return said;
}

function examplesLines(examples: Checked["examples"]): string[] {
  const counted = `${examples.count} ${examples.count === 1 ? "example" : "examples"}, ${examples.readings} ${
    examples.readings === 1 ? "reading" : "readings"
  }`;
  if (examples.failures.length === 0) return [`  Examples against the readings: ${counted}, all as stated`];
  return [
    `  Examples against the readings: ${counted}, ${examples.failures.length} not as stated`,
    ...examples.failures.map((failure) =>
      failure.example === null ? `    ${failure.found}` : `    ${failure.example}, reading ${failure.reading}: ${failure.found}`,
    ),
  ];
}

function findingLines(finding: Finding, report: Checked): string[] {
  const readings = report.legal.map((entry) => entry.reading);
  const indent = "    ";
  switch (finding.kind) {
    case "violation": {
      const found =
        finding.shrinks === null
          ? `found ${placeOf(finding.place)}`
          : `found ${placeOf(finding.place)} with seed ${report.bounds.seed}, shrunk ${finding.shrinks} ${
              finding.shrinks === 1 ? "time" : "times"
            }`;
      return [indent + found, ...sequenceLines(finding.steps, indent, () => ["forbidden by every reading"])];
    }
    case "effect":
      return [
        `${indent}example ${finding.example}, step ${finding.step}, field ${finding.field}: stated ${showValue(
          finding.stated,
        )}, observed ${showValue(finding.observed)}`,
      ];
    case "not shown":
      return [
        `${indent}example ${finding.example} shows the protected behavior against the readings and not on the code`,
      ];
    case "examples":
      return [`${indent}the examples do not agree with the readings`];
    case "binding":
      return [`${indent}a failing binding: ${finding.cause}`];
    case "reading":
      return [`${indent}a reading error: ${finding.cause}`];
    case "outside":
      return [`${indent}a project file loaded from outside the copy: ${finding.file}`];
    case "timeout":
      return [`${indent}a timeout: not done after ${seconds(finding.seconds)}`];
    case "undecided event":
      return [
        `${indent}an undecided event ${placeOf(finding.place)}: the readings differ on whether it is legal`,
        ...sequenceLines(finding.steps, indent, (last) => findingsOf(last, readings)),
      ];
    case "undecided step": {
      const last = finding.steps[finding.steps.length - 1];
      const on: string[] = [];
      if (last?.legal === "split") on.push("the event is legal");
      if (last?.applies === "split") on.push("the assertion applies");
      if (last?.forbidden === "split") on.push("the effect is forbidden");
      return [
        `${indent}an undecided step ${placeOf(finding.place)}: the readings differ on whether ${on.join(" and whether ")}`,
        ...sequenceLines(finding.steps, indent, (step) => findingsOf(step, readings)),
      ];
    }
    case "never applied":
      return [`${indent}no sequence in which the assertion applied`];
  }
}

function codeLines(report: Checked): string[] {
  const lines = [`  On the code: ${report.result}`];
  for (const finding of report.findings) lines.push(...findingLines(finding, report));
  if (report.counts !== null) {
    lines.push(`    ${report.counts.sequences} sequences, ${report.counts.applied} in which the assertion applied`);
    for (const [event, count] of Object.entries(report.counts.events)) {
      lines.push(`    ${event}: caused ${count.caused}, skipped ${count.skipped}`);
    }
  }
  const { versions, bounds } = report;
  lines.push(`    fast-check ${versions.fastCheck}, Spex ${versions.spex}, Node ${versions.node}`);
  lines.push(
    report.digest === null
      ? `    ${report.revision}, no files copied`
      : `    ${report.revision}, copied files sha256 ${report.digest.slice(0, 12)}`,
  );
  lines.push(
    `    bounds: ${bounds.sequences} sequences, at most ${bounds.events} events, seed ${bounds.seed}, ${bounds.seconds} seconds`,
  );
  for (const entry of report.legal) {
    const said = entry.events.map((event) => `${event.event}: ${event.when}`).join("; ");
    lines.push(`    legal when — ${entry.reading}: ${said}`);
  }
  return lines;
}

function faultLines(report: Checked): string[] {
  const lines: string[] = [];
  for (const fault of report.faults) {
    if (fault.caught === null) {
      lines.push(`  Kept fault ${fault.name}: not caught — ${fault.reason}`);
      continue;
    }
    lines.push(`  Kept fault ${fault.name}: caught at sequence ${fault.caught.sequence}`);
    lines.push(...sequenceLines(fault.caught.steps, "    ", () => ["forbidden by every reading"]));
  }
  return lines;
}

/** One guard's block. */
function blockLines(report: GuardReport): string[] {
  if ("cannot" in report) return [report.name, `  Cannot be checked — ${report.cannot}`];
  return [
    `${report.name} — protects ${report.behavior}`,
    ...wrap(report.statement, "  "),
    ...approvalLines(report.name, report.approval),
    ...examplesLines(report.examples),
    ...codeLines(report),
    ...faultLines(report),
    report.reasons.length === 0 ? "  Passes" : `  Does not pass — ${report.reasons.join("; ")}`,
  ];
}

// ---------------------------------------------------------------
// `spex verify`
// ---------------------------------------------------------------

/** There is nothing to check. */
export function sayNoGuards(): void {
  out(["No guards under guards/."]);
}

/** The report's heading. */
export function sayHeading(): void {
  out(["Protect critical behavior on every change"]);
}

/** One guard's block, after a blank line. */
export function sayGuard(report: GuardReport): void {
  out(["", ...blockLines(report)]);
}

/** How many guards pass, after a blank line. */
export function sayCount(passing: number, checked: number): void {
  out(["", `${passing} of ${checked} guards pass.`]);
}

// ---------------------------------------------------------------
// `spex approve` (guards-16)
// ---------------------------------------------------------------

/** What `record` holds against the inputs: null for no record, a
 * text for one that could not be read. */
export type Since = ApprovalState | string | null;

/** Print what a person is approving, and that it is recorded. */
export function sayApproved(guard: Guard, since: Since, path: string): void {
  const lines = [`${guard.name} — protects ${guard.items.behavior.id}`, ...wrap(guard.items.assertion.statement, "  ")];
  guard.examples.forEach((example, index) => {
    lines.push("", `${example.item} — ${example.kind}`, ...wrap(guard.items.examples[index].statement, "  "));
    example.steps.forEach((step, at) => lines.push(`    ${stepLine(at + 1, step.event, step.params, step.effect)}`));
  });
  lines.push("");
  if (since === null) lines.push("First approval.");
  else if (typeof since === "string") lines.push(`The last record cannot be read — ${since}.`);
  else if (since.approved) lines.push("Nothing changed since the last approval.");
  else lines.push("Since the last approval:", ...changes(since).map((line) => `  ${line}`));
  lines.push(`Approved ${guard.name} — commit ${path}.`);
  out(lines);
}

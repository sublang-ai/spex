// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-16, guards-26, guards-27), DR-252: every
 * word `spex verify` and `spex approve` print. Reports go to standard
 * output and a refusal's cause to standard error. Nothing else in the
 * guards code prints.
 */

import { misuse } from "../commands/run.js";
import { fileLabel, itemLabel, type ApprovalState } from "./approval.js";
import { seconds, type Cannot, type Comparison, type Shown } from "./checks.js";
import type { Guard } from "./files.js";
import { TLC_PIN } from "./tlc.js";
import { showFields, showValue, type Call, type Fields } from "./types.js";
import type { Cause, Checked, Finding, GuardReport } from "./verify.js";

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

/** `<count> <word>`, the word in the singular after a count of one:
 * `1 state`, `2 states`. */
function counted(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}

/** An event with its params: `use user=ann`. */
function callWords(call: Call): string {
  return Object.keys(call.params).length === 0 ? call.event : `${call.event} ${showFields(call.params)}`;
}

/** One step: its number, its event, each param, then `->` and the
 * effect, where one is shown and has a field. */
function stepLine(number: number, call: Call, effect: string | null): string {
  return `${number}. ${callWords(call)}${effect === null || effect === "" ? "" : ` -> ${effect}`}`;
}

/** An effect on one line; `{}` for an effect with no field. */
function effectWords(effect: string): string {
  return effect === "" ? "{}" : effect;
}

/** The lines of a sequence, each step numbered from 1, with `note`
 * under the last one, three spaces deeper than the step. */
function sequenceLines(steps: readonly Shown[], indent: string, note: readonly string[] = []): string[] {
  const lines = steps.map((step, index) => indent + stepLine(index + 1, step.call, step.effect));
  for (const line of note) lines.push(`${indent}   ${line}`);
  return lines;
}

/** A finding's sequence: the steps before it, its own step, then the
 * model's effect, the code's and what the rule says of it. */
function findingLines(found: Finding, indent: string, forbidden: boolean): string[] {
  return sequenceLines([...found.steps, { call: found.last, effect: null }], indent, [
    `the model gives ${effectWords(found.model)}`,
    `the code gave   ${effectWords(found.gave)}`,
    forbidden ? "forbidden by the rule" : "not forbidden by the rule",
  ]);
}

/** Where a finding was met: the number of its step, in the sequence
 * shown under it or in a permitted case. */
function metWords(found: Finding): string {
  const step = `at step ${found.steps.length + 1} of`;
  return found.case === null ? `${step} this sequence` : `${step} the ${caseWords("permitted", found.case)}`;
}

// ---------------------------------------------------------------
// One guard's block (guards-26)
// ---------------------------------------------------------------

function approvalLines(name: string, approval: Checked["approval"]): string[] {
  if (approval.approved) return ["  Approval: approved"];
  const said = approval.unreadable ?? (approval.recorded ? changes(approval).join("; ") : "no approval record");
  return [`  Approval: not approved — ${said}`, `    review the guard's items and files, then run spex approve ${name}`];
}

/** `changed: …`, `added: …` and `gone: …`, each where it has a label. */
function changes(approval: ApprovalState): string[] {
  const said: string[] = [];
  if (approval.changed.length > 0) said.push(`changed: ${approval.changed.join(", ")}`);
  if (approval.added.length > 0) said.push(`added: ${approval.added.join(", ")}`);
  if (approval.gone.length > 0) said.push(`gone: ${approval.gone.join(", ")}`);
  return said;
}

/** A case by its kind and its label, the label in quotes so that its
 * plain words do not read on into the line: `permitted case "…"`. */
function caseWords(kind: string | null, label: string): string {
  return `${kind === null ? "" : `${kind} `}case "${label}"`;
}

/** The check of cases without the code (guards-20): that every
 * translation allows each permitted case and forbids each forbidden
 * case, or each failure with its case, its translation and its step. */
function casesLines(report: Checked): string[] {
  const { cases } = report;
  const opening = "  Cases, without the code:";
  const translations = cases.translations.length;
  const stopped = report.causes.find((cause) => cause.kind === "stopped" && cause.cause.endsWith("the cases"));
  if (stopped?.kind === "stopped") return [`${opening} not checked — ${stopped.cause}`];
  if (cases.failures.length === 0) {
    const who = translations === 1 ? "the translation" : `each of ${translations} translations`;
    return [
      `${opening} ${who} allows the ${counted(cases.permitted, "permitted case")} and forbids the ${counted(
        cases.forbidden,
        "forbidden case",
      )}`,
    ];
  }
  return [
    `${opening} ${counted(cases.count, "case")}, ${counted(translations, "translation")}, ${counted(
      cases.failures.length,
      "failure",
    )}`,
    ...cases.failures.map((failure) =>
      failure.case === null
        ? `    ${failure.found}`
        : `    ${caseWords(failure.kind, failure.case)}, translation ${failure.translation}: ${failure.found}`,
    ),
  ];
}

/** Under a distinguishing sequence: that it was not run on the code,
 * and, where it has steps before the one asked about, what their
 * effects are. Each answer to the question is a translation's own. */
function notRun(earlier: number): string {
  return earlier === 0
    ? "not run on the code"
    : "not run on the code: the effects of the earlier steps are the model's, on which the translations agree";
}

/** How the translations compare. A guard with one has nothing to
 * compare it with. A difference is the distinguishing sequence and
 * the one question its last step puts, with each translation's answer. */
function comparedLines(compared: Comparison | null, names: readonly string[]): string[] {
  const opening = `  Translations against each other: ${counted(names.length, "translation")}`;
  if (compared === null) return [`${opening}, nothing to compare it with`];
  if (compared.kind === "agreement") return [`${opening}, in agreement at every step TLC reached`];
  if (compared.kind === "not compared") return [`${opening}, not compared — ${compared.cause}`];
  const last = compared.steps.length + 1;
  const said = compared.answers.map((answer) => `${answer.translation}: ${answer.answer}`).join(", ");
  const question: string[] = {
    legal: [`is step ${last} legal? ${said}`],
    applies: [`does the rule apply at step ${last}? ${said}`],
    effect: [
      `what must step ${last} give?`,
      ...compared.answers.map((answer) => `  ${answer.translation}: ${effectWords(answer.answer)}`),
    ],
    // The model's effect at that step, on which the translations
    // agree, tells whether the effect asked about is the model's.
    forbidden: [
      `is this effect forbidden at step ${last}? ${effectWords(compared.effect ?? "")}`,
      `  ${said}`,
      compared.model === compared.effect ? "the model gives this effect" : `the model gives ${effectWords(compared.model ?? "")}`,
    ],
  }[compared.about];
  return [
    `${opening}, they differ at step ${last} of this sequence`,
    ...sequenceLines([...compared.steps, { call: compared.last, effect: null }], "    ", [
      ...question,
      notRun(compared.steps.length),
    ]),
  ];
}

/** What TLC found on the model (guards-38). */
function modelLines(report: Checked): string[] {
  const { model } = report;
  const tlc = `TLC ${report.versions.tlc ?? TLC_PIN.version}`;
  const opening = "  On the model:";
  if (model === null) return [];
  if (model.kind === "not checked") return [`${opening} not checked — ${model.cause}`];
  if (model.kind === "conflict") {
    return [
      `${opening} Conflict in the items — ${tlc} found it at step ${model.steps.length + 1} of this sequence, as translation ${report.judging} reads the items`,
      ...sequenceLines([...model.steps, { call: model.last, effect: null }], "    ", [
        `the model gives ${effectWords(model.effect)}`,
        "forbidden by the rule",
      ]),
    ];
  }
  const lines = [
    `${opening} ${tlc} checked every state the model of translation ${report.judging} reaches: ${counted(
      model.states,
      "state",
    )}, ${counted(model.steps, "step")}; the rule applied at ${counted(model.applied, "step")}`,
  ];
  if (model.collision !== null) {
    lines.push(`    TLC's own estimate of the chance it missed a state: ${model.collision}`);
  }
  return lines;
}

/** What the tests on the copy found (guards-21, guards-22). */
function codeLines(report: Checked): string[] {
  const { code } = report;
  const opening = "  On the code:";
  if (code === null) return [`${opening} not tested${report.notTested === null ? "" : ` — ${report.notTested}`}`];
  const tested =
    code.tested === code.steps ? counted(code.steps, "step") : `${code.tested} of ${counted(code.steps, "step")}`;
  const gave =
    code.same === code.tested
      ? code.tested === 1
        ? "it gave the model's effect"
        : "each gave the model's effect"
      : `${code.same} gave the model's effect, ${code.forbidden} an effect the rule forbids, ${code.differs} another effect, ${code.notReached} not reached${
          code.notJudged === 0 ? "" : `, ${code.notJudged} not judged`
        }`;
  const lines = [
    code.tested === 0
      ? `${opening} ${tested} tested`
      : `${opening} ${tested} tested, ${code.tested === 1 ? "" : "each "}after a shortest sequence from a fresh start: ${gave}`,
  ];
  // The cases' line only where a case was caused: a binding that
  // failed before any event shows nothing of how a case goes.
  if (code.casesCaused > 0) {
    lines.push(
      code.casesAsStated === code.cases
        ? `    the ${counted(code.cases, "permitted case")} went as ${code.cases === 1 ? "its" : "their"} steps state`
        : `    ${code.casesAsStated} of ${counted(code.cases, "permitted case")} went as ${code.cases === 1 ? "its" : "their"} steps state`,
    );
  }
  if (code.violation !== null) {
    lines.push(`    Violated on the code — found ${metWords(code.violation)}`, ...findingLines(code.violation, "      ", true));
  }
  if (code.difference !== null) {
    lines.push(
      `    Code differs from the model — found ${metWords(code.difference)}`,
      ...findingLines(code.difference, "      ", false),
    );
  }
  for (const found of code.failed) {
    lines.push(
      `    Case failed — ${caseWords(null, found.case)}, step ${found.step}, field ${found.field}: stated ${showValue(
        found.stated,
      )}, observed ${showValue(found.observed)}`,
    );
  }
  return lines;
}

/** The lines under the result for what left the checks short. */
function causeLines(found: Cause): string[] {
  const indent = "    ";
  switch (found.kind) {
    case "cases":
      return [`${indent}the check of cases without the code failed`];
    case "differ":
      return [`${indent}the translations differ`];
    case "not compared":
      return [`${indent}the translations were not compared: ${found.cause}`];
    case "stopped":
      return [`${indent}a timeout: ${found.cause}`];
    case "never applied":
      return [`${indent}the rule applied at no step of the model`];
    case "binding":
      return [`${indent}a failing binding: ${found.cause}`];
    case "outside":
      return [`${indent}a project file loaded from outside the copy: ${found.file}`];
    case "timeout":
      return [`${indent}a timeout: not done after ${seconds(found.seconds)}`];
    case "not repeated":
      return [
        `${indent}a sequence did not repeat: caused again, its last step gave another effect`,
        ...sequenceLines([...found.steps, { call: found.last, effect: null }], `${indent}  `, [
          `first  ${effectWords(found.gave)}`,
          `again  ${effectWords(found.other)}`,
        ]),
      ];
  }
}

function resultLines(report: Checked): string[] {
  const lines = [`  Result: ${report.result}`];
  for (const found of report.causes) lines.push(...causeLines(found));
  // One assumption to a line, the later ones under the first.
  report.assumes.forEach((assumed, at) => lines.push(`    ${at === 0 ? "assumes:" : "        "} ${assumed}`));
  const { versions, limits } = report;
  const tlc =
    versions.tlc === null
      ? "TLC not run"
      : `TLC ${versions.tlc} (${versions.pinned ? "the pinned copy" : "not the pinned copy"})`;
  lines.push(`    Spex ${versions.spex}, Node ${versions.node}, ${tlc}, Java ${versions.java}`);
  lines.push(
    report.digest === null
      ? `    ${report.revision}, no files copied`
      : `    ${report.revision}, copied files sha256 ${report.digest.slice(0, 12)}`,
  );
  lines.push(`    limits: ${seconds(limits.seconds)} for each run of TLC and each command`);
  return lines;
}

function faultLines(report: Checked): string[] {
  const lines: string[] = [];
  for (const fault of report.faults) {
    if (fault.caught === null) {
      lines.push(`  Kept fault ${fault.name}: not ${fault.tried ? "caught" : "tried"} — ${fault.reason}`);
      continue;
    }
    lines.push(`  Kept fault ${fault.name}: caught ${metWords(fault.caught)}`);
    lines.push(...findingLines(fault.caught, "    ", true));
  }
  return lines;
}

/** Why a guard cannot be checked: each cause, and under it where TLC
 * met it. */
function cannotLines(cannot: readonly Cannot[]): string[] {
  const lines: string[] = [];
  for (const one of cannot) {
    lines.push(`  Cannot be checked — ${one.cause}`);
    if (one.note !== null) lines.push(`    ${one.note}`);
    lines.push(...sequenceLines(one.steps, "      "));
  }
  return lines;
}

/** One guard's block. */
function blockLines(report: GuardReport): string[] {
  if ("cannot" in report) return [report.name, ...cannotLines(report.cannot)];
  return [
    `${report.name} — checks the rule ${report.behavior}:`,
    ...wrap(report.statement, "  "),
    ...approvalLines(report.name, report.approval),
    ...casesLines(report),
    ...comparedLines(report.compared, report.cases.translations),
    ...modelLines(report),
    ...codeLines(report),
    ...resultLines(report),
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

/** Print what a person is approving, and that it is recorded: the
 * guard item's statement, the rule's, then each case in the item's
 * order, its plain words above its steps, then the label of every
 * other input the record holds. `written` says the record's file was
 * written anew; it stands as it was where its bytes were these
 * already. */
export function sayApproved(guard: Guard, since: Since, path: string, written: boolean): void {
  const { items } = guard;
  const lines = [
    `${guard.name} \u2014 the guard item:`,
    ...wrap(items.guard.statement, "  "),
    "",
    `${items.behavior.id} \u2014 the rule:`,
    ...wrap(items.behavior.statement, "  "),
  ];
  for (const entry of guard.cases) {
    lines.push("", `${entry.kind} \u2014 ${entry.label}`, ...wrap(entry.words, "  "));
    entry.steps.forEach((step, at) => {
      const stated: Fields = step.effect;
      lines.push(`    ${stepLine(at + 1, { event: step.event, params: step.params }, showFields(stated))}`);
    });
  }
  // The record holds more than is printed above: every other input,
  // by the label it is recorded under.
  const shown = new Set([itemLabel(items.guard.id), itemLabel(items.behavior.id), fileLabel(`${guard.folder}/guard.yaml`)]);
  const others = Object.keys(guard.inputs).filter((label) => !shown.has(label));
  if (others.length > 0) lines.push("", "Also recorded, not printed here:", ...others.map((label) => `  ${label}`));
  lines.push("");
  if (since === null) lines.push("First approval.");
  else if (typeof since === "string") lines.push(`The last record cannot be read \u2014 ${since}.`);
  else if (!since.approved) lines.push("Since the last approval:", ...changes(since).map((line) => `  ${line}`));
  else if (written) lines.push("Nothing changed since the last approval.");
  else lines.push(`Nothing changed since the last approval: ${path} stands as it was.`);
  if (written) lines.push(`Approved ${guard.name} \u2014 commit ${path}.`);
  out(lines);
}

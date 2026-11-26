// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-12, guards-17 to guards-25, guards-28,
 * guards-36), DR-251: what `spex verify` does for one guard. It loads the guard,
 * compares its inputs with the approval record, checks the examples
 * against the readings without the code, runs the permitted examples
 * and the sampled check on a copy of the project's code, runs the
 * sampled check again on a copy with each kept fault, and settles the
 * result and whether the guard passes. It prints nothing: `report.ts`
 * does. It writes nothing in the project.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { compareApproval, readApproval, type ApprovalState } from "./approval.js";
import { makeCopy, removeCopy, type Copy } from "./copy.js";
import { loadGuard, type Fault, type Guard, type Sample } from "./files.js";
import type { ItemIndex } from "./items.js";
import { applyPatch } from "./patch.js";
import { lastWords, runProcess, type Ran } from "./processes.js";
import { checkExamples, type ExampleFailure, type WalkStep } from "./reading.js";
import type { Job, RunnerResult } from "./runner.js";
import { GuardError, type Value } from "./types.js";

/** The four results a check on the project's code can have. */
export type Result =
  | "Violated on the implementation"
  | "Disagreement with the model"
  | "Inconclusive"
  | "Sampled on the implementation";

/** Where a sequence came from: a permitted example, or the sampled
 * check's sequence of that number. */
export type Place = { example: string } | { sequence: number };

/** One thing the checks on the code found. */
export type Finding =
  | { kind: "violation"; place: Place; shrinks: number | null; steps: WalkStep[] }
  | { kind: "effect"; example: string; step: number; field: string; stated: Value; observed: Value }
  | { kind: "not shown"; example: string }
  | { kind: "examples" }
  | { kind: "binding"; cause: string }
  | { kind: "reading"; cause: string }
  | { kind: "outside"; file: string }
  | { kind: "timeout"; seconds: number }
  | { kind: "undecided event"; place: Place; steps: WalkStep[] }
  | { kind: "undecided step"; place: Place; steps: WalkStep[] }
  | { kind: "never applied" };

/** The sampled check's counts on a clean run. */
export type Counts = {
  sequences: number;
  applied: number;
  events: Record<string, { caused: number; skipped: number }>;
};

/** One kept fault: caught, with the shrunk sequence, or not, with why. */
export type FaultCheck = {
  name: string;
  caught: { sequence: number; steps: WalkStep[] } | null;
  reason: string | null;
};

/** How a guard's inputs stand; `unreadable` is why its record could
 * not be read. */
export type Approval = ApprovalState & { unreadable: string | null };

/** Everything found for one guard that could be checked. */
export type Checked = {
  name: string;
  behavior: string;
  statement: string;
  approval: Approval;
  examples: { count: number; readings: number; failures: ExampleFailure[] };
  result: Result;
  /** The findings that gave the result, in the order they print. */
  findings: Finding[];
  counts: Counts | null;
  versions: { fastCheck: string; spex: string; node: string };
  revision: string;
  /** The digest of the copied files; null where no copy was made. */
  digest: string | null;
  bounds: Sample;
  legal: { reading: string; events: { event: string; when: string }[] }[];
  faults: FaultCheck[];
  /** Why it does not pass; empty where it passes. */
  reasons: string[];
};

/** One guard's part of the report. */
export type GuardReport = { name: string; cannot: string } | Checked;

/** Whether a guard's report is one that passes. */
export function passes(report: GuardReport): boolean {
  return !("cannot" in report) && report.reasons.length === 0;
}

// ---------------------------------------------------------------
// One copy and its process (guards-12)
// ---------------------------------------------------------------

/** Run one program in a copy: its working folder the copy, its temp
 * folder the copy's own, stopped at the time limit (guards-12). */
function runIn(copy: Copy, program: string, args: string[], seconds: number): Promise<Ran> {
  return runProcess(program, args, {
    cwd: copy.folder,
    env: { ...process.env, TMPDIR: copy.scratch, TMP: copy.scratch, TEMP: copy.scratch },
    seconds,
    // What the code prints takes no part in a result; its errors are
    // kept only to say why a process ended early.
    errors: join(copy.home, "errors.txt"),
  });
}

/** `: <cause>` for a process that ended early, or nothing where it
 * gave none. */
function becauseOf(said: string): string {
  const cause = lastWords(said);
  return cause === "" ? "" : `: ${cause}`;
}

/** What became of one copy. */
type CopyRun =
  | { kind: "patch"; cause: string }
  | { kind: "nothing" }
  | { kind: "binding"; cause: string }
  | { kind: "timeout" }
  | { kind: "done"; result: RunnerResult };

/**
 * Make one copy, apply the fault's patch where there is one, run the
 * binding's commands and the copy's process, and remove the copy.
 */
async function runCopy(guard: Guard, fault: Fault | null): Promise<{ digest: string | null; run: CopyRun }> {
  const { binding, sample } = guard;
  let copy: Copy;
  try {
    copy = makeCopy(guard.root, [...binding.files, binding.folder]);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    return { digest: null, run: { kind: "binding", cause: `the copy could not be made: ${cause}` } };
  }
  const done = (run: CopyRun) => ({ digest: copy.digest, run });
  try {
    if (fault !== null) {
      const patched = applyPatch(copy.folder, fault.patch);
      if (!patched.applies) return done({ kind: "patch", cause: patched.cause });
      if (!patched.changed) return done({ kind: "nothing" });
    }
    for (const [index, command] of binding.commands.entries()) {
      const shown = `command ${index + 1} (${command.join(" ")})`;
      const program = command[0] === "node" ? process.execPath : command[0];
      const ran = await runIn(copy, program, command.slice(1), sample.seconds);
      if (ran.failed !== null) return done({ kind: "binding", cause: `${shown} could not start: ${ran.failed}` });
      if (ran.timedOut) return done({ kind: "timeout" });
      if (ran.code !== 0) {
        const status = ran.code === null ? "ended early" : `ended with status ${ran.code}`;
        return done({ kind: "binding", cause: `${shown} ${status}${becauseOf(ran.errors)}` });
      }
    }
    const job: Job = {
      root: realpathSync(guard.root),
      copy: copy.folder,
      result: join(copy.home, "result.json"),
      module: `${binding.folder}/binding.mjs`,
      values: binding.vocabulary.sets,
      events: binding.events,
      readings: guard.readings.map((reading) => ({
        name: reading.name,
        file: reading.file,
        text: readFileSync(join(guard.root, ...reading.file.split("/")), "utf8"),
      })),
      examples: guard.examples,
      sample,
      examplesOnCode: fault === null,
    };
    const jobFile = join(copy.home, "job.json");
    writeFileSync(jobFile, JSON.stringify(job));
    const runner = fileURLToPath(new URL("./runner.js", import.meta.url));
    const ran = await runIn(copy, process.execPath, [runner, jobFile], sample.seconds);
    if (existsSync(job.result)) {
      return done({ kind: "done", result: JSON.parse(readFileSync(job.result, "utf8")) as RunnerResult });
    }
    if (ran.timedOut) return done({ kind: "timeout" });
    const status = ran.code === null ? "" : ` (status ${ran.code})`;
    return done({
      kind: "binding",
      cause: `the process ended before the checks did${status}${becauseOf(ran.failed ?? ran.errors)}`,
    });
  } finally {
    removeCopy(copy);
  }
}

// ---------------------------------------------------------------
// One guard
// ---------------------------------------------------------------

function spexVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      version?: unknown;
    };
    return typeof manifest.version === "string" ? manifest.version : "unknown";
  } catch {
    return "unknown";
  }
}

/** The short Git commit of the root, `with changes` where Git reports
 * a change in the copied files, or that there is none. */
function revision(root: string, paths: readonly string[]): string {
  // --no-optional-locks keeps Git from writing anything into .git.
  const git = (args: string[]): string =>
    execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  try {
    const commit = git(["rev-parse", "--short", "HEAD"]).trim();
    if (commit === "") return "no Git revision";
    const changes = git(["status", "--porcelain", "--", ...paths]).trim();
    return `revision ${commit}${changes === "" ? "" : " with changes"}`;
  } catch {
    return "no Git revision";
  }
}

/** The findings of the checks on the project's code (guards-21,
 * guards-22), from what its copy's process wrote. */
function codeFindings(guard: Guard, run: CopyRun, shows: readonly string[], examplesFail: boolean): {
  findings: Finding[];
  counts: Counts | null;
} {
  const findings: Finding[] = [];
  if (examplesFail) findings.push({ kind: "examples" });
  if (run.kind === "binding") findings.push({ kind: "binding", cause: run.cause });
  if (run.kind === "timeout") findings.push({ kind: "timeout", seconds: guard.sample.seconds });
  if (run.kind !== "done") return { findings, counts: null };

  const { result } = run;
  for (const example of result.examples) {
    const place = { example: example.item };
    if (example.violation !== null) {
      findings.push({ kind: "violation", place, shrinks: null, steps: example.steps });
      continue;
    }
    for (const difference of example.differences) {
      findings.push({ kind: "effect", example: example.item, ...difference });
    }
    if (shows.includes(example.item) && !example.applied) findings.push({ kind: "not shown", example: example.item });
    if (example.undecided !== null) {
      findings.push({ kind: "undecided step", place, steps: example.steps.slice(0, example.undecided + 1) });
    }
  }
  if (result.ended !== null) findings.push({ kind: result.ended.kind, cause: result.ended.cause });
  if (result.outside !== null) findings.push({ kind: "outside", file: result.outside });

  const sampled = result.sampled;
  let counts: Counts | null = null;
  if (sampled !== null) {
    if (sampled.violation !== null) {
      const { sequence, shrinks, steps } = sampled.violation;
      findings.push({ kind: "violation", place: { sequence }, shrinks, steps });
    } else if (result.ended === null && result.outside === null) {
      const undecided = [
        ["undecided event", sampled.undecidedEvent],
        ["undecided step", sampled.undecidedStep],
      ] as const;
      for (const [kind, shown] of undecided) {
        if (shown !== null) findings.push({ kind, place: { sequence: shown.sequence }, steps: shown.steps });
      }
      if (sampled.ran === guard.sample.sequences) {
        if (sampled.applied === 0) findings.push({ kind: "never applied" });
        counts = { sequences: sampled.ran, applied: sampled.applied, events: sampled.events };
      }
    }
  }
  return { findings, counts };
}

/** The one result, the first found (guards-23), and the findings
 * that gave it. */
function settle(findings: readonly Finding[]): { result: Result; findings: Finding[] } {
  const violation = findings.find((finding) => finding.kind === "violation");
  if (violation !== undefined) return { result: "Violated on the implementation", findings: [violation] };
  const disagreements = findings.filter((finding) => finding.kind === "effect" || finding.kind === "not shown");
  if (disagreements.length > 0) return { result: "Disagreement with the model", findings: disagreements };
  if (findings.length > 0) return { result: "Inconclusive", findings: [...findings] };
  return { result: "Sampled on the implementation", findings: [] };
}

/** One kept fault's check (guards-24). */
function faultCheck(fault: Fault, run: CopyRun, sample: Sample): FaultCheck {
  const notCaught = (reason: string): FaultCheck => ({ name: fault.name, caught: null, reason });
  switch (run.kind) {
    case "patch":
      return notCaught(`the patch does not apply: ${run.cause}`);
    case "nothing":
      return notCaught("the patch changes nothing");
    case "binding":
      return notCaught(`the binding failed: ${run.cause}`);
    case "timeout":
      return notCaught(`a timeout: not done after ${seconds(sample.seconds)}`);
    case "done": {
      const { result } = run;
      const violation = result.sampled?.violation ?? null;
      if (violation !== null) {
        return { name: fault.name, caught: { sequence: violation.sequence, steps: violation.steps }, reason: null };
      }
      if (result.ended?.kind === "binding") return notCaught(`the binding failed: ${result.ended.cause}`);
      if (result.ended?.kind === "reading") return notCaught(`a reading error: ${result.ended.cause}`);
      if (result.outside !== null) {
        return notCaught(`a project file was loaded from outside the copy: ${result.outside}`);
      }
      if (result.sampled === null) return notCaught("the binding failed: the sampled check did not run");
      if (result.sampled.undecidedEvent !== null || result.sampled.undecidedStep !== null) {
        return notCaught("the readings disagreed");
      }
      return notCaught(`no violation in ${result.sampled.ran} sequences`);
    }
  }
}

/** `1 second`, `300 seconds`. */
export function seconds(count: number): string {
  return `${count} ${count === 1 ? "second" : "seconds"}`;
}

/**
 * Check one guard (guards-17). `index` is the tree's items, read
 * once for every guard of the run.
 */
export async function checkGuard(root: string, name: string, index: () => ItemIndex): Promise<GuardReport> {
  // 1. Load.
  let guard: Guard;
  try {
    guard = loadGuard(root, name, index());
  } catch (error) {
    return { name, cannot: error instanceof Error ? error.message : String(error) };
  }

  // 2. The inputs against the approval record.
  let approval: Approval;
  try {
    approval = { ...compareApproval(guard.inputs, readApproval(root, name)), unreadable: null };
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    approval = { approved: false, recorded: true, changed: [], added: [], gone: [], unreadable: error.message };
  }

  // 3. The examples against the readings, without the code.
  const examples = checkExamples(guard.readings, guard.examples);

  // 4 and 5. The permitted examples and the sampled check on a copy.
  const code = await runCopy(guard, null);
  const { findings, counts } = codeFindings(guard, code.run, examples.shows, examples.failures.length > 0);
  // Sampled needs every sequence run, which the counts stand for.
  if (findings.length === 0 && counts === null) {
    findings.push({ kind: "binding", cause: "the sampled check did not run every sequence" });
  }
  const settled = settle(findings);

  // 6. The same sampled check on a copy with each kept fault.
  const faults: FaultCheck[] = [];
  for (const fault of guard.faults) {
    faults.push(faultCheck(fault, (await runCopy(guard, fault)).run, guard.sample));
  }

  // Whether it passes (guards-25).
  const reasons: string[] = [];
  if (!approval.approved) reasons.push("not approved");
  if (examples.failures.length > 0) reasons.push("examples do not agree with the readings");
  if (settled.result !== "Sampled on the implementation") reasons.push(`the check on the code is ${settled.result}`);
  if (faults.length === 0) reasons.push("no kept fault");
  for (const fault of faults) if (fault.caught === null) reasons.push(`kept fault ${fault.name} not caught`);

  return {
    name,
    behavior: guard.items.behavior.id,
    statement: guard.items.assertion.statement,
    approval,
    examples: { count: guard.examples.length, readings: guard.readings.length, failures: examples.failures },
    result: settled.result,
    findings: settled.findings,
    counts: settled.result === "Sampled on the implementation" ? counts : null,
    versions: { fastCheck: fc.__version, spex: spexVersion(), node: process.versions.node },
    revision: revision(root, [...guard.binding.files, guard.binding.folder]),
    digest: code.digest,
    bounds: guard.sample,
    legal: guard.readings.map((reading) => ({
      reading: reading.name,
      events: Object.entries(reading.events).map(([event, entry]) => ({ event, when: entry.legal.source })),
    })),
    faults,
    reasons,
  };
}

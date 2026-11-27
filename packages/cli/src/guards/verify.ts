// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-12, guards-17 to guards-25, guards-28,
 * guards-36, guards-38, guards-39, guards-42), DR-243, DR-244 and
 * DR-252: what `spex verify` does for one guard. It loads the guard
 * and compares its inputs with the approval record. Without the code,
 * TLC reads each translation alone, evaluates the cases under each, compares
 * the translations and model-checks the first one in name order. On a
 * copy of the code, each permitted case and every step of the model
 * is then caused once and the effect the code gave compared with the
 * model's; TLC says of an effect that differs whether the rule
 * forbids it. The same is done on a copy with each kept fault. This
 * file settles the result and whether the guard passes. It calls no
 * language model and draws nothing at random. It prints nothing:
 * `report.ts` does. It writes nothing in the project.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareApproval, readApproval, type ApprovalState } from "./approval.js";
import {
  checkCases,
  checkForm,
  checkModel,
  compareTranslations,
  judge,
  prepareKeep,
  seconds,
  type Cannot,
  type CaseFailure,
  type Comparison,
  type Row,
  type Shop,
  type Shown,
  type Table,
} from "./checks.js";
import { makeCopy, makeHome, relativeToCopy, removeCopy, removeFolder, type Copy } from "./copy.js";
import { declarationModule } from "./declaration.js";
import { NoTranslation, loadGuard, type Binding, type Fault, type Guard, type Limits } from "./files.js";
import type { Observation } from "./harness.js";
import type { ItemIndex } from "./items.js";
import { applyPatch } from "./patch.js";
import { lastWords, runProcess, type Ran } from "./processes.js";
import type { Job, Line } from "./runner.js";
import type { Tools } from "./tlc.js";
import type { Translation } from "./translation.js";
import {
  GuardError,
  differences,
  sameFields,
  showFields,
  type Call,
  type Case,
  type Fields,
  type Type,
  type Value,
} from "./types.js";

/** The results a guard can have (guards-23), the highest first. */
export type Result =
  | "Conflict in the items"
  | "Violated on the code"
  | "Code differs from the model"
  | "Case failed"
  | "Inconclusive"
  | "Model checked, code tested";

/** The result of a guard that passes. */
export const PASSING: Result = "Model checked, code tested";

/** An effect the code gave that is not the model's, with its
 * sequence: the steps before it with the effects observed, its own
 * event, the model's effect and the code's. `case` names the
 * permitted case it was found in, or is null for a step of the model. */
export type Finding = { case: string | null; steps: Shown[]; last: Call; model: string; gave: string };

/** A stated effect field of a permitted case the code did not give. */
export type CaseEffect = { case: string; step: number; field: string; stated: Value; observed: Value };

/** What left the checks short of a result, in the order found. */
export type Cause =
  | { kind: "cases" }
  | { kind: "differ" }
  | { kind: "not compared"; cause: string }
  | { kind: "stopped"; cause: string }
  | { kind: "never applied" }
  | { kind: "binding"; cause: string }
  | { kind: "outside"; file: string }
  | { kind: "timeout"; seconds: number }
  | { kind: "not repeated"; steps: Shown[]; last: Call; gave: string; other: string };

/** What TLC found on the model of the judging translation. */
export type OnModel =
  | { kind: "checked"; states: number; steps: number; applied: number; collision: string | null }
  | { kind: "conflict"; steps: Shown[]; last: Call; effect: string }
  | { kind: "not checked"; cause: string };

/** What the tests on the unpatched copy found. */
export type OnCode = {
  /** The steps of the model, and how many of them were caused. */
  steps: number;
  tested: number;
  /** Of those caused: the code gave the model's effect, an effect
   * the rule forbids or another effect, an earlier step of the
   * sequence had already differed, or the run of TLC that judges an
   * effect that is not the model's was stopped before it said. The
   * five add up to `tested`. */
  same: number;
  forbidden: number;
  differs: number;
  notReached: number;
  notJudged: number;
  /** The permitted cases, how many were caused to their end, and how
   * many went as their steps state. */
  cases: number;
  casesCaused: number;
  casesAsStated: number;
  /** The first effect the rule forbids and the first other effect
   * the model does not give. */
  violation: Finding | null;
  difference: Finding | null;
  failed: CaseEffect[];
};

/** One kept fault: caught, with the forbidden effect's sequence, or
 * not, with why. `tried` is false where no copy was made for it, so
 * its patch was never tried. */
export type FaultCheck = { name: string; tried: boolean; caught: Finding | null; reason: string | null };

/** How a guard's inputs stand; `unreadable` is why its record could
 * not be read. */
export type Approval = ApprovalState & { unreadable: string | null };

/** Everything found for one guard that could be checked. */
export type Checked = {
  name: string;
  behavior: string;
  /** The behavior item's statement. */
  statement: string;
  approval: Approval;
  cases: { count: number; permitted: number; forbidden: number; translations: string[]; failures: CaseFailure[] };
  /** How the translations compare; null for a guard with one. */
  compared: Comparison | null;
  /** The translation whose model was checked and judges the code. */
  judging: string;
  model: OnModel | null;
  /** The tests on the code, or why there were none. */
  code: OnCode | null;
  notTested: string | null;
  result: Result;
  /** What left the checks short, in the order they print. */
  causes: Cause[];
  /** What the passing result rests on (guards-23). */
  assumes: string[];
  versions: { spex: string; node: string; tlc: string | null; pinned: boolean; java: string };
  revision: string;
  /** The digest of the copied files; null where no copy was made. */
  digest: string | null;
  limits: Limits;
  faults: FaultCheck[];
  /** Why it does not pass; empty where it passes. */
  reasons: string[];
};

/** The declaration in TLA+, as a file. */
const DECLARATION_FILE = "Declaration.tla";

/** One guard's part of the report. */
export type GuardReport = { name: string; cannot: Cannot[] } | Checked;

/** Whether a guard's report is one that passes. */
export function passes(report: GuardReport): boolean {
  return !("cannot" in report) && report.reasons.length === 0;
}

// ---------------------------------------------------------------
// One copy and its process (guards-12)
// ---------------------------------------------------------------

/** Run one program in a copy: its working folder the copy, its temp
 * folder the copy's own, stopped at the time limit (guards-12). */
function runIn(copy: Copy, program: string, args: string[], limit: number): Promise<Ran> {
  return runProcess(program, args, {
    cwd: copy.folder,
    env: { ...process.env, TMPDIR: copy.scratch, TMP: copy.scratch, TEMP: copy.scratch },
    seconds: limit,
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
  | {
      kind: "done";
      /** The effects observed, by the sequence's place in the job. */
      observed: Map<number, Fields[]>;
      /** What ended the process before every sequence was caused. */
      short: Cause[];
    };

/** What a binding lacks that a test on the code needs, found before
 * any copy is made (guards-36), or null. */
function lacking(binding: Binding): string | null {
  if (!binding.module) return "no binding.mjs";
  if (binding.files.length === 0) return "the declaration names no files";
  return null;
}

/**
 * Make one copy, apply the fault's patch where there is one, run the
 * binding's commands and the copy's process on `sequences`, and
 * remove the copy. A binding that lacks its module or its files gets
 * no copy.
 */
async function runCopy(
  guard: Guard,
  sequences: Call[][],
  fault: Fault | null,
): Promise<{ digest: string | null; run: CopyRun }> {
  const { binding, limits } = guard;
  const lacks = lacking(binding);
  if (lacks !== null) return { digest: null, run: { kind: "binding", cause: lacks } };
  let copy: Copy;
  try {
    copy = makeCopy(guard.root, [...binding.files, binding.folder]);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    return { digest: null, run: { kind: "binding", cause: `the copy could not be made: ${cause}` } };
  }
  const done = (run: CopyRun) => ({ digest: copy.digest, run });
  // No cause names the copy's fresh folder: a path into the copy is
  // told relative to it, so two runs tell the same cause (guards-36).
  const told = (cause: string): string => relativeToCopy(cause, copy.home);
  try {
    if (fault !== null) {
      const patched = applyPatch(copy.folder, fault.patch);
      if (!patched.applies) return done({ kind: "patch", cause: patched.cause });
      if (!patched.changed) return done({ kind: "nothing" });
    }
    for (const [index, command] of binding.commands.entries()) {
      const shown = `command ${index + 1} (${command.join(" ")})`;
      const program = command[0] === "node" ? process.execPath : command[0];
      const ran = await runIn(copy, program, command.slice(1), limits.seconds);
      if (ran.failed !== null) return done({ kind: "binding", cause: told(`${shown} could not start: ${ran.failed}`) });
      if (ran.timedOut) return done({ kind: "timeout" });
      if (ran.code !== 0) {
        const status = ran.code === null ? "ended early" : `ended with status ${ran.code}`;
        return done({ kind: "binding", cause: told(`${shown} ${status}${becauseOf(ran.errors)}`) });
      }
    }
    const job: Job = {
      root: realpathSync(guard.root),
      copy: copy.folder,
      result: join(copy.home, "result.jsonl"),
      module: `${binding.folder}/binding.mjs`,
      values: binding.vocabulary.sets,
      events: binding.events,
      sequences,
    };
    const jobFile = join(copy.home, "job.json");
    writeFileSync(jobFile, JSON.stringify(job));
    const runner = fileURLToPath(new URL("./runner.js", import.meta.url));
    const ran = await runIn(copy, process.execPath, [runner, jobFile], limits.seconds);

    // The sequences the process caused to their end before it ended
    // stand (guards-23). A line cut short by its end is not read.
    const observed = new Map<number, Fields[]>();
    const short: Cause[] = [];
    let finished = false;
    const text = existsSync(job.result) ? readFileSync(job.result, "utf8") : "";
    for (const written of text.split("\n")) {
      let line: Line;
      try {
        line = JSON.parse(written) as Line;
      } catch {
        continue;
      }
      if (line.kind === "observed") observed.set(line.at, line.effects);
      else if (line.kind === "outside") short.push({ kind: "outside", file: line.file });
      else if (line.kind === "ended") short.push({ kind: "binding", cause: told(line.cause) });
      else if (line.kind === "finished") finished = true;
    }
    if (!finished && short.length === 0) {
      if (ran.timedOut) short.push({ kind: "timeout", seconds: limits.seconds });
      else {
        const status = ran.code === null ? "" : ` (status ${ran.code})`;
        short.push({
          kind: "binding",
          cause: told(`the process ended before every sequence was caused${status}${becauseOf(ran.failed ?? ran.errors)}`),
        });
      }
    }
    return done({ kind: "done", observed, short });
  } finally {
    removeCopy(copy);
  }
}

// ---------------------------------------------------------------
// What the code gave against the model
// ---------------------------------------------------------------

/** The rows of the table in the order they are tried: shortest
 * sequences first, ties in TLC's order. */
function inOrder(table: Table): { row: Row; path: Row[] }[] {
  return table.rows
    .map((row, at) => ({ row, at, path: table.paths.get(row.from) as Row[] }))
    .sort((a, b) => a.path.length - b.path.length || a.at - b.at);
}

/** An effect the code gave that TLC is asked about, and what to do
 * with its answer. */
type Asked = { observation: Observation; finding: Finding; row: boolean };

/** What the effects observed on one copy show, before TLC judges
 * those that are not the model's. */
type Assessed = {
  code: OnCode;
  asked: Asked[];
  notRepeated: Cause | null;
};

/**
 * Compare what one copy's process observed with the cases and with
 * the model. The job's sequences are the permitted cases, then one
 * sequence for each row of the table.
 */
function assess(permitted: readonly Case[], table: Table, observed: ReadonlyMap<number, Fields[]>): Assessed {
  const rows = inOrder(table);
  const code: OnCode = {
    steps: rows.length,
    tested: 0,
    same: 0,
    forbidden: 0,
    differs: 0,
    notReached: 0,
    notJudged: 0,
    cases: permitted.length,
    casesCaused: 0,
    casesAsStated: 0,
    violation: null,
    difference: null,
    failed: [],
  };
  const asked: Asked[] = [];

  // The same sequence caused again gives the same effects.
  const first = new Map<string, Fields>();
  let notRepeated: Cause | null = null;
  const repeats = (calls: readonly Call[], effects: readonly Fields[]): void => {
    let prefix = "";
    for (const [at, effect] of effects.entries()) {
      prefix += `\n${JSON.stringify(calls[at])}`;
      const known = first.get(prefix);
      if (known === undefined) first.set(prefix, effect);
      else if (!sameFields(known, effect) && notRepeated === null) {
        notRepeated = {
          kind: "not repeated",
          steps: calls.slice(0, at).map((call, index) => ({ call, effect: showFields(effects[index]) })),
          last: calls[at],
          gave: showFields(known),
          other: showFields(effect),
        };
      }
    }
  };

  // The model's rows by their state and event.
  const byStep = new Map<string, Row>();
  const stepKey = (state: string, call: Call): string => `${state}\n${JSON.stringify(call)}`;
  for (const { row } of rows) byStep.set(stepKey(row.from, row.call), row);

  permitted.forEach((entry, index) => {
    const effects = observed.get(index);
    if (effects === undefined) return;
    code.casesCaused += 1;
    const calls = entry.steps.map((step) => ({ event: step.event, params: step.params }));
    repeats(calls, effects);
    // The case's own steps through the model, while the code follows it.
    let state: string | null = table.start;
    let failed = false;
    for (const [at, step] of entry.steps.entries()) {
      const row: Row | undefined = state === null ? undefined : byStep.get(stepKey(state, calls[at]));
      const found = differences(step.effect, effects[at]);
      if (found.length > 0) {
        failed = true;
        for (const difference of found) code.failed.push({ case: entry.label, step: at + 1, ...difference });
        if (row !== undefined) {
          asked.push({
            row: false,
            observation: { before: calls.slice(0, at), call: calls[at], effect: effects[at] },
            finding: {
              case: entry.label,
              steps: calls.slice(0, at).map((call, k) => ({ call, effect: showFields(effects[k]) })),
              last: calls[at],
              model: showFields(row.effect),
              gave: showFields(effects[at]),
            },
          });
        }
        break;
      }
      state = row !== undefined && sameFields(effects[at], row.effect) ? row.next : null;
    }
    if (!failed) code.casesAsStated += 1;
  });

  rows.forEach(({ row, path }, index) => {
    const effects = observed.get(permitted.length + index);
    if (effects === undefined) return;
    const calls = [...path.map((step) => step.call), row.call];
    repeats(calls, effects);
    code.tested += 1;
    const last = effects[effects.length - 1];
    if (path.some((step, at) => !sameFields(effects[at], step.effect))) code.notReached += 1;
    else if (sameFields(last, row.effect)) code.same += 1;
    else {
      asked.push({
        row: true,
        observation: { before: calls.slice(0, -1), call: row.call, effect: last },
        finding: {
          case: null,
          steps: path.map((step, at) => ({ call: step.call, effect: showFields(effects[at]) })),
          last: row.call,
          model: showFields(row.effect),
          gave: showFields(last),
        },
      });
    }
  });
  return { code, asked, notRepeated };
}

/** Put TLC's answers into what was assessed: an effect the rule
 * forbids is a violation, another one a difference from the model.
 * Where TLC was stopped before it answered, `forbidden` is null and
 * each step of the model it was asked about is counted as not judged. */
function judged(assessed: Assessed, forbidden: readonly boolean[] | null): void {
  const { code } = assessed;
  assessed.asked.forEach((one, at) => {
    if (forbidden === null) {
      if (one.row) code.notJudged += 1;
    } else if (forbidden[at]) {
      if (one.row) code.forbidden += 1;
      code.violation ??= one.finding;
    } else if (one.row) {
      code.differs += 1;
      code.difference ??= one.finding;
    }
  });
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

/**
 * What the passing result rests on (guards-23): that the declared
 * values are the ones that matter, each `values` set a param's type
 * names and each param's whole-number range; that what the code does
 * next depends only on the model's state; and that the binding causes
 * and observes truly.
 */
export function assumptions(binding: Binding): string[] {
  const sets = new Set<string>();
  const ranges: string[] = [];
  const read = (type: Type, where: string): void => {
    switch (type.kind) {
      case "bool":
        return;
      case "int":
        ranges.push(`${where} = ${type.min}..${type.max}`);
        return;
      case "value":
        sets.add(type.set);
        return;
      case "set":
      case "optional":
        read(type.of, where);
        return;
    }
  };
  for (const [event, declared] of Object.entries(binding.events)) {
    for (const [param, type] of Object.entries(declared.params)) read(type, `${event} ${param}`);
  }
  const values: string[] = [];
  for (const [set, members] of Object.entries(binding.vocabulary.sets)) {
    if (sets.has(set)) values.push(`${set} = ${members.join(", ")}`);
  }
  values.push(...new Set(ranges));
  return [
    `the declared values are the ones that matter${values.length === 0 ? "" : ` (${values.join(" and ")})`}`,
    "what the code does next depends only on the model's state, each step being tried from one sequence",
    "the binding causes and observes truly",
  ];
}

/** What a run of `spex verify` shares between its guards. */
export type Run = {
  /** The tree's items, read once. */
  index: () => ItemIndex;
  /** Java and the jar, found once; a GuardError where they are not. */
  tools: () => Promise<Tools>;
  /** The folder of `--keep`, or null. */
  keep: string | null;
};

/** Why a kept fault was not caught on a copy that could not be
 * tested to its end, or null. */
function shortReason(cause: Cause, limits: Limits): string {
  switch (cause.kind) {
    case "binding":
      return `the binding failed: ${cause.cause}`;
    case "timeout":
      return `a timeout: not done after ${seconds(limits.seconds)}`;
    case "outside":
      return `a project file was loaded from outside the copy: ${cause.file}`;
    case "stopped":
      return cause.cause;
    default:
      return "the tests did not end";
  }
}

/**
 * Check one guard (guards-17).
 */
export async function checkGuard(root: string, name: string, run: Run): Promise<GuardReport> {
  const cannot = (cause: string): GuardReport => ({ name, cannot: [{ cause, note: null, steps: [] }] });
  const said = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  // 1. Load. A guard with no translation yet has its declaration all
  // the same: `--keep` leaves it in TLA+, for those who draft one.
  let guard: Guard;
  try {
    guard = loadGuard(root, name, run.index());
  } catch (error) {
    if (error instanceof NoTranslation && run.keep !== null) {
      try {
        const kept = prepareKeep(run.keep, name);
        writeFileSync(join(kept, DECLARATION_FILE), declarationModule(error.binding, error.binding.name));
      } catch (failure) {
        if (!(failure instanceof GuardError)) throw failure;
        return cannot(failure.message);
      }
    }
    return cannot(said(error));
  }

  // 2. The inputs against the approval record.
  let approval: Approval;
  try {
    approval = { ...compareApproval(guard.inputs, readApproval(root, name)), unreadable: null };
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    approval = { approved: false, recorded: true, changed: [], added: [], gone: [], unreadable: error.message };
  }

  // TLC, and where it runs.
  let tools: Tools;
  try {
    tools = await run.tools();
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    return cannot(error.message);
  }
  const home = makeHome();
  try {
    const shop: Shop = {
      tools,
      guard,
      home,
      keep: run.keep === null ? null : prepareKeep(run.keep, name),
      version: { tlc: null },
    };
    return await check(guard, approval, shop);
  } catch (error) {
    if (!(error instanceof GuardError)) throw error;
    return cannot(error.message);
  } finally {
    removeFolder(home);
  }
}

/**
 * Wait for runs started together, every one to its end, and hand
 * back what each found. Where runs fail, the failure told is that of
 * the first in the order given, whichever ended first: the same
 * inputs give the same report, and no run outlives its guard.
 */
async function together<T extends readonly unknown[]>(runs: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const ended = await Promise.allSettled(runs);
  for (const one of ended) if (one.status === "rejected") throw one.reason;
  return ended.map((one) => (one as PromiseFulfilledResult<unknown>).value) as { -readonly [K in keyof T]: Awaited<T[K]> };
}

async function check(guard: Guard, approval: Approval, shop: Shop): Promise<GuardReport> {
  const { name, root, translations, limits } = guard;
  // The first translation in name order: its model is checked and
  // judges the code.
  const judging: Translation = translations[0];

  // 0. Each translation alone, every fault of every one.
  const forms = await together(translations.map((translation) => checkForm(shop, translation)));
  if (forms.some((faults) => faults.length > 0)) {
    return { name, cannot: forms.flat().map((cause) => ({ cause, note: null, steps: [] })) };
  }

  // 1 to 3. Without the code: the model, the translations against
  // each other, the cases. The runs start together.
  const [model, compared, cases] = await together<[
    ReturnType<typeof checkModel>,
    ReturnType<typeof compareTranslations> | null,
    ReturnType<typeof checkCases>,
  ]>([checkModel(shop, judging), translations.length > 1 ? compareTranslations(shop) : null, checkCases(shop)]);
  const unreadable: Cannot[] = [];
  // A translation TLC could not go on in is told once: as the model
  // run met it, else the comparison, else the cases.
  const told = new Set<string>();
  for (const found of [model, compared, cases]) {
    if (found?.kind !== "cannot") continue;
    for (const one of found.cannot) {
      const file = /^(.*?\.tla)(:\d+:\d+)?: /.exec(one.cause)?.[1] ?? one.cause;
      if (!told.has(file)) unreadable.push(one);
      told.add(file);
    }
  }
  if (unreadable.length > 0) return { name, cannot: unreadable };
  if (cases.kind === "cannot" || compared?.kind === "cannot" || model.kind === "cannot") {
    throw new GuardError("TLC could not check the guard");
  }

  const causes: Cause[] = [];
  const failures = cases.kind === "done" ? cases.failures : [];
  const casesFailed = cases.kind === "stopped" || failures.length > 0;
  if (cases.kind === "stopped") causes.push({ kind: "stopped", cause: cases.cause });
  else if (failures.length > 0) causes.push({ kind: "cases" });
  if (compared?.kind === "differ") causes.push({ kind: "differ" });
  if (compared?.kind === "not compared") causes.push({ kind: "not compared", cause: compared.cause });
  if (model.kind === "not checked") causes.push({ kind: "stopped", cause: `${model.cause} while it checked the model` });
  if (model.kind === "checked" && model.applied === 0) causes.push({ kind: "never applied" });

  // Why the code is not tested, where it is not: no translation
  // judges it then.
  const notTested = casesFailed
    ? "the check of cases without the code failed"
    : compared?.kind === "differ"
      ? "the translations differ"
      : compared?.kind === "not compared"
        ? "the translations were not compared"
        : model.kind === "conflict"
          ? "the model conflicts with the rule"
          : model.kind === "not checked"
            ? "the model was not checked"
            : model.applied === 0
              ? "the rule applies at no step of the model"
              : null;

  // 4 and 5. The permitted cases and every step of the model, on a
  // copy.
  let digest: string | null = null;
  let code: OnCode | null = null;
  const faults: FaultCheck[] = [];
  if (notTested !== null || model.kind !== "checked") {
    for (const fault of guard.faults) {
      faults.push({ name: fault.name, tried: false, caught: null, reason: notTested });
    }
  } else {
    const { table } = model;
    const permitted = guard.cases.filter((entry) => entry.kind === "permitted");
    const sequences: Call[][] = [
      ...permitted.map((entry) => entry.steps.map((step) => ({ event: step.event, params: step.params }))),
      ...inOrder(table).map(({ row, path }) => [...path.map((step) => step.call), row.call]),
    ];
    const copied = await runCopy(guard, sequences, null);
    digest = copied.digest;
    if (copied.run.kind === "binding") causes.push({ kind: "binding", cause: copied.run.cause });
    else if (copied.run.kind === "timeout") causes.push({ kind: "timeout", seconds: limits.seconds });
    else if (copied.run.kind === "done") {
      const assessed = assess(permitted, table, copied.run.observed);
      const answers = await judge(shop, "judge", judging, assessed.asked.map((one) => one.observation));
      if (answers.kind === "cannot") return { name, cannot: answers.cannot };
      if (answers.kind === "stopped") causes.push({ kind: "stopped", cause: answers.cause });
      judged(assessed, answers.kind === "stopped" ? null : answers.forbidden);
      code = assessed.code;
      if (assessed.notRepeated !== null) causes.push(assessed.notRepeated);
      causes.push(...copied.run.short);
    }

    // 6. The same on a copy with each kept fault. A fault is caught
    // only where the code gave an effect the rule forbids.
    for (const fault of guard.faults) {
      const patched = await runCopy(guard, sequences, fault);
      const notCaught = (reason: string): void => {
        faults.push({ name: fault.name, tried: true, caught: null, reason });
      };
      const made = patched.run;
      if (patched.digest === null && made.kind === "binding") {
        faults.push({ name: fault.name, tried: false, caught: null, reason: `the binding failed: ${made.cause}` });
      } else if (made.kind === "patch") notCaught(`the patch does not apply: ${made.cause}`);
      else if (made.kind === "nothing") notCaught("the patch changes nothing");
      else if (made.kind === "binding") notCaught(`the binding failed: ${made.cause}`);
      else if (made.kind === "timeout") notCaught(`a timeout: not done after ${seconds(limits.seconds)}`);
      else {
        const assessed = assess(permitted, table, made.observed);
        const answers = await judge(shop, `judge-${fault.name}`, judging, assessed.asked.map((one) => one.observation));
        if (answers.kind === "cannot") return { name, cannot: answers.cannot };
        judged(assessed, answers.kind === "stopped" ? null : answers.forbidden);
        const found = assessed.code;
        if (found.violation !== null) faults.push({ name: fault.name, tried: true, caught: found.violation, reason: null });
        else if (answers.kind === "stopped") notCaught(answers.cause);
        else if (made.short.length > 0) notCaught(shortReason(made.short[0], limits));
        else {
          const other = found.differs + found.notReached;
          notCaught(
            `the code gave no effect the rule forbids in ${found.tested} ${found.tested === 1 ? "step" : "steps"} tested` +
              (other === 0 ? "" : `; ${other} did not give the model's effect`),
          );
        }
      }
    }
  }

  // The one result, the highest row found (guards-23).
  const complete = code !== null && code.tested === code.steps && code.casesAsStated === code.cases;
  const result: Result =
    model.kind === "conflict"
      ? "Conflict in the items"
      : code?.violation != null
        ? "Violated on the code"
        : code?.difference != null
          ? "Code differs from the model"
          : code !== null && code.failed.length > 0
            ? "Case failed"
            : causes.length > 0 || !complete || code?.notReached !== 0 || code?.notJudged !== 0
              ? "Inconclusive"
              : PASSING;

  // Whether it passes (guards-25).
  const reasons: string[] = [];
  if (!approval.approved) reasons.push("not approved");
  if (casesFailed) reasons.push("the check of cases without the code failed");
  if (translations.length < 2) reasons.push("only one translation");
  if (compared?.kind === "differ") reasons.push("the translations differ");
  if (compared?.kind === "not compared") reasons.push("the translations were not compared");
  if (result !== PASSING) reasons.push(`the result is ${result}`);
  if (faults.length === 0) reasons.push("no kept fault");
  for (const fault of faults) {
    if (fault.caught === null) reasons.push(`kept fault ${fault.name} not ${fault.tried ? "caught" : "tried"}`);
  }

  return {
    name,
    behavior: guard.items.behavior.id,
    statement: guard.items.behavior.statement,
    approval,
    cases: {
      count: guard.cases.length,
      permitted: guard.cases.filter((entry) => entry.kind === "permitted").length,
      forbidden: guard.cases.filter((entry) => entry.kind === "forbidden").length,
      translations: translations.map((translation) => translation.name),
      failures,
    },
    compared,
    judging: judging.name,
    model:
      model.kind === "checked"
        ? {
            kind: "checked",
            states: model.table.paths.size,
            steps: model.table.rows.length,
            applied: model.applied,
            collision: model.collision,
          }
        : model,
    code,
    notTested,
    result,
    causes,
    assumes: result === PASSING ? assumptions(guard.binding) : [],
    versions: {
      spex: spexVersion(),
      node: process.versions.node,
      tlc: shop.version.tlc,
      pinned: shop.tools.pinned,
      java: shop.tools.javaVersion,
    },
    revision: revision(root, [...guard.binding.files, guard.binding.folder]),
    digest,
    limits,
    faults,
    reasons,
  };
}

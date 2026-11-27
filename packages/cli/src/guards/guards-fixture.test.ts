// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-243, DR-244 and DR-252: what the integration
 * suites share. They run the built CLI, with real TLC on the
 * machine's Java, in a made-up fixture project written to a temp
 * folder: a lock one user holds while others wait, of plain `.mjs`
 * files, its items under `specs/packages/`, and a guard on it with
 * two translations, one kept fault and an approval. Each scenario
 * changes one thing and runs in a folder of its own.
 *
 * The suites are several files, so that each stays well inside the
 * time the runner gives one file (`scripts/run-tests.cjs`) on a slow
 * runner too. This file holds no test: it is named as one so that it
 * stays out of the published package.
 */

import { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TLC_PIN, findTools, type Tools } from "./tlc.js";

export const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI = join(PACKAGE, "dist", "cli.js");
export const SPEX_VERSION = (JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as { version: string }).version;

export const GUARD = "lock-9";
export const HEADING = "Protect critical behavior on every change";

// ---------------------------------------------------------------
// The fixture project
// ---------------------------------------------------------------

export const SPDX = `<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
`;

export const STATEMENT =
  "While a user holds the lock, when another user takes it, the lock shall stay with its holder, refuse the taker and report the taker among those waiting, as [[lock-4](#lock-4)] orders them.";
export const STATEMENT_SAID = STATEMENT.replace("[[lock-4](#lock-4)]", "[lock-4]");

export const WAITS = "a second taker waits";
export const GETS = "a second taker gets the lock";
export const NEXT = "the first waiting user is next";

export const SPEC = `${SPDX}
# lock: A Lock One User Holds

## Intent

This package defines a lock that one user holds while others wait.

## External Behavior

### lock-3

${STATEMENT}

### lock-4

When the holder leaves, the lock shall pass to the waiting user who comes first among ann, bob and cy.

## Verification

### lock-9

When \`spex verify\` checks the lock, it shall find that a held lock stays with its holder [[lock-3](#lock-3)], reading the rule by these cases:

- permitted — ${WAITS}: ann takes the free lock and gets it, and bob takes it;
  the lock is refused, stays with ann, and bob waits;
- forbidden — ${GETS}: the same two takes, ending with the lock granted;
- permitted — ${NEXT}: ann takes, cy takes, bob takes, and ann leaves; the lock passes to bob and one user still waits.
`;

export const CODE = `const ORDER = ["ann", "bob", "cy"];

export function create() {
  return { holder: null, waiting: [] };
}

export function take(lock, who) {
  if (lock.holder === null) {
    lock.holder = who;
    return true;
  }
  lock.waiting.push(who);
  return false;
}

export function leave(lock) {
  lock.waiting.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  lock.holder = lock.waiting.shift() ?? null;
}
`;

export const BINDING_YAML = `format: 1
values:
  user: [ann, bob, cy]
events:
  take:
    params: { who: user }
    effect: { granted: bool, holder: user?, waiting: set of user }
  leave:
    params: { who: user }
    effect: { holder: user?, queue: 0..2 }
  reset: {}
files:
  - src
`;

export const BINDING_MJS = `import { create, leave, take } from "../../../src/lock.mjs";

export function start() {
  return { lock: create() };
}

export const events = {
  take(state, { who }) {
    const granted = take(state.lock, who);
    // A set may come back in any order.
    return { granted, holder: state.lock.holder, waiting: [...state.lock.waiting].reverse() };
  },
  async leave(state) {
    leave(state.lock);
    return { holder: state.lock.holder, queue: state.lock.waiting.length };
  },
  reset(state) {
    state.lock = create();
  },
};
`;

export const GUARD_YAML = `format: 1
binding: lock
limits: { seconds: 60 }
cases:
  - case: ${GETS}
    steps:
      - { event: take, params: { who: ann } }
      - { event: take, params: { who: bob }, effect: { granted: true } }
  - case: ${WAITS}
    steps:
      - { event: take, params: { who: ann }, effect: { granted: true } }
      - { event: take, params: { who: bob }, effect: { granted: false, holder: ann, waiting: [bob] } }
  - case: ${NEXT}
    steps:
      - { event: take, params: { who: ann } }
      - { event: take, params: { who: cy } }
      - { event: take, params: { who: bob } }
      - { event: leave, params: { who: ann }, effect: { holder: bob, queue: 1 } }
`;

/** A translation whose state is a record. */
export const TRANSLATION_A = `---- MODULE a ----
EXTENDS Declaration, Naturals, FiniteSets

\\* The model's state: who holds the lock, and who waits for it.
Start == [holder |-> Missing, waiting |-> {}]

\\* A user takes the lock only while neither holding it nor waiting; only the holder leaves.
Legal(s, e) ==
  CASE e.event = "take"  -> e.who # s.holder /\\ e.who \\notin s.waiting
    [] e.event = "leave" -> e.who = s.holder
    [] e.event = "reset" -> TRUE

After(s, e) ==
  CASE e.event = "take" ->
         IF s.holder = Missing
         THEN [holder |-> e.who, waiting |-> {}]
         ELSE [holder |-> s.holder, waiting |-> s.waiting \\cup {e.who}]
    \\* lock-4
    [] e.event = "leave" ->
         IF s.waiting = {}
         THEN [holder |-> Missing, waiting |-> {}]
         ELSE [holder |-> UserFirst(s.waiting), waiting |-> s.waiting \\ {UserFirst(s.waiting)}]
    [] e.event = "reset" -> Start

Effect(s, e) ==
  CASE e.event = "take" ->
         [granted |-> s.holder = Missing, holder |-> After(s, e).holder, waiting |-> After(s, e).waiting]
    [] e.event = "leave" ->
         [holder |-> After(s, e).holder, queue |-> Cardinality(After(s, e).waiting)]
    [] e.event = "reset" -> <<>>

\\* lock-3, clause by clause.
When(e) == e.event = "take"
While(s, e) == s.holder # Missing /\\ s.holder # e.who
Shall(s, e, f) == ~f.granted /\\ f.holder = s.holder /\\ e.who \\in f.waiting
====
`;

/** The same items written otherwise: its state is a pair. */
export const TRANSLATION_B = `---- MODULE b ----
EXTENDS Declaration

\\* The model's state: the holder or Missing, then the users waiting.
Start == <<Missing, {}>>

Holder(s) == s[1]
Waiting(s) == s[2]

Legal(s, e) ==
  IF e.event = "take" THEN e.who # Holder(s) /\\ e.who \\notin Waiting(s)
  ELSE IF e.event = "leave" THEN e.who = Holder(s)
  ELSE TRUE

After(s, e) ==
  IF e.event = "take"
  THEN (IF Holder(s) = Missing THEN <<e.who, {}>> ELSE <<Holder(s), Waiting(s) \\cup {e.who}>>)
  ELSE IF e.event = "leave"
  THEN (IF Waiting(s) = {} THEN <<Missing, {}>>
        ELSE <<UserFirst(Waiting(s)), Waiting(s) \\ {UserFirst(Waiting(s))}>>)
  ELSE Start

Effect(s, e) ==
  LET n == After(s, e) IN
  IF e.event = "take" THEN [granted |-> Holder(s) = Missing, holder |-> n[1], waiting |-> n[2]]
  ELSE IF e.event = "leave" THEN [holder |-> n[1], queue |-> Cardinality(n[2])]
  ELSE <<>>

When(e) == e.event = "take"
While(s, e) == Holder(s) # Missing /\\ Holder(s) # e.who
Shall(s, e, f) == ~f.granted /\\ f.holder = Holder(s) /\\ e.who \\in f.waiting
====
`;

/** A defect the rule forbids: a take of a held lock is granted. */
export const FAULT = `A take of a held lock is granted.

diff --git a/src/lock.mjs b/src/lock.mjs
--- a/src/lock.mjs
+++ b/src/lock.mjs
@@ -10,7 +10,7 @@
     return true;
   }
   lock.waiting.push(who);
-  return false;
+  return true;
 }

 export function leave(lock) {
`;

/** A defect the rule does not forbid: the lock passes to the last
 * waiting user. */
export const OTHER_FAULT = `The lock passes to the last waiting user.

diff --git a/src/lock.mjs b/src/lock.mjs
--- a/src/lock.mjs
+++ b/src/lock.mjs
@@ -15,5 +15,5 @@

 export function leave(lock) {
   lock.waiting.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
-  lock.holder = lock.waiting.shift() ?? null;
+  lock.holder = lock.waiting.pop() ?? null;
 }
`;

export const SRC = "src/lock.mjs";
export const BINDING = "guards/bindings/lock";
export const DECLARATION = `${BINDING}/binding.yaml`;
export const MODULE = `${BINDING}/binding.mjs`;
export const TRANSLATIONS = `guards/${GUARD}/translations`;
export const A = `${TRANSLATIONS}/a.tla`;
export const B = `${TRANSLATIONS}/b.tla`;
export const FAULT_FILE = `guards/${GUARD}/faults/grants-twice.patch`;
export const OTHER_FAULT_FILE = `guards/${GUARD}/faults/last-waiting.patch`;
export const GUARD_FILE = `guards/${GUARD}/guard.yaml`;
export const APPROVAL = `guards/${GUARD}/approval.json`;
export const SPEC_FILE = "specs/packages/lock.md";

export const FILES: Readonly<Record<string, string>> = {
  [SPEC_FILE]: SPEC,
  [SRC]: CODE,
  [DECLARATION]: BINDING_YAML,
  [MODULE]: BINDING_MJS,
  [A]: TRANSLATION_A,
  [B]: TRANSLATION_B,
  [GUARD_FILE]: GUARD_YAML,
  [FAULT_FILE]: FAULT,
};

/** The model, worked out by hand. A state is the holder and the set
 * of the other users waiting: the free lock, and for each of three
 * holders the four sets of the other two: 13 states. From the free
 * lock 3 takes and a reset are legal. From a held lock, with w users
 * waiting: the 2 - w takes, the holder's leave and the reset; over
 * the four sets of each holder that is 3 x (4 + 3 + 3 + 2) = 36. In
 * all 40 steps. The rule applies at a take of a held lock: 3 x 4 = 12. */
export const STATES = 13;
export const STEPS = 40;
export const APPLIED = 12;

export const CASES_OK = "  Cases, without the code: each of 2 translations allows the 2 permitted cases and forbids the 1 forbidden case";
export const AGREE = "  Translations against each other: 2 translations, in agreement at every step TLC reached";
export const MODEL_OK = `  On the model: TLC ${TLC_PIN.version} checked every state the model of translation a reaches: ${STATES} states, ${STEPS} steps; the rule applied at ${APPLIED} steps`;
export const CODE_OK = `  On the code: ${STEPS} steps tested, each after a shortest sequence from a fresh start: each gave the model's effect`;
export const CASES_ON_CODE = "    the 2 permitted cases went as their steps state";
export const PASSED = "  Result: Model checked, code tested";
export const ASSUMES = [
  "    assumes: the declared values are the ones that matter (user = ann, bob, cy)",
  "             what the code does next depends only on the model's state, each step being tried from one sequence",
  "             the binding causes and observes truly",
];
export const LIMITS = "    limits: 60 seconds for each run of TLC and each command";
export const FAULT_CAUGHT = [
  `  Kept fault grants-twice: caught at step 2 of the permitted case "${WAITS}"`,
  "    1. take who=ann -> granted=true holder=ann waiting={}",
  "    2. take who=bob",
  "       the model gives granted=false holder=ann waiting={bob}",
  "       the code gave   granted=true holder=ann waiting={bob}",
  "       forbidden by the rule",
];

/** What a scenario changes: a path's new text, or null to remove it. */
export type Change = Record<string, string | null>;

export let scratch = "";
export let template = "";
export let tools: Tools;
let made = 0;

export type Ran = { code: number | null; stdout: string; stderr: string };

/** Run the built CLI in `cwd` with a temp folder of its own and the
 * jar the suite found, and check that the run left nothing in that
 * temp folder. `env` holds further variables; one set to null is
 * taken away. */
export function spex(cwd: string, args: string[], options: { node?: string[]; env?: Record<string, string | null> } = {}): Promise<Ran> {
  const temp = mkdtempSync(join(scratch, "tmp-"));
  const env: NodeJS.ProcessEnv = { ...process.env, SPEX_TLC_JAR: tools.jar, TMPDIR: temp, TMP: temp, TEMP: temp };
  for (const [name, value] of Object.entries(options.env ?? {})) {
    if (value === null) delete env[name];
    else env[name] = value;
  }
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [...(options.node ?? []), CLI, ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", failed);
    child.on("close", (code) => {
      try {
        assert.deepEqual(readdirSync(temp), [], `spex ${args.join(" ")} leaves no folder under the OS temp folder`);
        done({ code, stdout, stderr });
      } catch (error) {
        failed(error);
      }
    });
  });
}

export function write(dir: string, path: string, text: string | null): void {
  const file = join(dir, ...path.split("/"));
  if (text === null) {
    rmSync(file, { recursive: true, force: true });
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

export function read(dir: string, path: string): string {
  return readFileSync(join(dir, ...path.split("/")), "utf8");
}

/** A fresh copy of the fixture project with `change` made, approved
 * through the CLI unless told otherwise. */
export async function project(change: Change = {}, options: { approve?: boolean } = {}): Promise<string> {
  made += 1;
  const dir = join(scratch, `project-${made}`);
  cpSync(template, dir, { recursive: true });
  for (const [path, text] of Object.entries(change)) write(dir, path, text);
  if (options.approve !== false) {
    const approved = await spex(dir, ["approve", GUARD]);
    assert.equal(approved.code, 0, `the fixture's guard is approved: ${approved.stderr}`);
  }
  return dir;
}

/** `text` with `from` replaced by `to`; `from` must be there. */
export function swap(text: string, from: string, to: string): string {
  assert.ok(text.includes(from), `the fixture holds ${JSON.stringify(from)}`);
  return text.replace(from, () => to);
}

/** Every file under `dir` with the digest of its bytes. */
export function filesOf(dir: string): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (folder: string, prefix: string): void => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
      else found[`${prefix}${name}`] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  walk(dir, "");
  return found;
}

/** A guard's block of a report: from its first line to the blank line
 * after it. */
export function block(stdout: string): string[] {
  const lines = stdout.split("\n");
  const start = lines.findIndex((line) => line === GUARD || line.startsWith(`${GUARD} — `));
  assert.ok(start >= 0, `the report has a block for ${GUARD}:\n${stdout}`);
  const end = lines.indexOf("", start);
  return lines.slice(start, end < 0 ? undefined : end);
}

/** The lines under the line that starts with `opening`: those that
 * stand deeper. */
export function under(lines: string[], opening: string): string[] {
  const at = lines.findIndex((line) => line.startsWith(opening));
  assert.ok(at >= 0, `the block holds ${JSON.stringify(opening)}:\n${lines.join("\n")}`);
  const depth = lines[at].length - lines[at].trimStart().length;
  const found: string[] = [];
  for (const next of lines.slice(at + 1)) {
    if (next.length - next.trimStart().length <= depth) break;
    found.push(next);
  }
  return found;
}

export function lineOf(lines: string[], opening: string): string {
  const found = lines.find((line) => line.startsWith(opening));
  assert.ok(found !== undefined, `the block holds ${JSON.stringify(opening)}:\n${lines.join("\n")}`);
  return found;
}

/** Verify the fixture with `change` made and return the run and the
 * guard's block. The run leaves the project's files as they were. */
export async function verified(
  change: Change = {},
  options: { approve?: boolean; env?: Record<string, string | null> } = {},
): Promise<Ran & { dir: string; lines: string[] }> {
  const dir = await project(change, options);
  const files = filesOf(dir);
  const ran = await spex(dir, ["verify"], { env: options.env });
  assert.deepEqual(filesOf(dir), files, "the project holds the same files with the same bytes");
  return { ...ran, dir, lines: block(ran.stdout) };
}

/** The time limits a scenario that waits for one is tried with. The
 * first is short, so the suite stays quick. The second is tried only
 * where a run that was not to reach the limit was stopped at the
 * first, as on a slow runner; it leaves a file whose scenarios wait
 * for the limit twice well inside the time the runner gives a file. */
export const SHORT_LIMITS = [12, 30];

/** Verify the fixture with the change made for a time limit, where
 * only what the scenario is about is to reach it. A report with a
 * line that `other` matches shows another run stopped at the limit:
 * the scenario is then tried with the longer one. */
export async function withinLimit(
  change: (seconds: number) => Change,
  other: RegExp,
): Promise<{ ran: Awaited<ReturnType<typeof verified>>; seconds: number }> {
  for (const seconds of SHORT_LIMITS) {
    const ran = await verified(change(seconds));
    if (seconds === SHORT_LIMITS.at(-1) || !ran.lines.some((line) => other.test(line))) return { ran, seconds };
  }
  throw new Error("no time limit to try");
}

/** Verify the fixture with `change` made, where it cannot be checked,
 * and return the lines under its name. */
export async function cannot(change: Change, env?: Record<string, string | null>): Promise<string[]> {
  const ran = await verified(change, { approve: false, env });
  assert.equal(ran.lines[0], GUARD, `a guard that cannot be checked prints its name alone: ${ran.stdout}`);
  assert.ok(ran.lines[1].startsWith("  Cannot be checked — "), ran.stdout);
  assert.ok(!ran.lines.some((line) => /Approval|Result|Passes|Does not pass/.test(line)), `and no result: ${ran.stdout}`);
  assert.equal(ran.code, 1, "a guard that cannot be checked exits 1");
  assert.ok(ran.stdout.endsWith("\n0 of 1 guards pass.\n"), "such a guard does not pass");
  return ran.lines.slice(1);
}

/** Whether no process of this number runs any more. */
export function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return true;
  }
  if (existsSync("/proc/self/stat")) {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      return stat.charAt(stat.lastIndexOf(") ") + 2) === "Z";
    } catch {
      return true;
    }
  }
  try {
    return execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim().startsWith("Z");
  } catch {
    return true;
  }
}

/** Set the fixture up for the file's tests, and take it away after
 * them. Call once, at the top of a test file. */
export function useFixture(): void {
  before(async () => {
    // Real TLC on the machine's Java: without them the suite fails here, by name.
    try {
      tools = await findTools();
    } catch (error) {
      throw new Error(`the guards integration suites run real TLC and need Java and tla2tools.jar: ${(error as Error).message}`);
    }
    scratch = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-suite-")));
    template = join(scratch, "template");
    for (const [path, text] of Object.entries(FILES)) write(template, path, text);
  });

  after(() => {
    if (scratch !== "") rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
}

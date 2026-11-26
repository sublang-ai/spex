// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-251: the integration suite (guards-29 to
 * guards-35). It runs the built CLI in a fixture project written to a
 * temp folder: a small entitlement module of plain `.mjs` files with
 * `grant`, `revoke` and `use`, its items under `specs/packages/`, and
 * an approved guard on it. Each scenario changes one thing.
 */

import { after, before, describe, it } from "node:test";
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
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(PACKAGE, "dist", "cli.js");
const SPEX_VERSION = (JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8")) as { version: string }).version;
const FAST_CHECK_VERSION = (
  JSON.parse(readFileSync(fileURLToPath(import.meta.resolve("fast-check")).replace(/lib[\\/].*$/, "package.json"), "utf8")) as {
    version: string;
  }
).version;

const GUARD = "entitlements-2";
const HEADING = "Protect critical behavior on every change";

// ---------------------------------------------------------------
// The fixture project
// ---------------------------------------------------------------

const SPDX = `<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->
`;

/** The assertion item's statement, longer than one line of the report. */
const STATEMENT =
  "While a user holds no seat, because none was granted, the grant was revoked or every seat was used, in the store of [[entitlements-6](#entitlements-6)], the module shall refuse each use by that user [[entitlements-1](#entitlements-1)].";

/** That statement as printed: each link as its text. */
const STATEMENT_SAID =
  "While a user holds no seat, because none was granted, the grant was revoked or every seat was used, in the store of [entitlements-6], the module shall refuse each use by that user [entitlements-1].";

const SPEC = `${SPDX}
# entitlements: Seats a User Holds

## Intent

This package defines the seats a user holds and uses.

## External Behavior

### entitlements-1

When a user who holds no seat uses the service, the module shall refuse the use.

### entitlements-5

When a user is granted seats, the module shall let that user use the service once for each seat.

## Verification

### entitlements-2

${STATEMENT}

### entitlements-3

When ann is granted one seat, uses it and uses the service again, the module shall let the first use pass and refuse the second [[entitlements-1](#entitlements-1)].

### entitlements-4

When ann is granted one seat, the grant is revoked and ann uses the service, the module shall never let that use pass [[entitlements-1](#entitlements-1)].

### entitlements-6

When ann is granted two seats, the suite shall see both uses pass [[entitlements-5](#entitlements-5)].

### entitlements-7

While a user holds no seat, the module shall refuse a second kind of use by that user [[entitlements-1](#entitlements-1)].
`;

const CALC_SPEC = `${SPDX}
# calc: A Probe of the Reading Language

## Intent

This package defines a probe that doubles a number.

## External Behavior

### calc-1

When the probe is given a number, the module shall return twice that number plus one.

## Verification

### calc-2

While the probe runs, the module shall return twice its number plus one, its user and its group as given [[calc-1](#calc-1)].

### calc-3

When the probe is given 3, ann and both users, the module shall return 7, ann and both users [[calc-1](#calc-1)].

### calc-4

When the probe is given 3, the module shall never return 8 [[calc-1](#calc-1)].
`;

const CODE = `import { clamp } from "tiny-clamp";

export function create() {
  return new Map();
}

export function grant(store, who, count) {
  if ((store.get(who) ?? 0) > 0) return false;
  store.set(who, clamp(count, 1, 3));
  return true;
}

export function revoke(store, who) {
  const held = (store.get(who) ?? 0) > 0;
  store.delete(who);
  return held;
}

export function use(store, who) {
  const left = store.get(who) ?? 0;
  if (left === 0) return null;
  store.set(who, left - 1);
  return left - 1;
}

export function left(store, who) {
  return store.get(who) ?? 0;
}
`;

const BINDING_YAML = `format: 1
values:
  user: [ann, bob]
events:
  grant:
    params: { who: user, count: int 1..3 }
    effect: { ok: bool, holders: set of user }
  revoke:
    params: { who: user }
    effect: { ok: bool }
  use:
    params: { who: user }
    effect: { ok: bool, remaining: int 0..3? }
  audit:
    params: { only: set of user, after: user?, floor: map user to int 0..3, every: bool }
    effect: { seats: map user to int 0..3, first: user? }
files:
  - src
`;

const BINDING_MJS = `import { create, grant, left, revoke, use } from "../../../src/entitlements.mjs";

const USERS = ["ann", "bob"];

export function start() {
  return create();
}

export const events = {
  grant(store, { who, count }) {
    const ok = grant(store, who, count);
    // A set may come back in any order.
    return { ok, holders: [...USERS].reverse().filter((user) => left(store, user) > 0) };
  },
  revoke(store, { who }) {
    return { ok: revoke(store, who) };
  },
  async use(store, { who }) {
    const remaining = use(store, who);
    return { ok: remaining !== null, remaining };
  },
  audit(store, { only, after, floor, every }) {
    const plain =
      Array.isArray(only) && (after === null || USERS.includes(after)) && typeof every === "boolean" &&
      USERS.every((user) => Number.isInteger(floor[user]));
    if (!plain) throw new Error("audit was given params of another shape");
    const shown = (every ? USERS : only).filter((user) => left(store, user) >= floor[user] && user !== after);
    return { seats: Object.fromEntries(USERS.map((user) => [user, left(store, user)])), first: shown[0] ?? null };
  },
};

export async function stop(store) {
  store.clear();
}
`;

const WHEN_A = "left[who] == 0";
const SHALL_A = "not effect.ok";
const WHEN_B = "not (left[who] >= 1)";
const SHALL_B = "effect.ok == false and effect.remaining == none";
const REVOKE_LEGAL = "left[who] > 0";
const GRANT_THEN = "map u in user: if u == who and effect.ok then count else left[u]";

function reading(when: string, shall: string): string {
  return `format: 1
state:
  left: { type: map user to int 0..3, start: { ann: 0, bob: 0 } }
events:
  grant:
    then:
      left: "${GRANT_THEN}"
  revoke:
    legal: "${REVOKE_LEGAL}"
    then:
      left: "map u in user: if u == who then 0 else left[u]"
  use:
    then:
      left: "map u in user: if u == who and left[u] > 0 then left[u] - 1 else left[u]"
assertion:
  - on: use
    when: "${when}"
    shall: "${shall}"
`;
}

const READING_A = reading(WHEN_A, SHALL_A);
const READING_B = reading(WHEN_B, SHALL_B);

const PERMITTED_STEPS = `      - { event: grant, params: { who: ann, count: 1 }, effect: { ok: true, holders: [ann] } }
      - { event: use, params: { who: ann }, effect: { ok: true, remaining: 0 } }
      - { event: use, params: { who: ann }, effect: { ok: false, remaining: null } }
`;

const FORBIDDEN_EXAMPLE = `  - item: entitlements-4
    kind: forbidden
    steps:
      - { event: grant, params: { who: ann, count: 1 }, effect: { ok: true } }
      - { event: revoke, params: { who: ann }, effect: { ok: true } }
      - { event: use, params: { who: ann }, effect: { ok: true, remaining: 0 } }
`;

const SAMPLE = "sample: { sequences: 100, events: 8, seed: 1, seconds: 30 }";

const GUARD_YAML = `format: 1
binding: seats
${SAMPLE}
examples:
  - item: entitlements-3
    kind: permitted
    steps:
${PERMITTED_STEPS}${FORBIDDEN_EXAMPLE}`;

const FAULT = `Revoking a grant leaves its seats in place.

diff --git a/src/entitlements.mjs b/src/entitlements.mjs
--- a/src/entitlements.mjs
+++ b/src/entitlements.mjs
@@ -14,7 +14,6 @@ export function grant(store, who, count) {

 export function revoke(store, who) {
   const held = (store.get(who) ?? 0) > 0;
-  store.delete(who);
   return held;
 }

`;

const SRC = "src/entitlements.mjs";
const BINDING = "guards/bindings/seats";
const READINGS = `guards/${GUARD}/readings`;
const FAULT_FILE = `guards/${GUARD}/faults/revoke-keeps.patch`;
const GUARD_FILE = `guards/${GUARD}/guard.yaml`;
const APPROVAL = `guards/${GUARD}/approval.json`;

/** The fixture's files beside the scaffolded `specs/`. */
const FILES: Readonly<Record<string, string>> = {
  "specs/packages/entitlements.md": SPEC,
  "specs/packages/calc.md": CALC_SPEC,
  "node_modules/tiny-clamp/package.json": JSON.stringify({ name: "tiny-clamp", version: "1.0.0", type: "module", exports: "./index.js" }),
  "node_modules/tiny-clamp/index.js": "export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));\n",
  [SRC]: CODE,
  [`${BINDING}/binding.yaml`]: BINDING_YAML,
  [`${BINDING}/binding.mjs`]: BINDING_MJS,
  [`${BINDING}/notes.md`]: "The store is a map from a user to the seats left.\n",
  [`${READINGS}/a.yaml`]: READING_A,
  [`${READINGS}/b.yaml`]: READING_B,
  [GUARD_FILE]: GUARD_YAML,
  [FAULT_FILE]: FAULT,
};

/** What a scenario changes: a path's new text, or null to remove it. */
type Change = Record<string, string | null>;

let scratch = "";
let template = "";
let made = 0;

type Ran = { code: number | null; stdout: string; stderr: string };

/** Run the built CLI in `cwd` with a temp folder of its own, and
 * check that the run left nothing there (guards-28). `node` holds
 * options for Node itself and `env` further variables, which the
 * copy's processes get too. */
function spex(cwd: string, args: string[], options: { node?: string[]; env?: Record<string, string> } = {}): Promise<Ran> {
  const temp = mkdtempSync(join(scratch, "tmp-"));
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [...(options.node ?? []), CLI, ...args], {
      cwd,
      env: { ...process.env, ...options.env, TMPDIR: temp, TMP: temp, TEMP: temp },
      stdio: ["ignore", "pipe", "pipe"],
    });
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
        assert.deepEqual(readdirSync(temp), [], `[guards-28] spex ${args.join(" ")} leaves no folder under the OS temp folder`);
        done({ code, stdout, stderr });
      } catch (error) {
        failed(error);
      }
    });
  });
}

function write(dir: string, path: string, text: string | null): void {
  const file = join(dir, ...path.split("/"));
  if (text === null) {
    rmSync(file, { recursive: true, force: true });
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function read(dir: string, path: string): string {
  return readFileSync(join(dir, ...path.split("/")), "utf8");
}

/** A fresh copy of the fixture project with `change` made, approved
 * through the CLI unless told otherwise. */
async function project(change: Change = {}, options: { approve?: boolean; guard?: string } = {}): Promise<string> {
  made += 1;
  const dir = join(scratch, `project-${made}`);
  cpSync(template, dir, { recursive: true });
  for (const [path, text] of Object.entries(change)) write(dir, path, text);
  if (options.approve !== false) {
    const approved = await spex(dir, ["approve", options.guard ?? GUARD]);
    assert.equal(approved.code, 0, `the fixture's guard is approved: ${approved.stderr}`);
  }
  return dir;
}

/** `text` with `from` replaced by `to`; `from` must be there. */
function swap(text: string, from: string, to: string): string {
  assert.ok(text.includes(from), `the fixture holds ${JSON.stringify(from)}`);
  return text.replace(from, () => to);
}

/** Every file under `dir` with the digest of its bytes. */
function snapshot(dir: string): Record<string, string> {
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
function block(stdout: string, guard: string): string[] {
  const lines = stdout.split("\n");
  const start = lines.findIndex((line) => line === guard || line.startsWith(`${guard} — `));
  assert.ok(start >= 0, `the report has a block for ${guard}:\n${stdout}`);
  const end = lines.indexOf("", start);
  return lines.slice(start, end < 0 ? undefined : end);
}

function sha(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

/** An item's text: from its heading to the line before the next
 * heading, trailing blank lines dropped. */
function itemText(spec: string, id: string): string {
  const lines = spec.split("\n");
  const start = lines.indexOf(`### ${id}`);
  assert.ok(start >= 0, `the spec holds ${id}`);
  let end = lines.findIndex((line, index) => index > start && /^#{1,3} /.test(line));
  if (end < 0) end = lines.length;
  const text = lines.slice(start, end);
  while (text[text.length - 1]?.trim() === "") text.pop();
  return text.join("\n");
}

/** Verify the fixture with `change` made and return the run and the
 * guard's block. */
async function verified(change: Change = {}, options: { approve?: boolean } = {}): Promise<Ran & { dir: string; lines: string[] }> {
  const dir = await project(change, options);
  const ran = await spex(dir, ["verify"]);
  return { ...ran, dir, lines: block(ran.stdout, GUARD) };
}

/** Code that starts a process which never ends and holds the standard
 * error of the one that started it, and writes its number to the file
 * the suite names. */
const LEAVES = `import { spawn as spawnLeft } from "node:child_process";
import { appendFileSync as noteLeft } from "node:fs";
const leftBehind = spawnLeft(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" });
leftBehind.unref();
noteLeft(process.env.SPEX_TEST_PIDS, leftBehind.pid + "\\n");
`;

/** Whether no process of this number runs any more. One that was
 * killed and not yet collected by its parent counts as gone. */
function gone(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return true;
  }
  if (existsSync("/proc/self/stat")) {
    try {
      // The state is the one letter after the name, which is in brackets.
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

/** Wait for the process of this number to be gone. A process that
 * stays makes the test fail by the runner's own limit. */
async function untilGone(pid: number): Promise<void> {
  while (!gone(pid)) await pause(20);
}

/** Verify `guard` alone in the fixture with `change` made, and return
 * the one line under its name, where it cannot be checked. The run
 * leaves the project's files as they were. */
async function cannot(change: Change, guard = GUARD): Promise<string> {
  const dir = await project(change, { approve: false });
  const before = snapshot(dir);
  const ran = await spex(dir, ["verify", guard]);
  const lines = block(ran.stdout, guard);
  assert.equal(lines.length, 2, `[guards-26] its name and the Cannot be checked line alone: ${ran.stdout}`);
  assert.equal(lines[0], guard, "[guards-26]");
  assert.ok(lines[1].startsWith("  Cannot be checked — "), `[guards-18] ${ran.stdout}`);
  assert.equal(ran.code, 1, "[guards-27] a guard that cannot be checked exits 1");
  assert.ok(ran.stdout.endsWith("\n0 of 1 guards pass.\n"), "[guards-18] such a guard does not pass");
  assert.deepEqual(snapshot(dir), before, "[guards-28] the project holds the same files with the same bytes");
  return lines[1].slice("  Cannot be checked — ".length);
}

before(async () => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-test-")));
  template = join(scratch, "template");
  mkdirSync(template);
  const scaffolded = await spex(scratch, ["scaffold", template]);
  assert.equal(scaffolded.code, 0, scaffolded.stderr);
  for (const [path, text] of Object.entries(FILES)) write(template, path, text);
  write(
    template,
    "specs/map.md",
    `${read(template, "specs/map.md").trimEnd()}\n| [entitlements.md](packages/entitlements.md) | Seats a user holds and uses |\n| [calc.md](packages/calc.md) | A probe of the reading language |\n`,
  );
});

after(() => {
  if (scratch !== "") rmSync(scratch, { recursive: true, force: true });
});

// ---------------------------------------------------------------
// guards-29: a guard that passes
// ---------------------------------------------------------------

describe("guards-29: spex verify on an approved guard", { concurrency: 4 }, () => {
  it("guards-29: the fixture's items pass spex lint", async () => {
    const dir = await project({}, { approve: false });
    const linted = await spex(dir, ["lint", "."]);
    assert.equal(linted.stdout, "spex lint: no problems found\n", "the fixture's specs are lawful");
  });

  it("guards-29: a guard that passes exits 0 with its whole block, leaving the project as it was", async () => {
    const dir = await project();
    const before = snapshot(dir);
    const ran = await spex(dir, ["verify"]);
    assert.equal(ran.code, 0, `[guards-27] every guard passes, so the command exits 0: ${ran.stdout}${ran.stderr}`);
    assert.equal(ran.stderr, "", "[guards-27] a report prints nothing on standard error");
    const all = ran.stdout.split("\n");
    assert.equal(all[0], HEADING, "[guards-26] the report opens with its heading");
    assert.equal(all[1], "", "[guards-26] a blank line comes before the guard's block");
    assert.deepEqual(all.slice(-3), ["", "1 of 1 guards pass.", ""], "[guards-26] the run ends with the count after a blank line");
    assert.doesNotMatch(ran.stdout, /\b(verified|valid|proved)\b/i, "[guards-26] the report never says verified, valid or proved");

    const lines = block(ran.stdout, GUARD);
    assert.equal(lines[0], `${GUARD} — protects entitlements-1`, "[guards-1] [guards-2] the block names the guard by its folder and the behavior item its assertion cites");
    const approval = lines.indexOf("  Approval: approved");
    assert.ok(approval > 1, "[guards-19] the inputs are approved");
    const statement = lines.slice(1, approval);
    assert.equal(statement.map((line) => line.trim()).join(" "), STATEMENT_SAID, "[guards-2] [guards-26] the assertion item's statement follows, each link as its text");
    assert.doesNotMatch(ran.stdout, /\]\(/, "[guards-2] no link's target is printed");
    assert.ok(statement.length > 1 && statement.every((line) => line.startsWith("  ") && line.length <= 100), "[guards-26] the statement is wrapped at 100 columns and indented two spaces");
    assert.equal(lines[approval + 1], "  Examples against the readings: 2 examples, 2 readings, all as stated", "[guards-10] [guards-20] the examples line counts the examples and readings");
    assert.equal(lines[approval + 2], "  On the code: Sampled on the implementation", "[guards-21] [guards-23] nothing was found on the code");

    const counted = /^ {4}100 sequences, (\d+) in which the assertion applied$/.exec(lines[approval + 3]);
    assert.ok(counted && Number(counted[1]) > 0, `[guards-22] the assertion applied in some sequences: ${lines[approval + 3]}`);
    const events: Record<string, { caused: number; skipped: number }> = {};
    for (const line of lines) {
      const count = /^ {4}(\w+): caused (\d+), skipped (\d+)$/.exec(line);
      if (count) events[count[1]] = { caused: Number(count[2]), skipped: Number(count[3]) };
    }
    assert.deepEqual(Object.keys(events), ["grant", "revoke", "use", "audit"], "[guards-3] [guards-22] each declared event is counted, in declared order");
    for (const [event, count] of Object.entries(events)) {
      assert.ok(count.caused > 0, `[guards-4] [guards-5] [guards-22] ${event} was caused through the module, its params and effect of every declared type passing`);
    }
    assert.ok(events.revoke.skipped > 0, "[guards-7] [guards-22] an event the readings find not legal is skipped");
    assert.equal(events.use.skipped, 0, "[guards-22] an event every reading finds legal is never skipped");

    assert.ok(lines.includes(`    fast-check ${FAST_CHECK_VERSION}, Spex ${SPEX_VERSION}, Node ${process.versions.node}`), "[guards-26] the versions of fast-check, Spex and Node");
    assert.ok(lines.some((line) => /^ {4}no Git revision, copied files sha256 [0-9a-f]{12}$/.test(line)), "[guards-12] [guards-26] the revision and the copied files' digest");
    assert.ok(lines.includes("    bounds: 100 sequences, at most 8 events, seed 1, 30 seconds"), "[guards-10] [guards-26] the four bounds of the guard file");
    for (const name of ["a", "b"]) {
      assert.ok(lines.includes(`    legal when — ${name}: grant: true; revoke: ${REVOKE_LEGAL}; use: true; audit: true`), `[guards-6] reading ${name}'s legal expression for each event`);
    }
    const fault = lines.findIndex((line) => /^ {2}Kept fault revoke-keeps: caught at sequence \d+$/.test(line));
    assert.ok(fault > 0, "[guards-24] the kept fault is caught");
    assert.deepEqual(
      lines.slice(fault + 1),
      [
        "    1. grant who=ann count=1 -> ok=true holders={ann}",
        "    2. revoke who=ann -> ok=true",
        "    3. use who=ann -> ok=true remaining=0",
        "       forbidden by every reading",
        "  Passes",
      ],
      "[guards-22] [guards-25] [guards-26] the shrunk sequence, its last step forbidden by every reading, then Passes",
    );
    assert.deepEqual(snapshot(dir), before, "[guards-28] the project holds the same files with the same bytes");

    const again = await spex(dir, ["verify"]);
    assert.equal(again.stdout, ran.stdout, "[guards-22] the seed, the files and the versions alone decide the sequences");
  });

  it("guards-29: a binding whose commands write a file the module loads passes, both running in the copy", async () => {
    const dir = await project({
      "scripts/build.mjs": 'import { writeFileSync } from "node:fs";\nwriteFileSync("src/most.generated.mjs", "export const MOST = 3;\\n");\n',
      [SRC]: swap(swap(CODE, 'import { clamp } from "tiny-clamp";', 'import { clamp } from "tiny-clamp";\nimport { MOST } from "./most.generated.mjs";'), "clamp(count, 1, 3)", "clamp(count, 1, MOST)"),
      [`${BINDING}/binding.yaml`]: `${swap(BINDING_YAML, "  - src\n", "  - src\n  - scripts/build.mjs\n")}commands:\n  - [node, scripts/build.mjs]\n`,
    });
    const before = snapshot(dir);
    const ran = await spex(dir, ["verify"]);
    assert.equal(ran.code, 0, `[guards-3] [guards-12] the commands build the copy and the module loads what they wrote: ${ran.stdout}`);
    assert.equal(existsSync(join(dir, "src", "most.generated.mjs")), false, "[guards-12] the command ran in the copy, not in the project");
    assert.deepEqual(snapshot(dir), before, "[guards-28] the project is as it was");
  });

  it("guards-29: two guards are checked in name order, or in the order named", async () => {
    const second: Change = {
      "guards/entitlements-7/guard.yaml": GUARD_YAML,
      "guards/entitlements-7/readings/a.yaml": READING_A,
      "guards/entitlements-7/faults/revoke-keeps.patch": FAULT,
    };
    const dir = await project(second);
    assert.equal((await spex(dir, ["approve", "entitlements-7"])).code, 0);
    const order = (stdout: string): string[] => stdout.split("\n").filter((line) => / — protects /.test(line)).map((line) => line.split(" ")[0]);

    const every = await spex(dir, ["verify"]);
    assert.equal(every.code, 0, every.stdout);
    assert.deepEqual(order(every.stdout), [GUARD, "entitlements-7"], "[guards-17] every guard, in name order");
    assert.ok(every.stdout.endsWith("\n2 of 2 guards pass.\n"), "[guards-17] both pass");

    const named = await spex(dir, ["verify", "entitlements-7", GUARD]);
    assert.equal(named.code, 0, named.stdout);
    assert.deepEqual(order(named.stdout), ["entitlements-7", GUARD], "[guards-17] the guards named, in the order given");
    assert.ok(named.stdout.endsWith("\n2 of 2 guards pass.\n"));

    const one = await spex(dir, ["verify", "entitlements-7"]);
    assert.deepEqual(order(one.stdout), ["entitlements-7"], "[guards-17] only the guard named");
    assert.ok(one.stdout.endsWith("\n1 of 1 guards pass.\n"));
  });

  it("guards-29: a project with no guards/ folder, or no guard in it, has nothing to check", async () => {
    for (const change of [{ guards: null }, { [`guards/${GUARD}`]: null }] as Change[]) {
      const dir = await project(change, { approve: false });
      const ran = await spex(dir, ["verify"]);
      assert.equal(ran.code, 0, "[guards-17] nothing to check exits 0");
      assert.equal(ran.stdout, "No guards under guards/.\n", "[guards-17] and says so");
    }
  });

  it("guards-29: the revision names the Git commit, with changes once a copied file changes", async () => {
    const dir = await project();
    const git = (...args: string[]): void => {
      execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "ignore" });
    };
    git("init");
    git("add", "-A");
    git("commit", "-m", "fixture");
    const before = snapshot(dir);
    const clean = await spex(dir, ["verify"]);
    assert.equal(clean.code, 0, clean.stdout);
    assert.ok(block(clean.stdout, GUARD).some((line) => /^ {4}revision [0-9a-f]{7,}, copied files sha256 [0-9a-f]{12}$/.test(line)), `[guards-26] the short commit: ${clean.stdout}`);
    assert.deepEqual(snapshot(dir), before, "[guards-28] nothing is written in the project, its .git included");

    write(dir, SRC, `${CODE}// a note\n`);
    const changed = await spex(dir, ["verify"]);
    assert.ok(block(changed.stdout, GUARD).some((line) => /^ {4}revision [0-9a-f]{7,} with changes, copied files sha256 [0-9a-f]{12}$/.test(line)), `[guards-26] with changes: ${changed.stdout}`);
    assert.equal(changed.code, 0, "[guards-14] the code a binding's files name is no input, so the guard stays approved");
  });
});

// ---------------------------------------------------------------
// guards-30: approval
// ---------------------------------------------------------------

describe("guards-30: spex approve and the approval record", { concurrency: 4 }, () => {
  it("guards-30: a guard with no record is not approved, spex approve records it, and it then passes", async () => {
    const dir = await project({}, { approve: false });
    const first = await spex(dir, ["verify"]);
    const lines = block(first.stdout, GUARD);
    const at = lines.indexOf("  Approval: not approved — no approval record");
    assert.ok(at > 0, `[guards-19] no approval record: ${first.stdout}`);
    assert.equal(lines[at + 1], `    run spex approve ${GUARD} after reviewing`, "[guards-26] the next line names spex approve");
    assert.equal(lines.at(-1), "  Does not pass — not approved", "[guards-25] not approved is the one reason");
    assert.equal(first.code, 1, "[guards-27] a guard that does not pass exits 1");
    assert.equal(existsSync(join(dir, APPROVAL)), false, "[guards-28] spex verify writes no record");

    const approved = await spex(dir, ["approve", GUARD]);
    assert.equal(approved.code, 0, `[guards-27] the record written exits 0: ${approved.stderr}`);
    assert.equal(approved.stderr, "");
    const said = approved.stdout.split("\n");
    assert.equal(said[0], `${GUARD} — protects entitlements-1`);
    const gap = said.indexOf("");
    assert.equal(said.slice(1, gap).map((line) => line.trim()).join(" "), STATEMENT_SAID, "[guards-16] the assertion item's statement, each link as its text");
    assert.deepEqual(
      said.slice(gap + 1),
      [
        "entitlements-3 — permitted",
        "  When ann is granted one seat, uses it and uses the service again, the module shall let the first",
        "  use pass and refuse the second [entitlements-1].",
        "    1. grant who=ann count=1 -> ok=true holders={ann}",
        "    2. use who=ann -> ok=true remaining=0",
        "    3. use who=ann -> ok=false remaining=none",
        "",
        "entitlements-4 — forbidden",
        "  When ann is granted one seat, the grant is revoked and ann uses the service, the module shall",
        "  never let that use pass [entitlements-1].",
        "    1. grant who=ann count=1 -> ok=true",
        "    2. revoke who=ann -> ok=true",
        "    3. use who=ann -> ok=true remaining=0",
        "",
        "First approval.",
        `Approved ${GUARD} — commit ${APPROVAL}.`,
        "",
      ],
      "[guards-16] each example's statement, kind and stored sequence, First approval. and the Approved line",
    );
    assert.doesNotMatch(approved.stdout, /On the code|Kept fault/, "[guards-16] spex approve runs no check");

    const inputs: Record<string, string> = {};
    for (const path of [`${BINDING}/binding.mjs`, `${BINDING}/binding.yaml`, `${BINDING}/notes.md`, FAULT_FILE, GUARD_FILE, `${READINGS}/a.yaml`, `${READINGS}/b.yaml`]) {
      inputs[`file ${path}`] = sha(FILES[path]);
    }
    for (const id of ["entitlements-1", "entitlements-2", "entitlements-3", "entitlements-4", "entitlements-6"]) {
      inputs[`item ${id}`] = sha(itemText(SPEC, id));
    }
    assert.equal(read(dir, APPROVAL), `${JSON.stringify({ format: 1, inputs }, null, 2)}\n`, "[guards-14] [guards-15] one digest for each item and file of the guard, keys sorted, two-space indent, a final newline");

    const second = await spex(dir, ["verify"]);
    assert.equal(second.code, 0, `[guards-25] the guard then passes: ${second.stdout}`);
    assert.ok(block(second.stdout, GUARD).includes("  Approval: approved"), "[guards-19]");
  });

  it("guards-30: spex approve writes the record though a check would fail", async () => {
    const dir = await project({ [`${BINDING}/binding.mjs`]: "this is not a module\n" }, { approve: false });
    const approved = await spex(dir, ["approve", GUARD]);
    assert.equal(approved.code, 0, "[guards-16] no check runs, so a module that cannot load does not stop an approval");
    assert.ok(existsSync(join(dir, APPROVAL)));
  });

  it("guards-30: an item edited, a reading added and a file gone are named until approved again", async () => {
    const dir = await project();
    write(dir, "specs/packages/entitlements.md", swap(SPEC, "the module shall refuse the use.", "the module shall refuse that use."));
    write(dir, `${READINGS}/c.yaml`, READING_A);
    write(dir, `${BINDING}/notes.md`, null);
    const record = read(dir, APPROVAL);

    const ran = await spex(dir, ["verify"]);
    const lines = block(ran.stdout, GUARD);
    const named = `changed: item entitlements-1; added: file ${READINGS}/c.yaml; gone: file ${BINDING}/notes.md`;
    assert.ok(lines.includes(`  Approval: not approved — ${named}`), `[guards-19] the three inputs are named: ${ran.stdout}`);
    assert.ok(lines.includes(`    run spex approve ${GUARD} after reviewing`), "[guards-26]");
    assert.ok(lines.includes("  Examples against the readings: 2 examples, 3 readings, all as stated"), "[guards-17] the later steps run whatever the approval found");
    assert.equal(lines.at(-1), "  Does not pass — not approved");
    assert.equal(ran.code, 1, "[guards-27]");
    assert.equal(read(dir, APPROVAL), record, "[guards-28] spex verify leaves the record as it was");

    const approved = await spex(dir, ["approve", GUARD]);
    assert.equal(approved.code, 0, approved.stderr);
    assert.ok(
      approved.stdout.endsWith(
        `\nSince the last approval:\n  changed: item entitlements-1\n  added: file ${READINGS}/c.yaml\n  gone: file ${BINDING}/notes.md\nApproved ${GUARD} — commit ${APPROVAL}.\n`,
      ),
      `[guards-16] spex approve names the same three: ${approved.stdout}`,
    );
    const after = await spex(dir, ["verify"]);
    assert.equal(after.code, 0, `[guards-19] approved again: ${after.stdout}`);

    const again = await spex(dir, ["approve", GUARD]);
    assert.ok(again.stdout.endsWith(`\nNothing changed since the last approval.\nApproved ${GUARD} — commit ${APPROVAL}.\n`), "[guards-16] nothing changed is said so");
  });

  it("guards-30: a reading deleted alone, and a reading added alone, each leave the guard not approved", async () => {
    const less = await project();
    write(less, `${READINGS}/b.yaml`, null);
    const gone = await spex(less, ["verify"]);
    assert.ok(block(gone.stdout, GUARD).includes(`  Approval: not approved — gone: file ${READINGS}/b.yaml`), `[guards-19] an input in the record and no longer among the inputs: ${gone.stdout}`);
    assert.equal(block(gone.stdout, GUARD).at(-1), "  Does not pass — not approved", "[guards-25] one input gone is enough");
    assert.equal(gone.code, 1, "[guards-27]");

    const more = await project();
    write(more, `${READINGS}/c.yaml`, READING_A);
    const added = await spex(more, ["verify"]);
    assert.ok(block(added.stdout, GUARD).includes(`  Approval: not approved — added: file ${READINGS}/c.yaml`), `[guards-19] an input the record does not hold: ${added.stdout}`);
    assert.equal(block(added.stdout, GUARD).at(-1), "  Does not pass — not approved", "[guards-25] one input added is enough");
    assert.equal(added.code, 1, "[guards-27]");
  });

  it("guards-30: an item a guard's item cites is an input, and one none cites is not", async () => {
    const dir = await project();
    write(dir, "specs/packages/entitlements.md", swap(SPEC, "once for each seat.", "one time for each seat."));
    const uncited = await spex(dir, ["verify"]);
    assert.equal(uncited.code, 0, `[guards-2] [guards-14] entitlements-5 is cited by none of the guard's items: ${uncited.stdout}`);

    write(dir, "specs/packages/entitlements.md", swap(SPEC, "the suite shall see both uses pass", "the suite shall see the two uses pass"));
    const cited = await spex(dir, ["verify"]);
    assert.ok(block(cited.stdout, GUARD).includes("  Approval: not approved — changed: item entitlements-6"), `[guards-2] [guards-14] entitlements-6 is cited by the assertion item: ${cited.stdout}`);
    assert.equal(cited.code, 1);
  });

  it("guards-30: a guard file rewritten with CRLF line endings stays approved", async () => {
    const dir = await project();
    write(dir, GUARD_FILE, GUARD_YAML.replace(/\n/g, "\r\n"));
    write(dir, "specs/packages/entitlements.md", SPEC.replace(/\n/g, "\r\n"));
    const ran = await spex(dir, ["verify"]);
    assert.equal(ran.code, 0, `[guards-14] a digest is taken over the text with LF line endings: ${ran.stdout}`);
  });

  it("guards-30: a record that cannot be read leaves the guard not approved until approved again", async () => {
    const dir = await project();
    write(dir, APPROVAL, "{ not json");
    const ran = await spex(dir, ["verify"]);
    assert.ok(block(ran.stdout, GUARD).includes(`  Approval: not approved — ${APPROVAL}: not readable as JSON`), `[guards-19] ${ran.stdout}`);
    assert.equal(ran.code, 1);
    assert.equal(block(ran.stdout, GUARD).at(-1), "  Does not pass — not approved", "[guards-25]");
    assert.equal(read(dir, APPROVAL), "{ not json", "[guards-28] spex verify leaves the record as it was");
    const approved = await spex(dir, ["approve", GUARD]);
    assert.equal(approved.code, 0, approved.stderr);
    assert.ok(
      approved.stdout.endsWith(`\nThe last record cannot be read — ${APPROVAL}: not readable as JSON.\nApproved ${GUARD} — commit ${APPROVAL}.\n`),
      `[guards-16] spex approve says the record could not be read, and replaces it: ${approved.stdout}`,
    );
    assert.equal((await spex(dir, ["verify"])).code, 0, "[guards-16] the record is written anew");
  });
});

// ---------------------------------------------------------------
// guards-31: what the checks find
// ---------------------------------------------------------------

describe("guards-31: what the checks on the code find", { concurrency: 4 }, () => {
  it("guards-31: a defect the assertion forbids is Violated on the implementation, the same on a second run", async () => {
    // bob alone is let through, so no example meets the defect.
    const dir = await project({ [SRC]: swap(CODE, "if (left === 0) return null;", 'if (left === 0) return who === "bob" ? 0 : null;') });
    const before = snapshot(dir);
    const ran = await spex(dir, ["verify"]);
    assert.equal(ran.code, 1, "[guards-27] a guard that does not pass exits 1");
    const lines = block(ran.stdout, GUARD);
    const at = lines.indexOf("  On the code: Violated on the implementation");
    assert.ok(at > 0, `[guards-23] a violation comes first: ${ran.stdout}`);
    assert.match(lines[at + 1], /^ {4}found at sequence \d+ with seed 1, shrunk \d+ times?$/, "[guards-26] the failing sequence's number, the seed and the shrink count");
    assert.deepEqual(
      lines.slice(at + 2, at + 4),
      ["    1. use who=bob -> ok=true remaining=0", "       forbidden by every reading"],
      "[guards-22] [guards-26] the shrunk sequence with its params and observed effect, and the step every reading forbids",
    );
    assert.ok(!lines.some((line) => /sequences, \d+ in which/.test(line)), "[guards-26] the counts are for a sampled result alone");
    assert.ok(lines.some((line) => line.startsWith("    bounds: ")) && lines.some((line) => line.startsWith("    legal when ")), "[guards-26] every result names its bounds and legal conditions");
    assert.equal(lines.at(-1), "  Does not pass — the check on the code is Violated on the implementation", "[guards-25] [guards-26]");
    assert.ok(ran.stdout.endsWith("\n0 of 1 guards pass.\n"));

    const again = await spex(dir, ["verify"]);
    assert.equal(again.stdout, ran.stdout, "[guards-28] a second run prints the same report");
    assert.equal(again.code, 1);
    assert.deepEqual(snapshot(dir), before, "[guards-28] neither run leaves a file in the project");
  });

  it("guards-31: a defect a permitted example meets is a violation found in that example", async () => {
    const ran = await verified({ [SRC]: swap(CODE, "if (left === 0) return null;", "if (left === 0) return 0;") });
    const at = ran.lines.indexOf("  On the code: Violated on the implementation");
    assert.ok(at > 0, `[guards-21] [guards-23] ${ran.stdout}`);
    assert.deepEqual(
      ran.lines.slice(at + 1, at + 6),
      [
        "    found in example entitlements-3",
        "    1. grant who=ann count=1 -> ok=true holders={ann}",
        "    2. use who=ann -> ok=true remaining=0",
        "    3. use who=ann -> ok=true remaining=0",
        "       forbidden by every reading",
      ],
      "[guards-21] every reading forbids the example's last step on the code",
    );
    assert.equal(ran.code, 1);
  });

  it("guards-31: a violation is found though a reading's next state would leave its range at that step", async () => {
    // Reading a counts the uses let through without a seat, which it
    // holds can never be: the defect takes that count out of its range
    // at the very step every reading forbids.
    const counting = swap(
      swap(READING_A, "state:\n", "state:\n  over: { type: int 0..0, start: 0 }\n"),
      "  use:\n    then:\n",
      '  use:\n    then:\n      over: "if effect.ok and left[who] == 0 then over + 1 else over"\n',
    );
    const ran = await verified({
      [SRC]: swap(CODE, "if (left === 0) return null;", 'if (left === 0) return who === "bob" ? 0 : null;'),
      [`${READINGS}/a.yaml`]: counting,
    });
    const at = ran.lines.indexOf("  On the code: Violated on the implementation");
    assert.ok(at > 0, `[guards-22] [guards-23] whether a step is forbidden is found before any next state: ${ran.stdout}`);
    assert.deepEqual(
      ran.lines.slice(at + 2, at + 4),
      ["    1. use who=bob -> ok=true remaining=0", "       forbidden by every reading"],
      "[guards-26] with its sequence",
    );
    assert.ok(!ran.stdout.includes("a reading error"), "[guards-7] no next state is read after a violation");
    assert.ok(ran.lines.some((line) => /^ {2}Kept fault revoke-keeps: caught at sequence \d+$/.test(line)), `[guards-24] and the kept fault is caught the same way: ${ran.stdout}`);
    assert.equal(ran.code, 1);
  });

  it("guards-31: bounds under which the assertion never applies give Inconclusive", async () => {
    const ran = await verified({ [GUARD_FILE]: swap(GUARD_YAML, SAMPLE, "sample: { sequences: 1, events: 3, seed: 1, seconds: 30 }") });
    const at = ran.lines.indexOf("  On the code: Inconclusive");
    assert.ok(at > 0, `[guards-23] ${ran.stdout}`);
    assert.equal(ran.lines[at + 1], "    no sequence in which the assertion applied", "[guards-23] [guards-26] which finding it was");
    assert.ok(ran.lines.includes("  Examples against the readings: 2 examples, 2 readings, all as stated"), "[guards-20] the examples show the behavior all the same");
    assert.ok(ran.lines.at(-1)!.startsWith("  Does not pass — the check on the code is Inconclusive"), "[guards-25]");
    assert.equal(ran.code, 1);
  });

  it("guards-31: a step of a permitted example the readings differ on is an undecided step", async () => {
    // Reading b also holds that a use with one seat left passes, so at
    // the example's second step the assertion applies for b alone.
    const ran = await verified({ [`${READINGS}/b.yaml`]: `${READING_A}  - on: use\n    when: "left[who] == 1"\n    shall: "effect.ok"\n` });
    assert.ok(ran.lines.includes("  Examples against the readings: 2 examples, 2 readings, all as stated"), `[guards-20] each reading alone finds the examples as stated: ${ran.stdout}`);
    const at = ran.lines.indexOf("  On the code: Inconclusive");
    assert.ok(at > 0, `[guards-23] ${ran.stdout}`);
    assert.deepEqual(
      ran.lines.slice(at + 1, at + 5),
      [
        "    an undecided step in example entitlements-3: the readings differ on whether the assertion applies",
        "    1. grant who=ann count=1 -> ok=true holders={ann}",
        "    2. use who=ann -> ok=true remaining=0",
        "       applies — a: no, b: yes",
      ],
      "[guards-21] [guards-26] the example, the sequence up to the step and each reading's finding",
    );
    assert.equal(ran.code, 1);
  });

  it("guards-31: a permitted example stating an effect the code does not produce is a Disagreement with the model", async () => {
    const ran = await verified({ [GUARD_FILE]: swap(GUARD_YAML, "effect: { ok: true, remaining: 0 } }\n      - { event: use, params: { who: ann }, effect: { ok: false", "effect: { ok: true, remaining: 1 } }\n      - { event: use, params: { who: ann }, effect: { ok: false") });
    const at = ran.lines.indexOf("  On the code: Disagreement with the model");
    assert.ok(at > 0, `[guards-23] ${ran.stdout}`);
    assert.equal(ran.lines[at + 1], "    example entitlements-3, step 2, field remaining: stated 1, observed 0", "[guards-21] [guards-26] the example, the step, the field and both values");
    assert.ok(ran.lines.includes("  Examples against the readings: 2 examples, 2 readings, all as stated"), "[guards-20] the readings read no such field at that step");
    assert.equal(ran.lines.at(-1), "  Does not pass — the check on the code is Disagreement with the model");
    assert.equal(ran.code, 1);
  });

  it("guards-31: an example that shows the protected behavior against the readings and not on the code is a disagreement", async () => {
    // As stated the grant is refused, so the use that follows meets the
    // assertion; the code grants, so it does not.
    const steps = `      - { event: grant, params: { who: ann, count: 2 }, effect: { ok: false } }
      - { event: use, params: { who: ann }, effect: { ok: false, remaining: null } }
`;
    const ran = await verified({ [GUARD_FILE]: swap(GUARD_YAML, PERMITTED_STEPS, steps) });
    const at = ran.lines.indexOf("  On the code: Disagreement with the model");
    assert.ok(at > 0, `[guards-23] ${ran.stdout}`);
    assert.ok(ran.lines.includes("    example entitlements-3, step 1, field ok: stated false, observed true"), "[guards-21]");
    assert.ok(ran.lines.includes("    example entitlements-3 shows the protected behavior against the readings and not on the code"), "[guards-21]");
  });

  it("guards-31: readings that differ on whether an event is legal give Inconclusive, the event not caused", async () => {
    const ran = await verified({ [`${READINGS}/b.yaml`]: swap(READING_B, `legal: "${REVOKE_LEGAL}"`, 'legal: "true"') });
    const at = ran.lines.indexOf("  On the code: Inconclusive");
    assert.ok(at > 0, `[guards-23] ${ran.stdout}`);
    assert.match(ran.lines[at + 1], /^ {4}an undecided event at sequence \d+: the readings differ on whether it is legal$/, "[guards-22] [guards-26] which finding it was");
    const end = ran.lines.indexOf("       legal — a: no, b: yes");
    assert.ok(end > at, `[guards-26] each reading's finding: ${ran.stdout}`);
    assert.match(ran.lines[end - 1], /^ {4}\d+\. revoke who=(ann|bob) \(not caused\)$/, "[guards-22] the event is not caused, and the sequence is given up to it");
    for (const line of ran.lines.slice(at + 2, end - 1)) assert.match(line, /^ {4}\d+\. \w+ .* -> /, "[guards-26] each step before it with its observed effect");
    assert.ok(ran.lines.at(-1)!.startsWith("  Does not pass — the check on the code is Inconclusive"), "[guards-25]");
    assert.equal(ran.code, 1);
  });

  it("guards-31: readings that differ on whether an effect is forbidden give Inconclusive with the undecided step", async () => {
    const ran = await verified({ [`${READINGS}/b.yaml`]: reading(WHEN_A, "not effect.ok and who != 'bob'") });
    const at = ran.lines.indexOf("  On the code: Inconclusive");
    assert.ok(at > 0, `[guards-23] ${ran.stdout}`);
    assert.ok(ran.lines.includes("  Examples against the readings: 2 examples, 2 readings, all as stated"), "[guards-20] the examples speak of ann alone");
    assert.match(ran.lines[at + 1], /^ {4}an undecided step at sequence \d+: the readings differ on whether the effect is forbidden$/, "[guards-7] [guards-22]");
    const end = ran.lines.indexOf("       forbidden — a: no, b: yes");
    assert.ok(end > at, `[guards-26] each reading's finding: ${ran.stdout}`);
    assert.equal(ran.lines[end - 1].replace(/^ {4}\d+/, "N"), "N. use who=bob -> ok=false remaining=none", "[guards-22] the step was caused and judged");
    assert.equal(ran.code, 1);
  });

  it("guards-31: a forbidden example a reading does not forbid is listed, and the result is Inconclusive", async () => {
    const ran = await verified({ [`${READINGS}/b.yaml`]: reading(WHEN_A, "true") });
    const at = ran.lines.indexOf("  Examples against the readings: 2 examples, 2 readings, 1 not as stated");
    assert.ok(at > 0, `[guards-20] ${ran.stdout}`);
    assert.equal(ran.lines[at + 1], "    entitlements-4, reading b: the last step is not forbidden", "[guards-20] [guards-26] the failure names its example, reading and step");
    assert.equal(ran.lines[at + 2], "  On the code: Inconclusive", "[guards-23]");
    assert.equal(ran.lines[at + 3], "    the examples do not agree with the readings", "[guards-26] which finding it was");
    const reasons = ran.lines.at(-1)!;
    assert.ok(reasons.startsWith("  Does not pass — "), "[guards-25]");
    assert.ok(reasons.includes("examples do not agree with the readings") && reasons.includes("the check on the code is Inconclusive"), `[guards-25] ${reasons}`);
    assert.equal(ran.code, 1);
  });

  it("guards-31: a permitted example a reading forbids, and one with a step not legal, are listed", async () => {
    const forbids = await verified({ [`${READINGS}/b.yaml`]: reading("true", "not effect.ok") });
    assert.ok(forbids.lines.includes("    entitlements-3, reading b: step 2 is forbidden"), `[guards-20] ${forbids.stdout}`);
    const notLegal = await verified({ [`${READINGS}/b.yaml`]: swap(READING_B, "  use:\n    then:", '  use:\n    legal: "left[who] > 0"\n    then:') });
    assert.ok(notLegal.lines.includes("    entitlements-3, reading b: step 3 is not legal"), `[guards-20] ${notLegal.stdout}`);
  });
});

// ---------------------------------------------------------------
// guards-32: kept faults
// ---------------------------------------------------------------

describe("guards-32: kept faults", { concurrency: 4 }, () => {
  it("guards-32: a hunk that lines added above have moved still applies, and a CRLF file keeps its line endings", async () => {
    // The module refuses to start unless every line of the copied
    // source ends in CRLF, so a patched file that lost them fails.
    const checking = swap(
      BINDING_MJS,
      "export function start() {\n",
      'import { readFileSync } from "node:fs";\n\nexport function start() {\n  const source = readFileSync(new URL("../../../src/entitlements.mjs", import.meta.url), "utf8");\n  if (/[^\\r]\\n/.test(source) || !source.includes("\\r\\n")) throw new Error("a line lost its CRLF");\n',
    );
    const moved = `// one\n// two\n// three\n// four\n// five\n${CODE}`.replace(/\n/g, "\r\n");
    const ran = await verified({ [SRC]: moved, [`${BINDING}/binding.mjs`]: checking });
    assert.equal(ran.code, 0, `[guards-11] the patch applies at the nearest place its lines match: ${ran.stdout}`);
    assert.ok(ran.lines.some((line) => /^ {2}Kept fault revoke-keeps: caught at sequence \d+$/.test(line)), "[guards-11] [guards-24] and the fault is caught, the patched file still CRLF");
    assert.equal(read(ran.dir, SRC), moved, "[guards-12] [guards-28] the file the patch names is as it was in the project");
  });

  it("guards-32: a patch whose context matches nowhere does not apply, so the fault is not caught", async () => {
    const dir = await project({ [FAULT_FILE]: swap(FAULT, " export function revoke(store, who) {", " export function withdraw(store, who) {") });
    const before = snapshot(dir);
    const ran = await spex(dir, ["verify"]);
    const lines = block(ran.stdout, GUARD);
    assert.ok(lines.includes(`  Kept fault revoke-keeps: not caught — the patch does not apply: the change at line 14 of ${SRC} matches nowhere in the file`), `[guards-11] [guards-24] ${ran.stdout}`);
    assert.ok(lines.includes("  On the code: Sampled on the implementation"), "[guards-17] the project's code is checked all the same");
    assert.equal(lines.at(-1), "  Does not pass — kept fault revoke-keeps not caught", "[guards-25]");
    assert.equal(ran.code, 1, "[guards-27]");
    assert.deepEqual(snapshot(dir), before, "[guards-28]");
  });

  it("guards-32: a patch naming a file that was not copied does not apply", async () => {
    const ran = await verified({ [FAULT_FILE]: FAULT.replaceAll("src/entitlements.mjs", "src/seats.mjs") });
    assert.ok(ran.lines.includes("  Kept fault revoke-keeps: not caught — the patch does not apply: src/seats.mjs is not among the copied files"), `[guards-11] [guards-24] ${ran.stdout}`);
    assert.equal(ran.lines.at(-1), "  Does not pass — kept fault revoke-keeps not caught", "[guards-25]");
  });

  it("guards-32: a patch naming a file outside the binding's files, its own module or an installed dependency cannot be checked, and changes nothing", async () => {
    // The module's own check of who holds a seat, turned off: applied,
    // it would be caught without any defect in the code.
    const onBinding = `diff --git a/${BINDING}/binding.mjs b/${BINDING}/binding.mjs\n--- a/${BINDING}/binding.mjs\n+++ b/${BINDING}/binding.mjs\n@@ -20,3 +20,3 @@\n     const remaining = use(store, who);\n-    return { ok: remaining !== null, remaining };\n+    return { ok: true, remaining };\n   },\n`;
    assert.equal(
      await cannot({ [FAULT_FILE]: onBinding }),
      `${FAULT_FILE}: ${BINDING}/binding.mjs is not among the binding's files`,
      "[guards-11] [guards-18] a kept fault is a defect in the code, never in the binding",
    );

    // In a copy, node_modules is a link to the project's own.
    const dependency = "node_modules/tiny-clamp/index.js";
    const onDependency = `--- a/${dependency}\n+++ b/${dependency}\n@@ -1 +1 @@\n-export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));\n+export const clamp = (n) => n;\n`;
    assert.equal(
      await cannot({ [FAULT_FILE]: onDependency }),
      `${FAULT_FILE}: ${dependency} is not among the binding's files`,
      "[guards-11] [guards-18] [guards-28] a patch reaches no installed dependency of the project",
    );

    assert.equal(
      await cannot({ "lib/entitlements.mjs": CODE, [FAULT_FILE]: FAULT.replaceAll("src/entitlements.mjs", "lib/entitlements.mjs") }),
      `${FAULT_FILE}: lib/entitlements.mjs is not among the binding's files`,
      "[guards-11] [guards-18] a project file the binding's files do not name",
    );
  });

  it("guards-32: a patch that leaves every copied file as it was changes nothing, so the fault is not caught", async () => {
    const same = `diff --git a/${SRC} b/${SRC}\n--- a/${SRC}\n+++ b/${SRC}\n@@ -16,3 +16,3 @@\n   store.delete(who);\n-  return held;\n+  return held;\n }\n`;
    const ran = await verified({ [FAULT_FILE]: same });
    assert.ok(ran.lines.includes("  Kept fault revoke-keeps: not caught — the patch changes nothing"), `[guards-11] [guards-24] ${ran.stdout}`);
    assert.equal(ran.lines.at(-1), "  Does not pass — kept fault revoke-keeps not caught");
    assert.equal(ran.code, 1);
  });

  it("guards-32: a patch whose change the assertion does not forbid is not caught in the bound's sequences", async () => {
    const harmless = `diff --git a/${SRC} b/${SRC}\n--- a/${SRC}\n+++ b/${SRC}\n@@ -16,3 +16,3 @@\n   store.delete(who);\n-  return held;\n+  return true;\n }\n`;
    const ran = await verified({ [FAULT_FILE]: harmless });
    assert.ok(ran.lines.includes("  Kept fault revoke-keeps: not caught — no violation in 100 sequences"), `[guards-24] ${ran.stdout}`);
    assert.equal(ran.code, 1);
  });

  it("guards-32: a guard with no kept fault does not pass", async () => {
    const ran = await verified({ [`guards/${GUARD}/faults`]: null });
    assert.ok(ran.lines.includes("  On the code: Sampled on the implementation"));
    assert.equal(ran.lines.at(-1), "  Does not pass — no kept fault", `[guards-25] ${ran.stdout}`);
    assert.equal(ran.code, 1);
  });

  it("guards-32: every kept fault is checked, in name order", async () => {
    const second = `Using a seat costs nothing.\n\ndiff --git a/${SRC} b/${SRC}\n--- a/${SRC}\n+++ b/${SRC}\n@@ -23,3 +23,3 @@\n   if (left === 0) return null;\n-  store.set(who, left - 1);\n+  store.set(who, left);\n   return left - 1;\n`;
    const ran = await verified({ [`guards/${GUARD}/faults/free-use.patch`]: second });
    assert.equal(ran.code, 0, `[guards-24] both faults are caught: ${ran.stdout}`);
    const faults = ran.lines.filter((line) => line.startsWith("  Kept fault "));
    assert.deepEqual(faults.map((line) => line.replace(/\d+$/, "N")), ["  Kept fault free-use: caught at sequence N", "  Kept fault revoke-keeps: caught at sequence N"], "[guards-24] every kept fault, in name order");
  });

  it("guards-32: one kept fault caught and one not: the guard does not pass and names the one not caught, each on a copy of its own", async () => {
    // Checked after revoke-keeps, and harmless: on a copy that still
    // held that fault it would be found caught.
    const harmless = `diff --git a/${SRC} b/${SRC}\n--- a/${SRC}\n+++ b/${SRC}\n@@ -26,3 +26,3 @@\n export function left(store, who) {\n-  return store.get(who) ?? 0;\n+  return store.get(who) || 0;\n }\n`;
    const ran = await verified({ [`guards/${GUARD}/faults/same-left.patch`]: harmless });
    const faults = ran.lines.filter((line) => line.startsWith("  Kept fault "));
    assert.deepEqual(
      faults.map((line) => line.replace(/sequence \d+$/, "sequence N")),
      ["  Kept fault revoke-keeps: caught at sequence N", "  Kept fault same-left: not caught — no violation in 100 sequences"],
      `[guards-12] [guards-24] one copy for each kept fault: ${ran.stdout}`,
    );
    assert.equal(ran.lines.at(-1), "  Does not pass — kept fault same-left not caught", "[guards-25] every kept fault must be caught, and the one that is not is named");
    assert.equal(ran.code, 1, "[guards-27]");
    assert.ok(ran.stdout.endsWith("\n0 of 1 guards pass.\n"));
  });

  it("guards-32: a kept fault the readings disagree on is not caught", async () => {
    // The fault shows only after a revoke. Reading b finds no revoke
    // legal, so none is caused; the forbidden example here needs none.
    const forbidden = "  - item: entitlements-4\n    kind: forbidden\n    steps:\n      - { event: use, params: { who: ann }, effect: { ok: true, remaining: 0 } }\n";
    const ran = await verified({
      [GUARD_FILE]: swap(GUARD_YAML, FORBIDDEN_EXAMPLE, forbidden),
      [`${READINGS}/b.yaml`]: swap(READING_B, `legal: "${REVOKE_LEGAL}"`, 'legal: "false"'),
    });
    assert.ok(ran.lines.includes("  Examples against the readings: 2 examples, 2 readings, all as stated"), `[guards-20] ${ran.stdout}`);
    assert.ok(ran.lines.includes("  Kept fault revoke-keeps: not caught — the readings disagreed"), `[guards-24] an undecided event and no violation: ${ran.stdout}`);
    assert.equal(ran.lines.at(-1), "  Does not pass — the check on the code is Inconclusive; kept fault revoke-keeps not caught", "[guards-25]");
    assert.equal(ran.code, 1);
  });
});

// ---------------------------------------------------------------
// guards-33: a failing binding, a file from outside the copy, a timeout
// ---------------------------------------------------------------

describe("guards-33: a binding that fails", { concurrency: 4 }, () => {
  const inconclusive = (ran: { lines: string[]; code: number | null; stdout: string }, finding: string | RegExp): void => {
    const at = ran.lines.indexOf("  On the code: Inconclusive");
    assert.ok(at > 0, `[guards-23] ${ran.stdout}`);
    const line = ran.lines[at + 1];
    // A failing binding is the finding of guards-36.
    const tags = String(finding).includes("a failing binding") ? "[guards-36] [guards-26]" : "[guards-26]";
    if (typeof finding === "string") assert.equal(line, `    ${finding}`, `${tags} which finding it was and its cause: ${ran.stdout}`);
    else assert.match(line, finding, `${tags} ${ran.stdout}`);
    assert.equal(ran.code, 1, "[guards-27]");
  };

  it("guards-33: an event function that throws is a failing binding", async () => {
    const ran = await verified({ [`${BINDING}/binding.mjs`]: swap(BINDING_MJS, "    const remaining = use(store, who);", '    if (who === "bob") throw new Error("no seat for bob");\n    const remaining = use(store, who);') });
    inconclusive(ran, "a failing binding: use threw: no seat for bob");
    assert.ok(ran.lines.at(-1)!.includes("the check on the code is Inconclusive"), "[guards-25]");
  });

  it("guards-33: an effect with a value out of its type is a failing binding", async () => {
    const ran = await verified({ [`${BINDING}/binding.mjs`]: swap(BINDING_MJS, "return { ok: remaining !== null, remaining };", "return { ok: remaining !== null, remaining: remaining === null ? null : 9 };") });
    inconclusive(ran, "a failing binding: use returned what is not its declared effect: remaining: expected int 0..3?, found 9");
  });

  it("guards-33: an effect with a field too many, or one missing, is a failing binding", async () => {
    const more = await verified({ [`${BINDING}/binding.mjs`]: swap(BINDING_MJS, "return { ok: revoke(store, who) };", "return { ok: revoke(store, who), extra: 1 };") });
    inconclusive(more, "a failing binding: revoke returned what is not its declared effect: 'extra' is not declared");
    const fewer = await verified({ [`${BINDING}/binding.mjs`]: swap(BINDING_MJS, "return { ok: remaining !== null, remaining };", "return { ok: remaining !== null };") });
    inconclusive(fewer, "a failing binding: use returned what is not its declared effect: no value for 'remaining'");
  });

  it("guards-33: a command that ends with a non-zero status is a failing binding", async () => {
    const ran = await verified({
      "scripts/fail.mjs": 'console.error("the build is broken");\nprocess.exit(3);\n',
      [`${BINDING}/binding.yaml`]: `${swap(BINDING_YAML, "  - src\n", "  - src\n  - scripts\n")}commands:\n  - [node, scripts/fail.mjs]\n`,
    });
    inconclusive(ran, "a failing binding: command 1 (node scripts/fail.mjs) ended with status 3: the build is broken");
    assert.ok(ran.lines.includes("  Kept fault revoke-keeps: not caught — the binding failed: command 1 (node scripts/fail.mjs) ended with status 3: the build is broken"), "[guards-24] [guards-36] a failing binding never counts as catching a fault");
  });

  it("guards-33: a module that does not load, or lacks a function, is a failing binding", async () => {
    const broken = await verified({ [`${BINDING}/binding.mjs`]: 'import "./not-there.mjs";\n' });
    inconclusive(broken, /^ {4}a failing binding: binding\.mjs does not load: /);
    const lacking = await verified({ [`${BINDING}/binding.mjs`]: swap(BINDING_MJS, "  revoke(store, { who }) {\n    return { ok: revoke(store, who) };\n  },\n", "") });
    inconclusive(lacking, "a failing binding: binding.mjs exports no function for event revoke");
  });

  it("guards-33: a kept fault whose copy's binding fails is not caught, the binding having failed", async () => {
    const throwing = `diff --git a/${SRC} b/${SRC}\n--- a/${SRC}\n+++ b/${SRC}\n@@ -16,3 +16,3 @@\n   store.delete(who);\n-  return held;\n+  throw new Error("the store is gone");\n }\n`;
    const ran = await verified({ [FAULT_FILE]: throwing });
    assert.ok(ran.lines.includes("  On the code: Sampled on the implementation"));
    assert.ok(ran.lines.includes("  Kept fault revoke-keeps: not caught — the binding failed: revoke threw: the store is gone"), `[guards-24] [guards-36] a call that throws in the fault's copy is a failing binding there: ${ran.stdout}`);
    assert.equal(ran.code, 1);
  });

  it("guards-33: a module importing a project file by a path that leads out of the copy is named", async () => {
    const dir = await project({}, { approve: false });
    const outside = pathToFileURL(join(dir, "src", "entitlements.mjs")).href;
    write(dir, `${BINDING}/binding.mjs`, swap(BINDING_MJS, '"../../../src/entitlements.mjs"', JSON.stringify(outside)));
    assert.equal((await spex(dir, ["approve", GUARD])).code, 0);
    const ran = await spex(dir, ["verify"]);
    const lines = block(ran.stdout, GUARD);
    inconclusive({ lines, code: ran.code, stdout: ran.stdout }, `a project file loaded from outside the copy: ${SRC}`);
    assert.ok(lines.includes(`  Kept fault revoke-keeps: not caught — a project file was loaded from outside the copy: ${SRC}`), "[guards-13] the fault's copy would have run the project's own file");
  });

  it("guards-33: an event that never returns is stopped at the time limit, a timeout", async () => {
    const ran = await verified({
      [`${BINDING}/binding.mjs`]: swap(BINDING_MJS, "    const remaining = use(store, who);", "    await new Promise(() => {});\n    const remaining = use(store, who);"),
      [GUARD_FILE]: swap(GUARD_YAML, "seconds: 30", "seconds: 1"),
    });
    inconclusive(ran, "a timeout: not done after 1 second");
    assert.ok(ran.lines.includes("  Kept fault revoke-keeps: not caught — a timeout: not done after 1 second"), "[guards-24]");
  });

  it("guards-33: a command that never ends is stopped at the time limit, a timeout", async () => {
    const ran = await verified({
      "scripts/wait.mjs": "setInterval(() => {}, 1000);\n",
      [`${BINDING}/binding.yaml`]: `${swap(BINDING_YAML, "  - src\n", "  - src\n  - scripts\n")}commands:\n  - [node, scripts/wait.mjs]\n`,
      [GUARD_FILE]: swap(GUARD_YAML, "seconds: 30", "seconds: 1"),
    });
    inconclusive(ran, "a timeout: not done after 1 second");
  });

  it("guards-33: a command that leaves a process running, holding its output open, keeps no run waiting, and the process is stopped", { skip: process.platform === "win32" }, async () => {
    const dir = await project({
      "scripts/leave.mjs": LEAVES,
      [`${BINDING}/binding.yaml`]: `${swap(BINDING_YAML, "  - src\n", "  - src\n  - scripts\n")}commands:\n  - [node, scripts/leave.mjs]\n`,
    });
    const pids = `${dir}.left`;
    const ran = await spex(dir, ["verify"], { env: { SPEX_TEST_PIDS: pids } });
    assert.equal(ran.code, 0, `[guards-12] the command ended, so the run went on and the guard passes: ${ran.stdout}`);
    const left = readFileSync(pids, "utf8").trim().split("\n").map(Number);
    assert.equal(left.length, 2, "[guards-12] the command ran in the project's copy and in the kept fault's");
    for (const pid of left) await untilGone(pid);
  });

  it("guards-33: code that leaves a process running is stopped with the copy's process at the time limit", { skip: process.platform === "win32" }, async () => {
    // The module starts the process, then an event never returns.
    const leaving = swap(
      swap(BINDING_MJS, "export function start() {\n", `${LEAVES}\nexport function start() {\n`),
      "    const remaining = use(store, who);",
      "    await new Promise(() => {});\n    const remaining = use(store, who);",
    );
    const dir = await project({ [`${BINDING}/binding.mjs`]: leaving, [GUARD_FILE]: swap(GUARD_YAML, "seconds: 30", "seconds: 1") });
    const pids = `${dir}.left`;
    const ran = await spex(dir, ["verify"], { env: { SPEX_TEST_PIDS: pids } });
    inconclusive({ lines: block(ran.stdout, GUARD), code: ran.code, stdout: ran.stdout }, "a timeout: not done after 1 second");
    const left = readFileSync(pids, "utf8").trim().split("\n").map(Number);
    assert.equal(left.length, 2, "[guards-12] one copy's process for the project's code and one for the kept fault");
    for (const pid of left) await untilGone(pid);
  });

  it("guards-33: an event that declares no effect may return nothing", async () => {
    const dir = await project({ ...CALC, "guards/bindings/calc/binding.mjs": swap(CALC_BINDING_MJS, "rest: () => ({}),", "rest: () => {},") }, { approve: false });
    const ran = await spex(dir, ["verify", "calc-2"]);
    const lines = block(ran.stdout, "calc-2");
    assert.ok(lines.includes("  On the code: Sampled on the implementation"), `[guards-5] returning nothing is no failing binding where no effect is declared: ${ran.stdout}`);
    assert.ok(lines.some((line) => /^ {4}rest: caused [1-9]\d*, skipped 0$/.test(line)), `[guards-3] [guards-22] the event was caused: ${ran.stdout}`);
  });

  it("guards-33: a module that ends its process is a failing binding", async () => {
    const ran = await verified({ [`${BINDING}/binding.mjs`]: swap(BINDING_MJS, "export function start() {\n", "export function start() {\n  process.exit(7);\n") });
    inconclusive(ran, "a failing binding: the process ended before the checks did (status 7)");
  });

  it("guards-33: a process that ends before its result names the cause it gave, not Node's version or a stack line", async () => {
    const crashing = await verified({ [`${BINDING}/binding.mjs`]: swap(BINDING_MJS, "return { ok: revoke(store, who) };", 'return { get ok() { throw new Error("the getter broke"); } };') });
    inconclusive(crashing, "a failing binding: the process ended before the checks did (status 1): Error: the getter broke");

    const command = await verified({
      "scripts/crash.mjs": "null.x;\n",
      [`${BINDING}/binding.yaml`]: `${swap(BINDING_YAML, "  - src\n", "  - src\n  - scripts\n")}commands:\n  - [node, scripts/crash.mjs]\n`,
    });
    inconclusive(command, "a failing binding: command 1 (node scripts/crash.mjs) ended with status 1: TypeError: Cannot read properties of null (reading 'x')");
  });
});

// ---------------------------------------------------------------
// guards-34: the language, and guards that cannot be checked
// ---------------------------------------------------------------

const CALC_BINDING_YAML = `format: 1
values:
  user: [ann, bob, cy]
  tier: [low, high]
events:
  probe:
    params: { n: int 0..9, who: user?, group: set of user, weight: map user to int 0..9, flag: bool, picks: set of int 1..5 }
    effect: { total: int 0..99, pick: user?, seen: set of user, kept: set of int 1..5 }
  rest:
files:
  - calc.mjs
`;

const CALC_BINDING_MJS = `import { twice } from "../../../calc.mjs";

export const start = () => ({});
export const events = {
  probe: (state, { n, who, group, picks }) => ({ total: twice(n) + 1, pick: who, seen: group, kept: [...picks].reverse() }),
  rest: () => ({}),
};
`;

/** One rule for each thing the language must get right: true only
 * with the grouping and the value guards-8 and guards-9 give. These
 * hold whatever the probe is given. */
const ALWAYS: readonly string[] = [
  // literals and names
  "true and not false",
  "none == min({})",
  "12 == 3 * 4",
  "'bob' in user and 'high' in tier",
  "{} == {u in user: false}",
  "{'cy', 'ann'} == {'ann', 'cy'}",
  "size(user) == 3 and size({}) == 0",
  "count >= 0 and effect.total >= 0",
  // grouping, loosest to tightest
  "if true then true else false and false",
  "(all u in user: u == 'ann' or u != 'ann') and (any u in user: false or u == 'cy')",
  "(map u in user: 1 + 1)['bob'] == 2",
  "false implies false implies false",
  "(true implies false) == false",
  "true or false and false",
  "not true or true",
  "not (false or false)",
  "1 + 2 < 4",
  "1 in {1} == true",
  "2 in {1} union {2}",
  "{1, 2} union {3} minus {1} == {2, 3}",
  "{1, 2} union {2, 3} intersect {3} == {1, 2, 3}",
  "10 - 4 - 3 == 3",
  "2 + 3 * 4 == 14",
  "-2 + 5 == 3",
  "-(2 + 5) * 2 == -14",
  "(2 + 3) * 4 == 20",
  // comparisons, by number and by declared order
  "1 != 2 and 1 <= 1 and 2 >= 2 and 2 > 1",
  "'ann' < 'bob' and 'cy' > 'bob' and 'low' <= 'high' and 'bob' >= 'bob'",
  // functions and the other forms
  "max({3, 1, 2}) == 3 and min({3, 1, 2}) == 1",
  "default(min({}), 7) == 7 and default(max({4}), 7) == 4",
  "{k in {1, 2, 3}: k * 2 > 2} == {2, 3}",
  "not (none in group) and (who == none or who in user)",
  // the observed effect
  "effect.total == n * 2 + 1",
  "effect.pick == who and effect.seen == group",
  "effect.kept == picks and size(picks) <= 5 and (all k in picks: k >= 1 and k <= 5)",
];

/** When the probe is given what the examples give it. */
const GIVEN = "n == 3 and who == 'ann' and flag and group == {'bob', 'ann'} and weight == (map u in user: if u == 'ann' then 1 else 0)";

/** Rules on the params the examples give. */
const WHEN_GIVEN: readonly string[] = [
  "weight['ann'] + 1 == 2",
  "who != none and none != who",
  "who in group and not ('cy' in group)",
  "size(group) == 2 and min(group) == 'ann' and max(group) == 'bob'",
  "default(who, 'cy') == 'ann'",
  "(if flag then 1 else 2) == 1",
  "all u in group: weight[u] <= 1",
  "not (all u in user: weight[u] == 1)",
  "any u in user: weight[u] == 1",
  "{u in user: weight[u] == 0} == {'bob', 'cy'}",
];

const rule = (shall: string, when?: string): string =>
  `  - on: probe\n${when === undefined ? "" : `    when: ${JSON.stringify(when)}\n`}    shall: ${JSON.stringify(shall)}\n`;

const CALC_READING = `format: 1
state:
  count: { type: int 0..9, start: 0 }
  last: { type: user?, start: null }
events:
  probe:
    legal: "n < 9"
    then:
      count: "if count < 9 then count + 1 else count"
      last: "effect.pick"
assertion:
${ALWAYS.map((shall) => rule(shall)).join("")}${WHEN_GIVEN.map((shall) => rule(shall, GIVEN)).join("")}  - on: [probe, rest]
    when: "count > 0"
    shall: "last == none or default(last, 'cy') in user"
`;

const CALC_PARAMS = "params: { n: 3, who: ann, group: [bob, ann], weight: { ann: 1, bob: 0, cy: 0 }, flag: true, picks: [3, 1] }";
const CALC_GUARD = `format: 1
binding: calc
sample: { sequences: 40, events: 4, seed: 7, seconds: 30 }
examples:
  - item: calc-3
    kind: permitted
    steps:
      - { event: probe, ${CALC_PARAMS}, effect: { total: 7, pick: ann, seen: [ann, bob], kept: [1, 3] } }
      - { event: rest }
      - { event: probe, ${CALC_PARAMS}, effect: { total: 7, pick: ann, seen: [ann, bob], kept: [1, 3] } }
  - item: calc-4
    kind: forbidden
    steps:
      - { event: probe, ${CALC_PARAMS}, effect: { total: 8, pick: ann, seen: [ann, bob], kept: [1, 3] } }
`;

const CALC: Change = {
  "calc.mjs": "export const twice = (n) => n * 2;\n",
  "guards/bindings/calc/binding.yaml": CALC_BINDING_YAML,
  "guards/bindings/calc/binding.mjs": CALC_BINDING_MJS,
  "guards/calc-2/guard.yaml": CALC_GUARD,
  "guards/calc-2/readings/a.yaml": CALC_READING,
};

describe("guards-34: the language, and a guard that cannot be checked", { concurrency: 4 }, () => {
  it("guards-34: examples agree with a reading only if every form of the language has its grouping and value", async () => {
    const dir = await project(CALC, { approve: false });
    const ran = await spex(dir, ["verify", "calc-2"]);
    const lines = block(ran.stdout, "calc-2");
    assert.ok(lines.includes("  Examples against the readings: 2 examples, 1 reading, all as stated"), `[guards-8] [guards-9] [guards-20] ${ran.stdout}`);
    assert.ok(lines.includes("  On the code: Sampled on the implementation"), `[guards-7] [guards-22] every rule holds of the code for every sequence drawn: ${ran.stdout}`);
    assert.ok(lines.includes("    legal when — a: probe: n < 9; rest: true"), "[guards-6] an event a reading leaves out is always legal");
    assert.ok(lines.some((line) => /^ {4}rest: caused \d+, skipped 0$/.test(line)), "[guards-3] an event with no params and no effect is caused");

    // Each rule alone decides: one wrong value, and an example is not as stated.
    const wrongly: [string, string][] = [
      ["2 + 3 * 4 == 14", "2 + 3 * 4 == 20"],
      ["10 - 4 - 3 == 3", "10 - 4 - 3 == 9"],
      ["false implies false implies false", "(false implies false) implies false"],
      ["if true then true else false and false", "(if true then true else false) and false"],
      ["not true or true", "not (true or true)"],
      ["true or false and false", "(true or false) and false"],
    ];
    for (const [rule, wrong] of wrongly) {
      write(dir, "guards/calc-2/readings/a.yaml", swap(CALC_READING, JSON.stringify(rule), JSON.stringify(wrong)));
      const off = await spex(dir, ["verify", "calc-2"]);
      assert.ok(block(off.stdout, "calc-2").includes("    calc-3, reading a: step 1 is forbidden"), `[guards-8] ${wrong} is false: ${off.stdout}`);
    }
  });

  it("guards-34: a type error names the file and the expression", async () => {
    const file = `${READINGS}/b.yaml`;
    for (const [shall, expression] of [
      ["effect.holders == 1", "effect.holders == 1"],
      ["held > 0", "held"],
      ["1 < 2 < 3", "1 < 2 < 3"],
    ]) {
      const cause = await cannot({ [file]: reading(WHEN_B, shall) });
      assert.ok(cause.startsWith(`${file}: `) && cause.includes(expression), `[guards-9] [guards-18] ${cause}`);
    }
    const legal = await cannot({ [file]: swap(READING_B, `legal: "${REVOKE_LEGAL}"`, 'legal: "effect.ok"') });
    assert.ok(legal.startsWith(`${file}: `) && legal.includes("effect.ok"), `[guards-6] [guards-9] a legal may not read the effect: ${legal}`);
  });

  it("guards-34: an unknown key, another format, an unknown type and a clashing name name the file", async () => {
    const reader = `${READINGS}/a.yaml`;
    const cases: [Change, string, RegExp][] = [
      [{ [GUARD_FILE]: `${GUARD_YAML}notes: none\n` }, GUARD_FILE, /'notes'/],
      [{ [`${BINDING}/binding.yaml`]: `${BINDING_YAML}owner: me\n` }, `${BINDING}/binding.yaml`, /'owner'/],
      [{ [reader]: `${READING_A}comment: none\n` }, reader, /'comment'/],
      [{ [GUARD_FILE]: swap(GUARD_YAML, "format: 1", "format: 2") }, GUARD_FILE, /format/],
      [{ [reader]: swap(READING_A, "format: 1", "format: 2") }, reader, /format/],
      [{ [`${BINDING}/binding.yaml`]: swap(BINDING_YAML, "count: int 1..3", "count: integer") }, `${BINDING}/binding.yaml`, /integer/],
      [{ [reader]: swap(READING_A, "state:\n", "state:\n  who: { type: bool, start: false }\n") }, reader, /who/],
    ];
    for (const [change, file, said] of cases) {
      const cause = await cannot(change);
      assert.ok(cause.startsWith(`${file}: `), `[guards-18] the file is named: ${cause}`);
      assert.match(cause, said, `[guards-3] [guards-6] [guards-10] and what is wrong in it: ${cause}`);
    }
  });

  it("guards-34: an item missing or out of place names the item", async () => {
    const copy = (name: string): Change => ({ [`guards/${name}/guard.yaml`]: GUARD_YAML, [`guards/${name}/readings/a.yaml`]: READING_A });
    assert.match(await cannot(copy("entitlements-99"), "entitlements-99"), /^entitlements-99: /, "[guards-2] a guard folder named for no item");
    assert.match(await cannot(copy("entitlements-1"), "entitlements-1"), /^entitlements-1: .*Verification/, "[guards-2] an assertion item outside Verification");
    const two = swap(SPEC, "by that user [[entitlements-1](#entitlements-1)].\n\n### entitlements-3", "by that user [[entitlements-1](#entitlements-1)] [[entitlements-5](#entitlements-5)].\n\n### entitlements-3");
    assert.match(await cannot({ "specs/packages/entitlements.md": two }), /^entitlements-2: .*entitlements-1, entitlements-5/, "[guards-2] an assertion item citing two behavior items");
    assert.match(await cannot({ [GUARD_FILE]: swap(GUARD_YAML, "item: entitlements-3", "item: entitlements-6") }), /^entitlements-6: .*entitlements-1/, "[guards-2] an example item that does not cite the behavior item");
  });

  it("guards-34: a guard short of what it needs cannot be checked", async () => {
    const cases: [Change, RegExp][] = [
      [{ [READINGS]: null }, /no reading/],
      [{ [GUARD_FILE]: swap(GUARD_YAML, FORBIDDEN_EXAMPLE, "") }, /no forbidden example/],
      [{ [GUARD_FILE]: `format: 1\nbinding: seats\n${SAMPLE}\nexamples:\n${FORBIDDEN_EXAMPLE}` }, /no permitted example/],
      [{ [GUARD_FILE]: swap(GUARD_YAML, "events: 8", "events: 2") }, /entitlements-3: .*3 steps/],
      [{ [GUARD_FILE]: swap(GUARD_YAML, "params: { who: ann, count: 1 }, effect: { ok: true, holders", "params: { who: ann }, effect: { ok: true, holders") }, /entitlements-3: step 1: params: .*'count'/],
      [{ [GUARD_FILE]: swap(GUARD_YAML, " seed: 1,", "") }, /sample\.seed/],
      [{ [GUARD_FILE]: swap(GUARD_YAML, "effect: { ok: false, remaining: null }", "effect: { remaining: null }") }, /entitlements-3, step 3: reading a reads effect\.ok/],
    ];
    for (const [change, said] of cases) {
      const cause = await cannot(change);
      assert.match(cause, said, `[guards-10] [guards-18] ${cause}`);
      assert.ok(cause.startsWith(`guards/${GUARD}/`), `[guards-18] the file is named: ${cause}`);
    }
  });

  it("guards-34: a folder under guards/ with no guard.yaml is a guard that cannot be checked", async () => {
    const misnamed: Change = { [GUARD_FILE]: null, [`guards/${GUARD}/guard.yml`]: GUARD_YAML };
    assert.equal(await cannot(misnamed), `${GUARD_FILE}: not found`, "[guards-1] [guards-18] a guard file gone or misnamed is reported, not passed over");

    const dir = await project({ "guards/drafts/notes.md": "Not yet a guard.\n" });
    const ran = await spex(dir, ["verify"]);
    assert.deepEqual(block(ran.stdout, "drafts"), ["drafts", "  Cannot be checked — guards/drafts/guard.yaml: not found"], `[guards-1] every folder under guards/ other than bindings is a guard: ${ran.stdout}`);
    assert.ok(ran.stdout.endsWith("\n1 of 2 guards pass.\n"), "[guards-17]");
    assert.equal(ran.code, 1, "[guards-27]");
  });

  it("guards-34: an entry a guard's folder may not hold, and a folder name no guard may have, cannot be checked", async () => {
    const stray = await cannot({ [`guards/${GUARD}/notes.md`]: "Not a guard's file.\n" });
    assert.match(stray, /^guards\/[^/]+\/notes\.md: not part of a guard/, `[guards-1] [guards-18] ${stray}`);

    const dir = await project({ "guards/-draft/guard.yaml": GUARD_YAML });
    const ran = await spex(dir, ["verify"]);
    assert.deepEqual(block(ran.stdout, "-draft"), ["-draft", "  Cannot be checked — '-draft' cannot be a guard's name"], `[guards-1] [guards-18] ${ran.stdout}`);
    assert.equal(ran.code, 1, "[guards-27]");
  });

  it("guards-34: a binding whose files name its own folder, or any path under guards/, cannot be checked", async () => {
    const declaration = `${BINDING}/binding.yaml`;
    const said = (entry: string): string =>
      `${declaration}: files: '${entry}' is under guards/; a binding's folder is copied by itself and is no code under test`;
    // With its folder among the files, a kept fault could change the
    // module and be caught with no defect in the code.
    const onBinding = `diff --git a/${BINDING}/binding.mjs b/${BINDING}/binding.mjs\n--- a/${BINDING}/binding.mjs\n+++ b/${BINDING}/binding.mjs\n@@ -20,3 +20,3 @@\n     const remaining = use(store, who);\n-    return { ok: remaining !== null, remaining };\n+    return { ok: true, remaining };\n   },\n`;
    assert.equal(
      await cannot({ [declaration]: swap(BINDING_YAML, "  - src\n", `  - src\n  - ${BINDING}\n`), [FAULT_FILE]: onBinding }),
      said(BINDING),
      "[guards-3] [guards-18] the file and the entry are named, and no fault is applied to the binding",
    );
    assert.equal(
      await cannot({ [declaration]: swap(BINDING_YAML, "  - src\n", "  - src\n  - guards\n") }),
      said("guards"),
      "[guards-3] [guards-18] the guards folder itself",
    );
    assert.equal(
      await cannot({ [declaration]: swap(BINDING_YAML, "  - src\n", `  - src\n  - ./${READINGS}/\n`) }),
      said(`./${READINGS}/`),
      "[guards-3] [guards-18] a guard's own files",
    );
  });

  it("guards-34: a patch that is no unified diff, adds a file, or has more lines than its header says names the file and the line", async () => {
    const longer = swap(FAULT, "-  store.delete(who);\n", "-  store.delete(who);\n+  store.clear();\n");
    assert.equal(await cannot({ [FAULT_FILE]: longer }), `${FAULT_FILE}: line 14: the change has more lines than its header says`, "[guards-11] [guards-18] a hunk longer than its header's counts");
    const stale = `${FAULT}-  return held;\n+  return true;\n`;
    assert.equal(await cannot({ [FAULT_FILE]: stale }), `${FAULT_FILE}: line 14: the change has more lines than its header says`, "[guards-11] [guards-18] lines after the header's counts ran out");
    const adds = "diff --git a/src/more.mjs b/src/more.mjs\nnew file mode 100644\n--- /dev/null\n+++ b/src/more.mjs\n@@ -0,0 +1 @@\n+export {};\n";
    assert.equal(await cannot({ [FAULT_FILE]: adds }), `${FAULT_FILE}: line 2: it adds or removes a file; a kept fault changes existing files`, "[guards-11] [guards-18] a patch that adds a file");
    assert.equal(await cannot({ [FAULT_FILE]: "Revoking a grant leaves its seats in place.\n" }), `${FAULT_FILE}: no change found; a kept fault is a unified diff, as git diff writes it`, "[guards-11] [guards-18] text that is no unified diff");
  });

  it("guards-34: a then giving a value outside its variable's type is a reading error, Inconclusive", async () => {
    // No example causes an audit, so only the sampled check meets it.
    const grows = swap(READING_A, "  use:\n", '  audit:\n    then:\n      left: "map u in user: left[u] + 2"\n  use:\n');
    const ran = await verified({ [`${READINGS}/a.yaml`]: grows });
    const at = ran.lines.indexOf("  On the code: Inconclusive");
    assert.ok(at > 0, `[guards-23] ${ran.stdout}`);
    assert.match(ran.lines[at + 1], /^ {4}a reading error: reading a: after audit, left would be \{ann: \d, bob: \d\}, outside map user to int 0\.\.3$/, "[guards-7] [guards-26] the reading error and its cause");
    assert.ok(ran.lines.includes("  Examples against the readings: 2 examples, 2 readings, all as stated"));
    assert.equal(ran.code, 1);

    // An example that meets it is a failure of the examples.
    const early = swap(READING_A, `left: "${GRANT_THEN}"`, 'left: "map u in user: left[u] + 4"');
    const listed = await verified({ [`${READINGS}/a.yaml`]: early });
    assert.ok(listed.lines.includes("    entitlements-3, reading a: step 1: after grant, left would be {ann: 4, bob: 4}, outside map user to int 0..3"), `[guards-20] [guards-26] a reading error in the walk is a failure, the reading named once: ${listed.stdout}`);
  });

  it("guards-34: a guard that cannot be checked stops no other guard of the run", async () => {
    const dir = await project({ "guards/entitlements-7/guard.yaml": GUARD_YAML });
    const ran = await spex(dir, ["verify"]);
    assert.equal(ran.code, 1, "[guards-27]");
    assert.equal(block(ran.stdout, GUARD).at(-1), "  Passes", "[guards-17] the other guard is checked and passes");
    assert.deepEqual(block(ran.stdout, "entitlements-7"), ["entitlements-7", "  Cannot be checked — guards/entitlements-7/readings: no reading; a guard needs at least one"], "[guards-18] [guards-26] no line after Cannot be checked");
    assert.ok(ran.stdout.endsWith("\n1 of 2 guards pass.\n"), "[guards-26]");
  });
});

// ---------------------------------------------------------------
// guards-35: misuse
// ---------------------------------------------------------------

describe("guards-35: the commands misused", { concurrency: 4 }, () => {
  it("guards-35: a name that is no guard is refused, and nothing is checked or written", async () => {
    const dir = await project();
    const before = snapshot(dir);
    for (const command of ["verify", "approve"]) {
      const ran = await spex(dir, [command, "entitlements-9"]);
      assert.equal(ran.code, 1, "[guards-27]");
      assert.equal(ran.stderr, `spex ${command}: entitlements-9 is no guard under guards/\n`, "[guards-27] the cause names it");
      assert.equal(ran.stdout, "", "[guards-17] nothing is checked");
    }
    const mixed = await spex(dir, ["verify", GUARD, "bindings"]);
    assert.equal(mixed.stderr, "spex verify: bindings is no guard under guards/\n", "[guards-1] the bindings folder is no guard");
    assert.equal(mixed.stdout, "", "[guards-27] nothing is checked where one name is no guard");
    assert.deepEqual(snapshot(dir), before);
  });

  it("guards-35: an option, and spex approve with no guard or with several, print the cause and the usage line", async () => {
    const dir = await project();
    const before = snapshot(dir);
    const cases: [string[], string][] = [
      [["verify", "--fast"], "spex verify: unknown option --fast\nUsage: spex verify [<guard>…]\n"],
      [["verify", GUARD, "-q"], "spex verify: unknown option -q\nUsage: spex verify [<guard>…]\n"],
      [["approve"], "spex approve: missing <guard>\nUsage: spex approve <guard>\n"],
      [["approve", GUARD, "entitlements-7"], "spex approve: unexpected argument entitlements-7\nUsage: spex approve <guard>\n"],
      [["approve", "--yes", GUARD], "spex approve: unknown option --yes\nUsage: spex approve <guard>\n"],
    ];
    for (const [args, said] of cases) {
      const ran = await spex(dir, args);
      assert.equal(ran.code, 1, `[guards-27] spex ${args.join(" ")} exits 1`);
      assert.equal(ran.stderr, said, `[guards-27] spex ${args.join(" ")} prints the cause and the usage line`);
      assert.equal(ran.stdout, "");
    }
    assert.deepEqual(snapshot(dir), before, "[guards-27] nothing is written");
  });

  it("guards-35: a Node older than 22.15 is refused with exit 1", async () => {
    const dir = await project();
    const before = snapshot(dir);
    // What Node 22.15 added, taken away before the CLI loads.
    const older = `${dir}.older.cjs`;
    writeFileSync(older, 'const nodeModule = require("node:module");\nnodeModule.registerHooks = undefined;\nnodeModule.syncBuiltinESMExports();\n');
    const ran = await spex(dir, ["verify"], { node: ["--require", older] });
    assert.equal(ran.code, 1, "[guards-27] spex verify on a Node that cannot say what a copy's process loads exits 1");
    assert.equal(ran.stderr, `spex verify: needs Node 22.15 or newer to see what a copy's process loads; this is Node ${process.versions.node}\n`, "[guards-27] and says what it needs");
    assert.equal(ran.stdout, "", "[guards-27] nothing is checked");
    assert.deepEqual(snapshot(dir), before, "[guards-28]");
  });

  for (const [signal, status] of [["SIGINT", 130], ["SIGQUIT", 131], ["SIGTERM", 143], ["SIGHUP", 129]] as const) {
    it(`guards-35: ${signal} stops the run with status ${status}, its processes gone and no copy left`, { skip: process.platform === "win32" }, async () => {
      // The signal comes from inside the run, once the copy's process
      // is in an event that never returns.
      const hanging = swap(
        swap(BINDING_MJS, "export function start() {\n", `${LEAVES}\nexport function start() {\n`),
        "    const remaining = use(store, who);",
        `    noteLeft(process.env.SPEX_TEST_PIDS, process.pid + "\\n");\n    process.kill(process.ppid, "${signal}");\n    await new Promise(() => {});\n    const remaining = use(store, who);`,
      );
      const dir = await project({ [`${BINDING}/binding.mjs`]: hanging });
      const before = snapshot(dir);
      const pids = `${dir}.left`;
      // spex() itself checks that nothing is left under the temp folder.
      const ran = await spex(dir, ["verify"], { env: { SPEX_TEST_PIDS: pids } });
      assert.equal(ran.code, status, `[guards-27] ${signal} exits ${status}: ${ran.stdout}${ran.stderr}`);
      assert.equal(ran.stdout, `${HEADING}\n`, "[guards-27] and prints nothing more");
      assert.equal(ran.stderr, "", "[guards-27]");
      const left = readFileSync(pids, "utf8").trim().split("\n").map(Number);
      assert.equal(left.length, 2, "[guards-12] the copy's process and the process it started");
      for (const pid of left) await untilGone(pid);
      assert.deepEqual(snapshot(dir), before, "[guards-28]");
    });
  }

  it("guards-35: spex approve on a guard that cannot be checked fails and leaves the record as it was, or absent", async () => {
    const dir = await project();
    const record = read(dir, APPROVAL);
    write(dir, `${READINGS}/b.yaml`, reading(WHEN_B, "held > 0"));
    const ran = await spex(dir, ["approve", GUARD]);
    assert.equal(ran.code, 1, "[guards-27]");
    assert.match(ran.stderr, new RegExp(`^spex approve: ${GUARD} cannot be checked — ${READINGS}/b\\.yaml: .*held`), "[guards-16] the cause");
    assert.equal(ran.stdout, "");
    assert.equal(read(dir, APPROVAL), record, "[guards-16] the record is as it was");

    const fresh = await project({ [`${READINGS}/b.yaml`]: reading(WHEN_B, "held > 0") }, { approve: false });
    assert.equal((await spex(fresh, ["approve", GUARD])).code, 1);
    assert.equal(existsSync(join(fresh, APPROVAL)), false, "[guards-16] or absent");
  });
});

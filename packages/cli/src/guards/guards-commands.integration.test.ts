// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-30, guards-34), DR-244 and DR-252: `spex
 * approve`, `spex verify --keep`, the refusals of both commands and
 * an interrupt, in the fixture project of `guards-fixture.test.ts`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { KEPT_FILE, KEPT_MARK, quoted } from "./checks.js";
import { tlcArgs } from "./tlc.js";
import {
  A,
  APPROVAL,
  B,
  BINDING_MJS,
  DECLARATION,
  FAULT_FILE,
  GETS,
  GUARD,
  GUARD_FILE,
  HEADING,
  MODULE,
  NEXT,
  TRANSLATIONS,
  TRANSLATION_A,
  TRANSLATION_B,
  WAITS,
  block,
  filesOf,
  gone,
  project,
  read,
  scratch,
  spex,
  swap,
  tools,
  useFixture,
  write,
} from "./guards-fixture.test.js";

useFixture();

describe("spex verify and spex approve: the commands", { concurrency: 3 }, () => {
  it("spex verify --keep leaves every generated file with the command line that reruns TLC", async () => {
    const dir = await project();
    const keep = join(scratch, "kept-1");
    const ran = await spex(dir, ["verify", "--keep", keep]);
    assert.equal(ran.code, 0, ran.stdout);
    const folder = join(keep, GUARD);
    assert.ok(readFileSync(join(folder, KEPT_FILE), "utf8").startsWith(`${KEPT_MARK}\n`));
    assert.deepEqual(readdirSync(folder).sort(), ["cases", "compare", "form-a", "form-b", "judge-grants-twice", "model", KEPT_FILE].sort());
    assert.deepEqual(readdirSync(join(folder, "model")).sort(), [
      "Declaration.tla",
      "SpexModel.cfg",
      "SpexModel.dump",
      "SpexModel.err",
      "SpexModel.out",
      "SpexModel.tla",
      "SpexModel.user",
      "a.tla",
      "command.txt",
      "java-tmp",
    ]);
    assert.equal(read(folder, "model/a.tla"), TRANSLATION_A);
    assert.equal(read(folder, "compare/SpexCompare.cfg"), "CONSTANT Missing = Missing\nINIT Init\nNEXT Next\nINVARIANT Agree\nCHECK_DEADLOCK FALSE\n");

    // The command line reruns TLC there, without Spex: its words, each
    // quoted as a POSIX shell takes it, so a path with a space in it
    // is one word still.
    const command = read(folder, "model/command.txt").trim().split("\n").at(-1) as string;
    const words = [tools.java, ...tlcArgs(tools.jar, "SpexModel", true)];
    assert.equal(words.slice(1).join(" "), `-XX:+UseParallelGC -Djava.io.tmpdir=java-tmp -cp ${tools.jar} tlc2.TLC -tool -workers 1 -fp 0 -metadir states -userFile SpexModel.user -dump SpexModel.dump -config SpexModel.cfg SpexModel`);
    assert.equal(command, words.map(quoted).join(" "));
    assert.equal(quoted("/opt/java 21/bin/java"), "'/opt/java 21/bin/java'");
    assert.equal(quoted("C:\\tools\\tla2tools.jar"), "'C:\\tools\\tla2tools.jar'");
    assert.equal(quoted("/usr/bin/java"), "/usr/bin/java");
    const env = { ...process.env };
    for (const name of ["JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS"]) delete env[name];
    const dump = read(folder, "model/SpexModel.dump");
    // A POSIX shell runs the line as kept; where there is none, its words are run.
    const again =
      process.platform === "win32"
        ? spawnSync(words[0], words.slice(1), { cwd: join(folder, "model"), env, encoding: "utf8" })
        : spawnSync("sh", ["-c", command], { cwd: join(folder, "model"), env, encoding: "utf8" });
    assert.equal(again.status, 0, again.stdout);
    assert.match(again.stdout, /Model checking completed\. No error has been found\./);
    assert.equal(read(folder, "model/SpexModel.dump"), dump, "the same inputs give the same table");

    // A jar in a folder whose name holds a space: the kept line quotes its path, and runs.
    const spaced = join(scratch, "jar dir", "tla2tools.jar");
    mkdirSync(dirname(spaced), { recursive: true });
    cpSync(tools.jar, spaced);
    const kept = join(scratch, "kept-4");
    assert.equal((await spex(dir, ["verify", "--keep", kept], { env: { SPEX_TLC_JAR: spaced } })).code, 0);
    const line = read(join(kept, GUARD), "cases/command.txt").trim().split("\n").at(-1) as string;
    assert.ok(line.includes(` -cp '${spaced}' tlc2.TLC `), line);
    if (process.platform !== "win32") {
      const rerun = spawnSync("sh", ["-c", line], { cwd: join(kept, GUARD, "cases"), env, encoding: "utf8" });
      assert.equal(rerun.status, 0, rerun.stdout);
    }

    // A second run replaces what the first kept; a folder Spex did not keep is left alone.
    assert.equal((await spex(dir, ["verify", "--keep", keep])).code, 0);
    const foreign = join(scratch, "kept-2");
    mkdirSync(join(foreign, GUARD), { recursive: true });
    const refused = await spex(dir, ["verify", "--keep", foreign]);
    assert.equal(refused.code, 1);
    assert.equal(refused.stderr, `spex verify: --keep ${foreign}: ${join(foreign, GUARD)} was not kept by spex verify — remove it, or name another folder\n`);
    const inside = await spex(dir, ["verify", "--keep", "kept"]);
    assert.equal(inside.stderr, "spex verify: --keep kept: the folder lies among the project's files — name a folder outside the project, or one Git ignores\n");
    assert.equal(inside.code, 1);
    assert.equal(existsSync(join(dir, "kept")), false);

    // A folder Git ignores is taken, though it is not there yet and the rule names it as a folder.
    execFileSync("git", ["init", "-q"], { cwd: dir });
    write(dir, ".gitignore", "kept/\n");
    const ignored = await spex(dir, ["verify", "--keep", "kept"]);
    assert.equal(ignored.stderr, "");
    assert.ok(existsSync(join(dir, "kept", GUARD, KEPT_FILE)), ignored.stdout);
    const tracked = await spex(dir, ["verify", "--keep", "src/left"]);
    assert.equal(tracked.code, 1, "one it does not ignore is refused still");
    assert.equal(existsSync(join(dir, "src", "left")), false);
  });

  it("spex verify --keep leaves the declaration in TLA+ for a guard with no translation yet", async () => {
    const dir = await project({ [A]: null, [B]: null }, { approve: false });
    const keep = join(scratch, "kept-3");
    const ran = await spex(dir, ["verify", "--keep", keep]);
    assert.deepEqual(block(ran.stdout), [GUARD, `  Cannot be checked — ${TRANSLATIONS}: no translation; a guard needs two or more`]);
    assert.equal(ran.code, 1);
    assert.deepEqual(readdirSync(join(keep, GUARD)).sort(), ["Declaration.tla", KEPT_FILE].sort());
    const declaration = readFileSync(join(keep, GUARD, "Declaration.tla"), "utf8");
    assert.ok(declaration.startsWith(`---- MODULE Declaration ----\n\\* Generated by Spex from ${DECLARATION}. Do not edit.\n`), declaration);
    assert.ok(declaration.includes('User == {"ann", "bob", "cy"}'));

    // It is the file every run of TLC is given once a translation is there.
    write(dir, A, TRANSLATION_A);
    assert.equal((await spex(dir, ["verify", "--keep", keep])).stdout.includes("Cannot be checked"), false);
    assert.equal(readFileSync(join(keep, GUARD, "model", "Declaration.tla"), "utf8"), declaration);
    assert.equal(existsSync(join(keep, GUARD, "Declaration.tla")), false, "a second run replaces what the first kept");
  });

  it("spex approve prints the guard item, the rule and each case with its steps, and records the inputs' digests", async () => {
    const dir = await project({}, { approve: false });
    const ran = await spex(dir, ["approve", GUARD]);
    assert.equal(ran.code, 0, ran.stderr);
    assert.equal(
      ran.stdout,
      [
        `${GUARD} — the guard item:`,
        "  When `spex verify` checks the lock, it shall find that a held lock stays with its holder [lock-3],",
        "  reading the rule by these cases:",
        "",
        "lock-3 — the rule:",
        "  While a user holds the lock, when another user takes it, the lock shall stay with its holder,",
        "  refuse the taker and report the taker among those waiting, as [lock-4] orders them.",
        "",
        `permitted — ${WAITS}`,
        "  ann takes the free lock and gets it, and bob takes it; the lock is refused, stays with ann, and",
        "  bob waits",
        "    1. take who=ann -> granted=true",
        "    2. take who=bob -> granted=false holder=ann waiting={bob}",
        "",
        `forbidden — ${GETS}`,
        "  the same two takes, ending with the lock granted",
        "    1. take who=ann",
        "    2. take who=bob -> granted=true",
        "",
        `permitted — ${NEXT}`,
        "  ann takes, cy takes, bob takes, and ann leaves; the lock passes to bob and one user still waits",
        "    1. take who=ann",
        "    2. take who=cy",
        "    3. take who=bob",
        "    4. leave who=ann -> holder=bob queue=1",
        "",
        "Also recorded, not printed here:",
        `  file ${MODULE}`,
        `  file ${DECLARATION}`,
        `  file ${FAULT_FILE}`,
        `  file ${A}`,
        `  file ${B}`,
        "  item lock-4",
        "",
        "First approval.",
        `Approved ${GUARD} — commit ${APPROVAL}.`,
        "",
      ].join("\n"),
    );
    const record = JSON.parse(read(dir, APPROVAL)) as { format: number; inputs: Record<string, string> };
    assert.equal(record.format, 1);
    assert.deepEqual(Object.keys(record.inputs), [
      `file ${MODULE}`,
      `file ${DECLARATION}`,
      `file ${FAULT_FILE}`,
      `file ${GUARD_FILE}`,
      `file ${A}`,
      `file ${B}`,
      "item lock-3",
      "item lock-4",
      "item lock-9",
    ]);
    assert.equal(record.inputs[`file ${A}`], createHash("sha256").update(TRANSLATION_A).digest("hex"));

    // A second approval of the same inputs leaves the record's file as it is, and says so.
    const written = statSync(join(dir, ...APPROVAL.split("/"))).mtimeMs;
    const second = await spex(dir, ["approve", GUARD]);
    assert.ok(second.stdout.endsWith(`\n\nNothing changed since the last approval: ${APPROVAL} stands as it was.\n`), second.stdout);
    assert.equal(second.code, 0);
    assert.equal(statSync(join(dir, ...APPROVAL.split("/"))).mtimeMs, written);
    write(dir, B, `${TRANSLATION_B}\\* A note.\n`);
    const third = await spex(dir, ["approve", GUARD]);
    assert.ok(third.stdout.endsWith(`\n\nSince the last approval:\n  changed: file ${B}\nApproved ${GUARD} — commit ${APPROVAL}.\n`), third.stdout);
  });

  it("spex approve needs no Java, and refuses a guard whose translation breaks the form, leaving the record as it was", async () => {
    const dir = await project();
    const record = read(dir, APPROVAL);
    write(dir, A, swap(TRANSLATION_A, "EXTENDS Declaration, Naturals, FiniteSets", "EXTENDS Declaration, Naturals, FiniteSets\nCONSTANT Limit"));
    const empty = join(scratch, "no-java-2");
    mkdirSync(empty, { recursive: true });
    const ran = await spex(dir, ["approve", GUARD], { env: { PATH: empty, JAVA_HOME: null, SPEX_TLC_JAR: null } });
    assert.equal(ran.code, 1);
    assert.equal(ran.stderr, `spex approve: ${GUARD} cannot be checked — ${A}:3:1: CONSTANT is not for a translation: a translation declares no constant\n`);
    assert.equal(read(dir, APPROVAL), record);
    write(dir, A, TRANSLATION_A);
    assert.equal((await spex(dir, ["approve", GUARD], { env: { PATH: empty, JAVA_HOME: null, SPEX_TLC_JAR: null } })).code, 0);
  });

  it("the commands refuse what they do not take, with the usage line and exit 1", async () => {
    const dir = await project();
    const files = filesOf(dir);
    const cases: [string[], string][] = [
      [["verify", "--fast"], "spex verify: unknown option --fast\nUsage: spex verify [--keep <folder>] [<guard>…]\n"],
      [["verify", "--keep"], "spex verify: --keep needs a folder\nUsage: spex verify [--keep <folder>] [<guard>…]\n"],
      [["verify", "lock-10"], "spex verify: lock-10 is no guard under guards/\n"],
      [["approve"], "spex approve: missing <guard>\nUsage: spex approve <guard>\n"],
      [["approve", GUARD, "x"], "spex approve: unexpected argument x\nUsage: spex approve <guard>\n"],
      [["approve", "--yes", GUARD], "spex approve: unknown option --yes\nUsage: spex approve <guard>\n"],
    ];
    for (const [args, said] of cases) {
      const ran = await spex(dir, args);
      assert.equal(ran.code, 1, `spex ${args.join(" ")} exits 1`);
      assert.equal(ran.stderr, said);
      assert.equal(ran.stdout, "");
    }
    assert.deepEqual(filesOf(dir), files, "nothing is written");

    const none = join(scratch, "no-guards");
    mkdirSync(none, { recursive: true });
    const ran = await spex(none, ["verify"]);
    assert.equal(ran.stdout, "No guards under guards/.\n");
    assert.equal(ran.code, 0);
  });

  it("an interrupt stops the run with status 130, its processes gone and nothing left", { skip: process.platform === "win32" }, async () => {
    // The signal comes from inside the run, once the copy's process
    // is in an event that never returns.
    const hanging = swap(
      BINDING_MJS,
      "    const granted = take(state.lock, who);",
      '    appendFileSync(process.env.SPEX_TEST_PIDS, process.pid + "\\n");\n    process.kill(process.ppid, "SIGINT");\n    await new Promise(() => {});\n    const granted = take(state.lock, who);',
    ).replace("  take(state, { who }) {", "  async take(state, { who }) {");
    const dir = await project({ [MODULE]: `import { appendFileSync } from "node:fs";\n${hanging}` });
    const files = filesOf(dir);
    const pids = `${dir}.pids`;
    // spex() itself checks that nothing is left under the temp folder.
    const ran = await spex(dir, ["verify"], { env: { SPEX_TEST_PIDS: pids } });
    assert.equal(ran.code, 130, `${ran.stdout}${ran.stderr}`);
    assert.equal(ran.stdout, `${HEADING}\n`);
    for (const pid of readFileSync(pids, "utf8").trim().split("\n").map(Number)) {
      while (!gone(pid)) await pause(20);
    }
    assert.deepEqual(filesOf(dir), files);
  });
});

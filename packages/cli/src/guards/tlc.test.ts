// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-244 and DR-252: TLC. Reading what TLC printed,
 * on text TLC 2.19 printed; finding Java and the jar; and one real
 * run of TLC on the declaration in TLA+ with every form of type.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { declarationModule } from "./declaration.js";
import { parseBinding } from "./files.js";
import { parseTla } from "./tla.js";
import {
  TLC_PIN,
  completed,
  downloadJar,
  dumpStates,
  evalFault,
  findJar,
  findJava,
  findTools,
  homeJar,
  javaWords,
  loadedModules,
  messagesOf,
  parseFaults,
  pastStart,
  printed,
  runTlc,
  statsOf,
  tlcArgs,
  traceOf,
  versionOf,
  violated,
  type TlcRun,
} from "./tlc.js";
import { GuardError } from "./types.js";

let dir = "";

before(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-tlc-")));
});

after(() => {
  if (dir !== "") rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

function message(error: unknown): string {
  assert.ok(error instanceof GuardError, `expected a GuardError, got ${String(error)}`);
  return error.message;
}

/** A run that printed `stdout`. */
function ran(stdout: string, more: Partial<TlcRun> = {}): TlcRun {
  return {
    module: "SpexModel",
    status: 0,
    timedOut: false,
    failed: null,
    errors: "",
    stdout,
    messages: messagesOf(stdout),
    user: "",
    dump: null,
    unread: null,
    command: [],
    ...more,
  };
}

const msg = (code: number, severity: number, text: string): string =>
  `@!@!@STARTMSG ${code}:${severity} @!@!@\n${text}\n@!@!@ENDMSG ${code} @!@!@\n`;

const HEAD =
  msg(2262, 0, "TLC2 Version 2.19 of 08 August 2024 (rev: 5a47802)") +
  msg(2220, 0, "Starting SANY...") +
  "Parsing file /w/SpexForm.tla\nParsing file /w/Declaration.tla\nParsing file /w/java-tmp/Integers.tla\nParsing file C:\\w\\a.tla\n";

describe("tlc: reading what TLC printed", () => {
  it("reads the messages, the version, the modules loaded and the counts of a complete run", () => {
    const run = ran(
      HEAD +
        "Semantic processing of module Naturals\n" +
        msg(2219, 0, "SANY finished.") +
        msg(
          2193,
          0,
          "Model checking completed. No error has been found.\n  Estimates of the probability that TLC did not check all reachable states\n  because two distinct states had the same fingerprint:\n  calculated (optimistic):  val = 3.6E-15",
        ) +
        msg(2199, 0, "513 states generated, 260 distinct states found, 0 states left on queue."),
    );
    assert.equal(versionOf(run), "2.19");
    assert.deepEqual(loadedModules(run), ["SpexForm", "Declaration", "Integers", "a"]);
    assert.deepEqual(statsOf(run), { left: 0, complete: true, collision: "3.6E-15" });
    assert.equal(completed(run), true);
    assert.equal(completed({ ...run, status: 12 }), false);
    assert.equal(completed({ ...run, timedOut: true }), false);
    assert.equal(completed(ran(msg(2199, 0, "5 states generated, 4 distinct states found, 1 states left on queue."))), false);
    assert.equal(evalFault(run), null);
    assert.equal(violated(run), null);
  });

  it("pairs a message's codes where its text holds another message", () => {
    const messages = messagesOf(msg(1000, 1, `outer\n${msg(2247, 0, "inner").trimEnd()}\nend`));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].code, 1000);
    assert.ok(messages[0].text.endsWith("end"));
  });

  it("reads what the parser said of a module that does not parse", () => {
    const syntax = ran(
      `${HEAD}***Parse Error***\nWas expecting "==== or more Module body"\nEncountered "Legal" at line 8, column 1 and token "]" \n\nResidual stack trace follows:\nModule definition starting at line 1, column 1.\n\n\nFatal errors while parsing TLA+ spec in file SpexForm\n\ntla2sany.semantic.AbortException\n*** Abort messages: 1\n\nIn module t1\n\nCould not parse module t1 from file t1.tla\n\n\n${msg(3002, 1, "Parsing or semantic analysis failed.")}`,
      { status: 150 },
    );
    assert.deepEqual(parseFaults(syntax), [
      { module: "t1", line: 8, col: 1, message: 'Was expecting "==== or more Module body" Encountered "Legal" at line 8, column 1 and token "]"' },
    ]);

    const precedence = ran(
      `${HEAD}***Parse Error***\n\n  Precedence conflict between ops \\lor in block line 37, col 37 to line 37, col 38 of module t13 and \\land.\n\nResidual stack trace follows:\nExtendableExpr starting at line 37, column 41.\n\n\nFatal errors while parsing TLA+ spec in file SpexForm\n\n*** Abort messages: 1\n\nIn module t13\n\nCould not parse module t13 from file t13.tla\n\n\n${msg(3002, 1, "Parsing or semantic analysis failed.")}`,
      { status: 150 },
    );
    assert.deepEqual(parseFaults(precedence), [
      {
        module: "t13",
        line: 37,
        col: 37,
        message: "Precedence conflict between ops \\lor in block line 37, col 37 to line 37, col 38 of module t13 and \\land.",
      },
    ]);

    const lexical = ran(
      `${HEAD}Lexical error at line 10, column 44.  Encountered: "\\n" (10), after : "\\"leave"\n\nFatal errors while parsing TLA+ spec in file SpexForm\n\n*** Abort messages: 1\n\nIn module t11\n\nCould not parse module t11 from file t11.tla\n\n\n${msg(3002, 1, "Parsing or semantic analysis failed.")}`,
      { status: 150 },
    );
    assert.deepEqual(parseFaults(lexical), [
      { module: "t11", line: 10, col: 44, message: 'Lexical error. Encountered: "\\n" (10), after : "\\"leave"' },
    ]);

    const semantic =
      "Semantic errors:\n\n*** Errors: 2\n\nline 14, col 45 to line 14, col 51 of module t2\n\nUnknown operator: `UserRnk'.\n\n\nline 20, col 1 to line 20, col 9 of module t2\n\nOperator User already defined or declared.\n\n\n*** Warnings: 1\n\nline 20, col 1 to line 20, col 9 of module t2\n\nMultiple declarations or definitions for symbol User.  \nThis duplicates the one at line 4, col 1 to line 4, col 28 of module Declaration.\n\n\n\n";
    assert.deepEqual(parseFaults(ran(`${HEAD}${semantic}${semantic}${msg(3002, 1, "Parsing or semantic analysis failed.")}`, { status: 150 })), [
      { module: "t2", line: 14, col: 45, message: "Unknown operator: `UserRnk'." },
      { module: "t2", line: 20, col: 1, message: "Operator User already defined or declared." },
    ]);

    // A message of two lines is read whole, between two others and at the end of the text.
    const twoLines =
      "Semantic errors:\n\n*** Errors: 2\n\nline 29, col 16 to line 29, col 16 of module b\n\nMultiply-defined symbol 'e': this definition or declaration conflicts \nwith the one at line 29, col 6 to line 29, col 6 of module b.\n\n\nline 31, col 1 to line 31, col 4 of module b\n\nOperator Xyz already defined or declared, \nas the line above says.";
    assert.deepEqual(parseFaults(ran(`${HEAD}${twoLines}`, { status: 150 })), [
      {
        module: "b",
        line: 29,
        col: 16,
        message: "Multiply-defined symbol 'e': this definition or declaration conflicts with the one at line 29, col 6 to line 29, col 6 of module b.",
      },
      { module: "b", line: 31, col: 1, message: "Operator Xyz already defined or declared, as the line above says." },
    ]);

    const abort = ran(
      `${HEAD}\nFatal errors while parsing TLA+ spec in file SpexForm\n\ntla2sany.semantic.AbortException\n*** Abort messages: 1\n\nUnknown location\n\nCannot find source file for module Foo imported in module t7.\n\n\n${msg(3002, 1, "Parsing or semantic analysis failed.")}`,
      { status: 150 },
    );
    assert.deepEqual(parseFaults(abort), [
      { module: null, line: null, col: null, message: "Cannot find source file for module Foo imported in module t7." },
    ]);
    assert.deepEqual(parseFaults(ran(HEAD + msg(2219, 0, "SANY finished."))), []);
  });

  it("reads an expression TLC could not evaluate, with the places it names and its sequence", () => {
    const run = ran(
      HEAD +
        msg(
          1000,
          1,
          "TLC threw an unexpected exception.\nThis was probably caused by an error in the spec or model.\nSee the User Output or TLC Console for clues to what happened.\nThe exception was a java.lang.RuntimeException\n: Attempted to compute the value of an expression of form\nCHOOSE x \\in S: P, but no element of S satisfied P.\nline 6, col 17 to line 6, col 74 of module Declaration",
        ) +
        msg(2121, 1, "The behavior up to this point is:") +
        msg(2217, 4, "1: <Initial predicate>\n/\\ state = [holder |-> Missing, waiting |-> {}]\n/\\ step = Missing\n") +
        msg(
          2217,
          4,
          '2: <Take line 26, col 3 to line 28, col 20 of module SpexModel>\n/\\ state = [holder |-> Missing, waiting |-> {}]\n/\\ step = [ from |-> [holder |-> Missing, waiting |-> {}],\n  event |-> [event |-> "take", who |-> "ann"],\n  applies |-> FALSE ]\n',
        ) +
        msg(
          2103,
          1,
          "The error occurred when TLC was evaluating the nested\nexpressions at the following positions:\n0. Line 26, column 3 to line 28, column 20 in SpexModel\n1. Line 22, column 22 to line 22, column 39 in e1\n2. Line 6, column 17 to line 6, column 74 in Declaration\n\n",
        ),
      { status: 75 },
    );
    assert.deepEqual(evalFault(run), {
      message: "Attempted to compute the value of an expression of form CHOOSE x \\in S: P, but no element of S satisfied P.",
      assume: null,
      places: [
        { module: "SpexModel", line: 26, col: 3 },
        { module: "e1", line: 22, col: 22 },
        { module: "Declaration", line: 6, col: 17 },
      ],
    });
    const trace = traceOf(run);
    assert.equal(trace.length, 2);
    assert.deepEqual(trace[0].step, { m: "Missing" });
    assert.deepEqual(trace[1].step, parseTla('[applies |-> FALSE, event |-> [event |-> "take", who |-> "ann"], from |-> [holder |-> Missing, waiting |-> {}]]'));

    const assumption = ran(
      HEAD +
        msg(
          2105,
          1,
          "Evaluating assumption line 90, col 8 to line 90, col 47 of module SpexCases failed.\nAttempted to evaluate a CASE with no conditions true.\nline 10, col 16 to line 10, col 69 of module Declaration",
        ),
      { status: 10 },
    );
    assert.deepEqual(evalFault(assumption), {
      message: "Attempted to evaluate a CASE with no conditions true.",
      assume: 90,
      places: [{ module: "Declaration", line: 10, col: 16 }],
    });
  });

  it("leaves out the marks of a message within a message", () => {
    // An error raised inside an operator of a standard module, on the model and under an ASSUME.
    const onModel = ran(
      HEAD +
        msg(
          1000,
          1,
          `TLC threw an unexpected exception.\nThis was probably caused by an error in the spec or model.\nSee the User Output or TLC Console for clues to what happened.\nThe exception was a tlc2.tool.EvalException\n: \n${msg(2154, 0, `Attempted to apply the operator overridden by the Java method\npublic static tlc2.value.impl.IntValue tlc2.module.FiniteSets.Cardinality(tlc2.value.impl.Value),\nbut it produced the following error:\n${msg(2178, 0, "Overflow when computing the number of elements in:\nSUBSET 1..34").trimEnd()}`).trimEnd()}\nline 32, col 32 to line 32, col 62 of module a`,
        ),
      { status: 75 },
    );
    assert.deepEqual(evalFault(onModel), {
      message:
        "Attempted to apply the operator overridden by the Java method public static tlc2.value.impl.IntValue tlc2.module.FiniteSets.Cardinality(tlc2.value.impl.Value), but it produced the following error: Overflow when computing the number of elements in: SUBSET 1..34",
      assume: null,
      places: [{ module: "a", line: 32, col: 32 }],
    });
    const underAssume = ran(
      HEAD +
        msg(
          2105,
          1,
          `Evaluating assumption line 61, col 8 to line 61, col 47 of module SpexCases failed.\n${msg(2181, 0, "Attempted to compute cardinality of the value\n1").trimEnd()}`,
        ),
      { status: 10 },
    );
    assert.deepEqual(evalFault(underAssume), { message: "Attempted to compute cardinality of the value 1", assume: 61, places: [] });
  });

  it("names a Java exception TLC threw without its stack", () => {
    const wrapper = "TLC threw an unexpected exception.\nThis was probably caused by an error in the spec or model.\nSee the User Output or TLC Console for clues to what happened.\nThe exception was a ";
    const frames = "\n\tat tlc2.value.impl.Value.<init>(Value.java:25)\n\tat tlc2.tool.impl.Tool.evalApplImpl(Tool.java:2006)";
    const overflow = ran(
      HEAD +
        msg(2190, 0, "Finished computing initial states: 1 distinct state generated at 2026-11-27 03:40:13.") +
        msg(1000, 1, `${wrapper}java.lang.StackOverflowError\njava.lang.StackOverflowError${frames}`) +
        msg(2103, 1, "The error call stack is empty.\n"),
      { status: 255 },
    );
    assert.deepEqual(evalFault(overflow), {
      message:
        "This was a Java StackOverflowError. It was probably the result of an incorrect recursive function definition that caused TLC to enter an infinite loop when trying to compute the function or its application to an element in its putative domain.",
      assume: null,
      places: [],
    });
    assert.equal(pastStart(overflow), true, "TLC had computed the model's start");
    assert.equal(pastStart(ran(HEAD)), false);
    // TLC's own message where it catches the overflow itself reads the same.
    const caught = ran(
      HEAD +
        msg(
          1005,
          1,
          "This was a Java StackOverflowError. It was probably the result\nof an incorrect recursive function definition that caused TLC to enter\nan infinite loop when trying to compute the function or its application\nto an element in its putative domain.",
        ),
      { status: 255 },
    );
    assert.equal(evalFault(caught)?.message, evalFault(overflow)?.message);
    const other = ran(HEAD + msg(1000, 1, `${wrapper}java.lang.IllegalStateException\njava.lang.IllegalStateException: no such level${frames}`), { status: 255 });
    assert.equal(evalFault(other)?.message, "TLC threw a java.lang.IllegalStateException: no such level");
  });

  it("reads what Java wrote where it could not run TLC", () => {
    assert.equal(
      javaWords("Error: Could not find or load main class tlc2.TLC\nCaused by: java.lang.ClassNotFoundException: tlc2.TLC\n"),
      "Error: Could not find or load main class tlc2.TLC Caused by: java.lang.ClassNotFoundException: tlc2.TLC",
    );
    assert.equal(
      javaWords("Unrecognized VM option 'UseFooGC'\r\nError: Could not create the Java Virtual Machine.\nError: A fatal exception has occurred. Program will exit.\n"),
      "Unrecognized VM option 'UseFooGC' Error: Could not create the Java Virtual Machine.",
    );
    assert.equal(
      javaWords('Exception in thread "main" java.lang.OutOfMemoryError: Java heap space\n\tat tlc2.TLC.main(TLC.java:1)\n\t... 3 more\n'),
      'Exception in thread "main" java.lang.OutOfMemoryError: Java heap space',
    );
    assert.equal(javaWords(""), "");
  });

  it("reads a violated invariant, the values a file printed and the states of a dump", () => {
    const run = ran(msg(2110, 1, "Invariant Kept is violated.") + msg(2121, 1, "The behavior up to this point is:"), {
      status: 12,
      user: '<<"judge", 1, TRUE>>\n<<"judge", 2, FALSE>>\n',
    });
    assert.equal(violated(run), "Kept");
    assert.equal(evalFault(run), null, "a violated invariant is no error of evaluation");
    assert.deepEqual(printed(run), [{ t: ["judge", 1, true] }, { t: ["judge", 2, false] }]);
    const dump =
      'State 1:\n/\\ state = [standing |-> Missing]\n/\\ step = Missing\n\nState 2:\n/\\ state = [standing |-> Missing]\n/\\ step = [ from |-> [standing |-> Missing],\n  applies |-> FALSE ]\n\n';
    assert.deepEqual(dumpStates(dump), [
      { state: { r: { standing: { m: "Missing" } } }, step: { m: "Missing" } },
      { state: { r: { standing: { m: "Missing" } } }, step: { r: { applies: false, from: { r: { standing: { m: "Missing" } } } } } },
    ]);
    assert.deepEqual(dumpStates(dump.replace(/\n/g, "\r\n")), dumpStates(dump));
  });

  it("writes the command line with fixed options, every path but the jar's inside the run's folder", () => {
    assert.deepEqual(tlcArgs("/opt/tla2tools.jar", "SpexModel", true).join(" "), "-XX:+UseParallelGC -Djava.io.tmpdir=java-tmp -cp /opt/tla2tools.jar tlc2.TLC -tool -workers 1 -fp 0 -metadir states -userFile SpexModel.user -dump SpexModel.dump -config SpexModel.cfg SpexModel");
    assert.ok(!tlcArgs("/opt/tla2tools.jar", "SpexCases", false).includes("-dump"));
  });
});

describe("tlc: Java and the jar", () => {
  it("pins one TLC", () => {
    assert.deepEqual(TLC_PIN, {
      version: "2.19",
      release: "v1.7.4",
      url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar",
      sha256: "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88",
    });
    assert.equal(homeJar({ SPEX_HOME: join(dir, "home") }), join(dir, "home", "tools", "tla2tools-1.7.4.jar"));
  });

  it("finds the machine's Java, and says what to install where there is none", () => {
    // The guards tests run real TLC: a machine without Java fails here, by name.
    const found = findJava();
    assert.match(found.javaVersion, /^\d+/, "Java 11 or later runs the guards tests");
    const empty = join(dir, "empty-path");
    mkdirSync(empty);
    assert.throws(
      () => findJava({ PATH: empty }),
      (error) =>
        message(error) === "Java was not found: spex verify runs TLC, which needs Java 11 or later \u2014 install one, or set JAVA_HOME to one",
    );
    // A JAVA_HOME that holds no Java is passed over for the java on PATH.
    assert.equal(findJava({ ...process.env, JAVA_HOME: empty }).java, "java");
  });

  it("refuses a Java older than 11", { skip: process.platform === "win32" }, () => {
    const home = join(dir, "old-java");
    mkdirSync(join(home, "bin"), { recursive: true });
    writeFileSync(join(home, "bin", "java"), '#!/bin/sh\necho \'openjdk version "1.8.0_292"\' >&2\n', { mode: 0o755 });
    assert.throws(
      () => findJava({ ...process.env, JAVA_HOME: home }),
      (error) =>
        message(error) === "Java 1.8.0_292 is too old: spex verify runs TLC, which needs Java 11 or later \u2014 install one, or set JAVA_HOME to one",
    );
  });

  it("takes the jar SPEX_TLC_JAR names, and says whether it is the pinned copy", async () => {
    const other = join(dir, "other.jar");
    writeFileSync(other, "not the pinned jar");
    assert.deepEqual(await findJar({ SPEX_TLC_JAR: other }), { jar: other, pinned: false });
    const missing = join(dir, "missing.jar");
    await assert.rejects(findJar({ SPEX_TLC_JAR: missing }), (error) =>
      message(error) === `SPEX_TLC_JAR names ${missing}, which is no file \u2014 set it to a tla2tools.jar, or unset it for Spex to download TLC 2.19`,
    );
  });

  describe("the one checked download", () => {
    let server: Server;
    let origin = "";
    const bytes = Buffer.from("the bytes of a jar");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    before(async () => {
      server = createServer((request, answer) => {
        if (request.url === "/moved.jar") answer.writeHead(302, { location: "/tla2tools.jar" }).end();
        else if (request.url === "/tla2tools.jar") answer.writeHead(200).end(bytes);
        else answer.writeHead(404).end("no");
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(() => {
      server.close();
    });

    // A proxy of the host has no part in a download from this machine.
    const env = (): NodeJS.ProcessEnv => {
      const clean = { ...process.env, NO_PROXY: "127.0.0.1", no_proxy: "127.0.0.1" };
      return clean;
    };

    it("keeps the bytes whose digest is the pinned one, following a redirect", async () => {
      const dest = join(dir, "home-1", "tools", "tla2tools.jar");
      await downloadJar({ version: "9.9", url: `${origin}/moved.jar`, sha256 }, dest, env());
      assert.deepEqual(readFileSync(dest), bytes);
      assert.deepEqual(readdirSync(join(dir, "home-1", "tools")), ["tla2tools.jar"], "and nothing beside it");
    });

    it("keeps nothing where the digest is another, or the download fails", async () => {
      const dest = join(dir, "home-2", "tools", "tla2tools.jar");
      const other = "0".repeat(64);
      await assert.rejects(downloadJar({ version: "9.9", url: `${origin}/tla2tools.jar`, sha256: other }, dest, env()), (error) =>
        message(error) ===
          `what ${origin}/tla2tools.jar gave is not TLC 9.9: its sha256 is ${sha256}; nothing was kept \u2014 download it yourself, check that its sha256 is ${other}, and set SPEX_TLC_JAR to the file`,
      );
      await assert.rejects(downloadJar({ version: "9.9", url: `${origin}/gone.jar`, sha256 }, dest, env()), (error) =>
        message(error) ===
          `TLC 9.9 could not be downloaded from ${origin}/gone.jar: the server answered 404 \u2014 download it yourself, check that its sha256 is ${sha256}, and set SPEX_TLC_JAR to the file`,
      );
      assert.deepEqual(readdirSync(join(dir, "home-2", "tools")), []);
      assert.equal(existsSync(dest), false);
    });
  });
});

describe("tlc: a real run", () => {
  it("TLC parses the declaration in TLA+ with every form of type, and counts its events and effects", async () => {
    const tools = await findTools();
    const binding = parseBinding(`format: 1
values:
  user: [ann, bob, cy]
  plan: ["free tier", 'a"b', 'c\\d']
events:
  take:
    params: { who: user, plans: set of plan?, at: -1..1, late: bool }
    effect: { holder: user?, days: set of 0..2 }
  reset: {}
`);
    const folder = join(dir, "run");
    mkdirSync(folder);
    writeFileSync(join(folder, "Declaration.tla"), declarationModule(binding, "probe"));
    writeFileSync(
      join(folder, "Probe.tla"),
      [
        "---- MODULE Probe ----",
        "EXTENDS Declaration, TLC",
        'ASSUME PrintT(<<Cardinality(Events), Cardinality(Effects([event |-> "take"])), Effects([event |-> "reset"])>>)',
        'ASSUME PrintT(<<PlanRank("c\\\\d"), UserFirst({"cy", "bob"}), PlanFirst(Plan), Missing \\in User, Missing = "ann">>)',
        "ASSUME PrintT(Plan)",
        "====",
        "",
      ].join("\n"),
    );
    writeFileSync(join(folder, "Probe.cfg"), "CONSTANT Missing = Missing\n");
    const run = await runTlc(tools, folder, "Probe", { seconds: 120 });
    assert.equal(run.status, 0, run.stdout);
    assert.equal(versionOf(run), tools.pinned ? TLC_PIN.version : versionOf(run));
    // 3 users x (8 sets of plans + none) x 3 x 2 takes and a reset; 4 holders x 8 sets of days.
    assert.deepEqual(printed(run), [
      { t: [163, 32, { s: [{ t: [] }] }] },
      { t: [3, "bob", "free tier", false, false] },
      { s: ["a\"b", "c\\d", "free tier"] },
    ]);
    assert.deepEqual(loadedModules(run).sort(), ["Declaration", "FiniteSets", "Integers", "Naturals", "Probe", "Sequences", "TLC"]);
    assert.deepEqual(readdirSync(join(folder, "java-tmp")), [], "TLC leaves nothing in the run's temp folder");
  });
});

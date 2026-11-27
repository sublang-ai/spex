// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-244 and DR-252: TLC's table of the model's
 * steps, read from its state dump, and a shortest sequence to each
 * state. The checks themselves run TLC: the integration suite shows
 * them.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KEPT_FILE, KEPT_MARK, prepareKeep, seconds, tableOf } from "./checks.js";
import { dumpStates } from "./tlc.js";
import { GuardError, parseType, vocabulary, type Declaration } from "./types.js";

const vocab = vocabulary({ user: ["ann", "bob"] });
const declaration: Declaration = {
  vocabulary: vocab,
  events: {
    take: { params: { who: parseType("user", vocab) }, effect: { granted: parseType("bool", vocab) } },
    reset: { params: {}, effect: {} },
  },
};

const state = (n: number): string => `[n |-> ${n}]`;
const row = (from: number, event: string, next: number, effect = "<<>>", applies = false): string =>
  `/\\ state = ${state(from)}\n/\\ step = [ from |-> ${state(from)},\n  event |-> ${event},\n  effect |-> ${effect},\n  next |-> ${state(next)},\n  applies |-> ${applies ? "TRUE" : "FALSE"} ]\n`;
const reached = (n: number): string => `/\\ state = ${state(n)}\n/\\ step = Missing\n`;
const dump = (blocks: string[]): string => blocks.map((block, at) => `State ${at + 1}:\n${block}\n`).join("");

const ANN = '[event |-> "take", who |-> "ann"]';
const BOB = '[who |-> "bob", event |-> "take"]';
const RESET = '[event |-> "reset"]';

describe("checks: TLC's table of the model's steps", () => {
  it("reads every dumped step as a row, in TLC's order, and the start", () => {
    const table = tableOf(
      declaration,
      dumpStates(
        dump([
          reached(0),
          row(0, ANN, 1, "[granted |-> TRUE]"),
          row(0, BOB, 2, "[granted |-> TRUE]"),
          reached(1),
          reached(2),
          row(1, BOB, 3, "[granted |-> FALSE]", true),
          row(2, ANN, 3, "[granted |-> FALSE]", true),
          row(1, RESET, 0),
          reached(3),
          row(3, RESET, 0),
        ]),
      ),
    );
    assert.equal(table.rows.length, 6);
    assert.deepEqual(table.rows[1], {
      from: table.start,
      call: { event: "take", params: { who: "bob" } },
      effect: { granted: true },
      next: table.rows[3].from,
      applies: false,
    });
    assert.deepEqual(table.rows[4].call, { event: "reset", params: {} });
    assert.deepEqual(table.rows[4].effect, {});
    assert.equal(table.rows.filter((one) => one.applies).length, 2);

    // A shortest sequence to each of the four states; of the two to the last, TLC's first.
    assert.equal(table.paths.size, 4);
    assert.deepEqual(table.paths.get(table.start), []);
    const last = table.paths.get(table.rows[5].from) as typeof table.rows;
    assert.deepEqual(last.map((step) => step.call.params.who), ["ann", "bob"]);
    assert.equal(last[0], table.rows[0]);
    assert.equal(last[1], table.rows[2]);
  });

  it("refuses a table that cannot be TLC's", () => {
    const refuse = (blocks: string[]): string => {
      try {
        tableOf(declaration, dumpStates(dump(blocks)));
      } catch (error) {
        assert.ok(error instanceof GuardError);
        return error.message;
      }
      return "";
    };
    assert.equal(refuse([]), "TLC wrote no state of the model");
    assert.equal(refuse([reached(0), row(5, RESET, 0)]), "TLC wrote a step of the model from a state no step reaches");
    assert.equal(refuse([reached(0), row(0, ANN, 1, "[granted |-> 7]")]), "TLC wrote a step of the model that cannot be read");
    assert.equal(refuse([reached(0), row(0, '[event |-> "leave"]', 1)]), "TLC printed an event the declaration does not hold: {event: leave}");
  });
});

describe("checks: the folder of --keep", () => {
  it("makes a marked folder, replaces one it marked and leaves any other alone", () => {
    const keep = realpathSync(mkdtempSync(join(tmpdir(), "spex-guards-keep-")));
    try {
      const folder = prepareKeep(keep, "lock-9");
      assert.equal(folder, join(keep, "lock-9"));
      assert.ok(readFileSync(join(folder, KEPT_FILE), "utf8").startsWith(`${KEPT_MARK}\n`));
      writeFileSync(join(folder, "old.txt"), "x");
      prepareKeep(keep, "lock-9");
      assert.equal(existsSync(join(folder, "old.txt")), false);

      mkdirSync(join(keep, "mine"));
      writeFileSync(join(keep, "mine", "notes.txt"), "x");
      assert.throws(
        () => prepareKeep(keep, "mine"),
        (error) =>
          error instanceof GuardError &&
          error.message === `--keep: ${join(keep, "mine")} was not kept by spex verify — remove it, or name another folder`,
      );
      assert.equal(readFileSync(join(keep, "mine", "notes.txt"), "utf8"), "x");
    } finally {
      rmSync(keep, { recursive: true, force: true });
    }
  });

  it("counts seconds", () => {
    assert.equal(seconds(1), "1 second");
    assert.equal(seconds(300), "300 seconds");
  });
});

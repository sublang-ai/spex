// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The intent queue's order keys (DR-035): rankBetween must always mint
// a key strictly inside the asked-for gap, whatever the neighbours,
// because a reorder writes exactly one row and the queue's meaning IS
// the lexicographic order of these strings.

import { test } from "node:test";
import assert from "node:assert/strict";

import { rankBetween } from "./rank.js";

/** The invariant a key must satisfy to sit in the gap. */
function assertBetween(a: string | null, b: string | null, key: string): void {
  if (a !== null) assert.ok(a < key, `"${key}" must sort after "${a}"`);
  if (b !== null) assert.ok(key < b, `"${key}" must sort before "${b}"`);
  assert.ok(key.length > 0, "a rank key is never empty");
  // Keys never end in the lowest digit, so a key strictly between any
  // two neighbours always exists (rank.ts).
  assert.notEqual(key[key.length - 1], "0", `"${key}" ends in the lowest digit`);
}

test("rankBetween seeds an empty queue and appends strictly after the tail", () => {
  const first = rankBetween(null, null);
  assertBetween(null, null, first);
  const second = rankBetween(first, null);
  assertBetween(first, null, second);
  const third = rankBetween(second, null);
  assertBetween(second, null, third);
});

test("rankBetween inserts strictly before the head", () => {
  const head = rankBetween(null, null);
  const before = rankBetween(null, head);
  assertBetween(null, head, before);
  const beforeStill = rankBetween(null, before);
  assertBetween(null, before, beforeStill);
});

test("rankBetween splits a wide gap, adjacent digits, and prefix neighbours", () => {
  // Wide gap: a free digit exists between the two.
  assertBetween("3", "9", rankBetween("3", "9"));
  // Adjacent digits: no digit fits, so the key extends the low side.
  assertBetween("i", "j", rankBetween("i", "j"));
  // The low key exhausts its digit run against the adjacent high one.
  assertBetween("iz", "j", rankBetween("iz", "j"));
  assertBetween("0z", "1", rankBetween("0z", "1"));
  // The high key extends the low one (a prefix): the split must grow
  // the shared prefix, never fall outside it.
  assertBetween("i", "ii", rankBetween("i", "ii"));
  assertBetween("1", "11", rankBetween("1", "11"));
  assertBetween("1", "10i", rankBetween("1", "10i"));
  // Highest digit runs still leave room above.
  assertBetween("z", null, rankBetween("z", null));
  assertBetween("zz", null, rankBetween("zz", null));
});

test("many sequential tail-appends keep strict ascending order", () => {
  const keys: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < 300; i += 1) {
    const key = rankBetween(last, null);
    assertBetween(last, null, key);
    keys.push(key);
    last = key;
  }
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(new Set(keys).size, keys.length);
});

test("many sequential head-inserts keep strict descending order", () => {
  const keys: string[] = [];
  let first: string | null = null;
  for (let i = 0; i < 300; i += 1) {
    const key = rankBetween(null, first);
    assertBetween(null, first, key);
    keys.unshift(key);
    first = key;
  }
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(new Set(keys).size, keys.length);
});

test("repeated between-insertions never violate the neighbours", () => {
  // Deterministic pseudo-random walk over the tightest gaps, the way
  // a Boss endlessly reprioritizing the queue would produce them.
  const keys = [rankBetween(null, null)];
  keys.push(rankBetween(keys[0], null));
  let seed = 42;
  const next = (bound: number): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % bound;
  };
  for (let i = 0; i < 500; i += 1) {
    const index = next(keys.length - 1);
    const key = rankBetween(keys[index], keys[index + 1]);
    assertBetween(keys[index], keys[index + 1], key);
    keys.splice(index + 1, 0, key);
  }
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(new Set(keys).size, keys.length);
});

test("rankBetween refuses a violated order", () => {
  assert.throws(() => rankBetween("j", "i"), /rank order violated/);
  assert.throws(() => rankBetween("i", "i"), /rank order violated/);
  // The head sentinel reads as the empty string: a bound below every
  // real key still refuses an impossible gap.
  assert.throws(() => rankBetween("i", "0"), /rank order violated/);
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

import { SessionScans, type SessionScan } from "./session-scans.js";

const HELD = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const THIRD = "cccccccc-3333-4333-8333-cccccccccccc";
const FOURTH = "dddddddd-4444-4444-8444-dddddddddddd";
const DELAY = 150;

/** Scans on a controlled clock over a recorded reader. `hold()` keeps the
 * next read from finishing until the function it returns is called;
 * `started(n)` waits until n reads have started. */
function scans(t: TestContext): {
  scans: SessionScans;
  reads: { all: boolean; ids: string[] }[];
  hold(): () => void;
  started(count: number): Promise<void>;
} {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const reads: { all: boolean; ids: string[] }[] = [];
  let gate: Promise<void> | undefined;
  return {
    reads,
    scans: new SessionScans({
      holds: (id) => id === HELD,
      scan: async (scan: SessionScan) => {
        reads.push({ all: scan.all, ids: [...scan.ids].sort() });
        const held = gate;
        gate = undefined;
        await held;
      },
      delayMs: DELAY,
    }),
    hold: () => {
      let release!: () => void;
      gate = new Promise<void>((resolve) => { release = resolve; });
      return release;
    },
    started: async (count) => {
      // Promise turns only: the clock stands still meanwhile.
      while (reads.length < count) await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

test("a file of a session this core holds reads nothing; one naming another session reads that session alone", async (t) => {
  const { scans: s, reads } = scans(t);
  for (const name of [`${HELD}.json`, `${HELD}.replay.json`, `${HELD}.hints.json`, `${HELD}.records.jsonl`, `.${HELD}.lock`]) s.changed(name);
  // Sidecars, temporary files, retired leases and chunk folders are no
  // session's record.
  for (const name of [`${OTHER}.spex.json`, `.${OTHER}.123.abc.tmp`, `.${OTHER}.lock.retired.${THIRD}`, `${OTHER}.chunks`]) s.changed(name);
  t.mock.timers.tick(DELAY);
  await s.settled();
  assert.deepEqual(reads, []);

  for (const name of [`${OTHER}.json`, `${OTHER}.replay.json`, `.${THIRD}.lock`, `${HELD}.json`]) s.changed(name);
  t.mock.timers.tick(DELAY - 1);
  assert.deepEqual(reads, [], "a change waits for others to join it");
  t.mock.timers.tick(1);
  await s.settled();
  assert.deepEqual(reads, [{ all: false, ids: [OTHER, THIRD] }]);
});

test("a change naming no file, or a record under no session's name, reads every session", async (t) => {
  const { scans: s, reads } = scans(t);
  s.changed(null);
  t.mock.timers.tick(DELAY);
  await s.settled();
  s.changed(`${OTHER}.json`);
  s.changed("notes.json");
  t.mock.timers.tick(DELAY);
  await s.settled();
  assert.deepEqual(reads, [{ all: true, ids: [] }, { all: true, ids: [] }]);
});

test("a change while a read waits joins it, though the read in flight ends before the change's own wait would", async (t) => {
  const { scans: s, reads, hold, started } = scans(t);
  const release = hold();
  s.changed(`${OTHER}.json`);
  t.mock.timers.tick(DELAY);
  await started(1);
  s.changed(`${THIRD}.json`);
  t.mock.timers.tick(DELAY);
  // A read of THIRD now waits behind the held one; FOURTH arrives late.
  s.changed(`${FOURTH}.replay.json`);
  release();
  await s.settled();
  t.mock.timers.tick(10 * DELAY);
  await s.settled();
  assert.deepEqual(reads, [{ all: false, ids: [OTHER] }, { all: false, ids: [THIRD, FOURTH] }]);
});

test("changes still on their wait join a read of every session as it starts, and a caller waits for a read begun after its call", async (t) => {
  const { scans: s, reads, hold, started } = scans(t);
  const release = hold();
  s.changed(`${OTHER}.json`);
  t.mock.timers.tick(DELAY);
  await started(1);
  // THIRD's wait has not elapsed when the read of every session starts.
  s.changed(`${THIRD}.json`);
  const order: string[] = [];
  let done = false;
  const asked = s.all(async () => { order.push("before"); }).then(() => { done = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(reads.length, 1, "nothing starts beside the read in flight");
  assert.equal(done, false);
  release();
  await asked;
  t.mock.timers.tick(10 * DELAY);
  await s.settled();
  assert.deepEqual(reads, [{ all: false, ids: [OTHER] }, { all: true, ids: [] }]);
  assert.deepEqual(order, ["before"]);
});

test("settled waits for changes still on their wait to be read", async (t) => {
  const { scans: s, reads } = scans(t);
  s.changed(`${OTHER}.json`);
  let settled = false;
  const waiting = s.settled().then(() => { settled = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  t.mock.timers.tick(DELAY);
  await waiting;
  assert.deepEqual(reads, [{ all: false, ids: [OTHER] }]);
});

test("a caller is refused by its own preparation's failure alone, and by a read's", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fail = false;
  const reads: SessionScan[] = [];
  const s = new SessionScans({ holds: () => false, scan: async (scan) => { reads.push(scan); if (fail) throw new Error("unreadable"); }, delayMs: DELAY });
  const refused = s.all(async () => { throw new Error("not prepared"); });
  const served = s.all();
  await assert.rejects(refused, /not prepared/);
  await served;
  fail = true;
  await assert.rejects(s.all(), /unreadable/);
  // A failed read noted from a change stops nothing after it.
  s.changed(null);
  t.mock.timers.tick(DELAY);
  await s.settled();
  assert.equal(reads.length, 3);
  s.stop();
  s.changed(null);
  t.mock.timers.tick(DELAY);
  await s.settled();
  assert.equal(reads.length, 3, "nothing is noted once stopped");
});

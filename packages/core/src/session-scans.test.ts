// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";

import { SessionScans, type SessionScan } from "./session-scans.js";

const HELD = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const THIRD = "cccccccc-3333-4333-8333-cccccccccccc";

/** Scans over a recorded reader: each read waits for `next()` where
 * `held` is set. */
function scans(): { scans: SessionScans; reads: { all: boolean; ids: string[] }[]; hold(): () => void } {
  const reads: { all: boolean; ids: string[] }[] = [];
  let gate: Promise<void> | undefined;
  return {
    reads,
    scans: new SessionScans({
      holds: (id) => id === HELD,
      scan: async (scan: SessionScan) => {
        reads.push({ all: scan.all, ids: [...scan.ids].sort() });
        await gate;
      },
      delayMs: 5,
    }),
    hold: () => {
      let release!: () => void;
      gate = new Promise<void>((resolve) => { release = resolve; });
      return () => { gate = undefined; release(); };
    },
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test("a file of a session this core holds reads nothing; one naming another session reads that session alone", async () => {
  const { scans: s, reads } = scans();
  for (const name of [`${HELD}.json`, `${HELD}.replay.json`, `${HELD}.hints.json`, `${HELD}.records.jsonl`, `.${HELD}.lock`]) s.changed(name);
  // Sidecars, temporary files, retired leases and chunk folders are no
  // session's record.
  for (const name of [`${OTHER}.spex.json`, `.${OTHER}.123.abc.tmp`, `.${OTHER}.lock.retired.${THIRD}`, `${OTHER}.chunks`]) s.changed(name);
  await sleep(20);
  await s.settled();
  assert.deepEqual(reads, []);

  for (const name of [`${OTHER}.json`, `${OTHER}.replay.json`, `.${THIRD}.lock`, `${HELD}.json`]) s.changed(name);
  await sleep(20);
  await s.settled();
  assert.deepEqual(reads, [{ all: false, ids: [OTHER, THIRD] }]);
});

test("a change naming no file, or a record under no session's name, reads every session", async () => {
  const { scans: s, reads } = scans();
  s.changed(null);
  await sleep(20);
  await s.settled();
  s.changed(`${OTHER}.json`);
  s.changed("notes.json");
  await sleep(20);
  await s.settled();
  assert.deepEqual(reads, [{ all: true, ids: [] }, { all: true, ids: [] }]);
});

test("changes during a read share the one read waiting behind it, and a caller waits for a read begun after its call", async () => {
  const { scans: s, reads, hold } = scans();
  const release = hold();
  s.changed(`${OTHER}.json`);
  await sleep(20);
  assert.equal(reads.length, 1, "the first read is in flight");
  for (let burst = 0; burst < 3; burst += 1) {
    s.changed(`${OTHER}.replay.json`);
    s.changed(`${THIRD}.json`);
    await sleep(20);
  }
  let done = false;
  const order: string[] = [];
  const asked = s.all(async () => { order.push("before"); }).then(() => { done = true; });
  await sleep(20);
  assert.equal(reads.length, 1, "nothing starts beside the read in flight");
  assert.equal(done, false);
  release();
  await asked;
  await s.settled();
  assert.deepEqual(reads, [{ all: false, ids: [OTHER] }, { all: true, ids: [] }]);
  assert.deepEqual(order, ["before"]);
});

test("a caller is refused by its own preparation's failure alone, and by a read's", async () => {
  let fail = false;
  const s = new SessionScans({ holds: () => false, scan: async () => { if (fail) throw new Error("unreadable"); }, delayMs: 5 });
  const refused = s.all(async () => { throw new Error("not prepared"); });
  const served = s.all();
  await assert.rejects(refused, /not prepared/);
  await served;
  fail = true;
  await assert.rejects(s.all(), /unreadable/);
  s.changed(null);
  await sleep(20);
  await s.settled();
  s.stop();
  s.changed(null);
  await sleep(20);
  await s.settled();
});

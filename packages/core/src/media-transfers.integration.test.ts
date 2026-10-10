// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaTransfers, MediaTransferError, type UploadRequest } from "./media-transfers.js";
import { MEDIA_CHUNK_BYTES, MEDIA_MAX_FILE_BYTES } from "./protocol.js";

const base64 = (text: string) => Buffer.from(text).toString("base64");

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "spex-media-transfer-"));
  let clock = 0;
  let publications = 0;
  // What each upload took at its begin, and how often it was released.
  const holds: { uploadId: string; released: number }[] = [];
  let refusing = false;
  let pause: { entered: () => void; barrier: Promise<void> } | undefined;
  const transfers = new MediaTransfers({
    directory: join(directory, "uploads"),
    now: () => clock,
    hold(request) {
      const hold = { uploadId: request.uploadId, released: 0 };
      holds.push(hold);
      return { release() { hold.released++; } };
    },
    async publish(request, path) {
      if (refusing) { refusing = false; throw new MediaTransferError("unavailable", "refused publication"); }
      const paused = pause;
      pause = undefined;
      if (paused) { paused.entered(); await paused.barrier; }
      const bytes = await readFile(path);
      const hash = createHash("sha256").update(bytes).digest("hex");
      await writeFile(join(directory, hash), bytes, { mode: 0o600 });
      publications++;
      return { assetId: `sha256:${hash}`, byteLength: bytes.length, mimeType: request.mimeType, name: request.name };
    },
  });
  const request = (byteLength = 6): UploadRequest => ({
    uploadId: randomUUID(), owner: { kind: "project", id: `tester/p-${randomUUID()}-spex` },
    name: "user selection.png", mimeType: "image/png", byteLength,
  });
  return {
    transfers, directory, request,
    publications: () => publications,
    /** The release count of each hold an upload ID took, in order. */
    holds: (uploadId: string) => holds.filter((hold) => hold.uploadId === uploadId).map((hold) => hold.released),
    allHolds: () => holds.map((hold) => hold.released),
    refuseNext: () => { refusing = true; },
    /** The next publication waits, once reached, until released. */
    pauseNext: () => {
      let entered!: () => void, release!: () => void;
      const reached = new Promise<void>((resolve) => { entered = resolve; });
      pause = { entered, barrier: new Promise<void>((resolve) => { release = resolve; }) };
      return { reached, release };
    },
    advance: (ms: number) => { clock += ms; },
    async cleanup() { await transfers.close(); await rm(directory, { recursive: true, force: true }); },
  };
}

test("upload retries preserve exact bytes and publish before an idempotent finish", async () => {
  const f = await fixture();
  try {
    const request = f.request();
    const [left, right] = await Promise.all([f.transfers.begin(request), f.transfers.begin({ ...request })]);
    assert.deepEqual(left, right);
    await f.transfers.chunk(request.uploadId, 0, base64("abc"));
    assert.equal((await f.transfers.begin(request)).offset, 3);
    await f.transfers.chunk(request.uploadId, 0, base64("abc"));
    await f.transfers.chunk(request.uploadId, 3, base64("def"));
    const [first, second] = await Promise.all([f.transfers.finish(request.uploadId), f.transfers.finish(request.uploadId)]);
    assert.deepEqual(first, second);
    assert.equal(f.publications(), 1);
    assert.equal(first.asset.assetId, `sha256:${createHash("sha256").update("abcdef").digest("hex")}`);
    assert.equal((await readFile(join(f.directory, first.asset.assetId.slice(7)))).toString(), "abcdef");
    assert.deepEqual(await readdir(join(f.directory, "uploads")), []);
    assert.deepEqual(await f.transfers.begin(request), first);
    assert.equal((await f.transfers.cancel(request.uploadId)).canceled, false);
  } finally { await f.cleanup(); }
});

test("conflicting IDs, chunks, malformed bytes and overflows do not corrupt a transfer", async () => {
  const f = await fixture();
  try {
    const request = f.request();
    await f.transfers.begin(request);
    await assert.rejects(f.transfers.begin({ ...request, name: "different.png" }), MediaTransferError);
    await assert.rejects(f.transfers.begin({ ...request, owner: { kind: "draft", projectId: "tester/proj-spex", id: "different", instance: "72000000-0000-4000-8000-000000000001" } }), MediaTransferError);
    await f.transfers.chunk(request.uploadId, 0, base64("abc"));
    for (const [offset, data] of [
      [0, base64("bad")], [2, base64("cde")], [4, base64("d")],
      [3, base64("defg")], [3, "YQ= "], [3, "YR=="], [3, ""],
      [3, Buffer.alloc(MEDIA_CHUNK_BYTES + 1).toString("base64")],
    ] as const) {
      await assert.rejects(f.transfers.chunk(request.uploadId, offset, data), MediaTransferError);
      assert.equal((await f.transfers.begin(request)).offset, 3);
    }
    await assert.rejects(f.transfers.finish(request.uploadId), MediaTransferError);
    await f.transfers.chunk(request.uploadId, 3, base64("def"));
    assert.equal((await f.transfers.finish(request.uploadId)).offset, 6);
  } finally { await f.cleanup(); }
});

test("cancel, expiry and close remove staging while keeping completed owner bytes", async () => {
  const f = await fixture();
  try {
    const completed = f.request(0);
    await f.transfers.begin(completed);
    const { asset } = await f.transfers.finish(completed.uploadId);
    const canceled = f.request();
    await f.transfers.begin(canceled);
    await f.transfers.chunk(canceled.uploadId, 0, base64("abc"));
    assert.equal((await f.transfers.cancel(canceled.uploadId)).canceled, true);
    assert.equal((await f.transfers.cancel(canceled.uploadId)).canceled, false);
    await assert.rejects(f.transfers.finish(canceled.uploadId), MediaTransferError);
    const idle = f.request();
    await f.transfers.begin(idle);
    f.advance(30 * 60 * 1000);
    await f.transfers.expire();
    await assert.rejects(f.transfers.finish(idle.uploadId), MediaTransferError);
    assert.equal((await readFile(join(f.directory, asset.assetId.slice(7)))).length, 0);
    const inFlight = f.transfers.begin(f.request());
    await f.transfers.close();
    await inFlight;
    assert.deepEqual(await readdir(join(f.directory, "uploads")), []);
    await assert.rejects(f.transfers.begin(f.request()), MediaTransferError);
  } finally { await f.cleanup(); }
});

test("each upload keeps what it took at its begin until it ends, released once and never by another upload under its ID", async () => {
  const f = await fixture();
  let paused: { reached: Promise<void>; release: () => void } | undefined;
  try {
    // A begin failing on its staging directory, a regular file standing
    // there, releases what it took.
    const failed = f.request();
    await writeFile(join(f.directory, "uploads"), "");
    await assert.rejects(f.transfers.begin(failed));
    assert.deepEqual(f.holds(failed.uploadId), [1]);
    await rm(join(f.directory, "uploads"));
    // Repeated begins share one hold; a refused publication keeps it for
    // the retry; success releases it; a completed retry takes none.
    const done = f.request(3);
    await Promise.all([f.transfers.begin(done), f.transfers.begin({ ...done })]);
    await f.transfers.chunk(done.uploadId, 0, base64("abc"));
    f.refuseNext();
    await assert.rejects(f.transfers.finish(done.uploadId), MediaTransferError);
    assert.deepEqual(f.holds(done.uploadId), [0], "a refused publication keeps its hold");
    await f.transfers.finish(done.uploadId);
    await f.transfers.begin(done);
    await f.transfers.finish(done.uploadId);
    assert.deepEqual(f.holds(done.uploadId), [1], "released on success, nothing taken again");
    // Cancel and expiry release once.
    const canceled = f.request();
    await f.transfers.begin(canceled);
    await f.transfers.cancel(canceled.uploadId);
    await f.transfers.cancel(canceled.uploadId);
    assert.deepEqual(f.holds(canceled.uploadId), [1]);
    const idle = f.request();
    await f.transfers.begin(idle);
    f.advance(30 * 60 * 1000);
    await f.transfers.expire();
    assert.deepEqual(f.holds(idle.uploadId), [1]);
    // Retirement keeps the hold through a running publication. Expired
    // meanwhile, its client ID begins a successor with its own staging,
    // which the retired upload's cleanup neither removes nor releases.
    const retired = f.request(3);
    await f.transfers.begin(retired);
    await f.transfers.chunk(retired.uploadId, 0, base64("abc"));
    paused = f.pauseNext();
    const finishing = f.transfers.finish(retired.uploadId);
    await paused.reached;
    const retiring = f.transfers.retireOwner(retired.owner);
    f.advance(30 * 60 * 1000);
    await f.transfers.expire();
    assert.equal((await f.transfers.begin(retired)).offset, 0, "the successor starts afresh");
    await f.transfers.chunk(retired.uploadId, 0, base64("xyz"));
    assert.deepEqual(f.holds(retired.uploadId), [0, 0], "the running publication's hold stands");
    paused.release();
    await finishing;
    await retiring;
    assert.deepEqual(f.holds(retired.uploadId), [1, 0], "the old cleanup released its own hold once, not the successor's");
    const successor = await f.transfers.finish(retired.uploadId);
    assert.equal(successor.asset.assetId, `sha256:${createHash("sha256").update("xyz").digest("hex")}`);
    assert.equal((await readFile(join(f.directory, successor.asset.assetId.slice(7)))).toString(), "xyz", "the successor published its own bytes");
    assert.deepEqual(f.holds(retired.uploadId), [1, 1]);
    // Close releases every hold still taken, an in-flight begin's included.
    const inFlight = f.transfers.begin(f.request());
    await f.transfers.close();
    await inFlight;
    assert.ok(f.allHolds().every((released) => released === 1), "every hold released exactly once");
  } finally { paused?.release(); await f.cleanup(); }
});

test("upload reservations enforce file/count/aggregate bounds and release after cancellation", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.transfers.begin(f.request(MEDIA_MAX_FILE_BYTES + 1)), MediaTransferError);
    await assert.rejects(f.transfers.begin({ ...f.request(), uploadId: "../escape" }), MediaTransferError);
    const uploads: UploadRequest[] = [];
    for (let index = 0; index < 32; index++) {
      const request = f.request(0);
      uploads.push(request);
      await f.transfers.begin(request);
    }
    await assert.rejects(f.transfers.begin(f.request()), MediaTransferError);
    await Promise.all(uploads.map((request) => f.transfers.cancel(request.uploadId)));
    for (let index = 0; index < 10; index++) await f.transfers.begin(f.request(MEDIA_MAX_FILE_BYTES));
    await assert.rejects(f.transfers.begin(f.request(MEDIA_MAX_FILE_BYTES)), MediaTransferError);
    assert.equal(f.publications(), 0);
  } finally { await f.cleanup(); }
});

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
  const transfers = new MediaTransfers({
    directory: join(directory, "uploads"),
    now: () => clock,
    async publish(request, path) {
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

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApplicationMedia } from "./media.js";
import type { MediaUploadOwner } from "./protocol.js";

test("media-18: owner retirement drains real publication without blocking another owner or reusing a reader", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-owner-"));
  const a = {kind: "draft" as const, id: "first"};
  const b = {kind: "draft" as const, id: "second"};
  const owners = new Set([a.id, b.id]);
  let entered!: () => void;
  const publishing = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  let pause = true;
  // Delay only the publication boundary; all imports, ownership checks,
  // verified readers and deletion below execute the real implementations.
  class DelayedMedia extends ApplicationMedia {
    override ownerStore(owner: MediaUploadOwner, write = false) {
      const store = super.ownerStore(owner, write);
      return owner.id === a.id && write && pause ? {...store, importAsset: async (input: Parameters<typeof store.importAsset>[0]) => {
        entered(); await barrier; return store.importAsset(input);
      }} : store;
    }
  }
  const media = new DelayedMedia({home,
    assertOwner(owner) { assert.ok(owners.has(owner.id), "owner must exist"); },
    async openSessionAsset() { throw new Error("No session in this fixture"); },
  });
  const request = (owner: typeof a) => ({owner, uploadId: randomUUID(), name: "evidence.txt", mimeType: "text/plain", byteLength: 4});
  const first = request(a), second = request(b);
  try {
    await media.prepare();
    for (const input of [first, second]) {
      media.ownerStore(input.owner, true);
      await media.uploads.begin(input);
      await media.uploads.chunk(input.uploadId, 0, Buffer.from("kept").toString("base64"));
    }
    const finished = media.uploads.finish(first.uploadId);
    await publishing;
    let removed = false;
    const retiring = media.retireOwner(a, async () => {
      owners.delete(a.id);
      await rm(join(home, "local", "drafts", a.id), {recursive: true, force: true});
      removed = true;
    });
    assert.equal(removed, false, "removal must wait for publication");
    assert.throws(() => media.ownerStore(a, true), /unavailable/);
    const other = await media.uploads.finish(second.uploadId);
    const chunk = await media.read(b, other.asset.assetId, 0, 1);
    assert.equal(chunk.eof, false, "keep a verified reader cached");
    assert.equal(removed, false, "another owner continues while the first drains");
    pause = false; release();
    await finished;
    await retiring;
    assert.equal(existsSync(join(home, "local", "drafts", a.id)), false);
    owners.add(a.id);
    await mkdir(join(home, "local", "drafts", a.id), {recursive: true});
    await assert.rejects(media.uploads.begin(first), /canceled|expired/);
    await assert.rejects(media.uploads.finish(first.uploadId), /canceled|expired/);
    assert.deepEqual(await readdir(join(home, "local", "drafts", a.id)), []);

    // Recreate exactly the same content digest at a new inode. A retained
    // old reader would fail its identity check instead of reading this copy.
    await media.retireOwner(b, () => rm(join(home, "local", "drafts", b.id), {recursive: true, force: true}));
    const replacement = {...second, uploadId: randomUUID()};
    await media.uploads.begin(replacement);
    await media.uploads.chunk(replacement.uploadId, 0, Buffer.from("kept").toString("base64"));
    await media.uploads.finish(replacement.uploadId);
    assert.equal((await media.read(b, other.asset.assetId, 0, 4)).data, Buffer.from("kept").toString("base64"));
  } finally { release(); await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: retirement drains admitted validation before deleting its prepared owner", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-validation-"));
  const owner = {kind: "draft" as const, id: "validating"};
  let entered!: () => void, release!: () => void;
  const preparing = new Promise<void>((resolve) => { entered = resolve; });
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  class DelayedMedia extends ApplicationMedia {
    override ownerStore(value: MediaUploadOwner, write = false) {
      const store = super.ownerStore(value, write);
      return {...store, prepare: async () => { entered(); await barrier; await store.prepare(); }};
    }
  }
  const media = new DelayedMedia({home, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  let retiring: Promise<void> | undefined;
  try {
    await media.prepare();
    const validation = media.validate(owner, []);
    await preparing;
    let removed = false;
    retiring = media.retireOwner(owner, async () => {
      await rm(join(home, "local", "drafts", owner.id), {recursive: true, force: true}); removed = true;
    });
    await assert.rejects(media.validate(owner, []), /unavailable/);
    assert.equal(removed, false);
    release();
    await Promise.all([validation, retiring]);
    assert.equal(existsSync(join(home, "local", "drafts", owner.id)), false, "prepare cannot resurrect the removed owner");
  } finally { release(); await retiring; await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: retirement drains a real reader already evicted from the cache", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-reader-"));
  const a = {kind: "draft" as const, id: "evicted"};
  const b = {kind: "draft" as const, id: "other"};
  let entered!: () => void, release!: () => void;
  const closing = new Promise<void>((resolve) => { entered = resolve; });
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  class DelayedMedia extends ApplicationMedia {
    override ownerStore(owner: MediaUploadOwner, write = false) {
      const store = super.ownerStore(owner, write);
      return owner.id === a.id ? {...store, openAsset: async (...args: Parameters<typeof store.openAsset>) => {
        const reader = await store.openAsset(...args);
        return {...reader, close: async () => { entered(); await barrier; await reader.close(); }};
      }} : store;
    }
  }
  const media = new DelayedMedia({home, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  let retiring: Promise<void> | undefined;
  try {
    await media.prepare();
    const first = await media.ownerStore(a, true).importAsset({bytes: Buffer.from("first"), mimeType: "text/plain", name: "first.txt"});
    await media.read(a, first.assetId, 0, 1);
    const other = media.ownerStore(b, true);
    for (let n = 0; n < 31; n++) {
      const asset = await other.importAsset({bytes: Buffer.from(`other-${n}`), mimeType: "text/plain", name: "other.txt"});
      await media.read(b, asset.assetId, 0, 1);
    }
    const last = await other.importAsset({bytes: Buffer.from("last"), mimeType: "text/plain", name: "last.txt"});
    const eviction = media.read(b, last.assetId, 0, 1);
    await closing;
    let removed = false;
    retiring = media.retireOwner(a, async () => {
      await rm(join(home, "local", "drafts", a.id), {recursive: true, force: true}); removed = true;
    });
    await media.validate(b, []);
    assert.equal(removed, false, "an evicted reader still belongs to its owner's lifetime");
    release();
    await Promise.all([eviction, retiring]);
    assert.equal(existsSync(join(home, "local", "drafts", a.id)), false);
  } finally { release(); await retiring; await media.close(); await rm(home, {recursive: true, force: true}); }
});

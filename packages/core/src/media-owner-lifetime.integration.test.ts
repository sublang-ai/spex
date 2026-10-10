// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rename, rm, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync, type BigIntStats } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApplicationMedia } from "./media.js";
import { mediaOwnerKey, type MediaUploadOwner } from "./protocol.js";

// An authoring session's assets sit beside its file in its project's
// spex repository (media-4, storage-23). Owner removal waits for no
// upload, validation or reader (media-17): a publication meets its owner
// as it stands at its own instant.
const PROJECT = "tester/proj-spex";
const draft = (id: string) => ({kind: "draft" as const, projectId: PROJECT, id, instance: "72000000-0000-4000-8000-000000000001"});
const cloneOf = (home: string, moved = false) => join(home, "workspace", "tester", moved ? "moved-spex" : "proj-spex");
const assetsDir = (home: string, id: string, moved = false) => join(cloneOf(home, moved), "authoring", `${id}.assets`);

/** A fixture whose clone the test may remove or move: `place.moved`
 * names where the core's index now finds it. */
function fixture(home: string) {
  const place = {moved: false};
  return {
    place,
    options: {
      home,
      directoryOf: (owner: MediaUploadOwner): string => {
        if (owner.kind === "draft") return assetsDir(home, owner.id, place.moved);
        if (owner.kind === "intent") return join(cloneOf(home, place.moved), "intents", `${owner.intentId}.assets`);
        throw new Error("Only authoring and intent owners in this fixture");
      },
      rootOf: () => cloneOf(home, place.moved),
    },
  };
}

/** The folder standing at `path` replaced by a successor holding one
 * file of its own, as `rm -rf` then `mkdir` do: the identities of both. */
async function replace(path: string): Promise<{original: string; successor: string}> {
  const identity = (info: BigIntStats) => `${info.dev}:${info.ino}`;
  const original = identity(await stat(path, {bigint: true}));
  await rm(path, {recursive: true, force: true});
  await mkdir(path, {recursive: true});
  await writeFile(join(path, "successor"), "mine");
  return {original, successor: identity(await stat(path, {bigint: true}))};
}

/** Media one of whose steps waits while a gate is armed — a
 * publication's private preparation ("import"), or an owner store's own
 * preparation ("prepare", a validation's) — the first such step taking
 * the gate. Every check, import, publication, reader and deletion stays
 * real. */
function pausing(at: "import" | "prepare" = "import") {
  let gate: { entered: () => void; barrier: Promise<void> } | undefined;
  const releases: (() => void)[] = [];
  const arm = (): { reached: Promise<void>; release: () => void } => {
    let entered!: () => void, release!: () => void;
    const reached = new Promise<void>((resolve) => { entered = resolve; });
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    gate = { entered, barrier };
    releases.push(release);
    return { reached, release };
  };
  const wait = async (): Promise<void> => {
    const current = gate;
    if (!current) return;
    gate = undefined;
    current.entered();
    await current.barrier;
  };
  class PausedMedia extends ApplicationMedia {
    override importInto(...[prepare, place]: Parameters<ApplicationMedia["importInto"]>) {
      if (at !== "import") return super.importInto(prepare, place);
      return super.importInto(async (stage) => { const reference = await prepare(stage); await wait(); return reference; }, place);
    }
    override ownerStore(owner: MediaUploadOwner, write = false) {
      const store = super.ownerStore(owner, write);
      return at === "prepare" && gate ? {...store, prepare: async () => { await wait(); await store.prepare(); }} : store;
    }
  }
  return { PausedMedia, arm, releaseAll: () => { for (const release of releases) release(); } };
}

const request = (owner: MediaUploadOwner, byteLength = 4) => ({owner, uploadId: randomUUID(), name: "evidence.txt", mimeType: "text/plain", byteLength});

test("media-18: removal waits for no publication; a publication finding its owner gone is refused and recreates nothing, another owner continuing", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-owner-"));
  await mkdir(cloneOf(home), {recursive: true});
  const a = draft("first");
  const b = draft("second");
  const owners = new Set([mediaOwnerKey(a), mediaOwnerKey(b)]);
  const {PausedMedia, arm, releaseAll} = pausing();
  const {options} = fixture(home);
  const media = new PausedMedia({...options,
    assertOwner(owner) { if (!owners.has(mediaOwnerKey(owner))) throw new Error("no such owner"); },
    async openSessionAsset() { throw new Error("No session in this fixture"); },
  });
  const first = request(a), second = request(b);
  try {
    await media.prepare();
    for (const input of [first, second]) {
      await media.begin(input);
      await media.uploads.chunk(input.uploadId, 0, Buffer.from("kept").toString("base64"));
    }
    const {reached, release} = arm();
    const finished = media.uploads.finish(first.uploadId);
    await reached;
    // The removal runs to its end while the publication is in flight.
    await media.retireOwner(a, async () => {
      owners.delete(mediaOwnerKey(a));
      await rm(assetsDir(home, a.id), {recursive: true, force: true});
    });
    assert.equal(existsSync(assetsDir(home, a.id)), false, "removed without waiting");
    const other = await media.uploads.finish(second.uploadId);
    assert.equal((await media.read(b, other.asset.assetId, 0, 4)).data, Buffer.from("kept").toString("base64"), "another owner continues");
    release();
    await assert.rejects(finished, /unavailable/);
    assert.equal(existsSync(assetsDir(home, a.id)), false, "the refused publication recreates nothing");
    // The owner standing again under its name does not revive old ids.
    owners.add(mediaOwnerKey(a));
    await mkdir(assetsDir(home, a.id), {recursive: true});
    await assert.rejects(media.uploads.begin(first), /canceled|expired/);
    await assert.rejects(media.uploads.finish(first.uploadId), /canceled|expired/);
    assert.deepEqual(await readdir(assetsDir(home, a.id)), []);
  } finally { releaseAll(); await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: a publication prepared privately lands where its clone now lies, is refused where the clone went or was replaced, and never recreates a former clone or touches a successor", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-moved-"));
  await mkdir(cloneOf(home), {recursive: true});
  const owner = draft("moving");
  const {PausedMedia, arm, releaseAll} = pausing();
  const {options, place} = fixture(home);
  const media = new PausedMedia({...options, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  const moving = request(owner), replaced = request(owner), gone = request(owner);
  try {
    await media.prepare();
    for (const input of [moving, replaced, gone]) {
      await media.begin(input);
      await media.uploads.chunk(input.uploadId, 0, Buffer.from("kept").toString("base64"));
    }
    const moved = arm();
    const finished = media.uploads.finish(moving.uploadId);
    await moved.reached;
    // Nothing reached the owner while the content was prepared.
    assert.equal(existsSync(assetsDir(home, owner.id)), false, "preparation writes only its private stage");
    // The clone moves at its instant, the index following it.
    await rename(cloneOf(home), cloneOf(home, true));
    place.moved = true;
    moved.release();
    const landed = await finished;
    assert.ok(existsSync(join(assetsDir(home, owner.id, true), landed.asset.assetId.slice("sha256:".length))), "resolved where the clone lies now");
    assert.equal(existsSync(cloneOf(home)), false, "the former clone is not recreated");
    // A clone replaced by a successor at its place while the content was
    // prepared: the publication is refused and the successor untouched.
    const held = arm();
    const refused = media.uploads.finish(replaced.uploadId);
    await held.reached;
    const {original, successor} = await replace(cloneOf(home, true));
    assert.notEqual(successor, original, "the clone the upload began in stays held, so its successor is another folder");
    held.release();
    await assert.rejects(refused, /unavailable/);
    assert.deepEqual(await readdir(cloneOf(home, true)), ["successor"], "the successor is untouched");
    // A clone removed outright: the publication finds no clone to write in.
    await rm(cloneOf(home, true), {recursive: true, force: true});
    await assert.rejects(media.uploads.finish(gone.uploadId), /unavailable/);
    assert.equal(existsSync(cloneOf(home, true)), false, "nor is the removed one");
  } finally { releaseAll(); await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: an upload whose clone was replaced before its finish is refused, a repeated begin resuming it and a retried finish refused alike, the successor untouched", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-early-"));
  await mkdir(cloneOf(home), {recursive: true});
  const owner = draft("early");
  const {options} = fixture(home);
  const media = new ApplicationMedia({...options, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  const early = request(owner);
  try {
    await media.prepare();
    await media.begin(early);
    await media.uploads.chunk(early.uploadId, 0, Buffer.from("kept").toString("base64"));
    // Replaced between the begin and the finish, with no step in flight.
    const {original, successor} = await replace(cloneOf(home));
    assert.notEqual(successor, original, "the clone the upload began in stays held, so its successor is another folder");
    assert.equal((await media.begin(early)).offset, 4, "a repeated begin resumes the upload it began");
    await assert.rejects(media.uploads.finish(early.uploadId), /unavailable/);
    await assert.rejects(media.uploads.finish(early.uploadId), /unavailable/, "a retried finish is refused alike");
    assert.deepEqual(await readdir(cloneOf(home)), ["successor"], "the successor is untouched");
    // Canceled, it is let go; an upload begun now publishes into the successor.
    assert.equal((await media.uploads.cancel(early.uploadId)).canceled, true);
    const fresh = request(owner);
    await media.begin(fresh);
    await media.uploads.chunk(fresh.uploadId, 0, Buffer.from("kept").toString("base64"));
    const landed = await media.uploads.finish(fresh.uploadId);
    assert.ok(existsSync(join(assetsDir(home, owner.id), landed.asset.assetId.slice("sha256:".length))), "published in the clone standing at its begin");
  } finally { await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: an adoption into an intent whose clone was replaced while its copy was prepared is refused, the successor untouched", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-adopt-"));
  await mkdir(cloneOf(home), {recursive: true});
  const source = draft("staged");
  const destination = {kind: "intent" as const, projectId: PROJECT, intentId: randomUUID()};
  const {PausedMedia, arm, releaseAll} = pausing();
  const {options} = fixture(home);
  const media = new PausedMedia({...options, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  try {
    await media.prepare();
    const asset = await media.ownerStore(source, true).importAsset({bytes: Buffer.from("kept"), mimeType: "text/plain", name: "evidence.txt"});
    const held = arm();
    const adoption = media.adopt(destination, [source], [asset]);
    await held.reached;
    const {original, successor} = await replace(cloneOf(home));
    assert.notEqual(successor, original, "the clone the adoption began in stays held, so its successor is another folder");
    held.release();
    await assert.rejects(adoption, /unavailable/);
    assert.deepEqual(await readdir(cloneOf(home)), ["successor"], "the successor is untouched");
  } finally { releaseAll(); await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: a publication meeting a damaged file already in its owner is refused by the facade's verification, the published files standing", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-damaged-"));
  await mkdir(cloneOf(home), {recursive: true});
  const owner = draft("damaged");
  const {options} = fixture(home);
  const media = new ApplicationMedia({...options, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  try {
    await media.prepare();
    const hash = createHash("sha256").update("kept").digest("hex");
    await mkdir(assetsDir(home, owner.id), {recursive: true, mode: 0o700});
    await writeFile(join(assetsDir(home, owner.id), hash), "torn", {mode: 0o600});
    const upload = request(owner);
    await media.begin(upload);
    await media.uploads.chunk(upload.uploadId, 0, Buffer.from("kept").toString("base64"));
    await assert.rejects(media.uploads.finish(upload.uploadId));
    assert.deepEqual((await readdir(assetsDir(home, owner.id))).sort(), [hash, `${hash}.json`], "the descriptor landed beside the file that stood");
  } finally { await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: a removal its owner refuses invalidates nothing, so in-flight uploads stay resumable", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-refused-"));
  await mkdir(cloneOf(home), {recursive: true});
  const owner = draft("kept");
  const {options} = fixture(home);
  const media = new ApplicationMedia({...options, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  // The draft's own deletion rule: refused while a compile runs.
  const assertDeletable = () => { throw new Error("busy: a compile is running for kept; cancel it first"); };
  const inFlight = request(owner, 8);
  try {
    await media.prepare();
    await media.begin(inFlight);
    await media.uploads.chunk(inFlight.uploadId, 0, Buffer.from("half").toString("base64"));
    let removed = false;
    await assert.rejects(media.retireOwner(owner, async () => {
      await rm(assetsDir(home, owner.id), {recursive: true, force: true});
      removed = true;
    }, assertDeletable), /a compile is running/);
    assert.equal(removed, false);
    assert.equal((await media.begin(inFlight)).offset, 4);
    await media.uploads.chunk(inFlight.uploadId, 4, Buffer.from("more").toString("base64"));
    const done = await media.uploads.finish(inFlight.uploadId);
    assert.equal((await media.read(owner, done.asset.assetId, 0, 8)).data, Buffer.from("halfmore").toString("base64"));
  } finally { await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: removal waits for no validation, and a validation's preparation cannot resurrect the removed owner", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-validation-"));
  await mkdir(cloneOf(home), {recursive: true});
  const owner = draft("validating");
  const {PausedMedia, arm, releaseAll} = pausing("prepare");
  const {options} = fixture(home);
  const media = new PausedMedia({...options, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  try {
    await media.prepare();
    await mkdir(assetsDir(home, owner.id), {recursive: true, mode: 0o700});
    const {reached, release} = arm();
    const validation = media.validate(owner, []);
    await reached;
    let removed = false;
    await media.retireOwner(owner, async () => {
      await rm(assetsDir(home, owner.id), {recursive: true, force: true}); removed = true;
    });
    assert.equal(removed, true, "the removal did not wait for the validation");
    release();
    await validation;
    assert.equal(existsSync(assetsDir(home, owner.id)), false, "prepare cannot resurrect the removed owner");
  } finally { releaseAll(); await media.close(); await rm(home, {recursive: true, force: true}); }
});

test("media-18: removal waits for no reader, closing its owner's cached readers", {timeout: 10_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "spex-media-reader-"));
  await mkdir(cloneOf(home), {recursive: true});
  const a = draft("read");
  let entered!: () => void, release!: () => void;
  const closing = new Promise<void>((resolve) => { entered = resolve; });
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  class SlowClose extends ApplicationMedia {
    override ownerStore(owner: MediaUploadOwner, write = false) {
      const store = super.ownerStore(owner, write);
      return {...store, openAsset: async (...args: Parameters<typeof store.openAsset>) => {
        const reader = await store.openAsset(...args);
        return {...reader, close: async () => { entered(); await barrier; await reader.close(); }};
      }};
    }
  }
  const {options} = fixture(home);
  const media = new SlowClose({...options, assertOwner() {}, async openSessionAsset() { throw new Error("No session"); }});
  try {
    await media.prepare();
    const first = await media.ownerStore(a, true).importAsset({bytes: Buffer.from("first"), mimeType: "text/plain", name: "first.txt"});
    await media.read(a, first.assetId, 0, 1);
    let removed = false;
    await media.retireOwner(a, async () => {
      await rm(assetsDir(home, a.id), {recursive: true, force: true}); removed = true;
    });
    assert.equal(removed, true, "the removal did not wait for the reader's close");
    await closing;
    release();
    assert.equal(existsSync(assetsDir(home, a.id)), false);
  } finally { release(); await media.close(); await rm(home, {recursive: true, force: true}); }
});

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { randomUUID } from "node:crypto";
import { dirname, join, relative, sep } from "node:path";
import { closeSync, constants, copyFileSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, statSync, unlinkSync, type Stats } from "node:fs";
import { lstat, mkdir, readdir, rm, rmdir, unlink } from "node:fs/promises";
import { createAssetStore, type AssetReader, type OwnerAssetStore } from "@sublang/playbook/session-assets";
import { i18n } from "./i18n.js";
import { MEDIA_CHUNK_BYTES, MEDIA_MAX_FILE_BYTES, mediaOwnerKey, mediaOwnerSchema, type MediaAsset, type MediaOwner, type MediaUploadOwner } from "./protocol.js";
import { MediaTransferError, MediaTransfers, type UploadRequest } from "./media-transfers.js";

export interface ApplicationMediaOptions {
  home: string;
  /** Assert an existing owner, as it stands at this instant. */
  assertOwner(owner: MediaOwner, write: boolean): void;
  /** The directory an application owner keeps its assets in (media-4). */
  directoryOf(owner: MediaUploadOwner): string;
  /** The folder holding that directory — the owner's spex repository's
   * clone — which a publication never creates. */
  rootOf(owner: MediaUploadOwner): string;
  /** Session storage remains entirely behind the shared Playbook facade. */
  openSessionAsset(sessionId: string, assetId: MediaAsset["assetId"]): Promise<AssetReader>;
}

interface ReaderEntry {
  ownerKey: string;
  closing?: Promise<void>;
  opened: Promise<AssetReader>;
  tail: Promise<void>;
  touched: number;
}

const STAGING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Where a publication writes, resolved at its write boundary: `root`
 * — the owner's clone — must stand, and only folders beneath it are made
 * to reach `directory`. */
export interface AssetPlace { root: string; directory: string }

const unavailableUpload = (): MediaTransferError =>
  new MediaTransferError("unavailable", i18n._({id: "This upload is unavailable. Retry the file upload.", comment: "Media transfer refusal"}));

/**
 * Import content into an application owner (media-4, DR-111): prepared
 * and verified privately under `staging` through Playbook's own asset
 * facade, then published in one synchronous step — `place()` resolving
 * and checking the owner as it stands now and throwing to refuse, the
 * owner's folder made beneath its clone, the content then its
 * descriptor linked in — so an owner removed, moved or replaced while
 * the content was prepared refuses the publication and nothing is
 * recreated. A file already there stands — names are content digests —
 * and the published asset is verified before it is returned.
 * Every application-owned asset import goes through here; a session's
 * own assets stay with Playbook's session lease.
 */
export async function importOwnedAsset(
  staging: string,
  prepare: (stage: OwnerAssetStore) => Promise<MediaAsset>,
  place: () => AssetPlace,
): Promise<MediaAsset> {
  const dir = join(staging, randomUUID());
  mkdirSync(dir, { mode: 0o700 });
  try {
    const stage = createAssetStore({ directory: dir, maxAssetBytes: MEDIA_MAX_FILE_BYTES });
    const reference = await prepare(stage);
    const files = (await stage.listAssets()).find((entry) => entry.assetId === reference.assetId);
    if (!files) throw unavailableUpload();
    // The owner's write boundary: nothing is awaited from here on.
    const target = place();
    if (!ensureBeneath(target.root, target.directory)) throw unavailableUpload();
    for (const name of [files.path, files.metadataPath]) publishFile(join(dir, name), join(target.directory, name));
    const handle = openSync(target.directory, "r");
    try { fsyncSync(handle); } finally { closeSync(handle); }
    // What the owner now holds is verified as the facade's own import
    // verifies it — a file that stood there before included — reading
    // only; a failure leaves every published file as it is.
    const reader = await createAssetStore({ directory: target.directory, maxAssetBytes: MEDIA_MAX_FILE_BYTES }).openAsset(reference);
    await reader.close();
    return reference;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** One prepared file into its owner's folder, never replacing one there
 * and leaving it a single link, as Playbook's store requires. */
function publishFile(from: string, to: string): void {
  try { linkSync(from, to); unlinkSync(from); }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return;
    if (code !== "EXDEV") throw error;
    try { copyFileSync(from, to, constants.COPYFILE_EXCL); }
    catch (copy) { if ((copy as NodeJS.ErrnoException).code !== "EEXIST") throw copy; }
  }
}

/** Application owners reuse Playbook's portable asset primitives. */
export class ApplicationMedia {
  readonly uploads: MediaTransfers;
  private readonly staging: string;
  /** Where content is prepared before its publication: this lifetime's
   * own, private, emptied at start under the home lease. */
  private readonly assetStaging: string;
  private readonly readers = new Map<string, ReaderEntry>();
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly prepared = new Map<string, Promise<void>>();
  /** The clone each upload's owner lay in at its begin, by upload id: a
   * publication into any other — the owner removed, or its key reused —
   * is refused (media-17). */
  private readonly places = new Map<string, string>();
  private closed = false;
  private stagingReady = false;

  /** Read-only guard before other home consumers can follow an unsafe
   * existing local directory. Reclamation still waits for the home lease. */
  static assertStagingParents(home: string): void {
    for (const [path, privateMode] of [[join(home, "local"), false], [join(home, "local", "uploads"), true]] as const) {
      let info: Stats;
      try { info = lstatSync(path); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      assertStagingDirectory(info, path, privateMode);
    }
  }

  constructor(private readonly options: ApplicationMediaOptions) {
    this.staging = join(options.home, "local", "uploads", randomUUID());
    this.assetStaging = join(options.home, "local", "asset-staging");
    this.uploads = new MediaTransfers({
      directory: this.staging,
      publish: (request, path) => this.publish(request, path),
    });
    this.timer = setInterval(() => {
      for (const [key, entry] of this.readers) {
        if (Date.now() - entry.touched > 60_000) void this.release(key, entry);
      }
    }, 30_000);
    this.timer.unref();
  }

  /** Called once after the core owns its exclusive home lease, before its
   * endpoint opens. A dead lifetime cannot resume its in-memory upload IDs. */
  async prepare(): Promise<void> {
    const root = dirname(this.staging);
    const safeDirectory = async (path: string, privateMode = false) => {
      try { await mkdir(path, { mode: 0o700 }); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      const info = await lstat(path);
      assertStagingDirectory(info, path, privateMode);
    };
    await safeDirectory(dirname(root));
    await safeDirectory(root, true);
    // Validate the entire cleanup set first. Unknown names are not ours;
    // recognized lifetimes may contain only ordinary staging files, never
    // directories or links. Unlinking those exact files avoids recursive
    // deletion through an unexpected descendant.
    const lifetimes: { path: string; files: string[] }[] = [];
    for (const name of await readdir(root)) {
      if (!STAGING_ID.test(name)) continue;
      const path = join(root, name);
      const info = await lstat(path);
      assertStagingDirectory(info, path, true);
      const files: string[] = [];
      for (const file of await readdir(path)) {
        const target = join(path, file);
        const entry = await lstat(target);
        if (!STAGING_ID.test(file) || !entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 ||
            (process.getuid && entry.uid !== process.getuid())) throw unsafeStaging(target);
        files.push(target);
      }
      lifetimes.push({ path, files });
    }
    for (const lifetime of lifetimes) {
      for (const path of lifetime.files) await unlink(path);
      await rmdir(lifetime.path);
    }
    await mkdir(this.staging, { mode: 0o700 });
    await rm(this.assetStaging, { recursive: true, force: true });
    await mkdir(this.assetStaging, { mode: 0o700 });
    this.stagingReady = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error(i18n._({id: "Media storage has stopped.", comment: "Media storage failure"}));
  }

  ownerStore(owner: MediaUploadOwner, write = false): OwnerAssetStore {
    mediaOwnerSchema.parse(owner);
    this.options.assertOwner(owner, write);
    return createAssetStore({ directory: this.ownerDirectory(owner), maxAssetBytes: MEDIA_MAX_FILE_BYTES });
  }

  /** Begin an upload (media-2) for an owner standing now, remembering
   * the clone it lies in. */
  async begin(request: UploadRequest): ReturnType<MediaTransfers["begin"]> {
    this.assertOpen();
    this.ownerStore(request.owner, true);
    const place = this.placeOf(request.owner);
    const state = await this.uploads.begin(request);
    if (place !== undefined && !this.places.has(request.uploadId)) this.places.set(request.uploadId, place);
    return state;
  }

  /** Import content into an owner through the private publication of
   * `importOwnedAsset`; `place` resolves and checks the owner at the
   * write boundary. The authoring coordinator's imports use this too. */
  importInto(prepare: (stage: OwnerAssetStore) => Promise<MediaAsset>, place: () => AssetPlace): Promise<MediaAsset> {
    this.assertOpen();
    return importOwnedAsset(this.assetStaging, prepare, place);
  }

  /** Where an owner standing now publishes, or `unavailable`. */
  private placeFor(owner: MediaUploadOwner, uploadId?: string): AssetPlace {
    let store: OwnerAssetStore;
    try { store = this.ownerStore(owner, true); } catch { throw unavailableUpload(); }
    const begun = uploadId === undefined ? undefined : this.places.get(uploadId);
    if (begun !== undefined && this.placeOf(owner) !== begun) throw unavailableUpload();
    return { root: this.options.rootOf(owner), directory: store.directory };
  }

  /** Publish a staged upload into its owner (media-2, media-17): the
   * owner resolved and checked at the publication's own instant — still
   * standing, in the clone it lay in at the begin — so a publication
   * after a removal or a move is refused and recreates nothing. */
  private async publish(request: UploadRequest, path: string): Promise<MediaAsset> {
    this.placeFor(request.owner, request.uploadId);
    const asset = await this.importInto(
      (stage) => stage.importAsset({ path, mimeType: request.mimeType, name: request.name }),
      () => this.placeFor(request.owner, request.uploadId),
    );
    this.places.delete(request.uploadId);
    return asset;
  }

  /** The identity of the clone an owner lies in now, if it stands. */
  private placeOf(owner: MediaUploadOwner): string | undefined {
    try {
      const info = statSync(this.options.rootOf(owner));
      return `${info.dev}:${info.ino}`;
    } catch { return undefined; }
  }

  /** Remove an owner (media-17): its upload identities invalidated and
   * its readers closed at this instant, then `remove` runs, `assert`
   * first repeating the removal's own refusals. Nothing is drained: an
   * upload still publishing finds its owner gone and is refused. */
  async retireOwner<T>(owner: MediaOwner, remove: () => T | Promise<T>, assert?: () => void): Promise<T> {
    mediaOwnerSchema.parse(owner);
    const key = mediaOwnerKey(owner);
    assert?.();
    if (owner.kind !== "session") {
      void this.uploads.retireOwner(owner).catch((error: unknown) => {
        console.error(`spex: upload staging of ${key} was not removed: ${error instanceof Error ? error.message : String(error)}`);
      });
      this.prepared.delete(this.ownerDirectory(owner));
    }
    for (const [name, entry] of [...this.readers]) if (name.startsWith(`${key}:`)) void this.release(name, entry);
    return await remove();
  }

  private ownerDirectory(owner: MediaUploadOwner): string {
    return this.options.directoryOf(owner);
  }

  /** Verify an owner holds the assets content names (media-5); asset
   * ids are content digests, verified again wherever they are read. */
  async validate(owner: MediaUploadOwner, assets: readonly MediaAsset[]): Promise<void> {
    this.assertOpen();
    const store = this.ownerStore(owner);
    await this.prepareStore(store);
    for (const asset of assets) {
      const reader = await store.openAsset(asset);
      await reader.close();
    }
  }

  /** Take content's attachments into the owner that keeps them
   * (media-4): each reference the destination does not hold yet is
   * copied from the first source holding it, verified, so the queued
   * intent's directory beside its file holds every byte it names. */
  async adopt(destination: MediaUploadOwner, sources: readonly MediaUploadOwner[], assets: readonly MediaAsset[]): Promise<void> {
    if (assets.length === 0) return;
    this.assertOpen();
    this.placeFor(destination);
    const held = this.ownerStore(destination, true);
    for (const asset of assets) {
      try { const reader = await held.openAsset(asset); await reader.close(); continue; } catch { /* not here yet */ }
      let copied = false;
      for (const source of sources) {
        const from = this.ownerStore(source);
        try {
          await this.prepareStore(from);
          await this.importInto((stage) => stage.copyAsset(from, asset), () => this.placeFor(destination));
          copied = true;
          break;
        } catch { /* try the next */ }
      }
      if (!copied) throw unavailableUpload();
    }
  }

  async read(owner: MediaOwner, assetId: MediaAsset["assetId"], offset: number, length: number): Promise<{asset: MediaAsset; offset: number; data: string; eof: boolean}> {
    if (this.closed) throw new Error(i18n._({id: "Media storage has stopped.", comment: "Media storage failure"}));
    mediaOwnerSchema.parse(owner);
    this.options.assertOwner(owner, false);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > MEDIA_CHUNK_BYTES) {
      throw new Error(i18n._({id: "Invalid media read range.", comment: "Media storage failure"}));
    }
    return this.readAsset(owner, assetId, offset, length);
  }

  private async readAsset(owner: MediaOwner, assetId: MediaAsset["assetId"], offset: number, length: number): Promise<{asset: MediaAsset; offset: number; data: string; eof: boolean}> {
    const key = `${mediaOwnerKey(owner)}:${assetId}`;
    let entry = this.readers.get(key);
    if (!entry) {
      // No more than 32 verified file handles remain open between chunks.
      while (!entry && this.readers.size >= 32) {
        const oldest = [...this.readers.entries()].sort((a, b) => a[1].touched - b[1].touched)[0];
        if (oldest) await this.release(...oldest);
        if (this.closed) throw new Error(i18n._({id: "Media storage has stopped.", comment: "Media storage failure"}));
        entry = this.readers.get(key);
      }
      if (!entry) {
        // Revalidate after evicting another reader yielded.
        this.options.assertOwner(owner, false);
        entry = {
          ownerKey: mediaOwnerKey(owner),
          opened: owner.kind === "session"
            ? this.options.openSessionAsset(owner.id, assetId)
            : this.openOwnerAsset(owner, assetId),
          tail: Promise.resolve(), touched: Date.now(),
        };
        this.readers.set(key, entry);
      }
    }
    const selected = entry;
    selected.touched = Date.now();
    const result = selected.tail.then(async () => {
      const reader = await selected.opened;
      if (offset > reader.reference.byteLength) throw new Error(i18n._({id: "Media read begins beyond the file length.", comment: "Media storage failure"}));
      const bytes = await reader.read({ offset, length: Math.min(length, reader.reference.byteLength - offset) });
      return { asset: reader.reference, offset, data: Buffer.from(bytes).toString("base64"), eof: offset + bytes.length >= reader.reference.byteLength };
    });
    selected.tail = result.then(() => {}, () => {});
    try {
      const value = await result;
      if (value.eof) await this.release(key, selected);
      return value;
    } catch (error) {
      await this.release(key, selected);
      throw error;
    }
  }

  private async prepareStore(store: OwnerAssetStore): Promise<void> {
    let work = this.prepared.get(store.directory);
    if (!work) {
      work = store.prepare();
      this.prepared.set(store.directory, work);
      void work.catch(() => { if (this.prepared.get(store.directory) === work) this.prepared.delete(store.directory); });
    }
    await work;
  }

  private async openOwnerAsset(owner: MediaUploadOwner, assetId: MediaAsset["assetId"]): Promise<AssetReader> {
    const store = this.ownerStore(owner);
    await this.prepareStore(store);
    return store.openAsset(assetId);
  }

  /** A selected Git tree starts a fresh set of verified owner handles. */
  async reset(): Promise<void> {
    await this.closeReaders();
    this.prepared.clear();
  }

  async closeReaders(): Promise<void> {
    await Promise.all([...this.readers].map(([key, entry]) => this.release(key, entry)));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    await this.uploads.close();
    await this.closeReaders();
    if (this.stagingReady) {
      await rm(this.staging, { recursive: true, force: true });
      await rm(this.assetStaging, { recursive: true, force: true });
    }
  }

  private release(key: string, entry: ReaderEntry): Promise<void> {
    if (entry.closing) return entry.closing;
    if (this.readers.get(key) !== entry) return Promise.resolve();
    this.readers.delete(key);
    entry.closing = (async () => {
      await entry.tail;
      try { await (await entry.opened).close(); } catch { /* Preserve the original read failure. */ }
    })();
    return entry.closing;
  }
}

/** Create `directory` beneath `root` one folder at a time, never `root`
 * itself: false where `root` no longer stands, or anything on the way
 * is no folder. */
function ensureBeneath(root: string, directory: string): boolean {
  const rel = relative(root, directory);
  if (rel.startsWith("..")) return false;
  try { if (!statSync(root).isDirectory()) return false; } catch { return false; }
  let current = root;
  for (const part of rel.split(sep).filter(Boolean)) {
    current = join(current, part);
    try { mkdirSync(current, { mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") return false;
      try { if (!lstatSync(current).isDirectory()) return false; } catch { return false; }
    }
  }
  return true;
}

function unsafeStaging(path: string): Error {
  return new Error(i18n._({id: "Upload staging path is unsafe: {path}", comment: "Startup refusal: a media staging path cannot be safely cleaned", values: {path}}));
}

function assertStagingDirectory(info: Stats, path: string, privateMode: boolean): void {
  if (!info.isDirectory() || info.isSymbolicLink() ||
      (process.getuid && info.uid !== process.getuid()) ||
      (privateMode && (info.mode & 0o077) !== 0)) throw unsafeStaging(path);
}

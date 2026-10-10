// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { lstatSync, type Stats } from "node:fs";
import { lstat, mkdir, readdir, rm, rmdir, unlink } from "node:fs/promises";
import { createAssetStore, type AssetReader, type OwnerAssetStore } from "@sublang/playbook/session-assets";
import { i18n } from "./i18n.js";
import { MEDIA_CHUNK_BYTES, MEDIA_MAX_FILE_BYTES, mediaOwnerKey, mediaOwnerSchema, type MediaAsset, type MediaOwner, type MediaUploadOwner } from "./protocol.js";
import { MediaTransferError, MediaTransfers } from "./media-transfers.js";

export interface ApplicationMediaOptions {
  home: string;
  /** Assert an existing owner and, for writes, its current mutation gate. */
  assertOwner(owner: MediaOwner, write: boolean): void;
  /** The directory an application owner keeps its assets in (media-4). */
  directoryOf(owner: MediaUploadOwner): string;
  /** Session storage remains entirely behind the shared Playbook facade. */
  openSessionAsset(sessionId: string, assetId: MediaAsset["assetId"]): Promise<AssetReader>;
  /** Test seam: awaited as an owner's retirement begins its drain. */
  beforeDrain?: (owner: MediaOwner) => void | Promise<void>;
  /** The last write in flight ended: none runs now. */
  onIdle?: () => void;
}

interface ReaderEntry {
  ownerKey: string;
  closing?: Promise<void>;
  opened: Promise<AssetReader>;
  tail: Promise<void>;
  touched: number;
}

const STAGING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Application owners reuse Playbook's portable asset primitives. */
export class ApplicationMedia {
  readonly uploads: MediaTransfers;
  private readonly staging: string;
  private readonly readers = new Map<string, ReaderEntry>();
  private readonly timer: ReturnType<typeof setInterval>;
  private readonly prepared = new Map<string, Promise<void>>();
  private readonly retiring = new Set<string>();
  private readonly ownerWork = new Map<string, Set<Promise<unknown>>>();
  private pendingWrites = 0;
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
    this.uploads = new MediaTransfers({
      directory: this.staging,
      publish: (request, path) => this.writing(async () => {
        const store = this.ownerStore(request.owner, true);
        await this.prepareStore(store);
        return store.importAsset({ path, mimeType: request.mimeType, name: request.name });
      }),
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
    this.stagingReady = true;
  }

  /** A Space operation cannot race publication into a tracked owner. */
  isWriting(): boolean { return this.pendingWrites > 0; }

  async writing<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error(i18n._({id: "Media storage has stopped.", comment: "Media storage failure"}));
    this.pendingWrites++;
    try { return await operation(); } finally {
      this.pendingWrites--;
      if (this.pendingWrites === 0) this.options.onIdle?.();
    }
  }

  ownerStore(owner: MediaUploadOwner, write = false): OwnerAssetStore {
    mediaOwnerSchema.parse(owner);
    this.assertAvailable(owner);
    this.options.assertOwner(owner, write);
    return createAssetStore({ directory: this.ownerDirectory(owner), maxAssetBytes: MEDIA_MAX_FILE_BYTES });
  }

  /** Retirement shares the owner's upload lifetime, not a global lock.
   * Native session writes remain protected by Playbook's existing lease.
   * The owner admits no new media work while its admitted work drains;
   * `assert` then repeats the removal's own refusals, and nothing awaits
   * between that check, invalidating the owner's upload identities, and
   * starting the removal, so a removal refused by work its owner admitted
   * during the drain leaves the surviving owner's uploads resumable. */
  async retireOwner<T>(owner: MediaOwner, remove: () => T | Promise<T>, assert?: () => void | Promise<void>): Promise<T> {
    mediaOwnerSchema.parse(owner);
    this.assertAvailable(owner);
    const key = mediaOwnerKey(owner);
    this.retiring.add(key);
    try {
      return await this.writing(async () => {
        await this.options.beforeDrain?.(owner);
        if (owner.kind !== "session") await this.uploads.settleOwner(owner);
        await this.drainOwner(key);
        await Promise.all([...this.readers].filter(([name]) => name.startsWith(`${key}:`)).map(([name, entry]) => this.release(name, entry)));
        await this.drainOwner(key);
        await assert?.();
        const cleanup = owner.kind !== "session" ? this.uploads.retireOwner(owner) : undefined;
        if (owner.kind !== "session") this.prepared.delete(this.ownerDirectory(owner));
        try { return await remove(); } finally { await cleanup; }
      });
    } finally { this.retiring.delete(key); }
  }

  private ownerDirectory(owner: MediaUploadOwner): string {
    return this.options.directoryOf(owner);
  }

  private assertAvailable(owner: MediaOwner): void {
    if (this.retiring.has(mediaOwnerKey(owner))) throw new MediaTransferError("unavailable", i18n._({id: "This upload is unavailable. Retry the file upload.", comment: "Media transfer refusal"}));
  }

  async validate(owner: MediaUploadOwner, assets: readonly MediaAsset[]): Promise<void> {
    this.assertAvailable(owner);
    // Validation admits a later write: Space cannot select another asset
    // generation while this command still relies on the verified bytes.
    return this.writing(() => this.trackOwnerWork(mediaOwnerKey(owner), async () => {
      const store = this.ownerStore(owner);
      await this.prepareStore(store);
      for (const asset of assets) {
        const reader = await store.openAsset(asset);
        await reader.close();
      }
    }));
  }

  /** Take content's attachments into the owner that keeps them
   * (media-4): each reference the destination does not hold yet is
   * copied from the first source holding it, verified, so the queued
   * intent's directory beside its file holds every byte it names. */
  async adopt(destination: MediaUploadOwner, sources: readonly MediaUploadOwner[], assets: readonly MediaAsset[]): Promise<void> {
    if (assets.length === 0) return;
    this.assertAvailable(destination);
    return this.writing(() => this.trackOwnerWork(mediaOwnerKey(destination), async () => {
      const target = this.ownerStore(destination, true);
      for (const asset of assets) {
        try { const held = await target.openAsset(asset); await held.close(); continue; } catch { /* not here yet */ }
        let copied = false;
        for (const source of sources) {
          const from = this.ownerStore(source);
          try { await this.prepareStore(from); await target.copyAsset(from, asset); copied = true; break; } catch { /* try the next */ }
        }
        if (!copied) throw new MediaTransferError("unavailable", i18n._({id: "This upload is unavailable. Retry the file upload.", comment: "Media transfer refusal"}));
      }
    }));
  }

  async read(owner: MediaOwner, assetId: MediaAsset["assetId"], offset: number, length: number): Promise<{asset: MediaAsset; offset: number; data: string; eof: boolean}> {
    if (this.closed) throw new Error(i18n._({id: "Media storage has stopped.", comment: "Media storage failure"}));
    mediaOwnerSchema.parse(owner);
    this.assertAvailable(owner);
    this.options.assertOwner(owner, false);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > MEDIA_CHUNK_BYTES) {
      throw new Error(i18n._({id: "Invalid media read range.", comment: "Media storage failure"}));
    }
    return this.trackOwnerWork(mediaOwnerKey(owner), () => this.readAsset(owner, assetId, offset, length));
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
        // Revalidate after evicting another reader yielded to retirement.
        this.assertAvailable(owner);
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
    await Promise.all([...this.ownerWork.keys()].map((key) => this.drainOwner(key)));
    if (this.stagingReady) await rm(this.staging, { recursive: true, force: true });
  }

  private release(key: string, entry: ReaderEntry): Promise<void> {
    if (entry.closing) return entry.closing;
    if (this.readers.get(key) !== entry) return Promise.resolve();
    this.readers.delete(key);
    entry.closing = this.trackOwnerWork(entry.ownerKey, async () => {
      await entry.tail;
      try { await (await entry.opened).close(); } catch { /* Preserve the original read failure. */ }
    });
    return entry.closing;
  }

  private trackOwnerWork<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const work = this.ownerWork.get(key) ?? new Set<Promise<unknown>>();
    this.ownerWork.set(key, work);
    let settle!: () => void;
    const lifetime = new Promise<void>((resolve) => { settle = resolve; });
    work.add(lifetime);
    return (async () => {
      try { return await operation(); } finally {
        work.delete(lifetime);
        if (work.size === 0 && this.ownerWork.get(key) === work) this.ownerWork.delete(key);
        settle();
      }
    })();
  }

  private async drainOwner(key: string): Promise<void> {
    while (this.ownerWork.has(key)) await Promise.allSettled([...this.ownerWork.get(key)!]);
  }
}

function unsafeStaging(path: string): Error {
  return new Error(i18n._({id: "Upload staging path is unsafe: {path}", comment: "Startup refusal: a media staging path cannot be safely cleaned", values: {path}}));
}

function assertStagingDirectory(info: Stats, path: string, privateMode: boolean): void {
  if (!info.isDirectory() || info.isSymbolicLink() ||
      (process.getuid && info.uid !== process.getuid()) ||
      (privateMode && (info.mode & 0o077) !== 0)) throw unsafeStaging(path);
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { open, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { i18n } from "./i18n.js";
import { MEDIA_CHUNK_BYTES, MEDIA_MAX_FILE_BYTES, mediaOwnerKey, type MediaAsset, type MediaUploadOwner, type MediaUploadState } from "./protocol.js";

export interface UploadRequest {
  uploadId: string;
  owner: MediaUploadOwner;
  name: string;
  mimeType: string;
  byteLength: number;
}

/** The publication callback binds the transfer to the application-owned
 * Playbook asset store. A transfer never accepts a client filesystem path. */
export interface MediaTransferOptions {
  directory: string;
  publish(request: UploadRequest, path: string): Promise<MediaAsset>;
  now?: () => number;
}

interface Upload {
  request: UploadRequest;
  path: string;
  offset: number;
  touchedAt: number;
  asset?: MediaAsset;
  canceled: boolean;
  tail: Promise<void>;
}

const MAX_UPLOADS = 32;
const MAX_RESERVED_BYTES = 1024 * 1024 * 1024;
const IDLE_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class MediaTransferError extends Error {
  constructor(readonly reason: "unavailable" | "conflict" | "invalid" | "limit", message: string) {
    super(message);
    this.name = "MediaTransferError";
  }
}

/** One private staging directory per core lifetime, under its home lease.
 * Operations for a given upload are serialized, including finish/cancel. */
export class MediaTransfers {
  private readonly uploads = new Map<string, Upload>();
  private readonly now: () => number;
  private readonly timer: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(private readonly options: MediaTransferOptions) {
    this.now = options.now ?? Date.now;
    this.timer = setInterval(() => { void this.expire().catch(() => {}); }, 60_000);
    this.timer.unref();
  }

  /** The owner an upload in flight publishes into, for the write gate. */
  ownerOf(uploadId: string): MediaUploadOwner | undefined {
    return this.uploads.get(uploadId)?.request.owner;
  }

  async begin(request: UploadRequest): Promise<MediaUploadState> {
    this.assertOpen();
    this.validate(request);
    const existing = this.uploads.get(request.uploadId);
    if (existing) {
      if (!sameRequest(existing.request, request)) {
        throw new MediaTransferError("conflict", i18n._({id: "Upload ID already identifies a different file.", comment: "Media transfer refusal"}));
      }
      return this.withUpload(existing, () => this.state(existing));
    }
    const incomplete = [...this.uploads.values()].filter((upload) => !upload.asset && !upload.canceled);
    if (incomplete.length >= MAX_UPLOADS || incomplete.reduce((total, upload) => total + upload.request.byteLength, 0) + request.byteLength > MAX_RESERVED_BYTES) {
      throw new MediaTransferError("limit", i18n._({id: "Too many files are uploading. Finish or cancel an upload, then retry.", comment: "Media transfer refusal"}));
    }
    const upload: Upload = {
      request: { ...request, owner: { ...request.owner } },
      path: join(this.options.directory, request.uploadId),
      offset: 0,
      touchedAt: this.now(),
      canceled: false,
      tail: Promise.resolve(),
    };
    // Reserve before any filesystem wait so simultaneous begins cannot win twice.
    this.uploads.set(request.uploadId, upload);
    return this.withUpload(upload, async () => {
      try {
        await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
        const file = await open(upload.path, "wx", 0o600);
        await file.close();
        return this.state(upload);
      } catch (error) {
        this.uploads.delete(request.uploadId);
        upload.canceled = true;
        throw error;
      }
    });
  }

  async chunk(uploadId: string, offset: number, data: string): Promise<MediaUploadState> {
    const upload = this.require(uploadId);
    return this.withUpload(upload, async () => {
      const bytes = decodeChunk(data);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + bytes.length > upload.request.byteLength) {
        throw new MediaTransferError("invalid", i18n._({id: "The upload chunk exceeds the declared file length.", comment: "Media transfer refusal"}));
      }
      if (upload.asset) {
        throw new MediaTransferError("conflict", i18n._({id: "This upload has already completed.", comment: "Media transfer refusal"}));
      }
      if (offset > upload.offset || (offset < upload.offset && offset + bytes.length > upload.offset)) {
        throw new MediaTransferError("conflict", i18n._({id: "The upload chunk does not match the received offset.", comment: "Media transfer refusal"}));
      }
      const file = await open(upload.path, "r+");
      try {
        if (offset < upload.offset) {
          const prior = Buffer.alloc(bytes.length);
          const { bytesRead } = await file.read(prior, 0, prior.length, offset);
          if (bytesRead !== bytes.length || !prior.equals(bytes)) {
            throw new MediaTransferError("conflict", i18n._({id: "A retried upload chunk contains different bytes.", comment: "Media transfer refusal"}));
          }
        } else {
          let written = 0;
          while (written < bytes.length) {
            const result = await file.write(bytes, written, bytes.length - written, offset + written);
            if (!result.bytesWritten) throw new Error(i18n._({id: "Upload write made no progress.", comment: "Media storage failure"}));
            written += result.bytesWritten;
          }
          upload.offset += bytes.length;
        }
      } finally {
        await file.close();
      }
      return this.state(upload);
    });
  }

  async finish(uploadId: string): Promise<MediaUploadState & { asset: MediaAsset }> {
    const upload = this.require(uploadId);
    return this.withUpload(upload, async () => {
      if (!upload.asset) {
        if (upload.offset !== upload.request.byteLength) {
          throw new MediaTransferError("conflict", i18n._({id: "The file has not finished uploading.", comment: "Media transfer refusal"}));
        }
        const file = await open(upload.path, "r");
        try { await file.sync(); } finally { await file.close(); }
        const asset = await this.options.publish(upload.request, upload.path);
        if (asset.byteLength !== upload.request.byteLength) throw new Error(i18n._({id: "Published upload has a different byte length.", comment: "Media storage failure"}));
        upload.asset = asset;
        await rm(upload.path, { force: true });
      }
      return { ...this.state(upload), asset: upload.asset };
    });
  }

  async cancel(uploadId: string): Promise<{ canceled: boolean }> {
    this.assertOpen();
    const upload = this.uploads.get(uploadId);
    if (!upload) return { canceled: false };
    return this.withUpload(upload, async () => {
      if (upload.asset) return { canceled: false };
      await rm(upload.path, { force: true });
      upload.canceled = true;
      this.uploads.delete(uploadId);
      return { canceled: true };
    });
  }

  /** Called under the application's owner-retirement gate, once the owner
   * admits no new publication: wait for this owner's running transfers
   * without invalidating them, so a refused removal leaves them resumable. */
  async settleOwner(owner: MediaUploadOwner): Promise<void> {
    await Promise.all([...this.uploads.values()]
      .filter(({request}) => mediaOwnerKey(request.owner) === mediaOwnerKey(owner))
      .map((upload) => upload.tail));
  }

  /** Called under the application's owner-retirement gate as its removal
   * starts. Invalidation is synchronous; the returned promise drains any
   * transfer still queued and removes its staging. */
  async retireOwner(owner: MediaUploadOwner): Promise<void> {
    const retiring = [...this.uploads.values()].filter(({request}) => mediaOwnerKey(request.owner) === mediaOwnerKey(owner));
    for (const upload of retiring) {
      // Keep the invalidated identity only for its existing retry window.
      // After expiry a begin starts from zero, never the removed asset.
      upload.canceled = true;
    }
    await Promise.all(retiring.map(async (upload) => {
      await upload.tail;
      await rm(upload.path, {force: true});
    }));
  }

  /** Also used by deterministic integration tests; idle completed IDs expire
   * from memory only, leaving their durable asset in its owner's store. */
  async expire(): Promise<void> {
    if (this.closed) return;
    for (const [id, upload] of this.uploads) {
      if (this.now() - upload.touchedAt < IDLE_MS) continue;
      if (upload.canceled) { this.uploads.delete(id); continue; }
      await this.withUpload(upload, async () => {
        // Queued activity can refresh the upload before expiry gets its turn.
        if (this.now() - upload.touchedAt < IDLE_MS) return;
        await rm(upload.path, { force: true });
        upload.canceled = true;
        this.uploads.delete(id);
      }, false).catch((error: unknown) => {
        if (!(error instanceof MediaTransferError && error.reason === "unavailable")) throw error;
      });
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    await Promise.all([...this.uploads.values()].map(async (upload) => {
      await upload.tail;
      await rm(upload.path, { force: true });
      upload.canceled = true;
    }));
    this.uploads.clear();
  }

  private validate(request: UploadRequest): void {
    if (!UUID.test(request.uploadId) || !Number.isSafeInteger(request.byteLength) || request.byteLength < 0 || request.byteLength > MEDIA_MAX_FILE_BYTES) {
      throw new MediaTransferError("invalid", i18n._({id: "Invalid upload ID or file length.", comment: "Media transfer refusal"}));
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new MediaTransferError("unavailable", i18n._({id: "The upload service has stopped.", comment: "Media transfer refusal"}));
  }

  private require(uploadId: string): Upload {
    this.assertOpen();
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new MediaTransferError("unavailable", i18n._({id: "This upload is unavailable. Retry the file upload.", comment: "Media transfer refusal"}));
    return upload;
  }

  private state(upload: Upload): MediaUploadState {
    return { uploadId: upload.request.uploadId, offset: upload.offset, ...(upload.asset ? { asset: upload.asset } : {}) };
  }

  private withUpload<T>(upload: Upload, operation: () => T | Promise<T>, touch = true): Promise<T> {
    const result = upload.tail.then(async () => {
      if (upload.canceled) throw new MediaTransferError("unavailable", i18n._({id: "This upload was canceled or expired. Retry the file upload.", comment: "Media transfer refusal"}));
      if (touch) upload.touchedAt = this.now();
      return operation();
    });
    upload.tail = result.then(() => {}, () => {});
    return result;
  }
}


function sameRequest(left: UploadRequest, right: UploadRequest): boolean {
  return left.uploadId === right.uploadId && mediaOwnerKey(left.owner) === mediaOwnerKey(right.owner) &&
    left.name === right.name && left.mimeType === right.mimeType && left.byteLength === right.byteLength;
}

function decodeChunk(data: string): Buffer {
  if (data.length === 0 || data.length > Math.ceil(MEDIA_CHUNK_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
    throw new MediaTransferError("invalid", i18n._({id: "Invalid upload bytes.", comment: "Media transfer refusal"}));
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > MEDIA_CHUNK_BYTES || bytes.toString("base64") !== data) {
    throw new MediaTransferError("invalid", i18n._({id: "Invalid upload bytes.", comment: "Media transfer refusal"}));
  }
  return bytes;
}

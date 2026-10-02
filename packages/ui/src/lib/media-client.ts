// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import {
  MEDIA_CHUNK_BYTES,
  MEDIA_MAX_FILE_BYTES,
  type MediaAsset,
  type MediaOwner,
  type MediaUploadOwner,
} from "@sublang/spex-core/protocol";

import { i18n } from "../i18n.js";
import type { SpexClient } from "./client.js";

export type MediaClient = Pick<SpexClient, "command">;

const TYPES: Readonly<Record<string, string>> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", bmp: "image/bmp", svg: "image/svg+xml",
  pdf: "application/pdf", txt: "text/plain", md: "text/plain",
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg",
  aac: "audio/aac", aif: "audio/aiff", aiff: "audio/aiff", m4a: "audio/mp4",
  mp4: "video/mp4", mpeg: "video/mpeg", mpg: "video/mpeg", mov: "video/quicktime", webm: "video/webm",
};

export function fileMimeType(file: Pick<File, "name" | "type">): string {
  const type = file.type.toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(type)
    ? type
    : TYPES[file.name.split(".").at(-1)?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16_384)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  return btoa(binary);
}

function decode(data: string): Uint8Array {
  const binary = atob(data);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function uploadMediaFile(
  client: MediaClient,
  owner: MediaUploadOwner,
  file: File,
  uploadId: string,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {},
): Promise<MediaAsset> {
  const { signal, onProgress } = options;
  signal?.throwIfAborted();
  if (file.size > MEDIA_MAX_FILE_BYTES)
    throw new Error(i18n._("Files must be 100 MiB or smaller."));
  const state = await client.command("media.begin", {
    owner, uploadId, name: file.name, mimeType: fileMimeType(file), byteLength: file.size,
  });
  signal?.throwIfAborted();
  if (state.asset) { onProgress?.(1); return state.asset; }
  let offset = state.offset;
  if (!Number.isInteger(offset) || offset < 0 || offset > file.size)
    throw new Error(i18n._("The upload returned an invalid offset."));
  onProgress?.(file.size ? offset / file.size : 0);
  while (offset < file.size) {
    signal?.throwIfAborted();
    const bytes = new Uint8Array(await file.slice(offset, offset + MEDIA_CHUNK_BYTES).arrayBuffer());
    signal?.throwIfAborted();
    const next = await client.command("media.chunk", { uploadId, offset, data: encode(bytes) });
    signal?.throwIfAborted();
    if (next.offset !== offset + bytes.length)
      throw new Error(i18n._("The upload returned an invalid offset."));
    offset = next.offset;
    onProgress?.(offset / file.size);
  }
  signal?.throwIfAborted();
  const completed = await client.command("media.finish", { uploadId });
  signal?.throwIfAborted();
  onProgress?.(1);
  return completed.asset;
}

/** Only opaque owner-scoped assets enter this reader; it never fetches a URI. */
export async function readMediaAsset(
  client: MediaClient,
  owner: MediaOwner,
  asset: Pick<MediaAsset, "assetId"> & Partial<MediaAsset>,
  signal?: AbortSignal,
): Promise<Blob> {
  if (asset.byteLength !== undefined && asset.byteLength > MEDIA_MAX_FILE_BYTES)
    throw new Error(i18n._("This file is too large to preview."));
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  let byteLength = asset.byteLength;
  let mimeType = asset.mimeType;
  do {
    signal?.throwIfAborted();
    const result = await client.command("media.read", { owner, assetId: asset.assetId, offset, length: MEDIA_CHUNK_BYTES });
    signal?.throwIfAborted();
    const bytes = decode(result.data);
    byteLength ??= result.asset.byteLength;
    mimeType ??= result.asset.mimeType;
    if (byteLength > MEDIA_MAX_FILE_BYTES)
      throw new Error(i18n._("This file is too large to preview."));
    if (result.asset.assetId !== asset.assetId || result.asset.byteLength !== byteLength || result.offset !== offset || bytes.length > MEDIA_CHUNK_BYTES || offset + bytes.length > byteLength || result.eof !== (offset + bytes.length === byteLength) || (!result.eof && bytes.length === 0))
      throw new Error(i18n._("The file returned inconsistent content."));
    chunks.push(new Uint8Array(bytes));
    offset += bytes.length;
    if (result.eof) break;
  } while (offset < byteLength);
  return new Blob(chunks, { type: mimeType });
}

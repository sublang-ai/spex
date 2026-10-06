// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A minimal ustar codec for release archives (DR-104, spex.pub DR-016):
// the registry's archive is a gzipped tarball rooted at `<pkg>/`, and a
// Git source's tree comes out of `git archive` as a tar. Writing is
// deterministic — zero times and owners, entries in the given order —
// so one release always packs to the same bytes. Reading keeps every
// entry's type, so a link or special file is seen and refused, never
// followed.

import { gunzipSync, gzipSync } from "node:zlib";

export type TarEntryType = "file" | "directory" | "symlink" | "hardlink" | "other";

export interface TarEntry {
  path: string;
  type: TarEntryType;
  /** Permission bits, as the header states them. */
  mode: number;
  /** A file's bytes; empty for every other type. */
  data: Uint8Array;
  /** A link's target. */
  linkname?: string;
}

export interface TarInput {
  path: string;
  type: "file" | "directory";
  mode?: number;
  data?: Uint8Array;
}

const BLOCK = 512;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

function writeString(header: Uint8Array, offset: number, length: number, value: string): void {
  const bytes = encoder.encode(value);
  header.set(bytes.subarray(0, length), offset);
}

function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  // length - 1 digits, then NUL.
  const digits = value.toString(8).padStart(length - 1, "0");
  writeString(header, offset, length - 1, digits);
  header[offset + length - 1] = 0;
}

function checksum(header: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < BLOCK; i += 1) sum += i >= 148 && i < 156 ? 0x20 : header[i]!;
  return sum;
}

function headerBlock(name: string, prefix: string, mode: number, size: number, type: string): Uint8Array {
  const header = new Uint8Array(BLOCK);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, mode & 0o7777);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header[156] = type.charCodeAt(0);
  writeString(header, 257, 6, "ustar");
  header[262] = 0;
  writeString(header, 263, 2, "00");
  writeString(header, 345, 155, prefix);
  const sum = checksum(header);
  writeString(header, 148, 6, sum.toString(8).padStart(6, "0"));
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

/** Split a path into ustar's name and prefix, or undefined when it
 * fits neither, and a PAX record must carry it. */
function splitUstar(path: string): { name: string; prefix: string } | undefined {
  const bytes = encoder.encode(path).length;
  if (bytes <= 100) return { name: path, prefix: "" };
  for (let i = path.lastIndexOf("/"); i > 0; i = path.lastIndexOf("/", i - 1)) {
    const prefix = path.slice(0, i);
    const name = path.slice(i + 1);
    if (encoder.encode(prefix).length <= 155 && encoder.encode(name).length <= 100 && name.length > 0) {
      return { name, prefix };
    }
  }
  return undefined;
}

function paxRecord(key: string, value: string): Uint8Array {
  const body = ` ${key}=${value}\n`;
  const bodyLength = encoder.encode(body).length;
  // The length counts its own digits.
  let length = bodyLength + 1;
  while (String(length).length + bodyLength !== length) length = String(length).length + bodyLength;
  return encoder.encode(`${length}${body}`);
}

function padded(data: Uint8Array): Uint8Array[] {
  const rest = data.length % BLOCK;
  return rest === 0 ? [data] : [data, new Uint8Array(BLOCK - rest)];
}

/** Pack entries into an uncompressed tar, deterministically. */
export function writeTar(entries: TarInput[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const path = entry.type === "directory" && !entry.path.endsWith("/") ? `${entry.path}/` : entry.path;
    const data = entry.type === "file" ? (entry.data ?? new Uint8Array()) : new Uint8Array();
    const mode = entry.mode ?? (entry.type === "directory" ? 0o755 : 0o644);
    let split = splitUstar(path);
    if (!split) {
      const record = paxRecord("path", path);
      chunks.push(headerBlock("PaxHeader", "", 0o644, record.length, "x"), ...padded(record));
      split = { name: path.slice(0, 100), prefix: "" };
    }
    chunks.push(headerBlock(split.name, split.prefix, mode, data.length, entry.type === "directory" ? "5" : "0"));
    if (data.length > 0) chunks.push(...padded(data));
  }
  chunks.push(new Uint8Array(BLOCK * 2));
  return concat(chunks);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function readString(block: Uint8Array, offset: number, length: number): string {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return decoder.decode(end === -1 ? slice : slice.subarray(0, end));
}

function readOctal(block: Uint8Array, offset: number, length: number): number {
  const slice = block.subarray(offset, offset + length);
  if (slice[0]! & 0x80) {
    // Base-256: GNU's encoding for large values.
    let value = 0;
    for (let i = 1; i < slice.length; i += 1) value = value * 256 + slice[i]!;
    return value;
  }
  const text = readString(block, offset, length).trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) throw new TarError(`malformed octal field "${text}"`);
  return parseInt(text, 8);
}

function parsePax(data: Uint8Array): Record<string, string> {
  const records: Record<string, string> = {};
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space === -1) break;
    const length = Number(decoder.decode(data.subarray(offset, space)));
    if (!Number.isInteger(length) || length <= 0) throw new TarError("malformed PAX record");
    const record = decoder.decode(data.subarray(space + 1, offset + length - 1));
    const equals = record.indexOf("=");
    if (equals > 0) records[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return records;
}

export class TarError extends Error {
  constructor(message: string) {
    super(`tar: ${message}`);
    this.name = "TarError";
  }
}

/** Read every entry of an uncompressed tar, PAX and GNU long names
 * applied; a global PAX header is skipped. */
export function readTar(tar: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pending: Record<string, string> = {};
  let longName: string | undefined;
  let longLink: string | undefined;
  while (offset + BLOCK <= tar.length) {
    const block = tar.subarray(offset, offset + BLOCK);
    if (block.every((byte) => byte === 0)) break;
    const stored = readOctal(block, 148, 8);
    if (stored !== checksum(block)) throw new TarError(`bad header checksum at ${offset}`);
    const size = readOctal(block, 124, 12);
    const typeflag = String.fromCharCode(block[156]!);
    const dataStart = offset + BLOCK;
    if (dataStart + size > tar.length) throw new TarError("truncated entry");
    const data = tar.slice(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (typeflag === "x") { pending = { ...pending, ...parsePax(data) }; continue; }
    if (typeflag === "g") continue;
    if (typeflag === "L") { longName = readString(data, 0, data.length); continue; }
    if (typeflag === "K") { longLink = readString(data, 0, data.length); continue; }
    const name = readString(block, 0, 100);
    const magic = readString(block, 257, 6);
    const prefix = magic.startsWith("ustar") ? readString(block, 345, 155) : "";
    let path = pending.path ?? longName ?? (prefix ? `${prefix}/${name}` : name);
    const linkname = pending.linkpath ?? longLink ?? readString(block, 157, 100);
    pending = {};
    longName = undefined;
    longLink = undefined;
    const type: TarEntryType =
      typeflag === "0" || typeflag === "\0" || typeflag === "7" ? "file"
        : typeflag === "5" ? "directory"
          : typeflag === "2" ? "symlink"
            : typeflag === "1" ? "hardlink"
              : "other";
    if (type === "directory" && path.endsWith("/")) path = path.slice(0, -1);
    entries.push({
      path,
      type,
      mode: readOctal(block, 100, 8),
      data: type === "file" ? data : new Uint8Array(),
      ...(type === "symlink" || type === "hardlink" ? { linkname } : {}),
    });
  }
  return entries;
}

export function gzip(data: Uint8Array): Uint8Array {
  return new Uint8Array(gzipSync(data, { level: 9 }));
}

export function gunzip(data: Uint8Array): Uint8Array {
  return new Uint8Array(gunzipSync(data));
}

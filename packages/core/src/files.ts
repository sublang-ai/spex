// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The primitives every Spex-owned file shares (storage-14): closed
// encodings checked field by field, atomic same-directory replacement,
// and the one storage fault a reader reports.

import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, posix, resolve, win32 } from "node:path";
import { i18n } from "./i18n.js";
import { UUID_PATTERN } from "./protocol.js";

/** A canonical lowercase UUID. */
export const UUID = UUID_PATTERN;

/** A list a language punctuates its own way (core-service-111). */
export const listed = (names: readonly string[]): string =>
  names.join(i18n._({ id: ", ", comment: "Separates names listed in one message" }));

export class StorageFormatError extends Error {
  constructor(readonly file: string, readonly reason: string) {
    super(i18n._({ id: "{file}: {reason}", comment: "A storage fault as one line: the file, then the reason — itself a message",
      values: { file, reason } }));
    this.name = "StorageFormatError";
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
export const isTimestamp = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
/** A normalized absolute path on this device. */
export const isLocalPath = (value: unknown): value is string =>
  isText(value) && !value.includes("\0") && isAbsolute(value) && resolve(value) === value;
/** A recorded path keeps its source device's syntax; it never authorizes
 * execution. */
export const isRecordedPath = (value: unknown): value is string => isText(value) && !value.includes("\0") && (
  posix.isAbsolute(value) && posix.resolve(value) === value ||
  (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\")) && win32.isAbsolute(value) && win32.resolve(value) === value
);

export function need(condition: unknown, file: string, reason: string): asserts condition {
  if (!condition) throw new StorageFormatError(file, reason);
}

/** A closed object: the required fields present, nothing undeclared. */
export function closed(value: unknown, required: string[], optional: string[], file: string): asserts value is Record<string, unknown> {
  need(isObject(value), file, i18n._({ id: "expected an object", comment: "Storage diagnostic: a record in the file is not an object" }));
  need(required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), file,
    i18n._({ id: "expected fields {required}{optional}",
      comment: "Storage diagnostic; the field names are the file format's own, and the optional clause is itself a message",
      values: { required: listed(required), optional: optional.length
        ? i18n._({ id: "; optional {fields}", comment: "Clause naming the fields a record may also carry", values: { fields: listed(optional) } })
        : "" } }));
}

/** A reader refuses a layout version it does not know (storage-1). */
export function knownFormat(value: Record<string, unknown>, file: string): void {
  need(value.format === 1, file, i18n._({ id: "unsupported format {format}; preserved unchanged",
    comment: "Storage diagnostic: the file names a layout version this Spex does not read; the file is left as it is",
    values: { format: String(value.format) } }));
}

export function readJsonFile(file: string): unknown {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new StorageFormatError(file, (error as Error).message); }
}

/** Atomic same-directory replacement, synced before and after the rename. */
export function writeApplicationBytes(file: string, bytes: Buffer | string): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, file);
  // Directory handles are not supported by Windows; the file is still synced.
  if (process.platform !== "win32") {
    const dir = openSync(dirname(file), "r"); try { fsyncSync(dir); } finally { closeSync(dir); }
  }
}

export function writeApplicationFile(file: string, value: unknown): void { writeApplicationBytes(file, JSON.stringify(value)); }

export const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

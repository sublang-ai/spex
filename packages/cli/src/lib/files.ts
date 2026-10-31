// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The primitives every Spex-owned file shares (storage-14): closed
// encodings checked field by field, atomic same-directory replacement —
// plain, or under the version the writer read (DR-111) — the one
// storage fault a reader reports, and which of a clone's paths may leave
// the device. Their words are the host's (words.ts).

import { createHash, randomUUID } from "node:crypto";
import { closeSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, type Stats } from "node:fs";
import { readOwnerAndDacl } from "@openclaw/fs-safe/permissions";
import { createDirectorySync, createFileSync, assertNoSymlinkParentsSync } from "@openclaw/fs-safe/advanced";
import { dirname, isAbsolute, parse, posix, resolve, win32 } from "node:path";
import { words } from "./words.js";

/** A canonical lowercase UUID. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A list a language punctuates its own way (core-service-111). */
export const listed = (names: readonly string[]): string => names.join(words().listSeparator());

export class StorageFormatError extends Error {
  constructor(readonly file: string, readonly reason: string) {
    super(words().storageFault(file, reason));
    this.name = "StorageFormatError";
  }
}

/** Spex's private-storage policy over facts inspected by fs-safe. Windows
 * administrators and SYSTEM are privileged principals, as root is on POSIX. */
export function hasPrivatePermissions(file: string, stat: Pick<Stats, "mode" | "uid">): boolean {
  if (process.platform !== "win32") return (stat.mode & 0o077) === 0 &&
    (typeof process.getuid !== "function" || stat.uid === process.getuid());
  const facts = readOwnerAndDacl(file);
  if (facts.status !== "supported" || !facts.complete || !facts.isLocal || !facts.daclPresent || facts.unsupportedAceTypes.length) return false;
  const trusted = new Set([facts.currentUserSid, "s-1-5-18", "s-1-5-32-544"]);
  return trusted.has(facts.ownerSid) && facts.aces.every(ace =>
    ace.aceType === "deny" || ace.mask === 0 || trusted.has(ace.sid));
}

/** Create a Windows state root privately from its first appearance. Existing
 * roots are verified, never silently repaired or admitted by synthetic mode bits. */
export async function prepareWindowsStorageDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") makePrivateDirectory(directory);
}

/** Synchronous callers use the library's same private creator. */
export function makePrivateDirectory(directory: string): void {
  if (process.platform !== "win32") { mkdirSync(directory, { recursive: true, mode: 0o700 }); return; }
  assertNoSymlinkParentsSync({ rootDir: parse(directory).root, targetPath: directory, requireDirectories: true });
  const info = lstatSync(directory, { throwIfNoEntry: false });
  if (!info) {
    const parent = dirname(directory);
    if (!lstatSync(parent, { throwIfNoEntry: false })) makePrivateDirectory(parent);
    try { createDirectorySync(directory, { private: true }); }
    catch (error) { if (!["EEXIST", "already-exists"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error; }
  }
  const current = lstatSync(directory);
  if (current.isSymbolicLink() || !current.isDirectory() || !hasPrivatePermissions(directory, current)) {
    throw new StorageFormatError(directory, "private storage permissions cannot be verified");
  }
}

function assertPrivateWindowsEntry(file: string): void {
  if (process.platform !== "win32") return;
  const info = lstatSync(file);
  if (info.isSymbolicLink() || !hasPrivatePermissions(file, info)) {
    throw new StorageFormatError(file, "private storage permissions cannot be verified");
  }
}

/** A directory reader never follows a linked root. Missing roots are
 * empty; a present non-directory is a storage diagnostic. */
export function assertPlainDirectory(file: string): void {
  const info = lstatSync(file, { throwIfNoEntry: false });
  if (info && (info.isSymbolicLink() || !info.isDirectory())) {
    throw new StorageFormatError(file, "unsafe destination parent");
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
  need(isObject(value), file, words().expectedObject());
  need(required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key)), file,
    words().expectedFields(listed(required), optional.length ? words().optionalFields(listed(optional)) : ""));
}

/** A reader refuses a layout version it does not know (storage-1): one
 * format, or any of a list a reader reads. */
export function knownFormat(value: Record<string, unknown>, file: string, format: number | readonly number[] = 1): void {
  const formats: readonly unknown[] = typeof format === "number" ? [format] : format;
  need(formats.includes(value.format), file, words().unsupportedFormat(String(value.format)));
}

export function readJsonFile(file: string): unknown {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { throw new StorageFormatError(file, (error as Error).message); }
}

/** Atomic same-directory replacement, synced before and after the rename. */
export function writeApplicationBytes(file: string, bytes: Buffer | string): void {
  assertPrivateWindowsEntry(dirname(file));
  const temporary = `${file}.${randomUUID()}.tmp`;
  const owned = process.platform === "win32" ? createFileSync(temporary, { private: true }) : undefined;
  const fd = owned?.fd ?? openSync(temporary, "wx", 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { if (owned) owned.close(); else closeSync(fd); }
  assertPrivateWindowsEntry(temporary);
  renameSync(temporary, file);
  // Directory handles are not supported by Windows; the file is still synced.
  if (process.platform !== "win32") {
    const dir = openSync(dirname(file), "r"); try { fsyncSync(dir); } finally { closeSync(dir); }
  }
}

export function writeApplicationFile(file: string, value: unknown): void { writeApplicationBytes(file, JSON.stringify(value)); }

export const sha256 = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

// -- versioned writes (DR-111) ------------------------------------------------

/** A file's version: the SHA-256 of its exact bytes, or null where no
 * file stands. */
export type FileVersion = string | null;

/** A versioned write found its file changed since it was read: the
 * caller reads again and retries (DR-111). */
export class VersionConflictError extends Error {
  constructor(readonly file: string) {
    super(words().changedMeanwhile(file));
    this.name = "VersionConflictError";
  }
}

/** A file's bytes with their version; null bytes where it is absent. */
export function readVersioned(file: string): { bytes: Buffer | null; version: FileVersion } {
  let bytes: Buffer;
  try { bytes = readFileSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { bytes: null, version: null };
    throw error;
  }
  return { bytes, version: sha256(bytes) };
}

export const fileVersion = (file: string): FileVersion => readVersioned(file).version;

/** Atomic same-directory replacement under a version: the file is
 * checked at the instant before the rename and the write refused as a
 * conflict where it no longer stands at `expected`. It is published
 * with `mode` exactly, the umask applying to none of it. No folder is made:
 * a write whose folder is gone is refused the same way. The temporary
 * file never outlives a refusal or a failure. */
export function writeVersionedBytes(file: string, bytes: Buffer | string, expected: FileVersion, mode = 0o600): void {
  if (mode === 0o600) assertPrivateWindowsEntry(dirname(file));
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd: number;
  let owned: ReturnType<typeof createFileSync> | undefined;
  try {
    if (process.platform === "win32" && mode === 0o600) owned = createFileSync(temporary, { private: true });
    fd = owned?.fd ?? openSync(temporary, "wx", mode);
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new VersionConflictError(file);
    throw error;
  }
  try {
    try { writeFileSync(fd, bytes); fchmodSync(fd, mode); fsyncSync(fd); } finally { if (owned) owned.close(); else closeSync(fd); }
    if (mode === 0o600) assertPrivateWindowsEntry(temporary);
    if (fileVersion(file) !== expected) throw new VersionConflictError(file);
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  if (process.platform !== "win32") {
    const dir = openSync(dirname(file), "r"); try { fsyncSync(dir); } finally { closeSync(dir); }
  }
}

/** Whether a path of a clone may leave the device: not one of the
 * catalog's ignored families (storage-1, storage-17). */
export const portable = (file: string): boolean =>
  !/^(\.spex\/|packages\/|skills\/|local\/|\.spex-uploads\/|\.spex-apply\.json$|\.lock)/.test(file) &&
  !/\.(hints|spex)\.json$|(?<!^spex)\.lock(?:\.|\/|$)|\.tmp$|\.bak(?:\.|$)|\.backup(?:\.|$)/.test(file);

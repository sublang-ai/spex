// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The primitives every Spex-owned file shares (storage-14): closed
// encodings checked field by field, atomic same-directory replacement —
// plain, or under the version the writer read (DR-111) — the one
// storage fault a reader reports, and which of a clone's paths may leave
// the device. Their words are the host's (words.ts).

import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, type Stats } from "node:fs";
import { readOwnerAndDacl } from "@openclaw/fs-safe/permissions";
import { createDirectorySync, createFileSync, assertNoSymlinkParentsSync } from "@openclaw/fs-safe/advanced";
import { dirname, isAbsolute, join, parse, posix, resolve, win32 } from "node:path";
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

// Windows access rights that let a principal change an entry, by their
// Win32 names. File and directory rights share these bits: adding a file
// or subdirectory is writing or appending data.
const FILE_WRITE_DATA = 0x0000_0002;
const FILE_APPEND_DATA = 0x0000_0004;
const FILE_WRITE_EA = 0x0000_0010;
const FILE_DELETE_CHILD = 0x0000_0040;
const FILE_WRITE_ATTRIBUTES = 0x0000_0100;
const DELETE = 0x0001_0000;
const WRITE_DAC = 0x0004_0000;
const WRITE_OWNER = 0x0008_0000;
const MAXIMUM_ALLOWED = 0x0200_0000;
const GENERIC_ALL = 0x1000_0000;
const GENERIC_WRITE = 0x4000_0000;

/** Rights a grant may not give another principal over a private entry
 * (storage-57). Read, execute and synchronize grants hold none of them. */
const CHANGE_RIGHTS = FILE_WRITE_DATA | FILE_APPEND_DATA | FILE_WRITE_EA | FILE_DELETE_CHILD |
  FILE_WRITE_ATTRIBUTES | DELETE | WRITE_DAC | WRITE_OWNER | MAXIMUM_ALLOWED | GENERIC_ALL | GENERIC_WRITE;

/** Spex's private-storage check (storage-57) over facts inspected by
 * fs-safe, applied only where an entry's integrity is relied on — the
 * root lease, a clone's lease before a move, upload staging and a seat's
 * Codex home. POSIX admits the current user's entry with no group or
 * other bit. Windows admits an entry the current user, LocalSystem or
 * built-in Administrators own, as root is on POSIX, whose descriptor
 * grants no other principal a right to change it; a read grant another
 * tool added, such as the Codex sandbox's, is admitted (DR-223). */
export function hasPrivatePermissions(file: string, stat: Pick<Stats, "mode" | "uid">): boolean {
  if (process.platform !== "win32") return (stat.mode & 0o077) === 0 &&
    (typeof process.getuid !== "function" || stat.uid === process.getuid());
  const facts = readOwnerAndDacl(file);
  if (facts.status !== "supported" || !facts.complete || !facts.daclPresent || facts.unsupportedAceTypes.length) return false;
  const trusted = new Set([facts.currentUserSid, "s-1-5-18", "s-1-5-32-544"]);
  return trusted.has(facts.ownerSid) && facts.aces.every(ace =>
    ace.aceType === "deny" || (ace.mask & CHANGE_RIGHTS) === 0 || trusted.has(ace.sid));
}

/** Create a Windows state root privately from its first appearance; an
 * existing root is admitted whatever its permissions, as on POSIX
 * (storage-57, DR-223). */
export async function prepareWindowsStorageDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") makePrivateDirectory(directory);
}

/** Make a folder owner-only where none stands — on Windows through
 * fs-safe's protected creator, each missing parent the same way — and
 * admit one that stands whatever its permissions, refusing only a link or
 * a non-directory (storage-57). */
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
  if (current.isSymbolicLink() || !current.isDirectory()) throw new StorageFormatError(directory, "not a directory, or a link");
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

// -- writes -------------------------------------------------------------------
//
// Every write is an atomic same-directory replacement through `publish`.
// Its caller chooses two things, never inferred from a mode:
//
//   |                     | under a version (DR-111)   | under none            |
//   | ------------------- | -------------------------- | --------------------- |
//   | Spex-owned, private | writePrivateVersionedBytes | writeApplicationBytes |
//   | ordinary file       | writeVersionedBytes        | writeWorkingBytes     |
//
// A private file is created owner-only (storage-57); an ordinary one takes
// its folder's inherited permissions and keeps its mode (environments-49).
// No write checks the permissions of its folder or its file.

/** Atomic same-directory replacement of a Spex-owned file, created
 * owner-only and synced before and after the rename (storage-57). */
export function writeApplicationBytes(file: string, bytes: Buffer | string): void {
  publish(file, bytes, { privately: true });
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
 * conflict where it no longer stands at `expected`. No folder is made:
 * a write whose folder is gone is refused the same way. The temporary
 * file never outlives a refusal or a failure.
 *
 * This is an ordinary file of its folder (environments-49): it takes the
 * folder's inherited permissions, none of them checked, and is published
 * with `mode` exactly, else the mode the file holds, else `0644`, the
 * umask applying to none of it. A Spex-owned file the home keeps private
 * is written with `writePrivateVersionedBytes`. */
export function writeVersionedBytes(file: string, bytes: Buffer | string, expected: FileVersion, mode?: number): void {
  publish(file, bytes, { privately: false, expected, ...(mode !== undefined ? { mode } : {}) });
}

/** `writeVersionedBytes` for a Spex-owned file, created owner-only
 * (storage-57). */
export function writePrivateVersionedBytes(file: string, bytes: Buffer | string, expected: FileVersion): void {
  publish(file, bytes, { privately: true, expected });
}

/** Atomic same-directory replacement of an ordinary file of its folder,
 * under no version (environments-49): the mode as `writeVersionedBytes`
 * keeps it. No folder is made. */
export function writeWorkingBytes(file: string, bytes: Buffer | string): void {
  publish(file, bytes, { privately: false });
}

/** The mode of the regular file at `file`, or undefined where none stands. */
function heldMode(file: string): number | undefined {
  const info = lstatSync(file, { throwIfNoEntry: false });
  return info?.isFile() ? info.mode & 0o777 : undefined;
}

/** How `publish` writes a file. */
interface PublishOptions {
  /** Owner-only (storage-57), else an ordinary file of its folder. */
  privately: boolean;
  /** The version the writer read — `null` where it found no file — for
   * a versioned write; absent for a write under no version. */
  expected?: FileVersion;
  /** An ordinary file's mode, else the mode it holds, else `0644`. */
  mode?: number;
}

/** The one replacement every write above makes: written beside the file,
 * synced, checked against `expected` where a version is given, renamed
 * into place and the folder synced where the platform can. */
function publish(file: string, bytes: Buffer | string, { privately, expected, mode }: PublishOptions): void {
  const versioned = expected !== undefined;
  const target = privately ? 0o600 : mode ?? heldMode(file) ?? 0o644;
  const temporary = `${file}.${randomUUID()}.tmp`;
  let fd: number;
  let owned: ReturnType<typeof createFileSync> | undefined;
  try {
    if (privately && process.platform === "win32") owned = createFileSync(temporary, { private: true });
    fd = owned?.fd ?? openSync(temporary, "wx", target);
  }
  catch (error) {
    if (versioned && (error as NodeJS.ErrnoException).code === "ENOENT") throw new VersionConflictError(file);
    throw error;
  }
  try {
    try { writeFileSync(fd, bytes); fchmodSync(fd, target); fsyncSync(fd); } finally { if (owned) owned.close(); else closeSync(fd); }
    if (versioned && fileVersion(file) !== expected) throw new VersionConflictError(file);
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  // Directory handles are not supported by Windows; the file is still synced.
  if (process.platform !== "win32") {
    const dir = openSync(dirname(file), "r"); try { fsyncSync(dir); } finally { closeSync(dir); }
  }
}

/** Whether a path of a clone may leave the device: not one of the
 * catalog's ignored families (storage-1, storage-17). */
export const portable = (file: string): boolean =>
  !/^(\.spex\/|packages\/|skills\/|local\/|\.spex-uploads\/|\.spex-apply\.json$|\.lock)/.test(file) &&
  !/\.(hints|spex)\.json$|(?<!^spex)\.lock(?:\.|\/|$)|\.tmp$|\.bak(?:\.|$)|\.backup(?:\.|$)/.test(file);

/** Remove a file or a tree as `rmSync` with `recursive` and `force`
 * does, read-only files included (environments-7). Where Windows refuses
 * with `EPERM` — Node 24's `rmSync` no longer clears the read-only mark —
 * every read-only file it holds is made writable and the removal tried
 * once more; links are not followed, and no folder's mode changes.
 * Returns whether any file was made writable. */
export function removeTree(path: string): boolean {
  try {
    rmSync(path, { recursive: true, force: true });
    return false;
  } catch (error) {
    if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM" || !makeFilesWritable(path)) throw error;
  }
  rmSync(path, { recursive: true, force: true });
  return true;
}

/** Make every read-only file under `path` writable; whether any was. */
function makeFilesWritable(path: string): boolean {
  let stat: Stats;
  try { stat = lstatSync(path); } catch { return false; }
  if (stat.isSymbolicLink()) return false;
  if (stat.isDirectory()) {
    let names: string[];
    try { names = readdirSync(path); } catch { return false; }
    let changed = false;
    for (const name of names) if (makeFilesWritable(join(path, name))) changed = true;
    return changed;
  }
  if ((stat.mode & 0o200) !== 0) return false;
  chmodSync(path, (stat.mode & 0o777) | 0o200);
  return true;
}

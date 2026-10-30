// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The home file's encoding and its instances (storage-2, DR-103, DR-127,
// DR-165): `home.yaml` names this device, the origin the home was
// created with, every instance it has signed in to with its account,
// your own group's folder name, and each working folder paired with its
// spex repository's key. This module reads and checks the file, and
// adds, updates and removes an instance's entry; the pairings are the
// app's, which checks them where it reads them. Either host changes the
// file in one step — read, changed and written under the version read —
// so what one wrote the other sees at its next read.

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  closed, isObject, isText, isUuid, knownFormat, need, readVersioned, StorageFormatError, writeVersionedBytes,
} from "./files.js";
import { CLIENT_ID } from "./git-host.js";
import { canonicalOrigin, hostUrlFor, instanceFolder, instanceSegmentOf, OriginRefused } from "./instance.js";
import { words } from "./words.js";

export { CLIENT_ID };

export const HOME_FILE = "home.yaml";
const GROUP_NAME = /^[a-z0-9][a-z0-9-]*$/;

export interface HomeAccount { id: string; login: string; displayName: string | null }
/** An instance the home has signed in to (DR-127), by its canonical
 * origin: its client, the account it signed in as, whether it was
 * signed out since, and its display name as last read. */
export interface HomeInstance { origin: string; clientId: typeof CLIENT_ID; account?: HomeAccount; signedOut?: boolean; displayName?: string }
export interface HomeFolder { path: string; repository: string; aliases?: string[] }
export interface HomeFile {
  format: 2;
  device: string;
  /** The origin the home was created with: the default instance while
   * no instance is listed. */
  origin: string;
  /** Every instance the home has signed in to; the first is the
   * default instance. */
  instances: HomeInstance[];
  own: string;
  folders: HomeFolder[];
}

/** Why an instance operation was refused (DR-127):
 * - `another-account`: a sign-in to a listed instance as another account;
 * - `signed-in`: Forget of an instance still signed in.
 * The message is the library's own; the reader's words are composed
 * where each host speaks. */
export class InstanceRefused extends Error {
  constructor(readonly reason: "another-account" | "signed-in", readonly origin: string) {
    super(reason === "another-account" ? `${origin} is signed in as another account` : `${origin} is signed in`);
    this.name = "InstanceRefused";
  }
}

/** Lowercase kebab-case: runs of anything else become one hyphen. */
export function kebab(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** This device's user name as a group folder name (storage-2). */
export function defaultOwnName(env: NodeJS.ProcessEnv = process.env): string {
  let name = "";
  try { name = userInfo().username; } catch { name = env.USER ?? env.USERNAME ?? ""; }
  return kebab(name) || "me";
}

/** Whether a name may stand as a group folder under `workspace/`. */
export function isGroupName(value: string): boolean {
  return GROUP_NAME.test(value);
}

export const invalidHome = (): string => words().invalidHome();

/** A URL shown in a diagnostic: any user info it carries, which may hold
 * a secret, stands as `…`. */
function shownUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, "$1…@");
}

/** The reason a URL stands as no instance's canonical origin (DR-127). */
export function notAnOrigin(url: string): string {
  return words().notAnOrigin(shownUrl(url));
}

/** Whether a value is an instance's origin as it is recorded: canonical. */
function isOrigin(value: unknown): value is string {
  if (!isText(value)) return false;
  try { return canonicalOrigin(value) === value; } catch { return false; }
}

/** `home.yaml`'s format, refused unless it is this Spex's: format 1 says
 * the instances migration has not run (storage-1). */
function homeFormat(value: Record<string, unknown>, file: string): void {
  need(value.format !== 1, file, words().homeBeforeInstances());
  knownFormat(value, file, 2);
}

function parseAccount(value: unknown, file: string): void {
  closed(value, ["id", "login", "displayName"], [], file);
  need(isText(value.id) && isText(value.login) && (value.displayName === null || typeof value.displayName === "string"), file, invalidHome());
}

/** A check of the pairings a host reads, after every other field. */
export type FoldersCheck = (folders: readonly unknown[], file: string) => void;

/**
 * `home.yaml`'s value checked field by field (storage-2): its format,
 * device, origin, your own group's name and every instance's entry —
 * one per origin, and no two origins at one folder — and the pairings a
 * list, each entry checked by `checkFolders` where the host supplies it.
 * A malformed or unknown file is refused, never guessed at.
 */
export function parseHomeFile(value: unknown, file: string, checkFolders?: FoldersCheck): HomeFile {
  need(isObject(value), file, invalidHome());
  homeFormat(value, file);
  closed(value, ["format", "device", "origin", "instances", "own", "folders"], [], file);
  need(isUuid(value.device) && typeof value.own === "string" && GROUP_NAME.test(value.own) &&
    Array.isArray(value.instances) && Array.isArray(value.folders) && isText(value.origin), file, invalidHome());
  need(isOrigin(value.origin), file, notAnOrigin(value.origin));
  const folders = new Map<string, string>();
  for (const instance of value.instances) {
    closed(instance, ["origin", "clientId", "account"], ["signedOut", "displayName"], file);
    need(isText(instance.origin) && instance.clientId === CLIENT_ID &&
      (instance.signedOut === undefined || typeof instance.signedOut === "boolean") &&
      (instance.displayName === undefined || typeof instance.displayName === "string"), file, invalidHome());
    need(isOrigin(instance.origin), file, notAnOrigin(instance.origin));
    parseAccount(instance.account, file);
    // One entry per origin, and no two origins at one folder (DR-127).
    const folder = instanceFolder(instance.origin);
    const first = folders.get(folder);
    need(first === undefined, file, words().instancesShareFolder(first ?? "", instance.origin, folder));
    folders.set(folder, instance.origin);
  }
  checkFolders?.(value.folders, file);
  return value as unknown as HomeFile;
}

/** `home.yaml`'s value from its text; text that will not read is
 * refused as a storage diagnostic of the file. */
export function parseHomeText(text: string, file: string, checkFolders?: FoldersCheck): HomeFile {
  let value: unknown;
  try { value = parseYaml(text); }
  catch (error) { throw new StorageFormatError(file, (error as Error).message); }
  return parseHomeFile(value, file, checkFolders);
}

/** The canonical origin a caller names, or the refusal of one that is
 * none as a storage diagnostic of `file`. */
function originOf(origin: string, file: string): string {
  try { return canonicalOrigin(origin); }
  catch (error) {
    if (!(error instanceof OriginRefused)) throw error;
    throw new StorageFormatError(file, notAnOrigin(origin));
  }
}

/** A new home, not yet written: a fresh device id unless one is
 * supplied, the origin the environment names, no instance signed in
 * to, and this device's user name as your own group. A URL the
 * environment names that is no instance's origin is refused as a
 * storage diagnostic of `file`. */
export function newHomeFile(file: string, options: { own?: string; env?: NodeJS.ProcessEnv; device?: string } = {}): HomeFile {
  const own = options.own ?? defaultOwnName(options.env);
  let origin: string;
  try { origin = hostUrlFor(options.env); }
  catch (error) {
    if (!(error instanceof OriginRefused)) throw error;
    throw new StorageFormatError(file, notAnOrigin((options.env ?? process.env).SPEX_HOST_URL?.trim() ?? ""));
  }
  return { format: 2, device: options.device ?? randomUUID(), origin, instances: [], own, folders: [] };
}

// -- instances (DR-127) ------------------------------------------------------

/** The listed entry at an origin in any spelling; -1 where none, or
 * where the value is no origin. */
function indexOf(home: HomeFile, origin: string): number {
  let canonical: string;
  try { canonical = canonicalOrigin(origin); } catch { return -1; }
  return home.instances.findIndex((entry) => entry.origin === canonical);
}

/** The default instance: the first listed, else the origin the home
 * was created with. */
export function defaultInstanceOf(home: HomeFile): HomeInstance {
  const first = home.instances[0];
  return first ? structuredClone(first) : { origin: home.origin, clientId: CLIENT_ID };
}

/** The listed instance at an origin, in any spelling of it. */
export function instanceAt(home: HomeFile, origin: string): HomeInstance | undefined {
  const index = indexOf(home, origin);
  return index < 0 ? undefined : structuredClone(home.instances[index]);
}

/** The instance whose folder under `workspace/` is `folder`: a listed
 * one, else the origin the home was created with. */
export function instanceByFolder(home: HomeFile, folder: string): HomeInstance | undefined {
  const listed = home.instances.find((entry) => instanceFolder(entry.origin) === folder);
  if (listed) return structuredClone(listed);
  return instanceFolder(home.origin) === folder ? { origin: home.origin, clientId: CLIENT_ID } : undefined;
}

/** The instance whose folder a key lies in; none for a key outside
 * every instance's folder. */
export function instanceOfKey(home: HomeFile, key: string): HomeInstance | undefined {
  const folder = instanceSegmentOf(key);
  return folder === null ? undefined : instanceByFolder(home, folder);
}

/** The account at an instance while it is signed in there; the
 * default instance where no origin is named. */
export function accountAt(home: HomeFile, origin?: string): HomeAccount | null {
  const index = indexOf(home, origin ?? defaultInstanceOf(home).origin);
  const entry = index < 0 ? undefined : home.instances[index];
  return entry?.account && entry.signedOut !== true ? structuredClone(entry.account) : null;
}

/** The home after a sign-in read `account` at `origin` (storage-2): the
 * instance listed where it is not, after those that are — an origin
 * that is none refused as a diagnostic of `file` — its entry signed in
 * again, and a sign-in as another account than the one it lists refused
 * with `InstanceRefused`. The caller checks the whole next file. */
export function withSignIn(home: HomeFile, origin: string, account: HomeAccount, file: string): HomeFile {
  const canonical = originOf(origin, file);
  const index = indexOf(home, canonical);
  const prior = index < 0 ? undefined : home.instances[index];
  if (prior?.account && prior.account.id !== account.id) throw new InstanceRefused("another-account", canonical);
  const entry: HomeInstance = {
    origin: canonical, clientId: CLIENT_ID,
    account: { id: account.id, login: account.login, displayName: account.displayName },
    ...(prior?.displayName !== undefined ? { displayName: prior.displayName } : {}),
  };
  const instances = index < 0 ? [...home.instances, entry] : home.instances.map((item, at) => at === index ? entry : item);
  return { ...home, instances };
}

/** The home after the credential at an instance went while its account
 * is kept (git-host-4, git-host-10): it reads signed out until its next
 * sign-in. The default instance's where no origin is named; unchanged
 * where none is listed or signed in. */
export function withSignOut(home: HomeFile, origin?: string): HomeFile {
  const index = indexOf(home, origin ?? defaultInstanceOf(home).origin);
  if (index < 0 || !home.instances[index].account) return home;
  return { ...home, instances: home.instances.map((item, at) => at === index ? { ...item, signedOut: true } : item) };
}

/** The home after an instance signed out, or never signed in, is
 * forgotten: its entry goes; one signed in is refused with
 * `InstanceRefused`. Null where none is listed at that origin. */
export function withoutInstance(home: HomeFile, origin: string): HomeFile | null {
  const index = indexOf(home, origin);
  if (index < 0) return null;
  const entry = home.instances[index];
  if (entry.account && entry.signedOut !== true) throw new InstanceRefused("signed-in", entry.origin);
  return { ...home, instances: home.instances.filter((_, at) => at !== index) };
}

/** The home with an instance's display name as last read; null where it
 * is not listed. */
export function withDisplayName(home: HomeFile, origin: string, displayName: string | null): HomeFile | null {
  const index = indexOf(home, origin);
  if (index < 0) return null;
  const { displayName: _, ...rest } = home.instances[index];
  const entry: HomeInstance = displayName === null ? rest : { ...rest, displayName };
  return { ...home, instances: home.instances.map((item, at) => at === index ? entry : item) };
}

// -- one step ----------------------------------------------------------------

/** The path of a home's file. */
export function homeFilePath(root: string): string {
  return join(root, HOME_FILE);
}

/** A home's file as it stands, checked; null where none stands. */
export function readHomeFile(root: string, checkFolders?: FoldersCheck): HomeFile | null {
  const file = homeFilePath(root);
  const { bytes } = readVersioned(file);
  return bytes === null ? null : parseHomeText(bytes.toString("utf8"), file, checkFolders);
}

/**
 * Change a home's file in one step (DR-111, DR-165): read at its version
 * — a new home where none stands — changed, checked whole and written
 * under the version read, so a writer that changed it meanwhile makes
 * the write a `VersionConflictError` and nothing is lost. A change
 * returning null writes nothing. Returns the file as it then stands.
 */
export function updateHomeFile(
  root: string,
  change: (home: HomeFile) => HomeFile | null,
  options: { env?: NodeJS.ProcessEnv; checkFolders?: FoldersCheck } = {},
): HomeFile {
  const file = homeFilePath(root);
  const { bytes, version } = readVersioned(file);
  const current = bytes === null ? newHomeFile(file, { env: options.env }) : parseHomeText(bytes.toString("utf8"), file, options.checkFolders);
  const next = change(structuredClone(current));
  if (next === null) return current;
  parseHomeFile(next, file, options.checkFolders);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeVersionedBytes(file, stringifyYaml(next), version);
  return next;
}

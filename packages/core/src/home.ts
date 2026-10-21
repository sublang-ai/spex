// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The home file (storage-2, DR-103, DR-127): this device, the origin it
// was created with, every instance it has signed in to with its account,
// your own group's folder name, and each working folder paired with its
// spex repository's key — the clone's path under `workspace/`.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  closed, isLocalPath, isObject, isRecordedPath, isText, isUuid, knownFormat, need,
  StorageFormatError, writeApplicationBytes,
} from "./files.js";
import { i18n } from "./i18n.js";
import { canonicalOrigin, hostUrlFor, instanceFolder, instanceSegmentOf, OriginRefused } from "./instance.js";
import { REPOSITORY_KEY_PATTERN } from "./protocol.js";

export { hostUrlFor };

export const HOME_FILE = "home.yaml";
export const WORKSPACE = "workspace";
/** The most segments a key the walks of `workspace/` find may hold: the
 * nine a key held before DR-127, and the instance's folder before them. */
export const WORKSPACE_DEPTH = 10;
/** The public OAuth client id every Spex uses at the Git host (storage-2). */
export const CLIENT_ID = "spex";
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
 * The message is the core's own; the reader's words are composed where
 * the core speaks. */
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

/** A spex repository's name for a folder or group name: `<name>-spex`. */
export function repositoryNameFor(name: string): string {
  return `${kebab(name) || "project"}-spex`;
}

export function isRepositoryKey(value: unknown): value is string {
  return typeof value === "string" && REPOSITORY_KEY_PATTERN.test(value);
}

/** The instance folder, the group path in that instance and the name
 * of a key: `@spex.pub`, `acme/platform` and `a-spex` of
 * `@spex.pub/acme/platform/a-spex`; the instance null for a key outside
 * every instance's folder, as your own group's and the local-only
 * clones' are (DR-127). */
export function splitKey(key: string): { instance: string | null; group: string; name: string } {
  const instance = instanceSegmentOf(key);
  const path = instance === null ? key : key.slice(instance.length + 1);
  const at = path.lastIndexOf("/");
  return at < 0 ? { instance, group: "", name: path } : { instance, group: path.slice(0, at), name: path.slice(at + 1) };
}

export const invalidHome = (): string =>
  i18n._({ id: "invalid home file", comment: "Storage diagnostic: home.yaml's own fields are malformed" });

/** A URL shown in a diagnostic: any user info it carries, which may hold
 * a secret, stands as `…`. */
function shownUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, "$1…@");
}

/** The reason a URL stands as no instance's canonical origin (DR-127). */
export function notAnOrigin(url: string): string {
  return i18n._({ id: "{url} is not an instance's origin",
    comment: "Storage diagnostic: a host URL is not an instance's origin written canonically — http or https (http on localhost or 127.x alone), a lowercase host of DNS labels (letters, digits and inner hyphens) joined by single dots, and a port from 1 to 65535 other than the scheme's default, nothing else; the URL is shown with any user info as …",
    values: { url: shownUrl(url) } });
}

/** Whether a value is an instance's origin as it is recorded: canonical. */
function isOrigin(value: unknown): value is string {
  if (!isText(value)) return false;
  try { return canonicalOrigin(value) === value; } catch { return false; }
}

/** `home.yaml`'s format, refused unless it is this Spex's: format 1 says
 * the instances migration has not run (storage-1). */
function homeFormat(value: Record<string, unknown>, file: string): void {
  need(value.format !== 1, file, i18n._({ id: "format 1: the instances migration has not run; preserved unchanged",
    comment: "Storage diagnostic: home.yaml is still in the layout before a home recorded several instances, which the one-time instances migration rewrites; the file is left as it is" }));
  knownFormat(value, file, 2);
}

function parseAccount(value: unknown, file: string): void {
  closed(value, ["id", "login", "displayName"], [], file);
  need(isText(value.id) && isText(value.login) && (value.displayName === null || typeof value.displayName === "string"), file, invalidHome());
}

export function parseHomeFile(value: unknown, file: string): HomeFile {
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
    need(first === undefined, file, i18n._({ id: "instances {first} and {second} share the folder {folder}",
      comment: "Storage diagnostic: two instances home.yaml lists, or one listed twice, would hold their spex repositories in one folder under workspace/",
      values: { first: first ?? "", second: instance.origin, folder } }));
    folders.set(folder, instance.origin);
  }
  const paths = new Set<string>(); const keys = new Set<string>();
  for (const folder of value.folders) {
    closed(folder, ["path", "repository"], ["aliases"], file);
    need(isLocalPath(folder.path) && isRepositoryKey(folder.repository) &&
      (folder.aliases === undefined || Array.isArray(folder.aliases) && folder.aliases.every(isRecordedPath) && new Set(folder.aliases).size === folder.aliases.length),
      file, i18n._({ id: "invalid working folder pair", comment: "Storage diagnostic: a working folder or its spex repository's key is malformed" }));
    for (const path of [folder.path, ...(folder.aliases as string[] | undefined ?? [])]) {
      need(!paths.has(path), file, i18n._({ id: "folder {path} is paired twice", comment: "Storage diagnostic: one folder appears in two pairs",
        values: { path } }));
      paths.add(path);
    }
    need(!keys.has(folder.repository), file, i18n._({ id: "spex repository {key} is paired twice",
      comment: "Storage diagnostic: one spex repository appears in two pairs", values: { key: folder.repository } }));
    keys.add(folder.repository);
  }
  return value as unknown as HomeFile;
}

/** The home: its file, its workspace and the pairs of this device. */
export class Home {
  /** The file's text as this home last read or wrote it. */
  private text?: string;

  private constructor(readonly root: string, private data: HomeFile) {}

  static file(root: string): string { return join(root, HOME_FILE); }
  static exists(root: string): boolean { return existsSync(Home.file(root)); }

  /** Read `home.yaml`; a malformed or unknown one is refused, never guessed. */
  static load(root: string): Home {
    const file = Home.file(root);
    let text: string;
    try { text = readFileSync(file, "utf8"); }
    catch (error) { throw new StorageFormatError(file, (error as Error).message); }
    const home = new Home(resolve(root), Home.parse(text, file));
    home.text = text;
    return home;
  }

  private static parse(text: string, file: string): HomeFile {
    let value: unknown;
    try { value = parseYaml(text); }
    catch (error) { throw new StorageFormatError(file, (error as Error).message); }
    return parseHomeFile(value, file);
  }

  /** Read `home.yaml` again where its bytes changed since this home last
   * read or wrote them — an editor's or another writer's change — so the
   * next change applies to the file as it stands (DR-111); true where it
   * changed. A file that no longer parses, or was deleted once read, is
   * refused, never replaced; only a home not yet written has none. */
  refresh(): boolean {
    const file = Home.file(this.root);
    let text: string;
    try { text = readFileSync(file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new StorageFormatError(file, (error as Error).message);
      if (this.text === undefined) return false;
      throw new StorageFormatError(file, i18n._({
        id: "{file} changed meanwhile; retry",
        values: { file: HOME_FILE },
        comment: "Refusal: a file changed between the core's read and its write; the reader retries",
      }));
    }
    if (text === this.text) return false;
    this.data = Home.parse(text, file);
    this.text = text;
    return true;
  }

  /** A new home, not yet written: a fresh device id unless one is
   * supplied, the origin the environment names, no instance signed in
   * to, and this device's user name as your own group. A URL the
   * environment names that is no instance's origin is refused. */
  static create(root: string, options: { own?: string; env?: NodeJS.ProcessEnv; device?: string } = {}): Home {
    const own = options.own ?? defaultOwnName(options.env);
    let origin: string;
    try { origin = hostUrlFor(options.env); }
    catch (error) {
      if (!(error instanceof OriginRefused)) throw error;
      throw new StorageFormatError(Home.file(root), notAnOrigin((options.env ?? process.env).SPEX_HOST_URL?.trim() ?? ""));
    }
    return new Home(resolve(root), {
      format: 2,
      device: options.device ?? randomUUID(),
      origin,
      instances: [],
      own,
      folders: [],
    });
  }

  get file(): HomeFile { return structuredClone(this.data); }
  get device(): string { return this.data.device; }
  /** The origin the home was created with. */
  get origin(): string { return this.data.origin; }
  /** The default instance, as the one host the core still serves until
   * it keeps a client per instance. */
  get host(): HomeInstance { return this.defaultInstance(); }
  get workspace(): string { return join(this.root, WORKSPACE); }
  /** Your own group's folder name under `workspace/`. */
  get ownName(): string { return this.data.own; }

  /** Your own group's spex repository: `<own>/<own>-spex`. */
  own(): string { return `${this.data.own}/${this.data.own}-spex`; }

  clonePath(key: string): string { return join(this.workspace, ...key.split("/")); }

  /** The key of a clone directory under `workspace/`, if it is one. */
  keyOf(cloneDir: string): string | undefined {
    const rel = relative(this.workspace, resolve(cloneDir));
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) return undefined;
    const key = rel.split(sep).join("/");
    return isRepositoryKey(key) ? key : undefined;
  }

  folders(): HomeFolder[] { return structuredClone(this.data.folders); }

  folderOf(key: string): HomeFolder | undefined {
    const found = this.data.folders.find((folder) => folder.repository === key);
    return found ? structuredClone(found) : undefined;
  }

  /** The key paired with a folder, by its path or one of its aliases. */
  keyForFolder(path: string): string | undefined {
    return this.data.folders.find((folder) => folder.path === path || folder.aliases?.includes(path))?.repository;
  }

  /** Pair a folder with a spex repository (storage-6): supplied aliases
   * replace the list, omitted ones keep it, and a folder that moved
   * keeps its former path as an alias. */
  pair(path: string, key: string, aliases?: string[]): HomeFolder {
    const normalized = resolve(path);
    const prior = this.data.folders.find((folder) => folder.repository === key);
    const retained = aliases ?? [...(prior?.aliases ?? []), ...(prior && prior.path !== normalized ? [prior.path] : [])];
    const kept = [...new Set(retained)].filter((alias) => alias !== normalized);
    const folder: HomeFolder = { path: normalized, repository: key, ...(kept.length ? { aliases: kept } : {}) };
    const next = [...this.data.folders.filter((entry) => entry.repository !== key), folder];
    parseHomeFile({ ...this.data, folders: next }, Home.file(this.root));
    this.data = { ...this.data, folders: next };
    return structuredClone(folder);
  }

  unpair(key: string): boolean {
    const before = this.data.folders.length;
    this.data = { ...this.data, folders: this.data.folders.filter((folder) => folder.repository !== key) };
    return this.data.folders.length !== before;
  }

  /** A clone moved: every pair naming the old key names the new one. */
  rename(oldKey: string, newKey: string): void {
    this.data = { ...this.data, folders: this.data.folders.map((folder) => folder.repository === oldKey ? { ...folder, repository: newKey } : folder) };
    if (oldKey === this.own()) {
      // Your own group's folder lies outside every instance's (DR-127).
      const { instance, group, name } = splitKey(newKey);
      if (instance === null && `${group}-spex` === name && GROUP_NAME.test(group)) this.data = { ...this.data, own: group };
    }
  }

  /** Several clones moved in one step (space-59, space-60): every pair
   * naming a moved key names its new one, and your own group's folder
   * takes `own` where it was renamed. Validated before it is taken. */
  move(moves: { from: string; to: string }[], own?: string): void {
    const to = new Map(moves.map((entry) => [entry.from, entry.to]));
    const next: HomeFile = {
      ...this.data,
      ...(own !== undefined ? { own } : {}),
      folders: this.data.folders.map((folder) => to.has(folder.repository) ? { ...folder, repository: to.get(folder.repository) as string } : folder),
    };
    parseHomeFile(next, Home.file(this.root));
    this.data = next;
  }

  // -- instances (DR-127) ----------------------------------------------------

  /** Every instance the home has signed in to, the default first. */
  instances(): HomeInstance[] { return structuredClone(this.data.instances); }

  /** The default instance: the first listed, else the origin the home
   * was created with. */
  defaultInstance(): HomeInstance {
    const first = this.data.instances[0];
    return first ? structuredClone(first) : { origin: this.data.origin, clientId: CLIENT_ID };
  }

  /** The listed instance at an origin, in any spelling of it. */
  instance(origin: string): HomeInstance | undefined {
    const index = this.indexOf(origin);
    return index < 0 ? undefined : structuredClone(this.data.instances[index]);
  }

  /** The instance whose folder under `workspace/` is `folder`: a listed
   * one, else the origin the home was created with. */
  instanceByFolder(folder: string): HomeInstance | undefined {
    const listed = this.data.instances.find((entry) => instanceFolder(entry.origin) === folder);
    if (listed) return structuredClone(listed);
    return instanceFolder(this.data.origin) === folder ? { origin: this.data.origin, clientId: CLIENT_ID } : undefined;
  }

  /** The instance whose folder a key lies in; none for a key outside
   * every instance's folder. */
  instanceOfKey(key: string): HomeInstance | undefined {
    const folder = instanceSegmentOf(key);
    return folder === null ? undefined : this.instanceByFolder(folder);
  }

  /** The account a sign-in read (storage-2): the instance listed where
   * it is not, after those that are — an origin that is none, or whose
   * folder a listed one's equals, refused — its entry signed in again,
   * and a sign-in as another account than the one it lists refused. The origin is the default
   * instance's where none is named. */
  signIn(account: HomeAccount): void;
  signIn(origin: string, account: HomeAccount): void;
  signIn(first: string | HomeAccount, second?: HomeAccount): void {
    const named = typeof first === "string" ? first : this.defaultInstance().origin;
    const account = typeof first === "string" ? second as HomeAccount : first;
    const origin = this.originOf(named);
    const index = this.indexOf(origin);
    const prior = index < 0 ? undefined : this.data.instances[index];
    if (prior?.account && prior.account.id !== account.id) throw new InstanceRefused("another-account", origin);
    const entry: HomeInstance = {
      origin, clientId: CLIENT_ID,
      account: { id: account.id, login: account.login, displayName: account.displayName },
      ...(prior?.displayName !== undefined ? { displayName: prior.displayName } : {}),
    };
    const instances = index < 0 ? [...this.data.instances, entry] : this.data.instances.map((item, at) => at === index ? entry : item);
    this.take({ ...this.data, instances });
  }

  /** The credential is gone while the account is kept (git-host-4,
   * git-host-10): the instance reads signed out until its next sign-in.
   * The default instance's where no origin is named. */
  signOut(origin?: string): void {
    const index = this.indexOf(origin ?? this.defaultInstance().origin);
    if (index < 0 || !this.data.instances[index].account) return;
    this.data = { ...this.data, instances: this.data.instances.map((item, at) => at === index ? { ...item, signedOut: true } : item) };
  }

  /** Forget an instance signed out, or never signed in: its entry goes;
   * one signed in is refused. True where an entry went. */
  forget(origin: string): boolean {
    const index = this.indexOf(origin);
    if (index < 0) return false;
    const entry = this.data.instances[index];
    if (entry.account && entry.signedOut !== true) throw new InstanceRefused("signed-in", entry.origin);
    this.data = { ...this.data, instances: this.data.instances.filter((_, at) => at !== index) };
    return true;
  }

  /** The instance's display name as last read; false where it is not
   * listed. */
  setDisplayName(origin: string, displayName: string | null): boolean {
    const index = this.indexOf(origin);
    if (index < 0) return false;
    const { displayName: _, ...rest } = this.data.instances[index];
    const entry: HomeInstance = displayName === null ? rest : { ...rest, displayName };
    this.data = { ...this.data, instances: this.data.instances.map((item, at) => at === index ? entry : item) };
    return true;
  }

  /** The account at an instance while it is signed in there; the
   * default instance where no origin is named. */
  account(origin?: string): HomeAccount | null {
    const index = this.indexOf(origin ?? this.defaultInstance().origin);
    const entry = index < 0 ? undefined : this.data.instances[index];
    return entry?.account && entry.signedOut !== true ? structuredClone(entry.account) : null;
  }

  /** The canonical origin a caller names, or the refusal of one that is
   * none as a storage diagnostic of this file. */
  private originOf(origin: string): string {
    try { return canonicalOrigin(origin); }
    catch (error) {
      if (!(error instanceof OriginRefused)) throw error;
      throw new StorageFormatError(Home.file(this.root), notAnOrigin(origin));
    }
  }

  /** The listed entry at an origin in any spelling; -1 where none, or
   * where the value is no origin. */
  private indexOf(origin: string): number {
    let canonical: string;
    try { canonical = canonicalOrigin(origin); } catch { return -1; }
    return this.data.instances.findIndex((entry) => entry.origin === canonical);
  }

  /** Validate a whole next file, then take it. */
  private take(next: HomeFile): void {
    parseHomeFile(next, Home.file(this.root));
    this.data = next;
  }

  /** Write `home.yaml` atomically. */
  save(): void {
    parseHomeFile(this.data, Home.file(this.root));
    const text = stringifyYaml(this.data);
    writeApplicationBytes(Home.file(this.root), text);
    this.text = text;
  }
}

/** Your own group's folder name as `home.yaml` records it, in this
 * format or the one before the instances migration; undefined where
 * none stands or it does not read. */
export function recordedOwnName(root: string): string | undefined {
  let value: unknown;
  try { value = parseYaml(readFileSync(Home.file(root), "utf8")); } catch { return undefined; }
  if (!isObject(value) || (value.format !== 1 && value.format !== 2)) return undefined;
  return typeof value.own === "string" && GROUP_NAME.test(value.own) ? value.own : undefined;
}

/** A folder's spex repository name, its last segment. */
export function folderRepositoryName(path: string): string {
  return repositoryNameFor(basename(path));
}

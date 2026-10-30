// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The home (storage-2, DR-103, DR-127): its file — this device, the
// origin it was created with, every instance it has signed in to with
// its account, your own group's folder name — read and changed through
// the library's home file (DR-165), and each working folder paired with
// its spex repository's key — the clone's path under `workspace/` —
// which the app alone records and checks here.

import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { closed, isLocalPath, isObject, isRecordedPath, need, StorageFormatError, writeApplicationBytes } from "@sublang/spex/files";
import {
  accountAt, CLIENT_ID, defaultInstanceOf, defaultOwnName, HOME_FILE, instanceAt, instanceByFolder, instanceOfKey,
  InstanceRefused, invalidHome, isGroupName, kebab, newHomeFile, notAnOrigin, parseHomeFile as parseHomeEntries, parseHomeText,
  withDisplayName, withoutInstance, withSignIn, withSignOut,
  type HomeAccount, type HomeFile, type HomeFolder, type HomeInstance,
} from "@sublang/spex/home-file";
import { hostUrlFor, instanceSegmentOf } from "@sublang/spex/instance";
import { i18n } from "./i18n.js";
import { REPOSITORY_KEY_PATTERN } from "./protocol.js";

export { hostUrlFor };
export {
  CLIENT_ID, defaultOwnName, HOME_FILE, InstanceRefused, invalidHome, isGroupName, kebab, notAnOrigin,
  type HomeAccount, type HomeFile, type HomeFolder, type HomeInstance,
};

export const WORKSPACE = "workspace";
/** The most segments a key the walks of `workspace/` find may hold: the
 * nine a key held before DR-127, and the instance's folder before them. */
export const WORKSPACE_DEPTH = 10;
/** A spex repository's name for a folder or group name: `<name>-spex`. */
export function repositoryNameFor(name: string): string {
  return `${kebab(name) || "project"}-spex`;
}

export function isRepositoryKey(value: unknown): value is string {
  return typeof value === "string" && REPOSITORY_KEY_PATTERN.test(value);
}

/** The instance folder, the group path in that instance and the name
 * of a key: `@spex.sublang.ai`, `acme/platform` and `a-spex` of
 * `@spex.sublang.ai/acme/platform/a-spex`; the instance null for a key outside
 * every instance's folder, as your own group's and the local-only
 * clones' are (DR-127). */
export function splitKey(key: string): { instance: string | null; group: string; name: string } {
  const instance = instanceSegmentOf(key);
  const path = instance === null ? key : key.slice(instance.length + 1);
  const at = path.lastIndexOf("/");
  return at < 0 ? { instance, group: "", name: path } : { instance, group: path.slice(0, at), name: path.slice(at + 1) };
}

/** The Git configuration keys naming each remote's URL. */
export const REMOTE_URL_KEYS = "^remote\\..+\\.url$";

/** The names of the remotes a clone's configuration gives a URL, read
 * from the output of `git config -z --get-regexp` over REMOTE_URL_KEYS.
 * A name may hold dots, as an instance's folder does, so it is what
 * lies between `remote.` and `.url`. */
export function remoteNamesIn(output: string, order: readonly string[] = []): string[] {
  const names: string[] = [];
  for (const entry of output.split("\0")) {
    const key = entry.split("\n", 1)[0];
    if (!key.startsWith("remote.") || !key.endsWith(".url")) continue;
    const name = key.slice("remote.".length, -".url".length);
    if (name !== "" && !names.includes(name)) names.push(name);
  }
  return orderRemotes(names, (name) => name, order);
}

/** The remotes in the order a clone's Git configuration holds them
 * (storage-34): the order of their `[remote "<name>"]` sections in the
 * file, which `git remote add` appends to and a rename keeps — read from
 * the file itself, since Git's own listing of the keys sorts them in
 * some versions. A name Git unescapes as the file wrote it. */
export function remoteSectionOrder(configText: string): string[] {
  const order: string[] = [];
  for (const match of configText.matchAll(/^[ \t]*\[remote[ \t]+"((?:[^"\\]|\\.)*)"[ \t]*\]/gm)) {
    const name = match[1].replace(/\\(.)/g, "$1");
    if (!order.includes(name)) order.push(name);
  }
  return order;
}

/** The order of a clone's remote sections, read from its `.git/config`;
 * none where the file cannot be read, the listing's order standing. */
export function remoteOrderOf(dir: string): string[] {
  try { return remoteSectionOrder(readFileSync(join(dir, ".git", "config"), "utf8")); } catch { return []; }
}

/** Items named by remotes, in the configuration's section order where
 * it names them, the rest after in the order given. */
export function orderRemotes<T>(items: readonly T[], nameOf: (item: T) => string, order: readonly string[]): T[] {
  if (order.length === 0) return [...items];
  const rank = (item: T): number => { const at = order.indexOf(nameOf(item)); return at < 0 ? order.length : at; };
  return [...items].map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(({ item }) => item);
}

/** The pairings `home.yaml` records (storage-6): each a normalized
 * folder path with its recorded aliases and a spex repository's key, no
 * folder and no spex repository paired twice. */
function checkPairs(folders: readonly unknown[], file: string): void {
  const paths = new Set<string>(); const keys = new Set<string>();
  for (const folder of folders) {
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
}

/** `home.yaml`'s value checked whole: the library's checks of its
 * fields and instances, then the pairings. */
export function parseHomeFile(value: unknown, file: string): HomeFile {
  return parseHomeEntries(value, file, checkPairs);
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
    return parseHomeText(text, file, checkPairs);
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
    return new Home(resolve(root), newHomeFile(Home.file(root), options));
  }

  get file(): HomeFile { return structuredClone(this.data); }
  get device(): string { return this.data.device; }
  /** The origin the home was created with. */
  get origin(): string { return this.data.origin; }
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
      if (instance === null && `${group}-spex` === name && isGroupName(group)) this.data = { ...this.data, own: group };
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

  // -- instances (DR-127): the library's entries -----------------------------

  /** Every instance the home has signed in to, the default first. */
  instances(): HomeInstance[] { return structuredClone(this.data.instances); }

  /** The default instance: the first listed, else the origin the home
   * was created with. */
  defaultInstance(): HomeInstance { return defaultInstanceOf(this.data); }

  /** The listed instance at an origin, in any spelling of it. */
  instance(origin: string): HomeInstance | undefined { return instanceAt(this.data, origin); }

  /** The instance whose folder under `workspace/` is `folder`: a listed
   * one, else the origin the home was created with. */
  instanceByFolder(folder: string): HomeInstance | undefined { return instanceByFolder(this.data, folder); }

  /** The instance whose folder a key lies in; none for a key outside
   * every instance's folder. */
  instanceOfKey(key: string): HomeInstance | undefined { return instanceOfKey(this.data, key); }

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
    this.take(withSignIn(this.data, named, account, Home.file(this.root)));
  }

  /** The credential is gone while the account is kept (git-host-4,
   * git-host-10): the instance reads signed out until its next sign-in.
   * The default instance's where no origin is named. */
  signOut(origin?: string): void {
    this.data = withSignOut(this.data, origin);
  }

  /** Forget an instance signed out, or never signed in: its entry goes;
   * one signed in is refused. True where an entry went. */
  forget(origin: string): boolean {
    const next = withoutInstance(this.data, origin);
    if (next === null) return false;
    this.data = next;
    return true;
  }

  /** The instance's display name as last read; false where it is not
   * listed. */
  setDisplayName(origin: string, displayName: string | null): boolean {
    const next = withDisplayName(this.data, origin, displayName);
    if (next === null) return false;
    this.data = next;
    return true;
  }

  /** The account at an instance while it is signed in there; the
   * default instance where no origin is named. */
  account(origin?: string): HomeAccount | null { return accountAt(this.data, origin); }

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
  return typeof value.own === "string" && isGroupName(value.own) ? value.own : undefined;
}

/** A folder's spex repository name, its last segment. */
export function folderRepositoryName(path: string): string {
  return repositoryNameFor(basename(path));
}

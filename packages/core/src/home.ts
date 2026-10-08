// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The home file (storage-2, DR-103): this device, the Git host with
// its account, your own group's spex repository's key, and each working
// folder paired with its spex repository's key — the clone's path under
// `workspace/`.

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
import { KEY_SEGMENT_PATTERN, REPOSITORY_KEY_PATTERN } from "./protocol.js";

export const HOME_FILE = "home.yaml";
export const WORKSPACE = "workspace";
/** The public OAuth client id every Spex uses at the Git host (storage-2). */
export const CLIENT_ID = "spex";

export interface HomeAccount { id: string; login: string; displayName: string | null }
export interface HomeHost { url: string; clientId: typeof CLIENT_ID; account?: HomeAccount; signedOut?: boolean }
export interface HomeFolder { path: string; repository: string; aliases?: string[] }
export interface HomeFile {
  format: 1;
  device: string;
  host: HomeHost;
  own: string;
  folders: HomeFolder[];
}

/** The Git host a new home names: `SPEX_HOST_URL` when set, else spex.pub. */
export function hostUrlFor(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.SPEX_HOST_URL?.trim();
  return url ? url : "https://spex.pub";
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

/** Whether a name may stand as a group folder under `workspace/`: one
 * key segment (storage-1, storage-2). */
export function isGroupName(value: string): boolean {
  return KEY_SEGMENT_PATTERN.test(value);
}

/** A spex repository's name for a folder or group name: `<name>-spex`. */
export function repositoryNameFor(name: string): string {
  return `${kebab(name) || "project"}-spex`;
}

export function isRepositoryKey(value: unknown): value is string {
  return typeof value === "string" && REPOSITORY_KEY_PATTERN.test(value);
}

/** The group path and the name of a key: `acme/platform` and `a-spex`. */
export function splitKey(key: string): { group: string; name: string } {
  const at = key.lastIndexOf("/");
  return at < 0 ? { group: "", name: key } : { group: key.slice(0, at), name: key.slice(at + 1) };
}

const invalidHome = (): string =>
  i18n._({ id: "invalid home file", comment: "Storage diagnostic: home.yaml's own fields are malformed" });

/** Your own group's spex repository's key for a group folder name. */
export function ownKeyFor(name: string): string {
  return `${name}/${name}-spex`;
}

/** Whether a value may stand as `own`: a repository key whose group is
 * one key segment, your own group's folder (storage-2). */
function isOwnKey(value: unknown): value is string {
  return isRepositoryKey(value) && isGroupName(splitKey(value).group);
}

export function parseHomeFile(input: unknown, file: string): HomeFile {
  need(isObject(input), file, invalidHome());
  knownFormat(input, file);
  closed(input, ["format", "device", "host", "own", "folders"], [], file);
  // An earlier file recorded your own group's folder name alone: it
  // reads as that group's spex repository's key, which the next write
  // records (storage-2).
  const value = typeof input.own === "string" && isGroupName(input.own) ? { ...input, own: ownKeyFor(input.own) } : input;
  need(isUuid(value.device) && isOwnKey(value.own) && Array.isArray(value.folders), file, invalidHome());
  closed(value.host, ["url", "clientId"], ["account", "signedOut"], file);
  need(isText(value.host.url) && value.host.clientId === CLIENT_ID &&
    (value.host.signedOut === undefined || typeof value.host.signedOut === "boolean"), file, invalidHome());
  if (value.host.account !== undefined) {
    closed(value.host.account, ["id", "login", "displayName"], [], file);
    const account = value.host.account;
    need(isText(account.id) && isText(account.login) && (account.displayName === null || typeof account.displayName === "string"), file, invalidHome());
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
  private constructor(readonly root: string, private data: HomeFile) {}

  static file(root: string): string { return join(root, HOME_FILE); }
  static exists(root: string): boolean { return existsSync(Home.file(root)); }

  /** Read `home.yaml`; a malformed or unknown one is refused, never guessed. */
  static load(root: string): Home {
    const file = Home.file(root);
    let value: unknown;
    try { value = parseYaml(readFileSync(file, "utf8")); }
    catch (error) { throw new StorageFormatError(file, (error as Error).message); }
    return new Home(resolve(root), parseHomeFile(value, file));
  }

  /** A new home, not yet written: a fresh device id, the host the
   * environment names, and your own group's spex repository named after
   * this device's user name, or the group folder name `own` gives. */
  static create(root: string, options: { own?: string; env?: NodeJS.ProcessEnv } = {}): Home {
    const own = options.own ?? defaultOwnName(options.env);
    return new Home(resolve(root), {
      format: 1,
      device: randomUUID(),
      host: { url: hostUrlFor(options.env), clientId: CLIENT_ID },
      own: ownKeyFor(own),
      folders: [],
    });
  }

  get file(): HomeFile { return structuredClone(this.data); }
  get device(): string { return this.data.device; }
  get host(): HomeHost { return structuredClone(this.data.host); }
  get workspace(): string { return join(this.root, WORKSPACE); }
  /** Your own group's folder name under `workspace/`: the group of its
   * spex repository's key. */
  get ownName(): string { return splitKey(this.data.own).group; }

  /** Your own group's spex repository: the key `home.yaml` records. */
  own(): string { return this.data.own; }

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

  /** Several clones moved in one step (space-59, space-60): every pair
   * naming a moved key names its new one, and `own` its new key where it
   * names a moved clone, unless `own` is given. Validated before it is
   * taken. */
  move(moves: { from: string; to: string }[], own?: string): void {
    this.data = this.checkMove(moves, own);
  }

  /** The home file a move would leave, validated but not taken, so a
   * move it refuses is refused before any clone leaves its folder. */
  checkMove(moves: { from: string; to: string }[], own?: string): HomeFile {
    const to = new Map(moves.map((entry) => [entry.from, entry.to]));
    const next: HomeFile = {
      ...this.data,
      own: own ?? to.get(this.data.own) ?? this.data.own,
      folders: this.data.folders.map((folder) => to.has(folder.repository) ? { ...folder, repository: to.get(folder.repository) as string } : folder),
    };
    return parseHomeFile(next, Home.file(this.root));
  }

  /** The account a sign-in read (storage-2): written, and the home no
   * longer marked signed out. */
  signIn(account: HomeAccount): void {
    const host: HomeHost = { url: this.data.host.url, clientId: CLIENT_ID, account: { id: account.id, login: account.login, displayName: account.displayName } };
    this.data = { ...this.data, host };
  }

  /** The credential is gone while the account is kept (git-host-4,
   * git-host-10): the home reads signed out until the next sign-in. */
  signOut(): void {
    if (!this.data.host.account) return;
    this.data = { ...this.data, host: { ...this.data.host, signedOut: true } };
  }

  /** The account, while the home is signed in. */
  account(): HomeAccount | null {
    const host = this.data.host;
    return host.account && host.signedOut !== true ? structuredClone(host.account) : null;
  }

  /** Write `home.yaml` atomically. */
  save(): void {
    parseHomeFile(this.data, Home.file(this.root));
    writeApplicationBytes(Home.file(this.root), stringifyYaml(this.data));
  }
}

/** A folder's spex repository name, its last segment. */
export function folderRepositoryName(path: string): string {
  return repositoryNameFor(basename(path));
}

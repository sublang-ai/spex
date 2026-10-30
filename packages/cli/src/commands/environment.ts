// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The environment a package command acts on (cli-1, environments-26,
// DR-165): its root is the nearest folder, the current one included,
// holding `spex.yaml`, else the top level of the Git work tree the
// current folder lies in, else the current folder. Its instance is the
// `space` its `spex.yaml` names, else the home's default instance
// (environments-2). The home is `SPEX_HOME` else `~/.spex`, read with
// no folder check; the store and the cache are the ones the app's core
// uses under it, so both hosts share one store (environments-7). No
// clone, lease, session or record of the home is read or written: a
// root inside the home, other than a seat's project under `projects/`,
// is refused, as is the user's home folder, whose agent folders are the
// user-level ones your own group's export writes (environments-8).

import { spawnSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  builtinRegistrySource,
  compositeRegistry,
  ContentStore,
  environmentInstance,
  gitSource,
  installRegistryOrder,
  parseLock,
  parseRequests,
  RegistryClient,
  RegistryError,
  unaskedRegistry,
  type GitSource,
  type Lock,
  type RegistrySource,
  type RegistrySourceLock,
  type Requests,
} from "../lib/environment/index.js";
import { readVersioned, type FileVersion } from "../lib/files.js";
import type { GitHostClient } from "../lib/git-host.js";
import { accountAt, instanceAt, updateHomeFile, withSignOut, type HomeFile, type HomeInstance } from "../lib/home-file.js";
import { canonicalOrigin } from "../lib/instance.js";
import { clientOf, credentialsOf, defaultInstance, homeDir, hostCause, nameOf, readHome } from "./home.js";
import { Refusal } from "./run.js";

/** Where a path is on disk, spelled as the file system spells it: its
 * nearest standing ancestor with every link resolved and every short
 * name made long, and the rest as written. */
export function actualPath(path: string): string {
  const rest: string[] = [];
  for (let current = resolve(path); ; current = dirname(current)) {
    try {
      return join(realpathSync.native(current), ...rest.reverse());
    } catch {
      if (dirname(current) === current) return resolve(path);
      rest.push(basename(current));
    }
  }
}

/** Whether `inner` is `outer` or lies below it. */
function within(outer: string, inner: string): boolean {
  const path = relative(outer, inner);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** Why a folder cannot be an environment's root (cli-1), or null: the
 * user's home folder, a folder inside the Spex home other than a seat's
 * project below `projects/`, and a folder whose `.spex` holds the home. */
export function refusedRoot(dir: string, home: string): string | null {
  const at = actualPath(dir);
  const spexHome = actualPath(home);
  if (at === actualPath(homedir())) return "is your home folder, whose agent folders are your own user-level ones";
  if (within(spexHome, at) && !(within(join(spexHome, "projects"), at) && at !== join(spexHome, "projects"))) {
    return `lies in the Spex home ${home}, whose clones the app keeps`;
  }
  if (within(join(at, ".spex"), spexHome)) return `holds the Spex home ${home} as its .spex`;
  return null;
}

/** The environment root of a command run in `cwd` (cli-1), spelled as
 * `cwd` is, so a path given from `cwd` compares with it as text. A
 * `spex.yaml` in a folder that cannot be a root is passed over; a root
 * that cannot be one refuses the command. */
export function environmentRoot(cwd: string = process.cwd(), home: string = homeDir()): string {
  const start = resolve(cwd);
  let root: string | null = null;
  for (let dir = start; ; dir = dirname(dir)) {
    if (isFile(join(dir, "spex.yaml")) && refusedRoot(dir, home) === null) { root = dir; break; }
    if (dirname(dir) === dir) break;
  }
  root ??= gitTopLevel(start) ?? start;
  const refused = refusedRoot(root, home);
  if (refused !== null) throw new Refusal(`${root} ${refused}: no environment of the command line is there; run spex in a project's folder`);
  return root;
}

/** The top level of `start`'s Git work tree as Git names it, spelled as
 * `start` is where the two are one folder. */
function spelledAs(start: string, top: string): string {
  const real = actualPath(top);
  const path = relative(real, actualPath(start));
  if (path === "" ) return start;
  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) return top;
  const candidate = resolve(start, ...path.split(sep).map(() => ".."));
  return actualPath(candidate) === real ? candidate : top;
}

function isFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

/** The top level of the Git work tree `cwd` lies in; none where Git is
 * absent or `cwd` lies in no work tree. */
function gitTopLevel(cwd: string): string | null {
  let result;
  try {
    result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
  const top = result.status === 0 ? result.stdout.trim() : "";
  return top === "" ? null : spelledAs(cwd, resolve(top));
}

/** A file of the environment as read, with the version it was read at. */
export interface ReadRequests { requests: Requests; text: string; version: FileVersion }
export interface ReadLock { lock: Lock; text: string; version: FileVersion }

/** A path under the root as a reader sees it, `/`-separated. */
export function shown(root: string, path: string): string {
  const inside = relative(root, path);
  return inside === "" ? "." : inside.split(sep).join("/");
}

export class Environment {
  readonly root: string;
  readonly homeDir: string;
  /** `home.yaml` as it stood when the command began; null where none. */
  readonly home: HomeFile | null;
  readonly requestsFile: string;
  readonly lockFile: string;
  readonly store: ContentStore;
  readonly cache: string;
  readonly git: GitSource;
  private readonly registries = new Map<string, RegistrySource>();
  private readonly clients = new Map<string, GitHostClient>();
  private builtin?: RegistrySource;

  constructor(cwd: string = process.cwd()) {
    this.homeDir = homeDir();
    this.root = environmentRoot(cwd, this.homeDir);
    this.home = readHome(this.homeDir);
    this.requestsFile = join(this.root, "spex.yaml");
    this.lockFile = join(this.root, "spex.lock");
    this.store = new ContentStore(this.homeDir);
    this.cache = join(this.homeDir, "cache");
    this.git = gitSource(this.cache);
  }

  /** `spex.yaml` as it stands, null where absent; one that does not read
   * refuses the command in the library's words (environments-2). */
  readRequests(): ReadRequests | null {
    const { bytes, version } = readVersioned(this.requestsFile);
    if (bytes === null) return null;
    const text = bytes.toString("utf8");
    try {
      return { requests: parseRequests(text), text, version };
    } catch (error) {
      throw new Refusal(`${this.requestsFile}: ${(error as Error).message}`);
    }
  }

  /** `spex.lock` as it stands, null where absent; one that does not read
   * refuses the command in the library's words (environments-3). */
  readLock(): ReadLock | null {
    const { bytes, version } = readVersioned(this.lockFile);
    if (bytes === null) return null;
    const text = bytes.toString("utf8");
    try {
      return { lock: parseLock(text), text, version };
    } catch (error) {
      throw new Refusal(`${this.lockFile}: ${(error as Error).message}; spex update resolves it again`);
    }
  }

  /** The home's default instance (storage-2). */
  defaultOrigin(): string {
    return canonicalOrigin(defaultInstance(this.home).origin);
  }

  /** The environment's instance (environments-2): the `space` the
   * requests name, else the home's default instance. */
  instanceOf(requests: Pick<Requests, "space"> | null): string {
    return environmentInstance(requests, { origin: defaultInstance(this.home).origin, instances: this.home?.instances ?? [] });
  }

  /** An instance as the reader knows it: its display name where the home
   * holds one, else its host. */
  nameOf(origin: string): string {
    const entry: HomeInstance = (this.home && instanceAt(this.home, origin)) ?? { origin, clientId: "spex" };
    return nameOf(entry);
  }

  /** Whether the device is signed in at an instance: the home lists it
   * with its account, not signed out. */
  signedInAt(origin: string): boolean {
    return this.home !== null && accountAt(this.home, origin) !== null;
  }

  /** Every instance the home is signed in to, in its order. */
  signedIn(): string[] {
    return (this.home?.instances ?? []).filter((entry) => this.signedInAt(entry.origin)).map((entry) => entry.origin);
  }

  /** The app token a registry call presents at an instance
   * (environments-12): its access secret, kept current by its client,
   * where the device is signed in there; none otherwise. */
  async tokenAt(origin: string): Promise<string | null> {
    if (!this.signedInAt(origin)) return null;
    try {
      return await this.clientAt(origin).accessSecret();
    } catch (error) {
      throw new Error(hostCause(error, this.nameOf(origin)));
    }
  }

  /** An instance's client, one per command: a refresh the instance
   * refuses removes its token and marks it signed out in `home.yaml` in
   * one step, as the app's sign-out does (git-host-4). */
  private clientAt(origin: string): GitHostClient {
    const at = canonicalOrigin(origin);
    let client = this.clients.get(at);
    if (!client) {
      client = clientOf(at, credentialsOf(this.homeDir, at), () => this.markSignedOut(at));
      this.clients.set(at, client);
    }
    return client;
  }

  private markSignedOut(origin: string): void {
    try { updateHomeFile(this.homeDir, (current) => withSignOut(current, origin)); } catch { /* the token is gone; whoami may still list it */ }
  }

  /** The built-in spec package as this device's seed holds it
   * (environments-7, environments-11): what the app seeded into the
   * shared store, read from `cache/builtins/`; the command line ships
   * none of its own. */
  seed(): RegistrySource {
    this.builtin ??= builtinRegistrySource({ store: this.store, cacheDir: this.cache });
    return this.builtin;
  }

  /** The registry answering under an instance's origin, presenting its
   * app token where the device is signed in there; a refusal that signs
   * the device out there marks it signed out in `home.yaml`
   * (environments-12, git-host-4). The built-in spec package is answered
   * from this device's seed first, as the app answers it. */
  registryAt(origin: string): RegistrySource {
    const at = canonicalOrigin(origin);
    let registry = this.registries.get(at);
    if (!registry) {
      const remote = new RegistryClient({
        url: at,
        token: () => this.tokenAt(at),
        refused: async (token) => {
          if (!(await this.clientAt(at).signOutRefused(token))) throw new Error(`the sign-in at ${this.nameOf(at)} changed meanwhile; retry`);
          this.markSignedOut(at);
        },
      });
      registry = compositeRegistry(this.seed(), remote);
      this.registries.set(at, registry);
    }
    return registry;
  }

  /** The registries an install asks for a registry package's files, in
   * the library's order (environments-7). */
  installRegistries(instance: string, source: RegistrySourceLock): RegistrySource[] {
    return installRegistryOrder(instance, source.registry, this.signedIn())
      .map((entry) => ("origin" in entry ? this.registryAt(entry.origin) : compositeRegistry(this.seed(), unaskedRegistry(entry.unasked))));
  }
}

/** A registry's answer in the CLI's words: the library's, and what to do
 * where a sign-in is wanted. */
export function registryCause(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof RegistryError && error.kind === "unauthenticated") return `${message}; spex login signs in`;
  return message;
}

/** Whether a folder stands at a path. */
export function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

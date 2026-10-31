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
  environmentRegistry,
  type EnvironmentRegistry,
  gitSource,
  installRegistryOrder,
  LockError,
  parseLock,
  parseRequests,
  RegistryClient,
  RegistryError,
  RequestsError,
  unaskedRegistry,
  type GitSource,
  type Lock,
  type RegistrySource,
  type RegistrySourceLock,
  type Requests,
} from "../lib/environment/index.js";
import { readVersioned, type FileVersion } from "../lib/files.js";
import type { AuthScope, GitHostClient } from "../lib/git-host.js";
import { accountAt, instanceAt, updateHomeFile, withSignOut, type HomeFile, type HomeInstance } from "../lib/home-file.js";
import { canonicalOrigin } from "../lib/instance.js";
import { clientOf, credentialsOf, defaultInstance, homeDir, hostCause, nameOf, readHome, registryName } from "./home.js";
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
  if (at === actualPath(homedir())) return "is your home folder, whose agent folders are your own";
  if (within(spexHome, at) && !(within(join(spexHome, "projects"), at) && at !== join(spexHome, "projects"))) {
    return `lies in the Spex home ${home}, which the app keeps`;
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
  if (refused !== null) throw new Refusal(`${root} ${refused} — run spex in a project folder`);
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
   * refuses the command saying why and what to do (environments-2,
   * cli-13). */
  readRequests(): ReadRequests | null {
    const { bytes, version } = readVersioned(this.requestsFile);
    if (bytes === null) return null;
    const text = bytes.toString("utf8");
    try {
      return { requests: parseRequests(text), text, version };
    } catch (error) {
      if (error instanceof RequestsError && error.newerFormat !== undefined) throw new Refusal("spex.yaml is from a newer Spex — update Spex");
      throw new Refusal(`${(error as Error).message} — fix the file, then retry`);
    }
  }

  /** `spex.lock` as it stands, null where absent; one from a newer Spex,
   * or one that does not read, refuses the command saying what to do
   * (environments-3, cli-13). */
  readLock(): ReadLock | null {
    const read = this.readLockForUpdate();
    if (read !== null && read.lock === null) throw new Refusal(`${read.cause} — spex update rewrites it`);
    return read as ReadLock | null;
  }

  /** `spex.lock` as `spex update` reads it: one that does not read stands
   * with its version and no lock, for the update to rewrite under that
   * version; one from a newer Spex still refuses the command, as this
   * Spex would lose what it records. */
  readLockForUpdate(): (Omit<ReadLock, "lock"> & { lock: Lock | null; cause?: string }) | null {
    const { bytes, version } = readVersioned(this.lockFile);
    if (bytes === null) return null;
    const text = bytes.toString("utf8");
    try {
      return { lock: parseLock(text), text, version };
    } catch (error) {
      if (error instanceof LockError && error.newerFormat !== undefined) throw new Refusal("spex.lock is from a newer Spex — update Spex");
      return { lock: null, text, version, cause: (error as Error).message };
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

  registryOf(requests: Pick<Requests, "space" | "registry"> | null): EnvironmentRegistry {
    return environmentRegistry(requests, { origin: defaultInstance(this.home).origin, instances: this.home?.instances ?? [] });
  }

  /** A registry as the reader knows it (cli-22): its descriptor's
   * display name, else its host; never a Space entry's name. */
  registryName(origin: string): Promise<string> {
    return registryName(this.homeDir, origin);
  }

  /** The login a registry call presents at an origin, for a refusal to
   * name (cli-13): null where this computer holds no sign-in for that
   * purpose there; undefined where it holds one whose login cannot be
   * read now. A Space's login is its home entry's; a registry's is read
   * from its account API. */
  async loginAt(origin: string, scope: AuthScope): Promise<string | null | undefined> {
    if (scope === "space") return this.home ? accountAt(this.home, origin)?.login ?? null : null;
    const credentials = credentialsOf(this.homeDir, origin, scope);
    try { if (!(await credentials.read())) return null; } catch { return undefined; }
    try {
      return (await clientOf(origin, credentials, undefined, scope).me()).login;
    } catch {
      try { return (await credentials.read()) ? undefined : null; } catch { return undefined; }
    }
  }

  /** A registry's refusal or failure as one phrase ending in what to do
   * (cli-13): the registry named as cli-22 names it, a private package by
   * the sign-in state, a 403 by the operation refused. */
  async registryRefusal(error: unknown, context: { origin: string; scope: AuthScope; operation?: "read" | "publish"; version?: string }): Promise<Refusal> {
    if (error instanceof Refusal) return error;
    if (!(error instanceof RegistryError)) return new Refusal(error instanceof Error ? error.message : String(error));
    let origin = context.origin;
    try { if (error.registry !== undefined) origin = canonicalOrigin(error.registry); } catch { /* the registry asked */ }
    const name = await this.registryName(origin);
    const pkg = error.packageName;
    // `spex login` here signs in at this folder's registry for packages
    // (cli-10); another registry, or a Space's sign-in, is named.
    const login = context.scope === "space" ? `spex login --space ${origin}` : origin === context.origin ? "spex login" : `spex login --registry ${origin}`;
    const about = pkg ? `${pkg}: ` : "";
    switch (error.kind) {
      case "not_found": {
        if (error.code === "suppressed") return new Refusal(`${about}withdrawn at ${name} — spex update picks another version`);
        const who = await this.loginAt(origin, context.scope);
        if (who === null) return new Refusal(`${about}not at ${name}, or private — ${login}, then retry`);
        return new Refusal(`${about}not at ${name}, or not shared with ${who === undefined ? "this account" : `@${who}`} — check the name, or ask its owner`);
      }
      case "forbidden": {
        if (context.operation === "publish") {
          const org = pkg?.split("/")[0] ?? "this org";
          return new Refusal(`${org} is not yours at ${name} — claim it at ${origin}/account/orgs`);
        }
        const who = await this.loginAt(origin, context.scope);
        return new Refusal(`${about}not shared with ${typeof who === "string" ? `@${who}` : "this account"} at ${name} — ask its owner`);
      }
      case "unauthenticated":
        return new Refusal(`sign-in expired at ${name} — ${login}`);
      case "unavailable":
        if (error.code === "unreachable") return new Refusal(`${name} could not be reached — check the connection, then retry`);
        if (error.status !== undefined && error.status >= 500) return new Refusal(`${name} is down (${error.status}) — retry later`);
        if (error.status !== undefined) return new Refusal(`${name} answered ${error.status} — retry later`);
        return new Refusal(error.message);
      case "rejected": {
        const release = pkg && context.version ? `${pkg}@${context.version}` : pkg ?? "the package";
        if (error.status === 409) return new Refusal(`${release} is already at ${name} — raise the version in meta.yaml, then retry`);
        if (error.status === 413) return new Refusal(`${release} is too large for ${name}`);
        const details = (error.details ?? []).map((detail) => typeof detail === "object" && detail !== null && "message" in detail ? String((detail as { message: unknown }).message) : JSON.stringify(detail));
        return new Refusal(`${name} refused ${release}${details.length > 0 ? `: ${details.join("; ")}` : ""} — fix the package, then retry`);
      }
      case "format":
        return new Refusal(`${error.message} — update Spex`);
      case "unreadable":
        return new Refusal(`${error.message} — retry later, or update Spex`);
    }
  }

  /** A Space as the reader knows it: its display name where the home
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
  async tokenAt(origin: string, scope: AuthScope = "space"): Promise<string | null> {
    if (scope === "space" ? !this.signedInAt(origin) : !(await credentialsOf(this.homeDir, origin, scope).read())) return null;
    try {
      return await this.clientAt(origin, scope).accessSecret();
    } catch (error) {
      throw new Error(hostCause(error, await this.registryName(origin)));
    }
  }

  /** An instance's client, one per command: a refresh the instance
   * refuses removes its token and marks it signed out in `home.yaml` in
   * one step, as the app's sign-out does (git-host-4). */
  private clientAt(origin: string, scope: AuthScope = "space"): GitHostClient {
    const at = canonicalOrigin(origin);
    const key = `${scope}:${at}`;
    let client = this.clients.get(key);
    if (!client) {
      client = clientOf(at, credentialsOf(this.homeDir, at, scope), scope === "space" ? () => this.markSignedOut(at) : undefined, scope);
      this.clients.set(key, client);
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
  registryAt(origin: string, scope: AuthScope = "space"): RegistrySource {
    const at = canonicalOrigin(origin);
    const key = `${scope}:${at}`;
    let registry = this.registries.get(key);
    if (!registry) {
      const remote = new RegistryClient({
        url: at,
        token: () => this.tokenAt(at, scope),
        refused: async (token) => {
          if (!(await this.clientAt(at, scope).signOutRefused(token))) throw new Error(`your sign-in at ${await this.registryName(at)} changed meanwhile — retry`);
          if (scope === "space") this.markSignedOut(at);
        },
      });
      registry = compositeRegistry(this.seed(), remote);
      this.registries.set(key, registry);
    }
    return registry;
  }

  /** The registries an install asks for a registry package's files, in
   * the library's order (environments-7). */
  installRegistries(instance: string, source: RegistrySourceLock, scope: AuthScope = "space"): RegistrySource[] {
    return installRegistryOrder(instance, source.registry, this.signedIn(), { independent: scope === "registry" })
      .map((entry) => ("origin" in entry ? this.registryAt(entry.origin, scope) : compositeRegistry(this.seed(), unaskedRegistry(entry.unasked))));
  }
}

/** Whether a folder stands at a path. */
export function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

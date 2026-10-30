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
// clone, lease, session or record of the home is read or written.

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
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
import { accountAt, instanceAt, updateHomeFile, withSignOut, type HomeFile, type HomeInstance } from "../lib/home-file.js";
import { canonicalOrigin } from "../lib/instance.js";
import { clientOf, credentialsOf, defaultInstance, homeDir, hostCause, nameOf, readHome } from "./home.js";
import { Refusal } from "./run.js";

/** The environment root of a command run in `cwd` (cli-1). */
export function environmentRoot(cwd: string = process.cwd()): string {
  const start = resolve(cwd);
  for (let dir = start; ; dir = dirname(dir)) {
    if (isFile(join(dir, "spex.yaml"))) return dir;
    if (dirname(dir) === dir) break;
  }
  return gitTopLevel(start) ?? start;
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
  return top === "" ? null : resolve(top);
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
  private readonly registries = new Map<string, RegistryClient>();

  constructor(cwd: string = process.cwd()) {
    this.root = environmentRoot(cwd);
    this.homeDir = homeDir();
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
      return await clientOf(origin, credentialsOf(this.homeDir, origin)).accessSecret();
    } catch (error) {
      throw new Error(hostCause(error, this.nameOf(origin)));
    }
  }

  /** The registry answering under an instance's origin, presenting its
   * app token where the device is signed in there; a refusal that signs
   * the device out there marks it signed out in `home.yaml`
   * (environments-12, git-host-4). No built-in spec package is composed
   * in: the command line ships none. */
  registryAt(origin: string): RegistryClient {
    const at = canonicalOrigin(origin);
    let registry = this.registries.get(at);
    if (!registry) {
      registry = new RegistryClient({
        url: at,
        token: () => this.tokenAt(at),
        refused: async (token) => {
          const client = clientOf(at, credentialsOf(this.homeDir, at));
          if (!(await client.signOutRefused(token))) throw new Error(`the sign-in at ${this.nameOf(at)} changed meanwhile; retry`);
          try { updateHomeFile(this.homeDir, (current) => withSignOut(current, at)); } catch { /* the token is gone; whoami may still list it */ }
        },
      });
      this.registries.set(at, registry);
    }
    return registry;
  }

  /** The registries an install asks for a registry package's files, in
   * the library's order (environments-7). */
  installRegistries(instance: string, source: RegistrySourceLock): RegistrySource[] {
    return installRegistryOrder(instance, source.registry, this.signedIn())
      .map((entry) => ("origin" in entry ? this.registryAt(entry.origin) : unaskedRegistry(entry.unasked)));
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

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The home the package commands act on (cli-1, storage-1, storage-2):
// `SPEX_HOME` where set, else `~/.spex`. The CLI reads `home.yaml` with
// the library, checking no pairing — the app checks its own — and
// writes it only where a command records something; it never reads or
// writes `workspace/`, a clone, the lease, a session or a record.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { RegistryClient } from "../lib/environment/registry.js";
import { writeApplicationBytes } from "../lib/files.js";
import { fileCredentialStore, GitHostClient, HostError, retryAfterSeconds, type CredentialStore, type AuthScope } from "../lib/git-host.js";
import { defaultInstanceOf, homeFilePath, instanceAt, readHomeFile, type HomeFile, type HomeInstance } from "../lib/home-file.js";
import { canonicalOrigin, hostUrlFor, instanceFolder, OriginRefused, parseOrigin, type OriginRefusal } from "../lib/instance.js";
import { Refusal } from "./run.js";

/** The home's folder: a nonempty `SPEX_HOME`, else `~/.spex`. */
export function homeDir(env: NodeJS.ProcessEnv = process.env): string {
  const named = env.SPEX_HOME?.trim();
  return named ? resolve(named) : join(homedir(), ".spex");
}

/** `home.yaml` as it stands, null where none stands; one that will not
 * read refuses the command naming the file and the library's reason. */
export function readHome(dir: string): HomeFile | null {
  try {
    return readHomeFile(dir);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const file = homeFilePath(dir);
    // A layout this Spex does not read is a newer Spex's: update Spex.
    const next = /unsupported format/.test(reason) ? "update Spex" : "fix the file, then retry";
    throw new Refusal(`${reason.startsWith(file) ? `${file} does not read${reason.slice(file.length)}` : `${file} does not read: ${reason}`} — ${next}`);
  }
}

/** Why the origin rule refuses an address, in the reader's words. */
const ADDRESS_RULES: Record<OriginRefusal, string> = {
  invalid: "it is not a URL",
  scheme: "it is neither http nor https",
  user: "it carries a user or a password",
  path: "it names a path",
  query: "it carries a query",
  fragment: "it carries a fragment",
  host: "its host is not a plain domain name",
  port: "its port is not from 1 to 65535",
  insecure: "http works only on this computer",
};

/** An address as a reader is shown it: any user info it carries, which
 * may hold a secret, stands as `…`. */
export function shownAddress(value: string): string {
  return value.trim().replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#]*@/i, "$1…@");
}

/** An address the origin rule refuses, for `flag`, as one phrase ending
 * in what to do (cli-13). */
export function addressRefusal(flag: string, value: string, error: OriginRefused, example = "https://spex.sublang.ai"): Refusal {
  return new Refusal(`${flag} ${shownAddress(value)}: ${ADDRESS_RULES[error.reason]} — enter just the address, like ${example}`);
}

/** The canonical origin `--space` names; one the origin rule refuses
 * is refused saying why. */
export function spaceOption(value: string): string {
  try {
    return canonicalOrigin(value);
  } catch (error) {
    if (!(error instanceof OriginRefused)) throw error;
    throw addressRefusal("--space", value, error);
  }
}

/** The home's default instance (storage-2): the first listed, else the
 * origin it was created with; for a home not yet made, the origin a new
 * one would record. */
export function defaultInstance(home: HomeFile | null, env: NodeJS.ProcessEnv = process.env): HomeInstance {
  if (home) return defaultInstanceOf(home);
  let origin: string;
  try {
    origin = hostUrlFor(env);
  } catch (error) {
    if (!(error instanceof OriginRefused)) throw error;
    throw addressRefusal("SPEX_HOST_URL", env.SPEX_HOST_URL?.trim() ?? "", error);
  }
  return { origin, clientId: "spex" };
}

/** The instance a command names: `--space`, else the default. */
export function namedInstance(home: HomeFile | null, space: string | undefined, env: NodeJS.ProcessEnv = process.env): HomeInstance {
  if (space === undefined) return defaultInstance(home, env);
  const origin = spaceOption(space);
  return (home && instanceAt(home, origin)) ?? { origin, clientId: "spex" };
}

/** Whether a home lists an instance at all. */
export function listed(home: HomeFile | null, origin: string): boolean {
  return home !== null && instanceAt(home, origin) !== undefined;
}

/** Whether an entry reads signed in: an account, not marked signed out. */
export function signedIn(entry: HomeInstance | undefined): boolean {
  return entry?.account !== undefined && entry.signedOut !== true;
}

/** An origin's host, with its port where it is not the scheme's default. */
export function hostOf(origin: string): string {
  const { host, port } = parseOrigin(origin);
  return port === null ? host : `${host}:${port}`;
}

/** An instance as the reader knows it: its display name where the home
 * holds one, else its host. */
export function nameOf(instance: HomeInstance): string {
  return instance.displayName ?? hostOf(instance.origin);
}

/** The credential store of one instance under the home (storage-19). */
export function credentialsOf(dir: string, origin: string, scope: AuthScope = "space"): CredentialStore {
  return fileCredentialStore(dir, origin, scope);
}

/** The client of one instance, signing in as this device (git-host-3). */
export function clientOf(origin: string, credentials: CredentialStore, onSignedOut?: () => void, scope: AuthScope = "space"): GitHostClient {
  let device = "this device";
  try { device = hostname() || device; } catch { /* the label's fallback */ }
  return new GitHostClient({ url: origin, scope, label: `spex on ${device}`, credentials, ...(onSignedOut ? { onSignedOut } : {}) });
}

/** A host's answer in the CLI's words (git-host-11, cli-13): what the
 * Space or registry said where it said something, and what to do,
 * never a secret. */
export function hostCause(error: unknown, name: string): string {
  if (!(error instanceof HostError)) return error instanceof Error ? error.message : String(error);
  switch (error.kind) {
    case "unreachable": return `${name} could not be reached — check the connection, then retry`;
    case "rate_limited": {
      const seconds = retryAfterSeconds(error.retryAfter);
      return `${name} asked to wait${seconds === null ? "" : ` ${seconds} seconds`} — retry then`;
    }
    case "reauth": return `sign-in expired at ${name} — spex login`;
    case "host_refused": return `${name} refused: ${error.words ?? error.code ?? "no reason given"}`;
    default: return `${name} answered ${error.code ?? error.kind}${error.words ? `: ${error.words}` : ""}`;
  }
}

// -- a registry's name (cli-22) -----------------------------------------------

/** How long a registry's display name read from its descriptor stands
 * before a command naming it reads the descriptor again. */
const REGISTRY_NAME_TTL_MS = 24 * 60 * 60_000;

/** Where the home keeps a registry's descriptor as fetched metadata,
 * under `cache/`, which may be deleted at any time (environments-7). */
function registryNameFile(dir: string, origin: string): string {
  return join(dir, "cache", "registries", `${instanceFolder(origin)}.json`);
}

/** The display name cached for a registry, with when it was read; null
 * where none is, or it does not read. */
function cachedRegistryName(dir: string, origin: string): { displayName: string; readAt: number } | null {
  try {
    const value = JSON.parse(readFileSync(registryNameFile(dir, origin), "utf8")) as { origin?: unknown; displayName?: unknown; readAt?: unknown };
    if (value.origin !== origin || typeof value.displayName !== "string" || value.displayName.trim() === "" || typeof value.readAt !== "number") return null;
    return { displayName: value.displayName, readAt: value.readAt };
  } catch {
    return null;
  }
}

/** Cache a registry's display name as its descriptor gave it. A cache
 * never makes the home: where it is missing, nothing is written unless
 * `create`; a write that fails leaves the name uncached. */
export function cacheRegistryName(dir: string, origin: string, displayName: string, create = false): void {
  if (!create && !existsSync(dir)) return;
  try {
    const file = registryNameFile(dir, origin);
    mkdirSync(dirname(file), { recursive: true });
    writeApplicationBytes(file, JSON.stringify({ origin, displayName, readAt: Date.now() }));
  } catch { /* the name stays uncached */ }
}

/** The display name a registry's public descriptor gives
 * (environments-39), read with no credential; null where it does not
 * answer in time or names none. */
export async function describedRegistryName(origin: string): Promise<string | null> {
  try {
    const name = (await new RegistryClient({ url: origin }).describe()).displayName.trim();
    return name === "" ? null : name;
  } catch {
    return null;
  }
}

/** A registry as the reader knows it (cli-22): the display name its
 * descriptor gives — read at login and kept in the home's cache, read
 * again where none is cached or the cached one is a day old — else its
 * origin's host; never the name of a Space entry at its origin. */
export async function registryName(dir: string, origin: string): Promise<string> {
  let at: string;
  try { at = canonicalOrigin(origin); } catch { return origin; }
  const cached = cachedRegistryName(dir, at);
  if (cached && Date.now() - cached.readAt < REGISTRY_NAME_TTL_MS) return cached.displayName;
  const described = await describedRegistryName(at);
  if (described !== null) {
    cacheRegistryName(dir, at, described);
    return described;
  }
  return cached?.displayName ?? hostOf(at);
}

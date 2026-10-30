// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The home the package commands act on (cli-1, storage-1, storage-2):
// `SPEX_HOME` where set, else `~/.spex`. The CLI reads `home.yaml` with
// the library, checking no pairing — the app checks its own — and
// writes it only where a command records something; it never reads or
// writes `workspace/`, a clone, the lease, a session or a record.

import { hostname, homedir } from "node:os";
import { join, resolve } from "node:path";

import { fileCredentialStore, GitHostClient, HostError, retryAfterSeconds, type CredentialStore } from "../lib/git-host.js";
import { defaultInstanceOf, homeFilePath, instanceAt, notAnOrigin, readHomeFile, type HomeFile, type HomeInstance } from "../lib/home-file.js";
import { canonicalOrigin, hostUrlFor, OriginRefused, parseOrigin } from "../lib/instance.js";
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
    throw new Refusal(reason.startsWith(file) ? `cannot read ${reason}` : `cannot read ${file}: ${reason}`);
  }
}

/** The canonical origin `--space` names; one the origin rule refuses
 * is refused with the library's reason. */
export function spaceOption(value: string): string {
  try {
    return canonicalOrigin(value);
  } catch (error) {
    if (!(error instanceof OriginRefused)) throw error;
    throw new Refusal(`--space: ${notAnOrigin(value)}: ${error.message}`);
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
    throw new Refusal(`SPEX_HOST_URL: ${notAnOrigin(env.SPEX_HOST_URL?.trim() ?? "")}: ${error.message}`);
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
export function credentialsOf(dir: string, origin: string): CredentialStore {
  return fileCredentialStore(dir, origin);
}

/** The client of one instance, signing in as this device (git-host-3). */
export function clientOf(origin: string, credentials: CredentialStore): GitHostClient {
  let device = "this device";
  try { device = hostname() || device; } catch { /* the label's fallback */ }
  return new GitHostClient({ url: origin, label: `spex on ${device}`, credentials });
}

/** A host's answer in the CLI's words (git-host-11): what the instance
 * said where it said something, never a secret. */
export function hostCause(error: unknown, name: string): string {
  if (!(error instanceof HostError)) return error instanceof Error ? error.message : String(error);
  switch (error.kind) {
    case "unreachable": return `${name} could not be reached${error.words ? `: ${error.words}` : ""}`;
    case "rate_limited": {
      const seconds = retryAfterSeconds(error.retryAfter);
      return `${name} asked to wait${seconds === null ? "" : ` ${seconds} seconds`} before another request`;
    }
    case "host_refused": return `${name} refused: ${error.words ?? error.code ?? "no reason given"}`;
    default: return `${name} answered ${error.code ?? error.kind}${error.words ? `: ${error.words}` : ""}`;
  }
}

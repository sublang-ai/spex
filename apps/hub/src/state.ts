// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The hub's own state (hub-1, hub-8): one owner-only directory holding
// `state.yaml` — the instance, the server's id, name, address and
// token, and the TLS pair's paths — and `leases.yaml` — each seat's
// lease as `{<person id>: {login, expires_at, bearer_hash, stop_owed}}`,
// `stop_owed` present from a lease's admission until a stop succeeds
// after its end. Both are written in
// YAML's JSON-compatible flow form, so any YAML reader reads them and
// the hub needs no YAML library; every write replaces the file whole
// through a rename, so a crash leaves the old file or the new.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const DEFAULT_STATE_DIR = "/var/lib/spex-hub";

export interface HubState {
  /** The instance's origin, e.g. `https://spex.pub`. */
  instance: string;
  server_id: string;
  /** The server's name as the instance last answered it; null until
   * the first admission. */
  name: string | null;
  /** The https origin the hub serves, e.g. `https://hub.example.com`. */
  address: string;
  /** The server token; null once `retire` forgot it. */
  token: string | null;
  /** Absolute paths of the TLS certificate and key the hub serves. */
  tls_cert: string;
  tls_key: string;
}

export interface Lease {
  login: string;
  /** The instance's expiry, as it answered it; a lease ended early
   * carries the time it ended. */
  expires_at: string;
  /** SHA-256 (hex) of the bearer the last admission issued; null when
   * the lease ended or no bearer was issued. */
  bearer_hash: string | null;
  /** True from a lease's admission until the helper's stop succeeds
   * after its end (hub-5, hub-8); absent otherwise. */
  stop_owed?: true;
}

export type Leases = Record<string, Lease>;

/** A person's permanent account id at the instance, as the helper
 * admits it (hub-4). */
export const PERSON_ID = /^[0-9]{1,20}$/;

export function statePath(dir: string): string {
  return join(dir, "state.yaml");
}

export function leasesPath(dir: string): string {
  return join(dir, "leases.yaml");
}

export function controlPath(dir: string): string {
  return join(dir, "control.sock");
}

/** Make the state directory owner-only, whoever made it. */
export function ensureStateDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

function writePrivate(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  try {
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`cannot read ${file}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not the hub's own state; attach again`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function readState(dir: string): HubState | undefined {
  const file = statePath(dir);
  const value = readJson(file);
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    typeof value.instance !== "string" ||
    typeof value.server_id !== "string" ||
    !stringOrNull(value.name) ||
    typeof value.address !== "string" ||
    !stringOrNull(value.token) ||
    typeof value.tls_cert !== "string" ||
    typeof value.tls_key !== "string"
  ) {
    throw new Error(`${file} is not the hub's own state; attach again`);
  }
  return {
    instance: value.instance,
    server_id: value.server_id,
    name: value.name,
    address: value.address,
    token: value.token,
    tls_cert: value.tls_cert,
    tls_key: value.tls_key,
  };
}

export function writeState(dir: string, state: HubState): void {
  ensureStateDir(dir);
  writePrivate(statePath(dir), {
    instance: state.instance,
    server_id: state.server_id,
    name: state.name,
    address: state.address,
    token: state.token,
    tls_cert: state.tls_cert,
    tls_key: state.tls_key,
  });
}

export function readLeases(dir: string): Leases {
  const file = leasesPath(dir);
  const value = readJson(file);
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${file} is not the hub's lease table`);
  const leases: Leases = {};
  for (const [id, entry] of Object.entries(value)) {
    if (
      !PERSON_ID.test(id) ||
      !isRecord(entry) ||
      typeof entry.login !== "string" ||
      typeof entry.expires_at !== "string" ||
      !Number.isFinite(Date.parse(entry.expires_at)) ||
      !stringOrNull(entry.bearer_hash) ||
      (entry.stop_owed !== undefined && typeof entry.stop_owed !== "boolean")
    ) {
      throw new Error(`${file} holds a malformed lease for ${JSON.stringify(id)}`);
    }
    leases[id] = {
      login: entry.login,
      expires_at: entry.expires_at,
      bearer_hash: entry.bearer_hash,
      ...(entry.stop_owed === true ? { stop_owed: true } : {}),
    };
  }
  return leases;
}

export function writeLeases(dir: string, leases: Leases): void {
  ensureStateDir(dir);
  writePrivate(leasesPath(dir), leases);
}

/** Whether a lease still holds at `now`. */
export function leaseActive(lease: Lease, now = Date.now()): boolean {
  return Date.parse(lease.expires_at) > now;
}

/** A secret of 32 random bytes in unpadded base64url (43 characters):
 * a bearer or a seat's handshake token. */
export function mintSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Compare a presented bearer with a stored hash in constant time. */
export function bearerMatches(bearer: string, hash: string): boolean {
  const presented = Buffer.from(sha256(bearer), "hex");
  const stored = Buffer.from(hash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

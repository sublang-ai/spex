// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The instances migration (DR-127): a home whose `home.yaml` names one
// Git host, in format 1, becomes a home recording every instance by its
// origin, in format 2. It runs once under the root lease before any
// writer is admitted, as the groups migration does, leaving a receipt
// under `local/migrations/`; each step is verified, and a restart
// finishes what remains without overwriting a destination that diverged.
// Nothing at any instance changes, so each device migrates on its own.

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  closed, isObject, isText, need, readJsonFile, sha256, StorageFormatError, writeApplicationBytes, writeApplicationFile,
} from "./files.js";
import { CLIENT_ID, Home, HOME_FILE, invalidHome, notAnOrigin, parseHomeFile, type HomeAccount, type HomeFile } from "./home.js";
import { i18n } from "./i18n.js";
import { canonicalOrigin, OriginRefused } from "./instance.js";

export interface InstancesReceipt {
  format: 1;
  id: string;
  kind: "instances";
  /** Each input as it stood when the migration began: its digest, and
   * whether its bytes are kept under the receipt — a credential's never
   * are. */
  inputs: { path: string; sha256: string; kept: boolean }[];
  steps: Record<string, unknown>[];
  /** Clones whose move a session lease naming a live writer refused, by
   * the key they keep and the key they move to. */
  deferred: { from: string; to: string }[];
  complete: boolean;
}

/** The files the migration rewrites, their original bytes kept. */
const KEPT = [HOME_FILE, "local/prefs.json", "local/forge-cache.json"];
/** The app tokens, re-keyed with `home.yaml`, recorded by digest alone. */
const CREDENTIALS = "local/credentials.yaml";

function migrationsDir(root: string): string { return join(root, "local", "migrations"); }

function findIncompleteReceipt(root: string): { receipt: InstancesReceipt; dir: string } | undefined {
  const migrations = migrationsDir(root);
  if (!existsSync(migrations)) return undefined;
  for (const id of readdirSync(migrations).sort()) {
    const file = join(migrations, id, "receipt.json");
    if (!existsSync(file)) continue;
    let value: unknown;
    try { value = readJsonFile(file); } catch { continue; }
    if (isObject(value) && value.kind === "instances" && value.complete === false) {
      return { receipt: value as unknown as InstancesReceipt, dir: join(migrations, id) };
    }
  }
  return undefined;
}

/** Whether the home must take the instances migration before writers
 * are admitted: `home.yaml` in format 1, or a migration interrupted. */
export function needsInstancesMigration(root: string): boolean {
  if (findIncompleteReceipt(root)) return true;
  let value: unknown;
  try { value = parseYaml(readFileSync(Home.file(root), "utf8")); } catch { return false; }
  return isObject(value) && value.format === 1;
}

const divergedDestination = (): string =>
  i18n._({ id: "migration destination diverged; preserved unchanged",
    comment: "Migration diagnostic: the file changed under the migration, which wrote nothing" });

const invalidReceipt = (): string =>
  i18n._({ id: "invalid migration receipt or retained input",
    comment: "Migration diagnostic: the kept original no longer matches its receipt" });

function readIfAny(file: string): Buffer | null {
  try { return readFileSync(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new StorageFormatError(file, (error as Error).message);
  }
}

/** `home.yaml` in format 1: one host, with the account signed in there. */
interface FormerHome {
  format: 1;
  device: unknown;
  host: { url: string; clientId: string; account?: HomeAccount; signedOut?: boolean };
  own: unknown;
  folders: unknown;
}

/** The format-1 fields the migration reads; the rest is verified in the
 * format-2 file it becomes. */
function parseFormerHome(bytes: Buffer, file: string): FormerHome {
  let value: unknown;
  try { value = parseYaml(bytes.toString("utf8")); }
  catch (error) { throw new StorageFormatError(file, (error as Error).message); }
  need(isObject(value) && value.format === 1, file, invalidHome());
  closed(value, ["format", "device", "host", "own", "folders"], [], file);
  closed(value.host, ["url", "clientId"], ["account", "signedOut"], file);
  need(isText(value.host.url) && value.host.clientId === CLIENT_ID &&
    (value.host.signedOut === undefined || typeof value.host.signedOut === "boolean"), file, invalidHome());
  return value as unknown as FormerHome;
}

/** The URL a former credential store keyed the host's token by. */
function formerKey(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The credentials file with the home's token moved from its former key
 * to the instance's origin, the home's own token standing over any entry
 * already there; null where it moves nothing, or the file is not one the
 * credential store reads, which leaves it as it is and reports it. */
function rekeyedCredentials(bytes: Buffer, from: string, to: string): Buffer | null {
  if (from === to) return null;
  let doc: unknown;
  try { doc = parseYaml(bytes.toString("utf8")); } catch { return null; }
  if (!isObject(doc) || doc.format !== 1 || !isObject(doc.hosts) || !Object.hasOwn(doc.hosts, from)) return null;
  const hosts: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.hosts)) {
    if (key === to) continue;
    hosts[key === from ? to : key] = value;
  }
  return Buffer.from(stringifyYaml({ format: 1, hosts }));
}

/**
 * Migrate a home to format 2 in place (DR-127). Restart-safe: an
 * interrupted run resumes from its receipt, verifying what it already
 * wrote and never overwriting a destination that diverged.
 */
export function migrateInstances(root: string): InstancesReceipt {
  const migrations = migrationsDir(root);
  mkdirSync(migrations, { recursive: true, mode: 0o700 });

  // 1 — the receipt: every input's digest, the original bytes of all
  // but the credentials kept.
  let found = findIncompleteReceipt(root);
  if (!found) {
    const id = randomUUID(); const dir = join(migrations, id);
    mkdirSync(join(dir, "inputs"), { recursive: true, mode: 0o700 });
    const inputs: InstancesReceipt["inputs"] = [];
    for (const path of [...KEPT, CREDENTIALS]) {
      const file = join(root, path);
      if (!existsSync(file) || !statSync(file).isFile()) continue;
      const bytes = readFileSync(file);
      const kept = path !== CREDENTIALS;
      if (kept) writeApplicationBytes(join(dir, "inputs", String(inputs.length)), bytes);
      inputs.push({ path, sha256: sha256(bytes), kept });
    }
    const receipt: InstancesReceipt = { format: 1, id, kind: "instances", inputs, steps: [], deferred: [], complete: false };
    writeApplicationFile(join(dir, "receipt.json"), receipt);
    found = { receipt, dir };
  }
  const { receipt, dir: receiptDir } = found;
  const save = (): void => writeApplicationFile(join(receiptDir, "receipt.json"), receipt);
  const step = (name: string): Record<string, unknown> | undefined => receipt.steps.find((entry) => entry.step === name);
  const record = (entry: Record<string, unknown>): void => {
    receipt.steps = [...receipt.steps.filter((prior) => prior.step !== entry.step), entry];
    save();
  };
  const kept = (path: string): Buffer | undefined => {
    const index = receipt.inputs.findIndex((entry) => entry.path === path);
    if (index < 0) return undefined;
    const file = join(receiptDir, "inputs", String(index));
    let bytes: Buffer;
    try { bytes = readFileSync(file); } catch { throw new StorageFormatError(file, invalidReceipt()); }
    need(receipt.inputs[index].kept && sha256(bytes) === receipt.inputs[index].sha256, file, invalidReceipt());
    return bytes;
  };

  // 2 — home.yaml in format 2, the host its recorded origin and, where
  // it holds an account, its one instance; the app token re-keyed to
  // that origin in the same step.
  const homeFile = Home.file(root);
  if (step("home")?.written !== true) {
    const formerBytes = kept(HOME_FILE);
    if (!formerBytes) throw new StorageFormatError(homeFile, invalidReceipt());
    const former = parseFormerHome(formerBytes, homeFile);
    let origin: string;
    try { origin = canonicalOrigin(former.host.url); }
    catch (error) {
      if (!(error instanceof OriginRefused)) throw error;
      throw new StorageFormatError(homeFile, notAnOrigin(former.host.url));
    }
    const { account, signedOut } = former.host;
    const next: HomeFile = {
      format: 2,
      device: former.device as string,
      origin,
      instances: account ? [{ url: origin, clientId: CLIENT_ID, account, ...(signedOut === true ? { signedOut: true } : {}) }] : [],
      own: former.own as string,
      folders: former.folders as HomeFile["folders"],
    };
    parseHomeFile(next, homeFile);
    const nextBytes = Buffer.from(stringifyYaml(next));

    // The token's move, planned by digest before anything is written,
    // so a restart tells its own write from another's.
    const credentialsFile = join(root, CREDENTIALS);
    const from = formerKey(former.host.url);
    let entry = step("home");
    if (!entry) {
      let credentials: { from: string; to: string } | null = null;
      const input = receipt.inputs.find((item) => item.path === CREDENTIALS);
      const current = input ? readIfAny(credentialsFile) : null;
      if (input && current) {
        need(sha256(current) === input.sha256, credentialsFile, divergedDestination());
        const moved = rekeyedCredentials(current, from, origin);
        if (moved) credentials = { from: input.sha256, to: sha256(moved) };
      }
      entry = { step: "home", origin, credentials, written: false };
      record(entry);
    }
    const plan = entry.credentials as { from: string; to: string } | null;
    if (plan) {
      const current = readIfAny(credentialsFile);
      const digest = current === null ? null : sha256(current);
      if (digest !== plan.to) {
        need(current !== null && digest === plan.from, credentialsFile, divergedDestination());
        const moved = rekeyedCredentials(current, from, origin);
        need(moved !== null && sha256(moved) === plan.to, credentialsFile, divergedDestination());
        mkdirSync(join(root, "local"), { recursive: true, mode: 0o700 });
        writeApplicationBytes(credentialsFile, moved);
      }
    }
    const current = readIfAny(homeFile);
    if (current === null || !current.equals(nextBytes)) {
      need(current !== null && current.equals(formerBytes), homeFile, divergedDestination());
      writeApplicationBytes(homeFile, nextBytes);
    }
    record({ ...entry, written: true });
  }

  // 3 — verified: the home reads in format 2.
  Home.load(root);
  receipt.complete = true;
  save();
  return receipt;
}

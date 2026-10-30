// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A new import stage (storage-50), around the released groups migration:
// retain bounded CLI families before that migration sees root session files,
// then publish them into the home it established, without changing its code.
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSessionStore } from "@sublang/playbook/session-store";
import { Home, isRepositoryKey } from "./home.js";
import { isObject, readJsonFile, sha256, StorageFormatError, UUID, writeApplicationBytes, writeApplicationFile } from "@sublang/spex/files";

interface InputFile { path: string; sha256: string }
interface ImportedSession { id: string; cwd: string; files: InputFile[]; retained: boolean; staged: boolean; repository?: string; complete: boolean }
interface ImportReceipt { format: 1; id: string; kind: "bounded-sessions"; sessions: ImportedSession[]; complete: boolean }
interface Pending { receipt: ImportReceipt; dir: string }
function fail(file: string, reason: string): never { throw new StorageFormatError(file, reason); }
const migrations = (root: string): string => join(root, "local", "migrations");
const belongs = (path: string, id: string): boolean => !path.split("/").some((part) => !part || part === "." || part === "..") &&
  (new Set([`${id}.json`, `${id}.replay.json`, `${id}.records.jsonl`, `${id}.hints.json`]).has(path) || path.startsWith(`${id}.chunks/`) || path.startsWith(`${id}.assets/`));

/** Check every parent at the actual read/write boundary, never following a
 * link; callers create only missing tails after checking the clone itself. */
function inspect(root: string, path = "", directory = true): boolean {
  const parts = path ? path.split("/") : [];
  if (parts.some((part) => !part || part === "." || part === "..")) fail(root, "unsafe bounded session import path");
  for (let end = 0; end <= parts.length; end += 1) {
    const file = join(root, ...parts.slice(0, end));
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat) return false;
    if (stat.isSymbolicLink() || (end < parts.length || directory ? !stat.isDirectory() : !stat.isFile()) ||
        (process.getuid && stat.uid !== process.getuid()) || (stat.isFile() && stat.nlink !== 1)) fail(file, "unsafe bounded session import entry");
  }
  return true;
}

function pending(root: string): Pending[] {
  const directory = migrations(root);
  if (!existsSync(directory)) return [];
  inspect(root, "local/migrations");
  const found: Pending[] = [];
  for (const id of readdirSync(directory)) {
    if (!UUID.test(id)) continue;
    const dir = join(directory, id); const file = join(dir, "receipt.json");
    if (!inspect(directory, `${id}/receipt.json`, false)) continue;
    const value = readJsonFile(file);
    if (!isObject(value) || value.kind !== "bounded-sessions") continue;
    const keys = ["format", "id", "kind", "sessions", "complete"];
    if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key)) || value.format !== 1 || value.id !== id ||
        typeof value.complete !== "boolean" || !Array.isArray(value.sessions)) fail(file, "invalid bounded session import receipt");
    const seen = new Set<string>();
    for (const entry of value.sessions) {
      if (!isObject(entry) || Object.keys(entry).some((key) => !["id", "cwd", "files", "retained", "staged", "repository", "complete"].includes(key)) ||
          typeof entry.id !== "string" || !UUID.test(entry.id) || seen.has(entry.id) || typeof entry.cwd !== "string" || !entry.cwd ||
          !Array.isArray(entry.files) || !entry.files.length || [entry.retained, entry.staged, entry.complete].some((flag) => typeof flag !== "boolean") ||
          (entry.repository !== undefined && (typeof entry.repository !== "string" || !isRepositoryKey(entry.repository)))) fail(file, "invalid bounded session import entry");
      if (entry.staged && !entry.retained || entry.complete && (!entry.retained || !entry.staged || entry.repository === undefined)) fail(file, "invalid bounded session import state");
      seen.add(entry.id);
      const paths = new Set<string>();
      for (const input of entry.files) {
        if (!isObject(input) || Object.keys(input).length !== 2 || typeof input.path !== "string" || !belongs(input.path, entry.id) || paths.has(input.path) ||
            typeof input.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(input.sha256)) fail(file, "invalid bounded session import input");
        paths.add(input.path);
      }
    }
    if (value.complete && value.sessions.some((entry) => !isObject(entry) || entry.complete !== true)) fail(file, "incomplete bounded session import receipt marked complete");
    if (!value.complete) found.push({ receipt: value as unknown as ImportReceipt, dir });
  }
  return found;
}

function sourceIds(root: string): string[] {
  const source = join(root, "sessions");
  if (!inspect(root, "sessions")) return [];
  return readdirSync(source).flatMap((name) => {
    const id = name.slice(0, -5);
    if (!name.endsWith(".json") || !UUID.test(id)) return [];
    inspect(source, name, false);
    const value = readJsonFile(join(source, name));
    return isObject(value) && value.schemaVersion === 8 ? [id] : [];
  });
}

/** A source family includes every owned regular file, not just today's
 * reachable chunks, so an unseen member cannot be silently discarded. */
function family(directory: string, id: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  if (!inspect(directory)) return files;
  const walk = (path: string): void => {
    const stat = lstatSync(join(directory, path), { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      inspect(directory, path);
      for (const name of readdirSync(join(directory, path))) walk(`${path}/${name}`);
    } else {
      inspect(directory, path, false);
      files.set(path, readFileSync(join(directory, path)));
    }
  };
  for (const suffix of [".json", ".replay.json", ".records.jsonl", ".hints.json", ".chunks", ".assets"]) walk(`${id}${suffix}`);
  return files;
}

const inputsDir = (item: Pending, id: string): string => join(item.dir, "inputs", id);
const save = (item: Pending): void => writeApplicationFile(join(item.dir, "receipt.json"), item.receipt);
function verifyInputs(item: Pending, entry: ImportedSession): Map<string, Buffer> {
  const directory = inputsDir(item, entry.id);
  inspect(item.dir, `inputs/${entry.id}`);
  const files = family(directory, entry.id);
  if (files.size !== entry.files.length || entry.files.some((input) => !files.has(input.path) || sha256(files.get(input.path)!) !== input.sha256)) fail(directory, "bounded session retained input differs from its receipt");
  return files;
}
function checkSubset(directory: string, id: string, expected: ReadonlyMap<string, Buffer>): Map<string, Buffer> {
  const current = family(directory, id);
  for (const [path, bytes] of current) if (!expected.get(path)?.equals(bytes)) fail(join(directory, path), "bounded session import destination or source changed; preserved unchanged");
  return current;
}
function checkExact(directory: string, id: string, expected: ReadonlyMap<string, Buffer>): void {
  if (checkSubset(directory, id, expected).size !== expected.size) fail(directory, "bounded session import is incomplete");
}
function privateDirectory(root: string, path: string): void {
  inspect(root, path);
  mkdirSync(join(root, path), { recursive: true, mode: 0o700 });
  inspect(root, path);
  chmodSync(join(root, path), 0o700);
}
function copy(directory: string, files: ReadonlyMap<string, Buffer>, id: string): void {
  const order = (path: string): number => path === `${id}.json` ? 2 : path === `${id}.replay.json` ? 1 : 0;
  for (const [path, bytes] of [...files].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))) {
    inspect(directory, path, false);
    const parent = dirname(path);
    if (parent !== ".") privateDirectory(directory, parent);
    if (existsSync(join(directory, path))) continue;
    inspect(directory, path, false);
    writeApplicationBytes(join(directory, path), bytes);
  }
}
async function validate(directory: string, id: string, cwd?: string): Promise<void> {
  const shared = createSessionStore({ sessionsDir: directory, createSessionsDir: false });
  await shared.prepare();
  const checked = await shared.validate(id);
  if (!checked.integrityValid) fail(join(directory, `${id}.json`), checked.reasons.join("; "));
  await shared.exportBundle(id);
  if (cwd !== undefined && (await shared.readManifest(id)).cwd !== cwd) fail(directory, "bounded session working directory differs from its receipt");
}
function retire(directory: string, entry: ImportedSession, expected: ReadonlyMap<string, Buffer>): void {
  const current = checkSubset(directory, entry.id, expected);
  const paths = [...current.keys()].sort((a, b) => Number(a === `${entry.id}.json`) - Number(b === `${entry.id}.json`));
  for (const path of paths) { inspect(directory, path, false); rmSync(join(directory, path)); }
  // Remove only empty verified directories; never recurse through a late file.
  const removeEmpty = (path: string): void => {
    if (!inspect(directory, path)) return;
    for (const name of readdirSync(join(directory, path))) {
      const child = `${path}/${name}`;
      if (lstatSync(join(directory, child)).isDirectory()) removeEmpty(child);
    }
    rmdirSync(join(directory, path));
  };
  for (const suffix of [".assets", ".chunks"]) removeEmpty(`${entry.id}${suffix}`);
}

export function needsBoundedSessionImport(root: string): boolean { return pending(root).length > 0 || sourceIds(root).length > 0; }

/** Retained source bytes are durable before the released migration is
 * allowed to see the remaining root sessions. */
export async function stageBoundedHomeSessions(root: string): Promise<void> {
  let items = pending(root);
  const ids = sourceIds(root);
  if (!items.length && ids.length) {
    const id = randomUUID(); privateDirectory(root, `local/migrations/${id}`);
    const item: Pending = { dir: join(migrations(root), id), receipt: { format: 1, id, kind: "bounded-sessions", sessions: [], complete: false } };
    save(item); items = [item];
  }
  const source = join(root, "sessions");
  for (const item of items) {
    const shared = createSessionStore({ sessionsDir: source, createSessionsDir: false });
    for (const id of ids.filter((id) => !items.some((candidate) => candidate.receipt.sessions.some((entry) => entry.id === id)))) {
      await shared.prepare();
      const lease = await shared.acquireManagement(id);
      try {
        await validate(source, id);
        const manifest = await shared.readManifest(id);
        if (typeof manifest.cwd !== "string") fail(source, "bounded session working directory is invalid");
        const files = family(source, id);
        const entry: ImportedSession = { id, cwd: manifest.cwd, files: [...files].map(([path, bytes]) => ({ path, sha256: sha256(bytes) })), retained: false, staged: false, complete: false };
        item.receipt.sessions.push(entry); save(item);
      } finally { await lease.release(); }
    }
    for (const entry of item.receipt.sessions) {
      if (entry.complete) continue;
      if (!inspect(root, "sessions")) { if (entry.staged) continue; fail(source, "bounded session source directory is missing"); }
      await shared.prepare();
      const lease = await shared.acquireManagement(entry.id);
      try {
        if (!entry.retained) {
          const files = family(source, entry.id);
          if (files.size !== entry.files.length || entry.files.some((file) => sha256(files.get(file.path) ?? Buffer.alloc(0)) !== file.sha256)) fail(source, "bounded session source changed before retention");
          privateDirectory(item.dir, `inputs/${entry.id}`);
          checkSubset(inputsDir(item, entry.id), entry.id, files);
          copy(inputsDir(item, entry.id), files, entry.id);
          await validate(inputsDir(item, entry.id), entry.id, entry.cwd);
          entry.retained = true; save(item);
        }
        const retained = verifyInputs(item, entry);
        await validate(inputsDir(item, entry.id), entry.id, entry.cwd);
        await lease.assertOwner();
        retire(source, entry, retained);
        entry.staged = true; save(item);
      } finally { await lease.release(); }
    }
  }
}

/** A destination may contain identical output from an interrupted copy;
 * any different byte or extra family member refuses before publication. */
export async function finishBoundedHomeSessions(root: string, home: Home): Promise<void> {
  for (const item of pending(root)) {
    for (const entry of item.receipt.sessions) {
      if (entry.complete) continue;
      if (!entry.retained || !entry.staged) fail(item.dir, "bounded session import was not staged");
      const files = verifyInputs(item, entry);
      await validate(inputsDir(item, entry.id), entry.id, entry.cwd);
      const key = entry.repository ?? home.keyForFolder(entry.cwd) ?? home.own();
      if (entry.repository === undefined) { entry.repository = key; save(item); }
      const clonePath = `workspace/${key}`;
      if (!inspect(root, clonePath)) fail(join(root, clonePath), "bounded session destination clone is missing");
      privateDirectory(root, `${clonePath}/sessions`);
      const destination = join(root, clonePath, "sessions");
      const shared = createSessionStore({ sessionsDir: destination, createSessionsDir: false });
      await shared.prepare();
      const lease = await shared.acquireManagement(entry.id);
      try {
        inspect(root, `${clonePath}/sessions`);
        checkSubset(destination, entry.id, files);
        copy(destination, files, entry.id);
        checkExact(destination, entry.id, files);
        await validate(destination, entry.id, entry.cwd);
        checkExact(destination, entry.id, files);
        await lease.assertOwner();
        entry.complete = true; save(item);
      } finally { await lease.release(); }
    }
    item.receipt.complete = true; save(item);
  }
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The content-addressed store under the home (environments-7, DR-104):
// each distinct file once, named by its SHA-256, written once after its
// digest is verified, read-only; an executable copy apart under `x/`
// because hard links share one mode. A file stays while a lock in a
// spex repository on this device selects it. Windows keeps one
// read-only mark for all the links of a file, so removing an installed
// link there makes the stored file writable: the store marks its files
// read-only again before each link, after each removal that unmarked
// any file, and at each collection.

import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, copyFileSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readdirSync, renameSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";

import { removeTree } from "../files.js";
import { sha256Hex } from "./format.js";
import type { Lock } from "./lock.js";

export class DigestError extends Error {
  constructor(readonly expected: string, readonly actual: string, readonly what: string) {
    super(`${what}: SHA-256 ${actual} does not match the expected ${expected}`);
    this.name = "DigestError";
  }
}

/** The key a store entry goes by: `<sha>` or `x/<sha>`. */
export function storeKey(sha256: string, executable: boolean): string {
  return executable ? `x/${sha256}` : sha256;
}

/** Every store entry the given locks select. */
export function lockStoreKeys(locks: Iterable<Lock>): Set<string> {
  const keys = new Set<string>();
  for (const lock of locks) {
    for (const resolution of Object.values(lock.packages)) {
      for (const file of resolution.files) keys.add(storeKey(file.sha256, file.executable));
    }
  }
  return keys;
}

const SHA_RE = /^[0-9a-f]{64}$/;

/** The mode of a stored file: read-only, executable under `x/`. */
const storedMode = (executable: boolean): number => (executable ? 0o555 : 0o444);

/** Mark a file read-only again where it is not. The mark guards the
 * stored bytes; failing to set it fails nothing. */
function markReadOnly(path: string, executable: boolean): void {
  try { if ((statSync(path).mode & 0o222) !== 0) chmodSync(path, storedMode(executable)); }
  catch { /* left as it is */ }
}

export class ContentStore {
  readonly root: string;

  constructor(homeDir: string) {
    this.root = join(homeDir, "store");
  }

  pathOf(sha256: string, executable: boolean): string {
    if (!SHA_RE.test(sha256)) throw new Error(`"${sha256}" is not a SHA-256 digest`);
    return executable ? join(this.root, "x", sha256) : join(this.root, sha256);
  }

  has(sha256: string, executable: boolean): boolean {
    return existsSync(this.pathOf(sha256, executable));
  }

  /** Store bytes under their digest, verified first; written once. */
  put(bytes: Uint8Array, sha256: string, executable: boolean, what = "file"): string {
    const target = this.pathOf(sha256, executable);
    const actual = sha256Hex(bytes);
    if (actual !== sha256) throw new DigestError(sha256, actual, what);
    if (existsSync(target)) return target;
    const dir = executable ? join(this.root, "x") : this.root;
    mkdirSync(dir, { recursive: true });
    const temporary = join(this.root, `.tmp-${randomUUID()}`);
    const fd = openSync(temporary, "wx", 0o600);
    try {
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temporary, storedMode(executable));
    if (existsSync(target)) removeTree(temporary);
    else renameSync(temporary, target);
    return target;
  }

  /** Every entry's key. */
  keys(): string[] {
    const out: string[] = [];
    if (!existsSync(this.root)) return out;
    for (const name of readdirSync(this.root)) if (SHA_RE.test(name)) out.push(name);
    const x = join(this.root, "x");
    if (existsSync(x)) for (const name of readdirSync(x)) if (SHA_RE.test(name)) out.push(`x/${name}`);
    return out;
  }

  /** Place a stored file at `to`: a hard link, the file marked
   * read-only again first, or a read-only copy where no link can be made. */
  link(sha256: string, executable: boolean, to: string): void {
    const from = this.pathOf(sha256, executable);
    markReadOnly(from, executable);
    try {
      linkSync(from, to);
    } catch {
      copyFileSync(from, to);
      chmodSync(to, storedMode(executable));
    }
  }

  /** Remove a tree whose files may link the store's — an installed,
   * staged or former tree (environments-7). Where the removal made any
   * file writable, or stopped part way, every stored file is marked
   * read-only again, so nothing relies on a record of the tree. */
  removeLinked(tree: string): void {
    let unmarked = true;
    try { unmarked = removeTree(tree); }
    finally { if (unmarked) this.markAllReadOnly(); }
  }

  /** Mark every entry read-only again. */
  private markAllReadOnly(): void {
    let keys: string[];
    try { keys = this.keys(); } catch { return; /* the next collection marks them */ }
    for (const key of keys) markReadOnly(join(this.root, ...key.split("/")), key.startsWith("x/"));
  }

  /** Remove every entry no lock selects, read-only as it is, and mark
   * every entry kept read-only again, also where a removal fails;
   * returns the removed keys. */
  gc(selected: Set<string>): string[] {
    const removed: string[] = [];
    try {
      for (const key of this.keys()) {
        if (selected.has(key)) continue;
        removeTree(join(this.root, ...key.split("/")));
        removed.push(key);
      }
      // A temporary file an interrupted put left behind, once it is old
      // enough not to be a put still running.
      if (existsSync(this.root)) {
        const before = Date.now() - 60 * 60 * 1000;
        for (const name of readdirSync(this.root)) {
          if (!name.startsWith(".tmp-")) continue;
          const file = join(this.root, name);
          try { if (statSync(file).mtimeMs < before) removeTree(file); } catch { /* gone */ }
        }
      }
    } finally {
      this.markAllReadOnly();
    }
    return removed;
  }
}

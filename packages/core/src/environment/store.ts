// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The content-addressed store under the home (environments-7, DR-104):
// each distinct file once, named by its SHA-256, written once after its
// digest is verified, read-only; an executable copy apart under `x/`
// because hard links share one mode. A file stays while a lock in a
// spex repository on this device selects it.

import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";

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
    chmodSync(temporary, executable ? 0o555 : 0o444);
    if (existsSync(target)) rmSync(temporary, { force: true });
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

  /** Remove every entry no lock selects; returns the removed keys. */
  gc(selected: Set<string>): string[] {
    const removed: string[] = [];
    for (const key of this.keys()) {
      if (selected.has(key)) continue;
      rmSync(join(this.root, ...key.split("/")), { force: true });
      removed.push(key);
    }
    // A temporary file an interrupted put left behind, once it is old
    // enough not to be a put still running.
    if (existsSync(this.root)) {
      const before = Date.now() - 60 * 60 * 1000;
      for (const name of readdirSync(this.root)) {
        if (!name.startsWith(".tmp-")) continue;
        const file = join(this.root, name);
        try { if (statSync(file).mtimeMs < before) rmSync(file, { force: true }); } catch { /* gone */ }
      }
    }
    return removed;
  }
}

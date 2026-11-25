// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The content-addressed store under the home (environments-7, DR-104,
// DR-251): a cache of verified bytes, each distinct file once, named by
// its SHA-256, written once after its digest is verified. An install
// copies a file out, its digest checked again as it is read, so an
// installed tree shares nothing with the store. A stored file is written
// read-only against an edit by mistake; nothing relies on that mark. A
// file stays while a lock of an environment the home knows selects it.

import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, writeSync } from "node:fs";
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

/** Every stored file the given locks select, by digest. */
export function lockStoreKeys(locks: Iterable<Lock>): Set<string> {
  const keys = new Set<string>();
  for (const lock of locks) {
    for (const resolution of Object.values(lock.packages)) {
      for (const file of resolution.files) keys.add(file.sha256);
    }
  }
  return keys;
}

const SHA_RE = /^[0-9a-f]{64}$/;

/** Where an earlier release kept an executable file's own copy, links
 * sharing one mode (DR-251). */
const FORMER_EXECUTABLES = "x";

export class ContentStore {
  readonly root: string;

  constructor(homeDir: string) {
    this.root = join(homeDir, "store");
  }

  pathOf(sha256: string): string {
    if (!SHA_RE.test(sha256)) throw new Error(`"${sha256}" is not a SHA-256 digest`);
    return join(this.root, sha256);
  }

  has(sha256: string): boolean {
    return existsSync(this.pathOf(sha256));
  }

  /** Store bytes under their digest, verified first; written once. */
  put(bytes: Uint8Array, sha256: string, what = "file"): string {
    const target = this.pathOf(sha256);
    const actual = sha256Hex(bytes);
    if (actual !== sha256) throw new DigestError(sha256, actual, what);
    if (existsSync(target)) return target;
    mkdirSync(this.root, { recursive: true });
    const temporary = join(this.root, `.tmp-${randomUUID()}`);
    const fd = openSync(temporary, "wx", 0o600);
    try {
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temporary, 0o444);
    if (existsSync(target)) removeTree(temporary);
    else renameSync(temporary, target);
    return target;
  }

  /** Take an executable file's former copy under `x/` as the stored
   * file where the store lacks it, verified as any bytes are
   * (environments-7): whether the store now holds the file. */
  adoptFormer(sha256: string): boolean {
    if (this.has(sha256)) return true;
    try {
      this.put(readFileSync(join(this.root, FORMER_EXECUTABLES, sha256)), sha256);
      return true;
    } catch {
      return false;
    }
  }

  /** Every stored file's digest. */
  keys(): string[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root).filter((name) => SHA_RE.test(name));
  }

  /** Copy a stored file to `to`, where no file stands, as an ordinary
   * writable file, executable or not as the lock says, whatever the
   * umask. The bytes are checked against their digest as they are read:
   * a stored file that no longer matches is removed and nothing is
   * written (environments-7). */
  copy(sha256: string, executable: boolean, to: string, what = "file"): void {
    const from = this.pathOf(sha256);
    const bytes = readFileSync(from);
    const actual = sha256Hex(bytes);
    if (actual !== sha256) {
      removeTree(from);
      throw new DigestError(sha256, actual, `the stored copy of ${what}`);
    }
    const mode = executable ? 0o755 : 0o644;
    writeFileSync(to, bytes, { flag: "wx", mode });
    chmodSync(to, mode);
  }

  /** Remove every stored file no lock selects, read-only as it is, and
   * the former `x/` whole; returns the removed digests
   * (environments-52). */
  gc(selected: Set<string>): string[] {
    const removed: string[] = [];
    for (const key of this.keys()) {
      if (selected.has(key)) continue;
      removeTree(join(this.root, key));
      removed.push(key);
    }
    if (!existsSync(this.root)) return removed;
    removeTree(join(this.root, FORMER_EXECUTABLES));
    // A temporary file an interrupted put left behind, once it is old
    // enough not to be a put still running.
    const before = Date.now() - 60 * 60 * 1000;
    for (const name of readdirSync(this.root)) {
      if (!name.startsWith(".tmp-")) continue;
      const file = join(this.root, name);
      try { if (statSync(file).mtimeMs < before) removeTree(file); } catch { /* gone */ }
    }
    return removed;
  }
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-12, guards-28), DR-251: the copy a run
 * checks. It is made in a fresh folder under the OS temp folder: the
 * binding's `files` and the binding's own folder at the paths they
 * have in the project, links followed, every `node_modules` and
 * `.git` folder left out, and the project's `node_modules` folders
 * linked in so the copy uses the installed dependencies.
 *
 * Nothing is written in the project. Every folder made here is
 * removed when its checks end, and whatever is left is removed when
 * the process exits, however it exits.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { byText } from "./types.js";

/** One copy and the folders made beside it. */
export type Copy = {
  /** The fresh folder that holds everything below. */
  home: string;
  /** The copied files: the working folder of every check. */
  folder: string;
  /** An empty folder given to the copy's processes as their temp
   * folder, so what they leave there goes with the copy. */
  scratch: string;
  /** One SHA-256 over the sorted relative paths and the bytes of
   * everything copied, before any patch. */
  digest: string;
};

/** Folders that never go into a copy. */
const LEFT_OUT: ReadonlySet<string> = new Set(["node_modules", ".git"]);

const live = new Set<string>();
let hooked = false;

/** Remove every copy still standing. Safe to call at any time. */
export function removeCopies(): void {
  for (const home of [...live]) removeHome(home);
}

function removeHome(home: string): void {
  live.delete(home);
  try {
    // A linked node_modules is unlinked, never followed.
    rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // Nothing more can be done for a temp folder that will not go.
  }
}

/** Remove one copy. */
export function removeCopy(copy: Copy): void {
  removeHome(copy.home);
}

function abs(base: string, path: string): string {
  return path === "" ? base : join(base, ...path.split("/"));
}

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** The folders above `path`, the root (`""`) first. */
function above(path: string): string[] {
  const parts = path.split("/");
  return parts.map((_, index) => parts.slice(0, index).join("/"));
}

/**
 * Copy `path` (a file or a folder, relative to the root) from the
 * project into the copy. `files` gathers every file copied and
 * `folders` every folder walked; `held` is the chain of real folders
 * being walked, so a link back into it is refused and not followed
 * for ever.
 */
function copyEntry(
  root: string,
  folder: string,
  path: string,
  files: Set<string>,
  folders: Set<string>,
  held: readonly string[],
): void {
  const from = abs(root, path);
  const to = abs(folder, path);
  const stat = statSync(from);
  if (stat.isDirectory()) {
    const real = realpathSync(from);
    if (held.includes(real)) throw new Error(`${path} links back to a folder that holds it`);
    folders.add(path);
    mkdirSync(to, { recursive: true });
    for (const name of readdirSync(from).sort(byText)) {
      if (LEFT_OUT.has(name)) continue;
      copyEntry(root, folder, `${path}/${name}`, files, folders, [...held, real]);
    }
  } else if (stat.isFile()) {
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, readFileSync(from), { mode: stat.mode & 0o777 });
    files.add(path);
  }
}

/** One SHA-256 over each path and its bytes, paths in order. */
function digestOf(folder: string, files: readonly string[]): string {
  const hash = createHash("sha256");
  for (const path of files) {
    const bytes = readFileSync(abs(folder, path));
    hash.update(`${path}\0${bytes.length}\0`);
    hash.update(bytes);
  }
  return hash.digest("hex");
}

/**
 * Make a copy of `paths` (files and folders relative to `root`) in a
 * fresh folder under the OS temp folder (guards-12, steps 1 to 3).
 * Every folder of the copy whose project counterpart holds a
 * `node_modules` gets a link to it, as does the root and each folder
 * above a copied path. An error leaves no folder behind.
 */
export function makeCopy(root: string, paths: readonly string[]): Copy {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "spex-guard-")));
  live.add(home);
  if (!hooked) {
    hooked = true;
    process.on("exit", removeCopies);
  }
  try {
    const folder = join(home, "copy");
    const scratch = join(home, "tmp");
    mkdirSync(folder);
    mkdirSync(scratch);
    const files = new Set<string>();
    const folders = new Set<string>();
    for (const path of paths) {
      for (const parent of above(path)) folders.add(parent);
      copyEntry(root, folder, path, files, folders, []);
    }
    for (const path of folders) {
      const modules = join(abs(root, path), "node_modules");
      if (!isDir(modules)) continue;
      mkdirSync(abs(folder, path), { recursive: true });
      // A junction on Windows, which needs no special right.
      symlinkSync(modules, join(abs(folder, path), "node_modules"), "junction");
    }
    return { home, folder, scratch, digest: digestOf(folder, [...files].sort(byText)) };
  } catch (error) {
    removeHome(home);
    throw error;
  }
}

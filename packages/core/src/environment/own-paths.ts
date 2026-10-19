// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Your own group's requests by path (environments-32, DR-125): the path
// is relative to its clone's root, and names a folder below it that lies
// outside Spex's own paths, is reached through no link, and holds no
// file the clone's Git rules ignore — so the folder syncs with the
// clone to every device, and a sync takes it whole (storage-11).

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { join, posix } from "node:path";

import { isInsidePath } from "./requests.js";

/** Why a folder of your own group's clone cannot be a path source. */
export type OwnPathIssue =
  | { reason: "root" }
  | { reason: "spex" }
  | { reason: "ignored" }
  | { reason: "link" }
  | { reason: "ignored_file"; file: string };

/** The first segments of the paths Spex keeps in a clone (storage-1):
 * its records, its settings, its installed and exported files, its
 * device-local files and its root files. */
const SPEX_PATHS = new Set([
  "config", "sessions", "intents", "authoring", "packages", "skills", "local", ".git", ".spex-uploads",
  "spex.yaml", "spex.lock", "project.json", ".gitignore", ".gitattributes", ".spex-apply.json",
]);

/** The paths of `paths`, relative to the clone, its Git rules ignore —
 * the managed rules, authored ones and this device's excludes alike —
 * whether or not Git tracks them. A clone that is no repository yet
 * ignores nothing. */
export function ignoredInClone(clone: string, paths: readonly string[]): string[] {
  if (paths.length === 0 || !existsSync(join(clone, ".git"))) return [];
  const run = spawnSync("git", ["-C", clone, "check-ignore", "--no-index", "--stdin", "-z"], {
    input: `${paths.join("\0")}\0`,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
  });
  // 1: nothing ignored; 0: some; anything else: Git could not tell.
  if (run.status === 1) return [];
  if (run.status !== 0) throw new Error(`Git could not read ${clone}'s rules: ${(run.stderr || String(run.error ?? "")).trim()}`);
  return run.stdout.split("\0").filter(Boolean);
}

/**
 * The first reason `path` cannot name a path source of your own group's
 * clone, as far as what stands there shows (environments-32); null
 * where none. `files` are the paths of the folder's release, relative to
 * the folder, where it was read: a folder not made yet is checked by its
 * path alone.
 */
export function ownPathIssue(clone: string, path: string, files?: readonly string[]): OwnPathIssue | null {
  if (!isInsidePath(path)) return { reason: "root" };
  const folder = posix.normalize(path).replace(/\/+$/, "");
  if (folder === "" || folder === ".") return { reason: "root" };
  const segments = folder.split("/");
  // Compared without case, as a file system folding it would place them.
  const first = segments[0]!.toLowerCase();
  if (SPEX_PATHS.has(first) || first.startsWith(".lock")) return { reason: "spex" };
  // A link first: Git reads no rule for a path beyond one.
  let current = clone;
  for (const segment of segments) {
    current = join(current, segment);
    let stat;
    try { stat = lstatSync(current); } catch { break; }
    if (stat.isSymbolicLink()) return { reason: "link" };
  }
  if (ignoredInClone(clone, [`${folder}/meta.yaml`]).length > 0) return { reason: "ignored" };
  if (files && files.length > 0) {
    const ignored = ignoredInClone(clone, files.map((file) => `${folder}/${file}`));
    if (ignored.length > 0) return { reason: "ignored_file", file: ignored[0]! };
  }
  return null;
}

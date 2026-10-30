// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Your own group's requests by path (environments-32, DR-125): the path
// is relative to its clone's root, and names a folder below it that lies
// outside Spex's own paths, is reached through no link, lies in no Git
// repository of its own, and holds nothing the clone's sync drops or
// refuses — so the folder syncs with the clone to every device, and a
// sync takes it whole (storage-11).

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";

import { portable } from "../files.js";
import { isInsidePath } from "./requests.js";

/** Why a folder of your own group's clone cannot be a path source; an
 * `entry` or a `file` is its path in the clone. */
export type OwnPathIssue =
  | { reason: "root" }
  | { reason: "spex" }
  | { reason: "ignored" }
  | { reason: "link" }
  | { reason: "repository"; entry: string }
  | { reason: "ignored_file"; file: string }
  | { reason: "unshared_file"; file: string }
  | { reason: "link_entry"; entry: string }
  | { reason: "special"; entry: string }
  | { reason: "unreadable"; entry: string };

/** The first segments of the paths Spex keeps in a clone (storage-1):
 * its records, its settings, its placement files (DR-128), its
 * installed and exported files, its device-local files and its root
 * files. */
const SPEX_PATHS = new Set([
  "config", "sessions", "intents", "authoring", "placements", "packages", "skills", "local", ".git", ".spex-uploads",
  "spex.yaml", "spex.lock", "project.json", ".gitignore", ".gitattributes", ".spex-apply.json",
]);

/** Whether a first segment names a path Spex keeps, compared without
 * case after compatibility normalization, as a file system folding
 * names would place it: `ſessions` and `Sessions` are `sessions`. */
function keptBySpex(name: string): boolean {
  const folded = name.normalize("NFKC").toLowerCase();
  return SPEX_PATHS.has(folded) || folded.startsWith(".lock");
}

/** Whether a folder holds `.git` — a directory or a file pointing at
 * one — making it a Git repository of its own. */
function holdsGit(dir: string): boolean {
  try { lstatSync(join(dir, ".git")); return true; } catch { return false; }
}

/** The paths of `paths`, relative to the clone, its Git rules ignore —
 * the managed rules, authored ones and this device's excludes alike —
 * as Git reads them: a path Git tracks is never ignored, so a rule only
 * this device's excludes hold refuses no file another device committed.
 * A path ending `/` is read as a folder. A clone that is no repository
 * yet ignores nothing. */
export function ignoredInClone(clone: string, paths: readonly string[]): string[] {
  if (paths.length === 0 || !existsSync(join(clone, ".git"))) return [];
  const run = spawnSync("git", ["-C", clone, "check-ignore", "--stdin", "-z"], {
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
 * clone by what its path shows (environments-32): below the root,
 * outside Spex's own paths, not ignored, reached through no link and in
 * no Git repository of its own. Null where none: a folder not made yet
 * is checked by these alone.
 */
export function ownPathIssue(clone: string, path: string): OwnPathIssue | null {
  if (!isInsidePath(path)) return { reason: "root" };
  const folder = posix.normalize(path).replace(/\/+$/, "");
  if (folder === "" || folder === ".") return { reason: "root" };
  const segments = folder.split("/");
  const first = segments[0]!;
  if (keptBySpex(first)) return { reason: "spex" };
  // A link first: Git reads no rule for a path beyond one.
  let current = clone;
  let repository: string | null = null;
  for (let index = 0; index < segments.length; index += 1) {
    current = join(current, segments[index]!);
    let stat;
    try { stat = lstatSync(current); } catch { break; }
    if (stat.isSymbolicLink()) return { reason: "link" };
    if (repository === null && stat.isDirectory() && holdsGit(current)) repository = segments.slice(0, index + 1).join("/");
  }
  if (ignoredInClone(clone, [`${folder}/meta.yaml`]).length > 0) return { reason: "ignored" };
  if (repository !== null) return { reason: "repository", entry: repository };
  return null;
}

/**
 * The first reason the folder at `path`, standing in your own group's
 * clone, holds what its sync drops or refuses (environments-32): a file
 * of its release, `files` relative to the folder, the clone's Git rules
 * ignore or of an ignored family a Save refuses to share (space-15); or,
 * at any depth and where those rules do not ignore it, a Git repository
 * of its own, a link, or an entry that is no regular file or folder.
 * Null where none, or where the folder does not stand.
 */
export function ownFolderIssue(clone: string, path: string, files: readonly string[]): OwnPathIssue | null {
  const folder = posix.normalize(path).replace(/\/+$/, "");
  const inClone = files.map((file) => `${folder}/${file}`);
  const ignored = ignoredInClone(clone, inClone);
  if (ignored.length > 0) return { reason: "ignored_file", file: ignored[0]! };
  const unshared = inClone.find((file) => !portable(file));
  if (unshared !== undefined) return { reason: "unshared_file", file: unshared };
  // Every entry, nothing skipped, read without following a link; a Git
  // repository of its own is not entered, as Git enters none.
  const found: { probe: string; issue: OwnPathIssue }[] = [];
  const walk = (rel: string): void => {
    let entries;
    try { entries = readdirSync(join(clone, ...rel.split("/")), { withFileTypes: true }); }
    catch (error) {
      // Missing folders remain missing; every other failed inspection
      // proves nothing about a standing subtree. Like a forbidden entry,
      // it is harmless only where the clone's Git rules ignore it.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") found.push({ probe: `${rel}/`, issue: { reason: "unreadable", entry: rel } });
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const child = `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) found.push({ probe: child, issue: { reason: "link_entry", entry: child } });
      else if (entry.isDirectory()) {
        if (holdsGit(join(clone, ...child.split("/")))) found.push({ probe: `${child}/`, issue: { reason: "repository", entry: child } });
        else walk(child);
      } else if (!entry.isFile()) found.push({ probe: child, issue: { reason: "special", entry: child } });
    }
  };
  walk(folder);
  if (found.length === 0) return null;
  const kept = new Set(ignoredInClone(clone, found.map((item) => item.probe)));
  return found.find((item) => !kept.has(item.probe))?.issue ?? null;
}

/** A path your own group's clone refuses, in the library's words
 * (environments-32), after the spec package's name. */
export function ownPathMessage(name: string, path: string, issue: OwnPathIssue): string {
  switch (issue.reason) {
    case "root": return `${name}: ${path} is not a folder below your own group's clone's root`;
    case "spex": return `${name}: ${path} is a path Spex keeps in your own group's clone`;
    case "ignored": return `${name}: ${path} is a path the clone's Git rules ignore, so it would not sync`;
    case "link": return `${name}: ${path} is reached through a link, which the clone's sync does not carry`;
    case "repository": return `${name}: ${path}: ${issue.entry} is a Git repository of its own, which the clone's sync does not carry`;
    case "ignored_file": return `${name}: ${path} holds ${issue.file}, which the clone's Git rules ignore, so it would not sync`;
    case "unshared_file": return `${name}: ${path} holds ${issue.file}, which the clone's sync refuses to share`;
    case "link_entry": return `${name}: ${path}: ${issue.entry} is a link, which the clone's sync does not carry`;
    case "special": return `${name}: ${path}: ${issue.entry} is no regular file or folder, so the clone's sync does not carry it`;
    case "unreadable": return `${name}: ${path}: ${issue.entry} cannot be inspected to confirm it syncs with the clone`;
  }
}

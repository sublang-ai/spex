// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// A spex repository's placements in its clone's Git configuration
// (storage-34, DR-128): each placement a remote, named by its instance's
// folder or `origin` for the one the reader names, with the host's id
// for that repository, and the core's creation of it while one is owed
// (git-host-7), in that remote's own section, so a remote's rename and
// its removal carry its id and its creation mark with it; and each
// placement with an instance named in a tracked file of its own,
// `placements/<folder>.yaml`, which every device holding it writes with
// the same bytes (storage-36, storage-41).

import { lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeApplicationBytes } from "./files.js";
import { i18n } from "./i18n.js";
import { instanceFolder, isInstanceFolder, parseOrigin } from "./instance.js";

/** The remote the reader names: the clone's one path placement, which
 * records no id (storage-34, space-5). */
export const PATH_PLACEMENT = "origin";

/** Where a Spex before DR-128 kept the host's id, and the core's
 * creation of that repository, at the top level of the clone's Git
 * configuration: read only for a clone the instances migration
 * deferred until its move (storage-34), and moved into a remote's
 * section otherwise. */
export const LEGACY_ID_KEY = "spex.repositoryId";
export const LEGACY_CREATED_KEY = "spex.created";

/** The key recording, in a placement's remote's own section, the host's
 * id for its repository (storage-34). */
export function placementIdKey(name: string): string {
  return `remote.${name}.spexId`;
}

/** The key recording, in a placement's remote's own section, the core's
 * creation of its repository until a check is done with its default
 * branch (git-host-7): on the clone, so a restarted core keeps it. */
export function placementCreatedKey(name: string): string {
  return `remote.${name}.spexCreated`;
}

/** What this device records of one placement in its preferences
 * (storage-5): its last completed sync (space-22) and the privacy notice
 * its reader saw before the first push there (space-57). */
export type PlacementPrefKind = "last" | "noticed";
export const PLACEMENT_PREF_KINDS: readonly PlacementPrefKind[] = ["last", "noticed"];

/** The preference holding one of a placement's records (storage-5):
 * `sync:<repository>:<placement>:<kind>`, `<placement>` the name of that
 * placement's remote (storage-34), so it follows the remote's rename. */
export function placementPrefKey(key: string, name: string, kind: PlacementPrefKind): string {
  return `sync:${key}:${name}:${kind}`;
}

/** Where a Spex before DR-128 kept that record, one per repository:
 * read as the clone's first placement's (storage-5). */
export function formerPlacementPrefKey(key: string, kind: PlacementPrefKind): string {
  return `sync:${key}:${kind}`;
}

/** One synchronous local Git command in a clone — a config read or
 * write, or a read of its history — by its exit and its output. */
export type ConfigRun = (args: string[]) => { ok: boolean; stdout: string };

/**
 * Move the host's id and the creation mark a clone records at the top
 * level of its Git configuration, as a Spex before DR-128 kept them,
 * into the section of its remote `name` (storage-34): each written there
 * first where that section holds none of its own, which then stands,
 * and only then removed from the top level, so no step loses it. With
 * no remote, `name` null, they are removed: a remote gone took its id.
 * A write Git refuses leaves that key at the top level for a later
 * attempt; returns whether every key moved.
 */
export function moveLegacyIds(run: ConfigRun, name: string | null): boolean {
  const read = (key: string): string | null => {
    const result = run(["config", "--get", key]);
    const value = result.ok ? result.stdout.trim() : "";
    return value.length > 0 ? value : null;
  };
  let moved = true;
  for (const [legacy, keyOf] of [[LEGACY_CREATED_KEY, placementCreatedKey], [LEGACY_ID_KEY, placementIdKey]] as const) {
    const value = read(legacy);
    if (value === null) continue;
    if (name !== null && read(keyOf(name)) === null && !run(["config", keyOf(name), value]).ok) {
      moved = false;
      continue;
    }
    run(["config", "--unset", legacy]);
  }
  return moved;
}

/** A placement as its clone's Git configuration holds it (storage-34):
 * its remote's name and URL, the host's id for its repository and the
 * core's creation of it while one is owed (git-host-7), and its
 * instance's origin — null for the path placement `origin`. */
export interface Placement {
  name: string;
  url: string;
  id: string | null;
  created: string | null;
  instance: string | null;
}

/** The keys one `git config -z --get-regexp` read of a clone's
 * placements takes: every remote's URL, id and creation mark, and the
 * id and mark a Spex before DR-128 kept at the top level. Git matches
 * them with the section and variable names lowercased. */
export const PLACEMENT_CONFIG_KEYS = "^(remote\\..+\\.(url|spexid|spexcreated)|spex\\.(repositoryid|created))$";

/** What resolves a placement's instance: the home's instances by their
 * folder (a listed one, or the origin it records) and by a key's folder. */
export interface PlacementHome {
  instanceByFolder(folder: string): { origin: string } | undefined;
  instanceOfKey(key: string): { origin: string } | undefined;
}

/** The origin the clone's placement file under an instance's folder
 * names (storage-36), if one reads (readPlacementFile); none where no
 * file is read. */
export type FiledOrigin = (folder: string) => string | undefined;
const NO_FILES: FiledOrigin = () => undefined;

/** A remote of the clone, as the read gives it, in the order its URL
 * first stands in the Git configuration. */
interface ConfiguredRemote { name: string; url: string; id: string | null; created: string | null }

/** The remotes and the top-level id and mark one read over
 * PLACEMENT_CONFIG_KEYS gives, from `git config -z --get-regexp`'s
 * output: each entry a key, a newline and its value, ended by NUL. A
 * remote's name may hold dots, as an instance's folder does, so it is
 * what lies between `remote.` and the last dot; a remote holding no URL
 * is none, and of several URLs its first is the one Git fetches. */
function configuredRemotes(output: string): { remotes: ConfiguredRemote[]; legacy: { id: string | null; created: string | null } } {
  const urls = new Map<string, string>();
  const ids = new Map<string, string>();
  const created = new Map<string, string>();
  const legacy: { id: string | null; created: string | null } = { id: null, created: null };
  for (const entry of output.split("\0")) {
    if (entry === "") continue;
    const at = entry.indexOf("\n");
    const key = at < 0 ? entry : entry.slice(0, at);
    const value = at < 0 ? "" : entry.slice(at + 1).trim();
    if (value === "") continue;
    if (key === "spex.repositoryid") { legacy.id = value; continue; }
    if (key === "spex.created") { legacy.created = value; continue; }
    if (!key.startsWith("remote.")) continue;
    const dot = key.lastIndexOf(".");
    const name = key.slice("remote.".length, dot);
    const variable = key.slice(dot + 1);
    if (name === "") continue;
    if (variable === "url") { if (!urls.has(name)) urls.set(name, value); }
    else if (variable === "spexid") ids.set(name, value);
    else if (variable === "spexcreated") created.set(name, value);
  }
  const remotes = [...urls].map(([name, url]) => ({ name, url, id: ids.get(name) ?? null, created: created.get(name) ?? null }));
  return { remotes, legacy };
}

/**
 * A clone's placements (storage-34), from one read over
 * PLACEMENT_CONFIG_KEYS: its remotes in the order its Git configuration
 * holds them — the order they were added, a rename keeping its place —
 * each named by an instance's folder that names an instance of the home
 * (`instanceByFolder`), else the instance the clone's placement file
 * under that folder names (`filed`), at most one per instance, then the
 * path placement `origin` last. A remote named by a folder neither
 * resolves, or by any other name, is no placement. A clone an
 * instances migration's receipt names deferred holds its remote,
 * whatever its name — the one named by its destination instance's
 * folder, else `origin`, else its first named by an instance's folder —
 * as its placement at the instance that entry names, with the id and
 * mark it records at the top level.
 */
export function placementsIn(output: string, key: string, home: PlacementHome, deferred: readonly { from: string; to: string }[], filed: FiledOrigin = NO_FILES): Placement[] {
  const { remotes, legacy } = configuredRemotes(output);
  const move = deferred.find((entry) => entry.from === key);
  const movedTo = move ? home.instanceOfKey(move.to)?.origin ?? null : null;
  let held: ConfiguredRemote | undefined;
  if (movedTo !== null) {
    const folder = folderOf(movedTo);
    held = remotes.find((remote) => remote.name === folder)
      ?? remotes.find((remote) => remote.name === PATH_PLACEMENT)
      ?? remotes.find((remote) => isInstanceFolder(remote.name));
  }
  const placements: Placement[] = [];
  const at = new Set<string>();
  let path: Placement | undefined;
  for (const remote of remotes) {
    if (remote === held && movedTo !== null) {
      if (at.has(movedTo)) continue;
      at.add(movedTo);
      placements.push({ name: remote.name, url: remote.url, id: legacy.id, created: legacy.created, instance: movedTo });
      continue;
    }
    if (remote.name === PATH_PLACEMENT) {
      path = { ...remote, instance: null };
      continue;
    }
    if (!isInstanceFolder(remote.name)) continue;
    const instance = home.instanceByFolder(remote.name)?.origin ?? filed(remote.name);
    if (instance === undefined || at.has(instance)) continue;
    at.add(instance);
    placements.push({ ...remote, instance });
  }
  return path ? [...placements, path] : placements;
}

/** A clone's placements as its Git configuration holds them at this
 * instant (placementsIn), read by one synchronous command; none where
 * Git finds no key or cannot read the configuration. */
export function readPlacements(run: ConfigRun, key: string, home: PlacementHome, deferred: readonly { from: string; to: string }[], filed: FiledOrigin = NO_FILES): Placement[] {
  const read = run(["config", "-z", "--get-regexp", PLACEMENT_CONFIG_KEYS]);
  return read.ok ? placementsIn(read.stdout, key, home, deferred, filed) : [];
}

/** A clone's key placement (storage-31): its first placement with an
 * instance, which its key follows; none for a clone holding only the
 * path placement, or none. */
export function keyPlacement(placements: readonly Placement[]): Placement | undefined {
  return placements.find((placement) => placement.instance !== null);
}

/** An instance's folder under `workspace/`, or none where its origin
 * cannot stand as one. */
function folderOf(origin: string): string | null {
  try { return instanceFolder(origin); } catch { return null; }
}

// -- placement files (storage-36, storage-41) ---------------------------------

/** The folder of a clone holding its placement files (storage-1). */
export const PLACEMENTS_DIR = "placements";

/** A placement file's path in its clone, by its instance's folder. */
export function placementFilePath(folder: string): string {
  return `${PLACEMENTS_DIR}/${folder}.yaml`;
}

/** A placement as its clone's tracked file names it (storage-36): the
 * folder its file is named by, its instance's origin and the host's id
 * for the repository there. */
export interface PlacementFile { folder: string; origin: string; id: string }

/** A placement file that names no placement (storage-41), by its path in
 * the clone and why. */
export interface PlacementFileProblem { file: string; reason: string }

/**
 * A placement file's bytes (storage-36): exactly the three lines
 * `format: 1`, `instance: "<origin>"` and `id: "<id>"`, each ending in a
 * newline, each value a JSON string, which YAML reads as written — the
 * same bytes on every device holding that placement, naming nothing of
 * the Git system behind the instance.
 */
export function encodePlacementFile(origin: string, id: string): string {
  return `format: 1\ninstance: ${JSON.stringify(origin)}\nid: ${JSON.stringify(id)}\n`;
}

const ENCODED = /^format: 1\ninstance: ("(?:[^"\\\n]|\\.)*")\nid: ("(?:[^"\\\n]|\\.)*")\n$/;

const notEncoded = (): string => i18n._({
  id: "does not read as format: 1, instance and id, one line each",
  comment: "Storage diagnostic: a placement file under placements/ holds something other than its three lines, so it names no placement",
});
const misnamed = (): string => i18n._({
  id: "its name is not the folder of the instance it names",
  comment: "Storage diagnostic: a placement file under placements/ is named for another instance than the one it records, so it names no placement",
});
const notAFolder = (): string => i18n._({
  id: "not a folder of placement files",
  comment: "Storage diagnostic: the clone's placements/ is a file or a link, so no placement file in it is read",
});

/**
 * The placement a file's bytes name, given the folder its file is named
 * by (storage-41): its instance's canonical origin and the host's id,
 * where the bytes are exactly that encoding (encodePlacementFile) and
 * the origin's instance folder is the file's name; else why it names
 * none.
 */
export function parsePlacementFile(text: string, folder: string): { origin: string; id: string } | { problem: string } {
  const matched = ENCODED.exec(text);
  let origin: unknown;
  let id: unknown;
  try {
    origin = matched ? JSON.parse(matched[1]) : undefined;
    id = matched ? JSON.parse(matched[2]) : undefined;
  } catch { return { problem: notEncoded() }; }
  if (typeof origin !== "string" || typeof id !== "string" || id.trim() === "" || encodePlacementFile(origin, id) !== text) return { problem: notEncoded() };
  let canonical: string;
  try { canonical = parseOrigin(origin).origin; } catch { return { problem: notEncoded() }; }
  if (canonical !== origin) return { problem: notEncoded() };
  return instanceFolder(origin) === folder ? { origin, id } : { problem: misnamed() };
}

/** What stands at a path of a clone, read without following a link. */
function kindAt(path: string): "absent" | "file" | "directory" | "other" {
  const info = lstatSync(path, { throwIfNoEntry: false });
  if (!info) return "absent";
  return info.isFile() ? "file" : info.isDirectory() ? "directory" : "other";
}

/**
 * A clone's placement files as they stand at this instant (storage-41),
 * read with no reload, no link followed: each `placements/<name>.yaml`
 * reading as its encoding under its instance's folder names that
 * placement; any other file there named `.yaml`, and a `placements` that
 * is no folder, is a problem, naming none and blocking nothing else
 * (storage-12).
 */
export function readPlacementFiles(dir: string): { files: PlacementFile[]; problems: PlacementFileProblem[] } {
  const files: PlacementFile[] = [];
  const problems: PlacementFileProblem[] = [];
  const kind = kindAt(join(dir, PLACEMENTS_DIR));
  if (kind === "absent") return { files, problems };
  if (kind !== "directory") return { files, problems: [{ file: PLACEMENTS_DIR, reason: notAFolder() }] };
  let names: string[];
  try { names = readdirSync(join(dir, PLACEMENTS_DIR)).sort(); }
  catch { return { files, problems: [{ file: PLACEMENTS_DIR, reason: notAFolder() }] }; }
  for (const name of names) {
    if (!name.endsWith(".yaml")) continue;
    const folder = name.slice(0, -".yaml".length);
    const read = readOne(dir, folder);
    if (read === null) continue;
    if ("problem" in read) problems.push({ file: placementFilePath(folder), reason: read.problem });
    else files.push({ folder, ...read });
  }
  return { files, problems };
}

/** One placement file's placement, read as readPlacementFiles reads it,
 * or why it names none; null where no file stands. */
function readOne(dir: string, folder: string): { origin: string; id: string } | { problem: string } | null {
  const path = join(dir, PLACEMENTS_DIR, `${folder}.yaml`);
  const kind = kindAt(path);
  if (kind === "absent") return null;
  if (kind !== "file") return { problem: notEncoded() };
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { return { problem: notEncoded() }; }
  return parsePlacementFile(text, folder);
}

/** The placement the clone's file under an instance's folder names, as
 * it stands at this instant (storage-41); none where no file stands
 * there, `placements` is no folder, or the file names none. */
export function readPlacementFile(dir: string, folder: string): PlacementFile | undefined {
  if (kindAt(join(dir, PLACEMENTS_DIR)) !== "directory") return undefined;
  const read = readOne(dir, folder);
  return read !== null && !("problem" in read) ? { folder, ...read } : undefined;
}

/** The origins a clone's placement files name, read when a placement
 * read asks for one (placementsIn). */
export function filedIn(dir: string): FiledOrigin {
  return (folder) => readPlacementFile(dir, folder)?.origin;
}

/**
 * Write the clone's placement file at an instance (storage-36): its
 * bytes (encodePlacementFile) at `placements/<folder>.yaml`, `<folder>`
 * that instance's folder, replacing what the clone holds at that path as
 * it reads at this instant, a file already holding those bytes left as
 * it is. The clone must stand — a write never makes again a clone that
 * moved or was removed (DR-111) — and its `placements` is made where
 * missing; a link or a non-folder on the way refuses the write.
 */
export function writePlacementFile(dir: string, origin: string, id: string): void {
  const folder = instanceFolder(origin);
  const bytes = encodePlacementFile(origin, id);
  if (kindAt(dir) !== "directory") throw new Error(`${dir} is not a clone standing here`);
  const parent = join(dir, PLACEMENTS_DIR);
  const kind = kindAt(parent);
  if (kind === "absent") mkdirSync(parent, { mode: 0o700 });
  else if (kind !== "directory") throw new Error(`${parent} is not a folder`);
  const path = join(parent, `${folder}.yaml`);
  if (kindAt(path) === "file") {
    try { if (readFileSync(path, "utf8") === bytes) return; } catch { /* written below */ }
  }
  writeApplicationBytes(path, bytes);
}

/** Delete the clone's placement file under an instance's folder
 * (storage-36), a link standing there removed as itself; nothing where
 * none stands, `placements` is no folder, or a folder stands there. */
export function deletePlacementFile(dir: string, folder: string): void {
  if (kindAt(join(dir, PLACEMENTS_DIR)) !== "directory") return;
  const path = join(dir, PLACEMENTS_DIR, `${folder}.yaml`);
  const kind = kindAt(path);
  if (kind === "directory" || kind === "absent") return;
  rmSync(path, { force: true });
}

/** Whether any commit reachable from the clone's `spex` has held its
 * placement file under an instance's folder (storage-37), by one
 * synchronous local Git read. */
export function placementFileEverHeld(run: ConfigRun, folder: string): boolean {
  const read = run(["log", "-1", "--format=%H", "refs/heads/spex", "--", placementFilePath(folder)]);
  return read.ok && read.stdout.trim() !== "";
}

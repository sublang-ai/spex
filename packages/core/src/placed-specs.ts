// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// What a release provides and where a provided spec stands, as the core
// reads them (environments-1, environments-14, environments-41,
// spec-view-10, DR-174): the artifacts a manifest provides, the record
// of placed specs an install keeps at `<root>/.spex/placed.json`, the
// marker line a placed spec opens with, and where each provided spec of
// a lock stands under a project's `specs/`. Each follows the package
// manager library's rule of the same name, so the core, the command line
// and an install agree; the library's own exports take their place once
// they are published with it.

import { lstatSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  installedDir,
  isPackageName,
  isVersion,
  packageRoot,
  parseManifestText,
  resolutionVersion,
  SPEX_DIR,
  type ArtifactKind,
  type Lock,
  type Manifest,
} from "@sublang/spex/environment";
import { isObject, sha256 } from "@sublang/spex/files";

// ---------------------------------------------------------------------------
// What a release provides
// ---------------------------------------------------------------------------

/** The ids of the artifacts a release provides (environments-1): each
 * whose kind `provides` lists — every kind where it is absent — save a
 * sibling's support: one a sibling names in `from`, or one a sibling of
 * another kind names in `requires`. A playbook a playbook requires, or a
 * skill a skill requires, is a peer and stays provided. */
export function providedArtifacts(manifest: Manifest & { provides?: readonly ArtifactKind[] }): Set<string> {
  const kinds = manifest.provides !== undefined ? new Set<string>(manifest.provides) : null;
  const support = new Set<string>();
  for (const [id, artifact] of Object.entries(manifest.artifacts)) {
    if (artifact.from !== undefined && artifact.from !== id) support.add(artifact.from);
    for (const required of artifact.requires) {
      const kind = manifest.artifacts[required]?.kind;
      if (required !== id && kind !== undefined && kind !== artifact.kind) support.add(required);
    }
  }
  const provided = new Set<string>();
  for (const [id, artifact] of Object.entries(manifest.artifacts)) {
    if ((kinds === null || kinds.has(artifact.kind)) && !support.has(id)) provided.add(id);
  }
  return provided;
}

// ---------------------------------------------------------------------------
// The record of placed specs
// ---------------------------------------------------------------------------

/** The placed specs' record under `<root>/.spex/` (environments-41). */
export const PLACED_RECORD = "placed.json";

/** One placed spec: its path from the root, the version of the release
 * it was derived from, the SHA-256 in hex of the bytes the install wrote,
 * and each package `<org>/<pkg>` its links wait for with their count. */
export interface PlacedSpec {
  path: string;
  version: string;
  sha256: string;
  waiting: Record<string, number>;
}

/** The record of placed specs, keyed by spec package `<org>/<pkg>`. */
export interface PlacedRecord {
  format: 1;
  specs: Record<string, PlacedSpec>;
}

function placedSpec(value: unknown): PlacedSpec | null {
  if (!isObject(value)) return null;
  const { path, version, sha256: digest, waiting } = value;
  if (typeof path !== "string" || typeof version !== "string" || typeof digest !== "string" || !isObject(waiting)) return null;
  const counts = Object.entries(waiting);
  if (!counts.every(([, count]) => typeof count === "number" && Number.isInteger(count) && count >= 0)) return null;
  return { path, version, sha256: digest, waiting: Object.fromEntries(counts) as Record<string, number> };
}

/** The root's record of placed specs, or null where none reads: a
 * missing or unreadable file, one that is no JSON, a format other than 1,
 * or any entry of another shape — so a reader never takes for placed
 * what the record does not vouch for. */
export function readPlacedRecord(root: string): PlacedRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(root, SPEX_DIR, PLACED_RECORD), "utf8"));
  } catch {
    return null;
  }
  if (!isObject(value) || value.format !== 1 || !isObject(value.specs)) return null;
  const specs: [string, PlacedSpec][] = [];
  for (const [name, entry] of Object.entries(value.specs)) {
    const spec = placedSpec(entry);
    if (spec === null) return null;
    specs.push([name, spec]);
  }
  return { format: 1, specs: Object.fromEntries(specs) };
}

// ---------------------------------------------------------------------------
// The marker line
// ---------------------------------------------------------------------------

const MARKER = /^<!-- Placed by Spex from (\S+) (\S+); an edit makes this file yours\. -->$/;

/** The package and version the marker on `text`'s first line names, a
 * byte order mark and a carriage return disregarded; null for any other
 * first line (environments-41). */
export function readPlacedMarker(text: string): { name: string; version: string } | null {
  const end = text.indexOf("\n");
  const first = (end === -1 ? text : text.slice(0, end)).replace(/^﻿/, "").replace(/\r$/, "");
  const match = MARKER.exec(first);
  if (match === null) return null;
  const [, name, version] = match as unknown as [string, string, string];
  return isPackageName(name) && isVersion(version) ? { name, version } : null;
}

// ---------------------------------------------------------------------------
// Where each provided spec stands
// ---------------------------------------------------------------------------

/** Where a provided spec stands under a project's `specs/`
 * (environments-41): placed at its path, edited there, blocked by a file
 * of its name, or waiting for `specs/` where the root holds none. */
export type SpecState = "placed" | "edited" | "blocked" | "no-specs";

export interface SpecPlacement {
  /** The spec package, `<org>/<pkg>`. */
  name: string;
  /** Its path from the root, `specs/packages/<pkg>.md`. */
  path: string;
  state: SpecState;
  /** Each package the copy's links wait for, with their count, in name
   * order. */
  waiting: { name: string; count: number }[];
  /** For an edited copy, the release's version where its marker names
   * another: the newer release waiting under `.spex/`. */
  waitingVersion?: string;
}

const SPECS = "specs";
/** What stands at a path that is no regular file. */
const NOT_A_FILE = "";

const placedSpecPath = (id: string): string => `${SPECS}/packages/${id}.md`;

function isDirectory(path: string): boolean {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

function isFile(path: string): boolean {
  try { return lstatSync(path).isFile(); } catch { return false; }
}

/** The SHA-256 of the regular file at a root's path; null where nothing
 * stands there, `NOT_A_FILE` where anything else does. */
function standingDigest(root: string, path: string): string | null {
  const file = join(root, ...path.split("/"));
  try {
    if (!lstatSync(file).isFile()) return NOT_A_FILE;
    return sha256(readFileSync(file));
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? null : NOT_A_FILE;
  }
}

function standingMarker(root: string, path: string): { name: string; version: string } | null {
  const file = join(root, ...path.split("/"));
  try { return lstatSync(file).isFile() ? readPlacedMarker(readFileSync(file, "utf8")) : null; } catch { return null; }
}

function waitingList(waiting: Record<string, number>): { name: string; count: number }[] {
  return Object.keys(waiting).sort().map((name) => ({ name, count: waiting[name]! }));
}

/**
 * Where each provided spec of a lock stands under a project's root
 * (environments-14, environments-41), in name order, read from the files,
 * their marker lines and the record of placed specs, writing nothing:
 *
 * 1. a spec whose package's files are not here as the lock locks them is
 *    left out, its recorded copy holding its path;
 * 2. where the root holds no `specs/`, each waits for it;
 * 3. of the specs claiming one `specs/packages/<pkg>.md`, the first by
 *    name takes it, a later one — or one whose path a recorded copy of a
 *    package whose files are not here holds — reading blocked; a recorded
 *    copy its package no longer claims leaves at the next install while it
 *    holds the bytes recorded, so it holds no path;
 * 4. a file at the path holding neither the bytes recorded nor a marker
 *    naming the spec's package blocks it;
 * 5. the bytes recorded read placed, the links waiting as the record
 *    counts them; other bytes under the package's marker read placed
 *    where the marker names the locked release and the record, if any,
 *    another — the copy a fresh clone or another device committed — and
 *    edited otherwise, the release's version waiting where the marker
 *    names another;
 * 6. a spec with no file standing yet is left out: the install writes it.
 *
 * The library derives each spec's bytes to tell a committed copy from an
 * edit in step 5; the core reads the marker's version there.
 */
export function readSpecPlacements(root: string, lock: Lock, pathRoot: string | null): SpecPlacement[] {
  const sources: { name: string; id: string; version: string }[] = [];
  const unread = new Set<string>();
  for (const name of Object.keys(lock.packages).sort()) {
    const resolution = lock.packages[name]!;
    const dir = packageRoot(name, resolution, installedDir(root), pathRoot);
    let manifest: Manifest | null = null;
    try { manifest = dir === null ? null : parseManifestText(readFileSync(join(dir, "meta.yaml"), "utf8")).manifest; } catch { manifest = null; }
    const locked = resolutionVersion(resolution);
    if (dir === null || manifest === null || (locked !== undefined && manifest.version !== locked)) {
      unread.add(name);
      continue;
    }
    const provided = providedArtifacts(manifest);
    for (const id of [...new Set(Object.values(resolution.exports))].sort()) {
      const language = resolution.artifacts[id]?.language;
      if (manifest.artifacts[id]?.kind !== "spec" || !provided.has(id) || !language) continue;
      if (isFile(join(dir, "specs", language, `${id}.md`))) sources.push({ name, id, version: locked ?? manifest.version });
      else unread.add(name);
    }
  }
  if (!isDirectory(join(root, SPECS))) return sources.map(({ name, id }) => ({ name, path: placedSpecPath(id), state: "no-specs", waiting: [] }));

  const previous = readPlacedRecord(root)?.specs ?? {};
  const names = new Set(sources.map((source) => source.name));
  const held = new Map<string, string>();
  for (const name of Object.keys(previous).sort()) {
    if (unread.has(name) && !names.has(name)) held.set(previous[name]!.path, name);
  }
  const claims = new Map<string, string>();
  const blocked = new Set<string>();
  for (const source of sources) {
    const path = placedSpecPath(source.id);
    if (claims.has(path) || held.has(path)) blocked.add(source.name);
    else claims.set(path, source.name);
  }
  const gone = new Set<string>();
  for (const name of Object.keys(previous).sort()) {
    const entry = previous[name]!;
    if (held.get(entry.path) === name || claims.get(entry.path) === name) continue;
    if (standingDigest(root, entry.path) === entry.sha256) gone.add(entry.path);
  }
  const out: SpecPlacement[] = [];
  for (const source of sources) {
    const path = placedSpecPath(source.id);
    if (blocked.has(source.name)) {
      out.push({ name: source.name, path, state: "blocked", waiting: [] });
      continue;
    }
    const digest = gone.has(path) ? null : standingDigest(root, path);
    if (digest === null) continue;
    const entry = previous[source.name];
    const recorded = entry !== undefined && entry.path === path ? entry : null;
    if (digest === recorded?.sha256) {
      out.push({ name: source.name, path, state: "placed", waiting: waitingList(recorded.waiting) });
      continue;
    }
    const marker = standingMarker(root, path);
    if (marker?.name !== source.name) {
      out.push({ name: source.name, path, state: "blocked", waiting: [] });
    } else if (marker.version === source.version && recorded?.version !== source.version) {
      out.push({ name: source.name, path, state: "placed", waiting: [] });
    } else {
      out.push({ name: source.name, path, state: "edited", waiting: [], ...(marker.version !== source.version ? { waitingVersion: source.version } : {}) });
    }
  }
  return out;
}

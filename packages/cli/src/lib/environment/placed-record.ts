// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The install record of placed specs (environments-41, lint-9, DR-174):
// at `<root>/.spex/placed.json`, each provided spec an install placed
// under the root's `specs/`, by its spec package, with the path it
// stands at, the release's version, the SHA-256 of its derivation and
// the packages its links wait for — so an install knows its own copy
// from an edited one, and the linter a placed spec from the project's
// own. An install writes it whole, atomically, as compact JSON.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { writeApplicationBytes } from "../files.js";
import { SPEX_DIR } from "./layout.js";

/** The placed specs' record, beside the installed packages under
 * `<root>/.spex/` (environments-26). */
export const PLACED_RECORD = "placed.json";

/** One placed spec: its path from the root, `specs/packages/<pkg>.md`,
 * the version of the release it was derived from, the SHA-256 in hex of
 * the derivation — the LF text an install writes there, which a copy's
 * text, CRLF read as LF, still hashes to — and each package `<org>/<pkg>`
 * its links wait for with their count (environments-41). */
export type PlacedSpec = {
  path: string;
  version: string;
  sha256: string;
  waiting: Record<string, number>;
};

/** The record of placed specs, keyed by spec package `<org>/<pkg>`. */
export type PlacedRecord = {
  format: 1;
  specs: Record<string, PlacedSpec>;
};

/** `<root>/.spex/placed.json`. */
export function placedRecordPath(root: string): string {
  return join(root, SPEX_DIR, PLACED_RECORD);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function placedSpec(value: unknown): PlacedSpec | null {
  if (!isObject(value)) return null;
  const { path, version, sha256, waiting } = value;
  if (typeof path !== "string" || typeof version !== "string" || typeof sha256 !== "string" || !isObject(waiting)) return null;
  const counts = Object.entries(waiting);
  if (!counts.every(([, count]) => typeof count === "number" && Number.isInteger(count) && count >= 0)) return null;
  return { path, version, sha256, waiting: Object.fromEntries(counts) as Record<string, number> };
}

/** The root's record of placed specs, or null where none reads: a
 * missing or unreadable file, one that is no JSON, a format other than 1,
 * or an entry of another shape — so a reader never takes for placed what
 * the record does not vouch for. */
export function readPlacedRecord(root: string): PlacedRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(placedRecordPath(root), "utf8"));
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

/** The record's bytes as an install writes them: compact JSON, its
 * specs in name order. */
export function serializePlacedRecord(record: PlacedRecord): string {
  const specs = Object.keys(record.specs).sort().map((name): [string, PlacedSpec] => {
    const { path, version, sha256, waiting } = record.specs[name]!;
    const counts = Object.keys(waiting).sort().map((other): [string, number] => [other, waiting[other]!]);
    return [name, { path, version, sha256, waiting: Object.fromEntries(counts) }];
  });
  return JSON.stringify({ format: 1, specs: Object.fromEntries(specs) });
}

/** Write the root's record of placed specs whole, through a temporary
 * file renamed into place, so a reader never finds it half-written.
 * `<root>/.spex/` must stand. */
export function writePlacedRecord(root: string, record: PlacedRecord): void {
  writeApplicationBytes(placedRecordPath(root), serializePlacedRecord(record));
}

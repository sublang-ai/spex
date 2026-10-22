// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The seats store (storage-45, DR-133): each seat this desktop opened on
// a team server, in `local/seats.yaml`, exactly
// `{format: 1, seats: {<instance origin>#<server id>: {name, group,
// endpoint, bearer, leaseExpiresAt}}}`, written atomically with
// owner-only permissions under a `local/` made owner-only. Each write is
// a versioned write of one seat, as the app token's file is
// (storage-19): the file is read, that seat's entry compared with the one
// the writer read, and the file replaced only where they are equal, every
// other seat kept and the file removed with the last one. A file of
// another format is refused and left as it is. Every access is
// synchronous, so a write's read, comparison and rename leave no await
// between them. The bearer and the endpoint are secrets: no message this
// module composes carries either, nor a seat's key beyond its file.

import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { writeApplicationBytes } from "./files.js";
import { canonicalOrigin } from "./instance.js";

/** One seat as its file holds it (storage-45): its server's name and
 * group, the endpoint and the bearer the server's admission answered, and
 * the lease's expiry in Unix milliseconds. */
export interface SeatEntry { name: string; group: string; endpoint: string; bearer: string; leaseExpiresAt: number }

/** The path of the seats file under a home (storage-1). */
export function seatsPath(homeDir: string): string {
  return join(homeDir, "local", "seats.yaml");
}

/**
 * A seat's place (DR-133): the key its file holds it under,
 * `<instance origin>#<server id>`, the instance's origin canonical
 * (storage-2). A place is shown by its server's name; this key names it
 * in the protocol.
 */
export function placeOf(origin: string, serverId: string): string {
  return `${canonicalOrigin(origin)}#${serverId}`;
}

/** The instance and the server a place names; null where it names none.
 * An origin holds no `#`, so the first one ends it. */
export function splitPlace(place: string): { origin: string; serverId: string } | null {
  const at = place.indexOf("#");
  if (at <= 0 || at === place.length - 1) return null;
  const origin = place.slice(0, at);
  try {
    if (canonicalOrigin(origin) !== origin) return null;
  } catch {
    return null;
  }
  return { origin, serverId: place.slice(at + 1) };
}

export interface SeatStore {
  /** Every well-formed seat the file holds, by place, in its order; a
   * malformed entry is left out and left as it is. A file of another
   * format, or one that will not read, throws. */
  list(): Map<string, SeatEntry>;
  /** The seat at a place, or null; a malformed entry there throws. */
  read(place: string): SeatEntry | null;
  /**
   * A versioned write of one seat (storage-45): `next`, or none, in
   * place of `expected`, the entry the writer read, or none. False, and
   * nothing written, where the file holds another entry there.
   */
  replace(place: string, expected: SeatEntry | null, next: SeatEntry | null): boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An entry as its fields read, or null where it is malformed. */
function entryFrom(value: unknown): SeatEntry | null {
  if (!isRecord(value)) return null;
  const { name, group, endpoint, bearer, leaseExpiresAt } = value;
  if (typeof name !== "string" || typeof group !== "string" || typeof endpoint !== "string" || typeof bearer !== "string") return null;
  if (typeof leaseExpiresAt !== "number" || !Number.isFinite(leaseExpiresAt)) return null;
  if (endpoint.length === 0 || bearer.length === 0) return null;
  return { name, group, endpoint, bearer, leaseExpiresAt };
}

/** Whether two entries are one, compared in every field. */
function sameEntry(a: SeatEntry | null, b: SeatEntry | null): boolean {
  if (a === null || b === null) return a === b;
  return a.name === b.name && a.group === b.group && a.endpoint === b.endpoint && a.bearer === b.bearer && a.leaseExpiresAt === b.leaseExpiresAt;
}

interface SeatsFile { format: 1; seats: Record<string, unknown> }

/** The seats file of a home (storage-45). */
export function fileSeatStore(homeDir: string): SeatStore {
  const dir = join(homeDir, "local");
  const file = seatsPath(homeDir);

  function load(): SeatsFile | null {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    let doc: unknown;
    try {
      doc = parseYaml(text);
    } catch {
      throw new Error(`${file} is not valid YAML; it is left as it is`);
    }
    if (!isRecord(doc)) throw new Error(`${file} holds no seats map; it is left as it is`);
    if (doc.format !== 1) {
      throw new Error(`${file} has format ${JSON.stringify(doc.format ?? null)}, which this version of Spex does not read; it is left as it is`);
    }
    if (!isRecord(doc.seats)) throw new Error(`${file} has no seats map; it is left as it is`);
    return { format: 1, seats: { ...doc.seats } };
  }

  function entryAt(doc: SeatsFile | null, place: string): SeatEntry | null {
    const value = doc?.seats[place];
    if (value === undefined) return null;
    const entry = entryFrom(value);
    // The place alone is named: never a field, which may hold a secret.
    if (entry === null) throw new Error(`${file} holds a malformed seat for ${place}; it is left as it is`);
    return entry;
  }

  return {
    list: () => {
      const doc = load();
      const seats = new Map<string, SeatEntry>();
      for (const [place, value] of Object.entries(doc?.seats ?? {})) {
        const entry = entryFrom(value);
        if (entry !== null && splitPlace(place) !== null) seats.set(place, entry);
      }
      return seats;
    },
    read: (place) => entryAt(load(), place),
    replace: (place, expected, next) => {
      const doc = load() ?? { format: 1, seats: {} };
      if (!sameEntry(entryAt(doc, place), expected)) return false;
      if (next === null) {
        if (!(place in doc.seats)) return true;
        delete doc.seats[place];
      } else {
        doc.seats[place] = { name: next.name, group: next.group, endpoint: next.endpoint, bearer: next.bearer, leaseExpiresAt: next.leaseExpiresAt };
      }
      if (Object.keys(doc.seats).length === 0) {
        rmSync(file, { force: true });
        return true;
      }
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeApplicationBytes(file, stringifyYaml({ format: 1, seats: doc.seats }));
      return true;
    },
  };
}

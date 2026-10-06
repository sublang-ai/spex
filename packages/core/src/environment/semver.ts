// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Versions and version requirements (environments-4, DR-104): Semantic
// Versioning 2.0.0 precedence with build metadata ignored, and exactly
// three requirement forms — exact, caret and tilde — on a full version.
// A prerelease satisfies a requirement only when the requirement itself
// names a prerelease of the same major.minor.patch.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers; numeric ones as numbers. */
  prerelease: (string | number)[];
  build: string[];
  raw: string;
}

export type RequirementOp = "exact" | "caret" | "tilde";

export interface Requirement {
  op: RequirementOp;
  version: Version;
  raw: string;
}

const NUMERIC = "0|[1-9]\\d*";
const PRERELEASE_ID = `(?:${NUMERIC}|\\d*[a-zA-Z-][0-9a-zA-Z-]*)`;
const VERSION_SOURCE =
  `(${NUMERIC})\\.(${NUMERIC})\\.(${NUMERIC})` +
  `(?:-(${PRERELEASE_ID}(?:\\.${PRERELEASE_ID})*))?` +
  `(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?`;
const VERSION_RE = new RegExp(`^${VERSION_SOURCE}$`);
const REQUIREMENT_RE = new RegExp(`^([\\^~]?)(${VERSION_SOURCE})$`);

/** The longest requirement string the registry accepts (spex.pub DR-013). */
export const MAX_REQUIREMENT_BYTES = 256;

export class VersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VersionError";
  }
}

function toNumber(text: string, raw: string): number {
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new VersionError(`version ${raw} has a component too large`);
  return value;
}

/** Parse a Semantic Versioning 2.0.0 version, or throw. */
export function parseVersion(text: string): Version {
  const match = typeof text === "string" ? VERSION_RE.exec(text) : null;
  if (!match) throw new VersionError(`"${String(text)}" is not a Semantic Versioning 2.0.0 version`);
  return {
    major: toNumber(match[1]!, text),
    minor: toNumber(match[2]!, text),
    patch: toNumber(match[3]!, text),
    prerelease: match[4]
      ? match[4].split(".").map((id) => (/^\d+$/.test(id) ? toNumber(id, text) : id))
      : [],
    build: match[5] ? match[5].split(".") : [],
    raw: text,
  };
}

export function isVersion(text: unknown): text is string {
  if (typeof text !== "string") return false;
  try { parseVersion(text); return true; } catch { return false; }
}

function asVersion(value: string | Version): Version {
  return typeof value === "string" ? parseVersion(value) : value;
}

function compareIds(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "number") return -1;
  if (typeof b === "number") return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Precedence: negative when a < b, zero when equal, build ignored. */
export function compareVersions(a: string | Version, b: string | Version): number {
  const x = asVersion(a);
  const y = asVersion(b);
  if (x.major !== y.major) return Math.sign(x.major - y.major);
  if (x.minor !== y.minor) return Math.sign(x.minor - y.minor);
  if (x.patch !== y.patch) return Math.sign(x.patch - y.patch);
  if (x.prerelease.length === 0 || y.prerelease.length === 0) {
    return Math.sign(y.prerelease.length - x.prerelease.length);
  }
  for (let i = 0; i < Math.min(x.prerelease.length, y.prerelease.length); i += 1) {
    const order = compareIds(x.prerelease[i]!, y.prerelease[i]!);
    if (order !== 0) return Math.sign(order);
  }
  return Math.sign(x.prerelease.length - y.prerelease.length);
}

/** Parse one of `1.2.3`, `^1.2.3` or `~1.2.3`, or throw. */
export function parseRequirement(text: string): Requirement {
  if (typeof text !== "string") throw new VersionError(`a version requirement must be a string`);
  if (Buffer.byteLength(text, "utf8") > MAX_REQUIREMENT_BYTES || !/^[\x20-\x7e]*$/.test(text)) {
    throw new VersionError(`"${text}" is not a version requirement`);
  }
  const match = REQUIREMENT_RE.exec(text);
  if (!match) throw new VersionError(`"${text}" is not a version requirement: use 1.2.3, ^1.2.3 or ~1.2.3`);
  const op: RequirementOp = match[1] === "^" ? "caret" : match[1] === "~" ? "tilde" : "exact";
  return { op, version: parseVersion(match[2]!), raw: text };
}

export function isRequirement(text: unknown): text is string {
  if (typeof text !== "string") return false;
  try { parseRequirement(text); return true; } catch { return false; }
}

function sameCore(a: Version, b: Version): boolean {
  return a.major === b.major && a.minor === b.minor && a.patch === b.patch;
}

function core(major: number, minor: number, patch: number): Version {
  return { major, minor, patch, prerelease: [], build: [], raw: `${major}.${minor}.${patch}` };
}

/** Whether a version satisfies a requirement (environments-4). */
export function satisfies(version: string | Version, requirement: string | Requirement): boolean {
  const v = asVersion(version);
  const req = typeof requirement === "string" ? parseRequirement(requirement) : requirement;
  const base = req.version;
  if (v.prerelease.length > 0 && !(base.prerelease.length > 0 && sameCore(v, base))) return false;
  if (req.op === "exact") return compareVersions(v, base) === 0;
  if (compareVersions(v, base) < 0) return false;
  const upper =
    req.op === "tilde" ? core(base.major, base.minor + 1, 0)
      : base.major > 0 ? core(base.major + 1, 0, 0)
        : base.minor > 0 ? core(0, base.minor + 1, 0)
          : core(0, 0, base.patch + 1);
  return compareVersions(v, upper) < 0;
}

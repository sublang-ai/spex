// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The marker a placed spec opens with (environments-41, lint-9,
// spec-view-10, DR-174): one comment line naming the spec package and
// the version the install derived the file from, so a reader, the
// linter and the spec view know a placed spec from the project's own
// without the install record, which a fresh clone lacks.

import { isPackageName } from "./format.js";
import { isVersion } from "./semver.js";

/** The first line of a placed spec, derived from `<org>/<pkg>` at
 * `version` (environments-41). */
export function placedMarker(name: string, version: string): string {
  return `<!-- Placed by Spex from ${name} ${version}; an edit makes this file yours. -->`;
}

const MARKER = /^<!-- Placed by Spex from (\S+) (\S+); an edit makes this file yours\. -->$/;

/** The package and version a file's first line names where it is the
 * marker, a byte order mark and a carriage return disregarded; null for
 * any other line. */
export function parsePlacedMarker(firstLine: string): { name: string; version: string } | null {
  const match = MARKER.exec(firstLine.replace(/^﻿/, "").replace(/\r$/, ""));
  if (match === null) return null;
  const [, name, version] = match as unknown as [string, string, string];
  return isPackageName(name) && isVersion(version) ? { name, version } : null;
}

/** The marker on `text`'s first line, if any. */
export function readPlacedMarker(text: string): { name: string; version: string } | null {
  const end = text.indexOf("\n");
  return parsePlacedMarker(end === -1 ? text : text.slice(0, end));
}

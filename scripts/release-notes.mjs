#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// Extract one version's section from a Keep a Changelog file
// (RELEASE-3). Both release channels share this: the CLI's workflow
// runs on Linux and the app's on macOS, whose sed dialects differ, so
// the extraction lives in one tested place instead of two one-liners.
//
//   node scripts/release-notes.mjs <changelog> <version> [out]
//
// Prints the section to stdout, and writes it to `out` when given.
// Exits non-zero when the version has no section or an empty one, so
// a release cannot ship with silent or missing notes.

import { readFileSync, writeFileSync } from "node:fs";

const [, , changelogPath, version, outPath] = process.argv;
if (!changelogPath || !version) {
  process.stderr.write(
    "usage: release-notes.mjs <changelog> <version> [out]\n",
  );
  process.exit(2);
}

const lines = readFileSync(changelogPath, "utf8").split(/\r?\n/);
const isHeading = (line) => /^## /.test(line);
const isTarget = (line) =>
  // `## [1.2.3] - 2026-07-27`, `## [1.2.3]`, or `## 1.2.3`
  new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}\\]?(\\s|$)`).test(line);

const start = lines.findIndex(isTarget);
if (start === -1) {
  process.stderr.write(
    `::error::No release notes found for version ${version} in ${changelogPath}\n`,
  );
  process.exit(1);
}
let end = start + 1;
while (end < lines.length && !isHeading(lines[end])) end += 1;

const body = lines.slice(start + 1, end).join("\n").trim();
if (body === "") {
  process.stderr.write(
    `::error::Release notes for version ${version} in ${changelogPath} are empty\n`,
  );
  process.exit(1);
}

const text = `${body}\n`;
process.stdout.write(text);
if (outPath) writeFileSync(outPath, text);

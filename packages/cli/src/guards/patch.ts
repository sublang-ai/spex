// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: a kept fault's patch. It is a unified diff
 * as `git diff` writes it, changing existing files. Spex reads and
 * applies it itself, with no `git`: each change goes at its stated
 * line, else at the nearest place where its lines match. Lines
 * compare ignoring a trailing CR, and a file keeps its own line
 * endings.
 */

import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { GuardError } from "./types.js";

/** One line of a change: kept (` `), taken out (`-`) or put in (`+`). */
export type PatchLine = { kind: " " | "-" | "+"; text: string; noNewline: boolean };

/** One `@@` block. `line` is the 1-based line it states for the file
 * before the change. */
export type Hunk = { line: number; lines: PatchLine[] };

/** The changes to one file. `path` is relative to the root, with `/`. */
export type FilePatch = { path: string; hunks: Hunk[] };

/** A parsed patch. The text before its first file is a description
 * for people and is not read. */
export type Patch = { files: FilePatch[] };

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** The path a `--- ` or `+++ ` line names; `line` is that line's
 * number, for the error. */
function patchPath(raw: string, line: number): string | null {
  const path = raw.split("\t")[0].trim();
  if (path === "/dev/null") return null;
  if (path.startsWith('"')) {
    throw new GuardError(`line ${line}: the path ${path} has characters a kept fault's patch cannot name`);
  }
  return path;
}

/** A patch's file name without its first folder, where that folder
 * is one character long: the prefix `git diff` writes. */
function unprefixed(name: string): string {
  return name[1] === "/" ? name.slice(2) : name;
}

/**
 * Read a unified diff. Throws a GuardError, naming the line, when the
 * text is not one, when it adds, removes, renames or names a file
 * twice, changes a binary file or names a path outside the root, or
 * when a change has more or fewer lines than its header counts.
 */
export function parsePatch(text: string): Patch {
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (lines[lines.length - 1] === "") lines.pop();
  let at = lines.findIndex((line) => line.startsWith("diff --git ") || line.startsWith("--- "));
  if (at < 0) throw new GuardError("no change found; a kept fault is a unified diff, as git diff writes it");

  const files: FilePatch[] = [];
  while (at < lines.length) {
    const line = lines[at];
    if (line.startsWith("@@")) throw new GuardError(`line ${at + 1}: a change comes before its file is named`);
    if (/^(rename|copy) (from|to) /.test(line)) {
      throw new GuardError(`line ${at + 1}: it renames or copies a file; a kept fault changes existing files`);
    }
    if (/^(new|deleted) file mode /.test(line)) {
      throw new GuardError(`line ${at + 1}: it adds or removes a file; a kept fault changes existing files`);
    }
    if (line.startsWith("GIT binary patch") || /^Binary files .* differ$/.test(line)) {
      throw new GuardError(`line ${at + 1}: it changes a binary file; a kept fault changes text`);
    }
    if (!line.startsWith("--- ")) {
      // A line of a change outside any change: the header before it
      // counted fewer lines than were written.
      if (/^[ +-]/.test(line)) {
        throw new GuardError(
          files.length === 0
            ? `line ${at + 1}: a change comes before its file is named`
            : `line ${at + 1}: the change has more lines than its header says`,
        );
      }
      at += 1;
      continue;
    }
    const next = lines[at + 1] ?? "";
    if (!next.startsWith("+++ ")) throw new GuardError(`line ${at + 2}: expected a '+++ ' line after '--- '`);
    const before = patchPath(line.slice(4), at + 1);
    const after = patchPath(next.slice(4), at + 2);
    if (before === null || after === null) {
      throw new GuardError(`line ${at + 1}: it adds or removes a file; a kept fault changes existing files`);
    }
    // Git writes a one-character folder before each name: a/ and b/,
    // or i/, w/, c/, o/, 1/ and 2/ under other settings.
    const path = unprefixed(before);
    if (unprefixed(after) !== path) {
      throw new GuardError(`line ${at + 1}: it renames ${before} to ${after}; a kept fault changes existing files`);
    }
    if (path === "" || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.includes("\\") || path.split("/").includes("..")) {
      throw new GuardError(`line ${at + 1}: the path ${path} does not stay inside the project`);
    }
    if (files.some((file) => file.path === path)) {
      throw new GuardError(`line ${at + 1}: ${path} is named twice`);
    }
    const named = at + 1;
    at += 2;

    const hunks: Hunk[] = [];
    while (at < lines.length && lines[at].startsWith("@@")) {
      const header = HUNK_RE.exec(lines[at]);
      if (header === null) throw new GuardError(`line ${at + 1}: not a change header: ${lines[at]}`);
      let old = header[2] === undefined ? 1 : Number(header[2]);
      let fresh = header[4] === undefined ? 1 : Number(header[4]);
      const hunk: Hunk = { line: Number(header[1]), lines: [] };
      at += 1;
      while (old > 0 || fresh > 0) {
        const body = lines[at];
        if (body === undefined) throw new GuardError(`line ${at + 1}: the change ends early`);
        const kind = body === "" ? " " : body[0];
        if (kind === "\\") {
          if (hunk.lines.length > 0) hunk.lines[hunk.lines.length - 1].noNewline = true;
          at += 1;
          continue;
        }
        if (kind !== " " && kind !== "-" && kind !== "+") {
          throw new GuardError(`line ${at + 1}: expected a line starting with ' ', '-' or '+'`);
        }
        if (kind !== "+") old -= 1;
        if (kind !== "-") fresh -= 1;
        if (old < 0 || fresh < 0) throw new GuardError(`line ${at + 1}: the change has more lines than its header says`);
        hunk.lines.push({ kind, text: body.slice(1), noNewline: false });
        at += 1;
      }
      if (lines[at]?.startsWith("\\")) {
        hunk.lines[hunk.lines.length - 1].noNewline = true;
        at += 1;
      }
      hunks.push(hunk);
    }
    if (hunks.length === 0) throw new GuardError(`line ${named}: no change follows the name of ${path}`);
    files.push({ path, hunks });
  }
  if (files.length === 0) throw new GuardError("no change found; a kept fault is a unified diff, as git diff writes it");
  return { files };
}

type Line = { text: string; end: string };

function split(text: string): Line[] {
  const lines: Line[] = [];
  const re = /([^\n]*)\n/y;
  let at = 0;
  for (;;) {
    re.lastIndex = at;
    const match = re.exec(text);
    if (match === null) break;
    const cr = match[1].endsWith("\r");
    lines.push({ text: cr ? match[1].slice(0, -1) : match[1], end: cr ? "\r\n" : "\n" });
    at = re.lastIndex;
  }
  if (at < text.length) lines.push({ text: text.slice(at), end: "" });
  return lines;
}

/**
 * Apply one file's changes to its text. Returns the new text, or the
 * stated line of the first change that matches nowhere.
 */
export function applyToText(text: string, file: FilePatch): { text: string } | { failedAt: number } {
  const lines = split(text);
  const ending = lines.length > 0 && lines[0].end === "\r\n" ? "\r\n" : "\n";
  let shift = 0;
  let floor = 0;
  for (const hunk of file.hunks) {
    const old = hunk.lines.filter((line) => line.kind !== "+");
    const matches = (start: number): boolean =>
      start >= floor &&
      start + old.length <= lines.length &&
      old.every((line, index) => lines[start + index].text === line.text);
    // A change with no old lines states the line it goes after.
    const stated = (old.length === 0 ? hunk.line : hunk.line - 1) + shift;
    let found = -1;
    const reach = lines.length + Math.abs(stated);
    for (let away = 0; away <= reach && found < 0; away += 1) {
      if (matches(stated - away)) found = stated - away;
      else if (matches(stated + away)) found = stated + away;
    }
    if (found < 0) return { failedAt: hunk.line };

    const fresh: Line[] = [];
    let from = found;
    for (const line of hunk.lines) {
      if (line.kind === " ") {
        fresh.push(lines[from]);
        from += 1;
      } else if (line.kind === "-") {
        from += 1;
      } else {
        fresh.push({ text: line.text, end: line.noNewline ? "" : ending });
      }
    }
    lines.splice(found, old.length, ...fresh);
    shift += found - stated + (fresh.length - old.length);
    floor = found + fresh.length;
  }
  // Only the last line may go without a line ending.
  for (const line of lines.slice(0, -1)) if (line.end === "") line.end = ending;
  return { text: lines.map((line) => line.text + line.end).join("") };
}

/** What applying a patch came to. A patch that applies but leaves
 * every file as it was has `changed: false`. */
export type PatchOutcome = { applies: true; changed: boolean } | { applies: false; cause: string };

/**
 * Apply a patch to the files under `folder`. Nothing is written
 * unless every change applies. A missing file, a file whose real
 * path is outside `folder` (reached through a link), a file that is
 * not text, or a change that matches nowhere means the patch does
 * not apply, with the cause in plain words.
 */
export function applyPatch(folder: string, patch: Patch): PatchOutcome {
  const results: { file: string; text: string }[] = [];
  const inside = realpathSync(folder) + sep;
  let changed = false;
  for (const entry of patch.files) {
    const file = join(folder, ...entry.path.split("/"));
    if (!existsSync(file) || !statSync(file).isFile()) {
      return { applies: false, cause: `${entry.path} is not among the copied files` };
    }
    // A link in the folder may lead out of it; nothing is written there.
    if (!realpathSync(file).startsWith(inside)) {
      return { applies: false, cause: `${entry.path} is outside the copy` };
    }
    const bytes = readFileSync(file);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) {
      return { applies: false, cause: `${entry.path} is not text` };
    }
    const result = applyToText(text, entry);
    if ("failedAt" in result) {
      return {
        applies: false,
        cause: `the change at line ${result.failedAt} of ${entry.path} matches nowhere in the file`,
      };
    }
    if (result.text !== text) {
      changed = true;
      results.push({ file, text: result.text });
    }
  }
  for (const result of results) writeFileSync(result.file, result.text);
  return { applies: true, changed };
}

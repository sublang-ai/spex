// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-2, guards-37), DR-252: the spec items a
 * guard reads. They are read with the linter's own parser, so an item
 * here is exactly what `spex lint` takes for one.
 *
 * For guard `<id>`: the guard item `<id>` in a Verification section,
 * with its cases; the one behavior item of the same file it cites;
 * and the items those two cite, one step.
 */

import { readSpecItems, type SpecItem } from "../lint.js";
import { GuardError, byText } from "./types.js";

/** One spec item as a guard uses it. */
export type Item = {
  id: string;
  /** Its file, relative to the root (starts with `specs/`). */
  file: string;
  /** 1-based line of its heading. */
  line: number;
  /** `Verification`, `External Behavior`, `Internal Behavior`, … */
  section: string | null;
  /** From its heading line to the line before the next heading of
   * the same or a shallower depth, trailing blank lines dropped, line
   * endings as LF, no newline at the end. Approval digests this. */
  text: string;
  /** Its body's first paragraph on one line, each Markdown link
   * replaced by its text, so a citation reads `[<id>]`. */
  statement: string;
  /** The IDs of the spec items its body cites, sorted, each once. */
  cites: string[];
};

/** Every spec item of a tree, by ID. */
export type ItemIndex = {
  byId: ReadonlyMap<string, readonly Item[]>;
};

/** One case of a guard item: an entry of its list, in plain words. */
export type ItemCase = {
  kind: "permitted" | "forbidden";
  /** As written, compared character by character. */
  label: string;
  /** On one line, each Markdown link as its text, without the `;` or
   * `.` that ends the entry. */
  words: string;
};

/** The items one guard reads. */
export type GuardItems = {
  /** The guard item: the Verification item the guard is named by. */
  guard: Item;
  /** The behavior item it checks: the rule. */
  behavior: Item;
  /** The guard item's cases, in the item's order. */
  cases: ItemCase[];
  /** The items the guard item and the behavior item cite directly,
   * other than those two. In ID order. */
  cited: Item[];
};

const BEHAVIOR_SECTIONS = new Set(["External Behavior", "Internal Behavior"]);

/** A Markdown link, `[text](target)`; the first group is its text. */
const LINK_RE = /\[([^\[\]]*)\]\([^()]*\)/g;

/** A line that starts a list item, with or without an indent. */
const LIST_RE = /^\s*(?:[-*+]|\d+[.)])\s/;

/** A case entry's first line: a list mark with no indent, the kind,
 * and an em dash with one space either side. */
const CASE_RE = /^[-*+][ \t]+(permitted|forbidden) — (.*)$/;

/** A list item, with or without an indent, whose first word is
 * `permitted` or `forbidden` in any letter case: one a reader takes
 * for a case. */
const LIKE_CASE_RE = /^\s*(?:[-*+]|\d+[.)])\s+(permitted|forbidden)(?![A-Za-z0-9])/i;

function toItem(source: SpecItem): Item {
  const lines = source.lines.map((line) => line.replace(/\r$/, ""));
  while (lines.length > 1 && lines[lines.length - 1].trim() === "") lines.pop();
  const paragraph: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === "") {
      if (paragraph.length > 0) break;
      continue;
    }
    if (LIST_RE.test(line)) break;
    paragraph.push(line.trim());
  }
  return {
    id: source.id,
    file: source.relPath,
    line: source.line,
    section: source.section,
    text: lines.join("\n"),
    statement: paragraph.join(" ").replace(LINK_RE, "$1"),
    cites: [...new Set(source.cites.map((cited) => cited.id))].sort(byText),
  };
}

/** Read every spec item under `<root>/specs`. */
export function readItems(root: string): ItemIndex {
  const byId = new Map<string, Item[]>();
  for (const source of readSpecItems(root)) {
    const item = toItem(source);
    const same = byId.get(item.id);
    if (same === undefined) byId.set(item.id, [item]);
    else same.push(item);
  }
  return { byId };
}

function one(index: ItemIndex, id: string): Item {
  const found = index.byId.get(id) ?? [];
  if (found.length === 0) throw new GuardError(`${id}: no spec item has this ID`);
  if (found.length > 1) {
    throw new GuardError(
      `${id}: several spec items have this ID (${found.map((item) => `${item.file}:${item.line}`).join(", ")})`,
    );
  }
  return found[0];
}

/**
 * The cases of a guard item (guards-37), read from its text: every
 * list item with no indent that starts `permitted — ` or
 * `forbidden — `, with the indented lines that follow it. A list
 * item a reader would take for a case and that is not written so is
 * an error, so that no case the item shows goes unchecked; any other
 * list item is no case. Every such error is a GuardError starting
 * with the item's ID.
 */
export function readCases(item: Item): ItemCase[] {
  const bad = (cause: string): never => {
    throw new GuardError(`${item.id}: ${cause}`);
  };
  const cases: ItemCase[] = [];
  const lines = item.text.split("\n").slice(1);
  for (const line of lines) {
    const like = LIKE_CASE_RE.exec(line);
    if (like !== null && !CASE_RE.test(line)) {
      const kind = like[1].toLowerCase();
      bad(
        `the list entry '${line.trim()}' starts with ${like[1]} and is not written as a case: a case is a list item with no indent, '- ${kind} — <label>: <the case in plain words>', the dash being — with one space either side`,
      );
    }
  }
  for (let at = 0; at < lines.length; at += 1) {
    const match = CASE_RE.exec(lines[at]);
    if (match === null) continue;
    const kind = match[1] as ItemCase["kind"];
    const parts = [match[2].trim()];
    while (at + 1 < lines.length && /^[ \t]/.test(lines[at + 1]) && lines[at + 1].trim() !== "") {
      at += 1;
      parts.push(lines[at].trim());
    }
    const entry = parts.filter((part) => part !== "").join(" ");
    const colon = entry.indexOf(":");
    if (colon < 0) bad(`the case entry '${kind} — ${entry}' has no colon after its label`);
    const label = entry.slice(0, colon).trim();
    if (label === "") bad(`a ${kind} case has an empty label`);
    const words = entry
      .slice(colon + 1)
      .trim()
      .replace(LINK_RE, "$1")
      .replace(/[;.]$/, "")
      .trim();
    if (words === "") bad(`case '${label}' has no plain words after its label`);
    if (cases.some((other) => other.label === label)) bad(`two cases share the label '${label}'`);
    cases.push({ kind, label, words });
  }
  for (const kind of ["permitted", "forbidden"] as const) {
    if (!cases.some((entry) => entry.kind === kind)) {
      bad(`no ${kind} case; a guard item has at least one, written '- ${kind} — <label>: <the case in plain words>'`);
    }
  }
  return cases;
}

/**
 * The items of guard `guardId` (guards-2). Every error is a
 * GuardError starting with the ID of the item at fault.
 */
export function guardItems(index: ItemIndex, guardId: string): GuardItems {
  const guard = one(index, guardId);
  if (guard.section !== "Verification") {
    throw new GuardError(`${guardId}: not in a Verification section, so it cannot be a guard item`);
  }
  const behaviors = guard.cites
    .map((id) => one(index, id))
    .filter((item) => item.file === guard.file && item.section !== null && BEHAVIOR_SECTIONS.has(item.section));
  if (behaviors.length === 0) {
    throw new GuardError(`${guardId}: cites no behavior item of its own file; a guard checks one`);
  }
  if (behaviors.length > 1) {
    throw new GuardError(
      `${guardId}: cites several behavior items (${behaviors.map((item) => item.id).join(", ")}); a guard checks one`,
    );
  }
  const behavior = behaviors[0];
  const cases = readCases(guard);

  const own = new Set([guard.id, behavior.id]);
  const citedIds = new Set<string>();
  for (const item of [guard, behavior]) {
    for (const id of item.cites) if (!own.has(id)) citedIds.add(id);
  }
  const cited = [...citedIds].sort(byText).map((id) => one(index, id));
  return { guard, behavior, cases, cited };
}

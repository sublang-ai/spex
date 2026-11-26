// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: the spec items a guard reads. They are read
 * with the linter's own parser, so an item here is exactly what
 * `spex lint` takes for one.
 *
 * For guard `<id>`: the assertion item `<id>` in a Verification
 * section; the one behavior item of the same file it cites; each
 * example item, a Verification item of that file citing the behavior
 * item; and the items those cite directly.
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

/** The items one guard reads. */
export type GuardItems = {
  assertion: Item;
  behavior: Item;
  /** In the order asked for. */
  examples: Item[];
  /** The items the assertion, behavior and example items cite
   * directly, other than those items themselves. In ID order. */
  cited: Item[];
};

const BEHAVIOR_SECTIONS = new Set(["External Behavior", "Internal Behavior"]);

/** A Markdown link, `[text](target)`; the first group is its text. */
const LINK_RE = /\[([^\[\]]*)\]\([^()]*\)/g;

function toItem(source: SpecItem): Item {
  const lines = source.lines.map((line) => line.replace(/\r$/, ""));
  while (lines.length > 1 && lines[lines.length - 1].trim() === "") lines.pop();
  const paragraph: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === "") {
      if (paragraph.length > 0) break;
      continue;
    }
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
 * The items of guard `assertionId` with the examples `exampleIds`.
 * Every error is a GuardError starting with the ID of the item at
 * fault.
 */
export function guardItems(index: ItemIndex, assertionId: string, exampleIds: readonly string[]): GuardItems {
  const assertion = one(index, assertionId);
  if (assertion.section !== "Verification") {
    throw new GuardError(`${assertionId}: not in a Verification section, so it cannot be a guard's assertion`);
  }
  const behaviors = assertion.cites
    .map((id) => one(index, id))
    .filter((item) => item.file === assertion.file && item.section !== null && BEHAVIOR_SECTIONS.has(item.section));
  if (behaviors.length === 0) {
    throw new GuardError(`${assertionId}: cites no behavior item of its own file; a guard protects one`);
  }
  if (behaviors.length > 1) {
    throw new GuardError(
      `${assertionId}: cites several behavior items (${behaviors.map((item) => item.id).join(", ")}); a guard protects one`,
    );
  }
  const behavior = behaviors[0];

  const examples = exampleIds.map((id) => {
    const example = one(index, id);
    if (id === assertionId) throw new GuardError(`${id}: the assertion item cannot also be an example`);
    if (example.file !== assertion.file || example.section !== "Verification") {
      throw new GuardError(`${id}: not a Verification item of ${assertion.file}`);
    }
    if (!example.cites.includes(behavior.id)) {
      throw new GuardError(`${id}: does not cite ${behavior.id}, the behavior item the guard protects`);
    }
    return example;
  });

  const own = new Set([assertion.id, behavior.id, ...examples.map((item) => item.id)]);
  const citedIds = new Set<string>();
  for (const item of [assertion, behavior, ...examples]) {
    for (const id of item.cites) if (!own.has(id)) citedIds.add(id);
  }
  const cited = [...citedIds].sort(byText).map((id) => one(index, id));
  return { assertion, behavior, examples, cited };
}

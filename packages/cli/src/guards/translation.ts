// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-6), DR-244 and DR-252: a translation, the
 * guard's items written in TLA+ in one file `guards/<guard>/translations/<name>.tla`.
 * Spex reads its text only to check its form: its one opening line,
 * the words a translation may not hold and the seven operators with
 * their parameters. What the translation means is TLC's to say.
 */

import { DECLARATION_MODULE, OPERATORS } from "./declaration.js";

/** A translation as loaded: its text is never evaluated here. */
export type Translation = {
  /** The file's name without `.tla`, which its `MODULE` line names too. */
  name: string;
  /** Its file, relative to the root, with `/`. */
  file: string;
  text: string;
};

/** One error of form; `line` and `col` count from 1 where the
 * error has a place. */
export type FormFault = { line: number | null; col: number | null; message: string };

/** What a translation's name is made of. */
export const TRANSLATION_NAME_RE = /^[a-z][a-z0-9_]*$/;

/** The TLA+ modules a translation may load: the declaration in TLA+
 * and four standard modules. */
export const MAY_LOAD: readonly string[] = [DECLARATION_MODULE, "Naturals", "Integers", "FiniteSets", "Sequences"];

/** Names no translation may take: a file of that name would stand in
 * for a file TLC loads, on a file system that ignores case. */
const TAKEN_MODULES: ReadonlySet<string> = new Set([
  "declaration", "naturals", "integers", "reals", "finitesets", "sequences", "bags", "tlc", "tlcext",
  "randomization", "realtime", "toolbox",
]);

/** Why `name` cannot name a translation, or null when it can. */
export function translationNameFault(name: string): string | null {
  if (!TRANSLATION_NAME_RE.test(name)) {
    return "a translation's name is a lowercase letter, then lowercase letters, digits and _";
  }
  if (TAKEN_MODULES.has(name) || name.startsWith("spex")) {
    return `'${name}' is the name of a file TLC or Spex loads; pick another`;
  }
  return null;
}

/** Why a translation holds no prime, `ENABLED` or `UNCHANGED`: each
 * of its operators is given its state. */
const NEXT_STATE = "a translation speaks of the state it is given, never of the next";

/** The words a translation may not hold, each with why. The prime is
 * one of them: outside a comment and a string it is TLA+'s mark of
 * the next state and nothing else. */
const REFUSED: readonly (readonly [word: string, why: string])[] = [
  ["INSTANCE", "a translation loads only what it extends"],
  ["CONSTANT", "a translation declares no constant"],
  ["CONSTANTS", "a translation declares no constant"],
  ["VARIABLE", "a translation declares no variable"],
  ["VARIABLES", "a translation declares no variable"],
  ["ASSUME", "a translation assumes nothing"],
  ["ASSUMPTION", "a translation assumes nothing"],
  ["AXIOM", "a translation assumes nothing"],
  ["CHOOSE", "choose among declared values with <Values>First or <Values>Rank, so no answer rests on TLC's own order"],
  ["'", NEXT_STATE],
  ["ENABLED", NEXT_STATE],
  ["UNCHANGED", NEXT_STATE],
];

/**
 * TLA+ text with each comment and each string's content blanked out,
 * every other character at its own place, so a word found is a word
 * of the translation and its line and column are the file's.
 */
export function bare(text: string): string {
  let out = "";
  let depth = 0;
  const blank = (c: string): string => (c === "\n" ? "\n" : " ");
  for (let at = 0; at < text.length; at += 1) {
    if (text.startsWith("(*", at)) {
      depth += 1;
      out += "  ";
      at += 1;
    } else if (depth > 0 && text.startsWith("*)", at)) {
      depth -= 1;
      out += "  ";
      at += 1;
    } else if (depth > 0) {
      out += blank(text[at]);
    } else if (text.startsWith("\\*", at)) {
      while (at < text.length && text[at] !== "\n") {
        out += " ";
        at += 1;
      }
      if (at < text.length) out += "\n";
    } else if (text[at] === '"') {
      out += '"';
      at += 1;
      while (at < text.length && text[at] !== '"' && text[at] !== "\n") {
        if (text[at] === "\\" && at + 1 < text.length && text[at + 1] !== "\n") {
          out += "  ";
          at += 2;
        } else {
          out += " ";
          at += 1;
        }
      }
      if (at < text.length) out += text[at] === "\n" ? "\n" : '"';
    } else {
      out += text[at];
    }
  }
  return out;
}

/** The line and column, from 1, of an offset in a text. */
function placeOf(text: string, offset: number): { line: number; col: number } {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  return { line, col: offset - (before.lastIndexOf("\n") + 1) + 1 };
}

/**
 * The errors of form in a translation's text, in the file's order;
 * none where its form holds. A check of the text only: whether the
 * file parses, and what it loads, TLC says.
 */
export function formFaults(translation: Translation): FormFault[] {
  const { name } = translation;
  // A line ends at LF, CRLF or a lone CR, as TLC reads it: a comment
  // ends where TLC ends it, and a place is the one TLC names.
  const text = translation.text.replace(/\r\n?/g, "\n");
  const code = bare(text);
  const faults: FormFault[] = [];

  const heads = [...code.matchAll(/^[ \t]*-{4,}[ \t]*MODULE[ \t]+(\w+)[ \t]*-{4,}/gm)];
  if (heads.length !== 1 || heads[0][1] !== name) {
    faults.push({
      line: null,
      col: null,
      message: `the file holds one line ---- MODULE ${name} ----, and no other MODULE line`,
    });
  }
  for (const [word, why] of REFUSED) {
    const found = (word === "'" ? /'/ : new RegExp(`\\b${word}\\b`)).exec(code);
    if (found !== null) faults.push({ ...placeOf(code, found.index), message: `${word} is not for a translation: ${why}` });
  }
  for (const [operator, params] of OPERATORS) {
    const found = new RegExp(`^${operator}[ \\t]*(?:\\(([^)]*)\\))?\\s*==`, "m").exec(code);
    const shown = params.length === 0 ? operator : `${operator}(${params.join(", ")})`;
    if (found === null) {
      faults.push({ line: null, col: null, message: `it does not define ${shown}` });
      continue;
    }
    const given = found[1] === undefined ? 0 : found[1].split(",").length;
    if (given !== params.length) {
      faults.push({
        ...placeOf(code, found.index),
        message: `it defines ${operator} with ${given} ${given === 1 ? "parameter" : "parameters"}, not as ${shown}`,
      });
    }
  }
  return faults.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.col ?? 0) - (b.col ?? 0));
}

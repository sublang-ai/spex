// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-8), DR-244 and DR-252: the declaration in
 * TLA+. It is the file `Declaration.tla` that Spex generates from a
 * binding's declaration, and the vocabulary every translation is
 * written in. The same declaration always gives the same bytes. Text
 * is written from data only: nothing here evaluates TLA+.
 */

import { tlaString } from "./tla.js";
import { GuardError, type Declaration, type Type } from "./types.js";

/** The TLA+ module every translation extends. */
export const DECLARATION_MODULE = "Declaration";

/** The seven operators a translation defines, with how many
 * parameters each takes. */
export const OPERATORS: readonly (readonly [name: string, params: readonly string[]])[] = [
  ["Start", []],
  ["Legal", ["s", "e"]],
  ["Effect", ["s", "e"]],
  ["After", ["s", "e"]],
  ["When", ["e"]],
  ["While", ["s", "e"]],
  ["Shall", ["s", "e", "f"]],
];

/** Names the declaration in TLA+ may not define for a values set,
 * because TLA+, a module a translation may load, a translation or one
 * of Spex's own TLA+ files defines them. */
export const RESERVED: ReadonlySet<string> = new Set([
  // The declaration's own fixed names.
  "Missing", "Events", "Effects",
  // A translation's seven operators.
  ...OPERATORS.map(([name]) => name),
  // Naturals, Integers, FiniteSets and Sequences.
  "Nat", "Int", "Seq", "Len", "Head", "Tail", "Append", "SubSeq", "SelectSeq", "IsFiniteSet", "Cardinality",
  // The module TLC, which two of Spex's own files extend.
  "Print", "PrintT", "Assert", "JavaTime", "TLCGet", "TLCSet", "Permutations", "SortSeq", "RandomElement", "Any",
  "ToString", "TLCEval",
  // Spex's own files.
  "T", "M", "Form", "Agrees", "Applies", "Forbidden", "Same", "Difference", "Row", "Init", "Take", "Land", "Next",
  "Agree", "Declared", "Kept", "Reached", "Judge",
  // The words of TLA+.
  "ACTION", "ASSUME", "ASSUMPTION", "AXIOM", "BOOLEAN", "BY", "CASE", "CHOOSE", "CONSTANT", "CONSTANTS",
  "COROLLARY", "DEF", "DEFINE", "DEFS", "DOMAIN", "ELSE", "ENABLED", "EXCEPT", "EXTENDS", "FALSE", "HAVE", "HIDE",
  "IF", "IN", "INSTANCE", "LAMBDA", "LEMMA", "LET", "LOCAL", "MODULE", "NEW", "OBVIOUS", "OMITTED", "ONLY", "OTHER",
  "PICK", "PROOF", "PROPOSITION", "PROVE", "QED", "RECURSIVE", "STATE", "STRING", "SUBSET", "SUFFICES", "TAKE",
  "TEMPORAL", "THEN", "THEOREM", "TRUE", "UNCHANGED", "UNION", "USE", "VARIABLE", "VARIABLES", "WITH", "WITNESS",
]);

/** A values set's name in TLA+: its first letter in upper case. */
export function setName(set: string): string {
  return set[0].toUpperCase() + set.slice(1);
}

/** The names the declaration in TLA+ defines for one values set: the
 * set, each value's place in it, and the first of some of them. */
function namesOf(set: string): string[] {
  const name = setName(set);
  return [name, `${name}Rank`, `${name}First`];
}

/**
 * Refuse a declaration whose generated names would clash: a values
 * set, a param or an effect field TLA+ could not hold under its name.
 * Throws a GuardError; the caller adds the file.
 */
export function checkNames(declaration: Declaration): void {
  const taken = new Map<string, string>();
  for (const set of Object.keys(declaration.vocabulary.sets)) {
    for (const name of namesOf(set)) {
      if (RESERVED.has(name)) {
        throw new GuardError(
          `values: '${set}' cannot name a values set: the declaration in TLA+ would define ${name}, which is taken`,
        );
      }
      const other = taken.get(name);
      if (other !== undefined) {
        throw new GuardError(
          `values: '${set}' cannot name a values set: the declaration in TLA+ would define ${name}, as values ${other} does`,
        );
      }
      taken.set(name, set);
    }
  }
  for (const [event, declared] of Object.entries(declaration.events)) {
    if (Object.hasOwn(declared.params, "event")) {
      throw new GuardError(`event ${event}: params: 'event' names the event itself; pick another name`);
    }
  }
}

/** A type as the TLA+ set of its values. */
export function typeSet(type: Type): string {
  switch (type.kind) {
    case "bool":
      return "BOOLEAN";
    case "int": {
      const bound = (n: number): string => (n < 0 ? `(${n})` : String(n));
      return `(${bound(type.min)}..${bound(type.max)})`;
    }
    case "value":
      return setName(type.set);
    case "set":
      return `(SUBSET ${typeSet(type.of)})`;
    case "optional":
      return `(${typeSet(type.of)} \\cup {Missing})`;
  }
}

/** The set of the records with the given fields; `{<<>>}` for none. */
function recordSet(fields: Record<string, Type>, first: readonly string[] = []): string {
  const parts = [...first, ...Object.entries(fields).map(([name, type]) => `${name} : ${typeSet(type)}`)];
  return parts.length === 0 ? "{<<>>}" : `[${parts.join(", ")}]`;
}

/** The text of `Declaration.tla` for the binding `binding`. */
export function declarationModule(declaration: Declaration, binding: string): string {
  const lines = [
    `---- MODULE ${DECLARATION_MODULE} ----`,
    `\\* Generated by Spex from guards/bindings/${binding}/binding.yaml. Do not edit.`,
    "EXTENDS Integers, FiniteSets, Sequences",
    "",
    "\\* The value of a field of a type `T?` that holds nothing.",
    "\\* Each .cfg file Spex writes makes it a value equal to nothing else.",
    "CONSTANT Missing",
  ];
  for (const [set, members] of Object.entries(declaration.vocabulary.sets)) {
    const name = setName(set);
    lines.push(
      "",
      `\\* values.${set}; each value's place in the declared order, from 1;`,
      "\\* and the member of a nonempty set of them that comes first in that order.",
      `${name} == {${members.map(tlaString).join(", ")}}`,
      `${name}Rank(v) == CASE ${members.map((member, at) => `v = ${tlaString(member)} -> ${at + 1}`).join(" [] ")}`,
      `${name}First(S) == CHOOSE x \\in S : \\A y \\in S : ${name}Rank(x) <= ${name}Rank(y)`,
    );
  }
  const events = Object.entries(declaration.events);
  lines.push(
    "",
    "\\* Every event with its params: a record whose field `event` names it.",
    "Events ==",
    events.map(([event, { params }]) => `  ${recordSet(params, [`event : {${tlaString(event)}}`])}`).join("\n  \\cup\n"),
    "",
    "\\* Every effect the event `e` is declared to give.",
    "Effects(e) ==",
    `  CASE ${events.map(([event, { effect }]) => `e.event = ${tlaString(event)} -> ${recordSet(effect)}`).join("\n    [] ")}`,
    "====",
    "",
  );
  return lines.join("\n");
}

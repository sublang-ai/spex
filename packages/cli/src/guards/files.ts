// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package (guards-1, guards-3, guards-10, guards-18), DR-252:
 * a guard's files. A binding's declaration
 * (`guards/bindings/<name>/binding.yaml`) names the values, the
 * events with their params and effects, the files a run copies and
 * the commands that build the copy. The guard file
 * (`guards/<guard>/guard.yaml`) names the binding, fixes the time
 * limit and holds each case of the guard item again as steps. `loadGuard`
 * reads everything one guard is made of into one checked object, or
 * throws a GuardError naming the file or item and the cause.
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { digest, fileLabel, itemLabel, sortInputs, type Inputs } from "./approval.js";
import { guardItems, readItems, type GuardItems, type ItemCase, type ItemIndex } from "./items.js";
import { checkNames } from "./declaration.js";
import { parsePatch, type Patch } from "./patch.js";
import { translationNameFault, type Translation } from "./translation.js";
import {
  GuardError,
  byText,
  decodeFields,
  eventFault,
  fieldFault,
  mapping,
  mappingOrNone,
  parseType,
  parseYaml,
  showData,
  vocabulary,
  within,
  type Case,
  type Declaration,
  type EventDeclaration,
  type Step,
  type Type,
} from "./types.js";

/** What binding.yaml declares. */
export type BindingDeclaration = Declaration & {
  /** Project files and folders a run copies, relative to the root.
   * Empty where the declaration names none: no copy can then be made
   * (guards-36). */
  files: string[];
  /** Commands run in the copy, in order, each an argv list. */
  commands: string[][];
};

/** A binding as loaded from its folder. */
export type Binding = BindingDeclaration & {
  name: string;
  /** `guards/bindings/<name>`. */
  folder: string;
  /** Every file under the folder, relative to the root, in order. */
  folderFiles: string[];
  /** The folder holds a `binding.mjs`. Without one the guard still
   * loads, and the checks on the code find a failing binding
   * (guards-36). */
  module: boolean;
};

/** The limits: the seconds each run of TLC and each command may
 * take. */
export type Limits = { seconds: number };

/** What guard.yaml holds: `entries` are its `cases` as written, in
 * the file's order. */
export type GuardFile = { binding: string; limits: Limits; entries: { label: string; steps: Step[] }[] };

/** A kept fault. */
export type Fault = { name: string; file: string; patch: Patch };

/** A guard that loads but for its translations: it has none yet. Its
 * declaration is there for `spex verify --keep` to leave in TLA+. */
export class NoTranslation extends GuardError {
  constructor(
    message: string,
    readonly binding: Binding,
  ) {
    super(message);
  }
}

/** Everything one guard is made of, loaded and checked. */
export type Guard = {
  /** The guard item's ID, which is also the folder's name. */
  name: string;
  root: string;
  /** `guards/<name>`. */
  folder: string;
  items: GuardItems;
  binding: Binding;
  limits: Limits;
  /** The guard item's cases with their steps, in the item's order. */
  cases: Case[];
  /** In name order; at least one, and two or more for the guard to pass. */
  translations: Translation[];
  /** In name order; may be empty. */
  faults: Fault[];
  /** The digest of every approval input, labels in order. */
  inputs: Inputs;
};

const FOLDER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// ---------------------------------------------------------------
// binding.yaml
// ---------------------------------------------------------------

function typedFields(raw: unknown, vocab: ReturnType<typeof vocabulary>): Record<string, Type> {
  const fields: Record<string, Type> = {};
  for (const [name, type] of Object.entries(mappingOrNone(raw))) {
    within(name, () => {
      const fault = fieldFault(name);
      if (fault !== null) throw new GuardError(fault);
      fields[name] = parseType(type, vocab);
    });
  }
  return fields;
}

/** The error for an entry of `files` that is `guards` or under it. */
function underGuards(entry: string): string {
  return `files: '${entry}' is under guards/; a binding's folder is copied by itself and is no code under test`;
}

/** Read binding.yaml's text. Errors carry no file name; the caller
 * adds it. */
export function parseBinding(text: string): BindingDeclaration {
  const top = mapping(parseYaml(text), ["format", "values", "events", "files", "commands"]);
  if (top.format !== 1) throw new GuardError("format must be 1");

  const sets: Record<string, string[]> = {};
  for (const [set, members] of Object.entries(within("values", () => mappingOrNone(top.values)))) {
    if (!Array.isArray(members)) {
      throw new GuardError(`values ${set}: expected a list of values, found ${showData(members)}`);
    }
    sets[set] = members as string[];
  }
  const vocab = vocabulary(sets);

  const events: Record<string, EventDeclaration> = {};
  const declared = within("events", () => mapping(top.events));
  for (const [event, raw] of Object.entries(declared)) {
    within(`event ${event}`, () => {
      const fault = eventFault(event);
      if (fault !== null) throw new GuardError(fault);
      const entry = mappingOrNone(raw, ["params", "effect"]);
      events[event] = {
        params: within("params", () => typedFields(entry.params, vocab)),
        effect: within("effect", () => typedFields(entry.effect, vocab)),
      };
    });
  }
  if (Object.keys(events).length === 0) throw new GuardError("events: a binding declares at least one event");
  // The names the declaration in TLA+ would define must be free.
  checkNames({ vocabulary: vocab, events });

  // A declaration may name no files: it loads, and no copy can then
  // be made (guards-36).
  if (top.files !== undefined && top.files !== null && !Array.isArray(top.files)) {
    throw new GuardError("files: expected a list of paths to copy");
  }
  const files: string[] = [];
  for (const raw of (top.files ?? []) as unknown[]) {
    if (typeof raw !== "string") throw new GuardError(`files: expected a path, found ${showData(raw)}`);
    const path = raw.replace(/^(\.\/)+/, "").replace(/\/+$/, "");
    const parts = path.split("/");
    const outside =
      path === "" || path === "." || raw.startsWith("/") || /^[A-Za-z]:/.test(raw) || raw.includes("\\") ||
      parts.includes("..") || parts.includes(".") || parts.includes("");
    if (outside) {
      throw new GuardError(`files: '${raw}' must be a path inside the project, written with '/'`);
    }
    if (parts.includes("node_modules") || parts.includes(".git")) {
      throw new GuardError(`files: '${raw}' is in a node_modules or .git folder, which a run never copies`);
    }
    // The binding's own folder is copied by itself, and no kept fault
    // may reach a binding or a guard.
    if (parts[0] === "guards") throw new GuardError(underGuards(raw));
    if (files.includes(path)) throw new GuardError(`files: '${raw}' is listed twice`);
    files.push(path);
  }

  const commands: string[][] = [];
  if (top.commands !== undefined && top.commands !== null) {
    if (!Array.isArray(top.commands)) throw new GuardError("commands: expected a list of commands");
    for (const [index, raw] of (top.commands as unknown[]).entries()) {
      const ok =
        Array.isArray(raw) && raw.length > 0 && raw.every((word) => typeof word === "string") && raw[0] !== "";
      if (!ok) {
        throw new GuardError(
          `commands: command ${index + 1} must be a list of words, the program first, found ${showData(raw)}`,
        );
      }
      commands.push(raw as string[]);
    }
  }
  return { vocabulary: vocab, events, files, commands };
}

function abs(root: string, path: string): string {
  return join(root, ...path.split("/"));
}

/** The names in a folder, in order, without `.DS_Store`. */
function names(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name !== ".DS_Store")
    .sort(byText);
}

function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/** Every file under `folder` (relative to the root), in order,
 * leaving out `node_modules` and `.git` folders as a copy does. */
function filesUnder(root: string, folder: string): string[] {
  const found: string[] = [];
  for (const name of names(abs(root, folder))) {
    const path = `${folder}/${name}`;
    if (isDir(abs(root, path))) {
      if (name !== "node_modules" && name !== ".git") found.push(...filesUnder(root, path));
    } else {
      found.push(path);
    }
  }
  return found.sort(byText);
}

/**
 * Load the binding `guards/bindings/<name>` and digest every file in
 * its folder. A folder with no `binding.mjs` still loads. Every error
 * is a GuardError starting with the file.
 */
export function loadBinding(root: string, name: string): { binding: Binding; inputs: Inputs } {
  const folder = `guards/bindings/${name}`;
  if (!FOLDER_NAME_RE.test(name)) throw new GuardError(`'${name}' cannot be a binding's name`);
  if (!isDir(abs(root, folder))) throw new GuardError(`${folder}: no such binding`);
  const declarationFile = `${folder}/binding.yaml`;
  if (!isFile(abs(root, declarationFile))) throw new GuardError(`${declarationFile}: not found`);

  const folderFiles = filesUnder(root, folder);
  const inputs: Inputs = {};
  let text = "";
  for (const path of folderFiles) {
    const bytes = readFileSync(abs(root, path));
    inputs[fileLabel(path)] = digest(bytes);
    if (path === declarationFile) text = bytes.toString("utf8");
  }
  const declaration = within(declarationFile, () => {
    const parsed = parseBinding(text);
    // Where names differ only in case, or through a link, an entry
    // may lead under guards/ without saying so.
    const guards = realpathSync.native(abs(root, "guards"));
    for (const path of parsed.files) {
      if (!existsSync(abs(root, path))) throw new GuardError(`files: '${path}' is not in the project`);
      const real = realpathSync.native(abs(root, path));
      if (real === guards || real.startsWith(guards + sep)) throw new GuardError(underGuards(path));
    }
    return parsed;
  });
  const module = isFile(abs(root, `${folder}/binding.mjs`));
  return { binding: { ...declaration, name, folder, folderFiles, module }, inputs };
}

// ---------------------------------------------------------------
// guard.yaml
// ---------------------------------------------------------------

/** The most seconds a time limit can be: the longest a timer of Node
 * runs, 2147483647 ms. */
const MOST_SECONDS = 2147483;

function limit(raw: unknown, name: string): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > MOST_SECONDS) {
    throw new GuardError(`limits.${name} must be a whole number from 1 to ${MOST_SECONDS}, found ${showData(raw)}`);
  }
  return raw;
}

/**
 * Read guard.yaml's text (guards-10). `declarationOf` gives the
 * declaration of the binding the file names, against which every step
 * is decoded: every param stated, the stated effect fields of the
 * right type. A label entered twice is an error here; whether every
 * entry is a case of the guard item is `caseSteps`'s to say. Errors
 * carry no file name; the caller adds it.
 */
export function parseGuardFile(text: string, declarationOf: (binding: string) => Declaration): GuardFile {
  const top = mapping(parseYaml(text), ["format", "binding", "limits", "cases"]);
  if (top.format !== 1) throw new GuardError("format must be 1");
  if (typeof top.binding !== "string") {
    throw new GuardError(`binding must be a binding's name, found ${showData(top.binding)}`);
  }
  const written = within("limits", () => mapping(top.limits, ["seconds"]));
  const limits: Limits = { seconds: limit(written.seconds, "seconds") };
  const declaration = declarationOf(top.binding);

  if (!Array.isArray(top.cases)) throw new GuardError("cases must be a list");
  const entries: GuardFile["entries"] = [];
  for (const [index, raw] of (top.cases as unknown[]).entries()) {
    const entry = within(`cases entry ${index + 1}`, () => mapping(raw, ["case", "steps"]));
    if (typeof entry.case !== "string" || entry.case.trim() === "") {
      throw new GuardError(
        `cases entry ${index + 1}: case must be the label of a case of the guard item, found ${showData(entry.case)}`,
      );
    }
    const label = entry.case;
    if (entries.some((other) => other.label === label)) throw new GuardError(`a case entered twice: ${label}`);
    within(`case '${label}'`, () => {
      if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
        throw new GuardError("steps must be a list of one or more steps");
      }
      const steps: Step[] = (entry.steps as unknown[]).map((rawStep, at) =>
        within(`step ${at + 1}`, () => {
          const step = mapping(rawStep, ["event", "params", "effect"]);
          if (typeof step.event !== "string" || !Object.hasOwn(declaration.events, step.event)) {
            throw new GuardError(`the binding declares no event ${showData(step.event)}`);
          }
          const declared = declaration.events[step.event];
          return {
            event: step.event,
            params: within("params", () => decodeFields(declared.params, step.params ?? {}, declaration.vocabulary)),
            effect: within("effect", () =>
              decodeFields(declared.effect, step.effect ?? {}, declaration.vocabulary, { partial: true }),
            ),
          };
        }),
      );
      entries.push({ label, steps });
    });
  }
  return { binding: top.binding, limits, entries };
}

/**
 * Each case of the guard item with its steps from the guard file, in
 * the item's order (guards-10). A case with no entry, and an entry
 * for no case, is a GuardError naming the label; the caller adds the
 * file.
 */
export function caseSteps(cases: readonly ItemCase[], entries: GuardFile["entries"]): Case[] {
  for (const entry of entries) {
    if (!cases.some((known) => known.label === entry.label)) {
      throw new GuardError(`an entry for no case: ${entry.label}`);
    }
  }
  return cases.map((known) => {
    const entry = entries.find((other) => other.label === known.label);
    if (entry === undefined) throw new GuardError(`a case with no entry: ${known.label}`);
    return { label: known.label, kind: known.kind, words: known.words, steps: entry.steps };
  });
}

// ---------------------------------------------------------------
// One guard
// ---------------------------------------------------------------

/** The guards under `<root>/guards`: every folder there other than
 * `bindings`, with or without a guard.yaml, so that a guard whose
 * file is gone or misnamed is reported and not passed over. In name
 * order. */
export function listGuards(root: string): string[] {
  const dir = join(root, "guards");
  if (!isDir(dir)) return [];
  return names(dir).filter((name) => name !== "bindings" && isDir(join(dir, name)));
}

/** Whether `path` is one of a binding's `files` or under one of
 * them, in no `node_modules` or `.git` folder: a file a run copies. */
function amongFiles(files: readonly string[], path: string): boolean {
  const parts = path.split("/");
  if (parts.includes("node_modules") || parts.includes(".git")) return false;
  return files.some((file) => path === file || path.startsWith(`${file}/`));
}

/** The `<name><suffix>` files of a folder, in name order: by the name
 * without its extension, so `a` comes before `a-b` (guards-1). */
function namedFiles(root: string, folder: string, suffix: string): { name: string; path: string }[] {
  if (!existsSync(abs(root, folder))) return [];
  if (!isDir(abs(root, folder))) throw new GuardError(`${folder}: expected a folder`);
  return names(abs(root, folder))
    .map((entry) => {
      const path = `${folder}/${entry}`;
      const name = entry.slice(0, -suffix.length);
      if (!entry.endsWith(suffix) || !FOLDER_NAME_RE.test(name) || !isFile(abs(root, path))) {
        throw new GuardError(`${path}: only <name>${suffix} files are kept in this folder`);
      }
      return { name, path };
    })
    .sort((a, b) => byText(a.name, b.name));
}

/**
 * Load one guard: its items, guard file, binding declaration,
 * translations and kept faults, each checked but a translation's
 * text, which is TLC's to read, with the digest of
 * every approval input. `index` is the tree's items where the caller has
 * read them already. Every error is a GuardError naming the file or
 * item and the cause; the approval record is not read here.
 */
export function loadGuard(root: string, name: string, index?: ItemIndex): Guard {
  const folder = `guards/${name}`;
  const guardFile = `${folder}/guard.yaml`;
  if (!FOLDER_NAME_RE.test(name) || name === "bindings") throw new GuardError(`'${name}' cannot be a guard's name`);
  if (!isFile(abs(root, guardFile))) throw new GuardError(`${guardFile}: not found`);
  for (const entry of names(abs(root, folder))) {
    if (!["guard.yaml", "translations", "faults", "approval.json"].includes(entry)) {
      throw new GuardError(
        `${folder}/${entry}: not part of a guard; its folder holds guard.yaml, translations/, faults/ and approval.json`,
      );
    }
  }
  const inputs: Inputs = {};
  const read = (path: string): string => {
    const bytes = readFileSync(abs(root, path));
    inputs[fileLabel(path)] = digest(bytes);
    return bytes.toString("utf8");
  };

  let binding: Binding | undefined;
  // A fault in the binding names its own file, not guard.yaml.
  let bindingFault: GuardError | undefined;
  let file: GuardFile;
  try {
    file = within(guardFile, () =>
      parseGuardFile(read(guardFile), (bindingName) => {
        try {
          const loaded = loadBinding(root, bindingName);
          Object.assign(inputs, loaded.inputs);
          binding = loaded.binding;
          return loaded.binding;
        } catch (error) {
          if (error instanceof GuardError) bindingFault = error;
          throw error;
        }
      }),
    );
  } catch (error) {
    throw bindingFault ?? error;
  }
  if (binding === undefined) throw new GuardError(`${guardFile}: no binding`);
  const declaration: Binding = binding;

  const items = guardItems(index ?? readItems(root), name);
  for (const item of [items.guard, items.behavior, ...items.cited]) {
    inputs[itemLabel(item.id)] = digest(item.text);
  }
  const cases = within(guardFile, () => caseSteps(items.cases, file.entries));

  const translations: Translation[] = namedFiles(root, `${folder}/translations`, ".tla").map((entry) => {
    const fault = translationNameFault(entry.name);
    if (fault !== null) throw new GuardError(`${entry.path}: ${fault}`);
    return { name: entry.name, file: entry.path, text: read(entry.path) };
  });
  if (translations.length === 0) {
    throw new NoTranslation(`${folder}/translations: no translation; a guard needs two or more`, declaration);
  }

  const faults: Fault[] = namedFiles(root, `${folder}/faults`, ".patch").map((entry) => {
    const patch = within(entry.path, () => {
      const parsed = parsePatch(read(entry.path));
      // A kept fault is a defect in the code a run copies, never in
      // the binding or in an installed dependency. No entry of `files`
      // is under guards/; a path there is refused here all the same.
      // Where the declaration names no files yet, it loads (guards-3)
      // and the failing binding says so; only what holds of any path
      // is then checked here.
      for (const changed of parsed.files) {
        const parts = changed.path.split("/");
        const never = parts[0] === "guards" || parts.includes("node_modules") || parts.includes(".git");
        if (never || (declaration.files.length > 0 && !amongFiles(declaration.files, changed.path))) {
          throw new GuardError(`${changed.path} is not among the binding's files`);
        }
      }
      return parsed;
    });
    return { name: entry.name, file: entry.path, patch };
  });

  return {
    name,
    root,
    folder,
    items,
    binding: declaration,
    limits: file.limits,
    cases,
    translations,
    faults,
    inputs: sortInputs(inputs),
  };
}

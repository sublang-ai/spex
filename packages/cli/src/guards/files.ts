// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: a guard's files. A binding's declaration
 * (`guards/bindings/<name>/binding.yaml`) names the values, the
 * events with their params and effects, the files a run copies and
 * the commands that build the copy. The guard file
 * (`guards/<assertion>/guard.yaml`) names the binding, the bounds and
 * each example's sequence. `loadGuard` reads everything one guard is
 * made of into one checked object, or throws a GuardError naming the
 * file or item and the cause.
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { digest, fileLabel, itemLabel, sortInputs, type Inputs } from "./approval.js";
import { guardItems, readItems, type GuardItems, type ItemIndex } from "./items.js";
import { parsePatch, type Patch } from "./patch.js";
import { Unstated, checkExample, parseReading, type Reading } from "./reading.js";
import {
  GuardError,
  byText,
  decodeFields,
  isValuesSet,
  mapping,
  mappingOrNone,
  nameFault,
  parseType,
  parseYaml,
  showData,
  vocabulary,
  within,
  type Declaration,
  type EventDeclaration,
  type Example,
  type Step,
  type Type,
} from "./types.js";

/** What binding.yaml declares. */
export type BindingDeclaration = Declaration & {
  /** Project files and folders a run copies, relative to the root. */
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
};

/** The bounds of the sampled check. */
export type Sample = { sequences: number; events: number; seed: number; seconds: number };

/** What guard.yaml holds. */
export type GuardFile = { binding: string; sample: Sample; examples: Example[] };

/** A kept fault. `title` is the first line of the patch's description. */
export type Fault = { name: string; file: string; title: string; patch: Patch };

/** Everything one guard is made of, loaded and checked. */
export type Guard = {
  /** The assertion item's ID, which is also the folder's name. */
  name: string;
  root: string;
  /** `guards/<name>`. */
  folder: string;
  items: GuardItems;
  binding: Binding;
  sample: Sample;
  /** In guard.yaml's order; `items.examples` follows the same order. */
  examples: Example[];
  /** In name order; at least one. */
  readings: Reading[];
  /** In name order; may be empty. */
  faults: Fault[];
  /** The digest of every approval input, labels in order. */
  inputs: Inputs;
};

const FOLDER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MOST_SEED = 2147483647;

// ---------------------------------------------------------------
// binding.yaml
// ---------------------------------------------------------------

function typedFields(raw: unknown, vocab: ReturnType<typeof vocabulary>, isParam: boolean): Record<string, Type> {
  const fields: Record<string, Type> = {};
  for (const [name, type] of Object.entries(mappingOrNone(raw))) {
    within(name, () => {
      const fault = nameFault(name);
      if (fault !== null) throw new GuardError(fault);
      if (isParam && isValuesSet(vocab, name)) {
        throw new GuardError("this is also a values name; pick another");
      }
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
      const fault = nameFault(event);
      if (fault !== null) throw new GuardError(fault);
      const entry = mappingOrNone(raw, ["params", "effect"]);
      events[event] = {
        params: within("params", () => typedFields(entry.params, vocab, true)),
        effect: within("effect", () => typedFields(entry.effect, vocab, false)),
      };
    });
  }
  if (Object.keys(events).length === 0) throw new GuardError("events: a binding declares at least one event");

  if (!Array.isArray(top.files) || top.files.length === 0) {
    throw new GuardError("files: expected a list of one or more paths to copy");
  }
  const files: string[] = [];
  for (const raw of top.files as unknown[]) {
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
 * its folder. Every error is a GuardError starting with the file.
 */
export function loadBinding(root: string, name: string): { binding: Binding; inputs: Inputs } {
  const folder = `guards/bindings/${name}`;
  if (!FOLDER_NAME_RE.test(name)) throw new GuardError(`'${name}' cannot be a binding's name`);
  if (!isDir(abs(root, folder))) throw new GuardError(`${folder}: no such binding`);
  const declarationFile = `${folder}/binding.yaml`;
  if (!isFile(abs(root, declarationFile))) throw new GuardError(`${declarationFile}: not found`);
  if (!isFile(abs(root, `${folder}/binding.mjs`))) throw new GuardError(`${folder}/binding.mjs: not found`);

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
  return { binding: { ...declaration, name, folder, folderFiles }, inputs };
}

// ---------------------------------------------------------------
// guard.yaml
// ---------------------------------------------------------------

function count(raw: unknown, name: string, least: number, most: number = Number.MAX_SAFE_INTEGER): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < least || raw > most) {
    throw new GuardError(
      `sample.${name} must be a whole number${least === 0 ? `, 0 to ${most}` : ", 1 or more"}, found ${showData(raw)}`,
    );
  }
  return raw;
}

/**
 * Read guard.yaml's text. `declarationOf` gives the declaration of
 * the binding the file names, against which every example step is
 * decoded: every param stated, the stated effect fields of the right
 * type. Errors carry no file name; the caller adds it.
 */
export function parseGuardFile(text: string, declarationOf: (binding: string) => Declaration): GuardFile {
  const top = mapping(parseYaml(text), ["format", "binding", "sample", "examples"]);
  if (top.format !== 1) throw new GuardError("format must be 1");
  if (typeof top.binding !== "string") {
    throw new GuardError(`binding must be a binding's name, found ${showData(top.binding)}`);
  }
  const bounds = within("sample", () => mapping(top.sample, ["sequences", "events", "seed", "seconds"]));
  const sample: Sample = {
    sequences: count(bounds.sequences, "sequences", 1),
    events: count(bounds.events, "events", 1),
    seed: count(bounds.seed, "seed", 0, MOST_SEED),
    seconds: count(bounds.seconds, "seconds", 1),
  };
  const declaration = declarationOf(top.binding);

  if (!Array.isArray(top.examples)) throw new GuardError("examples must be a list");
  const examples: Example[] = [];
  for (const [index, raw] of (top.examples as unknown[]).entries()) {
    const entry = within(`example ${index + 1}`, () => mapping(raw, ["item", "kind", "steps"]));
    if (typeof entry.item !== "string" || entry.item === "") {
      throw new GuardError(`example ${index + 1}: item must be a spec item's ID, found ${showData(entry.item)}`);
    }
    const item = entry.item;
    within(`example ${item}`, () => {
      if (examples.some((example) => example.item === item)) throw new GuardError("listed twice");
      if (entry.kind !== "permitted" && entry.kind !== "forbidden") {
        throw new GuardError(`kind must be permitted or forbidden, found ${showData(entry.kind)}`);
      }
      if (!Array.isArray(entry.steps) || entry.steps.length === 0) {
        throw new GuardError("steps must be a list of one or more steps");
      }
      if (entry.steps.length > sample.events) {
        throw new GuardError(
          `it has ${entry.steps.length} steps, more than sample.events allows (${sample.events})`,
        );
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
      examples.push({ item, kind: entry.kind, steps });
    });
  }
  for (const kind of ["forbidden", "permitted"] as const) {
    if (!examples.some((example) => example.kind === kind)) {
      throw new GuardError(`no ${kind} example; a guard needs at least one`);
    }
  }
  return { binding: top.binding, sample, examples };
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

function namedFiles(root: string, folder: string, suffix: string): { name: string; path: string }[] {
  if (!existsSync(abs(root, folder))) return [];
  if (!isDir(abs(root, folder))) throw new GuardError(`${folder}: expected a folder`);
  return names(abs(root, folder)).map((entry) => {
    const path = `${folder}/${entry}`;
    const name = entry.slice(0, -suffix.length);
    if (!entry.endsWith(suffix) || !FOLDER_NAME_RE.test(name) || !isFile(abs(root, path))) {
      throw new GuardError(`${path}: only <name>${suffix} files are kept in this folder`);
    }
    return { name, path };
  });
}

/**
 * Load one guard: its items, guard file, binding declaration,
 * readings and kept faults, each checked, with the digest of every
 * approval input. `index` is the tree's items where the caller has
 * read them already. Every error is a GuardError naming the file or
 * item and the cause; the approval record is not read here.
 */
export function loadGuard(root: string, name: string, index?: ItemIndex): Guard {
  const folder = `guards/${name}`;
  const guardFile = `${folder}/guard.yaml`;
  if (!FOLDER_NAME_RE.test(name) || name === "bindings") throw new GuardError(`'${name}' cannot be a guard's name`);
  if (!isFile(abs(root, guardFile))) throw new GuardError(`${guardFile}: not found`);
  for (const entry of names(abs(root, folder))) {
    if (!["guard.yaml", "readings", "faults", "approval.json"].includes(entry)) {
      throw new GuardError(
        `${folder}/${entry}: not part of a guard; its folder holds guard.yaml, readings/, faults/ and approval.json`,
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

  const items = guardItems(index ?? readItems(root), name, file.examples.map((example) => example.item));
  for (const item of [items.assertion, items.behavior, ...items.examples, ...items.cited]) {
    inputs[itemLabel(item.id)] = digest(item.text);
  }

  const readings = namedFiles(root, `${folder}/readings`, ".yaml").map((entry) =>
    parseReading(read(entry.path), entry.name, entry.path, declaration),
  );
  if (readings.length === 0) throw new GuardError(`${folder}/readings: no reading; a guard needs at least one`);

  const faults: Fault[] = namedFiles(root, `${folder}/faults`, ".patch").map((entry) => {
    const patch = within(entry.path, () => {
      const parsed = parsePatch(read(entry.path));
      // A kept fault is a defect in the code a run copies, never in
      // the binding or in an installed dependency. No entry of `files`
      // is under guards/; a path there is refused here all the same.
      for (const changed of parsed.files) {
        if (changed.path.split("/")[0] === "guards" || !amongFiles(declaration.files, changed.path)) {
          throw new GuardError(`${changed.path} is not among the binding's files`);
        }
      }
      return parsed;
    });
    return { name: entry.name, file: entry.path, title: patch.title, patch };
  });

  // An example may leave out effect fields, but none a reading reads.
  // Every step short of a field is named at once, each by the first
  // reading that reads it.
  const unstated = new Map<string, string>();
  for (const example of file.examples) {
    for (const reading of readings) {
      try {
        checkExample(reading, example);
      } catch (error) {
        if (!(error instanceof Unstated)) throw error;
        const place = `${error.example} ${error.step} ${error.fields.join(" ")}`;
        if (!unstated.has(place)) unstated.set(place, error.message);
      }
    }
  }
  if (unstated.size > 0) throw new GuardError(`${guardFile}: ${[...unstated.values()].join("; ")}`);

  return {
    name,
    root,
    folder,
    items,
    binding: declaration,
    sample: file.sample,
    examples: file.examples,
    readings,
    faults,
    inputs: sortInputs(inputs),
  };
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/*
 * Guards package, DR-252: the approval record. A guard's inputs are
 * its items and its files, each under a label (`item <id>` or
 * `file <path from the root>`) with one SHA-256 digest. The record,
 * `guards/<guard>/approval.json`, is a committed file holding the
 * digests a person approved; a run compares the inputs with it and
 * names each one that changed, was added or is gone.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GuardError, byText, mapping, showData } from "./types.js";

/** Digests by label, labels in order. */
export type Inputs = Record<string, string>;

/** The label of an item input. */
export function itemLabel(id: string): string {
  return `item ${id}`;
}

/** The label of a file input; `path` is relative to the root, with `/`. */
export function fileLabel(path: string): string {
  return `file ${path}`;
}

/**
 * The digest of one input: SHA-256, in hex, of its text with LF line
 * endings, so a checkout with CRLF endings digests the same. Bytes
 * that are not UTF-8 text are digested as they are.
 */
export function digest(content: Buffer | string): string {
  let text: string | null;
  if (typeof content === "string") text = content;
  else {
    text = content.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(content)) text = null;
  }
  const hash = createHash("sha256");
  hash.update(text === null ? (content as Buffer) : Buffer.from(text.replace(/\r\n/g, "\n"), "utf8"));
  return hash.digest("hex");
}

/** The same inputs with their labels in order. */
export function sortInputs(inputs: Inputs): Inputs {
  const sorted: Inputs = {};
  for (const label of Object.keys(inputs).sort(byText)) sorted[label] = inputs[label];
  return sorted;
}

/** How a guard's inputs stand against its approval record. Each list
 * holds labels in order. */
export type ApprovalState = {
  /** There is a record and nothing changed, was added or is gone. */
  approved: boolean;
  /** There is a record at all. */
  recorded: boolean;
  changed: string[];
  /** In the tree, not in the record. */
  added: string[];
  /** In the record, not in the tree. */
  gone: string[];
};

/** Compare a guard's inputs with its record (`null`: no record). */
export function compareApproval(inputs: Inputs, record: Inputs | null): ApprovalState {
  if (record === null) {
    return { approved: false, recorded: false, changed: [], added: Object.keys(inputs).sort(byText), gone: [] };
  }
  const changed: string[] = [];
  const added: string[] = [];
  for (const label of Object.keys(inputs).sort(byText)) {
    if (!Object.hasOwn(record, label)) added.push(label);
    else if (record[label] !== inputs[label]) changed.push(label);
  }
  const gone = Object.keys(record)
    .filter((label) => !Object.hasOwn(inputs, label))
    .sort(byText);
  return {
    approved: changed.length === 0 && added.length === 0 && gone.length === 0,
    recorded: true,
    changed,
    added,
    gone,
  };
}

/** Where a guard's approval record is, relative to the root. */
export function approvalPath(guard: string): string {
  return `guards/${guard}/approval.json`;
}

/** The record's text: keys in order, two-space indent, a final
 * newline. */
export function approvalText(inputs: Inputs): string {
  return `${JSON.stringify({ format: 1, inputs: sortInputs(inputs) }, null, 2)}\n`;
}

/** Read a record's text. Throws a GuardError saying what is wrong
 * with it. */
export function parseApproval(text: string): Inputs {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GuardError("not readable as JSON");
  }
  const top = mapping(data, ["format", "inputs"]);
  if (top.format !== 1) throw new GuardError("format must be 1");
  const inputs: Inputs = {};
  const recorded = mapping(top.inputs);
  for (const label of Object.keys(recorded).sort(byText)) {
    const value = recorded[label];
    if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
      throw new GuardError(`'${label}' holds ${showData(value)}, not a SHA-256 digest`);
    }
    if (!label.startsWith("item ") && !label.startsWith("file ")) {
      throw new GuardError(`'${label}' is not an input's label`);
    }
    inputs[label] = value;
  }
  return inputs;
}

/**
 * Read a guard's approval record, or null when there is none. A
 * record that cannot be read is a GuardError starting with its path.
 */
export function readApproval(root: string, guard: string): Inputs | null {
  const path = approvalPath(guard);
  const file = join(root, ...path.split("/"));
  if (!existsSync(file)) return null;
  try {
    return parseApproval(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof GuardError) throw new GuardError(`${path}: ${error.message}`);
    throw error;
  }
}

/** Write a guard's approval record. Returns its path from the root. */
export function writeApproval(root: string, guard: string, inputs: Inputs): string {
  const path = approvalPath(guard);
  writeFileSync(join(root, ...path.split("/")), approvalText(inputs));
  return path;
}

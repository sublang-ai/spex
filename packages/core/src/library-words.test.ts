// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The package-manager library's diagnostics read in the home's language
// (core-service-111, DR-165): the core installs its catalog's phrasing
// into the library when its i18n module loads, so a storage diagnostic
// the library raises reads as the core's own do. Every phrase is checked
// in Chinese, and one raised error end to end.

import { test } from "node:test";
import assert from "node:assert/strict";

import { closed, knownFormat, listed, StorageFormatError, VersionConflictError } from "@sublang/spex/files";
import { words, type LibraryWords } from "@sublang/spex/words";
import { speak } from "./i18n.js";

// Each phrase with the values it names: a Record over every key, so a
// phrase added to the library is a compile error here until it is listed.
const SAMPLES: { [K in keyof LibraryWords]: Parameters<LibraryWords[K]> } = {
  listSeparator: [],
  storageFault: ["f.yaml", "r"],
  expectedObject: [],
  expectedFields: ["a", "b"],
  optionalFields: ["c"],
  unsupportedFormat: ["9"],
  unsupportedUnnamedFormat: [],
  changedMeanwhile: ["f.yaml"],
  invalidHome: [],
  notAnOrigin: ["https://…@x"],
  homeBeforeInstances: [],
  instancesShareFolder: ["https://a", "https://b", "@a"],
};

function phrased(): Record<string, string> {
  const current = words() as unknown as Record<string, (...args: string[]) => string>;
  return Object.fromEntries(Object.entries(SAMPLES).map(([key, args]) => [key, current[key]!(...(args as string[]))]));
}

test("core-service-111: every phrase the library composes reads in the home's language", (t) => {
  t.after(() => speak("en"));
  speak("en");
  const english = phrased();
  speak("zh");
  const chinese = phrased();
  for (const key of Object.keys(SAMPLES)) {
    assert.notEqual(chinese[key], english[key], `${key} reads in Chinese, not the library's English`);
  }
  assert.equal(chinese.listSeparator, "、");
});

test("core-service-111: a storage diagnostic the library raises reads in the home's language", (t) => {
  t.after(() => speak("en"));
  speak("zh");
  assert.throws(() => closed({}, ["b", "c"], ["d"], "f.yaml"), (error: unknown) =>
    error instanceof StorageFormatError && error.message === "f.yaml：应包含字段 b、c；可选字段 d");
  assert.throws(() => knownFormat({ format: 7 }, "g.yaml"), (error: unknown) =>
    error instanceof StorageFormatError && error.message === "g.yaml：不支持的格式 7；已原样保留");
  assert.equal(new VersionConflictError("h.yaml").message, "h.yaml 在此期间已更改；请重试");
  assert.equal(listed(["x", "y"]), "x、y");
  speak("en");
  assert.equal(new VersionConflictError("h.yaml").message, "h.yaml changed meanwhile; retry");
  assert.equal(listed(["x", "y"]), "x, y");
});

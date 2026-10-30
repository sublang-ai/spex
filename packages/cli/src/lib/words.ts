// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The library's reader-facing words (DR-165): the few phrases its
// storage diagnostics compose, each a function of the values it names.
// They read in English unless the host installs its own phrasing: the
// command line speaks English, while the app's core installs its
// catalog once, so every diagnostic the library raises reads in the
// home's interface language exactly as the core's own do. Everything
// else the library raises carries a stable code or reason and the
// host's own words, which each host phrases where it speaks.

/** Every phrase the library composes. */
export interface LibraryWords {
  /** Separates names listed in one message. */
  listSeparator(): string;
  /** A storage fault as one line: the file, then the reason. */
  storageFault(file: string, reason: string): string;
  /** A record in a file is not an object. */
  expectedObject(): string;
  /** A closed record's fields; `optional` is `optionalFields(...)` or empty. */
  expectedFields(required: string, optional: string): string;
  /** The clause naming the fields a record may also carry. */
  optionalFields(fields: string): string;
  /** A file names a layout version this Spex does not read. */
  unsupportedFormat(format: string): string;
  /** A file names a layout version that is no number. */
  unsupportedUnnamedFormat(): string;
  /** A file changed between a read and a write under its version. */
  changedMeanwhile(file: string): string;
  /** `home.yaml`'s own fields are malformed. */
  invalidHome(): string;
  /** A host URL is not an instance's origin written canonically. */
  notAnOrigin(url: string): string;
  /** `home.yaml` still holds the layout before the instances migration. */
  homeBeforeInstances(): string;
  /** Two instances `home.yaml` lists would share one folder. */
  instancesShareFolder(first: string, second: string, folder: string): string;
}

const ENGLISH: LibraryWords = {
  listSeparator: () => ", ",
  storageFault: (file, reason) => `${file}: ${reason}`,
  expectedObject: () => "expected an object",
  expectedFields: (required, optional) => `expected fields ${required}${optional}`,
  optionalFields: (fields) => `; optional ${fields}`,
  unsupportedFormat: (format) => `unsupported format ${format}; preserved unchanged`,
  unsupportedUnnamedFormat: () => "unsupported format; preserved unchanged",
  changedMeanwhile: (file) => `${file} changed meanwhile; retry`,
  invalidHome: () => "invalid home file",
  notAnOrigin: (url) => `${url} is not an instance's origin`,
  homeBeforeInstances: () => "format 1: the instances migration has not run; preserved unchanged",
  instancesShareFolder: (first, second, folder) => `instances ${first} and ${second} share the folder ${folder}`,
};

let current: LibraryWords = ENGLISH;

/** The phrasing in force. */
export function words(): LibraryWords {
  return current;
}

/** Install a host's phrasing; a phrase it leaves out reads in English. */
export function phraseLibrary(phrasing: Partial<LibraryWords>): void {
  current = { ...ENGLISH, ...phrasing };
}

// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The core's own tongue (core-service-111, DR-079): text the core
// composes for the reader — a refusal's message, a config error, a
// readiness requirement, a diagnostic's reason — reads from these
// catalogs in the home's interface language. Text relayed from a
// runtime, a tool, a file or a library, a message naming an internal
// failure for a developer, and a wire text the page matches to phrase
// itself are not the core's own words and stay as they are.
//
// Every composed text is `i18n._("English text")` with that exact
// identifier: the extractor reads the call, not the value, so an alias
// would leave the message out of the catalog the build gates.
//
// One singleton for the process, `@lingui/core`'s own: an embedding
// shell that speaks too (the desktop's catalogs) shares it, and since
// both resolve the same home choice the two never disagree. The
// catalogs beside this file are compiled from `src/locales/<language>/
// messages.po` by `lingui compile` before tsc runs; they are build
// output, not source.

import { i18n } from "@lingui/core";
import { phraseLibrary } from "@sublang/spex/words";

import type { Language } from "./language.js";
import { messages as en } from "./locales/en/messages.js";
import { messages as zh } from "./locales/zh/messages.js";

// Loaded once, at this module's first evaluation: activation is what
// changes language, and it costs nothing to hold both catalogs.
i18n.load({ en, zh });
// Text composed before any host resolves the home's choice still reads
// — a translation function with no locale throws — so the source
// language stands until `speak` names another. A shell that activated
// one first keeps it: the home's choice is resolved, never guessed.
if (!i18n.locale) i18n.activate("en");

export { i18n };

// The package-manager library's diagnostics read in the home's language
// too (DR-165): its phrases are installed once, each composed at the
// instant it is raised, as the core's own are.
phraseLibrary({
  listSeparator: () => i18n._({ id: ", ", comment: "Separates names listed in one message" }),
  storageFault: (file, reason) => i18n._({ id: "{file}: {reason}", comment: "A storage fault as one line: the file, then the reason — itself a message",
    values: { file, reason } }),
  expectedObject: () => i18n._({ id: "expected an object", comment: "Storage diagnostic: a record in the file is not an object" }),
  expectedFields: (required, optional) => i18n._({ id: "expected fields {required}{optional}",
    comment: "Storage diagnostic; the field names are the file format's own, and the optional clause is itself a message",
    values: { required, optional } }),
  optionalFields: (fields) => i18n._({ id: "; optional {fields}", comment: "Clause naming the fields a record may also carry", values: { fields } }),
  unsupportedFormat: (format) => i18n._({ id: "unsupported format {format}; preserved unchanged",
    comment: "Storage diagnostic: the file names a layout version this Spex does not read; the file is left as it is",
    values: { format } }),
  unsupportedUnnamedFormat: () => i18n._({ id: "unsupported format; preserved unchanged", comment: "Storage diagnostic: a credentials file names a layout version that is no number, which is not repeated; the file is left as it is" }),
  changedMeanwhile: (file) => i18n._({ id: "{file} changed meanwhile; retry", comment: "Refusal: a file changed between the core's read and its write; the reader retries",
    values: { file } }),
  invalidHome: () => i18n._({ id: "invalid fields", comment: "Storage diagnostic on home.yaml: its own fields are malformed" }),
  notAnOrigin: (url) => i18n._({ id: "{url} is not a Space's address",
    comment: "Storage diagnostic: a URL is not a Space's address written canonically — http or https (http on localhost or 127.x alone), a lowercase host of DNS labels (letters, digits and inner hyphens) joined by single dots, and a port from 1 to 65535 other than the scheme's default, nothing else; the URL is shown with any user info as …",
    values: { url } }),
  homeBeforeInstances: () => i18n._({ id: "format 1: the migration to several Spaces has not run; preserved unchanged",
    comment: "Storage diagnostic: home.yaml is still in the layout before it listed several Spaces, which a one-time migration rewrites; the file is left as it is" }),
  instancesShareFolder: (first, second, folder) => i18n._({ id: "Spaces {first} and {second} share the folder {folder}",
    comment: "Storage diagnostic: two Spaces home.yaml lists, or one listed twice, would hold their records in one folder under workspace/; {first} and {second} are their addresses",
    values: { first, second, folder } }),
});

/**
 * Speak `language` from here on (localization-2): the resolved
 * interface language, activated when it differs from the one in force,
 * so the next text the core composes reads in it.
 */
export function speak(language: Language): void {
  if (i18n.locale !== language) i18n.activate(language);
}

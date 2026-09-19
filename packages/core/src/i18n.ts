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

/**
 * Speak `language` from here on (localization-2): the resolved
 * interface language, activated when it differs from the one in force,
 * so the next text the core composes reads in it.
 */
export function speak(language: Language): void {
  if (i18n.locale !== language) i18n.activate(language);
}

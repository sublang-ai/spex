// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The house API for translated text (localization-4, DR-078). Every
// text the interface composes is `i18n._("English text")`: the English
// text is the message's identity, values and plurals are ICU
// MessageFormat, and the catalogs beside this source carry each
// language. Lingui's runtime without its macros — the renderer builds
// on Vite's native transformer and has no Babel stage.
//
//   i18n._("Settings")
//   i18n._("{count} playbooks", { count })
//   i18n._("{count, plural, one {# playbook} other {# playbooks}}", { count })
//   i18n._({ id: "Keep", comment: "confirm: keep the draft" })
//   i18n._({ id: "open.verb", message: "Open" })   // two translations
//
// A table of phrases holds thunks — `() => i18n._("…")` — never
// strings evaluated at module load, or the table would freeze the
// language it was imported in.

import { i18n } from "@lingui/core";
import type { Messages } from "@lingui/core";
import type { Language } from "@sublang/spex-core/language";

// The Vite plugin compiles each catalog on import, so a language is
// in the bundle rather than fetched: both shells load one file.
import { messages as en } from "../locales/en/messages.po";
import { messages as zh } from "../locales/zh/messages.po";

export { i18n };
export type { Language };

const CATALOGS: Record<Language, Messages> = { en, zh };

/**
 * Render every later text in this language and say so on the document
 * (localization-3), so fonts and glyph forms follow it.
 */
export function activateLanguage(language: Language): void {
  i18n.load(language, CATALOGS[language]);
  i18n.activate(language);
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
}

// English stands until the store settles the reader's choice, which it
// does on import, before the first render: no module that reads a text
// on its way up ever finds the runtime without a language.
activateLanguage("en");

/**
 * The locale every format takes (localization-5): a moment, a clock
 * time, a number and a sorted list follow the interface language, not
 * the browser's.
 */
export function currentLocale(): Language {
  const active = i18n.locale;
  return active === "zh" ? "zh" : "en";
}

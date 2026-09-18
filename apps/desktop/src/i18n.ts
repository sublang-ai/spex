// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The shell's own tongue (app-shell-29, DR-078): the main process
// composes notifications and dialogs from its catalogs, in the
// language the home reads. Callers resolve the language first
// (resolveLanguage over the home's stored choice and the OS's
// preferred languages) and activate it at compose time, so a choice
// made in Settings reaches the very next notification.
//
// The catalogs beside this file are compiled from `src/locales/
// <language>/messages.po` by `lingui compile` before tsc runs; they
// are build output, not source.

import { i18n } from "@lingui/core";
import type { I18n } from "@lingui/core";
import type { Language } from "@sublang/spex-core/language";

import { messages as en } from "./locales/en/messages.js";
import { messages as zh } from "./locales/zh/messages.js";

i18n.load({ en, zh });

/**
 * Activate `language` on the shell's shared i18n and hand it back, so
 * the text composed next reads that language.
 */
export function speak(language: Language): I18n {
  if (i18n.locale !== language) i18n.activate(language);
  return i18n;
}

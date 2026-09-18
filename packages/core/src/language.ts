// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

// The offered interface languages and the resolution of the reader's
// choice (localization-1, localization-2, DR-078). Both shells resolve
// the same way — a page from the browser's languages, the desktop
// shell from the OS's — so this module stays pure and browser-safe:
// no Node import, nothing from the rest of the core, so the UI bundle
// imports it as it imports the protocol.

/** The languages the interface is offered in (localization-1). */
export const LANGUAGES = ["en", "zh"] as const;

/** An offered language code; `zh` means Simplified Chinese. */
export type Language = (typeof LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** The offered language a BCP 47 tag asks for, or none: English, or
 * Chinese in the simplified script — a Traditional-script reader is
 * asking for a script no catalog holds. A malformed tag matches
 * nothing rather than throwing. */
function match(tag: string): Language | undefined {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(tag).maximize();
  } catch {
    return undefined;
  }
  if (locale.language === "en") return "en";
  if (locale.language === "zh" && locale.script === "Hans") return "zh";
  return undefined;
}

/**
 * The interface language a client renders in (localization-2): the
 * home's stored choice, or with none the first of the client's own
 * preferred languages that is offered, and `en` when none is.
 */
export function resolveLanguage(
  choice: Language | null | undefined,
  preferred: readonly string[],
): Language {
  if (isLanguage(choice)) return choice;
  for (const tag of preferred) {
    const offered = match(tag);
    if (offered) return offered;
  }
  return "en";
}

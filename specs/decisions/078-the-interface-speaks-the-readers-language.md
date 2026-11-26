<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-078: The Interface Speaks the Reader's Language

## Status

Accepted (2026-09-18).
Amends [DR-010](010-interface-craft.md), [DR-013](013-sublang-brand.md), [DR-041](041-chrome-that-fits.md).
Amended by [DR-079](079-the-core-speaks-the-homes-language.md), [DR-172](172-surfaces-a-fresh-user-reads.md).

## Context

- The owner asked for a Simplified Chinese interface on both shells, kept simple and open for a human to review and adjust every translation.
- Every word the interface shows is an English literal in the renderer's source — fifty-odd components and a few phrase tables — and the desktop shell composes its own notifications and dialogs in its main process; nothing in either shell asks which language the reader reads.
- The scaffold already writes a `zh` specs tree ([DR-001](001-scaffold-localization.md)), so a Chinese author writes specs in Chinese and runs the app in English.
- Both shells render one UI bundle ([DR-002](002-desktop-app-architecture.md), [DR-033](033-remote-gui-serving.md)): a served page's languages are the browser's and a desktop window's are the OS's, while a Spex home has one reader, whose choice should reach every page of it and the desktop's own notifications.
- Moments and clock times already format in the browser's locale; ages, durations and counts are hand-built English; the fit law counts characters ([DR-041](041-chrome-that-fits.md)), and a Chinese character is about twice as wide as a Latin one.
- The settled practice for an application interface: the English text is the message's identity, placeholders and plurals are ICU MessageFormat, each language is one gettext catalog that every translator's tool opens, and a build refuses an incomplete language.
- The renderer builds with no Babel stage (Vite 8 on its native transformer), so a library's compile-time macros would cost a second transformer for the sake of sugar.

## Decision

### §11 The interface speaks the reader's language

- **One source, rendered per language.** Interface text is authored in English and spec items state it in English; a translation renders the same text in another offered language, and every rule about interface text — its budget, its phrasing law, its literal words, its accessible name — holds for the rendered text in each offered language.
  A character budget counts the English text; its translation fits the control the English text fits.
- **Offered languages: `en` and `zh`**, the codes [DR-001](001-scaffold-localization.md) fixed, `zh` meaning Simplified Chinese; a specs tree's authoring language and the reader's interface language stay two choices.
  A language is offered only whole: a build fails when any message lacks its translation, so no page mixes languages.
- **One choice per home.** The interface language is a preference of the Spex home, kept with the core's own preferences: an offered language, or none, meaning the reader's system.
  Settings offers System, English and 简体中文; the choice reaches every page of the home and the desktop shell's own notifications and dialogs.
- **System resolves on the client.** With no choice stored, each client takes the first of its own preferred languages — the browser's for a page, the OS's for the desktop shell — that is offered, reading Chinese in the simplified script as `zh`, and English when none is; a Traditional-script system reads English rather than a script it did not ask for.
  A page keeps the last choice it saw so its first paint already speaks it, and follows a different stored choice once it has read it.
- **Open catalogs.** Each package that speaks — the UI bundle and the desktop shell — keeps one gettext `.po` catalog per offered language beside its source, extracted from the source by a command: the English text is the entry's `msgid`, its source files are referenced, and the Chinese is the `msgstr` a human edits in place.
  Messages are ICU MessageFormat, so a count takes the language's own plural forms; a glossary beside the catalogs fixes the Chinese term for each product noun ([DR-172](172-surfaces-a-fresh-user-reads.md)) and keeps the role names Playbook defines as authored.
- **Every text passes through the catalog**, names included, so a reader's term is a catalog edit; machine identifiers and names carried by data stay as they are.
- **Formatting follows the interface language.** A moment, a clock time, a number and a sorted list format in the resolved language, not the browser's; ages and durations are messages, so their units translate.
- **The page says its language.** The document declares the resolved language, so fonts and glyphs follow it; the sans and mono stacks name the platforms' Simplified Chinese faces after their Latin faces.
- **The runtime.** Lingui's runtime and catalog tooling without its macros: the English text is the key, a `.po` file is the catalog, the Vite plugin compiles catalogs on import, and the CLI extracts and checks.

This adds §11 to [DR-010](010-interface-craft.md)'s principles, makes [DR-041](041-chrome-that-fits.md)'s character budget count the English text, its other fit rules standing, and has each of [DR-013](013-sublang-brand.md)'s type stacks name the platforms' Simplified Chinese faces after its Latin faces, the brand faces standing.

Considered and declined:

- A per-page preference in browser storage: simplest, but the desktop shell's own notifications could not follow it, and a reader with two pages would choose twice.
- The shared playbook config as the store: it belongs to the project and the CLI and travels through the Space; the language is the reader's.
- Compile-time macros: the renderer has no Babel stage, and the plain runtime API with English keys needs none.
- Traditional Chinese: not offered; nothing is guessed from a script the catalog does not hold.

## Consequences

- A `localization` package states the offered languages, the choice and its resolution, the catalogs and their gate, and formatting; Settings gains the language control, the preference store gains its key, the core protocol gains `language.get`, `language.set` and `language.state`, and the desktop shell's notifications and dialogs speak the home's language.
- Every string in the renderer is wrapped; hand-built plurals become ICU plurals; the time vocabulary becomes messages; every locale-sensitive format takes the interface language.
- The app requires Node.js 22 or later, the floor of the catalog tooling.
- Journeys pin the browser to `en-US` so the suite keeps asserting English; one journey runs in Chinese, and the fit journey measures Chinese labels at the narrowest width.
- Spec items that quote interface text keep quoting English; no item is rewritten for translation.
- Prose the core authors speaks the home's language too ([DR-079](079-the-core-speaks-the-homes-language.md)).
  The record-status classifier ([DR-038](038-history-is-done-work.md)) reads English status words from a specs tree, a matter of the authoring language, not the interface's.

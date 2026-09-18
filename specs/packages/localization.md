<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# localization: Interface Language

## Intent

This package makes the interface speak the reader's language on both shells ([DR-078](../decisions/078-the-interface-speaks-the-readers-language.md)): one English source, one choice per Spex home, complete translations kept in catalogs a human reviews in place, and formatting that follows the chosen language.
It owns the offered languages, the resolution of the choice, the catalogs and their gate, and locale-sensitive formatting; the surfaces that show the text and the core that stores the choice keep their own contracts.

## External Behavior

### Languages

#### localization-1

The interface shall offer the languages `en` (English) and `zh` (Simplified Chinese), authoring every interface text in English and rendering it in the resolved language, so that every requirement stated on interface text — a literal phrase, a budget, an accessible name — holds for the rendered text in each offered language:

- a character budget counts the English text, and its translation fits the control the English text fits ([DR-041](../decisions/041-chrome-that-fits.md));
- machine identifiers and names carried by data render as they are in every language.

### The Choice

#### localization-2

When a client of the home — a page in either shell, or the desktop shell for its own text — needs the interface language, the client shall resolve it as the home's stored choice [[core-service-108](core-service.md#core-service-108)], or with none stored as the first of the client's preferred languages — the browser's for a page, the operating system's for the desktop shell — that is offered, Chinese in the simplified script reading as `zh`, and `en` when none is.

#### localization-3

When a page starts, the page shall paint in the choice it last read, kept in its own storage, then read the home's choice once connected [[core-service-108](core-service.md#core-service-108)] and follow every later `language.state` [[core-service-109](core-service.md#core-service-109)], re-rendering whole whenever the resolution [[localization-2](#localization-2)] changes and declaring the resolved language as the document's language attribute, so fonts and glyph forms follow it.

### Rendering

#### localization-4

When the interface renders, every text it composes — labels, headings, captions, placeholders, titles, accessible names, notifications and dialogs — shall render from the catalog of the resolved language [[localization-2](#localization-2)], with placeholders, plurals and selections expressed in ICU MessageFormat [[1]], so a count takes the language's own plural forms and no text is assembled from fragments.

#### localization-5

When the interface formats a moment, a clock time, a number, or orders names, it shall use the resolved language [[localization-2](#localization-2)] as the locale, so dates, times, digit grouping and collation follow the interface language rather than the browser's, and an age or a duration reads as a message of the catalog [[localization-4](#localization-4)].

### Catalogs

#### localization-6

Each package that composes interface text — the UI bundle and the desktop shell — shall keep one gettext PO catalog [[2]] per offered language as `locales/<language>/messages.po`, beside the UI bundle's source and inside the desktop shell's, extracted from the package's source by its `i18n:extract` script:

- an entry's `msgid` is the English text as the source states it, its references name the source files that use it, and a comment carries the author's note for the translator where the English alone is ambiguous;
- the `zh` entry's `msgstr` is the translation, edited in place by a human or an agent; an empty `msgstr` is a missing translation;
- entries are ordered by message, and extraction removes entries no source uses;
- a glossary beside the UI bundle's catalogs fixes the Chinese term for each product noun and keeps the role names Playbook defines as authored, and every translation follows it.

#### localization-7

When a speaking package builds, the build shall fail when a catalog is out of step with the source, a `zh` entry lacks its translation, or a message does not compile as ICU MessageFormat, so that an offered language is whole in every build [[localization-6](#localization-6)].

## Verification

### Catalog Coverage

#### localization-8

Where a speaking package's catalogs stand beside its source, when the package's test suite runs, the test suite shall run the package's catalog checks and assert that the `en` and `zh` catalogs list every message the source uses and no other [[localization-6](#localization-6)], that every `zh` entry carries a translation and every message compiles [[localization-7](#localization-7)].

### Rendering Coverage

#### localization-9

Where the UI renders against fixture state with `zh` resolved, the test suite shall assert that the navigation rail, the Dashboard and the Settings surface read their Chinese labels [[localization-4](#localization-4)], that the document's language attribute reads `zh` [[localization-3](#localization-3)], that a count's phrase takes the Chinese plural form and a clock time formats for `zh` [[localization-5](#localization-5)], and that with no stored choice the browser languages `zh-CN`, `zh-Hans-SG` and `["fr", "zh-CN"]` resolve to `zh` while `zh-TW`, `fr` and `["en-GB", "zh-CN"]` resolve to `en` [[localization-2](#localization-2)].

### Browser Journeys

#### localization-10

Where the browser journey harness ([DR-039](../decisions/039-browser-acceptance-journeys.md)) boots the served shell, the test suite shall assert through the page:

- opened with the browser language `zh-CN` and no stored choice, the page speaks Chinese and declares `zh` [[localization-2](#localization-2)] [[localization-3](#localization-3)];
- opened with `en-US`, choosing 简体中文 in Settings re-renders the page in Chinese without a reload, a second page of the same home opens in Chinese, and choosing System returns both to English [[localization-3](#localization-3)];
- at the 320-pixel viewport with the sidebar collapsed, the Dashboard and Settings surfaces in Chinese scroll in neither direction and no two visible siblings overlap [[localization-1](#localization-1)] ([DR-041](../decisions/041-chrome-that-fits.md)).

## References

[1]: https://unicode-org.github.io/icu/userguide/format_parse/messages/ "ICU MessageFormat"
[2]: https://www.gnu.org/software/gettext/manual/html_node/PO-Files.html "GNU gettext: PO Files"

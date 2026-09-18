<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-083: Interface Language Realization

## Status

In progress (2026-09-18).

## Intent

Realize [DR-078](../decisions/078-the-interface-speaks-the-readers-language.md) and the `localization` package: Simplified Chinese on both shells, one choice per Spex home, open catalogs a human reviews in place, and a build that refuses an incomplete language.

## Deliverables

- [ ] The UI bundle and the desktop shell render every text they compose from `.po` catalogs keyed by the English text, with ICU plurals; a build fails on a missing translation or a stale catalog.
- [ ] The core stores the home's interface language and serves `language.get`, `language.set` and `language.state`; Settings offers System, English and 简体中文; a page paints in the last choice it read and follows the home's.
- [ ] Formatting follows the interface language, the document declares it, and the type stacks name Chinese faces.
- [ ] A complete Simplified Chinese translation of both catalogs, following the glossary and the label budget.
- [ ] Coverage: catalog checks, rendering in `zh`, the language journey, fit in Chinese, and the desktop shell's notification language.

## Tasks

Each task below is exactly one commit and runs its focused gate before the next begins.

1. Specs: the decision record, the `localization` package, the Settings, core-service, storage and app-shell items, the map, and the reciprocal status lines.
2. Foundation: catalog tooling in both speaking packages, the UI language module, the core's language preference and protocol, the desktop shell's own catalog, the Settings control, fonts and document language, the Node 22 floor.
3. Every renderer string through the catalog — app chrome, Dashboard, Projects, Space, spec view, Library, Settings, run view and the shared tables — with hand-built plurals as ICU plurals.
4. The Simplified Chinese catalogs and the glossary.
5. Coverage and closure: rendering tests, the language journey, fit in Chinese, the notification test, the full gates, and the changelog.

## Verification

Planned: task 2 runs `npm run build`, `npm test -w packages/core`, `npm test -w packages/ui` and `npm test -w apps/desktop`; task 3 runs `npm run build -w packages/ui` and `npm test -w packages/ui`; task 4 runs the catalog checks of both packages; task 5 runs `npm run build`, `npm test`, `npm run e2e`, and `spex lint`.

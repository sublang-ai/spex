<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-084: Core Prose in the Reader's Language

## Status

In progress (2026-09-18).

## Intent

Realize [DR-079](../decisions/079-the-core-speaks-the-homes-language.md) and the current package contracts: the core phrases the text it composes for the reader in the home's language, live state re-reads on a change, the desktop passes the OS's languages, the page keeps the Saved tick across a language change, and Node 22 is the floor of every package.

## Deliverables

- [ ] The core keeps `en` and `zh` catalogs, phrases every reader-facing message it composes from them in the home's language, resolved from the stored choice or the system languages its host passes, and its build refuses a missing translation.
- [ ] A language change re-derives and broadcasts the states the core caches, and the page re-reads the config, readiness, the Space and diagnostics; records keep their language.
- [ ] The page phrases pipeline stage names itself, recognizes a withheld read by kind, and shows the Saved tick after a language change.
- [ ] Every package declares Node 22; the CLI changelog and the release notes say so.
- [ ] Coverage: the core's catalog check, a core test reading Chinese config errors, readiness requirements and refusals after the choice, and a journey seeing a Chinese core message on a Chinese page.

## Tasks

Each task below is exactly one commit and runs its focused gate before the next begins.

1. Specs: the decision record, the localization, core-service, app-shell and settings items, the floor in DR-040's status and app-shell, the map.
2. Core foundation: catalog tooling, the core's language module and its activation on `language.set`, system languages from the host, re-derivation on change, the English test harness, the desktop passing the OS's languages.
3. Page and floor: the Saved tick kept in the store, stage names and the withheld kind in the page, re-reading on `language.state`, 规程 for playbook, Node 22 in every package with the CLI changelog.
4. Every reader-facing message the core composes through its catalog, with the Simplified Chinese translation.
5. Coverage and closure: the core test, the journey, the full gates.

## Verification

Planned: task 2 runs `npm run build -w packages/core`, `npm test -w packages/core` and `npm run build -w apps/desktop`; task 3 runs `npm run build -w packages/ui`, `npm test -w packages/ui` and `npm test -w packages/cli`; task 4 runs `npm run build -w packages/core` and `npm test -w packages/core`; task 5 runs `npm run build`, `npm test`, `npm run e2e`, and `spex lint`.

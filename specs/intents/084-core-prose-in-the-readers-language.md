<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-084: Core Prose in the Reader's Language

## Status

Done (2026-09-18): all four tasks completed; see Verification.

## Intent

Realize [DR-079](../decisions/079-the-core-speaks-the-homes-language.md) and the current package contracts: the core phrases the text it composes for the reader in the home's language, live state re-reads on a change, the desktop passes the OS's languages, the page keeps the Saved tick across a language change, and Node 22 is the floor of every package.

## Deliverables

- [x] The core keeps `en` and `zh` catalogs, phrases every reader-facing message it composes from them in the home's language, resolved from the stored choice or the system languages its host passes, and its build refuses a missing translation.
- [x] A language change re-derives and broadcasts the states the core caches, and the page re-reads the config, readiness, the Space and diagnostics; records keep their language.
- [x] The page phrases pipeline stage names itself, recognizes a withheld read by kind, and shows the Saved tick after a language change.
- [x] Every package declares Node 22; the CLI changelog and the release notes say so.
- [x] Coverage: the core's catalog check, a core test reading Chinese config errors, readiness requirements and refusals after the choice, and a journey seeing a Chinese core message on a Chinese page.

## Tasks

Each task below is exactly one commit and runs its focused gate before the next begins.

1. Specs: the decision record, the localization, core-service, app-shell and settings items, the floor in DR-040's status and app-shell, the map.
2. Page and floor: the Saved tick kept in the store, stage names and the withheld kind in the page, re-reading on `language.state`, 规程 for playbook, Node 22 in every package with the CLI changelog.
3. The core speaks: catalog tooling, the core's language module and its activation on `language.set`, system languages from the host, re-derivation on change, the English test harness, the desktop passing the OS's languages, every reader-facing message the core composes through its catalog, and the Simplified Chinese translation.
4. Coverage and closure: the journey, the full gates.

## Verification

Planned: task 2 runs `npm run build -w packages/ui`, `npm test -w packages/ui` and `npm test -w packages/cli`; task 3 runs `npm run build -w packages/core`, `npm test -w packages/core` and `npm run build -w apps/desktop`; task 4 runs `npm run build`, `npm test`, `npm run e2e`, and `spex lint`.
Task 1 (2026-09-18): `spex lint` passed.
Task 2 (2026-09-18): the UI build passed with both catalog checks whole; UI 717/717; CLI 133/133; the language journeys 3/3 on the root build.
Task 3 (2026-09-18): the core build passed with its catalog whole and compiling (370 messages, all translated); core 322/322; desktop build and 14/14; UI build and 717/717.
Task 4 (2026-09-18): the root build passed; the root test gate passed 1,218/1,218 (22 script, 133 CLI, 322 core, 717 UI, 14 desktop, and 10 server tests); the full browser suite passed 61/61, including the four language journeys; `spex lint` passed.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-083: A Finished Operation's Words Keep Their Language

## Status

Accepted (2026-09-24) on a review finding against [DR-079](079-the-core-speaks-the-homes-language.md): the core re-derives the config's errors and the readiness requirements on a change of the choice, but the storage diagnostics its store raised at load and a Space stop's message and guidance stayed as they were composed, and a start phrased those diagnostics before the stored choice was spoken.
Amends [DR-079](079-the-core-speaks-the-homes-language.md), which remains accepted, in the scope of the re-derivation alone: what a finished operation composed keeps its language until that operation runs again, and the start speaks the stored choice before anything is composed.

## Context

- A storage diagnostic raised at load, and a Space stop, are the outcome of one operation — a start, a sync, a save — whose words the store and the machine keep as strings across some thirty sites, folded and compared by other code.
- Re-phrasing them on a change of language would mean keeping each message's identity and facts beside its words, or re-running the operation; the store's reload rebuilds every index and drops the forge cache's lists, which the Dashboard keeps.
- The change is rare and the condition rarer: a stop or a load-time diagnostic standing while the reader changes language, until the next start, sync or save composes it afresh.
- The start, though, phrased those diagnostics before it spoke: the core resolved the choice from the store, and the store had already raised what it found while loading.

## Decision

- What a finished operation composed keeps its language until that operation runs again: a storage diagnostic raised at load, a Space stop's message and guidance.
- The start speaks the stored choice before the store loads, reading the preference file alone, so nothing a start composes begins in another language than the home's.
- A page re-reads the core's prose whenever the home's choice changes, whether or not its own resolution moves with it — the core's language follows the choice, the page's follows the choice and the browser — and the spec trees it caches among that prose.
- A page's re-render on a change keeps every state it holds: an unsaved draft, a form under edit, a composer's text; nothing remounts.

## Consequences

- `core-service-111` names the boundary and the start's order; `localization-3` names the kept state; `localization-11` names the choice as the trigger and the spec trees among the re-read.
- The page's root no longer keys the app on the language; a full re-render carries every catalog text, which is read at render.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-034: Intent Ledger Realization

## Status

In progress

## Intent

Realize [DR-035](../decisions/035-intent-ledger.md): intents as staged Boss turns in the app store, one-gesture capture from issues/PRs/records/chat, per-project queues with position-as-priority and one after-link, dispatch by staging into the composer, the two-band attention queue (interrupted, then finished, with run stats), per-project ledger groups (history, now, up next, tabbed sources with labels), and the single core-side derivation — per the rewritten [dashboard](../packages/dashboard.md) package and the amended core-service, run-view, projects, forge-work-lists, and spec-view packages.

## Deliverables

- [ ] DR-035 accepted with the DR-011 amendment applied; the dashboard package rewritten and the peer packages amended, lint-clean.
- [ ] Core: intents table and commands, dispatch binding on submit, the ledger fold (states, two-band attention, run stats), broadcasts, and fixture-stream coverage.
- [ ] UI: the two-section Dashboard (attention bands; project groups with history scroller, now, up next, tabbed paged sources with labels), capture controls on Repo tab and Sources.
- [ ] UI: composer queue-instead-of-send and staged-intent chip, delivery cards with confirm-pulls-next, Captain home next card, attention activation focusing the intent's place.
- [ ] One attention derivation: Dashboard badge, sidebar marks, and dock badge sourced from the core fold.
- [ ] Workspace suites green; the DR-026 §9 design check recorded in both themes.

## Tasks

1. Author the spec plane: DR-035 final, DR-011 amendment, dashboard rewrite, core-service/run-view/projects/forge-work-lists/spec-view amendments, this record; `spex lint` clean.
2. Core store and protocol: intents table migration, intent command schemas and results, `intents.changed` broadcast, submit `intentId`, record-status read for intent records, protocol version bump.
3. Core ledger fold and service handlers: derived states, two-band attention with stats, invariants (one open intent per source artifact, cycle-refused after-links), history paging; integration tests over fixture streams.
4. UI Dashboard rebuild: attention bands, project groups (history scroller with paging, now, up next with keyboard reorder and blocked rendering, sources tabs with pages and labels), empty states.
5. UI capture and dispatch: Repo-tab and Sources Queue controls, composer queue-instead-of-send with the staged chip, delivery cards, Captain home next card, attention click-to-place.
6. Re-source the sidebar marks and dock badge to the core fold; retire the parallel derivations.
7. Full-suite verification and the recorded both-themes design check.

## Verification

`spex lint` clean; every workspace test suite green including the new ledger fold and Dashboard coverage; a live check of capture → queue → dispatch → interrupt/finish → confirm → pull in the running app, both themes rendered and inspected.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-011: UX Round

## Status

Done

## Intent

Rework the first-contact and daily-driver experience per the owner's review: conversational session start ([DR-007](../decisions/007-conversational-session-start.md)), native folder picking ([DR-008](../decisions/008-native-shell-bridge.md)), playbook pipeline visibility, and organized work lists — plus the friction findings from the scenario review.

## Deliverables

- [x] Start view on Sessions per [[run-view-25..27](../packages/run-view.md#run-view-25)] (composer, project selector with native picker, playbook chips, captain summary with switcher and readiness)
- [x] Native bridge in the desktop shell per [[app-shell-20](../packages/app-shell.md#app-shell-20)]
- [x] Playbook pipeline view per [[playbook-library-22..24](../packages/playbook-library.md#playbook-library-22)] (Source / Gears / State machine) with a `playbook.artifacts` protocol command
- [x] Dashboard work lists grouped by project with counts, recency order, labels, and a project filter per [[dashboard-20](../packages/dashboard.md#dashboard-20)]
- [x] Scenario-review fixes (compile progress visibility, attention navigation, reconnect/refresh correctness, dark-mode and keyboard polish)
- [x] Tests per [[run-view-29](../packages/run-view.md#run-view-29)] and [[playbook-library-25](../packages/playbook-library.md#playbook-library-25)]; acceptance verification with screenshots via the shell's acceptance mode and the fake core

## Tasks

1. **Core artifacts command** — resolve stage files next to the registry module for both layouts ([[playbook-library-24](../packages/playbook-library.md#playbook-library-24)]).
2. **Desktop bridge** — preload + `spex:pick-directory` invoke channel ([[app-shell-20](../packages/app-shell.md#app-shell-20)]).
3. **Start view** — Sessions landing per [[run-view-25..27](../packages/run-view.md#run-view-25)], tab bar with "+".
4. **Library pipeline view** — stage tabs with availability degradation ([[playbook-library-22/23](../packages/playbook-library.md#playbook-library-22)]).
5. **Dashboard organization** — grouping, labels, filter ([[dashboard-20](../packages/dashboard.md#dashboard-20)]).
6. **Scenario fixes** — from the parallel UX review findings.
7. **Tests + acceptance** — [[run-view-29](../packages/run-view.md#run-view-29)], [[playbook-library-25](../packages/playbook-library.md#playbook-library-25)], screenshot pass.

## Verification

- Root build/test green.
- Acceptance screenshots show: start view with all elements on a fresh profile; pipeline tabs for the CODE playbook; grouped work lists.
- Zero-to-first-turn achievable without leaving Sessions.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-011: UX Round

## Goal

Rework the first-contact and daily-driver experience per the
owner's review: conversational session start (DR-007), native
folder picking (DR-008), playbook pipeline visibility, and
organized work lists — plus the friction findings from the
scenario review.

## Deliverables

- [x] Start view on Sessions per RUN-25..27 (composer, project
  selector with native picker, playbook chips, captain summary
  with switcher and readiness)
- [x] Native bridge in the desktop shell per SHELL-20
- [x] Playbook pipeline view per PBLIB-22..24 (Source / Gears /
  State machine) with a `playbook.artifacts` protocol command
- [x] Dashboard work lists grouped by project with counts, recency
  order, labels, and a project filter per DASH-20
- [x] Scenario-review fixes (compile progress visibility, attention
  navigation, reconnect/refresh correctness, dark-mode and
  keyboard polish)
- [x] Tests per RUN-29 and PBLIB-25; acceptance verification with
  screenshots via the shell's acceptance mode and the fake core

## Tasks

1. **Core artifacts command** — resolve stage files next to the
   registry module for both layouts
   ([PBLIB-24](../dev/playbook-library.md#pblib-24)).

2. **Desktop bridge** — preload + `spex:pick-directory` invoke
   channel ([SHELL-20](../dev/app-shell.md#shell-20)).

3. **Start view** — Sessions landing per
   [RUN-25..27](../user/run-view.md#run-25), tab bar with "+".

4. **Library pipeline view** — stage tabs with availability
   degradation ([PBLIB-22/23](../user/playbook-library.md#pblib-22)).

5. **Dashboard organization** — grouping, labels, filter
   ([DASH-20](../user/dashboard.md#dash-20)).

6. **Scenario fixes** — from the parallel UX review findings.

7. **Tests + acceptance** — RUN-29, PBLIB-25, screenshot pass.

## Acceptance criteria

- Root build/test green.
- Acceptance screenshots show: start view with all elements on a
  fresh profile; pipeline tabs for the CODE playbook; grouped work
  lists.
- Zero-to-first-turn achievable without leaving Sessions.

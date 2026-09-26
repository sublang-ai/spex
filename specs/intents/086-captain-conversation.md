<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-086: Captain conversation

## Status

Completed on `codex/captain-conversation` and merged to `main` on 2026-09-25 after two review rounds; not released.

## Intent

Implement [DR-085](../decisions/085-boss-talks-through-captain.md).

## Deliverables

- [x] Captain-owned question wording and persistent waiting indicators.
- [x] Busy input disabled with drafts kept.
- [x] UI and browser verification.

## Tasks

1. Update the composer, message routing, and question display together with their verification.

## Verification

Exercise an active turn, a pending question, a clarification, and a later answer through Captain alone; check multiple questions and a late busy rejection.
Run the UI build and tests, spec lint, and a browser journey.

Verified 727 UI tests, 337 core tests, UI/core/server builds, English and Chinese catalogs, and browser test type checking.
Eight Chromium session journeys passed, including busy input, a question followed by clarification and an answer, and the disabled composer during a long turn.
The Playbook question-relay changes must ship with this desktop change; this branch was tested against that local Playbook branch.

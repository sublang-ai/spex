<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-129: Bound Full-Read Recovery by a Deadline

## Status

Implemented, locally verified and independently reviewed; live acceptance pending.

## Intent

Recover eligible full-read requests through repeated throttles within one fixed deadline, retaining completed work and existing failure semantics.

## Deliverables

- [x] Replace the replay count with a local 120-second recovery deadline.
- [x] Bound shared-hold waits and in-flight replays without changing other failure outcomes.
- [x] Verify changing delays, exhaustion and existing credential/cancellation budgets through integration cases.

## Tasks

1. Align the recovery contract, implementation, existing integration evidence and Unreleased notes.

## Verification

- The initial changed-client run passed 27 cases; the full-read progress and credential-replacement run passed both cases.
- Review identified the new shared-refresh wait's missing caller cancellation and its unproven concurrency path; after repair, the held-refresh and refresh-budget run passed six cases, including safe later credential storage for the other caller.
- Two separately reviewed old full-view count fixtures were incorporated from the signed correction patch; their owner verified both cases and the required checks, so those cases were not repeated here.
- Required prepush and targeted compilation passed; the existing core-service-41 sentence advisory remains.
  Final handoff checks and exact receipts are recorded externally.
- Independent review accepted the complete diff and the repaired shared-refresh path.
- The branch advances to the signed count-fixture correction with verified production/test bytes unchanged; that correction's test hunks leave this intent's net diff.
- The Unreleased note covers full-view member omission and deadline-bounded repeated throttles; both shell versions remain beta.17.
- Existing failed live receipts remain preserved; no claim that the incident's upstream cause or live recovery is resolved.

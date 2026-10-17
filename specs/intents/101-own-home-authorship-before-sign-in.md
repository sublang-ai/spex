<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-101: Own-Home Authorship Before Sign-In

## Status

Done (2026-10-17).

## Intent

Implement the "not done anything yet" condition of [DR-114](../decisions/114-groups-and-sharing-from-spex.md) exactly through [[space-59](../packages/space.md#space-59)]: a sign-in Save can carry authored configuration or environment changes, and a set-up commit subject can cover preexisting files, so neither proves that taking the instance's side loses nothing.
The existing migrated workshop homes carry a migration commit and are outside the defective automatic-adoption case.

## Deliverables

- [x] Clarify the unchanged generated-bootstrap proof and conservative choices in the Space contract.
- [x] Record durable proof only for a completely generated own-group bootstrap and compare its exact tree and history at sign-in.
- [x] Reproduce authored configuration and environment loss through the actual core, and verify their preservation, restart and preexisting-state cases alongside an untouched generated control.
- [x] Run the relevant core, build, translation and spec gates and return the focused diff for review.

## Tasks

1. In one reviewed change, record generated-bootstrap provenance, restrict automatic adoption and add the actual-core case matrix required by [[space-37](../packages/space.md#space-37)].

## Verification

The integration case matrix exercises sign-in against the loopback stand-in and real local Git without a model or live instance: authored changes saved by sign-in keep their exact local bytes and require choices, the instance's branch stays unchanged, and an untouched generated bootstrap still adopts the instance's side after restart and rename.
The focused integration matrix, all 580 core tests, core and CLI builds, translation checks and `spex lint` passed; independent review found no actionable issue.
Subsequent PR CI passed eight jobs, while macOS Node 24 exhausted a 20 s client wait in the existing creation/retry integration case after reaching Push. That path deliberately waits for five 2 s re-reads before real Git/helper work; its two retries now use the restarted creation's existing 60 s budget, with every branch, refusal and re-read assertion retained. The exact integration matrix then passed once in 101.6 s; the original CI failure is retained, not waived, and replacement exact-head CI remains the merge gate.

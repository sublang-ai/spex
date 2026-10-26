<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-122: Coherent Space State

## Status

Implemented and reviewed; bounded-scheduling diagnostic passed, final runner and integration verification pending (2026-10-25).

## Intent

Keep Space repository phases, placement lists and plans coherent when asynchronous reads overlap Check or Sync, and keep older command replies from replacing newer state in the UI.

## Deliverables

- [x] Clarify coherent readings and captured Git identities under the existing Space contract.
- [x] Reproduce the read races with real cores and controlled barriers against unchanged production code.
- [x] Repair and verify the evidenced defects after design review.
- [x] Guard state-returning UI actions against replies superseded by a newer state request or broadcast [[space-106](../packages/space.md#space-106)].

## Tasks

1. Specify, reproduce and correct coherent Space readings and UI reply ordering in one focused commit.

## Verification

- Fresh dependency installation, core build and CLI build passed.
- Spec lint passed with zero errors and the existing `core-service-41` warning.
- The single new baseline execution on Node 25.8.0 against unchanged production main `6c5e3181` failed all three witnesses in 87.62 seconds, with no timeout or setup failure:
  - the read crossing Check completion returned `sync.phase: idle` with the first placement's incoming list empty;
  - after the older recomputing read resumed, `space.diff` refused `unknown unit from-first.md`, proving the completed plan was overwritten;
  - after the captured tracking ref moved, the same read paired `behind: 0` with incoming `from-first.md`.
- The witnesses use real cores, isolated homes and two loopback stand-ins, existing Git and step barriers, and no added timing delay or changed settling helper.
- The repaired-input run of all 13 Space integration files finished with 169 passes and six failures (175 tests, zero skips/cancellations) in 1265.70 seconds.
  All four coherence witnesses and the original Check-host CI case passed.
- Five failures exceeded existing settling deadlines; their logs show progress through operations but do not establish the cause of the delays.
  The sixth failure lost the actionable Git lock error when only its final advice lines were displayed.
  The failed run and its logs remain preserved outside the repository.
- After that run, the row snapshot was simplified to capture all metadata before branch reads and return the coherent snapshot without chasing subsequent progress; repository guards and list-revision checks remain.
  Its revised integration run completed with 159 passes and 16 existing-deadline timeouts; all 175 cases ran with zero skips/cancellations.
  Three coherence cases timed out in initial fixture Sync before reaching their controlled barriers or assertions; the between-lines case and the original Check-host CI case passed.
  An isolated diagnostic of the older recomputing-read case passed its fixture, controlled barrier and retained-plan assertion in 36.50 seconds with unchanged assertions and deadlines.
  The same frozen build then passed all 175 cases with zero skips/cancellations in 2219.08 seconds when run directly with two test files concurrently, including all four coherence cases, the original Check-host case and the strengthened Git lock case.
  The prior six- and 16-failure runs remain preserved and unwaived; this scheduling diagnostic does not establish their precise cause.
- The core runner now caps concurrent test files at two while preserving Node's default on one- and two-CPU hosts to limit contention from real-core and Git subprocesses, without changing fixture assertions, deadlines, file collection or locale [[release-31](../packages/release.md#release-31)].
  The diagnostic used a direct Node command; the changed repository runner and final integration have not yet been executed.
- The UI guards Sign out, Forget and declining a repair against replies superseded by a newer state request or broadcast [[space-106](../packages/space.md#space-106)].
  All 49 SpaceSurface tests passed, including the three rendered-surface regressions for superseded and current replies; the locale catalogs also passed [[space-107](../packages/space.md#space-107)].

The earlier PR256 macOS Node 22 failure observed an idle Check result with its first placement's incoming list empty; its precise interleaving is not established by that log.
PR254's separate merged-main run passed all nine jobs.

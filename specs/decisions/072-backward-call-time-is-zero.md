<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-072: Backward Call Time Is Zero

## Status

Accepted (2026-09-17) on review of the finite-timestamp boundary in the active-time fold.

Amends [DR-071](071-active-time-follows-held-calls.md) only for a matched call whose finish timestamp precedes its prompt.
That record's attribution, pairing, overlap, completeness, publication, and presentation decisions stand unchanged.

## Context

- [DR-071](071-active-time-follows-held-calls.md) requires a non-negative span from each matched finite prompt/finish pair but does not say whether a negative raw difference is discarded or clamped.
- A backward clock step can put a finite finish timestamp before its prompt.
  Dropping that pair and retaining it as zero produce different cumulative maps and different evidence that the call was measured.
- The sibling tmux-play timer closes the pair and clamps its interval to zero [[1]].

## Decision

- Every matched finite prompt/finish pair closes once, including when its finish timestamp precedes its prompt.
- Its contribution is `max(0, finished timestamp − prompt timestamp)`.
  A backward pair therefore contributes measured zero and consumes its prompt rather than being ignored or left open.

## Consequences

- An agent whose only completed call crosses a backward clock step has a zero-valued `agentActiveMs` entry, which the run view presents as `<1s`.
- The core fold and its integration fixture distinguish a backward pair from an invalid timestamp, unmatched record, and incomplete stream.
- Normal forward and equal-timestamp calls are unchanged.

## References

[1]: https://unpkg.com/@sublang/cligent@0.26.0/dist/app/tmux-play/timing.js "Cligent 0.26 tmux-play timing"

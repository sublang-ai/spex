<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-029: Desktop Spec View on the 1.0 Generation

## Status

Done

## Intent

Close the gap GPT-5.6 Sol's release review flagged between the rewritten spec-view law and the desktop implementation: the parser still served `compositions/` as a live collection and the view still derived DR-016 relationship classes, while the law makes a compositions directory a legacy marker and the plain citation the only relationship presentation.

## Deliverables

- [x] Parser and protocol on spec-view-10/11: packages-only collection, basename identifiers with disagreement notices, `compositions/` marking the tree legacy, no derived metadata in the protocol
- [x] Spec view on spec-view-18/19: legacy notice covering every 0.x layout, plain outbound/inbound citation rows with file-header rollups
- [x] Core, UI, and desktop test suites reshaped to spec-view-30/31/35/37
- [x] DR-016's status reconciled with the citation-only presentation (already `Superseded by DR-000`; no edit needed)

## Tasks

1. Apply the protocol delta (drop `kind`/`shortForm`, extend legacy detection) and rework the parser.
2. Replace the DR-016 classification layer with the plain citation model and align the legacy notice.
3. Reshape the affected test suites and run the full gates.
4. Reconcile DR-016 and the release smoke round-trip.

## Verification

- `npm test -w packages/core`, `npm run test:integration -w packages/core`, and `npm test -w packages/ui` green on the reshaped suites.
- `npm run smoke` green end to end, its core round-trip asserting the new protocol shape.
- `spex lint` clean on `specs/`.

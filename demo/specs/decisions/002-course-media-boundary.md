<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-002: Compose Drafts, Releases, and Media by Contract

## Status

Accepted for the demo.

## Context

A single "courses" package could own authoring, publishing, browsing, upload, and playback, but it would be difficult to reuse and would hide the important consistency boundary.
Splitting by UI page would instead make several packages co-own the same course state.
The concrete system needs to publish a complete syllabus and its ready videos as one learner-visible outcome.

## Decision

- `SYLL` owns mutable course drafts and emits immutable `SyllabusSnapshot` values through a trusted server binding.
- A lesson in a snapshot holds an opaque `ContentRef` with content kind, asset ID, and asset revision.
  Authoring receives a `ContentDescriptor` that adds the stable label and lifecycle state; `SYLL` can show and validate it without knowing storage or playback.
- `VIDS` owns video upload, asset readiness, private playback, and the trusted `ContentDescriptor`/`VideoRef` that can satisfy a `ContentRef`.
  It knows nothing about courses or lesson order.
- `CAT` owns learner-visible course releases.
  It accepts a complete `SyllabusSnapshot` only through the configured trusted authoring binding, publishes it atomically, returns a publication result to the syllabus host, and produces a fresh opaque server-only playback entitlement only for a content reference present in the requested lesson of a current release.
- The `PUBLISH` composition binds `VideoRef` to `ContentRef`, `SyllabusSnapshot` to a catalog release, and the resulting `PublicationReceipt` back to the syllabus editor.
  The `LEARN` composition maps a catalog playback entitlement to VIDS's generic request-scoped `AssetPlaybackAuthorization`; VIDS never interprets course, release, or lesson concepts.
- Each package states its required and provided semantic contracts in its final Binding section.
  The contracts are data meanings, not TypeScript interface designs.
- Composition scenarios trace visible outcomes with `Composes:` and trace these contract transfers separately with `Binds:`.
  No package or composition depends on another package's hidden Internal Behavior.

## Consequences

- Draft editing cannot mutate the catalog accidentally; publication is a visible composition boundary.
- The syllabus package can be reused with another content provider, and the video package can be reused outside courses.
- The same video reference may be used by multiple lessons without copying an asset.
- Cross-package consistency belongs in compositions, while snapshot immutability and asset lifecycle remain hidden package behavior.

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

- `SYLL` owns mutable course drafts and emits complete immutable publication snapshots through a trusted server handoff.
- A lesson in a snapshot holds an opaque content reference with content kind, asset ID, and asset revision.
  Authoring receives a content description that adds the stable label and lifecycle state; `SYLL` can show and validate it without knowing storage or playback.
- `VIDS` owns video upload, asset readiness, private playback, and the trusted content description and reusable video reference that can satisfy that content-reference meaning.
  It knows nothing about courses or lesson order.
- `CAT` owns learner-visible course releases.
  It accepts a complete publication snapshot only as trusted server input, publishes it atomically, and exposes every reader to one sanitized projection of the current release: each current course's title, summary, and slug plus its ordered section and lesson metadata and lesson routes, but no content reference, asset identity, or video metadata.
  It returns a successful publication report to the syllabus host and produces a fresh opaque server-only playback permission only after trusted active-member authorization for the exact content reference present in the requested lesson of a current release.
- [PUBLISH-1](../compositions/authoring/publish-course.md#publish-1), [PUBLISH-2](../compositions/authoring/publish-course.md#publish-2), and [PUBLISH-3](../compositions/authoring/publish-course.md#publish-3) install the video-description, publication-snapshot, and publication-result seams.
  [LEARN-1](../compositions/learning/browse-and-watch.md#learn-1) installs the catalog-to-video playback authorization seam; VIDS never interprets course, release, or lesson concepts.
- Each package states the domain values it accepts or produces in its own behavior, with any necessary shapes, policies, or states placed beside the behavior that owns them.
  These definitions express domain meaning, not TypeScript interface design, and do not name the peer package selected by this system.
- Binding items stay thin: their `Where` and shall clauses identify exact client and supplier behavior and scope the installation without restating endpoint meaning or vendor mechanics already owned elsewhere.
  A supply Binding may cite a client's Internal requirement, while an assembly Binding joins External behavior.
- A Scenario may cite External or Internal behavior when that item materially supports the integrated outcome.
  Citing Internal behavior makes its contribution and verification traceable; it neither reclassifies that behavior as External nor exposes it as part of another package's contract.

## Consequences

- Draft editing cannot mutate the catalog accidentally; publication is a visible composition boundary.
- The public catalog can be read without an account, while the snapshot's attached-content identity remains behind the authenticated playback boundary.
- The syllabus package can be reused with another content provider, and the video package can be reused outside courses.
- The same video reference may be used by multiple lessons without copying an asset.
- Cross-package consistency belongs in compositions, while draft revision and asset cleanup invariants remain package-local.

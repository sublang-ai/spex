<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-002: Compose Mutable Courses with Independent Media

## Status

Accepted for the demo.

## Context

One package could own courses, video assets, and playback, but that boundary would couple two independent lifecycles and make either capability difficult to reuse.
A separate draft-and-release package would avoid live edits, but its snapshot and history machinery is unnecessary for this minimal website.

## Decision

- `CAT` owns each mutable course record, its ordered syllabus, stable public address, publication state, and opaque lesson-media references.
  Saving an already-published course changes later public reads immediately and atomically; there is no staging or release history ([CAT-7](../packages/learning/course-catalog.md#cat-7)).
- `VIDS` owns private video assets, their stable reusable references, upload and deletion, and bounded playback grants.
  It knows nothing about courses, lessons, publication, or host authorization policy.
- [PUBLISH-1](../compositions/authoring/publish-course.md#publish-1) supplies CAT's provider-neutral [media-selection](../packages/learning/course-catalog.md#cat-15) and [media-resolution](../packages/learning/course-catalog.md#cat-16) inputs with VIDS's [chooser and reference resolution](../packages/media/video-library.md#vids-5).
  CAT retains each selected reference; VIDS retains the asset.
- [GUARD-1](../compositions/security/protect-course-content.md#guard-1) supplies VIDS's [playback-authorization input](../packages/media/video-library.md#vids-10) with this website's policy over active GitHub identity, role capability, current publication, attachment, and video availability.
  That product policy belongs to the composition rather than either reusable package.
- Public readers receive only CAT's published course and syllabus projection.
  Private video content requires a fresh eligible grant, while a bearer issued just before a policy change may remain usable until its five-minute maximum expiry ([VIDS-7](../packages/media/video-library.md#vids-7)).
- A confirmed course deletion removes its structure and references but leaves VIDS assets unchanged; a confirmed video deletion removes its asset but leaves any CAT reference present and unavailable until repaired ([PUBLISH-5](../compositions/authoring/publish-course.md#publish-5), [PUBLISH-6](../compositions/authoring/publish-course.md#publish-6)).

## Consequences

- Course authoring and public reading share one deliberately simple lifecycle; published edits are live and no historical version can be recovered from CAT.
- CAT can use another media provider without change, and VIDS can serve another host with different management and playback policy.
- One video reference may appear in several lessons without copying the asset.
- Cross-package consistency and product authorization remain explicit in compositions, while each package keeps its own state and invariants.

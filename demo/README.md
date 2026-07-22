<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Course Website Spec Demo

A complete `specs/` tree for a small real product, ready for code generation and containing no application code.
It is both the concrete package-structure research instance and the initial example project for the Spex desktop app.

## Product

- Anyone can browse published courses and lessons, ordered by `Newest` by default or `Title A–Z`.
- GitHub is the only sign-in method. Safe same-site return preserves the requested route; starting or renewing private video playback requires a current application session and a fresh grant.
- One configured GitHub subject is the administrator. That person creates, edits, publishes, unpublishes, and deletes courses and their ordered syllabi, and uploads and manages independent videos.
- A course is one mutable record. Saves to a published course become public immediately and atomically; there is no parallel draft, release snapshot, or publication history.
- Interrupted video uploads leave no asset, and retry starts at byte zero. After sign-out or a course-policy change, an issued playback bearer may remain usable only until its five-minute maximum expiry; deleting the video removes its origin content.
- The application uses Next.js App Router with TypeScript, Tailwind CSS, and shadcn/ui; Vercel and Supabase Auth, Postgres, and Storage run it; GitHub hosts its repository and delivery workflow.

The durable choices are in [decisions](specs/decisions/); the selected package and platform seams are in [compositions](specs/compositions/).

## Reading paths

For the product, start at the [spec map](specs/map.md), read each package as a standalone contract, then read compositions to see the installed product and its acceptance evidence.
For implementation, follow the three [iterations](specs/iterations/) as vertical slices; their acceptance criteria link back to authoritative package and composition items.
For spec authoring, start with [Writing Strong Spex Specs](guidelines.md); [META](specs/meta.md) is normative when the guide and format differ.

## Research pointers

| Question | Concrete examples |
| --- | --- |
| Package boundary and self-containment | [CAT](specs/packages/learning/course-catalog.md) owns mutable courses, ordered syllabi, publication, and opaque media references; [VIDS](specs/packages/media/video-library.md) independently owns reusable video assets and playback grants. Neither package names the other. |
| External versus Internal | [CAT-7](specs/packages/learning/course-catalog.md#cat-7) is reader-visible and [CAT-13](specs/packages/learning/course-catalog.md#cat-13) is server-only, yet both are External to CAT; [CAT-15](specs/packages/learning/course-catalog.md#cat-15) and [CAT-16](specs/packages/learning/course-catalog.md#cat-16) are hidden collaborator inputs; [CAT-17](specs/packages/learning/course-catalog.md#cat-17) is a private invariant. |
| Reuse and dependency choice | [PUBLISH-1](specs/compositions/authoring/publish-course.md#publish-1) selects VIDS for CAT's media inputs without changing either package; [LEARN-2](specs/compositions/learning/browse-and-watch.md#learn-2) uses one VIDS asset from two CAT lessons. |
| Binding versus Scenario | [ACCESS](specs/compositions/access/install-course-access.md) and [PLAT](specs/compositions/operations/install-platform.md) are binding-only; [BOOT](specs/compositions/access/bootstrap-admin.md) and [LEARN](specs/compositions/learning/browse-and-watch.md) are scenario-only; [PUBLISH](specs/compositions/authoring/publish-course.md) colocates one selection with the journeys it directly serves. |
| Acceptance coverage | [PUBLISH](specs/compositions/authoring/publish-course.md), [LEARN](specs/compositions/learning/browse-and-watch.md), [GUARD](specs/compositions/security/protect-course-content.md), and [SHIP](specs/compositions/operations/deliver-change.md) cover authoring, learning, protection, and deployed operation. |

## Convention status

The demo and scaffold specify `compositions/` as the home of installed Bindings, integrated Scenarios, and Verification; nested directories remain navigation-only collections.
`compositions/` is broader and less confusable with UX interactions than `interactions/`.

The current Spex CLI and desktop parser still recognize the older `interactions/` layout and do not yet implement the Binding/Scenario grammar, Binding clause-direction semantics, inline trace semantics, or derived installed overlays.
Until that tooling migration lands, this tree is also its concrete compatibility fixture.

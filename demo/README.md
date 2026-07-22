<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Course Website Spec Demo

A complete `specs/` tree for a small real product, ready for code generation and containing no application code.
It is both the concrete package-structure research instance and the initial example project for the Spex desktop app.

## Product

- Anyone can browse the current published catalog, courses, and lesson information.
- GitHub is the only sign-in method; starting or renewing private video playback requires an active GitHub-backed application session and fresh playback authorization.
- One configured initial administrator authors syllabi, uploads videos, and publishes immutable releases.
- The application uses Next.js App Router with TypeScript, Tailwind CSS, and shadcn/ui.
- Vercel and Supabase Auth, Postgres, and Storage run the product; GitHub hosts its repository and delivery workflow.

The durable choices are in [decisions](specs/decisions/); the selected package and platform seams are in [compositions](specs/compositions/).

## Reading paths

For the product, start at the [spec map](specs/map.md), read each package as a standalone contract, then read compositions to see the installed product and its acceptance evidence.
For implementation, follow the three [iterations](specs/iterations/) as vertical slices; their acceptance criteria link back to authoritative package and composition items.
For spec authoring, start with [Writing Strong Spex Specs](guidelines.md); [META](specs/meta.md) is normative when the guide and format differ.

## Research pointers

| Question | Concrete examples |
| --- | --- |
| Package boundary and self-containment | [SYLL](specs/packages/learning/course-syllabus.md), [CAT](specs/packages/learning/course-catalog.md), and [VIDS](specs/packages/media/video-library.md) separate mutable drafts, immutable releases, and media lifecycle |
| External versus Internal | [SYLL-11](specs/packages/learning/course-syllabus.md#syll-11) is a supplied External snapshot; [SYLL-13](specs/packages/learning/course-syllabus.md#syll-13) is a consumed Internal content requirement; [SYLL-10](specs/packages/learning/course-syllabus.md#syll-10) is a private invariant |
| Reuse and dependency choice | [PUBLISH-10](specs/compositions/authoring/publish-course.md#publish-10) and [ACCESS-4](specs/compositions/access/install-course-access.md#access-4) install selectable suppliers without changing their client packages |
| Binding versus Scenario | [PLAT](specs/compositions/operations/install-platform.md) is binding-only; [GUARD](specs/compositions/security/protect-course-content.md) is scenario-only; [PUBLISH](specs/compositions/authoring/publish-course.md) cohesively contains both |
| Acceptance coverage | [LEARN](specs/compositions/learning/browse-and-watch.md), [GUARD](specs/compositions/security/protect-course-content.md), and [SHIP](specs/compositions/operations/deliver-change.md) cover the main journey, trust boundaries, and deployed operation |

## Convention status

The demo and scaffold specify `compositions/` as the home of installed Bindings, integrated Scenarios, and Verification; nested directories remain navigation-only collections.
`compositions/` is broader and less confusable with UX interactions than `interactions/`.

The current Spex CLI and desktop parser still recognize the older `interactions/` layout and do not yet implement the Binding/Scenario grammar, inline trace semantics, or derived installed overlays.
Until that tooling migration lands, this tree is also its concrete compatibility fixture.

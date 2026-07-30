<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Demo: Academy

A complete `specs/` tree for a small, real product — written to be ready for code generation, with no code in this directory.

It serves two purposes:

- A concrete research instance for how spec items are organized: package boundaries, external/internal behavior, reuse, and composition.
- The initial example project for the Spex desktop app.

## The product

Academy is a minimal online course website:

- Anyone can browse published courses and their syllabi.
- Sign-in is GitHub OAuth, and nothing else.
- One configured admin creates courses, structures syllabi, and uploads videos.
- Signed-in members watch lesson videos.
- Next.js (App Router, TypeScript) + Tailwind CSS + shadcn/ui, on Vercel + Supabase (Auth, Postgres, Storage), with DevOps on GitHub — chosen in `specs/decisions/`, supplied by the [platform-services](specs/packages/platform-services.md) package under `specs/packages/`, and named in no other package.

## Reading order

Start at [specs/map.md](specs/map.md).
Every spec is a package, self-contained in one file.
Read the domain packages first, then the composition packages — ordinary packages whose behavior emerges only when the others work together: admin-bootstrap, course-publishing, lesson-playback, platform-services, protected-content, and site-navigation say how the rest add up to the product.
The organization rules this tree demonstrates are stated in [guidelines.md](guidelines.md).

## Where this tree deviates from current Spex conventions

Nowhere — the tree follows the scaffold's rewritten `meta.md`: a packages-only layout with composition stated by ordinary packages, one citation mechanism between packages, and item IDs derived from each file's basename.
The demo's [specs/meta.md](specs/meta.md) carries the same items; its Intent differs only in not citing a spec-structure DR, because the demo's own DR-000 is the product scope.

## Research pointers

| Question | Look at |
| --- | --- |
| Package boundary; self-containment | [course-catalog.md](specs/packages/catalog/course-catalog.md) vs [video-library.md](specs/packages/catalog/video-library.md): course-catalog-8/course-catalog-10 mirror video-library-9/video-library-10 across the boundary |
| External vs internal behavior | course-catalog-3 vs course-catalog-12; web-shell-2 vs web-shell-6 |
| Reuse | `github-login.md`, `access-control.md`, `video-library.md`, and `web-shell.md` carry no product nouns; access-control-2 is cited from course-catalog-4, video-library-1, and the admin-bootstrap and protected-content packages; the shell's header entries are supplied in `site-navigation.md` |
| Acceptance from composition packages | [lesson-playback.md](specs/packages/lesson-playback.md), [protected-content.md](specs/packages/protected-content.md) |
| Composition vs supply | [course-publishing.md](specs/packages/course-publishing.md) vs [platform-services.md](specs/packages/platform-services.md): the seam course-publishing-1 wires is user-walked emergent behavior (course-publishing-4 crosses it in person); platform-services-3's supply is inspection-only (platform-services-6) |

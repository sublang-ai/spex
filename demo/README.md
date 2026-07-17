<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Demo: Coursebook

A complete `specs/` tree for a small, real product — written to be
ready for code generation, with no code in this directory.

It serves two purposes:

- A concrete research instance for how spec items are organized:
  package boundaries, external/internal behavior, reuse, and
  cross-package compositions.
- The initial example project for the Spex desktop app.

## The product

Coursebook is a minimal online course website:

- Anyone can browse published courses and their syllabi.
- Sign-in is GitHub OAuth, and nothing else.
- One configured admin creates courses, structures syllabi, and
  uploads videos.
- Signed-in members watch lesson videos.
- Next.js (App Router, TypeScript) + Tailwind CSS + shadcn/ui, on
  Vercel + Supabase (Auth, Postgres, Storage), with DevOps on
  GitHub — all bound in `specs/decisions/`, never named in
  packages.

## Reading order

Start at [specs/map.md](specs/map.md).
Read packages first — each is self-contained in one file — then
compositions, which say how the packages add up to the product.

## Where this tree deviates from current Spex conventions

| Change | See |
| --- | --- |
| `compositions/` replaces `interactions/` | [META-31](specs/meta.md#meta-31) |
| Collection directories carry no semantics | [META-32](specs/meta.md#meta-32); `packages/identity/`, `packages/catalog/`, … |
| Packages never cite compositions | [META-33](specs/meta.md#meta-33) |
| Compositions may hold binding items | [PUB-1](specs/compositions/course-publishing.md#pub-1) |
| Composition tests verify their own scenario items too | [PLAY-3](specs/compositions/lesson-playback.md#play-3) |

## Research pointers

| Question | Look at |
| --- | --- |
| Package boundary; self-containment | [course-catalog.md](specs/packages/catalog/course-catalog.md) vs [video-library.md](specs/packages/catalog/video-library.md): CAT-8/CAT-10 mirror VID-9/VID-10 across the boundary |
| External vs internal behavior | AUTH-1 vs AUTH-10; CAT-12; SHELL-7 |
| Reuse | `github-login.md`, `access-control.md`, `video-library.md` carry no product nouns; ROLE-2 is cited from CAT-4, VID-1, and three compositions |
| Acceptance from compositions | [lesson-playback.md](specs/compositions/lesson-playback.md), [protected-content.md](specs/compositions/protected-content.md) |

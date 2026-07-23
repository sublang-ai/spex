<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Demo: Academy

A complete `specs/` tree for a small, real product — written to be
ready for code generation, with no code in this directory.

It serves two purposes:

- A concrete research instance for how spec items are organized:
  package boundaries, external/internal behavior, reuse, and
  cross-package compositions.
- The initial example project for the Spex desktop app.

## The product

Academy is a minimal online course website:

- Anyone can browse published courses and their syllabi.
- Sign-in is GitHub OAuth, and nothing else.
- One configured admin creates courses, structures syllabi, and
  uploads videos.
- Signed-in members watch lesson videos.
- Next.js (App Router, TypeScript) + Tailwind CSS + shadcn/ui, on
  Vercel + Supabase (Auth, Postgres, Storage), with DevOps on
  GitHub — chosen in `specs/decisions/`, wired by the supply
  bindings of
  [platform-services.md](specs/compositions/platform-services.md),
  never named in packages.

## Reading order

Start at [specs/map.md](specs/map.md).
Read packages first — each is self-contained in one file — then
compositions, which say how the packages add up to the product.
The organization rules this tree demonstrates are stated in
[guidelines.md](guidelines.md).

## Where this tree deviates from current Spex conventions

Nowhere — the scaffold's `meta.md` carries the same conventions
this tree demonstrates: `compositions/` with binding items and
supply bindings, the [META-34](specs/meta.md#meta-34) section
grammar, standalone Intents, and DRs without implementation
detail.
The shipped tooling matches: `spex lint` enforces these
conventions, and `spex scaffold --update` migrates
`interactions/`-era trees to them.

## Research pointers

| Question | Look at |
| --- | --- |
| Package boundary; self-containment | [course-catalog.md](specs/packages/catalog/course-catalog.md) vs [video-library.md](specs/packages/catalog/video-library.md): CAT-8/CAT-10 mirror VID-9/VID-10 across the boundary |
| External vs internal behavior | CAT-3 vs CAT-12; SHELL-2 vs SHELL-6 |
| Reuse | `github-login.md`, `access-control.md`, `video-library.md`, and `web-shell.md` carry no product nouns; ROLE-2 is cited from CAT-4, VID-1, and the BOOT and GUARD compositions; the shell's header slots are bound in `site-navigation.md` |
| Acceptance from compositions | [lesson-playback.md](specs/compositions/lesson-playback.md), [protected-content.md](specs/compositions/protected-content.md) |
| Composition vs supply | [course-publishing.md](specs/compositions/course-publishing.md) vs [platform-services.md](specs/compositions/platform-services.md): PUB-1's seam is user-walked, PLAT-3's is inspection-only |

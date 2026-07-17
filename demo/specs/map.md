<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Layout

```text
decisions/     Decision records (DRs)
iterations/    Iteration records (IRs)
packages/      Spec packages (one file per package)
compositions/  Cross-package compositions: scenarios, bindings, tests
map.md         This index
meta.md        The spec of specs
```

Subdirectories under `packages/` and `compositions/` are
navigation collections with no semantics
([META-32](meta.md#meta-32)).

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-000 | [000-product-scope.md](decisions/000-product-scope.md) | Minimal course site: public catalog, gated playback, one admin, explicit out-of-scope list |
| DR-001 | [001-web-stack.md](decisions/001-web-stack.md) | Next.js App Router + TypeScript, Tailwind CSS, vendored shadcn/ui kit, native video |
| DR-002 | [002-platform-and-devops.md](decisions/002-platform-and-devops.md) | Vercel + Supabase (Auth, Postgres, Storage) + GitHub bindings for the packages' abstract subjects |
| DR-003 | [003-admin-designation.md](decisions/003-admin-designation.md) | Initial admin as configured GitHub username, recomputed at each sign-in |

## Iterations

| ID | File | Goal |
| --- | --- | --- |
| IR-001 | [001-walking-skeleton.md](iterations/001-walking-skeleton.md) | Pipeline, deployment, sign-in, and guard proven end to end |
| IR-002 | [002-course-catalog.md](iterations/002-course-catalog.md) | Course structure, browsing, publishing; admin bootstrap green |
| IR-003 | [003-video-pipeline.md](iterations/003-video-pipeline.md) | Upload to playback; full composition acceptance green |

## Packages

### identity/

| Short | File | Summary |
| --- | --- | --- |
| AUTH | [github-login.md](packages/identity/github-login.md) | GitHub-only sign-in, sessions, account menu; identity records, cookie and provider discipline |
| ROLE | [access-control.md](packages/identity/access-control.md) | Admin/member roles from configured designation; the admin-only guard and its check discipline |

### catalog/

| Short | File | Summary |
| --- | --- | --- |
| CAT | [course-catalog.md](packages/catalog/course-catalog.md) | Courses, syllabi, publishing, the opaque media slot; slugs, ordering, draft isolation |
| VID | [video-library.md](packages/catalog/video-library.md) | Protected video assets: upload, library, gated playback; private storage and short-lived grants |

### site/

| Short | File | Summary |
| --- | --- | --- |
| SHELL | [web-shell.md](packages/site/web-shell.md) | Shared frame, role-aware entries, not-found, responsive fit; one visual system, server-resolved chrome |

### ops/

| Short | File | Summary |
| --- | --- | --- |
| DELIV | [delivery.md](packages/ops/delivery.md) | Checks, previews, production deploys; secrets, migrations, traceability |

## Compositions

| Short | File | Summary |
| --- | --- | --- |
| BOOT | [admin-bootstrap.md](compositions/admin-bootstrap.md) | Day zero: fresh deployment to working admin in one sign-in |
| PUB | [course-publishing.md](compositions/course-publishing.md) | Assemble and release a course; binds the media slot to the video library |
| PLAY | [lesson-playback.md](compositions/lesson-playback.md) | The member journey: browse, sign in, watch — the flagship acceptance scenario |
| GUARD | [protected-content.md](compositions/protected-content.md) | The gating map across all audiences and paths, and its independence from client-side hiding |

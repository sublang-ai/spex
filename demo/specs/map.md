<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# Spec Map

Quick-reference index for locating spec files.
Spec items are the source of truth.
Code can be inconsistent with specs during development.

## Authoring and reviewing specs

Know the rules in [`meta.md`](meta.md) before authoring, modifying, or reviewing a DR, IR, or item.

- DRs and IRs: see [Organization](meta.md#organization), [Record format](meta.md#record-format), and [Citation](meta.md#citation).
- Items: see [Organization](meta.md#organization), [Item syntax](meta.md#item-syntax), [Spec packages](meta.md#spec-packages), [Testing](meta.md#testing), and [Citation](meta.md#citation).

## Layout

```text
decisions/    Decision records (DRs)
intents/      Intent records (IRs)
packages/     Spec packages (one file per package)
map.md        This index
meta.md       The spec of specs
```

Subdirectories under `packages/` are navigation collections with no semantics [[meta-34](meta.md#meta-34)].

## Decisions

| ID | File | Summary |
| --- | --- | --- |
| DR-000 | [000-product-scope.md](decisions/000-product-scope.md) | Minimal course site: public catalog, gated playback, one admin, explicit out-of-scope list |
| DR-001 | [001-web-stack.md](decisions/001-web-stack.md) | Next.js App Router + TypeScript, Tailwind CSS, vendored shadcn/ui kit, native video |
| DR-002 | [002-platform-and-devops.md](decisions/002-platform-and-devops.md) | Supabase (Auth, Postgres, Storage) + Vercel + GitHub; the platform-services package states each supplied seam |
| DR-003 | [003-admin-designation.md](decisions/003-admin-designation.md) | Initial admin as configured GitHub account ID, recomputed at each sign-in |

## Intents

| ID | File | Intent |
| --- | --- | --- |
| IR-001 | [001-walking-skeleton.md](intents/001-walking-skeleton.md) | Pipeline, deployment, sign-in, and guard proven end to end |
| IR-002 | [002-course-catalog.md](intents/002-course-catalog.md) | Course structure, browsing, publishing; admin-bootstrap acceptance green |
| IR-003 | [003-video-pipeline.md](intents/003-video-pipeline.md) | Upload to playback; the full release-acceptance gate green |

## Packages

| File | Summary |
| --- | --- |
| [identity/access-control.md](packages/identity/access-control.md) | Admin/member roles from the configured designation; the admin-only guard and its server-side check discipline |
| [admin-bootstrap.md](packages/admin-bootstrap.md) | Day zero: fresh deployment to working admin in one sign-in |
| [catalog/course-catalog.md](packages/catalog/course-catalog.md) | Courses, syllabi, publishing, opaque media references delegated to the deployment's media provider; slugs, ordering, draft isolation |
| [course-publishing.md](packages/course-publishing.md) | Assemble and release a course; every media delegation the catalog leaves open served by the video library |
| [ops/delivery.md](packages/ops/delivery.md) | Checks, previews, production deploys; secrets, migrations, traceability |
| [identity/github-login.md](packages/identity/github-login.md) | GitHub sign-in, sessions, account menu; identity records and credential discipline |
| [lesson-playback.md](packages/lesson-playback.md) | The member journey: browse, sign in, watch — the flagship acceptance scenario |
| [platform-services.md](packages/platform-services.md) | The installed platform: identity, data, media storage, hosting, and pipeline seams supplied by Supabase, Vercel, and GitHub |
| [protected-content.md](packages/protected-content.md) | The gating map across all audiences, surfaces, and paths, and its independence from client-side hiding |
| [site-navigation.md](packages/site-navigation.md) | Names the header's entries and the home page, connecting each to the product's surfaces |
| [catalog/video-library.md](packages/catalog/video-library.md) | Protected video assets: upload, library, gated playback; private storage and short-lived grants |
| [site/web-shell.md](packages/site/web-shell.md) | Shared frame with deployment-supplied entries, not-found, responsive fit; server-resolved chrome |

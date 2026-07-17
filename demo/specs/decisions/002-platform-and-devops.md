<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-002: Platform and DevOps

## Status

Accepted

## Context

Packages name their platform dependencies abstractly — "the
identity provider", "the storage backend", "the pipeline" — per
[META-15](../meta.md#meta-15).
One record must bind each abstract subject to a concrete
service, or the specs are not ready for code generation.

## Decision

| Abstract subject in packages | Bound service |
| --- | --- |
| Identity provider and sessions ([AUTH](../packages/identity/github-login.md)) | Supabase Auth, GitHub OAuth provider enabled, all others disabled |
| Catalog and identity storage ([CAT](../packages/catalog/course-catalog.md), [AUTH-7](../packages/identity/github-login.md#auth-7)) | Supabase Postgres |
| Private media storage and access grants ([VID-7](../packages/catalog/video-library.md#vid-7), [VID-8](../packages/catalog/video-library.md#vid-8)) | Supabase Storage, private bucket, signed URLs |
| Hosting, previews, production ([DELIV](../packages/ops/delivery.md)) | Vercel Git integration |
| Repository, checks, merge gating ([DELIV-1](../packages/ops/delivery.md#deliv-1)) | GitHub + GitHub Actions + branch protection |

## Consequences

- No package names a vendor; swapping a service is a new DR plus
  rebinding, with package items unchanged.
- Supabase's signed-URL expiry bounds the access-grant lifetime
  of [VID-8](../packages/catalog/video-library.md#vid-8).
- Preview deployments bind to a non-production Supabase project,
  satisfying [DELIV-4](../packages/ops/delivery.md#deliv-4).

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-002: Platform and DevOps

## Status

Accepted

## Context

Packages name their platform subjects abstractly — "the identity
store", "the deployment's media provider", "the pipeline" — per
[META-15](../meta.md#meta-15).
The deployment must bind each subject to one concrete service or
the specs are not ready for code generation; those bindings are
codegen-required detail, so they are spec items
([META-24](../meta.md#meta-24)): the supply bindings of
[platform-services.md](../compositions/platform-services.md).
This record holds the choice of services and its tradeoffs.

## Decision

- Supabase for identity, sessions, data, and media storage
  ([PLAT-1](../compositions/platform-services.md#plat-1),
  [PLAT-2](../compositions/platform-services.md#plat-2),
  [PLAT-3](../compositions/platform-services.md#plat-3)): one
  managed platform for all three keeps the integration surface
  one vendor wide for a one-developer product.
- Vercel for hosting, previews, and production
  ([PLAT-4](../compositions/platform-services.md#plat-4)):
  Git-native deploys match the no-manual-step path of
  [DELIV-3](../packages/ops/delivery.md#deliv-3).
- GitHub for repository, checks, and merge gating
  ([PLAT-5](../compositions/platform-services.md#plat-5)): the
  pipeline lives where the code and the sign-in provider
  already do.

## Consequences

- No package names a vendor; swapping a service is a new DR
  plus rewritten binding items, with package items unchanged.
- Supabase's signed-URL expiry bounds the access-grant lifetime
  of [VID-8](../packages/catalog/video-library.md#vid-8)
  ([PLAT-3](../compositions/platform-services.md#plat-3)).
- Preview deployments bind to a non-production Supabase project
  ([PLAT-4](../compositions/platform-services.md#plat-4)),
  satisfying [DELIV-4](../packages/ops/delivery.md#deliv-4).

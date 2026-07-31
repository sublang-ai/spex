<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-002: Platform and DevOps

## Status

Accepted

## Context

Packages name their platform subjects abstractly — "the identity store", "the deployment's media provider", "the pipeline" — per [[meta-14](../meta.md#meta-14)].
The deployment must supply one concrete service for each subject; each choice is an inspectable installation obligation, stated by the platform-services package's supply items.
This record holds the choice of services and its tradeoffs.

## Decision

- Supabase for identity, sessions, data, and media storage [[platform-services-1](../packages/platform-services.md#platform-services-1)] [[platform-services-2](../packages/platform-services.md#platform-services-2)] [[platform-services-3](../packages/platform-services.md#platform-services-3)]: one managed platform for all three keeps the integration surface one vendor wide for a one-developer product.
- Vercel for hosting, previews, and production [[platform-services-4](../packages/platform-services.md#platform-services-4)]: Git-native deploys match the no-manual-step path of [[delivery-4](../packages/ops/delivery.md#delivery-4)].
- GitHub for repository, checks, and merge gating [[platform-services-5](../packages/platform-services.md#platform-services-5)]: the pipeline lives where the code and the sign-in provider already do.
- Configuration lives with its consumer [[platform-services-6](../packages/platform-services.md#platform-services-6)]: runtime values in Vercel environment variables, pipeline credentials in GitHub Actions secrets — no third configuration system for a one-developer product.

## Consequences

- No package other than platform-services names a vendor; swapping a service is a new DR plus rewritten supply items in the platform-services package, with other packages' items unchanged.
- Supabase's signed-URL expiry bounds the access-grant lifetime of [[video-library-13](../packages/catalog/video-library.md#video-library-13)] [[platform-services-3](../packages/platform-services.md#platform-services-3)].
- Preview deployments use a non-production Supabase project [[platform-services-4](../packages/platform-services.md#platform-services-4)], satisfying [[delivery-5](../packages/ops/delivery.md#delivery-5)].
- Supabase's SSR session model keeps its tokens readable to the browser client [[1]], so [[github-login-11](../packages/identity/github-login.md#github-login-11)] constrains cookie scope and credential lifetime rather than mandating HTTP-only.

## References

[1]: https://supabase.com/docs/guides/auth/sessions "Supabase Auth: Sessions"

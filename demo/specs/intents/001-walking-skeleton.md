<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-001: Walking Skeleton

## Status

In progress

## Intent

Prove the riskiest seams end to end before any product feature: repository checks, deployment, GitHub sign-in, and the admin guard, so every later iteration lands on a working pipeline.

## Deliverables

- [ ] Repository with required checks gating merge (delivery)
- [ ] Preview and production deployments serving the shell (delivery, web-shell)
- [ ] GitHub sign-in with sessions and the account menu (github-login)
- [ ] Configured-admin role grant and a guarded placeholder admin surface (access-control)

## Tasks

1. Scaffold the app with the component kit, strict TypeScript, and the CI workflow (lint, type check, test, build).
2. Configure hosting: preview per pull request, production on the default branch, example environment file.
3. Implement the shell frame: header, footer, not-found, loading and error surfaces.
4. Integrate the identity provider with GitHub as this installation's only enabled method; sessions and sign-out.
5. Implement identity records and role derivation from the configured admin account ID.
6. Guard a placeholder admin surface and add the role-aware Admin entry.
7. Stand up the verification suites for github-login, access-control, web-shell, and delivery.

## Verification

- [[github-login-12](../packages/identity/github-login.md#github-login-12)] through [[github-login-15](../packages/identity/github-login.md#github-login-15)], [[access-control-7](../packages/identity/access-control.md#access-control-7)], [[access-control-8](../packages/identity/access-control.md#access-control-8)], [[web-shell-10](../packages/site/web-shell.md#web-shell-10)] through [[web-shell-12](../packages/site/web-shell.md#web-shell-12)], and [[delivery-10](../packages/ops/delivery.md#delivery-10)] through [[delivery-12](../packages/ops/delivery.md#delivery-12)] pass.
- [[platform-services-8](../packages/platform-services.md#platform-services-8)] passes: checks, previews, and production trace to the supplied platform services.
- A fresh preview deployment reaches a signed-in admin session with no manual step beyond configuration.

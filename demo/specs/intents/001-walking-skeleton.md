<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-001: Walking Skeleton

## Goal

Prove the riskiest seams end to end before any product feature:
repository checks, deployment, GitHub sign-in, and the admin
guard, so every later iteration lands on a working pipeline.

## Deliverables

- [ ] Repository with required checks gating merge (DELIV)
- [ ] Preview and production deployments serving the shell (DELIV, SHELL)
- [ ] GitHub sign-in with sessions and the account menu (AUTH)
- [ ] Configured-admin role grant and a guarded placeholder admin surface (ROLE)

## Tasks

1. Scaffold the app with the component kit, strict TypeScript, and the CI workflow (lint, type check, test, build).
2. Configure hosting: preview per pull request, production on the default branch, example environment file.
3. Implement the shell frame: header, footer, not-found, loading and error surfaces.
4. Integrate the identity provider with GitHub as this installation's only enabled method; sessions and sign-out.
5. Implement identity records and role derivation from the configured admin account ID.
6. Guard a placeholder admin surface and add the role-aware Admin entry.
7. Stand up the verification suites for AUTH, ROLE, SHELL, and DELIV.

## Acceptance criteria

- AUTH-10 through AUTH-13, ROLE-5, ROLE-6, SHELL-7 through
  SHELL-9, and DELIV-8 through DELIV-10 pass.
- PLAT-7 passes: checks, previews, and production trace to the
  bound delivery services.
- A fresh preview deployment reaches a signed-in admin session
  with no manual step beyond configuration.

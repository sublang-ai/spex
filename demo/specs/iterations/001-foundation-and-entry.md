<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-001: Foundation and Entry

## Goal

Establish a reproducible delivery foundation, request-isolated runtime, GitHub identity path, role policy, and application shell before course behavior is implemented.

## Deliverables

- [ ] Required GitHub checks, credential hygiene, and secret-free fixture previews ([PIPE-1](../packages/operations/github-delivery.md#pipe-1), [PIPE-18](../packages/operations/github-delivery.md#pipe-18))
- [ ] Environment-scoped runtime readiness and isolation ([LIVE-1](../packages/operations/production-runtime.md#live-1), [LIVE-2](../packages/operations/production-runtime.md#live-2))
- [ ] GitHub account and revocable application-session lifecycle ([GHID-1](../packages/access/github-identity.md#ghid-1), [GHID-11](../packages/access/github-identity.md#ghid-11))
- [ ] Two-role capability policy with fail-closed initial-administrator readiness ([ROLE-7](../packages/access/role-access.md#role-7), [ROLE-8](../packages/access/role-access.md#role-8))
- [ ] Route, header, state, cache, and accessibility shell ([SITE-1](../packages/web/application-shell.md#site-1), [SITE-11](../packages/web/application-shell.md#site-11))
- [ ] Identity, access, runtime, and delivery bindings for production and verification scopes ([PLAT-1](../compositions/operations/install-platform.md#plat-1), [ACCESS-1](../compositions/access/install-course-access.md#access-1))

## Tasks

1. Create the strict TypeScript Next.js App Router application with Tailwind CSS, shadcn/ui, and its production build.
2. Add the required repository-check workflow and protected-branch fixture.
3. Add the value-free variable inventory and credential-hygiene fixture.
4. Add a secret-free fixture-preview workflow with an explicit limited-capability profile.
5. Provision the isolated local-verification service profile.
6. Provision the production service profile with non-mutating readiness.
7. Implement GitHub callback validation and stable account reconciliation.
8. Implement application-session creation, expiry, and exact revocation.
9. Require online authority and application-session agreement on protected requests.
10. Enforce browser credential transport and disclosure policy.
11. Implement exact-session sign-out.
12. Implement the member/administrator capability policy.
13. Implement immutable configured-subject bootstrap and readiness.
14. Implement the route map and shared header.
15. Implement safe post-authentication destination preservation.
16. Implement uniform page-state mapping.
17. Add request-isolated response caching.
18. Add the responsive accessibility shell.
19. Install the production and verification identity-authority bindings.
20. Install the application access-policy bindings.
21. Install the web-runtime and durable-service bindings.
22. Install the repository, deployment, and provider-control-plane bindings.
23. Run every foundation package contract and binding-conformance suite.

## Acceptance criteria

- [GHID-16](../packages/access/github-identity.md#ghid-16), [GHID-17](../packages/access/github-identity.md#ghid-17), and [GHID-18](../packages/access/github-identity.md#ghid-18) pass.
- [ROLE-12](../packages/access/role-access.md#role-12), [ROLE-13](../packages/access/role-access.md#role-13), and [ROLE-14](../packages/access/role-access.md#role-14) pass.
- [SITE-12](../packages/web/application-shell.md#site-12), [SITE-13](../packages/web/application-shell.md#site-13), and [SITE-14](../packages/web/application-shell.md#site-14) pass against package fixtures.
- [LIVE-19](../packages/operations/production-runtime.md#live-19), [LIVE-20](../packages/operations/production-runtime.md#live-20), [LIVE-21](../packages/operations/production-runtime.md#live-21), and [LIVE-22](../packages/operations/production-runtime.md#live-22) pass.
- [PIPE-19](../packages/operations/github-delivery.md#pipe-19), [PLAT-7](../compositions/operations/install-platform.md#plat-7), [PLAT-9](../compositions/operations/install-platform.md#plat-9), [ACCESS-6](../compositions/access/install-course-access.md#access-6), and [ACCESS-8](../compositions/access/install-course-access.md#access-8) pass.

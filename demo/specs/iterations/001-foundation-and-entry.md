<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-001: Foundation and Entry

## Goal

Establish the reproducible delivery foundation, isolated runtime, GitHub-only identity path, two-role access policy, safe same-site return, and application shell.

## Deliverables

- [ ] Required GitHub checks, secret-free fixture previews, and value-free runtime configuration ([PIPE-1](../packages/operations/github-delivery.md#pipe-1), [PIPE-18](../packages/operations/github-delivery.md#pipe-18))
- [ ] Environment-scoped Vercel and Supabase runtime profiles with redacted readiness ([LIVE-1](../packages/operations/production-runtime.md#live-1), [LIVE-5](../packages/operations/production-runtime.md#live-5))
- [ ] GitHub-only account and application-session lifecycle with an accepted same-site return path ([GHID-1](../packages/access/github-identity.md#ghid-1), [GHID-13](../packages/access/github-identity.md#ghid-13))
- [ ] Configured-subject administrator assignment and exact member/administrator capabilities ([ROLE-1](../packages/access/role-access.md#role-1), [ROLE-2](../packages/access/role-access.md#role-2))
- [ ] Course-site routes, header states, responsive presentation, and request-isolated current-state responses ([SITE-1](../packages/web/application-shell.md#site-1), [SITE-11](../packages/web/application-shell.md#site-11))
- [ ] Installed identity, safe-return, access, runtime, and delivery seams ([ENTRY-1](../compositions/access/enter-site.md#entry-1), [ACCESS-1](../compositions/access/install-course-access.md#access-1), [PLAT-1](../compositions/operations/install-platform.md#plat-1))

## Tasks

1. Create the strict TypeScript Next.js App Router application with Tailwind CSS, shadcn/ui, and its production build.
2. Add required pull-request checks and the protected-branch fixture.
3. Add the value-free variable inventory, credential-hygiene check, and secret-free fixture preview.
4. Provision isolated fixture, local-provider, production-candidate, and production profiles.
5. Install the environment-scoped identity, web, durable-service, and delivery control-plane bindings.
6. Implement GitHub callback validation and stable-subject account reconciliation.
7. Implement application-session creation, online validation, expiry, exact revocation, and sign-out.
8. Present GitHub as the sole sign-in method and preserve redacted retry behavior.
9. Accept only a normalized known same-site path for post-sign-in return, with `/courses` as fallback.
10. Implement configured-subject role assignment and the three-capability policy without role-management UI.
11. Implement the route map, shared header, page-state mapping, and protected-request boundary.
12. Install identity evidence, safe destinations, and capability decisions across the shell.
13. Prevent shared caching of session-specific responses and stale public course state.
14. Implement the responsive and keyboard-accessible shell.
15. Run the foundation package-contract and binding-conformance suites.

## Acceptance criteria

- [GHID-16](../packages/access/github-identity.md#ghid-16), [GHID-17](../packages/access/github-identity.md#ghid-17), and [GHID-18](../packages/access/github-identity.md#ghid-18) pass.
- [ROLE-8](../packages/access/role-access.md#role-8) and [ROLE-9](../packages/access/role-access.md#role-9) pass.
- [SITE-12](../packages/web/application-shell.md#site-12), [SITE-13](../packages/web/application-shell.md#site-13), and [SITE-14](../packages/web/application-shell.md#site-14) pass against package fixtures.
- [LIVE-18](../packages/operations/production-runtime.md#live-18), [LIVE-19](../packages/operations/production-runtime.md#live-19), [LIVE-20](../packages/operations/production-runtime.md#live-20), and [LIVE-21](../packages/operations/production-runtime.md#live-21) pass.
- [PIPE-19](../packages/operations/github-delivery.md#pipe-19), [PLAT-7](../compositions/operations/install-platform.md#plat-7), [PLAT-9](../compositions/operations/install-platform.md#plat-9), [ACCESS-5](../compositions/access/install-course-access.md#access-5), [ENTRY-7](../compositions/access/enter-site.md#entry-7), and [ENTRY-8](../compositions/access/enter-site.md#entry-8) pass.

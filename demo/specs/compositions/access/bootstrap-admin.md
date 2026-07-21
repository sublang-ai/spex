<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# BOOT: Bootstrap the Initial Administrator

## Intent

This composition covers how a GitHub identity, bootstrap role policy, web navigation, and deployed readiness agree on exactly one initial administrator without a first-login claim race.

## Scenario

### BOOT-1
Composes: [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-1](../../packages/access/role-access.md#role-1), [SITE-3](../../packages/web/application-shell.md#site-3)
Bindings: [ENTRY-10](enter-site.md#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-1](install-course-access.md#access-1), [ACCESS-3](install-course-access.md#access-3), [ACCESS-4](install-course-access.md#access-4)

Where the configured GitHub numeric subject signs in, the website shall show that account's current GitHub identity, identify it as `Administrator`, and show the `Admin` navigation and authoring controls.

### BOOT-2
Composes: [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-1](../../packages/access/role-access.md#role-1), [ROLE-2](../../packages/access/role-access.md#role-2), [SITE-3](../../packages/web/application-shell.md#site-3)
Bindings: [ENTRY-10](enter-site.md#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-1](install-course-access.md#access-1), [ACCESS-3](install-course-access.md#access-3), [ACCESS-4](install-course-access.md#access-4)

Where one or more other GitHub subjects sign in before or concurrently with the configured subject, the website shall identify every other account as a member, show none of them the `Admin` navigation, and preserve the configured subject as the only administrator.

### BOOT-3
Composes: [ROLE-4](../../packages/access/role-access.md#role-4), [LIVE-2](../../packages/operations/production-runtime.md#live-2)
Bindings: [ACCESS-5](install-course-access.md#access-5), [PLAT-5](../operations/install-platform.md#plat-5), [PLAT-7](../operations/install-platform.md#plat-7)

Where the bootstrap subject is absent, malformed, changed after administrator assignment, inconsistent with persisted role state, or duplicated in a deployed environment, when an account signs in and an operator checks readiness, the website shall grant no administrator access and the runtime shall report administrator access not ready for that environment.

## Verification

### BOOT-20
Verifies: [BOOT-1](#boot-1), [BOOT-2](#boot-2)

Where the acceptance environment configures one GitHub subject and provides two other accounts, when separate browsers sign in in every order and with concurrent first callbacks, the acceptance suite shall assert one stable administrator, member-only state for the others, and matching identity, role label, header, and authoring-control behavior.

### BOOT-21
Verifies: [BOOT-3](#boot-3)

Where otherwise-ready environments omit, malform, change after assignment, and duplicate the bootstrap state in turn, when an ordinary and intended-admin account each sign in and readiness is requested, the acceptance suite shall assert no authoring access or first-user claim, stable denial under configuration drift, and an environment-specific not-ready result with no secret disclosure.

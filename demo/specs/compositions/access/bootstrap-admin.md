<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# BOOT: Bootstrap the Initial Administrator

## Intent

This composition covers how a GitHub identity, bootstrap role policy, web navigation, and deployed readiness agree on exactly one initial administrator without a first-login claim race.

## Scenarios

### BOOT-1
Composes: [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-1](../../packages/access/role-access.md#role-1), [SITE-3](../../packages/web/application-shell.md#site-3)
Binds:
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `Principal` -> [ROLE-0](../../packages/access/role-access.md#role-0) `Principal`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `DataAccessIdentity` -> [ROLE-0](../../packages/access/role-access.md#role-0) `DataAccessIdentity`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `IdentityView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `IdentityView`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `SessionState` -> [SITE-0](../../packages/web/application-shell.md#site-0) `SessionState`
- [ROLE-0](../../packages/access/role-access.md#role-0) `RoleView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `RoleView`

Where the configured GitHub numeric subject signs in, the website shall show that account's current GitHub identity, identify it as `Administrator`, and show the `Admin` navigation and authoring controls.

### BOOT-2
Composes: [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-1](../../packages/access/role-access.md#role-1), [ROLE-2](../../packages/access/role-access.md#role-2), [SITE-3](../../packages/web/application-shell.md#site-3)
Binds:
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `Principal` -> [ROLE-0](../../packages/access/role-access.md#role-0) `Principal`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `DataAccessIdentity` -> [ROLE-0](../../packages/access/role-access.md#role-0) `DataAccessIdentity`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `IdentityView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `IdentityView`
- [GHID-0](../../packages/access/github-identity.md#ghid-0) `SessionState` -> [SITE-0](../../packages/web/application-shell.md#site-0) `SessionState`
- [ROLE-0](../../packages/access/role-access.md#role-0) `RoleView` -> [SITE-0](../../packages/web/application-shell.md#site-0) `RoleView`

Where one or more other GitHub subjects sign in before or concurrently with the configured subject, the website shall identify every other account as a member, show none of them the `Admin` navigation, and preserve the configured subject as the only administrator.

### BOOT-3
Composes: [ROLE-4](../../packages/access/role-access.md#role-4), [LIVE-2](../../packages/operations/production-runtime.md#live-2)
Binds:
- [ROLE-0](../../packages/access/role-access.md#role-0) `RoleReadiness` -> [LIVE-0](../../packages/operations/production-runtime.md#live-0) `RoleReadiness`

Where the bootstrap subject is absent or malformed in a deployed environment, when an account signs in and an operator checks readiness, the website shall grant no administrator access and the runtime shall report administrator access not ready for that environment.

## Verification

### BOOT-20
Verifies: [BOOT-1](#boot-1), [BOOT-2](#boot-2)

Where the acceptance environment configures one GitHub subject and provides two other accounts, when separate browsers sign in in every order and with concurrent first callbacks, the acceptance suite shall assert one stable administrator, member-only state for the others, and matching header and direct-route behavior.

### BOOT-21
Verifies: [BOOT-3](#boot-3)

Where otherwise-ready environments omit, malform, change after binding, and duplicate the bootstrap state in turn, when an ordinary and intended-admin account each sign in and readiness is requested, the acceptance suite shall assert no authoring access or first-user claim, stable denial under configuration drift, and an environment-specific not-ready result with no secret disclosure.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# BOOT: Bootstrap the Initial Administrator

## Intent

This composition covers how a GitHub identity, bootstrap role policy, web navigation, and deployed readiness agree on exactly one initial administrator without a first-login claim race.

## Scenario

### BOOT-1

Where the configured GitHub numeric subject signs in, the website shall show that account's [current GitHub identity](../../packages/access/github-identity.md#ghid-3), [identify it as `Administrator` and show authoring controls](../../packages/access/role-access.md#role-1), and show the [`Admin` navigation](../../packages/web/application-shell.md#site-3).

### BOOT-2

Where one or more other GitHub subjects establish [authenticated GitHub sessions](../../packages/access/github-identity.md#ghid-3) before or concurrently with the configured subject, the website shall [identify every other account as a member and omit its administrator controls](../../packages/access/role-access.md#role-2), show none of them the [`Admin` navigation](../../packages/web/application-shell.md#site-3), and preserve the configured subject as the [only administrator](../../packages/access/role-access.md#role-1).

### BOOT-3

Where the bootstrap subject is absent, malformed, changed after administrator assignment, inconsistent with persisted role state, or duplicated in a deployed environment, when an account signs in and an operator checks readiness, the website shall [grant no administrator access](../../packages/access/role-access.md#role-4) and the runtime shall [report administrator access not ready for that environment](../../packages/operations/production-runtime.md#live-2).

## Verification

### BOOT-20

Where the acceptance environment configures one GitHub subject and provides two other accounts, when separate browsers exercise the [configured-subject path](#boot-1) and [other-subject path](#boot-2) in every order and with concurrent first callbacks, the acceptance suite shall assert one stable administrator, member-only state for the others, and matching identity, role label, header, and authoring-control behavior.

### BOOT-21

Where otherwise-ready environments omit, malform, change after assignment, and duplicate the bootstrap state in turn, when an ordinary and intended-admin account each sign in and readiness is requested, the acceptance suite shall assert the [fail-closed bootstrap outcome](#boot-3): no authoring access or first-user claim, stable denial under configuration drift, and an environment-specific not-ready result with no secret disclosure.

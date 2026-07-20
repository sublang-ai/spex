<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ROLE: Role Access

## Intent

This package turns a trusted principal and matching data-access identity into the member or initial-administrator capabilities needed by a small content site.
The package does not own authentication and depends only on the trusted identity contracts received at its boundary.


## External Behavior

### ROLE-1

Where the signed-in principal is the configured initial administrator, the access surface shall provide `RoleView` identifying the account as `Administrator`, show course-authoring controls, and allow that account to browse courses, author syllabi, manage videos, and publish courses.

### ROLE-2

Where a signed-in principal is a member, the access surface shall omit administrator navigation and controls.
When that member requests an administrator action directly, the access surface shall provide `AccessDeniedResult` and a denied `AuthorizationDecision` without protected resource data.

### ROLE-3

Where the website has an initial administrator, the access surface shall offer no control for changing roles, adding another administrator, or transferring the administrator role.

### ROLE-4

Where the initial-administrator provider or subject is absent, malformed, conflicts with the persisted bootstrap binding, or more than one administrator row exists, the access surface shall show no administrator identity or authoring control and shall provide not-ready `RoleReadiness` to operators.

## Internal Behavior

### ROLE-10

Where no administrator binding exists and role configuration is ready, when a trusted principal is evaluated, the role registry shall create the `administrator` binding if and only if the principal's provider and canonical immutable subject exactly match the configured bootstrap pair, and shall otherwise create or retain a `member` binding.
The role registry shall perform the account-to-role binding transactionally, enforce at most one administrator row before bootstrap and exactly one after the configured subject binds, and shall not depend on login order, mutable login or profile text, email, mutable metadata, or client-supplied role data.
Where an administrator binding already exists, it shall remain valid only while that binding matches the configured pair.

### ROLE-11

Where the bootstrap provider or subject is absent, malformed, changed after binding, or conflicts with persisted role state, the role registry shall deny every administrator capability and shall report role configuration not ready to its host.
It shall not choose an administrator from existing accounts.

### ROLE-12

When a capability is requested, the authorization boundary shall require a trusted `Principal` and `DataAccessIdentity` naming the same account, evaluate the persisted role for that request, and return a server-only `AuthorizationDecision` bound to the resulting `DataRoleProjection` and exact request.
The authorization boundary shall accept no serialized identity, projection, decision, role, owner, or capability claim from a browser, and the data-role projection shall exist only for a trusted active data-access identity whose account has one persisted role.

### ROLE-13

When the configured administrator's mutable login or profile changes without a provider or immutable-subject change, the role registry shall keep the same administrator binding.

### ROLE-14

When an unregistered authority user, inactive or mismatched trusted identity, missing role row, or generic authority credential requests any capability, the authorization boundary shall deny it and shall provide no `DataRoleProjection`.
It shall allow `course.consume` only to a registered member or administrator and shall apply the capability policy table exactly for every other decision.

### ROLE-15

When role readiness is evaluated, the role registry shall report ready when the bootstrap pair is canonical and either no administrator has signed in yet or exactly one matching administrator binding exists.
It shall report not ready for every missing, malformed, changed, mismatched, or duplicate binding state without creating a role as a readiness side effect.

## Verification

### ROLE-20
Verifies: [ROLE-1](#role-1), [ROLE-2](#role-2), [ROLE-3](#role-3), [ROLE-10](#role-10)

Where the configured subject and two ordinary subjects authenticate in every login order, including concurrent first logins, when each capability is requested, the contract suite shall assert the policy table, one persisted administrator binding, member bindings for the others, one exact `RoleView`/`DataRoleProjection` pair per active registered account, no role-management control, and no login-order effect.

### ROLE-21
Verifies: [ROLE-4](#role-4), [ROLE-11](#role-11), [ROLE-12](#role-12), [ROLE-14](#role-14), [ROLE-15](#role-15)

Where bootstrap configuration is valid before first administrator login, missing, malformed, changed after binding, duplicated in persisted state, or forged in client input and fixtures include an unregistered authority credential, an inactive-but-unexpired session credential, mismatched `Principal`/`DataAccessIdentity`, and forged metadata, when readiness, every capability, and a protected mutation are requested, the contract suite shall assert ready-with-zero-admin only for the valid prelogin state without mutation, a not-ready report for configuration conflicts, denial at the trusted boundary, no data-role projection or accepted browser decision, and no mutation.

### ROLE-22
Verifies: [ROLE-13](#role-13)

Where the configured subject's profile login changes, when the updated principal is evaluated, the contract suite shall assert that the account remains the sole administrator.

## Binding

### ROLE-0

| Field | Contract |
| --- | --- |
| Human users | authenticated members, the configured initial administrator, and operators checking role readiness |
| Owns | access surface, `member` and `administrator` roles, role registry, bootstrap binding, `RoleView`, `RoleReadiness`, `DataRoleProjection`, capability decisions, authorization boundary, admin affordance state, `AccessDeniedResult` |
| Receives | trusted `Principal`; matching trusted server-only `DataAccessIdentity`; configured initial-administrator provider and canonical immutable subject; `CapabilityRequest` naming a capability and optional resource identity |
| Provides | `RoleView`; `RoleReadiness`; trusted server-only `DataRoleProjection`; server-only allow/deny `AuthorizationDecision` for `course.consume`, `course.author`, `video.manage`, and `course.publish`; `AccessDeniedResult` |
| Excludes | sign-in, account profile, syllabus/video/catalog mutation, role-management UI, additional administrators |
| Reuse | public-package candidate; another system may bind any trusted immutable subject and replace the capability vocabulary as a new version |

The role contracts are:

| Contract | Meaning |
| --- | --- |
| `RoleView` | the account's visible `Member` or `Administrator` label and permitted navigation/affordance state, with no server-only role record |
| `RoleReadiness` | `ready` or `not-ready` plus a redacted bootstrap-configuration reason class for operators |
| `DataRoleProjection` | server-only `{ DataAccessIdentity, accessClass, roleRevision }` for one registered active account; authority-specific identifiers remain opaque |
| `CapabilityRequest` | one capability from the policy table plus an optional package-owned resource identity |
| `AuthorizationDecision` | server-only allow or deny bound to the exact data-role projection, capability, optional resource, and current request; it is not replayable or browser-accepted |
| `AccessDeniedResult` | the visible administrator-required outcome with no protected resource data |

The capability policy is:

| Capability | Member | Administrator |
| --- | --- | --- |
| `course.consume` | allow | allow |
| `course.author` | deny | allow |
| `video.manage` | deny | allow |
| `course.publish` | deny | allow |

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ROLE: Course Role Access

## Intent

This package assigns each authenticated course-site account either member or initial-administrator access from trusted identity evidence.
It owns course capability decisions but not authentication or protected course mutations.
It can be reused unchanged by course sites using the same two-role, one-initial-administrator policy.
Each installation supplies the accepted identity providers' canonical immutable-subject rules as trusted configuration; this package compares provider and subject values exactly after that validation.

## User Behavior

### ROLE-1

Where the signed-in account is the configured initial administrator, the access surface shall identify it as `Administrator`, show course-authoring controls, and allow that account to browse courses, author syllabi, manage videos, and publish courses.

### ROLE-2

Where a signed-in account is a member, the access surface shall identify it as `Member` and omit administrator navigation and controls.
When that member requests an administrator action directly, the access surface shall report that administrator access is required, deny the action, and return no protected resource data.

### ROLE-3

Where an initial administrator is configured, the access surface shall offer no control for changing roles, adding another administrator, or transferring the administrator role.

### ROLE-4

Where the initial-administrator provider or subject is absent, malformed under its declared provider rule, conflicts with the persisted bootstrap assignment, or more than one administrator assignment exists, the access surface shall show no administrator identity or authoring control and shall report role configuration not ready to operators.

## Collaborator Behavior

### ROLE-11

Where the bootstrap provider or subject is absent, malformed, changed after assignment, or conflicts with persisted role state, the role registry shall deny every administrator capability and shall report role configuration not ready to its host.
It shall not choose an administrator from existing accounts.

### ROLE-12

Where signed-in account and active-session evidence have been accepted under [ROLE-16](#role-16), when a capability defined by [ROLE-14](#role-14) is requested, the authorization boundary shall evaluate the persisted role for that request and return a server-only allow or deny result associated with that active account, capability, optional resource, and exact request.
The authorization boundary shall accept no serialized identity, account context, decision, role, owner, or capability claim from a browser, and shall produce a trusted application access context only for an active account with one persisted role.

### ROLE-14

When an unregistered authority user, inactive or mismatched trusted identity, missing persisted role assignment, or generic authority credential requests any capability, the authorization boundary shall deny it and shall provide no trusted application access context.
For a registered member, it shall allow `course.consume` and deny `course.author`, `video.manage`, and `course.publish`.
For the administrator, it shall allow all four capabilities.
It shall deny every capability outside that vocabulary.

The capability vocabulary is:

| Capability | Meaning of an allow result for the active account and exact request |
| --- | --- |
| `course.consume` | list or read current published courses and request the exact content attached to a current lesson |
| `course.author` | list, create, read, or change course drafts and request publication candidates |
| `video.manage` | list managed videos and create, resume, cancel, or finalize an upload owned by that account |
| `course.publish` | publish a complete course version or unpublish a current release |

### ROLE-15

When role readiness is evaluated, the role registry shall report ready when the bootstrap pair is canonical and either no administrator has signed in yet or exactly one matching administrator assignment exists.
It shall report not ready for every missing, malformed, changed, mismatched, or duplicate assignment state without creating a role as a readiness side effect.
The report shall name a stable observation ID, evaluation time, the `initial-administrator` capability, the configured role-policy revision or `absent`, its ready or not-ready conclusion, and a redacted evidence class without exposing the configured subject.

## Internal Behavior

### ROLE-10

Where no administrator assignment exists, role configuration is ready, and signed-in account evidence has been accepted under [ROLE-16](#role-16), when that evidence is evaluated, the role registry shall assign `administrator` if and only if its provider and immutable subject are canonical under the declared provider rule and exactly match the configured bootstrap pair, and shall otherwise assign or retain `member`.
The role registry shall perform the account-to-role assignment transactionally, enforce at most one administrator assignment before bootstrap and exactly one after the configured subject is assigned, and shall not depend on login order, mutable login or profile text, email, mutable metadata, or client-supplied role data.
Where an administrator assignment already exists, it shall remain valid only while that assignment matches the configured pair.

### ROLE-13

When the configured administrator's mutable login or profile changes without a provider or immutable-subject change, the role registry shall keep the same administrator assignment.

### ROLE-16

When identity evidence is supplied for role assignment or authorization, the identity intake shall accept only a trusted application account, canonical provider and immutable subject, and active-session evidence that names the same account and exact request.
It shall treat missing, inactive, mismatched, browser-supplied, or generic authority evidence as anonymous and shall provide no account context for a role or capability decision.

## Verification

### ROLE-20
Verifies: [ROLE-1](#role-1), [ROLE-2](#role-2), [ROLE-3](#role-3), [ROLE-10](#role-10)

Where the configured subject and two ordinary subjects authenticate in every login order, including concurrent first logins, when each capability is requested, the contract suite shall assert the capability policy in [ROLE-14](#role-14), one persisted administrator assignment, member assignments for the others, one visible role and trusted application access context per active registered account, no role-management control, and no login-order effect.

### ROLE-21
Verifies: [ROLE-4](#role-4), [ROLE-11](#role-11), [ROLE-12](#role-12), [ROLE-14](#role-14), [ROLE-15](#role-15), [ROLE-16](#role-16)

Where bootstrap configuration is valid before first administrator login, missing, malformed, changed after assignment, duplicated in persisted state, or forged in client input and fixtures include an unregistered authority credential, an inactive-but-unexpired session credential, mismatched account/session evidence, and forged metadata, when readiness, every capability, and a protected mutation are requested, the contract suite shall assert ready-with-zero-admin only for the valid prelogin state without mutation, a not-ready report for configuration conflicts, denial at the trusted boundary, no trusted application access context or accepted browser decision, and no mutation.

### ROLE-22
Verifies: [ROLE-13](#role-13)

Where the configured subject's profile login changes, when the updated account evidence is evaluated, the contract suite shall assert that the account remains the sole administrator.

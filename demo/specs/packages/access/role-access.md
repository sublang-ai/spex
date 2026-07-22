<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ROLE: Course Role Access

## Intent

This package assigns each authenticated course-site account either member or initial-administrator access from trusted identity evidence.
It owns course capability decisions but not authentication or protected course mutations.
It can be reused unchanged by course sites using the same two-role, one-initial-administrator policy.
Each installation supplies the accepted identity providers' canonical immutable-subject rules as trusted configuration; this package compares provider and subject values exactly after that validation.

## External Behavior

### ROLE-1

Where the signed-in account is the configured initial administrator, the access surface shall identify it as `Administrator`, show course-authoring controls, and allow that account to watch videos, author syllabi, manage videos, and publish courses.

### ROLE-2

Where a signed-in account is a member, the access surface shall identify it as `Member` and omit administrator navigation and controls.
When that member requests an administrator action directly, the access surface shall report that administrator access is required, deny the action, and return no protected resource data.

### ROLE-3

Where an initial administrator is configured, the access surface shall offer no control for changing roles, adding another administrator, or transferring the administrator role.

### ROLE-4

Where the initial-administrator provider or subject is absent, malformed under its declared provider rule, conflicts with the persisted bootstrap assignment, or more than one administrator assignment exists, the access surface shall show no administrator identity or authoring control and shall report role configuration not ready to operators.

### ROLE-5

Where the bootstrap provider or subject is absent, malformed, changed after assignment, or conflicts with persisted role state, the role registry shall deny every administrator capability and shall report role configuration not ready to its host.
It shall not choose an administrator from existing accounts.

### ROLE-6

Where signed-in account and active-session evidence have been accepted under [ROLE-11](#role-11), when a capability defined by [ROLE-7](#role-7) is requested, the authorization boundary shall evaluate the persisted role for that request and return a server-only allow or deny result associated with that active account, capability, optional resource, and exact request.
The authorization boundary shall accept no serialized identity, account context, decision, role, owner, or capability claim from a browser, and shall produce a trusted application access context only for an active account with one persisted role.

### ROLE-7

When an unregistered authority user, inactive or mismatched trusted identity, missing persisted role assignment, or generic authority credential requests any capability, the authorization boundary shall deny it and shall provide no trusted application access context.
For a registered member, it shall allow `video.watch` and deny `course.author`, `video.manage`, and `course.publish`.
For the administrator, it shall allow all four capabilities.
It shall deny every capability outside that vocabulary.

The capability vocabulary is:

| Capability | Meaning of an allow result for the active account and exact request |
| --- | --- |
| `video.watch` | request the exact content attached to a current lesson; public catalog, course, and lesson metadata requires no role capability |
| `course.author` | list, create, read, or change course drafts and request publication candidates |
| `video.manage` | list managed videos and create, resume, cancel, or finalize an upload owned by that account |
| `course.publish` | publish a complete course version or unpublish a current release |

### ROLE-8

When role readiness is evaluated, the role registry shall report ready when the bootstrap pair is canonical and either no administrator has signed in yet or exactly one matching administrator assignment exists.
It shall report not ready for every missing, malformed, changed, mismatched, or duplicate assignment state without creating a role as a readiness side effect.
The report shall name a stable observation ID, evaluation time, the `initial-administrator` capability, the configured role-policy revision or `absent`, its ready or not-ready conclusion, and a redacted evidence class without exposing the configured subject.

## Internal Behavior

### ROLE-9

Where no administrator assignment exists, role configuration is ready, and signed-in account evidence has been accepted under [ROLE-11](#role-11), when that evidence is evaluated, the role registry shall assign `administrator` if and only if its provider and immutable subject are canonical under the declared provider rule and exactly match the configured bootstrap pair, and shall otherwise assign or retain `member`.
The role registry shall perform the account-to-role assignment transactionally, enforce at most one administrator assignment before bootstrap and exactly one after the configured subject is assigned, and shall not depend on login order, mutable login or profile text, email, mutable metadata, or client-supplied role data.
Where an administrator assignment already exists, it shall remain valid only while that assignment matches the configured pair.

### ROLE-10

When the configured administrator's mutable login or profile changes without a provider or immutable-subject change, the role registry shall keep the same administrator assignment.

### ROLE-11

When identity evidence is supplied for role assignment or authorization, the identity intake shall accept only a trusted application account, canonical provider and immutable subject, and active-session evidence that names the same account and exact request.
It shall treat missing, inactive, mismatched, browser-supplied, or generic authority evidence as anonymous and shall provide no account context for a role or capability decision.

## Verification

### ROLE-12

Where the configured subject and two ordinary subjects authenticate in every login order, including concurrent first logins, when each capability is requested, the contract suite shall assert [transactional assignment of the sole administrator only to the configured canonical subject, member assignment to the others, and no login-order effect](#role-9); the exact [four-capability allow and deny policy with one trusted access context per active registered account](#role-7); the [administrator label, controls, and allowed actions](#role-1); the [member label, omitted controls, redacted denial, and absent protected data](#role-2); and the [absence of every role-management control](#role-3).

### ROLE-13

Where bootstrap configuration is valid before first administrator login, missing, malformed, changed after assignment, duplicated in persisted state, or forged in client input and fixtures include an unregistered authority credential, an inactive-but-unexpired session credential, mismatched account/session evidence, and forged metadata, when readiness, every capability, and a protected mutation are requested, the contract suite shall assert the [stable, redacted ready-with-zero-admin report only for the valid prelogin state and not-ready report without mutation for every conflict](#role-8); the [operator-visible not-ready state with no administrator identity or authoring control](#role-4); [denial of every administrator capability without selecting a replacement administrator](#role-5); and the [anonymous treatment of every untrusted or mismatched identity input](#role-11).
For every request, it shall also assert a [server-only decision bound to the active account, capability, resource, and exact request, with no accepted browser claim](#role-6), the [closed capability policy and absence of an access context after denial](#role-7), and no protected mutation.

### ROLE-14

Where the configured subject's profile login changes, when the updated account evidence is evaluated, the contract suite shall assert that the [unchanged provider and immutable subject retain the same administrator assignment](#role-10).

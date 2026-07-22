<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ROLE: Two-Role Access

## Intent

This package assigns each authenticated account either `administrator` or `member` access from trusted identity evidence and one configured provider-and-subject pair.
It owns role assignment and course-site capability decisions, not authentication or the protected resources.
It can be reused unchanged by applications using the same two-role and three-capability policy.
The stable subject is an immutable string issued by its identity provider; provider and subject values are compared exactly.
A trusted active-session context names one accepted application account, provider identity, active application session, and exact request.

## External Behavior

### ROLE-1

When an authenticated account signs in, the access surface shall identify the account as `Administrator` if its trusted provider and stable subject exactly match the configured pair for that sign-in, and as `Member` otherwise.
It shall show administrator controls only for the administrator role.

### ROLE-2

Where a trusted active-session context exists, when a capability is requested, the authorization boundary shall return a server-only allow or deny decision associated with the exact account, session, request, capability, and named resource when applicable.
It shall allow `video.watch` for a member and shall deny that member `course.manage` and `video.manage`.
It shall allow all three capabilities for an administrator and deny every capability outside this vocabulary.

The capability vocabulary is:

| Capability | Meaning of an allow decision |
| --- | --- |
| `course.manage` | list, create, read, change, publish, unpublish, or delete courses and their syllabi |
| `video.manage` | list, upload, rename, choose, or delete managed videos |
| `video.watch` | request playback for the exact video named by the host request |

### ROLE-3

Where a caller has no allowed decision for an administrator surface or action, when the caller requests it directly, the access surface shall return no protected resource data, perform no protected action, and report that administrator access is required without disclosing the target's content.

### ROLE-4

The access surface shall offer no control for changing roles, adding another administrator, or transferring the administrator role.

## Internal Behavior

### ROLE-5

When identity evidence is supplied for role assignment or authorization, the identity intake shall accept only a trusted application account, provider, stable subject, and active-session context that all name the same account, session, and exact request.
It shall reject missing, inactive, mismatched, browser-supplied, or generic identity evidence and shall provide no authenticated role or allowed capability after rejection.

### ROLE-6

When accepted identity evidence establishes a new application session, the role registry shall assign that session `administrator` if and only if its provider and stable subject exactly match the configured pair at that sign-in, and shall otherwise assign it `member`.
The assigned role shall remain associated with that session until the session ends; a later configuration change shall affect an account when it next signs in and shall not rewrite an already-active session.

### ROLE-7

When a capability decision is evaluated, the authorization boundary shall use only the role associated with the accepted active-session context and the exact requested capability and resource.
It shall run at the trusted server boundary, ignore every client-supplied account, session, role, capability, resource, or prior decision claim, and perform no protected read or mutation as part of evaluation.

## Verification

### ROLE-8

Where controlled configuration and identity fixtures cover exact and nonmatching providers and subjects, mutable profile changes, sign-ins before and after configuration rotation, and an old session retained across rotation, when role assignment is exercised, the contract suite shall assert the [exact administrator-or-member result and administrator-control visibility](#role-1), the [acceptance only of matching trusted account, session, identity, and request evidence](#role-5), and the [per-sign-in assignment whose active-session role remains unchanged while later sign-ins use the new configured pair](#role-6).

### ROLE-9

Where member, administrator, anonymous, mismatched-session, and forged-client fixtures request every declared and undeclared capability against named resources, when authorization and direct protected requests are exercised, the contract suite shall assert the [exact three-capability allow and deny policy with request-bound server decisions](#role-2), the [redacted denial with no protected data or mutation](#role-3), the [absence of every role-management control](#role-4), and the [server-only evaluation that ignores all client claims and has no resource side effect](#role-7).

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ROLE: Access Control

## Intent

This spec covers authorization: the two roles — admin and
member — how the initial admin is designated by deployment
configuration, and the guard that denies requests lacking a
required role.
It knows nothing about what guarded surfaces contain; other
packages designate their own surfaces admin-only and cite the
guard.
Role administration beyond the configured designation — role
lists, promotion flows — is out of scope.

## External Behavior

### Roles

#### ROLE-1

Where the deployment configuration names a GitHub username as the
initial admin, when an account completes sign-in
([AUTH-2](github-login.md#auth-2)), the site shall hold the admin
role for that session when the account's username matches the
configured name case-insensitively, and the member role
otherwise.

### The Guard

#### ROLE-2

Where a surface or request path is designated admin-only, when a
request without an admin-role session targets it, the access
guard shall deny it: while no session is active, by sending the
requester to sign-in and returning them to the target after
sign-in completes; while a member session is active, by a
not-authorized response that reveals nothing of the target's
content.

## Internal Behavior

### Role Storage

#### ROLE-3

Where the identity store maintains a user record for the
account ([AUTH-7](github-login.md#auth-7)), when the account
completes sign-in, the role store shall record the account's
role, keyed by the account's stable ID, from the current
configuration — admin on a match, member otherwise — so a
configuration change takes effect at each account's next
sign-in, with no separate migration step.

### Check Discipline

#### ROLE-4

Where a role check gates a surface or request path, the check
shall run server-side against the stored role; hiding a control
in the browser shall never be the only barrier, and
client-supplied role claims shall never be honored.

## Verification

### Grant Coverage

#### ROLE-5
Verifies: [ROLE-1](#role-1), [ROLE-3](#role-3)

Where the configuration names a stub account as the initial
admin, when that account and a second stub account sign in, the
test suite shall assert the configured account holds the admin
role and the other holds member; when the configured name changes
to the second account and both sign in again, the suite shall
assert the roles have swapped.

### Guard Coverage

#### ROLE-6
Verifies: [ROLE-2](#role-2), [ROLE-4](#role-4)

Where a fixture surface is designated admin-only, the test suite
shall assert: a signed-out request is sent to sign-in and returns
to the target after stub sign-in; a member-session request
receives a not-authorized response whose body carries none of the
fixture surface's content; an admin-session request succeeds; and
a member-session request carrying a forged client-side admin
claim is still denied.

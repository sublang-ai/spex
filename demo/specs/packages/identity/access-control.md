<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# access-control: Access Control

## Intent

This spec covers authorization: the two roles — admin and member — how the initial admin is designated by deployment configuration, and the guard that denies requests lacking a required role.
It knows nothing about what guarded surfaces contain; other packages designate their own surfaces admin-only and cite the guard.
Role administration beyond the configured designation — role lists, promotion flows — is out of scope.

## External Behavior

### Roles

#### access-control-1

Where the deployment configuration names a GitHub account by its stable account ID as the initial admin, when an account completes sign-in [[github-login-2](github-login.md#github-login-2)], the site shall hold the admin role for the account when its stable ID matches the configured one, and the member role otherwise:

- Usernames are mutable and never designate the initial admin.

#### access-control-2

A request shall act under its account's currently held role — held per account, not per session — so a role recorded at a later sign-in governs every session of the account.

#### access-control-3

The package shall expose no operation that changes, grants, or transfers a role at runtime; changing the configured designation is the only path.

### The Guard

#### access-control-4

Where a surface or request path is designated admin-only, when a request without an admin-role session targets it, the access guard shall deny it:

- while no session is active, by sending the requester to sign-in and returning them to the target after sign-in completes;
- while a member session is active, by a not-authorized response that reveals nothing of the target's content.

## Internal Behavior

### Role Storage

#### access-control-5

Where the identity store maintains a user record for the account [[github-login-8](github-login.md#github-login-8)], when the account completes sign-in, the role store shall record the account's role, keyed by the account's stable ID, from the current configuration — admin on a match, member otherwise — so a configuration change takes effect at each account's next sign-in, with no separate migration step.

### Check Discipline

#### access-control-6

Where a role check gates a surface or request path, the check shall run server-side against the stored role:

- hiding a control in the browser is never the only barrier;
- client-supplied role claims are never honored.

## Verification

### Grant Coverage

#### access-control-7

Where the configuration names a stub account as the initial admin, the test suite shall assert, over one sign-in sequence of stub accounts:

- when that account and a second stub account sign in, the configured account holds the admin role and the other holds member [[access-control-1](#access-control-1)];
- when the configured ID changes to the second account and both sign in again, the roles have swapped, and a still-active earlier session of the first account acts as member from its next request — the recomputed role governs every session of the account [[access-control-2](#access-control-2)] [[access-control-5](#access-control-5)];
- when a third account adopts the first account's former username and signs in, it holds member [[access-control-1](#access-control-1)];
- the package exposes no operation that changes, grants, or transfers a role at runtime [[access-control-3](#access-control-3)].

### Guard Coverage

#### access-control-8

Where a fixture surface is designated admin-only, the test suite shall assert:

- a signed-out request is sent to sign-in and returns to the target after stub sign-in [[access-control-4](#access-control-4)];
- a member-session request receives a not-authorized response whose body carries none of the fixture surface's content [[access-control-4](#access-control-4)];
- an admin-session request succeeds;
- a member-session request carrying a forged client-side admin claim is still denied [[access-control-6](#access-control-6)].

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# BOOT: Bootstrap the Initial Administrator

## Intent

This composition covers how one configured GitHub subject reaches course creation after one sign-in without a first-user claim or separate role-assignment step.

## Scenario

### BOOT-1

Where a fresh deployment has no account or course and its configured administrator pair is provider `github` plus one GitHub numeric subject, when that subject completes [GitHub sign-in](../../packages/access/github-identity.md#ghid-3), the website shall [identify the account as `Administrator` and show administrator controls](../../packages/access/role-access.md#role-1), show the shell's [`Admin` navigation](../../packages/web/application-shell.md#site-3), and present the [empty course-management state with `Create course` as its primary action](../../packages/learning/course-catalog.md#cat-5) without a role-assignment or first-user-claim step.

### BOOT-2

Where a deployment names one GitHub subject as administrator, when one or more other subjects complete [GitHub sign-in](../../packages/access/github-identity.md#ghid-3) before, after, or concurrently with that subject, the website shall [identify every nonmatching account as `Member` and omit its administrator controls](../../packages/access/role-access.md#role-1), show none of them the shell's [`Admin` navigation](../../packages/web/application-shell.md#site-3), and preserve the configured subject's [administrator result](../../packages/access/role-access.md#role-1) regardless of sign-in order.

## Verification

### BOOT-3

Where the acceptance environment starts with no account or course, configures one GitHub numeric subject as administrator, and provides two other GitHub subjects, when separate browsers exercise the [configured-subject journey](#boot-1) and [nonmatching-subject journey in every order and concurrently](#boot-2), the acceptance suite shall assert administrator identity, `Admin` navigation, and immediate `Create course` entry only for the configured subject; member-only state for every other subject; and no role-assignment or first-user-claim step.

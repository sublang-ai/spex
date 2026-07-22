<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# BOOT: Admin Bootstrap

## Intent

This composition covers day zero: a fresh deployment with no
users becomes a site with a working admin in one sign-in, per
[DR-003](../decisions/003-admin-designation.md).
It spans delivery, GitHub login, access control, the shell, and
the catalog's empty state — no package owns the whole path, and
the path's value is that no manual step exists anywhere in it.

## Scenario

### BOOT-1

Where a fresh production deployment is serving
([DELIV-3](../packages/ops/delivery.md#deliv-3)) with an
initial-admin account configured
([ROLE-1](../packages/identity/access-control.md#role-1)) and no
user record exists, when that account completes GitHub sign-in
([AUTH-2](../packages/identity/github-login.md#auth-2)), the
site shall treat it as admin from the first response after
sign-in: the header carries the Admin entry
([SHELL-2](../packages/site/web-shell.md#shell-2)) and the
course manager opens
([ROLE-2](../packages/identity/access-control.md#role-2)) — with
no manual role-assignment step anywhere in the path.

### BOOT-2

While no course exists, when the admin opens the course manager,
the path from an empty site to its first course shall be one
action deep: creation is the manager's primary action
([CAT-4](../packages/catalog/course-catalog.md#cat-4)).

## Tests

### BOOT-3

Where a deployment with an empty database is configured with a
stub GitHub provider and an initial-admin account, when the
acceptance suite signs in as the configured account
([AUTH-2](../packages/identity/github-login.md#auth-2),
[ROLE-1](../packages/identity/access-control.md#role-1)), the
suite shall assert the header carries the Admin entry
([SHELL-2](../packages/site/web-shell.md#shell-2)) and the
course manager loads ([BOOT-1](#boot-1)); when it signs in as
another account, the suite shall assert no Admin entry appears
and the course manager responds not-authorized
([ROLE-2](../packages/identity/access-control.md#role-2)).

### BOOT-4

Where the configured account signs in on the empty deployment,
the acceptance suite shall assert exactly one user record exists
([AUTH-7](../packages/identity/github-login.md#auth-7)), holding
the admin role
([ROLE-3](../packages/identity/access-control.md#role-3)), and
that the course manager presents creation as its primary action
([BOOT-2](#boot-2),
[CAT-4](../packages/catalog/course-catalog.md#cat-4)); after the
admin creates the first course, the suite shall assert the
manager lists it.

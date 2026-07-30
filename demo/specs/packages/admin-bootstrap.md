<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# admin-bootstrap: Admin Bootstrap

## Intent

This package covers day zero: a fresh deployment with no users becomes a site with a working admin in one sign-in.
The path spans delivery, GitHub login, access control, the shell, and the catalog's empty state — no single package owns the whole path, and the path's value is that no manual step exists anywhere in it.

## External Behavior

### admin-bootstrap-1

Where a fresh production deployment is serving [[delivery-3](ops/delivery.md#delivery-3)] with an initial-admin account configured [[access-control-1](identity/access-control.md#access-control-1)] and no user record exists, when that account completes GitHub sign-in [[github-login-2](identity/github-login.md#github-login-2)] from the guard's redirect [[access-control-2](identity/access-control.md#access-control-2)] off its course-manager request, the site shall treat it as admin from the first response after sign-in: the header carries the Admin entry [[web-shell-2](site/web-shell.md#web-shell-2)] and the course manager — the guarded target — opens, with no manual role-assignment step anywhere in the path.

### admin-bootstrap-2

While no course exists, when the admin opens the course manager, the path from an empty site to its first course shall be one action deep: creation is the manager's primary action [[course-catalog-22](catalog/course-catalog.md#course-catalog-22)].

## Verification

### admin-bootstrap-3

Where a deployment with an empty database is configured with a stub GitHub provider and an initial-admin account, when the acceptance suite completes sign-in from the guard's redirect off its course-manager request, the suite shall assert each audience's admin surface:

1. signed in as the configured account [[github-login-2](identity/github-login.md#github-login-2)] [[access-control-1](identity/access-control.md#access-control-1)], the header carries the Admin entry [[web-shell-2](site/web-shell.md#web-shell-2)] and the course manager — the requested target — loads [[admin-bootstrap-1](#admin-bootstrap-1)];
2. signed in as another account, no Admin entry appears and the course manager responds not-authorized [[access-control-2](identity/access-control.md#access-control-2)].

### admin-bootstrap-4

Where the configured account signs in on the empty deployment, the acceptance suite shall assert exactly one user record exists [[github-login-7](identity/github-login.md#github-login-7)], holding the admin role [[access-control-3](identity/access-control.md#access-control-3)], and that the course manager presents creation as its primary action [[admin-bootstrap-2](#admin-bootstrap-2)] [[course-catalog-22](catalog/course-catalog.md#course-catalog-22)]; and that one create action from there yields the site's first course — the path from the empty site one action deep [[admin-bootstrap-2](#admin-bootstrap-2)].

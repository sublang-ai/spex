<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# NAV: Site Navigation

## Intent

This composition gives the product its map: the shell's header
leaves its navigation entries, session control, and admin entry
as open slots, and this file binds them — and the home page — to
the product's surfaces.
The shell stays free of product nouns; the bindings live here,
and nowhere else.

## Binding

### NAV-1

Where the shell's header carries the deployment's navigation
entries, session control, and admin entry
([SHELL-1](../packages/site/web-shell.md#shell-1),
[SHELL-2](../packages/site/web-shell.md#shell-2)), the
deployment shall bind them as follows: the session control is
the account menu
([AUTH-4](../packages/identity/github-login.md#auth-4)); one
navigation entry, labeled "Courses", leads to the course list
([CAT-1](../packages/catalog/course-catalog.md#cat-1)); and the
admin entry, labeled "Admin", leads to the admin area presenting
the course manager
([CAT-4](../packages/catalog/course-catalog.md#cat-4)) and the
video library
([VID-4](../packages/catalog/video-library.md#vid-4)).

### NAV-2

Where the shell's site name links to the home page
([SHELL-1](../packages/site/web-shell.md#shell-1)), the
deployment shall present the course list
([CAT-1](../packages/catalog/course-catalog.md#cat-1)) as the
home page's content for every visitor.

## Tests

### NAV-3

Where fixture sessions exist for an admin, a member, and a
signed-out visitor on a seeded deployment, the acceptance suite
shall assert: the home page presents the course list
([NAV-2](#nav-2),
[CAT-1](../packages/catalog/course-catalog.md#cat-1)); the
header's "Courses" entry leads to the course list
([NAV-1](#nav-1),
[SHELL-1](../packages/site/web-shell.md#shell-1)); the session
control renders the account menu matching each session state
([AUTH-4](../packages/identity/github-login.md#auth-4)); and
for the admin session only, the "Admin" entry leads to the
admin area with the course manager and the video library both
reachable ([SHELL-2](../packages/site/web-shell.md#shell-2),
[CAT-4](../packages/catalog/course-catalog.md#cat-4),
[VID-4](../packages/catalog/video-library.md#vid-4)).

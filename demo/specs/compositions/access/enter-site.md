<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ENTRY: Enter the Course Site

## Intent

This composition covers the visitor outcome that no package owns alone: request private course content, use the sole GitHub entry path, and arrive at the intended safe page with an authenticated catalog session.

## Binding

### ENTRY-10
Clients: `login route` = [SITE-1](../../packages/web/application-shell.md#site-1), `protected-route entry` = [SITE-2](../../packages/web/application-shell.md#site-2), `login failure state` = [SITE-4](../../packages/web/application-shell.md#site-4)
Suppliers: `GitHub action` = [GHID-1](../../packages/access/github-identity.md#ghid-1), `failed result` = [GHID-2](../../packages/access/github-identity.md#ghid-2), `successful result` = [GHID-3](../../packages/access/github-identity.md#ghid-3)
Scope: `/login` and protected-route entry in the course website

The installation shall place GHID's sole GitHub action and its unchanged failed or successful visible result into SITE's login route, protected-entry, and failure-state roles, while SITE retains destination safety and page layout.

## Scenario

### ENTRY-1
Composes: [SITE-2](../../packages/web/application-shell.md#site-2), [GHID-1](../../packages/access/github-identity.md#ghid-1), [GHID-3](../../packages/access/github-identity.md#ghid-3), [ROLE-2](../../packages/access/role-access.md#role-2), [CAT-1](../../packages/learning/course-catalog.md#cat-1)
Bindings: [ENTRY-10](#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-1](install-course-access.md#access-1), [ACCESS-2](install-course-access.md#access-2), [ACCESS-3](install-course-access.md#access-3), [ACCESS-4](install-course-access.md#access-4)

Where a visitor requests `/courses`, when the visitor completes `Continue with GitHub`, the website shall return the now-authenticated member to `/courses`, show the published catalog with no administrator navigation, and present no second registration or login method.

### ENTRY-2
Composes: [GHID-2](../../packages/access/github-identity.md#ghid-2), [SITE-4](../../packages/web/application-shell.md#site-4)
Bindings: [ENTRY-10](#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-2](install-course-access.md#access-2)

While a visitor is entering through GitHub, when the visitor cancels, the provider fails, or the returned GitHub identity cannot be reconciled into a trusted account, the website shall retain the login page and course destination, create no application session, explain the failure without identity or raw provider detail, and offer a retry.

### ENTRY-3
Composes: [SITE-2](../../packages/web/application-shell.md#site-2), [GHID-3](../../packages/access/github-identity.md#ghid-3)
Bindings: [ENTRY-10](#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-2](install-course-access.md#access-2)

Where a sign-in request carries a known route-map-relative destination, when GitHub sign-in succeeds, the website shall return to that exact destination.
Where a sign-in request carries an absolute, cross-origin, protocol-relative, malformed, or unknown destination, when GitHub sign-in succeeds, the website shall ignore that destination and open `/courses` under the application origin.

### ENTRY-4
Composes: [GHID-5](../../packages/access/github-identity.md#ghid-5), [ROLE-2](../../packages/access/role-access.md#role-2), [SITE-2](../../packages/web/application-shell.md#site-2), [SITE-6](../../packages/web/application-shell.md#site-6), [CAT-2](../../packages/learning/course-catalog.md#cat-2), [CAT-6](../../packages/learning/course-catalog.md#cat-6)
Bindings: [ENTRY-10](#entry-10), [PLAT-1](../operations/install-platform.md#plat-1), [ACCESS-1](install-course-access.md#access-1), [ACCESS-2](install-course-access.md#access-2), [ACCESS-3](install-course-access.md#access-3), [ACCESS-4](install-course-access.md#access-4)

While a member is viewing a published course, when the application session expires and the member signs in again, the website shall return to that same safe published-course route when it still exists.
When the course became unpublished before re-entry, the website shall show `Page unavailable` at that route with a link to `/courses`, reveal no stale course data, and show no administrator navigation to that member.

## Verification

### ENTRY-20
Verifies: [ENTRY-1](#entry-1), [ENTRY-2](#entry-2), [ENTRY-4](#entry-4)

Where the acceptance environment has one published course and a deterministic fake GitHub OAuth authority, when a browser drives successful entry, cancellation, provider failure, rejected identity reconciliation, session expiry, re-entry from catalog and course routes, and re-entry after that course is unpublished, the acceptance suite shall assert session creation only on success, a redacted retry view for every failed authentication result, member access with no administrator affordance, fresh permission to consume courses, exact safe destinations, visible recovery states, the published catalog view, and the redacted unavailable fallback with `/courses` link.

### ENTRY-21
Verifies: [ENTRY-3](#entry-3)

Where sign-in links contain absolute, cross-origin, protocol-relative, malformed, unknown-route, catalog, course, and lesson destinations, when a browser completes GitHub sign-in for each case, the acceptance suite shall assert that each known route-map-relative destination is retained exactly and every unsafe or unknown case lands on same-origin `/courses`.

### ENTRY-22
Verifies: [ENTRY-10](#entry-10)

Where SITE's login and protected-entry states are rendered with successful, canceled, failed, and unreconciled GHID fixtures, when a browser inspects and operates each state, the acceptance suite shall assert the one GitHub action, unchanged redacted result, retry behavior, SITE-owned layout and safe destination, and absence of any second login method.

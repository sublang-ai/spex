<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# ENTRY: Enter the Course Site

## Intent

This composition installs the sole GitHub entry path for protected actions on a publicly browsable course site and preserves the visitor's safe public destination across authentication and recovery.

## Binding

### ENTRY-10
Clients: `login route` = [SITE-1](../../packages/web/application-shell.md#site-1), `signed-out header entry` = [SITE-3](../../packages/web/application-shell.md#site-3), `authentication-required entry` = [SITE-2](../../packages/web/application-shell.md#site-2), `login failure state` = [SITE-4](../../packages/web/application-shell.md#site-4)
Suppliers: `GitHub action` = [GHID-1](../../packages/access/github-identity.md#ghid-1), `failed result` = [GHID-2](../../packages/access/github-identity.md#ghid-2), `successful result` = [GHID-3](../../packages/access/github-identity.md#ghid-3)
Scope: `/login`, the signed-out global header, and every authentication-required route or action in the course website

The installation shall place GHID's sole GitHub action and its unchanged failed or successful visible result into SITE's login route, signed-out header, authentication-required entry, and failure-state roles, while SITE retains destination safety and page layout.

## Scenario

### ENTRY-1

Where a visitor is browsing the [public catalog](../../packages/learning/course-catalog.md#cat-1), when the visitor explicitly activates [`Continue with GitHub`](../../packages/access/github-identity.md#ghid-1) through the [installed entry surface](#entry-10), the website shall use no second registration or login method and shall return the authenticated member to `/courses` with the same published catalog and [no administrator navigation](../../packages/access/role-access.md#role-2).
Opening `/courses`, a published course, or a published lesson shall not itself start authentication.

### ENTRY-2

While a visitor is entering through the [installed GitHub action](#entry-10), when the visitor cancels, the provider fails, or the returned GitHub identity cannot be reconciled into a trusted account, the website shall [create no application session, redact the failure, retain the safe destination, and offer a retry](../../packages/access/github-identity.md#ghid-2) while [retaining the login route context](../../packages/web/application-shell.md#site-4), and shall issue no playback grant.

### ENTRY-3

Where a sign-in request carries a [known route-map-relative destination](../../packages/web/application-shell.md#site-2), when [GitHub sign-in succeeds](../../packages/access/github-identity.md#ghid-3), the website shall return to that exact destination.
Where a sign-in request carries an absolute, cross-origin, protocol-relative, malformed, or unknown destination, when GitHub sign-in succeeds, the website shall [discard that destination and open `/courses`](../../packages/web/application-shell.md#site-2) under the application origin.
The authentication request and callback shall preserve no content reference, asset identity, private object location, or bearer value.

### ENTRY-4

While a member is viewing a [published course or lesson](../../packages/learning/course-catalog.md#cat-2), when the application session expires, the website shall keep the current public metadata visible, [ask for GitHub sign-in again](../../packages/access/github-identity.md#ghid-5), [stop protected playback and renewal](../../packages/media/video-library.md#vids-9), and preserve the safe public route for a retry.
When the member signs in again, the website shall return to that route and recompute playback authorization from its exact current lesson and attachment through the [installed playback handoff](../learning/browse-and-watch.md#learn-10).
When the course became unpublished before re-entry, the website shall instead show the uniform [`Page unavailable` state](../../packages/web/application-shell.md#site-6) at that route with a link to `/courses`, reveal no stale course or video data, and issue no playback grant.

## Verification

### ENTRY-20

Where the acceptance environment has one published course and a deterministic fake GitHub OAuth authority, when a clean browser exercises [public entry](#entry-1), [failed entry](#entry-2), and [expiry and re-entry](#entry-4), the acceptance suite shall assert public browsing without an authentication redirect, session creation only on success, no grant on failure or expiry, a redacted retry view for every failed result, no administrator affordance, exact safe destinations, current-only playback after re-entry, and the redacted unavailable fallback with `/courses` link.

### ENTRY-21

Where sign-in links contain absolute, cross-origin, protocol-relative, malformed, unknown-route, catalog, course, and lesson destinations, when a browser completes the [safe-destination scenario](#entry-3) for each case, the acceptance suite shall assert that each known route-map-relative destination is retained exactly, every unsafe or unknown case lands on same-origin `/courses`, and no callback or browser history entry contains a content reference, asset identity, private object location, or bearer value.

### ENTRY-22

Where SITE's signed-out header, login, and authentication-required states are rendered with successful, canceled, failed, and unreconciled GHID fixtures, when a browser inspects and operates the [installed entry seam](#entry-10) in each state, the acceptance suite shall assert the one GitHub action, unchanged redacted result, retry behavior, SITE-owned layout and safe destination, and absence of any second login method.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SITE: Application Shell

## Intent

This project-local package gives the course website a coherent route, navigation, responsive-state, and accessibility language while leaving identity, authorization, and domain content to their owning packages.
The rendering platform follows [DR-001](../../decisions/001-web-platform.md).


## External Behavior

### SITE-1

When a user follows a route in the route map, the application shell shall show one consistent header and main-content region, preserve the route in the browser history, and render the package-owned view assigned to that route without renaming its domain terms.

### SITE-2

Where a visitor requests a known protected route in the route map, the application shell shall show `/login` and remember the originally requested safe internal path.
When authentication succeeds, it shall return to that path; when a requested destination is absolute, protocol-relative, cross-origin, malformed, or not in the route map, it shall discard it and use `/courses`.

### SITE-3

Where a member is authenticated, the global header shall provide `Courses`, the member's GitHub identity, and `Sign out`.
Where that member is an administrator, it shall also provide `Admin`; where the member is not an administrator, it shall not show that entry.

### SITE-4

While any package-owned view is loading, empty, unavailable, or has a retryable failure, the application shell shall retain the header and route context, label the state in plain language, and provide the owning package's permitted retry or next action instead of a blank page or raw provider error.

### SITE-5

Where the website is used at widths from 360 CSS pixels upward or at 200 percent zoom, the integrated responsive/accessibility presentation shall keep the application shell and every received package view's primary content and actions usable without horizontal page scrolling.
When it renders navigation, dialogs, forms, reorder controls, upload controls, content choosers, or video controls, the integrated responsive/accessibility presentation shall preserve semantic labels and state supplied by their package views and make every control keyboard reachable, visibly focused, programmatically labeled, and announced with its state changes.

### SITE-6

When an unknown route is requested by any session state, or an owning package reports `CatalogUnavailableResult` or `VideoUnavailableResult`, the application shell shall show one uniform `PageUnavailableView` with a link to `/courses` and shall not reveal whether a hidden draft, release, lesson, or asset exists.

## Internal Behavior

### SITE-10

When a protected route, Route Handler, or Server Action is evaluated, the request boundary shall obtain fresh trusted `AuthenticationResult`, `DataRoleProjection`, and `AuthorizationDecision` for that request before producing protected data or mutation results, so protected content and administrator controls are absent from the initial response when access is denied.

### SITE-11

When a requested destination is accepted or returned after authentication, the destination boundary shall normalize it to a route-map-relative path and shall never use a client-supplied scheme, host, or protocol-relative value as a redirect target.

### SITE-12

When a package view is rendered, the view boundary shall provide the browser only the fields required by that visible state and shall not serialize service credentials, raw authorization records, unpublished fields, or private object locations into general page data.

### SITE-13

When a package reports `CatalogUnavailableResult`, `VideoUnavailableResult`, or a retryable state in `PlaybackView`, the state boundary shall map it to [SITE-4](#site-4) or [SITE-6](#site-6) without exposing provider-specific messages and shall keep diagnostic detail available only to the operator surface.

### SITE-14

When an authentication callback or authenticated response is produced, the response-cache boundary shall mark user-specific and cookie-changing responses private and non-shared and shall prevent static, ISR, or CDN reuse across requests.
When a request begins on a warm application instance, the request boundary shall create user-specific session and provider state for only that request and shall not reuse it for another user.

## Verification

### SITE-20
Verifies: [SITE-1](#site-1), [SITE-2](#site-2), [SITE-3](#site-3), [SITE-6](#site-6), [SITE-11](#site-11)

Where fake identity and role views represent visitor, member, and administrator and package fixtures provide each typed unavailable result, when every route plus same-origin, cross-origin, protocol-relative, malformed, and unknown destinations are visited, the shell contract suite shall assert the expected page, history, header, safe `RequestedDestination`, and exact uniform `PageUnavailableView` mapping.

### SITE-21
Verifies: [SITE-4](#site-4), [SITE-5](#site-5), [SITE-13](#site-13)

Where each page-state fixture is rendered at 360 pixels and at 200 percent zoom, when keyboard-only navigation and automated accessibility checks exercise every control and state transition, the suite shall assert retained context, usable layout, focus order and visibility, labels, announcements, and absence of raw provider errors.

### SITE-22
Verifies: [SITE-10](#site-10), [SITE-12](#site-12), [SITE-14](#site-14)

Where protected view fixtures contain administrator, draft, signing, and service-only fields and two users alternate requests on one warm instance, when denied and allowed server-rendered responses, callbacks, action responses, cache metadata, and browser state are inspected, the contract suite shall assert no protected initial response on denial, only the visible fields required for the allowed page, private non-shared caching, and no identity, cookie, or data transfer between users.

## Binding

### SITE-0

| Field | Contract |
| --- | --- |
| Human users | visitors, authenticated members, and administrators using the website |
| Owns | application shell, `ShellView`, `PageUnavailableView`, route map, global header and layout, navigation, requested-destination boundary, request/view/state boundaries, page-level loading/empty/error/unavailable states, integrated responsive/accessibility presentation, response-cache boundary |
| Receives | trusted `AuthenticationResult`, `DataRoleProjection`, and `AuthorizationDecision`; `IdentityView` and `SessionState`; `RoleView` and `AccessDeniedResult`; `CatalogListView`, `CourseDetailView`, `LessonView`, `PublicationResult`, and `CatalogUnavailableResult`; `DraftListView`, `DraftEditorView`, `DraftSaveResult`, and `PublicationCandidateResult`; `UploadView`, `VideoLibraryView`, `PlaybackView`, and `VideoUnavailableResult` |
| Provides | normalized `RequestedDestination`; integrated `ShellView`; uniform `PageUnavailableView` |
| Excludes | authentication truth, capability decisions, drafts, releases, video assets, deployment |
| Reuse | project-local host package; its route map is product-specific, while its state and accessibility rules can seed another web shell |

The shell contracts are:

| Contract | Meaning |
| --- | --- |
| `RequestedDestination` | a normalized route-map-relative path, or absent; never an absolute, cross-origin, protocol-relative, malformed, or unknown target |
| `ShellView` | the route's header, navigation, main page slot, and page state while preserving every received package term and permitted action |
| `PageUnavailableView` | the uniform `Page unavailable` state and `/courses` action, with no hidden resource type, identity, or cause |

The route map is:

| Route | Audience and content |
| --- | --- |
| `/` | redirect to `/courses` |
| `/login` | visitor GitHub sign-in; authenticated users redirect to requested destination or `/courses` |
| `/auth/callback` | authentication completion, then safe redirect |
| `/courses` | authenticated catalog |
| `/courses/[slug]` | authenticated published course release |
| `/courses/[slug]/lessons/[lessonId]` | authenticated lesson and entitled video playback |
| `/admin/courses` | administrator draft list and publication status |
| `/admin/courses/new` | administrator draft creation |
| `/admin/courses/[draftId]` | administrator syllabus editor and video attachment |

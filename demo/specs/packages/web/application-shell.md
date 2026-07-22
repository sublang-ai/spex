<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SITE: Application Shell

## Intent

This project-local Next.js App Router package gives the course website a coherent route, navigation, responsive-state, and accessibility language while leaving identity, authorization, and domain content to their owning packages.
Its course routes and header language are deliberately specific to this website rather than a reusable public package.

## External Behavior

### SITE-1

When a user follows a route in the route map, the application shell shall show one consistent header and main-content region, preserve the route in the browser history, and render the page content assigned to that route without renaming its domain terms.

The route map is:

| Route | Audience and content |
| --- | --- |
| `/` | redirect to `/courses` |
| `/login` | visitor GitHub sign-in; authenticated users redirect to their requested destination or `/courses` |
| `/auth/callback` | authentication completion followed by a safe redirect |
| `/courses` | public catalog of current published courses |
| `/courses/[slug]` | public syllabus from the course's current published release |
| `/courses/[slug]/lessons/[lessonId]` | public lesson information with GitHub sign-in required to play its video |
| `/admin/courses` | course-author draft list and publication status |
| `/admin/courses/new` | course-author draft creation |
| `/admin/courses/[draftId]` | syllabus editor and video attachment for course authors |

### SITE-2

Where a visitor requests a known protected route in the route map or activates protected video playback from a public lesson, the application shell shall show `/login` and remember the originally requested safe internal path.
When authentication succeeds, it shall return to that path; when a requested destination is absolute, protocol-relative, cross-origin, malformed, or not in the route map, it shall discard it and use `/courses`.

### SITE-3

Where no member is authenticated, the global header shall provide `Courses` and `Continue with GitHub`.
Where a member is authenticated, it shall instead provide `Courses`, the member's GitHub identity, and `Sign out`.
Where that member is an administrator, it shall also provide `Admin`; where the member is not an administrator, it shall not show that entry.

### SITE-4

While any page or content area is loading, empty, unavailable, or has a retryable failure, the application shell shall retain the header and route context, label the state in plain language, and provide the available retry or next action instead of a blank page or raw provider error.

### SITE-5

Where the website is used at widths from 360 CSS pixels upward or at 200 percent zoom, the integrated responsive/accessibility presentation shall keep every page's primary content and actions usable without horizontal page scrolling.
When it renders navigation, dialogs, forms, reorder controls, upload controls, content choosers, or video controls, the integrated responsive/accessibility presentation shall preserve their semantic labels and state and make every control keyboard reachable, visibly focused, programmatically labeled, and announced with its state changes.

### SITE-6

When an unknown route is requested in any session state, or the behavior responsible for a requested course or lesson reports it unavailable, the application shell shall return HTTP status 404, show one uniform `Page unavailable` state with a link to `/courses`, and shall not reveal whether a hidden draft, release, lesson, or asset exists.
A current public lesson shall remain available when its visitor lacks playback permission; the video area shall offer GitHub sign-in rather than turn the page into an unavailable response.

### SITE-7

When a requested destination is supplied or returned after authentication, the destination boundary shall accept only a normalized route-map-relative path matching a known route or route pattern in [SITE-1](#site-1).
It shall reject an absolute, protocol-relative, cross-origin, malformed, or unknown-route value and shall provide `/courses` when no destination is accepted; it shall never use a client-supplied scheme or host as a redirect target.

## Internal Behavior

### SITE-8

When an administrator route, protected Route Handler, protected video action, or Server Action is evaluated, the request boundary shall obtain fresh trusted authentication, the active account's access context, and authorization for that exact request before producing protected data or mutation results, so private video data, mutation results, and administrator controls are absent when access is denied.
Rendering or prefetching a public catalog, course, or lesson shall not request playback authorization or private video data.

### SITE-9

When a package view is rendered, the view boundary shall provide the browser only the fields required by that visible state and shall not serialize service credentials, raw authorization records, unpublished fields, content references, asset identities or revisions, video-provider metadata, or private object locations into general page data.

### SITE-10

When responsible behavior reports a course or lesson route unavailable, a login-required playback state, or an unavailable or retryable video state, the state boundary shall map it respectively to [SITE-6](#site-6), the GitHub sign-in action in [SITE-2](#site-2), or a state under [SITE-4](#site-4) confined to the video area while retaining the public lesson page.
It shall expose no provider-specific message and shall keep diagnostic detail available only to the operator surface.

### SITE-11

When an authentication callback or authenticated response is produced, the response-cache boundary shall mark user-specific and cookie-changing responses private and non-shared and shall prevent static, ISR, or CDN reuse across requests.
It shall also resolve every public catalog, course, and lesson response against the current release for that request and prevent static, ISR, or CDN reuse, so a replaced or unpublished release cannot remain visible through a shared response.
When a request begins on a warm application instance, the request boundary shall create user-specific session and provider state for only that request and shall not reuse it for another user.

## Verification

### SITE-12

Where fixtures represent visitor, member, and administrator states and every owned page can report unavailable, when every route plus playback activation and same-origin, cross-origin, protocol-relative, malformed, and unknown destinations are visited, the shell contract suite shall assert the [route map, consistent page frame, preserved history, and unchanged domain terms](#site-1); the [visitor, member, and administrator header variants](#site-3); and the [uniform redacted 404 while a public lesson remains available when only playback is denied](#site-6).
It shall also assert that protected entry produces the [GitHub login flow with the safe internal destination preserved](#site-2), and that destination handling [accepts only normalized known route-map paths and otherwise returns `/courses` without using a client-supplied host](#site-7).

### SITE-13

Where each page-state fixture is rendered at 360 pixels and at 200 percent zoom, when keyboard-only navigation and automated accessibility checks exercise every control and state transition, the suite shall assert the [retained header and route context, plain-language state, and available retry or next action](#site-4); the [usable no-horizontal-scroll layout, keyboard reachability, visible focus, semantic labels, and state announcements](#site-5); and the [correct confined mapping of unavailable, login-required, and retryable states without provider detail](#site-10).

### SITE-14

Where public and protected view fixtures contain administrator, draft, content-reference, asset, signing, and service-only fields and visitor, member, and administrator requests alternate on one warm instance, when public pages are primed before release replacement and unpublication and denied and allowed server-rendered responses, callbacks, action responses, cache metadata, and browser state are inspected, the contract suite shall assert [fresh trusted authorization before protected output, no protected output on denial, and no playback lookup during public render or prefetch](#site-8); [serialization of only the fields required by the visible state, with every service-only or unpublished field absent](#site-9); and [private session-varying responses, current-release public responses, no stale shared response, and no per-request state transfer on a warm instance](#site-11).

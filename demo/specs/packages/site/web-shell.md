<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# SHELL: Web Shell

## Intent

This spec covers the frame every page shares: the header and its
entries, error and loading surfaces, and responsive behavior.
The header's navigation entries, session control, and admin
entry are open slots the deployment binds to its own surfaces,
so the shell knows no product noun.

## External Behavior

### Frame

#### SHELL-1

Every page shall carry the shared header — the site name linking
to the home page, the deployment's navigation entries, and the
deployment's session control — and a footer naming the site.

#### SHELL-2

While an admin-role session is active
([ROLE-7](../identity/access-control.md#role-7)), and only then,
the header shall include the deployment's admin entry — a member
session or no session sees no admin entry.

#### SHELL-3

When a request targets no known page, the site shall respond with
the shared not-found page — a plain explanation and a link
home — with HTTP status 404.

### Fit and Feedback

#### SHELL-4

Where the viewport is 360 px wide or wider, every page shall be
readable and operable without horizontal scrolling, with the
header collapsing into a compact menu on small viewports.

#### SHELL-5

While a page's data is loading, the page shall show a loading
state in place of the pending content rather than a blank page.

#### SHELL-12

When a request fails unexpectedly, the site shall show a plain
error surface with a retry path — exposing no stack trace or
internal identifier.

## Internal Behavior

### Server-Resolved Chrome

#### SHELL-6

Where a page's chrome varies by session or role — the session
control and the admin entry — the variance shall be resolved
server-side before first paint, so no page flashes another role's
chrome and no served markup carries entries the requester's role
denies.

### Response Freshness

#### SHELL-10

Where a response varies by session or role, it shall be served
private to its requester, never from a cache shared across
requesters.

#### SHELL-13

Where a page's content varies by underlying state, each response
shall reflect the state current at request time — no shared
cache serving a copy made stale by a later change.

## Verification

### Frame Coverage

#### SHELL-7

Where fixture sessions exist for an admin, a member, and a
signed-out visitor, and fixture surfaces are bound to the
header's slots, the test suite shall assert: every fixture page
carries the header with the home link, the bound navigation
entries, the bound session control, and the footer
([SHELL-1](#shell-1)); the admin entry appears for the admin
session and for no other ([SHELL-2](#shell-2)); and an unknown
URL returns the not-found page with HTTP status 404
([SHELL-3](#shell-3)).

### Fit and Feedback Coverage

#### SHELL-8

Where fixture pages exercise the fit and feedback states, the
test suite shall assert each: at a 360 px viewport, no
horizontal overflow and an operable compact menu
([SHELL-4](#shell-4)); with page data throttled, a loading state
preceding content ([SHELL-5](#shell-5)); and with a request
forced to fail, an error surface offering a retry and a response
carrying no stack trace or internal identifier
([SHELL-12](#shell-12)).

### Chrome Isolation Coverage

#### SHELL-9

Where member and signed-out fixture sessions request every
fixture page, the test suite shall assert the served markup
contains no admin entry, and that the session control's served
state matches the session without a client-side correction pass
([SHELL-6](#shell-6)).

### Freshness Coverage

#### SHELL-11

Where fixture pages exercise response reuse, the test suite
shall assert each case:

| Fixture | Asserted outcome |
| --- | --- |
| a page whose underlying state changes between two requests | the second response reflects the new state ([SHELL-13](#shell-13)) |
| two sessions of different roles requesting the same page in turn | each response is produced for its requester's session, not reused from the other's ([SHELL-10](#shell-10)) |

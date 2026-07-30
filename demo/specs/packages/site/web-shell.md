<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# web-shell: Web Shell

## Intent

This spec covers the frame every page shares: the header and its entries, error and loading surfaces, and responsive behavior.
The header's navigation entries, session control, and admin entry come from the deployment's own surfaces, so the shell knows no product noun.

## External Behavior

### Frame

#### web-shell-1

Every page shall carry the shared header — the site name linking to the home page, the deployment's navigation entries, and the deployment's session control — and a footer naming the site.

#### web-shell-2

While an admin-role session is active [[access-control-7](../identity/access-control.md#access-control-7)], and only then, the header shall include the deployment's admin entry — a member session or no session sees no admin entry.

#### web-shell-3

When a request targets no known page, the site shall respond with the shared not-found page — a plain explanation and a link home — with HTTP status 404.

### Fit and Feedback

#### web-shell-4

Where the viewport is 360 px wide or wider, every page shall be readable and operable without horizontal scrolling, with the header collapsing into a compact menu on small viewports.

#### web-shell-5

While a page's data is loading, the page shall show a loading state in place of the pending content rather than a blank page.

#### web-shell-12

When a request fails unexpectedly, the site shall show a plain error surface with a retry path — exposing no stack trace or internal identifier.

## Internal Behavior

### Server-Resolved Chrome

#### web-shell-6

Where a page's chrome varies by session or role — the session control and the admin entry — the variance shall be resolved server-side before first paint, so no page flashes another role's chrome and no served markup carries entries the requester's role denies.

### Response Freshness

#### web-shell-10

Where a response varies by session or role, it shall be served private to its requester, never from a cache shared across requesters.

#### web-shell-13

Where a page's content varies by underlying state, each response shall reflect the state current at request time — no shared cache serving a copy made stale by a later change.

## Verification

### Frame Coverage

#### web-shell-7

Where fixture sessions exist for an admin, a member, and a signed-out visitor, and fixture surfaces supply the deployment's header entries, the test suite shall assert each:

- every fixture page carries the header with the home link, the fixture navigation entries, the fixture session control, and the footer [[web-shell-1](#web-shell-1)];
- the admin entry appears for the admin session and for no other [[web-shell-2](#web-shell-2)];
- an unknown URL returns the not-found page with HTTP status 404 [[web-shell-3](#web-shell-3)].

### Fit and Feedback Coverage

#### web-shell-8

Where fixture pages exercise the fit and feedback states, the test suite shall assert each:

- at a 360 px viewport, no horizontal overflow and an operable compact menu [[web-shell-4](#web-shell-4)];
- with page data throttled, a loading state preceding content [[web-shell-5](#web-shell-5)];
- with a request forced to fail, an error surface offering a retry and a response carrying no stack trace or internal identifier [[web-shell-12](#web-shell-12)].

### Chrome Isolation Coverage

#### web-shell-9

Where member and signed-out fixture sessions request every fixture page, the test suite shall assert the served markup contains no admin entry, and that the session control's served state matches the session without a client-side correction pass [[web-shell-6](#web-shell-6)].

### Freshness Coverage

#### web-shell-11

Where fixture pages exercise response reuse, the test suite shall assert each case:

| Fixture | Asserted outcome |
| --- | --- |
| a page whose underlying state changes between two requests | the second response reflects the new state [[web-shell-13](#web-shell-13)] |
| two sessions of different roles requesting the same page in turn | each response is produced for its requester's session, not reused from the other's [[web-shell-10](#web-shell-10)] |

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# AUTH: GitHub Login

## Intent

This spec covers authentication: GitHub OAuth sign-in as the only
method, session lifecycle, and the account menu, per
[DR-000](../../decisions/000-product-scope.md).
The package knows who the user is and nothing else — it has no
notion of roles, courses, or media — so it can back any site that
wants GitHub-only sign-in.
Roles build on the identity records it maintains
([ROLE](access-control.md)); the identity-provider binding is a
deployment decision
([DR-002](../../decisions/002-platform-and-devops.md)).

## External Behavior

### Sign-In

#### AUTH-1

When a signed-out visitor opens the sign-in page, the page shall
offer exactly one authentication method — a "Continue with
GitHub" action — and shall present no password, email, or other
provider input.

#### AUTH-2

When the visitor activates "Continue with GitHub", the site shall
send them to GitHub's authorization page for the site's OAuth
app; when GitHub redirects back with an authorization grant, the
site shall establish a signed-in session and return the visitor
to the page sign-in started from, or to the home page when no
origin is recorded.

#### AUTH-3

When GitHub reports a denial or an error instead of a grant, the
site shall show the sign-in page with a human-readable notice
that sign-in did not complete, and shall establish no session.

### Session and Sign-Out

#### AUTH-4

While a session is active, the account menu shall show the
session's GitHub username and avatar; while no session is active,
the account menu shall offer a sign-in action leading to the
sign-in page.

#### AUTH-5

When the user activates sign-out in the account menu, the site
shall end the session, and the next request shall be treated as
signed out, with no action required on GitHub's side.

#### AUTH-6

While a session's age exceeds the configured session lifetime,
the site shall treat requests as signed out: signed-in-only
surfaces prompt for sign-in again, and public surfaces keep
working unchanged.

## Internal Behavior

### Identity Records

#### AUTH-7

When a GitHub account completes sign-in for the first time, the
identity store shall create exactly one user record carrying the
account's stable GitHub ID, username, and avatar URL.
When the same account signs in again, the identity store shall
update the username and avatar on that record and shall not
create another record.

### Session Mechanics

#### AUTH-8

Where session state reaches the browser, it shall travel only in
HTTP-only cookies scoped to the site's origin, so no page script
can read a session token.

#### AUTH-9

Where a server-side handler decides whether a request is signed
in, the decision shall come from verifying the request's session
credential — never from client-supplied claims such as form
fields, query parameters, or page state.

#### AUTH-10

The authentication configuration shall enable exactly one
provider, GitHub OAuth; no other provider or password endpoint
shall be enabled, so no request path can establish a session by
another method.

## Verification

### Sign-In Coverage

#### AUTH-11
Verifies: [AUTH-1](#auth-1), [AUTH-2](#auth-2), [AUTH-4](#auth-4)

Where a stub OAuth provider stands in for GitHub and honors the
authorization-redirect contract, when the test suite drives
sign-in from the sign-in page, the suite shall assert that the
page offers exactly one method, that the browser is sent to the
stub's authorization URL, and that after the stub grants, the
account menu shows the stub account's username and avatar on the
page sign-in started from.

#### AUTH-12
Verifies: [AUTH-3](#auth-3), [AUTH-10](#auth-10)

Where the stub provider returns a denial, the test suite shall
assert that the sign-in page shows the not-completed notice and
that no session cookie is set; where requests target
authentication endpoints of any non-GitHub method, the suite
shall assert they are refused and no session results.

### Session Coverage

#### AUTH-13
Verifies: [AUTH-5](#auth-5), [AUTH-6](#auth-6), [AUTH-8](#auth-8), [AUTH-9](#auth-9)

While a stub-account session is active, the test suite shall
assert: after sign-out, a signed-in-only fixture surface treats
the requester as signed out; after the session is aged past the
configured lifetime under test control, the same surface prompts
for sign-in while a public fixture surface still serves; every
session cookie is marked HTTP-only and page script reading
cookies obtains no session token; and a request presenting a
forged or absent session credential is treated as signed out.

#### AUTH-14
Verifies: [AUTH-7](#auth-7)

When the same stub account signs in twice with a changed username
and avatar between the sign-ins, the test suite shall assert
exactly one user record exists for the account's stable ID,
carrying the latest username and avatar.

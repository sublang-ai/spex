<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# AUTH: GitHub Login

## Intent

This spec covers authentication: GitHub OAuth sign-in, session
lifecycle, and the account menu.
The package knows who the user is and nothing else — it has no
notion of roles, of other sign-in methods, or of what the site
shows — so it can back any site that offers GitHub sign-in;
whether GitHub is the only method is the installation's policy.

## External Behavior

### Sign-In

#### AUTH-1

When a signed-out visitor opens the sign-in page, the page shall
offer a "Continue with GitHub" action.

#### AUTH-2

When the visitor activates "Continue with GitHub", the site shall
send them to GitHub's authorization page for the site's OAuth
app; when GitHub redirects back with an authorization grant, the
site shall establish a signed-in session and return the visitor
to the page sign-in started from — a same-site path only — or
to the home page when no origin is recorded or the recorded
origin is not same-site.
A callback shall complete sign-in only when it matches a live
sign-in attempt begun in the same browser and not yet consumed;
an unsolicited, mismatched, expired, or replayed callback shall
establish no session and shall show the not-completed notice
([AUTH-3](#auth-3)).

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

### Identity Records

#### AUTH-7

When a GitHub account completes sign-in for the first time, the
identity store shall create exactly one user record carrying the
account's stable GitHub ID, username, and avatar URL.
When the same account signs in again, the identity store shall
update the username and avatar on that record and shall not
create another record.

### Credential Verification

#### AUTH-9

Where a server-side handler decides whether a request is signed
in, the decision shall come from verifying the request's session
credential — never from client-supplied claims such as form
fields, query parameters, or page state.

## Internal Behavior

### Session Mechanics

#### AUTH-8

Where session state reaches the browser, it shall travel only in
cookies scoped to the site's origin, marked Secure, and marked
SameSite (Lax or stricter), and page script shall obtain no
credential beyond the identity provider's own session tokens and
their bounded lifetimes.

## Verification

### Sign-In Coverage

#### AUTH-10

Where a stub OAuth provider stands in for GitHub and honors the
authorization-redirect contract, when the test suite drives
sign-in from the sign-in page, the suite shall assert that the
page offers the GitHub action ([AUTH-1](#auth-1)), that the
browser is sent to the stub's authorization URL and returns
signed in ([AUTH-2](#auth-2)), and that after the stub grants,
the account menu shows the stub account's username and avatar
on the page sign-in started from ([AUTH-4](#auth-4)); when
the recorded origin is not same-site, the return lands on the
home page instead; and an unsolicited callback, one bound to
another browser's attempt, an expired one, and a replay of a
consumed one each establish no session and show the
not-completed notice ([AUTH-2](#auth-2)).

#### AUTH-11

Where the stub provider returns a denial, the test suite shall
assert that the sign-in page shows the not-completed notice and
that no session cookie is set ([AUTH-3](#auth-3)).

### Session Coverage

#### AUTH-12

While a stub-account session is active, the test suite shall
assert: after sign-out, a signed-in-only fixture surface treats
the requester as signed out ([AUTH-5](#auth-5)); after the
session is aged past the configured lifetime under test control,
the same surface prompts for sign-in while a public fixture
surface still serves ([AUTH-6](#auth-6)); every session cookie
is scoped to the site's origin, marked Secure, and marked
SameSite Lax or stricter, with page script obtaining no
credential beyond the provider's session tokens
([AUTH-8](#auth-8)); and a request presenting a forged or
absent session credential is treated as signed out
([AUTH-9](#auth-9)).

#### AUTH-13

When the same stub account signs in twice with a changed username
and avatar between the sign-ins, the test suite shall assert
exactly one user record exists for the account's stable ID,
carrying the latest username and avatar ([AUTH-7](#auth-7)).

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# github-login: GitHub Login

## Intent

This spec covers authentication: GitHub OAuth sign-in, session lifecycle, and the account menu.
The package knows who the user is and nothing else — it has no notion of roles, of other sign-in methods, or of what the site shows — so it can back any site that offers GitHub sign-in; whether GitHub is the only method is the installation's policy.

## External Behavior

### Sign-In

#### github-login-1

When a signed-out visitor opens the sign-in page, the page shall offer a "Continue with GitHub" action.

#### github-login-2

When the visitor activates "Continue with GitHub", the site shall run the OAuth exchange:

1. send the visitor to GitHub's authorization page for the site's OAuth app;
2. on GitHub's redirect back with an authorization grant, establish a signed-in session;
3. return the visitor to the page sign-in started from — a same-site path only — or to the home page when no origin is recorded or the recorded origin is not same-site.

#### github-login-14

A callback shall complete sign-in only when it matches a live sign-in attempt begun in the same browser and not yet consumed.

- An unsolicited, mismatched, expired, or replayed callback establishes no session and shows the not-completed notice [[github-login-3](#github-login-3)].

#### github-login-3

When GitHub reports a denial or an error instead of a grant, the site shall show the sign-in page with a human-readable notice that sign-in did not complete, and shall establish no session.

### Session and Sign-Out

#### github-login-4

The account menu shall present the session state:

- while a session is active, the session's GitHub username and avatar;
- while no session is active, a sign-in action leading to the sign-in page.

#### github-login-5

When the user activates sign-out in the account menu, the site shall end the session and treat the next request as signed out, with no action required on GitHub's side.

#### github-login-6

While a session's age exceeds the configured session lifetime, the site shall treat requests as signed out: signed-in-only surfaces prompt for sign-in again, and public surfaces keep working unchanged.

### Identity Records

#### github-login-7

When a GitHub account completes sign-in for the first time, the identity store shall create exactly one user record carrying the account's stable GitHub ID, username, and avatar URL.

#### github-login-15

When a GitHub account with an existing user record [[github-login-7](#github-login-7)] signs in again, the identity store shall update the username and avatar on that record and shall not create another record.

### Credential Verification

#### github-login-9

Where a server-side handler decides whether a request is signed in, the decision shall come from verifying the request's session credential — never from client-supplied claims such as form fields, query parameters, or page state.

## Internal Behavior

### Session Mechanics

#### github-login-8

Where session state reaches the browser, it shall travel only in cookies scoped to the site's origin, marked Secure, and marked SameSite (Lax or stricter).

- Page script obtains no credential beyond the identity provider's own session tokens and their bounded lifetimes.

## Verification

### Sign-In Coverage

#### github-login-10

Where a stub OAuth provider stands in for GitHub and honors the authorization-redirect contract, when the test suite drives sign-in from the sign-in page, the suite shall assert:

- the page offers the GitHub action [[github-login-1](#github-login-1)];
- the browser is sent to the stub's authorization URL and returns signed in [[github-login-2](#github-login-2)];
- after the stub grants, the account menu shows the stub account's username and avatar on the page sign-in started from [[github-login-4](#github-login-4)];
- when the recorded origin is not same-site, the return lands on the home page instead [[github-login-2](#github-login-2)];
- an unsolicited callback, one bound to another browser's attempt, an expired one, and a replay of a consumed one each establish no session and show the not-completed notice [[github-login-14](#github-login-14)].

#### github-login-11

Where the stub provider returns a denial, the test suite shall assert that the sign-in page shows the not-completed notice and that no session cookie is set [[github-login-3](#github-login-3)].

### Session Coverage

#### github-login-12

While a stub-account session is active, the test suite shall assert:

- after sign-out, a signed-in-only fixture surface treats the requester as signed out [[github-login-5](#github-login-5)];
- after the session is aged past the configured lifetime under test control, the same surface prompts for sign-in while a public fixture surface still serves [[github-login-6](#github-login-6)];
- every session cookie is scoped to the site's origin, marked Secure, and marked SameSite Lax or stricter, with page script obtaining no credential beyond the provider's session tokens [[github-login-8](#github-login-8)];
- a request presenting a forged or absent session credential is treated as signed out [[github-login-9](#github-login-9)].

#### github-login-13

When the same stub account signs in twice with a changed username and avatar between the sign-ins, the test suite shall assert exactly one user record exists for the account's stable ID, carrying the latest username and avatar [[github-login-7](#github-login-7)] [[github-login-15](#github-login-15)].

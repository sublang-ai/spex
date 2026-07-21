<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GHID: GitHub Identity

## Intent

This package lets people establish and end an application account and session using a GitHub identity.
It owns the GitHub identity path and may be used alone or alongside other identity packages.
It can be reused unchanged by applications accepting this identity and session contract.
It does not decide application roles, authorization, or route policy.
A host may supply an already normalized, route-policy-approved safe destination for post-authentication navigation; validating that destination remains the host's responsibility.

## User Behavior

### GHID-1

Where a visitor has no active GitHub application session, the GitHub sign-in surface shall offer an action labeled `Continue with GitHub`.

### GHID-2

While a GitHub sign-in attempt is active, when the user cancels it, GitHub or the configured identity authority returns an error, or the returned identity cannot be verified and reconciled, the sign-in surface shall create no application session, explain without identity or provider detail that GitHub sign-in did not complete, and offer the same GitHub action again without losing the requested safe destination.

### GHID-3

When GitHub sign-in succeeds, the session surface shall show the member's current GitHub avatar and login, mark the session authenticated, and make the requested safe destination available for navigation.

### GHID-4

While a member has an active GitHub application session, when the member activates `Sign out`, the session surface shall end the application session, replace the member controls with the GitHub sign-in action, and require GitHub sign-in again before showing a protected surface.

### GHID-5

While a member uses a protected surface, when the application session expires or becomes invalid, the session surface shall ask the member to sign in with GitHub again and preserve only the requested safe destination for the retry.

## Collaborator Behavior

### GHID-10

When the configured identity authority verifies a GitHub identity, the account registry shall associate the authority's stable user identifier transactionally with exactly one GitHub subject that is a canonical positive decimal string with no leading zero.
It shall preserve that subject as a string, enforce uniqueness of both the authority user identifier and the GitHub subject, and reject a missing, duplicate, conflicting, noncanonical, or user-metadata-only identity without account or session mutation.
When that subject later signs in with a changed login or profile, the account registry shall update the profile attributes and return the same application account identifier.

### GHID-11

When a protected request asks whether its caller is signed in through this package, the session authority shall use the online validation accepted under [GHID-18](#ghid-18), require the exact application-session record to remain active, and resolve the registered GitHub identity before reporting the caller authenticated.
The reported application account, GitHub identity, authority session, and application session shall agree.
The session authority shall ignore account identifiers, GitHub subjects, roles, user metadata, entitlement values, or authentication claims supplied as ordinary client input.

### GHID-14

When session validation fails for any reason, the session authority shall report the caller anonymous and shall expose no application account, GitHub identity, or identity that another package could use to access application data.

## Internal Behavior

### GHID-12

When a fresh authentication callback is handled, the provider gate shall accept only a GitHub OAuth result accepted under [GHID-18](#ghid-18) whose application redirect is allow-listed, whose verified authority user has exactly one canonical GitHub subject eligible for the account association, and whose authority session identifier has never been revoked.
When a request presents an existing authority session, the provider gate shall treat it as authenticated through this package only when that exact authority session already has an active application-session record.
It shall reject a non-GitHub result routed to this package, an invalid callback or redirect, a generic authenticated claim not tied to a registered GitHub identity, or a revoked or reassigned session and shall create no application session from a rejected result.

### GHID-13

When account profile data is persisted, the account registry shall retain only the application account identifier, GitHub subject, login, display name, and avatar URL needed by this package's sign-in and session behavior.
It shall neither retain nor expose a GitHub access token; post-login access to GitHub APIs is outside this identity package.

### GHID-15

When an authenticated member signs out, the application-session registry shall revoke the exact current application session before the session surface clears browser state and asks the configured identity authority to end the corresponding authority session.
It shall deny every later authenticated request for that revoked application session even if the underlying authority credential has not yet expired.

### GHID-16

When a fresh accepted GitHub callback completes account association, the application-session registry shall create one active record for that new authority session identifier and application account.
It shall never create an active record from an ordinary protected request, reactivate a revoked authority session identifier, or associate one authority session identifier with another application account.

### GHID-17

When the host supplies a post-authentication destination, the destination intake shall accept only a normalized safe destination that the host has already validated, preserve it across one authentication attempt, and return it unchanged after success.
When no accepted destination exists, it shall request the host's default destination and shall never infer safety from a browser-supplied scheme, host, or protocol-relative value.

### GHID-18

When identity-authority behavior is supplied, the authority intake shall accept only a GitHub OAuth authority that can return a verified authority-user identifier, canonical GitHub subject, profile, and fresh authority-session identifier for an allow-listed callback; validate the current authority user and session online for each protected request; and end the exact authority session on sign-out.
It shall reject a provider that derives the GitHub subject only from mutable user metadata, cannot distinguish invalid or revoked sessions, accepts an unlisted callback or redirect, or cannot terminate the requested authority session.

## Verification

### GHID-20
Verifies: [GHID-1](#ghid-1), [GHID-2](#ghid-2), [GHID-3](#ghid-3), [GHID-4](#ghid-4), [GHID-5](#ghid-5)

Where the package is exercised against a deterministic fake GitHub OAuth authority, when success, cancellation, provider error, rejected identity reconciliation, sign-out, expiry, and a non-GitHub result routed to this package are run, the contract suite shall assert the `Continue with GitHub` action, the visible redacted state and session outcome for each case, and establishment of an application session only from a valid GitHub result.

### GHID-21
Verifies: [GHID-10](#ghid-10), [GHID-13](#ghid-13)

Where identity fixtures include one subject with changed profile attributes, leading-zero and nondecimal subjects, a value larger than JavaScript's safe integer, duplicate authority-user bindings, duplicate GitHub-subject bindings, and forged user metadata, when callbacks are handled, the contract suite shall assert one stable string-preserving identity only for valid fixtures, the latest profile attributes, atomic rejection of every collision or noncanonical subject, and no retained or exposed GitHub access token.

### GHID-22
Verifies: [GHID-11](#ghid-11), [GHID-12](#ghid-12), [GHID-14](#ghid-14), [GHID-15](#ghid-15), [GHID-16](#ghid-16), [GHID-17](#ghid-17), [GHID-18](#ghid-18)

Where callbacks and protected requests carry forged account claims, a non-GitHub identity result, a generic authenticated claim, an unlisted redirect, an invalid authorization response, an unknown authority session identifier, an inactive application session, a signed-out but unexpired authority credential, an attempted revoked-session reactivation, and accepted, absent, and browser-forged destinations, when the provider gate, session authority, and destination intake evaluate them, the contract suite shall assert an anonymous outcome with no application or data-access identity and no account or session mutation for every invalid case, one new application-session record only from the fresh accepted callback, one authenticated outcome whose application account, GitHub identity, authority session, and application session agree only for that active session, exact return of an accepted safe destination, and host-default return for every other destination.

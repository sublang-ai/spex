<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GHID: GitHub Identity

## Intent

This package lets people establish and end an application account and session using a GitHub identity.
It owns the GitHub identity path and may be used alone or alongside other identity packages.
It can be reused unchanged by applications accepting this identity and session contract.
It does not decide application roles, authorization, or route policy.
A host may supply an already normalized, route-policy-approved safe destination for post-authentication navigation; validating that destination remains the host's responsibility.

## External Behavior

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

### GHID-6

When the configured identity authority verifies a GitHub identity, the account registry shall associate the authority's stable user identifier transactionally with exactly one GitHub subject that is a canonical positive decimal string with no leading zero.
It shall preserve that subject as a string, enforce uniqueness of both the authority user identifier and the GitHub subject, and reject a missing, duplicate, conflicting, noncanonical, or user-metadata-only identity without account or session mutation.
When that subject later signs in with a changed login or profile, the account registry shall update the profile attributes and return the same application account identifier.

### GHID-7

When a protected request asks whether its caller is signed in through this package, the session authority shall use the online validation accepted under [GHID-14](#ghid-14), require the exact application-session record to remain active, and resolve the registered GitHub identity before reporting the caller authenticated.
The reported application account, GitHub identity, authority session, and application session shall agree.
The session authority shall ignore account identifiers, GitHub subjects, roles, user metadata, entitlement values, or authentication claims supplied as ordinary client input.

### GHID-8

When session validation fails for any reason, the session authority shall report the caller anonymous and shall expose no application account, GitHub identity, or identity that another package could use to access application data.

## Internal Behavior

### GHID-9

When a fresh authentication callback is handled, the provider gate shall accept only a GitHub OAuth result accepted under [GHID-14](#ghid-14) whose application redirect is allow-listed, whose verified authority user has exactly one canonical GitHub subject eligible for the account association, and whose authority session identifier has never been revoked.
When a request presents an existing authority session, the provider gate shall treat it as authenticated through this package only when that exact authority session already has an active application-session record.
It shall reject a non-GitHub result routed to this package, an invalid callback or redirect, a generic authenticated claim not tied to a registered GitHub identity, or a revoked or reassigned session and shall create no application session from a rejected result.

### GHID-10

When account profile data is persisted, the account registry shall retain only the application account identifier, GitHub subject, login, display name, and avatar URL needed by this package's sign-in and session behavior.
It shall neither retain nor expose a GitHub access token; post-login access to GitHub APIs is outside this identity package.

### GHID-11

When an authenticated member signs out, the application-session registry shall revoke the exact current application session before the session surface clears browser state and asks the configured identity authority to end the corresponding authority session.
It shall deny every later authenticated request for that revoked application session even if the underlying authority credential has not yet expired.

### GHID-12

When a fresh accepted GitHub callback completes account association, the application-session registry shall create one active record for that new authority session identifier and application account.
It shall never create an active record from an ordinary protected request, reactivate a revoked authority session identifier, or associate one authority session identifier with another application account.

### GHID-13

When the host supplies a post-authentication destination, the destination intake shall accept only a normalized safe destination that the host has already validated, preserve it across one authentication attempt, and return it unchanged after success.
When no accepted destination exists, it shall request the host's default destination and shall never infer safety from a browser-supplied scheme, host, or protocol-relative value.

### GHID-14

When identity-authority behavior is supplied, the authority intake shall accept only a GitHub OAuth authority that can return a verified authority-user identifier, canonical GitHub subject, profile, and fresh authority-session identifier for an allow-listed callback; validate the current authority user and session online for each protected request; and end the exact authority session on sign-out.
It shall reject a provider that derives the GitHub subject only from mutable user metadata, cannot distinguish invalid or revoked sessions, accepts an unlisted callback or redirect, or cannot terminate the requested authority session.

### GHID-15

When an application or identity-authority session credential is carried by the browser, the browser-credential boundary shall use only a `Secure`, host-only cookie with `SameSite=Lax` or stricter and `Path=/`.
It shall expose no application, identity-authority, service, or control-plane credential through rendered content, general page data, browser history, or diagnostics; a credential that the configured identity-authority client must read remains bounded by that authority's declared lifetime and gains no broader application meaning.

## Verification

### GHID-16

Where the package is exercised against a deterministic fake GitHub OAuth authority, when success, cancellation, provider error, rejected identity reconciliation, sign-out, expiry, and a non-GitHub result routed to this package are run, the contract suite shall assert the [`Continue with GitHub` action](#ghid-1); the [redacted retry state with no new session and the safe destination preserved](#ghid-2) for every unsuccessful attempt; the [current GitHub profile, authenticated state, and requested destination](#ghid-3) only after success; [complete sign-out](#ghid-4); and the [GitHub retry state with only the safe destination preserved](#ghid-5) after expiry.

### GHID-17

Where identity fixtures include one subject with changed profile attributes, leading-zero and nondecimal subjects, a value larger than JavaScript's safe integer, duplicate authority-user bindings, duplicate GitHub-subject bindings, and forged user metadata, when callbacks are handled, the contract suite shall assert the [transactional one-to-one association, canonical string-preserving subject, stable account, current profile, and rejection without mutation](#ghid-6) for every applicable fixture, and shall confirm that the [persisted profile contains only the allowed fields and no retained or exposed GitHub access token](#ghid-10).

### GHID-18

Where callback and protected-request fixtures carry forged account claims, a non-GitHub identity result, a generic authenticated claim, an unlisted redirect, an invalid authorization response, an unknown authority session identifier, an inactive application session, a signed-out but unexpired authority credential, an attempted revoked-session reactivation, and accepted, absent, and browser-forged destinations, and where credential-policy and establishment-response fixtures cover secure/insecure, host-only/domain, same-site, path, lifetime, and disclosure variants, when the provider gate, session authority, destination intake, and browser-credential boundary evaluate them, the contract suite shall assert:

- [acceptance only of a valid GitHub callback or an already-active application session, with no mutation after rejection](#ghid-9), backed by an authority that satisfies the [online validation, callback, identity, and termination contract](#ghid-14);
- [one new application-session record only from the fresh accepted callback and no revoked-session reactivation or account reassignment](#ghid-12), followed by [revocation of the exact application session on sign-out and denial despite an unexpired authority credential](#ghid-11);
- an authenticated outcome only when the [active application session, authority session, registered GitHub identity, and application account agree and client claims are ignored](#ghid-7), and otherwise the [anonymous outcome with no data-access identity](#ghid-8);
- [exact return of an accepted host-validated destination and the host default for every other destination](#ghid-13); and
- only the [secure host-only cookie policy, bounded credential lifetime, and complete exclusion of credentials from rendered content, general page data, history, and diagnostics](#ghid-15).

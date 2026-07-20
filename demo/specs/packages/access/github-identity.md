<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# GHID: GitHub Identity

## Intent

This package gives a website one GitHub-only account and session language [[1]].
It follows the provider and trust choices in [DR-001](../../decisions/001-web-platform.md) but owns the operative sign-in behavior here.


## External Behavior

### GHID-1

Where a visitor is not authenticated, the sign-in surface shall offer one action labeled `Continue with GitHub` and shall offer no password, email link, passkey, registration, account-recovery, or other identity-provider action.

### GHID-2

While a GitHub sign-in attempt is active, when the user cancels it, the provider returns an error, or the callback produces any failed `AuthenticationResult`, the sign-in surface shall create no application session, explain without identity or provider detail that GitHub sign-in did not complete, and offer the same GitHub action again without losing the requested page within the site.

### GHID-3

When GitHub sign-in succeeds, the session surface shall show the member's current GitHub avatar and login, mark the session authenticated, and make the requested page within the site available for navigation.

### GHID-4

While a member is authenticated, when the member activates `Sign out`, the session surface shall end the application session, replace the member controls with the GitHub sign-in action, and make no new protected request as the former member.

### GHID-5

While a member uses a protected surface, when the application session expires or becomes invalid, the session surface shall ask the member to sign in with GitHub again and preserve only the requested page within the site for the retry.

## Internal Behavior

### GHID-10

When a valid GitHub identity is accepted, the account registry shall bind the Auth user UUID transactionally to exactly one `github` identity whose `provider_id` is a canonical positive decimal string with no leading zero [[2]].
It shall preserve that subject as a string, enforce uniqueness of both the Auth user UUID and `(github, providerSubject)`, and reject a missing, duplicate, conflicting, noncanonical, or user-metadata-only identity without account or session mutation.
When that subject later signs in with a changed login or profile, the account registry shall update the profile attributes and return the same `accountId`.

### GHID-11

When a protected request asks for authentication truth, the session authority shall verify the Auth user against the online Auth authority, require the exact application-session record to remain active, and resolve the registered GitHub identity before producing one `AuthenticationResult` whose `Principal`, `DataAccessIdentity`, and authenticated `SessionState` name the same account and application session.
It shall ignore account IDs, provider subjects, roles, user metadata, entitlement values, or authentication claims supplied as ordinary client input.

### GHID-12

When a fresh authentication callback is handled, the provider gate shall accept only a valid GitHub PKCE/OAuth result whose application redirect is allow-listed, whose verified Auth user has exactly one canonical GitHub identity record eligible for the account binding, and whose Auth `sessionId` has never been revoked.
When an existing direct Auth session is handled, the provider gate shall treat it as authenticated only when that exact `sessionId` already has an active application-session record.
It shall reject every other provider, direct authentication method, callback origin, generic `authenticated` JWT, or revoked session and create no application session from a rejected result.

### GHID-13

When account profile data is persisted, the account registry shall retain only the identity fields named in `Principal` and shall not retain a GitHub provider access token, because no package in this system requires post-login GitHub API access.

### GHID-14

When session validation fails for any reason, the session authority shall provide an anonymous `AuthenticationResult`, anonymous `SessionState`, and no `Principal` or `DataAccessIdentity`.

### GHID-15

When an authenticated member signs out, the application-session registry shall revoke the exact current application session before the session surface clears browser state and requests Auth sign-out [[3]].
It shall deny every later principal request for that revoked session even if the underlying Auth access token has not yet expired.

### GHID-16

When a fresh accepted PKCE callback completes account binding, the application-session registry shall create one active record for that new Auth `sessionId` and account.
It shall never create an active record from an ordinary protected request, reactivate a revoked `sessionId`, or bind one `sessionId` to another account.

## Verification

### GHID-20
Verifies: [GHID-1](#ghid-1), [GHID-2](#ghid-2), [GHID-3](#ghid-3), [GHID-4](#ghid-4), [GHID-5](#ghid-5)

Where the package is exercised against a deterministic fake GitHub OAuth authority, when success, cancellation, provider error, rejected identity reconciliation, sign-out, expiry, and every disabled direct Auth method are run, the contract suite shall assert the visible redacted state and session outcome for each case and shall find no non-GitHub sign-in or registration path.

### GHID-21
Verifies: [GHID-10](#ghid-10), [GHID-13](#ghid-13)

Where identity fixtures include one subject with changed profile attributes, leading-zero and nondecimal subjects, a value larger than JavaScript's safe integer, duplicate Auth-user bindings, duplicate provider bindings, and forged user metadata, when callbacks are handled, the contract suite shall assert one stable string-preserving identity only for valid fixtures, the latest profile attributes, atomic rejection of every collision or noncanonical subject, and no persisted provider access token.

### GHID-22
Verifies: [GHID-11](#ghid-11), [GHID-12](#ghid-12), [GHID-14](#ghid-14), [GHID-15](#ghid-15), [GHID-16](#ghid-16)

Where callbacks and protected requests carry forged account claims, a non-GitHub provider, a generic authenticated JWT, an unlisted redirect, an invalid code, an unknown session ID, an inactive application session, a signed-out but unexpired token, an attempted revoked-session reactivation, and a fresh then active GitHub session in turn, when the provider gate and session authority evaluate them, the contract suite shall assert an anonymous `AuthenticationResult` with no data identity and no account/session mutation for every invalid case, one new application-session record only from the fresh accepted callback, and one internally consistent `Principal`, `DataAccessIdentity`, and authenticated `SessionState` only for that active session.

## References

[1]: https://supabase.com/docs/guides/auth/social-login/auth-github "Supabase: Login with GitHub"
[2]: https://supabase.com/docs/guides/auth/identities "Supabase: User identities"
[3]: https://supabase.com/docs/guides/auth/signout "Supabase: Sign out"

## Binding

### GHID-0

| Field | Contract |
| --- | --- |
| Human users | visitors and signed-in members |
| Owns | sign-in surface, session surface, `IdentityView`, account identity and registry, application-session registry, session authority, provider gate, sign-out, `AuthenticationResult`, `Principal`, `DataAccessIdentity`, `SessionState`, authentication failures |
| Receives | a server-validated Supabase Auth user and session; that user's provider identity records; a GitHub OAuth result from the configured authority; an optional normalized `RequestedDestination` from the host |
| Provides | `IdentityView`; trusted `AuthenticationResult`; trusted `Principal`; trusted server-only `DataAccessIdentity`; authenticated or anonymous `SessionState` |
| Excludes | roles, authorization, route policy, course access, GitHub API features after login |
| Reuse | public-package candidate for sites that accept only GitHub through Supabase Auth; host routing is a variation point |

The provided contracts are:

| Contract | Meaning |
| --- | --- |
| `Principal` | `{ accountId, provider: github, providerSubject, login, displayName, avatarUrl }`, where `accountId` is the Auth user UUID and `providerSubject` is the canonical immutable GitHub subject string |
| `DataAccessIdentity` | server-only `{ accountId, authorityUserId, applicationSessionId }` proven active for the current request; downstream packages treat the authority and session identifiers as opaque |
| `SessionState` | either anonymous, or authenticated with the account ID and opaque application-session ID; it contains no role or capability |
| `AuthenticationResult` | authenticated with the matching `Principal`, `DataAccessIdentity`, and `SessionState`, or anonymous/failed with only anonymous `SessionState` and a redacted retry class |
| `IdentityView` | the sign-in, signed-in identity, sign-out, expired-session, or redacted authentication-failure state visible to the host shell |

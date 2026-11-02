<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-201: Shared Codex Subscription Access

## Status

Accepted (2026-11-02) on the owner's direction to share the administrator's Claude and Codex subscriptions across a team server.
Amends [DR-132](132-team-servers.md) in Codex's shared subscription form and in its access-only credential materialization; its account, history and refresh isolation remain.
Amends [DR-154](154-the-seed-follows-playbooks-rule.md) only in the seed-only presence projection for a materialized Codex snapshot.

## Context

Codex's `CODEX_ACCESS_TOKEN` accepts an automation access token, not the OAuth access token returned by an ordinary ChatGPT subscription login.
A real server verification rejected that substitution despite successful browser login.
Sharing a managed `auth.json` would let concurrent users rotate the same refresh credential.
Codex's external-token mode instead accepts an access-only native credential without managing its refresh.

## Decision

- `CODEX_ACCESS_TOKEN` remains the automation-token form; a ChatGPT subscription uses `CODEX_AUTH_CONTENT`, one-line JSON holding `auth_mode: "chatgptAuthTokens"`, nonblank `tokens.id_token`, `tokens.access_token`, `tokens.account_id`, and `last_refresh`, with no nonempty refresh token.
- The administrator keeps the managed login and its refresh credential private, publishing only the access-only snapshot and replacing it before its access expires.
  Spex neither refreshes that snapshot nor supplies a refresh token to a member.
- A seat materializes a valid snapshot as owner-only `auth.json` in its own persistent Codex home under the seat's local storage, selects it through `CODEX_HOME`, and refreshes that copy before readiness and each run.
  Native history and other state stay private to that seat; the member's normal Codex home is untouched.
- Starter selection treats a successfully materialized snapshot as a Codex sign-in through a seed-only credential-presence projection for the existing launcher seed; the projection contains no usable token and never enters an agent run.
- The member's own credential still displaces every shared form for Codex.
  Moving away from the snapshot removes its generated credential, preserving other native state and restoring the prior `CODEX_HOME`.
- A malformed or unmaterializable snapshot is reported without its contents, blocks Codex's run, and leaves other agents usable.
  A running agent retains the access it loaded; an expired snapshot requires replacement and a new run, not a shared refresh operation.
- No standalone client release is needed to configure this server.

## Consequences

- Sharing subscription access does not share a writable credential file, a refresh credential, project files or histories between accounts.
- `settings`, `core-service` and `storage` specify the new form, its one materialization exception and its privacy guarantees.
- Server operations must maintain the published access snapshot; successful sign-in or a status command alone is insufficient acceptance evidence, which includes real inference from ordinary accounts.

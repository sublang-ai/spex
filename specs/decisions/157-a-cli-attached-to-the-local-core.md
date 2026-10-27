<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-157: A CLI Attached to the Local Core

## Status

Accepted (2026-10-27) after independent root contract review.
Amends [DR-010](010-interface-craft.md) §5 for attached CLI observation: stopping observation does not cancel an environment operation, and an explicit terminal wait reports the request's own outcome.
Extends the client boundary of [DR-033](033-remote-gui-serving.md) without changing its transport or storage ownership.

## Context

The published CLI scaffolds and lints specs, while package and sign-in operations belong to the running core.
A second storage/auth stack would duplicate home leases, project selection and instance policy.
The existing protocol accepts package mutations immediately and reports aggregate environment state, which cannot identify one invocation's completion amid concurrent operations.
Sign-in similarly reports shared state without a per-attempt terminal result.

## Decision

- The CLI attaches explicitly to an already-running local server using its existing access URL and commands; it starts no core and writes no Spex storage itself.
- Protocol 28 gains the optional hello marker `attachedCliVersion: 1`; the new CLI requires both compatible protocol and marker before sending commands, while ordinary UI commands keep their current behavior.
- Environment mutations gain an optional terminal wait whose ordinary correlated reply carries that request's success or failure; aggregate state remains display state.
- Sign-in gains opt-in completion addressed to its initiating connection/request and cancellation that can name that connection's start request; existing UI cancellation remains available.
- Disconnect never replays a mutation; stopping a package wait leaves the operation running and reports uncertainty rather than cancellation or rollback.
- Publishing is an explicit mutation command, with a separate optional dry run and actual server-resolved destination in preview/receipt; no prompt, approval token or preview-to-upload binding is introduced.
- The first slice covers project selection, sign-in/status and package search/add/remove/status/install/resolve/publish; sessions, Sync controls, remote seats and automatic discovery stay outside it.

## Consequences

The CLI derives its two handshake constants at build time from the canonical protocol declarations; it copies no command schema and depends on no private app core.
A running server and its private access URL are prerequisites, separate from scaffold/lint.
A lost terminal reply can leave a completed mutation; readers inspect the result before manually retrying.

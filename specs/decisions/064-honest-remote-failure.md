<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-064: A Remote Failure Claims Only What the Host Said

## Status

Accepted (2026-09-14) on the owner's report of a private repository reported as absent.
Amends ([DR-046](046-decision-record-evolution.md)) [DR-057](057-space-surface.md) §"One shared branch, synced by the core": the app still stores no credential and still prompts for none, and it now says which identity a remote form presents, because refusing to hold a secret was never a reason to withhold what the failure meant.

## Context

A host that answers "not found" has not said the repository is absent.
GitHub returns that answer both for a repository that does not exist and for a private one the presented identity cannot see, so that no one can test private names by asking.
A filesystem remote is as ambiguous: an unreadable directory, an unreadable repository, a missing path and a directory that is no repository answer alike.

The app nevertheless reports "No repository at <URL>", tells the reader to check the URL or create the repository, and marks the stop unretryable [[space-15](../packages/space.md#space-15)].
Every part of that is an invention: it converts silence about a cause into a claim about the world, recommends the remedy for the less likely cause, and withdraws the control for the more likely one.
The stop is also inconsistent, withdrawing Retry while Sync and Check remain able to run the same transport again.

Reporting less than the host said is one failure; reporting more than the app may is another.
The message interpolates the remote as given, though the header has redacted an embedded user since [DR-057](057-space-surface.md), and the guard that refuses a credential in a URL recognizes only the form carrying a colon.
So a URL bearing a bare token is accepted, written to the repository's configuration, and printed into the interface and its live region — the outcome [DR-057](057-space-surface.md) forbade.

What the app can say without probing is which identity a remote form presents: a key for SSH, a credential helper for HTTPS, a path's permissions for a local remote.
That is the fact a reader lacks when a key that works elsewhere appears not to, and it is read from the URL the app already holds.

Asking the GitHub CLI instead would answer a different question.
It reports whether an account is signed in, which stays true when the signed-in account is the wrong one, when a token lacks a scope, and when an organization has not authorized it — every case that produces this failure — and it says nothing at all about an SSH remote.

## Decision

- A transport failure states what the host's answer supports and no more; where an answer cannot distinguish absence from denied access, the report names both and claims neither.
- A stop whose remedy lies outside the app is retryable, because no event tells the app that a key, an account, a permission or an invitation changed.
- A failure report names the identity mechanism the remote's own form presents, without probing, and names the GitHub CLI only where that form is one the CLI serves.
- The app consults no second tool to explain a transport failure: the transport it already ran is the only thing that answered the question asked.
- The app never prints a remote URL except with any embedded user removed, and refuses a URL embedding a credential in any form.
- A host-shaped answer that reaches no rule is classified, not shown as the tool's own words.

### Considered and declined

- asking the GitHub CLI who is signed in: true in every failing case, silent for SSH, and a second tool inside a transport path [DR-057](057-space-surface.md) scoped to Git;
- asking a forge API whether the repository exists: the identity that was refused gets the same answer, and it would build the existence oracle the host's ambiguity exists to prevent;
- naming the cause as denied access: the opposite invention, equally unsupported;
- renaming the stop's internal cause: no reader sees it, and the claim to the reader belongs in the message.

## Consequences

- `space.md`: the failure table's not-found row states both causes and becomes retryable, a failure report gains the identity line, and remote validation refuses every credential form.
- Failures that reached no rule and were shown as raw tool output are classified, so their reports change.
- No new command, no new state, and no new dependency: every fact reported is read from the URL and the answer already in hand.

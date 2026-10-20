<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-129: A Content Size Limit Is Not Permission

## Status

Accepted (2026-10-20) on an actual records push rejected for oversized blobs while the account could push.
Amends [DR-064](064-honest-remote-failure.md) and [DR-120](120-the-instance-is-the-space.md) only for an explicit content-size rejection: it is not an access refusal, and its public report carries the supported size cause and reported limit rather than raw transport words.

## Context

A receive hook can reject content without refusing the account's access.
Classifying every hook decline as permission turns a writable repository read-only and recommends Share for a limit that membership did not cause.
Relaying the hook's raw words also exposes names and links of the storage behind the instance.

## Decision

- Explicit content-size rejection wording is classified separately, before the generic hook-refusal rule; a hook decline alone does not establish a size limit.
- The stopped push keeps its local Save and the repository's existing access state, with Retry after the content problem is addressed and no automatic retry.
- The public message names only the instance, the size cause and the host's reported limit where it can be read unambiguously; raw transport text stays private.
- The guidance claims no membership or sign-in problem and prescribes no deletion, history rewrite or alternative transport.
- Permission refusals and hook declines without explicit size evidence keep their existing classification.

## Consequences

- `space` gains the distinct `size_limit` cause and a focused real-Core receive-hook case; neither the records format nor the transport changes.
- Earlier failed pushes and their saved content remain evidence; correcting their explanation does not make that content publishable.

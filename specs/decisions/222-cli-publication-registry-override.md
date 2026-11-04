<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-222: CLI Publication Registry Override

## Status

Accepted (2026-11-03) on the owner's direction.
Amends [DR-216](216-registry-and-space-accounts-stay-apart.md) for CLI publication destination selection.

## Context

A package author may need to publish to a different registry without changing where the project resolves its dependencies.
A legacy project's Space address must not implicitly select a publishing registry.

## Decision

- CLI publication and its preview select the invocation's `--registry <url>`, else the project's `registry`, else `https://spex.sublang.ai`.
- Publishing and authorization checks use the selected origin's registry account, and sign-in guidance gives that same origin.
- Export remains offline and points to the registry the printed publish commands will use.
- The override applies to one publication command and does not rewrite the project's configuration or change IDE publication.

## Consequences

Authors can review and upload to a chosen registry without changing dependency sources.
Existing explicit project registry choices remain the default when no override is passed.

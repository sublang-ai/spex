<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-137: Reopen the Removed Academy Example

## Status

Accepted (2026-10-22) for the owner's P0-0 Academy entry.
Amends [DR-015](015-reference-content.md) only when the example's former working folder remains after project removal.

## Context

- Removing a project forgets it in Spex but preserves its working folder and Git history.
- The Academy action then targets that same nonempty folder and refuses to seed, leaving the welcome page's example entry unusable.
- The preserved example may contain the reader's edits, so reseeding or deleting it would lose work.

## Decision

- When the Academy target is an unregistered Git work tree whose root history identifies Spex's Academy seed, the example action shall register and open that existing project without reseeding or overwriting its working files or Git history.
- A different nonempty target remains a refusal; an absent or empty target is seeded as before, and an already registered target is opened.

## Consequences

- Removing and reopening Academy no longer requires choosing its folder manually.
- The nonempty-directory guard still protects unrelated content.

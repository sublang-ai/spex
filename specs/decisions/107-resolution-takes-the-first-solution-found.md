<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-107: Resolution Takes the First Solution Found

## Status

Accepted (2026-10-08).
Amends [DR-104](104-spec-package-format-and-client-environments.md) in how Spex chooses among the solutions of a resolution: the first a depth-first search finds, not the highest by a global comparison.

## Context

- [DR-104](104-spec-package-format-and-client-environments.md) says Spex takes the highest solution, comparing the requested spec packages' versions first, then the rest, each in name order.
- The resolver is a depth-first search: it assigns the requested spec packages first, in name order, then the first in name order of the spec packages the assigned ones require and none assigns yet, trying each one's candidates from the highest version down, and keeps the first solution it finds.
- The two rules disagree when a nearer spec package's newest version constrains a farther one: with `root` requiring `z`, `z 1.1` requiring `a 1` and `z 1.0` requiring `a 2`, the search keeps `z 1.1` with `a 1`, while the global comparison prefers `a 2` with `z 1.0` because `a` sorts before `z`.
- A rule that prefers a farther spec package's version over a nearer one's by the accident of its name is not what anyone requesting `root` means; a rule that keeps the spec packages nearer the request at their newest is.
- Realizing the global comparison would take a search over every solution, for a worse answer.

## Decision

- Among solutions Spex takes the first a depth-first search finds, trying each spec package's candidates from the highest version down: the requested spec packages first, in name order, then, among the spec packages the assigned ones require and none assigns yet, the first in name order.
- A newer release that lacks a selected artifact still never blocks an older solution, and the rules on yanked and suppressed versions stand.
- The resolution is deterministic for a given version index and set of requests.

## Consequences

- A lock keeps the spec packages nearer the requests at their newest versions; a farther one may stand below its newest where a nearer one's newest requires it.
- The spec item stating the order [[environments-5](../packages/environments.md#environments-5)] states this search, and a test pins the three-package example.
- DR-104's clause on the highest solution is superseded in this scope and stands otherwise.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-181: Transparent Empty-Group Deletion

## Status

Accepted (2026-11-02) on the owner's request to keep the empty-group safeguard and explain every blocking content item.
Amends [DR-120](120-the-instance-is-the-space.md) and [DR-178](178-membership-with-a-clear-scope.md) in the deletion check, confirmation and outcome; the empty-group restriction remains.
Amended by [DR-186](186-unavailable-group-operations.md) in the explanation of a recognized unavailable deletion or restoration operation.

Amended by [DR-188](188-consistent-inline-group-actions.md) in the confirmation’s attached presentation and repeated activation without clearing or repeating its check.

## Context

A freshly created group with its Owner is empty.
A generic nonempty warning leaves the owner unable to identify what prevents deletion, and cached local rows may describe an older group at the same path.
The earlier service deletion route forces permanent deletion and cannot safely stand in for an ordinary deletion request.

## Decision

- Delete group opens a fresh check at the Space, identifying the group by its stable id; cached local rows never decide whether it is empty.
- Every blocking project, contained group, shared-records store or registered server is named in the confirmation, including content absent from the normal project listing; members do not count as contents.
- Deletion is requested only after fresh checks find no blocking contents; creating a group and adding its Owner creates no content.
- An empty result enables a simple confirmation naming the group and Space, with Cancel initially focused and no typed-path field.
- The request carries the public path just reviewed, and the Space rechecks that path and emptiness before deletion, refusing a rename or contents found by that check.
- A dedicated deletion-request operation follows the Space's policy without falling back to forced permanent deletion; a scheduled group remains visible across refreshes and offers Restore only where permitted.
- Refusals stay visible in place, no recovery deadline is invented, and neither deletion nor restoration is inferred from an ambiguous response.

## Consequences

- The owner can see why deletion is blocked without learning the system behind the Space.
- Deletion and restoration preserve the existing busy, duplicate-submission and keyboard-focus guarantees.
- Core, rendered-surface and browser journeys verify newly created empty groups, named contents, stale local data, concurrent changes, scheduled and completed outcomes, and restoration.

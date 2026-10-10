<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-111: An Overtaken Config Edit Is Refused

## Status

Accepted (2026-10-09).
Amends [DR-004](004-config-and-persistence.md) in one scope: how concurrent writes to a shared config resolve — sequential edits stay last-writer-wins, and an edit whose captured inputs changed while it was composed is refused `conflict`, the accepted writer kept; the rest of DR-004 stands, its no-merge rule included.

## Context

- DR-004 decided that concurrent write conflicts resolve last-writer-wins with a UI notice and no merge, accepting that a concurrent edit can be dropped on a single-user file.
- A config write is no longer one synchronous step: the core composes the candidate, loads the modules of the playbooks it enables to validate it fail-closed, validates a project's config against your own group's, and an enabling composes its config edits beside an environment it stages ([DR-104](104-spec-package-format-and-client-environments.md)).
- Configs live in spex repositories that sync ([DR-103](103-the-home-and-its-groups.md)), so another writer can land while an edit is composed: another Settings save, an enabling, a hand edit, or a sync's Apply.
- An edit composed from bytes read before those awaits and written after another accepted edit replaces that edit with a candidate validated against a file that no longer exists: the lost edit was accepted, not superseded by a later decision of the reader, and no notice reports it.

## Decision

- Sequential edits stay last-writer-wins: an edit composed from the current file replaces it, whoever wrote last, as DR-004 decided.
- An edit records the bytes of every config it was composed from — its own file and, for a project's config, your own group's — and its destination; at its write, with no asynchronous work between the check and the write, a changed input refuses it `conflict`, a destination that moved or left refuses it, and an operation holding a spex repository whose config it used refuses it `busy`.
- A refused edit writes nothing: the accepted writer's bytes stay, and the caller retries from the current file.
- No merge is attempted, as DR-004 decided.
- The rule holds at every surface that writes a shared config — a Settings save, a playbook config edit and an enabling's config edits — and the surface shows the refusal as it shows any refused save.

## Consequences

- No accepted edit is lost to an edit composed before it landed; the overtaken edit is reported and can be repeated.
- An edit racing another write or a sync may need a retry, which DR-004's last-writer-wins never asked for.
- DR-004's external-change notice stands: Settings still reflects a change made on disk and says when it conflicts with unsaved edits.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-037: Playbook 12's Host Contract

## Status

Accepted (2026-09-01).
Amends [DR-025](025-playbook-7-adoption.md), [DR-032](032-session-players.md), [DR-036](036-file-state-store.md).
Amended by [DR-045](045-unified-session-storage.md), [DR-080](080-the-config-directory-is-named-config.md), [DR-104](104-spec-package-format-and-client-environments.md), [DR-154](154-the-seed-follows-playbooks-rule.md).

## Context

- Playbook 12 changed what an embedding host must do ([DR-003](003-runtime-reuse.md)): registry manifests advertise an artifact schema; the shared config moves under the Spex root with a one-time relocation from the XDG location; both CLI presentations tee a token-free replay stream beside each session; a `dev` planning playbook joins the built-ins.
- Spex's file state ([DR-036](036-file-state-store.md)) reads the shared sessions directory with its own reader.
  The history on a working machine predates the replay stream: its captain-session records carry Boss journals and no stream, and the public session-store facade skips such records as pre-cutover — exactly the history worth listing.

## Decision

### Artifact schemas from the installed engine

- The artifact schemas a manifest may advertise are read from the installed package, never restated in Spex or its fixtures, so a release that moves the schema moves the check with it.

### Built-ins

- `dev` joins the built-in catalog beside code, review, and decide.

### Config relocation

- A config still at the former XDG location relocates once into the canonical path exactly as the launcher relocates it: only when the canonical path is absent, bytes and permission bits preserved, published with an exclusive link, the legacy file left in place; an explicit `--config` moves nothing.
  Whichever host launches first performs the move, and neither seeds a starter over a config the user already had.

### History without a stream

- A captain-session record beside no replay stream lists from its Boss journal: each Boss entry opens a turn with its prompt, each Captain reply follows it, and the record's own timestamps bound them.
- Listing keeps Spex's own tolerant reader rather than the session-store facade, which rejects pre-cutover records.

Considered and declined:

- writing captain-session records so the CLI could list Spex sessions: the full turn lifecycle of the CLI's host, out of proportion to the one-directional sharing the goal names.

## Consequences

- The core-service package carries the relocation item and lists journals for the foreign-session item.
- The playbook-library catalog includes `dev`.

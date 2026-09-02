<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-036: Playbook 12 Adoption Realization

## Status

Done

## Intent

Realize [DR-037](../decisions/037-playbook-12-adoption.md): move the floor to playbook ^12 / cligent ^0.24, supply schema-3 host capabilities from the shipped builder with Spex's in-memory effect ledger, seed from the installed template with `dev` in the catalog, relocate a legacy XDG config once, and list pre-stream captain-session records from their Boss journals — verified on this machine against the migrated real state.

## Deliverables

- [x] DR-037 accepted with the DR-034/DR-032/DR-036 amendments; core-service and playbook-library packages amended, lint-clean.
- [x] Core: floor bump, artifact schemas read from the installed package, host capabilities with pre-turn reconciliation, template by path, `dev` built-in, config relocation, journal listing.
- [x] Coverage: real-shell and acceptance suites over playbook 12, relocation, and journal listing; every workspace suite green.
- [x] Live check on this machine: the real state migrates (config relocated, SQLite imported, CLI history listed), a `playbook run` turn appears in the app, and the desktop renders it.

## Tasks

1. Spec plane: DR-037, the amendments, package edits, this record; `spex lint` clean.
2. Core: floor bump and the artifact-schema source, with fixtures following.
3. Core: host capabilities and pre-turn reconciliation in the session manager.
4. Core: template by path, `dev` built-in, legacy config relocation, journal listing, with coverage.
5. Full-suite verification and the live check on this machine.

## Verification

`spex lint` clean; every workspace suite green on playbook 12.0.0 / cligent 0.24.0 (core 167, ui 245, cli 133, server 10, desktop 9, scripts 18), the real-shell and acceptance suites among them.
Live check (2026-09-01, this machine): the server shell on the real root relocated the XDG config (bytes and mode identical, legacy left in place) and reported it valid; registering the playbook repository listed its two pre-stream CLI sessions from their Boss journals (an issue-resolution session of 4 turns and an intent-realization session of 2 turns); a real `playbook run` in a throwaway repository (reply "pong") arrived through the watcher and replayed its 20-line token-free stream; the desktop in acceptance mode then imported the legacy SQLite store (3 projects merged with the 2 registered live, 3 sessions with streams, the legacy file untouched), rendered with no console errors, and restored the Node ABI on exit.
The playbook CLI itself skips the schema-3 records as pre-cutover, which is why listing keeps Spex's own reader.

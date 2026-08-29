<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-035: File State Realization

## Status

Open

## Intent

Realize [DR-036](../decisions/036-file-state-store.md): retire the app-local SQLite stores for plain files — the shared state root with the registry, per-project intent act logs, and preferences files, plus per-session record streams in the shared playbook session store — with a one-time import, the root lease, and, once the playbook release ships its session-store exports and record tee, foreign-session surfacing and the `sessions` config key, per the amended core-service, app-shell, server-shell, and projects packages.

## Deliverables

- [ ] DR-036 accepted with the DR-004, DR-033, and DR-035 amendments applied; core-service, app-shell, server-shell, and projects packages amended, lint-clean.
- [ ] Core phase 1: state root with the root lease, registry/act-log/preferences/forge-cache file stores behind the unchanged protocol, session record-stream files with sidecars, folded replay, and the one-time SQLite import with the library relocation; better-sqlite3 confined to the import path.
- [ ] Shells: desktop state-root start with the legacy `userData` path handed for import; server `--data-dir` replacing `--db`; smoke redirect covering the root.
- [ ] Core phase 2 (on the playbook floor bump): shared session-store module for manifests, sessions-directory watch with foreign-session listing, and the `sessions` config key honored.
- [ ] Workspace suites green, including restart, import, root-contention, and foreign-session coverage.

## Tasks

1. Author the spec plane: DR-036, the DR-004/DR-033/DR-035 amendments, the package amendments, this record; `spex lint` clean.
2. Core: state root resolution and the root lease with the second-core refusal and its coverage.
3. Core: registry and preferences file stores swapped in behind the existing protocol commands.
4. Core: the intent act log with fold parity; ledger suites green unchanged.
5. Core: session record-stream files and sidecars replacing the session tables; turns, titles, and usage folded from the stream; restart coverage on the file store.
6. Core: the one-time SQLite import migration — rows, library relocation, `from`-path rewrite — with its coverage; better-sqlite3 confined to the import path.
7. Shells: desktop state-root start and legacy-path handoff; server `--data-dir`; smoke redirect update; packaged-app suites green.
8. Phase 2: adopt the playbook session-store exports and record tee, the sessions-directory watch with foreign-session coverage, and the `sessions` key; pin the playbook floor.
9. Full-suite verification and a live same-machine check: a `playbook run` session in a registered project's directory appearing in the app.

## Verification

Planned: `spex lint` clean; every workspace suite green including the new restart-on-files, import, root-contention, and foreign-session coverage; the live check of task 9 recorded here with the observed listing and record replay.

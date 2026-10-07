<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-096: The Home and Its Groups

## Status

Implemented 2026-10-06: every deliverable merged on main with the core, UI, desktop, server, script and hermetic browser suites green; the live lane and the install smoke await the owner (the smoke needs a global Git signing key on this machine, and the live lane a spex.pub test account).

## Intent

Implement [DR-103](../decisions/103-the-home-and-its-groups.md): every project's and group's records in a spex repository of its own under `workspace/`, sign-in to the Git host through spex.pub, per-repository sync, intents as a set of files, the Groups surface, and the one-time migration from the former home.

## Deliverables

- [x] The `storage`, `space`, `git-host`, `projects`, `core-service`, `dashboard`, `media`, `settings`, `app-shell`, `server-shell` and `run-view` specs updated under the decision, lint-clean.
- [x] The groups layout: `home.yaml`, clones under `workspace/`, one Playbook session store per clone, intents as files with per-intent assets, `local/prefs.json`, the lease at `.lease/`.
- [x] The migration from the former layout with its receipt, and the storage Git tool scoped per spex repository.
- [x] The Git host client: both sign-in flows, token keeping, reads, creation, branch preparation, members, the credential helper, sign-out; the stand-in host for tests and journeys.
- [x] Per-repository sync on the `spex` branch with the write gate beneath the clone, rename and transfer followed by id, read-only and unreachable states.
- [x] Configuration composed from your own group's file with the project's on top; a project's file naming players by name only.
- [x] Intents without ranks or links: the oldest queued is next; the Dashboard's Up next without reorder; Start from any row.
- [x] The Groups surface: sign-in, groups and repositories, pick a group, join, members, privacy notice, repairs, per-repository Sync and Explore.
- [x] Projects paired with spex repositories: add, create, remove deleting the clone.
- [x] Core, UI and browser-journey coverage for every new verification item; the live smoke against the stand-in.

## Tasks

1. Update the specs and the map; write this record.
2. Add the home file, the groups layout and the per-intent store in the core, with the migration and its receipt.
3. Split the session store and watchers per clone; bind sessions by their clone; adapt leases and diagnostics.
4. Remove ranks and links from the ledger, the protocol and the Dashboard; order queues by age.
5. Add the Git host client with both sign-in flows, the credential file, and the stand-in host.
6. Rebuild the sync machine per spex repository with the credential helper, states, rename and transfer, read-only and unreachable.
7. Compose configuration from two files; add the missing-player report and the Settings control.
8. Rebuild the Space surface as Groups; adapt the project palette and Overview; rename the sidebar entry.
9. Update the shells: the browser flow and open-URL bridge on the desktop, the device flow on the server, the helper runtime on both.
10. Port and extend the core, UI and e2e suites; run the smoke against the stand-in.

## Verification

- `npm run build`, `npm test` and `npm run e2e` pass across the workspace and the spec linter is clean (core 471, UI 918, desktop 23, server 14, scripts 45, journeys 87 with the one pre-existing skip) on 2026-10-06.
- A former-layout home of two projects migrates and syncs each spex repository with the stand-in; a second home joins a project and both exchange intents without a choice.
- The desktop and the server shell each complete their sign-in flow against the stand-in and push with the brokered credential.

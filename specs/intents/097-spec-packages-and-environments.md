<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-097: Spec Packages and Environments

## Status

Implemented 2026-10-06 with the gaps below: Playbook's launcher still requires `from`, so the CLI runs a Spex session only with a launcher config naming the module (DR-104's ask to Playbook); `playbook-library-87` skips until a compiled fixture is committed.

## Intent

Implement [DR-104](../decisions/104-spec-package-format-and-client-environments.md): the format 2 spec package read and checked by the core, environments per spex repository with requests and a lock, resolution and atomic installs through a content-addressed store, exports into agent folders and to the launcher, the built-in spec package the app ships, spec packages authored in a working folder and published, and the Playbooks surface as a view over environments.

## Deliverables

- [x] The `environments` package, the `playbook-library` rewrite, and the `storage`, `core-service`, `app-shell`, `server-shell` and `settings` amendments, lint-clean.
- [x] The format reader and checker, version requirements, `spex.yaml` and `spex.lock` encodings.
- [x] The resolver over the registry's version index, path and Git sources, with selection and export naming.
- [x] The store and cache, atomic installs, the stale-lock rule, the registry client and the Git source fetch.
- [x] Exports: skills into agent folders and the user's home, generated skills for playbooks, launch-time module locations, the agent folder table.
- [x] The built-in spec package staged at build in both shells and seeded at start; new environments requesting it.
- [x] Authoring sessions writing a spec package in the working folder, compiling in its playbook artifact, the Enable form requesting by path and enabling, publishing.
- [x] The Playbooks surface over environments with its controls and the stand-in registry for tests and journeys.
- [x] Core, UI and browser-journey coverage for every new verification item.

## Tasks

1. Write the `environments` package and rewrite `playbook-library`; write this record.
2. Add the format reader, the manifest checks, the version requirement matcher and the two environment file encodings.
3. Add the resolver, the selection and the lock writer against a stand-in registry.
4. Add the store, the installer, the registry client and the Git source.
5. Add exports with the agent folder table and the launch-time module location; retire `from` and the library folder.
6. Stage and seed the built-in spec package in both shells; request it in new environments and in the migration.
7. Move drafts to authoring sessions in a project writing a spec package; adapt the compile pipeline and the Enable path; add publishing.
8. Rebuild the Playbooks surface over environments; add the environment commands to the protocol.
9. Port and extend the core, UI and e2e suites.

## Verification

- `npm run build`, `npm test` and `npm run e2e` pass across the workspace and the spec linter is clean on 2026-10-06; a fresh home launches every built-in playbook offline from the seeded spec package, and an authored playbook compiles, enables, launches, publishes to the stand-in registry and installs on a second home in the journeys.
- A fresh home launches every built-in playbook offline from the seeded spec package; a playbook authored in a project compiles, enables, launches, publishes to the stand-in registry and installs on a second home.

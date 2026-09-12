<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# IR-078: The Space Surface

## Status

In progress (started 2026-09-12).

## Intent

A top-level Space surface manages Spex home: what is in it and what is private, initializing it as a Git repository, naming its remote, seeing local and incoming changes by storage unit, and syncing through one shared branch with whole-unit conflict choices, all performed by the core under its lease between turns; the sidebar's Workspace section is renamed Projects so the two spaces are never confused.

## Deliverables

- [x] A DR and a `space` spec package record the surface, its protocol, and the in-app single-branch sync.
- [x] The core exposes the space commands: status, local and incoming changes, initialize, remote, sync with per-unit choices, tree and file preview, each refusing by name while a turn is in flight.
- [x] The Space surface renders status, changes, the sync flow with its conflict picker, and the read-only explorer, fitting at the 320-pixel floor.
- [x] The desktop bridge reveals a path in the file manager; the served page shows the path instead.
- [x] "Workspace" reads "Projects" everywhere the user sees it, and the specs say so.

## Tasks

1. Record the DR, the package, the amendments, and this intent.
2. Core: space status, changes, and tree/file commands with integration coverage over a real home.
3. Core: initialize, remote, and sync with whole-unit choices and turn checks, covered against a bare local remote.
4. UI: the Space surface's status and changes, the explorer, and the nav entry with the Projects rename.
5. UI: the sync flow and conflict picker; the desktop reveal capability.
6. Browser journeys for the surface and the rename; fit coverage.

## Verification

- `npm test -w packages/core`, `npm test -w packages/ui`, `npm run e2e`, `spex lint`.
- Manual: a scratch home initialized from the surface, pushed to a bare remote, diverged from a second home, and merged with an explicit unit choice.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-040: Source-Only App Releases

## Status

Accepted (2026-09-02) on the owner's direction: release the app without binaries, letting users build locally, since no signing exists and per-platform builds would cost more than they return.
Amends [DR-002](002-desktop-app-architecture.md) (distribution: GitHub Releases still, without build artifacts for now) and [DR-033](033-remote-gui-serving.md) (the server shell ships in the same source release).

## Context

- The `app-v*` channel was specified to build an unsigned macOS arm64 zip with electron-builder and attach it to a GitHub release; no such tag has ever been pushed, and the workflow neither gates on CI nor writes release notes.
- An unsigned binary is a poor download: macOS quarantines it, every platform would need its own build and its own maintenance, and signing and notarization are not in hand.
- Both shells already run from source with two commands — `npm start` for the desktop, `npm run start:server` for the server — with the native module rebuilt and restored by the launcher; a source release is a real release for a user who has Node.
- The app has no changelog and no version bump since the desktop workspace was created; the CLI channel's rules (SemVer, Keep a Changelog, tag-version match, CI-green gate, notes from the changelog) are the ones to reuse.

## Decision

### The app releases as source

- An `app-v<version>` tag releases the app — the desktop and server shells over one core and interface — as a GitHub release carrying the changelog notes and the run-from-source instructions, attaching no build artifacts; the sources GitHub attaches to any release are the download.
- The version lives in `apps/desktop/package.json` and `apps/server/package.json`, bumped together; the workflow refuses a tag that matches neither.
- The app's changelog is the repository root `CHANGELOG.md`, in Keep a Changelog form, distinct from the CLI's under `packages/cli`.

### The gates stay

- The workflow confirms CI green for the tagged commit before creating the release, builds and tests the tree once more on the runner, extracts the version's notes, and fails on empty notes — the CLI channel's gate transplanted.
- The tag is prepared as before: the hermetic smoke with the desktop stage, the live desktop smoke, and the manual checklist — minus its packaging pass, which becomes a local option rather than a gate.

### Binaries later

- Packaging stays possible locally (`npm run package -w apps/desktop`) and its packaged-app coverage stays specified; publishing binaries returns when signing exists, as an amendment to this record.

## Consequences

- The first app release can happen now, and each later one costs a changelog entry, a version bump, and the gates.
- A user needs Node 20 or later, a checkout, and `npm ci`; the README's run-from-source block is the install guide, and the release notes point at it.
- The release workflow runs on Linux without an Electron download; the macOS runner and electron-builder leave the workflow.

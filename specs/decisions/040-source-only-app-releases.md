<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-040: Source-Only App Releases

## Status

Accepted (2026-09-02) on the owner's direction.
Amends [DR-002](002-desktop-app-architecture.md), [DR-033](033-remote-gui-serving.md).
Amended by [DR-079](079-the-core-speaks-the-homes-language.md), [DR-086](086-tests-in-tiers.md), [DR-087](087-beta-app-releases.md), [DR-184](184-native-desktop-tag-packages.md), [DR-199](199-release-gated-full-validation.md), [DR-220](220-tags-own-release-versions.md).

## Context

- The owner directed releasing the app without binaries at first, letting users build locally, since no signing existed and per-platform builds would have cost more than they returned.
- The `app-v*` channel was specified to build an unsigned macOS arm64 zip with electron-builder and attach it to a GitHub release; no such tag had ever been pushed, and the workflow neither gated on CI nor wrote release notes.
- Both shells already run from source with two commands — `npm start` for the desktop, `npm run start:server` for the server — with the native module rebuilt and restored by the launcher; a source release is a real release for a user who has Node.
- The app had no changelog; the CLI channel's rules (SemVer, Keep a Changelog, a validated tag, notes from the changelog) are the ones to reuse.

## Decision

### The app releases with its source

- An `app-v<version>` tag releases the app — the desktop and server shells over one core and interface, one version across both, taken from the tag ([DR-220](220-tags-own-release-versions.md)) — as a GitHub release carrying its notes and the run-from-source instructions, beside the sources GitHub attaches to any release; native downloads join it ([DR-184](184-native-desktop-tag-packages.md)).
- Amends [DR-002](002-desktop-app-architecture.md): the app is distributed through GitHub Releases.
- Amends [DR-033](033-remote-gui-serving.md): the server shell ships in the same release.
- The app's changelog is the repository root `CHANGELOG.md`, in Keep a Changelog form, distinct from the CLI's under `packages/cli`.

### The gates

- Publication waits on full app validation of the tagged tree ([DR-199](199-release-gated-full-validation.md)); the tiers a regular app tag runs are [DR-086](086-tests-in-tiers.md)'s, and a beta's are [DR-087](087-beta-app-releases.md)'s.

## Consequences

- Each app release costs only the gates.
- A user running from source needs Node 22 or later ([DR-079](079-the-core-speaks-the-homes-language.md)), a checkout, and `npm ci`; the README's run-from-source block is the install guide, and the release notes point at it.

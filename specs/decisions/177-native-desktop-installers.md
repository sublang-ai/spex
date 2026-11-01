<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-177: Native Desktop Installers

## Status

Accepted (2026-10-31) on the owner's request for installer downloads for Mac M-series and Windows x86 computers.
Amends [DR-176](176-native-desktop-tag-packages.md) for the macOS download format; platform architectures and publication gates remain.

## Context

The Mac ZIP requires extraction before the app can be installed.
The owner wants the usual desktop installation experience on both platforms.

## Decision

- macOS ships an arm64 DMG for M-series computers, opened to drag Spex.app into Applications.
- Windows keeps the x64 per-user NSIS EXE for 64-bit Intel/AMD computers; x86 denotes x86-64 in this scope.
- The tag workflow, download links and checksums name the DMG instead of a ZIP.
- Signing, notarization and the existing release gates remain unchanged.

## Consequences

Users install the app without a compiler toolchain or WSL.
This format change does not create a tag, publish a release or merge the branch.

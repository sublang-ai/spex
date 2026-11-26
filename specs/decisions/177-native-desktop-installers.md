<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-177: Native Desktop Installers

## Status

Accepted (2026-10-31).
Amends [DR-184](184-native-desktop-tag-packages.md).
Amended by [DR-219](219-developer-id-macos-downloads.md).

## Context

The owner asked for installer downloads for Mac M-series and Windows x86 computers.
The Mac ZIP requires extraction before the app can be installed.
The owner wants the usual desktop installation experience on both platforms.

## Decision

- Amends [DR-184](184-native-desktop-tag-packages.md) in the macOS download format; platform architectures and publication gates remain.
- macOS ships an arm64 DMG for M-series computers, opened to drag Spex.app into Applications.
- Windows keeps the x64 per-user NSIS EXE for 64-bit Intel/AMD computers; x86 denotes x86-64 in this scope.
- The tag workflow, download links and checksums name the DMG instead of a ZIP.
- The existing release gates remain unchanged; macOS signing and notarization are [DR-219](219-developer-id-macos-downloads.md)'s.

## Consequences

Users install the app without a compiler toolchain or WSL.
This format change does not create a tag, publish a release or merge the branch.

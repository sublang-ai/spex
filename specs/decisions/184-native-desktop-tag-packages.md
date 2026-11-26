<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-184: Native Desktop Packages from App Tags

## Status

Accepted (2026-10-31); revised (2026-11-26).
Amends [DR-040](040-source-only-app-releases.md).
Amended by [DR-219](219-developer-id-macos-downloads.md), [DR-220](220-tags-own-release-versions.md).

## Context

The owner asked that pushing an app tag build the macOS and Windows apps.
Native macOS and Windows installation builds have been exercised locally, but the app tag workflow still publishes source instructions alone.
Users need desktop downloads from the same tagged source instead of a local compiler toolchain.
The owner asked for installers giving the usual desktop installation experience on Mac M-series and Windows x86 computers; a ZIP needs extracting before the app can be installed.

## Decision

- Amends [DR-040](040-source-only-app-releases.md) in binary distribution; source instructions, channel versions and the existing release gates remain.
- An accepted `app-v<version>` tag builds, on their respective native runners, a macOS arm64 DMG for M-series computers, opened to drag Spex.app into Applications, and a Windows x64 per-user NSIS installer for 64-bit Intel/AMD computers; x86 denotes x86-64 in this scope.
- The tag workflow, download links and checksums name the DMG.
- Both builds must succeed before the workflow creates the GitHub release with both downloads and SHA-256 checksums.
- The existing release gates remain; the CLI channel is unchanged.
- Packaging never publishes independently of the final release job.
- Release tags consume checksum-locked Cligent and Playbook versions from the public npm registry; temporary file, vendor and Git snapshots are not release inputs.
- Downloads identify their version, platform and architecture, and release notes disclose the Windows download's unsigned status; the macOS download is signed and notarized ([DR-219](219-developer-id-macos-downloads.md)).
- Source instructions remain available, including native Windows subject to its private-storage admission.

## Consequences

Users install the app without a compiler toolchain or WSL.
One platform's packaging failure prevents a new release instead of publishing an incomplete pair of downloads.
Native dependencies are prepared on their target OS, and Windows CRT staging remains part of Windows packaging.
Creating this workflow does not itself create a tag or publish a release.

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-176: Native Desktop Packages from App Tags

## Status

Accepted (2026-10-31) on the owner's request to build macOS and Windows apps when an app tag is pushed.
Amends [DR-040](040-source-only-app-releases.md) for binary distribution; source instructions, channel versions and existing release gates remain.

## Context

Native macOS and Windows installation builds have been exercised locally, but the app tag workflow still publishes source instructions alone.
Users need desktop downloads from the same tagged source instead of a local compiler toolchain.
Signing credentials have not been configured.

## Decision

- An accepted `app-v<version>` tag builds a macOS Apple Silicon ZIP and a Windows x64 per-user NSIS installer on their respective native runners.
- Both builds must succeed before the workflow creates the GitHub release with both downloads and SHA-256 checksums.
- Existing CI-green, version-match, test, changelog and beta gates remain; the CLI channel is unchanged.
- Packaging never publishes independently of the final release job.
- Downloads identify their version, platform and architecture, and release notes disclose unsigned and non-notarized status without claiming configured signing.
- Source instructions remain available, including native Windows subject to its private-storage admission.

## Consequences

One platform's packaging failure prevents a new release instead of publishing an incomplete pair of downloads.
Native dependencies are prepared on their target OS, and Windows CRT staging remains part of Windows packaging.
Creating this workflow does not itself create a tag or publish a release.

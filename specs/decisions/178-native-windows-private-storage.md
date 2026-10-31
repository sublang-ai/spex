<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-178: Native Windows Private Storage

## Status

Accepted (2026-10-30).
Amends [DR-049](049-supported-app-hosts.md) for native Windows hosting and private-storage admission.

## Context

Node's Windows mode bits do not express the user boundary that private POSIX storage enforces.
Windows users need the desktop app without WSL or a separately operated server.

## Decision

- Native Windows hosts admit only local, verified private storage; a missing capability or unsafe existing entry refuses rather than skipping permission checks.
- Windows descriptor inspection and private creation use `@openclaw/fs-safe`; Spex keeps its admission policy in the existing storage implementation and adds no general filesystem abstraction.
- Windows private storage permits the current user, LocalSystem and built-in Administrators; unknown ownership, incomplete descriptors, null DACLs and grants to other principals refuse.
- Newly created private directories carry a protected inheritable DACL before application data is written.
- Private file publication, version conflict checks, machine-bound leases and retained execution evidence keep their existing contracts.
- POSIX storage retains its existing permission preparation and verification.
- Windows uses its inherited launch environment; POSIX desktop hosts retain login-shell capture.
- The Windows launch PATH includes the installed MinGit root `usr/bin` as well as its command directory; the packaged helper layout, not an assumed ucrt64 subdirectory, determines helper discovery.
- Native runtime components and Git required by the desktop are installation responsibilities, never an end-user compiler or WSL prerequisite.
- The desktop declares the same patched Playbook dependency as its embedded core so a compiler-private older runtime cannot replace the application engine during packaging.
- Windows reads legacy SQLite through the bundled Node SQLite API in read-only mode, keeping the source database unchanged and avoiding an Electron-ABI-specific SQLite addon.

## Consequences

The shared Playbook storage implementation must be upgraded with the host.
Until a coordinated registry release exists, the validation build pins a vendored patched archive with its source patch, upstream commit and checksums; it must never silently fall back to the unpatched registry bytes.
Windows acceptance must exercise real Windows storage and the packaged Electron runtime; changing `process.platform` does not establish native support.
File synchronization remains mandatory; Windows does not claim POSIX directory-fsync durability.

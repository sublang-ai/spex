<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-178: Native Windows Private Storage

## Status

Accepted (2026-10-30); revised (2026-11-26).
Amends [DR-002](002-desktop-app-architecture.md).
Amended by [DR-167](167-the-compiler-shares-the-apps-engine.md), [DR-223](223-windows-storage-checks-what-macos-checks.md).

## Context

Shared session storage requires private POSIX permissions: directories `0700`, files `0600` ([DR-045](045-unified-session-storage.md)).
Node's Windows mode bits do not express that user boundary [[1]].
Windows users need the desktop app without WSL or a separately operated server.

## Decision

- Amends [DR-002](002-desktop-app-architecture.md) in its supported host platforms.
- Desktop and server hosts support macOS and Linux on filesystems that enforce these permissions, and native Windows on storage its own admission verifies.
- A host whose storage cannot be verified private refuses startup before creating or migrating config or storage.
- Native Windows hosts admit private storage only where it can be verified; a missing capability refuses rather than skipping the checks [DR-223](223-windows-storage-checks-what-macos-checks.md) keeps.
- Windows descriptor inspection and private creation use `@openclaw/fs-safe`; Spex keeps its admission policy in the existing storage implementation and adds no general filesystem abstraction.
- Windows private storage belongs to the current user, LocalSystem or built-in Administrators; unknown ownership, incomplete descriptors, null DACLs and another principal's right to change the entry refuse, while read grants are admitted ([DR-223](223-windows-storage-checks-what-macos-checks.md)).
- Newly created private directories carry a protected inheritable DACL before application data is written.
- Private file publication, version conflict checks, machine-bound leases and retained execution evidence keep their existing contracts.
- POSIX storage retains its existing permission preparation and verification.
- Windows uses its inherited launch environment; POSIX desktop hosts retain login-shell capture.
- The Windows launch PATH includes the installed MinGit root `usr/bin` as well as its command directory; the packaged helper layout, not an assumed ucrt64 subdirectory, determines helper discovery.
- Native runtime components and Git required by the desktop are installation responsibilities, never an end-user compiler or WSL prerequisite.
- The desktop declares the same published Playbook dependency as its embedded core ([DR-167](167-the-compiler-shares-the-apps-engine.md)) so a compiler-private older runtime cannot replace the application engine during packaging.
- Windows reads legacy SQLite through the bundled Node SQLite API in read-only mode, keeping the source database unchanged and avoiding an Electron-ABI-specific SQLite addon.

## Consequences

The shared Playbook storage implementation must be upgraded with the host.
Windows acceptance must exercise real Windows storage and the packaged Electron runtime; changing `process.platform` does not establish native support.
File synchronization remains mandatory; Windows does not claim POSIX directory-fsync durability.
Portable history may still contain paths recorded on other platforms.

## References

[1]: https://nodejs.org/api/fs.html#fschmodpath-mode-callback "Node.js filesystem permissions on Windows"

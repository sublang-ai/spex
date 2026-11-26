<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-049: Supported App Hosts

## Status

Accepted (2026-09-05).
Amends [DR-002](002-desktop-app-architecture.md).
Amended by [DR-178](178-native-windows-private-storage.md).

## Context

Shared session storage requires private POSIX permissions: directories `0700`, files `0600` ([DR-045](045-unified-session-storage.md)).
Node's Windows permission API cannot enforce that boundary [[1]].

## Decision

- Amends [DR-002](002-desktop-app-architecture.md) for supported host platforms.
- Desktop and server hosts support macOS and Linux on filesystems that enforce these permissions, and native Windows on storage its own admission verifies ([DR-178](178-native-windows-private-storage.md)).
- A host whose storage cannot be verified private refuses startup before creating or migrating config or storage.

## Consequences

Portable history may still contain paths recorded on other platforms.

## References

[1]: https://nodejs.org/api/fs.html#fschmodpath-mode-callback "Node.js filesystem permissions on Windows"

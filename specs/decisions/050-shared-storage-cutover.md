<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-050: Shared Storage Cutover

## Status

Accepted (2026-09-05).
Amends [DR-045](045-unified-session-storage.md).

## Context

- Shared recovery runs through Playbook's shared session store, which the former CLI store predates.
- The former CLI store lies outside Spex home, and one malformed session or intent log must not disable unrelated work.

## Decision

- Ordinary default-home startup migrates the former XDG CLI session store once, with old writers stopped. Explicit home or session locations suppress discovery; a different config file alone does not.
- Preserve original manifest/replay bytes in destination migration receipts, validate the new bundle, then remove its old active files. Before upgrading, snapshot both Spex home and the former CLI store.
- Invalid data blocks operations that depend on it. Preserve diagnostics and lease-checked deletion while allowing startup and unrelated valid projects.

## Consequences

- Both interfaces discover existing default-store history without a second configuration step; older writers must not reopen converted data.

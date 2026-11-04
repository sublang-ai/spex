<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-224: Playbook 18.1.4 Adoption

## Status

Accepted (2026-11-04) on the owner's direction, completing [DR-223](223-windows-storage-checks-what-macos-checks.md) for the storage Playbook keeps.
Amends [DR-217](217-cligent-0-38-0-adoption-and-models-on-re-check.md) in the Playbook floor and the built-in release alone.

## Context

- DR-223 admits another principal's read grant in Spex's own storage, but Playbook 18.1.3 refused any grant beyond the current user, LocalSystem and built-in Administrators on Windows in its session store, leases, repository claims and machine identity, so a home the Codex sandbox had granted itself read access to still refused to start.
- Playbook 18.1.4 refuses such a grant only where it may change the entry, its descriptor or its owner, the rule of DR-223, and no longer requires a local volume; it changes nothing else and keeps Cligent `^0.38.0` and the shared `@openclaw/fs-safe` 0.26.13 [[1]].

## Decision

- **Floors.** The core, both shells and root acceptance tooling require Playbook `^18.1.4`; Cligent `^0.38.0` and slc `^0.20.2` stay, with one shared Playbook, Cligent and xstate as before.
- **Built-ins.** Stage `sublang/playbooks` 18.1.4 from the installed Playbook release; its playbooks are 18.1.3's but for the code playbook's private-path check.

## Consequences

- A Windows home another tool has granted read access to starts, opens its sessions and restarts.
- Spex and Playbook apply one Windows rule to the storage they share.

## References

[1]: https://github.com/sublang-ai/playbook/blob/v18.1.4/CHANGELOG.md "Playbook 18.1.4 changelog"

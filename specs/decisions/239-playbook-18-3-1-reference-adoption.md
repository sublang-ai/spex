<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DR-239: Playbook 18.3.1 Reference Adoption

## Status

Accepted (2026-11-15).
Amends [DR-237](237-published-agent-runtime-floors.md) in the Playbook floor and bundled playbook version.

## Context

The CODE reference packaged in Playbook 18.3.0 contains a nested clause that the compiler's fixed grammar rejects.
Playbook 18.3.1 corrects that reference, and slc 0.21.0 requires the corrected release.

## Decision

All Playbook consumers require `^18.3.1`.
The bundled playbooks stage as `sublang/playbooks` 18.3.1.
The app and compiler continue sharing one installed Playbook engine.

## Consequences

Fresh installations exclude the malformed reference while retaining the model and delegation contracts adopted by DR-237.
